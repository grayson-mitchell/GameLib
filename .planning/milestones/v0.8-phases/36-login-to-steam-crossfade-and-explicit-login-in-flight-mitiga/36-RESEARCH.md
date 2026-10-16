# Phase 36: Login-to-Steam Crossfade and Explicit Login-In-Flight Mitigation - Research

**Researched:** 2026-08-20
**Domain:** React + MUI overlay/animation choreography inside a Tauri WKWebView; frontend-only security mitigation (UI reachability guard); threat-register documentation update
**Confidence:** HIGH

## Summary

No CONTEXT.md exists for this phase yet (plan-phase runs the pattern-mapper and researcher before
discuss-phase in this project's flow, per the mapper's own note in `36-PATTERNS.md`). This research
therefore treats ROADMAP.md's "Phase 36" section — including the operator's 2026-08-20 approval of
the threat-model change — as the locked scope, and the existing `36-PATTERNS.md` pattern map
(already written by a prior agent in this planning round) as a companion artifact, not a substitute:
this file independently verifies claims made there, and corrects one of them (see below).

The correct implementation shape is simpler than "co-mounted exit/entrance animation" makes it
sound, because of one structural fact this research confirms: **`SteamLogin` should stop navigating
and instead become conditionally-rendered local state on `Login/index.tsx`, exactly mirroring the
`showSidLogin`/`SIDLogin` overlay that already exists in the same file (lines 50, 124-130).** Once
Steam's sign-in flow is no longer a route, `.loginContentWrapper` never needs to unmount at all — it
only needs to slide out of view via a CSS class transition while the Steam `Dialog` (portaled to
`document.body` by MUI, independent of `.loginPage`'s DOM subtree) slides in on top. This removes
the "JS-driven exit-then-unmount choreography" problem entirely — there is no unmount to coordinate,
so no `onExited`/`transitionend` callback wiring, no transition library, and no View Transitions API
are needed. Plain CSS `transform`/`opacity` transitions, keyed off a state class exactly like the
`ConsoleMode.launching` precedent already in this codebase, are sufficient and are the only choice
verified safe on this app's WKWebView floor (macOS 12, Safari ~15.4) — the View Transitions API did
not ship in WebKit until Safari 18 (September 2024, effectively macOS 15+), which is far above this
app's own `oldMac` gate (`Login/index.tsx:79-89`, macOS 12).

The coupled security fix is real and distinct from the animation: today, the *only* thing making the
other five login tiles unreachable during a login-in-flight window is that `navigate()` unmounts the
entire `Login` screen (documented, with mutation-proven falsifiability, in
`loginInFlightUiReachability.test.tsx:1-83`). Once `SteamLogin` stops navigating, that incidental
mitigation disappears and must be replaced with an explicit `loginInFlight`-shaped boolean threaded
into all five other tiles' existing `disabled={oldMac}` prop, `pointer-events: none` on their
container class (an established codebase pattern via `ConsoleMode/index.scss`'s `.launching` block),
and `inert` on the same container. The `inert` half requires a **correction to `36-PATTERNS.md`**:
that document asserts `inert={loginInFlight ? true : undefined}` "React 19/18 both support it
natively" — this is factually wrong for React 18.3.1 (this project's pinned version; see
`package.json`). React's boolean-`inert` support landed in React 19 (facebook/react PR #24730); on
React 18 the correct, warning-free form is `inert={loginInFlight ? '' : undefined}` (empty string,
not boolean `true`).

**Primary recommendation:** Keep `SteamLogin` mounted as local overlay state on `Login/index.tsx`
(no route, no unmount), drive both halves of the crossfade with plain CSS `transform`/`opacity`
transitions on a state-toggled class (matching the `ConsoleMode.launching` precedent), thread an
explicit `loginInFlight` boolean into the five other tiles' `disabled` prop plus a `pointer-events:
none` class plus `inert={loginInFlight ? '' : undefined}` (not boolean — React 18), and append a new
dated update section to the established threat-register file
(`34.4.2-PLATFORM-SCOPE.md` §5, the "Nth update" pattern already used 13 times) documenting T-34.4.2-39/-41's basis change from incidental-unmount to explicit-guard.

## Architectural Responsibility Map

This is a single-process desktop app (Tauri + React renderer + Node sidecar), not a client/server
web app, so the generic tier table is adapted to this project's actual architecture:

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Crossfade animation (slide-out/slide-in choreography) | Renderer (React + CSS, WKWebView) | — | Purely presentational; no IPC, no Rust, no backend involvement. Matches every existing animation in the codebase (`ConsoleMode`, `Dialog`'s Slide), all of which are renderer-only. |
| Login-in-flight guard (disabled/pointer-events/inert on the other 5 tiles) | Renderer (React state + DOM attributes) | — | This is, and remains, a **UI-reachability mitigation only** — same class of control as today's incidental unmount. It does not touch `src-tauri` or the Node sidecar. This is worth stating explicitly to the planner: the threat basis stays "UI-pinned," not "backend-enforced," exactly as today (`34.4.2-VERIFICATION.md` Truth 8). |
| Steam sign-in flow itself (QR/credentials/guard polling, `steam-user` calls) | Node sidecar (`src/backend/storeManagers/steam/*`) | Renderer (`SteamLogin/index.tsx` polls `window.api.steam*`) | Unchanged by this phase — out of scope per the scope fence. Only the *presentation container* around this flow changes (route → overlay). |
| Threat-register update (T-34.4.2-39/-41 basis change) | Documentation/process (planning artifacts) | — | Not a runtime tier at all; a `.planning/phases/34.4.2-.../34.4.2-PLATFORM-SCOPE.md` append. Included here only because the roadmap names it as a required phase deliverable. |

## User Constraints

No `36-CONTEXT.md` exists for this phase (confirmed: the phase directory contains only `.gitkeep`
and `36-PATTERNS.md`). The only locked decision available is the one recorded directly in
`ROADMAP.md`'s Phase 36 section: **operator explicitly approved the threat-model change on
2026-08-20** — trading the cheaper "sequential handoff" (navigate away, same as today, just prettier)
for the more expensive but stronger "co-mounted, explicit guard" shape. This is not optional; it is
the phase's own reason for existing. If `/gsd:discuss-phase` runs before planning, its CONTEXT.md
should be treated as further narrowing this research, not superseding it.

<phase_requirements>
## Phase Requirements

ROADMAP.md states `**Requirements**: TBD` for Phase 36 and `REQUIREMENTS.md` has no entries for this
phase yet (confirmed via grep — zero matches for any phase-36-shaped REQ ID). No requirement IDs were
supplied to this research task. The planner should mint REQ IDs from the four numbered obligations in
ROADMAP.md's "This phase must therefore ALSO" list plus the animation goal in the phase's own opening
paragraph; this research is organized so each maps cleanly:

| Likely REQ (unminted) | Description | Research Support |
|---|---|---|
| Crossfade animation | Steam Dialog slides up in while `.loginContentWrapper` slides up and out, `.loginBackground` stays painted | See "Architecture Patterns" — CSS-only, no library, no unmount needed |
| Explicit login-in-flight state | Other 5 tiles `disabled` + `pointer-events:none` + `inert` while Steam flow open | See "Don't Hand-Roll" and "Common Pitfalls" — React 18 `inert` string-form correction |
| Rewrite `loginInFlightUiReachability.test.tsx` | Pin the NEW mechanism, not the old unmount | See "The Exact Current Mechanism Being Replaced" |
| Update threat register | T-34.4.2-39/-41 basis: incidental unmount → explicit guard | See "Where The Threat Register Lives" |
</phase_requirements>

## Standard Stack

No new packages are needed for this phase. Every capability required — conditional local overlay
state, CSS transform/opacity transitions, a `pointer-events`/`disabled`/`inert` guard triad — is
achievable with what is already in `package.json` and already used elsewhere in this exact codebase.

### Core (already installed, no version change)
| Library | Version (verified) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react / react-dom | ^18.3.1 [VERIFIED: package.json] | Renderer | Already the whole frontend. **Constrains the `inert` prop's correct form (string, not boolean) — see Common Pitfalls.** |
| react-router-dom | ^6.30.0 [VERIFIED: package.json] | Routing | Stays in use for every other route; this phase *removes* one route (`loginweb/steam`) rather than adding routing complexity. |
| @mui/material | ^5.17.1 [VERIFIED: package.json] | `Dialog`, `Slide` transition | `SteamLogin` already renders through the shared `Dialog` primitive (`Dialog.tsx`), which already supplies the 500ms slide-up entrance via `TransitionComponent={SlideUpTransition}` (quick task 260820-kq0, commit `1b7fa0eaa`). No change needed to `Dialog.tsx` itself — it is explicitly out of scope. |

### Package Legitimacy Audit

Not applicable — this phase installs no new external packages. Every mechanism (conditional
rendering, CSS transitions, the `inert` HTML attribute, MUI's existing `Slide`) is either already a
dependency or a plain browser/DOM primitive.

## Architecture Patterns

### The core structural decision: overlay state, not navigation

**What:** `Login/index.tsx` already has one working precedent for exactly this shape —
`showSidLogin`:

```tsx
// Login/index.tsx:50, 124-130 (existing code, verified)
const [showSidLogin, setShowSidLogin] = useState(false)
...
return (
  <div className="loginPage">
    {showSidLogin && (
      <SIDLogin backdropClick={() => setShowSidLogin(false)} />
    )}
    <div className="loginBackground"></div>
    <div className="loginContentWrapper">
      ...
```

Copy this shape for Steam: add `showSteamLogin` state, render `{showSteamLogin && <SteamLogin
dismiss={() => setShowSteamLogin(false)} />}` as a sibling of `.loginBackground` and
`.loginContentWrapper`, and repoint `SteamLogin`'s `closeWindow` (currently `() =>
navigate('/login')` at `SteamLogin/index.tsx:29`, plus four more `navigate('/login')` call sites at
lines 96, 142, 228, 255 after successful login) to call the `dismiss` prop instead.

**Wiring the Steam tile to open the overlay, not navigate:** `Runner` already has the exact escape
hatch needed — `primaryLoginAction?: () => any` — used today by the Epic-under-Tauri branch
(`Login/index.tsx:156-158`: `primaryLoginAction={isTauri() ? () => setShowSidLogin(true) : undefined}`).
`Runner.handleLogin()` checks this first and returns before ever calling `navigate(props.loginUrl)`
(`Runner/index.tsx:63-68`). Apply the identical pattern to the Steam tile:
`primaryLoginAction={() => setShowSteamLogin(true)}`. **Zero changes to `Runner/index.tsx` are
required** — this is a pure call-site change in `Login/index.tsx`.

**Why this avoids the "co-mounted exit/entrance animation" problem entirely:** MUI's `Dialog`
renders through a React Portal to `document.body` by default (MUI's own documented behavior,
unchanged by this codebase — `Dialog.tsx` sets no `disablePortal`). It is not a DOM sibling of
`.loginContentWrapper`; it stacks on top via its own backdrop (`z-index: 1300` per MUI's default,
confirmed via `App.css:109` explicitly coordinating with `1300` for its own overlay). This means
`.loginContentWrapper` does **not** need to be removed from the DOM for the Dialog to appear over
it — it only needs to be visually moved out of the way. Because nothing unmounts, there is no
transition-completion race to coordinate (no `onExited`, no `transitionend` listener, no
`react-transition-group` usage beyond what MUI's `Slide` already does internally for the Dialog
entrance). `36-PATTERNS.md` flagged "JS-driven exit-then-unmount choreography" as having no analog
anywhere in the codebase — that finding is correct, but the resolution is that this phase does not
need that choreography at all, because nothing needs to unmount.

### CSS-only crossfade — verified against WKWebView, not Chromium

**Do not use the View Transitions API.** [VERIFIED via WebSearch, cross-checked against WebKit's own
blog] Same-document View Transitions shipped in Safari 18.0 (September 2024, effectively macOS
Sequoia 15+). This app's own `oldMac` gate (`Login/index.tsx:79-89`) sets its floor at macOS 12 —
three major macOS versions below where the API exists at all. `document.startViewTransition()` is
simply undefined on the WKWebView versions this app must support; feature-detecting and falling back
would add real complexity for zero benefit over a CSS transition, which achieves the same visual
result.

**Do not add a transition library.** No `framer-motion`, `react-transition-group` (direct dependency
— it currently only arrives transitively via MUI), or similar is installed or needed
[VERIFIED: package.json grep, zero matches]. `36-PATTERNS.md`'s own scan found no shared motion/timing
token system in this codebase (`--duration-*` custom properties do not exist) — durations are
hardcoded per-file literals. The closest sibling literal is the Dialog's own 500ms
(`Dialog.tsx:119`); match it for visual symmetry rather than inventing a new value.

**Use a state-toggled class + plain CSS transitions**, following the one existing precedent for
"boolean state dims/disables several sibling containers simultaneously" in this codebase —
`ConsoleMode/index.scss` lines 1-38:

```scss
// Source: src/frontend/screens/ConsoleMode/index.scss (existing pattern in this codebase)
.ConsoleMode {
  animation: consoleEnter 380ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
> .consoleTopBar, > .consoleTitleBar, > .consoleStage, > .consoleFooter {
  transition: opacity 220ms ease;
}
&.launching {
  > .consoleTopBar, > .consoleTitleBar, > .consoleStage, > .consoleFooter {
    opacity: 0.2;
    pointer-events: none;
  }
}
```

Apply the same shape to `.loginContentWrapper`: a `transition: transform 500ms, opacity 500ms`
declaration, and a state class (e.g. `.loginPage.steamFlowOpen .loginContentWrapper`) that sets
`transform: translateY(-100%); opacity: 0; pointer-events: none;`. `.loginBackground` needs no
change — it is already `position: absolute; inset: 0` and independent of `.loginContentWrapper`'s
grid cell (`Login/index.scss:32-50`), so it "remains painted underneath" automatically, matching the
ROADMAP anchor's own statement that this needs no new element.

**This is automatically covered by the existing global motion-reduction switch.** `App.css:116`
(`body:has(.disableAnimations) { *, *:before, *:after { animation: none !important; transition: none
!important; ... } }`) already overrides any `transition`/`animation` CSS property app-wide, including
whatever this phase adds, with zero new plumbing — provided the new crossfade is implemented as CSS
`transition`/`animation` (not a raw JS style/position mutation with no CSS transition
property, which this global rule cannot intercept).

### Recommended file-level structure (no new files needed)

```
src/frontend/screens/Login/
├── index.tsx                      # add showSteamLogin state, loginInFlight state, primaryLoginAction wiring
├── index.scss                     # add .steamFlowOpen exit transform + in-flight dimming (ConsoleMode.launching shape)
├── components/
│   ├── SteamLogin/index.tsx       # repoint 5x navigate('/login') calls to a dismiss prop
│   └── Runner/index.tsx           # UNCHANGED — primaryLoginAction escape hatch already exists
└── __tests__/
    └── loginInFlightUiReachability.test.tsx   # full rewrite — see below
```

`src/frontend/App.tsx` loses the `loginweb/steam` route (currently lines 236-239); the
`loginweb/:runner` catch-all (currently line 241) is untouched and continues to resolve for the
other five stores.

### Anti-Patterns to Avoid
- **Do not reintroduce a route for Steam "for consistency with the other five."** That is precisely
  the mechanism being retired — the other five stores still navigate today and are unaffected by
  this phase; only Steam changes shape.
- **Do not build a generic "AnimatedRoute" or transition-group wrapper for the whole router.** No
  other route in this app crossfades; scope this to the Login screen's own local state, matching
  the existing `SIDLogin` precedent exactly.
- **Do not rely on MUI's Slide `onExited` callback to unmount `.loginContentWrapper`.** There is
  nothing to unmount; using an exit-callback to *hide* an already-non-interactive, already
  translated-off-screen element would add a second source of truth for visibility that must stay in
  sync with the CSS transform, for no behavioral benefit.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dialog entrance animation | A custom slide-in wrapper | The existing `Dialog.tsx` `SlideUpTransition` (already wired, 500ms) | Already shipped (commit `1b7fa0eaa`); rebuilding it in `SteamLogin` would create two competing transitions on the same element, which `dialogWindowChrome.test.ts` explicitly guards against ("no second, competing backdrop"). |
| Focus trap / focus restore for the Steam overlay | Custom `useEffect` focus management | MUI `Modal`'s default `Dialog` behavior (`disableAutoFocus`/`disableEnforceFocus`/`disableRestoreFocus` all default `false`) | [VERIFIED via WebSearch, MUI official docs behavior] By default, MUI already auto-focuses into the dialog on open, traps Tab within it while open, and restores focus to the previously-focused element on close. `Dialog.tsx` overrides none of these three props, so all three are already active for `SteamLogin` today and will remain active once it becomes an overlay. See "Focus Management" below for the one thing this does *not* cover. |
| Boolean-attribute polyfill for `inert` | A custom pointer-events/tabindex sweep utility | The native `inert` attribute, string-form for React 18 | Native `inert` (Safari 15.5+, see Common Pitfalls) already removes an element from the accessibility tree, focus order, and hit-testing in one attribute — reimplementing that with manual `tabIndex=-1` sweeps + `aria-hidden` is exactly the "don't hand-roll" case, but only where the browser floor actually supports it (see the fallback note below). |

**Key insight:** Every piece this phase needs — overlay state, CSS transitions, focus trapping —
already has a working precedent inside this exact file or its closest sibling. The only genuinely
new-to-this-codebase primitive is the `inert` attribute itself, and even that is a one-line native
HTML feature, not something to build a utility around.

## Common Pitfalls

### Pitfall 1: `inert={true}` silently does the wrong thing on React 18

**What goes wrong:** `36-PATTERNS.md` (written earlier in this planning round) states `inert={loginInFlight ? true : undefined}` and claims "React 19/18 both support it natively." **This claim is
incorrect for React 18** [VERIFIED via WebSearch: facebook/react PR #24730, and multiple
cross-referenced sources]. Boolean-typed `inert` (where `true`/`false` map to attribute
presence/absence) landed in **React 19**. On React 18.x (this project is pinned to `^18.3.1` —
[VERIFIED: package.json]), `inert` is treated as a generic, non-boolean DOM attribute:
- `inert={true}` renders the literal DOM attribute `inert="true"` (not the empty-string / boolean
  form the HTML spec expects, though most browsers still treat any non-`"false"` string value as
  "present" — this is a footgun, not a hard failure).
- `inert={false}` previously caused a **React console warning**: *"Received `false` for a
  non-boolean attribute `inert`."*
**Why it happens:** React did not special-case `inert` in its list of recognized boolean HTML
attributes (`disabled`, `hidden`, `checked`, etc.) until version 19.
**How to avoid:** Use the string-based idiom Recommended for pre-19 React: `inert={loginInFlight ?
'' : undefined}`. Passing `undefined` (not `false`) omits the attribute from the DOM entirely,
avoiding both the warning and any risk of a stray `inert="false"` (which some engines could
misinterpret). If/when this project upgrades to React 19, this becomes `inert={loginInFlight}` and
should be revisited then, not now.
**Warning signs:** A console warning reading "Received `false` for a non-boolean attribute" during
dev is the direct symptom; silently-wrong behavior (tiles still focusable) would be the runtime
symptom if the empty-string form is skipped.

### Pitfall 2: `inert` itself may not exist on this app's own minimum-supported macOS

**What goes wrong:** Safari/WebKit shipped `inert` in **Safari 15.5** (May 2022) [VERIFIED via
WebSearch, WebKit's own blog: "New WebKit Features in Safari 15.5"]. Safari 15.5 was distributed for
macOS Monterey **12.4** and later. This app's own `oldMac` check (`Login/index.tsx:79-89`) sets its
floor at macOS **12** (any 12.x), which includes 12.0–12.3 — versions that predate Safari 15.5 and
therefore predate `inert` support. This is a genuinely narrow gap (three minor OS point releases,
in a version the app already discourages via a UI warning message, not blocks), but it means a
strict reading of "verify `inert` support in this app's WKWebView" surfaces a real edge case, not a
theoretical one.
**Why it happens:** The app's own version gate (`< 12` blocked) was set for an unrelated reason
(likely general Tauri/WKWebView compatibility) and was never cross-checked against `inert`'s own,
later and narrower, availability window.
**How to avoid:** Because `disabled` (already wired, JS-level click guard) and `pointer-events:
none` (CSS, universally supported) are the other two layers of the same mitigation triad, and both
are unconditionally supported, `inert`'s absence on macOS 12.0–12.3 degrades this specific mitigation
from three redundant layers to two — the tiles are still un-clickable and un-styled-as-active, just
not removed from the accessibility tree/tab order on that narrow OS slice. This is very likely an
acceptable residual risk given the existing `oldMac` gate already discourages (via a warning message,
not a hard block) that OS range for unrelated reasons — but it should be **stated to the operator as
a known gap**, not silently absorbed, since the roadmap explicitly names `inert` as one of three
required layers.
**Warning signs:** None observable in normal development (a modern macOS dev machine will always
have `inert` support); this only surfaces on an actual macOS 12.0–12.3 install, which is exactly the
kind of gap this repo's own process lessons warn tends to go undetected without an explicit check.

### Pitfall 3: `SteamLogin`'s five `navigate('/login')` call sites are easy to undercount

**What goes wrong:** `SteamLogin/index.tsx` calls `navigate('/login')` (or the equivalent dismiss
action) at five distinct points, not one: the explicit close handler (line 29), and four
post-success paths (QR flow line 142, credential-poll line 96, credential-submit line 228, and
guard-submit line 255 — exact line numbers from this research's own read of the file). A plan that
only repoints the close button's handler and misses the four success paths will leave the Steam
overlay stuck open (or attempting a dead navigation) after a successful login.
**Why it happens:** The five call sites are spread across different async handlers (`startQRFlow`'s
poll interval, `startCredPoll`'s poll interval, `handleCredentialSubmit`, `handleGuardSubmit`, and
the plain close handler), not co-located.
**How to avoid:** Grep the file for `navigate(` before considering the SteamLogin rewrite complete;
all five must be repointed to the same `dismiss` callback (which should also clear
`loginInFlight` on the parent).
**Warning signs:** A successful QR-scan or credential login that leaves the Dialog open, or a "Cannot
navigate" console error from a route that no longer exists.

### Pitfall 4: The rewritten reachability test must stay a source gate, not attempt to become a render test

**What goes wrong:** It would be tempting, once real component/DOM behavior is what actually needs
proving (tiles genuinely inert, genuinely `pointer-events: none`), to reach for a rendering harness.
**Why it happens:** `frontend/jest.config.js` is deliberately `testEnvironment: 'node'` — no jsdom,
no `jest-environment-jsdom`, no React Testing Library are installed
[VERIFIED: `src/frontend/jest.config.js` header comment, and `package.json` — neither package is a
dependency]. Every existing test in this suite (`loginInFlightUiReachability.test.tsx`,
`dialogWindowChrome.test.ts`, `steamLoginWindowChrome.test.ts`) is a `readFileSync` + comment-strip +
regex source gate, by explicit, documented design.
**How to avoid:** The rewritten test must keep the same shape: PRESENCE/ABSENCE-labelled assertions
against stripped source text, a FILLED-SPECIMEN guard, and a FALSIFIABILITY paragraph recording that
each assertion was confirmed to fail against a temporary local mutation before commit (the existing
file's own header, lines 63-82, documents this convention in detail and should be followed, not
reinvented). Adding `jest-environment-jsdom` as a new dependency is explicitly called out elsewhere
in this codebase as excluded from auto-fix and requiring a human package-legitimacy checkpoint
(`src/frontend/jest.config.js` header comment) — out of scope for this phase.
**Warning signs:** A `ReferenceError: document is not defined` (or similar) at test run time is the
direct symptom of accidentally writing DOM-dependent test code against this `node`-environment jest
project.

## The Exact Current Mechanism Being Replaced

`src/frontend/screens/Login/__tests__/loginInFlightUiReachability.test.tsx:1-83` (header comment)
states the mechanism precisely, and **explicitly corrects** an earlier wrong characterization that
had been recorded in `deferred-items.md` and `ROADMAP.md` ("the frontend disables/clears the other
login buttons while one login is in flight" — WRONG). The real mechanism, confirmed by direct source
inspection at plan 34.4.2-22:

1. All six `Runner` tiles pass `disabled={oldMac}` and **nothing else** — no login-in-flight state
   feeds `disabled` anywhere in `Login/index.tsx` today (verified again in this research's own read
   of the current file: all six `disabled={oldMac}` occurrences at lines 172, 181, 190, 200, 210, 223).
2. `Runner.handleLogin()`, for every tile without a `primaryLoginAction` (all but Epic-under-Tauri),
   terminates in `navigate(props.loginUrl)` — a full React Router navigation.
3. `loginweb/:runner` is a **sibling route** of `login` in the same `createHashRouter` tree
   (`App.tsx`), so navigating there **unmounts** the whole `Login` component, including the single
   `runnerGroup` container holding all six tiles.

So today, a second store's tile is unreachable not because it became disabled, but because clicking
any tile takes the whole screen away with it. Five assertions in the current test file pin this
shape (PRESENCE: `handleLogin()`'s call sequence; ABSENCE: `disabled={oldMac}` is the *only*
disabled expression across all six tiles; PRESENCE+ABSENCE: `oldMac`'s derivation excludes any
pending/inFlight identifier; PRESENCE: exactly one `runnerGroup` container; PRESENCE: `loginweb/:runner`
registered as a route sibling of `login`) — every one of the four independent pins was confirmed, via
temporary local mutation and revert, to actually fail against the mutated shape (recorded in
`34.4.2-22-SUMMARY.md`).

**What a replacement must provide to be at least as strong:** the test file's own header states the
honest limitation already — this suite proves *source shape*, never rendered behavior or a real
click, because the jest project has no DOM (see Pitfall 4). The replacement must therefore pin, by
the same source-gate convention:
- The five other tiles' `disabled` expression is no longer the literal `oldMac` alone, but includes
  an explicit login-in-flight identifier (e.g. `disabled={oldMac || loginInFlight}`), replacing the
  current ABSENCE assertion (which explicitly checked that no such identifier existed) with a
  PRESENCE assertion that it now does.
- A `pointer-events: none` rule exists, gated behind the same in-flight state class, in
  `Login/index.scss`.
- An `inert` attribute (string-form per Pitfall 1) is present on the same five-tile container,
  gated behind the same state.
- `loginweb/steam` **no longer exists** in the router tree (an ABSENCE assertion replacing today's
  PRESENCE assertion that it does), while `loginweb/:runner` continues to resolve for the other five.
- A new FALSIFIABILITY paragraph, following the existing convention, recording that each new
  assertion was confirmed to fail against a temporary mutation before commit.

The doc-comment itself must be rewritten, not just the assertions — its current prose narrates the
unmount mechanism as the operative one; leaving that prose in place while the code no longer does
that would make the suite describe something no longer true (this is the exact anti-pattern the
ROADMAP.md phase description names by number: "leaving that in place would make it a passing test
that describes something no longer true").

## Where the Threat Register Lives

There is no single `THREAT-REGISTER.md` file in this project. The canonical, actively-maintained
register for T-34.4.2-39 and T-34.4.2-41 is:

**`.planning/phases/34.4.2-macos-login-window-ux-modal-child-window-attachment-in-field/34.4.2-PLATFORM-SCOPE.md`, section 5 ("Threat register roll-up"), starting at line 427.**

[VERIFIED: read in full] This section uses an **append-and-supersede** convention: it has already
been updated thirteen times (labelled "Second update" through "Thirteenth update" as dated,
bold-headed subsections), each one adding a new pipe-table with columns
`| Threat ID | Status-at-entry-of-this-update | Update-this-round (bold) | Evidence/notes |`, with
older tables explicitly retained, never overwritten or deleted. The most recent entry for these two
threats (Thirteenth update, 2026-08-06, plan 34.4.2-24) reads:

```
| T-34.4.2-39 / T-34.4.2-41 | DISPOSITION CHANGED under D-G1: live-discharge path WITHDRAWN, not
merely blocked. Basis unit-proven + UI-pinned, permanently. | **Unchanged -- still WITHDRAWN,
unit-proven + UI-pinned, permanently.** Item 5 not attempted (it withdrawn, not scored) was not
re-instated. | Plan 14's mutation-proven unit test + plan 22's `loginInFlightUiReachability.test.tsx`
remain sole discharge basis, per D-G1. |
```

**Updating this concretely requires** appending a new dated subsection (a "Fourteenth update," or
whatever the correct ordinal is by the time this phase executes — check the file's current tail
first) following the exact same header/table shape, with a new row for T-34.4.2-39/-41 stating: the
basis changes from "incidental unmount" (the mechanism this row currently cites) to "explicit,
stated guard" (the new `loginInFlight`/`disabled`/`pointer-events`/`inert` state), and naming the
new evidence source (the rewritten `loginInFlightUiReachability.test.tsx`, plus a new mutation-proven
falsifiability record for it, per this file's own established convention). The narrative prose
preceding each dated table (see the Thirteenth update's own preamble for a length/detail example)
should also state plainly whether this changes the "permanently WITHDRAWN, never live-discharged"
disposition itself, or only its basis — per the current row, live discharge was withdrawn because
the *UI itself* made the scenario unreachable (item 5's own contract could never be performed against
the shipped frontend, F-34.4.2-17). Once the Login screen no longer unmounts on click, it becomes
possible in principle to *attempt* a live click-based reachability test against the new explicit
guard — whether to actually re-open that live-discharge path is a decision for whoever plans/executes
this phase, not settled by this research, and should be surfaced as an open question (see below).

**Secondary reference, not the update target:** `34.4.2-VERIFICATION.md` (lines 216, 221) contains
"Truth 8," a closed gate's locked scorecard entry for the same two threats, stating the same
"UNCERTAIN by design... unit-proven plus UI-pinned, never live-discharged" basis. This is a
historical snapshot from a closed phase's gate, not a living register — it should very likely be
cross-referenced (a note added pointing forward to the new PLATFORM-SCOPE.md update), but the
append-and-supersede pattern belongs in `34.4.2-PLATFORM-SCOPE.md` §5, which is the file that has
actually been the target of every prior threat-basis change for these two IDs.

## Focus Management

**Most of this is already handled, with no new code, by MUI's own defaults.** [VERIFIED via
WebSearch, MUI's own documented `Modal` behavior] `Dialog.tsx` sets none of MUI's three
focus-override props (`disableAutoFocus`, `disableEnforceFocus`, `disableRestoreFocus`), so all
three default to `false`, meaning the full focus trap is already active for every `Dialog` consumer
in this app, `SteamLogin` included:
- **Auto-focus on open:** MUI shifts focus into the dialog automatically. `Dialog.tsx` additionally
  layers a `useEffect` HACK (`Dialog.tsx:70-77`) firing one or two synthesized Tab keypresses via
  `window.api.gamepadAction({ action: 'tab' })`, because "focussing the dialog using JS does not seem
  to work" — this is a pre-existing, documented workaround, not something this phase needs to touch.
- **Enforce focus while open:** Tab cannot leave the dialog while it's open — already active.
- **Restore focus on close:** Focus returns to whatever was focused before the dialog opened
  (i.e., the Steam tile) — already active. Since `loginInFlight` should already be cleared by the
  time the dialog closes (successful login or explicit dismiss both should clear it in the same
  action that dismisses), the Steam tile will not be `disabled`/`inert` at the moment focus returns
  to it, so this is safe.

**What is genuinely new and does need explicit handling:** the *other five tiles* going `inert`
while the Steam flow is open is a **separate, complementary** mechanism from MUI's focus trap, not a
duplicate of it. MUI's `enforceFocus` only prevents *Tab-key* focus from leaving the dialog; it does
not touch mouse clicks (`pointer-events: none` covers that), the JS click handler
(`disabled` covers that, via `Runner.handleLogin()`'s existing `if (props.disabled) return` guard at
`Runner/index.tsx:59-61`), or assistive-technology navigation methods that don't go through Tab (e.g.
a screen reader's rotor/virtual cursor, which `inert`'s accessibility-tree removal covers, and Tab
alone does not). All three layers are therefore independently load-bearing, not redundant — the
existing `gamepadAction({action:'tab'})` HACK and MUI's built-in trap need no changes for this phase;
the new `loginInFlight` state and its three DOM effects are additive.

## Reduced Motion

**Zero matches** for `prefers-reduced-motion` anywhere in `src/frontend/**/*.{css,scss,tsx,ts}`
[VERIFIED via grep, matching `36-PATTERNS.md`'s own independent finding]. This codebase does not
honor the OS-level media query anywhere today. The only existing motion-reduction mechanism is a
**manual, in-app Accessibility-screen toggle** (`disableAnimations`, persisted via `configStore`,
applied as a class on `#app`/`.App` — `App.tsx:113-119`, `App.css:116-127`), not an automatic
OS-preference read.

**What this phase should do:** Nothing extra is *required* to comply with the existing convention —
any new `transition`/`animation` CSS property this phase adds is automatically caught by the
existing `body:has(.disableAnimations) { *, *:before, *:after { transition: none !important;
animation: none !important; } }` global override, with zero new plumbing, **provided** the new
crossfade is implemented as an actual CSS `transition`/`animation` property (not a raw, untransitioned
JS style/position mutation, which this rule structurally cannot intercept). This is a real
implementation constraint on Pattern 2 above, not just an aside.

**Optional, in-scope addition (Claude's discretion, not mandated by the roadmap):** since this phase
is already touching `Login/index.scss` and the scope fence explicitly limits changes to the Login
screen, it would be low-risk and low-diff to *also* wrap the new transition declarations in a
`@media (prefers-reduced-motion: reduce)` rule that sets `transition: none` for `.loginContentWrapter`'s
crossfade specifically — this would not be a repo-wide `prefers-reduced-motion` rollout (out of
scope per the scope fence), just a scoped courtesy on the one new animation this phase introduces. It
is not required by anything in ROADMAP.md and should be flagged to the operator as optional, not
silently added or silently skipped.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29 + `ts-jest`, two relevant projects: `src/frontend` (`testEnvironment: 'node'`, **no jsdom**) and `src/backend` (`testEnvironment: 'node'`) |
| Config file | `src/frontend/jest.config.js` (frontend project); root `jest.config.js` (multi-project runner) |
| Quick run command | `npx jest src/frontend/screens/Login/__tests__/loginInFlightUiReachability.test.tsx src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginWindowChrome.test.ts src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts` |
| Full suite command | `npm run test:ci` (per `34.4.2-PLATFORM-SCOPE.md` §4's own evidence convention) |

### Phase Requirements → Test Map
| Req (unminted) | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| Crossfade animation | `.loginContentWrapper` exit + Steam Dialog entrance are both CSS `transition`/`animation` properties, not raw JS mutation | source gate (PRESENCE/ABSENCE regex against stripped source) | new test, same convention as `dialogWindowChrome.test.ts` | ❌ new file needed, e.g. `loginCrossfade.test.ts` |
| Explicit login-in-flight guard | 5 non-Steam tiles' `disabled` expression includes an in-flight identifier; `pointer-events:none` + `inert` present, gated on the same state | source gate | rewritten `loginInFlightUiReachability.test.tsx` | ✅ exists, needs full rewrite (not new) |
| `loginweb/steam` route removed | Route no longer present in `App.tsx`'s router tree; `loginweb/:runner` still resolves for the other 5 | source gate | same rewritten test file (one of its existing assertions, inverted) | ✅ (as above) |
| `SteamLogin` no longer navigates | Zero `navigate(` calls remain in `SteamLogin/index.tsx`; a `dismiss` prop is called instead at all 5 former call sites | source gate | extend or add to `steamLoginWindowChrome.test.ts` | ✅ exists, needs extension |
| Visual crossfade actually looks correct | Human eyes on real hardware | manual-only | N/A | — no automated test can see this; this repo's own convention (`steamLoginWindowChrome.test.ts`'s header) explicitly defers "what a human actually sees" to a human visual gate task, never a source-text assertion |

### Sampling Rate
- **Per task commit:** the quick run command above (three-to-four targeted files, sub-second each)
- **Per wave merge:** `npm run test:ci` full suite
- **Phase gate:** full suite green, plus a human visual-gate task (source gates structurally cannot
  verify the animation is visually correct — this repo's own established convention, not new to this
  phase)

### Wave 0 Gaps
- [ ] A new source-gate test file for the crossfade CSS shape (e.g.
  `src/frontend/screens/Login/__tests__/loginCrossfade.test.ts`), following the
  `dialogWindowChrome.test.ts` / `steamLoginWindowChrome.test.ts` convention exactly (FILLED-SPECIMEN
  guard, PRESENCE/ABSENCE labels, FALSIFIABILITY paragraph with recorded mutation results).
- [ ] No framework or config changes needed — `frontend/jest.config.js` already covers this
  directory and this test shape.

## Security Domain

`config.json` has no `security_enforcement` key — per this repo's own instructions, absence means
enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (unchanged) | This phase touches no auth logic — Steam's own QR/credential/guard flow (`SteamLogin`'s `window.api.steam*` calls) is out of scope, unchanged. |
| V3 Session Management | No (unchanged) | Same as above. |
| V4 Access Control | Yes — but scoped narrowly | The "login-in-flight guard" is a **UI-reachability control**, not an access-control boundary in the ASVS sense (no privilege distinction is being enforced; it prevents a confusing/spoofable UI state, not unauthorized data access). Standard control: explicit state (`disabled`/`pointer-events`/`inert`), never solely CSS (CSS alone is trivially bypassable via devtools — but this app's dev console is documented elsewhere in this repo's memory as effectively inaccessible to an end user in the packaged build, and the *threat* being mitigated (T-34.4.2-39, "an unrequested second login sheet arriving mid-flow") is about accidental/timing-based double-initiation, not a malicious actor with devtools access — so CSS + JS-level guard is the correct proportional control here, matching what the existing `disabled` prop already does). |
| V5 Input Validation | No new input surface | This phase adds no new user input fields; it only changes container/presentation logic around existing ones. |
| V6 Cryptography | No | Unaffected. |

### Known Threat Patterns for this phase's stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Spoofing — an unrequested second login sheet arriving mid-flow (T-34.4.2-39) | Spoofing | Explicit `loginInFlight` state disabling all other sign-in triggers while one is active (this phase's core deliverable) |
| Denial of service — a single-flight latch that never clears (T-34.4.2-41) | Denial of Service | The `loginInFlight` state must be cleared on *every* exit path from `SteamLogin` (all 5 `navigate`/dismiss call sites — see Pitfall 3), not just the happy path, or the other 5 tiles could stay permanently disabled after an abandoned/errored Steam flow. **This is the single highest-risk implementation detail in this phase** — the equivalent Rust-side mitigation for T-34.4.2-41 (`PENDING_VISIBLE_LOGIN_WINDOW_TTL`, a 25s time-bound backstop derived from a 15s watchdog + 10s margin, `main.rs:2236`) exists precisely because a past version of this same class of guard was found capable of becoming its own permanent lock-out. The frontend equivalent should be reviewed for the same failure class: what happens if `SteamLogin` throws, or the user force-quits mid-flow and reopens — does `loginInFlight` reset on remount (yes, if it is `Login/index.tsx`'s own local `useState`, since that component only ever unmounts on a real route change elsewhere, and remounts fresh) or does it need its own explicit timeout? Recommend: since this is local component state (not persisted, not global), a fresh mount already resets it — an explicit TTL is very likely unnecessary here, unlike the Rust-side static `Mutex` state it parallels, but this should be confirmed by the planner/executor, not assumed. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A future contract *could* re-open live-discharge for T-34.4.2-39/-41 now that the UI no longer structurally forecloses it (item 5's original contract) | Where the Threat Register Lives | Low — this is offered as an option for whoever plans the threat-register update, not asserted as required or already decided. Explicitly flagged as an open question below, not a locked recommendation. |
| A2 | `loginInFlight` as local `useState` on `Login/index.tsx` resets safely on remount and needs no explicit TTL, unlike its Rust-side `T-34.4.2-41` analog | Known Threat Patterns table | Medium — if `Login/index.tsx`'s memoized component (`React.memo`) somehow persists state across what looks like a fresh navigation (it should not, given `React.memo` only memoizes render output, not unmount lifecycle — but this project's own memory has recorded a `React.memo`-adjacent stale-snapshot defect (`tauri-renderer-store-snapshot-stale.md`) before), a stuck `loginInFlight=true` could re-lock the tiles. Should be verified during planning/execution, not assumed. |
| A3 | Optional `prefers-reduced-motion` scoping to this phase's new CSS only, not a repo-wide rollout | Reduced Motion | Low — explicitly labelled optional/discretionary in that section, not a locked recommendation. |

## Open Questions (RESOLVED)

*Both questions below were resolved by the operator on 2026-08-20 and propagated into the plan
set. The original text is retained verbatim; resolutions are marked inline.*

1. **Should the threat-register update (§5 of `34.4.2-PLATFORM-SCOPE.md`) also reopen the
   live-discharge question for T-34.4.2-39/-41's original item 5 contract, now that the UI no longer
   structurally forecloses it?**
   - **RESOLVED (operator, 2026-08-20): DOCUMENTATION-ONLY — matches this file's own recommendation
     below.** Record the basis change; note factually that live discharge is no longer structurally
     impossible; do NOT author a new live-gate contract, do NOT re-instate item 5, do NOT change the
     WITHDRAWN disposition. Decided in, and carried by, `36-02-PLAN.md`'s
     `<locked_decision_documentation_only>` block, which also requires the non-goal be stated inside
     the Fourteenth update's own narrative preamble so a future reader sees it was asked and
     answered rather than overlooked.
   - What we know: the prior "WITHDRAWN, permanently" disposition was explicitly reasoned on the
     grounds that the scenario was UI-unreachable by construction (`F-34.4.2-17`). That construction
     (navigation-triggered unmount) is exactly what this phase removes.
   - What's unclear: whether re-attempting a live discharge is in scope for phase 36 at all (the
     ROADMAP.md phase description asks only to "update the threat register," not to re-run a live
     gate), or whether it should be explicitly deferred as a future item.
   - Recommendation: the planner should treat the register update as documentation-only for this
     phase (record the basis change, note that live-discharge is no longer structurally impossible,
     but do not attempt a new live gate as part of phase 36 unless the operator says otherwise) —
     this keeps the phase's own stated scope ("this phase must therefore ALSO... update the threat
     register") literal, without silently expanding it into a new live-gate authoring effort.

2. **Does `inert`'s narrow gap (macOS 12.0–12.3, pre-15.5 Safari, see Pitfall 2) need an explicit
   fallback, or is it an acceptable residual given the other two guard layers?**
   - **RESOLVED: ACCEPTABLE RESIDUAL, recorded as F-36-02 with an `accept` disposition** in
     `36-01-PLAN.md`'s threat model and entered into the register by `36-02-PLAN.md` Task 1. The
     operator first locked a cheap `tabIndex={-1}` fallback, then RETIRED that lock on 2026-08-20
     once planning disproved its premise from source: the tiles are bare `<div onClick>` with no
     `tabIndex` and no `role`, so they are already outside the tab order, and container-level
     `tabIndex={-1}` does not remove focusable descendants in any case. `aria-hidden` was also
     declined (the container holds focusable children). What actually holds on that slice is MUI's
     Dialog focus trap. The residual is therefore near-zero for the tiles, and the premise that
     makes that true is now pinned directly by a `Runner/index.tsx` assertion in `36-01-PLAN.md`
     Task 4, which goes RED if those divs ever become real buttons.
   - What we know: `disabled` and `pointer-events: none` are universally supported and remain
     effective on that OS range; only the accessibility-tree/tab-order removal half of the mitigation
     is unavailable there.
   - What's unclear: whether this repo's threat model treats "acceptable on an OS range the app
     already discourages via a warning" as suffactory, or whether ASVS V4 proportionality requires an
     explicit `aria-hidden` + manual `tabIndex=-1` fallback for that narrow range.
   - Recommendation: state this gap explicitly in the plan and let the operator decide; do not
     silently build the fallback (adds real complexity for an edge of an edge case) nor silently
     ignore it (this repo's own process lessons repeatedly flag under-verified edge-case claims as a
     recurring failure mode).

## Environment Availability

Skipped — this phase has no external tool/service/runtime dependencies beyond what is already
installed and running in every other frontend task in this repo (Node, the existing jest toolchain,
the existing `tauri:dev` dev loop for the eventual human visual gate). No new dependency, service, or
CLI is introduced.

## Sources

### Primary (HIGH confidence)
- `src/frontend/screens/Login/index.tsx` (read in full, this research session) — current tile wiring, `oldMac` derivation, `showSidLogin` precedent
- `src/frontend/screens/Login/components/Runner/index.tsx` (read in full) — `handleLogin()`/`primaryLoginAction` mechanism
- `src/frontend/screens/Login/components/SteamLogin/index.tsx` (read in full) — all 5 `navigate('/login')` call sites, `<Dialog>` mount
- `src/frontend/screens/Login/components/SIDLogin/index.tsx` (read, relevant sections) — `backdropClick` overlay-dismissal precedent
- `src/frontend/components/UI/Dialog/components/Dialog.tsx` (read in full) — `SlideUpTransition`, 500ms, focus-prop defaults, `gamepadAction` HACK
- `src/frontend/App.tsx` (read, routes section) — `loginweb/steam` (lines 236-239) and `loginweb/:runner` (line 241) route registration
- `src/frontend/screens/Login/__tests__/loginInFlightUiReachability.test.tsx` (read in full) — the mechanism documentation and falsifiability record this phase must replace
- `src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts` and `src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginWindowChrome.test.ts` (read, structure) — the source-gate convention to follow for new/rewritten tests
- `src/frontend/helpers/gamepad.ts` (read, relevant sections) — `.MuiDialog-paper`/`.MuiDialog-root` selectors, `isMuiDialogCloseButton()`, `closeDialog()`
- `.planning/phases/34.4.2-.../34.4.2-PLATFORM-SCOPE.md` §5 (read in full) — the actual threat register, its append-and-supersede convention, and the current T-34.4.2-39/-41 row
- `.planning/phases/34.4.2-.../34.4.2-VERIFICATION.md` (Truth 8, lines 216-221) — the closed-gate historical snapshot for the same threats
- `package.json` — verified `react`/`react-dom` `^18.3.1`, `react-router-dom` `^6.30.0`, `@mui/material` `^5.17.1`, no `framer-motion`/`jest-environment-jsdom`/`react-transition-group` as direct dependencies
- `.planning/config.json` — no `nyquist_validation` or `security_enforcement` keys (both treated as enabled per this repo's own default rule)

### Secondary (MEDIUM confidence)
- `.planning/phases/36-.../36-PATTERNS.md` — prior pattern-map for this phase, cross-checked against direct source reads; one claim corrected (React 18 `inert` support — see Pitfall 1)
- WebSearch: React `inert` boolean-attribute support timeline — cross-referenced facebook/react PR #24730 and the React 19 upgrade guide's own changelog entry
- WebSearch: WebKit `inert` attribute support (Safari 15.5, May 2022) — cross-referenced against WebKit's own official blog post "New WebKit Features in Safari 15.5"
- WebSearch: WebKit View Transitions API support (Safari 18.0, September 2024) — cross-referenced against WebKit's own official blog posts ("WebKit Features in Safari 18.0," WWDC24 coverage)
- WebSearch: MUI `Modal`/`Dialog` default focus-trap behavior (`disableAutoFocus`/`disableEnforceFocus`/`disableRestoreFocus`, all default `false`) — cross-referenced against MUI's own documented prop table

### Tertiary (LOW confidence)
- None — every claim above was either read directly from this repository's source, or verified against an official upstream source (WebKit's own blog, React's own PR/changelog, MUI's own documented API).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; every claim verified against `package.json` directly.
- Architecture (overlay-not-navigation, CSS-only crossfade): HIGH — grounded in direct reads of the exact files being changed, plus one existing precedent (`showSidLogin`) in the same file that already does the pattern being recommended.
- WKWebView platform-support claims (`inert`, View Transitions API): HIGH — both cross-checked against WebKit's own official blog, not third-party summaries alone.
- Threat register location and update mechanism: HIGH — the register was read in full, its append-and-supersede convention directly observed across 13 prior updates, not inferred.
- Focus management: HIGH for MUI's default behavior (officially documented); MEDIUM for the specific claim that `loginInFlight` needs no separate focus handling beyond MUI's defaults — this is a reasoned inference from the defaults, not something this research could exercise live (no jsdom in this project's test setup, and no live browser session available in this research pass).
- Reduced motion: HIGH for "does not exist today" (direct grep, zero matches); the optional addition is explicitly flagged as discretionary, not a confidence claim.

**Research date:** 2026-08-20
**Valid until:** 30 days (stable domain — no fast-moving dependency; the one time-sensitive claim, WebKit's View Transitions support, is version-gated to a shipped Safari release and will not regress, only potentially expand further, which does not change this phase's recommendation to avoid it given the app's macOS 12 floor).
