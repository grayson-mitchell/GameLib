---
phase: 24
reviewers: [claude]
reviewed_at: 2026-07-18T10:41:43Z
plans_reviewed: [24-01-PLAN.md, 24-02-PLAN.md, 24-03-PLAN.md, 24-04-PLAN.md, 24-05-PLAN.md, 24-06-PLAN.md, 24-07-PLAN.md, 24-08-PLAN.md, 24-09-PLAN.md, 24-10-PLAN.md]
independence_note: >
  Intended external reviewers were unavailable at review time — gemini/codex/qwen/cursor/coderabbit
  not installed; opencode installed but had no working credentials (invalid ANTHROPIC_API_KEY in env
  + OpenCode Zen "Insufficient balance"). Per user direction, the review was run through a separate
  `claude -p` session as a same-model-family fallback. Treat this as a single-reviewer pass with
  weaker independence than a true cross-AI review; re-run with a non-Claude CLI when credentials allow.
---

# Cross-AI Plan Review — Phase 24: macOS Native Steam Bridge

## Claude Review

# Cross-AI Plan Review — Phase 24: macOS Native Steam Bridge

## 1. Summary

This is a strong, unusually well-researched plan set: 10 plans across 5 waves that decompose a genuinely hard native-ABI/cross-process capability into cleanly-analogized, mostly-testable units. Dependency ordering is largely clean, security hygiene (argv-form spawns, numeric guards, loopback-only, zod validation, idempotent placement) is consistent, and the mapping to R1–R7 is complete. The plans correctly identify the vtable generator as the top risk and sequence it first. However, several **load-bearing runtime mechanics on the critical launch path are under-specified and split across plans in ways that risk falling through the cracks** — game `.exe` resolution for direct launch, the "supply AppID before init" non-negotiable, the health-probe frame, and the fallback-bypass mechanic. Most consequentially, the highest-risk component (the generator) has a **very long feedback loop**: it is validated only by structural source-string assertions until a human hardware gate at the very end, with no intermediate compile-or-run check — and the acceptance games may not even exercise the vtable path the generator exists to produce.

## 2. Strengths

- **Excellent analog discipline.** Nearly every new file is mapped to a concrete in-repo precedent (`crossoverIndexSchema`, `ensureSteamClientReady`, `SteamBottleSetup.ts`, `downloadHelperBinaries.ts`, the `isSteamNativeInstallEnabled()` sub-branch composition). This maximizes mergeability and reviewability.
- **The bridge-bottle correction (24-04) is caught and elevated.** Recognizing that reusing `GameLibSteam` silently fails R6 ("no Windows Steam client in the bottle") — a spike-convenient shortcut that's a production trap — is exactly the kind of insight that prevents a late acceptance failure.
- **D-04 resolution is rigorous.** The single-generic-AppID (480) decision is derived from the spike's own `InitFlat(err)` source, not hand-waved, and its limitations (AppID-scoped calls answer for 480) are documented as a scoped follow-up.
- **Security posture is coherent.** Loopback-only enforced structurally + tested, argv-form everywhere, `MAX_FRAME_BYTES` bound on both TS and C sides, accepted residual risks explicitly recorded for secure-phase rather than silently built in.
- **Human-gated work is correctly isolated** (24-10 `autonomous:false`), mirroring the established 21-UAT/23-UAT precedent.
- **Wave parallelism is real** — Wave 1's four plans genuinely touch disjoint files.

## 3. Concerns

**HIGH**

- **IPC event type is introduced a wave too late (ordering / build break).** 24-06 (`helperProcess.ts`, Wave 2) fires `sendFrontendMessage('steamBridgeSetupRequired', …)` and runs `pnpm codecheck`, but the `steamBridgeSetupRequired` member of the `FrontendMessages` interface is added in **24-08 (Wave 3)**. If `sendFrontendMessage` is generically typed on the event key (as it is in upstream Heroic), 24-06 will fail its own codecheck. The IPC-type addition must move to 24-06 (or a Wave-1 shared task) so the type exists at first use.

- **Game `.exe` resolution for direct launch is unspecified but load-bearing.** 24-08's bridge `launch()` calls `runWineCommand({ commandParts: [<gameExePath>], … })`, but nothing resolves `<gameExePath>`/`<game install dir>`. The Phase 17 path never needed this — it delegated exe resolution to bottled Steam via `steam.exe -applaunch`. With no bottled Steam, GameLib must itself determine the Windows launch executable (almost certainly from appinfo `config.launch[]` filtered by `oslist=windows`), and no task extracts it. This is on the critical launch path for R6 and is currently a placeholder.

- **Fallback (24-09) can loop back into the bridge.** The fallback re-routes to "the existing non-bridge `install()`/`launch()` branch," but `isBridgeEligible()` (= bottle-eligible AND allowlisted) remains **true** for that appId, so the existing invocation will route straight back to the bridge. The plan explicitly forbids a bespoke fallback path yet never designs the *skip-bridge* mechanic (a per-invocation override or a session-scoped "bridge failed for this appId, don't retry" flag). As written, "fall back" has no way to actually bypass the bridge.

**MEDIUM**

- **"Supply the game's real AppID before init" has no concrete owner.** The SPEC lists this as a non-negotiable ("no `steam_appid.txt`/`SteamAppId` → `InitFlat` returns 'No appID found', every accessor NULL"). 24-02 *assumes* a `steam_appid.txt` (480) exists in the helper's cwd but doesn't create it; 24-06 spawns the helper without setting cwd or `SteamAppId` env; 24-07 doesn't bundle it. This critical mechanic falls between three plans. (Note Assumption A1: the `SteamAppId` env-var path is unconfirmed, so the cwd+file path may be the only reliable one — which makes owning the spawn cwd essential.)

- **R1's runtime ABI acceptance is uncovered.** SPEC R1 requires "a shim built from generator output loads in the bottle and round-trips the real SteamID64 **via a C++ virtual call**." The generator is only structurally tested (source-string assertions, no compile), and 24-10's human gates test *game playability* — but Avernum 4 imports only `Init`/`Shutdown` (2 symbols) and may never make a vtable `GetSteamID`/`GetPersonaName` call. So the generator's actual ABI correctness (`ret N`, `__thiscall`, sret, slot offsets) may never be runtime-validated anywhere. This is the phase's riskiest component with its longest feedback loop.

- **R6 "logs confirm real SteamID64 + persona served through the bridge" may be unsatisfiable for Avernum 4.** With a 2-import (Init/Shutdown) profile, the game likely never requests SteamID/persona, so nothing crosses the bridge to log. The acceptance evidence conflates "Init succeeded through the bridge" with "identity served" — those differ for a minimal-import game. The UAT wording (or the acceptance harness) needs to separate the two, or add a dedicated 006-style vtable round-trip harness gate.

- **Health-probe frame is undefined / inconsistent.** 24-06 describes readiness as "PING→PONG + WHOAMI" (the spike's *text* protocol), but 24-02's helper speaks the Pattern 3 *binary* frame keyed by interface ordinal + slot, and its ordinal map (`flat/user/friends`) defines no PING/health control frame. The probe needs a concrete framed handshake that distinguishes "process up" from "init succeeded against a live session"; right now the two plans don't agree on what's on the wire.

- **R3 realized as a single superset shim, not per-game tailoring.** 24-01 emits one committed `steam_api_shim.c`/`.def`; 24-05 uses `objdump` only to *validate coverage*, not to *drive generation*. This is a reasonable simplification (a DLL exporting extra symbols is harmless), and functionally sufficient for a curated 2-game allowlist — but it diverges from R3's literal "exporting exactly the symbols that game imports (per its objdump import set)" and leaves no path for an allowlisted game whose imports aren't in the superset (it warns/rejects with no remediation). Worth an explicit verifier acknowledgement rather than a silent divergence.

- **Helper teardown is created but never wired.** 24-06 adds `shutdownBridgeHelper()` but no plan calls it from the app-quit lifecycle (CONTEXT's own integration point). The long-lived helper can orphan on quit.

**LOW**

- **`installBridgeGame` semantics differ from the reused engine.** The depot-download engine (Phase 21/23) is built around a Steam client *adopting* the `appmanifest.acf`; the bridge bottle has no Steam to adopt anything, so the model is files-on-disk + direct launch. Reuse is fine (per-chunk sha1 makes the files self-sufficient), but writing an ACF into a Steam-less bottle is dead weight, and the adoption-vs-direct distinction is glossed.
- **Fixed port 54550** — no port-conflict/second-instance handling; predictable port slightly widens the accepted loopback risk. An ephemeral port + a bottle-readable handshake file would tighten both.
- **zig checksum is TOFU.** 24-07 verifies the tarball against a shasum fetched from the same `ziglang.org` index at build time; a hardcoded expected digest in-repo would be true pinning. Minor improvement over precedent regardless.
- **Manifest accuracy risk (D-09).** Hand-authoring a large `SteamUser023` slot inventory (correct param widths for every slot's `ret N`) without the headers is error-prone and only structurally checked — reinforces the need for a runtime ABI proof (see R1 concern).

## 4. Suggestions

- **Add an automated generator compile gate.** In 24-07 (or a small dedicated task), run `zig cc -target x86-windows-gnu` on the committed generated source and assert exit 0. This catches a large class of ABI/emit bugs cheaply, far earlier than the human gate, without CrossOver or live Steam.
- **Resurrect spike 006 as a dev-HW checkpoint in 24-10.** Add a fourth gate: run a 006-style harness using the *generated* shim against the *production* helper and confirm a vtable `GetSteamID()` returns the real SteamID64. This is the only thing that actually proves R1's runtime acceptance, and it's independent of whether the acceptance games call the vtable.
- **Move the `steamBridgeSetupRequired` IPC type to Wave 1** (or into 24-06) so every producer typechecks at its own wave.
- **Assign the AppID-before-init mechanic explicitly** — have 24-06 spawn the helper with a cwd containing `steam_appid.txt`=480 (and/or `SteamAppId` env if confirmed), and have 24-07 stage that file. Add a test asserting the spawn cwd/env carries 480.
- **Design the fallback-bypass explicitly.** Thread a `forceBottled`/`skipBridge` argument (or a per-appId "bridge-failed-this-session" set consulted by `isBridgeEligible()`) so 24-09's fallback re-routes without re-entering the bridge. This is a real code path, not a doc note.
- **Give 24-08 a task for launch-executable resolution** from appinfo `config.launch` (Windows-filtered), with a test on a fixture — don't leave `<gameExePath>` as a placeholder.
- **Define a control/health frame in `protocol.ts` (24-02)** that the helper answers pre-init, and have 24-06 use it; reconcile the "PING/WHOAMI" language with the binary protocol.
- **Tighten the R6 UAT wording** to separate "Init succeeded through the bridge" from "SteamID64/persona served," matching each game's actual import surface.
- **Wire `shutdownBridgeHelper()`** into the main-process `will-quit`/`before-quit` handler (assign to 24-06 or 24-08).

## 5. Risk Assessment

**Overall: MEDIUM-HIGH.**

Much of the risk is *inherent to the domain* — native C++ ABI marshaling, PE32/Mach-O interop across a Wine boundary, and irreducibly human-gated acceptance — and the plans handle that inherent risk about as well as a plan set can (spike-proven mechanism, first-sequenced generator, honest manual-only rows, strong analogs). The **elevated** portion comes from *fixable plan gaps*: a genuine wave-ordering build hazard (IPC type), three under-specified but load-bearing critical-path mechanics (exe resolution, AppID-before-init, fallback-bypass), and — most importantly — a validation strategy that leaves the acknowledged highest-risk component (the vtable generator) with no intermediate compile-or-run gate and a runtime acceptance (R1 vtable round-trip) that no concrete task actually exercises. A FAIL at the final human gate routes to `--gaps`, i.e., expensive late rework precisely where the design admits the most uncertainty.

None of these are architecture-invalidating; all are addressable before execution. Landing the compile gate + a 006-style round-trip checkpoint, closing the four critical-path mechanic gaps, and fixing the IPC-type ordering would bring this down to a solid **MEDIUM** (domain-inherent) risk. As written, I'd not start Wave 2 without at least resolving the IPC-type ordering and assigning owners for exe-resolution, AppID-before-init, and fallback-bypass.

---

## Consensus Summary

Only one reviewer completed this pass (`claude`, same-family fallback — see `independence_note`), so there is no cross-reviewer consensus to triangulate. The findings below are that single reviewer's, surfaced here for planning intake. Re-run with an independent non-Claude CLI to confirm or challenge them.

### Highest-priority concerns (act before Wave 2)

1. **IPC-type ordering build hazard** — `steamBridgeSetupRequired` is used in 24-06 (Wave 2) but the `FrontendMessages` type is added in 24-08 (Wave 3); 24-06's own `codecheck` will fail. Move the type addition to 24-06 or a Wave-1 shared task.
2. **Three under-specified critical-path mechanics with no owner:**
   - Game `.exe` resolution for direct launch (24-08 leaves `<gameExePath>` a placeholder; needs appinfo `config.launch[]` Windows-filtered extraction + test).
   - "Supply real AppID before init" (`steam_appid.txt`=480 / `SteamAppId`) falls between 24-02, 24-06, 24-07 — assign the spawn-cwd/staging owner explicitly.
   - Fallback-bypass (24-09) has no mechanic to actually skip the bridge; `isBridgeEligible()` stays true and re-routes back in.
3. **Generator validation has the longest feedback loop and no runtime ABI proof** — only structural source-string assertions until the final human gate, and the acceptance game (Avernum 4, 2 imports) may never exercise the vtable path. Add (a) a `zig cc` compile gate in 24-07 and (b) a 006-style vtable round-trip checkpoint in 24-10.

### Secondary items

- Health-probe frame disagreement between 24-02 (binary) and 24-06 ("PING/WHOAMI" text) — define one framed handshake in `protocol.ts`.
- `shutdownBridgeHelper()` created (24-06) but never wired into app-quit lifecycle.
- R6 UAT wording conflates "Init succeeded through bridge" with "identity served" — separate them per game's import surface.
- Acknowledge the R3 superset-shim simplification explicitly (vs literal per-game import tailoring).
- LOW: dead-weight ACF in Steam-less bottle, fixed port 54550, zig-tarball TOFU checksum, hand-authored `SteamUser023` slot-width risk.

### Overall risk (single reviewer): MEDIUM-HIGH

Domain-inherent risk is handled well; the elevated portion is fixable plan gaps. Landing the compile gate + round-trip checkpoint, closing the four critical-path mechanic gaps, and fixing the IPC-type ordering would bring it to a solid MEDIUM.
