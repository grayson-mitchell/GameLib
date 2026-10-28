/**
 * Phase 56 plan 10: the steamclient-layer component installer. No network:
 * fetchArchive is injected and the catalogue entry is a synthetic one built
 * in-test (real release coordinates, small synthetic files).
 */

import { createHash } from 'crypto'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
  mkdirSync
} from 'fs'
import { tmpdir } from 'os'
import { basename, dirname, join } from 'path'

const mockLogWarning = jest.fn()
const mockLogInfo = jest.fn()
jest.mock('backend/logger', () => ({
  logWarning: (...a: unknown[]) => mockLogWarning(...a),
  logInfo: (...a: unknown[]) => mockLogInfo(...a),
  logDebug: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend', Steam: 'Steam' }
}))

import { buildOverlayTarGz } from 'backend/knownFixOverlayArchive'
import {
  callAllAbortControllers,
  hasAbortController
} from 'backend/utils/aborthandler/aborthandler'
import {
  SteamclientLayerCatalogueEntry,
  lookupSteamclientLayer,
  steamclientLayerArchiveUrl,
  steamclientLayerReleasePageUrl
} from 'common/steamclientLayerCatalogue'
import { buildDrmPaths, steamclientLayerComponentId } from '../drmPaths'
import { ensureSteamclientLayerComponent } from '../steamclientLayerInstall'

const BUILD = '26.3.0.39832'
const ID = `steamclient-layer-cx${BUILD}`
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

const NAMES = [
  'LICENSE.lsteamclient',
  'NOTICE',
  `detour-cx${BUILD}.bin`,
  'lsteamclient.dll',
  'lsteamclient.so',
  'steam.exe'
]
const LICENCES: Record<
  string,
  'licence-text' | 'Steamworks-SDK-License' | 'GPL-3.0' | 'BSD-3-Clause'
> = {
  'LICENSE.lsteamclient': 'licence-text',
  NOTICE: 'licence-text',
  [`detour-cx${BUILD}.bin`]: 'GPL-3.0',
  'lsteamclient.dll': 'Steamworks-SDK-License',
  'lsteamclient.so': 'Steamworks-SDK-License',
  'steam.exe': 'BSD-3-Clause'
}

function synthetic(
  fileOverride: Record<string, Buffer> = {},
  entryOver: Partial<SteamclientLayerCatalogueEntry> = {}
) {
  const data = new Map(
    NAMES.map((n) => [n, Buffer.from(`synthetic ${n}`)] as const)
  )
  const files = NAMES.map((path) => ({
    path,
    sha256: sha(data.get(path)!),
    size: data.get(path)!.length,
    licence: LICENCES[path]
  }))
  const archive = buildOverlayTarGz(
    NAMES.map((path) => ({
      path,
      data: fileOverride[path] ?? data.get(path)!
    }))
  )
  const base = lookupSteamclientLayer(BUILD)!
  const entry: SteamclientLayerCatalogueEntry = {
    ...base,
    files,
    archiveSha256: sha(archive),
    archiveSize: archive.length,
    ...entryOver
  }
  return { entry, archive, data }
}

let appFolder: string
const tmps: string[] = []
beforeEach(() => {
  appFolder = mkdtempSync(join(tmpdir(), 'gamelib-layer-'))
  tmps.push(appFolder)
  mockLogWarning.mockClear()
  mockLogInfo.mockClear()
})
afterEach(() => {
  while (tmps.length) {
    const t = tmps.pop()!
    try {
      chmodSync(t, 0o700)
    } catch {
      /* gone */
    }
    rmSync(t, { recursive: true, force: true })
  }
})

const root = () => buildDrmPaths(appFolder)!.componentRoot
const dir = () => buildDrmPaths(appFolder)!.componentDir(ID)!
const okCodesign = () =>
  jest.fn(() =>
    Promise.resolve({ code: 0, stdout: '', stderr: '', timedOut: false })
  )
const run = (
  entry: SteamclientLayerCatalogueEntry | undefined,
  deps: Parameters<typeof ensureSteamclientLayerComponent>[1] = {},
  build = BUILD
) =>
  ensureSteamclientLayerComponent(
    { appFolder, crossoverBuild: build },
    { lookupEntry: () => entry, ...deps }
  )

describe('ensureSteamclientLayerComponent', () => {
  it('downloads, signs off, installs and reports ok', async () => {
    const { entry, archive, data } = synthetic()
    const fetchArchive = jest.fn((_url: string, _o: { maxBytes: number }) =>
      Promise.resolve(archive)
    )
    const runCodesign = jest.fn((_a: readonly string[], _o: unknown) =>
      Promise.resolve({
        code: 0,
        stdout: '',
        stderr: '',
        timedOut: false
      })
    )
    const onFetchStart = jest.fn()
    const r = await run(entry, { fetchArchive, runCodesign, onFetchStart })
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.source).toBe('download')
    expect(r.componentId).toBe(ID)
    expect(r.componentDir).toBe(dir())
    expect(r.files.lsteamclientDll).toBe(join(dir(), 'lsteamclient.dll'))
    expect(r.files.lsteamclientSo).toBe(join(dir(), 'lsteamclient.so'))
    expect(r.files.detourPayload).toBe(join(dir(), `detour-cx${BUILD}.bin`))
    expect(r.files.helperExe).toBe(join(dir(), 'steam.exe'))
    expect(r.files.licence).toBe(join(dir(), 'LICENSE.lsteamclient'))
    expect(r.files.notice).toBe(join(dir(), 'NOTICE'))
    expect(readdirSync(dir()).sort()).toEqual([...NAMES].sort())
    for (const n of NAMES) {
      expect(readFileSync(join(dir(), n)).equals(data.get(n)!)).toBe(true)
    }
    expect(fetchArchive).toHaveBeenCalledTimes(1)
    expect(fetchArchive.mock.calls[0][0]).toBe(
      steamclientLayerArchiveUrl(entry)
    )
    expect(fetchArchive.mock.calls[0][1].maxBytes).toBe(entry.archiveSize)
    expect(onFetchStart).toHaveBeenCalledTimes(1)
    expect(runCodesign).toHaveBeenCalledTimes(1)
    const args = runCodesign.mock.calls[0][0]
    expect(args[0]).toBe('--remove-signature')
    expect(basename(args[1])).toBe('lsteamclient.so')
    expect(basename(dirname(args[1]))).toMatch(
      new RegExp(`^\\.${ID.replace(/\./g, '\\.')}\\.partial-`)
    )
    expect(statSync(root()).mode & 0o777).toBe(0o700)
  })

  it('reuses a verified cache with no fetch and no spawn', async () => {
    const { entry, archive } = synthetic()
    await run(entry, {
      fetchArchive: async () => archive,
      runCodesign: okCodesign()
    })
    const fetchArchive = jest.fn().mockRejectedValue(new Error('no'))
    const runCodesign = jest.fn().mockRejectedValue(new Error('no'))
    const onFetchStart = jest.fn()
    const r = await run(entry, { fetchArchive, runCodesign, onFetchStart })
    expect(r).toMatchObject({ status: 'ok', source: 'cache' })
    expect(fetchArchive).not.toHaveBeenCalled()
    expect(runCodesign).not.toHaveBeenCalled()
    expect(onFetchStart).not.toHaveBeenCalled()
  })

  it('replaces a tampered cache and one with an extra file', async () => {
    const { entry, archive, data } = synthetic()
    const deps = () => ({
      fetchArchive: jest.fn(() => Promise.resolve(archive)),
      runCodesign: okCodesign()
    })
    await run(entry, deps())
    writeFileSync(join(dir(), 'steam.exe'), 'tampered bytes')
    const d1 = deps()
    expect((await run(entry, d1)).status).toBe('ok')
    expect(d1.fetchArchive).toHaveBeenCalledTimes(1)
    expect(
      readFileSync(join(dir(), 'steam.exe')).equals(data.get('steam.exe')!)
    ).toBe(true)
    writeFileSync(join(dir(), 'x.dll'), 'extra')
    const d2 = deps()
    expect((await run(entry, d2)).status).toBe('ok')
    expect(d2.fetchArchive).toHaveBeenCalledTimes(1)
    expect(existsSync(join(dir(), 'x.dll'))).toBe(false)
  })

  it('reports component-missing when there is no entry', async () => {
    const fetchArchive = jest.fn()
    const r = await run(undefined, { fetchArchive })
    expect(r).toMatchObject({ status: 'error', step: 'component-missing' })
    expect((r as { cause: string }).cause).toContain(
      'no steamclient-layer component for CrossOver'
    )
    expect(fetchArchive).not.toHaveBeenCalled()
  })

  it('reports component-missing on a 404 and installs nothing', async () => {
    const { entry } = synthetic()
    const r = await run(entry, {
      fetchArchive: async () => {
        throw new Error('Request failed with status code 404')
      },
      runCodesign: okCodesign()
    })
    expect(r).toMatchObject({ status: 'error', step: 'component-missing' })
    expect((r as { cause: string }).cause).toContain('404')
    expect(readdirSync(root())).toEqual([])
  })

  it('reports component-verify for a wrong archive sha or size', async () => {
    const { entry, archive } = synthetic()
    const flip = entry.archiveSha256.replace(/.$/, (c) =>
      c === '0' ? '1' : '0'
    )
    const a = await run(
      { ...entry, archiveSha256: flip },
      { fetchArchive: async () => archive, runCodesign: okCodesign() }
    )
    expect(a).toMatchObject({ status: 'error', step: 'component-verify' })
    expect((a as { cause: string }).cause).toContain('sha256')
    const b = await run(
      { ...entry, archiveSize: entry.archiveSize + 1 },
      { fetchArchive: async () => archive, runCodesign: okCodesign() }
    )
    expect(b).toMatchObject({ status: 'error', step: 'component-verify' })
    expect((b as { cause: string }).cause).toContain('size')
    expect(readdirSync(root())).toEqual([])
  })

  it('reports component-verify for bad archive contents', async () => {
    const mismatched = [
      synthetic({ 'steam.exe': Buffer.from('different bytes!!') }),
      (() => {
        const s = synthetic()
        const extra = buildOverlayTarGz([
          ...NAMES.map((path) => ({ path, data: s.data.get(path)! })),
          { path: 'extra.dll', data: Buffer.from('x') }
        ])
        return {
          ...s,
          archive: extra,
          entry: {
            ...s.entry,
            archiveSha256: sha(extra),
            archiveSize: extra.length
          }
        }
      })(),
      (() => {
        const s = synthetic()
        const less = buildOverlayTarGz(
          NAMES.filter((n) => n !== 'NOTICE').map((path) => ({
            path,
            data: s.data.get(path)!
          }))
        )
        return {
          ...s,
          archive: less,
          entry: {
            ...s.entry,
            archiveSha256: sha(less),
            archiveSize: less.length
          }
        }
      })()
    ]
    for (const m of mismatched) {
      const entry = {
        ...m.entry,
        archiveSha256: sha(m.archive),
        archiveSize: m.archive.length
      }
      const r = await run(entry, {
        fetchArchive: async () => m.archive,
        runCodesign: okCodesign()
      })
      expect(r).toMatchObject({ status: 'error', step: 'component-verify' })
    }
    expect(readdirSync(root())).toEqual([])
  })

  it('fails closed on codesign problems', async () => {
    const { entry, archive } = synthetic()
    const fetchArchive = () => Promise.resolve(archive)
    const nonZero = await run(entry, {
      fetchArchive,
      runCodesign: async () => ({
        code: 1,
        stdout: '',
        stderr: 'boom',
        timedOut: false
      })
    })
    expect(nonZero).toMatchObject({ status: 'error', step: 'component-verify' })
    expect((nonZero as { cause: string }).cause).toContain('codesign')
    const timedOut = await run(entry, {
      fetchArchive,
      runCodesign: async () => ({
        code: null,
        stdout: '',
        stderr: '',
        timedOut: true
      })
    })
    expect(timedOut).toMatchObject({
      status: 'error',
      step: 'component-verify'
    })
    expect((timedOut as { cause: string }).cause).toContain('codesign')
    const mutating = await run(entry, {
      fetchArchive,
      runCodesign: async (args) => {
        const { appendFileSync } = await import('fs')
        appendFileSync(args[1], 'X')
        return { code: 0, stdout: '', stderr: '', timedOut: false }
      }
    })
    expect(mutating).toMatchObject({
      status: 'error',
      step: 'component-verify'
    })
    expect((mutating as { cause: string }).cause).toContain(
      'changed after signature removal'
    )
    expect(readdirSync(root())).toEqual([])
  })

  const realCodesign = existsSync('/usr/bin/codesign') ? it : it.skip
  realCodesign('runs the real codesign on a non-Mach-O file', async () => {
    const { entry, archive, data } = synthetic()
    const r = await run(entry, { fetchArchive: async () => archive })
    expect(r.status).toBe('ok')
    expect(
      readFileSync(join(dir(), 'lsteamclient.so')).equals(
        data.get('lsteamclient.so')!
      )
    ).toBe(true)
  })

  it('times out and aborts a hanging download, clearing the controller', async () => {
    const { entry } = synthetic()
    const hang = () => new Promise<Buffer>(() => undefined)
    const t = await run(entry, { fetchArchive: hang, timeoutMs: 30 })
    expect(t).toMatchObject({ status: 'error', step: 'component-missing' })
    expect((t as { cause: string }).cause).toContain('timed out')
    expect(hasAbortController(`drm-steamclient-layer:${BUILD}`)).toBe(false)

    const pending = run(entry, { fetchArchive: hang, timeoutMs: 60_000 })
    await new Promise((r) => setTimeout(r, 50))
    expect(hasAbortController(`drm-steamclient-layer:${BUILD}`)).toBe(true)
    callAllAbortControllers()
    const a = await pending
    expect(a).toMatchObject({ status: 'error', step: 'component-missing' })
    expect((a as { cause: string }).cause).toContain('aborted')
    expect(hasAbortController(`drm-steamclient-layer:${BUILD}`)).toBe(false)
  })

  it('shares one fetch between concurrent calls', async () => {
    const { entry, archive } = synthetic()
    const fetchArchive = jest.fn(async () => {
      await new Promise((r) => setTimeout(r, 20))
      return archive
    })
    const deps = { fetchArchive, runCodesign: okCodesign() }
    const [a, b] = await Promise.all([run(entry, deps), run(entry, deps)])
    expect(a.status).toBe('ok')
    expect(b.status).toBe('ok')
    expect(fetchArchive).toHaveBeenCalledTimes(1)
  })

  it('rejects a bad app folder or build without fetching', async () => {
    const { entry } = synthetic()
    const fetchArchive = jest.fn()
    const a = await ensureSteamclientLayerComponent(
      { appFolder: 'relative/dir', crossoverBuild: BUILD },
      { lookupEntry: () => entry, fetchArchive }
    )
    expect(a).toEqual({
      status: 'error',
      step: 'component-missing',
      cause: 'invalid app folder'
    })
    const b = await run(entry, { fetchArchive }, '26.3')
    expect(b).toEqual({
      status: 'error',
      step: 'component-missing',
      cause: 'invalid CrossOver build'
    })
    expect(fetchArchive).not.toHaveBeenCalled()
  })

  it('refuses a symlinked component root', async () => {
    const { entry, archive } = synthetic()
    const other = mkdtempSync(join(tmpdir(), 'gamelib-layer-other-'))
    tmps.push(other)
    mkdirSync(dirname(root()), { recursive: true })
    symlinkSync(other, root())
    const r = await run(entry, {
      fetchArchive: async () => archive,
      runCodesign: okCodesign()
    })
    expect(r).toMatchObject({ status: 'error', step: 'component-verify' })
    expect(readdirSync(other)).toEqual([])
  })

  it('refuses inconsistent catalogue entries before fetching', async () => {
    const { entry } = synthetic()
    const fetchArchive = jest.fn()
    const bad = [
      { ...entry, release: { ...entry.release, repo: 'evil/GameLib' } },
      { ...entry, id: 'steamclient-layer-cx1.2.3' },
      { ...entry, files: entry.files.filter((f) => f.path !== 'NOTICE') }
    ]
    for (const e of bad) {
      const r = await run(e, { fetchArchive })
      expect(r).toMatchObject({ status: 'error', step: 'component-verify' })
      expect((r as { cause: string }).cause).toContain('catalogue')
    }
    expect(fetchArchive).not.toHaveBeenCalled()
  })

  it('never rejects and logs a warning on errors', async () => {
    const r = await run(undefined)
    expect(r.status).toBe('error')
    expect(mockLogWarning).toHaveBeenCalled()
  })
})

describe('module hygiene', () => {
  const src = readFileSync(
    join(__dirname, '..', 'steamclientLayerInstall.ts'),
    'utf8'
  )
  it('imports nothing it must not and logs no reserved tokens', () => {
    expect(src).not.toContain("from 'backend/launcher'")
    expect(src).not.toContain("from 'backend/utils'")
    expect(src).not.toContain('constants/paths')
    for (const t of ['[bridge-notice]', '[bridge-drm]', '[drm-trace]']) {
      expect(src).not.toContain(t)
    }
    expect(src).toContain('createFakeHomeProfile(')
    expect(src).toContain("'/usr/bin/codesign'")
  })
  it('leaves no abort controller registered after import', () => {
    expect(hasAbortController(`drm-steamclient-layer:${BUILD}`)).toBe(false)
  })
})

describe('real catalogue', () => {
  it('matches the 56-04 id and path contracts', () => {
    const e = lookupSteamclientLayer(BUILD)!
    expect(e.id).toBe(steamclientLayerComponentId(BUILD))
    expect(steamclientLayerReleasePageUrl(e)).toBe(
      `https://github.com/grayson-mitchell/GameLib/releases/tag/steamclient-layer-cx${BUILD}`
    )
    expect(buildDrmPaths('/tmp/x')!.componentDir(e.id)).not.toBeNull()
  })
})
