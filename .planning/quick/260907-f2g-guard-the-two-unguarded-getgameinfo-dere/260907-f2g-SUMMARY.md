---
phase: quick-260907-f2g
plan: '01'
subsystem: steam
tags: [protocol-handler, wine-tools, getGameInfo, D-01, guard-clause, red-proof]
requires:
  - D-01 (260905-luf): SteamGame.getGameInfo() returns `{} as GameInfo` on a double cache miss as a deliberate cross-runner sentinel
  - 260907-e7a: the getGameInfo() census that identified these two sites as class 6
provides:
  - findGame()'s explicit-runner branch returns `undefined` for the D-01 sentinel
  - runWineCommandOnGame() returns the handled no-op shape when GameInfo carries no install path
affects:
  - src/backend/protocol.ts
  - src/backend/tools/index.ts
tech-stack:
  added: []
  patterns:
    - "Call-site guard for the D-01 sentinel, never a change to the `{}` return itself"
    - "Guard + early-return + logError, matching the shape of the adjacent guard, rather than a bare optional chain"
key-files:
  created:
    - src/backend/tools/__tests__/runWineCommandOnGameGuard.test.ts
  modified:
    - src/backend/protocol.ts
    - src/backend/__tests__/protocol.test.ts
    - src/backend/tools/index.ts
    - .planning/todos/completed/2026-09-07-two-unguarded-getgameinfo-derefs-protocol-findgame-and-runwinecommandongame.md
decisions:
  - "Site 2's fix is guard + early-return + logError, NOT the optional chain the filed todo proposed: `WineCommandArgs.gameInstallPath` is optional, so an optional chain type-checks and turns a loud TypeError into a silent bad-arg Wine run."
  - "Site 2's tests use `runner: 'gog'`, not `'steam'` — the 'steam' early return at tools/index.ts:879 precedes the deref, so a Steam runner would make every test in the file vacuous."
  - "dxvkEvidenceLines.test.ts:24-27's importability docstring is inaccurate but was NOT edited (out of scope); the correction is recorded in the closed todo and the new test file's header."
metrics:
  duration: ~35 min
  completed: 2026-09-07
  tasks: 2
  commits: 3
  tests_added: 5
---

# Quick 260907-f2g: Guard the Two Unguarded getGameInfo() Derefs Summary

Guarded the two class-6 `getGameInfo()` derefs from `260907-e7a`'s census — `findGame()`'s
explicit-runner branch, whose truthy `{}` defeated its own caller's `if (!gameInfo)` guard and made
every mismatched `gamelib://` deep link a silent unhandled TypeError, and `runWineCommandOnGame()`'s
unchecked `install.install_path` — each RED-proven by a test whose named hand-edit revert reproduces
the exact TypeError, plus an inverse test proving the guard is not over-broad.

## What Shipped

**Site 1 — `src/backend/protocol.ts:221-224`** (commit `50cc0a3e3`)

```ts
if (runner) {
  const gameInfo = libraryManagerMap[runner].getGame(appName).getGameInfo()
  return gameInfo.app_name ? gameInfo : undefined
}
```

One line replaced. The D-01 loop-branch sentinel check moved from L222 to L231 by the added comment
block but is **byte-identical in content** — the diff is `1 deletion / 10 insertions`, all inside the
explicit-runner branch.

**Site 2 — `src/backend/tools/index.ts:903-909`** (commit `1bef4de03`), inserted after the
`getGameInfo()` destructure at L896 and before `game.getSettings()`:

```ts
if (!install?.install_path) {
  logError(
    `runWineCommand called on ${runner} game ${appName} whose GameInfo carries no resolved install path`,
    LogPrefix.Gog
  )
  return { stdout: '', stderr: '' }
}
```

`13 insertions / 0 deletions`, so the `runner === 'steam'` (Pitfall 5) and `isNative()` early returns
above it are provably untouched and still run first.

## RED-Proofs — Both Observed, Both Verbatim Matches

Every RED was observed **twice**: once before the production change existed, once again via the named
hand-edit revert afterward. All reverts were hand-edits — never `git checkout --` (fires this repo's
post-checkout hook, which throws on a binary download) and never `git stash` (strands concurrent
sessions).

| Site | Revert | Observed failure | Matched plan's quoted gate |
|---|---|---|---|
| 1 | Hand-edit back to `if (runner) return libraryManagerMap[runner].getGame(appName).getGameInfo()` | `Rejected to value: [TypeError: Cannot read properties of undefined (reading 'getGame')]` | **Verbatim** |
| 2 | Hand-edit the whole `if (!install?.install_path) {…}` block out | `Rejected to value: [TypeError: Cannot read properties of undefined (reading 'install_path')]` | **Verbatim** |

Both were preceded by `Received promise rejected instead of resolved`, also as quoted.

Counts in both directions:

- Site 1 unguarded `1 failed, 29 passed, 30 total` → guarded `30 passed, 30 total`
- Site 2 unguarded `1 failed, 2 passed, 3 total` → guarded `10 passed, 10 total` (both tools suites)

Site 1's test drives the **caller path** (`handleProtocol(['gamelib://launch?appName=steam-1&runner=steam'])`),
not `findGame()` in isolation — the rejection originates at `protocol.ts:124`, inside `handleLaunch`,
which is what makes it a proof of the user-visible defect rather than of a helper's return value.

Each site also carries an **inverse** test (populated `GameInfo` still reaches `dispatchSteamLaunch` /
`runWineCommand` with `gameInstallPath: '/games/g'`). Site 2 adds a third, adjacent-branch parity test
pinning that the pre-existing `isNative()` branch returns the same `{ stdout: '', stderr: '' }`, so
the two guards cannot drift.

## Verification

| Gate | Result |
|---|---|
| `jest --selectProjects Backend --testPathPattern 'backend/__tests__/protocol'` | 1 suite, **30 passed, 0 failed** |
| `jest --selectProjects Backend --testPathPattern 'tools/__tests__'` | 2 suites, **10 passed, 0 failed** |
| `dxvkEvidenceLines.test.ts` source-text gate | Still green — a guard clause removes no `runWineCommand(` occurrence |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx eslint` (4 touched files) | **0 errors** (warnings pre-existing / `any`-in-mock noise) |
| `npx prettier --check` (4 touched files + the todo) | clean |
| `git diff HEAD~3 --name-only \| grep storeManagers` | **NONE** — D-01 boundary respected |
| `git status --porcelain .planning/STATE.md .planning/ROADMAP.md` | **EMPTY** — neither file touched by any means |
| Todo closure gate | `TODO_CLOSED`; `git status --porcelain .planning/todos/` empty |
| Committed todo blob vs disk | 258 lines vs 258 lines, **byte-identical** (no empty-docs-commit trap) |
| `.claude/skills/archify/`, `skills-lock.json` | Never staged; still untracked |

Suite counts were read from output, not inferred from exit codes — `--selectProjects` is
case-sensitive and can exit 0 while selecting nothing.

## Commits

| Commit | Task | Scope |
|---|---|---|
| `50cc0a3e3` | 1 | `src/backend/protocol.ts`, `src/backend/__tests__/protocol.test.ts` |
| `1bef4de03` | 2 | `src/backend/tools/index.ts`, `src/backend/tools/__tests__/runWineCommandOnGameGuard.test.ts` |
| `c0d2b1db9` | 2 | the todo move + Resolution section |

Each staged by explicit path with `git diff --cached --stat` inspected first. No `gsd-sdk query commit`,
no `git add -A`, no `git commit -a`, no `git commit --only`.

## Threat Model Outcomes

| ID | Disposition | Outcome |
|---|---|---|
| T-f2g-01 | mitigate | **Achieved.** The externally-triggerable unhandled TypeError in the protocol handler is now the handled `logError` path. |
| T-f2g-02 | mitigate | **Verified by diff.** The guard only narrows a return to `undefined`; no line outside the explicit-runner branch changed. `RUNNERS.safeParse` and the confused-deputy check are untouched. |
| T-f2g-03 | mitigate | **Verified by diff.** 13 insertions / 0 deletions in `tools/index.ts`; both preceding guards byte-identical and still first. |
| T-f2g-04 | mitigate | **Achieved.** Both new log lines carry runner + appName only; no path, no prefix. |
| T-f2g-05 | mitigate | **Achieved.** Both REDs observed before the fix and re-observed via named reverts; both quoted gates matched verbatim. |
| T-f2g-SC | N/A | No packages installed. |

## Deviations from Plan

**None affecting scope or outcome.** Three notes:

1. **[Rule 3 — blocking]** The plan's Site 2 sketch had the logger mocked generically. `tools/index.ts`
   imports from `'backend/logger'` (not `'../../logger'`), so the test uses
   `jest.mock('backend/logger', …)` with `jest.requireActual('backend/logger/constants')` for a real
   `LogPrefix` — the guard's `LogPrefix.Gog` is asserted against its true value, not a stand-in. This
   is the plan's own stated option ("a factory preserving LogPrefix"), not a departure.
2. The plan's Task 2 Step 5 sequencing put the revert after tsc/lint; run as written.
3. `graphify update .` was run per CLAUDE.md. **The recorded hazard did not materialize**: `graph.html`
   was *regenerated* (40,815,947 bytes, fresh timestamp), not deleted. `graphify-out/` is gitignored,
   so this touched no commit.

## Plan Accuracy

Every measured fact in the plan held at execution. Specifically re-confirmed:

- HEAD was `bc47c9e80`, the plan's stated baseline.
- Both quoted TypeError strings reproduced **verbatim** — the harness reached the intended branch in
  both cases, so neither RED was red-for-the-wrong-reason.
- `WineCommandArgs.gameInstallPath` is `?: string` (`src/common/types.ts:766`), confirming the
  planner's correction of the todo's optional-chain proposal.
- `src/backend/jest.config.js` sets `resetMocks: true`; all return values assigned in `beforeEach`/test.
- Backend `displayName` is exactly `Backend`.
- `dxvkEvidenceLines.test.ts:24-27`'s claim that `tools/index.ts` "must not be imported under the
  backend jest project" is **false** — the new suite imports it for real with two mock factories and
  runs in 0.836s. The docstring was not edited (out of scope) and remains inaccurate at HEAD.

Nothing in the plan was found wrong when measured against source.

## Known Stubs

None.

## Threat Flags

None. Neither change introduces new network, auth, filesystem, or schema surface; both strictly narrow
existing behavior at a trust boundary.

## Self-Check: PASSED

- `src/backend/tools/__tests__/runWineCommandOnGameGuard.test.ts` — FOUND
- `src/backend/protocol.ts`, `src/backend/tools/index.ts`, `src/backend/__tests__/protocol.test.ts` — FOUND
- `.planning/todos/completed/2026-09-07-…-runwinecommandongame.md` — FOUND (`status: RESOLVED`, `resolved_by: quick-260907-f2g`)
- `.planning/todos/pending/2026-09-07-…-runwinecommandongame.md` — ABSENT (correct)
- Commits `50cc0a3e3`, `1bef4de03`, `c0d2b1db9` — all FOUND in `git log`
