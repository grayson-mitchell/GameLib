---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 20
subsystem: steam-cm
tags: [steam, rust-cm, sign-in, qr, typescript]
requires: [79-17, 79-03]
provides:
  - "userSignIn.ts on two engines behind GAMELIB_STEAMCM_SIGNIN"
  - "SignInSession ts|rust union in userSignInState"
  - "QR redraw on a rotated challengeUrl (CF-08)"
affects: [79-25]
key-files:
  modified:
    - src/backend/storeManagers/steam/userSignIn.ts
    - src/backend/storeManagers/steam/userSignInState.ts
    - src/backend/sidecar/bootstrap.ts
    - src/common/types/ipc/steamAuth.ts
    - src/frontend/screens/Login/components/SteamLogin/index.tsx
  created:
    - src/backend/storeManagers/steam/__tests__/userSignIn.rustEngine.test.ts
    - src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginQrRotation.test.ts
decisions:
  - "Done-handling is memoised on the rust slot (finalize promise), so concurrent polls or a poll racing a submit store the token once."
  - "Wait loops are unref'd 1 s reads capped at 200 iterations (above Rust's 180 s deadline); they also stop if the slot was replaced or reset."
metrics:
  tasks: 2
  completed: 2026-11-15
---

# Phase 79 Plan 20: Rust-engine Steam sign-in Summary

With `GAMELIB_STEAMCM_SIGNIN=rust`, QR, credentials and guard-code sign-in run through the Rust Web API flows. TS keeps the token store, the sign-in policy and the UI contract.

## Commits

- acee234ec feat(79-20): rust-engine Steam sign-in (task 1)
- see git log for the task 2 commit (QR redraw)

## Behaviour

- Rust done path: `setToken` first, then `isLoggedIn`, `credentialsMissing` cleared, `noteSignInSucceeded('steam')`, then the profile through `acquireAuthenticatedWithToken` with the 5 s persona bound. An unsupported or failed persona falls back to the account name (shared `resolveProfile` core, also used by the ts engine).
- `pollQRLogin` returns `challengeUrl` only when it differs from the last one returned. `SteamLogin` feeds each poll through the pure `nextQrChallengeUrl` and the QR redraws.
- A wrong guard code (EResult 65) returns `error` and leaves the flow open for a second submit.
- Logging: EResult numbers and reason kinds only; a logger-spy test asserts the password, code and token never appear.

## Deviations from Plan

**1. [Rule 3 - Blocking] bootstrap.ts touched.** `resetSignInState` has no transport, so `createSteamSignInState` takes an optional `cancelRustFlow` callback that bootstrap wires to `steamcm_signin_cancel` (fire-and-forget). Without it a sign-out would leave a rust flow running.

**2. Component test is a pure-function test.** The frontend jest project is DOM-less (node env), so the redraw decision is the exported `nextQrChallengeUrl` plus a source gate on the call site, not a mounted render.

**3. `UserSignInDeps` gains `RustInvokeDeps`.** `managerDepsFromServices` already supplies it. The poll and submit functions take `Pick<'steamSession'> & Partial<UserSignInDeps>` so ts-engine callers and existing tests are unchanged.

## Verification

jest: userSignIn.rustEngine (12), steamAuthFlows, user, credentialsMissing, steamAuthSessionPolicy, diPhaseGates, keyringTokenStore (no `process.env` in userSignIn.ts), Login screens (220) all pass; `pnpm tsc --noEmit` clean; prettier clean on the touched files. No live sign-in was run.

## Known Stubs

None.

## Self-Check: PASSED
