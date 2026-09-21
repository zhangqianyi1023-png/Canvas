#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -x backend/.venv/bin/python ]]; then
  echo "Missing backend/.venv. Create the backend virtual environment first." >&2
  exit 1
fi

npm --prefix frontend run build
backend/.venv/bin/python -m PyInstaller --clean --noconfirm backend/desktop_backend.spec

rm -rf dist/inux-canvas-copilot-runtime
mkdir -p dist/inux-canvas-copilot-runtime
cp backend/copilot-runtime/bridge.mjs dist/inux-canvas-copilot-runtime/
cp backend/copilot-runtime/canvas.cordis.patch.yml dist/inux-canvas-copilot-runtime/
cp -R backend/copilot-runtime/node_modules dist/inux-canvas-copilot-runtime/

NODE_BIN="${INUX_COPILOT_NODE_BIN:-$(command -v node || true)}"
if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "Missing Node.js runtime for the packaged Copilot." >&2
  exit 1
fi
cp "$NODE_BIN" dist/inux-canvas-copilot-runtime/node
chmod +x dist/inux-canvas-copilot-runtime/node
