/**
 * D-15/T-34.5-30 dialog safety pin: `showDialogBoxModalAuto` never propagates a rejection. Moved here from the wine
 * tools registration test when Phase 87 Plan 36 deleted that registration: the pin is about `dialog.ts`, not the
 * channels. Even when the primary `sendFrontendMessage('showDialog', ...)` push fails, the fallback to
 * `platformApi.dialog.*` never throws and never leaves an unhandled promise rejection behind.
 *
 * A dedicated `jest.isolateModules()` sandbox is used (mirrors `sidecarRejectionGuard.test.ts`'s harness shape) so the
 * `'../../sidecar/sidecarRpc'` stub is deterministic and the real, non-mocked `platformApi.dialog` fallback is what
 * runs, without disturbing modules loaded elsewhere in the registry.
 */
import { createTestHostServices } from 'backend/testUtils/testHostServices'

describe('D-15/T-34.5-30 dialog safety pin — showDialogBoxModalAuto never propagates a rejection', () => {
  it('does not throw synchronously and produces no unhandled rejection when the frontend push fails, using the real platformApi dialog fallback', async () => {
    let isolatedShowDialogBoxModalAuto!: (
      deps: unknown,
      props: {
        title: string
        message: string
        type: 'ERROR' | 'INFO' | 'WARNING'
      }
    ) => void

    jest.isolateModules(() => {
      jest.doMock('../../sidecar/sidecarRpc', () => ({
        requestRustInvoke: jest.fn().mockResolvedValue(undefined)
      }))
      /* eslint-disable @typescript-eslint/no-require-imports */
      // `backend/logger`'s `heroicLogWriter` singleton is only assigned by the app's real
      // init path (never run in this isolated sandbox) -- stubbed here so `dialog.ts`'s
      // `logWarning` call in its catch branch doesn't throw on an uninitialized writer.
      jest.doMock('backend/logger', () => ({
        ...jest.requireActual('backend/logger/constants'),
        logDebug: jest.fn(),
        logInfo: jest.fn(),
        logWarning: jest.fn(),
        logError: jest.fn()
      }))
      isolatedShowDialogBoxModalAuto =
        require('../dialog').showDialogBoxModalAuto
      /* eslint-enable @typescript-eslint/no-require-imports */
    })

    const unhandledRejections: unknown[] = []
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason)
    }
    process.on('unhandledRejection', onUnhandledRejection)

    try {
      expect(() =>
        isolatedShowDialogBoxModalAuto(
          {
            appState: createTestHostServices().appState,
            dialogs: createTestHostServices().dialogs,
            sendFrontendMessage: jest.fn(() => {
              throw new Error(
                'mock frontend-push failure (D-15/T-34.5-30 pin — the primary showDialog push failed)'
              )
            })
          },
          {
            title: 'box.error.dxvk.title',
            message: 'box.error.dxvk.message',
            type: 'ERROR'
          }
        )
      ).not.toThrow()

      // Let the fire-and-forget `platformApi.dialog.showErrorBox(...)` promise settle before
      // asserting nothing escaped as an unhandled rejection.
      await new Promise((resolve) => setImmediate(resolve))

      expect(unhandledRejections).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
    }
  })
})
