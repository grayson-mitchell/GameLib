# Phase 59: Steam engine fallback when CrossOver is unavailable - Context

**Gathered:** 2026-10-31
**Status:** Ready for planning

<domain>
## Phase Boundary

A Windows Steam title on the macOS native bridge still launches when CrossOver is missing,
expired for that bottle, or broken. CrossOver stays the first-choice engine. The fallback is
one GameLib-managed Wine-Staging + DXVK build pinned per GameLib release, with the previous
pinned build kept for rollback. It runs the game's bridge bottle with `USER=crossover`.
Before every CrossOver launch, GameLib checks the bottle's trial state
(`CX_BOTTLE=<bottle> wine --demo-status`), and every CrossOver launch runs with a timeout.
GameLib shows "N days remaining" before expiry and records which CrossOver versions it has
tested. A per-game engine override exists only as an advanced, unsupported option.

**Out of scope (from ROADMAP):** DRM mode and bottled Steam (they stay CrossOver-only),
GPTK and `-DXMT` for Steam, and a full census on the fallback (it is best-effort).

**Scope clarification from this discussion:** "CrossOver missing" includes a user who
**never** had CrossOver. The fallback must be able to create the bridge bottle itself, not
only rescue bottles CrossOver made (D-01).

</domain>

<decisions>
## Implementation Decisions

### No-CrossOver-ever case
- **D-01:** With no CrossOver installed, GameLib creates the bridge bottle itself with the
  fallback engine (the wineboot path from spike 056) and runs it with `USER=crossover`. The
  Windows profile is then `C:\users\crossover` from the start.
- **D-02:** Fallback-created bottles live in the same place as CrossOver bottles (CrossOver's
  Bottles directory) under the same `GameLibSteamBridge-<appid>` naming. There is one layout.
- **D-03:** When CrossOver is installed later, a fallback-created bottle is **adopted** into
  CrossOver: CrossOver becomes first choice for that game on the same prefix (the reverse
  direction of spike 059). GameLib writes whatever CrossOver needs to recognise the prefix as
  a bottle (e.g. `cxbottle.conf`). Research must establish exactly what that is and confirm
  the adoption is clean. Saves survive because the profile is already `crossover`.
- **D-04:** With no CrossOver, games install and launch on the built-in engine without
  blocking. A dismissible, non-blocking note recommends CrossOver for better compatibility
  and performance.

### Fallback install & switch UX
- **D-05:** The pinned fallback is downloaded **on first need**, not up front. The first
  launch that needs it downloads it, with progress shown in the launch flow. For a
  no-CrossOver user, it downloads during the first bridge-game install. Licensed CrossOver
  users never download it.
- **D-06:** Every launch that drops to the fallback shows a short toast giving the reason
  (e.g. "CrossOver trial expired — using built-in engine"). While the condition lasts, the
  game page shows a persistent **"Built-in engine (best-effort)"** badge.
- **D-07:** Falling back is decided **per launch** and is not stored state. Each launch
  re-checks CrossOver and uses it when it is healthy, so games return to CrossOver
  automatically once it is licensed, reinstalled or fixed. Spike 059 showed the round trip
  is safe, costing one silent prefix update.
- **D-08:** Rolling the fallback back is a **release lever only**. A GameLib update re-pins the
  previous build, which is still on disk, so no download is needed. Users get no rollback
  toggle; they can reach the previous build only through the advanced override (D-14).

### "Broken" CrossOver detection
- **D-09:** Only **pre-flight checks** count as "CrossOver broken", and only they route a
  launch to the fallback:
  - the CrossOver app or `bin/wine` is missing or can't run;
  - `--demo-status` errors, hangs past its own short cap, or prints output that matches none
    of `Standard version` / `Demo version (N days remaining)` /
    `Demo version (expired N days ago)`.

  Expired (`Demo version (expired …)`) routes to the fallback. A failure after the game has
  started is **never** treated as broken CrossOver.
- **D-10:** If pre-flight passed but the launch times out before any game process exists,
  GameLib kills the bottle's wineserver cleanly and shows a **"Game didn't start"**
  launch-failure error pointing at the log and known-fixes. It does **not** offer or auto-retry
  the fallback. The user's reasoning: once pre-flight has passed, a hang is most likely a game
  compatibility problem, and the fallback is the weaker engine (slower, no D3D12, no working
  DXMT), so it rarely helps. The advanced override is still there for power users.
- **D-11:** The launch timeout stops when the **game process is seen in the bottle**, not at
  bridge HELLO, which would falsely trigger on games that load steam_api late. The default must
  cover a first-run prefix update and the shared-redist step. Running games are never subject
  to it.
- **D-12:** Research must close spike 060's open items: whether the near-expiry nag ("This
  install will stop working in %d days") blocks a launch, whether the operator saw a dialog
  during the expired hang, and how `cxbottle --create` behaves under expiry. If the near-expiry
  nag blocks, GameLib suppresses or handles it and **keeps launching on CrossOver**. Only an
  expired bottle goes to the fallback.

### Trial notice & override surface
- **D-13:** The CrossOver trial notice appears on the **game page** once that game's bottle has
  **7 days or fewer** left. It shows the days remaining, links to buy CrossOver, and explains
  that GameLib will switch to the built-in engine after expiry. Nothing shows before 7 days.
  The trial clock is per bottle (spike 060), so the notice is per game.
- **D-14:** The per-game engine override lives in the game's settings under **Advanced**,
  collapsed. It defaults to **"Automatic (CrossOver, then built-in)"**. It lists CrossOver,
  both pinned fallback builds, and any Wine-Staging build installed through the Wine Manager.
  Choosing a non-automatic option shows the warning "Unsupported — known fixes and
  compatibility ratings don't apply", and the game page shows an **"Unsupported engine"**
  badge. The launch log records the exact engine and version (from ROADMAP).
- **D-15:** An untested CrossOver version gets a **one-time dismissible notice** the first time
  GameLib sees that version ("untested with GameLib; please report issues"), plus a line in
  every launch log. It never blocks a launch. The tested-versions record generalises the
  DRM-mode allowlist pattern.

### Claude's Discretion
- The exact timeout value and the `--demo-status` cap (spike 060: 4.2 s cold, 0.9 s warm).
- Whether to cache `--demo-status` results within a session. It must still be correct per
  launch (D-07).
- How DRM-mode and bottled-Steam games behave when CrossOver is unavailable (they are out of
  scope for the fallback). The expected shape is a clear CrossOver-required error, never a
  hang.
- Which UI component the badge, toast and notice use, following the existing game-page
  patterns.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and engine decision
- `.planning/ROADMAP.md` § Phase 59 — the goal, the in-scope and out-of-scope lists, and the
  dependency on Phase 51.
- `.planning/spikes/MANIFEST.md` § "Requirements (Idea B — non-CrossOver engines, from spikes
  056–059)" — the operator's engine decision (CrossOver first, pinned Staging + DXVK fallback,
  unsupported override, CrossOver hygiene).

### Spike evidence
- `.planning/spikes/056-plain-prefix-bridge-handshake/README.md` — the bridge runs unchanged on
  a plain Wine-Staging prefix. This is the fresh-prefix path for D-01.
- `.planning/spikes/057-wine-staging-real-title/README.md` — Staging + DXVK-macOS is the
  working non-CrossOver D3D11 path. Never capture unbounded wine stdout on it (3.37 GB in
  184 s).
- `.planning/spikes/058-gptk-engine-bridge/README.md` — why GPTK is excluded.
- `.planning/spikes/059-reuse-cx-bottle-vs-fresh-prefix/README.md` — same-bottle engine
  switching, the profile hazard and the `USER=crossover` fix (`WINEUSERNAME` is ignored), and
  the side effects of a round trip.
- `.planning/spikes/060-crossover-trial-expiry/README.md` — `--demo-status` detection, the
  per-bottle trial clock, the expired-launch hang, the open items (D-12), and the
  `sandbox-exec` licence-hiding harness for tests.

### Prior phase decisions
- `.planning/phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-CONTEXT.md`
  D-08–D-10 — the CrossOver clone and version allowlist pattern that D-15 generalises. Never
  modify the user's CrossOver in place.
- `.planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-CONTEXT.md`
  — per-game bridge bottles, which this phase depends on.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/backend/storeManagers/steam/bottle.ts`: `isCrossoverInstalled()` (L87),
  `provisionBridgeBottle()` (L1938, cxbottle-based; D-01 needs a fallback branch),
  `stockBridgeBottleSettings()` (L1387, the runner), `getBottleDir()`,
  `isBottleProvisioned()`, `persistBottleWineVersion()`. Per spike 056/058, all of the
  CrossOver coupling sits in `provisionBridgeBottle` and `stockBridgeBottleSettings`.
- `src/backend/utils/compatibility_layers.ts` `getCrossover()` (L308): CrossOver discovery.
- `src/backend/wine/manager/downloader/`: Heroic's Wine Manager downloader, which already
  fetches Gcenx Wine-Staging. This is the likely base for the pinned download (D-05) and the
  install source for the override list (D-14).
- `src/backend/config.ts` L348 `autoInstallDxvk: isLinux || isMac`: DXVK-macOS (Gcenx
  v1.10.3) already auto-installs into prefixes.
- `src/backend/storeManagers/steam/bridge/drm/runnerClone.ts` and `steamclientLayerMode.ts`:
  the DRM-mode CrossOver version allowlist and clone pattern (D-15).
- `src/backend/launcher.ts` `prepareWineLaunch()` (L807): the launch path where the engine
  choice and timeout plug in.

### Established Patterns
- Spawning child processes must use `createFakeHomeProfile()` (gamelib-conventions). Note:
  CrossOver reads the licence from the real home, so trial-state tests need spike 060's
  `sandbox-exec` licence denial, not a fake HOME alone.
- Sidecar handles must be `unref()`ed, and boot work must be bounded (gamelib-conventions).
  The timeout and `--demo-status` timers fall under this rule.
- Bridge "verified" is strict (HELLO plus a clean game Steam-init log). Fallback runs are
  best-effort and not census-verified.

### Integration Points
- The launch path is pre-flight (`--demo-status` per bottle) → engine choice (CrossOver,
  fallback, or override) → launch with timeout → toast/badge.
- Game page: trial notice (D-13), fallback badge (D-06), unsupported-engine badge (D-14).
- Game settings → Advanced: the engine override (D-14).
- Bridge-game install flow: fallback download and bottle creation when CrossOver is absent
  (D-01, D-05).

</code_context>

<specifics>
## Specific Ideas

- Toast wording example: "CrossOver trial expired — using built-in engine".
- Badge labels: "Built-in engine (best-effort)" and "Unsupported engine".
- Override default label: "Automatic (CrossOver, then built-in)".
- The user's own reasoning for D-10: a timeout when CrossOver is installed and healthy is most
  likely a game compatibility issue, not an engine one.

</specifics>

<deferred>
## Deferred Ideas

None. The discussion stayed within the phase scope.

### Reviewed Todos (not folded)
`todo.match-phase` returned 6 matches on keywords only: Windows unsigned releases, blank
packaged app, Phase 21 native-install UAT, protonfixes import tool, native source-port route,
and the Raft save failure in a bottle. None is about the engine fallback, so none was folded.

</deferred>

---

*Phase: 59-steam-engine-fallback-when-crossover-is-unavailable*
*Context gathered: 2026-10-31*
