---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
fixed_at: 2026-10-25T00:00:00Z
review_path: .planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 53: Code Review Fix Report

**Fixed at:** 2026-10-25 (ledger written 2026-10-26)
**Source review:** .planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-REVIEW.md
**Iteration:** 1

**Summary:**

- Findings in scope: 9 (CR-01, WR-01..WR-08; IN-01..IN-04 out of scope)
- Fixed: 9
- Skipped: 0

`/gsd-code-review --fix` did not apply these fixes. Gap-closure plans 53-10, 53-11 and 53-13 did,
each test-first. This ledger was written afterwards to map every finding to its commit. Their
tests are green as of the 2026-10-26 validation audit (`53-VALIDATION.md`).

## Fixed Issues

### CR-01: Flat exports for `_ret`-modelled struct returns use the wrong Win64 ABI

**Files modified:** `meta/gen_vtables.ts`, `meta/__tests__/gen_vtables.test.ts`, `meta/sdk/isteaminput006.manifest.json`, `meta/sdk/isteamgameserver014.manifest.json`, `meta/sdk/isteamgameserver015.manifest.json`
**Commit:** 52734bedf (failing tests), 04ed2e55a, 624e3e094 (plan 53-10)
**Applied fix:** Flat exports follow the Win64 C ABI for struct returns. A 1/2/4/8-byte struct comes back in RAX. Any other size takes the hidden return pointer in RCX, with self in RDX, and the export returns that pointer. The manifests model struct returns as `class` + `structSize`.

### WR-01: Vtable proxies for `_ret` struct returns return NULL instead of the hidden pointer

**Files modified:** `meta/gen_vtables.ts`, `meta/__tests__/gen_vtables.test.ts`
**Commit:** 04ed2e55a, 624e3e094 (plan 53-10)
**Applied fix:** Fixed with CR-01. The generator refuses x64 `_ret` manifests, so no proxy is emitted with the NULL-returning shape.

### WR-02: AnyCPU rule ignores COMIMAGE_FLAGS_ILONLY

**Files modified:** `src/backend/storeManagers/steam/bridge/managedImports.ts`, `src/backend/storeManagers/steam/bridge/__tests__/managedImports.test.ts`
**Commit:** 54e7b6284 (plan 53-13)
**Applied fix:** An assembly reads as x64 under AnyCPU only when ILONLY is set. Mixed-mode I386 assemblies keep their machine arch.

### WR-03: Census CALL evidence regex depends on the per-chunk log prefix

**Files modified:** `meta/bridgeCensus.ts`, `src/backend/storeManagers/steam/bridge/helperProcess.ts`, `src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts`
**Commit:** 467c2a30f (census side, plan 53-11), 4b80a1ec9 (producer side, plan 53-13)
**Applied fix:**

- **Census side:** `attributeHelperLines` attributes each continuation line to the nearest preceding `bridge helper [<appid>]:` prefix.
- **Producer side:** the relay prefixes every stderr line with its appid.

### WR-04: Helper CALL trace fires before dispatch succeeds

**Files modified:** `native/steam-bridge/helper/bridge_helper.c`, `src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts`
**Commit:** db507407f (plan 53-13)
**Applied fix:** `CALL` is logged only after `status == STATUS_OK`.

### WR-05: `managedScan` verdict can pair one arch's assembly count with another arch's unserved count

**Files modified:** `src/backend/storeManagers/steam/bridge/shimGenerate.ts`, `src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts`
**Commit:** 54e7b6284 (plan 53-13)
**Applied fix:** The managed verdict reads one dll key for both counts.

### WR-06: REPORT_VERSION has no helper-side rate limit

**Files modified:** `native/steam-bridge/helper/bridge_helper.c`, `src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts`
**Commit:** db507407f (plan 53-13)
**Applied fix:** `g_nover_logged` caps NOVER at 16 lines per process. The real-clang integration test sends 20 frames and asserts 16 NOVER lines.

### WR-07: Generator size guard treats a missing `structSize` as 0

**Files modified:** `meta/gen_vtables.ts`, `meta/__tests__/gen_vtables.test.ts`
**Commit:** 04ed2e55a (plan 53-10)
**Applied fix:** A class return without `structSize` now fails generation instead of overflowing `out`.

### WR-08: SteamFriends018 manifest's explicit `_ret` plus `class` shape shifts flat arguments

**Files modified:** `meta/sdk/isteamfriends.manifest.json`, `meta/__tests__/gen_vtables.test.ts`
**Commit:** 624e3e094 (plan 53-10)
**Applied fix:** The Friends018 params are corrected, and with the x64 `_ret` refusal the shifted shape can no longer be generated.

## Out-of-scope items also resolved

| Finding | Resolution |
|---------|------------|
| IN-01: `g_call_seen` declaration splits the T-52-09 comment | Fixed in db507407f (53-13): latch declaration moved above the comment |
| IN-02: Census module-level accumulators are never reset | Fixed in 467c2a30f (53-11): `resetCensusAccumulators` at the top of `runCensus` |
| IN-03: `isContainedWithin` rejects children whose names start with `..` | Fixed in 8a155aabd (quick 261026-ku9); todo in `.planning/todos/completed/2026-10-25-bridge-scan-iscontainedwithin-dotdot-prefix.md` |
| IN-04: `detectEngine` classifies any top-level `*_data` entry as Unity | Fixed in 467c2a30f (53-11): `<x>_data` counts only beside `<x>.exe` or `UnityPlayer.dll` |

---

_Fixed: 2026-10-25_
_Ledger: Claude, 2026-10-26_
