---
phase: quick-260806-teb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/screens/WebView/__tests__/WebViewAmazonLoginDataSpawn.test.ts
  - src/backend/storeManagers/nile/user.ts
  - src/backend/storeManagers/nile/__tests__/user.test.ts
  - src/frontend/screens/WebView/useTauriOAuthLogin.ts
  - src/frontend/screens/WebView/__tests__/useTauriOAuthLogin.test.tsx
  - src/frontend/screens/WebView/components/TauriLoginPanel.tsx
  - src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx
autonomous: false
requirements: [QUICK-TEB-01]

must_haves:
  truths:
    - "Under Tauri, navigating to /loginweb/nile issues exactly ONE `nile auth --login --non-interactive` subprocess spawn, not two."
    - "Electron's embedded <webview> Amazon login path still fetches its own login data and is behaviourally unchanged."
    - "Two concurrent getAmazonLoginData() callers share a single in-flight nile spawn rather than racing two."
    - "A SECOND, sequential login attempt (e.g. after cancelling) mints FRESH login data — code_verifier/serial are never reused from a cache."
    - "From the moment the user picks Amazon until the native sign-in window actually opens, the login surface shows an animated 'Preparing Amazon sign-in…' surface, never the false 'A sign-in window has opened' copy."
    - "The three non-nile OAuth runners (legendary/gog/zoom) still go straight to `awaiting` with no preparing surface, because they resolve their URL from a constant with no spawn."
  artifacts:
    - path: "src/frontend/screens/WebView/index.tsx"
      provides: "isTauri()-gated /loginweb/nile login-data effect — the Electron-only branch no longer spawns nile on the Tauri path"
      contains: "isTauri()"
    - path: "src/backend/storeManagers/nile/user.ts"
      provides: "In-flight-promise memoization around NileUser.getLoginData()'s runRunnerCommand spawn, plus a test-only reset hook"
      contains: "inFlightLoginData"
    - path: "src/frontend/screens/WebView/useTauriOAuthLogin.ts"
      provides: "A { phase: 'preparing'; runner } member of TauriOAuthLoginState, set before the nile login-url fetch"
      contains: "phase: 'preparing'"
    - path: "src/frontend/screens/WebView/components/TauriLoginPanel.tsx"
      provides: "The preparing render branch with heading, body and the existing spinner element"
      contains: "webview.login.oauth.preparing.heading"
  key_links:
    - from: "src/frontend/screens/WebView/useTauriOAuthLogin.ts"
      to: "src/frontend/screens/WebView/components/TauriLoginPanel.tsx"
      via: "the existing `state={oauthLoginState}` prop already wired in WebView/index.tsx — NO new wiring"
      pattern: "phase === 'preparing'"
    - from: "src/frontend/screens/WebView/index.tsx"
      to: "src/frontend/screens/WebView/useTauriOAuthLogin.ts"
      via: "useTauriOAuthLogin becomes the SOLE getAmazonLoginData caller under Tauri"
      pattern: "getAmazonLoginData"
---

<objective>
Cut the dead time between picking Amazon on Manage Accounts and the Amazon sign-in window
actually appearing under Tauri, and make the wait that remains honest and visibly in progress.

Purpose: the Amazon login is the slowest of the five under Tauri and it is slow for a reason
that is fixable in-repo — it pays the PyInstaller-onefile spawn tax TWICE before the window
can open. A second, independent problem makes the remaining wait feel worse than it is: the
panel claims a sign-in window has already opened when it has not.

Output: one fewer nile subprocess spawn on the Tauri login critical path, an in-flight guard so
duplicate/remount callers can never reintroduce a second one, and a `preparing` surface with a
spinner covering the pre-window wait.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md

@src/frontend/screens/WebView/index.tsx
@src/frontend/screens/WebView/useTauriOAuthLogin.ts
@src/frontend/screens/WebView/components/TauriLoginPanel.tsx
@src/backend/storeManagers/nile/user.ts
@src/backend/utils/systeminfo/index.ts
@src/frontend/screens/WebView/__tests__/WebViewOAuthNavigation.test.ts

## The diagnosis this plan is built on (verified read-only against the tree, 2026-08-06)

`nile` is one of the vendored PyInstaller `--onefile` runners. Memory
`pyinstaller-onefile-spawn-tax` records it hardware-measured at **~12.8 s per invocation on
macOS** (36 ad-hoc-signed Mach-O files re-extracted to a randomly-named `$TMPDIR/_MEIxxxxxx`,
defeating the Gatekeeper assessment cache). This is NOT a dev-build artifact; it reproduces in a
signed production build. The only in-repo lever is **call-count reduction**.

`NileUser.getLoginData()` (`src/backend/storeManagers/nile/user.ts:27`) is exactly one such
invocation: `runRunnerCommand(['auth', '--login', '--non-interactive'])`.

Under Tauri, routing to `/loginweb/nile` currently fires that spawn **twice**, from two
independent effects in the same component tree:

1. `WebView/index.tsx:224-238` — `useEffect(..., [pathname])` gated ONLY on
   `pathname !== '/loginweb/nile'`. There is no `isTauri()` guard. Its result
   (`amazonLoginData`) is consumed in exactly two places, and **both are dead under Tauri**:
   - `urls['/loginweb/nile']` (line 202) — the `src` of the Electron `<webview>` element, which
     is never rendered under Tauri (render returns `<TauriLoginPanel …/>` at the
     `!webviewPreloadPath && isTauri() && isLoginPathname(pathname)` branch first);
   - `handleAmazonLogin` (line 241), reached only from line 369 inside the webview
     event-listener effect, which no-ops when `webviewRef.current` is null — as it is under
     Tauri.
   So under Tauri this effect spawns nile for ~12.8 s and then throws the result away.

2. `useTauriOAuthLogin.ts:196` — `amazonData = await window.api.getAmazonLoginData()`. This is
   the REAL Tauri path; its `.url` is what `oauthCaptureLogin` opens, and its
   `client_id`/`code_verifier`/`serial` are carried forward to the `authAmazon` exchange. This
   one must stay.

Both fire on mount, concurrently, contending on the same amfid Gatekeeper scan storm, and the
sign-in window cannot open until (2) resolves.

This is the same defect shape already fixed once for GOG: commit `82ce07376` removed a redundant
second `gogdl auth` ("almost pure spawn tax"), and `9c9ad5a95` added the in-flight-promise
memoization pattern this plan reuses.

Second, independent problem — the copy is wrong during that wait. `useTauriOAuthLogin` sets
`{ phase: 'awaiting' }` as its FIRST action (line 181), before the nile fetch. `TauriLoginPanel`'s
`awaiting` branch renders *"A sign-in window has opened. Complete sign-in there."* with no
spinner. For nile that statement is false for the whole pre-window wait. The three other OAuth
runners resolve their URL from a module constant (`EPIC_LOGIN_URL`/`GOG_LOGIN_URL`/
`ZOOM_LOGIN_URL`) with zero spawns, so `awaiting` is accurate for them and must not change.

## Precedents to follow exactly (do not invent new patterns)

- **In-flight memoization:** `src/backend/utils/systeminfo/index.ts:69-99` — `inFlightSystemInfoFetch`
  plus a `finally` that clears it only when it is still the same promise, plus a test-only reset
  hook (this project's Jest config has no `resetModules`, so module-level state survives between
  tests within a file).
- **A new transient phase + panel surface:** quick task `260803-eee` added `finalizing` the same
  way — a new `TauriOAuthLoginState` member set at an existing boundary, a new
  `TauriLoginPanel` branch reusing the already-shipped `WebView__unavailablePanel-spinner` class
  in `index.css`. No new IPC channel, no new CSS.
- **Testing `WebView/index.tsx`:** nothing in this tree imports it (no jsdom /
  react-test-renderer installed; its module graph touches `window` at import time).
  `__tests__/WebViewOAuthNavigation.test.ts` is the established **source-text structural gate**
  precedent, including its self-test-against-synthetic-regressed-sources anti-vacuity
  requirement. Follow it.
- **Hook testing:** `__tests__/useTauriOAuthLogin.test.tsx` mocks `react` with a hand-rolled
  slot-based `useState`/`useEffect`. Extend that suite; do not add a new harness.
- **i18n:** fork-added frontend copy uses `t('dotted.key', 'English default')` inline (see every
  branch of `TauriLoginPanel.tsx`). New copy MUST use that form — no bare string literals in JSX.

<interfaces>
From src/frontend/screens/WebView/useTauriOAuthLogin.ts:
```typescript
export type TauriOAuthLoginState =
  | { phase: 'idle' }
  | { phase: 'awaiting' }
  | { phase: 'finalizing'; runner: OAuthRunner }
  | { phase: 'blocked'; runner: OAuthRunner; channel: string }
  | { phase: 'cancelled' }
  | { phase: 'timeout' }
  | { phase: 'error'; message: string }
```

From src/common/types/nile.ts:
```typescript
// NileLoginData: { url, code_verifier, serial, client_id }
```

From src/backend/storeManagers/nile/user.ts:
```typescript
static async getLoginData(): Promise<NileLoginData>
```

From src/frontend/preload/tauriTransport (already imported by WebView/index.tsx line 18):
```typescript
export function isTauri(): boolean
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Stop the Tauri path spawning nile a second time for data it discards</name>
  <files>src/frontend/screens/WebView/index.tsx, src/frontend/screens/WebView/__tests__/WebViewAmazonLoginDataSpawn.test.ts</files>
  <behavior>
    - Source-text gate: the `/loginweb/nile` effect body in `WebView/index.tsx` contains an
      `isTauri()` early-return guard positioned BEFORE the `amazon.getLoginData()` call.
    - Source-text gate: `amazon.getLoginData()` appears exactly once in the file (no second
      call site was added elsewhere while "fixing" this).
    - Source-text gate: the `setLoading({ refresh: true, message: t('status.preparing_login', …) })`
      call stays inside that same guarded effect — the Electron loading indicator must not be
      hoisted above the guard, or Tauri gets a stuck spinner behind the panel.
    - Anti-vacuity self-test: the gate FAILS against a synthetic source string with the
      `isTauri()` guard removed, and FAILS against one where the guard is placed after the
      `getLoginData()` call. Assert both, following `WebViewOAuthNavigation.test.ts`'s own
      self-test section.
  </behavior>
  <action>
In `src/frontend/screens/WebView/index.tsx`, add an `isTauri()` early return to the
`/loginweb/nile` effect (currently at lines 224-238), immediately after the existing
`if (pathname !== '/loginweb/nile') return` line and before `setLoading(...)`:

Guard shape: return early when `isTauri()` is true. `isTauri` is ALREADY imported at line 18 —
do not add a duplicate import.

Attach a comment on the guard recording WHY, because a future reader will otherwise "restore"
it as dead defensive code: under Tauri this effect's only consumers (`urls['/loginweb/nile']`
feeding the `<webview>` `src`, and `handleAmazonLogin` via the webview event listener) are both
unreachable — the render returns `<TauriLoginPanel>` before any `<webview>` exists and
`webviewRef.current` stays null — so the effect paid a ~12.8 s `nile auth` spawn
(`pyinstaller-onefile-spawn-tax`) purely to discard the result, while
`useTauriOAuthLogin.ts`'s own `getAmazonLoginData()` call did the real work in parallel.
Name `useTauriOAuthLogin.ts:196` as the single remaining owner of that fetch under Tauri.

Do NOT touch `amazonLoginData` state, `handleAmazonLogin`, `urls`, or anything else in the
Electron branch — Electron must keep fetching exactly as it does today.

Then create `src/frontend/screens/WebView/__tests__/WebViewAmazonLoginDataSpawn.test.ts` as a
source-text structural gate, modelled on `WebViewOAuthNavigation.test.ts` (read it first — copy
its `readFileSync` + docstring + self-test-against-synthetic-regressed-sources structure). Write
a docstring that states the measured cost being defended (nile ~12.8 s/invocation, two spawns
before the window could open) and states plainly what the gate does NOT prove: that a live login
is faster. That needs a live session.

Extract the effect body by locating the `pathname !== '/loginweb/nile'` marker and slicing to
the effect's closing `}, [pathname])`, then assert ordering by index comparison
(`indexOf('isTauri()') < indexOf('getLoginData')`) rather than a brittle whole-body regex.
  </action>
  <verify>
    <automated>npx jest --selectProjects Frontend --testPathPattern "WebViewAmazonLoginDataSpawn" 2>&1 | tail -20</automated>
  </verify>
  <done>The new gate suite passes, its two synthetic-regression self-tests both prove the gate is non-vacuous, and `git diff src/frontend/screens/WebView/index.tsx` shows only the guard plus its comment.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Share one in-flight nile auth spawn across concurrent callers, without ever caching PKCE material</name>
  <files>src/backend/storeManagers/nile/user.ts, src/backend/storeManagers/nile/__tests__/user.test.ts</files>
  <behavior>
    - Two `getLoginData()` calls issued before the first resolves invoke `runRunnerCommand`
      exactly ONCE, and both receive the same resolved `NileLoginData`.
    - A `getLoginData()` call issued AFTER the previous one resolved invokes `runRunnerCommand`
      again — a second call must mint FRESH `code_verifier`/`serial`. This is the load-bearing
      negative test: a TTL value cache here would be a correctness bug, not an optimisation.
    - A rejected in-flight fetch clears the memo, so the NEXT call retries with a fresh spawn
      rather than re-rejecting forever off a poisoned promise.
    - Both concurrent callers observe the same rejection when the underlying spawn fails.
  </behavior>
  <action>
In `src/backend/storeManagers/nile/user.ts`, add module-level in-flight-promise memoization
around `NileUser.getLoginData()`'s `runRunnerCommand` call. Mirror
`src/backend/utils/systeminfo/index.ts:69-99` exactly in structure — read it first.

Concretely: a module-level `let inFlightLoginData: Promise<NileLoginData> | null = null`. On
entry, if it is non-null, return it. Otherwise build the fetch promise, assign it to
`inFlightLoginData`, and clear the slot in a `finally` ONLY when `inFlightLoginData` is still
that same promise (the systeminfo identity check — it prevents a slow loser clearing a newer
winner's slot).

CRITICAL — there is deliberately NO value cache and NO TTL, unlike `GOGUser.getCredentials()`.
`NileLoginData` carries single-use PKCE material (`code_verifier`, `serial`) consumed by the
`authAmazon` → `nile register` exchange. Reusing it across attempts would break a retry after a
cancelled login. Write this as a comment on the declaration, phrased as a prohibition, so a
future "consistency" pass does not add the TTL that the GOG sibling has.

Move the existing `logDebug`/`logInfo` calls so they still describe one real fetch: the "Getting
login data from Nile" debug line belongs inside the fetch closure (not on the memo-hit path), and
add a distinct debug line on the memo-hit path naming it as a shared in-flight fetch — a
developer reading the log must be able to tell a deduplicated call from a real spawn.

Export a test-only reset hook alongside the class (systeminfo's precedent — this project's Jest
config has no `resetModules`, so `inFlightLoginData` would leak between tests in one file).
Comment it as test-only.

Then create `src/backend/storeManagers/nile/__tests__/user.test.ts` (the directory does not
exist yet — create it). Mock `libraryManagerMap` from `..` so `runRunnerCommand` is a jest.fn
returning a deferred promise you resolve manually, which is what makes the concurrency assertion
possible. Also mock `backend/logger`, `./electronStores` and `backend/utils` to keep the module
graph inert. Call the reset hook in `beforeEach`. Note that `src/backend/jest.config.js` wires
`jest.setupContainment.ts` for every backend suite — do not fight it or add env overrides.
  </action>
  <verify>
    <automated>npx jest --selectProjects Backend --testPathPattern "storeManagers/nile/__tests__/user" 2>&1 | tail -20</automated>
  </verify>
  <done>All four behaviours above pass, including the sequential-call test proving no value cache exists, and `runRunnerCommand` call counts are asserted numerically (not just "was called").</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Replace the false "window has opened" copy during the Amazon pre-window wait with a live preparing surface</name>
  <files>src/frontend/screens/WebView/useTauriOAuthLogin.ts, src/frontend/screens/WebView/__tests__/useTauriOAuthLogin.test.tsx, src/frontend/screens/WebView/components/TauriLoginPanel.tsx, src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx</files>
  <behavior>
    - `runner === 'nile'`: the hook's observed state sequence starts `preparing` → `awaiting`,
      with `preparing` set BEFORE the `getAmazonLoginData()` promise is awaited and `awaiting`
      set only after it resolves and before `oauthCaptureLogin` is called.
    - `runner` in legendary/gog/zoom: the sequence starts at `awaiting` with no `preparing` state
      ever observed (URL comes from a constant, no spawn to wait on).
    - A `getAmazonLoginData()` rejection still lands `{ phase: 'error' }` and still logs the
      existing `phase=error (failed to resolve login url)` line — `preparing` is not terminal and
      must not swallow that path.
    - A teardown during `preparing` still logs `phase=cancelled-midflight at=login-url` and
      suppresses the state update, exactly as today.
    - `TauriLoginPanel` given `{ phase: 'preparing', runner: 'nile' }` renders the spinner
      element, a heading from `webview.login.oauth.preparing.heading`, and a body from
      `webview.login.oauth.preparing.body`; it renders neither the awaiting copy nor the
      declared-blocked default.
    - `TauriLoginPanel`'s existing awaiting/finalizing/cancelled/timeout/error/blocked/idle
      branches are unchanged — assert at least the awaiting and idle-default branches still
      render their current copy.
  </behavior>
  <action>
In `useTauriOAuthLogin.ts`:

1. Add `| { phase: 'preparing'; runner: OAuthRunner }` to `TauriOAuthLoginState`. Carry `runner`
   on the state (mirroring `finalizing`/`blocked`) so the panel does not depend on the separately
   passed prop.
2. Move the opening `safeSetState({ phase: 'awaiting' })` (line 181) so the phases are honest:
   the nile branch sets `{ phase: 'preparing', runner: activeRunner }` before
   `await window.api.getAmazonLoginData()`, and `awaiting` is set for ALL runners after the
   login URL is resolved and immediately before `oauthCaptureLogin`. The constant-URL runners
   therefore reach `awaiting` synchronously, exactly as they do today.
   `reachedTerminal` must stay untouched by `preparing` — it is transient, like `finalizing`.
3. Add a `window.api.logInfo` line on the preparing transition following the file's existing
   format: `[useTauriOAuthLogin] runner=… phase=preparing (fetching login url)`.
4. Extend the module docstring with a short paragraph naming this quick task, the measured
   ~12.8 s nile spawn, and the fact that `preparing` exists because `awaiting`'s copy actively
   lied for nile. Mirror how the 260803-eee `finalizing` paragraph is written.

In `TauriLoginPanel.tsx`: add a `preparing` branch placed BEFORE the existing `awaiting` branch.
Reuse the `WebView__unavailablePanel-spinner` div (with `role="progressbar"` and
`aria-hidden="true"`) exactly as the `finalizing` branch does — no new CSS. Copy via
`t('webview.login.oauth.preparing.heading', …)` / `t('webview.login.oauth.preparing.body', …)`
with inline English defaults; the heading should name the runner (`Preparing <Runner> sign-in…`)
using the same `state.runner`-preferred label derivation as the `finalizing` branch, and the body
should state honestly that the store's sign-in window is being prepared and will open shortly.
Do NOT claim a window has opened. Add the branch's `window.api.logInfo` line matching its
siblings. No hardcoded user-facing strings.

Extend both existing test suites rather than creating new files.
  </action>
  <verify>
    <automated>npx jest --selectProjects Frontend --testPathPattern "useTauriOAuthLogin|TauriLoginPanel" 2>&1 | tail -25</automated>
  </verify>
  <done>Both suites pass with the new preparing cases, the pre-existing cases in both files pass unmodified, and no bare user-facing string literal was added to the panel's JSX.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Live-verify the Amazon login wait and record the measured timing</name>
  <files>none — verification only</files>
  <action>Do not write code in this task. Drive the live Tauri build through the steps below and record the measured click-to-window-visible time; that number is the deliverable.</action>
  <what-built>
    One redundant ~12.8 s `nile auth --login --non-interactive` spawn removed from the Tauri
    Amazon login critical path, an in-flight guard so it cannot come back via a remount, and a
    spinner-backed "Preparing Amazon sign-in…" surface covering the wait that remains.
  </what-built>
  <how-to-verify>
    1. Launch the Tauri build. Confirm exactly ONE GameLib process is running before you start
       (`pgrep -fl GameLib`) — a second concurrent instance splits the `[shell]` log sink and a
       half-captured run will look successfully measured.
    2. Go to Manage Accounts and click Amazon. Start a stopwatch on the click.
    3. Observe the panel: it must show a spinner and "Preparing Amazon sign-in…" — NOT
       "A sign-in window has opened."
    4. Stop the stopwatch when the native Amazon sign-in window actually appears. Record the
       elapsed seconds. Expectation: roughly half the previous wait. One ~12.8 s nile spawn
       remains and is not removable in-repo (`pyinstaller-onefile-spawn-tax`).
    5. In `gamelib.log`, confirm `phase=preparing (fetching login url)` appears exactly once and
       is followed by `phase=awaiting`. Confirm you do NOT see two separate nile auth
       invocations for this one attempt.
    6. Close the sign-in window without signing in. Confirm you land back on Manage Accounts.
       Click Amazon again and confirm a real second spawn occurs (fresh login data, not a cached
       URL) and the flow still works.
    7. Complete a real Amazon sign-in through to the library to confirm nothing downstream broke.
    8. Sanity-check one non-Amazon runner (GOG): it must go straight to "Signing in to Gog" with
       NO preparing surface.
  </how-to-verify>
  <resume-signal>Type "approved" with the two measured timings (step 4, and step 8's confirmation), or describe what you saw instead</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Amazon sign-in webview → `oauthCaptureLogin` → `authAmazon` | The captured authorization code crosses from an untrusted remote page into a credential mint. Untouched by this plan. |
| renderer → `getAmazonLoginData` IPC → `nile auth` subprocess | Renderer-triggered subprocess spawn. This plan reduces the call count on this boundary; it adds no new caller. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-TEB-01 | Information disclosure | `NileUser.getLoginData()` memo | mitigate | In-flight promise only, NO value cache and no TTL — `code_verifier`/`serial` are never retained past the resolution of the single fetch that produced them. Task 2's sequential-call test is the enforcing assertion. |
| T-TEB-02 | Tampering | reused PKCE material across attempts | mitigate | Same as T-TEB-01: a retry after cancel provably re-spawns and mints fresh material, so a stale `code_verifier` can never be replayed into `authAmazon`. |
| T-TEB-03 | Information disclosure | new log lines | mitigate | The `preparing` and memo-hit log lines carry runner name and phase only — never `url`, `code_verifier`, `serial` or `client_id`. `authLogSanitizer` in `nile/user.ts` already redacts those four fields and is untouched. |
| T-TEB-04 | Denial of service | `isTauri()` guard in `index.tsx` | accept | Worst case of a wrong guard is the Electron path losing its login URL, which fails loudly and visibly at the `<webview>` `src`; Task 1's gate pins the guard's position and the Electron branch is otherwise unmodified. |
| T-TEB-SC | Tampering | npm/pip/cargo installs | mitigate | Not applicable — this plan installs no packages. No `package.json` change is in `files_modified`. |
</threat_model>

<verification>
Run the full affected surface before the checkpoint:

```
npx jest --selectProjects Frontend --testPathPattern "WebView" 2>&1 | tail -25
npx jest --selectProjects Backend --testPathPattern "nile|runnerAuthFlows" 2>&1 | tail -25
npx tsc --noEmit -p tsconfig.json 2>&1 | tail -20
```

The typecheck matters more than usual here: adding a member to the `TauriOAuthLoginState` union
will surface any exhaustive `switch`/branch elsewhere that does not yet handle `preparing`.
</verification>


<success_criteria>
- Under Tauri, one attempt at `/loginweb/nile` produces exactly one `nile auth` spawn (was two).
- The measured click-to-window-visible time is materially reduced, and the developer records the
  actual number at the checkpoint so the remaining floor is known rather than assumed.
- The pre-window wait shows an animated, accurate surface instead of a false static claim.
- Electron's `<webview>` Amazon login path is behaviourally unchanged.
- A retry after cancelling still mints fresh PKCE material.
- `npx tsc --noEmit` is clean and no pre-existing WebView/nile test regressed.
</success_criteria>

<output>
Create `.planning/quick/260806-teb-amazon-store-login-takes-too-long-need-t/260806-teb-SUMMARY.md` when done.

Record in it: the measured click-to-window timing from the checkpoint, so the residual
single-spawn floor is documented rather than re-diagnosed later.
</output>
