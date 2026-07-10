import { useSteamBottleSetup } from 'frontend/state/SteamBottleSetup'

// Phase 17 (17-06) Task 1: minimal mount point wired to the global store —
// opened exclusively by the backend `steamBottleSetupRequired` signal (D-07,
// D-11). Task 2 replaces this body with the full guided consent + engine
// choice + login-prompt surface; kept here (rather than deferring the mount)
// so the App-shell wiring + store plumbing is test-locked independently.
const SteamBottleSetup = () => {
  const { isOpen } = useSteamBottleSetup()

  if (!isOpen) {
    return null
  }

  return null
}

export default SteamBottleSetup
