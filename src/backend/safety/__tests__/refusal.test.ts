import type { SendFrontendMessage } from 'backend/host/frontendMessage'
import { createCaptureLog } from 'backend/testUtils/captureLog'
import type { RemovalRefusalPayload } from 'common/types/removalRefusal'
import { pushRemovalRefusal } from '../refusal'

type Sent = { channel: string; args: unknown[] }

function recorder(): { send: SendFrontendMessage; sent: Sent[] } {
  const sent: Sent[] = []
  const send: SendFrontendMessage = (channel, ...args) => {
    sent.push({ channel, args })
    return true
  }
  return { send, sent }
}

const payload: RemovalRefusalPayload = {
  kind: 'uninstall',
  outcome: 'refused',
  reason: 'nested-known-install',
  title: 'Half-Life 2',
  appName: '220',
  runner: 'steam',
  otherTitle: 'Portal'
}

describe('pushRemovalRefusal', () => {
  it('forwards the payload unchanged on removalRefusedNotice', () => {
    const { send, sent } = recorder()
    const log = createCaptureLog()
    pushRemovalRefusal(
      { sendFrontendMessage: send, log: (l) => log.warn(l) },
      payload
    )
    expect(sent).toEqual([{ channel: 'removalRefusedNotice', args: [payload] }])
  })

  it('logs exactly one line naming the op, outcome and check, with no title and no path', () => {
    const { send } = recorder()
    const log = createCaptureLog()
    pushRemovalRefusal(
      { sendFrontendMessage: send, log: (l) => log.warn(l) },
      payload
    )
    expect(log.lines).toEqual([
      {
        level: 'warn',
        msg: '[safety] uninstall refused: nested-known-install'
      }
    ])
    const line = log.lines[0]?.msg ?? ''
    expect(line).not.toContain('Half-Life 2')
    expect(line).not.toContain('Portal')
    expect(line).not.toContain('220')
    expect(line).not.toMatch(/[\\/]/)
  })

  it('names a failed outcome as failed', () => {
    const { send } = recorder()
    const log = createCaptureLog()
    pushRemovalRefusal(
      { sendFrontendMessage: send, log: (l) => log.warn(l) },
      { kind: 'reset', outcome: 'failed', reason: 'delete-failed' }
    )
    expect(log.lines.map((l) => l.msg)).toEqual([
      '[safety] reset failed: delete-failed'
    ])
  })

  it('never throws when the push itself fails', () => {
    const log = createCaptureLog()
    const send: SendFrontendMessage = () => {
      throw new Error('transport closed')
    }
    expect(() =>
      pushRemovalRefusal(
        { sendFrontendMessage: send, log: (l) => log.warn(l) },
        payload
      )
    ).not.toThrow()
    expect(log.lines).toHaveLength(1)
  })
})
