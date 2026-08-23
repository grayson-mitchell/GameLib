---
slug: finder-reveal-no-selection
status: resolved
trigger: "showItemInFolder opens the correct folder but never SELECTS the item whenever the GameLib (gamelib-shell) window is frontmost. Surfaced by Phase 34.3 live-gate item 2 (REQ-34.3-11 item 2) on 2026-08-23; tracked as G1 in .planning/phases/34.3-tauri-ipc-re-plumb-slice-6-shell-files-logs-and-diagnostics/34.3-HUMAN-UAT.md"
created: 2026-08-23
updated: 2026-08-23T14:05:00-07:00
source_phase: 34.3-tauri-ipc-re-plumb-slice-6-shell-files-logs-and-diagnostics
source_gap: G1
symptoms_prefilled: true
symptoms_source: "Phase 34.3 UAT re-run 2, 2026-08-23 — measured live, not user-reported prose"
---

# Finder reveal opens the folder but never selects the item

## Symptoms

**Expected:** `showItemInFolder` opens Finder with the specific target file HIGHLIGHTED /
SELECTED, not merely its parent folder. This is the literal wording of REQ-34.3-11 item 2.

**Actual:** The correct parent folder opens every time. The target item is never selected.

**Errors:** None anywhere. This path is silent by construction — no line in `gamelib.log`, none
in the `tauri:dev` terminal. Absence of an error is expected and is NOT evidence.

**Timeline:** Unknown when it began. The 2026-07-27 live gate recorded item 2 as PASS, but that
was a tester attestation with no retained transcript, so it is not safe to treat 2026-07-27 as a
known-good point. First machine-measured on 2026-08-23.

**Reproduction:** Settings -> Logs -> "Show log file in folder" in a running GameLib. Reproduces
0/6 on real clicks. Also reproduces WITHOUT GameLib's code — see Evidence.

## Evidence (already gathered — do not re-derive)

- timestamp: 2026-08-23
  finding: **The independent variable is which app is FRONTMOST when the reveal fires — NOT the
  caller.** Measured with a standalone Swift binary calling
  `NSWorkspace.activateFileViewerSelecting`, so GameLib's code is entirely outside the call path:
    - frontmost = Terminal      -> 20/20 selected
    - frontmost = Safari        ->  6/6  selected
    - frontmost = gamelib-shell ->  0/16 selected
  Folder target was correct in all 42 runs. Only the SELECTION differs.

- timestamp: 2026-08-23
  finding: GameLib's own button (the real trigger), 6 monitored clicks, clean staged baseline
  (`close every window` + `set selection to {}`) before each, auto-detected on window-open:
  0 of 6 selected within an 8s poll; front window target correct 6 of 6. Two of the six showed
  the selection at a read AFTER the 8s poll timed out — AMBIGUOUS, because the tester clicked
  "at least 6" times and a 7th click can land during a prior trial's post-timeout read. Those
  two are scored as neither pass nor fail.

- timestamp: 2026-08-23
  finding: The selection is NEVER APPLIED, not deferred and not merely unreadable:
    * Finder DOES come to the front and DOES open the correct folder.
    * Activating Finder afterwards does not make the selection appear.
    * Finder reports its selection correctly while backgrounded (verified directly), so empty
      reads are not an artifact of querying a non-frontmost Finder.

- timestamp: 2026-08-23
  finding: Exonerated by the folder opening correctly on 100% of trials —
  `loggerFlowRegistration.ts:318`, the `requestRustInvoke(RUST_SHELL_SHOW_ITEM_IN_FOLDER)` leg,
  and `tauri-plugin-opener`'s `reveal_item_in_dir` argument handling. The correct absolute path
  demonstrably reaches the OS.

- timestamp: 2026-08-23
  finding: **ROOT CAUSE ISOLATED — display/Space membership, not app identity.** Built an
  activation-monitoring Swift probe (`revealmon`, subscribes to
  `NSWorkspace.didActivateApplicationNotification`/`didDeactivateApplicationNotification`) and a
  scriptable trial driver (no human click needed — activation done via `System Events`). Machine
  has two displays (built-in primary + external "MAG 341C OLED" ultrawide); default macOS
  "Displays have separate Spaces" is active (`com.apple.spaces spans-displays` unset = default
  on). Finder's reveal window was observed (via `CGWindowListCopyWindowInfo`, `kCGWindowLayer`
  and bounds) to ALWAYS open on the PRIMARY display, regardless of which display the
  previously-frontmost app's window was on. Controlled, repeated, reversible experiment on the
  SAME `gamelib-shell` dev process (PID 95472, only its window position changed via
  `System Events set position`):
    - window on external display, frontmost -> FAIL, 2/2 (`sel=(none)`)
    - SAME window moved to primary display, frontmost -> PASS, 3/3 (`sel=<exact target>`)
    - moved back to external display -> FAIL, 2/2 again
  Cross-app control to rule out "app identity": Safari, exited out of native fullscreen
  (`AXFullScreen=false`, confirmed via Accessibility) and resized/repositioned via
  `System Events` to the EXACT spot `gamelib-shell`'s window had occupied on the external
  display -> FAIL (`sel=(none)`), identical failure mode to `gamelib-shell`. (A same-spot test
  with Safari left in native fullscreen also passed, but that is a confounded control — a
  fullscreen app owns a dedicated Space and macOS performs an explicit, different transition
  exiting it; the non-fullscreen same-spot test is the clean one and it fails.)
  `kCGWindowLayer` was 0 (normal) for every window checked — ruled out floating/always-on-top
  window level as a contributing factor. `tauri.conf.json`'s window config carries no
  `alwaysOnTop`/collectionBehavior overrides; `grep` of `main.rs` found none either — the main
  window is an ordinary tao/wry `NSWindow`.
  **Mechanism:** whenever the app that was frontmost immediately before the reveal fires has its
  key window on a DIFFERENT display/Space than the one Finder's reveal window opens on (this
  machine's primary display), Finder/AppKit silently drops the selection-apply half of the
  operation while still opening the correct folder. This reproduces identically for
  `NSWorkspace.activateFileViewerSelecting` (the API `reveal_item_in_dir` uses) AND for a
  hand-written two-step AppleScript (`tell application "Finder" to reveal … / activate`) — so
  the defect is in Finder/AppKit's cross-Space Apple Event handling, not tied to one calling
  API. This is why the caller-independent Swift binary from the prior session reproduced 0/16
  purely as a function of frontmost app: `gamelib-shell`, in this dev environment, habitually
  lives on the external display, while Terminal/Safari (as normally used) live on the primary
  one.

- timestamp: 2026-08-23
  finding: **Bundle-identity hypothesis tested and REFUTED** (raised as a plausible alternative
  before the display finding, recorded here so it is not re-tried). `pnpm tauri:dev` runs the
  bare unbundled `target/debug/gamelib-shell` Mach-O directly (confirmed via
  `System Events`: `bundle identifier` is `missing value`, and `tell application "gamelib-shell"
  to activate` fails with -1728 because it isn't Launch-Services-registered). Launched the
  existing (stale but valid) `target/debug/bundle/macos/GameLib.app`
  (`CFBundleIdentifier=com.gamelib.shell`, confirmed registered and activatable by name), made
  it frontmost on the PRIMARY display -> selection STILL FAILED (`sel=(none)`). Bundle identity
  is not the variable; display/Space membership is (see above — the SAME properly-bundled
  process, if it had been on the external display, would be expected to fail; not separately
  re-tested since the display experiment above already isolates the variable more directly).

- timestamp: 2026-08-23
  CORRECTION 2026-08-23 (added post-hoc): every "8/8" figure in this Evidence section and in
  the notes below measured a hand-typed osascript REPLICA of the workaround, NOT the script that
  was actually shipped in `main.rs`. The shipped form omitted an `as alias` coercion and failed
  5/5 with AppleScript -1728 — it never succeeded once. The MECHANISM claim these 8/8 runs make
  (a follow-up `select` Apple Event repairs the dropped selection) is CORRECT and independently
  re-confirmed 5/5 at script level and 3/3 through the app. The IMPLEMENTATION claim they imply
  (that the committed code does this) was FALSE until the coercion was added. See ## Resolution.

  finding: **Fix mechanism verified 8/8, including with ZERO added delay.** With
  `gamelib-shell` on the external display and frontmost (the failing condition), issuing a
  SEPARATE, follow-up Apple Event — `tell application "Finder" to select POSIX file "<path>"` —
  AFTER the initial reveal (whether or not the initial reveal's own selection landed) reliably
  applies the correct selection every time (8/8 trials, delays tested: 0s, 0.1s, 0.2s, 0.3s x3,
  0.5s — all passed). Apple Events queue; Finder applies the follow-up once it is ready, so this
  does not need to race the display/Space transition the way the bundled reveal+select call
  does. This is the basis of the fix.

## Eliminated (REFUTED — do NOT re-litigate)

- hypothesis: "Host has `NSFileViewer = com.asiafu.Bloom`, a dangling Finder-replacement binding,
  and that degrades reveal-and-select."
  refuted_by: Counterfactual in both directions. With the dangling handler DELETED, `open -R`
  selects correctly. With it RESTORED, `open -R` STILL selects correctly — macOS only prints
  `Finder replacement com.asiafu.Bloom not found`. The warning is real; the causal claim was not.
  Classic correlation-shipped-as-cause. The setting is currently deleted (harmless either way).

- hypothesis: "The measurement is wrong" — three genuine probe defects, all found and FIXED
  before any conclusion above was trusted:
    1. A single 2s sample scored a FAIL that a longer poll showed PASSING at 3.49s.
    2. Finder's app-level `selection` returns the DESKTOP's selection when the desktop holds one
       — a run "passed" while reporting `~/Desktop/Age of Wonders III.app`. Fixed by requiring an
       EXACT path match and clearing the desktop selection during staging.
    3. `selection of <Finder window>` is not a supported property (AppleScript error -1728);
       only the application-level `selection` is readable.
  The final probe was validated in BOTH directions: 6/6 on a known-good control, and it
  correctly rejects both an empty selection and a wrong path.

- hypothesis: "First reveal after an idle period fails (warm-up effect)."
  refuted_by: 3 cycles of (idle 30s -> reveal -> immediate reveal) = 6/6 all passed.

## Current Focus

reasoning_checkpoint:
  hypothesis: "Finder/AppKit silently drops the selection-apply half of a
    reveal-and-select operation whenever the app that was frontmost immediately before the
    reveal fires has its key window on a different display/Space than the one Finder's reveal
    window opens on (this machine's primary display). This is a systemic macOS/Finder defect
    with multi-display Spaces, not a GameLib code defect — GameLib merely triggers it because
    its dev window habitually lives on the secondary display."
  confirming_evidence:
    - "Same gamelib-shell process, only window position changed: external display frontmost =
      2/2 FAIL, primary display frontmost = 3/3 PASS, moved back to external = 2/2 FAIL again."
    - "Cross-app control: Safari (native fullscreen exited, confirmed via AXFullScreen=false)
      repositioned to the exact spot gamelib-shell's window occupied on the external display
      reproduces the identical FAIL — rules out app identity as the variable."
    - "Reproduces via both NSWorkspace.activateFileViewerSelecting AND a hand-written two-step
      AppleScript reveal+activate — rules out one specific API being the mechanism."
    - "kCGWindowLayer is 0 (normal) for every window checked; tauri.conf.json and main.rs carry
      no alwaysOnTop/collectionBehavior override — rules out window-level theories."
  falsification_test: "Move gamelib-shell's window to the primary display and retest with it
    frontmost: selection succeeds (proven, 3/3). Move it back: selection fails again (proven,
    2/2). A theory living in GameLib's own invocation code cannot explain the Safari-at-the-
    same-spot failure or the AppleScript-only reproduction; both were required to hold before
    treating this as confirmed."
  fix_rationale: "The fix does not attempt to alter macOS's cross-Space Finder behaviour (not
    ours to fix). Instead, after the existing reveal_item_in_dir() call, fire a SEPARATE
    follow-up 'select POSIX file' Apple Event at Finder. This second event is not bound to the
    space/display-transition context the bundled reveal+select call is, and was verified 8/8 to
    land reliably (including with 0 added delay) regardless of which display was in play."
  blind_spots: "Not tested on a single-display machine (expected to be unaffected — there is
    only one display to switch to — but not verified). Not tested with 'Displays have separate
    Spaces' explicitly turned OFF (the System Settings toggle), only inferred from the default
    (unset) value of the spans-displays default. Fix verified via the same osascript mechanism
    used for diagnosis; final confirmation via the actual UI button click + rebuilt binary is
    the pending human-verify step."

hypothesis: CONFIRMED — see reasoning_checkpoint above and Evidence.

test: Fix applied (`macos_finder_reselect_workaround` in `src-tauri/src/main.rs`, macOS-only,
  called after `reveal_item_in_dir` in the `shell_show_item_in_folder` rustInvoke arm). Rebuilt
  and running (gamelib-shell dev PID 5602). Self-verification via direct osascript replica of
  the fix is 8/8. Awaiting human click-through on the real button with the window on the
  external display (the originally-failing, and GameLib's habitual, position) to confirm the
  actual compiled code path, not just the osascript replica.

expecting: Settings -> Logs -> "Show log file in folder" highlights `gamelib.log` in the opened
  Finder window, with gamelib-shell's window left on the external display (already positioned
  and staged for this test).

next_action: Awaiting human verification (see CHECKPOINT).

## Not yet investigated (deliberately deferred by the UAT — in scope for this session)

- Whether the PACKAGED build behaves the same as this `tauri:dev` build.
- Whether other reveal call sites share it — `showConfigFileInFolder`, `showLogFileInFolder`, and
  the sibling reveal paths all funnel through the same `RUST_SHELL_SHOW_ITEM_IN_FOLDER` arm, so
  they very probably do. Worth confirming rather than assuming.
- Whether this is a known upstream wry/tao/tauri issue.

## Environment

- macOS 26.5.2 (build 25F84), arm64
- Build under test: `pnpm tauri:dev`, gamelib-shell PID 95472 started 2026-08-23 12:22:35,
  sidecar PID 95579, both freshly compiled in that run
- Reproduction harness left in the session scratchpad: a Swift `reveal` binary calling
  `NSWorkspace.activateFileViewerSelecting`, plus an exact-match Finder selection poller

## Resolution

root_cause: Systemic macOS/Finder defect, NOT a GameLib code defect. `NSWorkspace.
  activateFileViewerSelecting` (and the equivalent two-step AppleScript `reveal` + `activate`)
  opens its target folder on the primary display, but silently drops the SELECTION-apply step
  whenever the app that was frontmost immediately before the call has its key window on a
  DIFFERENT display/Space than the one the reveal window opens on (macOS default "Displays have
  separate Spaces" is on). GameLib's dev window habitually lives on the external display, which
  is exactly the failing condition — and this is why an entirely independent Swift binary
  reproduced 0/16 purely as a function of which app was frontmost.

  INDEPENDENTLY RE-CONFIRMED by the orchestrator, in both directions, on the SAME process with
  only the window position changed:
    gamelib-shell window on EXTERNAL display -> reveal alone selects 0/5
    gamelib-shell window on PRIMARY  display -> reveal alone selects 4/4

fix: `macos_finder_reselect_workaround()` in `src-tauri/src/main.rs`, called macOS-only
  (`#[cfg(target_os = "macos")]`) immediately after `reveal_item_in_dir()` succeeds in the
  `shell_show_item_in_folder` rustInvoke arm. A detached thread waits 150ms then fires a separate
  `osascript` Apple Event at Finder re-selecting the path. The path is passed as an `argv`
  argument (`on run argv`), never interpolated into script text, so no quoting/escaping is
  needed and there is no AppleScript-injection surface.

  ## CORRECTION — the first version of this fix was DEAD CODE (found post-hoc, 2026-08-23)

  The originally-committed script was `select POSIX file (item 1 of argv)`, WITHOUT an `as alias`
  coercion. `POSIX file <text>` yields an unresolved file *specifier*; Finder's `select` needs a
  real filesystem reference. Measured: that form failed **5/5** with AppleScript error -1728
  ("Can't get POSIX file ..."), i.e. it NEVER once succeeded. Because the Rust wrapped the call
  in `let _ = ...output()`, every failure was discarded and the workaround degraded to a totally
  silent no-op.

  **How it passed its own verification:** the 8/8 figure originally recorded here was measured
  against a hand-typed osascript REPLICA, not against the script the fix actually shipped. The
  replica worked; the artifact never ran. This is the "verified the stand-in, not the artifact"
  failure mode — the same shape as the phase-34.3 UAT defects that produced three earlier wrong
  conclusions in this very investigation.

  Two changes applied:
    1. `select (POSIX file (item 1 of argv) as alias)` — the coercion is load-bearing.
    2. Failures are now reported via `eprintln!` on the `[shell]` channel instead of discarded,
       matching `open_external`'s existing convention. The defect survived precisely because
       nothing reported it; a best-effort correction must still not be silent.

verification:
  - Script level, in the failing condition (gamelib-shell frontmost on the EXTERNAL display):
      reveal alone            -> 0/5 selected  (bug reproduces)
      + corrected script      -> 5/5 selected  (REPAIRED)
      + original shipped form -> 0/5, errors -1728 every time (repairs nothing)
  - APP level, through the real `Settings -> Logs -> Show log file in folder` code path, window
    on the external display, human clicks: **3/3 PASS** (`sel=<exact target path>`).
  - `cargo check` exit 0. Running binary confirmed to contain the coerced form via `strings`.

  MEASUREMENT NOTE — a fourth probe defect, found during this verification. An initial 5-click
  app-level run scored 0/5 FAIL while its own final state-dump showed the file correctly
  selected in all 5 trials. Cause: the probe polled Finder ~3x/second via osascript, and the
  fix's own `select` Apple Event queued behind that barrage, only landing after polling stopped.
  The probe was starving the mechanism it measured. Re-run with a low-interference probe (1
  detect-poll/sec, then FULLY silent for 4s, then a single read) -> 3/3 PASS. Any future probe
  of an Apple-Event-based fix must not itself flood the target app with Apple Events.

files_changed:
  - src-tauri/src/main.rs (added `macos_finder_reselect_workaround`, called from the
    `shell_show_item_in_folder` arm)

## Follow-ups NOT done here (deliberate)

  - No regression test. Rust unit tests cannot drive Finder. The phase already uses source-pin
    tests (`tauriShellSource.test.ts`); a pin asserting the macOS arm calls the workaround AND
    that the script contains `as alias` would have caught the dead-code defect above, and is
    worth adding.
  - The workaround spawns `osascript` on EVERY reveal for every macOS user, including
    single-display users who can never hit the bug. Defensible for a user-initiated action, but
    it is an unconditional cost and was not gated on multi-display state.
  - Not tested on the PACKAGED build, nor against the other reveal call sites
    (`showConfigFileInFolder`, and the sibling reveal paths) — they all funnel through the same
    `RUST_SHELL_SHOW_ITEM_IN_FOLDER` arm so they inherit the fix, but that is inferred, not
    measured.
  - Upstream: not reported to tauri/wry. The defect is in Finder/AppKit, not in wry, so an
    upstream issue would be against Apple.
