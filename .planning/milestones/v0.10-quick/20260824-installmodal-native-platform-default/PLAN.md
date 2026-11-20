---
quick_id: 260824-u8b
slug: installmodal-native-platform-default
date: 2026-08-24
description: Install modal preselects Windows for a Mac-native non-Steam title; also move the platform selector to the top of the dialog
status: planned
---

# Quick 260824-u8b — install modal: native platform default + selector position

## Problem (measured live, not inferred)

Installing the Epic title **Phoenix Point** (`legendary`, app_name `Iris`) on macOS launched:

```
legendary install Iris --platform Windows --base-path /Users/…/GameLib --skip-dlcs -y --skip-sdl
```

despite a real Mac build existing. Evidence:

- `store_cache/legendary_library.json` -> `Iris` has `is_mac_native: true`, `cloud_save_enabled: true`
- `legendary info Iris --platform Mac` returns a genuine Mac manifest: version `1.30.75117M`,
  22.58 GiB download / 37.34 GiB on disk (the Windows build is 18.32 / 32.30 GiB)
- `metadata/Iris.json` carries BOTH `CloudSaveFolder` and `CloudSaveFolder_MAC`

## Root cause

In `src/frontend/screens/Library/components/InstallModal/index.tsx`, availability and default are
derived from **two different signals**:

- **availability** (`platforms[]`, line ~234): `available: isMac && (isSideload || isMacNative)`
  where `isMacNative = Boolean(gameInfo?.is_mac_native)` (line 168) — TRUE for Iris, so the macOS
  option IS in the selector.
- **default** (line ~299): `getDefaultplatform(macOffered) = isMac && macOffered ? 'Mac' : 'Windows'`
  called with `macDepotOffered`, which `resolveDepotAvailability(...)` (line ~215) derives from
  **Steam depot** signals (`seedHasMacDepot` / `probeHasMacDepot` / `depotSignalCaptured`).

For a non-Steam title there is no depot signal, so `macDepotOffered` is false and Windows is
preselected even though the option list offers macOS. The two derivations disagree.

## Task 1 — default to the native build for non-Steam mac-native titles

Change the default derivation ONLY for the non-Steam case. Suggested shape (executor may choose an
equivalent one, but it must satisfy every constraint below):

```ts
const macNativeOffered = runner === 'steam' ? macDepotOffered : isMacNative
const getDefaultplatform = (macOffered: boolean): InstallPlatform =>
  isMac && macOffered ? 'Mac' : 'Windows'
```
…with the `useState` initializer and the re-derivation `useEffect` both reading the SAME resolved
value, exactly as they do today.

**Hard constraints — a regression here is worse than the bug:**

1. **Steam behaviour must not change at all.** For `runner === 'steam'` the default must remain
   exactly `isMac && macDepotOffered ? 'Mac' : 'Windows'`.
2. Keep the `depotSignalResolved` re-derivation `useEffect` and its `userChosePlatformRef.current`
   guard. An explicit user choice must still never be overwritten.
3. The initializer and the effect must not be able to disagree — that identity is the whole point
   of the existing 34.15 D-14 comment (the Terraria symptom it records).
4. Do not touch `resolveDepotAvailability`, `resolveSteamHeaderPlatforms`, `steamPlatformRow.ts`,
   `steamEligibilityProbe.ts`, or the `platforms[]` availability seed.
5. Linux: `isLinuxNative` has the same shape. Do NOT change Linux behaviour in this task — note it
   as out of scope in the summary if the executor believes it has the same defect.

**Update the 34.15 D-14 comment block in place.** It currently reads "do not misread it as an
argument for defaulting to Mac", which after this change would contradict the code. Rewrite it to
record the distinction that has been established: the Windows-is-the-unknown-case reasoning is
**Steam-specific** (mac-only Steam games are a null set; Windows-via-bottle always works; the depot
signal can be genuinely unresolved at open). For a non-Steam runner, `is_mac_native` is a direct
statement from the store's own library data, not an unknown — so preferring the native build is
correct there. Do not delete the existing reasoning; extend it.

## Task 2 — move the platform selector to the top of the dialog

`platformSelection()` (index.tsx line ~558) is passed as **children** to each dialog, so its screen
position is decided by where each dialog renders `{children}` — currently LAST:

| File | `{children}` line | `<DialogContent>` opens |
|---|---|---|
| `DownloadDialog/index.tsx` | 783 | 601 |
| `ImportDialog/index.tsx` | 108 | (see file) |
| `ThirdPartyDialog/index.tsx` | 132 | (see file) |
| `SteamDialog/index.tsx` | 473 | (see file) |

Move `{children}` to be the FIRST child of `<DialogContent>` in each of those four files.

Rationale to record in the summary: the platform choice **changes downstream fields**, so it must be
made before them — `ImportDialog`'s `pickFile = platformToInstall === 'Mac'` decides whether the path
picker opens in file or directory mode (a Mac `.app` bundle is INVISIBLE in directory mode, which is
what made the import fixture unreachable during the 34.6 live gate), and `hasWine =
platformToInstall === 'Windows' && !isWin` gates the entire Wine selector row.

`SideloadDialog` has no `{children}` and is out of scope.

Verify no CSS depends on `{children}` being last — grep `InstallModal` stylesheets for
`:last-child` / `+ ` sibling selectors before moving, and say what was found either way.

## Task 3 — tests

Add coverage to `src/frontend/screens/Library/components/InstallModal/__tests__/` (a new file is
fine; `installModalSource.test.ts` is the closest existing analog and already references
`platformToInstall`/`macDepotOffered`).

Required assertions:
1. non-Steam runner + `is_mac_native: true` + macOS host -> default `'Mac'`
2. non-Steam runner + `is_mac_native: false` + macOS host -> default `'Windows'`
3. **`runner === 'steam'` + `macDepotOffered: false` + `is_mac_native: true` -> default
   `'Windows'`** (the anti-regression assertion — this is the one that proves Steam is untouched;
   it MUST fail if Task 1 is implemented naively by keying on `isMacNative` for all runners)
4. non-macOS host -> default `'Windows'` regardless
5. `{children}` is the first child of `<DialogContent>` in each of the four dialog files (a source
   assertion is acceptable and matches this directory's existing `installModalSource.test.ts`
   convention)

**RED-prove assertion 3 specifically**: show it failing against a deliberately naive implementation
before shipping the real one. Report the RED output.

## Verification

- `pnpm jest --selectProjects Frontend <the touched test files>` — note `displayName`s are
  CASE-SENSITIVE (`Frontend`, not `frontend`); a wrong case matches nothing and exits 0.
- `pnpm codecheck` (tsc) for the touched files. Note it says NOTHING about CI lint.
- Do NOT run `electron-vite build`, `pnpm tauri:dev`, or anything that rewrites `build/`.

## Build safety (live gate in progress)

The running app serves `frontendDist: ../build`, a STATIC bundle built 11:51 from commit
`c13b9e398`; `devUrl` is null so there is no Vite HMR and source edits cannot leak into it. Do not
restart or kill PIDs 21590 / 21682 / 21802, and do not kill any running `legendary` process.

## Shared tree

`git status --porcelain` before every commit; `git commit --only <exact paths>`. NEVER `git add -A`,
`git add .`, `git commit -a`, bare `git commit`, `git stash`, `git reset --hard`,
`git checkout -- <file>`, `git clean`. Touch ONLY files under
`src/frontend/screens/Library/components/InstallModal/`. Every other path under
`src/frontend/screens/Library/**` belongs to a concurrent session. Never invoke
`gsd-sdk query state.*` or `roadmap.update-plan-progress`.
