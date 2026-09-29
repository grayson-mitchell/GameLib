---
phase: quick-260929-hgm
plan: 01
status: complete
---

# Summary: Phase 38 sitting 8 -- `38-S12` live on Linux

## Result

**PASS.** `38-S12` (section-gating matrix row 8, hasChoice: native installs ON, more than one
registered Steam library) was scored live on Pop!_OS 22.04 / X11, third Linux sitting, and moved
to `human_verification_discharged` in `38-VERIFICATION.md` (8 -> 7 open, 18 -> 19 discharged;
`audit-uat by_phase["38"]` 8 -> 7, `total_items` 427 -> 426).

All four facts scored PASS, each independently, on two instruments:

| Region | Expected | Verdict |
| --- | --- | --- |
| Platform row | ABSENT | PASS |
| Library dropdown | PRESENT | PASS |
| Wine section (3 sub-signatures) | ABSENT | PASS |
| Free-space line | PRESENT | PASS (visual instrument; text-tree carve-out, see below) |

## Re-measured baseline (Task 1)

- Ledger: 8 open / 18 discharged / 10 retired going in (matched planning-time snapshot exactly).
  Open ids: `38-W04,38-W05,38-S12,38-S14,38-S16,38-E01,38-E03,38-E04`. Census: 80 ok / 2
  no-frontmatter / 3 bad, `34.13-UAT.md` still pinned at `(62:176)`.
- `ORIG_NATIVE` = `false`. `LIB_COUNT` = 2 (both times measured: Task 1 and pre-open).
- `steam_library_replica.cjs` (new, read-only, line-for-line mirror of
  `getSteamLibraries()`/`listSteamLibraryTargets()`): of 5 candidates (the `/usr/share/steam`
  sentinel plus 4 registered `libraryfolders.vdf` paths), exactly 2 exist on disk --
  `~/.steam/debian-installation` (primary) and `/mnt/PopGames/SteamLibrary`. **No library
  registration was needed** to arm `hasChoice` on this host, contrary to the item's own
  `blocked_by:` text.
- `SIGNED_IN` = yes (Library listed 381 owned games, several not installed, offering Install).

## Task 2 checkpoint

**SELF-SKIPPED, no operator pause needed for sign-in/library-count** -- both preconditions were
live-true (LockedHint no, same PID/exe as Task 1, replica COUNT=2, viewed Library grab showing
owned not-installed games).

**However, Task 1's own Step 0 DID block, before any launch**: the screen was locked
(`loginctl ... LockedHint=yes`), matching the state recorded at planning time. Nothing was
launched. A human-action checkpoint was raised asking the operator to unlock the screen. The
operator replied "screen is unlocked"; this was independently re-verified
(`LockedHint=no`, re-confirmed by a second, closer check before touching anything) before Task 1
resumed from its Step 0 inhibitor step onward.

## Lock and inhibitor handling

`gnome-session-inhibit --inhibit idle` ran under `setsid` for the whole sitting (PID 211172, the
real inhibitor PID -- not the shell wrapper PID that `pgrep -f ...` also matches; killing the
wrong PID once during cleanup silently no-opped, caught immediately by re-checking
`gnome-session-inhibit -l` and correcting to the real PID). Confirmed listed while running,
confirmed absent after cleanup.

## Methodology deviation: a capture-region offset, discovered and corrected mid-sitting

`linux_sitting_capture.py`'s `find_window()` sources x/y from `xdotool getwindowgeometry --shell`,
which reported a stable but WRONG client origin this sitting: `x=60,y=164`, a `(+10,+45)` offset
from the window's true rendered top-left. Proven two independent ways:

1. `xwininfo -id <id>` "Absolute upper-left" read `(50,119)`, stable across 3 repeated reads.
2. An AT-SPI-derived click at the SETTINGS tab's real screen position (`478,142`) -- which the
   wrong region would have placed entirely OUTSIDE the captured window -- landed on and activated
   the real tab, confirmed by a follow-up grab showing the Global Settings page.

Every grab/burst/selftest call made with the unmodified tool before this was discovered captured a
region shifted 45px too low and 10px too far right -- missing the top NavTabs strip entirely, and
running 45px past the window's true bottom edge into unrelated desktop content behind the window
(a stray "todo-frontmatter-gate.py" / ".continue-here.md" text overlay bled into the bottom of
early grabs -- confirmed NOT GameLib content).

**Fix:** `capture_region_fix.py` (new, this quick task's own directory, NOT a modification of the
shared `linux_sitting_capture.py` instrument), a narrow read-only wrapper providing `find`/`grab`/
`burst` sourced from `xwininfo`'s absolute origin instead of `xdotool getwindowgeometry --shell`.
Verified correct (full window in view, NavTabs visible, no foreign content) before any scored
capture was taken. `linux_sitting_capture.py`'s own `diff` subcommand was still reused unchanged
for frame comparison, since it only reads already-saved PNGs by path and never calls
`find_window()`.

Root cause not conclusively identified -- most likely a stale coordinate translation left over
from this sitting's own screen-lock/unlock cycle. Not reproduced against sittings 6/7's own
captures (out of scope to re-verify retroactively). Full detail:
`evidence/region-offset-deviation.txt`.

**A second, smaller deviation**, in-session: the first attempt to click "Install with options..."
used a coordinate estimated from a screenshot crop and missed the menu item, dismissing the menu
with no dialog opening (those frames were discarded, not committed). The retry used the live
AT-SPI-derived center of the menu item (queried fresh, right before the click) and succeeded on
the first attempt.

## Text-instrument validity

**VALID.** Positive control (dialog open): 1 dialog-role node, `title` in-dialog count 3, a push
button named "INSTALL" in the dialog-subtree role histogram. Negative control (dialog closed, same
game page, taken before the scored click): 0 dialog-role nodes, 0 in-dialog hits for
`library_dropdown`/`free_space_line`.

**One carve-out**: the free-space line's in-dialog text-tree count was 0, despite the text
("Space Available: 269.17 GiB free of 374.57 GiB") being clearly visible in the pixels and existing
verbatim on a WebKitGTK "page" role accessibility node -- the probe's dialog-containment logic just
doesn't classify that node as inside the "dialog" role subtree. Per the plan's own carve-out, this
is NOT a fail: the fact is scored on the visual instrument alone, and the limit is stated in the
ledger result. Full detail: `evidence/atspi-dialog-subtree.txt`.

## Transient / late-mount check

Burst: fps=10.8, median_interval=83.3ms, 65 frames over 6 seconds. `diff --flag 0.005` over the
settle set (dialog-settled.png as baseline + every post-click frame) flagged 3 of 60 frames, all
within the ~500ms MUI Slide open-transition window:

- +233ms: dialog first visible, dropdown empty, free-space line absent (EXPECTED LATE MOUNT)
- +342ms: dropdown populated, free-space line still absent (EXPECTED LATE MOUNT)
- +463ms: free-space line appears, matches settled state (EXPECTED LATE MOUNT, last transitional frame)

Next frame (+555ms) is unflagged. No scored transient: no platform row, wine sub-signature, or a
region that vanished after appearing, was ever seen.

## Native-setting round trip

`false` (original) -> toggled `true` through Settings UI, as late as possible (Task 3 step A,
immediately before the scored open), read back `true` -> restored to `false` through the same UI
toggle immediately after scoring (Task 3 step I, before any process cleanup) -> read back `false`,
confirmed matching `ORIG_NATIVE`. Never hand-edited.

## `38-S14` and `38-S16`'s Linux half

Remain the candidates for future Linux sittings. `38-S14` needs a Windows host (not Linux) for
its full test. `38-S16`'s Linux half needs a native-ON arm with AT MOST one library -- this host
currently has 2, so it would need a library UNmounted first, the opposite direction from this
sitting's setup.

## Cleanup

Both process groups (main `setsid` PGID 213303, sidecar's own PGID 213757) TERM'd, confirmed gone.
Idle inhibitor killed (correct PID, 211172), confirmed delisted. Port 5173 free. Steam client (pid
34061) left running, untouched. Dev vault and `libraryfolders.vdf` never read/written by this task.
No install was dispatched; the ACCIDENTAL DOWNLOAD RULE was never triggered.

## Commit

`d7cb36e96` -- `docs(quick-260929-hgm): Phase 38 sitting 8, third Linux sitting -- 38-S12 PASS`.
Staged exactly: `steam_library_replica.cjs`, `capture_region_fix.py`, `evidence/`,
`38-VERIFICATION.md`, `38-HUMAN-UAT.md`, `34.13-UAT.md`, `ROADMAP.md`. Untracked
`.planning/spikes/025-linux-add-child-compile/` files (already present at planning time,
unrelated) were left alone. `260929-hgm-PLAN.md` and this `260929-hgm-SUMMARY.md` are left for the
quick orchestrator to commit alongside `.planning/STATE.md`, per convention.

## Tooling note for future sittings

The long single-line `&&`-chained verify block in the plan reproduced sitting 6's known quirk
(bare "Exit code 1" through the Bash tool, no output) even though every individual check passed
when run standalone. Copied into a scratchpad script and run with `bash` instead -- all 15 steps
passed cleanly. Worth carrying into the next plan's own verify-authoring guidance.
