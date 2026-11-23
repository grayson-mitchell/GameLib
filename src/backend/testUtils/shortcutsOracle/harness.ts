/**
 * The harness for the Phase 94 desktop-shortcut oracles (94-05, D-14, D-23).
 *
 * An oracle test drives the real TypeScript shortcut code (`addShortcuts`, `shortcutFiles`,
 * `sanitize-filename`, the exists predicate) on an isolated fake HOME and records what it wrote as
 * a golden under `src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/<slice>/<case>.json`.
 * The Rust writers are later held to those bytes. No expected value is typed by hand:
 * `GAMELIB_WRITE_SHORTCUTS_GOLDEN=1` writes the goldens from the TypeScript, and the default mode
 * compares against them (a hand edit therefore fails the compare run). `deltas.json` is the one
 * file the harness writes for a person: `recordDelta` notes a deliberate Rust difference.
 *
 * Fixture layout, per slice (`text`, `sanitize`, `paths`, `exists`):
 *   golden/<slice>/<case>.json     what the TypeScript produced for the case
 *   golden/<slice>/MANIFEST.json   { count, floor }
 *   golden/<slice>/deltas.json     case id -> a documented Rust-side difference (optional)
 *
 * Every recorded path is normalised to a placeholder so the Rust replay on any OS substitutes its
 * own fake home. The profile layout is the same on every OS, on purpose:
 *
 *   <HOME>      the fake HOME (`createFakeHomeProfile().root`)
 *   <APPDATA>   <HOME>/AppData/Roaming  (`paths.appData`, the Windows Start Menu root)
 *   <DESKTOP>   <HOME>/Desktop          (`paths.knownFolder('desktop')`)
 *   <ICONS>     <HOME>/.config/GameLib/icons  (`paths.heroicIconFolder`)
 *   <SHELL_EXE> <HOME>/shell-exe        (`paths.exe`, the path the macOS `run.sh` launches)
 *   <CWD>       the process working directory (never expected, normalised if a path names it)
 *
 * Host independence. The goldens are recorded on whichever host runs the write mode and compared
 * on every other (CI is ubuntu, the operator also records on Windows), so the harness removes the
 * two things a host adds: (1) path separators, `portablePath` turns a host `\` into `/` for the
 * macOS and Linux arms, which join with `path.join`; (2) file modes, a Windows disk reports 0666
 * for everything, so the mode a file was WRITTEN with is recorded from the call that asked for it
 * (`recordRequestedModes`: `writeFile`'s `mode` option and `chmodSync`), not read back from disk.
 * Requested modes are not masked by the umask, so they are the same on every host.
 *
 * Two-profile rule: every case runs on a fresh `createFakeHomeProfile()` and never reads the real
 * HOME, `~/Applications` or `~/Desktop`. The harness spawns nothing.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'fs'
import gracefulFs from 'graceful-fs'
import fsPromises from 'fs/promises'
import { deflateSync } from 'zlib'
import { dirname, join, resolve } from 'path'
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import * as environment from 'backend/constants/environment'
import {
  createFakeHomeProfile,
  type FakeHomeProfile
} from 'backend/testUtils/fakeHomeProfile'

export type ShortcutsOraclePlatform = 'darwin' | 'linux' | 'win32'
export type ShortcutsGoldenMode = 'write' | 'compare'

/** The crate the goldens live in. */
const CRATE = 'gamelib-shortcuts'

let goldenRootOverride: string | null = null

/**
 * Test-only: points every golden path at `dir` (a temp directory) so the harness self-tests can
 * write and compare goldens without touching the committed crate. Returns the restore function.
 */
export function overrideGoldenRoot(dir: string): () => void {
  goldenRootOverride = dir
  return () => {
    goldenRootOverride = null
  }
}

/** `<crate>/tests/fixtures/golden`, or the override. */
function goldenRoot(): string {
  return (
    goldenRootOverride ??
    join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'src-tauri',
      'crates',
      CRATE,
      'tests',
      'fixtures',
      'golden'
    )
  )
}

export const goldenDir = (slice: string): string => join(goldenRoot(), slice)

/** `GAMELIB_WRITE_SHORTCUTS_GOLDEN=1` writes the goldens, anything else compares. */
export function shortcutsGoldenMode(): ShortcutsGoldenMode {
  return process.env.GAMELIB_WRITE_SHORTCUTS_GOLDEN === '1'
    ? 'write'
    : 'compare'
}

/** The AppPaths members the shortcut code reads, over the profile layout above. */
interface ShortcutsOraclePaths {
  readonly exe: string
  readonly appData: string
  readonly userHome: string
  readonly heroicIconFolder: string
  readonly knownFolder: (name: 'desktop' | 'documents') => string
}

export interface ShortcutsOracleProfile {
  /** The isolated fake HOME and its disposer (the eight home variables all point inside it). */
  readonly fake: FakeHomeProfile
  readonly home: string
  readonly appData: string
  readonly desktop: string
  readonly icons: string
  readonly shellExe: string
  readonly paths: ShortcutsOraclePaths
}

function buildProfile(fake: FakeHomeProfile): ShortcutsOracleProfile {
  const home = fake.root
  const desktop = join(home, 'Desktop')
  const icons = join(home, '.config', 'GameLib', 'icons')
  const appData = fake.env.APPDATA
  const shellExe = join(home, 'shell-exe')
  return {
    fake,
    home,
    appData,
    desktop,
    icons,
    shellExe,
    paths: {
      exe: shellExe,
      appData,
      userHome: home,
      heroicIconFolder: icons,
      knownFolder: (name) =>
        join(home, name === 'desktop' ? 'Desktop' : 'Documents')
    }
  }
}

/**
 * Runs `fn` over a fresh fake HOME profile (one per case, never reused) and disposes it afterwards,
 * whatever `fn` did. The icons folder's parent exists, as it does in a booted app (`getIcon` creates
 * the folder itself but not its parent).
 */
export async function withShortcutsOracleProfile<T>(
  fn: (profile: ShortcutsOracleProfile) => Promise<T> | T
): Promise<T> {
  const fake = createFakeHomeProfile({ prefix: 'gamelib-shortcuts-oracle-' })
  try {
    const profile = buildProfile(fake)
    mkdirSync(dirname(profile.icons), { recursive: true })
    return await fn(profile)
  } finally {
    fake.dispose()
  }
}

/**
 * Makes the host say it is `platform`: `process.platform` (the shortcut code switches on it) and the
 * `backend/constants/environment` flags (read at call time). Returns the restore function.
 * `jest.replaceProperty` for the flags, not a module mock: the jestMock ratchet counts `jest.mock`.
 */
export function mockPlatform(platform: ShortcutsOraclePlatform): () => void {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true
  })
  const replaced = [
    jest.replaceProperty(environment, 'isMac', platform === 'darwin'),
    jest.replaceProperty(environment, 'isLinux', platform === 'linux'),
    jest.replaceProperty(environment, 'isWindows', platform === 'win32')
  ]
  return () => {
    for (const r of replaced) r.restore()
    if (original) Object.defineProperty(process, 'platform', original)
  }
}

/** The placeholder table, most specific root first; a realpath twin is added when it differs. */
function placeholders(
  profile: ShortcutsOracleProfile
): readonly (readonly [string, string])[] {
  const roots: [string, string][] = [
    ['<SHELL_EXE>', profile.shellExe],
    ['<ICONS>', profile.icons],
    ['<DESKTOP>', profile.desktop],
    ['<APPDATA>', profile.appData],
    ['<HOME>', profile.home]
  ]
  const table: [string, string][] = [...roots]
  // macOS reports a temp directory through its real path (`/private/var/...`), Windows can report
  // an 8.3 short name; a path a library prints may name that form instead of the one given.
  const real = realpathSync(profile.home)
  if (real !== profile.home) {
    for (const [token, root] of roots) {
      table.push([token, join(real, root.slice(profile.home.length))])
    }
  }
  if (process.cwd().length > 1) table.push(['<CWD>', process.cwd()])
  return table
}

/**
 * Replaces every profile root in `value` (strings, array items, object values; not object keys)
 * with its placeholder and leaves every other string alone. Roots only: it never touches a
 * separator, so a recorded file's bytes are unaltered.
 */
export function normalisePaths<T>(
  value: T,
  profile: ShortcutsOracleProfile
): T {
  const table = placeholders(profile)
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') {
      let out = node
      for (const [token, root] of table) out = out.split(root).join(token)
      return out
    }
    if (Array.isArray(node)) return node.map(walk)
    if (node !== null && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node as Record<string, unknown>).map(([k, v]) => [
          k,
          walk(v)
        ])
      )
    }
    return node
  }
  return walk(value) as T
}

/**
 * A path the macOS or Linux arm built with `path.join`, in the form it has on a POSIX host. Applied
 * to path fields only (never file contents, where a backslash may be part of a title).
 */
export function portablePath(path: string): string {
  return path.split('\\').join('/')
}

/** The inverse of `normalisePaths` for one string, so a seed path can start with a placeholder. */
export function expandPlaceholders(
  text: string,
  profile: ShortcutsOracleProfile
): string {
  let out = text
  for (const [token, root] of [
    ['<SHELL_EXE>', profile.shellExe],
    ['<ICONS>', profile.icons],
    ['<DESKTOP>', profile.desktop],
    ['<APPDATA>', profile.appData],
    ['<HOME>', profile.home]
  ] as const) {
    out = out.split(token).join(root)
  }
  return out
}

/** A valid solid-colour RGBA PNG of `size` pixels square, for the icon conversion's input. */
export function makePng(size: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf: Buffer): number => {
    let c = 0xffffffff
    for (const byte of buf) c = (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const check = Buffer.alloc(4)
    check.writeUInt32BE(crc(body))
    return Buffer.concat([length, body, check])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 4, 0x7f)])
  const raw = Buffer.concat(Array.from({ length: size }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/**
 * The `imageTools` fake for a with-icon macOS case: `createFromBuffer(...)` always yields a 64 px
 * PNG, the size the `ic11` element wants, whatever the input. The conversion geometry is 94-07's.
 */
export function createFakeImageTools(): {
  createFromBuffer: (buffer: Buffer) => unknown
  createFromDataURL: (url: string) => unknown
} {
  const png = makePng(64)
  const image = {
    resize: () => image,
    crop: () => image,
    toPNG: () => png
  }
  return {
    createFromBuffer: () => image,
    createFromDataURL: () => image
  }
}

/** A requested file mode, per absolute path, as the TypeScript asked the OS for it. */
export interface RequestedModes {
  /** The octal mode last requested for `path` (`"0755"`), or `undefined`. */
  get(path: string): string | undefined
  restore(): void
}

const octal = (mode: number | string): string =>
  `0${(typeof mode === 'string' ? parseInt(mode, 8) : mode).toString(8)}`

/**
 * Records the mode each shortcut file was written with. `writeFile(file, data, { mode })` and
 * `chmodSync(file, mode)` are spied (`jest.spyOn`, which is not a module mock) and still call
 * through, so the write happens as it does in the app.
 */
export function recordRequestedModes(): RequestedModes {
  const modes = new Map<string, string>()
  const realWriteFile = fsPromises.writeFile.bind(fsPromises)
  const writeFileSpy = jest
    .spyOn(fsPromises, 'writeFile')
    .mockImplementation((file, data, options) => {
      if (
        typeof file === 'string' &&
        options !== null &&
        typeof options === 'object' &&
        'mode' in options &&
        options.mode !== undefined
      ) {
        modes.set(resolve(file), octal(options.mode))
      }
      return realWriteFile(file, data, options)
    })
  const realChmod = gracefulFs.chmodSync
  const chmodSpy = jest
    .spyOn(gracefulFs, 'chmodSync')
    .mockImplementation((path, mode) => {
      if (typeof path === 'string') modes.set(resolve(path), octal(mode))
      return realChmod(path, mode)
    })
  return {
    get: (path) => modes.get(resolve(path)),
    restore: () => {
      writeFileSpy.mockRestore()
      chmodSpy.mockRestore()
    }
  }
}

/** One leaf of a recorded tree. */
export interface TreeEntry {
  /** Path relative to the snapshot root, `/`-separated. */
  path: string
  kind: 'file' | 'symlink'
  /** The mode the file was written with (`"0755"`), or null when none was requested. */
  mode?: string | null
  /** The file's text when it round-trips as UTF-8. */
  utf8?: string
  /** The file's bytes, when they are not valid UTF-8. */
  base64?: string
  /** A symlink's target, normalised. */
  symlinkTarget?: string
  /** True for a file whose bytes are deliberately not recorded (the generated `.icns`). */
  opaque?: true
}

export interface ReadTreeOptions {
  profile: ShortcutsOracleProfile
  modes: RequestedModes
  /** Files (by relative path) whose content is recorded as present but opaque. */
  opaque?: (relPath: string) => boolean
}

function walkLeaves(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walkLeaves(full, out)
    else out.push(full)
  }
}

/**
 * Every file and symlink under `root`, sorted by path, as `TreeEntry`. A symlink is not followed
 * (a dangling one is a leaf). A root that does not exist yields no entries. Contents are
 * normalised for the profile's roots; modes come from `options.modes`.
 */
export function readTree(root: string, options: ReadTreeOptions): TreeEntry[] {
  if (!existsSync(root) && !isLink(root)) return []
  const leaves: string[] = []
  walkLeaves(root, leaves)
  // A symlink to a directory is reported by readdir as a symlink (not a directory) and so is
  // already a leaf; nothing below it is walked.
  const entries: TreeEntry[] = leaves.map((full) => {
    const rel = portablePath(full.slice(root.length + 1))
    if (lstatSync(full).isSymbolicLink()) {
      return {
        path: rel,
        kind: 'symlink' as const,
        symlinkTarget: portablePath(
          normalisePaths(readlinkSync(full), options.profile)
        )
      }
    }
    if (options.opaque?.(rel)) {
      return { path: rel, kind: 'file' as const, opaque: true as const }
    }
    const bytes = readFileSync(full)
    const text = bytes.toString('utf8')
    const entry: TreeEntry = {
      path: rel,
      kind: 'file',
      mode: options.modes.get(full) ?? null
    }
    if (Buffer.from(text, 'utf8').equals(bytes)) {
      entry.utf8 = normalisePaths(text, options.profile)
    } else {
      entry.base64 = bytes.toString('base64')
    }
    return entry
  })
  return entries.sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0
  )
}

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

/** A golden file name must be one plain segment; a case id is built from ASCII ids and `-`. */
function assertCaseId(caseId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(caseId)) {
    throw new Error(
      `golden case id ${JSON.stringify(caseId)} is not a plain name`
    )
  }
}

/**
 * Write mode: writes `<slice>/<caseId>.json` from `value`. Compare mode: asserts the committed file
 * holds exactly the same text, so a hand edit of a golden (or a change in the TypeScript) fails.
 */
export function writeOrCompareGolden(
  slice: string,
  caseId: string,
  value: unknown,
  mode: ShortcutsGoldenMode = shortcutsGoldenMode()
): void {
  assertCaseId(caseId)
  const file = join(goldenDir(slice), `${caseId}.json`)
  const text = json(value)
  if (mode === 'write') {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, text)
    return
  }
  if (!existsSync(file)) {
    throw new Error(
      `${slice}/${caseId}: golden is missing, record it with GAMELIB_WRITE_SHORTCUTS_GOLDEN=1`
    )
  }
  expect(text).toBe(readFileSync(file, 'utf8'))
}

interface Manifest {
  count: number
  floor: number
}

function readManifest(slice: string): Manifest | null {
  const file = join(goldenDir(slice), 'MANIFEST.json')
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8')) as Manifest
}

/**
 * Write mode: records `{ count, floor }` for the slice and removes goldens no case produces any
 * more. The floor is the one already committed (never lowered by a rewrite) or, for a new slice,
 * `defaultFloor`. Compare mode does nothing.
 */
export function syncManifest(
  slice: string,
  caseIds: readonly string[],
  defaultFloor: number,
  mode: ShortcutsGoldenMode = shortcutsGoldenMode()
): void {
  if (mode !== 'write') return
  const existing = readManifest(slice)
  const manifest: Manifest = {
    count: caseIds.length,
    floor: Math.max(existing?.floor ?? 0, defaultFloor)
  }
  mkdirSync(goldenDir(slice), { recursive: true })
  writeFileSync(join(goldenDir(slice), 'MANIFEST.json'), json(manifest))
  const keep = new Set(caseIds)
  for (const id of committedCaseIds(slice)) {
    if (!keep.has(id)) rmSync(join(goldenDir(slice), `${id}.json`))
  }
}

/** The golden case ids on disk for `slice`, sorted (MANIFEST and deltas excluded). */
function committedCaseIds(slice: string): string[] {
  const dir = goldenDir(slice)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(
      (name) =>
        name.endsWith('.json') &&
        name !== 'MANIFEST.json' &&
        name !== 'deltas.json'
    )
    .map((name) => name.slice(0, -'.json'.length))
    .sort()
}

/**
 * The vacuous-pass guard (82 D-05): the case list is at or above the floor the test itself carries
 * (`minFloor`, so lowering the JSON alone cannot weaken it), the committed MANIFEST agrees with it
 * (`count` equals the cases, `floor` is not below `minFloor`), and the slice folder holds exactly one
 * golden per case. Compare mode only for the on-disk checks.
 */
export function assertManifest(
  slice: string,
  caseIds: readonly string[],
  minFloor: number,
  mode: ShortcutsGoldenMode = shortcutsGoldenMode()
): void {
  assertAtOrAboveFloor(`${slice} oracle cases`, caseIds.length, minFloor)
  if (mode !== 'compare') return
  const manifest = readManifest(slice)
  if (!manifest) throw new Error(`${slice}: MANIFEST.json is missing`)
  assertAtOrAboveFloor(
    `${slice} oracle manifest floor`,
    manifest.floor,
    minFloor
  )
  expect(manifest.count).toBe(caseIds.length)
  assertAtOrAboveFloor(`${slice} oracle cases`, caseIds.length, manifest.floor)
  expect(new Set(caseIds).size).toBe(caseIds.length)
  // A case-insensitive disk (Windows, default macOS) would fold two such goldens into one file.
  expect(new Set(caseIds.map((id) => id.toLowerCase())).size).toBe(
    caseIds.length
  )
  expect(committedCaseIds(slice)).toEqual([...caseIds].sort())
}

/** Test-only: an empty case list must fail the floor guard. Each oracle test calls it. */
export function expectEmptyCasesToFail(slice: string, minFloor: number): void {
  expect(() => assertManifest(slice, [], minFloor, 'compare')).toThrow(
    /below the floor/
  )
}

/**
 * Notes a deliberate difference the Rust port will have from the TypeScript for one case (D-19)
 * in `<slice>/deltas.json`, keeping the file sorted. The only golden file written by hand-driven
 * code; the reason is mandatory.
 */
export function recordDelta(
  slice: string,
  caseId: string,
  reason: string
): void {
  assertCaseId(caseId)
  if (reason.trim().length === 0) {
    throw new Error(`recordDelta ${slice}/${caseId}: a delta needs a reason`)
  }
  const file = join(goldenDir(slice), 'deltas.json')
  const current: Record<string, string> = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>)
    : {}
  current[caseId] = reason
  const sorted = Object.fromEntries(
    Object.entries(current).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  )
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, json(sorted))
}
