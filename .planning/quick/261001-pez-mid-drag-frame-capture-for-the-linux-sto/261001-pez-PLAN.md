---
quick_id: 261001-pez
type: quick
---

# Mid-drag frame capture for the Linux store embed

Retrospective plan, written after the work was done. Measure the one gap 260930-feh left NOT MEASURED: how the Linux
store embed behaves frame by frame DURING a continuous window resize. Build `middrag_capture.py` (frame grabber),
`middrag_check.py` (strip scorer with a selftest) and `middrag_arm.py` (the 260930-feh driver arm plus a mid-drag stage),
run grow / shrink / real-pointer-drag arms on the release binary, and write the operator's live-gate checklist.

No source under `src/` or `src-tauri/` changes. `.planning` is prettier-ignored, so no prettier check.

Verify: `python3 middrag_check.py --selftest` prints `SELFTEST PASS`; every scored run is VALID (pre-drag and final frames
score 0); results are in `261001-pez-SUMMARY.md`; `pnpm planning-gates` passes.
