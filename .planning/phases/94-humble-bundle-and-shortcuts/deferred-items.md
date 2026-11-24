# Phase 94 deferred items

## From 94-05 (found, not fixed: outside that plan's files)

- `.planning/milestones/v0.8-phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/seam-parity-sweep-gate.py`
  (run by `pnpm planning-gates`) fails with `Axis A site src/backend/sidecar/loginSeamRegistration.ts:331 matched none of
  the mechanical tiers ... AND has no SITE_PROFILES entry`. 94-04 moved the login-window seam into that new file; the
  gate needs a `SITE_PROFILES` entry (or the gate's file list updated) for the relocated site. Owner: whichever 94 plan
  next touches the login seam (94-17, 94-29 or 94-30 per the 94-04 summary), or a quick task.

  **Resolved 2026-11-24 (orchestrator, between 94-05 and 94-06):** the survivor set and the `SITE_PROFILES` entry
  now name `src/backend/sidecar/loginSeamRegistration.ts:331` (the same smoke guard, moved verbatim by 94-04), and
  `34.4.1-SEAM-PARITY-SWEEP.md` was regenerated with `--write`. `pnpm planning-gates` is 12/12 again.

## From 94-11 (found, not fixed: outside that plan's files)

- `src/backend/testUtils/humbleOracle/wireRecorder.ts` (94-06) trips two port-complete gates that run in the backend jest
  project: `humblePortComplete.test.ts` (`noRollbackFlag`: the file names `GAMELIB_HUMBLE_ORACLE`) and
  `infoPortComplete.test.ts` (`oraclePortComplete`: "no non-test file names the oracle recorder or harness", it exports
  `recordedCaseDir`). Both are red at `aa48ee062`, before 94-11, and nothing in 94-11 touches the file. Owner: whichever
  94 plan next edits the Humble oracle harness (94-10 consumes it) or removes it (94-30). The flag name is the 94-06
  forward-mode switch (`GAMELIB_HUMBLE_ORACLE=forward`, used only by 94-10), so the gate's text match needs either a
  rename or a scoped allowance there.
- `shortcutsFlows.test.ts` containment test (`knownFolder(desktop)` resolves under the real home) fails on the Windows
  host, as the Windows-local baseline note records; CI is ubuntu and passes it.
