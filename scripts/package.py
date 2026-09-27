#!/usr/bin/env python3
"""Create a deterministic source package from an explicitly clean Git revision.

Only the committed tree is shipped. Builds, profiles, telemetry and untracked
working files are never inferred into a release. Media is included only if it is
committed and independently reviewed by the release process.
"""

import hashlib
import json
from pathlib import Path
import plistlib
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    state = subprocess.check_output(
        ["git", "status", "--porcelain"], cwd=ROOT, text=True
    )
    if state.strip():
        raise SystemExit("Commit the reviewed release tree before packaging.")
    manifest = json.loads((ROOT / "extension/manifest.json").read_text())
    version = manifest["version"]
    if (
        plistlib.loads((ROOT / "native/Info.plist").read_bytes())[
            "CFBundleShortVersionString"
        ]
        != version
    ):
        raise SystemExit("Version mismatch")
    if json.loads((ROOT / "package.json").read_text())["version"] != version:
        raise SystemExit("Package version mismatch")
    if manifest["background"]["service_worker"] != "background.mjs":
        raise SystemExit("Qualification extension refused")
    files = subprocess.check_output(
        ["git", "ls-tree", "-r", "-z", "HEAD"], cwd=ROOT
    ).split(b"\0")
    prefix = "Plico-Helium-Companion-" + version
    out = ROOT / "dist"
    out.mkdir(exist_ok=True)
    target = out / (prefix + "-source.zip")
    if target.exists():
        raise SystemExit("Existing artifact preserved; use a fresh dist directory.")
    with zipfile.ZipFile(
        target, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=9
    ) as archive:
        for entry in files:
            if not entry:
                continue
            metadata, raw_path = entry.split(b"\t", 1)
            mode, kind, oid = metadata.decode().split()
            path = raw_path.decode()
            if mode not in ("100644", "100755") or kind != "blob":
                raise SystemExit("Unsupported release entry: " + path)
            if (
                path.split("/")[0]
                in (".local", "build", "dist", "node_modules", ".git")
                or "qualification-worker" in path
            ):
                raise SystemExit("Private/generated release entry refused: " + path)
            data = subprocess.check_output(["git", "cat-file", "blob", oid], cwd=ROOT)
            info = zipfile.ZipInfo(prefix + "/" + path, date_time=(2026, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = int(mode, 8) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data)
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    (out / "SHA256SUMS.txt").write_text(digest + "  " + target.name + "\n")
    print(target)


if __name__ == "__main__":
    main()
