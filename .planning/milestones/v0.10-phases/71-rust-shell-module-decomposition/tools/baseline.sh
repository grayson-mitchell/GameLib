#!/usr/bin/env bash
# baseline.sh capture LABEL | compare BEFORE AFTER [--allow-new-tests]
# Phase 71 wave-boundary baseline (RESEARCH Pitfall 14). Writes/reads ../baselines/LABEL/.
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
TOOLS="$ROOT/.planning/phases/71-rust-shell-module-decomposition/tools"
BASES="$ROOT/.planning/phases/71-rust-shell-module-decomposition/baselines"

suite_list() {
  { grep -rlE "testUtils/tauriShellSource|src-tauri/src/(store_embed|ipc_contract|macos_epic_embed)" src meta --include='*.test.ts' || true
    echo src/backend/__tests__/macosEpicEmbedSource.test.ts
    echo src/backend/__tests__/macosEpicEmbedDiagPersistence.test.ts
    echo src/backend/__tests__/dummyStoreHarnessContainment.test.ts
    echo meta/__tests__/captureShellScrollback.test.ts
  } | sort -u
}

cargo_run() { # $1 = outfile for raw output
  (cd "$ROOT/src-tauri" && cargo test --bin gamelib-shell 2>&1 | tee "$1" >/dev/null) || true
}
parse_cargo() { # $1 raw -> "passed=N failed=N ignored=N"
  grep -m1 '^test result:' "$1" | sed -E 's/.* ([0-9]+) passed; ([0-9]+) failed; ([0-9]+) ignored.*/passed=\1 failed=\2 ignored=\3/'
}
clippy_run() { # $1 = outfile ; prints exit code in file's last line
  local T; T=$(mktemp -d)
  (cd "$ROOT/src-tauri" && cargo +1.99.1 clippy --workspace --all-targets --message-format=json > "$T/c.json" 2>"$T/err") || { cat "$T/err" >&2; }
  local rc=0
  (cd "$ROOT/src-tauri" && node ../meta/clippyRatchet.cjs "$T/c.json" --list) > "$1" 2>&1 || rc=$?
  echo "exit=$rc" >> "$1"
}
jest_run() { # $1 = outdir ; writes suites + summary
  local T; T=$(mktemp -d)
  suite_list > "$1/jest-suites.txt"
  (cd "$ROOT" && xargs npx jest --silent --json --outputFile="$T/j.json" --runTestsByPath < "$1/jest-suites.txt" >/dev/null 2>&1) || true
  node -e '
    const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
    const f=[];for(const s of j.testResults)for(const a of s.assertionResults)if(a.status==="failed")f.push(s.name.replace(process.argv[2]+"/","")+" :: "+a.fullName);
    f.sort();
    console.log("suites="+j.numTotalTestSuites+" passed="+j.numPassedTests+" failed="+j.numFailedTests);
    for(const x of f)console.log("FAIL "+x);
  ' "$T/j.json" "$ROOT" > "$1/jest-summary.txt"
}

capture() {
  local L=$1 D="$BASES/$1"
  if [ -n "$(git -C "$ROOT" status --porcelain -- src-tauri/src src/backend meta)" ]; then
    echo "REFUSE: src-tauri/src, src/backend or meta is dirty; BASE_REF would not describe the measured tree" >&2; exit 1
  fi
  mkdir -p "$D"
  git -C "$ROOT" rev-parse HEAD > "$D/BASE_REF"
  local RAW; RAW=$(mktemp)
  cargo_run "$RAW"
  { grep -m1 '^test result:' "$RAW"; parse_cargo "$RAW"; } > "$D/cargo-summary.txt"
  (cd "$ROOT/src-tauri" && cargo test --bin gamelib-shell -- --list 2>/dev/null) | grep ': test$' | sed 's/: test$//; s/^.*:://' | sort > "$D/cargo-names.txt"
  clippy_run "$D/clippy-list.txt"
  jest_run "$D"
  python3 "$TOOLS/sizes.py" > "$D/sizes.txt" || true
  (cd "$ROOT" && find src-tauri/src -name '*.rs' | sort) > "$D/shell-files.txt"
  echo "captured $L at $(cat "$D/BASE_REF")"
  cat "$D/cargo-summary.txt"; head -1 "$D/jest-summary.txt"; tail -1 "$D/clippy-list.txt"
}

compare() {
  local B="$BASES/$1" A="$BASES/$2" allow=${3:-} rc=0
  chk() { if [ "$1" = ok ]; then echo "PASS $2"; else echo "FAIL $2 $3"; rc=1; fi; }
  num() { sed -E "s/.*$2=([0-9]+).*/\1/" <<<"$(sed -n 2p "$1/cargo-summary.txt")"; }
  local bp ap af bi ai
  bp=$(num "$B" passed); ap=$(num "$A" passed); af=$(num "$A" failed); bi=$(num "$B" ignored); ai=$(num "$A" ignored)
  [ "$ap" -ge "$bp" ] && chk ok "cargo passed $ap >= $bp" || chk bad "cargo passed" "$ap < $bp"
  [ "$af" -eq 0 ] && chk ok "cargo failed 0" || chk bad "cargo failed" "$af"
  [ "$bi" -eq "$ai" ] && chk ok "cargo ignored $ai" || chk bad "cargo ignored" "$bi -> $ai"
  local miss; miss=$(comm -23 "$B/cargo-names.txt" "$A/cargo-names.txt" | head -5)
  [ -z "$miss" ] && chk ok "no test name lost" || chk bad "test names lost" "$(tr '\n' ' ' <<<"$miss")"
  local added; added=$(comm -13 "$B/cargo-names.txt" "$A/cargo-names.txt" | head -5)
  if [ -z "$added" ]; then chk ok "no test name added"
  elif [ "$allow" = "--allow-new-tests" ]; then chk ok "new tests allowed: $(wc -l <<<"$added" | tr -d ' ')+ added"
  else chk bad "test names added" "$(tr '\n' ' ' <<<"$added")"; fi
  # locations (file:line:col) move with the code; compare lint + message only
  diff <(sed -E 's/^[^ ]+ //' "$B/clippy-list.txt" | sort) <(sed -E 's/^[^ ]+ //' "$A/clippy-list.txt" | sort) >/dev/null \
    && chk ok "clippy list identical (locations ignored)" || chk bad "clippy list differs" ""
  [ "$(tail -1 "$A/clippy-list.txt")" = "exit=0" ] && chk ok "clippy exit 0" || chk bad "clippy exit" "$(tail -1 "$A/clippy-list.txt")"
  diff <(grep '^FAIL ' "$B/jest-summary.txt" || true) <(grep '^FAIL ' "$A/jest-summary.txt" || true) >/dev/null \
    && chk ok "jest failing set identical" || chk bad "jest failing set differs" ""
  local bjp ajp
  bjp=$(head -1 "$B/jest-summary.txt" | sed -E 's/.*passed=([0-9]+).*/\1/'); ajp=$(head -1 "$A/jest-summary.txt" | sed -E 's/.*passed=([0-9]+).*/\1/')
  [ "$ajp" -ge "$bjp" ] && chk ok "jest passed $ajp >= $bjp" || chk bad "jest passed" "$ajp < $bjp"
  return $rc
}

case "${1:-}" in
  capture) capture "$2" ;;
  compare) shift; compare "$@" ;;
  *) echo "usage: baseline.sh capture LABEL | compare BEFORE AFTER [--allow-new-tests]" >&2; exit 2 ;;
esac
