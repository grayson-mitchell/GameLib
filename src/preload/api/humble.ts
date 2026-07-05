import {
  makeHandlerInvoker,
  makeListenerCaller,
  frontendListenerSlot
} from '../ipc'

export const humbleStartLogin = makeHandlerInvoker('humbleStartLogin')
export const humbleGetUserInfo = makeHandlerInvoker('humbleGetUserInfo')
export const humbleReconnect = makeHandlerInvoker('humbleReconnect')
export const humbleCheckHealth = makeHandlerInvoker('humbleCheckHealth')
export const humbleGetLoginUserAgent = makeHandlerInvoker(
  'humbleGetLoginUserAgent'
)
export const humbleRunValidation = makeHandlerInvoker('humbleRunValidation')
export const humbleDisconnect = makeListenerCaller('humbleDisconnect')
export const humbleStopLogin = makeListenerCaller('humbleStopLogin')
export const humbleLoginNavigated = makeListenerCaller('humbleLoginNavigated')
export const handleHumbleAuthState = frontendListenerSlot('humbleAuthState')
export const humbleSync = makeHandlerInvoker('humbleSync')
export const humbleGetKeys = makeHandlerInvoker('humbleGetKeys')
export const humbleGetSyncState = makeHandlerInvoker('humbleGetSyncState')
export const handleHumbleKeysUpdated = frontendListenerSlot('humbleKeysUpdated')
export const handleHumbleSyncProgress = frontendListenerSlot('humbleSyncProgress')
export const handleHumbleSyncStateChanged = frontendListenerSlot(
  'humbleSyncStateChanged'
)
