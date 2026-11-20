---
phase: quick-261027-aue
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.tsx
  - public/locales/en/gamelib.json
  - .planning/todos/pending/2026-10-26-bridge-launch-fails-fast-while-steam-is-quit-or-signing-in.md
  - .planning/todos/completed/2026-10-26-bridge-launch-fails-fast-while-steam-is-quit-or-signing-in.md
  - .planning/todos/pending/2026-10-27-bridge-waits-for-steam-live-gate.md
autonomous: true
requirements: [TODO-2026-10-26-bridge-launch-fails-fast-while-steam-is-quit-or-signing-in]

must_haves:
  truths:
    - "With Mac Steam quit, a bridge launch opens Steam (steam://open/main via the shell opener) and keeps retrying with a fresh helper process until Steam is signed in, then launches the game -- or, after the bounded wait, reports 'steam-not-running' / 'steam-not-signed-in', never 'not-inited'"
    - "With Steam still signing in (InitFlat: ConnectToGlobalUser failed), the launch retries with a fresh helper each attempt instead of failing in under 1 s"
    - "A non-transient InitFlat failure (any error text other than the two known Steam-state strings) is never retried: the existing D-51-04 480 fallback and 'not-inited' path run exactly as today"
    - "The wait is bounded: no new helper is spawned once STEAM_WAIT_BUDGET_MS (60 s) has elapsed since the first transient failure; every timer is unref'd"
    - "A helper whose InitFlat failed is never reused by a later call (InitFlat runs once per process) -- it is stopped and respawned"
    - "The setup dialog shows reason-accurate copy: Steam not running, Steam not signed in yet, or Steam refused a session; the two Steam-state reasons do not offer the bottled-Steam fallback and do not poison the session (next Play retries the bridge)"
  artifacts:
    - path: "src/backend/storeManagers/steam/bridge/helperProcess.ts"
      provides: "INIT-line classification, bounded respawn loop, Steam start, onWaitingForSteam hook"
      contains: "STEAM_WAIT_BUDGET_MS"
    - path: "src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.tsx"
      provides: "per-reason copy for steam-not-running / steam-not-signed-in / not-inited"
      contains: "steam-not-signed-in"
    - path: ".planning/todos/pending/2026-10-27-bridge-waits-for-steam-live-gate.md"
      provides: "live-gate todo for the Mac verification"
      contains: "ready: live-gate"
  key_links:
    - from: "helperProcess.ts INIT-line parser"
      to: "bridge_helper.c init_steam_api_once's `InitFlat failed r=%d err=%s appid=%s (is Steam running + signed in?)` log line"
      via: "regex on the child's own stderr, appid-checked like LISTEN/READY"
      pattern: "InitFlat failed"
    - from: "src/backend/storeManagers/steam/games.ts launch()"
      to: "ensureBridgeHelperReady(appId, { onWaitingForSteam })"
      via: "notify() once when the wait starts"
      pattern: "onWaitingForSteam"
---

<objective>
Action the todo `.planning/todos/pending/2026-10-26-bridge-launch-fails-fast-while-steam-is-quit-or-signing-in.md`
(it is the spec -- read it in full). On macOS a bridge launch with Steam quit, or started ~1 s after
Steam, fails in under 1 s with a misleading "Steam appears signed out" outcome, because the helper's
single `SteamAPI_InitFlat` call fails fast. GameLib must do the waiting: classify the InitFlat
failure, start Steam when it is not running, respawn the helper on a bounded schedule while Steam
starts/signs in, and show accurate copy for each outcome.

Output: helperProcess.ts classification + bounded retry, games.ts wiring, dialog copy, unit tests,
todo closed and live-gate todo filed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-10-26-bridge-launch-fails-fast-while-steam-is-quit-or-signing-in.md
@src/backend/storeManagers/steam/bridge/helperProcess.ts
@.planning/quick/261026-k6o-bridge-helper-waits-for-init-line/261026-k6o-SUMMARY.md

Load `Skill("gamelib-conventions")` before starting (todo frontmatter, fake-HOME spawn rule, sidecar
exit contract, scoped prettier in verify).

**Working tree is dirty with unrelated edits** (`src/backend/storeManagers/steam/bridge/allowlist.ts`,
`bridge-allowlist.json`, `__tests__/allowlist.test.ts`, `.planning/notes/per-game-compat-fixes-architecture.md`,
an unclaimed-world todo, `.planning/debug/unclaimed-world-wmv-mf.md`). Stage ONLY this plan's paths
with explicit `git add <path>` (never `git add -A`, `git add .`, or `git commit -a`). Never commit
those other files. Do not edit `.planning/STATE.md` -- the quick orchestrator records the task there.

<interfaces>
Facts gathered at planning time (no further exploration needed):

bridge_helper.c, `init_steam_api_once(g_appid)` (L412-449) logs on failure, via
`logts("INIT", msg)` = `fprintf(stderr, "[%s] %-6s %s\n", ts, cat, msg)`:
  `[2026-..Z] INIT   InitFlat failed r=<int> err=<text> appid=<g_appid> (is Steam running + signed in?) -- serving HEALTH/HELLO only until a real session is live`
This INIT line is written BEFORE the `READY  init=failed appid=<g_appid>` line (L1027) on the same
stream, so it is always parsed before `initReady` settles. `g_appid` is the same value the LISTEN
line echoes (`'480'` for the identity-only helper) -- check it against `expectedListenAppId`
exactly like `handleListenLine`/`handleReadyLine` do (T-51-05 / T-k6o-01).

Measured err texts (261026-k6o SUMMARY, live gate):
  - Steam quit:            `Could not determine Steam client install directory`
  - Steam still signing in: `ConnectToGlobalUser failed`
(`ConnectToGlobalUser failed` is also what a running-but-signed-out Steam is expected to return,
so it cannot be told apart from "still signing in" at one instant -- the bounded wait resolves it.)

helperProcess.ts today: `ensureBridgeHelperReady(appId)` -> `ensureHelperSpawned` (REUSES any live
entry, including one whose InitFlat failed) -> `probeHelperReadiness` (waitForPort, waitForInit,
HEALTH/HELLO/WHOAMI poll). WHOAMI fail on the full helper -> `stopBridgeHelper` + identity-only
480 fallback; both fail -> `sendFrontendMessage('steamBridgeSetupRequired', {appName, reason:'not-inited'})`
+ the log line "...Steam appears signed out (D-51-04)" (L824). The failed 480 helper is left
running. Existing unref'd `sleep(ms)` helper at L227. Test override pattern:
`__setBridgeHelperPathForTests`, `__setBridgeHelperSpawnEnvForTests`, `__resetBridgeHelperStateForTests`.

Starting Steam -- existing app-level opener: `import { shell } from 'backend/platform'`;
`shell.openExternal(url, { activate: false })` is how games.ts L2698 hands `steam://rungameid/...`
to Mac Steam. The Rust `open_external` command allows the `steam` scheme
(`OPEN_EXTERNAL_ALLOWED_SCHEMES`, src-tauri/src/main.rs L2232). `isMac` from
`backend/constants/environment`.

games.ts launch(), L3097-3115: `const helperReady = await ensureBridgeHelperReady(this.appId)`;
on not-ready it calls `markBridgeFailedThisSession(this.appId)` (which flips later routing away
from the bridge for the rest of the process) and sends
`steamBridgeSetupRequired({ appName, reason: helperReady.status, fallbackAvailable: true })`.
`notify({ title, body })` from `backend/dialog/dialog` with `i18next.t('gamelib:steam.bridge....', default)`
is the established backend toast pattern (`maybeNotifyBridgeLimited`, L2781).

SteamBridgeSetup.tsx: `tGamelib = useTranslation('gamelib').t`; renders generic
`bridge.setup.message` (recommends bottled fallback), then `Reason: {{reason}}`, then reason-gated
`tGamelib('steam.bridge.setup.<key>', default)` paragraphs (`drmCeg` example, L154-162); fallback
button gated on `fallbackAvailable`. Keys live in public/locales/en/gamelib.json under
`steam.bridge.setup` (L460-464); only `en` carries gamelib.json keys. gamelib.json is
prettier-ignored (`--file-info` -> ignored:true), so it gets no prettier check.

helperProcess.test.ts: mocks `node:child_process.spawn`, `node:net.Socket`, `backend/ipc`,
`backend/logger`, `backend/constants/paths`, `node:fs`; `FakeChildProcess`, `emitListenLine(child, port, appId, ready)`,
`emitReadyLine`, `FakeSocket(...frames)`. It does NOT mock `backend/platform` yet -- add
`jest.mock('backend/platform', () => ({ shell: { openExternal: jest.fn() } }))` and
`jest.mock('backend/constants/environment', ...)` only if needed for `isMac` (prefer making the
starter injectable, below). games.test.ts already mocks `backend/platform` (L172) and
`backend/dialog/dialog` (L188), and mocks `ensureBridgeHelperReady` as a jest.fn.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: helperProcess.ts -- classify InitFlat failures, start Steam, bounded respawn loop</name>
  <files>src/backend/storeManagers/steam/bridge/helperProcess.ts, src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts</files>
  <behavior>
    - classifyInitFlatError('Could not determine Steam client install directory') -> 'steam-not-running'; ('ConnectToGlobalUser failed') -> 'steam-not-signed-in'; any other text, empty, or no INIT line seen -> 'other' (substring match, case-sensitive, on the err text only)
    - INIT line whose appid differs from the spawned appid is ignored (classification stays 'other')
    - Steam quit: first full helper INIT = not-running -> Steam starter called exactly once, onWaitingForSteam('steam-not-running') called once, NO 480 fallback spawn, helper stopped and respawned after the interval; attempt 3 READY init=ok + WHOAMI ok -> { status:'ready', ready:true, port, secret } of the LAST entry; no steamBridgeSetupRequired
    - Signing in: INIT = ConnectToGlobalUser failed twice then ok -> ready; starter NOT called
    - Budget exhausted while still ConnectToGlobalUser -> { status:'steam-not-signed-in', ready:false }, exactly one steamBridgeSetupRequired({ reason:'steam-not-signed-in', fallbackAvailable:false }), no helper left in the registry; same for not-running -> 'steam-not-running'; spawn count bounded (never more than 1 + floor(budget/interval) + 1)
    - Non-transient (READY init=failed with no INIT line, or an unknown err text) -> unchanged D-51-04 path: 480 fallback spawned once, no retry, no starter call, reason 'not-inited' (existing test at ~L608 keeps passing unmodified)
    - A registry entry with initOutcome 'failed' is stopped and respawned by the next ensureBridgeHelperReady call, not reused (the existing 'live identity-only READY entry reused' test at ~L656 keeps passing)
  </behavior>
  <action>
Write the tests first (RED), then implement. In helperProcess.ts:

(a) Classification. Add exported pure `classifyInitFlatError(err: string | null): 'steam-not-running' | 'steam-not-signed-in' | 'other'` and a module-level `INIT_FAILED_LINE` regex matching the INIT line shape in `<interfaces>` (capture err text and appid; err capture must tolerate arbitrary text up to the final ` appid=<digits> (is Steam running` marker). Add `initError: string | null` to `BridgeHelperEntry` (init null) and parse it in `handleStderrLine` beside LISTEN/READY with the same `matchedAppId !== expectedListenAppId` guard and same `entry.child === child` check. Do not log the err text a second time (the per-line relay already logs it).

(b) Probe short-circuit. In `probeHelperReadiness`, after `waitForInit` returns 'seen', if `entry.initOutcome === 'failed'` and `classifyInitFlatError(entry.initError)` is not 'other', return a new outcome `{ outcome: 'steam-wait', cause, port }` without running the HEALTH/WHOAMI poll (the result is already known; skipping the 250 ms polls keeps each attempt sub-second). Extend `HelperReadinessProbe['outcome']` accordingly.

(c) No reuse of a failed init. At the top of `ensureBridgeHelperReady` (after the appId guard), if `helpers.get(appId)?.initOutcome === 'failed'`, call `stopBridgeHelper(appId)` first -- InitFlat runs once per process, so such an entry can never become ready (todo: "Any retry must respawn the helper").

(d) Bounded respawn loop, full-AppID helper only. Constants with justification comments: `STEAM_WAIT_BUDGET_MS = 60_000` (a cold Mac Steam launch plus update check plus auto sign-in is tens of seconds -- unmeasured, the live gate records the real figure; 60 s matches the todo's guidance and is long enough that a normal cold start lands inside it while a user left at Steam's login screen gets an answer within a minute) and `STEAM_RETRY_INTERVAL_MS = 3_000` (each failing attempt is a sub-second fast-fail spawn writing ~4 log lines, so 3 s caps the loop at ~20 spawns). Make both overridable via a new `__setSteamWaitScheduleForTests({ budgetMs, intervalMs } | null)` hook and reset it in `__resetBridgeHelperStateForTests`. Change the signature to `ensureBridgeHelperReady(appId, options?: { onWaitingForSteam?: (cause) => void; startSteam?: () => Promise<void> })`. When the full helper's probe returns 'steam-wait': record `waitStart = Date.now()` on the first one; call `options.onWaitingForSteam?.(cause)` once per call; if cause is 'steam-not-running' and Steam has not yet been started in this call, call the starter once (default starter: on `isMac` only, `shell.openExternal('steam://open/main', { activate: false })` from `backend/platform`, wrapped in try/catch with logWarning -- `activate:false` for the same Console-mode Space reason games.ts L2692 gives; a failed open is not fatal, the loop still waits). Then `stopBridgeHelper(appId)`, `await sleep(intervalMs)` (the existing unref'd sleep -- sidecar exit contract: every timer unref'd, and the loop is bounded and only runs inside a user-initiated launch, never at boot), check the budget BEFORE each new spawn (`Date.now() - waitStart >= budgetMs` -> stop; worst case total wall time is budget + one attempt), respawn with `ensureHelperSpawned(appId)` and re-probe. Ready -> return as today. 'unreachable' -> existing unreachable branch. 'not-inited' (non-transient WHOAMI fail) -> existing D-51-04 480 fallback. Budget exhausted -> `stopBridgeHelper(appId)`, logWarning naming the cause and elapsed ms, `sendFrontendMessage('steamBridgeSetupRequired', { appName, reason: cause, fallbackAvailable: false })`, return `{ status: cause, ready: false, error }`. Add `'steam-not-running' | 'steam-not-signed-in'` to `BridgeHelperReadyStatus`. The 480 fallback itself is never entered on a transient cause (a Steam-level failure fails 480 identically, per the todo).

(e) Fix the misleading log at the final not-inited branch: replace "Steam appears signed out" with "Steam refused a session for both the real AppID and the identity-only 480 fallback" (it is only reached on non-transient errors now). Also `stopBridgeHelper(appId)` there so a failed 480 helper does not linger (consistent with (c)).

Update the module docblock and `ensureBridgeHelperReady`'s JSDoc bullets for the new outcomes. Tests: drive multi-spawn with `mockedSpawn.mockImplementation` returning a new `FakeChildProcess` per call that, on `process.nextTick`, emits LISTEN (ready=null), then the INIT failed line (or nothing), then READY; set the schedule hook to tiny values (e.g. budget 40 ms, interval 5 ms) with real timers; pass a `startSteam: jest.fn().mockResolvedValue(undefined)` and `onWaitingForSteam: jest.fn()`. Add one test that the default starter is used when none is injected: mock `backend/platform` and assert `shell.openExternal` called with `'steam://open/main'` (mock `backend/constants/environment` `isMac: true` for that test file, or keep the default starter's `isMac` check behind the injectable seam -- executor's choice, document it). Add a classifyInitFlatError table test.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts && pnpm codecheck && npx prettier --check src/backend/storeManagers/steam/bridge/helperProcess.ts src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts && test "$(grep -vE '^[[:space:]]*(//|\*)' src/backend/storeManagers/steam/bridge/helperProcess.ts | grep -c 'appears signed out')" = 0 && grep -q "STEAM_WAIT_BUDGET_MS" src/backend/storeManagers/steam/bridge/helperProcess.ts</automated>
  </verify>
  <done>Classification table, not-running-then-ready (starter called once, no 480 spawn), signing-in-then-ready, both budget-exhausted outcomes (one setup message, fallbackAvailable false, registry empty, bounded spawn count), non-transient unchanged path, and no-reuse-of-failed-entry tests all pass alongside every pre-existing helperProcess test; codecheck exit 0; prettier clean on both paths; no "appears signed out" left in code.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: games.ts wiring + dialog copy for each outcome</name>
  <files>src/backend/storeManagers/steam/games.ts, src/backend/storeManagers/steam/__tests__/games.test.ts, src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.tsx, public/locales/en/gamelib.json</files>
  <behavior>
    - helperReady.status 'steam-not-running' or 'steam-not-signed-in' -> launch returns false, runWineCommand not called, markBridgeFailedThisSession NOT applied (a second launch() with a ready mock goes down the bridge path again), steamBridgeSetupRequired sent with { reason: status, fallbackAvailable: false }
    - helperReady.status 'not-inited' / 'unreachable' -> unchanged (session still marked failed, fallbackAvailable true) -- the existing test at ~L2420 keeps passing
    - launch() passes an onWaitingForSteam callback; invoking it fires notify() once with the gamelib:steam.bridge.waiting.* strings
  </behavior>
  <action>
games.ts launch() at the `ensureBridgeHelperReady(this.appId)` call (L3097): pass `{ onWaitingForSteam: (cause) => notify({ title, body }) }` using `i18next.t('gamelib:steam.bridge.waiting.title', 'Waiting for Steam')` and body `gamelib:steam.bridge.waiting.notRunning` ("Starting Steam. The game will launch once Steam has signed in.") or `gamelib:steam.bridge.waiting.signingIn` ("Waiting for Steam to finish signing in. The game will launch once it has.") by cause -- the user otherwise sees up to a minute of silence after pressing Play. In the not-ready branch, when status is one of the two Steam-state causes, skip `markBridgeFailedThisSession` (the failure is about Steam's state, not this game's bridge; poisoning would reroute the next Play away from the bridge -- memory: bottled Steam is a narrow fallback, never a reroute for a non-DRM failure) and send `fallbackAvailable: false`; keep the existing behaviour for every other status. Update the adjacent log line to name the cause.

SteamBridgeSetup.tsx: when `reason` is 'steam-not-running' or 'steam-not-signed-in', render the reason paragraph INSTEAD of the generic `bridge.setup.message` (which recommends the bottled fallback and is wrong here). Add reason-gated `tGamelib` paragraphs, mirroring the drmCeg block:
  - `steam.bridge.setup.steamNotRunning`: "Steam did not start. GameLib tried to open it and waited a minute. Open Steam, sign in, then press Play again."
  - `steam.bridge.setup.steamNotSignedIn`: "Steam is open but not signed in. GameLib waited a minute for it to finish signing in. Sign in to Steam, then press Play again."
  - `steam.bridge.setup.notInited` (reason 'not-inited', shown in addition to the generic message): "Steam is running but refused to start a session for this game. Check that Steam is signed in to the account that owns it."
Add the five new keys (three setup + waiting.title/notRunning/signingIn under a new `steam.bridge.waiting` object) to public/locales/en/gamelib.json in the existing alphabetical-ish style, defaults byte-identical to the code. Do not touch other locales.

games.test.ts: add the two transient-status tests and the onWaitingForSteam -> notify test (capture the options arg from the `ensureBridgeHelperReady` mock and invoke it). Reset with `__resetBridgeFailedSessionForTests` as neighbouring tests do.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts && pnpm codecheck && npx prettier --check src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.tsx && node -e "const j=require('./public/locales/en/gamelib.json').steam.bridge; for (const k of ['steamNotRunning','steamNotSignedIn','notInited']) if(!j.setup[k]) throw k; for (const k of ['title','notRunning','signingIn']) if(!j.waiting[k]) throw k"</automated>
    (public/locales/en/gamelib.json is prettier-ignored per `npx prettier --file-info` -> `"ignored": true`, so it is checked by the node key assertion instead of prettier.)
  </verify>
  <done>games.test.ts passes including the three new tests and the unchanged not-inited test; codecheck exit 0; prettier clean on the three TS/TSX paths; all six locale keys present.</done>
</task>

<task type="auto">
  <name>Task 3: Close the todo and file the live-gate todo</name>
  <files>.planning/todos/pending/2026-10-26-bridge-launch-fails-fast-while-steam-is-quit-or-signing-in.md, .planning/todos/completed/2026-10-26-bridge-launch-fails-fast-while-steam-is-quit-or-signing-in.md, .planning/todos/pending/2026-10-27-bridge-waits-for-steam-live-gate.md</files>
  <action>
Follow the 261027-9vr convention (commit c765f51e7): `git mv` the todo from `.planning/todos/pending/` to `.planning/todos/completed/` (same filename) and append a `## Resolution` section: closed by quick `261027-aue` (2026-10-27); the classification (two err strings -> two causes, everything else unchanged), Steam started via `steam://open/main` through the shell opener, fresh-helper respawn every 3 s within a 60 s budget, no 480 fallback and no session poisoning on a Steam-state cause, accurate dialog copy and a waiting toast; list the task commit hashes; note the live check is filed as `2026-10-27-bridge-waits-for-steam-live-gate.md`.

Create `.planning/todos/pending/2026-10-27-bridge-waits-for-steam-live-gate.md` with frontmatter in this order: `created: 2026-10-27`, `title: "Bridge launch's wait-for-Steam retry is unverified on a live Mac"`, `severity: medium`, `platform: macos`, `ready: live-gate` (bare lowercase, severity/platform/ready consecutive, per gamelib-conventions), then `area: steam-bridge`, `found_by: "quick 261027-aue execution, 2026-10-27"`, `files:` (helperProcess.ts, games.ts, SteamBridgeSetup.tsx). Body: Problem (unit-tested only); Verify on this Mac after restarting `tauri dev` (memory: tauri dev does not rebuild the sidecar -- check sidecar.js mtime): (1) quit Steam, press Play on a bridge game -> Steam opens, the waiting toast shows, the game launches once Steam signs in, gamelib.log shows several `InitFlat failed ... Could not determine` then `ConnectToGlobalUser failed` attempts then READY init=ok; (2) start Steam and press Play immediately -> game launches after sign-in; (3) quit Steam, sign out / stay at the login window for over a minute -> dialog shows the not-signed-in copy with no bottled-Steam button; record the measured cold-start-to-READY seconds to confirm or retune `STEAM_WAIT_BUDGET_MS`.

Do not edit `.planning/STATE.md`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test ! -e .planning/todos/pending/2026-10-26-bridge-launch-fails-fast-while-steam-is-quit-or-signing-in.md && grep -q "## Resolution" .planning/todos/completed/2026-10-26-bridge-launch-fails-fast-while-steam-is-quit-or-signing-in.md && grep -q "^ready: live-gate$" .planning/todos/pending/2026-10-27-bridge-waits-for-steam-live-gate.md && pnpm planning-gates</automated>
    (Both todo .md files are prettier-ignored -- `npx prettier --file-info` on a `.planning/todos/` path reports `"ignored": true` -- so no prettier check is carried; `pnpm planning-gates` is the gate that applies.)
  </verify>
  <done>Old todo lives in completed/ with a Resolution section naming the commits; new live-gate todo passes planning-gates with severity/platform/ready in order; only this plan's paths are staged and committed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| helper stderr -> backend | the backend parses INIT/READY/LISTEN text off its own child's stderr |
| sidecar -> Rust open_external | sidecar asks the shell to open a steam:// URL |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-aue-01 | Spoofing | INIT-line parser | mitigate | only the spawned child's own stream is parsed, and the line's appid must equal expectedListenAppId (same rule as T-51-05/T-k6o-01) |
| T-aue-02 | Denial of service | respawn loop | mitigate | hard wall-clock budget checked before every spawn, unref'd sleeps, previous helper stopped before each respawn so at most one helper per appId exists |
| T-aue-03 | Tampering | steam:// open | accept | the URL is a fixed constant (`steam://open/main`), no user or appId input; scheme already allow-listed in Rust |
</threat_model>

<verification>
- `npx jest src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts`
- `pnpm codecheck`, `pnpm planning-gates`
- `git status --short` shows the unrelated allowlist/notes/debug edits still unstaged and uncommitted
</verification>

<success_criteria>
A bridge launch with Steam quit or signing in waits (bounded at 60 s, fresh helper per attempt) and
launches, or ends with copy that names the real cause; real non-transient failures behave exactly
as before; todo closed; live gate filed.
</success_criteria>

<output>
Create `.planning/quick/261027-aue-bridge-launch-waits-for-steam-to-start-s/261027-aue-SUMMARY.md` when done
</output>
