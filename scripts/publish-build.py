#!/usr/bin/env python3
"""Publish a completely signed build atomically; retain the previous app."""

import ctypes, os, pathlib, subprocess, sys


def exchange(source, target):
    if source.is_symlink() or target.is_symlink():
        raise ValueError("Refusing linked app bundle")
    if not target.exists():
        os.rename(source, target)
        return
    # macOS atomically exchanges both bundle names. A crash cannot leave the
    # installed path absent, and the old app remains at source for rollback.
    libc = ctypes.CDLL(None, use_errno=True)
    rename = libc.renamex_np
    rename.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    if rename(os.fsencode(source), os.fsencode(target), 0x00000002):
        errno = ctypes.get_errno()
        raise OSError(errno, os.strerror(errno))


def main():
    root = pathlib.Path(__file__).resolve().parent.parent
    if len(sys.argv) != 2:
        raise SystemExit("Usage: publish-build.py STAGED_APP")
    candidate = pathlib.Path(sys.argv[1]).absolute()
    if (
        candidate.name != "Plico Helium Companion.app"
        or candidate.parent.parent != root / "build"
        or not candidate.parent.name.startswith("staging-")
        or candidate.resolve() != candidate
    ):
        raise SystemExit("Expected an unlinked project build staging directory")
    subprocess.run(
        ["codesign", "--verify", "--deep", "--strict", str(candidate)], check=True
    )
    target = root / "build/Plico Helium Companion.app"
    exchange(candidate, target)
    print("Published verified build; prior app retained at", candidate)


if __name__ == "__main__":
    main()
