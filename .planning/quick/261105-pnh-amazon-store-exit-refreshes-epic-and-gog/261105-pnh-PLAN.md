---
phase: quick-261105-pnh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/WebView/storeExitRefresh.ts
  - src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts
  - src/frontend/screens/WebView/index.tsx
  - .planning/todos/pending/2026-11-02-amazon-store-exit-should-refresh-epic-and-gog.md
  - .planning/todos/completed/2026-11-02-amazon-store-exit-should-refresh-epic-and-gog.md
autonomous: true
requirements:
  - TODO-2026-11-02-amazon-store-exit-should-refresh-epic-and-gog

must_haves:
  truths:
    - "Leaving /store/amazon after an armed page runs a scoped refresh for nile, legendary and gog, each gated by its own sign-in state"
    - "A signed-out runner in the Amazon set ('not-connected' / 'expired') never calls refreshLibrary and never prompts"
    - "A runner already refreshing (caller-reported or module in-flight) is skipped while the other runners in the set still refresh"
    - "The in-flight guard is keyed per runner, so an Epic store exit and an Amazon exit cannot stack two legendary refreshes"
    - "No time throttle is added"
    - "Steam, Epic and GOG rows stay single-runner; every existing test in storeExitRefresh.test.ts passes byte-for-byte unchanged"
    - "Each per-runner attempt logs one line carrying origin=amazon-store-exit, runner=<runner> and the outcome"
  artifacts:
    - path: "src/frontend/screens/WebView/storeExitRefresh.ts"
      provides: "StoreExitTarget, multi-target STORE_EXIT_ROWS, per-runner in-flight, runStoreExitRefreshAll"
      exports: ["STORE_EXIT_ROWS", "runStoreExitRefresh", "runStoreExitRefreshAll", "resetStoreExitRefreshState"]
    - path: "src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts"
      provides: "New describe block for multi-runner Amazon exit"
      contains: "runStoreExitRefreshAll"
    - path: ".planning/todos/completed/2026-11-02-amazon-store-exit-should-refresh-epic-and-gog.md"
      provides: "Closed todo with a Closed section; live check recorded as pending human step"
  key_links:
    - from: "src/frontend/screens/WebView/index.tsx"
      to: "runStoreExitRefreshAll"
      via: "onStoreExit callback"
      pattern: "runStoreExitRefreshAll\\(exited"
    - from: "src/frontend/screens/WebView/index.tsx"
      to: "resolveSignInState(signInInputs[signInKey])"
      via: "signInStateFor dep"
      pattern: "signInStateFor"
---

<objective>
Implement todo `.planning/todos/pending/2026-11-02-amazon-store-exit-should-refresh-epic-and-gog.md`:
let a `STORE_EXIT_ROWS` row name more than one runner, so leaving the Amazon store refreshes
`nile` plus `legendary` and `gog` (Prime Gaming claims often land in Epic or GOG through a linked
account). Each runner is gated by its own sign-in state, the in-flight guard is per runner, and
there is no time throttle. Steam, Epic and GOG behaviour and tests are unchanged.

Purpose: an Epic- or GOG-delivered Prime claim reaches the library on store exit, not only on the
next full refresh.
Output: updated pure module + tests, thin caller change in `index.tsx`, todo moved to completed/.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-11-02-amazon-store-exit-should-refresh-epic-and-gog.md
@src/frontend/screens/WebView/storeExitRefresh.ts
@src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts

<interfaces>
Current (storeExitRefresh.ts, lines ~124-253):
- `interface StoreExitRow { runner: Runner; signInKey: 'steam'|'legendary'|'gog'|'nile'; origin: string; isPurchaseIntentUrl: (url) => boolean }`
- `STORE_EXIT_ROWS` = frozen Record<StoreExitStoreKey, StoreExitRow>; amazon row is `{ runner: 'nile', signInKey: 'nile', origin: 'amazon-store-exit', ... }`.
- `const inFlight = new Set<StoreExitStoreKey>()` (keyed by STORE, not runner); `resetStoreExitRefreshState()` clears it; `resetSteamStoreExitRefreshState` aliases it.
- `interface StoreExitRefreshDeps { signInState: string; refreshInFlight: boolean; refreshLibrary: () => Promise<void>; log: (line) => void }`
- `runStoreExitRefresh(store, deps): 'refreshed'|'skipped-signed-out'|'skipped-in-flight'` — gate: signInState must be 'connected' or 'unknown'; then `deps.refreshInFlight || inFlight.has(store)` skips; logs exactly ONE line `[${store}StoreExitRefresh] origin=${origin} outcome=${outcome}` per call (plus a failure line on reject/throw).
- `runSteamStoreExitRefresh(deps)` = `runStoreExitRefresh('steam', deps)`.

Only non-test consumer of the row/runner fields: src/frontend/screens/WebView/index.tsx lines ~359-369:
`onStoreExit = (exited) => { const row = STORE_EXIT_ROWS[exited]; runStoreExitRefresh(exited, { signInState: resolveSignInState(signInInputs[row.signInKey]), refreshInFlight: refreshing || refreshingByRunner?.[row.runner] === true, refreshLibrary: () => refreshLibrary({ library: row.runner, origin: row.origin }), log: (line) => window.api.logInfo(line) }) }`
`useStoreEmbedHost.ts` only calls `onStoreExit(storeKey)` (line ~917) and needs NO change.

GlobalState.refreshLibrary (src/frontend/state/GlobalState.tsx ~1394): scoped calls track
`refreshingByRunner[runner]` and explicitly allow DIFFERENT runners to refresh concurrently, so
three scoped calls in one synchronous loop are safe. It logs `[refreshLibrary] runner=<r> origin=<o>`.

Existing tests that MUST stay unchanged: the amazon entry in the `stores` list of
`describe('runStoreExitRefresh (quick 261030-ts4)')` calls `runStoreExitRefresh('amazon', mk())`
and expects 'refreshed', refreshLibrary called once and ONE log line containing
`[amazonStoreExitRefresh]` and `amazon-store-exit`. The "in-flight is per store" test expects a
pending gog refresh not to block epic.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Multi-runner rows, per-runner in-flight, runStoreExitRefreshAll (tests first)</name>
  <files>src/frontend/screens/WebView/storeExitRefresh.ts, src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts</files>
  <behavior>
    New `describe('runStoreExitRefreshAll (quick 261105-pnh)')` block appended to the test file (do NOT edit any existing block; add `runStoreExitRefreshAll` and `STORE_EXIT_ROWS` to the import list only). Deps factory supplies `signInStateFor(signInKey)`, `refreshInFlightFor(runner)`, `refreshLibrary: jest.fn((runner, origin) => Promise.resolve())`, `log`. `beforeEach` calls `resetStoreExitRefreshState()`.
    - Row shape: `STORE_EXIT_ROWS.amazon.targets.map(t => t.runner)` equals `['nile', 'legendary', 'gog']` with signInKeys `['nile', 'legendary', 'gog']`; steam/epic/gog rows each have exactly one target (`steam`/`legendary`/`gog`).
    - Amazon, all three 'connected' (and separately all 'unknown'): returns `[{runner:'nile',outcome:'refreshed'},{runner:'legendary',outcome:'refreshed'},{runner:'gog',outcome:'refreshed'}]`; refreshLibrary called 3 times with `('nile','amazon-store-exit')`, `('legendary','amazon-store-exit')`, `('gog','amazon-store-exit')`; 3 log lines, each containing `[amazonStoreExitRefresh]`, `origin=amazon-store-exit` and its own `runner=<r>`.
    - Amazon, legendary 'not-connected' and gog 'expired', nile 'connected': only nile is refreshed; legendary and gog report 'skipped-signed-out'; refreshLibrary called once (nile).
    - Amazon, every runner signed out: refreshLibrary never called, all three 'skipped-signed-out'.
    - Caller in-flight: `refreshInFlightFor` true for legendary only → legendary 'skipped-in-flight', nile and gog refreshed.
    - Module in-flight is per runner and shared across stores: start `runStoreExitRefresh('epic', ...)` with a never-yet-resolved legendary promise, then an Amazon exit → legendary 'skipped-in-flight', nile and gog 'refreshed'; after resolve (flush microtasks as the existing test does) the next Amazon exit refreshes legendary. Same recovery after a reject.
    - A pending nile refresh from one Amazon exit makes the immediate second Amazon exit skip nile (and legendary/gog too while their promises are pending); no time throttle — once settled, the next exit refreshes all again.
    - Steam/Epic/GOG via runStoreExitRefreshAll: exactly one entry, the row's single runner, with the row's origin.
  </behavior>
  <action>
    RED: write the block above, run it, confirm it fails (function/field missing). Commit `test(quick-261105-pnh): add failing tests for multi-runner store exit`.

    GREEN in storeExitRefresh.ts:
    1. Add exported `interface StoreExitTarget { runner: Runner; signInKey: 'steam' | 'legendary' | 'gog' | 'nile' }` (move the existing "Key of collectSignInInputs" doc comment onto `signInKey`). Replace `runner`/`signInKey` on `StoreExitRow` with `targets: readonly StoreExitTarget[]` (first target is the store's own runner). Steam/Epic/GOG rows get one target each matching today's values. Amazon gets `[{nile,nile},{legendary,legendary},{gog,gog}]`. Origin stays per row (`amazon-store-exit` for all three Amazon refreshes, which is what the todo's live check greps). Extend the comment above `isAmazonPurchaseIntentUrl` / the amazon row: Prime Gaming claims are often delivered to Epic or GOG via a linked account (live 2026-11-02: an Epic-delivered claim only appeared on the next full refresh; nile synced 0), so the exit refreshes all three, each behind its own sign-in gate.
    2. Change `inFlight` to `new Set<Runner>()` keyed by runner (per todo: "in-flight guard per runner"). This keeps the existing "in-flight is per store" test green because gog and epic are different runners, and prevents an Epic exit and an Amazon exit stacking two legendary refreshes.
    3. Give `runStoreExitRefresh` an optional third parameter `runner: Runner = STORE_EXIT_ROWS[store].targets[0].runner`; the in-flight check/add/delete use `runner`. Append ` runner=${runner}` to the outcome log line (existing assertions use `toContain`, so they stay green), keeping exactly one outcome line per call. Keep gating order, the 'connected'/'unknown' rule and the no-throttle comment as they are. `runSteamStoreExitRefresh` unchanged.
    4. Add exported `interface StoreExitRefreshAllDeps { signInStateFor: (signInKey: StoreExitTarget['signInKey']) => string; refreshInFlightFor: (runner: Runner) => boolean; refreshLibrary: (runner: Runner, origin: string) => Promise<void>; log: (line: string) => void }` and exported `runStoreExitRefreshAll(store, deps): ReadonlyArray<{ runner: Runner; outcome: StoreExitRefreshOutcome }>` that loops the row's targets in order and calls `runStoreExitRefresh(store, { signInState: deps.signInStateFor(t.signInKey), refreshInFlight: deps.refreshInFlightFor(t.runner), refreshLibrary: () => deps.refreshLibrary(t.runner, row.origin), log: deps.log }, t.runner)`. Each target is independent: a skip or a throwing refreshLibrary for one runner must not stop the others (runStoreExitRefresh already catches sync throws). Signed-out targets never reach refreshLibrary, so nothing can prompt. Export the `StoreExitRefreshOutcome` type if the test needs it.
    Do not add any time throttle. Do not edit existing tests. Commit `feat(quick-261105-pnh): store-exit rows name multiple runners; Amazon refreshes nile, legendary and gog`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts && npx prettier --file-info src/frontend/screens/WebView/storeExitRefresh.ts && npx prettier --file-info src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts && npx prettier --check src/frontend/screens/WebView/storeExitRefresh.ts src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts</automated>
  </verify>
  <done>New describe block passes; every pre-existing test in the file passes; `git diff` of the test file against the pre-task commit shows removed lines only in the import list; both files report `{ "ignored": false, "inferredParser": "typescript" }` and pass `prettier --check`.</done>
</task>

<task type="auto">
  <name>Task 2: Wire index.tsx onStoreExit to runStoreExitRefreshAll; typecheck and lint</name>
  <files>src/frontend/screens/WebView/index.tsx</files>
  <action>
    In src/frontend/screens/WebView/index.tsx replace the body of `onStoreExit` (lines ~361-369) with one call `runStoreExitRefreshAll(exited, { signInStateFor: (key) => resolveSignInState(signInInputs[key]), refreshInFlightFor: (runner) => refreshing || refreshingByRunner?.[runner] === true, refreshLibrary: (runner, origin) => refreshLibrary({ library: runner, origin }), log: (line) => window.api.logInfo(line) })`. Update the import on line 26 to bring in `runStoreExitRefreshAll` and drop `runStoreExitRefresh`/`STORE_EXIT_ROWS` if no longer used. Update the comment above `onStoreExit` to say a store row may name several runners (Amazon: nile, legendary, gog, quick 261105-pnh), each behind its own sign-in and in-flight gate. Sign-in state comes only from `collectSignInInputs`/`resolveSignInState` as today. Do NOT change `useStoreEmbedHost.ts` or the `useStoreEmbedHost({...})` call shape (storeEmbedReloadLoop.test.tsx regex-asserts it). Then grep `src/` for any other reader of `.runner`/`.signInKey` on a STORE_EXIT_ROWS row and fix it (only index.tsx is known).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm codecheck && npx eslint src/frontend/screens/WebView/index.tsx src/frontend/screens/WebView/storeExitRefresh.ts src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts && npx jest src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts src/frontend/screens/WebView/__tests__/storeEmbedReloadLoop.test.tsx src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx && grep -c 'runStoreExitRefreshAll(exited' src/frontend/screens/WebView/index.tsx && npx prettier --file-info src/frontend/screens/WebView/index.tsx && npx prettier --check src/frontend/screens/WebView/index.tsx</automated>
  </verify>
  <done>codecheck and eslint clean; the three WebView test files pass; index.tsx calls runStoreExitRefreshAll once; index.tsx reports not ignored and passes prettier --check.</done>
</task>

<task type="auto">
  <name>Task 3: Close the todo (git mv to completed/ with a Closed section); live check recorded as a pending human step</name>
  <files>.planning/todos/pending/2026-11-02-amazon-store-exit-should-refresh-epic-and-gog.md, .planning/todos/completed/2026-11-02-amazon-store-exit-should-refresh-epic-and-gog.md</files>
  <action>
    Follow the precedent of commit 2d37156a5: `git mv .planning/todos/pending/2026-11-02-amazon-store-exit-should-refresh-epic-and-gog.md .planning/todos/completed/` (a rename, so history follows), keep the frontmatter unchanged, and append a `## Closed 2026-11-05 (quick 261105-pnh)` section in plain short sentences: rows now carry `targets`; the Amazon exit refreshes nile, legendary and gog, each behind its own `resolveSignInState(collectSignInInputs(...)[key])` gate, signed-out runners do nothing; the in-flight guard is per runner (shared across stores, so an Epic exit and an Amazon exit cannot stack legendary); no time throttle; Steam/Epic/GOG unchanged with existing tests untouched; list the feat/test commit hashes. Then a bullet stating plainly: "Live check NOT yet done (human step): leave `/store/amazon` after an Epic-delivered Prime claim, without a manual Refresh, and confirm the claim appears and the log shows `origin=amazon-store-exit runner=legendary` (and `[refreshLibrary] runner=legendary origin=amazon-store-exit`)." Do not claim it passed. Note in the same bullet that the check runs under `pnpm tauri:dev` (frontend-only change, so no sidecar rebuild is needed). Commit `docs(quick-261105-pnh): close Amazon store-exit todo; live check pending` with the Co-Authored-By trailer.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test ! -e .planning/todos/pending/2026-11-02-amazon-store-exit-should-refresh-epic-and-gog.md && grep -c 'Live check NOT yet done' .planning/todos/completed/2026-11-02-amazon-store-exit-should-refresh-epic-and-gog.md && pnpm planning-gates && npx prettier --file-info .planning/todos/completed/2026-11-02-amazon-store-exit-should-refresh-epic-and-gog.md</automated>
    <!-- The todo .md path reports { "ignored": true, "inferredParser": null } (measured at planning time for .planning/todos/completed/), so no prettier --check is run for it: a green there would prove nothing. -->
  </verify>
  <done>Todo exists only under completed/ (git shows a rename), carries the Closed section with the live check explicitly marked pending, planning-gates passes, and the prettier probe confirms the path is ignored (no --check carried).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| store embed -> host callback | Only the store key crosses (onStoreExit(storeKey)); no URL, cookie or token is passed to the refresh |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-pnh-01 | Denial of Service | runStoreExitRefreshAll | mitigate | Per-runner in-flight Set plus caller `refreshingByRunner` check stop stacked refreshes; no loop beyond the row's fixed target list |
| T-pnh-02 | Information Disclosure | log lines | accept | Lines carry store key, origin, runner and outcome only, same as today; armForUrl still logs hostname only |
| T-pnh-03 | Spoofing/Elevation | signed-out runners | mitigate | Gate on resolveSignInState per target before refreshLibrary, so a signed-out store never triggers a login prompt |
</threat_model>

<verification>
- `npx jest src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts` green, existing blocks unchanged.
- `pnpm codecheck` and scoped eslint clean.
- Live check (human, NOT claimed by the executor): Epic-delivered Prime claim appears after leaving `/store/amazon` with `origin=amazon-store-exit` against `legendary` in the log.
</verification>

<success_criteria>
- Amazon exit refreshes every signed-in runner of nile/legendary/gog, skips signed-out ones, respects per-runner in-flight, no throttle.
- Steam, Epic and GOG behaviour and tests unchanged.
- Todo moved to completed/ with the live check recorded as an outstanding human step.
</success_criteria>

<output>
Create `.planning/quick/261105-pnh-amazon-store-exit-refreshes-epic-and-gog/261105-pnh-SUMMARY.md` when done
</output>
