# Phase 24: macOS native Steam bridge (out-of-process steam_api proxy) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-18
**Phase:** 24-macos-native-steam-bridge-out-of-process-steam-api-proxy
**Areas discussed:** Allowlist source & updates, Helper lifecycle, Bridge-failure behavior, Generator output management

---

## Todo folding

| Todo | Score | Folded |
|------|-------|--------|
| Productionize the macOS native Steam bridge | 0.9 | ✓ |
| Steam bottle GPTK engine produces a broken bottle | 0.9 | ✓ |
| Runtime getProductInfo appinfo dump (osarch parser) | 0.6 | reviewed, not folded |
| Startup download-resume auto-opens Steam-in-CrossOver | 0.6 | reviewed, not folded |

**Notes:** The two 0.9 todos are directly on-domain (the productionization list is this phase; GPTK becomes the CrossOver-only constraint). The two 0.6 todos are Phase 18/21/23-era bottled-Steam concerns tangential to the bridge launch path.

---

## Allowlist source & updates

| Option | Description | Selected |
|--------|-------------|----------|
| Bundled JSON in the app | JSON keyed by AppID, edit + ship, reviewable, no infra | ✓ |
| Remote/CI index (Phase 19 pattern) | CI-built index fetched at runtime; add games without a release; more infra | |
| Hardcoded constant | Plain array/map in TS; simplest, least flexible | |

**User's choice:** Bundled JSON in the app
**Notes:** Best fit for an early/experimental bridge with a 2-game list. Phase 19 CI-index pattern captured as the later upgrade path.

---

## Helper lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| One shared long-lived helper | Backend starts one helper lazily on first bridge launch; inits once; serves all bridge games; lives until GameLib quits | ✓ |
| Per-launch helper | Fresh helper per game launch, torn down on exit; simpler isolation, re-inits every launch | |

**User's choice:** One shared long-lived helper
**Notes:** Matches "one client, one login". Flagged a MUST-VALIDATE research question (D-04): a single init holds one AppID, so research must confirm how per-game AppID identity is satisfied under one shared helper (generic 480 identity-only vs per-AppID re-init / pipe / helper). Decision unchanged; realization TBD by research.

---

## Bridge-failure behavior (R7)

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit error + offer bottled-Steam fallback | Clear error; offer to launch via the proven bottled-Steam path | ✓ |
| Silent auto-fallback | Quietly route to bottled Steam on failure; seamless but confusing/opaque | |
| Explicit error, no fallback | Show error and stop; user retries manually | |

**User's choice:** Explicit error + offer bottled-Steam fallback
**Notes:** Fire-and-forget launches today mean the bridge needs a real readiness/health signal to detect failure (D-06).

---

## Generator output management

| Option | Description | Selected |
|--------|-------------|----------|
| Commit generator + source, build binary | Commit generator + generated shim source; build PE at packaging time; reviewable diffs, no binaries in git | ✓ |
| Generate everything at build time | Nothing generated committed; smallest repo; ABI changes invisible in diffs | |
| Commit the built binary too | Commit source + prebuilt PE; reproducible at clone, but binary blobs in git | |

**User's choice:** Commit generator + source, build binary
**Notes:** SDK bump = regenerate + review source diff. Build with `zig cc -target x86-windows-gnu`.

---

## Claude's Discretion

- Wire/marshaling protocol between shim and helper (framing, call identification, error propagation).
- Per-game export-set derivation (objdump parsing) feeding the generator.
- Bottle provisioning changes for bridge-eligible games (lightweight prefix vs. reuse).
- Exact routing insertion around `isBottleEligible()`.
- electron-builder packaging wiring for the bundled arm64 helper + build-time shim generation.

## Deferred Ideas

- Remote/CI-updatable allowlist (Phase 19 pattern).
- Automatic per-game eligibility detection (objdump import-coverage + DRM/CEG check).
- P2P multiplayer join (out of scope per SPEC).
- Broad Apple-Silicon portability matrix (M1–M4).
- Retiring Phase 22 once the bridge proves itself.
