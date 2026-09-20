#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_SOURCE="${NATIVE_ENV_FILE:-$ROOT_DIR/deploy/native/raina.env}"

if [[ "$ROOT_DIR" != "/opt/raina" ]]; then
  echo "Native systemd units run from /opt/raina; clone or deploy this repository there first." >&2
  exit 1
fi

if [[ ! -f "$ENV_SOURCE" ]]; then
  echo "Missing $ENV_SOURCE" >&2
  echo "Create it from deploy/native/raina.env.example and replace all CHANGE_ME values." >&2
  exit 1
fi

if grep -q 'CHANGE_ME' "$ENV_SOURCE"; then
  echo "Refusing to install with placeholder secrets in $ENV_SOURCE" >&2
  exit 1
fi

command -v node >/dev/null || { echo "Node.js 22+ is required." >&2; exit 1; }
command -v pnpm >/dev/null || { echo "pnpm 9+ is required." >&2; exit 1; }

if ! id raina >/dev/null 2>&1; then
  sudo useradd --system --create-home --home-dir /var/lib/raina --shell /usr/sbin/nologin raina
fi

sudo install -d -o raina -g raina /etc/raina
sudo install -m 600 "$ENV_SOURCE" /etc/raina/raina.env

# Source only trusted, operator-provided configuration to provide build-time URLs.
set -a
# shellcheck disable=SC1090
source "$ENV_SOURCE"
set +a

cd "$ROOT_DIR"
pnpm install --frozen-lockfile
pnpm --filter @raina/db generate
if [[ -z "${VITE_WS_URL:-}" ]]; then
  case "${PUBLIC_API_URL:-}" in
    https://*) VITE_WS_URL="wss://${PUBLIC_API_URL#https://}" ;;
    http://*) VITE_WS_URL="ws://${PUBLIC_API_URL#http://}" ;;
    *)
      echo "PUBLIC_API_URL must start with https:// or http://" >&2
      exit 1
      ;;
  esac
fi
VITE_WS_URL="$VITE_WS_URL" pnpm build

sudo install -m 644 "$ROOT_DIR/deploy/native/raina-server.service" /etc/systemd/system/raina-server.service
sudo install -m 644 "$ROOT_DIR/deploy/native/raina-web.service" /etc/systemd/system/raina-web.service
sudo systemctl daemon-reload
echo "Build complete. After PostgreSQL, EMQX, and Caddy are configured, run:"
echo "  sudo systemctl enable --now raina-server raina-web"
