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

## Behaviors that differ from the plans (carried from earlier summaries)

- 52-07: `FindOrCreateGameServerInterface` falls back to the null object and `ContextInit` uses a global
  counter (quick 261024-i94 semantics), not the plan-07 behavior (NULL / constant counter).
- 52-08/52-09: a SteamStub title whose shim verdict is `withheld` carries no `drmWrapper`, takes the
  direct-launch branch with no forwarder and no notice. Follow-up if wanted: stamp `drmWrapper` on
  withheld results and add a notice cause.
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
