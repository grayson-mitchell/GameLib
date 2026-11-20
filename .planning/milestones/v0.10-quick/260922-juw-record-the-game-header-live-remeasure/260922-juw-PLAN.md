---
phase: quick-260922-juw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/todos/completed/2026-09-11-humble-keys-game-column-header-label-sits-5px-left-of-row-titles-unverified-live.md
autonomous: true
requirements:
  - TODO-2026-09-11-humble-keys-game-column-header-offset
must_haves:
  truths:
    - "The todo's `status:` line no longer claims the 4.89px correction has NOT been re-measured live"
    - "The measured run-4 figures are recorded in the todo body with their build identity"
    - "The original `NOT verified live` section body is preserved verbatim, marked superseded rather than rewritten"
    - "The ONE bullet of that section's three-bullet ask that was NOT discharged (TYPE/KEY re-confirmation) is recorded as still owed, not silently dropped"
    - "The Severity justification's closing claim, which says closure still depends on a re-measurement that has not happened, is corrected"
    - "The evidence's durability is stated honestly: the committed record is 43-UAT.md test 9; the raw captures are in an ephemeral scratchpad and are NOT committed"
  artifacts:
    - "`pnpm planning-gates` stays green"
---

# Record the live re-measure of the GAME column header offset

## Why

`.planning/todos/completed/2026-09-11-...-unverified-live.md` closed on 2026-09-13 with a
status line that ends: *"The predicted 4.89px correction has NOT been re-measured live."* That
sentence was true when written and is false now. Phase 43's UAT run 4 (2026-09-18, recorded in
`43-UAT.md` test 9, committed `a1f2f2d0d`) took exactly the measurement the todo's own
`## NOT verified live` section specified, and it PASSED.

The todo is the document `43-LIVE-GATE.md` points at for this defect. Leaving it asserting an
un-taken measurement means the phase's close condition reads as outstanding in the one place a
reader would check.

## Facts to record (all from 43-UAT.md test 9, already committed)

- Build: HEAD `63e140d03`, `gamelib-shell` sha256
  `8edbf95eabda0a53e1c37ed94ad1167318c04f875e882c3f49b6e9d702dd382d`, DMG-recovered and
  hash-verified against `target/release/`. Fix confirmed present in `build/renderer` BEFORE
  measuring.
- Geometry: window 1280x800 pt at device origin (232,130), SCALE 2.0 exact (capture 2940x1912).
- `Game` header label ink left edge **340.0 CSS px**; six row titles **340.0, 340.5, 341.0,
  341.0, 340.0, 340.0**. Divergence **max 1.0 CSS px** against the ±2 threshold -> **PASS**.
- Run 3 measured 335.5 vs 340.0-341.0 = 5.5 (FAIL). The header moved **right by 4.5 CSS px**;
  `260912-d84` predicted **4.89**.
- Not an antialiasing artifact: threshold sweep 28/60/100/140 gives header
  340.0/340.0/340.5/340.5 against titles 340.0-341.5, divergence staying <=1.5.
- Scanner negative-controlled: the same pure-Python leftmost-ink scanner was first run against
  run 3's OWN committed evidence (`43-12-evidence/capture-2-top.png`) and reproduced run 3's
  published numbers exactly (header 335.5, titles 340.0/341.0/341.0/340.0/340.5/341.0).
- Band identity confirmed visually, not assumed from geometry: the 340.0 band cropped and read
  as the literal word "Game" sitting above "Asguaard".

## What is NOT discharged

The `## NOT verified live` section asks for THREE things. Bullets 1 and 2 (re-measure the
header against the titles; expect the offset inside ±2) are discharged. **Bullet 3 is not** —
"Re-confirm TYPE and KEY remain at their prior near-zero offsets (0.0 and 0.5 respectively)"
was never taken in run 4; test 9's measured block carries no TYPE or KEY figures. Record it as
still owed. The fix does not touch either track, so the risk is low, but low risk is not a
measurement.

## Evidence durability

The committed, durable record is `43-UAT.md` test 9. The raw run-4 captures
(`run4-capture-1.png`, `crop-game-header.png`, `test9-threshold-stability.txt`) live in a
session scratchpad under `/private/tmp/claude-501/...` and are **not committed** — unlike run
3's evidence, which is in `43-12-evidence/`. Say so in the todo rather than citing a path that
will vanish.

## Tasks

1. Rewrite the `status:` frontmatter value to record the PASS with its figures.
2. Mark `## NOT verified live` superseded in its heading, body preserved verbatim.
3. Append `## Verified live 2026-09-22 (Phase 43 UAT run 4, measured 2026-09-18)` with the
   figures, the negative control, the undischarged bullet 3, and the durability note.
4. Correct the final sentence of `## Severity justification`.
5. `pnpm planning-gates`.

## Out of scope

- `ready: live-gate` is left as-is. The frontmatter gate scopes `pending/` only, and on a
  closed todo `ready:` is vestigial; changing it is not what this task was asked to do.
- Committing the run-4 captures into `43-12-evidence/`. They are screenshots of the operator's
  real library and that is their call, not a side effect of a doc amendment.
