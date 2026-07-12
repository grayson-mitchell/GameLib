---
phase: 18
slug: macos-32-bit-detection-badge-crossover-routing
status: secured
threats_open: 0
asvs_level: 1
created: 2026-07-12
---

# Phase 18 Security Audit — macOS 32-bit Detection, Badge & CrossOver Routing

**Audited:** 2026-07-12
**Auditor:** Claude (gsd-security-auditor)
**ASVS Level:** 1
**block_on:** high
**Threat register authored at plan time:** yes (18-01 through 18-05 PLAN.md `<threat_model>` blocks)

Verification method: every `mitigate` threat's declared pattern was grepped/read directly
in the cited implementation file (not inferred from SUMMARY.md prose); every `accept`
threat's rationale was independently checked against current code and git history.

**Resolution:** the audit's single OPEN finding (T-18-03-04) was fixed in commit `6041ed2b`
(real path-containment guard added to `locateMachOBinary` + regression tests). All 18 threats
are now CLOSED — `threats_open: 0`.

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-18-01-01 | Tampering | mitigate | CLOSED | `scripts/steam-appinfo-dump.cjs:54` — `if (!/^\d+$/.test(raw))` rejects before `parseInt`/push into `validated[]`, which alone feeds `getProductInfo([appIdNum], [])` at line 185 |
| T-18-01-02 | Information Disclosure | accept | CLOSED | Verified: `refreshToken` (script line 97/126/143) is only held in-memory for `client.logOn()`; `fs.writeFileSync(outPath, ...)` (line 232) writes only the `appinfo` dump, never the token. Grepped all 4 committed fixtures for token/password/secret — only match is Steam's own public `"token": "#SteamDeckVerified_..."` localization-string keys (false positive, not credentials) |
| T-18-01-SC | Tampering (supply chain) | accept | CLOSED | `git log -- package.json` shows the only phase-18-adjacent package.json commit predates Phase 18; no phase-18 commit touches `package.json` |
| T-18-02-01 | Tampering (injection) | mitigate | CLOSED | `games.ts:143-192` `parseSteamMacMinOSVersion` — tag-strip + regex-only extraction, returns a `{major,minor}` tuple or `null`; no `eval`/DOM render anywhere in the function |
| T-18-02-02 | Tampering (false 32-bit misroute) | mitigate | CLOSED | `games.ts:206-213` `macArchFromMinOS` return type is literally `'64' \| 'unknown'` — no `'32'` member exists; confirmed via read |
| T-18-02-03 | Denial of Service (ReDoS) | mitigate | CLOSED | `games.ts:124-131` `extractVersionTokens` regex `\b(\d{1,2})\.(\d{1,2})(?:\.\d{1,2})?\b` is linear (no nested quantifiers); no new network call — reuses the `axios.get` already bounded by `METADATA_FETCH_TIMEOUT_MS` (`games.ts:346`) |
| T-18-02-04 | Tampering (verdict regression) | mitigate | CLOSED | `games.ts:407-459` — `mac_arch_verified === true` gates the derivation; the `steamMetadataStore.set` write re-includes `mac_arch_verified:true` + carries forward `mac_arch_source` on every subsequent write, preventing the electron-store full-replace regression |
| T-18-02-SC | Tampering (supply chain) | accept | CLOSED | `axios` predates Phase 18; no phase-18 commit touches `package.json` |
| T-18-03-01 | Tampering (command injection) | mitigate | CLOSED | `library.ts` `machOArchsOf` — `execFileSync('lipo', ['-archs', binaryPath], ...)` and `execFileSync('file', [binaryPath], ...)`, both argv-form; no `exec()`/shell-interpolated string anywhere in the file |
| T-18-03-02 | Tampering (destructive misroute) | mitigate | CLOSED | `library.ts` `promptI386Recovery` — `dialog.showMessageBox` is `await`-ed, `if (response !== 0) return` precedes `forceUninstall()`/`install()`; destructive uninstall is fully consent-gated |
| T-18-03-03 | Tampering (false 32-bit) | mitigate | CLOSED | `verdictFromArchs([])` → `null`; `verifyMacArchGroundTruth` treats `null` as a no-op (logs, returns, does not overwrite `mac_arch`) |
| T-18-03-04 | Elevation / wrong-target inspection | mitigate | **CLOSED** | **Fixed in commit `6041ed2b`.** `locateMachOBinary` (`library.ts`) now `resolve()`s the `launchExecutable` candidate and rejects any escape via `relative()` (`rel.startsWith('..') \|\| isAbsolute(rel)` → log + skip, never touches the filesystem) BEFORE the `existsSync` probe. `import { join, resolve, relative, isAbsolute } from 'path'`. Docstring corrected to describe the real control. Regression tests added: `'rejects a launchExecutable that escapes installPath via ".." traversal'` and `'rejects ... absolute path outside installPath'` (library.test.ts). See "T-18-03-04 Resolution" below. |
| T-18-03-SC | Tampering (supply chain) | accept | CLOSED | `child_process`/`electron.dialog` are built-ins/pre-existing; no phase-18 commit touches `package.json` |
| T-18-04-01 | Information Disclosure | accept | CLOSED | `MacArchBadge.tsx` reads only `gameInfo.mac_arch`, a field already present on the frontend `GameInfo`; no new IPC surface, no new data class |
| T-18-04-02 | Tampering (misleading UI) | mitigate | CLOSED | `MacArchBadge.tsx:28-30` — `variantClass = isMac ? 'macArchBadge--warning' : 'macArchBadge--informational'`; `isMac` is a required prop, never re-derived inside the component |
| T-18-04-SC | Tampering (supply chain) | accept | CLOSED | FontAwesome/react-i18next predate Phase 18; no phase-18 commit touches `package.json` |
| T-18-05-01 | Information Disclosure | accept | CLOSED | `mac_arch?: '32' \| '64' \| 'unknown'` (`src/common/types.ts:226`, `electronStores.ts:58`) is a 3-member local string enum; no PII/secret/path/credential shape possible |
| T-18-05-02 | Tampering | mitigate | CLOSED | `library.ts` `refresh()` — `mac_arch: cachedMeta?.mac_arch ?? 'unknown'`; default is `'unknown'`, never `'32'` |

**Threats Closed:** 18/18
**Threats Open:** 0/18

## T-18-03-04 Resolution (was BLOCKER, now CLOSED)

**Declared mitigation (18-03-PLAN.md threat register):** "Bounded to installPath subtree via
`join()`; returns `null` (log+skip) on any miss, never traverses outside or throws."

**Audit finding (pre-fix):** the declared containment did not exist. `join()` normalizes path
segments but performs no containment enforcement — `path.join('/install/dir', '../../etc/passwd')`
resolves to `/etc/passwd`, a textbook path-traversal primitive. `relative()`/`isAbsolute()` were
not even imported. The vulnerable branch (`if (launchExecutable) { ... }`) was dead code today
(the sole call site, `library.ts:615`, never supplies `launchExecutable`), but a `mitigate`
disposition requires the control to actually exist, and the false docstring invited a future
caller to rely on containment that wasn't there. Mapped to 18-REVIEW.md WR-04.

**Fix applied (commit `6041ed2b`, path (a) — real containment):**
- `import { join, resolve, relative, isAbsolute } from 'path'`.
- `locateMachOBinary` now computes `const candidate = resolve(installPath, launchExecutable)`
  (`resolve` honors an absolute `launchExecutable` and collapses `..`), then
  `const rel = relative(installPath, candidate)`; if `rel.startsWith('..') || isAbsolute(rel)`
  the candidate is logged and skipped (falls through to the bounded `*.app` scan) — the
  `existsSync` filesystem probe is only reached for a contained candidate.
- Docstring rewritten to describe the actual control (no longer claims `join()` provides
  containment).
- Two regression tests assert the `..`-traversal and absolute-path candidates return `null`
  and are never filesystem-probed (`library.test.ts`, `describe('locateMachOBinary()')`).
- `npx tsc --noEmit` clean; `library` suite 226/226 passing.

ASVS L1 (V12.3 file/path handling): the externally-influenceable path parameter is now validated
before any filesystem operation.

## Accepted Risks Log

The following `accept`-disposition threats were independently verified against current code
and are logged here as the canonical accepted-risk record for Phase 18:

| Threat ID | Risk | Accepted Rationale (verified) |
|-----------|------|-------------------------------|
| T-18-01-02 | Captured fixture JSON could leak credentials | Verified: dump harness never persists `refreshToken` to disk; fixtures contain only public Steam store/appinfo metadata. False-positive grep hits on `"token"` are Steam's own public Deck-compatibility localization keys. |
| T-18-01-SC, T-18-02-SC, T-18-03-SC, T-18-04-SC | Supply-chain risk from new package installs | Verified via `git log -- package.json`: no Phase 18 commit modifies `package.json`. All libraries used (`axios`, `child_process`, `electron.dialog`, FontAwesome, react-i18next) predate this phase. |
| T-18-04-01 | MacArchBadge could disclose sensitive data via UI | Verified: badge renders only `gameInfo.mac_arch`, an existing 3-member public enum; no new data class or IPC channel introduced. |
| T-18-05-01 | `mac_arch` enum crossing the `pushGameToLibrary` IPC boundary | Verified: `mac_arch` is a 3-member local string enum with no PII/secret/path/credential shape; it crosses the same pre-existing IPC channel used for every other `GameInfo` field. |

## Out-of-Scope Robustness Notes

`18-REVIEW.md` WR-01/WR-02/WR-05/WR-06 (forceUninstall in-memory-only, `file`-fallback path
substring matching, getSteamInstallSize no-timeout, fire-and-forget `.catch`) do not correspond
to any registered threat-model mitigation claim — they are code-quality/robustness findings, not
declared-and-broken security mitigations, and remain tracked in `18-REVIEW.md` as separate
follow-ups. WR-04 mapped onto T-18-03-04 and was resolved above.

## Audit Trail

| Date | Event |
|------|-------|
| 2026-07-12 | Initial audit (State B, register authored at plan time): 17/18 CLOSED, T-18-03-04 OPEN (declared `join()` containment not enforced in code). |
| 2026-07-12 | T-18-03-04 fixed via path (a) — real `resolve()`+`relative()` containment guard + regression tests (commit `6041ed2b`). Re-verified: 18/18 CLOSED, `threats_open: 0`. |

---
*Audit method: direct source read + grep against files cited in each threat's Mitigation Plan;
SUMMARY.md self-assessments used only as a starting pointer, never as evidence of closure. The
single OPEN finding was remediated in code (not silently downgraded) and re-verified.*
