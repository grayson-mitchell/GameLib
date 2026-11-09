/**
 * Phase 73 plan 15 (D-14, D-17): Tier 2 parity sweep. Diffs a TS-installed tree against a
 * Rust-installed tree of the same title, per title, and judges the corpus as a whole.
 *
 * Input JSON (path as argv[2]):
 *   { logFile, titles: [{ label, appId, tsRoot, rustRoot, tsAcf?, rustAcf?,
 *       tsStatus?, tsDepotStatus?, rustDepotStatus?,
 *       tsSeconds?, rustSeconds?, tsPeakRssKb?, rustPeakRssKb?, bytes? }] }
 *
 * Per title: relative path, kind, size, streaming SHA1, `mode & 0o7777`, and (darwin) the BSD
 * file flags from `/usr/bin/stat -f %f` (UF_HIDDEN etc.); the ACF text with `LastUpdated`
 * normalised. Outcome divergence is part of the diff, not only tree bytes: the Rust `status` from
 * the `[depot-rust] outcome` log line is compared with the TS status (default `completed`), and
 * optional per-depot status maps are compared depot by depot. That is what surfaces a
 * manifest-level EResult-40 refusal, which the TS path skips while Rust reports
 * `manifest_unavailable` and the install tree can look identical.
 *
 * Codec coverage (Pitfall 15): the corpus must exercise vz, vsza and pk (each count > 0 summed
 * over the titles' outcome lines) or the run fails.
 *
 * Exit: 0 clean, 1 diff or coverage gap, 3 no inputs (zero titles, unreadable input or log).
 * A vacuous run is a failure. Output is redacted: sha1 of the relative path plus basename only;
 * never an absolute path, a username or a token. Throughput/RSS are reported, never judged.
 *
 * Spawn rule: the only child is `/usr/bin/stat`, and every spawn gets a FRESH
 * `createFakeHomeProfile({ prefix: 'depot-sweep' })` env (gamelib-conventions, isolated half).
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  createReadStream,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync
} from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { basename, join } from 'node:path'

import { createFakeHomeProfile } from '../src/backend/testUtils/fakeHomeProfile'

export interface SweepTitle {
  label: string
  appId: string | number
  tsRoot: string
  rustRoot: string
  tsAcf?: string
  rustAcf?: string
  /** TS-side overall status; default `completed`. */
  tsStatus?: string
  /** depotId -> status words for each side, compared per depot when both are given. */
  tsDepotStatus?: Record<string, string>
  rustDepotStatus?: Record<string, string>
  tsSeconds?: number
  rustSeconds?: number
  tsPeakRssKb?: number
  rustPeakRssKb?: number
  bytes?: number
}

export interface SweepInput {
  titles: SweepTitle[]
  logFile: string
}

export interface TreeEntry {
  kind: 'file' | 'dir' | 'symlink' | 'other'
  size: number
  sha1: string
  mode: number
  flags: string
}

export type TreeMap = Map<string, TreeEntry>

export const NON_DARWIN_FLAGS = 'n/a (non-darwin)'
const STAT_BATCH = 500

export type FlagReader = (root: string, rels: string[]) => number[]

/** `/usr/bin/stat -f %f` over relative paths, argv-form, fresh fake HOME per spawn. */
export function readBsdFlags(root: string, rels: string[]): number[] {
  const out: number[] = []
  for (let i = 0; i < rels.length; i += STAT_BATCH) {
    const batch = rels.slice(i, i + STAT_BATCH)
    const profile = createFakeHomeProfile({ prefix: 'depot-sweep' })
    try {
      // No -L: stat the link itself. `./` keeps a leading `-` from reading as an option.
      const r = spawnSync(
        '/usr/bin/stat',
        ['-f', '%f', ...batch.map((p) => `./${p}`)],
        { cwd: root, env: profile.childEnv(process.env), encoding: 'utf-8' }
      )
      if (r.error) throw r.error
      const lines = r.stdout.split('\n').filter((l) => l !== '')
      if (r.status !== 0 || lines.length !== batch.length) {
        throw new Error('stat could not read file flags for a batch')
      }
      for (const l of lines) out.push(Number(l))
    } finally {
      try {
        profile.dispose()
      } catch {
        /* best effort */
      }
    }
  }
  return out
}

function sha1File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha1')
    const s = createReadStream(path)
    s.on('data', (c) => h.update(c))
    s.on('error', reject)
    s.on('end', () => resolve(h.digest('hex')))
  })
}

/** Walks `root` with lstat. Keys are `/`-joined relative paths. */
export async function walkTree(
  root: string,
  readFlags: FlagReader | null = process.platform === 'darwin'
    ? readBsdFlags
    : null
): Promise<TreeMap> {
  const map: TreeMap = new Map()
  const walk = async (rel: string): Promise<void> => {
    const abs = rel === '' ? root : join(root, rel)
    for (const name of readdirSync(abs).sort()) {
      const r = rel === '' ? name : `${rel}/${name}`
      const p = join(root, r)
      const st = lstatSync(p)
      const mode = st.mode & 0o7777
      if (st.isSymbolicLink()) {
        map.set(r, {
          kind: 'symlink',
          size: st.size,
          sha1: createHash('sha1').update(readlinkSync(p)).digest('hex'),
          mode,
          flags: NON_DARWIN_FLAGS
        })
      } else if (st.isDirectory()) {
        map.set(r, { kind: 'dir', size: 0, sha1: '', mode, flags: '' })
        await walk(r)
      } else if (st.isFile()) {
        map.set(r, {
          kind: 'file',
          size: st.size,
          sha1: await sha1File(p),
          mode,
          flags: NON_DARWIN_FLAGS
        })
      } else {
        map.set(r, { kind: 'other', size: 0, sha1: '', mode, flags: '' })
      }
    }
  }
  await walk('')
  if (readFlags) {
    const rels = [...map.keys()]
    const flags = readFlags(root, rels)
    rels.forEach((rel, i) => {
      const e = map.get(rel)
      const flag = flags[i]
      if (e && flag !== undefined) e.flags = `0x${flag.toString(16)}`
    })
  }
  return map
}

export type DiffKind =
  | 'missing-in-rust'
  | 'extra-in-rust'
  | 'type'
  | 'content'
  | 'mode'
  | 'flags'

export interface TreeDiff {
  kind: DiffKind
  /** sha1(relative path), first 12 hex. */
  key: string
  name: string
}

function keyOf(rel: string): string {
  return createHash('sha1').update(rel).digest('hex').slice(0, 12)
}

export function diffTrees(ts: TreeMap, rust: TreeMap): TreeDiff[] {
  const out: TreeDiff[] = []
  const push = (kind: DiffKind, rel: string): void => {
    out.push({ kind, key: keyOf(rel), name: basename(rel) })
  }
  const all = new Set([...ts.keys(), ...rust.keys()])
  for (const rel of [...all].sort()) {
    const a = ts.get(rel)
    const b = rust.get(rel)
    if (a && !b) push('missing-in-rust', rel)
    else if (!a && b) push('extra-in-rust', rel)
    else if (a && b) {
      if (a.kind !== b.kind) push('type', rel)
      else if (a.size !== b.size || a.sha1 !== b.sha1) push('content', rel)
      else if (a.mode !== b.mode) push('mode', rel)
      else if (a.flags !== b.flags) push('flags', rel)
    }
  }
  return out
}

const ACF_LAST_UPDATED = /("LastUpdated"\s+)"[^"]*"/

export function normalizeAcf(text: string): string {
  return text.replace(ACF_LAST_UPDATED, '$1"<normalised>"')
}

/** Key names (first quoted token per line) whose normalised line differs; never values. */
export function diffAcf(tsText: string, rustText: string): string[] {
  const a = normalizeAcf(tsText).split('\n')
  const b = normalizeAcf(rustText).split('\n')
  const keyOfLine = (l: string): string => /^\s*"([^"]*)"/.exec(l)?.[1] ?? '?'
  const keys = new Set<string>()
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const x = a[i]?.trimEnd()
    const y = b[i]?.trimEnd()
    if (x !== y) keys.add(keyOfLine(x ?? y ?? ''))
  }
  return [...keys].sort()
}

export interface OutcomeLine {
  appId: string
  mode: string
  status: string
  vz: number
  vsza: number
  pk: number
}

/** Parses `[depot-rust] outcome appId=.. mode=.. status=.. vz=.. vsza=.. pk=..` lines. */
export function parseOutcomeLines(log: string): OutcomeLine[] {
  const out: OutcomeLine[] = []
  for (const line of log.split('\n')) {
    const at = line.indexOf('[depot-rust] outcome ')
    if (at < 0) continue
    const kv = new Map<string, string>()
    for (const m of line.slice(at).matchAll(/(\w+)=(\S+)/g)) {
      const [, k, v] = m
      if (k !== undefined && v !== undefined) kv.set(k, v)
    }
    const appId = kv.get('appId')
    const mode = kv.get('mode')
    const status = kv.get('status')
    if (!appId || !mode || !status) continue
    out.push({
      appId,
      mode,
      status,
      vz: Number(kv.get('vz') ?? 0),
      vsza: Number(kv.get('vsza') ?? 0),
      pk: Number(kv.get('pk') ?? 0)
    })
  }
  return out
}

export interface CodecTotals {
  vz: number
  vsza: number
  pk: number
}

export function missingCodecs(t: CodecTotals): string[] {
  return (['vz', 'vsza', 'pk'] as const).filter((c) => !(t[c] > 0))
}

export interface PerfRow {
  label: string
  tsMiBps: number | null
  rustMiBps: number | null
  ratio: number | null
  tsPeakRssKb: number | null
  rustPeakRssKb: number | null
}

export function perfRow(t: SweepTitle): PerfRow {
  const rate = (secs: number | undefined): number | null =>
    t.bytes !== undefined && secs !== undefined && secs > 0
      ? t.bytes / 1048576 / secs
      : null
  const tsMiBps = rate(t.tsSeconds)
  const rustMiBps = rate(t.rustSeconds)
  return {
    label: t.label,
    tsMiBps,
    rustMiBps,
    ratio: tsMiBps && rustMiBps ? rustMiBps / tsMiBps : null,
    tsPeakRssKb: t.tsPeakRssKb ?? null,
    rustPeakRssKb: t.rustPeakRssKb ?? null
  }
}

export interface TitleReport {
  label: string
  treeDiffs: TreeDiff[]
  acfKeys: string[]
  statusDiffs: string[]
}

export interface SweepReport {
  titles: TitleReport[]
  codecs: CodecTotals
  codecMissing: string[]
  perf: PerfRow[]
  exitCode: 0 | 1 | 3
  lines: string[]
}

function fmt(n: number | null, digits = 2): string {
  return n === null ? 'n/a' : n.toFixed(digits)
}

/** Status words differ only by case/whitespace never matter; compare as given. */
function compareStatus(
  t: SweepTitle,
  rustLines: OutcomeLine[]
): { diffs: string[]; missingOutcome: boolean } {
  const diffs: string[] = []
  const installs = rustLines.filter(
    (l) => l.appId === String(t.appId) && l.mode === 'install'
  )
  if (installs.length === 0) {
    diffs.push('no [depot-rust] outcome line for this title')
    return { diffs, missingOutcome: true }
  }
  const rustStatus = installs[installs.length - 1]?.status
  const tsStatus = t.tsStatus ?? 'completed'
  if (rustStatus !== tsStatus) {
    diffs.push(`status ts=${tsStatus} rust=${rustStatus}`)
  }
  const a = t.tsDepotStatus
  const b = t.rustDepotStatus
  if (a && b) {
    for (const depot of [
      ...new Set([...Object.keys(a), ...Object.keys(b)])
    ].sort()) {
      if (a[depot] !== b[depot]) {
        diffs.push(
          `depot ${depot} ts=${a[depot] ?? 'absent'} rust=${b[depot] ?? 'absent'}`
        )
      }
    }
  }
  return { diffs, missingOutcome: false }
}

export function scrub(text: string, roots: string[]): string {
  let out = text
  const secrets = [...roots, homedir()]
  try {
    secrets.push(userInfo().username)
  } catch {
    /* no passwd entry */
  }
  for (const s of secrets) {
    if (s.length >= 3) out = out.split(s).join('<redacted>')
  }
  return out
    .replace(/(?:\/(?:Users|home)\/|[A-Za-z]:\\Users\\)[^\s'"]+/g, '<path>')
    .replace(/([?&]t=)[^\s&]+/g, '$1<token>')
}

export async function runSweep(
  input: SweepInput,
  readFlags?: FlagReader | null
): Promise<SweepReport> {
  const lines: string[] = []
  if (!Array.isArray(input.titles) || input.titles.length === 0) {
    lines.push('no title pairs in the input; a sweep over nothing is a failure')
    return {
      titles: [],
      codecs: { vz: 0, vsza: 0, pk: 0 },
      codecMissing: ['vz', 'vsza', 'pk'],
      perf: [],
      exitCode: 3,
      lines
    }
  }
  let log: string
  try {
    log = readFileSync(input.logFile, 'utf-8')
  } catch {
    lines.push('outcome log unreadable; codec coverage cannot be judged')
    return {
      titles: [],
      codecs: { vz: 0, vsza: 0, pk: 0 },
      codecMissing: ['vz', 'vsza', 'pk'],
      perf: [],
      exitCode: 3,
      lines
    }
  }
  const outcomes = parseOutcomeLines(log)
  const titles: TitleReport[] = []
  const codecs: CodecTotals = { vz: 0, vsza: 0, pk: 0 }
  let failed = false
  for (const t of input.titles) {
    const ts = await walkTree(t.tsRoot, readFlags)
    const rust = await walkTree(t.rustRoot, readFlags)
    const treeDiffs = diffTrees(ts, rust)
    let acfKeys: string[] = []
    if (t.tsAcf !== undefined || t.rustAcf !== undefined) {
      if (t.tsAcf === undefined || t.rustAcf === undefined) {
        acfKeys = ['<one side has no ACF>']
      } else {
        acfKeys = diffAcf(
          readFileSync(t.tsAcf, 'utf-8'),
          readFileSync(t.rustAcf, 'utf-8')
        )
      }
    }
    const { diffs: statusDiffs } = compareStatus(t, outcomes)
    for (const l of outcomes) {
      if (l.appId === String(t.appId) && l.mode === 'install') {
        codecs.vz += l.vz
        codecs.vsza += l.vsza
        codecs.pk += l.pk
      }
    }
    if (treeDiffs.length > 0 || acfKeys.length > 0 || statusDiffs.length > 0) {
      failed = true
    }
    titles.push({ label: t.label, treeDiffs, acfKeys, statusDiffs })
  }
  const codecMissing = missingCodecs(codecs)
  if (codecMissing.length > 0) failed = true
  const perf = input.titles.map(perfRow)

  for (const r of titles) {
    const clean =
      r.treeDiffs.length + r.acfKeys.length + r.statusDiffs.length === 0
    lines.push(`${clean ? 'OK  ' : 'DIFF'} ${r.label}`)
    for (const d of r.treeDiffs) lines.push(`  ${d.kind} ${d.key} ${d.name}`)
    for (const k of r.acfKeys) lines.push(`  acf key ${k}`)
    for (const s of r.statusDiffs) lines.push(`  ${s}`)
  }
  lines.push(
    `codec coverage: vz=${codecs.vz} vsza=${codecs.vsza} pk=${codecs.pk}`
  )
  for (const c of codecMissing) lines.push(`codec coverage: ${c} missing`)
  lines.push(
    'perf (D-17: judged by the operator against noise; never fails the run)'
  )
  for (const p of perf) {
    lines.push(
      `  ${p.label}: ts=${fmt(p.tsMiBps)} MiB/s rust=${fmt(p.rustMiBps)} MiB/s ` +
        `rust/ts=${fmt(p.ratio)} rss ts=${fmt(p.tsPeakRssKb, 0)} KiB rust=${fmt(p.rustPeakRssKb, 0)} KiB`
    )
  }
  const sum = (f: (p: PerfRow) => number | null): number | null => {
    const v = perf.map(f).filter((x): x is number => x !== null)
    return v.length > 0 ? Math.max(...v) : null
  }
  lines.push(
    `  peak rss max: ts=${fmt(
      sum((p) => p.tsPeakRssKb),
      0
    )} KiB rust=${fmt(
      sum((p) => p.rustPeakRssKb),
      0
    )} KiB`
  )
  return {
    titles,
    codecs,
    codecMissing,
    perf,
    exitCode: failed ? 1 : 0,
    lines
  }
}

async function main(): Promise<void> {
  const path = process.argv[2]
  if (!path) {
    console.error('usage: depot-parity-sweep <input.json>')
    process.exit(64)
  }
  let input: SweepInput
  try {
    input = JSON.parse(readFileSync(path, 'utf-8')) as SweepInput
  } catch {
    console.log('input unreadable or not JSON')
    process.exit(3)
  }
  const roots = (input.titles ?? []).flatMap((t) => [t.tsRoot, t.rustRoot])
  const report = await runSweep(input)
  console.log(scrub(report.lines.join('\n'), roots))
  process.exit(report.exitCode)
}

// `require.main === module` does not survive runTs.cjs bundling; JEST_WORKER_ID tells "imported
// under test" from "run as the entrypoint" (same idiom as bridgeCensus.ts).
if (!process.env.JEST_WORKER_ID) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'sweep failed')
    process.exit(1)
  })
}
