# Phase 24: macOS native Steam bridge (out-of-process steam_api proxy) - Research

**Researched:** 2026-07-18
**Domain:** Native ABI bridging (C++ vtable ABI, PE32/Mach-O interop, Wine/CrossOver process bridging), Electron native-binary packaging
**Confidence:** MEDIUM-HIGH (mechanism is spike-VALIDATED end-to-end; productionization shape is evidence-based but several pieces — vtable generator internals, SDK header provenance, bridge-bottle lifecycle — are new build, not yet exercised in `src/`)

## Summary

This phase does not need to re-prove feasibility — spikes 004–008 already validated the entire
mechanism live, including a real commercial game (Avernum 4) and a gating title (Hoard). What
remains is turning five one-off spike programs into `src/`-resident, generator-driven, packaged
production code. The single highest-leverage finding from this research is the resolution of
**D-04** (MUST-VALIDATE): `SteamAPI_InitFlat` takes **no AppID parameter** — every spike's own
`bridge_server.c` calls it exactly once at process startup with only an error buffer — so a
D-03 shared, long-lived, init-once helper can only ever carry **one** AppID identity for its
whole life. The only option consistent with both D-03 (shared helper) and R2's own acceptance
criterion ("initializes once ... without re-initializing") is a single generic identity-only
AppID (`480`, Spacewar), exactly as the blueprint already states. This is not a new tradeoff to
weigh — it is a structural consequence of the Steamworks flat API's own init contract, confirmed
directly from the spike's own C source.

The second major finding reframes the bottle story: the spikes proved the shim mechanism by
running **inside the existing `GameLibSteam` bottle**, which per Phase 17 already contains a
full bottled Windows Steam client. R6's acceptance bar ("no Windows Steam client in the bottle")
means production **cannot** reuse that bottle as-is — it needs a distinct, lighter bottle (or a
new provisioning path on the same bottle name) that skips the `SteamSetup.exe` step entirely.
This has a direct, evidenced recommendation below (a new dedicated bridge bottle, shared across
bridge games, created via the same `cxbottle --create win10_64` primitive `bottle.ts` already
uses) and a load-bearing implication for `launch()`: bridge games are launched by running their
own `.exe` directly via `runWineCommand`, **not** by dispatching `steam.exe -applaunch` (there is
no bottled Steam client to dispatch to) — a different verb shape than every existing
`dispatchToBottledSteam` call.

Third, the C++ vtable generator (R1, the acknowledged highest-risk piece) has real, checkable
prior art: L4D2-launcher's `gen_vtables.py` parses pinned Steamworks SDK headers to emit
ABI-correct `__thiscall`/`ret N` stubs. This research independently verified the SPEC-pinned
interface versions (`SteamUser023`, `SteamFriends018`) against the current
`rlabrecque/SteamworksSDK` GitHub mirror and confirmed the vtable slot order for `ISteamUser`
(`GetHSteamUser`=0, `BLoggedOn`=1, `GetSteamID`=2) matches spike 006's independently hand-built,
live-validated vtable exactly — two independent sources agreeing raises confidence on the
mechanism. What is **not** resolved by this research, and needs an explicit human/legal call
before Wave 1: whether Valve's SDK header text may be vendored into a **public** fork repo
verbatim, or must be reduced to a GameLib-authored method/slot inventory instead (flagged as
Open Question 1).

**Primary recommendation:** Sequence Wave 1 around the vtable generator (R1) with a
GameLib-authored SDK interface manifest (not vendored Valve headers) as its input; build the
persistent-channel helper (R2) next using the exact binary framing proposed below; wire routing
(R4) as a pure, fully-unit-testable composition on top of the already-existing
`isBottleEligible()` gate; and treat the "no Windows Steam client in the bottle" requirement (R6)
as forcing a new, lighter bridge-bottle provisioning path rather than reuse of `provisionBottle()`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** The bridge-eligibility allowlist ships as a **bundled JSON file** in the app (e.g.
  `src/backend/storeManagers/steam/bridge-allowlist.json` or a constants module), keyed by
  AppID. Chosen over a hardcoded constant (too rigid) and a remote/CI index (too much infra for
  an early 2-game list). Adding a game = edit the file + ship a release. The Phase 19 CI-index
  pattern remains the natural later evolution if the list grows — noted as a future upgrade
  path, NOT built now.
- **D-02:** Allowlist entries should carry at least the AppID and enough metadata to drive shim
  generation/validation (e.g. human-readable title; room for a per-game export-set note if
  needed). Exact schema is a planning detail.
- **D-03:** ONE **shared, long-lived** native helper, started **lazily by GameLib's backend on
  the first bridge launch**, inits against the live Mac Steam, holds the inited interface
  pointers, and serves every bridge game over the persistent loopback channel until GameLib
  quits. Chosen over per-launch helpers to match the "one client, one login" promise and avoid
  repeated init cost.
- **D-04 (MUST-VALIDATE, see research flags):** A single init holds one AppID. Keep the
  shared-helper decision as the target; research must confirm how per-game AppID identity is
  satisfied under one shared helper (single generic AppID like `480` for identity-only vs.
  per-AppID re-init / one pipe per AppID / helper-per-AppID). This resolves *how* the decision
  is realized, not *whether* to use a shared helper.
- **D-05:** On bridge failure for an allowlisted game, surface an **explicit error dialog that
  offers to fall back to the bottled-Steam path** (the proven Phase 17/22 route) — no silent
  auto-fallback (a heavy Windows Steam client appearing unexplained is confusing) and not a
  dead-end error either. Reuse the existing dialog mechanism (`backend/dialog/dialog.ts`).
- **D-06:** Because bottle launches are fire-and-forget today (`runWineCommand({ wait: false })`),
  the bridge needs an actual **readiness/health signal** (e.g. helper up + channel reachable +
  init succeeded) to detect failure before/around launch, rather than assuming success. Detection
  mechanism is a planning detail; the requirement is that failures are observable, not silent.
- **D-07:** Commit the **generator and its generated shim SOURCE** (`.c`/`.def` etc.) to the
  repo — deterministic, code-reviewable, pinned to a specific Steamworks SDK version — but
  **build the PE binary during packaging** (`zig cc -target x86-windows-gnu`). Do not commit
  built binaries. An SDK bump = regenerate + review the source diff.
- **D-08:** Bridge game bottles MUST use CrossOver's `cxbottle` lifecycle. GPTK / Wine-`toolkit`
  engines produce a broken Steam bottle
  (`.planning/todos/pending/steam-bottle-gptk-engine-produces-broken-bottle.md`). This mirrors
  the Phase 17/22 constraint and applies to any bottle the bridge provisions or reuses.

### Claude's Discretion

- Wire/marshaling protocol between shim and helper (framing, call identification by
  interface+method index, error propagation).
- How the per-game export set is derived and fed to the generator (objdump parsing).
- Bottle provisioning changes for a bridge-eligible game (lightweight prefix vs. reusing
  existing bottle machinery).
- Exact routing insertion point around `isBottleEligible()` and how the allowlist check
  composes with it.
- electron-builder / packaging wiring for the bundled arm64 helper + build-time shim generation.

### Deferred Ideas (OUT OF SCOPE)

- **Remote/CI-updatable allowlist** (Phase 19 index pattern) — add supported games without an
  app release. Deferred; bundled JSON (D-01) ships now.
- **Automatic per-game eligibility detection** (objdump import-coverage + DRM/CEG check) —
  replace the curated allowlist with runtime detection. A later phase.
- **P2P multiplayer join** — the known-hard gap (`InitRelayNetworkAccess()` +
  `AcceptP2PSessionWithUser`). Out of scope per SPEC.
- **Broad Apple-Silicon portability matrix** (M1/M2/M3/M4) — validated on dev Mac only this
  phase.
- **Retiring Phase 22** (game families / multi-bottle) once the bridge proves itself — future
  decision; Phase 22 stays as fallback.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| R1 | C++ vtable + flat shim generator, pinned SDK, `__thiscall`/`ret N`/sret handling | Pattern 2 (generator shape, confirmed slot order/versions), Pitfall 2 (`ret N` on stubs), Open Question 1 (SDK header provenance), Validation Architecture R1 rows |
| R2 | Native host helper, init-once, persistent loopback channel | Pattern 1 (D-04 resolution — why init-once forces a single generic AppID), Pattern 3 (wire protocol design), Validation Architecture R2 rows |
| R3 | Per-bottle automatic shim generation/placement, exact per-game export set | Pattern 4 (`installBridgeGame()` reuse of the Phase 21/23 depot-download engine + post-install shim placement hook), Don't Hand-Roll (objdump), Validation Architecture R3 rows |
| R4 | Allowlist-based routing (bridge vs. fallback) | Pattern 4 (`isBridgeEligible()` composition, exact `games.ts` insertion points with current line numbers), Standard Stack (zod validation), Validation Architecture R4 rows |
| R5 | Bundled, in-app packaging (dev-HW validated) | Pattern 5 (reuse of the existing `publicDir`/`build/bin/${arch}/${platform}` convention, `meta/` script additions), Environment Availability (zig/clang/objdump) |
| R6 | Single-player launch parity for Avernum 4 + Hoard | Pattern 1 (why identity-only AppID is sufficient for this specific acceptance set), Pitfall 1 (bridge bottle must not be `GameLibSteam`), manual-only Validation Architecture rows |
| R7 | Clean fallback + coexistence with Phase 22 | Pattern 4 (D-05/D-06 readiness seam + dialog wiring, `ensureBridgeHelperReady()`), Pitfall 4 (fallback-mechanics open question), Validation Architecture R7 rows |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech stack must remain Electron + React + TypeScript** (Heroic upstream mergeability). The
  native arm64 helper and generated PE shims are bundled/generated **binaries invoked from the
  backend**, not a change to the app's own language/framework stack — consistent with this
  constraint, same posture as existing bundled binaries (`legendary`, `gogdl`, `nile`, `comet`).
- **Cross-platform target (Linux/macOS/Windows)** — this phase's capability is inherently
  macOS-only (the bridge proxies a native macOS Steam client). No conflict: routing must remain
  gated on `isMac` exactly like the existing `isBottleEligible()` check, so Linux/Windows
  behavior is provably unaffected.
- **Steamworks-SDK-based native bindings are explicitly rejected project-wide**
  (`steamworks.js`, `greenworks` — both require a Valve-assigned AppId tied to a published Steam
  app, which GameLib is not). This is a pre-existing, locked project decision (Technology Stack
  doc, "Alternatives Rejected"). It does not conflict with this phase — the out-of-process
  `steam_api.dll` shim + native helper approach is architecturally distinct from embedding the
  real Steamworks SDK/`steamworks.init(AppId)` and was independently proven via spikes, not
  chosen as a workaround for the rejected approach.
- **GSD Workflow Enforcement** — implementation work for this phase must proceed through
  `/gsd:plan-phase`/`/gsd:execute-phase`, not direct ad hoc edits. Process constraint for the
  planner/executor, not a technical one.
- **graphify-out/graph.json orientation rule** — any future agent (planner, executor, code
  reviewer) touching this phase's code must run `graphify query`/`explain`/`path` before reading
  raw source files. This research followed that rule throughout.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Vtable/flat shim generation (R1) | Build tooling (Node/TS `meta/`-style script) | — | Pure source-generation, runs at dev/CI time, output committed per D-07 |
| PE32 shim compilation | Packaging (electron-builder pre-step, `zig cc`) | — | Native cross-compile, must happen at packaging time, not runtime |
| Native host helper (R2) | Backend (Electron main, spawned native subprocess) | OS (loopback socket) | Long-lived child process owned by Electron main, not a renderer concern |
| Wire protocol (shim <-> helper) | Backend / native (C code on both ends) | — | Entirely below the Electron/React boundary; TypeScript never touches the wire format directly |
| Per-bottle shim placement (R3) | Backend (`storeManagers/steam/`) | Filesystem (bottle `drive_c`) | Extends the existing bottle-provisioning backend code, not a new tier |
| Allowlist + routing (R4) | Backend (`games.ts`) | Bundled static asset (JSON) | Same tier as the existing `isBottleEligible()` gate it composes with |
| Packaging (R5) | Build tooling (electron-builder + `meta/` scripts) | — | Follows the existing `build/bin/${arch}/${platform}/*` convention |
| Failure surfacing (R7/D-05/D-06) | Backend (readiness seam) -> Frontend (dialog) | IPC (`sendFrontendMessage`) | Mirrors the existing `steamBottleSetupRequired`/`steamClientSetupRequired` seam pattern exactly |

## Standard Stack

No new npm/pip/cargo runtime dependencies are required for this phase. The bridge is native C
code (PE32 shim + Mach-O helper) built by a system/downloaded toolchain, not an npm package.

### Core (already in the project — reused, not newly installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | (existing, see package.json) | Validate the bundled allowlist JSON shape | Already the project's schema-validation library for exactly this kind of bundled/static data (`crossoverIndexSchema` precedent, `src/backend/crossover_index/schema.ts`) [VERIFIED: file read] |
| Node `child_process` | builtin | Spawn the native arm64 helper + invoke `objdump`/`zig cc` at build time | Already the pattern for every native subprocess in this codebase (`spawnAsync` in `backend/utils.ts`) [VERIFIED: file read] |
| Node `net` | builtin | Backend-side TCP client to the loopback helper (health/readiness probe) | No existing project use, but builtin and matches the spike's own raw-socket design (no framework needed for a 2-command probe) |

### Supporting (new, non-npm, build-time toolchain)
| Tool | Version | Purpose | Acquisition |
|------|---------|---------|-------------|
| `zig` (specifically `zig cc -target x86-windows-gnu`) | pin a specific release (spikes used an unpinned local install) | Cross-compile the PE32 i386 shim with a self-contained mingw sysroot | Direct tarball download from `ziglang.org/download/index.json` (aarch64-macos build) — NOT via `brew` (dry-runs only in this sandbox) [CITED: `.claude/skills/spike-findings-gamelib/references/macos-steam-bridge.md`] |
| System `clang` (Xcode CLT) | whatever ships with the developer's Xcode CLT | Compile the native arm64 host helper | Already present on this machine (confirmed via `objdump`/Apple LLVM 21.0.0 presence, which ships from the same CLT) [VERIFIED: `command -v objdump` -> `/usr/bin/objdump`, Apple LLVM 21.0.0] |
| `/usr/bin/objdump` (Apple LLVM objdump) | Apple LLVM 21.0.0 (observed) | Enumerate a game's imported `steam_api` symbols (R3) | Confirmed present and runs against PE binaries per the blueprint's own proven usage (`objdump --private-headers <exe> \| grep steam_api`) [VERIFIED: local `command -v objdump` + version check] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `zig cc -target x86-windows-gnu` | `i686-w64-mingw32-gcc` (real mingw) if present | Blueprint lists this as a fallback; zig is preferred because it is self-contained (no separate mingw install) and is what every spike actually used and proved |
| Committed generator + build-time PE compile (D-07, locked) | Committing the built `.dll` binaries directly | Rejected by D-07 — binaries aren't code-reviewable/diffable and drift silently from the generator source |
| TypeScript generator (`meta/gen_vtables.ts`) | Python, mirroring L4D2-launcher's `gen_vtables.py` literally | TS matches every existing `meta/*.ts` script in this repo (`buildCrossoverIndex.ts`, `downloadHelperBinaries.ts`, `lintTranslations.ts`, all esbuild-bundled + run via `node`) [VERIFIED: `package.json` scripts]; Python would be a new toolchain dependency for a one-off generator. Flagged as an Open Question in case the team wants to port L4D2's actual script instead of reimplementing. |

**Installation:** No `npm install` needed. Add a pinned zig-tarball downloader (see Packaging
below) as a new `meta/` script, following the existing `meta/downloadHelperBinaries.ts` pattern.

**Version verification:** N/A — no npm/pip/cargo package versions to check. Toolchain pinning
(zig release, Steamworks SDK interface versions) is covered in Architecture Patterns below.

## Package Legitimacy Audit

**Not applicable this phase.** No npm, pip, or cargo packages are installed. The build-time
toolchain (`zig`) is acquired via direct tarball download from the official `ziglang.org`
distribution index, not a package registry, so `slopcheck`/registry-verification does not apply.
The recommendation is still to **pin** a specific zig release (not "latest") and download via a
`meta/`-script following the exact `RELEASE_TAGS`-pinning precedent already used by
`meta/downloadHelperBinaries.ts` for `legendary`/`gogdl`/`nile`/`comet` — this is a supply-chain
hygiene recommendation, not a slopcheck-gated package decision.

**Packages removed due to slopcheck [SLOP] verdict:** none (no packages evaluated).
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
 macOS host process space                          CrossOver "bridge" bottle (Wine, PE32)
 ┌────────────────────────────────────────┐        ┌───────────────────────────────────────┐
 │ Electron main (GameLib backend)         │        │  Game.exe  (Avernum 4 / Hoard, etc.)   │
 │                                         │        │     │ imports exactly its own          │
 │  install()/launch()/uninstall()         │        │     │ objdump-derived symbol set        │
 │   isBottleEligible() ──┐                │        │     ▼                                   │
 │   bridgeAllowlist.has(appId) ──► bridge │        │  steam_api.dll  (GENERATED shim)        │
 │        branch                           │        │   flat exports + per-interface           │
 │                                         │        │   __thiscall vtables (R1)                │
 │  ensureBridgeHelperReady()              │        │        │  TCP connect 127.0.0.1:54550    │
 │   spawn/health-check ──────────────────►│◄───────┼────────┘  (Wine shares host loopback)    │
 │        │ PING/PONG (spike-proven)       │        └───────────────────────────────────────┘
 │        ▼                                │
 │  steam-bridge-helper (native arm64)     │
 │   dlopen libsteam_api.dylib (ONCE)      │
 │   SteamAPI_InitFlat(appid=480)          │
 │   holds ISteamUser/ISteamFriends ptrs   │
 │   listen 127.0.0.1:54550 (loopback-only)│───────► native, signed-in Mac Steam.app
 │        │ on failure/no session          │           (live IPC surface: libsteam_api.dylib /
 │        ▼                                │            steamclient.dylib / ipcserver Mach svc)
 │  sendFrontendMessage('steamBridge...')  │
 │        │                                │
 └────────┼────────────────────────────────┘
          ▼
 ┌────────────────────────────────────────┐
 │ Frontend: dialog.ts showDialogBoxModal  │
 │  "Bridge unavailable — fall back to     │
 │   bottled Steam?" (D-05)                │
 └────────────────────────────────────────┘
```

### Recommended Project Structure
```
src/backend/storeManagers/steam/bridge/
├── allowlist.ts          # loads + zod-validates bridge-allowlist.json (D-01/D-02)
├── bridge-allowlist.json # bundled static curated AppID list
├── importScan.ts         # objdump --private-headers wrapper + parser (R3)
├── helperProcess.ts       # spawn/health-check/lifecycle for the native helper (D-03/D-06)
├── shimGenerate.ts        # per-game shim placement orchestration (R3), calls the generator output
├── protocol.ts             # shared frame-encode/decode constants (TS side, for tests/docs only —
│                            # the real wire code lives in the generated C, this documents the layout)
└── __tests__/
    ├── allowlist.test.ts
    ├── importScan.test.ts
    └── helperProcess.test.ts

meta/
├── gen_vtables.ts          # R1: SDK-interface-manifest -> generated .c/.def source (D-07)
├── sdk/                    # GameLib-authored interface manifests (NOT vendored Valve headers — see Open Q1)
│   ├── isteamuser.manifest.json
│   └── isteamfriends.manifest.json
└── buildSteamBridgeShims.ts # packaging-time: invokes zig cc on generator output -> build/bin/...

native/steam-bridge/
├── helper/                 # arm64 Mach-O host helper source (D-03 persistent-channel version of 005b)
│   └── bridge_helper.c
└── generated/               # gen_vtables.ts OUTPUT — committed .c/.def, NOT committed .dll (D-07)
    ├── steam_api_shim.c
    └── steam_api.def
```

### Pattern 1: D-04 resolution — single generic AppID under the shared helper (highest priority)

**What:** `SteamAPI_InitFlat` has no AppID parameter. Every spike's host bridge (`bridge_server.c`)
calls it exactly once, at process startup, with only an error buffer:

```c
// Source: .claude/skills/spike-findings-gamelib/sources/005b-bottle-to-host-tcp/bridge_server.c
// (VERIFIED — read directly, this is the ACTUAL code every 005/006/007/008 spike ran)
typedef int (*InitFlat_t)(char *);
...
char err[1024] = {0};
int r = InitFlat(err);   // <-- no AppID argument anywhere
```

The AppID Steamworks initializes against is resolved out-of-band (documented mechanism:
`steam_appid.txt` in the process's working directory; commonly also settable via a `SteamAppId`
environment variable) [CITED: Steamworks community/partner documentation — MEDIUM confidence,
the exact env-var mechanism was not independently confirmed against `partner.steamgames.com`
directly in this research pass, flagged in Assumptions Log]. Because this resolution happens
**once, at Init time**, and D-03 commits to **one shared, long-lived, init-once helper**, the
helper's AppID identity is fixed for its **entire process lifetime**.

**Why this eliminates 3 of the 4 D-04 options:**
- **(b) per-game re-init:** requires `SteamAPI_Shutdown` + `SteamAPI_InitFlat` again per launch.
  This directly contradicts R2's own acceptance bar ("initializes once ... serves >=2 sequential
  requests ... without re-initializing") and is unsafe for a *shared* helper — any other
  in-flight bridge session's calls during the shutdown/reinit window hit undefined state.
- **(c) one pipe/channel per AppID within one helper:** not achievable with a single `dlopen`'d
  `libsteam_api.dylib` — the flat API's interface pointers and callback registry are
  process-global state, not session-scoped. `dlopen`-ing the same canonical path twice on macOS
  returns the same handle; getting N independent "sessions" would require N separate **processes**
  loading N separate `dlopen` handles, which is option (d).
- **(d) helper-per-AppID subprocess:** directly contradicts the already-locked D-03 decision
  ("ONE shared, long-lived native helper"). D-04 asks HOW to realize D-03, not whether to keep it.

**Recommendation: (a) single generic identity-only AppID — `480` (Spacewar).** This matches the
blueprint's own explicit guidance [CITED: `.claude/skills/spike-findings-gamelib/references/macos-steam-bridge.md`,
line: "For a bottled game use its own AppID; `480` (Spacewar) suffices for identity-only"], and is
now understood as a structural necessity, not merely a convenient simplification. Concretely: the
helper binary ships (or is spawned with a working directory containing) a `steam_appid.txt`
containing `480`, and this value never changes across the helper's lifetime.

**What this correctly serves:** `ISteamUser::GetSteamID`, `BLoggedOn`, and
`ISteamFriends::GetPersonaName` are properties of the **logged-in Steam account**, not the
initializing app — every spike (005a/006/007/008) returned the SAME real SteamID64
(`76561197995867096`) regardless of which harness/game/AppID context was in play, which is
consistent with (though not an independent formal proof of) this reasoning [inference from spike
run-evidence files, MEDIUM confidence].

**What this does NOT correctly serve (documented limitation, not a defect):** AppID-scoped calls
— `SteamAPI_RestartAppIfNecessary(appid)` ownership semantics, `ISteamApps`/DLC ownership checks,
auth tickets, stats/achievements — would be evaluated against AppID `480`, not the real game's
AppID, under this design. This is acceptable for THIS phase's acceptance set: neither Avernum 4
(2 imports: `Init`/`Shutdown`) nor Hoard (7 imports, all `Init`/`RestartAppIfNecessary` (advisory
only per spike 008)/`RunCallbacks`/callback register-unregister) calls an AppID-scoped interface
accessor. Flag explicitly for the already-tracked "API/callback breadth" follow-up work item —
any FUTURE title that calls `ISteamUserStats`/`ISteamApps` scoped to its real AppID will get
wrong answers under single-generic-AppID and needs a real per-game solution at that time.

**Concurrency note:** SPEC's acceptance set launches one game at a time. A future
concurrent-multi-bridge-game scenario sharing one `480`-identity helper is an unaddressed problem
for a later phase — call-level isolation (which connection's calls "belong" to which game) is not
needed for single-player, single-concurrent-launch, but would need design work before any
concurrent-launch feature ships.

### Pattern 2: Vtable generator shape (R1)

**What:** A `meta/gen_vtables.ts` script that, for each pinned interface
(`SteamUser023`/`SteamFriends018` per SPEC), emits a `.c` file containing:
1. A hand-laid vtable array (`static vfn g_isteamuser_vtbl[N] = {...}`) with **every** declared
   method represented — not just the ones the generator marshals real logic for.
2. Real marshaling logic for the small set of methods actually needed for identity (spike 006's
   proven pattern: `GetHSteamUser`, `BLoggedOn`, `GetSteamID`; extend with
   `GetPersonaName` for `ISteamFriends`).
3. **Safe stubs with CORRECT `ret N`** for every other declared slot — an unimplemented method
   must still clean the stack correctly (wrong `ret N` on ANY slot corrupts the caller's stack on
   the next call), even though its body is a no-op return.

**Input source (interface layout):** the C++ ABI rule that vtable layout follows declaration
order holds cleanly here because `ISteamUser`/`ISteamFriends` are simple abstract interfaces with
no base class. This research independently fetched the current `rlabrecque/SteamworksSDK`
(GitHub mirror) `isteamuser.h`/`isteamfriends.h` headers and confirmed:
- `STEAMUSER_INTERFACE_VERSION` = `"SteamUser023"` — matches SPEC's pinned `SteamUser_v023`.
- `STEAMFRIENDS_INTERFACE_VERSION` = `"SteamFriends018"` — matches SPEC's pinned `SteamFriends_v018`.
- `ISteamUser` slot order: `0 GetHSteamUser, 1 BLoggedOn, 2 GetSteamID, ...` — **exactly** matches
  spike 006's independently hand-built, live-validated vtable
  (`g_isteamuser_vtbl[8] = { vt_GetHSteamUser, vt_BLoggedOn, vt_GetSteamID, 0,0,0,0,0 }`).
  [VERIFIED: WebFetch of `raw.githubusercontent.com/rlabrecque/SteamworksSDK/master/public/steam/isteamuser.h`,
  cross-referenced against the in-repo spike source at `sources/006-cpp-vtable-abi/steam_api_vt.c`.]

**Return-value marshaling:**
- `bool`, `HSteamUser` (uint32-class), `CSteamID` (uint64) all fit in EAX or EDX:EAX per spike
  006 (VALIDATED live).
- Struct returns **>8 bytes** by value use a hidden sret pointer as the first argument after
  `this` — this is the standard i386 convention for large-by-value returns and is **explicitly
  untested** in this codebase (spike 006's own "What this does NOT yet prove" caveat). The
  generator must implement this generically even though neither pinned interface's
  early/commonly-called methods appear to need it for the acceptance set — treat as a real
  implementation task, not a documentation footnote.

**Stack cleanup (`ret N`):** MSVC `__thiscall` has the **callee** clean the stack (unlike
`__cdecl`); `this` travels in ECX, not on the stack. `N` = total byte width of the non-`this`
parameters (4 bytes per i386 int/pointer/enum, 8 bytes for a `uint64`/`double` argument, etc.) —
the generator computes this per-method from the parsed parameter list and must emit it correctly
for **every** slot, marshaled or stubbed (see above).

**Output/pinning per D-07 (locked):** commit `meta/gen_vtables.ts` (the generator) and its
generated `.c`/`.def` output to the repo; build the actual PE binary only at packaging time via
`zig cc -target x86-windows-gnu`. An SDK version bump = re-run the generator, review the diff.

### Pattern 3: Persistent-channel wire protocol (R2, Claude's Discretion — concrete recommendation)

Upgrade spike 005b's connect-per-call, human-readable `PING`/`WHOAMI` text protocol to a
**single persistent TCP connection carrying fixed binary frames**, generated mechanically
alongside the vtable stubs so pack/unpack code on both ends is emitted by the same source of
truth, not hand-maintained twice.

```
Request frame (shim -> helper):
  [4 bytes LE] total frame length
  [4 bytes LE] request_id            -- correlates responses on the persistent connection
  [2 bytes LE] interface ordinal     -- 0=flat API, 1=ISteamUser, 2=ISteamFriends, ...
  [2 bytes LE] method slot index     -- matches the generator's vtable slot table
  [N bytes]    argument blob         -- raw little-endian packed args, declared-parameter order

Response frame (helper -> shim):
  [4 bytes LE] total frame length
  [4 bytes LE] request_id            -- echoes the request
  [1 byte]     status                -- 0=ok, 1=error/no-live-session
  [N bytes]    return blob           -- register-return raw bytes (4/8B) OR full sret struct bytes
```

- `request_id` costs almost nothing and future-proofs pipelining without a protocol redesign,
  even though R2's own acceptance bar only requires "≥2 sequential requests" (no concurrency
  needed this phase).
- One long-lived socket per bottle-side process satisfies R2's "single persistent connection"
  bar directly — the shim opens it once (first call) and reuses it, replacing 005c/006/007/008's
  connect-per-call `bridge_whoami()` helper pattern.
- Loopback enforcement: keep `INADDR_LOOPBACK` exactly as spike 005b already does
  (`a.sin_addr.s_addr = htonl(INADDR_LOOPBACK)`) — R2's acceptance bar requires a non-loopback
  bind attempt to be rejected/absent; recommend a unit test asserting the generated helper source
  literally uses `INADDR_LOOPBACK`, never `INADDR_ANY`.
- No JSON: a hand-typed CLI test (spike 005b) is fine with one text command; a generator emitting
  possibly hundreds of typed methods is better served by a frame format the SAME generator can
  pack/unpack mechanically on both sides, avoiding a second hand-maintained parser.

### Pattern 4: GameLib integration — routing, bottle lifecycle, launch shape (R3/R4/R7)

**Routing gate (confirmed via direct read, current line numbers — re-grep at plan time, they
drift):**
- `isBottleEligible()` — private method, `src/backend/storeManagers/steam/games.ts:965`.
- `install()` — `games.ts:611`, branches on `this.isBottleEligible()` at `:634`.
- `launch()` — `games.ts:1058`, branches on `this.isBottleEligible()` at `:1065`.
- `uninstall()` — `games.ts:1146`, branches on `this.isBottleEligible()` at `:1148`.

All three methods share the identical shape: `ensurePlatformsCaptured()` -> `isBottleEligible()`
check -> `isBottleReady()` guard -> dispatch. **Recommendation:** add a new private
`isBridgeEligible()` composing `this.isBottleEligible() && bridgeAllowlist.has(this.appId)`
(D-01/D-02), and insert the bridge branch as the **first** sub-branch inside each method's
existing `if (this.isBottleEligible())` block — mirroring exactly how `isSteamNativeInstallEnabled()`
already composes as a sub-branch inside that same block for the D-15/SNI-08 depot-download path
(`installBottleNative()`). This is the same compositional shape already proven twice in this file
(native depot opt-in, bottle depot opt-in) — the bridge branch is a third instance of the same
pattern, not a new one.

**Critical architecture correction — the bridge bottle must NOT be `GameLibSteam`:** every spike
ran inside the existing `DEFAULT_STEAM_BOTTLE_NAME` (`GameLibSteam`) bottle, which — per Phase 17
`provisionBottle()` — already contains a full bottled Windows Steam client
(`drive_c/Program Files (x86)/Steam/steam.exe`). This was a valid, opportunistic choice for a
spike (Windows DLL search order resolves `steam_api.dll` from the game's own directory first, so
a per-game shim works regardless of what else is in the bottle) but **directly conflicts** with
R6's production acceptance bar: *"the game's bottle contains no `steam.exe`/Windows Steam
client."* **Recommendation:** provision a **new**, separate, shared bridge bottle (e.g.
`GameLibSteamBridge`) via the same `cxbottle --create --bottle <name> --template win10_64`
primitive `bottle.ts` already uses, but **skip** the `SteamSetup.exe` download/run steps
entirely (D-08's CrossOver-only-lifecycle constraint still applies to this new bottle). One
shared bridge bottle — not per-game — is consistent with D-03's "share as much as possible"
philosophy; the acceptance set's two games install into their own `Program Files\<game>\`
subdirectories, so shim placement never collides.

**Launch shape is genuinely different from every existing bottled-Steam verb:** because there is
no bottled `steam.exe` to dispatch to, a bridge game's `launch()` must run the game's own `.exe`
directly via `runWineCommand` (the same primitive `provisionBottle`/`dispatchToBottledSteam`
already import lazily from `backend/launcher`), not `dispatchToBottledSteam('launch', appId)`.
This is the single largest routing-shape delta the planner needs to account for — do not assume
the bridge can reuse `tellBottledSteamToLaunch`/`Install`/`Uninstall` verbatim; only the
underlying `runWineCommand` primitive and the depot-download engine (below) are reusable.

**Install reuses Phase 21/23's bottle depot-download engine almost unchanged:** R3's "auto-generate
and place the shim as part of bottle setup" pairs naturally with the **already-built**
`installBottleNative()` (D-15/SNI-08) path — depot-download the Windows depot straight into
`getBottleSteamappsDir(bridgeBottleName)` — but that function currently writes only
`os: 'windows'` depot files; the bridge install additionally needs a **post-download step**: scan
the newly-installed `.exe` with `objdump` (R3), select/generate the matching shim, and copy it
next to the `.exe` before first launch. Recommend a new `installBridgeGame()` sibling to
`installBottleNative()` in `games.ts`, reusing `installDepotDownload()`'s shared engine with a
new post-install hook, rather than a parallel depot-download implementation.

**Readiness/health signal (D-06):** the helper's own spike-proven `PING`/`PONG` command is
sufficient as the liveness probe — reuse it rather than inventing a new one. Recommend a new
`ensureBridgeHelperReady()` seam, directly modeled on the existing
`ensureSteamClientReady()` (`src/backend/storeManagers/steam/clientSetup.ts`) bounded-poll idiom
(same `T-2-03`/`T-17-09-01` pattern already used twice in this codebase): spawn-if-not-running,
then poll `PING` -> `PONG` and a `WHOAMI` (confirms `InitFlat` actually succeeded against a live
session) with a bounded retry loop before returning ready/not-ready. Call this from the bridge
branch of `install()`/`launch()` exactly where `runNativeDepotDownload()` already calls
`ensureSteamClientReady()`.

**Failure surfacing (D-05):** on an `ensureBridgeHelperReady()` failure, fire
`sendFrontendMessage('steamBridgeSetupRequired', { appName: this.appId, reason: ... })` —
identical shape to the existing `steamBottleSetupRequired`/`steamClientSetupRequired` events — and
have the frontend show a NEW dialog (via the existing `showDialogBoxModalAuto` primitive in
`backend/dialog/dialog.ts`, which already supports a `buttons: ButtonOptions[]` array) offering
"Fall back to bottled Steam" vs. "Cancel."

**Open fallback-mechanics question (flagged, not resolved — see Open Questions):** "falling back"
mechanically means routing that AppID to the **Phase 17 `GameLibSteam`** full bottle instead —
which the user may not have provisioned yet (one-time Steam login inside that bottle). This is a
real UX/architecture question the CONTEXT.md discretion list does not fully resolve and should be
confirmed during plan-check.

### Pattern 5: Packaging (R5)

The project already has a proven, working convention for bundling per-arch native helper
binaries — reuse it verbatim rather than inventing a new packaging mechanism:

```
// Source: src/backend/constants/paths.ts (VERIFIED — existing, working precedent)
export const publicDir = resolve(
  __dirname, '..',
  app.isPackaged || process.env.CI === 'e2e' ? '' : '../public'
)
export const fakeEpicExePath = fixAsarPath(
  join(publicDir, 'bin', 'x64', 'win32', 'EpicGamesLauncher.exe')
)
```

**Recommendation:** add `export const steamBridgeHelperPath = fixAsarPath(join(publicDir, 'bin',
process.arch, 'darwin', 'steam-bridge-helper'))` (arch-aware, unlike the existing win32-only
constants, since the helper is a native arm64 binary). At dev time this resolves under
`public/bin/arm64/darwin/`; at package time, under the packaged app's `build/bin/arm64/darwin/`
(mirroring `fakeEpicExePath`'s exact resolution behavior).

`electron-builder.yml` already includes `build/bin/${arch}/darwin/*` in `mac.files` and
`build/bin/**/*` in `asarUnpack` [VERIFIED: file read] — **no `electron-builder.yml` change is
needed** to bundle the helper binary; it only needs to land at `build/bin/arm64/darwin/steam-bridge-helper`
before `electron-builder` runs, exactly like `legendary`/`gogdl`/`nile`/`comet` already do via
`meta/downloadHelperBinaries.ts` (which writes to `public/bin/${arch}/${platform}/${exeFilename}`).

**Two separate native-build steps must run before `electron-vite build && electron-builder`:**
1. Compile the arm64 host helper with system `clang` -> `public/bin/arm64/darwin/steam-bridge-helper`.
2. Run `meta/gen_vtables.ts` (if not already committed/up to date) then `zig cc -target
   x86-windows-gnu` on its output -> the per-game shim `.dll`(s), placed at install/provision
   time (not bundled statically — R3 requires runtime generation per game, not a static asset).

Recommend a new `meta/buildSteamBridgeShims.ts` (mirrors the existing `meta/downloadHelperBinaries.ts`
/ `meta/buildCrossoverIndex.ts` esbuild-bundled script convention) that performs step 1, and a new
`meta/downloadZig.ts` (same GH-release-tag-pinning convention as `RELEASE_TAGS` in
`downloadHelperBinaries.ts`) that fetches a **pinned** zig release tarball from
`ziglang.org/download/index.json` rather than assuming `zig` is on the developer's `PATH` — this
makes packaging reproducible without depending on local `brew`/`zig` state. Hook both into the
existing `dist:mac`/`release:mac` npm scripts, before `electron-vite build`.

**Constraint reminder:** `brew install` only dry-runs in *this* research/sandbox environment —
this does not necessarily hold on the developer's real packaging machine, but the tarball-download
approach is strictly safer/more reproducible regardless and matches the blueprint's own stated
workaround.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PE import enumeration | A custom PE/COFF import-table parser | Shell out to `/usr/bin/objdump --private-headers <exe> \| grep steam_api` (argv-form spawn, no shell string) | Already proven correct for both acceptance-set games (Avernum 4 = 2, Hoard = 7) [VERIFIED via spike run-evidence]; objdump is confirmed present on macOS via Xcode CLT |
| PE32 cross-compilation / linking | A hand-rolled linker or manual `.def`/import-table byte layout | `zig cc -target x86-windows-gnu` (self-contained mingw sysroot) | Proven end-to-end by every spike (005c/006/007/008); reinventing this is exactly the kind of "hopeless" hand-written-stub problem the blueprint calls out |
| Vtable ABI stubs (300+ methods across pinned interfaces) | Manually writing each `__thiscall`/`ret N` stub by hand | The generator (`meta/gen_vtables.ts`), parsing a small interface manifest once | L4D2-launcher's own docs explicitly frame hand-writing 300+ stubs as infeasible; this is precisely the automatable, mechanically-checkable part of R1 |
| Bundled allowlist JSON schema validation | Ad hoc shape checks / `as` casts | `zod`, following the exact `crossoverIndexSchema` precedent already in `src/backend/crossover_index/schema.ts` | Already the project's standard for validating bundled/fetched JSON that drives a routing decision |
| Bounded readiness polling | A new bespoke retry loop | The existing bounded-poll idiom (`ensureSteamClientReady`, `ensurePlatformsCaptured`'s `pendingFetches` wait) | Same shape (spawn/check -> bounded retry -> timeout) already proven twice in this codebase; reuse the idiom, not just the concept |

**Key insight:** almost every hard technical piece of this phase (PE building, vtable ABI,
import enumeration) already has a proven, working implementation in the spike sources or a proven
external prior-art tool. The actual new engineering work is *generation* (turning proven
one-off hand-written code into a generator that produces it for N interfaces) and *integration*
(fitting the proven mechanism into GameLib's existing routing/bottle/packaging conventions) — not
inventing new native-ABI mechanisms.

## Common Pitfalls

### Pitfall 1: Reusing `GameLibSteam` (the Phase 17 bottle) for bridge games
**What goes wrong:** R6's "no Windows Steam client in the bottle" acceptance criterion silently
fails because the spikes' own proven bottle already has one.
**Why it happens:** the spikes opportunistically reused the existing dedicated Steam bottle
because it was already provisioned and convenient — this was correct for proving the mechanism,
wrong for the production acceptance bar.
**How to avoid:** provision a distinct bridge bottle (Pattern 4) that never runs `SteamSetup.exe`.
**Warning signs:** an acceptance-check `ls` of the bridge bottle's `drive_c/Program Files
(x86)/Steam/` finding `steam.exe` present.

### Pitfall 2: Wrong `ret N` on an unimplemented/stubbed vtable slot
**What goes wrong:** a game that calls ANY vtable method the generator did not correctly compute
stack cleanup for gets stack corruption on the *next* call — often manifesting as a crash several
calls later, far from the actual bug.
**Why it happens:** it is tempting to only marshal (and only carefully compute `ret N` for) the
handful of methods known to be called by the acceptance-set games, leaving other slots as
"good enough" zero-arg stubs.
**How to avoid:** the generator must compute correct `ret N` for **every** declared method in the
pinned interface, even ones that are pure no-op stubs — this is called out explicitly in Pattern
2 above; do not treat it as optional scope-trimming.
**Warning signs:** intermittent crashes in games with a larger interface-accessor surface than the
2-import Avernum 4 baseline (Hoard already exercises more of the surface — a real regression here
would likely show up there first).

### Pitfall 3: Vendoring Valve's SDK header text into a public fork repo
**What goes wrong:** potential IP/redistribution issue — L4D2-launcher's own documentation
explicitly flags "SDK headers are not redistributable" and states an intent to move to
fetch-on-build before any public release.
**Why it happens:** the most direct implementation path for the generator is to literally parse
the real Valve header file, which is the natural thing to reach for.
**How to avoid:** author a small, GameLib-owned interface **manifest** (method name + signature +
declaration-order index — factual, not verbatim copyrighted text) as the generator's input,
rather than committing `isteamuser.h`/`isteamfriends.h` verbatim. See Open Question 1 — this
needs an explicit human/legal confirmation before Wave 1 tasks are written, research cannot make
this call unilaterally.
**Warning signs:** a PR diff that adds full, verbatim Valve SDK header files to a public
`gamelib` repo.

### Pitfall 4: Assuming the fallback dialog (D-05) resolves cleanly
**What goes wrong:** the fallback path ("fall back to bottled Steam") implicitly requires the
Phase 17 `GameLibSteam` bottle to be provisioned and logged in — which a user who has only ever
used the bridge path may not have done. A naive "fall back" implementation could silently attempt
to dispatch into an unprovisioned bottle, hitting the SAME `steamBottleSetupRequired` guided-setup
flow again, rather than actually recovering the launch.
**Why it happens:** the two bottled paths (bridge bottle, full Phase 17 bottle) are easy to
conflate as "the bottle," but they are architecturally distinct bottles with different contents.
**How to avoid:** treat "fall back" as re-routing to the FULL `install()`/`launch()` non-bridge
branch (which already has its own `isBottleReady()` guard and guided-setup flow) — do not build a
separate fallback code path; reuse the existing one and let its existing guard chain handle an
unprovisioned Phase 17 bottle the normal way.
**Warning signs:** a fallback click that produces a second, confusing "bridge unavailable" style
error instead of the familiar Phase 17 guided-setup dialog.

## Code Examples

### Init-once, no-AppID-parameter (D-04's structural evidence)
```c
// Source: .claude/skills/spike-findings-gamelib/sources/005b-bottle-to-host-tcp/bridge_server.c
typedef int (*InitFlat_t)(char *);
...
char err[1024] = {0};
int r = InitFlat(err);
g_user = GetUser(); g_friends = GetFriends();
if (r != 0 || !g_user || !g_friends) { /* fail */ }
```

### Proven MSVC vtable slot layout for ISteamUser (spike 006, independently confirmed against the current SDK header)
```c
// Source: .claude/skills/spike-findings-gamelib/sources/006-cpp-vtable-abi/steam_api_vt.c
static int      __attribute__((thiscall)) vt_GetHSteamUser(void *self) { ... return 1; }
static int      __attribute__((thiscall)) vt_BLoggedOn(void *self)     { ... return 1; }
static uint64_t __attribute__((thiscall)) vt_GetSteamID(void *self)    { ... return bridge_whoami(); }

typedef void *vfn;
static vfn g_isteamuser_vtbl[8] = {
  (vfn)vt_GetHSteamUser, (vfn)vt_BLoggedOn, (vfn)vt_GetSteamID, 0, 0, 0, 0, 0
};
struct FakeUser { vfn *vptr; };
static struct FakeUser g_user = { g_isteamuser_vtbl };
```

### Existing readiness-seam precedent to model `ensureBridgeHelperReady()` on
```ts
// Source: src/backend/storeManagers/steam/clientSetup.ts (VERIFIED — existing, working code)
export async function ensureSteamClientReady(
  appId: string
): Promise<EnsureSteamClientReadyResult> {
  if (!NUMERIC_APP_ID.test(appId)) { /* reject */ }
  if (!SteamUser.isSteamClientInstalled()) {
    sendFrontendMessage('steamClientSetupRequired', { appName: appId, reason: 'install' })
    return { status: 'needs-install', ready: false }
  }
  if (!hasLibraryFoldersVdf()) {
    sendFrontendMessage('steamClientSetupRequired', { appName: appId, reason: 'launch-once' })
    return { status: 'needs-launch', ready: false }
  }
  return { status: 'ready', ready: true }
}
```

### Existing per-arch native binary bundling precedent (R5)
```ts
// Source: src/backend/constants/paths.ts (VERIFIED — existing, working code)
export const publicDir = resolve(
  __dirname, '..',
  app.isPackaged || process.env.CI === 'e2e' ? '' : '../public'
)
export const fakeEpicExePath = fixAsarPath(
  join(publicDir, 'bin', 'x64', 'win32', 'EpicGamesLauncher.exe')
)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Full bottled Windows Steam client per bottle (Phase 17/22) | Out-of-process `steam_api` bridge to one native Mac Steam client (this phase) | Spikes 004–008, 2026-07-18 | Eliminates per-bottle Steam login for allowlisted titles; Phase 17/22 remains the fallback |
| Connect-per-call bridge socket (spikes 005b/c/006/007/008) | Persistent, framed, request-id-correlated TCP channel (this phase, Pattern 3) | This phase (R2) | Removes per-call TCP setup/teardown overhead; matches R2's explicit acceptance bar |

**Deprecated/outdated:** none — the spike programs are explicitly one-off proofs, not deprecated
production code; there is nothing in `src/` yet for this capability to supersede.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `SteamAppId` environment variable (in addition to `steam_appid.txt`) is a valid alternate way to set the init-time AppID | Pattern 1 (D-04) | Low — the `steam_appid.txt` mechanism alone is sufficient and IS directly evidenced by the spike's own working code; the env-var claim is a convenience note, not load-bearing |
| A2 | No struct >8 bytes is returned by value from any early/commonly-called method in the pinned `ISteamUser`/`ISteamFriends` interfaces | Pattern 2 (R1 vtable generator) | Medium — if wrong, the generator's sret handling (already flagged as untested/must-implement) becomes load-bearing sooner than expected; does not block starting the generator, since sret must be implemented generically regardless |
| A3 | L4D2-launcher's `gen_vtables.py` parses the SDK headers directly (rather than a hand-authored manifest) | Standard Stack / Pattern 2 | Low — sourced from a WebFetch summary of the repo's README, not the actual script source; affects only whether GameLib's generator can be a close port vs. a from-scratch reimplementation, not whether the approach is sound |
| A4 | A new, separate "bridge bottle" (distinct from `GameLibSteam`) is the correct resolution of R6's "no Windows Steam client in the bottle" bar, rather than some other bottle-lifecycle change (e.g. surgically uninstalling Steam from an existing bottle) | Pattern 4 | Medium — this is a genuine architecture recommendation, not a locked decision; CONTEXT.md explicitly lists "bottle provisioning changes... lightweight prefix vs. reusing existing bottle machinery" as Claude's Discretion, so this should be confirmed at plan-check, not treated as settled |
| A5 | "Fall back to bottled Steam" (D-05) should re-route into the existing Phase 17 `GameLibSteam`/`install()`/`launch()` non-bridge branch rather than a new bespoke fallback path | Pattern 4 / Pitfall 4 | Medium — reasonable given the existing guard chain, but not explicitly confirmed against user-facing UX expectations; flagged as Open Question 2 |

## Open Questions (RESOLVED)

1. **Can Valve's Steamworks SDK header text (or a close paraphrase) be committed to GameLib's
   public fork repo as the vtable generator's input?** **RESOLVED: see D-09.**
   - What we know: L4D2-launcher's own documentation states SDK headers are "not
     redistributable" and plans to move to fetch-on-build before any public release. GameLib is
     explicitly a public fork (per `CLAUDE.md`).
   - What's unclear: whether a GameLib-authored interface *manifest* (method names, signatures,
     declaration-order index — factual data, not verbatim copyrighted prose/comments) sidesteps
     the concern, or whether even that is too close to derivative reproduction.
   - Recommendation: treat this as a human/legal decision point before Wave 1 generator tasks are
     written, not something research or planning should resolve unilaterally. The safest default
     (assumed by this research's recommended project structure) is a GameLib-authored manifest,
     never a vendored header file.

2. **What does "fall back to bottled Steam" (D-05) concretely do when the user has never
   provisioned the Phase 17 `GameLibSteam` bottle?** **RESOLVED: see D-11.**
   - What we know: the existing `install()`/`launch()` non-bridge branch already has its own
     `isBottleReady()` guard and guided-setup dialog chain.
   - What's unclear: whether reusing that existing chain verbatim (Assumption A5) produces an
     acceptable UX, or whether D-05's "explicit error dialog that offers to fall back" needs to
     pre-emptively explain that fallback itself requires a one-time bottled-Steam login.
   - Recommendation: confirm during plan-check / a short human check-in; this does not block
     starting Wave 1 (generator/helper work), only the R7 fallback-wiring task.

3. **Is TypeScript (matching every existing `meta/*.ts` script) or Python (closer port of
   L4D2-launcher's actual `gen_vtables.py`) preferred for the generator?** **RESOLVED: see D-10.**
   - What we know: this repo's convention is 100% TypeScript for build-time generator scripts.
   - What's unclear: whether reusing/adapting L4D2-launcher's actual Python logic (not
     independently reviewed in this research pass — only its README was fetched) saves more time
     than it costs in toolchain-consistency friction.
   - Recommendation: default to TypeScript per repo convention (already reflected in this
     research's recommended project structure); revisit only if a direct port of the real
     `gen_vtables.py` source turns out to be substantially cheaper once reviewed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `/usr/bin/objdump` (Apple LLVM) | R3 (per-game import enumeration) | Yes | Apple LLVM 21.0.0 (observed on this machine) | — |
| System `clang` (Xcode CLT) | R2 (native arm64 helper compile) | Yes (implied — same CLT install that provides `objdump`) | Not independently version-checked | — |
| `zig` (`zig cc -target x86-windows-gnu`) | R1 (PE32 shim cross-compile) | No (not on `PATH` in this research sandbox) | — | Direct tarball download from `ziglang.org/download/index.json` (blueprint-documented workaround); alt: `i686-w64-mingw32-gcc` if present |
| `brew` | Potential zig install path | Dry-run only in this sandbox | — | Use the tarball-download approach instead (safer/more reproducible regardless) |
| CrossOver.app / `cxbottle` | Bridge-bottle provisioning (Pattern 4) | Assumed present (Phase 17 precedent; not re-verified this session — same machine dependency Phase 17/18/21/23 already rely on) | — | None — CrossOver is a hard dependency for the entire macOS Steam story, unchanged from prior phases |
| Live, signed-in native Mac Steam client | R2/R6 runtime acceptance | Runtime-only dependency, not verifiable in this sandbox | — | None — this is the entire point of the bridge; there is no fallback for it within this phase's scope |

**Missing dependencies with no fallback:**
- Live, signed-in native Mac Steam client at runtime — inherent to the bridge's design, not a gap
  to close.
- CrossOver/`cxbottle` — pre-existing hard dependency from Phase 17 onward, unchanged.

**Missing dependencies with fallback:**
- `zig` — acquire via pinned tarball download rather than assuming a local install.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | ts-jest (Jest), `testEnvironment: 'node'` [VERIFIED: `jest.config.js`] |
| Config file | `jest.config.js` (projects: `src/backend`, `src/frontend`, `meta`) |
| Quick run command | `pnpm jest src/backend/storeManagers/steam --silent` |
| Full suite command | `pnpm test:ci` (`jest --runInBand --silent`) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| R1 | Generator emits correct vtable slot order/offsets for `ISteamUser`/`ISteamFriends` | unit | `pnpm jest meta/gen_vtables.test.ts -x` | ❌ Wave 0 |
| R1 | Generated stubs are `__thiscall` with correct `ret N` per method (structural source assertion, not a real compile) | unit | `pnpm jest meta/gen_vtables.test.ts -x` | ❌ Wave 0 |
| R1 | sret (>8-byte struct return) marshaling is generated correctly for at least one synthetic method | unit | `pnpm jest meta/gen_vtables.test.ts -x` | ❌ Wave 0 |
| R1 | A shim built from generator output loads in the bottle and round-trips a real SteamID64 via a C++ virtual call | manual-only (needs zig + CrossOver + live Mac Steam) | — (dev-HW run, `24-UAT.md`-style record) | N/A |
| R2 | Helper binds loopback-only (never `INADDR_ANY`) | unit (source-grep, mirrors Phase 21's atomic-write structural-assertion precedent) | `pnpm jest bridge/helperProcess.test.ts -x` | ❌ Wave 0 |
| R2 | Helper serves >=2 sequential requests over one persistent connection without re-initializing | integration (spawn compiled helper binary if present; skip if not built) | `pnpm jest bridge/helperProcess.integration.test.ts -x` | ❌ Wave 0 |
| R2 | Helper initializes once against a LIVE Mac Steam session | manual-only | — (dev-HW run) | N/A |
| R3 | `objdump` output parser extracts the exact per-game import set (fixture-based, no real .exe needed) | unit | `pnpm jest bridge/importScan.test.ts -x` | ❌ Wave 0 |
| R3 | A generated shim exports exactly a given game's imported symbol set (given a fixture import list) | unit | `pnpm jest bridge/shimGenerate.test.ts -x` | ❌ Wave 0 |
| R3 | End-to-end: launching an allowlisted game via GameLib produces a placed shim with no manual copy | manual-only (dev-HW) | — | N/A |
| R4 | Allowlisted AppID routes to the bridge branch; non-allowlisted routes to the existing bottled path unchanged | unit (mirrors existing `isBottleEligible()` test patterns in `games.test.ts`) | `pnpm jest storeManagers/steam/__tests__/games.test.ts -x` | Partial — extends existing file |
| R4 | Allowlist JSON is zod-validated; malformed entries are rejected | unit | `pnpm jest bridge/allowlist.test.ts -x` | ❌ Wave 0 |
| R5 | Packaged `.app` bundle contains and can locate the helper binary | manual-only (dev-HW packaged-build smoke check) | — | N/A |
| R6 | Avernum 4 / Hoard reach playable single-player via GameLib with real identity, no bottled Steam client | manual-only (dev-HW, named-game acceptance) | — | N/A |
| R7 | Non-allowlisted title's install/launch/uninstall is byte-for-byte identical to Phase 17 (regression) | unit/integration (extend existing `games.test.ts`/`bottle.test.ts` suites with the allowlist mocked empty) | `pnpm jest storeManagers/steam/__tests__ -x` | Partial — extends existing files |
| R7 | A forced bridge-helper-readiness failure surfaces a clear dialog (no silent hang) | unit (mock `ensureBridgeHelperReady()` to fail, assert `sendFrontendMessage`/dialog invocation, mirrors existing `steamBottleSetupRequired` test pattern) | `pnpm jest storeManagers/steam/__tests__/games.test.ts -x` | Partial — extends existing file |

### Sampling Rate
- **Per task commit:** `pnpm jest src/backend/storeManagers/steam --silent` (or the touched
  file's own suite)
- **Per wave merge:** `pnpm test:ci`
- **Phase gate:** Full suite green before `/gsd:verify-work`; the manual-only rows above are
  gated separately in a `24-UAT.md` on the developer's own Apple-Silicon Mac, mirroring the
  `21-UAT.md`/`23-UAT.md` precedent already established in this project for hardware-gated
  acceptance criteria.

### Wave 0 Gaps
- [ ] `meta/gen_vtables.test.ts` — covers R1 (slot order, `ret N`, sret marshaling assertions)
- [ ] `src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts` — covers R2
      (loopback-bind source assertion; readiness-seam bounded-poll behavior)
- [ ] `src/backend/storeManagers/steam/bridge/__tests__/importScan.test.ts` — covers R3 (objdump
      output parser, fixture-based)
- [ ] `src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts` — covers R4 (zod
      schema validation)
- [ ] Extend `src/backend/storeManagers/steam/__tests__/games.test.ts` — covers R4/R7 routing
      composition and regression-safety
- [ ] `24-UAT.md` — the manual-only rows above (R1's real bottle round-trip, R2's live-Steam
      init, R5's packaged-build smoke check, R6's named-game acceptance)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Explicit trust-boundary documentation: the bridge opens a **local-only** TCP listener; any other local process/user on the machine can connect to it (see Known Threat Patterns) |
| V5 Input Validation | yes | AppId numeric-guard reuse (`/^\d+$/`, matches `buildSteamProtocolUrl`/`dispatchToBottledSteam`'s existing `NUMERIC_APP_ID` convention); exe paths passed to `objdump`/`zig cc`/`runWineCommand` via argv-form spawn only, never shell-interpolated (matches `sanitizeBottleName`/T-17-01 precedent) |
| V6 Cryptography | no | No cryptographic operations introduced by this phase |
| V12 File & Resources | yes | Downloaded build-time toolchain (zig tarball) should be pinned to a specific release, following the existing `RELEASE_TAGS` pinning precedent in `meta/downloadHelperBinaries.ts`; that existing precedent trusts GitHub TLS + a pinned tag but does not checksum-verify — a known, already-accepted residual pattern in this codebase, not a new regression |
| V14 Configuration | yes | Loopback-only bind is the sole network-exposure control (`INADDR_LOOPBACK`, never `INADDR_ANY`) — must be structurally enforced and tested (see Validation Architecture R2 row) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Any other local process on the developer's Mac can connect to `127.0.0.1:54550` and issue marshaled Steamworks calls (read the user's real SteamID64/persona; invoke whatever flat-API surface the helper exposes) | Information Disclosure / Tampering | **Accepted residual risk, not newly introduced by this phase** — the loopback-only bind is the ONLY mitigation named in both SPEC's constraints and the blueprint; no authentication/nonce handshake is specified by any locked decision. Recommend explicitly recording this as an accepted risk during `secure-phase` (not silently building it in without a decision record) rather than research unilaterally expanding scope to add a shared-secret handshake no locked decision calls for. |
| Argument/path injection via a malicious/malformed installed game directory feeding into `objdump`/`zig cc`/`runWineCommand` invocations | Tampering | Argv-form spawn only (never shell string interpolation) — matches the existing `spawnAsync`/T-17-01/T-17-02 conventions already enforced throughout `bottle.ts`/`depot.ts` |
| Supply-chain risk in the build-time zig toolchain download | Tampering | Pin a specific zig release (not "latest"); follow the existing `RELEASE_TAGS`-pinning pattern; consider adding a checksum check as an improvement over the existing (unchecksummed) `downloadHelperBinaries.ts` precedent |

## Sources

### Primary (HIGH confidence)
- `.claude/skills/spike-findings-gamelib/references/macos-steam-bridge.md` — the authoritative build blueprint (read in full)
- `.claude/skills/spike-findings-gamelib/sources/005b-bottle-to-host-tcp/bridge_server.c` — read directly, source of the D-04 finding
- `.claude/skills/spike-findings-gamelib/sources/005c-min-steam_api-shim/{steam_api_shim.c,steam_api.def}` — read directly
- `.claude/skills/spike-findings-gamelib/sources/006-cpp-vtable-abi/{steam_api_vt.c,README.md}` — read directly
- `.claude/skills/spike-findings-gamelib/sources/007-real-game-avernum/{README.md,steam_api_game.c}` — read directly
- `.claude/skills/spike-findings-gamelib/sources/008-gating-game-hoard/{README.md,steam_api_gate.c}` — read directly
- `.planning/seeds/macos-steam-native-bridge-lsteamclient.md` — read in full
- `.planning/todos/pending/2026-07-18-productionize-macos-native-steam-bridge-out-of-process-steam.md` — read in full
- `src/backend/storeManagers/steam/bottle.ts`, `games.ts`, `clientSetup.ts`, `nativeInstallSetting.ts`, `constants.ts` — read directly, current line numbers confirmed
- `src/backend/dialog/dialog.ts`, `src/backend/launcher.ts` (runWineCommand) — read directly
- `src/backend/constants/paths.ts` — read directly, source of the R5 packaging precedent
- `src/backend/crossover_index/schema.ts` — read directly, source of the zod-validation precedent
- `electron-builder.yml`, `package.json`, `jest.config.js` — read directly

### Secondary (MEDIUM confidence)
- `raw.githubusercontent.com/rlabrecque/SteamworksSDK/master/public/steam/isteamuser.h` and `isteamfriends.h` (WebFetch) — confirmed `STEAMUSER_INTERFACE_VERSION`/`STEAMFRIENDS_INTERFACE_VERSION` strings and vtable slot order against SPEC's pinned versions
- `github.com/samdotson61/L4D2-launcher` (WebFetch, README-level summary — not the actual `gen_vtables.py` source) — prior-art confirmation for the generator approach and the "SDK headers not redistributable" caution
- Steamworks community/partner documentation on `steam_appid.txt`/AppID resolution (WebSearch) — confirms the mechanism exists; did not independently verify the `SteamAppId` env-var claim against `partner.steamgames.com` directly (see Assumption A1)

### Tertiary (LOW confidence)
- None flagged separately — all WebSearch findings above were cross-checked against either the spike's own source code or a direct header fetch before being used.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new npm packages; toolchain (zig/clang/objdump) directly verified present/absent on this machine
- Architecture (D-04 resolution): HIGH — derived directly from the spike's own working, empirically-validated source code, not inference alone
- Architecture (vtable generator internals): MEDIUM — mechanism confirmed via independent header cross-reference, but the generator itself is new code with no in-repo precedent yet
- Architecture (bridge-bottle lifecycle, R6): MEDIUM — a well-evidenced recommendation, but explicitly flagged as Claude's Discretion per CONTEXT.md, not a locked decision
- Pitfalls: MEDIUM-HIGH — sourced from the spikes' own documented caveats ("What this does NOT yet prove") plus direct codebase reading, not speculation

**Research date:** 2026-07-18
**Valid until:** 14 days (fast-moving: native ABI/toolchain research, Steamworks SDK interface versions can drift, and this phase's own generator/bottle-lifecycle recommendations are new, unexercised code)
