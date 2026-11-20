# Phase 76: Engine-correct bottle for DRM-mode launches (v0.9 audit S9) - Context

**Gathered:** 2026-11-15
**Status:** Ready for planning

<domain>
## Phase Boundary

A SteamStub title never launches in DRM mode (steamclient-layer) over a bottle that a
non-CrossOver engine initialised. The fix is at launch: the DRM branch brings the bottle back to
CrossOver through the existing engine switch before launching, or refuses with a clear message
when the switch cannot happen. Requirement: **DEBT-01**.

Not in scope: making DRM mode work on the built-in engine (DRM mode stays CrossOver-only, Phase 59
decision), changing how install chooses the creation engine, and the legacy shared-bottle
hard-block (audit tech-debt item, deliberate per 59-REVIEW WR-06).

</domain>

<decisions>
## Implementation Decisions

### Fix shape
- **D-01:** In the DRM branch of the bridge launch, after `preflightCrossover` returns healthy,
  call `prepareBottleForEngine({ next: crossover, ... })` — the same switch TCP launches use via
  `selectLaunchEngine`. If it returns `ok: true`, launch. If it returns `ok: false` (bottle-busy,
  game-running, marker-newer, invalid-bottle, DXVK/restore failure, pin unavailable), **refuse the
  launch** with a clear message. Never launch over a mismatched bottle.
- **D-02:** The DRM branch reuses the TCP path's offline up-front refusal
  (`offlineLaunchCertainlyBlocked`, G22/G25, 59-26): when offline and returning the bottle to
  CrossOver needs an engine pin that is not on disk, refuse before attempting the switch.
- **D-03:** The rule is keyed on the bottle's engine marker, not on how it got there. Any
  non-CrossOver marker — install-time fallback (the audit's S9 case), an engine override set while
  the title was still TCP mode, a Wine Manager build — is switched back to CrossOver on a DRM
  launch. A bottle already on CrossOver is a no-op (`changed: false`).
- **D-04:** The DRM branch still never calls `decideLaunchEngine` and never selects the built-in
  engine; the per-game override stays ineffective in DRM mode (`isDrmModeFromVerdict`,
  `overrideEligible`).

### User-facing behaviour
- **D-05:** A successful switch is silent: show the existing `engine-download` / `setting-up` game
  status (the `onSwitching` callback TCP launches pass), then launch. No confirm dialog, no toast.
- **D-06:** Refusals reuse existing surfaces (`showEngineDialog`, `notifyCrossoverRequired`) and
  the per-reason wording TCP launches already show. Add a DRM-specific i18n string only where no
  existing string fits. Every refusal sends the terminal `done` status (the DRM path bypasses
  launcher.ts's `done`, IN-01/D-05 of Phase 56).

### Install-time handling
- **D-07:** Launch-side only. Install keeps choosing the creation engine with
  `decideCreationEngine` (presence-only); `.bind` is not known when the bottle is created, and the
  launch-side switch covers every path that can leave a non-CrossOver marker.

### Verification bar
- **D-08:** Unit tests for each branch: marker already CrossOver (no switch), switch succeeds,
  each `ok: false` reason refuses and sends `done`, offline pre-check refuses, CrossOver unhealthy
  still refuses via `notifyCrossoverRequired` as today.
- **D-09:** Plus one live macOS UAT: install a SteamStub title with CrossOver hidden (bottle gets
  the Wine-Staging pin), restore CrossOver, launch; confirm the engine marker now reads crossover
  and the launch reaches the DRM-mode path (lsteamclient game-process trace, per the strict
  "verified" criterion D-56-15/16). UAT file follows the repo's UAT item shape convention.

### Claude's Discretion
- Which SteamStub title to use for the live UAT — pick one already proven in DRM mode in the
  Phase 56 UAT.
- How to factor the shared pre-check + switch between the TCP and DRM paths (extract a helper vs
  inline), as long as the TCP path's behaviour is unchanged.

### Amendment 2026-11-16 (gap closure, 76-VERIFICATION missing item 1)
- **D-07a (amends D-07):** Install may now *record* the engine it created a bridge bottle with: provisionBridgeBottle
  writes `.gamelib-engine.json` after a successful creation (kind `pinned` with the pin id for the fallback engine,
  kind `crossover` for the CrossOver path). The engine *choice* is unchanged: `decideCreationEngine` stays
  presence-only and untouched, and the launch-side switch (D-01/D-03) remains the mechanism that brings a bottle to
  CrossOver. Reason: a marker-less pinned bottle is mislabelled crossover once CrossOver's pre-flight probe adds a
  Timestamp to its cxbottle.conf (76-VERIFICATION, 76-REVIEW CR-01, UAT item 3). Implemented by 76-03/76-04.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The defect
- `.planning/milestones/v0.9-MILESTONE-AUDIT.md` — S9 tech-debt entry (line ~19) and the
  integration 8/9 seam. Its line numbers predate Phases 62/65; current locations are below.
- `.planning/REQUIREMENTS.md` — DEBT-01.

### Prior phases this builds on
- `.planning/milestones/v0.9-phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/` —
  DRM mode design, done-status contract (IN-01/D-05), verification criterion D-56-15/16.
- `.planning/milestones/v0.9-phases/59-steam-engine-fallback-when-crossover-is-unavailable/` —
  engine fallback, `prepareBottleForEngine`, offline refusal (59-26, G22/G25), WR-02/WR-03/WR-06.

### Project skills
- `Skill("spike-findings-gamelib")` — bridge engines and the Steam DRM boundary.
- `Skill("gamelib-conventions")` — UAT item shape, `<verify>` prettier check, fake-HOME isolation.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/backend/engine/engineSwitch.ts` `prepareBottleForEngine` (~L545, body ~L594): marker-based
  switch with busy/running/newer-marker refusals; per-bottle in-flight serialisation.
- `src/backend/storeManagers/steam/gameLaunch.ts` `selectLaunchEngine` (~L505–660): the TCP
  path's offline pre-check, `prepareBottleForEngine` call, `onSwitching` status and refusal
  dialogs — the model to mirror.
- `src/backend/engine/offlineRefusal.ts` `offlineLaunchCertainlyBlocked`.
- `src/backend/engine/engineSwitch.ts` `readBottleEngineMarkerKind`, `restoreNeedsAbsentPin`.

### Established Patterns
- DRM mode is CrossOver-only and never consults `decideLaunchEngine` (comment at
  `gameBridgeLaunch.ts` ~L180).
- Every non-launch on the bridge/DRM path sends a terminal `done` (`sendLaunchDone`,
  WR-01 quick 261029-m68).

### Integration Points
- `src/backend/storeManagers/steam/gameBridgeLaunch.ts` ~L180–196: the `wantsDrm` branch that
  only runs `preflightCrossover` — the insertion point.
- `src/backend/storeManagers/steam/gameInstallBridge.ts` ~L202–240: install-time
  `decideCreationEngine` (unchanged, D-07).
- `src/backend/engine/engineDecision.ts` `decideCreationEngine` (~L753), `preflightCrossover`.

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the decisions — mirror the TCP launch path's behaviour.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

### Reviewed Todos (not folded)
- `2026-11-07-launch-steam-games-without-steam.md` — keyword match only; unrelated to bottle engines.
- `2026-11-07-spike-refresh-via-running-steam-client.md` — keyword match only; library refresh.
- `2026-11-13-pin-bridge-libsteam-api-dylib.md` — keyword match only; bridge helper dylib.
- `2026-11-14-macos-wazhack-single-playing-done-check.md` — keyword match only; launch status.

</deferred>

---

*Phase: 76-engine-correct-bottle-for-drm-mode-launches-v0-9-audit-s9*
*Context gathered: 2026-11-15*
