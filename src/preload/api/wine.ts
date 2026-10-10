import { makeListenerCaller, makeHandlerInvoker, frontendListenerSlot } from '../ipc'

export const toggleDXVK = makeHandlerInvoker('toggleDXVK')
export const toggleVKD3D = makeHandlerInvoker('toggleVKD3D')
export const toggleDXVKNVAPI = makeHandlerInvoker('toggleDXVKNVAPI')
export const isRuntimeInstalled = makeHandlerInvoker('isRuntimeInstalled')
export const downloadRuntime = makeHandlerInvoker('downloadRuntime')
export const showItemInFolder = makeListenerCaller('showItemInFolder')
export const installWineVersion = makeHandlerInvoker('installWineVersion')
export const removeWineVersion = makeHandlerInvoker('removeWineVersion')
export const refreshWineVersionInfo = makeHandlerInvoker('refreshWineVersionInfo')
export const handleProgressOfWinetricks = frontendListenerSlot('progressOfWinetricks')
export const handleProgressOfWineManager = frontendListenerSlot('progressOfWineManager')
export const handleWineVersionsUpdated = frontendListenerSlot('wineVersionsUpdated')
export const winetricksListInstalled = makeHandlerInvoker('winetricksInstalled')
export const winetricksListAvailable = makeHandlerInvoker('winetricksAvailable')
export const handleWinetricksInstalling = frontendListenerSlot('installing-winetricks-component')
// Phase 45 Plan 01 (D-11/D-12/D-13): the winetricks queue. Phase 45 Plan 02 (D-11 promote) then
// retired the send-kind `winetricksInstall` that used to sit above this block -- the queue's
// apply method (below) is now the only renderer-reachable install path.
export const winetricksApply = makeHandlerInvoker('winetricksApply')
export const winetricksQueueState = makeHandlerInvoker('winetricksQueueState')
export const winetricksCancelRemaining = makeHandlerInvoker('winetricksCancelRemaining')
export const handleWinetricksQueueChanged = frontendListenerSlot('winetricksQueueChanged')

export const wine = {
  isValidVersion: makeHandlerInvoker('wine.isValidVersion')
}
