---
created: 2026-09-09T00:00:00.000Z
title: 'Pre-push is red TWO ways — lint ratchet over by 96 (4253 vs 4157) AND prettier dirty in 7 files; two pushes bypassed it with --no-verify'
area: tooling
severity: medium
platform: any
ready: code
status: OPEN
found_by: 'Quick 260909-r4h, when `git push origin fix/steam-native-install-stability` was rejected by the pre-push hook'
resolves_phase: ''
files:
  - package.json
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts
  - src/backend/storeManagers/steam/__tests__/depot.test.ts
---

## Problem

`pnpm lint` is `eslint --cache --max-warnings 4157 .`. Measured at HEAD (`589523de3`) on
2026-09-09: **4253 warnings across 378 files, 0 errors** — **96 over budget**, so the script
exits 1.

The pre-push hook runs it. **Every push from this branch is therefore blocked** until either
the warnings come down or the gate is bypassed.

`4157` is not an arbitrary number: commit `e98174032` (phase 39-09) *ratcheted* it to the
then-current count, deliberately, to stop warnings creeping up. 96 have crept up since.

## A push bypassed it — 2026-09-09

`fix/steam-native-install-stability` was pushed with `--no-verify` (operator decision, quick
`260909-r4h`), carrying 264 commits. **The regression is on the remote and unfixed.** This
todo is the trace that bypass would otherwise not have left.

## Attribution — measured, not assumed

The rebrand commits in `260909-r4h` (`24f4ba7eb`, `9958ed9f5`, `589523de3`) are **NOT** the
cause. `git diff --name-only b72e9a365..HEAD` is 39 `.json` locale catalogs and 4 `.md`
planning docs — **zero lintable files**, and eslint resolves no config for JSON. The warning
count is necessarily identical at `b72e9a365` and at HEAD. The regression is older; whoever
takes this should find *when*, not assume.

## Where the warnings are (top offenders at HEAD)

| count | file |
| --- | --- |
| 425 | `src/backend/storeManagers/steam/__tests__/games.test.ts` |
| 421 | `src/backend/storeManagers/steam/__tests__/library.test.ts` |
| 147 | `src/backend/storeManagers/steam/__tests__/depot.test.ts` |
| 102 | `src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts` |
| 94 | `src/backend/humble/__tests__/library.test.ts` |
| 89 | `src/backend/storeManagers/steam/library.ts` |

Predominantly `@typescript-eslint/no-unsafe-*` and `require-await` in test code.

## Fix direction

1. Isolate the **new** 96 by diffing the warning set at `e98174032` against HEAD — do not just
   fix the largest files, which are mostly pre-ratchet debt that the ratchet already blessed.
   `npx eslint --cache -f json .` gives a per-file/per-rule breakdown to diff.
2. Fix those 96 and leave the budget at 4157.

**Do NOT raise `--max-warnings` to 4253.** A ratchet that widens to admit whatever failed is
not a ratchet — it silently blesses the regression permanently and destroys the signal the
39-09 commit was created to preserve. This is the same failure shape the todo-frontmatter gate
convention warns about: never widen the vocabulary to admit the value that failed.

## Verification

`pnpm lint` exits 0 with the budget still at 4157, and a normal `git push` (no `--no-verify`)
succeeds.

## Update 2026-09-09 — the pre-push hook is red for TWO independent reasons, not one

Measured by running each of the hook's four checks separately
(`pnpm codecheck && pnpm lint && pnpm prettier && pnpm i18n --fail-on-update`):

| check | result |
| --- | --- |
| `pnpm codecheck` | **PASS** |
| `pnpm lint` | **FAIL** — 4253 warnings vs the 4157 budget |
| `pnpm prettier` | **FAIL** — 7 files unformatted |
| `pnpm i18n --fail-on-update` | **PASS**, and it left the tree clean |

The prettier half was NOT recorded when this todo was filed. Offenders, all pre-existing:

- `src/backend/longLivedChildren.ts`
- `src/backend/__tests__/quitTeardownWiring.test.ts`
- `src/backend/__tests__/shellDiagPersistence.test.ts`
- `src/backend/humble/__tests__/library.test.ts`
- `src/backend/sidecar/__tests__/appShellFlows.test.ts`
- `src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts`
- `src/frontend/screens/Game/GamePage/components/__tests__/MainButton.installClickRouting.test.tsx`

Prettier is the cheap half — `npx prettier --write` on those 7 files closes it. The lint
ratchet is the one needing judgement.

**Second `--no-verify` push, 2026-09-09 (quick `260909-rvx`).** Attribution re-measured rather
than assumed: the lint count is **4253 both before and after** that work, and none of the 7
prettier offenders is among the files it touched. Nothing of that task's was hidden by the
bypass; `codecheck` and `i18n` were confirmed passing first, so the bypass covered exactly the
two known pre-existing failures.
