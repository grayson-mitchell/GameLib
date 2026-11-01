import { useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import SteamBridgeInviteDialog from 'frontend/components/UI/SteamBridgeInviteDialog'
import { useSteamBridgeInvite } from 'frontend/state/SteamBridgeInvite'
import type { BridgeInvitePickerParams } from 'common/bridgeInvitePicker'

// Quick 261101-llf: root of the dedicated `bridge-invite` Tauri window. The main window no
// longer mounts the friend picker or subscribes to an invite push; the shell opens this window
// with `?window=bridge-invite&appId=..&ackId=..` and src/frontend/index.tsx mounts only this
// component (no GlobalState, no App). It opens the store from the URL params; the dialog it
// renders still owns the display ack (`dialogDisplayed(ackId)`). When the store closes (Close
// button or Esc) it closes its own window, which runs the shell's CloseRequested hook that hands
// focus back to the game.
const BridgeInvitePickerRoot = ({
  params
}: {
  params: BridgeInvitePickerParams
}) => {
  useEffect(() => {
    useSteamBridgeInvite
      .getState()
      .open({ appId: params.appId, ackId: params.ackId })
  }, [params.appId, params.ackId])

  useEffect(
    () =>
      useSteamBridgeInvite.subscribe((state, prev) => {
        if (prev.isOpen && !state.isOpen) void getCurrentWindow().close()
      }),
    []
  )

  return <SteamBridgeInviteDialog />
}

export default BridgeInvitePickerRoot
