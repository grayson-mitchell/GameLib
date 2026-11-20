---
phase: quick-260930-ea0
plan: 01
subsystem: tauri-shell
tags: [linux, webkitgtk, devtools, web-inspector, dmabuf, live-gate]
requires:
  - debug session linux-dev-app-blank-without-dmabuf-workaround (root cause)
provides:
  - should_auto_open_devtools(target_os) predicate gating both debug auto-open sites
  - fake-HOME launch harness (probe_live.ts, launch_n.sh) and a self-tested census checker
  - measured 6/6 DMABUF-unset boot on this host
affects:
  - quick 260930-blh (SUMMARY addendum), positioning todo 2026-09-28 (addendum)
tech-stack:
  added: []
  patterns:
    - source-level jest pin for wiring plus a unit-testable predicate taking a &str
key-files:
  created:
    - .planning/quick/260930-ea0-stop-auto-opening-web-inspector-on-linux/probe_live.ts
    - .planning/quick/260930-ea0-stop-auto-opening-web-inspector-on-linux/launch_n.sh
    - .planning/quick/260930-ea0-stop-auto-opening-web-inspector-on-linux/census_verdict.py
    - .planning/quick/260930-ea0-stop-auto-opening-web-inspector-on-linux/evidence/
  modified:
    - src-tauri/src/main.rs
    - src/backend/__tests__/tauriShellSource.test.ts
    - .planning/debug/knowledge-base.md
    - .planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/260930-blh-SUMMARY.md
    - .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md
  moved:
    - .planning/debug/linux-dev-app-blank-without-dmabuf-workaround.md -> .planning/debug/resolved/
decisions:
  - Platform gate sits OUTSIDE the visibility match so the existing pinned shape is untouched.
  - Skip log strings avoid the word "dock" because an existing jest pin bans it from non-comment code.
metrics:
  duration: about 1h
  completed: 2026-09-30
status: complete
commits: 3
plan_head_before: 37d983772ca668a6b43a749712b6dbe903ad2dd6
actuals:
  tokens: 12300
  tasks: 3
  commits: 3
---

# Phase quick-260930-ea0 Plan 01: Stop auto-opening the Web Inspector on Linux Summary

The Linux debug build no longer auto-opens the WebKit Web Inspector (main window and shared login window). With `WEBKIT_DISABLE_DMABUF_RENDERER` genuinely absent, 6 of 6 fresh-profile dev launches mounted the app at 1280x800, so the DMABUF workaround is not needed for boot render on this host.

## Outcome: PASS. The stop rule did not fire.

Task 3 took its PASS branch (debug session resolved, moved to `resolved/`, knowledge-base entry).

## Counts, before and after

| Check | Baseline | After |
| --- | --- | --- |
| `cargo test --bin gamelib-shell` | 285 passed, 0 failed, 2 ignored | 287 passed, 0 failed, 2 ignored (baseline + 2) |
| `devtools_auto_open` filter | n/a | 2 passed |
| rustfmt `Diff in` count | 75 | 75 (the hunk near the login site is the pre-existing unchanged `eprintln!`; no hunk in new lines) |
| non-comment `.open_devtools()` call sites | 2 | 2 |
| non-comment `should_auto_open_devtools(std::env::consts::OS)` sites | 0 | 2 |
| jest `tauriShellSource.test.ts` | 223 passed + 1 RED | 224 passed, 0 failed |
| `pnpm codecheck` / `pnpm lint` | n/a | clean / 0 errors, both ceilings PASS |
| prettier on the jest file (path not ignored) | n/a | clean |
| `pnpm planning-gates` | n/a | 12/12 |

RED observations are in `evidence/baseline.txt` (Rust E0425 on the missing predicate; jest expected 2, received 0).

## What was built

1. `should_auto_open_devtools(target_os: &str) -> bool` in `src-tauri/src/main.rs`, false only for `"linux"`, `#[cfg(any(debug_assertions, test))]`. Both debug auto-open sites consult it. The main-window `match window.is_visible() { Ok(true) => { window.open_devtools();` is byte-identical inside the new `if`, so the pre-existing jest pin still passes. Two Rust tests (`devtools_auto_open_is_skipped_on_linux_only`, `devtools_auto_open_decision_matches_this_host`) and a jest describe pin the predicate and the wiring.
2. `probe_live.ts` (copied from the debug session, edited only as the plan listed), `launch_n.sh`, `census_verdict.py` with `--selftest`.
3. Doc close-out: debug session resolved and moved with `git mv`, knowledge-base entry, dated addenda on the blh SUMMARY and the positioning todo (todo frontmatter untouched).

## Tracer

One live unset launch of the rebuilt binary: `DMABUF_VAR=absent`, `LD_PRELOAD_VAR=absent`, `WEBPROC_DMABUF_VAR=absent`, `app-chunk-import-done ... rootKids=1`, t+6000ms viewport `1280x800`, `WEBPROCS_AT_STOP=1`, `POST_TEARDOWN_PROCS=0`, stderr carries the new skip line and 0 old open lines. The Task 1 live assertions all passed.

## Census and selftest

`evidence/census/census.txt`: 6 of 6 `verdict=PASS` (mounted, 1 WebKitWebProcess, 1280x800, skip line present, old open line absent, no shim, DMABUF absent in shell and page process, LD_PRELOAD absent, 0 leftover processes). Launch count was fixed at 6 with no re-launches.

`--selftest` (`evidence/census/selftest.txt`): rejects cUI1 (unset + inspector: never mounted), c1I1 (`=1` + inspector: 1280x500, 2 WebKitWebProcess), cUN1 (shim-suppressed: old open line and `[shim]` lines present) and accepts a synthetic good launch. `SELFTEST PASS`.

## notes.txt findings (recorded, not gating)

- (a) `u1.png`: full-height UI, no docked inspector, 1575 colours, equal to the reference.
- (b) Right-click on an empty header area shows Back / Forward / Stop / Reload / **Inspect Element**. The "right-click > Inspect Element" wording is true; no amendment commit was needed. The item was not clicked.
- (c) Bonus blh E1-E4 with DMABUF unset: E1 PASS (4 settled lines, 2 distinct vbox), E2 PASS (slot 0.6639 changed, chrome 0.0000, left nav 0.0000), E3 PASS, E4 PASS. E4b and E5 NOT RUN. Slot rect is now 204,82 1076x718.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Skip log strings tripped an existing jest pin**
- **Found during:** Task 1 desk battery
- **Issue:** my first skip `eprintln!` text said "the docked inspector", and the pre-existing `tray scope boundary` test asserts the comment-stripped code does not contain `dock`.
- **Fix:** reworded both strings to "the inspector attach races page boot". Doc comments (stripped by the test) keep "docked".
- **Files modified:** `src-tauri/src/main.rs`
- **Commit:** `142cde2a5` (fixed before the first commit)

**2. [Rule 2 - Security/hygiene] Fake-profile temp directory names redacted from committed logs**
- **Found during:** evidence copy
- **Issue:** the app prints its own fake-HOME temp path (`/tmp/gl-ea0-XXXX`, `/tmp/gl-dbg-XXXX`) into `gamelib.log`. The plan's marker grep did not flag it, but the plan also says never to write the profile path into outputs.
- **Fix:** replaced with `<FAKEHOME>` in the committed copies (tracer files and the control `gamelib.log` files). The plan said controls are copied "unchanged"; this is the only alteration and does not touch any field the checker reads. Recorded in `notes.txt`.
- **Commit:** `c98b08e69`

**3. [Note] `setsid` forked, so `$!` was not vite's pid**
- vite's process group was found from the listening pid (pgid 137590) and stopped with `kill -- -137590`. No name-based kills.

No other deviations. The plan's fallback (nesting the `if`/`else` inside the cfg block) was not needed: rustc accepted `#[cfg(debug_assertions)] if ... { } else { }` in tail position.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None. The change removes a debug-only behaviour on Linux; no new endpoint, auth path or trust-boundary surface.

## NOT verified

- macOS and Windows behaviour (the predicate is unit-tested for both; CI's macos-latest and windows-latest run `cargo test --bin gamelib-shell`, not run here). No apple target on this host.
- The login window's Linux skip live: covered by unit test plus source pin only, not launched.
- That clicking "Inspect Element" opens a working inspector (the menu item was present, not clicked).
- Wayland, HiDPI, the packaged AppImage (never called `open_devtools`).
- One host only: X11, NVIDIA 580.173.02, WebKitGTK 2.50.4. The exact JSC assertion behind the abort is still unidentified; the fix removes the trigger, not the assertion.
- Bonus E4b (Epic round trip) and E5 were not run. The bonus harness does not record `LD_PRELOAD`.
- The Windows-only claim "keeps current behaviour" is by construction (predicate true), not measured.

## Commits

- `142cde2a5` fix(quick-260930-ea0): stop auto-opening the Web Inspector on Linux debug builds
- `c98b08e69` test(quick-260930-ea0): unset-DMABUF boot census, 6 fresh-profile launches
- `c88d02f84` docs(quick-260930-ea0): resolve debug linux-dev-app-blank-without-dmabuf-workaround, record the unset-DMABUF census

Branch `quick-260930-ea0` (not pushed). SUMMARY.md, STATE.md and PLAN.md are left for the orchestrator's docs commit.

## Self-Check: PASSED

- Files present: `src-tauri/src/main.rs` (predicate), `src/backend/__tests__/tauriShellSource.test.ts`, `probe_live.ts`, `launch_n.sh`, `census_verdict.py`, `evidence/census/census.txt`, `.planning/debug/resolved/linux-dev-app-blank-without-dmabuf-workaround.md`.
- Commits `142cde2a5`, `c98b08e69`, `c88d02f84` exist; `git rev-list --count 37d983772..HEAD` = 3, matching `commits: 3`.
- Post-run: 0 `gamelib-shell` processes, no `/tmp/gl-ea0-*` profile, vite stopped, `.planning/spikes/025-*/app/gen/` and `run.log` untouched.
