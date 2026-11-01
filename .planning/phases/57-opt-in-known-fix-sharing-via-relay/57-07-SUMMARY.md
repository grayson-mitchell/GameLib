---
phase: 57-opt-in-known-fix-sharing-via-relay
plan: 07
subsystem: relay
tags: [github-rest, serial-client, tdd]
requires: [57-03, 57-05, 57-06]
provides:
  - relay/src/githubFiles.ts (createRepoClient, RepoClient)
affects: [57-09]
key-files:
  created:
    - relay/src/githubFiles.ts
    - relay/src/__tests__/githubFiles.test.ts
decisions:
  - "Any non-2xx is GitHubUnavailableError except explicitly accepted statuses (404 for getFile, 422 for createBranch which is 'exists' only on 'Reference already exists')"
metrics:
  tasks: 2
  completed: 2026-11-02
---

# Phase 57 Plan 07: GitHub repo client Summary

Serial GitHub REST client (getFile, findPulls with mergedAt, branch get/create/force, putFile, deleteFile, createPull, updatePullBody, issue find/create) with all failures mapped to GitHubUnavailableError carrying method, path and status only.

## Commits
- 5beefbb99: failing tests (RED)
- d6ea95bae: implementation (GREEN)

## Verification
- 21 jest tests pass; `npx tsc -p relay --noEmit` clean; prettier clean; `Promise.all` count 0; `redirect: 'error'` count 1.
- Endpoints remain unconfirmed against live GitHub until the plan 12 staging run.

## Deviations from Plan
None.

## Self-Check: PASSED
