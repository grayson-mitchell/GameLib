# Quick 261101-iah Summary: legacy P2P fallback accepts only the reported, allowlisted remote (WR-07)

## Commits

- 2238d27c6 `fix(steam-bridge): legacy P2P fallback accepts only the reported, allowlisted remote (WR-07)` (Tasks 1+2: helper, harness driver, jest tests)
- Task 3 docs edits (todo move, new follow-up todo, 58-VERIFICATION M-03 row) left uncommitted for the orchestrator.

## What changed

- `native/steam-bridge/helper/bridge_helper.c`: pump-time `g_p2p_last_remote` and the 16-entry accept-once table are deleted. Remote of each 1202 is recorded at slot-6 serve time into a FIFO (32); every validated slot-10 1202 report pops exactly one entry; a fallback accept happens only when `dn==0 && dheld==0` and the remote is in the sent-to ring (64, from successful SendP2PPacket) or a live member of a lobby in the lobby ring (4, from LobbyEnter response 1). Rings evict oldest (fail closed); FIFO overflow is skipped in step via a skip counter. Logs are fixed strings with their own budget; refusals log `p2p-accept src=helper action=refused`.
- Shim and generator untouched (`git diff` on generated/ and gen_vtables.ts is empty).
- Nine `p2pfb-*` cases added to `net_harness_driver.c` and `helperNetHarness.test.ts`; the 58-13 source pin in `helperIntegration.test.ts` rewritten for the new invariants.

## Verification

- `npx jest helperNetHarness helperIntegration cbqueue`: 3 suites passed, 165/165 tests passed (darwin, harness not skipped).
- `pnpm build-steam-bridge`: helper compiled; shim compile gates passed (x86 and x64).
- `npx prettier --check` on the two TS test files: clean. `pnpm planning-gates`: 12/12 passed.
- No live gate: no legacy-TCP-mode title is under live test. M-03 stays "VERIFIED with caveats".

## Residual risk

A lost slot-10 report or two shim threads running callbacks concurrently can pair a report with an adjacent served 1202. The allowlist bounds this to a peer the game already sends to or shares a lobby with, never a stranger. Separately the shim's per-id report budget (4) caps fallback accepts to the first four 1202 reports per process; filed as `.planning/todos/pending/2026-11-01-p2p-fallback-shim-report-budget.md`.

## Deviations from Plan

- [Rule 1] The test driver first inserted the `p2pfb-` dispatch in the wrong function and the lobby fake returned one member for every lobby; both fixed before the commit.
- 58-VERIFICATION M-03 row: WR-05 closed per plan; CR-02 (78b4c0b7c) and WR-08 (cb2c44563) also listed closed on commit-subject evidence; WR-03/04 left open (matching commits are phase 54/55, not 58).
- STATE.md deliberately not edited (orchestrator does it, per instruction).

## Self-Check: PASSED

Commit 2238d27c6 exists; helper, driver and test files modified; completed todo has `## Result`; follow-up todo passes the frontmatter gate.
