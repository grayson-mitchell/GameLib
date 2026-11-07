import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'

const mockProfile = createFakeHomeProfile({ prefix: 'gamelib-bottleprim-' })

jest.mock('backend/constants/paths', () => ({
  get userHome() {
    return mockProfile.root
  }
}))
jest.mock('backend/config', () => ({ GlobalConfig: { get: jest.fn() } }))
jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('backend/utils', () => ({ spawnAsync: jest.fn() }))

import { spawnAsync } from 'backend/utils'
import {
  getBottleDir,
  isBottleProvisioned,
  killBottleWineServerWith,
  sanitizeBottleName
} from '../bottlePrimitives'

afterAll(() => mockProfile.dispose())

describe('getBottleDir', () => {
  it('sits under the CrossOver Bottles directory', () => {
    expect(getBottleDir('X')).toBe(
      join(mockProfile.root, 'Library/Application Support/CrossOver/Bottles/X')
    )
    expect(
      getBottleDir('X').endsWith(
        'Library/Application Support/CrossOver/Bottles/X'
      )
    ).toBe(true)
  })
})

describe('sanitizeBottleName', () => {
  it.each(['a/b', 'a\\b', '..', 'a\u0000b', '', '   '])(
    'rejects %j',
    (name) => {
      expect(sanitizeBottleName(name)).toBeNull()
    }
  )

  it('rejects non-strings and trims clean names', () => {
    expect(sanitizeBottleName(null)).toBeNull()
    expect(sanitizeBottleName('  Good-Bottle  ')).toBe('Good-Bottle')
  })
})

describe('isBottleProvisioned', () => {
  it('is true only when <dir>/cxbottle.conf exists', () => {
    expect(isBottleProvisioned('Prov')).toBe(false)
    mkdirSync(getBottleDir('Prov'), { recursive: true })
    expect(isBottleProvisioned('Prov')).toBe(false)
    writeFileSync(join(getBottleDir('Prov'), 'cxbottle.conf'), '[Bottle]\n')
    expect(isBottleProvisioned('Prov')).toBe(true)
  })
})

describe('killBottleWineServerWith', () => {
  it.each(['a/b', '..', '../escape', ''])(
    'refuses unsafe name %j without spawning',
    async (name) => {
      await expect(
        killBottleWineServerWith(name, '/bin/wineserver', {}, 1000)
      ).resolves.toBe(false)
      expect(spawnAsync).not.toHaveBeenCalled()
    }
  )

  it('runs wineserver -k against the bottle prefix for a safe name', async () => {
    jest.mocked(spawnAsync).mockResolvedValue({ code: 0 } as never)
    await expect(
      killBottleWineServerWith('Safe', '/bin/wineserver', { USER: 'u' }, 1000)
    ).resolves.toBe(true)
    expect(spawnAsync).toHaveBeenCalledWith(
      '/bin/wineserver',
      ['-k'],
      expect.objectContaining({
        env: expect.objectContaining({ WINEPREFIX: getBottleDir('Safe') })
      })
    )
  })
})
