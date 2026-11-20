---
task: 260822-tv4
title: "Give the About window a user-reachable entry point under Tauri"
status: complete
date: 2026-08-22
branch: wt/smallstuff
resolves_todo: .planning/todos/completed/2026-08-22-about-window-is-unreachable-under-tauri.md
reopens_uat: "34.1-VERIFICATION.md item 8b (About window)"
files_modified:
  - src/frontend/components/UI/NavShell/components/SettingsPanel/index.tsx
  - src/frontend/components/UI/NavShell/__tests__/SettingsPanel.test.tsx
  - src/frontend/components/UI/NavShell/__tests__/destinationCoverage.test.tsx
  - public/locales/en/gamelib.json
  - .planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-VERIFICATION.md
---

## What changed

An **About** row now sits in the Settings tier-2 nav panel, between Documentation and Ko-fi,
calling `window.api.showAboutWindow()`. That is the whole change — `tauriShowAboutWindow` itself
was already complete and is not touched.

Before this, the only caller of `showAboutWindow` anywhere in the tree was
`src/backend/tray_icon/tray_icon.ts:124` — the **Electron** tray menu, which Tauri does not run.
A fully-implemented window with a version race, single-instance refocus, and its own static
`public/about.html` had no way to be opened.

## Deviation from the todo: nav panel, not tray

The todo proposed the tray, matching where Electron put it. Three reasons it went elsewhere:

1. **The Rust tray cannot call the code the todo wanted to make reachable.**
   `tauriShowAboutWindow` is preload/renderer code. A Rust tray item would either duplicate the
   `WebviewWindow` construction in `main.rs` — leaving `tauriShowAboutWindow` still dead, so the
   defect would survive its own fix — or need Rust→frontend event plumbing that does not exist.
2. **Phase 34.1 declared the tray About item out of scope in writing** (`main.rs:18`, `:5856`).
   That is a phase decision, not a quick-task one.
3. **The nav row is strictly more reachable** — three platforms, primary window, both shells, via
   the `isTauri()` switch already at `helpers.ts:17`. No new routing.

### One assumption I checked and it was wrong

`main.rs:1192` warns that the `REQ-34.1-07` gate "scans the WHOLE stripped file for that
capitalized word", in a doc comment that is conspicuously avoiding naming a trait. I initially
read that as *`About` is banned in `main.rs`*, which would have made the tray route impossible
rather than merely expensive. Reading the gate itself
(`tauriShellSource.test.ts:350`) shows it bans `recent`, `dock`, `Reload`, `Debug`,
`openDevTools` — the avoided word is **`Debug`** (the derive), not `About`. The gate was never
the obstacle. Reasons 1 and 2 stand on their own; recording this so nobody inherits the wrong
constraint. (This is the [[planner-can-invent-a-false-constraint]] shape, caught by reading the
gate instead of the comment about the gate.)

## Label: a new key, not the translated one

`tray.about` already exists and is translated in all 48 locales — tempting, and wrong. Several of
those translations carry the pre-fork brand name: `de` is `"Über Heroic"`, `ja` is
`"Heroicについて"`. Reusing it would ship "Über Heroic" into a brand-new GameLib surface. Minted
`gamelib:about.navLabel` in the fork-owned namespace instead, via the mandatory
`const { t: tGamelib } = useTranslation('gamelib')` alias (the `i18next-parser` lexer is
configured `functions: ['t', 'tGamelib']`; any other alias is invisible to it). `tray.about` is
left untouched for the Electron tray.

`pnpm i18n` was NOT run — `keepRemoved: false` is still live in this tree. The key was hand-added;
`git diff --stat` on the catalog shows `3 +++`, not a whole-file rewrite.

## The new test is RED-proven

Both suites that pin the destination set assert by **exact array equality**, so both were updated
in step (not loosened to `toContain` — the exact shape is what catches an invented or missing
destination).

The new click test was then mutated against: `onClick` was temporarily changed to `() => undefined`
and the suite re-run.

```
● SettingsPanel › About is a button whose onClick calls window.api.showAboutWindow
  expect(jest.fn()).toHaveBeenCalled()
  Expected number of calls: >= 1
  Received number of calls:    0
```

**The label-list test passed against that same no-op.** A row that renders and does nothing is
exactly the state this todo was written about, and only the click test can see it. Mutation
reverted; both suites green.

## Verification

| Check | Result |
| --- | --- |
| `npx jest src/frontend/components/UI/NavShell/__tests__/` (whole dir, not just touched files) | 24 suites / 338 tests pass |
| `npx jest src/backend/__tests__/tauriShellSource.test.ts` (34.1 tray scope gate) | 105 pass — `main.rs` untouched, measured not assumed |
| `pnpm codecheck` (tsc) | clean |
| `npx eslint` on the 3 touched source files, counting `severity === 2` only | 0 errors, 0 warnings |
| `npx prettier --check` on touched files, in place | clean |
| `meta/__tests__/hardcodedStringGate.test.ts` (the BLOCKING i18n gate) | 128 pass; zero violations, allowlist unchanged, scope not stale |
| `gsd-sdk query audit-uat` | 34.1 reports exactly **1** open item, named — a real list entry, not a prose scrape |

## Pre-existing failure, NOT caused by this change

`meta/__tests__/genI18nGateScope.test.ts` fails: the committed `meta/i18nGateScope.json` lists 11
files a fresh snapshot no longer produces (`DialogHandler/index.tsx`, `SliderField/index.tsx`,
`SyncSaves/gog.tsx`, …). **None of the 11 is a file this task touched.**

Proved pre-existing rather than argued: that test derives its fresh snapshot from
`git diff --name-status <baseCommit> HEAD -- src/frontend` (`genI18nGateScope.test.ts:306-318`) —
**committed history only**. Uncommitted working-tree edits cannot move it in either direction.

**Deliberately not fixed here.** The repair is `pnpm gen-i18n-gate-scope`, and regenerating that
artifact breaks the pins that guard it (a known 1-failure→5-failure trap in this repo). It is
unrelated drift and wants its own task.

## Follow-on state

`34.1-VERIFICATION.md` item 8b moved out of `human_verification_resolved` and back into
`human_verification`; `status:` flipped `passed` → `human_needed` to match, since an empty array
plus `human_needed` makes `audit-uat` scrape prose and the array is no longer empty.

The reopened item carries the caveat the todo raised, **in the item text**: `pnpm tauri:dev`
CANNOT falsify the `0.0.0` version-string mode (dev runs a plain bundled `sidecar.js` with
`npm_package_version` set), so a dev-run observation is valid for "the window opens" and
"clicking twice refocuses", and VACUOUS for the version string. Only a packaged build
discriminates. Expected string: `0.7.0`.

**Item 8b is open and runnable, not passed.** Nobody has yet watched the About window open under
Tauri.
