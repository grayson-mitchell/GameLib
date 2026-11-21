---
status: diagnosed
phase: 84-logger
source: [84-VERIFICATION.md]
started: 2026-11-21T09:40:00Z
updated: 2026-11-21T17:46:36.299Z
---

## Current Test

[testing complete]

## Tests

### 1. Windows and unix CI legs (Windows rotation with a held .old, Windows paths, unix 0600 on CI, win32 clippy ceiling, jest on ubuntu)
expected: All three rust-test.yml legs and test.yml green on a pushed head
result: issue
reported: "pass" (the operator read the expected line as already met; no Phase 84 head had been pushed). Measured on pushed head 44e0c7a24: rust-test.yml macos-latest and ubuntu-latest green, windows-latest FAILED gamelib-log golden case chunks-wine-header (left `${LOGDIR}/games/Game Name_gog\launch.log`, right `.../Game Name_gog/launch.log`); test.yml red only on Phase 85-02's meta/__tests__/storeCorpus.test.ts (edge_crlf.json hash, not Phase 84), all 1120 other suites green
severity: major

### 2. Live smoke:exit-check
expected: `pnpm smoke:exit-check` in live mode reports PASS against a running app quit with Cmd+Q
result: pass
evidence: operator run 2026-11-22, shell pid 77607, sidecar pid 79702, `sidecarExitCheck [live]: PASS (exit latency 0 ms)`, survivors [], vite []

### 3. Accept or amend the two live-contract defects recorded by 84-11 (UAT item 4 header premise; item 7 crate-origin wording)
expected: Item 4: the contract names the header a GOG launch really writes, or picks a runWineCommand path. Item 7: the origin rule excludes the three `[steam*] rust <channel>` templates. Neither changes a Phase 84 code path
result: issue
reported: "test 3 amend" then "agree with both" (operator chose amendment over accepting as scored; accuracy is the stated preference)
severity: minor

### 4. Triage the 11 open code-review findings in 84-REVIEW-DISPOSITION.md (WR-01..WR-07, IN-01..IN-04)
expected: Each set to fixed, skipped or deferred. WR-02 (raw CR/LF on shell and crate-bridge lines, now in the uploaded file) and WR-03 (store persist can truncate the live file before Phase 85 widens it) are the two the reviewer flags as needing a fix before the next phase
result: issue
reported: "fix all" (all 11 findings, WR-01..WR-07 and IN-01..IN-04, dispositioned fix; none skipped or deferred)
severity: major

### 5. Accept that delete-uploaded has no UI control
expected: Criterion 2's "from the UI" is read as met for upload and show-in-folder (live) and for delete-uploaded by the localhost round-trip test, because the delete button was already commented out before Phase 84 and dpaste.com has no delete endpoint
result: pass

## Summary

total: 5
passed: 2
issues: 3
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-84-1
  truth: "All three rust-test.yml legs and test.yml green on a pushed head"
  status: failed
  reason: "CI on pushed head 44e0c7a24: cargo-test (windows-latest) failed gamelib-log tests/golden.rs rust_writer_matches_the_ts_golden, case chunks-wine-header (run 44930097851)"
  severity: major
  test: 1
  root_cause: "Test harness, not the writer: tokenise() in src-tauri/crates/gamelib-log/tests/golden.rs ends the ${LOGDIR} path at the first whitespace before normalising backslashes, and the case's game folder `Game Name_gog` has a space, so on Windows only the part before the space is normalised. The writer itself emits a consistent native path. macOS/Linux never produce backslashes, so only the windows leg sees it."
  artifacts:
    - path: "src-tauri/crates/gamelib-log/tests/golden.rs"
      issue: "tokenise() path end uses c.is_whitespace(); a path containing a space keeps raw backslashes after the space"
  missing:
    - "End the tokenised path at a line break or quote, not any whitespace (every ${LOGDIR} path in the goldens runs to end of line), then re-prove the windows leg on a pushed head"
  debug_session: ""

- gap_id: G-84-3
  truth: "The 84-HUMAN-UAT.md live contract states what the code really emits: item 4 names the preamble a GOG launch writes; item 7's crate-origin rule classifies lines by their real emitter"
  status: failed
  reason: "User reported: test 3 amend; agreed with the recommended amendment for both items"
  severity: minor
  test: 3
  root_cause: "Contract wording, not code. Item 4 assumed every Wine launch writes `Wine Command:`, but only runWineCommand callers passing logWriters write it (src/backend/commandRunner.ts:342); a GOG launch goes through runRunnerCommand (src/backend/storeManagers/gog/games.ts:938) and never has, including pre-84 logs. Item 7's rule (message text found by no grep -rnF over src/backend) misclassifies TS logDebug template lines `[steampoll|steamfiles|steamcm] rust ${channel}` (rustSteamPoll.ts:24, rustSteamFiles.ts:19, rustSteamCm.ts:24) as crate-origin."
  artifacts:
    - path: ".planning/phases/84-logger/84-HUMAN-UAT.md"
      issue: "item 4 header clause names `Wine Command:`; item 7 origin rule is a negative grep"
  missing:
    - "Item 4: replace the header clause with the preamble a GOG launch really writes (Wine-engine launches: an `engine=<engine> build=<build> reason=<reason>` INFO line, then `Launching \"<title>\" (<runner>)`), keep the End-of-log, cmp, rotation and `lines dropped` clauses, and cite the gamelib-log golden case chunks-wine-header as the byte-exact proof of `Wine Command:` header ordering. Do not switch item 4 to a runWineCommand path"
    - "Item 4: re-score from the existing launch-2 captures (game-launch-1.log, gamelib-launch-2.log); no new live run"
    - "Item 7: replace the negative-grep origin rule with a positive emitter list: a line is crate-origin only when it carries one of the Rust log/tracing bridge targets (steam_vent, reqwest, ...), so the three TS `[steam*] rust <channel>` templates are excluded by construction; re-score item 7 against the same launch-4 capture"
    - "Optional, same file: fix the item 8 order note (code logs `exit finished in` before `still running at exit deadline:`)"
  debug_session: ""

- gap_id: G-84-4
  truth: "Every 84-REVIEW.md finding (WR-01..WR-07, IN-01..IN-04) is fixed and 84-REVIEW-DISPOSITION.md records each as fixed"
  status: failed
  reason: "User reported: fix all"
  severity: major
  test: 4
  root_cause: "Confirmed defects in Phase 84 code, each diagnosed with file, line and fix in 84-REVIEW.md (the review is the diagnosis)."
  artifacts:
    - path: "src-tauri/crates/gamelib-core/src/store.rs"
      issue: "WR-03 persist_atomic falls through to a truncating direct write when the temp write failed"
    - path: "src-tauri/src/log_upload.rs"
      issue: "WR-07 validate_paste_url returns the raw text, not the parsed URL"
    - path: "src-tauri/crates/gamelib-log/src (prefix/bridge/sanitize/writer/limiter/frame)"
      issue: "WR-02 raw CR/LF on shell and crate-bridge lines; WR-04 renderer objects skip the LOG_TEXT_MAX cut; WR-05 rotation claim consumed by a dropped entry; IN-01 drop report counts messages as lines; IN-02 limiter keyed on unclamped sender ts; IN-03 install_bridges false is silent"
    - path: "src/backend/logger/forwarder.ts, src/backend/logger/targetWriter.ts"
      issue: "WR-01 one malformed entry rejects the whole frame (sanitise at the producer); WR-05 producer half; WR-06 flush chain wait unbounded"
    - path: "src-tauri/crates/gamelib-core/src/shutdown.rs, src-tauri/src/main.rs"
      issue: "IN-04 finish flushes for a duration computed before its own work; pass a deadline Instant"
  missing:
    - "Apply each fix as specified in 84-REVIEW.md with a regression test per finding, and set each 84-REVIEW-DISPOSITION.md row to fixed with its commit"
    - "ORDER: WR-03 (store.rs) and WR-07 (log_upload.rs) land first, in their own plan, because Phase 85 plan 85-06's precondition refuses to run while any unexecuted Phase 84 gap-closure plan modifies either file, and Phase 85 is executing concurrently"
    - "Do not touch Phase 85 files or its in-flight working tree"
  debug_session: ""
