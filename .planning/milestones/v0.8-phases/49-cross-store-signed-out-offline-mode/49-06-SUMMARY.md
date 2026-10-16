---
phase: 49-cross-store-signed-out-offline-mode
plan: 06
subsystem: auth
tags: [sign-in-probe, steam, humble, keyring, boot-probe, auth-trigger, epoch-fence, sidecar]

requires:
  - phase: 49-cross-store-signed-out-offline-mode
    provides: "SignInProbeOutcome type (49-01); noteSignInSucceeded / noteSignedOut and the epoch fence (49-04)"
provides:
  - "SteamAuthTrigger 'boot-probe': deliberate, sticky, backend-only (not in ORIGIN_TO_TRIGGER)"
  - "SteamUser.probeCredentialPresence: one labelled keyring read, no CM connection, outcome only"
  - "HumbleSecretStore.readSecret?(key, context) and SidecarHumbleSecretStore.readSecret forwarding a trigger label"
  - "HumbleUser.probeSession(context): humble-session read plus getGamekeys, no csrf read, no hidden webview, outcome only"
  - "checkHealthAndFlagExpiry returns SignInProbeOutcome (built on probeSession) with its old effects intact"
  - "Sign-in and sign-out epoch hooks for Steam (finishAuth, QR success, logout) and Humble (finishLogin, disconnect)"
affects: [49-07, 49-08, 49-09, 49-11, 49-12]

actuals:
  tokens: 9244
  tasks: 2
  commits: 5

plan_head_before: 5b986abc3b549ee90a8c4015157c0a21fc986b73
plan_head_after: ec5bc645992700495f746dd83a93ae3776ed7c63

tech-stack:
  added: []
  patterns:
    - "Probe = read the credential once under a never-secret trigger label, map to healthy/expired/unknown, return an outcome and write nothing; the pass applies the verdict"
    - "Optional three-state read (readSecret?) on a seam interface with a getSecret fallback, so a store that cannot prompt (dev vault, Electron) need not implement it"
    - "A channel whose wire contract is Promise<void> drops a newly returned outcome at the handler instead of changing the contract"

key-files:
  created:
    - src/backend/storeManagers/steam/__tests__/probeCredentialPresence.test.ts
    - src/backend/humble/__tests__/probeSession.test.ts
  modified:
    - src/backend/storeManagers/steam/authTrigger.ts
    - src/backend/storeManagers/steam/user.ts
    - src/backend/humble/secretStore.ts
    - src/backend/sidecar/humbleSecretStore.ts
    - src/backend/humble/user.ts
    - src/backend/humble/ipc_handler.ts
    - src/backend/sidecar/humbleFlowRegistration.ts
    - src/backend/storeManagers/steam/__tests__/authTrigger.test.ts
    - src/backend/storeManagers/steam/__tests__/credentialsMissing.test.ts
    - src/backend/storeManagers/steam/__tests__/user.test.ts
    - src/backend/sidecar/__tests__/humbleSecretStore.test.ts
    - src/backend/humble/__tests__/user.test.ts
    - src/backend/sidecar/__tests__/humbleFlows.test.ts

key-decisions:
  - "Quick task 260817-d61's Steam keyring deferral is reversed on purpose for a signed-in account: once the pass notes 'boot-probe', the gate stays unlocked for the process, so a later automatic SteamLibraryManager.refresh() may open a CM connection where it used to skip. The first boot refresh normally still sees the gate locked (its runOnceWhenOnline is registered before the pass's connectivity listener). Recorded in authTrigger.ts's header (D-14)."
  - "A signed-out Steam account returns unknown before noteSteamAuthTrigger, so it never unlocks the gate; the probe itself never calls ensureConnected or constructs a steam-user client (D-21)."
  - "A Humble absent session slot is unknown, not expired (A9): an empty slot behind a connected flag is not proof of expiry. Humble unreadable and Steam unreadable are unknown too (P1, 260822-vov)."
  - "probeSession logs only err.message on a thrown getGamekeys, not the error object, so an HTTP error object can never carry the cookie into a log line (T-49-17)."
  - "checkHealthAndFlagExpiry keeps its effects but is no longer the read path: it calls probeSession('humble-health-check'). The humbleCheckHealth channel stays registered and its wire contract stays Promise<void> (both registrations drop the returned outcome)."
  - "keyringTokenStore.ts needed no change: SidecarKeyringSlotStore.readToken(context) already stamps trigger=<context> on every issue, cache, join and memo line."

patterns-established:
  - "A discriminating label assertion: the test that proves trigger=boot-probe is paired with a no-context call asserting trigger=unspecified, so the assertion cannot pass vacuously"

requirements-completed: [R2, R3]

coverage:
  - id: D1
    description: "Steam boot read goes through authTrigger: 'boot-probe' is deliberate and sticky, 'startup' still never unlocks, and no renderer origin can produce 'boot-probe'"
    requirement: R2
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/authTrigger.test.ts (boot-probe trigger describe, 6 tests; every pre-existing case unchanged)"
        status: pass
    human_judgment: false
  - id: D2
    description: "SteamUser.probeCredentialPresence reads the keyring once under boot-probe, maps present/absent/unreadable to healthy/expired/unknown, never connects to CM and writes nothing"
    requirement: R2
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/probeCredentialPresence.test.ts (10 tests incl. timeout and denied reasons, ensureConnected and steam-user constructor spies, no configStore writes)"
        status: pass
    human_judgment: false
  - id: D3
    description: "HumbleUser.probeSession decides from one labelled session read plus getGamekeys; only session_expired is expired; unreadable, absent, thrown, access_denied and schema_error are unknown; no csrf read and no hidden webview"
    requirement: R2
    verification:
      - kind: unit
        ref: "src/backend/humble/__tests__/probeSession.test.ts (verdict mapping, slot read, dev-vault fallback, and a never-do table across healthy, expired, absent and unreadable)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The Humble pass read carries trigger=boot-probe through readSecret into SidecarKeyringSlotStore.readToken, with a no-context variant proving the assertion discriminates"
    requirement: R2
    verification:
      - kind: unit
        ref: "src/backend/sidecar/__tests__/humbleSecretStore.test.ts (readSecret describe, 6 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Steam and Humble sign-in success call noteSignInSucceeded and their sign-out paths call noteSignedOut, so a probe begun before a sign-in cannot re-latch"
    requirement: R2
    verification:
      - kind: unit
        ref: "steam credentialsMissing.test.ts (finishAuth, QR success, logout) and humble user.test.ts (startLogin success, disconnect)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The retained humbleCheckHealth path keeps its expiry flag, humbleAuthState push and csrf backfill while returning the outcome"
    requirement: R3
    verification:
      - kind: unit
        ref: "src/backend/humble/__tests__/user.test.ts (checkHealthAndFlagExpiry cases incl. the seam backfill describe) and src/backend/sidecar/__tests__/humbleFlows.test.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: "No macOS Keychain prompt is raised by the Steam or Humble boot read beyond the one labelled keyring_get each, and the prompt is attributable as trigger=boot-probe"
    verification: []
    human_judgment: true
    rationale: "A Keychain prompt cannot be observed on this Windows host. Only the structural facts are pinned (one read per slot, the label, no csrf read, no webview, no CM connect); whether macOS actually raises a prompt is owned by the 49-11 / 49-12 live gate."

duration: 12min
completed: 2026-10-09
status: complete
---

# Phase 49 Plan 06: Steam and Humble boot probes Summary

**Steam gets a deliberate sticky `'boot-probe'` trigger and a keyring-only presence probe that never opens a CM connection, Humble gets a labelled `humble-session` read plus a `getGamekeys` verdict that never touches csrf or a webview, and both stores' sign-in and sign-out paths now fence older probes through the epoch.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-09T11:36:14Z
- **Completed:** 2026-10-09T11:48:33Z
- **Tasks:** 2
- **Files modified:** 15 (2 created, 13 modified)

## Accomplishments

- `authTrigger.ts` gains `'boot-probe'` in the type and in `DELIBERATE_TRIGGERS`, stays a leaf with zero imports, and leaves `ORIGIN_TO_TRIGGER` untouched with a comment forbidding a renderer mapping (T-49-16). `mapRefreshOriginToTrigger('boot-probe')` and a renderer dispatch carrying that origin both stay locked, and `'startup'` still never unlocks.
- The 260817-d61 reversal is written into `authTrigger.ts`'s header and decided in prose: for a signed-in account the sticky unlock now follows the boot probe, so later automatic Steam refreshes may CM-connect. A signed-out account returns before the note and never unlocks.
- `SteamUser.probeCredentialPresence` issues exactly one `readTokenOutcome(getTokenStore(), 'boot-probe')`: `present` is `healthy`, `absent` is `expired`, `unreadable` (timeout and denied reasons both tested) and any throw are `unknown`. Spies prove it calls neither `ensureConnected` nor the steam-user constructor and writes nothing to `configStore`.
- `HumbleSecretStore.readSecret?` and `SidecarHumbleSecretStore.readSecret` thread a never-secret `context` into `SidecarKeyringSlotStore.readToken`; a log assertion shows `trigger=boot-probe` and its twin shows `trigger=unspecified` without a context. `keyringTokenStore.ts` is byte-unchanged.
- `HumbleUser.probeSession` reads the session slot once and never reads `csrfToken`, never calls `getLoginWindowSeamOrThrow`, and never touches `configStore` or `sendFrontendMessage`; a store without `readSecret` (the dev-vault shape) falls back to `getSecret`.
- `checkHealthAndFlagExpiry` now returns the outcome by delegating its read to `probeSession('humble-health-check')` and keeps the `expired` flag, `humbleAuthState` push and csrf backfill exactly.

## Task Commits

1. **Task 1: Steam boot-probe trigger and presence probe** - RED `09cc68c0f` (test), GREEN `1334a02bb` (feat), lint fix `f6e4dcc89` (fix)
2. **Task 2: Humble labelled read, probeSession, no csrf, no webview** - RED `d05299b7e` (test), GREEN `ec5bc6459` (feat)

**Plan metadata:** committed with this SUMMARY (docs: complete plan).

## Files Created/Modified

- `src/backend/storeManagers/steam/authTrigger.ts` - `'boot-probe'` trigger, reversal record, origin-map prohibition comment
- `src/backend/storeManagers/steam/user.ts` - `probeCredentialPresence`; epoch hooks in `finishAuth`, the QR success path and `logout`
- `src/backend/humble/secretStore.ts` - optional `readSecret?(key, context?)` on the seam
- `src/backend/sidecar/humbleSecretStore.ts` - `readSecret` forwarding the label to `readToken`
- `src/backend/humble/user.ts` - `probeSession`, refactored `checkHealthAndFlagExpiry`, epoch hooks in `finishLogin` and `disconnect`
- `src/backend/humble/ipc_handler.ts`, `src/backend/sidecar/humbleFlowRegistration.ts` - drop the returned outcome so `humbleCheckHealth` stays `Promise<void>`
- `src/backend/storeManagers/steam/__tests__/probeCredentialPresence.test.ts`, `src/backend/humble/__tests__/probeSession.test.ts` - new
- `authTrigger.test.ts`, `credentialsMissing.test.ts`, `steam/user.test.ts`, `humbleSecretStore.test.ts`, `humble/user.test.ts`, `humbleFlows.test.ts` - extended or adjusted

## Decisions Made

See `key-decisions`. The two worth restating: the 260817-d61 reversal is deliberate and recorded where a reader of the gate will find it; and a Humble `absent` slot is `unknown` (A9), which means a Humble account whose keyring slot was emptied out from under a connected flag will not be flagged `expired` by this probe. That trade favours never reporting a false expiry.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `steam/user.test.ts` crashed on the new `outcomes` import**
- **Found during:** Task 1 (neighbouring-suite run)
- **Issue:** `finishAuth` and `logout` now reach the real `sendFrontendMessage`, which needs an Electron window (`getAllWindows` of undefined). 27 tests failed. This is the same effect 49-05 hit, as the handoff predicted.
- **Fix:** added a `backend/ipc` jest mock to the suite.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/user.test.ts` (not in the plan's `files_modified`)
- **Verification:** 86/86 pass.
- **Committed in:** `1334a02bb`

**2. [Rule 3 - Blocking] `humbleCheckHealth` handlers no longer type-checked once the method returned an outcome**
- **Found during:** Task 2 (`pnpm codecheck`)
- **Issue:** `ipc_handler.ts` expects `void | Promise<void>` and `humbleFlows.test.ts` used the zero-argument `mockResolvedValue()`. The channel's declared contract is `Promise<void>` (`ipc.ts`).
- **Fix:** both handler registrations now `await` the call and return nothing, so the wire contract is unchanged; `humbleFlows.test.ts` mocks resolve `'unknown'`.
- **Files modified:** `src/backend/humble/ipc_handler.ts`, `src/backend/sidecar/humbleFlowRegistration.ts`, `src/backend/sidecar/__tests__/humbleFlows.test.ts` (none were in the plan's `files_modified`)
- **Verification:** `pnpm codecheck` exits 0; `humbleFlows` passes.
- **Committed in:** `ec5bc6459`

**3. [Rule 1 - Bug] Three existing assertions pinned the old `void` return**
- **Found during:** Task 2 (GREEN run)
- **Issue:** the plan says existing `user.test.ts` cases pass, but three of them asserted `.resolves.toBeUndefined()` on `checkHealthAndFlagExpiry()`, which the plan itself changes to return the outcome (the offline `WR-01` case and the two non-fatal csrf-backfill cases).
- **Fix:** they now assert `'unknown'` (offline) and `'healthy'` (the session was healthy; only the backfill failed). Their non-fatal intent and every other assertion are unchanged.
- **Files modified:** `src/backend/humble/__tests__/user.test.ts`
- **Committed in:** `d05299b7e` (WR-01 case, in the RED commit as part of the contract change) and `ec5bc6459` (the two backfill cases)

**4. [Rule 1 - Bug] Lint test ceiling: one unnecessary type assertion in my own test**
- **Found during:** Task 2 (`pnpm lint`: 1 error in the tests scope)
- **Fix:** `jest.requireMock<{ LoginSession: jest.Mock }>(...)` instead of an `as` cast.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/credentialsMissing.test.ts`
- **Committed in:** `f6e4dcc89`

---

**Total deviations:** 4 auto-fixed (2 Rule 3, 2 Rule 1)
**Impact on plan:** None on scope. Three of the four touch files outside `files_modified`, all as mock-only or type-contract edits forced by the planned change.

## TDD Gate Compliance

Each task has a `test(49-06)` commit preceding its `feat(49-06)` commit. RED evidence was recorded for each and `gsd check tdd-red-evidence` returned `RED_EVIDENCE_OK` (jest `--json` converted to TAP): Task 1 had 10 failing of 53, Task 2 had 11 failing of 138. Both RED commits carry deliberately inert stubs (the Steam `probeCredentialPresence` and the `'boot-probe'` type member; the Humble `probeSession` and a `readSecret` that drops its label), so the tests fail on assertions rather than on missing symbols. The Humble `readSecret` stub is also the RED variant for the label assertion: it logs `trigger=unspecified`, which the `trigger=boot-probe` test rejects.

## Issues Encountered

- **Pre-existing Windows failures, out of scope:** `sidecar/__tests__/devSecretVault.test.ts` (`installDevSecretVault()` returns false for the 0600-mode vault file on Windows, seven tests) and `sidecar/__tests__/bootstrap.test.ts` (asset-root self-check) fail in a wider scoped run. Neither touches `readSecret`, `probeSession` or any file this plan changed. The scoped plan verification is 226/226.
- Humble `user.test.ts`'s `sendFrontendMessage` count assertions were unaffected because the new `noteSignedOut` / `noteSignInSucceeded` calls are mocked at `backend/signInProbe/outcomes` in that suite.

## Known Stubs

None. The RED stubs were replaced in their GREEN commits.

## Threat Flags

None. No new network endpoint, auth path or trust boundary beyond the plan's threat model (T-49-16 to T-49-19). `'boot-probe'` is not reachable from any renderer origin (T-49-16); probe results and `trigger=` lines carry labels only, and a thrown request logs `err.message` only (T-49-17); `probeSession` opens no webview and reads no csrf slot (T-49-18); `unreadable` and a Humble `absent` slot are `unknown` (T-49-19).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

49-08's pass can call `SteamUser.probeCredentialPresence()` and `HumbleUser.probeSession('boot-probe')`, bound each with `boundedSignInProbe`, `captureSignInEpoch(store)` before each, and `applySignInVerdict` after. Neither probe has an abort hook and neither needs one: each holds only a `keyring_get` invoke (45 s Rust `KEYRING_READ_TIMEOUT`, 60 s `RUST_INVOKE_TIMEOUT_MS` whose timer is `unref()`'d) or a `REQUEST_TIMEOUT_MS`-bounded HTTP call, so the bound-abort path is the pass resolving `unknown`. The 49-04 `ts-prune-ignore-next` markers on `BoundedOutputCapture` and `SignInVerdictResult` are still needed (this plan imports neither). Whether macOS raises a Keychain prompt for these two reads, and how many, remains for 49-11 / 49-12. `graphify update .` was run after the last task commit.

## Self-Check: PASSED

- Created files exist: `probeCredentialPresence.test.ts` and `probeSession.test.ts`.
- Commits exist: `09cc68c0f`, `1334a02bb`, `f6e4dcc89`, `d05299b7e`, `ec5bc6459` (`git rev-list --count` from the persisted ledger base is 5).
- Plan verification: scoped Backend jest over `steam/__tests__/(authTrigger|probeCredentialPresence|credentialsMissing)`, `humble/__tests__/(probeSession|user)` and `sidecar/__tests__/(humbleSecretStore|humbleFlows)` is 226/226 across 8 suites; `pnpm codecheck` exits 0; `pnpm lint` 0 errors, production PASS and tests PASS; scoped `prettier --check` clean over all 15 written paths; `node meta/findDeadcode.cjs` reports `unreachable: 46 OK | used-in-module: 0 OK`.
- Acceptance criteria: comment-stripped `'boot-probe'` count in `authTrigger.ts` is 2 and the `ORIGIN_TO_TRIGGER` literal has none; `authTrigger.ts` has 0 `^import` lines; the comment-stripped `probeCredentialPresence` body has 0 of `ensureConnected`, `connectSteamUserClient`, `configStore.set`, `configStore.delete`; the `authTrigger.ts` header names `260817-d61` and `D-14`; `grep -rlE authTrigger src/backend/humble src/backend/sidecar/humbleSecretStore.ts` prints nothing; the comment-stripped `probeSession` body has 0 of `csrfToken`, `getCsrfToken`, `getLoginWindowSeamOrThrow`, `configStore.`, `sendFrontendMessage`; `git diff --quiet -- src/backend/sidecar/keyringTokenStore.ts` exits 0; the `trigger=boot-probe` assertion and its `trigger=unspecified` twin both pass.
