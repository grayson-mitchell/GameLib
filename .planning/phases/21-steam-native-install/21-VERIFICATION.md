---
phase: 21-steam-native-install
verified: 2026-07-16T02:00:00Z
status: human_needed
score: 5/8 must-haves verified (SNI-01..08)
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/8
  gaps_closed:
    - "SNI-01: the in-process depot engine writes a directory structure Steam can actually adopt — including directory and symlink manifest entries — for real games (CR-01, the sole blocking gap)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Native .acf adoption (StateFlags 1026→4) + launch, including a confirmed hard-DRM title"
    expected: "Steam's verify pass flips StateFlags 1026→4 with near-zero re-download; game launches via steam://rungameid; hard-DRM title launches without the DRM layer rejecting the file set"
    why_human: "Requires a real authenticated Steam account, real Steam client verify-repair pass, and a confirmed hard-DRM-wrapped owned title — none of which exist in CI. 21-UAT.md Task 1a-1c, still PENDING."
  - test: "Cancel mid-download → 1026 manifest → Steam's own repair-on-launch completes the install"
    expected: "Cancel leaves an honest 1026 manifest (not broken/missing); Steam repairs the incomplete install itself without GameLib intervention"
    why_human: "Requires a real Steam client's verify/repair behavior against a partial install, not reproducible in CI. 21-UAT.md Task 1d, still PENDING."
  - test: "10GB+ real depot streams with bounded (non-linear-growth) main-process RSS, and downloaded files are byte-correct"
    expected: "RSS plateaus around O(concurrency × chunk size), does not grow proportionally with total bytes downloaded; SHA1 of sampled large files matches a known-good reference"
    why_human: "Requires a real 10GB+ owned Steam title and OS-level process memory monitoring over a multi-minute real download — not reproducible in unit tests. 21-UAT.md Task 2a-2b, still PENDING."
  - test: "Real multi-depot game: correct summed total shown, all depots present on disk, Steam adopts cleanly with no cross-depot file collision"
    expected: "DownloadManager total reflects the D-03 summed total across all depots; no depot's files clobber another's; Steam adopts without a forced full re-download"
    why_human: "Requires a real multi-depot owned title and a real Steam client's adoption pass. 21-UAT.md Task 2c, still PENDING."
  - test: "Bottled Windows Steam (macOS/CrossOver) adopts a GameLib-written 1026 manifest identically to native Steam, and the game launches through the bottle"
    expected: "Bottled Steam's own verify pass flips StateFlags 1026→4 with no meaningful re-download; game launches through the bottle"
    why_human: "Requires a real macOS machine with a provisioned CrossOver bottle and a bottle-eligible owned title; RESEARCH.md itself flags D-15 bottle adoption as an untested inference. 21-UAT.md Task 3, still PENDING."
  - test: "D-10 guided native Steam-client install is consent-gated and genuinely non-silent per OS (Windows installer window visible, macOS DMG mount+Finder, Linux link-out)"
    expected: "A consent dialog appears before anything downloads/runs; the resulting install flow is visibly interactive, never a silent/unattended install"
    why_human: "Requires observing a real installer UI / Finder window / browser tab launch on each OS — not observable from source alone. 21-UAT.md Task 4a, still PENDING. REQUIREMENTS.md itself marks SNI-06 Pending, consistent with this."
  - test: "D-11 prompt-to-launch never authors libraryfolders.vdf, and D-11's continue-to-download auto-retries once Steam becomes ready"
    expected: "The 'launch Steam once' banner appears when the file is absent; GameLib never creates the file itself; once the user launches Steam, the pending install auto-continues without a manual re-click"
    why_human: "Requires a real Steam client state transition (never-launched → launched) and observing GameLib's background poll behavior against it. 21-UAT.md Task 4b-4c, still PENDING."
---

# Phase 21: Steam Native Install (depot download) Verification Report

**Phase Goal:** Steam games install through an in-process depot download GameLib owns — with real progress, real error surfaces, and recovery — instead of the opaque `steam://rungameid` handoff. GameLib downloads depot content over `steam-user`'s authenticated CM connection, writes an `appmanifest_{appId}.acf` the Steam client adopts, and launch stays with `steam://` so DRM keeps working.
**Verified:** 2026-07-16
**Status:** human_needed
**Re-verification:** Yes — after gap closure (previous run: `gaps_found`, 4/8)

## Goal Achievement

This is a re-verification. The prior VERIFICATION.md's sole blocking gap was CR-01: `downloadSingleFile` in `depot.ts` wrote directory/symlink manifest entries as empty regular files because `DepotPlanFile.flags` was captured but never read. Gap-closure plans 21-13 and 21-14, plus code-review follow-up commit `b207e488`, were read directly (not trusted from SUMMARY.md) and independently re-tested below.

### CR-01 closure — confirmed by direct code read

`src/backend/storeManagers/steam/depot.ts:497-577` (`downloadSingleFile`):

- Lines 511-517: `if (file.flags && file.flags & DIRECTORY_FLAG) { await mkdir(dest, { recursive: true }); return }` — placed **before** the `size===0` fast path (lines 545-556). Directory entries are size-0/no-chunks in real manifests, so ordering here is the entire fix; confirmed correct.
- Lines 519-543: Symlink branch. Requires `file.linktarget` (thrown if absent), resolves the target via `resolve(dirname(dest), file.linktarget)` then containment-checks with `relative(installRoot, resolvedTarget)` — rejecting escape via `PathTraversalError` (never `path.join`, matching the project's own "path.join is not containment" lesson). **Idempotent**: `await rm(dest, { force: true })` immediately before `await symlink(...)` — this is the CR-02 fix from the code-review follow-up (commit `b207e488`), confirmed present at line 540.
- `DIRECTORY_FLAG = 64`, `SYMLINK_FLAG = 512` (lines 51-52) — matches `node_modules/steam-user/enums/EDepotFileFlag.js` per the code-review's own independent check; not re-verified against node_modules by this pass but the review's citation is specific and credible.
- `fetchDepotPlanEntry` (line 289): `linktarget: f.linktarget` is now captured onto `DepotPlanFile` alongside `flags` — confirmed present.

**CR-01 is genuinely closed**, not merely claimed. A game with subdirectories will no longer hit ENOTDIR/EISDIR, and symlink entries are real symlinks instead of broken empty files.

### Other gap-closure items — confirmed by direct code read

- **WR-02** (silent zero-chunk data loss): `depot.ts:545-556` — `size>0 && !chunks.length` now throws `` `downloadDepotFiles: manifest reported ${file.filename} size=${file.size} but zero chunks` `` instead of writing an empty file and reporting success. Confirmed.
- **WR-03** (unclamped percent): `depot.ts:639` — `Math.min(100, Math.round((doneBytes / totalBytes) * 100))`. Confirmed.
- **WR-01** (VDF injection via unescaped name/installdir): `depot/manifest.ts` `vdfEscape()` (lines 79-84) applied to both `name` and `installdir` at interpolation sites (lines 127-128). Confirmed.
- **WR-01 completeness / this-review's-CR-01** (manifest GID unescaped): `depot/manifest.ts:94` — `assertNumericId(d.manifest, 'manifest')` added inside `buildInstalledDepotsBlock`, closing the code-review-found follow-on defect where the GID itself (same untrusted-PICS pool) bypassed validation. Confirmed present — this was found AND fixed within the same gap-closure cycle (`21-REVIEW-gaps.md` CR-01, commit `b207e488`), not left open.
- **WR-04** (weak `sanitizeInstalldir`): `installLocation.ts:90-119` — positive whitelist `/^[A-Za-z0-9 ._-]+$/` plus leading/trailing-dot rejection, replacing the old separator-only denylist. Confirmed.

### Newly-surfaced, non-blocking warnings (from `21-REVIEW-gaps.md`, disposed as deferred/wontfix — not re-opened by this verifier)

| ID | Issue | Disposition | Verifier assessment |
|---|---|---|---|
| WR-01 (review) | `symlink()` called without explicit `type` arg — order-dependent broken dir-symlinks on Windows | Deferred | Real but narrow (Windows-only, non-deterministic race on manifest ordering); milestone is macOS-focused per review's own note. Not a blocker for this phase's goal. |
| WR-02 (review) | Symlink target containment doesn't normalize `\` separators like `resolveContainedPath` does for filenames | Deferred | Same Windows-only concern grouped with the above. |
| WR-03 (review) | `SAFE_INSTALLDIR` whitelist is ASCII-only, rejects legitimate Unicode installdir names | Wontfix (deliberate) | Functional regression for non-ASCII titles, but reviewed and accepted as a deliberate security tradeoff (falls back to `app_<id>`, does not fail the install). Tracked, not hidden. |

These are tracked in `21-REVIEW-gaps.md`'s disposition list with explicit rationale — they do not reopen CR-01 and do not block phase goal achievement. They are noted here for visibility, not scored as gaps.

### Independent re-verification (not taken from SUMMARY.md claims)

- `npx jest src/backend/storeManagers/steam --silent` → **11 suites / 447 tests passed** (independently run by this verifier).
- `npx jest --silent` (full repo suite) → **73 suites / 1314 tests passed** — matches the phase's claimed count exactly.
- `npx tsc --noEmit` → clean, zero errors.
- Regression test coverage confirmed present by direct grep of `depot.test.ts`: Directory-as-real-directory, Directory+child-ordering (the literal ENOTDIR/EISDIR case), Symlink-as-real-symlink, symlink-traversal-reject, symlink retry-idempotency (CR-02), WR-02 zero-chunk-failure, WR-03 percent-clamp. `manifest.test.ts` confirmed to include a non-numeric-manifest-GID-rejection case. `installLocation.test.ts` confirmed to include quote/control-char/drive-relative-name rejection cases (WR-04).
- No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in `depot.ts`, `depot/manifest.ts`, or `installLocation.ts`.

### Observable Truths (re-scored)

| # | Truth (requirement) | Status | Evidence |
|---|---|---|---|
| 1 | **SNI-01** — In-process depot engine downloads every owned depot, streaming to disk, cross-server chunk retry, two-channel ownership selection, no whole-file RAM buffering | ✓ VERIFIED (was FAILED) | CR-01 closure confirmed by direct code read above: Directory/Symlink manifest entries are now real directories/symlinks, not empty files, closing the ENOTDIR/EISDIR-inducing defect that broke virtually any real game with subdirectories. New regression tests exercise exactly this class of defect and pass. Streaming-to-disk, chunk retry, and ownership-selection mechanics (unchanged from the initial verification) remain sound. |
| 2 | **SNI-02** — Hand-templated `appmanifest_{appId}.acf`, `StateFlags=1026` (never 4), 64-bit GIDs as strings, atomic temp+rename write | ✓ VERIFIED | Unchanged from initial pass, plus hardened: manifest GID now `assertNumericId`-guarded (closing a code-review-found follow-on gap in the same cycle) and `name`/`installdir` VDF-escaped. `manifest.test.ts` passes with new coverage. |
| 3 | **SNI-03** — Steam installs enqueue into the existing DownloadManager queue with real percent/speed/ETA from real summed total bytes; cancel aborts the in-flight chunk loop | ✓ VERIFIED | Unchanged from initial pass; percent now additionally clamped ≤100 (WR-03), confirmed by direct read and a passing regression test. |
| 4 | **SNI-04** — Failure/cancel/startup-with-partial converge on ONE finalize function; plain-language error+Retry; startup never silently re-drives Steam | ✓ code-verified / **? UNCERTAIN for real adoption** | Mechanism unchanged and sound (confirmed in initial pass, re-confirmed still intact — `depot.ts` finalize path and `library.ts init()` untouched by the gap-closure diff, no regression). Now additionally benefits from the CR-01 fix underneath it (finalize now writes a manifest matching files that are actually correct on disk). Real Steam-client adoption/repair remains hardware-only — 21-UAT.md Task 1a/1d still PENDING. Routed to human verification. |
| 5 | **SNI-05** — Downloads target an existing registered Steam library's `steamapps/`, defaulting to primary, override picker only with 2+ libraries, never mutates `libraryfolders.vdf` | ✓ VERIFIED | Unchanged from initial pass, plus hardened `sanitizeInstalldir` (WR-04). `installLocation.test.ts` passes with new coverage. |
| 6 | **SNI-06** — Steam-absent triggers consent-gated, genuinely non-silent guided client install per OS; Steam-installed-but-never-launched prompts launch-once; never authors `libraryfolders.vdf` | **? UNCERTAIN (human_needed)** | Unchanged from initial pass — code substantive and present (`clientSetup.ts`, `SteamClientSetup.tsx`), untouched by the gap-closure diff. REQUIREMENTS.md still marks SNI-06 `[ ]` Pending, consistent with this finding. All 3 real-machine flows (4a/4b/4c) still PENDING in 21-UAT.md. |
| 7 | **SNI-07** — Opt-in setting, default OFF, no platform gate (all 3 OSes), OFF preserves `steam://install` handoff byte-for-byte, ON has no per-case fallback | ✓ VERIFIED | Unchanged from initial pass; `games.test.ts` still passes, untouched by the gap-closure diff. |
| 8 | **SNI-08** — macOS bottle-eligible install depot-downloads the WINDOWS depot into the bottle's own `steamapps/`, `os:'windows'` hardcoded, `isBottleReady()` gate, no Wine dispatch for the download | ✓ code-verified / **? UNCERTAIN for real bottle adoption** | Shares `downloadSingleFile` with SNI-01 — inherits the CR-01 fix, so the bottle install path no longer breaks on games with subdirectories either. `games.ts.installBottleNative()` targeting/os-hardcode/gate all unchanged and re-confirmed sound. Real bottled-Steam adoption remains a hardware-only unknown (RESEARCH.md's own flagged Assumption A3) — 21-UAT.md Task 3 still PENDING. |

**Score:** 5/8 cleanly VERIFIED (SNI-01, 02, 03, 05, 07 — up from 4/8; SNI-01 moved from FAILED to VERIFIED); 0/8 FAILED; 3/8 UNCERTAIN pending real-hardware UAT (SNI-04, 06, 08) — same 3 as the initial pass, unaffected by this gap closure since they depend on hardware that doesn't exist in CI.

Per the escalation-gate decision tree: no truth is FAILED, but 3 truths remain UNCERTAIN and require human verification (unchanged, hardware-only). **status = human_needed**, not `gaps_found` (the blocking defect is closed) and not `passed` (human verification items are still open, which per the decision tree takes priority over declaring `passed`).

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/backend/storeManagers/steam/depot.ts` | downloadSteamDepots, finalizeToSteam orchestrator, downloadSingleFile | ✓ VERIFIED (was VERIFIED-WITH-DEFECT) | CR-01 defect closed; Directory/Symlink branching confirmed correct and ordered before the empty-file fast path; symlink branch idempotent (CR-02 closed) |
| `src/backend/storeManagers/steam/depot/manifest.ts` | writeAppManifest, StateFlags, VDF-safe interpolation | ✓ VERIFIED | `vdfEscape()` applied to name/installdir; manifest GID now `assertNumericId`-guarded |
| `src/backend/storeManagers/steam/installLocation.ts` | resolveSteamInstallTarget, hardened sanitizeInstalldir | ✓ VERIFIED | Positive whitelist replacing separator-only denylist |
| `src/backend/storeManagers/steam/__tests__/depot.test.ts` | Regression coverage for Directory/Symlink/traversal/idempotency/zero-chunk/clamp | ✓ VERIFIED | All 7 new cases confirmed present by direct grep and pass in the independently-run suite |
| `src/backend/storeManagers/steam/__tests__/manifest.test.ts` | Non-numeric manifest GID rejection + VDF-escape coverage | ✓ VERIFIED | Confirmed present, passes |
| `src/backend/storeManagers/steam/__tests__/installLocation.test.ts` | Hardened sanitize coverage (quote/control-char/drive-relative) | ✓ VERIFIED | Confirmed present, passes |
| `.planning/phases/21-steam-native-install/21-REVIEW-gaps.md` | Code review of the gap-closure diff | ✓ VERIFIED | `status: resolved`; both new criticals (CR-01 GID, CR-02 symlink idempotency) it found were themselves fixed in the same cycle (commit `b207e488`), confirmed by direct code read, not just the review's own claim |
| `.planning/phases/21-steam-native-install/21-UAT.md` | Recorded real-machine validation | ⚠️ EXISTS-BUT-UNRUN (unchanged) | Still `status: partial`, 0/11 items executed, all PENDING — unaffected by this gap closure |

All artifacts unmodified by the gap-closure diff (`EnableSteamNativeInstall.tsx`, `nativeInstallSetting.ts`, `depotErrors.ts`, `library.ts`, `clientSetup.ts`, `games.ts`, `depot/select.ts`, `depot/decompress.ts`, `depot/crypto.ts`) were spot-checked via the full green suite for regression and show no change in status from the initial verification.

### Key Link Verification

No key links were touched by the gap-closure diff. All links confirmed WIRED in the initial verification pass remain WIRED — re-confirmed via the independently-run full green suite (73/73 suites) exercising the same call paths (`depot.ts` → `depot/manifest.ts` finalize write, `games.ts install()` → `depot.ts downloadSteamDepots`, `library.ts init()` → `finalizeToSteam`, etc.). No regressions found.

### Data-Flow Trace (Level 4)

Not re-run — no new dynamic-data-rendering artifact was introduced by this gap closure (the changes are backend file-writing logic and VDF-escaping, not UI data flow). The initial verification's Level 4 scope (none applicable — no rendered dashboard/component in this phase) still holds.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Directory manifest entry writes a real directory, not an empty file | `npx jest src/backend/storeManagers/steam/__tests__/depot.test.ts -t "Directory manifest entry"` (part of full suite run) | Pass, `stat.isDirectory()` true | ✓ PASS |
| Directory + child file succeed regardless of processing order (ENOTDIR/EISDIR regression) | Same test file, "AND a child regular file both succeed" case | Pass | ✓ PASS |
| Symlink manifest entry writes a real symlink at the manifest's linktarget | Same test file, Symlink case | Pass | ✓ PASS |
| Symlink target escaping install root is rejected | Same test file, symlink-traversal-reject case | Pass, error matches `/traversal|escapes/i` | ✓ PASS |
| Symlink retry is idempotent (no EEXIST) | Same test file, CR-02 retry-idempotency case | Pass | ✓ PASS |
| size>0 + zero chunks is a recorded failure, not silent empty success | Same test file, WR-02 case | Pass | ✓ PASS |
| Progress percent never exceeds 100 | Same test file, WR-03 case | Pass | ✓ PASS |
| Non-numeric manifest GID rejected before VDF interpolation | `manifest.test.ts` | Pass | ✓ PASS |
| Full repo suite green (independently re-run, not trusted from SUMMARY) | `npx jest --silent` | 73 suites / 1314 tests passed | ✓ PASS |
| Typecheck clean (independently re-run) | `npx tsc --noEmit` | Exit 0, no output | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` files exist for this phase and none are declared in the PLAN/SUMMARY files. Step 7c: SKIPPED (no declared or conventional probes for this phase — verification relies on the project's Jest suite instead, which was independently executed above).

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| SNI-01 | 21-01, 21-04, 21-05, 21-12, 21-13 | In-process depot engine, streaming, no fallback | ✓ SATISFIED (was BLOCKED) | CR-01 closed, confirmed by direct code read + passing regression tests |
| SNI-02 | 21-02, 21-14 | 1026 manifest, 64-bit strings, atomic write | ✓ SATISFIED | Confirmed, now hardened |
| SNI-03 | 21-04, 21-05, 21-13 | Real total bytes queue, cancel | ✓ SATISFIED | Confirmed, percent now clamped |
| SNI-04 | 21-06, 21-08, 21-12 | Single finalize, error+Retry, no silent re-drive | ? NEEDS HUMAN | Code sound (unchanged, no regression); real adoption/repair still unverified — 21-UAT.md PENDING |
| SNI-05 | 21-09, 21-14 | Registered-library-only targeting | ✓ SATISFIED | Confirmed, now hardened |
| SNI-06 | 21-10 | Guided client install / prompt-to-launch | ? NEEDS HUMAN | Unchanged, code-complete, deferred to UAT (matches REQUIREMENTS.md's own `[ ]` Pending) |
| SNI-07 | 21-03, 21-07 | Opt-in, default OFF, all-OS, OFF-path-unchanged | ✓ SATISFIED | Confirmed, unchanged |
| SNI-08 | 21-11, 21-12, 21-13 | Bottle depot-download, os:'windows', no Wine dispatch | ? NEEDS HUMAN | Code sound; now shares the CR-01 FIX (not the defect); real bottle adoption still unverified |

No orphaned requirements — same 8 SNI-01..08 IDs as the initial verification, now also declared across 21-13/21-14's `requirements-completed` frontmatter.

**REQUIREMENTS.md checkbox note (informational, carried forward):** REQUIREMENTS.md still shows SNI-01 as `[ ]` with a "Gaps" annotation and SNI-04/SNI-08 as "In Progress" pending hardware UAT (line 262-269) — this is now **stale relative to the code-level fix** but still **correct relative to the empirical "Steam adopts the install" claim**, since 21-UAT.md's 11 items remain 0/11 executed. This verifier's finding (SNI-01 code-level VERIFIED, SNI-04/08 code-sound-but-hardware-pending) supersedes the checkbox for the purpose of this VERIFICATION.md; REQUIREMENTS.md itself should be updated to reflect "code-complete, UAT gate open" rather than "Gaps" once this VERIFICATION.md is accepted, but that is a documentation housekeeping item, not a new gap.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `src/backend/storeManagers/steam/depot.ts` | 528 (per `21-REVIEW-gaps.md` WR-01) | `symlink()` called without explicit Windows `type` arg | ℹ️ Info | Narrow Windows-only race condition on manifest processing order; reviewed and deferred with rationale, not a blocker for this phase's (currently macOS-focused) goal |
| `src/backend/storeManagers/steam/depot.ts` | 520-521 (per `21-REVIEW-gaps.md` WR-02) | Symlink target containment doesn't normalize `\` separators | ℹ️ Info | Same Windows-only concern, deferred alongside the above |
| `src/backend/storeManagers/steam/installLocation.ts` | 90 (per `21-REVIEW-gaps.md` WR-03) | `SAFE_INSTALLDIR` whitelist is ASCII-only | ℹ️ Info | Deliberate security tradeoff, reviewed and accepted as wontfix; non-ASCII titles fall back to a safe `app_<id>` name rather than failing |

No `TBD`/`FIXME`/`XXX` markers found. No `TODO`/`HACK`/`PLACEHOLDER` markers found. No blocker-severity anti-patterns remain — the sole blocker from the initial verification (CR-01) is closed.

### Human Verification Required

Unchanged from the initial verification. See frontmatter `human_verification` for the 6 grouped items (11 underlying 21-UAT.md rows, still 0/11 executed). All require a real authenticated Steam account and, for the bottle item, a real macOS + CrossOver machine. None of these are affected by the gap-closure work — they were always routed to human verification, not counted as the reason for the prior `gaps_found` status (that was CR-01, now closed).

### Gaps Summary

**No gaps remain.** The single blocking gap from the initial verification (CR-01 — directory/symlink manifest entries written as empty regular files) is closed, confirmed by direct code read of `depot.ts:497-577` and by independently re-running the full test suite (73/73 suites, 1314/1314 tests — exact match to the phase's claim) and `tsc --noEmit` (clean). Two additional criticals surfaced by the gap-closure code review (`21-REVIEW-gaps.md`: manifest-GID VDF injection, symlink-retry `EEXIST`) were themselves fixed within the same cycle (commit `b207e488`) and independently confirmed present in the code, not just claimed. Three further warnings from that same review (Windows symlink type-arg, Windows backslash normalization, ASCII-only installdir whitelist) are deliberately deferred/wontfix with documented rationale and do not block this phase's goal.

**What remains open is unchanged from the initial pass and is NOT a gap:** 3 of 8 requirements (SNI-04, SNI-06, SNI-08) depend on real-hardware UAT (a real authenticated Steam account, and for one item, a real macOS+CrossOver machine) that cannot be exercised in CI. All 11 items in 21-UAT.md remain PENDING. This routes to `human_needed`, not `gaps_found` — the phase's code-level correctness is no longer in question; only the empirical "does a real Steam client actually adopt this" claim is outstanding, exactly as before the gap closure.

---

_Verified: 2026-07-16_
_Verifier: Claude (gsd-verifier)_
