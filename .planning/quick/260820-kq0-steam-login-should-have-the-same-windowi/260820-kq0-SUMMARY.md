---
phase: quick-260820-kq0
plan: 01
subsystem: frontend-login
tags: [steam, login, dialog, ui]
dependency-graph:
  requires: []
  provides: [SteamLogin-shared-Dialog-window-shell]
  affects: [src/frontend/screens/Login/components/SteamLogin/index.tsx, src/frontend/screens/Login/components/SteamLogin/index.scss]
tech-stack:
  added: []
  patterns: [shared-UI-Dialog-primitive-for-in-app-modal-windows]
key-files:
  created:
    - src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginWindowChrome.test.ts
  modified:
    - src/frontend/screens/Login/components/SteamLogin/index.tsx
    - src/frontend/screens/Login/components/SteamLogin/index.scss
decisions:
  - "User explicitly chose the in-app modal Dialog reading of 'same windowing as Humble' over a native child window, ratifying the plan as written."
metrics:
  duration: "~40m (autonomous tasks only; human gate outstanding)"
  completed: "2026-08-20 (Tasks 1-2 only; Task 3 gate NOT yet run)"
---

# Phase quick-260820-kq0 Plan 01: Steam login window chrome Summary

Steam's sign-in surface now renders inside the app's shared `frontend/components/UI/Dialog`
modal primitive (centred, backdropped, titled, closable) instead of the old bare
`.steamLoginPanel` box pinned flush to the top-left of the content area — the same in-app
windowing pattern Humble/GOG/Amazon/WineManager already use.

## Status: AUTONOMOUS TASKS COMPLETE (2/2) — TASK 3 BLOCKING HUMAN GATE OUTSTANDING

This plan is `autonomous: false` with a final `checkpoint:human-verify` gate. Per the executor's
constraints, that gate was **not self-certified**. Do not treat this plan as done until a human
runs the verification steps below and reports a verdict.

## What Was Built

### Task 1 — Render SteamLogin inside the shared Dialog window shell (commit `fdc362444`)

`SteamLogin` was restructured from three separate top-level early returns (each wrapping its own
`<div className="steamLoginPanel">`) into a single top-level return:

```tsx
return (
  <Dialog showCloseButton={true} onClose={closeWindow} className="steamLoginDialog">
    <DialogHeader onClose={closeWindow}>Sign in to Steam</DialogHeader>
    <div className="steamLoginBody">{renderWindowBody()}</div>
  </Dialog>
)
```

`renderWindowBody()` selects the `not-installed`, `checking`, or main-tabs content based on
`step`, but the `Dialog` itself is mounted once and never re-created as `step` changes — this
preserves the Dialog primitive's one-time 500ms entrance transition and `gamepadAction` focus
hack (Dialog.tsx:46-53) instead of replaying them on every step transition.

A single `closeWindow = () => navigate('/login')` handler now backs every dismissal path:
`Dialog`'s `onClose`, `DialogHeader`'s `onClose`, and the not-installed branch's "Return to
Login" button. The main branch's redundant `<h1>Sign in to Steam</h1>` heading and "Back to
Login" button were deleted — the dialog's own header title and close (X) control replace both,
per the plan (leaving them would have given the window two competing titles and two competing
close affordances).

`.steamLoginPanel` was retired from `index.scss` (the dialog paper now supplies background,
radius, padding) and replaced with `.steamLoginBody` carrying only `display: flex`,
`flex-direction: column`, `gap: var(--space-md)`, `width: min(480px, 95%)`.

Zero changes to `window.api.steam*` calls, their arguments, or ordering. Zero changes to
`Login/index.tsx`, `Runner/index.tsx`, or `App.tsx` — confirmed via
`git diff --stat` against all three (0 lines).

**Verification run:**
- `pnpm codecheck` (`tsc --noEmit`): clean, 0 errors.
- `pnpm exec eslint src/frontend/screens/Login/components/SteamLogin`: 0 errors, 3 pre-existing
  warnings unrelated to this change (an `import-x/no-named-as-default` warning on the
  unmodified `QRCode` import, and two `@typescript-eslint/no-floating-promises` warnings on
  unmodified `useEffect` bodies at lines 169 and 195).
- `grep -c steamLoginPanel` over both `index.tsx` and `index.scss`: 0 for both.
- Exactly one top-level `return (` in the component; exactly one `<Dialog` occurrence.

### Task 2 — Source gate pinning the single-window shell, RED-proven (commit `7eb8264df`)

Created `src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginWindowChrome.test.ts`,
following the established comment-stripped source-gate convention
(`stripSourceComments` from `backend/testUtils/stripSourceComments`, matching the style of
`loginInFlightUiReachability.test.tsx`). This project's jest config is `testEnvironment: 'node'`
(no DOM), so this is explicitly a source-shape gate, not a render test.

Six assertions, each labelled PRESENCE or ABSENCE in the file itself:
1. FILLED-specimen guard (raw, unstripped `index.tsx` contains `Dialog`).
2. PRESENCE — imports `Dialog`/`DialogHeader` from the UI barrel.
3. PRESENCE + uniqueness — exactly one `<Dialog` element.
4. PRESENCE — `showCloseButton={true}`, `onClose={closeWindow}`, and the `closeWindow` definition.
5. ABSENCE — zero `steamLoginPanel` occurrences in both `index.tsx` and `index.scss`.
6. PRESENCE — `function renderWindowBody()` declared, `renderWindowBody(` appears exactly twice.

**Verification run:**
- `pnpm test .../steamLoginWindowChrome.test.ts .../loginInFlightUiReachability.test.tsx .../navTabs.test.ts`:
  3 suites passed, 42/42 tests passed.

#### RED-proof record (mandatory falsifiability, per assertion)

All three mutations below were applied to `src/frontend/screens/Login/components/SteamLogin/index.tsx`
with `sed`, run against the new test file, confirmed to produce exactly the predicted failure,
then reverted and confirmed clean via `git diff --quiet` before the next mutation began.

**Mutation A — duplicate the `<Dialog` element** (targets assertion 3, uniqueness):
```
sed -i.bak 's|<Dialog showCloseButton={true} onClose={closeWindow} className="steamLoginDialog">|<Dialog showCloseButton={true} onClose={closeWindow} className="steamLoginDialog">\n      <Dialog showCloseButton={true} onClose={closeWindow}>|' index.tsx
```
Observed failure:
```
✕ SOURCE GATE (PRESENCE + uniqueness) -- the window is mounted exactly once...
  expect(received).toBe(expected)
  Expected: 1
  Received: 2
```
1 failed / 5 passed. Reverted; `git diff --quiet` clean.

**Mutation B — rename `.steamLoginBody` back to `.steamLoginPanel`** (targets assertion 5,
absence):
```
sed -i.bak 's/steamLoginBody/steamLoginPanel/' index.tsx
```
Observed failure:
```
✕ SOURCE GATE (ABSENCE) -- the old bare, unadorned panel root is gone...
  expect(received).toBe(expected)
  Expected: 0
  Received: 1
```
1 failed / 5 passed. Reverted; `git diff --quiet` clean.

**Mutation C — replace `onClose={closeWindow}` with an inline arrow** (targets assertion 4,
presence):
```
sed -i.bak "s/onClose={closeWindow}/onClose={() => navigate('\/login')}/g" index.tsx
```
Observed failure:
```
✕ SOURCE GATE (PRESENCE) -- the dialog is dismissible via a single closeWindow handler...
  expect(source).toMatch(/onClose=\{closeWindow\}/)
```
1 failed / 5 passed. Reverted; `git diff --quiet` clean.

All three mutations independently proved their target assertion RED and left every other
assertion GREEN (proving the assertions are not accidentally redundant with each other), then
were cleanly reverted before the file was committed.

## Native-login-window route: investigated and rejected (do not re-litigate)

Before this plan was authored, the planner investigated routing Steam's sign-in through Humble's
native login-window mechanism (the `"humble_login_open"` arm in `src-tauri/src/main.rs:3534`) as
an alternative reading of "same windowing as Humble." This was rejected as **structurally
blocked**, not merely inconvenient:

- Steam authenticates entirely in-process via `steam-session`, behind `window.api.steamStartQR` /
  `steamStartCredentials` / `steamSubmitGuard` / `steamPollCredential` — there is no URL to load
  into a native login webview in the first place.
- Login windows are deliberately excluded from the Tauri capability scope
  (`capabilities/default.json`'s `windows: ["main"]` array, `src-tauri/src/main.rs:967`,
  `:5624`). A login window has NO `window.api` / `invoke` access at all, so the Steam form could
  not make a single one of its five backend calls from inside one.
- Widening that capability scope to accommodate a presentation change would be a security
  regression and was explicitly out of scope.

The user was shown this finding directly and **explicitly chose the in-app modal Dialog
reading** (option a) over a real native child window driven over the LOGIN_WINDOW_EVENTS seam
(option b). This plan was executed exactly as written under that decision. A future reader
should not re-open this question — it was investigated, presented to the user, and settled.

## Deviations from Plan

None — plan executed exactly as written. Both autonomous tasks matched the plan's `<action>`
blocks precisely, including the specific line-level restructuring in finding 4 and the exact
CSS rule replacement in Task 1(e).

## Known Stubs

None. No hardcoded empty values, placeholder text, or unwired data sources were introduced.

## Threat Flags

None — no new network endpoints, auth paths, file-access patterns, or schema changes at trust
boundaries were introduced. All three threats in the plan's threat model (T-KQ0-01 spoofing,
T-KQ0-02 information disclosure, T-KQ0-03 elevation of privilege) are dispositioned in the plan
itself and nothing here contradicts those dispositions.

## OUTSTANDING: Task 3 — Human visual confirmation (BLOCKING, NOT YET RUN)

This is a `checkpoint:human-verify` gate with `gate="blocking"`. It has **not been run**. No
verdict has been recorded. The plan cannot be considered complete until a human runs the
following steps and reports a verdict.

**What was built:** The Steam sign-in surface now renders inside the app's shared modal window
primitive (`frontend/components/UI/Dialog`) — centred, backdropped, titled, with a close control
— instead of the bare `.steamLoginPanel` box. Routing, tile behaviour and every Steam auth call
are unchanged. A source gate pins the single-window shape; it cannot see what actually renders,
which is why this step exists.

**How to verify (verbatim from the plan):**

Run `pnpm tauri:dev` (NOT `tauri dev` — that serves a stale static bundle).

1. Navigate to the Login screen. Click the **Humble Bundle Login** tile and note how its sign-in
   window presents: where it sits relative to the app, whether the app behind it is dimmed.
   Dismiss it and return to `/login`.
2. Click the **Steam Login** tile. CONFIRM, naming each property directly rather than by
   landmark:
   a. The Steam panel is HORIZONTALLY AND VERTICALLY CENTRED in the app window (not flush to the
      top-left of the content area as before).
   b. The rest of the app behind it is DIMMED by a backdrop that covers the full viewport.
   c. A header reading `Sign in to Steam` is present, with a close (X) control at its top-right.
   d. There is exactly ONE title and exactly ONE close affordance — no leftover `<h1>` and no
      leftover "Back to Login" button.
3. Switch between the **QR Code** and **Username & Password** tabs. CONFIRM the window does NOT
   flash, re-slide-in, or re-centre on the tab switch, and that the QR code and both form fields
   are fully visible and legible inside the panel (not clipped by the dialog's `max-height: 95vh`
   / `overflow: auto`).
4. Dismiss the window three ways in turn, re-opening from the Steam tile each time: the header X,
   the Escape key, and a click on the dimmed backdrop. CONFIRM each returns you to the Login
   screen with all six tiles present.
5. Complete a real Steam sign-in (QR or credentials). CONFIRM the window closes on success and
   the Steam tile shows `Connected`.

If the Steam tile already shows `Connected`, log out from it first so the sign-in path is
actually reachable.

**Resume signal:** Type "approved", or describe which of 2a-2d / 3 / 4 / 5 failed and what you
saw instead.

## Self-Check: PASSED

- FOUND: `src/frontend/screens/Login/components/SteamLogin/index.tsx`
- FOUND: `src/frontend/screens/Login/components/SteamLogin/index.scss`
- FOUND: `src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginWindowChrome.test.ts`
- FOUND commit `fdc362444` (Task 1) in `git log --oneline --all`
- FOUND commit `7eb8264df` (Task 2) in `git log --oneline --all`
