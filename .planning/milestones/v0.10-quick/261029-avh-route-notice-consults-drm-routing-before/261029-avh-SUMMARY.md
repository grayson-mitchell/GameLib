---
phase: quick-261029-avh
plan: 01
status: complete
commits: [939ed1618, 88597aedd]
---

# Quick 261029-avh: install route notice is DRM-aware

Row 7 of `resolveBridgeRoute` now sets `noticeRequired` to false when `resolveBridgeMode(scan.drmWrapper, undefined) === 'steamclient-layer'` (the launch path's own rule). Routing stays bridge / 'scan-miss' with the missing symbols and knownBadReason carried. The persisted scan verdict is not modified.

## Commits
- 939ed1618 fix: bridgeRoute.ts change plus 3 resolver tests (RED confirmed first: 3 failed, then 58/58 pass)
- 88597aedd test: 2 install()-level tests in the oq7 describe block, plus todo git mv pending -> completed (pure rename)

## Verification
- bridgeRoute.test.ts: 58/58 pass. tsc clean. prettier clean. Real-call grep count: 1.
- games.test.ts `-t "scan-miss routes to the bridge"`: 7/7 pass. `pnpm planning-gates`: 12/12. `pnpm codecheck` clean.
- Full run of both test files: 503 pass, 1 fail. The failure is `quick 261024-tny: the known-fixes applier runs with (appId, bridge settings, install root)...` (games.test.ts:2119). `applySteamBridgeKnownFixes` is now called with a 4th argument (the exe path), so the test's expected args are stale. This is not caused by this change (launch path, not install/notice). It likely stems from recent commit 98837f09b, "launch Steam games from the install root". Not fixed (out of scope).

## Deviations
None to the plan. No games.ts production change was needed.

## Deferred / out of scope
1. Row 5 (`win64-no-shim`) can likewise be irrelevant to a DRM-mode title; not addressed.
2. A DRM-mode title never installed or scanned has no persisted `drmWrapper` to consult, so the install-time prediction cannot suppress anything for it.
3. Pre-existing failing test (tny known-fixes applier args), noted above.
