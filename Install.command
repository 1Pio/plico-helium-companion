#!/bin/bash
# Build from the inspected source on this Mac. No certificate, key import, or sudo.
set -euo pipefail
cd "$(dirname "$0")"
[[ "$(uname -s)" == Darwin ]] || { echo 'Plico requires macOS.'; exit 1; }
xcode-select -p >/dev/null 2>&1 || { echo 'Install Apple Command Line Tools with: xcode-select --install'; exit 1; }
echo 'Building Plico locally. This source build is not an Apple-notarized download.'
echo 'A changed ad-hoc build needs its Accessibility entry removed and re-added.'
bash scripts/build.sh --app-only
python3 scripts/install.py install --allow-ad-hoc
