# Phase 51: Widen the native Steam bridge — Research

**Researched:** 2026-10-17
**Domain:** macOS native Steam bridge (out-of-process `steam_api` proxy) — interface-surface widening, scan-derived eligibility, Win64 go/no-go
**Confidence:** MEDIUM (HIGH on the three delegated go/no-go decisions, which were measured directly this session; MEDIUM-LOW on UI/wording/log-parsing items that are explicitly Claude's Discretion / open research questions in CONTEXT.md)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-51-01:** Each bridge launch spawns its **own helper, inited with the game's real AppID** (`steam_appid.txt` = the game's AppID, not 480). ISteamApps, ISteamUserStats and ISteamRemoteStorage answer truthfully about the running game; Mac Steam shows In-Game and records playtime. This supersedes Phase 24 D-03's "one shared, long-lived helper" and D-04's "single generic AppID 480" — "one Steam login" still holds, "one helper" does not.
- **D-51-02:** When a game launches through a stubbed interface, or identity fell back (D-51-04), the user sees a **one-time per-game notice at first launch** via the existing `notify()` path ("Achievements and cloud saves do not sync for this game via the bridge"). Logged every time, shown once per game.
- **D-51-03:** **Two bridge games may run at once; no lock is built.** Steam's one-session rule is per account across machines; the local client accepts several inits.
- **D-51-04:** If real-AppID init fails for a game (Steam refuses the AppID, family-shared title, licence check), the helper **falls back to 480 identity-only and the game launches anyway**; SteamID and persona still flow, AppID-scoped interfaces answer as stubs, D-51-02's notice fires. Never a D-05 dialog for this case.
- **D-51-05:** Install-first-decide-second is accepted. On an import-scan miss the D-05 dialog names the missing symbols and offers the bottled-Steam fallback, which **re-downloads through the proven Phase 17 path**; the per-game bridge bottle is deleted. Move-the-bits-instead is a later optimisation only if the census (D-51-15) shows a high miss rate.
- **D-51-06:** **Pre-install screen on the depot manifest file list**, run before any download: `steam_api64.dll` only with no 32-bit shim target → bottled Steam, no bridge attempt; no `steam_api*.dll` at all → bridge bottle, no shim placed; `steam_api.dll` present → install then scan. The import scan stays authoritative; the screen only avoids the obvious wasted downloads.
- **D-51-07:** The persisted verdict stores the **missing symbols and the shim export-set version it was scanned against**. A later release whose shim covers those symbols clears the verdict on the next install or launch automatically; no manual "retry" affordance.
- **D-51-08:** A title on the bundled **known-bad list gets a dialog up front naming the reason** (DRM-wrapped, 64-bit only, …), then routes to bottled Steam. The bridge is never attempted silently for a known-bad title. The dialog carries a third button per D-51-11.
- **D-51-09:** The route is shown in **both** the install dialog's wine section (one-line verdict + reason) **and** on the game page next to the compatibility rating, including missing symbols after a scan miss.
- **D-51-10:** The user can **force bottled Steam for a clean-scan game** via a toggle in the install dialog's wine section, persisted per game beside the scan verdict on the D-17 precedent.
- **D-51-11:** The user can **force a bridge attempt for a known-bad or scan-missed title**; a miss lands on the ordinary D-05 fallback. The known-bad list is therefore self-correcting.
- **D-51-12 (folded todo LD-5):** `removeSteamInstallCopy('bridge')` **deletes the emptied per-game bridge bottle** via `removePerGameBridgeBottle` when the bottle is per-game. Legacy-bottle behaviour unchanged.
- **D-51-13:** **Research decides the Win64 shim** — census the owned Windows-only library for `steam_api64.dll` and prototype `zig cc -target x86_64-windows-gnu` against the generator's vtable ABI. If it builds and the single Win64 calling convention holds, the planner includes the 64-bit target; if not, the phase ships the fail-closed rule and the target is deferred with evidence attached. **See "D-51-13 Verdict" below — this research delivers GO.**
- **D-51-14:** Acceptance set = **Hoard (63000, locked)** + one owned title per added interface (Apps, UserStats, RemoteStorage) nominated by research + **Avernum 5/6 as the regression pair**. **See "D-51-14 Nomination" below.**
- **D-51-15:** "Most" is measured by a **census of the operator's owned Windows-only library**; research produces the import census once, the phase closes by re-running it against the shipped shim. **See "D-51-15 Census" below — produced this session.**
- **D-51-16 (folded todo):** The bottled-Steam fallback's dead Play button is in scope: surface a "Waiting for Steam…" state when a fallback launch has produced no game process within the grace window, naming the likely causes. Start by measuring which of the three causes (self-update relaunch, hidden login window, one-session rule) is detectable from `logs/bootstrap_log.txt` / `console_log.txt`.

### Claude's Discretion

- Helper-side dispatch generation: the helper hand-`dlsym`s each method today; six more interfaces make it manifest-driven. Generator output shape, ordinal assignment and wire framing changes are research/planning.
- How full vtable slot tables for the six interfaces are authored under Phase 24 D-09 (GameLib-authored manifests, no vendored Valve headers). The two existing manifests carry synthetic `_TESTONLY` slots and are not full layouts.
- The `importScan.ts` symbol regex (`SteamAPI_*` only) must widen to the bare accessors (`SteamUser`, `SteamUtils`, …) and the `SteamInternal_*` / `SteamAPI_GetHSteamUser` / `SteamClient` family, and must fail closed on a `steam_api64.dll` heading.
- Whether the depot manifest file list is available before download in `depot.ts` for D-51-06, and the exact screen rules beyond the three cases listed.
- Known-bad list schema (reason taxonomy, `version: 2` of `bridge-allowlist.json`) and whether the seed and known-bad lists live in one file or two.
- Wording of the route line, the notice and the known-bad dialog; all new strings go in `gamelib.json` per the l10n standing requirement.
- What the Avernum 5/6 installs already sitting in the legacy `GameLibSteamBridge` bottle do when per-game becomes the default (the `261016-u1w` resolver already prefers legacy-if-it-holds-the-manifest).

### Deferred Ideas (OUT OF SCOPE)

- The deep in-process `lsteamclient` thunk, CEG/Denuvo enforcement, P2P multiplayer join (24-SPEC), retiring the `GameLibSteam` bottle, a remote/CI allowlist index (declined again on the ROADMAP entry — nothing to index).
- "Move the bits instead of re-downloading" on a scan miss — later optimisation only if D-51-15's census shows a high miss rate.
</user_constraints>

<phase_requirements>
## Phase Requirements

No numbered `REQ-ID`s exist for Phase 51 (pre-dates the REQUIREMENTS.md convention); the ROADMAP/CONTEXT `D-51-NN` decision IDs are the requirement surface the planner must satisfy. Mapping:

| ID | Description | Research Support |
|----|-------------|------------------|
| D-51-01 | Per-launch helper, real AppID | `bridge_helper.c`'s `ensure_steam_appid_file()` and `helperProcess.ts`'s single-instance assumptions read in full; see Architecture Patterns "Per-game helper + port allocation" |
| D-51-02/04 | First-launch stub notice, 480 fallback | `dialog.ts` `notify({body,title})` signature confirmed exported; existing todo `2026-10-17-packaged-macos-build-delivers-no-notifications.md` means this notice needs a second observable channel on packaged macOS — flagged in Pitfalls |
| D-51-06 | Pre-install screen | `depot.ts`/`games.ts` call chain traced directly — screen is a genuinely separate `buildDepotPlan()` call, not free; see "D-51-06 finding" below |
| D-51-07 | Persisted verdict + shim version | `electronStores.ts` `SteamMetadataCacheEntry` CARRY-FORWARD precedent read in full (verbatim quotes below) |
| D-51-09/10 | Route visibility, user override | Frontend integration points named (`steamEligibilityProbe.ts`, `steamSectionGating.ts`, `steamBottleDefaults.ts`) — not read this session, flagged as Open Question |
| D-51-12 | Bridge bottle removal | `bottle.ts`'s `removePerGameBridgeBottle`/`resolveBridgeBottleName` read directly |
| D-51-13 | Win64 go/no-go | **Measured this session** — zig build + disassembly proof, see dedicated section |
| D-51-14 | Acceptance set | **Measured this session** — import census, see dedicated section |
| D-51-15 | Import census | **Measured this session** — full census table below |
| D-51-16 | Dead-Play detection | Partially measured — real bootstrap/console log tails read; one of three causes has a clean signal, two do not (see Pitfalls) |
</phase_requirements>

## Summary

The Phase 24 bridge is proven end-to-end but intentionally narrow: one shared helper, AppID 480 always, two interfaces (ISteamUser, ISteamFriends), a 2-game allowlist, and an import scanner that is blind to both 64-bit games and the "bare" legacy Steamworks accessor style. This phase widens the interface surface to 8 (adding ISteamUtils, ISteamApps, ISteamUserStats, ISteamRemoteStorage, ISteamMatchmaking, ISteamNetworking as stubs), moves eligibility from a static allowlist to scan-derived seed ∪ persisted-verdict ∖ known-bad ∖ forced-bottle, and gives each bridge launch its own per-AppID helper instance.

This research directly measured all three decisions explicitly delegated to research. **D-51-13 (Win64) is a GO**: `zig cc -target x86_64-windows-gnu` (the exact pinned version, `0.16.0`, from `meta/downloadZig.ts`) builds a vtable-shaped C file cleanly, and disassembly of the output object proves Win64 has one calling convention with a concrete, newly-identified wrinkle — when a method returns an aggregate >8 bytes by value, the hidden return pointer takes the **first** register (RCX) and `this` shifts to the **second** (RDX), unlike i386 `__thiscall` where `this` is unconditionally ECX and the sret pointer goes on the stack. This is new generator logic, not a toggle. **D-51-14/15 (acceptance set / census)**: the operator's owned Windows-only library was censused directly (8 titles across two real CrossOver bottles, via `file` + `objdump --private-headers`). Only two titles beyond the locked Hoard import any of the three new interfaces at all: Hoard itself (which already imports all three) and **XCOM: Enemy Unknown (200510)**, which also imports all three but is bundled with 9 out-of-scope `SteamGameServer*` symbols that still need export (even as stubs) for the exe to load at all. **ELEX (411300)** is the one real-world Win64-only title in the census, confirming the Win64 target has a genuine owned acceptance candidate if the planner takes the GO.

**Primary recommendation:** Take the Win64 GO; extend `meta/gen_vtables.ts` with an x64-aware sret/register-shift path (do not reuse `computeRetN`'s i386 stack-cleanup math for x64 — Win64 never emits `ret N`, the caller always cleans the stack); nominate Hoard + XCOM: Enemy Unknown (covering all three new interfaces at once, with an explicit GameServer-stub caveat) + Avernum 5/6 as the acceptance set; budget D-51-06's pre-install screen as a genuinely separate, additional `buildDepotPlan()` call (not a reuse of the real download's plan).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Vtable/shim generation (per-interface C + `.def`) | Build/Packaging (meta/, native/) | — | Runs at `pnpm build-steam-bridge` time (D-07 precedent); never at app runtime |
| Per-game native helper (dlopen `libsteam_api.dylib`, serve TCP) | Native host process (arm64 Mach-O) | — | Out-of-process by design (004a/004b rejected in-process) |
| PE32/PE32+ shim inside the bottle | Bottled Windows process (Wine/CrossOver) | — | Only surface that must match the real game's PE import table |
| Helper lifecycle, port allocation, readiness polling | Backend (Electron/Node main process, `helperProcess.ts`) | — | Spawns/monitors the per-AppID helper; owns the CONTROL-frame health contract |
| Import scan, eligibility routing, persisted verdict | Backend (`games.ts`, `importScan.ts`, `electronStores.ts`) | — | Pure Node logic, no UI; this is where D-51-05/06/07/15's decision logic lives |
| Route visibility, force-toggle, known-bad dialog | Frontend (React, install dialog + game page) | Backend (dialog.ts for modal/notify) | D-51-09/10/11/02 are user-facing; backend only supplies the verdict/reason string |
| Bottled-Steam fallback dead-Play detection | Backend (`bottleProcessMonitor.ts`) | Frontend (status chip) | Already polls `ps`; D-51-16 only adds a grace-window UI state on top of the existing no-deadline poller |

## Standard Stack

No new runtime dependencies. This phase is Steam-stack-frozen (`.planning/research/STEAM-STACK.md`) native/toolchain and TypeScript work only — `steam-session`/`steam-user`/`@node-steam/vdf`/axios are unaffected. The one toolchain surface this phase touches:

| Tool | Version | Purpose | Verification |
|------|---------|---------|---------------|
| zig | `0.16.0` (pinned in `meta/downloadZig.ts`'s `ZIG_VERSION`) | Cross-compile the PE32/PE32+ shim (`zig cc -target x86-windows-gnu` today; `-target x86_64-windows-gnu` if D-51-13 is taken) | `[VERIFIED: zig cc -target x86_64-windows-gnu]` — built cleanly against the exact pinned 0.16.0 tarball this session, in the scratchpad, not the repo |
| objdump (Apple LLVM, `/usr/bin/objdump`) | Apple LLVM 21.0.0 | Per-game import census (`DLL Name: steam_api*.dll` + symbol table) | `[VERIFIED: objdump --private-headers]` — used directly against 9 real PE binaries this session |

**No `npm install` / `pip install` / `cargo add` in this phase.** The Package Legitimacy Audit section is intentionally omitted — there is nothing to audit.

## Architecture Patterns

### System Architecture Diagram (current vs. widened)

```
Game.exe (bottle)                 Helper (native arm64)              Mac Steam
  │ imports steam_api[64].dll        │                                   │
  │                                  │                                   │
  ├─ CONTROL (health/whoami) ───────►│                                   │
  │                                  │─ dlopen libsteam_api.dylib ──────►│
  ├─ ordinal=FLAT (never served) ────►│  (lifecycle only)                │
  ├─ ordinal=USER, slot=N ──────────►│─ dlsym'd ISteamUser method ──────►│ (real signed-in client)
  ├─ ordinal=FRIENDS, slot=N ───────►│─ dlsym'd ISteamFriends method ───►│
  │   ·· today stops here ··        │                                   │
  ├─ ordinal=UTILS, slot=N  (NEW) ──►│─ dlsym'd ISteamUtils method ─────►│
  ├─ ordinal=APPS, slot=N   (NEW) ──►│─ dlsym'd ISteamApps method ──────►│
  ├─ ordinal=USERSTATS (NEW) ───────►│─ dlsym'd ISteamUserStats method ─►│
  ├─ ordinal=REMOTESTORAGE (NEW) ───►│─ dlsym'd ISteamRemoteStorage ────►│  (answers cloud-disabled)
  └─ ordinal=MATCHMAKING/           │─ stub only (unavailable answer) ──┤  (P2P stays out of scope)
      NETWORKING (NEW, stub)        │                                   │

D-51-01 changes the LEFT edge of this diagram: today ONE helper process serves every
bottle game over port 54550; this phase spawns ONE helper PER bridge launch, each
inited with the launching game's real AppID (own steam_appid.txt, own port).
```

### Recommended extension to `meta/gen_vtables.ts`

Today `main()` hardcodes exactly two manifests:

```typescript
// current (confirmed by direct read, meta/gen_vtables.ts main()):
loadManifest('isteamuser.manifest.json')
loadManifest('isteamfriends.manifest.json')
```

Widen to load all eight manifest files from a directory listing (or an explicit ordered array mirroring the ROADMAP's locked interface order: ISteamUtils, ISteamApps, ISteamUserStats, ISteamRemoteStorage, ISteamMatchmaking, ISteamNetworking, plus the existing ISteamUser/ISteamFriends) rather than two literal `loadManifest()` calls. The manifest `ordinal` field, `protocol.ts`'s `INTERFACE_ORDINAL` object, and `bridge_helper.c`'s `#define ORDINAL_*` constants are **three independently hand-kept-in-sync locations today** `[VERIFIED: protocol.ts, bridge_helper.c, meta/sdk/*.manifest.json — all three read directly this session]` — Claude's Discretion item "ordinal assignment" should resolve this by generating the helper's dispatch table (and ideally the ordinal constants) FROM the manifest set, not hand-duplicating a fourth time.

### D-51-13 Verdict: Win64 shim — GO, with a concrete new rule

**Build proof** `[VERIFIED: zig cc -target x86_64-windows-gnu, pinned 0.16.0]` — ran in `/private/tmp/.../scratchpad/zig` (never the repo):

```c
/* mirrors the generator's shape: vtable-slot method + a struct >8 bytes
   returned by value (the untested sret case 24-PATTERNS/spike notes flag) */
struct BigReturn { uint64_t a; uint64_t b; uint64_t c; };
struct FakeVtbl { void* slots[8]; };
struct FakeIface { struct FakeVtbl* vtbl; };

__declspec(dllexport) uint64_t FakeIface_Get8ByteValue(struct FakeIface* this_, uint64_t argA, uint64_t argB) {
  return argA + 1;
}
__declspec(dllexport) struct BigReturn FakeIface_GetBigReturn(struct FakeIface* this_, uint64_t argA) {
  struct BigReturn r = { argA, argA+1, argA+2 };
  return r;
}
```

`zig cc -target x86_64-windows-gnu -c t_x64.c -o t_x64.o` → **exit 0**, both with zig 0.17.0 (latest) and the repo's exact pinned `0.16.0`; identical disassembly from both.

**Disassembly proof** `[VERIFIED: objdump -d t_x64.o]` — exact bytes observed:

```
0000000000000000 <FakeIface_Get8ByteValue>:
   ...
      a: 48 89 4d 00   movq %rcx, (%rbp)     ; arg1 (this_)   = RCX
      e: 48 89 55 f8   movq %rdx, -0x8(%rbp) ; arg2 (argA)    = RDX
     12: 4c 89 45 f0   movq %r8, -0x10(%rbp) ; arg3 (argB)    = R8
     ...
     23: c3            retq                  ; plain retq — NO "ret N" stack cleanup

0000000000000030 <FakeIface_GetBigReturn>:
     3a: 48 89 c8      movq %rcx, %rax       ; sret pointer (RCX) echoed into RAX
     3d: 48 89 4d 00   movq %rcx, (%rbp)     ; arg1 = RCX = HIDDEN SRET POINTER (not this_!)
     41: 48 89 55 f8   movq %rdx, -0x8(%rbp) ; arg2 = RDX = this_  (SHIFTED from arg1)
     45: 4c 89 45 f0   movq %r8, -0x10(%rbp) ; arg3 = R8  = argA   (SHIFTED from arg2)
```

**The load-bearing finding:** on Win64 there is exactly one calling convention (confirmed — `__thiscall` compiles but has zero effect, `[VERIFIED: t_x64_thiscall.c built clean]`), and the generator's i386 sret handling (hidden pointer passed on the **stack**, `this` always in **ECX**) does **not** carry over. On Win64, when a vtable method returns an aggregate >8 bytes by value, **the hidden return pointer takes the first argument register (RCX) and `this` shifts to the second (RDX)** — every subsequent real parameter shifts one register right. `meta/gen_vtables.ts`'s `isSretReturn()`/`computeRetN()` i386 logic (stack-cleanup byte counting, `ret N`) must **not** be reused verbatim for an x64 target: Win64 never emits `ret N` at all (the caller always cleans its own stack, confirmed by the plain `retq` above), and the sret case needs a register-shift rule the current code has no concept of. This is new generator code, not a flag flip — but it IS tractable (one `if (targetArch === 'x64' && isSretReturn(method))` branch shifting the param-to-register map by one), which is why this is a GO rather than a deferral.

**8-byte register return** is also confirmed directly: `FakeIface_Get8ByteValue` returns a plain `uint64_t` entirely in RAX (`addq $0x1, %rax; retq`) — no EDX:EAX pair split (that split is an i386-only artifact of 32-bit GPRs; x64 GPRs are already 64-bit, so `WIDTH_8_TYPES`'s i386 "needs two registers" logic also does not transfer as-is).

### D-51-14 Nomination: acceptance set

`[VERIFIED: file + objdump against real owned installs]` — see the D-51-15 census table for full symbol lists. Findings:

- **Hoard (63000)** — locked. Already imports all three target bare accessors (`SteamApps`, `SteamUserStats`, `SteamRemoteStorage`) alongside the other five.
- **XCOM: Enemy Unknown (200510)** is the **only other owned title that imports any of the three new interfaces at all**. It imports all three bare accessors (`SteamApps`, `SteamUserStats`, `SteamRemoteStorage`) in one binary — so "one owned title per added interface" cannot be satisfied with three *distinct* titles from this operator's library; XCOM covers all three simultaneously, nothing else comes close. **Caveat:** XCOM also imports 9 `SteamGameServer*` bare symbols (`SteamGameServer`, `SteamGameServer_Init`, `SteamGameServer_Shutdown`, `SteamGameServer_BSecure`, `SteamGameServer_GetSteamID`, `SteamGameServer_RunCallbacks`, `SteamGameServerStats`, `SteamGameServerNetworking`, `SteamGameServerUtils`) which are entirely out of scope (listen-server hosting, not touched by any of the 6 new interfaces) — but Windows PE loading eagerly binds every IAT entry, so **the shim must export these as stubs too or XCOM will not load at all**, per 24-SPEC's "every imported symbol must be exported" constraint. Flag this to the planner as additional stub-export surface, not a reason to drop the nomination.
- **ELEX (411300)** is the one real **Win64-only** title in the census (`steam_api64.dll`, 10 symbols including `SteamInternal_CreateInterface`/`SteamAPI_GetHSteamUser`/`SteamAPI_GetHSteamPipe` — none in any current def file). If the Win64 target is taken (GO, above), ELEX is the natural owned acceptance title for it; none of its 10 symbols are covered today.
- **Avernum 5 (206040) / Avernum 6 (206060)** — regression pair per D-51-14, confirmed to import only the two already-covered lifecycle symbols (`SteamAPI_Init`, `SteamAPI_Shutdown`) in both bottles (legacy `GameLibSteamBridge` and the live `GameLibSteam`).

**Recommended acceptance set:** Hoard (63000, locked) + XCOM: Enemy Unknown (200510, covers all three new client interfaces + surfaces the GameServer-stub requirement) + Avernum 5/6 (206040/206060, regression pair) + ELEX (411300, Win64 acceptance, conditional on the D-51-13 GO being taken). Confirm this list with the user at plan time per D-51-14's explicit requirement.

### D-51-15 Census (produced this session)

Census method: `file` (PE32 vs PE32+) + `objdump --private-headers` directly against the operator's two real CrossOver bottles (`GameLibSteam`, `GameLibSteamBridge`) — every `appmanifest_*.acf` in both bottles' `steamapps/` was enumerated (9 + 3 manifests), and every resulting game's primary `.exe` was scanned. `[VERIFIED: objdump --private-headers, read directly this session against real binaries on this machine]`.

| AppID | Title | Arch | DLL imported | Symbols imported (steam_api only) | Covered by today's 12-export `steam_api.def`? |
|-------|-------|------|---------------|-------------------------------------|------------------------------------------------|
| 206020 | Avernum 4 | PE32 (i386) | `steam_api.dll` | `SteamAPI_Init`, `SteamAPI_Shutdown` | Yes — 2/2 |
| 206040 | Avernum 5 | PE32 (i386) | `steam_api.dll` | `SteamAPI_Init`, `SteamAPI_Shutdown` | Yes — 2/2 |
| 206060 | Avernum 6 | PE32 (i386) | `steam_api.dll` | `SteamAPI_Init`, `SteamAPI_Shutdown` | Yes — 2/2 |
| 63000 | Hoard | PE32 (i386) | `steam_api.dll` | 6 lifecycle (covered) + **8 bare**: `SteamUser`, `SteamUtils`, `SteamFriends`, `SteamApps`, `SteamMatchmaking`, `SteamNetworking`, `SteamRemoteStorage`, `SteamUserStats` | No — 8/14 missing (bare accessors; `importScan.ts`'s `SteamAPI_*`-only regex is also blind to these, passing the coverage check vacuously) |
| 200510 | XCOM: Enemy Unknown | PE32 (i386) | `steam_api.dll` | 8 lifecycle (covered) + **9 client bare** (`SteamApps`, `SteamFriends`, `SteamUser`, `SteamUtils`, `SteamUserStats`, `SteamRemoteStorage`, `SteamMatchmaking`, `SteamMatchmakingServers`, `SteamNetworking`) + **9 GameServer bare** (out of scope, still must be stub-exported) | No — 18/26 missing |
| 38410 | Fallout 2 | PE32 (i386) | *(none)* | No `steam_api*` import found in `fallout2.exe` or `fallout2HR.exe` | N/A — not a Steamworks-using title; trivially bridge-eligible, not useful census data |
| 2706020 | All Will Fall | **PE32+ (x86-64)** | *(none)* | No `steam_api*` import found | N/A — 64-bit but doesn't call Steamworks at all; no shim target needed |
| 411300 | ELEX | **PE32+ (x86-64)** | `steam_api64.dll` | `SteamAPI_Init`, `SteamAPI_Shutdown`, `SteamAPI_IsSteamRunning`, `SteamAPI_RunCallbacks`, `SteamAPI_RestartAppIfNecessary`, `SteamAPI_RegisterCallback`, `SteamAPI_UnregisterCallback`, **`SteamAPI_GetHSteamUser`, `SteamAPI_GetHSteamPipe`, `SteamInternal_CreateInterface`** | No — no x64 def file exists today at all; even the 7 lifecycle-equivalent symbols need a fresh x64 build |
| 2457220 | Avowed | — | — | **Excluded** — Xbox/Microsoft Store GDK package (`MicrosoftGame.config` present, no raw PE32/PE32+ `.exe` anywhere under its install tree); not objdump-able, not bridge-relevant |

**Verdict for the phase-closing re-run (per D-51-15):** of the 7 real, Steamworks-using titles censused (excluding Fallout 2/All Will Fall which don't call Steamworks, and Avowed which has no scannable binary), 3 (Avernum 4/5/6) are already fully covered; Hoard and XCOM need the 6-interface widening; ELEX needs the Win64 target. This is a small, real-machine sample — the phase's own closing re-census (D-51-15) against the full shipped shim is the actual measurement; this is the seed data for D-51-14's nomination, not a substitute for that re-run.

### D-51-06 finding: the pre-install screen is NOT free

`[VERIFIED: games.ts + depot.ts, read directly this session]` — `installBridgeGame()` → `installDepotDownload()` → `runNativeDepotDownload()` → `downloadSteamDepots(appId, opts)` (confirmed by the `[Timing] runNativeDepotDownload: downloadSteamDepots (buildDepotPlan + stream) took...` log line, `games.ts`). `downloadSteamDepots()` (`depot.ts:3472`) itself calls `buildDepotPlan(appId, opts)` at line 3525 as its own first step — there is exactly **one** `buildDepotPlan()` call in the existing path, and it happens **after** the bridge-vs-bottle routing decision has already been made (eligibility is checked before `installBridgeGame()`/`installDepotDownload()` is even called). A D-51-06 pre-install screen therefore requires a **second, additional, separate** `buildDepotPlan(appId, opts)` call before routing — it cannot reuse the real download's plan object, because that plan doesn't exist yet at decision time. The cost is one extra PICS + manifest fetch (no chunk bytes downloaded, per `buildDepotPlan()`'s own doc comment: "the PLAN-BUILDING half only — it never touches disk or the network beyond PICS/manifest fetch") — real but small relative to the download it may save.

### Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Win64 ABI reasoning | A from-scratch guess at register placement | Measure it directly (as this research did) before writing generator code | The sret register-shift rule is non-obvious and silently wrong code would corrupt every struct-returning interface call |
| Ordinal/ordinal-constant sync across 3 files | A fourth hand-maintained copy | Generate `protocol.ts`'s `INTERFACE_ORDINAL` and/or `bridge_helper.c`'s `#define ORDINAL_*` from the manifest set, or add a test that fails if they drift | Already 3 independently-hand-kept locations; a 4th new interface set makes manual sync error-prone |
| 64-bit/bare-accessor import detection | A second bespoke scanner | Widen `importScan.ts`'s existing regex set (heading + symbol patterns) rather than adding a parallel scanning path | One scanner, one source of truth for the eligibility gate |

## Common Pitfalls

### Pitfall 1: Reusing i386 sret/stack-cleanup math for x64
**What goes wrong:** A generator ported "as-is" for x64 would place `this` in RCX unconditionally and try to compute a `ret N` stack-cleanup value that Win64 never uses.
**Why it happens:** The existing `computeRetN()`/`isSretReturn()` functions are correct for i386 `__thiscall` and look reusable but encode an architecture-specific ABI.
**How to avoid:** Branch generator logic on target arch; for x64 sret cases, shift `this` to the second argument register/slot and the hidden pointer to the first; never emit `ret N` for x64.
**Warning signs:** A struct-returning interface call on the x64 target returns garbage/zeroed memory, or crashes with a bad pointer deref inside the helper's response-writing code.

### Pitfall 2: XCOM nomination silently missing GameServer stubs
**What goes wrong:** Shimming only ISteamApps/UserStats/RemoteStorage for XCOM and leaving the 9 `SteamGameServer*` bare names unexported — the exe fails to load entirely (Windows PE import resolution is all-or-nothing per DLL), masking as a "bridge is broken" bug rather than "forgot an out-of-scope stub."
**Why it happens:** Easy to read "P2P/server hosting is out of scope" and assume the symbols can simply be omitted.
**How to avoid:** Export GameServer family names as stubs (same strategy as other unavailable interfaces) even though no real server-hosting logic backs them.
**Warning signs:** XCOM fails to load at all (not a Steamworks error — a loader-level missing-import failure) despite the three target interfaces being correctly implemented.

### Pitfall 3: D-51-16's three dead-Play causes are not equally detectable from logs
**What goes wrong:** Assuming all three causes (self-update relaunch, hidden login window, one-session rule) have equally clean log signatures.
**Evidence (`[VERIFIED: direct tail of a real bottle's bootstrap_log.txt/console_log.txt this session]`):** `bootstrap_log.txt` has a clean, named signal for background self-update checks ("Background update loop checking for update...", "Nothing to do" / "Download skipped by HTTP 304 Not Modified" when current — an actual update-and-relaunch sequence would show different text in the same log). `console_log.txt` showed `LogonFailure No Connection` and repeated `Could not bind socket to 0.0.0.0:27036: 10048` (a separate IPC-port-in-use condition) in this machine's real log, but **neither of these maps cleanly to "hidden login window" or "the one-session rule"** — no dedicated, unambiguous line for either of those two causes was found in this session's sample.
**How to avoid:** Treat cause 1 (self-update) as log-detectable (CITED evidence above); treat causes 2 and 3 as **open questions** requiring either a live-gated reproduction (force a one-session conflict, force a login-window state) or acceptance that the UI can only say "Waiting for Steam…" generically for those two.
**Warning signs:** A D-51-16 implementation that confidently names "hidden login window" or "one-session rule" as the specific cause without having reproduced and captured that exact log signature live.

### Pitfall 4: Zig version drift between prototype and pinned toolchain
**What goes wrong:** Verifying the Win64 build against whatever zig happens to be on a dev machine instead of the exact pinned version `meta/downloadZig.ts` uses (`ZIG_VERSION = '0.16.0'`).
**How to avoid:** This research explicitly re-ran the build and disassembly against the exact pinned 0.16.0 tarball (not just the newest 0.17.0) and confirmed identical output — the planner should still gate `buildSteamBridgeShims.ts`'s real-compile-gate test on this exact pin, not "zig, whatever version."

## Code Examples

### Existing `notify()`/`showDialogBoxModalAuto()` signatures (D-51-02/05/08)
```typescript
// Source: src/backend/dialog/dialog.ts (read directly this session)
function showDialogBoxModalAuto(props: { /* ... */ }) { /* ... */ }
function notify({ body, title }: NotifyType) { /* ... */ }
export { showDialogBoxModalAuto, notify }
```

### Existing per-game bridge bottle resolver (D-51-01/12 integration point)
```typescript
// Source: src/backend/storeManagers/steam/bottle.ts (read directly this session)
export function bridgeBottleNameFor(appId: string): string | null {
  if (!NUMERIC_APP_ID.test(appId)) return null
  return `${DEFAULT_BRIDGE_BOTTLE_NAME}-${appId}`
}
// resolveBridgeBottleName(appId): per-game bottle wins if ready; else legacy
// shared bottle wins ONLY if it holds appmanifest_<appId>.acf; else the
// not-yet-provisioned per-game name is returned anyway. New installs never
// call this resolver — they target bridgeBottleNameFor() directly.
```

## State of the Art

| Old Approach | Current Approach (this phase) | When Changed | Impact |
|--------------|------------------|---------------|--------|
| One shared, long-lived helper, AppID always 480 | Per-launch helper, real AppID, 480 only as a fallback | D-51-01 (supersedes Phase 24 D-03/D-04) | ISteamApps/UserStats/RemoteStorage answer truthfully; Mac Steam shows In-Game/playtime |
| Static 2-game JSON allowlist | seed ∪ persisted-verdict ∖ known-bad ∖ forced-bottle | ROADMAP Phase 51 sub-decision 3 | Eligibility becomes scan-derived and self-healing (D-51-07) instead of a manually-edited list |
| `importScan.ts` scans only `SteamAPI_*` against a literal `steam_api.dll` heading | Must widen to bare accessors + `SteamInternal_*`/`GetHSteamUser`/`SteamClient`, and fail closed on `steam_api64.dll` | Claude's Discretion item, this phase | Closes the vacuous-pass hazard this research measured directly against Hoard and XCOM |

**Deprecated/outdated:** The Phase 24 "one helper, one AppID" model is explicitly reversed by D-51-01 — do not re-propose it.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The disassembly evidence from a minimal synthetic C file (not the real generator output) generalizes to the actual `gen_vtables.ts`-emitted code for all 6 new interfaces | D-51-13 Verdict | A real interface with a more complex parameter mix (e.g. a method with 5+ args, or a `CSteamID`/`uint64` arg mixed with a struct arg) could hit a register/stack-spill boundary this minimal test didn't exercise — mitigate with the same real-compile-gate pattern `buildSteamBridgeShims.test.ts` already uses, extended to x64 |
| A2 | D-51-16's "hidden login window" and "one-session rule" causes are distinguishable from `bootstrap_log.txt`/`console_log.txt` at all | Pitfall 3 | If neither cause ever gets a clean log signature, D-51-16's UI can only ever say "Waiting for Steam…" generically, not name a specific likely cause — may need a live reproduction session rather than static log reading |
| A3 | The operator's owned-library census (8 Steamworks-relevant titles, 2 real bottles) is representative enough to seed D-51-14's nomination | D-51-14 Nomination | This is explicitly a small, single-operator sample; the phase's own closing re-census (D-51-15) against the shipped shim is the real measurement, not this seed data |

**If this table is empty:** N/A — see rows above.

## Open Questions

1. **Known-bad list schema (`version: 2` of `bridge-allowlist.json`)**
   - What we know: the current schema is `{version: z.literal(1), games: [{appId, title, note?}]}` `[VERIFIED: allowlist.ts, read directly]`; D-51-08 needs a reason field (DRM-wrapped, 64-bit only, …) per known-bad entry.
   - What's unclear: whether the seed list and the known-bad list are one file with a discriminator or two separate files.
   - Recommendation: two arrays in one versioned file (`seed: [...]`, `knownBad: [{appId, title, reason}]`) keeps a single zod schema and a single fail-loud load, consistent with the existing module's static-JSON-import pattern (electron-vite `__dirname` hazard noted in CONTEXT.md).

2. **Route-visibility frontend surfaces (D-51-09/10)**
   - What we know: `steamEligibilityProbe.ts`, `steamSectionGating.ts`, `steamBottleDefaults.ts` are the named integration points (CONTEXT.md); not read this session.
   - What's unclear: their exact current shape/props, and whether the new verdict/reason string threads through cleanly or needs a new IPC field.
   - Recommendation: planner should budget a read-through of these three files as a first planning task before designing the UI change.

3. **Helper-side dispatch generation shape**
   - What we know: the helper hand-`dlsym`s each method today (2 interfaces, ~3 real slots); CONTEXT.md flags this as needing to become manifest-driven for 8 interfaces / dozens of slots.
   - What's unclear: whether the generator should emit the C dispatch switch (current pattern, scaled up) or whether a manifest-driven runtime dispatch table (array of function pointers indexed by ordinal/slot, populated by a generated init function) is cleaner at this new scale.
   - Recommendation: lean toward a generated static dispatch table (array-of-structs keyed by ordinal/slot, each entry a `dlsym`'d pointer + arg-marshal function pointer) over a hand-growing switch statement — this is a planning-level design choice, not resolved by this research.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| zig (pinned) | PE shim cross-compile (`build-steam-bridge`) | ✓ (downloaded to scratchpad and verified this session; CI/dev machines fetch it via `meta/downloadZig.ts`) | 0.16.0 (pinned) | — |
| objdump | Import census, per-game scan during research/planning | ✓ (Apple LLVM 21.0.0 at `/usr/bin/objdump`) | — | — |
| CrossOver | Running the real per-game bottles for live gates | ✓ (two real bottles present on this machine: `GameLibSteam`, `GameLibSteamBridge`) | — | — |
| Real owned Steam titles for acceptance testing | D-51-14 acceptance set | ✓ — Hoard, Avernum 4/5/6, XCOM: Enemy Unknown, ELEX, All Will Fall, Fallout 2 all confirmed installed on this machine this session | — | — |

**Missing dependencies with no fallback:** none identified.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.x + ts-jest (`jest.config.js`, `projects: [src/backend, src/common, src/frontend, src/preload, meta]`) |
| Config file | `/Users/graysonmitchell/Projects/GameLib/jest.config.js` (root) and `meta/jest.config.js` |
| Quick run command | `pnpm jest src/backend/storeManagers/steam/bridge --silent` (scoped to the bridge module's existing 6 test files) |
| Full suite command | `pnpm test:ci` (`jest --maxWorkers=2 --silent`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-51-13 | x64 shim object compiles with correct sret register shift | unit (new) | `pnpm jest meta/__tests__/buildSteamBridgeShims.test.ts -x` (extend existing real-compile-gate test with an x64 target leg) | ❌ Wave 0 — extend existing file, don't create new |
| D-51-15 | `importScan.ts` detects bare accessors + `steam_api64.dll` heading, fails closed | unit | `pnpm jest src/backend/storeManagers/steam/bridge/__tests__/importScan.test.ts -x` | ✅ file exists; extend fixtures |
| D-51-07 | Persisted verdict carry-forward on `steamMetadataStore.set` | unit | New test alongside existing `CacheStore`/`electronStores` coverage | ❌ Wave 0 |
| D-51-01 | Per-game helper port allocation, no port collision across 2 simultaneous launches (D-51-03) | unit + integration | `pnpm jest src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts -x` (extend) | ✅ file exists; extend for multi-instance |
| Gate 4 re-run | Hoard playable through the bridge with the widened interface set | manual-only (live gate, real CrossOver + real signed-in Mac Steam) | N/A — see `.planning/quick/261016-wsq-run-the-per-game-bridge-bottles-live-gat/` for the rig to reuse | N/A |
| D-51-14 | Acceptance set (Hoard + XCOM + Avernum 5/6 [+ ELEX if Win64 taken]) launches cleanly | manual-only (live gate) | Reuse the `261016-wsq` rig, extended to the new titles | N/A |

### Sampling Rate
- **Per task commit:** `pnpm jest src/backend/storeManagers/steam/bridge --silent`
- **Per wave merge:** `pnpm test:ci`
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus the Gate 4 live-gate re-run (cannot be automated — requires a real signed-in Mac Steam client and real CrossOver bottles, exactly as Phase 24's own UAT required).

### Wave 0 Gaps
- [ ] Extend `meta/__tests__/buildSteamBridgeShims.test.ts` with an x64 real-compile-gate leg if D-51-13's GO is taken.
- [ ] New test file/suite for D-51-07's persisted-verdict carry-forward (no existing coverage of a NEW `steamMetadataStore` field's carry-forward beyond `forcedWindowsViaBottle`/`platformsSource` precedent).
- [ ] Extend `src/backend/storeManagers/steam/bridge/__tests__/importScan.test.ts` fixtures with a `steam_api64.dll`-heading case and a bare-accessor case (Hoard/XCOM-shaped, using the existing `fixtures/objdumpImports.ts` pattern).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | The bridge never replicates auth — it proxies the already-signed-in native Mac Steam client; no credential handling added by this phase |
| V4 Access Control | Yes | Loopback-only bind (127.0.0.1) is the existing control (Phase 24 D-24 precedent); per-game helper spawn (D-51-01) must preserve loopback-only binding per helper, and must allocate ports without creating a predictable/guessable scheme that a local process could pre-bind to hijack a helper's port |
| V5 Input Validation | Yes | Wire frame (`protocol.ts`) already validates frame length (`MAX_FRAME_BYTES`) and throws `FrameTooLargeError`/`FrameTruncatedError`; widening to 8 interfaces must extend validation to the new ordinals/slots rather than trusting them |
| V6 Cryptography | No | Nothing new — no new secrets, tokens, or crypto surfaces introduced by this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A local process on the same machine binds the helper's port first (port-allocation race under D-51-01's multi-helper model) | Denial of Service | Bind loopback-only, check bind success explicitly, surface a visible failure (D-06 precedent) rather than silently proceeding |
| A malformed/oversized frame from a compromised or buggy bottle PE shim | Tampering / DoS | Already enforced — `protocol.ts`'s `MAX_FRAME_BYTES` + explicit error types; extend, don't bypass, for the 6 new interfaces |
| GameServer-family stub symbols silently exported with real-looking behavior instead of honest stubs | Spoofing (misleading the game into thinking server hosting works) | Export GameServer symbols (XCOM finding, above) as unambiguous stubs that fail/return-unavailable, never as partially-working server logic (out of scope per 24-SPEC) |

## Sources

### Primary (HIGH confidence)
- Direct `Read` of `meta/gen_vtables.ts` (568 lines, full), `native/steam-bridge/helper/bridge_helper.c` (517 lines, full), `src/backend/storeManagers/steam/bridge/{protocol,helperProcess,importScan,shimGenerate,allowlist}.ts`, `src/backend/storeManagers/steam/{games,depot,electronStores,bottle}.ts` (scoped sections), `src/backend/dialog/dialog.ts`, `meta/buildSteamBridgeShims.ts`, `meta/downloadZig.ts`, `jest.config.js`, `package.json` — all this session.
- `[VERIFIED: zig cc -target x86_64-windows-gnu]` — real build + `objdump -d` disassembly, this session, scratchpad only, against both zig 0.17.0 and the exact pinned `0.16.0`.
- `[VERIFIED: objdump --private-headers]` against 9 real PE binaries across the operator's two real CrossOver bottles (`GameLibSteam`, `GameLibSteamBridge`) on this machine, this session.
- `.planning/milestones/v0.7-phases/24-macos-native-steam-bridge-out-of-process-steam-api-proxy/24-UAT.md` — D-UAT-24-09 Hoard finding (verbatim quote carried forward, independently re-confirmed by this session's own objdump run against the same binary).

### Secondary (MEDIUM confidence)
- `.claude/skills/spike-findings-gamelib/references/macos-steam-bridge.md` — spike blueprint (004–008), read in full this session.
- `.planning/research/STEAM-STACK.md` — frozen stack confirmation.
- `.planning/ROADMAP.md` § Phase 51 — locked interface order and phase boundary.

### Tertiary (LOW confidence)
- Real-machine log tail of `bootstrap_log.txt`/`console_log.txt` — a single snapshot in time, not a reproduction of any of the three specific dead-Play failure modes; see Assumption A2.

## Metadata

**Confidence breakdown:**
- D-51-13 (Win64 go/no-go): HIGH — measured directly, build + disassembly, against the exact pinned toolchain version.
- D-51-14/15 (acceptance set / census): HIGH for the data gathered (real binaries, real bottles, this machine); MEDIUM for its sufficiency as a nomination (single-operator sample, explicitly flagged as seed data pending the phase's own closing re-census).
- D-51-06 (pre-install screen cost): HIGH — traced the exact call chain by direct read, confirmed no existing reuse path.
- D-51-16 (dead-Play log detection): LOW-MEDIUM — one of three causes has a clean log signal; the other two are open questions.
- Architecture/generator extension design: MEDIUM — grounded in direct code reads, but the x64 generator change itself is unwritten; this is the planner's and executor's work, not yet code.

**Research date:** 2026-10-17
**Valid until:** 30 days (stable domain — no external API/library versions at risk of drift; the pinned zig toolchain and the operator's owned-library census are the only time-sensitive inputs, and both are explicitly version-pinned/snapshotted in this document)
