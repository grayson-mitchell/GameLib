---
created: 2026-09-23T00:00:00.000Z
title: "`checkNintendo` trusts Chromium's `standard` mapping without checking it — on a non-standard Nintendo pad all four face buttons act wrong and the d-pad is dead"
area: gamepad
severity: major
platform: any
ready: code
found_by: "Live Phase 38 controller sitting on the operator's Windows 11 machine, 2026-09-23, with a PowerA Advantage Wired Controller for Nintendo Switch 2"
files:
  - src/frontend/helpers/gamepad_layouts/nintendo.ts
  - src/frontend/helpers/gamepad.ts:570-586
  - src/frontend/screens/ConsoleMode/controller.ts
  - src/frontend/components/UI/ControllerHints/index.tsx
  - src/frontend/helpers/__tests__/nintendoLayout.test.ts
---

# `checkNintendo` assumes a mapping it never verifies

**`platform: any` is not a claim that any machine reproduces this.** The defect is
DEVICE-specific, not OS-specific — it needs a Nintendo-style pad that Chromium does not
normalise. The frontmatter vocabulary has no hardware axis and `any` is its documented default;
do NOT widen the gate's vocabulary to invent one.

## Detection is NOT the bug

Verified by evaluating the real predicates against the real id, not by assumption. Gamepad id
verbatim, from the `Gamepad added:` line `gamepad.ts:626` prints on connect:

```
PowerA Advantage Wired Controller for Nintendo Switch 2 (Vendor: 20d6 Product: a720)
```

- `XBOX_ID` (`/microsoft|xbox/i`) → **false**
- `NINTENDO_ID` (`/nintendo|057e|switch|joy.?con|pro.?controller/i`) → **true**
- `isNintendoControllerId` → **TRUE**, and no earlier branch in the `gamepad.ts:570-586` dispatch
  chain intercepts first (`gamecube|0337`, `2563.*0523`, `0079.*0006`, `0583.*a009` all miss)
- `detectControllerLayout` correctly returns `'nintendo'`

So `checkNintendo` IS the function running, and it is the right one. The bug is that it then
trusts a button mapping nothing ever checked.

## Root cause

`nintendo.ts` states the faulty premise in its own header comment:

> "Chromium reports these with the 'standard' mapping by physical position, so buttons[0] is the
> bottom button (labeled B on Switch) and buttons[1] is the right button (labeled A)."

**False for this device.** It reports `mapping: ""` (non-standard), so Chromium passes raw HID
through untouched and the face buttons arrive in the classic SNES/Nintendo order **`[Y, B, A, X]`**,
not the standard-position order `[B, A, Y, X]` the function hard-codes. `gamepad.ts:578` dispatches
on the id ALONE and never reads `controller.mapping`.

## Symptom 1 — all four face buttons act wrong

Derived from two observations, then **confirmed by falsifiable prediction**: Y=back and X=menu were
predicted from the model BEFORE being tested, and both landed.

| Physical cap | Real index | Bound action | Observed result | Hint bar claims |
| ------------ | ---------- | ------------ | --------------- | --------------- |
| A            | 2          | `altAction`  | **launches the game** | "A: Game details" |
| B            | 1          | `mainAction` | opens game details    | "B: Back"         |
| Y            | 0          | `back`       | goes back             | "Y: Play game"    |
| X            | 3          | `rightClick` | opens the game menu   | —                 |

Every glyph in the `components/UI/ControllerHints` bar therefore contradicts what the button does.
This is the exact glyph-vs-acting-button disagreement `nintendo.ts`'s own header calls "the original
defect this whole layout exists to fix", reintroduced for a device class the layout does not handle.

## Symptom 2 — the d-pad is completely dead

`checkNintendo` reads the d-pad from `buttons[12-15]`. A non-standard pad reports it as a hat axis
(`axes[9]`), so those indices are `undefined`, `up?.pressed` is falsy, and nothing dispatches.
Confirmed live: the d-pad produces no response at all. The left stick (`axes[0]`/`axes[1]`) works
normally, which is why this was not noticed sooner.

## Why `mapping` is known to be non-standard without console access

The W3C standard-gamepad layout **defines** `buttons[12-15]` as the d-pad. A pad reporting
`mapping: "standard"` would therefore have a working d-pad. This one does not, so it is not
standard-mapped. **Confirm the literal `navigator.getGamepads()[0].mapping` value at fix time**
rather than shipping on this deduction.

## Fix direction — not prescriptive, decide at plan time

Branch on `controller.mapping` BEFORE applying any position-based assumption, and give
non-standard Nintendo-style pads their own layout reading raw HID order plus the hat axis.

**Do NOT simply swap indices inside `checkNintendo`.** `controller.ts` carries an explicit warning
that stacking swaps cancels them out and restores the original defect, and standard-mapped Nintendo
pads are CORRECT today and must stay that way. Whatever lands must keep both paths right.

## Testability

`src/frontend/helpers/__tests__/nintendoLayout.test.ts` already has `buildHarness()` and
`pressButton()`, so both the standard and the non-standard path can be covered with synthetic
gamepad objects at the desk — hence `ready: code`. Live re-confirmation needs this specific pad.

## Cross-reference — this contaminated a live measurement

Not cosmetic: it blocked the controller leg of the Phase 38 sitting on 2026-09-23.

- `38-C03` (Tab/Shift+Tab) and `38-C04` (back + stick clicks) depend on button indices now known to
  be shifted (`buttons[4]/[5]` shoulders, `buttons[10]/[11]` stick clicks) — **unscoreable** on this
  pad; a result would measure the HID quirk, not the item's subject.
- `38-C01` names "the d-pad **and** the left stick" and now splits into a passing stick half and a
  failing d-pad half — see relocation rule (4) in `38-VERIFICATION.md`, which exists for exactly
  this shape.
- `38-C02`, `38-C05`, `38-C06`, `38-C08` ride on `axes[0-3]` and remain scoreable.
