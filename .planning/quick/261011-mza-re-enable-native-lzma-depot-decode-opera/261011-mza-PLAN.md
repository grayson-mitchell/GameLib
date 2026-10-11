---
phase: quick-261011-mza
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/depot/lzmaLoader.ts
  - src/backend/storeManagers/steam/__tests__/decompressPool.test.ts
  - src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts
  - .planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/measure-selftest.ts
  - .planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/measurement/
  - .planning/todos/pending/2026-10-08-native-lzma-decode-reenable-or-delete-needs-operator-decision.md
  - .planning/todos/completed/2026-10-08-native-lzma-decode-reenable-or-delete-needs-operator-decision.md
  - .planning/todos/pending/2026-10-11-native-lzma-mac-live-steam-depot-install-and-throughput-remeasure.md
  - .planning/debug/resolved/sea-native-lzma-real-chunk-decode-hang.md
  # CONDITIONAL on Task 2's observation (at most one of these two is created; see Task 3):
  - .planning/todos/pending/2026-10-11-win32-sea-native-lzma-falls-back-liblzma-dll-not-embedded.md
  - .planning/todos/pending/2026-10-11-win32-sea-native-lzma-temp-addon-left-in-tmpdir.md
autonomous: true
requirements:
  - QUICK-261011-mza

estimate:
  tokens: 60000
  raw_tokens: 60000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "HEAD ships `const NATIVE_LZMA_DECODE_ENABLED = true` in `lzmaLoader.ts`, and its doc comment says: ON by the operator's 2026-10-11 revision of the 2026-08-18 standing decision (quoted); the 2026-08-18 hang's root cause is still unknown and it reproduced with native OFF, so the switch never guarded against it; what the 2026-10-08 darwin-arm64 measurement did and did not prove; and how to turn the switch back OFF. The constant and `setNativeLzmaDecodeEnabledForTests` both remain, and no native-path code is deleted."
    - "In the SAME commit as the flip: `lzmaNativeSeaRealBuild.test.ts` test 1 asserts `nativeWorkers` equals the pool size; the native test runs (not skipped) and asserts native engaged on every worker AND `decode=ok` / `match=true` in the same run; `decompressPool.test.ts` pins native-by-default and still tests the off path via `setNativeLzmaDecodeEnabledForTests(false)`."
    - "The updated `decompressPool.test.ts` was run RED against the unflipped constant (exactly 2 failures: the default-is-native test and the reset-restores-default test) before the flip, then GREEN after, so the tests are proven to observe the shipped constant."
    - "The off path's runtime `logWarning` names `NATIVE_LZMA_DECODE_ENABLED` and the resolved debug-doc path, describes itself as the operator's off switch, and no longer claims the native binding hangs on real-sized chunks."
    - "A cold-built win32-x64 SEA binary built from committed HEAD was run 20 times (or until its first failure) under a fresh `createFakeHomeProfile()` per run. Every run's `nativeWorkers`, `inlineFallback`, `SELFTEST decode=` line, exit code, wall time, the loader's own log line and the temp-addon count are on disk in the task dir. The result is recorded whatever it is. This is the first win32-x64 real-SEA verification ever (23.1-01 Assumption A2)."
    - "The jest SEA suite was attempted on win32 and its outcome captured. At planning time it cannot run here: `execFileSync('pnpm')` throws ENOENT (pnpm is a `.CMD` shim). That is recorded as a limitation, not dropped."
    - "The 2026-10-08 todo sits in `completed/` with a `## Resolution (2026-10-11)` section. A new pending todo with valid `severity`/`platform`/`ready` keys tracks the operator's Mac live Steam depot install and the native-vs-pure-JS throughput re-measurement. Any win32 defect Task 2 measures has its own pending todo."
    - "No commit stages `.planning/state.json`, `.planning/debug/rust-test-ci-missing-sidecar.md` or `.planning/milestone.lock`."
  artifacts:
    - path: src/backend/storeManagers/steam/depot/lzmaLoader.ts
      provides: "Native decode ON by default; rewritten switch doc comment with turn-off steps; honest off-path warning"
      contains: "const NATIVE_LZMA_DECODE_ENABLED = true"
    - path: src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts
      provides: "Test 1 asserts nativeWorkers === size; native real-SEA test un-skipped and asserting native engagement"
      contains: "expect(stats.nativeWorkers).toBe(stats.size)"
    - path: src/backend/storeManagers/steam/__tests__/decompressPool.test.ts
      provides: "Default-on pin + off path tested via the test-only override"
      contains: "setNativeLzmaDecodeEnabledForTests(false)"
    - path: .planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/measure-selftest.ts
      provides: "Win32-capable port of the 261008-jvw fake-HOME self-test driver (os-module snapshot, temp-addon count)"
    - path: .planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/measurement/native-win32-driver.txt
      provides: "Per-run table + RESULT line for the win32-x64 native-ON binary"
    - path: .planning/todos/completed/2026-10-08-native-lzma-decode-reenable-or-delete-needs-operator-decision.md
      provides: "Resolution (2026-10-11) section"
    - path: .planning/todos/pending/2026-10-11-native-lzma-mac-live-steam-depot-install-and-throughput-remeasure.md
      provides: "Operator follow-up tracker (severity/platform/ready keys)"
  key_links:
    - from: "lzmaLoader.ts NATIVE_LZMA_DECODE_ENABLED"
      to: "decompressPool.test.ts default-on test"
      via: "loadLzmaModule() with no override resolves 'native' -- fails if the constant is turned back off without updating the test"
      pattern: "toBe\\('native'\\)"
    - from: "lzmaNativeSeaRealBuild.test.ts test 1"
      to: "DecompressPool.stats().nativeWorkers in the real SEA binary"
      via: "SELFTEST pool= JSON line"
      pattern: "nativeWorkers\\)\\.toBe\\(stats\\.size\\)"
    - from: "measure-selftest.ts"
      to: "src/backend/testUtils/fakeHomeProfile.ts"
      via: "createFakeHomeProfile() per run; childEnv(); dispose() in finally"
      pattern: "createFakeHomeProfile"
    - from: "lzmaLoader.ts switch doc comment + off-path logWarning"
      to: ".planning/debug/resolved/sea-native-lzma-real-chunk-decode-hang.md"
      via: "path reference, which must match lzmaNativeSeaRealBuild.test.ts's (the two are updated together)"
      pattern: "debug/resolved/sea-native-lzma-real-chunk-decode-hang.md"
---

<objective>
Re-enable native LZMA depot decode, which the operator decided on 2026-10-11. Grayson Mitchell
explicitly REVISED the 2026-08-18 standing decision, choosing re-enable over delete: "re-enable it,
I'll do the Mac install after". This decision is locked; do not revisit it, and do not delete any
native-path code.

Three moves:
1. Flip `NATIVE_LZMA_DECODE_ENABLED` to `true` and bring every test and comment that encodes the
   OFF state along in the same commit.
2. Run the first-ever win32-x64 real-SEA verification of the native path.
3. Close the re-enable-or-delete todo and file the operator's Mac follow-up.

Purpose: Phase 23.1's native decode has been dormant since 2026-08-18. The 2026-08-18 hang
reproduced with native OFF, so it was codec-independent and the switch never guarded against it.
The 2026-10-08 measurement (quick 261008-jvw) proved native correct on darwin-arm64.

Out of scope, and owned by the operator via the new todo: the live Steam depot install on the Mac,
and the native-vs-pure-JS throughput re-measurement.

Output: one code+test commit, one measurement commit (driver + captures, no source change), one docs
commit (resolution, move to `completed/`, new todo or todos, debug-doc addendum).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/todos/pending/2026-10-08-native-lzma-decode-reenable-or-delete-needs-operator-decision.md

Load `Skill("gamelib-conventions")` before Task 1. Every task here touches one of its rules: a
`<verify>` prettier check, a child-process spawn, a `pending/` todo.

Read only the named ranges:
- `.planning/todos/completed/2026-10-05-native-lzma-depot-decode-is-switched-off-with-no-tracking-todo.md`, from `## Resolution (2026-10-08)` to the end. It holds the measurement table, "What is NOT claimed", the non-recurrence tally, the spike-023 vs `b79765af2` tension, and the three re-enable criteria.
- `src/backend/storeManagers/steam/depot/lzmaLoader.ts` L44-160: the switch doc comment, the constant at L97, the override, and the reset comment at L154-158. Also L345-391: the off-path `logWarning` array at L349-365 and the native-engaged `logInfo` at L377-390.
- `src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts`, the whole file (449 lines). Header L44-61; test 1 comment + body L202-251; test 2 comment + name L253-330; native test comment + body L332-449.
- `src/backend/storeManagers/steam/__tests__/decompressPool.test.ts` L784-995: the loader describe's stale header comment at L799-809, and the switch describe at L929-995.
- `.planning/quick/261008-jvw-measure-native-lzma-decode-in-a-real-sea/measure-selftest.ts`: the driver to port.

Facts measured at planning time (2026-10-11, HEAD `165103156`, this win32-x64 Windows 11 box, Node v24.19.0). Rely on these; re-check only where a step says so.
- **Planner contribution checkpoints were skipped:** api-coverage, assumption-delta and schema-gate are phase-oriented detectors keyed on a ROADMAP phase, and this quick task has none. No COVERAGE.md and no assumption-delta decision were produced.
- **Tracer-first was not applied.** The architecture is existing and proven. The only true end-to-end slice is Task 2's real-SEA run, which must follow the commit it measures.
- Working tree: only `.planning/state.json` (M), `.planning/debug/rust-test-ci-missing-sidecar.md` (??) and `.planning/milestone.lock` (??) are dirty. None of them belong to this task. Files are LF in the working tree (0 CRs in `lzmaLoader.ts`), so `$`-anchored greps are valid.
- The only kill-switch-state references under `src/`+`meta/` are in the three Task 1 files. A grep for gated off / kill switch / `NATIVE_LZMA_DECODE` / "decoder engaged" elsewhere hits only an unrelated `tauriShellSource.test.ts` comment about a different switch. No test asserts the `logInfo` native-engaged text. `decompressPool.test.ts` L964-969 asserts three things on the off-path warning: it matches `/NATIVE_LZMA_DECODE_ENABLED/`, it matches `/sea-native-lzma-real-chunk-decode-hang\.md/`, and it does NOT match the import-failure phrase. The pool is constructed only per install (`depot.ts:2243`) and in the self-test, never at sidecar boot, so `smoke:sidecar` is unaffected by the flip.
- Unit baseline on this box:
  - `npx jest --testPathPattern 'steam/__tests__/(lzmaNativeBinding|decompressPool|decompressWorkerRealBuild|withTimeout)\.test'`: 4 suites PASS.
  - `lzmaNativeBinding` + `decompressPool` alone: 54/54. The override(true) native-adapter tests pass here, so `lzma-native` loads in jest on win32 from `node_modules`.
  - `depot.test.ts` 14/207 and `depotLinktarget.test.ts` 1/7 FAIL at baseline. These are pre-existing Windows failures: POSIX exec-bit chmod and symlink resolution, nothing to do with LZMA.
- `npx prettier --file-info` reports `{ "ignored": false, "inferredParser": "typescript" }` for all three Task 1 files, and `--check` over them is green at baseline. Every `.planning/` path reports `{ "ignored": true, "inferredParser": null }`, including `measure-selftest.ts` in this task dir.
- **The jest SEA suite cannot run on win32 as written.** `node -e "require('child_process').execFileSync('pnpm',['--version'])"` throws `ENOENT`, because `pnpm` here is `C:\Program Files\nodejs\pnpm.CMD` and libuv only appends `.com`/`.exe`. `npx jest --testPathPattern lzmaNativeSeaRealBuild` fails in 2.7 s with "Test suite failed to run / Converting circular structure to JSON": jest-worker cannot serialize the ENOENT error, no build happens, and the binary is untouched. This suite is part of the pre-existing Windows failure baseline. It DOES run in CI: `.github/workflows/test.yml` runs `pnpm test:ci` on ubuntu-latest with no ignore pattern. After this commit, CI's next run is the first linux-x64 real-SEA run with native ON.
- **`pnpm build:sidecar-sea` has worked on this box before.** `src-tauri/binaries/gamelib-sidecar-x86_64-pc-windows-msvc.exe` exists (120,675,328 bytes, 2026-09-07). The native host build uses `process.execPath` as its base binary (no download), and macOS codesign is gated off on win32. The binary and `build/` are gitignored. Cold outputs are the six `build:sidecar-sea` products: `build/main/sidecar.js`, `build/main/sidecar-sea-bundle.js` (currently ABSENT on disk), `build/main/decompressWorker-sea-bundle.js`, `build/sea-config.json`, `build/sidecar-prep.blob`, and `src-tauri/binaries/gamelib-sidecar-x86_64-pc-windows-msvc.exe`. Never delete `build/` wholesale; it holds `locales`, `renderer`, `assets`, icons and `bin` that this build does not regenerate. Never delete `build/main/decompressWorker.js`, which is the dev worker.
- **PREDICTION for Task 2 (static evidence, not yet a runtime fact).** On win32-x64 the native path will most likely NOT engage inside the SEA.
  - The win32-x64 prebuild dir holds `node.napi.node` (815,616 B) plus a separate `liblzma.dll` (150,528 B). The DLL names in `node.napi.node` are exactly `KERNEL32.dll` and `liblzma.dll`, so it imports liblzma dynamically.
  - The darwin-arm64 and linux-x64 prebuilds have no sibling library (liblzma statically linked).
  - `meta/buildSidecarSea.ts` embeds only `node.napi.node` (`LZMA_NATIVE_ADDON_FILENAME`, L239). `lzmaNativeBinding.ts` extracts that one file to `os.tmpdir()` and `process.dlopen`s it.
  - Windows resolves the import from the addon's own directory (`%TEMP%`), the system dirs, the CWD, then PATH. `where liblzma.dll` finds nothing.
  - Expected outcome: dlopen fails, the loader logs its import-failure `logWarning`, it falls back to pure-JS (it never rejects), and the self-test reports `nativeWorkers:0` with `decode=ok`.
  - Task 2 must measure this rather than assume it. Task 3 files a todo for whichever win32 defect is actually observed.
- `os.tmpdir()` here is `C:\Users\grays\AppData\Local\Temp`. It holds 0 `gamelib-lzma-native-*.node` files at planning time. `createFakeHomeProfile()` does not redirect TEMP/TMP, so the SEA's temp addon lands in the real tmpdir. On the dlopen SUCCESS path, `lzmaNativeBinding.ts` L234-242 swallows the `rmSync` failure that Windows raises for a mapped DLL. If native engages on win32, every worker of every sidecar process would leave an ~815 KB `.node` behind.
- No process-name check was needed at planning time. On Windows a running sidecar locks its `.exe`, so Task 2 checks first.
- Python: `py -3` works (3.12.10). `py -3 .planning/todos/todo-frontmatter-gate.py` is OK at baseline: 19 pending todos.

Operator-memory notes for the executor:
- Revert a file with `git show HEAD:path > path`, never `git checkout -- path`. The husky post-checkout hook runs `pnpm i`.
- Do not write lines containing a backslash through the Bash tool (sed/heredoc/node -e strings). The backslash gets stripped on this box. Use the Edit/Write tools for any such line.
- Stage explicit paths only (never `git add -A` / `git add .`), and check `git diff --cached --name-only` before every commit.
- End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Stay on branch `quick-261002-b63`. No worktree, no push.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Flip NATIVE_LZMA_DECODE_ENABLED to true, with every OFF-state test and comment moving in the same commit</name>
  <files>src/backend/storeManagers/steam/depot/lzmaLoader.ts, src/backend/storeManagers/steam/__tests__/decompressPool.test.ts, src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts</files>
  <behavior>
    - decompressPool.test.ts, switch describe, no override: loadLzmaModule() resolves, lzmaDecoderKind() is 'native', logInfo is called exactly once and logWarning never. This pins the shipped default.
    - With setNativeLzmaDecodeEnabledForTests(false): logWarning fires exactly once, its text matches /NATIVE_LZMA_DECODE_ENABLED/ and /sea-native-lzma-real-chunk-decode-hang\.md/, it does not match the import-failure phrase, and logInfo is never called.
    - With setNativeLzmaDecodeEnabledForTests(false): a real VZ chunk decodes byte-exact AND lzmaDecoderKind() is 'pure-js'. Asserting the kind keeps the round-trip from passing vacuously on native.
    - setNativeLzmaDecodeEnabledForTests(false) gives 'pure-js'; then resetLzmaLoaderForTests() plus a fresh load gives 'native', the shipped default.
    - RED expectation, with tests edited and the constant still false: exactly 2 failures, the no-override test and the reset-restores-default test. Any other count means a test does not observe what it claims. Stop and investigate before flipping.
  </behavior>
  <action>
Implements the operator's 2026-10-11 revision (re-enable, not delete). Change only these three files.
Do not touch `lzmaNativeBinding.ts`, `meta/`, `package.json` or the lockfile.

STEP 1, tests first (RED), in `decompressPool.test.ts`.
- Rewrite the switch describe at L929-995. Rename the describe and its header comment from "default-off" to describe the current state: default ON since the 2026-10-11 operator revision, with the off path still tested through the test-only override.
- Implement the four behaviors above, reusing the existing fixtures and helpers (`compressAsync`, `buildVZChunk`, `decompressChunk`, `mockedLogger`). Do not add new ones.
- Rewrite the stale header comment at L799-809 in the loader describe so it says this: native is the shipped default, and these tests set the override to `true` explicitly so they keep proving the adapter even if the switch is ever turned back off.
- Leave the existing override(true) test bodies and names alone.
- Run the RED command in `<verify>` and keep its output for the SUMMARY.

STEP 2, the flip (GREEN), in `lzmaLoader.ts`.
- Set the constant at L97 to `true`. Keep the name, the `let` override, `isNativeLzmaDecodeEnabled()` and `setNativeLzmaDecodeEnabledForTests`. Delete nothing on the native path.
- Rewrite the doc comment at L44-96 as prose, in this order:
  - (a) Status: ON since 2026-10-11, by the operator revising the 2026-08-18 standing decision. Quote "re-enable it, I'll do the Mac install after".
  - (b) History, kept short: native was gated off on 2026-08-18 after a real-sized decode timed out inside a real SEA binary with native engaged. Then the CRITICAL CORRECTION: the same timeout reproduced with native OFF (`nativeWorkers:0`), so the hang was codec-independent and this switch never guarded against it. The debug doc is resolved as `closed_unreproduced` with the root cause still UNKNOWN. Non-recurrence (40/40 on 2026-08-18, 20/20 on 2026-09-12, 20/20 on 2026-10-08) is not a cause. Keep the resolved debug-doc path verbatim.
  - (c) Evidence: quick 261008-jvw (2026-10-08) ran 20/20 at `nativeWorkers:2` with `decode=ok match=true` on darwin-arm64, with `b79765af2` in the build. That proved correctness for the self-test's synthetic 64 KiB VZ chunk on one machine. It did NOT prove real depot bytes, other platforms, or speed. The ~5.8-6.6x figure has not been re-measured through the post-`b79765af2` adapter (the spike-023 tension).
  - (d) Win32 caveat, a static fact measured 2026-10-11: the win32-x64 prebuild imports a separate `liblzma.dll` that the SEA does not embed. The runtime outcome is in quick 261011-mza's SUMMARY. Point at that file; do not put numbers in the comment.
  - (e) Still owed: the operator's live Steam depot install on the Mac plus the throughput re-measurement, tracked by `.planning/todos/pending/2026-10-11-native-lzma-mac-live-steam-depot-install-and-throughput-remeasure.md`.
  - (f) HOW TO TURN IT BACK OFF. First, capture diagnostics at the moment of the field failure; that run is the only evidence the 2026-08-18 closure asked for. Then set the constant to false, and in the SAME commit:
    - set `lzmaNativeSeaRealBuild.test.ts` test 1's expectation back to zero native workers;
    - re-skip or retarget its native test;
    - flip `decompressPool.test.ts`'s default-is-native test.
    Say plainly that turning native off is the lever for a native-specific failure (dlopen crash, `Data is corrupt` rejections, byte mismatch). It is not expected to cure a pool-timeout hang of the 2026-08-18 kind, which reproduced with native off.
- Update the doc comment on `setNativeLzmaDecodeEnabledForTests`. Its purpose is now proving the OFF path (and the adapter) without changing the shipped default.
- Update the reset comment at L154-158. The safe failure mode is "a test override never leaks into a later test"; the old "never silently stays enabled" no longer fits.
- Rewrite the off-path `logWarning` array at L349-365 to meet all of these:
  - opens with `lzmaLoader: native lzma-native decode is DISABLED`;
  - contains the token `NATIVE_LZMA_DECODE_ENABLED`;
  - says it fires when the constant is false or a test override is set;
  - says this is the operator's off switch, not an import or smoke-test failure;
  - says the shipped default is ON since the 2026-10-11 revision;
  - says the 2026-08-18 hang reproduced with native off;
  - keeps `.planning/debug/resolved/sea-native-lzma-real-chunk-decode-hang.md` as ONE contiguous array element (the test's basename regex depends on that);
  - never uses the import-failure phrase, and no longer claims that the native binding hangs.
- In the native-engaged `logInfo` (L377-390), keep the opening words `lzmaLoader: native lzma-native decoder engaged` byte-identical. The driver and the 261008-jvw captures grep for them. Qualify the speedup clause as the 23.1-01 spike's darwin-arm64 figure, not yet re-measured through the current adapter. This string now ships in every user's log. Do not touch the import-failure `logWarning` or the L1-36 header comment.

STEP 3, the real-build test, in `lzmaNativeSeaRealBuild.test.ts`. This test cannot run on win32; it is verified by tsc/eslint/prettier here and by CI.
- Header L44-53: append a short paragraph. The switch went back ON on 2026-10-11 by operator revision, the root cause is still unknown, and the details are in `lzmaLoader.ts`'s doc comment.
- Test 1 comment (L202-223), name and body:
  - Rename it to say the pool spawns cleanly with native decode engaged on every worker (`inlineFallback=false`, `nativeWorkers=size`).
  - Add an assertion that `stats.size` is greater than 0.
  - Replace the zero-native-workers expectation with `expect(stats.nativeWorkers).toBe(stats.size)`.
  - Rewrite the comment to say what is asserted now and why: the 2026-10-11 flip, and that a SEA load fallback (pure-JS) would turn this red.
- Test 2 (the one named for the gated pure-JS path):
  - Rename it to describe a codec-agnostic real-sized decode check, the recurrence detector for the 2026-08-18 hang. Keep its body.
  - Keep its long historical comment.
  - Append one paragraph: with native ON this binary no longer exercises pure-JS. There is deliberately no env override, so the real-SEA pure-JS path is now covered only at unit level (`decompressPool.test.ts`'s off-path tests and the import-failure fallback tests).
- Native test (L430):
  - Remove the skip modifier.
  - Rename it to drop "SKIPPED BY OPERATOR DECISION". It now states that it decodes a real-sized chunk via the native path, with native engaged on every worker.
  - In the same spawn, also parse the `SELFTEST pool=` line and assert `nativeWorkers` equals `size`, alongside the existing decode/exit assertions. That makes it distinct from test 2, which asserts no codec. This is planner discretion: the un-skipped test should prove native, not merely re-run test 2.
  - Replace the "STAYS SKIPPED 2026-09-12" block (L407-429) with an "UN-SKIPPED 2026-10-11" block. It records the operator revision, that `b79765af2`'s fix is now in the shipping path, and that the 2026-10-08 darwin run passed this test. Keep the long "Extensively isolated" investigation narrative as history.
  - Also fix the stale paragraph claiming a local uncommitted flip is needed to exercise this case.
- Keep every reference to the resolved debug-doc path identical to `lzmaLoader.ts`'s.
- Keep all spawns on `profile.childEnv(...)`; no hand-rolled env.

STEP 4. Run the full `<verify>` block.
- Commit exactly the three files: `feat(steam): re-enable native LZMA depot decode by operator revision (261011-mza)`. The body names the 2026-10-11 revision and the RED/GREEN counts, and ends with the Co-Authored-By line.
- Then run `graphify update .`. `graphify-out/` is gitignored, so nothing is staged.
  </action>
  <verify>
    <automated>RED, before STEP 2, constant still false: npx jest --testPathPattern 'steam/__tests__/decompressPool\.test' 2>&1 | grep -E '^Tests:|✕' (expect exactly 2 failed)</automated>
    <automated>GREEN: npx jest --testPathPattern 'steam/__tests__/(lzmaNativeBinding|decompressPool|decompressWorkerRealBuild|withTimeout)\.test' (4 suites pass, 0 failed)</automated>
    <automated>Windows regression net: npx jest --testPathPattern 'steam/__tests__/(depot|depotLinktarget)\.test' 2>&1 | grep -E '^Tests:' (expect the planning baseline exactly: 15 failed in total, 14 in depot.test.ts and 1 in depotLinktarget.test.ts. Every failing title is a chmod/exec-bit or symlink case. Any new failure, or any title mentioning lzma/decode, blocks the commit)</automated>
    <automated>test "$(grep -c '^const NATIVE_LZMA_DECODE_ENABLED = true$' src/backend/storeManagers/steam/depot/lzmaLoader.ts)" = 1</automated>
    <automated>test "$(grep -v '^\s*//' src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts | grep -c 'test\.skip(')" = 0</automated>
    <automated>test "$(grep -c 'expect(stats.nativeWorkers).toBe(stats.size)' src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts)" -ge 1</automated>
    <automated>pnpm codecheck</automated>
    <automated>npx eslint src/backend/storeManagers/steam/depot/lzmaLoader.ts src/backend/storeManagers/steam/__tests__/decompressPool.test.ts src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts</automated>
    <automated>npx prettier --check src/backend/storeManagers/steam/depot/lzmaLoader.ts src/backend/storeManagers/steam/__tests__/decompressPool.test.ts src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts (all three measured "ignored": false, parser typescript, so this check is real)</automated>
    <automated>after commit: F=$(git show --name-only --format= HEAD) && test "$(printf '%s\n' "$F" | sort | tr '\n' ' ')" = "src/backend/storeManagers/steam/__tests__/decompressPool.test.ts src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts src/backend/storeManagers/steam/depot/lzmaLoader.ts "</automated>
  </verify>
  <done>
- HEAD ships the constant as `true`, with the rewritten doc comment (a)-(f) and the honest off-path warning.
- The RED run showed exactly 2 failures and the GREEN run passes all 4 suites.
- The depot suites' failures are identical to the planning baseline.
- codecheck, eslint and prettier are green.
- The commit contains exactly the three files, and `graphify update .` has run.
  </done>
</task>

<task type="auto">
  <name>Task 2: First win32-x64 real-SEA verification of the native path (cold build, 20 fake-HOME self-test runs, jest attempt)</name>
  <files>.planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/measure-selftest.ts, .planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/measurement/</files>
  <precondition>No `gamelib-sidecar-*` or `tauri` process is running. Check with `tasklist | grep -i -E 'gamelib|tauri' || echo none`. A running sidecar locks the `.exe` on Windows. If one is running, note it and do NOT kill it; stop this task and report.</precondition>
  <action>
This task uses the 261008-jvw discipline unchanged: cold build, fresh fake HOME per run, bounded
driver, no retry of a failed run. The only changes are what win32 needs. Let OUT =
`.planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/measurement`.

STEP 1, port the driver.
- `cp` `.planning/quick/261008-jvw-measure-native-lzma-decode-in-a-real-sea/measure-selftest.ts` into this task dir. Edit the copy with the Edit tool only; the file contains backslash escapes.
- Changes:
  - (a) Header: task id 261011-mza, port note, same two-profile justification. The `decompress-pool` branch never calls `init()`, so isolated-only applies.
  - (b) Fake-HOME prefix `gamelib-261011-mza-`.
  - (c) `systemSnapshot()`: keep the darwin commands under `process.platform === 'darwin'`. Otherwise record node `os` values: platform, release, arch, cpu count and model, totalmem, freemem, uptime. Spawn nothing.
  - (d) Run the stall sampler's `/usr/bin/sample` only on darwin; elsewhere just write the at-stall snapshot.
  - (e) Add a temp-addon count. Count `os.tmpdir()` entries whose name starts with `gamelib-lzma-native-` and ends with `.node`, using `startsWith`/`endsWith` (no regex). Record the count before the first run in the driver txt, and after each run as a new `tmpAddons` column in the table and in each run log.
- Keep everything else: `createFakeHomeProfile()` per run with `dispose()` in `finally`, the 8 s stall timer, the 60 s SIGKILL, break on first failure, and the RESULT line.

STEP 2, cold build.
- Re-run the precondition check.
- Record `git rev-parse HEAD` and `git status --short` in `OUT/build-native-win32.txt`. HEAD must be Task 1's commit, and `src/` must be clean.
- Move the existing `.exe` into the session scratchpad as a backup.
- `rm -f` the other five SEA outputs listed in `<context>`.
- Run `pnpm build:sidecar-sea >> OUT/build-native-win32.txt 2>&1` (timeout 600000).
- All six outputs must exist afterwards; that is the proof the build was cold. Then delete the backup.
- If the build FAILS: restore the backup `.exe`, keep the full build log in OUT, skip STEPs 3-4, and treat "win32 SEA build failed: <error>" as the win32 result. That is a recorded limitation; still do STEP 5 and the commit.

STEP 3, the native arm.
- Run `node meta/runTs.cjs --bundle --platform=node --target=node22 .planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/measure-selftest.ts --label native-win32 --runs 20 --expect-native-workers 2 --out .planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/measurement`.
- 20 runs matches the 2026-10-08 darwin-arm64 native arm and the 2026-09-12 pure-JS arm, so the win32 row in the non-recurrence tally is directly comparable. At ~1.3-3.5 s per run it costs under 2 minutes, and the driver stops at the first failure.
- Then count which loader line each run log carries: `native lzma-native decoder engaged` versus the import-failure warning. Copy the failure warning's `Cause:` text verbatim into the SUMMARY.

STEP 4, branch on what STEP 3 measured. Never retry a failed run.
- (i) 20/20 pass: native engages on win32, and the `liblzma.dll` prediction is refuted. Go to STEP 5.
- (ii) Run 1 fails with `nativeWorkers:0`, `inlineFallback:false`, `decode=ok ... match=true` and exit 0, and the run log carries the import-failure warning. This is a load fallback, not a hang; it is the predicted case. Run a second arm against the SAME binary, without rebuilding: `--label fallback-win32 --runs 20 --expect-native-workers 0`. It measures what Windows users actually get: pure-JS inside a native-ON build, no hang.
- (iii) Any `decode=fail`, a missing decode line, a non-zero exit, a SIGKILL or a stall. This is the fresh recurrence the 2026-08-18 closure asked for. Keep that run's captures, run nothing further, and record it prominently. Do NOT flip the switch back. That is the operator's call, and the SUMMARY must tell them.

STEP 5, the jest attempt and cleanup.
- Run `npx jest --runInBand --testPathPattern lzmaNativeSeaRealBuild > OUT/jest-win32.txt 2>&1`. `--runInBand` surfaces the real error instead of jest-worker's circular-JSON wrapper.
- Planning measured an immediate ENOENT with no build. If it does build, it rebuilds from the same HEAD, which is acceptable; record whatever happens.
- Write `OUT/tmpdir-addons.txt` with the before/after names. Delete ONLY the `gamelib-lzma-native-*.node` files that appeared during this task (in the after list, not in the before list), and record how many were deleted.
- Do not touch the built `.exe`. It stays as the shipped-state build of Task 1's HEAD.

STEP 6, leak-scan, then commit.
- Run the leak scan in `<verify>` over OUT. It must print nothing.
- Commit the driver plus OUT only: `test(quick-261011-mza): first win32-x64 real-SEA native lzma decode measurement`, ending with the Co-Authored-By line. No `src/` change may be in this commit.
  </action>
  <verify>
    <automated>test -f .planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/measurement/native-win32-driver.txt -o -f .planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/measurement/build-native-win32.txt</automated>
    <automated>grep -E '^RESULT label=native-win32 pass=[0-9]+/20' .planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/measurement/native-win32-driver.txt || grep -iE 'COMPILE GATE FAILED|error' .planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/measurement/build-native-win32.txt</automated>
    <automated>if the build succeeded: grep -q 'src matches HEAD' .planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/measurement/native-win32-driver.txt (the driver writes that marker only when `src/` has no diff against HEAD, which proves the measured binary was built from committed HEAD)</automated>
    <automated>test -z "$(grep -rIlE 'refresh_?token|access_?token|galaxyUserId|"userId"|"username"|accountName' .planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/measurement/)"</automated>
    <automated>test -f .planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/measurement/jest-win32.txt && test -f .planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/measurement/tmpdir-addons.txt</automated>
    <automated>after commit: F=$(git show --name-only --format= HEAD) && test -n "$F" && test -z "$(printf '%s\n' "$F" | grep -v '^\.planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/')"</automated>
    <automated>Prettier: omitted by design. Every path this task writes is under `.planning/`, and `npx prettier --file-info .planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/measure-selftest.ts` measured `{ "ignored": true, "inferredParser": null }`, so `--check` would be vacuous. Re-probe that one path with `--file-info` to confirm before omitting.</automated>
  </verify>
  <done>
- The win32 result is on disk and committed, whatever it is: 20/20 native, a load fallback plus the fallback arm, a recurrence, or a build failure.
- So are the jest attempt's output and the temp-addon before/after record.
- Leaked temp addons from this task are removed.
- The leak scan is clean, the commit holds only task-dir paths, and the sidecar `.exe` on disk is the cold build of Task 1's HEAD (or the restored backup if the build failed).
  </done>
</task>

<task type="auto">
  <name>Task 3: Close the re-enable-or-delete todo, file the Mac follow-up (and any measured win32 defect), add a debug-doc addendum</name>
  <files>.planning/todos/pending/2026-10-08-native-lzma-decode-reenable-or-delete-needs-operator-decision.md, .planning/todos/completed/2026-10-08-native-lzma-decode-reenable-or-delete-needs-operator-decision.md, .planning/todos/pending/2026-10-11-native-lzma-mac-live-steam-depot-install-and-throughput-remeasure.md, .planning/debug/resolved/sea-native-lzma-real-chunk-decode-hang.md, CONDITIONAL: .planning/todos/pending/2026-10-11-win32-sea-native-lzma-falls-back-liblzma-dll-not-embedded.md OR .planning/todos/pending/2026-10-11-win32-sea-native-lzma-temp-addon-left-in-tmpdir.md</files>
  <action>
STEP 1, close the decision todo.
- `git mv` the 2026-10-08 todo from `pending/` to `completed/`. Keep its frontmatter; `completed/` is exempt from the gate.
- Append `## Resolution (2026-10-11)`, matching the 2026-10-05 todo's Resolution style (tables, short paragraphs). It covers:
  - the operator decision, quoted verbatim with name and date, as a revision of the 2026-08-18 standing decision;
  - what changed, with Task 1's commit hash: the constant, the two test files, the off-path warning, the doc comment;
  - the three criteria walked again. Criterion 1: operator-waived, root cause still unknown. Criterion 2: darwin 2026-10-08 plus today's win32 result. Criterion 3: test 1 and the native test changed in the flip commit (done); the live Mac install and throughput still open, pointing at the new todo;
  - the win32 measurement table copied from the driver txt, with Task 2's commit hash, the loader-line counts, the `Cause:` text if there was a fallback, and the temp-addon counts;
  - a non-recurrence tally row for 2026-10-11 win32;
  - linux-x64: not measured locally. CI's next `pnpm test:ci` on ubuntu-latest is the first real-SEA native run there, and it is unobserved by this task;
  - a "What is NOT claimed" list:
    - the 2026-08-18 root cause;
    - real Steam depot bytes (only the synthetic 64 KiB chunk);
    - speed (spike-023 vs `b79765af2` still open);
    - the jest SEA suite on win32 (ENOENT harness limit, quote `jest-win32.txt`);
    - the real-SEA pure-JS path, which this suite no longer exercises;
    - the off arm in a real SEA build, not re-exercised this task.

STEP 2, file the Mac follow-up as a new pending todo.
- Frontmatter, in this order: `created: 2026-10-11T00:00:00.000Z`, `title`, `area: steam`, `severity: medium`, `platform: macos`, `ready: human`, then `found_by` and `files`. The three triage keys are bare, lowercase and exact, in that order.
- `ready: human` (not `live-gate`) follows the orchestrator: it needs the operator's own Steam sign-in and Mac, and the operator said they will do it.
- Body:
  - (1) a live Steam depot install end-to-end on the Mac with the native-ON build: `gamelib.log` shows the native-engaged line, the install completes and verifies;
  - (2) native vs pure-JS throughput on the same depot. Pure-JS in a SEA build is only reachable by a local uncommitted flip plus a rebuild. This settles the spike-023 vs `b79765af2` tension, and then the `logInfo` speedup clause gets corrected;
  - (3) also owed, not Mac-specific: read CI's first ubuntu-latest result for `lzmaNativeSeaRealBuild` with native ON;
  - (4) if a decode hang recurs: capture diagnostics first, then follow `lzmaLoader.ts`'s turn-off steps.

STEP 3, conditional on Task 2. Create at most one more pending todo, with the same frontmatter discipline.
- If Task 2 measured case (ii), a SEA load fallback naming a missing module: file `2026-10-11-win32-sea-native-lzma-falls-back-liblzma-dll-not-embedded.md` with `severity: major`, `platform: windows`, `ready: code`.
  - Native decode is broken on a triple that `NATIVE_LZMA_REQUIRED_TRIPLES` declares native-capable. Installs still complete on pure-JS.
  - Body: the static evidence (the two DLL names, the files embedded vs extracted, the search order), the measured `Cause:`, and the fix surface. The fix surface is to embed `liblzma.dll` as a second SEA asset and extract both into a private `mkdtemp` dir before dlopen. Note the DLL-planting threat that dir must close. Name the files: `meta/buildSidecarSea.ts`, `lzmaNativeBinding.ts` and their tests.
  - Verify the fix with this task's driver on Windows.
- If Task 2 measured case (i) and `tmpAddons` grew by about the pool size per run: file `2026-10-11-win32-sea-native-lzma-temp-addon-left-in-tmpdir.md` with `severity: medium`, `platform: windows`, `ready: code`, carrying the measured counts and file size.
- In case (iii), or a build failure: no extra todo. The recurrence or build failure is recorded in the Resolution and the Mac todo, and flagged in the SUMMARY for the operator.

STEP 4, add the debug-doc addendum.
- Append a short `## Addendum (2026-10-11)` to `.planning/debug/resolved/sea-native-lzma-real-chunk-decode-hang.md`. Do not edit its frontmatter or any earlier section; this is a resolved record.
- Content: native re-enabled by operator revision, Task 1's commit hash, root cause still unknown, a pointer to the completed todo's Resolution, and the reopen instruction unchanged (full system-state capture at recurrence).

STEP 5, gates and commit.
- Run the `<verify>` gates.
- Commit exactly these paths, both sides of the `git mv` included: `docs(quick-261011-mza): close the native-lzma re-enable-or-delete todo and file the Mac live-install follow-up`, ending with the Co-Authored-By line.
- The SUMMARY at `.planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/261011-mza-SUMMARY.md` is written per `<output>`. It leads with the win32 result and the prediction's fate.
  </action>
  <verify>
    <automated>test -f .planning/todos/completed/2026-10-08-native-lzma-decode-reenable-or-delete-needs-operator-decision.md && ! test -e .planning/todos/pending/2026-10-08-native-lzma-decode-reenable-or-delete-needs-operator-decision.md</automated>
    <automated>test "$(grep -c '^## Resolution (2026-10-11)' .planning/todos/completed/2026-10-08-native-lzma-decode-reenable-or-delete-needs-operator-decision.md)" = 1 && grep -q "re-enable it, I'll do the Mac install after" .planning/todos/completed/2026-10-08-native-lzma-decode-reenable-or-delete-needs-operator-decision.md</automated>
    <automated>sed -n '1,12p' .planning/todos/pending/2026-10-11-native-lzma-mac-live-steam-depot-install-and-throughput-remeasure.md | grep -E '^(severity|platform|ready):' | tr '\n' ' ' | grep -qx 'severity: medium platform: macos ready: human '</automated>
    <automated>py -3 .planning/todos/todo-frontmatter-gate.py</automated>
    <automated>pnpm planning-gates || py -3 meta/runPlanningGates.py (12/12)</automated>
    <automated>before commit (append-only proof): grep -q '^## Addendum (2026-10-11)' .planning/debug/resolved/sea-native-lzma-real-chunk-decode-hang.md && D=$(git diff HEAD -- .planning/debug/resolved/sea-native-lzma-real-chunk-decode-hang.md) && test "$(printf '%s\n' "$D" | grep -c '^-[^-]')" = 0</automated>
    <automated>before commit: C=$(git diff --cached --name-only) && test -z "$(printf '%s\n' "$C" | grep -E '^\.planning/(state\.json|milestone\.lock|debug/rust-test-ci-missing-sidecar\.md)$')"</automated>
    <automated>Prettier: omitted by design. Every path this task writes is under `.planning/`, which prettier ignores (`.planning/todos/pending/*.md` and the task dir both measured `{ "ignored": true, "inferredParser": null }`). Re-probe the new todo's path with `npx prettier --file-info` to confirm before omitting. Consistency is by hand-matching the surrounding todo/Resolution corpus.</automated>
  </verify>
  <done>
- The decision todo is in `completed/`, with a Resolution that quotes the operator and carries the win32 result and the not-claimed list.
- The Mac follow-up todo passes the frontmatter gate (`medium`/`macos`/`human`).
- Any measured win32 defect has its own gated todo.
- The debug doc has an append-only addendum.
- `planning-gates` is 12/12.
- The commit excludes the three pre-existing unrelated files.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Steam CDN -> depot decode worker | Chunk bytes cross the network, are AES-decrypted with the depot key, then parsed by liblzma 5.2.3 (native C) instead of the pure-JS package |
| SEA asset -> os.tmpdir() -> process.dlopen | The embedded native addon is written to a temp path and loaded as executable code, now on every user's default decode path |
| Direct SEA runs -> committed captures | Measurement output from a real binary is committed to the repo |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261011-mza-01 | Elevation of privilege | `lzmaNativeBinding.ts` SEA branch (temp `.node` + `process.dlopen`) | medium | mitigate | Existing controls, unchanged by this task: an unpredictable name (pid + 8 random bytes, T-23.1-03-01), mode 0600 on create, and removal in a `finally` on the failure path (`8cde665b6`). Residual accepted at ASVS L1: the write is not exclusive-create, and on Windows a loaded addon cannot be unlinked while mapped. Task 2 measures temp-addon accumulation, and Task 3 files a todo if it occurs. The `liblzma.dll` fix the conditional todo describes must use a private `mkdtemp` dir, to avoid opening a DLL-planting hole |
| T-261011-mza-02 | Tampering | Steam CDN chunk bytes -> native liblzma 5.2.3 | medium | accept | Chunks arrive over HTTPS and are AES-decrypted with the depot key before LZMA sees them, so crafting decoder input requires the depot key. Output is size- and SHA-1-checked by the existing VZ path. Decode runs in a worker under the pool's 15 s per-task timeout. Upgrading the bundled liblzma is a dependency change, out of scope |
| T-261011-mza-03 | Denial of service | depot install decode (a field recurrence, or a native-specific failure) | medium | mitigate | Existing: the per-task timeout plus worker replacement, and the loader never rejects (pure-JS fallback on load/smoke failure). Added: the constant and the test-only override are retained, with written turn-off steps (Task 1 doc comment (f)), and the Mac live-install todo |
| T-261011-mza-04 | Information disclosure | captures in `measurement/` | medium | mitigate | A fresh `createFakeHomeProfile()` per run, disposed in `finally`. The self-test never calls `init()`. The leak-scan grep must be empty before staging. The only absolute path recorded is the binary path |
| T-261011-mza-05 | Denial of service | operator's local build tree / Windows sidecar `.exe` | low | mitigate | The precondition requires no running sidecar/tauri. Only the six SEA outputs are deleted, never `build/` wholesale. The old `.exe` is backed up to the scratchpad and restored if the build fails |
| T-261011-mza-SC | Tampering | npm/pip/cargo installs | high | mitigate | No install tasks: `lzma-native@8.0.6` is already pinned (since `9b7437874`). Any `package.json`/lockfile change in any commit is a stop condition |
</threat_model>

<verification>
- Three commits in order: code+tests (exactly 3 `src/` files), measurement (task dir only), docs (todos + debug addendum).
- `L=$(git show HEAD~2:src/backend/storeManagers/steam/depot/lzmaLoader.ts) && printf '%s\n' "$L" | grep -c '^const NATIVE_LZMA_DECODE_ENABLED = true$'` returns 1.
- `git status --short` at the end still shows exactly the three pre-existing unrelated paths as modified/untracked, and nothing else from this task.
- The scoped jest suites are green on win32. The depot suites' Windows failures are identical to the planning baseline. The jest SEA suite's win32 outcome is captured.
</verification>

<success_criteria>
- Native decode is ON in HEAD, with an honest doc comment, a turn-off path, and the override retained. No native code was deleted.
- The win32-x64 real-SEA result is measured and recorded, whichever of the four outcomes it is. The `liblzma.dll` prediction is confirmed or refuted by evidence.
- The decision todo is closed with a Resolution. The Mac follow-up (and any measured win32 defect) is tracked by gated pending todos.
- Every commit is scoped to explicit paths; the pre-existing unrelated files are untouched.
</success_criteria>

<output>
Create `.planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/261011-mza-SUMMARY.md` when done. Lead with:
- the win32-x64 result: which STEP 4 case occurred, the driver table, the loader-line counts and `Cause:`, the temp-addon counts;
- whether the `liblzma.dll` prediction held;
- the RED/GREEN counts;
- the jest-on-win32 limitation;
- the linux-x64-in-CI note;
- the operator's owed follow-ups.
If case (iii) occurred, say at the top, in plain words, that a fresh recurrence was captured and that the switch was left ON pending the operator's decision.
</output>
