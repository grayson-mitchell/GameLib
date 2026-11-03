---
phase: quick-261103-wci
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/bridge/overlay/overlayLaunch.ts
  - src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayLaunch.test.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - .planning/phases/60-steam-overlay-in-bridged-games-on-macos/60-UAT.md
autonomous: true
requirements: [D-07]

must_haves:
  truths:
    - 'On the Phase 59 fallback engine (Wine-Staging + DXVK) with the overlay enabled, a TCP-mode bridge launch passes DYLD_INSERT_LIBRARIES (shim:steamloader:renderer, unquoted, shim first), SteamOverlayGameId, SteamGameId and SteamAppId as PLAIN entries in the launch enviromentOptions, not as CX_ENV tokens'
    - 'The fallback-engine overlay route never clones, re-signs, swaps or restores the wine runner, and the wineserver-ending decision in prepareTcpOverlay is unchanged'
    - 'A fallback-engine overlay setup failure (missing shim, missing Steam dylibs, unsafe path) calls notifyOverlaySetupFailed once and the game still launches without the overlay (fail-open, D-08)'
    - 'With the overlay off (user toggle or known fix) on the fallback engine, no overlay env is added'
    - 'A fallback-engine injection sets overlayInjected, so the attach watch (D-11), the overlay wine log (D-15) and the abnormal-exit check (D-10) run as on CrossOver'
    - 'The launch log line says the env route was used (overlay=env reason=fallback-engine (D-07)) instead of overlay=skipped'
    - '60-UAT.md carries a pending live-gate item for a fallback-engine title under no-crossover.sb, and item 8 (which asserts the old skip) is marked skipped as superseded'
  artifacts:
    - path: src/backend/storeManagers/steam/bridge/overlay/overlayLaunch.ts
      provides: 'buildOverlayEnvVars, prepareOverlayEnv, mergeOverlayEnvVars, OverlayLaunchPayload; buildOverlayCxTokens derived from the same value builder'
      contains: 'buildOverlayEnvVars'
    - path: src/backend/storeManagers/steam/games.ts
      provides: 'fallback-engine branch of prepareTcpOverlay returning { kind: env }; fireBridgeWineLaunch env branch'
      contains: "kind: 'env'"
    - path: .planning/phases/60-steam-overlay-in-bridged-games-on-macos/60-UAT.md
      provides: 'item 9 live gate, result: pending'
      contains: '### 9. '
  key_links:
    - from: games.ts prepareTcpOverlay fallbackEngine branch
      to: overlayLaunch.ts prepareOverlayEnv
      via: 'called only when resolveLaunchOverlay().enabled'
      pattern: 'prepareOverlayEnv\('
    - from: games.ts fireBridgeWineLaunch
      to: overlayLaunch.ts mergeOverlayEnvVars
      via: "overlay.kind === 'env' branch sets launchSettings.enviromentOptions and overlayInjected = true"
      pattern: 'mergeOverlayEnvVars\('
---

<objective>
Inject the Steam overlay on the Phase 59 Wine-Staging + DXVK fallback engine, closing the Phase 60 D-07 gap recorded in `.planning/todos/pending/2026-11-02-steam-overlay-on-fallback-engine.md`.

On CrossOver the overlay is delivered as CX_ENV tokens on a re-signed CrossOver clone runner. The fallback engine needs neither. Its Staging loader is ad-hoc signed with no hardened runtime, so plain `DYLD_INSERT_LIBRARIES` reaches it. Staging ignores CX_ENV. The fallback route therefore passes the same four values as plain `enviromentOptions` entries on the runner the fallback engine already chose. It does no clone, no re-sign and no runner swap.

Purpose: the fallback engine gets the same overlay as CrossOver. Failures still never block a launch.
Output: pure env builders in overlayLaunch.ts, the fallback branch wired in games.ts, unit tests, and a pending live-gate item in 60-UAT.md. The executor cannot run the live gate. Do NOT move or close the todo; the orchestrator does that after the gate.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-11-02-steam-overlay-on-fallback-engine.md
@src/backend/storeManagers/steam/bridge/overlay/overlayLaunch.ts

Load `Skill("gamelib-conventions")` for two rules: the `<verify>` prettier rule and the UAT item shape rule. Load `Skill("spike-findings-gamelib")` reference `steam-overlay-in-bottles.md` for the overlay injection background. Its "CrossOver only so far" note is the gap this plan closes.

Facts already established (do not re-derive):
- `games.ts` imports `appendCxEnvTokens, prepareOverlayLaunch, prepareOverlayTokens` from `./bridge/overlay/overlayLaunch` (~L135-139).
- `prepareTcpOverlay(settings, previousRunner)` (~L4759) declares its return as `{ settings: GameSettings; overlayLaunch?: { tokens: string[]; runnerBin: string } }`. `fallbackEngine` is computed from `getEngineSelection`/`isNonCrossover`. The `if (fallbackEngine)` branch (~L4780) only logs `SteamGame: appId ${this.appId} overlay=skipped reason=fallback-engine (D-07)`. `ok` (CrossOver clone result) stays undefined on the fallback engine, so `nextRunnerDir` is undefined. That drives the `endPerGameBridgeBottleSessionWith` decision, which must stay byte-for-byte unchanged in behaviour. Also unchanged: the trailing `previousRunner?.kind === 'overlay' && !fallbackEngine` return and the catch block (`registered` / `clearDrmBridgeRunner`).
- The same `{ tokens: string[]; runnerBin: string }` type literal appears in `launchBridgeGameBody` (`let overlayLaunch`, ~L4969) and in the `fireBridgeWineLaunch(exePath, bridgeBottleSettings, drm?, overlay?)` signature (~L5360).
- In `fireBridgeWineLaunch`, the `if (!drm && overlay)` block (~L5627-5651) first restores `overlay.runnerBin` when a launch step (known fix) swapped the runner. It then merges tokens via `appendCxEnvTokens` and sets `overlayInjected = true`, or calls `this.notifyOverlaySetupFailed('env', merged.cause)`. After this block `launchSettings` goes straight to `runWineCommand({ gameSettings: launchSettings, ... })` (~L5816). `overlayInjected` gates the attach watch, the abnormal-exit check, the D-15 overlay wine log (`overlayInjected && !drm`) and the shim line forwarder. All four apply to the env route unchanged.
- `backend/launcher.ts` ~L1118 applies `enviromentOptions` as `ret[key] = removeQuoteIfNecessary(value)`. That strips only surrounding double quotes, so plain values must be unquoted.
- `resolveLaunchOverlay()` logs `overlay=on|off source=...` itself and never throws.
- `notifyOverlaySetupFailed(step, cause)` is the fail-open toast and log path (D-08). Steps come from `OVERLAY_STEPS` in overlayNotice.ts (`env`, `shim`, `steam-dylibs`, `clone`, `resign`, ...).
- Test runner is **jest** (`package.json` "test": "jest"), not vitest. Typecheck is `pnpm codecheck` (`tsc --noEmit && tsc -p tsconfig.meta.json --noEmit`).
- games.test.ts mocks `../bridge/overlay/overlayLaunch` at ~L512 with a factory that spreads `jest.requireActual` and overrides `prepareOverlayLaunch` / `prepareOverlayTokens` with `__prepare*Mock` handles. The `describe('Phase 60 overlay (TCP route)')` block (~L13474) holds the existing fallback tests at ~L13631 ("fallback engine: no prepare, skipped log line, no toast (D-07)") and ~L13668 ("fallback engine after an overlay launch ends the clone wineserver"). Both call `prepareTcpOverlay` directly through an `unknown` cast after `setEngineSelection(id, { kind: 'pinned', pinId: 'staging-11', ... })`.
- `no-crossover.sb` lives at `.planning/phases/59-steam-engine-fallback-when-crossover-is-unavailable/wave0/no-crossover.sb`.
- `60-UAT.md` is prettier-ignored (`npx prettier --file-info` returns `"ignored": true`), so its task carries no prettier check.

<interfaces>
From src/backend/storeManagers/steam/bridge/overlay/overlayLaunch.ts (current):
- `type EnvVar = { key: string; value: string }` (module-private; export it)
- `safePath(p)`: absolute, no control chars, no `'`, no `:`
- `export function appendCxEnvTokens(env: readonly EnvVar[], tokens: readonly string[]): { status: 'ok'; env: EnvVar[] } | { status: 'error'; cause: string }`
- `export function buildOverlayCxTokens(a: { appId: string; shimPath: string; steamBinDir: string }): OverlayStepResult<{ tokens: string[] }>`. Tokens, in order: `DYLD_INSERT_LIBRARIES='<shim>:<bin>/steamloader.dylib:<bin>/gameoverlayrenderer.dylib'`, `SteamOverlayGameId=<id>`, `SteamGameId=<id>`, `SteamAppId=<id>`
- `export async function checkOverlayInputs(a: { shimPath; steamBinDir }, deps?: { lstat?; stat? }): Promise<OverlayStepResult>`
- `export async function prepareOverlayTokens(a: TokenArgs, deps?: { checkInputs? }): Promise<OverlayStepResult<{ tokens: string[] }>>`
- Every export carries a `// ts-prune-ignore-next` line above it; follow that convention for the new exports.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Plain-env overlay builders in overlayLaunch.ts, with one shared value builder</name>
  <files>src/backend/storeManagers/steam/bridge/overlay/overlayLaunch.ts, src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayLaunch.test.ts</files>
  <behavior>
    - buildOverlayEnvVars({appId:'3205720', shimPath:'/s/shim.dylib', steamBinDir:SBIN}) returns ok with vars exactly [{key:'DYLD_INSERT_LIBRARIES', value:'/s/shim.dylib:'+SBIN+'/steamloader.dylib:'+SBIN+'/gameoverlayrenderer.dylib'}, {key:'SteamOverlayGameId',value:'3205720'}, {key:'SteamGameId',value:'3205720'}, {key:'SteamAppId',value:'3205720'}]. The value has no quote characters and the shim comes first.
    - buildOverlayEnvVars rejects a bad appId and an unsafe path (relative path, or a path containing `:`, `'` or a control char) with step 'env', exactly as buildOverlayCxTokens does.
    - Drift guard: for the same input, buildOverlayCxTokens tokens equal the env vars mapped to `KEY=value`, with DYLD_INSERT_LIBRARIES single-quoted. All existing buildOverlayCxTokens tests pass unchanged.
    - prepareOverlayEnv calls the injected checkInputs first and returns its error unchanged (e.g. step 'shim'). On ok it returns the buildOverlayEnvVars result. It never rejects; a throwing checkInputs yields step 'env'.
    - mergeOverlayEnvVars(env, vars): a same-key existing entry (exact, case-sensitive key) for SteamOverlayGameId, SteamGameId or SteamAppId is replaced, not duplicated. Unrelated entries such as WINEDEBUG and CX_ENV are kept in order. A lowercase 'steamappid' entry is left alone (env is case-sensitive on macOS).
    - mergeOverlayEnvVars with an existing non-empty DYLD_INSERT_LIBRARIES 'x.dylib' yields one entry valued '<ours>:x.dylib' (ours prepended, shim stays first). An existing value wrapped in double quotes ("x.dylib") is unwrapped before prepending. An existing empty value yields just ours. The result has exactly one DYLD_INSERT_LIBRARIES entry.
    - mergeOverlayEnvVars does not mutate its input array.
  </behavior>
  <action>
In overlayLaunch.ts (per D-07, D-12, D-13), export `EnvVar`. Then add one private value builder, `overlayEnvValues(a)`, that validates appId and the paths (the same APP_ID_RE and safePath checks, same 'env' step errors) and returns the four `{key, value}` pairs in D-12 order, with the DYLD value `shim:loader:renderer` unquoted. Add these exports, each with `// ts-prune-ignore-next`:
- `buildOverlayEnvVars(a)`: returns `OverlayStepResult<{ vars: EnvVar[] }>` from the shared builder.
- Rewrite `buildOverlayCxTokens` to derive from the shared builder. Map each pair to `KEY=value`, and single-quote only the DYLD_INSERT_LIBRARIES value. The token output must stay byte-identical to today's. The two forms cannot drift because both come from one builder.
- `prepareOverlayEnv(a: TokenArgs, deps: { checkInputs?: typeof checkOverlayInputs } = {})`: inputs first, then buildOverlayEnvVars. Wrap it in try/catch so it never rejects, like prepareOverlayTokens.
- `mergeOverlayEnvVars(env: readonly EnvVar[], vars: readonly EnvVar[]): EnvVar[]`: a pure, total function that implements the merge rules in `<behavior>`. Decision for DYLD_INSERT_LIBRARIES: prepend ours to a user-set value rather than clobber it. Our shim must load first, and the user's insert is preserved. Strip one pair of surrounding double quotes from the existing value first. launcher.ts removeQuoteIfNecessary would otherwise leave a quote embedded mid-string. Keep the entries that are not ours in their original order, and append ours at the end, as appendCxEnvTokens does for CX_ENV.
- `export type OverlayLaunchPayload = { kind: 'cx-env'; tokens: string[]; runnerBin: string } | { kind: 'env'; vars: EnvVar[] }`. Task 2 consumes it.
Update the module doc comment to cover the env route: fallback engine, plain env, no clone, Staging ignores CX_ENV. Write the tests from `<behavior>` first in overlayLaunch.test.ts as new describe blocks and add the new imports. Tests are pure: no child processes, and checkInputs is injected.
  </action>
  <verify>
    <automated>npx jest src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayLaunch.test.ts && npx eslint src/backend/storeManagers/steam/bridge/overlay/overlayLaunch.ts src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayLaunch.test.ts && npx prettier --check src/backend/storeManagers/steam/bridge/overlay/overlayLaunch.ts src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayLaunch.test.ts</automated>
  </verify>
  <done>New and existing overlayLaunch tests pass. buildOverlayCxTokens output is unchanged. buildOverlayEnvVars, prepareOverlayEnv, mergeOverlayEnvVars and OverlayLaunchPayload are exported. eslint and the scoped prettier check are clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire the env route into prepareTcpOverlay and fireBridgeWineLaunch</name>
  <files>src/backend/storeManagers/steam/games.ts, src/backend/storeManagers/steam/__tests__/games.test.ts</files>
  <behavior>
    - prepareTcpOverlay on a fallback-engine selection with the overlay enabled and prepareOverlayEnv mocked ok: returns overlayLaunch {kind:'env', vars}. The info log contains `SteamGame: appId <id> overlay=env reason=fallback-engine (D-07)` and no `overlay=skipped` line. prepareOverlayLaunch is not called. setOverlayBridgeRunner is not called. The returned settings are the input settings object (no runner change). No toast.
    - Fallback engine with prepareOverlayEnv returning {status:'error', step:'shim', cause:'overlay shim missing'}: overlayLaunch is undefined, notify is called once, and the warning `appId=<id> reason=overlay-shim` is logged.
    - Fallback engine with the overlay disabled (__resolveOverlayEnabledMock → enabled:false): prepareOverlayEnv is not called and overlayLaunch is undefined.
    - The existing "fallback engine after an overlay launch ends the clone wineserver" test still passes unchanged (wineserver-ending logic untouched).
    - fireBridgeWineLaunch, called directly with overlay {kind:'env', vars} and no drm, while applySteamBridgeKnownFixes swaps wineVersion.bin: the runWineCommand gameSettings keep the swapped (fallback) runner, so the runner is NOT restored. enviromentOptions contain the four plain vars (DYLD_INSERT_LIBRARIES unquoted). No CX_ENV entry contains DYLD_INSERT_LIBRARIES. A pre-existing SteamAppId entry is replaced, not duplicated.
    - Existing CrossOver tests ("overlay on: registers the clone...", "a known fix that swaps the runner is restored to the overlay clone", the DRM-route tests) pass unchanged.
  </behavior>
  <action>
In games.ts (per D-07, D-08), import `prepareOverlayEnv`, `mergeOverlayEnvVars` and `type OverlayLaunchPayload` from `./bridge/overlay/overlayLaunch`. Replace the three `{ tokens: string[]; runnerBin: string }` literals with `OverlayLaunchPayload`: the prepareTcpOverlay return type, the `let overlayLaunch` in launchBridgeGameBody, and the `overlay?` parameter of fireBridgeWineLaunch. The CrossOver success return in prepareTcpOverlay becomes `{ kind: 'cx-env', tokens: ok.tokens, runnerBin: ok.runner.wrapperBin }`.

In the `if (fallbackEngine)` branch, replace the skip-only log. When `this.resolveLaunchOverlay().enabled`, await `prepareOverlayEnv({ appId: this.appId, shimPath: builtOverlayShimPath, steamBinDir: join(userHome, ...MAC_STEAM_CLIENT_SUBPATH) })`; use the same arguments as the CrossOver call, minus appFolder. On error, call `this.notifyOverlaySetupFailed(result.step, result.cause)`. On ok, logInfo `SteamGame: appId ${this.appId} overlay=env reason=fallback-engine (D-07)` and hold the vars in a local `envVars`. Leave `ok` undefined on this branch so `nextRunnerDir` and the endPerGameBridgeBottleSessionWith decision are untouched. Leave the trailing `previousRunner?.kind === 'overlay' && !fallbackEngine` logic untouched. Where the function returns `{ settings }` for the fallback engine, add `overlayLaunch: { kind: 'env', vars: envVars }` when envVars is set. Do not call setOverlayBridgeRunner and do not touch the runner (no clone, no re-sign: the Staging loader is ad-hoc signed with no hardened runtime). Update the prepareTcpOverlay doc comment to describe the env route.

In fireBridgeWineLaunch's `if (!drm && overlay)` block, branch on `overlay.kind`:
- `'cx-env'`: today's code exactly, the runnerBin restore plus appendCxEnvTokens.
- `'env'`: no runner check and no restore. The fallback engine owns its runner, and a known fix's runner choice stands. Set `launchSettings = { ...launchSettings, enviromentOptions: mergeOverlayEnvVars(launchSettings.enviromentOptions ?? [], overlay.vars) }` and `overlayInjected = true`. Wrap the merge in try/catch. A throw calls `this.notifyOverlaySetupFailed('env', ...)` and launches without the overlay (fail-open).
Do not change any wineserver-ending code or the DRM path.

In games.test.ts, add `prepareOverlayEnv` to the `../bridge/overlay/overlayLaunch` jest.mock factory as `__prepareOverlayEnvMock`, following the existing pattern. Without the mock the real fs check would fail and toast in every fallback test. Reset the mock in the Phase 60 TCP describe's beforeEach. Rewrite the "fallback engine: no prepare, skipped log line, no toast (D-07)" test to the new expectations, and add the other `<behavior>` cases. Call prepareTcpOverlay and fireBridgeWineLaunch directly through the same `unknown` cast pattern the file already uses, with `setEngineSelection(... 'staging-11' ...)` and `clearEngineSelection(id)` cleanup. If a direct fireBridgeWineLaunch call needs more harness than the file already provides, drive it through `new SteamGame(id).launch({} as never)` with the engine selection set and assert on `runWineCommand.mock.calls[0][0].gameSettings`. No test spawns a child process, so createFakeHomeProfile does not apply.
  </action>
  <verify>
    <automated>npx jest src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/bridge/overlay/__tests__/ && pnpm codecheck && npx eslint src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/games.test.ts && npx prettier --check src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/games.test.ts</automated>
  </verify>
  <done>Fallback-engine launches with the overlay on carry the four plain env vars on the unchanged runner, log `overlay=env reason=fallback-engine (D-07)`, and set overlayInjected. A setup failure toasts once and still launches. All games.test.ts and overlay tests pass. codecheck, eslint and the scoped prettier check are clean. `grep -n "overlay=skipped reason=fallback-engine" src/backend/storeManagers/steam/games.ts` prints nothing.</done>
</task>

<task type="auto">
  <name>Task 3: Live-gate UAT item for the fallback engine in 60-UAT.md</name>
  <files>.planning/phases/60-steam-overlay-in-bridged-games-on-macos/60-UAT.md</files>
  <action>
Follow the UAT item shape rule from gamelib-conventions: `### N.` heading at column 0, `expected:` inline on one line, and `result:` opening with a bare status word, with prose only after the word.

1. Item 8 ("Fallback engine skipped (D-07)") asserts the skip that this plan removes. Change only its `result:` line to: `result: skipped — superseded by item 9 (quick 261103-wci injects the overlay on the fallback engine via plain env)`. Leave its heading and `expected:` as written, for history.

2. Append item 9 after item 8, in the same shape:
`### 9. Fallback engine overlay via plain env (D-07, quick 261103-wci)`
The `expected:` line is one line that says all of the following:
- Run GameLib under the Phase 59 profile `.planning/phases/59-steam-engine-fallback-when-crossover-is-unavailable/wave0/no-crossover.sb`.
- Launch a TCP-mode bridge title that runs on the fallback engine (Wine-Staging + DXVK). Operator's choice; record the title and appId.
- The launch log has `overlay=on source=default`, `overlay=env reason=fallback-engine (D-07)` and `Wine-Staging` in the engine line, and no `GameLib overlay runner` line.
- Shift+Tab opens Mac Steam's overlay, and it draws correctly and takes clicks (operator judgment, not screenshots). This is the winemac + DXVK-macOS/MoltenVK rendering question.
- `vmmap <game pid>` lists overlay_shim, steamloader and gameoverlayrenderer.
- Record the number of `overlay attach:` lines and whether `vmmap $(pgrep -x wineserver)` also lists gameoverlayrenderer. This is the RESEARCH A1 multiple-attach observation; record it, it does not fail the item by itself.
- The game launches, and no `overlay-exit-abnormal` dialog appears.
- Apply the bridge verified criterion strictly.

Then add: `result: pending`.

Do not touch the frontmatter `status`, other items, or the todo file. The file is prettier-ignored (`npx prettier --file-info` returns ignored: true), so no prettier check applies.
  </action>
  <verify>
    <automated>grep -nE '^### 9\. ' .planning/phases/60-steam-overlay-in-bridged-games-on-macos/60-UAT.md && grep -nE '^result: pending$' .planning/phases/60-steam-overlay-in-bridged-games-on-macos/60-UAT.md | tail -1 && grep -nE '^result: skipped — superseded by item 9' .planning/phases/60-steam-overlay-in-bridged-games-on-macos/60-UAT.md && grep -c 'no-crossover.sb' .planning/phases/60-steam-overlay-in-bridged-games-on-macos/60-UAT.md && npx prettier --file-info .planning/phases/60-steam-overlay-in-bridged-games-on-macos/60-UAT.md | grep -q '"ignored": true'</automated>
  </verify>
  <done>Item 9 exists with an inline expected line naming no-crossover.sb, the env log line, Shift+Tab observation, vmmap evidence and the A1 observation, plus `result: pending`. Item 8's result opens with the bare word `skipped`. No other UAT content changed. The todo is untouched.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GameLib sidecar → wine child env | Values injected into every process the Staging wine launch starts (DYLD_INSERT_LIBRARIES loads code) |
| Per-game enviromentOptions (user/known-fix) → merged env | User-set DYLD_INSERT_LIBRARIES or Steam* keys meet ours |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-wci-01 | Tampering | overlayEnvValues (DYLD path construction) | mitigate | Reuse safePath (absolute, no `:`/`'`/control chars) and APP_ID_RE via the one shared builder; checkOverlayInputs lstat-checks the shim (no symlink follow) before env is built |
| T-wci-02 | Elevation of privilege | DYLD_INSERT_LIBRARIES on the Staging loader | accept | Libraries are GameLib's own bundled shim plus the user's own Mac Steam dylibs; the Staging loader runs as the user with no entitlements gained |
| T-wci-03 | Tampering | mergeOverlayEnvVars vs user DYLD_INSERT_LIBRARIES | mitigate | Prepend, never drop the user value; exactly one entry; case-sensitive key match; unit-tested |
| T-wci-04 | Denial of service | overlay setup failure on fallback | mitigate | prepareOverlayEnv never rejects; merge wrapped in try/catch; every failure → notifyOverlaySetupFailed and launch proceeds (D-08) |
| T-wci-05 | Denial of service | plain env reaches wineserver and helper processes (RESEARCH A1) | accept | Not decidable in code; observed in 60-UAT item 9; the per-game overlay toggle (D-02) and known-fix off key are the existing escape hatches |
</threat_model>

<verification>
- `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/bridge/overlay/__tests__/` passes
- `pnpm codecheck` passes
- `grep -rn "overlay=skipped reason=fallback-engine" src/` prints nothing
- `npx prettier --check` on the four .ts paths passes (60-UAT.md is prettier-ignored)
- `graphify update .` after code changes (CLAUDE.md)
</verification>

<success_criteria>
- Fallback-engine TCP launches with the overlay on carry the four plain overlay env vars and keep the fallback runner. The CrossOver and DRM routes behave exactly as before.
- Fail-open holds on the new route.
- 60-UAT.md item 9 is pending for the operator's live gate under no-crossover.sb. The todo stays in pending/ for the orchestrator.
</success_criteria>

<output>
Create `.planning/quick/261103-wci-inject-steam-overlay-on-the-phase-59-fal/261103-wci-SUMMARY.md` when done
</output>
