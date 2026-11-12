import { createSendFrontendMessage } from '../host/frontendMessage'

// 66.3-05: sendFrontendMessage no longer goes through the platform shim's fake window (whose
// destroyed-window guards, Thread D-1, can never trip once there is no window object). It pushes
// through the boot's sidecar transport, which buffers until its output stream is bound. 66.4-15:
// the typed push is built over the boot's `pushFrontendMessage`, never a module-level import.
describe('createSendFrontendMessage', () => {
  it('forwards the channel and every argument to the transport push', () => {
    const push = jest.fn()
    const sendFrontendMessage = createSendFrontendMessage(push) as unknown as (
      ...args: unknown[]
    ) => boolean
    sendFrontendMessage('message', 'param1', 'param2')

    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('message', 'param1', 'param2')
  })

  it('reports the message as sent', () => {
    const send = createSendFrontendMessage(jest.fn()) as unknown as (
      ...args: unknown[]
    ) => boolean
    expect(send('message')).toBe(true)
  })
})
