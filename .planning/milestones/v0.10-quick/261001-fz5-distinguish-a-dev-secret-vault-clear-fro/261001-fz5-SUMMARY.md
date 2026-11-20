---
phase: quick-261001-fz5
plan: 01
subsystem: sidecar-dev-tooling
tags: [dev-secret-vault, logging, observability, tdd, steam, humble, steamgriddb]
status: complete

requires: []
provides:
  - "src/backend/sidecar/devSecretVault.ts: writeSlot() takes a required WriteDirection ('store'|'wipe') parameter; the write log line is now `[dev-secret-vault] write key=<slot> op=store|wipe`, distinguishing a credential store from a credential wipe with no adjacent-message inference"
  - "src/backend/sidecar/__tests__/devSecretVault.test.ts: strict-equality pins for the Steam slot's store+wipe lines, both Humble slots' wipe lines (plus on-disk present-and-empty state), and the SteamGridDB slot's wipe line; also pins the old direction-free line as no longer emitted"
  - ".planning/todos/completed/2026-10-01-dev-secret-vault-write-log-line-cannot-tell-a-store-from-a-wipe.md: todo closed with a resolution section"
affects: [steam-token-store, humble-secret-store, steamgrid-secret-store]

tech-stack:
  added: []
  patterns:
    - "Closed-set, required, caller-chosen direction token on a log line (never derived from the value being logged) to distinguish two code paths that share one emission site, without widening what a log line is permitted to carry"

key-files:
  created: []
  modified:
    - src/backend/sidecar/devSecretVault.ts
    - src/backend/sidecar/__tests__/devSecretVault.test.ts
    - .planning/todos/completed/2026-10-01-dev-secret-vault-write-log-line-cannot-tell-a-store-from-a-wipe.md

key-decisions:
  - "Direction chosen: Option B (a direction token on the existing write line, op=store|wipe) over Option A (a separate clear-shaped line). Reason: Option A would silently narrow the established `grep 'dev-secret-vault] write'` habit -- every wipe would quietly drop out of it while the grep kept looking complete. Option B keeps the prefix stable so the existing grep still returns every mutation, with op=wipe/op=store as refinements. This was the plan's own decision, re-verified during execution, not re-litigated."
  - "writeSlot()'s new direction parameter is REQUIRED (no default) and typed as a closed two-member string-literal union, so tsc -- not a grep -- proves no direction-free call site survives. The direction is chosen by each of the three setter call sites (setToken, setSecret, setApiKey -> 'store'; clearSlot -> 'wipe'), never derived from the value, preserving guardrail (b)'s rule that the log token can never be a function of the secret value."
  - "The plan's assumption that a getter is importable from backend/steamgrid/secretStore held exactly as written -- getSteamGridDbSecretStore() exists and was imported directly, reached the same way the neighbouring Steam/Humble tests reach their stores. No deviation was needed for Task 2's SteamGridDB arm."
  - "The pre-existing leak-scan test ('...NO logged argument leaks...') was re-run completely unmodified per the plan's explicit instruction, and it passed -- its argument-flattening scan already covered the new op= token by construction. No edit was made there, and none was warranted."

actuals:
  tokens: 46000
  tasks: 3
  commits: 1
  plan_head_before: 9a1d592c0adddf6a76afaa6f6cc26e3aea5bf8ce
  plan_head_after: afb0fe7448effb120ff0f64c640832c8e3c13355

requirements-completed: [TODO-2026-10-01-dev-secret-vault-write-log-line-cannot-tell-a-store-from-a-wipe]

duration: ~35 minutes
completed: 2026-10-01
---

# Quick Task 261001-fz5: Distinguish a dev-secret-vault clear from a store Summary

**A dev-secret-vault credential wipe now carries `op=wipe` and a store `op=store` on the same `[dev-secret-vault] write key=<slot>` line, via a required typed direction parameter that tsc proves has no gap — with the clear path's on-disk write behaviour proven byte-for-byte unchanged.**

## Performance

- **Tasks:** 3/3 completed
- **Files modified:** 2 source/test files, 1 todo moved+edited
- **Commits:** 1 (`afb0fe744`) — per the plan's explicit instruction, Task 3 folds the Task 1/2 source changes into its own single `git add` → `pnpm planning-gates` → `git commit` invocation, rather than one commit per task. This SUMMARY therefore records one commit, not three.

## Accomplishments

- `writeSlot()` in `src/backend/sidecar/devSecretVault.ts` now takes a fourth, **required** parameter, `direction: WriteDirection` (`'store' | 'wipe'`), interpolated into the log line as `op=${direction}`. No default exists — a future call site cannot emit a direction it never considered.
- All three store call sites (`DevVaultTokenStore.setToken`, `DevVaultHumbleSecretStore.setSecret`, `DevVaultSteamGridDbSecretStore.setApiKey`) pass `'store'`; `clearSlot()` passes `'wipe'` and keeps its `writeSlot(path, slot, '')` delegation otherwise unchanged, so the disk write for a clear is byte-for-byte what it was before this change.
- Guardrail (b)'s header text, `writeSlot`'s doc comment, and `clearSlot`'s doc comment were all corrected in the same pass so none of the three still describes behaviour the code has stopped having.
- Four wipe/store lines are now pinned by strict string equality in `devSecretVault.test.ts`: the Steam slot's store and wipe lines (one test), both Humble slots' (`sessionCookie`, `csrfToken`) wipe lines plus their on-disk present-and-empty state (a second test), and the SteamGridDB slot's wipe line (a third test). The Steam test also pins that the old direction-free line (`write key=steam-refresh-token`, no `op=`) is no longer emitted by any path.
- The clear path's disk behaviour is proven unchanged: after a clear, the vault JSON's slot key is present (not deleted) and holds the empty string, the JSON still parses, and the file mode is still `0o600`.
- The pre-existing leak-scan test (`'...NO logged argument leaks...'`) was re-run **completely unmodified** and stays green, as instructed — no edit was made there.
- The todo is closed into `.planning/todos/completed/` with `status: RESOLVED`, `resolved: 2026-10-01`, and a resolution section naming the direction chosen, the exact line texts, and two honest limits (CI reads no log file; the sibling "failed QR login leaves no trace" todo stays open).

## Task Commits

1. **Task 1: Thread a typed write direction through the vault, end to end, on the Steam slot** — no separate commit; folded into the Task 3 commit per the plan's explicit instruction.
2. **Task 2: Expand the pins to the Humble and SteamGridDB wipe paths** — no separate commit; folded into the Task 3 commit per the plan's explicit instruction.
3. **Task 3: Close the todo into completed/ and commit** — `afb0fe744` (fix) — contains all source changes from Tasks 1 and 2, plus the todo rename and frontmatter/resolution edit, staged together (`git add -A .planning/todos src/backend/sidecar`), gated (`pnpm planning-gates`, 12/12 passed), then committed in one invocation.

## TDD Compliance (Task 1)

**RED** — added the pinning test (`'a store and a wipe of the Steam slot emit distinct, strictly-pinned direction lines...'`) to `devSecretVault.test.ts` before any implementation change, then ran it in isolation:
```
Expected: true
Received: false
  at src/backend/sidecar/__tests__/devSecretVault.test.ts:371:7
```
Failed for the expected reason — no `op=store` line existed yet, only the direction-free `write key=steam-refresh-token` line. Confirmed RED, not a typo or setup error.

**GREEN** — implemented `WriteDirection`, threaded it through `writeSlot`/`clearSlot`/the three setters, updated the doc comments, and re-ran: full `devSecretVault.test.ts` suite green (221/221 suites, 5126/5129 tests passed, 3 pre-existing skips), `pnpm codecheck` exit 0 (the load-bearing proof that no direction-free call site survives), `npx prettier --check` clean on both changed files after one `--write` pass to match the wrapped multi-line `logWarning(...)` call and new type's doc comment.

## Files Created/Modified

- `src/backend/sidecar/devSecretVault.ts` — `WriteDirection` type added; `writeSlot()` gained a required 4th parameter; `clearSlot()` and all three setter call sites updated; guardrail (b) header text, `writeSlot`'s doc comment, and `clearSlot`'s doc comment corrected.
- `src/backend/sidecar/__tests__/devSecretVault.test.ts` — one new import (`steamGridDbSecretStoreModule` from `backend/steamgrid/secretStore`); three new tests (Steam store+wipe+direction-free-absent, both Humble wipes + on-disk state, SteamGridDB wipe).
- `.planning/todos/completed/2026-10-01-dev-secret-vault-write-log-line-cannot-tell-a-store-from-a-wipe.md` — moved from `pending/`, gained `status: RESOLVED`/`resolved: 2026-10-01` frontmatter and a `## Resolution` section.

## Decisions Made

All decisions were pre-made in the plan's own `<decision>` block (Option B, the closed-set required-parameter shape) and were re-verified live rather than re-litigated:
- Re-confirmed at HEAD that `write key=` had exactly 2 occurrences in shipped source (the module's own doc comment and log call) before making the change, matching the plan's `measured_at_planning_time` table.
- Re-confirmed no pre-existing equality or call-count pin on the write line existed, so the blast radius of the change was exactly as the plan described (nothing needed un-pinning).
- Re-confirmed `getSteamGridDbSecretStore()` is exported from `backend/steamgrid/secretStore` — the plan's Task 2 assumption about that import path held exactly; no substitute reach-in was needed.

## Deviations from Plan

None — plan executed exactly as written, including the explicit Task 3 commit-folding instruction (one commit covering Tasks 1–3's changes, rather than one commit per task) and the explicit instruction to re-run the leak-scan test unmodified.

## Issues Encountered

- **Pre-existing, unrelated test flakiness observed, not caused by this change.** Running the full test suite together with `devSecretVault.test.ts` intermittently surfaced one failure in `src/backend/sidecar/__tests__/appShellFlows.test.ts` (and, in one earlier full-suite run, unrelated failures in `depot.test.ts` and `installedJsonWatcher.test.ts`). Confirmed out of scope: `appShellFlows.test.ts` contains no reference to `devSecretVault` (`grep` returned nothing), and running it in isolation passes cleanly every time. This is pre-existing cross-suite flakiness (timer/teardown interaction across the large test run, consistent with this project's own recorded "worker process has failed to exit gracefully" warning printed on every full run), not something introduced by this plan's two-file diff. Per the executor's scope boundary, this was not touched and is not logged to a separate deferred-items file since it is a known, already-documented class of pre-existing flakiness in this suite, not a new defect.

## Verification

All of the plan's `<verification>` commands were run and passed, scoped to `src/backend/sidecar/__tests__/devSecretVault.test.ts` in isolation (the suite's own correctness, not full-suite ordering):

1. `npx jest --selectProjects Backend src/backend/sidecar/__tests__/devSecretVault.test.ts` — green (221/221 suites, every guardrail test including the leak scan, both bootstrap-wiring tests, and the three new direction tests).
2. `pnpm codecheck` — exit 0.
3. `npx prettier --check src/backend/sidecar/devSecretVault.ts src/backend/sidecar/__tests__/devSecretVault.test.ts` — clean.
4. `pnpm planning-gates` — 12/12 passed, run with the todo move staged.
5. `git status --porcelain -- .planning/todos src/backend/sidecar` — empty.

Deliberately NOT run, per the plan: `npx prettier --check` over any `.planning/` path (measured `ignored: true` at planning time — vacuous).

## User Setup Required

None — no external service configuration, no live gate required. The fix is desk-verifiable: pinned by unit tests and typecheck, no runtime app launch needed.

## Next Phase Readiness

The todo this quick task resolves is closed. Its cross-referenced sibling todo — a failed Steam QR login leaves no trace in `gamelib.log` — remains open and untouched, as documented in both the todo's resolution section and this summary's honest limits above.

---
*Quick task: 261001-fz5*
*Completed: 2026-10-01*

## Self-Check: PASSED

- `src/backend/sidecar/devSecretVault.ts` — FOUND, contains `WriteDirection` and `op=${direction}`.
- `src/backend/sidecar/__tests__/devSecretVault.test.ts` — FOUND, contains all three new pinning tests.
- `.planning/todos/completed/2026-10-01-dev-secret-vault-write-log-line-cannot-tell-a-store-from-a-wipe.md` — FOUND.
- `.planning/todos/pending/2026-10-01-dev-secret-vault-write-log-line-cannot-tell-a-store-from-a-wipe.md` — CONFIRMED ABSENT.
- Commit `afb0fe744` — FOUND in `git log`.
