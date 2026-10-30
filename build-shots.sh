#!/bin/bash
# build-shots.sh — アプリ本体の店頭スクショ（mobile/pawweather/docs/screenshots）から、サイト用の WebP を作る。
#
#   ./build-shots.sh
#
# iPhone 用は ja と en-US の 01〜07（課金の審査用 07-paywall は使わない）。
# iPhone Duo 用は duo/ja を使う。英語版の Duo スクショ（duo/en-US）がまだ無いあいだは、
# 日本語版の画像を英語ページにも置く。撮り直したら、このスクリプトをもう一度走らせるだけで差し替わる
# （ファイル名は 01〜05 の番号で固定。HTML は assets/shots/duo/<lang>/0N.webp を指している）。
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
src="$here/../../mobile/pawweather/docs/screenshots"
out="$here/assets/shots"

webp() { # 入力 出力 幅
  sips -Z "$3" "$1" --out "$tmp/x.png" >/dev/null
  cwebp -quiet -q 80 "$tmp/x.png" -o "$2"
}
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT

for lang in ja en; do
  dir="$src/$lang"; [ "$lang" = en ] && dir="$src/en-US"
  mkdir -p "$out/$lang"
  for f in "$dir"/0[1-7]-*.png; do
    case "$(basename "$f")" in *paywall*) continue;; esac
    n="$(basename "$f" | cut -c1-2)"
    webp "$f" "$out/$lang/$n.webp" 1300   # 長辺 1300px（表示は 300px 前後・2〜3 倍密度まで）
  done
done

for lang in ja en; do
  dir="$src/duo/$lang"; [ "$lang" = en ] && dir="$src/duo/en-US"
  [ -d "$dir" ] || dir="$src/duo/ja"      # 英語の Duo スクショが届くまでは日本語版で代用
  mkdir -p "$out/duo/$lang"
  for f in "$dir"/0[1-5]-*.png; do
    n="$(basename "$f" | cut -c1-2)"
    webp "$f" "$out/duo/$lang/$n.webp" 1600
  done
done

app_icon="$src/../../assets/images/icon.png"
sips -Z 192 "$app_icon" --out "$here/assets/icon.png" >/dev/null
sips -Z 180 "$app_icon" --out "$here/assets/apple-touch-icon.png" >/dev/null
sips -Z 64 "$app_icon" --out "$here/assets/favicon.png" >/dev/null
ls -la "$out"/* "$out"/duo/* | grep -c webp | xargs echo "webp:"
