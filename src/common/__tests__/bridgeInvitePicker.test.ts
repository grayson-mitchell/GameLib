import {
  BRIDGE_INVITE_WINDOW_KIND,
  isBridgeInvitePickerWindow,
  parseBridgeInvitePickerParams
} from '../bridgeInvitePicker'

const UUID = '3f2b8c1e-7a4d-4e5f-9b0a-1c2d3e4f5a6b'

describe('parseBridgeInvitePickerParams', () => {
  it('parses a valid picker query', () => {
    expect(
      parseBridgeInvitePickerParams(
        `?window=${BRIDGE_INVITE_WINDOW_KIND}&appId=3205720&ackId=${UUID}`
      )
    ).toEqual({ appId: '3205720', ackId: UUID })
  })

  it.each([
    ['empty', ''],
    ['no window', `?appId=1&ackId=${UUID}`],
    ['other window', `?window=about&appId=1&ackId=${UUID}`],
    ['no appId', `?window=bridge-invite&ackId=${UUID}`],
    ['non-digit appId', `?window=bridge-invite&appId=12a&ackId=${UUID}`],
    ['empty appId', `?window=bridge-invite&appId=&ackId=${UUID}`],
    ['11-digit appId', `?window=bridge-invite&appId=12345678901&ackId=${UUID}`],
    ['no ackId', '?window=bridge-invite&appId=1'],
    ['empty ackId', '?window=bridge-invite&appId=1&ackId='],
    ['ackId with a space', '?window=bridge-invite&appId=1&ackId=a%20b'],
    ['ackId with a slash', '?window=bridge-invite&appId=1&ackId=a%2Fb'],
    ['overlong ackId', `?window=bridge-invite&appId=1&ackId=${'a'.repeat(65)}`]
  ])('rejects: %s', (_name, search) => {
    expect(parseBridgeInvitePickerParams(search)).toBeNull()
    expect(isBridgeInvitePickerWindow(search)).toBe(false)
  })

  it('isBridgeInvitePickerWindow is true for a valid query', () => {
    expect(
      isBridgeInvitePickerWindow(`?window=bridge-invite&appId=1&ackId=${UUID}`)
    ).toBe(true)
  })
})
