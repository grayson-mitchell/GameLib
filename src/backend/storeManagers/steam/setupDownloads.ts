// quick 261027-tot: first-run Steam setup payload downloads (native Steam
// client installer; SteamSetup.exe for the CrossOver bottle) are not
// DM-queue work, so they report progress through their own one-way push,
// `steamSetupDownloadProgress`, which the Downloads view renders as a
// "Setup" section. The payload is {kind,state,bytes,percent} only -- the
// url and destination path are never emitted.
//
// No timer here: downloadFile already throttles its progressCallback to 1/s,
// so this adds no handle (sidecar exit contract).

import { downloadFile } from 'backend/utils'
import type { SteamSetupDownloadKind } from 'common/types/steam'
import { sendFrontendMessage } from '../../ipc'

const clampPercent = (n: number): number => {
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, Math.round(n)))
}

export async function downloadSetupPayload(
  kind: SteamSetupDownloadKind,
  opts: { url: string; dest: string }
): Promise<void> {
  let lastBytes = 0
  sendFrontendMessage('steamSetupDownloadProgress', {
    kind,
    state: 'running',
    bytes: 0,
    percent: 0
  })
  try {
    await downloadFile({
      url: opts.url,
      dest: opts.dest,
      progressCallback: (bytes, _speed, percentage) => {
        lastBytes = bytes
        sendFrontendMessage('steamSetupDownloadProgress', {
          kind,
          state: 'running',
          bytes,
          percent: clampPercent(percentage)
        })
      }
    })
  } catch (error) {
    sendFrontendMessage('steamSetupDownloadProgress', {
      kind,
      state: 'error',
      bytes: lastBytes,
      percent: 0
    })
    throw error
  }
  sendFrontendMessage('steamSetupDownloadProgress', {
    kind,
    state: 'done',
    bytes: lastBytes,
    percent: 100
  })
}
