import importlib.util
import os
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ["UPDATE_SERVICE_TOKEN"] = "test-token-with-more-than-thirty-two-characters"
spec = importlib.util.spec_from_file_location("cvstudio_updater", Path(__file__).with_name("server.py"))
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)


class BackupTest(unittest.TestCase):
    def test_full_volume_backup_and_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            site = root / "site"
            data = root / "data"
            (data / "cv-files").mkdir(parents=True)
            site.mkdir()
            (site / ".env").write_text("TEST=secret\n", encoding="utf-8")
            (data / "cv.db").write_bytes(b"sqlite")
            (data / "cv-files" / "selected.pdf").write_bytes(b"%PDF-test")
            commands = []

            def fake_run(*args, **_kwargs):
                commands.append(args)
                if args[2:6] == ("ps", "--status", "running", "-q"):
                    return "app-id"
                return ""

            with patch.object(updater, "REPO", root), patch.object(updater, "SITE", site), \
                 patch.object(updater, "BACKUPS", root / "backups"), patch.object(updater, "DATA_DIR", data), \
                 patch.object(updater, "STATUS_FILE", data / "github-update.json"), patch.object(updater, "run", side_effect=fake_run):
                backup = updater.backup_volume("before", "target")

            self.assertEqual(commands[-1], ("docker", "compose", "start", "app"))
            self.assertIn(("docker", "compose", "stop", "app"), commands)
            self.assertEqual((backup / ".env").read_text(encoding="utf-8"), "TEST=secret\n")
            with tarfile.open(backup / "cv_data.tar.gz") as archive:
                names = archive.getnames()
                self.assertIn("./cv.db", names)
                self.assertIn("./cv-files/selected.pdf", names)


if __name__ == "__main__":
    unittest.main()
