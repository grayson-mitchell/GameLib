# Phase 74: Steam game updates - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log preserves the alternatives considered.

**Date:** 2026-11-12
**Phase:** 74-steam-game-updates
**Areas discussed:** Auto-update policy, Launching a stale game, Update UI and queue, Failure and fallback, InstallApp opt-in gate (raised during write-up)

---

## Auto-update policy

| Option | Description | Selected |
|--------|-------------|----------|
| Follow global setting | Bridge stale → auto-queue when `autoUpdateGames` is ON | ✓ |
| Always manual | Bridge updates only start when you click | |
| Always automatic | Ignore the setting for bridge games | |

| Option | Description | Selected |
|--------|-------------|----------|
| Leave to Steam | GameLib never auto-calls InstallApp | ✓ |
| Follow global setting | Call InstallApp automatically when ON | |

| Option | Description | Selected |
|--------|-------------|----------|
| Global only | No per-game override | ✓ |
| Per-game toggle | Per-game auto-update override | |

## Launching a stale game

| Question | Options | Selected |
|----------|---------|----------|
| Play on a stale bridge game | Prompt Update/Play anyway · Launch, badge only · Update first then launch | Prompt |
| Pre-launch check slow or offline | Short timeout then launch · Cached state only | Short timeout |
| "Don't ask again" | Yes, per build · No, ask every launch | Yes, per build |
| Steam-registered games | No, Steam handles it · Same prompt as bridge | No prompt |

## Update UI and queue

| Question | Options | Selected |
|----------|---------|----------|
| Card | Existing update indicator · New Steam-specific badge | Existing |
| Size shown | Both download and temp disk · Download only · No sizes | Both |
| Queue | Same queue labelled Update · Separate updates section | Same queue |
| Steam-side progress | Yes, like installs · Fire and forget | Yes |

## Failure and fallback

| Question | Options | Selected |
|----------|---------|----------|
| Short disk | Refuse with clear message · Offer in-place fallback | Refuse |
| Old manifest unavailable | File-level reconcile, auto · Ask: full reinstall? | File-level reconcile |
| BetaKey | Track that branch · Public only | Track branch |
| Mid-update failure | Old build intact, resumable · Auto-retry then surface | Old build intact |

## InstallApp opt-in gate

Found during the write-up: `InstallApp` is behind "Steam Experimental InstallApp Feature" (off by
default, macOS-only).

| Option | Description | Selected |
|--------|-------------|----------|
| Hand off to Steam | With the setting off, Update opens the game in the Steam client | ✓ |
| Badge only, no button | No action with the setting off | |
| Update ignores the gate | Always use InstallApp on macOS | |

## Claude's Discretion

- How the pre-click size is estimated, the timeout value, where the per-build acknowledgement
  is stored, the job schema and status names, the steam:// URI, and testing of the paths spike
  076 didn't cover (removed files, multi-depot, file modes, interrupted commit).

## Deferred Ideas

- Per-game auto-update override.
- An in-place patch mode for low disk space.
- Verify / Move install: kept in its own todo.
