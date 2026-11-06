---
phase: 57-opt-in-known-fix-sharing-via-relay
plan: 06
subsystem: relay
tags: [github-app, webcrypto, rs256, d1, rate-limit]
requires: [57-03]
provides:
  - relay/src/githubApp.ts (mintAppJwt, getInstallationToken, githubHeaders, PrivateKeyFormatError, GitHubUnavailableError)
  - relay/src/limits.ts (hashIp, checkIpLimit, reserveDailyCreation, purgeExpiredBuckets, defaults)
affects: [57-07, 57-08, 57-09]
key-files:
  created:
    - relay/src/githubApp.ts
    - relay/src/__tests__/githubApp.test.ts
    - relay/src/limits.ts
    - relay/src/__tests__/limits.test.ts
decisions:
  - "buckets.expires is stored in epoch milliseconds; purgeExpiredBuckets takes nowMs"
  - "Installation token cache is module-scope with resetTokenCacheForTests()"
metrics:
  tasks: 2
  completed: 2026-11-02
---

# Phase 57 Plan 06: GitHub App auth and rate limits Summary

RS256 GitHub App JWT via WebCrypto with a cached, repo-scoped installation token (clear PKCS#1 error), plus atomic D1 UPSERT limits: 10 requests per hashed IP per UTC hour and 25 creations per UTC day.

## Commits
- 260f12341: failing githubApp tests
- 39d640377: githubApp implementation (D-02)
- test + feat commits for limits (D-15), see git log

## Verification
- `pnpm jest` githubApp (12) and limits (8) tests pass; `npx tsc -p relay --noEmit` exits 0; prettier --check clean on all four paths.
- Acceptance greps: `importKey('pkcs8'` 1, `'token ` 0, `RETURNING n` 1, `console.` 0.

## Deviations from Plan
None. I extracted the algorithm object into a module constant so `importKey('pkcs8'` stays on one line under prettier, as the acceptance grep requires.

## Known Stubs
None.

## Self-Check: PASSED
