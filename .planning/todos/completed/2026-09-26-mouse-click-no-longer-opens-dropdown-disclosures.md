---
created: 2026-09-26
title: 'Mouse clicks no longer open Dropdown disclosures on Windows — the Steam install caret AND the library nav expanders are both dead to the mouse while the gamepad opens them normally'
found_during: Phase 38 sitting 5 (quick 260926-a1l), while opening the install dialog for 38-S14
severity: major
platform: windows
ready: live-gate
area: ui-dropdown
files:
  - src/frontend/components/UI/Dropdown/index.tsx
  - src/frontend/screens/Game/GamePage/components/MainButton.tsx
---

## What was observed

Windows 11, `pnpm tauri:dev` debug build, commit `59df4c1b6`.

1. The `MainButton` Steam install **caret did not respond to mouse clicks.** Asked to distinguish
   three outcomes — chevron rotates + panel appears / chevron rotates + no panel / chevron does not
   move — the operator reported **C: the chevron never moved.** The chevron is rotated `-90deg`
   while `aria-expanded='false'` (`GamePage/index.css:370-374`), so a chevron that never moves
   means `setIsExpanded` never committed.
2. Separately and more seriously, the operator then found **the library nav expanders were also
   mouse-dead** — "library nav menu is now unresponsive, cant open store to select epic... not of
   the expantion controls working" — and that **the gamepad opened them normally.**

The mouse-dead / gamepad-live split is the signature. Both surfaces are built on the same
`Dropdown` primitive (`NavShell` tier-2 filter dropdowns and `GamePage`'s `MainButton` are its only
two consumers, per that file's own `useSuppressStoreEmbedWhile` comment), which is why a single
cause is plausible for both.

## Why this is a regression and not the known defect

`.planning/debug/resolved/steam-caret-dropdown-dead.md` is the *resolved* session for exactly this
symptom on this platform. Its root cause was a React batching self-cancellation in
`Dropdown.toggle()`; the fix (`3a0e62918`, 2026-09-24) replaced the functional updater with a plain
value, and that session's `verification` field records it **VERIFIED LIVE over CDP on this same
Windows machine on 2026-09-24** — one `Input.dispatchMouseEvent` click produced
`MUT aria-expanded -> true, class dropdown expanded`.

The fix is still in HEAD (`git merge-base --is-ancestor 3a0e62918 HEAD` passes, and the
plain-value `const next = !isExpanded` with its explanatory comment is present in the source). So
either the fix regressed behaviourally without being reverted, or a second, independent cause has
appeared since. **Sitting 5 cannot tell those apart**, and the gamepad-works detail is new
information that session never had.

## Two candidate mechanisms, neither established

1. **A second self-cancellation, via `onBlur` rather than `onFocus`.** `toggle()` dispatches
   `window.api.gamepadAction({action:'tab'})` *before* `setIsExpanded(next)`. If `doTab` now lands
   focus **outside** the container, the container's `onBlur` (`Dropdown/index.tsx:62-66`) fires
   `setIsExpanded(false)` in the same batch and the panel never opens. The gamepad focus collector
   was modified repeatedly between 2026-09-24 and 2026-09-25 (quicks `260925-9de`, `-ms5`, `-m5i`,
   `-qe5`), i.e. **after** the caret was verified — so where `doTab` lands may have changed.
   This also explains why the gamepad path still works: it focuses the panel directly and never
   goes through `toggle()`.
2. **The click never reaches the handler** (hit-testing, or something painted over the control).

Ruled out at the desk: `0475e74bd` (stale-focus-ring suppression) is CSS-only and scoped to
`.gameList`/`.gameListLayout` game cards, so it cannot reach `NavShell` or `MainButton`. The
`260925-op0`/`260925-r8j` GAMEPAD-ACT probe round trip left no residue in
`src/preload/api/tauriGamepadInput.ts`.

`severity: major` — two primary navigation surfaces are unusable by mouse on Windows.

`ready: live-gate` — the resolved session's own record is explicit that desk reproduction in
Chromium **cannot** settle WebView2 behaviour ("Further desk probing of this shape has hit its
limit"), and that live CDP on the operator's machine is what resolved it last time.

## Recommended next step

Open a `/gsd-debug` session rather than patching from this todo. The prior session's working recipe
is reusable verbatim: launch `pnpm tauri:dev` with
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`, attach over CDP, install a
MutationObserver on the trigger's `aria-expanded`, wrap `window.api.gamepadAction`, and dispatch a
real `Input.dispatchMouseEvent` at the control's centre. The discriminating observation is whether
a `focusout` with `inside=false` arrives between the click and the state commit — that separates
candidate 1 from candidate 2 in a single capture.

A cheap pre-step the operator can run first: **Tab to the caret and press Enter.** If it opens by
keyboard but not by mouse, candidate 2 is live; if it is dead both ways, candidate 1 is.

## Verification (once fixed)

On Windows, with a mouse only: one click on the `MainButton` Steam install caret opens the
"Install with options…" panel, and one click on a library nav tier-2 filter group expands it.
Re-run the existing `dropdownDisclosure.test.tsx` suite, and add a case for whichever focus
condition turns out to be responsible — the existing suite passes today and did not catch this.

## Resolution (2026-09-26, /gsd-debug mouse-dead-dropdown-disclosure)

**Not a regression.** Sitting 5 ran a stale installed shell (`%LOCALAPPDATA%\GameLib\gamelib-shell.exe`,
built 2026-09-24 07:34). Its embedded frontend predates `3a0e62918` and still has the
`prev => !prev` updater, and the single-instance guard makes `pnpm tauri:dev` hand off to it and
exit. Measured live over CDP. On the stale build the NavShell Store group is dead and its bundle
shows the pre-fix code. At HEAD under `pnpm tauri:dev`, the Store group and the GamePage caret
(752590) each open on one click. No code change. See
`.planning/debug/resolved/mouse-dead-dropdown-disclosure.md`, and the follow-up
`.planning/todos/pending/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md`.
