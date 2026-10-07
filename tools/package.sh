#!/usr/bin/env bash
# Builds dist/Agartha_v<VERSION>.mcaddon (open it on a device with Minecraft to import).
# To release an update: bump the number in VERSION, then run this script.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="$(tr -d '[:space:]' < VERSION)"
python3 tools/set_version.py
rm -rf dist/tmp && mkdir -p dist/tmp
(cd behavior_pack && zip -qr "../dist/tmp/Agartha_v${VERSION}_BP.mcpack" .)
(cd resource_pack && zip -qr "../dist/tmp/Agartha_v${VERSION}_RP.mcpack" .)
rm -f "dist/Agartha_v${VERSION}.mcaddon"
(cd dist/tmp && zip -q "../Agartha_v${VERSION}.mcaddon" ./*.mcpack)
rm -rf dist/tmp
echo "built dist/Agartha_v${VERSION}.mcaddon"
