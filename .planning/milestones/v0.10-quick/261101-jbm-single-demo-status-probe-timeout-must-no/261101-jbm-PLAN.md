---
phase: quick-261101-jbm
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/engine/engineDecision.ts
  - src/backend/storeManagers/steam/engine/__tests__/engineDecision.test.ts
  - src/backend/storeManagers/steam/engine/__tests__/fixtures/stub-wine.sh
  - .planning/todos/pending/2026-11-01-demo-status-probe-timeout-flips-bottle-to-cx-broken.md
  - .planning/todos/completed/2026-11-01-demo-status-probe-timeout-flips-bottle-to-cx-broken.md
autonomous: true
requirements: [TODO-2026-11-01-demo-status-probe-timeout]

must_haves:
  truths:
    - "If one --demo-status probe times out and the retry returns Standard version or Demo version (N days remaining), the launch stays on CrossOver (reason cx-healthy). No pinned selection is produced, so prepareBottleForEngine never switches the engine or rewrites user.reg."
    - "Only a second timeout in a row on the same preflight call returns kind 'broken' and so cx-broken. A sustained hang still counts as broken CrossOver, as phase 59 D-09 requires."
    - "Definitive answers still demote on the first probe, with no retry: expired goes to cx-expired, and nonzero-exit, spawn-error, invalid-bottle and unrecognised output go to cx-broken. Real trial-expiry fallback (spike 060) is unchanged."
    - "If a timeout is followed by a definitive answer, the definitive answer wins (timeout then expired gives cx-expired; timeout then nonzero-exit gives cx-broken)."
    - "The decision stays stateless per D-07. The corroboration happens inside a single preflightCrossover call, and nothing is stored between launches."
  artifacts:
    - path: "src/backend/storeManagers/steam/engine/engineDecision.ts"
      provides: "preflightCrossover treats a single timeout as inconclusive: it stops the wineserver, retries once, and returns broken only after two timeouts"
      contains: "PROBE_TIMEOUT_ATTEMPTS"
    - path: "src/backend/storeManagers/steam/engine/__tests__/engineDecision.test.ts"
      provides: "Tests for single-timeout recovery, double-timeout demotion and definitive-failure demotion (stub deps and real stub wine)"
    - path: "src/backend/storeManagers/steam/engine/__tests__/fixtures/stub-wine.sh"
      provides: "hang-once stub mode: the first call hangs, the second prints Standard version"
      contains: "hang-once"
    - path: ".planning/todos/completed/2026-11-01-demo-status-probe-timeout-flips-bottle-to-cx-broken.md"
      provides: "Closed todo with a Result section"
  key_links:
    - from: "preflightCrossover"
      to: "d.probe"
      via: "a second call only when the first result is { kind: 'failed', reason: 'timeout' }"
      pattern: "reason === 'timeout'"
    - from: "decideLaunchEngine / decideCreationEngine"
      to: "preflightCrossover"
      via: "unchanged consumers. The fix sits entirely in preflight, so both launch and bottle creation benefit"
      pattern: "preflightCrossover\\("
---

<objective>
Stop a single transient `--demo-status` timeout from marking CrossOver broken for a bridge bottle. Today one 15 s timeout returns `preflight.kind === 'broken'`. `decideLaunchEngine` then picks the pinned Wine-Staging + DXVK engine with `reason=cx-broken`, and `SteamGame.selectLaunchEngine` (src/backend/storeManagers/steam/games.ts ~3901-4000) calls `prepareBottleForEngine`, which switches the bottle and rewrites engine-dependent `user.reg` entries (Marlett/Symbol font paths). This happened on the 11:22 and 12:04 Schedule I launches on 2026-11-01 (.planning/debug/fullscreen-3440-dx11-crossover.md) and confounded the 58-37 windowed workaround.

Chosen rule: corroborate the hang within the same preflight call.
- A timeout is inconclusive. Preflight stops the bottle's CrossOver wineserver (this already happens) and runs the probe once more.
- Two timeouts in a row are a corroborated hang, which is broken under D-09.
- Every other probe result is definitive and keeps its current mapping on the first attempt.

This keeps D-07: nothing is stored, and each launch re-probes. It keeps D-09: a sustained hang still routes to the fallback. It keeps spike 060's trial-expiry detection: `Demo version (expired N days ago)` still demotes at once.

The bottle is only mutated when the decision is pinned. So "never mutate on a single timeout" holds once preflight stops returning broken for one timeout. No change to games.ts or engineSwitch.ts is needed.

Purpose: unblock the debug session's next action (a GameLib bridge launch of Schedule I on CrossOver with the CX_GRAPHICS_BACKEND=dxvk known-fix) and stop spurious engine flips.
Output: the preflight change, tests for it, and the todo moved to completed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/todos/pending/2026-11-01-demo-status-probe-timeout-flips-bottle-to-cx-broken.md
@src/backend/storeManagers/steam/engine/engineDecision.ts
@src/backend/storeManagers/steam/engine/__tests__/engineDecision.test.ts
@src/backend/storeManagers/steam/engine/__tests__/fixtures/stub-wine.sh

Load `Skill("gamelib-conventions")` before writing. The rules that apply here:
- Fake-HOME isolation (two-profile rule). The real-probe tests already use `createFakeHomeProfile` and `profile.childEnv(...)`. Keep that, and do not hand-roll an `env` literal.
- Sidecar exit contract. This change adds NO timers, watchers or children. The retry reuses `probeDemoStatus`, which already unrefs its timer, child and pipes. Do not add a delay or backoff timer between the attempts. Retry immediately after the wineserver kill settles.
- The `<verify>` prettier check covers the exact paths written.

Locked decisions from phase 59 (.planning/phases/59-steam-engine-fallback-when-crossover-is-unavailable/59-CONTEXT.md):
- D-07: falling back is decided per launch and is not stored. Do NOT add a persisted failure counter or a "last timeout" store.
- D-09: only preflight checks count as broken. `--demo-status` that "errors, hangs past its own short cap, or prints unrecognised output" is broken, and expired routes to the fallback. This plan narrows "hangs" to a hang seen on two consecutive capped attempts. It does not change the cap (`DEMO_STATUS_CAP_MS = 15_000` in demoStatus.ts stays as it is).

<interfaces>
From src/backend/storeManagers/steam/engine/demoStatus.ts (do not modify):
- `DemoStatusProbe = { kind: 'ok'; status: DemoStatus; elapsedMs } | { kind: 'failed'; reason: 'invalid-bottle' | 'spawn-error' | 'timeout' | 'nonzero-exit'; detail; elapsedMs }`
- `DemoStatus = licensed | trial{daysRemaining} | expired{daysAgo} | unrecognised`

From engineDecision.ts (current preflightCrossover, after the executable check):
- `Promise.all([d.readBuild(binDir).catch(() => null), d.probe({ binDir, bottleName, baseEnv: d.probeEnv, timeoutMs: d.probeTimeoutMs })])`
- On `probe.kind === 'failed'`: if the reason is `'timeout'`, `await d.killCrossoverWineserver(bottleName, binDir)` inside a try/catch that calls logWarning. Then return `{ kind: 'broken', binDir, build, detail: \`--demo-status ${probe.reason}: ${probe.detail}\` }`.
- After that, the ok-status mapping: licensed/trial -> healthy, expired -> expired, unrecognised -> broken.

Test harness (engineDecision.test.ts):
- `ok(status)` and `failed(reason)` builders.
- `mkDeps(over)` gives stub deps, with the default probe returning licensed.
- `real(mode)` builds the deps for the real probe against the stub wine. It uses `probeTimeoutMs: 500` and `probeEnv: profile.childEnv({ ...process.env, STUB_MODE: mode })`.
- Existing tests that this change affects: the `it.each(['timeout','spawn-error','nonzero-exit'])` preflight test (it asserts kill was called once for a timeout) and the real-probe `it.each` row `['hang', { kind: 'broken' }]` (it asserts kill was called once for hang).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Treat a single demo-status timeout as inconclusive and retry once before cx-broken</name>
  <files>src/backend/storeManagers/steam/engine/engineDecision.ts, src/backend/storeManagers/steam/engine/__tests__/engineDecision.test.ts, src/backend/storeManagers/steam/engine/__tests__/fixtures/stub-wine.sh</files>
  <behavior>
    Stub-deps tests (probe is a jest.fn returning a scripted sequence; kill is a jest.fn):
    - Timeout then licensed: preflight returns healthy with trialDaysRemaining null. The probe is called 2 times and kill 1 time, with ('B', CX_BIN).
    - Timeout then trial(5): healthy with trialDaysRemaining 5.
    - Timeout then expired(2): expired with daysAgo 2. The definitive answer after a retry still demotes.
    - Timeout then nonzero-exit: broken, and the detail contains 'nonzero-exit'. The probe is called 2 times and kill 1 time.
    - Timeout then timeout: broken, and the detail contains 'timeout' and '2'. The probe is called 2 times and kill 2 times, once after each timeout so a hung wineserver is not left running.
    - Definitive first results get no retry. For each of 'spawn-error', 'nonzero-exit', 'invalid-bottle', ok(unrecognised) and ok(expired), the probe is called exactly 1 time, kill 0 times, and the kind is unchanged from today (broken / broken / broken / broken / expired). Replace the existing `it.each(['timeout','spawn-error','nonzero-exit'])` test: its timeout row now expects 2 kills and 2 probe calls. Widen the `failed()` builder's reason union to include 'invalid-bottle'.
    - decideLaunchEngine with probe sequence [timeout, licensed]: selection { kind: 'crossover', reason: 'cx-healthy' }, needsDownload false. No pinned selection, so the bottle is not switched.
    - decideLaunchEngine with probe sequence [timeout, timeout]: selection { kind: 'pinned', reason: 'cx-broken', pinId: ENGINE_PINS.current.id }.
    - decideLaunchEngine with a single ok(expired): pinned cx-expired, probe called once. This is the trial-expiry regression guard.
    - decideCreationEngine with [timeout, licensed]: { kind: 'crossover', probed: true }. With [timeout, timeout]: { kind: 'pinned', reason: 'cx-broken' }.
    Real-probe tests (stub wine, fake HOME, probeTimeoutMs 500):
    - The 'hang' row still maps to broken, and kill is now called 2 times.
    - New 'hang-once' row: the first spawn hangs and the second prints Standard version. It maps to healthy with trialDaysRemaining null, and kill is called 1 time.
  </behavior>
  <action>
1. Fixture stub-wine.sh: add a case arm `hang-once)`. If the file named by `$STUB_STATE` exists, echo "Standard version". Otherwise create it (`: > "$STUB_STATE"`) and `exec sleep 30`. Keep POSIX sh and match the existing one-line-per-arm style. Leave the other arms as they are.

2. In engineDecision.ts `preflightCrossover`, add a module-local constant `PROBE_TIMEOUT_ATTEMPTS = 2`. Do not export it, so ts-prune is not tripped. Add a comment citing this todo, D-09 (a hang must be corroborated), D-07 (no stored state) and the 2026-11-01 Schedule I flip.
   - Keep the first probe in the `Promise.all` with readBuild, exactly as it is now.
   - Then loop. While the latest probe is `{ kind: 'failed', reason: 'timeout' }`:
     - Stop the wineserver with the existing try/catch kill block, kept verbatim. Move it into a small local helper so it is not duplicated.
     - If attempts are below PROBE_TIMEOUT_ATTEMPTS, log a `logWarning` with LogPrefix.Steam. Use text like "SteamEngine: --demo-status timed out for bottle <name> (attempt 1/2); inconclusive, retrying once". Slice the bottle name to 64 characters, as demoStatus.ts does.
     - Then `await d.probe(...)` again with the same args: binDir, bottleName, baseEnv d.probeEnv, timeoutMs d.probeTimeoutMs.
   - If the final probe is still a timeout after PROBE_TIMEOUT_ATTEMPTS, return broken with detail `--demo-status timeout on ${PROBE_TIMEOUT_ATTEMPTS} consecutive attempts: ${probe.detail}`.
   - Any other failed reason, on either attempt, returns broken with the existing detail format and no further retry.
   - An ok result on either attempt falls through to the existing status mapping, unchanged.
   - Do not touch demoStatus.ts, DEMO_STATUS_CAP_MS, decideLaunchEngine, decideCreationEngine, games.ts or engineSwitch.ts. Their behaviour follows from preflight.
   - Add no timers or delays (sidecar exit contract).
   - Update the file header doc comment so it mentions that a timeout is retried once.

3. Tests in engineDecision.test.ts. Write them first: run them and watch the new single-timeout cases fail (RED), then implement step 2 (GREEN).
   - Add a helper `seq(...results: DemoStatusProbe[])` that returns a jest.fn. The fn resolves the results in order and repeats the last one.
   - Implement every behavior bullet above.
   - For the real-probe 'hang-once' row, extend `real(mode, extraEnv?)` so it merges `STUB_STATE: join(profile.root, 'hang-once.state')` into the `profile.childEnv({...})` argument. Keep the fake-HOME `childEnv` route and do not hand-roll an env.
   - Change the real-probe kill-count expectation from `mode === 'hang' ? 1 : 0` to a per-row expected count: hang 2, hang-once 1, others 0.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --selectProjects Backend --runTestsByPath src/backend/storeManagers/steam/engine/__tests__/engineDecision.test.ts src/backend/storeManagers/steam/engine/__tests__/demoStatus.test.ts src/backend/storeManagers/steam/engine/__tests__/engineState.test.ts && pnpm codecheck && npx eslint src/backend/storeManagers/steam/engine/engineDecision.ts src/backend/storeManagers/steam/engine/__tests__/engineDecision.test.ts && npx prettier --check src/backend/storeManagers/steam/engine/engineDecision.ts src/backend/storeManagers/steam/engine/__tests__/engineDecision.test.ts && grep -c "hang-once" src/backend/storeManagers/steam/engine/__tests__/fixtures/stub-wine.sh</automated>
    Prettier scope note: `npx prettier --file-info` reports `{ "ignored": false, "inferredParser": null }` for `__tests__/fixtures/stub-wine.sh`. Prettier has no shell parser, so `--check` on it would error rather than prove anything. It is deliberately left out of the check, and the grep confirms the edit landed. Both .ts paths report `"inferredParser": "typescript"` and are checked.
  </verify>
  <done>All behavior cases pass. A single timeout followed by a good answer yields CrossOver and no pinned selection. Two consecutive timeouts yield cx-broken. Expired and the other definitive failures demote on the first probe, with the probe called once. codecheck, eslint and scoped prettier are clean. No new timers. demoStatus.ts, games.ts and engineSwitch.ts are unchanged (`git diff --stat` shows only the three Task 1 files).</done>
</task>

<task type="auto">
  <name>Task 2: Close the todo (move pending -> completed with a Result section)</name>
  <files>.planning/todos/pending/2026-11-01-demo-status-probe-timeout-flips-bottle-to-cx-broken.md, .planning/todos/completed/2026-11-01-demo-status-probe-timeout-flips-bottle-to-cx-broken.md</files>
  <action>
Follow the closure convention of commit 4a0197156. The closed directory in this repo is `.planning/todos/completed/`. There is no `done/` directory, so do not create one.

1. Run `git mv` to move the pending file to `.planning/todos/completed/` under the same filename.
2. Keep the frontmatter exactly as it is: the `severity: medium`, `platform: macos`, `ready: code` triage fields stay bare, lowercase and in that order, per the todo-triage convention.
3. Append a `## Result` section. In the corpus's plain prose style, state:
   - The fix is in quick-261101-jbm, with the code commit hash.
   - The rule: a timeout is inconclusive, so preflight stops the wineserver and retries once. Two consecutive timeouts mean cx-broken (D-09 still holds). Expired, nonzero-exit, spawn-error, invalid-bottle and unrecognised still demote on the first probe, so spike 060's trial-expiry fallback is unchanged. Nothing is stored (D-07).
   - The worst-case preflight is now about 2 x 15 s plus the wineserver kill before a corroborated-hang fallback.
   - Not done: no live GameLib bridge launch was run. If the probe on the operator's machine times out on both attempts, the hang itself still needs root-causing. The debug session showed repeated timeouts at 11:22 and 12:04, and that hang is a separate investigation, not covered here. A dev restart is needed before any live test, because tauri dev does not rebuild the sidecar.
4. Run `pnpm planning-gates`.
5. Commit the closure separately from the code commit, as `docs(quick-261101-jbm): close demo-status probe timeout todo`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test ! -e .planning/todos/pending/2026-11-01-demo-status-probe-timeout-flips-bottle-to-cx-broken.md && grep -c "^## Result" .planning/todos/completed/2026-11-01-demo-status-probe-timeout-flips-bottle-to-cx-broken.md && pnpm planning-gates</automated>
    Prettier: both paths are under `.planning`, which prettier ignores (`{ "ignored": true, "inferredParser": null }`). `--check` would be vacuous, so it is omitted on purpose.
  </verify>
  <done>The pending file is gone. The completed file has its frontmatter intact and a Result section. planning-gates passes. The closure is committed separately.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GameLib backend -> CrossOver bin/wine | Local child process. Its output is parsed by the existing parseDemoStatus. No new input surface. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-jbm-01 | Denial of service | preflightCrossover retry | mitigate | The retry is bounded to exactly one extra capped attempt (PROBE_TIMEOUT_ATTEMPTS = 2, each capped by DEMO_STATUS_CAP_MS). A hung wineserver is killed after each timeout. No unbounded loop and no new timer. |
| T-jbm-02 | Tampering | bottle user.reg / engine registry | mitigate | No mutation path is added. A pinned selection, and therefore prepareBottleForEngine, is reached only on a definitive failure or a corroborated hang. Tests assert that a single timeout yields a crossover selection. |
| T-jbm-03 | Elevation of privilege | expired-trial bypass | accept | Expired still demotes on the first probe (regression test). GameLib never edits CrossOver's licence or NagTime (unchanged, 59-01). |
</threat_model>

<verification>
- The engineDecision, demoStatus and engineState jest suites are green.
- `pnpm codecheck` passes, and eslint and scoped prettier are clean on the .ts files.
- `git diff --stat HEAD~2` covers only the three Task 1 source/test files plus the todo move.
- The todo is in `.planning/todos/completed/` and `pnpm planning-gates` passes.
</verification>

<success_criteria>
A single `--demo-status` timeout no longer demotes CrossOver or mutates the bottle. Two consecutive timeouts, and every definitive failure including trial expiry, still route to the pinned engine exactly as phase 59 specified.
</success_criteria>

<output>
Create `.planning/quick/261101-jbm-single-demo-status-probe-timeout-must-no/261101-jbm-SUMMARY.md` when done.
</output>
