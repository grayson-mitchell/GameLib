# Deferred items — Phase 37

Out-of-scope failures observed while running this phase's plans' verification
commands. Not fixed here — logged per the executor's scope-boundary rule
(fix only what the current task's changes directly caused).

## From 37-03b (`pnpm test:ci` end-of-wave run, 2026-08-22)

1. **`meta/__tests__/genI18nGateScope.test.ts` — A-17 ANTI-ROT mismatch**
   Pre-existing, unrelated to this plan's files. The committed
   `meta/i18nForkTouchedFiles.json` snapshot disagrees with the live git
   derivation over ~5 paths (e.g. `ProgressDialog/index.tsx`,
   `Settings/components/LauncherArgs.tsx`, `SyncSaves/gog.tsx`,
   `SyncSaves/legendary.tsx`, `WebView/components/humbleLoginChromeCss.ts`).
   Already recorded in this repo's memory as a known-red suite
   (6463/6467 baseline). Not touched by any of 37-03b's `files_modified`.

2. **`src/frontend/screens/ConsoleMode/__tests__/controllerButtonLabels.test.ts`
   — PS5 controller misdetected as PS4**
   `detectControllerLayout('Wireless Controller (Vendor: 054c Product:
   0ce6)')` returns `'ps4'`, expected `'ps5'`. This lives in
   `src/frontend/screens/ConsoleMode/` and appears related to the
   concurrent session's in-flight gamepad work (`src/frontend/helpers/
   gamepad.ts` and sibling test files were dirty in the working tree at
   the start of this plan's execution, per this plan's `<git_safety>`
   block). Not a file 37-03b modified or read; not fixed here.
