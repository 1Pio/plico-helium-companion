"""Real signed-copy exchanges, including process death at each publication boundary.
Fixture directories are retained in build/; the personal installation is read-only.
"""

import importlib.util, json, os, pathlib, shutil, sys, tempfile, unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("update", ROOT / "scripts/update.py")
update = importlib.util.module_from_spec(spec)
spec.loader.exec_module(update)
OLD = ROOT / "build/Plico Helium Companion.app"
NEW = ROOT / "build/Plico Helium Companion.app"


class UpdateTest(unittest.TestCase):
    def fixture(self):
        root = pathlib.Path(
            tempfile.mkdtemp(prefix="update-test-", dir=ROOT / "build")
        ).resolve()
        update.SUPPORT = root / "support"
        update.SUPPORT.mkdir()
        update.APP = root / OLD.name
        update.EXTENSION = update.SUPPORT / "extension"
        update.RECEIPT = update.SUPPORT / "installation.json"
        update.HOST = root / "host.json"
        stage = update.SUPPORT / "update-test"
        stage.mkdir()
        shutil.copytree(OLD, update.APP)
        shutil.copytree(NEW, stage / OLD.name)
        update.EXTENSION.mkdir()
        (update.EXTENSION / "release").write_text("old")
        (stage / "extension").mkdir()
        (stage / "extension/release").write_text("new")
        old = {
            "extension_id": "fixture",
            "app_sha256": update.installation.tree_hash(update.APP),
            "extension_sha256": update.installation.tree_hash(update.EXTENSION),
            "release": "old",
        }
        new = {
            "extension_id": "fixture",
            "app_sha256": update.installation.tree_hash(stage / OLD.name),
            "extension_sha256": update.installation.tree_hash(stage / "extension"),
            "release": "new",
        }
        update.RECEIPT.write_text(json.dumps(old))
        (stage / "installation.json").write_text(json.dumps(new))
        (stage / "journal.json").write_text(
            json.dumps({"state": "prepared", "old": old, "new": new})
        )
        update.HOST.write_text(
            json.dumps(
                {
                    "path": str(update.APP / "Contents/MacOS/plico-companion"),
                    "allowed_origins": ["chrome-extension://fixture/"],
                }
            )
        )
        return stage, old, new

    def invoke(self, action, stage):
        prior = sys.argv
        sys.argv = ["update.py", action, str(stage)]
        try:
            update.main()
        finally:
            sys.argv = prior

    def assert_release(self, receipt):
        update.verify(receipt, update.APP, update.EXTENSION)
        self.assertEqual(json.loads(update.RECEIPT.read_text()), receipt)

    def test_publish_and_rollback(self):
        stage, old, new = self.fixture()
        self.invoke("publish", stage)
        self.assert_release(new)
        self.invoke("rollback", stage)
        self.assert_release(old)

    def test_process_death_each_exchange(self):
        for boundary in (1, 2, 3):
            with self.subTest(boundary=boundary):
                stage, old, new = self.fixture()
                pid = os.fork()
                if pid == 0:
                    original = update.publication.exchange
                    count = 0

                    def interrupted(src, dst):
                        nonlocal count
                        original(src, dst)
                        count += 1
                        if count == boundary:
                            os._exit(73)

                    update.publication.exchange = interrupted
                    self.invoke("publish", stage)
                    os._exit(99)
                _, status = os.waitpid(pid, 0)
                self.assertEqual(os.waitstatus_to_exitcode(status), 73)
                self.invoke("recover", stage)
                self.assert_release(old)

    def test_failed_journal_write_preserves_recovery_metadata(self):
        stage, old, new = self.fixture()
        before = (stage / "journal.json").read_bytes()
        with patch.object(
            update.os, "replace", side_effect=OSError("fixture write failure")
        ):
            with self.assertRaises(OSError):
                update.save_journal(stage, {"state": "published"})
        self.assertEqual((stage / "journal.json").read_bytes(), before)

    def test_unknown_content_refused_before_mutation(self):
        stage, old, new = self.fixture()
        journal = json.loads((stage / "journal.json").read_text())
        journal["state"] = "swapping"
        (stage / "journal.json").write_text(json.dumps(journal))
        update.publication.exchange(stage / OLD.name, update.APP)
        (update.EXTENSION / "release").write_text("unexpected")
        before = update.installation.tree_hash(update.APP)
        with self.assertRaises(SystemExit):
            self.invoke("recover", stage)
        self.assertEqual(update.installation.tree_hash(update.APP), before)


if __name__ == "__main__":
    unittest.main()
