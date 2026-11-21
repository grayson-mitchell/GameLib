// Phase 85 plan 01: the TS store stack held to a byte-exact golden (FND-06, decision D-05).
//
// This suite imports the REAL `store_backend.ts` (conf 10.2.0), the real versioning engine and the real
// STORE_MIGRATIONS chains, drives them under a fake clock in a throwaway userData directory, and
// compares every file they produce to the committed tree under
// `src-tauri/crates/gamelib-store/tests/fixtures/golden`. The Rust store replays the same cases
// (plans 85-06..85-08), so a byte regression there is visible as a diff against what TS wrote.
//
// Two modes:
//   - compare (default): regenerate every case in memory and assert the committed expected files,
//     `outcomes.json` and the produced file set match exactly.
//   - write (`GAMELIB_WRITE_STORE_GOLDEN=1`): rewrite `expected/`, `inputs/` and `outcomes.json` from
//     the TS code under test. `cases.json` is the one hand-authored input and is never rewritten;
//     no expected byte of an oracle case is ever typed by hand.
//
// The oracle owns the golden until plan 85-21 deletes it. The fixtures stay after that.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join, relative, resolve, sep } from 'path'

import GameLibStore from '../../store_backend'
import { createStoreRoot } from '../storeRoot'
import { storeVersionCodec } from '../../storeMigrations'
import {
  ensureSettingsMigrated,
  writeSettingsFile
} from '../../storeVersioning/settingsFiles'

import type { Migration, StoreDeclaration } from '../../storeVersioning/types'
import type { StoreRoot } from '../storeRoot'

/** One store declaration as a case writes it. The store file is `<userData>/<dir>/<name>.json`. */
export type GoldenDeclaration = {
  dir: string
  name: string
  kind: 'cache' | 'user-state'
  tokenBearing?: true
  failedView?: 'as-is' | 'empty'
  clearInvalidConfig?: boolean
  accessPropertiesByDotNotation?: boolean
}

/** Which store an op addresses: `main` is `declaration`, `second` is `second` (the same or another file). */
type StoreAlias = 'main' | 'second'

export type GoldenOp =
  | { op: 'set'; key: string; value: unknown; store?: StoreAlias }
  | { op: 'delete'; key: string; store?: StoreAlias }
  | { op: 'clear'; store?: StoreAlias }
  /** `x.store = obj`: the whole-object replace `CacheStore.commit()` performs. */
  | { op: 'assign'; value: Record<string, unknown>; store?: StoreAlias }
  | { op: 'get'; key: string; store?: StoreAlias }
  | { op: 'has'; key: string; store?: StoreAlias }
  /** Reads `x.store`: what the read-only view layer shows. */
  | { op: 'dump'; store?: StoreAlias }

/**
 * `{ id, kind, ... }` as committed in cases.json.
 *
 * - `ops`: construct the declared store(s) over optional `initial` file text, then run `ops` in order.
 * - `migrate`: copy the bytes in `inputs/<id>.json` to `file`, then bring the store (or settings
 *   document) up through the real chain `chain`. `flavour` is `conf` (a GameLibStore built on `file`
 *   with `declaration.kind`) or `settings` (`ensureSettingsMigrated`).
 * - `settingsDoc`: `writeSettingsFile` of `data` for the global document (`config.json`) or a game
 *   document (`GamesConfig/<appName>.json`), optionally after `ensureSettingsMigrated` over `initial`.
 * - `engine`: an `ops` case that also states which path the versioning engine takes on `initial`
 *   (`expectPath`); the oracle fails when the TS engine takes another one, so the label is checked,
 *   never trusted.
 *
 * `steps` replaces the real chain of the store's chain key for this case (the root's migration
 * override seam); without it the real STORE_MIGRATIONS apply. `rounds` repeats a `migrate` case:
 * each round builds a fresh root (a new boot) over the store file the previous round left.
 */
export type GoldenCase = {
  id: string
  kind: 'ops' | 'migrate' | 'settingsDoc' | 'engine'
  /** `tsOnly` marks an outcome Rust deliberately does not reproduce; `divergenceNote` says why. */
  oracle?: 'tsOnly'
  divergenceNote?: string
  declaration?: GoldenDeclaration
  second?: GoldenDeclaration
  initial?: string
  ops?: GoldenOp[]
  expectPath?: EnginePath
  steps?: StepSpec[]
  rounds?: Round[]
  /** The chain key of a `migrate` case, as the engine derives it (`<dir>/<name>`, or `settings/...`). */
  chain?: string
  flavour?: 'conf' | 'settings'
  file?: string
  /** A committed migration fixture whose bytes become `inputs/<id>.json` (write mode). */
  source?: string
  doc?: 'global' | 'game'
  appName?: string
  data?: Record<string, unknown>
  ensure?: boolean
}

/** What the engine does with the file on `initial` at construction. */
type EnginePath =
  | 'identity'
  | 'current'
  | 'newer'
  | 'migrates'
  | 'failed'
  | 'cacheChainDeletes'
  | 'corrupt'

/**
 * One data-described migration step, so a case stays plain JSON. It sets and deletes top-level keys;
 * `throws` makes the step fail (the failed-migration path).
 */
type StepSpec = {
  id: string
  to: number
  identity?: true
  setTop?: Record<string, unknown>
  deleteTop?: string[]
  throws?: true
}

type Round = {
  /** The fake clock for this round (ISO instant); default is the oracle's base time. */
  at?: string
  /** Replace the store file by the bytes of its newest backup before this round. */
  reseed?: 'newestBackup'
  steps?: StepSpec[]
}

type Read = {
  i: number
  op: 'get' | 'has' | 'dump'
  key?: string
  found?: boolean
  has?: boolean
  value?: unknown
}

/** What the Rust replay must reproduce besides the files themselves. */
export type GoldenOutcome = {
  id: string
  constructThrew: string | null
  reads: Read[]
  threw: { i: number; name: string }[]
  readOnly: { reason: string } | null
  backups: string[]
  files: string[]
  /** Per round of a `rounds` case: the backups present after it. */
  rounds?: { backups: string[] }[]
}

const FIXTURE_ROOT = resolve(
  __dirname,
  '../../../../src-tauri/crates/gamelib-store/tests/fixtures/golden'
)
const EXPECTED_ROOT = join(FIXTURE_ROOT, 'expected')
const INPUTS_ROOT = join(FIXTURE_ROOT, 'inputs')
const CASES_FILE = join(FIXTURE_ROOT, 'cases.json')
const OUTCOMES_FILE = join(FIXTURE_ROOT, 'outcomes.json')
/** The committed sources the `migrate` inputs are copied from, in write mode only. */
const SOURCE_FIXTURES = resolve(
  __dirname,
  '../../storeMigrations/__tests__/fixtures'
)

const WRITE_MODE = process.env['GAMELIB_WRITE_STORE_GOLDEN'] === '1'
const USERDATA_TOKEN = '${USERDATA}'

/** Backup names embed this instant: 2026-11-21 09:00:00 UTC. */
const BASE_TIME = new Date(Date.UTC(2026, 10, 21, 9, 0, 0))

/** Fake only `Date`: conf and graceful-fs stay on real timers. */
const ALL_BUT_DATE = [
  'hrtime',
  'nextTick',
  'performance',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout'
] as const

type Produced = { files: Map<string, Buffer>; outcome: GoldenOutcome }

function readCases(): GoldenCase[] {
  return JSON.parse(readFileSync(CASES_FILE, 'utf-8')) as GoldenCase[]
}

function seed(userData: string, rel: string, content: string | Buffer): void {
  const full = join(userData, rel)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}

/** Every file under `root`, keyed by forward-slash relative path, in path order. */
function snapshot(root: string): Map<string, Buffer> {
  const found: [string, Buffer][] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else {
        found.push([
          relative(root, full).split(sep).join('/'),
          readFileSync(full)
        ])
      }
    }
  }
  if (existsSync(root)) walk(root)
  found.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return new Map(found)
}

function declarationOf(d: GoldenDeclaration): StoreDeclaration {
  return {
    kind: d.kind,
    ...(d.tokenBearing ? { tokenBearing: true as const } : {}),
    ...(d.failedView ? { failedView: d.failedView } : {})
  }
}

function openStore(root: StoreRoot, d: GoldenDeclaration): GameLibStore {
  return new GameLibStore({
    root,
    cwd: d.dir,
    name: d.name,
    // Only pass what the case sets: conf spreads its options over its defaults, so an explicit
    // `undefined` would switch dot-notation access off.
    ...(d.clearInvalidConfig !== undefined
      ? { clearInvalidConfig: d.clearInvalidConfig }
      : {}),
    ...(d.accessPropertiesByDotNotation !== undefined
      ? { accessPropertiesByDotNotation: d.accessPropertiesByDotNotation }
      : {}),
    declaration: declarationOf(d)
  })
}

function storeFileOf(userData: string, d: GoldenDeclaration): string {
  return join(userData, d.dir, `${d.name}.json`)
}

function runOps(
  stores: Partial<Record<StoreAlias, GameLibStore>>,
  ops: GoldenOp[],
  outcome: Pick<GoldenOutcome, 'reads' | 'threw'>
): void {
  ops.forEach((op, i) => {
    const store = stores[op.store ?? 'main']
    if (!store) throw new Error(`op ${i} addresses an undeclared store`)
    try {
      switch (op.op) {
        case 'set':
          store.set(op.key, op.value)
          break
        case 'delete':
          store.delete(op.key)
          break
        case 'clear':
          store.clear()
          break
        case 'assign':
          store.store = op.value
          break
        case 'get': {
          const value: unknown = store.get(op.key)
          outcome.reads.push(
            value === undefined
              ? { i, op: 'get', key: op.key, found: false }
              : { i, op: 'get', key: op.key, found: true, value }
          )
          break
        }
        case 'has':
          outcome.reads.push({
            i,
            op: 'has',
            key: op.key,
            has: store.has(op.key)
          })
          break
        case 'dump':
          outcome.reads.push({ i, op: 'dump', value: store.store })
          break
      }
    } catch (err) {
      outcome.threw.push({
        i,
        name: err instanceof Error ? err.name : typeof err
      })
    }
  })
}

function outcomeOf(
  c: GoldenCase,
  root: StoreRoot,
  mainFile: string,
  files: Map<string, Buffer>,
  partial: Pick<GoldenOutcome, 'constructThrew' | 'reads' | 'threw'>
): GoldenOutcome {
  const reason = root.versioning.isReadOnlyPath(mainFile)
    ? root.versioning.readOnlyReasonOf(mainFile)
    : undefined
  const names = [...files.keys()]
  return {
    id: c.id,
    ...partial,
    readOnly: reason ? { reason } : null,
    backups: backupsOf(files),
    files: names
  }
}

function toMigration(step: StepSpec): Migration {
  return {
    id: step.id,
    to: step.to,
    ...(step.identity ? { identity: true as const } : {}),
    run: (data) => {
      if (step.throws) throw new Error(`oracle step ${step.id} fails`)
      const out: Record<string, unknown> = { ...data }
      for (const [key, value] of Object.entries(step.setTop ?? {})) {
        out[key] = structuredClone(value)
      }
      for (const key of step.deleteTop ?? []) delete out[key]
      return out
    }
  }
}

function overridesFor(
  chainKey: string,
  steps: StepSpec[] | undefined
): ReadonlyMap<string, readonly Migration[]> | undefined {
  return steps ? new Map([[chainKey, steps.map(toMigration)]]) : undefined
}

function sameFiles(a: Map<string, Buffer>, b: Map<string, Buffer>): boolean {
  if (a.size !== b.size) return false
  for (const [name, bytes] of a) {
    const other = b.get(name)
    if (!other || !bytes.equals(other)) return false
  }
  return true
}

/** Fails when the TS engine does not take the path an `engine` case says it takes. */
function assertEnginePath(
  c: GoldenCase,
  root: StoreRoot,
  mainFile: string,
  rel: string,
  chainKey: string,
  before: Map<string, Buffer>,
  after: Map<string, Buffer>
): void {
  const fail = (why: string): never => {
    throw new Error(`${c.id}: expectPath ${c.expectPath} but ${why}`)
  }
  const reason = root.versioning.readOnlyReasonOf(mainFile)
  const backups = [...after.keys()].filter((n) => n.endsWith('.bak.json'))
  switch (c.expectPath) {
    case 'identity':
    case 'current': {
      if (!sameFiles(before, after)) fail('the engine changed the files')
      const original = before.get(rel)
      const version = original
        ? storeVersionCodec.read(JSON.parse(original.toString('utf8')))
        : -1
      const current = root.versioning.currentVersionOf(chainKey)
      if (c.expectPath === 'current' && version !== current) {
        fail(`the file is v${version}, current is v${current}`)
      }
      if (c.expectPath === 'identity' && version >= current) {
        fail(`the file is v${version}, which is not behind v${current}`)
      }
      if (reason) fail(`the store is read-only (${reason})`)
      break
    }
    case 'newer':
      if (reason !== 'newer') fail(`the read-only reason is ${reason}`)
      if (!sameFiles(before, after)) fail('the engine changed the files')
      break
    case 'migrates':
      if (reason) fail(`the store is read-only (${reason})`)
      if (backups.length === 0) fail('no backup was written')
      if (!after.has(rel)) fail('the store file is gone')
      break
    case 'failed':
      if (reason !== 'failed') fail(`the read-only reason is ${reason}`)
      if (backups.length === 0) fail('no backup was written before the failure')
      break
    case 'cacheChainDeletes':
      if (!before.has(rel) || after.has(rel))
        fail('the cache file was not deleted')
      break
    case 'corrupt':
      if (c.oracle !== 'tsOnly') fail('a corrupt case must be marked tsOnly')
      break
    default:
      fail('an engine case needs an expectPath')
  }
}

function runStoreCase(c: GoldenCase, userData: string): Produced {
  const decl = c.declaration
  if (!decl) throw new Error(`${c.id}: an ops case needs a declaration`)
  const mainFile = storeFileOf(userData, decl)
  const rel = relative(userData, mainFile).split(sep).join('/')
  const chainKey = `${decl.dir}/${decl.name}`
  if (c.initial !== undefined) seed(userData, rel, c.initial)
  const before = snapshot(userData)

  const root = createStoreRoot({
    userData,
    migrationOverrides: overridesFor(chainKey, c.steps)
  })
  const stores: Partial<Record<StoreAlias, GameLibStore>> = {}
  const partial: Pick<GoldenOutcome, 'constructThrew' | 'reads' | 'threw'> = {
    constructThrew: null,
    reads: [],
    threw: []
  }
  try {
    stores.main = openStore(root, decl)
    if (c.second) stores.second = openStore(root, c.second)
  } catch (err) {
    partial.constructThrew = err instanceof Error ? err.name : typeof err
  }
  if (c.kind === 'engine') {
    assertEnginePath(
      c,
      root,
      mainFile,
      rel,
      chainKey,
      before,
      snapshot(userData)
    )
  }
  if (partial.constructThrew === null) runOps(stores, c.ops ?? [], partial)
  const files = snapshot(userData)
  return { files, outcome: outcomeOf(c, root, mainFile, files, partial) }
}

function backupsOf(files: Map<string, Buffer>): string[] {
  return [...files.keys()].filter((n) => n.endsWith('.bak.json'))
}

function runMigrateCase(c: GoldenCase, userData: string): Produced {
  if (!c.file || !c.chain || !c.flavour) {
    throw new Error(`${c.id}: a migrate case needs file, chain and flavour`)
  }
  seed(userData, c.file, readFileSync(join(INPUTS_ROOT, `${c.id}.json`)))
  const mainFile = join(userData, c.file)
  const partial: Pick<GoldenOutcome, 'constructThrew' | 'reads' | 'threw'> = {
    constructThrew: null,
    reads: [],
    threw: []
  }
  const rounds: Round[] = c.rounds ?? [{}]
  let root: StoreRoot | undefined
  const perRound: { backups: string[] }[] = []
  for (const round of rounds) {
    jest.setSystemTime(round.at ? new Date(round.at) : BASE_TIME)
    if (round.reseed === 'newestBackup') {
      const newest = backupsOf(snapshot(userData)).sort().at(-1)
      if (!newest) throw new Error(`${c.id}: no backup to reseed from`)
      seed(userData, c.file, readFileSync(join(userData, newest)))
    }
    root = createStoreRoot({
      userData,
      migrationOverrides: overridesFor(c.chain, round.steps ?? c.steps)
    })
    if (c.flavour === 'settings') {
      if (c.chain !== 'settings/global' && c.chain !== 'settings/game') {
        throw new Error(`${c.id}: ${c.chain} is not a settings chain`)
      }
      ensureSettingsMigrated(root.versioning, mainFile, c.chain)
    } else {
      const decl = c.declaration
      if (!decl)
        throw new Error(`${c.id}: a conf migrate case needs a declaration`)
      openStore(root, decl)
    }
    perRound.push({ backups: backupsOf(snapshot(userData)) })
  }
  const files = snapshot(userData)
  const outcome = outcomeOf(c, root as StoreRoot, mainFile, files, partial)
  return {
    files,
    outcome: c.rounds ? { ...outcome, rounds: perRound } : outcome
  }
}

function runSettingsDocCase(c: GoldenCase, userData: string): Produced {
  if (!c.doc || !c.data)
    throw new Error(`${c.id}: a settingsDoc case needs doc and data`)
  const rel =
    c.doc === 'global' ? 'config.json' : `GamesConfig/${c.appName}.json`
  const mainFile = join(userData, rel)
  if (c.initial !== undefined) seed(userData, rel, c.initial)
  const root = createStoreRoot({ userData })
  if (c.ensure) {
    ensureSettingsMigrated(
      root.versioning,
      mainFile,
      c.doc === 'global' ? 'settings/global' : 'settings/game'
    )
  }
  writeSettingsFile(root.versioning, mainFile, c.data)
  const files = snapshot(userData)
  return {
    files,
    outcome: outcomeOf(c, root, mainFile, files, {
      constructThrew: null,
      reads: [],
      threw: []
    })
  }
}

/** Replaces the temp root, in any spelling, by the `${USERDATA}` token. */
function scrub<T>(value: T, roots: string[]): T {
  const text = JSON.stringify(value)
  let out = text
  for (const root of roots)
    out = out.split(JSON.stringify(root).slice(1, -1)).join(USERDATA_TOKEN)
  return JSON.parse(out) as T
}

function runCase(c: GoldenCase): Produced {
  const userData = mkdtempSync(join(tmpdir(), 'gamelib-store-oracle-'))
  jest.setSystemTime(BASE_TIME)
  try {
    const produced =
      c.kind === 'migrate'
        ? runMigrateCase(c, userData)
        : c.kind === 'settingsDoc'
          ? runSettingsDocCase(c, userData)
          : runStoreCase(c, userData)
    const roots = [...new Set([userData, realpathSync(userData)])]
    return {
      files: produced.files,
      outcome: scrub(
        JSON.parse(JSON.stringify(produced.outcome)) as GoldenOutcome,
        roots
      )
    }
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
}

/** Write mode: each migrate case's input bytes (its source fixture, else `initial`) into inputs/<id>.json. */
function writeInputs(cases: GoldenCase[]): void {
  rmSync(INPUTS_ROOT, { recursive: true, force: true })
  for (const c of cases) {
    if (c.kind !== 'migrate') continue
    const bytes = c.source
      ? readFileSync(join(SOURCE_FIXTURES, c.source))
      : c.initial !== undefined
        ? Buffer.from(c.initial, 'utf8')
        : undefined
    if (!bytes) {
      throw new Error(
        `${c.id}: a migrate case needs a source fixture or initial`
      )
    }
    mkdirSync(INPUTS_ROOT, { recursive: true })
    writeFileSync(join(INPUTS_ROOT, `${c.id}.json`), bytes)
  }
}

describe('store oracle (TS store stack -> committed golden)', () => {
  const cases = readCases()

  beforeEach(() => {
    jest.useFakeTimers({ now: BASE_TIME, doNotFake: [...ALL_BUT_DATE] })
    // The engine logs `[storeVersion] ...` lines; they are not part of the golden.
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })
  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  if (WRITE_MODE) {
    test('writes the golden from the TS stack', () => {
      writeInputs(cases)
      rmSync(EXPECTED_ROOT, { recursive: true, force: true })
      const outcomes: GoldenOutcome[] = []
      for (const c of cases) {
        const { files, outcome } = runCase(c)
        for (const [rel, bytes] of files) {
          const target = join(EXPECTED_ROOT, c.id, rel)
          mkdirSync(dirname(target), { recursive: true })
          writeFileSync(target, bytes)
        }
        outcomes.push(outcome)
      }
      writeFileSync(OUTCOMES_FILE, `${JSON.stringify(outcomes, null, 2)}\n`)
    })
  } else {
    const outcomes = JSON.parse(
      readFileSync(OUTCOMES_FILE, 'utf-8')
    ) as GoldenOutcome[]

    test('cases.json, outcomes.json and expected/ list the same case ids', () => {
      const ids = cases.map((c) => c.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(outcomes.map((o) => o.id)).toEqual(ids)
      const onDisk = existsSync(EXPECTED_ROOT)
        ? readdirSync(EXPECTED_ROOT).sort()
        : []
      expect(onDisk).toEqual(
        ids
          .filter((id) => outcomes.find((o) => o.id === id)?.files.length)
          .sort()
      )
    })

    test.each(cases.map((c) => [c.id, c] as const))('%s', (id, c) => {
      const { files, outcome } = runCase(c)
      expect(outcome).toEqual(outcomes.find((o) => o.id === id))
      const expectedFiles = snapshot(join(EXPECTED_ROOT, id))
      expect([...files.keys()]).toEqual([...expectedFiles.keys()])
      for (const [rel, bytes] of files) {
        const expected = expectedFiles.get(rel)
        expect(expected).toBeDefined()
        expect(bytes.toString('utf8')).toBe(expected?.toString('utf8'))
        expect(bytes.equals(expected as Buffer)).toBe(true)
      }
    })

    test('no recorded path or expected file carries the temp root', () => {
      const roots = [...new Set([tmpdir(), realpathSync(tmpdir())])]
      const texts = [readFileSync(OUTCOMES_FILE, 'utf-8')]
      for (const bytes of snapshot(EXPECTED_ROOT).values()) {
        texts.push(bytes.toString('utf8'))
      }
      for (const text of texts) {
        for (const root of roots) expect(text).not.toContain(root)
      }
    })
  }
})

// ---- shared vectors ---------------------------------------------------------------------------------
//
// Dot-path behaviour, JS number text and JS key order, as small self-contained vectors the Rust store
// tests read directly. The SPECS below are the inputs; every `result`, `after` and `stringified` is
// produced by running them through conf (dot paths, via a real GameLibStore: dot-prop is not a direct
// dependency) or `JSON.stringify`, never typed. Write mode rewrites the three files; compare mode
// recomputes them and requires the committed files to match, specs included.

const VECTORS_ROOT = resolve(FIXTURE_ROOT, '..', 'vectors')

type DotpathSpec = {
  name: string
  initial: Record<string, unknown>
  op: 'get' | 'has' | 'set' | 'delete'
  path: string
  value?: unknown
  /** `set(path, undefined)`: JSON cannot carry undefined. */
  valueUndefined?: true
  dotNotation: boolean
}

type DotpathResult =
  | { found: boolean; value?: unknown }
  | { has: boolean }
  | { done: true }
  | { threw: string }

type DotpathVector = DotpathSpec & {
  result: DotpathResult
  /** The store file after the op, parsed (a `get`/`has` leaves `initial`). */
  after: unknown
}

const DOTPATH_SPECS: DotpathSpec[] = [
  {
    name: 'get-nested',
    initial: { a: { b: { c: 1 } } },
    op: 'get',
    path: 'a.b.c',
    dotNotation: true
  },
  {
    name: 'get-missing-leaf',
    initial: { a: { b: 1 } },
    op: 'get',
    path: 'a.c',
    dotNotation: true
  },
  {
    name: 'get-through-primitive',
    initial: { a: 1 },
    op: 'get',
    path: 'a.b',
    dotNotation: true
  },
  {
    name: 'get-top-level-object',
    initial: { a: { b: 1 } },
    op: 'get',
    path: 'a',
    dotNotation: true
  },
  {
    name: 'get-escaped-dot-picks-literal-key',
    initial: { 'a.b': 1, a: { b: 2 } },
    op: 'get',
    path: 'a\\.b',
    dotNotation: true
  },
  {
    name: 'set-escaped-dot-writes-literal-key',
    initial: {},
    op: 'set',
    path: 'a\\.b',
    value: 5,
    dotNotation: true
  },
  {
    name: 'set-creates-nested-objects',
    initial: {},
    op: 'set',
    path: 'a.b.c',
    value: 1,
    dotNotation: true
  },
  {
    name: 'set-proto-segment-refused',
    initial: { keep: 1 },
    op: 'set',
    path: '__proto__.x',
    value: 1,
    dotNotation: true
  },
  {
    name: 'set-proto-middle-segment-refused',
    initial: { a: {} },
    op: 'set',
    path: 'a.__proto__.x',
    value: 1,
    dotNotation: true
  },
  {
    name: 'set-prototype-segment-refused',
    initial: {},
    op: 'set',
    path: 'prototype.x',
    value: 1,
    dotNotation: true
  },
  {
    name: 'set-constructor-segment-refused',
    initial: {},
    op: 'set',
    path: 'constructor.prototype.x',
    value: 1,
    dotNotation: true
  },
  {
    name: 'get-proto-segment',
    initial: { a: 1 },
    op: 'get',
    path: '__proto__',
    dotNotation: true
  },
  {
    name: 'has-proto-segment',
    initial: { a: 1 },
    op: 'has',
    path: '__proto__.x',
    dotNotation: true
  },
  {
    name: 'array-index-get',
    initial: { list: [{ name: 'a' }, { name: 'b' }] },
    op: 'get',
    path: 'list.1.name',
    dotNotation: true
  },
  {
    name: 'array-index-set',
    initial: { list: [{ name: 'a' }, { name: 'b' }] },
    op: 'set',
    path: 'list.1.name',
    value: 'z',
    dotNotation: true
  },
  {
    name: 'array-index-set-beyond-length-leaves-holes',
    initial: { list: [{ name: 'a' }] },
    op: 'set',
    path: 'list.3.name',
    value: 'q',
    dotNotation: true
  },
  {
    name: 'array-element-delete-leaves-hole',
    initial: { list: [1, 2, 3] },
    op: 'delete',
    path: 'list.1',
    dotNotation: true
  },
  {
    name: 'set-through-string-leaf-overwrites-it',
    initial: { a: 'text' },
    op: 'set',
    path: 'a.b',
    value: 1,
    dotNotation: true
  },
  {
    name: 'set-through-number-leaf-overwrites-it',
    initial: { a: 7 },
    op: 'set',
    path: 'a.b.c',
    value: 1,
    dotNotation: true
  },
  {
    name: 'set-through-null-overwrites-it',
    initial: { a: null },
    op: 'set',
    path: 'a.b',
    value: 1,
    dotNotation: true
  },
  {
    name: 'delete-leaves-empty-parent',
    initial: { a: { b: 1 } },
    op: 'delete',
    path: 'a.b',
    dotNotation: true
  },
  {
    name: 'delete-missing-path',
    initial: { a: 1 },
    op: 'delete',
    path: 'x.y.z',
    dotNotation: true
  },
  {
    name: 'empty-segment-set',
    initial: {},
    op: 'set',
    path: 'a..b',
    value: 1,
    dotNotation: true
  },
  {
    name: 'trailing-dot-set',
    initial: {},
    op: 'set',
    path: 'a.',
    value: 1,
    dotNotation: true
  },
  {
    name: 'leading-dot-set',
    initial: {},
    op: 'set',
    path: '.a',
    value: 1,
    dotNotation: true
  },
  {
    name: 'empty-path-set',
    initial: {},
    op: 'set',
    path: '',
    value: 1,
    dotNotation: true
  },
  {
    name: 'set-undefined-is-refused',
    initial: { a: 1 },
    op: 'set',
    path: 'a',
    valueUndefined: true,
    dotNotation: true
  },
  {
    name: 'reserved-internal-dotted-refused',
    initial: { a: 1 },
    op: 'set',
    path: '__internal__.x',
    value: 1,
    dotNotation: true
  },
  {
    name: 'nodot-get-literal-dotted-key',
    initial: { 'a.b': 1, a: { b: 2 } },
    op: 'get',
    path: 'a.b',
    dotNotation: false
  },
  {
    name: 'nodot-set-literal-dotted-key',
    initial: { a: { b: 1 } },
    op: 'set',
    path: 'a.b',
    value: 2,
    dotNotation: false
  },
  {
    name: 'nodot-has-literal-dotted-key',
    initial: { 'a.b': 1 },
    op: 'has',
    path: 'a.b',
    dotNotation: false
  },
  {
    name: 'nodot-has-prefix-is-false',
    initial: { 'a.b': 1 },
    op: 'has',
    path: 'a',
    dotNotation: false
  },
  {
    name: 'nodot-delete-literal-dotted-key',
    initial: { 'a.b': 1, keep: 2 },
    op: 'delete',
    path: 'a.b',
    dotNotation: false
  },
  {
    name: 'nodot-reserved-internal-literal-allowed',
    initial: {},
    op: 'set',
    path: '__internal__.x',
    value: 1,
    dotNotation: false
  },
  {
    name: 'nodot-proto-key-is-an-ordinary-key',
    initial: { a: 1 },
    op: 'set',
    path: '__proto__',
    value: { x: 1 },
    dotNotation: false
  }
]

type NumberSpec = { name: string; jsonText: string; rustParse?: 'reject' }
type NumberVector = NumberSpec & { stringified: string }

const NUMBER_SPECS: NumberSpec[] = [
  { name: '1e20', jsonText: '1e20' },
  { name: '1e21-switches-to-exponent', jsonText: '1e21' },
  { name: '1e-6', jsonText: '1e-6' },
  { name: '1e-7-switches-to-exponent', jsonText: '1e-7' },
  { name: 'negative-zero', jsonText: '-0' },
  { name: 'point-one', jsonText: '0.1' },
  { name: 'min-subnormal', jsonText: '5e-324' },
  { name: 'max-double', jsonText: '1.7976931348623157e308' },
  { name: '2-pow-53-plus-1', jsonText: '9007199254740993' },
  { name: 'u64-max', jsonText: '18446744073709551615' },
  { name: 'beyond-u64', jsonText: '18446744073709551616' },
  { name: 'beyond-i64-negative', jsonText: '-9223372036854775809' },
  { name: 'thirty-digit-integer', jsonText: '1000000000000000000000000000000' },
  { name: 'float-text-hundred', jsonText: '100.0' },
  { name: 'trailing-zero-float', jsonText: '1.50' },
  { name: 'exponent-with-plus-and-zeros', jsonText: '1.0E+2' },
  {
    name: 'object-holding-several',
    jsonText:
      '{"a":1e20,"b":1e21,"c":0.1,"d":[100.0,1.50,-0,5e-324],"e":{"x":9007199254740993}}'
  },
  {
    name: 'lone-surrogate',
    jsonText: '"\\ud83d"',
    // JS accepts a lone surrogate escape; serde_json rejects it, so Rust keeps such a file read-only.
    rustParse: 'reject'
  }
]

type KeyOrderStep =
  | { op: 'set'; path: string; value?: unknown; valueText?: string }
  | { op: 'delete'; path: string }
  | { op: 'assign'; valueText: string }

/** `object` runs the steps on a plain JS object; `store` on a real GameLibStore (dot-path writes). */
type KeyOrderSpec = {
  name: string
  via: 'object' | 'store'
  steps: KeyOrderStep[]
}
type KeyOrderVector = KeyOrderSpec & { stringified: string }

const setStep = (path: string, value: unknown = 1): KeyOrderStep => ({
  op: 'set',
  path,
  value
})

const KEY_ORDER_SPECS: KeyOrderSpec[] = [
  {
    name: 'top-level-integer-keys-sort-ahead-of-strings',
    via: 'object',
    steps: [setStep('b'), setStep('2'), setStep('a'), setStep('1')]
  },
  {
    name: 'depth-three-integer-keys',
    via: 'store',
    steps: [
      setStep('x.y.z.b'),
      setStep('x.y.z.2'),
      setStep('x.y.z.a'),
      setStep('x.y.z.1')
    ]
  },
  {
    name: 'leading-zero-key-is-not-an-index',
    via: 'object',
    steps: [setStep('01'), setStep('1'), setStep('a'), setStep('2')]
  },
  {
    name: 'u32-max-is-not-index-like-but-u32-max-minus-one-is',
    via: 'object',
    steps: [setStep('4294967295'), setStep('4294967294'), setStep('a')]
  },
  {
    name: 'negative-and-float-keys-keep-insertion-order',
    via: 'object',
    steps: [
      setStep('b'),
      setStep('-1'),
      setStep('1.5'),
      setStep('1e3'),
      setStep('3')
    ]
  },
  {
    name: 'beyond-2-pow-53-key-keeps-insertion-order',
    via: 'object',
    steps: [setStep('9007199254740993'), setStep('9'), setStep('a')]
  },
  {
    name: 're-set-keeps-position',
    via: 'object',
    steps: [setStep('a'), setStep('b'), setStep('a', 2)]
  },
  {
    name: 'delete-then-re-insert-moves-last',
    via: 'object',
    steps: [
      setStep('a'),
      setStep('b'),
      setStep('c'),
      { op: 'delete', path: 'a' },
      setStep('a', 2)
    ]
  },
  {
    name: 'whole-object-replace-reorders-integer-keys',
    via: 'object',
    steps: [{ op: 'assign', valueText: '{"b":1,"2":2,"a":3,"1":4}' }]
  },
  {
    name: 'whole-object-replace-nested-integer-keys',
    via: 'object',
    steps: [
      {
        op: 'assign',
        valueText: '{"o":{"z":1,"5":2,"a":3,"0":4},"7":{"y":1,"3":2}}'
      }
    ]
  },
  {
    name: 'nested-object-value-reorders-integer-keys',
    via: 'object',
    steps: [
      {
        op: 'set',
        path: 'o',
        valueText: '{"z":1,"5":2,"a":3,"0":4}'
      }
    ]
  },
  {
    name: 'store-top-level-set-integer-keys',
    via: 'store',
    steps: [setStep('10'), setStep('9'), setStep('x'), setStep('100')]
  },
  {
    name: 'store-whole-object-replace',
    via: 'store',
    steps: [
      setStep('keep'),
      { op: 'assign', valueText: '{"d":1,"2":2,"c":3,"1":{"y":1,"0":2}}' }
    ]
  },
  {
    name: 'store-delete-then-set-nested',
    via: 'store',
    steps: [
      setStep('a.b'),
      setStep('a.c'),
      { op: 'delete', path: 'a.b' },
      setStep('a.b', 2),
      setStep('a.1')
    ]
  }
]

function withVectorStore<T>(
  initial: string | undefined,
  dotNotation: boolean,
  run: (store: GameLibStore, file: string) => T
): T {
  const userData = mkdtempSync(join(tmpdir(), 'gamelib-store-oracle-'))
  try {
    const root = createStoreRoot({ userData })
    const file = join(userData, 'vectors', 'v.json')
    if (initial !== undefined) seed(userData, 'vectors/v.json', initial)
    const store = new GameLibStore({
      root,
      cwd: 'vectors',
      name: 'v',
      accessPropertiesByDotNotation: dotNotation
    })
    return run(store, file)
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
}

function runDotpath(spec: DotpathSpec): DotpathVector {
  return withVectorStore(
    JSON.stringify(spec.initial),
    spec.dotNotation,
    (store, file) => {
      let result: DotpathResult
      try {
        switch (spec.op) {
          case 'get': {
            const value: unknown = store.get(spec.path)
            result =
              value === undefined ? { found: false } : { found: true, value }
            break
          }
          case 'has':
            result = { has: store.has(spec.path) }
            break
          case 'set':
            store.set(spec.path, spec.valueUndefined ? undefined : spec.value)
            result = { done: true }
            break
          case 'delete':
            store.delete(spec.path)
            result = { done: true }
            break
        }
      } catch (err) {
        result = { threw: err instanceof Error ? err.name : typeof err }
      }
      const after: unknown = JSON.parse(readFileSync(file, 'utf8'))
      return {
        ...spec,
        result: JSON.parse(JSON.stringify(result)) as DotpathResult,
        after
      }
    }
  )
}

function runNumber(spec: NumberSpec): NumberVector {
  return {
    ...spec,
    stringified: JSON.stringify(JSON.parse(spec.jsonText), undefined, '\t')
  }
}

function stepValue(step: { value?: unknown; valueText?: string }): unknown {
  return step.valueText !== undefined
    ? (JSON.parse(step.valueText) as unknown)
    : step.value
}

function runKeyOrder(spec: KeyOrderSpec): KeyOrderVector {
  if (spec.via === 'object') {
    let object: Record<string, unknown> = {}
    for (const step of spec.steps) {
      if (step.op === 'set') object[step.path] = stepValue(step)
      else if (step.op === 'delete') delete object[step.path]
      else object = JSON.parse(step.valueText) as Record<string, unknown>
    }
    return { ...spec, stringified: JSON.stringify(object, undefined, '\t') }
  }
  return withVectorStore(undefined, true, (store, file) => {
    for (const step of spec.steps) {
      if (step.op === 'set') store.set(step.path, stepValue(step))
      else if (step.op === 'delete') store.delete(step.path)
      else store.store = JSON.parse(step.valueText) as Record<string, unknown>
    }
    return { ...spec, stringified: readFileSync(file, 'utf8') }
  })
}

describe('store oracle vectors (dot paths, number text, key order)', () => {
  const sets = [
    { file: 'dotpath.json', build: () => DOTPATH_SPECS.map(runDotpath) },
    { file: 'numbers.json', build: () => NUMBER_SPECS.map(runNumber) },
    { file: 'keyorder.json', build: () => KEY_ORDER_SPECS.map(runKeyOrder) }
  ] as const

  beforeEach(() => {
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  if (WRITE_MODE) {
    test('writes the vectors from conf and JSON.stringify', () => {
      mkdirSync(VECTORS_ROOT, { recursive: true })
      for (const { file, build } of sets) {
        writeFileSync(
          join(VECTORS_ROOT, file),
          `${JSON.stringify(build(), null, 2)}\n`
        )
      }
    })
  } else {
    test.each(sets.map((s) => [s.file, s] as const))('%s', (file, set) => {
      const committed: unknown = JSON.parse(
        readFileSync(join(VECTORS_ROOT, file), 'utf-8')
      )
      expect(committed).toEqual(JSON.parse(JSON.stringify(set.build())))
    })

    test('the committed vectors meet the plan minimums', () => {
      const read = (file: string): unknown[] =>
        JSON.parse(readFileSync(join(VECTORS_ROOT, file), 'utf-8')) as unknown[]
      expect(read('dotpath.json').length).toBeGreaterThanOrEqual(25)
      expect(read('numbers.json').length).toBeGreaterThanOrEqual(12)
      expect(read('keyorder.json').length).toBeGreaterThanOrEqual(10)
    })
  }
})

// ---- corpus migrate entries ---------------------------------------------------------------------------
//
// Phase 85 plan 08: every MANIFEST entry of the real-store corpus whose `expect` is `migrate` goes through
// the REAL TS chains, and what TS produced is committed under `tests/fixtures/corpus-expected` for the
// Rust engine to reproduce byte for byte. The file lands where the engine looks for it (the entry's table
// row: `config.json`, `GamesConfig/app.json`, or `<dir>/<name>.json`), never at its corpus path, which for
// a captured backup is a backup name. `corpus-expected/<manifest path>` holds the migrated file and
// `corpus-expected/outcomes.json` the result and the backup names under the oracle's fake clock. Same
// write/compare switch as the golden above.

const CORPUS_ROOT = resolve(FIXTURE_ROOT, '..', 'corpus')
const CORPUS_EXPECTED_ROOT = resolve(FIXTURE_ROOT, '..', 'corpus-expected')
const CORPUS_OUTCOMES_FILE = join(CORPUS_EXPECTED_ROOT, 'outcomes.json')
const STORE_TABLE_FILE = resolve(
  __dirname,
  '../../../common/types/ipc/storeTable.json'
)

type CorpusEntry = {
  path: string
  sha256?: string
  expect: string
  tableKey: string
}

type CorpusOutcome = {
  path: string
  /** `migrated`: the engine backed up and rewrote the file; `discarded`: a cache lost its file instead. */
  result: 'migrated' | 'discarded'
  /** Backup names relative to userData. */
  backups: string[]
}

type TableRow = {
  key: string
  dir: string
  name: string | null
  kind: 'cache' | 'user-state'
  tokenBearing: boolean
  dotPaths: boolean
  flavour: 'store' | 'settings'
}

function corpusMigrateEntries(): CorpusEntry[] {
  const manifest = JSON.parse(
    readFileSync(join(CORPUS_ROOT, 'MANIFEST.json'), 'utf-8')
  ) as { files: CorpusEntry[] }
  return manifest.files.filter((e) => e.expect === 'migrate' && e.sha256)
}

function tableRow(key: string): TableRow {
  const table = JSON.parse(readFileSync(STORE_TABLE_FILE, 'utf-8')) as {
    rows: TableRow[]
  }
  const row = table.rows.find((r) => r.key === key)
  if (!row) throw new Error(`no store table row for ${key}`)
  return row
}

/** Where the engine finds the file for a table row, relative to userData. */
function placementOf(row: TableRow): string {
  if (row.key === 'settings/global') return 'config.json'
  if (row.key === 'settings/game') return 'GamesConfig/app.json'
  return `${row.dir}/${row.name}.json`
}

function runCorpusEntry(entry: CorpusEntry): {
  outcome: CorpusOutcome
  migrated: Buffer | undefined
} {
  const row = tableRow(entry.tableKey)
  const rel = placementOf(row)
  const userData = mkdtempSync(join(tmpdir(), 'gamelib-store-corpus-oracle-'))
  jest.setSystemTime(BASE_TIME)
  try {
    seed(userData, rel, readFileSync(join(CORPUS_ROOT, entry.path)))
    const root = createStoreRoot({ userData })
    if (row.flavour === 'settings') {
      if (row.key !== 'settings/global' && row.key !== 'settings/game') {
        throw new Error(`${entry.path}: ${row.key} is not a settings chain`)
      }
      ensureSettingsMigrated(root.versioning, join(userData, rel), row.key)
    } else {
      openStore(root, {
        dir: row.dir,
        name: row.name as string,
        kind: row.kind,
        ...(row.tokenBearing ? { tokenBearing: true as const } : {}),
        ...(row.dotPaths ? {} : { accessPropertiesByDotNotation: false })
      })
    }
    const files = snapshot(userData)
    const migrated = files.get(rel)
    return {
      outcome: {
        path: entry.path,
        result: migrated ? 'migrated' : 'discarded',
        backups: backupsOf(files)
      },
      migrated
    }
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
}

describe('store oracle corpus migrate entries (TS chains -> committed corpus-expected)', () => {
  const entries = corpusMigrateEntries()

  beforeEach(() => {
    jest.useFakeTimers({ now: BASE_TIME, doNotFake: [...ALL_BUT_DATE] })
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })
  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  test('the corpus has migrate entries to run', () => {
    expect(entries.length).toBeGreaterThanOrEqual(60)
  })

  if (WRITE_MODE) {
    test('writes corpus-expected from the TS chains', () => {
      rmSync(CORPUS_EXPECTED_ROOT, { recursive: true, force: true })
      const outcomes: CorpusOutcome[] = []
      for (const entry of entries) {
        const { outcome, migrated } = runCorpusEntry(entry)
        outcomes.push(outcome)
        if (migrated) {
          const target = join(CORPUS_EXPECTED_ROOT, entry.path)
          mkdirSync(dirname(target), { recursive: true })
          writeFileSync(target, migrated)
        }
      }
      mkdirSync(CORPUS_EXPECTED_ROOT, { recursive: true })
      writeFileSync(
        CORPUS_OUTCOMES_FILE,
        `${JSON.stringify(outcomes, null, 2)}\n`
      )
    })
  } else {
    const committed = JSON.parse(
      readFileSync(CORPUS_OUTCOMES_FILE, 'utf-8')
    ) as CorpusOutcome[]

    test('outcomes.json lists exactly the manifest migrate entries', () => {
      expect(committed.map((o) => o.path)).toEqual(entries.map((e) => e.path))
    })

    test.each(entries.map((e) => [e.path, e] as const))('%s', (path, entry) => {
      const { outcome, migrated } = runCorpusEntry(entry)
      expect(outcome).toEqual(committed.find((o) => o.path === path))
      const target = join(CORPUS_EXPECTED_ROOT, path)
      if (migrated) {
        expect(migrated.equals(readFileSync(target))).toBe(true)
      } else {
        expect(existsSync(target)).toBe(false)
      }
    })

    test('every file under corpus-expected belongs to a migrate entry', () => {
      const names = new Set(entries.map((e) => e.path))
      for (const rel of snapshot(CORPUS_EXPECTED_ROOT).keys()) {
        if (rel === 'outcomes.json') continue
        expect(names.has(rel)).toBe(true)
      }
    })
  }
})
