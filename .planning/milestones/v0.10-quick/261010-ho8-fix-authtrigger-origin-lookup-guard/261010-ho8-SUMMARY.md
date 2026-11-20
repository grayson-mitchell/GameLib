---
phase: quick-261010-ho8
plan: 01
status: complete
completed: 2026-10-10
commits:
  - e0cec826e
  - a2f162db0
  - 846bbb68c
actuals:
  tokens: 2320
  tasks: 2
  commits: 3
files_modified:
  - src/backend/storeManagers/steam/authTrigger.ts
  - src/backend/storeManagers/steam/__tests__/authTrigger.test.ts
  - .planning/todos/completed/2026-10-10-authtrigger-origin-lookup-is-an-unguarded-bracket-access.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-REVIEW-DISPOSITION.md
---

# Quick 261010-ho8: `mapRefreshOriginToTrigger` is now own-property-guarded

**Fix commit `a2f162db0`.** `mapRefreshOriginToTrigger` no longer does a bare bracket index on
the plain-object `ORIGIN_TO_TRIGGER` allowlist. A renderer-supplied `origin` of `'__proto__'` or
`'constructor'` used to resolve through `Object.prototype` to an object or a function instead of
`undefined`, which slipped past the `?? 'startup'` fallback and broke `currentTriggerLabel()`'s
"never undefined, a log label" string contract (49-REVIEW WR-04). The Steam keyring gate itself
was never escalatable — `DELIBERATE_TRIGGERS.has()` already rejected any non-member value — so
the defect was the label contract and potential `[object Object]`-style noise in the `keyring_get`
log lines, not a privilege escalation.

## What was done

1. **RED** (`e0cec826e`): added 8 regression cases to `authTrigger.test.ts` — an `it.each` over
   the five inherited `Object.prototype` names (`__proto__`, `constructor`, `toString`,
   `hasOwnProperty`, `valueOf`) through `mapRefreshOriginToTrigger`; one case for a non-string
   origin (`['login-success']`) whose string coercion is an allowlisted key; and an `it.each` over
   `'__proto__'`/`'constructor'` through `noteRefreshTrigger('steam', origin)` asserting
   `currentTriggerLabel()` stays the string `'startup'` and the gate stays locked. Measured red:
   exactly 8 failed, 35 passed, 43 total.
2. **GREEN** (`a2f162db0`): `mapRefreshOriginToTrigger` now (a) returns `'startup'` when
   `typeof origin !== 'string'` or `origin.length === 0` — widening the old `!origin` check to
   also reject a non-string IPC value, mirroring the launch guard at
   `steamFlowRegistration.ts:320-325` — and (b) checks
   `Object.prototype.hasOwnProperty.call(ORIGIN_TO_TRIGGER, origin)` before indexing, returning
   `'startup'` when the key is not its own. `ORIGIN_TO_TRIGGER`'s declared type and the function's
   `SteamAuthTrigger` return type are unchanged. Extended the function's doc comment to cite
   WR-04 and the shared `steamFlowRegistration.ts` T-34.5-C4-10 pattern. Measured green: 43/43.
   `pnpm codecheck` exits 0 (both `tsc` passes); `npx prettier --check` clean on both `src/` files;
   the guard string appears exactly once in the file. `graphify update .` run after this commit.
3. **Docs** (`846bbb68c`): moved the todo to `completed/` with a `## Fix` section recording the
   guard choice (repo's existing pattern, smallest diff), the added `typeof` rejection and why
   (the unchecked `args[1]` cast at `steamFlowRegistration.ts:164-165`), the 8 regression cases,
   and that the gate itself was never escalatable. `49-REVIEW-DISPOSITION.md` WR-04 set to
   `fixed` in both the frontmatter and the table row, citing this commit.

## Decisions

- **`hasOwnProperty` guard, not a null-prototype map** — the repo's dominant existing pattern for
  this input class (four call sites across `steamFlowRegistration.ts`,
  `appShellFlowRegistration.ts`, `signInState.ts`), and the smallest diff: no type changes to
  `ORIGIN_TO_TRIGGER` or the function's return type.
- **Also reject a non-string `origin`, inside the same function** — the only production caller
  passes an unchecked `args[1] as string | undefined | null` cast; a bracket index coerces its key
  to a string, so an array could otherwise reach an allowlisted entry. Same key-coercion class as
  WR-04, closed in the same pass, scope stays inside `mapRefreshOriginToTrigger`.
- **Test command form**: bare-path `--testPathPattern` would silently run every Backend suite
  (248 suites) — used the full pattern and read the trailing "matching" line, per the plan.

## Verification

| Check | Result |
|---|---|
| `npx jest --selectProjects Backend --testPathPattern '...authTrigger\.test\.ts'` (RED) | 8 failed, 35 passed, 43 total |
| Same command (GREEN) | 43 passed, 43 total — trailing line confirms "matching" |
| `pnpm codecheck` | exit 0 |
| `npx prettier --check` on both `src/` files | clean |
| `pnpm lint` | `production: PASS \| tests: PASS` (pre-existing unrelated warnings only) |
| `pnpm planning-gates` | 12/12 |
| `graphify update .` | run after the code commit |
| Guard string occurrence count in `authTrigger.ts` | exactly 1 |

## Deviations from Plan

None — plan executed exactly as written. One process note: the first attempt at the Task 2 docs
commit staged the `git mv` rename but missed the subsequent Edit-tool content additions (the
`## Fix` section and the `49-REVIEW-DISPOSITION.md` edits), landing a commit with 0 content
changes. Caught before moving on by re-running the task's own verification grep, fixed by staging
the full file content and amending that same not-yet-shared commit (no prior commit's history was
rewritten) to the required `docs(quick-261010-ho8): close WR-04 authTrigger origin-lookup todo`
shape with all three files present.

## Issues Encountered

None.

## Next Phase Readiness

WR-04 is closed. The 49-REVIEW-DISPOSITION.md now shows WR-01 and WR-03 as the only remaining
`open` findings (WR-02 and WR-04 both `fixed`); no blockers for this quick task.

## Self-Check: PASSED

All four modified files and this SUMMARY.md confirmed present on disk; all three commits
(`e0cec826e`, `a2f162db0`, `846bbb68c`) confirmed present in `git log --oneline --all`.
