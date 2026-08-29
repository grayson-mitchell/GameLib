/**
 * misc.ts's `gamepadAction` delegation (Phase 34.1 Plan 05 Task 3, D-10, REQ-34.1-06;
 * collapsed Phase 35 plan 16, D-01).
 *
 * A separate file from `gamepadAction.test.ts` on purpose: that file imports the real
 * `tauriGamepadAction` (unmocked) to exercise its DOM logic, and `jest.mock(...)` calls
 * are hoisted file-wide -- mocking `./tauriGamepadInput` here would have silently
 * replaced the real implementation those 18 tests depend on. This file mocks
 * `tauriGamepadAction` instead, to prove `misc.ts` delegates to it unconditionally.
 *
 * Until Phase 35 plan 16 this file proved an `isTauri()` ROUTING decision -- Electron
 * IPC invoker when false, `tauriGamepadAction` when true. That decision no longer
 * exists: nothing runs under Electron, so `gamepadAction` now calls
 * `tauriGamepadAction` unconditionally, with no fallback branch to route away from.
 * Mirrors `windowChrome.test.ts`'s mocking style: `electron` is proven never resolved.
 */

jest.mock('electron', () => {
  throw new Error('electron must not be resolved on the Tauri path (T-27-07)')
})

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

describe('misc.ts gamepadAction delegation (REQ-34.1-06)', () => {
  beforeEach(() => {
    mockedTauriGamepadAction.mockResolvedValue(undefined)
    mockedIpcInvoke.mockResolvedValue(undefined)
  })

  it('REQ-34.1-06: always delegates to tauriGamepadAction and never touches the (now-deleted) Electron IPC path', async () => {
    await gamepadAction({ action: 'tab' })

    expect(mockedTauriGamepadAction).toHaveBeenCalledWith({ action: 'tab' })
    expect(mockedIpcInvoke).not.toHaveBeenCalled()
  })
})
