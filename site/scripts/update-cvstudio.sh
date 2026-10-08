#!/usr/bin/env bash
set -Eeuo pipefail

REPO="${CVSTUDIO_REPO:-/opt/cv}"
SITE="$REPO/site"
BACKUPS="$REPO/backups"
BRANCH=main
FORCE=0
FOREGROUND=0

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --foreground) FOREGROUND=1 ;;
    *) echo "Usage : $0 [--force] [--foreground]" >&2; exit 2 ;;
  esac
done

if [[ "$FOREGROUND" != 1 && "${CVSTUDIO_UPDATE_BACKGROUND:-0}" != 1 ]]; then
  mkdir -p /var/log/cvstudio
  log="/var/log/cvstudio/update-$(date +%Y%m%d-%H%M%S).log"
  nohup env CVSTUDIO_UPDATE_BACKGROUND=1 "$0" "$@" >"$log" 2>&1 </dev/null &
  echo "Mise à jour lancée (PID $!, journal : $log)."
  echo "Suivi : tail -f '$log'"
  exit 0
fi

if [[ "$EUID" != 0 ]]; then
  echo "Exécuter ce script avec sudo ou en root." >&2
  exit 1
fi

for command in git docker flock tar; do
  command -v "$command" >/dev/null || { echo "Commande manquante : $command" >&2; exit 1; }
done

[[ -d "$REPO/.git" && -f "$SITE/docker-compose.yml" && -f "$SITE/.env" ]] || {
  echo "Dépôt, configuration Compose ou site/.env introuvable sous $REPO." >&2
  exit 1
}

exec 9>/var/lock/cvstudio-update.lock
flock -n 9 || { echo "Une mise à jour CV Studio est déjà en cours." >&2; exit 1; }

APP_STOPPED=0
BACKUP_DIR=""
on_exit() {
  local rc=$?
  trap - EXIT
  if [[ "$APP_STOPPED" == 1 ]]; then
    docker compose -f "$SITE/docker-compose.yml" --project-directory "$SITE" start app || true
  fi
  if [[ "$rc" != 0 ]]; then
    echo "ÉCHEC (code $rc). Sauvegarde : ${BACKUP_DIR:-non créée}" >&2
  fi
  exit "$rc"
}
trap on_exit EXIT

cd "$REPO"
[[ "$(git branch --show-current)" == "$BRANCH" ]] || { echo "La branche du VPS doit être $BRANCH." >&2; exit 1; }
case "$(git remote get-url origin)" in
  "${CVSTUDIO_GIT_REMOTE:-https://github.com/sn8k/CVStudio.git}") ;;
  *) echo "L'origine Git n'est pas le dépôt GitHub CVSTUDIO_GIT_REMOTE attendu." >&2; exit 1 ;;
esac
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || { echo "Fichiers suivis modifiés sur le VPS ; mise à jour annulée." >&2; git status --short; exit 1; }

local_head="$(git rev-parse HEAD)"
git fetch origin "$BRANCH"
remote_head="$(git rev-parse "origin/$BRANCH")"
git merge-base --is-ancestor "$local_head" "$remote_head" || { echo "Historique Git divergent ; mise à jour manuelle nécessaire." >&2; exit 1; }

if [[ "$local_head" == "$remote_head" && "$FORCE" != 1 ]]; then
  echo "CV Studio est déjà à jour ($local_head). Utiliser --force pour reconstruire."
  exit 0
fi

cd "$SITE"
docker compose version >/dev/null
[[ -n "$(docker compose ps --status running -q app)" ]] || { echo "Le service app doit être démarré avant la sauvegarde." >&2; exit 1; }

BACKUP_DIR="$BACKUPS/predeploy-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
cp -a .env "$BACKUP_DIR/.env"
chmod 600 "$BACKUP_DIR/.env"
printf '%s\n' "$local_head" >"$BACKUP_DIR/git-head-before.txt"
printf '%s\n' "$remote_head" >"$BACKUP_DIR/git-head-target.txt"

echo "Sauvegarde cohérente du volume Docker (SQLite et PDF)…"
APP_STOPPED=1
docker compose stop app
docker compose run --rm --no-deps --user root -v "$BACKUP_DIR:/backup" migrate \
  sh -ec 'tar -C /app/data -czf /backup/cv_data.tar.gz .'
docker compose start app
APP_STOPPED=0
[[ -s "$BACKUP_DIR/cv_data.tar.gz" ]] || { echo "Archive du volume absente ou vide." >&2; exit 1; }
tar -tzf "$BACKUP_DIR/cv_data.tar.gz" >/dev/null
chmod 600 "$BACKUP_DIR/cv_data.tar.gz"
echo "Sauvegarde : $BACKUP_DIR"

cd "$REPO"
git pull --ff-only origin "$BRANCH"
[[ "$(git rev-parse HEAD)" == "$remote_head" ]] || { echo "Commit déployé différent de la cible." >&2; exit 1; }

cd "$SITE"
export COMPOSE_PARALLEL_LIMIT=1
docker compose build migrate app
docker compose run --rm --no-deps migrate
docker compose up -d --no-deps app

echo "Attente du healthcheck…"
healthy=0
for attempt in $(seq 1 30); do
  if docker compose exec -T app node -e 'fetch("http://127.0.0.1:3000/api/health").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))' >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 2
done
[[ "$healthy" == 1 ]] || { docker compose logs --no-color --tail=100 app; echo "Healthcheck en échec." >&2; exit 1; }

docker compose ps
echo "Déploiement terminé : $(git -C "$REPO" rev-parse --short HEAD)"
echo "Sauvegarde : $BACKUP_DIR"
