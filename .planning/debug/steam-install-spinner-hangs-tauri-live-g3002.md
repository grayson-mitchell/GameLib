---
status: resolved
parked_to_phase: 33
resolved_by: "Phase 33 — plan 33-01 (handler badge-clear + failure dialog + watchdog) and plan 33-02 (ensureConnected canary + relog CM revalidation)"
proven_by: "Phase 33 plan 33-05 — gate D-13, outcome PASS, human-verified on live hardware"
resolved_on: 2026-07-24
resolved_evidence: "`npm run tauri:dev`, sidecar rebuilt from current tree, appId 257350 (Baldur's Gate II: EE): badge reaches a terminal state and the install starts and completes. '(11:37:52) [DownloadManager]: Baldur's Gate II: Enhanced Edition was added to the download queue.' 33-05-SUMMARY.md:87 — 'G-30-02 (parked since Phase 30) is resolved and hardware-proven.'"
trigger: "G-30-02 — live human retest 2026-07-23 on `npm run tauri:dev`, enableSteamNativeInstall:true, signed-in library: clicking Install on a Steam title leaves the spinner spinning forever. The 30-05 fix (which cleared a RETURNED {status:'error'}) did NOT hold on the live build. Find the path 30-05 did not cover."
created: 2026-07-23T00:00:00Z
updated: 2026-08-13T00:00:00Z
goal: find_root_cause_only
---

## RESOLVED 2026-07-24 — the park was honored

Phase 33 picked this up and closed it. The D-13 live gate (plan 33-05) is the proof: it was made a
load-bearing manual gate precisely because "jest was provably green while the live build hung TWICE
(30-05, 30-07)" (`33-VALIDATION.md:70-77`).

**What actually fixed it — not what this session predicted.** This file's diagnosis chased the
never-settling pre-download PICS await, and 30-07 implemented exactly that remedy; it failed live
anyway (see the PARKED section below). The fix that held was the third, least-specific item in this
file's own `missing:` list — the belt-and-suspenders one:

- **33-01** — a handler-level badge-clear + failure dialog + watchdog around `await install()`, so
  the badge reaches a terminal state regardless of what any downstream await does.
- **33-02** — `ensureConnected()` canary + relog CM revalidation, removing the fast-path-returns-
  true-on-a-stale-socket enabling condition.

**Three unrelated blockers surfaced during the gate itself** and were fixed there — a missing
`notification:allow-is-permission-granted` capability that crashed startup, `initOnlineMonitor()`
never being wired into the headless sidecar (so `isOnline()` was false forever and every install
bailed with "App offline"), and an unguarded `navigator.windowControlsOverlay` read. None of these
were G-30-02; they were latent Tauri-parity gaps only a live run exposes.

**Lesson.** Two precisely-diagnosed, unit-proven fixes (30-05, 30-07) both failed live, and the
generic guard succeeded. When a defect class is defined by "the await never settles," a bound placed
on any *specific* await is a guess about which one; a bound placed on the *caller* is not.

The original diagnosis and park record follow, unedited — they are the record of those two failed
attempts and are the instructive part of this file.

---

## PARKED 2026-07-23 → Phase 33

**The 30-07 fix did NOT close this live.** Plan 30-07 implemented exactly this session's diagnosed
remedy — every pre-download steam-user CM await (`getProductInfo` via fetchInstalldir/fetchAppInfo/
getOwnedSets/fetchDlcInfos, `getDepotDecryptionKey`+`getRawManifest`, `getContentServers`) plus the
`resolveSteamInstallTarget` phase is now wrapped in a `withTimeout` that REJECTS, and the WR-01/02/03
follow-ups (commits `8894e10e`, `aa5aba43`) tuned the bounds (25s single / 50s outer / 90s bulk,
timeouts non-retryable). Mechanism is unit-proven (1004 tests green). **Yet the live Tauri retest
2026-07-23 STILL hangs the "installing" badge forever** (user: "4. fails").

**Conclusion: the real live trigger is on a path the pre-download `withTimeout` wrapping does not
reach.** Diagnose-only starting points for whoever resumes this in Phase 33 (NOT yet investigated):
- Which install branch actually runs live — `installNative` vs `installBottleNative`? If the bottle
  path (`installBottleNative`) is taken, it may not route through the wrapped `runNativeDepotDownload`
  pre-download phase at all.
- Does execution even reach `resolveSteamInstallTarget`? A never-settling await BEFORE it — e.g.
  `ensureConnected` parking, or the sidecar `dispatchInvoke`/`install` handler never actually
  invoking `SteamGame.install()` under Tauri — would hang identically and bypass every wrapper.
- Is the hang before the awaits fire — i.e. the handler pushes 'installing' then never enters the
  bounded code (a synchronous or IPC-dispatch stall), so no `withTimeout` is ever armed.
- Confirm the wrapped `depot.ts`/`installLocation.ts`/`games.ts` functions are the ones on the LIVE
  Tauri code path (bundle/sidecar build), not shadowed by a stale sidecar binary.

Belt-and-suspenders the earlier gap analysis already flagged and 30-07 did NOT implement: a watchdog
around the sidecar handler's `await install()` in `installFlowRegistration.ts` that force-pushes a
terminal 'done' + ERROR if install() hasn't settled within a bound — this guarantees the badge can
never hang regardless of WHICH downstream await parks, and is the most robust fix to carry into 33.

## Current Focus

hypothesis: The sidecar `install` handler pushes 'installing' synchronously, then `await`s `SteamGame.install()`, which parks forever on an UNBOUNDED steam-user `getProductInfo()` PICS call in the native pre-download phase (`resolveSteamInstallTarget`->`fetchInstalldir` and/or `buildDepotPlan`->`fetchAppInfo`). A never-settling await produces NO return value and NO throw, so neither 30-05's `hadError` finally-guard nor the catch ever runs -> no terminal 'done' -> spinner forever.
test: static trace of the whole install path from the React button through the sidecar handler into SteamGame.install() -> installNative/installBottleNative -> runNativeDepotDownload -> resolveSteamInstallTarget/downloadSteamDepots; grep of every getProductInfo call site for a timeout wrapper; confirmation that the gameStatusUpdate frontendMessage relay is channel-agnostic.
expecting: confirmed root cause; no fix applied (diagnose-only).
next_action: return ROOT CAUSE FOUND to plan-phase --gaps.

## Symptoms

expected: Clicking Install on a Steam title under Tauri clears the 'installing' badge within a reasonable time — either back to Install (client-not-ready / benign) or via an ERROR dialog (genuine depot failure). The badge must never hang forever.
actual: "no, spinner remains spinning once clicked" — the 'installing' badge never clears; no progress, no error dialog, no toast. Also blocks the Install->Uninstall E2E (retest Test 4).
errors: None surfaced to the tester.
reproduction: `npm run tauri:dev`, enableSteamNativeInstall:true, signed in (377 owned games rehydrated from the shared on-disk store), click Install on a Steam title.
started: Discovered Phase 30 UAT; re-opened as G-30-02 after the 30-05 gap-closure fix failed the live retest 2026-07-23.

## Eliminated

- hypothesis: (c) The gameStatusUpdate frontendMessage relay is broken under Tauri, so the terminal 'done' never reaches the frontend.
  evidence: `handleInstall` (GamePage/index.tsx:673-684) returns `window.api.install({path:''})` directly and sets NO optimistic local spinner state — the spinner is driven purely by the `gameStatusUpdate` push. Because the 'installing' spinner DOES appear, the sidecar's 'installing' push reached the frontend. `pushFrontendMessage` (sidecarRpc.ts:248-258) emits EVERY channel identically as a `{kind:'frontendMessage'}` frame with NO channel allowlist, so a terminal 'done' would ride the exact same path a delivered 'installing' already proved works. If the handler ever pushed 'done', the badge would clear. Therefore the relay is not the gap.
  timestamp: 2026-07-23T00:00:00Z

- hypothesis: The hang is the RETURNED {status:'error'} path (the original 30-05 diagnosis).
  evidence: 30-05 extended the finally-guard from `deferredToSetup || wasAborted` to `... || hadError`, and set `hadError=true` whenever `SteamGame.install()` RETURNS `{status:'error'}`. installFlowRegistration.ts:194-234 confirms a returned error now always pushes a terminal 'done'. The live build still hangs, so the live trigger is NOT a returned error.
  timestamp: 2026-07-23T00:00:00Z

- hypothesis: ensureSteamClientReady hangs awaiting a consent/setup response that never resolves under Tauri.
  evidence: ensureSteamClientReady (clientSetup.ts:92-132) does only synchronous `existsSync` probes (isSteamClientInstalled + hasLibraryFoldersVdf) and RETURNS immediately with `{ready:false}` when not ready — it never awaits a dialog response. A not-ready result flows to runNativeDepotDownload's `if (!clientReady.ready) return {status:'error', ...}` (games.ts:1181-1188), i.e. a RETURNED error that 30-05 now clears. So this seam cannot be the infinite-hang source.
  timestamp: 2026-07-23T00:00:00Z

- hypothesis: SteamUser.ensureConnected() parks forever when the sidecar cannot reach the CM.
  evidence: ensureConnected (user.ts:70-143) is BOUNDED — cold connect via connectSteamUserClient (15s timeout) plus a 20s grace window, then returns false. buildDepotPlan (depot.ts:590-600) turns `connected===false` into a THROW, which propagates to the handler catch (installFlowRegistration.ts:219-224) that pushes 'done'. A connection failure therefore clears the badge (after ~35s), it does not hang forever.
  timestamp: 2026-07-23T00:00:00Z

## Evidence

- timestamp: 2026-07-23T00:00:00Z
  checked: The full install call chain — GamePage.handleInstall -> window.api.install -> sidecar `install` handler -> new SteamGame(appName).install() -> (installNative | installBottleNative) -> installDepotDownload -> runNativeDepotDownload.
  found: The sidecar handler (installFlowRegistration.ts:144-159) pushes 'queued' then 'installing' SYNCHRONOUSLY, then `await`s install() at line 168. Every terminal-status push in this handler (finally line 232, catch line 223) fires ONLY after that await settles. install() is therefore the sole thing between 'installing' and any terminal 'done'.
  implication: A never-settling await inside install() strands the badge on 'installing' with no possible terminal push. This is outcome (b): parked await, not a relay gap and not a returned/thrown error.

- timestamp: 2026-07-23T00:00:00Z
  checked: runNativeDepotDownload (games.ts:1157-1265) step ordering and downstream awaits.
  found: After the synchronous ensureSteamClientReady gate, it awaits (1) resolveSteamInstallTarget(appId,args) then (2) downloadSteamDepots(...). resolveSteamInstallTarget (installLocation.ts:220-243) awaits fetchInstalldir(appId), which at line 161 does `await client.getProductInfo([numericAppId],[],true)`. downloadSteamDepots -> buildDepotPlan (depot.ts:579-635) awaits fetchAppInfo/getOwnedSets/fetchDlcInfos, each `await client.getProductInfo(...)` (depot.ts:412/430/447) via withPlanBuildRetry.
  implication: The native pre-download phase makes MULTIPLE bare steam-user getProductInfo (PICS) calls before a single depot chunk is streamed. These are the first non-synchronous awaits on the path after the client-ready gate.

- timestamp: 2026-07-23T00:00:00Z
  checked: Every getProductInfo call site (grep) for a timeout/Promise.race wrapper; the sidecar handler and downloadmanager for any install watchdog.
  found: All getProductInfo calls are BARE awaits with no timeout (installLocation.ts:161; depot.ts:412,430,447; bridge/launchTarget.ts:85). No Promise.race / setTimeout / withTimeout guards install() in installFlowRegistration.ts or downloadmanager/utils.ts. steam-user's getProductInfo does NOT reject on a stale/half-open CM socket — it queues the job and never settles if no response arrives.
  implication: If the sidecar's steam-user CM connection is present-but-unresponsive (steamID still set, so ensureConnected's fast-path at user.ts:71 returns true without revalidating the socket), the FIRST such getProductInfo — fetchInstalldir inside resolveSteamInstallTarget — parks forever. Note fetchInstalldir's try/catch (installLocation.ts:159-179) catches a THROW but is powerless against a promise that never settles. resolveSteamInstallTarget never returns -> runNativeDepotDownload never returns -> install() never returns -> handler await at line 168 never settles -> finally never runs -> no terminal 'done'.

- timestamp: 2026-07-23T00:00:00Z
  checked: Why the tester saw "nothing happens" (no progress bar) rather than a slow-but-live download.
  found: Per-chunk progress (sendFrontendMessage('progressUpdate')) is only emitted once downloadDepotFiles begins streaming (depot.ts:2222), which is AFTER buildDepotPlan and the PICS getProductInfo calls complete. The tester reported no progress at all.
  implication: The park is in the pre-download PICS/plan-build phase (a getProductInfo await), consistent with the hypothesis — not a long-running chunk download the tester merely didn't wait out.

- timestamp: 2026-07-23T00:00:00Z
  checked: Why 30-05's jest suite is green while the live build hangs.
  found: 30-05's tests (installFlows.test.ts) drive `SteamGame.install()` to RETURN {status:'done'|'error'|'abort'} instantly (the depot/steam-user layer is mocked). No unit test exercises a real getProductInfo against a live-but-unresponsive CM connection. The env difference: under Electron, steam-user runs in the main process where the CM connection was freshly established at login and kept alive; under Tauri, steam-user runs in the long-lived Node SIDECAR whose library was rehydrated from the persisted 377-game store — its CM connection can be stale/half-open by the time the user clicks Install, so a getProductInfo job is issued but never answered.
  implication: 30-05 fixed the RETURN-value contract and the THROW contract. It structurally cannot address an await that never settles — there is no return and no throw for the finally-guard `hadError` or the catch to act on. This is the exact path 30-05 did not (and could not) cover.

## Resolution

root_cause: |
  The sidecar `install` handler (installFlowRegistration.ts:120-236) pushes 'queued'->'installing' synchronously, then `await new SteamGame(appName).install(...)` at line 168. For a native/bottle-native Steam install the flow reaches runNativeDepotDownload (games.ts:1157), which — after the synchronous ensureSteamClientReady gate — awaits resolveSteamInstallTarget and then downloadSteamDepots. Both phases make bare, un-timed steam-user `getProductInfo()` PICS calls: fetchInstalldir (installLocation.ts:161, reached via resolveSteamInstallTarget) FIRST, then fetchAppInfo/getOwnedSets/fetchDlcInfos in buildDepotPlan (depot.ts:412/430/447). steam-user's getProductInfo neither times out nor rejects when the CM connection is present-but-unresponsive — it queues the job and the Promise never settles. Under the Tauri sidecar the steam-user client is rehydrated/long-lived (the 377-game library came from the persisted store, and ensureConnected's fast-path at user.ts:71 returns true on any truthy `client.steamID` without revalidating the socket), so a getProductInfo issued at Install time can hang indefinitely. Because that await never settles, `SteamGame.install()` never returns and never throws; the sidecar handler's line-168 await never resolves, so neither the `finally` guard (which 30-05 extended with `hadError` for a RETURNED {status:'error'}) nor the `catch` (for a THROWN error) ever executes, and no terminal 'done' gameStatusUpdate is ever pushed. The frontend, whose spinner is driven solely by the gameStatusUpdate relay (which is proven working, since 'installing' arrived), is left on 'installing' forever.

  Why 30-05 didn't cover it: 30-05 only added terminal handling for the two ways install() can SETTLE — a returned {status:'error'} (finally `hadError`) and a thrown error (catch). A never-settling `getProductInfo` await is a THIRD outcome — install() does not settle at all — so there is nothing for either guard to fire on. The jest tests stay green because they mock the depot/steam-user layer and resolve install() instantly, never exercising a live unresponsive CM.
fix: ""
verification: ""
files_changed: []
