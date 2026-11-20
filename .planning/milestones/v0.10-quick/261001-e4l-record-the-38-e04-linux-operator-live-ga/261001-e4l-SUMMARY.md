---
quick_id: 261001-e4l
status: complete
---

# Quick 261001-e4l: 38-E04 Linux operator result recorded

**Result:** on the local AppImage, the operator judged the grow-drag trailing black strip acceptable and saw no shrink
overhang. Recorded as an addendum on the Linux embed todo. `38-E04` is NOT discharged.

- Sitting: 2026-10-01, `GameLib_0.7.0_amd64.AppImage` (local build, sha256 prefix `a89ac8bb3b71`), X11, real profile,
  DMABUF unset. Fresh relaunch: the stale instance (PID 86918) was killed, the new shell was PID 89895.
- Check 6 (grow): ACCEPTABLE. Check 7 (shrink): no overhang past the window edge, chrome not covered.
- Not scored: checks 1-5 and 8-10 (including the explicit "GOG page fills the slot" confirmation), scale, GPU mode.
- Side finding, filed separately: library tiles stretch with window width (todo `2026-10-01-library-tiles-stretch-...`).
- Files: `.planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md`, `STATE.md`.
