---
phase: quick-261011-rj0
plan: 01
status: complete
subsystem: steam-auth
tags: [steam, sign-in-probe, credentialsMissing, ensureConnected, D-19, D-21, T-49-10, todos]
dependency-graph:
  requires:
    - "71b05c28d (ensureConnected() short-circuits a terminal CM rejection; getLogonFailure())"
    - "0851f6c7e (library.ts exit path 1 names logon-rejected)"
    - "Phase 49 D-19 suppression branch in resolveSteamSyncIndicator and applySignInVerdict's epoch fence"
  provides:
    - "a CM credential refusal of the stored Steam token latches credentialsMissing through the fenced verdict, so the Library sign-in row (with Sign in) replaces the generic failed banner"
    - "a successful cold-connect logon clears a latched credentialsMissing the same way"
  affects:
    - src/backend/storeManagers/steam/user.ts
tech-stack:
  added: []
  patterns:
    - "A CM response may feed applySignInVerdict only through the probe's own capture-epoch -> apply -> stale-returns -> record -> publish shape; record+publish only on latched/cleared so an unchanged map is never re-pushed"
key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/user.ts
    - src/backend/storeManagers/steam/__tests__/user.test.ts
    - .planning/todos/completed/2026-10-11-steam-cm-refused-token-never-reaches-sign-in-surface.md (moved from pending/, Fix section appended)
decisions:
  - "Latch in ensureConnected(), not library.ts: it is the one place the CM verdict is observed, the absent branch already latches there (260822-vov), and every caller (library refresh, depot install, installLocation, games) benefits"
  - "Only five EResults count as a credential refusal (InvalidPassword 5, AccessDenied 15, Revoked 26, Expired 27, AccountLogonDenied 63); LogonSessionReplaced, RateLimitExceeded and the rest keep the generic banner, which is the truth for them"
  - "Literal EResult numbers with a name-string fallback rather than SteamUserLib.EResult, so the test double (no enum) and the runtime agree"
  - "D-21 untouched: probeCredentialPresence() still never opens the CM. The new site is a deliberate caller's CM response, routed through applySignInVerdict and nothing else"
  - "Planned and executed inline by the orchestrator (no planner/executor subagents): the todo carried a recorded design, the touched surface was two files, and the subagent round trip is the dominant cost of a quick task (memory: gates-cost-26s)"
metrics:
  duration: "~45 min"
  completed: 2026-10-11
  tests_added: 5
  suites_green: "user, library, verdict, pass: 416/416; whole Backend 5793 passed, 1 unrelated load flake (dxvkInstallRemove, passes alone)"
plan_head_after: 3e8bea025
---

# Quick task 261011-rj0: a CM-refused Steam token lands on the sign-in row

**One-liner:** `ensureConnected()` now reports the CM's own verdict on the stored refresh token through
the Phase 49 fenced latch, so AccessDenied renders "Your Steam sign-in expired / Sign in" instead of
"Couldn't sync your Steam library / Retry".

## What was wrong

Phase 49 D-21 made the Steam boot probe presence-only: a token that is **present** but **refused**
by the CM left `credentialsMissing` unset, so D-19's suppression branch never fired. After
71b05c28d the refusal settled fast and 0851f6c7e named it `logon-rejected`, but the renderer drops
`reason`, so the user still got the generic banner whose copy ("check that Steam is reachable") and
Retry were both wrong for this cause. Live log today (release bundle predating both fixes):
`AccessDenied` at 11:17:40 and 11:20:30, each followed by the 20002 ms grace wait.

## What changed

`src/backend/storeManagers/steam/user.ts` (commit `7390a245a`):

- `CREDENTIAL_REFUSAL_ERESULTS` / `CREDENTIAL_REFUSAL_NAMES` and `isCredentialRefusal()` decide
  whether the CM refused the *credential* or merely this connection.
- `reportLogonVerdict(outcome, epochAtStart)` calls `applySignInVerdict('steam', ...)` and, only on
  `latched` or `cleared`, records the outcome and publishes the map.
- `ensureConnected()` captures `epochAtStart` before the connect attempt (as `pass.ts` does), reports
  `healthy` on a populated `steamID` after the cold connect or a late `loggedOn` inside the grace
  window, and reports `expired` on a credential refusal seen either at the short-circuit or after the
  grace window. The latch runs before the `false` return, so `library.ts`'s `failed/logon-rejected`
  emit always follows the flag on the same pipe.

No renderer change: `resolveSignInState` branch 1 and `resolveSteamSyncIndicator` branch 1b already
do the work once the flag is set.

## Verification

- RED observed before the source edit: A (latch+publish) and D (clear-on-success) failed on missing
  calls; B, C, E passed as controls. After: all five green.
- Mutation: replacing `epochAtStart` with a fresh `captureSignInEpoch('steam')` at the verdict call
  reds test C alone -- the fence is load-bearing and pinned. Source restored from a snapshot copy, not
  `git checkout`.
- `user`, `library`, `verdict`, `pass` suites: 4/4, 416/416. Whole Backend project: 252/253 suites,
  5793 passed, 1 failed (`dxvkInstallRemove.test.ts`, passes alone, no import of anything touched).
- `pnpm codecheck` exit 0. `npx prettier --check` green on both written source paths (both report
  `"ignored": false`). `pnpm planning-gates` 12/12.
- `probeCredentialPresence()` byte-unchanged.

## NOT live-verified

The todo's own "Live check first" needs the operator: rebuild, launch, confirm
`[signInProbe] steam verdict=latched` and the expired row within ~1 s of the keyring read with no
banner; then sign in with QR. If `AccessDenied` repeats on a fresh token the logon path itself is
broken and that is a different bug (re-open `.planning/debug/steam-sync-false-failed-banner.md`).
Both checks are recorded in the completed todo.

## Commits

| hash        | what                                                                 |
| ----------- | -------------------------------------------------------------------- |
| `7390a245a` | fix(steam): the latch, the fence, clear-on-success, five tests        |
| `3e8bea025` | docs(todos): todo moved to `completed/` with the Fix section          |
