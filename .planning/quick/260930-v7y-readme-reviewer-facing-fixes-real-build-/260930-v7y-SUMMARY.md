---
phase: quick-260930-v7y
plan: 01
subsystem: docs
tags: [readme, signpath, tauri, build-instructions, weblate]
status: complete
requirements: [QUICK-260930-V7Y]
key-files:
  created:
    - .planning/quick/260930-v7y-readme-reviewer-facing-fixes-real-build-/readme-anchor-check.cjs
    - .planning/quick/260930-v7y-readme-reviewer-facing-fixes-real-build-/readme-pnpm-script-check.cjs
  modified:
    - README.md
    - .planning/todos/pending/2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md
commits: 4
plan_head_before: c07f885f85b137d6c92ffe2ba81c25b732ea009b
plan_head_after: 8e5c7f093d06160b2a25b952b1551f628f2dc516
actuals:
  tokens: 20000
  tasks: 3
  commits: 4
---

# Phase quick-260930-v7y Plan 01: README reviewer-facing fixes Summary

README.md now documents the build sequence the Tauri release workflow runs, drops the nonexistent
per-OS packaging and dev scripts, and no longer presents Heroic's Weblate project, sponsor text,
chat server or screenshots as GameLib's. Two mechanical checks (anchors, pnpm script names) went RED
on the old README and are GREEN on the new one.

## Commits

| Task | Commit      | Message                                                                                      |
| ---- | ----------- | -------------------------------------------------------------------------------------------- |
| 1    | `a51638a56` | test(quick-260930-v7y): add README anchor and pnpm-script checks                             |
| 1    | `03cd5870b` | test(quick-260930-v7y): stop pnpm check swallowing the next line's command (fix, see below)  |
| 2    | `a85c447d7` | docs(quick-260930-v7y): README build path for Tauri, drop Heroic-owned links, ...            |
| 3    | `8e5c7f093` | docs(quick-260930-v7y): record README residuals closed and screenshot follow-up in ... todo  |

`commits: 4` is measured from `git rev-list --count c07f885f8..HEAD`. SUMMARY.md, STATE.md and
PLAN.md are uncommitted by design (orchestrator).

## Verification results

TASK1-OK, TASK2-OK and TASK3-OK all printed. `pnpm planning-gates` printed `12/12 planning gates
passed.` `git diff --stat c07f885f8 -- . ':!.planning'` lists README.md only (68 insertions, 73
deletions). `npx prettier --file-info README.md` reported not ignored, and
`npx prettier --check README.md` passed after one `--write`. I read `git diff` afterwards: lines 1-24
and the Code signing policy through Privacy region are untouched (Task 2's `diff` gate also passed).

### RED: checks against the README at c07f885f8

Anchor check (exit 1):

```
OK #gamelib
OK #index
OK #features-available-right-now
OK #planned-features
OK #supported-operating-systems
OK #language-support
OK #help-with-translations-here
OK #installation
OK #prerequisites
OK #linux
OK #windows--macos
OK #code-signing-policy
OK #privacy
OK #development-environment
OK #building-gamelib-binaries
OK #building-with-vs-code
OK #quickly-testingdebugging-gamelib-on-your-own-system
DEAD #testing-with-docker
OK #development-on-nix
OK #sponsors
OK #screenshots
OK #credits
DEAD #heroic-games-launcher
headings=24 links=23 dead=2
```

pnpm-script check (exit 1), run after the fix described under Deviations:

```
OK install (builtin)
OK download-helper-binaries
MISSING dist:linux
MISSING start
MISSING dist:win
MISSING dist:mac
checked=6 missing=4
```

### GREEN: checks against the new README (both exit 0)

```
OK #gamelib
OK #index
OK #features-available-right-now
OK #planned-features
OK #supported-operating-systems
OK #language-support
OK #installation
OK #prerequisites
OK #linux
OK #windows--macos
OK #code-signing-policy
OK #privacy
OK #development-environment
OK #building-gamelib-binaries
OK #quickly-testingdebugging-gamelib-on-your-own-system
OK #development-on-nix
OK #credits
headings=20 links=17 dead=0
```

```
OK build-steam-bridge
OK install (builtin)
OK download-helper-binaries
OK exec (builtin)
OK build:sidecar-sea
OK tauri:dev
OK tauri:dev:keyring
checked=7 missing=0
```

(The Task 2 gate's own run of the pnpm check, made before the fix below, printed `checked=6` and
omitted `download-helper-binaries`; the run above is the corrected one.)

### Other probes

- `pnpm exec tauri build --help` lists `-c, --config <CONFIG>` (help only, nothing built).
- `curl -s -o /dev/null -w '%{http_code}' -L https://v2.tauri.app/start/prerequisites/` returned
  `200`, so the README links it.

## Build sequence is workflow-derived, not measured

The documented sequence comes from `.github/workflows/release-tauri.yml`. It was NOT run locally:
no `vite build`, `build:sidecar-sea` or `tauri build` was executed, and the app and sidecar were not
launched. The `appimage/` bundle subdirectory follows Tauri's bundler convention and has no in-repo
reference (the in-repo evidence covers `src-tauri/target/<profile>/bundle/nsis/` and the AppImage
file name `GameLib_0.7.0_amd64.AppImage` only).

## Machine-translation claim (orchestrator condition)

I verified it, so the README states it. Evidence: `ls public/locales/*/gamelib.mt.json | wc -l`
returns 48 (49 locale directories including English); `public/locales/de/gamelib.mt.json` records
`"model": "claude-sonnet-5"` and a `filledAt` timestamp; `meta/machineFillGamelib.ts` is the
glossary-aware machine-fill script and states English is the source of truth. The README says text
GameLib adds is "written in English and machine-translated into the other languages" and
that GameLib has no Weblate project of its own. Every README line containing the Weblate host also
names Heroic.

## Deviations from Plan

**1. [Rule 1 - Bug] pnpm check swallowed the following command**
- **Found during:** Task 2 (green run listed 6 names with `download-helper-binaries` missing)
- **Issue:** the optional second-word group in `readme-pnpm-script-check.cjs` used `\s+`, so after
  `pnpm install` it consumed the next line's `pnpm` as the second word and hid that command from the
  check. The Task 1 RED run still printed `OK download-helper-binaries` only because an inline span
  elsewhere caught it.
- **Fix:** second word is captured only on the same line (`[ \t]+`). Re-ran Task 1's verify
  (TASK1-OK) and the README check.
- **Files modified:** `readme-pnpm-script-check.cjs`
- **Commit:** `03cd5870b`

No other deviations. Commits landed on `main` (no worktree, as the orchestrator specified). Commit
trailer is `Co-Authored-By: Claude Opus 5.5` as instructed.

## Operator follow-up

- Take GameLib screenshots from a live run and re-add a Screenshots section with images hosted in
  the GameLib repo. README has none until then (recorded in the Windows signing todo).

## Uncertain README claims left in place

- Distro list (Ubuntu latest 2 LTS, Fedora latest 2, Arch and derivatives): not verifiable from the
  repo.
- "macOS 14 or newer": no `minimumSystemVersion` is set in any tauri conf.
- "Access to Epic, GOG and Amazon Games stores directly from GameLib": Amazon has a store manager
  (`src/backend/storeManagers/nile`) but store browsing for Amazon was not confirmed.
- Language list: 39 entries listed, while `public/locales/` has 48 non-English locale directories.
  The list was left unchanged as instructed; the lead sentence still says "almost 40".
- Tools We Use entries: no entry had zero hits on a tool-name search of `src/`, `meta/`, `src-tauri/`
  and `.github/`. By exact repo path, `derrod/legendary` (only the Heroic fork is referenced),
  `Open-Wine-Components/umu-launcher` (source uses `umu-run`) and `Gcenx/winecx` (source uses other
  spellings) had no path hit but do have tool-name hits. Nothing removed.
- Humble Bundle and ZOOM Platform support exist in source (`src/backend/storeManagers/zoom`, Humble
  code in `src/backend/config.ts` and `cache.ts`) but the Features list and store list do not
  mention them. Not added.
- Whether a local Windows build needs standalone pnpm is unmeasured (CI installs it, see below).
- The Nix paragraph says `shell.nix` predates the Tauri move; date 2025-07-14 confirmed by
  `git log -1 --format=%cs -- shell.nix`.

## Out-of-scope findings (not edited)

- `.vscode/tasks.json`: "Build for Linux/Windows/MacOS" run the nonexistent `dist:*` scripts.
- `.vscode/launch.json` and `package.json` `debug:react`: both run the nonexistent `start` script.
- `src/backend/constants/urls.ts`: Heroic's chat server, Weblate, sponsors page and wiki URLs are
  still the in-app links.
- `.github/actions/install-deps/action.yml`: still installs standalone pnpm on Windows non-ARM
  (`standalone: ${{ runner.os == 'Windows' && runner.arch != 'ARM64' }}`) and does
  `pnpm add --global node-gyp`. Whether a local build needs either is unmeasured.
- `shell.nix` is still Electron-era (Chromium runtime libs, `heroic-fhs-dev` name, no Rust/webkitgtk).

## Known Stubs

None.

## Threat Flags

None. No new network, auth or file-access surface; the only network action was one status probe of
the Tauri docs URL.

## Self-Check: PASSED

- Files found: both check scripts, README.md, the todo.
- Commits found: `a51638a56`, `03cd5870b`, `a85c447d7`, `8e5c7f093`.
