# Steam native install (GameLib-owned depot download + ACF adoption)

Blueprint for replacing GameLib's `steam://rungameid` install black-box with a depot download
GameLib owns (like legendary/gogdl/nile), writing a real `steamapps/` library + `appmanifest.acf`
so the Steam client adopts the install; launch stays on `steam://` so DRM keeps working. This line
shipped as Phases 21/23. All three spikes VALIDATED. 087/088 later confirmed that native Windows
and Linux Steam adopt the same ACF at startup and at sign-in, which gives those platforms
restart-on-Play in Phase 81.

## Requirements (non-negotiable)

- **Launch stays with Steam.** The depot download bypasses the download, not the DRM. Files on
  disk do not make a DRM-wrapped game launch. *(D-1)*
- **`StateFlags`: full-ownership `4` is achievable, `1026` is the fallback.** Original "never write
  4" rule was **superseded by spike 003** once Phase 21 added a per-chunk sha1 integrity gate. On
  real hardware Steam accepted a GameLib-written `4` with no verify/re-download and the game
  launched. Load-bearing for a trustworthy `4`: `StateFlags=4` + `BytesToDownload==BytesDownloaded`
  (`!=0`) + current public buildid + correct `InstalledDepots` + **Executable(32)/CustomExecutable(128)
  file modes**. Keep `1026` as fallback when completeness can't be proven. *(D-2 reversal)*
- **64-bit IDs are strings, end to end.** Depot manifest GIDs and SteamID64s exceed
  `Number.MAX_SAFE_INTEGER`. `@node-steam/vdf.parse()` silently rounds them → wrong GID → forced
  re-download. Audit every vdf/acf call site. *(001)*
- **Depot selection is driven by PACKAGE-LEVEL OWNERSHIP, two channels.** A depot installs iff it's
  in an owned package's `depotids` OR carries a `dlcappid` the user owns; also walk
  `extended.listofdlc`, and filter language-specific depots to the user's language. No
  `optional`/`systemdefined` flag substitutes for ownership. Verified 11/11 vs real installs. *(001)*
- **Never write `StateFlags=4` (or 1026-with-claims) for a wrong `InstalledDepots` set.** A wrong
  depot set is the one condition that provokes re-download. *(001)*

## How to Build It

- **Download in-process via `steam-user`** — proven byte-identical to Steam's own download. No
  DepotDownloader, no .NET, no second auth stack. *(002; `sources/002-.../steam-depot.mjs`)*
- **Use `getRawManifest()` + your own decrypt/decompress (~100 lines).** Do NOT use `steam-user`'s
  `getManifest()` filenames (truncated to an AES block boundary) or `downloadChunk`/`downloadFile`
  (throw). The protocol is fine; only steam-user's handling is wrong. *(002)*
- **Retry chunks across DIFFERENT content servers** — ~16% of chunks drop at concurrency 8; normal,
  not a protocol error. *(002)*
- **Manifest format:** field casing matters (`universe`/`lastupdated` lowercase; `SizeOnDisk`/
  `StateFlags` cased). `SizeOnDisk` is real measured bytes, not a manifest sum (overshoots on
  multi-depot). Depot selection rule lives in `sources/001-acf-adoption/select.mjs`. *(001)*

### Adoption on Windows and Linux: restart-on-Play (087, 088)

Every earlier adoption spike ran on macOS. 087 (Windows 11, native Steam client 1794536281,
WazHack 264160) and 088 (Debian `steam` package, not Flatpak, same client, Steam Linux Runtime
sniper 1628350) answered the five Phase 81 D-14 questions the same way as macOS: *(087, 088)*

| Question | Windows (087) | Linux (088) |
|---|---|---|
| Q1 startup adopts a GameLib ACF | yes: StateFlags 4, no dialog, no verify, no download; also when Steam last saw the game as uninstalled | yes (`Loaded 5 → 6 apps`), no update or validation line; "no dialog" not operator-confirmed |
| 1026 at startup | zero-file commit (`has no changes` → `0 updated, 0 moved, 0 deleted files` → `Fully Installed`), rewritten to 4 — identical to Mac 083 | not tested |
| Q2 running, signed-in Steam | ignores it (2 min, ACF untouched, no log line) | ignores it (2 min) |
| Q3 sign-in from signed out | reloads every library folder and adopts, same PID, no dialog; ~11 s from rescan line to ACF rewrite | same: same PID, `Loaded 6 apps` immediately before `[Logged On`, no dialog |
| Q5 restart | `steam://exit` quits in 2 s; `steam://rungameid/<id>` relaunches with the game running locally at +15 s | `steam://exit` quits in ~4 s; any later `steam://` URL relaunches in ~12 s with auto sign-in |

So Windows and Linux get **restart-on-Play**, not the D-15 simplified hold: after a depot
install, Play quits Steam gracefully and relaunches it, and the startup rescan adopts the ACF.
Restart Steam on its own (no game) with `<SteamPath>\steam.exe` and no arguments on Windows
(`SteamExe` from HKCU `Software\Valve\Steam`; 5 runs, no dialog, automatic sign-in) and plain
`steam` on Linux. `steam.exe -shutdown` / `steam -shutdown` is an equivalent graceful quit
(2–5 s). Write the ACF the production way (`gamelib-steamfiles/src/acf.rs`
`build_app_manifest_text`, tmp + rename); the spikes' `gamelib-4.acf` / `gamelib-1026.acf`
reproduce that field set byte for byte. *(087, 088)*

**Detecting adoption without the bridge helper** differs by platform: *(087, 088)*

- **Windows, primary: Steam rewrites the ACF** within ~1 s of adoption (sha/mtime change, the
  Steam-only key `LauncherPath` appears; a 1026 ACF becomes 4). Signed-in state is HKCU
  `Software\Valve\Steam\ActiveProcess` `ActiveUser` (0 signed out or quit, the account ID
  signed in); `ActiveProcess.pid` is the live Steam PID, 0 once quit. HKCU `Apps\<id>\Running`
  is reliable while a game runs.
- **Linux: Steam did not rewrite the ACF** (sha, mtime, no `LauncherPath`, 90 s after
  adoption), so use the `apps` map in `steamapps/libraryfolders.vdf`, which Steam rewrites on each
  load (the app is absent after a no-ACF start, present after adoption). Signed-in state is the
  `[Logged On` line in `logs/connection_log.txt`; `registry.vdf` has no `ActiveUser` or
  `Apps/<id>/Installed`. `registry.vdf` `SteamPID` is the live PID (0 when quit); `steam` forks
  `steamrt64/steam` twice, so expect two PIDs.
- **Both: content_log `Loaded N apps from install folder "<lib>/steamapps/appmanifest_*.acf"`**
  marks every rescan (startup or sign-in), and N includes the app once adopted. content_log
  `Dependency added: parent 228980, child <id>` appeared on Windows only because WazHack depends
  on the Steamworks Common Redistributables; don't rely on it for every app.

Watchers that log all of this once a second: `sources/087-windows-acf-adoption/watch.ps1` +
`ctl.ps1`, `sources/088-linux-acf-adoption/watch.py` + `ctl.sh`.

## What to Avoid

- **`@node-steam/vdf` on 64-bit numeric fields** — corrupts GIDs (`…854`→`…700`). Strings only.
- **PICS-alone depot selection** — passed on WazHack, failed on 10/11 other games. Use the
  authenticated license list + two-channel ownership rule.
- **`lzma-native` as a hard dep** — pure-JS LZMA is correct, 2.2× slower (8.1 vs 17.8 MB/s). The
  no-native-modules constraint holds; `lzma-native` is an optional speedup only. *(002)*
- **Releasing a restart hold on "the recorded Steam PID exited" (D-15 shape) on Windows or
  Linux.** Signing out restarts the Steam process on both (Windows PID 34560 → 29668; Linux gets
  a new PID pair, `[U:1:0]`), while sign-in keeps the same PID. A PID change alone is not
  adoption evidence. *(087, 088)*
- **HKCU `Apps\<id>\Installed` on Windows as an install oracle.** It stayed 1 through every run,
  including while Steam showed the game as not installed. *(087)*
- **Trusting the library tile for "is it installed" on Windows.** With no local ACF the tile still
  showed Play, because the game page offered Remote Play streaming from the Mac. Check the game
  page. *(087)*
- **Expecting an ACF rewrite as the Linux adoption signal** (none on the sniper tool app). *(088)*
- **`steam -silent` to restart Steam on Linux.** It starts in the tray with no window, which looks
  like "not running". *(088)*
- **Trusting `Bytes*`/`buildid` as "free"** — they were free under 1026 only because Steam
  recomputes them during its verify pass; under StateFlags=4 (no verify) they become load-bearing.

## Constraints

- Requires the user's Steam client for launch (`steam://rungameid`) — a valid audience assumption.
- Untested edges (per spike notes): very large (50 GB) games, streaming-to-disk (spikes assemble in
  RAM), resume-after-interruption, and confirmation against a hard-DRM-wrapped title.
- **Windows/Linux adoption (087, 088), n=1 each, default library folder only.** Not tested: a
  non-default library (`D:\`), `buildid "0"`, Offline Mode, Steam started minimised or in Big
  Picture, Flatpak Steam, Steam Deck gaming mode, StateFlags 1026 on Linux, a game with no
  redistributable dependency (for the `Dependency added` line), and on Linux a real game: whether
  Steam rewrites *its* ACF and whether `rungameid` starts it after the relaunch (sniper is a tool
  with no launch option).

## Origin

Synthesized from spikes: 001, 002, 003, 087, 088.
Source files: `sources/001-acf-adoption/`, `sources/002-steam-user-depot-download/`,
`sources/003-stateflags4-full-ownership/`, `sources/087-windows-acf-adoption/`,
`sources/088-linux-acf-adoption/`.
Operationalized in Phases 21 (native install) and 23 (full-ownership StateFlags=4); 087/088 feed
Phase 81 (restart-on-Play on Windows and Linux). macOS sign-in adoption (083) is in
`mac-steam-client-integration.md`.
