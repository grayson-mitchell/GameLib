---
phase: 67-schema-validation-at-the-sidecar-ipc-boundary
plan: 09
subsystem: ipc
tags: [ipc, zod, runnerAuth, oauthLogin, humbleLogin, storeEmbed, credentials]
requires: [67-05, 67-07]
provides: [runnerAuthAsyncArgs, runnerAuthSyncArgs, oauthLoginAsyncArgs, humbleLoginAsyncArgs, humbleLoginSyncArgs, storeEmbedAsyncArgs, storeEmbedSyncArgs]
key-files:
  created:
    - src/backend/sidecar/__tests__/ipcSchemas/runnerAuth.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/oauthHumbleLogin.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/storeEmbed.test.ts
  modified:
    - src/common/types/ipc/runnerAuth.ts
    - src/common/types/ipc/oauthLogin.ts
    - src/common/types/ipc/humbleLogin.ts
    - src/common/types/ipc/storeEmbed.ts
    - src/common/types/ipc/channelSchemas.ts
    - src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts
    - src/backend/sidecar/__tests__/humbleFlows.test.ts
decisions:
  - "oauthCaptureLogin url is urlArg(), not httpUrlArg(): the handler's https check answers with a typed error outcome that a boundary reject would replace (D-05, scheme allow-list is Phase 72)"
  - "storeEmbed bounds use the real keys x/y/w/h (strict), w/h non-negative; x/y unconstrained because bounds are courier-only"
  - "runnerAuthFlowRegistration typeof checks left in place as redundancy"
metrics:
  completed: 2026-11-08
requirements: [V67-B, V67-C, V67-D]
---

# Phase 67 Plan 09: credential and embed domains Summary

runnerAuth (10 invoke + 1 send), oauthLogin (1), humbleLogin (3 + 1) and storeEmbed (9 + 1) now carry strict zod schemas with `z.input`-derived types; credential tokens are bounded non-empty strings and sentinel tests prove rejections never echo a credential value.

## Commits
- e8264c6cc: runnerAuth, oauthLogin, humbleLogin (14 invoke, 2 send): CEILING invoke 159->145, send 37->35
- 2775dbb8d: storeEmbed (9 invoke, 1 send): CEILING invoke 145->136, send 35->34
- follow-up test commit: humbleFlows.test.ts malformed-args case

Ceiling totals: invoke 159->136 (23), send 37->34 (3); push, testOnly, local unchanged.

## Verification
- Fixture suites, runnerAuthFlows, humbleLoginFlows, storeEmbedFlows, ipcDomainCensus, ipcSchemaCoverage, flowRegistrationCensus, rendererZodGuard, `pnpm codecheck`, prettier and `pnpm check:ipc-contract` green.
- Full `src/common`, `src/backend/{store,humble,sidecar,storeManagers/nile}` run: 301 suites passed. Meta run shows only the known failures (genI18nGateScope A-17, logSecretGate x2).
- No `*FlowRegistration.ts` changed.

## Deviations from Plan
**1. [Rule 1 - Bug] humbleFlows.test.ts.** The humbleRevealKey `[]` case expected the handler's `{status:'failed'}`; the boundary now rejects it as ok:false. Test updated to assert the boundary rejection and that the RPC loop keeps serving.
**2. oauthCaptureLogin runner/url.** Runner is `z.enum`, url is `urlArg()` (not https-only) so the handler's typed error outcome stays authoritative.

## Known Stubs
None.

## Self-Check: PASSED
