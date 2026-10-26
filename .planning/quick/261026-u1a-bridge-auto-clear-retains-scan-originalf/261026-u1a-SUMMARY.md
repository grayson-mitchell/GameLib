---
phase: quick-261026-u1a
plan: 01
status: complete
commits: [fa466406e, 8ff448e5f]
---

# Quick 261026-u1a: retain scan originalFingerprints through auto-clear

`clearBridgeScanVerdict` now keeps a non-empty `scan.originalFingerprints` as top-level `bridge.originalFingerprints`, and `launchBridgeGame` falls back to it (`scan ?? top-level`), so an unchanged `.gamelib-orig` no longer triggers the lif rescan after an auto-clear.

## Commits
- fa466406e: retain fingerprints in clearBridgeScanVerdict, type field, schema fix, tests
- 8ff448e5f: launch fallback in games.ts, tests D/E

## Deviation
**[Rule 1 - Bug]** `bridgeVerdictSchema` and `bridgeScanVerdictSchema` (non-strict zod) stripped `originalFingerprints` on every `readBridgeVerdict`. So even `scan.originalFingerprints` never reached `placeShimForGame` in production, and a retained top-level copy would have been stripped too. Declared it in both schemas (bridgeVerdict.ts). Added a read round-trip test.

## Verification
- jest games + bridgeVerdict + shimGenerate: 540 passed
- prettier --check clean on all five paths; `npx tsc --noEmit` passes
- shimGenerate.ts has no diff; backupFingerprintChanged untouched
- Existing shim-level coverage: shimGenerate.test.ts:2723 (matching persisted fingerprint stays already-placed) and :2700 (no persisted fingerprint is NOT already-placed)
- Games tests D/E were written alongside the fix; a separate RED run for them was not performed (bridgeVerdict tests A/B were confirmed RED first).
- Todo moved to .planning/todos/completed/ (uncommitted).
- Not performed: live UAT re-check of item 21 (The Age of Decadence).
