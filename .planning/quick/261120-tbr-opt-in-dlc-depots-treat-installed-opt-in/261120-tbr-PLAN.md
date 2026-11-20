---
phase: quick-261120-tbr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/depot/select.ts
  - src/backend/storeManagers/steam/depot/planModel.ts
  - src/backend/storeManagers/steam/depot/plan.ts
  - src/backend/storeManagers/steam/__tests__/depot.test.ts
  - src/backend/storeManagers/steam/__tests__/depot.cmPlan.test.ts
  - src/backend/storeManagers/steam/depotRust/verify.ts
  - src/backend/storeManagers/steam/depotRust/updateEstimate.ts
  - src/backend/storeManagers/steam/depotRust/__tests__/rustVerify.test.ts
  - src/backend/storeManagers/steam/depotRust/__tests__/updateEstimate.test.ts
  - .planning/todos/pending/2026-11-20-opt-in-dlc-depots-have-no-enable-path-and-drop-from-updates.md
  - .planning/todos/completed/2026-11-20-opt-in-dlc-depots-have-no-enable-path-and-drop-from-updates.md
  - .planning/todos/pending/2026-11-20-opt-in-dlc-has-no-enable-path-in-the-install-dialog.md
  - .planning/codebase/CONCERNS.md
autonomous: true
requirements:
  - TODO-2026-11-20-opt-in-dlc-depots-have-no-enable-path-and-drop-from-updates

estimate:
  tokens: 70000
  raw_tokens: 70000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "An update whose opts.delta.oldGidByDepot lists an installed opt-in DLC depot (Dota 2 shape: depot 381450, config.optionaldlc 313250, DLC app extended.optionaldlc '1') gets that depot back in buildDepotRefs' refs.depots, so decideRetirement keeps it as 'selected' and the Rust finalize's attempted set (and so the ACF InstalledDepots) still holds it"
    - "A fresh install (no delta, no installedDepotIds) still skips opt-in DLC depots: refs.depots has no 381450 and selectAllDepots receives no enabledOptInDlc"
    - "An installed set holding only depots without config.optionaldlc enables nothing: installing base content never pulls opt-in DLC"
    - "A verify whose ACF InstalledDepots holds the opt-in depot plans it through buildDepotRefs, so its key is requested under the plan's owner app (the base app), not via verify.ts's fallback under the ACF dlcappid"
    - "estimateBridgeUpdate passes the ACF's installed depot ids to buildDepotRefs, so the update estimate covers the same depot set as the update itself"
    - "When installed depots enable an opt-in DLC, buildDepotRefs logs one line carrying only the appId and DLC appIds (no key, token or SteamID64)"
    - "The source todo sits in .planning/todos/completed/ with its frontmatter intact plus resolved/resolution and a Resolution section; the enable-path UX is a new pending todo carrying severity/platform/ready in that order, and the todo gate prints OK"
  artifacts:
    - path: src/backend/storeManagers/steam/depot/select.ts
      provides: "optInDlcOfInstalledDepots(appinfo, dlcInfos, installedDepotIds): the DLC appIds named by the config.optionaldlc of each installed depot"
      contains: "optInDlcOfInstalledDepots"
    - path: src/backend/storeManagers/steam/depot/planModel.ts
      provides: "DownloadSteamDepotsOpts.installedDepotIds (verify and update-estimate input)"
      contains: "installedDepotIds"
    - path: src/backend/storeManagers/steam/depot/plan.ts
      provides: "buildDepotRefs derives installed ids (delta keys + installedDepotIds) and passes enabledOptInDlc to selectAllDepots"
      contains: "enabledOptInDlc"
    - path: src/backend/storeManagers/steam/__tests__/depot.cmPlan.test.ts
      provides: "buildDepotRefs tests over the real selectAllDepots: update keeps, fresh install skips, installedDepotIds keeps, base-only installs enable nothing"
      contains: "261120-tbr"
    - path: src/backend/storeManagers/steam/depotRust/__tests__/rustVerify.test.ts
      provides: "verify end to end: the installed opt-in depot is planned and keyed under the base app"
      contains: "261120-tbr"
    - path: .planning/todos/completed/2026-11-20-opt-in-dlc-depots-have-no-enable-path-and-drop-from-updates.md
      provides: "Closed source todo with a Resolution section"
      contains: "## Resolution"
    - path: .planning/todos/pending/2026-11-20-opt-in-dlc-has-no-enable-path-in-the-install-dialog.md
      provides: "Follow-up: the enable-path UX (install-dialog tick) for opt-in DLC"
      contains: "ready: human"
  key_links:
    - from: src/backend/storeManagers/steam/depot/plan.ts
      to: src/backend/storeManagers/steam/depot/select.ts
      via: "buildDepotRefs -> optInDlcOfInstalledDepots(appinfo, dlcInfos, installed ids) -> DepotSelectOpts.enabledOptInDlc -> selectAllDepots"
      pattern: "optInDlcOfInstalledDepots|enabledOptInDlc"
    - from: src/backend/storeManagers/steam/depotRust/install.ts
      to: src/backend/storeManagers/steam/depot/plan.ts
      via: "the update path already passes opts.delta through buildDepotRefs(appId, opts); no change in install.ts"
      pattern: "buildDepotRefs\\(appId, opts\\)"
    - from: src/backend/storeManagers/steam/depotRust/verify.ts
      to: src/backend/storeManagers/steam/depot/plan.ts
      via: "verifyInstalledDepotsRust passes installedDepotIds built from opts.installed.depots"
      pattern: "installedDepotIds"
    - from: src/backend/storeManagers/steam/depotRust/updateEstimate.ts
      to: src/backend/storeManagers/steam/depot/plan.ts
      via: "estimateBridgeUpdate's depotOpts carries installedDepotIds from ctx.oldGidByDepot keys"
      pattern: "installedDepotIds"
---

<objective>
Treat an installed opt-in DLC depot as enabled in Steam depot selection, so it stays in updates,
verify and the update estimate. Fresh installs keep skipping opt-in DLC. Then close the source
todo and file the enable-path UX as its own todo.

`buildDepotRefs` (src/backend/storeManagers/steam/depot/plan.ts) collects the installed depot ids:
the keys of `opts.delta?.oldGidByDepot` on update, and a new `opts.installedDepotIds` that verify
and the update estimate supply from the ACF. It maps each id through that depot's PICS
`config.optionaldlc` to a DLC appId and passes the set as `DepotSelectOpts.enabledOptInDlc` to
`selectAllDepots`.

Purpose: quick 261120-st3 made `selectAllDepots` skip opt-in DLC depots unless the caller enables
them, and no caller does. On update, a Windows/bottle install that already holds one (e.g. Dota 2
Workshop Tools depot 381450, Steam-ticked and adopted, or installed before 261120-st3) drops out of
the plan. `decideRetirement` keeps its files as still-on-branch, but the Rust finalize writes
InstalledDepots from attempted depots only, so the depot leaves the ACF and is never updated again.

Output: one select.ts helper, the plan.ts wiring, the installedDepotIds field, the verify and
estimate callers, tests at the select, plan, verify and estimate layers, the closed todo and the
follow-up todo.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@.planning/todos/pending/2026-11-20-opt-in-dlc-depots-have-no-enable-path-and-drop-from-updates.md
@.planning/quick/261120-st3-honour-config-optionaldlc-in-steam-depot/261120-st3-SUMMARY.md
@src/backend/storeManagers/steam/depot/select.ts

## Facts observed at planning time (HEAD 5b49949df)

- `buildDepotRefs` is at src/backend/storeManagers/steam/depot/plan.ts:453-572. `selectOpts` is
  built at :511-515 from `{ os, language, branch }` and passed to `selectAllDepots` at :516-522.
  `appinfo` and `dlcInfos` are both in scope by then. buildDepotRefs reads nothing from `opts.delta`
  today.
- `DownloadSteamDepotsOpts` is at src/backend/storeManagers/steam/depot/planModel.ts:77-102.
  `delta?: { oldGidByDepot: ReadonlyMap<string, string> }` is at :99-101.
- Callers of buildDepotRefs: depotRust/install.ts:149 (install and update; the update path,
  updateBridge.ts:200, passes `delta`, so install.ts needs no change), depotRust/verify.ts:90,
  depotRust/updateEstimate.ts:105 (its `depotOpts` at :96-104 carries NO delta, so today the
  estimate also drops the opt-in depot), and depotRust/secondary.ts:73/160/252 (prescreen, original-DLL
  restore, startup-resume verify of an interrupted install). The secondary callers have no ACF install
  set and stay unchanged.
- **The todo's verify claim is partly stale.** verify.ts (quick 261120-p2j, :96-130) pins EVERY ACF
  installed depot. A depot the plan did not select goes to a fallback that fetches its key with
  owner `d.dlcAppId ?? appId`. So verify never dropped the depot from its job. What changed after
  261120-st3 is the owner app: Dota 2 PICS gives depot 381450 `dlcappid 313250`, so the fallback
  asks for the key under 313250, while the plan path (and every pre-st3 verify) asks under the base
  app. Whether Steam issues the 381450 key under 313250 was not tested. After this fix the plan
  selects the depot again and the base-app owner returns.
- The Rust finalize (src-tauri/crates/gamelib-depot/src/acf.rs) needs no change. Once buildDepotRefs
  selects the depot it is in the job and so in the attempted set. Do not touch acf.rs.
- Dota 2 fixture src/backend/storeManagers/steam/__tests__/fixtures/appinfo-64bit.json (base app 570
  only): 381450 `config {oslist windows, osarch 64, optionaldlc 313250}`, dlcappid 313250, public gid
  3731324120960268617. 401531 is `optionaldlc 401530`. 401535 and 401536 are `optionaldlc 476580`.
  Its DLC apps' own appinfo is not in the fixture. The 261120-st3 describe in depot.test.ts
  (:157-277) builds it inline: `dlcInfos()` gives 313250 and 401530 `extended.optionaldlc '1'` and
  476580 none, and `package0()` builds the owned sets. `winOpts` and `ids` sit in the same describe.
- The D-02 census (depot.test.ts:74-90) runs `D02_REGEX` over select.ts after stripping comments and
  the exact word `optionaldlc`. Every NEW code identifier and string literal in select.ts must stay
  clear of that regex. Comments are free.
- Every suite that mocks the select module spreads `jest.requireActual` and replaces only
  `selectAllDepots` (depot.cmPlan, rustInstall, rustSecondary, depotJobInputs, depot.prescreen,
  depot.selectedFiles, depot.clobberGuard). A new select.ts export is therefore real in all of them.
  depot.cmPlan.test.ts mocks selectAllDepots (:57-60). rustVerify.test.ts uses the REAL select and the
  real buildDepotRefs. updateEstimate.test.ts mocks buildDepotRefs entirely (:23-28).
- rustVerify.test.ts `makeClient()` (:34-81) answers EVERY appIds request with the same base appinfo,
  so a DLC fetch for 313250 would get the base appinfo back (no `extended.optionaldlc`) and the depot
  would be selected with or without the fix. The new verify test must override `getProductInfo` so
  313250 returns `{ extended: { optionaldlc: '1' } }`, or it cannot go RED.
- The test runner is jest: `pnpm exec jest --runTestsByPath <file>`. Baseline over the 12
  buildDepotRefs-consuming suites listed in Task 1's verify: 12 suites, 234 tests, all pass.
- The working tree carries unrelated dirty and untracked files (public/locales/en/gamelib.json,
  .planning/state.json, debug/spike files, a .dxvk-cache). Stage ONLY each task's own paths with
  `git add -- <paths>`. Never `git add -A`, and never the gsd commit helper without `--files`: it
  sweeps every dirty .planning file. Phase 82 may be committing on main concurrently, so the
  commit-scope gates find this task's commit by message, not by HEAD.

## Discretion choices (planner)

- New opts field name: `installedDepotIds?: ReadonlySet<string>` on DownloadSteamDepotsOpts. It
  matches the existing `enabledOptInDlc` type. The update path keeps using `delta`, and
  buildDepotRefs unions the two.
- The helper lives in select.ts beside `optInDlcNotEnabled`. It is pure PICS-shape logic, and the
  real-fixture select tests live in depot.test.ts.
- The update estimate (estimateBridgeUpdate) is included. It is the size preview of the same update,
  and without the fix its depot set would differ from the real update's.
</context>

<tasks>

<task type="tracer">
  <name>Task 1 (tracer): an update keeps its installed opt-in DLC depot through buildDepotRefs</name>
  <files>src/backend/storeManagers/steam/depot/select.ts, src/backend/storeManagers/steam/depot/planModel.ts, src/backend/storeManagers/steam/depot/plan.ts, src/backend/storeManagers/steam/__tests__/depot.test.ts, src/backend/storeManagers/steam/__tests__/depot.cmPlan.test.ts</files>
  <read_first>src/backend/storeManagers/steam/depot/select.ts (header :14-21, DepotSelectOpts :50-60, selectAllDepots :138-164, optInDlcNotEnabled :166-182), src/backend/storeManagers/steam/depot/plan.ts :453-572, src/backend/storeManagers/steam/depot/planModel.ts :77-102, src/backend/storeManagers/steam/__tests__/depot.cmPlan.test.ts :1-172, src/backend/storeManagers/steam/__tests__/depot.test.ts :74-90 and :157-277</read_first>
  <action>
Test first. Write the cmPlan update test (b below) and run it RED against HEAD, then implement.

select.ts: add an exported pure function `optInDlcOfInstalledDepots(appinfo: SteamAppInfo,
dlcInfos: Record<string, SteamAppInfo> | undefined, installedDepotIds: Iterable<string>): Set<string>`.
For each installed id that is all digits, find its depot entry in `appinfo.depots` and in every
`dlcInfos` entry's `depots`. Whenever a found entry's `config.optionaldlc` is set, add
`String(config.optionaldlc)` to the result. It must not filter on the DLC app's own
`extended.optionaldlc`: `optInDlcNotEnabled` already decides which DLCs are opt-in, so naming a
DLC that is not opt-in changes nothing. Coerce values with `String()` only (no Number parse).
Update the module header comment (:14-21) and the `enabledOptInDlc` JSDoc (:56-59, which still
says buildDepotRefs does not pass it): buildDepotRefs now passes the DLCs of installed opt-in
depots, so an installed opt-in DLC stays enabled on update/verify, and a fresh install still passes
none. Keep every new code identifier and string literal clear of the D-02 census regex (see context).
Do not touch selectDepots or optInDlcNotEnabled.

planModel.ts: add `installedDepotIds?: ReadonlySet<string>` to DownloadSteamDepotsOpts, after
`delta`. Give it a JSDoc saying it holds the depot ids the ACF records as installed, supplied by
verify and the update estimate. Together with `delta.oldGidByDepot`'s keys, an installed
`config.optionaldlc` depot marks its opt-in DLC enabled in selection (quick 261120-tbr). A fresh
install leaves it absent.

plan.ts: in buildDepotRefs, after `dlcInfos` is fetched and before `selectOpts` is built, form the
installed set. It is the union of `opts.delta?.oldGidByDepot` keys and `opts.installedDepotIds`; a
small non-exported helper is fine. Compute `optInDlcOfInstalledDepots(appinfo, dlcInfos, installed)`
and import it from './select'. When that set is non-empty, add it to `selectOpts` as
`enabledOptInDlc`. When it is empty, leave the key ABSENT, so the fresh-install call is unchanged
and the existing `objectContaining` assertions still hold. When it is non-empty, also emit one
`logInfo(..., LogPrefix.Steam)` line. The line starts `buildDepotRefs:`, contains the words
`installed opt-in DLC`, the comma-joined DLC appIds and the appId, and nothing else identifying
(T-21-16-01: no key, token or SteamID64). Do not change install.ts, updateBridge.ts, retire.ts or
acf.rs.

depot.test.ts: nest a new describe named `installed opt-in DLC depots (quick 261120-tbr)` INSIDE
the existing `config.optionaldlc opt-in DLC (quick 261120-st3)` describe, so it reuses `dota`,
`dlcInfos()`, `package0()`, `winOpts` and `ids`. Import `optInDlcOfInstalledDepots` beside the
existing select imports. Four tests:
(1) The Dota fixture with installed ['381450', '401535', '401536'] gives exactly the set {'313250', '476580'}.
(2) Installed ['401531', '999999999'] gives {'401530'}, because an unknown id is ignored.
    Installed [one depot id from appinfo-64bit.json that has no config.optionaldlc; pick it from
    the fixture] gives the empty set.
(3) An inline appinfo whose only depot is declared in a DLC app's own `depots` with a NUMERIC
    `config.optionaldlc` 313250 maps to {'313250'}.
(4) `selectAllDepots(dota, dlcInfos(), package0(), { ...winOpts, enabledOptInDlc:
    optInDlcOfInstalledDepots(dota, dlcInfos(), ['381450']) }, '570')` contains 381450 and still
    excludes 401531.

depot.cmPlan.test.ts: inside `describe('buildDepotRefs')`, add a describe named
`quick 261120-tbr: installed opt-in DLC depots stay selected`. These tests drive the REAL
selectAllDepots. Each test's wiring calls `mockLeaseOk(steamUser)` and points
`steamUser.getClient` at a fresh `makeFakeClient()`. It also sets
`jest.mocked(selectAllDepots).mockImplementation(...)` to the real implementation from
`jest.requireActual` of '../depot/select'; use a type-only import for the module type if eslint
needs it. Other describes call `wire()`, which re-sets the mock, so nothing leaks; prove it by
running the whole file.

The client returns a single `getProductInfo` payload with three parts:
- `apps[12345].appinfo` is the base app. `extended.listofdlc` is '313250'. It has depot '111'
  (`config { oslist: 'windows' }`, public manifest gid '111000000000') and depot '381450'
  (`dlcappid '313250'`, `config { oslist: 'windows', osarch: '64', optionaldlc: '313250' }`,
  public gid '3731324120960268617').
- `apps[313250].appinfo` is `{ extended: { optionaldlc: '1' } }`.
- `packages[0].packageinfo` is `{ appids: [12345, 313250], depotids: [111, 381450] }`.

Set `licenses` to `[{ package_id: 0 }]`. Four tests:
(a) Fresh install: `buildDepotRefs(APP_ID, BASE_OPTS)` gives depot ids exactly ['111'], and the
    opts arg of selectAllDepots has no `enabledOptInDlc`.
(b) Update: BASE_OPTS plus `delta: { oldGidByDepot: new Map([['111', '1'], ['381450', '2']]) }`.
    The depot ids contain '111' and '381450'. The 381450 entry has `ownerAppId` APP_ID and `gid`
    the string '3731324120960268617'. A `logInfo` call contains '313250' and APP_ID and does not
    contain the fake client's SteamID '76561198012345678'. Import logInfo from the mocked logger.
(c) `installedDepotIds: new Set(['381450'])` alone, with no delta, also keeps 381450.
(d) An update whose delta lists only '111' still excludes 381450.

Commit: `git add --` exactly the five paths, message
`fix(quick-261120-tbr): keep installed opt-in DLC depots selected in buildDepotRefs`.
  </action>
  <verify>
    <automated>pnpm exec jest --runTestsByPath src/backend/storeManagers/steam/__tests__/depot.test.ts src/backend/storeManagers/steam/__tests__/depot.cmPlan.test.ts</automated>
    <automated>pnpm exec jest --runTestsByPath src/backend/storeManagers/steam/__tests__/depot.test.ts src/backend/storeManagers/steam/__tests__/depot.cmPlan.test.ts -t '261120-tbr' --verbose 2>&1 | grep -c '✓'   [HEAD=0 EXPECT>=8]</automated>
    <automated>pnpm exec jest --runTestsByPath src/backend/storeManagers/steam/__tests__/depot.test.ts src/backend/storeManagers/steam/__tests__/depot.betaBranch.test.ts src/backend/storeManagers/steam/__tests__/depot.cmPlan.test.ts src/backend/storeManagers/steam/__tests__/depot.prescreen.test.ts src/backend/storeManagers/steam/__tests__/depot.selectedFiles.test.ts src/backend/storeManagers/steam/__tests__/depot.clobberGuard.test.ts src/backend/storeManagers/steam/__tests__/verifyBridge.test.ts src/backend/storeManagers/steam/depotRust/__tests__/depotJobInputs.test.ts src/backend/storeManagers/steam/depotRust/__tests__/rustInstall.test.ts src/backend/storeManagers/steam/depotRust/__tests__/rustSecondary.test.ts src/backend/storeManagers/steam/depotRust/__tests__/rustVerify.test.ts src/backend/storeManagers/steam/depotRust/__tests__/updateEstimate.test.ts 2>&1 | grep -E '^Test(s| Suites):'   [HEAD: 12 suites passed, 234 tests passed; EXPECT 12 suites passed, >=242 tests passed, 0 failed]</automated>
    <automated>grep -vE '^[[:space:]]*(//|\*|/\*)' src/backend/storeManagers/steam/depot/select.ts | grep -c 'export function optInDlcOfInstalledDepots'   [HEAD=0 EXPECT==1]</automated>
    <automated>grep -vE '^[[:space:]]*(//|\*|/\*)' src/backend/storeManagers/steam/depot/plan.ts | grep -c 'enabledOptInDlc'   [HEAD=0 EXPECT>=1]</automated>
    <automated>grep -vE '^[[:space:]]*(//|\*|/\*)' src/backend/storeManagers/steam/depot/planModel.ts | grep -c 'installedDepotIds'   [HEAD=0 EXPECT==1]</automated>
    <automated>C=$(git log -1 --format=%H --grep='quick-261120-tbr): keep installed') && F=$(git show --name-only --format= "$C") && printf '%s\n' "$F" | grep -vxF -e src/backend/storeManagers/steam/depot/select.ts -e src/backend/storeManagers/steam/depot/planModel.ts -e src/backend/storeManagers/steam/depot/plan.ts -e src/backend/storeManagers/steam/__tests__/depot.test.ts -e src/backend/storeManagers/steam/__tests__/depot.cmPlan.test.ts | grep -c .   [HEAD: no such commit; EXPECT==0]  (the commit holds only this task's five paths)</automated>
    <automated>pnpm codecheck</automated>
    <automated>pnpm exec eslint --max-warnings 0 src/backend/storeManagers/steam/depot/select.ts src/backend/storeManagers/steam/depot/planModel.ts src/backend/storeManagers/steam/depot/plan.ts src/backend/storeManagers/steam/__tests__/depot.test.ts src/backend/storeManagers/steam/__tests__/depot.cmPlan.test.ts</automated>
    <automated>npx prettier --check src/backend/storeManagers/steam/depot/select.ts src/backend/storeManagers/steam/depot/planModel.ts src/backend/storeManagers/steam/depot/plan.ts src/backend/storeManagers/steam/__tests__/depot.test.ts src/backend/storeManagers/steam/__tests__/depot.cmPlan.test.ts   (all five report "ignored": false at planning time)</automated>
  </verify>
  <done>The cmPlan update test (b) failed at HEAD and passes after the change. Fresh-install test (a) and the base-only update (d) pass and exclude 381450. installedDepotIds (c) keeps it. The four depot.test.ts helper tests pass and the D-02 census stays green on the new select.ts. All 12 buildDepotRefs-consuming suites pass. codecheck, eslint (0 warnings) and the scoped prettier check pass. One commit holds exactly the five paths.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: verify and the update estimate pass the ACF installed depot ids</name>
  <files>src/backend/storeManagers/steam/depotRust/verify.ts, src/backend/storeManagers/steam/depotRust/updateEstimate.ts, src/backend/storeManagers/steam/depotRust/__tests__/rustVerify.test.ts, src/backend/storeManagers/steam/depotRust/__tests__/updateEstimate.test.ts</files>
  <read_first>src/backend/storeManagers/steam/depotRust/verify.ts (header :1-11, :89-130), src/backend/storeManagers/steam/depotRust/updateEstimate.ts :30-110, src/backend/storeManagers/steam/depotRust/__tests__/rustVerify.test.ts :1-175, src/backend/storeManagers/steam/depotRust/__tests__/updateEstimate.test.ts :1-140, src/backend/storeManagers/steam/acfInstalledDepots.ts :12-18</read_first>
  <behavior>
    - Verify: ACF installed depots are 222 and 381450 (with `dlcAppId: '313250'`). The PICS base app declares 381450 as `config.optionaldlc 313250`, DLC app 313250 has `extended.optionaldlc '1'`, and the package grants 381450. The job then pins 381450 to its INSTALLED manifest, and its key is requested as getDepotDecryptionKey(12345, 381450, fn), never (313250, 381450, fn). At HEAD the plan skips 381450, so the fallback asks under 313250: RED.
    - Estimate: estimateBridgeUpdate calls buildDepotRefs with `installedDepotIds` equal to `new Set(['100', '101'])`, the ACF depots the test's readAcfInstalledDepots mock returns. At HEAD the field is absent: RED.
  </behavior>
  <action>
Tests first, both RED at HEAD, then the two one-line source changes.

rustVerify.test.ts: add `it('quick 261120-tbr: an installed opt-in DLC depot is planned, so its key uses the base app', ...)`.
Override `client.getProductInfo` with `mockImplementation`; cast the returned objects `as never` if
the inferred jest.fn type objects. The override answers three kinds of request:
- A packageIds request returns package 7 with `appids [12345, 313250]` and `depotids [222, 381450]`.
- An appIds request for 313250 returns `{ extended: { optionaldlc: '1' } }` as that app's appinfo.
- Any other appIds request returns the existing base appinfo with two additions: depot '381450'
  (`dlcappid '313250'`, `config { oslist: 'windows', osarch: '64', optionaldlc: '313250' }`, public
  gid '3731324120960268617', size 0) and `extended.listofdlc: '313250'`.

Run `verifyInstalledDepotsRust` with installed depots 222 (INSTALLED_222) and
`{ depotId: '381450', manifest: '1111111111111111111', size: '0', dlcAppId: '313250' }` over
`createStubRustDepot` (same pattern as the first test). Assert three things:
- The job's 381450 entry has manifestId '1111111111111111111'.
- `client.getDepotDecryptionKey` was called with (Number(APP_ID), 381450, expect.any(Function)).
- No call was made with (313250, 381450, ...).
Confirm it fails at HEAD before changing verify.ts.

updateEstimate.test.ts: add `it('quick 261120-tbr: passes the ACF installed depot ids to buildDepotRefs', ...)`.
Give summarizeDepots a resolved summary (copy the first test's), call `estimateBridgeUpdate(game, {})`
and assert `jest.mocked(buildDepotRefs)` was called with '12345' and
`expect.objectContaining({ installedDepotIds: new Set(['100', '101']) })`.

verify.ts: pass `{ ...opts, installedDepotIds: new Set(opts.installed.depots.map((d) => d.depotId)) }`
to buildDepotRefs. Leave the pinning loop and the fallback unchanged; they still cover an installed
depot the branch no longer lists. Extend the header comment with one sentence: installed opt-in DLC
depots are now selected by the plan (quick 261120-tbr), so they take the plan's owner app rather
than the ACF dlcappid fallback.

updateEstimate.ts: add `installedDepotIds: new Set(ctx.oldGidByDepot.keys())` to `depotOpts`. Do
NOT pass `delta` there: `delta` means "run as a chunk-level delta job", and the estimate is not one.

Commit: `git add --` exactly the four paths, message
`fix(quick-261120-tbr): pass installed depot ids from verify and the update estimate`.
After committing, run `graphify update .` (CLAUDE.md). graphify-out is git-ignored; do not stage it.
  </action>
  <verify>
    <automated>pnpm exec jest --runTestsByPath src/backend/storeManagers/steam/depotRust/__tests__/rustVerify.test.ts src/backend/storeManagers/steam/depotRust/__tests__/updateEstimate.test.ts src/backend/storeManagers/steam/__tests__/verifyBridge.test.ts</automated>
    <automated>pnpm exec jest --runTestsByPath src/backend/storeManagers/steam/depotRust/__tests__/rustVerify.test.ts src/backend/storeManagers/steam/depotRust/__tests__/updateEstimate.test.ts -t '261120-tbr' --verbose 2>&1 | grep -c '✓'   [HEAD=0 EXPECT>=2]</automated>
    <automated>pnpm exec jest --runTestsByPath src/backend/storeManagers/steam/__tests__/depot.test.ts src/backend/storeManagers/steam/__tests__/depot.betaBranch.test.ts src/backend/storeManagers/steam/__tests__/depot.cmPlan.test.ts src/backend/storeManagers/steam/__tests__/depot.prescreen.test.ts src/backend/storeManagers/steam/__tests__/depot.selectedFiles.test.ts src/backend/storeManagers/steam/__tests__/depot.clobberGuard.test.ts src/backend/storeManagers/steam/__tests__/verifyBridge.test.ts src/backend/storeManagers/steam/depotRust/__tests__/depotJobInputs.test.ts src/backend/storeManagers/steam/depotRust/__tests__/rustInstall.test.ts src/backend/storeManagers/steam/depotRust/__tests__/rustSecondary.test.ts src/backend/storeManagers/steam/depotRust/__tests__/rustVerify.test.ts src/backend/storeManagers/steam/depotRust/__tests__/updateEstimate.test.ts 2>&1 | grep -E '^Test(s| Suites):'   [HEAD: 12 suites passed, 234 tests passed; EXPECT 12 suites passed, >=244 tests passed, 0 failed]</automated>
    <automated>grep -vE '^[[:space:]]*(//|\*|/\*)' src/backend/storeManagers/steam/depotRust/verify.ts | grep -c 'installedDepotIds'   [HEAD=0 EXPECT>=1]</automated>
    <automated>grep -vE '^[[:space:]]*(//|\*|/\*)' src/backend/storeManagers/steam/depotRust/updateEstimate.ts | grep -c 'installedDepotIds'   [HEAD=0 EXPECT>=1]</automated>
    <automated>C=$(git log -1 --format=%H --grep='quick-261120-tbr): pass installed') && F=$(git show --name-only --format= "$C") && printf '%s\n' "$F" | grep -vxF -e src/backend/storeManagers/steam/depotRust/verify.ts -e src/backend/storeManagers/steam/depotRust/updateEstimate.ts -e src/backend/storeManagers/steam/depotRust/__tests__/rustVerify.test.ts -e src/backend/storeManagers/steam/depotRust/__tests__/updateEstimate.test.ts | grep -c .   [HEAD: no such commit; EXPECT==0]  (the commit holds only this task's four paths)</automated>
    <automated>pnpm codecheck</automated>
    <automated>pnpm exec eslint --max-warnings 0 src/backend/storeManagers/steam/depotRust/verify.ts src/backend/storeManagers/steam/depotRust/updateEstimate.ts src/backend/storeManagers/steam/depotRust/__tests__/rustVerify.test.ts src/backend/storeManagers/steam/depotRust/__tests__/updateEstimate.test.ts</automated>
    <automated>npx prettier --check src/backend/storeManagers/steam/depotRust/verify.ts src/backend/storeManagers/steam/depotRust/updateEstimate.ts src/backend/storeManagers/steam/depotRust/__tests__/rustVerify.test.ts src/backend/storeManagers/steam/depotRust/__tests__/updateEstimate.test.ts   (all four report "ignored": false at planning time)</automated>
  </verify>
  <done>Both new tests failed at HEAD and pass after the change. The verify job keys 381450 under the base app and pins its installed manifest. The estimate hands buildDepotRefs the ACF installed ids. All 12 consuming suites pass. codecheck, eslint (0 warnings) and the scoped prettier check pass. One commit holds exactly the four paths, and graphify update ran.</done>
</task>

<task type="auto">
  <name>Task 3: close the source todo and file the enable-path UX todo</name>
  <files>.planning/todos/pending/2026-11-20-opt-in-dlc-depots-have-no-enable-path-and-drop-from-updates.md, .planning/todos/completed/2026-11-20-opt-in-dlc-depots-have-no-enable-path-and-drop-from-updates.md, .planning/todos/pending/2026-11-20-opt-in-dlc-has-no-enable-path-in-the-install-dialog.md, .planning/codebase/CONCERNS.md</files>
  <read_first>.planning/todos/pending/2026-11-20-opt-in-dlc-depots-have-no-enable-path-and-drop-from-updates.md, .planning/todos/completed/2026-10-29-depot-selection-installs-config-optionaldlc-opt-in-dlc.md (frontmatter and Resolution section: the shape to copy), .planning/codebase/CONCERNS.md :114-124</read_first>
  <action>
Move the source todo with `git mv` from .planning/todos/pending/ to .planning/todos/completed/
(same filename). Keep every existing frontmatter key and value, including severity: medium,
platform: any and ready: code. Append two keys at the end of the frontmatter: `resolved: 2026-11-20`
and a quoted `resolution:` one-liner. The one-liner says it was fixed by quick 261120-tbr:
buildDepotRefs treats installed opt-in DLC depots as enabled (update delta, verify, update
estimate), and the enable path moved to 2026-11-20-opt-in-dlc-has-no-enable-path-in-the-install-dialog.md.

Append a `## Resolution (2026-11-20, quick 261120-tbr)` section with four parts:
- The fix (helper, plan wiring, installedDepotIds, the two callers).
- That fresh installs still skip opt-in DLC.
- The verify correction from this plan's context. verify.ts already pinned every installed depot,
  so the depot never left the verify job. Its key moved to the dlcappid fallback owner (313250
  instead of the base app); whether Steam issues the key under 313250 was not tested; the fix
  restores the base-app owner.
- That acf.rs needed no change, plus the Task 1 and Task 2 commit hashes from `git log`.

Create .planning/todos/pending/2026-11-20-opt-in-dlc-has-no-enable-path-in-the-install-dialog.md.
Copy the frontmatter shape of the source todo:
- `created: 2026-11-20`
- a quoted `title:` naming the missing enable path for opt-in DLC (follow-up to quick 261120-tbr)
- `source: quick 261120-tbr`
- `area: steam-depot-download`
- `files:` listing src/frontend/screens/Library/components/InstallModal/index.tsx,
  src/backend/storeManagers/steam/depot/select.ts, src/backend/storeManagers/steam/depot/plan.ts
  and src/backend/storeManagers/steam/depot/planModel.ts
- then, in this order, bare and lowercase: `severity: minor`, `platform: any`, `ready: human`
  (gamelib-conventions todo triage rule; `human` because the install-dialog tick is a UX decision).

The body says:
- After 261120-tbr an installed opt-in DLC stays enabled, but no GameLib path enables one that is not
  installed (e.g. Dota 2 Workshop Tools 313250, depot 381450, 5.9 GB). The workaround is to tick it
  in Steam; GameLib then keeps it.
- What a fix needs: a tick for owned opt-in DLC in the install dialog, an add-to-existing-install path,
  and an untick path. decideRetirement keeps still-on-branch depots today, so a disabled DLC's depots
  would never be removed.
- Somewhere to persist the choice. Carry over the unverified ACF UserConfig/MountedConfig
  `optionaldlc` lead (none of 24 operator ACFs carried it on 2026-11-20).

In .planning/codebase/CONCERNS.md, replace the one Known Bugs line that points at the source todo
with a line pointing at the new todo:
`Opt-in DLC has no enable path (install-dialog tick): 2026-11-20-opt-in-dlc-has-no-enable-path-in-the-install-dialog.md`,
with the filename in backticks as in the neighbouring lines.

Do NOT edit .planning/STATE.md; the quick orchestrator updates its pending-todo list and quick table.
Commit: `git add --` exactly the paths this task touched (the rename's old and new path, the new
todo, CONCERNS.md), message
`docs(quick-261120-tbr): close the opt-in DLC update todo; file the enable-path follow-up`.
  </action>
  <verify>
    <automated>test -f .planning/todos/completed/2026-11-20-opt-in-dlc-depots-have-no-enable-path-and-drop-from-updates.md && test ! -e .planning/todos/pending/2026-11-20-opt-in-dlc-depots-have-no-enable-path-and-drop-from-updates.md   [HEAD: fails, the file is still pending; EXPECT exit 0]</automated>
    <automated>grep -c -E '^(created: 2026-11-20|area: steam-depot-download|severity: medium|platform: any|ready: code|resolved: 2026-11-20)$' .planning/todos/completed/2026-11-20-opt-in-dlc-depots-have-no-enable-path-and-drop-from-updates.md   [HEAD=error:2 EXPECT==6]</automated>
    <automated>grep -c '^## Resolution' .planning/todos/completed/2026-11-20-opt-in-dlc-depots-have-no-enable-path-and-drop-from-updates.md   [HEAD=error:2 EXPECT==1]</automated>
    <automated>awk '/^(severity|platform|ready):/{printf "%s ", $0}' .planning/todos/pending/2026-11-20-opt-in-dlc-has-no-enable-path-in-the-install-dialog.md   [HEAD: file absent; EXPECT exactly: severity: minor platform: any ready: human ]</automated>
    <automated>python3 .planning/todos/todo-frontmatter-gate.py | tail -1   [HEAD: OK: 10 pending; EXPECT a line starting OK: with 10 pending (one out, one in)]</automated>
    <automated>grep -c 'opt-in-dlc-has-no-enable-path-in-the-install-dialog.md' .planning/codebase/CONCERNS.md   [HEAD=0 EXPECT==1]</automated>
<!-- planner-discipline-allow: drop-from-updates -->
    <automated>grep -c 'drop-from-updates' .planning/codebase/CONCERNS.md   [HEAD=1 EXPECT==0]  (CONCERNS.md no longer points at the closed todo; the literal appears in this task's action only as the git mv source path, never as text to write into CONCERNS.md)</automated>
    <automated>grep -c 'Opt-in DLC' .planning/codebase/CONCERNS.md   [HEAD=1 EXPECT==1 @5b49949df GUARD MUTATION: adding the new line beside the old one instead of replacing it reads 2]</automated>
    <automated>C=$(git log -1 --format=%H --grep='quick-261120-tbr): close the opt-in') && F=$(git show --name-only --format= "$C") && printf '%s\n' "$F" | grep -vxF -e .planning/todos/pending/2026-11-20-opt-in-dlc-depots-have-no-enable-path-and-drop-from-updates.md -e .planning/todos/completed/2026-11-20-opt-in-dlc-depots-have-no-enable-path-and-drop-from-updates.md -e .planning/todos/pending/2026-11-20-opt-in-dlc-has-no-enable-path-in-the-install-dialog.md -e .planning/codebase/CONCERNS.md | grep -c .   [HEAD: no such commit; EXPECT==0]  (the commit holds only this task's paths)</automated>
    <automated>Formatter check omitted: every path this task writes is under .planning/, which prettier ignores (`npx prettier --file-info` reports "ignored": true for CONCERNS.md and both todo trees at planning time), so --check would prove nothing.</automated>
  </verify>
  <done>The source todo is in completed/ with its original frontmatter plus resolved/resolution and a Resolution section carrying the verify correction and both code commit hashes. The enable-path todo is in pending/ with severity/platform/ready in order, and the todo gate prints OK. CONCERNS.md points at the new todo. STATE.md is untouched. One docs commit holds only these paths.</done>
</task>

</tasks>

<threat_model>
ASVS level 1, block_on high. No new trust boundary, no new endpoint and no package installs.

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Steam CM PICS -> depot selection | appinfo/packageinfo from Valve's servers decides which depots download; `config.optionaldlc` is read from it |
| local ACF (InstalledDepots) -> depot selection | installed depot ids read from the appmanifest by the Rust steamfiles reader now widen the enabled opt-in DLC set |
| plan.ts -> log file | the new enable line is logged; logs leave the machine in bug reports |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261120-tbr-01 | Tampering | ACF InstalledDepots -> optInDlcOfInstalledDepots | low | mitigate | Ids reach buildDepotRefs as digit strings, validated by acfInstalledDepots' `^\d{1,20}$`, and the helper skips any non-digit id. The ownership gate and every config filter (oslist, osarch, language, realm, steamdeck) still apply. So a forged ACF can only re-select owned depots of a DLC the ACF already claims is installed. Values are only `String()`-coerced and set-looked-up; there is no path or command use (Task 1) |
| T-261120-tbr-02 | Denial of Service | fresh install wrongly pulling opt-in DLC (5.9 GB) | medium | mitigate | `enabledOptInDlc` is set only when delta keys or installedDepotIds name an installed `config.optionaldlc` depot; fresh installs pass neither. Tests pin two cases: a fresh install excludes 381450 and receives no `enabledOptInDlc`, and a base-only installed set enables nothing (Task 1 a, d) |
| T-261120-tbr-03 | Information Disclosure | the new buildDepotRefs enable log line | low | mitigate | The line carries the appId and the DLC appIds only, per T-21-16-01. Task 1 test (b) asserts it does not contain the SteamID64 |
| T-261120-tbr-04 | Tampering | verify key request owner app | low | mitigate | An installed opt-in depot is keyed under the plan's owner app (the app whose PICS declared it), the same owner an install with the DLC enabled uses. The pinned manifest stays the INSTALLED gid, so a verify never becomes an update (Task 2 test) |
| T-261120-tbr-SC | Tampering | npm/pip/cargo installs | low | accept | This plan installs no package, so the package-legitimacy gate has nothing to check |
</threat_model>

<verification>
- The 12 buildDepotRefs-consuming suites (list in Task 1's verify) all pass: at least 244 tests against the 234 baseline.
- `-t '261120-tbr'`: at least 8 passing in depot.test.ts + depot.cmPlan.test.ts, and at least 2 in rustVerify.test.ts + updateEstimate.test.ts.
- The cmPlan update test (b), the rustVerify test and the updateEstimate test were each run RED at HEAD before the source change; the SUMMARY records it.
- `pnpm codecheck` exits 0; eslint `--max-warnings 0` over the nine TS paths exits 0; scoped `npx prettier --check` over the nine TS paths passes.
- No commit of this plan touches install.ts, updateBridge.ts, retire.ts or src-tauri/crates/gamelib-depot/src/acf.rs (the per-task commit-scope gates prove it).
- `python3 .planning/todos/todo-frontmatter-gate.py` ends with `OK:`.
</verification>

<success_criteria>
- Update: an installed opt-in DLC depot stays in buildDepotRefs' plan, so it is retained as 'selected', stays in the attempted set and stays in the ACF.
- Verify: the installed opt-in depot is planned and keyed under the base app, pinned to its installed manifest.
- Update estimate: buildDepotRefs sees the same installed set as the update.
- Fresh install: opt-in DLC depots are still skipped (Steam's unticked default).
- The source todo is closed with the verify correction recorded, and the enable-path UX is filed as a `ready: human` todo.
- Three commits, each staging only its own paths. No unrelated dirty file is committed.
</success_criteria>

<output>
Create `.planning/quick/261120-tbr-opt-in-dlc-depots-treat-installed-opt-in/261120-tbr-SUMMARY.md` when done.
</output>
