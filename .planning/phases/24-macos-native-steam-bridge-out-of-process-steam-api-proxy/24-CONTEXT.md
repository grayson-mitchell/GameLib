# Phase 24: macOS native Steam bridge (out-of-process steam_api proxy) - Context

**Gathered:** 2026-07-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship the out-of-process `steam_api` bridge wired into GameLib's real macOS launch path: a bottle-side PE32 `steam_api.dll` shim marshals Steamworks calls over localhost TCP to a native arm64 helper that loads the real `libsteam_api.dylib` and proxies the one signed-in native Mac Steam. Allowlisted Windows-only Steam games run and play single-player against that single client (one login), replacing the per-bottle Windows Steam client for those titles; the Phase 17/22 bottled-Steam path remains the fallback for everything else.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**7 requirements are locked.** See `24-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `24-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- The C++ vtable + flat-export `steam_api.dll` shim generator (pinned SDK), including `__thiscall`, `ret N`, and sret handling.
- The native arm64 host helper loading `libsteam_api.dylib`, init-once, persistent loopback channel.
- Per-bottle automatic shim generation/placement (exact per-game export set via objdump).
- Curated AppID allowlist deciding bridge-vs-fallback, and `games.ts` routing to the bridge for allowlisted titles.
- Bundling the helper in the packaged `.app`; validation on the developer's own Apple-Silicon Mac.
- Acceptance validation: Avernum 4 + Hoard launch and play single-player through GameLib via the bridge.
- Preserving the existing Phase 17/22 bottled-Steam path as fallback + a clear failure surface for bridge errors.

**Out of scope (from SPEC.md):**
- Deep in-process `lsteamclient` / winelib thunk (blocked on macOS; Valve/CodeWeavers-scale).
- CEG / Denuvo / DRM-wrapped title enforcement (bridge is a compat layer, not a DRM gate).
- P2P multiplayer **join** (known-hard gap; single-player only this phase).
- **Automatic** per-game eligibility detection (curated allowlist this phase).
- Broad Apple-Silicon portability matrix M1/M2/M3/M4 (dev Mac only this phase).
- Wholesale removal/replacement of Phase 22 (it stays as fallback).

</spec_lock>

<decisions>
## Implementation Decisions

### Allowlist source & updates
- **D-01:** The bridge-eligibility allowlist ships as a **bundled JSON file** in the app (e.g. `src/backend/storeManagers/steam/bridge-allowlist.json` or a constants module), keyed by AppID. Chosen over a hardcoded constant (too rigid) and a remote/CI index (too much infra for an early 2-game list). Adding a game = edit the file + ship a release. The Phase 19 CI-index pattern remains the natural later evolution if the list grows — noted as a future upgrade path, NOT built now.
- **D-02:** Allowlist entries should carry at least the AppID and enough metadata to drive shim generation/validation (e.g. human-readable title; room for a per-game export-set note if needed). Exact schema is a planning detail.

### Helper process lifecycle
- **D-03:** ONE **shared, long-lived** native helper, started **lazily by GameLib's backend on the first bridge launch**, inits against the live Mac Steam, holds the inited interface pointers, and serves every bridge game over the persistent loopback channel until GameLib quits. Chosen over per-launch helpers to match the "one client, one login" promise and avoid repeated init cost.
- **D-04 (MUST-VALIDATE, see research flags):** A single init holds one AppID. Keep the shared-helper decision as the target; research must confirm how per-game AppID identity is satisfied under one shared helper (single generic AppID like `480` for identity-only vs. per-AppID re-init / one pipe per AppID / helper-per-AppID). This resolves *how* the decision is realized, not *whether* to use a shared helper.

### Bridge-failure behavior (R7)
- **D-05:** On bridge failure for an allowlisted game, surface an **explicit error dialog that offers to fall back to the bottled-Steam path** (the proven Phase 17/22 route) — no silent auto-fallback (a heavy Windows Steam client appearing unexplained is confusing) and not a dead-end error either. Reuse the existing dialog mechanism (`backend/dialog/dialog.ts`).
- **D-06:** Because bottle launches are fire-and-forget today (`runWineCommand({ wait: false })`), the bridge needs an actual **readiness/health signal** (e.g. helper up + channel reachable + init succeeded) to detect failure before/around launch, rather than assuming success. Detection mechanism is a planning detail; the requirement is that failures are observable, not silent.

### Generator output management
- **D-07:** Commit the **generator and its generated shim SOURCE** (`.c`/`.def` etc.) to the repo — deterministic, code-reviewable, pinned to a specific Steamworks SDK version — but **build the PE binary during packaging** (`zig cc -target x86-windows-gnu`). Do not commit built binaries. An SDK bump = regenerate + review the source diff.

### CrossOver constraint (folded todo)
- **D-08:** Bridge game bottles MUST use CrossOver's `cxbottle` lifecycle. GPTK / Wine-`toolkit` engines produce a broken Steam bottle (`.planning/todos/pending/steam-bottle-gptk-engine-produces-broken-bottle.md`). This mirrors the Phase 17/22 constraint and applies to any bottle the bridge provisions or reuses.

### Claude's Discretion
- Wire/marshaling protocol between shim and helper (framing, call identification by interface+method index, error propagation).
- How the per-game export set is derived and fed to the generator (objdump parsing).
- Bottle provisioning changes for a bridge-eligible game (lightweight prefix vs. reusing existing bottle machinery).
- Exact routing insertion point around `isBottleEligible()` and how the allowlist check composes with it.
- electron-builder / packaging wiring for the bundled arm64 helper + build-time shim generation.

### Folded Todos
- **Productionize the macOS native Steam bridge** (`.planning/todos/pending/2026-07-18-productionize-macos-native-steam-bridge-out-of-process-steam.md`) — the canonical productionization work list (vtable generator, API/callback breadth, persistent channel, packaging/portability). This todo IS this phase's work; its remaining-work enumeration should seed the plan's task breakdown. Its P2P-join item is explicitly deferred per SPEC out-of-scope.
- **Steam bottle GPTK engine produces a broken bottle** (`.planning/todos/pending/steam-bottle-gptk-engine-produces-broken-bottle.md`) — folded as the D-08 CrossOver-only constraint above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase spec (locked)
- `.planning/phases/24-macos-native-steam-bridge-out-of-process-steam-api-proxy/24-SPEC.md` — Locked requirements, boundaries, acceptance criteria. MUST read before planning.

### Bridge blueprint & spike evidence (authoritative "how")
- `.claude/skills/spike-findings-gamelib/references/macos-steam-bridge.md` — The build blueprint: out-of-process architecture, requirements, "How to Build It", "What to Avoid", constraints. Treat its non-negotiables as locked (loopback-only, AppID-before-init, export-every-imported-symbol, `__thiscall` vtables, sret handling, SDK version pinning, `zig cc` toolchain).
- `.planning/seeds/macos-steam-native-bridge-lsteamclient.md` — Why the deep `lsteamclient` tier is out of scope; the shallow-tier reframe.
- `.planning/todos/pending/2026-07-18-productionize-macos-native-steam-bridge-out-of-process-steam.md` — Folded productionization work list.
- `.claude/skills/spike-findings-gamelib/sources/005b-bottle-to-host-tcp/bridge_server.c` — Reference host helper (connect-per-call; production needs persistent channel per D-03).
- `.claude/skills/spike-findings-gamelib/sources/005c-min-steam_api-shim/` — Reference PE32 shim + `steam_api.def` (flat path proof).
- `.claude/skills/spike-findings-gamelib/sources/006-cpp-vtable-abi/` — Proven MSVC `__thiscall` vtable mechanism (the unmodified-game path).
- `.claude/skills/spike-findings-gamelib/sources/007-real-game-avernum/`, `.../008-gating-game-hoard/` — The two acceptance-set titles' spike evidence + import counts (Avernum 4 = 2 imports, Hoard = 7).
- Prior art: `samdotson61/L4D2-launcher` (working shallow bridge, `gen_vtables.py` territory), `natbro/kaon` (deep lsteamclient, stuck).

### Constraint todos
- `.planning/todos/pending/steam-bottle-gptk-engine-produces-broken-bottle.md` — CrossOver-only bottle constraint (D-08).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/backend/storeManagers/steam/bottle.ts` — Bottle path/guard helpers (`getBottleDir`, `sanitizeBottleName`, `resolveBottleSteamRoot`), provisioning (`provisionBottle`), and verb dispatch (`dispatchToBottledSteam`, `tellBottledSteamTo{Install,Launch,Uninstall}`). The bridge's per-bottle shim placement and CrossOver-only provisioning should reuse these primitives; the fallback path (D-05) calls straight into `dispatchToBottledSteam`.
- `src/backend/dialog/dialog.ts` (`showDialogBoxModalAuto`, `notify`) — For the D-05 explicit-error + fallback dialog.
- `src/backend/launcher.ts` (`runWineCommand`) — How PEs are run in a bottle (`CX_BOTTLE`, `wait: false`); the bridge launches the game PE similarly but with the generated shim present in the bottle.

### Established Patterns
- **Routing gate:** `SteamGame.isBottleEligible()` (`src/backend/storeManagers/steam/games.ts:925`) is the single source of truth for "route to bottled Steam vs native steam://" on macOS. The allowlist decision (D-01) composes here: among bottle-eligible games, allowlisted AppID → bridge, else → today's bottled path. `isNative()`/`install()`/`launch()`/`uninstall()` all consult it.
- **Offline CI index (Phase 19):** the CrossOver medal index is the precedent for a future remote allowlist (D-01 upgrade path) — not built this phase.
- **Fire-and-forget launches + ACF poller:** current bottled path never optimistically flips state; a bottle-scoped poller owns status. The bridge needs its own readiness signal (D-06) since there's no ACF adoption to observe.

### Integration Points
- `SteamGame.launch()` / `install()` / `uninstall()` (`src/backend/storeManagers/steam/games.ts`, ~L560/L912/L1000) — where bridge-vs-bottled routing branches after `ensurePlatformsCaptured()` + `isBottleEligible()`.
- GameLib backend startup / app lifecycle — where the shared long-lived helper (D-03) is spawned lazily and torn down.
- electron-builder packaging config — where the arm64 helper binary is bundled and the build-time shim generation (D-07) hooks in.

</code_context>

<specifics>
## Specific Ideas

- Acceptance set is fixed to the two spike-proven titles: **Avernum 4** (2 steam_api imports) and **Hoard** (7 imports). "Done" = both launch from GameLib via the bridge to playable single-player, real SteamID64 + persona served through the bridge, and **no Windows Steam client in the bottle**.
- The vtable generator (Requirement 1) is the highest-risk, highest-uncertainty piece — the user's own todo called it "the right next frontier spike before committing a phase." Planning should sequence it first / treat it as the primary risk.

</specifics>

<deferred>
## Deferred Ideas

- **Remote/CI-updatable allowlist** (Phase 19 index pattern) — add supported games without an app release. Deferred; bundled JSON (D-01) ships now.
- **Automatic per-game eligibility detection** (objdump import-coverage + DRM/CEG check) — replace the curated allowlist with runtime detection. A later phase.
- **P2P multiplayer join** — the known-hard gap (`InitRelayNetworkAccess()` + `AcceptP2PSessionWithUser`). Out of scope per SPEC.
- **Broad Apple-Silicon portability matrix** (M1/M2/M3/M4) — validated on dev Mac only this phase.
- **Retiring Phase 22** (game families / multi-bottle) once the bridge proves itself — future decision; Phase 22 stays as fallback.

### Reviewed Todos (not folded)
- **Runtime getProductInfo appinfo dump to lock the osarch parser** (`.planning/todos/pending/steam-getproductinfo-appinfo-dump.md`) — pre-install arch-detection concern (Phase 18/21 era), unrelated to the bridge's launch path.
- **Startup download-resume silently auto-opens Steam-in-CrossOver for bottle games** (`.planning/todos/pending/steam-startup-download-resume-autoopens-crossover.md`) — a bottled-Steam startup behavior (Phase 21/23), tangential to the bridge.

</deferred>

---

*Phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy*
*Context gathered: 2026-07-18*
