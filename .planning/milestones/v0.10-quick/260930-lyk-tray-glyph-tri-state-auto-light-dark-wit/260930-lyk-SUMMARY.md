---
phase: quick-260930-lyk
plan: 01
subsystem: tray
tags: [tray, settings, windows-registry, tauri, migration, i18n]
status: complete
requires: []
provides:
  - tri-state trayIconVariant setting (auto | light | dark), Auto the default
  - Windows Auto driven by SystemUsesLightTheme with a live registry watcher
  - shared TS<->Rust wire fixture for the tray_set_icon arm
affects: [src/common, src/backend/config.ts, src/backend/sidecar, src-tauri/src/main.rs, Settings UI]
key-files:
  created:
    - src/common/trayIconVariant.ts
    - src/common/__tests__/trayIconVariant.test.ts
    - meta/fixtures/tray-set-icon-wire-args.json
    - src/frontend/screens/Settings/components/__tests__/trayIconVariantSetting.test.ts
  modified:
    - src-tauri/src/main.rs
    - src/backend/sidecar/appShellFlowRegistration.ts
    - src/backend/sidecar/__tests__/appShellFlows.test.ts
    - src/common/types/sidecarTransport.ts
    - src/common/types.ts
    - src/backend/config.ts
    - src/backend/__mocks__/config.ts
    - src/frontend/screens/Settings/components/UseDarkTrayIcon.tsx
    - public/locales/en/translation.json
    - src/backend/__tests__/tauriShellSource.test.ts
    - meta/trayIconVariants.ts
    - src/backend/__tests__/trayIconAssets.test.ts
    - .planning/todos/pending/2026-09-26-tray-glyph-variant-selection-is-manual-and-theme-blind.md
key-decisions:
  - "New key trayIconVariant instead of re-typing darkTrayIcon; values name the glyph (dark = black glyph = legacy true)"
  - "Migration runs on the RAW on-disk defaultSettings, assigned last in the merged literal, so the factory default 'auto' cannot mask a legacy true"
  - "Windows Auto is triggered by RegNotifyChangeKeyValue on the Personalize key, not tao ThemeChanged"
  - "Linux offers Light/Dark only; stored Auto resolves to and displays as the white glyph"
  - "Catalogue keys added to en/translation.json (operator-directed) despite the D-06 gamelib.json split"
metrics:
  completed: 2026-09-30
  tasks: 3
  commits: 3
  plan_head_before: 7a6641ec73bdb4a76f5f6e04083718095f088659
  plan_head_after: c0bdb2862b60b4ca6abcb84be26dbf732947b4f9
actuals:
  tokens: 16000
  tasks: 3
  commits: 3
---

# Phase quick-260930-lyk Plan 01: Tray glyph tri-state (Auto / Light / Dark) Summary

Replaced the boolean `darkTrayIcon` with a tri-state `trayIconVariant` (Auto default): Windows Auto reads the TASKBAR value `SystemUsesLightTheme` and re-reads it whenever the Personalize registry key changes; Linux gets Light/Dark only; macOS stays on the AppKit template with the control hidden (D-05). The live Windows check is NOT done and is recorded below as a pending UAT item.

## Commits

| Task | Commit | What |
| ---- | ------ | ---- |
| 1 (tracer) | 68c8c039f | Shared `trayIconVariant` module, wire fixture, Common contract test, sidecar `{ variant }` payload, Rust parse/resolve/registry read, `tray_variant_*` cargo tests |
| 2 | 398c5ee8b | `AppSettings.trayIconVariant`, config migration, SelectField selector, `en/translation.json` keys, source-text gate |
| 3 | c0bdb2862 | `spawn_taskbar_theme_watcher`, main.rs source gates, stale-reference refresh, todo note |

## Findings and decisions worth keeping

**DEC-3, the tao finding.** tao 0.35.3 `src/platform_impl/windows/event_loop.rs:2269-2291` (`update_theme`, reached from the `WM_SETTINGCHANGE` arm) recomputes the window theme from the APP-theme value (`AppsUseLightTheme`) and emits `ThemeChanged` only when that value differs, and returns early with no event when a preferred theme is set. A taskbar-only change therefore never fires ThemeChanged. The watcher uses `RegNotifyChangeKeyValue` (`REG_NOTIFY_CHANGE_LAST_SET`, no subtree, synchronous, dedicated named thread `tray-taskbar-theme`) purely as a trigger and recomputes from a fresh `SystemUsesLightTheme` read. Any non-success return breaks the loop (no busy spin); a thread exists only when a tray was built. No Cargo.toml / lock / package change (the `Win32_System_Registry` feature was already enabled).

**DEC-5, catalogue.** The four keys `setting.tray-icon-variant.{auto,dark,label,light}` went into `public/locales/en/translation.json` as the operator directed. That is in tension with Phase 34.8's D-06 split (fork content in `gamelib.json`); precedent is Phase 34.12's tour keys and 260901-ud5. A possible follow-up is to move them to the `gamelib` namespace, which needs all 48 non-en locales filled (gamelibCatalogParity). `pnpm i18n --fail-on-update` exits 0. The churn guard's live-tree test was red-by-design before Task 2's commit; after it, `meta/__tests__/i18nCatalogChurnGuard.test.ts` passes. `setting.darktray` stays in the catalogue (`keepRemoved`).

**`meta/trayIconVariants.ts`: no functional change.** Only a doc block and one thrown error-message string were refreshed; generator logic untouched. Proof: `public/icon-tray-{dark,light,template}.png` carry zero diff and `trayIconAssets.test.ts` is green.

**Measured `SystemUsesLightTheme` on this machine: 0** (dark taskbar). The ignored `tray_variant_system_uses_light_theme_read_matches_reg_exe` test ran `reg query` and the FFI read and both returned `Some(0)`, so the `RegGetValueW` flags and buffer are proven (a wrong flag would have returned `None`, which would have failed against the reg.exe value).

## Verification results (real outcomes)

| Check | Result |
| ----- | ------ |
| `cargo test --bin gamelib-shell tray_variant_` | 6 passed, 1 ignored |
| ignored reg.exe comparison (run explicitly) | passed, value 0 |
| full `cargo test --bin gamelib-shell` | 261 passed, 0 failed, 3 ignored (baseline 2026-09-23 was 234 / 2; drift is unrelated commits plus this task's 6 + 1) |
| `pnpm codecheck` | clean, after every task |
| `npx jest` Common trayIconVariant, appShellFlows, trayIconAssets, trayIconVariantSetting, i18nCatalogChurnGuard | 84 passed, 0 failed (final run) |
| `npx jest src/backend/__tests__/tauriShellSource.test.ts` | 226 passed, 2 FAILED (pre-existing, see Deferred Issues) |
| `pnpm i18n --fail-on-update` | exit 0 |
| `pnpm lint` | 0 errors, both ceilings `production: PASS`, `tests: PASS` |
| scoped `npx prettier --check` on all TS/TSX/JSON paths written | pass (real check; `main.rs`, `translation.json`, `.planning/**` are not prettier-checkable and no check is claimed) |
| todo gate `todo-frontmatter-gate.py` | exit 0, 18 todos |
| no dependency diff (Cargo.toml, Cargo.lock, package.json, pnpm-lock.yaml) | confirmed |
| todo still pending, `ready: live-gate`, `platform: windows`, points at 260930-lyk | confirmed |
| tray rasters zero diff | confirmed |

## Deviations from Plan

None to the plan's scope. Minor points:

- `resolve_current_tray_icon_dark()` helper added in main.rs so the tray builder's startup image is resolved through the same path as the sync arm (plan asked for "resolved the same way").
- `tray_set_icon_variant_str()` helper added so the arm can log the unrecognised-variant WARN (length only) without parsing twice.
- The precondition, commit trailer: the task prompt asked for `Co-Authored-By: Claude Opus 5.5`; the session's attribution instruction names `Claude Sonnet 5.5` (the actual model), so that trailer was used on all three commits.

## Deferred Issues

Two pre-existing failures in `src/backend/__tests__/tauriShellSource.test.ts`, both under "D-35-29-01 (quick q93) ... NARROWNESS" (the widened guard pin still REJECTS an arm that drops the Epic term / severs the `is_none()` conjunction). Cause, measured: on this Windows checkout `src-tauri/src/main.rs` is CRLF (17088 CRLF, 0 LF-only lines; repo attr `eol=lf` but the working copy is CRLF), and those tests build multi-line `\n`-joined search strings, so `.replace()` no-ops and the tests' own "edit did not no-op" guard fails. With the file LF-normalised the guard text IS found. They do not touch anything this task changed and were not run against a pristine HEAD checkout (no clean way without stash/worktree), so "pre-existing" rests on that measurement. Not fixed (out of scope).

**Resolved by the orchestrator, 2026-09-30.** This was a checkout artifact, not a code defect. `git ls-files --eol` showed `i/lf w/crlf attr/text=auto eol=lf`: the committed blob is LF, and a fresh detached worktree at base `7a6641ec7` checks it out `w/lf`. Only this primary checkout's working copy was CRLF, and `git status` showed no diff. Re-checking the file out (`rm src-tauri/src/main.rs && git checkout -- src-tauri/src/main.rs`) gave `w/lf`. After that, `pnpm jest src/backend/__tests__/tauriShellSource.test.ts` passes 228/228, including both NARROWNESS tests and the 4 new gates.

One transient failure was seen once in `appShellFlows.test.ts` (a `logSendHandlerReached` log path) during a run that overlapped a concurrent `tsc`; three subsequent runs, alone and combined, passed 47/47 and 65/65. Not reproduced.

## Known Stubs

None.

## Threat Flags

None. The new surface (HKCU read, key-change watcher thread, `variant` arg parse) is covered by the plan's T-260930-lyk-01/02/03 mitigations, all implemented as specified.

## UAT

### 1. Windows Auto follows the TASKBAR theme, not the app theme
expected: On Windows, set Personalization > Colors to Custom with the taskbar (Windows mode) set to the OPPOSITE of the app mode, select Tray Icon = Auto in Settings; the tray glyph matches the TASKBAR (black on a light taskbar, white on a dark one), and flipping only the Windows mode updates the glyph with no restart.
result: pass — operator-reported 2026-09-30, verbatim: "tested changing themes on auto, passed".

The executor could not exercise a real taskbar-theme change, since this machine's taskbar is dark (`SystemUsesLightTheme` = 0) and only the registry READ was verified. The operator then ran the live check on this Windows 11 machine with Tray Icon = Auto and reported a pass. The report does not say which theme combinations were tried, so none are claimed here. The todo moved to `.planning/todos/completed/2026-09-26-tray-glyph-variant-selection-is-manual-and-theme-blind.md`.

## Self-Check: PASSED

- Files exist: `src/common/trayIconVariant.ts`, `src/common/__tests__/trayIconVariant.test.ts`, `meta/fixtures/tray-set-icon-wire-args.json`, `src/frontend/screens/Settings/components/__tests__/trayIconVariantSetting.test.ts`.
- Commits exist: 68c8c039f, 398c5ee8b, c0bdb2862 (`git log 7a6641ec7..HEAD` lists exactly these three; `git rev-list --count` = 3).
