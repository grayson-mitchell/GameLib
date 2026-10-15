---
phase: quick-261015-pwy
plan: 01
type: execute
wave: 1
depends_on: []
subsystem: frontend/accessibility-zoom
tags:
  [
    accessibility,
    zoom,
    webview-zoom,
    library-tile-size,
    live-gate,
    macos,
    tauri,
    evidence,
    todos
  ]
requirements: [TODO-pwy-1]
autonomous: true
files_modified:
  # Certain -- the evidence bundle (new directory)
  - .planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/
  # Certain -- the record this task closes (moved pending -> completed, Resolution appended)
  - .planning/todos/completed/2026-10-15-saved-zoom-boot-re-apply-unverified-on-a-real-relaunch.md
  # Conditional -- ONE new todo, ONLY if the `screen.availWidth`-under-zoom read in Task 2
  # reproduces the k-recomputation hazard (Task 3 step 4). Not filed if it is refuted.
  # - .planning/todos/pending/2026-10-15-set-zoom-factor-recomputes-k-from-an-already-zoomed-screen-width.md
  #
  # Deliberately NOT in scope (constraint): src/frontend/state/savedZoomBoot.ts,
  # src/frontend/state/GlobalState.tsx, src/preload/api/tauriWindowChrome.ts. The expected
  # outcome is CONFIRMATION of already-pinned wiring, not a fix. A src edit here would need a
  # live measurement showing a defect the source todo did not already anticipate and accept.

estimate:
  tokens: 42000
  raw_tokens: 42000
  tasks: 3
  confidence: low # estimate-calibration: sample_count 0, factor 1 (applied: false)

must_haves:
  truths:
    - "On a boot that NOBODY has touched the slider on, `--webview-zoom` is present on `document.documentElement`'s INLINE style and carries a value derivable only from the persisted `zoomPercent` -- not absent, and not the 1.0 that a default/no-op path would also produce"
    - "The saved percent reaches the screen after a real process quit-and-relaunch: the steady state after relaunch is the saved 150%, measured as a number, not described"
    - "The Library's `.gameList` grid track is the slider-chosen `--library-tile-width` divided by the applied zoom from the FIRST Library paint of the relaunch -- i.e. Accessibility zoom does not resize tiles, before anything is touched"
    - "The first-paint factor-1 window is given a MEASURED upper bound with its instrument's resolution stated -- never reported as zero, and never re-filed as a defect (the source todo accepted it)"
    - "The slider was driven through its own React `onChange` (label reads 150%, on-disk `zoomPercent` is 150) -- the config file was never hand-edited to set up the arm"
    - "The operator's profile is left as found (`zoomPercent: 90`) and no `gamelib-shell`, `tauri dev`, `vite` or port-5173 holder survives the run"
  artifacts:
    - "evidence/README.md -- (a) what, (b) files, (c) per-arm results table with numbers, (d) conclusion, (e) observations and limits"
    - "evidence/boot-reads.jsonl -- one JSON record per console read, straight from gamelib.log"
    - "evidence/*.jpg|png -- the bracketing burst frames and the 150% Library frame, READ not merely captured"
    - "todo moved to .planning/todos/completed/ with a Resolution naming this quick id and the per-arm verdicts"
  key_links:
    - "real slider onChange -> configStore.set('zoomPercent') -> store/config.json on disk (Task 1 proves the write)"
    - "fresh process boot -> GlobalState.componentDidMount -> applySavedZoomAtBoot -> window.api.setZoomFactor -> tauriSetZoomFactor -> getCurrentWebview().setZoom -> publishWebviewZoom('--webview-zoom') -> .gameList track width (Task 2 proves the read-back end of it)"
---

# Quick Task 261015-pwy: live-gate the saved Accessibility zoom's boot re-apply

## Why this plan is measurement-only

Quick 261015-p3q already shipped the wiring and pinned its desk-provable half (`savedZoomBoot.test.ts`
13/13, `GlobalStateSavedZoomWiring.test.ts` 5/5, with a self-test arm proving the matchers can fail).
Nothing downstream of the call site changed. This plan's deliverable is therefore a **measured record**,
not a fix: three arms run on the operator's Mac, each with a number behind it, and the source todo closed
on what was actually observed. A src edit is out of scope unless an arm reveals a defect the source todo
did not already anticipate and accept -- and the one such candidate (the `k`-recomputation read in Task 2)
is routed to a NEW todo, not to an in-flight fix.

## Locked facts measured at desk before this plan was written

Use these as pass bars; do not re-derive them mid-run.

- **As-found persisted zoom is `"zoomPercent": 90`** in `~/Library/Application Support/gamelib/store/config.json`
  (the frontend `configStore` is `TypeCheckedStoreFrontend('configStore', { cwd: 'store' })`,
  `src/frontend/helpers/electronStores.ts:120`). This is a **gift**: the as-found boot is already a
  non-default saved zoom, so arm (b) gets a discriminating read before anything is touched. At 100 the
  published factor is exactly 1.0, which is indistinguishable from a default/no-op path; at 90 it is not.
- **The slider is `min="60" max="200" step="10"`** (`src/frontend/screens/Accessibility/index.tsx:118-127`),
  so 150 is a reachable step and 90 -> 150 is exactly 6 `ArrowRight` presses.
- **`tauriSetZoomFactor`'s arithmetic** (`src/preload/api/tauriWindowChrome.ts`):
  `k = screen.availWidth < 1200 ? screen.availWidth/1200 : 1`, `level = (f*k - 1)/0.2`,
  `factor = 1.2**level`, then `setZoom(factor)` and -- only after it resolves -- `--webview-zoom = String(factor)`.
  With this Mac's ~1280 logical width, `k = 1`, so:
  - saved 90 -> **`--webview-zoom` = 0.9128709** (1.2^-0.5)
  - slider 150 -> **`--webview-zoom` = 1.5774410** (1.2^2.5)
  - a probe call at 1.4 while `k` is still 1 -> **1.44** (1.2^2)
- **The webview's devtools are force-opened at startup on macOS debug builds**
  (`should_auto_open_devtools`, `src-tauri/src/main.rs:2342`, false only for linux), so the console is
  available at boot without any hand-driving -- which is what makes arm (b)'s "before touching the slider"
  read possible at all.
- **Readback channel is `window.api.logInfo(...)` into `~/Library/Logs/GameLib/gamelib.log`.**
  `document.title` is NOT a readback channel under Tauri (measured in 261015-n5k).
- **Library tile token chain:** `libraryTileSize.ts:118` writes `--library-tile-width`;
  `src/frontend/screens/Library/index.css:95` declares `--library-tile-css-width: calc(var(--library-tile-width,156px) / var(--webview-zoom,1))`;
  `.gameList`'s `grid-template-columns: repeat(auto-fill, var(--library-tile-css-width,156px))`
  resolves to real px in `getComputedStyle`, which is the numeric readout for arm (b)'s second half.
- **No ffmpeg/ffprobe on this machine** (`command -v` both empty) and `screencapture -v` only finalises
  its container when its own `-V` limit expires. **Nothing here frame-steps a movie**, so the first-paint
  instrument is a timestamped STILL burst with a measured interval, not a video.

## Locked decisions

- **Primary launcher is `pnpm tauri:dev`** (dev vault; no keyring arm -- nothing in this chain touches
  auth), started **detached**: `nohup pnpm tauri:dev > $SD/launch-N.log 2>&1 & disown`. Never a harness
  background task (OOM-killed mid-arm, reported as exit 0 through a tee). Confirm the launch from the log
  tail and a window in `winlist`, never from an exit code.
- **The slider is driven, not the config file.** Order of preference, with whichever was used recorded:
  (1) CGEvent click into the page + 6 `ArrowRight` keystrokes on the focused range input;
  (2) fallback -- a real `input`+`change` dispatch on the real element through
  `HTMLInputElement.prototype` 's value setter, which still runs `handleZoomLevel` ->
  `setZoomPercent` -> `configStore.set` + `window.api.setZoomFactor`. **Proof that the real handler ran is
  the same either way:** the label reads `(150%)` AND the on-disk `zoomPercent` is 150. Hand-editing
  `store/config.json` to stage a value is forbidden -- it would bypass the exact write half the gate claims.
- **The first-paint flash is scored, not hunted.** The source todo already accepted a brief factor-1 first
  paint as the cost of the `componentDidMount` layer and declined moving the apply to shell/preload. The
  arm's deliverable is an **upper bound with the instrument's resolution stated**. "No 100% frame was
  captured at a 350 ms sampling interval" is a correct, publishable result; "there is no flash" is not,
  and neither is a new todo re-filing it.
- **Profile hygiene.** Back up `store/config.json` to `$SD` (**not** into `evidence/` -- a real-profile
  config has leaked session data into a captured artifact twice in this repo). Only the `zoomPercent`
  value goes into evidence. Restore the as-found 90 through the slider before teardown.
- **Reuse 261015-n5k's rig** (`.planning/quick/261015-n5k-live-gate-for-261015-dlu-verify-the-embe/evidence/{winlist.swift,click.swift,type.sh}`)
  rather than reinventing console-typing. Copy into `$SD`, `swiftc -O` the two Swift files, repoint
  `type.sh`'s `SD`.
- **Schema-push gate: checked, does not apply.** No `prisma/schema.prisma`, `drizzle/schema.ts`,
  `src/collections/**`, `supabase/migrations/*.sql` or `src/entities/**` path is in scope; this task writes
  only `.planning/` artifacts. Stated rather than skipped silently.

Throughout: `$SD` is the executing session's own scratchpad directory. Every repo path below is
repo-root-relative and every `<automated>` command assumes cwd at the checkout root.

<tasks>

<task type="tracer">
  <name>Task 1: End-to-end -- one launch that proves the rig, reads the untouched boot, and drives the real slider to 150%</name>

  <files>
    .planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/boot-reads.jsonl
    .planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/01-launch1-asfound-90.jpg
  </files>

  <precondition>No `tauri dev`, `gamelib-shell`, `vite` or port-5173 listener is running, and `~/Library/Application Support/gamelib/store/config.json` still holds `"zoomPercent": 90`; if either is false, stop and report rather than launching over it.</precondition>

  <read_first>
    - .planning/todos/pending/2026-10-15-saved-zoom-boot-re-apply-unverified-on-a-real-relaunch.md (the three arms, in the author's words)
    - src/frontend/state/savedZoomBoot.ts (what is being confirmed; do not edit)
    - src/preload/api/tauriWindowChrome.ts (`tauriSetZoomFactor` + `publishWebviewZoom` -- the arithmetic the pass bars come from)
    - src/frontend/screens/Accessibility/index.tsx:110-140 (the real slider: min/max/step and the `(N%)` label that is the readback)
    - src/frontend/screens/Library/index.css:1-15 and :90-98 (`.gameList` track and the tile-width calc)
    - .planning/quick/261015-n5k-live-gate-for-261015-dlu-verify-the-embe/evidence/README.md (the rig this run reuses: console typing, logInfo readback, window capture)
  </read_first>

  <action>
Single launch on the as-found profile. This is the thin end-to-end slice through every layer the gate
touches -- launcher, window, auto-opened console, hash route, real slider onChange, configStore on disk,
preload bridge, webview setZoom, published property, Library track width -- so a dead rig or a wrong
assumption surfaces here, on one launch, instead of after the relaunch arm is spent.

1. Preflight. Assert empty: `pgrep -f 'target/debug/gamelib-shell'`, `pgrep -f 'bin/vite'`,
   `pgrep -f 'sidecar.js'`, `pgrep -f 'tauri dev'`, `lsof -nP -iTCP:5173 | grep LISTEN`. Record the
   as-found `zoomPercent` by grepping the store config, and `cp` that file to `$SD/config.json.asfound`
   (scratchpad only, never `evidence/`). Create `evidence/`.
2. Build the rig in `$SD`: copy n5k's `winlist.swift`, `click.swift`, `type.sh`; `swiftc -O` the two
   Swift files to `$SD/winlist` and `$SD/click`; repoint `type.sh`'s `SD` at this session's scratchpad.
3. Launch detached into `$SD/launch-1.log`. Poll the log tail until the window is up and confirm with
   `$SD/winlist gamelib` that a window taller than 300 px exists (tooltips are same-pid tiny windows and
   will be picked by a naive first-match). **Note the last log line printed at least 2 s before the
   window appeared and its offset -- Task 2 needs it as the burst's start marker.**
4. Arm (b) on the as-found profile, BEFORE touching anything. Drive one console line through `type.sh`
   that calls `window.api.logInfo` with a `PWY ` prefix and a JSON object carrying, at minimum:
   `tag` (`launch1-asfound-untouched`), `zoomProp` (`document.documentElement.style.getPropertyValue('--webview-zoom')`),
   `rootInlineStyle` (`document.documentElement.getAttribute('style')`), `availWidth` (`screen.availWidth`),
   `innerWidth`, `dpr` (`devicePixelRatio`), `paint` (`performance.getEntriesByType('paint')` mapped to
   name/startTime pairs -- an empty array is a datum about WebKit paint timing, not a failure),
   `tileWidth` (`getComputedStyle(document.documentElement).getPropertyValue('--library-tile-width')`),
   `gridCols` (`getComputedStyle(document.querySelector('.gameList')).gridTemplateColumns`, guarded for a
   missing node) and `hash` (`location.hash`). Route to the Library first if `.gameList` is absent.
   **Pass bar: `zoomProp` parses to 0.9128709 +/- 1e-5.** Empty, or exactly 1, is the failure this gate
   exists to catch -- if it happens, stop and record it rather than proceeding to arm (a).
   If `.gameList` does not exist (an empty library under the dev vault), measure the token arithmetic
   instead with a throwaway div whose inline width is the same `calc(var(--library-tile-width,156px) / var(--webview-zoom,1))`,
   appended to `document.body`, measured with `getBoundingClientRect().width`, then removed -- and record
   in the JSON which path was used.
5. Capture the window (`screencapture -x -o -l<id>`) as `evidence/01-launch1-asfound-90.jpg` and read it:
   the UI should look slightly smaller than default, consistent with 90%.
6. Drive the slider. Route to `#/accessibility`, confirm the label reads `(90%)`. CGEvent-click into the
   page (a harmless spot, e.g. the heading) to move keyboard focus out of the inspector, `focus()` the
   range input from the console, assert `document.activeElement` is the range input, then send 6
   `ArrowRight` keystrokes (`key code 124`) to the frontmost `gamelib-shell`. If the value does not move,
   fall back to the real `input`+`change` dispatch through the prototype value setter and say so in the
   record. Re-read the label: it must read `(150%)`.
7. Read the live apply: another `PWY ` record tagged `launch1-after-slider-150` with the same keys.
   **Pass bars:** `zoomProp` is 1.5774410 +/- 1e-5 (the `k = 1` branch, because `availWidth` while at
   factor 0.9129 still reads above 1200); `gridCols` track px multiplied by `zoomProp` equals `tileWidth`
   within 1 px. Record `availWidth` at this zoom verbatim -- Task 2 needs it.
8. Prove the write half: grep the on-disk store config for `zoomPercent`. **It must be 150.**
9. Quit and tear down. `keystroke "q" using command down` to the frontmost `gamelib-shell`; then kill any
   surviving `tauri dev` / `vite` / sidecar and re-assert the whole preflight list is empty. An orphan
   `vite` on 5173 silently absorbs the next launch.
10. Append every `PWY ` record from `~/Library/Logs/GameLib/gamelib.log` (`tr '\r' '\n'`) to
    `evidence/boot-reads.jsonl`, verbatim, one JSON object per line.
  </action>

  <verify>
    <automated>test -s .planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/boot-reads.jsonl &amp;&amp; grep -c 'launch1-asfound-untouched' .planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/boot-reads.jsonl &amp;&amp; grep -c 'launch1-after-slider-150' .planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/boot-reads.jsonl</automated>
    <automated>grep -o '"zoomPercent"[^,}]*' "$HOME/Library/Application Support/gamelib/store/config.json"</automated>
    <automated>pgrep -f 'target/debug/gamelib-shell'; pgrep -f 'bin/vite'; pgrep -f 'sidecar.js'; pgrep -f 'tauri dev'; lsof -nP -iTCP:5173 | grep LISTEN; echo "teardown-probe-done"</automated>
    <human-check>Frame `01-launch1-asfound-90.jpg` was opened and read (not merely captured), and the untouched-boot `zoomProp` of 0.9128709 is in the jsonl -- a value only the persisted 90 can produce.</human-check>
  </verify>

  <done>
One `pnpm tauri:dev` launch produced two `PWY ` records: an untouched boot whose `--webview-zoom` carries
the saved 90's factor, and a post-slider read at 150% with the `.gameList` track consistent with it. The
on-disk `zoomPercent` is 150, set through the slider's own handler. Every process and the 5173 listener are
gone. The burst start marker for Task 2 is recorded.
  </done>
</task>

<task type="auto">
  <name>Task 2: The relaunch arm -- bracket the first paint, read the 150% boot before anything is touched, bound the apply latency</name>

  <files>
    .planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/boot-reads.jsonl
    .planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/02-relaunch-first-frame.jpg
    .planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/03-relaunch-steady-150.jpg
    .planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/burst-index.tsv
  </files>

  <precondition>Task 1 left `"zoomPercent": 150` on disk and nothing running; the burst start marker from `$SD/launch-1.log` is known.</precondition>

  <action>
This is the arm the todo was filed for: a real process relaunch with 150 already persisted.

1. Preflight again (same five probes). Confirm the on-disk `zoomPercent` is still 150.
2. Calibrate the instrument FIRST. Run 10 `screencapture -x -t jpg` full-screen captures into
   `$SD/burst/cal/`, timestamping each with `date +%s%3N` before and after, and compute the mean achievable
   interval. **That number is the measurement's resolution and must appear in the record.** A full-screen
   Retina capture here is expected to land in the hundreds of milliseconds, which is very likely coarser
   than the flash -- that is the honest ceiling of this rig, not a reason to improvise a finer-looking one.
3. Launch detached into `$SD/launch-2.log`. Poll it for the Task 1 start marker; the moment it appears,
   start a burst loop writing `$SD/burst/<epoch_ms>.jpg` continuously, and stop it 6 s after `$SD/winlist`
   first reports a gamelib window taller than 300 px (cap the loop at 60 s regardless). Write
   `evidence/burst-index.tsv` with one row per frame: epoch_ms, ms since the first window sighting, filename.
4. Read the frames around the window's first appearance. Find the last frame rendered at 100% (if any) and
   the first frame rendered at 150%, and report the flash as a bracket. Three outcomes, all publishable:
   a 100% frame exists -> the bracket IS the measured flash duration; no 100% frame exists -> the flash is
   shorter than the calibrated interval, reported as "< N ms, not resolved by a N ms sampler"; the UI is
   still at 100% seconds later -> the boot re-apply FAILED, which is a real defect and the one outcome that
   justifies touching src. Copy the two bracketing frames into `evidence/` as `02-relaunch-first-frame.jpg`
   and `03-relaunch-steady-150.jpg` and READ them -- a captured-but-unread frame measures nothing.
5. Arm (b) at 150, BEFORE touching the slider. One `PWY ` record tagged `launch2-relaunch-untouched-150`
   with Task 1's key set plus `labelText` (the Accessibility label, only if already routed there -- do not
   touch the slider to get it). **Pass bars:** `zoomProp` is 1.5774410 +/- 1e-5; `gridCols` track px times
   `zoomProp` equals `tileWidth` within 1 px -- i.e. tiles are the slider-chosen width from the first
   Library paint, not only after the slider is touched (the residual half of 261011-t4y's (c)).
6. Bound the apply latency (the sub-frame half of arm (a), since the burst cannot resolve it). Five times:
   read `performance.now()` into `t0`, call `window.api.setZoomFactor('1.4')`, poll with
   `requestAnimationFrame` until `--webview-zoom` changes, record the delta and the resulting value; then
   call it again with `'1.5'` to restore. Report mean and max.
   **This probe is also the `k`-recomputation test, for free.** It runs while the page is already zoomed to
   1.577441. If WebKit scales screen metrics with page zoom, `screen.availWidth` now reads about 811
   (1280/1.577441), `k` becomes about 0.676, and the probe's resulting factor is about 0.956 instead of
   **1.44** -- a near-reset of the whole UI on the second zoom change of a session. Record `availWidth` in
   the same record. If the resulting factor is 1.44 and `availWidth` is unchanged, the hazard is REFUTED and
   Task 3 files nothing; if it is the low value, Task 3 files one new todo. Either way, do not fix it here.
7. Restore the profile: drive the slider back to 90 (6 `ArrowLeft`, or the dispatch fallback), confirm the
   label and the on-disk value. Note in the record that the restore's own applied factor may be the
   `k`-affected one if step 6 reproduced the hazard -- what matters for leaving the profile as found is the
   persisted 90, which the next boot applies with `k = 1`.
8. Quit, tear down, re-assert all five probes empty. Append every new `PWY ` record to
   `evidence/boot-reads.jsonl`.
  </action>

  <verify>
    <automated>grep -c 'launch2-relaunch-untouched-150' .planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/boot-reads.jsonl &amp;&amp; test -s .planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/burst-index.tsv &amp;&amp; wc -l &lt; .planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/burst-index.tsv</automated>
    <automated>ls -l .planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/02-relaunch-first-frame.jpg .planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/03-relaunch-steady-150.jpg</automated>
    <automated>grep -o '"zoomPercent"[^,}]*' "$HOME/Library/Application Support/gamelib/store/config.json"</automated>
    <automated>pgrep -f 'target/debug/gamelib-shell'; pgrep -f 'bin/vite'; pgrep -f 'sidecar.js'; pgrep -f 'tauri dev'; lsof -nP -iTCP:5173 | grep LISTEN; echo "teardown-probe-done"</automated>
    <human-check>Both bracketing frames were opened and read; the calibrated sampling interval is written down; the restored on-disk `zoomPercent` is 90.</human-check>
  </verify>

  <done>
A relaunch with 150 persisted produced: an untouched-boot `--webview-zoom` of 1.5774410, a `.gameList`
track consistent with it from the first Library paint, a first-paint bracket with its sampler's resolution
stated, a mean/max apply latency over five probes, and a verdict on whether `screen.availWidth` moves under
page zoom. The profile is back at 90 and nothing is running.
  </done>
</task>

<task type="auto">
  <name>Task 3: Write the record, score the accepted limitation as expected, close the todo</name>

  <files>
    .planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/README.md
    .planning/todos/completed/2026-10-15-saved-zoom-boot-re-apply-unverified-on-a-real-relaunch.md
  </files>

  <action>
1. Write `evidence/README.md` in this repo's live-gate evidence shape (the 261015-n5k precedent):
   **(a) what** was gated and with which launcher; **(b) files** -- a table of every artifact and what it
   holds; **(c) results** -- one row per arm with the MEASURED number beside the predicted one
   (untouched-boot factor at 90: 0.9128709; at 150: 1.5774410; track px x factor vs `--library-tile-width`;
   the first-paint bracket with its sampler interval; the apply latency mean/max; `screen.availWidth` at
   each zoom); **(d) conclusion**; **(e) observations and limits** -- including, explicitly, that nothing
   here frame-steps a movie so the flash bound is a sampler bound, and that `gridCols`/tile numbers were
   taken under a docked inspector (a smaller layout viewport changes the column COUNT, not the track width).
   Open each arm's verdict with a bare status word from exactly this vocabulary: `pass`, `fail`,
   `bounded` (measured only as an upper bound), `refuted` (a predicted hazard that did not reproduce).
   Put the number after the word, never before it.
2. Score the todo's arm (c) correctly: a brief factor-1 first paint is the ACCEPTED cost of applying at the
   earliest statement of `componentDidMount`, already weighed and declined-at-another-layer in 261015-p3q's
   resolution. Say so in (d) and file nothing for it. Re-opening that layer decision needs a measurement
   showing the window is unacceptable in practice -- if the bracket shows a multi-second stay at 100%, that
   is a different finding (a failed apply, not a flash) and belongs in (d) as such.
3. Move `.planning/todos/pending/2026-10-15-saved-zoom-boot-re-apply-unverified-on-a-real-relaunch.md`
   to `.planning/todos/completed/` with `git mv` and append a `## Resolution` section naming quick
   `261015-pwy`, the per-arm verdicts with their numbers, the evidence path, and the fact that no src change
   was required. `completed/` is exempt from the triage-frontmatter gate, so leave the existing frontmatter
   as it is -- do not restyle it.
4. **Only if Task 2 step 6 reproduced the hazard** (`screen.availWidth` shrinks under page zoom and the
   probe's resulting factor was not 1.44), file ONE new todo in `.planning/todos/pending/` for
   `tauriSetZoomFactor` recomputing `k` from an already-zoomed `screen.availWidth`. Carry all three triage
   keys the `/gsd-add-todo` template omits, bare and lowercase, in order: `severity: medium`,
   `platform: any`, `ready: code`. Body must carry the measured numbers (both `availWidth` reads, the
   expected 1.44 and the observed factor) and name the one-line mechanism; propose no fix. If it was
   refuted, record the refutation in (e) and file nothing -- a refuted hazard is a result worth keeping.
5. Formatter convention: every path written by this plan is under `.planning/`. Probe each with
   `npx prettier --file-info`; they report `"ignored": true` with a null parser, so **no `prettier --check`
   is run** -- stated here rather than carrying a green that proves nothing. Run `pnpm planning-gates`,
   which does see the todo move.
  </action>

  <verify>
    <automated>npx prettier --file-info .planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/README.md .planning/todos/completed/2026-10-15-saved-zoom-boot-re-apply-unverified-on-a-real-relaunch.md</automated>
    <automated>pnpm planning-gates</automated>
    <automated>test -f .planning/todos/completed/2026-10-15-saved-zoom-boot-re-apply-unverified-on-a-real-relaunch.md &amp;&amp; test ! -f .planning/todos/pending/2026-10-15-saved-zoom-boot-re-apply-unverified-on-a-real-relaunch.md &amp;&amp; grep -c '^## Resolution' .planning/todos/completed/2026-10-15-saved-zoom-boot-re-apply-unverified-on-a-real-relaunch.md</automated>
    <automated>grep -nE '^(pass|fail|bounded|refuted)\b' .planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/evidence/README.md | head -20</automated>
    <automated>git status --porcelain src/ src-tauri/ > "$TMPDIR/pwy-src-dirty.txt"; echo "status-rc=$?"</automated>
    <automated>wc -l &lt; "$TMPDIR/pwy-src-dirty.txt"; cat "$TMPDIR/pwy-src-dirty.txt"</automated>
  </verify>

  <done>
`evidence/README.md` carries all five sections with a measured number beside every predicted one and a
bare status word opening each verdict; the todo is in `completed/` with a Resolution naming this quick id;
arm (c) is scored as the expected cost of the chosen layer and not re-filed; the `k` hazard is either one
new correctly-fronted todo or a written refutation; `src/` and `src-tauri/` are untouched; `pnpm planning-gates`
and the `--file-info` probe both ran and their results are stated.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary                       | Description                                                                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| none newly crossed             | This task runs already-shipped code and reads it back. It adds no code path, no endpoint, no parser and no new input source.                               |
| renderer -> local config store | Pre-existing: the slider persists an integer percent through the existing `storeSet` bridge. Already hardened in 261015-p3q (T-261015-P3Q-01/02/03).        |
| operator profile -> artifacts  | Live-gate hygiene, not a product surface: a real-profile `store/config.json` is read and backed up. It must not land in a committed artifact.               |

## STRIDE Threat Register

| Threat ID       | Category          | Component                                 | Severity | Disposition | Mitigation Plan                                                                                                                                                      |
| --------------- | ----------------- | ----------------------------------------- | -------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-261015-PWY-01 | Information Disc. | the operator's `store/config.json` backup | medium   | mitigate    | Back it up to `$SD` only; copy no profile file into `evidence/`; put only the `zoomPercent` integer in the record. Twice in this repo a real-profile capture leaked session data. |
| T-261015-PWY-02 | Tampering         | the live profile under test               | low      | mitigate    | Restore the as-found `zoomPercent: 90` through the slider before teardown and verify it on disk; the `$SD` backup is the fallback.                                      |
| T-261015-PWY-03 | Denial of Service | orphan `tauri dev` / `vite` / 5173 holder | low      | mitigate    | Assert the five-probe teardown list empty before AND after every launch; an orphan silently absorbs the next launch and would make a later gate measure nothing.        |
| T-261015-PWY-SC | Tampering         | npm/pip/cargo installs                    | high     | mitigate    | Retained by convention: this plan adds NO package-manager install task, so the legitimacy gate has nothing to admit. Any `[ASSUMED]`/`[SUS]` package appearing later needs the blocking human checkpoint first. |

No network, auth, privilege-boundary or schema/ORM surface is involved: the task sets a local zoom
percentage and reads a CSS custom property plus a resolved grid track through the devtools console.
</threat_model>

<verification>
- Three `PWY ` records in `evidence/boot-reads.jsonl`: untouched boot at 90, post-slider 150, untouched
  relaunch boot at 150 -- each with `zoomProp`, `availWidth`, `tileWidth` and `gridCols`.
- The two predicted factors (0.9128709 and 1.5774410) each matched within 1e-5, or the mismatch is recorded
  as the finding with the observed value and the `availWidth` that explains it.
- `gridCols` track px x `zoomProp` equals `--library-tile-width` within 1 px on the untouched relaunch boot.
- A first-paint bracket exists with the sampler's calibrated interval stated beside it.
- The todo is in `completed/` with a Resolution; `src/` and `src-tauri/` are clean in `git status`.
- `pnpm planning-gates` green; `npx prettier --file-info` reports every written path ignored, with no
  vacuous `--check` claimed.
</verification>

<success_criteria>
The source todo's three arms each have a verdict backed by a number and a frame, the accepted first-paint
limitation is scored as expected rather than re-filed, the `k`-recomputation by-product is either one
correctly-fronted new todo or a written refutation, the operator's profile is as found, and no process or
port holder survives.
</success_criteria>

<output>
Create `.planning/quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/261015-pwy-SUMMARY.md` when done.
</output>
