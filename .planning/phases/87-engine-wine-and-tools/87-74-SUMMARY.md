---
phase: 87-engine-wine-and-tools
plan: 74
subsystem: ui
tags: [uninstall-modal, show-in-steam, switch-row, focus, rf3, trace]
requires:
  - phase: 87-engine-wine-and-tools
    provides: "87-71 (RERUN-1 findings RF1-RF6) and 87-69 (the re-run 1 evidence for RF3)"
provides:
  - "RF3 traced hop by hop: every static path from the uninstall dialog to window.api.removeFromSteam is ruled out, and the one reachable class (a second activation that lands on the Show in Steam row after the dialog is gone) is named"
  - "No code change and no test at the halt: the plan's own stop rule fired (Task 1 prohibition: never guess a fix)"
  - "Completed 2026-11-26 through debug session rf3-cancel-removes-shortcut: a jsdom regression for every close path, Show in Steam activation-provenance logging, and two SwitchRow guards (held-key repeat; pointer click within 500 ms of a dialog close), each red before green"
affects: [87-79, 87-RERUN-2-HUMAN-UAT item 6]
actuals:
  tokens: 0
  tasks: 2
  commits: 6
plan_head_before: 90dc2c918ed579d0247f49d125f34d8e71cb2adc
plan_head_after: 149b6cc265e4e68b5a4ad44074140894b3382313
tech-stack:
  added: []
  patterns:
    - "A Dialog stamps its close (dialogCloseClock); a SwitchRow ignores a pointer click (detail >= 1) within 500 ms of it and logs the drop; gamepad clicks (detail 0) and fresh keys still act"
key-files:
  created:
    - src/frontend/components/UI/Dialog/dialogCloseClock.ts
    - src/frontend/components/UI/Dialog/__tests__/dialogCloseClock.test.tsx
    - src/frontend/screens/Game/GamePage/actions/rowActivation.ts
    - src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/uninstallCancelKeepsSteamShortcut.test.tsx
  modified:
    - src/frontend/components/UI/Dialog/components/Dialog.tsx
    - src/frontend/screens/Game/GamePage/actions/useSteamShortcut.ts
    - src/frontend/screens/Game/GamePage/components/InstallTab/SwitchRow.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts
    - src/frontend/screens/Game/GamePage/__tests__/longRunningCallSiteGuard.test.ts
key-decisions:
  - "Stopped at Task 1 without a code change: reading names no deterministic path from a dialog close to removeFromSteam, and the plan forbids guessing a fix"
  - "2026-11-26, user decision after a live probe that did not reproduce: log and harden rather than leave T-87-143 open. The cut is in SwitchRow, not Dialog: one row is the proven sink, and a document-level swallower would touch every Dialog consumer"
requirements-completed: [SVC-02]
coverage:
  - id: D1
    description: "The RF3 event chain traced with file:line per hop, or the hops ruled out"
    requirement: SVC-02
    verification:
      - ".planning/debug/resolved/rf3-cancel-removes-shortcut.md (H1-H4 eliminated; live probe, 11 Cancels, no second event)"
    human_judgment: true
    rationale: "Every hop is ruled out or named; the re-run 1 activation stays unproven because it did not reproduce live"
  - id: D2
    description: "Cancel and every other close path of the uninstall dialog change nothing (regression test)"
    requirement: SVC-02
    verification:
      - "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/uninstallCancelKeepsSteamShortcut.test.tsx"
      - "src/frontend/components/UI/Dialog/__tests__/dialogCloseClock.test.tsx"
    human_judgment: false
    rationale: "Close paths (No, header close, Escape, backdrop) leave removeFromSteam, addToSteam and uninstall uncalled; the held-key and click-after-No cases failed at the parent commit (5 failed / 10) and pass now"
duration: 40min
completed: 2026-11-26
status: complete
---

# Phase 87 Plan 74: RF3 trace (uninstall dialog Cancel removed the Steam shortcut) Summary

> **Update 2026-11-26: complete.** The halt below was picked up by debug session
> `.planning/debug/resolved/rf3-cancel-removes-shortcut.md`. Outcome:
>
> - **Cause:** still unproven. The removal at 19:16:59Z was real and could only come from the Show in Steam row's
>   `onToggle`. The later refused uninstall (19:20:22Z), other `shortcuts.vdf` writers, a pointerdown close and a
>   display-only change are all eliminated. A live probe (mouse, no controller, 11 Cancels) gave one click per press
>   and restored focus to the Library nav tab, never to a switch row. RF3 did not reproduce.
> - **Correction to the trace below:** a DOM harness exists (jsdom, RTL 14, user-event 14). Also, the uninstall dialog
>   unmounts at once on No (`DangerZone.tsx:132`), so no 500 ms exit transition plays.
> - **Delivered (user decision: log and harden):**
>   - `cdb012218`: close-path regression test.
>   - `bb14bf27d`: Dialog close stamp.
>   - `6d7c1485c`: `[Shortcuts] Show in Steam activation:` provenance line.
>   - `ae0f0ecce`: SwitchRow ignores `event.repeat`.
>   - `7339ef23a`: SwitchRow drops a pointer click within 500 ms of a dialog close and logs `[SwitchRow] ignored a pointer click`.
>   - `149b6cc26`: comment fix.
>
>   Each guard was red at its parent commit and green after it. Frontend: 396 suites, 6872 tests pass.
> - **Live check (dev build):** turning Show in Steam off and on logged two activation lines. Three Cancels logged
>   nothing.
> - **T-87-143:** mitigated, not root-caused.
> - **For 87-RERUN-2 item 6:** the build must include `149b6cc26`. Expect no `Show in Steam activation:` or
>   `ignored a pointer click` line during Cancel. One `ignored a pointer click` line would confirm hop 9.
>
> The original halted trace follows unchanged, as history.

**Plan halted at its own stop rule: `removeFromSteam` has exactly one renderer caller (the Show in Steam row), the uninstall dialog has no path to it, and the only reachable hop is a second user activation landing on the row after the dialog unmounts; no code or test changed.**

## Performance

- **Duration:** 40 min
- **Tasks:** 0 of 2 executed (Task 1 stopped by its stop rule; Task 2 depends on Task 1's chosen rule)
- **Files modified:** 0 production, 0 test
- **Commits:** 0 production commits (docs only)

## The trace

Goal: every path from the uninstall dialog's Cancel to `window.api.removeFromSteam`.

**The sink.** `removeFromSteam` has one renderer caller:
`src/frontend/screens/Game/GamePage/actions/useSteamShortcut.ts:50` inside `handleAddToSteam` (`:44`), when `addedToSteam`
is true. `handleAddToSteam` has two consumers, both in `InstallTab/IntegrationRows.tsx`: the Show in Steam `SwitchRow`'s
`onToggle` (`:134`) and the row's `RowFailure` `onRetry` (`:130`, rendered only after a failure, `steamFailed && !steamRefresh`).
The preload binding is `src/preload/api/menu.ts:11`; the backend resolver is `src/backend/sidecar/shortcutsResolvers.ts:93`.
The sidecar registration the record cites (`shortcutsFlowRegistration.ts:405-412`) is gone (94-22), as the plan said. So a
removal needs the Show in Steam row's `onClick` (`SwitchRow.tsx:111`, `toggle` at `:88`) or its `onKeyDown` (`:93`, Enter and
Space on keydown, no `event.repeat` check) to fire, or the Retry button.

**Hops from Cancel, ruled out by reading:**

| # | Hop | Evidence | Verdict |
|---|-----|----------|---------|
| 1 | Cancel's own handler | `UninstallModal/index.tsx:333-340`: `onClick={uninstallGame}` on Yes (`:333`), `onClick={onClose}` on No (`:338`). `uninstallGame` (`:143`) calls `onClose()` then `window.api.uninstall`; no Steam call anywhere in the file | ruled out |
| 2 | Header close, Escape, backdrop | `Dialog.tsx:112-115` (`close` = `setOpen(false); onClose()`), `:120-123` (MUI `onClose` for every reason; only backdrop close is suppressed by a setting). The `IconButton` close at `:162-173` / `:176-189` calls `close`. No Steam call | ruled out |
| 3 | DialogHeader / DialogFooter | `DialogHeader.tsx` ignores its `onClose`; `DialogFooter.tsx` is a bare `div` | ruled out |
| 4 | The caller's close | `DangerZone.tsx` passes `closeUninstallModal` = `setShowUninstallModal(false)` (`useUninstallActions.ts:121`); no Steam call | ruled out |
| 5 | React-tree bubbling from the portal | The portal's synthetic events bubble through DangerZone -> InstallTab (`InstallTab/index.tsx`) -> the tab panel (`GamePage/index.tsx:724-726`). `grep` for `onClick/onKeyDown/onKeyUp/onMouseDown/onPointer/addEventListener` over `GamePage/` finds no handler on any ancestor of the modal (only leaf buttons; `Tabs.onChange` at `GamePage/index.tsx:658` is on the tab strip, not an ancestor) | ruled out |
| 6 | Gamepad mount hack | `Dialog.tsx:103-110` fires `gamepadAction({action:'tab'})` once or twice on mount; `tauriGamepadInput.ts` `doTab` dispatches synthetic `Tab` keydown/keyup and calls `.focus()` (it never dispatches Enter, Space or a click for `tab`). It can move DOM focus to a page element behind the dialog, but cannot toggle a row | ruled out as an activator; open as a focus mover (hop 9) |
| 7 | `gamepad.ts` `mainAction` / `back` | `gamepad.ts:236`, `:260` and `:336`: `back` inside a dialog calls `closeDialog()` (clicks the dialog's own close button, `:518`, `:542`); `mainAction` clicks `currentElement()`. Needs a controller; the re-run 1 operator used the app window | not applicable to the record |
| 8 | Backend path without a renderer call | the shortcut removal is reachable only through the invoke bound at `preload/api/menu.ts:11`; nothing else in `src/` calls `removeFromSteam` | ruled out (cause is renderer-side) |

**The one reachable class (named, not proven).** The dialog unmounts synchronously on Cancel: `closeUninstallModal` flips
`showUninstallModal` off, so `DangerZone` stops rendering `UninstallModal` at once and the MUI dialog's 500 ms exit
transition and its backdrop never play (`Dialog.tsx:112-115`, `:155`; `onExited` is not used by this consumer). From that
instant the page under the pointer is live. Any second activation on the same spot then reaches whatever is there:

9. **Second pointer click (a double click on No).** The second `click` is delivered to the element under the pointer, and
   `SwitchRow.tsx:111` has no way to tell it from a deliberate click on the row. Reachable only if the dialog's No button sits
   over the Show in Steam row.
10. **Key repeat or a second key.** `SwitchRow.tsx:93-97` toggles on every Enter or Space keydown, repeats included. If
    focus is on the row when the dialog goes away, a held or repeated Enter toggles it. Focus can be on the row because
    `Dialog.tsx:103-110` moves focus with `doTab` (`tauriGamepadInput.ts` `doTab`, focusing the next or first focusable in the
    whole document) possibly before MUI's focus trap records the node to restore on close.

Neither hop is observable from code. Each needs a second user event or a runtime ordering (MUI portal mount versus the
effect at `Dialog.tsx:103`) that cannot be established by reading, and the house harness has no DOM (the element-graph
harness of `bottleToggle.test.tsx`) so it cannot reproduce focus restore, a second click's hit-test or key repeat.

## Why the plan stopped

Task 1's prohibition: "MUST NOT guess a fix: if reading the code names no path from a dialog close to `removeFromSteam`, stop
and report the hops ruled out instead of changing code". Reading names the row as the only sink and rules out every hop that
starts at the dialog's own handlers. The remaining two hops are candidates, not paths: a fix chosen between them (hold the
backdrop for the exit transition; make `SwitchRow` ignore `event.repeat`; stop the mount hack moving focus off the dialog)
would be a guess, and the plan's red-before-green rule cannot be met (no test in this harness fails at HEAD for either).

No `closeChangesNothing.test.tsx` was written. Tests for the close paths would pass at HEAD, so they would pin existing
behaviour without proving RF3; Task 2 also needs the activation rule Task 1 would have chosen. The `[Frontend]` warning
that re-run 1 saw "naming the uninstall Modal" could not be matched to an emitter: the session evidence (`gamelib-launch-4.log`,
`notes.log`) was in a scratchpad that no longer exists and the current `~/Library/Logs/GameLib/` logs do not contain it.

## Accomplishments

- RF3's static chain is fixed in writing: one sink (`useSteamShortcut.ts:50`), two consumers, no path from any of the dialog's
  close paths, no ancestor handler, no backend route without a renderer call.
- The two reachable hops (9, 10) are named with the exact lines a fix would touch, so the next step is a targeted live check
  rather than a re-read.

## Task Commits

None. No production or test commit; this SUMMARY is the plan's only artifact (status `halted`, so plans that depend on 87-74
stay blocked until RF3 is resolved).

## Files Created/Modified

None in `src/`. Only this SUMMARY.

## Decisions Made

- Stopped at Task 1 per its prohibition rather than adding a speculative guard to `SwitchRow`, `Dialog` or the dialog's
  unmount timing.

## Deviations from Plan

None - the plan's own stop clause was followed. Tasks 1 and 2 are not delivered.

**Total deviations:** 0.

## Issues Encountered

- The re-run 1 evidence behind RF3 (the `[Frontend]` warning text and its timestamp, the exact pointer or key input) is not
  recoverable, which is what leaves hops 9 and 10 unresolved.

## Next steps (for the orchestrator or a follow-up plan)

1. A live check at re-run 2 item 6 can discriminate in one pass: open the uninstall dialog on a non-Steam game with Show in
   Steam on, press No once with the mouse, then once by Enter (single press), then a double click, watching `[Shortcuts]`
   lines and the `[Frontend]` warnings. A single clean click that still removes the shortcut would contradict this trace and
   reopen the chain; only the double-click or repeat reproducing it confirms 9 or 10.
2. If hop 9 reproduces, the cut belongs in `Dialog.tsx` / `DangerZone` (keep the backdrop through the 500 ms exit, or ignore
   clicks for a short window after close); if hop 10 reproduces, in `SwitchRow.tsx` (`event.repeat`) and `Dialog.tsx` (the mount
   hack). Both can then get the red test the plan asks for, using a lightweight DOM or a recorded sequence.
3. Capture the `[Frontend]` warning text this time (archive `gamelib.log` straight after the Cancel).

## User Setup Required

None.

## Known Stubs

None.

## Threat Flags

None. T-87-143 (a dialog close removing the user's Steam shortcut) was open at the halt; it is now mitigated by the 2026-11-26 guards (see the update at the top).

## Self-Check: PASSED

- Every file:line cited above was read in this session (`useSteamShortcut.ts`, `SwitchRow.tsx`, `Dialog.tsx`,
  `UninstallModal/index.tsx`, `DangerZone.tsx`, `useUninstallActions.ts`, `IntegrationRows.tsx`, `gamepad.ts`,
  `tauriGamepadInput.ts`).
- `plan_head_before` equals `plan_head_after` (0 commits, none expected for a halted trace).
