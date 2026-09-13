---
phase: quick-260913-arr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - CLAUDE.md
  - src/backend/testUtils/fakeHomeProfile.ts
  - src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts
  - src/backend/storeManagers/steam/__tests__/decompressWorkerRealBuild.test.ts
  - meta/captureShellScrollback.ts
  - meta/buildSidecarSea.ts
  - meta/sidecarStartupSmoke.cjs
  - src/backend/__tests__/fakeHomeIsolation.test.ts
  - .planning/todos/pending/2026-09-12-live-gate-scripts-need-fake-home-isolation-by-default.md
autonomous: true
requirements:
  - ITEM-1 CLAUDE.md two-profile convention (D1)
  - ITEM-2 helper in src/backend/testUtils/ (D3)
  - ITEM-3 convert the hand-rolled spawn blocks (D3)
  - ITEM-4 captureShellScrollback converted; buildSidecarSea decided (D3)
  - ITEM-5 exemption comment in meta/sidecarStartupSmoke.cjs (D3)
  - ITEM-6 gate: no in-repo file spawns the compiled binary with a hand-rolled env (D2)

must_haves:
  truths:
    - "A reader of CLAUDE.md finds the two-profile rule, and its text says outright which half is unenforceable"
    - "One helper owns the eight-variable block, the mkdtemp 0700 root, and disposal; nothing re-derives it"
    - "Every hand-rolled spawn env block under src/ and meta/ is gone, replaced by the helper"
    - "meta/sidecarStartupSmoke.cjs still inherits the real environment, and its header says why"
    - "A newly-introduced hand-rolled env spawn turns the gate RED; removing it turns it GREEN again"
    - "Both RealBuild suites still pass, measuring the same things they measured before"
  artifacts:
    - path: "src/backend/testUtils/fakeHomeProfile.ts"
      provides: "createFakeHomeProfile(), FAKE_HOME_ENV_KEYS, disposing handle"
      exports: ["createFakeHomeProfile", "FAKE_HOME_ENV_KEYS"]
    - path: "src/backend/__tests__/fakeHomeIsolation.test.ts"
      provides: "the item-6 gate plus its reasoned exemption table"
      contains: "EXEMPTIONS"
    - path: "CLAUDE.md"
      provides: "### Fake-HOME isolation for direct binary runs (two-profile rule)"
      contains: "two-profile"
  key_links:
    - from: "src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts"
      to: "src/backend/testUtils/fakeHomeProfile.ts"
      via: "import createFakeHomeProfile"
      pattern: "fakeHomeProfile"
    - from: "src/backend/__tests__/fakeHomeIsolation.test.ts"
      to: "meta/sidecarStartupSmoke.cjs"
      via: "exemption entry whose reason text must also appear in the exempt file"
      pattern: "sidecarStartupSmoke"
---

<objective>
Implement the fake-HOME isolation specification the operator ruled on 2026-09-13 (D1-D4 in
`.planning/todos/pending/2026-09-12-live-gate-scripts-need-fake-home-isolation-by-default.md`).

Purpose: two live incidents (`260912-e6k`, `260913-901`) wrote the operator's real GOG session
data to disk because nothing forced isolation on a direct run of the compiled sidecar. The same
evidence shows isolation would have made a `major`, PR-blocking defect permanently invisible.
The answer is the two-profile rule, one helper, converted call sites, and one loud exemption.

Output: a convention, a helper, four converted spawn blocks, one converted harness, one
documented "no", one exemption comment, and one gate with a proven negative control.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/todos/pending/2026-09-12-live-gate-scripts-need-fake-home-isolation-by-default.md
@CLAUDE.md
@src/backend/jest.setupContainment.ts
@src/backend/testUtils/stripSourceComments.ts

<interfaces>
<!-- Extracted from the codebase at planning time. Do not go looking for these again. -->

`src/backend/jest.setupContainment.ts` exports ONLY:
  export { containmentRoot, realHomeAtSetup }
It mutates its OWN process env and is wired as a jest `setupFiles` entry, so it cannot build a
child-process env. The helper is NEW code borrowing its list and its reasoning.

`src/backend/testUtils/stripSourceComments.ts` exports:
  export function stripSourceComments(source: string): string
  export function stripTrailingLineComment(line: string): string
  export function stripTrailingLineCommentTs(line: string): string

Jest layout (`jest.config.js` + `src/backend/jest.config.js`):
  projects: src/backend, src/common, src/frontend, src/preload, meta
  backend displayName: 'Backend'   (case-sensitive for --selectProjects)
  backend testMatch: ['**/__tests__/**/*.test.ts'], roots: ['<rootDir>/src/backend']
  backend setupFiles: jest.setupContainment.ts ; globalSetup: jest.globalSetup.js
  jest.globalSetup.js publishes a run-wide root under process.env.GAMELIB_JEST_RUN_ROOT

Lint ceilings (`meta/lintScoped.cjs`, single source of truth):
  SRC_CEILING = 1124, TESTS_CEILING = 638, SRC_MIN_FILES = 375, TESTS_MIN_FILES = 220
  src scope lints '.' with ignorePatterns ['**/__tests__/**', '**/__mocks__/**']
  -> `src/backend/testUtils/fakeHomeProfile.ts` is linted in the SRC scope
  -> `src/backend/__tests__/fakeHomeIsolation.test.ts` is linted in the TESTS scope
</interfaces>
</context>

<planner_notes>
Four measured findings that differ from the brief and from the todo. Flagged, not planned around.
None of them touch D1-D4, which are locked and implemented as written.

**N1 — the lzma suite has THREE spawn sites, not two.** The todo names
`lzmaNativeSeaRealBuild.test.ts:209` and `:297`; the task brief repeats "TWO spawn sites".
Measured at HEAD `31b833a52`: `grep -c "spawnCapture(binaryPath"` returns **3**, with identical
env blocks at lines **209, 297 and 415**. Item 3 therefore converts **FOUR** blocks, not three
(3 in lzma + 1 in `decompressWorkerRealBuild.test.ts:115`). Re-locate by reading, not by line
number — another session has been committing to this branch today.

**N2 — the todo's "missing five of the eight" is wrong; it is four.** Each block sets
`HOME`, `USERPROFILE`, `XDG_STATE_HOME`, `LOCALAPPDATA` — four of eight. Missing: `APPDATA`,
`XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`. The leak is real and item 3 still stands on
its own merits; only the magnitude was overstated. The file wins over the todo.

**N3 — `CLAUDE.md`'s `## Conventions` is inside a GSD-managed marker block.** Lines 103/148 are
`<!-- GSD:conventions-start source:CONVENTIONS.md -->` / `<!-- GSD:conventions-end -->`. The only
`CONVENTIONS.md` in the repo is `.planning/spikes/CONVENTIONS.md`, and it does **not** contain the
existing todo-triage rule (`grep -c` = 0; its headings are Stack/Structure/Patterns/Tools). So the
todo-triage convention was written directly into the managed block and has survived there. Writing
the new rule as its sibling follows that precedent exactly and honours D1. The residual risk — a
future regeneration from a source that lacks both rules — is a **finding to record, not to route
around**. Do NOT write into `.planning/spikes/CONVENTIONS.md`; D1 explicitly rejected it as host.

**N4 — `captureShellScrollback.ts` is not in the class the todo assumed.** It spawns
`pnpm tauri:dev` (line ~686), not the compiled sidecar binary, and its `finish()` snapshots
`gamelib.log` via `resolveGamelibLogPath()`, which reads the **harness's own** `homedir()`. So
converting it has a coupling the todo does not mention: if the child gets a fake profile but the
snapshot path does not, the app writes its log into the fake profile while the harness copies the
REAL one — `gamelibLogSnapshot` goes stale or empty and `analyzeCapture`'s cookie-leg detection
silently measures nothing. Task 2 handles both halves. Flagged honestly: this harness launches the
whole app and is arguably in the same profile-dependent class as the smoke gate, but **D3 named it
mandatory and this plan implements that**. If conversion is measured to change its verdict, that is
a finding to report in the FINDING, not to absorb.
</planner_notes>

<tasks>

<task type="auto">
  <name>Task 1: The convention (item 1) and the helper (item 2)</name>
  <files>CLAUDE.md, src/backend/testUtils/fakeHomeProfile.ts</files>
  <action>
FIRST, re-read `src/backend/jest.setupContainment.ts` and confirm the env list at execution time.
At planning time the eight assignments were measured at lines 466-502 and re-asserted in the
`envExpectations` table at 577-586, as:
HOME=root; USERPROFILE=root; APPDATA=root/AppData/Roaming; LOCALAPPDATA=root/AppData/Local;
XDG_CONFIG_HOME=root/.config; XDG_STATE_HOME=root/.local/state; XDG_DATA_HOME=root/.local/share;
XDG_CACHE_HOME=root/.cache.
**If the file now differs, the FILE WINS — implement what it says and say so in the FINDING.**

Create `src/backend/testUtils/fakeHomeProfile.ts` owning exactly the three things D3 names and
nothing else. Export `FAKE_HOME_ENV_KEYS` (the eight key names, as a readonly tuple — one list, so
the gate and the helper can never disagree) and `createFakeHomeProfile(options?)` returning a
handle with: `root`, `env` (the eight, derived from `root`), `childEnv(base?)` (spread
`base ?? process.env`, then override all eight), `registerCapture(path)`, and `dispose()`.

Mint the root with `mkdtempSync` followed by `chmodSync(root, 0o700)`. Carry
`jest.setupContainment.ts`'s MEASURED reasoning into the helper's docstring in its corrected form:
`mkdtemp`'s 0700 is the SECURITY control, because umask can only ever REMOVE bits — a `mkdtemp`
directory can never carry group or other bits for a later `chmod` to strip. The `chmodSync` is NOT
redundant and is NOT the security control: it restores owner-write, because `mkdtemp`'s requested
mode is masked and `umask 0277` yields 0500 (measured). Do not delete it as redundant a second time.

Nest the root under `process.env.GAMELIB_JEST_RUN_ROOT` when that variable is present and still
passes the same validation `jest.setupContainment.ts`'s `inheritedRootIsUsable()` applies
(absolute, one level under the real tmp root, `lstat` not `stat` so a planted symlink is rejected,
directory, `(mode & 0o077) === 0`); otherwise fall back to `os.tmpdir()`. Reuse the validation
SHAPE, not the module — importing `jest.setupContainment` would drag two `jest.mock`
registrations into the importer's module graph. Nesting is hygiene only; 0700 is the control.

Per **D4**, mint a FRESH root on every call. No memoization, no reuse-for-speed, no `globalThis`
cache. State in the docstring that a reused profile is a different experiment carrying state
capable of masking a defect, and that reuse is permitted only as an explicitly-named opt-in for a
test whose *purpose* is warm-path behaviour, justified at the call site.

`dispose()` shreds the root and every path passed to `registerCapture()`, each `rmSync(recursive,
force)`, each in its own try/catch so one failure cannot strand the rest. Document that a call site
with no registered captures shreds only the profile — the capture list is what the handle was
given, which is D3's "any captures" read literally.

THEN write the convention into `CLAUDE.md` as a new `###` sibling of
`### Todo triage frontmatter (enforced by CI)`, INSIDE the existing `GSD:conventions-start` /
`GSD:conventions-end` markers (see planner note N3). It must state, in this order:
  1. The rule is the **two-profile rule**, NOT "always fake the HOME": isolated by default for
     every run whose purpose is not profile-dependent, PLUS a **named, deliberate real-profile
     arm** for defects that can only arm under a populated profile.
  2. Why both halves exist, with the measured evidence on each side: real GOG session data written
     to disk twice (`260912-e6k`, `260913-901`); and, on the other side, `260913-901`'s
     `major` un-`unref()`-ed GOG presence timer, armed only behind `GOGUser.isLoggedIn()`, which an
     isolated-by-default gate would have been permanently green against.
  3. That in-repo spawn sites are ENFORCED by `src/backend/__tests__/fakeHomeIsolation.test.ts`,
     and that the ad-hoc/scratchpad half **rests on discipline and is NOT enforceable** — nothing
     can observe a command typed into a scratchpad, and a gate that appeared to cover it would be
     the green-check-proving-nothing pattern this project keeps stamping out. Say this plainly;
     do not hedge it into sounding enforced.
  4. That the eight variables and the `mkdtemp 0700` reasoning are DERIVED from
     `jest.setupContainment.ts`, naming it, so the derivation is traceable rather than re-invented.
  5. That cleanup and redaction are owned by the harness's disposing handle, not by the
     investigator remembering at the end of a long task.

Do not touch `.planning/spikes/CONVENTIONS.md`.
  </action>
  <verify>
Run each as a SEPARATE command. Never chain a write and a jest/tsc read in one `&&` — a read in the
same command as a write has been measured to see the stale tree.

1. Eight keys present in the helper, comment-stripped so prose cannot satisfy the count:
   cd /Users/graysonmitchell/Projects/GameLib && node -e "const{stripSourceComments}=require('./node_modules/ts-node')||{};" 2>/dev/null; npx ts-node -e "const{stripSourceComments}=require('./src/backend/testUtils/stripSourceComments');const s=stripSourceComments(require('fs').readFileSync('src/backend/testUtils/fakeHomeProfile.ts','utf-8'));const k=['HOME','USERPROFILE','APPDATA','LOCALAPPDATA','XDG_CONFIG_HOME','XDG_STATE_HOME','XDG_DATA_HOME','XDG_CACHE_HOME'];const miss=k.filter(x=>!new RegExp('\\\\b'+x+'\\\\b').test(s));console.log('missing:',miss.length?miss.join(','):'(none)');process.exit(miss.length?1:0)"
   Expect `missing: (none)` and exit 0. If `ts-node` is unavailable, run the same logic through
   `node meta/runTs.cjs` or inline the strip in plain node — the requirement is comment-stripped
   counting, not a specific runner.

2. mkdtemp + chmod both present (comment-stripped, same harness as step 1):
   grep -c must be run on STRIPPED text, not the raw file — a raw `grep -c` counts the docstring
   that explains them. Assert `mkdtempSync` >= 1 and `chmodSync` >= 1 in the stripped source.

3. D4 negative assertion — no memoization crept in:
   cd /Users/graysonmitchell/Projects/GameLib && grep -n "globalThis.__GAMELIB" src/backend/testUtils/fakeHomeProfile.ts; test $? -ne 0 && echo "OK: no globalThis memo"
   (Do NOT use `grep -qv` for this — it exits 1 whenever ANY non-matching line exists and would
   assert nothing.)

4. Typecheck: cd /Users/graysonmitchell/Projects/GameLib && npx tsc --noEmit
   Expect exit 0. Note `tsc` cannot see lint errors; step 5 is not optional.

5. Lint, measured immediately (capture the numbers, do not compare to any recorded figure):
   cd /Users/graysonmitchell/Projects/GameLib && pnpm lint 2>&1 | tail -20
   Expect exit 0 against SRC_CEILING 1124 / TESTS_CEILING 638. Paste the reported counts. If a
   ceiling is now breached, fix the warning — do not raise the ceiling.

6. CLAUDE.md placement, proven by position not by presence:
   cd /Users/graysonmitchell/Projects/GameLib && grep -n "GSD:conventions-start\|GSD:conventions-end\|^### " CLAUDE.md | head -20
   The new `###` heading's line number must fall strictly BETWEEN the two marker line numbers.
   Also confirm the unenforceable-half sentence exists: grep -n "not enforceable\|NOT enforceable\|rests on discipline" CLAUDE.md
  </verify>
  <done>
`src/backend/testUtils/fakeHomeProfile.ts` exists, exports `createFakeHomeProfile` and
`FAKE_HOME_ENV_KEYS`, sets all eight variables confirmed against `jest.setupContainment.ts` at
execution time, mints a fresh `mkdtemp` 0700 root per call with no memoization, and disposes the
root plus registered captures. `CLAUDE.md` carries the two-profile rule as a `###` sibling inside
the conventions markers, naming its enforced and unenforceable halves explicitly. `tsc --noEmit`
and `pnpm lint` both exit 0 with the counts pasted.
  </done>
</task>

<task type="auto">
  <name>Task 2: Convert the four spawn blocks and the capture harness; decide buildSidecarSea; write the exemption (items 3, 4, 5)</name>
  <files>src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts, src/backend/storeManagers/steam/__tests__/decompressWorkerRealBuild.test.ts, meta/captureShellScrollback.ts, meta/buildSidecarSea.ts, meta/sidecarStartupSmoke.cjs</files>
  <action>
**Re-locate every site by reading, not by line number** (another session has been committing to
this branch today). At planning time: `lzmaNativeSeaRealBuild.test.ts` lines 209, 297, 415 — see
planner note N1, this is THREE sites, not the two the brief states — and
`decompressWorkerRealBuild.test.ts` line 115. Find them with a search for the env-literal shape.

**Item 3, the two RealBuild suites.** In each suite replace the `mkdtempSync(...)` +
`afterAll(rmSync)` pair with a `createFakeHomeProfile()` handle created in `beforeAll` and
`dispose()`d in `afterAll`, and replace every hand-rolled env literal with
`profile.childEnv({ ...process.env, GAMELIB_SIDECAR_SELFTEST: 'decompress-pool' })` — preserving
each site's own non-HOME keys exactly. `spawnCapture`'s signature and the `liveChildren` reaper are
UNCHANGED; do not refactor them. Keep the existing `afterAll(reapLiveChildren)` registration and
its ordering. In `decompressWorkerRealBuild.test.ts` the same substitution applies to the `fork()`
`env` option; leave the `JEST_WORKER_ID`-stripping `beforeAll` build step alone — it solves a
different problem and its comment explains why.

This widens each block from four variables to eight. **Widening the env changes isolation, not
assertions.** Every existing `expect` must still assert the same thing. If any assertion's meaning
shifts, that is a finding to REPORT, not to absorb.

**Item 4a, `meta/captureShellScrollback.ts`.** Convert per D3, and handle the coupling in planner
note N4 — BOTH halves or the conversion silently hollows the harness:
  (a) pass `profile.childEnv()` to the `spawn('pnpm', ['tauri:dev'], ...)` call, which currently
      passes no `env` key at all;
  (b) make `resolveGamelibLogPath()` resolve inside the SAME fake profile rather than the
      harness's own `homedir()`, or `finish()` will copy the real `~/Library/Logs/GameLib/
      gamelib.log` while the app writes into the fake one. Keep the function's existing
      platform branches and its "mirrors `src/backend/logger/paths.ts`" comment intact; only the
      root it resolves against changes.
Register NOTHING with `registerCapture()` here, and write one sentence saying why: the five
`scratchpad/` artefacts are this harness's deliverable — it prints `capturePaths` and asks the
operator to paste the verdict block back — so shredding them on exit would destroy the thing the
harness exists to produce. The profile itself IS disposed. Call `dispose()` on the path that
actually runs: `finish()` ends in `process.exit()`, and the `child.on('error')` branch exits too,
so both need it (or route both through one exit helper).

**Item 4b, `meta/buildSidecarSea.ts` — inspect and RECORD the decision either way.**
Planning-time inspection says **NO conversion**, on two grounds the executor must re-verify before
accepting: (1) it never executes the product — `verifyBinaryArch()` inspects with `lipo -archs`,
and nothing spawns `outputPath`/`binaryPath` as a command; (2) its children legitimately need the
real profile — `codesign --sign -` reads the macOS keychain, which finding C established is not
`HOME`-isolated anyway, and esbuild/postject resolve through node_modules with caches under the
real `HOME`. Faking `HOME` here would risk the signing path for zero isolation benefit.
Re-verify (1) by searching for any spawn whose command is the produced binary path. If the search
finds one, the decision FLIPS and it gets converted. Either way, write the decision and its reason
into the file's module docstring — a "no" with its reason is an owed deliverable, not a non-event.

**Item 5, `meta/sidecarStartupSmoke.cjs` — comment ONLY, behaviour UNCHANGED.**
`spawnSync(process.execPath, [BUNDLE], { cwd, encoding, timeout })` has **no `env` key** and MUST
keep having none. Add to the header, as a clearly-marked exemption paragraph:
  - that this gate is DELIBERATELY EXEMPT from the two-profile rule's isolated-by-default half;
  - the REASON: it must see a real, populated profile, because that is the only way it catches
    profile-dependent startup hangs. Name the evidence: the `major` defect `260913-901` fixed was
    an un-`unref()`-ed 5-minute `setInterval` created by `setPresence()` at `gog/presence.ts:39`,
    reachable only behind `GOGUser.isLoggedIn()`. Measured same day, same tree, same command:
    real `HOME` never exits (no exit at 120s, reproduced twice); a cold empty fake `HOME` exits 0
    in 27.7s. Isolating this gate would have made it permanently, confidently green against a
    defect that blocked every PR to `main`/`stable`.
  - the instruction that anyone adding an `env` key here is removing the gate's ability to see the
    class of defect it exists for, and must read that reasoning first.
  - the pointer to its machine-readable twin: the exemption entry in
    `src/backend/__tests__/fakeHomeIsolation.test.ts`, whose reason text Task 3 pins against this
    file so the two cannot drift apart.
Do NOT add an `env` key. Do NOT otherwise change this file's behaviour.
  </action>
  <verify>
Write first, then run — separate commands, never `edit && npx jest` in one line.

1. Zero hand-rolled env literals remain (comment-stripped, both trees):
   cd /Users/graysonmitchell/Projects/GameLib && grep -rn "HOME: fakeHome\|HOME: fakeHome," --include="*.ts" --include="*.cjs" src meta; echo "exit=$?"
   Expect no output and `exit=1` (grep found nothing). At planning time this returned exactly four
   hits: lzma 209/297/415 and decompress 115.

2. All four sites now route through the helper:
   cd /Users/graysonmitchell/Projects/GameLib && grep -c "childEnv\|createFakeHomeProfile" src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts src/backend/storeManagers/steam/__tests__/decompressWorkerRealBuild.test.ts meta/captureShellScrollback.ts
   Expect >= 2 for each file (one construction + one use; lzma will be higher).

3. The smoke gate still has NO `env` key — the single most important assertion in this plan:
   cd /Users/graysonmitchell/Projects/GameLib && grep -n "env" meta/sidecarStartupSmoke.cjs
   Every hit must be inside a comment. There must be NO `env:` property on either `spawnSync` call.
   Confirm positively too: grep -n "spawnSync(process.execPath" meta/sidecarStartupSmoke.cjs and
   read the option object — it must remain `{ cwd, encoding, timeout }`.

4. The exemption reason is actually written (not just the filename):
   cd /Users/graysonmitchell/Projects/GameLib && grep -n "presence\|isLoggedIn\|EXEMPT" meta/sidecarStartupSmoke.cjs
   Expect hits naming the mechanism, not merely the word "exempt".

5. Typecheck: cd /Users/graysonmitchell/Projects/GameLib && npx tsc --noEmit  (expect 0)

6. **Both RealBuild suites must still pass.** They run a real cold `pnpm build:sidecar-sea`
   (180s `beforeAll`), so time-bound with python3 — BSD userland has no `timeout`:
   cd /Users/graysonmitchell/Projects/GameLib && python3 -c "import subprocess,sys; sys.exit(subprocess.run(['npx','jest','--selectProjects','Backend','src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts','src/backend/storeManagers/steam/__tests__/decompressWorkerRealBuild.test.ts'],timeout=1800).returncode)"
   `--selectProjects Backend` is case-sensitive. Address the suites by PATH, not `-t`: `-t` is a
   regex and these test names contain parentheses, which would match nothing and exit 0 on a
   vacuous run. **Paste the full pass/fail summary including the test counts.** A run that
   collected 0 tests is a FAILURE of this step, not a pass.

7. The smoke gate itself still passes, behaviour unchanged:
   cd /Users/graysonmitchell/Projects/GameLib && python3 -c "import subprocess,sys; sys.exit(subprocess.run(['pnpm','smoke:sidecar'],timeout=300).returncode)"
   Expect `[sidecar-smoke] PASS`. If it hangs or fails, STOP — that is the exact defect class the
   exemption protects and it must not be traded away for this task.

8. `meta/buildSidecarSea.ts` decision recorded either way:
   cd /Users/graysonmitchell/Projects/GameLib && grep -n "two-profile\|fake-HOME\|fakeHome" meta/buildSidecarSea.ts
   Expect at least one hit carrying the decision and its reason.

9. `meta` jest project still green (it owns `buildSidecarSea.test.ts`):
   cd /Users/graysonmitchell/Projects/GameLib && python3 -c "import subprocess,sys; sys.exit(subprocess.run(['npx','jest','--selectProjects','meta'],timeout=900).returncode)"
   Confirm the collected-test count is non-zero.
  </verify>
  <done>
No `HOME: fakeHome` literal survives anywhere under `src/` or `meta/`; all four spawn blocks and
`captureShellScrollback.ts` route through `createFakeHomeProfile`, with the harness's
`gamelib.log` snapshot path redirected into the same profile. `meta/buildSidecarSea.ts` carries a
written decision and reason. `meta/sidecarStartupSmoke.cjs` has an exemption paragraph naming the
`gog/presence.ts` mechanism and the 120s-vs-27.7s measurement, and still passes NO `env` key.
Both RealBuild suites pass with non-zero collected counts pasted, `pnpm smoke:sidecar` passes, and
`tsc --noEmit` exits 0.
  </done>
</task>

<task type="auto">
  <name>Task 3: The gate with a proven negative control (item 6), then disposition</name>
  <files>src/backend/__tests__/fakeHomeIsolation.test.ts, .planning/todos/pending/2026-09-12-live-gate-scripts-need-fake-home-isolation-by-default.md</files>
  <action>
Create `src/backend/__tests__/fakeHomeIsolation.test.ts`, following the established repo-source-gate
idiom (`quitTeardownWiring.test.ts`, `tauriShellSource.test.ts`): `readFileSync` from a
`REPO_ROOT`-anchored path, run every candidate through `stripSourceComments` from
`../testUtils/stripSourceComments` BEFORE matching. Matching raw source is the recorded failure
mode here — a gate is satisfied by the prose that names it, and a raw `grep -c` counts comments.

Scope: every `.ts`/`.tsx`/`.cjs`/`.js` file under `src/` and `meta/`, walked with `readdirSync
({withFileTypes:true})` and `node_modules`/`build`/`dist` pruned.

Assertion 1 — the rule. In comment-stripped source, no file may assign any of
`FAKE_HOME_ENV_KEYS` inside an inline object literal passed as a spawn/fork/exec `env`. Import the
key list FROM the helper rather than retyping it, so the gate and the helper can never disagree.
Allowed: `src/backend/testUtils/fakeHomeProfile.ts` itself (it must assign them — that is its job),
`src/backend/jest.setupContainment.ts` (it assigns `process.env.*`, a different shape, for the jest
process itself), and the declared exemptions below.

Assertion 2 — the exemption table, designed in from the start, NOT patched in after it fires.
Per CLAUDE.md's own rule, never widen a gate's vocabulary to admit a value that failed. So:
  - `EXEMPTIONS` is an array of `{ file, reason }` where `reason` is prose naming the REASON, not
    the filename.
  - The gate asserts each exempt file still EXISTS on disk. A deleted exempt file must turn the
    gate red, not silently pass — a stale exemption is how a gate rots.
  - The gate asserts each exempt file's own source still contains a distinctive anchor phrase from
    its `reason`, so the machine-readable exemption and the human-readable header comment cannot
    drift apart. Pick the anchor from the TEXT TASK 2 ACTUALLY WROTE — read it out of the file;
    an anchor retyped from a display copy silently no-ops.
  - The single entry is `meta/sidecarStartupSmoke.cjs`, reason: it must inherit the operator's real
    profile because profile-dependent startup hangs — `260913-901`'s un-`unref()`-ed GOG presence
    interval, armed only behind `GOGUser.isLoggedIn()` — cannot arm under an empty profile;
    isolating it would make it permanently green against a `major`, PR-blocking defect.

Assertion 3 — anti-vacuity, because a gate that scans nothing passes. Assert the walk found at
least a floor of files (set it near half the measured count, the same reasoning
`meta/lintScoped.cjs`'s `minFiles` floors use, and say so), AND that the helper file was among
those scanned. A rename that hollows this gate must turn it red.

**Then run the negative control, and show all four states.** Create a throwaway
`src/backend/negativeControlFakeHome.ts` (NOT `*.test.ts` — jest's backend `testMatch` is
`**/__tests__/**/*.test.ts` and it must not be collected as a suite) containing a spawn call with a
hand-rolled `env` literal assigning `HOME`. Run the gate: it must go RED, and the failure message
must NAME that file. Delete the file. Run the gate again: GREEN. Then prove restoration with
`git status --porcelain src meta` — the control file must be gone and nothing else disturbed.

**Disposition.** All six items landing closes the todo: `git mv` it from
`.planning/todos/pending/` to `.planning/todos/completed/`. If any item did NOT land, LEAVE it in
`pending/`, add a `## What remains` section naming exactly what is owed, and keep the frontmatter
keys bare-lowercase-exact (`severity: medium`, `platform: any`, `ready: code`) — `completed/` is
exempt from the frontmatter gate, `pending/` is not. **Item 3 is a real leak fix on its own merits
and is the one item that does NOT get dropped if scope must shrink.**

Commit with an EXPLICIT pathspec on every commit. These four pre-existing dirt paths must NEVER be
staged: `.planning/todos/completed/2026-09-11-humble-keys-title-wrap-sort-label-and-owned-badge-contrast-unverified-live.md`,
`.claude/skills/archify/`, `.planning/quick/260912-d84-align-the-humble-keys-game-column-header/`,
`skills-lock.json`. Run `graphify update .` as the final action, since `src/` changed.
  </action>
  <verify>
Run these as separate commands, in this order, pasting output for each.

1. Gate GREEN on the clean tree:
   cd /Users/graysonmitchell/Projects/GameLib && python3 -c "import subprocess,sys; sys.exit(subprocess.run(['npx','jest','--selectProjects','Backend','src/backend/__tests__/fakeHomeIsolation.test.ts'],timeout=600).returncode)"
   Paste the collected-test count. Zero collected tests is a FAILURE, not a pass.

2. NEGATIVE CONTROL, red arm — write the control file, then run as a SEPARATE command (a jest run
   chained to a write with `&&` has been measured to read the stale tree):
   cd /Users/graysonmitchell/Projects/GameLib && python3 -c "import subprocess,sys; r=subprocess.run(['npx','jest','--selectProjects','Backend','src/backend/__tests__/fakeHomeIsolation.test.ts'],timeout=600); print('exit',r.returncode); sys.exit(0 if r.returncode!=0 else 1)"
   Must exit 0 here — i.e. jest must have FAILED. Paste the failure message and confirm it names
   `negativeControlFakeHome.ts`. A red that does not name the offending file is not a pass.

3. NEGATIVE CONTROL, green arm — delete the control file, then re-run step 1's command separately.
   Must pass again with the same non-zero collected count.

4. Restoration proven:
   cd /Users/graysonmitchell/Projects/GameLib && git status --porcelain src meta
   `negativeControlFakeHome.ts` must not appear. Only the intended files may show as modified.

5. Exemption integrity — break it deliberately and confirm the gate notices. Temporarily rename
   `meta/sidecarStartupSmoke.cjs`, run the gate (must go RED on the "exempt file must exist" arm),
   rename it back, re-run (GREEN). This proves the exemption is not a free pass.

6. Full backend suite, so the new gate has not disturbed a neighbour:
   cd /Users/graysonmitchell/Projects/GameLib && python3 -c "import subprocess,sys; sys.exit(subprocess.run(['npx','jest','--selectProjects','Backend'],timeout=2400).returncode)"
   Known context: `test:ci` has a recorded RED-with-zero-failures condition. If this run is red,
   determine whether the failure is attributable to THIS change before proceeding — name the sha
   and the suite rather than calling it "pre-existing".

7. Lint and typecheck, measured now, not compared to any recorded figure:
   cd /Users/graysonmitchell/Projects/GameLib && npx tsc --noEmit
   cd /Users/graysonmitchell/Projects/GameLib && pnpm lint 2>&1 | tail -20
   Both exit 0; paste the warning counts against SRC_CEILING 1124 / TESTS_CEILING 638.

8. Planning gates — capture the count AT EXECUTION TIME and compare to THAT, never to a literal
   "11/11" and never to a baseline sha:
   cd /Users/graysonmitchell/Projects/GameLib && pnpm planning-gates 2>&1 | tail -20
   Paste the pass/total line. Exit 0 required.

9. Todo disposition correct:
   cd /Users/graysonmitchell/Projects/GameLib && ls .planning/todos/completed/ | grep fake-home; ls .planning/todos/pending/ | grep fake-home
   Exactly one of these two may produce a hit. If it is still in `pending/`, confirm the three
   frontmatter keys are bare-lowercase-exact and a `## What remains` section is present.

10. Clean staging proven before every commit:
   cd /Users/graysonmitchell/Projects/GameLib && git status --porcelain
   None of the four named dirt paths may appear in any `git add`/commit pathspec.
  </verify>
  <done>
`src/backend/__tests__/fakeHomeIsolation.test.ts` passes with a non-zero collected count, matches
only comment-stripped source, imports its key list from the helper, and carries a reason-bearing
exemption table that goes red if the exempt file disappears or its header anchor drifts. The
negative control has been shown red (naming the offending file), then green, with restoration
proven by `git status --porcelain`. `pnpm lint`, `npx tsc --noEmit` and `pnpm planning-gates` all
exit 0 with counts pasted from this run. The todo is in `completed/` if all six items landed, or in
`pending/` with `## What remains` and valid bare-lowercase frontmatter if not. Every commit used an
explicit pathspec; `graphify update .` ran last.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| test/harness process -> spawned child | the child inherits an env that decides which profile it reads |
| spawned child -> operator's real profile | GOG/Epic/Humble session data, tokens, usernames |
| spawned child -> scratchpad capture files | child stdout/diagnostic reports embed env + session frames |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-arr-01 | Information Disclosure | four hand-rolled spawn env blocks, 4 of 8 vars | mitigate | Task 2 routes all four through `childEnv()`, closing `APPDATA`/`XDG_CONFIG_HOME`/`XDG_DATA_HOME`/`XDG_CACHE_HOME` |
| T-arr-02 | Information Disclosure | `captureShellScrollback.ts` spawning `tauri:dev` with no `env` key | mitigate | Task 2 passes an isolated `childEnv()` and redirects the log-snapshot path into the same profile |
| T-arr-03 | Information Disclosure | scratchpad captures outliving the run (realised twice) | mitigate | helper's `registerCapture`/`dispose` moves shredding from operator memory into the harness |
| T-arr-04 | Tampering | world-writable tmp / symlink capture of the profile root | mitigate | `mkdtemp` (atomic, unpredictable suffix, 0700) + `lstat`-based validation of any inherited run root |
| T-arr-05 | Denial of Service (of the gate itself) | isolating `sidecarStartupSmoke.cjs` | accept, deliberately | EXEMPT: a real profile is the only way it sees profile-dependent hangs; reason written into the file AND pinned by the gate's exemption table |
| T-arr-06 | Repudiation | exemption rotting into a silent free pass | mitigate | gate asserts the exempt file exists and still contains its reason anchor |
| T-arr-07 | Tampering | npm/pip/cargo installs | n/a | **This task installs NO packages.** No Package Legitimacy Gate applies; if an install becomes necessary, stop and run the audit protocol first. |
</threat_model>

<verification>
- The eight variables were re-read from `jest.setupContainment.ts` at execution time and either
  confirmed or reported as differing (the file wins).
- `grep -rn "HOME: fakeHome" src meta` returns nothing.
- `meta/sidecarStartupSmoke.cjs` still passes no `env` key, and `pnpm smoke:sidecar` passes.
- The gate's negative control was shown red-then-green with restoration proven.
- Both RealBuild suites pass with non-zero collected test counts pasted.
- `pnpm lint`, `npx tsc --noEmit`, `pnpm planning-gates` exit 0 with counts measured this run.
- No dirt path was staged; `graphify update .` ran last.
</verification>

<success_criteria>
All six owed items land and are individually traceable:
1. CLAUDE.md two-profile rule, unenforceable half labelled as such -> Task 1
2. `src/backend/testUtils/fakeHomeProfile.ts` (eight vars, mkdtemp 0700, disposal) -> Task 1
3. Four hand-rolled spawn blocks converted (THREE in lzma, one in decompress) -> Task 2
4. `captureShellScrollback.ts` converted; `buildSidecarSea.ts` decided and recorded -> Task 2
5. Exemption comment in `meta/sidecarStartupSmoke.cjs`, behaviour unchanged -> Task 2
6. Gate + reasoned exemption + proven negative control -> Task 3

If scope must shrink, item 3 is the one that does NOT get dropped, and the todo stays in
`pending/` with `## What remains`.
</success_criteria>

<output>
Write `.planning/quick/260913-arr-fake-home-isolation-helper-and-gate/260913-arr-FINDING.md` on
completion, recording at minimum: the confirmed-or-differing eight-variable list; the three-vs-two
lzma site count; the `buildSidecarSea.ts` decision and its reason; the negative control's red
message; the measured lint/planning-gates counts; and the N3 CLAUDE.md marker-block risk.
</output>
</content>
</invoke>
