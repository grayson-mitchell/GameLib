# Phase 52 deferred items

## Deferred by decision (recorded by 52-10)

1. **x86 `steamclient.dll`, x86 SteamClient manifests, and the `SteamClientDll` (32-bit) registry value** (decision 6).
   Reason: Grim Dawn is x64; only `steamclient64.dll` and `SteamClientDll64` are built and written.
   Revisit when: an x86 SteamStub title needs the forwarder (`setupSteamClientForwarder` returns
   `unavailable: x86-deferred` today).
2. **An `ActiveProcess\pid` writer** (decision 1). Reason: writing a pid would make the stub believe a
   Windows Steam client process exists; only the user may authorize it. Revisit when: a 52-11 round
   shows the stub reading `ActiveProcess` value `pid` (protocol item (e)), and only via a user decision.
3. **The log-only CONTROL "note" slot for shim-local ISteamClient calls** (decision 2). Reason: the
   shim-local stubs (slots 7, 21, 31, 32, 33) are unobservable today. Revisit when: a 52-11 round exits
   silently after the last FWD line; then it is that round's permitted change (protocol (c)).
4. **`SetLocalIPBinding` stays a local stub.** Reason: the manifest signature is `(uint32,uint32)` while
   the flat export takes `const SteamIPAddress_t &`; forwarding would need a hand-written marshal.
   Revisit when: evidence shows a title depends on the call.
5. **Shim-hosted `CreateInterface` simplification** (RESEARCH Q4). Reason: only valid if the DLL naming
   proves irrelevant to the stub. Revisit when: the live gate passes and the forwarder DLL looks
   removable.
6. **Unproxied-but-native-present versions return NULL** (assumption A2). Reason: no proxy is served for
   them. Revisit when: a FWD line shows `native=present` for a version outside
   `SHIM64_SERVED_INTERFACE_VERSIONS` (protocol (a)).

7. **Gap 5 (SteamStub Application Load Error 3) not closed by 52-22; operator chose option-other (52-UAT item 16).**
   No code option targets the one direct input (the stub reads all 186368 bytes of the forwarder before the
   MessageBox, 52-19 cxlog:7170-7181). No change was made. Next step: another planning round
   (`/gsd-plan-phase 52 --gaps`) to establish what the stub checks in the forwarder bytes. 52-23 item 19
   hygiene delta: none.
   52-26 (item 22): option-versioninfo, implemented (GameLib-string VS_VERSIONINFO on the forwarder; acceptance by the stub unverified until 52-27).

## Deferred from the 52 code review (recorded by 52-16)

Reason for all entries: orchestrator decision 4 -- hardening, not goal-blocking.

1. **WR-05: stale HKCU `SteamClientDll64` across titles in a shared bottle; never cleaned up.**
   `steamClientSetup.ts:180-225`, `games.ts:2958-2986`. Revisit when: a second title shares a bridge
   bottle with a SteamStub title.
2. **WR-06: overwrites a game-shipped `steamclient64.dll` with no backup; follows a symlink write.**
   `steamClientSetup.ts:158-161`. Revisit when: a title ships its own `steamclient64.dll`.
3. **WR-07: forwarded `ISteamClient` lifecycle methods act on the helper's native pipe and user with
   the game's hard-coded 1/1 handles (scope widened by 52-20, WR-09).** `meta/gen_vtables.ts:2003-2190`. Revisit when: any x64
   bridge title, not only a forwarded one, loses wire calls mid-session, or any helper log shows a
   FWD line for ReleaseUser, BReleaseSteamPipe or BShutdownIfAllPipesClosed. Since 52-20, off the
   SteamStub path these eight SteamClient017/014 methods answer their pre-phase local values
   (WR-09), so the residual exposure is SteamStub-path titles; the condition stays wide because the
   population was misjudged once.
4. **WR-08: identity-only gate bypass through `GetISteamGenericInterface` and CONTROL slot 3.**
   `meta/gen_vtables.ts:1980-1984, 2026-2030`, `bridge_helper.c:486-518`. Revisit when: before any
   app-scoped family goes wire in identity-only mode.
5. **IN-01: static request buffer and hello flag in `GameLibBridge_CreateInterface`.**
   `meta/gen_vtables.ts:761-783`. Revisit when: a SteamStub check thread and a game thread are seen
   corrupting a CREATE_INTERFACE request.
6. **IN-02: duplicate sanitizer and containment helpers.** `bridge_helper.c:425-432`,
   `importScan.ts:74` vs `steamClientSetup.ts:37`. Revisit when: one copy is changed and the other
   drifts, or the next edit to either file.
7. **IN-03: import closure misses delay imports and is case-sensitive.** `importScan.ts:100, 110-117`.
   Revisit when: a title on a case-sensitive volume or with a delay-importing closure DLL shows no shim.
8. **IN-04: the forwarder takes a new LoadLibrary reference on every failed resolve.**
   `steamclient_fwd.c:35-43`. Revisit when: a "wrong steam_api loaded" condition needs diagnosing.
9. **WR-01 residual: orphaned reg-add child after a timeout.** After a reg add times out, the
   `runWineCommand` child (wine reg.exe) stays an in-flight referenced handle that its API cannot
   kill. That is sidecar exit contract half 2, which `unref()` does not cover. Revisit when: if
   sidecar exit is slow after a timed-out reg add.
10. **52-13 risk: x64/Engine.dll names versions the x64 shim does not serve** (SteamClient023,
    SteamFriends018, SteamUtils011, STEAMAPPS_INTERFACE_VERSION009, STEAMUSERSTATS_INTERFACE_VERSION013,
    SteamMatchMakingServers003). On the SteamStub-active path a forwarded GetISteam* for one of them
    returns NULL (item 6 above, A2). Revisit when: the 52-17 re-gate shows a fault after the FWD lines.

## Behaviors that differ from the plans (carried from earlier summaries)

- 52-07: `FindOrCreateGameServerInterface` falls back to the null object and `ContextInit` uses a global
  counter (quick 261024-i94 semantics), not the plan-07 behavior (NULL / constant counter).
- 52-08/52-09: a SteamStub title whose shim verdict is `withheld` carried no `drmWrapper` and no notice.
  RESOLVED by 52-15 (shimGenerate stamps `drmWrapper`/`exeArch` on withheld results) and 52-16 (the
  `steamstub-unforwarded:withheld` notice cause).
- 52-02: the helper's CREATE_INTERFACE real-profile (native=present) path was deferred to this live gate.
- 52-03: `steamclient64.dll` has never been loaded in a Wine bottle before this gate.

## Out of scope: pre-existing failures found during the desk gate (not phase 52)

- `src/backend/sidecar/__tests__/testContainment.test.ts`: `steamNativeInstallDefault.test.ts` is
  unclassified (added by quick 261024-exo).
- `meta/__tests__/findDeadcode.test.ts`: used-in-module findings for `DelayImportDll` /
  `DelayImportPeOptions` (quick 261024-j4l) and `CrossoverInstallRisk` in `crossoverInstallRisk.ts`.
- `meta/__tests__/genI18nGateScope.test.ts` A-17: `meta/i18nForkTouchedFiles.json` is stale
  (`resolveBootLanguage.ts`, `SteamBridgeRouteNotice.tsx` and others missing).
- `meta/__tests__/machineFillGamelib.test.ts`: `pluralCategoriesFor` returns ICU category order that
  differs from the tests' expectation (three tests).
- `pnpm lint`: tests-scope warning cap exceeded at the pre-phase base too.
