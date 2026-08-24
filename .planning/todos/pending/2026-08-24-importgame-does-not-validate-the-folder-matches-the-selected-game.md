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
and the success notification fired anyway. Worth checking whether this reproduces on a CORRECT
import — if so it is an independent bug in macOS shortcut generation, not a consequence of the
mismatch.

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
