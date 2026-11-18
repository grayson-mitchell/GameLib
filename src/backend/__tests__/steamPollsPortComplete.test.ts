/**
 * Phase 80 deletion gate (P80-gate): the Steam install, uninstall, update and
 * running polls, the restart hold and the download monitor live only in Rust
 * (crates/gamelib-steampoll). Fails if a deleted TS poll module, a poll-loop
 * constant, the polls flag or a TS `reg query RunningAppID` path comes back.
 *
 * Phase 81 deletion gate (D-11/D-13): the restart hold is gone for good. A
 * second block fails if a restart-hold file, symbol, the re-arm, or a writer of
 * `steam_restart_hold.json` comes back; only the D-12 migration reads that file.
 */
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, relative } from 'path'

const ROOT = join(__dirname, '..', '..', '..')
const STEAM = 'src/backend/storeManagers/steam'
const FIXTURES = 'src-tauri/crates/gamelib-steampoll/tests/fixtures'

const DELETED = [
  `${STEAM}/library/installPollOnce.ts`,
  `${STEAM}/library/updatePollOnce.ts`,
  `${STEAM}/library/pollState.ts`,
  `${STEAM}/library/restartHold.ts`,
  `${STEAM}/library/pollsFlag.ts`,
  `${STEAM}/steamDownloadMonitor.ts`,
  `${STEAM}/steamDownloadProgress.ts`,
  `${STEAM}/steamRestartHold.ts`,
  `${STEAM}/childWatchdog.ts`,
  'src/backend/testUtils/steamPollReplay/tsDriver.ts',
  'meta/gamelibSteampollCli.ts'
]

const FORBIDDEN = [
  'GRACE_TICKS',
  'MAX_TICKS',
  'STEAM_REQUEST_NO_ACTIVITY_TICKS',
  'MANIFEST_GONE_TICKS',
  'GAMELIB_STEAM_POLLS',
  'pollsImpl',
  'buildWatchdogSpawn'
]

// A reg.exe query of RunningAppID: the native read replaced it.
const REG_QUERY_RUNNING_APP_ID =
  /reg(?:\.exe)?['"`,\s[]+query[^\n]*RunningAppID/

const KEPT = [
  'src-tauri/crates/gamelib-steampoll/Cargo.toml',
  'src-tauri/crates/gamelib-steampoll-cli/Cargo.toml',
  'src-tauri/crates/gamelib-i18n/Cargo.toml',
  `${FIXTURES}/timelines`,
  `${FIXTURES}/expected-ts`,
  `${FIXTURES}/divergences.json`
]

// This file names every forbidden symbol by design.
const SELF = join(__dirname, 'steamPollsPortComplete.test.ts')

function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue
    const full = join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|cjs|js)$/.test(e.name)) out.push(full)
  }
}

const stripComments = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n')

describe('steam polls port complete (Phase 80 P80-gate)', () => {
  const files: string[] = []
  walk(join(ROOT, 'src'), files)
  walk(join(ROOT, 'meta'), files)
  const scanned = files.filter((f) => f !== SELF)

  it.each(DELETED)('%s stays deleted', (p) => {
    expect(existsSync(join(ROOT, p))).toBe(false)
  })

  it('no forbidden poll-loop symbol remains (comments stripped)', () => {
    const hits: string[] = []
    for (const f of scanned) {
      const src = stripComments(readFileSync(f, 'utf8'))
      for (const needle of FORBIDDEN) {
        if (src.includes(needle)) hits.push(`${relative(ROOT, f)}: ${needle}`)
      }
    }
    expect(hits).toEqual([])
  })

  it('no reg query of RunningAppID remains in code (comments stripped)', () => {
    const hits = scanned
      .filter((f) =>
        REG_QUERY_RUNNING_APP_ID.test(stripComments(readFileSync(f, 'utf8')))
      )
      .map((f) => relative(ROOT, f))
    expect(hits).toEqual([])
  })

  it('the scan can fail: a forbidden symbol in code is caught, the same symbol in a comment is not', () => {
    const code =
      "const n = MAX_TICKS\nspawn('reg', ['query', k, 'RunningAppID'])"
    const comment = '// MAX_TICKS was removed in 80-31\n/* GRACE_TICKS */'
    expect(stripComments(code).includes('MAX_TICKS')).toBe(true)
    expect(REG_QUERY_RUNNING_APP_ID.test(stripComments(code))).toBe(true)
    expect(stripComments(comment).includes('MAX_TICKS')).toBe(false)
    expect(stripComments(comment).includes('GRACE_TICKS')).toBe(false)
  })

  it.each(KEPT)('%s is kept', (p) => {
    expect(existsSync(join(ROOT, p))).toBe(true)
  })

  it('anti-vacuity: the walk scanned a real tree', () => {
    expect(scanned.length).toBeGreaterThanOrEqual(500)
  })
})

// ---------------------------------------------------------------------------
// Phase 81 deletion gate (D-11, D-13)
// ---------------------------------------------------------------------------

const POLL_CRATE = 'src-tauri/crates/gamelib-steampoll'

const HOLD_DELETED = [
  `${POLL_CRATE}/src/hold.rs`,
  `${POLL_CRATE}/src/rearm.rs`,
  `${POLL_CRATE}/tests/hold.rs`,
  `${POLL_CRATE}/tests/rearm.rs`
]

const RUST_SCAN_DIRS = [
  `${POLL_CRATE}/src`,
  'src-tauri/crates/gamelib-steampoll-cli/src',
  'src-tauri/src'
]

const HOLD_FORBIDDEN_RS = [
  'HoldSink',
  'HoldStore',
  'HoldPoll',
  'should_hold',
  'release_hold',
  'WriteHoldRecord',
  'ClearHoldRecord',
  'rearm_persisted_holds',
  'RearmSettled',
  'STEAM_HOLD_PROBE_MIN_INTERVAL_MS'
]

const HOLD_FORBIDDEN_TS = [
  'withoutSteamRestartHolds',
  'rearmSettled',
  'restoredSteamHold',
  'macNativeRoute',
  'adoptedBySteamClient',
  'readSteamProcessStartTokens'
]

// The D-12 migration is the only reader of the old store file; profile.rs
// only names its path. Nothing else may mention it, so nothing can write it.
const HOLD_FILE = 'steam_restart_hold'
const HOLD_FILE_ALLOWED = [
  `${POLL_CRATE}/src/hold_migration.rs`,
  `${POLL_CRATE}/src/profile.rs`
]

function walkRust(dir: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'target' || e.name === 'node_modules') continue
    const full = join(dir, e.name)
    if (e.isDirectory()) walkRust(full, out)
    else if (e.name.endsWith('.rs')) out.push(full)
  }
}

/**
 * Drops `//` line comments (`///`, `//!` included) and nested block comments
 * from Rust source. String and raw-string literals are copied through intact,
 * so a URL in a string does not start a comment and a quoted symbol still counts.
 */
function stripRustComments(src: string): string {
  const out: string[] = []
  const n = src.length
  let i = 0
  while (i < n) {
    const c = src.charAt(i)
    const next = src.charAt(i + 1)
    if (c === '/' && next === '/') {
      while (i < n && src.charAt(i) !== '\n') i++
      continue
    }
    if (c === '/' && next === '*') {
      let depth = 1
      i += 2
      while (i < n && depth > 0) {
        if (src.startsWith('/*', i)) {
          depth++
          i += 2
        } else if (src.startsWith('*/', i)) {
          depth--
          i += 2
        } else i++
      }
      continue
    }
    const raw = /^b?r(#*)"/.exec(src.slice(i, i + 40))
    if (raw && (i === 0 || !/[A-Za-z0-9_]/.test(src.charAt(i - 1)))) {
      const close = `"${raw[1] ?? ''}`
      const end = src.indexOf(close, i + raw[0].length)
      const stop = end === -1 ? n : end + close.length
      out.push(src.slice(i, stop))
      i = stop
      continue
    }
    if (c === '"') {
      let j = i + 1
      while (j < n && src.charAt(j) !== '"') j += src.charAt(j) === '\\' ? 2 : 1
      out.push(src.slice(i, j + 1))
      i = j + 1
      continue
    }
    // A char literal such as '"' must not open a string; a lifetime ('a) is not one.
    if (c === "'") {
      const lit = /^'(?:\\[^']*|[^\\'])'/.exec(src.slice(i, i + 12))
      if (lit) {
        out.push(lit[0])
        i += lit[0].length
        continue
      }
    }
    out.push(c)
    i++
  }
  return out.join('')
}

describe('restart hold deleted (Phase 81 D-11/D-13)', () => {
  const rsFiles: string[] = []
  for (const d of RUST_SCAN_DIRS) walkRust(join(ROOT, d), rsFiles)
  const rsSources = rsFiles.map((f) => ({
    rel: relative(ROOT, f).split('\\').join('/'),
    src: stripRustComments(readFileSync(f, 'utf8'))
  }))

  const tsFiles: string[] = []
  walk(join(ROOT, 'src'), tsFiles)
  walk(join(ROOT, 'meta'), tsFiles)

  it.each(HOLD_DELETED)('%s stays deleted', (p) => {
    expect(existsSync(join(ROOT, p))).toBe(false)
  })

  it('no hold or re-arm symbol remains in the Rust sources (comments stripped)', () => {
    const hits: string[] = []
    for (const { rel, src } of rsSources) {
      for (const needle of HOLD_FORBIDDEN_RS) {
        if (src.includes(needle)) hits.push(`${rel}: ${needle}`)
      }
    }
    expect(hits).toEqual([])
  })

  it('no deleted hold symbol remains in the TS sources (comments stripped)', () => {
    const hits: string[] = []
    for (const f of tsFiles.filter((t) => t !== SELF)) {
      const src = stripComments(readFileSync(f, 'utf8'))
      for (const needle of HOLD_FORBIDDEN_TS) {
        if (src.includes(needle)) hits.push(`${relative(ROOT, f)}: ${needle}`)
      }
    }
    expect(hits).toEqual([])
  })

  it('only the D-12 migration and the profile path mention steam_restart_hold in Rust code', () => {
    const hits = rsSources
      .filter(({ rel }) => !HOLD_FILE_ALLOWED.includes(rel))
      .filter(({ src }) => src.includes(HOLD_FILE))
      .map(({ rel }) => rel)
    expect(hits).toEqual([])
  })

  it('the Rust comment stripper can fail: code is caught, comments are not, strings survive', () => {
    expect(stripRustComments('pub struct HoldStore;')).toContain('HoldStore')
    expect(stripRustComments('// HoldStore\n/// HoldSink')).not.toMatch(/Hold/)
    expect(stripRustComments('//! rearm_persisted_holds')).not.toMatch(/rearm/)
    expect(stripRustComments('/* a /* HoldPoll */ should_hold */ x')).toBe(' x')
    expect(stripRustComments('let u = "http://x"; HoldSink')).toContain(
      'HoldSink'
    )
    expect(stripRustComments("let q = '\"'; HoldSink")).toContain('HoldSink')
    expect(stripRustComments('let s = r#"steam_restart_hold"#;')).toContain(
      HOLD_FILE
    )
  })

  it('the survivors the gate must not catch are not forbidden', () => {
    const survivors = [
      'hold_migration',
      'steampoll_hold_drain',
      'steampoll_hold_discard',
      'steampoll_running_hold',
      'RunningPoll::hold',
      'steam-waiting-for-restart'
    ]
    for (const keep of survivors) {
      expect(HOLD_FORBIDDEN_RS.some((needle) => keep.includes(needle))).toBe(
        false
      )
      expect(HOLD_FORBIDDEN_TS.some((needle) => keep.includes(needle))).toBe(
        false
      )
    }
  })

  it('anti-vacuity: the Rust walk scanned the three directories', () => {
    expect(rsSources.length).toBeGreaterThanOrEqual(30)
    for (const d of RUST_SCAN_DIRS) {
      expect(rsSources.some(({ rel }) => rel.startsWith(`${d}/`))).toBe(true)
    }
    expect(rsSources.some(({ rel }) => HOLD_FILE_ALLOWED.includes(rel))).toBe(
      true
    )
  })
})
