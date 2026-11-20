---
type: quick
slug: fix-gog-macos-doubled-install-path
quick_id: 260830-k4m
created: 2026-08-30
autonomous: true
closes: [D-35-19-16]
found_by: live verification of the D-35-19-07 fix, 2026-08-30
files_modified:
  - src/backend/storeManagers/gog/library.ts
  - src/backend/storeManagers/gog/__tests__/library.test.ts
---

# Quick: GOG macOS move records a DOUBLED install path

A successful GOG move on macOS records `install_path` with the bundle name appended twice:

```
actual location : ~/GameLib/GameLibMoveTestFixture/Endless Sky.app   (7368 files, correct)
recorded path   : ~/GameLib/GameLibMoveTestFixture/Endless Sky.app/Endless Sky.app   (does not exist)
```

The move itself is correct — rsync's destination and the bytes on disk are right. Only the
RECORDED path is wrong, and a game whose recorded install path does not exist cannot launch.

Pre-existing upstream (`6689ac086b`, 2026-06-06), but **unreachable until D-35-19-07 was fixed**,
because the move never succeeded on macOS 15+ to begin with.

## Root cause: one function, two callers, two different contracts

`GOGLibraryManager.changeGameInstallPath(appName, newInstallPath)` is reached two ways:

| caller | what it passes | shape |
| --- | --- | --- |
| `gog/games.ts:794` `moveInstall` | `moveResult.installPath` | the **complete final** path — `moveOnUnix` already did `join(newInstallPath, basename(install_path))` |
| `gamedetails/dispatch.ts:230` `changeInstallPath` | the raw directory the user picked | on macOS necessarily the **parent** — a directory picker cannot select a `.app` bundle |

`library.ts:891-893` appends unconditionally:

```ts
if (cachedGameData.install.platform === 'osx') {
  newInstallPath = join(newInstallPath, cachedGameData.folder_name)
}
```

That is right for the second caller and doubles the bundle name for the first.

## Fix

GOG installs are created as `install_path = join(path, folder_name)` (`gog/games.ts:433`), so the
standing invariant is that `install_path` **ends with** `folder_name`. Append only when it does not
already. One condition, satisfies both callers, no interface change.

### Rejected alternatives

- **Delete the append.** Breaks `changeInstallPath`, whose macOS caller can only ever supply the
  parent.
- **Have `moveInstall` pass the parent instead.** Breaks non-`osx` GOG installs, where no append
  happens and `install_path` would be set to the parent directory.
- **Widen the `changeGameInstallPath` signature with a discriminator.** Touches the shared
  `LibraryManager` interface plus six implementations (three of them stubs) and four call sites,
  for a one-line defect.

## Verified NOT affected (checked, not assumed)

- `legendary/library.ts:415` and `nile/library.ts:402` set the path verbatim — no append, so no
  doubling. Their `moveInstall` callers pass `moveResult.installPath` like GOG's does.
- `zoom/library.ts:378` has the same store-update shape but **no `osx` branch** at all.
- `steam/library.ts:1298` and `sideload/library.ts:121` are no-op stubs.

## Tasks

1. Add the invariant guard in `gog/library.ts`, importing `basename`.
2. Add regression tests to `gog/__tests__/library.test.ts` covering both callers' path shapes.
3. `pnpm codecheck` + targeted jest, then commit.

## Success criteria

- The move caller's already-complete path is recorded unchanged.
- The change-install-path caller's parent directory still gets `folder_name` appended.
- Non-`osx` GOG installs are untouched.
- New tests fail against the pre-fix code (anti-vacuity).
