---
phase: 18-macos-32-bit-detection-badge-crossover-routing
verified: 2026-07-13T09:10:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 5/5
  gaps_closed:
    - "MAC32-04 (18-06 gap closure): forceUninstall() no longer orphans an owned Steam game during i386 recovery (or any forced uninstall) — the library entry is kept (is_installed:false, install:{}), mac_arch:'32' survives via spread, the mutated Map is persisted immediately to steamLibraryStore, and the pushGameToLibrary IPC payload carries the preserved badge data. Closes 18-UAT.md test 5's forceUninstall-orphan finding and the WR-01-class missing-persist divergence."
  gaps_remaining: []
  regressions: []
---

# Phase 18: macOS 32-bit detection, badge & CrossOver routing — Verification Report

**Phase Goal:** Detect a Steam game's macOS build architecture and route 32-bit-only mac games to CrossOver/Wine instead of a native install that fails on modern macOS, surfacing the game's OS/arch as a badge beside the game logo in the left panel.
**Verified:** 2026-07-13T09:10:00Z
**Status:** passed
**Re-verification:** Yes — gap closure (plan 18-06, forceUninstall keep-entry fix for UAT test 5's orphan/badge-blink-out finding)

## Goal Achievement

### Observable Truths (18-06 must_haves, focus of this re-verification)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After `forceUninstall()` runs, the appId REMAINS in the in-memory `library` Map (not deleted), with `is_installed:false` and `install:{}` | ✓ VERIFIED | `games.ts:863-872` — `const existing = library.get(this.appId); if (existing) { const updated = {...existing, is_installed:false, install:{}}; library.set(this.appId, updated) ... }`; `library.delete` no longer appears in executable code (only in a comment explaining what it used to do); test `games.test.ts:1779-1788` asserts `library.has(APP_ID)` stays `true`, `is_installed` is `false`, `install` deep-equals `{}` |
| 2 | Every other field is preserved via spread, so `mac_arch:'32'` survives — the badge does not blink out during i386 recovery | ✓ VERIFIED | `games.ts:866` — `{ ...existing, is_installed: false, install: {} }` spreads all other fields including `mac_arch`; test `games.test.ts:1800-1832` (`GAP-18-06`) seeds `mac_arch:'32'` and asserts `library.get(APP_ID)?.mac_arch === '32'` post-uninstall |
| 3 | `forceUninstall()` persists the mutated Map to `steamLibraryStore` immediately (`steamLibraryStore.set('games', Array.from(library.values()))`) | ✓ VERIFIED | `games.ts:870` — persist call present, positioned AFTER `library.set` (line 867) so the persisted snapshot reflects the updated entry; `steamLibraryStore` added to the `electronStores` import (`games.ts:20`); test asserts `steamLibraryStore.set` was called with `'games'` and an array (`games.test.ts:1818-1821`) — see Anti-Patterns section for a WARNING on this assertion's precision, which does not change the underlying code correctness |
| 4 | The `pushGameToLibrary` IPC payload carries `is_installed:false` AND `mac_arch:'32'` | ✓ VERIFIED | `games.ts:871` — `sendFrontendMessage('pushGameToLibrary', updated)` pushes the same spread-preserved object; test `games.test.ts:1824-1831` asserts `expect.objectContaining({ app_name: APP_ID, is_installed: false, mac_arch: '32' })` |
| 5 | A regression test fails if `forceUninstall()` is reverted to `library.delete()`, omits the `steamLibraryStore` persist, or drops `mac_arch` from the pushed payload | ✓ VERIFIED | Reverting to `library.delete()` fails `games.test.ts:1779-1788` (`library.has` would be `false`); omitting the persist fails `games.test.ts:1818-1821` (`steamLibraryStore.set` not called); dropping `mac_arch` from the push fails `games.test.ts:1824-1831`. All three named regression classes are locked. (Note: a *content*-level persist regression — e.g. persisting a stale snapshot before the `library.set` — is not caught by the current assertion; flagged as WARNING below, not a must-have failure since the literal regression classes named in this truth are covered.) |

**Score:** 5/5 truths verified

### Regression Check — Previously-Verified MAC32-01/02/03 (quick pass, not re-derived)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| R1 | MAC32-01: pre-install min-OS heuristic never asserts `'32'` | ✓ VERIFIED (unchanged) | `git diff --stat 16023237..HEAD -- src/` shows only `games.ts` and `games.test.ts` changed; `macArchFromMinOS` (untouched lines) still returns `'64' \| 'unknown'` |
| R2 | MAC32-02: confirmed-32-bit mac build routes through CrossOver/Wine bottle | ✓ VERIFIED (unchanged) | `isBottleEligible()` (`games.ts:606-618`, untouched by this diff) still reads `steamMetadataStore` directly |
| R3 | MAC32-03: post-install Mach-O check is sole ground truth for `'32'` | ✓ VERIFIED (unchanged) | `library.ts` untouched by 18-06 (0 diff lines); `library.test.ts` full suite: 110/110 passing, including all `verifyMacArchGroundTruth` and `promptI386Recovery` describe blocks |
| R4 | MAC32-04 (prior gap, 18-05): badge propagates end-to-end from Mach-O verdict to frontend render | ✓ VERIFIED (unchanged) | `verifyMacArchGroundTruth()`'s propagation block (`library.ts:644-666`, untouched by 18-06) still wires Map → store → IPC push; frontend `MacArchBadge.tsx` untouched |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/backend/storeManagers/steam/games.ts` | `forceUninstall()` keep-entry pattern: `library.set` + `steamLibraryStore.set('games', ...)` + `sendFrontendMessage('pushGameToLibrary', ...)`, replacing `library.delete` | ✓ VERIFIED | Lines 863-877; `steamLibraryStore` imported at line 20; JSDoc (lines 844-862) updated to describe keep-entry behavior and cites `GAP-18-06-FORCEUNINSTALL-ORPHAN` |
| `src/backend/storeManagers/steam/__tests__/games.test.ts` | Updated forceUninstall/promptI386Recovery keep-entry assertions + new `mac_arch` regression test | ✓ VERIFIED | `describe('SteamGame.forceUninstall()')` (1772-1833) — keep-entry test (1779-1788) + `GAP-18-06` mac_arch-survival test (1800-1832); `promptI386Recovery() — MAC32-03` confirmed-dialog test (1876-1904) updated to assert `library.has(APP_ID)` stays `true` and `is_installed` is `false` instead of the old delete assertion |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `forceUninstall()` | in-memory `library` Map (keep-entry) | `library.set(this.appId, {...existing, is_installed:false, install:{}})` | ✓ WIRED | `games.ts:866-867` |
| `forceUninstall()` | `steamLibraryStore` persisted `games[]` | `steamLibraryStore.set('games', Array.from(library.values()))` | ✓ WIRED | `games.ts:870`, called after the Map mutation so the snapshot is current |
| `forceUninstall()` | frontend `GameInfo` (badge data) | `sendFrontendMessage('pushGameToLibrary', updated)` | ✓ WIRED | `games.ts:871` |
| `promptI386Recovery()` (`library.ts:746`) | `forceUninstall()` | direct call, unchanged | ✓ WIRED (regression-checked) | `games.test.ts:1876-1904` — confirmed-dialog test verifies `library.has(APP_ID)` stays `true` post-recovery |
| `askForceUninstall()` general path (`utils.ts:295`) | `forceUninstall()` | direct call, unchanged | ✓ WIRED (unchanged, not newly tested) | Out of 18-06's stated scope per code review IN-03 — see Anti-Patterns |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `games.test.ts` full suite | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts` | 121/121 tests pass (up from 120 pre-18-06, +1 new regression test); trailing post-suite Jest exit-code-1 crash confirmed pre-existing (reproduced identically on a `git worktree` checkout of `c40def65~1`, unrelated `pollInstallOnce`/`readAcfState` stray timeout, out of 18-06 scope) | ✓ PASS |
| `library.test.ts` full suite (regression check, untouched file) | `npx jest src/backend/storeManagers/steam/__tests__/library.test.ts` | 110/110 tests pass, no trailing crash | ✓ PASS |
| `npx tsc --noEmit` on `games.ts` | `npx tsc --noEmit -p tsconfig.json \| grep -i games.ts` | No output — no type errors | ✓ PASS |
| `library.delete` absent from executable code | `grep -n "library.delete" games.ts` | Only match is inside a JSDoc comment ("never `library.delete`'d") — no executable occurrence | ✓ PASS |
| Scope fence: only `games.ts`/`games.test.ts` touched since 18-UAT | `git diff --stat 16023237..HEAD -- src/` | 2 files changed (35 insertions/-, 48 insertions in test file); `library.ts`, `MacArchBadge.tsx`, bottle poller all untouched | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MAC32-01 | 18-01, 18-02 | Read Steam mac arch signal, missing/blank never asserts 32-bit | ✓ SATISFIED (unchanged, regression-checked) | Untouched by 18-06; `git diff` confirms no change |
| MAC32-02 | 18-02 | Confirmed-32-bit mac game routes through bottle | ✓ SATISFIED (unchanged, regression-checked) | Untouched by 18-06 |
| MAC32-03 | 18-03 | Post-install Mach-O ground truth re-routes an i386-only binary | ✓ SATISFIED (unchanged, regression-checked) | `library.ts` untouched; 110/110 `library.test.ts` tests pass |
| MAC32-04 | 18-04, 18-05, 18-06 (gap closure) | Left-panel badge shows "32" mark, actionable warning on macOS | ✓ **SATISFIED (gap closed)** | 18-05 wired the propagation path; 18-06 closes the recovery/orphan regression found in UAT test 5 — forceUninstall() now preserves the badge-carrying entry through uninstall/recovery |

`.planning/REQUIREMENTS.md` lines 109-112 and the tracking table (lines 212-215) already show all four MAC32-0x rows as `[x]` / "Complete" — consistent with this verification, no stale-doc issue this cycle.

No orphaned requirements — all 4 IDs (MAC32-01 through MAC32-04) declared across the phase's plan frontmatter (18-01 through 18-06), matching REQUIREMENTS.md's phase-18 mapping exactly.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `games.test.ts` | 1817-1821 | GAP-18-06 persist assertion checks only `steamLibraryStore.set` was called with `'games'` + `expect.any(Array)`, not that the persisted array actually contains the badge-preserving entry (code-review WR-01, `18-REVIEW.md`) | ⚠️ Warning (test precision, not a functional defect) | The underlying code is correct — `library.set` runs before `steamLibraryStore.set(Array.from(library.values()))` (verified by direct code read, `games.ts:867,870`) — but a future regression that persisted a stale/wrong snapshot would slip past this specific assertion. Recommend tightening per the code review's suggested fix (`persisted.toEqual(expect.arrayContaining([...]))`) in a follow-up, non-blocking |
| `games.ts` | 873-876 | `logInfo` unconditionally claims the entry was "kept" even when `existing` was `undefined` (code-review IN-01) | ℹ️ Info | Misleading log message during log-driven diagnosis of the exact orphan scenario this fix targets; does not affect behavior |
| `games.ts` | 863-872 | Absent-entry branch (appId not in Map) is untested (code-review IN-02) | ℹ️ Info | Intended no-op behavior change from the old implementation (which pushed even when absent); not covered by a regression test, so a future regression here is invisible to the suite |
| `games.ts` | 863 (caller `utils.ts:295`) | Keep-entry change also silently widens behavior for `askForceUninstall()`'s generic path, not just the i386-recovery caller (code-review IN-03) | ℹ️ Info | Arguably correct for Steam (an owned game should stay browsable as not-installed), but outside the plan's stated scope and untested for that caller |

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` debt markers found in `games.ts` or `games.test.ts`.

None of the above rise to blocker level — the code review that produced them found **0 critical/blocking issues** (`18-REVIEW.md` frontmatter: `critical: 0, warning: 1, info: 3`), and the WARNING concerns test assertion precision, not the actual runtime behavior (which was independently confirmed correct by direct code trace during this verification).

### Human Verification Required

None. All 5 must-have truths for 18-06 verify programmatically against the codebase (direct code trace + passing regression tests), and the regression check against MAC32-01/02/03 is confirmed via an unchanged-file diff plus a fully green `library.test.ts` run. The remaining UAT test-5 items (60s bottle-reinstall silent timeout with no on-screen feedback, and simultaneous multi-game recovery-dialog prompts) are explicitly out of 18-06's scope fence and tracked as separate todos, not part of this gap closure's must-haves.

### Deferred Items (out of 18-06 scope, tracked separately — not gaps of this phase)

| # | Item | Tracked As |
|---|------|-----------|
| 1 | Bottle reinstall (CrossOver Steam install dialog handoff) silently times out at the 60s grace window with no on-screen feedback | 18-UAT.md test 5 note; captured as a general Phase 17-rooted bottle-completion-feedback concern, explicitly fenced out of plan 18-06's scope |
| 2 | Two simultaneous i386-recovery dialogs can fire at once (startup download-resume racing with recovery prompts) | 18-UAT.md test 5 note; Phase 3-rooted (`steam-startup-download-resume-autoopens-crossover.md` todo), explicitly out of Phase 18 |

### Gaps Summary

None. Plan 18-06 closes the single Phase-18-scoped gap identified by 18-UAT.md test 5: `forceUninstall()` previously called `library.delete(this.appId)`, orphaning the owned game and blinking out its `mac_arch:'32'` badge during i386 recovery (or any forced uninstall) if the subsequent bottle reinstall did not complete. The fix now mirrors the canonical keep-entry pattern (`pollUninstallOnce()`'s 'absent' branch): the entry is kept, marked `is_installed:false`, spread-preserves `mac_arch` and all other fields, persists immediately to `steamLibraryStore`, and pushes the badge-preserving payload over IPC. This is locked by an updated keep-entry assertion in the existing `forceUninstall()` test, an updated `promptI386Recovery()` confirmed-dialog assertion, and a new dedicated `GAP-18-06` regression test. Code review found 0 blockers. The scope fence held — only `games.ts` and `games.test.ts` were touched; `library.ts`, `MacArchBadge.tsx`, and the bottle poller are unchanged, and `library.test.ts` (110/110) plus the rest of `games.test.ts` (121/121) all pass, confirming no regression to MAC32-01/02/03.

All 4 requirement IDs (MAC32-01 through MAC32-04) are SATISFIED. The phase goal — detecting 32-bit macOS Steam builds, routing them to CrossOver/Wine, and surfacing a "32" badge beside the game logo that survives install, restart, AND recovery/uninstall transitions — is achieved end-to-end in the codebase.

---

_Verified: 2026-07-13T09:10:00Z_
_Verifier: Claude (gsd-verifier)_
