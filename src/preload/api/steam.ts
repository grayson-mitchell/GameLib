import { makeHandlerInvoker, makeListenerCaller } from '../ipc'

export const steamStartQR = makeHandlerInvoker('steamStartQR')
export const steamPollQR = makeHandlerInvoker('steamPollQR')
export const steamPollCredential = makeHandlerInvoker('steamPollCredential')
export const steamStartCredentials = makeHandlerInvoker('steamStartCredentials')
export const steamSubmitGuard = makeHandlerInvoker('steamSubmitGuard')
export const getSteamUserInfo = makeHandlerInvoker('getSteamUserInfo')
export const checkSteamInstalled = makeHandlerInvoker('checkSteamInstalled')
export const getSteamSyncedAt = makeHandlerInvoker('getSteamSyncedAt')
export const logoutSteam = makeListenerCaller('logoutSteam')
