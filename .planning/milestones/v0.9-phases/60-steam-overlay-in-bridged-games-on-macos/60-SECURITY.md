---
phase: 60
slug: steam-overlay-in-bridged-games-on-macos
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-04
---

# Phase 60 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register source: the `<threat_model>` tables of 60-01..60-20 (84 threats, authored at plan time), re-stated for three entries changed by post-review fixes WR-01 and WR-03 (T-60-19-02, -03, -05). Verified against the code on `main` after the review fixes (commits 2d3f1f5e8..fd1864a0d).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Remote known-fixes file -> sidecar | `steamGameOverlay` key in a fetched known-fixes layer | One enum value; only `"off"` is honoured |
| GamesConfig/<appId>.json -> sidecar | Per-title `steamOverlayOverride` | Untrusted string, mapped to `automatic/on/off` |
| Sidecar -> CrossOver install on disk | Clone, re-sign (dyld env allowed, library validation off) and verify of a private runner | Binaries, entitlements, markers |
| Sidecar -> game process (CX_ENV / env) | `DYLD_INSERT_LIBRARIES` and `Steam*` ids | Absolute paths, numeric appId |
| Mac Steam console_log.txt -> sidecar | Real-profile read-only tail for the attach diagnostic | Log lines |
| Sidecar -> main log / renderer | Shim stderr forwarding, `[bridge-notice]` lines, engine-state push | Sanitised text, closed step enum |
| Bridge helper -> game process (Darwin notification) | `com.gamelib.steambridge.overlay.<appid>`, state `(pid<<8)|1` or 0 | Open/close signal; any same-user process can post it |
| Operator evidence -> repo docs | Log excerpts pasted into UAT/SUMMARY files | Paths, ids (home redacted to `~`) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation / Evidence | Status |
|-----------|----------|-----------|-------------|-----------------------|--------|
| T-60-01-01 | Tampering | vendored overlay_shim.m | mitigate | `meta/__tests__/overlayShimVendor.test.ts:24-35` asserts sha256 and git blob id; pins in `native/steam-bridge/overlay-shim/PINS.md`, `NOTICE` | closed |
| T-60-01-02 | Tampering | prebuilt binary substitution | mitigate | `overlayShimVendor.test.ts:60` rejects any `.dylib/.o/.a` in the vendor dir; `.gitignore:129-131` ignores `**/overlay_shim.dylib`, `overlay_input_probe.dylib`, `overlay_input.dylib` (repo-root ignore, not `public/bin/.gitignore`; equivalent) | closed |
| T-60-01-03 | Information disclosure | clang/lipo/codesign spawns | mitigate | `meta/buildSteamBridgeShims.ts:676-679,782-785,886-889` use `createFakeHomeProfile(...).childEnv(process.env)`, no env literal | closed |
| T-60-01-04 | Repudiation | licence compliance | mitigate | `native/steam-bridge/overlay-shim/LICENSE`, `NOTICE`; `THIRD-PARTY-NOTICES.md:165` entry | closed |
| T-60-SC | Tampering | npm/pip/cargo installs | accept | See Accepted Risks log (AR-01) | closed |
| T-60-02-01 | Tampering | knownFixes steamGameOverlay | mitigate | `src/backend/knownFixes.ts:240-245` drops any value other than `"off"`; type `src/common/types.ts:1190` is `'off'` | closed |
| T-60-02-02 | Tampering | readStoredOverlayOverride | mitigate | `steam/titleSettings.ts:23` appId regex `^[0-9]{1,10}$` before `join`; try/catch returns undefined (`:37`); `overlayPolicy.ts:12-13` `parseOverlayOverride` maps unknowns to `automatic` | closed |
| T-60-02-03 | Tampering / Repudiation | formatOverlayNoticeLine | mitigate | `bridge/overlay/overlayNotice.ts` `normaliseCause` strips control chars, cap 160 (`OVERLAY_CAUSE_MAX_CHARS`), `formatOverlayNoticeLine` maps to a whitespace-free `[A-Za-z0-9._:/@+=,-]` token | closed |
| T-60-02-04 | Elevation of privilege | overlayPaths | mitigate | `bridge/overlay/overlayPaths.ts:69` `CROSSOVER_BUILD_RE`, `:80-83` `contained()`, `:88-90` absolute and control-char guard on appFolder | closed |
| T-60-03-01 | Elevation of privilege | bin/wineloader re-sign | accept | See Accepted Risks log (AR-02) | closed |
| T-60-03-02 | Tampering | clone binaries between launches | mitigate | `drm/runnerClone.ts:604-617,653,729` marker schema 2 pins `wineloaderSha256`, re-hashed and entitlement-checked (`:735-757`) every launch | closed |
| T-60-03-03 | Tampering | half-signed loader after failed re-sign | mitigate | `drm/runnerClone.ts:1313-1331` restores `.gamelib-orig`, `stepFail('runner-patch')` if the restore fails; overlay clone additionally discards the whole partial dir on any failure (`overlay/overlayRunnerClone.ts` `finally safeRemoveOverlay(partial)`) | closed |
| T-60-03-04 | Information disclosure | codesign/cp/xattr/plutil spawns | mitigate | `drm/runnerClone.ts:129-139` `defaultRunTool` uses `createFakeHomeProfile().childEnv()`; tool allow-list `RUNNER_TOOLS` | closed |
| T-60-03-05 | Tampering | xattr scrub | mitigate | `drm/runnerClone.ts:1111-1112` targeted `-r -d` of quarantine and provenance only; no `xattr -c` | closed |
| T-60-04-01 | Tampering | console_log parsing | mitigate | `overlayAttachWatch.ts:38` 64 KiB tail, `:42-43` anchored regex with `{1,10}` digit pids, `:90` timestamp cutoff, `:79-82` sanitize (control chars stripped, 512 cap) | closed |
| T-60-04-02 | Denial of service | watcher lifetime | mitigate | `overlayAttachWatch.ts:37` clamp, `:149` `handle.unref?.()`, abort controller registered (`:127`) and ended at stdin EOF; timers tracked and cleared in `finally` | closed |
| T-60-04-03 | Tampering | trace dir symlink plant | mitigate | `overlayWineLog.ts:41-46` mkdir 0700, `lstatSync(...).isDirectory()` (false for a symlink), `chmodSync 0700`; `:77` `openSync(path,'wx',0o600)` (O_EXCL) | closed |
| T-60-04-04 | Denial of service | log growth | mitigate | `overlayWineLog.ts` 8 MiB cap (`maxBytes`), keep 8 per app (`OVERLAY_WINE_LOG_KEEP_PER_APP`), forwarder 50 lines and 4096-char partial buffer | closed |
| T-60-04-05 | Information disclosure | real-profile read | accept | See Accepted Risks log (AR-03) | closed |
| T-60-05-01 | Elevation of privilege | re-signed loaders | accept | See Accepted Risks log (AR-02) | closed |
| T-60-05-02 | Tampering | planted file or symlink in runners root | mitigate | `overlayRunnerClone.ts` lstat dir checks (`:319-322,440-443`), `chmod 0700` (`:444`), marker `flag:'wx'` (`:524`), `safeRemoveOverlay`, mkdtemp partial + atomic `rename` (`:527`) | closed |
| T-60-05-03 | Tampering | stale clone after same-build reinstall | mitigate | marker pins `sourceWineLoaderSha256/sourceWineloaderSha256`; `verifyOverlayRunnerClone` mismatch -> re-clone (`:241-249`, `:331-363`) | closed |
| T-60-05-04 | Denial of service | re-clone while the game runs | mitigate | `overlayRunnerClone.ts:346` `isPathInUse` returns 'clone' error "quit the game and retry"; launch falls back to stock | closed |
| T-60-05-05 | Information disclosure | cp/codesign/xattr/plutil/ps spawns | mitigate | all via `RunTool`/`defaultRunTool` (`overlayRunnerClone.ts:160,314,432`) which uses `createFakeHomeProfile().childEnv()` | closed |
| T-60-05-06 | Tampering | unexpected entitlement values | mitigate | `drm/runnerClone.ts:531` `parseEntitlementKeys` returns null on non-`<true/>`; `resignLoader` fails ('resign') on unreadable/short entitlements (`:1039,1085`) and the launch fails open | closed |
| T-60-06-01 | Tampering | steamOverlayOverride value | mitigate | `SteamOverlayOverride.tsx` `parseOverlayValue` (`stored==='on'||'off' ? : 'automatic'`); backend `steam/games.ts:1284-1287` re-parses via `parseOverlayOverride` | closed |
| T-60-06-02 | Information disclosure | overlayEligible | accept | See Accepted Risks log (AR-04) | closed |
| T-60-07-01 | Tampering | buildOverlayCxTokens / appendCxEnvTokens | mitigate | `overlayLaunch.ts:30-39` `safePath` (absolute, no control chars, no `'`, no `:`), `:46-50` quote guard, `APP_ID_RE`; `games.ts` `notifyOverlaySetupFailed('env', ...)` on failure | closed |
| T-60-07-02 | Elevation of privilege | injected Steam dylibs | accept | See Accepted Risks log (AR-05) | closed |
| T-60-07-03 | Tampering | shim path substitution | mitigate | `overlayLaunch.ts:246-` `checkOverlayInputs` uses `lstat(...).isFile()` for the shim; path is `builtOverlayShimPath` (own bundle dir) | closed |
| T-60-07-04 | Elevation of privilege | registry accepting arbitrary runner path | mitigate | `steam/bottle.ts:1526-1575` `BRIDGE_RUNNER_CXROOT_RE`, kind/build match, derived-path equality, control-char rejection; `setOverlayBridgeRunner` (`:1670`) | closed |
| T-60-07-05 | Denial of service | mixed wineservers on runner change | mitigate | `games.ts` `prepareTcpOverlay` calls `endPerGameBridgeBottleSessionWith(..., previousRunner bin)` when runnerDir changes; `bottle.ts:2099` | closed |
| T-60-08-01 | Tampering | CX_ENV assembly | mitigate | `games.ts` merge via `appendCxEnvTokens` (quote guard), failure -> `notifyOverlaySetupFailed('env')`; tokens only from `buildOverlayCxTokens` | closed |
| T-60-08-02 | Denial of service | overlay setup blocking launch | mitigate | `games.ts` `resolveLaunchOverlay` try/catch, `prepareTcpOverlay` try/catch/finally returning `{settings}`; all prepare functions return result objects, never throw | closed |
| T-60-08-03 | Repudiation | why overlay did/did not inject | mitigate | `games.ts` `resolveLaunchOverlay` logs `overlay=on/off source=`; `notifyOverlaySetupFailed` logs `[bridge-notice]` via `formatOverlayNoticeLine` | closed |
| T-60-08-04 | Tampering | known fix swapping runner mid-launch | mitigate | `games.ts` cx-env branch "One runner per bottle (T-60-08-04)": restores `getBridgeBottleSettings(appId).wineVersion` when `wineVersion.bin !== overlay.runnerBin`; DRM branch mirrors it | closed |
| T-60-08-05 | Elevation of privilege | injection on unverified engine | mitigate | fallback engine gets plain env, no clone/re-sign (D-07, `games.ts` `prepareTcpOverlay`); DRM route injects only when `ready.runner.wineloaderResigned === true` | closed |
| T-60-08-06 | Information disclosure | spawns | accept | See Accepted Risks log (AR-06) | closed |
| T-60-09-01 | Tampering / Repudiation | shim-line forwarding | mitigate | `overlayWineLog.ts` `createShimLineForwarder`: control chars stripped, `overlay_shim` prefix only, 512-char cap, 50-line cap with one suppression line | closed |
| T-60-09-02 | Denial of service | watcher / grace timer | mitigate | watcher bounded/unref'd/abortable (above); `games.ts:5982-5986` grace timer single-shot (`OVERLAY_EXIT_GRACE_MS=3000`) with `.unref?.()` and cleared at `:5932` | closed |
| T-60-09-03 | Denial of service | log file growth | mitigate | `openOverlayWineLog` 8 MiB cap, 8-file retention (see T-60-04-04) | closed |
| T-60-09-04 | Spoofing | false abnormal-exit notice | accept | See Accepted Risks log (AR-07) | closed |
| T-60-10-01 | Information disclosure | evidence pasted into 60-UAT.md | mitigate | `grep /Users/graysonmitchell` over 60-UAT.md, 60-10/12/16/18-SUMMARY.md returns 0 matches | closed |
| T-60-10-02 | Tampering | renamed overlay_shim.dylib in item 7 | mitigate | 60-UAT.md items 7/G4 record restoration with `lipo -info` (x86_64 arm64, no `.off` left); current `public/bin/arm64/darwin/overlay_shim.dylib` is a fat x86_64+arm64 file | closed |
| T-60-10-03 | Repudiation | pass without operator judgment | mitigate | 60-UAT.md records "Screenshots never count" and operator-judgment results per item | closed |
| T-60-11-01 | Tampering | probe log path symlink swap | mitigate | `overlay_input_probe.m:52` `open(..., O_NOFOLLOW|O_CREAT, 0600)`, absolute path check `:50`; `games.ts` `overlayProbeArg` creates trace root 0700; `safePath` on logPath in `overlayEnvValues` | closed |
| T-60-11-02 | Elevation of privilege | DYLD_INSERT of probe | mitigate | `overlayLaunch.ts:96-101` armed only on `env.GAMELIB_OVERLAY_INPUT_PROBE === '1'` (sidecar env); `games.ts` `overlayProbeArg` `lstatSync(...).isFile()`; `safePath` on dylibPath | closed |
| T-60-11-03 | Denial of service | probe log growth / sampler | mitigate | `overlay_input_probe.m:33` 4 MiB cap (`:94`), `:132-141` rate limit, `:601` sampler 120 s | closed |
| T-60-11-04 | Information disclosure | probe log contents | accept | See Accepted Risks log (AR-08) | closed |
| T-60-11-05 | Denial of service | sidecar exit contract | accept | See Accepted Risks log (AR-09) | closed |
| T-60-12-01 | Information disclosure | log excerpts in 60-12-SUMMARY.md | mitigate | zero `/Users/graysonmitchell` matches; excerpts show `~/Library/...` | closed |
| T-60-12-02 | Tampering | bottle registry / engine state | mitigate | 60-12-SUMMARY.md: Run B under the sandbox profile, `.gamelib-engine.json` flips back on the next normal CrossOver launch | closed |
| T-60-13-01 | Tampering | steamOverlayOverride from GameConfig | mitigate | `games.ts:1284-1287` `parseOverlayOverride` then only `'on'/'off'` merged; appId regex in `titleSettings.ts:23` | closed |
| T-60-13-02 | Denial of service | longer attach watch | mitigate | `overlayAttachWatch.ts:35-37,135-139` timeout clamped [1000, 60000], 1 poll/s, unref'd, abortable | closed |
| T-60-13-03 | Information disclosure | attach log line | accept | See Accepted Risks log (AR-10) | closed |
| T-60-14-01 | Tampering / Spoofing | overlayNotice.step rendered as text | mitigate | `engine/engineState.ts:381-382` regex appId + `OVERLAY_STEPS.includes`; renderer `SteamEngineLaunchNotice/index.tsx:69-71` `isOverlayStep` (closed key set), only catalogue strings rendered | closed |
| T-60-14-02 | Denial of service | notice spam | accept | See Accepted Risks log (AR-11) | closed |
| T-60-14-03 | Information disclosure | cause text | mitigate | `publishOverlayNotice(appId, step)` pushes only `{step, seq}`; cause goes to the log line only (`games.ts` `notifyOverlaySetupFailed`) | closed |
| T-60-14-04 | Denial of service | renderer listeners/timers | mitigate | `SteamEngineLaunchNotice/index.tsx` effect cleanup `stop()` removes focus/visibility listeners and clears the timer; dismiss sets state null which triggers the cleanup | closed |
| T-60-15-01 | Tampering | 331 payload parse | mitigate | `helper/gamelib_overlay_signal.h` `gl_ovl_parse_active`: `p==NULL||cub<1 -> -1`, reads byte 0 only | closed |
| T-60-15-02 | Spoofing | Darwin notification | accept | See Accepted Risks log (AR-12) | closed |
| T-60-15-03 | Tampering | experiment value into CX_ENV | mitigate | `overlayLaunch.ts:72` closed regex of three literals; invalid dropped (`games.ts` `overlayProbeArg` logs "invalid (ignored)") | closed |
| T-60-15-04 | Denial of service | helper log flood | mitigate | `gamelib_overlay_signal.h` `GL_OVL_LOG_BUDGET 256`, `gl_ovl_log_take` | closed |
| T-60-15-05 | Information disclosure | callback relay | mitigate | 331 not in the allow table (grep of `native/steam-bridge` and `bridge-allowlist.json` finds no row); `bridge_helper.c:1759-1771` publishes then falls to the "unlisted -> drop" path | closed |
| T-60-16-01 | Information disclosure | log excerpts in 60-UAT.md | mitigate | zero `/Users/graysonmitchell` matches in 60-UAT.md and 60-16-SUMMARY.md | closed |
| T-60-16-02 | Tampering | renamed overlay_shim.dylib left behind | mitigate | see T-60-10-02; UAT line 113 records restore and `lipo -info`; file present and fat today | closed |
| T-60-16-03 | Repudiation | pass without strict bridge evidence | mitigate | 60-UAT.md items require HELLO + clean game Steam-init log, "In-Game never counts" | closed |
| T-60-16-04 | Tampering | fix switched off beyond item 17 | mitigate | procedural; UAT records the fix running unflagged (WR-01 spot-check: `applied=true`, plain `pnpm tauri:dev`) | closed |
| T-60-17-01 | Elevation of privilege | probe injection | mitigate | same gating as T-60-11-02 (`overlayLaunch.ts:96-101`, `games.ts` lstat isFile, `safePath`); experiment needs the second exact-value flag matching `RELEASE_EXPERIMENT_RE` | closed |
| T-60-17-02 | Denial of service | cursor stranded released | mitigate | `overlay_input_probe.m:431-433` 300 s timeout close; close replays; acts only in the WineApplication GUI process (`:365,528`) | closed |
| T-60-17-03 | Spoofing | notification posted by another local process | accept | See Accepted Risks log (AR-13) | closed |
| T-60-17-04 | Denial of service | log flood from deferred calls | mitigate | `overlay_input_probe.m:130-141` 20 lines/s limit plus 4 MiB cap | closed |
| T-60-17-05 | Tampering | game input stream | mitigate | `overlay_input_probe.m:507-523` `probe_wine_send_event` always forwards to the prior IMP | closed |
| T-60-18-01 | Information disclosure | log excerpts in 60-18-SUMMARY.md / UAT G1 | mitigate | zero `/Users/graysonmitchell` matches in both files | closed |
| T-60-18-02 | Tampering | bottle engine / registry | mitigate | 60-18-SUMMARY.md: sandbox profile for Run 4, "operator then restarted plain `pnpm tauri:dev`" | closed |
| T-60-18-03 | Denial of service | cursor left released after a run | mitigate | 60-17 replay and 300 s timeout close (see T-60-17-02); game exit ends the state | closed |
| T-60-19-01 | Elevation of privilege | overlay_input.dylib injection | mitigate | built from `native/steam-bridge/overlay-input/overlay_input.m` by `buildSteamBridgeShims.ts:886-` (fake-HOME, ad hoc signed); `.gitignore:131`; `games.ts:4846` `lstatSync(...).isFile()`; `overlayLaunch.ts:30-39` `safePath`, placed after the Steam dylibs (`:129-132`) | closed |
| T-60-19-02 | Spoofing | notification posted by another local process | accept | See Accepted Risks log (AR-14). Re-stated: impact is block/unblock of the game's input (open sets `np_overlay_shim_set_active(1)`), not only the cursor | closed |
| T-60-19-03 | Denial of service | missed close leaves game input blocked | mitigate | RE-STATED (was accept, "no timeout"). Rationale was wrong: a missed close left input BLOCKED. WR-01 (2d3f1f5e8): `gamelib_overlay_signal.h:75-78` open state `(pid<<8)\|1`; `bridge_helper.c:3239-3240` publishes 0 at startup and `atexit` (`:193-194`); `overlay_input.m:61,311-333` 2 s `kill(pid,0)` watch, closes only on `ESRCH`, logs `publisher gone`. Residual (accepted, AR-15): a live helper whose Steam never reports close; pid reuse inside one 2 s poll; a bare state 1 arms no watch | closed |
| T-60-19-04 | Tampering | game input stream (block branch) | mitigate | `overlay_input.m:292-304` blocking only via `np_overlay_shim_set_active` resolved by `dlsym`; `set_active(1)` on open (`:386`), `set_active(0)` on close (`:413`) | closed |
| T-60-19-05 | Denial of service | stderr flood | mitigate | RE-STATED (WR-03, 00d15b823): `overlay_input.m:58-59,78-104` separate lifecycle budget `LOG_CAP 256` and deferred budget `DEFER_LOG_CAP 32`, atomic counters | closed |
| T-60-20-01 | Elevation of privilege | inputModulePath | mitigate | fixed packaged path `builtOverlayInputPath` (`games.ts:4846-4851`), lstat isFile, `safePath` (`overlayLaunch.ts:30,124-125`), after the Steam dylibs, shim stays first | closed |
| T-60-20-02 | Denial of service | missing module | mitigate | `games.ts:4846-4849` missing -> warning and `{}`; launch continues with the overlay; outcome line `applied=false reason=missing` | closed |
| T-60-20-03 | Tampering | GAMELIB_OVERLAY_INPUT_FIX | accept | See Accepted Risks log (AR-16) | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

Totals: 84 threats; 68 mitigate, 16 accept, 0 transfer (T-60-19-03 moved from accept to mitigate on re-statement).

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-60-SC | No package installs in plan 60-01 (RESEARCH Package Legitimacy Audit: none). | Plan 60-01 author | 2026-11-04 |
| AR-02 | T-60-03-01, T-60-05-01 | Re-signed `bin/wineloader` and `lib/wine/x86_64-unix/wine` carry dyld-env entitlement with library validation off. Same trust class DRM mode already accepts: 0700 runners root, inner SharedSupport/CrossOver only, per-launch re-hash of clone and source loaders (verified present; see T-60-03-02, T-60-05-03). | Plan 60-03 / 60-05 authors | 2026-11-04 |
| AR-03 | T-60-04-05 | Read-only access to one Mac Steam log file under the real HOME, declared as the real-profile arm in the module docblock; no spawn. | Plan 60-04 author | 2026-11-04 |
| AR-04 | T-60-06-02 | `overlayEligible` is a boolean about a title's own install; no PII. | Plan 60-06 author | 2026-11-04 |
| AR-05 | T-60-07-02 | Injected Steam dylibs come from the user's own Mac Steam install; GameLib redistributes nothing of Valve's; regular-file check only. | Plan 60-07 author | 2026-11-04 |
| AR-06 | T-60-08-06 | No new spawn sites; `runWineCommand` is the existing declared real-profile launch path (needs the real bottle and Mac Steam). | Plan 60-08 author | 2026-11-04 |
| AR-07 | T-60-09-04 | Worst case is an informational dialog pointing at a setting; no automatic action is taken. | Plan 60-09 author | 2026-11-04 |
| AR-08 | T-60-11-04 | Probe log holds cursor API calls, coordinates and image basenames only; no credentials; launch-log line redacts home to `~` (`games.ts` `overlayProbeArg`). | Plan 60-11 author | 2026-11-04 |
| AR-09 | T-60-11-05 | No new timers or watchers in the sidecar (one lstat/mkdir per launch); all probe timers live in the game process. | Plan 60-11 author | 2026-11-04 |
| AR-10 | T-60-13-03 | Attach log line format unchanged (sanitised, 512-char cap); no new data. | Plan 60-13 author | 2026-11-04 |
| AR-11 | T-60-14-02 | At most one notice per launch attempt; dismissible, non-modal. | Plan 60-14 author | 2026-11-04 |
| AR-12 | T-60-15-02 | Any local process can post the Darwin notification name; at plan time the effect was limited to a dev-only experiment. Superseded for production by AR-14. | Plan 60-15 author | 2026-11-04 |
| AR-13 | T-60-17-03 | Dev-only (probe flag), same-user session; effect limited to releasing/restoring the cursor in a game the user launched. | Plan 60-17 author | 2026-11-04 |
| AR-14 | T-60-19-02 | Spoofing of `com.gamelib.steambridge.overlay.<appid>` by a same-user process. Real impact (review IN-06): the poster can open the overlay state, which releases the cursor AND makes overlay_shim swallow the game's masked input (`set_active(1)`), or close it. It is scoped to one appId in the user's own game session and ends on a close post, a publisher-gone check (only if the spoofed pid is dead) or game exit. A same-user process can already inject input, move the cursor, or kill the game, so no privilege boundary is crossed. A spoofed live pid keeps the block until a close post, the genuine helper's next transition, or game exit. | Phase 60 security audit | 2026-11-04 |
| AR-15 | T-60-19-03 (residual) | After WR-01 a missed close is still unrecoverable by the watch when (a) the helper stays alive but Steam never reports `m_bActive=0`, or (b) the helper's pid is reused inside one 2 s poll window, or (c) a bare state 1 with no pid arrives. Each degrades to the old behaviour (input blocked until the next close or game exit), which the user can end by closing the overlay again or quitting the game. No timeout is added because the overlay may legitimately stay open for long (live check: 16 s open with no self-close). | Phase 60 security audit | 2026-11-04 |
| AR-16 | T-60-20-03 | `GAMELIB_OVERLAY_INPUT_FIX` is read from the sidecar's own env (same user); the exact value `'off'` only omits the input fix, it adds no behaviour. | Plan 60-20 author | 2026-11-04 |

*Accepted risks do not resurface in future audit runs.*

---

## Threat Flags (SUMMARY.md)

| Plan | Flag | Mapping |
|------|------|---------|
| 60-14 | None | n/a |
| 60-15 | None beyond register (T-60-15-02) | informational, maps to T-60-15-02 |
| 60-17 | None beyond register | n/a |
| 60-19 | None beyond threat model | n/a |

Unregistered flags: none.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-04 | 84 | 84 | 0 | gsd-security-auditor (Sonnet 5.5) |

Notes:
- Code reviewed after review fixes WR-01..WR-06 (2d3f1f5e8, b438440c5, 00d15b823, 5153f91af, 48b35ac8c, fd1864a0d). Three register entries re-stated: T-60-19-03 (accept -> mitigate with accepted residual AR-15), T-60-19-05 (64-line cap -> 256 lifecycle + 32 deferred budgets), T-60-19-02 (impact restated as input block/unblock).
- Evidence for the procedural UAT/evidence-hygiene threats (T-60-10-*, 12-*, 16-*, 18-*) rests on the committed UAT/SUMMARY text and a clean `/Users/graysonmitchell` grep, not on runtime behaviour. Runtime behaviour of the native modules was not re-run in this audit; it was verified by reading source, and by the WR-01 live spot-check recorded in 60-REVIEW-FIX.md.
- Non-blocking observation: T-60-01-02 plan text says `public/bin/.gitignore`; the ignore rule actually lives in the repo-root `.gitignore:129-131`. Same effect.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-04
