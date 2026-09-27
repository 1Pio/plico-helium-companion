"""Exercise first-install boundaries in disposable homes using a real signed app.

No personal installation, profile, Keychain or Accessibility setting is changed.
"""

import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "installation", ROOT / "scripts/install.py"
)
installation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installation)


class InstallTest(unittest.TestCase):
    def setUp(self):
        self.fixture = Path(
            tempfile.mkdtemp(prefix="install-test-", dir=ROOT / "build")
        ).resolve()
        home = self.fixture / "New user with spaces"
        home.mkdir()
        source = self.fixture / "Release source"
        source.mkdir()
        shutil.copytree(ROOT / "extension", source / "extension")
        shutil.copytree(
            ROOT / "build/Plico Helium Companion.app",
            source / "build/Plico Helium Companion.app",
        )
        installation.ROOT = source
        installation.HOME = home
        installation.SUPPORT = (
            home / "Library/Application Support/Plico Helium Companion"
        )
        installation.APP = home / "Applications/Plico Helium Companion.app"
        installation.EXTENSION = installation.SUPPORT / "extension"
        installation.BROWSER = home / "Library/Application Support/net.imput.helium"
        installation.HOST = (
            installation.BROWSER / "NativeMessagingHosts/cc.helwig.plico.companion.json"
        )
        installation.SOURCE = source / "build/Plico Helium Companion.app"
        installation.RECEIPT = installation.SUPPORT / "installation.json"
        profile = installation.BROWSER / "Profile 1"
        profile.mkdir(parents=True)
        (profile / "Preferences").write_text('{"fixture":"preserve"}')
        self.profile = profile
        installation.HOST.parent.mkdir()
        self.unrelated = installation.HOST.parent / "unrelated.json"
        self.unrelated.write_text("unrelated fixture")

    def test_install_status_uninstall_preserves_browser(self):
        installation.install(True)
        receipt = installation.installed()
        self.assertEqual(
            receipt["release"],
            json.loads((ROOT / "extension/manifest.json").read_text())["version"],
        )
        # Verification and uninstall do not require the source checkout to remain.
        installation.SOURCE = self.fixture / "Absent checkout"
        self.assertEqual(installation.installed(), receipt)
        installation.uninstall()
        self.assertFalse(installation.APP.exists())
        self.assertFalse(installation.HOST.exists())
        self.assertEqual(self.unrelated.read_text(), "unrelated fixture")
        self.assertEqual(
            (self.profile / "Preferences").read_text(), '{"fixture":"preserve"}'
        )
        self.assertEqual(
            len(list((installation.HOME / ".Trash").glob("Plico-uninstalled-*"))), 1
        )

    def test_missing_browser_refused_before_support_created(self):
        installation.BROWSER = self.fixture / "Missing browser"
        with self.assertRaisesRegex(ValueError, "Open stock Helium"):
            installation.install(True)
        self.assertFalse(installation.SUPPORT.exists())

    def test_foreign_registration_preserved(self):
        installation.HOST.write_text("foreign")
        with self.assertRaisesRegex(ValueError, "already exists"):
            installation.install(True)
        self.assertEqual(installation.HOST.read_text(), "foreign")
        self.assertFalse(installation.APP.exists())

    def test_linked_destination_refused(self):
        foreign = self.fixture / "foreign"
        foreign.mkdir()
        installation.SUPPORT.parent.mkdir(parents=True, exist_ok=True)
        installation.SUPPORT.symlink_to(foreign)
        with self.assertRaisesRegex(ValueError, "Linked"):
            installation.install(True)
        self.assertEqual(list(foreign.iterdir()), [])

    def test_ad_hoc_requires_explicit_choice(self):
        with patch.object(
            installation,
            "signature",
            return_value='identifier fixture and cdhash H"abcd"',
        ):
            with self.assertRaisesRegex(ValueError, "ad-hoc"):
                installation.candidate()
            self.assertFalse(installation.candidate(True)["persistent_identity"])

    def test_modified_installation_refuses_uninstall(self):
        installation.install(True)
        (installation.EXTENSION / "fixture-change").write_text("changed")
        with self.assertRaisesRegex(ValueError, "differ"):
            installation.uninstall()
        self.assertTrue(installation.APP.exists())
        self.assertTrue(installation.HOST.exists())

    def test_wrong_origin_refused(self):
        manifest = installation.ROOT / "extension/manifest.json"
        data = json.loads(manifest.read_text())
        data["key"] = "Zml4dHVyZQ=="
        manifest.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, "origin"):
            installation.candidate()
        self.assertFalse(installation.SUPPORT.exists())

    def test_initial_journal_failure_is_recoverable(self):
        with patch.object(
            installation.os, "replace", side_effect=OSError("journal failure")
        ):
            with self.assertRaises(OSError):
                installation.install(True)
        (stage,) = installation.SUPPORT.glob("install-*")
        self.assertFalse((stage / "journal.json").exists())
        installation.recover(stage)
        installation.install(True)
        installation.installed()

    def test_distinct_ad_hoc_update_prepare_publish_rollback(self):
        import subprocess, plistlib, sys

        spec = importlib.util.spec_from_file_location(
            "update", ROOT / "scripts/update.py"
        )
        update = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(update)
        subprocess.run(
            ["codesign", "--force", "--sign", "-", str(installation.SOURCE)], check=True
        )
        installation.install(True)
        old = installation.installed()
        for name in ("SUPPORT", "APP", "EXTENSION", "HOST", "RECEIPT", "ROOT"):
            setattr(update, name, getattr(installation, name))
        update.installation = installation
        plist = installation.SOURCE / "Contents/Info.plist"
        data = plistlib.loads(plist.read_bytes())
        data["CFBundleVersion"] += "1"
        plist.write_bytes(plistlib.dumps(data))
        subprocess.run(
            ["codesign", "--force", "--sign", "-", str(installation.SOURCE)], check=True
        )
        with self.assertRaises(SystemExit):
            update.compatible_identity(installation.SOURCE, installation.APP)
        with patch.object(sys, "argv", ["update.py", "prepare", "--allow-ad-hoc"]):
            update.main()
        (stage,) = installation.SUPPORT.glob("update-*")
        with patch.object(sys, "argv", ["update.py", "publish", str(stage)]):
            update.main()
        self.assertNotEqual(installation.installed()["app_sha256"], old["app_sha256"])
        with patch.object(sys, "argv", ["update.py", "rollback", str(stage)]):
            update.main()
        self.assertEqual(installation.installed(), old)
        # Certificate migration policy is deterministic even on contributors'
        # default ad-hoc builds; the preceding exchanges used real signatures.
        with patch.object(update, "signature", side_effect=[
            'identifier fixture and certificate leaf = H"012345"',
            'identifier fixture and cdhash H"abcdef"',
        ]):
            with self.assertRaises(SystemExit):
                update.compatible_identity(installation.SOURCE, installation.APP, True)

    def test_process_death_each_publication_boundary(self):
        for boundary in (1, 2, 3, 4):
            with self.subTest(boundary=boundary):
                if boundary != 1:
                    self.setUp()
                pid = os.fork()
                if pid == 0:
                    original = installation.move_without_replacement
                    count = 0

                    def interrupted(src, dst):
                        nonlocal count
                        original(src, dst)
                        count += 1
                        if count == boundary:
                            os._exit(73)

                    installation.move_without_replacement = interrupted
                    installation.install(True)
                    os._exit(99)
                _, status = os.waitpid(pid, 0)
                self.assertEqual(os.waitstatus_to_exitcode(status), 73)
                (stage,) = installation.SUPPORT.glob("install-*")
                installation.recover(stage)
                self.assertFalse(installation.APP.exists())
                self.assertFalse(installation.HOST.exists())
                installation.install(True)
                installation.installed()
                self.assertEqual(self.unrelated.read_text(), "unrelated fixture")


if __name__ == "__main__":
    unittest.main()
