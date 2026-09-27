#!/usr/bin/env python3
"""Install a locally built companion without changing Helium's binary or profile data.

Only owned, receipt-verified files may be moved. Removal goes to the user's Trash.
Update exchanges and recovery live in update.py; this module owns shared paths,
signature/content checks, first installation and uninstall.
"""

import argparse
import base64
import ctypes
import datetime
import hashlib
import json
import os
import pathlib
import plistlib
import shutil
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
HOME = pathlib.Path.home()
SUPPORT = HOME / "Library/Application Support/Plico Helium Companion"
APP = HOME / "Applications/Plico Helium Companion.app"
EXTENSION = SUPPORT / "extension"
BROWSER = HOME / "Library/Application Support/net.imput.helium"
HOST = BROWSER / "NativeMessagingHosts/cc.helwig.plico.companion.json"
SOURCE = ROOT / "build/Plico Helium Companion.app"
RECEIPT = SUPPORT / "installation.json"
HOST_NAME = "cc.helwig.plico.companion"


def unlinked(path):
    if path.absolute() != path.resolve():
        raise ValueError("Linked installation paths are not supported: " + str(path))


def move_without_replacement(source, target):
    rename = ctypes.CDLL(None, use_errno=True).renamex_np
    rename.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    if rename(os.fsencode(source), os.fsencode(target), 4):
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error), str(target))


def tree_hash(path):
    if not path.is_dir():
        raise ValueError("Missing directory: " + str(path))
    unlinked(path)
    digest = hashlib.sha256()
    for item in sorted(path.rglob("*")):
        if item.is_symlink():
            raise ValueError("Refusing symlink: " + str(item))
        if item.is_file():
            digest.update(str(item.relative_to(path)).encode() + b"\0")
            digest.update(hashlib.sha256(item.read_bytes()).digest())
        elif not item.is_dir():
            raise ValueError("Unexpected file type: " + str(item))
    return digest.hexdigest()


def signature(app):
    subprocess.run(["codesign", "--verify", "--deep", "--strict", str(app)], check=True)
    output = subprocess.check_output(
        ["codesign", "-d", "-r-", str(app)], stderr=subprocess.STDOUT, text=True
    )
    return output.split("designated => ", 1)[1].strip()


def registration(extension_id):
    return {
        "name": HOST_NAME,
        "description": "Plico Helium Companion",
        "path": str(APP / "Contents/MacOS/plico-companion"),
        "type": "stdio",
        "allowed_origins": ["chrome-extension://" + extension_id + "/"],
    }


def disconnected():
    binary = str(APP / "Contents/MacOS/plico-companion")
    for row in subprocess.check_output(
        ["ps", "-axo", "command="], text=True
    ).splitlines():
        if row.strip().startswith(binary + " "):
            raise ValueError(
                "Disconnect Plico in its Helium extension before changing the installation."
            )


def validate_paths():
    for path in [HOME, SUPPORT, APP, EXTENSION, BROWSER, HOST, RECEIPT]:
        unlinked(path)


def installed():
    validate_paths()
    receipt = json.loads(RECEIPT.read_text())
    if (
        tree_hash(APP) != receipt["app_sha256"]
        or tree_hash(EXTENSION) != receipt["extension_sha256"]
    ):
        raise ValueError(
            "Installed files differ from the receipt; nothing was changed."
        )
    if json.loads(HOST.read_text()) != registration(receipt["extension_id"]):
        raise ValueError("Native registration changed; nothing was changed.")
    signature(APP)
    return receipt


def candidate(allow_ad_hoc=False):
    validate_paths()
    if not BROWSER.is_dir() or not any(
        p.is_dir() and not p.is_symlink() and (p / "Preferences").is_file()
        for p in BROWSER.iterdir()
    ):
        raise ValueError(
            "Open stock Helium once with a normal profile before installing Plico."
        )
    unlinked(SOURCE)
    manifest = json.loads((ROOT / "extension/manifest.json").read_text())
    if (
        manifest["background"]["service_worker"] != "background.mjs"
        or (ROOT / "extension/qualification-worker.mjs").exists()
    ):
        raise ValueError("Refusing a qualification extension.")
    extid = "".join(
        chr(97 + int(c, 16))
        for c in hashlib.sha256(
            base64.b64decode(manifest["key"], validate=True)
        ).hexdigest()[:32]
    )
    info = plistlib.loads((SOURCE / "Contents/Info.plist").read_bytes())
    if (
        info.get("CFBundleIdentifier") != HOST_NAME
        or info.get("CFBundleShortVersionString") != manifest["version"]
    ):
        raise ValueError("App and extension identity/version do not match.")
    binary = SOURCE / "Contents/MacOS/plico-companion"
    origin = ("chrome-extension://" + extid + "/").encode()
    if (
        info.get("CFBundleExecutable") != binary.name
        or not os.access(binary, os.X_OK)
        or origin not in binary.read_bytes()
    ):
        raise ValueError("Native executable and extension origin do not match.")
    requirement = signature(SOURCE)
    persistent = "certificate leaf" in requirement or "anchor apple" in requirement
    if not persistent and not allow_ad_hoc:
        raise ValueError(
            "This is a local ad-hoc build. Use --allow-ad-hoc to accept re-granting Accessibility after changed builds. It is not a notarized download."
        )
    commit = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True
    )
    dirty = subprocess.run(
        ["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True
    )
    return {
        "format": 1,
        "release": manifest["version"],
        "extension_id": extid,
        "source_commit": commit.stdout.strip()
        if commit.returncode == 0
        else "source archive",
        "source_dirty": bool(dirty.stdout.strip()) if dirty.returncode == 0 else False,
        "app_sha256": tree_hash(SOURCE),
        "extension_sha256": tree_hash(ROOT / "extension"),
        "signing_requirement": requirement,
        "persistent_identity": persistent,
        "installed_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


def write_json(path, value):
    fd, pending = tempfile.mkstemp(prefix="pending-", dir=path.parent)
    with os.fdopen(fd, "w") as stream:
        stream.write(json.dumps(value, indent=2) + "\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(pending, path)


def stamp():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")


def pairs(stage):
    return [
        (stage / APP.name, APP),
        (stage / "extension", EXTENSION),
        (stage / "native-host.json", HOST),
        (stage / "installation.json", RECEIPT),
    ]


def payload_hash(path):
    unlinked(path)
    return (
        tree_hash(path)
        if path.is_dir()
        else hashlib.sha256(path.read_bytes()).hexdigest()
    )


def recover(stage):
    validate_paths()
    unlinked(stage)
    if stage.parent != SUPPORT or not stage.name.startswith("install-"):
        raise ValueError("Expected an owned installation stage.")
    if not stage.is_dir():
        raise ValueError("Missing installation stage.")
    journal_path = stage / "journal.json"
    # No destination is touched until the complete installing journal exists.
    # A crash between mkdir and the first journal write is therefore recoverable.
    journal = (
        json.loads(journal_path.read_text())
        if journal_path.exists()
        else {"state": "preparing"}
    )
    if journal["state"] == "preparing":
        if any(dst.exists() or dst.is_symlink() for _, dst in pairs(stage)):
            raise ValueError(
                "Unexpected published files during preparation; nothing was changed."
            )
        journal["state"] = "recovered"
        write_json(stage / "journal.json", journal)
        return
    if journal["state"] != "installing":
        raise ValueError(
            "Only an interrupted first installation can be recovered here."
        )
    disconnected()
    moves = []
    if len(journal["hashes"]) != len(pairs(stage)):
        raise ValueError("Invalid installation journal.")
    for (src, dst), expected in zip(pairs(stage), journal["hashes"]):
        unlinked(src)
        unlinked(dst)
        if src.exists() and not dst.exists() and payload_hash(src) == expected:
            continue
        if dst.exists() and not src.exists() and payload_hash(dst) == expected:
            moves.append((dst, src))
            continue
        raise ValueError(
            "Unknown content in interrupted installation; nothing was changed."
        )
    for src, dst in reversed(moves):
        move_without_replacement(src, dst)
    journal["state"] = "recovered"
    # An interruption before this state write can safely run recovery again.
    write_json(stage / "journal.json", journal)
    print("Recovered installation; retained candidate at", stage)


def install(allow_ad_hoc=False):
    receipt = candidate(allow_ad_hoc)
    if any(p.exists() or p.is_symlink() for p in [APP, EXTENSION, HOST, RECEIPT]):
        raise ValueError(
            "An installation or registration already exists. Use status/update, never overwrite it."
        )
    if SUPPORT.exists():
        # Only our retained, recovered first-install stages may preexist.
        for child in SUPPORT.iterdir():
            unlinked(child)
            if (
                not child.is_dir()
                or not child.name.startswith("install-")
                or not (child / "journal.json").is_file()
                or json.loads((child / "journal.json").read_text()).get("state")
                != "recovered"
            ):
                raise ValueError(
                    "Existing support data found. Recover an interrupted installation before retrying."
                )
    SUPPORT.mkdir(mode=0o700, parents=True, exist_ok=True)
    stage = SUPPORT / ("install-" + stamp())
    stage.mkdir(mode=0o700)
    write_json(stage / "journal.json", {"state": "preparing"})
    shutil.copytree(SOURCE, stage / APP.name)
    shutil.copytree(ROOT / "extension", stage / "extension")
    (stage / "native-host.json").write_text(
        json.dumps(registration(receipt["extension_id"]), indent=2) + "\n"
    )
    (stage / "installation.json").write_text(json.dumps(receipt, indent=2) + "\n")
    if (
        tree_hash(stage / APP.name) != receipt["app_sha256"]
        or tree_hash(stage / "extension") != receipt["extension_sha256"]
    ):
        raise ValueError("Staging integrity mismatch.")
    signature(stage / APP.name)
    journal = {
        "state": "installing",
        "hashes": [payload_hash(src) for src, _ in pairs(stage)],
    }
    write_json(stage / "journal.json", journal)
    APP.parent.mkdir(exist_ok=True)
    HOST.parent.mkdir(exist_ok=True)
    try:
        for src, dst in pairs(stage):
            move_without_replacement(src, dst)
    except BaseException:
        recover(stage)
        raise
    journal["state"] = "installed"
    write_json(stage / "journal.json", journal)
    installed()
    print("Installed Plico", receipt["release"])
    print(
        "In helium://extensions, enable Developer mode, choose Load unpacked, then select:"
    )
    print(EXTENSION)
    print("In System Settings > Privacy & Security > Accessibility, add and enable:")
    print(APP)


def uninstall():
    installed()
    disconnected()
    trash = HOME / ".Trash"
    unlinked(trash)
    trash.mkdir(exist_ok=True)
    stage = trash / ("Plico-uninstalled-" + stamp())
    stage.mkdir(mode=0o700)
    moves = [
        (APP, stage / APP.name),
        (HOST, stage / "native-host.json"),
        (SUPPORT, stage / "Support"),
    ]
    done = []
    try:
        for src, dst in moves:
            move_without_replacement(src, dst)
            done.append((src, dst))
    except BaseException:
        for src, dst in reversed(done):
            move_without_replacement(dst, src)
        raise
    print(
        "Moved Plico and its retained rollback copies to Trash. Helium data was preserved."
    )
    print(
        "Remove the Plico extension in Helium and its Accessibility entry in System Settings."
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["install", "status", "recover", "uninstall"])
    parser.add_argument("stage", nargs="?")
    parser.add_argument("--allow-ad-hoc", action="store_true")
    args = parser.parse_args()
    try:
        if args.action == "install":
            install(args.allow_ad_hoc)
        elif args.action == "status":
            r = installed()
            print("Verified Plico", r.get("release", "installation"))
            print("Extension:", EXTENSION)
            print("App:", APP)
        elif args.action == "recover":
            recover(pathlib.Path(args.stage or "").absolute())
        else:
            uninstall()
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as e:
        parser.exit(1, str(e) + "\n")


if __name__ == "__main__":
    main()
