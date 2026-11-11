import { sendFrontendMessage } from '../ipc'
import { pushFrontendMessage } from '../sidecar/sidecarRpc'

// 66.3-05: sendFrontendMessage no longer goes through the platform shim's fake window (whose
// destroyed-window guards, Thread D-1, can never trip once there is no window object). It pushes
// through the sidecar transport, which buffers until its output stream is bound.
jest.mock('../sidecar/sidecarRpc', () => ({ pushFrontendMessage: jest.fn() }))

describe('ipc sendFrontendMessage', () => {
  it('forwards the channel and every argument to the sidecar transport', () => {
    sendFrontendMessage('message', 'param1', 'param2')

    expect(pushFrontendMessage).toHaveBeenCalledTimes(1)
    expect(pushFrontendMessage).toHaveBeenCalledWith(
      'message',
      'param1',
      'param2'
    )
  })

  it('reports the message as sent', () => {
    expect(sendFrontendMessage('message')).toBe(true)
  })
})
