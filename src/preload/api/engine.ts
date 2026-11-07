import { frontendListenerSlot, makeHandlerInvoker } from '../ipc'

// Phase 61 Plan 13 (D-09/D-12/D-17): the store-agnostic engine domain.
export const getEngineState = makeHandlerInvoker('getEngineState')
export const listEngineOptions = makeHandlerInvoker('listEngineOptions')
export const getDefaultEngine = makeHandlerInvoker('getDefaultEngine')
export const getPerGameBottleName = makeHandlerInvoker('getPerGameBottleName')
export const dismissEngineNotice = makeHandlerInvoker('dismissEngineNotice')
// One-way push: engineState.ts publishes a title's new engine state.
export const handleEngineStateChanged = frontendListenerSlot('engineStateChanged')
