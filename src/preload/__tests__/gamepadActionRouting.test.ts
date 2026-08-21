/**
 * misc.ts's `gamepadAction` isTauri() routing (Phase 34.1 Plan 05 Task 3, D-10,
 * REQ-34.1-06).
 *
 * A separate file from `gamepadAction.test.ts` on purpose: that file imports the real
 * `tauriGamepadAction` (unmocked) to exercise its DOM logic, and `jest.mock(...)` calls
 * are hoisted file-wide -- mocking `./tauriGamepadInput` here would have silently
 * replaced the real implementation those 18 tests depend on. This file mocks
 * `tauriGamepadAction` instead, to prove ONLY the routing decision in `misc.ts`:
 * Electron path when `isTauri()` is false, Tauri path when it is true.
 *
 * Mirrors `windowChrome.test.ts`'s mocking style: `electron` is proven never resolved.
 */

jest.mock('electron', () => {
  throw new Error('electron must not be resolved on the Tauri path (T-27-07)')
})

const mockedIsTauri = jest.fn()
jest.mock('../tauriTransport', () => ({
  isTauri: () => mockedIsTauri(),
  snapshotGet: jest.fn(),
  snapshotSet: jest.fn(),
  snapshotHas: jest.fn(),
  snapshotDelete: jest.fn(),
  registerStore: jest.fn()
}))

const mockedTauriGamepadAction = jest.fn()
jest.mock('../api/tauriGamepadInput', () => ({
  tauriGamepadAction: (...args: unknown[]) => mockedTauriGamepadAction(...args)
}))

const mockedIpcInvoke = jest.fn()
jest.mock('../ipc', () => ({
  makeHandlerInvoker:
    (channel: string) =>
    (...args: unknown[]) =>
      mockedIpcInvoke(channel, ...args),
  makeListenerCaller: () => () => undefined,
  frontendListenerSlot: () => () => undefined
}))

import { gamepadAction } from '../api/misc'

describe('misc.ts gamepadAction routing (REQ-34.1-06)', () => {
  beforeEach(() => {
    mockedTauriGamepadAction.mockResolvedValue(undefined)
    mockedIpcInvoke.mockResolvedValue(undefined)
  })

  it('REQ-34.1-06: routes to tauriGamepadAction under Tauri and never calls the Electron IPC invoker', async () => {
    mockedIsTauri.mockReturnValue(true)

    await gamepadAction({ action: 'tab' })

    expect(mockedTauriGamepadAction).toHaveBeenCalledWith({ action: 'tab' })
    expect(mockedIpcInvoke).not.toHaveBeenCalled()
  })

  it('REQ-34.1-06: with isTauri() false, tauriGamepadAction is never called and the Electron IPC path runs instead', async () => {
    mockedIsTauri.mockReturnValue(false)

    await gamepadAction({ action: 'tab' })

    expect(mockedTauriGamepadAction).not.toHaveBeenCalled()
    expect(mockedIpcInvoke).toHaveBeenCalledWith('gamepadAction', { action: 'tab' })
  })
})
