import { frontendListenerSlot, makeHandlerInvoker } from '../ipc'

// Phase 61 Plan 13 (D-09/D-12/D-17): the store-agnostic engine domain.
/** @public reached only as `window.api.getEngineState` through the preload api bundle, which knip cannot trace */
export const getEngineState = makeHandlerInvoker('getEngineState')
/** @public reached only as `window.api.listEngineOptions` through the preload api bundle, which knip cannot trace */
export const listEngineOptions = makeHandlerInvoker('listEngineOptions')
/** @public reached only as `window.api.getDefaultEngine` through the preload api bundle, which knip cannot trace */
export const getDefaultEngine = makeHandlerInvoker('getDefaultEngine')
/** @public reached only as `window.api.getPerGameBottleName` through the preload api bundle, which knip cannot trace */
export const getPerGameBottleName = makeHandlerInvoker('getPerGameBottleName')
/** @public reached only as `window.api.dismissEngineNotice` through the preload api bundle, which knip cannot trace */
export const dismissEngineNotice = makeHandlerInvoker('dismissEngineNotice')
// One-way push: engineState.ts publishes a title's new engine state.
/** @public reached only as `window.api.handleEngineStateChanged` through the preload api bundle, which knip cannot trace */
export const handleEngineStateChanged = frontendListenerSlot('engineStateChanged')
