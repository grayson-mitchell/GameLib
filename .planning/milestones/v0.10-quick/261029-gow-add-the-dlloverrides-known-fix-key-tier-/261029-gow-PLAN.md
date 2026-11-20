---
phase: quick-261029-gow
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/common/types.ts
  - src/backend/knownFixes.ts
  - src/backend/knownFixesRegistry.ts
  - src/backend/storeManagers/steam/bridgeKnownFixes.ts
  - src/backend/__tests__/knownFixesLayered.test.ts
  - src/backend/__tests__/knownFixesRegistry.test.ts
  - src/backend/__tests__/steamBridgeKnownFixes.test.ts
  - .planning/todos/pending/2026-10-29-known-fix-dlloverrides-key.md (moved to .planning/todos/completed/)
  - .planning/notes/per-game-compat-fixes-architecture.md
autonomous: true
requirements: [TODO-2026-10-29-known-fix-dlloverrides-key]

must_haves:
  truths:
    - "A local or bundled `<app>-<store>.profile.json` carrying `dllOverrides` is kept by readKnownFixProfile (no 'not a tier-2 key' warning)"
    - "`dllOverrides` in a tier-1 `.json` (any layer, including remote) is dropped with the existing 'belongs in .profile.json' warning; TIER1_KNOWN_FIX_KEYS never contains it"
    - "On launch (non-Steam Wine path and Steam bridge path) each valid exe/dll/mode triple becomes a `reg add HKCU\\Software\\Wine\\AppDefaults\\<exe>\\DllOverrides /v <dll> /t REG_SZ /d <data> /reg:64 /f` through applyRegistryFixes"
    - "`disabled` writes empty data (''), the other four modes are written verbatim; invalid exe, dll name or mode is skipped with a warning and never throws"
    - "A profile carrying only `registry` behaves byte-identically to before (same argv, same warnings)"
    - "Overrides already present in user.reg are skipped by the existing wineRegistryValueIsSet check (no reg add)"
  artifacts:
    - path: "src/backend/knownFixesRegistry.ts"
      provides: "dllOverridesToRegistryFixes + knownFixProfileRegistryFixes, used by both launch hooks"
      contains: "AppDefaults"
    - path: "src/backend/knownFixes.ts"
      provides: "'dllOverrides' in TIER2_PROFILE_KEYS, comments updated"
      contains: "'dllOverrides'"
    - path: "src/common/types.ts"
      provides: "KnownFixProfile.dllOverrides + KnownFixDllOverrideMode"
      contains: "dllOverrides?:"
    - path: ".planning/todos/completed/2026-10-29-known-fix-dlloverrides-key.md"
      provides: "Closed todo with a Resolution section"
  key_links:
    - from: "src/backend/knownFixesRegistry.ts applyKnownFixProfileRegistry"
      to: "knownFixProfileRegistryFixes"
      via: "replaces the `profile.registry === undefined` gate"
      pattern: "knownFixProfileRegistryFixes\\("
    - from: "src/backend/storeManagers/steam/bridgeKnownFixes.ts applySteamBridgeKnownFixes"
      to: "knownFixProfileRegistryFixes"
      via: "replaces the `profile?.registry !== undefined` gate"
      pattern: "knownFixProfileRegistryFixes\\("
---

<objective>
Implement `dllOverrides` as a tier-2 known-fix key (the spec is
`.planning/todos/pending/2026-10-29-known-fix-dlloverrides-key.md`). It is a shorthand that
compiles to registry values under `HKCU\Software\Wine\AppDefaults\<exe>\DllOverrides`,
written through the existing `applyRegistryFixes` path in `knownFixesRegistry.ts`. It is
registry-backed because CrossOver's wine wrapper drops `WINEDLLOVERRIDES` (spike 031, decision 3
of `.planning/notes/per-game-compat-fixes-architecture.md`).

Purpose: protonfixes' second most-used helper (winedll_override, 91 of 490 files) gets a GameLib
equivalent that works on CrossOver, for every store (decision 1).
Output: the new key, its validator and converter, both launch hooks wired, tests, the todo closed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/todos/pending/2026-10-29-known-fix-dlloverrides-key.md
@src/backend/knownFixesRegistry.ts
@src/backend/knownFixes.ts
@src/backend/storeManagers/steam/bridge/bottleDllOverrides.ts

Load `Skill("gamelib-conventions")` before writing any `<verify>` evidence (the scoped prettier
rule). `.planning/` is in `.prettierignore`, so planning files get no prettier check; every `src/`
path in this plan is NOT ignored (checked with `npx prettier --file-info`).

## Settled design (do not reopen)

**Value shape** (tier 2 only, in `<app>-<store>.profile.json`):
an array of entries, each `{ "exe": "<Name>.exe", "dlls": { "<dll>": "<mode>", ... } }`.
Example: `"dllOverrides": [{ "exe": "Overlooting.exe", "dlls": { "nvapi64": "disabled" } }]`.
An array (not a map keyed by exe) so one profile can cover a launcher exe and a game exe, and so
the shape matches `registry` / `overlays` (arrays of entries).

**Modes** (`KnownFixDllOverrideMode`): exactly `"native"`, `"builtin"`, `"native,builtin"`,
`"builtin,native"`, `"disabled"`. Registry data is the mode string verbatim, except
`"disabled"` writes `""` (Wine's disabled value, as `bottleDllOverrides.ts` already writes for
nvapi64). Lutris' `n`/`b` shorthands and anything else are rejected, not translated.

**Exe source**: the profile names it, explicitly. There is nothing to resolve at launch: Wine
matches `AppDefaults\<exe>` by the running process's basename, case-insensitively, so a profile
naming an exe the game never runs is inert, not an error. There is deliberately NO fallback to
the bottle-wide `HKCU\Software\Wine\DllOverrides` (same reasoning as D-53-06 in
`bottleDllOverrides.ts`: a bottle-wide override hits other games, e.g. D3DMetal's nvapi64). An
entry with a missing or invalid `exe` is skipped whole, with a warning.

**Validation**:
- `dllOverrides` not an array: warn `<label>: ignoring dllOverrides, not an array`, contribute nothing.
- Entry not a plain object, or `dlls` not a non-empty plain object: skip the entry, warn.
- `exe`: string matching `/^[A-Za-z0-9][A-Za-z0-9 ._()+-]{0,250}\.exe$/i` (a basename; no `\`, `/`, `"`, control chars). Else skip the entry, warn.
- dll name: matches `/^[A-Za-z0-9_+-][A-Za-z0-9_.+-]{0,63}$/` and does NOT end in `.dll` (case-insensitive; Wine's canonical override name has no extension). Else skip that dll only, warn.
- mode: one of the five above. Else skip that dll only, warn.
- Warnings use the existing `ctx.label` / `ctx.logPrefix` and quote the offending value via `JSON.stringify(...).slice(0, 200)` in a try/catch, like `validateRegistryFixes`' `reject`.

**Mapping**: each valid (exe, dll, mode) becomes a raw registry entry
`{ key: 'HKCU\\Software\\Wine\\AppDefaults\\' + exe + '\\DllOverrides', name: dll, type: 'REG_SZ', value: data, views: [64] }`,
then goes through `validateRegistryFixes` like any `registry` entry (defence in depth).
`views: [64]` only: `HKCU\Software` is not WoW64-redirected, so a second `/reg:32` write is the same
value and `wineRegistryValueIsSet` can never confirm the 32 view on a win64 prefix for HKCU (it
returns false), which would mean a cold Wine session on every launch for nothing. With
`[64]` the existing user.reg skip works for these values (`registryFileFor` maps `HKCU\` to
user.reg; empty REG_SZ `""` round-trips to `''`).

**Order**: `registry` entries first, then `dllOverrides`, within one `applyRegistryFixes` call.

**Revert semantics**: none, the same as `registry` (module header: "no applied-fix ledger or
reversal (decision 5, as before): turning a profile off does not remove a value already
written"). Say so in the new docstrings and in the `KnownFixProfile.dllOverrides` doc comment.
Building the decision-5 ledger is not part of this todo.

**Sharing / relay lists**: grep found no other enumeration of tier-2 key names in `src/`, `meta/`
or `public/` besides `TIER2_PROFILE_KEYS` and `TIER1_KNOWN_FIX_KEYS` in `knownFixes.ts`; phase 57
(`.planning/phases/57-opt-in-known-fix-sharing-via-relay/`) is empty (`.gitkeep` only). So
`TIER2_PROFILE_KEYS` is the only list to extend. Re-run the grep in Task 1 to confirm.

**Not in scope**: migrating the hardcoded 3410180 entry in `bridge/bottleDllOverrides.ts` to a
profile (it is a separate, already-measured path; leave it untouched).

<interfaces>
From src/backend/knownFixesRegistry.ts (existing, reuse as-is):
- `interface RegistryFixLogContext { label: string; logPrefix: LogPrefix }` (module-private; export it if the new helpers' signatures need it)
- `export function validateRegistryFixes(raw: unknown, ctx: RegistryFixLogContext): ValidRegistryFix[]` — warns `${ctx.label}: ignoring registry fixes, not an array` for a non-array
- `export async function applyRegistryFixes(raw: unknown, ctx, run, prefixDir?): Promise<void>`
- `export async function applyKnownFixProfileRegistry(appName, runner, gameSettings)` — currently gates on `if (!profile || profile.registry === undefined) return` and passes `profile.registry`
- `function isRecord(v: unknown): v is Record<string, unknown>` (module-private)

From src/backend/storeManagers/steam/bridgeKnownFixes.ts (~line 196):
- `if (profile?.registry !== undefined) { await applyRegistryFixes(profile.registry, { label: \`Steam ${appId}\`, logPrefix: LogPrefix.Steam }, run, bottleDir) }` — imports `applyRegistryFixes` from `backend/knownFixesRegistry` (line ~55)

From src/common/types.ts (~line 1137-1225):
- `KnownFixRegistryEntry { key; name; type: 'REG_DWORD' | 'REG_SZ'; value: number | string; views?: KnownFixRegistryView[] }`
- `export interface KnownFixProfile { title?; evidence?; notes?; registry?; overlays?; steamSharedRedists?; shimFeatures? }`

From src/backend/knownFixes.ts:
- `export const TIER1_KNOWN_FIX_KEYS = [...] as const` (line ~73; docstring at ~57-72 says "`dllOverrides` and `platforms` are not implemented yet")
- `const TIER2_PROFILE_KEYS = ['title','notes','evidence','registry','overlays','steamSharedRedists','shimFeatures'] as const` (line ~94; comment at ~91-92 says "`dllOverrides` and `platforms` join this list when implemented")
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Admit `dllOverrides` as a tier-2 key (type, allow-lists, comments)</name>
  <files>src/common/types.ts, src/backend/knownFixes.ts, src/backend/__tests__/knownFixesLayered.test.ts</files>
  <behavior>
    - readKnownFixProfile returns `dllOverrides` unchanged from a bundled and from a local `.profile.json`, with no "not a tier-2 key" warning.
    - A `.profile.json` only in the remote `fixesPath` is still ignored even when it carries `dllOverrides`.
    - readKnownFixes drops `dllOverrides` from a tier-1 `.json` in each layer (local, bundled, remote) with the warning naming `<app>-<store>.profile.json`.
    - `TIER1_KNOWN_FIX_KEYS` does not contain `'dllOverrides'` (extend the existing "exposes the allow-list without any tier-2 key" test).
  </behavior>
  <action>
    Write the tests first in `knownFixesLayered.test.ts`, following the existing `LAYERS` / `put` helpers and the "drops tier-2 keys from the %s layer" and "readKnownFixProfile (tier 2)" describes; run them and see them fail.

    In `src/common/types.ts`: add `export type KnownFixDllOverrideMode = 'native' | 'builtin' | 'native,builtin' | 'builtin,native' | 'disabled'`, a module-private `interface KnownFixDllOverrideEntry { exe: string; dlls: Record<string, KnownFixDllOverrideMode> }`, and `dllOverrides?: KnownFixDllOverrideEntry[]` on `KnownFixProfile` (after `registry`). Doc comment: tier 2 only (local/bundled), compiles to `HKCU\Software\Wine\AppDefaults\<exe>\DllOverrides` REG_SZ values because CrossOver's wine wrapper drops WINEDLLOVERRIDES (spike 031); `exe` is a basename, no bottle-wide fallback; `disabled` writes ''; applied every launch, for every store; no reversal (turning the profile off leaves written values, as for `registry`).

    In `src/backend/knownFixes.ts`: add `'dllOverrides'` to `TIER2_PROFILE_KEYS` right after `'registry'`. NEVER add it to `TIER1_KNOWN_FIX_KEYS`. Rewrite the two comments: the TIER1 docstring sentence becomes "`dllOverrides` is implemented as a tier-2 key (quick 261029-gow) and must never be added here. `platforms` is not implemented yet; it belongs in TIER2_PROFILE_KEYS when it is, and must never be added here either." The comment above TIER2_PROFILE_KEYS becomes "`overlays` was added by quick 261027-n77, `dllOverrides` by quick 261029-gow. `platforms` joins this list when implemented." Keep the "reserved tier-2 name" remark about `platforms` in the macArch sentence intact.

    Re-run the sharing-list grep to confirm no other key list exists: `grep -rn "steamSharedRedists" src meta public --include='*.ts' --include='*.tsx' --include='*.cjs' --include='*.mjs' --include='*.json'`; if a further list of tier-2 key names turns up, add `dllOverrides` to it and record it in the SUMMARY.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/__tests__/knownFixesLayered.test.ts src/backend/__tests__/knownFixes.test.ts && grep -v '^\s*\*\|^\s*//' src/backend/knownFixes.ts | grep -c "'dllOverrides'" && ! grep -n "dllOverrides\` and \`platforms\`" src/backend/knownFixes.ts && npx prettier --check src/common/types.ts src/backend/knownFixes.ts src/backend/__tests__/knownFixesLayered.test.ts && npx eslint src/common/types.ts src/backend/knownFixes.ts src/backend/__tests__/knownFixesLayered.test.ts</automated>
  </verify>
  <done>New layered tests pass; `'dllOverrides'` appears exactly once in non-comment code of knownFixes.ts (inside TIER2_PROFILE_KEYS); no comment still claims dllOverrides is unbuilt; prettier and eslint clean on the three files.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Compile `dllOverrides` to AppDefaults registry fixes and wire both launch hooks</name>
  <files>src/backend/knownFixesRegistry.ts, src/backend/storeManagers/steam/bridgeKnownFixes.ts, src/backend/__tests__/knownFixesRegistry.test.ts, src/backend/__tests__/steamBridgeKnownFixes.test.ts</files>
  <behavior>
    - dllOverridesToRegistryFixes([{exe:'Game.exe', dlls:{nvapi64:'disabled', d3d9:'native,builtin'}}], CTX) returns two raw entries with key `HKCU\Software\Wine\AppDefaults\Game.exe\DllOverrides`, type REG_SZ, values '' and 'native,builtin', views [64].
    - Each of the five modes maps as specified; `"n"`, `"b"`, `""`, `"native, builtin"` and non-strings are skipped with a warning.
    - Bad exe (`'..\\x.exe'`, `'a/b.exe'`, `'Game'` without .exe, `'x"y.exe'`, missing) skips the whole entry with a warning; bad dll names (`'d3d9.dll'`, `'a\\b'`, `''`, 65 chars) skip only that dll.
    - Non-array `dllOverrides` warns "ignoring dllOverrides, not an array" and yields []; never throws for any input (null, number, nested junk).
    - knownFixProfileRegistryFixes: returns undefined when profile has neither key; returns `profile.registry` itself (same reference) when `dllOverrides` is absent; otherwise `[...registry, ...converted]`, with a non-array `registry` warned once ("ignoring registry fixes, not an array") and treated as [].
    - applyKnownFixProfileRegistry with a bundled `-gog.profile.json` holding only `dllOverrides` runs one runWineCommand with argv `['reg','add','HKCU\\Software\\Wine\\AppDefaults\\Game.exe\\DllOverrides','/v','nvapi64','/t','REG_SZ','/d','','/reg:64','/f']`, protonVerb 'runinprefix'.
    - A profile with both keys runs the registry entries first, then the overrides.
    - Steam bridge: a bundled `<APP_ID>-steam.profile.json` with only `dllOverrides` produces the same argv via applySteamBridgeKnownFixes (protonVerb 'run', skipPrefixCheckIKnowWhatImDoing true); when the bottle's user.reg already holds `[Software\\Wine\\AppDefaults\\Game.exe\\DllOverrides]` with `"nvapi64"=""` under `#arch=win64`, no reg add runs and an "already set" info is logged.
    - Existing registry-only tests stay green unchanged.
  </behavior>
  <action>
    Write the tests first: new describes `dllOverridesToRegistryFixes` and `knownFixProfileRegistryFixes`, plus new cases in the existing `applyKnownFixProfileRegistry` describe (`knownFixesRegistry.test.ts`) and the existing "registry fixes application" describe (`steamBridgeKnownFixes.test.ts`, reusing `writeBundled`, `mockBottleRoot`, `BRIDGE`, `ROOT`, `APP_ID`). Run them and see them fail.

    In `knownFixesRegistry.ts`, per the "Settled design" section of this plan:
    - Export `RegistryFixLogContext` if needed by the signatures below.
    - Add `export const DLL_OVERRIDE_MODES` (readonly tuple of the five modes) and `export function dllOverridesToRegistryFixes(raw: unknown, ctx: RegistryFixLogContext): Record<string, unknown>[]`, which validates and returns raw registry entries (not `ValidRegistryFix`; they still go through `validateRegistryFixes` inside `applyRegistryFixes`). Never throws. Reuse `isRecord`. Use the exact regexes and the `disabled` to '' mapping from the plan, `views: [64]`, key built with the `HKCU\` root (accepted by `REGISTRY_ROOTS` and mapped to user.reg by `registryFileFor`).
    - Add `export function knownFixProfileRegistryFixes(profile: KnownFixProfile, ctx: RegistryFixLogContext): unknown` with the undefined / same-reference / concatenation semantics in the behavior block. The same-reference return when `dllOverrides` is absent is what keeps registry-only profiles byte-identical (including the existing non-array warning, which validateRegistryFixes then emits once, as today).
    - In `applyKnownFixProfileRegistry`, replace the `profile.registry === undefined` gate with: compute `const raw = profile ? knownFixProfileRegistryFixes(profile, ctx) : undefined`, return when undefined, pass `raw` to `applyRegistryFixes`. Build the ctx object once and reuse it.
    - Update the module header docstring: tier-2 `registry` and `dllOverrides` (quick 261029-gow) share this applier; `dllOverrides` compiles to `AppDefaults\<exe>\DllOverrides` REG_SZ values (spike 031: CrossOver's wine drops WINEDLLOVERRIDES), views [64] because HKCU\Software is not redirected; still no ledger or reversal (decision 5).

    In `bridgeKnownFixes.ts`: import `knownFixProfileRegistryFixes` alongside `applyRegistryFixes`; replace `if (profile?.registry !== undefined)` with the same computed-raw gate, keeping the existing ctx (`Steam ${appId}`, `LogPrefix.Steam`), run closure, prefixDir argument and comment (extend the comment by one clause: "registry then dllOverrides"). The early-return path (`!fixes && !profile`) needs no change.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/__tests__/knownFixesRegistry.test.ts src/backend/__tests__/steamBridgeKnownFixes.test.ts src/backend/__tests__/knownFixesLayered.test.ts && npx tsc --noEmit && npx prettier --check src/backend/knownFixesRegistry.ts src/backend/storeManagers/steam/bridgeKnownFixes.ts src/backend/__tests__/knownFixesRegistry.test.ts src/backend/__tests__/steamBridgeKnownFixes.test.ts && npx eslint src/backend/knownFixesRegistry.ts src/backend/storeManagers/steam/bridgeKnownFixes.ts src/backend/__tests__/knownFixesRegistry.test.ts src/backend/__tests__/steamBridgeKnownFixes.test.ts && test "$(grep -v '^\s*\*\|^\s*//' src/backend/knownFixesRegistry.ts src/backend/storeManagers/steam/bridgeKnownFixes.ts | grep -c 'knownFixProfileRegistryFixes(')" -ge 2</automated>
  </verify>
  <done>All three suites green (old registry tests unchanged); tsc clean; both launch hooks call knownFixProfileRegistryFixes; dllOverrides-only profiles produce the exact AppDefaults argv on both paths; already-set overrides are skipped via user.reg.</done>
</task>

<task type="auto">
  <name>Task 3: Close the todo and mark the note's `dllOverrides` as built</name>
  <files>.planning/todos/pending/2026-10-29-known-fix-dlloverrides-key.md (git mv to .planning/todos/completed/), .planning/notes/per-game-compat-fixes-architecture.md</files>
  <action>
    Follow the existing completed-todo convention (e.g. `.planning/todos/completed/2026-10-29-drm-stage-session-can-hit-winebus-gamecontroller-abort-spin.md`): `git mv` the todo from `.planning/todos/pending/` to `.planning/todos/completed/` keeping its frontmatter untouched, and append a `## Resolution (2026-10-29)` section: resolved by quick 261029-gow; value shape `[{ exe, dlls: { <dll>: <mode> } }]`, the five modes with `disabled` writing '', written as `HKCU\Software\Wine\AppDefaults\<exe>\DllOverrides` REG_SZ via `applyRegistryFixes` (views [64]) from both `applyKnownFixProfileRegistry` and `applySteamBridgeKnownFixes`; no bottle-wide fallback; no reversal (decision 5 ledger still unbuilt); the hardcoded 3410180 table in `bridge/bottleDllOverrides.ts` is left as is.

    In `.planning/notes/per-game-compat-fixes-architecture.md` "External formats" section: change the protonfixes table cell `` `dllOverrides` (unbuilt) `` to `` `dllOverrides` (built, quick 261029-gow) ``, and in "Proposed tier-2 (format) additions" item 1 replace "already in decision 3, still unbuilt" with "built by quick 261029-gow (tier 2, registry-backed)". Change nothing else in the note (decisions are not revised).

    Then run `graphify update .` (CLAUDE.md: after modifying code). The todo gate only scans `pending/`, so moving the file out cannot break it; run it anyway.
    Prettier: every path in this task is under `.planning/`, which `.prettierignore` excludes, so no prettier check is carried for this task (a green there would prove nothing).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test ! -e .planning/todos/pending/2026-10-29-known-fix-dlloverrides-key.md && grep -q '^## Resolution (2026-10-29)' .planning/todos/completed/2026-10-29-known-fix-dlloverrides-key.md && ! grep -n 'dllOverrides` (unbuilt)\|still unbuilt' .planning/notes/per-game-compat-fixes-architecture.md && pnpm planning-gates</automated>
  </verify>
  <done>Todo lives in completed/ with a Resolution section; the note no longer calls dllOverrides unbuilt; planning gates green; graph updated.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| profile file -> `reg add` argv | `.profile.json` content (local or bundled layer only; remote never read for tier 2) becomes argv to Wine's reg.exe |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gow-01 | Tampering | dllOverridesToRegistryFixes exe/dll names | mitigate | Strict regexes (basename-only exe ending .exe, no `\` `/` `"` or control chars; dll name charset, no `.dll`); converted entries re-validated by validateRegistryFixes; argv array, never a shell string |
| T-gow-02 | Elevation | remote fixes layer supplying dllOverrides | mitigate | Key only in TIER2_PROFILE_KEYS; tier-1 filter drops it at every layer (test-pinned); readKnownFixProfile never reads the remote dir |
| T-gow-03 | Tampering | bottle-wide override affecting other games | mitigate | No fallback to `HKCU\Software\Wine\DllOverrides`; entries without a valid exe are skipped |
| T-gow-04 | Denial of service | launch blocked by reg add | accept | Inherits applyRegistryFixes' 15 s bound, SIGKILL on timeout, never-reject contract, and user.reg skip |
</threat_model>

<verification>
- `npx jest src/backend/__tests__/knownFixesLayered.test.ts src/backend/__tests__/knownFixes.test.ts src/backend/__tests__/knownFixesRegistry.test.ts src/backend/__tests__/steamBridgeKnownFixes.test.ts` green.
- `npx tsc --noEmit` clean.
- Scoped `npx prettier --check` and `npx eslint` over the seven `src/` paths written.
- `pnpm planning-gates` green.
</verification>

<success_criteria>
- `dllOverrides` is a tier-2-only key, compiled to `AppDefaults\<exe>\DllOverrides` REG_SZ values and applied on every launch for every store through the existing registry applier.
- Registry-only profiles behave exactly as before.
- The todo is in `.planning/todos/completed/` with a Resolution section.
</success_criteria>

<output>
Create `.planning/quick/261029-gow-add-the-dlloverrides-known-fix-key-tier-/261029-gow-SUMMARY.md` when done
</output>
