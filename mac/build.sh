#!/bin/sh
# Builds "Sandbox Lab.app" (ad-hoc signed, Apple Silicon + Intel) into dist-mac/. No Xcode needed.
set -e
cd "$(dirname "$0")/.."
npm run build
APP="dist-mac/Sandbox Lab.app"
rm -rf dist-mac && mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp -R dist "$APP/Contents/Resources/game"
cp mac/Info.plist "$APP/Contents/"
cp mac/AppIcon.icns "$APP/Contents/Resources/"
for arch in arm64 x86_64; do
  swiftc -O -target $arch-apple-macos12 mac/main.swift -o dist-mac/sl-$arch
done
lipo -create dist-mac/sl-arm64 dist-mac/sl-x86_64 -output "$APP/Contents/MacOS/SandboxLab"
rm dist-mac/sl-*
codesign --force --deep -s - "$APP"
(cd dist-mac && ditto -c -k --keepParent "Sandbox Lab.app" Sandbox-Lab-mac.zip)
echo "Built $APP"
