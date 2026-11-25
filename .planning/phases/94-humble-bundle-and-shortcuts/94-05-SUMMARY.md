---
phase: 94-humble-bundle-and-shortcuts
plan: 05
subsystem: testing
tags: [oracle, golden, shortcuts, sanitize-filename, hostile-names, fake-home, d-14, d-23]
status: complete

requires:
  - phase: 94-humble-bundle-and-shortcuts
    provides: 94-02 gamelib-shortcuts crate skeleton and the prettier-ignore for its fixtures
provides:
  - src/backend/testUtils/shortcutsOracle/harness.ts (profile, platform mock, placeholders, requested-mode recording, tree reader, write/compare goldens, MANIFEST floors, deltas)
  - 346 byte-exact goldens recorded from the TypeScript under gamelib-shortcuts/tests/fixtures/golden/{text,sanitize,paths,exists}
  - src/backend/__tests__/shortcutsFixtureRedaction.test.ts
affects: [94-06, 94-07, 94-08, shortcut Rust writer plans]

requirements-completed: []

actuals:
  tokens: 103000
  tasks: 2
  commits: 2

plan_head_before: 238c02a751da2a12ee1494afed06c2438eb7b76a
plan_head_after: b76fcdbe01c66b4801bc7b15cc5c30a0a6696981

tech-stack:
  added: []
  patterns:
    - "goldens are host independent: separators normalised on path fields only, and the file mode recorded is the one REQUESTED (writeFile mode option, chmodSync) rather than read back from a disk that may be NTFS"
    - "the exists oracle drives the real registered shortcutsExists channel, and a Windows registry Desktop is a synthetic path answered by a call-through existsSync spy so nothing is created outside the profile"
    - "golden case ids are checked for case-insensitive collisions (Windows and default macOS fold two such files into one)"

key-files:
  created:
    - src/backend/testUtils/shortcutsOracle/harness.ts
    - src/backend/testUtils/shortcutsOracle/__tests__/harness.test.ts
    - src/backend/shortcuts/__tests__/oracle/hostileNames.ts
    - src/backend/shortcuts/__tests__/oracle/text.oracle.test.ts
    - src/backend/shortcuts/__tests__/oracle/pathsExists.oracle.test.ts
    - src/backend/__tests__/shortcutsFixtureRedaction.test.ts
    - src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/text (132 cases + MANIFEST.json)
    - src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/sanitize (72 cases + MANIFEST.json)
    - src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/paths (84 cases + MANIFEST.json)
    - src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/exists (58 cases + MANIFEST.json)
    - .planning/todos/pending/2026-11-24-macos-shortcut-run-sh-breaks-on-single-quote-in-app-name.md
  modified:
    - .gitattributes

key-decisions:
  - "Goldens record the mode the TS REQUESTED (0777 for the Desktop .desktop, 0755 for run.sh, null for every plain write), not the on-disk mode: a Windows host reports 0666 and a POSIX host applies the umask, so reading back would make the goldens host dependent."
  - "The macOS and Linux arms' paths are made portable with a backslash-to-slash step applied to path fields only, never to file contents (a backslash can be part of a title), and the Windows arm's strings are recorded as the template builds them."
  - "The registry Desktop for the win32 cases is the synthetic Z:\\GameLibOracle\\Desktop; the Desktop .lnk 'on disk' is answered by an existsSync spy, because a rooted Windows path is a relative file name on a POSIX host and a real drive on this one."
  - "The harness is a sibling of engineWineOracle, not an extension of it: 87 is still editing that one, and the shortcut slices differ (JSON per case, no recorder, requested modes)."

patterns-established:
  - "hostile name set (21 titles with app names, 5 runners, 7 hostile runner strings, 52 sanitize vectors) lives in one input-only module"

requirements: [SVC-05]
duration: 90min
completed: 2026-11-24
---

# Phase 94 Plan 05: Shortcut oracle harness and byte-exact goldens Summary

**Shortcut text, sanitize-filename, path and exists behaviour recorded from the TypeScript on fake HOME profiles with hostile names (346 goldens across four slices), before any shortcut Rust exists.**

## What was built

- **Harness** (`harness.ts`): `withShortcutsOracleProfile` (fresh `createFakeHomeProfile()` per case, disposed after), `mockPlatform` (`process.platform` plus the environment flags, via `jest.replaceProperty`), `normalisePaths` / `portablePath` / `expandPlaceholders` over `<HOME> <APPDATA> <DESKTOP> <ICONS> <SHELL_EXE> <CWD>`, `recordRequestedModes`, `readTree`, `writeOrCompareGolden` (`GAMELIB_WRITE_SHORTCUTS_GOLDEN=1` writes, default compares), `syncManifest` / `assertManifest` / `expectEmptyCasesToFail` (`{count, floor}` per slice), `recordDelta`, `createFakeImageTools` and `makePng`. 20 self-tests, including an empty case list failing the floor and a mutated golden failing the compare.
- **text** (132 cases, floor 40): the real `addShortcuts` on darwin and linux. Every one of 21 hostile titles on the default runner; all five runners over four of the names; seven hostile runner strings; the four setting variants (desktop only, menu only, neither, fromMenu); and the with-icon variant (a pre-made `<ICONS>/<appName>.jpg`, so no network) for every icon-safe name plus gog and steam. Per case it records `run.sh` and `Info.plist` bytes, the `.desktop` bytes, the Desktop symlink target and the requested modes. The macOS `.icns` is recorded as present but opaque (94-07 owns its geometry); `Info.plist` shows the `CFBundleIconFile` pair.
- **sanitize** (72, floor 30): the `sanitize-filename` package run over 51 vectors (reserved names in both cases and with extensions, trailing dots and spaces, C0/C1 controls, every illegal character, `.` and `..`, empty, over-255-byte ASCII and 3-byte UTF-8, a surrogate pair split at the 255 boundary, lone surrogates) plus every hostile title, with UTF-16 code units and UTF-8 byte counts.
- **paths** (84, floor 30): `shortcutFiles` for every hostile title on darwin, linux, win32 with a registry Desktop and win32 without (the golden has `desktop: null`).
- **exists** (58, floor 12): the real registered `shortcutsExists` handler over the disk matrix (none, Desktop only, menu only, both; on macOS a symlink to the bundle, a dangling Desktop symlink and a legacy real bundle; on Linux a symlink and a dangling one; on Windows with and without a registry Desktop, where the no-registry decoy file must not count), plus hostile titles, an empty title and a missing title (`{}` from `getGameInfo`). `macDesktopShortcutPresent` and `macDesktopShortcutWanted` are recorded alongside.
- **Redaction scan**: `shortcutsFixtureRedaction.test.ts` walks the crate fixtures (floor 350 files), fails on a real home path (`/Users/<name>`, `/home/<name>`, `C:\Users\<name>`) or an Authorization or Bearer value, with planted negatives. It imports no slice module.

## Findings worth carrying forward

1. **A real quoting defect in the TS the goldens now pin.** `encodeURIComponent` does not escape `'`, so the macOS `run.sh` for an app name or runner containing an apostrophe closes its single quotes early (`darwin-single-quote-legendary`, `darwin-plain-r-quotes`). It is not an injection as measured (`$`, backtick, `;`, `&`, `|`, space are all encoded) but the launch breaks, and the T-34.5-C6-17 comment claims otherwise. The Linux `.desktop` arm writes `app_name` and `runner` into `Exec=` with no encoding at all. A todo was filed (`ready: code`); the Rust writer plan decides between reproducing the bytes and fixing both, recording the choice with `recordDelta`.
2. **The acceptance wording "literal `$(touch pwned)` inside a single-quoted, percent-encoded URL in run.sh" cannot hold as written.** `encodeURIComponent` turns `$` into `%24`, so run.sh holds `appName=%24(touch%20pwned)`. The literal `$(touch pwned)` is in every golden's `input` and in the Linux `.desktop` `Name=` and `Exec=` lines. The golden is what the TS wrote; nothing was typed by hand.
3. Goldens were recorded on a Windows host. They compare equal here; the ubuntu compare is unproven until CI runs, but the host-dependent inputs (separators, modes) were removed by construction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Case ids that differ only by case collided on a case-insensitive disk**
- **Found during:** Task 2 (compare run failed: `v-reserved-con` and `v-reserved-CON` were one file on NTFS)
- **Issue:** two goldens would fold into one on Windows and default macOS, silently dropping a case
- **Fix:** renamed the vector `v-reserved-upper-con`; `assertManifest` now fails on two ids equal ignoring case, with a self-test
- **Files modified:** hostileNames.ts, harness.ts, harness.test.ts
- **Commit:** b76fcdbe0

**2. [Rule 2 - Missing critical] Goldens had to be pinned byte-exact in git**
- **Issue:** `* text=auto eol=lf` would normalise recorded `run.sh` and `.desktop` text; this checkout has `core.autocrlf=true`
- **Fix:** `.gitattributes` gains `src-tauri/crates/gamelib-shortcuts/tests/fixtures/** -text` (the 75-02, 84-01 and 85-02 precedent). The recorded fixtures contain no CR byte (`grep -rlP '\r'` finds 0 files), so none is CRLF polluted.
- **Files modified:** .gitattributes
- **Commit:** 0ac72051c

**3. [Rule 3 - Blocking] Plan said to set `GAMELIB_SHELL_EXE`; the harness injects `paths.exe` instead**
- **Issue:** `AppPaths.exe` is a deps member, and the text cases build their own `deps.paths`; setting the process environment would leak across tests
- **Fix:** `paths.exe` is `<HOME>/shell-exe` in the profile, recorded as `<SHELL_EXE>`. Same bytes, no process-wide mutation.

**4. [Rule 3 - Blocking] Modes cannot be read back on this host**
- **Issue:** the plan's "mode 755 / 0o777" read from disk is 0666 on Windows and umask-masked on POSIX
- **Fix:** `recordRequestedModes` records the mode the TS asked for (details under key-decisions)

### Plan details not followed

- The precondition names branch `phase-94-humble-shortcuts`; the branch is `gsd/phase-94-humble-bundle-and-shortcuts` (the dispatch said so), already current with main.
- The `<verify>` runs `pnpm codecheck`; also run: eslint over the new files (clean), `pnpm find-deadcode` (PASS; one new finding, an exported-but-unused interface, was un-exported), `node meta/backendDiCeilings.cjs` (PASS, no new `jest.mock`; the harness uses `jest.spyOn` and `jest.replaceProperty` only), `fakeHomeIsolation.test.ts` (PASS), and the todo frontmatter gate (PASS).

## Verification

- `GAMELIB_WRITE_SHORTCUTS_GOLDEN=1` write run, then the default compare run over text, pathsExists, harness and redaction suites: 4 suites, 382 tests, green.
- MANIFEST counts: text 132 (floor 40), sanitize 72 (floor 30), paths 84 (floor 30), exists 58 (floor 12). Every acceptance count is met.
- `grep -rlE "/Users/[a-z]|/home/[a-z]"` over the crate fixtures: 0 files. Windows no-registry golden: `desktop: null`.
- `npx prettier --check` over the six TS files: clean (the golden JSON is prettier-ignored, per 94-02).
- Windows-only failures recorded: none introduced by this plan. `pnpm planning-gates` is 11/12; the failing gate is the 34.4.1 `seam-parity-sweep-gate.py`, red because of 94-04's new `src/backend/sidecar/loginSeamRegistration.ts` (see Deferred Issues). It is unrelated to this plan's files (the file it names is 94-04's and untouched here).

## Deferred Issues

- `.planning/milestones/v0.8-phases/34.4.1-.../seam-parity-sweep-gate.py` fails: `Axis A site src/backend/sidecar/loginSeamRegistration.ts:331 matched none of the mechanical tiers and has no SITE_PROFILES entry`. Introduced by 94-04's relocation (not this plan). Logged in `deferred-items.md` in this phase directory.

## Known Stubs

None.

## Threat Flags

None. The oracle spawns nothing, every case runs under a fresh `createFakeHomeProfile()` (T-94-08), and placeholder normalisation plus the redaction scan cover T-94-09.

## Self-Check: PASSED

- harness.ts, harness.test.ts, hostileNames.ts, text.oracle.test.ts, pathsExists.oracle.test.ts, shortcutsFixtureRedaction.test.ts: present
- golden/{text,sanitize,paths,exists}/MANIFEST.json: present, counts 132 / 72 / 84 / 58
- commits 0ac72051c and b76fcdbe0 present on gsd/phase-94-humble-bundle-and-shortcuts
