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
harness in sitting 13. Branch (c) is Linux and is not touched here; note that the Phase 38 ledger's
branch-(c) text differs between trees — `04ceb476e`, published on `quick-260930-feh`, adds a dated
`linux_built_2026_10_01` field to `38-VERIFICATION.md` recording that the GTK-box layout WAS built,
explicitly not as a discharge. Neither `38-E03` nor `38-E04` discharges on this sitting alone.

## Tree under test — AMENDED 2026-10-01, BEFORE any measurement

This amendment was made while every `result:` in `e03a-e04a-verdict.md` was still the bare word
`pending`; nothing had been measured, so the pre-registration is intact rather than revised after
the fact. It exists because the original file named the fix but never named the tree — and on this
repo the venue has twice decided what a gate could see.

**Run this sitting with `main` checked out, and record the exact HEAD sha in the verdict.**

- `b4517366e` ("fix(40-08): track live drag-resize — leading-edge throttle, not a debounce"), the
  fix `38-E04(a)` re-measures, is an ancestor of BOTH `origin/main` and `quick-260930-feh`
  (verified with `git merge-base --is-ancestor`). So it is present either way.
- `d71269c2a` ("fix(quick-260930-feh): re-arm store-embed bounds effect when the slot element is
  replaced") is feh-ONLY and rewrites the very effect under test: `slotRef: RefObject` plus a
  one-way `slotPresent` latch becomes `slotNode: HTMLDivElement | null` keyed on element identity,
  and that effect owns the ResizeObserver, the `resize`/`scroll` listeners, `flush()`, and the sole
  `storeEmbedSetBounds` call site (T-40-08-03).
- Measuring on `main` therefore scores `38-E04(a)` as its own text specifies — `b4517366e` alone.
  Measuring on feh would score `b4517366e` + `d71269c2a`, which is a different claim.

**M5: negative control for the venue question.** `d71269c2a`'s behavioural change is expected to
arm ONLY when the slot element is replaced — a store-to-store navigation on the single
`store/:store` route. That expectation is a PREDICTION, not a measured fact, and this M exists so it
is not taken on trust. Run the M1 gesture twice on the same tree: (i) a drag with NO intervening
store switch, and (ii) a drag immediately after GOG -> Epic -> GOG. Record both distributions.
If they agree, the venue question is answered by measurement rather than by argument, and a later
feh run becomes comparable. If they DISAGREE on `main`, then slot-element replacement affects
drag tracking even without `d71269c2a`, which is a finding in its own right and must not be
folded into the M1 verdict.
