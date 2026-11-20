---
phase: quick-261110-ugu
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/state/settingsState.ts
  - src/frontend/state/authState.ts
  - src/frontend/state/libraryState.ts
  - src/frontend/state/initStateSubscriptions.ts
  - src/frontend/state/__tests__/settingsState.test.ts
  - src/frontend/state/__tests__/authState.test.ts
  - src/frontend/state/__tests__/initStateSubscriptions.test.ts
  - src/frontend/state/__tests__/GlobalStateFocusRowHydration.test.ts
  - .planning/todos/pending/2026-11-10-import-time-mirror-reads-before-hydration.md
  - .planning/todos/completed/2026-11-10-import-time-mirror-reads-before-hydration.md
autonomous: true
requirements:
  - TODO-2026-11-10-import-time-mirror-reads-before-hydration

must_haves:
  truths:
    - "After a successful hydrateStoreSnapshot(), the settings store's hideChangelogsOnStartup, experimentalFeatures and focusRow reflect the hydrated configStore 'settings' value, not the empty-snapshot defaults"
    - "After hydration, authState.dismissedSignInNotices reflects the hydrated configStore 'settings'.dismissedSignInNotices"
    - "After hydration, libraryState.gameOverrides holds the hydrated gameOverridesStore 'overrides', and the boot-time epic/gog/amazon/steam/sideloaded libraries have those overrides attached"
    - "CR-01 focusRow hydration (requestAppSettings round-trip) runs only when the POST-hydration mirror lacks a focusRow key; a hydrated profile that has the key no longer triggers it"
    - "No module in src/frontend/state reads configStore 'settings' or gameOverridesStore at ES-module evaluation time"
  artifacts:
    - path: "src/frontend/state/settingsState.ts"
      provides: "readFocusRowMirrorSeed() and readInitialSettings() returning hideChangelogsOnStartup/experimentalFeatures/focusRow; no globalSettingsAtImport / module-scope focusRowMirrorSeed"
      contains: "export function readFocusRowMirrorSeed"
    - path: "src/frontend/state/authState.ts"
      provides: "readInitialAuth() returning dismissedSignInNotices read at call time"
      contains: "dismissedSignInNotices: normalizeSignInDismissals("
    - path: "src/frontend/state/libraryState.ts"
      provides: "readInitialLibrary() returning gameOverrides and passing them to every loader"
      contains: "gameOverridesStore.get('overrides', {})"
  key_links:
    - from: "src/frontend/index.tsx"
      to: "initStateSubscriptions()"
      via: "called at line ~265, after `await Promise.race([hydrateStoreSnapshot(), timeout])` at ~144 (already verified at plan time: hydration await precedes the call; the call is outside the hydrate try/catch)"
      pattern: "if \\(!pickerParams\\) initStateSubscriptions\\(\\)"
    - from: "src/frontend/state/initStateSubscriptions.ts"
      to: "readFocusRowMirrorSeed()"
      via: "CR-01 gate reads the seed at call time"
      pattern: "readFocusRowMirrorSeed\\(\\)\\.needsMigratedValue|focusRowSeed\\.needsMigratedValue"
---

<objective>
Close todo `2026-11-10-import-time-mirror-reads-before-hydration`: the remaining module-scope
mirror reads in the Phase 69 stores run at ES-module evaluation, before `await
hydrateStoreSnapshot()` in `src/frontend/index.tsx`, so they always see the empty snapshot and
yield defaults. Move each into the store's existing post-hydration `readInitial*()` function,
which `initStateSubscriptions()` section (1) already applies after hydration.

Purpose: a cold boot shows the user's persisted values from the first render instead of relying
on later compensations to patch them in (or, for `gameOverrides`, not at all until the first
`handleMetadataChanged` push).

Output: three store files with no import-time mirror reads, an updated boot module, jest tests
that prove post-hydration values are picked up, and the todo moved to `completed/`.

**Path correction (todo is stale on file names).** The todo names
`src/frontend/state/GlobalStateV2.ts:105` and `src/frontend/state/GlobalState.tsx`. Phase 69
deleted both; the reads moved verbatim (R5, "import-time timing preserved") to:

| Todo said | Where it lives now | What runs at import |
| --- | --- | --- |
| GlobalStateV2.ts:105 `gameOverrides` | `libraryState.ts:730` inside `create()` | `gameOverridesStore.get('overrides', {})` |
| GlobalState.tsx `globalSettings` | `settingsState.ts:22` `export const globalSettingsAtImport` | `configStore.get_nodefault('settings')`, consumed by store defaults `hideChangelogsOnStartup` (:88) and `experimentalFeatures` (:91) |
| GlobalState.tsx `focusRowMirrorSeed` | `settingsState.ts:26` `export const focusRowMirrorSeed` | `seedFocusRowFromMirror(globalSettingsAtImport)`; feeds store default `focusRow` (:95) and the CR-01 gate in `initStateSubscriptions.ts:120` |
| (not named in todo, same defect) | `authState.ts:176-178` store default | `normalizeSignInDismissals(globalSettingsAtImport?.dismissedSignInNotices)` |

**Ordering verified at plan time (the "verify initStateSubscriptions runs after hydration"
ask):** `src/frontend/index.tsx` awaits `Promise.race([hydrateStoreSnapshot(), 8s timeout])`
inside a try/catch at ~line 144, then calls `if (!pickerParams) initStateSubscriptions()` at
~line 265, outside that try/catch and before `root.render`. Top-level await in the entry module
guarantees order. No adaptation is needed. The executor re-confirms with a grep in Task 3
(not a re-design).

**Compensation decisions (conservative: remove only what is provably redundant):**

- **CR-01 focusRow hydration (`hydrateFocusRowSelection`) — KEEP, re-gated.** Not redundant: per
  the `settingsState.ts` comment, the backend's `settings/global` migration writes `focusRow`
  into `config.json` and the mirror never receives it, so a legacy profile's hydrated mirror can
  still lack the key. It is also the only recovery when hydration fails or times out (index.tsx
  catch path mounts with an empty snapshot). What changes: the gate now reads the seed AFTER
  hydration, so it fires only when the hydrated mirror genuinely lacks `focusRow` (today it fires
  on every cold boot, because the import-time seed always sees an empty map).
- **F-49-R1-3 dismissed-set hydration (`hydrateDismissedSignInNotices`) — KEEP, comment
  corrected.** Not redundant: it reads the backend's authoritative `requestAppSettings()`, which
  covers (a) mirror/config.json divergence of the same class as CR-01 and (b) the failed/timed-out
  hydration path. It unions and never writes, so keeping it is harmless. Only its doc comment
  ("seeded at import time") becomes false and must be rewritten.
- **`handleMetadataChanged` — KEEP, unchanged.** It is the runtime push channel for override
  edits made during the session, not only a boot compensation; removing it would break live
  override updates.
- **Picker window:** `index.tsx` skips `initStateSubscriptions()` when `pickerParams` is set. The
  picker previously read the same values at import against an empty snapshot (= defaults), so
  using literal defaults at `create()` is behaviour-identical for it.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-11-10-import-time-mirror-reads-before-hydration.md
@src/frontend/state/settingsState.ts
@src/frontend/state/authState.ts
@src/frontend/state/libraryState.ts
@src/frontend/state/initStateSubscriptions.ts

Load `Skill("gamelib-conventions")` before writing any `<verify>` evidence (prettier rule) and
before editing the todo file.

**Working tree is dirty with unrelated changes** (src/backend/process/,
src/backend/storeManagers/steam/bridge/, src/backend/testUtils/, many .planning/ files). Stage
ONLY the explicit paths each task lists — never `git add -A`, `git add .`, or `git commit -a`.
Before each commit run `git diff --cached --name-only` and confirm it lists only this task's
paths. End every commit message with the line
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

<interfaces>
From src/common/focusRowMigration.ts:
- `seedFocusRowFromMirror(mirrorSettings: unknown): FocusRowMirrorSeed` — pure, total.
  Returns `{ focusRow: valid|null, needsMigratedValue: false }` when the object has a
  `focusRow` key, else `{ focusRow: null, needsMigratedValue: true }`.
- `hydrateFocusRowSelection(deps)` — never rejects.

From src/frontend/state/settingsState.ts (current):
- `export const globalSettingsAtImport = configStore.get_nodefault('settings')` (line 22)
- `export const focusRowMirrorSeed = seedFocusRowFromMirror(globalSettingsAtImport)` (line 26)
- `type InitialSettings = Pick<SettingsState, 'theme' | 'zoomPercent' | ... | 'disableAnimations'> & { language?: string }` (~line 179)
- `export function readInitialSettings(): InitialSettings` (line 206)
- importers of `focusRowMirrorSeed`: initStateSubscriptions.ts:37/120, tests
  settingsState.test.ts:6/100, initStateSubscriptions.test.ts:497/504,
  GlobalStateFocusRowHydration.test.ts:18/82
- importer of `globalSettingsAtImport`: authState.ts:33/177 only

From src/frontend/state/authState.ts:
- `export function readInitialAuth(): Pick<AuthState, 'epicUsername' | 'gogUsername' | 'amazonUserId' | 'amazonUsername' | 'steamUsername' | 'humble'>` (line 126); `configStore` and `normalizeSignInDismissals` are already imported.

From src/frontend/state/libraryState.ts:
- `const currentOverrides = () => useLibraryStateRaw.getState().gameOverrides` (135); every
  `load*Library(overrides = currentOverrides())` loader takes an explicit overrides arg.
- `export function readInitialLibrary(): Pick<LibraryState, 'hiddenGames' | ... | 'sideloadedLibrary'>` (190)
- store default `gameOverrides: gameOverridesStore.get('overrides', {})` (730)

Test harness facts (initStateSubscriptions.test.ts): `window.api.storeGet(_store, key, dflt)`
returns `config[key]` keyed by KEY ONLY (store name ignored), `config` is cleared in
`beforeEach`, modules are imported once in `beforeAll`, and `resetAllStores()` restores each
store's `getInitialState()` in `afterEach`. So setting `config.settings` / `config.overrides`
inside a test simulates "hydrated after import". authState.test.ts uses a `stored` map keyed
`'<storeName>|<key>'`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Move settings and dismissed-set mirror reads into readInitialSettings/readInitialAuth; re-gate CR-01 on the post-hydration seed</name>
  <files>src/frontend/state/settingsState.ts, src/frontend/state/authState.ts, src/frontend/state/initStateSubscriptions.ts, src/frontend/state/__tests__/settingsState.test.ts, src/frontend/state/__tests__/authState.test.ts, src/frontend/state/__tests__/initStateSubscriptions.test.ts, src/frontend/state/__tests__/GlobalStateFocusRowHydration.test.ts</files>
  <behavior>
    - initStateSubscriptions.test: with `config.settings = { hideChangelogsOnStartup: true, experimentalFeatures: { cometSupport: false }, focusRow: { kind: 'view', value: 'installed' }, dismissedSignInNotices: ['gog'] }` set AFTER module import, `initStateSubscriptions()` leaves settings store `hideChangelogsOnStartup === true`, `experimentalFeatures.cometSupport === false`, `focusRow` equal to the hydrated value, and auth store `dismissedSignInNotices` equal to `['gog']`.
    - initStateSubscriptions.test: with that hydrated `focusRow` key present, `requestAppSettings` is NOT called (CR-01 not armed); with `config` empty, it IS called once (CR-01 armed). Replace the two existing assertions that read `settings.focusRowMirrorSeed.needsMigratedValue` with these call-time checks.
    - settingsState.test: `readInitialSettings()` returns `hideChangelogsOnStartup`, `experimentalFeatures` (cometSupport defaulting to true and merged with the mirror's object) and `focusRow` read at CALL time (change the mirror between two calls and see it follow, like the existing theme test at ~line 201). `readFocusRowMirrorSeed()` reports `needsMigratedValue: true` for an empty mirror and `false` when `settings` has a `focusRow` key. The defaults test at ~line 100 asserts `focusRow` is `null` at create time instead of comparing to the removed export.
    - authState.test: `readInitialAuth()` includes `dismissedSignInNotices` (normalized from `configStore|settings`), so the existing `toEqual` at ~line 51 gains `dismissedSignInNotices: []` and a new case with `'configStore|settings': { dismissedSignInNotices: ['gog'] }` yields `['gog']`.
    - GlobalStateFocusRowHydration.test: the "import-time mirror arms hydration" case becomes "an empty post-hydration mirror arms hydration" using `readFocusRowMirrorSeed()`; the other cases still pass unchanged (their fake `storeGet` returns the default, so the seed still needs the migrated value).
  </behavior>
  <action>
RED first: write/adjust the tests in the four test files per `<behavior>`, run them, confirm the new post-hydration cases fail against the current code (they will: the store defaults were frozen at import with an empty mirror, and `readInitialSettings`/`readInitialAuth` do not return these keys). Commit the failing tests only if the project's TDD flow requires it; otherwise proceed to GREEN in the same task.

GREEN, in settingsState.ts: delete `export const globalSettingsAtImport` and `export const focusRowMirrorSeed`, and the R5 comment that points at the pending todo. Add `export function readFocusRowMirrorSeed(): FocusRowMirrorSeed` that calls `seedFocusRowFromMirror(configStore.get_nodefault('settings'))` at call time (import the `FocusRowMirrorSeed` type from `common/focusRowMigration`; keep the CR-01 explanatory comment above it, reworded to say it is read after hydration). In the `create()` defaults use literals: `hideChangelogsOnStartup: false`, `experimentalFeatures: { cometSupport: true }`, `focusRow: null`. Extend `InitialSettings` with `'hideChangelogsOnStartup' | 'experimentalFeatures' | 'focusRow'`, and in `readInitialSettings()` read `configStore.get_nodefault('settings')` once into a local, then return `hideChangelogsOnStartup: globalSettings?.hideChangelogsOnStartup || false`, `experimentalFeatures: { cometSupport: true, ...(globalSettings?.experimentalFeatures || {}) }` (exact same expressions the old defaults used, so semantics do not change) and `focusRow: seedFocusRowFromMirror(globalSettings).focusRow`.

In authState.ts: remove the `globalSettingsAtImport` import; set the `create()` default `dismissedSignInNotices: []`; add `'dismissedSignInNotices'` to `readInitialAuth`'s `Pick` and return `dismissedSignInNotices: normalizeSignInDismissals(configStore.get_nodefault('settings')?.dismissedSignInNotices)`.

In initStateSubscriptions.ts: replace the `focusRowMirrorSeed` import with `readFocusRowMirrorSeed`; in section (1) compute the seed once after `useSettingsState.setState(readInitialSettings())` and gate the CR-01 `hydrateFocusRowSelection` block on that local's `needsMigratedValue`. Update the CR-01 comment: it now fires only when the HYDRATED mirror lacks `focusRow` (backend-side migration the mirror never receives, or a failed/timed-out hydration), and it is kept deliberately — not redundant. Rewrite the `hydrateDismissedSignInNotices` doc comment: the set is now seeded post-hydration by `readInitialAuth`; this backend read is kept because the mirror can diverge from the backend's `config.json` and because a failed/timed-out hydration leaves the mirror empty; it unions and never writes. Do NOT remove `hydrateFocusRowSelection`, `hydrateDismissedSignInNotices` or the `handleMetadataChanged` listener (decisions in `<objective>`).

Then confirm no import-time read remains: `grep -n "globalSettingsAtImport\|focusRowMirrorSeed" -r src/` returns nothing (tests included).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/frontend/state/__tests__/settingsState.test.ts src/frontend/state/__tests__/authState.test.ts src/frontend/state/__tests__/initStateSubscriptions.test.ts src/frontend/state/__tests__/GlobalStateFocusRowHydration.test.ts && ! grep -rn "globalSettingsAtImport\|focusRowMirrorSeed" src/ && npx tsc --noEmit && npx eslint src/frontend/state/settingsState.ts src/frontend/state/authState.ts src/frontend/state/initStateSubscriptions.ts src/frontend/state/__tests__/settingsState.test.ts src/frontend/state/__tests__/authState.test.ts src/frontend/state/__tests__/initStateSubscriptions.test.ts src/frontend/state/__tests__/GlobalStateFocusRowHydration.test.ts && npx prettier --check src/frontend/state/settingsState.ts src/frontend/state/authState.ts src/frontend/state/initStateSubscriptions.ts src/frontend/state/__tests__/settingsState.test.ts src/frontend/state/__tests__/authState.test.ts src/frontend/state/__tests__/initStateSubscriptions.test.ts src/frontend/state/__tests__/GlobalStateFocusRowHydration.test.ts</automated>
    Prettier visibility checked at plan time: `npx prettier --file-info src/frontend/state/settingsState.ts` and `.../__tests__/authState.test.ts` both report `{ "ignored": false, "inferredParser": "typescript" }`; the executor re-runs `--file-info` on each of the seven paths (one path per invocation — `--file-info` rejects multiple files) before trusting the check.
  </verify>
  <done>All four jest files pass, including the new post-hydration cases; no `globalSettingsAtImport`/`focusRowMirrorSeed` reference remains in src/; tsc, eslint and scoped prettier are clean. Committed as `fix(quick-261110-ugu): read settings mirror after hydration, re-gate CR-01` with exactly the seven task paths staged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Move the gameOverrides read into readInitialLibrary and attach the hydrated overrides to the boot libraries</name>
  <files>src/frontend/state/libraryState.ts, src/frontend/state/__tests__/initStateSubscriptions.test.ts</files>
  <behavior>
    - With `config.overrides = { g: { wineVersion: 'w' } }` and `config.games = [{ app_name: 'g', runner: 'gog', title: 'G' }]` set after import (harness keys by key only, so `gogLibraryStore.get('games')` sees it), `initStateSubscriptions()` leaves `useLibraryState.getState().gameOverrides` deep-equal to the hydrated overrides AND the boot `gogLibrary` entry for `g` carries the override as `attachGameOverrides` applies it (assert on whatever field `src/frontend/helpers/gameOverrides.ts` `attachGameOverrides` sets — read that helper first; do not guess the field name).
    - SELF-TEST (anti-vacuity): with `config` empty, `gameOverrides` is `{}` and the same entry carries no override, so the positive case is not passing vacuously.
    - The existing "a game push and a metadata change update libraryState" test still passes unchanged (handleMetadataChanged is kept).
  </behavior>
  <action>
RED: add the `<behavior>` cases to initStateSubscriptions.test.ts and confirm the positive case fails (today the store default froze `{}` at import and `readInitialLibrary` neither returns `gameOverrides` nor passes fresh overrides to the loaders — they default to `currentOverrides()`, the stale `{}`).

GREEN in libraryState.ts: change the `create()` default to `gameOverrides: {}`. Add `'gameOverrides'` to `readInitialLibrary`'s `Pick`. Inside `readInitialLibrary()` read `const gameOverrides = gameOverridesStore.get('overrides', {})` once, return it, and pass it explicitly to `loadLegendaryLibrary`, `loadGOGLibrary`, `loadAmazonLibrary`, `loadSteamLibrary` and `loadSideloadedLibrary` (each already accepts an `overrides` arg). Do not rely on the `currentOverrides()` default inside readInitialLibrary — the store has not been set yet when the loaders run, so the default would still be the stale `{}`. Update the `readInitialLibrary` doc comment to note gameOverrides is read here post-hydration (formerly at `create()`, see the todo). Leave `updateGameOverrides` and the `handleMetadataChanged` listener untouched (the runtime push channel; decision in `<objective>`). Do not change `updateGameOverrides`' existing omission of steamLibrary — out of scope.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/frontend/state/__tests__/initStateSubscriptions.test.ts src/frontend/state/__tests__/libraryState.test.ts src/frontend/state/__tests__/GlobalStateRefreshCacheGuard.test.ts && npx tsc --noEmit && npx eslint src/frontend/state/libraryState.ts src/frontend/state/__tests__/initStateSubscriptions.test.ts && npx prettier --check src/frontend/state/libraryState.ts src/frontend/state/__tests__/initStateSubscriptions.test.ts</automated>
    Run `npx prettier --file-info` on each of the two paths first; both are expected `{ "ignored": false, "inferredParser": "typescript" }`.
  </verify>
  <done>Hydrated overrides reach both `gameOverrides` and the boot libraries; the anti-vacuity case passes; existing library tests pass; tsc/eslint/prettier clean. `grep -n "gameOverridesStore.get" src/frontend/state/libraryState.ts` shows the read only inside `readInitialLibrary`. Committed as `fix(quick-261110-ugu): read gameOverrides after hydration` with exactly the two task paths staged.</done>
</task>

<task type="auto">
  <name>Task 3: Full frontend-state regression run, ordering re-check, and move the todo to completed with a resolution note</name>
  <files>.planning/todos/pending/2026-11-10-import-time-mirror-reads-before-hydration.md, .planning/todos/completed/2026-11-10-import-time-mirror-reads-before-hydration.md</files>
  <action>
Re-confirm the boot ordering with `grep -n "hydrateStoreSnapshot()\|initStateSubscriptions()" src/frontend/index.tsx` — the hydrate await line number must be lower than the `initStateSubscriptions()` call. If it is not, STOP and report (the plan's premise would be wrong). Run the whole state suite `npx jest src/frontend/state` and `pnpm codecheck`; fix any fallout inside the files Tasks 1–2 own (if a fix would need a file outside those, stop and report rather than widening scope).

Then `git mv .planning/todos/pending/2026-11-10-import-time-mirror-reads-before-hydration.md .planning/todos/completed/2026-11-10-import-time-mirror-reads-before-hydration.md` and append a `## Resolution` section to the moved file (keep the existing frontmatter untouched; `completed/` is exempt from the triage gate): date 2026-11-10, quick task 261110-ugu; the path correction (GlobalStateV2/GlobalState no longer exist; the reads lived in settingsState.ts, authState.ts, libraryState.ts); what moved into which `readInitial*()`; that `initStateSubscriptions()` was verified to run after the hydration await in index.tsx; and the compensation decisions with their reasons (CR-01 kept and re-gated, F-49-R1-3 kept with corrected comment, handleMetadataChanged kept as the runtime channel) plus the commit hashes of Tasks 1 and 2.

Run `graphify update .` (per CLAUDE.md, after code changes). Stage only the two todo paths (the `git mv` stages the rename; then `git add` the completed path for the appended note), check `git diff --cached --name-only`, and commit `docs(quick-261110-ugu): resolve import-time mirror reads todo`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/frontend/state && pnpm codecheck && test ! -e .planning/todos/pending/2026-11-10-import-time-mirror-reads-before-hydration.md && grep -q "^## Resolution" .planning/todos/completed/2026-11-10-import-time-mirror-reads-before-hydration.md && pnpm planning-gates</automated>
    Prettier: `npx prettier --file-info .planning/todos/completed/2026-11-10-import-time-mirror-reads-before-hydration.md` reports `{ "ignored": true, "inferredParser": null }` (checked at plan time), and the only other path is the removed pending file — every path this task writes is prettier-ignored, so the prettier check is deliberately omitted here rather than carrying a vacuous green.
  </verify>
  <done>Whole `src/frontend/state` jest suite and codecheck pass; the todo exists only under `completed/` with a Resolution section naming the moved reads, the ordering check, the kept compensations with reasons and both fix commits; planning-gates green; committed with only the todo paths staged.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sidecar store snapshot -> renderer stores | Persisted settings/overrides cross into renderer state; this plan changes only WHEN they are read, not what is trusted |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ugu-01 | Tampering | readInitialAuth dismissedSignInNotices | mitigate | value still passes through `normalizeSignInDismissals` (same sanitiser as before), so a malformed persisted list cannot inject non-store values |
| T-ugu-02 | Tampering | readInitialSettings focusRow | mitigate | still routed through `seedFocusRowFromMirror`, which rejects invalid selections to `null` |
| T-ugu-03 | Denial of Service | failed/timed-out hydration | accept | readInitial then sees the empty snapshot = identical to today's defaults; CR-01 and F-49-R1-3 backend reads are kept as the recovery path |
</threat_model>

<verification>
- `npx jest src/frontend/state` green; new tests fail on pre-change code (RED observed) and pass after.
- `grep -rn "globalSettingsAtImport\|focusRowMirrorSeed" src/` empty.
- `pnpm codecheck` green.
- Scoped prettier clean on every prettier-visible path written.
- `git log -3 --stat` shows three commits touching only this plan's `files_modified`.
</verification>

<success_criteria>
- No Phase 69 store reads `configStore 'settings'` or `gameOverridesStore` at module evaluation.
- Post-hydration values for hideChangelogsOnStartup, experimentalFeatures, focusRow, dismissedSignInNotices and gameOverrides (plus override-attached boot libraries) are proven by jest.
- CR-01 fires only when the hydrated mirror lacks focusRow; CR-01, F-49-R1-3 and handleMetadataChanged are kept with written justification.
- Todo moved to `.planning/todos/completed/` with a Resolution note.
</success_criteria>

<output>
Create `.planning/quick/261110-ugu-import-time-mirror-reads-run-before-stor/261110-ugu-SUMMARY.md` when done
</output>
