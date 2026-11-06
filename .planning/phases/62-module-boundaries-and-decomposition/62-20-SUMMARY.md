---
phase: 62-module-boundaries-and-decomposition
plan: 20
subsystem: lint-gates
tags: [eslint, dependency-cruiser, boundaries, D-14, D-15]
requires: [62-19]
provides:
  - runner-literal ban enforced as ESLint error in eslint.config.mjs
  - no ratchet, ceilings, or depcruise baseline remain
key-files:
  modified:
    - eslint.config.mjs
    - meta/runnerLiteralSelectors.cjs
    - package.json
    - .prettierignore
    - .dependency-cruiser.cjs
    - meta/__tests__/boundaryWiring.test.ts
    - meta/__tests__/boundaryGates.test.ts
  deleted:
    - meta/boundaryRatchet.cjs
    - meta/__tests__/boundaryRatchet.test.ts
    - .dependency-cruiser-known-violations.json
decisions:
  - "Selector set keeps one source (meta/runnerLiteralSelectors.cjs), imported by eslint.config.mjs"
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 62 Plan 20: Promote literal ban, delete ratchet and baseline Summary

The runner-literal ban now lives in `eslint.config.mjs` as a `no-restricted-syntax` `error` block (scope and selectors imported from `meta/runnerLiteralSelectors.cjs`); the ratchet script, its test, and the empty depcruise baseline are deleted, and `pnpm boundaries` is `depcruise` only, with no `--ignore-known`.

## Commits
- c7e945e75: promote ban to eslint error, delete ratchet; boundaryWiring re-pinned (package.json script, eslint import + `'error'` severity, near-miss arms for warn severity and missing import)
- 35b0b21cb: delete baseline; boundaryGates real-repo arms now run with no baseline and assert baseline file absent; seeded temp-baseline arms untouched; `.prettierignore` entry and stale `.dependency-cruiser.cjs` header text removed

## Near-miss proof (Task 1)
- Frontend non-test file (`AboutDialog/index.tsx`) with `gameInfo.runner === 'steam'`: eslint reported no-restricted-syntax (red).
- `src/backend/storeManagers/steam/library.ts`: no hit (green).
- A `src/backend/__tests__` file: no hit (green).
All seeded lines reverted.

## Verification
`pnpm lint` 0 errors; `pnpm boundaries` clean at zero without baseline; `pnpm codecheck`, `pnpm prettier`, `pnpm find-deadcode` green; `pnpm build:sidecar-sea` + `pnpm smoke:sidecar` PASS. `.prettierignore` file-info: `ignored:false, inferredParser:null`, so no prettier check applies. No remaining live references to `boundaryRatchet` (only a negative assertion in boundaryWiring.test.ts). `.husky/pre-push` and `lint.yml` unchanged (they call `pnpm boundaries`); `meta/lintScoped.cjs` untouched.

## Deviations from Plan
None to code. 

## Deferred Issues
- `pnpm planning-gates` reports 11/12: `62-UAT.md` has no frontmatter block (added in 62-12 commits 3e135a852/fc3f20add, pre-existing, not touched here). Logged for the orchestrator.
- Full jest: 6 failed (exactly the known baseline), 17890 passed.

## Self-Check: PASSED
