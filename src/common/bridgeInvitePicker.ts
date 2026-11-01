// Quick 261101-llf: shared by the preload (tauriAttach) and the frontend entry (index.tsx) so
// both agree on what a `bridge-invite` picker window load looks like. No Electron, Node or React
// imports. The Rust shell builds the URL (`bridge_invite_picker_path` in main.rs) and validates
// the same shape: BOTH sides validate, because the ids travel through a URL.

export const BRIDGE_INVITE_WINDOW_KIND = 'bridge-invite'

const APP_ID_PATTERN = /^[0-9]{1,10}$/
const ACK_ID_PATTERN = /^[0-9A-Za-z-]{1,64}$/

export interface BridgeInvitePickerParams {
  appId: string
  ackId: string
}

export const parseBridgeInvitePickerParams = (
  search: string
): BridgeInvitePickerParams | null => {
  const params = new URLSearchParams(search)
  if (params.get('window') !== BRIDGE_INVITE_WINDOW_KIND) return null
  const appId = params.get('appId')
  const ackId = params.get('ackId')
  if (appId === null || !APP_ID_PATTERN.test(appId)) return null
  if (ackId === null || !ACK_ID_PATTERN.test(ackId)) return null
  return { appId, ackId }
}

export const isBridgeInvitePickerWindow = (search: string): boolean =>
  parseBridgeInvitePickerParams(search) !== null
