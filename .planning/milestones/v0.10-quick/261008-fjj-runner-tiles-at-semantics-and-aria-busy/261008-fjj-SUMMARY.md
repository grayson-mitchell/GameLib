---
status: complete
quick_task: 261008-fjj
title: Runner tiles get button semantics; busy/disabled become declared ARIA state
one_liner: The six Accounts-screen login tiles stopped being bare `<div onClick>`s -- role="button", disabled-keyed tabIndex, aria-disabled, aria-busy, Enter/Space activation and a focus ring -- and the two source gates that pinned the old "untabbable divs" premise were re-derived rather than deleted, with F-36-02 re-stated in the register.
date: 2026-10-08
tags: [frontend, login, accessibility, a11y, source-gate, threat-register]
dependency_graph:
  requires: [261003-u48]
  provides: [runner-tile-button-semantics, aria-busy-on-tile]
  affects: [src/frontend/screens/Login/components/Runner, src/frontend/screens/Login/index.tsx, src/frontend/screens/Login/__tests__/loginInFlightUiReachability.test.tsx]
key_files:
  modified:
    - src/frontend/screens/Login/components/Runner/index.tsx
    - src/frontend/screens/Login/components/Runner/index.css
    - src/frontend/screens/Login/components/Runner/__tests__/index.test.tsx
    - src/frontend/screens/Login/__tests__/loginInFlightUiReachability.test.tsx
    - src/frontend/screens/Login/index.tsx
    - .planning/phases/34.4.2-macos-login-window-ux-modal-child-window-attachment-in-field/34.4.2-PLATFORM-SCOPE.md
  moved:
    - .planning/todos/pending/2026-10-03-runner-tile-busy-spinner-has-no-assistive-technology-exposure.md -> .planning/todos/completed/
commits:
  - 9b3975bd8 fix(a11y): give Accounts-screen Runner tiles button semantics and declare busy/disabled state
---

## What changed

`Runner/index.tsx` gained a `tileA11yProps(disabled, onActivate)` helper spread onto the three
clickable `.runnerLogin` divs (primary login, alternative login, logout): `role="button"`,
`tabIndex: disabled ? -1 : 0`, `aria-disabled="true"` while disabled, and an `onKeyDown` that
activates on Enter/Space (prevented, so Space cannot scroll) through the *same* handler click uses --
so `handleLogin()`'s `props.disabled` early-return guards keyboard exactly as it guards mouse. The
primary tile additionally carries `aria-busy="true"` while `busy`. The spinner stays `aria-hidden`.
`index.css` adds a `:focus-visible` ring in `--accent` (inset, no reflow). No new strings.

The elements stayed `<div>`s deliberately: the CSS cascade and both suites key on `.runnerLogin`
being a div, and a `<button>` would have changed default styling across all six tiles.

## The gates this collided with, and how they were handled

Two source gates pinned "Runner has zero `tabIndex`, zero `<button`, zero `<a `" -- one in
`Runner/__tests__/index.test.tsx`, one in `loginInFlightUiReachability.test.tsx`. The second was
**load-bearing for F-36-02** (the `inert` platform-floor finding): plan 36-01 dropped the operator's
container `tabIndex={-1}` lock on the stated premise that the tiles were never focusable, and wrote
that the gate "goes RED the day someone converts the tiles to real buttons -- which is exactly when
the residual-risk statement in the threat register would need re-deriving."

Re-derived, not deleted:

- `loginInFlightUiReachability.test.tsx`: the assertion now pins PRESENCE+ABSENCE -- exactly one
  distinct `tabIndex` token in stripped Runner source, literally `tabIndex: disabled ? -1 : 0`;
  `role: 'button'` present; still zero `<button`/`<a `. The `Login/index.tsx` no-tabIndex /
  no-aria-hidden absence assertion is untouched.
- `Runner/__tests__/index.test.tsx`: the absence gate became 11 element-tree assertions (role,
  tabIndex 0 vs -1, aria-disabled, aria-busy on/off and not on the logout branch, Enter, Space,
  unrelated key, disabled-guard-on-keyboard, alternative + logout activation, spinner still hidden)
  plus a narrowed source gate (still no `<button`/`<a `).
- `34.4.2-PLATFORM-SCOPE.md`: Fifteenth update appended for F-36-02 only. Residual stays near-zero,
  now by two explicit layers (disabled-keyed `tabIndex` + the pinned handler guard) instead of by
  accident of markup.

## Verification

- `npx jest src/frontend/screens/Login` -- 159 passed, 11 suites.
- Mutation proof: `tabIndex: disabled ? -1 : 0` -> `tabIndex: 0` turned exactly one assertion RED
  (the disabled-arm test); file restored and SHA-256 matched the pre-mutation snapshot.
- `npx tsc --noEmit -p tsconfig.json` clean; `npx prettier --check` clean over all five source paths;
  eslint on the touched files reports only pre-existing warnings (the `props.icon()` any-call, the
  pre-existing floating `handleLogout()` promise which the keyboard arm mirrors in kind).
- `pnpm planning-gates` 12/12.

## Stated limit (do not reopen the todo expecting more)

`busy` is only ever true while `loginInFlight` is true, which is exactly when `.loginContentWrapper`
is `inert`. On WebKit >= Safari 15.5 an inert subtree is removed from the accessibility tree, so the
tile's `aria-busy` is correct but **masked for the whole time it is set**. It is exposed on the
macOS 12.0-12.3 slice (no `inert`) and the day the wrapper's `inert` is lifted. The AT-perceivable
"a sign-in is in progress" state on a current macOS is the overlay OUTSIDE the inert wrapper
(Steam's Dialog; the native login window for OAuth runners). The post-window "finalizing" gap --
where `OAuthLogin` renders null and the whole screen is inert -- is the dead-UI gap two other quick
tasks already exist to fill; not this task's.

**Not run:** the todo's own verification bar, a live VoiceOver / Accessibility Inspector probe.
Given the above, its expected result is "tile absent from the AX tree while busy" -- it would confirm
the mask, not refute the fix. The keyboard-reachability half (the strictly larger gap this task
actually closes) has no such mask and is exactly what the element-tree assertions cover, short of a
real focus-order probe.

## Deviations from the plan

None. Executed inline (no planner/executor subagents) -- two source files plus tests, well inside
the `/gsd-fast` ≤3-file envelope; artifacts (PLAN, SUMMARY, STATE row, atomic code commit) produced
as the quick workflow requires.
