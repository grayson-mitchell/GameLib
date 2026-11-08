import { sendFrontendMessage } from '../ipc'
import { logWarning, LogPrefix } from '../logger'
import { flushReadOnlyStores } from '../storeVersioning/readOnlyStores'

/**
 * Phase 68 D-05: push the read-only stores notice to the renderer. Lives beside
 * `gameSettingWrite.ts` rather than inside `appShellFlowRegistration.ts` because the
 * appShellImportGate (REQ-34.1-12/D-09) forbids that file from importing `../ipc`.
 * Creates no timer or handle (sidecar exit contract).
 */
export function pushReadOnlyStoresNotice(): void {
  flushReadOnlyStores({
    send: (payload) => sendFrontendMessage('readOnlyStoresNotice', payload),
    log: (line) => logWarning(line, LogPrefix.Backend)
  })
}
