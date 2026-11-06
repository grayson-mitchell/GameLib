/**
 * Phase 63 plan 10 (D-12 tier 2): the local scanner parity sweep. Diffs the TS oracle
 * (`legacyTsScanners.ts`) against the Rust `gamelib-scan-cli` per scanner over every installed
 * game exe, its sibling DLLs and every installed Wine-Staging-macOS `winemac.so`.
 *
 * Local-only, never committed, never run in CI. Per D-07 a diff is a parity failure to
 * investigate, not to paper over.
 *
 * Declared real-profile arm (gamelib-conventions two-profile rule): the bottle and Wine
 * enumeration reads the operator's REAL HOME, because the inputs only exist there. Every CHILD
 * process (objdump for the TS oracle, gamelib-scan-cli for Rust) runs under a fresh fake-HOME
 * profile. The Rust side is one `--ndjson` process with one fresh profile for the whole run
 * (a single-process batch, not a reused profile); the oracle's objdump spawns each get a fresh one.
 *
 * Output is stdout only: counts plus redacted diffs. No game bytes and no full paths are printed
 * or written (T-51-39 discipline).
 *
 * Run: pnpm scanner-parity-sweep [-- --root <dir>]... [--wine-root <dir>]... [--scanner <name>]
 *      [--no-bottles]
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

import { createFakeHomeProfile } from '../src/backend/testUtils/fakeHomeProfile'
import {
  OBJDUMP_BIN,
  runLegacyOp
} from '../src/backend/scanners/legacyTsScanners'
import { normalizeScanResult } from '../src/backend/scanners/scanNormalize'
import {
  SCANNER_OPS,
  type ScannerName
} from '../src/backend/scanners/scannerImpl'
import type { ScanOp } from '../src/backend/scanners/scanTypes'
import {
  BOTTLES_DIR,
  isExcludedExeName,
  readManifests,
  walkExes
} from './bridgeCensus'
import { runScanCliBatch } from './gamelibScanCli'

export type SweepRecord = {
  scanner: ScannerName
  op: ScanOp
  path: string
  ts: unknown
  rust: unknown
}

export type SweepSummary = Record<
  ScannerName,
  { checked: number; equal: number; diff: number }
>

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, sortKeys(o[k])])
    )
  }
  return v
}

/** Null when the normalised values deep-equal (key order ignored, array order kept). */
export function diffScanResults(
  op: ScanOp,
  ts: unknown,
  rust: unknown
): { ts: unknown; rust: unknown } | null {
  const a = sortKeys(normalizeScanResult(op, ts))
  const b = sortKeys(normalizeScanResult(op, rust))
  return JSON.stringify(a) === JSON.stringify(b) ? null : { ts: a, rust: b }
}

export function summarizeSweep(records: SweepRecord[]): SweepSummary {
  const names = Object.keys(SCANNER_OPS) as ScannerName[]
  const out = Object.fromEntries(
    names.map((n) => [n, { checked: 0, equal: 0, diff: 0 }])
  ) as SweepSummary
  for (const r of records) {
    const row = out[r.scanner]
    row.checked++
    if (diffScanResults(r.op, r.ts, r.rust) === null) row.equal++
    else row.diff++
  }
  return out
}

/** `<sha256-12 of the directory>/<basename>`: the basename is kept, the directory hashed. */
export function redactPath(p: string): string {
  const norm = p.replace(/\\/g, '/')
  const i = norm.lastIndexOf('/')
  const dir = i >= 0 ? norm.slice(0, i) : ''
  const base = i >= 0 ? norm.slice(i + 1) : norm
  const h = createHash('sha256').update(dir).digest('hex').slice(0, 12)
  return `${h}/${base}`
}

/** 0 clean, 1 any diff, 3 zero inputs (never a vacuous green). */
export function exitCodeFor(summary: SweepSummary, inputs: number): number {
  if (inputs === 0) return 3
  return Object.values(summary).some((s) => s.diff > 0) ? 1 : 0
}

/**
 * True when more than 90% of the TS import-scan results normalise to `<unreadable-pe>` while
 * their Rust counterparts are ok: objdump is failing under the fake profile, so the oracle is
 * not an oracle.
 */
export function oracleBroken(records: SweepRecord[]): boolean {
  const imp = records.filter((r) => r.op === 'scan_steam_api_imports')
  const rustOk = imp.filter(
    (r) => (r.rust as { status?: string } | null)?.status === 'ok'
  )
  if (rustOk.length === 0) return false
  const broken = rustOk.filter((r) => {
    const n = normalizeScanResult(r.op, r.ts) as { error?: unknown } | null
    return n?.error === '<unreadable-pe>'
  })
  return broken.length / rustOk.length > 0.9
}

// ---------------------------------------------------------------------------
// Impure driver
// ---------------------------------------------------------------------------

const MAX_WINEMAC_DEPTH = 10

function siblingDlls(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.dll'))
      .map((e) => join(dir, e.name))
  } catch {
    return []
  }
}

function findWinemac(dir: string, depth: number, out: string[]): void {
  if (depth > MAX_WINEMAC_DEPTH || !existsSync(dir)) return
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) findWinemac(full, depth + 1, out)
    else if (e.isFile() && e.name === 'winemac.so') out.push(full)
  }
}

/** `<bundle>/Contents/Resources/wine/lib/wine/x86_64-unix/winemac.so` -> `<bundle>`. */
function bundleOf(winemacSo: string): string {
  let p = winemacSo
  for (let i = 0; i < 7; i++) p = dirname(p)
  return p
}

function argValues(argv: string[], flag: string): string[] {
  const out: string[] = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag && argv[i + 1]) out.push(argv[i + 1])
  }
  return out
}

type Input = { op: ScanOp; args: Record<string, string>; path: string }

function collectInputs(argv: string[]): { inputs: Input[]; counts: string } {
  const exes = new Map<string, string>() // path -> appId
  const noBottles = argv.includes('--no-bottles')
  if (!noBottles && existsSync(BOTTLES_DIR)) {
    for (const bottle of readdirSync(BOTTLES_DIR)) {
      const steamapps = join(
        BOTTLES_DIR,
        bottle,
        'drive_c',
        'Program Files (x86)',
        'Steam',
        'steamapps'
      )
      for (const m of readManifests(steamapps, bottle)) {
        const found: string[] = []
        walkExes(m.installPath, 0, found)
        for (const e of found) if (!exes.has(e)) exes.set(e, m.appid)
      }
    }
  }
  for (const root of argValues(argv, '--root')) {
    const found: string[] = []
    walkExes(root, 0, found)
    for (const e of found) if (!exes.has(e)) exes.set(e, '0')
  }

  const dlls = new Set<string>()
  for (const e of exes.keys())
    for (const d of siblingDlls(dirname(e))) dlls.add(d)

  const bundles = new Set<string>()
  if (!noBottles) {
    const base = join(homedir(), 'Library/Application Support/gamelib/tools')
    const found: string[] = []
    for (const sub of ['wine', 'steam-engines']) {
      findWinemac(join(base, sub), 0, found)
    }
    for (const w of found) bundles.add(bundleOf(w))
  }
  for (const wr of argValues(argv, '--wine-root')) {
    const found: string[] = []
    findWinemac(wr, 0, found)
    for (const w of found) bundles.add(bundleOf(w))
  }

  const inputs: Input[] = []
  const peOps: ScanOp[] = [
    'scan_steamstub_section',
    'scan_steam_drm',
    'scan_pe_imported_dlls',
    'scan_pe_delay_imports'
  ]
  for (const p of [...exes.keys(), ...dlls]) {
    for (const op of peOps) inputs.push({ op, args: { exePath: p }, path: p })
  }
  for (const [p, appId] of exes) {
    if (isExcludedExeName(basename(p))) continue
    inputs.push({
      op: 'scan_steam_api_imports',
      args: { exePath: p, appId },
      path: p
    })
    inputs.push({
      op: 'scan_contained_real',
      args: { path: p, rootDir: dirname(p) },
      path: p
    })
  }
  for (const b of bundles) {
    inputs.push({
      op: 'scan_winemac_metal_exports',
      args: { wineBundlePath: b },
      path: b
    })
  }
  const counts = `exes=${exes.size} dlls=${dlls.size} wineBundles=${bundles.size}`
  return { inputs, counts }
}

function scannerOf(op: ScanOp): ScannerName {
  for (const [name, ops] of Object.entries(SCANNER_OPS)) {
    if (ops.includes(op)) return name as ScannerName
  }
  throw new Error(`no scanner for op ${op}`)
}

function runObjdump(
  p: string
): Promise<{ code: number | null; stdout: string }> {
  // Fresh fake profile per call: the oracle's objdump must not see the operator's profile.
  const profile = createFakeHomeProfile({ prefix: 'gamelib-sweep-objdump-' })
  try {
    const r = spawnSync(OBJDUMP_BIN, ['--private-headers', p], {
      env: profile.childEnv(process.env),
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024
    })
    if (r.error) throw r.error
    return Promise.resolve({ code: r.status, stdout: r.stdout ?? '' })
  } catch (e) {
    return Promise.reject(e)
  } finally {
    try {
      profile.dispose()
    } catch {
      /* best effort */
    }
  }
}

function compact(v: unknown): string {
  const s = JSON.stringify(v) ?? 'undefined'
  return s.length > 400 ? `${s.slice(0, 400)}...` : s
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const only = argValues(argv, '--scanner')[0] as ScannerName | undefined
  if (only && !(only in SCANNER_OPS)) {
    console.error(`unknown scanner ${only}; one of ${Object.keys(SCANNER_OPS)}`)
    process.exit(64)
  }
  const { inputs: all, counts } = collectInputs(argv)
  const inputs = only
    ? all.filter((i) => SCANNER_OPS[only].includes(i.op))
    : all
  console.log(`scanner-parity-sweep: ${counts} requests=${inputs.length}`)
  if (inputs.length === 0) {
    console.log('no inputs: refusing a vacuous green')
    process.exit(3)
  }

  const rustRes = await runScanCliBatch(
    inputs.map((i) => ({ op: i.op, args: i.args }))
  )
  const records: SweepRecord[] = []
  for (let k = 0; k < inputs.length; k++) {
    const i = inputs[k]
    const r = rustRes[k]
    const rust = r?.ok
      ? r.result
      : { __cliError: r?.ok === false ? r.error : 'missing' }
    let ts: unknown
    try {
      ts = await runLegacyOp(i.op, i.args as never, { runObjdump })
    } catch (e) {
      ts = { __tsError: e instanceof Error ? e.message : String(e) }
    }
    records.push({ scanner: scannerOf(i.op), op: i.op, path: i.path, ts, rust })
  }

  if (oracleBroken(records)) {
    console.log(
      'ABORT: the TS oracle cannot run objdump under the fake profile (>90% unreadable-pe while Rust is ok)'
    )
    process.exit(4)
  }

  const summary = summarizeSweep(records)
  console.log('scanner | checked | equal | diff')
  for (const [name, s] of Object.entries(summary)) {
    if (only && name !== only) continue
    console.log(`${name} | ${s.checked} | ${s.equal} | ${s.diff}`)
  }
  for (const r of records) {
    const d = diffScanResults(r.op, r.ts, r.rust)
    if (d) {
      console.log(
        `${r.op} | ${redactPath(r.path)} | ts=${compact(d.ts)} | rust=${compact(d.rust)}`
      )
    }
  }
  // Only the selected scanner counts toward the exit code when filtered.
  const scoped = only
    ? ({ [only]: summary[only] } as unknown as SweepSummary)
    : summary
  process.exit(exitCodeFor(scoped, inputs.length))
}

// Bundled standalone by runTs.cjs; the guard keeps Jest imports side-effect free.
if (!process.env.JEST_WORKER_ID) {
  void main()
}
