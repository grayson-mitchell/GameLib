import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'

import {
  applySetupDownloadEvent,
  setupRowsInOrder,
  type SetupDownloadMap
} from 'frontend/screens/DownloadManager/components/SetupDownloadItem/setupModel'

// quick 261027-tot: in-flight Steam setup payload downloads (native client
// installer / SteamSetup.exe for the CrossOver bottle). Fed by the one-way
// `steamSetupDownloadProgress` push; mirrors InstallProgress.ts. Rows exist
// only for pushes received after this module loaded -- downloadFile re-emits
// about every second while running, so a late-mounted view fills in quickly.
const useSteamSetupDownloadsRaw = create<SetupDownloadMap>()(() => ({}))

window.api.handleSteamSetupDownloadProgress((_e, payload) => {
  useSteamSetupDownloadsRaw.setState(
    applySetupDownloadEvent(useSteamSetupDownloadsRaw.getState(), payload),
    true
  )
})

export const useSteamSetupDownloads = () =>
  useSteamSetupDownloadsRaw(useShallow((map) => setupRowsInOrder(map)))
