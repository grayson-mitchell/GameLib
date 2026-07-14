#!/usr/bin/env bash
#
# THROWAWAY SPIKE — lives in spike/, deleted once acted on (mirrors the
# Phase 16 spike/ precedent). Resolves Assumption A1 / RESEARCH.md Pitfall 1:
# what is the exact CrossOver `cxbottle` CLI syntax (if any) for
# non-interactively creating a new bottle?
#
# This script requires a real macOS machine with CrossOver installed. It
# CANNOT be run in this dev/CI environment (no CrossOver install here) —
# that is why plan 17-01 is non-autonomous (checkpoint:human-verify).
#
# Usage:
#   bash spike/steam-bottle/probe-cxbottle.sh
#
# After running, paste the full output (cxbottle --help output + every
# RESULT: line) into spike/steam-bottle/FINDINGS.md under the matching
# sections, then fill in ## MECHANISM DECISION.

set -euo pipefail

# Throwaway spike bottle name — NEVER the real 'GameLibSteam' bottle name
# used by production code (17-04). Keeps this probe from colliding with
# any real bottle a later plan/manual test creates.
readonly NAME="gamelib-steam-spike"

# --- Step 1: Resolve the CrossOver cxbottle binary ---------------------
readonly CXBOTTLE="/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/cxbottle"

if [ ! -x "$CXBOTTLE" ]; then
  echo "ERROR: cxbottle binary not found or not executable at:" >&2
  echo "  $CXBOTTLE" >&2
  echo "Confirm CrossOver is installed in /Applications and re-run." >&2
  exit 1
fi

echo "== Environment =="
echo "cxbottle path: $CXBOTTLE"
echo "Spike bottle name: $NAME"
echo

# --- Step 2: Capture the real flag surface verbatim ---------------------
echo "== cxbottle --help output =="
# Some cxbottle builds use --usage instead of --help; try --help first,
# fall back to --usage, and never let a non-zero help exit abort the probe
# (set -e is intentionally relaxed just for this diagnostic call).
if ! "$CXBOTTLE" --help 2>&1; then
  echo "(--help failed or unsupported, trying --usage)"
  "$CXBOTTLE" --usage 2>&1 || echo "(--usage also failed/unsupported — help output unavailable)"
fi
echo

# --- Step 3: Expected bottle-existence signal ---------------------------
readonly BOTTLE_DIR="$HOME/Library/Application Support/CrossOver/Bottles/$NAME"
readonly CONF_PATH="$BOTTLE_DIR/cxbottle.conf"

# --- Step 4: Attempt candidate non-interactive create invocations ------
# Argv-form invocation ONLY (arguments as separate words). Never build a
# single interpolated shell string — this is the safe pattern 17-04 must
# mirror for user-supplied bottle names (T-17-01).
echo "== Attempt Results =="

check_result() {
  local label="$1"
  if [ -f "$CONF_PATH" ]; then
    echo "RESULT: $label -> conf_present=true"
    return 0
  else
    echo "RESULT: $label -> conf_present=false"
    return 1
  fi
}

FOUND=false

# (a) --template flag
if [ "$FOUND" = false ] && [ ! -f "$CONF_PATH" ]; then
  echo "--- Attempt (a): cxbottle --create --bottle \"$NAME\" --template win10 ---"
  "$CXBOTTLE" --create --bottle "$NAME" --template win10 || true
  if check_result 'cxbottle --create --bottle "$NAME" --template win10'; then
    FOUND=true
  fi
fi

# (b) --distro flag variant
if [ "$FOUND" = false ] && [ ! -f "$CONF_PATH" ]; then
  echo "--- Attempt (b): cxbottle --create --bottle \"$NAME\" --distro win10 ---"
  "$CXBOTTLE" --create --bottle "$NAME" --distro win10 || true
  if check_result 'cxbottle --create --bottle "$NAME" --distro win10'; then
    FOUND=true
  fi
fi

# (c) no template/distro flag at all
if [ "$FOUND" = false ] && [ ! -f "$CONF_PATH" ]; then
  echo "--- Attempt (c): cxbottle --create --bottle \"$NAME\" (no template flag) ---"
  "$CXBOTTLE" --create --bottle "$NAME" || true
  if check_result 'cxbottle --create --bottle "$NAME" (no template flag)'; then
    FOUND=true
  fi
fi

echo
if [ "$FOUND" = true ]; then
  echo "SUCCESS: cxbottle.conf appeared at: $CONF_PATH"
else
  echo "NO ATTEMPT PRODUCED cxbottle.conf. Fallback per D-02 applies:"
  echo "  FALLBACK: GUI-create + GameLib verify/configure"
fi

echo
echo "== Teardown hint (not automatic — inspect first) =="
echo "When done recording results in FINDINGS.md, remove the spike bottle with:"
echo "  rm -rf \"$BOTTLE_DIR\""
