---
phase: quick-260926-dxa
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - meta/tauriDevPreflight.cjs
  - meta/__tests__/tauriDevPreflight.test.ts
  - package.json
  - .planning/todos/pending/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md
  - .planning/todos/completed/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md
  - .planning/debug/knowledge-base.md
autonomous: true
requirements: [QUICK-260926-dxa]

must_haves:
  truths:
    - "Every `pnpm tauri:dev*` run entry (`tauri:dev`, `tauri:dev:vault`, `tauri:dev:keyring`) runs the pre-flight before building anything, and a running `gamelib-shell(.exe)` outside the repo's own `target/debug` makes it exit non-zero BEFORE `tauri dev` can hand focus to that shell and exit"
    - 'The failure message names each offending executable path and pid and tells the operator how to stop it; the script never kills anything'
    - 'An unreadable exe path, a failed/timed-out process query, or unparseable output produces a WARN and exit 0 — never a false-red dev start'
    - "On this Windows machine, with the installed shell pid 24764 running, `node meta/tauriDevPreflight.cjs` exits non-zero naming `C:\\Users\\grays\\AppData\\Local\\GameLib\\gamelib-shell.exe` and pid 24764, and pid 24764 is still running afterwards"
    - 'The todo is in `.planning/todos/completed/` with a resolution recording both decisions, the 2026-09-26 re-occurrence (pid 24764), the log-rotation finding, the unaffected 636d0788c verification, and the out-of-scope sidecar drain observation'
    - '`38-HUMAN-UAT.md` `## Sitting 4` records that the sitting-4 inference is accepted as FINAL because the `GAMELIB_SHELL_EXE received=` evidence has rotated away'
  artifacts:
    - path: 'meta/tauriDevPreflight.cjs'
      provides: 'Pre-flight CLI + pure classifier, exports classifyShellProcesses/parseWindowsCimJson/parsePsComm/ownDebugDir'
      contains: 'require.main === module'
    - path: 'meta/__tests__/tauriDevPreflight.test.ts'
      provides: 'Unit tests for the pure classifier and parsers'
    - path: 'package.json'
      provides: 'tauri:dev:run starts with node meta/tauriDevPreflight.cjs'
      contains: 'node meta/tauriDevPreflight.cjs &&'
    - path: '.planning/todos/completed/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md'
      provides: 'Closed todo with resolution'
  key_links:
    - from: 'package.json tauri:dev:run'
      to: 'meta/tauriDevPreflight.cjs'
      via: 'first command in the && chain'
      pattern: '"tauri:dev:run": "node meta/tauriDevPreflight.cjs &&'
    - from: '38-HUMAN-UAT.md'
      to: '.planning/todos/completed/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md'
      via: 'path references updated from pending/ to completed/'
      pattern: 'todos/completed/2026-09-26-tauri-dev-silently-hands-off'
---

<objective>
Close todo `2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md` with the operator's LOCKED decisions:

- **D-01 (Decision 2 = option (c)).** A `tauri:dev` pre-flight that fails loudly when any running `gamelib-shell(.exe)` is NOT the repo's own debug binary. Cross-platform, WARN-not-block on anything it cannot read. Option (b) was DECLINED: `src-tauri/src/main.rs` (the Phase 46 single-instance code) is NOT touched.
- **D-02 (Decision 1 residual).** The sitting-4 commit-date inference is accepted as FINAL; the Windows logs that could have settled it have rotated.

Purpose: `pnpm tauri:dev` currently builds, prints one scrollback line (`[shell] another GameLib instance is already running -- sending focus sentinel to it and exiting`) and exits when an installed shell is running, so the operator unknowingly tests the stale installed build. That mislabelled two Phase 38 sittings and filed a false regression, and the trap was live AGAIN on 2026-09-26 (pid 24764).

Output: `meta/tauriDevPreflight.cjs` + its test, `package.json` wiring, closed todo, `38-HUMAN-UAT.md` Sitting 4 note.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/todos/pending/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md

<interfaces>
Facts gathered at planning time. Use these directly; no exploration needed.

package.json scripts today (lines 32-35):
"tauri:dev": "cross-env GAMELIB_DEV_SECRET_VAULT=1 pnpm tauri:dev:run",
"tauri:dev:keyring": "pnpm tauri:dev:run",
"tauri:dev:vault": "pnpm tauri:dev",
"tauri:dev:run": "pnpm build:sidecar && pnpm build:decompress-worker-dev && tauri dev",
All three dev entries funnel through `tauri:dev:run`, so the pre-flight goes at the HEAD of
`tauri:dev:run` (covers `tauri:dev:keyring`, which bypasses `tauri:dev`). `tauri:dev:packaged`
only builds (`tauri build --debug`), never runs the shell -- leave it alone.
`src-tauri/tauri.conf.json` has `beforeDevCommand: "pnpm exec vite"` -- do not put the
pre-flight there (it runs after cargo has already started and its failure mode is less clear).

Binary name: `src-tauri/Cargo.toml` `name = "gamelib-shell"` -> `gamelib-shell.exe` on Windows,
`gamelib-shell` on macOS/Linux. Own debug binary lives in `<repo>/src-tauri/target/debug/`
unless `CARGO_TARGET_DIR` is set (then `<CARGO_TARGET_DIR>/debug/`, resolved against the repo
root if relative).

Language/idiom: write a plain CommonJS `.cjs` run by bare `node`, NOT a `meta/*.ts` via
`meta/runTs.cjs` -- `runTs.cjs` breaks on Windows
(`runts-cjs-esbuild-shim-breaks-every-meta-script-on-windows.md`, cited in
`meta/captureShellScrollback.ts:52-55`), and Windows is exactly where this trap was hit.
Precedents: `meta/sidecarStartupSmoke.cjs` (`#!/usr/bin/env node`, dense `/** ... */` header
explaining WHY with dates/quick ids), `meta/findDeadcode.cjs` (main guarded by
`if (require.main === module)` at :582, `module.exports = {...}` at :592).

Test idiom for a .cjs (from `meta/__tests__/findDeadcode.test.ts:17-25`):
// eslint-disable-next-line @typescript-eslint/no-require-imports
const findDeadcode = require('../findDeadcode.cjs')
with a comment that the require is only safe because the module guards `main()` behind
`require.main === module`. Meta jest project: `meta/jest.config.js` (displayName `Meta`,
testMatch `**/__tests__/**/*.test.ts`, rootDir `..`). No new jest project.

Fake-HOME gate: `src/backend/__tests__/fakeHomeIsolation.test.ts` scans `src/` and `meta/`
and forbids a spawn with a hand-rolled `env` literal assigning HOME/USERPROFILE/APPDATA/
LOCALAPPDATA/XDG\_\*. Pass NO `env` key to any spawn in this script (inherit). The queries are
read-only process listings, not binary runs of the sidecar/SEA, so the two-profile rule's
isolation half does not apply -- say so in one header sentence.

Related prior art (do not modify): `meta/captureShellScrollback.ts:570`
`preflightRefuseIfRunning()` refuses when a DEV instance is running, via `pgrep`
(macOS/Linux only). This new script is the complementary case (a FOREIGN instance) and is
the one that runs on Windows.

Todo `260913-m9c` status: the class it named is closed. The m9c diagnosis lives in
`.planning/todos/completed/2026-09-13-cold-sidecar-boot-holds-pooled-keepalive-tls-sockets-for-26s-against-a-30s-ci-budget.md`
(CLOSED 2026-09-17; cold-profile case fixed by 260916-9vh; residual = a once-per-DXMT-release
unbounded fetch on macOS profiles with Wine-Staging, accepted won't-fix, platform: macos).
It does NOT cover a Windows sidecar that failed to drain-exit within ~25s after its shell
was stopped. No pending todo covers it.

`38-HUMAN-UAT.md` `## Sitting 4` spans lines ~432-531 (next heading `## Sitting 5` at ~532).
It contains NO `### N.` UAT items -- it is narrative. Its "Honest limits of this relabel."
paragraph (~474-485) ends: "The clean way to settle it is the `GAMELIB_SHELL_EXE received=`
lines in `gamelib.log.old` on the operator's Windows machine. See
`.planning/todos/pending/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md`."
Files referencing the todo's pending path: `38-HUMAN-UAT.md`, `.planning/debug/knowledge-base.md`
(live docs -> update), plus historical records in `.planning/quick/260926-b5r-*/`,
`.planning/quick/260926-bsl-*/`, `.planning/debug/resolved/mouse-dead-dropdown-disclosure.md`,
`.planning/todos/completed/2026-09-26-mouse-click-no-longer-opens-dropdown-disclosures.md`
(historical -> leave; they were true when written). Ignore `graphify-out/`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pre-flight script with pure classifier, unit tests, and package.json wiring (D-01)</name>
  <files>meta/tauriDevPreflight.cjs, meta/__tests__/tauriDevPreflight.test.ts, package.json</files>
  <behavior>
    classifyShellProcesses({ processes, ownDebugDir, platform }) where processes is an array of { pid: number, exePath: string | null } and it returns { foreign: [...], own: [...], unknown: [...] }:
    - Test 1: win32, exePath `C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe`, ownDebugDir `C:\Users\grays\Projects\GameLib\src-tauri\target\debug` -> foreign.
    - Test 2: win32, exePath equal to ownDebugDir + `\gamelib-shell.exe` but with different letter case and forward slashes -> own (Windows compare is case-insensitive and separator-insensitive).
    - Test 3: win32, exePath under `...\src-tauri\target\release\gamelib-shell.exe` -> foreign (release build of THIS repo is still foreign; installed = foreign; only target/debug is own).
    - Test 4: exePath null or empty -> unknown (never foreign).
    - Test 5: linux, `/home/u/GameLib/src-tauri/target/debug/gamelib-shell (deleted)` with ownDebugDir `/home/u/GameLib/src-tauri/target/debug` -> own (strip the /proc ` (deleted)` suffix left by a rebuild).
    - Test 6: darwin, exePath `/Applications/GameLib.app/Contents/MacOS/gamelib-shell` -> foreign; POSIX compare is case-sensitive.
    - Test 7: a relative/non-absolute exePath (macOS `ps comm` can give a bare name) -> unknown.
    - Test 8: a path whose dirname merely STARTS WITH ownDebugDir (e.g. `.../target/debug-old/gamelib-shell`) -> foreign (exact directory match, not prefix).
    parseWindowsCimJson(stdout):
    - Test 9: empty/whitespace stdout -> [] (ConvertTo-Json emits nothing for zero results).
    - Test 10: a single object `{"ProcessId":24764,"ExecutablePath":"C:\\...\\gamelib-shell.exe"}` -> one entry (ConvertTo-Json emits an object, not an array, for one result).
    - Test 11: an array with one `ExecutablePath: null` entry -> entry with exePath null.
    - Test 12: malformed JSON -> throws (caller converts to WARN).
    parsePsComm(stdout) for `ps -axww -o pid=,comm=` lines:
    - Test 13: keeps only entries whose basename is exactly `gamelib-shell`, preserves paths containing spaces (split on the first whitespace run after the pid only), ignores `gamelib-shell-helper` and blank lines.
    ownDebugDir({ repoRoot, env }):
    - Test 14: no CARGO_TARGET_DIR -> `<repoRoot>/src-tauri/target/debug`; absolute CARGO_TARGET_DIR -> `<it>/debug`; relative -> resolved against repoRoot. Pass `env` as a plain object argument in tests (e.g. `{ CARGO_TARGET_DIR: 'x' }`) -- it is a function argument, not a spawn option, so the fake-HOME gate does not apply; do not use any HOME/USERPROFILE/APPDATA/LOCALAPPDATA/XDG_* keys in it.
  </behavior>
  <action>
    Per D-01 (option (c); option (b) declined -- do NOT edit `src-tauri/src/main.rs`).

    Create `meta/tauriDevPreflight.cjs`: `#!/usr/bin/env node`, `'use strict'`, CommonJS, node built-ins only (`node:child_process`, `node:fs`, `node:path`). Header comment in the `sidecarStartupSmoke.cjs` style, covering: the incident (todo `2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md`; the installed shell swallows the dev build via the Phase 46 single-instance focus handoff, quote the `[shell] another GameLib instance is already running -- sending focus sentinel to it and exiting` line; happened in sittings 4/5 and again 2026-09-26 as pid 24764); why option (c) rather than (b) (operator decision; main.rs untouched); why `.cjs` under bare node (runTs.cjs breaks on Windows); the fail-safe asymmetry (only a READ, POSITIVELY-foreign path blocks; everything unreadable WARNs, because a false-red dev start is worse than a missed catch); that it never kills anything; that it spawns read-only process listings with no `env` key, so the fake-HOME two-profile rule's isolation half does not apply (it's a process listing, not a sidecar/SEA run); and "what this does NOT catch": a foreign shell started AFTER the pre-flight passes, a shell under another name, or an own-debug instance already running (which still hands off -- reported as a NOTE only, because D-01 scopes blocking to non-debug binaries).

    Pure exports (the tested surface): `classifyShellProcesses`, `parseWindowsCimJson`, `parsePsComm`, `ownDebugDir`, plus `SHELL_BASENAME` (`gamelib-shell`). Semantics are exactly the behavior block above. Normalisation: on win32 compare `path.win32.normalize` of both sides, lowercased, after replacing `/` with `\`; on POSIX compare `path.posix.normalize` exactly. "Own" means `dirname(exePath)` equals `ownDebugDir` (exact, not prefix) AND basename is the shell basename. Take `platform` as an argument (default `process.platform`) so tests can drive every branch on any OS.

    Impure collectors (untested, keep thin), each returning `{ processes }` or `{ error: string }` and NEVER throwing out:
    - win32: `spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', <query>], { encoding: 'utf8', timeout: 20000, windowsHide: true })` where the query is `Get-CimInstance Win32_Process -Filter "Name='gamelib-shell.exe'" | Select-Object ProcessId, ExecutablePath | ConvertTo-Json -Compress`. (tasklist cannot give paths.) A null ExecutablePath (elevated/other-user process) -> unknown.
    - linux: iterate numeric entries of `/proc`, `readFileSync(/proc/<pid>/comm)` trimmed === `gamelib-shell`, then `readlinkSync(/proc/<pid>/exe)`; a readlink error (EACCES) -> exePath null. Errors reading `/proc` itself -> `{ error }`.
    - darwin (and any other POSIX): `spawnSync('ps', ['-axww', '-o', 'pid=,comm='], { encoding: 'utf8', timeout: 20000 })` then `parsePsComm`.
    Any spawn error, non-zero status, timeout (`result.error` / `result.signal`), or parse throw -> `{ error }`.

    `main()`: compute `ownDebugDir({ repoRoot: path.resolve(__dirname, '..'), env: process.env })`, collect, classify, then:
    - collector error -> print `[tauri-dev-preflight] WARN: could not list running gamelib-shell processes (<reason>); skipping the stale-shell check.` to stderr, exit 0.
    - each unknown -> stderr WARN naming the pid and that its exe path could not be read, with the stop command, exit status unaffected.
    - each own -> one stdout NOTE line (pid + path) saying a dev instance is already running and `tauri dev` will hand focus to it.
    - any foreign -> stderr block: a headline that a non-dev GameLib shell is running and `tauri dev` would hand focus to it and exit, so you would be testing THAT build, not this tree; one line per process `pid <pid>  <exePath>`; how to stop it -- on win32 `Stop-Process -Id <pid>` (PowerShell) or quit GameLib from its tray icon, on POSIX `kill <pid>` or quit the app; then `process.exit(1)`.
    - otherwise one stdout OK line, exit 0.
    Guard: `if (require.main === module && !process.env.JEST_WORKER_ID) main()` (the Phase 41-07 idiom). `module.exports = { ... }`.

    Create `meta/__tests__/tauriDevPreflight.test.ts` implementing Tests 1-14, requiring the module per the findDeadcode.test.ts idiom (eslint-disable comment + a comment that the require is safe only because of the main guard). Pure inputs only -- never spawn, never read the live process table. Write tests first, confirm they fail (module absent), then implement.

    Wire `package.json`: change ONLY `tauri:dev:run` to `node meta/tauriDevPreflight.cjs && pnpm build:sidecar && pnpm build:decompress-worker-dev && tauri dev` -- first, so it fails before a multi-minute build. Leave every other script unchanged.

  </action>
  <verify>
    <automated>npx jest -c meta/jest.config.js meta/__tests__/tauriDevPreflight.test.ts && npx jest src/backend/__tests__/fakeHomeIsolation.test.ts && npx eslint meta/tauriDevPreflight.cjs meta/__tests__/tauriDevPreflight.test.ts && pnpm codecheck && node -e "const s=require('./package.json').scripts;if(!s['tauri:dev:run'].startsWith('node meta/tauriDevPreflight.cjs && '))process.exit(1)" && git diff --quiet -- src-tauri/src/main.rs && npx prettier --check meta/tauriDevPreflight.cjs meta/__tests__/tauriDevPreflight.test.ts package.json</automated>
  </verify>
  <done>All 14 tests pass; fakeHomeIsolation gate green; eslint, codecheck and prettier clean; `tauri:dev:run` starts with the pre-flight; main.rs untouched.</done>
</task>

<task type="auto">
  <name>Task 2: Live check against the running installed shell (pid 24764) -- read-only</name>
  <files>(none -- observation only; record results in the SUMMARY)</files>
  <action>
    On this Windows machine, first confirm the precondition WITHOUT touching the process: `powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='gamelib-shell.exe'\" | Select-Object ProcessId, ExecutablePath"`. If pid 24764 (or any installed shell under `C:\Users\grays\AppData\Local\GameLib\`) is present, run `node meta/tauriDevPreflight.cjs` directly (NOT `pnpm tauri:dev` -- that would build and, if the check were broken, hand off to the live instance) and capture stdout, stderr and exit code. Expected: exit 1; stderr names `C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe` and pid 24764 and gives `Stop-Process -Id 24764`. Then re-run the CIM query and confirm pid 24764 is still running. Do NOT stop, kill, or signal that process under any circumstances -- the operator owns it.

    Do not run any `tauri:dev*` entry. The package.json wiring is proven by Task 1's string check.

    If the installed shell is no longer running at execution time, do NOT start one; record in the SUMMARY that the live check could not be performed and that the script exited 0 with its OK line instead, and flag the live check as outstanding for the operator. If the script exits 0 or WARNs while the shell IS running, that is a defect: fix the collector/classifier (Task 1's files), re-run Task 1's verify, and repeat.

    Record verbatim output (the path and pid are the operator's own machine data, not secrets; no log files are captured, so nothing needs registering for shredding) in the SUMMARY.

  </action>
  <verify>
    <automated>node meta/tauriDevPreflight.cjs; test $? -eq 1 && powershell.exe -NoProfile -Command "if (Get-Process -Id 24764 -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"</automated>
  </verify>
  <done>Pre-flight exits 1 naming the installed exe path and pid 24764 with the stop instruction, and pid 24764 is still alive afterwards (or, if the shell had exited before execution, the SUMMARY says so and flags the live check as outstanding).</done>
</task>

<task type="auto">
  <name>Task 3: Close the todo, record D-02 in Sitting 4, repoint live references</name>
  <files>.planning/todos/pending/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md, .planning/todos/completed/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md, .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md, .planning/debug/knowledge-base.md</files>
  <action>
    (a) `git mv` the todo from `.planning/todos/pending/` to `.planning/todos/completed/` (same filename), then edit the moved file. Frontmatter: keep `created`, `found_during`, `severity: major`, `platform: windows`, `area`; set `ready: human` unchanged is fine (completed/ is exempt from the gate, but keep all three keys bare-lowercase anyway); add `status:` (one-line quoted summary: CLOSED 2026-09-26 by operator decision -- Decision 2 = (c) pre-flight shipped in quick 260926-dxa; Decision 1 residual = sitting-4 inference accepted as final) and `closed_by: operator decision 2026-09-26; quick 260926-dxa`; append `meta/tauriDevPreflight.cjs` and `package.json` to `files:`. Keep the existing body intact (it is the record); annotate decision 1 and decision 2 paragraphs with a short "**Decided 2026-09-26:**" line each, and append a `## Resolution (2026-09-26, quick 260926-dxa)` section containing:
      1. Decision 2 = option (c) (D-01): what `meta/tauriDevPreflight.cjs` does, where it is wired (head of `tauri:dev:run`, so `tauri:dev`, `tauri:dev:vault`, `tauri:dev:keyring` all get it), its fail-safe WARN behaviour, and what it does NOT catch (a shell started after the check; own-debug instance only NOTEd). Option (b) was declined; `src-tauri/src/main.rs` (Phase 46 single-instance) unchanged. Include the Task 2 live-check result (exit code, named path/pid, pid still alive).
      2. Decision 1 residual (D-02): the sitting-4 commit-date inference is accepted as FINAL. Measured 2026-09-26 on the Windows machine: both `%LOCALAPPDATA%\GameLib\logs` files have rotated -- `gamelib.log.old` now starts 09:38 and `gamelib.log` 09:40, both 2026-09-26 -- so the `GAMELIB_SHELL_EXE received=` lines for sitting 4 no longer exist and it can never be measured.
      3. Re-occurrence at actioning time: an installed v0.7.0 shell (mtime 2026-09-25 22:54 -- a different, newer install than the 2026-09-24 07:34 one in the body) was running as pid 24764, started 2026-09-26 09:40 from a long-lived PowerShell (parent pid 33856, created 2026-09-24 07:50), driving the repo's `build/main/sidecar.js`. The trap was live again, which is the case for the guard.
      4. Not affected: the `webview2-delete-cookie-noop` live verification (commit `636d0788c`) -- its logged `settle_rereads=` / `CDP cleanup issued=` lines exist only in the new dev-shell code, so they could not have come from the installed shell.
      5. Out of scope, stated rather than dropped: the side observation (pid 12812's node sidecar did not drain-exit within ~25s after its shell stopped). It is NOT covered by `260913-m9c`: that diagnosis lives in `.planning/todos/completed/2026-09-13-cold-sidecar-boot-holds-pooled-keepalive-tls-sockets-for-26s-against-a-30s-ci-budget.md`, closed 2026-09-17, and its only residual is a macOS-only, once-per-DXMT-release fetch. The Windows observation was never investigated, has no pending todo, and is left unfiled here -- one unmeasured occurrence; if it recurs, file it with `platform: windows` and cite this note. (Do NOT create a new todo in this task.)
    Keep the prose in the file's existing plain register; no emojis.

    (b) `38-HUMAN-UAT.md`, `## Sitting 4` only: after the "Honest limits of this relabel." paragraph, add a new paragraph beginning `**Inference accepted as final (2026-09-26, quick \`260926-dxa\`).**` stating the operator accepted the commit-date inference as final, and why: measured 2026-09-26 on the Windows machine, both `%LOCALAPPDATA%/GameLib/logs` files have rotated (`gamelib.log.old` starts 09:38, `gamelib.log` 09:40, both 2026-09-26), so the `GAMELIB_SHELL_EXE received=` lines that could have settled it no longer exist; the label therefore stays INFERRED permanently, and the three desk-diff results are unchanged. Use forward slashes in the path (the section already keeps itself backslash-free). In the "Honest limits" paragraph, change "The clean way to settle it is ..." to past tense noting that evidence has since rotated away (one short clause; do not rewrite the paragraph). Replace EVERY occurrence in the file of `.planning/todos/pending/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md` with the `completed/` path. Do NOT touch any `expected: |` block or any `### N.` item anywhere in the file (CLAUDE.md UAT shape rule); this edit is narrative-only. Do not modify the `## Sitting 4` heading line.

    (c) `.planning/debug/knowledge-base.md`: replace the pending path with the completed path, nothing else. Leave the historical references in `.planning/quick/260926-b5r-*/`, `.planning/quick/260926-bsl-*/`, `.planning/debug/resolved/mouse-dead-dropdown-disclosure.md` and the completed mouse-click todo untouched -- they were true when written.

  </action>
  <verify>
    <automated>test ! -e .planning/todos/pending/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md && grep -c "## Resolution (2026-09-26, quick 260926-dxa)" .planning/todos/completed/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md && grep -c "24764" .planning/todos/completed/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md && grep -c "Inference accepted as final" .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md && test "$(grep -c 'todos/pending/2026-09-26-tauri-dev-silently' .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md .planning/debug/knowledge-base.md | awk -F: '{s+=$2} END {print s}')" = 0 && test "$(git diff -U0 .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md | grep -E '^[-+]' | grep -v '^[-+][-+]' | grep -cE 'expected: \||^[-+]### [0-9]')" = 0 && pnpm planning-gates && npx prettier --check .planning/todos/completed/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md .planning/debug/knowledge-base.md</automated>
  </verify>
  <done>Todo is in completed/ with resolution covering D-01, D-02, the pid-24764 re-occurrence, the unaffected 636d0788c verification, and the out-of-scope drain observation (m9c checked, not covering it); Sitting 4 records the final acceptance and log rotation; no live doc points at the pending path; no UAT item or `expected: |` block changed; planning-gates and prettier green.</done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                               | Description                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| process table -> pre-flight            | Reads other processes' exe paths (local, same user; possibly other users on shared hosts) |
| pre-flight -> operator's running shell | Must be observe-only; the operator's installed instance holds an authenticated session    |

## STRIDE Threat Register

| Threat ID | Category               | Component                            | Disposition | Mitigation Plan                                                                                                                                                          |
| --------- | ---------------------- | ------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-dxa-01  | Denial of Service      | tauriDevPreflight main()             | mitigate    | Every query failure, timeout (20s spawnSync timeout), null path, or parse error WARNs and exits 0; only a positively-read foreign path exits 1 -- no false-red dev start |
| T-dxa-02  | Tampering              | operator's running shell (pid 24764) | mitigate    | Script contains no kill/Stop-Process call -- it only prints the command; Task 2 re-checks the pid is alive after the run                                                 |
| T-dxa-03  | Elevation of Privilege | PowerShell -Command string           | mitigate    | Query string is a constant with no interpolated input; spawnSync with argv array, no shell:true                                                                          |
| T-dxa-04  | Information Disclosure | fake-HOME rule                       | accept      | Read-only process listing, not a sidecar/SEA run; no env literal (fakeHomeIsolation gate enforces); no captures written                                                  |

</threat_model>

<verification>
- `npx jest -c meta/jest.config.js meta/__tests__/tauriDevPreflight.test.ts` green
- `npx jest src/backend/__tests__/fakeHomeIsolation.test.ts` green
- `pnpm codecheck`, `pnpm planning-gates` green
- Live: `node meta/tauriDevPreflight.cjs` exits 1 naming pid 24764 and its installed path; pid 24764 still running
- `git diff --stat -- src-tauri/src/main.rs` empty
- prettier --check clean over every written path
</verification>

<success_criteria>

- A foreign `gamelib-shell` running makes every `pnpm tauri:dev*` entry fail before building, with path + pid + stop instruction; unreadable cases warn and proceed.
- The todo is closed in completed/ with both locked decisions and all four recorded facts; the drain-exit side observation is explicitly out of scope with the m9c check stated.
- Sitting 4 records the inference as final with the log-rotation measurement; no UAT item shape touched.
  </success_criteria>

<output>
Create `.planning/quick/260926-dxa-tauri-dev-pre-flight-rejects-a-foreign-r/260926-dxa-SUMMARY.md` when done, including the verbatim Task 2 live-check output.
</output>
