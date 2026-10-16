---
phase: 21
slug: steam-native-install
status: verified
threats_open: 0
asvs_level: 2
created: 2026-07-20
---

# Phase 21 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register built from the `<threat_model>` block in all 17 plan files (21-01..21-17-PLAN.md)
> plus `## Threat Flags` in the 17 matching SUMMARY files and the residual findings in
> 21-REVIEW.md. VERIFY-MITIGATIONS mode — every mitigation below was confirmed present in
> the cited implementation file, not inferred from plan/summary prose.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|----------------|
| Steam CDN → GameLib | Depot chunk bytes and encrypted filenames are untrusted network input, decrypted/decompressed locally | Encrypted chunk bytes, filenames |
| PICS response → GameLib | Depot GIDs / appIds / installdir / name are untrusted 64-bit values and strings that must remain strings and be escaped | GIDs, appId, installdir, name |
| GameLib → Steam library folder | Writing a `.acf` into a Steam-registered `steamapps/` that the external Steam client will trust and act on | VDF manifest text |
| Decrypted filename → filesystem path | A malicious/corrupt manifest filename/symlink target must not escape `common/{installdir}` | File paths, symlink targets |
| User setting → install branch | The `enableSteamNativeInstall` opt-in gates whether the depot-download path runs at all | Boolean setting |
| DownloadManager cancel → backend | Cancel/abort must reliably reach the in-flight depot loop and never allow a "completed" write | AbortSignal |
| Startup state → Steam/CrossOver | An interrupted download must not auto-trigger external clients without user action | On-disk `.acf` state |
| User/args override path → install target | An install-path override must be constrained to registered Steam libraries | Filesystem path |
| External installer download → execution | GameLib downloads and runs the native Steam installer binary | Installer binary, HTTPS URL |
| GameLib → Steam config | GameLib must never forge Steam's own `libraryfolders.vdf` | Filesystem write (must NOT happen) |
| Bottle name → filesystem path | Bottle path construction must not allow injection | Bottle name string |
| main thread → worker (worker_threads) | Depot decryption key + encrypted bytes cross into a decompress worker isolate | Buffer, key |
| backend logger sink | Depot-selection details written to GameLib's log file (may be shared in bug reports) | Depot ids, GIDs, sizes — never keys/tokens |
| on-disk ACF manifest → GameLib install-state | A partial/interrupted `.acf` decides whether the UI claims a game is installed/launchable | StateFlags bit 4 |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-21-01 | Tampering | crypto.ts `decryptFilename` / depot.ts write loop / installLocation.ts / bottle path | accept (decode layer) / mitigate (write loop) | `decryptFilename` only decodes (crypto.ts:7-11,40-44); containment enforced at every write site via `resolveContainedPath` (depot.ts:748-761, used at :1086,1263) and the symlink-target check (depot.ts:1114-1124); `sanitizeInstalldir` rejects traversal before it reaches the write loop (installLocation.ts:112); bottle path reuses the identical `resolveContainedPath` call (games.ts:755-760, 21-11-SUMMARY) | closed |
| T-21-02 | Denial of Service | decompress.ts (chunk-scoped) / depot.ts streaming write / real-world memory | mitigate | Chunk-scoped decode (single ~1MB chunk); positional `fd.write` per chunk, no whole-file `Buffer.alloc` (depot.ts:663-665,982); bounded `CHUNK_CONCURRENCY=4` pool (depot.ts:685,928-930); real-hardware 10GB+ RSS-bound confirmed (21-UAT.md item 2a: PASS, Cyberpunk 2077 ~90GB) | closed |
| T-21-03 | Tampering | decompress.ts `fetchChunk` / decodeChunk | mitigate | `sha1(data) === chunk.sha` gate before any chunk is returned (decompress.ts:6-7,261-262,338,355-359); mismatched chunk retries a different content server, never persists | closed |
| T-21-04 | Tampering | select.ts/crypto.ts/manifest.ts/depot.ts GIDs | mitigate | Depot GIDs and SteamID64/LastOwner carried and interpolated as `String()`, never `Number` coerced, across select.ts, DepotPlan, manifest.ts's `InstalledDepotEntry.manifest: string`, and depot.ts:117,1719,1799-1803 | closed |
| T-21-05 | Injection | manifest.ts/depot.ts/games.ts/installLocation.ts/clientSetup.ts appId/depotId | mitigate | `/^\d+$/` `assertNumericId`/`NUMERIC_ID` guard applied before every interpolation/network use — manifest.ts:40-41,79-83,122,127,146,202; depot.ts NUMERIC guard on appId/depotId prior to network/fs use; `buildSteamProtocolUrl` legacy guard retained (games.ts); `ensureSteamClientReady` single seam guard (clientSetup.ts, 21-10-SUMMARY) | closed |
| T-21-06 | Tampering / DoS | manifest.ts `writeAppManifest` atomic write | mitigate | temp-file (`.acf.tmp`) + `handle.sync()` (fsync) + `nodeFsPromises.rename()` atomic rename (manifest.ts:198-219); crash mid-write leaves the old/absent manifest | closed |
| T-21-07 | Spoofing / Tampering | manifest.ts / depot.ts finalize | mitigate | `stateFlags` defaults unconditionally to `'1026'` (manifest.ts:154); depot.ts's finalize routes only through `writeAppManifest`; depot.ts never writes `"StateFlags" "4"` (grep-verified 0 occurrences outside the accepted-caller path); "4" is writable only via `canWriteFullOwnership` completeness gate (Phase 23, out of Phase 21 scope) | closed |
| T-21-08 | Elevation of Privilege / regression | nativeInstallSetting.ts + frontend toggle | mitigate | Backend accessor defaults to `false` (`?? false`, nativeInstallSetting.ts:15); frontend `useSetting('enableSteamNativeInstall', false)` (EnableSteamNativeInstall.tsx:11-14); dedicated opt-in-OFF test asserts legacy path byte-for-byte unchanged (21-07-SUMMARY) | closed |
| T-21-09 | Tampering | setting key drift (frontend/backend) | accept | Both sides use the identical literal string `enableSteamNativeInstall` — confirmed via grep in nativeInstallSetting.ts:1-16 and EnableSteamNativeInstall.tsx:11-13 | closed |
| T-21-10 | Denial of Service | depot.ts steam-user internal import | mitigate | `import('steam-user/components/content_manifest.js')` guarded with a loud throw if the export shape is missing (depot.ts:437-448); `steam-user` pinned to `^5.3.0` in package.json:111 | closed |
| T-21-11 | Spoofing | depot.ts / user.ts session reuse | mitigate | `SteamUser.ensureConnected()` reused as the single connect seam (depot.ts:264-270,371,568); no second `new SteamUser()` logon found in the depot pipeline | closed |
| T-21-12 | Denial of Service | depot.ts progress IPC | mitigate | Progress throttled to ~1%/500ms (`PROGRESS_THROTTLE_MS=500`, depot.ts:715,1525,1563), never per-chunk | closed |
| T-21-13 | Tampering | depot.ts/library.ts partial-manifest race | mitigate | Manifest write is always the last fs action via the atomic temp+rename (T-21-06); `resumeInterruptedSteamInstall`/init() only read/finalize, never race a partial `.acf` (library.ts:270-330); startup poller/`readAcfState` are read-only | closed |
| T-21-14 | Information Disclosure | depotErrors.ts `classifyDepotError` | mitigate | Every failure mapped to plain-language i18next copy; no stack trace or internal path ever placed into the returned message (depotErrors.ts:1-9,60-90); `installNative()`/`install()` forward only the classified string into `InstallResult.error` (games.ts:728,783) | closed |
| T-21-15 | Denial of Service | games.ts `stop()` / AbortController | mitigate | `stop()` wired to `callAbortController(this.appId)` (games.ts:1270-1284), mirroring `downloadqueue.ts`'s proven cancel path; abort triggers finalize | closed |
| T-21-16 | Elevation of Privilege / unexpected side-effect | library.ts startup resume / games.ts bottle dispatch | mitigate | Resume path calls only `finalizeToSteam` + `startInstallPolling` (library.ts:305-321); grep-verified absence of `downloadSteamDepots`/`tellBottledSteamToInstall`/`shell.openExternal`/`runWineCommand` on the resume path; bottle install path never imports `dispatchToBottledSteam` (games.ts, 21-11-SUMMARY) | closed |
| T-21-17 | Tampering | installLocation.ts `resolveSteamInstallTarget` | mitigate | Override accepted only if it matches a `getSteamLibraries()`-registered folder (installLocation.ts:56-61,220-238); throws if no registered library found | closed |
| T-21-18 | Tampering | bottle path construction | mitigate | `getBottleSteamappsDir()`/`getSteamBottleSettings()` reused unmodified — no new bottle-path construction code added (games.ts:44-45,755-756); `sanitizeBottleName` (T-17-01, prior phase) already covers it | closed |
| T-21-19 | Tampering | wrong-os depot into bottle | mitigate | `os: 'windows'` is a literal hard-coded string at the bottle call site (games.ts:760), distinct from `hostSteamDepotOs()` used on the native path (games.ts:104,738) | closed |
| T-21-20 | Tampering | clientSetup.ts installer download source | mitigate | Installer fetched only from Valve's official HTTPS URLs (`STEAM_SETUP_EXE_URL`, `STEAM_MAC_INSTALLER_URL` = `https://cdn.cloudflare.steamstatic.com/...`, clientSetup.ts:137-143,193-194); launched non-silently (no silent/quiet flag, clientSetup.ts:219-236) | closed |
| T-21-21 | Elevation of Privilege | clientSetup.ts libraryfolders.vdf | mitigate | GameLib never authors `libraryfolders.vdf` — only reads via `existsSync` (clientSetup.ts:22-27,55-68); `mkdirSync` used only for the installer download's own destDir, never Steam's config tree (clientSetup.ts:199) | closed |
| T-21-22 | Tampering | real-world install integrity (empirical) | mitigate | Real-hardware validation: 1026→4 adoption + launch PASS (21-UAT.md item 1a/1b, WazHack), 10GB+ streaming memory-bound PASS (item 2a, Cyberpunk 2077 ~90GB); multi-depot StateFlags=4 independently HW-confirmed under Phase 23 Gate 1 (2026-07-19); bottled adoption partial-PASS (item 3, launch-through-bottle deferred — tracked as D-UAT-10, explicitly non-blocking for Phase 21) | closed |
| T-21-SC | Tampering | `lzma` npm supply chain | accept | `lzma` 2.3.2 Approved in 21-RESEARCH.md Package Legitimacy Audit (empty postinstall, 42k downloads/wk); confirmed pinned at `lzma: 2.3.2` in package.json:92; real-world byte-correctness confirmed via 21-UAT.md item 2a/2c | closed |
| T-21-13-01 | Tampering | depot.ts `downloadSingleFile` symlink branch | mitigate | Symlink target resolved via `resolve(dirname(dest), linktarget)` and checked with `relative(installRoot, resolvedTarget)` — rejected via `PathTraversalError` if it starts with `..` or is absolute (depot.ts:1114-1124); resolve()+relative(), not path.join | closed |
| T-21-13-02 | Tampering | depot.ts `downloadSingleFile` directory branch | mitigate | Directory `dest` produced by `resolveContainedPath` before `mkdir` (depot.ts:1086,1092-1095) — a `../`-escaping directory name is rejected before any mkdir touches disk | closed |
| T-21-13-03 | Elevation of Privilege | symlink following on later child writes | mitigate | A symlink whose target escapes the root is never created (same guard as T-21-13-01), so no later contained-path write can be redirected through an attacker-planted link | closed |
| T-21-13-04 | Information Disclosure | zero-chunk size>0 file (WR-02, 23-code-review) | mitigate | A size>0 file with zero chunks throws a recorded failure instead of a silent empty success (depot.ts:1134-1141) | closed |
| T-21-14-01 | Tampering | manifest.ts `buildAppManifestText` name/installdir interpolation | mitigate | `vdfEscape()` (`\`→`\\`, `"`→`\"`, control chars→space) applied to both `name` and `installdir` before interpolation (manifest.ts:102-117,165-166) | closed |
| T-21-14-02 | Spoofing | injected StateFlags key via crafted name/installdir | mitigate | Escaping guarantees exactly one `StateFlags` key survives regardless of field content; regression test proves this (21-14-SUMMARY: "regression test proves exactly one StateFlags key... survives an injection attempt") | closed |
| T-21-14-03 | Tampering | installLocation.ts `sanitizeInstalldir` | mitigate | Whitelist rejects quotes/control-chars/colon/non-whitelist chars before the value becomes an install-root path segment (installLocation.ts:112) | closed |
| T-21-15-01 | Tampering | decompress.ts `decodeChunk` / worker decode | mitigate | `sha1(decompressed) === chunk.sha` + length/`cb_original` check live inside `decodeChunk`, single-sourced, enforced before any buffer returns (decompress.ts:333-359) | closed |
| T-21-15-02 | Information Disclosure | decompressPool.ts key crossing worker boundary | mitigate | Key copied into its own `ArrayBuffer` per message via `toOwnArrayBuffer`, never transferred/detached, never logged, never posted back (decompressPool.ts:8-15,377-390) | closed |
| T-21-15-03 | Denial of Service | decompressPool.ts malformed buffer hangs/crashes a worker | mitigate | Per-task `setTimeout` (`DEFAULT_TASK_TIMEOUT_MS=30_000`) terminates + replaces the stalled worker and rejects the task (decompressPool.ts:341-368) | closed |
| T-21-15-04 | Tampering | ArrayBuffer transfer correctness | mitigate | sha1 verification runs after decompress inside `decodeChunk` (same code path as T-21-15-01), so transfer/detach corruption is caught by the same integrity gate | closed |
| T-21-15-SC | Tampering | package installs (Plan 15) | accept | No new package installed by Plan 15 — `lzma` (already audited under T-21-SC) and Node built-ins (`worker_threads`) only | closed |
| T-21-16-01 | Information Disclosure | select.ts logging | mitigate | Only app/depot ids, manifest gids (as strings), sizes, os/arch/oslist/language strings logged (select.ts:23-26,131,188-225); no decryption key/token/SteamID64/LastOwner in this function's scope | closed |
| T-21-16-02 | Tampering / Elevation | "restart Steam" hint | mitigate | Hint is display-only; no `shell.openExternal` call found alongside `isWaitingForSteamRestart` (library.ts:1432-1473); GameLib never launches/focuses/drives Steam | closed |
| T-21-16-03 | Denial of Service | notification spam | mitigate | `notifiedWaiting` fire-once guard on the `activePolls` entry (library.ts:1201-1203,1473-1474) | closed |
| T-21-17-01 | Spoofing | library.ts install-state detection | mitigate | `is_installed` derived only from `isFullyInstalledStateFlags` (bit 4) — single predicate, referenced at library.ts:806,849,913,1296,1357; a 1026/partial manifest can never spoof "installed" | closed |
| T-21-17-02 | Tampering | depot.ts `downloadSteamDepots` finalize | mitigate | An aborted signal forces `outcome: 'cancelled'`, blocking `canWriteFullOwnership` (WR-02 fix commit `e635a4b3` closes the zero-depot early-return gap that previously reported `'done'` on an aborted run, depot.ts:2072-2077 per REVIEW.md) | closed |
| T-21-17-03 | Tampering | npm/pip/cargo installs (Plan 17) | accept | No new packages added by Plan 17 | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Unregistered Flags (SUMMARY.md `## Threat Flags`)

None. All 17 plans' `## Threat Flags` sections either state "None — surface matches the plan's own `<threat_model>`" or (21-03, 21-04, 21-09, 21-13 through 21-17) omit the heading because those plans introduced no code-facing surface beyond what their own `<threat_model>` block already declares (verified by reading each SUMMARY's full section list — no undocumented heading was found). No new attack surface without a threat mapping was detected.

---

## Residual Findings (non-blocking, tracked separately)

These were surfaced during verification but do not correspond to an unmitigated declared threat in the register above — they are flagged for tracking, not as OPEN_THREATS:

- **REVIEW.md WR-03 (`src/backend/storeManagers/steam/library.ts:342-356`, unresolved as of this audit)** — `markSteamInstallIncomplete` unconditionally sets `is_installed: false` on whatever entry it is handed, without confirming the on-disk ACF is actually incomplete. WR-01 and WR-02 from the same review carry explicit "Status: RESOLVED" notes with commit hashes; WR-03 does not. Today's only call site is gated behind the cancelled-native-install branch (so the precondition holds in practice), but the helper is exported/reusable with no internal guard. This is a data-integrity/reliability risk (false-negative "not installed" mislabel), not a "spoof as installed" bypass of any T-21-17 mitigation above — the Play-safety invariant (never render Play for an incomplete install) is unaffected either way. Recommend closing via a follow-up gap plan before this helper gains a second call site.
- **21-UAT.md deferred items** — D-UAT-10 (bottled Steam game launch/uninstall broken on macOS) and the Windows-post-production HW re-runs for item 1d/2c are explicitly tracked as non-blocking for Phase 21 per the 2026-07-19/20 user decision recorded in 21-UAT.md's disposition line. Not a threat-model gap; noted for completeness.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|--------------|------|
| AR-01 | T-21-01 | `decryptFilename` (crypto.ts) intentionally never sanitizes — sanitizing at the decode layer would hide traversal attempts from the single audited containment chokepoint in depot.ts's write loop. Containment is fully enforced downstream (see T-21-01 mitigate evidence). | Plan 21-01 author | 2026-07-20 |
| AR-02 | T-21-09 | Setting-key drift between frontend `useSetting` and backend accessor is a single literal string, grep-verifiable, low blast radius (worst case: toggle silently no-ops rather than mis-enabling). | Plan 21-03 author | 2026-07-20 |
| AR-03 | T-21-SC / T-21-15-SC | `lzma` 2.3.2 — Approved in the 21-RESEARCH.md Package Legitimacy Audit (empty postinstall, active maintenance, 42k downloads/wk). No new packages added in the gap-closure plans (21-13..21-17). | Plan 21-01/21-12/21-15/21-17 authors | 2026-07-20 |
| AR-04 | T-21-17-03 | No new dependency surface added by the D-UAT-09 gap-closure plan (21-17). | Plan 21-17 author | 2026-07-20 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|----------------|--------|------|--------|
| 2026-07-20 | 41 | 41 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [ ] `status: verified` set in frontmatter — left `draft` pending phase-owner sign-off on the WR-03 residual finding above

**Approval:** pending (residual WR-03 tracked, not blocking; recommend phase owner acknowledges before flipping to `verified`)
