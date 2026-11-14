# Phase 70: Split GameInfo into shared and per-store shapes - Pattern Map

**Mapped:** 2026-11-14
**Files analyzed:** 22 new/modified (grouped; reader migrations are one family)
**Analogs found:** 20 / 22 (no analog: the `Equal`/`Simplify` parity type test, and the AST-count ratchet is only a partial match)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/common/gameInfoNarrowing.ts` | utility (type guards) | transform | `src/common/storeCapabilities.ts` (`isStore`, `hasCapability`) | exact |
| `src/common/__tests__/gameInfoNarrowing.test.ts` | test | transform | `src/common/__tests__/storeCapabilities.test.ts` | exact |
| `src/common/types.ts` (`GameInfoCore`, union, `GameInfoByRunner`) | model | transform | itself (`GameInfo` at line 234) + `common/types/nile.ts` | role-match |
| `src/common/types/{steam,gog,legendary,nile}.ts`, new `sideload.ts` (members, nested types) | model | transform | existing per-store type files | exact |
| `src/common/types/ipc/gameInfoSchema.ts` | schema (zod) | request-response | `src/common/types/ipc/install.ts` (`installFields`, `installPlatform`) + `schemaTypes.ts` helpers | role-match |
| `src/common/types/ipc/install.ts` (replace `gameInfoArg`) | schema | request-response | itself | exact |
| `src/common/types/ipc/gameDetails.ts` (replace `gameInfoArg`) | schema | request-response | itself | exact |
| `src/common/types/ipc/settings.ts` (`configArg`, `setSetting`) | schema | request-response | itself + `install.ts` `z.strictObject` usage | role-match |
| `src/common/types/ipc/steam.ts` (`launchParamsArg`) | schema | request-response | itself | exact |
| `src/common/types/ipc/wineTools.ts` (`gameSettingsArg`) | schema | request-response | itself | exact |
| `src/common/types/ipc/schemaTypes.ts` (delete `phase70Passthrough`) | utility | n/a | itself | exact |
| Parity type test (e.g. `src/backend/sidecar/__tests__/ipcSchemas/gameInfoParity.test.ts`) | test (type-level + key coverage) | transform | `schemaTypes.ts:50-60` drift guard (type-level) + `ipcSchemas/install.test.ts` (fixtures) | partial |
| Extended `ipcSchemas/{install,gameDetails,settings,wineTools}.test.ts` fixtures | test | request-response | `ipcSchemas/install.test.ts` | exact |
| `src/backend/storeMigrations/gameInfoLibraries.ts` (strip chains) | migration | batch/transform | `src/backend/storeMigrations/settingsGlobal.ts` | exact |
| `src/backend/storeMigrations/index.ts` (register chains) | config | n/a | itself | exact |
| `src/backend/storeMigrations/__tests__/gameInfoLibraries.test.ts` + `fixtures/*-gameinfo-v1.json` | test | batch | `__tests__/settingsGlobal.test.ts` + `fixtures/` | exact |
| engine-level migration test (backup, read-only, newer-file) | test | file-I/O | `src/backend/storeVersioning/__tests__/engine.test.ts` | exact |
| `meta/gameInfoNarrowingCeiling.cjs` + `meta/gameInfoNarrowingBaseline.json` | utility (CI gate) | batch | `meta/steamLineCeiling.cjs` (contract), `meta/backendDiCeilings.cjs` (TS AST counting) | role-match |
| `meta/__tests__/gameInfoNarrowingCeiling.test.ts` | test | batch | `meta/__tests__/steamLineCeiling.test.ts` | exact |
| `meta/__tests__/gameInfoNarrowingWiring.test.ts` | test | n/a | `meta/__tests__/steamLineCeilingWiring.test.ts` | exact |
| `package.json`, `.github/workflows/lint.yml`, `.husky/pre-push` (wiring) | config | n/a | the `steam-line-ceiling` entries | exact |
| Store managers / backend / frontend reader migrations | mixed | request-response | `filterEngine` pattern in RESEARCH "Code Examples" + `hasCapability` use | role-match |

## Pattern Assignments

### `src/common/gameInfoNarrowing.ts` (utility, transform)

**Analog:** `src/common/storeCapabilities.ts`

**Header and import rule** (lines 22-26). Only `import type` from `common/types`; the module is renderer-imported, so no zod and nothing under `common/types/ipc` (`meta/__tests__/rendererZodGuard.test.ts`). The one value import allowed is `isStore`:
```typescript
// Only `import type` from `common/types`: common/ never imports backend/ or
// frontend/ (see types/game_manager.ts).
import type { Runner } from 'common/types'
```

**Core pattern to delegate to** (lines 157-174). `isStoreGame` must call this, not compare `runner` itself. It is null/undefined and `{}` safe, which RESEARCH Pitfall 4 requires:
```typescript
export function isStore<T extends { runner: StoreKey }, K extends StoreKey>(
  subject: T,
  store: K
): subject is T & { runner: K }
export function isStore(
  subject: string | null | undefined | { runner?: string | null },
  store: StoreKey
): boolean
export function isStore(subject, store): boolean {
  if (subject === null || subject === undefined) return false
  const key = typeof subject === 'string' ? subject : subject.runner
  return key === store
}
```

**Shape to write** (RESEARCH Pattern 1; no throwing variant per D-03):
```typescript
export interface GameInfoByRunner { steam: SteamGameInfo; gog: GogGameInfo; legendary: LegendaryGameInfo; nile: NileGameInfo; sideload: SideloadGameInfo }
export function isStoreGame<K extends Runner>(g: GameInfoCore | null | undefined, r: K): g is GameInfoByRunner[K]
export function asStoreGame<K extends Runner>(g: GameInfoCore | null | undefined, r: K): GameInfoByRunner[K] | undefined
```
Header comment style: explain why, name the decision (D-03), and note `src/common/**` sits outside the runner-literal ban so the raw comparison needs no disable comment. Keep the module with a first consumer in the same wave (knip, Pitfall 6).

**Test analog:** `src/common/__tests__/storeCapabilities.test.ts` lines 1-40: `const RUNNERS: Runner[] = ['legendary','gog','sideload','nile','steam']`, a `describe` per helper, and an `EXPECTED` table. Reuse the `RUNNERS` loop for every runner against `isStoreGame`/`asStoreGame`, plus null, undefined and `{}` cases. Add the drift guard `Expect<Equal<GameInfoByRunner[Runner], GameInfo>>` after the union flip.

---

### `src/common/types/ipc/gameInfoSchema.ts` (schema, request-response)

**Analog:** `src/common/types/ipc/install.ts` and helpers in `schemaTypes.ts`.

**Imports pattern** (`install.ts` lines 1-14):
```typescript
import { z } from 'zod'

import type { GameInfo, StatusPromise } from '../../types'

import {
  nonEmptyString,
  optionalArg,
  runnerArg,
  wineInstallationArg,
  type InvokeFns
} from './schemaTypes'
```

**Reusable enum** (`install.ts` lines 18-28): export `installPlatform` from here or import it. `install.ts` already exports it, so `gameInfoSchema.ts` should import it and `install.ts` should import the schema, avoiding a cycle (move `installPlatform` into the new module or a shared file).

**Strict-object convention** (`install.ts` 53-68). Every object is `z.strictObject`; bounded strings (`.max(4096)`), `.optional()` for optional keys:
```typescript
install: z.tuple([z.strictObject(installFields)]),
...
moveInstall: z.tuple([
  z.strictObject({
    appName: nonEmptyString(),
    path: z.string().max(4096),
    runner: runnerArg()
  })
]),
```

**The code being replaced** (`install.ts` 30-42; same shape at `gameDetails.ts:24-28`). Remove `phase70Passthrough` and the `as unknown as z.ZodType<GameInfo, GameInfo>` cast:
```typescript
const gameInfoArg = phase70Passthrough({
  app_name: nonEmptyString(),
  runner: runnerArg(),
  install: phase70Passthrough({
    platform: installPlatform.optional(),
    install_path: z.string().max(4096).optional()
  })
}) as unknown as z.ZodType<GameInfo, GameInfo>
```
Replace with a spread-of-shared-shape per member (RESEARCH Pattern 3): `z.strictObject({ ...coreShape, runner: z.literal('steam'), ...steamShape })`, then `z.discriminatedUnion('runner', [...])`. Use `optionalArg()` / `.nullish()` where a sender can produce `undefined` (JSON turns it into `null`, `schemaTypes.ts:19-21`). Non-schema loose boundaries stay named: `wineInstallationArg()` (`schemaTypes.ts` 63-78) is the existing sanctioned loose + cast pattern; the `dlcList` element is the second.

**Runner list drift guard to imitate** (`schemaTypes.ts` 47-60): a type-level both-ways check evaluated to a `const ... = true; void ...` so tsc fails on drift. The parity test generalises this.

**Backend-only rule:** `rendererZodGuard.test.ts` forbids a renderer value-import path to zod; keep this module out of `src/frontend`.

---

### `src/common/types/ipc/{settings,steam,wineTools}.ts` (schema, request-response)

**Analog:** the current files themselves; each has one `phase70Passthrough` call to replace.

- `settings.ts` lines 20-35: `configArg = phase70Passthrough({}) as unknown as z.ZodType<Partial<AppSettings>, Partial<AppSettings>>` becomes `z.strictObject(appSettingsShape).partial()`; `settingKey = nonEmptyString(128)` becomes an enum of the shape's keys. `wineVersion` stays loose via `wineInstallationArg()`. `logFileArgs` (lines 44-49) is the in-file example of `z.strictObject({...}) as unknown as z.ZodType<T,T>` when a union cannot be expressed.
- `steam.ts` lines 26-33: add `launchArguments` to the strict `launchParamsArg` and drop the cast.
- `wineTools.ts` lines 27-31: `gameSettingsArg` reuses the `GameSettings` subset of the settings shape.
- Test change: `ipcSchemas/settings.test.ts:49-54` lists `unknownFutureKey: [1, 2]` as valid; move it to `invalid`.

---

### Parity type test (type-level, plus key-coverage runtime test)

**Analog:** none for `Equal`/`Simplify`; `grep` for `Expect<` / `type Equal<` finds no precedent in `src` or `meta`. The nearest idiom is the drift guard in `schemaTypes.ts:47-60`. Use the RESEARCH Pattern 4 block verbatim (identity equality, not mutual assignability):
```typescript
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false
type Simplify<T> = { [K in keyof T]: T[K] } & {}
type Expect<T extends true> = T
type _steam = Expect<Equal<Simplify<z.output<typeof steamGameInfoSchema>>, Simplify<SteamGameInfo>>>
// @ts-expect-error negative control
type _bad = Expect<Equal<..., Simplify<SteamGameInfo & { extra_key?: string }>>>
```
**Fixture-table companion:** `ipcSchemas/install.test.ts` lines 1-50 shows the project harness: `FixtureTable<typeof installAsyncArgs>`, `runFixtureTable`, `expectFixtureCoverage` from `backend/testUtils/ipcSchemaFixtures`, with `valid: [...]` and `invalid: [...]` arrays, and the complete steam `gameInfo` fixture (lines 7-25) to copy for each runner. Key-coverage runtime test: compare `Object.keys(schema.shape)` against a literal key list in the test.

---

### `src/backend/storeMigrations/gameInfoLibraries.ts` (migration, batch)

**Analog:** `src/backend/storeMigrations/settingsGlobal.ts` (whole file, 38 lines).

**Header and imports**:
```typescript
import type { Migration } from '../storeVersioning/types'

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
```

**Chain shape**: `run` gets the whole file object, returns a new object (never mutates; engine runs on a `structuredClone`), returns `file` unchanged when the target is not the expected shape:
```typescript
export const settingsGlobalChain: readonly Migration[] = [
  {
    id: 'settings-global-v0-v1',
    to: 1,
    run(file) {
      const original = file['defaultSettings']
      if (!isPlainObject(original)) return file
      ...
      const next: Record<string, unknown> = { ...original, ... }
      delete next['darkTrayIcon']
      return { ...file, defaultSettings: next }
    }
  }
]
```
For the strip, ids like `steam-library-v1-v2` with `to: 2`; `run(file)` maps `file[arrayKey]` items through `stripUndeclaredGameInfoKeys`. Must be total (no `throw`; tolerate non-array, non-object items, unknown runner), delete-only, and stop at `dlcList` (RESEARCH Pitfall 5, 10). Derive key sets from the strict schemas' `.shape`, not hand-copied arrays. Pure: no fs, no logger.

**Registration** (`storeMigrations/index.ts` lines 14-27). Add entries to `STORE_MIGRATIONS`, keyed `<dir basename>/<file>`; follow the comment-above-entry style:
```typescript
export const STORE_MIGRATIONS: Readonly<Record<string, readonly Migration[]>> = {
  'settings/global': settingsGlobalChain,
  'settings/game': settingsGameChain,
  ...
}
```
New keys: `store_cache/steam_library`, `store_cache/gog_library`, `gog_store/installed`, `store_cache/legendary_library`, `store_cache/nile_library`, `sideload_apps/library`, `store/download-manager`. `currentVersionOf` is `Math.max(1, ...to)`, so a single `to: 2` entry bumps the version; `pendingChain` prepends `ADOPT_V1` for unstamped files (sideload) automatically. The chain keys already exist as strings in `storeVersioning/readOnlyStores.ts` lines 27-32 (`AREA_BY_KEY`); no change needed there.

**Test analog:** `src/backend/storeMigrations/__tests__/settingsGlobal.test.ts` lines 1-70:
```typescript
const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'))
const step = settingsGlobalChain[0]!
...
const out = step.run(structuredClone(file))
test('a file without a defaultSettings object is returned unchanged', () => {
  const file = { version: 'v0' }
  expect(step.run(file)).toBe(file)
})
```
Fixtures go in `__tests__/fixtures/` as `*-gameinfo-v1.json` (existing: `settings-global-v0.json` etc.). Engine behaviour (backup, read-only on throw, newer-file refusal): `storeVersioning/__tests__/engine.test.ts` uses `createVersioningHarness` (line 15 import) and `setMigrations(KEY, chain())` (lines 26-27, 88).

---

### `meta/gameInfoNarrowingCeiling.cjs` + baseline (CI gate, batch)

**Analog:** `meta/steamLineCeiling.cjs` (contract and CLI) and `meta/backendDiCeilings.cjs` (AST counting).

**File skeleton to copy** (`steamLineCeiling.cjs`): `'use strict'`, header comment stating the contract, then `fs`/`path`, constants, `collectFiles`, pure `evaluate`, `parseArgs`, `main`, and the export block:
```javascript
const SKIP_DIRS = new Set(['__tests__', '__mocks__', 'node_modules'])
const CODE_EXT = new Set(['.ts', '.tsx', '.cjs', '.mjs', '.js'])
...
if (/\.(test|spec)\./.test(name)) continue
...
module.exports = { countLines, collectFiles, evaluate, parseArgs, staleExemptions, GENERATED_EXEMPT }
if (require.main === module) main()
```
**Keep as-is:** exact-match semantics (growth fails; shrink fails until the baseline is lowered in the same commit; stale entry fails), no `--update` flag, `--root/--baseline/--min-files` via `parseArgs` that errors on a missing value rather than falling back (lines ~150-175), a scanned-file floor (`DEFAULT_MIN_FILES`), and `staleExemptions` for the named exempt list (replace `GENERATED_EXEMPT` with the store-specific-UI exempt list, each entry with a reason; a listed path that no longer exists fails).

**Change for this gate:** replace `countLines` with an AST count. `backendDiCeilings.cjs` shows the no-program approach: `const ts = require('typescript')` (line 68) and `ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true)` (line 129), then a recursive `visit` using `ts.isCallExpression` / `ts.forEachChild` (lines 187-200). Count (a) `ts.isCallExpression` whose callee identifier is `isStoreGame` or `asStoreGame`, and (b) identifiers named `SteamGameInfo|GogGameInfo|LegendaryGameInfo|NileGameInfo|SideloadGameInfo`. Because `evaluate` there compares `n` to a line ceiling, rewrite it as a pure `n === baseline[file]` exact check with an allowlist of files and no "ceiling" concept. A file with a count of zero is absent from the baseline.

**Baseline:** starts un-frozen; per RESEARCH, freeze after the reader waves, before the union flip. Current analog baseline is `{}` (`meta/steamLineCeilingBaseline.json`), JSON object of path to number.

**Unit-test analog:** `meta/__tests__/steamLineCeiling.test.ts`: `require` the `.cjs` under `/* eslint-disable @typescript-eslint/no-require-imports */`, `describe` blocks per function (`countLines`, `evaluate`, `parseArgs`, `staleExemptions`), plus a CLI end-to-end `spawnSync` run using `createFakeHomeProfile()` from `src/backend/testUtils/fakeHomeProfile` for the child env (repo rule: never a hand-rolled `env` literal) and `mkdtempSync`/`tmpdir` for a throwaway tree.

**Wiring (three places, one test):**
- `package.json:51`: `"steam-line-ceiling": "node meta/steamLineCeiling.cjs",` add `"gameinfo-narrowing-ceiling": "node meta/gameInfoNarrowingCeiling.cjs"`.
- `.github/workflows/lint.yml:39`: step `run: pnpm steam-line-ceiling`; add a step after it with the new script.
- `.husky/pre-push` line 2 (must stay line 2, line 1 is the shebang): `... && pnpm boundaries && pnpm steam-line-ceiling && pnpm backend-di-ceilings`; append `&& pnpm gameinfo-narrowing-ceiling`. Update the existing `steamLineCeilingWiring` and `backendDiCeilingsWiring` expectations only if their `toContain` string would break (it checks a substring, so appending is safe).
- Wiring test: copy `meta/__tests__/steamLineCeilingWiring.test.ts` whole. Pieces: `lintSteps()` via `load(lintYml)` from `js-yaml`; `stepIndex(steps, 'pnpm <script>')` compared to the `pnpm boundaries` index; a near-miss test with the step filtered out; and `lines[1]` containing the chain.

---

### Reader migrations (store managers, backend, frontend)

**Analog:** RESEARCH "Narrowing at a reader" plus the existing capability use in `filterEngine`:
```typescript
const steamGame = asStoreGame(game, 'steam')
const noStorePage = hasCapability(game.runner, 'canBeDelisted') && !!steamGame?.is_delisted
```
Never use `runner === 'steam'` (ESLint `no-restricted-syntax` from `meta/runnerLiteralSelectors.cjs`, in `src/frontend/**` and `src/backend/**` minus `storeManagers/`), never cast reads. For structural props (`hooks/hasStatus.ts` lines 36-38 already declare a structural interface) pass the narrowed value in. For spreads that add a store key, type the base as the member (`gameMetadata.ts:80`). Store managers return members by covariance (`game_manager.ts:54,99`; `CacheStore<…GameInfo[]>` in `steam|gog|nile|legendary/stores.ts` and `frontend/helpers/stores.ts:124-162`).

## Shared Patterns

### Capability vs narrowing
**Source:** `src/common/storeCapabilities.ts` `hasCapability` (lines 134-147) is the policy check (D-05); `isStoreGame`/`asStoreGame` only supply the type. Apply to every reader that currently reads a store field behind a capability flag.

### Strict schema convention
**Source:** `src/common/types/ipc/install.ts` lines 44-60, `schemaTypes.ts` lines 19-21 and 63-78. `z.strictObject` everywhere, bounded strings, `optionalArg`/`.nullish()` for fields the renderer may send as `undefined`, `as unknown as z.ZodType<T,T>` only where zod cannot express the type (`wineInstallationArg`, `logFileArgs`). Apply to all six former `phase70Passthrough` sites. Note `addNewApp` is a `send`: a rejected send is dropped silently (Phase 67 D-09), so every per-store and per-key fixture must be exercised.

### Migration purity and totality
**Source:** `src/backend/storeMigrations/settingsGlobal.ts` lines 9-38 (pure, returns `file` unchanged on unexpected shape, never throws, deletes by key). Apply to all seven strip chains.

### Ratchet contract
**Source:** `meta/steamLineCeiling.cjs` header (lines 1-22) and `evaluate`. Exact-match baseline, no `--update`, floor on scanned files, stale entry fails. Apply to the new narrowing ceiling.

### Test conventions from CLAUDE.md
Any test or script that spawns a child uses `createFakeHomeProfile()` (`src/backend/testUtils/fakeHomeProfile`). Each task's `<verify>` runs `npx prettier --check` over the exact paths written, after `--file-info` (omit with a note if all paths are prettier-ignored).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Parity test `Equal`/`Simplify` helpers | test (type-level) | transform | No `Expect<`/`Equal<` pattern exists in `src` or `meta`. Use RESEARCH Pattern 4; closest idiom is the drift guard at `schemaTypes.ts:47-60`. Define the helpers locally in the test (or one shared test util, which knip must see used) |
| AST-count scoring in the ceiling tool | utility | batch | `backendDiCeilings.cjs` gives the parse/visit mechanics but counts different things and compares to a ceiling; the exact-count-per-file logic is new, built on the `steamLineCeiling.cjs` `evaluate` contract |

## Metadata

**Analog search scope:** `src/common/`, `src/common/types/ipc/`, `src/backend/storeMigrations/`, `src/backend/storeVersioning/`, `src/backend/sidecar/__tests__/ipcSchemas/`, `meta/`, `meta/__tests__/`, `.husky/pre-push`, `.github/workflows/lint.yml`, `package.json`.
**Files scanned:** about 20 read in full or in part; the rest located by `ls`/`grep`.
**Pattern extraction date:** 2026-11-14
**Not re-derived here:** the field classification table, reader inventory, and migration key list are in `70-RESEARCH.md` and are authoritative.
