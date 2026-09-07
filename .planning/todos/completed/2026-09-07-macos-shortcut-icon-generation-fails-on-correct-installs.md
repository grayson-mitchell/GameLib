---
created: 2026-09-07T00:00:00.000Z
title: "macOS shortcut/icon generation fails on BOTH a mismatched import and a correct install — two different proximate causes on the same call path"
area: shortcuts
status: RESOLVED
severity: major
files:
  - src/backend/shortcuts/utils.ts
  - src/backend/shortcuts/shortcuts/shortcuts.ts
---

## Observed

Split out of
`.planning/todos/pending/2026-08-24-importgame-does-not-validate-the-folder-matches-the-selected-game.md`
(item 5 of that todo's "Suggested fix" list) by quick task `260907-ppy`, because the todo itself
proves this defect is INDEPENDENT of the folder/product-id mismatch that todo otherwise addresses:
the same failure pair fires on a clean, correct install too.

The original mismatched-folder import (Balrum `1769415595` selected, Endless Sky `1829678475`
folder chosen, 2026-08-24 21:03:38-41) threw and continued:

```
[Backend]: Error generating MacOS App
[Backend]: Error converting icon icns: TypeError [ERR_INVALID_ARG_TYPE]:
           "path" argument must be type string. Received undefined
  at getIcon (…sidecar.js:18730:44)
  at convertPngToICNS (…:20476:28)
  at generateMacOsApp (…:20429:28)
  at addShortcuts (…:20361:15)
  at GOGGame.addShortcuts (…:21527:16)
  at GOGGame.importGame (…:21323:16)
```

`getIcon` received `undefined` for `path`. Shortcut generation failed, the failure was swallowed,
and the success notification fired anyway.

**CONFIRMED INDEPENDENT (2026-08-24, 22:26:55).** A clean, correct, successful Mac install of
Phoenix Point (`Iris`, platform Mac, 37.34 GiB, registered fine in `installed.json`) threw the SAME
pair on the same call path:

```
[Backend]: Error converting icon to icns: Error: ENOENT: no such file or directory,
           open '/Users/…/Application Support/GameLib/icons/Iris.jpg'
[Backend]: Error generating MacOS App
```

So macOS shortcut generation is broken for BOTH a mismatched import and a correct install — it is
NOT a consequence of the identity mismatch and must be triaged on its own. Note the two failures
have DIFFERENT proximate causes on the same path, so a fix targeting one will not close the other:

| Run | Failure |
|---|---|
| Balrum mismatched import (21:03:41) | `TypeError [ERR_INVALID_ARG_TYPE]` — `path` was `undefined` |
| Phoenix Point clean install (22:26:55) | `ENOENT` — `icons/Iris.jpg` does not exist |

Both were swallowed, and both runs reported success to the user. The install case is the more
common one: every macOS install whose cached icon has not been fetched yet will hit it.

## Relationship to quick task 260907-ppy

That quick task closed items 1, 3 and 4 of the source todo (folder/product-id identity guard on
`GOGGame.importGame`, honest error propagation on a thrown install-record write, and field
preservation on re-import). Task 2 of `260907-ppy` deliberately made a thrown `addShortcuts()`
failure log-and-continue (return the success-shaped result) rather than fail the import, precisely
BECAUSE this todo proves shortcut/icon generation is broken for every correct install too — failing
the import on it would break the primary use case for every macOS user. That decision depends on
this todo being tracked and eventually fixed; it does not fix or mask this defect.

## Suggested fix

Two proximate causes, one call path (`getIcon` → `convertPngToICNS` → `generateMacOsApp` →
`addShortcuts`):

1. `ERR_INVALID_ARG_TYPE` case: something upstream of `getIcon` is passing it `undefined` for
   `path`. Trace what's supposed to supply that path (likely a not-yet-populated icon cache entry)
   and either populate it before calling `getIcon`, or guard `getIcon` against an undefined path
   and skip/defer shortcut icon generation instead of throwing.
2. `ENOENT` case: `icons/Iris.jpg` does not exist at the point `convertPngToICNS` tries to read it.
   Determine whether the icon download/cache step runs before or after shortcut generation is
   triggered, and either sequence it correctly or make `convertPngToICNS` tolerate a missing
   source file (fall back to a default icon, or skip icon generation and leave the shortcut
   iconless) rather than throwing.

Either way, a thrown icon/shortcut failure should be visibly logged (not silently swallowed) even
after this is fixed, since a residual environment-specific failure (permissions, disk full, etc.)
is always possible and users importing/installing macOS games should not need to check logs to
know their shortcut has no icon.

## Resolved by

Quick task `260908-e64` fixed both proximate causes in `src/backend/shortcuts/utils.ts`'s `getIcon`
and `downloadImage`:

1. `ERR_INVALID_ARG_TYPE` case: `getIcon`'s gog branch dereferenced
   `gameInfo.install.install_path!` via a false non-null assertion. Fixed by guarding on
   `const installPath = gameInfo.install.install_path; if (installPath) { ... }` before joining any
   path off of it — an absent `install_path` now falls through to the `getProductApi` lookup
   instead of throwing.
2. `ENOENT` case: `downloadImage` was declared non-`async` and called `downloadFile` without
   `await`, making the download fire-and-forget; `getIcon` returned the destination path before the
   file landed on disk. Fixed by making `downloadImage` `async` and awaiting `downloadFile`, and by
   making `getIcon` itself `async` and awaiting `downloadImage`, re-checking `existsSync(icon)`
   afterward before returning a path.
3. Per this todo's "Suggested fix" closing note (silent-swallow must not persist), `getIcon` now
   returns `Promise<string | undefined>` — `undefined` on any icon-unavailable path (no URL, failed
   download, or missing file post-download), each case logged via `logWarning` rather than thrown or
   silently swallowed. This propagates through all 4 real call sites (linux `.desktop` generation,
   `convertPngToICNS`, `generateMacOsApp`, `addNonSteamGame`'s `newEntry.icon` assignment), and
   `generateMacOsApp` was restructured (D-04) so the `.app`/`Info.plist`/`run.sh` are written
   unconditionally — an unobtainable icon degrades to an iconless shortcut, never a deleted `.app`.

Unit tests added at `src/backend/shortcuts/__tests__/getIcon.test.ts` cover the `install_path`
guard, the awaited-download-exists invariant, and the undefined-on-failure contract, each proven RED
against the pre-fix source at base commit `eedf46e64` before being proven GREEN against the fix.

## Notes

No `resolves_phase:` — not resolved by any phase and must not be auto-closed.

Related: `.planning/todos/pending/2026-08-24-importgame-does-not-validate-the-folder-matches-the-selected-game.md`
(source todo, item 5) · quick task `260907-ppy` (closed items 1, 3, 4 of that todo; Task 2's
log-not-fail decision on `addShortcuts` errors depends on this todo).
