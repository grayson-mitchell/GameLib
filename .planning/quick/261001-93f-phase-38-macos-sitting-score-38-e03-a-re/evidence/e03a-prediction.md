# 38-E03 branch (a), macOS retina scale-factor rounding: pre-registered criteria

Written 2026-09-30, quick task 261001-93f, BEFORE the run. No `38-E03` measurement exists yet for
branch (a) — this file is written against the instrument's self-proof only (see
`evidence/instrument-selfproof.md`), not against any live capture of the embed.

**Harness:** the shipped GameLib app itself (not a spike harness) — `edgeprobe.swift` (compiled
`swiftc -O`) for pixel-side readings (`shot`, `edges`, `winrect`), `slotprobe.js` pasted into
GameLib's own devtools console for the renderer-side `.WebView__embedSlot` geometry, and
`analyze.mjs`'s `reduceE03` for the raw-delta table against both candidate quantizations. The
operator drives System Settings' "looks like" resolution picker and the window-width sequence by
hand per `RUN-SHEET.md` step 1; no agent performs either.

**Run:** `RUN-SHEET.md` step 1 — for the default "looks like" setting plus at least two others
(and any non-HiDPI mode the panel offers), a `mark()`'d still at each of a chosen list of window
widths, walking out and back to the starting geometry.

## PASS requires all of

- H1: the premise reading. At each "looks like" setting, the measured `devicePixelRatio` from
  `slotprobe.js` and the capture scale derived from `shot`'s width/height against the requested
  logical rect are RECORDED, not predicted — macOS may report `2.0` at every HiDPI setting on this
  panel. If it does report `2.0` throughout, the variable actually under test in H2/H3 below is the
  fractional logical slot geometry, not the scale factor, and this file records that shift rather
  than treating it as a fixed premise.
- H2: the identification test from `<e03_hypotheses>`. For each captured still whose slot rect has
  a fractional logical coordinate other than `.0` or `.5`, the realised physical edge (from
  `edgeprobe edges`) matches exactly one of `hypothesisA_px = round(x_logical) * dpr` or
  `hypothesisB_px = round(x_logical * dpr)`, both computed and tabulated by `reduceE03`. A match to
  one of them identifies the quantization spike 017 could not identify at scale factor 1.0. A match
  to NEITHER is the most interesting outcome and is recorded in full, with both raw deltas, rather
  than rounded to the nearer.
- H3: no cumulative drift under CHANGING geometry. After a sequence of at least six geometry
  changes that returns to the starting geometry, the realised physical edge equals the first
  measurement's physical edge exactly. Spike 017 found no accumulation at scale factor 1.0; this
  re-tests it at whatever scale this panel actually measures.
- H4: crispness. On a 1:1 crop of a captured still, the embed's glyphs render at device
  resolution, judged by the operator's eye. `grad_max` from the `edges` locator is recorded as the
  supporting figure (a sharp edge gives a high gradient; a soft, upscaled edge gives a low one) —
  it does not substitute for the eye.
- H5: arming. At least one "looks like" setting must actually yield a fractional slot coordinate
  other than `.0` or `.5` somewhere in the width walk. If none does, H2 is UNARMED and is recorded
  as a sample that could not be taken — not as a pass.

**Thresholds:** H2 and H3 both require an EXACT match (0 physical px) — this is the resolution
Task 2's Arm 1 proved the locator holds (`worst_error_px: 0` across 21 synthetic frames spanning a
default case, an odd column, a border-adjacent column, and a near-tolerance fg/bg pair). Where a
tolerance is unavoidable elsewhere (none is expected for H2/H3; none is invented here), it must be
justified from that same measured `worst_error_px`, not chosen freely.

**Claim limit:** ONE host, ONE built-in panel (Color LCD / Built-in Liquid Retina, 2560x1664), N
"looks like" settings, NO external display attached. **Mixed-DPI multi-monitor setups and external
displays stay NOT COVERED** — a genuinely different monitor would be a stronger claim and was not
available for this sitting. This scores branch (a) only. Branch (b) already passed on the spike 027
harness in sitting 13. Branch (c) stays blocked on the unbuilt GTK-box-native Linux layout. Neither
`38-E03` nor `38-E04` discharges on this sitting alone.
