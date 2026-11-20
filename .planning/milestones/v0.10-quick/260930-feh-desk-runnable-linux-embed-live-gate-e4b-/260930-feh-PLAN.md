---
phase: quick-260930-feh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/BASE.sha
  - .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/gate_live.ts
  - .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/region_diff.py
  - .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/hidpi_check.py
  - .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/drag_probe.py
  - .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/settled_lag.py
  - .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/evidence/
  - .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md (appended addendum only; frontmatter unchanged)
autonomous: true
requirements:
  - QUICK-260930-FEH

estimate:
  tokens: 130000
  raw_tokens: 130000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "The scale-1 run uses a fresh createFakeHomeProfile() with WEBKIT_DISABLE_DMABUF_RENDERER absent from the shell's environment AND from every WebKitWebProcess the harness sees. LD_PRELOAD and GDK_SCALE are absent too. In that run, opening /store/gog puts GOG in the renderer's slot, and check_settled.py passes over the tracer snapshot. If it does not, TRACER is recorded as FAIL, the stop rule fires, and no DMABUF=1 run is scored."
    - "E4b: after GOG -> Epic -> GOG, the embed is back in the slot and not drawn over the app chrome. region_diff.py finds the chrome band and the left nav unchanged against the pre-Epic GOG capture, re-computed from committed captures. Every settled line in the E4b snapshot passes check_settled.py. Any other outcome is recorded as FAIL, a finding under the stop rule."
    - "E5 is RECORDED and never gating. It records whether a link click inside the embed navigated it, the URL label before and after, whether Back looked enabled, and whether Back returned to page A (YES / NO / UNCONFIRMED), with slot-diff numbers. It is recorded as not gating because Phase 40 Observable Truth 6 is FAILED on macOS itself."
    - "HiDPI: the effective GDK scale is MEASURED as the X client window size divided by the GTK logical vbox from a settled line. HiDPI checks are scored only if that ratio is 2 (within 1 px). Otherwise every HIDPI_* line reads NOT_ACHIEVABLE and nothing is passed. When the ratio is 2, the renderer's slot rect and the embed's GTK rect agree in logical px: embed == requested, and requested is flush with the vbox's right and bottom edges, the same property measured at scale 1 at the same logical sizes as a positive control. Resize, wheel and click-through are then scored."
    - "Drag-resize (the Linux branch of 38-E04) is measured only as far as the harness can see. For each scripted resize step, settled_lag.py reports whether a correct settled line arrived (MISSING / STALE counts) and the lag from the X window size change to that line. The 500 ms debounce floor and the 50 ms poll granularity are stated with the numbers. Per-frame staleness, tearing and perceived responsiveness are written down as NOT MEASURED."
    - "Deliverables are honest and scoped. results.txt carries exactly one CHECK line per check id and at least 5 NOT_VERIFIED lines (packaged AppImage, real logged-in profile, Wayland, macOS, Windows). A dated addendum is appended to the positioning todo: the base bytes are an unchanged prefix, so the frontmatter stays unchanged and `ready: live-gate` stays. 38-VERIFICATION.md is byte-identical to BASE. src/ and src-tauri/ are unchanged against BASE unless the <15-line trivial-fix exception was taken and recorded as FIX_TAKEN=yes. No committed evidence file contains the fake-profile directory prefix."
  artifacts:
    - path: ".planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/gate_live.ts"
      provides: "Copy of blh embed_live.ts: repeatable --set (refuses DMABUF/LD_PRELOAD), per-WebKitWebProcess env identity lines, T=<epoch ms> prefixed settled lines drained every 50 ms"
      contains: "WEBPROC "
    - path: ".planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/region_diff.py"
      provides: "Changed-pixel fractions for chrome / leftnav / slot regions derived from a settled line x scale, with --selftest"
      contains: "--selftest"
    - path: ".planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/hidpi_check.py"
      provides: "Scale ratio (X client / GTK vbox) plus the logical-px flush check, with --selftest that rejects a scale-1 window and both unit mixups"
      contains: "SCALE_NOT_IN_EFFECT"
    - path: ".planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/settled_lag.py"
      provides: "Per-step MISSING / STALE / lag from drag_probe step lines joined to T-stamped settled lines, with --selftest"
      contains: "MISSING"
    - path: ".planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/evidence/results.txt"
      provides: "One CHECK line per check id, NOT_VERIFIED lines, FIX_TAKEN, launch counts"
  key_links:
    - from: "gate_live.ts settled-line drain"
      to: "check_settled.py / region_diff.py / hidpi_check.py / settled_lag.py"
      via: "each kept stderr line written as `T=<epoch ms> [shell] store_embed(linux): ...`; every checker parses with a regex search, so the prefix is tolerated"
      pattern: "T=\\d+ \\[shell\\] store_embed\\(linux\\)"
    - from: "drag_probe.py step lines (wall-clock ms)"
      to: "settled_lag.py"
      via: "same host wall clock: Date.now() in the harness, time.time()*1000 in the driver"
      pattern: "STEP arm="
    - from: "results.txt PASS claims"
      to: "the checkers re-run over committed evidence in <verify>"
      via: "claim -> checker: a PASS line is only accepted if the checker reproduces it from the committed files"
      pattern: "^CHECK="
---

<objective>
Run a desk-runnable Linux live gate for the GTK-box-native store embed (quick 260930-blh) on the dev
build, on this X11 host, with `WEBKIT_DISABLE_DMABUF_RENDERER` genuinely unset and a fresh fake-HOME
profile per launch. It covers the four things still unmeasured after quick 260930-ea0:

1. E4b (GOG -> Epic -> GOG returns to the slot) and E5 (a link click plus Back, recorded honestly).
2. HiDPI at `GDK_SCALE=2`: tracer, resize, wheel and click-through. This includes whether the
   renderer's slot rect and the embed's GTK rect agree in logical px.
3. Drag-resize staleness and latency, which is the Linux branch of 38-E04, measured only as far as
   the settled-line harness can see.

This is a MEASUREMENT task. No product code changes. A defect found here is recorded as a finding
under the stop rule. The one exception is a clearly scoped fix under ~15 lines, re-verified.

Purpose: the positioning todo is `ready: live-gate`, and its last addendum says E4b and E5 were NOT
RUN, and that HiDPI and drag-resize were never measured. This plan measures what can be measured at
the desk and states plainly what it does not measure.

Output: the harness and checkers, curated evidence, `evidence/results.txt`, the SUMMARY, and one dated
addendum on the positioning todo. The todo's frontmatter is unchanged and `ready: live-gate` stays.
`38-VERIFICATION.md` is not edited.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md
@.planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/260930-blh-SUMMARY.md
@.planning/quick/260930-ea0-stop-auto-opening-web-inspector-on-linux/260930-ea0-SUMMARY.md

Harness sources reused BY PATH, and never edited:
- `.planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/embed_live.ts`. This is the base
  that gets copied to `gate_live.ts`.
- `.planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/check_settled.py`, the settled-line
  judge. It has its own `--selftest`.
- `.planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/cap.py`, which captures the window
  client area at the xwininfo absolute origin.
- `.planning/quick/260930-ea0-stop-auto-opening-web-inspector-on-linux/probe_live.ts` lines 87-96
  (`descendants()`) and 196-218 (the shell and WebKitWebProcess env identity lines). These are the
  pieces to port.

Code facts. Read-only: this plan changes no product code.
- `src-tauri/src/main.rs:5613-5637` `store_embed_linux_settled_line`. The format is
  `[shell] store_embed(linux): settled requested=x,y,wxh embed=x,y,wxh main=x,y,wxh vbox=wxh`. `embed`
  and `main` are MEASURED GTK allocations. `vbox` is measured at log time.
- `src-tauri/src/main.rs:5827-5850`. `apply_bounds` runs only when the renderer sends a rect, and it
  schedules the settled log `SETTLE_MS = 500` after the LAST rect (a generation counter drops earlier
  ones). Consequences:
  - No settled line fires during a continuous resize burst.
  - Every settled line lands at least 500 ms after the renderer's last rect.
  - A missing settled line after a resize means the renderer never re-sent bounds, which leaves the
    embed at stale geometry.
- `src-tauri/src/main.rs:5567-5595`. The rect is rounded to `i32` logical px. `:5662-5668`: a
  zero-area rect is ignored with an `ignored zero-area bounds` line, which is not a settled line.
- Measured invariant at scale 1 (ea0 `evidence/bonus-e1e4/ea0-unset-expansion-settled.log`): the
  slot is flush with the viewport's right and bottom edges. At 1280x800 it is `204,82,1076x718`
  (204+1076=1280, 82+718=800). At 1100x700 it is `204,82,896x618`. A unit mixup in either direction
  (renderer sending physical px, or GTK halving) breaks this flush property, so it is the logical-px
  agreement oracle for HiDPI.

Host facts, measured 2026-09-30 while planning:
- X11 session on `DISPLAY=:1`. `GDK_SCALE`, `GDK_DPI_SCALE` and `WEBKIT_DISABLE_DMABUF_RENDERER` are
  all unset in the operator shell. `gsettings org.gnome.desktop.interface scaling-factor` is `0`.
- Screen 6000x1600. The primary is DisplayPort-1-0 at 3440x1440+0+0. eDP-1-0 is 2560x1600+3440+0.
- WebKitGTK 2.50.4. The main window config is 1280x800 logical and resizable. devUrl is
  `http://localhost:5173`.
- At GDK_SCALE=2 the configured window would be 2560x1600 physical, which does not fit the primary
  monitor's 1440 rows. Expect the window manager to clamp or offset it. That is why Task 2 normalizes
  geometry first.
- xdotool, xwininfo, python3 with mss and PIL are all present. The debug binary is
  `src-tauri/target/debug/gamelib-shell`.
</context>

<conventions_for_every_task>
These apply to all three tasks. They are here once so the actions can stay short.

- Paths:
  - `Q=.planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-`
  - `BLH=.planning/quick/260930-blh-build-the-gtk-box-native-linux-layout`
  - Evidence subdirectories: `$Q/evidence/s1/` (Task 1), `$Q/evidence/hidpi/` (Task 2) and
    `$Q/evidence/drag/` (Task 3).
  - `R=$Q/evidence/results.txt`.
  - `RAW` = the executor's session scratchpad directory, for stop-files, raw captures and the vite
    log. Never commit `RAW`.
- Two-profile rule, isolated arm only. Every launch goes through `gate_live.ts`, which calls
  `createFakeHomeProfile()` afresh and calls `dispose()` in `finally`. Never reuse a profile. The
  real-profile arm (logged-in stores) is out of scope and goes on the NOT_VERIFIED list.
- Kills are by pid or process group only. Never use `pkill -f`, `killall`, or a kill by name inside a
  tool command: `pkill -f` kills the calling shell (exit 144).
- The harness preflight refuses to start if a `gamelib-shell` is already running. Do not work around
  that refusal.
- Vite:
  - If nothing answers on `http://localhost:5173/`, start it with `setsid pnpm exec vite`, logging to
    `$RAW/vite.log` in the background.
  - Find the listening pid with `ss -ltnp 'sport = :5173'` and its pgid with `ps -o pgid= -p <pid>`,
    and record the pgid in `$RAW/vite.pgid`. `$!` after `setsid` is NOT vite's pid; ea0 measured this.
  - Stop it only by `kill -- -<pgid>`, and only if this execution started it. Stop it at the end of
    Task 3, or on any halt.
- Harness invocation, run in the background with absolute paths:
  - Command: `node meta/runTs.cjs --bundle --platform=node --target=node22 <ABS>/$Q/gate_live.ts`
  - Flags: `--binary /home/graysonmitchell/GameLib/src-tauri/target/debug/gamelib-shell`,
    `--evidence <ABS evidence subdir>`, `--label <L>`, `--stop-file $RAW/stop-<L>` and
    `--max-seconds 1500`, plus `--set GDK_SCALE=2` for Task 2 only.
  - Wait for `<L>-identity.txt` to carry `WINDOW_ID=`.
  - End every run by touching the stop-file and waiting for the harness to exit. Then confirm
    `POST_TEARDOWN_PROCS=0`.
- Driving the UI:
  - Use `xdotool` with coordinates computed from `xwininfo -id <WID>` (the absolute origin plus
    offsets read from an inspected capture). Do not use the origin from xdotool
    `getwindowgeometry`: it is off by the decoration offset on this host (blh open observation 7).
  - Capture with `python3 $BLH/cap.py <WID> <out.png>` into `RAW` first. Inspect a capture before
    copying it into evidence.
  - Before any capture that will be pixel-compared, park the pointer outside the window, to the right
    of its right edge, and wait at least 1 s so no hover style is captured.
  - Dismiss any onboarding tour before the first measured step.
  - "Stores -> GOG" means the Stores top tab, then the GOG tile, the same route blh drove.
- Settled-log snapshots:
  - Right after taking a capture that a checker will compare, copy `<L>-settled.log` to
    `<L>-settled-at-<check>.log`. The checkers read that snapshot's LAST settled line, which is the
    geometry that was current when the capture was taken.
  - The live log keeps growing. Verify re-runs against the snapshot.
- Blank launch:
  - If a launch shows no mounted UI 20 s after `WINDOW_ID=` (an inspected capture is white or empty),
    record it. Tear down (stop-file), and rename that run's identity and teardown files to
    `<L>-blank1-*`. Relaunch ONCE with a fresh profile under the canonical label.
  - A second blank launch in the same task stops that task's live work as a finding.
  - Record `LAUNCHES=<n> BLANK_LAUNCHES=<n>` per task in `$R`.
- results.txt:
  - One line per check: `CHECK=<ID> VERDICT=<PASS|FAIL|RECORDED|NOT_ACHIEVABLE|NOT_MEASURED|BLOCKED>`
    followed by space-separated `key=value` numbers.
  - Check ids: TRACER, E4B, E5, S1_CONTROL, HIDPI_SCALE, HIDPI_FLUSH, HIDPI_RESIZE, HIDPI_WHEEL,
    HIDPI_CLICKTHROUGH, HIDPI_CRISP, DRAG_PERSTEP, DRAG_BURST, DRAG_POINTER.
  - FAIL means a defect was observed and recorded as a finding. NOT_ACHIEVABLE means the environment
    could not produce the condition. BLOCKED means the check depends on a check that failed.
  - Also write `FIX_TAKEN=yes|no`, and at least 5 `NOT_VERIFIED=<item>` lines.
  - Never write the fake-profile directory prefix or any profile path into results or evidence.
    <!-- planner-discipline-allow: gl-feh- -->
- Stop rule. A defect is, for example: the embed drawn over the chrome, the embed missing from the
  slot, a settled FAIL line, a scale mixup, a STALE or MISSING drag step, a crash, or a hang. When one
  is found:
  - Stop working on it: no diagnosis loop and no speculative fix. Record it as FAIL with its evidence.
  - A fix is permitted only if it is under ~15 lines, clearly scoped, and re-verified. Re-verification
    means all of the following:
    - `(cd src-tauri && cargo test --bin gamelib-shell store_embed)` passes with 0 failed.
    - rustfmt's `Diff in` count stays at or below 75, the blh/ea0 ceiling.
    - `npx prettier --check` runs on any `src/` TS path touched, after `--file-info` shows it
      `"ignored": false`.
    - The failing check is re-run live in a fresh launch.
  - When the exception is taken, commit it as `fix(quick-260930-feh): ...` and set `FIX_TAKEN=yes`.
    Otherwise the defect is a finding only.
  - If the defect is a crash, a hang, or TRACER FAIL, halt ALL remaining live work. Every later check
    reads BLOCKED. Still write the addendum and the SUMMARY with the finding.
  - For any other defect, later launches that do not depend on the defective path still run.
  - E5's Back outcome is never a defect for this rule.
- Formatter: every file this plan writes lives under `.planning/`, which is prettier-ignored, so a
  `prettier --check` there would be vacuous. Verify blocks assert `--file-info` reports
  `"ignored": true` instead of running `--check`. The `.py` files have no prettier parser either way.
  Hand-match the surrounding style in the todo.
- Commits: use explicit paths only. Run `git add <paths>`, then check that
  `git diff --cached --name-only` lists only this task's paths, then run `git commit`.
  - Never stage `.planning/spikes/025-linux-add-child-compile/app/gen/` or its `run.log`. Both are
    untracked and pre-existing.
  - SUMMARY.md, STATE.md and this PLAN are left for the orchestrator's docs commit.
</conventions_for_every_task>

<tasks>

<task type="tracer">
  <name>Task 1 (tracer): scale-1 launch with DMABUF genuinely unset puts GOG in the slot; E4b, E5 and the logical-size controls in the same launch</name>
  <files>.planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/BASE.sha, .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/gate_live.ts, .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/region_diff.py, .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/evidence/baseline.txt, .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/evidence/results.txt, .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/evidence/s1/</files>
  <read_first>
    - .planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/embed_live.ts (whole file; base for gate_live.ts)
    - .planning/quick/260930-ea0-stop-auto-opening-web-inspector-on-linux/probe_live.ts lines 87-96 and 196-218
    - .planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/check_settled.py (PAT uses re.search, so a `T=` prefix is tolerated)
    - .planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/cap.py
  </read_first>
  <precondition>The graphical session is X11 on DISPLAY :1 and unlocked (`loginctl show-session "$(loginctl show-user "$USER" -p Display --value)" -p LockedHint --value` prints `no`), and no `gamelib-shell` process is running.</precondition>
  <action>
**1. Branch and baseline.**
- Switch to branch `quick-260930-feh`, creating it from the current HEAD if it is absent.
- Write `git rev-parse HEAD` to `$Q/BASE.sha`, before any commit.
- Build with the same line blh used:
  `pnpm build:sidecar && pnpm build:decompress-worker-dev && (cd src-tauri && cargo build)`.
- Write `$Q/evidence/baseline.txt` with:
  - the HEAD sha
  - the binary's mtime
  - `XDG_SESSION_TYPE`
  - the `xrandr --current` connected-monitor lines
  - `gsettings get org.gnome.desktop.interface scaling-factor`
  - the WebKitGTK package version
  - `nvidia-smi --query-gpu=driver_version --format=csv,noheader`
  - whether `GDK_SCALE` / `GDK_DPI_SCALE` / `WEBKIT_DISABLE_DMABUF_RENDERER` / `LD_PRELOAD` are set in
    the executor's environment. Record names and set/unset only.

**2. `gate_live.ts`.** Copy `$BLH/embed_live.ts`. Make these edits and no others, and list them in
the new header as a provenance note:
- (a) Profile prefix `gl-feh-`.
- (b) Replace `--diag-env` with a repeatable `--set K=V`, recorded in identity as
  `SET=<comma list>`. Exit 2 with `PREFLIGHT REFUSED` if any `--set` names
  `WEBKIT_DISABLE_DMABUF_RENDERER` or `LD_PRELOAD`. Scored runs cannot re-add the workaround.
- (c) Identity lines read from the shell's `/proc/<pid>/environ`, keeping the existing
  `DMABUF_VAR_PRESENT=yes|no`:
  - `LD_PRELOAD_VAR=present|absent`
  - `GDK_SCALE_VAR=<value|absent>`
- (d) Add the `comm` field to `statOf()`, which is the text between the parentheses in
  `/proc/<pid>/stat`, and port `descendants()` from probe_live.ts.
  - In the hold loop, once per second, append one line to `<label>-identity.txt` for every NEW
    descendant whose comm starts with `WebKitWebProces`, in the form
    `WEBPROC pid=<n> dmabuf=<value|absent> gdk_scale=<value|absent>`, read from that process's
    environ.
  - Record every such process, not only the first. The embed may run in its own WebProcess.
- (e) Drain stderr every 50 ms instead of every 1000 ms. Write each kept `store_embed(linux)` line as
  `T=<Date.now()> <line>`.
  - Keep the process-group scan and the stop-file and max-seconds checks at a 1000 ms cadence, so the
    faster drain does not re-read all of `/proc` 20 times a second.
- Everything else stays unchanged:
  - `WINDOW_ID` / `EXE_MATCH` identity
  - teardown order: shell SIGTERM, then groups, then environ-matched stragglers, then
    `POST_TEARDOWN_PROCS`
  - `dispose()` in `finally`
  - `GAMELIB_DEV_SECRET_VAULT=1`
  - `GAMELIB_NODE`
  - the `delete childEnv.WEBKIT_DISABLE_DMABUF_RENDERER` line
- The harness never writes `profile.root` to any output.

**3. `region_diff.py A.png B.png --slot-from LOG [--scale S] [--same REGION]... [--changed REGION]...`**,
plus `--selftest`.
- It takes the LAST settled line of LOG (regex search, so the `T=` prefix is fine) and multiplies
  that line's geometry by S (default 1) to get three regions:
  - `chrome` = (0, 0, vbox_w, y)
  - `leftnav` = (0, y, x, vbox_h - y)
  - `slot` = (x, y, w, h)
- It exits 2 if either image's size differs from (vbox_w*S, vbox_h*S) by more than 2 px, because
  then the capture does not match the geometry.
- A pixel counts as changed when its max absolute channel difference is over 24.
- It prints `REGION=<name> CHANGED=<fraction to 4 dp>` for all three regions, then
  `VERDICT=PASS|FAIL|NONE`.
  - `--same` requires CHANGED <= 0.005.
  - `--changed` requires CHANGED > 0.05.
  - With neither flag the verdict is NONE and the exit code is 0, which is for recording only.
- `--selftest` builds in-memory 200x100 images and a temporary settled line
  `requested=40,20,160x80 embed=40,20,160x80 main=0,0,200x100 vbox=200x100`. It must do all of these:
  - accept identical images under `--same` for all three regions
  - accept a painted slot under `--changed slot --same chrome`
  - REJECT a painted chrome band under `--same chrome`
  - at scale 2 with 400x200 images and only the doubled slot painted, report chrome 0 and slot above
    0.9
  - exit 2 on a size mismatch
- It prints `SELFTEST PASS` or `SELFTEST FAIL: <reasons>`.

**4. Run `check_settled.py --selftest` and `region_diff.py --selftest`.** Both must print PASS before
any live run.

**5. The live run, label `s1`.** No `--set`, so the scale is the desktop's own.
- Tracer:
  - Drive Stores -> GOG and wait at least 8 s. Park the pointer and capture `tracer-gog.png`.
  - Snapshot the log to `s1-settled-at-tracer.log`.
  - TRACER is PASS only if all of these hold:
    - `check_settled.py s1-settled-at-tracer.log --min-lines 1` passes.
    - The inspected capture shows GOG content inside the slot, below the store controls, with the
      NavShell tabs rendering above it.
    - The identity shows `DMABUF_VAR_PRESENT=no`, `LD_PRELOAD_VAR=absent`, `GDK_SCALE_VAR=absent`,
      and at least one `WEBPROC` line, every one of them with `dmabuf=absent`.
  - Record the slot rect from the tracer settled line.
  - Save `xwininfo -id <WID>` output as `s1-xwin-tracer.txt`. Record `effective_scale` = xwin width
    / vbox width. Expected: 1.
  - If TRACER fails, apply the stop rule: halt all live work.
- E4b:
  - Keep `tracer-gog.png` as `e4b-gog-before.png`.
  - Drive Stores -> Epic, wait 8 s, and capture `e4b-epic.png`. Inspect it: the Epic panel should
    show and there should be no GOG pixels in the slot.
  - Drive Stores -> GOG, wait at least 8 s, park the pointer, and capture `e4b-gog-after.png`.
    Snapshot the log to `s1-settled-at-e4b.log`.
  - E4b is PASS only if all of these hold:
    - `region_diff.py e4b-gog-before.png e4b-gog-after.png --slot-from s1-settled-at-e4b.log --same chrome --same leftnav`
      passes.
    - The inspected after-capture shows GOG in the slot, not at (0,0) over the chrome.
    - `check_settled.py s1-settled-at-e4b.log --min-lines 1` passes.
  - Record whether an `ignored zero-area bounds` line appeared, and whether a new settled line
    appeared after the return.
- E5 (RECORDED, not gating):
  - Park the pointer and capture `e5-a.png`. Read the store controls' URL label.
  - Click one visible link inside the embed, chosen from `e5-a.png`. Wait 6 s, park the pointer, and
    capture `e5-b.png`. Read the label again, and note whether the Back control looks enabled.
  - Click Back. Wait 6 s, park the pointer, and capture `e5-c.png`.
  - Run `region_diff.py` with no `--same` or `--changed` flags for (a,b), (b,c) and (a,c), and record
    the three slot fractions.
  - Record these fields:
    - `link_click_navigated=yes|no`
    - `label_before`, `label_after`
    - `back_enabled=yes|no|unclear`
    - `back_moved_history=YES|NO|UNCONFIRMED`. YES only if `e5-c.png` visibly shows page A's
      identifying content (for example the same heading), and the (b,c) fraction is clearly larger
      than (a,c). Otherwise NO or UNCONFIRMED, with the reason.
  - The verdict is RECORDED.
- Logical-size controls (the positive control for Task 2):
  - Run `xdotool windowsize <WID> 1100 650` and wait until a settled line with `vbox=1100x650`
    appears. Save the xwininfo output as `s1-xwin-1100x650.txt`.
  - Repeat with `1000 600` and save `s1-xwin-1000x600.txt`.
  - Restore 1280x800.
  - `S1_CONTROL` is PASS if every settled line at those sizes passes `check_settled.py`. Record each
    line's flush deltas: (x+w) - vbox_w and (y+h) - vbox_h.
- Finish:
  - Touch the stop-file and confirm `POST_TEARDOWN_PROCS=0`.
  - Copy only the inspected captures into `$Q/evidence/s1/`.
  - Write the TRACER, E4B, E5 and S1_CONTROL lines, plus `LAUNCHES`/`BLANK_LAUNCHES`, into `$R`.

**6. Commit.** Commit `BASE.sha`, `gate_live.ts`, `region_diff.py`, `evidence/baseline.txt`,
`evidence/results.txt` and `evidence/s1/` by explicit path, as
`test(quick-260930-feh): scale-1 desk live gate, tracer + E4b + E5 with DMABUF unset`. Vite stays up
for Task 2.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && Q=.planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b- && E=$Q/evidence/s1 && R=$Q/evidence/results.txt && B=.planning/quick/260930-blh-build-the-gtk-box-native-linux-layout && test "$(git branch --show-current)" = quick-260930-feh && test -s $Q/BASE.sha && python3 $Q/region_diff.py --selftest && python3 $B/check_settled.py --selftest && grep -q '^EXE_MATCH=yes' $E/s1-identity.txt && grep -q '^DMABUF_VAR_PRESENT=no' $E/s1-identity.txt && grep -q '^LD_PRELOAD_VAR=absent' $E/s1-identity.txt && grep -q '^GDK_SCALE_VAR=absent' $E/s1-identity.txt && grep -q '^WEBPROC ' $E/s1-identity.txt && test "$(grep '^WEBPROC ' $E/s1-identity.txt | grep -vc ' dmabuf=absent')" -eq 0 && grep -q '^POST_TEARDOWN_PROCS=0' $E/s1-teardown.txt && grep -Eq '^CHECK=TRACER VERDICT=(PASS|FAIL)( |$)' $R && grep -Eq '^CHECK=E4B VERDICT=(PASS|FAIL|BLOCKED)( |$)' $R && grep -Eq '^CHECK=E5 VERDICT=(RECORDED|BLOCKED)( |$)' $R && grep -Eq '^CHECK=S1_CONTROL VERDICT=(PASS|FAIL|BLOCKED)( |$)' $R && { grep -q '^CHECK=TRACER VERDICT=FAIL' $R || python3 $B/check_settled.py $E/s1-settled-at-tracer.log --min-lines 1; } && { ! grep -q '^CHECK=E4B VERDICT=PASS' $R || { python3 $Q/region_diff.py $E/e4b-gog-before.png $E/e4b-gog-after.png --slot-from $E/s1-settled-at-e4b.log --same chrome --same leftnav && python3 $B/check_settled.py $E/s1-settled-at-e4b.log --min-lines 1; }; } && { ! grep -q '^CHECK=S1_CONTROL VERDICT=PASS' $R || { test -s $E/s1-xwin-1100x650.txt && test -s $E/s1-xwin-1000x600.txt; }; } && ! grep -rIl 'gl-feh-' $Q/evidence && npx prettier --file-info $Q/gate_live.ts | grep -Eq '"ignored":[[:space:]]*true' && git cat-file -e "$(cat $Q/BASE.sha)^{commit}" && { test -z "$(git diff --name-only $(cat $Q/BASE.sha) -- src src-tauri)" || grep -q '^FIX_TAKEN=yes' $R; }</automated>
  </verify>
  <done>
    - gate_live.ts launches the dev binary under a fresh fake profile with DMABUF, LD_PRELOAD and
      GDK_SCALE absent. That is proven for the shell and for every WebKitWebProcess the harness saw.
      Teardown left 0 processes.
    - TRACER is PASS and reproduced by check_settled.py over the committed snapshot. Or it is FAIL
      with the stop rule applied and everything later BLOCKED.
    - E4B is PASS and reproduced by region_diff.py plus check_settled.py over committed captures and
      the snapshot. Or it is FAIL, recorded as a finding.
    - E5 is RECORDED with an explicit `back_moved_history` value and the three slot fractions.
    - The 1100x650 and 1000x600 scale-1 controls are recorded with their xwininfo files.
    - No product code changed. The work is committed on quick-260930-feh by explicit paths.
  </done>
</task>

<task type="auto">
  <name>Task 2: HiDPI at GDK_SCALE=2, with a measured scale ratio, the logical-px agreement of renderer slot and GTK embed, then resize, wheel and click-through</name>
  <files>.planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/hidpi_check.py, .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/evidence/hidpi/, .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/evidence/results.txt</files>
  <read_first>
    - .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/evidence/s1/s1-settled.log (the scale-1 geometry to compare against)
    - .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/evidence/results.txt (TRACER must not be FAIL)
  </read_first>
  <precondition>Task 1 is committed and TRACER is not FAIL. If TRACER is FAIL, write every HIDPI_* line as BLOCKED and skip to Task 3's documentation step.</precondition>
  <action>
**1. `hidpi_check.py LOG --scale S --xwin-file F`**, plus `--selftest`.
- Parse Width and Height from the xwininfo text in F.
- It exits 4 on either of these, printing the failing line:
  - any settled line in LOG that fails the base check (embed == requested and main == (0,0,vbox))
  - any `store_embed(linux): error` line
- Candidates are settled lines with |W - S*vbox_w| <= 1 and |H - S*vbox_h| <= 1. Take the LAST
  candidate and print:
  - `SCALE_W=<W/vbox_w to 3 dp>` and `SCALE_H=<H/vbox_h to 3 dp>`
  - `FLUSH_DX=<(x+w) - vbox_w>` and `FLUSH_DY=<(y+h) - vbox_h>`
  - `REQUESTED=` and `VBOX=`
- If both flush deltas are within ±1, print `VERDICT=PASS` and exit 0. Otherwise print
  `VERDICT=UNIT_MIXUP` and exit 1: the scale took effect but the renderer and GTK disagree in logical
  px.
- If there is no candidate at S, but some line matches at scale 1 (|W - vbox_w| <= 1 and
  |H - vbox_h| <= 1), print `VERDICT=SCALE_NOT_IN_EFFECT` and exit 3.
- If nothing matches at all, print `VERDICT=NO_MATCH` with the nearest ratios and exit 4.
- `--selftest` uses synthetic lines and xwininfo text:
  - accept a scale-2 good case: vbox 1100x650, xwin 2200x1300, requested `204,82,896x568`
  - return 3 for a scale-1 window checked with `--scale 2`
  - return 1 for an overflow mixup: requested doubled, embed equal to it, flush broken
  - return 1 for a halved mixup
  - return 4 for a squeezed-main line
  - accept a scale-1 good case under `--scale 1`
- It prints `SELFTEST PASS` or `SELFTEST FAIL: <reasons>`. A checker that cannot reject is vacuous.

**2. Positive control from Task 1's evidence.** Run `hidpi_check.py $Q/evidence/s1/s1-settled.log
--scale 1 --xwin-file` against each of `s1-xwin-1100x650.txt` and `s1-xwin-1000x600.txt`. Both must
exit 0. This proves the flush oracle holds at scale 1 at exactly the logical sizes used below. If
either fails, the oracle is invalid at that size: record it and do not score HIDPI_FLUSH at that size.

**3. The live run, label `hidpi`, with `--set GDK_SCALE=2`.**
- Identity must show:
  - `GDK_SCALE_VAR=2`
  - `DMABUF_VAR_PRESENT=no`
  - `LD_PRELOAD_VAR=absent`
  - every `WEBPROC` line with `dmabuf=absent` and `gdk_scale=2`
- Save `xwininfo -id <WID>` as `hidpi-xwin-initial.txt`, and record which monitor holds the origin.
- Normalize the geometry before any capture, because the configured 2560x1600 physical does not fit
  the primary: run `xdotool windowsize <WID> 2200 1300` and then `xdotool windowmove <WID> 100 60`.
  Use even physical sizes only.
- Drive Stores -> GOG, wait at least 8 s, and park the pointer. Capture `hidpi-gog.png` and save
  xwininfo as `hidpi-xwin-a.txt`.
- Run `hidpi_check.py hidpi-settled.log --scale 2 --xwin-file hidpi-xwin-a.txt`:
  - Exit 3: set HIDPI_SCALE and every other HIDPI_* check to NOT_ACHIEVABLE, and record the measured
    ratios. GDK_SCALE=2 did not take effect. Finish the run and do not pass anything.
  - Exit 0 or 1: HIDPI_SCALE is PASS, with `scale_w`/`scale_h`.
  - Exit 0: HIDPI_FLUSH is PASS, with `flush_dx`/`flush_dy` and `requested`.
  - Exit 1: HIDPI_FLUSH is FAIL. That is a unit-mixup finding under the stop rule.
  - Exit 4: TRACER-equivalent FAIL at HiDPI, a finding.
- Record `renderer_vs_gtk_logical=agree|disagree` explicitly in the HIDPI_FLUSH line.
- Crop the physical region (2x-40, 2y-40, 80, 80) around the slot's top-left corner from
  `hidpi-gog.png`, and save it upscaled 4x nearest-neighbour as `hidpi-slot-corner.png`. Record
  `corner_visual=aligned|offset`: does the embed content start at the crop centre?
- HIDPI_CRISP (RECORDED): crop a physical region of embed text and save it upscaled 4x as
  `hidpi-crisp-zoom.png`. Record whether the glyph edges are anti-aliased at device px (crisp) or show
  2x2 blocks (upscaled).
- Resize:
  - Run `xdotool windowsize <WID> 2000 1200`, wait for a settled line, and save `hidpi-xwin-b.txt`.
    Run `hidpi_check` on it.
  - Restore 2200x1300, wait for a settled line, and save `hidpi-xwin-c.txt`. Run `hidpi_check` on
    it.
  - HIDPI_RESIZE is PASS only if both exit 0.
  - If the window manager clamps a size (the xwininfo size differs from the one requested), judge
    against the measured size, which hidpi_check already does. Record the clamp.
- Wheel:
  - Park the pointer, capture `hidpi-wheel-before.png`, and snapshot the log to
    `hidpi-settled-at-wheel.log`.
  - Move the pointer to the slot centre in PHYSICAL screen px: xwininfo absolute origin +
    2*(x + w/2), 2*(y + h/2).
  - Run `xdotool click --repeat 5 5`. Park the pointer and capture `hidpi-wheel-after.png`.
  - HIDPI_WHEEL is PASS if
    `region_diff.py hidpi-wheel-before.png hidpi-wheel-after.png --slot-from hidpi-settled-at-wheel.log --scale 2 --changed slot --same chrome --same leftnav`
    passes. Record the three fractions.
- Click-through:
  - Click the LIBRARY top tab at its physical position, read from an inspected capture. Wait 4 s,
    park the pointer, and capture `hidpi-clickthrough.png`.
  - HIDPI_CLICKTHROUGH is PASS if the inspected capture shows the Library route with no GOG pixels
    where the slot was.
  - Record whether an `ignored zero-area bounds` line appeared.
- Finish:
  - Touch the stop-file and confirm `POST_TEARDOWN_PROCS=0`.
  - Copy the inspected captures and crops into `$Q/evidence/hidpi/`.
  - Append the HIDPI_* lines and `LAUNCHES`/`BLANK_LAUNCHES` to `$R`.

**4. Commit.** Commit `hidpi_check.py`, `evidence/hidpi/` and `evidence/results.txt` by explicit
path, as `test(quick-260930-feh): HiDPI GDK_SCALE=2 desk gate, measured scale ratio and logical-px agreement`.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && Q=.planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b- && E=$Q/evidence/s1 && H=$Q/evidence/hidpi && R=$Q/evidence/results.txt && python3 $Q/hidpi_check.py --selftest && { grep -Eq '^CHECK=HIDPI_SCALE VERDICT=BLOCKED' $R || { python3 $Q/hidpi_check.py $E/s1-settled.log --scale 1 --xwin-file $E/s1-xwin-1100x650.txt && python3 $Q/hidpi_check.py $E/s1-settled.log --scale 1 --xwin-file $E/s1-xwin-1000x600.txt && grep -q '^EXE_MATCH=yes' $H/hidpi-identity.txt && grep -q '^GDK_SCALE_VAR=2$' $H/hidpi-identity.txt && grep -q '^DMABUF_VAR_PRESENT=no' $H/hidpi-identity.txt && grep -q '^LD_PRELOAD_VAR=absent' $H/hidpi-identity.txt && grep -q '^WEBPROC ' $H/hidpi-identity.txt && test "$(grep '^WEBPROC ' $H/hidpi-identity.txt | grep -vc ' dmabuf=absent gdk_scale=2')" -eq 0 && grep -q '^POST_TEARDOWN_PROCS=0' $H/hidpi-teardown.txt; }; } && miss=0 && for c in SCALE FLUSH RESIZE WHEEL CLICKTHROUGH CRISP; do grep -Eq "^CHECK=HIDPI_$c VERDICT=(PASS|FAIL|RECORDED|NOT_ACHIEVABLE|BLOCKED)( |$)" $R || miss=$((miss+1)); done && test $miss -eq 0 && test -z "$(grep -Eo '^CHECK=[A-Z0-9_]+' $R | sort | uniq -d)" && { ! grep -q '^CHECK=HIDPI_SCALE VERDICT=NOT_ACHIEVABLE' $R || { python3 $Q/hidpi_check.py $H/hidpi-settled.log --scale 2 --xwin-file $H/hidpi-xwin-a.txt; test $? -eq 3; }; } && { ! grep -q '^CHECK=HIDPI_SCALE VERDICT=PASS' $R || { python3 $Q/hidpi_check.py $H/hidpi-settled.log --scale 2 --xwin-file $H/hidpi-xwin-a.txt; rc=$?; test $rc -eq 0 -o $rc -eq 1; }; } && { ! grep -q '^CHECK=HIDPI_FLUSH VERDICT=PASS' $R || python3 $Q/hidpi_check.py $H/hidpi-settled.log --scale 2 --xwin-file $H/hidpi-xwin-a.txt; } && { ! grep -q '^CHECK=HIDPI_RESIZE VERDICT=PASS' $R || { python3 $Q/hidpi_check.py $H/hidpi-settled.log --scale 2 --xwin-file $H/hidpi-xwin-b.txt && python3 $Q/hidpi_check.py $H/hidpi-settled.log --scale 2 --xwin-file $H/hidpi-xwin-c.txt; }; } && { ! grep -q '^CHECK=HIDPI_WHEEL VERDICT=PASS' $R || python3 $Q/region_diff.py $H/hidpi-wheel-before.png $H/hidpi-wheel-after.png --slot-from $H/hidpi-settled-at-wheel.log --scale 2 --changed slot --same chrome --same leftnav; } && ! grep -rIl 'gl-feh-' $Q/evidence && git cat-file -e "$(cat $Q/BASE.sha)^{commit}" && { test -z "$(git diff --name-only $(cat $Q/BASE.sha) -- src src-tauri)" || grep -q '^FIX_TAKEN=yes' $R; }</automated>
  </verify>
  <done>
    - hidpi_check.py rejects a scale-1 window, both unit mixups and a squeezed main, and accepts
      good scale-1 and scale-2 cases.
    - The scale-1 controls at 1100x650 and 1000x600 pass from Task 1's committed evidence.
    - The HiDPI launch is proven to run with GDK_SCALE=2 in the shell and in every WebKitWebProcess,
      and with DMABUF absent.
    - Either the measured ratio is 2 and HIDPI_SCALE/FLUSH/RESIZE/WHEEL/CLICKTHROUGH each hold a
      verdict that the checkers reproduce from committed evidence, with `renderer_vs_gtk_logical`
      stated. Or the ratio was not 2, and every HIDPI_* line reads NOT_ACHIEVABLE, reproduced by
      hidpi_check exit 3.
    - HIDPI_CRISP is RECORDED. Teardown left 0 processes. Committed by explicit paths.
  </done>
</task>

<task type="auto">
  <name>Task 3: drag-resize settle lag and staleness (Linux branch of 38-E04) as far as the harness can see, then the results, the todo addendum and the SUMMARY</name>
  <files>.planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/drag_probe.py, .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/settled_lag.py, .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/evidence/drag/, .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/evidence/results.txt, .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md</files>
  <read_first>
    - src-tauri/src/main.rs lines 5827-5850 (the 500 ms settle debounce; read only)
    - .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md lines 238-303 (the blh and ea0 addenda: the style and wrap to match)
    - .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/evidence/results.txt
  </read_first>
  <precondition>Tasks 1 and 2 are committed. If TRACER is FAIL, skip steps 1-3, write the DRAG_* lines as BLOCKED, and do step 4 onward.</precondition>
  <action>
**1. `drag_probe.py --wid WID --out STEPS --arm perstep|burst|pointer ...`.** Append-only writer. All
times are `int(time.time()*1000)`, which is the same wall clock as the harness's `Date.now()`.
- `--arm perstep --sizes 1250x784,1220x768,1190x750,1160x734,1130x716,1100x700 --gap-ms 1500`. For
  each size:
  - Take `t_send` and run `xdotool windowsize`.
  - Poll `xwininfo -id` every ~10 ms, for up to 1000 ms, until the size is the new size. Take `t_x`.
  - Write `STEP arm=perstep i=<n> t_send=<ms> t_x=<ms|NA> w=<measured> h=<measured>`, where w and h
    are the MEASURED size, not the requested one.
  - Sleep until `gap-ms` after `t_send`. 1500 ms is enough for the 500 ms debounce to fire between
    steps.
- `--arm burst --from 1100x700 --to 1280x800 --steps 40 --interval-ms 25`:
  - Send linearly spaced windowsize steps, writing a `STEP arm=burst` line per step with `t_x=NA`.
  - After the last step, poll xwininfo until the size has been stable for 200 ms. Write
    `ARM_END arm=burst t_x_final=<ms> w= h= achieved=yes`.
  - Capture the window with `$BLH/cap.py` at about +100 ms and about +1500 ms after `t_x_final`. Name
    them `burst-end-100ms.png` and `burst-end-1500ms.png`. These are RECORDED observations of stale
    frames and are not scored.
- `--arm pointer --delta -180,-100 --steps 20 --interval-ms 25`. This is a best-effort WM drag with
  one attempt.
  - Read the start size with xwininfo and the frame extents with
    `xprop -id WID _NET_FRAME_EXTENTS`.
  - Move to the frame's bottom-right corner + 4 px (absolute origin + size + right/bottom extents).
  - Run `mousedown 1`, then 20 relative moves at 25 ms, then `mouseup 1`. Poll until the size is
    stable.
  - Write `ARM_END arm=pointer t_x_final=<ms> w= h= achieved=yes|no`. `achieved` is no if the size
    did not change.

**2. `settled_lag.py STEPS SETTLED_LOG --arm perstep|burst|pointer`**, plus `--selftest`.
- It parses `T=<ms>` settled lines, using the check_settled regex with search.
- perstep: for step i, the window runs from `t_x_i` to the next step's `t_send`, or `t_x_i` + 3000
  for the last step.
  - Step i is MATCHED if the LAST settled line in that window has vbox == (w_i, h_i), passes the
    base check (embed == requested and main == (0,0,vbox)), and is flush within ±1.
  - Step i is STALE if there are lines in the window but the last one fails any of those conditions.
  - Step i is MISSING if the window has no settled line.
  - lag_i = T of the first flush, matching line minus `t_x_i`. `est_apply_i` = lag_i - 500.
- burst and pointer: the same rule applied once, from `t_x_final` to `t_x_final` + 3000, against the
  final size. It also reports `LINES_DURING`, the settled lines between the first `t_send` and
  `t_x_final`.
- pointer with `achieved=no` prints `VERDICT=NOT_ACHIEVABLE` and exits 3.
- Output line: `ARM=<arm> STEPS=<n> MATCHED=<n> MISSING=<n> STALE=<n> FAIL=<n> ERRORS=<n>
  MAX_LAG_MS=<n> MIN_LAG_MS=<n> MAX_EST_APPLY_MS=<n> DEBOUNCE_MS=500 POLL_MS=50 VERDICT=PASS|FAIL`.
- PASS requires MATCHED == STEPS and zero MISSING, STALE, FAIL and ERRORS.
- No latency threshold is invented. The ledger's "no visible lag" is perceptual.
- `--selftest` covers:
  - accept a synthetic 3-step good run
  - reject a MISSING step
  - reject a STALE step (vbox new, requested still sized for the old vbox, so flush is broken)
  - reject a FAIL line (embed != requested)
  - accept a good burst
  - return 3 for a pointer arm with `achieved=no`

**3. The live run, label `drag`.** Scale 1, fresh profile.
- Drive Stores -> GOG and wait at least 8 s. Require one passing settled line at 1280x800 first. If
  there is none, this is the stop rule.
- Run `drag_probe` with perstep, then burst, then pointer, all into `$Q/evidence/drag/drag-steps.txt`.
- Touch the stop-file and confirm `POST_TEARDOWN_PROCS=0`.
- Run `settled_lag.py` for each arm and save the outputs as `drag/lag-<arm>.txt`.
- Record the verdicts:
  - DRAG_PERSTEP and DRAG_BURST: PASS or FAIL. FAIL is a finding.
  - DRAG_POINTER: PASS, FAIL or NOT_ACHIEVABLE.
- Inspect the two burst-end captures, and record `burst_end_stale_frame_visible=yes|no|unclear` in
  the DRAG_BURST line.
- Add `MEASURED=` and `NOT_MEASURED=` lines to `$R`.
  - Measured: whether each step ends in a correct settle, and how long after the X size change.
    State that the lag includes the 500 ms debounce floor by design and ±50 ms of poll granularity.
  - Not measured:
    - per-frame staleness or tearing during a continuous drag (no settled line fires mid-drag)
    - perceived responsiveness
    - the renderer-to-GTK path separately from the debounce (only estimated as lag - 500)

**4. Finalise results.** Make `$R` carry exactly one CHECK line for each of the 13 ids, plus
`FIX_TAKEN=`. Add these NOT_VERIFIED lines at least:
- the packaged AppImage/release build
- a real logged-in profile (the two-profile rule's real arm)
- Wayland
- macOS
- Windows
- mixed-DPI or per-monitor scaling (X11 GDK_SCALE is global)
- fractional scales
- Tauri's own `scale_factor()` value (never read; the scale is inferred from X vs GTK sizes)
- keyboard focus and the first-open split frame
- one host only

**5. Todo addendum.** Append to the positioning todo only, with the frontmatter untouched. Add one
section headed `## Addendum (2026-09-30, quick 260930-feh): desk live gate — E4b, E5, HiDPI (GDK_SCALE=2), drag-resize`.
- Every line is a `- ` bullet or an indented continuation. Write no column-0 `key: value` line and no
  angle-bracket tag.
- Match the ~110-column wrap of the blh and ea0 addenda.
- Content:
  - the conditions: dev binary at the BASE sha, DMABUF absent in the shell and every WebKitWebProcess,
    a fresh fake profile per launch, X11, one host
  - each check's verdict with its key numbers
  - the HiDPI answer, stated plainly: the measured ratio, and whether the renderer's slot rect and the
    embed's GTK rect agree in logical px, or NOT ACHIEVABLE
  - the drag MEASURED / NOT MEASURED statement
  - any FAIL findings, and whether a fix was taken
  - the NOT VERIFIED list
  - a closing bullet: the frontmatter is unchanged on purpose, `ready: live-gate` stays,
    `38-VERIFICATION.md` is not edited (whether any of this discharges part of 38-E03/38-E04 is the
    operator's call in a ledger change), and the evidence path
    `.planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/evidence/`

**6. Gates and commit.**
- Run `pnpm planning-gates`. It must pass, including the todo frontmatter gate.
- Stop vite by its recorded pgid, if this execution started it. Confirm there are no `gamelib-shell`
  processes.
- Commit `drag_probe.py`, `settled_lag.py`, `evidence/drag/` and `evidence/results.txt` as
  `test(quick-260930-feh): drag-resize settle lag and staleness measurement`.
- Then commit the todo as
  `docs(todo): positioning todo addendum, desk live gate E4b/E5/HiDPI/drag (quick 260930-feh)`.
- Write `260930-feh-SUMMARY.md` per the execute-plan template. Lead with the outcome table of all 13
  checks, then the findings, the stop-rule use, the NOT VERIFIED list and the commits. The
  orchestrator commits it.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && Q=.planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b- && D=$Q/evidence/drag && R=$Q/evidence/results.txt && BS=$(cat $Q/BASE.sha) && T=.planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md && V=.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md && python3 $Q/settled_lag.py --selftest && { grep -Eq '^CHECK=DRAG_PERSTEP VERDICT=BLOCKED' $R || { grep -q '^EXE_MATCH=yes' $D/drag-identity.txt && grep -q '^DMABUF_VAR_PRESENT=no' $D/drag-identity.txt && grep -q '^GDK_SCALE_VAR=absent' $D/drag-identity.txt && grep -q '^WEBPROC ' $D/drag-identity.txt && test "$(grep '^WEBPROC ' $D/drag-identity.txt | grep -vc ' dmabuf=absent')" -eq 0 && grep -q '^POST_TEARDOWN_PROCS=0' $D/drag-teardown.txt; }; } && { ! grep -q '^CHECK=DRAG_PERSTEP VERDICT=PASS' $R || python3 $Q/settled_lag.py $D/drag-steps.txt $D/drag-settled.log --arm perstep; } && { ! grep -q '^CHECK=DRAG_BURST VERDICT=PASS' $R || python3 $Q/settled_lag.py $D/drag-steps.txt $D/drag-settled.log --arm burst; } && { ! grep -q '^CHECK=DRAG_POINTER VERDICT=PASS' $R || python3 $Q/settled_lag.py $D/drag-steps.txt $D/drag-settled.log --arm pointer; } && { ! grep -q '^CHECK=DRAG_POINTER VERDICT=NOT_ACHIEVABLE' $R || { python3 $Q/settled_lag.py $D/drag-steps.txt $D/drag-settled.log --arm pointer; test $? -eq 3; }; } && miss=0 && for c in TRACER E4B E5 S1_CONTROL HIDPI_SCALE HIDPI_FLUSH HIDPI_RESIZE HIDPI_WHEEL HIDPI_CLICKTHROUGH HIDPI_CRISP DRAG_PERSTEP DRAG_BURST DRAG_POINTER; do grep -Eq "^CHECK=$c VERDICT=[A-Z_]+( |$)" $R || miss=$((miss+1)); done && test $miss -eq 0 && test -z "$(grep -Eo '^CHECK=[A-Z0-9_]+' $R | sort | uniq -d)" && test "$(grep -c '^NOT_VERIFIED=' $R)" -ge 5 && grep -Eq '^FIX_TAKEN=(yes|no)$' $R && grep -q '^NOT_MEASURED=' $R && git cat-file -e "$BS^{commit}" && git cat-file -e "$BS:$T" && N=$(git cat-file -s "$BS:$T") && cmp -s -n $N <(git show "$BS:$T") $T && test "$(wc -c < $T)" -gt $N && grep -q '^## Addendum (2026-09-30, quick 260930-feh)' $T && git diff --quiet $BS -- $V && { test -z "$(git diff --name-only $BS -- src src-tauri)" || grep -q '^FIX_TAKEN=yes' $R; } && ! grep -rIl 'gl-feh-' $Q/evidence && npx prettier --file-info $T | grep -Eq '"ignored":[[:space:]]*true' && pnpm planning-gates >/dev/null</automated>
  </verify>
  <done>
    - settled_lag.py rejects MISSING, STALE and FAIL shapes, and returns 3 for an unachieved pointer
      drag.
    - DRAG_PERSTEP and DRAG_BURST each hold a verdict. Any PASS is reproduced from the committed
      steps file and settled log. DRAG_POINTER is PASS, FAIL or NOT_ACHIEVABLE, reproduced the same
      way.
    - The lag numbers carry the 500 ms debounce floor and the 50 ms poll granularity with them.
      Per-frame staleness, tearing and perceived lag are written as NOT_MEASURED.
    - results.txt has exactly 13 CHECK lines, at least 5 NOT_VERIFIED lines, and FIX_TAKEN.
    - The todo gained one dated addendum, and its base bytes are an unchanged prefix (so the
      frontmatter is unchanged and `ready: live-gate` stays).
    - 38-VERIFICATION.md is identical to BASE. Product code is unchanged, unless FIX_TAKEN=yes is
      recorded.
    - planning-gates passes. Vite is stopped, and no gamelib-shell remains. The SUMMARY is written.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| harness -> operator's real HOME | A launch that inherits the real profile would read real session data and could write it into committed evidence |
| harness -> live X11 desktop | Synthetic input (xdotool) and window captures act on the operator's real session |
| harness -> process table | Teardown signals processes; a name-based kill hits unrelated processes or the calling shell |
| embed webview -> third-party store pages | GOG/Epic pages load live, on the single shared WebKit cookie jar |
| results.txt claims -> committed evidence | A verdict line is only as good as the checker that reproduces it |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-feh-01 | Information disclosure | gate_live.ts / evidence/ | high | mitigate | A fresh `createFakeHomeProfile()` per launch, with `dispose()` in `finally`. The harness never writes `profile.root`. Only inspected captures from an account-less profile are copied. Verify runs a negative grep for the profile-directory prefix over all of evidence/. |
| T-feh-02 | Denial of service | teardown, vite stop | high | mitigate | Kills are by pid or pgid only; never `pkill -f` or `killall`. The preflight refuses to start if a gamelib-shell is running. Vite is stopped only by the pgid this execution recorded. |
| T-feh-03 | Spoofing | window/process identity | medium | mitigate | `WINDOW_ID` comes from `xdotool search --pid <launch pid>`, and `EXE_MATCH` from `/proc/<pid>/exe` realpath. Every verify greps `EXE_MATCH=yes`. |
| T-feh-04 | Repudiation | results.txt verdicts | medium | mitigate | Every checker has a `--selftest` that must reject its failure shapes. Each PASS claim is re-derived in `<verify>` from committed captures, snapshots and step files (claim -> checker). |
| T-feh-05 | Tampering | scored-run environment | high | mitigate | `--set` refuses `WEBKIT_DISABLE_DMABUF_RENDERER` and `LD_PRELOAD`. Identity records the shell env and every WebKitWebProcess env. Verify requires `dmabuf=absent` on every `WEBPROC` line. |
| T-feh-06 | Elevation of privilege | embed on one shared cookie jar | low | accept | This limitation was accepted by the operator on 2026-09-29 (isolation todo). The fake profile holds no store session, so there is nothing to read across. |
| T-feh-07 | Tampering | synthetic pointer drag on the live desktop | low | mitigate | Coordinates are derived from the measured xwininfo geometry and frame extents. One attempt only. The pointer is parked to the right of the window, and no keyboard input is sent to other windows. |
</threat_model>

<verification>
- All three task verify blocks pass in order. Each re-runs its checkers' `--selftest`, then re-derives
  every PASS claim from committed evidence.
- `evidence/results.txt` holds exactly 13 CHECK lines, `FIX_TAKEN=`, `NOT_MEASURED=` and at least 5
  `NOT_VERIFIED=` lines.
- `git diff --quiet $(cat BASE.sha) -- 38-VERIFICATION.md` holds. The todo's base bytes are an
  unchanged prefix. `src/` and `src-tauri/` are unchanged unless `FIX_TAKEN=yes`.
- `pnpm planning-gates` passes. No `gamelib-shell` process remains, and there are no stray fake
  profiles.
</verification>

<success_criteria>
- E4b and E5 have been run with DMABUF genuinely unset. E4b is scored. E5's Back outcome is recorded
  as YES / NO / UNCONFIRMED and does not gate.
- HiDPI has a measured scale ratio. Either it is 2 and the logical-px agreement between the renderer
  slot and the GTK embed is stated with numbers, or it is NOT ACHIEVABLE, stated as such and never
  passed.
- Drag-resize has per-step settle correctness plus lag numbers with their debounce and poll caveats.
  What the harness cannot see is written as NOT MEASURED.
- The deliverables exist: the evidence folder, the SUMMARY, and the dated todo addendum (frontmatter
  unchanged, `ready: live-gate`). NOT VERIFIED is stated plainly: packaged AppImage, real logged-in
  profile, Wayland, macOS/Windows.
</success_criteria>

## Source coverage audit

| Source item (planning context) | Covered by |
|---|---|
| Measurement task: dev build, DMABUF genuinely unset, asserted in the shell and the page process | Task 1 steps 2(c)-(d) and 5. Every task's verify asserts `DMABUF_VAR_PRESENT=no` and `dmabuf=absent` on every `WEBPROC` line |
| A fresh fake-HOME profile per launch | gate_live.ts (one `createFakeHomeProfile()` per launch); conventions: blank relaunches use a fresh profile |
| E4b GOG->Epic->GOG returns to the slot | Task 1 step 5, E4b |
| E5 link click + Back recorded honestly, not gating | Task 1 step 5, E5 (`back_moved_history`) |
| HiDPI GDK_SCALE=2: tracer, resize, wheel/click-through | Task 2 step 3 |
| Renderer slot rect vs GTK rect in logical px; watch for scale mixups | hidpi_check.py flush oracle plus unit-mixup selftests; the scale-1 positive control at the same logical sizes |
| Report NOT ACHIEVABLE if GDK_SCALE=2 does not take effect | hidpi_check exit 3 means every HIDPI_* line is NOT_ACHIEVABLE; verify reproduces exit 3 |
| Drag-resize staleness and latency only if measurable; state what is and is not measured | Task 3 (drag_probe, settled_lag, MEASURED / NOT_MEASURED lines) |
| No product code; stop rule; trivial fix under ~15 lines only if re-verified | Conventions: stop rule; every verify checks `src`/`src-tauri` against BASE or `FIX_TAKEN=yes` |
| Evidence curated and redacted; SUMMARY; dated todo addendum, frontmatter unchanged, `ready: live-gate` | Conventions (inspected captures only; the prefix negative grep); Task 3 steps 5-6 plus the prefix-cmp verify |
| Do NOT edit 38-VERIFICATION.md | Task 3 verify: `git diff --quiet $BS -- 38-VERIFICATION.md` |
| NOT VERIFIED: AppImage, real profile, Wayland, macOS/Windows | Task 3 step 4 (`NOT_VERIFIED=` lines, at least 5 required) |
| Branch quick-260930-feh | Task 1 step 1 and verify |
| No `pkill -f`/killall; planning paths prettier-ignored | Conventions; `--file-info` ignored assertions in the Task 1 and Task 3 verify |

<output>
Create `.planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/260930-feh-SUMMARY.md` when done
</output>
