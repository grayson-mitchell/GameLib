---
phase: 54
slug: steam-library-without-an-authenticated-cm-session-at-launch
status: verified
threats_open: 0
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
created: 2026-11-04
---

# Phase 54 - Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
>
> Built from the `<threat_model>` blocks of plans 54-01..54-14 (pre-extracted register, 58 rows) and verified against the
> implementation. No new-threat scan was performed. SUMMARY `## Threat Flags` (54-03/04/05/06/08/12/13) report nothing beyond the
> register, so there are no unregistered flags. 54-REVIEW-FIX.md (CR-01, WR-01..WR-09) was read: WR-01..WR-05 changed the goonline
> transport, marker semantics and shutdown behaviour; the affected mitigations (T-54-47..T-54-55) are re-verified against current code.
> Supporting run: `steamAuthSessionPolicy`, `macSteamOnlineDebt`, `macSteamOfflineWrap`, `authSessionLifecycle`, `authTrigger`,
> `anonymousClient` jest suites, 6 suites / 199 tests, all pass.

**Path shorthand:** `S` = `src/backend/storeManagers/steam`, `MO` = `S/macSteamOffline.ts`, `U` = `S/user.ts`,
`AC` = `S/anonymousClient.ts`, `AT` = `S/authTrigger.ts`, `G` = `S/games.ts`, `D` = `S/depot.ts`, `LT` = `S/bridge/launchTarget.ts`,
`BV` = `S/bridge/bridgeVerdict.ts`, `T` = `S/__tests__`, `GATE` = `src/backend/__tests__/steamAuthSessionPolicy.test.ts`,
`REG` = `src/backend/sidecar/steamAuthFlowRegistration.ts`, `P` = `.planning/phases/54-steam-library-without-an-authenticated-cm-session-at-launch`.

---

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Sidecar -> Mac Steam (`steam://` URLs, connection_log.txt, pgrep) | GameLib drives Mac Steam's online state to protect its Friends session; log text is read, never trusted as code |
| Sidecar -> Steam CM (anonymous + authenticated) | Authenticated logon is the defect surface; it must happen only on an explicit user action |
| Local config dir (`mac-steam-offline-owed.json`) -> sidecar | A same-user-writable marker; presence is the signal |
| Renderer -> sidecar IPC (goOffline retry/cancel, refresh origin) | Renderer-supplied origins and button presses |
| PICS appinfo / persisted bridge record -> install path | Remote and persisted data become a filesystem path |
| Operator evidence (LIVE-GATE, UAT, /tmp captures) -> repo | Committed evidence must not carry account ids or tokens |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Status | Evidence |
|-----------|----------|-----------|-------------|--------|----------|
| T-54-01 | Spoofing | watchConnectionLog evidence | mitigate | CLOSED | `MO:480-520` start offset taken at call (`openSync`/`readSync(offset)`); wrap calls `watchConnectionLog` before `deps.openUrl(GOOFFLINE)` (`MO:609-625`); bounded `MAC_STEAM_LOGOFF_WAIT_MS=5000` (`MO:42`); `LOGOFF_EVIDENCE_RE` strict match; `T/macSteamOfflineWrap.test.ts` |
| T-54-02 | Tampering | readMacSteamCmState parser | mitigate | CLOSED | `MO:56` `STATE_READ_BYTES=65536`; regex-only parse `MO:57-60,374-396`; fd closed in `finally` (`MO:395-396,434-435,471-472,515-516`) |
| T-54-03 | Info disclosure | wrap log lines | mitigate | CLOSED | `MO` log lines carry state word / wrap kind only (`MO:556-558,567-598,627-630`); no connection_log line is echoed. The plan's own sample now uses the `[U:1:<accountid>]` placeholder (see T-54-41) |
| T-54-04 | EoP | openUrl | mitigate | CLOSED | only call sites are `deps.openUrl(STEAM_GO_OFFLINE_URL)` (`MO:624`) and `deps.openUrlDetached(STEAM_GO_ONLINE_URL)` (`MO:709,793`); constants at `MO:46-47` |
| T-54-05 | DoS | anonymous client / poll timers | mitigate | CLOSED | `AC:21-22` bounds 15 s / 60 s; `timeout.unref?.()` `AC:125`, `idleTimer.unref?.()` `AC:63`; logOff `AC:95`; `releaseAnonymousForShutdown` `AC:218`, called `U:931`; `MO:176` sleep unref'd |
| T-54-06 | DoS | Friends sign-out (the defect) | mitigate | CLOSED | `MO:546-553` probe failure throws `GuidedOfflineRequiredError('running-probe-failed')`; `MO:621-651` LogOff not seen throws `GuidedOfflineRequiredError('logoff-not-seen')`, connect never called; `T/macSteamOfflineWrap.test.ts` |
| T-54-07 | Info disclosure | test fixtures | mitigate | CLOSED | `MO` deps injected (`isSteamRunning`, `connectionLogPath`, `onlineDebtPath`); `T/macSteamOfflineWrap.test.ts`, `T/macSteamOnlineDebt.test.ts` pass with injected deps (no real profile read) |
| T-54-08 | Tampering | locale catalogs | mitigate | CLOSED | `meta/__tests__/gamelibCatalogParity.test.ts:90` runs `validateTranslation` over every committed catalog; React text rendering, no `dangerouslySetInnerHTML` in `SteamGoOfflineNotice.tsx` (grep 0). Note: the parity test's own non-vacuity control (`:195-197`) targets the empty-value predicate, not `validateTranslation` itself |
| T-54-09 | Repudiation | misleading copy | mitigate | CLOSED | `public/locales/en/gamelib.json:653-661` names "Steam > Go Offline"; copy says "GameLib sets Steam back online", no Friends-recovery promise |
| T-54-10 | Info disclosure | logon log lines | mitigate | CLOSED | `U:1104` `CM logon mode=authenticated reason=${reason} wrap=${wrap}` only; `GATE` Rule K pins the literal once; `meta/__tests__/logSecretGate.test.ts` present |
| T-54-11 | Info disclosure | refresh token storage | mitigate | CLOSED | tokens only via `getTokenStore()`/`readTokenOutcome` (`U:6,277,571-572,793,819-820,834,1194`); no new storage location |
| T-54-12 | DoS | orphaned authenticated session | mitigate | CLOSED | `U:63` idle 60 s, `U:485-486` `idleTimer.unref?.()`; `U:67,1000-1013` logon bound 35 s + `bound.unref?.()` + logOff; `U:928-944` `releaseForShutdown`; `U:765` logout logOff; `T/authSessionLifecycle.test.ts` |
| T-54-13 | DoS | silent re-logon flipping Friends | mitigate | CLOSED | `U:976` `autoRelogin: false`; `GATE` Rule C (`.relog(` nowhere) and Rule H (autoRelogin false on every construction); persistent `client.on('error')` `U:1080`; `U:549` comment/no relog |
| T-54-14 | EoP | unauthorised authenticated logon path | mitigate | CLOSED | `U:447` `acquireOpenAuthenticated` reuse-only; `GATE` Rules A, D, E, F, G allow-list the callers |
| T-54-15 | Tampering | steamGoOfflineRequired payload | accept | CLOSED | see Accepted Risks Log |
| T-54-16 | Repudiation | key redeem raw key | mitigate | CLOSED | logging gate `meta/__tests__/logSecretGate.test.ts`; new lines in `U` carry store/outcome/refusal only (`U:1104`, reused-session line `U:455`) |
| T-54-17 | EoP | ORIGIN_TO_TRIGGER | mitigate | CLOSED | `AT:74` const allowlist; `AT:196-199` own-property guard, unknown -> 'startup'; `AT:161-167` one-shot grant consumed synchronously; `T/authTrigger.test.ts` |
| T-54-18 | DoS | Friends sign-out at launch | mitigate | CLOSED | `library.ts:1118-1165`: only a granted refresh calls `acquireAuthenticated`, else `acquireOpenAuthenticated('user-refresh')` (reuse only); SC1 ordering tests in `T/authTrigger.test.ts` |
| T-54-19 | Info disclosure | refresh logging | mitigate | CLOSED | `library.ts:1131-1135` logs fixed text; `AT` carries labels only |
| T-54-20 | DoS | sidecar exit contract (boot work) | mitigate | CLOSED | boot path does no CM connect (no ungranted `acquireAuthenticated`, `GATE` Rule G); anonymous capture bounded by `AC:21` and unref'd timers |
| T-54-21 | DoS | Play-time shared-redist logon | mitigate | CLOSED | `D:1342-1351` `allowLogon` default off, else `acquireOpenAuthenticated('shared-redist')`; `GATE` Rule I pins `allowLogon: true` to `G:2926` only |
| T-54-22 | Tampering | ACF LastOwner | mitigate | CLOSED | `U:462-467` `getPersistedSteamId64` requires `/^\d+$/` string; `D:3912` consumer; '0' fallback retained |
| T-54-23 | DoS | orphaned depot session | mitigate | CLOSED | leases released in `finally` (`D` acquire sites `:533,796,1343,4272`); `T/depot.sharedRedist.test.ts`, `T/depot.test.ts`, `T/depot.prescreen.test.ts` |
| T-54-24 | Info disclosure | refusal error text | mitigate | CLOSED | refusal results use enum + appId (`D:1356` message shape); no token interpolated |
| T-54-25 | Tampering | persisted launchTarget -> exe path | mitigate | CLOSED | `BV:77-82` zod, each string `.min(1).max(512)`; `LT:268-278` `sanitizeInstalldir` on every read, path rebuilt under `steamappsDir/common/<installdir>`, executable split on `\\`. Note: the executable segments are not separately screened for `..` (not part of the declared mitigation; PICS-sourced) |
| T-54-26 | Tampering | anonymous PICS installdir | mitigate | CLOSED | `LT:268,338` `sanitizeInstalldir` for every source |
| T-54-27 | DoS | Friends sign-out from Play / install-location | mitigate | CLOSED | `installLocation.ts:276` and `LT:220` use `acquireOpenAuthenticated`; `GATE` Rule G forbids `acquireAuthenticated(`/`ensureConnected(` in launch-path files |
| T-54-28 | DoS | hung anonymous connect at Play | mitigate | CLOSED | `AC:21` `ANON_CONNECT_TIMEOUT_MS=15000`, unref'd; never-throws catch `LT:279-285` |
| T-54-29 | EoP | steamGoOfflineRetry handler | mitigate | CLOSED | `REG:415` `ipcMain.handle('steamGoOfflineRetry', async () => checkGuidedOfflineReady())`, no arguments; `MO` `checkGuidedOfflineReady` only reads state and arms `guidedArmedAt`; `REG:449` cancel handler likewise argument-free |
| T-54-30 | Spoofing | Continue re-running an install | mitigate | CLOSED | `SteamGoOfflineNotice.ts` / CR-01 re-dispatches through `installSteamGame`; wrap re-checks state each time (`MO:546-651`) |
| T-54-31 | Tampering | rendered copy | mitigate | CLOSED | i18next interpolation, no `dangerouslySetInnerHTML` in `SteamGoOfflineNotice.tsx` (grep 0) |
| T-54-32 | Repudiation | misleading recovery claim | mitigate | CLOSED | `grep -c recover` on `SteamGoOfflineNotice.tsx` = 0 |
| T-54-33 | DoS | game page / Play logon | mitigate | CLOSED | `GATE` Rule J (`getExtraInfo` calls nothing on SteamUser), Rule G, Rule I |
| T-54-34 | DoS | orphaned install session | mitigate | CLOSED | leases at `G:1933,2393,3293` released in finally; idle grace `U:63`; `T/games.test.ts`, `T/authSessionLifecycle.test.ts` |
| T-54-35 | Tampering | crash breadcrumb on refused install | mitigate | CLOSED | acquire `G:2393` precedes `markSteamNativeInstallStarted` `G:3502` |
| T-54-36 | Info disclosure | refusal results | mitigate | CLOSED | user text via `classifyDepotError` fixed copy; enum only logged |
| T-54-37 | Tampering | gate vacuity | mitigate | CLOSED | `GATE:45` `MIN_FILES_SCANNED=420`, `GATE:135-136` floor test, per-rule positive matches Rules A-K |
| T-54-38 | Repudiation | comment-only matches | mitigate | CLOSED | `GATE:25,92` `stripSourceComments`; limitation documented `GATE:15-16` |
| T-54-39 | DoS | sidecar exit contract regression | mitigate | CLOSED | `unref` coverage listed under T-54-05/12/50; `pnpm smoke:sidecar` PASS recorded in `P/54-13-SUMMARY.md:55` |
| T-54-40 | Info disclosure | docs | accept | CLOSED | see Accepted Risks Log |
| T-54-41 | Info disclosure | captured logs / connection_log | mitigate | CLOSED | captures are not committed and no phase evidence file carries `[U:1:`/7656119… ids. The real account id formerly in `P/54-01-PLAN.md:105-107` (and in spike 046a/046b run logs) was redacted to `[U:1:<accountid>]` on 2026-11-04; the 3 capture dirs were deleted. Residual exposure in pushed git history is AR-54-04 |
| T-54-42 | Repudiation | contract unreachability | mitigate | CLOSED | `P/54-LIVE-GATE.md` published after the reachability review recorded in `P/54-10-SUMMARY.md`; gate executed (`P/54-UAT.md`) |
| T-54-43 | Tampering | stale sidecar measured | mitigate | CLOSED | `P/54-LIVE-GATE.md` PC4 mtime + literal grep against `build/main/sidecar.js` (evidence file `/tmp/gamelib-gate-20261029T002925Z/pc4-sidecar.log`) |
| T-54-44 | Info disclosure | session captures | mitigate | CLOSED | captures not committed, UAT quotes counts/message text only (grep of `P/54-*.md` finds no account ids besides T-54-41 item); delete instruction in LIVE-GATE; capture dirs deleted 2026-11-04 (see Evidence Hygiene) |
| T-54-45 | Repudiation | Friends verdict | mitigate | CLOSED | `P/54-UAT.md` items record operator judgement (`expected:` ... judged by the operator, `:59`) |
| T-54-46 | Tampering | stale build measured | mitigate | CLOSED | LIVE-GATE PC4 sidecar mtime check; `pc4-sidecar.log` present |
| T-54-47 | Info disclosure | marker file | mitigate | CLOSED | `MO:271-276` content `{since, by, pid}` only, `{ mode: 0o600 }`; key set asserted in `T/macSteamOnlineDebt.test.ts`. Deviation: `by` now has a third value `toggled-unconfirmed` (WR-02), still non-sensitive |
| T-54-48 | Tampering | marker file | accept | CLOSED | see Accepted Risks Log |
| T-54-49 | EoP / injection | spawnOpenDetached | mitigate | CLOSED | `src/backend/platform/openDetached.ts:36-39` `spawn('/usr/bin/open', ['-g', url], {detached, stdio:'ignore'})`, no shell; `MO` passes only `STEAM_GO_ONLINE_URL` (`MO:709,793`). Deviation: adds `-g` (background open), not a weakening |
| T-54-50 | DoS | sidecar exit | mitigate | CLOSED | `openDetached.ts:44` `child.unref()` + stdio ignore; `MO:56-ish` confirm bounded `MAC_STEAM_RESTORE_CONFIRM_MS=10000` (`MO:50`) on unref'd sleeps (`MO:176`); pgrep `timeout: 2000` (`MO:150`); no marker -> `runRestore` returns at `MO:744` before any work; per-trigger flights `MO:798-806` |
| T-54-58 | Spoofing (Friends) | second instance boot/shutdown | mitigate | CLOSED | `MO:745-752` `debtOwnedByOtherLiveProcess` -> `kept-owner-alive`, no fire; WR-03 hardened with `isOwnUserPidAlive` (`MO:116-123`) and boot-time check; `T/macSteamOnlineDebt.test.ts` |
| T-54-51 | Repudiation | user's own offline choice | mitigate | CLOSED | `MO:574-598` already-offline path writes no marker and fires none without guided/debt; restore needs the marker (`MO:744`); WR-02 stale-unconfirmed clearing `MO:755-762`; test "no marker -> no fire" |
| T-54-52 | DoS | handleExit | mitigate | CLOSED | `src/backend/utils.ts:338` awaits `releaseForShutdown()` which awaits only `restoreMacSteamOnlineIfOwed('shutdown')` (`U:944`); shutdown flight has no confirm wait (`MO:781-796`, `seen === null`), pgrep bounded 2000 ms; early returns for no marker / live owner / non-darwin (`MO:743-752`) |
| T-54-53 | DoS | sidecar exit at stdin EOF | mitigate | CLOSED | `stdinEofRelease.ts:60` `void SteamUser.releaseForShutdown()`; detached child unref'd; smoke PASS `P/54-13-SUMMARY.md:55` |
| T-54-54 | Spoofing (Friends) | quit while logon in flight | mitigate | CLOSED | `U:932-945` abandonPendingLogon + `abortSteamUserLogon(client)` precede `return restoreMacSteamOnlineIfOwed('shutdown')`; order test in `T/authSessionLifecycle.test.ts` |
| T-54-55 | Tampering | boot restore vs user intent | mitigate | CLOSED | `bootstrap.ts:1110` `void restoreMacSteamOnlineIfOwed('boot')` is a no-op without the marker (`MO:744`); non-darwin returns `not-darwin` (`MO:740`) |
| T-54-56 | Info disclosure | loginusers.vdf | mitigate | CLOSED | `P/54-LIVE-GATE.md:51` scores it by `grep -c` only, "never copied or quoted"; no `loginusers.vdf` content or ids in any `P/54-*.md` (only counts / path mentions) |
| T-54-57 | Repudiation | interrupted-wrap items | mitigate | CLOSED | `P/54-UAT.md:59` and LIVE-GATE items carry the positive discriminator + VOID/3-attempt cap |

**Count: 57 CLOSED, 1 OPEN (low, non-blocking).**

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-54-01 | T-54-15 | `steamGoOfflineRequired` payload carries only an enum action, an appId string already validated upstream, and (CR-01) an optional install path / bottle flag the user themselves chose; renderer treats it as display data and re-dispatches through the normal validated install path. | plan 54-03 (register_authored_at_plan_time) | 2026-11-04 |
| AR-54-02 | T-54-40 | Docs name mechanisms and file paths only; no account ids, tokens or log excerpts. (The former real-id sample in `54-01-PLAN.md` was redacted; see T-54-41.) | plan 54-09 | 2026-11-04 |
| AR-54-03 | T-54-48 | A local attacker who can write the user's config dir can at most make GameLib fire `steam://open/goonline`, which the user can fire themselves. Verified code behaviour: `readOnlineDebt` (`MO:312-340`) type-checks `since`/`pid`/`by` only to decide whether to keep or clear the marker (`pid` -> `process.kill(pid, 0)`; `by` compared to the literal `'toggled-unconfirmed'`). Nothing in the content is executed, interpolated into a command, or used as a URL; the fired URL is always the constant. A tampered marker can only suppress or force the single goonline. This is slightly broader than "presence only" and is accepted on the same ground. | plan 54-12 | 2026-11-04 |
| AR-54-04 | T-54-41 | The account id was redacted from the working tree (54-01-PLAN.md and six spike 046a/046b run logs), but it remains in already-pushed git history on the public `origin/main`. It maps to a public Steam profile and grants no account access; a history rewrite was judged not worth the disruption. | user | 2026-11-04 |

---

## Unregistered Flags

None. SUMMARY `## Threat Flags` for 54-03/04/05/06/08/12/13 report nothing beyond the register.

---

## Evidence Hygiene (T-54-41 / T-54-44 / T-54-56)

- Committed `P/54-*.md`, `54-i18n-fill.json`, `deferred-items.md`: no SteamID64 (`7656119` + 10 digits), no token, no raw `loginusers.vdf`, and no real `[U:1:<id>]` (the `54-01-PLAN.md` sample was redacted 2026-11-04, together with the same id in spike 046a/046b run logs). `54-03-PLAN.md:191` and `54-05-PLAN.md:122` use the obvious placeholder `76561198000000000`.
- The three capture dirs (`/tmp/gamelib-gate-20261028T192950Z`, `-20261029T002925Z`, `-20261101T011235Z`) were deleted on 2026-11-04 per the LIVE-GATE instruction.

---

## Open Items

None.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-04 | 58 | 57 | 1 (low) | gsd-security-auditor (Claude) |
| 2026-11-04 | 58 | 58 | 0 | T-54-41 redacted + capture dirs deleted (user decision); history residue AR-54-04 |

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-04
