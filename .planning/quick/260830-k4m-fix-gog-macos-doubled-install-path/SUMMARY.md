---
type: quick
slug: fix-gog-macos-doubled-install-path
quick_id: 260830-k4m
completed: 2026-08-30
status: complete
closes: [D-35-19-16]
commits: [98c92c229]
files_modified:
  - src/backend/storeManagers/gog/library.ts
  - src/backend/storeManagers/gog/__tests__/library.test.ts
---

# Summary — GOG macOS move recorded a DOUBLED install path

## What was wrong

A successful GOG move on macOS recorded `install_path` with the bundle name appended twice, so a
game that had moved correctly could no longer launch:

```
actual location : ~/GameLib/GameLibMoveTestFixture/Endless Sky.app   (7368 files, correct)
recorded path   : ~/GameLib/GameLibMoveTestFixture/Endless Sky.app/Endless Sky.app   (nonexistent)
```

The move itself was never at fault — rsync's destination was right and the bytes landed intact
(source removed, destination byte-identical by sha256). Only the recorded path was wrong.

## Root cause

`GOGLibraryManager.changeGameInstallPath(appName, newInstallPath)` is reached by two callers whose
path contracts **differ**, and the `osx` branch was written for only one of them:

| caller | passes | shape |
| --- | --- | --- |
| `gog/games.ts:794` `moveInstall` | `moveResult.installPath` | the **complete final** path — `moveOnUnix` already did `join(newInstallPath, basename(install_path))` |
| `gamedetails/dispatch.ts:230` `changeInstallPath` | the directory the user picked | on macOS necessarily the **parent**, because a directory picker cannot select a `.app` bundle |

The unconditional `join(newInstallPath, folder_name)` is correct for the second and doubles for the
first.

## The fix

GOG installs are created as `install_path = join(path, folder_name)` (`gog/games.ts:433`), so the
standing invariant is that `install_path` **ends with** `folder_name`. The append is now guarded:

```ts
if (
  cachedGameData.install.platform === 'osx' &&
  basename(newInstallPath) !== cachedGameData.folder_name
) {
```

One condition, both callers satisfied, no change to the shared `LibraryManager` signature.

### Alternatives rejected, with the reason

- **Delete the append.** Breaks `changeInstallPath`, whose macOS caller can only ever supply the
  parent.
- **Have `moveInstall` pass the parent instead** — the route the ledger itself suggested. Breaks
  non-`osx` GOG installs, where no append happens and `install_path` would be recorded as the parent
  directory.
- **Widen the signature with an explicit contract.** Touches the shared interface, six
  implementations (three no-op stubs) and four call sites, for a one-line defect.

## Sibling runners checked, not assumed

The ledger asked for this before fixing, and it was done by reading each implementation:

| runner | behaviour | doubles? |
| --- | --- | --- |
| `legendary/library.ts:415` | sets the path verbatim | no |
| `nile/library.ts:402` | sets the path verbatim | no |
| `zoom/library.ts:378` | same store-update shape, **no `osx` branch** | no |
| `steam/library.ts:1298`, `sideload/library.ts:121` | no-op stubs | n/a |

**The defect is GOG-only and macOS-only.**

## Verification

- 4 new regression tests in `gog/__tests__/library.test.ts`, seeded through the real
  `refreshInstalled()` + `loadLocalLibrary()` path rather than by poking the module map.
- **Anti-vacuity proven.** Replayed against pre-fix source via `cp` (never `git checkout --`):
  tests 1 and 4 fail with exactly `"/Users/u/Dest/Endless Sky.app/Endless Sky.app"`. Tests 2 and 3
  pass **both** ways on purpose — they pin the parent-directory caller and the non-`osx` path, so a
  guard that simply never appended would fail them. A one-directional test set would not have caught
  that.
- `pnpm codecheck` clean. `eslint` and `prettier` clean on both files; zero lint findings in the
  edited line ranges (the file's 67 pre-existing `any` warnings are all in unrelated regions).
- Backend project: **4298 pass**, 2 skipped. The 3 `decompressPool` LZMA failures are the same
  pre-existing ones proven environmental in quick task `260830-ibr`.

## Not done — read this before closing D-35-19-16

**Not live-verified.** These tests prove the recorded path is now correct in-process; nobody has
performed a real move on a packaged build and then *launched* the moved game. That is the whole
point of this defect, and it is exactly the `R-34.5-G1-PKG` lesson. The ledger entry is marked
**fixed pending live verification**, not closed.

A local release rebuild remains blocked by `createUpdaterArtifacts: true` in
`src-tauri/tauri.conf.json` with no `TAURI_SIGNING_PRIVATE_KEY` enrolled, so the verifying run has
to happen against a CI-produced artifact.

The tester's own Endless Sky entry was repaired by hand earlier in the session (backup at
`/tmp/gog-installed.json.bak`) — that repair is data, not code, and is not covered by this commit.
