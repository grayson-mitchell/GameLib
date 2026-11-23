/**
 * The Phase 94 survivor schedule (94-03; D-03, D-04, D-24 and D-27).
 *
 * Once the Humble Bundle and non-Steam shortcuts services are Rust's, their TS survives only as one of
 * five scheduled shapes, each with a deletion phase. This test lists every one, so a survivor cannot
 * exist unscheduled and cannot outlive its row. It reuses the 86 and 87 scans (`infoPortGate`) and keeps
 * its own row type, so the shared gate file, which Phase 87 also edits, is not touched.
 *
 * - shim: one returned typed `requestRustInvoke` call whose arguments are built from the shim's
 *   parameters (the 86 shape rule, `checkShimShape`).
 * - resolver (86 D-24): `const` declarations that gather TS-only inputs, then exactly one returned typed
 *   call. The shortcuts resolvers live in `src/backend/sidecar/shortcutsResolvers.ts`.
 * - view (D-24 of this phase): a write-through mirror of Rust state, pinned to Rust by a `vectors` test.
 * - twin: a synchronous TS copy of a Rust-owned pure function, pinned to Rust by shared vectors. A twin
 *   (and a view) row names the `vectors` test file that exercises it, and that test must import the
 *   row's file.
 * - relocated (D-03, D-27): a TS module moved unchanged as a scheduled survivor with a deletion phase,
 *   such as the login-window seam and `processShortcut`. A relocated row is checked by file, export and
 *   callers: the file must exist, export the row's name, and its `callers` must equal the module's
 *   importers outside tests. A relocated row also covers the `requestRustInvoke(RUST_HUMBLE_*` calls
 *   held inside the one exported function it names, because that function moved as a unit; a call held
 *   anywhere else in the file is not covered.
 *
 * `deletedBy` is the phase that deletes the row, one of `ALLOWED_DELETED_BY`. 94 marks an intra-phase
 * row that a TS module still alive inside Phase 94 uses; 94-30 asserts none remains
 * (`noIntraPhaseRowsLeft`).
 *
 * Discovery, in both directions against the in-scope rows (by file and name): every exported value
 * binding (a function or a const, never a type) under `src/backend/humbleshortcuts/`, every function
 * holding a `requestRustInvoke(RUST_HUMBLE_*` or `RUST_SHORTCUTS_*` call outside that directory, and
 * every export of `src/backend/sidecar/shortcutsResolvers.ts`. An exported `register*` helper that only
 * installs `ipc.on` or `ipc.handle` listeners is covered only when a row in the same file names it in
 * its `wiring` list. Twin, view and relocated rows whose file lies outside that scope are checked by
 * file, export and vectors or callers instead.
 *
 * 94-03 started this schedule empty on a tree with no `humbleshortcuts` directory and no
 * `shortcutsResolvers.ts`, so the discovered set equalled it. The tree already held one pre-94 survivor
 * that discovery finds: `createRustLoginWindowSeam`, the Phase 91 login-window seam implementation, whose
 * eight methods call the `RUST_HUMBLE_LOGIN_*` and `RUST_HUMBLE_REVEAL_POST` channels. It is scheduled
 * below as a relocated row at its current file, and 94-04 repoints that row when it moves the factory.
 * The planted fixtures keep each detector proven rather than vacuous (82 D-05).
 *
 * Floor: the walk reads the non-test .ts/.tsx files under src/backend; 611 when measured on 2026-11-22
 * (86-05). The floor sits well under that so later deletions cannot trip it; never lower it.
 */
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import {
  checkShimShape,
  findExportedValues,
  findImporters,
  findRustCalls,
  REPO_ROOT,
  walkStripped
} from 'backend/testUtils/infoPortGate'
import type { ShimRow, StrippedFile } from 'backend/testUtils/infoPortGate'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import * as ts from 'typescript'

const BACKEND_FILES_FLOOR = 400
const HUMBLESHORTCUTS_DIR = 'src/backend/humbleshortcuts'
const RESOLVERS_FILE = 'src/backend/sidecar/shortcutsResolvers.ts'
const CHANNEL_PREFIXES = ['RUST_HUMBLE_', 'RUST_SHORTCUTS_'] as const

/**
 * The phases a row may be deleted by: 88 to 99, with the two inserted 90.x phases. 94 is this phase, so
 * a 94 row is intra-phase and `noIntraPhaseRowsLeft` fails while one exists.
 */
export const ALLOWED_DELETED_BY: readonly number[] = [
  88, 89, 90, 90.1, 90.2, 91, 92, 93, 94, 95, 96, 97, 98, 99
]

type Shape = 'shim' | 'resolver' | 'view' | 'twin' | 'relocated'
const SHAPES: readonly Shape[] = [
  'shim',
  'resolver',
  'view',
  'twin',
  'relocated'
]

interface ScheduleRow {
  /** The exported name (a function, or a const for a view). */
  name: string
  /** Repo-relative file holding it. */
  file: string
  shape: Shape
  /** Shims and resolvers: the `RUST_HUMBLE_*` or `RUST_SHORTCUTS_*` constant its one typed call sends. */
  channel?: string
  /** Resolvers only: the names of the `const` declarations that gather TS-only inputs. */
  inputs?: readonly string[]
  /** Twins and views: the repo-relative test file that pins the row to Rust; it must import `file`. */
  vectors?: string
  /**
   * `register*` helpers in `file` that only install this row's `ipc.on` or `ipc.handle` listeners.
   * A helper is covered by being named here, by a row in the same file.
   */
  wiring?: readonly string[]
  /** Repo-relative non-test files that import `file`. */
  callers: readonly string[]
  /** The phase that deletes this row, one of `ALLOWED_DELETED_BY`. */
  deletedBy: number
}

/**
 * Rows are added by the plan that creates the survivor, in the same commit. Each row needs its file,
 * name, shape and callers; shims and resolvers a channel; twins and views a vectors test.
 */
export const SCHEDULE: readonly ScheduleRow[] = [
  // The Phase 91 login-window seam implementation (D-03). 94-04 moved the factory verbatim to
  // `src/backend/sidecar/loginSeamRegistration.ts` and repointed this row at the new file, deletedBy 92.
  {
    name: 'createRustLoginWindowSeam',
    file: 'src/backend/sidecar/loginSeamRegistration.ts',
    shape: 'relocated',
    callers: ['src/backend/sidecar/handlers.ts'],
    deletedBy: 92
  }
]

const key = (file: string, name: string): string => `${file}#${name}`

/** True for the files discovery reads exports from: the humbleshortcuts directory and the resolvers file. */
const inScopeFile = (path: string): boolean =>
  path.startsWith(`${HUMBLESHORTCUTS_DIR}/`) || path === RESOLVERS_FILE

/** Rows whose file lies outside the discovery scope are checked by file and export, not by set equality. */
const checkedOutsideScope = (row: ScheduleRow): boolean =>
  row.shape === 'twin' || row.shape === 'view' || row.shape === 'relocated'

/** A shim or resolver row, as the 86 shape rule takes it. */
function toShimRow(row: ScheduleRow): ShimRow {
  return {
    shape: row.shape === 'resolver' ? 'resolver' : 'shim',
    ...(row.inputs ? { inputs: row.inputs } : {})
  }
}

/** The source text of the one top-level function or `const` named `name` in `file`, if it has one. */
function topLevelText(file: StrippedFile, name: string): string | undefined {
  const kind = file.path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(
    file.path,
    file.code,
    ts.ScriptTarget.Latest,
    true,
    kind
  )
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name?.text === name) {
      return st.getText(sf)
    }
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === name) {
          return st.getText(sf)
        }
      }
    }
  }
  return undefined
}

/**
 * `file#fn` -> how many `RUST_HUMBLE_*` or `RUST_SHORTCUTS_*` calls a relocated row covers: the calls held
 * inside the one top-level export it names. Counted rather than set-wise, so a sibling function in the
 * same file holding a same-named method is not hidden by the row.
 */
function relocatedCoverage(
  files: readonly StrippedFile[],
  schedule: readonly ScheduleRow[]
): Map<string, number> {
  const covered = new Map<string, number>()
  for (const row of schedule) {
    if (row.shape !== 'relocated') continue
    const file = files.find((f) => f.path === row.file)
    if (!file) continue
    const text = topLevelText(file, row.name)
    if (text === undefined) continue
    const slice: StrippedFile = { path: file.path, raw: text, code: text }
    for (const call of findRustCalls([slice], CHANNEL_PREFIXES)) {
      const k = key(call.path, call.fn)
      covered.set(k, (covered.get(k) ?? 0) + 1)
    }
  }
  return covered
}

/** `file#name` for every survivor the schedule must list, found in `files`. */
function discover(
  files: readonly StrippedFile[],
  schedule: readonly ScheduleRow[]
): string[] {
  const found = new Set<string>()
  for (const f of files) {
    if (inScopeFile(f.path) && /\.tsx?$/.test(f.path)) {
      for (const name of findExportedValues(f.path, f.code)) {
        found.add(key(f.path, name))
      }
    }
  }
  const covered = relocatedCoverage(files, schedule)
  const counts = new Map<string, number>()
  for (const call of findRustCalls(
    files.filter((f) => !f.path.startsWith(`${HUMBLESHORTCUTS_DIR}/`)),
    CHANNEL_PREFIXES
  )) {
    const k = key(call.path, call.fn)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  for (const [k, count] of counts) {
    if (count > (covered.get(k) ?? 0)) found.add(k)
  }
  return [...found].sort()
}

/**
 * `file#name` the in-scope rows cover: a row's own name, and every `register*` helper in its file
 * that it lists in `wiring`. Twin, view and relocated rows outside the discovery scope are not in this set.
 */
function scheduledKeys(schedule: readonly ScheduleRow[]): string[] {
  const keys = new Set<string>()
  for (const row of schedule) {
    if (checkedOutsideScope(row) && !inScopeFile(row.file)) continue
    keys.add(key(row.file, row.name))
    for (const w of row.wiring ?? []) keys.add(key(row.file, w))
  }
  return [...keys].sort()
}

/** Both directions of the set-equality check. */
function diff(
  discovered: readonly string[],
  scheduled: readonly string[]
): { unscheduled: string[]; orphaned: string[] } {
  return {
    unscheduled: discovered.filter((k) => !scheduled.includes(k)),
    orphaned: scheduled.filter((k) => !discovered.includes(k))
  }
}

/** Why `row.wiring` is not valid: each entry must be a `register*` name the file exports. */
function wiringProblems(row: ScheduleRow, source: string): string[] {
  const exported = findExportedValues(row.file, source)
  const problems: string[] = []
  for (const w of row.wiring ?? []) {
    if (!/^register[A-Z0-9]/.test(w)) {
      problems.push(`${row.name}: wiring '${w}' is not a register* helper`)
    } else if (!exported.includes(w)) {
      problems.push(`${row.name}: wiring '${w}' is not exported by ${row.file}`)
    }
  }
  return problems
}

/**
 * Why a twin or view row is not pinned to Rust: its file must exist, export its name, and name a
 * `vectors` test that exists and imports the file. Empty when the row is sound.
 */
function twinViewProblems(
  row: ScheduleRow,
  base: string = REPO_ROOT
): string[] {
  const label = `${row.name} (${row.shape})`
  const filePath = join(base, row.file)
  if (!existsSync(filePath))
    return [`${label}: file ${row.file} does not exist`]
  const problems: string[] = []
  const source = readFileSync(filePath, 'utf8')
  if (!findExportedValues(row.file, source).includes(row.name)) {
    problems.push(`${label}: ${row.file} does not export '${row.name}'`)
  }
  if (row.vectors === undefined || row.vectors === '') {
    problems.push(`${label}: no vectors test names how it is pinned to Rust`)
    return problems
  }
  const vectorsPath = join(base, row.vectors)
  if (!existsSync(vectorsPath)) {
    problems.push(`${label}: vectors test ${row.vectors} does not exist`)
    return problems
  }
  const vectorsRaw = readFileSync(vectorsPath, 'utf8')
  const asFile: StrippedFile = {
    path: row.vectors,
    raw: vectorsRaw,
    code: vectorsRaw
  }
  if (findImporters([asFile], row.file).length === 0) {
    problems.push(
      `${label}: vectors test ${row.vectors} does not import ${row.file}`
    )
  }
  return problems
}

/** Why a relocated row is unsound: its file must exist and export its name. The callers check is separate. */
function relocatedProblems(
  row: ScheduleRow,
  base: string = REPO_ROOT
): string[] {
  const label = `${row.name} (${row.shape})`
  const filePath = join(base, row.file)
  if (!existsSync(filePath))
    return [`${label}: file ${row.file} does not exist`]
  const source = readFileSync(filePath, 'utf8')
  return findExportedValues(row.file, source).includes(row.name)
    ? []
    : [`${label}: ${row.file} does not export '${row.name}'`]
}

/** Why a row's `callers` are not the file's importers outside tests, in either direction. */
function callerProblems(
  row: ScheduleRow,
  files: readonly StrippedFile[]
): string[] {
  const importers = findImporters(files, row.file).sort()
  const listed = [...row.callers].sort()
  const label = key(row.file, row.name)
  return [
    ...importers
      .filter((p) => !listed.includes(p))
      .map((p) => `${label}: ${p} imports the file but is not a listed caller`),
    ...listed
      .filter((p) => !importers.includes(p))
      .map((p) => `${label}: listed caller ${p} does not import the file`)
  ]
}

/** Why a row's shape is not one of the five. */
function shapeProblems(schedule: readonly ScheduleRow[]): string[] {
  return schedule
    .filter((r) => !SHAPES.includes(r.shape))
    .map((r) => `${key(r.file, r.name)}: shape '${String(r.shape)}' is unknown`)
}

/** Why a row's `deletedBy` is not one of `ALLOWED_DELETED_BY`. */
function deletedByProblems(schedule: readonly ScheduleRow[]): string[] {
  return schedule
    .filter((r) => !ALLOWED_DELETED_BY.includes(r.deletedBy))
    .map(
      (r) =>
        `${key(r.file, r.name)}: deletedBy ${String(r.deletedBy)} is not one of ${ALLOWED_DELETED_BY.join(', ')}`
    )
}

/**
 * 94-30 calls this over the final schedule (`humbleServicesPortComplete`, in `humblePortComplete.test.ts`):
 * throws naming every row still marked `deletedBy: 94`, an intra-phase row that a TS module alive inside
 * Phase 94 used and that must be gone by the end.
 */
export function noIntraPhaseRowsLeft(
  schedule: readonly Pick<ScheduleRow, 'name' | 'file' | 'deletedBy'>[]
): void {
  const left = schedule
    .filter((r) => r.deletedBy === 94)
    .map((r) => key(r.file, r.name))
  if (left.length > 0) {
    throw new Error(
      `intra-phase rows (deletedBy 94) still scheduled: ${left.join(', ')}`
    )
  }
}

const planted = (path: string, code: string): StrippedFile => ({
  path,
  raw: code,
  code
})

const backendWalk = walkStripped(['src/backend'], { ext: /\.tsx?$/ })
const allWalk = walkStripped(['src', 'meta'], { ext: /\.tsx?$/ })

describe('humbleShortcutsShimSchedule', () => {
  it('anti-vacuity: the walk read a real src/backend tree', () => {
    assertAtOrAboveFloor(
      'humbleShortcutsShimSchedule src/backend files',
      backendWalk.count,
      BACKEND_FILES_FLOOR
    )
  })

  it('the discovered survivors equal the in-scope schedule rows, by file and name', () => {
    expect(
      diff(discover(allWalk.files, SCHEDULE), scheduledKeys(SCHEDULE))
    ).toEqual({ unscheduled: [], orphaned: [] })
  })

  it('every row has a unique file and name', () => {
    const keys = SCHEDULE.map((r) => key(r.file, r.name))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every row has one of the five shapes', () => {
    expect(shapeProblems(SCHEDULE)).toEqual([])
  })

  // One loop per check rather than `it.each`, so a schedule without rows of a shape does not trip jest's
  // empty-table refusal.
  it('every shim and resolver row has the shape it claims and sends its row channel', () => {
    const calls = findRustCalls(allWalk.files, CHANNEL_PREFIXES)
    for (const row of SCHEDULE) {
      if (row.shape !== 'shim' && row.shape !== 'resolver') continue
      const source = readFileSync(join(REPO_ROOT, row.file), 'utf8')
      expect({
        row: row.name,
        problems: checkShimShape(
          source,
          row.name,
          toShimRow(row),
          CHANNEL_PREFIXES
        )
      }).toEqual({ row: row.name, problems: [] })
      const sent = calls.find((c) => c.path === row.file && c.fn === row.name)
      expect({ row: row.name, channel: sent?.constant }).toEqual({
        row: row.name,
        channel: row.channel
      })
    }
  })

  it('every twin and view row exists, exports its name and is pinned by a vectors test that imports it', () => {
    for (const row of SCHEDULE) {
      if (row.shape !== 'twin' && row.shape !== 'view') continue
      expect({ row: row.name, problems: twinViewProblems(row) }).toEqual({
        row: row.name,
        problems: []
      })
    }
  })

  it('every relocated row exists and exports its name', () => {
    for (const row of SCHEDULE) {
      if (row.shape !== 'relocated') continue
      expect({ row: row.name, problems: relocatedProblems(row) }).toEqual({
        row: row.name,
        problems: []
      })
    }
  })

  it('every wiring entry is an exported register* helper in the row file', () => {
    for (const row of SCHEDULE) {
      if (!row.wiring || row.wiring.length === 0) continue
      const source = readFileSync(join(REPO_ROOT, row.file), 'utf8')
      expect({ row: row.name, problems: wiringProblems(row, source) }).toEqual({
        row: row.name,
        problems: []
      })
    }
  })

  it('every row is scheduled for deletion in an allowed phase', () => {
    expect(deletedByProblems(SCHEDULE)).toEqual([])
  })

  it('every row is imported by exactly its listed callers', () => {
    for (const row of SCHEDULE) {
      expect({
        row: row.name,
        problems: callerProblems(row, allWalk.files)
      }).toEqual({ row: row.name, problems: [] })
    }
  })
})

describe('humbleShortcutsShimSchedule detector (planted fixtures)', () => {
  const SHIM =
    'export async function f(deps, a) { return deps.requestRustInvoke(RUST_HUMBLE_X, [{ a }]) }'

  const makeTree = (
    files: Record<string, string>
  ): { dir: string; cleanup: () => void } => {
    const dir = mkdtempSync(join(tmpdir(), 'humble-shortcuts-shim-schedule-'))
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), content)
    }
    return {
      dir,
      cleanup: () => rmSync(dir, { recursive: true, force: true })
    }
  }

  describe('discovery set-equality', () => {
    it('with no rows, no humbleshortcuts directory and no resolvers file the discovered set is empty and equals the schedule', () => {
      expect(diff(discover([], []), scheduledKeys([]))).toEqual({
        unscheduled: [],
        orphaned: []
      })
      expect(
        diff(
          discover([planted('src/backend/a.ts', 'export const a = 1')], []),
          scheduledKeys([])
        )
      ).toEqual({ unscheduled: [], orphaned: [] })
    })

    it('a planted unscheduled exported function in a temp humbleshortcuts directory fails set equality', () => {
      const { dir, cleanup } = makeTree({
        [`${HUMBLESHORTCUTS_DIR}/things.ts`]: `${SHIM}\nexport const g = 1\nfunction hidden() {}\n`
      })
      try {
        const walk = walkStripped(['src/backend'], {
          base: dir,
          ext: /\.tsx?$/
        })
        expect(walk.count).toBe(1)
        expect(diff(discover(walk.files, []), [])).toEqual({
          unscheduled: [
            `${HUMBLESHORTCUTS_DIR}/things.ts#f`,
            `${HUMBLESHORTCUTS_DIR}/things.ts#g`
          ],
          orphaned: []
        })
      } finally {
        cleanup()
      }
    })

    it('discovers exported values (functions, consts, classes) and never a type', () => {
      const file = planted(
        `${HUMBLESHORTCUTS_DIR}/mixed.ts`,
        [
          'export function fn() {}',
          'export const value = 1',
          'export const arrow = () => 1',
          'export class Holder {}',
          'export type Alias = string',
          'export interface Shape { a: string }',
          'export { fn as renamed }',
          'export type { Alias as Other }',
          'const local = 1'
        ].join('\n')
      )
      expect(discover([file], [])).toEqual([
        `${HUMBLESHORTCUTS_DIR}/mixed.ts#Holder`,
        `${HUMBLESHORTCUTS_DIR}/mixed.ts#arrow`,
        `${HUMBLESHORTCUTS_DIR}/mixed.ts#fn`,
        `${HUMBLESHORTCUTS_DIR}/mixed.ts#renamed`,
        `${HUMBLESHORTCUTS_DIR}/mixed.ts#value`
      ])
    })

    it('a planted registerX export that no row lists in wiring fails set equality, and passes once a row in the same file lists it', () => {
      const file = planted(
        `${HUMBLESHORTCUTS_DIR}/wire.ts`,
        `${SHIM}\nexport function registerX(ipc) { ipc.handle('x', () => 1) }`
      )
      const row: ScheduleRow = {
        name: 'f',
        file: `${HUMBLESHORTCUTS_DIR}/wire.ts`,
        shape: 'shim',
        channel: 'RUST_HUMBLE_X',
        callers: [],
        deletedBy: 98
      }
      expect(diff(discover([file], []), scheduledKeys([row]))).toEqual({
        unscheduled: [`${HUMBLESHORTCUTS_DIR}/wire.ts#registerX`],
        orphaned: []
      })
      expect(
        diff(
          discover([file], []),
          scheduledKeys([{ ...row, wiring: ['registerX'] }])
        )
      ).toEqual({ unscheduled: [], orphaned: [] })
    })

    it('a wiring entry in another file does not cover a register helper, and a non-register name is refused', () => {
      const file = planted(
        `${HUMBLESHORTCUTS_DIR}/wire.ts`,
        'export function registerX(ipc) { ipc.on("x", () => 1) }'
      )
      const elsewhere: ScheduleRow = {
        name: 'h',
        file: `${HUMBLESHORTCUTS_DIR}/other.ts`,
        shape: 'shim',
        channel: 'RUST_HUMBLE_X',
        callers: [],
        deletedBy: 98,
        wiring: ['registerX']
      }
      expect(
        diff(discover([file], []), scheduledKeys([elsewhere])).unscheduled
      ).toEqual([`${HUMBLESHORTCUTS_DIR}/wire.ts#registerX`])
      const row: ScheduleRow = {
        name: 'f',
        file: `${HUMBLESHORTCUTS_DIR}/wire.ts`,
        shape: 'shim',
        channel: 'RUST_HUMBLE_X',
        callers: [],
        deletedBy: 98,
        wiring: ['f', 'registerGone']
      }
      expect(
        wiringProblems(row, `${SHIM}\nexport function registerX() {}`)
      ).toEqual([
        "f: wiring 'f' is not a register* helper",
        `f: wiring 'registerGone' is not exported by ${HUMBLESHORTCUTS_DIR}/wire.ts`
      ])
    })

    it('a row with no discovered survivor fails the check', () => {
      const file = planted(`${HUMBLESHORTCUTS_DIR}/things.ts`, SHIM)
      const rows: ScheduleRow[] = [
        {
          name: 'f',
          file: `${HUMBLESHORTCUTS_DIR}/things.ts`,
          shape: 'shim',
          channel: 'RUST_HUMBLE_X',
          callers: [],
          deletedBy: 98
        },
        {
          name: 'gone',
          file: `${HUMBLESHORTCUTS_DIR}/things.ts`,
          shape: 'shim',
          channel: 'RUST_HUMBLE_Y',
          callers: [],
          deletedBy: 98
        }
      ]
      expect(diff(discover([file], []), scheduledKeys(rows))).toEqual({
        unscheduled: [],
        orphaned: [`${HUMBLESHORTCUTS_DIR}/things.ts#gone`]
      })
    })

    it('an outside call is discovered by the function holding it, for RUST_HUMBLE_ and RUST_SHORTCUTS_ but no other prefix', () => {
      const humble = planted(
        'src/backend/launch/humble.ts',
        'export function useHumble(deps) { return deps.requestRustInvoke(RUST_HUMBLE_Z, []) }'
      )
      const shortcuts = planted(
        'src/backend/launch/shortcuts.ts',
        'export const useShortcuts = (deps) => { deps.list.forEach(() => deps.requestRustInvoke(RUST_SHORTCUTS_Z, [])) }'
      )
      const info = planted(
        'src/backend/launch/info.ts',
        'export function useInfo(deps) { return deps.requestRustInvoke(RUST_INFO_Z, []) }'
      )
      expect(discover([humble, shortcuts, info], [])).toEqual([
        'src/backend/launch/humble.ts#useHumble',
        'src/backend/launch/shortcuts.ts#useShortcuts'
      ])
      expect(diff(discover([humble], []), [])).toEqual({
        unscheduled: ['src/backend/launch/humble.ts#useHumble'],
        orphaned: []
      })
    })

    it('every export of the resolvers file is discovered, and a sibling sidecar file is not', () => {
      const resolvers = planted(
        RESOLVERS_FILE,
        'export async function resolveExists(deps) { return deps.requestRustInvoke(RUST_SHORTCUTS_EXISTS, []) }\nexport const toggle = 1\nexport type T = string'
      )
      const sibling = planted(
        'src/backend/sidecar/other.ts',
        'export const notScanned = 1'
      )
      expect(discover([resolvers, sibling], [])).toEqual([
        `${RESOLVERS_FILE}#resolveExists`,
        `${RESOLVERS_FILE}#toggle`
      ])
    })
  })

  describe('shim shape with the humble and shortcuts channel prefixes', () => {
    it('a planted shim passes as shape shim for a RUST_HUMBLE_ and a RUST_SHORTCUTS_ channel', () => {
      expect(
        checkShimShape(SHIM, 'f', { shape: 'shim' }, CHANNEL_PREFIXES)
      ).toEqual([])
      expect(
        checkShimShape(
          'export const g = (deps, a) => deps.requestRustInvoke(RUST_SHORTCUTS_Y, [a])',
          'g',
          { shape: 'shim' },
          CHANNEL_PREFIXES
        )
      ).toEqual([])
    })

    it('a planted shim body with two requestRustInvoke calls fails checkShimShape', () => {
      const twice =
        'export async function f(deps, a) { await deps.requestRustInvoke(RUST_HUMBLE_X, [a]); return deps.requestRustInvoke(RUST_SHORTCUTS_Y, [a]) }'
      expect(
        checkShimShape(twice, 'f', { shape: 'shim' }, CHANNEL_PREFIXES)
      ).toEqual([expect.stringContaining('holds 2 requestRustInvoke calls')])
    })

    it('a planted call to an info channel fails for the humble and shortcuts prefixes', () => {
      const info =
        'export async function f(deps, a) { return deps.requestRustInvoke(RUST_INFO_X, [a]) }'
      expect(
        checkShimShape(info, 'f', { shape: 'shim' }, CHANNEL_PREFIXES)
      ).toEqual([
        expect.stringContaining(
          'the first argument must be a RUST_HUMBLE_* or RUST_SHORTCUTS_* constant'
        )
      ])
    })

    it('a planted resolver passes with its const inputs and a shortcuts channel', () => {
      const src =
        'export async function r(deps, id) { const settings = await load(id); return deps.requestRustInvoke(RUST_SHORTCUTS_Y, [{ settings }]) }'
      expect(
        checkShimShape(
          src,
          'r',
          toShimRow({
            name: 'r',
            file: RESOLVERS_FILE,
            shape: 'resolver',
            inputs: ['settings'],
            channel: 'RUST_SHORTCUTS_Y',
            callers: [],
            deletedBy: 98
          }),
          CHANNEL_PREFIXES
        )
      ).toEqual([])
    })
  })

  describe('twin and view rows', () => {
    const TWIN: ScheduleRow = {
      name: 'getUserAgent',
      file: 'src/backend/login/userAgent.ts',
      shape: 'twin',
      vectors: 'src/backend/login/__tests__/userAgent.test.ts',
      callers: [],
      deletedBy: 92
    }

    it('a twin whose file exports its name and whose vectors test imports the file passes', () => {
      const { dir, cleanup } = makeTree({
        [TWIN.file]: 'export function getUserAgent() { return 1 }',
        [TWIN.vectors as string]:
          "import { getUserAgent } from '../userAgent'\nit('x', () => getUserAgent())"
      })
      try {
        expect(twinViewProblems(TWIN, dir)).toEqual([])
        expect(twinViewProblems({ ...TWIN, shape: 'view' }, dir)).toEqual([])
      } finally {
        cleanup()
      }
    })

    it('a planted twin row with no vectors field fails', () => {
      const { dir, cleanup } = makeTree({
        [TWIN.file]: 'export function getUserAgent() { return 1 }'
      })
      try {
        const { vectors: _omit, ...noVectors } = TWIN
        void _omit
        expect(twinViewProblems(noVectors, dir)).toEqual([
          expect.stringContaining('no vectors test names how it is pinned')
        ])
      } finally {
        cleanup()
      }
    })

    it('a planted view row whose vectors test file does not exist fails', () => {
      const { dir, cleanup } = makeTree({
        [TWIN.file]: 'export const getUserAgent = 1'
      })
      try {
        const problems = twinViewProblems({ ...TWIN, shape: 'view' }, dir)
        expect(problems).toEqual([expect.stringContaining('vectors test')])
        expect(problems[0]).toContain('does not exist')
      } finally {
        cleanup()
      }
    })

    it('a twin row whose vectors test does not import the twin file fails, a sibling import is not enough', () => {
      const { dir, cleanup } = makeTree({
        [TWIN.file]: 'export function getUserAgent() { return 1 }',
        [TWIN.vectors as string]:
          "import { x } from '../userAgentMore'\nit('x', () => x)"
      })
      try {
        expect(twinViewProblems(TWIN, dir)).toEqual([
          expect.stringContaining(`does not import ${TWIN.file}`)
        ])
      } finally {
        cleanup()
      }
    })

    it('a twin row whose file does not export its name, or does not exist, fails', () => {
      const { dir, cleanup } = makeTree({
        [TWIN.file]: 'function getUserAgent() { return 1 }',
        [TWIN.vectors as string]: "import '../userAgent'"
      })
      try {
        expect(twinViewProblems(TWIN, dir)).toEqual([
          expect.stringContaining("does not export 'getUserAgent'")
        ])
        expect(
          twinViewProblems({ ...TWIN, file: 'src/backend/missing.ts' }, dir)
        ).toEqual([expect.stringContaining('does not exist')])
      } finally {
        cleanup()
      }
    })
  })

  describe('relocated rows', () => {
    const RELOCATED: ScheduleRow = {
      name: 'processShortcut',
      file: 'src/backend/shortcuts/processShortcut.ts',
      shape: 'relocated',
      callers: ['src/backend/a.ts'],
      deletedBy: 96
    }

    it('a relocated row whose file exists and exports its name passes', () => {
      const { dir, cleanup } = makeTree({
        [RELOCATED.file]: 'export function processShortcut() { return 1 }'
      })
      try {
        expect(relocatedProblems(RELOCATED, dir)).toEqual([])
      } finally {
        cleanup()
      }
    })

    it('a relocated row whose file is missing, or does not export its name, fails', () => {
      const { dir, cleanup } = makeTree({
        [RELOCATED.file]: 'function processShortcut() { return 1 }'
      })
      try {
        expect(relocatedProblems(RELOCATED, dir)).toEqual([
          expect.stringContaining("does not export 'processShortcut'")
        ])
        expect(
          relocatedProblems({ ...RELOCATED, file: 'src/backend/gone.ts' }, dir)
        ).toEqual([expect.stringContaining('does not exist')])
      } finally {
        cleanup()
      }
    })

    it('a planted relocated row whose callers differ from the file importers fails, in either direction', () => {
      const files = [
        planted(
          'src/backend/a.ts',
          "import { processShortcut } from 'backend/shortcuts/processShortcut'"
        ),
        planted(
          'src/backend/b.ts',
          "import { processShortcut } from './shortcuts/processShortcut'"
        ),
        planted('src/backend/c.ts', 'export const c = 1')
      ]
      expect(callerProblems(RELOCATED, files)).toEqual([
        expect.stringContaining('src/backend/b.ts imports the file')
      ])
      expect(
        callerProblems({ ...RELOCATED, callers: ['src/backend/c.ts'] }, files)
      ).toEqual([
        expect.stringContaining('src/backend/a.ts imports the file'),
        expect.stringContaining('src/backend/b.ts imports the file'),
        expect.stringContaining('listed caller src/backend/c.ts')
      ])
      expect(
        callerProblems(
          { ...RELOCATED, callers: ['src/backend/a.ts', 'src/backend/b.ts'] },
          files
        )
      ).toEqual([])
    })

    it('a relocated row outside the discovery scope is not part of the set-equality check, and inside it is', () => {
      expect(scheduledKeys([RELOCATED])).toEqual([])
      expect(
        scheduledKeys([
          { ...RELOCATED, file: `${HUMBLESHORTCUTS_DIR}/processShortcut.ts` }
        ])
      ).toEqual([`${HUMBLESHORTCUTS_DIR}/processShortcut.ts#processShortcut`])
    })

    it('a relocated row covers the Rust calls inside the export it names, and a call held anywhere else in the file is still discovered', () => {
      const seam = planted(
        'src/backend/sidecar/seam.ts',
        [
          'export function createSeam(deps) {',
          '  return {',
          '    async open() { return deps.requestRustInvoke(RUST_HUMBLE_LOGIN_OPEN, []) },',
          '    async close() { return deps.requestRustInvoke(RUST_HUMBLE_LOGIN_CLOSE, []) }',
          '  }',
          '}',
          'export function stray(deps) { return deps.requestRustInvoke(RUST_HUMBLE_STRAY, []) }',
          'export function other(deps) { return { async open() { return deps.requestRustInvoke(RUST_HUMBLE_OTHER, []) } } }'
        ].join('\n')
      )
      const row: ScheduleRow = {
        name: 'createSeam',
        file: 'src/backend/sidecar/seam.ts',
        shape: 'relocated',
        callers: [],
        deletedBy: 92
      }
      expect(discover([seam], [])).toEqual([
        'src/backend/sidecar/seam.ts#close',
        'src/backend/sidecar/seam.ts#open',
        'src/backend/sidecar/seam.ts#stray'
      ])
      expect(discover([seam], [row])).toEqual([
        'src/backend/sidecar/seam.ts#open',
        'src/backend/sidecar/seam.ts#stray'
      ])
      expect(
        discover([seam], [{ ...row, name: 'notThere' }]).length
      ).toBeGreaterThan(discover([seam], [row]).length)
    })
  })

  describe('shape and deletedBy', () => {
    const row = (deletedBy: number, shape: Shape = 'shim'): ScheduleRow => ({
      name: 'f',
      file: `${HUMBLESHORTCUTS_DIR}/f.ts`,
      shape,
      channel: 'RUST_HUMBLE_X',
      callers: [],
      deletedBy
    })

    it('a shape outside the five fails', () => {
      expect(shapeProblems(SHAPES.map((s) => row(98, s)))).toEqual([])
      expect(shapeProblems([row(98, 'adapter' as Shape)])).toEqual([
        expect.stringContaining("shape 'adapter' is unknown")
      ])
    })

    it('a deletedBy outside the allowed set, or not an integer outside 90.1 and 90.2, fails', () => {
      expect(
        deletedByProblems([row(88), row(90.1), row(90.2), row(94), row(99)])
      ).toEqual([])
      for (const bad of [87, 100, 0, 93.5, 90.3, Number.NaN]) {
        expect(deletedByProblems([row(bad)])).toHaveLength(1)
      }
    })

    it('noIntraPhaseRowsLeft fails while a row has deletedBy 94 and passes once none does', () => {
      expect(() => noIntraPhaseRowsLeft([row(94), row(98)])).toThrow(
        /intra-phase rows.*f\.ts#f/
      )
      expect(() => noIntraPhaseRowsLeft([row(95), row(98)])).not.toThrow()
      expect(() => noIntraPhaseRowsLeft([])).not.toThrow()
    })
  })

  it('self-test: an empty directory walks no files and fails the schedule floor', () => {
    const { dir, cleanup } = makeTree({})
    try {
      const walk = walkStripped(['src/backend'], { base: dir })
      expect(walk.count).toBe(0)
      expect(() =>
        assertAtOrAboveFloor(
          'humbleShortcutsShimSchedule src/backend files',
          walk.count,
          BACKEND_FILES_FLOOR
        )
      ).toThrow(/humbleShortcutsShimSchedule src\/backend files/)
    } finally {
      cleanup()
    }
  })
})
