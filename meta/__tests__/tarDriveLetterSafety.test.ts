/**
 * EXECUTED real-tar gate for meta/downloadHelperBinaries.ts's two tar call
 * sites, added alongside the Windows drive-letter fix (todo
 * 2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host).
 *
 * Deliberately does NOT `jest.mock('child_process')` -- the whole point is
 * that the real system tar runs. meta/__tests__/downloadHelperBinaries.test.ts
 * mocks child_process wholesale, so before this file NO test had ever executed
 * tar against these functions; its argv pins were satisfied by the broken and
 * the fixed code alike. The Meta jest project (meta/jest.config.js) has no
 * setupFiles and no containment setup, which is what makes a real spawn
 * possible here.
 *
 * WHAT THIS PROVES, EXACTLY: that moving the -f operand to a basename + cwd,
 * and resolving destDir in the parent, did not break the WORKING (macOS) path,
 * and that extraction still honours -C independently of cwd. It proves
 * NOTHING about the Windows failure. Measured 2026-09-21 on this host, macOS
 * bsdtar 3.5.3 does NOT remote-parse a colon-bearing archive path, so no
 * executed test here can go red for the reported defect -- only the argv pins
 * in downloadHelperBinaries.test.ts can. Do not read a green run of this file
 * as evidence the Windows leg is fixed.
 *
 * No fake-HOME env block on purpose: `tar` reads no profile data, and
 * hand-rolling a home/config/state env literal at a spawn site is exactly what
 * src/backend/__tests__/fakeHomeIsolation.test.ts forbids. That gate inspects
 * env-key assignment only; the `cwd` option this fix adds is not inspected.
 *
 * If tar is unavailable the suite FAILS rather than skipping. A conditional
 * skip would make this a gate that cannot see its own subject.
 */
import { spawn } from 'child_process'
import { mkdtemp, mkdir, rm, writeFile, stat, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { extractTarGz, listTarEntries } from '../downloadHelperBinaries'

jest.setTimeout(60_000)

const ENTRY_DIR = 'fixture-runner'
const INNER_FILE = 'payload.txt'
const INNER_CONTENT = 'p57-fixture-payload\n'

let stagingDir = ''
let archiveDir = ''
let extractDir = ''
let relativeCwdDir = ''
let archivePath = ''

const originalCwd = process.cwd()

/** Runs the real tar to BUILD the fixture archive. Rejects on any failure. */
function buildFixtureArchive(
  outPath: string,
  fromDir: string,
  entryDirName: string
): Promise<void> {
  return new Promise((resolveP, reject) => {
    const child = spawn('tar', ['-czf', outPath, '-C', fromDir, entryDirName], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stderr = ''
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolveP()
      else
        reject(new Error(`fixture tar -czf failed (exit ${code}): ${stderr}`))
    })
  })
}

const pathExists = async (p: string): Promise<boolean> =>
  stat(p).then(
    () => true,
    () => false
  )

beforeAll(async () => {
  // Three SEPARATE mkdtemp roots. archiveDir and extractDir must not be
  // parent/child of one another: that is what makes "-C was honoured
  // independently of cwd" an actual measurement rather than a coincidence.
  stagingDir = await mkdtemp(join(tmpdir(), 'p57-stage-'))
  archiveDir = await mkdtemp(join(tmpdir(), 'p57-archive-'))
  extractDir = await mkdtemp(join(tmpdir(), 'p57-extract-'))
  relativeCwdDir = await mkdtemp(join(tmpdir(), 'p57-relcwd-'))

  await mkdir(join(stagingDir, ENTRY_DIR), { recursive: true })
  await writeFile(join(stagingDir, ENTRY_DIR, INNER_FILE), INNER_CONTENT)

  archivePath = join(archiveDir, 'fixture_macOS_arm64_onedir.tar.gz')
  await buildFixtureArchive(archivePath, stagingDir, ENTRY_DIR)
})

afterEach(() => {
  process.chdir(originalCwd)
})

afterAll(async () => {
  process.chdir(originalCwd)
  for (const dir of [stagingDir, archiveDir, extractDir, relativeCwdDir]) {
    if (dir) await rm(dir, { recursive: true, force: true })
  }
})

describe('listTarEntries against the real system tar', () => {
  it('lists the fixture archive entries when handed an ABSOLUTE archive path', async () => {
    const entries = await listTarEntries(archivePath)

    expect(entries).toContain(`${ENTRY_DIR}/`)
    expect(entries).toContain(`${ENTRY_DIR}/${INNER_FILE}`)
    // No blank trailing entry leaked in from the split('\n').
    expect(entries.every((e) => e.length > 0)).toBe(true)
  })

  it('rejects with the tar -tzf failure message for a missing archive', async () => {
    await expect(
      listTarEntries(join(archiveDir, 'no-such-archive.tar.gz'))
    ).rejects.toThrow(/tar -tzf failed/)
  })
})

describe('extractTarGz against the real system tar', () => {
  it('extracts under the ABSOLUTE destination, not next to the archive', async () => {
    await extractTarGz(archivePath, extractDir)

    const extracted = join(extractDir, ENTRY_DIR, INNER_FILE)
    expect(await pathExists(extracted)).toBe(true)
    expect(await readFile(extracted, 'utf-8')).toBe(INNER_CONTENT)

    // Negative control for the relocation hazard the cwd remedy introduces:
    // cwd is now the archive's directory, so a mishandled -C would drop the
    // tree right here instead.
    expect(await pathExists(join(archiveDir, ENTRY_DIR))).toBe(false)
  })

  it('resolves a RELATIVE destDir against the CALLER cwd, not the archive directory', async () => {
    // This is the assertion that would have caught the relocation bug: the
    // production caller passes the repo-relative join('public','bin',arch,
    // 'darwin'), and the fix resolves it in the parent BEFORE cwd moves to
    // the archive's tmpdir. Revert that resolve() and this test goes red.
    process.chdir(relativeCwdDir)
    const relativeDest = join('nested', 'dest')
    await mkdir(join(relativeCwdDir, 'nested', 'dest'), { recursive: true })

    await extractTarGz(archivePath, relativeDest)

    expect(
      await pathExists(
        join(relativeCwdDir, 'nested', 'dest', ENTRY_DIR, INNER_FILE)
      )
    ).toBe(true)
    // NOT beside the archive, which is where a relative -C would have landed
    // once cwd moved.
    expect(await pathExists(join(archiveDir, 'nested'))).toBe(false)
    expect(await pathExists(join(archiveDir, ENTRY_DIR))).toBe(false)
  })

  it('rejects with the extraction failure message for a missing archive', async () => {
    await expect(
      extractTarGz(join(archiveDir, 'no-such-archive.tar.gz'), extractDir)
    ).rejects.toThrow(/tar extraction failed/)
  })
})
