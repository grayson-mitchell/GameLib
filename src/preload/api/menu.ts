import { makeHandlerInvoker } from '../ipc'

export const removeShortcut = makeHandlerInvoker('removeShortcut')
export const addShortcut = makeHandlerInvoker('addShortcut')
export const moveInstall = makeHandlerInvoker('moveInstall')
export const changeInstallPath = makeHandlerInvoker('changeInstallPath')
export const enableEosOverlay = makeHandlerInvoker('enableEosOverlay')
export const disableEosOverlay = makeHandlerInvoker('disableEosOverlay')
export const isEosOverlayEnabled = makeHandlerInvoker('isEosOverlayEnabled')
export const installEosOverlay = makeHandlerInvoker('installEosOverlay')
export const removeFromSteam = makeHandlerInvoker('removeFromSteam')
export const addToSteam = makeHandlerInvoker('addToSteam')
export const shortcutsExists = makeHandlerInvoker('shortcutsExists')
export const isAddedToSteam = makeHandlerInvoker('isAddedToSteam')
