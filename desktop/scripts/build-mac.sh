#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

desktop/scripts/build-backend.sh
export ELECTRON_BUILDER_7ZIP_PATH="$ROOT_DIR/desktop/node_modules/7zip-bin/mac/arm64/7za"
npm --prefix desktop run dist:mac

APP_DIR="$ROOT_DIR/release/mac-arm64/InUx Canvas.app"
DMG_PATH="$ROOT_DIR/release/InUx-Canvas-1.0.2-arm64.dmg"

if [[ ! -d "$APP_DIR" ]]; then
  echo "Packaged macOS app was not created: $APP_DIR" >&2
  exit 1
fi

rm -f "$DMG_PATH"
hdiutil create \
  -volname "InUx Canvas" \
  -srcfolder "$APP_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH"
