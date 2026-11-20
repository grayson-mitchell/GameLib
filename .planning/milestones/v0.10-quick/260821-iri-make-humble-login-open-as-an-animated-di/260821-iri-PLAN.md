---
phase: quick-260821-iri
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: false
requirements: [QUICK-260821-IRI-01]
files_modified:
  - src/frontend/screens/WebView/components/HumbleLoginSurface.tsx
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/screens/WebView/__tests__/HumbleLoginWatchErrorHandling.test.ts
  - src/frontend/screens/Login/components/HumbleLogin/index.tsx
  - src/frontend/screens/Login/components/HumbleLogin/index.scss
  - src/frontend/screens/Login/index.tsx
  - src/frontend/screens/Login/index.scss
  - src/frontend/screens/Login/__tests__/loginCrossfade.test.ts
  - src/frontend/screens/Login/__tests__/loginInFlightUiReachability.test.tsx

must_haves:
  truths:
    - "Clicking the Humble tile on /login opens a Dialog overlay; the route stays /login (no navigation)"
    - "The login tile list crossfades out behind the open Humble overlay with the same 500ms motion Steam already uses"
    - "Humble's login mechanics are byte-for-byte preserved: humbleStartLogin/humbleReconnect selection by humble.expired, the D-06 silent-cancel humbleStopLogin on unmount, the standard-Chrome UA under Electron, and the humbleLoginNavigated relay"
    - "On done / cancelled / close-button / backdrop the overlay closes and the user is back on the Login tile list, with no navigate('/login') involved"
    - "While the Humble overlay is open all six tiles are disabled and .loginContentWrapper is inert — the same loginInFlight guard Steam gets"
    - "The /loginweb/humble route still completes a Humble login, so HumbleExpiryToast and Humble/Keys keep working unchanged"
  artifacts:
    - path: "src/frontend/screens/WebView/components/HumbleLoginSurface.tsx"
      provides: "Shell-agnostic Humble login surface (watch + TauriLoginPanel under Tauri, embedded <webview> under Electron), driven by onDone/onCancelled callbacks"
      exports: ["default"]
    - path: "src/frontend/screens/Login/components/HumbleLogin/index.tsx"
      provides: "Dialog overlay wrapper hosting HumbleLoginSurface on the Login screen"
      exports: ["default"]
    - path: "src/frontend/screens/Login/components/HumbleLogin/index.scss"
      provides: "Overlay body sizing for both the Tauri panel and the Electron webview frame"
    - path: "src/frontend/screens/Login/index.tsx"
      provides: "Store-agnostic overlay lifecycle (mount / open / deferred-unmount) serving both Steam and Humble"
      contains: "openLoginOverlay"
  key_links:
    - from: "src/frontend/screens/Login/index.tsx"
      to: "HumbleLogin overlay"
      via: "Humble Runner tile primaryLoginAction"
      pattern: "primaryLoginAction=\\{\\(\\) => openLoginOverlay\\('humble'\\)\\}"
    - from: "src/frontend/screens/Login/components/HumbleLogin/index.tsx"
      to: "src/frontend/screens/WebView/components/HumbleLoginSurface.tsx"
      via: "import + render inside <Dialog>"
      pattern: "HumbleLoginSurface"
    - from: "src/frontend/screens/WebView/index.tsx"
      to: "src/frontend/screens/WebView/components/HumbleLoginSurface.tsx"
      via: "early return for runner === 'humble', keeping the /loginweb/humble route alive"
      pattern: "runner === 'humble'"
    - from: "src/frontend/screens/Login/index.scss"
      to: "src/frontend/screens/Login/index.tsx"
      via: "classNames('loginPage', { loginFlowOpen: loginInFlight })"
      pattern: "\\.loginPage\\.loginFlowOpen \\.loginContentWrapper"
---

<objective>
Make the Humble tile on the Login screen open an animated `Dialog` overlay — the same visual
treatment Steam got in Phase 36 — instead of hard-navigating to `/loginweb/humble`.

Purpose: Humble is the last tile that yanks the user off the Login screen with zero animation
while Steam sitting right above it opens a slide-up overlay behind a crossfading tile list. This
closes that inconsistency.

Output: a shell-agnostic `HumbleLoginSurface` extracted from `WebView/index.tsx`, a
`HumbleLogin` Dialog overlay on the Login screen, and a Login-screen overlay lifecycle that is
no longer Steam-specific.

**This is a presentation-layer change.** Not one line of Humble's login mechanics changes
meaning — the watch, its four terminal statuses, the silent-cancel-on-unmount, the
standard-Chrome UA, and the navigation relay all move verbatim and keep their comments.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

Read before writing any overlay CSS:
- `Skill("sketch-findings-gamelib")` — multi-theme survival rules. Every colour/spacing value in
  the new `.scss` MUST be a `var(--*)` token (mirror `SteamLogin/index.scss`, which uses
  `var(--space-md)`, `var(--danger)`, `var(--status-warning)`). Hardcoded colours are a
  re-litigated bug in this repo.

Source files you will modify or copy from:
@src/frontend/screens/Login/index.tsx
@src/frontend/screens/Login/index.scss
@src/frontend/screens/Login/components/SteamLogin/index.tsx
@src/frontend/screens/Login/components/SteamLogin/index.scss
@src/frontend/screens/WebView/index.tsx
@src/frontend/screens/WebView/components/TauriLoginPanel.tsx
@src/frontend/screens/Login/__tests__/loginCrossfade.test.ts
@src/frontend/screens/Login/__tests__/loginInFlightUiReachability.test.tsx
@src/frontend/screens/WebView/__tests__/HumbleLoginWatchErrorHandling.test.ts

<constraints_from_memory>
**A child-window / separate-BrowserWindow design is a DEAD END — do not consider it.**
This project's persistent memory records that *login child windows have ZERO Tauri command
access*. Humble's login surface must call `window.api.humbleStartLogin()`,
`humbleReconnect()`, `humbleStopLogin()` and `humbleLoginNavigated()`, so it has to stay
mounted inside a component tree that has IPC access. Staying co-mounted inside the `/login`
route's own tree — exactly what `SteamLogin` does — is the correct shape and sidesteps the
problem entirely. That is why this task is an overlay and not a window.

**`tauri dev` serves a stale bundle.** The human verification task below MUST be run against a
freshly-started `pnpm tauri:dev`, never `tauri dev`, and never against a pre-existing running
instance.
</constraints_from_memory>

<interfaces>
<!-- Contracts the executor needs. Do not go hunting for these. -->

Humble IPC (from `src/common/types/ipc.ts`):
```typescript
humbleStartLogin: () => Promise<{ status: 'done' | 'waiting' | 'error' | 'cancelled'; username?: string }>
humbleReconnect:  () => Promise<{ status: 'done' | 'waiting' | 'error' | 'cancelled'; username?: string }>
humbleStopLogin:  () => void
humbleLoginNavigated: () => void
humbleGetLoginUserAgent: () => Promise<string>
getWebviewPreloadPath: () => Promise<string>   // '' under Tauri, a real path under Electron
```

Humble context (from `GlobalState.tsx`, exposed via `ContextProvider`):
```typescript
humble.login: (result: { status: string; username?: string }) => Promise<void>  // = humbleLogin
humble.expired: boolean
```

Watch state shape (from `src/frontend/screens/WebView/useTauriOAuthLogin.ts`):
```typescript
export type TauriOAuthLoginState = { phase: 'idle' | 'awaiting' | 'preparing' | 'finalizing' | 'blocked' | 'cancelled' | 'timeout' | 'error'; runner?: string; channel?: string; message?: string }
```

Dialog primitive (from `frontend/components/UI/Dialog`):
```typescript
export const Dialog: React.FC<{ className?: string; children: ReactNode; showCloseButton: boolean; onClose: () => void }>
export const DialogHeader: React.FC<{ onClose?: () => void; children: ReactNode }>
// Dialog mounts with internal `open` initialised to true and uses
// TransitionComponent={SlideUpTransition} transitionDuration={500}.
// => The ONLY way to reopen it is a fresh mount (hence the mount-key pattern).
```
</interfaces>

<baseline>
Tree is clean at plan time. Baseline suite (must still be green, plus whatever this plan adds):

```
npx jest src/frontend/screens/Login src/frontend/screens/WebView
→ Test Suites: 12 passed, 12 total   Tests: 246 passed, 246 total
```
</baseline>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extract HumbleLoginSurface from WebView/index.tsx (behaviour-preserving)</name>
  <files>
    src/frontend/screens/WebView/components/HumbleLoginSurface.tsx (new),
    src/frontend/screens/WebView/index.tsx,
    src/frontend/screens/WebView/__tests__/HumbleLoginWatchErrorHandling.test.ts
  </files>
  <behavior>
    - The extracted component runs the watch exactly once per mount, choosing `humbleReconnect()` when `humble.expired` and `humbleStartLogin()` otherwise.
    - `status: 'done'` → `await humble.login(result)` then `onDone()`. `status: 'cancelled'` → logInfo then `onCancelled()`, and sets NO error state. `status: 'error'` → `setLoginState({ phase: 'error', message: t('webview.login.humble.error.window_unreachable', ...) })`. `status: 'waiting'` → `setLoginState({ phase: 'timeout' })`.
    - The cancelled arm is ordered BEFORE the error arm.
    - Unmount cleanup sets the mounted flag false and calls `window.api.humbleStopLogin()`.
    - A late resolution after unmount calls neither `onDone` nor `onCancelled`.
    - Render order: Tauri panel branch FIRST (when `webviewPreloadPath` is falsy), THEN the `!humbleLoginUserAgent` hold-render guard, THEN the `<webview>`.
    - `HumbleLoginWatchErrorHandling.test.ts` asserts all of the above against the NEW file path and stays green, including its four falsifiability sub-tests.
  </behavior>
  <action>
Create `src/frontend/screens/WebView/components/HumbleLoginSurface.tsx` exporting a default
component with props `{ onDone: () => void; onCancelled: () => void }`.

**Move — do not rewrite — these five regions out of `src/frontend/screens/WebView/index.tsx`.
Carry every explanatory comment across verbatim; they encode D-05/D-06/D-16/D-17, F-34.4.2-19
and quick task 260808-gl6 rationale that this repo relies on:**

1. Lines ~290–303: the `humbleLoginUserAgent` state and its `humbleGetLoginUserAgent()` effect
   (drop the `if (runner !== 'humble') return` guard — the whole component is now Humble-only).
2. Lines ~305–315: the `humbleLoginState` state, `useState<TauriOAuthLoginState>({ phase: 'idle' })`.
   Rename the local to `loginState`/`setLoginState` ONLY if you also update the test in step 6;
   preferring to keep the `humbleLoginState` name is simpler and keeps more assertions untouched.
3. Lines ~317–383: the whole `runHumbleLoginWatch` effect. Two substitutions and nothing else:
   `navigate('/login')` in the `'done'` arm becomes `onDone()`, and `navigate('/login')` in the
   `'cancelled'` arm becomes `onCancelled()`. The `mounted` flag, the `humbleStopLogin()`
   cleanup, the `eslint-disable-next-line react-hooks/exhaustive-deps` and the deps array all
   come across; the deps array becomes `[]` (there is no `runner` to key on any more) — keep the
   eslint-disable comment and amend its wording to say "once per mount of this surface".
4. Lines ~513–540: the `onHumbleLoginNavigate` handler and its four `did-navigate` /
   `did-navigate-in-page` add/remove listener pairs. This surface owns its own `webviewRef`, so
   it gets its own `useLayoutEffect` keyed on `[webviewRef.current]` holding only these two
   listeners. Drop the `if (runner === 'humble')` inner guard.
5. It also needs its own `webviewPreloadPath` state + `getWebviewPreloadPath()` effect (copy the
   shape from `WebView/index.tsx` lines ~490–498) because it is what distinguishes the two shells.

Render, in this exact order (the ordering is load-bearing — the Tauri panel must not be blocked
behind the UA guard, which is why `WebView/index.tsx` has it this way today):

  a. `if (!webviewPreloadPath) return <TauriLoginPanel runner="humble" state={humbleLoginState} />`
  b. `if (!humbleLoginUserAgent) return <></>`  (keep the existing "must not render until its
     standard-Chrome UA has been fetched — applying it late would defeat the SSO fix" comment)
  c. the `<webview>` element with `partition="persist:humble"`, `src="https://www.humblebundle.com/login"`,
     `preload={webviewPreloadPath}`, `useragent={humbleLoginUserAgent}`, `allowpopups`,
     `ref={webviewRef}`, `className="HumbleLoginSurface__webview"`. The `humbleLoginUrl` literal
     is at `WebView/index.tsx` line ~190.

Then in `src/frontend/screens/WebView/index.tsx`:
- Delete the five moved regions.
- Simplify what they left behind: line ~625 becomes `state={oauthLoginState}`; line ~652's
  `if (runner === 'humble' && !humbleLoginUserAgent)` guard is deleted entirely; the
  `partition` ternary at ~670 loses its `runner === 'humble' ? 'humble' :` arm; `useragent` at
  ~680 becomes `undefined` (or drop the prop). The `runner !== 'humble'` guard inside the
  `loadstop` user-agent block (~line 560) also becomes unconditional.
- Add ONE early return, placed AFTER every hook in the component and immediately BEFORE
  `if (!webviewPreloadPath)` (rules of hooks — this must not sit above any `useState`/`useEffect`):

      if (runner === 'humble') {
        return (
          <HumbleLoginSurface
            onDone={() => navigate('/login')}
            onCancelled={() => navigate('/login')}
          />
        )
      }

  This keeps `/loginweb/humble` a fully working route, which is REQUIRED —
  `HumbleExpiryToast/index.tsx:52` and `Humble/Keys/index.tsx:103` both still navigate there and
  are explicitly out of scope for this task.

6. Retarget `src/frontend/screens/WebView/__tests__/HumbleLoginWatchErrorHandling.test.ts`:
   point its `indexPath` at the new `components/HumbleLoginSurface.tsx`, and change its
   `'the humble watch state is threaded into TauriLoginPanel only for runner === "humble"'`
   assertion (line ~103) from the old
   `state={runner === 'humble' ? humbleLoginState : oauthLoginState}` ternary to the new
   unconditional `<TauriLoginPanel runner="humble" state={humbleLoginState} />` shape. Update the
   file's header comment to name the new source file — a gate whose stated premise has moved
   guards nothing (documented lesson in this repo). Change no other assertion: the four
   falsifiability sub-tests at the bottom must still pass unmodified.

DO NOT touch `WebviewUnavailablePanel.test.tsx`'s three-arms gate — the `if (!webviewPreloadPath)`
block keeps its three arms and stays green. If it goes red you have put the early return in the
wrong place.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/WebView --silent && npx tsc --noEmit</automated>
  </verify>
  <done>`HumbleLoginSurface.tsx` exists and owns the entire Humble login flow; `WebView/index.tsx` contains no Humble-specific state, effect or ternary beyond the single early return; `grep -c "humbleLoginState" src/frontend/screens/WebView/index.tsx` returns 0; all WebView suites green; `tsc --noEmit` clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add the HumbleLogin Dialog overlay component</name>
  <files>
    src/frontend/screens/Login/components/HumbleLogin/index.tsx (new),
    src/frontend/screens/Login/components/HumbleLogin/index.scss (new)
  </files>
  <behavior>
    - The component renders a `<Dialog showCloseButton onClose={dismiss}>` whose body hosts `<HumbleLoginSurface>`.
    - `onDone` and `onCancelled` both call the `dismiss` prop — never `navigate`.
    - The close button and the backdrop both route through the same `dismiss`.
    - The component imports no router hook at all (`useNavigate` must be absent).
  </behavior>
  <action>
Create `src/frontend/screens/Login/components/HumbleLogin/index.tsx`. Mirror
`SteamLogin/index.tsx`'s final `return` block exactly — that is the shape this overlay is
matching:

```
Props: { dismiss: () => void }

<Dialog showCloseButton={true} onClose={dismiss} className="humbleLoginDialog">
  <DialogHeader onClose={dismiss}>{t('login.humble_dialog_title', 'Sign in to Humble Bundle')}</DialogHeader>
  <div className="humbleLoginBody">
    <HumbleLoginSurface onDone={dismiss} onCancelled={dismiss} />
  </div>
</Dialog>
```

Use `useTranslation()` for the header string. Do NOT use `{{count}}` anywhere (reserved by
i18next in this project) and do NOT rely on a `t()` default argument to rename an existing key —
this is a NEW key, so the default is live.

Create `src/frontend/screens/Login/components/HumbleLogin/index.scss` and import it from the
component (`import './index.scss'`), mirroring `SteamLogin/index.scss`:

- `.humbleLoginBody` — `display: flex; flex-direction: column; gap: var(--space-md); margin-inline: auto;`.
  Do NOT set a fixed width on `.humbleLoginBody` itself: the two shells need very different
  widths and MuiDialog's Paper shrink-wraps to content.
- `.HumbleLoginSurface__webview` — the Electron `<webview>` needs an explicit box or it collapses
  to zero height inside the Dialog: `display: flex; width: min(900px, 80vw); height: min(700px, 70vh); border: 0;`.
  Under Tauri this class never renders, so the Tauri panel keeps its natural auto size.
- Every value must be a theme token (`var(--space-*)`) or a viewport-relative unit. Zero hardcoded
  colours — check `Skill("sketch-findings-gamelib")` first.
- Do NOT add a `prefers-reduced-motion` query and do NOT reach for `startViewTransition`. Both are
  explicitly rejected in this codebase (`loginCrossfade.test.ts` has a standing ABSENCE gate over
  `Login/index.tsx` and `Login/index.scss`); the app-wide `disableAnimations` toggle in `App.css`
  is the single motion-reduction mechanism and this overlay must defer to it.
- Beware `Dropdown/index.scss` — it styles its panel's CONTENTS and has out-specified new row
  primitives three times in this repo. If anything inside the overlay renders wrong, out-specify
  by class count, do not reach for `!important`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx sass --no-source-map src/frontend/screens/Login/components/HumbleLogin/index.scss /dev/null && npx eslint src/frontend/screens/Login/components/HumbleLogin/index.tsx</automated>
  </verify>
  <done>`HumbleLogin/index.tsx` and `index.scss` exist; the component renders `Dialog` + `DialogHeader` + `HumbleLoginSurface`; `grep -c "useNavigate" src/frontend/screens/Login/components/HumbleLogin/index.tsx` returns 0; scss compiles; tsc and eslint clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Generalise the Login-screen overlay lifecycle and wire the Humble tile</name>
  <files>
    src/frontend/screens/Login/index.tsx,
    src/frontend/screens/Login/index.scss,
    src/frontend/screens/Login/__tests__/loginCrossfade.test.ts,
    src/frontend/screens/Login/__tests__/loginInFlightUiReachability.test.tsx
  </files>
  <behavior>
    - `loginCrossfade.test.ts`'s three-way duration agreement now extracts `LOGIN_DIALOG_EXIT_MS` from `Login/index.tsx`, `transitionDuration={N}` from `Dialog.tsx`, and the `transform Nms` literal from `Login/index.scss`, and asserts all three agree.
    - `loginCrossfade.test.ts`'s crossfade rule assertion now targets `.loginPage.loginFlowOpen .loginContentWrapper` and still checks `transform`, `opacity` and `pointer-events` BY NAME.
    - A NEW PRESENCE assertion proves the Humble tile carries `primaryLoginAction` and that `Login/index.tsx` contains zero `navigate(humbleLoginPath)` — i.e. the tile no longer routes.
    - `loginInFlightUiReachability.test.tsx`'s six existing assertions stay green with zero assertion edits (only its stale doc comment changes).
    - The FILLED-SPECIMEN guard still matches a raw literal that actually exists in `index.scss`.
  </behavior>
  <action>
**Step 1 — generalise the state in `src/frontend/screens/Login/index.tsx`.**

Replace the three Steam-specific state slots with one store-agnostic set. Keep the existing
explanatory comments, updated to say "the login overlay" instead of "the Steam overlay":

```
type LoginOverlay = 'steam' | 'humble'

const [mountedOverlay, setMountedOverlay] = useState<LoginOverlay | null>(null)
const [openOverlay, setOpenOverlay]       = useState<LoginOverlay | null>(null)
const [overlayMountKey, setOverlayMountKey] = useState(0)
const overlayUnmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
const loginInFlight = openOverlay !== null
```

Rename `STEAM_DIALOG_EXIT_MS` → `LOGIN_DIALOG_EXIT_MS` (value unchanged, 500) and update its
comment to name `Dialog.tsx`'s `transitionDuration={500}` and both overlays.

`openSteamOverlay()`/`dismissSteamOverlay()` become `openLoginOverlay(which: LoginOverlay)` /
`dismissLoginOverlay()`. The internals are unchanged in meaning:
- `openLoginOverlay` clears any pending unmount timer, bumps `overlayMountKey`, sets
  `mountedOverlay` and `openOverlay` to `which`. The mount-key bump is what forces a fresh
  `<Dialog>` mount on reopen — `Dialog` initialises its internal `open` to `true`, so a remount
  is the only way to reopen it, and for Humble it is additionally what restarts the login watch.
- `dismissLoginOverlay` clears `openOverlay` SYNCHRONOUSLY (T-34.4.2-41: the semantic flag must
  never clear on the teardown timer, or the guard latches forever), then defers
  `setMountedOverlay(null)` by `LOGIN_DIALOG_EXIT_MS`.

**Ordering constraint — do not break a live gate:** `const loginInFlight = ...` MUST stay ABOVE
`let oldMac = false`. `loginInFlightUiReachability.test.tsx` asserts that the source region
between `let oldMac = false` and the first `useEffect(` matches nothing like
`/loginInFlight|pending|inFlight|isLoggingIn|loginInProgress/i`.

Render:
```
<div className={classNames('loginPage', { loginFlowOpen: loginInFlight })}>
...
{mountedOverlay === 'steam' && (
  <SteamLogin key={overlayMountKey} dismiss={dismissLoginOverlay} />
)}
{mountedOverlay === 'humble' && (
  <HumbleLogin key={overlayMountKey} dismiss={dismissLoginOverlay} />
)}
```

Steam tile: `primaryLoginAction={() => openLoginOverlay('steam')}`.
Humble tile: ADD `primaryLoginAction={() => openLoginOverlay('humble')}`.

Leave `loginUrl={humbleLoginPath}` on the Humble tile and leave the `humbleLoginPath` export
alone. `Runner.handleLogin()` returns before its `navigate(props.loginUrl)` fallback once
`primaryLoginAction` is present, so the prop is inert for the tile — and the export is still
imported by `HumbleExpiryToast` and `Humble/Keys`, which are out of scope.

**Leave untouched, verbatim:** all six `disabled={oldMac || loginInFlight}` expressions (a gate
asserts there are exactly 6 and all are that exact string), the
`inert={loginInFlight ? '' : undefined}` literal, the single `<div className="runnerGroup">`,
and every `class="..."` tile marker. Introduce no `tabIndex` and no `aria-hidden` — both are
explicitly rejected designs with standing ABSENCE gates.

**Step 2 — `src/frontend/screens/Login/index.scss`.**

Rename the selector `.loginPage.steamFlowOpen .loginContentWrapper` →
`.loginPage.loginFlowOpen .loginContentWrapper`. Change NOTHING else in that rule — it keeps
`transform: translateY(-100%)`, `opacity: 0`, `pointer-events: none`. Update the comment above it
to say "the login overlay" rather than "the Steam overlay", and update the
`.loginContentWrapper` transition comment's reference from `STEAM_DIALOG_EXIT_MS` to
`LOGIN_DIALOG_EXIT_MS`.

Do NOT touch `.loginBackground` — `position: absolute` + `inset: 0` there is an F-10 regression
guard with its own assertion, and F-10 was a live-gate-caught defect that rendered the login
screen ~11000px below the viewport.

**Step 3 — update the two source gates IN THE SAME COMMIT as steps 1–2**, so the suite never goes
red between tasks.

In `loginCrossfade.test.ts`:
- FILLED-SPECIMEN guard: `expect(raw).toMatch(/steamFlowOpen/)` → `/loginFlowOpen/`.
- Crossfade rule regex: `steamFlowOpen` → `loginFlowOpen`.
- Three-way agreement regex: `/STEAM_DIALOG_EXIT_MS = (\d+)/` → `/LOGIN_DIALOG_EXIT_MS = (\d+)/`.
- Update the file's header comment: it currently claims the crossfade is Steam-specific. It now
  serves both overlays.
- ADD one new PRESENCE test, in this file's existing style:

      it('SOURCE GATE (PRESENCE + ABSENCE) -- the Humble tile opens the co-mounted overlay and never routes', ...)
        const source = read(LOGIN_TSX)
        expect(source).toMatch(/primaryLoginAction=\{\(\) => openLoginOverlay\('humble'\)\}/)
        expect(source).toMatch(/primaryLoginAction=\{\(\) => openLoginOverlay\('steam'\)\}/)
        expect((source.match(/navigate\(humbleLoginPath\)/g) ?? []).length).toBe(0)
        expect(source).toMatch(/mountedOverlay === 'humble'/)

In `loginInFlightUiReachability.test.tsx`: change NO assertion. Update only the header comment,
which currently states "Amazon/GOG/Zoom/Humble (no `primaryLoginAction`) still navigate away" —
that is now false for Humble. State honestly that Steam AND Humble both use `primaryLoginAction`
and are covered by the explicit `loginInFlight` guard, while Amazon/GOG/Zoom still navigate. If
any assertion in this file actually goes red, you have changed something you were told not to —
fix the source, not the test.

**Falsifiability (required by this repo's convention for every source gate).** For each
assertion you added or edited, temporarily mutate the file it guards, confirm the assertion goes
RED, then revert. Verify restoration with a SHA-256 checksum taken before the mutation and
compared after the revert — NOT `git diff --quiet`, which has a documented false-negative trap
here. Record the mutation text and the observed failure line in the SUMMARY.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/Login src/frontend/screens/WebView --silent && npx tsc --noEmit && npx eslint src/frontend/screens/Login</automated>
  </verify>
  <done>Baseline 12 suites still pass with the added assertions; `grep -c steamFlowOpen src/frontend/screens/Login/index.tsx src/frontend/screens/Login/index.scss` returns 0 for both; `grep -v '^\s*//' src/frontend/screens/Login/index.tsx | grep -c "primaryLoginAction={() => openLoginOverlay('humble')}"` returns 1; tsc and eslint clean; falsifiability evidence recorded.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Human visual gate — the Humble overlay actually animates</name>
  <files>none (verification only — no file is modified by this task)</files>
  <action>Pause execution and present the verification script below to the developer. Do not proceed, do not write the SUMMARY, and do not mark the task complete until the developer returns the nine per-item scores. If any item scores FAIL, stop and report it rather than attempting a fix inside this task.</action>
  <what-built>
    The Humble tile on Manage Accounts now opens a slide-up `Dialog` overlay hosting Humble's
    existing sign-in flow, with the tile list crossfading out behind it, instead of hard-routing
    to `/loginweb/humble`.
  </what-built>
  <how-to-verify>
    **This gate cannot be automated.** The frontend jest project is `testEnvironment: 'node'`
    with no jsdom and no component-mounting harness — every test in Task 3 is a source-text
    gate. A green suite has never once caught one of this UI's live defects in this repo. This
    task is the only thing that observes actual motion.

    PRECONDITION (mandatory, this repo's `tauri-dev-serves-stale-static-bundle` lesson):
    0. Run `pgrep -fl "tauri|GameLib"`. If a GameLib instance is ALREADY running, kill it and
       relaunch — do NOT score against a pre-existing instance. Start with
       `pnpm tauri:dev` (NOT `tauri dev`, which serves a stale static bundle). Record the PID and
       start time. If you cannot get a fresh build up, ABORT the gate rather than scoring it.

    Then, in the running app:
    1. Navigate to Manage Accounts (`/login`). Confirm all six tiles render.
    2. Click the **Humble Bundle Login** tile.
       - EXPECT: the tile list slides up and fades out over ~0.5s while a dialog slides UP from
         the bottom. EXPECT: the URL hash stays on `#/login` — it must NOT become
         `#/loginweb/humble`. Check the address/hash in DevTools' Elements or via the window
         title, NOT by pasting into the DevTools console (paste into that console is unusable
         here — documented).
       - EXPECT: the dialog header reads "Sign in to Humble Bundle" and the body shows the
         in-progress copy "A sign-in window has opened…", and a native Humble sign-in window
         opens.
    3. Compare side by side: click the **Steam** tile and confirm the two overlays use visibly
       the same motion (same slide direction, same duration, same background crossfade).
    4. With the Humble overlay open, try clicking any other tile (Steam, GOG, Amazon).
       - EXPECT: nothing happens. All six tiles are disabled while a login is in flight.
    5. Close the Humble overlay with the header × button.
       - EXPECT: the dialog slides down and the tile list fades back in; still on `#/login`;
         all tiles become clickable again.
    6. Reopen the Humble tile immediately (within ~1s of closing).
       - EXPECT: it opens cleanly at the in-progress state, not a stale/blank dialog. This is
         what the mount-key bump exists for.
    7. Complete a real Humble sign-in through the opened window.
       - EXPECT: the overlay closes on success and the Humble tile flips to "Connected" —
         WITHOUT any route change.
    8. Regression check on the untouched route: trigger the Humble session-expiry reconnect path
       (or navigate to `#/loginweb/humble` directly) and confirm that surface still renders and
       still completes a login. This route is still used by `HumbleExpiryToast` and
       `Humble/Keys` and must not have been broken by the extraction.
    9. Switch themes (`midnightMirage` → `gruvbox_dark` → `dracula`) with the Humble overlay open.
       - EXPECT: text stays legible against the dialog surface in all three. Hardcoded colours
         would show up here.

    Score each of items 1–9 explicitly PASS / FAIL / BLOCKED. Do not summarise a partial run as
    a pass.
  </how-to-verify>
  <resume-signal>Type "approved" with the 9 per-item scores, or describe which item failed and how.</resume-signal>
  <verify>
    <automated>MISSING BY DESIGN — the frontend jest project is testEnvironment: 'node' with no jsdom and no component-mounting harness, so no automated check in this repo can observe rendered motion, computed style, or a real click. Every Task 3 assertion is a source-text gate and is explicitly NOT a discharge of this item. The precondition check `pgrep -fl "tauri|GameLib"` (must show no pre-existing instance before launch) is the only scriptable part.</automated>
    <human-check>All nine items scored explicitly PASS / FAIL / BLOCKED against a freshly-launched `pnpm tauri:dev`.</human-check>
  </verify>
  <done>The developer has returned nine explicit per-item scores and every item is PASS. A partial run, an unscored item, or a run against a pre-existing app instance does NOT satisfy this task.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Humble sign-in window → main process cookie watch | Untrusted web content; unchanged by this task, the watch is moved verbatim |
| Login screen render tree → `window.api.humble*` IPC | The overlay stays inside the `/login` tree precisely so it retains IPC access |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-IRI-01 | Spoofing | Login screen — a second sign-in surface opened while one is in flight | mitigate | The Humble overlay joins the existing `loginInFlight` guard: `openOverlay !== null` disables all six tiles and marks `.loginContentWrapper` inert. Same three-layer guard Steam already carries (T-34.4.2-39). |
| T-IRI-02 | Denial of Service | `loginInFlight` latch never clearing | mitigate | `dismissLoginOverlay` clears `openOverlay` SYNCHRONOUSLY on the dismiss action, never on the 500ms teardown timer. Explicit instruction in Task 3 (T-34.4.2-41 precedent). |
| T-IRI-03 | Information disclosure | Humble session cookie watch left running after the user backs out | mitigate | The D-06 silent-cancel `window.api.humbleStopLogin()` moves with the effect's cleanup into `HumbleLoginSurface` and fires on real unmount. NOTE: the deferred-unmount defers it by up to 500ms versus the old immediate route unmount — an accepted, bounded delay, not a leak. |
| T-IRI-04 | Tampering | Embedded `<webview>` under Electron | accept | Partition, preload path, `allowpopups` and the standard-Chrome UA are moved verbatim; this task changes none of them. No new attack surface. |
| T-IRI-SC | Tampering | npm/pip/cargo installs | n/a | This plan installs ZERO packages. Every component reused (`Dialog`, `DialogHeader`, `TauriLoginPanel`, `classNames`) is already in the tree. If any task appears to need a new dependency, STOP and escalate — a package-legitimacy human checkpoint would be required. |
</threat_model>

<verification>
Full-suite regression, from the repo root:

```bash
npx jest src/frontend/screens/Login src/frontend/screens/WebView   # baseline was 12 suites / 246 tests, expect ≥ that
npx tsc --noEmit                                                   # note: tsc-only; it CANNOT see lint errors CI will catch
npx eslint --cache src/frontend/screens/Login src/frontend/screens/WebView
```

Then run the full suite once before closing: `npx jest --silent`.

Structural checks (comment-stripped, so header prose cannot self-satisfy a grep):

```bash
# The Humble tile no longer routes
grep -v '^\s*//' src/frontend/screens/Login/index.tsx | grep -c "openLoginOverlay('humble')"   # == 1
# Steam-specific naming is gone from the generalised lifecycle
grep -c "steamFlowOpen\|STEAM_DIALOG_EXIT_MS" src/frontend/screens/Login/index.tsx src/frontend/screens/Login/index.scss   # == 0 both
# WebView no longer owns Humble state
grep -c "humbleLoginState\|humbleGetLoginUserAgent" src/frontend/screens/WebView/index.tsx     # == 0
# The route survives for HumbleExpiryToast / Humble/Keys
grep -c "HumbleLoginSurface" src/frontend/screens/WebView/index.tsx                            # >= 1
```
</verification>

<success_criteria>
- Clicking the Humble tile on `/login` opens a slide-up `Dialog` overlay; the route hash stays `#/login`.
- The tile list crossfades out behind it with the same 500ms motion as Steam's overlay.
- Done / cancelled / close-button / backdrop all close the overlay and restore the tile list, with no `navigate('/login')` in the path.
- All six tiles are disabled and `.loginContentWrapper` is inert while the Humble overlay is open.
- Humble's watch mechanics — reconnect-vs-start selection, the four terminal statuses in their existing order, the silent cancel on unmount, the standard-Chrome UA, the `humbleLoginNavigated` relay — are unchanged in meaning.
- `/loginweb/humble` still completes a login for `HumbleExpiryToast` and `Humble/Keys`.
- Epic, GOG, Amazon and Zoom login flows are untouched (`git diff --stat` shows no other login files).
- Task 4's human gate is scored item-by-item and PASSES.
</success_criteria>

<output>
Create `.planning/quick/260821-iri-make-humble-login-open-as-an-animated-di/260821-iri-SUMMARY.md` when done.

The SUMMARY must record the Task 3 falsifiability evidence (mutation text + observed failure per
edited/added assertion, plus the SHA-256 restoration proof) and the nine per-item scores from
Task 4's human gate. Do not write the SUMMARY before Task 4 is discharged.
</output>
