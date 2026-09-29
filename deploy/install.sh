#!/usr/bin/env bash
# ==============================================================================
# Raina Bootstrap Installer
# Usage: curl -fsSL https://get.raina.dev | bash
#        or: bash deploy/install.sh [options]
# ==============================================================================
set -euo pipefail

# ------------------------------------------------------------------------------
# Colors
# ------------------------------------------------------------------------------
if [ -t 1 ]; then
  BOLD="\033[1m"
  GREEN="\033[32m"
  RED="\033[31m"
  YELLOW="\033[33m"
  BLUE="\033[34m"
  CYAN="\033[36m"
  RESET="\033[0m"
else
  BOLD=""
  GREEN=""
  RED=""
  YELLOW=""
  BLUE=""
  CYAN=""
  RESET=""
fi

log_step() { echo -e "${BLUE}▶${RESET} ${BOLD}$*${RESET}"; }
log_ok() { echo -e "  ${GREEN}✓${RESET} $*"; }
log_warn() { echo -e "  ${YELLOW}⚠${RESET} $*" >&2; }
log_err() { echo -e "  ${RED}✗${RESET} $*" >&2; }
die() { log_err "$*"; exit 1; }

has_cmd() { command -v "$1" >/dev/null 2>&1; }

echo -e "\n${BOLD}${CYAN}================================================${RESET}"
echo -e "  ${BOLD}Raina Self-Host Installer${RESET}"
echo -e "${BOLD}${CYAN}================================================${RESET}\n"

# ------------------------------------------------------------------------------
# 1. Environment & Architecture Detection
# ------------------------------------------------------------------------------
log_step "Detecting operating system and hardware..."

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$OS" in
  linux*)  log_ok "Linux detected" ;;
  darwin*) log_ok "macOS detected" ;;
  *)       die "Unsupported operating system: $OS. Raina supports Linux and macOS." ;;
esac

case "$ARCH" in
  x86_64|amd64) log_ok "Architecture: amd64 ($ARCH)" ;;
  aarch64|arm64) log_ok "Architecture: arm64 ($ARCH)" ;;
  *)            log_warn "Architecture: $ARCH (pre-built multiarch container images recommended)" ;;
esac

# ------------------------------------------------------------------------------
# 2. Check Prerequisites (Docker & Docker Compose)
# ------------------------------------------------------------------------------
log_step "Verifying container runtime requirements..."

if ! has_cmd docker; then
  echo ""
  log_err "Docker is required but not installed."
  if [ "$OS" = "linux" ]; then
    echo -e "  You can quickly install Docker using the official script:"
    echo -e "  ${CYAN}curl -fsSL https://get.docker.com | sh${RESET}"
    echo -e "  Then add your user to the docker group: ${CYAN}sudo usermod -aG docker \$USER${RESET}"
  fi
  die "Please install Docker and re-run this installer."
fi

if ! docker info >/dev/null 2>&1; then
  die "Docker is installed, but the Docker daemon is not running or accessible by the current user."
fi
DOCKER_VER="$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "detected")"
log_ok "Docker daemon active ($DOCKER_VER)"

# Docker Compose detection
if docker compose version >/dev/null 2>&1; then
  COMPOSE_VER="$(docker compose version --short 2>/dev/null || echo "available")"
  log_ok "Docker Compose v2 active ($COMPOSE_VER)"
elif has_cmd docker-compose; then
  COMPOSE_VER="$(docker-compose version --short 2>/dev/null || echo "available")"
  log_ok "Docker Compose standalone active ($COMPOSE_VER)"
else
  die "Docker Compose plugin is missing. Please install the docker-compose-plugin package."
fi

# ------------------------------------------------------------------------------
# 3. Install / Deploy Raina CLI
# ------------------------------------------------------------------------------
log_step "Installing Raina CLI..."

TARGET_BIN="/usr/local/bin/raina"
FALLBACK_BIN="$HOME/.local/bin/raina"
FINAL_BIN="$TARGET_BIN"

install_cli_file() {
  local src="$1"
  local dest="$2"

  if [ -w "$(dirname "$dest")" ] || [ "$EUID" -eq 0 ]; then
    cp "$src" "$dest"
    chmod +x "$dest"
  elif has_cmd sudo; then
    sudo cp "$src" "$dest"
    sudo chmod +x "$dest"
  else
    # Fallback to user-local bin
    mkdir -p "$(dirname "$FALLBACK_BIN")"
    cp "$src" "$FALLBACK_BIN"
    chmod +x "$FALLBACK_BIN"
    FINAL_BIN="$FALLBACK_BIN"
  fi
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_CLI="$SCRIPT_DIR/cli/raina"

if [ -f "$LOCAL_CLI" ]; then
  # Local repository installation
  install_cli_file "$LOCAL_CLI" "$TARGET_BIN"
else
  # Remote curl | bash mode: download CLI
  TMP_CLI="$(mktemp)"
  CLI_URL="https://raw.githubusercontent.com/mengsokool/raina/main/deploy/cli/raina"
  curl -fsSL "$CLI_URL" -o "$TMP_CLI" || die "Failed to download Raina CLI from $CLI_URL"
  install_cli_file "$TMP_CLI" "$TARGET_BIN"
  rm -f "$TMP_CLI"
fi

log_ok "Raina CLI installed at ${FINAL_BIN}"

# Ensure CLI is in PATH warning
if ! has_cmd raina && [ "$FINAL_BIN" = "$FALLBACK_BIN" ]; then
  log_warn "${FINAL_BIN} is not in your current PATH."
  echo -e "  Consider adding: ${CYAN}export PATH=\"\$HOME/.local/bin:\$PATH\"${RESET} to your ~/.bashrc or ~/.zshrc"
fi

# ------------------------------------------------------------------------------
# 4. Delegate to 'raina install'
# ------------------------------------------------------------------------------
log_step "Launching installation workflow..."
"$FINAL_BIN" install "$@"
