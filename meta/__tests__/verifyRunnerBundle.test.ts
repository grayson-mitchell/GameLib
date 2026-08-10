/**
 * First-ever test coverage for meta/verifyRunnerBundle.ts (Phase 34.9 Plan
 * 08). Every fixture is a synthetic temp tree built with `fs.mkdtempSync`
 * under `os.tmpdir()` and torn down in `afterEach` -- nothing here touches
 * the real `public/bin` or `build/` trees, and nothing is committed.
 *
 * `codesign`/`file` are invoked FOR REAL (no mocking) -- this module's
 * `<interfaces>` note both tools are verified present on this machine and on
 * macOS CI runners, and the whole point of this tool is to observe what
 * those real tools report, not a stub of them.
 */
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { RUNNERS, inspectRunnerTree, summarise } from '../verifyRunnerBundle'

const ARCH = 'arm64'

// Real Mach-O 64-bit magic bytes as they appear on disk (MH_MAGIC_64,
// little-endian host representation): CF FA ED FE. Padded so the "file"
// command fallback path is never exercised by these fixtures (the magic
// sniff always succeeds against a readable 4+ byte file).
function machoBuffer(size = 64): Buffer {
  const buf = Buffer.alloc(size)
  buf[0] = 0xcf
  buf[1] = 0xfa
  buf[2] = 0xed
  buf[3] = 0xfe
  return buf
}

function darwinDirFor(root: string, arch: string): string {
  return join(
    root,
    'Contents',
    'Resources',
    'app.asar.unpacked',
    'build',
    'bin',
    arch,
    'darwin'
  )
}

function writeFillerFiles(dir: string, count: number): void {
  for (let i = 0; i < count; i++) {
    writeFileSync(join(dir, `filler-${i}.dat`), `not a mach-o file ${i}`)
  }
}

/**
 * Builds a full pass-case fixture: darwinDir/{legendary,gogdl,nile}/{runner}
 * each a real Mach-O magic'd, exec-bit file, plus `fillerCount` sibling
 * files per runner (default 25, above the 20-file floor).
 */
function buildPassCaseFixture(
  root: string,
  arch: string = ARCH,
  fillerCount = 25
): { darwinDir: string; binaryPaths: Record<string, string> } {
  const darwinDir = darwinDirFor(root, arch)
  const binaryPaths: Record<string, string> = {}
  for (const runner of RUNNERS) {
    const runnerDir = join(darwinDir, runner)
    mkdirSync(runnerDir, { recursive: true })
    const binaryPath = join(runnerDir, runner)
    writeFileSync(binaryPath, machoBuffer())
    chmodSync(binaryPath, 0o755)
    writeFillerFiles(runnerDir, fillerCount)
    binaryPaths[runner] = binaryPath
  }
  return { darwinDir, binaryPaths }
}

describe('verifyRunnerBundle', () => {
  let root: string

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('pass case: three well-formed onedir trees -> ok, no failures', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-pass-'))
    buildPassCaseFixture(root)

    const results = inspectRunnerTree(root, ARCH)
    expect(results).toHaveLength(3)
    for (const r of results) {
      expect(r.exists).toBe(true)
      expect(r.executable).toBe(true)
      expect(r.isMachO).toBe(true)
      expect(r.fileCount).toBeGreaterThan(20)
    }

    const summary = summarise(results)
    expect(summary.ok).toBe(true)
    expect(summary.failures).toEqual([])
  })

  it('missing runner: deleting nile/nile fails and names nile + the absolute path', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-missing-'))
    const { binaryPaths } = buildPassCaseFixture(root)
    rmSync(binaryPaths.nile)

    const results = inspectRunnerTree(root, ARCH)
    const summary = summarise(results)

    expect(summary.ok).toBe(false)
    const nileFailure = summary.failures.find((f) => f.startsWith('nile:'))
    expect(nileFailure).toBeDefined()
    expect(nileFailure).toContain(binaryPaths.nile)
  })

  it('non-executable: chmod 0o644 on gogdl/gogdl fails and names the exec bit', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-noexec-'))
    const { binaryPaths } = buildPassCaseFixture(root)
    chmodSync(binaryPaths.gogdl, 0o644)

    const results = inspectRunnerTree(root, ARCH)
    const summary = summarise(results)

    expect(summary.ok).toBe(false)
    const gogdlFailure = summary.failures.find((f) =>
      f.startsWith('gogdl:')
    )
    expect(gogdlFailure).toBeDefined()
    expect(gogdlFailure).toMatch(/exec bit/)
  })

  it('not Mach-O: legendary/legendary as plain text fails and says so', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-notmacho-'))
    const { binaryPaths } = buildPassCaseFixture(root)
    writeFileSync(binaryPaths.legendary, 'this is not a mach-o binary')
    chmodSync(binaryPaths.legendary, 0o755)

    const results = inspectRunnerTree(root, ARCH)
    const summary = summarise(results)

    expect(summary.ok).toBe(false)
    const legendaryFailure = summary.failures.find((f) =>
      f.startsWith('legendary:')
    )
    expect(legendaryFailure).toBeDefined()
    expect(legendaryFailure).toMatch(/not a Mach-O/)
  })

  it('smuggled onefile: a nile tree with only 3 files fails on the file-count floor', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-smuggled-'))
    const darwinDir = darwinDirFor(root, ARCH)

    // legendary/gogdl are well-formed; nile is a smuggled onefile shape.
    for (const runner of ['legendary', 'gogdl'] as const) {
      const runnerDir = join(darwinDir, runner)
      mkdirSync(runnerDir, { recursive: true })
      const binaryPath = join(runnerDir, runner)
      writeFileSync(binaryPath, machoBuffer())
      chmodSync(binaryPath, 0o755)
      writeFillerFiles(runnerDir, 25)
    }
    const nileDir = join(darwinDir, 'nile')
    mkdirSync(nileDir, { recursive: true })
    const nileBinaryPath = join(nileDir, 'nile')
    writeFileSync(nileBinaryPath, machoBuffer())
    chmodSync(nileBinaryPath, 0o755)
    writeFillerFiles(nileDir, 2)

    const results = inspectRunnerTree(root, ARCH)
    const nileResult = results.find((r) => r.runner === 'nile')
    expect(nileResult?.fileCount).toBe(3)
    expect(nileResult?.exists).toBe(true)
    expect(nileResult?.executable).toBe(true)
    expect(nileResult?.isMachO).toBe(true)

    const summary = summarise(results)
    expect(summary.ok).toBe(false)
    const nileFailure = summary.failures.find((f) => f.startsWith('nile:'))
    expect(nileFailure).toBeDefined()
    expect(nileFailure).toMatch(/floor/)
  })

  it('tree not found: no build/bin/{arch}/darwin segment -> throws naming root and arch', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-notfound-'))
    mkdirSync(join(root, 'unrelated', 'nested', 'dir'), { recursive: true })

    expect(() => inspectRunnerTree(root, ARCH)).toThrow(root)
    expect(() => inspectRunnerTree(root, ARCH)).toThrow(ARCH)
  })

  it('signature reporting is not enforcement: pass-case files are unsigned, ok stays true', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-signature-'))
    buildPassCaseFixture(root)

    const results = inspectRunnerTree(root, ARCH)
    const summary = summarise(results)
    expect(summary.ok).toBe(true)

    for (const r of results) {
      expect(r.machoCount).toBeGreaterThan(0)
      for (const m of r.machoFiles) {
        expect(m.signature).toBe('unsigned')
      }
    }
  })

  it('scope: a broken comet file and a win32 directory alongside darwin still pass', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-scope-'))
    const { darwinDir } = buildPassCaseFixture(root)

    // Broken comet file INSIDE the darwin dir, sibling to the three runner
    // directories -- never inspected because RUNNERS is exactly the three
    // onedir names.
    writeFileSync(join(darwinDir, 'comet'), 'broken, not a real binary')

    // win32/ directory sibling to darwin/ (same build/bin/${arch} parent) --
    // never traversed into because findDarwinBinRoot stops at the first
    // matching darwin directory.
    const binArchDir = join(darwinDir, '..')
    const win32LegendaryDir = join(binArchDir, 'win32', 'legendary')
    mkdirSync(win32LegendaryDir, { recursive: true })
    writeFileSync(join(win32LegendaryDir, 'legendary.exe'), 'broken PE stub')

    const results = inspectRunnerTree(root, ARCH)
    const summary = summarise(results)
    expect(summary.ok).toBe(true)
    expect(summary.failures).toEqual([])
  })
})
