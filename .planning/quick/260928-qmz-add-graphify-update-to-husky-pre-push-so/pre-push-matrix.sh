#!/bin/bash
#
# quick-260928-qmz verification harness for .husky/pre-push's best-effort graphify refresh.
#
# Five arms exercise exact exit-code propagation and both graphify degrade paths against
# stub `pnpm` and `graphify` binaries placed first on PATH, so the harness runs in seconds
# instead of paying the real check chain's multi-minute cost or the real graphify rebuild.
#
#   A  checks pass, graphify succeeds  -> exit 0, graphify runs, stdin is /dev/null (0 bytes)
#   B  checks pass, graphify fails     -> exit 0 anyway, stderr names the exit code
#   C  checks pass, graphify missing   -> exit 0 anyway, stderr says "not found on PATH"
#   D  `lint` fails                    -> exit exactly the lint shim's rc, no later check runs,
#                                          graphify never runs
#   E  `find-deadcode` fails           -> exit exactly the find-deadcode shim's rc, graphify
#                                          never runs
#
# Usage: bash pre-push-matrix.sh [HOOK]
#   HOOK defaults to <repo root>/.husky/pre-push. Point it at a checkout of another hook (for
#   example the pre-change blob) to run the same five arms against a different file -- this is
#   how the negative control proves the harness actually discriminates rather than always
#   reporting green. Against the pre-change hook (which never invoked graphify at all) only D
#   and E can pass: 2/5.
#
# Each arm's log is compared as an EXACT whole-file match against an expected file built with
# printf, via `diff -q`, never by line count -- an extra, missing, or reordered invocation must
# fail the arm, not slip past a count check.
#
# No HOME-family variable is set for any arm: the hook under these shims touches no real
# profile and spawns no sidecar (both `pnpm` and `graphify` are stub scripts), so the
# two-profile rule's isolation half does not apply here.

set -u

REPO_ROOT=$(git rev-parse --show-toplevel) || {
  echo "pre-push-matrix: not inside a git repository" >&2
  exit 1
}

HOOK="${1:-$REPO_ROOT/.husky/pre-push}"
if [ ! -f "$HOOK" ]; then
  echo "pre-push-matrix: hook not found: $HOOK" >&2
  exit 1
fi
# Resolve to an absolute path before the cd below, since a relative $1 would otherwise be
# interpreted against the new cwd.
case "$HOOK" in
  /*) : ;;
  *) HOOK="$(pwd)/$HOOK" ;;
esac

cd "$REPO_ROOT" || exit 1

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

WITH="$WORKDIR/with"
WITHOUT="$WORKDIR/without"
mkdir -p "$WITH" "$WITHOUT"

# --- shims -----------------------------------------------------------------------------
#
# pnpm: logs "pnpm <all args>" as one line, then fails iff its first argument (the pnpm
# script name -- codecheck, lint, prettier, i18n, find-deadcode) equals MATRIX_FAIL_AT.
cat >"$WITH/pnpm" <<'SHIM'
#!/bin/bash
printf 'pnpm %s\n' "$*" >>"$MATRIX_LOG"
if [ -n "${MATRIX_FAIL_AT:-}" ] && [ "${1:-}" = "$MATRIX_FAIL_AT" ]; then
  exit "${MATRIX_FAIL_RC:-1}"
fi
exit 0
SHIM
chmod +x "$WITH/pnpm"
cp "$WITH/pnpm" "$WITHOUT/pnpm"

# graphify: logs "graphify <all args>", then reads ALL of its stdin and logs the byte count
# (proves the hook's `</dev/null` redirect actually took effect despite the ref line fed to
# the hook's own stdin), then exits MATRIX_GRAPHIFY_RC.
cat >"$WITH/graphify" <<'SHIM'
#!/bin/bash
printf 'graphify %s\n' "$*" >>"$MATRIX_LOG"
bytes=$(wc -c | tr -d '[:space:]')
printf 'graphify-stdin-bytes %s\n' "$bytes" >>"$MATRIX_LOG"
exit "${MATRIX_GRAPHIFY_RC:-0}"
SHIM
chmod +x "$WITH/graphify"
# WITHOUT deliberately has no graphify shim -- that absence is what arm C exercises.

REF_LINE=$(printf 'refs/heads/main %040d refs/heads/main %040d' 0 0)
FIVE_PNPM=$'pnpm codecheck\npnpm lint\npnpm prettier\npnpm i18n --fail-on-update\npnpm find-deadcode'

# run_arm: invokes $HOOK exactly as git would (args, one stdin line, combined stdout+stderr
# captured), under the given shim dir and MATRIX_* environment. Echoes the exit code.
run_arm() {
  local shimdir="$1" fail_at="$2" fail_rc="$3" graphify_rc="$4" log="$5" out="$6"
  : >"$log"
  printf '%s\n' "$REF_LINE" |
    env PATH="$shimdir:/usr/bin:/bin" \
      MATRIX_LOG="$log" \
      MATRIX_FAIL_AT="$fail_at" \
      MATRIX_FAIL_RC="$fail_rc" \
      MATRIX_GRAPHIFY_RC="$graphify_rc" \
      "$HOOK" origin https://example.invalid/repo.git >"$out" 2>&1
  echo "$?"
}

PASS=0

report_arm() {
  local arm="$1" ok="$2" detail="$3" logfile="$4"
  if [ "$ok" = "1" ]; then
    echo "ARM $arm PASS"
    PASS=$((PASS + 1))
  else
    echo "ARM $arm FAIL: $detail"
    if [ -f "$logfile" ]; then
      echo "--- ARM $arm actual log ---"
      cat "$logfile"
      echo "--- end log ---"
    fi
  fi
}

# --- Arm A: checks pass, graphify succeeds -----------------------------------------------
log="$WORKDIR/log-A"
out="$WORKDIR/out-A"
exp="$WORKDIR/exp-A"
rc=$(run_arm "$WITH" "" "" "0" "$log" "$out")
{
  printf '%s\n' "$FIVE_PNPM"
  printf 'graphify update .\n'
  printf 'graphify-stdin-bytes 0\n'
} >"$exp"
ok=1
detail=""
[ "$rc" -eq 0 ] || {
  ok=0
  detail="exit $rc, expected 0"
}
if [ "$ok" = "1" ] && ! diff -q "$exp" "$log" >/dev/null 2>&1; then
  ok=0
  detail="log did not exactly match the expected five-pnpm + graphify + 0-byte-stdin sequence"
fi
if [ "$ok" = "1" ] && ! grep -q "refreshing graphify-out/" "$out"; then
  ok=0
  detail="output missing the 'refreshing graphify-out/' message"
fi
report_arm A "$ok" "$detail" "$log"

# --- Arm B: checks pass, graphify fails ---------------------------------------------------
log="$WORKDIR/log-B"
out="$WORKDIR/out-B"
exp="$WORKDIR/exp-B"
rc=$(run_arm "$WITH" "" "" "7" "$log" "$out")
{
  printf '%s\n' "$FIVE_PNPM"
  printf 'graphify update .\n'
  printf 'graphify-stdin-bytes 0\n'
} >"$exp"
ok=1
detail=""
[ "$rc" -eq 0 ] || {
  ok=0
  detail="exit $rc, expected 0"
}
if [ "$ok" = "1" ] && ! diff -q "$exp" "$log" >/dev/null 2>&1; then
  ok=0
  detail="log did not exactly match arm A's expected sequence"
fi
if [ "$ok" = "1" ] && ! grep -q "exited 7" "$out"; then
  ok=0
  detail="output missing 'exited 7'"
fi
report_arm B "$ok" "$detail" "$log"

# --- Arm C: checks pass, graphify missing (with negative control) ------------------------
log="$WORKDIR/log-C"
out="$WORKDIR/out-C"
exp="$WORKDIR/exp-C"
ok=1
detail=""
if PATH="$WITHOUT:/usr/bin:/bin" command -v graphify >/dev/null 2>&1; then
  ok=0
  detail="ARM C VOID: graphify resolves under the arm PATH"
  echo "ARM C VOID: graphify resolves under the arm PATH"
fi
if [ "$ok" = "1" ]; then
  rc=$(run_arm "$WITHOUT" "" "" "0" "$log" "$out")
  printf '%s\n' "$FIVE_PNPM" >"$exp"
  [ "$rc" -eq 0 ] || {
    ok=0
    detail="exit $rc, expected 0"
  }
  if [ "$ok" = "1" ] && ! diff -q "$exp" "$log" >/dev/null 2>&1; then
    ok=0
    detail="log did not exactly match the expected five-pnpm-only sequence"
  fi
  if [ "$ok" = "1" ] && ! grep -q "graphify not found on PATH" "$out"; then
    ok=0
    detail="output missing 'graphify not found on PATH'"
  fi
fi
report_arm C "$ok" "$detail" "$log"

# --- Arm D: `lint` fails -------------------------------------------------------------------
log="$WORKDIR/log-D"
out="$WORKDIR/out-D"
exp="$WORKDIR/exp-D"
rc=$(run_arm "$WITH" "lint" "3" "0" "$log" "$out")
printf 'pnpm codecheck\npnpm lint\n' >"$exp"
ok=1
detail=""
[ "$rc" -eq 3 ] || {
  ok=0
  detail="exit $rc, expected exactly 3"
}
if [ "$ok" = "1" ] && ! diff -q "$exp" "$log" >/dev/null 2>&1; then
  ok=0
  detail="log did not stop exactly at 'pnpm codecheck' then 'pnpm lint'"
fi
report_arm D "$ok" "$detail" "$log"

# --- Arm E: `find-deadcode` fails ----------------------------------------------------------
log="$WORKDIR/log-E"
out="$WORKDIR/out-E"
exp="$WORKDIR/exp-E"
rc=$(run_arm "$WITH" "find-deadcode" "5" "0" "$log" "$out")
printf '%s\n' "$FIVE_PNPM" >"$exp"
ok=1
detail=""
[ "$rc" -eq 5 ] || {
  ok=0
  detail="exit $rc, expected exactly 5"
}
if [ "$ok" = "1" ] && ! diff -q "$exp" "$log" >/dev/null 2>&1; then
  ok=0
  detail="log did not exactly match the expected five-pnpm-only sequence (graphify must not run)"
fi
report_arm E "$ok" "$detail" "$log"

echo "${PASS}/5 arms PASS"
[ "$PASS" -eq 5 ] && exit 0 || exit 1
