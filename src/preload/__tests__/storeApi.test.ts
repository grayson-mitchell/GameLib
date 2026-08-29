/**
 * misc.ts's collapsed store bridge (`storeNew`/`storeGet`/`storeSet`/`storeHas`/
 * `storeDelete`) -- Phase 35 plan 16, D-01/D-02/D-04/D-08 convergence.
 *
 * Before this plan these five functions each carried a Tauri-context branch pair (a
 * Tauri body plus an Electron-only fallback that constructed a real, file-system-backed
 * `electron-store` instance via a lazy `require`), and `storeGet` additionally guarded
 * reads with a locally duplicated `SECRET_STORE_KEYS` deny-list, independent of the
 * Tauri path's `isAllowedStoreField` allow-list in `common/types/storePolicy.ts`. This
 * suite proves the collapsed replacement: every function now delegates unconditionally
 * to its `tauriTransport.ts` snapshot counterpart, and `storeGet` gates on
 * `isAllowedStoreField` -- the SAME predicate `storePolicy.test.ts`'s D-08 convergence
 * assertions (plan 35-16 task 1) proved subsumes every field the old deny-list named.
 *
 * Mirrors `gamepadActionRouting.test.ts`'s mocking style: `electron` is proven never
 * resolved, and the `tauriTransport` module is mocked so this file exercises only the
 * DELEGATION decision in `misc.ts`, not `tauriTransport.ts`'s own snapshot logic (that
 * is `tauriTransport.test.ts`'s job).
 */

jest.mock('electron', () => {
  throw new Error('electron must not be resolved on the Tauri path (T-27-07)')
})

const mockedRegisterStore = jest.fn()
const mockedSnapshotGet = jest.fn()
const mockedSnapshotHas = jest.fn()
const mockedSnapshotSet = jest.fn()
const mockedSnapshotDelete = jest.fn()

jest.mock('../tauriTransport', () => ({
  registerStore: (...args: unknown[]) => mockedRegisterStore(...args),
  snapshotGet: (...args: unknown[]) => mockedSnapshotGet(...args),
  snapshotHas: (...args: unknown[]) => mockedSnapshotHas(...args),
  snapshotSet: (...args: unknown[]) => mockedSnapshotSet(...args),
  snapshotDelete: (...args: unknown[]) => mockedSnapshotDelete(...args)
}))

import { storeNew, storeGet, storeSet, storeHas, storeDelete } from '../api/misc'

describe('misc.ts store bridge delegation (D-01/D-02/D-04 convergence)', () => {
  beforeEach(() => {
    mockedSnapshotGet.mockReturnValue(undefined)
    mockedSnapshotHas.mockReturnValue(false)
  })

  it('storeNew delegates unconditionally to registerStore, with no electron-store fallback', () => {
    storeNew('configStore', { defaults: {} })

    expect(mockedRegisterStore).toHaveBeenCalledWith('configStore', { defaults: {} })
  })

  it('storeSet delegates unconditionally to snapshotSet', () => {
    storeSet('configStore', 'theme', 'dark')

    expect(mockedSnapshotSet).toHaveBeenCalledWith('configStore', 'theme', 'dark')
  })

  it('storeHas delegates unconditionally to snapshotHas and returns its result', () => {
    mockedSnapshotHas.mockReturnValue(true)

    expect(storeHas('configStore', 'theme')).toBe(true)
    expect(mockedSnapshotHas).toHaveBeenCalledWith('configStore', 'theme')
  })

  it('storeDelete delegates unconditionally to snapshotDelete', () => {
    storeDelete('configStore', 'theme')

    expect(mockedSnapshotDelete).toHaveBeenCalledWith('configStore', 'theme')
  })

  describe('storeGet', () => {
    it('blocks a known-secret field by name via isAllowedStoreField, without reaching snapshotGet', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)

      const result = storeGet('steamConfigStore', 'refreshToken', 'FALLBACK')

      expect(result).toBeUndefined()
      expect(mockedSnapshotGet).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('blocked read of credential key "refreshToken" from "steamConfigStore"')
      )
      warnSpy.mockRestore()
    })

    it('blocks a nested path under a known-secret field, without reaching snapshotGet', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)

      const result = storeGet('gogConfigStore', 'credentials.accessToken')

      expect(result).toBeUndefined()
      expect(mockedSnapshotGet).not.toHaveBeenCalled()
      warnSpy.mockRestore()
    })

    it('delegates a permitted field to snapshotGet and returns its result', () => {
      mockedSnapshotGet.mockReturnValue('dark')

      const result = storeGet('configStore', 'theme', 'light')

      expect(result).toBe('dark')
      expect(mockedSnapshotGet).toHaveBeenCalledWith('configStore', 'theme', 'light')
    })
  })
})
