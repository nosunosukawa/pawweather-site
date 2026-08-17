#!/usr/bin/env bash
# build-engine.sh — pawrisk.js を **アプリ本体のソースから** 生成する。
#
# 手でコピーしない。pawrisk.js は生成物で、直接編集しても次の生成で消える。
# 生成後は必ず  node verify-engine.mjs  が通ること（CI代わりの再発防止線）。
set -euo pipefail

cd "$(dirname "$0")"

APP_SRC="../../mobile/pawweather/src/logic"
OUT="pawrisk.js"
ENTRY="pawrisk-entry.ts"

if [ ! -d "$APP_SRC" ]; then
  echo "✗ アプリ本体のソースが無い: $APP_SRC" >&2
  echo "  このスクリプトは ~/projects/web/<site> と ~/projects/mobile/<app> が" >&2
  echo "  隣り合っている前提で動く。" >&2
  exit 1
fi

if [ ! -x node_modules/.bin/esbuild ]; then
  echo "esbuild が無いので入れる…"
  npm install --silent --no-audit --no-fund
fi

SRC_REV="$(git -C ../../mobile/pawweather rev-parse --short HEAD 2>/dev/null || echo 'no-git')"
BUILT_AT="$(date +%Y-%m-%d)"

node_modules/.bin/esbuild "$ENTRY" \
  --bundle \
  --format=iife \
  --global-name=PawRisk \
  --minify \
  --target=es2018 \
  --legal-comments=none \
  --banner:js="/* PawWeather risk engine — 生成物。手で編集しない（次の生成で消える）。
   生成元: mobile/pawweather/src/logic (rev ${SRC_REV})
   生成日: ${BUILT_AT}   生成: web/pawweather-site/build-engine.sh
   検算:   node verify-engine.mjs */" \
  --outfile="$OUT"

echo "✓ $OUT を生成した（生成元 rev ${SRC_REV}）"
echo "  次: node verify-engine.mjs && node make-cloudy.mjs"
