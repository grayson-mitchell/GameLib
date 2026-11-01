# Quick 261101-ip5: Exempt 1202 from the shim per-id report budget

## Commits
- 4c0ce026b fix(steam-bridge): exempt 1202 from the shim per-id report budget so the P2P fallback stays paired
- 7cfec693e docs(quick-261101-ip5): close shim report-budget todo

## What changed
- meta/gen_vtables.ts: `gl_cb_report_dispatch` budget line is now `id != 1202 && InterlockedIncrement(...) > 4` (uses `CALLBACK_LAYOUTS.P2PSessionRequest_t.id`); comment extended. Regenerated steam_api_shim.c (diff = comment + that line only).
- meta/__tests__/gen_vtables.test.ts: updated pin; new it.each over generator output and committed shim.
- net_harness_driver.c: `p2pfb-many` case; helperNetHarness.test.ts: matching test (RED confirmed first: exit 2; GREEN after the branch).
- Todo moved to completed/ with `## Result`. Helper C untouched.

## Verification
- jest: gen_vtables, callbackRegistryHost, helperNetHarness, helperIntegration: 4 suites, 505 tests passed (harness not skipped on darwin).
- pnpm build-steam-bridge: helper built, x86 and x64 compile gates passed.
- prettier --check on the three TS files clean; post-commit `pnpm gen-vtables` leaves generated/ clean; pnpm planning-gates 12/12.
- Harness-only; no live legacy-TCP-mode title (M-03 untouched).

## Deviations
None.

## Self-Check: PASSED
