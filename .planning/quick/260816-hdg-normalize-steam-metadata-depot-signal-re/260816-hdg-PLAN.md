---
phase: quick-260816-hdg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/metadataCapture.ts
  - src/backend/storeManagers/steam/__tests__/metadataCapture.test.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/installFormIpc.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts
autonomous: true
requirements:
  - HDG-01

must_haves:
  truths:
    - "A cache entry shaped `{ platformsCaptured: true }` with no `is_windows_native` (the 370-entry pre-D-17 residue) reads as NOT captured at all three depot-signal read boundaries."
    - "A legitimately-written post-D-17 entry (both fields present) still reads as captured — the normalization cannot false-positive on real data."
    - "`getGameInfo()`'s existing self-heal refetch now engages for a residue entry, and because the refetch writes `is_windows_native`, it converges after exactly one fetch per game (no loop)."
    - "The install form's Windows option is offered for a residue game, because `platformsCaptured: false` from the probe lets Phase 34.14's D-04 fail-open engage."
    - "The two mac-nativeness gates (`games.ts` `isBottleEligibleFromPlatforms`, `library.ts` `isBridgeAuthoritativeForInstallState`) STILL read the raw flag — bottle/bridge routing for residue entries is unchanged."
    - "`src/frontend/screens/Library/components/InstallModal/steamPlatformRow.ts` is byte-identical to its pre-plan state."
    - "A future edit that 'corrects' either deliberate non-change, or reverts any of the three normalized sites, fails an automated source gate."
  artifacts:
    - path: "src/backend/storeManagers/steam/metadataCapture.ts"
      provides: "The `depotSignalCaptured` predicate, structurally typed and dependency-free"
      exports: ["depotSignalCaptured"]
      contains: "export function depotSignalCaptured"
      min_lines: 40
    - path: "src/backend/storeManagers/steam/__tests__/metadataCapture.test.ts"
      provides: "9-cell truth table + null/undefined + named headline residue case + readsRawFlag saboteur + source gate over all five sites"
      min_lines: 120
  key_links:
    - from: "src/backend/storeManagers/steam/library.ts"
      to: "src/backend/storeManagers/steam/metadataCapture.ts"
      via: "import + call at the GameInfo seed for steamPlatformsCaptured"
      pattern: "steamPlatformsCaptured:\\s*depotSignalCaptured\\(cachedMeta\\)"
    - from: "src/backend/storeManagers/steam/installFormIpc.ts"
      to: "src/backend/storeManagers/steam/metadataCapture.ts"
      via: "import + call building SteamBottleEligibilityVerdict.platformsCaptured"
      pattern: "platformsCaptured\\s*=\\s*depotSignalCaptured\\(cached\\)"
    - from: "src/backend/storeManagers/steam/games.ts"
      to: "src/backend/storeManagers/steam/metadataCapture.ts"
      via: "import + call in getGameInfo's self-heal refetch gate"
      pattern: "!depotSignalCaptured\\(cached\\)"
---

<objective>
370 of 380 real on-disk `steam_metadata.json` entries carry `platformsCaptured: true`
with NO `is_windows_native` — pre-D-17 residue. That combination is the worst possible
input to the install-form platform row: the depot signal reads as CAPTURED (so Phase
34.14's D-04 fail-open correctly does not engage — fail-open is only for "not fetched
yet"), while `hasSteamWindowsDepot()` returns `false` (absent field, `=== true`
comparison). Net: 370 games conclude "this game has no Windows build" with full
confidence and omit Windows from the selector — exactly the false conclusion Phase
34.14 exists to prevent.

This plan introduces one pure predicate and applies it at exactly three read
boundaries, so the false "captured" claim is cleared at the point of use.

Purpose: make the installed base benefit from Phase 34.14, not just fresh-fetch tests.
Output: `metadataCapture.ts` + its gate, three normalized call sites, two pinned
non-changes, the todo closed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/todos/pending/2026-08-16-steam-metadata-cache-lacks-is-windows-native-pre-d17-residue.md
@src/backend/storeManagers/steam/electronStores.ts
@src/backend/storeManagers/steam/__tests__/steamInstallFormContracts.test.ts

Read for pattern only, DO NOT EDIT:
@src/frontend/screens/Library/components/InstallModal/steamPlatformRow.ts

<decisions_locked>
The approach below is OPERATOR-LOCKED. Do not re-survey alternatives.

A startup migration was explicitly REJECTED and must not be re-proposed:
`MigrationSystem.get().applyMigrations()` is wired ONLY into `src/backend/main.ts:418`,
inside `app.whenReady()`. The Tauri sidecar never runs that block —
`src/backend/sidecar/bootstrap.ts` replicates Electron `whenReady` inits one by one
(see its `initOnlineMonitor()` comments) and migrations are NOT among them. A
`Migration` class would be dead code in the shipping runtime.

HARD PROHIBITION: do NOT loosen `hasSteamWindowsDepot`'s `=== true` to `!== false` in
`src/frontend/screens/Library/components/InstallModal/steamPlatformRow.ts`. That
inverted comparison is the `treatsAbsentAsAvailable` saboteur that three shipped gates
in `steamPlatformRow.test.ts` (~line 200) exist specifically to reject. That file must
end this plan byte-identical (`git diff --exit-code` on it must be clean).
</decisions_locked>

<interfaces>
Current state of the five sites, verified 2026-08-16 (line numbers may drift — match on
expression, not line):

`src/backend/storeManagers/steam/electronStores.ts:102`
```ts
  platformsCaptured?: boolean
```
`is_windows_native?: boolean` is declared at :55 with the "undefined means never
captured, MUST NOT be coerced to available" contract.

NORMALIZE these three:
- `library.ts:791`  `steamPlatformsCaptured: cachedMeta?.platformsCaptured ?? false,`
- `installFormIpc.ts:109`  `const platformsCaptured = cached?.platformsCaptured === true`
- `games.ts:538`  `!existing.is_delisted && cached?.platformsCaptured !== true`

DO NOT TOUCH these two (they read mac-nativeness, a DIFFERENT fact that residue entries
genuinely DID capture; narrowing them would needlessly de-route bottle-eligible games):
- `games.ts:1547`  `return meta?.platformsCaptured === true && meta?.is_mac_native === false`
- `library.ts:225`  `return meta?.platformsCaptured === true && meta?.is_mac_native === false`

Comment-stripping helper used by every backend source gate in this repo:
```ts
// src/backend/testUtils/stripSourceComments.ts
export function stripSourceComments(source: string): string
export function stripTrailingLineComment(line: string): string
```
`stripSourceComments` drops block comments and WHOLE lines that start with a comment
marker. It deliberately does NOT strip a trailing `// ...` appended to a code line.
</interfaces>

<fourth_site_finding>
Planning found a FOURTH raw read the locked brief's table did not enumerate:

`games.ts:1658-1659`, inside `ensurePlatformsCaptured()`:
```ts
    const alreadyCaptured = (): boolean =>
      steamMetadataStore.get(this.appId)?.platformsCaptured === true
```

It stays RAW, and that is correct — do not normalize it. Reasoning, which the executor
must record as an inline comment there (comment-only change to that region):

- Its only consumer is `checkBottleEligibility()` → `isBottleEligible()`, which asks the
  MAC-NATIVENESS question. Residue entries genuinely captured `is_mac_native`, so the
  early return is answering from real data.
- Normalizing it would force every one of the 370 residue games through the bounded
  15,000ms `METADATA_FETCH_TIMEOUT_MS` poll on the install/launch hot path, for a fact
  it already knows — the same cost §3 of the brief rejects for the two mac gates.
- Convergence does not depend on it. `getGameInfo()`'s normalized gate (site 3) fires
  the self-heal refetch on library render, and the refetch writes `is_windows_native`.
  In the meantime `installFormIpc` reports `platformsCaptured: false`, which is exactly
  what lets D-04's fail-open offer Windows. The install form is correct DURING the
  window and correct after it.
</fourth_site_finding>

<consequence_to_document>
Narrowing `library.ts:791` narrows `GameInfo.steamPlatformsCaptured`, which has a second
consumer: `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx:67`
(`gameInfo.steamPlatformsCaptured === true`). For a residue game that section will hide
until the self-heal refetch lands. This is benign, temporary and self-healing — accept
it, note it in the SUMMARY, and do NOT add a second field or a carve-out to avoid it.
</consequence_to_document>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create the pure `depotSignalCaptured` predicate and its unit gate</name>
  <files>src/backend/storeManagers/steam/metadataCapture.ts, src/backend/storeManagers/steam/__tests__/metadataCapture.test.ts</files>
  <behavior>
    - `{ platformsCaptured: true, is_windows_native: true }` → `true`
    - `{ platformsCaptured: true, is_windows_native: false }` → `true`
    - `{ platformsCaptured: true }` → `false`  ← THE HEADLINE RESIDUE CASE
    - `{ platformsCaptured: false, is_windows_native: true }` → `false`
    - `{ platformsCaptured: false, is_windows_native: false }` → `false`
    - `{ platformsCaptured: false }` → `false`
    - `{ is_windows_native: true }` → `false`
    - `{ is_windows_native: false }` → `false`
    - `{}` → `false`
    - `null` → `false`; `undefined` → `false`
    - Saboteur: `readsRawFlag = (e) => e?.platformsCaptured === true` DISAGREES with
      `depotSignalCaptured` on the residue shape (`true` vs `false`), and AGREES on
      every other cell of the table.
  </behavior>
  <action>
Write the test file FIRST, run it against the absent module to see it RED, then write
the module.

**Module** `src/backend/storeManagers/steam/metadataCapture.ts` — exactly one export:

`depotSignalCaptured(entry)` taking a STRUCTURAL parameter type
`{ platformsCaptured?: boolean; is_windows_native?: boolean } | null | undefined` and
returning `entry?.platformsCaptured === true && entry?.is_windows_native !== undefined`.

Do NOT import `SteamMetadataCacheEntry` from `./electronStores`. The structural type
keeps this module dependency-free and trivially unit-testable without pulling
`electron-store` into the Backend jest project — the same extraction pattern
`steamPlatformRow.ts` uses and documents in its own header.

The module header + function doc-comment MUST state all four of:
  (a) the residue shape and its real-world magnitude — 370 of 380 entries in the
      on-disk `steam_metadata.json` surveyed 2026-08-16 carry `platformsCaptured: true`
      with no `is_windows_native`;
  (b) the UNIQUENESS PROOF, with citations: `games.ts:647` computes
      `const is_windows_native = !!data.platforms?.windows` — always a boolean, never
      `undefined` — and `games.ts:704-707` persists it inside the SAME object literal
      as `platformsCaptured: true`. Every post-D-17 write therefore carries both
      fields, so `platformsCaptured === true && is_windows_native === undefined`
      uniquely identifies pre-D-17 residue and cannot false-positive on a
      legitimately-written entry;
  (c) that this is deliberately NOT the forbidden `hasSteamWindowsDepot` loosening —
      name the `treatsAbsentAsAvailable` saboteur and the three shipped gates in
      `steamPlatformRow.test.ts` that reject it, so a future reader does not "unify"
      the two;
  (d) that clearing the false "captured" claim is precisely what lets Phase 34.14's
      D-04 fail-open engage AND lets `games.ts`'s existing self-heal refetch repopulate
      the entry — one fetch per game, then convergence.

**Test** `src/backend/storeManagers/steam/__tests__/metadataCapture.test.ts`. Follow
the header/describe-block style of `steamInstallFormContracts.test.ts` in the same
directory. Structure:
  - describe block 1: the 9-cell truth table, one `it` per cell, plus `null` and
    `undefined`. Name the `{ platformsCaptured: true }` case explicitly as THE
    370-ENTRY RESIDUE SHAPE.
  - describe block 2: the NON-VACUITY / saboteur gate. Define
    `const readsRawFlag = (e?: { platformsCaptured?: boolean } | null) => e?.platformsCaptured === true`
    inside the test file and assert it returns `true` while `depotSignalCaptured`
    returns `false` for the residue entry — proving the helper does real work rather
    than restating the raw read. Also assert the two agree on every non-residue cell,
    so the saboteur is a discriminator and not just a different function.

Do not add the source gate in this task — it lands in Task 2, after the call sites move.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --selectProjects Backend src/backend/storeManagers/steam/__tests__/metadataCapture.test.ts</automated>
  </verify>
  <done>`metadataCapture.test.ts` passes with all 11 truth-table cases plus the saboteur block; the RED run (before the module existed) was observed and its failure recorded for the SUMMARY.</done>
</task>

<task type="auto">
  <name>Task 2: Normalize the three read sites, pin the two non-changes, extend the gate</name>
  <files>src/backend/storeManagers/steam/library.ts, src/backend/storeManagers/steam/installFormIpc.ts, src/backend/storeManagers/steam/games.ts, src/backend/storeManagers/steam/__tests__/metadataCapture.test.ts, src/backend/storeManagers/steam/__tests__/games.test.ts, src/backend/storeManagers/steam/__tests__/library.test.ts</files>
  <action>
**2a — Apply at EXACTLY the three sites.** Re-verify each line's current content before
editing; line numbers may have drifted.

| File | From | To |
|---|---|---|
| `library.ts` ~791 | `steamPlatformsCaptured: cachedMeta?.platformsCaptured ?? false,` | `steamPlatformsCaptured: depotSignalCaptured(cachedMeta),` |
| `installFormIpc.ts` ~109 | `const platformsCaptured = cached?.platformsCaptured === true` | `const platformsCaptured = depotSignalCaptured(cached)` |
| `games.ts` ~538 | `!existing.is_delisted && cached?.platformsCaptured !== true` | `!existing.is_delisted && !depotSignalCaptured(cached)` |

Add a short WHOLE-LINE comment above each (never a trailing `// ...` on the code line
— `stripSourceComments` drops whole comment lines but leaves trailing ones in the
stripped text, which would make the 2c gate self-invalidating). Each comment says why
the helper is used instead of the raw field, and MUST NOT spell out the raw expression
being replaced, for the same reason. At the `games.ts` site, also note that this is
what makes the existing self-heal refetch engage for residue and that it converges
after one fetch because the refetch writes `is_windows_native`.

Update the adjacent stale prose:
- `installFormIpc.ts:105-106`'s "Both comparisons are `=== true`" is now false for one
  of the pair. Correct it.
- `library.ts:789-790`'s "mirrors platformsCaptured so the frontend bottle indicator
  matches the backend D-11 routing gate" is now false — it deliberately no longer
  mirrors the D-11 gate. Rewrite it to state the divergence and why (this field seeds
  `hasSteamDepotSignalCaptured`, the DEPOT question; the D-11 gate at `library.ts:225`
  asks the MAC question and is unchanged).

**2b — Pin the deliberate non-changes with comments only.** Do not change any logic at:
- `games.ts` ~1547 and `library.ts` ~225 (mac-nativeness gates) — add a one-line note
  that these deliberately keep the raw read because residue entries genuinely captured
  `is_mac_native`.
- `games.ts` ~1658 `alreadyCaptured()` inside `ensurePlatformsCaptured()` — add the
  `<fourth_site_finding>` reasoning as a comment.

**2c — Extend `metadataCapture.test.ts` with a source gate.** Read each of the three
production files with `readFileSync(join(__dirname, '../<file>.ts'), 'utf8')` and run
them through `stripSourceComments` from `backend/testUtils/stripSourceComments`
(the in-repo convention — see `steamInstallFormContracts.test.ts`). Match on the
EXPRESSION, tolerant of whitespace and line drift; never on a line number. Assert:
  - each of the three normalized sites now matches its `depotSignalCaptured(...)` form
    (`steamPlatformsCaptured:\s*depotSignalCaptured\(cachedMeta\)`,
     `platformsCaptured\s*=\s*depotSignalCaptured\(cached\)`,
     `!depotSignalCaptured\(cached\)`);
  - each of the three files imports `depotSignalCaptured` from `./metadataCapture`;
  - `games.ts` and `library.ts` STILL contain the raw mac gate
    `platformsCaptured === true && meta?.is_mac_native === false` (2 assertions), so
    the §3 non-change cannot be silently "corrected" later;
  - `games.ts` STILL contains the raw `?.platformsCaptured === true` inside
    `ensurePlatformsCaptured`'s `alreadyCaptured` (the fourth-site pin);
  - `steamPlatformRow.ts` still contains `is_windows_native === true` and does NOT
    contain `is_windows_native !== false` — the HARD PROHIBITION, asserted from this
    file rather than trusting the frontend project's own gates to be run.

RED-PROVE the gate: before running it green, confirm each new assertion FAILS against
the pre-edit shape (e.g. by temporarily reverting one site, or by asserting against a
captured copy of the old text). A gate that has never failed proves nothing — this
repo's ledger records that lesson three times. Record the RED observation.

**2d — Repair the existing fixtures the change legitimately invalidates.** Run the
Backend project and diff against the Task-1 baseline. Known-affected, confirmed at
planning time:
  - `games.test.ts:351-368` (`LIB-04: getGameInfo returns the existing library entry
    synchronously`) mocks `{ platformsCaptured: true }` and asserts `axios.get` was NOT
    called. Post-change that fixture IS residue, so the self-heal fires. Its stated
    intent — "a fully-enriched cache entry" — requires `is_windows_native` too. Add it.
  - `library.test.ts:516-534` (`D-08 reconciliation: ... steamPlatformsCaptured:true`)
    mocks `{ platformsCaptured: true, is_mac_native: false }` and asserts
    `steamPlatformsCaptured === true`. Same repair: add `is_windows_native`.
  - Sweep the rest of `games.test.ts`, `library.test.ts`, `installFormIpc.test.ts` and
    `src/backend/sidecar/__tests__/steamAuthFlows.test.ts` for any other fixture whose
    INTENT is "fully captured entry" but which omits `is_windows_native`.

  RULE for every failure found: a fixture that means "captured" gains
  `is_windows_native`. NEVER weaken `depotSignalCaptured`, and NEVER revert a call
  site, to make a test pass. If a failing test's intent is genuinely "residue" then its
  expectation changes and the reason is written into the test name — but do not
  reinterpret an unrelated failure that way. Verify each repaired fixture against the
  Task-1 baseline: a test that was ALREADY failing before this plan is not yours to fix.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --selectProjects Backend src/backend/storeManagers/steam/__tests__/metadataCapture.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/installFormIpc.test.ts && git diff --exit-code src/frontend/screens/Library/components/InstallModal/steamPlatformRow.ts</automated>
  </verify>
  <done>All three sites call `depotSignalCaptured`; both mac gates and the `alreadyCaptured` fourth site are unchanged and pinned by source assertions; the source gate was RED-proven; every fixture repair adds a field rather than weakening the predicate; `steamPlatformRow.ts` shows a clean `git diff`.</done>
</task>

<task type="auto">
  <name>Task 3: Full proof sweep and close the todo</name>
  <files>.planning/todos/pending/2026-08-16-steam-metadata-cache-lacks-is-windows-native-pre-d17-residue.md, .planning/todos/completed/2026-08-16-steam-metadata-cache-lacks-is-windows-native-pre-d17-residue.md</files>
  <action>
Run, and record the ACTUAL pass/fail counts from the output in the SUMMARY. Do not
assert green without pasting the numbers — this repo's ledger records a live gate
beating a green suite three times.

  1. `npx jest --selectProjects Backend`
  2. `npx jest src/frontend/screens/Library/components/InstallModal/__tests__/steamPlatformRow.test.ts src/frontend/screens/Library/components/InstallModal/__tests__/steamEligibilityProbe.test.ts src/frontend/screens/Library/components/InstallModal/__tests__/steamSectionGating.test.ts`
  3. `npx jest src/backend/storeManagers/steam/__tests__/steamInstallFormContracts.test.ts`
  4. `pnpm codecheck` (`tsc --noEmit`)
  5. `git diff --exit-code src/frontend/screens/Library/components/InstallModal/steamPlatformRow.ts`

Any failure in (2) or (3) is a STOP: those are shipped 34.13/34.14 gates this plan
promised not to disturb. Compare against the Task-1 baseline before attributing a
failure to this plan; this repo has a known cross-test flake in
`bootstrapWirings.test.ts` unrelated to anything here.

Then close the todo. Inspect `.planning/todos/` first — the convention verified at
planning time is a sibling `completed/` directory (it already holds
`2026-07-19-steam-native-install-progress-speed-eta-paused-state.md` and
`keyring-read-timeout-reported-as-no-token.md`), so `git mv` the file from `pending/`
to `completed/` preserving the filename. Append a short resolution note to the moved
file: what shipped (read-boundary normalization at three sites), why the startup
migration named in its own "How to fix" section was rejected (the sidecar never runs
`applyMigrations()`), and that the todo's own "Do NOT loosen `hasSteamWindowsDepot`"
warning was honoured.

Note in the SUMMARY: the sibling todo
`.planning/todos/pending/2026-08-16-absent-is-mac-native-treated-as-no-mac-build-mirror-of-34-14.md`
is the MIRROR problem on the mac axis and is deliberately NOT closed by this plan —
this plan's §3 explicitly preserves those two mac gates.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --selectProjects Backend && npx tsc --noEmit && test -f .planning/todos/completed/2026-08-16-steam-metadata-cache-lacks-is-windows-native-pre-d17-residue.md && test ! -f .planning/todos/pending/2026-08-16-steam-metadata-cache-lacks-is-windows-native-pre-d17-residue.md</automated>
  </verify>
  <done>Backend project green with counts recorded; the four named frontend/contract gates green and unmodified; `tsc --noEmit` clean; todo moved to `completed/` with a resolution note.</done>
</task>

</tasks>

<executor_constraints>
- **NEVER `git stash`.** A prior executor in this repo stranded a concurrent session's
  work that way, twice in one phase. If the tree looks dirty with work you did not do,
  STOP and report — do not stash, do not `git checkout --`, do not pop anything.
- **No worktree isolation.** `workflow.use_worktrees=false` in this project (worktrees
  are hard-blocked by a `.husky/post-checkout` hook that runs a deterministically-failing
  download — even `git checkout -- <file>` can trigger it). Execute sequentially on the
  current branch `fix/steam-native-install-stability`.
- **Do NOT update ROADMAP.md.**
- **Do NOT touch `src/frontend/screens/Library/components/InstallModal/steamPlatformRow.ts`.**
  It must end byte-identical.
- ts-jest in this repo is TRANSPILE-ONLY (`isolatedModules: true`). Type errors do NOT
  surface as jest failures — `pnpm codecheck` is the only real type gate. Any assertion
  you want to be load-bearing must be a runtime assertion or a source-text match.
</executor_constraints>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| on-disk `steam_metadata.json` → backend | Cache is user-writable and carries entries written by older builds with no version stamp. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-hdg-01 | Tampering | `steamMetadataStore` residue entries | mitigate | `depotSignalCaptured` refuses to treat a half-written entry as an authoritative "captured" claim; the self-heal refetch re-derives it from appdetails. |
| T-hdg-02 | Elevation of Privilege | `hasSteamWindowsDepot` fence | mitigate | Source gate in `metadataCapture.test.ts` asserts `is_windows_native !== false` never appears in `steamPlatformRow.ts`; that file's `git diff` must be clean. |
| T-hdg-03 | Denial of Service | self-heal refetch loop | accept | The refetch writes `is_windows_native` unconditionally (`games.ts:647` is `!!`), so the predicate flips to `true` after exactly one fetch per appId; `pendingFetches` dedup and `acquireMetadataSlot()` throttle already bound the burst. |
| T-hdg-SC | Tampering | npm/pip/cargo installs | mitigate | N/A — this plan installs no packages. |
</threat_model>

<verification>
1. `npx jest --selectProjects Backend` — green, counts recorded.
2. `steamPlatformRow.test.ts`, `steamEligibilityProbe.test.ts`, `steamSectionGating.test.ts`,
   `steamInstallFormContracts.test.ts` — green AND unmodified.
3. `npx tsc --noEmit` — clean.
4. `git diff --exit-code src/frontend/screens/Library/components/InstallModal/steamPlatformRow.ts` — clean.
5. The source gate's new assertions were each observed FAILING against the pre-edit
   shape before being accepted green.
6. `grep -n "platformsCaptured" src/backend/storeManagers/steam/{games,library,installFormIpc}.ts`
   shows raw reads surviving ONLY at the two mac gates, `alreadyCaptured()`, and the
   write path — every other read goes through the helper.
</verification>

<success_criteria>
- A `{ platformsCaptured: true }` entry with no `is_windows_native` reads as NOT captured
  at all three depot-signal boundaries, and a both-fields entry still reads as captured.
- Bottle/bridge routing for residue entries is provably unchanged (both mac gates pinned).
- `steamPlatformRow.ts` byte-identical; the three shipped 34.13/34.14 gates green.
- Todo moved to `.planning/todos/completed/` with a resolution note.
- SUMMARY carries actual test counts, the RED observations for both gates, and the
  `AppleWikiInfo.tsx` consequence.
</success_criteria>

<output>
Create `.planning/quick/260816-hdg-normalize-steam-metadata-depot-signal-re/260816-hdg-SUMMARY.md` when done
</output>
</content>
</invoke>
