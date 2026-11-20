# Quick 261025-rkj: Bridge first-launch Steam shared redists - Research

**Researched:** 2026-10-25
**Domain:** Steam shared depots (app 228980), installscript.vdf, CrossOver bottle execution
**Confidence:** HIGH for the download path and the data. MEDIUM for CrossOver installer behaviour.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- VC++ runtimes and DirectX: install automatically when the game's appinfo declares them.
- .NET (and anything not positively identified as VC++/DirectX): do NOT install automatically.
  Wine Mono serves .NET 4.x today, and Microsoft's .NET installers under CrossOver can replace it
  and break titles that currently run. A known-fixes profile (bundled/local only) can opt a title
  into a .NET (or other) shared depot.
- Classification must come from data that is verified (depot content / installscript), not from
  a depot-id-to-name table recalled from memory. If a depot's kind cannot be established, skip it
  and log.
- Quick task, not a phase. Research + plan-check + verify.
- Precedent: Steam-in-a-bottle runs the depot's installscript.vdf (`Run Process`, `HasRunKey` skip
  checks). Heroic's GOG path (`src/backend/storeManagers/gog/redist.ts`) downloads common redists
  and runs the declared ones in the prefix under the `redist` status. Follow its shape where it fits.

### Claude's Discretion
- Where the downloaded redist content lives (one shared GameLib cache vs per-bottle copy).
- Whether to run at install time or first launch (first launch preferred, matching Steam, and it
  covers already-installed titles).
- Idempotence mechanism (installscript HasRunKey semantics preferred, as Steam uses).

### Deferred Ideas (OUT OF SCOPE)
None listed. Item 2 of the todo is already done (quick 261025-mfz).
</user_constraints>

## Summary

**The download path is verified.** The existing internals in `depot.ts` already cover it:
`getDepotDecryptionKey`, `getRawManifest` and `downloadDepotFiles`. A logged-in user needs no
ownership for 228980. An **anonymous** steam-user 5.3.0 session got the key and the manifest for
all 25 depots of 228980, and downloaded files from them, with `appId=228980` (scratch scripts,
not in the repo). An anonymous session has fewer rights than a logged-in one, so the authenticated
`getDepotClient()` client should work too. That last step is `[ASSUMED]` until the live gate runs.
`selectDepots` must **not** be used, because its ownership gate and its `depotfromapp` skip
(`select.ts:166-179`) are what exclude these depots today. Build the descriptors directly from the
game's appinfo, with `ownerAppId: '228980'`.

Every 228980 depot ships exactly one `installscript.vdf`, with manifest flag `256`
(EDepotFileFlag InstallScript), at `_CommonRedist\<Family>\<Version>\installscript.vdf`. The
install dir is `Steamworks Shared` (228980 `config.installdir`). `HasRunKey` paths sit under
`HKLM\Software\Valve\Steam\Apps\CommonRedist\<Family>\...`. Together these give a positive
classification from downloaded, sha1-verified data. **Correction to CONTEXT.md:** depot 229033 is
**PhysX 9.14.0702**, not VC++. 229003/229004/229005/229007 are .NET, and 229020 is OpenAL. None of
these auto-install.

**Primary recommendation:** add one exported function to `depot.ts`,
`downloadSharedRedistDepots(gameAppId, opts)`. It reads the game's appinfo, keeps the
`depotfromapp === '228980'` depots, and builds a `DepotPlan` with `appId: '228980'`. It first
downloads only each depot's installscript and classifies the depot. Only for VC++/DirectX (or a
trusted opt-in) does it download the full depot, into one shared GameLib cache, without
`finalizeToSteam`. A new `bridge/sharedRedists.ts` then runs each `Run Process` entry in the
bottle with `wait:false` plus an unref'd timeout. A success writes the HasRunKey value with
`reg add /reg:32`. Call it from `fireBridgeWineLaunch` right after `applySteamBridgeKnownFixes`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary | Rationale |
|---|---|---|---|
| Read the declared shared depots + 228980 appinfo | Sidecar backend (`depot.ts`, authenticated CM) | — | Same PICS client and retry wrapper (`withPlanBuildRetry`) as installs |
| Fetch key/manifest/chunks | Sidecar backend (`depot.ts` internals) | — | The internals are not exported; the new entry point must live in `depot.ts` |
| Classify + parse installscript | New pure module (`bridge/sharedRedists.ts`) | — | Pure and unit-testable over fixture text |
| Execute in bottle | `runWineCommand` (launcher.ts) | CrossOver bottle | Same channel as the known-fixes applier |
| Play-button status | `sendGameStatusUpdate` status `redist` | Frontend locale `gamepage.json:386` | Exists already |

## Q1: Download seams (verified)

| Seam | Location | Use |
|---|---|---|
| `fetchAppInfo(client, id)` | `depot.ts:541` (private) | Game appinfo plus 228980 appinfo |
| `withPlanBuildRetry(signal, fn, label)` | `depot.ts:446` (private) | Wrap every CM call |
| `fetchDepotPlanEntry(client, descriptor, parser)` | `depot.ts:663` (private) | Pass `{id, manifest: gid, size, ownerAppId:'228980'}`. Key and manifest are requested with ownerAppId (`:678`, `:693`) |
| `loadContentManifestParser()` | `depot.ts:591` | — |
| `getContentServerHosts(client, 228980)`, `new CdnAuthTokenCache(client, 228980)` | `depot.ts:3373`, `:3675` | Same pattern as `downloadSteamDepots:3652-3675` |
| `downloadDepotFiles(plan, {targetSteamappsDir, installdir:'Steamworks Shared', hosts, ...})` | `depot.ts:2319` | Writes to `<targetSteamappsDir>/common/Steamworks Shared` (`:2335-2339`). `reconcilePartialState` skips files whose sha1 already verifies, so a re-run is cheap |

Rules:
- Do **not** call `downloadSteamDepots`/`buildDepotPlan`. Both run ownership selection and
  `finalizeToSteam`, which writes an ACF. No ACF is wanted for 228980.
- Filter the game's depots on `String(d.depotfromapp) === '228980'` exactly. Measured entry shape:
  `{"config":{"oslist":"windows"},"depotfromapp":"228980","sharedinstall":"1"}`.
  Other shared apps (e.g. 1007 Steamworks SDK Redist) carry steamclient DLLs, which must never land
  in a bridge bottle.
- Take each GID from the **228980** appinfo `depots[id].manifests.public.gid`, kept as a STRING
  (Pitfall: never `@node-steam/vdf`/Number).
- `downloadDepotFiles` emits `sendProgressUpdate({appName: plan.appId})`, i.e. `'228980'`
  (`depot.ts:2690`). This is harmless, because no library entry or watchdog listens on that
  appName. Do not set `plan.appId` to the game's id, because that would drive the game's install
  progress UI. A `plan.appId` other than 228980 would also be wrong for CDN host and token scoping.
- If `SteamUser.ensureConnected()` is false (logged out or offline), skip and log. The launch
  continues.

## Q2: 228980 layout (verified, anonymous manifests 2026-10-25)

`config.installdir = "Steamworks Shared"`, `freedownload: 1`, and every depot has `oslist=windows`.
Each depot has one InstallScript-flagged file (flag 256):

| Depot | installscript path | public size |
|---|---|---|
| 228981/2/3/4/5/6/7/8/9 | `_CommonRedist\vcredist\{2005,2008,2010,2012,2013,2015,2017,2019,2022}\installscript.vdf` | 5.9-29.8 MB |
| 228990 | `_CommonRedist\DirectX\Jun2010\installscript.vdf` (157 files, DXSETUP + cabs) | 102.9 MB |
| 229000-229007 | `_CommonRedist\DotNet\{3.5,3.5 Client Profile,4.0,4.0 Client Profile,4.5.2,4.6,4.7,4.8}\` | 43-268 MB |
| 229010-229012 | `_CommonRedist\XNA\{3.0,3.1,4.0}\` | 7-8 MB |
| 229020 | `_CommonRedist\OpenAL\2.0.7.0\` | 0.8 MB |
| 229030-229033 | `_CommonRedist\PhysX\{8.09.04,9.12.1031,9.13.1220,9.14.0702}\` | 27-52 MB |

The auto set across the 10 measured titles is 228983, 228984, 228985, 228986, 228988, 228989 and
228990, totalling about 234 MB if all were needed at once.

Verified installscript bodies (excerpt):
- 2010 (228983): entries `x86` (`process 1` `%INSTALLDIR%\_CommonRedist\vcredist\2010\vcredist_x86.exe`, `command 1` `/quiet /norestart`) and `x64` (same with x64, plus `requirement_os { is64bitwindows 1 }`). Both share `hasrunkey` `HKEY_LOCAL_MACHINE\Software\Valve\Steam\Apps\CommonRedist\vcredist\2010`.
- 2015/2022 (228986/228989): `process 1` points at a `.cmd` wrapper (`Microsoft Visual C++ 2022 x64.cmd`) with no `command 1`. Wrapper body: `start /w "" "%~dp0\VC_redist.x64.exe" /q /norestart` / `IF %ERRORLEVEL% == 3010 EXIT /B 0`. Entry names carry the version, e.g. `"x64 14.51.36247.0"`.
- DirectX (228990): one entry `dxsetup`: `%INSTALLDIR%\_CommonRedist\DirectX\Jun2010\DXSETUP.exe`, `/silent`, hasrunkey `...\CommonRedist\DirectX\Jun2010`.
- .NET 4.8 (229007): **two entries with the same key `"4.8"`** (one `noop.cmd` gated by `Requirement_OS { OSType "Windows XP" }`, one real installer).
- PhysX (229033): `process 1` is bare `msiexec`, with a quoted `%INSTALLDIR%` path inside `command 1`.
- Key casing varies between files (`installscript`/`InstallScript`, `hasrunkey`/`HasRunKey`). Every file ends with a `kvsignatures` block.

## Q3: installscript semantics (CITED + measured)

From [Steamworks: Install Scripts](https://partner.steamgames.com/doc/sdk/installscripts):
- Each named entry under `Run Process` runs only if its HasRunKey value is "not present or 0". The
  runner then calls CreateProcess on `process N` with `command N`. `MinimumHasRunValue` raises the
  threshold.
- Only exit code 0 counts as success, and Steam then writes the entry's key name as `1` to the
  registry. Any other code means "Steam will attempt to run it again on next launch".
- `NoCleanUp` keeps the mark when the app is deleted. `AsCurrentUser` exists. `Requirement_OS`
  takes `Is64BitWindows` (1/0) and `OSType` (a Windows name).
- `%INSTALLDIR%` is the full install path with no trailing backslash. Other variables are
  `%ROOTDRIVE%`, `%APPDATA%` and `%STEAMPATH%`.
- On 64-bit Windows, HKLM writes go to `Wow6432Node`. Signed `kvsignatures` are required for HKLM
  writes.

From [Steamworks: Common Redistributables](https://partner.steamgames.com/doc/features/common_redist):
"installed only if necessary". "Where applicable, both 64-bit and 32-bit of redistributables are
installed on 64-bit systems." You can force a reinstall by deleting
`HKLM\SOFTWARE\Wow6432Node\Valve\Steam\Apps\CommonRedist`, which holds one subkey per redist.

Measured in the GameLibSteam bottle (XCOM 200510, a script with no HasRunKey):
`runprocess_log.txt` shows `Exit Code (0) : "C:\...\DirectX\DXSETUP.exe" /silent`. `system.reg`
then gained `[Software\\Wow6432Node\\Valve\\Steam\\Apps\\200510]` with `"directx"=dword:00000001`
and `"vcredist"=dword:00000001`. The value name is the **lowercased entry name**, and the 32-bit
view was used. When HasRunKey is present, write `reg add <HasRunKey> /v <entry name lowercased>
/t REG_DWORD /d 1 /reg:32 /f`. Steam lowercases names (measured), and HKLM writes land under
Wow6432Node (CITED), which `/reg:32` targets.

On Proton, Steam runs these same scripts in the Wine prefix through `legacycompat/iscriptevaluator`
before the first launch (MEDIUM: [steamtinkerlaunch wiki](https://github.com/360900/tinkergame/wiki/Steam-First-Time-Setup), [Steamworks Shared wiki](https://github.com/frostworx/steamtinkerlaunch/wiki/Steamworks-Shared)).
That is the precedent for running them under Wine.

## Q4: Positive classification (from verified data only)

For each declared depot, download the plan reduced to its single flag-256 file. Classify as
follows, matching case-insensitively after normalising `\`:
- **vcredist**: installscript path matches `^_CommonRedist\\vcredist\\[^\\]+\\installscript\.vdf$`, AND every Run Process entry's HasRunKey starts with `HKEY_LOCAL_MACHINE\Software\Valve\Steam\Apps\CommonRedist\vcredist\`, AND every `process N` starts with `%INSTALLDIR%\_CommonRedist\vcredist\` and ends `.exe` or `.cmd`.
- **directx**: the same three checks with `DirectX`, and the process must end in `DXSETUP.exe`.
- **Anything else is `other`** and is skipped with a log line unless a trusted profile opted in.
  That covers DotNet/PhysX/XNA/OpenAL paths, a bare `msiexec` process, a HasRunKey outside
  CommonRedist, a missing or unparsable script, or **duplicate entry keys**.
- Name for the status context, from the path: `vcredist 2022` / `DirectX Jun2010`. Do not use an id table.

Opt-in: add a trusted-only known-fixes key, e.g. `steamSharedRedists: ["229007"]`. Append it to
`TRUSTED_ONLY_KNOWN_FIX_KEYS` (`src/backend/knownFixes.ts:103`), type it in `KnowFixesInfo`
(`src/common/types.ts:1122`), and read it via `readKnownFixesLayered`. An opted-in id is still
installed only if the game itself declares it (or say otherwise explicitly in the plan).

## Q5: CrossOver pitfalls

1. **`@node-steam/vdf` is unsafe for installscripts (measured).** On the .NET 4.8 script it
   **merged the two `"4.8"` entries** into one, taking `process 1` from the second and
   `Requirement_OS OSType=Windows XP` from the first. It also leaves `\\` escapes un-decoded
   (values come back with doubled backslashes). Use a small ordered KV1 tokenizer that keeps
   duplicate keys and decodes `\\`→`\` and `\"`→`"`. It is about 40 lines and needs fixture tests.
   This is a justified exception to "don't hand-roll", because the standard parser loses data.
2. **`wineserver --wait` can block forever.** `runWineCommand` only waits on wineserver when
   `wait:true` (`launcher.ts:1582-1593`). Use `wait:false` and `Promise.race` against a timer that
   is `unref?.()`'d and cleared in `finally`. The pattern is in `bridgeKnownFixes.ts:209-247` and
   `steamClientSetup.ts:189-240`. `wait:false` still resolves on the child's `close` with
   `code`. Installer timeouts should be generous, around 5 min per process, because DXSETUP is
   slow `[ASSUMED]`. A timed-out child cannot be killed through `runWineCommand`
   (`steamClientSetup.ts:191-193`), so log it and do not mark it done. Do **not** copy
   `runInPrefix`'s `wait:true` (`bridgeKnownFixes.ts:313`).
3. **Bottles are win64** (measured: `cxbottle.conf` `"WineArch" = "win64"` for GameLibSteam and the
   bridge bottles). So `Is64BitWindows=1` holds, and both the x86 and x64 entries run. Treat
   `OSType` as unmatched unless it equals the bottle's reported Windows version (`[ASSUMED]`
   Windows 10). Only the .NET opt-in path meets it.
4. **`.cmd` processes.** Run them as `['cmd', '/c', <windows path>]`. Do not pass the .cmd as argv0
   `[ASSUMED]`, although Wine's CreateProcess can launch .bat/.cmd. The wrapper's `start /w`
   needs Wine's cmd, which ships in every bottle.
5. **Path translation.** `%INSTALLDIR%` must be the *Windows* path of `Steamworks Shared` as seen
   from inside the bottle. Every bridge bottle has `z: -> /` (measured `dosdevices/`), so a host
   cache path maps to `Z:` plus the host path with `\` separators. Split `command N` on whitespace
   only for the auto kinds, because their commands are `/quiet /norestart`, `/q` or `/silent`, or
   empty (verified). For opt-in kinds with quotes, use a Windows-style splitter (GOG uses `shlex`).
6. **Exit codes.** Steam accepts only 0, and the VC 2015+ wrappers already map 3010 to 0. Direct
   exes such as 2005-2013 may return 3010 (reboot) or 1638 (newer version present). Steam would
   re-run those on every launch. Recommend treating {0, 3010, 1638} as done for `vcredist` only.
   This is a deliberate small deviation; record it in the plan.
7. **DXSETUP installs native d3dx9/xact/xinput DLLs** into system32 and syswow64. Under Wine that
   flips them from builtin to native, which is the same effect as `winetricks d3dx9`. It is usually
   fine, but it can change audio (xact) behaviour `[ASSUMED]`. DirectX is still auto per the locked
   decision. The log should record the component so a regression can be traced back to it.
8. **Sidecar exit contract.** Every timer is unref'd. Nothing runs at boot: the work happens only
   inside a user-initiated launch, so it is bounded by that.
9. **The `kvsignatures` are not verifiable** by GameLib. Trust comes from the CM-authenticated
   manifest and the per-chunk/file sha1 checks in `downloadDepotFiles`.

## Q6: Integration

- **Call site:** `games.ts` `fireBridgeWineLaunch`, after `applySteamBridgeKnownFixes`
  (`games.ts:3248-3258`) and before `applyBridgeBottleDllOverrides` and the monitor. The monitor's
  `'launching'` supersedes `redist` (`games.ts:3241-3245`). It must come *after* known fixes, so
  that a trusted `registry` fix can pre-write a HasRunKey value and suppress a component (a free
  per-title opt-out). Like the applier, it must **never reject**: wrap it in `.catch` returning
  void, because a rejection reaching the outer catch would `markBridgeFailedThisSession`.
- **Status:** `sendGameStatusUpdate({appName: appId, runner:'steam', status:'redist', context:'vcredist 2022'})`
  per component, during both download and run. This matches `gog/setup.ts:387-392` and
  `bridgeKnownFixes.ts:289-294`. The locale `gamepage.json:386` already renders the context.
- **GOG shape to mirror** (`gog/setup.ts:351-399`): for each declared dependency, look up its
  data, skip what is unknown with a log line, send the `redist` status, then run it in the prefix
  with `wait:false`. GOG has no per-dependency done marker; Steam's HasRunKey supplies one here.
- **Storage (recommend a shared cache):** use `<steamSupportPath>/sharedRedist/steamapps` as
  `targetSteamappsDir`, so files land in `.../steamapps/common/Steamworks Shared/_CommonRedist/...`
  (`steamSupportPath` is `constants.ts:5`). One copy then serves every bottle, where a per-bottle
  layout would hold DirectX's 103 MB ten times. Keep a cache index JSON `{depotId: gid}` beside
  it, and re-download only when the GID changes. The reconcile step would otherwise sha1 100 MB
  per launch. Add an in-process single-flight `Map<depotId, Promise>` so two concurrent bridge
  launches do not write the same files.
- **Idempotence (two layers):**
  1. Authoritative: the HasRunKey value in the bottle, written via `reg add ... /reg:32` after a
     successful run, exactly as Steam does.
  2. Fast path: a ledger file in the bottle dir, `<bottleDir>/gamelib-shared-redists.json`, keyed
     by `HasRunKey|entryName` (lowercased) with the depot GID. When every declared auto entry is in
     the ledger, the step makes zero wine spawns and zero CM calls on later launches. Because the
     ledger lives in the bottle dir, deleting the bottle resets it. Before running an entry that is
     not in the ledger, check the registry with `reg query <key> /v <name> /reg:32` (exit 0 and
     data >= `MinimumHasRunValue`, default 1, means done). That catches marks written by known
     fixes or a manual install.
- **appinfo freshness:** the game's appinfo is fetched fresh at launch, through one PICS call
  wrapped by `withPlanBuildRetry`. Once the ledger covers every declared entry, a cached list of
  declared depots could skip this call. That is optional.

## Validation Architecture

| Property | Value |
|---|---|
| Framework | jest 29 (`package.json:44`) |
| Quick run | `pnpm jest src/backend/storeManagers/steam/bridge/__tests__/sharedRedists.test.ts` |
| Full suite | `pnpm test` |

| Behavior | Test type | File |
|---|---|---|
| Tokenizer keeps duplicate keys, decodes `\\`, is case-insensitive | unit, fixtures from the bodies above | `bridge/__tests__/sharedRedists.test.ts` (Wave 0) |
| Classifier: 2010/2022/DX are auto; .NET 4.8, PhysX msiexec, OpenAL, duplicate keys and missing script are `other` | unit | same |
| Requirement_OS: x64 entry runs on win64, OSType XP entry skipped | unit | same |
| Command building: `%INSTALLDIR%` becomes a `Z:\` path, `.cmd` becomes `cmd /c`, HasRunKey `reg add` argv uses `/reg:32` | unit | same |
| Runner: timeout does not mark done, nonzero code does not mark done, 0/3010/1638 marks done (vcredist), ledger short-circuit makes no `runWineCommand` call | unit with mocked `runWineCommand` | same |
| Opt-in honoured only from bundled/local | unit | `src/backend/__tests__/knownFixes*.test.ts` (extend) |
| `depotfromapp !== '228980'` ignored; ownerAppId `'228980'` passed to key/manifest | unit (mock client) | `steam/__tests__/depot.test.ts` (extend) |
| Live gate: 1363080 or 219990 bridge launch installs VC++/DX, the second launch shows no redist step | manual UAT | — |

Fixtures: the verbatim installscripts are in the scratchpad at
`/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/71bf01b5-7590-4bca-949c-cba23c17cd81/scratchpad/s/vdfs.txt`.
Copy only the bodies into fixtures. Strip or keep `kvsignatures` as wanted, since it is public data.

Tests spawn no binaries, so fake-HOME isolation does not apply. Each `<verify>` must run
`npx prettier --check` over the exact `.ts` paths written. `public/fixes` and `public/locales`
paths are prettier-ignored, so omit the check for those (gamelib-conventions).

## Security Domain

| ASVS | Applies | Control |
|---|---|---|
| V5 Input validation | yes | Installscript is untrusted text. Accept only the auto shape (prefix checks, `.exe`/`.cmd`, simple switch args). `resolveContainedPath` already contains manifest filenames. Pass argv as an array, never a shell string. Reject `"`, CR/LF and NUL in values used for `reg add` (reuse `bridgeKnownFixes.ts` `FORBIDDEN_CHARS`) |
| V4 Access control | yes | The .NET/other opt-in is trusted-only (bundled/local), per decision 6 |
| V6 Crypto | yes | Reuse `depot/crypto.ts`, do not write new AES code |

Threat: a tampered remote known-fixes profile opting into an arbitrary depot. This is mitigated by
`TRUSTED_ONLY_KNOWN_FIX_KEYS`. Threat: path escape via a `process N` value. This is mitigated by
requiring the `%INSTALLDIR%\_CommonRedist\<family>\` prefix and rejecting `..` segments.

## Assumptions Log

| # | Claim | Risk if wrong |
|---|---|---|
| A1 | The authenticated (non-anonymous) client gets 228980 keys/manifests like anonymous did | Low. If it fails, fall back to skip+log. The live gate decides |
| A2 | 5-minute per-process timeout is enough for DXSETUP under CrossOver | Timeout means no mark, so it retries next launch |
| A3 | `cmd /c` runs the VC 2015+ wrappers correctly in Wine | The x64/x86 runtimes do not install. The verify step checks `msvcp140.dll` in system32/syswow64 |
| A4 | Accepting 3010/1638 for vcredist matches intent | At worst the installer re-runs once more |
| A5 | Native d3dx9/xact from DXSETUP do not regress current bridge titles | The ledger and log identify it; a profile can pre-mark HasRunKey to opt out |
| A6 | Bottle Windows version is 10 for OSType checks | Affects only the .NET opt-in |

## Open Questions

1. Should an opt-in id the game does *not* declare be allowed? The recommendation is no, to keep
   the profile from widening the attack surface.
2. Some titles are already installed and declare .NET only (none of the 10 measured do). They get
   nothing, which is correct per the locked decision.

## Sources

- HIGH: anonymous steam-user 5.3.0 probe of 228980 appinfo, all 25 manifests, and installscript
  bodies for 228983/228986/228989/228990/229004/229007/229033 (scratch, 2026-10-25). Game appinfo
  shape checked for 284100/219990/1363080.
- HIGH: https://partner.steamgames.com/doc/sdk/installscripts, https://partner.steamgames.com/doc/features/common_redist
- HIGH (measured): GameLibSteam bottle `logs/runprocess_log.txt` and `system.reg` (Apps\200510 marks), and bridge bottle `cxbottle.conf` and `dosdevices`.
- MEDIUM: https://github.com/360900/tinkergame/wiki/Steam-First-Time-Setup, https://github.com/frostworx/steamtinkerlaunch/wiki/Steamworks-Shared
- Code: `depot.ts:446,541,591,663-730,2319-2339,2690,3373,3561-3680`; `select.ts:166-179`; `bridgeKnownFixes.ts:183-353`; `games.ts:3190-3300`; `gog/setup.ts:333-399`; `launcher.ts:1453-1600`; `knownFixes.ts:103`; `types.ts:1112-1133`.

**Valid until:** 2026-11-24. GIDs and VC 2022 entry names change with Valve updates; the layout and semantics are stable.
