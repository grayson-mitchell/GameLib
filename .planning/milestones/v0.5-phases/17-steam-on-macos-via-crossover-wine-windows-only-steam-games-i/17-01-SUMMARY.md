---
phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i
plan: 01
subsystem: infra
tags: [crossover, wine, cxbottle, spike, macos]

# Dependency graph
requires: []
provides:
  - "Empirically-locked cxbottle bottle-create mechanism for the dedicated Steam CrossOver bottle"
  - "Confirmed argv-safe invocation pattern (T-17-01) for spawning cxbottle with a bottle name"
affects: [17-04-provision-crossover-bottle]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "cxbottle argv-form invocation (arguments as separate words, never shell-interpolated) for creating/managing CrossOver bottles"
    - "Success signal for bottle creation = existence of <bottle-dir>/cxbottle.conf, matching the existing 'bottle exists' verification gate at launcher.ts:827-855"

key-files:
  created:
    - spike/steam-bottle/probe-cxbottle.sh
    - spike/steam-bottle/FINDINGS.md
  modified: []

key-decisions:
  - "LOCKED (CLI): `cxbottle --create --bottle <name> --template win10` is the confirmed create mechanism (argv form, first candidate attempted succeeded on CrossOver 26.2) — no GUI fallback needed"
  - "CrossOver binary resolves at /Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/cxbottle"
  - "CrossOver 26.2 creates a unified WoW64 prefix ('32-bit prefix in Wow64 mode') by default; this is compatible with the 64-bit Windows Steam client — no --param arch override required for 17-04"

patterns-established:
  - "Argv-form CLI invocation for cxbottle (never shell-string interpolation of bottle names) — T-17-01 mitigation, must be reused by provisionBottle() in 17-04"

requirements-completed: [MACSTEAM-02]

# Metrics
duration: 5min
completed: 2026-07-10
---

# Phase 17 Plan 01: CrossOver Bottle Create-Probe Summary

**Empirically locked the CrossOver bottle-create mechanism (`cxbottle --create --bottle <name> --template win10`) via a throwaway spike, unblocking 17-04's provisioning implementation with a verified command instead of an assumption.**

## Performance

- **Duration:** ~5 min (continuation agent portion; Task 1 was executed in a prior session)
- **Started:** 2026-07-10 (Task 1), resolved 2026-07-10 (Task 2 human-verify)
- **Completed:** 2026-07-10T~22:15:00+12:00
- **Tasks:** 2/2
- **Files modified:** 1 (FINDINGS.md filled in; probe script unchanged from Task 1)

## Accomplishments

- Wrote a non-interactive probe script (`spike/steam-bottle/probe-cxbottle.sh`) that resolves the CrossOver binary, captures `cxbottle --help` verbatim, and attempts candidate create invocations in argv-safe form, checking for `cxbottle.conf` after each.
- User ran the probe on a real macOS + CrossOver 26.2 (build 26.2.0.39821) install. The first candidate invocation succeeded immediately.
- **MECHANISM DECISION locked:** `cxbottle --create --bottle <name> --template win10`, invoked in argv form, with the binary resolved at `/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/cxbottle`. Success signal is the appearance of `~/Library/Application Support/CrossOver/Bottles/<name>/cxbottle.conf` — this matches GameLib's existing "bottle exists" gate at `launcher.ts:827-855`.
- Noted for 17-04: CrossOver 26.2 creates bottles as a unified WoW64 prefix ("32-bit prefix in Wow64 mode"), which is compatible with the 64-bit Windows Steam client; no `--param` architecture override is needed.
- Throwaway spike bottle (`gamelib-steam-spike`) was torn down by the user after the probe succeeded.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the cxbottle create-probe script + FINDINGS template** - `f9391f64` (feat)
2. **Task 2: Human runs the probe on a real CrossOver install and locks the mechanism** - `8542bf62` (docs) — checkpoint:human-verify, resolved out-of-band by the user running the probe, then committed by this continuation agent.

**Plan metadata:** (this commit, docs: complete plan)

_Note: Task 2 is a `checkpoint:human-verify` gate, not a code task — the "commit" is the docs commit recording the human-supplied findings, per plan instructions._

## Files Created/Modified

- `spike/steam-bottle/probe-cxbottle.sh` - Throwaway bash probe: resolves cxbottle binary, prints `--help` output, attempts 3 candidate non-interactive create invocations in argv form, reports `cxbottle.conf` presence after each.
- `spike/steam-bottle/FINDINGS.md` - Filled with Environment (CrossOver 26.2 / macOS 26), full `cxbottle --help` output, Attempt Results (first candidate succeeded), and the locked `## MECHANISM DECISION`.

## Decisions Made

- **Mechanism locked as CLI, not GUI fallback.** The plan's D-02 fallback path ("user creates via CrossOver GUI, GameLib verifies+configures") is NOT needed — the first candidate CLI invocation (`--create --bottle <name> --template win10`) worked on the first attempt.
- **`--template win10` is valid** despite CrossOver's own `--help` output only enumerating `win98`/`win2000`/`winxp` as examples — confirmed empirically rather than relying on the abridged help text.
- **No architecture override required.** CrossOver 26.2's default unified WoW64 prefix runs 64-bit Windows Steam without any `--param` flag.

## Deviations from Plan

None - plan executed exactly as written. Task 2 (human-verify checkpoint) was resolved by the user running the probe outside this agent session; this continuation agent verified the resolved FINDINGS.md against the plan's acceptance criteria and committed it, exactly per the checkpoint's `<resume-signal>` instructions.

## Issues Encountered

None. The human-verify checkpoint was a genuine "requires a real CrossOver install" gate (correctly non-autonomous per the plan's `<notes>`), and it resolved cleanly on the first probe attempt.

## User Setup Required

None - no external service configuration required. (The human action required was running a local shell script on a CrossOver-equipped Mac, which has already been completed.)

## Next Phase Readiness

- 17-04 (bottle provisioning) can now implement `provisionBottle()` against a verified, non-speculative command: `cxbottle --create --bottle <name> --template win10` in argv form, with `cxbottle.conf` existence as the success signal.
- The T-17-01 argv-safety pattern (never shell-interpolate the bottle name) established by the probe script must be reused verbatim in 17-04's implementation.
- 17-04 should account for CrossOver's default unified WoW64 prefix behavior (no extra arch handling needed).
- `spike/steam-bottle/` is a throwaway directory per the Phase 16 precedent — safe to delete once 17-04 has consumed the locked mechanism (not deleted in this plan; left for 17-04 or a later cleanup pass).
- No blockers for 17-04.

## Self-Check: PASSED

- FOUND: spike/steam-bottle/probe-cxbottle.sh
- FOUND: spike/steam-bottle/FINDINGS.md
- FOUND commit: f9391f64 (Task 1)
- FOUND commit: 8542bf62 (Task 2 / FINDINGS.md commit)
- FINDINGS.md `## MECHANISM DECISION` section confirmed filled with concrete `cxbottle` argv (not `FALLBACK`).
- FINDINGS.md `## Environment` section confirmed contains CrossOver version (26.2, build 26.2.0.39821).

---
*Phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i*
*Completed: 2026-07-10*
