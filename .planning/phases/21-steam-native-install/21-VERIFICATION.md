---
phase: 21-steam-native-install
verified: 2026-07-20T00:00:00Z
status: human_needed
score: 4/4 gap-closure must-haves verified (21-17 scope) | 5/8 phase-wide SNI requirements (unchanged from prior run)
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 5/8
  gaps_closed:
    - "D-UAT-09 (code-level): install-state detection now routes through one shared isFullyInstalledStateFlags predicate; a same-session native cancel immediately flips is_installed=false + steamResumePending=true (markSteamInstallIncomplete); an aborted download can never finalize StateFlags=4 (abort-aware finalize, including the zero-depot early-return edge fixed by WR-02); the incomplete state now durably survives a mid-session library refresh() (WR-01, buildIncompleteInstallSet) instead of being silently wiped."
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "21-UAT Task 1d re-run: cancel a native install just before it finishes on real macOS"
    expected: "The game does NOT show Play; it shows a distinct 'Finish in Steam' affordance (tile, detail status, detail action button). Clicking it / letting Steam repair on its own then yields a launchable game (Steam's own verify-repair pass completing a 1026 manifest into a real install)."
    why_human: "Requires a real Steam client's async cancel timing and its own verify/repair behavior against a partial install on real hardware — the SUMMARY's own reproduction note found no live jest-reproducible StateFlags=4 leak, so the async race this plan hardens against (T-21-17-02) can only be exercised by a real download racing a real IPC-triggered abort. 21-UAT.md Task 1d is still PENDING; D-UAT-09 remains OPEN in 21-UAT.md's frontmatter as of last_updated 2026-07-19 (the code fix landed 2026-07-20, after that UAT session)."
  - test: "All hardware UAT items carried forward unresolved from the prior verification pass (native .acf adoption + hard-DRM launch, 10GB+ RSS/byte-correctness, real multi-depot game, bottled Windows Steam adoption, D-10 guided client install, D-11 prompt-to-launch)"
    expected: "See prior 21-VERIFICATION.md run (2026-07-16) human_verification list — unchanged, not in scope for this gap-closure pass."
    why_human: "Out of scope for 21-17; carried forward because they still gate full phase closure. Not re-verified in this pass per the phase's explicit scope fence (baseline plans 21-01..21-16 are authoritative, not re-verified from scratch)."
---

# Phase 21: Steam Native Install — Gap-Closure Verification (21-17)

**Phase Goal:** Steam games install through an in-process depot download GameLib owns — real progress, real errors, recovery — instead of the opaque `steam://rungameid` handoff; Steam adopts the install and keeps owning updates.
**Verified:** 2026-07-20
**Status:** human_needed
**Re-verification:** Yes — scoped to gap plan 21-17 (`--gaps-only` run, closes D-UAT-09) plus its two code-review follow-up fixes (WR-01, WR-02). Plans 21-01..21-16 are treated as the established, already-verified baseline per the task scope and are NOT re-verified from scratch here.

## Scope of This Pass

This run verifies ONLY:
1. Gap plan 21-17's 4 must-have truths (D-UAT-09: cancelled/incomplete native install mislabeled Installed/Play).
2. Code-review WR-01 (mid-session `refresh()` wiping the same-session resume marker) and WR-02 (zero-depot abort skipping `markSteamInstallIncomplete`), both marked RESOLVED in `21-REVIEW.md`.
3. No regression to the established baseline (D-04 1026 handoff, D-UAT-05 cancel responsiveness, 21-16's `steam-waiting-for-restart`/`steam-paused`, Phase 23's genuine-complete StateFlags=4 path).

The broader phase-wide 8 SNI requirements' scorecard (5/8 VERIFIED, 3/8 UNCERTAIN pending real-hardware UAT) is unchanged and carried forward from the 2026-07-16 verification — this pass does not re-score SNI-02/03/05/06/07/08.

## Goal Achievement — 21-17 Must-Haves

### Observable Truths (from 21-17-PLAN.md frontmatter)

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | A cancelled/incomplete native Steam install (StateFlags bit 4 unset, e.g. 1026) is NOT surfaced as Installed and does NOT show a Play button | ✓ VERIFIED | `library.ts:806-808` `isFullyInstalledStateFlags(stateFlags) = (stateFlags & 4) !== 0` is the sole source of the "installed" decision, confirmed routed through by `buildInstalledMap` (L849), `readAcfState` (L1296), `buildBottleInstalledMap` (L1357) via direct grep — no remaining independent inline bitmask check. `MainButton.tsx` Play block (`is_installed &&...`) is gated purely on this flag. `library.test.ts` Test A/B (predicate truth table + mixed-fixture regression lock) and `MainButton.steamIncomplete.test.tsx` (no-Play + "Finish in Steam" when incomplete) both pass. |
| 2 | A fully-installed native Steam install (StateFlags bit 4 set, e.g. 4) IS still surfaced as Installed with a Play button (no regression) | ✓ VERIFIED | Same shared predicate — `isFullyInstalledStateFlags(4) === true`. `library.test.ts`'s refresh-durability block explicitly asserts a bit-4-set install still yields `is_installed:true` and no `steamResumePending`; `MainButton.steamIncomplete.test.tsx` asserts Play unchanged when installed. |
| 3 | A user-cancelled / interrupted native download can never finalize a StateFlags=4 manifest — always the honest 1026 verify-repair handoff (D-04 preserved) | ✓ VERIFIED | `depot.ts:2044-2052`: `downloadSteamDepots`'s `finalize()` closure computes `cancelled = lastResult?.outcome==='cancelled' || opts.signal?.aborted===true` and forces the outcome threaded to `finalizeToSteam` to `'cancelled'` whenever true; `canWriteFullOwnership` itself untouched (still requires `outcome==='completed'`). The zero-depot early-return edge (WR-02, `depot.ts:2072-2088`) now also honors abort — `return opts.signal?.aborted === true ? {status:'cancelled'} : {status:'done'}` — confirmed present, matching the main-path (L2130) and thrown-error-path (L2163) abort checks. `depot.finalize.test.ts` Test C (cancel never earns 4) and Test D (genuine complete still earns 4) both pass. |
| 4 | An incomplete on-disk native install is surfaced with a distinct "Finish in Steam"/resume affordance, not a bare "Install" and never "Play" — and this survives a mid-session `refresh()` (WR-01) | ✓ VERIFIED | Frontend: `MainButton.tsx:219-227`, `constants.ts:57-58`, `GameStatus.tsx:139-140`, `hasStatus.ts:181` all gate on `steamResumePending`/`statusContext==='steam-incomplete'` and render `t('status.steamFinishInSteam', 'Finish in Steam')`; key i18n string present in `public/locales/en/gamepage.json:373`. Durability: `library.ts:881-925` `buildIncompleteInstallSet()` — the on-disk, bit-4-unset complement to `buildInstalledMap`, sharing the same predicate (negated) — is called inside `refresh()` (`library.ts:581`) and its result re-seeds `install: { steamResumePending: true }` for any incomplete-but-owned game during the `library.clear()` + rebuild (`library.ts:627-635`), closing the exact WR-01 defect (refresh silently wiping the same-session marker). `library.test.ts`'s dedicated `describe('SteamLibraryManager.refresh() re-seeds steamResumePending (WR-01)')` block (L778-887) asserts: incomplete survives refresh as `is_installed:false`+`steamResumePending:true`; a fully-installed entry has no `steamResumePending` (no regression); the re-seeded flag is persisted to `steamLibraryStore` (survives a restart mid-session); `buildIncompleteInstallSet` returns only the bit-4-unset appId. |

**Score:** 4/4 truths verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `library.ts` — `isFullyInstalledStateFlags` | Single exported bit-4 completeness predicate | ✓ VERIFIED | L806-808; used by 3 detectors (L849, L1296, L1357) with zero remaining independent `(stateFlags & 4)` checks in the detector paths (only other hit at L1946 is `scanDownloadingAppIds`, a different startup-scan concern, out of this plan's scope). |
| `library.ts` — `buildIncompleteInstallSet` | Durable on-disk complement to `buildInstalledMap`, negates the same predicate | ✓ VERIFIED | L881-925; wired into `refresh()` at L581/L627-635; regression-tested. |
| `library.ts` — `markSteamInstallIncomplete` | Same-session cancel marker: `is_installed=false` + `steamResumePending=true`, persisted, pushed to frontend | ✓ VERIFIED | L347-359; matches spec exactly (persists via `steamLibraryStore.set`, emits `pushGameToLibrary`). Called from `games.ts:920` on the cancelled branch, before every `{status:'abort'}` return. |
| `depot.ts` — abort-aware finalize | `signal?.aborted` forces `outcome='cancelled'` so `canWriteFullOwnership` can never earn StateFlags=4 | ✓ VERIFIED | L2044-2052 (main path) + L2085-2087 (WR-02 zero-depot edge) + L2130 (post-download cancelled check) + L2163 (thrown-error path) — all four return points now abort-aware and consistent. |
| `MainButton.tsx` / `constants.ts` | No Play for incomplete; distinct resume affordance instead of bare Install | ✓ VERIFIED | `MainButton.tsx:219-227`, `constants.ts:57-58` — confirmed above. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `library.ts` (`buildInstalledMap`/`readAcfState`/`buildBottleInstalledMap`) | `isFullyInstalledStateFlags` | shared predicate call | ✓ WIRED | Direct grep confirms all 3 sites call the exported function; no duplicated bit logic remains. |
| `depot.ts downloadSteamDepots` | `finalizeToSteam` outcome | `signal?.aborted` → `outcome='cancelled'` | ✓ WIRED | Confirmed at all 4 return points (main, zero-depot, post-download-cancelled, thrown-error). |
| `MainButton.tsx` | `gameInfo.is_installed` / `install.steamResumePending` | render gate | ✓ WIRED | `MainButton.tsx:219-227` reads both fields directly; Play block (`is_installed &&...`) is unaffected/still correct. |
| `games.ts runNativeDepotDownload` cancelled branch | `markSteamInstallIncomplete` | direct call before `{status:'abort'}` return | ✓ WIRED | `games.ts:920`. |
| `library.ts refresh()` | `buildIncompleteInstallSet` | re-seed `steamResumePending` on rebuild | ✓ WIRED (WR-01 fix) | `library.ts:581, 627-635`; regression-tested for survival across `refresh()`. |

### Behavioral Spot-Checks / Automated Verification

| Check | Command | Result | Status |
|---|---|---|---|
| Backend steam suite | `npx jest src/backend/storeManagers/steam --silent` | 17 suites / 695 tests passed (includes new `depot.finalize.test.ts`, extended `library.test.ts`) | ✓ PASS |
| Frontend gap-closure tests | `npx jest .../MainButton.steamIncomplete.test.tsx .../hasStatus.reconcile.test.ts --silent` | 2 suites / 19 tests passed | ✓ PASS |
| Type/lint check | `npm run codecheck` | clean, zero errors | ✓ PASS |
| Debt-marker scan | grep `TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER` across all 7 modified backend/frontend files | zero hits | ✓ PASS |
| WR-01/WR-02 commits exist | `git show --stat 718b4bfe / e635a4b3` | Both present on branch, correct diffs (`refresh()` re-seed logic; zero-depot abort ternary) | ✓ PASS |

**Note (minor, non-blocking):** WR-02's fix commit (`e635a4b3`) modifies only `depot.ts` — no new dedicated unit test exercises the specific zero-depot-plus-aborted-signal branch in isolation (existing coverage exists for the structurally identical main-path and thrown-error-path abort branches, and the fix is a 1-line ternary mirroring both). The full backend suite (695 tests) stays green with no regression. This is a test-coverage gap, not a code-correctness gap — the fix is directly verifiable by inspection and matches an already-tested pattern.

### Code Review Disposition (21-REVIEW.md)

| ID | Finding | Status | Verifier Note |
|---|---|---|---|
| WR-01 | Mid-session `refresh()` wipes the same-session incomplete marker | ✓ RESOLVED (commit `718b4bfe`) | Confirmed above — `buildIncompleteInstallSet` wired into `refresh()`, regression-tested. |
| WR-02 | Aborted zero-depot install bypasses `markSteamInstallIncomplete` | ✓ RESOLVED (commit `e635a4b3`) | Confirmed above — zero-depot early return now abort-aware. |
| WR-03 | `markSteamInstallIncomplete` flips `is_installed` unconditionally, no on-disk confirmation | Open (deferred, non-blocking) | Correctly disposed as a WARNING by the reviewer, not a blocker — the helper's only current caller (the fresh-install cancelled branch) satisfies its precondition. Does not affect any of the 4 must-have truths for this plan. Left open, tracked in `21-REVIEW.md`. |
| IN-01, IN-02 | Dead defensive guards; two predicates expressing the same UI decision | Open (info-level, non-blocking) | Cosmetic/consistency notes, no functional impact. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| SNI-01 | 21-17 (touches) | In-process depot engine correctness | ✓ Unaffected/no regression | 21-17 only touches install-*state detection*, not the depot download engine itself (CR-01/dir-symlink fix was 21-13/21-14, already verified 2026-07-16). REQUIREMENTS.md body marks SNI-01 `[x]`. **Note:** REQUIREMENTS.md's Traceability table (line 289) still reads "Gaps (verification failed — depot dir/symlink entries)" — this is stale documentation predating the 2026-07-16 re-verification that already moved SNI-01 to VERIFIED; not caused by 21-17, flagged for cleanup. |
| SNI-04 | 21-17 (primary) | Failure/cancel/startup-partial converge on one finalize function; honest error handling | ✓ code-verified / **? UNCERTAIN for real-hardware confirmation** | The specific D-UAT-09 divergence (cancelled install mislabeled Installed with a live Play button) is now code-closed — see truths 1-4 above. Real Steam-client repair-completion behavior (does the "Finish in Steam" flow actually yield a launchable game after Steam repairs it) remains hardware-only, routed to 21-UAT Task 1d re-run. REQUIREMENTS.md body marks SNI-04 `[x]`; Traceability table (line 292) still reads "In Progress (inherits SNI-01 gap; hardware UAT pending)" — also stale, same note as above. |

No requirement IDs beyond SNI-01/SNI-04 are touched by 21-17 (per its own frontmatter `requirements: [SNI-01, SNI-04]`).

### Anti-Patterns Found

None in the 7 files modified by 21-17 (library.ts, depot.ts, games.ts, constants.ts, hasStatus.ts, MainButton.tsx, GameStatus.tsx) — zero `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` hits, no stub returns, no hardcoded-empty render paths.

### Human Verification Required

See `human_verification` in frontmatter. Summary:

1. **21-UAT Task 1d re-run (primary item for this gap closure):** cancel a native install just before completion on real macOS; confirm no Play button, confirm "Finish in Steam" affordance shows instead; confirm clicking it (or letting Steam repair on its own) yields a launchable game. This is the direct hardware confirmation of D-UAT-09's fix. `21-UAT.md`'s frontmatter still lists D-UAT-09 as `OPEN` because that document's `last_updated: 2026-07-19` predates this fix (landed 2026-07-20) — it needs a UAT session update, not a code change.
2. **All previously-pending hardware UAT items** (native `.acf` adoption + hard-DRM launch, 10GB+ streaming RSS/byte-correctness, real multi-depot game, bottled Windows Steam adoption, D-10 guided client install, D-11 prompt-to-launch) — unchanged, out of scope for this pass, still gate full phase closure per the 2026-07-16 verification.

### Gaps Summary

No code-level gaps found in the 21-17 gap-closure scope. All 4 must-have truths are verified by direct code read plus passing regression tests (695 backend + 19 frontend, all green; `tsc --noEmit` clean; no debt markers). Both code-review WARNINGs (WR-01, WR-02) that could have reopened D-UAT-09 in different forms are confirmed RESOLVED with matching commits. The remaining WR-03 finding is correctly disposed as non-blocking defense-in-depth, not a functional defect in any of the 4 must-haves.

The phase as a whole remains `human_needed` — not because of anything found wrong in this pass, but because the fix's real-world efficacy (does the honest "Finish in Steam" + Steam's own repair pass actually produce a launchable game on real hardware) can only be confirmed by re-running 21-UAT Task 1d, and the broader phase-wide hardware UAT backlog carried forward from the 2026-07-16 verification is still open.

---

_Verified: 2026-07-20_
_Verifier: Claude (gsd-verifier)_
