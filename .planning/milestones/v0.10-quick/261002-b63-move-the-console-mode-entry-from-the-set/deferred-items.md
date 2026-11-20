# Deferred items — 261002-b63

Out-of-scope discovery logged per the SCOPE BOUNDARY rule (not fixed here).

## 1. `meta/__tests__/genI18nGateScope.test.ts` A-17 anti-rot check fails (pre-existing)

**Test:** `A-17 ANTI-ROT: the committed meta/i18nForkTouchedFiles.json equals the LIVE git derivation`

**Observed:** `npx jest --selectProjects Meta` reports 1 failed suite / 1 failed test out of
46 suites / 1346 tests. The live `git diff --name-status <upstream.baseCommit> HEAD --
src/frontend` derivation includes `src/frontend/screens/WineManager/components/WineManagerSettingsModal.tsx`,
which is absent from the committed `meta/i18nForkTouchedFiles.json` snapshot.

**Root cause, measured:** `WineManagerSettingsModal.tsx` was last modified by commit
`ae661b5c6` ("fix(quick-260927-p4a): align three reused-key t() defaults with catalog
values"). `git merge-base --is-ancestor ae661b5c6 83497724a` confirms that commit is an
ancestor of this quick task's starting commit (`83497724a`) -- i.e. the drift predates
this task entirely. Neither Task 1 nor Task 2 of this plan touched
`WineManagerSettingsModal.tsx` or `meta/i18nForkTouchedFiles.json`.

**Disposition:** Not fixed here -- out of scope (SCOPE BOUNDARY rule). The fix is to
re-run `pnpm gen-i18n-gate-scope` and commit the regenerated
`meta/i18nForkTouchedFiles.json` (and possibly `meta/i18nGateScope.json`), which is a
standalone piece of work unrelated to moving the Console Mode entry.

**Everything else in the `Meta` project passes**, including
`hardcodedStringGate.test.ts` (155/155) and `gamelibCatalogParity.test.ts`, both run
directly against this plan's edited files, and the other 44 Meta suites.
