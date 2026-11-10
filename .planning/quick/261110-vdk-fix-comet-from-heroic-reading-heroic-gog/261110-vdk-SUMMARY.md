---
phase: quick-261110-vdk
plan: 01
subsystem: gog
tags: [gog, comet, auth, security]
key-files:
  modified:
    - src/backend/storeManagers/gog/games.ts
    - src/backend/storeManagers/gog/__tests__/gogImportGame.test.ts
    - src/backend/__tests__/quitTeardownWiring.test.ts
    - .planning/todos/completed/2026-11-10-comet-from-heroic-reads-wrong-gog-auth-dir.md
decisions:
  - comet runs in token mode from GOGUser.getCredentials; skipped with a warning when credentials are unavailable
metrics:
  completed: 2026-11-10
---

# Quick 261110-vdk: GOG comet token mode Summary

GOG comet is now spawned with `--access-token/--refresh-token/--user-id/--username/--quit` from `GOGUser.getCredentials`, replacing `--from-heroic` (which hard-codes Heroic's auth dir). Comet output is token-redacted before reaching the comet runner log.

## Commits
- 59c8c14b4: fix — token-mode spawn, `redactSecrets` helper, tests A-F, C7 re-anchored on `--access-token`
- 427f0475c: docs — todo moved to completed/ with Resolution

## Behavior
- Skipped (no spawn, no `getCredentials` call) when `cometSupport === false` or no username.
- Credentials undefined/incomplete: one `logWarning` mentioning comet, game still launches.
- Added at most one `gogdl auth` spawn before game start, only when the TTL cache has expired.

## Token-logging audit
runner.ts `spawnLongLived` (re-read): argv is never logged; the only runner log is `deps.log.warn(\`${id}: ${err.message}\`)` on spawn error (no argv). The comet call site passes no `logSink`. No log call in games.ts touches credentials. Test F asserts no token in logInfo/logWarning/logError/logDebug. Accepted trade-off (T-vdk-03): tokens are visible in comet's argv to `ps` during the session.

## Verification
jest (gogImportGame, quitTeardownWiring, logSecretGate) 78/78, tsc, eslint (0 errors), prettier all green; no live `'--from-heroic'` in games.ts. Test A's argv pin was RED before the games.ts change.

## Deviations
- [Rule 1] Test B counts only comet-matching `logWarning` calls, since launch emits other unrelated warnings in the harness.

## Deferred / Issues
- `pnpm planning-gates`: 11/12 pass. The failing gate is `state-sdk-field-anchor-gate.py` against `.planning/STATE.md`, which this task did not touch (orchestrator owns STATE.md). Not caused by this work; re-check after the docs commit.
- `graphify update .` ran but printed only a Gemini-key tip.

## Operator live check (PENDING, human, not blocking)
`pnpm tauri:dev` (after `pnpm build:sidecar` if stale), launch a GOG game online, run `pgrep -fl comet`: expect `--access-token` in argv, no `--from-heroic`, no `heroic.rs` panic and no raw token in the comet runner log; comet gone after quitting the game.

## Self-Check: PASSED
