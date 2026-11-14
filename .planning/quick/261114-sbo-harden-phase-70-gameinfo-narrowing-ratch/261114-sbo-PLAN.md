---
phase: quick-261114-sbo
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/common/types/ipc/gameDetails.ts
  - src/common/types/ipc/wineTools.ts
  - src/common/types/ipc/settingsSchema.ts
  - src/common/types/ipc/schemaTypes.ts
  - src/backend/gamedetails/dispatch.ts
  - src/backend/storeManagers/sideload/library.ts
  - src/backend/storeManagers/gog/library.ts
  - src/backend/sidecar/wineToolsFlowRegistration.ts
  - src/backend/sidecar/__tests__/ipcSchemas/gameDetails.test.ts
  - src/backend/sidecar/__tests__/ipcSchemas/wineTools.test.ts
  - src/backend/sidecar/__tests__/ipcSchemas/settings.test.ts
  - src/backend/sidecar/__tests__/wineToolsFlows.test.ts
  - src/backend/storeManagers/gog/__tests__/library.test.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/** (only the internal callers tsc flags; see Task 2)
  - meta/gameInfoNarrowingCeiling.cjs
  - meta/__tests__/gameInfoNarrowingCeiling.test.ts
  - meta/gameInfoNarrowingBaseline.json
  - src/backend/testUtils/gameInfoFixtures.ts
  - .planning/todos/pending/2026-11-14-harden-phase-70-gameinfo-narrowing-and-schemas.md (moved to completed/)
autonomous: true
requirements:
  - TODO-2026-11-14-harden-phase-70-gameinfo-narrowing-and-schemas
  - 70-REVIEW prior WR-02, WR-03, WR-06, WR-07, IN-01, IN-02

must_haves:
  truths:
    - "addNewApp IPC rejects any payload whose runner is not 'sideload'; SideloadDialog still adds an app"
    - "runWineCommand's gameSettings is typed Partial<GameSettings> at the schema, and the handler fills missing keys from global settings before calling commandRunner.runWineCommand"
    - "settings wineVersion no-wine arm is strict: it admits {} and { bin: '', name, type } and rejects unknown keys or untyped lib/lib32/wineserver"
    - "A GOG launch option never has name undefined, so lastUsedLaunchOption writes pass the strict schema"
    - "SteamGame no longer produces a value typed SteamGameInfo that is actually {}; Steam-internal readers get SteamGameInfo | undefined and handle the miss"
    - "The narrowing ratchet counts GameInfoByRunner[...] indexed access, Extract<...GameInfo...>, and isStore(<object>, '<literal>'), and scans src/common outside its type/guard homes"
    - "node meta/gameInfoNarrowingCeiling.cjs passes against a re-frozen baseline where every entry has an accurate reason (GamePage reason no longer mentions namespace)"
  artifacts:
    - path: "src/common/types/ipc/gameDetails.ts"
      contains: "addNewApp: z.tuple([sideloadGameInfoSchema])"
    - path: "src/common/types/ipc/wineTools.ts"
      provides: "honest Partial<GameSettings> arg type (no `as unknown as z.ZodType<GameSettings`)"
    - path: "meta/gameInfoNarrowingCeiling.cjs"
      provides: "bypass-form counting + src/common scan"
    - path: "meta/gameInfoNarrowingBaseline.json"
      provides: "re-frozen counts + reasons"
  key_links:
    - from: "src/common/types/ipc/gameDetails.ts"
      to: "src/backend/storeManagers/sideload/library.ts addNewApp(gameInfo: SideloadGameInfo)"
      via: "gamedetails/dispatch.ts addNewApp"
    - from: "src/backend/sidecar/wineToolsFlowRegistration.ts runWineCommand handler"
      to: "deps.config.getSettings()"
      via: "merge partial gameSettings over global defaults"
    - from: ".github/workflows/lint.yml / .husky/pre-push"
      to: "meta/gameInfoNarrowingCeiling.cjs"
      via: "pnpm gameinfo-narrowing-ceiling (unchanged wiring; gameInfoNarrowingWiring.test.ts must stay green)"
---

<objective>
Close the non-blocking Phase 70 review follow-ups recorded in
`.planning/todos/pending/2026-11-14-harden-phase-70-gameinfo-narrowing-and-schemas.md`:
WR-02 (ratchet bypass forms + src/common scan), WR-03 (addNewApp schema), WR-06 (wineTools cast +
loose no-wine arm), WR-07 (`{} as SteamGameInfo`), IN-01 (GamePage baseline reason), IN-02 (GOG
launch option undefined name), and the stale `phase70Passthrough` JSDoc.

Purpose: the IPC schemas should be as strict as their types claim, and the shrink-only narrowing
ratchet should see every way shared code narrows GameInfo.
Output: tightened schemas + handler, honest SteamGame miss typing, hardened ratchet with a
re-frozen baseline, todo moved to completed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/todos/pending/2026-11-14-harden-phase-70-gameinfo-narrowing-and-schemas.md

The detailed original findings (WR-02/03/06/07, IN-01/02) live in the FIRST review commit, not the
current 70-REVIEW.md (which is the gap-closure re-review and only lists them as "prior ... open").
Read them with:
`git show b4ef250e2:.planning/phases/70-split-gameinfo-into-shared-and-per-store-shapes/70-REVIEW.md`

Load `Skill("gamelib-conventions")` before writing verify output (prettier rule). Repo memory:
`gsd-sdk query commit` sweeps every dirty .planning file — commit with explicit `git add <file>`
+ `git commit` instead. The working tree has unrelated dirty files (GamePage components,
spikes); never stage them.

<interfaces>
Facts measured at planning time (2026-11-14):

src/common/types/ipc/gameDetails.ts:32 — `addNewApp: z.tuple([gameInfoSchema])`; imports
`gameInfoSchema, installPlatform` from './gameInfoSchema', which also exports
`sideloadGameInfoSchema` (line 203).
src/backend/gamedetails/dispatch.ts:355 — `export function addNewApp(deps, args: GameInfo)` ->
`deps.managers.library['sideload'].addNewApp(args)`.
src/backend/storeManagers/sideload/library.ts:25 — `addNewApp(gameInfo: GameInfo): void`, reads
`browserUrl/customUserAgent/launchFullScreen` via `asStoreGame(gameInfo, 'sideload') ?? {}`.
Renderer caller: SideloadDialog/index.tsx:210 already sends `runner: 'sideload'`.
Check the LibraryManager interface in src/common/types/game_manager.ts for an `addNewApp`
signature; if present, it may need the sideload member type too (tsc will say).

src/common/types/ipc/wineTools.ts:33 —
`const gameSettingsArg = gameSettingsSchema.partial() as unknown as z.ZodType<GameSettings, GameSettings>`
used as `runWineCommand[0].gameSettings`.
src/backend/sidecar/wineToolsFlowRegistration.ts:180 — handler is
`deps.commandRunner.runWineCommand(args[0] as WineCommandArgs)`; `deps.config` is
`Pick<GlobalConfigSlice, 'getSettings' | 'getAlternativeWine' | 'setSetting'>`.
`AppSettings extends GameSettings` (common/types.ts:114).

src/common/types/ipc/settingsSchema.ts:24 — `noWineInstallation = z.looseObject({ bin: z.literal('').optional(), name?, type? })`.
schemaTypes.ts:66 `wineInstallationArg()` bounds `lib/lib32/wineserver` as `z.string().max(4096).nullish()`.
schemaTypes.ts:9-10 JSDoc still says "unless it is wrapped in `phase70Passthrough`" (helper no longer exists).

src/backend/storeManagers/gog/library.ts:1666 — `name: task?.name || infoFile.name,`.

src/backend/storeManagers/steam/games.ts:49 `export default class SteamGame implements Game`;
:144 `getGameInfo(): SteamGameInfo` returns `{} as SteamGameInfo` at :174 on double miss. The `{}`
sentinel is a DOCUMENTED cross-runner protocol (JSDoc lines ~120-143: dispatch.ts converts it to
null; tray runner resolution and library.ts rely on falsy app_name) — keep the runtime `{}`.
Game interface: src/common/types/game_manager.ts:53 `getGameInfo: () => GameInfo`.
Steam-internal callers (non-test): games.ts:236, :662; gameInstallBridge.ts:745;
gameUninstall.ts:338; gameBridgeLaunchGate.ts:47; launchDispatch.ts:82, :112;
gameEligibility.ts:242; gameLaunch.ts:250, :493, :518, :824; updateLaunchPrompt.ts:38, :121;
updateBridge.ts:62. 127 getGameInfo() calls exist backend-wide — do NOT change the Game interface.

meta/gameInfoNarrowingCeiling.cjs: `SCAN_DIRS = ['src/frontend', 'src/backend']`,
`SKIP_DIRS = {__tests__, __mocks__, node_modules}`, `GUARDS = {isStoreGame, asStoreGame}`,
`MEMBER_TYPES` = 5 `*GameInfo` names; exports `countNarrowing, collectFiles, evaluate, parseArgs,
staleExemptions, STORE_SPECIFIC_EXEMPT`. Currently PASS (788 files scanned, 18 allowlisted),
`DEFAULT_MIN_FILES = 704`. Wired as `pnpm gameinfo-narrowing-ceiling`; wiring pinned by
meta/__tests__/gameInfoNarrowingWiring.test.ts.
`isStore` overload (src/common/storeCapabilities.ts:157) narrows objects:
`subject is T & { runner: K }`; it also accepts plain runner strings (identity check, not narrowing).
src/backend/testUtils/gameInfoFixtures.ts uses `GameInfoByRunner['steam']` etc. and its line-5
comment says it does so to dodge the ratchet. Only src/common/__fixtures__ exists as a
`__fixtures__` dir under src.
Typecheck command: `pnpm codecheck` (= `tsc --noEmit && tsc -p tsconfig.meta.json --noEmit`).
Prettier: every non-.planning path above reports `ignored:false`; `.planning/**` is ignored.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Tighten addNewApp, wineTools gameSettings, no-wine arm, GOG launch option name, schemaTypes JSDoc (WR-03, WR-06, IN-02)</name>
  <files>src/common/types/ipc/gameDetails.ts, src/backend/gamedetails/dispatch.ts, src/backend/storeManagers/sideload/library.ts, src/common/types/ipc/wineTools.ts, src/backend/sidecar/wineToolsFlowRegistration.ts, src/common/types/ipc/settingsSchema.ts, src/common/types/ipc/schemaTypes.ts, src/backend/storeManagers/gog/library.ts, src/backend/sidecar/__tests__/ipcSchemas/gameDetails.test.ts, src/backend/sidecar/__tests__/ipcSchemas/wineTools.test.ts, src/backend/sidecar/__tests__/ipcSchemas/settings.test.ts, src/backend/sidecar/__tests__/wineToolsFlows.test.ts, src/backend/storeManagers/gog/__tests__/library.test.ts</files>
  <behavior>
    - gameDetails schema table: addNewApp `valid` = sideload fixtures only; `invalid` gains one complete fixture per non-sideload runner (steam, gog, legendary, nile) — each must be rejected.
    - wineTools schema: runWineCommand with a gameSettings object missing wineVersion/winePrefix still parses (partial), unknown keys still reject.
    - wineToolsFlows: the runWineCommand handler passes commandRunner a gameSettings in which keys absent from the payload come from deps.config.getSettings(), payload keys win; no gameSettings in -> none out (undefined stays undefined).
    - settings schema (setSetting wineVersion / writeConfig): `{}` and `{ bin: '', name: 'Default Wine - Not Found', type: 'wine' }` accepted; `{ bin: '', wineserver: 5 }`, `{ smuggled: 1 }` and `{ lib: 'x'.repeat(5000) }` rejected.
    - gog library: getLaunchOptions with a FileTask lacking `name` and an infoFile lacking `name` yields `name: ''` (a string), never undefined.
  </behavior>
  <action>
WR-03: In gameDetails.ts switch `addNewApp` to `z.tuple([sideloadGameInfoSchema])` (drop the `gameInfoSchema` import if now unused). In dispatch.ts type `addNewApp`'s arg as `SideloadGameInfo`. In sideload/library.ts type `addNewApp(gameInfo: SideloadGameInfo)` and destructure `browserUrl, customUserAgent, launchFullScreen` directly from `gameInfo`, removing the `asStoreGame(...) ?? {}` read (and the import if unused). If the LibraryManager interface in game_manager.ts declares `addNewApp`, narrow it to the sideload member only if tsc requires; otherwise leave the interface alone. Update the gameDetails ipcSchemas test table per the behavior block (the existing perRunner/legendary-dlcList valid rows move to invalid or are dropped; keep the sideload rows and strictRejects for the sideload fixture).

WR-06 (wineTools): replace the `as unknown as z.ZodType<GameSettings, GameSettings>` cast with an honest type — `gameSettingsSchema.partial()` itself, or if its inferred type does not line up with the interface, a single cast to `z.ZodType<Partial<GameSettings>, Partial<GameSettings>>`. Rewrite the comment above it to say the value is partial and the handler fills defaults. The derived `WineToolsAsync` type then makes the renderer's `runWineCommand` gameSettings `Partial<GameSettings>` — fix any renderer/compile fallout tsc reports (a full GameSettings is still assignable to Partial, so expect little). In wineToolsFlowRegistration.ts change the runWineCommand handler to: take args[0], and when it has `gameSettings`, call commandRunner.runWineCommand with `gameSettings: { ...deps.config.getSettings(), ...args[0].gameSettings }` (AppSettings extends GameSettings, so the merge is a full GameSettings); otherwise pass through unchanged. Keep the "pass-through only" comment accurate (it now fills defaults; still no wine-env reconstruction). Check that `deps.config.getSettings` is synchronous by reading GlobalConfigSlice; await it if it returns a Promise.

WR-06 (settingsSchema): make `noWineInstallation` a `z.strictObject` declaring `bin: z.literal('').optional()`, `name`, `type` as now, plus `lib`, `lib32`, `wineserver` each `z.string().max(4096).nullish()` (same bounds as wineInstallationArg). Update its comment: its only purpose is admitting the two factory defaults. Keep the existing `as unknown as z.ZodType<WineInstallation, WineInstallation>` on the union (that one bridges zod's loose-object index signature, which the first arm still has; it is not the WR-06 lie). Run settingsParity.test.ts to confirm parity still holds.

IN-02: in gog/library.ts getLaunchOptions write `name: task?.name || infoFile.name || ''`. Add the behavior test to gog/__tests__/library.test.ts next to the existing getLaunchOptions coverage (grep for it; if none, add a minimal describe using that file's existing infoFile mocking pattern).

JSDoc: in schemaTypes.ts lines 9-10 drop the "unless it is wrapped in `phase70Passthrough`" clause; state that the named loose boundaries (wineInstallationArg, settings configArg, wineVersionInfo) are the only non-strict objects and each carries its own comment.

Write the tests first (RED), then implement (GREEN).
  </action>
  <verify>
    <automated>pnpm jest src/backend/sidecar/__tests__/ipcSchemas/gameDetails.test.ts src/backend/sidecar/__tests__/ipcSchemas/wineTools.test.ts src/backend/sidecar/__tests__/ipcSchemas/settings.test.ts src/backend/sidecar/__tests__/ipcSchemas/settingsParity.test.ts src/backend/sidecar/__tests__/ipcSchemas/gameInfoParity.test.ts src/backend/sidecar/__tests__/wineToolsFlows.test.ts src/backend/storeManagers/gog/__tests__/library.test.ts src/backend/storeManagers/sideload && pnpm codecheck && node meta/gameInfoNarrowingCeiling.cjs && npx prettier --check src/common/types/ipc/gameDetails.ts src/backend/gamedetails/dispatch.ts src/backend/storeManagers/sideload/library.ts src/common/types/ipc/wineTools.ts src/backend/sidecar/wineToolsFlowRegistration.ts src/common/types/ipc/settingsSchema.ts src/common/types/ipc/schemaTypes.ts src/backend/storeManagers/gog/library.ts src/backend/sidecar/__tests__/ipcSchemas/gameDetails.test.ts src/backend/sidecar/__tests__/ipcSchemas/wineTools.test.ts src/backend/sidecar/__tests__/ipcSchemas/settings.test.ts src/backend/sidecar/__tests__/wineToolsFlows.test.ts src/backend/storeManagers/gog/__tests__/library.test.ts</automated>
    Run `npx prettier --file-info` on each path first; drop from the --check list only a path that reports ignored:true (none did at planning time). Add any extra file tsc forced you to touch (e.g. game_manager.ts, a renderer file) to both the jest scope (its nearest test) and the prettier list. Ratchet must still PASS here (Task 3 re-freezes; if this task moved a scanned count, fix the baseline number now with an unchanged reason).
  </verify>
  <done>Non-sideload addNewApp payloads are rejected; no `as unknown as z.ZodType<GameSettings` remains in wineTools.ts (`grep -c 'ZodType<GameSettings, GameSettings>' src/common/types/ipc/wineTools.ts` = 0); handler merges defaults; no-wine arm is strict with bounded lib keys; GOG launch option name is always a string; `phase70Passthrough` absent from schemaTypes.ts; all listed tests, codecheck, ratchet and prettier green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Make SteamGame's cache miss honestly typed (WR-07)</name>
  <files>src/backend/storeManagers/steam/games.ts, the Steam-internal caller files tsc flags (from: gameInstallBridge.ts, gameUninstall.ts, gameBridgeLaunchGate.ts, launchDispatch.ts, gameEligibility.ts, gameLaunch.ts, updateLaunchPrompt.ts, updateBridge.ts — all under src/backend/storeManagers/steam/), and their existing __tests__</files>
  <behavior>
    - `findGameInfo()` returns the SteamGameInfo on Map hit, on persisted-cache hit (and self-heals the Map), and `undefined` on double miss (still logging the miss once per appId).
    - `getGameInfo()` on double miss still returns a value that `dispatch.ts` turns into null (empty object, falsy app_name) — existing sentinel tests stay green.
    - A Steam-internal reader that needs Steam-only fields or forwards the whole object (games.ts getExtraInfo/isGameAvailable, gameEligibility fetchMetadataIfNeeded, updateLaunchPrompt buildUpdateQueueElement) handles `undefined` explicitly instead of reading through `{}`.
  </behavior>
  <action>
Per WR-07, without widening the cross-runner Game interface (127 generic callers; the `{}` sentinel is a documented protocol — keep it at runtime):
1. In games.ts move the current lookup body of getGameInfo() (Map read, steamLibraryStore fallback + Map self-heal, once-per-appId miss log) into a new public method `findGameInfo(): SteamGameInfo | undefined` that returns `undefined` on double miss. The lazy metadata fetch side effect that currently follows the lookup stays in getGameInfo() only if it is gated on a hit — keep behavior identical for hits: decide by reading the code after line 175 and put the side effect where hits from BOTH methods trigger it exactly as today (simplest: in findGameInfo after a hit).
2. Re-type `getGameInfo(): GameInfo` (the interface type, not SteamGameInfo) as `return this.findGameInfo() ?? ({} as GameInfo)`. Update the long JSDoc: the `{}` sentinel is now typed GameInfo (the union, so `isStoreGame(gi,'steam')` and `gi.runner === 'steam'` agree — both false), and Steam-internal code that needs Steam fields must call findGameInfo().
3. Run `pnpm codecheck`. For every Steam-internal site tsc flags (a Steam-only field read through the now-GameInfo return) switch it to `findGameInfo()` and handle `undefined` explicitly. Also switch the whole-object forwarders listed in the behavior block even if tsc is quiet: games.ts:236 (`info.extra ?? default` -> `this.findGameInfo()?.extra ?? default`), games.ts:662 (isGameAvailable: a miss resolves the same as today's `{}` path — read the function and preserve its result for `{}`), gameEligibility.ts:242 (skip fetchMetadataIfNeeded on a miss), updateLaunchPrompt.ts:121 (do not enqueue an update element on a miss; log at warning via the file's existing logger). Pure `.title` reads (gameLaunch, gameUninstall, gameInstallBridge, gameBridgeLaunchGate, launchDispatch:82, updateBridge, updateLaunchPrompt:38) may stay on getGameInfo() — `.title` is a GameInfoCore field and those sites already fall back or accept empty; leave them unchanged to keep the diff small. launchDispatch.ts:112 `addRecentGame(deps, game.getGameInfo())` — `game` there is generic; leave it.
4. Tests: existing Steam tests that stub `getGameInfo` on a SteamGame and drive a site you switched must now stub `findGameInfo` (grep `getGameInfo` in src/backend/storeManagers/steam/__tests__ for the switched files). Add a games.ts test for the three findGameInfo outcomes (Map hit, store hit + self-heal, double miss -> undefined, getGameInfo -> `{}`). Find the existing getGameInfo/double-miss test (grep `loggedEmptyGameInfoMisses` or `double cache miss` in steam __tests__) and extend it rather than creating a new harness.
  </action>
  <verify>
    <automated>pnpm jest src/backend/storeManagers/steam && pnpm jest src/backend/gamedetails && pnpm codecheck && node meta/gameInfoNarrowingCeiling.cjs && grep -c '{} as SteamGameInfo' src/backend/storeManagers/steam/games.ts | grep -qx 0 && npx prettier --check src/backend/storeManagers/steam/games.ts <every other file this task wrote, listed explicitly&gt;</automated>
    Run `npx prettier --file-info` on each written path first (all src/ paths were ignored:false at planning time); list every path explicitly, never a directory or `.`.
  </verify>
  <done>`{} as SteamGameInfo` is gone; SteamGame.findGameInfo() returns SteamGameInfo | undefined; getGameInfo() is typed GameInfo and still returns the `{}` sentinel on miss; the forwarders handle the miss; steam + gamedetails jest, codecheck, ratchet and scoped prettier green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Count ratchet bypass forms, scan src/common, re-freeze baseline with reasons, close the todo (WR-02, IN-01)</name>
  <files>meta/gameInfoNarrowingCeiling.cjs, meta/__tests__/gameInfoNarrowingCeiling.test.ts, meta/gameInfoNarrowingBaseline.json, src/backend/testUtils/gameInfoFixtures.ts, .planning/todos/pending/2026-11-14-harden-phase-70-gameinfo-narrowing-and-schemas.md -> .planning/todos/completed/</files>
  <behavior>
    - countNarrowing counts 1 for `type X = GameInfoByRunner['steam']` (indexed access on GameInfoByRunner).
    - counts 1 for `Extract<GameInfo, { runner: 'steam' }>` (Extract whose first type argument's text contains `GameInfo`).
    - counts 1 for `isStore(game, 'steam')` and `isStore(info.game, 'gog')`.
    - counts 0 for `isStore(runner, 'steam')`, `isStore(game.runner, 'steam')`, `isStore(props.store, 'gog')`, `isStore('steam', 'steam')`, and for `isStore(game, someVar)` (non-literal second arg).
    - an import of GameInfoByRunner alone still counts 0; comments still count 0.
    - collectFiles includes `src/common/*.ts` but not `src/common/types/**`, `src/common/gameInfoNarrowing.ts`, `src/common/storeCapabilities.ts`, nor `__fixtures__` dirs.
  </behavior>
  <action>
Per WR-02, in meta/gameInfoNarrowingCeiling.cjs:
- In countNarrowing's visitor add three counted forms (still skipping import/export declarations and comments): (a) `ts.isIndexedAccessTypeNode(node)` whose `objectType` is a TypeReference named `GameInfoByRunner`; (b) a TypeReference named `Extract` whose first type argument's `getText()` contains `GameInfo`; (c) a call to identifier `isStore` with exactly 2+ args where arg[1] is a string literal and arg[0] is NOT a runner/store-ish expression — exclude when arg[0] is a string literal, an identifier whose name matches /runner|store/i, or a property access whose `name.text` matches /runner|store/i. This is the syntactic approximation the review sanctions ("a syntactic approximation is fine"); document the exclusion rule and why (plain runner strings are identity checks, not narrowing) in the header comment. Make sure (a) does not double-count with MEMBER_TYPES (it names none of the five).
- Add `'src/common'` to SCAN_DIRS. Add `'__fixtures__'` to SKIP_DIRS (test data, same class as __tests__/__mocks__). Exempt, via a new reasoned list checked in isExempt: `src/common/types` (directory: the GameInfo type and schema homes), `src/common/gameInfoNarrowing.ts` (defines isStoreGame/asStoreGame), `src/common/storeCapabilities.ts` (defines isStore). Have staleExemptions cover the new list too.
- Update the header comment: scope now src/frontend, src/backend, src/common; list all counted forms; remove the obsolete "until 70-10 the count legitimately grows" paragraph. Keep DEFAULT_MIN_FILES unless the scanned count drops below it (it should rise); if it rises substantially, leave the floor (it is a broken-scan detector, not a target).
- Write the behavior-block cases into meta/__tests__/gameInfoNarrowingCeiling.test.ts first (RED), extend the collectFiles test fixture tree with src/common files for the inclusion/exemption cases, then implement (GREEN).

Then re-freeze meta/gameInfoNarrowingBaseline.json BY HAND (there is no update flag): run `node meta/gameInfoNarrowingCeiling.cjs`, and for every `grew` file read the counted lines and set its exact count with a one-sentence reason naming the store-only fields or the narrowing purpose actually in that file (accurate per file — no generic boilerplate; IN-01 is the precedent for why). For a file whose only new counts are `isStore(game, '<store>')` identity checks that read no store-only field, the reason says so ("isStore(game, 'x') identity gate; reads no store-only field"). Adjust existing entries whose counts changed and re-check their reasons. IN-01: set the GamePage/index.tsx reason to the actual reads — at minimum "Legendary-only isEAManaged/isUbisoftManaged for the not-supported third-party check", amended for any isStore narrowings now counted there; it must not mention `namespace`. Give src/backend/testUtils/gameInfoFixtures.ts its own entry with reason "Test fixture builders: one complete GameInfo member per runner for the strict IPC schema tests", and rewrite its line-5/6 comment to say the fixtures name members via GameInfoByRunner and are allowlisted in the ratchet baseline (no longer "so the ratchet does not count this"). If the re-freeze adds more than 45 new entries, stop and report the count and the top files instead of freezing (signals the isStore heuristic is too broad) — this is the one condition to pause on.

Finally, `git mv .planning/todos/pending/2026-11-14-harden-phase-70-gameinfo-narrowing-and-schemas.md .planning/todos/completed/` and append a short "## Resolution" section listing what each item became (with quick task id 261114-sbo). Commit planning files with explicit `git add <path>` (not gsd-sdk commit, which sweeps unrelated dirty .planning files).
  </action>
  <verify>
    <automated>pnpm jest meta/__tests__/gameInfoNarrowingCeiling.test.ts meta/__tests__/gameInfoNarrowingWiring.test.ts && node meta/gameInfoNarrowingCeiling.cjs && pnpm codecheck && pnpm planning-gates && test ! -e .planning/todos/pending/2026-11-14-harden-phase-70-gameinfo-narrowing-and-schemas.md && test -e .planning/todos/completed/2026-11-14-harden-phase-70-gameinfo-narrowing-and-schemas.md && ! grep -q namespace <(node -e "console.log(require('./meta/gameInfoNarrowingBaseline.json').reasons['src/frontend/screens/Game/GamePage/index.tsx'])") && npx prettier --check meta/gameInfoNarrowingCeiling.cjs meta/__tests__/gameInfoNarrowingCeiling.test.ts meta/gameInfoNarrowingBaseline.json src/backend/testUtils/gameInfoFixtures.ts</automated>
    `npx prettier --file-info` on each prettier path first (all four were/are expected ignored:false). The moved todo file is under `.planning/`, which prettier ignores — no formatter check for it (a --check there would be vacuous).
  </verify>
  <done>Ratchet counts GameInfoByRunner indexed access, Extract over GameInfo, and object-argument isStore literal calls; scans src/common minus its type/guard homes; baseline re-frozen with an accurate reason per entry (GamePage reason free of `namespace`, testUtils fixture entry present); ratchet, its tests, wiring test, codecheck, planning-gates and scoped prettier green; todo lives in completed/ with a Resolution section.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer -> sidecar IPC | Untrusted payloads for addNewApp, runWineCommand, writeConfig/setSetting cross here and are validated by the zod schemas |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-sbo-01 | Tampering | addNewApp schema | mitigate | Accept only sideloadGameInfoSchema (strict); non-sideload payloads rejected (Task 1 tests) |
| T-sbo-02 | Tampering | settings wineVersion no-wine arm | mitigate | Strict object with bounded nullish lib/lib32/wineserver; unknown keys rejected (Task 1 tests) |
| T-sbo-03 | Denial of Service | runWineCommand partial gameSettings | mitigate | Handler merges over global settings so a missing key cannot reach the Wine runner as undefined |
| T-sbo-04 | Repudiation | narrowing ratchet | mitigate | Bypass forms counted; every allowlist entry carries a reviewed reason |
</threat_model>

<verification>
- `pnpm codecheck` green.
- `node meta/gameInfoNarrowingCeiling.cjs` prints PASS.
- Scoped jest suites from all three tasks green.
- Scoped `npx prettier --check` over every non-.planning path written.
- `pnpm planning-gates` green after the todo move.
</verification>

<success_criteria>
All seven todo items (WR-02, WR-03, WR-06, WR-07, IN-01, IN-02, phase70Passthrough JSDoc) are closed in code with tests, the ratchet passes against a re-frozen reasoned baseline, and the todo is in .planning/todos/completed/.
</success_criteria>

<output>
Create `.planning/quick/261114-sbo-harden-phase-70-gameinfo-narrowing-ratch/261114-sbo-SUMMARY.md` when done.
</output>
