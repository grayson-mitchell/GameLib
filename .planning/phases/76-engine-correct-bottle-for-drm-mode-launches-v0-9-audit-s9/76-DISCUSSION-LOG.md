# Phase 76: Engine-correct bottle for DRM-mode launches (v0.9 audit S9) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-15
**Phase:** 76-engine-correct-bottle-for-drm-mode-launches-v0-9-audit-s9
**Areas discussed:** Fix shape, User-facing behaviour, Install-time handling, Verification bar

---

## Fix shape

| Option | Description | Selected |
|--------|-------------|----------|
| Switch, refuse on failure | prepareBottleForEngine(next: crossover) in the DRM branch; refuse if ok:false | ✓ |
| Always refuse | Detect mismatch and refuse; never touch the bottle | |
| Switch, launch anyway on failure | Fall back to today's behaviour on failure | |

**User's choice:** Switch, refuse on failure

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, reuse the pre-check | offlineLaunchCertainlyBlocked up front, same as TCP | ✓ |
| No, let prepare fail | Surface prepareBottleForEngine's reason | |
| You decide | Planner picks | |

**User's choice:** Yes, reuse the pre-check

| Option | Description | Selected |
|--------|-------------|----------|
| Any non-CrossOver marker | Install fallback, earlier override, Wine Manager build | ✓ |
| Install-fallback only | Only the audit's S9 case | |

**User's choice:** Any non-CrossOver marker

---

## User-facing behaviour

| Option | Description | Selected |
|--------|-------------|----------|
| Silent, 'Setting up' status | Existing engine-download setting-up status, no dialog | ✓ |
| Confirm dialog first | Ask before switching | |
| Silent plus a one-time notice | Toast after switching | |

**User's choice:** Silent, 'Setting up' status

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse engine dialogs | showEngineDialog / notifyCrossoverRequired, per-reason wording | ✓ |
| New DRM-specific dialog | One dedicated message | |
| You decide | Planner picks | |

**User's choice:** Reuse engine dialogs

---

## Install-time handling

| Option | Description | Selected |
|--------|-------------|----------|
| Launch-side only | Install unchanged; DRM launch switches the bottle back | ✓ |
| Also warn at install | Notice after download if SteamStub and CrossOver missing | |
| Also refuse install | Block SteamStub installs without CrossOver | |

**User's choice:** Launch-side only

---

## Verification bar

| Option | Description | Selected |
|--------|-------------|----------|
| Unit tests + one live run | Branch tests plus live macOS UAT | ✓ |
| Unit tests only | Rely on Phase 59's live-proven switch | |
| Live run is the gate | Live UAT gates completion | |

**User's choice:** Unit tests + one live run

| Option | Description | Selected |
|--------|-------------|----------|
| You decide | Planner picks a Phase 56-proven SteamStub title | ✓ |
| I'll name one | User names the title | |

**User's choice:** You decide

---

## Claude's Discretion

- UAT title choice (a SteamStub title proven in Phase 56 UAT).
- Factoring of the shared pre-check + switch between TCP and DRM paths.

## Deferred Ideas

None. Four keyword-matched todos reviewed and not folded (see CONTEXT.md).
