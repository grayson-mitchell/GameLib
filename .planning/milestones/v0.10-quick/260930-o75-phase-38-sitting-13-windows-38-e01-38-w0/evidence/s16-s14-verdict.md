# 38-S16 (Windows/row-5 half) and 38-S14 (sub-case b): sitting 13, Windows 11, 2026-09-30

## Build identity (the named REAL-PROFILE arm of the two-profile rule)

`pnpm tauri:dev` at HEAD `64bf2bfb4`, with a clean tracked tree. The window's PID was 12004 and its
path `src-tauri\target\debug\gamelib-shell.exe`. The exe mtime is 17:18:42+13:00, after the last
`main.rs` commit (`9ad2f4e74`, 17:18:31+13:00), and cargo reported the build up to date against
the clean tree (`Finished … in 0.50s`). The real profile was needed for the operator's signed-in
Steam library, as in sitting 9. No app stdout was captured into the evidence.

## Instrument

`uia_dump.ps1` reads WebView2's accessibility tree through UI Automation, which is the Windows
analogue of sitting 9's AT-SPI. `uia_score.cjs` compares node names to
`public/locales/en/gamelib.json` by EXACT string equality. WebView2 exposes each DOM node's CSS
class list as the UIA ClassName, so the CONTAINER is directly observed here. On Linux it was only
inferred from the source (BASIS=STRUCTURAL); here it is BASIS=OBSERVED.

## Branch OFF (native installs OFF): Aloft

- Arming: `config.json` `enableSteamNativeInstall=false` was read before the open. Two libraries
  were on disk.
- F1 copy: `EXACT_OFF=1` (185 chars equal to `steam.install.contentLightNotice`), `EXACT_ON=0`,
  and both partial checks 0. **PASS**
- F2 container: the notice's parent has UIA ClassName `infoBox`, whose parent is
  `InstallModal__dialog` (MUI Dialog paper). No `noticeIcon`/`noticeInfo`/ThirdPartyDialog class
  exists anywhere in the tree. **PASS**
- The dialog holds, and only holds: the title, the close button, "Select Platform Version to
  Install:", ONE disabled (`Mui-disabled`) "Windows" select, the notice, and INSTALL.
  Screenshot: `s16-off.png`.

## Branch ON with one library: Aloft, then ADOM (333300)

- Arming: the operator exited Steam, and 0 `steam*` processes were confirmed before touching
  anything. `D:\SteamLibrary` was renamed to `D:\SteamLibrary.s13-hidden` at 04:43:02Z, which left
  `C:\Program Files (x86)\Steam` as the ONLY existing path in `libraryfolders.vdf`
  (`getSteamLibraries()` keeps only existing paths). The operator turned "Download Steam games in
  GameLib" ON in Settings, and `config.json` read back `true`.
- F3 copy: `EXACT_ON=1` (122 chars, including the em dash and both apostrophes),
  `EXACT_OFF=0`, and both partial checks 0. **PASS** (Aloft `s16-on-uia.json` and ADOM
  `s14b-preinstall-uia.json`, identical results.)
- F4 container: `infoBox` inside `InstallModal__dialog`. **PASS**
- There was no library dropdown and no free-space line, only the same read-only Windows row,
  notice and INSTALL. Screenshot: `s16-on.png`.
- **S14(b) install clause:** the operator clicked INSTALL for ADOM, which planned depot 333301
  (Windows/64/english/public, 578116871 bytes, 16128 entries). `Finished Installation of 333300`
  came **85.4 s after the click**. `appmanifest_333300.acf` reads `StateFlags 4`,
  `SizeOnDisk 578116871` (exactly the planned size), `buildid 5820078`, and
  `steamapps\common\ADOM` holds 15103 files (16128 − 1025 directory entries). The GameLib badge
  flipped to installed. **"Install completes normally" PASS.**

## Restore

The operator turned the setting OFF, and it read back `false`. `D:\SteamLibrary` was renamed back
at 05:09:17Z, and `steamapps` is present with 22 manifests. Steam was not running at any point
while the library was hidden (`s16-library-rename.txt`). ADOM stays installed on C: by operator
choice.

## Verdicts

- **38-S16: Windows/row-5 half PASS.** With sitting 9's Linux/row-7 half PASS, BOTH halves now
  pass, so the item is **DISCHARGED**.
- **38-S14: sub-case (b) PASS.** With sitting 5's (a) PASS, both sub-cases pass, so the item is
  **DISCHARGED**. The two sub-cases render DIFFERENT copy (185-char vs 122-char strings, each
  matched exactly), which is the item's own FAIL condition turned PASS.

## Specification finding, not an app defect

38-S14's `expected:` lists "Cancel + Install". The Steam dialog renders **no Cancel button**, only
the ✕ close button plus INSTALL. `SteamDialog/index.tsx` contains no Cancel button, and the file's
last change (`ad2cd1fe4`, 2026-09-23) predates sitting 5's build. So sitting 5's "Cancel + Install"
was almost certainly restated from `expected:`, not observed. At discharge this is recorded as a
SPECIFICATION CORRECTION ("✕ close + Install"), NOT a re-score, the same treatment 38-C03 and
38-W03 received.
