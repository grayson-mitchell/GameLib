# 38-E03(a) / 38-E04(a) verdict

This file is the EMPTY skeleton, written before any live measurement exists. Every `result:` line
below is exactly the bare word `pending` — no number, no expected value, no placeholder outcome and
no outcome word has been written into any result field. The operator fills this in by hand, after
`RUN-SHEET.md` step 5, against `evidence/e03a-prediction.md` and `evidence/e04a-prediction.md`. No
agent may write a result here; see `<verification>` in `261001-93f-PLAN.md` and threat
`T-Q93F-02`.

### 1. H1 — premise reading (devicePixelRatio and capture scale)

expected: Recorded at each "looks like" setting; not predicted. See `e03a-prediction.md` H1.
result: pending

### 2. H2 — identification test (quantization hypothesis match)

expected: Exact match (0 physical px) to hypothesisA_px or hypothesisB_px, or recorded as neither. See `e03a-prediction.md` H2.
result: pending

### 3. H3 — no cumulative drift under changing geometry

expected: Realised physical edge equals the first measurement exactly after a 6-change round trip. See `e03a-prediction.md` H3.
result: pending

### 4. H4 — crispness at device resolution

expected: Embed glyphs render at device resolution on a 1:1 crop, judged by the operator's eye, `grad_max` recorded alongside. See `e03a-prediction.md` H4.
result: pending

### 5. H5 — arming (at least one fractional slot coordinate observed)

expected: At least one "looks like" setting yields a fractional slot coordinate other than .0 or .5. See `e03a-prediction.md` H5.
result: pending

### 6. M1 — tracking gap during motion

expected: At or near this sampler's achieved cadence (~65-100 ms). See `e04a-prediction.md` M1.
result: pending

### 7. M2 — settle time after the pointer stops

expected: Within one to two sampler intervals of the last resize step (~100-200 ms). See `e04a-prediction.md` M2.
result: pending

### 8. M3 — excess gap during motion over the at-rest baseline

expected: At or near 0 px (within Task 2 Arm 1's worst_error_px: 0) for a tracking embed. See `e04a-prediction.md` M3.
result: pending

### 9. M4 — browser A/B reference distribution

expected: Same gesture, same hardware, same locator, in a stock browser window, as the comparator. See `e04a-prediction.md` M4.
result: pending

### 10. Operator's verbatim verdict (38-E04 PASS condition)

expected: The operator's verbatim words on visible lag, tearing or stale-geometry frames during the wider/narrower, slow/fast gesture. See `RUN-SHEET.md` step 4.
result: pending

## Limits

(left blank — to be filled from the live run; Task 2's instrument-level Limits already live in `evidence/instrument-selfproof.md` and are not restated here as a result.)

## Claim limit

(left blank — to be filled from the live run against `e03a-prediction.md` and `e04a-prediction.md`'s claim-limit paragraphs.)
