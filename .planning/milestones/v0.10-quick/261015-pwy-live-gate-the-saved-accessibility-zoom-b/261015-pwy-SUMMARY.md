---
phase: quick-261015-pwy
plan: 01
subsystem: ui
tags: [accessibility, zoom, webview-zoom, library-tile-size, live-gate, macos, tauri, evidence, todos]

requires:
  - phase: quick-261015-p3q
    provides: "The boot re-apply wiring under test (GlobalState.componentDidMount -> applySavedZoomAtBoot -> window.api.setZoomFactor -> tauriSetZoomFactor -> getCurrentWebview().setZoom() -> publishWebviewZoom('--webview-zoom')), pinned at the unit level but unexercised on a real relaunch."
provides:
  - "Live-measured confirmation that the saved Accessibility zoom re-applies correctly on a real quit-and-relaunch, with the first-paint flash bounded at < 119.1ms"
  - "Confirmation that the Library tile-width track is correct from the very first paint of that route under an untouched-boot zoom, not only after the slider is touched"
  - "Refutation of the screen.availWidth k-recomputation hazard flagged as a possible by-product finding"
  - "A reusable apply-latency bound (mean 17.5ms, max 25ms over 10 transitions) for the setZoomFactor -> --webview-zoom pipeline"
affects: []

actuals:
  tokens: 5581
  tasks: 3
  commits: 3
  plan_head_before: 4836623a00ce7f3777eb83e92f0e99b1b605f4d5
  plan_head_after: 131f10e13

tech-stack:
  added: []
  patterns:
    - "GUI-automation live-gate rig: CGEvent clicks/keystrokes (winlist/click Swift binaries, AppleScript System Events) driving a real pnpm tauri:dev window, readback via window.api.logInfo(...) into gamelib.log tagged with a short task prefix"
    - "Range-input 'dispatch fallback' (native HTMLInputElement value setter + input/change event dispatch) as the sanctioned recovery when a CGEvent click fails to grab a slider thumb's keyboard focus -- still the real onChange handler, never a config hand-edit"
    - "Window-bounds-matched screenshot cropping (sips -c/--cropOffset, doubled for 2x Retina) to make a full-screen burst frame and a window-cropped evidence screenshot directly comparable"

key-files:
  created:
    - .planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/README.md
    - .planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/boot-reads.jsonl
    - .planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/01-launch1-asfound-90.jpg
    - .planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/02-relaunch-first-frame.jpg
    - .planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/03-relaunch-steady-150.jpg
    - .planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/burst-index.tsv
  modified:
    - .planning/todos/completed/2026-10-15-saved-zoom-boot-re-apply-unverified-on-a-real-relaunch.md

key-decisions:
  - "Scored arm (c) (the accepted first-paint-flash limitation) as expected rather than re-filing it: the measured bound (< 119.1ms, sampler-limited) does not show the componentDidMount-layer cost is unacceptable in practice."
  - "Did not file a new todo for the screen.availWidth k-recomputation hazard: the 5-probe by-product measurement refuted it (availWidth held at 1428 throughout, resolving to the predicted 1.44 factor every time, not the ~0.956 hazard value)."
  - "Used the plan's sanctioned 'dispatch fallback' to restore the profile to 90 after a CGEvent click failed to grab the slider thumb's keyboard focus, preserving the constraint that the real onChange handler drives the value, never a store/config.json hand-edit."

requirements-completed: [TODO-pwy-1]

coverage:
  - id: D1
    description: "Boot re-apply of the saved Accessibility zoom, confirmed correct on a real quit-and-relaunch (untouched-boot --webview-zoom matched the predicted factor within 1e-5; Library tile track correct from first paint)"
    requirement: "TODO-pwy-1"
    verification:
      - kind: manual_procedural
        ref: ".planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/README.md (arm a, b) + boot-reads.jsonl (launch2-relaunch-untouched-150)"
        status: pass
    human_judgment: false
  - id: D2
    description: "First-paint flash bound and screen.availWidth k-recomputation hazard, measured as by-products of the apply-latency probe"
    requirement: "TODO-pwy-1"
    verification:
      - kind: manual_procedural
        ref: ".planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/README.md (results table, rows 7-9) + burst-index.tsv"
        status: pass
    human_judgment: false

duration: ~22min (commit span across two real tauri:dev launches; excludes earlier rig setup from a prior session segment)
completed: 2026-10-15
status: complete
---

# Quick Task 261015-pwy: Live-gate the saved Accessibility zoom's boot re-apply Summary

**Confirmed on a real `pnpm tauri:dev` quit-and-relaunch that the saved Accessibility zoom re-applies correctly at boot (`--webview-zoom` matched the predicted 150% factor within 1e-5, Library tiles correct from first paint), bounded the first-paint flash at < 119.1ms, and refuted the `screen.availWidth` k-recomputation hazard as a free by-product.**

## Performance

- **Duration:** ~22 min (commit span: 19:03:44 -> 19:25:50 NZDT, across Launch 1 and Launch 2 of the real packaged dev app; the rig itself, plus earlier Launch-1 work, started in a prior session segment not separately timestamped)
- **Tasks:** 3/3 completed
- **Files modified:** 7 (6 created, 1 renamed+edited)

## Accomplishments

- **Primary arm (a) confirmed, not discovered-broken.** A real relaunch with `zoomPercent: 150` already persisted produced an untouched-boot `--webview-zoom` of `1.5774409656148782` against a predicted `1.5774410` (matched within 1e-5), with the `.gameList` track already at the 150%-correct `114.108864px` from the very first Library paint.
- **First-paint flash bounded, not eliminated.** A 54-frame, ~6-second window-cropped screenshot burst (calibrated mean sampler interval 119.1ms) found no 100%-rendered frame between -76ms and +5947ms relative to first window sighting -- the flash, if any, is shorter than the sampler resolves (`< 119.1ms`), not a multi-second stay at 100%.
- **Apply-latency bound established.** 10 `setZoomFactor` transitions (5x to 1.4, 5x to 1.5) averaged 17.5ms, max 25ms -- bounded below by `requestAnimationFrame`'s ~16.7ms polling granularity at 60Hz, meaning the CSS-variable apply mechanism itself is effectively instant.
- **`screen.availWidth` k-recomputation hazard refuted.** The same 5-probe apply-latency run doubled as the hazard test: `availWidth` held at 1428 (unchanged) across all 5 probes and resolved to the predicted `1.44` factor every time, never the ~0.956 hazard value. No new todo filed.
- **Arm (c) (the known first-paint-cost limitation) scored as expected**, per the source todo's own instruction -- the measured bound does not show the cost is unacceptable in practice, so the "Not in scope" architectural question (moving the apply into shell/preload) stays declined.
- **Source todo closed with a full Resolution** and the operator's as-found profile (`zoomPercent: 90`) restored and confirmed, both live and on disk, before teardown.
- **No source file touched.** `src/frontend/state/savedZoomBoot.ts`, `src/frontend/state/GlobalState.tsx`, and `src/preload/api/tauriWindowChrome.ts` remain exactly as `261015-p3q` left them -- the plan's deliberate exclusion held because nothing measured contradicted the already-pinned wiring.

## Task Commits

Each task was committed atomically:

1. **Task 1: live-gate the untouched-boot read and slider-driven 90->150 write** (tracer) - `901fc79c4` (feat)
2. **Task 2: the relaunch arm** -- quit, relaunch with 150 persisted, bracket first paint, bound apply latency, test the k-hazard, restore to 90, teardown - `0cf12aec2` (feat)
3. **Task 3: write the evidence README, close the source todo with a Resolution, no new todo filed (hazard refuted)** - `131f10e13` (docs)

**Plan metadata:** not committed by this executor -- `.planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/261015-pwy-PLAN.md` and this SUMMARY.md are left for the orchestrator's docs commit, per explicit task instruction.

## Files Created/Modified

- `.planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/README.md` - Full writeup: what was gated, file manifest, results table, bare-status-word verdicts per arm, and observations/limits
- `.planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/boot-reads.jsonl` - 7 validated `PWY` JSON-line records: both untouched-boot reads (90, 150), the post-slider 150 reads (Accessibility + Library routes), the 5x apply-latency/k-hazard probe, and the two restore records
- `.planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/01-launch1-asfound-90.jpg` - Launch 1, as-found 90% boot, window-cropped
- `.planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/02-relaunch-first-frame.jpg` - Launch 2, earliest burst frame (rel -76ms), window-cropped
- `.planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/03-relaunch-steady-150.jpg` - Launch 2, last burst frame (rel +5947ms), same crop
- `.planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/burst-index.tsv` - 54-row index: epoch_ms, rel_ms, filename
- `.planning/todos/completed/2026-10-15-saved-zoom-boot-re-apply-unverified-on-a-real-relaunch.md` - Moved from `pending/`, `## Resolution` appended summarizing all three arms plus the refuted by-product hazard

## Decisions Made

- Scored the accepted first-paint-flash limitation (arm c) as expected rather than reopening the shell/preload architectural question, because the measured bound (`< 119.1ms`, sampler-limited) does not show the cost is unacceptable in practice.
- Did not file a new todo for the `screen.availWidth` k-recomputation hazard -- it was refuted by direct measurement (5 probes, `availWidth` unchanged at 1428, factor resolved to the predicted 1.44 every time).
- Used the plan's sanctioned "dispatch fallback" (native setter + `input`/`change` event dispatch on the real range input) to restore the profile to 90 after a CGEvent click failed to grab the slider thumb's keyboard focus, preserving the constraint that a real `onChange` handler -- never a config hand-edit -- drives the value.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Mistagged PWY record caught and corrected before use**
- **Found during:** Task 2
- **Issue:** The untouched-boot-at-150 readback was initially tagged `launch2-relaunch-untouched` instead of the plan's required `launch2-relaunch-untouched-150`.
- **Fix:** Re-read the plan's exact Task 2 text, re-ran the readback JS with the correct tag, rebuilt `boot-reads.jsonl` (removed the mistagged line, appended the correctly-tagged one), and validated every line still parses as JSON.
- **Files modified:** `evidence/boot-reads.jsonl`
- **Verification:** All 7 lines of `boot-reads.jsonl` parse via `json.loads` in a validation loop; the correctly-tagged record is present.
- **Committed in:** `0cf12aec2` (Task 2 commit)

**2. [Rule 1 - Bug] CGEvent click failed to grab the slider thumb's keyboard focus for the profile restore**
- **Found during:** Task 2 (teardown/restore step)
- **Issue:** `arrows.sh 6 left` after a CGEvent click on the computed slider-thumb coordinates had no effect on the on-disk `zoomPercent` -- the click was not reaching the range input's keyboard focus.
- **Fix:** Fell back to the plan's explicitly sanctioned "dispatch fallback": `Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set.call(el,"90")` followed by dispatching native `input` and `change` events, which reaches the real `onChange` handler. Worked on first attempt.
- **Files modified:** none (runtime-only; recorded in evidence)
- **Verification:** `restore-confirmed-90` PWY record shows `zoomProp: "0.9128709291752769"`, `sliderValue: "90"`, and the on-disk `store/config.json` confirmed `"zoomPercent": 90`.
- **Committed in:** `0cf12aec2` (Task 2 commit)

**3. [Rule 1 - Bug] Bogus `labelText` field from a stray CSS text-node match**
- **Found during:** Task 2 (post-restore readback)
- **Issue:** A regex-based DOM scan for `/\(\d+%\)/` accidentally matched a `<style>` tag's raw CSS text content (containing a `150ms` substring) instead of the real zoom label.
- **Fix:** Rewrote the `restore-confirmed-90` jsonl record, dropping the bogus `labelText` field and adding a `note` field explaining the stray match was noise. The authoritative fields (`zoomProp`, `sliderValue`, `availWidth`) were correct throughout and retained.
- **Files modified:** `evidence/boot-reads.jsonl`
- **Verification:** Record now reads cleanly with no misleading field; all other fields independently corroborated by the on-disk config read.
- **Committed in:** `131f10e13` (Task 3 commit, folded in alongside the README since the cleanup postdated Task 2's original commit)

**4. [Rule 3 - Blocking] README's Conclusion section did not satisfy the plan's bare-status-word verify check**
- **Found during:** Task 3
- **Issue:** `grep -nE '^(pass|fail|bounded|refuted)\b' README.md` returned empty because the drafted (d) Conclusion used bold-prefixed bullets (e.g. "- **(a) Primary arm.**") instead of opening each verdict with a bare lowercase status word at column 0, as the plan explicitly required.
- **Fix:** Rewrote the (d) Conclusion section into literal paragraph lines, each opening at column 0 with the bare word immediately followed by the measured number (e.g. `pass 1.5774409656148782 -- arm (a)...`, `bounded < 119.1ms -- ...`, `refuted 1428 -- ...`).
- **Files modified:** `evidence/README.md`
- **Verification:** Re-ran the grep check -- 6 matching lines, satisfying the plan's verify block.
- **Committed in:** `131f10e13` (Task 3 commit)

---

**Total deviations:** 4 auto-fixed (3 bugs caught and corrected during live measurement/evidence assembly, 1 blocking verify-format fix)
**Impact on plan:** All four were self-corrections to evidence accuracy and format compliance, not scope creep -- no source file was touched, and the plan's core claim (confirmation, not a fix) held throughout.

## Issues Encountered

- **Cmd+Q did not fully quit the app on either launch's teardown.** Both times, `keystroke "q" using command down` left all five dev processes (gamelib-shell, vite, sidecar.js, the shell wrapper, the `tauri dev` node process) running and port 5173 listening. Both times, `kill -TERM` on the identified PIDs completed teardown cleanly -- the plan's sanctioned fallback, used twice, not once. No orphan survived into the next launch or past this task.
- **Comparing a full-screen burst frame to a window-cropped Launch-1 screenshot initially suggested a possible scale mismatch.** Resolved by cropping the burst frames to the window's own logical bounds (doubled for 2x Retina) via `sips`, making the frames directly comparable; no actual defect was present.
- **`npx prettier --file-info` could not take both evidence paths in one invocation** (`[error] Cannot use --file-info with multiple files`), a CLI limitation the plan's verify command did not anticipate. Ran it per-path instead; both confirmed `{ "ignored": true, "inferredParser": null }`.

## Known Stubs

None -- this task produced evidence and documentation artifacts only; no application code or UI stubs were introduced.

## Threat Flags

None -- this live gate exercised an already-reviewed boot code path with no new network, auth, file-access, or schema surface. The plan's own threat model already covers the files it deliberately left untouched.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

- The saved-Accessibility-zoom boot re-apply is now confirmed correct end-to-end (unit-pinned by `261015-p3q`, live-gated by this task) with no open defect and no reopened architectural question.
- The operator's real profile is restored to its as-found state (`zoomPercent: 90`); no orphan dev processes remain.
- No new todo was filed. The only by-product measurement (the `screen.availWidth` k-recomputation hazard) was refuted, not deferred.

## Self-Check: PASSED

- FOUND: `.planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/README.md`
- FOUND: `.planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/boot-reads.jsonl`
- FOUND: `.planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/01-launch1-asfound-90.jpg`
- FOUND: `.planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/02-relaunch-first-frame.jpg`
- FOUND: `.planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/03-relaunch-steady-150.jpg`
- FOUND: `.planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/burst-index.tsv`
- FOUND: `.planning/todos/completed/2026-10-15-saved-zoom-boot-re-apply-unverified-on-a-real-relaunch.md`
- FOUND: commit `901fc79c4`
- FOUND: commit `0cf12aec2`
- FOUND: commit `131f10e13`
- CONFIRMED: `git rev-list --count 4836623a0..HEAD` = 3, matching exactly this plan's 3 commits (no interleaving)
- CONFIRMED: `src/` and `src-tauri/` show zero uncommitted changes
- CONFIRMED: operator's `store/config.json` `zoomPercent` = 90 (as-found value restored)

---
*Phase: quick-261015-pwy*
*Completed: 2026-10-15*
