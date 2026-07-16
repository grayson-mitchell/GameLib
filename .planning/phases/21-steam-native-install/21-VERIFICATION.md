---
phase: 21-steam-native-install
verified: 2026-07-16T00:00:00Z
status: gaps_found
score: 4/8 must-haves verified (SNI-01..08)
overrides_applied: 0
gaps:
  - truth: "SNI-01: the in-process depot engine writes a directory structure Steam can actually adopt — including directory and symlink manifest entries — for real games"
    status: failed
    reason: "Manifest `flags` is threaded onto DepotPlanFile but never consulted anywhere downstream. `downloadSingleFile`'s empty-file fast path (`!file.chunks.length || Number(file.size) === 0`) fires for BOTH genuinely-empty regular files AND directory/symlink manifest entries (both size 0, no chunks, real Steam depot manifests). A directory entry is therefore written as an empty regular file, not a directory. Because files are processed with FILE_CONCURRENCY in arbitrary order, this produces either an ENOTDIR failure (directory-as-file created first, child write fails) or an EISDIR failure (child creates the real directory first, directory-entry write then fails) for essentially any game whose manifest contains subdirectories — which is nearly all real games. Symlinks are silently materialized as empty regular files (LinkTarget discarded, broken links). Confirmed by direct code read (not just 21-REVIEW.md's claim) at depot.ts:481-495 and the `flags: f.flags` capture at depot.ts:269 with zero other read sites for `flags` in the file. depot.test.ts has no test case constructing a manifest entry with a Directory or Symlink flag, so the full green test suite (73/73 suites, 1298/1298 tests) does not exercise this path at all — this is a real, unit-test-invisible defect, not a hardware-only unknown."
      artifacts:
        - path: "src/backend/storeManagers/steam/depot.ts"
          issue: "downloadSingleFile (~L481-495) does not branch on DepotPlanFile.flags (Directory/Symlink EDepotFileFlag bits) before the empty-file fast path; fetchDepotPlanEntry (~L265-271) captures flags but nothing reads it"
      missing:
        - "Before the empty-file fast path in downloadSingleFile, check file.flags for the Directory bit and mkdir(dest, {recursive:true}) instead of creating an empty regular file"
        - "Check file.flags for the Symlink bit and create a real symlink from the manifest's LinkTarget (capture LinkTarget on DepotPlanFile, containment-check both the link path and its resolved target) instead of an empty regular file"
        - "Add depot.test.ts coverage for manifest files carrying Directory and Symlink flags so this class of regression is caught by the existing green suite going forward"
        - "Verify the exact EDepotFileFlag bit values against steam-user's own enum before shipping (21-REVIEW.md CR-01 fix suggestion)"
deferred: []
human_verification:
  - test: "Native .acf adoption (StateFlags 1026→4) + launch, including a confirmed hard-DRM title"
    expected: "Steam's verify pass flips StateFlags 1026→4 with near-zero re-download; game launches via steam://rungameid; hard-DRM title launches without the DRM layer rejecting the file set"
    why_human: "Requires a real authenticated Steam account, real Steam client verify-repair pass, and a confirmed hard-DRM-wrapped owned title — none of which exist in CI. Prepared as 21-UAT.md Task 1a-1c, currently PENDING."
  - test: "Cancel mid-download → 1026 manifest → Steam's own repair-on-launch completes the install"
    expected: "Cancel leaves an honest 1026 manifest (not broken/missing); Steam repairs the incomplete install itself without GameLib intervention"
    why_human: "Requires a real Steam client's verify/repair behavior against a partial install, not reproducible in CI. 21-UAT.md Task 1d, PENDING."
  - test: "10GB+ real depot streams with bounded (non-linear-growth) main-process RSS, and downloaded files are byte-correct"
    expected: "RSS plateaus around O(concurrency × chunk size), does not grow proportionally with total bytes downloaded; SHA1 of sampled large files matches a known-good reference"
    why_human: "Requires a real 10GB+ owned Steam title and OS-level process memory monitoring over a multi-minute real download — not reproducible in unit tests. 21-UAT.md Task 2a-2b, PENDING."
  - test: "Real multi-depot game: correct summed total shown, all depots present on disk, Steam adopts cleanly with no cross-depot file collision"
    expected: "DownloadManager total reflects the D-03 summed total across all depots; no depot's files clobber another's; Steam adopts without a forced full re-download"
    why_human: "Requires a real multi-depot owned title and a real Steam client's adoption pass. 21-UAT.md Task 2c, PENDING."
  - test: "Bottled Windows Steam (macOS/CrossOver) adopts a GameLib-written 1026 manifest identically to native Steam, and the game launches through the bottle"
    expected: "Bottled Steam's own verify pass flips StateFlags 1026→4 with no meaningful re-download; game launches through the bottle"
    why_human: "Requires a real macOS machine with a provisioned CrossOver bottle and a bottle-eligible owned title; RESEARCH.md itself flags D-15 bottle adoption as an untested inference. 21-UAT.md Task 3, PENDING."
  - test: "D-10 guided native Steam-client install is consent-gated and genuinely non-silent per OS (Windows installer window visible, macOS DMG mount+Finder, Linux link-out)"
    expected: "A consent dialog appears before anything downloads/runs; the resulting install flow is visibly interactive, never a silent/unattended install"
    why_human: "Requires observing a real installer UI / Finder window / browser tab launch on each OS — not observable from source alone. 21-UAT.md Task 4a, PENDING. REQUIREMENTS.md itself marks SNI-06 Pending, consistent with this."
  - test: "D-11 prompt-to-launch never authors libraryfolders.vdf, and D-11's continue-to-download auto-retries once Steam becomes ready"
    expected: "The 'launch Steam once' banner appears when the file is absent; GameLib never creates the file itself; once the user launches Steam, the pending install auto-continues without a manual re-click"
    why_human: "Requires a real Steam client state transition (never-launched → launched) and observing GameLib's background poll behavior against it. 21-UAT.md Task 4b-4c, PENDING."
---

# Phase 21: Steam Native Install (depot download) Verification Report

**Phase Goal:** Steam games install through an in-process depot download GameLib owns — with real progress, real error surfaces, and recovery — instead of the opaque `steam://rungameid` handoff. GameLib downloads depot content over `steam-user`'s authenticated CM connection, writes an `appmanifest_{appId}.acf` the Steam client adopts, and launch stays with `steam://` so DRM keeps working.
**Verified:** 2026-07-16
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

No `success_criteria` array is populated in ROADMAP.md for this phase (empty `[]` via `gsd-sdk query roadmap.get-phase 21`). Must-haves were derived per Option C from the phase's 8 minted requirements (SNI-01..08) plus the 12 plans' frontmatter `must_haves`, all of which were read and cross-checked against the actual codebase (not SUMMARY.md claims).

### Observable Truths

| # | Truth (requirement) | Status | Evidence |
|---|---|---|---|
| 1 | **SNI-01** — In-process depot engine downloads every owned depot, streaming to disk, cross-server chunk retry, two-channel ownership selection, no whole-file RAM buffering | ✗ FAILED | Engine exists, is wired, and unit tests pass (431/431 steam-suite tests), but a real correctness bug (CR-01, confirmed by direct code read) writes directory/symlink manifest entries as empty regular files, breaking real installs for virtually any game with subdirectories. Not caught by any existing test. See gap below. |
| 2 | **SNI-02** — Hand-templated `appmanifest_{appId}.acf`, `StateFlags=1026` (never 4), 64-bit GIDs as strings, atomic temp+rename write | ✓ VERIFIED | `depot/manifest.ts` hardcodes `"StateFlags"\t\t"1026"` (never interpolated, never settable to "4"); `InstalledDepotEntry.manifest`/`depotId` typed and kept `string`, never coerced through `Number()`; `writeAppManifest` opens `.tmp`, `writeFile`+`sync`, then `rename()` over the final path (atomic). `manifest.test.ts` passes. Minor robustness gap (WR-01: `name`/`installdir` interpolated unescaped into VDF text) noted but does not break the primary flow for well-formed titles — tracked as a warning, not blocking. |
| 3 | **SNI-03** — Steam installs enqueue into the existing DownloadManager queue with real percent/speed/ETA from real summed total bytes; cancel aborts the in-flight chunk loop | ✓ VERIFIED | `depot.ts` computes `totalBytes` summed across every depot's files (D-03) in `buildDepotPlan`; progress emits via `sendFrontendMessage('progressUpdate', ...)` matching `pollInstallOnce`'s shape; `games.ts.stop()` now calls `callAbortController(this.appId)` for an in-flight native install (was previously a no-op) and the chunk loop checks `signal?.aborted`. Minor gap (WR-03: percent not clamped, can exceed 100 when doneBytes>totalBytes) noted as a warning, does not block the core truth. |
| 4 | **SNI-04** — Failure/cancel/startup-with-partial converge on ONE finalize function; plain-language error+Retry; startup never silently re-drives Steam | ✓ code-verified / **? UNCERTAIN for real adoption** | `downloadSteamDepots`'s `try`/`catch` both funnel through the same `finalize()` closure calling `finalizeToSteam`, always as the LAST fs action (confirmed by direct read, `depot.ts:750-827`); `classifyDepotError` maps ENOSPC/traversal/SHA1/connection failures to actionable i18n copy; `library.ts init()` now calls `finalizeToSteam(appId, ...)` before `startInstallPolling` on a startup-detected partial (confirmed at `library.ts:36,150-184`), never re-invoking `downloadSteamDepots`. The MECHANISM is sound and tested, but whether a real Steam client actually adopts the resulting 1026 manifest and repairs a cancelled/failed download is unverified — 21-UAT.md Task 1a/1d are both PENDING. Routed to human verification, not treated as failed. |
| 5 | **SNI-05** — Downloads target an existing registered Steam library's `steamapps/`, defaulting to primary, override picker only with 2+ libraries, never mutates `libraryfolders.vdf` | ✓ VERIFIED | `installLocation.ts` enumerates via `getSteamLibraries()` (read-only), `resolveOverride` matches an override by `resolve()` equality against registered libraries only (falls back to primary otherwise — never an arbitrary path), `resolveSteamInstallTarget` replaces Plan 07's stub. `installLocation.test.ts` passes. Minor defense-in-depth gap (WR-04: `sanitizeInstalldir` is separator-only, doesn't reject quotes/control chars/drive-relative names) noted as a warning. |
| 6 | **SNI-06** — Steam-absent triggers consent-gated, genuinely non-silent guided client install per OS; Steam-installed-but-never-launched prompts launch-once; never authors `libraryfolders.vdf` | **? UNCERTAIN (human_needed)** | Code is substantive and present: `clientSetup.ts` (`ensureSteamClientReady`, `startGuidedClientInstall` — Windows spawns the exe directly with no silent flag, macOS `open`s the .dmg, Linux link-outs via `openUrlOrFile`) and `SteamClientSetup.tsx` (187 lines, wired to `steamClientSetupRequired`/`steamClientSetupRecheck`, auto-retry poll). REQUIREMENTS.md itself marks SNI-06 `[ ]` Pending — consistent with this verifier's finding. Plan 21-10 was explicitly `autonomous: false` with its human-verify checkpoint deferred to 21-12's UAT; all 3 real-machine flows (4a/4b/4c) are PENDING in 21-UAT.md. Code-complete, hardware-unverified. |
| 7 | **SNI-07** — Opt-in setting, default OFF, no platform gate (all 3 OSes), OFF preserves `steam://install` handoff byte-for-byte, ON has no per-case fallback | ✓ VERIFIED | `EnableSteamNativeInstall.tsx` uses `useSetting('enableSteamNativeInstall', false)` (default `false`), no OS conditional anywhere in the component or `nativeInstallSetting.ts`. `games.ts.install()` checks `isSteamNativeInstallEnabled()` and only THEN branches to `installNative()`/`installBottleNative()`; the OFF path (`buildSteamProtocolUrl` → `shell.openExternal` → `startInstallPolling`) is unchanged below the new branch. `games.test.ts` passes. |
| 8 | **SNI-08** — macOS bottle-eligible install depot-downloads the WINDOWS depot into the bottle's own `steamapps/`, `os:'windows'` hardcoded, `isBottleReady()` gate, no Wine dispatch for the download | ✓ code-verified / **? UNCERTAIN for real bottle adoption** | `games.ts.installBottleNative()` targets `getBottleSteamappsDir(getSteamBottleSettings().wineCrossoverBottle)` and passes `os: 'windows'` (hardcoded, never the host OS) into the SAME `installDepotDownload`/`downloadSteamDepots` path as native; `tellBottledSteamToInstall` is only called in the OFF branch. `install()`'s bottle-eligible branch gates on `isBottleReady()` before reaching the native-install decision. Shares the SAME `downloadSingleFile` engine as SNI-01, so it inherits CR-01's directory/symlink defect. Real bottled-Steam adoption (RESEARCH's own flagged untested inference, Assumption A3) is PENDING — 21-UAT.md Task 3. |

**Score:** 4/8 cleanly VERIFIED (SNI-02, 03, 05, 07); 1/8 FAILED (SNI-01, code-level blocker); 3/8 UNCERTAIN pending real-hardware UAT (SNI-04, 06, 08).

Per the escalation-gate decision tree, a FAILED truth takes precedence over UNCERTAIN/human_needed items: **status = gaps_found**, not `passed` or `human_needed`, even though the automated suite (73/73 suites, 1298/1298 tests, `tsc --noEmit` clean — both independently reproduced by this verifier) is fully green.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/backend/storeManagers/steam/depot/crypto.ts` | steamDecrypt, decryptFilename | ✓ VERIFIED | Exists, exports match, `depotPrimitives.test.ts` passes |
| `src/backend/storeManagers/steam/depot/decompress.ts` | decompressChunk, sha1, fetchChunk (cross-server retry) | ✓ VERIFIED | Exists, exports match |
| `src/backend/storeManagers/steam/depot/select.ts` | selectAllDepots/selectDepots, GIDs as strings | ✓ VERIFIED | `gid: string` typed; comment confirms `String(gid)` emission (T-21-04) |
| `src/backend/storeManagers/steam/depot/manifest.ts` | writeAppManifest, StateFlags | ✓ VERIFIED | Hardcoded `"1026"`, atomic temp+rename |
| `src/frontend/screens/Settings/components/EnableSteamNativeInstall.tsx` | D-13 opt-in toggle | ✓ VERIFIED | 43 lines (≥30 min), `useSetting` + `ToggleSwitch` + `InfoIcon`, default false |
| `src/backend/storeManagers/steam/nativeInstallSetting.ts` | isSteamNativeInstallEnabled() | ✓ VERIFIED | Single accessor, `?? false` default |
| `src/backend/storeManagers/steam/depot.ts` | downloadSteamDepots, finalizeToSteam orchestrator | ⚠️ VERIFIED-WITH-DEFECT | Exists, exported, wired, tested — but contains CR-01 (see gap) |
| `src/backend/storeManagers/steam/depotErrors.ts` | classifyDepotError | ✓ VERIFIED | Regex-based classification, i18n-wired |
| `src/backend/storeManagers/steam/library.ts` | init() D-05 finalize-then-watch rewire | ✓ VERIFIED | `finalizeToSteam` imported and called before `startInstallPolling` in the startup-resume path |
| `src/backend/storeManagers/steam/installLocation.ts` | resolveSteamInstallTarget, listSteamLibraryTargets | ✓ VERIFIED | Both exported, registered-library-only targeting confirmed |
| `src/backend/storeManagers/steam/clientSetup.ts` | ensureSteamClientReady + guided install | ✓ VERIFIED (code) / UNCERTAIN (hardware) | 241 lines, substantive per-OS non-silent install logic; empirically unverified |
| `src/backend/storeManagers/steam/games.ts` | install()/stop() opt-in branch, seams, error mapping | ✓ VERIFIED | `installNative`/`installBottleNative`/`installDepotDownload` present; `stop()` now real abort |
| `.planning/phases/21-steam-native-install/21-UAT.md` | recorded real-machine validation | ⚠️ EXISTS-BUT-UNRUN | Document/template exists and is well-formed; **0 of 11 items have been executed** — `status: partial`, all `PENDING` |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `depot/decompress.ts` | lzma npm package | `lzma.decompress` | ✓ WIRED | Pattern found |
| `depot/manifest.ts` | `steamapps/appmanifest_{appId}.acf` | atomic temp+rename | ✓ WIRED | Pattern found |
| `EnableSteamNativeInstall.tsx` | GlobalConfig `enableSteamNativeInstall` | `useSetting('enableSteamNativeInstall', false)` | ✓ WIRED | Confirmed by direct read (automated tool's regex escaping tripped a false negative — manually verified line 11-14) |
| `depot.ts` | `depot/select.ts` + steam-user PICS/manifest calls | `selectAllDepots` then `getRawManifest`+`decryptFilename` | ✓ WIRED | Pattern found |
| `depot.ts` | DownloadManager frontend queue | `sendFrontendMessage('progressUpdate', ...)` | ✓ WIRED | Pattern found |
| `depot.ts` | on-disk file at chunk offset | `fd.write(data, 0, data.length, Number(chunk.offset))` | ✓ WIRED | Confirmed by direct read at `downloadFileChunks` — automated tool's escaped-regex query returned a false negative (pattern literally present) |
| `depot.ts finalizeToSteam` | `depot/manifest.ts writeAppManifest` | writes 1026 last, after files | ✓ WIRED | Confirmed by direct read: `finalize()` awaited once on the success path (after `downloadDepotFiles`) and again only on the `catch` path (never both) |
| `games.ts install()` | `depot.ts downloadSteamDepots` | `isSteamNativeInstallEnabled()` gate | ✓ WIRED | Confirmed by direct read at `games.ts:588,618,742` — automated tool query used a compound "from" string it couldn't resolve as a file path, false negative |
| `games.ts install()` error outcome | `downloadqueue.ts` existing error+Retry surface | `InstallResult.error` | ✓ WIRED | `installDepotDownload` returns `{status:'error', error: outcome.error}` — `downloadqueue.ts` itself confirmed NOT modified by this phase (not in `files_modified` of any of the 12 plans) |
| `library.ts init()` | `depot.ts finalizeToSteam` | startup resume finalizes then watches | ✓ WIRED | Confirmed by direct read, `library.ts:36,150-184` |
| `installLocation.ts` | `getSteamLibraries()` | enumerate registered folders | ✓ WIRED | Pattern found |
| `games.ts install()` | `clientSetup.ts ensureSteamClientReady` | gate before depot download | ✓ WIRED | Confirmed at `games.ts:44,724` |
| `games.ts install() bottle branch` | `depot.ts downloadSteamDepots` | `getBottleSteamappsDir`, `os:'windows'` | ✓ WIRED | Confirmed at `games.ts:678-685` |

Note: several links above showed `"verified": false` / "Source file not found" from the `gsd-sdk query verify.key-links` tool. In every case this was a tool limitation (the plan's `from` field encodes a function name, e.g. `"games.ts install()"`, that the tool tried to resolve as a literal file path rather than a source location within `games.ts`), not an actual wiring gap — each was independently confirmed present by direct file reads above.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| SNI-01 | 21-01, 21-04, 21-05, 21-12 | In-process depot engine, streaming, no fallback | ✗ BLOCKED | CR-01 directory/symlink defect (see gap) |
| SNI-02 | 21-02 | 1026 manifest, 64-bit strings, atomic write | ✓ SATISFIED | Confirmed |
| SNI-03 | 21-04, 21-05 | Real total bytes queue, cancel | ✓ SATISFIED | Confirmed |
| SNI-04 | 21-06, 21-08, 21-12 | Single finalize, error+Retry, no silent re-drive | ? NEEDS HUMAN | Code sound; real adoption/repair unverified |
| SNI-05 | 21-09 | Registered-library-only targeting | ✓ SATISFIED | Confirmed |
| SNI-06 | 21-10 | Guided client install / prompt-to-launch | ? NEEDS HUMAN | Code-complete, deferred to UAT (matches REQUIREMENTS.md's own `[ ]` Pending) |
| SNI-07 | 21-03, 21-07 | Opt-in, default OFF, all-OS, OFF-path-unchanged | ✓ SATISFIED | Confirmed |
| SNI-08 | 21-11, 21-12 | Bottle depot-download, os:'windows', no Wine dispatch | ? NEEDS HUMAN | Code sound; shares CR-01 defect; real bottle adoption unverified |

No orphaned requirements — all 8 SNI-01..08 IDs declared across the 12 plans' `requirements:` frontmatter and all 8 appear in REQUIREMENTS.md's Phase 21 section with matching descriptions.

**Documentation inconsistency found (informational, not a new gap):** REQUIREMENTS.md marks SNI-01, SNI-04, and SNI-08 as `[x]` Complete in its checkbox list, even though 21-12-PLAN.md's own `<objective>` states "No plan may claim SNI-01/SNI-08 complete until these [MUST-VALIDATE hardware] pass," and every one of the 11 items in 21-UAT.md that would close that gate is still `PENDING`. Only SNI-06 is marked `[ ]` Pending in REQUIREMENTS.md, despite SNI-01/04/08 depending on the exact same unresolved UAT gate. This verifier's independent, code-level finding (CR-01) supersedes the REQUIREMENTS.md checkbox for SNI-01 regardless of this inconsistency, but the checkbox for SNI-04/SNI-08 should also be reset to Pending until 21-UAT.md closes.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `src/backend/storeManagers/steam/depot.ts` | 481-495 | Directory/symlink manifest entries (`flags` unused) written as empty regular files | 🛑 Blocker | Breaks real installs for essentially any game with subdirectories (CR-01, see gap) |
| `src/backend/storeManagers/steam/depot/manifest.ts` | 92, 95-96 | Untrusted PICS `name`/`installdir` interpolated into `.acf` VDF text unescaped | ⚠️ Warning | Quote/newline injection into a state-control file Steam and `readAcfState` both parse (WR-01, 21-REVIEW.md) |
| `src/backend/storeManagers/steam/depot.ts` | 491-495 | `size>0` with zero chunks silently written as empty file, reported success, no whole-file SHA1 run | ⚠️ Warning | Masks data loss from a corrupt/mis-parsed manifest until Steam's later verify pass (WR-02, 21-REVIEW.md) |
| `src/backend/storeManagers/steam/depot.ts` | 576 | Progress `percent` not clamped, can exceed 100 | ⚠️ Warning | DownloadManager can render >100% (WR-03, 21-REVIEW.md) |
| `src/backend/storeManagers/steam/installLocation.ts` | 90-103 | `sanitizeInstalldir` is separator-only (rejects only `/`, `\`, `..`) | ⚠️ Warning | Permits quotes/control chars/drive-relative names into the install root and the VDF (WR-04, 21-REVIEW.md) |

No `TBD`/`FIXME`/`XXX` markers found in any of the 12 plans' modified files. No `TODO`/`HACK`/`PLACEHOLDER` markers found in the core depot engine files.

### Human Verification Required

See frontmatter `human_verification` for the 6 grouped items (11 underlying 21-UAT.md rows). All are PENDING and require a real authenticated Steam account plus, for the bottle item, a real macOS + CrossOver machine. These cannot be resolved by this verifier and are not the reason for `gaps_found` status (that is CR-01, a code-level, statically-confirmed defect) — but they must still be run before the phase's empirical "Steam adopts the install" claim can be trusted, per the phase's own 21-12-PLAN.md gate language.

### Gaps Summary

**Blocking gap (drives `status: gaps_found`):** CR-01 — the depot-download engine (`depot.ts`) captures each manifest file's `flags` field but never reads it, so Steam depot manifest entries for directories and symlinks (both `size === 0`, no chunks — a normal, common shape in real depot manifests) are written as empty regular files instead of real directories/symlinks. This produces either `ENOTDIR` or `EISDIR` failures depending on file-processing order for essentially any real game whose install has subdirectories (nearly all of them), and silently materializes symlinks as broken empty files. This was independently confirmed by this verifier through direct code reading (not just by citing 21-REVIEW.md) — `flags` is captured once (`depot.ts:269`) and never read anywhere else in the file. No existing test constructs a manifest entry with a Directory or Symlink flag, so the fully-green automated suite (73/73 suites, 1298/1298 tests, independently re-run by this verifier) does not exercise this path. This directly threatens the phase's core promise — "writes an `appmanifest_{appId}.acf` the Steam client adopts" presupposes the files on disk actually match what the manifest describes; for a game with subdirectories, they currently will not.

This gap sits underneath SNI-01 (the engine itself), and is inherited by SNI-04 (finalize/adoption) and SNI-08 (bottle depot-download, which reuses the same `downloadSingleFile`), since all three share the same file-writing code path.

**Non-blocking but real gaps (warnings, tracked, not scored as failures):** WR-01 (VDF injection via unescaped `name`/`installdir`), WR-02 (silent data loss on `size>0` + zero-chunk manifests), WR-03 (unclamped progress percent), WR-04 (weak `sanitizeInstalldir`) — all confirmed present by direct code read, all from 21-REVIEW.md, none contradicted by this verification.

**Outstanding empirical validation (routed to human_needed, not counted against the gaps_found score):** All 11 items in 21-UAT.md remain PENDING — native `.acf` adoption, hard-DRM launch, cancel-recovery, 10GB+ streaming memory bound, real multi-depot correctness, bottled Steam adoption, and the three D-10/D-11 client-setup flows. These are genuinely hardware-only and cannot be resolved by this verifier; per the phase's own 21-12-PLAN.md, "No plan may claim SNI-01/SNI-08 complete until these pass."

**This looks intentional in scope but not in outcome.** The CR-01 defect does not look like a deliberate design choice — the code comments and `DepotPlanFile.flags` field's own doc-comment ("captured for exactly this purpose") show the author intended to consult it and did not follow through. No override is suggested; this should go to a gap-closure plan (`/gsd:plan-phase 21 --gaps`), not be accepted as-is.

---

_Verified: 2026-07-16_
_Verifier: Claude (gsd-verifier)_
