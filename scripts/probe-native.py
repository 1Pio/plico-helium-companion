#!/usr/bin/env python3
"""Bounded native framing/lifecycle probe; no browser and no UI acceptance claim."""

import base64, hashlib, json, pathlib, struct, subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
key = json.loads((ROOT / "extension/manifest.json").read_text())["key"]
id = "".join(
    chr(97 + int(c, 16)) for c in hashlib.sha256(base64.b64decode(key)).hexdigest()[:32]
)
app = ROOT / "build/Plico Helium Companion.app/Contents/MacOS/plico-companion"
invalid = {
    "v": 1,
    "epoch": "probe",
    "type": "snapshot",
    "tabs": [3],
    "stacks": [[]] * 10,
    "last": [],
}
utf16 = ('{"a":"Ģ","b":' + "[" * 1000 + "0" + "]" * 1000 + ',"c":"Ģ"}').encode(
    "utf-16le"
)
data = json.dumps(invalid).encode()
frame = struct.pack("I", len(data)) + data
for label, input in [
    ("UTF-16 nested JSON", struct.pack("I", len(utf16)) + utf16),
    ("deep JSON", struct.pack("I", 2000) + b"[" * 1000 + b"]" * 1000),
    ("malformed snapshot", frame),
    ("truncated frame", struct.pack("I", 999) + b"{"),
    ("oversized frame", struct.pack("I", 2**24)),
]:
    p = subprocess.run(
        [str(app), "chrome-extension://" + id + "/"],
        input=input,
        capture_output=True,
        timeout=8,
    )
    if p.returncode != 0:
        raise SystemExit(
            f"{label}: failed {p.returncode} {p.stderr.decode(errors='replace')}"
        )
    print(label + ": clean exit")
p = subprocess.run(
    [str(app), "chrome-extension://wrong/"], capture_output=True, timeout=8
)
assert p.returncode == 2
print("unpaired origin: refused")
