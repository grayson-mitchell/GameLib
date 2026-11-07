---
phase: 61-unified-macos-engine-for-all-stores
reviewed: 2026-11-07T08:41:41Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - src/backend/engine/gameProcessWatch.ts
  - src/backend/engine/launchEngine.ts
  - src/backend/engine/demoStatus.ts
  - src/backend/engine/engineDecision.ts
  - src/backend/engine/engineConfig.ts
  - src/backend/engine/toolSettings.ts
  - src/backend/game_config.ts
  - src/backend/tools/index.ts
  - src/backend/sidecar/wineToolsFlowRegistration.ts
  - src/common/types.ts
  - src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.tsx
  - src/frontend/screens/Settings/components/engineOverrideLogic.ts
  - public/locales/en/gamelib.json
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 61: Code Review Report (re-review after gap closure 61-21..61-24)

**Reviewed:** 2026-11-07T08:41:41Z
**Depth:** standard (diff-focused, `fefd2f859..HEAD` (`f183914a6`))
**Files Reviewed:** 13
**Status:** issues_found

The previous full-phase review (101 files, 5 critical / 12 warning / 5 info) is in git history:
`git show 6e481a64a:.planning/phases/61-unified-macos-engine-for-all-stores/61-REVIEW.md`.
Finding IDs below are new. Prior IDs are written as `prev CR-xx` / `prev WR-xx`.

## Summary

The gap closure does what it set out to do. All five prior criticals, prior WR-01 and UAT G-1
are closed in code. The table below shows the evidence for each. No new blocker was found.

The fixes did open some new problems:

- The CR-01 fix adds a decision rule: "inconclusive pre-flight means launch on CrossOver". That
  rule is too broad. It ignores the bottle's current engine marker, so it can force an engine
  switch back to CrossOver. It also lives in the shared `decideLaunchEngine`, so Steam's
  Phase 59 behaviour changes as well (WR-01).
- The notice-only deadline still raises the main window over the running games it can't detect
  (WR-02).
- The new pending-install runner fails silently (WR-03).
- The pending-install runner reaches `GameConfig.get` before validating `appName` (WR-04).
- Running the installer and then cancelling the dialog leaves an orphaned bottle (WR-05).

## Status of the prior findings

| Prior ID | Verdict | Evidence |
| --- | --- | --- |
| prev CR-01 (bottle-name regex) | **Closed** | `demoStatus.ts:93-98` validates with `sanitizeBottleName` plus a 255-character cap, the same chokepoint `resolveGamePrefix` uses, so any name a legacy game can carry is now probed. `CX_BOTTLE` goes in env, not argv (`demoStatus.ts:115-117`). `engineDecision.ts:309-317` maps a residual `invalid-bottle` to `inconclusive`, and `decideLaunchEngine` no longer falls back on an inconclusive result (`:487-509`). The new rule has its own problem: see WR-01. |
| prev CR-02 (deadline kills unmatched games) | **Closed** | `onEngineLaunchDeadline` (`launchEngine.ts:465-495`) no longer kills, stops the runner or calls `endEngineLaunch`. It only shows a notice. A `C:\` form for `drive_c` installs was added (`gameProcessWatch.ts:57-61`), with `bottleDir` passed from `getBottleDir(bottleName)` (`launchEngine.ts:525`). Sideload games carry no `install_path`, so for them the watcher is `null` and the deadline stands down. The `C:\` form helps GOG/Amazon installs pointed at `C:`. The header comment now matches the code. Side effect: WR-02. |
| prev CR-03 (deadline ignores the D-16 ledger) | **Closed** | No `wineserver -k` remains on the deadline path. `killWineserver` was removed from `DeadlineDeps`. |
| prev CR-04 (Sideload Run installer in the wrong prefix) | **Closed** | With an engine choice, `SideloadDialog/index.tsx:283-292` routes through `runWineCommandForGame({ pendingInstall: true, wait: true })`. The sidecar (`wineToolsFlowRegistration.ts:395-402`) dispatches to `runWineCommandForPendingInstall`, which reads the config the dialog just wrote (`getSettings` re-reads the file, so the cached instance is not stale), resolves through `resolveToolSettingsForId(..., { ensureBottle: true })` and runs in the per-game bottle. New issues on this path: WR-03, WR-04, WR-05. |
| prev CR-05 (`engineOverride` default injection) | **Closed** | The injection was removed (`game_config.ts:303-309`), so neither `setSetting` flushes nor `getSettings` carry an engine key for a config-less game. The UI derived value and the launch both come from `readEngineForGame`, and the launch passes `readOverride: () => effective.id` (`launchEngine.ts:273-276`), so they agree. One deliberate trade-off remains: an existing config-less game does not inherit the global Engine pick (D-09 applies to new installs only). The 61-23 decision records this; it is not counted as a finding. |
| prev WR-01 (watcher give-up leaves the deadline armed) | **Closed** | `onGiveUp` now calls `cancelLaunchDeadline(key, 'monitor-unavailable')` (`launchEngine.ts:530-534`). `maxDurationMs` defaults to 185 s, longer than the 180 s deadline, so the max-duration give-up cannot pre-empt a legitimate fire. |
| UAT G-1 (no D-04 confirm for Legacy) | **Closed** | `needsFreshBottleConfirm` includes `'legacy'` (`engineOverrideLogic.ts:54-57`). A Legacy game is never `wineVersion.type === 'crossover'` (that derives Automatic), so the confirm cannot fire falsely on a legacy-CrossOver bottle. The confirm's `onClick` also calls `setBottle(perGameBottleName)`, which in practice closes **prev WR-07** for the Legacy case too. |

The diff does not touch the following prior findings, and they remain open as written in the
prior review. They are carried here for the fixer and are not re-counted: prev WR-02 (the unix
form matches the Wine wrapper, so a hang now fails to get even the notice), prev WR-03, WR-04
(a silent `invalid-bottle` refusal), WR-05, WR-06, WR-08, WR-09 (`.` as a bottle name), WR-10,
WR-11, WR-12, and prev IN-01..IN-05. prev IN-03's redundant condition is still at
`toolSettings.ts:206-210`.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: An inconclusive pre-flight launches on CrossOver whatever engine the bottle is on, and the rule silently changes Steam's Phase 59 decision

**File:** `src/backend/engine/engineDecision.ts:487-509`, also reached from `src/backend/storeManagers/steam/gameLaunch.ts:560` and `src/backend/storeManagers/steam/gameInstall.ts:945`
**Issue:** The new branch returns a `crossover` selection for every `broken + inconclusive`
pre-flight, not only for `invalid-bottle`. That includes the busy-bottle timeout
(`not retried: game running`, `:279-286`). The comment says the bottle is "never rewritten",
but the branch never checks the bottle's engine marker. Take a bottle whose marker is
`non-crossover` because an earlier launch really fell back (expired or broken CrossOver):

- `prepareBottleForEngine` treats CrossOver as a real engine change. It kills the bottle's
  wineserver and restores DXVK. Because `preflight.kind` is `'broken'`, callers pass
  `crossoverHealthy: false` (`gameLaunch.ts`, `gameInstall.ts`). The restore therefore runs
  through the built-in engine, and the game then launches on a CrossOver that may well be
  expired. That is the 59-UAT G10 Expired-dialog hang.
- If another game is in the bottle (the very condition that produced the timeout),
  `busyRefusal` refuses the launch outright. Before this change, the pinned fallback matched
  the marker and the game launched alongside the other one.

`decideLaunchEngine` is shared, so all of this also applies to Steam launches and to Steam
installs into an existing bottle. Steam's UAT covered none of it, and 61-22's "games.test.ts
-t engine unchanged" only shows that no existing test encoded the old behaviour. Separately,
the selection is labelled `reason: 'cx-healthy'` for a pre-flight that proved nothing, so the
D-13 log label misreports the decision.

**Fix:** Keep the bottle on the engine it already runs. Use CrossOver only when the marker
agrees, and give the result an honest label:

```ts
if (preflight.kind === 'broken' && preflight.inconclusive === true && preflight.binDir !== null) {
  const marker = d.markerKind?.(args.bottleName) ?? null // readBottleEngineMarkerKind
  if (marker === 'non-crossover' && override !== 'crossover') {
    const pin = d.pins.current
    logLines.push(`Engine: pre-flight inconclusive (${preflight.detail}); keeping the bottle's built-in engine`)
    return finish(pinnedSelection(pin, 'cx-broken' /* or a new 'cx-inconclusive', no toast */), preflight, pin, !d.isPinInstalled(pin))
  }
  // ...existing crossover return, with reason 'cx-inconclusive' instead of 'cx-healthy'
}
```

Alternatively, limit the branch to `invalid-bottle`, which is what CR-01 needed, and decide the
busy-timeout policy in a separate, Steam-reviewed change. Add a test that pairs a
non-crossover marker with a busy-timeout pre-flight, for both a non-Steam key and a Steam
appId.

### WR-02: The no-kill deadline notice raises GameLib's main window and a modal over a game that is running

**File:** `src/backend/engine/launchEngine.ts:476-492`, `src/backend/engine/engineDialogs.ts:25-26`
**Issue:** Since 61-21, the deadline fires exactly in the cases where the matcher cannot see a
running game. These are bare-basename launches, launcher stubs that exec elsewhere, and the
unix-form-only window under CrossOver (spike 068). For those games the deadline fires on
**every** launch, 180 s in. `showEngineDialog` then calls `app.raiseMainWindow()`, opens a
modal and posts an OS notification, which pulls focus away from a fullscreen game the user is
playing. The notice text ("couldn't confirm ... has not been stopped") admits the game may be
fine, yet the delivery is still the interrupting kind built for "Game didn't start".

**Fix:** Deliver this tag without raising the window. Either add `raise?: boolean` to
`showEngineDialog` and pass `raise: false`, or send only the OS notification plus a game-page
notice (the `EngineNotices` surface) for `launch-deadline-unconfirmed`. Consider skipping the
notice entirely when the store launcher process is still alive and has produced log output.

### WR-03: Run installer fails silently when the bottle or engine is unavailable, and the dialog reports nothing

**File:** `src/backend/tools/index.ts:1590-1608`, `src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.tsx:283-292,305-309`
**Issue:** `runWineCommandForPendingInstall` returns `{ stdout: '', stderr: '' }` both on the
non-sideload refusal and on `resolved.kind === 'unavailable'`. `unavailable` covers
`bottle-not-created` (for example, the pinned-engine download fails offline or `wineboot`
times out) and `no-engine`. The renderer treats the resolved promise as success. The button
returns from "Running Setup" and nothing happens: no installer, no dialog, and an error only
in the backend log. This is a first-run path, so a new user is the one most likely to hit it
(no CrossOver, engine not yet downloaded).

**Fix:** Surface the failure. Either throw from `runWineCommandForPendingInstall`, so the
dialog's existing `catch` runs, and show an error in the dialog:

```ts
if (resolved.kind === 'unavailable') {
  throw new Error(`no usable Wine environment (${resolved.reason})`)
}
```

or return an error field that SideloadDialog renders, reusing the
`gamelib:steam.engine.downloadFailed` copy for `bottle-not-created`.

### WR-04: The pending-install IPC path calls `GameConfig.get(appName)` before validating `appName`, which can write a file outside the games-config directory

**File:** `src/backend/tools/index.ts:1597`, `src/backend/sidecar/wineToolsFlowRegistration.ts:395-402`
**Issue:** `appName` comes from the renderer unchecked. `GameConfig.get` → `reload` →
`GameConfigV0.upgrade()` calls `writeToFile` on `join(gamesConfigPath, appName + '.json')`
unconditionally (`game_config.ts:46-74,85-101,197-207`). A traversal value such as
`../../../../Library/LaunchAgents/x` therefore creates `x.json` (`{}`) outside
`gamesConfigPath`, or rewrites an existing JSON file there. Name validation happens only later,
inside `resolveToolSettingsForId` (`engineKeyFor`). `writeConfig` fences this exact shape with
`isContainedGameConfig` (Phase 31 WR-01), and the 61-24 summary claims T-61-24-01/02 are
mitigated. The new entry point is not covered. The written content is not attacker-controlled,
and `requestGameSettings` already has the same pre-existing shape, so the impact is limited.
Still, this is a new, unfenced write sink.

**Fix:** Validate before touching config:

```ts
if (engineKeyFor('sideload', args.appName) === null) {
  logError(`runWineCommandForPendingInstall refused an invalid appName`, LogPrefix.Backend)
  throw new Error('invalid appName')
}
const stored = await GameConfig.get(args.appName).getSettings()
```

(`engineKeyFor` rejects `/`, `\`, `..`, NUL and padded names.) Fencing `requestGameSettings` the
same way is worth doing in a follow-up.

### WR-05: Run installer followed by Cancel orphans a whole per-game bottle

**File:** `src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.tsx:160,260-292`, `src/backend/tools/index.ts:1598-1602`
**Issue:** Each new sideload dialog generates a fresh `short.generate()` app name (`:160`). Run
installer now creates a real bottle for that name (`ensureBottle: true`: a wineboot-initialised
prefix, often hundreds of MB once an installer has run) and writes the game's config. If the
user then closes the dialog without pressing Finish, no library entry ever names that bottle.
Nothing in GameLib lists or removes it, and each retry under a new dialog leaves another one.
Before CR-04, the installer ran in the shared prefix, so only a stray config file was left.

**Fix:** Have the dialog record that it created the bottle. On close without Finish, ask
whether to remove it (the engine layer has `removeCreatedBottleDir` for exactly this
created-by-us case), or at minimum log the orphan with its name so a later cleanup can find it.
Alternatively, keep the generated `app_name` stable across reopenings of an unfinished sideload
add, so retries reuse one bottle.

## Info

### IN-01: The engine-eligibility rule now exists twice

**File:** `src/backend/engine/toolSettings.ts:138-144`, `src/backend/engine/engineEligibility.ts:15-24`
**Issue:** `resolveToolSettingsForId` re-implements `engineKeyIfEligible` without the native
check, and `resolveToolSettings` runs both. A later change to one (a new excluded platform or
capability) will not reach the other, and tools and launch will disagree on eligibility.
**Fix:** Extract `engineKeyForId({ runner, appName, platform }, onMac)` into
`engineEligibility.ts`. Have `engineKeyIfEligible` call it after its `isNative()` check, and
have `resolveToolSettingsForId` call it directly.

### IN-02: The demo-status log line now carries an unvalidated, user-controlled bottle name

**File:** `src/backend/engine/demoStatus.ts:72-75`
**Issue:** The old `BOTTLE_RE` incidentally kept control characters out of
`bottle=${bottleName.slice(0, 64)}`. `sanitizeBottleName` rejects only `/`, `\`, `..` and NUL,
so a stored `wineCrossoverBottle` containing `\n` (the renderer `writeConfig` does not validate
it; see prev WR-09) can forge log lines in the launch log users attach to bug reports.
**Fix:** Log `bottle=${JSON.stringify(bottleName.slice(0, 64))}`.

### IN-03: `onEngineLaunchDeadline` is a synchronous function dressed as async

**File:** `src/backend/engine/launchEngine.ts:465-495`
**Issue:** The function lost its `async` but keeps a `Promise<void>` return type and a trailing
`return Promise.resolve()`. `armLaunchDeadline` accepts `void | Promise<void>`, so this is noise
that suggests awaited work.
**Fix:** Return `void` and drop the `Promise.resolve()`.

### IN-04: The notice-only deadline gives up D-10 hang recovery and holds the ledger while hung; record the trade-off

**File:** `src/backend/engine/launchEngine.ts:458-464`
**Issue:** This is a deliberate 61-21 decision, so it is not counted as a defect. A launch truly
stuck behind CrossOver's Expired dialog or a wedged wineserver is no longer stopped. The engine
registry, overlay context and D-16 ledger entry stay held until the user presses Stop, so every
engine switch in that bottle is refused as busy until then. The phase goal's "launch timeout"
wording in ROADMAP/CONTEXT now overstates what non-Steam launches get.
**Fix:** Note the change against D-10/D-18 in the phase CONTEXT or decision log, and make sure
the game page's Stop for a bottle-backed launch stops through the selected engine's wineserver.

---

_Reviewed: 2026-11-07T08:41:41Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
