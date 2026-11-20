---
phase: quick-260821-lge
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/bottle.ts
  - src/backend/storeManagers/steam/__tests__/bottle.test.ts
  - src/frontend/screens/Game/GamePage/components/steamBottleDefaults.ts
autonomous: true
requirements: [QUICK-260821-LGE-01]
must_haves:
  truths:
    - "provisionBottle() returns {status:'error'} when opts.wineVersion.type is not 'crossover'"
    - "The rejection happens BEFORE any steamBottleConfigStore.set(), cxbottle spawn, rmSync, or downloadFile"
    - "provisionBottle() is unchanged for a CrossOver engine and for an absent opts.wineVersion"
    - "provisionBridgeBottle() is byte-for-byte unchanged"
  artifacts:
    - path: "src/backend/storeManagers/steam/bottle.ts"
      provides: "CrossOver-only guard clause in provisionBottle, step (1c)"
      contains: "provisionBottle: rejected non-CrossOver engine"
    - path: "src/backend/storeManagers/steam/__tests__/bottle.test.ts"
      provides: "RED-provable rejection test + non-over-fire discriminator"
      contains: "rejects a non-CrossOver wineVersion"
  key_links:
    - from: "src/backend/storeManagers/steam/bottle.ts"
      to: "opts.wineVersion.type"
      via: "guard clause before step (2) store write"
      pattern: "opts\\.wineVersion\\.type !== 'crossover'"
---

<objective>
Close the last open half of the `steam-bottle-gptk-engine-produces-broken-bottle`
todo: mirror `provisionBridgeBottle()`'s CrossOver-only rejection guard into
`provisionBottle()`, placed before its step (2) store write.

Purpose: the two sibling provisioners currently disagree about the same rule
(CrossOver-only), which is exactly how the original defect got in. Today a
non-CrossOver `opts.wineVersion` is persisted to `steamBottleConfigStore`
unchecked; the rejection is implicit (a silent self-heal on the next
`getSteamBottleSettings()` read) rather than an explicit error the caller can
surface. This is defense-in-depth, not a live failure path.

Output: a guard clause, two jest tests, a corrected stale comment, and the todo
moved to `.planning/todos/completed/`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/todos/pending/steam-bottle-gptk-engine-produces-broken-bottle.md
@src/backend/storeManagers/steam/bottle.ts
@src/backend/storeManagers/steam/__tests__/bottle.test.ts
</context>

<interfaces>
<!-- Verified against source 2026-08-21. Do not re-explore the codebase for these. -->

Both provisioners share ONE return type (`bottle.ts:602`) — the guard shape
transfers verbatim, no adaptation needed:

```ts
export type ProvisionBottleResult = { status: 'done' | 'error'; error?: string }

export async function provisionBottle(opts?: {
  bottleName?: string
  wineVersion?: WineInstallation
}): Promise<ProvisionBottleResult>

export async function provisionBridgeBottle(opts?: {
  bottleName?: string
  wineVersion?: WineInstallation
}): Promise<ProvisionBottleResult>
```

Current `provisionBottle` step layout (line numbers approximate — locate by the
comment text, not by number):
- `(1)`  ~L663 — unsafe bottle name reject (T-17-01)
- `(1b)` ~L677 — shared-bottle scope guard (CR-01 / D-01)
- `(2)`  ~L699 — **`steamBottleConfigStore.set(...)` block — the guard goes ABOVE this**
- `(2b)` ~L705 — win32 stale-bottle destructive recreate
- `(6)`  ~L841 — `checkWineBeforeLaunch` recovery, re-reads `getSteamBottleSettings()`

The model to mirror, `provisionBridgeBottle` step (2), `bottle.ts:1165-1176`:

```ts
  // (2) D-08: CrossOver-only. Reject a non-CrossOver engine before any side
  // effect — do not silently create a broken GPTK/toolkit bottle (T-24-09).
  if (opts?.wineVersion && opts.wineVersion.type !== 'crossover') {
    logError(
      `provisionBridgeBottle: rejected non-CrossOver engine "${opts.wineVersion.type}" for bottle "${bottleName}" (D-08)`,
      LogPrefix.Steam
    )
    return {
      status: 'error',
      error: `The bridge bottle requires a CrossOver engine, got "${opts.wineVersion.type}"`
    }
  }
```

Sole production call site (frontend-driven IPC, already filtered upstream by
`resolveSubmittedBottleEngine`, so the guard cannot over-fire in practice):
- `src/backend/main.ts:932` — `addHandler('steamBottleProvision', async (event, args) => provisionBottle(args))`
- `src/backend/sidecar/steamAuthFlowRegistration.ts:231` — sidecar mirror of the same

Test file conventions (`__tests__/bottle.test.ts`): mocks in scope are
`mockedSet`, `mockedSpawnAsync`, `mockedRmSync`, `mockedDownloadFile`,
`mockedExistsSync`, `mockedGlobalConfigGet`, `mockedGetNodefault`, plus a local
`setBottleFs({conf, steamExe, steamSetupExe})` helper defined at the top of
`describe('provisionBottle')` (~L601). The bridge-side model tests live at
~L1437-1470 (`describe('provisionBridgeBottle')`).
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add the CrossOver-only guard to provisionBottle</name>
  <files>src/backend/storeManagers/steam/bottle.ts</files>
  <behavior>
    - `provisionBottle({ bottleName: 'GameLibSteam', wineVersion: {type:'toolkit',...} })`
      → `{ status: 'error', error: /crossover/i }`, and `steamBottleConfigStore.set`,
      `spawnAsync`, `rmSync`, `downloadFile` are all NOT called.
    - `provisionBottle({ bottleName: 'GameLibSteam', wineVersion: {type:'crossover',...} })`
      → proceeds exactly as today (store writes happen, cxbottle runs).
    - `provisionBottle({ bottleName: 'GameLibSteam' })` (no wineVersion)
      → proceeds exactly as today. The guard is opt-in on `opts.wineVersion` only.
  </behavior>
  <action>
Insert a new guard clause in `provisionBottle()` immediately AFTER the `(1b)`
CR-01 shared-bottle guard's closing brace and immediately BEFORE the
`// (2) Persist the chosen wine/bottle identity before composing settings.`
comment and its `steamBottleConfigStore.set('bottleName', bottleName)` line.

Number the new step `(1c)`. Do NOT renumber the existing `(2)`/`(2b)`/`(3)`…
steps — this is a guard-clause insertion, not a restructure, and the existing
numbers are referenced by comments elsewhere in the file and in
`steamBottleDefaults.ts`.

Mirror `provisionBridgeBottle`'s guard shape verbatim, adapting only the three
things that must differ: the function name in the log message, the step/ID
citation, and the user-facing error text. Concretely:

- Condition: `if (opts?.wineVersion && opts.wineVersion.type !== 'crossover')`
- `logError` with a template string prefixed `provisionBottle:` (matching this
  function's four other `logError` call sites), naming the rejected
  `opts.wineVersion.type` and the `bottleName`, passing `LogPrefix.Steam` as the
  second argument.
- Return `{ status: 'error', error: ... }` where the message names CrossOver and
  echoes the rejected type — the error string MUST contain the substring
  "CrossOver" so the test's `/crossover/i` assertion is meaningful.

Citation convention: `provisionBridgeBottle` cites `D-08` / `T-24-09`. No new
decision or threat ID has been assigned for this closure, so cite the todo file
by name instead of inventing one. The comment above the guard must state:
  - that it mirrors `provisionBridgeBottle`'s D-08 guard (name the sibling
    explicitly, so the two are greppable as a pair),
  - that it rejects BEFORE the step (2) store write so a broken engine is never
    persisted,
  - `steam-bottle-gptk-engine-produces-broken-bottle.md` as the source todo.

Do NOT touch `provisionBridgeBottle`. Do NOT touch `persistBottleWineVersion`
(its permissiveness is a recorded decision, review B-WR-08 — `launcher.ts`'s
`checkWineBeforeLaunch` self-heal is a legitimate producer of a non-CrossOver
value there). Do NOT touch step (6)'s `steamBottleConfigStore.set('wineVersion', ...)`
— that value comes from `getSteamBottleSettings()`, which already self-heals.
Do NOT build any prefix-based GPTK provisioning path (option (b) in the todo is
explicitly out of scope).
  </action>
  <verify>
    <automated>pnpm exec tsc --noEmit && pnpm exec eslint src/backend/storeManagers/steam/bottle.ts</automated>
  </verify>
  <done>
`grep -n "provisionBottle: rejected non-CrossOver engine" src/backend/storeManagers/steam/bottle.ts`
returns exactly one line, and its line number is LESS than the line number of
`steamBottleConfigStore.set('bottleName', bottleName)`. `tsc --noEmit` clean,
`eslint` clean on the file (lint is a separate CI workflow from the tsc gate —
a clean `codecheck` does not imply a clean lint).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add jest coverage mirroring the bridge bottle's D-08 tests</name>
  <files>src/backend/storeManagers/steam/__tests__/bottle.test.ts</files>
  <behavior>
    - New test "rejects a non-CrossOver wineVersion (toolkit/GPTK) before any store
      write or cxbottle call": asserts `status === 'error'`,
      `error` matches `/crossover/i`, and `mockedSet`, `mockedSpawnAsync`,
      `mockedRmSync`, `mockedDownloadFile` were NOT called.
    - New DISCRIMINATOR test "does NOT over-fire: a CrossOver wineVersion is still
      persisted": asserts `mockedSet` WAS called with `'wineVersion'` and the
      crossover engine, i.e. the guard did not swallow the happy path.
  </behavior>
  <action>
Add a nested `describe` inside the existing `describe('provisionBottle')` block
(~L601), placed after the existing `describe('CR-01 shared-bottle guard')`.
Model it on the bridge-side pair at ~L1437-1470
(`describe('provisionBridgeBottle')` → the two `D-08:` tests).

Two required tests:

1. REJECTION. Pass a `WineInstallation` with `type: 'toolkit'` (name it
   'Game Porting Toolkit', bin '/usr/bin/gptk-wine' — same fixture the bridge
   test uses) together with a bottleName of `'GameLibSteam'`. Use `'GameLibSteam'`
   specifically, NOT `'GameLib'` — a shared-bottle name would let the CR-01
   guard at step (1b) fire first and the test would pass for the wrong reason.
   Prime `mockedGlobalConfigGet` with `wineCrossoverBottle: 'GameLib'` (the
   existing tests' shape) so the CR-01 guard is demonstrably NOT the one that
   fires. Assert error status, `/crossover/i` on the message, and the four
   not-called mocks.

2. DISCRIMINATOR. Pass `type: 'crossover'` with the same bottleName, drive the
   FS mocks the way the existing happy-path provisionBottle tests do
   (`setBottleFs` + a `mockedSpawnAsync.mockImplementation` that flips
   `cxbottle.conf` into existence), and assert `mockedSet` WAS called with
   `'wineVersion'` and the crossover object. Without this the rejection test
   alone would still pass if the guard rejected unconditionally.

RED-PROOF REQUIREMENT (this repo has a ledgered lesson that an assertion which
never fails against a known-bad input guards nothing): before finalising, run
the new rejection test against the PRE-guard code —
`git stash push -- src/backend/storeManagers/steam/bottle.ts` is NOT permitted
(a prior executor's `git stash` stranded a concurrent session's work, twice).
Instead prove RED by temporarily commenting out the guard's `return` statement
in place with an editor edit, running the single test, confirming it FAILS, then
restoring the line. Record the observed RED failure message in the SUMMARY.
  </action>
  <verify>
    <automated>pnpm exec jest src/backend/storeManagers/steam/__tests__/bottle.test.ts</automated>
  </verify>
  <done>
The full `bottle.test.ts` suite is green with the two new tests present, and the
SUMMARY records the observed RED failure output for the rejection test against
the guard-disabled build. No pre-existing test in the file was modified or
weakened to accommodate the guard — if any existing test goes red, that is a
real over-fire and the guard is wrong, not the test.
  </done>
</task>

<task type="auto">
  <name>Task 3: Correct the now-stale KNOWN REMAINING GAP comment and close the todo</name>
  <files>src/frontend/screens/Game/GamePage/components/steamBottleDefaults.ts, .planning/todos/pending/steam-bottle-gptk-engine-produces-broken-bottle.md</files>
  <action>
Two bookkeeping steps. Both are required — this repo has a ledgered lesson that
a stale status doc sits undetected for weeks.

(a) COMMENT-ONLY correction in `steamBottleDefaults.ts`. The doc comment above
`resolveSubmittedBottleEngine` (~L157-163) currently reads "KNOWN REMAINING GAP,
recorded rather than silently left: `provisionBottle` … Closing that needs the
`provisionBottle` mirror of the `provisionBridgeBottle` guard, in `bottle.ts`,
which this pass could not edit." That statement becomes FALSE the moment Task 1
lands. Rewrite that paragraph to record that the gap is now CLOSED by
`provisionBottle`'s step (1c) guard, keeping the surrounding rationale
(the "Deliberately NOT implemented by narrowing…" paragraph) intact.

STRICT SCOPE: comment text only. Do not change a single line of executable code
in this file — `resolveSubmittedBottleEngine`, `resolveSteamBottleEngine`, and
`isUsablePersistedEngine` all encode locked decisions and stay exactly as-is.
Verify with `git diff -- src/frontend/.../steamBottleDefaults.ts` that every
changed line is inside a comment block.

(b) CLOSE THE TODO. Task 1 closes the last open item in
`steam-bottle-gptk-engine-produces-broken-bottle.md` ("The only thing still
open" — the `provisionBottle` guard). Option (b), the prefix-based GPTK
provisioning path, was never in scope for this todo's recommended fix (the todo
itself recommends "(a) as a standalone fix regardless of whether (b) is ever
pursued"), so its remaining out-of-scope status does NOT block closure.

Append a dated closing note to the todo body — "## Update 2026-08-21 — CLOSED by
quick task 260821-lge" — stating what landed (the step (1c) guard + the two
tests + the steamBottleDefaults comment correction) and re-stating explicitly
that option (b) remains out of scope and untouched, so a future reader does not
mistake closure for GPTK support. Then `git mv` the file from
`.planning/todos/pending/` to `.planning/todos/completed/`.
  </action>
  <verify>
    <automated>test -f .planning/todos/completed/steam-bottle-gptk-engine-produces-broken-bottle.md && test ! -f .planning/todos/pending/steam-bottle-gptk-engine-produces-broken-bottle.md && ! git diff HEAD -- src/frontend/screens/Game/GamePage/components/steamBottleDefaults.ts | grep '^+' | grep -v '^+++' | grep -vE '^\+\s*(\*|//|/\*)' | grep -q .</automated>
  </verify>
  <done>
The todo lives in `completed/` with a dated closing note, it is absent from
`pending/`, and every added line in `steamBottleDefaults.ts` is a comment line
(the negated grep above fails the task if any added line is executable code).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer → `steamBottleProvision` IPC → `provisionBottle(args)` | The `opts` object (including `wineVersion`) crosses from untrusted renderer input into a function that spawns `cxbottle`, runs `rmSync`, and writes the config store. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-LGE-01 | Tampering | `provisionBottle` `opts.wineVersion` | mitigate | Task 1's step (1c) guard rejects any `type !== 'crossover'` before the store write — this plan IS the mitigation. Closes the asymmetry with `provisionBridgeBottle`'s existing D-08 guard. |
| T-LGE-02 | Denial of Service | `provisionBottle` step (2b) destructive win32 recreate (`cxbottle --delete --force`, `rmSync`) | accept | Already mitigated upstream by the existing (1) `sanitizeBottleName` and (1b) CR-01 shared-bottle guards, both of which run BEFORE the new step (1c). Task 1 must not reorder them; Task 2's rejection test asserts `mockedRmSync` is not called, giving the ordering a regression pin. |
| T-LGE-03 | Information Disclosure | `logError` message interpolating `opts.wineVersion.type` and `bottleName` | accept | `type` is a fixed enum ('wine'/'toolkit'/'crossover'/…); `bottleName` is already sanitized and already appears in four existing `provisionBottle` log lines. No new value class reaches the log. |
| T-LGE-SC | Tampering | npm/pip/cargo installs | mitigate | N/A — this plan installs no packages. No `package.json` change, no lockfile change. If the executor finds itself running any package manager install, the plan has been misread; stop. |
</threat_model>

<verification>
1. `pnpm exec tsc --noEmit` — clean.
2. `pnpm exec eslint src/backend/storeManagers/steam/bottle.ts src/backend/storeManagers/steam/__tests__/bottle.test.ts src/frontend/screens/Game/GamePage/components/steamBottleDefaults.ts` — clean. (Separate CI workflow from the tsc gate; a passing `codecheck` says nothing about lint.)
3. `pnpm exec jest src/backend/storeManagers/steam/__tests__/bottle.test.ts` — green, including the two new tests and every pre-existing test unmodified.
4. Guard ordering, mechanically: the line number of `provisionBottle: rejected non-CrossOver engine` is greater than that of the CR-01 `refusing to provision Steam into the shared` log line and LESS than that of `steamBottleConfigStore.set('bottleName', bottleName)`.
5. `git diff --stat` touches exactly three source/planning files plus the todo move — `bottle.ts`, `bottle.test.ts`, `steamBottleDefaults.ts`, and the renamed todo. Any other file in the diff means scope leaked.
6. `git diff -- src/backend/storeManagers/steam/bottle.ts` shows NO change inside `provisionBridgeBottle` (the function body from `export async function provisionBridgeBottle` to EOF is untouched).
</verification>

<success_criteria>
- `provisionBottle()` rejects a non-CrossOver `opts.wineVersion` with
  `{status:'error'}` before any store write, spawn, rmSync, or download.
- A CrossOver engine and an absent `wineVersion` both behave exactly as before.
- Two new jest tests (rejection + non-over-fire discriminator) pass, and the
  rejection test was demonstrated RED against the guard-disabled build.
- `provisionBridgeBottle`, `persistBottleWineVersion`, `engineFilter.ts`,
  `WineSelector`, and `resolveSubmittedBottleEngine`'s executable code are all
  unchanged.
- The stale KNOWN REMAINING GAP comment in `steamBottleDefaults.ts` is corrected.
- `steam-bottle-gptk-engine-produces-broken-bottle.md` is in
  `.planning/todos/completed/` with a dated closing note that re-states option (b)
  as still out of scope.
</success_criteria>

<output>
Create `.planning/quick/260821-lge-mirror-provisionbridgebottle-s-crossover/260821-lge-SUMMARY.md` when done.

Commit with `git status --short` inspected FIRST and staging by explicit path
(never `git add -A`, never a bare `gsd-sdk query commit` — it stages the entire
tree and has previously absorbed a concurrent session's files):

```
git add src/backend/storeManagers/steam/bottle.ts \
        src/backend/storeManagers/steam/__tests__/bottle.test.ts \
        src/frontend/screens/Game/GamePage/components/steamBottleDefaults.ts \
        .planning/todos/completed/steam-bottle-gptk-engine-produces-broken-bottle.md \
        .planning/todos/pending/steam-bottle-gptk-engine-produces-broken-bottle.md \
        .planning/quick/260821-lge-mirror-provisionbridgebottle-s-crossover/
```

Message: `fix(steam): reject non-CrossOver engine in provisionBottle (260821-lge)`
</output>
