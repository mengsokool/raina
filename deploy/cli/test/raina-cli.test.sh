#!/usr/bin/env bash
# ==============================================================================
# Raina CLI Integration & Verification Test Suite
# Tests CLI command flags, state management, directory generation, and diagnostics
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI="$SCRIPT_DIR/../raina"

TEST_TMP="$(mktemp -d)"
trap 'rm -rf "$TEST_TMP"' EXIT

TEST_INSTALL_DIR="$TEST_TMP/raina-test"

echo "=== Running Raina CLI Test Suite ==="

# ------------------------------------------------------------------------------
# Test 1: CLI Version and Help
# ------------------------------------------------------------------------------
echo "Test 1: Version and Help Output..."
"$CLI" version | grep "Raina CLI version" >/dev/null
"$CLI" help | grep "Commands:" >/dev/null
"$CLI" --help | grep "install" >/dev/null
echo "✓ Test 1 passed."

# ------------------------------------------------------------------------------
# Test 2: Dry-run Installation & State Generation
# ------------------------------------------------------------------------------
echo "Test 2: Dry-run Installation & Layout..."
"$CLI" install \
  --install-dir "$TEST_INSTALL_DIR" \
  --version "2.0.0" \
  --channel "stable" \
  --port 8080 \
  --api-port 8081 \
  --rlp-port 9999 \
  --dry-run

# Verify directories
[ -d "$TEST_INSTALL_DIR" ]
[ -d "$TEST_INSTALL_DIR/state" ]
[ -d "$TEST_INSTALL_DIR/backups" ]
[ -d "$TEST_INSTALL_DIR/config" ]
[ -d "$TEST_INSTALL_DIR/data" ]
[ -d "$TEST_INSTALL_DIR/updates" ]

# Verify files
[ -f "$TEST_INSTALL_DIR/.env" ]
[ -f "$TEST_INSTALL_DIR/compose.yaml" ]
[ -f "$TEST_INSTALL_DIR/state/installation.json" ]
[ -f "$TEST_INSTALL_DIR/state/migrations.json" ]
[ -f "$TEST_INSTALL_DIR/state/update-state.json" ]

# Verify .env contents
grep -q "RAINA_VERSION=2.0.0" "$TEST_INSTALL_DIR/.env"
grep -q "RAINA_CHANNEL=stable" "$TEST_INSTALL_DIR/.env"
grep -q "WEB_PORT=8080" "$TEST_INSTALL_DIR/.env"
grep -q "API_PORT=8081" "$TEST_INSTALL_DIR/.env"
grep -q "RLP_PORT=9999" "$TEST_INSTALL_DIR/.env"
grep -E -q "POSTGRES_PASSWORD=[a-f0-9]{32}" "$TEST_INSTALL_DIR/.env"
grep -E -q "WS_TICKET_SECRET=[a-f0-9]{64}" "$TEST_INSTALL_DIR/.env"
grep -E -q "ENCRYPTION_KEY=[a-f0-9]{64}" "$TEST_INSTALL_DIR/.env"
grep -E -q "SETUP_TOKEN=[a-f0-9]{32}" "$TEST_INSTALL_DIR/.env"

# Verify state/installation.json contents
grep -q '"version": "2.0.0"' "$TEST_INSTALL_DIR/state/installation.json"
grep -q '"channel": "stable"' "$TEST_INSTALL_DIR/state/installation.json"

# Verify state/update-state.json contents
grep -q '"status": "idle"' "$TEST_INSTALL_DIR/state/update-state.json"
echo "✓ Test 2 passed."

# ------------------------------------------------------------------------------
# Test 3: Doctor Diagnostics in Isolated Environment
# ------------------------------------------------------------------------------
echo "Test 3: Doctor Command..."
RAINA_INSTALL_DIR="$TEST_INSTALL_DIR" "$CLI" doctor | grep "Raina System Diagnostic" >/dev/null
echo "✓ Test 3 passed."

# ------------------------------------------------------------------------------
# Test 4: Status Command
# ------------------------------------------------------------------------------
echo "Test 4: Status Command..."
status_out="$(RAINA_INSTALL_DIR="$TEST_INSTALL_DIR" "$CLI" status 2>&1 || true)"
echo "$status_out" | grep "2.0.0" >/dev/null
echo "$status_out" | grep "$TEST_INSTALL_DIR" >/dev/null
echo "✓ Test 4 passed."

# ------------------------------------------------------------------------------
# Test 5: Backup Snapshot Generation
# ------------------------------------------------------------------------------
echo "Test 5: Backup Archive Creation..."
backup_tar="$(RAINA_INSTALL_DIR="$TEST_INSTALL_DIR" "$CLI" backup "testnote" | tail -n1)"
[ -f "$backup_tar" ]
# Verify backup archive contents
tar -tzf "$backup_tar" | grep "\.env" >/dev/null
tar -tzf "$backup_tar" | grep "compose.yaml" >/dev/null
tar -tzf "$backup_tar" | grep "backup-meta.json" >/dev/null
echo "✓ Test 5 passed."

# ------------------------------------------------------------------------------
# Test 6: Secret Preservation during Re-install
# ------------------------------------------------------------------------------
echo "Test 6: Existing Secret Preservation..."
orig_pass="$(grep "POSTGRES_PASSWORD=" "$TEST_INSTALL_DIR/.env" | cut -d'=' -f2)"
"$CLI" install --install-dir "$TEST_INSTALL_DIR" --version "2.1.0" --dry-run
new_pass="$(grep "POSTGRES_PASSWORD=" "$TEST_INSTALL_DIR/.env" | cut -d'=' -f2)"

if [ "$orig_pass" != "$new_pass" ]; then
  echo "FAIL: Password was overwritten during re-install!"
  exit 1
fi
grep -q "RAINA_VERSION=2.1.0" "$TEST_INSTALL_DIR/.env"
echo "✓ Test 6 passed."

echo ""
echo "============================================="
echo "  All 6 Raina CLI test scenarios passed 100%!"
echo "============================================="
