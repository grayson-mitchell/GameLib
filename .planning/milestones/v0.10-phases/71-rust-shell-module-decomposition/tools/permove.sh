#!/usr/bin/env bash
# permove.sh LABEL WAVE [--include-tests]   -- D-03 per-move gate
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
P="$ROOT/.planning/phases/71-rust-shell-module-decomposition"
L=$1; W=$2; shift 2
BASE="$P/baselines/$L"
want=$(sed -n 2p "$BASE/cargo-summary.txt" | sed -E 's/.*passed=([0-9]+).*/\1/')
RAW=$(mktemp)
(cd "$ROOT/src-tauri" && cargo test --bin gamelib-shell 2>&1 | tee "$RAW" >/dev/null) || true
line=$(grep -m1 '^test result:' "$RAW" || true)
[ -n "$line" ] || { echo "FAIL cargo test produced no result"; tail -20 "$RAW"; exit 1; }
passed=$(sed -E 's/.* ([0-9]+) passed.*/\1/' <<<"$line"); failed=$(sed -E 's/.* ([0-9]+) failed.*/\1/' <<<"$line")
[ "$failed" -eq 0 ] || { echo "FAIL cargo failed=$failed"; exit 1; }
[ "$passed" -ge "$want" ] || { echo "FAIL cargo passed $passed < baseline $want"; exit 1; }
echo "cargo: passed=$passed (baseline $want) failed=0"
T=$(mktemp -d)
(cd "$ROOT/src-tauri" && cargo +1.99.1 clippy --workspace --all-targets --message-format=json > "$T/c.json" 2>"$T/err") || { cat "$T/err" >&2; }
(cd "$ROOT/src-tauri" && node ../meta/clippyRatchet.cjs "$T/c.json" --list) >/dev/null || { echo "FAIL clippy ratchet"; exit 1; }
echo "clippy ratchet: PASS"
python3 "$P/tools/moveproof.py" --base "$(cat "$BASE/BASE_REF")" --wave "$W" "$@"
echo "PERMOVE PASS"
