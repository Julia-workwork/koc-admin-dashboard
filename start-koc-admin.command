#!/bin/zsh
set -e

APP_DIR="/Users/Zhuanz/Documents/New project/koc-admin-dashboard"
NODE="/Users/Zhuanz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
URL="http://127.0.0.1:5174/"
CSV_CONFIG="$APP_DIR/google-sheet-csv-url.txt"
APPS_SCRIPT_CONFIG="$APP_DIR/google-apps-script-url.txt"

cd "$APP_DIR"

echo "Starting 2026 KOC Admin..."
echo "Keep this window open while using the dashboard."
echo ""

if [[ -z "$ADMIN_PASSWORD" ]]; then
  echo "Enter the team password for this session:"
  read -rs ADMIN_PASSWORD
  export ADMIN_PASSWORD
  echo ""
  echo "Password configured for this server session."
  echo ""
fi

if [[ -f "$APPS_SCRIPT_CONFIG" ]]; then
  APPS_SCRIPT_URL="$(grep -E '^https?://' "$APPS_SCRIPT_CONFIG" | head -n 1 | xargs)"
  if [[ -n "$APPS_SCRIPT_URL" ]]; then
    export KOC_APPS_SCRIPT_URL="$APPS_SCRIPT_URL"
    echo "Using Google Apps Script online sheet API from google-apps-script-url.txt"
    echo "$APPS_SCRIPT_URL"
    echo ""
  fi
fi

if [[ -f "$CSV_CONFIG" ]]; then
  CSV_URL="$(grep -E '^https?://' "$CSV_CONFIG" | head -n 1 | xargs)"
  if [[ -n "$CSV_URL" ]]; then
    export KOC_SHEET_CSV_URL="$CSV_URL"
    echo "Using custom Google Sheet CSV URL from google-sheet-csv-url.txt"
    echo "$CSV_URL"
    echo ""
  fi
fi

echo "Opening: $URL"
echo ""

sleep 1
open "$URL" >/dev/null 2>&1 || true

"$NODE" server.mjs
