import { mkdtemp, mkdir, writeFile, rm, access } from 'fs/promises'
import { tmpdir } from 'os'
import { join, resolve, sep } from 'path'
import { logInfo, logWarning, logError } from '../../logger'
import {
  LEGACY_ZOOM_PATHS,
  removeLegacyZoomData
} from '../legacyZoomDataCleanup'

jest.mock('../../logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

const exists = (p: string) =>
  access(p).then(
    () => true,
    () => false
  )

describe('removeLegacyZoomData', () => {
  let dir: string

  beforeEach(async () => {
    jest.clearAllMocks()
    dir = await mkdtemp(join(tmpdir(), 'legacy-zoom-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('removes the zoom folder and cache files, leaving unrelated files', async () => {
    await mkdir(join(dir, 'zoom_store'))
    await mkdir(join(dir, 'store_cache'))
    for (const f of ['.zoom.token', 'installed.json', 'config.json']) {
      await writeFile(join(dir, 'zoom_store', f), 'x')
    }
    await writeFile(join(dir, 'store_cache', 'zoom_library.json'), '{}')
    await writeFile(join(dir, 'store_cache', 'zoom_install_info.json'), '{}')
    await writeFile(join(dir, 'store_cache', 'gog_library.json'), '{}')

    await removeLegacyZoomData(dir)

    expect(await exists(join(dir, 'zoom_store'))).toBe(false)
    expect(await exists(join(dir, 'store_cache', 'zoom_library.json'))).toBe(
      false
    )
    expect(
      await exists(join(dir, 'store_cache', 'zoom_install_info.json'))
    ).toBe(false)
    expect(await exists(join(dir, 'store_cache', 'gog_library.json'))).toBe(
      true
    )
    expect(logInfo).toHaveBeenCalledTimes(3)
  })

  it('is silent when nothing exists', async () => {
    await expect(removeLegacyZoomData(dir)).resolves.toBeUndefined()
    expect(logWarning).not.toHaveBeenCalled()
    expect(logError).not.toHaveBeenCalled()
    expect(logInfo).not.toHaveBeenCalled()
  })

  it('logs and continues when one removal fails, never rejecting', async () => {
    const rmFn = jest.fn(async (path: string) => {
      if (path.endsWith('zoom_library.json')) {
        throw Object.assign(new Error('denied'), { code: 'EACCES' })
      }
    })
    await expect(
      removeLegacyZoomData(dir, { rm: rmFn })
    ).resolves.toBeUndefined()
    expect(rmFn).toHaveBeenCalledTimes(3)
    expect(logWarning).toHaveBeenCalledTimes(1)
    expect((logWarning as jest.Mock).mock.calls[0][0] as string).toContain(
      'zoom_library.json'
    )
  })

  it('targets exactly three relative paths inside userData', () => {
    expect([...LEGACY_ZOOM_PATHS]).toEqual([
      'zoom_store',
      'store_cache/zoom_library.json',
      'store_cache/zoom_install_info.json'
    ])
    for (const rel of LEGACY_ZOOM_PATHS) {
      expect(rel.startsWith('/')).toBe(false)
      expect(resolve(dir, rel).startsWith(resolve(dir) + sep)).toBe(true)
    }
  })
})
