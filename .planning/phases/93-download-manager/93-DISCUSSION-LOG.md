# Phase 93: Download manager - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-27
**Phase:** 93-download-manager
**Areas discussed:** Resume on relaunch, Stall recovery, Live gate

---

## Resume on relaunch

| Option | Description | Selected |
|--------|-------------|----------|
| Stay paused | Persist the user's pause; a paused download stays paused after relaunch; an interrupted one resumes (deliberate delta) | ✓ |
| Keep today's behaviour | GOG/Epic/Amazon head always auto-resumes ~5 s after the window loads, even if paused | |
| Never auto-resume | Every store surfaced as resumable after relaunch, like Steam | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep Steam manual | A Steam head after restart stays resumable, never started unattended (parity) | ✓ |
| Resume Steam too | One rule for every store | |

| Option | Description | Selected |
|--------|-------------|----------|
| Interruption | Offline auto-pause and the quit pause are not user pauses; resume on relaunch once online | ✓ |
| Saved as paused | Any paused state at quit carries over | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep the 5 s delay | Parity | ✓ |
| You decide | Research picks a bounded boot step | |

---

## Stall recovery

| Option | Description | Selected |
|--------|-------------|----------|
| Keep: error, move on | Parity | ✓ |
| Retry once, then error | One automatic retry from partial files | |
| Pause at head | Leave it paused at the head with a notice | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep 8 minutes | Parity, sized against Steam pre-download and the 180 s depot bound | ✓ |
| Shorter for CLI runners | e.g. 3 min for gogdl/legendary/nile | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep both | Advance-only re-arm; fixed ceiling for no-progress runners; heartbeat test | ✓ |
| Exempt sideload | No watchdog for runners with no progress | |

---

## Live gate

| Option | Description | Selected |
|--------|-------------|----------|
| Own signed-build gate | 93-HUMAN-UAT.md on a signed 93 build | |
| Goldens + CI only | The 92 shape; live check deferred to the 98 gate | ✓ |

Owed to the 98 gate (multi-select): Pause stays paused ✓, Quit mid-download resumes ✓, Live stall trip (SIGSTOP the gogdl child) ✓, Finished list survives ✓.

---

## Claude's Discretion

- Crate placement, the state-actor shape, how the pause flag is stored, whether a `downloadFile` caller survives to 93 (reqwest Range if so), test clock and fakes, plan/wave breakdown.

## Deferred Ideas

- The four live checks → Phase 98 gate.
- Retry-once on stall, a shorter CLI stall window, auto-resuming Steam: considered and declined.
