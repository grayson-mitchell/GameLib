import {
  makeHandlerInvoker,
  makeListenerCaller,
  frontendListenerSlot
} from '../ipc'

export const humbleStartLogin = makeHandlerInvoker('humbleStartLogin')
export const humbleGetUserInfo = makeHandlerInvoker('humbleGetUserInfo')
export const humbleReconnect = makeHandlerInvoker('humbleReconnect')
export const humbleCheckHealth = makeHandlerInvoker('humbleCheckHealth')
export const humbleRunValidation = makeHandlerInvoker('humbleRunValidation')
export const humbleDisconnect = makeListenerCaller('humbleDisconnect')
export const handleHumbleAuthState = frontendListenerSlot('humbleAuthState')
