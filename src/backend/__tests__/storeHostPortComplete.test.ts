/**
 * Phase 85 deletion gate for the store host (SC5, D-03): the Rust `StoreHost` is the only disk
 * writer for every persisted store, the TS store classes are only its write-through mirror, and
 * the dual path the phase carried through its live gate is deleted. Fails if a deleted path, a
 * deleted identifier or the TS owner path comes back, or if a module the mirror still needs is
 * gone. 85-21 writes the gate (the migration system, then the flag and the TS owner path); 85-23
 * and 85-24 extend the same lists as they delete storeVersioning/* and storeMigrations/*.
 *
 * SC4, recorded before the migration system was deleted (D-06, research finding 3). The TS
 * migration system had one migration, `legendary.ts` (it copied a system-wide legendary config
 * into GameLib's own folder on first run). `applyMigrations()` ran from the sidecar bootstrap in
 * v0.8, v0.9 and v0.10 (wired by quick 260822-s8y before v0.8; Electron-era builds ran it from
 * `main.ts` before that). The legendary migration returned true, and so was recorded as applied,
 * even when there was nothing to copy, and the operator's `store/migrations.json` reads
 * `["legendary-move-global-config-folder"]`, as do the generated v0.8, v0.9 and v0.10 corpus
 * profiles. So every supported upgrade source already has it applied. The only remaining reach is
 * a fresh install on a machine with a pre-existing system-wide legendary config
 * (`~/.config/legendary`, or `<appData>/legendary` on Linux), and that user can simply
 * sign in to Epic again. So the migration was deleted rather than ported, together with
 * `MigrationSystem` (`migration/index.ts`, `migration/stores.ts`) and the `migrationsStore` mirror.
 *
 * D-07: `store/migrations.json` stays on disk. Rust never opens it (`store_boot_never_opens_
 * migrations_json`), and nothing deletes it, so a downgraded v0.10 still sees the id applied.
 *
 * Modelled on loggerPortComplete (84) and nativeSeamPortComplete (82 D-05): every scan runs over
 * comment-stripped text, each walk has a floor on the files it read, and self-tests prove each
 * scan can fail. The fixture directories stay: the Rust golden, vector and corpus tests in
 * gamelib-store keep asserting against them after the TS oracle is deleted.
 */
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import {
  stripSourceComments,
  stripTrailingLineComment
} from 'backend/testUtils/stripSourceComments'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, relative } from 'path'

const ROOT = join(__dirname, '..', '..', '..')

const STORE_FIXTURES = 'src-tauri/crates/gamelib-store/tests/fixtures'

/** Paths deleted by the phase; none may come back. */
const DELETED = [
  // 85-21 Task 1: the TS migration system and the migrationsStore mirror (D-06).
  'src/backend/migration',
  'src/backend/migration/index.ts',
  'src/backend/migration/stores.ts',
  'src/backend/migration/migrations/legendary.ts',
  'src/backend/sidecar/__tests__/migrationsWiring.test.ts',
  // 85-21 Task 2: the store flag, the ownership file and the TS owner path (D-03). The oracle's
  // goldens and vectors stay (KEPT); the conf-backed store's versioning cases are the Rust
  // engine_golden and corpus tests (85-07).
  'src/backend/stores/storeOwnership.ts',
  'src/common/types/ipc/storeOwnership.json',
  'src/backend/stores/__tests__/storeOracle.test.ts',
  'src/backend/stores/__tests__/storeOwnership.test.ts',
  'src/backend/stores/__tests__/storeFallback.test.ts',
  'src/backend/__tests__/storeBackendVersioning.test.ts',
  // 85-24 Task 1: the TS read-only notice path. The frontendReady flow sends only Rust's notice
  // (85-16); the shell's own read-only stores are the whole notice.
  'src/backend/sidecar/readOnlyStoresNotice.ts'
]

/** What the mirror and the Rust tests still need; deleting one of these is a regression. */
const KEPT = [
  `${STORE_FIXTURES}/golden`,
  `${STORE_FIXTURES}/vectors`,
  `${STORE_FIXTURES}/corpus`,
  `${STORE_FIXTURES}/corpus-expected`,
  'src/backend/stores/mirrorCell.ts',
  'src/backend/stores/dotPath.ts',
  'src/backend/stores/storeFrames.ts',
  'src/backend/stores/settingsDocs.ts',
  'src/backend/stores/bottleVersionGate.ts'
]

/**
 * Identifiers deleted with the dual path; none may be named in comment-stripped non-test code
 * under src/, meta/, src-tauri/src or any src-tauri crate's src/.
 */
const FORBIDDEN_IDENTIFIERS = [
  // 85-21 Task 1: the migration system's class, its store factory, its applied-ids store, the
  // legendary migration's id and the bootstrap call (D-06).
  'MigrationSystem',
  'createMigrationStores',
  'migrationsStore',
  'legendary-move-global-config-folder',
  'applyMigrations',
  // 85-21 Task 2: the TS mode resolution and the `store:ts-*` internal channels Rust forwarded to.
  'resolveStoreMode',
  'store:ts-',
  // 85-23 Task 2: the test helper that built a TS versioning engine for a consumer under test.
  // Built from parts so this file does not name it either.
  ['createTest', 'Versioning'].join(''),
  // 85-24 Task 1: the TS notice push helper (and its pre-85-16 name), gone with the TS read-only
  // notice path. Built from parts so this file does not name them either.
  ['raiseReadOnlyStoresNotice', 'InRust'].join(''),
  ['pushReadOnly', 'StoresNotice'].join('')
]

/**
 * The rollback flag Phase 85 carried through its live gate (D-01), named as a whole word: the
 * shell's boot report (`<flag>_BOOT`) and the lazy-miss marker share its prefix and stay. Built from
 * parts so this file does not name it either. Scanned over RAW text, comments and tests included.
 */
const FLAG = ['GAMELIB', 'STORE'].join('_')

/** The `conf` package, gone with the TS owner path: no source may import it. */
const CONF_IMPORT_RE = /from\s+['"]conf['"]|require\(\s*['"]conf['"]\s*\)/

/**
 * Floors (82 D-05). Measured 2026-11-22 (85-21): non-test src/ and meta/ hold well over 1000
 * scannable files (loggerPortComplete's floor is 500 over the same trees); src-tauri/src holds 60+
 * .rs files and the crates' src/ trees 200+. Never lower a floor to make a red run green.
 */
const TS_FILES_FLOOR = 500
const SHELL_FILES_FLOOR = 40
const CRATE_FILES_FLOOR = 100

function walk(
  dir: string,
  out: string[],
  ext: RegExp,
  withTests = false
): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue
    if (e.name === '__tests__' && !withTests) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) walk(full, out, ext, withTests)
    else if (ext.test(e.name)) out.push(full)
  }
}

/** True when `src` names `flag` as a whole word (`_` is a word character, so `<flag>_BOOT` is not it). */
function namesFlag(src: string, flag: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9_])${flag}($|[^A-Za-z0-9_])`).test(src)
}

/** Paths whose comment-stripped code imports `conf`. */
function confImportHits(files: readonly Loaded[]): string[] {
  return files
    .filter((f) => CONF_IMPORT_RE.test(stripSourceComments(f.src)))
    .map((f) => f.path)
}

/** Every `src-tauri/crates/<crate>/src` tree (the crates' tests/ and fixtures are not scanned). */
function crateSrcDirs(): string[] {
  const crates = join(ROOT, 'src-tauri', 'crates')
  return readdirSync(crates, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(crates, e.name, 'src'))
    .filter((dir) => existsSync(dir))
}

interface Loaded {
  path: string
  src: string
}

/** Rust code with block, whole-line and trailing `//` comments removed. */
function rustCode(src: string): string {
  return stripSourceComments(src)
    .split('\n')
    .map(stripTrailingLineComment)
    .join('\n')
}

/** `path: identifier` for every identifier named in comment-stripped code. */
function identifierHits(
  files: readonly Loaded[],
  identifiers: readonly string[]
): string[] {
  const hits: string[] = []
  for (const f of files) {
    const code = f.path.endsWith('.rs')
      ? rustCode(f.src)
      : stripSourceComments(f.src)
    for (const id of identifiers) {
      if (code.includes(id)) hits.push(`${f.path}: ${id}`)
    }
  }
  return hits
}

describe('store host port complete (Phase 85)', () => {
  const tsFiles: string[] = []
  walk(join(ROOT, 'src'), tsFiles, /\.(ts|tsx|cjs|js)$/)
  walk(join(ROOT, 'meta'), tsFiles, /\.(ts|tsx|cjs|js)$/)
  const shellFiles: string[] = []
  walk(join(ROOT, 'src-tauri', 'src'), shellFiles, /\.rs$/)
  const crateFiles: string[] = []
  for (const dir of crateSrcDirs()) walk(dir, crateFiles, /\.rs$/)
  const load = (f: string): Loaded => ({
    path: relative(ROOT, f),
    src: readFileSync(f, 'utf8')
  })
  const loaded = [...tsFiles, ...shellFiles, ...crateFiles].map(load)
  // The flag scan reads tests too, the way `grep -rnw` over src, meta and src-tauri/src does.
  const flagFiles: string[] = []
  walk(join(ROOT, 'src'), flagFiles, /\.(ts|tsx|cjs|js|json|md)$/, true)
  walk(join(ROOT, 'meta'), flagFiles, /\.(ts|tsx|cjs|js|json|md)$/, true)
  walk(join(ROOT, 'src-tauri', 'src'), flagFiles, /\.rs$/, true)

  it.each(DELETED)('%s is deleted', (p) => {
    expect(existsSync(join(ROOT, p))).toBe(false)
  })

  it.each(KEPT)('%s is kept', (p) => {
    expect(existsSync(join(ROOT, p))).toBe(true)
  })

  it.each(FORBIDDEN_IDENTIFIERS)(
    'comment-stripped non-test src/, meta/ and src-tauri sources never name %s',
    (id) => {
      expect(identifierHits(loaded, [id])).toEqual([])
    }
  )

  it('the store rollback flag is not named anywhere in src/, meta/ or src-tauri/src, tests included', () => {
    const hits = flagFiles
      .filter((f) => namesFlag(readFileSync(f, 'utf8'), FLAG))
      .map((f) => relative(ROOT, f))
    expect(hits).toEqual([])
  })

  it('no non-test source imports conf', () => {
    expect(confImportHits(loaded)).toEqual([])
  })

  it('anti-vacuity: every walk scanned a real tree', () => {
    assertAtOrAboveFloor(
      'storeHostPortComplete files (src, meta)',
      tsFiles.length,
      TS_FILES_FLOOR
    )
    assertAtOrAboveFloor(
      'storeHostPortComplete rust files (src-tauri/src)',
      shellFiles.length,
      SHELL_FILES_FLOOR
    )
    assertAtOrAboveFloor(
      'storeHostPortComplete rust files (src-tauri/crates/*/src)',
      crateFiles.length,
      CRATE_FILES_FLOOR
    )
    assertAtOrAboveFloor(
      'storeHostPortComplete flag-scan files (tests included)',
      flagFiles.length,
      TS_FILES_FLOOR
    )
  })

  it('self-test: the flag scan matches the flag as a whole word only', () => {
    expect(namesFlag(`${FLAG}=ts pnpm tauri:dev`, FLAG)).toBe(true)
    expect(namesFlag(`env::var("${FLAG}")`, FLAG)).toBe(true)
    expect(namesFlag(`// under ${FLAG}, every read`, FLAG)).toBe(true)
    expect(namesFlag(`${FLAG}_BOOT`, FLAG)).toBe(false)
    expect(namesFlag(`X${FLAG}`, FLAG)).toBe(false)
  })

  it('self-test: a conf import in code is caught, in a comment it is not', () => {
    expect(
      confImportHits([{ path: 'a.ts', src: "import Conf from 'conf'" }])
    ).toEqual(['a.ts'])
    expect(
      confImportHits([
        { path: 'b.ts', src: 'import type { Options } from "conf"' }
      ])
    ).toEqual(['b.ts'])
    expect(
      confImportHits([
        { path: 'c.ts', src: "// import Conf from 'conf'\nconst x = 1" },
        { path: 'd.ts', src: "import x from 'config'" }
      ])
    ).toEqual([])
  })

  it('self-test: a deleted identifier in TS code is caught, the same text in a comment is not', () => {
    const hits = identifierHits(
      [
        { path: 'x.ts', src: 'new MigrationSystem(deps).applyMigrations()' },
        {
          path: 'y.ts',
          src: '// MigrationSystem was deleted (D-06)\n/* migrationsStore */\nconst q = 1'
        }
      ],
      FORBIDDEN_IDENTIFIERS
    )
    expect(hits).toEqual(['x.ts: MigrationSystem', 'x.ts: applyMigrations'])
  })

  it('self-test: a deleted identifier in Rust code is caught, in a trailing or doc comment it is not', () => {
    expect(
      identifierHits(
        [{ path: 'a.rs', src: 'let k = key_of("migrationsStore");' }],
        FORBIDDEN_IDENTIFIERS
      )
    ).toEqual(['a.rs: migrationsStore'])
    expect(
      identifierHits(
        [
          {
            path: 'b.rs',
            src: '/// migrationsStore was deleted\nfn f() { g(); } // MigrationSystem'
          }
        ],
        FORBIDDEN_IDENTIFIERS
      )
    ).toEqual([])
  })

  it('self-test: a deleted path that exists fails its check', () => {
    // This file exists, so the DELETED assertion's own predicate is true for it.
    expect(
      existsSync(
        join(ROOT, 'src/backend/__tests__/storeHostPortComplete.test.ts')
      )
    ).toBe(true)
  })

  it('self-test: an empty directory walks no files and fails the scan floor', () => {
    const dir = mkdtempSync(join(tmpdir(), 'store-host-port-complete-'))
    try {
      const found: string[] = []
      walk(dir, found, /\.(ts|rs)$/)
      expect(found).toHaveLength(0)
      expect(() =>
        assertAtOrAboveFloor(
          'storeHostPortComplete files (src, meta)',
          found.length,
          TS_FILES_FLOOR
        )
      ).toThrow(/storeHostPortComplete files/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
