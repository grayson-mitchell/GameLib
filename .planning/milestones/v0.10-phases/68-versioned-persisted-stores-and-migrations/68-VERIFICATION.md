---
phase: 68-versioned-persisted-stores-and-migrations
verified: 2026-11-09T00:00:00Z
status: passed
score: 49/49 plan must-haves verified; 6/6 roadmap goal truths verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 47/49
  gaps_closed:
    - "A failed migration has a logged, non-destructive fallback: pre-migration file byte-identical, store read-only (D-06; 68-02 truth 5; G4)"
    - "atomicWritePrivate writes temp-then-rename and falls back to direct write only on rename failure (68-01 truth 6)"
  gaps_remaining: []
  regressions: []
---

# Phase 68: Versioned persisted stores and migrations: Verification Report

**Phase Goal:** Every persisted store has a schema version, and a change to its shape ships with an
ordered migration, so an upgrade never silently resets a user's settings, library cache or Steam
state to defaults. Build on `src/backend/migration/` rather than replace it.
**Verified:** 2026-11-09T00:00:00Z
**Status:** passed
**Re-verification:** Yes, after gap closure 68-11 (commits 9f3822232 test, d252f83dd fix). Previous: gaps_found, 47/49.

## Goal Achievement

### Roadmap goal truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| G1 | Every store has a schema version | VERIFIED | `GameLibStore` (store_backend.ts) routes every conf write through `set store`, which calls `stampForWrite`. That stamp is `__internal__.gamelib.schemaVersion`. Settings files use `version: 'vN'` through `settingsVersionCodec`. Absent means v0, and the implicit `adopt-v1` step is identity. |
| G2 | Migrations keyed by store and version run before first read | VERIFIED | `prepareStore()` runs `prepareStoreFile` inside the `super(...)` argument, before conf reads anything. It is keyed by resolved path and chain key `<dir>/<name>`. `GlobalConfig.get()` (config.ts:99), `GameConfig.get()` (game_config.ts:53) and `readStoredGameConfig` (engineConfig.ts:95) call `ensureSettingsMigrated` first. |
| G3 | `migrateTrayIconVariant` / `migrateFocusRowSelection` folded in | VERIFIED | `storeMigrations/settingsGlobal.ts` v0->v1 calls both helpers, then deletes `darkTrayIcon` and `libraryTopSection` (D-04). The read-side normalisers stay at config.ts:257-258 and appShellFlowRegistration.ts:251. The plan documents this as its D-11 decision. |
| G4 | A pre-migration backup and a logged, non-destructive fallback on failure | VERIFIED (was FAILED, closed by 68-11) | The backup is written first, failures are logged and the store goes read-only. backup.ts:43-52 now unlinks the temp and rethrows on a temp-write failure, so the live file is never opened; engine.ts catch (line ~143) marks the store read-only 'failed'. atomicWriteFailure.test.ts proves the live file stays byte-identical and the next launch recovers. |
| G5 | A test per migration from an old-shape fixture | VERIFIED | `storeMigrations/__tests__/fixtures/settings-global-v0*.json` are used by `settingsGlobal.test.ts`. `settings-game-v0.json` is used by `settingsFiles.test.ts`. The only non-identity migration is settings/global v0->v1; the rest are identity adoption steps. |
| G6 | Builds on `src/backend/migration/` rather than replacing it | VERIFIED | `MigrationSystem` and `LegendaryGlobalConfigFolderMigration` are unchanged and kept for one-off cross-file moves (CONTEXT discretion). `migrationsStore` now declares a kind. The per-store engine sits beside it in `storeVersioning/` and `storeMigrations/`. |

### Plan must-have truths (49)

| Plan | Truths | Result | Notes |
| ---- | ------ | ------ | ----- |
| 68-01 | 6 | 6 VERIFIED | Truth 6 now holds: temp-write failure unlinks the temp and rethrows; direct-write fallback only on renameSync failure (backup.ts:53-65). Was FAILED (CR-01). Truth 4 (keep only the newest 3 backups) holds as written, but WR-01 applies (see below). The A6 accessor tests pass. |
| 68-02 | 8 | 8 VERIFIED | Truth 5 now holds (was FAILED, CR-01). Prior note: Truth 5 ("a migration that throws leaves the original file byte-identical") fails for the write-failure class: CR-01. All the others hold in engine.ts and store_backend.ts: the newer-file view and refusal, cache discard, shared-path state with a logged kind mismatch, and 0o600/0o700 plus `tightenTokenPaths`. |
| 68-03 | 5 | 5 VERIFIED | 55 `new TypeCheckedStoreBackend` / `new CacheStore` constructions, each with a kind. The `StoreDeclaration` third parameter is required, so omitting it is a compile error. The `storeKinds.test.ts` ratchet holds (MIN 51, exact EXPECTED_KINDS match, renderer mirrors). The library stores (steam/gog/legendary/nile/sideload) are user-state. humble_library, steam_known_fix_reports, runsForMe and macArch are user-state. Steam/bottle/humble config are `tokenBearing`. |
| 68-04 | 4 | 4 VERIFIED | `readOnly` early-return happens before both the write and the notify (typed_store.ts:165-177, cache.ts:166-209). `applyStoreWrite` has the `target.readOnly` guard. `__internal__` is refused by `isAllowedStoreField` and `refuseReservedKey`, and stripped from `entries()` and `raw_store`. |
| 68-05 | 7 | 7 VERIFIED | A single `GlobalConfigV0` loader replaces the per-version switch, so `v9` no longer crashes. Per-game migration is lazy. `libraryTopSection` is retired. Writes go through `writeSettingsFile` and are refused when read-only. Truth 7 holds literally, but its atomicity is undermined by CR-01. |
| 68-06 | 4 | 4 VERIFIED | `pushReadOnlyStoresNotice` sits in the one-shot `frontendReady` block (appShellFlowRegistration.ts:591), payload is closed-set ids only, and a late `recordReadOnly` re-publishes. |
| 68-07 | 4 | 4 VERIFIED | `ReadOnlyStoresNotice` is mounted in `AppNoticeStack`. It has no auto-hide, dismissal is held in zustand, unknown ids and reasons are dropped, and the en strings are in `gamelib.json`. |
| 68-08 | 3 | 3 VERIFIED | 68-INVENTORY.md lists the backend writers and the renderer `localStorage` keys (the 21 real `getItem`/`setItem` files are all covered). There are 3 todos with `severity`/`platform`/`ready`. No 4th `.gamelib-pin.json` todo; the summary justifies that verdict from the source. `pnpm planning-gates`: 12/12 PASS (re-run here). |
| 68-09 | 5 | 5 VERIFIED | Gate battery: phase-attributable gates are green (`pnpm codecheck` clean, re-run here). The remaining failures are pre-existing and recorded in deferred-items.md. Re-checked here: genI18nGateScope fails on the live git-derivation anti-rot check, and gamelibCatalogParity fails on `public/locales/sl/gamelib.json`, which this phase did not touch. Real-profile run approved by the operator; config v0->v1 with a backup, modes tightened, 28 store_cache files unchanged. |
| 68-10 | 3 | 3 VERIFIED | The planted v99 `download-manager.json` hash was unchanged after the session, then restored. The snapshot was deleted. 68-VALIDATION.md has `nyquist_compliant: true`. |

**Score:** 49/49 plan truths, plus the 68-11 must-haves. The two previous failures (one root cause, CR-01) are closed.

### Requirements coverage (D-01..D-15 from 68-CONTEXT.md; REQUIREMENTS.md does not exist)

| ID | Claimed by | Status | Evidence / caveat |
| -- | ---------- | ------ | ----------------- |
| D-01 | 01, 02, 03 | SATISFIED (WR-02 warning) | Kind is required at construction, and the ratchet test enforces it. `uploadedLogs` is classified `cache` (see WR-02). |
| D-02 | 03, 09 | SATISFIED | All five library caches are user-state, and the renderer mirrors map to them. |
| D-03 | 02, 04, 06, 09, 10 | SATISFIED | Newer files are never written (constructor merge, set/delete/clear, and renderer writes). Proven live with the v99 file. WR-03 concerns pre-68 builds, which D-03 explicitly does not cover. |
| D-04 | 02, 05 | SATISFIED | The migration deletes the superseded fields. |
| D-05 | 06, 07, 09 | SATISFIED (WR-04 warning) | One notice per launch. It is lost after a renderer reload. |
| D-06 | 02, 04, 05, 11 | SATISFIED (WR-05 warning) | Read-only state, write refusal, retry, and now a byte-identical live file on temp-write failure (CR-01 closed). |
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

### Re-verification of 68-11 (CR-01)

- backup.ts read directly: `writeFileSync(tmpPath)` is in its own try; catch unlinks the temp (swallowing ENOENT) and rethrows, before any write to `filePath`. Rename is a separate try with the retained EPERM/EBUSY direct-write fallback and temp unlink (accepted per 68-01 truth 6 / T-68-11-04).
- atomicWriteFailure.test.ts (3 tests): ENOSPC on temp leaves the live file byte-identical, rethrows ENOSPC, leaves no `.tmp-` file, and asserts no write to the live path or rename; rename EPERM fallback still writes content, 0o600, temp removed, one stderr line with no contents; end-to-end `runFileMigration` ENOSPC returns readOnly/'failed', file byte-identical and parseable, backup equals original, read-only record has ENOSPC detail, and a retry after recovery migrates to v2.
- Spot-check: `npx jest src/backend/storeVersioning src/backend/storeMigrations --selectProjects Backend` -> 6 suites, 38 tests pass (re-run here). Full-project failures (quitTeardownWiring, macArchKnownFixRouting, tauriShellSource) are recorded pre-existing in deferred-items.md.
- Regression: only backup.ts and the new test file changed in code since the first verification (git log); other items carried forward.

### Code review findings: effect on the goal

| ID | Breaks a must-have / the goal? | Verdict |
| -- | ------------------------------ | ------- |
| CR-01 | Was a blocker | RESOLVED by 68-11 |
| WR-05 rename-fallback: temp not unlinked if the fallback direct write throws; fallback write on disk-full could still truncate | No. It lives only in the rename-failure path (Windows EPERM/EBUSY), which 68-01 truth 6 and T-68-11-04 explicitly retain. It is not the temp-write failure path that D-06 and G4 name, and the migration still logs and goes read-only. Residual risk: a leaked token-bearing temp file and a possible truncation under a double fault (rename fail plus disk full). | WARNING: move unlink into a finally, and gate the fallback on EPERM/EBUSY/EACCES (review's fix) |
| IN-08 / IN-09 | No (fallback not code-gated; mode assertion in test cannot fail) | Info |
| WR-01..WR-04 | Unchanged from the first verification; none break a must-have | WARNING |

Info items IN-01..IN-07 unchanged.

### Anti-patterns

None blocking. backup.ts catch-all is fixed. config.ts:265 FIXME is pre-existing upstream.

### Human verification

None. Operator approvals from 68-09/68-10 stand.

### Gaps summary

No open gaps. Both previously failed truths (68-01 truth 6, 68-02 truth 5 / D-06 / roadmap G4) are closed. Open non-blocking warnings: WR-01..WR-05.

---

_Verified: 2026-11-09_
_Verifier: Claude (gsd-verifier)_
