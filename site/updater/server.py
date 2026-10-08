"""Local Docker Compose updater. Only the application can reach this service."""

import hmac
import json
import os
import shutil
import subprocess
import tarfile
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

REPO = Path("/repo")
SITE = REPO / "site"
DATA_DIR = Path("/app/data")
STATUS_FILE = DATA_DIR / "github-update.json"
BACKUPS = REPO / "backups"
TOKEN = os.environ.get("UPDATE_SERVICE_TOKEN", "")
EXPECTED_REMOTES = {os.environ.get("CVSTUDIO_GIT_REMOTE", "https://github.com/sn8k/CVStudio.git")}
LOCK = threading.Lock()

if len(TOKEN) < 32 or TOKEN.startswith("CHANGE_ME"):
    raise RuntimeError("UPDATE_SERVICE_TOKEN must be at least 32 characters")


def run(*args, timeout=600):
    result = subprocess.run(args, cwd=SITE, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout).strip()[-500:] or "Commande échouée")
    return result.stdout.strip()


def git(*args, timeout=30):
    return run("git", "-c", "safe.directory=/repo", "-C", str(REPO), *args, timeout=timeout)


def save(state, message):
    STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
    data = {"state": state, "message": message, "updatedAt": datetime.now(timezone.utc).isoformat()}
    temporary = STATUS_FILE.with_suffix(".tmp")
    temporary.write_text(json.dumps(data), encoding="utf-8")
    temporary.replace(STATUS_FILE)


def read_status():
    try:
        return json.loads(STATUS_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return {"state": "idle", "message": "Aucune mise à jour lancée.", "updatedAt": None}


def inspect_repo():
    remote = git("remote", "get-url", "origin")
    if remote not in EXPECTED_REMOTES:
        raise RuntimeError("Le dépôt GitHub d'origine ne correspond pas au dépôt attendu.")
    if git("branch", "--show-current") != "main":
        raise RuntimeError("La copie locale doit être sur la branche main.")
    local = git("rev-parse", "HEAD")
    remote_head = git("ls-remote", "origin", "refs/heads/main").split()[0]
    return local, remote_head


def backup_volume(local, remote):
    if not run("docker", "compose", "ps", "--status", "running", "-q", "app"):
        raise RuntimeError("Le service app doit être démarré avant la sauvegarde.")
    target = BACKUPS / f"predeploy-{datetime.now(timezone.utc):%Y%m%d-%H%M%S-%f}"
    target.mkdir(parents=True, exist_ok=False)
    target.chmod(0o700)
    shutil.copy2(SITE / ".env", target / ".env")
    (target / ".env").chmod(0o600)
    (target / "git-head-before.txt").write_text(local + "\n", encoding="utf-8")
    (target / "git-head-target.txt").write_text(remote + "\n", encoding="utf-8")
    save("running", "Sauvegarde cohérente de SQLite et des PDF…")
    try:
        run("docker", "compose", "stop", "app", timeout=90)
        archive = target / "cv_data.tar.gz"
        with tarfile.open(archive, "w:gz") as tar:
            tar.add(DATA_DIR, arcname=".")
        if archive.stat().st_size == 0:
            raise RuntimeError("La sauvegarde du volume est vide.")
        archive.chmod(0o600)
    finally:
        run("docker", "compose", "start", "app", timeout=90)
    return target


def perform_update():
    try:
        save("running", "Vérification de GitHub…")
        local, remote = inspect_repo()
        if git("status", "--porcelain", "--untracked-files=no"):
            raise RuntimeError("La copie du serveur contient des modifications locales. La mise à jour est arrêtée.")
        backup = backup_volume(local, remote)
        if local != remote:
            save("running", "Récupération du code depuis GitHub…")
            git("fetch", "origin", "main", timeout=120)
            base = git("merge-base", "HEAD", "origin/main")
            if base != local:
                raise RuntimeError("L'historique local a divergé de GitHub. Mise à jour manuelle nécessaire.")
            git("merge", "--ff-only", "origin/main")
        save("running", "Construction et redémarrage de CV Studio…")
        run("docker", "compose", "up", "-d", "--build", "migrate", "app", timeout=1800)
        save("success", f"CV Studio a été redémarré depuis GitHub. Sauvegarde : {backup.relative_to(REPO)}")
    except Exception as exc:
        save("error", str(exc)[:500])
    finally:
        LOCK.release()


class Handler(BaseHTTPRequestHandler):
    def respond(self, code, data):
        payload = json.dumps(data).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def authorized(self):
        supplied = self.headers.get("Authorization", "")
        if not hmac.compare_digest(supplied, f"Bearer {TOKEN}"):
            self.respond(403, {"message": "Accès refusé."})
            return False
        return True

    def do_GET(self):
        if not self.authorized():
            return
        if self.path != "/status":
            return self.respond(404, {"message": "Introuvable."})
        try:
            local, remote = inspect_repo()
            status = read_status()
            self.respond(200, {**status, "localCommit": local, "remoteCommit": remote})
        except Exception as exc:
            self.respond(503, {"message": str(exc)[:500]})

    def do_POST(self):
        if not self.authorized():
            return
        if self.path != "/update":
            return self.respond(404, {"message": "Introuvable."})
        if not LOCK.acquire(blocking=False):
            return self.respond(409, {"message": "Une mise à jour est déjà en cours."})
        threading.Thread(target=perform_update, daemon=True).start()
        self.respond(202, {"message": "Mise à jour lancée."})


def main():
    if read_status().get("state") == "running":
        save("error", "La mise à jour a été interrompue. Vérifiez l'état des conteneurs avant de réessayer.")
    ThreadingHTTPServer(("0.0.0.0", 8765), Handler).serve_forever()


if __name__ == "__main__":
    main()
