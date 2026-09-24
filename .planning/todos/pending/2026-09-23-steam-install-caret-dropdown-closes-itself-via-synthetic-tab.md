---
created: 2026-09-23T00:00:00.000Z
title: "The Steam install-options caret dropdown is ~90% dead to the mouse — `Dropdown.toggle()` fires a synthetic Tab before its own expand lands, and the container's `onBlur` slams it shut"
area: library-ui
severity: major
platform: windows
ready: live-gate
found_by: "Live Phase 38 sitting on the operator's Windows 11 machine, 2026-09-23, trying to reach the Steam install-options dialog via the split-button caret"
files:
  - src/frontend/components/UI/Dropdown/index.tsx:30-36
  - src/frontend/components/UI/Dropdown/index.tsx:41-46
  - src/frontend/screens/Game/GamePage/components/MainButton.tsx:369-411
  - src/frontend/preload/api/tauriGamepadInput.ts:50-62
---

# The install-options caret opens roughly 1 click in 10

**Observed live**: clicking the `SteamInstallCaret` beside the primary Install half produced the
dropdown **once in 10+ clicks**. Operator's words: "dropdown seems 'mostly dead' I did see the
dropdown once, but 10+ further clicks and could not reproduce."

**Cleanly isolated.** The same install-options dialog opens reliably through the `GameCard`
context-menu door (D-27 row 3), and the dialog and its section-gating render correctly once
reached — `38-S06` passed through that door in the same sitting. So the dialog, the gating and
`openSteamInstallOptions` are all fine. The fault is in the caret's `Dropdown` alone.

## Suspected mechanism — UPDATED 2026-09-24, debug session `steam-caret-dropdown-dead`

**REFUTED (measured 2026-09-24, see `.planning/debug/steam-caret-dropdown-dead.md`):**
the `hasZeroArea` chain below, exactly as originally written. `Dropdown/index.scss` plus
`tauriGamepadInput.ts`'s focus collector were reproduced verbatim and run in real Chromium
(WebView2's engine): a *collapsed* panel's child button measures 176.3×31.6, is non-zero on both
axes, and **is** collected by `getFocusableElements()` — `max-height:0; overflow:hidden` clips the
parent's paint, not the child's border box. Replaying the click end-to-end, the current source
ordering settles `dropdown expanded` with `activeElement=opt` (the child button), inside
`.dropdownContainer` — the `onBlur` collapse branch never runs. **Do not re-test this chain and do
not ship "move the Tab after the expand" as the fix; it was also measured and is a no-op against
the real behaviour.** The four numbered steps and code block that used to sit here are the refuted
version, kept below only for the historical record:

```js
const toggle = () => {
  // focus first component only when expanding
  if (!isExpanded) {
    window.api.gamepadAction({ action: 'tab' })
  }
  setIsExpanded((prev) => !prev)
}
```

1. ~~The synthetic `tab` is dispatched before `setIsExpanded(true)` commits, so the dropdown is
   still `collapsed` at dispatch time.~~
2. ~~`getFocusableElements()` drops the collapsed children as zero-area.~~ — **false**, measured.
3. ~~Focus lands outside `.dropdownContainer`.~~ — **false**, measured (`activeElement=opt`, inside).
4. ~~The container's `onBlur` sees an outside `relatedTarget` and collapses it.~~ — never runs.

**Current leading hypothesis — mechanism confirmed in source, needs one operator-confirmable fact
to close.** `src/frontend/helpers/gamepad_layouts/nintendo.ts:80-105`'s `checkNintendo()` binds
`back` unconditionally to `buttons[0]` on the (unproven) premise, stated in its own header comment,
that "Chromium reports these with the 'standard' mapping by physical position". That premise is
independently known to be **false** for at least one real device: the concurrent, still-in-flight
quick-task `.planning/quick/260923-qe5-fix-checknintendo-trusting-chromium-stan/260923-qe5-PLAN.md`
measured, on the operator's own PowerA Advantage Wired Controller for Nintendo Switch 2, that
Chromium reports mapping `''` (non-standard) and passes raw HID through untouched — on that pad
`buttons[0]` is the **Y** cap, not B (raw HID SNES-style order is Y, B, A, X). `HID_DUMP` is still
`true` and no `mapping` parameter has landed on `checkNintendo` (checked 2026-09-24), so this bug
is live in the tree today, unpatched.

Chain: pressing the physical **Y** button on such a pad dispatches `checkAction('back', ...)`
(`gamepad.ts`'s `back` binding is edge-triggered, `repeatDelay: false` — fires once per genuine
press, never spontaneously while idle). `gamepad.ts`'s `back` case calls `closeDropdown()`
whenever `insideDropdown()` is true — and it *is* true in exactly the relevant window: the
now-refuted replay above already established that a mouse click on the caret settles with
`activeElement` **inside** `.dropdownContainer` immediately after opening. So: click opens the
dropdown correctly (confirmed by the Chromium replay), and if a non-standard-mapping Nintendo pad
was connected and its physical Y button was pressed (or read as pressed) in that same window,
`closeDropdown()` fires and slams it shut — reading exactly as "opened once, mostly dead."

**The one fact this needs to close:** was a gamepad actually connected during the Phase 38 sitting
where this was observed? The debug session flagged this as "likely (Phase 38 is the controller UAT
phase) but not confirmed." `gamepad.ts`'s `addgamepad` handler already logs a permanent
`[GAMEPAD]` line (id, mapping, button/axis counts) via `window.api.logInfo` on connect — check
`gamelib.log` from that sitting for it, or reproduce live with the same pad and mouse-click the
caret while resting a thumb near Y. If mapping logs as non-standard (`''`) and a pad was present,
this is confirmed as the root cause and the fix is `260923-qe5`'s Task 3 (already planned: a
shared, mapping-aware face-index table) — completing that plan closes this caret defect as a side
effect. If no pad was connected in that sitting, this hypothesis is eliminated and the two other
instrumented-but-inconclusive hypotheses (Dropdown unmount via `showSteamMainButtonInstallOptions`
flicker; `useSuppressStoreEmbedWhile` focus disturbance — the latter effectively refuted by
React.memo/context-consumer analysis, see the debug session) remain open.

## Why this is `major`

- The caret is one of three documented doors to install options (D-27 rows 3 and 5 plus this
  one). The other two work, so a workaround exists — but a control that responds ~10% of the time
  reads as a broken app, not a missing feature.
- **It contaminated a live measurement**, which is the second count: `38-C08` asks whether this
  caret is CONTROLLER-reachable. A control the mouse cannot reliably open makes that question
  unanswerable, so the item could not be scored in this sitting.
- `Dropdown` is a SHARED primitive. Its other current consumers are the NavShell tier-2 filter
  dropdowns (`FilterFacetGroup`) per the component's own comment, so any fault here is not
  confined to the caret. **Check whether the filter dropdowns show the same flakiness** —
  `38-C06` covers tier-2 filter panel traversal and may be affected by the same root cause.

## Fix direction — not prescriptive

**Superseded 2026-09-24.** The original direction ("move the synthetic Tab to after the expand
commits") targeted the now-refuted `hasZeroArea` chain and is a measured no-op — do not ship it.
If the leading hypothesis above is confirmed (a controller was connected and its mapping logs as
non-standard), the fix is `260923-qe5`'s Task 3: a shared, mapping-aware face-index table consumed
by `checkNintendo`, so `back` resolves to the printed B cap instead of raw `buttons[0]` on
non-standard pads. That plan is already staged and gated on its own operator checkpoints; this
todo does not need a second, duplicate fix once it lands. Do not simply delete the
`gamepadAction({action: 'tab'})` call — it is what makes the dropdown reachable by controller in
the first place, which is the very property `38-C08` exists to verify. Equally, do not loosen
`hasZeroArea`: that filter is load-bearing for the gamepad focus collector and was measured
correct in the Chromium replay above.

## Cross-reference

`38-C07`'s ledger entry already anticipated trouble in exactly this neighbourhood, describing the
caret as "a small icon-only half of a split button inside a `flex-wrap: wrap` container —
precisely the shape whose measured box can collapse to zero on one runtime and not the other."
That note was about the CARET's own box; this defect is about its dropdown CHILDREN's boxes, via
the same `hasZeroArea` predicate. Related reasoning, different element.
