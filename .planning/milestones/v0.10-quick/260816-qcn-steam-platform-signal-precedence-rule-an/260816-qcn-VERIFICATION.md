---
phase: quick-260816-qcn
verified: 2026-08-16T00:00:00Z
status: passed
score: 9/9 must-haves verified
overrides_applied: 0
---

# Quick Task 260816-qcn: Steam platform-signal precedence rule and serialised merge Verification Report

**Task Goal:** Give the two Steam platform-signal writers (appdetails vs PICS oslist) an
explicit, auditable freshest-write-wins precedence rule, and serialise
`mergePlatformCapture`'s read-modify-write. Closes todo
`2026-08-16-steam-platform-signal-two-writers-no-precedence-rule.md` (Phase 34.15 review
finding WR-02).

**Verified:** 2026-08-16
**Status:** passed
**Commits under verification:** `a518d7b9d`, `b4f49e2fa`, `0a9346f3a` (base `fe12c2ceb`)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Precedence is genuinely symmetric — no source special-cased | VERIFIED | `resolvePlatformWrite` (`platformPrecedence.ts:99-142`) is the single decision function; called identically from `games.ts:673` (`source: 'appdetails'`) and `platformCapture.ts:169` (`source: 'pics'`). `platformPrecedence.test.ts` proves both directions with mirror assertions (lines 36-49 and 51-69; 71-84 and 86-104). |
| 2 | Freshest-write-wins holds; strictly-newer existing declines; ties go to incoming | VERIFIED | `resolvePlatformWrite` uses `existingCapturedAt > capturedAt` (strict `>`) for decline (`platformPrecedence.ts:110-111`). Equal-timestamp test (`platformPrecedence.test.ts:106-119`) asserts incoming wins on a tie. |
| 3 | Legacy entries (no `platformsCapturedAt`) writable by either source, no Migration added | VERIFIED | `grep -rn "new Migration\|applyMigrations" src/backend/storeManagers/steam/` finds only a comment reference explaining why no migration was added. `hasValidExistingTimestamp` guard treats absent/non-finite as "indefinitely old" (`platformPrecedence.ts:105-111`). Both-direction legacy test (`platformPrecedence.test.ts:121-135`) and games.ts legacy test (`games.test.ts:701-717`) pass. |
| 4 | All 8 carry-forward fields survive both writers, accepted and declined paths | VERIFIED | `games.ts`'s enumerated `set()` literal explicitly lists `platformsSource`/`platformsCapturedAt` alongside existing carry-forwards (lines 749-774); dedicated declined-path test asserts `mac_arch`/`mac_arch_verified`/`mac_arch_source`/`forcedWindowsViaBottle` all survive (`games.test.ts:719-741`). `platformCapture.ts`'s `mergePlatformCapture` spreads `...existing` first (line 192); dedicated test asserts all 8 fields survive an accepted PICS merge (`platformCapture.test.ts:296-336`). |
| 5 | `captureOwnedAppPlatforms` never throws, even with the new lock/precedence path | VERIFIED | `withPlatformCaptureLock` call sits INSIDE the existing `try` (`platformCapture.ts:306-314`); chain is re-pointed at a swallowed-outcome continuation before returning (lines 232-236) so a rejected section cannot poison later callers. Tests: lock-does-not-wedge (`platformCapture.test.ts:555-564`) and fail-soft-with-lock-in-place (566-585) both pass. |
| 6 | Comments state ordering is explicit/auditable but do NOT claim the conflict is resolved/reconciled/closed | VERIFIED | Read full text of `platformPrecedence.ts`, `electronStores.ts`, `platformCapture.ts`, `games.ts` new/touched sections. Every "resolved/reconciled/closed" occurrence in new code is negated ("do NOT describe... as resolved/reconciled", "Do not describe WR-02 as closed") — confirmed via targeted grep, no unnegated claim found. |
| 7 | Effective (post-precedence) triple feeds BOTH the cache write and the GameInfo push | VERIFIED | `games.ts:684-688` destructures the effective triple from `resolution.platforms` and uses it for `mac_arch` gating (701-706), the `updated: GameInfo` literal (713-715, feeds `library.set()` + `pushGameToLibrary`), and the `steamMetadataStore.set()` literal (753-755). Split-brain test asserts cache write, `library.get()`, AND the `pushGameToLibrary` message all carry the same (declined/PICS-won) triple (`games.test.ts:631-675`). |
| 8 | Tests are non-vacuous (would fail against pre-change behaviour) | VERIFIED | Both `platformPrecedence.test.ts` (209-243) and `platformCapture.test.ts`'s `wholesaleSet` saboteur define a `lastWriteAlwaysWins`/pre-change-shape saboteur and assert it DISAGREES with the real function on the strictly-newer case — proving the branch actually discriminates. |
| 9 | Full test suite green, `tsc --noEmit` clean, todo moved to completed/ | VERIFIED | `npx jest --runInBand`: 284/284 suites, 5925/5926 tests passed (1 pre-existing skip). `pnpm codecheck` (`tsc --noEmit`): zero errors. `git diff fe12c2ceb..HEAD` shows the todo file 100%-similarity-renamed from `pending/` to `completed/` (byte-identical, WR-03/WR-04 section intact). |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/backend/storeManagers/steam/platformPrecedence.ts` | Shared decision function | VERIFIED | Exports `PlatformSignalSource`, `PlatformTriple`, `PlatformWriteResolution`, `resolvePlatformWrite`, `ExistingPlatformEntry`. Dependency-free (no `electron-store` import). |
| `src/backend/storeManagers/steam/electronStores.ts` | Two new optional fields | VERIFIED | `platformsSource?: 'appdetails' \| 'pics'` and `platformsCapturedAt?: number` added at lines 124/128, with D-B honesty comment and carry-forward warning. |
| `src/backend/storeManagers/steam/platformCapture.ts` | PICS writer honours precedence + serialised critical section | VERIFIED | `resolvePlatformWrite` imported and called (line 169); `withPlatformCaptureLock` exported and wraps the whole scope-then-write critical section, inside `try`. |
| `src/backend/storeManagers/steam/games.ts` | appdetails writer honours precedence, effective triple used throughout | VERIFIED | `resolvePlatformWrite` imported (line 29) and called (line 673); effective triple destructured and threaded through `mac_arch`, the `GameInfo` literal, and the cache `set()` literal. |
| `src/backend/storeManagers/steam/__tests__/platformPrecedence.test.ts` | Both-direction + legacy + saboteur coverage, min 80 lines | VERIFIED | 245 lines, 15 tests covering both directions, ties, legacy/corrupted timestamps, partial-triple safety, and non-vacuity saboteur. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `platformCapture.ts` | `resolvePlatformWrite` | import + call in `mergePlatformCapture` | WIRED | `import { resolvePlatformWrite } from './platformPrecedence'` (line 5); called line 169. |
| `games.ts` | `resolvePlatformWrite` | import + call before `steamMetadataStore.set` | WIRED | `import { resolvePlatformWrite } from './platformPrecedence'` (line 29); called line 673, well before the `.set()` at line 749. |
| `electronStores.ts` | `SteamMetadataCacheEntry.platformsCapturedAt` | optional field | WIRED | `platformsCapturedAt?: number` present (line 128), consumed by both writers. |
| `platformCapture.ts` | `captureOwnedAppPlatforms` critical section | `withPlatformCaptureLock` inside existing `try` | WIRED | Confirmed lock call at line 314, inside `try` starting line 306. |

### Behavioral Spot-Checks / Test Execution

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Targeted suites (precedence/capture/games) | `npx jest src/backend/storeManagers/steam/__tests__/{platformPrecedence,platformCapture,games}.test.ts` | 3 suites, 297 tests passed | PASS |
| Full suite | `npx jest --runInBand` | 284/284 suites, 5925/5926 tests passed, 1 pre-existing skip | PASS |
| Type check | `pnpm codecheck` (`tsc --noEmit`) | zero errors | PASS |
| Prettier | `npx prettier --check` on all 7 touched source/test files | "All matched files use Prettier code style!" | PASS |
| Migration grep | `grep -rn "new Migration\|applyMigrations" src/backend/storeManagers/steam/` | Only a comment explaining why none was added | PASS |
| Scope exclusion diffs | `git diff fe12c2ceb..HEAD --stat` on `library.ts`, `librarySyncIndicator.ts`, `metadataCapture.ts`, `steamPlatformRow.ts` | All four diffs empty | PASS |
| Todo move | `test -f completed/... && test ! -f pending/...` | Confirmed; 100% similarity rename (byte-identical) | PASS |

### Anti-Patterns Found

None. No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers in any of the 7 touched
source/test files. No unnegated claim that the two-writer conflict is "resolved",
"reconciled", "fixed", or "closed" — every occurrence of those words in the new code is part
of an explicit prohibition ("do NOT describe... as resolved/reconciled/closed").

### Requirements Coverage

This is a quick task (not a phase), closing todo finding WR-02 from the Phase 34.15 review.
`requirements-completed: [WR-02]` in SUMMARY.md refers to that todo's own finding label, not a
`REQUIREMENTS.md` ID — no phase-level requirements tracking applies here. WR-03/WR-04 are
explicitly out of scope per CONTEXT.md and confirmed untouched (empty diffs above).

### Human Verification Required

None. All must-haves are verifiable programmatically via source inspection and automated test
execution; no UI/visual/real-time behavior is in scope for this backend-only task.

### Gaps Summary

None. All 9 observable truths verified against the actual shipped code (not SUMMARY.md
claims): the precedence function is symmetric and non-vacuously tested in both directions,
strictly-newer-wins/tie semantics are correct, legacy entries are handled at the read boundary
with no Migration added, all eight carry-forward fields survive both writers on both paths
(explicitly tested), `captureOwnedAppPlatforms` still never throws with the lock inside the
existing `try`, the D-B honesty requirement is honoured in every touched comment, the effective
(post-precedence) triple is threaded through to both the cache write and the frontend push
(closing the CR-01 split-brain shape), scope exclusions (WR-03/WR-04, `depotSignalCaptured`,
`hasSteamWindowsDepot`) are confirmed byte-unchanged via empty git diffs, and the full gates
(284/284 suites, 5925/5926 tests, zero `tsc` errors, prettier clean) all pass on a fresh run.

---

_Verified: 2026-08-16_
_Verifier: Claude (gsd-verifier)_
