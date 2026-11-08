---
phase: 68-versioned-persisted-stores-and-migrations
verified: 2026-11-08T18:06:48Z
status: gaps_found
score: 47/49 plan must-haves verified; 5/6 roadmap goal truths verified
overrides_applied: 0
gaps:
  - truth: "A failed migration has a logged, non-destructive fallback: the pre-migration file is left byte-identical and the store goes read-only (roadmap scope; D-06; 68-02 truth 5)"
    status: failed
    reason: "CR-01 confirmed. atomicWritePrivate (backup.ts:41-54) wraps the temp write AND the rename in one try. If the temp write fails (ENOSPC, EDQUOT, EIO), the catch runs writeFileSync(filePath, ...), which opens the LIVE file with O_TRUNC and then fails the same way. The engine (engine.ts:143) then marks the store 'failed', but the original is already truncated. The one live migration (settings/global v0->v1 on config.json) is exposed: a truncated config.json makes GlobalConfigV0.readSettings' JSON.parse (config.ts:228) throw. For a future conf-store chain, a store without clearInvalidConfig (configStore, steamConfigStore, humbleConfigStore, downloadManager) would throw from its module-scope constructor (conf get store rethrows non-ENOENT errors) and stop the sidecar booting. A store with clearInvalidConfig would come up empty, and on the next launch the retry finds unparseable JSON, returns 'ok' and the next write replaces the user-state with defaults: the silent reset the phase exists to prevent. The pre-migration backup is usually on disk, so a user could recover by hand, but nothing does it for them."
    artifacts:
      - path: "src/backend/storeVersioning/backup.ts"
        issue: "lines 41-54: the fallback direct write runs on a temp-write failure, not only on a rename failure"
    missing:
      - "Split the try: if writeFileSync(tmpPath) throws, unlink the temp file and rethrow, leaving the live file untouched. Keep the direct-write fallback only for a renameSync failure (Windows EPERM/EBUSY)."
      - "Add a backup.test.ts / engine.test.ts case that mocks the temp write to throw ENOSPC and asserts the live file is byte-identical and the store is read-only with reason 'failed'"
  - truth: "atomicWritePrivate writes temp-then-rename with mode 0o600 and falls back to a direct write plus temp unlink on rename failure (68-01 truth 6)"
    status: failed
    reason: "Same root cause as the gap above. The fallback is not limited to a rename failure, so the write is not atomic when the temp write fails."
    artifacts:
      - path: "src/backend/storeVersioning/backup.ts"
        issue: "catch block covers writeFileSync(tmpPath) as well as renameSync"
    missing:
      - "Same fix as the gap above (one change closes both)"
---

# Phase 68: Versioned persisted stores and migrations: Verification Report

**Phase Goal:** Every persisted store has a schema version, and a change to its shape ships with an
ordered migration, so an upgrade never silently resets a user's settings, library cache or Steam
state to defaults. Build on `src/backend/migration/` rather than replace it.
**Verified:** 2026-11-08T18:06:48Z
**Status:** gaps_found
**Re-verification:** No. This is the initial verification.

## Goal Achievement

### Roadmap goal truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| G1 | Every store has a schema version | VERIFIED | `GameLibStore` (store_backend.ts) routes every conf write through `set store`, which calls `stampForWrite`. That stamp is `__internal__.gamelib.schemaVersion`. Settings files use `version: 'vN'` through `settingsVersionCodec`. Absent means v0, and the implicit `adopt-v1` step is identity. |
| G2 | Migrations keyed by store and version run before first read | VERIFIED | `prepareStore()` runs `prepareStoreFile` inside the `super(...)` argument, before conf reads anything. It is keyed by resolved path and chain key `<dir>/<name>`. `GlobalConfig.get()` (config.ts:99), `GameConfig.get()` (game_config.ts:53) and `readStoredGameConfig` (engineConfig.ts:95) call `ensureSettingsMigrated` first. |
| G3 | `migrateTrayIconVariant` / `migrateFocusRowSelection` folded in | VERIFIED | `storeMigrations/settingsGlobal.ts` v0->v1 calls both helpers, then deletes `darkTrayIcon` and `libraryTopSection` (D-04). The read-side normalisers stay at config.ts:257-258 and appShellFlowRegistration.ts:251. The plan documents this as its D-11 decision. |
| G4 | A pre-migration backup and a logged, non-destructive fallback on failure | FAILED | The backup is written first (`writePreMigrationBackup`), failures are logged and the store goes read-only. The fallback is **not** non-destructive when the write itself fails: see CR-01 below and gap 1. |
| G5 | A test per migration from an old-shape fixture | VERIFIED | `storeMigrations/__tests__/fixtures/settings-global-v0*.json` are used by `settingsGlobal.test.ts`. `settings-game-v0.json` is used by `settingsFiles.test.ts`. The only non-identity migration is settings/global v0->v1; the rest are identity adoption steps. |
| G6 | Builds on `src/backend/migration/` rather than replacing it | VERIFIED | `MigrationSystem` and `LegendaryGlobalConfigFolderMigration` are unchanged and kept for one-off cross-file moves (CONTEXT discretion). `migrationsStore` now declares a kind. The per-store engine sits beside it in `storeVersioning/` and `storeMigrations/`. |

### Plan must-have truths (49)

| Plan | Truths | Result | Notes |
| ---- | ------ | ------ | ----- |
| 68-01 | 6 | 5 VERIFIED, 1 FAILED | Truth 6 (the atomic-write fallback) FAILED: CR-01. Truth 4 (keep only the newest 3 backups) holds as written, but WR-01 applies (see below). The A6 accessor tests pass. |
| 68-02 | 8 | 7 VERIFIED, 1 FAILED | Truth 5 ("a migration that throws leaves the original file byte-identical") fails for the write-failure class: CR-01. All the others hold in engine.ts and store_backend.ts: the newer-file view and refusal, cache discard, shared-path state with a logged kind mismatch, and 0o600/0o700 plus `tightenTokenPaths`. |
| 68-03 | 5 | 5 VERIFIED | 55 `new TypeCheckedStoreBackend` / `new CacheStore` constructions, each with a kind. The `StoreDeclaration` third parameter is required, so omitting it is a compile error. The `storeKinds.test.ts` ratchet holds (MIN 51, exact EXPECTED_KINDS match, renderer mirrors). The library stores (steam/gog/legendary/nile/sideload) are user-state. humble_library, steam_known_fix_reports, runsForMe and macArch are user-state. Steam/bottle/humble config are `tokenBearing`. |
| 68-04 | 4 | 4 VERIFIED | `readOnly` early-return happens before both the write and the notify (typed_store.ts:165-177, cache.ts:166-209). `applyStoreWrite` has the `target.readOnly` guard. `__internal__` is refused by `isAllowedStoreField` and `refuseReservedKey`, and stripped from `entries()` and `raw_store`. |
| 68-05 | 7 | 7 VERIFIED | A single `GlobalConfigV0` loader replaces the per-version switch, so `v9` no longer crashes. Per-game migration is lazy. `libraryTopSection` is retired. Writes go through `writeSettingsFile` and are refused when read-only. Truth 7 holds literally, but its atomicity is undermined by CR-01. |
| 68-06 | 4 | 4 VERIFIED | `pushReadOnlyStoresNotice` sits in the one-shot `frontendReady` block (appShellFlowRegistration.ts:591), payload is closed-set ids only, and a late `recordReadOnly` re-publishes. |
| 68-07 | 4 | 4 VERIFIED | `ReadOnlyStoresNotice` is mounted in `AppNoticeStack`. It has no auto-hide, dismissal is held in zustand, unknown ids and reasons are dropped, and the en strings are in `gamelib.json`. |
| 68-08 | 3 | 3 VERIFIED | 68-INVENTORY.md lists the backend writers and the renderer `localStorage` keys (the 21 real `getItem`/`setItem` files are all covered). There are 3 todos with `severity`/`platform`/`ready`. No 4th `.gamelib-pin.json` todo; the summary justifies that verdict from the source. `pnpm planning-gates`: 12/12 PASS (re-run here). |
| 68-09 | 5 | 5 VERIFIED | Gate battery: phase-attributable gates are green (`pnpm codecheck` clean, re-run here). The remaining failures are pre-existing and recorded in deferred-items.md. Re-checked here: genI18nGateScope fails on the live git-derivation anti-rot check, and gamelibCatalogParity fails on `public/locales/sl/gamelib.json`, which this phase did not touch. Real-profile run approved by the operator; config v0->v1 with a backup, modes tightened, 28 store_cache files unchanged. |
| 68-10 | 3 | 3 VERIFIED | The planted v99 `download-manager.json` hash was unchanged after the session, then restored. The snapshot was deleted. 68-VALIDATION.md has `nyquist_compliant: true`. |

**Score:** 47/49 plan truths. Both failures share one root cause (CR-01).

### Requirements coverage (D-01..D-15 from 68-CONTEXT.md; REQUIREMENTS.md does not exist)

| ID | Claimed by | Status | Evidence / caveat |
| -- | ---------- | ------ | ----------------- |
| D-01 | 01, 02, 03 | SATISFIED (WR-02 warning) | Kind is required at construction, and the ratchet test enforces it. `uploadedLogs` is classified `cache` (see WR-02). |
| D-02 | 03, 09 | SATISFIED | All five library caches are user-state, and the renderer mirrors map to them. |
| D-03 | 02, 04, 06, 09, 10 | SATISFIED | Newer files are never written (constructor merge, set/delete/clear, and renderer writes). Proven live with the v99 file. WR-03 concerns pre-68 builds, which D-03 explicitly does not cover. |
| D-04 | 02, 05 | SATISFIED | The migration deletes the superseded fields. |
| D-05 | 06, 07, 09 | SATISFIED (WR-04 warning) | One notice per launch. It is lost after a renderer reload. |
| D-06 | 02, 04, 05 | **BLOCKED (partial)** | The read-only state, write refusal and retry are in place. "Pre-migration file untouched" fails when the write fails (CR-01). |
| D-07 | 06, 07 | SATISFIED | The failed variant names areas and points to the log, and the flush writes one log line per store. |
| D-08 | 01, 02, 05, 09 | SATISFIED (WR-01 warning) | Backups are 0o600, the 3 newest are kept, and dedupe works. Proven live. |
| D-09 | 03, 05 | SATISFIED | All conf stores, the renderer mirrors, config.json and GamesConfig are covered. |
| D-10 | 05 | SATISFIED | The per-class `upgrade()` versioning is replaced by the engine. |
| D-11 | 05 | SATISFIED | Covered by G3. |
| D-12 | 08, 10 | SATISFIED | Inventory written, with 3 todos. |
| D-13 | 02, 03, 09 | SATISFIED | `configFileMode: 0o600`, new directories 0o700, `tightenTokenPaths` on load. Proven live. |
| D-14 | 03 | SATISFIED | The four named stores are user-state. |
| D-15 | 07, 09 | SATISFIED | No auto-hide; stays until dismissed. Proven live. |

No orphaned IDs: every one of D-01..D-15 is claimed by at least one plan's `requirements:`.

### Key links

All PLAN key links resolve in the code:
- `super(prepareStore(` → engine
- `writePreMigrationBackup(` and `recordReadOnly(` in engine.ts
- `declaration` passed through typed_store.ts and cache.ts
- `target.readOnly` in storeWriteHandlers.ts
- `ensureSettingsMigrated(configPath` in config.ts
- settingsGlobal → the two helpers
- `flushReadOnlyStores(` via `sidecar/readOnlyStoresNotice.ts`. This module moved for appShellImportGate; the wiring is unchanged.
- `handleReadOnlyStoresNotice(` in GlobalState.tsx:1692, registered before `frontendReady` at :2060
- `<ReadOnlyStoresNotice` in NoticeStack

### Behavioral spot-checks (run by the verifier)

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase suites (engine, backup, settings, kinds, read-only, accessors, cache, policy, notice) | `npx jest` over the 15 phase suites | 15/15 suites, 172 tests pass | PASS |
| Types | `pnpm codecheck` | clean | PASS |
| Todo/planning gates | `pnpm planning-gates` | 12/12 | PASS |
| `smoke:sidecar` | not re-run (needs a sidecar build); 68-10 records PASS | n/a | SKIP |

### Code review findings: effect on the goal

| ID | Breaks a must-have / the goal? | Verdict |
| -- | ------------------------------ | ------- |
| CR-01 atomic-write fallback truncates the live file | **Yes.** It contradicts 68-02 truth 5, 68-01 truth 6, D-06 and the roadmap's "non-destructive fallback". The settings/global migration that runs on every v0 profile is exposed, and so is every future conf-store chain. The trigger is narrow (disk full, quota, I/O error, or an unwritable directory with a writable file), but this phase exists to prevent exactly this failure. Note that settings saves were already non-atomic `writeFileSync` before this phase, so ordinary saves did not regress. The new exposure is the migration rewrite path. | **BLOCKER**: small fix, see gaps |
| WR-01 prune can delete the just-written backup on a backwards clock | No, under normal operation. It needs at least 3 existing backups stamped in the future. Then D-08's guarantee silently lapses for that migration. | WARNING: exclude `target` from the prune list (a 1-line fix) |
| WR-02 `uploadedLogs` is `cache` | Not today: no chain ships for it. Its `token` is the hardcoded literal `'1'` (uploader.ts:77, dpaste has no delete), so the credential concern is weaker than the review says. The list of uploaded-log URLs is still not refetchable, and D-14's "default to user-state" points to `user-state`. A newer file would show `{}` in the older build. | WARNING: reclassify before the first `store/uploadedLogs` chain |
| WR-03 the `'v1'` stamp crashes pre-68 builds | Not a must-have: the goal is about upgrades, and CONTEXT accepts that pre-68 builds have no version check. Confirmed at base `b74d85dee` config.ts:131-145: an unknown version leaves `globalInstance` undefined, then `.upgrade()` throws. The CONTEXT "accepted limitation" text ("read and write newer files freely") is therefore wrong for settings files. The per-game `'v1'` bump buys nothing, because that chain is identity-only. | WARNING: correct the CONTEXT text, and consider keeping GamesConfig at `'v0'` until a real shape change |
| WR-04 notice lost on renderer reload | No: D-05 says one notice per launch, and it is delivered once. After a reload, writes stay refused with no visible notice. | WARNING |

Info items IN-01..IN-07 do not affect any must-have. IN-02 (an invalid stamp is treated as v0 and then overwritten) and IN-06 (`titleSettings.ts` reads GamesConfig without `ensureSettingsMigrated`) should be addressed before Phase 70 or the first per-game shape change.

### Anti-patterns

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| src/backend/config.ts | 265 | `FIXME` | Info | Pre-existing upstream marker (bc3c2ddee, 2023), not introduced by this phase |
| src/backend/storeVersioning/backup.ts | 41-54 | Catch-all fallback in an "atomic" write | Blocker | CR-01 |

No new TBD/FIXME/XXX/TODO in the lines this phase added.

### Human verification

The operator already approved the real-profile check (68-09 Task 3) and D-03 was confirmed live (68-10). No new human items. Re-verifying the CR-01 fix needs only an automated test.

### Gaps summary

One root cause, two failed truths. `atomicWritePrivate`'s fallback can destroy the very file it was meant to replace atomically. That breaks the phase's "non-destructive fallback when a migration fails" guarantee (D-06) on a write error. Everything else holds in the code:
- versioning
- ordered migrations before first read
- the fix-up fold-in
- backups
- downgrade refusal
- the notice
- the kind ratchet
- the inventory

Four review warnings (WR-01..WR-04) remain open but do not block the goal. The fix is the review's own patch: split the temp write and the rename into separate `try` blocks, plus one ENOSPC test. A gap-closure plan of one task would close it.

---

_Verified: 2026-11-08T18:06:48Z_
_Verifier: Claude (gsd-verifier)_
