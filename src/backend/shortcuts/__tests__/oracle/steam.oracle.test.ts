/**
 * The Add to Steam oracle (94-07, D-12, D-23): what the TypeScript does to Steam's per-user
 * `shortcuts.vdf` and `grid/` art when a game is added, checked and removed, recorded as the goldens
 * the Rust port replays on every OS (Windows and Linux are proven by CI golden replay only, D-11).
 *
 * The real `addNonSteamGame`, `isAddedToSteam` and `removeNonSteamGame` run over a fake Steam
 * `userdata` tree inside a fresh `createFakeHomeProfile()`. Everything outside them is a recording
 * fake, so no case can touch a real Steam install, icon folder or network (T-94-12):
 *
 *   - the steamfiles channels: `requestRustInvoke` records the arguments the TS sends and answers
 *     `shortcuts_read` from the vdf the case placed (a reader of the binary format that gives the
 *     crate's summary: key match ignoring case, `hasAppName` and friends, list-ness of the root),
 *     and `shortcuts_apply` from a scripted outcome (the crate's edit is its own tests' business);
 *   - the wiki lookup answers a scripted Steam id (`pcgamingwiki`, `gamesdb`, none, or a rejection);
 *   - downloads: `downloadFile` is replaced, recording `{url, dest}` and writing `downloaded:<url>`;
 *   - the dialog, notification and `i18next.t` calls are recorded as key, default text and params,
 *     and the default text is rendered the way the English bundle does.
 *
 * Families (the id prefix names the family):
 *   ids-    the CRC32 ids (`generateShortcutId`, `generateAppId`, `generateShortAppId`) over vectors
 *   add-    `addNonSteamGame`     isadded-  `isAddedToSteam`     remove-  `removeNonSteamGame`
 *
 * Host independence: the shell exe, the AppImage and the portable-exe values are fixed strings (the
 * CRC id is computed from `Exe`, so a profile path would change every id), `StartDir` is `<CWD>`,
 * `Date` is frozen, and every recorded path field is `/`-separated under placeholders.
 *
 * Modes (see testUtils/shortcutsOracle/harness.ts):
 *   GAMELIB_WRITE_SHORTCUTS_GOLDEN=1   rewrite every golden from the TypeScript
 *   (default)                          recompute and compare, offline
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'fs'
import { dirname, join } from 'path'
import i18next from 'i18next'
import * as backendUtils from 'backend/utils'
import * as environment from 'backend/constants/environment'
import {
  addNonSteamGame,
  isAddedToSteam,
  removeNonSteamGame
} from '../../nonesteamgame/nonesteamgame'
import {
  generateAppId,
  generateShortAppId,
  generateShortcutId
} from '../../nonesteamgame/steamhelper'
import {
  RUST_INFO_WIKI_GET,
  RUST_STEAMFILES_SHORTCUTS_APPLY,
  RUST_STEAMFILES_SHORTCUTS_READ
} from 'common/types/sidecarTransport'
import {
  assertManifest,
  expectEmptyCasesToFail,
  mockPlatform,
  normalisePaths,
  portablePath,
  syncManifest,
  withShortcutsOracleProfile,
  writeOrCompareGolden,
  type ShortcutsOraclePlatform,
  type ShortcutsOracleProfile
} from 'backend/testUtils/shortcutsOracle/harness'
import type { Game } from 'common/types/game_manager'

const SLICE = 'steam'
/** The case count this plan commits; a later edit may raise it, never lower it. */
const FLOOR = 20

const TEST_DATA = join(
  __dirname,
  '..',
  '..',
  'nonesteamgame',
  '__tests__',
  'test_data'
)

/** The wall clock every case runs under (the `LastPlayTime` of a game never played). */
const FROZEN_NOW = new Date('2024-02-03T04:05:06.000Z')

// ------------------------------------------------------------------ the vdf

interface BinSummary {
  exists: boolean
  parsed: boolean
  readError: string | null
  hasShortcutsRoot: boolean
  rootIsList: boolean
  entries: {
    indexKey: string
    appName: string | null
    exe: string | null
    launchOptions: string | null
    hasAppName: boolean
    hasExe: boolean
    hasLaunchOptions: boolean
  }[]
}

type BinNode = string | number | BinMap
type BinMap = [string, BinNode][]

class BinError extends Error {
  constructor(
    readonly kind: string,
    readonly offset: number
  ) {
    super(kind)
  }
}

/** The binary `shortcuts.vdf` tree: maps, strings and int32s; anything else is a typed parse error. */
function parseBin(bytes: Buffer): BinMap {
  let pos = 0
  const byte = (): number => {
    const b = bytes[pos]
    if (b === undefined) throw new BinError('Truncated', pos)
    pos += 1
    return b
  }
  const cstr = (): string => {
    const end = bytes.indexOf(0, pos)
    if (end < 0) throw new BinError('Truncated', pos)
    const text = bytes.subarray(pos, end).toString('utf8')
    pos = end + 1
    return text
  }
  const map = (): BinMap => {
    const out: BinMap = []
    for (;;) {
      const at = pos
      const type = byte()
      if (type === 0x08) return out
      const key = cstr()
      if (type === 0x00) out.push([key, map()])
      else if (type === 0x01) out.push([key, cstr()])
      else if (type === 0x02) {
        if (pos + 4 > bytes.length) throw new BinError('Truncated', pos)
        out.push([key, bytes.readInt32LE(pos)])
        pos += 4
      } else throw new BinError(`UnknownType(${type})`, at)
    }
  }
  return map()
}

const findCi = (map: BinMap, key: string): BinNode | undefined =>
  map.find(([k]) => k.toLowerCase() === key)?.[1]

const strOf = (node: BinNode | undefined): string | null =>
  typeof node === 'string' ? node : null

/** What `gamelib-steamfiles` `read_shortcuts` reports for `path`. */
function readShortcuts(path: string): BinSummary {
  const none: BinSummary = {
    exists: false,
    parsed: false,
    readError: null,
    hasShortcutsRoot: false,
    rootIsList: false,
    entries: []
  }
  if (!existsSync(path)) return none
  let doc: BinMap
  try {
    doc = parseBin(readFileSync(path))
  } catch (error) {
    if (!(error instanceof BinError)) throw error
    return {
      ...none,
      exists: true,
      readError: `parse: BinError { kind: ${error.kind}, offset: ${error.offset} }`
    }
  }
  const out: BinSummary = { ...none, exists: true, parsed: true }
  const root = findCi(doc, 'shortcuts')
  if (!Array.isArray(root)) return out
  out.hasShortcutsRoot = true
  out.rootIsList = root.every(
    ([k, v]) => /^[0-9]+$/.test(k) && Array.isArray(v)
  )
  for (const [indexKey, value] of root) {
    if (!Array.isArray(value)) continue
    out.entries.push({
      indexKey,
      appName: strOf(findCi(value, 'appname')),
      exe: strOf(findCi(value, 'exe')),
      launchOptions: strOf(findCi(value, 'launchoptions')),
      hasAppName: findCi(value, 'appname') !== undefined,
      hasExe: findCi(value, 'exe') !== undefined,
      hasLaunchOptions: findCi(value, 'launchoptions') !== undefined
    })
  }
  return out
}

// -------------------------------------------------------------------- cases

type VdfSource =
  | { file: string }
  | { garbage: true }
  | { truncatedValid: true }
  | { absent: true }

interface UserSpec {
  /** Whether `config/` exists (default true). */
  config?: boolean
  vdf?: VdfSource
  /** Files in `config/grid/`, relative names. Seeded as `seed` bytes. */
  grid?: string[]
}

type WikiAnswer = { value: unknown } | { rejects: string }

type ApplyScript =
  | 'ok'
  | 'already-present'
  | 'not-written-read-error'
  | 'not-written-silent'
  | 'throws'

type DownloadScript = 'ok' | 'fail-all' | 'fail-icon'

interface ArtSpec {
  square: string
  cover: string
  logo?: string
}

interface SteamCase {
  id: string
  op: 'add' | 'isAdded' | 'remove'
  platform: ShortcutsOraclePlatform
  flatpak: boolean
  appImage: boolean
  portable: boolean
  title: string
  appName: string
  runner: string
  art: ArtSpec
  /** The user folders under `userdata`, in creation order. */
  users: Record<string, UserSpec>
  /** `userdata` itself exists (default true). */
  userdata: boolean
  /** A plain file sits in `userdata` next to the user folders. */
  strayFile: boolean
  /** The configured Steam path carries the trailing `'` the setting can hold. */
  quotedPath: boolean
  lastPlayed: { present: false } | { present: true; value: unknown }
  wiki: WikiAnswer
  apply: ApplyScript
  download: DownloadScript
  /** The icon file `getIcon` looks for already exists in the icon folder. */
  iconExists: boolean
  /** remove: grid files for the removed entry are seeded under these suffixes. */
  seedRemovedGrid: string[]
}

const NO_STEAM_ID: WikiAnswer = { value: null }
const DEFAULT_ART: ArtSpec = {
  square: 'https://art.example.test/square 1.{ext}',
  cover: 'https://art.example.test/cover.jpg'
}

/** A 1x1 stand-in the data-URL art case "converts" (the image shim is faked). */
const DATA_URL = 'data:image/png;base64,iVBORw0KGgo='

const VALID: UserSpec = { vdf: { file: 'shortcuts_valid.vdf' } }

function cases(): SteamCase[] {
  const out: SteamCase[] = []
  const base = (
    id: string,
    op: SteamCase['op'],
    patch: Partial<SteamCase>
  ): void => {
    out.push({
      id: `${op === 'isAdded' ? 'isadded' : op}-${id}`,
      op,
      platform: 'linux',
      flatpak: false,
      appImage: false,
      portable: false,
      title: 'Oracle Game',
      appName: 'oracle-app',
      runner: 'legendary',
      art: DEFAULT_ART,
      users: { '1001': {} },
      userdata: true,
      strayFile: false,
      quotedPath: false,
      lastPlayed: { present: true, value: '2023-11-14T22:13:20.000Z' },
      wiki: NO_STEAM_ID,
      apply: 'ok',
      download: 'ok',
      iconExists: false,
      seedRemovedGrid: [],
      ...patch
    })
  }
  const add = (id: string, patch: Partial<SteamCase> = {}): void =>
    base(id, 'add', patch)
  const isAdded = (id: string, patch: Partial<SteamCase> = {}): void =>
    base(id, 'isAdded', patch)
  const remove = (id: string, patch: Partial<SteamCase> = {}): void =>
    base(id, 'remove', patch)

  // ----- add: the entry, per platform and launch environment
  add('linux-basic')
  add('darwin', { platform: 'darwin' })
  add('win32', { platform: 'win32' })
  add('flatpak', { flatpak: true })
  add('appimage', { appImage: true })
  add('flatpak-beats-appimage', { flatpak: true, appImage: true })
  add('win32-portable', { platform: 'win32', portable: true })
  add('linux-portable-env-ignored', { portable: true })
  add('win32-appimage-ignored', { platform: 'win32', appImage: true })
  // ----- add: the Steam id from the wiki
  add('steamid-pcgw', {
    wiki: { value: { pcgamingwiki: { steamID: '292030' } } }
  })
  add('steamid-gamesdb-only', {
    wiki: { value: { gamesdb: { steamID: '730' } } }
  })
  add('steamid-both-pcgw-wins', {
    wiki: {
      value: {
        pcgamingwiki: { steamID: '292030' },
        gamesdb: { steamID: '730' }
      }
    }
  })
  add('wiki-empty-object', { wiki: { value: {} } })
  add('wiki-rejects', { wiki: { rejects: 'wiki lookup failed' } })
  add('steamid-with-art-logo', {
    wiki: { value: { pcgamingwiki: { steamID: '292030' } } },
    art: { ...DEFAULT_ART, logo: 'https://art.example.test/logo.png' }
  })
  // ----- add: LastPlayTime from `${appName}.lastPlayed`
  add('lastplayed-absent', { lastPlayed: { present: false } })
  add('lastplayed-epoch-ms', {
    lastPlayed: { present: true, value: 1_700_000_000_000 }
  })
  add('lastplayed-empty-string', {
    lastPlayed: { present: true, value: '' }
  })
  add('lastplayed-zero', { lastPlayed: { present: true, value: 0 } })
  add('lastplayed-not-a-date', {
    lastPlayed: { present: true, value: 'not a date' }
  })
  add('lastplayed-sub-second', {
    lastPlayed: { present: true, value: '2023-11-14T22:13:20.999Z' }
  })
  // ----- add: names
  add('title-unicode-quotes', {
    title: 'Jörg\'s "Quest" 幻想 \u{1F3AE}',
    appName: 'jorg'
  })
  add('launch-options-hostile-app-name', {
    appName: 'a b"c&d=e#f',
    runner: 'r;touch pwned'
  })
  add('runner-gog', { runner: 'gog' })
  // ----- add: the userdata folders
  add('two-users', { users: { '1001': {}, '1002': {} } })
  add('skips-0-and-ac-and-files', {
    users: { '0': {}, ac: {}, '1001': {} },
    strayFile: true
  })
  add('user-without-config-dir', { users: { '1001': { config: false } } })
  add('quoted-steam-path', { quotedPath: true })
  add('missing-userdata', { userdata: false })
  add('only-0-and-ac', { users: { '0': {}, ac: {} } })
  // ----- add: the existing shortcuts.vdf
  add('existing-title-is-skipped', {
    title: 'Discord',
    users: { '1001': VALID }
  })
  add('existing-in-one-user-new-in-other', {
    title: 'Discord',
    users: { '1001': VALID, '1002': {} }
  })
  add('existing-title-case-differs-is-added', {
    title: 'discord',
    users: { '1001': VALID }
  })
  add('other-entries-present', {
    users: { '1001': { vdf: { file: 'shortcuts_redromnon.vdf' } } }
  })
  add('invalid-missing-appname', {
    users: { '1001': { vdf: { file: 'shortcuts_missing_appname.vdf' } } }
  })
  add('invalid-missing-exe', {
    users: { '1001': { vdf: { file: 'shortcuts_missing_exe.vdf' } } }
  })
  add('invalid-missing-launchoptions', {
    users: {
      '1001': { vdf: { file: 'shortcuts_missing_launchoptions.vdf' } }
    }
  })
  add('invalid-garbage-file', {
    users: { '1001': { vdf: { garbage: true } } }
  })
  add('invalid-truncated-file', {
    users: { '1001': { vdf: { truncatedValid: true } } }
  })
  add('one-invalid-one-good', {
    users: {
      '1001': { vdf: { file: 'shortcuts_missing_exe.vdf' } },
      '1002': {}
    }
  })
  add('lowercase-appname-key-is-valid', {
    title: 'Oracle Game',
    users: { '1001': { vdf: { file: 'shortcuts_felipecrs.vdf' } } }
  })
  // ----- add: what the apply answers
  add('apply-already-present', { apply: 'already-present' })
  add('apply-not-written-read-error', { apply: 'not-written-read-error' })
  add('apply-not-written-silent', { apply: 'not-written-silent' })
  add('apply-throws', { apply: 'throws' })
  add('apply-fails-in-one-user-only', {
    users: { '1001': {}, '1002': {} },
    apply: 'not-written-read-error'
  })
  // ----- add: icon and grid art
  add('icon-exists', { iconExists: true })
  add('icon-download-fails', { download: 'fail-icon' })
  add('art-downloads-fail', { download: 'fail-all' })
  add('art-no-urls', { art: { square: '', cover: '' } })
  add('art-data-url-square', { art: { ...DEFAULT_ART, square: DATA_URL } })
  add('art-existing-jpg-skipped', {
    users: { '1001': { grid: ['SHORT.jpg', 'SHORTp.jpg'] } }
  })
  add('art-existing-png-counts', {
    users: { '1001': { grid: ['SHORTp.png', 'SHORT_hero.png'] } }
  })
  add('art-logo-from-game', {
    art: { ...DEFAULT_ART, logo: 'https://art.example.test/logo.png' }
  })
  // ----- isAdded
  isAdded('true', { title: 'Discord', users: { '1001': VALID } })
  isAdded('false-title-absent', { users: { '1001': VALID } })
  isAdded('true-in-second-user', {
    title: 'Discord',
    users: { '1001': {}, '1002': VALID }
  })
  isAdded('invalid-file-is-false', {
    title: 'MyGame',
    users: { '1001': { vdf: { file: 'shortcuts_missing_launchoptions.vdf' } } }
  })
  isAdded('garbage-file-is-false', {
    users: { '1001': { vdf: { garbage: true } } }
  })
  isAdded('no-shortcuts-file', { users: { '1001': {} } })
  isAdded('no-config-dir', { users: { '1001': { config: false } } })
  isAdded('missing-userdata', { userdata: false })
  isAdded('skips-0-and-ac', {
    title: 'Discord',
    users: { '0': VALID, ac: VALID, '1001': {} }
  })
  // ----- remove
  remove('basic', {
    title: 'Discord',
    users: { '1001': VALID },
    seedRemovedGrid: ['p.jpg', '.jpg', '_hero.jpg', '_logo.jpg', 'big']
  })
  remove('keeps-the-other-entries', {
    title: 'Inside',
    users: { '1001': { vdf: { file: 'shortcuts_redromnon.vdf' } } },
    seedRemovedGrid: ['p.jpg', '.jpg', '_hero.jpg', '_logo.jpg', 'big']
  })
  remove('grid-png-only-is-not-removed', {
    title: 'Discord',
    users: { '1001': VALID },
    seedRemovedGrid: ['p.png']
  })
  remove('no-grid-folder', { title: 'Discord', users: { '1001': VALID } })
  remove('not-listed-is-silent', { users: { '1001': VALID } })
  remove('two-users-one-has-it', {
    title: 'Discord',
    users: { '1001': VALID, '1002': {} },
    seedRemovedGrid: ['p.jpg']
  })
  remove('invalid-file', {
    title: 'MyGame',
    users: { '1001': { vdf: { file: 'shortcuts_missing_exe.vdf' } } }
  })
  remove('garbage-file', { users: { '1001': { vdf: { garbage: true } } } })
  remove('no-shortcuts-file', { users: { '1001': {} } })
  remove('missing-userdata-is-silent', { userdata: false })
  remove('apply-not-written-read-error', {
    title: 'Discord',
    users: { '1001': VALID },
    apply: 'not-written-read-error'
  })
  remove('apply-not-written-silent', {
    title: 'Discord',
    users: { '1001': VALID },
    apply: 'not-written-silent'
  })
  remove('apply-throws', {
    title: 'Discord',
    users: { '1001': VALID },
    apply: 'throws'
  })
  remove('skips-0-and-ac', {
    title: 'Discord',
    users: { '0': VALID, ac: VALID, '1001': VALID }
  })
  return out
}

interface IdCase {
  id: string
  exe: string
  appName: string
}

const ID_CASES: IdCase[] = [
  {
    id: 'ids-linux',
    exe: '"/opt/GameLibOracle/GameLib"',
    appName: 'Oracle Game'
  },
  { id: 'ids-empty', exe: '', appName: '' },
  { id: 'ids-flatpak', exe: '"flatpak"', appName: 'Oracle Game' },
  {
    id: 'ids-win32',
    exe: '"C:\\Program Files\\GameLibOracle\\GameLib.exe"',
    appName: 'Oracle Game'
  },
  {
    id: 'ids-unicode',
    exe: '"/opt/GameLibOracle/GameLib"',
    appName: '幻想 \u{1F3AE}'
  },
  { id: 'ids-quotes', exe: '"x"', appName: 'a"b\'c' },
  {
    id: 'ids-discord',
    exe: '"/usr/share/discord/Discord"',
    appName: 'Discord'
  },
  {
    id: 'ids-fall-guys',
    exe: '"/opt/oracle/GameFiles/FallGuys_Heroic.sh"',
    appName: 'Fall Guys'
  },
  { id: 'ids-long', exe: `"${'x'.repeat(300)}"`, appName: 'y'.repeat(300) }
]

const CASES = cases()

// -------------------------------------------------------------------- driver

const SHELL_EXE: Record<ShortcutsOraclePlatform, string> = {
  linux: '/opt/GameLibOracle/GameLib',
  darwin: '/Applications/GameLibOracle.app/Contents/MacOS/GameLib',
  win32: 'C:\\Program Files\\GameLibOracle\\GameLib.exe'
}
const APPIMAGE = '/opt/GameLibOracle/GameLib.AppImage'
const PORTABLE_FILE = 'C:\\Oracle\\Portable\\GameLib-portable.exe'
const PORTABLE_DIR = 'C:\\Oracle\\Portable'

const pp = (text: string, profile: ShortcutsOracleProfile): string =>
  portablePath(normalisePaths(text, profile))

/** A placeholder and the rest of its path, up to a quote or a line end (a message quotes its paths). */
const PLACEHOLDER_PATH =
  /(<(?:HOME|ICONS|CWD|APPDATA|DESKTOP|SHELL_EXE)>)([^"\n]*)/g

/**
 * Messages carry paths built with the host's separator; the placeholder's path is made `/`-separated
 * so a Windows and a POSIX run record the same text. Nothing outside a placeholder path is touched.
 */
function messagePaths<T>(value: T, profile: ShortcutsOracleProfile): T {
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') {
      return normalisePaths(node, profile).replace(
        PLACEHOLDER_PATH,
        (_whole, token: string, rest: string) => `${token}${portablePath(rest)}`
      )
    }
    if (Array.isArray(node)) return node.map(walk)
    if (node !== null && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node).map(([k, v]) => [k, walk(v)])
      )
    }
    return node
  }
  return walk(value) as T
}

/** Writes a case's `shortcuts.vdf` from its source. */
function seedVdf(path: string, source: VdfSource): void {
  if ('absent' in source) return
  const valid = readFileSync(join(TEST_DATA, 'shortcuts_valid.vdf'))
  const bytes =
    'file' in source
      ? readFileSync(join(TEST_DATA, source.file))
      : 'garbage' in source
        ? Buffer.from('this is not a shortcuts file')
        : valid.subarray(0, 60)
  writeFileSync(path, bytes)
}

interface TreeFile {
  path: string
  size: number
  utf8?: string
}

/** Every file under `root` with its size (and its text when it is small and plain text). */
function steamTree(root: string, profile: ShortcutsOracleProfile): TreeFile[] {
  const out: TreeFile[] = []
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else {
        const bytes = readFileSync(full)
        const text = bytes.toString('utf8')
        const file: TreeFile = {
          path: pp(full.slice(root.length + 1), profile),
          size: statSync(full).size
        }
        if (
          bytes.length <= 160 &&
          Buffer.from(text, 'utf8').equals(bytes) &&
          // eslint-disable-next-line no-control-regex
          !/[\u0000-\u0008]/.test(text)
        ) {
          file.utf8 = pp(text, profile)
        }
        out.push(file)
      }
    }
  }
  walk(root)
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

const asText = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : typeof value === 'number'
      ? `${value}`
      : ''

/** The English default text, interpolated the way i18next does without escaping `{{x}}` values. */
function render(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_whole, name: string) =>
    asText(params[name])
  )
}

async function runCase(c: SteamCase): Promise<unknown> {
  return withShortcutsOracleProfile(async (profile) => {
    const restorePlatform = mockPlatform(c.platform)
    const restoreFlags = [
      jest.replaceProperty(environment, 'isFlatpak', c.flatpak),
      jest.replaceProperty(environment, 'isAppImage', c.appImage)
    ]
    const envBackup = new Map<string, string | undefined>()
    const setEnv = (key: string, value: string | undefined): void => {
      if (!envBackup.has(key)) envBackup.set(key, process.env[key])
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    setEnv('APPIMAGE', c.appImage ? APPIMAGE : undefined)
    setEnv('PORTABLE_EXECUTABLE_FILE', c.portable ? PORTABLE_FILE : undefined)
    setEnv('PORTABLE_EXECUTABLE_DIR', c.portable ? PORTABLE_DIR : undefined)
    jest.useFakeTimers({
      now: FROZEN_NOW,
      doNotFake: [
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
      ]
    })

    // ---- the fake Steam tree
    const steam = join(profile.home, 'Steam')
    const userdata = join(steam, 'userdata')
    if (c.userdata) {
      mkdirSync(userdata, { recursive: true })
      if (c.strayFile) writeFileSync(join(userdata, 'stray.txt'), 'x')
      for (const [user, spec] of Object.entries(c.users)) {
        const configDir = join(userdata, user, 'config')
        mkdirSync(spec.config === false ? join(userdata, user) : configDir, {
          recursive: true
        })
        if (spec.config !== false && spec.vdf) {
          seedVdf(join(configDir, 'shortcuts.vdf'), spec.vdf)
        }
        for (const name of spec.grid ?? []) {
          // `SHORT` stands for the id the new entry will get; seeded after it is computed.
          if (name.includes('SHORT')) continue
          mkdirSync(join(configDir, 'grid'), { recursive: true })
          writeFileSync(join(configDir, 'grid', name), 'seed')
        }
      }
    }
    // The new entry's ids, for seeding the art that already exists.
    const exeForIds = c.flatpak
      ? '"flatpak"'
      : c.platform !== 'win32' && c.appImage
        ? `"${APPIMAGE}"`
        : c.platform === 'win32' && c.portable
          ? `"${PORTABLE_FILE}"`
          : `"${SHELL_EXE[c.platform]}"`
    if (c.op === 'add' && c.userdata) {
      const short = generateShortAppId(exeForIds, c.title)
      for (const [user, spec] of Object.entries(c.users)) {
        for (const name of spec.grid ?? []) {
          if (!name.includes('SHORT')) continue
          const grid = join(userdata, user, 'config', 'grid')
          mkdirSync(grid, { recursive: true })
          writeFileSync(join(grid, name.replace('SHORT', short)), 'seed')
        }
      }
    }
    // The art a removal should delete: ids from the entry the vdf holds, not from this process.
    if (c.op === 'remove' && c.userdata) {
      for (const [user, spec] of Object.entries(c.users)) {
        const vdf = join(userdata, user, 'config', 'shortcuts.vdf')
        if (spec.vdf === undefined || !existsSync(vdf)) continue
        const entry = readShortcuts(vdf).entries.find(
          (e) => e.appName === c.title
        )
        if (!entry || entry.exe === null || entry.appName === null) continue
        const short = generateShortAppId(entry.exe, entry.appName)
        const big = generateAppId(entry.exe, entry.appName)
        const grid = join(userdata, user, 'config', 'grid')
        for (const suffix of c.seedRemovedGrid) {
          mkdirSync(grid, { recursive: true })
          writeFileSync(
            join(grid, suffix === 'big' ? `${big}.jpg` : `${short}${suffix}`),
            'seed'
          )
        }
        if (c.seedRemovedGrid.length > 0) {
          writeFileSync(join(grid, 'unrelated.jpg'), 'seed')
        }
      }
    }
    if (c.iconExists) {
      mkdirSync(profile.icons, { recursive: true })
      writeFileSync(join(profile.icons, `${c.appName}.jpg`), 'icon')
    }

    // ---- the recording fakes
    const steamfiles: unknown[] = []
    const wikiCalls: unknown[] = []
    const downloads: unknown[] = []
    const aborts: string[] = []
    const dataUrlConversions: unknown[] = []
    const dialogs: unknown[] = []
    const notifications: unknown[] = []
    const i18n: unknown[] = []
    const raised = { count: 0 }

    const requestRustInvoke = (
      channel: string,
      argv: readonly unknown[]
    ): Promise<unknown> => {
      const args = argv[0] as Record<string, unknown>
      if (channel === RUST_INFO_WIKI_GET) {
        wikiCalls.push(args)
        return 'rejects' in c.wiki
          ? Promise.reject(new Error(c.wiki.rejects))
          : Promise.resolve(c.wiki.value)
      }
      steamfiles.push({
        channel,
        args: normalisePaths(
          {
            ...args,
            path:
              typeof args.path === 'string' ? pp(args.path, profile) : args.path
          },
          profile
        )
      })
      if (channel === RUST_STEAMFILES_SHORTCUTS_READ) {
        return Promise.resolve(readShortcuts(args.path as string))
      }
      if (channel === RUST_STEAMFILES_SHORTCUTS_APPLY) {
        const mutation = args.mutation as { op: string; appName?: string }
        const result = {
          written: true,
          readError: null as string | null,
          alreadyPresent: false,
          matched: true,
          indexKey: '0' as string | null,
          removedExe: null as string | null,
          removedAppName: null as string | null
        }
        if (c.apply === 'throws') {
          return Promise.reject(new Error('scripted rustInvoke failure'))
        }
        if (c.apply === 'already-present') {
          Object.assign(result, { written: false, alreadyPresent: true })
        } else if (c.apply === 'not-written-read-error') {
          Object.assign(result, {
            written: false,
            readError: 'parse: scripted',
            matched: false,
            indexKey: null
          })
        } else if (c.apply === 'not-written-silent') {
          Object.assign(result, {
            written: false,
            matched: false,
            indexKey: null
          })
        } else if (mutation.op === 'remove') {
          const entry = readShortcuts(args.path as string).entries.find(
            (e) => e.appName === mutation.appName
          )
          Object.assign(result, {
            indexKey: entry?.indexKey ?? null,
            matched: entry !== undefined,
            removedExe: entry?.exe ?? null,
            removedAppName: entry?.appName ?? null
          })
        }
        return Promise.resolve(result)
      }
      return Promise.reject(new Error(`unexpected channel ${channel}`))
    }

    const downloadSpy = jest
      .spyOn(backendUtils, 'downloadFile')
      .mockImplementation(({ url, dest }) => {
        downloads.push({ url, dest: pp(dest, profile) })
        const isIcon = dest.startsWith(profile.icons)
        if (
          c.download === 'fail-all' ||
          (c.download === 'fail-icon' && isIcon)
        ) {
          return Promise.reject(new Error('Failed to get headers'))
        }
        mkdirSync(dirname(dest), { recursive: true })
        writeFileSync(dest, `downloaded:${url}`)
        return Promise.resolve()
      })

    const tSpy = jest.spyOn(i18next, 't').mockImplementation(((
      key: string,
      options?: unknown
    ) => {
      const given =
        typeof options === 'string'
          ? { defaultValue: options }
          : ((options ?? {}) as Record<string, unknown>)
      const { defaultValue, ...params } = given
      i18n.push({
        key,
        defaultValue: defaultValue ?? null,
        params: messagePaths(params, profile)
      })
      return render(asText(defaultValue) || key, params)
    }) as unknown as typeof i18next.t)

    const lastPlayedKey = `${c.appName}.lastPlayed`
    const deps = {
      libraryManagers: { gog: { getProductApi: () => Promise.resolve() } },
      runner: { run: () => Promise.reject(new Error('no process')) },
      aborts: {
        create: (url: string) => {
          aborts.push(url)
          return new AbortController()
        }
      },
      config: {
        getSettings: () => ({
          defaultSteamPath: `${steam}${c.quotedPath ? "'" : ''}`
        })
      },
      paths: { ...profile.paths, exe: SHELL_EXE[c.platform] },
      imageTools: {
        createFromBuffer: () => {
          throw new Error('no buffer conversion in a steam case')
        },
        createFromDataURL: (url: string) => ({
          toJPEG: (quality: number) => {
            dataUrlConversions.push({ url, quality })
            return Buffer.from(`jpeg:${quality}`)
          }
        })
      },
      stores: {
        kvs: {
          tsStore: {
            get_nodefault: (key: string) =>
              key === lastPlayedKey && c.lastPlayed.present
                ? c.lastPlayed.value
                : undefined
          }
        }
      },
      appState: {
        raiseMainWindowForInAppDialog: () => {
          raised.count += 1
        }
      },
      dialogs: {
        showErrorBox: () => Promise.resolve(),
        showMessageBox: () => Promise.resolve()
      },
      sendFrontendMessage: (...args: unknown[]) => {
        dialogs.push(messagePaths(args, profile))
        return true
      },
      notifications: {
        show: (message: { title: string; body: string }) => {
          notifications.push(messagePaths(message, profile))
        }
      },
      requestRustInvoke
    } as unknown as Parameters<typeof addNonSteamGame>[0]

    const game = {
      getGameInfo: () => ({
        title: c.title,
        app_name: c.appName,
        runner: c.runner,
        art_square: c.art.square,
        art_cover: c.art.cover,
        ...(c.art.logo ? { art_logo: c.art.logo } : {}),
        install: { is_dlc: false },
        is_installed: true,
        canRunOffline: true
      })
    } as unknown as Game

    try {
      let returned: unknown = null
      if (c.op === 'add') returned = await addNonSteamGame(deps, game)
      else if (c.op === 'isAdded') returned = await isAddedToSteam(deps, game)
      else await removeNonSteamGame(deps, game)

      return {
        platform: c.platform,
        environment: {
          flatpak: c.flatpak,
          appImage: c.appImage,
          portable: c.portable
        },
        input: {
          op: c.op,
          title: c.title,
          appName: c.appName,
          runner: c.runner,
          art: c.art,
          users: c.users,
          userdataExists: c.userdata,
          strayFile: c.strayFile,
          quotedSteamPath: c.quotedPath,
          lastPlayed: c.lastPlayed,
          wiki: c.wiki,
          apply: c.apply,
          download: c.download,
          iconExists: c.iconExists,
          seedRemovedGrid: c.seedRemovedGrid,
          frozenNow: FROZEN_NOW.toISOString()
        },
        returned: c.op === 'remove' ? null : returned,
        wiki: wikiCalls,
        steamfiles,
        aborts,
        downloads,
        dataUrlConversions,
        i18n,
        dialogs,
        raisedMainWindow: raised.count,
        notifications,
        tree: {
          steam: steamTree(steam, profile),
          icons: steamTree(profile.icons, profile)
        }
      }
    } finally {
      tSpy.mockRestore()
      downloadSpy.mockRestore()
      jest.useRealTimers()
      for (const [key, value] of envBackup) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      for (const r of restoreFlags) r.restore()
      restorePlatform()
    }
  })
}

function idsGolden(c: IdCase): unknown {
  return {
    input: { exe: c.exe, appName: c.appName },
    shortcutId: generateShortcutId(c.exe, c.appName),
    appId: generateAppId(c.exe, c.appName),
    shortAppId: generateShortAppId(c.exe, c.appName)
  }
}

// ------------------------------------------------------------------- suite

describe('Add to Steam oracle (94-07)', () => {
  const ids = [...ID_CASES.map((c) => c.id), ...CASES.map((c) => c.id)]

  it('the case list is at or above the floor and agrees with the committed manifest', () => {
    syncManifest(SLICE, ids, FLOOR)
    assertManifest(SLICE, ids, FLOOR)
  })

  it('an empty case list fails the floor', () => {
    expectEmptyCasesToFail(SLICE, FLOOR)
  })

  it('covers the existing-title skip and the missing-userdata message', () => {
    const idsOf = CASES.map((c) => c.id)
    expect(idsOf).toContain('add-existing-title-is-skipped')
    expect(idsOf).toContain('add-missing-userdata')
  })

  it.each(ID_CASES.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    writeOrCompareGolden(SLICE, c.id, idsGolden(c))
  })

  it.each(CASES.map((c) => [c.id, c] as const))('%s', async (_id, c) => {
    writeOrCompareGolden(SLICE, c.id, await runCase(c))
  })
})
