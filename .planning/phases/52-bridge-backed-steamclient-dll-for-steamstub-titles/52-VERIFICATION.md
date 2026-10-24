---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
verified: 2026-10-24T03:30:00Z
status: gaps_found
score: 3/7 must-haves verified
overrides_applied: 0
re_verification: null
gaps:
  - truth: "Done-when: Grim Dawn (219990) launches from GameLib through its per-game bridge bottle, gets past SteamStub (no steam://run), reaches its main menu, and Mac Steam shows it In-Game"
    status: failed
    reason: "Live gate FAILED on the packaged build, three Play attempts. placeShimForGame returned status 'withheld' (quick 261024-j4l guard) every time, so no forwarder, no registry values, no helper, direct launch, ~2 s exit, no notice. Main menu and In-Game never observed. The only forwarded run (52-11 round 1) used the scratch harness, which bypasses placeShimForGame, and it never reached a main menu."
    artifacts:
      - path: "src/backend/storeManagers/steam/bridge/shimGenerate.ts"
        issue: "Lines ~1123 and ~1359: the withhold guard runs before any SteamStub awareness; findUnservableInterfaceVersions uses SHIM64_SERVED_INTERFACE_VERSIONS, which has no SteamUser023, SteamNetworking006 or STEAMREMOTESTORAGE_INTERFACE_VERSION016."
      - path: "src/backend/storeManagers/steam/games.ts"
        issue: "Lines ~2879-2886: the 'withheld' branch launches directly with no forwarder path."
    missing:
      - "Decide and implement ONE of: (a) serve SteamUser023, SteamNetworking006 and STEAMREMOTESTORAGE_INTERFACE_VERSION016 on x64 through the inventory pipeline (extract-proton-inventory --versions, helperInterface, arches x64, gen-vtables, coverage pins; precedent e9519488d / 8628ea5a7); or (b) make the withhold guard SteamStub-aware: when a .bind section is present, do not withhold and take the bridge-steamstub forwarder path. (a) is the boundary-consistent choice because it removes the cause; (b) risks a title that starts but loses its Steam interfaces."
      - "Re-run the live gate items 6-8 on the packaged build against the product bottle. Strict rule: HELLO plus a clean game Steam-init log (no 'SteamAPI_IsSteamRunning() did not locate a running instance of Steam'), operator-confirmed main menu, Mac Steam In-Game. In-Game alone never counts."
      - "Resolve the 'IsSteamRunning did not locate a running instance' warning seen at round-1.cxlog:6226. The stub queried ActiveProcess 'pid' twice (absent). Decision 1 (no pid writer) was a provisional operator call made before the warning was weighed against the strict rule; revisit it at the re-gate."
  - truth: "A SteamStub title gets an honest notice instead of a silent exit (Scope 4)"
    status: failed
    reason: "withDrmWrapper (shimGenerate.ts:688-695) returns early for status 'withheld', so drmWrapper is never stamped. games.ts logs/notifies only for drmWrapper results, so the withheld path emits no notice. Operator saw 'failing silently'. This is the exact user-visible symptom the phase exists to remove."
    artifacts:
      - path: "src/backend/storeManagers/steam/bridge/shimGenerate.ts"
        issue: "withDrmWrapper skips 'withheld'."
      - path: "src/backend/storeManagers/steam/games.ts"
        issue: "withheld branch has no steamstub-unforwarded notice."
    missing:
      - "Detect .bind independently of shim verdict; carry drmWrapper='steamstub' on 'withheld' results (and withheld verdict), and emit the steamstub-unforwarded notice on that branch."
  - truth: "Forwarding SteamClient017/014 does not regress ordinary x64 bridge titles (CR-01)"
    status: failed
    reason: "Confirmed in generated source: native/steam-bridge/generated/steam_api_shim.c vt_SteamClient017_GetISteamMatchmaking (and siblings) return NULL on a transport failure, on native 'present == 0', and on resolve_iface_by_exact_version miss. The pre-phase behaviour fell back to &g_x64_null_object_instance. Every x64 bridge title that builds a context through SteamClient()->GetISteam* (ELEX 411300 was measured working on the null-object path) can now see NULL. No test or live run exercises ELEX or any non-SteamStub x64 title after the flip."
    artifacts:
      - path: "meta/gen_vtables.ts"
        issue: "emitSteamClientForwardedLookup (~1039-1065) has no null-object fallback for the non-SteamStub caller."
      - path: "src/backend/storeManagers/steam/bridge/shimCoverage.ts"
        issue: "Lines 300-301 flip SteamClient017/014 to 'wire' for all x64 titles."
    missing:
      - "Restore the null-object fallback for ordinary GetISteam* lookups (forward only on the GameLibBridge_CreateInterface / SteamStub path, or return the local/null object when native is absent or the exact version is not served), regenerate, add a generated-source pin test for the fallback, then re-run an ELEX (411300) bridge-verified check."
  - truth: "The launch log and bottle state accurately reflect a withheld launch"
    status: failed
    reason: "Withheld message claims 'launching with the game's own steam_api', but with no .gamelib-orig backup the stale 223744-byte GameLib shim stays in place (SHIM64 is 242688), a helper-less shim. UAT Gaps 3 and 4."
    artifacts:
      - path: "src/backend/storeManagers/steam/bridge/shimGenerate.ts"
        issue: "withhold() (~845-885): restoreOriginalIfBackedUp is a no-op when no backup exists, and the warning text is unconditional."
    missing:
      - "Log the true state when no original exists, and either refuse to launch with guidance to verify files in Steam or refresh the shim."
  - truth: "Setup reports success only when the registry values were actually written (WR-02/03/04, goal-relevant)"
    status: partial
    reason: "Review warnings that make the forwarder path report 'placed' (and so suppress the notice) when forwarding cannot work, or that leave stale state. Not reached in the live gate because the withhold guard fired first, so they are unexercised."
    artifacts:
      - path: "src/backend/storeManagers/steam/bridge/steamClientSetup.ts"
        issue: "WR-02 (:197): res.code === undefined (wine never spawned, 'Invalid wine') counts as success; fix is res.code !== 0 -> error."
      - path: "src/backend/storeManagers/steam/games.ts"
        issue: "WR-03 (:2969): arch falls back to 'x64' when verdict and persisted scan are absent, so an x86 .bind title is 'placed' and the x86-deferred notice never fires; read the PE machine type instead."
      - path: "src/backend/storeManagers/steam/bridge/shimGenerate.ts"
        issue: "WR-04 (:701, games.ts:2842): fresh 'no .bind' result cannot clear a persisted drmWrapper on the already-placed path; report an explicit fresh value."
    missing:
      - "Fix WR-02, WR-03, WR-04 with tests. WR-01 (wait:true blocking on wineserver --wait with no timeout, twice per launch) can hang Play and should be fixed in the same plan; WR-05..08 are hardening and can be deferred."
deferred: []
human_verification: []
---

# Phase 52: Bridge-backed steamclient.dll for SteamStub titles Verification Report

**Phase Goal:** Steam games wrapped with SteamStub run through the native Steam bridge in their own per-game bottle. The stub's launch check is answered by the genuine signed-in Mac Steam client, with no Windows Steam client in the bottle and the exe unmodified. Done-when: Grim Dawn (219990) launches from GameLib, gets past SteamStub (no `steam://run`), reaches its main menu, Mac Steam shows it In-Game.
**Verified:** 2026-10-24
**Status:** gaps_found
**Re-verification:** No, initial verification
**Requirements:** none declared for this phase; `.planning/REQUIREMENTS.md` does not exist (ROADMAP says `Requirements: TBD`). Requirements coverage is not applicable; ROADMAP Scopes 1-5 and done-when were used as the contract.

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP) | Status | Evidence |
|---|---|---|---|
| 1 | Scope 1: SteamClient017/014 forward to native ISteamClient (wire, helper-served handles, GetISteam* forwarded) | VERIFIED (mechanism) / REGRESSION RISK | `shimCoverage.ts:300-301` wire; generated `vt_SteamClient017_GetISteam*` call `bridge_transact` and return the native-present result. Round 1 helper log: `FWD CreateInterface SteamClient017/014 native=present`. But see CR-01 gap: NULL instead of null object for all x64 titles. |
| 2 | Scope 2: zig-built `steamclient64.dll` forwarder resolving through the game's shim | VERIFIED | `native/steam-bridge/steamclient/steamclient_fwd.c` exists; built `public/bin/arm64/darwin/steamclient64.dll` 186368 bytes (CreateInterface only per 52-10 objdump). Round 1: steamclient64.dll loaded in Wine, HELLO received. Verified only in the scratch harness, never through GameLib. |
| 3 | Scope 3: bottle setup at launch (HKCU `ActiveProcess` values, DLL placement, never HKLM) | FAILED (live) | `steamClientSetup.ts` exists, HKCU-only, x64-only by decision 6. Never ran in the product flow: `user.reg` has 0 `ActiveProcess` entries after three launches (UAT item 8). `pid` not written (decision 1). Hygiene sub-checks that did pass: no Valve key in `system.reg`, no steam.exe, exe sha256 unchanged. |
| 4 | Scope 4: `.bind` detection gives an honest notice | FAILED | Detection exists (`detectDrmWrapper`, `peSections.ts`, 49 catalogs). On the withheld path it is not applied (`withDrmWrapper` skips `withheld`), so the user got a silent 2 s exit (UAT Gaps 2). |
| 5 | Scope 5: five modern-SDK `SteamInternal_*` exports + importer scan gap | VERIFIED (static) | `steam_api64.def` exports `SteamInternal_CreateInterface/SteamAPI_Init/ContextInit/FindOrCreateUserInterface/FindOrCreateGameServerInterface/GameServer_Init_V2`; bounded exe->Engine.dll closure in `importScan.ts` is what surfaced the three unservable versions at the gate. Runtime effect on Grim Dawn unproven. |
| 6 | Done-when: Grim Dawn launches from GameLib, passes SteamStub, reaches main menu, In-Game | FAILED | UAT items 6, 7, 8 all `issue`; `/tmp/gamelib-gate-52-20261024T015232Z/gamelib-launch-1.log` lines 114-122, 178-186, 228-236: withheld, direct launch, gone after 2 s. Item 7 trace: `steam://run` count 4 (expected 0), alive=no, HELLO 0. |
| 7 | Boundary: every answer comes from the native client; no stand-in; no HKLM | VERIFIED (static) | Forwarded lookups return NULL, never fabricate; setup is HKCU-only. Caveat: WR-07/WR-08 describe gaps in handle and identity-only enforcement; nothing was observed leaking. |

**Score:** 3/7 (truths 1, 2, 5/7 hold only at the mechanism level; truths 3, 4, 6 fail; truth 1 carries CR-01)

### Orchestrator question: is the j4l guard's classification wrong?

No. Checked in the codebase: `SteamUser023` appears in the generated shim only inside `#if defined(__i386__)` blocks (`steam_api_shim.c:614-617` and the `g_iface_table` row at 8484-8486), and `meta/sdk/acceptance-interface-versions.json` lists it as `"arches": ["x86"]`. `SHIM64_SERVED_INTERFACE_VERSIONS` (shimCoverage.ts:292-316) does not contain SteamUser023, SteamNetworking006 (only 005), or STEAMREMOTESTORAGE 016 (only 013). The x64 shim serves SteamUser019 for the SteamUser family, so the null-object eligibility exception does not apply either. The guard is correctly classifying a real x64 gap. The defect is the interaction: 52-01 widened what is forwardable for SteamClient only; it did not widen the interface table, and the guard sits ahead of the SteamStub path. Whether Grim Dawn actually runs with those versions unserved is untested, because scratch round 1 placed the shim itself and never reached a main menu.

### Required Artifacts

| Artifact | Status | Details |
|---|---|---|
| `meta/gen_vtables.ts` forwarded ISteamClient + `GameLibBridge_CreateInterface` | EXISTS, WIRED, REGRESSION (CR-01) | generated output matches (`pnpm gen-vtables` no diff per 52-10) |
| `native/steam-bridge/steamclient/steamclient_fwd.c` + built `steamclient64.dll` | VERIFIED | present, 186368 bytes |
| `steamClientSetup.ts` | EXISTS, WIRED, UNEXERCISED | reachable only after a non-withheld verdict; WR-01/02/03/05/06 open |
| `.bind` parser, `drmWrapper` persistence | EXISTS, PARTIAL | not applied to `withheld` |
| 49 notice catalogs | EXISTS | notice never shown in the gate |
| Helper CONTROL slot 3 | VERIFIED (round 1: native=present) | via scratch harness only |

### Key Link Verification

| From | To | Status | Details |
|---|---|---|---|
| GameLib Play -> placeShimForGame -> forwarder setup | | NOT_WIRED for Grim Dawn | withheld branch short-circuits before setup |
| stub -> steamclient64.dll -> shim -> helper -> native client | | WIRED in scratch only | HELLO + FWD native=present, alive 60 s |
| games.ts withheld branch -> notice | | NOT_WIRED | no drmWrapper, no notice |

### Behavioral Spot-Checks / Probes

Step 7b: SKIPPED for new runs (no server to start; the decisive evidence is the live gate logs above). Step 7c: no `probe-*.sh` declared by any PLAN; none run. Orchestrator reports `pnpm test:ci` 6 failures in 4 suites identical at pre-phase base 7ed535984 (not phase 52) and `pnpm codecheck` clean; I did not re-run them.

### Anti-Patterns

| File | Pattern | Severity |
|---|---|---|
| shimGenerate.ts withhold() | Unconditional "launching with the game's own steam_api" when the stale shim stays | Blocker (false log, UAT Gap 3) |
| steamClientSetup.ts:197 | `res.code !== undefined` accepts a never-spawned wine | Warning (WR-02) |
| games.ts:2969 | `?? 'x64'` guess | Warning (WR-03) |
| debt markers (TBD/FIXME/XXX) | not scanned across all 153 changed files | Not assessed |

### Human Verification Required

None added: the failures are already established by operator-run evidence. After gap closure, the re-gate (items 6-8) is itself a human step: operator must confirm main menu and Mac Steam In-Game on the packaged build, and a clean Steam-init log must be read from the game's own log.

## Gaps Summary

The mechanism the phase set out to build exists and was shown to work in isolation: a scratch bottle with the shim, the forwarder and the HKCU value reaches HELLO, forwards SteamClient017/014 to the native client, loads steamclient64.dll and stays alive 60 s. The goal as stated, a game launched from GameLib that passes SteamStub and reaches its main menu, is not achieved. The shipped product flow never reaches the forwarder for Grim Dawn because the j4l withhold guard correctly sees that the x64 shim does not serve three interface versions Engine.dll names, and withholds before SteamStub handling runs. That produces the exact silent 2 s exit the phase was filed to remove, with no notice.

Even the scratch pass is not a verified pass under the strict bridge rule: no main menu was observed and the game's Steam init logged an IsSteamRunning warning.

Separately, the `stub` to `wire` flip of SteamClient017/014 (CR-01) was applied to every x64 bridge title, and the generated code now returns NULL where it used to return the null object. That is a probable regression for non-SteamStub titles (ELEX) and nothing in the phase tests or gates it.

Suggested closure plan order for `/gsd-plan-phase 52 --gaps`:
1. Close the guard/forwarder interaction (serve the three x64 versions, or make the guard SteamStub-aware), and carry `drmWrapper` plus a notice on `withheld`.
2. Fix CR-01 with a pin test and an ELEX check.
3. Fix withheld-state honesty (stale shim, false log line) and WR-02/03/04, plus WR-01 timeout.
4. Re-run the packaged live gate with the strict rule, revisiting the pid decision if the IsSteamRunning warning persists.

---

_Verified: 2026-10-24_
_Verifier: Claude (gsd-verifier)_
