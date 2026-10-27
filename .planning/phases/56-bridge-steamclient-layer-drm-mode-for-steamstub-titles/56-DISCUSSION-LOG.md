# Phase 56: Bridge steamclient-layer DRM mode for SteamStub titles - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-28
**Phase:** 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
**Areas discussed:** Where the parts come from, Runner and bottle, Routing and failure, Verified evidence here

---

## Where the parts come from

| Option | Description | Selected |
|--------|-------------|----------|
| Build lsteamclient ourselves | Proton pinned + NotProton overlay, against a CrossOver source drop, in GameLib's build; separately licensed component | ✓ |
| NotProton's release artifacts | Download their prebuilt lsteamclient | |
| Build at install time on the user's Mac | Needs a toolchain on every user's Mac | |

| Option | Description | Selected |
|--------|-------------|----------|
| Port NotProton's detour + resolve.py | GPL-3, compatible with GameLib's license | ✓ |
| Write our own from Proton's loader | Reimplement from scratch | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Follow Valve's current manifest | Verify against the manifest's own sha | ✓ |
| Pin one package by sha256 | Deterministic; needs bumping | |
| Pin, falling back to current | Hybrid | |

| Option | Description | Selected |
|--------|-------------|----------|
| First SteamStub launch (lazy, cached) | | ✓ |
| At bridge setup | | |

| Option | Description | Selected |
|--------|-------------|----------|
| client + tier0 + vstdlib | The set 044 proved | ✓ |
| Only steamclient64.dll | Minimum, unproven | |

| Option | Description | Selected |
|--------|-------------|----------|
| Port steam_helper, SteamStub parts only | Environment without the DIPC/CEG responder | ✓ |
| Minimal: registry only | Extend Phase 52's HKCU setup | |
| Port it whole | Includes the DIPC responder | |

---

## Runner and bottle

| Option | Description | Selected |
|--------|-------------|----------|
| Clone the user's installed CrossOver | Pattern-resolved patch sites; version allowlist for ABI | ✓ |
| Pin one CrossOver build | 26.3.x only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Notice naming the version, then stop | | ✓ |
| Try the pattern patch anyway | ABI risk | |

| Option | Description | Selected |
|--------|-------------|----------|
| Existing GameLibSteamBridge-<appid> bottle | Shim/forwarder removed, original steam_api restored | ✓ |
| New per-title DRM bottle | Duplicates installs | |

| Option | Description | Selected |
|--------|-------------|----------|
| Re-clone and re-patch on next DRM launch | Keyed to CrossOver version and build | ✓ |
| Keep the old clone | | |
| You decide | | |

---

## Routing and failure

| Option | Description | Selected |
|--------|-------------|----------|
| Every `.bind` title, automatically | | ✓ |
| Allowlist only | | |
| Automatic, with a per-title override | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Notice with the cause, then stop | No forwarder fallback, no bottled Steam | ✓ |
| Fall back to the Phase 52 forwarder | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Remove the forwarder | | ✓ |
| Keep it dormant | | |

---

## Verified evidence here

| Option | Description | Selected |
|--------|-------------|----------|
| lsteamclient logs a game-process CreateInterface | HELLO equivalent | ✓ |
| Process + module check (+loaddll) | Weaker | |

| Option | Description | Selected |
|--------|-------------|----------|
| Game-originated call beyond init, traced in lsteamclient | Mirrors D-53-13; a game log line also counts | ✓ |
| Game log line only | May be impossible for Grim Dawn | |
| Overlay or achievement check by the operator | Human-only; overlay may not work | |

| Option | Description | Selected |
|--------|-------------|----------|
| Grim Dawn required; Raft and Ranch Sim recorded | Matches the roadmap | ✓ |
| All three must pass | | |

---

## Claude's Discretion

- How the fetch progress appears in the UI; cache layout; the trace-line format; the order of setup steps.

## Deferred Ideas

- CEG through this mode; x86 SteamStub (`detour32.c`); a per-title mode override.
