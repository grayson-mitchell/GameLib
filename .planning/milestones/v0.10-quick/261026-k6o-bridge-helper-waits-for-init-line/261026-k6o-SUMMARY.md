---
phase: quick-261026-k6o
plan: 01
status: complete
requirements: [51-REVIEW-WR-02]
commits: [977f6d2db, 18a9d0bc3]
live_gate: pass (slow path not observed)
---

# Quick 261026-k6o: Bridge helper waits for READY line Summary

The helper emits one `READY  init=<ok|failed|dylib-missing> appid=<id>` stderr line right before its accept loop. The backend waits for it (20 s, unref'd) before the HEALTH/WHOAMI poll.

## Tasks

1. Task 1 (977f6d2db): C READY line; `READY_LINE`, `INIT_WAIT_BUDGET_MS`, `waitForInit`, entry `initOutcome`/`initReady` in helperProcess.ts. Exit or error before READY gives `unreachable` at once. A timeout logs a warning and falls through to the existing bounded poll. READY with a mismatched appid is ignored (T-k6o-01). Five new unit tests; `emitListenLine` now emits READY by default (`null` opts out).
2. Task 2 (18a9d0bc3): corrected the false "HEALTH before InitFlat" docs in bridge_helper.c and helperProcess.ts; added a READY-after-LISTEN assertion to the REPORT_INIT integration test; rebuilt the helper.
3. Task 3: live slow-init gate, PASS with a finding (see Live gate). Todo closed.

## Verification

- helperProcess.test.ts and helperIntegration.test.ts: 40/40 pass. tsc is clean; prettier is green on all written .ts paths.
- `pnpm build-steam-bridge` succeeded (`Helper compiled ->` printed; zig shim gates passed). Helper mtime is Oct 26 14:40:13 2026 (`public/bin/arm64/darwin/steam-bridge-helper`).

## Deviations

[Rule 1] The existing test "a LISTEN line split across two chunks still resolves the port" emitted LISTEN only, so it hung on the new READY wait. I added `emitReadyLine` to it. No production change.

## Notes

The sidecar must be restarted (`pnpm tauri dev`) to load the rebuilt backend and helper. Whether InitFlat ever blocks more than 3 s is still unproven. The live gate below measured it.

## Live gate (2026-10-26, operator Mac, Abiotic Factor 427410 / Tormented Souls 1363080)

Each gap is LISTEN to INIT to READY in the helper's own stderr (1 s timestamps, `~/Library/Logs/GameLib/gamelib.log`):

| Steam state | Result | Gap |
|---|---|---|
| Quit (baseline, pre-fix binary) | InitFlat failed: `Could not determine Steam client install directory`; status=not-inited | 0 s |
| Signed in (post-fix) | `READY  init=ok appid=427410`; launch proceeded to redists | 0 s |
| Started, launched immediately while still signing in (post-fix) | InitFlat failed: `ConnectToGlobalUser failed`, `READY  init=failed` for both the full and 480 helpers; status=not-inited | 0 s |

Finding: InitFlat never blocked. In every Steam state reached it returned in under 1 s, failing fast rather than waiting for Steam. WR-02's slow-init premise was never seen; the one state not exercised was a pending Steam client update. The READY wait stays as a safeguard: readiness is now gated on an explicit init-finished signal instead of an implicit ~3 s budget, and READY was emitted correctly on every post-fix run.

Follow-up: launching while Steam is quit or still signing in fails at once with the "signed out" setup dialog. Captured as todo `2026-10-26-bridge-launch-fails-fast-while-steam-is-quit-or-signing-in.md`.
