---
phase: quick-261008-fjj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Login/components/Runner/index.tsx
  - src/frontend/screens/Login/components/Runner/index.css
  - src/frontend/screens/Login/components/Runner/__tests__/index.test.tsx
  - src/frontend/screens/Login/__tests__/loginInFlightUiReachability.test.tsx
  - src/frontend/screens/Login/index.tsx
  - .planning/phases/34.4.2-macos-login-window-ux-modal-child-window-attachment-in-field/34.4.2-PLATFORM-SCOPE.md
  - .planning/todos/pending/2026-10-03-runner-tile-busy-spinner-has-no-assistive-technology-exposure.md
autonomous: true
requirements:
  - QUICK-261008-fjj

estimate:
  tokens: 30000
  raw_tokens: 30000
  tasks: 2
  confidence: medium

must_haves:
  truths:
    - Every clickable Runner tile (primary login, alternative login, logout) is a real interactive element -- `role="button"`, in the tab order when enabled, activatable by Enter and Space.
    - A disabled tile (`disabled={oldMac || loginInFlight}`) leaves the tab order (`tabIndex={-1}`) and carries `aria-disabled="true"`; its handler guard (`if (props.disabled) return`) is untouched and still runs first.
    - The busy tile carries `aria-busy="true"` on the tile root while `busy` is true; the spinner itself stays `aria-hidden`.
    - Keyboard focus on a tile is visible (`:focus-visible` outline in `--accent`).
    - No new user-facing strings (zero l10n churn).
    - The two source gates that pinned "tiles are bare untabbable divs" are re-derived, not deleted -- they now pin the NEW guard shape, and F-36-02's residual is re-derived in the register.
  artifacts:
    - src/frontend/screens/Login/components/Runner/index.tsx
    - src/frontend/screens/Login/components/Runner/__tests__/index.test.tsx
    - src/frontend/screens/Login/__tests__/loginInFlightUiReachability.test.tsx
  key_links:
    - from: src/frontend/screens/Login/index.tsx
      to: src/frontend/screens/Login/components/Runner/index.tsx
      via: "`disabled={oldMac || loginInFlight}` now also drives tabIndex -1 / aria-disabled; `busy={openOverlay === '<id>'}` now also drives aria-busy"
---

# Quick Task 261008-fjj: Runner tiles -- real interactive semantics + AT-visible busy/disabled state

Closes todo `2026-10-03-runner-tile-busy-spinner-has-no-assistive-technology-exposure.md`.

## Finding that bounds this task (state it, do not paper over it)

`busy` is true only when `openOverlay === '<id>'`, which is exactly when `loginInFlight` is true,
which is exactly when `.loginContentWrapper` carries `inert`. On WebKit >= Safari 15.5 (macOS
12.4+) an inert subtree is removed from the accessibility tree, so **the tile's `aria-busy` is
AX-dark for the whole time it is set, by construction** -- the todo's "AT perceives mid-login via
the tile" cannot be delivered on the tile. What this task DOES deliver:

1. Keyboard-only users can reach and activate the tiles at all (they could not before -- a strictly
   larger gap than the spinner one, and the precondition the todo itself names).
2. The correct declarative semantics (`aria-busy`, `aria-disabled`) so the state IS exposed wherever
   `inert` is not honoured (the macOS 12.0-12.3 slice F-36-02 names) and the day the wrapper's
   `inert` is ever lifted.
3. The AT-perceivable "mid-login" state remains the overlay OUTSIDE the inert wrapper -- Steam's
   Dialog, and for OAuth runners the native login window; the post-window "finalizing" gap is the
   dead-UI gap two other quick tasks already exist to fill, not this one.

Plan 36-01 anticipated this conversion verbatim: the focusability-premise gate "goes RED the day
someone converts the tiles to real buttons -- which is exactly when the residual-risk statement in
the threat register would need re-deriving." So: convert, re-derive, re-pin.

## F-36-02 re-derivation (macOS 12.0-12.3, no `inert`)

Before: tiles unreachable by keyboard because they were bare divs. After: a tile is in the tab order
only while `!props.disabled`; during a login in flight every tile is disabled, so `tabIndex={-1}`
removes all six from the tab order AND `handleLogin()`'s first statement returns on `props.disabled`
(gate already pinned). Residual on that slice therefore stays near-zero, now by two explicit layers
instead of by accident of markup.

<task type="auto">
  <name>Task 1: Runner tiles become buttons; busy/disabled become ARIA state</name>
  <files>src/frontend/screens/Login/components/Runner/index.tsx, src/frontend/screens/Login/components/Runner/index.css, src/frontend/screens/Login/index.tsx</files>
  <action>
In `Runner/index.tsx` add a small `tileA11yProps(onActivate)` helper returning `role="button"`,
`tabIndex={props.disabled ? -1 : 0}`, `aria-disabled={props.disabled ? 'true' : undefined}`, and an
`onKeyDown` that calls `onActivate()` on Enter / Space (preventDefault on Space so the page does not
scroll). Spread it onto the three clickable `.runnerLogin` divs (primary, logout, alternative). On the
primary tile add `aria-busy={props.busy ? 'true' : undefined}`. Spinner stays `aria-hidden="true"`.
Update the `busy` prop comment: it is no longer "purely visual".

In `Runner/index.css` add a `.runnerWrapper .runnerLogin:focus-visible` rule: `outline: 2px solid
var(--accent); outline-offset: -2px` (`--accent`, never `--border-color`, which is invisible in 10 of
13 themes). Do not touch the deprecated wrapper outline.

In `Login/index.tsx` rewrite the inert comment's "No `tabIndex` here -- the tiles are bare `<div
onClick>`" sentence: the tiles are now `role="button"` with `tabIndex` that drops to -1 while
disabled; `inert` covers them on Safari >= 15.5 and the disabled-driven tabIndex + handler guard
cover the slice below. Still no container `tabIndex`, still no `aria-hidden`.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/Login/components/Runner && npx tsc --noEmit -p src/frontend 2>/dev/null || npm run codecheck</automated>
    <automated>npx prettier --check src/frontend/screens/Login/components/Runner/index.tsx src/frontend/screens/Login/components/Runner/index.css src/frontend/screens/Login/index.tsx</automated>
  </verify>
  <done>Three tiles carry role/tabIndex/aria-disabled/onKeyDown; primary carries aria-busy; focus ring rule present; no new strings.</done>
</task>

<task type="auto">
  <name>Task 2: Re-derive the two source gates and the register entry; close the todo</name>
  <files>src/frontend/screens/Login/components/Runner/__tests__/index.test.tsx, src/frontend/screens/Login/__tests__/loginInFlightUiReachability.test.tsx, .planning/phases/34.4.2-macos-login-window-ux-modal-child-window-attachment-in-field/34.4.2-PLATFORM-SCOPE.md, .planning/todos/pending/2026-10-03-runner-tile-busy-spinner-has-no-assistive-technology-exposure.md</files>
  <action>
`Runner/__tests__/index.test.tsx`: replace the ABSENCE source gate (zero tabIndex) with element-tree
assertions: primary tile has role button, tabIndex 0 when enabled / -1 when disabled, aria-disabled
only when disabled, aria-busy 'true' only when busy and only on the not-logged-in branch, Enter and
Space keydown invoke the same action as click (and respect the disabled guard), an unrelated key does
not. Same role/tabIndex shape on the alternative and logout tiles.

`loginInFlightUiReachability.test.tsx`: rewrite the focusability-premise assertion to pin the NEW
shape -- `tabIndex={props.disabled ? -1 : 0}` literal present, `role="button"` present, still zero
`<button`/`<a ` (we did not change element type) -- with a "Breaks if:" that re-derives F-36-02. Leave
the `Login/index.tsx` no-tabIndex/no-aria-hidden absence assertion exactly as is. Update the header
paragraph that calls the tiles untabbable.

Register: append a "Fifteenth update" for F-36-02 only (append-and-supersede; one short table row).

Todo: add `status:` line, move to `.planning/todos/completed/`.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/Login</automated>
    <automated>npx prettier --check src/frontend/screens/Login/components/Runner/__tests__/index.test.tsx src/frontend/screens/Login/__tests__/loginInFlightUiReachability.test.tsx</automated>
    <automated>pnpm planning-gates</automated>
  </verify>
  <done>Login jest project green; both gates pin the new shape; register carries the F-36-02 re-derivation; todo in completed/.</done>
</task>

## Not done here, stated plainly

A live VoiceOver / Accessibility Inspector probe (the todo's own verification bar) was not run.
Given the inert finding above, the probe's expected result on a current macOS is "tile not in the
AX tree while busy" -- the semantics added here are correct but masked; the probe would confirm the
mask, not the fix.
