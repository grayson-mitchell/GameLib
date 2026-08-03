---
created: 2026-08-03T05:51:50.702Z
title: Clean up 44 eslint errors blocking the pre-push hook
area: tooling
files:
  - src/backend/sidecar/__tests__/bootstrap.test.ts
  - src/backend/sidecar/__tests__/devSecretVault.test.ts:58
  - src/backend/sidecar/__tests__/humbleFlows.test.ts:89
  - src/backend/sidecar/__tests__/oauthLoginCapture.test.ts
  - src/backend/sidecar/__tests__/runnerMiscFlows.test.ts
  - src/backend/sidecar/electronStub.ts:114
  - src/backend/sidecar/handlers.ts:302
  - src/backend/sidecar/humbleFlowRegistration.ts:165
  - src/backend/sidecar/storeWriteHandlers.ts:123
  - src/backend/storeManagers/gog/redist.ts:119
  - src/preload/__tests__/framelessRuntime.test.ts:90
---

## Problem

The pre-push hook (`codecheck` + `lint`) fails on 44 pre-existing eslint errors accumulated on
`fix/steam-native-install-stability`, so every push currently requires `--no-verify` (used for the
2026-08-03 ship that updated fork PR #3). The errors are branch debt, none from the 2026-08-03
debug fixes. Reproduce the exact list with `npx eslint --cache --quiet .`.

Breakdown:
- ~20× `@typescript-eslint/no-require-imports`, almost all in sidecar jest tests. CAUTION: these
  are dynamic re-requires after `jest.resetModules`/`jest.isolateModules` and are likely
  intentional — the right fix is targeted `eslint-disable` comments or a rule exception for test
  files, NOT conversion to static imports (that would change test semantics).
- ~15× `@typescript-eslint/no-unnecessary-type-assertion` — auto-fixable (`eslint --fix`).
- 1× `no-this-alias` (framelessRuntime.test.ts:90)
- 1× `no-redundant-type-constituents` (electronStub.ts:114 — `unknown` overriding a union)
- 1× `no-unused-vars` (`registerHumbleFlows`, humbleFlows.test.ts:89)
- a few `no-require-imports` in real source: humbleFlowRegistration.ts:165, gog/redist.ts:119 —
  CAUTION: memory gotcha "sync require of alias/relative unresolved in build" — a require here may
  be deliberate; check before converting.

## Solution

1. `npx eslint --fix` for the auto-fixable assertions, then verify jest suite stays green (3685+).
2. Add a test-file override for `no-require-imports` in the eslint config (or per-line disables
   with a one-word reason) for the sidecar test dynamic requires.
3. Hand-fix the remaining singles.
4. Confirm `git push` passes the hook without `--no-verify`.
