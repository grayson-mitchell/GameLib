#!/usr/bin/env bash
# jestpins.sh FILE...  -- run source-text jest pins; only failures listed in known-jest-failures.txt are tolerated
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
KNOWN="$ROOT/.planning/phases/71-rust-shell-module-decomposition/tools/known-jest-failures.txt"
T=$(mktemp -d)
(cd "$ROOT" && npx jest --silent --json --outputFile="$T/j.json" --runTestsByPath "$@" >/dev/null 2>&1) || true
node -e '
  const fs=require("fs");const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  const known=new Set(fs.readFileSync(process.argv[2],"utf8").split("\n").filter(Boolean));
  const ran=j.numPassedTests+j.numFailedTests; let unknown=0;
  for(const s of j.testResults)for(const a of s.assertionResults)if(a.status==="failed"&&!known.has(a.fullName)){console.log("UNKNOWN FAIL "+a.fullName);unknown++;}
  console.log("passed="+j.numPassedTests+" failed="+j.numFailedTests+" unknown-failures="+unknown);
  if(ran===0){console.log("FAIL 0 tests ran");process.exit(1)}
  process.exit(unknown?1:0)
' "$T/j.json" "$KNOWN"
