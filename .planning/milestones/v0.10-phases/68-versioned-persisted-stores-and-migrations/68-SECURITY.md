---
phase: 68
slug: versioned-persisted-stores-and-migrations
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-15
---

# Phase 68 - Security

Verified against current code (post phases 69-80). Files cited are under `src/`. No drift found that weakens a mitigation; settings/store code moved to `StoreRoot`/`versioning` deps injection but the guards remain.

## Threat Register

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-68-01 | Info disclosure | mitigate | CLOSED | backend/storeVersioning/backup.ts:34-63 `atomicWritePrivate` (0o600 file, 0o700 dir); backup written at :143; no copyFileSync (grep) |
| T-68-02 | Tampering | mitigate | CLOSED | backup.ts:90-93 exact per-store regex with escapeRegExp; `assertInside` (resolve+relative) at :67-74, applied before read, write and unlink (:128,:141,:150) |
| T-68-03 | Info disclosure | mitigate | CLOSED | backup.ts:57,:155 and store_backend.ts tightenTokenPaths log basename + err.message only |
| T-68-04 | DoS | mitigate | CLOSED | backup.ts:22 `MAX_BACKUPS_PER_STORE = 3`; :130 `Buffer.equals` dedupe; prune :146-158 |
| T-68-SC | Tampering | accept | CLOSED | See Accepted Risks |
| T-68-05 | DoS | mitigate | CLOSED | storeVersioning/engine.ts:209-243 `prepareStoreFile` body in try/catch, inner catch swallows ("never rethrow") |
| T-68-06 | Tampering | mitigate | CLOSED | engine.ts:209-228 state set before `super()` completes (store_backend.ts:246 `prepareStore` first); store_backend.ts:262-266 setter refuses all writes when read-only; newer -> markReadOnly engine.ts:152-158 |
| T-68-07 | Info disclosure | mitigate | CLOSED | store_backend.ts:232 `configFileMode: 0o600`; :216 dir 0o700; :219 `tightenTokenPaths` (:170-190) chmods existing files/dirs on load |
| T-68-08 | Tampering | mitigate | CLOSED | store_backend.ts:88-96 `assertContained` throws, called from `translateStoreOptions` (:165) before engine work (:210 then :218); engine.ts:~215 `if (!declaration) return` so undeclared stores never migrate |
| T-68-09 | Info disclosure | mitigate | CLOSED | engine.ts:105-110,:196-199,:229 log chainKey, versions, `errMessage(err)` only |
| T-68-10 | Tampering | mitigate | CLOSED | engine.ts:181 `structuredClone(data)`; :143 `isPlainObject` guard; :184 result validated per step |
| T-68-11 | Tampering | mitigate | CLOSED | storeVersioning/types.ts:10 required `kind`; backend/__tests__/storeKinds.test.ts:64,:223-224 EXPECTED_KINDS equality, :244-303 D-02/D-14 assertions |
| T-68-12 | Info disclosure | mitigate | CLOSED | tokenBearing set at storeManagers/steam/stores.ts:301,:311 and humble/stores.ts:67 (exactly three); storeKinds.test.ts:245 asserts exactly those |
| T-68-13 | Tampering | mitigate | CLOSED | common/types/storePolicy.ts:253-257 rejects first segment `__internal__`; backend/typed_store.ts:37,:117-125 `refuseReservedKey` |
| T-68-14 | Tampering | mitigate | CLOSED | sidecar/storeWriteHandlers.ts:208 `target.readOnly === true` guard; store_backend.ts:262-266 setter backstop; typed_store.ts:133,:139,:145 |
| T-68-15 | Repudiation | mitigate | CLOSED | typed_store.ts:133-149 `readOnly` returns precede `changes.notify`/`invalidate`; storeWriteHandlers.ts:208-212 returns before `pushStoreChanged` (:241) |
| T-68-16 | Info disclosure | mitigate | CLOSED | storeWriteHandlers.ts:209-211 and typed_store.ts:123 log store name + key only |
| T-68-17 | DoS | mitigate | CLOSED | config.ts createGlobalConfig (:~413) single loader via `ensureSettingsMigrated`; v9 case at backend/__tests__/settingsVersioning.test.ts:108 |
| T-68-18 | Info disclosure | mitigate | CLOSED | storeVersioning/settingsFiles.ts:50 `writeSettingsFile` -> `atomicWritePrivate` (0o600); settings backup via engine `writePreMigrationBackup` (engine.ts:~180) |
| T-68-19 | Tampering | mitigate | CLOSED | engine/engineConfig.ts:96-110 name/containment checks (resolve+relative, :102-104) precede `ensureSettingsMigrated` at :108 |
| T-68-20 | DoS | mitigate | CLOSED | game_config.ts:346-356 lazy `ensureSettingsMigrated` on first `get`, per-appName memoised; no boot sweep |
| T-68-21 | Tampering | mitigate | CLOSED | backup.ts:44-54 temp + `renameSync`; used by settingsFiles.ts:50 and engine.ts atomicWritePrivate call |
| T-68-22 | Info disclosure | mitigate | CLOSED | common/types/ipc/appShell.ts:101-108 `z.strictObject` with `z.enum(READ_ONLY_AREAS)`/`z.enum(READ_ONLY_REASONS)`; common/types/readOnlyStores.ts closed sets |
| T-68-23 | Info disclosure | mitigate | CLOSED | readOnlyStores.ts:57,:100 log key/file basename/reason/detail (versions, err.message); engine.ts:101-110 `basename(filePath)` |
| T-68-24 | DoS | mitigate | CLOSED | sidecar/appShellFlowRegistration.ts:703-711 own try/catch after detectVCRedist; comment states no timer/handle; no setTimeout in that block |
| T-68-25 | XSS | mitigate | CLOSED | frontend/components/UI/ReadOnlyStoresNotice/index.tsx:56 i18n `t()` labels over closed-set ids; grep finds no `dangerouslySetInnerHTML` in component, state or NoticeStack |
| T-68-26 | Spoofing | accept | CLOSED | See Accepted Risks |
| T-68-27 | Info disclosure | mitigate | CLOSED | 68-INVENTORY.md:4 "Classified from writer source only; no file under the operator's profile was read" |
| T-68-28 | Repudiation | mitigate | CLOSED | 68-08-SUMMARY.md:46 todos carry severity/platform/ready; `pnpm planning-gates` 12/12 |
| T-68-29 | Info disclosure | mitigate | CLOSED | 68-09-SUMMARY.md:32 snapshot mode 700; deleted per 68-10-SUMMARY.md:28 (process evidence) |
| T-68-30 | Info disclosure | mitigate | CLOSED | 68-09-SUMMARY.md:30-45 records names, modes, versions and sha256 only (process evidence) |
| T-68-31 | Tampering | mitigate | CLOSED | 68-09-SUMMARY.md:33 backup byte-identical to snapshot copy; pre/post metadata kept (process evidence; diff -rq itself not re-observable) |
| T-68-32 | Info disclosure | mitigate | CLOSED | 68-10-SUMMARY.md:28 snapshot and .meta deleted after verified restore and operator "approved" (process evidence) |
| T-68-33 | Tampering | mitigate | CLOSED | 68-10-SUMMARY.md:26-27 restored via `cp -p`, sha256 compared to planted.orig before deletion |
| T-68-11-01 | Tampering | mitigate | CLOSED | backup.ts:43-52 temp write failure unlinks temp and rethrows; direct `writeFileSync(filePath)` only in rename catch (:56-60); storeVersioning/__tests__/atomicWriteFailure.test.ts:95,:139 |
| T-68-11-02 | DoS | mitigate | CLOSED | same fix; engine.ts:193-203 catch -> markReadOnly 'failed'; atomicWriteFailure.test.ts:139 covers truncated-store recovery |
| T-68-11-03 | Info disclosure | mitigate | CLOSED | backup.ts:57 basename + errMessage only; atomicWriteFailure.test.ts:132 asserts stderr content |
| T-68-11-04 | Tampering | accept | CLOSED | See Accepted Risks |

Status: 35 of 35 CLOSED. Note: T-68-29 to T-68-33 are operational controls; evidence is the 68-09/68-10 SUMMARY records, not code.

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-68-01 | T-68-SC (plans 01, 03) | No packages installed by the phase; no supply-chain surface added | gsd-security-auditor (per plan disposition) | 2026-11-15 |
| AR-68-02 | T-68-26 | Notice spam: sidecar is a trusted origin; one-shot push per launch (appShellFlowRegistration.ts:703-711) and dismissed state suppress repeats | gsd-security-auditor (per plan disposition) | 2026-11-15 |
| AR-68-03 | T-68-11-04 | Rename-failure direct write (Windows EPERM/EBUSY) is a pre-existing path; a pre-migration backup exists (backup.ts:143 precedes the write at engine.ts) | gsd-security-auditor (per plan disposition) | 2026-11-15 |

## Unregistered Flags

None. No `## Threat Flags` sections in 68-01..68-11 SUMMARY files.

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-15 | 35 | 35 | 0 | gsd-security-auditor |

## Sign-Off

- [x] All threats have a disposition
- [x] Accepted risks documented
- [x] `threats_open: 0`
