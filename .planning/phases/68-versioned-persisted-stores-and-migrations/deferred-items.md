# Deferred items

- 68-01: `meta/__tests__/logSecretGate.test.ts` fails on 2 pre-existing violations in `src/backend/utils/uninstaller.ts:131,142` (`result.stderr` logged unreduced; introduced by c3ddef301). Not caused by phase 68; storeVersioning/ adds no violations.
- macArchKnownFixRouting Intel test, quitTeardownWiring and tauriShellSource fail on base 2d39f429c too (pre-existing, not from 68-02)
- 68-09: also failing and not caused by phase 68 (none of these touch phase-68 files): gamelibCatalogParity, genI18nGateScope, x86CallbackWineHarness. quitTeardownWiring and tauriShellSource fail on the phase base commit as well. Two unused-import lint errors in `shellFilesFlowRegistration.ts` and `shellFiles.ts` (files untouched by phase 68).
