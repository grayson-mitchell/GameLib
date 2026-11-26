---
status: awaiting_human_verify
trigger: "RF3 — uninstall dialog Cancel removed the Steam shortcut (87-74 halted; see its SUMMARY \"Next steps\")"
created: 2026-11-26
updated: 2026-11-26
goal: find_and_fix
---

# Debug: RF3 — uninstall dialog Cancel removed the Steam shortcut

## Symptoms

- **Expected:** Cancel (No) in the uninstall dialog changes nothing: no `removeFromSteam`, `addToSteam` or `uninstall`, and the Show in Steam switch stays on.
- **Actual:** In re-run 1 item 7 (`87-RERUN-1-HUMAN-UAT.md` item 7, `87-69-SUMMARY.md` RF3/F8), Trash Goblin, a non-Steam game (legendary) with a CrossOver bottle and Show in Steam on: pressing No removed the game's Steam shortcut, and no uninstall ran. In the same item, the uninstall with the bottle toggle on was then refused with `is-protected-root` (RF4).
- **Errors:** None captured. A `[Frontend]` warning naming the uninstall Modal was seen. Its text and the session logs (`gamelib-launch-4.log`, `notes.log`) are lost.
- **Timeline:** Seen once, in re-run 1 (2026-11-25, around 19:20Z). Never reproduced.
- **Reproduction:** Open the uninstall dialog on a non-Steam game with Show in Steam on, then press No.
- **Operator input (confirmed by the user 2026-11-26):** a SINGLE mouse click on No, not a double click and not the keyboard.

## Prior work: 87-74 trace (read `.planning/phases/87-engine-wine-and-tools/87-74-SUMMARY.md` in full)

- The renderer has only one caller of `removeFromSteam`: `src/frontend/screens/Game/GamePage/actions/useSteamShortcut.ts:50` (`handleAddToSteam`). Its consumers are the Show in Steam `SwitchRow` `onToggle` and the RowFailure `onRetry` in `InstallTab/IntegrationRows.tsx`.
- Ruled out by reading: the dialog's own handlers, the Dialog close/Escape/backdrop, the caller's close, ancestor React handlers, the gamepad paths, and any backend route that bypasses the renderer.
- Candidates left: hop 9 (a double click lands on the row after the dialog unmounts at once) and hop 10 (a key repeat on a row that focus was moved to). **The user's answer (single mouse click) contradicts both**, so the chain needs reopening.

## Hypotheses to weigh (orchestrator notes, untested)

1. **Misattribution in time:** the shortcut was removed by the later uninstall attempt (toggle on, refused `is-protected-root`), not by Cancel. Check whether the backend uninstall path (`uninstaller.ts`, the shortcut removal on uninstall) removes the Steam shortcut BEFORE the protected-root pre-flight at `uninstaller.ts:385-409`. The item 7 record says Cancel came "first", but the operator only noticed the removal afterwards.
2. **Removal through a path other than the renderer `removeFromSteam`:** for example a backend shortcut reconcile or sync, a library refresh that recomputes `addedToSteam` or rewrites `shortcuts.vdf`, or the opening of the dialog (not Cancel) setting off a state change. 87-74 hop 8 only grepped `removeFromSteam` callers. Look at every writer of `shortcuts.vdf` and every removal of a shortcut.
3. **Single click still reaching the row:** a mousedown/pointerdown-driven close (MUI Button ripple or focus) unmounts the dialog before `click`, so the click hit-tests the row underneath. Check whether anything closes on pointerdown, and whether `SwitchRow` acts on anything other than `click`.
4. **Display-only:** the switch read "off" because `addedToSteam` state was recomputed when the dialog closed, but the shortcut was not actually removed. Check how the item 7 operator decided it was "removed".

## Current Focus

hypothesis: the renderer's Show in Steam row (`SwitchRow` `onClick`/`onKeyDown`) received a second activation (a second click event landing on the row after the dialog unmounted, or an Enter/Space keydown on a focus-restored row) that is NOT the single click on No. H1/H2/H3/H4 are eliminated by code and log evidence; the jsdom test shows a single click on No is inert. Not yet proven which second event it was.
test: the live probe (11 Cancels, mouse, no controller) did not reproduce, so the user chose "Log + harden" (2026-11-26). Done and committed: provenance logging on every add/remove from the Show in Steam row, a held-key guard and a 500 ms stale-pointer-click guard on `SwitchRow`, each with a jsdom test that is red without it (see Evidence). The next test is live: 87-RERUN-2 item 6 on a build that contains these commits, read through the new log line.
expecting: with the guards in, a stray second click after a dialog closes logs `[Frontend] [SwitchRow] ignored a pointer click on installTabShowInSteam: ... sinceDialogCloseMs=<n>` and removes nothing; any add/remove from the row logs `[Frontend] [Shortcuts] Show in Steam activation: ...` naming its event. If a removal still happens, that line names the event and the root cause is then proven (or the activation line is absent and a non-renderer path exists, contradicting every finding here).
next_action: awaiting human verification. Nothing more to code. 87-RERUN-2 item 6 is the live check, and it only sees the new lines if gap build 2 is cut from a tree that contains bb14bf27d..149b6cc26 (see the last Evidence entry). The session stays open; do not archive until the user confirms.

## Evidence

- timestamp: 2026-11-26
  checked: 87-RERUN-1-HUMAN-UAT.md:545-551 (RF3) and 87-RERUN-2-HUMAN-UAT.md:271,339 (log-line table)
  found: the removal was a REAL one. At 19:16:59Z `[Shortcuts]` logged the Steam image removal and "Trash Goblin was successfully removed from Steam." with a "Removed from Steam" notification; the bottle and game dir stayed; no runner `Uninstalling` line. The `is-protected-root` refusal (RF4) was logged ONCE at 19:20:22Z, 3 min 23 s LATER. A `[Frontend]` Warning naming the uninstall Modal was logged at ~19:16:58Z, one second before.
  implication: the removal precedes the refusal, so a later refused uninstall cannot have caused it (H1); a real `steam_remove` ran, so it was not display-only (H4)

- timestamp: 2026-11-26
  checked: `src/backend/utils/uninstaller.ts:371-505` (`uninstallGameCallback`)
  found: before `game.uninstall()` the only side effects are `sendGameStatusUpdate('uninstalling')` (:379) and the D-14 pre-flight (:398-423), which on refusal pushes a notice, sends `done` and RETURNS without touching shortcuts. The Steam shortcut removal sits in each store manager's `uninstall()` AFTER the runner uninstall succeeded (legendary `games.ts:817-826`, gog `:1285-1287`, nile `:606-607`, sideload `:233-247`).
  implication: a refused uninstall can never remove the shortcut (H1 false on code too)

- timestamp: 2026-11-26
  checked: every writer of `shortcuts.vdf` and every sender of the `shortcuts_steam_remove` RPC (grep over src/ and src-tauri/, tests excluded)
  found: Rust writers: only `gamelib-shortcuts/src/steam/mod.rs` `steam_add` (:395) and `steam_remove` (:496); the third `ShortcutsMutation::Remove` (:786) is a unit test. `steam_remove` is dispatched only for the `shortcuts_steam_remove` RPC (`gamelib-shortcuts/src/lib.rs:146`). TS senders of that RPC: `resolveRemoveFromSteam` (renderer IPC `removeFromSteam`) and `removeNonSteamGame` (store-manager uninstall success only). The success message "was successfully removed from Steam" is emitted only inside `steam_remove` (`steam/mod.rs:527`). Renderer callers of `removeFromSteam`: only `useSteamShortcut.ts:50`, consumed only by the Show in Steam `SwitchRow` `onToggle` and its `RowFailure` `onRetry` (`IntegrationRows.tsx:130,134`).
  implication: no library refresh / reconcile / dialog-open path writes shortcuts.vdf (H2 false). Given no runner uninstall ran, the log line proves `handleAddToSteam()` ran with `addedToSteam === true`, i.e. the Show in Steam row got a click or an Enter/Space keydown.

- timestamp: 2026-11-26
  checked: pointer-down closes (H3): `UninstallModal/index.tsx:332-340`, `Dialog.tsx:112-123`, MUI Dialog, `SwitchRow.tsx:93-111`, `InstallTab/index.css`, global listeners (`grep addEventListener keydown|click|mousedown` over src/frontend and src/preload), programmatic `.click()` callers
  found: Yes/No use `onClick`; Dialog closes only via MUI `onClose` (backdrop click, Esc, X) and the No button; MUI Dialog uses mousedown only to record whether the press began on the backdrop container; `SwitchRow` acts only on `click` and Enter/Space `keydown`. No global key/click listener activates a focused element except gamepad `mainAction` (`gamepad.ts:336`, needs a pad). `.switchRow` CSS has no oversized hit area or overlay.
  implication: nothing closes on pointerdown and the row reacts to nothing but click and Enter/Space (H3 false)

- timestamp: 2026-11-26
  checked: the build under test (`87-VALIDATION.md:463`) vs Phase 100 commits
  found: re-run 1 ran 0.13.1 = main `07b194604` + version bump; `git merge-base --is-ancestor` confirms 75a50ae29 (switch row) and a2cb57668 (menu removal) are in it. So HEAD's renderer chain is the chain re-run 1 ran.
  implication: static findings above apply to the observed build

- timestamp: 2026-11-26
  checked: 87-74's premise "the house harness has no DOM"
  found: jsdom IS available (`jest-environment-jsdom`, RTL 14, user-event 14; `Dialog/__tests__/dialogHeaderSlot.test.tsx` uses `@jest-environment jsdom`). 87-74's own harness note applied only to bottleToggle.test.tsx.
  implication: a real DOM reproduction of the composed page is possible

- timestamp: 2026-11-26
  checked: jsdom reproduction `src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/uninstallCancelKeepsSteamShortcut.test.tsx` (commit cdb012218): real IntegrationRows + DangerZone + UninstallModal + Dialog + real `tauriGamepadAction` (rects stubbed non-zero so the mount hack really moves focus); only `window.api` faked
  found: 4 of 4 pass at HEAD. Positive control (click on the Show in Steam row) DOES call `removeFromSteam` once, so the harness sees a removal. One full user-event mouse click on No (pointerdown, mousedown, pointerup, mouseup, click), with or without prior focus on the row, then a 600 ms wait for the transition and focus restore: `removeFromSteam`, `addToSteam` and `uninstall` uncalled, switch still on. Header close, Escape and a backdrop click: same.
  implication: no renderer path turns ONE click on No (or any close path) into a removal. The cause needs a second input event or an environment effect jsdom does not model.

- timestamp: 2026-11-26
  checked: where DOM focus lands after the dialog closes (throwaway probe, deleted)
  found: focus is restored to a page control chosen by the dialog's mount hack (two synthetic Tabs run in `Dialog.tsx:103-110` BEFORE the MUI portal content mounts, so `doTab` walks the page behind the dialog and the focus trap records that element as the restore target). In the reduced jsdom page it was the "Applications shortcut" switch row (the row just above Show in Steam), with or without prior focus. Never the Uninstall button, never the dialog's own No button.
  implication: after Cancel, keyboard focus sits on an arbitrary page control, possibly a `role=switch` row, where any later Enter or Space toggles it (hop 10's precondition is real). In the real layout the target depends on the page's focusable order (unmeasured).

- timestamp: 2026-11-26
  checked: the lost `[Frontend]` Warning text
  found: no renderer code path logs a "Warning" line naming UninstallModal (renderer log channels are `logError`/`logInfo` only; `console.warn` is not forwarded; no `logWarning` in `src/frontend` or `src/preload`); today's `~/Library/Logs/GameLib` logs predate re-run 1
  implication: not recoverable; do not rely on it

- timestamp: 2026-11-26
  checked: live probe in the dev build (temporary `src/frontend/rf3Probe.ts` imported from `index.tsx`, since removed; the console paste failed because the Mac webview console would not accept a paste). The user, with a mouse and no controller (also none in re-run 1), did Uninstall… then No 11 times, a few quickly, some toggling the dialog's bottle/erase checkboxes first. Show in Steam was turned on by the user before the run. `gamelib.log` 18:21-18:24.
  found: no reproduction. Every No press gave exactly one pointerdown/mousedown/mouseup/click, `detail=1`, target `button"NO"`, and no further page event followed. The mount hack fires ONE synthetic Tab pair (trusted=false) that lands on the top-nav `a[tab]"Accounts"`; after Cancel, focus is restored to the top-nav `a[tab]"Library"`, never to an Install-tab switch row.
  implication: in the current layout, hop 9 (second click) did not occur with this mouse, and hop 10 cannot reach the Show in Steam row because the restore target is a nav tab. RF3 is not reproducible on demand; the re-run 1 cause stays unproven.

- timestamp: 2026-11-26
  checked: user decision on the next step after the non-reproduction: "Log + harden" (a) provenance logging on every add/remove from the Show in Steam row, (b) a held key never toggles a SwitchRow, (c) a pointer click right after a dialog closes is ignored, layer chosen from the evidence
  found: implemented and committed in four atomic commits, oldest first: `bb14bf27d` (Dialog stamps when it closes: new `components/UI/Dialog/dialogCloseClock.ts`, `Dialog.tsx` stamps on unmount and on `open` turning false), `6d7c1485c` (a: `actions/rowActivation.ts`, `SwitchRow` hands `onToggle` a `RowActivation`, `useSteamShortcut.handleAddToSteam(activation?)` logs one line), `ae0f0ecce` (b: `if (event.repeat) return` after `preventDefault()`), `7339ef23a` (c: a pointer click, `detail >= 1`, within 500 ms of a dialog close is ignored and logged), then `149b6cc26` (comment only: how the gamepad's click differs). Log lines: `[Shortcuts] Show in Steam activation: action=<add|remove> event=<click|keydown|retry> trusted=<b> detail=<n> key=<k|-> repeat=<b> sinceDialogCloseMs=<n|none> appName=<a> runner=<r>` and `[SwitchRow] ignored a pointer click on <rowId>: <same fields> (...)`; the renderer log adds `[Frontend]`.
  implication: the next sighting names the event that toggled the row, and the two second-event hazards named by the trace (hop 9, hop 10) can no longer remove the shortcut.

- timestamp: 2026-11-26
  checked: the premise that a ~500 ms MUI exit transition covers the page after Cancel
  found: it does not for this consumer. `DangerZone.tsx:132` renders `{showUninstallModal && <UninstallModal />}`, and No calls the parent's `onClose` directly (`UninstallModal/index.tsx:338`), so the whole MuiDialog, backdrop included, unmounts at once; `Dialog.tsx`'s own comment says there is no closed-but-mounted state. The 500 ms exit transition exists only for a caller that drives `open` (quick-261113-wro). The page under the No button is therefore hit-testable the instant No is pressed, which is exactly what hop 9 needs. The jsdom test (No, then a click on the Show in Steam row) shows it: at the parent commit it calls `removeFromSteam("trash-goblin", "legendary")`.
  implication: the window is not timed off a transition. 500 ms is the macOS double-click interval (`NSEvent.doubleClickInterval` default, which WebKit merges clicks by), so the second half of a double click and a bounce both fall inside. It also equals Dialog's own 500 ms constant.

- timestamp: 2026-11-26
  checked: the layer for (c), Dialog.tsx / DangerZone versus SwitchRow
  found: chosen SwitchRow, with Dialog only stamping the close. Reasons from the evidence: (1) the proven damage path is one function: the removal logged at 19:16:59Z required `handleAddToSteam()` with `addedToSteam === true`, reachable only through a switch's `onToggle` (and the failure row's Retry), so the row is where the stray press becomes a destructive call; (2) a swallower in Dialog or DangerZone would have to intercept clicks on the page behind it with a document-level capture listener, which changes every one of Dialog's ~25 consumers and every control behind them for a defect seen once on one row, and cannot tell a stale click from a deliberate one (the row can: it knows it is a pointer click, `detail >= 1`, and its own `inert` state); (3) DangerZone cannot see the page behind it; (4) guarding the row also covers the sibling destructive switch (Applications shortcut) and Auto-sync for free, and it needs no per-call-site wiring. The cost is a tiny shared timestamp that Dialog writes and the row reads.
  implication: a pointer click on any switch row within 500 ms of any dialog closing is dropped (and logged); the user presses again. A synthetic click (`detail` 0: the gamepad's main action dispatches `new MouseEvent('click', base)` with no `detail`, `tauriGamepadInput.ts:163`) and a fresh key press are not affected, pinned by a test.

- timestamp: 2026-11-26
  checked: red-first runs, `uninstallCancelKeepsSteamShortcut.test.tsx` (extended; commit cdb012218's file) against the unmodified HEAD source, before any guard or log existed
  found: |
    FAIL Frontend .../InstallTab/__tests__/uninstallCancelKeepsSteamShortcut.test.tsx
      RF3: the uninstall dialog closes without touching the Steam shortcut   (4 tests, unchanged, all pass)
      RF3 hardening: provenance logging and the two activation guards
        ✕ logs one provenance line for a pointer click that removes the shortcut        (lines: Expected length 1, Received length 0)
        ✕ logs the key, repeat flag and event type for a keyboard activation            (Expected length 1, Received length 0)
        ✕ reports the ms since the last dialog closed, and an add reads action=add      (no activation line)
        ✕ a held key (event.repeat) never toggles the switch; a fresh press still does  (expect(removeFromSteam).not.toHaveBeenCalled: Expected number of calls: 0, Received number of calls: 1, 1: "trash-goblin", "legendary")
        ✕ a pointer click right after a dialog closes is ignored and logged; ...        (expectNoSteamChange: removeFromSteam Expected 0, Received 1: "trash-goblin", "legendary")
        ✓ only pointer clicks are ignored: a synthetic click (detail 0, ...) still toggles   (scope pin, not a guard)
    Tests: 5 failed, 5 passed, 10 total
    The new `dialogCloseClock.test.tsx` against the old Dialog (no stamp): 3 failed, 2 passed (`Received: null` on the unmount, `open`-false and later-wins tests).
    Per-guard mutation, on the finished tree: removing only the `event.repeat` guard fails only the held-key test; disabling only the stale-click check fails only the stale-click test (1 failed, 9 passed each time); both restored byte-identical.
    Per commit, the tests were also run red against the parent tree and then green (the held-key test red with `Received number of calls: 1`, the stale-click test red with `1: "trash-goblin", "legendary"`).
  implication: each guard's test fails without that guard, and the stale-click test reproduces, in jsdom, a removal of the shortcut by a second click after No at the parent commit. That shows the hazard is real; it does NOT prove it was the cause of the single re-run 1 sighting.

- timestamp: 2026-11-26
  checked: green runs and gates after the four commits
  found: `jest src/frontend/screens/Game/GamePage src/frontend/components/UI/Dialog`: 64 suites, 922 tests, all pass. Whole Frontend project: 395 of 396 suites passed before one more source pin was updated; the one failure was `longRunningCallSiteGuard.test.ts`, which anchors on `async function handleAddToSteam()`; the anchor was updated (with the same pin in `installTabSource.test.ts`) and that suite re-ran green. `npx prettier --check` (file-info confirmed none ignored), `eslint` and `tsc --noEmit` clean over the changed paths; `node meta/lintScoped.cjs`: production PASS, tests PASS. `graphify update .` run. Not mine: Meta `genI18nGateScope` A-17 ANTI-ROT is red at HEAD with six unrelated drifted files (GamePageGate.tsx and five SystemInfo files), and `loginWindowSeamPredicateRemoved` is red on `src/backend/humble`. The two new non-test files (`dialogCloseClock.ts`, `rowActivation.ts`) are not yet in `meta/i18nGateScope.json` / `meta/i18nForkTouchedFiles.json`; neither file has a user-facing string, and scoping them is the established separate `chore(NN): scope ... for the i18n gate` commit, left undone because A-17 is already red and a regen would pull in the six unrelated files.
  implication: code gates are green; one chore follow-up exists for the i18n scope artifacts.

- timestamp: 2026-11-26
  checked: how 87-RERUN-2 item 6 should verify, and whether to edit the UAT file
  found: `87-RERUN-2-HUMAN-UAT.md` item 6 (`### 6.`) already scores "no Steam shortcut removal line during Cancel" (`was successfully removed from Steam`, `[Shortcuts]`). The UAT file was NOT edited: item 6's `expected:` is a frozen contract with a structural-reachability review and a log-line table whose CONDITIONAL rows are re-checked by 87-79 against the gap build 2 source (`release/v0.13.2`), and that branch does not exist yet (only `release/v0.13` and `release/v0.13.1`). A new literal added to `expected:` would be asserted against a build that may not carry it, which is the green-check-proving-nothing shape; it would also need a new table row and a Test 4 absence row. The UAT shape rules would allow an inline `expected:` extension, but the reachability review would not stay true.
  implication: for the operator and the orchestrator. The new lines exist only in a build cut from a tree containing `bb14bf27d`, `6d7c1485c`, `ae0f0ecce`, `7339ef23a` (all on main now). If 87-78 cuts `release/v0.13.2` from main after these, item 6 can be read with them: with Show in Steam on, Cancel in the uninstall dialog, then grep gamelib.log for (1) `was successfully removed from Steam` (expect none, the existing check), (2) `[Frontend] [Shortcuts] Show in Steam activation:` (expect none during Cancel; any line during the removal step is the later, intended toggle), (3) `[Frontend] [SwitchRow] ignored a pointer click on installTabShowInSteam` (expect none normally; one is the first proof that a stale second click arrives, which scores item 6 pass and closes this session's root cause as hop 9). If the build under test predates these commits, item 6 can only be read by the old signals and the cause stays unproven. Adding the new lines to the UAT's table is a separate decision for the orchestrator or 87-79.

## Eliminated

- hypothesis: H1, the later refused uninstall (is-protected-root) removed the shortcut
  evidence: removal logged 19:16:59Z, refusal 19:20:22Z; the pre-flight (`uninstaller.ts:398-423`) returns before `game.uninstall()`, and the shortcut removal exists only inside each store manager's `uninstall()` after the runner uninstall succeeded
  timestamp: 2026-11-26

- hypothesis: H2, a non-renderer writer or reconcile removed it (library refresh, backend sync, dialog open)
  evidence: the only `shortcuts.vdf` remover is `steam_remove`, reachable only through the `shortcuts_steam_remove` RPC, whose only TS senders are the renderer's `removeFromSteam` and a successful store-manager uninstall (did not run). No Rust or TS reconcile/sync exists.
  timestamp: 2026-11-26

- hypothesis: H3, a pointerdown/mousedown-driven close lets the click hit the row
  evidence: no pointerdown/mousedown close anywhere on this path (see Evidence); the row reacts only to click and Enter/Space
  timestamp: 2026-11-26

- hypothesis: H4, display-only (switch read off, shortcut not removed)
  evidence: a real `steam_remove` ran: image removal, success line and "Removed from Steam" notification were logged
  timestamp: 2026-11-26

## Resolution

root_cause: "unproven: a second activation of the Show in Steam row; mitigated by guards + provenance logging"
fix: |
  Not a root-cause fix: a mitigation plus instrumentation, chosen by the user after the live probe (11 Cancels, mouse) did not reproduce. (1) `Dialog` stamps when it closes (`dialogCloseClock.ts`). (2) Every add/remove from the Show in Steam row logs its provenance (`[Shortcuts] Show in Steam activation: ...`). (3) `SwitchRow` never toggles on a key repeat (`event.repeat`). (4) `SwitchRow` ignores, and logs, a pointer click (`detail >= 1`) within 500 ms of a dialog closing. The two second-event hazards from the 87-74 trace (hop 9: a stray second click once the dialog has unmounted at once; hop 10: a key repeat on a focus-restored row) can no longer remove the shortcut. Which of them, if either, caused the single re-run 1 sighting is still unknown.
verification: |
  guardrail_verdict: accepted_debt
  justification: the user chose "Log + harden" on 2026-11-26 knowing the cause is unproven and the sighting is not reproducible; the guards are deliberate early returns (a documented behavior-skipping fix, flagged by signal 3) and the live check is deferred to 87-RERUN-2 item 6 on a build that carries the commits.
  target_test: { result: pass }   # 5 new jsdom tests in uninstallCancelKeepsSteamShortcut.test.tsx (3 provenance, held key, stale click) + 1 scope pin; dialogCloseClock.test.tsx (5). Each guard test red at the parent commit, green after; quoted in Evidence.
  mutation_check: { result: skipped, reason_if_skipped: "no Stryker configured in this repo", mutant_killed: "n/a; a manual mutation was run instead: dropping only the repeat guard fails only the held-key test, disabling only the stale-click check fails only the stale-click test, both restored byte-identical" }
  no_op_deletion: { result: flagged, deletion_justified_by_rca: false }   # the guards are early returns that skip a toggle; justified by the user's explicit decision, not by a proven RCA
  adjacent_tests: { result: pass, suites_run: ["src/frontend/screens/Game/GamePage (56 suites incl. SwitchRow, installTabRows, installTabSource, longRunningCallSiteGuard)", "src/frontend/components/UI/Dialog (incl. dialogWindowChrome, dialogHeaderSlot)", "whole Frontend project (395/396 before one source pin was updated; that suite re-run green)", "node meta/lintScoped.cjs: production PASS, tests PASS"] }
  revert_and_reconfirm: { result: pass for the modeled hazards only, bug_returned_on_revert: true, fixed_on_reapply: true }   # in jsdom: at the parent commit a click on the row after No (and a repeat keydown) calls removeFromSteam("trash-goblin","legendary"); with the guards it does not. NOT confirmed against the real RF3 sighting: no repro exists.
  live_check: pending, 87-RERUN-2 item 6 (see the last Evidence entry)
files_changed:
  - src/frontend/components/UI/Dialog/dialogCloseClock.ts (new)
  - src/frontend/components/UI/Dialog/components/Dialog.tsx
  - src/frontend/components/UI/Dialog/__tests__/dialogCloseClock.test.tsx (new)
  - src/frontend/screens/Game/GamePage/actions/rowActivation.ts (new)
  - src/frontend/screens/Game/GamePage/actions/useSteamShortcut.ts
  - src/frontend/screens/Game/GamePage/components/InstallTab/SwitchRow.tsx
  - src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/uninstallCancelKeepsSteamShortcut.test.tsx
  - src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts (source pin follows the new handleAddToSteam signature)
  - src/frontend/screens/Game/GamePage/actions/__tests__/longRunningCallSiteGuard.test.ts (same pin)
commits: bb14bf27d, 6d7c1485c, ae0f0ecce, 7339ef23a, 149b6cc26
archive: not archived. `archive_session` runs only after the user confirms the fix end to end, and no fix can be confirmed for a cause that never reproduced. The session stays in `.planning/debug/` with status `awaiting_human_verify`; archive it after 87-RERUN-2 item 6 is read with the new log lines, or close it as not reproducible by the user's decision.
