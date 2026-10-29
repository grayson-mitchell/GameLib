---
phase: 56
slug: bridge-steamclient-layer-drm-mode-for-steamstub-titles
status: verified
threats_open: 0
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
created: 2026-10-29
---

# Phase 56 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
>
> Built from the `<threat_model>` blocks of all 34 plans (56-01..56-34) and verified against the
> implementation by four parallel `gsd-security-auditor` runs (plans 01-05, 06-10, 11-15, 16-34).
> Mitigate-disposition threats were verified in code, tests, or (for one-off probes and live gates)
> the committed run record; no new-threat scan was performed.

**Path shorthand in Evidence:** `S` = `src/backend/storeManagers/steam`,
`P` = `.planning/phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles`.

---

## Trust Boundaries

Deduplicated across plans; the plan column is the first plan that declared the boundary.

| Boundary | Description | Plan |
|----------|-------------|------|
| probe script -> `/Applications/CrossOver.app` | Read-only source of the clone; must never be written | 56-01 |
| probe script -> real `~/Library/Application Support/CrossOver/Bottles` | Real user data; holds the user's per-title bridge bottles | 56-01 |
| Wine process output -> probe script | `cmd /c set` and `--verbose` print the operator's whole environment | 56-01 |
| probe children -> real HOME | Spawned tools inherit the profile unless isolated | 56-01 |
| Upstream downloads → build host | Proton tarball (codeload.github.com), CrossOver drop (media.codeweavers.com) and Wine git (gitlab.winehq.org) are untrusted until pinned checks pass | 56-02 |
| NotProton scratch clone → GameLib tree | The overlay text is copied in by hand; upstream is untrusted input | 56-02 |
| Game `steam_api` → lsteamclient trace writer | The `CreateInterface` name and call stream originate in game code inside the Wine process | 56-02 |
| Trace file → sidecar/census (56-12, 56-05) | Lines written here are later parsed as evidence | 56-02 |
| Build host → shipped component | Build-host paths and toolchain output end up in binaries 56-10 publishes | 56-02 |
| NotProton/Proton upstream → GameLib tree | GPL-3 and BSD-3 source text is ported in by hand from a scratch clone at a pinned revision. Upstream is untrusted input. | 56-03 |
| Build host toolchain → component artifacts | mingw-w64 (Homebrew) and zig (pinned, checksum-verified by `downloadZig`) produce binaries that 56-10 pins and ships. | 56-03 |
| Sidecar → helper `steam.exe` (inside Wine) | The helper receives the game command line and env from the sidecar launch (56-12). | 56-03 |
| Helper → game process | Named kernel objects and HKCU keys are visible to the game and to any code in the bottle. | 56-03 |
| launch exe bytes -> routing | `detectDrmWrapper` and the CEG markers come from an untrusted PE. resolveBridgeMode only reads their already-parsed results | 56-04 |
| filesystem and manifest strings -> drmPaths | the manifest version (56-07), the CrossOver `CFBundleVersion` read from Info.plist (56-08), the appId and the launch id become path components | 56-04 |
| failure causes -> app log | error messages carry filesystem and network text into `[bridge-notice]` lines, which `meta/bridgeCensus.ts` and `bridgeVerdict.ts` grep | 56-04 |
| trace file -> sidecar re-log -> app log | The lsteamclient trace file is written inside the game's Wine process, so its contents are untrusted. 56-12 re-logs only canonical lines produced by this plan's parser | 56-05 |
| app log -> census classifier | `gamelib.log*` holds lines from many sources, including game-supplied strings embedded in helper FWD/NOVER payloads | 56-05 |
| census output -> operator | Rows are printed and pasted into plan SUMMARYs (T-51-39: no paths) | 56-05 |
| CrossOver install -> applier | the clone's ntdll.dll comes from the user's CrossOver install, which may be another version or modified | 56-06 |
| build output -> applier | the detour payload comes from 56-03's build or 56-10's downloaded component | 56-06 |
| table -> 56-08 allowlist | the row decides whether DRM mode may patch and launch at all | 56-06 |
| Valve CDN -> sidecar | the manifest text and the 64 MB package arrive over the network and are untrusted until checked | 56-07 |
| manifest fields -> filesystem paths and URLs | `version` becomes a cache directory name, and `file` becomes a URL path segment | 56-07 |
| zip archive -> filesystem | entry names, entry types (symlinks) and uncompressed sizes come from the archive | 56-07 |
| sidecar -> /usr/bin/unzip child | a spawned process that inherits an environment | 56-07 |
| cache dir -> later launches | files on disk under app-support are re-read every DRM launch | 56-07 |
| installed CrossOver -> clone | the source tree is the user's install. It may be another version or a modified rebuild, and it must never be written | 56-08 |
| component cache -> clone | `lsteamclient.{dll,so}` and the detour payload come from 56-10's verified cache and are copied into the runner's `lib/wine` | 56-08 |
| sidecar -> system tools | `cp`, `xattr`, `codesign`, `plutil` and `ps` children inherit an environment | 56-08 |
| runners dir -> later launches | the clone on disk is re-used every DRM launch, and Wine loads code from it | 56-08 |
| clone loader -> unsigned .so | the re-signed loader keeps `disable-library-validation` and gains the dyld entitlement | 56-08 |
| game install tree -> stageDrmBottle | the bottle's install tree is game- and depot-controlled. It may hold symlinks, odd file types and same-named files the game ships itself | 56-09 |
| Valve client cache / component dir -> bottle | 56-07 (manifest sha2) and 56-10 (pinned shas) have already verified these files. This step copies them into the prefix that the game process trusts | 56-09 |
| sidecar -> wine `reg add` (real CrossOver bottle) | registry argv cross into a real-profile Wine process. This is the declared real-profile arm | 56-09 |
| Wine-written user.reg -> idempotency check | text written by Wine, and by anything else running in the bottle, decides whether the reg writes are skipped | 56-09 |
| GitHub release asset -> sidecar | The archive arrives over the network, redirected through GitHub's object store. It is untrusted until checked against the pins in the signed app | 56-10 |
| archive entries -> filesystem | Entry names, types and sizes come from the archive | 56-10 |
| sidecar -> /usr/bin/codesign child | A spawned process that inherits an environment | 56-10 |
| component cache -> later launches and the Wine process | 56-08 and 56-09 copy files from the cache into the runner clone and the bottle, where Wine loads the unsigned `.so` and the PE dll | 56-10 |
| build host -> published component | Build-host paths and toolchain output could leak into the binaries 56-15 publishes | 56-10 |
| licence boundary | Steamworks-licensed binaries beside GPL-3.0-only GameLib code | 56-10 |
| launch input -> orchestrator | appId, bottleName and paths come from games.ts (library state and scan records, which hold game-derived data) | 56-11 |
| orchestrator -> step modules | each step's typed result, including cause strings that may carry filesystem or network text | 56-11 |
| orchestrator -> `pgrep` child | a spawned system binary; env and lifetime cross here | 56-11 |
| bottle.ts registry -> every wine spawn for an appId | a registered runner path decides which binaries run against the user's bottle | 56-11 |
| launch exe bytes -> routing | `.bind` and CEG markers come from an untrusted PE, read through bounded readers | 56-12 |
| step results -> notice and log | causes carry filesystem, network and CrossOver text into `[bridge-notice]` lines and user-visible dialogs | 56-12 |
| sidecar -> wine / helper `steam.exe` | env and argv cross into the Wine process under the user's real profile | 56-12 |
| trace file -> app log | the file is written inside the Wine process (lsteamclient, in the game and helper processes) and re-logged into the log `bridge-census` trusts | 56-12 |
| games.ts -> bottled Steam / session breaker | a failure handled wrongly would silently reroute the next Play | 56-12 |
| launch path -> SteamStub title | after removal, the only route for a `.bind` exe is the DRM branch (56-12); a removal that left a reachable remnant would silently re-enable a known-failing route | 56-13 |
| build output -> signed bundle | everything in `public/bin/<arch>/darwin` ships in the `.app`; a stale forwarder DLL would ship unsigned-by-design PE code with no source in the tree | 56-13 |
| catalogs -> renderer | a hand edit across 97 JSON files can corrupt a catalog that i18next loads at runtime | 56-13 |
| existing user bottles -> DRM launch | bottles carry a Phase 52 forwarder DLL and an `ActiveProcess\SteamClientDll64` value pointing at it | 56-13 |
| game process -> shim exports | a Windows game calls any export the PE shim has, so the export table is the shim's attack surface | 56-14 |
| shim -> helper loopback (CONTROL frames) | any local process holding the secret can send a CONTROL slot. Each slot the helper serves is a way into the genuine native client | 56-14 |
| generator -> committed generated C | the generated shim is reviewed as text, so a hand edit or a drifted generator changes what ships | 56-14 |
| operator build host -> GitHub release | Binaries built on the operator's Mac become a public download. Build-host paths could leak | 56-15 |
| GitHub release -> user's sidecar | The archive is untrusted until checked against the pins in the signed app (56-10) | 56-15 |
| contract author -> gate runner | The contract written here is what 56-16 scores against; an author who also ran it could shape items to fit the run | 56-15 |
| GitHub release -> user's sidecar | The archive 56-15 published is untrusted until the sidecar checks it against the pins in the signed app (56-10) on launch 1 | 56-16 |
| game Wine process -> trace file -> census | Trace contents are written inside the game's process and are untrusted | 56-16 |
| gate captures -> repository | Raw logs may hold account identifiers; only literals and call names are committed | 56-16 |
| diagnostic reg writes -> real bottle | Task 2 and Task 4 mutate a real-profile bottle's local-machine hive | 56-16 |
| gate runner -> gate contract | The runner writes into the contract file it is scored against | 56-16 |
| bottle registry/crash files -> planning doc | user.reg and the minidump hold account-linked data; only named fields may cross into a committed file | 56-17 |
| renderer -> sidecar log | dialog titles cross into gamelib.log via logInfo | 56-18 |
| bottle filesystem -> resolver | Shipping exe paths come from a user-writable bottle tree | 56-19 |
| sidecar process env -> wine env | GAMELIB_DRM_WINEDEBUG crosses into the wine child | 56-20 |
| wine child output -> disk | untrusted game/wine output written to the app-support dir | 56-20 |
| bottle tree -> deletion | file removal driven by paths found in a user-writable bottle | 56-21 |
| operator machine -> committed doc | live captures (process tables, wine logs) hold paths and possibly account data | 56-22 |
| Claude shell -> real bottles | wine/wineserver/kill commands against the user's real bottles | 56-22 |
| sidecar -> OS processes | signals sent to wine processes chosen by command-line match | 56-23 |
| GameLib build -> released component | a rebuilt Steamworks-licensed component crosses into a public release | 56-24 |
| curated fixes -> wine env | per-title env applied to a game process | 56-24 |
| repo -> public GitHub release | a Steamworks-licensed component is published (operator only) | 56-25 |
| operator machine -> committed gate record | live logs and registry copies hold account-linked data | 56-26 |
| sidecar -> webview status channel | status frames drive card state; no untrusted input crosses here | 56-27 |
| game exe bytes (untrusted, from the depot) -> PE scanner | bounded ranged reads only | 56-28 |
| bottle filesystem (game files, symlinks a depot or user can create) -> PE scanner | the scanner must never read outside the bottle | 56-29 |
| test gates -> repo | gates are controls; weakening one hides defects | 56-30 |
| app data trace dir -> disk | logs written by wine children; size grows with failures | 56-31 |
| process env -> sidecar behaviour | GAMELIB_DRM_STAGE_FIRST_TIMEOUT_MS alters stage timing | 56-32 |
| wine session output -> disk | untrusted bytes from wine children written to app data | 56-32 |
| sidecar -> other processes | SIGKILL sweep after a timeout (from 61b5d14ef) | 56-32 |
| live machine state -> committed contract | the contract names paths and literals that touch account-linked data | 56-33 |
| operator machine -> committed gate record | live logs, stage logs and registry copies hold account-linked data | 56-34 |
| GameLib -> other wine sessions | the R1 sweep kills processes of the Ranch bottle | 56-34 |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-56-01-01 | Tampering | `/Applications/CrossOver.app` | mitigate | clone into scratch only; app untouched | closed | One-off probe (scratchpad, uncommitted); evidence = 56-01-SUMMARY.md results `applications_untouched: yes`, line 93 "/Applications/CrossOver.app unchanged" |
| T-56-01-02 | Tampering | User's `GameLibSteamBridge-*` bottles | mitigate | name guard, cp -c copy, source untouched | closed | 56-01-SUMMARY.md:61 (source bottle never spawned against, .update-timestamp mtime 1792784335 unchanged), :62 no GameLibSteamBridge-* written (run artifact) |
| T-56-01-03 | Information disclosure | Env dumps from `cmd /c set` / `--verbose` | mitigate | parse in memory, no raw dump in results | closed | 56-01-SUMMARY.md:62 "results file holds no raw env dump and no home path" (run artifact) |
| T-56-01-04 | Information disclosure | Clone-stage spawns inherit real HOME | mitigate | fake-HOME env for clone-stage children | closed | 56-01-SUMMARY.md:80 clone stage used fresh createFakeHomeProfile() for every child |
| T-56-01-05 | Information disclosure | Bottle-stage spawns use the real profile | accept | declared real-profile arm | closed | Plan rationale; 56-01-SUMMARY.md:80 records the declared real-profile arm |
| T-56-01-06 | Denial of service | Leftover clone or probe bottles filling disk | mitigate | cleanup stage, verify zero | closed | 56-01-SUMMARY.md:62 "zero GameLibProbe5601* bottles remain, clone dir removed", :93 |
| T-56-01-07 | Tampering | `cxbottle --delete --force` hitting the wrong bottle | mitigate | name guard, only probe constants | closed | 56-01-SUMMARY.md:61-62 (no GameLibSteamBridge-* touched, mtime unchanged); guard itself lived in uncommitted scratch script, so evidence is the run artifact |
| T-56-01-08 | Elevation of privilege | Running a copied Mach-O loader from `/private/tmp` | accept | byte-identical notarized clone, deleted at cleanup | closed | Plan rationale; SUMMARY: codesign --verify --strict returned 0 on clone binaries; clone removed |
| T-56-02-01 | Tampering | Proton lsteamclient source | mitigate | tree digest, lstat symlink refusal | closed | meta/buildLsteamclient.ts:51 (pin b286df1d...657bf), :120-125 digest, :500-512 walkTree lstat refuse symlink/non-regular, :647-651 mismatch throws; test `lsteamclientTreeDigest` in meta/__tests__/buildLsteamclient.test.ts |
| T-56-02-02 | Tampering | CrossOver drop / Wine tree | mitigate | pinned size+sha256, only sources/wine, rev-parse pin, allowlisted https | closed | buildLsteamclient.ts:347-365 ALLOWED_HOSTS/isAllowedSourceUrl, :467-493 download sha+size check and post-redirect re-check (:479), :683 pinned download, :695 only sources/wine, :715-720 rev-parse HEAD must equal 2df1ee28; test `isAllowedSourceUrl` |
| T-56-02-03 | Tampering | Overlay files | mitigate | sha-pinned overlays, strip-to-upstream | closed | buildLsteamclient.ts:657-670 license/overlay sha re-check with stripGameLibTraceBlocks; tests `stripGameLibTraceBlocks` ("strips committed file back to upstream sha"), `verbatim overlay` |
| T-56-02-04 | Spoofing | Trace lines (D-15/D-16 evidence) | mitigate | role/appId fixed in DllMain, iface validated, ISteam* names only | closed | native/steam-bridge/steamclient-layer/lsteamclient/steamclient_main.c:81,108-125 (role from steam.exe basename, SteamGameId), :191-192 (len<=64, charset check else "invalid"), :210 ISteam-only call names; drmTrace.ts:63-65 grammar re-validates |
| T-56-02-05 | Denial of Service | Trace writer in the game's hot path | mitigate | fixed dedupe table, caps, single WriteFile, disable on open failure | closed | steamclient_main.c:75-77 (64 names / 256 lines / 512 slots), :128-147 single WriteFile per line, :142 INVALID_HANDLE_VALUE disables tracing |
| T-56-02-06 | Elevation of Privilege | Unsigned `lsteamclient.so` | mitigate | gate requires "not signed at all"; not placed in build/bin | closed | buildLsteamclient.ts:326 gate, :15-16 header (never signed, never in build/bin/public/bin); test `checkLsteamclientOutputs` |
| T-56-02-07 | Information Disclosure | Build-host paths in shipped binaries | mitigate | -ffile-prefix-map, gate for homedir | closed | buildLsteamclient.ts:222,266 file-prefix-map; :333-345 gate fails on homeDir in pe/so and work-dir in otool -L (homedir() at :584) |
| T-56-02-08 | Information Disclosure | Build spawns inheriting real HOME | mitigate | fresh createFakeHomeProfile per spawn, disposed | closed | buildLsteamclient.ts:406-436 (createFakeHomeProfile, profile.dispose() in finally); test `source gates` "uses fake-HOME spawns" |
| T-56-02-09 | Repudiation | Licence separation (D-02) | mitigate | PINS.md licence statement, LICENSE sha pin, no GPL object linked | closed | lsteamclient/PINS.md:9-12 (LICENSE sha 80fda914..., single-licensed D-02); buildLsteamclient.ts:657 licence sha check; test `unix argv` link argv |
| T-56-02-SC | Tampering | Homebrew `mingw-w64`, `bison` | mitigate | official core formulae, build host only | closed | buildLsteamclient.ts:14-15,627 brew prerequisites; no workflow references (grep of .github and buildSteamBridgeShims.ts empty) |
| T-56-02-10 | Tampering | Release CI picking up a non-reproducible native build | mitigate | no CI/shim-build reference | closed | grep for buildLsteamclient/build:lsteamclient/buildDrmNativeParts in .github and meta/buildSteamBridgeShims.ts returned nothing; test `is unreachable from the shim build and CI` |
| T-56-03-01 | Tampering | Ported detour sources / payload | mitigate | payload sha256 pin, delete on mismatch | closed | meta/buildDrmNativeParts.ts:97 pin e35b8344...1bfb, :210-218 checkPayloadSha, :321-324 unlinkSync + throw on mismatch |
| T-56-03-02 | Tampering | Wrong ntdll patched with this payload | mitigate | per-build rows, unknown build throws | closed | buildDrmNativeParts.ts:78 DETOUR_BUILD_ROWS, :290-291 throws "Unknown CrossOver build" |
| T-56-03-03 | Elevation of Privilege | Helper registry writes | mitigate | HKCU only | closed | helper/steam.c:84-90 only HKEY_CURRENT_USER; grep for HKEY_LOCAL/HKLM in steam.c = 0 matches |
| T-56-03-04 | Spoofing | Helper reaching Steam on the game's behalf | mitigate | helper writes no trace; role by basename | closed | helper/steam.c:14-15 (fixed steam.exe name, no trace lines; grep finds no drm-trace writer); steamclient_main.c:123 role=helper for steam.exe |
| T-56-03-05 | Tampering | Helper argv injection | mitigate | verbatim CreateProcessW, digits-only SteamGameId, refuse -applaunch/steam:// | closed | helper/steam.c:134-135 fail(...,3), :137-142 SteamGameId length<=10 + digit loop, :180 CreateProcessW(NULL, cmdline...) no shell |
| T-56-03-06 | Information Disclosure | Build-tool spawns inheriting real HOME | mitigate | fresh fake HOME per spawn | closed | buildDrmNativeParts.ts:235-253 spawnArgvIsolated (createFakeHomeProfile + dispose) |
| T-56-03-07 | Repudiation / Tampering | Unattributed upstream code | mitigate | origin repo/sha/licence headers, COPYING/LICENSE | closed | helper/steam.c:2-8 and ntdll-patch/detour.c header (NotProton commit 8db22adb..., licence); files ntdll-patch/COPYING and helper/LICENSE present |
| T-56-03-SC | Tampering | Homebrew `mingw-w64`; PyPI `capstone` | mitigate | capstone not installed; resolve.py not in package.json/CI | closed | grep capstone/ntdllResolve in package.json and .github: no references; meta/ntdllResolve/README.md documents developer procedure |
| T-56-03-08 | Denial of Service | DIPC/CEG responder | accept | excluded by design (D-07) | closed | Plan rationale; helper/steam.c:18-20 states responder thread excluded |
| T-56-04-01 | Tampering | drmPaths.ts getters | mitigate | anchored regexes + relative() containment, null on invalid | closed | drm/drmPaths.ts:17-21 regexes, :37-40 contained(), :44-48 control-char/absolute check; tests in __tests__/steamclientLayerMode.test.ts (roots, rejects bad appFolder, valveClientDir, runnerDir, component id, traceFile) |
| T-56-04-02 | Spoofing | formatDrmNoticeLine / formatBridgeDrmAnchor | mitigate | cause normalised and tokenised; anchor regex validation | closed | drm/steamclientLayerMode.ts:87,104 (cap 160, whitespace collapse), :127-130 token charset; :150-162 anchor regexes; test "a hostile cause cannot inject a second line", "rejects malformed fields" |
| T-56-04-03 | Elevation of Privilege | resolveBridgeMode | mitigate | CEG -> tcp; unknown -> tcp | closed | steamclientLayerMode.ts:36-38; tests 'a CEG-marked steamstub exe stays on tcp', 'none, undefined and unknown values stay on tcp' |
| T-56-04-04 | Information Disclosure | drmStepError cause text | accept | paths already in existing logs; logSecretGate backstop | closed | Plan rationale |
| T-56-04-05 | Repudiation | DrmStep vocabulary | mitigate | closed nine-member union + isDrmStep | closed | steamclientLayerMode.ts:47-66 DRM_STEPS/isDrmStep, :75 drmNoticeReason; tests 'DRM_STEPS is the fixed nine-member setup order', 'isDrmStep accepts members and rejects everything else' |
| T-56-05-01 | Spoofing | `extractDrmEvidence` / `drmAppLogSegmentFor` | mitigate | anchored grammar, payload-start only, appId match | closed | drm/drmTrace.ts:63-72 anchored ^...$ regexes, :176 header strip; tests 'is unanchored without an anchor payload at line start', 'does not anchor another appId', 'requires the relog prefix and a matching appId'; meta test 'does not accept a forged anchor embedded in a helper line' |
| T-56-05-02 | Spoofing | helper vs game attribution (Pitfall 10) | mitigate | only role=game counts; helper-only; pid conflict | closed | drmTrace.ts:217-227 helper counted separately, pidConflict; tests 'counts helper-only lines separately', 'flags a game pid equal to a helper pid'; meta bridgeCensus tests (helper-only unverified, pid conflict) |
| T-56-05-03 | Denial of Service | `parseDrmTraceFile`, `extractDrmEvidence` | mitigate | byte/line/char caps before regex, bounded quantifiers | closed | drmTrace.ts:24-26,80,126,153,162,197,211,216; tests 'stops after the line cap', 'reports oversize for an over-long file' |
| T-56-05-04 | Information Disclosure | `[bridge-drm] trace=<path>` holds a HOME path | mitigate | path never placed in detail/row | closed | meta/__tests__/bridgeCensus.test.ts:1870 'never puts a path in a DRM-branch detail (T-51-39)' |
| T-56-05-05 | Tampering | false "verified" from init-only plumbing | mitigate | exclude ISteamClient_*, SetMinidumpSteamID | closed | meta/bridgeCensus.ts:1069-1073 filter |
| T-56-05-06 | Elevation of Privilege | meta bundle pulling backend graph | mitigate | drmTrace.ts zero imports | closed | `grep -c '^import' drmTrace.ts` = 0; test 'has no import or require' (drmTrace.test.ts:176); bridgeCensus.ts:129 relative import |
| T-56-05-07 | Spoofing | game code writing its own lines into the trace file (same process as lsteamclient) | accept | low value diagnostic, not authz | closed | Plan rationale |
| T-56-06-01 | Tampering | applyNtdllPatch input | mitigate | size/sha, stolen-byte, patched-sha pins | closed | src/backend/storeManagers/steam/bridge/drm/ntdllPatch.ts:28-37,86-87,109-110; ntdllPatch.test.ts 'refuses every mismatch with a distinct reason' |
| T-56-06-02 | Denial of Service | PE parsing | mitigate | bounds checks + try/catch | closed | ntdllPatch.ts:27 try, :48-60 bounds, :113 catch; test 'refuses truncated or malformed PEs without throwing' |
| T-56-06-03 | Tampering | detour payload | mitigate | payload sha pin + size cap | closed | ntdllPatch.ts:36-41 |
| T-56-06-04 | Elevation of Privilege | allowlist | mitigate | build AND clean sha; unlisted null -> unsupported-crossover | closed | ntdllPatchTable.ts:48-57 (hasOwn + sha compare); runnerClone.ts:333-340 maps null to fail (unsupported-crossover, :275) |
| T-56-06-05 | Tampering | user's CrossOver install | mitigate | applier pure; applied only to clone | closed | ntdllPatch.ts has no fs writes (grep empty); runnerClone.ts:979-1000 patches dest (clone) only |
| T-56-07-01 | Tampering | package download | mitigate | https/host allowlist, maxRedirects 0, size+sha2, temp dir | closed | valveClient.ts:74-105 isAllowedValveUrl, :264,:282 maxRedirects 0, :60 cap, :627-637 size+sha2 check, :592 mkdtemp; valveClient.test.ts |
| T-56-07-02 | Tampering | zip extraction (zip slip) | mitigate | explicit entry names, listing cap, lstat, exact set | closed | valveClient.ts:644-675 (parseListing, explicit VALVE_CLIENT_DLLS, readdir exact-set, lstat), :651 fresh dir; hostile/symlink/missing fixtures present |
| T-56-07-03 | Tampering | manifest parse (prototype pollution, type coercion) | mitigate | forbidden keys, own-prop, regexes | closed | valveClient.ts:64-67,132,145-193; test 'refuses a %s block key and does not pollute Object.prototype' (:121) |
| T-56-07-04 | Spoofing | compromised CDN manifest | accept | D-04 manifest is trust root; kvsignatures unverified; TLS+allowlist bound it | closed | Recorded in module header valveClient.ts:6-8 (Pitfall 9) |
| T-56-07-05 | Information Disclosure | /usr/bin/unzip spawn | mitigate | createFakeHomeProfile().childEnv(), dispose in finally | closed | valveClient.ts:313,326,351 |
| T-56-07-06 | Denial of Service | download, unzip, sidecar exit | mitigate | caps, unref'd deadlines, abort registration, SIGKILL | closed | valveClient.ts:58-62,241-243,331-345,364-392 (createAbortController/deleteAbortController), :342 SIGKILL |
| T-56-07-07 | Tampering / Elevation of Privilege | cache dir symlink or edited DLL | mitigate | lstat real dirs, re-hash each launch, 0700/0600 wx | closed | valveClient.ts:434-480 (lstat + sha re-hash), :536-537 root lstat, :651,:685-686 modes/wx |
| T-56-07-08 | Tampering | supply chain | accept | no new npm pkg; system unzip | closed | plan rationale; imports in valveClient.ts are only frozen-stack deps + node built-ins |
| T-56-08-01 | Tampering | the user's CrossOver install | mitigate | source only as cp arg; writes inside runnersRoot; no /Applications literal | closed | runnerClone.ts: no '/Applications' literal (grep); tests 'keeps every spawn argument inside the runners root except the cp source' (:551), 'does not write to the installed CrossOver' (:569) |
| T-56-08-02 | Tampering | wrong ntdll patched | mitigate | allowlist, re-hash clone ntdll, patched sha checks | closed | runnerClone.ts:333-340, :970-1002 (clean sha, patchedSha before and after write) |
| T-56-08-03 | Tampering / Elevation of Privilege | symlink or TOCTOU in the runners dir | mitigate | lstat root, chmod 0700, mkdtemp partial + rename, wx/EXCL, safeRemove | closed | runnerClone.ts:890-897,1018,1060,1153, :448-465 safeRemove (containment, lstat, REMOVABLE_RE), :215 source regular-file check |
| T-56-08-04 | Denial of Service | removing a clone a game is running from | mitigate | ps scan; ps failure = in use | closed | runnerClone.ts:688-694 psListing (null on failure), :794-799 in-use refuses with runner-clone; test 'refuses to replace a tampered clone that is in use' (:950) |
| T-56-08-05 | Elevation of Privilege | unsigned `lsteamclient.so` loaded by the re-signed loader | mitigate | header doc, codesign -dv must be unsigned, 0700 root, re-hash per launch | closed | runnerClone.ts:26-28 header, :1036-1046 codesign check, :890-895, verifyRunnerClone re-hash (:~600-690, tests :807-919) |
| T-56-08-06 | Elevation of Privilege | entitlement injection on re-sign | mitigate | exact five stock keys, plist from constants, post-sign check | closed | runnerClone.ts:376-385,512,1063-1071,1096; test 'the entitlements plist holds the five stock keys plus dyld' (:616) |
| T-56-08-07 | Information Disclosure | tool spawns | mitigate | fake HOME env, 5 allowlisted tools | closed | runnerClone.ts:60-75,120-130,182; 'tool not allowed' test (:295) |
| T-56-08-08 | Denial of Service | sidecar exit / hung tools | mitigate | unref'd SIGKILL deadlines, abort id, sweep | closed | runnerClone.ts:95-101,151-171,904-905,855-865 |
| T-56-08-09 | Tampering | clone edited between launches | mitigate | per-launch verify, rebuild or refuse if in use | closed | runnerClone.ts:790-815 + verifyRunnerClone; tests :830,:843,:851,:911,:919,:937 |
| T-56-08-10 | Tampering | supply chain | accept | no new package; system binaries | closed | plan rationale; tool allowlist runnerClone.ts:60-75 |
| T-56-09-01 | Tampering / EoP | `.gamelib-orig` swap | mitigate | lstat, probeOriginalBackup, re-read shim bytes before rename, all-or-nothing | closed | stageDrmBottle.ts:326-395; tests 'refuses a symlinked live path', 'refuses a symlinked backup', 'all-or-nothing' (:299-358) |
| T-56-09-02 | Tampering | file staging into Program Files (x86)\Steam | mitigate | real dirs, realpath containment, dest symlink refusal, EXCL tmp + rename, MZ source | closed | stageDrmBottle.ts:496-516,772-790,833-865; tests :630,:649,:657,:662 |
| T-56-09-03 | EoP | registry writes | mitigate | HKCU constants only, no HKLM, data validation | closed | stageDrmBottle.ts:93-94,113-120; no HKLM/HKEY_LOCAL in source (grep); test :169-171 |
| T-56-09-04 | Tampering | deleting a game-shipped steamclient64.dll | mitigate | delete only marked forwarder <=4MiB; cfg unlink only | closed | stageDrmBottle.ts:436-490; tests :393,:399,:427 |
| T-56-09-05 | Tampering | overwriting a real Steam client in the bottle | mitigate | refuse on steamui.dll | closed | stageDrmBottle.ts:787-791; test 'refuses a bottle holding a Steam client' (:639) |
| T-56-09-06 | Spoofing | forged user.reg causing reg writes to be skipped | accept | same-user out of scope ASVS L1; helper rewrites values | closed | plan rationale |
| T-56-09-07 | Information Disclosure | spawns inheriting the real HOME | accept | declared real-profile arm via runWineCommand | closed | documented in stageDrmBottle.ts:21-23; runWineCommand import :46 |
| T-56-09-08 | DoS | a reg add that hangs | mitigate | unref'd 15 s timer race, clearTimeout in finally, wait:false | closed | stageDrmBottle.ts:85,713-731,928; test 'times out a reg add and clears its timer' (:688) |
| T-56-10-01 | Tampering | component asset substituted on the release page or CDN | mitigate | archive sha+size pinned in app; post-extract re-verify; atomic rename | closed | steamclientLayerInstall.ts:372-408 (size/sha pin, verifyComponentDir on temp dir), :438 rename; tests assert empty root (:241,:261,:314,:360) |
| T-56-10-02 | Tampering | archive extraction (path traversal, links, bombs) | mitigate | strict readOverlayTarGz, regular files only, caps, wx | closed | knownFixOverlayArchive.ts:123 (maxOutputLength), :146-148 typeflag '0' only; steamclientLayerInstall.ts:386-399 |
| T-56-10-03 | Elevation of Privilege | unsigned `lsteamclient.so` loaded by the clone's loader | mitigate | codesign --remove-signature + rehash, 0700 root, per-launch verify, documented | closed | steamclientLayerInstall.ts:20-23,340-348,408-418; THIRD-PARTY-NOTICES.md:103-161 |
| T-56-10-04 | Tampering | cached component edited or symlinked | mitigate | real-dir lstat, exact file set, rehash per launch | closed | steamclientLayerInstall.ts:238-268 verifyComponentDir, :341-346 root lstat |
| T-56-10-05 | Information Disclosure | /usr/bin/codesign spawn | mitigate | fake HOME env, dispose in finally | closed | steamclientLayerInstall.ts:160,198 |
| T-56-10-06 | Denial of Service | download, codesign, sidecar exit | mitigate | unref'd 300 s deadline, abort id, SIGKILL 30 s, inFlight dedupe | closed | steamclientLayerInstall.ts:52-53,189-192,209-232,329,358,511-516 |
| T-56-10-07 | Tampering | catalogue entry pointing elsewhere | mitigate | checkEntry repo/tag/URL/file set/pins before fetch | closed | steamclientLayerInstall.ts:272-305, :500 called pre-fetch |
| T-56-10-08 | Information Disclosure | build-host paths in published binaries | mitigate | refuse files containing homedir bytes; NOTICE /Users/ check | closed | meta/buildSteamClientLayerArchive.ts:124,174-175,286-292; steamclientLayerNotice.test.ts:227 ('leaks nothing') |
| T-56-10-09 | Repudiation | licence separation (D-02) | mitigate | NOTICE, THIRD-PARTY-NOTICES, sha table test, no-reference gates | closed | THIRD-PARTY-NOTICES.md:103-163; steamclientLayerNotice.test.ts:201,220,476-481 (workflow gate), :365+ |
| T-56-10-SC | Tampering | supply chain | accept | no new package; system codesign | closed | plan rationale |
| T-56-11-01 | Tampering / EoP | bottle.ts `setDrmBridgeRunner` / `drmRunnerWineInstallation` | mitigate | isValidDrmRunner: absolute cxRoot regex, build match, exact join() paths, control chars rejected | closed | S/bottle.ts:1444-1480 (DRM_RUNNER_CXROOT_RE, isValidDrmRunner), :1492 (null on invalid), :1526-1531 (throw), :1563 (setDrmBridgeRunner false) |
| T-56-11-02 | Information disclosure | drmLaunchSetup `isMacSteamRunning` pgrep spawn | mitigate | createFakeHomeProfile().childEnv(), dispose in finally | closed | S/bridge/drm/drmLaunchSetup.ts:178-206; test drmLaunchSetup.test.ts:508-515 (HOME != real HOME) |
| T-56-11-03 | Denial of service | pgrep probe and the session stop | mitigate | unref'd child+timer, SIGKILL deadline, 15 s end-session bound, inFlight dedupe | closed | drmLaunchSetup.ts:84,160,187-196,421,518-525; bottle.ts:1891 endPerGameBridgeBottleSession (timeoutMs -> killBottleWineServer) |
| T-56-11-04 | Tampering | wineserver mixing between runners | mitigate | end per-game session before registering new clone; per-game-only guard | closed | drmLaunchSetup.ts:410-427; bottle.ts:1897-1910 (bridgeBottleNameFor + guardPerGameBridgeBottleName, drmRunnerBinDir) |
| T-56-11-05 | Spoofing | log and notice injection via step causes | mitigate | causes from drmStepError (normalised); module writes no notice tokens | closed | S/bridge/drm/steamclientLayerMode.ts:110; drmLaunchSetup.test.ts:561-585 source gate (no [bridge-notice]/[bridge-drm]/[drm-trace]) |
| T-56-11-06 | Information disclosure | progress context | mitigate | only two constant strings | closed | drmLaunchSetup.ts:76-79 DRM_PROGRESS_CONTEXT, used at :260,271,282 |
| T-56-11-07 | Tampering | unnecessary network fetch for a non-.bind title | mitigate | resolveBridgeMode gate first -> not-applicable | closed | drmLaunchSetup.ts:492-502, 560-563 |
| T-56-11-08 | Elevation of privilege | reroute into bottled Steam or the Phase 52 forwarder on failure | mitigate | no fallback; source gate | closed | drmLaunchSetup.test.ts:575-583 (tellBottledSteamTo, markBridgeFailedThisSession, steamClientSetup) |
| T-56-11-09 | Spoofing | a local process named `steam_osx` satisfies the Mac Steam check | accept | single-user desktop, no privilege gained | closed | plan rationale: fake process only lets setup proceed to a launch that fails inside lsteamclient |
| T-56-11-10 | Tampering | unsigned lsteamclient.so trust widening | transfer | owned by 56-08 and 56-10 | closed | transfer documented in 56-11-PLAN threat_model; routes to verified runner (drmLaunchSetup.ts:260-282 steps) |
| T-56-12-01 | Spoofing | trace re-log into the app log (census evidence) | mitigate | only parse-valid, this-appId events re-logged canonically behind drmRelogPrefix; others counted rejected | closed | S/games.ts:1041-1075 relogDrmTrace; S/bridge/drm/drmTrace.ts:143-175 (appId filter, rejected++), :203-210 evidence only after anchor + prefix |
| T-56-12-02 | Tampering | trace file read (symlink / TOCTOU) | mitigate | lstatSync throwIfNoEntry:false, non-regular refused; trace dir 0700 + symlinked dir refused | closed | games.ts:1058-1060, 990-1005 (mkdir 0o700, lstat isDirectory, chmod); games.test.ts:10996,11047 |
| T-56-12-03 | Denial of service | oversize or flooding trace | mitigate | MAX_DRM_TRACE_BYTES, line caps, relog once, retention 8 | closed | games.ts:1061; drmTrace.ts:24,153,163-167; games.ts:4262-4267 relogOnce; DRM_TRACE_KEEP_PER_APP retention at games.ts:~1010-1030 |
| T-56-12-04 | Spoofing | log and notice injection via step causes | mitigate | formatDrmNoticeLine tokenises, appId=invalid; dialog uses normalised cause | closed | steamclientLayerMode.ts:120-130; games.ts:3650-3680 (maybeNotifyDrmModeFailed) |
| T-56-12-05 | Tampering | env/argv injection into the wine launch | mitigate | absolute control-free paths, ':' and "'" rejected, key replacement, array argv | closed | games.ts:737-880 (pathFields check, includes(':'), CX_ENV quote check, setKey replace) |
| T-56-12-06 | Elevation of privilege | reroute to bottled Steam or the Phase 52 forwarder on failure | mitigate | DRM branch returns before forwarder; no markBridgeFailed/setupRequired | closed | games.ts:3925-3950, 4236-4245 (reportLaunchFailure drm branch), maybeNotifyDrmModeFailed docs :3640-3650; games.test.ts DRM re-entry tests |
| T-56-12-07 | Tampering | wrong runner joins the bottle's wineserver | mitigate | restore clone wineVersion; re-read settings on not-applicable | closed | games.ts:4358-4375, 3927-3931 |
| T-56-12-08 | Elevation of privilege | registry overrides channel writes HKLM | mitigate | HKCU only; 30 s unref'd timer | closed | games.ts:834-848 (HKEY_CURRENT_USER), 4410-4425 (DRM_REGISTRY_TIMEOUT_MS, timer.unref); games.test.ts:10776-10785 asserts no HKLM |
| T-56-12-09 | Information disclosure | real HOME in the wine launch | accept | declared real-profile arm; no new HOME literal | closed | plan rationale; trace holds only appId/pid/role/call names (drmTrace parse schema) |
| T-56-12-10 | Tampering | CEG exe entering DRM mode | mitigate | CEG markers read before drmLaunchSetup; resolveBridgeMode -> tcp | closed | games.ts:3895-3912; games.test.ts:11322,11363 |
| T-56-12-11 | Spoofing | a planted `steamclient.dylib` at the Mac Steam path | accept | user's own Mac Steam install, same trust as TCP bridge | closed | plan rationale |
| T-56-13-01 | Elevation of privilege | fallback to the Phase 52 forwarder or bottled Steam on a DRM failure | mitigate | forwarder module + callers deleted | closed | native/steam-bridge/steamclient and S/bridge/steamClientSetup.ts absent; meta/__tests__/buildSteamBridgeShims.test.ts:582-595 (forwarder removed); no steamClientSetup import in src |
| T-56-13-02 | Tampering | stale `steamclient64.dll` shipped in a local bundle | mitigate | stale DLL deleted; build code no longer compiles it | closed | public/bin/*/darwin/steamclient64.dll absent (checked); buildSteamBridgeShims.test.ts:592-593 |
| T-56-13-03 | Tampering | catalog corruption during the 97-file key removal | mitigate | scripted edit + verify gates | closed | all public/locales/*/gamelib.json and gamelib.mt.json parse (JSON.parse loop, no failures); one-off script, run artifact = 56-13-SUMMARY |
| T-56-13-04 | Repudiation | presence baseline drift hiding a lost DRM key | mitigate | tool-regenerated baseline retains drm keys | closed | meta/i18nCatalogPresenceBaseline.json:1108 steam.bridge.drm.title, :608,658,708 steam.bridge.drm.* |
| T-56-13-05 | Tampering | stale forwarder DLL and registry value in existing user bottles | transfer | 56-09 stageDrmBottle deletes forwarder (UTF-16LE marker) + rewrites SteamClientDll64 | closed | S/bridge/drm/stageDrmBottle.ts:100-104,124,174,201,410-485 |
| T-56-13-06 | Denial of service | removal breaks the release `build-steam-bridge` job | mitigate | main keeps 4 steps; no new tool deps | closed | buildSteamBridgeShims.test.ts:598-612 (main-body test); no mingw/bison in .github |
| T-56-13-07 | Information disclosure | real HOME leaked into spawns | accept | deletes spawn sites, adds none | closed | plan rationale; forwarder reg-add spawn gone |
| T-56-14-01 | Elevation of privilege | helper CONTROL slot 3 (native SteamInternal_CreateInterface probe) | mitigate | handler + dlsym deleted; slot retired, never reuse | closed | native/steam-bridge/helper/bridge_helper.c:138-139,206 (no CreateInterface remaining); protocol.ts retired marker; helperIntegration.test.ts:447-532 asserts STATUS_ERR and no FWD CreateInterface |
| T-56-14-02 | Spoofing | x64 SteamClient stubs answering for a client that does not exist | mitigate | x64 compiles local answers only; tests pin | closed | meta/__tests__/gen_vtables.test.ts:2281-2345 (x64Slice not.toContain bridge_transact, WR-09 off-path); shimCoverage.test.ts:296 |
| T-56-14-03 | Tampering | regenerated artifacts drifting from the generator | mitigate | artifacts from pnpm gen-vtables; committed-file tests; .def unchanged | closed | package.json gen-vtables; gen_vtables.test.ts reads committed shim (:2270-2345); generated/ files present |
| T-56-14-04 | Denial of service | persisted scan verdicts after the export-set change | mitigate | stale stamp never changes isScanVerdictNowCovered | closed | shimCoverage.test.ts:363-410 |
| T-56-14-05 | Information disclosure | FWD CreateInterface log of game-controlled interface names | mitigate | log site removed with slot | closed | bridge_helper.c has no CreateInterface; helperIntegration.test.ts:532 |
| T-56-14-06 | Repudiation | removed code still reachable from the 52-01 x86 wire branch and helper SteamClient dispatch | accept | no x86 export returns ISteamClient; named follow-up | closed | 56-14-SUMMARY.md:81 follow-up recorded |
| T-56-14-07 | Information disclosure | real HOME in test spawns | mitigate | only existing fake-HOME helper spawn | closed | helperIntegration.test.ts uses profile.root (fake HOME profile, :448) |
| T-56-15-01 | Tampering | published component asset | mitigate | publish gated on approval; sha256/size vs catalogue; SHA256SUMS; no --clobber | closed | run artifact 56-15-SUMMARY.md:15,31 (pinned: match, fresh download equals archiveSha256/Size); independently: shasum -c SHA256SUMS OK in build/steamclient-layer/release-cx26.3.0.39832; src/common/steamclientLayerCatalogue.ts:92-94 pins match |
| T-56-15-02 | Information Disclosure | build-host paths in published files | mitigate | grep -rlF "$HOME" over staging prints nothing | closed | independently re-run: grep -rlF "$HOME" on release dir and extracted archive (incl. /Users/graysonmitchell, binary mode) prints nothing; plan verify 56-15-PLAN.md:218 |
| T-56-15-06 | Repudiation | publishing without consent | mitigate | signal text quoted in run record | closed | 56-15-SUMMARY.md:40-43 (operator "Push main, then publish" / "done release resume 56-15"; operator published by hand) |
| T-56-15-09 | Repudiation | contract authored and run by the same plan | mitigate | D-E; header "Run by: plan 56-16" | closed | 56-15-LIVE-GATE.md:4-9 ("Run by: plan 56-16", D-E); commit 3e0f07035 authoring, 56-16 commits fill results |
| T-56-15-03 | Information Disclosure | gate captures (gamelib.log, trace, system.reg) | mitigate | raw captures stay in /tmp, never committed | closed | 56-16-SUMMARY (D-E/captures in session dir); contracts 56-15/25/33 state literals-only; no tracked gamelib-gate/system.reg/user.reg/.dmp files in git; no 17-digit SteamID or persona patterns in any 56-1x..3x gate/summary/diagnosis file (grep) |
| T-56-15-04 | Spoofing | forged trace lines giving a false "verified" | mitigate | verdict only from `pnpm bridge-census` anchored, role-tagged, size-capped parser | closed | package.json:76 `bridge-census`; meta/bridgeCensus.ts:833 anchored matcher, :934 payload-anchored, :1276 MAX_APP_LOG_BYTES; 56-16-SUMMARY items 5/6 (role=game pid, no role=helper) |
| T-56-15-05 | Elevation of Privilege | HKLM diagnostic leaving keys that divert games into `steam.exe -applaunch` (spike 036) | mitigate | armed on failure, run once, deleted, system.reg grep 0 | closed | 56-16-SUMMARY "Item 11 outcome": keys deleted, 0 InstallPath / 0 bare Valve\Steam lines; run-record artifact (plan-time procedural) |
| T-56-15-07 | Tampering | stale sidecar running old code during the gate | mitigate | PC6 checks sidecar.js mtime, greps drmLaunchSetup / no setupSteamClientForwarder | closed | 56-15-LIVE-GATE.md:41 (PC6 command); 56-25-SUMMARY / 56-33-SUMMARY preflight record PC4 sidecar.js newer than newest backend commit |
| T-56-15-08 | Elevation of Privilege | unsigned `lsteamclient.so` | accept | inherited from 56-10 T-56-10-03 (0700 dir, pinned sha, re-verified each launch); item 1 records codesign "not signed at all" | closed | 56-10-PLAN.md T-56-10-03; 56-15-LIVE-GATE.md item 1 (codesign); 56-16-SUMMARY item 1 pass |
| T-56-16-01 | Tampering | runner editing the contract it is scored against (D-E) | mitigate | only result:/Run record/Gaps/Verdict/item-6 pin edited; diff stat recorded | closed | 56-16-SUMMARY "D-E handling" (git diff --stat 7909f4612: 50+/13-); re-verified here: Sections 1-4 of 56-15-LIVE-GATE.md identical between 7909f4612 and 36539c9e4 (diff empty); no later commit touches the 56-15 contract |
| T-56-17-01 | Information disclosure | 56-17-DIAGNOSIS.md | mitigate | quote only four DRM reg values + log lines; acceptance greps | closed | 56-17-SUMMARY "Threat Flags: None ... acceptance greps print nothing"; re-grep of 56-17-DIAGNOSIS.md for 17-digit IDs/persona/account patterns: no hits |
| T-56-17-02 | Tampering | live bottles | accept | read-only commands only, no wine process started | closed | 56-17-SUMMARY (desk-only, evidence source gone, no product code touched); no code change in plan |
| T-56-18-01 | Tampering (log injection) | DialogHandler confirmation line | mitigate | CR/LF stripped, 120-char cap before logInfo | closed | Superseded design: 509bcb01b replaced the planned title log with an ackId round-trip. No dialog title/text reaches the log: S/games.ts:3678 and :3690 log only `appId`, `elapsedMs`, `display=...`; src/backend/dialog/displayAck.ts uses a randomUUID ackId and ignores non-string/unknown acks (acknowledgeDialogDisplay). Injection vector removed rather than sanitised (56-18-SUMMARY) |
| T-56-18-02 | Information disclosure | dialog title in log | accept | only title, never body | closed | Stronger than planned: no title logged at all (games.ts:3678/3690) |
| T-56-18-03 | Denial of service | dialog queue | mitigate | FIFO, drained on close; D-13 dedupe bounds notices | closed | src/frontend/state/dialogQueue.ts reduceDialogRequest (FIFO append, promote-first on close); GlobalState.tsx:21,824-827; test src/frontend/state/__tests__/dialogQueue.test.ts; S/games.ts D-13 `drmModeNoticeShownThisSession` keyed `${appId} |
| T-56-19-01 | Tampering | detectLaunchDrmWrapper | mitigate | realpath + isContainedWithin on every Shipping exe; bounded PE reads | closed | S/bridge/drm/drmScanExe.ts:46-69 (realpath of root and candidate, isContainedWithin, skip+warn); detectDrmWrapper bounded reads (shimGenerate); tests drmScanExe.test.ts "ignores a Shipping exe whose realpath escapes the bottle", "never rejects when findUnrealLayout throws" |
| T-56-19-02 | Elevation (route bypass) | bridgeRoute row 7 | mitigate | CEG still wins; rows 4/5/6 untouched; tests pin | closed | S/bridge/drm/steamclientLayerMode.ts:34-38 resolveBridgeMode returns tcp when cegMarkers non-empty; bridgeRoute.ts:160-163 ceg routes at row 4; row-7 change only suppresses notice (bridgeRoute.ts:284-300); tests bridgeRoute.test.ts "steamstub miss -> bridge / scan-miss, no notice; non-DRM twin still owes one", rows 4/5/6 tests |
| T-56-20-01 | Tampering (env injection) | drmWineDebugFromEnv | mitigate | strict allowlist regex, len cap 200 | closed | S/games.ts:917-923 `/^[A-Za-z0-9_+\-,.]{1,200}$/`, call site :4398; test games.test.ts:10888 "56-20: ... drmWineDebugFromEnv ... bounded appender" |
| T-56-20-02 | Denial of service (disk fill) | DRM wine log appender | mitigate | 8 MiB cap/launch, pruned with 8-file retention | closed | S/games.ts createDrmWineLogAppender (maxBytes 8*1024*1024, truncation marker); retention prepareDrmTraceFile ~:1000-1030; tests games.test.ts:10888, :10911 |
| T-56-20-03 | Information disclosure | wine log / process listing | mitigate | 0600 wine log; listing logs pid, %cpu, argv0 basename only | closed | games.ts openSync(path,'a',0o600); trace dir 0o700 chmod (prepareDrmTraceFile); S/bridge/drm/stageDrmBottle.ts:519-556 defaultListBottleProcesses emits `pid:pcpu:basename` only |
| T-56-20-04 | Information disclosure | WINEDEBUG output | accept | off unless dev env var set; same dir as trace | closed | env var gated by allowlist (games.ts:4398); 56-20-SUMMARY |
| T-56-21-01 | Tampering | extraExeDirs cleanup | mitigate | containment vs drive_c; only gamelib_bridge.cfg + marker-verified forwarders deleted | closed | S/bridge/drm/stageDrmBottle.ts:762-767 (each extraExeDir isContainedWithin driveC else fail), :433-470 removeTcpBridgeArtifacts (per-file isContainedWithin(bottleDir), lstat isFile, isPhase52ForwarderBytes marker, foreign left in place); tests in stageDrmBottle.test.ts |
| T-56-21-02 | Elevation (CEG bypass) | routing | mitigate | CEG markers read from .bind exe; CEG stays tcp; test pins | closed | S/games.ts:3892-3896 `readLaunchExeCegMarkers(drmExe)` ("T-56-21-02"), :3710-3722 prefetch path same; resolveBridgeMode steamclientLayerMode.ts:37; games.test.ts:11306 and :11322 "keeps the CEG refusal when the Shipping exe carries CEG markers", :11363 |
| T-56-22-01 | Information disclosure | 56-22-LIVE-DIAGNOSIS.md | mitigate | decisive lines only; acceptance grep | closed | Plan superseded (56-22-SUMMARY, operator ruling 2026-10-29): doc never written, no live session, nothing to disclose; no such file in phase dir |
| T-56-22-02 | Tampering | bottle cxbottle.conf edits | mitigate | pre-experiment copy, revert verified | closed | Superseded: no experiment run, no bottle edits (56-22-SUMMARY "No tasks executed") |
| T-56-22-03 | Denial of service | pid kills | mitigate | bottle-scoped kills, SIGTERM first | closed | Superseded: no kills performed (56-22-SUMMARY) |
| T-56-22-04 | Elevation (boundary) | experiments | mitigate | forbidden actions listed; no Steam.app/game exe/bottled Steam | closed | Superseded: no protocol run; objective forbids them in 56-22-PLAN |
| T-56-23-01 | Denial of service | escalation kill | mitigate | exact bottle-dir match, guardPerGameBridgeBottleName, SIGTERM before SIGKILL, bounded | closed | 56-23 superseded, F9-b..d NOT implemented (56-23-SUMMARY), so no plan-23 kill exists. The only escalation kill in code is 61b5d14ef (stageDrmBottle.ts defaultEndStageSession :644-690), scoped by WINEPREFIX/CX_BOTTLE env or cwd inside `bottleDir/`, WINE_COMMAND filter, own pid excluded (:560-612), entered via guarded endPerGameBridgeBottleSession (bottle.ts:1668,1898), 3s-bounded listings; it is SIGKILL after `wineserver -k` (no SIGTERM step). That surface is the accepted T-56-32-04. Note only: SIGTERM-before-SIGKILL not present |
| T-56-23-02 | Denial of service | pre-stage session end | mitigate | skip when game running | closed | N/A: no pre-stage session end was built (56-23-SUMMARY); stage-session kill runs only after a stage timeout |
| T-56-23-03 | Tampering | tolerant registry check | accept | tolerance limited to case + trailing backslash | closed | S/bridge/drm/stageDrmBottle.ts:140-143 sameSteamPath (strips trailing backslashes, case-insensitive; a different dir still mismatches), commit 5ff2dbd8c |
| T-56-24-01 | Tampering | rebuilt component (option-c) | mitigate | pins re-derived, new tag, operator publishes | closed | N/A: 56-24 superseded, no rebuild/re-pin/PINS or NOTICES edit (56-24-SUMMARY "No lsteamclient rebuild or re-pin") |
| T-56-24-02 | Elevation (boundary) | option set | mitigate | exe patching/DRM decryption/Steam.app/bottled Steam excluded | closed | N/A: no option implemented; the real fix 98837f09b is a working-directory change in launchTarget.ts/bridgeVerdict.ts only |
| T-56-24-03 | Tampering | env default (option-r-default) | mitigate | precedence user>tier-1>default, fixed literal, logged | closed | N/A: no env default added (no 219990-steam.json known-fix entry, 56-24-SUMMARY) |
| T-56-25-01 | Repudiation | contract integrity | mitigate | D-E split; 56-15 contract untouched; operator approval recorded | closed | git log: 56-15-LIVE-GATE.md last touched 36539c9e4 (56-16), no 56-25 commit; 56-25-SUMMARY tasks table records operator "Approved" 2026-10-29 |
| T-56-25-02 | Tampering | published asset | mitigate | new tag only, digests vs catalogue | closed | Task 3 resolved "publish not needed" (56-25-SUMMARY; no new asset since 56-24 superseded) |
| T-56-25-03 | Information disclosure | contract text | mitigate | literals/call names only | closed | 56-25-LIVE-GATE.md:117 literals-only statement; grep for SteamID/persona patterns in the contract: none |
| T-56-26-01 | Information disclosure | gate record | mitigate | literals only, raw in /tmp | closed | 56-26-SUMMARY:90 "Raw logs, SteamIDs and persona names stay out of the repo"; no tracked gate captures in git; no ID patterns in 56-25-LIVE-GATE.md |
| T-56-26-02 | Repudiation | contract integrity | mitigate | Sections 1-4 diff empty vs approved commit | closed | 56-26-SUMMARY:74; re-verified: Sections before `## 5. Tests` of 56-25-LIVE-GATE.md identical between ea6a7db70 and HEAD |
| T-56-26-03 | Tampering | HKLM diagnostic | mitigate | only under item-11 condition; /v InstallPath removal; CommonRedist counted | closed | 56-25-LIVE-GATE.md:140 (item 11 conditional) and :248 (mitigated by `/v InstallPath` removal + equal-count check); 56-26-SUMMARY item 11 "skipped (armed, not run)" |
| T-56-27-01 | Denial of service | card status (Play disabled) | mitigate | terminal 'done' on every failure exit after progress; tests A/B | closed | S/bridge/drm/drmLaunchSetup.ts:311-315,346-360 (fail() sends status 'done' when progressSent, try/catch); games.ts:3947-3953 (done after launch failure); tests drmLaunchSetup.test.ts:391 describe "terminal done after failure (56-27, IN-01)" |
| T-56-27-02 | Tampering | status for another operation | accept | done only for this appId and only when this setup sent progress | closed | drmLaunchSetup.ts:348 `if (progressSent)`, appName: appId |
| T-56-28-01 | Information disclosure | detectExeSteamDrm on drmExe | mitigate | drmExe only after containment check | closed | drmScanExe.ts returns drmExe only for own exePath or a candidate that passed realpath+isContainedWithin (:46-69); shimGenerate placeShimForGame uses `launchWrapper?.drmExe` (56-28-SUMMARY, 15fa338f8) |
| T-56-28-02 | Tampering | stored ceg verdict | mitigate | same-exe sourcing; Test A | closed | 56-28-SUMMARY (drmSource = launchWrapper?.drmExe ?? resolve(gameExePath)); shimGenerate/games tests 568 pass, existing CEG tests cover (Test C had no dedicated test per summary, not this threat's test) |
| T-56-29-01 | Information disclosure | candidate read outside bottle | mitigate | realpath of root and candidate, escape rejected + logged | closed | drmScanExe.ts:47,56-69; test drmScanExe.test.ts:111 "ignores a Shipping exe whose realpath escapes the bottle" (+ :146, :173 symlinked-root/dir cases) |
| T-56-29-02 | Information disclosure | log lines | mitigate | basenames only | closed | drmScanExe.ts:55,60-66 `name = basename(candidate)` in all three warnings |
| T-56-29-03 | Denial of service | one bad candidate aborting routing | mitigate | per-candidate try/catch | closed | drmScanExe.ts:70-80 try/catch around detect; test drmScanExe.test.ts:190 "a throwing detector on one candidate does not abandon the rest" |
| T-56-30-01 | Tampering | test gates (containment, channel pin, i18n baseline) | mitigate | fix causes not assertions; no ignore-list widening | closed | 56-30-SUMMARY cause/commit table (5fbd769a4, ca4cd8f2d, 022de9cd2): assertions unchanged, causes fixed. Caveat: A-17 follow-up declared 6 files as TEMPORARY entries in DECLARED_UNSCANNED_DEBT (meta/__tests__/genI18nGateScope.test.ts:351-357) tracked by todo 2026-10-29-widen-hardcoded-string-gate-for-key-table-shapes, and 2 suites classified STRUCTURALLY_CONTAINED_SUITES with rationale; 19 files audited into scope. Explicit, ratcheted, non-silent: low severity |
| T-56-30-02 | Repudiation | unknown-cause failures | mitigate | SUMMARY names file + commit; bisect | closed | 56-30-SUMMARY "Cause per failure" table; Test 1b root cause shown by factory-stack instrumentation, A-17 cause = file accumulation 258 to 283 (documented, no bisect needed) |
| T-56-31-01 | Denial of service | disk via orphan wine logs | mitigate | id-grouped retention covers orphans | closed | S/games.ts prepareDrmTraceFile (~:1000-1030) regex `^<appId>-(\d{1,16})(\.wine)?\.log$` grouped by id, older ids unlinked; test games.test.ts:10928 "56-31: orphan wine logs with no trace are bounded per app (CR-03)" |
| T-56-31-02 | Tampering | deleting files outside scope | mitigate | anchored regex, lstat isFile, other apps/stage untouched | closed | same code (lstatSync + isFile check, appId-anchored regex); test games.test.ts:10968 "other apps and stage wine logs are untouched; non-file entries are spared" |
| T-56-32-01 | Tampering | forced-timeout env in shipped builds | mitigate | only when !isPackagedSidecar, strict regex, logged | closed | S/bridge/drm/stageDrmBottle.ts:694-705 forcedFirstTimeoutMs (`/^[0-9]{3,5}$/`, isPackagedSidecar fails closed), :944 log line; test stageDrmBottle.test.ts:820 (D), :834-841 (E: packaged and malformed values ignored) |
| T-56-32-02 | Denial of service | stage log disk growth | mitigate | 2 MiB cap, retention 8/app | closed | S/bridge/drm/stageWineLog.ts:28 DRM_STAGE_LOG_KEEP_PER_APP=8, :43 maxBytes 2*1024*1024, :54-66 prune; tests stageWineLog.test.ts |
| T-56-32-03 | Tampering | symlink planted at the log name or root | mitigate | O_EXCL, lstat isDirectory, 0700/0600 | closed | stageWineLog.ts:48-52 (mkdir 0o700, lstat isDirectory, chmod), :56-62 anchored regex + lstat isFile, :88 `openSync(path,'wx',0o600)` |
| T-56-32-04 | Elevation / DoS | killing foreign processes | accept | sweep unchanged from 61b5d14ef (env or cwd-in-bottle, wine commands only, own pid excluded) | closed | stageDrmBottle.ts:560-612 pidsOfBottleSession / pidsWithCwdInBottle (WINE_COMMAND filter, ownPid excluded, pid>1, bottleDir + '/' prefix) |
| T-56-32-05 | Information disclosure | stage log content | accept | wine output under user app data, 0600, not committed | closed | stageWineLog.ts:88 0o600, dir 0o700 |
| T-56-33-01 | Repudiation | contract integrity | mitigate | author/runner split; 56-25 contract untouched; approval + pad choice recorded | closed | git log: 56-33 contract authored in 48464d5c6, approval 62952f464 ("approved: connected", pad choice) before any run; no edit to 56-25-LIVE-GATE.md by 56-33 (its commits are 56-33 files only); 56-33-SUMMARY |
| T-56-33-02 | Information disclosure | PC12 sign-in check | mitigate | vault key presence only, never prints token | closed | 56-33-LIVE-GATE.md:84 PC12 command prints only `present`/`absent`; :236,:255,:325 ("prints a word only"; QR re-login fallback) |
| T-56-33-03 | Tampering | PC14 Ranch registry reset | mitigate | no live wine process; user.reg backup; only four DRM values removed | closed | 56-33-LIVE-GATE.md:86 PC14 (pgrep/ps count must be 0, `cp user.reg ... .bak`, RESET awk limited to the 4 values, COUNT before/after), :257; 56-34 commit e38de1b85 records the reset |
| T-56-33-04 | Information disclosure | contract text | mitigate | literals/call names only | closed | 56-33-LIVE-GATE.md:151; no SteamID/persona patterns (grep) |
| T-56-34-01 | Information disclosure | gate record | mitigate | literals only, raw in /tmp | closed | 56-34-SUMMARY; no tracked captures; no ID patterns in 56-33-LIVE-GATE.md |
| T-56-34-02 | Repudiation | contract integrity | mitigate | Sections 1-4 diff empty vs approved commit | closed | 56-34-SUMMARY:95 "Sections 1-4 diff empty against 62952f464"; re-verified here (text before `## 5. Tests` identical between 62952f464 and HEAD) |
| T-56-34-03 | Tampering | Ranch registry reset (PC14) | mitigate | no live Ranch wine process; backup; four values; restored by stage on launch 5 | closed | same PC14 procedure (56-33-LIVE-GATE.md:86); commit e38de1b85; R1 pass in 56-34-SUMMARY (`registry not staged:` then stage re-wrote values, ORDER-OK) |
| T-56-34-04 | Tampering | forced-timeout env | mitigate | set only for segment B dev run; packaged sidecar ignores it | closed | stageDrmBottle.ts:700-702 (packaged ignored, test :834-841); 56-33-LIVE-GATE.md scopes the env to segment B (:107, :181) |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party / other plan)*

### Transfers

| Threat Ref | Transfer |
|------------|----------|
| T-56-11-10 | owned by 56-08 (0700 runners root, per-launch re-hash, loader re-sign) and 56-10 (pinned component shas); this plan only routes to the verified runner |
| T-56-13-05 | 56-09's `stageDrmBottle` deletes the forwarder (UTF-16LE marker check) and rewrites `SteamClientDll64` to the genuine DLL on the first DRM launch (HKCU only, D-21). Non-`.bind` titles never received either |

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-56-01 | T-56-01-05 | Declared real-profile arm, justified in the script header: bottles, CrossOver licence state and `CX_BOTTLE` lookup live under the real `~/Library`, and production `runWineCommand` spreads the real `process.env` | plan-time threat model (56-01-PLAN.md) | 2026-10-29 |
| AR-56-02 | T-56-01-08 | The clone is byte-identical to Apple-notarized stock; no re-sign, no patch, deleted at cleanup; 56-08 owns the trust widening of the real clone | plan-time threat model (56-01-PLAN.md) | 2026-10-29 |
| AR-56-03 | T-56-03-08 | Excluded by design (D-07). CEG titles are out of scope, so no responder thread exists to misbehave. | plan-time threat model (56-03-PLAN.md) | 2026-10-29 |
| AR-56-04 | T-56-04-04 | Causes may include local paths, which already appear in existing bridge log lines. No secrets pass through these steps. `meta/logSecretGate.ts` stays the backstop | plan-time threat model (56-04-PLAN.md) | 2026-10-29 |
| AR-56-05 | T-56-05-07 | Low value: the census is an operator diagnostic, not an authorisation gate. The anchor is GameLib-written, and the role and appId are lsteamclient-derived. Residual risk is recorded here | plan-time threat model (56-05-PLAN.md) | 2026-10-29 |
| AR-56-06 | T-56-07-04 | D-04 makes the manifest the trust root. Valve's `kvsignatures` RSA block is not verified and no scheme is invented (RESEARCH Pitfall 9). Residual risk is bounded by TLS plus the host allowlist. Recorded in the module header | plan-time threat model (56-07-PLAN.md) | 2026-10-29 |
| AR-56-07 | T-56-07-08 | No new npm package: `@node-steam/vdf` and axios are already frozen-stack dependencies, and `/usr/bin/unzip` is the macOS system binary. No package-manager install task | plan-time threat model (56-07-PLAN.md) | 2026-10-29 |
| AR-56-08 | T-56-08-10 | No new npm package. Only macOS system binaries (`/bin/cp`, `/usr/bin/xattr`, `/usr/bin/codesign`, `/usr/bin/plutil`, `/bin/ps`) are used. No package-manager install task | plan-time threat model (56-08-PLAN.md) | 2026-10-29 |
| AR-56-09 | T-56-09-06 | A same-user process able to edit user.reg could also edit the registry directly; that is out of scope for ASVS L1 on a single-user desktop. The skip only avoids redundant writes, and the helper `steam.exe` rewrites `SteamClientDll64` and `SteamPath` at every game start (56-03) | plan-time threat model (56-09-PLAN.md) | 2026-10-29 |
| AR-56-10 | T-56-09-07 | The only spawn is wine `reg add` through the existing `runWineCommand`, the declared real-profile arm, documented in the module header. It adds no env literal, and `fakeHomeIsolation.test.ts` stays green | plan-time threat model (56-09-PLAN.md) | 2026-10-29 |
| AR-56-11 | T-56-10-SC | No new npm, pip or cargo package. axios is a frozen-stack dependency, the archive code is in-repo, and `/usr/bin/codesign` is the macOS system binary. No package-manager install task | plan-time threat model (56-10-PLAN.md) | 2026-10-29 |
| AR-56-12 | T-56-11-09 | user-local process table on a single-user desktop. A fake process only lets setup proceed to a launch that then fails inside lsteamclient. It gains no privilege and no data | plan-time threat model (56-11-PLAN.md) | 2026-10-29 |
| AR-56-13 | T-56-12-09 | The declared real-profile arm: the launch needs the user's CrossOver bottle and Mac Steam's `steamclient.dylib`. No new HOME/XDG literal is written (fakeHomeIsolation gate and a test). Trace files hold only appId, pid, role and interface/call names | plan-time threat model (56-12-PLAN.md) | 2026-10-29 |
| AR-56-14 | T-56-12-11 | It is the user's own Mac Steam install under their own HOME, the same trust the TCP bridge's `libsteam_api.dylib` lookup already has; GameLib adds no new privilege | plan-time threat model (56-12-PLAN.md) | 2026-10-29 |
| AR-56-15 | T-56-13-07 | This plan deletes spawn sites (the forwarder's reg add) and adds none. fakeHomeIsolation.test.ts runs in Task 1's verify | plan-time threat model (56-13-PLAN.md) | 2026-10-29 |
| AR-56-16 | T-56-14-06 | No x86 export hands out an ISteamClient (`steam_api.def`), so the branch cannot be reached from a game. It is out of this plan's ownership (`meta/sdk/*`) and the SUMMARY names it as a follow-up | plan-time threat model (56-14-PLAN.md) | 2026-10-29 |
| AR-56-17 | T-56-15-08 | Inherited from 56-10 T-56-10-03 (0700 dir, pinned sha, re-verified each launch). Item 1 records `codesign -dv` "not signed at all" as expected | plan-time threat model (56-16-PLAN.md) | 2026-10-29 |
| AR-56-18 | T-56-17-02 | read-only commands only; no wine process is started in this plan | plan-time threat model (56-17-PLAN.md) | 2026-10-29 |
| AR-56-19 | T-56-18-02 | only the title is logged, never the message body (which may carry paths) | plan-time threat model (56-18-PLAN.md) | 2026-10-29 |
| AR-56-20 | T-56-20-04 | off unless the operator sets the dev-only env var; same dir as the existing trace | plan-time threat model (56-20-PLAN.md) | 2026-10-29 |
| AR-56-21 | T-56-23-03 | tolerance is limited to case and one trailing backslash on directory values; a different directory still re-stages | plan-time threat model (56-23-PLAN.md) | 2026-10-29 |
| AR-56-22 | T-56-27-02 | 'done' is sent only for this appId and only when this setup itself sent progress; no other operation owns the status mid-launch | plan-time threat model (56-27-PLAN.md) | 2026-10-29 |
| AR-56-23 | T-56-32-04 | sweep unchanged from 61b5d14ef (env or cwd-in-bottle, wine commands only, own pid excluded), verified read-only live per the debug doc | plan-time threat model (56-32-PLAN.md) | 2026-10-29 |
| AR-56-24 | T-56-32-05 | wine output only, under the user's own app data dir with 0600; not committed; the gate quotes literals only | plan-time threat model (56-32-PLAN.md) | 2026-10-29 |

*Accepted risks do not resurface in future audit runs.*

---

## Auditor Notes (non-blocking)

- **T-56-01-01..08:** the 56-01 probe was an uncommitted scratchpad script by design; closure rests on
  the `56-01-SUMMARY.md` run record (applications untouched, source bottle mtime unchanged, zero probe
  bottles left), not on in-repo code.
- **T-56-15-02:** the `$HOME` leak grep is not literally recorded in `56-15-SUMMARY.md`; the auditor
  re-ran it over the retained staging dir and extracted archive (clean) and re-ran `shasum -c SHA256SUMS` (all OK).
- **T-56-23-01:** 56-23 was superseded and its SIGTERM-before-SIGKILL escalation was never built. The
  only escalation kill in code (`61b5d14ef`: `wineserver -k` then SIGKILL, bottle-scoped, wine-only,
  excludes the sidecar pid) is the accepted T-56-32-04. The winebus abort-spin todo
  (`todos/completed/2026-10-29-drm-stage-session-can-hit-winebus-gamecontroller-abort-spin.md`) is closed;
  the remaining winebus wedge is tracked in `todos/pending/2026-10-29-winebus-iohid-wedges-on-powera-switch2-pad.md`.
- **T-56-30-01:** six files were added to `DECLARED_UNSCANNED_DEBT` as TEMPORARY entries and two suites
  to `STRUCTURALLY_CONTAINED_SUITES`, each with rationale and a closing todo — an explicit, ratcheted
  ignore-list widening.
- **T-56-18-01/02:** control achieved by removing the logged field (ackId round trip, `509bcb01b`);
  no dialog title or body is logged.
- **56-22, 56-24 (and T-56-25-02):** plans superseded by operator ruling; their risky actions were never
  performed, so those threats close as not applicable (cited to the SUMMARYs).
- Auditors read code and named tests; they did not run the test suite.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-29 | 179 | 179 | 0 | gsd-security-auditor ×4 (sonnet), orchestrated by /gsd-secure-phase |

## Security Audit 2026-10-29
| Metric | Count |
|--------|-------|
| Threats found | 179 |
| Closed | 179 |
| Open | 0 |
| — mitigate (verified) | 153 |
| — accept (logged) | 24 |
| — transfer (documented) | 2 |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-29
