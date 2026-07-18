# Phase 24: macOS native Steam bridge (out-of-process steam_api proxy) — Specification

**Created:** 2026-07-18
**Ambiguity score:** 0.16 (gate: ≤ 0.20)
**Requirements:** 7 locked

## Goal

Ship the out-of-process `steam_api` bridge wired into GameLib's real macOS launch path, so that allowlisted Windows-only Steam games run and play single-player against the ONE signed-in native macOS Steam client (one login) — replacing the per-bottle Windows Steam client for those games, with the Phase 17/22 bottled-Steam path retained as fallback for everything else.

## Background

Today GameLib runs Windows-only Steam games on macOS by provisioning a **full Windows Steam client inside each CrossOver bottle** (`src/backend/storeManagers/steam/bottle.ts` → `provisionBottle()` downloads and runs `SteamSetup.exe`; `dispatchToBottledSteam()` drives install/launch/uninstall via `steam://` + `-applaunch`). Each bottle therefore requires its own separate Steam login — the exact cost Phase 22 (Steam Game Families) accepts.

The bridge is a proven alternative: a drop-in PE32 `steam_api.dll` shim in the bottle marshals Steamworks calls over localhost TCP to a native arm64 helper that loads the real `libsteam_api.dylib` and proxies the running, signed-in Mac Steam. Feasibility is **proven end-to-end** across spikes 004–008, including a real commercial game (Avernum 4, spike 007), the MSVC `__thiscall` C++ vtable ABI mechanism (spike 006), and confirmation that the bridge is a **compatibility layer, not a DRM gate** (spike 008 — `steam_api.dll` returns are advisory; CEG/Denuvo enforcement lives below the flat API and is out of scope).

**Nothing exists in `src/` yet** — the spikes live in `.claude/skills/spike-findings-gamelib/sources/`. This phase productionizes that proof. The authoritative build blueprint is `Skill("spike-findings-gamelib")` → `references/macos-steam-bridge.md`; all "how" decisions (toolchain, marshaling, SDK pinning) are treated as locked by that blueprint and refined in discuss-phase.

## Requirements

1. **C++ vtable + flat shim generator**: A generator produces the bottle-side `steam_api.dll` shim from a pinned Steamworks SDK version, covering both the flat `SteamAPI_*` exports and the C++ interface vtables (the path unmodified games actually use).
   - Current: No generator exists. Spike 006 proved the MSVC `__thiscall` vtable mechanism (vptr→slots, `this` in ECX, 8-byte return in EDX:EAX) for a single hand-written method; spike 005c proved the flat path. No tool generates the full interface set.
   - Target: A generator emits vtable layouts and marshaling stubs for the pinned SDK's interfaces, explicitly `__thiscall`, with correct `ret N` stack cleanup and hidden-return-pointer (sret) handling for struct returns >8 bytes.
   - Acceptance: Generator output for the pinned SDK matches the expected vtable slot order/offsets for `ISteamUser` and `ISteamFriends`; unit-level checks confirm `__thiscall`, `ret N`, and sret marshaling; a shim built from generator output loads in the bottle and round-trips the real SteamID64 via a C++ virtual call.

2. **Native host helper with persistent channel**: A native arm64 helper loads the real `libsteam_api.dylib`, initializes once against the running Mac Steam, and serves marshaled requests over a persistent loopback channel.
   - Current: Spike 005b's helper connects-per-call (fine for a spike, not production) and lives in `sources/`.
   - Target: `src/`-resident helper that `dlopen`s `libsteam_api.dylib`, calls `SteamAPI_InitFlat` once with the game's real AppID, holds the inited interface pointers, and serves requests over a persistent `127.0.0.1` channel (loopback-only bind, never a routable interface).
   - Acceptance: Helper starts, binds loopback-only, initializes once, and answers ≥2 sequential requests from a bottle client over a single persistent connection without re-initializing; a non-loopback bind attempt is rejected/absent.

3. **Per-bottle shim auto-generation**: The correct `steam_api.dll` shim is produced and placed into a game's bottle automatically as part of bottle setup — no manual staging.
   - Current: Shims are hand-built and hand-copied in the spikes.
   - Target: Bottle setup for a bridge-eligible game generates/installs the shim exporting exactly the symbols that game imports (per its objdump import set) and supplies the game's real AppID before init.
   - Acceptance: For each acceptance-set game, launching it through GameLib results in a bottle containing the generated `steam_api.dll` exporting every symbol the game imports, with no manual copy step performed.

4. **Allowlist-based routing**: GameLib decides bridge-vs-fallback per title using a curated allowlist of known-good AppIDs; the bridge is the path for allowlisted titles, and the existing bottled-Steam path is the fallback for everything else.
   - Current: `games.ts` routes all macOS Windows-Steam operations to `dispatchToBottledSteam()` (full Windows Steam per bottle).
   - Target: A curated AppID allowlist; allowlisted titles route through the bridge, non-allowlisted titles route through the existing Phase 17/22 bottled-Steam path unchanged.
   - Acceptance: An allowlisted AppID launches via the bridge (no bottled Windows Steam client present in its bottle); a non-allowlisted AppID launches via the existing bottled-Steam path with behavior unchanged from Phase 17.

5. **Bundled, in-app packaging (dev-HW validated)**: The native helper ships inside the packaged GameLib app and is invoked from there — not a developer-only side artifact.
   - Current: The helper is a loose binary built in the spike environment.
   - Target: The helper binary is bundled in the packaged `.app` and located/launched at runtime from the bundle; the bridge functions from a packaged build on the developer's own Apple-Silicon Mac.
   - Acceptance: A packaged GameLib build (not a dev `yarn` run) launches an acceptance-set game through the bridge on the developer's Mac using the bundled helper, with no externally staged helper binary.

6. **Single-player launch parity for the acceptance set**: The two spike-proven titles launch and reach playable single-player state through the bridge with real Steam identity satisfied.
   - Current: Proven only in the spike harness (`sources/007-real-game-avernum/`, `008-gating-game-hoard/`), not through GameLib.
   - Target: Avernum 4 and Hoard launch **through GameLib** via the bridge, `SteamAPI_Init` succeeds with the real signed-in SteamID64, persona name is correct, and each reaches playable single-player — with **no Windows Steam client installed in the bottle**.
   - Acceptance: Both Avernum 4 and Hoard, launched from GameLib on macOS, reach main menu / playable single-player via the bridge; the game's bottle contains no `steam.exe`/Windows Steam client; logs confirm the real SteamID64 and correct persona were served through the bridge.

7. **Clean fallback + coexistence with Phase 22**: Introducing the bridge does not regress the existing bottled-Steam path, and a bridge failure for an allowlisted title does not silently strand the user.
   - Current: Phase 17/22 bottled-Steam is the only macOS Windows-Steam path.
   - Target: The bottled-Steam path remains fully functional for non-allowlisted titles; if the bridge path fails for an allowlisted title, GameLib surfaces the failure clearly (and/or falls back) rather than launching into a broken/no-Steam state.
   - Acceptance: A non-allowlisted title's install/launch/uninstall behaves identically to Phase 17 (regression check); a forced bridge failure for an allowlisted title produces a clear surfaced error (not a silent hang or a game launched with no Steam identity).

## Boundaries

**In scope:**
- The C++ vtable + flat-export `steam_api.dll` shim generator (pinned SDK), including `__thiscall`, `ret N`, and sret handling.
- The native arm64 host helper loading `libsteam_api.dylib`, init-once, persistent loopback channel.
- Per-bottle automatic shim generation/placement (exact per-game export set via objdump).
- Curated AppID allowlist deciding bridge-vs-fallback, and `games.ts` routing to the bridge for allowlisted titles.
- Bundling the helper in the packaged `.app`; validation on the developer's own Apple-Silicon Mac.
- Acceptance validation: Avernum 4 + Hoard launch and play single-player through GameLib via the bridge.
- Preserving the existing Phase 17/22 bottled-Steam path as fallback + a clear failure surface for bridge errors.

**Out of scope:**
- Deep in-process `lsteamclient` / winelib thunk — blocked on macOS (no build toolchain; Rosetta/protobuf interconnect) and Valve/CodeWeavers-scale (spike 004a).
- CEG / Denuvo / DRM-wrapped title enforcement — the bridge is a compatibility layer, not a DRM gate; real enforcement lives below the flat API (spike 008). Such titles stay on the bottled-Steam fallback.
- P2P multiplayer **join** — the known-hard gap (`InitRelayNetworkAccess()` + proactive `AcceptP2PSessionWithUser`, only partially fixed upstream). This phase is single-player only.
- **Automatic** per-game eligibility detection — a curated allowlist is used this phase; import-coverage/DRM auto-detection is a later phase.
- Broad Apple-Silicon portability matrix (M1/M2/M3/M4) — validated only on the developer's own Mac this phase; the full matrix is a documented follow-up.
- Wholesale removal/replacement of Phase 22 (Steam Game Families) — Phase 22 remains the fallback; deciding to retire it is future work.

## Constraints

- **Out-of-process `steam_api` layer only.** PE32 i386 shim in the bottle → localhost TCP → native Mach-O helper → `libsteam_api.dylib`. Never the in-process `lsteamclient` thunk.
- **Proxy the running, signed-in native Mac Steam — never replicate auth.** The host helper requires the live Mac Steam client running; it hardcodes no credentials.
- **The helper/shim MUST supply the game's real AppID before init** — without it `SteamAPI_InitFlat` returns "No appID found" and every interface accessor is NULL.
- **A drop-in shim must export EVERY symbol the game imports** (enumerate per-game via `objdump --private-headers <exe> | grep steam_api`) or the game will not load.
- **64-bit IDs (SteamID64) are strings end to end** — never parsed through `@node-steam/vdf` (rounds past MAX_SAFE_INTEGER).
- **SDK interface versions are version-pinned** (e.g. `SteamUser_v023`, `SteamFriends_v018`); repack `pack(4)`→`pack(8)` for callbacks. Drift breaks the ABI.
- **Loopback-only bind** on the host bridge; never a routable interface.
- **Toolchain:** build PE shims with `zig cc -target x86-windows-gnu` (self-contained mingw sysroot); `brew install` only dry-runs in this environment. mingw/clang windows-gnu C++ uses the Itanium ABI, so generated stubs must be explicitly `__thiscall` to match MSVC-compiled games.
- **Tooling hygiene:** avoid `cxstart` (wedges the bottle's `wineserver`); use `bin/wine` and `wineserver -k` between runs.
- Must remain Electron + React + TypeScript at the app layer for Heroic upstream mergeability (native helper is a bundled binary, invoked from the backend).

## Acceptance Criteria

- [ ] Generator output matches the pinned SDK's `ISteamUser`/`ISteamFriends` vtable slot order and offsets; `__thiscall`, `ret N`, and sret (>8-byte struct return) are handled.
- [ ] A shim built from generator output loads in the bottle and round-trips the real SteamID64 via a C++ virtual call (not just the flat export).
- [ ] The native arm64 helper binds loopback-only, initializes once, and serves ≥2 sequential requests over a single persistent connection.
- [ ] Launching an allowlisted game via GameLib auto-generates and places a `steam_api.dll` exporting exactly that game's imported symbols in its bottle — no manual copy.
- [ ] An allowlisted AppID routes through the bridge with **no Windows Steam client in its bottle**; a non-allowlisted AppID routes through the existing bottled-Steam path unchanged.
- [ ] The helper runs from the packaged `.app` bundle (not a dev run) on the developer's Apple-Silicon Mac.
- [ ] Avernum 4 launches from GameLib via the bridge and reaches playable single-player with the real SteamID64 + correct persona served through the bridge.
- [ ] Hoard launches from GameLib via the bridge and reaches playable single-player with the real SteamID64 + correct persona served through the bridge.
- [ ] A non-allowlisted title's install/launch/uninstall is behaviorally identical to Phase 17 (no regression).
- [ ] A forced bridge failure for an allowlisted title surfaces a clear error (no silent hang, no game launched with no Steam identity).

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                        |
|--------------------|-------|------|--------|--------------------------------------------------------------|
| Goal Clarity       | 0.88  | 0.75 | ✓      | Deliverable = bridge wired into real launch path, 2 games    |
| Boundary Clarity   | 0.85  | 0.70 | ✓      | Explicit out-of-scope: lsteamclient, CEG, P2P, auto-detect, matrix |
| Constraint Clarity | 0.80  | 0.65 | ✓      | Toolchain/ABI/SDK-pin/loopback locked by blueprint           |
| Acceptance Criteria| 0.82  | 0.70 | ✓      | Named games + per-title pass/fail + no-bottled-Steam check   |
| **Ambiguity**      | 0.16  | ≤0.20| ✓      | Gate passed after 2 rounds                                   |

Status: ✓ = met minimum, ⚠ = below minimum (planner treats as assumption)

## Interview Log

| Round | Perspective          | Question summary                                   | Decision locked                                                                 |
|-------|----------------------|----------------------------------------------------|---------------------------------------------------------------------------------|
| 1     | Researcher/Simplifier| Where's the cut line for one phase?                | Generator + real-path integration; N games play single-player; bridge is primary where it works |
| 1     | Simplifier           | Acceptance bar shape?                              | Named real games, playable single-player, no bottled Steam client               |
| 1     | Boundary Keeper      | Relationship to Phase 22?                          | Bridge replaces for eligible titles; Phase 22 = fallback for CEG/P2P/unsupported |
| 2     | Boundary Keeper      | Packaging/portability boundary?                    | Helper bundled + shim auto-generated; validated on dev's own Mac; M1–M4 matrix deferred |
| 2     | Boundary Keeper      | Bridge-vs-fallback eligibility mechanism?          | Curated AppID allowlist this phase; auto-detection deferred                      |
| 2     | Boundary Keeper      | Concrete acceptance-game set?                      | Avernum 4 + Hoard (the two spike-proven titles)                                 |

---

*Phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy*
*Spec created: 2026-07-18*
*Next step: /gsd-discuss-phase 24 — implementation decisions (generator internals, channel protocol, packaging mechanics, allowlist source)*
