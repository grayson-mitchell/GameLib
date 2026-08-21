import { makeHandlerInvoker } from '../ipc'

export const searchStores = makeHandlerInvoker('searchStores')
export const getStoreSearchDeals = makeHandlerInvoker('getStoreSearchDeals')
export const getStoreSearchStoreMap = makeHandlerInvoker('getStoreSearchStoreMap')
