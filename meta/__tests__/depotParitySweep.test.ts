import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createFakeHomeProfile } from '../../src/backend/testUtils/fakeHomeProfile'
import {
  diffAcf,
  missingCodecs,
  normalizeAcf,
  parseOutcomeLines,
  perfRow,
  readBsdFlags,
  runSweep,
  scrub,
  type SweepInput,
  type SweepTitle
} from '../depotParitySweep'

const noFlags = null

const ACF = (stateFlags: string, updated: string): string =>
  `"AppState"\n{\n\t"appid"\t\t"900001"\n\t"StateFlags"\t\t"${stateFlags}"\n\t"LastUpdated"\t\t"${updated}"\n}\n`

const outcome = (
  appId: string,
  o: { status?: string; vz?: number; vsza?: number; pk?: number } = {}
): string =>
  `[depot-rust] outcome appId=${appId} jobId=j mode=install status=${o.status ?? 'completed'} acf=4 ` +
  `vz=${o.vz ?? 1} vsza=${o.vsza ?? 1} pk=${o.pk ?? 1} macho=0 collisions=0 bytes=10 elapsedMs=5`

describe('depotParitySweep', () => {
  let dir: string
  let n = 0
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'depot-sweep-test-'))
    n = 0
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  function pair(
    ts: Record<string, string>,
    rust: Record<string, string> = ts
  ): { tsRoot: string; rustRoot: string } {
    n++
    const mk = (side: string, files: Record<string, string>): string => {
      const root = join(dir, `${side}${n}`, 'common', 'Title Secret')
      mkdirSync(root, { recursive: true })
      for (const [rel, body] of Object.entries(files)) {
        mkdirSync(join(root, rel, '..'), { recursive: true })
        writeFileSync(join(root, rel), body)
      }
      return root
    }
    return { tsRoot: mk('ts', ts), rustRoot: mk('rust', rust) }
  }

  function input(
    titles: Partial<SweepTitle>[],
    log: string[] = [outcome('900001')]
  ): SweepInput {
    const logFile = join(dir, 'main.log')
    writeFileSync(logFile, log.join('\n') + '\n')
    return {
      logFile,
      titles: titles.map((t, i) => ({
        label: `T${i}`,
        appId: '900001',
        tsRoot: '',
        rustRoot: '',
        ...t
      }))
    }
  }

  it('identical trees exit 0', async () => {
    const p = pair({ 'data/a.bin': 'AAA', 'b.txt': 'b' })
    const r = await runSweep(input([p]), noFlags)
    expect(r.exitCode).toBe(0)
    expect(r.lines.join('\n')).toContain('OK   T0')
  })

  it('one changed byte exits 1 naming only hash and basename', async () => {
    const p = pair({ 'data/a.bin': 'AAA' }, { 'data/a.bin': 'AAB' })
    const r = await runSweep(input([p]), noFlags)
    expect(r.exitCode).toBe(1)
    const text = r.lines.join('\n')
    expect(text).toMatch(/content [0-9a-f]{12} a\.bin/)
    expect(text).not.toContain('data/')
    expect(text).not.toContain(dir)
    expect(text).not.toContain('Title Secret')
  })

  it('missing and extra files are reported', async () => {
    const p = pair(
      { 'a.bin': '1', 'only-ts.bin': '2' },
      { 'a.bin': '1', 'only-rust.bin': '3' }
    )
    const r = await runSweep(input([p]), noFlags)
    expect(r.exitCode).toBe(1)
    const text = r.lines.join('\n')
    expect(text).toContain('missing-in-rust')
    expect(text).toContain('extra-in-rust')
  })

  const posix = process.platform === 'win32' ? it.skip : it
  posix('a mode difference exits 1', async () => {
    const p = pair({ 'x.sh': 'echo' })
    chmodSync(join(p.rustRoot, 'x.sh'), 0o755)
    chmodSync(join(p.tsRoot, 'x.sh'), 0o644)
    const r = await runSweep(input([p]), noFlags)
    expect(r.exitCode).toBe(1)
    expect(r.lines.join('\n')).toMatch(/mode [0-9a-f]{12} x\.sh/)
  })

  posix('a symlink target difference is a content difference', async () => {
    const p = pair({ 'a.bin': '1' })
    symlinkSync('a.bin', join(p.tsRoot, 'link'))
    symlinkSync('other', join(p.rustRoot, 'link'))
    const r = await runSweep(input([p]), noFlags)
    expect(r.exitCode).toBe(1)
    expect(r.lines.join('\n')).toMatch(/content [0-9a-f]{12} link/)
  })

  it('an injected flags difference exits 1 on any platform', async () => {
    const p = pair({ 'x.bin': '1' })
    const reader = (root: string, rels: string[]): number[] =>
      rels.map(() => (root === p.rustRoot ? 0x8000 : 0))
    const r = await runSweep(input([p]), reader)
    expect(r.exitCode).toBe(1)
    expect(r.lines.join('\n')).toMatch(/flags [0-9a-f]{12} x\.bin/)
  })

  const darwin = process.platform === 'darwin' ? it : it.skip
  darwin('real BSD flags: chflags hidden on one tree exits 1', async () => {
    const p = pair({ 'x.bin': '1' })
    expect(readBsdFlags(p.tsRoot, ['x.bin'])).toEqual([0])
    const profile = createFakeHomeProfile({ prefix: 'depot-sweep-test' })
    try {
      const r = spawnSync(
        '/usr/bin/chflags',
        ['hidden', join(p.rustRoot, 'x.bin')],
        {
          env: profile.childEnv(process.env),
          encoding: 'utf-8'
        }
      )
      expect(r.status).toBe(0)
    } finally {
      profile.dispose()
    }
    const report = await runSweep(input([p]))
    expect(report.exitCode).toBe(1)
    expect(report.lines.join('\n')).toMatch(/flags [0-9a-f]{12} x\.bin/)
  })

  it('ACF: LastUpdated-only difference is clean, another key is a diff', async () => {
    const p = pair({ 'a.bin': '1' })
    const tsAcf = join(dir, 'ts.acf')
    const rustAcf = join(dir, 'rust.acf')
    writeFileSync(tsAcf, ACF('4', '111'))
    writeFileSync(rustAcf, ACF('4', '222'))
    expect(
      (await runSweep(input([{ ...p, tsAcf, rustAcf }]), noFlags)).exitCode
    ).toBe(0)
    writeFileSync(rustAcf, ACF('1026', '222'))
    const r = await runSweep(input([{ ...p, tsAcf, rustAcf }]), noFlags)
    expect(r.exitCode).toBe(1)
    expect(r.lines.join('\n')).toContain('acf key StateFlags')
    expect(r.lines.join('\n')).not.toContain('1026')
  })

  it('normalizeAcf/diffAcf helpers', () => {
    expect(normalizeAcf(ACF('4', '1'))).toBe(normalizeAcf(ACF('4', '2')))
    expect(diffAcf(ACF('4', '1'), ACF('4', '9'))).toEqual([])
    expect(diffAcf(ACF('4', '1'), ACF('2', '1'))).toEqual(['StateFlags'])
  })

  it('zero title pairs exits 3', async () => {
    const r = await runSweep(
      { titles: [], logFile: join(dir, 'x.log') },
      noFlags
    )
    expect(r.exitCode).toBe(3)
  })

  it('an unreadable outcome log exits 3', async () => {
    const p = pair({ 'a.bin': '1' })
    const r = await runSweep(
      {
        titles: [{ label: 'T', appId: '1', ...p }],
        logFile: join(dir, 'nope.log')
      },
      noFlags
    )
    expect(r.exitCode).toBe(3)
  })

  it('vz=0 across all titles exits 1 with "codec coverage: vz missing"', async () => {
    const p = pair({ 'a.bin': '1' })
    const r = await runSweep(
      input([p], [outcome('900001', { vz: 0 })]),
      noFlags
    )
    expect(r.exitCode).toBe(1)
    expect(r.lines.join('\n')).toContain('codec coverage: vz missing')
  })

  it('vsza=0 and pk=0 are reported too; codecs sum across titles', async () => {
    expect(missingCodecs({ vz: 1, vsza: 0, pk: 0 })).toEqual(['vsza', 'pk'])
    const a = pair({ 'a.bin': '1' })
    const b = pair({ 'b.bin': '2' })
    const r = await runSweep(
      input(
        [
          { ...a, appId: '1' },
          { ...b, appId: '2' }
        ],
        [outcome('1', { vsza: 0, pk: 0 }), outcome('2', { vz: 0 })]
      ),
      noFlags
    )
    expect(r.codecs).toEqual({ vz: 1, vsza: 1, pk: 1 })
    expect(r.exitCode).toBe(0)
  })

  it('a missing outcome line for a title is a divergence', async () => {
    const p = pair({ 'a.bin': '1' })
    const r = await runSweep(
      input([{ ...p, appId: '555' }], [outcome('900001')]),
      noFlags
    )
    expect(r.exitCode).toBe(1)
    expect(r.lines.join('\n')).toContain('no [depot-rust] outcome line')
  })

  it('identical trees but a Rust manifest_unavailable status is surfaced (EResult-40 class)', async () => {
    const p = pair({ 'a.bin': '1' })
    const r = await runSweep(
      input(
        [
          {
            ...p,
            rustDepotStatus: { '900002': 'manifest_unavailable' },
            tsDepotStatus: { '900002': 'skipped' }
          }
        ],
        [outcome('900001', { status: 'error' })]
      ),
      noFlags
    )
    expect(r.exitCode).toBe(1)
    const text = r.lines.join('\n')
    expect(text).toContain('status ts=completed rust=error')
    expect(text).toContain('depot 900002 ts=skipped rust=manifest_unavailable')
  })

  it('parses outcome lines and ignores others', () => {
    const rows = parseOutcomeLines(
      `2026 [Steam] ${outcome('7')}\nunrelated line\n`
    )
    expect(rows).toEqual([
      {
        appId: '7',
        mode: 'install',
        status: 'completed',
        vz: 1,
        vsza: 1,
        pk: 1
      }
    ])
  })

  it('perf: MiB/s, RSS and ratio are reported and never fail the run', async () => {
    const row = perfRow({
      label: 'T',
      appId: '1',
      tsRoot: '',
      rustRoot: '',
      bytes: 100 * 1048576,
      tsSeconds: 10,
      rustSeconds: 5,
      tsPeakRssKb: 200,
      rustPeakRssKb: 100
    })
    expect(row.tsMiBps).toBeCloseTo(10)
    expect(row.rustMiBps).toBeCloseTo(20)
    expect(row.ratio).toBeCloseTo(2)
    const p = pair({ 'a.bin': '1' })
    const r = await runSweep(
      input([
        {
          ...p,
          bytes: 1048576,
          tsSeconds: 1,
          rustSeconds: 100,
          tsPeakRssKb: 1,
          rustPeakRssKb: 9999
        }
      ]),
      noFlags
    )
    expect(r.exitCode).toBe(0)
    expect(r.lines.join('\n')).toMatch(
      /rust\/ts=0\.01 rss ts=1 KiB rust=9999 KiB/
    )
  })

  it('scrub removes roots, home paths and tokens', () => {
    const out = scrub('x /Users/someone/Games/t.bin ?t=ABC123 /secret/root/a', [
      '/secret/root'
    ])
    expect(out).not.toContain('someone')
    expect(out).not.toContain('ABC123')
    expect(out).not.toContain('/secret/root')
  })
})
