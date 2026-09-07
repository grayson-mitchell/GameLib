---
created: 2026-08-24T00:00:00.000Z
title: "`importGame` never checks that the chosen folder contains the SELECTED game — it writes the install record for the folder's game and the config/shortcuts/success-toast for the user's game, silently corrupting BOTH records"
area: store-managers-gog
status: OPEN
severity: major
files:
  - src/backend/storeManagers/gog/games.ts
  - src/backend/sidecar/installFlowRegistration.ts
  - src/backend/shortcuts/shortcuts/shortcuts.ts
---

## Observed

Found by the operator on 2026-08-24 driving **step 5 of `34.6-LIVE-GATE.md`** (`importGame`), on
commit `c13b9e398`.

The import was aimed at a **deliberate mismatch** as a cheap way to exercise the channel: select
**Balrum** (GOG `1769415595`) → Import Game → point it at `~/GameLib/Endless Sky.app`, which
contains `Contents/Resources/goggame-1829678475.info` — i.e. a *different* GOG product.

The expectation was a clean rejection. Instead the UI showed **"import succeeded"**.

## What actually happened

`gamelib.log` at 21:03:38-41 shows the import running under **Balrum's** id throughout:

```
[Gog]:     Got install info from cache for 1769415595 on osx platform
[Backend]: Adding shortcuts for Balrum
[Backend]: Writing config 1769415595
[Backend]: Changed config: winePrefix … to /Users/…/GameLib/Prefixes/Balrum
[Backend]: imported Balrum
```

But `gog_store/installed.json` (rewritten at 21:03:41) records the **folder's** game, not Balrum:

```json
{"installed":[{"appName":"1829678475",
  "install_path":"/Users/…/GameLib/Endless Sky.app",
  "executable":"/Users/…/GameLib/Endless Sky.app",
  "install_size":"401.2 MiB", …}]}
```

**Balrum does not appear in `installed.json` at all.** So the operation split cleanly down the
middle:

| Written for | Which game |
|---|---|
| `installed.json` install record | **Endless Sky** (`1829678475`) — the folder's game |
| `GamesConfig/<id>.json` | **Balrum** (`1769415595`) — the selected game |
| Wine prefix path, shortcuts, notification, log line | **Balrum** |

No code reconciles the two, and nothing compares the `goggame-*.info` product id against the
`appName` the user selected.

## Collateral damage, both directions

**Endless Sky's install record was silently degraded.** Comparing before/after, the rewrite
DROPPED two fields that were present at 11:51:18:

- `versionEtag: "688661e1d54090f16fd8742109bc6759"` — **gone**
- `pinnedVersion: false` — **gone**

and changed `install_size` 404.73 MiB → 401.2 MiB and `executable` `""` → the `.app` path. A user
who imports the wrong folder therefore corrupts the update-detection state of a *different,
correctly-installed* game they never touched.

**Balrum got an orphan config.** `GamesConfig/1769415595.json` (1570 bytes, mtime 21:03) now exists
for a game that is not installed, with `winePrefix` pointed at a `~/GameLib/Prefixes/Balrum`
directory that was never created (`~/GameLib/Prefixes/` is still empty).

## Third defect: a swallowed exception still reports success

The same import threw and continued:

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

## Suggested fix

1. In `GOGGame.importGame`, read the `goggame-*.info` product id from the chosen directory and
   **reject** when it does not match `this.id`, with a message naming both. This is the whole bug
   in one check; everything else below is hardening.
2. Make the install record and the config/shortcut/notification agree by construction — they should
   derive from ONE resolved identity, not two independent ones.
3. Never write an install record that drops fields the previous record had. The `versionEtag` /
   `pinnedVersion` loss here is silent and affects update detection.
4. Do not report success when `addShortcuts` threw. Either surface it or state plainly in the
   notification that the game imported but shortcuts failed.
5. Fix `getIcon`'s `undefined` path, or guard it.

## Cleanup owed on this machine (NOT performed — app is mid-gate)

- delete the orphan `GamesConfig/1769415595.json`
- restore Endless Sky's `versionEtag` (`"688661e1d54090f16fd8742109bc6759"`) and
  `pinnedVersion: false` in `gog_store/installed.json`

Deliberately deferred: the app is running and holds this state in memory, so an on-disk edit could
be overwritten or ignored, and mutating app state mid-gate would compromise the run.

## What this does NOT indict

The `importGame` **IPC channel is fine** and this run proves it end-to-end: containment check,
status update, dispatch into the GOG store manager, real subprocess work, real file writes, real
notification. Phase 34.6 ported it correctly. Live-gate step 5 should record the channel as
passing and this as a separate product defect.

## Notes

No `resolves_phase:` — not resolved by Phase 34.6 and must not be auto-closed by it.

Related: [[upstream-port-verbatim-ships-silent-defects]] ·
[[uat-run-can-disqualify-its-own-fixture]] · [[live-gate-beats-green-suite-three-times]]

## Split

Quick task `260907-ppy` (2026-09-07) closed items 1, 3 and 4 of the "Suggested fix" list above:

- **Item 1** (reject a folder whose product id does not match the selected game): fixed in
  `GOGGame.importGame` (`src/backend/storeManagers/gog/games.ts`) — parses `gogdl import`'s stdout,
  compares `data.appName` against `this.id` as strings, and rejects with a message naming both ids
  when they differ, writing no install record, no config, and no shortcuts.
- **Item 3** (never drop fields the previous record had): fixed in `GOGLibraryManager.importGame`
  (`src/backend/storeManagers/gog/library.ts`) — the new `InstalledInfo` is now built as a
  previous-record-first spread with only the import-owned fields layered on top, so `versionEtag`,
  `pinnedVersion`, and any other un-owned field survive a re-import.
- **Item 4** (do not report success when the write threw): fixed in the same `GOGGame.importGame`
  rewrite — a thrown install-record write now returns an `ExecResult` with `error` set instead of
  being logged and reported as success. A thrown `addShortcuts()` after a SUCCESSFUL record write
  is a deliberate exception to this — see below.
- **Item 2** ("derive from ONE resolved identity") is satisfied in effect by item 1's guard: once a
  mismatched folder is rejected before either the install-record write or the config/shortcuts/
  notification path runs, `data.appName` and `this.id` are provably equal for every import that
  proceeds — there is no longer a way for the two identities to diverge, even though the code still
  technically reads `this.id` in one place and `data.appName` in another.

**Item 5 (macOS shortcut/icon generation failures) moved to its own todo**, because the todo's own
evidence proves it independent of the identity mismatch (the same failure pair fires on a clean,
correct Phoenix Point install) and the two observed runs have different proximate causes
(`ERR_INVALID_ARG_TYPE` on an undefined path vs `ENOENT` on `icons/Iris.jpg`) — a fix targeting one
will not close the other. See
`.planning/todos/pending/2026-09-07-macos-shortcut-icon-generation-fails-on-correct-installs.md`.
Quick task `260907-ppy`'s item-4 fix deliberately logs (rather than fails the import on) a thrown
`addShortcuts()` after a successful record write, precisely because shortcut/icon generation is
broken for every correct macOS install too — failing the import on it would break the primary use
case. That decision depends on the split-out todo being tracked, not on it being fixed here.

This source todo is NOT closed by this split — the operator still owns closing it (and performing
the "Cleanup owed on this machine" section above, if not already done).

## Cleanup status (2026-09-07, quick `260907-ppy`)

The "Cleanup owed on this machine" section above is **half discharged**. GameLib was confirmed not
running first, so the 2026-08-24 reason for deferring (the app holds this state in memory) no
longer applied.

- ✅ **Endless Sky's `versionEtag` / `pinnedVersion` restored** in `gog_store/installed.json`.
  Restored as `"\"688661e1d54090f16fd8742109bc6759\""` — WITH the HTTP ETag's own quotes, which is
  how both sibling records in that file store it and what `getMetaResponse`'s `If-None-Match`
  header requires (`gog/library.ts:1063`). Verified byte-identical to the app's own serialisation.
  `executable` and `install_size` were deliberately left as the bad import set them — see the quick
  task's SUMMARY for why.
- ❌ **The orphan `GamesConfig/1769415595.json` still exists.** Confirmed still orphaned
  (`1769415595` absent from `installed.json`; its `winePrefix` still points at a
  `~/GameLib/Prefixes/Balrum` that was never created). The delete was BLOCKED by the tooling's
  permission boundary on `~/Library/Application Support/`, not declined. One operator command:
  `rm ~/Library/Application\ Support/GameLib/GamesConfig/1769415595.json`

**This todo stays OPEN on that single item.** Everything in the "Suggested fix" list is closed —
items 1, 3, 4 by code (see `## Split` above), item 2 as moot by construction, item 5 by split-out.
