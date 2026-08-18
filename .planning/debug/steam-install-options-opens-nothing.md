---
status: reported
trigger: "Operator, 2026-08-19, live `pnpm tauri:dev`: clicking 'Install options…' on HUMANKIND (appId 1124300, an incomplete on-disk native install with steamResumePending set) presented NO options dialog — the install simply proceeded."
created: 2026-08-19
goal: find_root_cause_only
area: steam
---

## Symptoms

expected: "Install options…" opens the install-options dialog (`useInstallGameModal` with
`isOpen: true`) so the user can choose a library target / bottle / Windows-via-bottle override before
anything is dispatched. Per D-25 this door is explicitly meant to be INSTANT and synchronous —
"user already asked for the dialog by clicking 'Install options…'".

actual: no dialog appeared; the native depot install started immediately.

reproduction: HUMANKIND (1124300) in the `steamResumePending` state — i.e. an incomplete on-disk
native install left by an earlier interrupted run (~31GB present, `StateFlags=1026`). Clicked
"Install options…". Observed live during the 23-10 Task 1 gate session.

started: Observed 2026-08-19. Unknown whether it predates that session; NOT yet reproduced a second
time, and NOT yet checked against a *fresh* (never-installed) Steam title, which is the first thing
to try — the resume-pending state may or may not be load-bearing.

## Not yet investigated

Nothing has been ruled out. This file records the report only; no hypothesis has been tested.

## First checks for whoever picks this up

1. **Is the resume-pending state load-bearing?** Repeat on a fresh, never-installed Steam title. If
   options DO open there, the bug is specific to the incomplete/`steamResumePending` path.
2. **Which function did the click actually reach?** All three UI call sites appear correct on
   inspection — they call `openSteamInstallOptions`, which synchronously sets `isOpen: true`:
     - `src/frontend/screens/Library/components/GameCard/index.tsx:391`
     - `src/frontend/screens/Game/GameSubMenu/index.tsx:339`
     - `src/frontend/screens/Game/GamePage/components/MainButton.tsx:386`
   So the defect is more likely downstream (modal renders but immediately closes / renders empty /
   auto-dispatches) than a mis-wired call site. Confirm WHICH of the three surfaces was clicked —
   this has not been established.
3. **Contrast with `quickInstallSteamGame`** (`src/frontend/state/InstallGameModal.ts` ~250-275): that
   function deliberately dispatches `installSteamGame` WITHOUT any dialog when
   `evaluateQuickInstallTarget` returns `ok` (D-23 one-click quick install), and only falls through to
   `openSteamInstallOptions(appName, gameInfo, verdict.degrade)` when the verdict is not ok. Its
   observable behavior — "no options, install just proceeds" — matches the report exactly. Determine
   whether the clicked control routed here instead, or whether the two paths are conflated somewhere.
4. Check whether the modal mounts and then self-closes for a game where `is_installed === false` but
   files are already present on disk.

## Related

- The stale "Finish in Steam" label on this same `steamResumePending` state is a SEPARATE, understood
  issue being fixed by quick task `260819-ch5` (copy only, no routing change). Do not conflate them:
  that one is a wrong *word* on a correct action; this one is a missing *dialog*.
- `.planning/debug/steam-install-spinner-hangs-tauri.md` and its `-live-g3002` sibling are the same
  broad family (a Steam install-surface outcome the frontend never shows), both resolved — worth
  reading for the diagnostic pattern, but neither is this defect.
