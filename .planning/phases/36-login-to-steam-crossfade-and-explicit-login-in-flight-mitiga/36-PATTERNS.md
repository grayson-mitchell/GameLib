# Phase 36: Login-to-Steam Crossfade and Explicit Login-In-Flight Mitigation - Pattern Map

**Mapped:** 2026-08-20
**Files analyzed:** 6 (2 rewritten components, 1 route removal, 1 rewritten test, 2 new-or-extended stylesheets)
**Analogs found:** 5 / 6 have a strong or partial analog; 1 dimension (JS-driven exit-then-unmount choreography) has NO analog anywhere in the codebase — flagged below, not papered over.

This phase has no CONTEXT.md/RESEARCH.md yet (plan-phase orchestrator runs this mapper between
research and planning) — file list below is derived directly from the ROADMAP.md Phase 36 section
and its verified anchors.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/frontend/screens/Login/index.tsx` (add overlay state + login-in-flight state) | component (screen) | event-driven (local UI state) | Same file's own existing `showSidLogin` overlay (lines 50, 124-130) | exact — this file already does the "conditionally render a dismissible surface without navigating" thing once, for SIDLogin |
| `src/frontend/screens/Login/components/SteamLogin/index.tsx` (stop navigating away; become dismissible overlay content) | component | event-driven | `src/frontend/screens/Login/components/SIDLogin/index.tsx` (backdrop-driven local overlay, no route) | role-match — SIDLogin is the one login sub-flow in this codebase that is ALREADY an overlay, not a route |
| `src/frontend/screens/Login/index.scss` (exit animation for `.loginContentWrapper`, in-flight dimming for other tiles) | style (screen-level animation) | transform/CSS | `src/frontend/screens/ConsoleMode/index.scss` lines 1-38 (`consoleEnter` keyframes + `&.launching` dim/`pointer-events:none` pattern) | role-match — closest (only) screen-level custom keyframe animation + state-driven sibling-dimming pattern in the frontend |
| `src/frontend/App.tsx` (remove `loginweb/steam` sibling route, line 236-239) | route config | request-response → n/a | Same file, the `loginweb/:runner` sibling entries this route currently sits beside | exact — deletion, not a new pattern; no analog needed |
| `src/frontend/screens/Login/__tests__/loginInFlightUiReachability.test.tsx` (full rewrite) | test (source-gate) | n/a | `src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts` and `src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginWindowChrome.test.ts` | exact — same repo, same convention family (`testEnvironment: 'node'`, `stripSourceComments`, PRESENCE/ABSENCE-labelled, mutation-proven) |
| Login-in-flight `disabled`/`pointer-events`/`inert` wiring on the five other Runner tiles | component behavior | event-driven | `src/frontend/screens/ConsoleMode/index.tsx` lines 81, 242, 401-467 (`launchingGame` state disabling 4+ sibling buttons at once) | role-match — closest existing "one action's pending state blocks sibling controls" wiring in the frontend |

## Pattern Assignments

### `src/frontend/screens/Login/index.tsx` — add Steam overlay state + login-in-flight state

**Analog:** same file, existing `showSidLogin` mechanism (already present, no need to invent a new shape)

**State + conditional-render pattern** (lines 50, 122-130):
```tsx
const [showSidLogin, setShowSidLogin] = useState(false)
...
return (
  <div className="loginPage">
    {showSidLogin && (
      <SIDLogin
        backdropClick={() => {
          setShowSidLogin(false)
        }}
      />
    )}
    <div className="loginBackground"></div>
    <div className="loginContentWrapper">
      ...
```
Copy this exact shape for Steam: a `showSteamLogin` (or similarly named) boolean state, a conditionally-rendered `<SteamLogin dismiss={...} />` sibling of `.loginBackground`/`.loginContentWrapper` inside `.loginPage`, dismissed by a callback prop rather than `navigate()`. `.loginBackground` (line 131) needs no changes — it is already a sibling, independent of both the content wrapper and the conditional overlay, which is exactly the "remains painted" requirement in the ROADMAP anchor.

**Steam tile wiring today** (lines 203-211) — this is what routes into the overlay instead of `loginUrl`:
```tsx
<Runner
  class="steam"
  buttonText={t('login.steam', 'Steam Login')}
  icon={() => <SteamLogo />}
  loginUrl={steamLoginPath}
  isLoggedIn={isSteamLoggedIn}
  logoutAction={steam?.logout ?? (() => Promise.resolve())}
  disabled={oldMac}
/>
```
`Runner` already has a `primaryLoginAction?: () => any` escape hatch (see `Runner/index.tsx` pattern below) used today by Epic-under-Tauri to bypass `navigate(loginUrl)` — the same mechanism (`primaryLoginAction={() => setShowSteamLogin(true)}`) is the direct analog for making Steam's tile open the overlay instead of navigating, with zero changes to `Runner` itself required.

**Login-in-flight state — NO existing analog inside `Login/index.tsx` itself.** Per the ROADMAP anchor and `loginInFlightUiReachability.test.tsx`'s own documentation (read in full below), every one of the six tiles currently receives `disabled={oldMac}` and nothing else. The closest analog for the SHAPE of "one pending state disables several sibling controls" lives in a different screen entirely — see `ConsoleMode/index.tsx` below. The planner should compose: `disabled={oldMac || steamLoginInFlight}` (or a more general `loginInFlight` naming that also implies future-proofing for other stores) on the five non-Steam tiles, mirroring the `disabled={oldMac}` uniformity the current test pins.

---

### `src/frontend/screens/Login/components/SteamLogin/index.tsx` — stop navigating, become overlay content

**Analog:** `src/frontend/screens/Login/components/SIDLogin/index.tsx`

**Dismissal-by-callback pattern** (SIDLogin, lines 13-17, 63-85):
```tsx
interface Props {
  backdropClick: () => void
}

export default function SIDLogin({ backdropClick }: Props) {
  ...
  const handleLogin = async (sid: string) => {
    ...
    await epic.login(sid).then(async (res) => {
      if (res === 'done') {
        await window.api.getUserInfo()
        setStatus({ loading: false, error: false })
        backdropClick()   // <-- dismiss via callback, not navigate()
      }
```
```tsx
return (
  <div className="SIDLoginModal">
    <span className="backdrop" onClick={backdropClick}></span>
    <div className="sid-modal">
```
SteamLogin's five `navigate('/login')` call sites (lines 29, 96, 142, 228, 255 — see "Entry/exit paths" below) are the exact places this pattern replaces: swap each for a `dismiss()` prop call (or keep `closeWindow` as the name, just repoint its body). SteamLogin keeps its own internal `step` state machine (`checking` / `not-installed` / `tab` / `qr-active` / `qr-confirmed` / `credentials-1` / `credentials-2`) and its single `<Dialog>` mount (already single-mounted per `steamLoginWindowChrome.test.ts` assertion — see below) — only the dismissal mechanism changes, not the state machine.

**What does NOT change:** SteamLogin's `<Dialog showCloseButton={true} onClose={closeWindow} className="steamLoginDialog">` shell (line 610) and its single `renderWindowBody()` funnel (lines 523-607) are already correct for "one continuous mount, no remount as `step` changes" — `steamLoginWindowChrome.test.ts` already pins this shape and does not need re-deriving, only `closeWindow`'s body and the caller (no longer a route) change.

---

### `src/frontend/screens/Login/index.scss` — exit animation for `.loginContentWrapper` + in-flight dimming

**Analog:** `src/frontend/screens/ConsoleMode/index.scss` lines 1-38

**Screen-level enter keyframe pattern** (lines 1-19, 41-47):
```scss
.ConsoleMode {
  ...
  animation: consoleEnter 380ms cubic-bezier(0.2, 0.8, 0.2, 1);
  ...
}

@keyframes consoleEnter {
  0% {
    opacity: 0;
    transform: scale(0.985);
    filter: blur(6px);
  }
  100% {
    opacity: 1;
    transform: scale(1);
    filter: blur(0);
  }
}
```

**State-driven sibling-dimming + `pointer-events: none` pattern** (lines 21-38):
```scss
> .consoleTopBar,
> .consoleTitleBar,
> .consoleStage,
> .consoleFooter {
  transition: opacity 220ms ease;
}

&.launching {
  > .consoleTopBar,
  > .consoleTitleBar,
  > .consoleStage,
  > .consoleFooter {
    opacity: 0.2;
    pointer-events: none;
  }
}
```
This is the closest available analog for BOTH halves of this phase's CSS work: (1) an actual `@keyframes` screen-level animation exists exactly once in this codebase, here, and (2) a boolean state (`launching`) toggling a class that simultaneously dims and `pointer-events: none`s several sibling containers at once is the exact shape needed for "the other tiles are disabled, `pointer-events: none`, and `inert` while the Steam flow is open." Copy the class-toggle + `pointer-events: none` half directly; the `inert` HTML attribute (see below) has no CSS role and must be set in the JSX, not the stylesheet.

**No analog for a slide-UP-AND-OUT exit animation specifically.** `consoleEnter` only animates entry (scale/opacity/blur from 0%→100%, no reverse phase, no unmount-timing coordination). Nothing in this codebase currently plays an exit animation before removing an element from the DOM — see "No Analog Found" below.

---

### `src/frontend/screens/Login/components/Runner/index.tsx` — disabled/pointer-events wiring shape (for the OTHER five tiles)

**Analog:** `src/frontend/screens/ConsoleMode/index.tsx` (state) + `Runner/index.css` (existing `.disabled` CSS, already present, unchanged)

**Existing `.disabled` CSS in Runner itself** (`Runner/index.css` lines 19-21):
```css
.runnerWrapper.disabled,
.runnerWrapper.disabled * {
  cursor: not-allowed;
}
```
This already exists and Runner already receives `disabled={oldMac}` today (`Login/index.tsx` lines 172/181/190/200/210/223) which flows into `runnerWrapper`'s className (`Runner/index.tsx` line 92-96) and into `handleLogin()`'s own early-return guard (`Runner/index.tsx` lines 58-61):
```tsx
function handleLogin() {
  if (props.disabled) {
    return
  }
  ...
```
So `disabled` already double-guards (CSS `cursor` + JS early-return) — extending the boolean fed into it (`oldMac || steamLoginInFlight`) is a same-shape change, not a new pattern. `pointer-events: none` is NOT currently part of `.disabled` in `Runner/index.css` — that half must be added, and the closest source for exactly that combination (opacity/dim + `pointer-events: none`, driven by a sibling boolean state) is `ConsoleMode/index.scss`'s `&.launching` block above, not `Runner/index.css` itself.

**Sibling-controls-disabled-by-one-action's-pending-state pattern** (`ConsoleMode/index.tsx` lines 81, 242, 401-404, 445-467):
```tsx
const [launchingGame, setLaunchingGame] = useState<GameInfo | null>(null)
...
<div className={classNames('ConsoleMode', { launching: !!launchingGame })}>
...
<button
  className={classNames('consoleChip', { active: activeStore === f.key })}
  onClick={() => setActiveStore(f.key)}
  disabled={!!launchingGame}
>
  {f.label}
</button>
...
<button className="consoleQuitButton" onClick={quit} disabled={!!launchingGame}>
  {t('console.quit', 'Quit Console')}
</button>
```
One state variable, set by one action, threaded as `disabled` into N unrelated sibling controls simultaneously, PLUS a class on a shared ancestor that CSS keys off of for the dim/`pointer-events` treatment. This is the direct analog for "the other tiles `disabled`, `pointer-events: none`... while the Steam flow is open" — the state lives in `Login/index.tsx` (parent), and both the boolean prop AND a class on `.loginContentWrapper` (or `.runnerGroup`) would need to be threaded down, matching this two-pronged shape (JS `disabled=` + CSS class on an ancestor).

**No analog anywhere for the `inert` HTML attribute as a real DOM attribute.** A grep across `src/frontend/**/*.tsx` finds `inert` only inside prose comments (e.g. `MainButton.tsx:100`, `Library/index.tsx:580` — both talking about a default being "inert at runtime" in an unrelated sense, not the attribute). No component in this codebase currently sets the literal `inert` or `inert={true}` JSX attribute. This is a genuinely new pattern for the codebase — see "No Analog Found" below.

---

### `src/frontend/screens/Login/__tests__/loginInFlightUiReachability.test.tsx` — full rewrite

**Analog:** `src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts` and `src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginWindowChrome.test.ts` (both from quick task 260820-kq0)

**Shared conventions to copy verbatim (all three files use this shape):**
```ts
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..' /* , '..' per extra nesting level */)

const readRaw = (relPath: string) => readFileSync(join(REPO_ROOT, relPath), 'utf8')
const read = (relPath: string) => stripSourceComments(readRaw(relPath))
```
- A **FILLED-SPECIMEN GUARD** as the first test in the describe block: assert a raw (unstripped) known-good token exists, so a broken `stripSourceComments` call turns every other assertion in the file RED instead of vacuously green (`dialogWindowChrome.test.ts` lines 51-54; `steamLoginWindowChrome.test.ts` lines 49-52). Mandatory per this repo's ledgered lesson that "a grep assertion must FAIL against a known-bad input."
- Every assertion individually labelled **PRESENCE** or **ABSENCE** in its `it()` description, with an inline `// Breaks if: ...` comment stating exactly what mutation would flip it red (see every test in all three files).
- A doc-comment header stating: this is a SOURCE GATE not a render test (`testEnvironment: 'node'`, no DOM), what it can and cannot prove, and a FALSIFIABILITY paragraph naming that every assertion was confirmed to fail via a temporary local mutation + revert, with the mutation record kept in the executing plan's own SUMMARY.md (all three files, header comments).

**What must change in THIS file specifically:** the existing file's own header (lines 1-83) explicitly documents the CURRENT mechanism ("clicking a login tile navigates away... unmounting every tile") as the honest, correct characterization of what protects against T-34.4.2-39/-41 today, and states in its own FALSIFIABILITY section that this is DELIBERATE, not a bug. Per the ROADMAP.md Phase 36 requirement #2, this doc-comment and its five pinned assertions (`handleLogin()` terminates in `navigate`, `disabled={oldMac}` is the ONLY disabled expression across all six tiles, `oldMac`'s derivation excludes any pending/inFlight identifier, one `runnerGroup` holds all six tiles, `loginweb/:runner` is a route SIBLING of `login`) must be REWRITTEN, not just re-passed — leaving the old prose in place after the mechanism changes would make this suite describe something no longer true, which is exactly the anti-pattern the repo's own process lessons warn against ("a passing test can describe something no longer true"). New pins should assert the REPLACEMENT mechanism: an explicit `disabled=` expression (or equivalent) driven by the new login-in-flight state on the five non-Steam tiles, and — since `loginweb/steam` is being removed from `App.tsx` entirely — a pin that the sibling-route absence check in the current file (`loginwebRunnerIndex` ordering assertion, lines 164-191) still resolves correctly against the now-Steam-free `loginweb/:runner` catch-all, or gets replaced with an assertion that `loginweb/steam` no longer exists in the router tree at all.

---

## Shared Patterns

### Dialog primitive's entrance transition (already exists; SteamLogin already benefits)
**Source:** `src/frontend/components/UI/Dialog/components/Dialog.tsx` lines 33-38, 118-119
**Apply to:** SteamLogin's `<Dialog>` mount already gets this for free (500ms `Slide` `direction="up"`). No new work needed for the "Steam Dialog slides up into position" half of the ROADMAP goal — it is already wired. What is NEW is that today `close()` (line 79-82) sets `open=false` AND calls `onClose` (`navigate('/login')`) in the same tick, so the exit half of MUI's own Slide transition never gets to visually play — React Router unmounts the tree before the 500ms exit can complete. Once dismissal is a local `dismiss()` callback instead of a navigation, `open=false` alone should let MUI's Slide exit transition actually run to completion for the first time in this component's history.
```tsx
const close = useCallback(() => {
  setOpen(false)
  onClose()
}, [onClose])
```

### Global animation kill-switch (`disableAnimations`)
**Source:** `src/frontend/App.css` lines 116-127; wired from `src/frontend/state/GlobalState.tsx` lines 368/434-435, surfaced in `src/frontend/screens/Accessibility/index.tsx` lines 37/248-251
**Apply to:** any new `animation`/`transition` CSS this phase adds
```css
body:has(.disableAnimations) {
  *, *:before, *:after {
    animation: none !important;
    transition: none !important;
    transition-duration: 0ms !important;
  }
  ...
}
```
This is NOT a `prefers-reduced-motion` media query — a full repo grep (`src/frontend/**/*.{css,scss,tsx,ts}`) finds zero matches for `prefers-reduced-motion` anywhere in this codebase. Motion-reduction here is a manual Accessibility-screen toggle (`disableAnimations`, persisted via `configStore`) applied as a class on `#app`/`.App` (`App.tsx` lines 113-119), not an OS-level media query. Any new crossfade CSS this phase adds is automatically covered by this global rule as long as it is expressed as `animation`/`transition` (not, e.g., a raw un-transitioned JS-driven position jump) — no new plumbing required, but the planner should NOT invent a `prefers-reduced-motion` media query as if the codebase already partially supports it; it does not, at all.

### No shared motion/timing design tokens exist
**Source:** searched `src/frontend/styles/_spacing.scss` (spacing tokens: `--space-xs` through `--space-lg`, lines 5-8) and every `.scss`/`.css` file with a `transition:`/`animation:` declaration.
**Finding:** durations are hardcoded per-file literals ranging from 180ms (`ConsoleMode/index.scss:424`) to 500ms (`Dialog/index.css:25-26`, `_buttons.scss:26/54/83`, `InfoBox/index.css:14`, and the Dialog primitive's own `transitionDuration={500}`). There is no `--duration-*` or `--transition-*` CSS custom property anywhere in this codebase, unlike spacing which does have `--space-*` tokens. The ROADMAP anchor already states the Dialog's entrance is 500ms — the planner should match that literal (500ms) for the new exit animation for visual symmetry, following the closest sibling literal rather than inventing a token system this codebase does not have.

## No Analog Found

| File/Change | Role | Data Flow | Reason |
|---|---|---|---|
| JS-driven "wait for exit animation to finish, THEN unmount/hide" choreography (coordinating `.loginContentWrapper`'s slide-out with `.loginContentWrapper` and the Steam `Dialog` crossing in flight) | component behavior | event-driven | No component in this codebase listens for `transitionend`/`animationend`, uses a `setTimeout` keyed to an animation's own duration to defer unmount, or uses React's exit-animation libraries (no `framer-motion` or bare `react-transition-group` dependency in `package.json` — only MUI's internal use of `react-transition-group` via `Slide`/`Fade`, which is not directly importable/reusable outside MUI's own components as currently used here). The planner must decide between (a) a literal-duration CSS `transition`/`animation` class-toggle plus a matching-duration `setTimeout` before final state settles (new pattern, own risk of drift if the CSS duration changes but the JS timeout doesn't), or (b) driving both surfaces off MUI's OWN Slide-exit lifecycle callbacks (`onExited`) if the Dialog primitive is extended to expose them — neither has a precedent in this repo today. |
| `inert` HTML attribute on the five non-Steam tiles | component behavior | event-driven | Confirmed via grep: `inert` appears nowhere in `src/frontend/**/*.tsx` as a literal JSX attribute — only as an English word inside two unrelated comments (`MainButton.tsx:100`, `Library/index.tsx:580`). This is new-to-the-codebase surface; the planner should treat it as `disabled={cond} pointer-events: none via CSS class` first (both of which DO have analogs above) and add the `inert` attribute as a straightforward JSX boolean prop (`inert={loginInFlight ? true : undefined}` or similar — React 19/18 both support it natively on host elements) without expecting a codebase convention to imitate beyond ordinary JSX attribute wiring. |
| A shared motion/timing token system (`--duration-*` CSS custom properties) | style config | n/a | Does not exist; see "No shared motion/timing design tokens exist" above. Not a gap to fill unless the planner explicitly decides to introduce one — out of scope for a single phase unless requested. |

## Metadata

**Analog search scope:** `src/frontend/screens/Login/**`, `src/frontend/App.tsx`, `src/frontend/components/UI/Dialog/**`, `src/frontend/screens/ConsoleMode/**`, `src/frontend/styles/_spacing.scss`, `src/frontend/App.css`, repo-wide grep for `prefers-reduced-motion`, `inert`, `transitionend`/`animationend`, `pointer-events: none`, and disabled-by-pending-state wiring across `src/frontend/screens/**`.
**Files scanned (read in full or targeted range):** `Login/index.tsx`, `Login/index.scss`, `Login/components/SIDLogin/index.tsx`, `Login/components/SIDLogin/index.css`, `Login/components/SteamLogin/index.tsx`, `Login/components/Runner/index.tsx`, `Login/components/Runner/index.css`, `Login/__tests__/loginInFlightUiReachability.test.tsx`, `App.tsx` (routes block), `components/UI/Dialog/components/Dialog.tsx`, `components/UI/Dialog/index.ts`, `components/UI/Dialog/__tests__/dialogWindowChrome.test.ts`, `Login/components/SteamLogin/__tests__/steamLoginWindowChrome.test.ts`, `ConsoleMode/index.tsx` (disabled-wiring section), `ConsoleMode/index.scss` (animation section), `App.css` (animation kill-switch section), `styles/_spacing.scss`, `state/GlobalState.tsx`/`state/ContextProvider.tsx`/`types.ts`/`screens/Accessibility/index.tsx` (disableAnimations wiring), `package.json` (motion-library dependency check).
**Pattern extraction date:** 2026-08-20
