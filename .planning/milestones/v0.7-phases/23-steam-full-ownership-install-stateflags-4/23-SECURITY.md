---
phase: 23
slug: steam-full-ownership-install-stateflags-4
status: draft
threats_open: 0
asvs_level: L1
created: 2026-07-20
---

# Phase 23 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register built from the `<threat_model>` block in 23-01..23-05-PLAN.md (23-04 is the UAT-prep
> plan; 23-05 is a gap-closure plan) plus `## Threat Flags` in 23-03-SUMMARY.md and
> 23-05-SUMMARY.md. VERIFY-MITIGATIONS mode — every mitigation below was confirmed present in the
> cited implementation file/line, not inferred from plan/summary prose. Register authored at plan
> time (register_authored_at_plan_time: true) — this audit does NOT scan for new vulnerabilities,
> only verifies each declared mitigation exists.

---

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Steam CM manifest → local filesystem | Depot manifest `filename`/`flags` are attacker-influenceable if a CM/content server is compromised; they drive path resolution and subprocess arguments |
| Node → OS subprocess (`attrib.exe`) | File path flows into a spawned process argv on Windows |
| Steam CM PICS → manifest text | `buildid` is PICS-sourced untrusted content, unconditionally interpolated into VDF |
| GameLib assertion → Steam client | A StateFlags=4 manifest asserts "complete, do not verify" — a wrong assertion masks a corrupt/incomplete install |
| Pre-existing on-disk files → reconciliation | Files on disk from a prior/interrupted run (or dropped by another process) are untrusted until sha1-verified |
| Manifest `filename`/`linktarget` → filesystem path | Untrusted names drive path resolution during the disk walk |
| Startup resume → external Steam client | Resume must not trigger Steam/CrossOver side effects the user didn't initiate |
| Local IPC (renderer install action) → SteamGame.install/installDepotDownload | A user (or a retry/re-dispatch) can trigger install() for the same appId more than once, concurrently |
| GameLib depot writer → local filesystem (bottle/native steamapps) | Two concurrent downloadDepotFiles runs writing the same install root can interleave/corrupt partial files |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-23-01 | Tampering / Elevation | `fileAttributes.ts` Windows `attrib.exe` call | mitigate | argv-form `spawnSync('attrib', args, ...)` only, hardcoded `'+R'`/`'+H'` literal argv elements, `filePath` pushed as the single trailing argv element, `windowsHide:true`; no shell string / template interpolation anywhere in the module (fileAttributes.ts:27,98-124) | closed |
| T-23-02 | Tampering | `downloadSingleFile` path used for chmod/attrib | mitigate | `dest = resolveContainedPath(installRoot, file.filename)` computed once (depot.ts:1086) and reused unmodified at the sha1 check (depot.ts:1177) and the mode-application call (depot.ts:1196) — never recomputed | closed |
| T-23-03 | Repudiation | Silent mode-application failure masking a non-launchable install | mitigate | A failed `applyEDepotFileModes`/`applyDepotFileFlags` throws inside `downloadSingleFile` (depot.ts:1195-1202), which `downloadDepotFiles`'s existing per-job try/catch converts into a `DepotDownloadFailure` (depot.ts:1658-1663) — never a silent success | closed |
| T-23-04 | Tampering | StateFlags=4 masking a corrupt/incomplete install | mitigate | `canWriteFullOwnership` (depot.ts:847-862) requires `outcome==='completed' && failures.length===0 && !!buildid && buildid!=='0' && allFilesVerified===true && allModesApplied===true`; `finalizeToSteam` calls it with `?? 'cancelled'`/`?? []`/`?? false` defaults (depot.ts:1811-1817) so any omitted/ambiguous input fails closed to `1026` | closed |
| T-23-05 | Tampering | `buildid` injection via crafted/compromised PICS response | mitigate | `assertNumericBuildid` (manifest.ts:95-100) rejects non-numeric buildid before VDF interpolation, called at manifest.ts:150; `'0'` sentinel explicitly exempt | closed |
| T-23-06 | Tampering / Repudiation | buildid re-derived by a 2nd PICS read | mitigate | `finalizeToSteam` (depot.ts:1786-1834) sources `buildid` only from `opts.buildid` (caller-supplied `FinalizeToSteamOpts` field, itself sourced from `DepotPlan.buildid` at plan-build time); grep confirms the module's `getProductInfo` call sites (depot.ts:390,408,425) are all outside `finalizeToSteam`'s body (~1786-1840) | closed |
| T-23-07 | Tampering | Reconcile trusting a corrupt/maliciously-placed file at expected path | mitigate | `regularFileVerified` (reconcile.ts:91-107) requires `sha1File(dest) === file.sha_content` after a size match — size-match alone (line 100) is decisive only for REJECTION, never for a skip; a skip is reachable only via the sha1 branch on line 105-106 | closed |
| T-23-08 | Tampering | Path traversal via manifest filename during the disk walk | mitigate | `reconcilePartialState` resolves every file via `resolveContainedPath(installRoot, file.filename)` (reconcile.ts:137, imported from depot.ts, not reimplemented); `grep -c "path.join("` on reconcile.ts returns 0 | closed |
| T-23-09 | Tampering / Repudiation | Reconciled "complete" install trusting a partial file | mitigate | `allFilesVerifiedThisRun = allJobsAttempted && failures.length === 0` (depot.ts:1683-1690) is the single input `canWriteFullOwnership` (the one chokepoint, T-23-04) consumes; `reconcilePartialState` only reports `allFilesVerified: true` when every file passed its own verified-branch (reconcile.ts:150-157); mode-heal failures on reconciled files are also pushed into the same `failures` array (depot.ts:1364-1369) | closed |
| T-23-10 | Elevation / Side-effect | Startup resume auto-opening Steam-in-CrossOver for bottle games | mitigate | `scanDownloadingAppIds` reads only `getSteamLibraries()`-registered native paths (library.ts:1914-1953, pre-existing Phase-21-audited invariant, unchanged); `tellBottledSteamToInstall` is never imported/called anywhere in library.ts's resume machinery (grep: only referenced in games.ts's distinct bottle-install code path and in two library.ts doc comments) — confirmed for both the current init() surface-only path (library.ts:399-461) and the user-triggered `resumeInterruptedSteamInstall`/`buildResumeFinalizeOpts` path (library.ts:177-268) | closed |
| T-23-11 | Tampering / Repudiation | StateFlags=4 shipped without real-hardware proof (multi-depot, hard-DRM, interrupt-resume) | mitigate (process gate) | Blocking human hardware gate in 23-UAT.md. Gate 1 (multi-depot) **PASSED** on real macOS hardware 2026-07-19 (23-UAT.md Gate 1 Result, 23-05-SUMMARY.md). Gates 2 (hard-DRM) and 3 (interrupt-resume) are explicitly **DEFERRED by user decision** (2026-07-20, recorded in 23-05-SUMMARY.md "Requirements Status" and 23-UAT.md Summary Table) — REQ-23-07 stays open, Phase 23 stays in-progress until closed. This is a documented, user-approved deferred process risk, not an unmitigated code-level threat | accepted / deferred (REQ-23-07 open) |
| T-23-12 | Tampering | Two concurrent `downloadDepotFiles` runs for one appId corrupt install root | mitigate | Single-flight guard at `installDepotDownload` entry (games.ts:827-846): a live (non-aborted) `nativeInstallsInFlight` entry is joined (`return existing.promise`) — `runNativeDepotDownload`/`downloadSteamDepots` is never invoked a second time for a live appId | closed |
| T-23-13 | Denial of Service | Crashed/aborted run failing to clear `nativeInstallsInFlight` permanently blocks reinstall | mitigate | `finally { nativeInstallsInFlight.delete(this.appId); deleteAbortController(this.appId) }` (games.ts:957-963) runs on success, error, cancel, and unhandled throw/rejection alike | closed |
| T-23-14 | Tampering | Stale StateFlags=1026 manifest races a live user-initiated install | mitigate | `isNativeInstallInFlight(appId)` (games.ts:93-94, exported read-only seam) is checked at the startup-resume-surface consumption site (library.ts:408-414) — an in-flight appId is skipped entirely, so a stale on-disk `1026` manifest cannot spawn a second concurrent driver | closed |
| T-23-15 | Repudiation | Dangling AbortController lets a resumed run stack on a not-torn-down run | mitigate | `stop()` sets `inFlight.aborted = true` alongside `callAbortController()` (games.ts:1280-1284); the guard awaits `existing.promise.catch(() => undefined)` before starting a fresh run when the tracked entry is aborted (games.ts:834-838); `deleteAbortController` runs in every `finally` (games.ts:962) | closed |
| T-23-SC | Tampering (supply chain) | npm/pip/cargo installs | mitigate (23-01..03) / accept (23-05) | Zero new packages added across the whole phase — `git log` shows no `package.json` changes in any Phase 23 commit; `attrib.exe`/`chmod` are stock OS facilities, not new dependencies | closed |

---

## Unregistered Flags (from SUMMARY.md `## Threat Flags`)

These are informational — surfaced by the executor as new/changed attack surface during
implementation. Neither is a BLOCKER; both are accounted for below.

- **`threat_flag: new-startup-network-call`** (23-03-SUMMARY.md) — flagged because `SteamLibraryManager.init()`'s Plan-03 wiring made `buildDepotPlan` (PICS + manifest fetch) run unconditionally at every app startup for each in-progress download, where previously startup resume made zero network calls. **Status at time of this audit: superseded/closed.** A later fix (`steam-startup-resume-crash-mitigation`, 2026-07-18, tracked in project memory, predates this audit but postdates 23-03) moved that exact machinery (`buildDepotPlan`/`buildResumeFinalizeOpts`/`reconcilePartialState`) out of `init()` entirely — `init()` now only surfaces a resumable install (marks `steamResumePending`, sends a notification) with zero network calls (library.ts:399-461, verified: no `buildDepotPlan`/`buildResumeFinalizeOpts` call in this block). The flagged network surface now only executes inside `resumeInterruptedSteamInstall()` (library.ts:288-331), which is consent-gated behind an explicit user Install click, not run unattended on every launch. The T-23-10 boundary (never scan the bottle root / never call `tellBottledSteamToInstall`) is unaffected either way and independently verified above.
- **`threat_flag: none-new`** (23-05-SUMMARY.md) — executor's own assessment that Plan 05 added no new network calls/endpoints/data exposure (a module-private in-process `Map` + a read-only boolean seam). Confirmed by code review of games.ts/library.ts changes for this plan — no new I/O surface found.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|--------------|------|
| AR-05 | T-23-11 (Gates 2 & 3) | Hard-DRM launch (Gate 2) and interrupt-resume (Gate 3) real-hardware validation are explicitly deferred — Gate 1 (the defect that was actually diagnosed and fixed by Plan 23-05) is hardware-PASSED; Gates 2/3 require a human with specific owned titles (hard-DRM, large enough to interrupt mid-download) not yet available. Tracked as REQ-23-07 open in 23-UAT.md; phase intentionally NOT marked complete until closed. | User (2026-07-20, per 23-05-SUMMARY.md "Requirements Status") | 2026-07-20 |
| AR-06 | T-23-SC | No new packages added across Phase 23 (23-01 through 23-05) — confirmed via `git log` showing zero `package.json` diffs in any phase commit; `attrib.exe`/`chmod` are OS-native, not npm dependencies. | Plan 23-01/23-02/23-03/23-05 authors | 2026-07-20 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Accepted/Deferred | Run By |
|------------|----------------|--------|------|--------------------|--------|
| 2026-07-20 | 16 | 15 | 0 | 1 (T-23-11, Gates 2 & 3 — REQ-23-07 open) | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted/deferred risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed (no code-level mitigation gaps found)
- [ ] `status: verified` — left `draft`; REQ-23-07 (T-23-11 Gates 2 & 3) remains open, and Phase 23 itself is tracked as in-progress (not complete) pending those two hardware gates — flip to `verified` once REQ-23-07 closes

**Approval:** pending (T-23-11 Gates 2 & 3 tracked as accepted/deferred process risk under REQ-23-07, not blocking this code-level security sign-off; all 15 code-verifiable mitigations CLOSED with file:line evidence)
