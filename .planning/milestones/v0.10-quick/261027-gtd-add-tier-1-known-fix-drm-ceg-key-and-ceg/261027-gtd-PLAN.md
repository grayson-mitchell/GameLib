---
phase: quick-261027-gtd
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/knownFixes.ts
  - src/common/types.ts
  - src/backend/storeManagers/steam/drmKnownFix.ts
  - src/backend/__tests__/knownFixesDrm.test.ts
  - src/backend/storeManagers/steam/__tests__/drmKnownFix.test.ts
  - src/backend/storeManagers/steam/bridge/bridgeRoute.ts
  - src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/backend/__tests__/knownFixesGamelibStatus.test.ts
  - src/backend/__tests__/knownFixesCegSeeds.test.ts
  - public/fixes/200510-steam.json
  - public/fixes/203140-steam.json
  - public/fixes/205930-steam.json
autonomous: true
requirements: [QUICK-GTD-01, QUICK-GTD-02, QUICK-GTD-03]

must_haves:
  truths:
    - "A tier-1 known-fix file `<appId>-steam.json` may carry `drm`, from the local, bundled or remote layer; only the literal string \"ceg\" survives `filterTier1KnownFixes`, any other value is dropped with one warning naming 'drm' and the rejected value"
    - "`resolveBridgeRoute` given `knownFixDrm: 'ceg'` (no allowlist reason, no persisted verdict) returns route 'bottle', reason 'known-bad', knownBadReason 'drm-wrapped', noticeRequired true -- the same row-4 result a bundled allowlist 'drm-wrapped' match produces"
    - "A user `userRoute: 'bridge'` override still wins over a known-fix `drm: 'ceg'` (row 6, user-forced-bridge), and `userRoute: 'bottle'` still wins earlier as user-forced-bottle"
    - "`SteamGame.install()` for a title whose known fix says drm 'ceg' fires `steamBridgeRouteNotice` with knownBadReason 'drm-wrapped' and route 'bottle' and never calls `downloadSteamDepots` -- the route is decided before any download"
    - "public/fixes/200510-steam.json, 203140-steam.json and 205930-steam.json each carry title, macArch \"32\", drm \"ceg\" and notes citing spike 045, and pass the real tier-1 filter with zero warnings"
    - "The game-page GameLib row (`readGamelibFixStatus`) does NOT appear for a winning tier-1 file whose only non-descriptive keys are routing keys (`macArch`, `drm`); a file that also carries any other tier-1 key (envVariables, winetricks, runInPrefix, wikiLink, launchNotice) still shows it, a title-only file still shows it (existing ch9 test unchanged), and a tier-2 profile still shows it"
  artifacts:
    - path: "src/backend/knownFixes.ts"
      provides: "'drm' in TIER1_KNOWN_FIX_KEYS, \"ceg\"-only validation, exported TIER1_ROUTING_KEYS + isRoutingOnlyTier1Fix, routing-only exclusion in readGamelibFixStatus"
      contains: "'drm'"
    - path: "src/backend/storeManagers/steam/drmKnownFix.ts"
      provides: "knownFixSaysCeg(appId): boolean, never throws"
      exports: ["knownFixSaysCeg"]
    - path: "src/backend/storeManagers/steam/bridge/bridgeRoute.ts"
      provides: "BridgeRouteInput.knownFixDrm folded into knownBadReason"
      contains: "knownFixDrm"
    - path: "public/fixes/205930-steam.json"
      provides: "Hitman: Sniper Challenge macArch 32 + drm ceg"
      contains: "\"drm\": \"ceg\""
  key_links:
    - from: "src/backend/storeManagers/steam/games.ts assembleBridgeRouteInput()"
      to: "drmKnownFix.ts knownFixSaysCeg"
      via: "knownFixDrm field of BridgeRouteInput"
      pattern: "knownFixDrm: knownFixSaysCeg\\(this\\.appId\\)"
    - from: "src/backend/storeManagers/steam/bridge/bridgeRoute.ts"
      to: "row 4 drm-wrapped"
      via: "knownBadReason derivation"
      pattern: "knownFixDrm === 'ceg'"
---

<objective>
Add a tier-1 known-fix key `drm` (only value: "ceg") that the bridge router treats as a
`drm-wrapped` known-bad title, routing it to bottled Steam before any download, exactly as a
bundled `bridge-allowlist.json` `drm-wrapped` entry or a persisted CEG verdict does. Then ship
bundled known-fix files for the three spike-045 CEG titles with i386 Mac builds (200510 XCOM:
Enemy Unknown, 203140 Hitman: Absolution, 205930 Hitman: Sniper Challenge), each with
`macArch: "32"` and `drm: "ceg"`.

Purpose: one known-fix file per title covers both the Mac-arch routing and the DRM routing, and
because both keys are plain routing data that never touch a running game, they are tier 1 and
can ship through the remote fixes layer without a release. Today a CEG title is only caught
after its Windows build has been downloaded and PE-scanned (`persistBridgeDrmSignal` at
`games.ts` installBridgeGame / launchBridgeGame); the two Hitman titles have no allowlist entry
at all (spike 045 Results).

Output: the key + validator + type, a never-throwing reader `drmKnownFix.ts`, a new
`BridgeRouteInput.knownFixDrm` field wired from `assembleBridgeRouteInput()`, three bundled fix
files, a routing-only exclusion in the GameLib fix row, and unit tests for each.

**GameLib fix-row decision (made here, recorded in the SUMMARY):** `readGamelibFixStatus` today
counts ANY bundled/local tier-1 file, so the three new files (and the three `macArch`-only seeds
57300 / 63000 / 402060 shipped by quick 261027-bqe this morning) would show a green tick with
the tooltip "GameLib has a fix for this game, so it should run". For a CEG title that is being
sent to bottled Steam, and for a macArch-only title that is merely being installed as its
Windows build, no GameLib fix has been made or live-gated: the file only says where to route.
The operator's ch9 decision was "a fix existing is enough"; a routing hint is not a fix. So this
plan defines routing keys (`macArch`, `drm`) as not-a-fix: a winning tier-1 file whose keys are
only `title`/`notes`/`macArch`/`drm` and that carries at least one routing key does not show the
row. Everything else about the row is unchanged: a title-only file still counts (the existing ch9
test `bundled tier-1 only -> bundled` with `{ title: 't' }` stays green and unmodified), any other
tier-1 key (including `launchNotice`) still counts, a tier-2 profile still counts, remote never
counts. The visible consequence, to be stated in the SUMMARY: the row disappears for 57300,
63000 and 402060 as well as for the three new titles. The frontend (`AppleWikiInfo.tsx`,
`gamelibFixDisplay.ts`) is not touched.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/spikes/045-ceg-census/README.md
@.planning/quick/261027-bqe-known-fix-macarch-32-key-routes-32-bit-m/261027-bqe-SUMMARY.md
@src/backend/knownFixes.ts
@src/backend/storeManagers/steam/macArchKnownFix.ts
@src/backend/storeManagers/steam/bridge/bridgeRoute.ts

**Working-tree hazard.** Another session has uncommitted edits in
`src/backend/storeManagers/steam/bridge/bridge-allowlist.json`, `bridge/allowlist.ts`,
`bridge/__tests__/allowlist.test.ts`, `.planning/notes/per-game-compat-fixes-architecture.md`,
a pending todo and two untracked files. Do NOT edit, stage, format or revert any of them. XCOM's
existing allowlist known-bad entry stays as it is; the new known-fix file is additional. Stage
only the paths in this plan's `files_modified`, by explicit path. Never `git add -A`,
`git add .`, `git commit -a`, or `git stash`.

<interfaces>
From src/backend/knownFixes.ts (MUST NOT import electron or anything reaching it):
- `export const TIER1_KNOWN_FIX_KEYS = ['title','notes','winetricks','runInPrefix','envVariables','wikiLink','launchNotice','macArch'] as const`
- `const DESCRIPTIVE_KEYS: readonly string[] = ['title', 'notes']` (module-private)
- `export function filterTier1KnownFixes(appName: string, layerLabel: string, parsed: unknown): KnowFixesInfo | null` -- inside its loop, the macArch guard is `if (key === 'macArch' && value !== '32') { logWarning(`Known fixes for '${appName}' (${layerLabel} layer): 'macArch' accepts only "32", ignoring ${JSON.stringify(value)}.`); continue }`. The remote fetcher (`knownFixesFetcher.ts:119`) applies this same filter at write and read, so a key admitted here is admitted in the remote layer.
- `export function readKnownFixes(appName, runner): KnowFixesInfo | null` -- local > bundled > remote, first parsed object wins whole-file.
- `export function readGamelibFixStatus(appName, runner): GamelibFixStatus | null` -- loop 1 over [local, bundled] tier-1: `filtered === null` -> `continue`, else returns `{ origin }` (+ trimmed launchNotice). Loop 2 over [local, bundled] tier-2 profile.

From src/common/types.ts ~L1143: `export interface KnowFixesInfo { title: string; notes?: Record<string,string>; winetricks?; runInPrefix?; envVariables?; wikiLink?; launchNotice?: string; /** Tier 1, only "32" is accepted. ... (quick 261027-bqe). */ macArch?: '32' }`

From src/backend/storeManagers/steam/electronStores.ts ~L278: `SteamBridgeVerdict.drm?: 'ceg'` (persisted post-install PE-scan result, quick 261024-br4).

From src/backend/storeManagers/steam/bridge/bridgeRoute.ts (PURE, never touches a store):
- `export interface BridgeRouteInput { platformsBottleEligible: boolean; isSeed: boolean; knownBadReason: SteamBridgeKnownBadReason | null; verdict: SteamBridgeVerdict | undefined; failedThisSession: boolean; win64ShimPresent: boolean }`
- In `resolveBridgeRoute`, destructure renames `knownBadReason: bundledKnownBadReason`, then `const knownBadReason = verdict?.drm === 'ceg' ? 'drm-wrapped' : bundledKnownBadReason`. Row 3 (`userRoute === 'bottle'`) precedes row 4 (`knownBadReason === 'drm-wrapped' && verdict?.userRoute !== 'bridge'` -> `toBottle('known-bad', { knownBadReason, noticeRequired: !isAcknowledged(verdict,'known-bad') })`); row 6 is `userRoute === 'bridge'` -> `toBridge('user-forced-bridge', ...)`.

From src/backend/storeManagers/steam/games.ts ~L2430 (sole assembler):
`private assembleBridgeRouteInput(): BridgeRouteInput { return { platformsBottleEligible: this.isBottleEligibleFromPlatforms(), isSeed: bridgeAllowlist.has(this.appId), knownBadReason: bridgeAllowlist.knownBadReason(this.appId) ?? null, verdict: readBridgeVerdict(this.appId), failedThisSession: bridgeFailedThisSession.has(this.appId), win64ShimPresent: existsSync(builtBridgeShim64Path) } }`
games.ts L51 already imports `{ knownFixSaysMac32, seedMacArchFromKnownFix } from './macArchKnownFix'`. install() calls `this.bridgeRoute()` at ~L1231, before any download; a `noticeRequired` route fires `steamBridgeRouteNotice` and returns `{ status: 'done', deferredToSetup: true }`.

From src/backend/storeManagers/steam/__tests__/games.test.ts: `resetMocks: true`; `const APP_ID = '570'`; `jest.mock('../bridge/allowlist', () => ({ bridgeAllowlist: { has: jest.fn(), knownBadReason: jest.fn() } }))` at ~L341. The precedent test to mirror is at ~L5499: "Plan 13 (D-51-08): known-bad title (knownBadReason non-null), no acknowledgement -- install() fires steamBridgeRouteNotice and defers to setup WITHOUT ever reaching the bottled dispatch". It sets `bridgeAllowlist.knownBadReason` to 'drm-wrapped', `isBottleReady` true, `tellBottledSteamToInstall` resolved `{status:'done'}`, calls `new SteamGame(APP_ID).install({} as any)`, and asserts `placeShimForGame`/`downloadSteamDepots`/`tellBottledSteamToInstall` not called, the exact `steamBridgeRouteNotice` payload `{ appName: APP_ID, reason: 'known-bad', knownBadReason: 'drm-wrapped', missingSymbols: [], route: 'bottle', userRoute: null }`, and result `{ status: 'done', deferredToSetup: true }`.

Existing bundled fix file shape (public/fixes/57300-steam.json, 2-space JSON, trailing newline):
`{ "title": "Amnesia: The Dark Descent", "macArch": "32", "notes": { "macArch": "<one-sentence reason + evidence + date + quick id>" } }`

prettier --file-info probed 2026-10-27: `public/fixes/57300-steam.json` -> `{ "ignored": false, "inferredParser": "json" }`; `src/backend/knownFixes.ts`, `src/common/types.ts`, `src/backend/storeManagers/steam/bridge/bridgeRoute.ts` -> `{ "ignored": false, "inferredParser": "typescript" }`. Every path this plan writes is prettier-visible; re-probe the new files anyway (step 1 of each verify).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: tier-1 `drm` key ("ceg" only), type, and the never-throwing `knownFixSaysCeg` reader</name>
  <files>src/backend/knownFixes.ts, src/common/types.ts, src/backend/storeManagers/steam/drmKnownFix.ts, src/backend/__tests__/knownFixesDrm.test.ts, src/backend/storeManagers/steam/__tests__/drmKnownFix.test.ts</files>
  <behavior>
    knownFixesDrm.test.ts (mirror knownFixesMacArch.test.ts: `jest.mock('backend/logger', ...)` with logInfo/logError/logWarning jest.fn and LogPrefix; `warn.mockClear()` in beforeEach):
    - `filterTier1KnownFixes('1', 'bundled', { title: 'T', drm: 'ceg' })` equals `{ title: 'T', drm: 'ceg' }`, no warning.
    - Remote layer admits it: `filterTier1KnownFixes('1', 'remote', { title: 'T', macArch: '32', drm: 'ceg' })` equals `{ title: 'T', macArch: '32', drm: 'ceg' }`, no warning.
    - test.each over `['CEG'], ['steamstub'], [true], [null], [''], ['drm-wrapped']`: `filterTier1KnownFixes('1', 'remote', { title: 'T', envVariables: { A: 'b' }, drm: value })` equals `{ title: 'T', envVariables: { A: 'b' } }`, warn called exactly once, message contains `'drm'` and `JSON.stringify(value)`.
    - `TIER1_KNOWN_FIX_KEYS` contains 'drm'.
    drmKnownFix.test.ts (`jest.mock('backend/knownFixes', () => ({ readKnownFixes: jest.fn() }))`, `jest.mock('backend/logger', ...)` with logWarning + LogPrefix { Steam: 'Steam' }):
    - readKnownFixes returns `{ title: 'X', drm: 'ceg' }` -> `knownFixSaysCeg('200510')` is true, and readKnownFixes was called with `('200510', 'steam')`.
    - returns `{ title: 'X', macArch: '32' }` -> false; returns null -> false.
    - readKnownFixes throws -> false, logWarning called once, nothing thrown.
  </behavior>
  <action>
    Write both test files first and run them to see them fail (RED), then implement (GREEN).

    In `src/backend/knownFixes.ts`: append `'drm'` to `TIER1_KNOWN_FIX_KEYS` after `'macArch'`. Extend the allow-list doc comment with one sentence in the macArch paragraph's style: `drm` is likewise routing data (it only sends a title to bottled Steam as a 'drm-wrapped' known-bad, before any download) and never touches a running game, so it is tier 1 and may arrive from the remote layer (quick 261027-gtd); only "ceg" is accepted. In `filterTier1KnownFixes`, directly after the macArch guard, add the same-shaped guard for `key === 'drm' && value !== 'ceg'`, warning `Known fixes for '${appName}' (${layerLabel} layer): 'drm' accepts only "ceg", ignoring ${JSON.stringify(value)}.` then `continue`. Precede it with a one-line comment: "ceg" is the only Steam DRM that needs a genuine Windows Steam client (spikes 035-037/044); SteamStub is not routing data (quick 261027-gtd). Do not touch TIER2_PROFILE_KEYS or the file's import list.

    In `src/common/types.ts` `KnowFixesInfo`, after `macArch?: '32'`, add `drm?: 'ceg'` with a doc comment: Tier 1, only "ceg" is accepted. The title's Windows exe carries Steam CEG, so the bridge router treats it as a 'drm-wrapped' known-bad and routes it to bottled Steam before any download, the same as a bundled allowlist entry or a detected CEG verdict (quick 261027-gtd).

    Create `src/backend/storeManagers/steam/drmKnownFix.ts`, modelled on `knownFixSaysMac32` in macArchKnownFix.ts. Header doc comment: curated `drm: "ceg"` known-fix hint for Steam titles (quick 261027-gtd, evidence spike 045); feeds `BridgeRouteInput.knownFixDrm` from games.ts `assembleBridgeRouteInput()` so the pure resolver never reads a file; not platform-gated (CEG needs Windows Steam on every host where the bridge route exists; `platformsBottleEligible` already gates row 1); MUST NOT import games.ts or library.ts (import cycle). Imports only `readKnownFixes` from 'backend/knownFixes' and `logWarning, LogPrefix` from 'backend/logger'. Export `knownFixSaysCeg(appId: string): boolean` that returns `readKnownFixes(appId, 'steam')?.drm === 'ceg'` inside try/catch; on catch `logWarning(`Steam: could not read known fixes for appId ${appId} while checking drm: ${String(error)}`, LogPrefix.Steam)` and return false.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && for p in src/backend/knownFixes.ts src/common/types.ts src/backend/storeManagers/steam/drmKnownFix.ts src/backend/__tests__/knownFixesDrm.test.ts src/backend/storeManagers/steam/__tests__/drmKnownFix.test.ts; do npx prettier --file-info "$p" | grep -Eq '"ignored":[[:space:]]*false' || echo "IGNORED: $p"; done && npx prettier --check src/backend/knownFixes.ts src/common/types.ts src/backend/storeManagers/steam/drmKnownFix.ts src/backend/__tests__/knownFixesDrm.test.ts src/backend/storeManagers/steam/__tests__/drmKnownFix.test.ts && npx jest src/backend/__tests__/knownFixesDrm.test.ts src/backend/storeManagers/steam/__tests__/drmKnownFix.test.ts src/backend/__tests__/knownFixesMacArch.test.ts src/backend/__tests__/knownFixes.test.ts src/backend/__tests__/knownFixesLayered.test.ts src/backend/__tests__/knownFixesFetcher.test.ts && pnpm codecheck</automated>
  </verify>
  <done>No `IGNORED:` line printed; prettier, the six jest suites and `pnpm codecheck` pass. `drm: "ceg"` survives the filter at every layer label including 'remote'; any other value is dropped with exactly one warning; `knownFixSaysCeg` never throws. Commit only these five paths: `feat(quick-261027-gtd): tier-1 known-fix drm "ceg" key and knownFixSaysCeg reader`.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: thread `knownFixDrm` through `BridgeRouteInput` into row 4, wired from `assembleBridgeRouteInput()`</name>
  <files>src/backend/storeManagers/steam/bridge/bridgeRoute.ts, src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts, src/backend/storeManagers/steam/games.ts, src/backend/storeManagers/steam/__tests__/games.test.ts</files>
  <behavior>
    bridgeRoute.test.ts, new `describe('quick 261027-gtd: known-fix drm "ceg" (knownFixDrm)')` placed after the existing `quick 261024-br4: detected CEG (verdict.drm)` block:
    - `{ ...baseInput, knownFixDrm: 'ceg' }` -> route 'bottle', reason 'known-bad', knownBadReason 'drm-wrapped', noticeRequired true.
    - plus `verdict: { noticeAcknowledgedFor: 'known-bad' }` -> still bottle/known-bad, noticeRequired false.
    - plus `verdict: { userRoute: 'bridge' }` -> route 'bridge', reason 'user-forced-bridge', knownBadReason 'drm-wrapped', noticeRequired false.
    - plus `verdict: { userRoute: 'bottle' }` -> reason 'user-forced-bottle'.
    - plus `knownBadReason: 'does-not-run'` -> knownFixDrm wins: bottle/known-bad with knownBadReason 'drm-wrapped'.
    - plus `isSeed: true` -> still bottle/known-bad (row 4 precedes seed row 8).
    - `knownFixDrm: null` with everything else at baseInput -> route 'bridge', reason 'pending-scan' (no regression).
    games.test.ts, one test beside the ~L5499 Plan 13 precedent: with `knownFixSaysCeg` mocked to true and `bridgeAllowlist.knownBadReason` mocked to null, `install()` asserts the same things the precedent asserts (no placeShimForGame, no downloadSteamDepots, no tellBottledSteamToInstall, the identical `steamBridgeRouteNotice` payload with knownBadReason 'drm-wrapped' and route 'bottle', result `{ status: 'done', deferredToSetup: true }`).
  </behavior>
  <action>
    Write the bridgeRoute tests first (they fail to typecheck/run until the field exists -- that is the RED), then implement.

    In `bridgeRoute.ts`: add to `BridgeRouteInput`, after `knownBadReason`, a required field `knownFixDrm: 'ceg' | null` with a doc comment: quick 261027-gtd, the tier-1 known-fix `drm` value for this title (games.ts reads it via `knownFixSaysCeg`), or null; 'ceg' makes the title a 'drm-wrapped' known-bad exactly like a bundled match or `verdict.drm === 'ceg'`, so it reaches bottled Steam before any download. Destructure it in `resolveBridgeRoute` and change the derivation to `verdict?.drm === 'ceg' || knownFixDrm === 'ceg' ? 'drm-wrapped' : bundledKnownBadReason`; extend the comment above it with one sentence that a curated known-fix `drm: "ceg"` is the pre-download form of the same signal (quick 261027-gtd). Update the precedence doc comment's row 4 text to read "bundled, curated known-fix `drm: \"ceg\"` (quick 261027-gtd), OR detected CEG". Add "known-fix DRM" to the module header's list of pure inputs. Do not change any row's order or result.

    In `bridgeRoute.test.ts`: add `knownFixDrm: null` to `baseInput` and `knownFixDrm: 'ceg'` to the D-17-pin fully-populated fixture (its /forced/i key assertion must still pass; `knownFixDrm` does not match). Add the describe block from <behavior>.

    In `games.ts`: add `import { knownFixSaysCeg } from './drmKnownFix'` beside the macArchKnownFix import, and in `assembleBridgeRouteInput()` add `knownFixDrm: knownFixSaysCeg(this.appId) ? 'ceg' : null,` directly after the `knownBadReason` line, with a one-line comment: quick 261027-gtd, curated known-fix drm "ceg" is a pre-download drm-wrapped signal. No other games.ts change. The `?:` form deliberately maps a resetMocks `undefined` to null.

    In `games.test.ts`: add `jest.mock('../drmKnownFix', () => ({ knownFixSaysCeg: jest.fn() }))` beside the `../bridge/allowlist` mock with a comment that resetMocks returns undefined, which assembleBridgeRouteInput maps to null, so every pre-existing test is unaffected; import `knownFixSaysCeg` from '../drmKnownFix' alongside the other mocked imports. Add the test from <behavior>, named "quick 261027-gtd: known-fix drm 'ceg' with no allowlist entry -- install() fires the drm-wrapped steamBridgeRouteNotice before any download".
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && for p in src/backend/storeManagers/steam/bridge/bridgeRoute.ts src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/games.test.ts; do npx prettier --file-info "$p" | grep -Eq '"ignored":[[:space:]]*false' || echo "IGNORED: $p"; done && npx prettier --check src/backend/storeManagers/steam/bridge/bridgeRoute.ts src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/games.test.ts && npx jest src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts && pnpm codecheck && grep -c "knownFixDrm: knownFixSaysCeg(this.appId)" src/backend/storeManagers/steam/games.ts</automated>
  </verify>
  <done>No `IGNORED:` line; prettier, the three jest suites and `pnpm codecheck` pass; the final grep prints 1. A known-fix `drm: "ceg"` title resolves to bottle/known-bad/'drm-wrapped' pre-download, user 'bridge' and 'bottle' overrides still win, `knownFixDrm: null` is a no-op. `bridge-allowlist.json`, `allowlist.ts` and `allowlist.test.ts` are untouched (`git diff --stat` on them shows only the other session's pre-existing edits). Commit only these four paths: `feat(quick-261027-gtd): known-fix drm "ceg" routes to bottled Steam before download`.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: three spike-045 CEG fix files, and routing-only files no longer light the GameLib row</name>
  <files>public/fixes/200510-steam.json, public/fixes/203140-steam.json, public/fixes/205930-steam.json, src/backend/knownFixes.ts, src/backend/__tests__/knownFixesGamelibStatus.test.ts, src/backend/__tests__/knownFixesCegSeeds.test.ts</files>
  <behavior>
    knownFixesGamelibStatus.test.ts, added cases (existing cases unchanged, including `{ title: 't' }` -> bundled):
    - bundled `{ title: 't', macArch: '32' }` -> null.
    - bundled `{ title: 't', notes: { drm: 'x' }, macArch: '32', drm: 'ceg' }` -> null.
    - bundled `{ title: 't', drm: 'ceg', envVariables: { A: 'b' } }` -> `{ origin: 'bundled' }`.
    - bundled `{ title: 't', drm: 'ceg', launchNotice: 'hi' }` -> `{ origin: 'bundled', launchNotice: 'hi' }`.
    - bundled tier-1 `{ title: 't', drm: 'ceg' }` + bundled tier-2 profile `{ title: 't' }` -> `{ origin: 'bundled' }` (the profile still counts).
    - local `{ title: 'l', macArch: '32' }` + bundled `{ title: 'b', envVariables: { A: 'b' } }` -> null (the local file wins whole-file in readKnownFixes, so the bundled fix is never applied; no profile exists).
    - bundled `{ title: 't', drm: 'steamstub' }` (rejected value, filtered to `{ title: 't' }`) -> `{ origin: 'bundled' }`, matching title-only behaviour.
    knownFixesCegSeeds.test.ts (mirror knownFixesMacArchSeeds.test.ts, logger mocked, reads the real repo files via `join(__dirname, '../../../public/fixes', ...)`):
    - test.each over ['200510','203140','205930']: filtered output has macArch '32', drm 'ceg', truthy title, `notes.drm` and `notes.macArch` both contain '045', no warning, and `isRoutingOnlyTier1Fix(out)` is true.
    - test.each over ['57300','63000','402060']: `isRoutingOnlyTier1Fix` is true (the row-hiding consequence for the bqe seeds, pinned on purpose).
    - '1603180' (Mining Mechs, envVariables): `isRoutingOnlyTier1Fix` is false.
  </behavior>
  <action>
    Write the test additions first and run them (RED), then implement.

    In `src/backend/knownFixes.ts`: add `export const TIER1_ROUTING_KEYS = ['macArch', 'drm'] as const` below `TIER1_KNOWN_FIX_KEYS`, with a doc comment: keys that only change where a title is installed or launched from; they are not a fix and never make the GameLib row claim one (quick 261027-gtd). Add `export function isRoutingOnlyTier1Fix(fix: KnowFixesInfo): boolean` returning true when the object has at least one key in TIER1_ROUTING_KEYS and every key is in DESCRIPTIVE_KEYS or TIER1_ROUTING_KEYS. A title-only object therefore returns false, which preserves the ch9 behaviour that a descriptive-only bundled file still shows the row. In `readGamelibFixStatus`'s tier-1 loop, after the `filtered === null` continue, add `if (isRoutingOnlyTier1Fix(filtered)) break` with a comment: the winning tier-1 file (first parsed layer, as readKnownFixes resolves it) is routing data only, so no tier-1 fix applies; fall through to the tier-2 profile check; break, not continue, because a lower layer's tier-1 file is shadowed whole-file and is not applied either. Update the `readGamelibFixStatus` doc comment and the module header's `readGamelibFixStatus` bullet with: a tier-1 file carrying only routing keys (`macArch`, `drm`) does not count (quick 261027-gtd). Do not edit `src/common/types.ts` in this task: its `GamelibFixStatus` comment ("a local or bundled known fix") stays true under the new definition.

    Create the three files with 2-space indent, key order title, macArch, drm, notes, and a trailing newline, matching 57300-steam.json:
    - `public/fixes/200510-steam.json`: title "XCOM: Enemy Unknown".
    - `public/fixes/203140-steam.json`: title "Hitman: Absolution".
    - `public/fixes/205930-steam.json`: title "Hitman: Sniper Challenge".
    Each `notes` object has two keys. `notes.macArch`: "The macOS build is 32-bit only (i386); Apple silicon cannot run it, so GameLib installs the Windows build. Mach-O header read of the Mac depot's main binary in spike 045 (CEG census, macarch.json), recorded 2026-10-27 (quick 261027-gtd)." For 203140 append: " The Mac depot names its main binary 'Hitman Sniper Challenge' (a Feral packaging quirk), so the binary was picked by size." `notes.drm`: "The Windows build's <EXE> is a Steam CEG executable (EDepotFileFlag.CustomExecutable in the public depot manifest, spike 045). CEG needs a genuine Windows Steam client, so GameLib routes this title to bottled Steam before any download (quick 261027-gtd)." with <EXE> = `Binaries\\Win32\\XComGame.exe` for 200510 (JSON-escaped backslashes), `HMA.exe` for 203140, `HMSC.exe` for 205930. For 200510 also append to notes.drm: " Also on the bundled bridge allowlist as drm-wrapped; this file is additional."
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && for p in public/fixes/200510-steam.json public/fixes/203140-steam.json public/fixes/205930-steam.json src/backend/knownFixes.ts src/backend/__tests__/knownFixesGamelibStatus.test.ts src/backend/__tests__/knownFixesCegSeeds.test.ts; do npx prettier --file-info "$p" | grep -Eq '"ignored":[[:space:]]*false' || echo "IGNORED: $p"; done && npx prettier --check public/fixes/200510-steam.json public/fixes/203140-steam.json public/fixes/205930-steam.json src/backend/knownFixes.ts src/backend/__tests__/knownFixesGamelibStatus.test.ts src/backend/__tests__/knownFixesCegSeeds.test.ts && npx jest src/backend/__tests__/knownFixesGamelibStatus.test.ts src/backend/__tests__/knownFixesCegSeeds.test.ts src/backend/__tests__/knownFixesMacArchSeeds.test.ts src/backend/__tests__/knownFixesDrm.test.ts src/backend/__tests__/steamBridgeKnownFixes.test.ts src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/macArchKnownFix.test.ts src/frontend/screens/Game/GamePage/components/__tests__/gamelibFixDisplay.test.ts && pnpm codecheck</automated>
  </verify>
  <done>No `IGNORED:` line; prettier, the eight jest suites and `pnpm codecheck` pass. The three files exist with macArch "32", drm "ceg" and spike-045 notes; a routing-only winning tier-1 file no longer shows the GameLib row while title-only, any-other-key and tier-2 cases are unchanged. The SUMMARY states the row decision and names 57300, 63000, 402060, 200510, 203140, 205930 as titles that now show no GameLib row. Commit only these six paths: `feat(quick-261027-gtd): CEG known-fix files for XCOM EU and both Hitman titles; routing-only fixes do not light the GameLib row`.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| remote known-fixes repo -> `fixes/` -> readKnownFixes | downloaded JSON, untrusted, may now carry `drm` |
| bundled/local fix files -> readGamelibFixStatus -> renderer | decides whether the UI claims a fix exists |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gtd-01 | Tampering | filterTier1KnownFixes `drm` | mitigate | strict literal check, only "ceg" kept, anything else dropped with a warning (Task 1 test.each) |
| T-gtd-02 | Elevation of privilege | remote `drm: "ceg"` forcing bottled Steam | accept | worst case is the title routes to bottled Steam behind the existing one-time known-bad notice; the user's "Try the bridge anyway" override still wins (Task 2 test); no code or env reaches a running game |
| T-gtd-03 | Spoofing | GameLib row claiming a fix for a routing-only file | mitigate | isRoutingOnlyTier1Fix exclusion in readGamelibFixStatus (Task 3 tests); remote layer still never counts |
| T-gtd-04 | Denial of service | knownFixSaysCeg read failure blocking install routing | mitigate | try/catch returns false with a warning, never throws (Task 1 test) |
</threat_model>

<verification>
- `npx jest src/backend/__tests__/knownFixes*.test.ts src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts src/backend/storeManagers/steam/__tests__/drmKnownFix.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts` passes.
- `pnpm codecheck` exits 0.
- `git status --short` after the last commit shows only the other session's pre-existing paths (bridge-allowlist.json, allowlist.ts, allowlist.test.ts, the notes file, the pending todo, the two untracked files); none of them staged or committed by this task.
- `graphify update .` run after the code changes.
</verification>

<success_criteria>
- `drm: "ceg"` is a tier-1 known-fix key admitted at local, bundled and remote layers; other values rejected with a warning.
- A known-fix `drm: "ceg"` title is routed to bottled Steam as known-bad 'drm-wrapped' at the pre-download `bridgeRoute()` read in install(), with the same notice as a bundled drm-wrapped entry; user overrides still win.
- 200510, 203140, 205930 ship bundled files with macArch "32" and drm "ceg" citing spike 045.
- The GameLib row does not claim a fix for routing-only files; the decision and its effect on the six titles are in the SUMMARY.
</success_criteria>

<output>
Create `.planning/quick/261027-gtd-add-tier-1-known-fix-drm-ceg-key-and-ceg/261027-gtd-SUMMARY.md` when done.
</output>
