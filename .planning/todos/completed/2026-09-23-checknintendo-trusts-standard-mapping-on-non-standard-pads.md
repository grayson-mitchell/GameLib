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
status: completed
resolved: 2026-09-23
resolved_by: quick-260923-qe5
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

## Resolution (2026-09-23, quick 260923-qe5)

**The measured HID report, replacing the deduction at "Why `mapping` is known to be non-standard
without console access" above.** That section reasoned to a conclusion without reading the value;
this is the value, read live off the operator's pad on 2026-09-23:

```
[GAMEPAD] id="PowerA Advantage Wired Controller for Nintendo Switch 2 (Vendor: 20d6 Product: a720)" mapping="" buttons=17 axes=10
```

- A1/A2 — `mapping` is the literal empty string `""` (non-standard, confirmed rather than
  deduced), `buttons.length=17`, `axes.length=10`.
- A3 — face-cap indices: A=2, B=1, X=3, Y=0 (raw HID order `[Y, B, A, X]`) — matches this todo's
  table exactly.
- A4 — shoulders L/R/ZL/ZR = **4/5/6/7, IDENTICAL to the standard mapping**. This RETIRES the
  claim two paragraphs above ("`buttons[4]/[5]` shoulders... now known to be shifted") — it was a
  deduction and it was wrong; the shoulders were never shifted. Stick clicks (`buttons[10]/[11]`)
  and Home/Capture were **NOT MEASURED** — no operator time was spent on them once A4's cardinal
  shoulder question was answered, so `guide` is deliberately left unbound on the non-standard path
  and the stick-click half of `38-C04` stays unconfirmed by measurement (see spillover todo below).
- A5 — Home/Capture: **NOT MEASURED** (see A4). No index was captured, so `guide` dispatches
  nothing on the non-standard path rather than guessing.
- A6 — hat axis **index 9**: up `-1.00000`, right `-0.42857`, down `0.14286`, left `0.71429`,
  up-right (diagonal) `-0.71429`, **neutral `3.28571`**. Every cardinal matched the Chromium/W3C
  generic-hat convention predicted in the plan. Neutral did NOT: the plan predicted `1.28571` from
  that same convention and the measured value was `3.28571`. This is the one place the prior was
  wrong, and it mattered — a neutral constant built on the predicted value would have encoded a
  phantom d-pad direction at rest on this exact pad.
- A7 — the up-right diagonal reads `-0.71429`, confirming it is distinct from every cardinal and
  supporting the cardinals-only dispatch decision (a diagonal fires nothing).

**What changed.** `nintendo.ts` gained `nintendoFaceIndices(mapping)`, one exported table with a
STANDARD row (unchanged from today) and a RAW-HID row (from A3 above), and `nintendoHatDirection`
reading the hat axis at index 9 against the A6 constants. `checkNintendo` takes `mapping` as a
fifth parameter and resolves its four face buttons and its d-pad branch through that table instead
of hard-coded standard-mapping indices. `getActionButtonIndex`/`getBackButtonIndex` in Console
Mode's `controller.ts` resolve through the SAME table via a required (non-defaulted) `mapping`
parameter, so the two subsystems read one source of truth and cannot disagree.

**This todo under-scoped its own blast radius.** `ConsoleMode/controller.ts` was listed in
`files:` above as a plain reference, but it carried a SECOND, INDEPENDENT instance of the same
defect — `getActionButtonIndex`/`getBackButtonIndex` hard-coded the same standard-mapping
assumption `checkNintendo` did, with no shared code between them. It was fixed in the same change,
through the same table. Do not trust a todo's `files:` list as a blast-radius ceiling; read the
functions it names.

**What is now SCOREABLE (not scored — that is the orchestrator's separate live sitting):**
`38-C01`'s d-pad half, `38-C03`, `38-C04` and `38-C08`. `38-VERIFICATION.md` and
`38-HUMAN-UAT.md` are deliberately not edited here.

**What was deliberately NOT fixed:**
- `checkN64Clone1`'s comment/code disagreement (different device, no hardware to test it here).
- The multiple-simultaneous-pad limitation in `useGamepadInfo` (reads layout/mapping from the
  first connected pad only, while `useGamepadButtonPress` applies the result to every pad) —
  pre-existing, now recorded in a comment at the read site, not fixed.
- The stick-click index question A4 left unmeasured, and the guide binding A5 left unbound — see
  the spillover todos filed alongside this retirement.

**Proven by neither this fix nor any test in it:** that a *different* third-party non-standard
Nintendo-style pad reports the same raw HID order or the same hat axis index. Only this one device
has been observed; a differently-wired pad would still be wrong and nothing here would detect it.
