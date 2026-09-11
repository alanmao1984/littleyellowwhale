#!/bin/bash
set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo "usage: build-pkg.sh <binary> <version> <arch> <output.pkg>" >&2
  exit 64
fi

BINARY="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
VERSION="$2"
ARCH="$3"
OUTPUT="$4"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] || { echo "invalid version" >&2; exit 64; }
[[ "$ARCH" == "arm64" || "$ARCH" == "x64" ]] || { echo "invalid architecture" >&2; exit 64; }
[[ -x "$BINARY" ]] || { echo "binary is not executable" >&2; exit 66; }
BUNDLE_VERSION="${VERSION%%-*}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
APP="$WORK/root/Applications/Venus Node.app"
RESOURCES="$APP/Contents/Resources"
MACOS="$APP/Contents/MacOS"
mkdir -p "$RESOURCES" "$MACOS" "$(dirname "$OUTPUT")"
install -m 755 "$BINARY" "$RESOURCES/venus-node"

cat > "$MACOS/Venus Node" <<'LAUNCHER'
#!/bin/bash
set -euo pipefail
BINARY="$(cd "$(dirname "$0")/../Resources" && pwd)/venus-node"
/usr/bin/osascript - "$BINARY" <<'APPLESCRIPT'
on run argv
  tell application "Terminal"
    activate
    do script quoted form of (item 1 of argv)
  end tell
end run
APPLESCRIPT
LAUNCHER
chmod 755 "$MACOS/Venus Node"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleDisplayName</key><string>Venus Node</string>
  <key>CFBundleExecutable</key><string>Venus Node</string>
  <key>CFBundleIdentifier</key><string>com.littleyellowwhale.venus-node</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>Venus Node</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$BUNDLE_VERSION</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSUIElement</key><false/>
</dict></plist>
PLIST

if [[ -n "${MACOS_APPLICATION_IDENTITY:-}" ]]; then
  codesign --force --options runtime --timestamp --sign "$MACOS_APPLICATION_IDENTITY" "$RESOURCES/venus-node"
  codesign --force --options runtime --timestamp --sign "$MACOS_APPLICATION_IDENTITY" "$APP"
  codesign --verify --strict --verbose=2 "$APP"
fi

COMPONENT="$WORK/venus-node-component.pkg"
pkgbuild --root "$WORK/root" --identifier com.littleyellowwhale.venus-node --version "$VERSION" --install-location / "$COMPONENT"
if [[ -n "${MACOS_INSTALLER_IDENTITY:-}" ]]; then
  productsign --sign "$MACOS_INSTALLER_IDENTITY" --timestamp "$COMPONENT" "$OUTPUT"
  pkgutil --check-signature "$OUTPUT"
else
  cp "$COMPONENT" "$OUTPUT"
fi

echo "created $OUTPUT"
