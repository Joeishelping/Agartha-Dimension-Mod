#!/usr/bin/env bash
# Builds dist/Agartha.mcaddon (open it on a device with Minecraft to import).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist/tmp
(cd behavior_pack && zip -qr ../dist/tmp/Agartha_BP.mcpack .)
(cd resource_pack && zip -qr ../dist/tmp/Agartha_RP.mcpack .)
(cd dist/tmp && zip -q ../Agartha.mcaddon Agartha_BP.mcpack Agartha_RP.mcpack)
rm -rf dist/tmp
echo "built dist/Agartha.mcaddon"
