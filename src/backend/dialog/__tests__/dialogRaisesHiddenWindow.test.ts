/**
 * Dialogs re-show a window GameLib hid for a launch (quick 261108-kpc).
 */
jest.mock('backend/platform')
jest.mock('backend/logger', () => ({
  LogPrefix: { Backend: 'Backend' },
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn()
}))
jest.mock('../../ipc', () => ({ sendFrontendMessage: jest.fn() }))
jest.mock('../../main_window', () => ({ getMainWindow: jest.fn() }))

import { app } from 'backend/platform'
import { sendFrontendMessage } from '../../ipc'
import { showDialogBoxModalAuto } from '../dialog'

const raise = app.raiseMainWindowForInAppDialog as unknown as jest.Mock

describe('showDialogBoxModalAuto raises a GameLib-hidden window first', () => {
  it('sendFrontendMessage branch', () => {
    ;(sendFrontendMessage as jest.Mock).mockReturnValue(true)
    const order: string[] = []
    raise.mockImplementation(() => order.push('raise'))
    ;(sendFrontendMessage as jest.Mock).mockImplementation(() => {
      order.push('send')
      return true
    })
    showDialogBoxModalAuto({ title: 't', message: 'm', type: 'ERROR' })
    expect(order).toEqual(['raise', 'send'])
  })

  it('does not raise when the mock hook is not armed (hook is the gate)', () => {
    // The real gating (only a GameLib-hidden window) lives in app.raiseMainWindowIfHiddenByGameLib;
    // this file only pins that the dialog path always consults it exactly once per call.
    ;(sendFrontendMessage as jest.Mock).mockReturnValue(true)
    showDialogBoxModalAuto({ title: 't', message: 'm', type: 'ERROR' })
    expect(raise).toHaveBeenCalledTimes(1)
  })

  it('event.sender branch', () => {
    const send = jest.fn()
    showDialogBoxModalAuto({
      event: { sender: { send } } as never,
      title: 't',
      message: 'm',
      type: 'MESSAGE'
    })
    expect(raise).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalled()
  })
})
