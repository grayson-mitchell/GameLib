# 38-E04 branch (a), macOS drag-resize latency re-measure after `b4517366e`: pre-registered criteria

Written 2026-09-30, quick task 261001-93f, BEFORE the run. This is a RE-measure: the original
defect (plan 40-11's Item 3) was fixed by `b4517366e`, and no live `38-E04` measurement exists yet
for branch (a) against the fixed code — this file is written against the instrument's self-proof
only (see `evidence/instrument-selfproof.md`).

**Harness:** the shipped GameLib app itself. `edgeprobe.swift`'s `sample` subcommand samples the
embed's pixel edge at the achieved cadence against the window's live bounds (`winrect`), while the
operator performs the drag gesture by hand. `analyze.mjs`'s `reduceE04` reduces the resulting JSONL
to cadence, tracking gap, settle time, at-rest baseline and excess gap — no threshold or verdict.

**Instruments:**
- `edgeprobe sample`, at whatever cadence this hardware and capture backend achieve (Task 2's
  Arm 4 measured median 66.7 ms / p90 71.6 ms / max 96.9 ms over 44 live samples on this machine —
  see the Limits section below, carried verbatim).
- The operator's eyes, for tearing, stale frames and any visible lag — the item's own wording.
- A browser A/B: the identical gesture performed in a stock browser window on the same hardware,
  sampled with the identical locator, as the reference distribution.

## Measures (supporting evidence, not the pass condition)

- M1: tracking gap during motion — the ms between consecutive changes to the embed's pixel edge
  while the window size is changing (`reduceE04`'s `tracking_gap_ms`). Bar: at or near this
  sampler's own achieved cadence (~65-100 ms per Task 2 Arm 4), not the 40 ms UI throttle interval
  alone — sitting 13's Windows branch measured a 43 ms median tracking gap at a much finer 28 ms
  sampler resolution, so this Mac sampler cannot resolve anything finer than its own cadence
  ceiling. A tracking gap sitting within a small multiple of the achieved cadence is consistent
  with tracking; a gap of several times the cadence is not.
- M2: settle time — the ms from the last window-size change to the last embed-edge change that
  followed it (`reduceE04`'s `settle_ms`). Bar: within one to two sampler intervals of the last
  resize step (roughly 100-200 ms on this hardware), consistent with sitting 13's Windows branch
  measuring a 0 ms settle (effectively immediate) at its finer sampler resolution.
- M3: excess gap during motion over the at-rest baseline — the measure that separates a tracking
  embed from a lagging one (`reduceE04`'s `excess_gap_px`, baseline from `at_rest_gap_px`). Bar: at
  or near 0 px (within Task 2 Arm 1's measured `worst_error_px: 0`) for a tracking embed. Task 2's
  Arm 2 proved this reducer detects an injected 15 px lag exactly against a 0 px tracking baseline,
  so a genuinely lagging embed here is expected to show a comparably distinguishable excess gap,
  not a difference this reducer could miss.
- M4: the browser A/B reference distribution — the same gesture, same hardware, same locator,
  taken in a stock browser window. This needs no invented number: it is an on-hardware comparator,
  and GameLib's M1-M3 are read against it rather than against an absolute constant.

**State explicitly:** the PASS CONDITION is the operator's verbatim judgment plus the browser A/B
— plan 40-11's Item 3 shape, which defines no numeric threshold an agent can measure. M1-M4 are
supporting evidence recorded alongside that judgment, never a substitute for it.

**Limits carried verbatim from Task 2's self-proof:**
- Cadence ceiling: the achieved sample cadence measured live on this machine is median 66.7 ms /
  p90 71.6 ms / max 96.9 ms over 44 samples. Any real resize frame shorter than this interval is
  invisible to the sampler between two consecutive captures — the operator's own eyes cover that
  gap, per `RUN-SHEET.md` step 2's gesture requirement.
- Widen-only lag visibility: the sampler locates the embed's edge scanning inward from the window's
  right edge. A lag during WIDENING shows as a visible background gap; a lag during SHRINKING
  instead leaves the embed overflowing past the window's new, smaller edge, where the window itself
  clips the overflow, so the pixels show no gap. The instrument cannot see a shrink-direction lag,
  only a widen-direction one — the wider/narrower gesture shape in `RUN-SHEET.md` step 2 is what
  gives this its only shrink-direction signal, the operator's eyes.

**Claim limit:** ONE host, ONE built-in panel (Color LCD / Built-in Liquid Retina, 2560x1664), N
"looks like" settings, NO external display attached. **Mixed-DPI multi-monitor setups and external
displays stay NOT COVERED** — a genuinely different monitor would be a stronger claim and was not
available for this sitting. This scores branch (a) only. Branch (b) already passed on the spike 027
harness in sitting 13. Branch (c) stays blocked on the unbuilt GTK-box-native Linux layout. Neither
`38-E03` nor `38-E04` discharges on this sitting alone.
