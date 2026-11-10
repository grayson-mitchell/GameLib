import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

import type { DMQueueElement } from 'common/types'
import { downloadManagerStore } from '../helpers/stores'
import { bindStoreHooks, registerStoreForReset } from './storeKit'

// Phase 69 D-01/D-15: downloads domain store. The completed-downloads list
// used to live in DownloadManager component state and was refilled on every
// mount; it is store-owned now, so it survives leaving the Downloads tab.
// No persist middleware (D-02): Clear writes downloadManagerStore itself, with
// the same key and values as before (R6).

interface DownloadsState {
  /** undefined = not loaded yet (matches the old component's useState()). */
  finished: DMQueueElement[] | undefined

  refreshFinished: () => Promise<void>
  clearFinished: () => void
  clearFinishedItem: (appName: string) => void
}

const useDownloadsStateRaw = create<DownloadsState>()(
  subscribeWithSelector((set, get) => ({
    finished: undefined,

    refreshFinished: async () => {
      const info = await window.api.getDMQueueInformation()
      set({ finished: info?.finished })
    },

    clearFinished: () => {
      set({ finished: [] })
      downloadManagerStore.set('finished', [])
    },

    clearFinishedItem: (appName) => {
      const filtered = get().finished?.filter(
        (e) => e.params.appName !== appName
      )
      set({ finished: filtered })
      downloadManagerStore.set('finished', filtered ? filtered : [])
    }
  }))
)

registerStoreForReset(useDownloadsStateRaw)

const useDownloadsState = bindStoreHooks(useDownloadsStateRaw)
export default useDownloadsState

export function refreshFinished(): Promise<void> {
  return useDownloadsState.getState().refreshFinished()
}

/**
 * Boot wiring (D-07, life of the app): one pull now, then a refresh whenever a
 * pushed queue's length or head appName differs from the last seen values. That
 * is the trigger the DownloadManager effect had, minus the refill-on-mount.
 */
export function registerDownloadsListeners(): void {
  let lastLength = 0
  let lastAppName: string | undefined = undefined
  void refreshFinished()
  window.api.handleDMQueueInformation((_e, elements) => {
    if (!elements) return
    const appName = elements[0]?.params.appName
    if (elements.length === lastLength && appName === lastAppName) return
    lastLength = elements.length
    lastAppName = appName
    void refreshFinished()
  })
}
