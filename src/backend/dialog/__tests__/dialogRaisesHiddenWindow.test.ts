/**
 * Dialogs re-show a window GameLib hid for a launch (quick 261108-kpc).
 */
jest.mock('backend/logger', () => ({
  LogPrefix: { Backend: 'Backend' },
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn()
}))
jest.mock('../../ipc', () => ({ sendFrontendMessage: jest.fn() }))

import { sendFrontendMessage } from '../../ipc'
import { showDialogBoxModalAuto } from '../dialog'

const raise = jest.fn()
const deps = {
  appState: { raiseMainWindowForInAppDialog: raise },
  dialogs: { showErrorBox: jest.fn(), showMessageBox: jest.fn() }
}

describe('showDialogBoxModalAuto raises a GameLib-hidden window first', () => {
  it('sendFrontendMessage branch', () => {
    ;(sendFrontendMessage as jest.Mock).mockReturnValue(true)
    const order: string[] = []
    raise.mockImplementation(() => order.push('raise'))
    ;(sendFrontendMessage as jest.Mock).mockImplementation(() => {
      order.push('send')
      return true
    })
    showDialogBoxModalAuto(deps, { title: 't', message: 'm', type: 'ERROR' })
    expect(order).toEqual(['raise', 'send'])
  })

  it('does not raise when the mock hook is not armed (hook is the gate)', () => {
    // The real gating (only a GameLib-hidden window) lives in app.raiseMainWindowIfHiddenByGameLib;
    // this file only pins that the dialog path always consults it exactly once per call.
    ;(sendFrontendMessage as jest.Mock).mockReturnValue(true)
    showDialogBoxModalAuto(deps, { title: 't', message: 'm', type: 'ERROR' })
    expect(raise).toHaveBeenCalledTimes(1)
  })

  it('event.sender branch', () => {
    const send = jest.fn()
    showDialogBoxModalAuto(deps, {
      event: { sender: { send } } as never,
      title: 't',
      message: 'm',
      type: 'MESSAGE'
    })
    expect(raise).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalled()
  })
})
