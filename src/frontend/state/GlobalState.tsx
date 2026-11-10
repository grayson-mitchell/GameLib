import React, { PureComponent } from 'react'

import { withTranslation } from 'react-i18next'
import { i18n, TFunction } from 'i18next'

import ContextProvider from './ContextProvider'

import type { ContextType } from 'frontend/types'
import useAuthState from './authState'
import { applySavedFonts } from './settingsState'
import {
  bridgedAccounts,
  bridgedContextSlice,
  subscribeBridge
} from './bridgeContextValue'
import {
  followConnectivity,
  hydrateDismissedSignInNotices,
  pullSignInProbeOutcomes,
  readMountStoreUsers,
  refreshAmazonUserInfo,
  runMountLibraryRefresh,
  registerControllerListener,
  restoreStoredGameUpdates,
  seedAndFollowWindowChrome,
  seedEpicUserInfo
} from './initStateSubscriptions'

type T = TFunction<'gamepage'> & TFunction<'translations'>

interface Props {
  children: React.ReactNode
  i18n: i18n
  t: T
}

// Phase 69: every field lives in a domain store; this class is the D-09 bridge
// only (render) plus the ordered boot calls (componentDidMount). 69-24 deletes it.
class GlobalState extends PureComponent<Props> {
  async componentDidMount() {
    // Phase 69 D-09 bridge: re-render when a store-owned context field changes.
    subscribeBridge(() => this.forceUpdate())
    // catches store changes between the first render and mount
    this.forceUpdate()

    // R10: seed isFullscreen/isFrameless, then follow the pushes (initStateSubscriptions).
    await seedAndFollowWindowChrome()

    const { gogUser, amazonUser, steamUser } = readMountStoreUsers()

    // F-49-R1-1 (Phase 49 live gate Run 1): this used to be gated on
    // `legendaryUser` (the mirror already holding `userInfo`). legendary
    // 0.21.0 deletes `user.json` when a refresh token is rejected, the backend
    // then purges `userInfo` (`legendary/user.ts:713`), and once it was gone
    // nothing ever asked for it back, even after the file returned. The
    // backend's `getUserInfo()` is self-healing in both directions (rebuilds
    // from the file when present, purges when absent), so call it on every
    // mount and seed the username from its answer when the mirror had none.
    // The cold-boot expired path does not depend on this: the latched flag
    // wins in `resolveSignInState` branch 1 (measured live 2026-10-09).
    const legendaryUser = await seedEpicUserInfo()

    await refreshAmazonUserInfo(amazonUser)

    restoreStoredGameUpdates()

    runMountLibraryRefresh({ legendaryUser, gogUser, amazonUser, steamUser })

    registerControllerListener()

    followConnectivity()

    // 49-07 (D-08, Pitfall 11): pull once on mount, because the outcomes push
    // can precede the listener above. Read-only getter -- nothing here starts
    // a probe (P3).
    pullSignInProbeOutcomes()

    // F-49-R1-3: hydrate the dismissed set from the backend's settings, as a
    // read (see hydrateDismissedSignInNotices).
    void hydrateDismissedSignInNotices()

    useAuthState.getState().rearmFromCurrentState()

    applySavedFonts()

    window.api.frontendReady()
  }

  render() {
    return (
      <ContextProvider.Provider
        value={
          { ...bridgedContextSlice(), ...bridgedAccounts() } as ContextType
        }
      >
        {this.props.children}
      </ContextProvider.Provider>
    )
  }
}

export default withTranslation()(GlobalState)
