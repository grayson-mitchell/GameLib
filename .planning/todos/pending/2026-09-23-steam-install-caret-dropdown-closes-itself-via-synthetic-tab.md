---
created: 2026-09-23T00:00:00.000Z
title: "The Steam install-options caret dropdown is ~90% dead to the mouse — `Dropdown.toggle()` fires a synthetic Tab before its own expand lands, and the container's `onBlur` slams it shut"
area: library-ui
severity: major
platform: any
ready: code
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

## Suspected mechanism — NOT yet instrumented, read from source

`Dropdown.toggle()` (`components/UI/Dropdown/index.tsx:30-36`):

```js
const toggle = () => {
  // focus first component only when expanding
  if (!isExpanded) {
    window.api.gamepadAction({ action: 'tab' })
  }
  setIsExpanded((prev) => !prev)
}
```

1. The synthetic `tab` is dispatched **before** `setIsExpanded(true)` is applied — React state
   updates are asynchronous, so at dispatch time the dropdown is still `collapsed`.
2. `getFocusableElements()` (`tauriGamepadInput.ts:50-62`) **drops any element failing**
   `hasZeroArea(el.getBoundingClientRect())` (`:57`, defined `:46-48`). A `collapsed` dropdown's
   children have zero area, so the Tab skips them entirely.
3. Focus therefore lands on the next focusable element **outside** `.dropdownContainer`.
4. The container's `onBlur` (`:41-46`) fires, `e.currentTarget.contains(e.relatedTarget)` is
   false, and it calls `setIsExpanded(false)`.

The dropdown opens and closes within the same interaction. Intermittency is expected from this
shape: it is an ordering race between the synthetic focus move and the React commit, so it
resolves differently depending on timing — matching "worked once in 10+ tries".

**This is a hypothesis with a strong evidence chain, not a measured cause.** Confirm by
instrumenting `isExpanded` transitions and the `onBlur` `relatedTarget` before fixing.

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

The ordering is the bug: focus is moved into a region that is not yet expanded, and therefore not
yet focusable. Any fix that moves the synthetic Tab to AFTER the expand has committed addresses
it. Do not simply delete the `gamepadAction({action: 'tab'})` call — it is what makes the dropdown
reachable by controller in the first place, which is the very property `38-C08` exists to verify.
Equally, do not loosen `hasZeroArea`: that filter is load-bearing for the gamepad focus collector.

## Cross-reference

`38-C07`'s ledger entry already anticipated trouble in exactly this neighbourhood, describing the
caret as "a small icon-only half of a split button inside a `flex-wrap: wrap` container —
precisely the shape whose measured box can collapse to zero on one runtime and not the other."
That note was about the CARET's own box; this defect is about its dropdown CHILDREN's boxes, via
the same `hasZeroArea` predicate. Related reasoning, different element.
