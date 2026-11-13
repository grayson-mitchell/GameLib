---
phase: quick-261114-at7
plan: 01
status: complete
completed: 2026-11-14
commits: [9c092bf21, 8e26a1406]
requirements: [TODO-2026-11-13-bridge-update-hero-planning-label, WR-07, UAT-74-6b]
---

# Quick 261114-at7: Planning label on the hero during bridge updates

The Downloads hero now shows "Planning update..." for the whole pre-transfer stretch of a bridge update and drops to the plain updating state (transfer stats) when the Rust job reports `planned`.

## Root cause (confirmed from source)

- UAT 6b's missing label: `378aa80b1` (2026-11-13 19:28, "admit the delta stage event in the depotJobEvent schema") postdates UAT items 5/6. Before it, every `stage` event was rejected by the IPC schema, so neither stage label could show. Already fixed.
- WR-07 (still real): no `sendGameStatusUpdate` exists on the bridge update path between the download manager's plain `updating` and `runDepotJob` (grepped `updateBridge.ts`, `depotRust/install.ts`, `depotRust/updateEstimate.ts`, `games.ts`: only the `clearStatus` in updateBridge.ts). And `progressBridge` `planned` only recorded `totalBytes`, so nothing cleared the planning context after the schema fix.

## Changes

- `depotRust/progressBridge.ts`: `createProgressBridge` takes a trailing `opts: { update?: boolean }`; on `planned` in update mode it sends `{appName, runner, status: 'updating'}` with no `context`. Keyed on update mode, not on having seen a planning stage, so the stale-journal fallback (planned without stage) still clears.
- `depotRust/install.ts`: `downloadSteamDepotsRust` passes `{ update: opts.delta !== undefined }`. The shared-redist caller is untouched.
- `updateBridge.ts`: `runBridgeUpdate` sends `updating` + `steam-update-planning` before the estimate (also covers the cached-estimate path). Not added to the join path.
- Tests: new `progressBridge update mode (WR-07)` describe (4 cases) and `planning status (WR-07)` describe in updateBridge.test.ts (4 cases: ordering before estimate and job, cached estimate, refuse-running, branch-unresolved).

## Verification

- jest (depotRust, updateBridge, updateDispatch, heroModel): 9 suites, 130 tests pass.
- eslint: 0 errors (5 pre-existing i18next warnings). Scoped prettier clean on the five files.
- `pnpm build:sidecar` done (build/main/sidecar.js 07:51).
- Not run: whole-repo `tsc --noEmit` beyond a grep of touched files (no errors reported for them).

## Checked live: PENDING HUMAN VERIFICATION

During a bridge update with a non-trivial delta (stale fixture per 74-UAT item 18 precondition), run `pnpm tauri:dev` after `pnpm build:sidecar` and watch Downloads from the moment Update is confirmed: "Planning update..." (indeterminate bar) until transfer starts, then percent/bytes/ETA, then "Applying update...". The todo stays in `pending/`.

## Deviations from Plan

None. Note: eslint must be run from the repo root (import resolver fails from a subdirectory). Pre-existing dirty files (humble, locales, rustDepot/rustInstall tests, etc.) were left unstaged.
