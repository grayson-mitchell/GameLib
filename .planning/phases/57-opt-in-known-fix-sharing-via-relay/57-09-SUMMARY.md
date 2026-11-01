---
phase: 57-opt-in-known-fix-sharing-via-relay
plan: 09
subsystem: relay
tags: [relay, github, pull-request, known-fixes]
requires: [57-01, 57-05, 57-07]
provides:
  - publishReport (GitHub decision flow)
  - prBody renderers and report marker parser
affects: [relay handler plan wiring publishReport]
tech-stack:
  added: []
  patterns: [strictly sequential GitHub calls, HTML-comment marker for operator-rejection detection]
key-files:
  created:
    - relay/src/publish.ts
    - relay/src/prBody.ts
    - relay/src/__tests__/publish.test.ts
    - relay/src/__tests__/prBody.test.ts
  modified: []
key-decisions:
  - "publish tests use an in-memory scripted RepoClient with a call log and concurrency tracker rather than fakeFetch; githubFiles itself is covered by its own tests"
  - "Backticks and whitespace in the canonical title are normalised before it goes into a code span"
requirements-completed: [D-05, D-06, D-07, D-08, D-11, D-13, D-20]
duration: 15min
completed: 2026-11-02
---

# Phase 57 Plan 09: Relay publish flow Summary

publishReport decides already-known, fold-into-open-PR, D-20 suppression, rate-limited, new PR or D-11 bundled-removal issue, with deterministic injection-safe PR/issue bodies carrying a parseable `gamelib-report:` marker.

## Tasks

1. prBody.ts (titles, bodies, marker parser): 9 tests. Commit 6c12adad0.
2. publish.ts (decision flow): 18 tests across describes pr, closed, bundled, already-known. Commit 9b59c020f.

## Deviations from Plan

None in behaviour. Test double: in-memory RepoClient instead of fakeFetch (see key-decisions); the "zero POST pulls / zero writes" assertions are made on its call log.

## Verification

jest (27 tests), `tsc -p relay`, prettier --check and `eslint --quiet` all clean; no `Promise.all` in publish.ts.

## Known Stubs

None.

## Self-Check: PASSED
