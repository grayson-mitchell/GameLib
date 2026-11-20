---
phase: quick-261029-thl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/platform/openDetached.ts
  - src/backend/platform/index.ts
  - src/backend/platform/__tests__/openExternalBackground.test.ts
  - src/backend/storeManagers/steam/macSteamOffline.ts
autonomous: true
requirements: [QUICK-261029-THL]

must_haves:
  truths:
    - "On macOS, shell.openExternal(steamUrl, { activate: false }) in the running sidecar opens the URL via a detached `/usr/bin/open -g`, so the target app is not raised"
    - "Steam Refresh's go-offline (`steam://open/gooffline`) is fired with { activate: false }"
    - "Non-darwin, activate !== false, non-steam schemes, and an unbound transport behave exactly as today (Rust frame or no-op)"
    - "The renderer-reachable Rust open_external and its scheme allowlist are unchanged"
    - "fakeHomeIsolation.test.ts stays green"
  artifacts:
    - path: "src/backend/platform/openDetached.ts"
      provides: "spawnOpenDetached (relocated from macSteamOffline) + shouldOpenInBackground predicate"
      exports: ["spawnOpenDetached", "shouldOpenInBackground"]
    - path: "src/backend/platform/__tests__/openExternalBackground.test.ts"
      provides: "Seam tests for the background branch of shell.openExternal"
  key_links:
    - from: "src/backend/platform/index.ts shell.openExternal"
      to: "src/backend/platform/openDetached.ts spawnOpenDetached"
      via: "darwin && options.activate === false && steam: scheme && transport bound"
      pattern: "shouldOpenInBackground"
    - from: "src/backend/storeManagers/steam/macSteamOffline.ts defaultMacSteamOfflineDeps"
      to: "shell.openExternal"
      via: "openUrl default passes { activate: false }"
      pattern: "openExternal\\(url, \\{ activate: false \\}\\)"
---

<objective>
Make `shell.openExternal(url, { activate: false })` actually open in the background on macOS, and
make the Steam go-offline verb use it, so Steam Refresh stops bringing Mac Steam to the front.

Purpose: `platform/index.ts:712` drops `options`; the Rust `open_external` calls
tauri-plugin-opener `open_url(url, None)` = plain `/usr/bin/open`, which activates Steam. Three
callers already pass `{ activate: false }` (steam/games.ts ~3530 and ~3567, bridge/helperProcess.ts
~787) and silently get activation. The go-online half already uses `spawnOpenDetached`
(`/usr/bin/open -g`), which does not raise Steam.

Seam chosen (Claude's discretion): sidecar-side, in `platform/index.ts`, NOT a Rust frame change.
Reasons: (1) no frame-protocol/Rust change and no Rust rebuild; (2) the Rust `open_external` is
renderer-reachable (`withGlobalTauri: true`) — leaving it untouched keeps its
`OPEN_EXTERNAL_ALLOWED_SCHEMES` allowlist and the pinned five-member test intact; (3) the background
branch is restricted to the `steam:` scheme only (a strict subset of that allowlist, and the only
scheme any `activate: false` caller uses), so the direct spawn widens nothing — every other URL still
goes through the Rust check.

Output: relocated helper module, background branch in `shell.openExternal`, macSteamOffline default
`openUrl` passing `{ activate: false }`, seam unit tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
Load `Skill("gamelib-conventions")` before touching the spawn site (fake-HOME two-profile rule,
sidecar exit contract) and before running verify (prettier rule).

@src/backend/platform/index.ts (lines ~140-152 transport/bindTransport; ~700-715 shell)
@src/backend/storeManagers/steam/macSteamOffline.ts (lines ~20-45 imports; ~93-110 deps interface; ~120-150 spawnOpenDetached; ~170-195 defaults)
@src/backend/__tests__/fakeHomeIsolation.test.ts

<interfaces>
From src/backend/platform/index.ts:
  export interface ElectronStubTransport { openExternal: (url: string) => void; pushFrontendMessage: (channel: string, ...args: unknown[]) => void }
  let transport: ElectronStubTransport | null = null
  export function bindTransport(next: ElectronStubTransport): void
  export const shell = { ..., openExternal: async (url: string, _options?: unknown): Promise<void> => { transport?.openExternal(url) }, ... }
  Imports today: os, package.json, ../sidecar/pathShim, ../sidecar/isPackagedSidecar, ../sidecar/sidecarRpc. It must NOT import backend/logger (logger imports config/game_config -> cycle risk); existing warnings use console.warn with an `[electronStub]` prefix.

From src/backend/storeManagers/steam/macSteamOffline.ts:
  import { execFile, spawn } from 'child_process'
  import { logInfo, logWarning, LogPrefix } from 'backend/logger'
  import { shell } from 'backend/platform'
  export const STEAM_GO_OFFLINE_URL = 'steam://open/gooffline'
  export function spawnOpenDetached(url: string): void  // spawn('/usr/bin/open', ['-g', url], { detached: true, stdio: 'ignore' }); on 'error' logWarning(`[Steam] go-offline restore: could not spawn open (${code ?? 'error'})`, LogPrefix.Steam); child.unref()
  MacSteamOfflineDeps.openUrl: (url: string) => void        // default: (url) => shell.openExternal(url)   (line ~179)
  MacSteamOfflineDeps.openUrlDetached: (url: string) => void // default: spawnOpenDetached          (line ~193)
  Only macSteamOffline.ts references spawnOpenDetached today.

Test mocking note: src/backend/platform/__mocks__/index.ts SPREADS the real module, so `shell` is the
REAL implementation in suites that call jest.mock('backend/platform'). Only bootstrap.test.ts calls
bindTransport. The new branch therefore must require a bound transport, or jest on a Mac could
spawn a real `open -g steam://...`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Relocate spawnOpenDetached to platform/openDetached.ts and add the background predicate</name>
  <files>src/backend/platform/openDetached.ts, src/backend/platform/__tests__/openExternalBackground.test.ts, src/backend/storeManagers/steam/macSteamOffline.ts</files>
  <behavior>
    - shouldOpenInBackground('darwin', 'steam://open/gooffline', { activate: false }) === true
    - same with 'STEAM://open/main' (scheme compared case-insensitively) === true
    - 'linux' or 'win32' with activate:false === false
    - darwin with options undefined, {}, { activate: true }, { activate: 'false' } === false (strict === false)
    - darwin, activate:false, 'https://store.steampowered.com' === false; 'steam' with no colon === false
    - spawnOpenDetached(url, onError) calls child_process.spawn('/usr/bin/open', ['-g', url], { detached: true, stdio: 'ignore' }) with NO env key, calls child.unref(), and on child 'error' calls onError with the errno code (or 'error' when absent); a missing onError does not throw
  </behavior>
  <action>
    Create src/backend/platform/openDetached.ts (imports only 'child_process'; no backend/logger import, so platform/index.ts can import it without a cycle). Export:
    (a) shouldOpenInBackground(platform: NodeJS.Platform, url: string, options: unknown): boolean — true only when platform === 'darwin', options is a non-null object whose `activate` property is strictly `false`, and the URL's scheme (text before the first ':', lowercased; no colon -> false) is exactly 'steam'. Doc-comment why steam-only: it is a strict subset of the Rust OPEN_EXTERNAL_ALLOWED_SCHEMES (src-tauri/src/main.rs ~2232), and every other URL keeps going through that renderer-facing check.
    (b) spawnOpenDetached(url: string, onError?: (code: string) => void): void — move the body from macSteamOffline.ts verbatim (spawn '/usr/bin/open' with ['-g', url], { detached: true, stdio: 'ignore' }, child.on('error') -> onError?.(code ?? 'error'), child.unref()). Carry over the existing comment about inheriting the real user session (LaunchServices resolves steam:// per user; a fake/stripped env breaks dispatch; the missing env option is what fakeHomeIsolation.test.ts requires) — do NOT add an env option. Keep unref() per the sidecar exit contract. Generalize the doc comment: it is used both for shutdown restores (stdout frame is gone at stdin EOF) and for background opens on darwin.
    In macSteamOffline.ts: delete the local spawnOpenDetached body; import spawnOpenDetached from 'backend/platform/openDetached' and keep a module-level `export function spawnOpenDetached(url: string): void` wrapper (or re-export via a thin wrapper) that calls it with an onError that emits the exact existing logWarning message (`[Steam] go-offline restore: could not spawn open (${code})`, LogPrefix.Steam), so openUrlDetached's default and its log text are unchanged. Drop `spawn` from the child_process import if now unused (keep execFile).
    Write src/backend/platform/__tests__/openExternalBackground.test.ts first (RED) covering the behaviors above: jest.mock('child_process') with spawn returning a fake EventEmitter-based child carrying a jest.fn() unref; assert args and that the options object has no 'env' key.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/platform/__tests__/openExternalBackground.test.ts src/backend/storeManagers/steam/__tests__/macSteamOfflineWrap.test.ts src/backend/storeManagers/steam/__tests__/macSteamOnlineDebt.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts && npx prettier --check src/backend/platform/openDetached.ts src/backend/platform/__tests__/openExternalBackground.test.ts src/backend/storeManagers/steam/macSteamOffline.ts</automated>
  </verify>
  <done>openDetached.ts exports both functions; predicate and spawn tests pass; macSteamOffline suites and fakeHomeIsolation pass; only one `'/usr/bin/open'` spawn site remains (`grep -rn "'/usr/bin/open'" src/backend --include='*.ts' | grep -v __tests__` shows openDetached.ts only); prettier clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Honor activate:false in shell.openExternal and pass it from the go-offline verb</name>
  <files>src/backend/platform/index.ts, src/backend/platform/__tests__/openExternalBackground.test.ts, src/backend/storeManagers/steam/macSteamOffline.ts</files>
  <behavior>
    - transport bound, process.platform darwin, shell.openExternal('steam://open/gooffline', { activate: false }) -> spawn('/usr/bin/open', ['-g', url], ...) called once, transport.openExternal NOT called
    - transport bound, darwin, no options / { activate: true } -> transport.openExternal(url) called, spawn not called
    - transport bound, darwin, activate:false, 'https://example.com' -> transport.openExternal called, spawn not called
    - transport bound, process.platform linux/win32, activate:false steam URL -> transport.openExternal called, spawn not called
    - transport NOT bound (fresh module via jest.isolateModules), darwin, activate:false steam URL -> neither spawn nor anything else is called (today's no-op preserved; protects jest on a Mac from spawning real `open`)
  </behavior>
  <action>
    In src/backend/platform/index.ts import { shouldOpenInBackground, spawnOpenDetached } from './openDetached' and change shell.openExternal to: `async (url: string, options?: unknown)`; if transport is null return (unchanged no-op); if shouldOpenInBackground(process.platform, url, options) call spawnOpenDetached(url, code => console.warn(`[electronStub] shell.openExternal(): background open failed (${code})`)) and return — log the code only, never the URL (T-28-04 convention); otherwise transport.openExternal(url) exactly as today. Add a comment above it: why options were previously dropped (Rust opener = plain /usr/bin/open which activates), that the callers passing { activate: false } are steam/games.ts rungameid launches, bridge/helperProcess.ts steam://open/main, and macSteamOffline go-offline, and why the steam-only + transport-bound guards exist.
    In macSteamOffline.ts defaultMacSteamOfflineDeps change `openUrl: (url) => shell.openExternal(url)` to `openUrl: (url) => void shell.openExternal(url, { activate: false })` (match whatever the existing lint/no-floating-promises style requires; keep the `(url: string) => void` interface) with a one-line comment: Refresh's go-offline must not raise Mac Steam (quick 261029-thl); Steam may still self-raise on gooffline.
    Extend the Task 1 test file with the behaviors above: Object.defineProperty(process, 'platform', { value }) with restore in afterEach; bind a fake transport via bindTransport({ openExternal: jest.fn(), pushFrontendMessage: jest.fn() }); import the real module from 'backend/platform' (do NOT jest.mock it). Use jest.isolateModules for the unbound case.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/platform/__tests__ src/backend/storeManagers/steam/__tests__/macSteamOfflineWrap.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/sidecar/__tests__/bootstrap.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts && npx tsc --noEmit && npx prettier --check src/backend/platform/index.ts src/backend/platform/__tests__/openExternalBackground.test.ts src/backend/storeManagers/steam/macSteamOffline.ts</automated>
  </verify>
  <done>All listed suites pass; tsc clean; `grep -n "openExternal(url, { activate: false })" src/backend/storeManagers/steam/macSteamOffline.ts` matches; src-tauri/src/main.rs untouched (`git diff --stat src-tauri` empty); prettier clean.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sidecar -> /usr/bin/open | URL handed to LaunchServices by a direct spawn, bypassing the Rust scheme check |
| renderer -> Rust open_external | renderer-controlled URL; allowlist must stay intact |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-thl-01 | Elevation/Tampering | shell.openExternal background branch | mitigate | shouldOpenInBackground admits only the `steam:` scheme (subset of OPEN_EXTERNAL_ALLOWED_SCHEMES); everything else still goes via the Rust check; argv array spawn (no shell), so no injection |
| T-thl-02 | Tampering | Rust open_external | mitigate | not modified; `git diff --stat src-tauri` must be empty |
| T-thl-03 | Info disclosure | error logging | mitigate | log errno code only, never the URL |
| T-thl-04 | DoS (sidecar exit) | detached child handle | mitigate | child.unref() retained per the sidecar exit contract |
| T-thl-05 | Info disclosure | fake-HOME rule | accept | child deliberately inherits the real env (LaunchServices per-user dispatch); no env literal, which fakeHomeIsolation.test.ts requires; tests mock child_process and require a bound transport so jest never spawns real `open` |
</threat_model>

<verification>
- New seam tests, macSteamOffline suites, games.test.ts, bootstrap.test.ts and fakeHomeIsolation all pass.
- `npx tsc --noEmit` clean.
- Single `/usr/bin/open` spawn site in src/backend (openDetached.ts).
- src-tauri untouched.

Human UAT (live, macOS — record in SUMMARY, not automated):
1. `tauri dev` does NOT rebuild the sidecar: run `pnpm build:sidecar-sea` (or restart dev) and confirm the sidecar.js mtime is newer than this change before testing.
2. With Mac Steam open, visible and NOT minimised, sign in to Steam in GameLib and click Refresh. Expected: Steam goes offline and back online without being brought to the front. Note: Steam itself may still self-raise on `steam://open/gooffline` regardless of `open -g`; if it does, record that as a Steam-side behaviour, not a regression of this fix.
3. Launch a Steam game from GameLib (rungameid path) and confirm Steam's window is not activated.
</verification>

<success_criteria>
- shell.openExternal(steamUrl, { activate: false }) on darwin with a bound transport spawns detached `/usr/bin/open -g`; every other case is byte-for-byte today's behaviour.
- macSteamOffline default openUrl passes { activate: false }.
- No Rust change; scheme allowlist intact; fakeHomeIsolation green.
</success_criteria>

<output>
Create `.planning/quick/261029-thl-honor-activate-false-in-openexternal-so-/261029-thl-SUMMARY.md` when done. Include the live-test reminder that `tauri dev` does not rebuild the sidecar.
</output>
