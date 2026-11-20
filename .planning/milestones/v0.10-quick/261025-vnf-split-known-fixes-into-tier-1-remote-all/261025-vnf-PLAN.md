---
phase: quick-261025-vnf
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/common/types.ts
  - src/backend/knownFixes.ts
  - src/backend/__tests__/knownFixes.test.ts
  - src/backend/__tests__/knownFixesLayered.test.ts
  - src/backend/storeManagers/steam/bridgeKnownFixes.ts
  - src/backend/__tests__/steamBridgeKnownFixes.test.ts
  - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
  - src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts
  - public/fixes/284100-steam.json
  - public/fixes/284100-steam.profile.json
  - .planning/todos/pending/2026-10-25-two-tier-known-fixes-split.md
  - .planning/todos/completed/2026-10-25-two-tier-known-fixes-split.md
  - .planning/todos/pending/2026-10-25-apply-tier-2-profiles-on-non-steam-launch-paths.md
autonomous: true
requirements: [TODO-2026-10-25-two-tier-known-fixes-split]

must_haves:
  truths:
    - "Tier 1 (`<appName>-<store>.json`) and tier 2 (`<appName>-<store>.profile.json`) each resolve local -> bundled -> remote on their own; a game can take tier 1 from remote and tier 2 from bundled in the same launch"
    - "Tier 2 is never read from the remote `fixes/` directory, even when a `.profile.json` sits there"
    - "Every tier-1 file is filtered through an allow-list of tier-1 keys; any other key is dropped with a warning, and a tier-2 key gets a warning that names the `.profile.json` file it belongs in"
    - "Unclaimed World's (284100) bundled `registry` profile still applies on a Steam bridge launch, now from `284100-steam.profile.json`"
    - "A Steam bridge launch picks up `envVariables` (and `winetricks`/`runInPrefix`) from a tier-1 file"
    - "`installFixes`, `getKnownFixesEnvVariables` and the `getKnownFixes` IPC read the layered tier-1 reader for every store"
  artifacts:
    - path: "src/backend/knownFixes.ts"
      provides: "readKnownFixes (tier 1, layered, allow-listed), readKnownFixProfile (tier 2, local+bundled), TIER1_KNOWN_FIX_KEYS, filterTier1KnownFixes"
      exports: ["readKnownFixes", "readKnownFixProfile", "TIER1_KNOWN_FIX_KEYS", "filterTier1KnownFixes"]
    - path: "src/common/types.ts"
      provides: "KnowFixesInfo (tier 1, + launchNotice) and KnownFixProfile (tier 2)"
      contains: "export interface KnownFixProfile"
    - path: "public/fixes/284100-steam.profile.json"
      provides: "Unclaimed World registry profile"
  key_links:
    - from: "src/backend/storeManagers/steam/bridgeKnownFixes.ts"
      to: "readKnownFixProfile"
      via: "registry source"
      pattern: "readKnownFixProfile\\(appId, 'steam'\\)"
    - from: "src/backend/storeManagers/steam/bridgeKnownFixes.ts"
      to: "readKnownFixes"
      via: "winetricks/runInPrefix/envVariables source"
      pattern: "readKnownFixes\\(appId, 'steam'\\)"
    - from: "src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts"
      to: "readKnownFixProfile"
      via: "steamSharedRedists source"
      pattern: "readKnownFixProfile\\(appId, 'steam'\\)\\?\\.steamSharedRedists"
---

<objective>
Implement decisions 1 and 6 (revised 2026-10-25) of `.planning/notes/per-game-compat-fixes-architecture.md`:
split the single known-fixes file into tier 1 (Heroic format plus `launchNotice`, remote-allowed,
allow-listed) and tier 2 (`.profile.json`, local + bundled only), each with its own reader and its
own layer resolution. Rewire the Steam bridge and shared-redist callers, rename the bundled 284100
file, close the todo.

Purpose: makes the trust boundary visible on disk and replaces the block-list with an allow-list,
which is the prerequisite for `2026-10-24-gamelib-own-known-fixes-repo-for-steam-and-complex-fixes.md`
(the remote fetcher). Do NOT implement that todo's fetcher, `downloadFixesFor` or `removeFixFile`
changes here. This plan only exposes what it will need: `TIER1_KNOWN_FIX_KEYS` and the pure
`filterTier1KnownFixes` validator, which the fetcher can apply to a downloaded file.

Output: two readers with tests, rewired callers, renamed bundled profile, todo moved to
`.planning/todos/completed/`, one follow-up todo.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/todos/pending/2026-10-25-two-tier-known-fixes-split.md
@.planning/notes/per-game-compat-fixes-architecture.md
@src/backend/knownFixes.ts
@src/backend/storeManagers/steam/bridgeKnownFixes.ts

Load `Skill("gamelib-conventions")` before writing the follow-up todo (frontmatter rule) and before
running any `<verify>` (prettier rule).

<facts_established_by_planner>
- Item 5 of the todo ("the Steam bridge applies only `registry` today") is STALE. Quick 261024-tny
  already made `applySteamBridgeKnownFixes` apply `winetricks`, `runInPrefix` and `envVariables`
  (the latter via `enviromentOptions`), and `steam/games.ts:3250` already calls it on every bridge
  launch. What item 5 needs now is only that those three keys come from the tier-1 reader after
  the split, plus a test proving a tier-1 `envVariables` reaches the returned settings while a
  tier-2 profile applies in the same call. Do not re-wire `steam/games.ts`.
- Callers today: `launcher.ts:994` (`installFixes`) and `:1032` (`getKnownFixesEnvVariables`) call
  `readKnownFixes`; `sidecar/enrichmentFlowRegistration.ts:209` (`getKnownFixes` IPC, used by the
  frontend for `winetricks` and `wikiLink`) calls `readKnownFixes`; `bridgeKnownFixes.ts:183` and
  `sharedRedistInstall.ts:342` call `readKnownFixesLayered`. Frontend reads only `winetricks` and
  `wikiLink` off `KnowFixesInfo` (no tier-2 key).
- Design choice (Claude's discretion): `readKnownFixes` KEEPS its name and becomes the layered,
  allow-listed tier-1 reader. So `launcher.ts` and `enrichmentFlowRegistration.ts` need no code
  edit to satisfy todo item 4 (they gain local/bundled layering for every store, per decision 6).
  `readKnownFixesLayered` is removed; `readKnownFixProfile` is the tier-2 reader.
- Under jest, `bundledFixesPath` resolves to the repo's real `public/fixes/`. `knownFixes.test.ts`
  does NOT mock it today; once `readKnownFixes` reads the bundled layer it must, exactly like
  `knownFixesLayered.test.ts:27-38` does, so tests can never read or delete shipped files.
- Prettier: `.planning/` is prettier-ignored (`npx prettier --file-info` -> `ignored: true`); the
  `src/` and `public/fixes/*.json` paths are not ignored.
- Todo closure convention (`git log --diff-filter=R -- .planning/todos/`, e.g. `0b92cdb63`): `git mv`
  from `pending/` to `completed/` (not `done/`), with a short closure note appended to the body.
- Test runner is jest (`npx jest <paths>`), typecheck is `npx tsc --noEmit`.
</facts_established_by_planner>

<interfaces>
From src/common/types.ts (current, lines 1119-1150):
- `export type KnownFixRegistryView = 32 | 64`
- `interface KnownFixRegistryEntry { key; name; type: 'REG_DWORD' | 'REG_SZ'; value: number | string; views?: KnownFixRegistryView[] }` (not exported)
- `export interface KnowFixesInfo { title: string; registry?; steamSharedRedists?: string[]; evidence?: string; notes?: Record<string,string>; winetricks?: string[]; runInPrefix?: string[]; envVariables?: Record<string,string>; wikiLink?: string }`

From src/backend/knownFixes.ts (current):
- private `readFixesFileWithin(dir, appName, runner, layerLabel?)` — resolve+relative containment guard, existsSync, JSON.parse, warns and returns null on malformed JSON
- `export function readKnownFixes(appName, runner): KnowFixesInfo | null` — reads `fixesPath` only
- `const TRUSTED_ONLY_KNOWN_FIX_KEYS = ['registry', 'steamSharedRedists']` — block-list on remote
- `export function readKnownFixesLayered(appName, runner)` — local -> bundled -> remote, first parsed plain object wins, non-object warns and falls through
- paths from `./constants/paths`: `localFixesPath` (`fixes/local`), `bundledFixesPath` (`public/fixes`), `fixesPath` (`fixes`, remote download dir)

From src/backend/storeManagers/steam/bridgeKnownFixes.ts:
- `export async function applySteamBridgeKnownFixes(appId, bridgeBottleSettings, installRoot): Promise<GameSettings>` — registry first, then winetricks, runInPrefix, then returns new settings with `envVariables` appended to `enviromentOptions`; never rejects
- `export function validateRegistryFixes(appId, raw: unknown): ValidRegistryFix[]`
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Two types and two readers with a tier-1 allow-list</name>
  <files>src/common/types.ts, src/backend/knownFixes.ts, src/backend/__tests__/knownFixesLayered.test.ts, src/backend/__tests__/knownFixes.test.ts</files>
  <behavior>
    Tier 1, `readKnownFixes(appName, runner)` reading `<appName>-<store>.json`:
    - no file in any layer -> null
    - local beats bundled beats remote; the first layer with a parsed plain object wins whole-file (no per-key merge)
    - malformed JSON or a non-object (array, number) in a layer warns and falls through to the next layer
    - a remote file `{title, envVariables, winetricks, runInPrefix, notes, wikiLink, launchNotice, registry, foo}` returns every tier-1 key unchanged and drops `registry` and `foo`
    - `registry` or `steamSharedRedists` (any tier-2 key) in a tier-1 file at the local, bundled AND remote layer is dropped, with a warning naming the layer and `<appName>-<store>.profile.json`
    - a non-tier-2 unknown key (`foo`) is dropped with a warning naming the layer
    - path traversal (`../../etc/x`) returns null with the existing containment warning
    - `filterTier1KnownFixes('1', 'remote', parsed)` is pure apart from warnings: same output as the reader for a plain object, null for a non-object
    Tier 2, `readKnownFixProfile(appName, runner)` reading `<appName>-<store>.profile.json`:
    - local beats bundled; a `.profile.json` placed ONLY in the remote `fixesPath` returns null (never read)
    - returns `title`, `notes`, `evidence`, `registry`, `steamSharedRedists` unchanged
    - a tier-1 functional key (`envVariables`, `winetricks`, `runInPrefix`, `wikiLink`, `launchNotice`) in a profile is dropped with a warning naming `<appName>-<store>.json`; any other unknown key is dropped with a warning
    - store-agnostic: `readKnownFixProfile('x', 'gog')` reads `x-gog.profile.json`, `'legendary'` reads `x-epic.profile.json`
    Independence: remote tier-1 `1-steam.json` plus bundled `1-steam.profile.json` -> both readers return their own file in the same test.
  </behavior>
  <action>
    Types (`src/common/types.ts`, per todo item 1 and decision 3): narrow `KnowFixesInfo` to the tier-1 keys only: `title`, `notes`, `winetricks`, `runInPrefix`, `envVariables`, `wikiLink`, plus new `launchNotice?: string` (UI text only, documented as tier 1; nothing renders it yet and this plan adds no UI). Add `export interface KnownFixProfile` with `title?: string`, `evidence?: string`, `notes?: Record<string, string>`, `registry?: KnownFixRegistryEntry[]`, `steamSharedRedists?: string[]`, moving the existing JSDoc for `registry`/`steamSharedRedists`/`evidence` onto it and rewording it to say these are read only from `<appName>-<store>.profile.json` in the local and bundled layers. `title` and `notes` are descriptive keys allowed in both tiers (the shipped 284100 file uses both).

    Readers (`src/backend/knownFixes.ts`, per decisions 1 and 6 and todo items 1, 2, 6): give `readFixesFileWithin` a filename-suffix parameter (`.json` vs `.profile.json`) so both tiers share the resolve+relative containment guard unchanged. Delete `TRUSTED_ONLY_KNOWN_FIX_KEYS` and `readKnownFixesLayered`. Add exported `TIER1_KNOWN_FIX_KEYS` (readonly tuple: title, notes, winetricks, runInPrefix, envVariables, wikiLink, launchNotice) and a non-exported `TIER2_PROFILE_KEYS` (title, notes, evidence, registry, steamSharedRedists), with a comment that `dllOverrides`, `overlays`, `shimFeatures`, `platforms` join TIER2 when implemented and must never be added to TIER1. Add exported `filterTier1KnownFixes(appName: string, layerLabel: string, parsed: unknown): KnowFixesInfo | null` that returns null (with the existing "is not an object" warning) for a non-plain-object, otherwise copies only allow-listed keys; for each dropped key, warn — if the key is in TIER2_PROFILE_KEYS (and not title/notes) say it is a tier-2 key that belongs in `<appName>-<store>.profile.json` and is ignored here, otherwise say it is not a tier-1 key. Docstring it as the validator the remote fetcher (todo 2026-10-24) applies to downloaded files. Rewrite `readKnownFixes` as the tier-1 layered reader: local -> bundled -> remote, apply `filterTier1KnownFixes` at EVERY layer (uniform allow-list; the remote layer gets no special casing beyond its label), first non-null wins. Add `readKnownFixProfile(appName, runner): KnownFixProfile | null` iterating ONLY `[localFixesPath, 'local'], [bundledFixesPath, 'bundled']` — `fixesPath` must not appear in its layer list — with the symmetric filter (drop tier-1 functional keys with a warning naming `<appName>-<store>.json`, drop unknown keys with a warning). Update the module docstring's quick 261025-mfz paragraph to describe the two tiers (cite quick 261025-vnf). Keep the "MUST NOT import electron" note.

    Tests: rework `knownFixesLayered.test.ts` (keep the file and its tmp `bundledFixesPath` mock) to cover every behavior bullet; its `put` helper takes a filename suffix. In `knownFixes.test.ts`, add the same `jest.mock('../constants/paths', ...)` redirecting `bundledFixesPath` to a tmp dir (unique suffix, e.g. `-plain`) and clean it in `afterAll`; its existing fixtures are already tier-1 only and should pass unchanged. Write the tests first and watch them fail before implementing.
  </action>
  <verify>
    <automated>npx jest src/backend/__tests__/knownFixes.test.ts src/backend/__tests__/knownFixesLayered.test.ts src/backend/sidecar/__tests__/enrichmentFlows.test.ts -t "readKnownFixes|readKnownFixProfile|filterTier1KnownFixes|getKnownFixes" && npx prettier --check src/common/types.ts src/backend/knownFixes.ts src/backend/__tests__/knownFixesLayered.test.ts src/backend/__tests__/knownFixes.test.ts</automated>
  </verify>
  <done>Both readers and the allow-list exist with tests for per-tier layering, the allow-list, the misplaced-key warning in both directions, and tier 2 never reading remote. `getKnownFixes` IPC test still green. Typecheck errors at the old `readKnownFixesLayered` callers are expected until Task 2.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Rewire the Steam bridge and shared-redist callers; rename the bundled 284100 file</name>
  <files>src/backend/storeManagers/steam/bridgeKnownFixes.ts, src/backend/__tests__/steamBridgeKnownFixes.test.ts, src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts, src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts, public/fixes/284100-steam.json, public/fixes/284100-steam.profile.json</files>
  <behavior>
    - bundled `480-steam.profile.json` with `registry` -> registry `reg add` calls happen (32 then 64), as today
    - `registry` inside `480-steam.json` at any layer -> no `reg add` call and a misplaced-key warning
    - `480-steam.profile.json` only in remote `fixesPath` -> no `reg add` call
    - remote tier-1 `480-steam.json` with `envVariables {A: '1'}` AND bundled `480-steam.profile.json` with `registry` in the same launch -> reg add runs AND the returned settings carry `{key:'A', value:'1'}` after the user env (decision 6: tiers resolve independently)
    - neither file present -> returns the same settings object, no calls
    - the shipped `public/fixes/284100-steam.profile.json` validates to one registry entry (both views) and cites its evidence todo; `public/fixes/284100-steam.json` no longer exists
    - `sharedRedistInstall` reads `steamSharedRedists` from `readKnownFixProfile`
  </behavior>
  <action>
    Per todo items 3, 4, 5. `git mv public/fixes/284100-steam.json public/fixes/284100-steam.profile.json`, contents unchanged (`title`, `evidence`, `notes`, `registry` are all allowed tier-2 keys). `src-tauri/tauri.conf.json:58` copies the whole `public/fixes/` directory, so no packaging change.

    In `bridgeKnownFixes.ts`, replace the single `readKnownFixesLayered(appId, 'steam')` with `const fixes = readKnownFixes(appId, 'steam')` (tier 1: winetricks, runInPrefix, envVariables) and `const profile = readKnownFixProfile(appId, 'steam')` (tier 2: registry). Return `bridgeBottleSettings` unchanged only when both are null. Keep the order (registry from `profile` first, then the tier-1 steps) and the never-rejects contract; every `fixes.x` access becomes null-safe (`fixes?.winetricks` etc.). Update the module docstring: tier-1 keys come from `<appId>-steam.json` (local/bundled/remote, allow-listed), `registry` from `<appId>-steam.profile.json` (local/bundled only). Do not touch `steam/games.ts` — it already calls the applier on every bridge launch (quick 261024-tny).

    In `sharedRedistInstall.ts:342`, switch to `readKnownFixProfile(appId, 'steam')?.steamSharedRedists` and the import. In its test, change the `jest.mock('backend/knownFixes', ...)` factory and `mockedFixes` to `readKnownFixProfile`.

    In `steamBridgeKnownFixes.test.ts`: registry tests write `.profile.json` (give `writeIn` a suffix parameter); change the "ignores registry from the remote layer" test to cover both a remote `.profile.json` and a `registry` key in a tier-1 `.json`; add the combined tier-1-env + tier-2-registry test from the behavior list; point the "bundled 284100 profile" test at `284100-steam.profile.json` and assert the old filename is absent via `fs.existsSync`. Add the tier-1-env test first and watch it fail before rewiring.
  </action>
  <verify>
    <automated>npx jest src/backend/__tests__/steamBridgeKnownFixes.test.ts src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts src/backend/__tests__/knownFixes.test.ts src/backend/__tests__/knownFixesLayered.test.ts && npx tsc --noEmit && test ! -e public/fixes/284100-steam.json && ! git grep -q "readKnownFixesLayered\|TRUSTED_ONLY_KNOWN_FIX_KEYS" -- src && npx prettier --check src/backend/storeManagers/steam/bridgeKnownFixes.ts src/backend/__tests__/steamBridgeKnownFixes.test.ts src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts public/fixes/284100-steam.profile.json</automated>
  </verify>
  <done>Bridge applies the 284100 registry profile from `.profile.json`, applies tier-1 `envVariables`/`winetricks`/`runInPrefix` from `.json`, the two resolve independently, shared redists read the profile reader, no reference to the removed names remains in `src/`, and the whole project typechecks.</done>
</task>

<task type="auto">
  <name>Task 3: Close the two-tier todo and file the non-Steam tier-2 follow-up</name>
  <files>.planning/todos/completed/2026-10-25-two-tier-known-fixes-split.md, .planning/todos/pending/2026-10-25-apply-tier-2-profiles-on-non-steam-launch-paths.md</files>
  <action>
    `git mv .planning/todos/pending/2026-10-25-two-tier-known-fixes-split.md .planning/todos/completed/` (the repo's convention is `completed/`, not `done/`; see `0b92cdb63`). Append a `## Closed 2026-10-25 (quick 261025-vnf)` section: the two readers and their file names; that `readKnownFixes` kept its name and gained layering, so `launcher.ts` and the `getKnownFixes` IPC needed no edit; that item 5 was already done by quick 261024-tny and this task only re-sourced those keys from tier 1 and added the combined test; that `TIER1_KNOWN_FIX_KEYS` and `filterTier1KnownFixes` are the exports the remote fetcher todo (`2026-10-24-gamelib-own-known-fixes-repo-for-steam-and-complex-fixes.md`) should apply to downloaded files; and the follow-up filed below.

    Per todo item 6 (applying tier 2 on Epic/GOG/Amazon is not small: `validateRegistryFixes`/`reg add` live in the Steam bridge module and `prepareWineLaunch` only runs `installFixes` when the prefix was just created), create `.planning/todos/pending/2026-10-25-apply-tier-2-profiles-on-non-steam-launch-paths.md` with frontmatter `created: 2026-10-25`, `title:`, `source: quick 261025-vnf`, `area: steam-launch`, `files:` (`src/backend/launcher.ts`, `src/backend/storeManagers/steam/bridgeKnownFixes.ts`), then — bare, lowercase, in this order, per gamelib-conventions — `severity: minor`, `platform: any`, `ready: code`. Body: decision 1 says profiles apply to every store; `readKnownFixProfile` is already store-agnostic; work is to lift registry validation/application out of the Steam module and call it from the Wine launch path for legendary/gog/nile/zoom/sideload; Done-when: a `<appName>-gog.profile.json` `registry` entry is written to that game's prefix on launch, with a test.
  </action>
  <verify>
    <automated>test -f .planning/todos/completed/2026-10-25-two-tier-known-fixes-split.md && test ! -e .planning/todos/pending/2026-10-25-two-tier-known-fixes-split.md && grep -q "quick 261025-vnf" .planning/todos/completed/2026-10-25-two-tier-known-fixes-split.md && pnpm planning-gates</automated>
    Prettier: omitted for this task — both written paths are under `.planning/`, which `.prettierignore` excludes (`npx prettier --file-info .planning/todos/completed/x.md` -> `ignored: true`), so a check would be a green that proves nothing.
  </verify>
  <done>The two-tier todo is in `completed/` with a closure note; the follow-up todo exists and passes the todo frontmatter gate.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| remote `fixes/` dir -> launch pipeline | Files downloaded from a known-fixes feed (Heroic's today, GameLib's later) are less trusted than bundled/local |
| renderer -> `getKnownFixes` IPC | `appName` is a free string from the renderer |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-vnf-01 | Elevation of privilege | `readKnownFixes` remote layer | mitigate | Allow-list `TIER1_KNOWN_FIX_KEYS` replaces the block-list, so a new tier-2 key cannot reach remote by being forgotten (decision 6); tested |
| T-vnf-02 | Tampering | `readKnownFixProfile` | mitigate | Layer list contains only `localFixesPath` and `bundledFixesPath`; test proves a remote `.profile.json` is never read |
| T-vnf-03 | Information disclosure | `readFixesFileWithin` | mitigate | Existing resolve+relative containment guard kept and shared by both suffixes; traversal test kept |
| T-vnf-04 | Elevation of privilege | tier-1 `runInPrefix`/`winetricks` | accept | Same trust Heroic users extend to its feed (decision 6); `runInPrefix` stays confined to the install root by the existing bridge check |
</threat_model>

<verification>
- `npx jest src/backend/__tests__/knownFixes.test.ts src/backend/__tests__/knownFixesLayered.test.ts src/backend/__tests__/steamBridgeKnownFixes.test.ts src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts src/backend/sidecar/__tests__/enrichmentFlows.test.ts` green
- `npx tsc --noEmit` clean
- `git grep readKnownFixesLayered -- src` empty
</verification>

<success_criteria>
Todo Done-when met: the two readers exist with tests for per-tier layering, the allow-list and the
misplaced-key warning; the 284100 profile still applies on a bridge launch (from
`284100-steam.profile.json`); a Steam game picks up `envVariables` from a tier-1 file. The todo is
in `completed/`, and the follow-up for non-Steam tier-2 application is filed.
</success_criteria>

<output>
Create `.planning/quick/261025-vnf-split-known-fixes-into-tier-1-remote-all/261025-vnf-SUMMARY.md` when done
</output>
