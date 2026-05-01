#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
VERSION=$(git -C "$ROOT_DIR" rev-parse --short HEAD)

cat > "$ROOT_DIR/version.js" <<EOF
(function (window) {
  window.APP_CONFIG = window.APP_CONFIG || {};
  window.APP_CONFIG.appVersion = "$VERSION";
}(window));
EOF

printf 'version.js updated: %s\n' "$VERSION"
