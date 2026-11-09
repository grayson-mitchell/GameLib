# Integrating with the running native Mac Steam client

How GameLib works alongside a native Mac Steam that is already running and signed in:

- keeping Mac Steam's Friends list signed in around GameLib's own authenticated CM logons (the
  go-offline wrap);
- getting a running Steam to adopt an install GameLib downloaded itself;
- showing live progress while Steam downloads;
- driving install, adopt, update, verify and uninstall headlessly through steamclient's
  `IClientAppManager`;
- why bridge installs never get updates.

Writing the ACF and doing the depot download are covered in `steam-native-install.md`. The
in-bottle `steam_api` proxy is covered in `macos-steam-bridge.md`. Production touchpoints:
`src/backend/storeManagers/steam/macSteamOffline.ts` (the wrap),
`steamDownloadProgress.ts` / `steamDownloadMonitor.ts` (progress), and the
`steamExperimentalInstallApp` config flag (default `false`) for the `IClientAppManager` path.

## Requirements

- **Every authenticated CM logon on macOS goes through the go-offline wrap:**
  `steam://open/gooffline`, then wait for Mac Steam's `LogOff()`, then log on, settle, then
  `steam://open/goonline`. This includes reconnects. (046a, 046b, 046c)
- **The wrap is insurance now, not a gate.** On 2026-11-09 nothing GameLib does signs Friends
  out unwrapped: a bare logon from steam-user or steam-vent (074), and GameLib's **full Refresh**
  (logon, licenses, canary, `getUserOwnedApps`, licensed-demos package and app info, the
  held-session PICS pass, 60 s idle, logOff), both as a staged harness and as the real app with
  the wrap patched out (075). Mac Steam's `connection_log` stayed silent and Friends stayed
  signed in and changeable. Mac Steam's `steamclient.dylib` is unchanged since 2026-10-22,
  before the debug-era flips (10-24…27), so the cause changed server-side or lived in the old
  refresh token (re-minted 2026-11-08). Either can come back. So: **keep the wrap**, but when Mac
  Steam does not log off within 5 s, **log on unwrapped** instead of refusing with
  `go-offline-required` and the guided Go-Offline step. Put "Refresh with Mac Steam online →
  Friends still signed in" in every Steam-auth phase's live gate, since the flip leaves no
  `connection_log` trace and only the operator can see it. (074, 075)
- **Gate the wrap on evidence, not on the URL firing.** Proceed with the logon only after
  `connection_log.txt` shows `LogOff()` /
  `not auto reconnecting due to user initiated logoff`. If it doesn't appear (game running,
  Steam signed out, Valve dropped the verb), the logon is not safe. (046a, 046b)
- **steam-user must run with `autoRelogin: false`.** Every reconnect, including the canary's
  `client.relog()`, has to be routed back through the wrapped connect. Otherwise a silent
  re-logon happens outside the offline window. (046c; production options per 067a/074)
- **A running Steam never notices a GameLib-written ACF on its own.** It was ignored for 16+
  minutes. `steam://install/<appId>` only opens Steam's install **dialog** and needs a human
  click. **Corrected 2026-10-29:** 047–049 originally reported this as unattended, which was
  wrong. Production restarts Steam on Play instead. The silent, no-UI alternative is
  `IClientAppManager::InstallApp`. (047, 048, 049, 066)
- **Never call an `IClientAppManager` slot you have not verified at runtime.** Resolve the
  engine getter by RTTI name and each method by its IPC function-ID high half. If either check
  fails, fall back to the `steam://` / restart path. (065, 066, 067, 069)
- **Bridge installs (per-game `GameLibSteamBridge-<appId>` bottles) are never updated by
  anything.** GameLib owns their updates: detection by PICS buildid comparison, then a delta
  update that keeps GameLib's shim files. (070)

## How to Build It

### 1. The go-offline wrap (046a/046b)

The verbs are undocumented, but they sit in `steamui.dylib`'s native `steam://open/<x>` table.
Valve's own JS fires `steam://open/goonline`. They take the same code path as Steam menu → Go
Offline: no dialog, no TCC prompt, no restart (same `steam_osx` PID). Both are **idempotent**:
firing one when Steam is already in that state writes 0 log lines, so fire blind with no state
read first.

```js
// 046b wrap.mjs, reduced
execFileSync('/usr/bin/open', ['-g', 'steam://open/gooffline'])
const off = await until(
  steamConnLog,
  /LogOff\(\)|not auto reconnecting due to user initiated logoff/,
  20000
)
if (!off.ok) abort('Mac Steam did not log off — GameLib logon is NOT safe')
await gamelibLogon() // SteamUser.loggedOn
await sleep(2000) // settle (2 s tested; shorter untested)
execFileSync('/usr/bin/open', ['-g', 'steam://open/goonline'])
// expect RecvMsgClientLogOnResponse() : processing complete ~1.3–1.5 s later, same PID
```

- Oracle: `~/Library/Application Support/Steam/logs/connection_log.txt`, read from a byte
  offset taken **just before** the URL fires, so that only lines the URL caused are counted.
- Timing: offline ≤ 0.25 s. Online ≈ 1.3–1.5 s with a CM already chosen (a cold CM pick adds
  about 1 s). The whole automated offline window is about 3–4 s.
- GameLib's session **survives** Mac Steam rejoining, including a library fetch that is in
  flight during the rejoin. There is no `disconnected`, `relog` or `LogonSessionReplaced`. Both
  sessions coexist. 074 confirmed the same from Rust: 120 s alive, no `ClientLoggedOff`.
- PID helper: `pgrep -x steam_osx`. Never `-f`, which also matches Steam Helper.

### 2. Reconnects (046c, PARTIAL: mechanism only, not observed live)

With steam-user 5.3.0 defaults, GameLib has three logon sites: `client.logOn({ refreshToken })`,
the canary's `client.relog()`, and steam-user's silent `autoRelogin`. `autoRelogin` calls
`logOn(true)` after a 1 s backoff on `NoConnection`/`TryAnotherCM`/`Fail`/
`ServiceUnavailable`, sending a full `CMsgClientLogon` identical to the first. So:

- Construct the client with `autoRelogin: false`. Treat `disconnected` as session ended.
- Route every reconnect through the wrapped connect, so each CM logon gets its own offline
  window.
- Rejected alternative: firing `gooffline` inside steam-user's 1 s backoff. It is racy, because
  the backoff is not a contract.

### 3. Adopting a GameLib install into a running Steam

**Preferred (no UI): `IClientAppManager::InstallApp(appId, 0, false)` on an app whose complete
files already sit in `common/<installdir>`** (066). Steam fetches only the depot manifest,
validates (`Found 171 pre-existing matching files`), downloads no chunks, writes its own ACF,
and reaches state 4 in about 2 s. You get a toast and the library entry, and no window.

What the `steam://install/<appId>` adoption runs (047–049) still tell you about Steam's
adoption scan, which applies to any adoption trigger:

- **Steam trusts neither GameLib ACF.** It overwrites StateFlags 4 and 1026 alike with a
  placeholder (StateFlags 2, 18, then 1042 mid-commit; buildid 0) and rebuilds from a full scan.
  Correctness rests on the files matching `InstalledDepots`' manifest GIDs.
- **To detect completion**, wait for StateFlags bit 4 **and** `buildid` ≠ 0. Never wait for an
  exact intermediate value.
- **The scan checks content, not just size** (049: `found 169/2` with a same-size, same-mtime
  mid-file XOR caught). Bad files are re-fetched **whole** (every chunk of each file), and the
  repair is byte-exact. Adoption is self-healing. GameLib's sha1 gate is still worth having,
  because it avoids large re-fetches.
- During a repair the ACF shows StateFlags 1026 with live `BytesDownloaded`/`BytesToDownload`.
  The UI must not read that as "waiting for Steam restart".
- In `update started : download X/Y`, X is the number of bytes already satisfied from disk.
  `X == Y` means nothing is left to fetch, not that a download happened.
- Cost (048, Civ V, 7.72 GB, 22 depots): about 15 s of manifest fetches (one per depot) plus a
  scan of roughly 1.5 s/GB on internal SSD, for about 28 s in total. Show "Steam is
  verifying…" and watch the ACF.
- Steam adds `installscript.vdf`, which GameLib's install omits, and recreates zero-byte files.
  Workshop content for the app is fetched as a side effect.

### 4. `IClientAppManager` from a native helper (065/066/067/069)

A native process `dlopen`s the user's own
`~/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS/steamclient.dylib`
(nothing Valve-licensed is shipped). The existing bridge helper is the natural host. It must
not be Node.

```c
CreateInterfaceFn ci = dlsym(lib, "CreateInterface");
void *engine = ci("CLIENTENGINE_INTERFACE_VERSION005", &rc);      // RTTI 12CSteamClient
HSteamPipe pipe = vt(engine)[0](engine);                          // CreateSteamPipe; 0 => Steam not running -> fall back
HSteamUser user = vt(engine)[3](engine, pipe);                    // ConnectToGlobalUser
void *apm = vt(engine)[43](engine, user, pipe);                   // header says 45 — WRONG on this build
if (!strstr(rtti_name(apm), "IClientAppManager")) fallback();     // vtable[-1] -> type_info name
uint32_t err = vt(apm)[0](apm, appId, /*libraryFolder*/0, /*bLegacy*/0);  // InstallApp
```

Runtime verification, which is required because OpenSteamClient's header order was stale on
the 2026-10-22 build:

- **Engine getter:** scan getter slots only (never call non-getters) and match the RTTI name
  `20IClientAppManagerMap`. It was slot 43; the header says 45. Two slots had been removed
  since the header was written.
- **Methods:** every proxy loads `mov w8,#lo; movk w8,#hi,lsl #16` with interface id 17. The
  **high 16 bits** of the function ID match OpenSteamClient's dump even where the low bits
  changed. A new method sits at slot 8, so header slots 8–22 shift by +1. See
  `sources/066-steamclient-register-install/slotmap.txt`.

Slots verified on this build (match each one by function ID, never hard-code):

| Slot | Method                                         | Verified use                                                                                                                                   |
| ---- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | `InstallApp(appId, folder, bLegacy)`           | fresh install, no window or dialog (065); adopt files on disk (066); **start a deferred update now** (069); no-op on an up-to-date app          |
| 1    | `UninstallApp(appId)`                          | deletes the dir, the ACF and Workshop content in under 1 s, with no confirmation (067)                                                       |
| 4/5  | `GetAppInstallState` / `GetAppInstallDir`      | state 1 = uninstalled, 4 = fully installed, 6 = update required + installed                                                                   |
| 15   | `GetNumInstalledApps`                          | equals the ACF count; **0 while signed out**                                                                                                   |
| 21   | `BIsAppUpToDate`                               | 0 while an update is pending                                                                                                                   |
| 27   | `StartValidatingApp`                           | verify files, about 2 s, no UI                                                                                                                 |
| 48/49 | `Get/SetAppAutoUpdateBehavior`                | 0 always, 1 on launch, 2 high priority                                                                                                         |
| 59   | `GetAppAutoUpdateDelayedUntilTime`             | when Steam would start a deferred update                                                                                                       |

Return codes: `EAppUpdateError` 0 = OK. **18 (`k_EAppErrorNotInstalled`) is ambiguous:** a
signed-out Steam returns 18 synchronously and touches nothing (067), and so does a genuinely
uninstalled app. Disambiguate with `GetNumInstalledApps` (0 when signed out) or
`GetAppInstallState` first, then show "sign in to Steam" or use GameLib's own delete.

**Update detection for Steam-registered games (069) needs no PICS:** use IPC
(`BIsAppUpToDate` = 0, state 6), or read the ACF with Steam closed: `StateFlags` bit `0x2`,
`TargetBuildID` ≠ `buildid`, `BytesToDownload` > 0, `ScheduledAutoUpdate` set. The ACF lags
until Steam has noticed the update.

### 5. Live progress for a Steam-performed download (050)

This applies only to **Mac-native** games. Wine games always go through GameLib's own depot
downloader.

- **The ACF is not rewritten mid-download at all.** There are setup writes at +2–6 s (which
  carry `BytesToDownload`), then nothing until commit. That was 0 writes across 109 s and
  356 s downloads. An ACF poller shows 0 % and then done.
- **Staging (`downloading/<appId>/`) is preallocated with real blocks** to about 100 % within
  2 s, so neither the apparent size nor `st_blocks` works. The install dir changes in one step
  at commit. content_log `Current download rate` is accurate but written only every 60 s.
- **Use nettop per-flow `bytes_in` for steam_osx.** It updates every 1 s in 0.28 % steps, with
  speed CV 0.13–0.17. It ended at 100.4 % of `BytesToDownload`, which includes TLS overhead.

```js
spawn(
  'script',
  ['-q', '/dev/null', 'nettop', '-x', '-n', '-L', '0', '-s', '1', '-J', 'bytes_in', '-p', pid],
  { stdio: ['ignore', 'pipe', 'ignore'] }
) // pty: nettop block-buffers into a pipe
// per row: key = flow 4-tuple; skip 127.0.0.1; first block = baseline; cum += max(0, v - prev)
// percent = min(0.99, cum / BytesToDownload); 100 % only on StateFlags 4 / "Fully Installed"
```

- Phase labels come from content_log `AppID N App update changed : …` (Preallocating /
  Downloading,Staging / Committing). These lines are immediate. content_log is **CRLF**:
  strip `\r` before regex matching, or every `(.*)$` pattern fails silently.
- The nettop child is a long-lived sidecar child. It falls under the sidecar exit contract
  (`unref`, killed at stdin EOF) and fake-HOME spawn rules. Run it only while a Steam download
  is active.

### 6. Bridge games and updates (070)

Compare the bridge ACF `buildid` with PICS `depots.branches.public.buildid` (use the
`BetaKey` branch if one is set). This agreed with the per-depot GID check on 28 of 28
installs. Do not use `timeupdated`, which is missing for older apps. The delta update must
restore or keep `steam_api64.dll.gamelib-orig` / `gamelib_bridge.cfg` and re-place the shim.
Rule: keep any file the old manifest didn't own (DXVK caches, logs, version stamps).

The delta itself is proven (076): a chunk-level update built beside the old tree, then committed.
The recipe, byte counts for all six stale installs and the shim handover (Manor Lords' update
replaces `steam_api64.dll`) are in `rust-migration-steam.md` → "Delta updates for bridge
installs".

## What to Avoid

- **Don't treat `steam://install/<appId>` as unattended adoption.** It opens a dialog. If the
  dialog is off-screen, Steam logs `Installs.CancelInstall`. (Correction to 047–049)
- **Don't rely on passive pickup or `RefreshLibraryFolders`.** Neither rescans manifests.
  `RecoverAppFromFolder` is repair-only and returns 18 for an app Steam doesn't know. (047, 066)
- **Don't hard-code `IClientAppManager` / engine slot indices** from OpenSteamClient. Two were
  wrong for a one-year-old header. (065)
- **Don't read `GetUpdateInfo`'s struct as documented.** It has drifted. Only the build words at
  `0x20` (current) and `0x24` (target) were verified, so read those or skip the struct. (069)
- **Don't fake a "pending update" fixture with a branch switch.** `SetActiveBeta` downloads
  immediately even with auto-update behavior 1. Instead, quit Steam, delete `BetaKey` from the
  ACF, and relaunch. (069)
- **Don't pull manifest GIDs through `@node-steam/vdf.parse`.** It rounds 19-digit GIDs. Read
  them from raw ACF text as strings. (070)
- **Don't use nettop's per-process `-P` totals.** They drop closed flows (207 KB reported after
  a 2.8 GB download). (050)
- **Don't use CEF remote debugging, Accessibility menu clicks or `IClientUser::SetOfflineMode`
  for the offline toggle.** They need a restart, open a debug port, need TCC permission, or
  use a fragile ABI, and the URL makes them unnecessary. (046a)
- **Don't delete the wrap on 075's evidence, and don't block the user on it either.** It is
  cheap insurance against a flip that stopped for reasons nobody controls (075). Don't use
  `connection_log` to detect a flip: the debug-era flips left no trace there.
- **Don't expect a launch-time logon to reproduce the old flip.** Today's app defers the library
  refresh at startup (`trigger=startup`, no CM logon); reproduce with an explicit Refresh. (075)

## Constraints

- **macOS only, single Steam build.** The `IClientAppManager` work was n=1 per call on
  `steamclient.dylib` from 2026-10-22 (52628544 B), arm64. Windows `steamclient64.dll` and Linux
  `steamclient.so` are expected to use the same interface names, but their layouts must be
  verified the same way.
- **No Steam dialog means no Steam confirmations.** GameLib's install and uninstall modals own
  disk space, folder choice, game name and size, and must refuse while the game is running.
  Library folder index 0 = Steam's default folder. Mapping GameLib's chosen library to a Steam
  folder index is untested.
- **Running-game behaviour of `gooffline` is untested.** Settings → Internet refuses with
  `MustCloseGames`; the URL path is unknown. The `LogOff()` gate covers this either way.
- **Wrap settle times below 2 s are untested**, and so is Refresh as the wrap trigger (046b's
  logon was the launch-time one).
- **Untested across the board:** Steam not running (expect `CreateSteamPipe` → 0, then fall
  back), an unowned app, a running game during `UninstallApp`/`InstallApp`, non-default library
  folders, large or multi-depot updates via `InstallApp`, adopt-at-startup content scanning
  (003's "Verifying file sizes only" suggests it may check sizes only), nettop with
  pause/resume, concurrent downloads, or delta updates.
- `steam://open/gooffline` is undocumented. Valve itself only uses the `goonline` half.

## Origin

| Spike | Verdict                         | One-line result                                                                                                                                      |
| ----- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 046a  | VALIDATED                       | `steam://open/gooffline`/`goonline` toggle Mac Steam silently, idempotently, same PID                                                                |
| 046b  | VALIDATED                       | the wrap around GameLib's logon keeps Friends signed in; GameLib's session survives Steam rejoining                                                  |
| 046c  | PARTIAL                         | mechanism only: autoRelogin/relog are fresh logons → the wrap must own every reconnect                                                               |
| 047   | VALIDATED, **corrected**        | `steam://install` adopts with no download, but needs a click on the install dialog (correction 2026-10-29)                                          |
| 048   | VALIDATED, **corrected**        | adoption scales: 7.72 GB / 22 depots ≈ 28 s; wait for bit 4 + buildid ≠ 0                                                                            |
| 049   | VALIDATED, **corrected**        | the adoption scan hashes content; bad files are re-fetched whole and the repair is byte-exact                                                       |
| 050   | VALIDATED                       | the ACF never updates mid-download; staging is preallocated; nettop per-flow bytes is the live source                                               |
| 065   | VALIDATED                       | `IClientAppManager::InstallApp` from a separate process installs with no UI; header slots stale                                                      |
| 066   | VALIDATED                       | `InstallApp` with the files present adopts them, which replaces "Restart Steam to finish"                                                            |
| 067   | VALIDATED                       | `UninstallApp` removes silently; signed out → 18 synchronously, nothing touched                                                                      |
| 069   | VALIDATED                       | `InstallApp` on a deferred update runs it now; no separate update method exists                                                                      |
| 070   | VALIDATED                       | 6 of 28 bridge installs stale; nothing ever updates bridge bottles                                                                                   |
| 074\* | VALIDATED wrapped + SURPRISE    | wrap works from Rust; a **bare** logon no longer flips Friends (2026-11-09); keep the wrap pending a full-refresh retest                             |
| 075   | VALIDATED                       | GameLib's **full Refresh** unwrapped (harness and real app) doesn't flip Friends either; steamclient.dylib unchanged since before the flips → keep the wrap, fall through unwrapped |

\*074 is packaged elsewhere (Rust migration). It is cited here because it qualifies 046's
premise. Sources for 046a–070 and 075 are in `sources/<NNN-name>/` (075 includes
`arm-b-nowrap.patch`, the one-line real-app bypass, to re-run the check).
