#!/bin/sh
# Regenerates mac/AppIcon.icns from mac/icon.svg (which embeds logo.svg). Needs Google Chrome to rasterize.
set -e
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --allow-file-access-from-files \
  --hide-scrollbars --default-background-color=00000000 --window-size=1024,1024 \
  --screenshot="$TMP/1024.png" "file://$PWD/mac/icon.svg" 2>/dev/null
mkdir "$TMP/AppIcon.iconset"
for s in 16 32 128 256 512; do
  sips -z $s $s "$TMP/1024.png" --out "$TMP/AppIcon.iconset/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) "$TMP/1024.png" --out "$TMP/AppIcon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$TMP/AppIcon.iconset" -o mac/AppIcon.icns
rm -rf "$TMP"
echo "Wrote mac/AppIcon.icns"
