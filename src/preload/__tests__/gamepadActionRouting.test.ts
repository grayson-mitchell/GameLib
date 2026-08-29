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
 * Until Phase 35 plan 16 this file proved a Tauri-context ROUTING decision --
 * Electron IPC invoker when the check was false, `tauriGamepadAction` when
 * true. That decision no longer exists: nothing runs under Electron, so
 * `gamepadAction` now calls `tauriGamepadAction` unconditionally, with no
 * fallback branch to route away from.
 * Mirrors `windowChrome.test.ts`'s mocking style: `electron` is proven never resolved.
 */

// Phase 35 Plan 18 (T-27-07): this suite used to guard against 'electron' being resolved on
// the Tauri preload path via a throw-on-require jest.mock('electron', ...) factory. Plan 18
// retired the 'electron' devDependency outright, so the guard is now structural: 'electron'
// cannot resolve on ANY path, in ANY suite, because it no longer exists in node_modules at
// all. A jest.mock('electron', ...) call here would itself throw "Cannot find module
// 'electron'" at REGISTRATION time (before this factory could ever run), which is a strictly
// stronger guarantee than the runtime throw it replaces. See meta/__tests__/electronAbsence.test.ts
// for the project-wide mechanized version of this same guarantee.

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
