/**
 * A fresh set of the sidecar shell's per-boot instances (66.4-16) for tests that call
 * `registerHandlers` or a flow registration directly: the app-shell flags/timers, an
 * (unstarted) installed.json watcher and an empty store-embed seam holder. Plain object, no jest
 * APIs; construction opens no watcher and arms no timer.
 */
import { createAppShellState } from '../sidecar/appShellFlowRegistration'
import { createInstalledJsonWatcher } from '../sidecar/installedJsonWatcher'
import { createStoreEmbedSeam } from '../store/storeEmbedSeam'
import type { BootServices, ShellState } from '../services/types'

export function createTestShellState(
  services: Pick<BootServices, 'clock' | 'managers' | 'paths' | 'host'>
): ShellState {
  return {
    appShell: createAppShellState({ clock: services.clock }),
    installedJson: createInstalledJsonWatcher({
      clock: services.clock,
      managers: services.managers,
      paths: services.paths,
      sendFrontendMessage: services.host.sendFrontendMessage
    }),
    storeEmbed: createStoreEmbedSeam()
  }
}
