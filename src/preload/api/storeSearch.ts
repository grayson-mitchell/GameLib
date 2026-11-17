import { makeHandlerInvoker } from '../ipc'

export const searchStores = makeHandlerInvoker('searchStores')
export const getStoreSearchDeals = makeHandlerInvoker('getStoreSearchDeals')
export const getItadSteamGids = makeHandlerInvoker('getItadSteamGids')

export const itad = {
  getKeyStatus: makeHandlerInvoker('itad.getKeyStatus'),
  setApiKey: makeHandlerInvoker('itad.setApiKey')
}
