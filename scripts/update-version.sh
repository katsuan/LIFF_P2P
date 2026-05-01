#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
VERSION=${GITHUB_SHA:-}

if [ -n "$VERSION" ]; then
  VERSION=$(printf '%s' "$VERSION" | cut -c1-7)
else
  VERSION=$(git -C "$ROOT_DIR" rev-parse --short HEAD)
fi

mkdir -p "$ROOT_DIR/js"

cat > "$ROOT_DIR/js/version.js" <<EOF
(function (window) {
  window.APP_CONFIG = window.APP_CONFIG || {};
  window.APP_CONFIG.appVersion = "$VERSION";
}(window));
EOF

cat > "$ROOT_DIR/version.json" <<EOF
{"version":"$VERSION"}
EOF

printf 'js/version.js and version.json updated: %s\n' "$VERSION"
