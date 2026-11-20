---
phase: quick-261030-qqh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/WebView/steamStoreExitRefresh.ts
  - src/frontend/screens/WebView/__tests__/steamStoreExitRefresh.test.ts
  - src/backend/storeManagers/steam/authTrigger.ts
  - src/backend/storeManagers/steam/__tests__/authTrigger.test.ts
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx
autonomous: true
requirements:
  - TODO-2026-10-28-steam-in-app-purchase-needs-manual-library-refresh
must_haves:
  truths:
    - "Leaving the Steam store embed (route leave or a switch to another store) after the main frame loaded a Steam app, cart or checkout page runs the same Steam library refresh the Redeem-key dialog runs (refreshLibrary with library 'steam'), so a granted or bought game appears without a manual Refresh"
    - "Plain browsing (front page, search, other non app/cart/checkout pages) does not arm the trigger and leaving fires nothing"
    - "Non-Steam store embeds (GOG, Amazon, Humble, Epic, wiki) never fire the trigger"
    - "A signed-out (not-connected) or expired Steam account never fires the trigger and is never prompted"
    - "At most one auto refresh per 2-minute window, and none while any library refresh (global or Steam-scoped) is already in flight"
    - "The refresh is granted its on-demand CM logon (origin 'steam-store-exit' maps to 'user-refresh'); otherwise the refresh is deferred and fetches nothing"
    - "The manual Refresh button, Redeem-key refresh and every other existing origin mapping behave exactly as before"
  artifacts:
    - path: "src/frontend/screens/WebView/steamStoreExitRefresh.ts"
      provides: "isSteamPurchaseIntentUrl, runSteamStoreExitRefresh, STEAM_STORE_EXIT_REFRESH_ORIGIN, STEAM_STORE_EXIT_REFRESH_THROTTLE_MS, resetSteamStoreExitRefreshState"
    - path: "src/backend/storeManagers/steam/authTrigger.ts"
      provides: "'steam-store-exit' -> 'user-refresh' allowlist row"
      contains: "'steam-store-exit': 'user-refresh'"
    - path: "src/frontend/screens/WebView/useStoreEmbedHost.ts"
      provides: "arm-on-drained-URL + fire-on-leave via optional onSteamStoreExit option"
      contains: "onSteamStoreExit"
  key_links:
    - from: "src/frontend/screens/WebView/index.tsx"
      to: "ContextProvider.refreshLibrary"
      via: "runSteamStoreExitRefresh({ refreshLibrary: () => refreshLibrary({ library: 'steam', origin: STEAM_STORE_EXIT_REFRESH_ORIGIN }) ... })"
      pattern: "runSteamStoreExitRefresh"
    - from: "src/frontend/screens/WebView/useStoreEmbedHost.ts"
      to: "storeEmbedTakeNavEvents drain"
      via: "every drained event's url (not only the last) is checked with isSteamPurchaseIntentUrl"
      pattern: "isSteamPurchaseIntentUrl"
    - from: "renderer origin 'steam-store-exit'"
      to: "authTrigger ORIGIN_TO_TRIGGER"
      via: "noteRefreshTrigger -> pendingRefreshLogonGrant = 'user-refresh'"
      pattern: "steam-store-exit"
---

<objective>
Refresh the Steam library automatically when the user leaves the in-app Steam store after the
embed's main frame loaded a Steam app, cart or checkout page, so a purchased or free-granted game
appears without a manual Refresh. Actions todo
`.planning/todos/pending/2026-10-28-steam-in-app-purchase-needs-manual-library-refresh.md`.

Purpose: a user who just paid (or clicked "Add to Library") expects the game in the library.
The probe (CONTEXT.md, locked) showed a free grant is an in-page XHR with no main-frame load, so
the trigger is "leave the store after an app/cart/checkout page", not a receipt-URL match.

Output: one pure decision module, one allowlist row, arming + firing in the embed host hook,
wiring in the WebView screen, tests for each.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/261030-qqh-refresh-the-steam-library-when-leaving-t/261030-qqh-CONTEXT.md
@.planning/todos/pending/2026-10-28-steam-in-app-purchase-needs-manual-library-refresh.md
@./CLAUDE.md

<findings>
Planner desk findings (verified in source 2026-10-30; executor need not re-derive):

(a) Manual Refresh button: `src/frontend/components/UI/Header/index.tsx` ~L458 calls context
`refreshLibrary({ checkForUpdates: true, origin: 'action-icons-refresh-button' })` (all runners).
`GlobalState.refreshLibrary` (`src/frontend/state/GlobalState.tsx` ~L1377) logs
`[refreshLibrary] runner=… origin=…`, guards on `state.refreshing` (global) and, for a scoped call,
`state.refreshingByRunner[runner]`, then `await window.api.refreshLibrary(library, origin)` and
`this.refresh(library)`. Backend `handleRefreshLibrary` (`src/backend/sidecar/steamFlowRegistration.ts`
~L139) calls `noteRefreshTrigger(runner, origin)` then `libraryManagerMap.steam.refresh()`.

(b) Redeem key: `src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx` L93 calls
`refreshLibrary({ library: 'steam', origin: 'redeem-steam-key' })` after a successful
`window.api.redeemSteamKey`. Same path as (a), scoped to Steam. THIS is the call shape to reuse.

CRITICAL: `SteamLibraryManager.refresh()` (`src/backend/storeManagers/steam/library.ts` L1093)
only opens an authenticated CM logon when `consumeSteamRefreshLogonGrant()` returns a grant, and
the grant is armed only for origins in `ORIGIN_TO_TRIGGER`
(`src/backend/storeManagers/steam/authTrigger.ts`) that map to `'user-refresh'`/`'login'`. An
unlisted origin maps to `'startup'` and the refresh is DEFERRED (cached library, no owned-apps
fetch) — it would silently do nothing useful. So the new origin MUST be added to that allowlist.
This is not new IPC; it is one row in the existing allowlist (CONTEXT: "the refresh's own
on-demand logon is accepted").

(c) Embed lifecycle (`src/frontend/screens/WebView/useStoreEmbedHost.ts`, 882 lines):
- Route leave = hook unmount: the `[]`-deps effect at ~L794 hides on cleanup, or closes when
  `tearingDownRef.current` (set by `beforeunload`) is true — app teardown.
- Store switch (e.g. steam -> gog) does NOT unmount (`store/:store` is one route); `storeKey`
  changes and the start-URL effect (~L652) navigates or reopens.
- Suppression (modal over the embed, ~L753) hides/shows but is NOT leaving.
- One lifecycle point covers both route leave and store switch: the cleanup of an effect keyed
  on `[storeKey]` (it runs on storeKey change AND on unmount, with the PREVIOUS storeKey in its
  closure).
- `storeKey` is `'steam'` for `/store/steam` and for a `store-page` deep link resolving to Steam
  (`index.tsx` ~L299).

(d) Nav events: `window.api.storeEmbedTakeNavEvents()` resolves an array of
`{ url, host, canGoBack, canGoForward, loadTimedOut?, challenged?, blockedLauncherSchemeCount? }`.
The drain effect (~L310-357) applies only the LAST event of a batch to `navState` — so arming
must scan EVERY event in the batch, or an app page followed quickly by another load inside one
250 ms tick is missed. Chrome-initiated navigations return `{ status: 'ok', navState }` through
`applyNavResult` (~L229); arm from that `navState.url` too.

Sign-in: `index.tsx` already computes `collectSignInInputs({...steamUsername: steam?.username},
signInProbeOutcomes)` and takes `.legendary`; the same object has a `.steam` entry, and
`resolveSignInState` (`src/common/signInState.ts`) returns
`'connected' | 'not-connected' | 'expired' | 'unknown'`.

Context type (`src/frontend/types.ts` L64-75) exposes `refreshLibrary`, `refreshing`,
`refreshingByRunner`.
</findings>

<interfaces>
From src/frontend/types.ts:
  refreshLibrary: (options: { checkForUpdates?; fullRefresh?; library?: Runner | 'all'; runInBackground?; origin?: string }) => Promise<void>
  refreshing: boolean
  refreshingByRunner: Partial<Record<Runner, boolean>>

From src/common/signInState.ts:
  export type SignInState = 'connected' | 'not-connected' | 'expired' | 'unknown'
  export function resolveSignInState(input: SignInSelectorInput): SignInState

From src/backend/storeManagers/steam/authTrigger.ts:
  const ORIGIN_TO_TRIGGER: Readonly<Record<string, SteamAuthTrigger>>   // allowlist
  export function mapRefreshOriginToTrigger(origin?: string | null): SteamAuthTrigger
  export function noteRefreshTrigger(runner, origin): void   // arms pendingRefreshLogonGrant for user-refresh/login
  export function consumeSteamRefreshLogonGrant(): 'user-refresh' | 'login' | null
  export function resetSteamAuthTrigger(): void

From src/frontend/screens/WebView/useStoreEmbedHost.ts:
  interface UseStoreEmbedHostOptions { slotNode; startUrl; storeKey; isStoreRoute; platform; signInState }
  test harness (__tests__/useStoreEmbedHost.test.tsx): mount/reinvoke/invoke(MountOptions),
  harness().__unmount(), mockApi.storeEmbedTakeNavEvents, jest fake timers + advanceTimersByTime(250)
  then two `await Promise.resolve()` to flush a drain; `windowListeners` map for beforeunload.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Decision module (arm predicate, throttle, in-flight and sign-in gates) + logon-granting origin</name>
  <files>src/frontend/screens/WebView/steamStoreExitRefresh.ts, src/frontend/screens/WebView/__tests__/steamStoreExitRefresh.test.ts, src/backend/storeManagers/steam/authTrigger.ts, src/backend/storeManagers/steam/__tests__/authTrigger.test.ts</files>
  <behavior>
    steamStoreExitRefresh.test.ts (write first, watch it fail):
    - isSteamPurchaseIntentUrl true for https://store.steampowered.com/app/391540/Undertale/, https://store.steampowered.com/cart/, https://store.steampowered.com/cart, https://checkout.steampowered.com/checkout/?purchasetype=self, https://store.steampowered.com/checkout/?purchasetype=self
    - false for https://store.steampowered.com/ (front page), /search/?term=x, /explore/, /wishlist/, http://store.steampowered.com/app/1 (not https), https://evilstore.steampowered.com.attacker.net/app/1, https://attacker.net/?u=store.steampowered.com/app/1, https://www.gog.com/game/foo, https://store.steampowered.com/application/1 (prefix boundary: '/app/' with trailing slash, '/cart' then end-or-'/'-or-'?', '/checkout' then end-or-'/'-or-'?'), and an unparseable string (no throw)
    - runSteamStoreExitRefresh: signInState 'not-connected' -> outcome 'skipped-signed-out', refreshLibrary not called; 'expired' -> same; 'connected' and 'unknown' -> 'refreshed', refreshLibrary called once
    - refreshInFlight true -> 'skipped-in-flight', not called, and does NOT consume the throttle window (an immediate retry with refreshInFlight false refreshes)
    - two calls 1 s apart -> second 'skipped-throttled'; a call at now + STEAM_STORE_EXIT_REFRESH_THROTTLE_MS -> 'refreshed'
    - while the previous auto refresh promise is unresolved (even past the throttle window) -> 'skipped-in-flight'; after it resolves OR rejects, a call past the window refreshes (rejection is swallowed, never thrown)
    - log callback receives one line per call containing 'steam-store-exit' and the outcome
    authTrigger.test.ts additions:
    - mapRefreshOriginToTrigger('steam-store-exit') === 'user-refresh'
    - noteRefreshTrigger('steam', 'steam-store-exit') then consumeSteamRefreshLogonGrant() === 'user-refresh'
    - noteRefreshTrigger('gog', 'steam-store-exit') leaves the gate locked and arms no grant
    - existing assertions (action-icons-refresh-button, redeem-steam-key -> user-refresh; game-status, nav-tabs-games-tab -> startup) stay green unchanged
  </behavior>
  <action>
Create `src/frontend/screens/WebView/steamStoreExitRefresh.ts`, a pure leaf module (no React, no `window` access; every side effect injected) so it is unit-testable under the node jest env. Exports:

- `STEAM_STORE_EXIT_REFRESH_ORIGIN = 'steam-store-exit'` (const string literal).
- `STEAM_STORE_EXIT_REFRESH_THROTTLE_MS = 2 * 60 * 1000` (Claude's discretion per CONTEXT: "minutes not hours"; 2 minutes covers a buy-then-browse-then-leave loop without hammering CM).
- `isSteamPurchaseIntentUrl(url: string): boolean` — parse with `new URL` in try/catch (return false on throw); require `protocol === 'https:'`; hostname must EQUAL `store.steampowered.com` or `checkout.steampowered.com` (exact equality, not substring/suffix, matching the D-31 discipline in `storeEmbedOrigins.ts`); pathname matches `/app/<anything>`, or `/cart` / `/checkout` followed by end, `/`. (Query string is in `search`, not pathname, so `/cart` with `?` is just pathname `/cart`.) Per the locked CONTEXT gate: app, cart or checkout pages only — do not widen to `/sub/`, `/bundle/` (both purchase via cart/checkout anyway).
- `runSteamStoreExitRefresh(deps): SteamStoreExitRefreshOutcome` where deps is `{ signInState: string; refreshInFlight: boolean; refreshLibrary: () => Promise<void>; log: (line: string) => void; now?: () => number }` and the outcome union is `'refreshed' | 'skipped-signed-out' | 'skipped-in-flight' | 'skipped-throttled'`. Order of gates: sign-in first (only `'connected'` or `'unknown'` proceed — `'not-connected'`/`'expired'` must never dispatch, CONTEXT "signed-out: do nothing, never prompt"); then in-flight (`deps.refreshInFlight` OR the module-level `autoRefreshInFlight` flag); then throttle (`lastAutoRefreshAt !== null && now - lastAutoRefreshAt < THROTTLE`). On proceed: set `lastAutoRefreshAt = now`, set `autoRefreshInFlight = true`, call `deps.refreshLibrary()` and in `.catch` log the failure, `.finally` clear `autoRefreshInFlight`. Return synchronously. Always emit exactly one `deps.log` line: `[steamStoreExitRefresh] origin=steam-store-exit outcome=<outcome>` (quiet observability, CONTEXT discretion). Module state is module-level (not per-mount) because route leave unmounts the hook; it must outlive mounts.
- `resetSteamStoreExitRefreshState(): void` — test seam clearing both module variables (same pattern as `resetStoreEmbedSignInBaselines`).

In `src/backend/storeManagers/steam/authTrigger.ts` add one row to `ORIGIN_TO_TRIGGER`: `'steam-store-exit': 'user-refresh'`, with a one-line comment that it is the leave-the-Steam-store auto refresh (quick 261030-qqh), deliberate because the user just acted in the store, and that the renderer gates it on sign-in, app/cart/checkout arming and a 2-minute throttle. Without this row the refresh maps to `'startup'` and `refresh()` defers with no owned-apps fetch (finding b). Do not touch `LOGON_GRANTING_TRIGGERS`, `DELIBERATE_TRIGGERS` or any other row.

Add the tests in `<behavior>` to `__tests__/steamStoreExitRefresh.test.ts` (new; inject a fake `now` and a `jest.fn()` log; call `resetSteamStoreExitRefreshState()` in `beforeEach`) and to the existing `authTrigger.test.ts` (inside the existing `mapRefreshOriginToTrigger` and `noteRefreshTrigger` describes; that file already resets state in `beforeEach`).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/frontend/screens/WebView/__tests__/steamStoreExitRefresh.test.ts src/backend/storeManagers/steam/__tests__/authTrigger.test.ts && pnpm codecheck && npx eslint src/frontend/screens/WebView/steamStoreExitRefresh.ts src/frontend/screens/WebView/__tests__/steamStoreExitRefresh.test.ts src/backend/storeManagers/steam/authTrigger.ts src/backend/storeManagers/steam/__tests__/authTrigger.test.ts && npx prettier --check src/frontend/screens/WebView/steamStoreExitRefresh.ts src/frontend/screens/WebView/__tests__/steamStoreExitRefresh.test.ts src/backend/storeManagers/steam/authTrigger.ts src/backend/storeManagers/steam/__tests__/authTrigger.test.ts</automated>
  </verify>
  <done>New module exports the five named symbols; all behavior cases pass; authTrigger maps 'steam-store-exit' to 'user-refresh' and arms the grant only for Steam-inclusive dispatches; every pre-existing authTrigger test unchanged and green; codecheck, scoped eslint and scoped prettier exit 0.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Arm from the nav drain, fire on leaving the Steam store, wire to the existing Steam-scoped refresh</name>
  <files>src/frontend/screens/WebView/useStoreEmbedHost.ts, src/frontend/screens/WebView/index.tsx, src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx</files>
  <behavior>
    New cases appended to useStoreEmbedHost.test.tsx (add `onSteamStoreExit?: () => void` to MountOptions and pass it through `invoke`; use `jest.fn()`):
    - steam store, drain delivers [{url: 'https://store.steampowered.com/app/391540/'}, {url: 'https://store.steampowered.com/'}] in ONE batch (app page is NOT last), then __unmount (no beforeunload) -> onSteamStoreExit called exactly once
    - steam store, drain delivers only front page / search URLs, then __unmount -> not called
    - steam store, armed, then reinvoke with storeKey 'gog' and a gog startUrl (store switch, no unmount) -> called once; a later __unmount on gog -> not called again
    - gog store (storeKey 'gog'), drain delivers a steam app URL (stale cross-store event), then __unmount -> not called
    - steam store, armed, then beforeunload fires (windowListeners) then __unmount -> not called (app teardown is not "leaving")
    - steam store, armed, then suppression toggles true then false -> not called (a modal is not leaving)
    - chrome-initiated: steam store, mockApi.storeEmbedNavigate resolves {status:'ok', navState:{url:'https://store.steampowered.com/cart/', ...}}, call returned onNavigate(url), flush, __unmount -> called once
    - fires once per session: steam armed -> switch to gog (fires) -> switch back to steam with no new purchase-intent URL -> switch to gog -> not called a second time
    - all pre-existing cases 1-27+ stay green with no edits (option omitted = no behavior change)
  </behavior>
  <action>
In `useStoreEmbedHost.ts`:

1. Add an optional option `onSteamStoreExit?: () => void` to `UseStoreEmbedHostOptions` with a doc comment (quick 261030-qqh: called when the user leaves a Steam store session in which the main frame loaded an app/cart/checkout page; never on app teardown, never on suppression). Optional so every existing caller and test is unchanged.
2. Keep the latest callback in a ref updated every render (`onSteamStoreExitRef.current = onSteamStoreExit`), because the firing cleanup closes over a stale render otherwise and index.tsx's closure carries live sign-in/in-flight values. Likewise keep `storeKeyRef.current = storeKey` each render for the drain's `[]`-deps closure.
3. Add `steamPurchaseIntentArmedRef = useRef(false)` and a local `noteVisitedUrl(url)` helper: when `storeKeyRef.current === 'steam'` and `isSteamPurchaseIntentUrl(url)` (imported from `./steamStoreExitRefresh`), set the ref true. Call it (a) in the drain's `.then` for EVERY event in `events` (before the existing `latest` logic; finding d: the drain coalesces to the last event, so arming from `latest` alone misses an app page followed by another load in one tick), and (b) in `applyNavResult` on the `status === 'ok'` branch with `result.navState.url`. Do not change the existing drain or applyNavResult semantics otherwise.
4. Add a new effect placed AFTER the ROUTE LIFECYCLE effect (so `tearingDownRef` is declared above it), keyed on `[storeKey]`. Body: when `storeKey === 'steam'` reset the armed ref to false (a fresh Steam store session). Cleanup (runs on storeKey change and on unmount, with the PREVIOUS storeKey in its closure): if the previous storeKey was not `'steam'` return; read and clear the armed ref; if `tearingDownRef.current` return; if it was armed, call `onSteamStoreExitRef.current?.()`. Comment that this one cleanup covers both "leaving" shapes from CONTEXT (route leave = unmount; store switch = storeKey change with `store/:store` as one route) and deliberately not suppression hide (CONTEXT locked trigger: refresh on store exit; finding c).

In `index.tsx`:

5. Pull `refreshLibrary`, `refreshing`, `refreshingByRunner` from the existing `useContext(ContextProvider)` destructure.
6. Hoist the existing `collectSignInInputs({...}, signInProbeOutcomes)` result into a `const signInInputs` and derive both the existing `signInState = resolveSignInState(signInInputs.legendary)` (unchanged value) and `steamSignInState = resolveSignInState(signInInputs.steam)`. Do NOT touch the source between the `isStorePageDeepLink` and `isStoreRoute` markers (WebViewDeepLinkAndRestore.test.ts extracts that raw slice).
7. Pass `onSteamStoreExit` to `useStoreEmbedHost`: a function that calls `runSteamStoreExitRefresh({ signInState: steamSignInState, refreshInFlight: refreshing || refreshingByRunner.steam === true, refreshLibrary: () => refreshLibrary({ library: 'steam', origin: STEAM_STORE_EXIT_REFRESH_ORIGIN }), log: (line) => window.api.logInfo(line) })`. This is the exact Redeem-key call shape (finding b) with its own origin — no second refresh path, no new IPC. `refreshing` is checked as well as the Steam scoped flag because `GlobalState.refreshLibrary`'s scoped guard does not look at the global flag, so a scoped call could otherwise stack on an in-flight all-runner refresh (CONTEXT: never stack). Do not set `runInBackground: false` (the default background refresh, same as Redeem).

Do not edit `GlobalState.tsx`, `Header/index.tsx` or `RedeemSteamKeyDialog` — the manual Refresh behaviour must be byte-identical.

Write the `<behavior>` cases first and watch the new ones fail, then implement.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/frontend/screens/WebView src/backend/storeManagers/steam/__tests__/authTrigger.test.ts && git diff --quiet -- src/frontend/state/GlobalState.tsx src/frontend/components/UI/Header/index.tsx src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx && pnpm codecheck && npx eslint src/frontend/screens/WebView/useStoreEmbedHost.ts src/frontend/screens/WebView/index.tsx src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx && npx prettier --check src/frontend/screens/WebView/useStoreEmbedHost.ts src/frontend/screens/WebView/index.tsx src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx</automated>
  </verify>
  <done>Every WebView test suite (including the structural index.tsx readers and all pre-existing useStoreEmbedHost cases) passes; the new cases prove arm-from-any-batch-event, fire on unmount and on store switch, no fire for plain browsing, non-Steam stores, teardown or suppression, once per session; index.tsx dispatches only through runSteamStoreExitRefresh with origin 'steam-store-exit' and library 'steam'; GlobalState/Header/RedeemSteamKeyDialog untouched; codecheck, scoped eslint and scoped prettier exit 0.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| embed page -> renderer | Main-frame URLs reported by Rust `on_page_load` come from untrusted web content navigation |
| renderer -> sidecar | `refreshLibrary(runner, origin)` origin string selects keyring/CM-logon privilege |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-qqh-01 | Spoofing | isSteamPurchaseIntentUrl | mitigate | https only, exact hostname equality (store./checkout.steampowered.com), path-prefix boundary; tests cover suffix/substring/query spoof URLs |
| T-qqh-02 | Denial of Service | auto refresh loop hitting CM | mitigate | 2-minute module-level throttle + module in-flight flag + context refreshing/refreshingByRunner.steam check; fires only on leave, once per armed session |
| T-qqh-03 | Elevation of Privilege | ORIGIN_TO_TRIGGER new row | mitigate | row maps to 'user-refresh' only; noteRefreshTrigger still ignores non-Steam runners (test added); renderer gates on signed-in state so a signed-out account never reaches the logon path |
| T-qqh-04 | Information Disclosure | log line | accept | logs only the fixed origin label and outcome enum, never a URL, token or app id |
</threat_model>

<verification>
- `npx jest src/frontend/screens/WebView src/backend/storeManagers/steam/__tests__/authTrigger.test.ts` green.
- `pnpm codecheck` green.
- Scoped eslint and scoped `npx prettier --check` over exactly the seven written paths green (all seven are not prettier-ignored: `--file-info` on useStoreEmbedHost.ts reports `ignored: false`; the others are ordinary `src/` TS files).
- `git diff --quiet` on GlobalState.tsx, Header/index.tsx, RedeemSteamKeyDialog/index.tsx.
</verification>

<success_criteria>
- Leaving the Steam store (route leave or store switch) after an app/cart/checkout main-frame load dispatches `refreshLibrary({ library: 'steam', origin: 'steam-store-exit' })` exactly once, subject to sign-in, in-flight and 2-minute throttle gates.
- That origin earns the one-shot `'user-refresh'` CM logon grant, so the owned-apps fetch actually runs.
- No other trigger, store or existing refresh origin changes behaviour.
</success_criteria>

<output>
Create `.planning/quick/261030-qqh-refresh-the-steam-library-when-leaving-t/261030-qqh-SUMMARY.md` when done.

The SUMMARY must carry the live gate as OPEN (operator work, not executor work):
"Live gate (open): in a dev build signed in to Steam, open the in-app Steam store, open a
free-to-own app page, click Add to Library, leave the store (Games tab or switch to GOG). The game
appears in the library with no manual Refresh, and gamelib.log shows
`[refreshLibrary] runner=steam origin=steam-store-exit` and
`[steamStoreExitRefresh] origin=steam-store-exit outcome=refreshed`. Also note whether the guided
Go Offline dialog appeared (macOS with Mac Steam signed in — the same on-demand logon path the
Redeem refresh uses)." Remember `tauri dev` does not rebuild the sidecar (authTrigger.ts change):
restart dev before the live gate.

Leave the todo in `pending/` with `ready: live-gate` until the operator passes the gate.
</output>
