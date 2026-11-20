---
phase: quick-261105-sqe
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
autonomous: true
requirements: [QUICK-261105-sqe]

must_haves:
  truths:
    - "After InstallApp returns ok on the downloader-ON Mac route, the poll reports the game installed with no steam-waiting-for-restart context, no listSteamClientPids probe, and no persisted restart hold"
    - "When InstallApp is OFF, unavailable or errors, the startInstallPolling call and the D-UAT-13 hold behave exactly as before (the option key is absent from the call)"
    - "If a poll for the app already exists when the adopted handoff arrives (upgrade branch), the hold is released and any persisted record cleared"
    - "The 'starting install polling' log line reports adoptedBySteamClient"
  artifacts:
    - path: "src/backend/storeManagers/steam/library.ts"
      provides: "PollOptions.adoptedBySteamClient; poll steamHold starts 'released' when set"
      contains: "adoptedBySteamClient"
    - path: "src/backend/storeManagers/steam/games.ts"
      provides: "Adoption-ok branch passes adoptedBySteamClient: true"
      contains: "adoptedBySteamClient"
  key_links:
    - from: "src/backend/storeManagers/steam/games.ts"
      to: "startInstallPolling"
      via: "conditional spread of adoptedBySteamClient: true when adoptedByInstallApp"
      pattern: "adoptedBySteamClient: true"
    - from: "startInstallPolling entry init"
      to: "shouldHoldForSteamRestart"
      via: "steamHold === 'released' early return"
      pattern: "adoptedBySteamClient"
---

<objective>
Stop the D-UAT-13 "restart Steam to finish" hold from arming after Mac Steam has already
adopted a GameLib depot download via the experimental InstallApp helper (quick 261105-ord,
live gate item 2: appId 112100 showed Fully Installed in Steam, but GameLib held in
steam-waiting-for-restart).

Purpose: the hold exists because a running Steam never reads a manifest GameLib wrote. An ok
InstallApp outcome is positive evidence Steam knows the install, so the hold premise is false.
Output: a new `adoptedBySteamClient` poll option, the games.ts caller passing it, and Jest coverage.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/quick/261105-ord-steam-experimental-installapp-setting-ma/261105-ord-SUMMARY.md

Load `Skill("gamelib-conventions")` before writing verify commands (scoped prettier rule).

<interfaces>
Verified by the planner against the current tree (line numbers approximate):

library.ts ~L130 `type PollOptions = { intervalMs?, source?, isNativeHandoff?, macNativeRoute?,
skippedDepots?, delegatedToSteamClient?, restoredSteamHold?: { pids: number[]; startTicks: number } }`
— each install-poller-only option has a JSDoc citing its quick id.

library.ts ~L2771 `function releaseSteamHold(appId, poll: { steamHold: 'unprobed'|'holding'|'released' })`
— sets 'released' and calls clearSteamRestartHold(appId). The single place a hold ends.

library.ts ~L2821 `async function shouldHoldForSteamRestart(appId, poll, source)` —
returns false if `!poll.isNativeHandoff || source !== 'native'`, then returns false if
`poll.steamHold === 'released'` BEFORE any listSteamClientPids probe or recordSteamRestartHold.
Only the 'unprobed' branch ever calls recordSteamRestartHold. So an entry starting at 'released'
never probes, never holds, never persists. No change needed in this function.

library.ts ~L3397 upgrade branch: `const existingEntry = activePolls.get(appId); if (existingEntry) { ... }`
— handles `isNativeHandoff: true` (sets macNativeRoute, skippedDepots, source retarget) and
`delegatedToSteamClient: true` upgrades, then returns (idempotent, no second interval).

library.ts ~L3462-3497 destructure with defaults for both the number and options forms
(each field typed explicitly in the annotation object), ~L3500 the log line
`Steam: starting install polling for appId ${appId} (interval ..., source ..., isNativeHandoff ..., skippedDepots ..., delegatedToSteamClient ...)`,
~L3505 `const entry = { ..., steamHold: (restoredSteamHold ? 'holding' : 'unprobed') as ..., ... }`.

library.ts ~L3294 the restart toast `notifyRestartSteamToFinish` is already gated by
`!poll.macNativeRoute`, so the Mac route never toasts — unaffected.

library.ts ~L815-850 boot re-arm reads persisted holds (steamRestartHold store) and calls
startInstallPolling with restoredSteamHold. It only re-arms what recordSteamRestartHold wrote;
the adopted path writes none, so no change is needed there. Frontend `steam-waiting-for-restart`
(MainButton.tsx, GameStatus.tsx, hasStatus.ts) is derived purely from the poll's status context.

games.ts ~L3369-3425 (quick 261105-ord): `let adoptedByInstallApp = false` ... on
`outcome.kind === 'ok'` sets it true and clearPendingAdoption(this.appId); then always
`startInstallPolling(this.appId, { isNativeHandoff: true, skippedDepots: handoff.skippedDepots, macNativeRoute: true })`.

library.test.ts: `jest.mock('../steamClientProcess', () => ({ listSteamClientPids: jest.fn(), readSteamProcessStartTokens: jest.fn() }))`
(~L319). D-UAT-13 suite `describe('install poller holds steam-waiting-for-restart on the StateFlags=4 fast path (D-UAT-13)'`
at ~L5869 with helpers `statusPayloads()`, `sentCalls(channel)`, `wasStopped()`, `pollInstallOnce('730')`,
`RESTART_NOTIFY`, `FINISHED_NOTIFY`, StateFlags=4 ACF fixture; see the fail-open test at ~L6032
("Steam NOT running at finalize") for the shape of an "installed immediately" assertion.

games.test.ts: `describe('SteamGame — quick 261105-ord experimental InstallApp'` at ~L15040,
inner `describe('downloader ON route (adoption after GameLib download)'` ~L15161. The ok test
("Steam running + ok: ... polling opts unchanged ...", ~L15171) asserts the exact object
`{ isNativeHandoff: true, skippedDepots: [], macNativeRoute: true }`; the `it.each` over
`unavailable` / `error 18` at ~L15192 asserts recordPendingAdoption only; plus "Steam not running"
and "setting OFF" tests.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: adoptedBySteamClient poll option releases the D-UAT-13 hold up front</name>
  <files>src/backend/storeManagers/steam/library.ts, src/backend/storeManagers/steam/__tests__/library.test.ts</files>
  <behavior>
    - Adopted poll + Steam running: `listSteamClientPids` mocked `[111]`, `startInstallPolling('730', { intervalMs: 60000, isNativeHandoff: true, macNativeRoute: true, adoptedBySteamClient: true })`, one `pollInstallOnce('730')` → no status payload carries context `steam-waiting-for-restart`; `library.get('730')?.is_installed` is true / a pushGameToLibrary was sent (mirror the fail-open test's installed assertions); `listSteamClientPids` and `readSteamProcessStartTokens` were never called (so recordSteamRestartHold cannot have run); `wasStopped()` true; RESTART_NOTIFY never sent.
    - Upgrade branch: start a bare download poll `startInstallPolling('730', { intervalMs: 60000 })`, then call it again with `{ isNativeHandoff: true, macNativeRoute: true, adoptedBySteamClient: true }`, poll once with Steam `[111]` → same expectations as above (no hold, no probe).
    - Control (byte-identical when absent): the existing hold test that passes only `isNativeHandoff: true` still holds — leave the existing D-UAT-13 tests untouched and passing.
  </behavior>
  <action>
    Write the two tests first inside the existing D-UAT-13 describe in library.test.ts (RED), then implement.
    In library.ts PollOptions add `adoptedBySteamClient?: boolean` next to `delegatedToSteamClient`, with a JSDoc in the neighbours' style: install-poller-only (quick 261105-sqe); true only when a running Steam client accepted GameLib's finished depot install via InstallApp, so Steam already knows the manifest and the D-UAT-13 restart hold's premise does not apply; the poll starts with the hold released, never probes Steam PIDs and never persists a restart hold. Add it to the destructure: typed `adoptedBySteamClient: boolean`, default `false` in the number form, `intervalMsOrOptions.adoptedBySteamClient ?? false` in the options form. Append `, adoptedBySteamClient ${adoptedBySteamClient}` to the "starting install polling" log line (end of the parenthesised list). In the `entry` literal change the steamHold initialiser to: restoredSteamHold → 'holding', else adoptedBySteamClient → 'released', else 'unprobed' (restoredSteamHold keeps precedence; the two are never combined by any caller). Do not store adoptedBySteamClient on the entry — the 'released' state is the whole effect. In the existing-entry upgrade branch, add a block mirroring the delegatedToSteamClient upgrade: when the options form has `adoptedBySteamClient === true` and `existingEntry.steamHold !== 'released'`, call `releaseSteamHold(appId, existingEntry)` (this also clears any persisted record) and logInfo `Steam: in-flight install poll for appId ${appId} adopted by the Steam client via InstallApp — restart hold released (quick 261105-sqe)`. Place it before the live-monitor eligibility check and the return. Do not touch shouldHoldForSteamRestart, the boot re-arm, or the macNativeRoute toast gate (see interfaces: none can re-arm a hold that was never recorded). When the flag is absent every code path must be byte-identical to today.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/__tests__/library.test.ts -t "D-UAT-13" && npx jest src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/steamRestartHold.test.ts</automated>
  </verify>
  <done>Both new tests pass, they fail with the library.ts change reverted, and every existing library.test.ts / steamRestartHold.test.ts test still passes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: games.ts passes adoptedBySteamClient only on an ok InstallApp adoption</name>
  <files>src/backend/storeManagers/steam/games.ts, src/backend/storeManagers/steam/__tests__/games.test.ts</files>
  <behavior>
    - ok + Steam running: startInstallPolling called with exactly `{ isNativeHandoff: true, skippedDepots: [], macNativeRoute: true, adoptedBySteamClient: true }` (update the existing ok test's expectation and drop "polling opts unchanged" from its name, e.g. "... polling marked adopted by the Steam client ...").
    - In the existing `it.each` (unavailable not-signed-in, error 18): add `expect(startInstallPollingSpy).toHaveBeenCalledWith(APP_ID, { isNativeHandoff: true, skippedDepots: [], macNativeRoute: true })` — exact object, so the key must be absent.
    - In "Steam not running" and "setting OFF" ON-route tests: add the same exact-object assertion (no adoptedBySteamClient key).
  </behavior>
  <action>
    Update/add the test assertions first (RED on the ok test), then in games.ts change the startInstallPolling call that follows the adoption branch to add the key only when adopted, via a conditional spread `...(adoptedByInstallApp ? { adoptedBySteamClient: true } : {})` after `macNativeRoute: true`. Use the conditional spread (not `adoptedBySteamClient: adoptedByInstallApp`) so the non-adopted call object stays byte-identical to today, which keeps the existing exact-object expectations and the absent-flag behaviour unchanged. Extend the quick 261105-ord comment above the branch by one sentence: an ok adoption also tells the poller Steam already knows the install, so no D-UAT-13 restart hold arms (quick 261105-sqe). Touch nothing else in games.ts.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/__tests__/games.test.ts -t "261105-ord experimental InstallApp" && npx jest src/backend/storeManagers/steam/__tests__/games.test.ts</automated>
  </verify>
  <done>The ok test expects the flag, the unavailable/error/not-running/setting-OFF tests assert its absence with exact objects, and the full games.test.ts suite passes.</done>
</task>

<task type="auto">
  <name>Task 3: Typecheck, lint and format gates on touched paths</name>
  <files>src/backend/storeManagers/steam/library.ts, src/backend/storeManagers/steam/games.ts, src/backend/storeManagers/steam/__tests__/library.test.ts, src/backend/storeManagers/steam/__tests__/games.test.ts</files>
  <action>
    Run the repo typecheck (`pnpm codecheck`, which runs tsc --noEmit for app and meta), eslint on the four touched files, and per the gamelib-conventions `<verify>` rule a scoped prettier check over exactly those four paths. First confirm with `npx prettier --file-info <path>` (one path per call) that none is ignored — the planner confirmed library.test.ts is not ignored and infers typescript; if any path turns out ignored, drop only that path from the check and note it in the SUMMARY. Fix any finding (run `npx prettier --write` on the exact paths only, never `.`). Then run `graphify update .` per CLAUDE.md.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm codecheck && npx eslint src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts && npx prettier --check src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts</automated>
  </verify>
  <done>codecheck, eslint and scoped prettier all exit 0 on the four touched paths.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sidecar → Steam client IPC (InstallApp helper) | The outcome kind decides whether the hold is skipped |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-sqe-01 | Tampering / misreport | games.ts adoption branch | mitigate | The flag is set only on `outcome.kind === 'ok'`; unavailable/error keep the hold and the pending-adoption record (asserted by exact-object tests in Task 2) |
| T-sqe-02 | Denial of service (UI stranded) | library.ts poll init / upgrade | mitigate | 'released' is set via the existing releaseSteamHold chokepoint on upgrade, which also clears any persisted record so a GameLib restart cannot re-arm it |
</threat_model>

<verification>
- Targeted jest suites green: library.test.ts, steamRestartHold.test.ts, games.test.ts.
- Absent flag is byte-identical: no existing D-UAT-13 or 261105-ord test changed except the ok test's expected object.
- Live re-check (operator, after `pnpm tauri:dev` restart so the sidecar rebuilds): repeat 261105-ord live gate item 2 — expect log line "starting install polling ... adoptedBySteamClient true", no "holding in steam-waiting-for-restart", and the game page shows Play.
</verification>

<success_criteria>
An InstallApp-adopted Mac native install is reported installed immediately with no restart hold
and no persisted hold record; every other route holds exactly as before; typecheck, eslint and
scoped prettier pass.
</success_criteria>

<output>
Create `.planning/quick/261105-sqe-release-the-d-uat-13-restart-hold-when-s/261105-sqe-SUMMARY.md` when done
</output>
