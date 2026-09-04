/**
 * Store embed chrome (Phase 40 Plan 07, D-22/D-23/D-24, REQ-40-06).
 *
 * The retired `WebviewControls` bar held a live `WebviewTag` handle and synchronously queried its
 * back/forward availability inside `did-navigate` listeners. Under
 * `add_child` there is no such handle in the renderer, and per the D-25 vendored-source verdict
 * (`40-EMBED-API-VERIFICATION.md`) there is no native back/forward/history API on the Rust side
 * either — so back/forward availability is a Rust-side history-stack cursor position, pushed to
 * this component as ordinary props. This component is deliberately hookless (besides
 * `useTranslation`): it holds NO ref to a webview and subscribes to NO navigation event, so it
 * cannot regress into querying a handle that does not exist.
 *
 * The host (plan 40-08) owns the `StoreEmbedNavEvent` subscription and passes the resulting
 * fields down. A back or forward press here is a fresh navigation to a recorded URL, not a
 * restoration of in-page state or scroll position — that is an accepted cost of D-22, not a bug.
 *
 * D-23: only the HOST is ever displayed, never the full URL. GOG's store URLs carry affiliate
 * parameters and checkout flows carry session-bearing query strings; showing either would leak
 * them into a screen users may share or screenshot. The host is derived by parsing `url` and is
 * shown empty (never the raw string, never a thrown error) if parsing fails, because a component
 * that throws on a malformed URL would take the whole store screen down (T-40-07-06).
 *
 * The retired bar's back button fell back to the router's own navigation history when the webview
 * itself could not go back, conflating two unrelated histories. That fallback is deliberately NOT
 * reproduced here: back and forward are disabled purely from the `backAvailable` /
 * `forwardAvailable` props, never guessed locally.
 */

import { ArrowBackOutlined, ArrowForwardRounded, OpenInBrowser, Replay } from '@mui/icons-material'
import cx from 'classnames'
import { useTranslation } from 'react-i18next'

import SvgButton from '../SvgButton'
import './index.css'

export interface StoreEmbedControlsProps {
  /** The embed's current URL (full, with any query string) — used ONLY to derive the host. */
  url: string
  /** Whether a back navigation is currently possible, pushed by the Rust history stack (D-22). */
  backAvailable: boolean
  /** Whether a forward navigation is currently possible, pushed by the Rust history stack (D-22). */
  forwardAvailable: boolean
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onOpenInBrowser: () => void
}

/**
 * Parses `url` for display purposes only: host and scheme. Returns `null` fields rather than
 * throwing when `url` cannot be parsed, so a malformed or empty URL renders an empty chrome
 * instead of crashing the store screen (T-40-07-06).
 */
function parseDisplayUrl(url: string): { host: string; isInsecure: boolean } | null {
  if (!url) {
    return null
  }
  try {
    const parsed = new URL(url)
    return { host: parsed.host, isInsecure: parsed.protocol !== 'https:' }
  } catch {
    return null
  }
}

export default function StoreEmbedControls({
  url,
  backAvailable,
  forwardAvailable,
  onBack,
  onForward,
  onReload,
  onOpenInBrowser
}: StoreEmbedControlsProps) {
  const { t } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')

  const display = parseDisplayUrl(url)
  const host = display?.host ?? ''

  return (
    <div className="StoreEmbedControls">
      <div className="StoreEmbedControls__icons">
        <SvgButton
          className="StoreEmbedControls__icon"
          title={t('webview.controls.back')}
          disabled={!backAvailable}
          onClick={onBack}
        >
          <ArrowBackOutlined />
        </SvgButton>
        <SvgButton
          className="StoreEmbedControls__icon"
          title={t('webview.controls.forward')}
          disabled={!forwardAvailable}
          onClick={onForward}
        >
          <ArrowForwardRounded />
        </SvgButton>
        <SvgButton
          className="StoreEmbedControls__icon"
          title={t('webview.controls.reload')}
          onClick={onReload}
        >
          <Replay />
        </SvgButton>
      </div>
      <span className="StoreEmbedControls__host">
        {host && (
          <span
            className={cx('StoreEmbedControls__hostText', {
              ['StoreEmbedControls__hostText--warning']: display?.isInsecure ?? false
            })}
            aria-label={tGamelib('storeEmbedControls.hostLabel', { host })}
          >
            {host}
          </span>
        )}
      </span>
      <div className="StoreEmbedControls__icons">
        <SvgButton
          className="StoreEmbedControls__icon"
          title={t('webview.controls.openInBrowser')}
          disabled={!url}
          onClick={onOpenInBrowser}
        >
          <OpenInBrowser />
        </SvgButton>
      </div>
    </div>
  )
}
