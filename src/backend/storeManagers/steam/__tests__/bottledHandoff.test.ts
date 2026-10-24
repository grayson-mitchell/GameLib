/**
 * quick 261024-h5y -- startBottledSteamToFinishInstall (guarded, single-flight
 * dispatch of steam://install into the bottle).
 *
 * No child process is spawned here: ../bottle and ../library are mocked, so
 * the fake-HOME spawn convention (createFakeHomeProfile) has no spawn site to
 * apply to.
 */
import { startBottledSteamToFinishInstall } from '../bottledHandoff'
import { tellBottledSteamToInstall } from '../bottle'
import {
  isAwaitingBottledSteamAdoption,
  markBottledSteamDispatched
} from '../library'
import { library } from '../state'
import { notify } from '../../../dialog/dialog'
import { t } from 'i18next'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('../bottle', () => ({ tellBottledSteamToInstall: jest.fn() }))
jest.mock('../library', () => ({
  isAwaitingBottledSteamAdoption: jest.fn(),
  markBottledSteamDispatched: jest.fn()
}))
jest.mock('../state', () => ({ library: { get: jest.fn() } }))
jest.mock('../../../dialog/dialog', () => ({ notify: jest.fn() }))
jest.mock('i18next', () => ({ t: jest.fn() }))

beforeEach(() => {
  ;(t as jest.Mock).mockImplementation(
    (_key: string, fallback = '') => fallback
  )
  // Typed as a jest.Mock property, not the store's `get` method, so the
  // reference is not an unbound method.
  ;(library as unknown as { get: jest.Mock }).get.mockReturnValue({
    title: 'XCOM'
  })
})

describe('startBottledSteamToFinishInstall', () => {
  it.each([[undefined], [42], ['abc'], ['12; rm'], ['']])(
    'rejects invalid appId %p without dispatching',
    async (bad) => {
      const r = await startBottledSteamToFinishInstall(bad)
      expect(r.status).toBe('error')
      expect(tellBottledSteamToInstall).not.toHaveBeenCalled()
    }
  )

  it('refuses when no bottle handoff poll is awaiting adoption', async () => {
    jest.mocked(isAwaitingBottledSteamAdoption).mockReturnValue(false)
    const r = await startBottledSteamToFinishInstall('200510')
    expect(r).toEqual({ status: 'error', error: 'not-awaiting-bottled-steam' })
    expect(tellBottledSteamToInstall).not.toHaveBeenCalled()
  })

  it('dispatches once and marks dispatched on success', async () => {
    jest.mocked(isAwaitingBottledSteamAdoption).mockReturnValue(true)
    jest.mocked(tellBottledSteamToInstall).mockResolvedValue({ status: 'done' })
    const r = await startBottledSteamToFinishInstall('200510')
    expect(r.status).toBe('done')
    expect(tellBottledSteamToInstall).toHaveBeenCalledTimes(1)
    expect(tellBottledSteamToInstall).toHaveBeenCalledWith('200510')
    expect(markBottledSteamDispatched).toHaveBeenCalledWith('200510')
  })

  it('shares one dispatch between concurrent calls, then allows a later one', async () => {
    jest.mocked(isAwaitingBottledSteamAdoption).mockReturnValue(true)
    let release: (v: { status: 'done' }) => void = () => undefined
    jest.mocked(tellBottledSteamToInstall).mockImplementation(
      () =>
        new Promise((res) => {
          release = res
        })
    )
    const a = startBottledSteamToFinishInstall('200510')
    const b = startBottledSteamToFinishInstall('200510')
    expect(tellBottledSteamToInstall).toHaveBeenCalledTimes(1)
    release({ status: 'done' })
    await Promise.all([a, b])
    jest.mocked(tellBottledSteamToInstall).mockResolvedValue({ status: 'done' })
    await startBottledSteamToFinishInstall('200510')
    expect(tellBottledSteamToInstall).toHaveBeenCalledTimes(2)
  })

  it('notifies and does not mark dispatched when the dispatch errors', async () => {
    jest.mocked(isAwaitingBottledSteamAdoption).mockReturnValue(true)
    jest
      .mocked(tellBottledSteamToInstall)
      .mockResolvedValue({ status: 'error', error: 'boom' })
    const r = await startBottledSteamToFinishInstall('200510')
    expect(r).toEqual({ status: 'error', error: 'boom' })
    expect(markBottledSteamDispatched).not.toHaveBeenCalled()
    expect(t).toHaveBeenCalledWith(
      'gamelib:steam.bottle.finishInstall.startFailed',
      expect.any(String),
      expect.objectContaining({ error: 'boom' })
    )
    expect(notify).toHaveBeenCalledTimes(1)
  })
})
