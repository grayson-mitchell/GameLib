// Dev-only hook for the live gate on todo
// 2026-11-05-humble-expiry-toast-overlaps-steam-notice-stack. Registered only
// under `import.meta.env.DEV` in index.tsx; a reload resets everything.
//
// It writes the same zustand stores the real backend pushes write, so the real
// components render with real CSS. This module must stay free of top-level side
// effects (and of `import.meta`, which jest cannot compile) so Rollup can drop
// it from production bundles.
import type { IpcRendererEvent } from 'common/types/hostTypes'
import type { SteamRequestNoticePayload } from 'common/types/steam'
import useAuthState from 'frontend/state/authState'
import {
  handleSteamRequestNoticeSignal,
  useSteamRequestNotice
} from 'frontend/state/SteamRequestNotice'

export interface NoticePreviewApi {
  humble(): void
  steam(kind?: SteamRequestNoticePayload['kind']): boolean
  both(): void
  clear(): void
}

declare global {
  interface Window {
    __gamelibNotices?: NoticePreviewApi
  }
}

let previewSeq = 0

export function registerNoticePreview(
  target: { __gamelibNotices?: NoticePreviewApi } = window
): void {
  const api: NoticePreviewApi = {
    /**
     * Same slice the real humbleAuthState push writes. The toast shows once
     * per false -> true transition, so if it is already expired call clear()
     * first.
     */
    humble() {
      useAuthState.setState((s) => ({ humble: { ...s.humble, expired: true } }))
    },
    steam(kind = 'install-not-started') {
      // Small integer, never Date.now(): real seqs are small Rust-counter
      // integers, and a timestamp would make the mounted notice's
      // lastRequestSeq ref drop every real notice until reload.
      previewSeq =
        Math.max(
          previewSeq,
          useSteamRequestNotice.getState().latest?.seq ?? 0
        ) + 1
      const payload: SteamRequestNoticePayload = {
        appId: '220',
        title: 'Half-Life 2',
        kind,
        ...(kind === 'uninstall-steam-error' ? { code: 2 } : {}),
        seq: previewSeq
      }
      // The real validator, so the preview cannot bypass T-pvk-01.
      handleSteamRequestNoticeSignal({} as IpcRendererEvent, payload)
      return useSteamRequestNotice.getState().latest === payload
    },
    both() {
      api.steam()
      api.humble()
    },
    /**
     * The Humble toast leaves through its normal slot lifecycle. The Steam
     * request stream has no retraction signal in production either: this
     * resets the store, but a Steam notice already on screen leaves the way a
     * real one does, via its X or its 8s auto-hide (frozen while DevTools,
     * not the GameLib window, has focus).
     */
    clear() {
      useAuthState.setState((s) => ({
        humble: { ...s.humble, expired: false }
      }))
      useSteamRequestNotice.setState({ latest: null })
    }
  }
  target.__gamelibNotices = api
}
