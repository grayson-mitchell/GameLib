import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons'
import { useTranslation } from 'react-i18next'

export interface StoreEmbedTimeoutBannerProps {
  /**
   * Pushed by the Rust-side load-timeout monitor (Phase 50 Plan 02); this
   * component never owns a timer of its own.
   */
  timedOut: boolean
  onReload: () => void
  onOpenInBrowser: () => void
}

/**
 * D-07/D-08/D-11 (Phase 50 Plan 03): the slow-load banner shown once the
 * Epic subview's cold load exceeds the Rust-side timeout.
 *
 * Three behaviours are easy to get wrong and are spelled out here:
 *
 * 1. The subview stays VISIBLE behind this banner -- it is a row ABOVE the
 *    embed slot, in normal flow, never an overlay that replaces the slot's
 *    content, so a late paint still lands and nothing is torn down while
 *    this banner shows (D-07).
 * 2. The banner clears on the next main-frame finish, driven ENTIRELY by the
 *    `timedOut` prop -- this component holds no state and starts no timer of
 *    its own; a host flipping `timedOut` back to `false` is the only thing
 *    that ever hides this row again.
 * 3. Reload re-issues the CURRENT url, not the configured start url -- this
 *    component never retries on its own; every reload is a direct result of
 *    the user's own click (D-08).
 *
 * Hookless beyond `useTranslation`, props-driven, fail-soft: a missing
 * callback disables its own affordance instead of throwing (Phase 40
 * D-22/D-23 chrome discipline, T-40-07-06).
 */
export default function StoreEmbedTimeoutBanner({
  timedOut,
  onReload,
  onOpenInBrowser
}: StoreEmbedTimeoutBannerProps) {
  const { t: tGamelib } = useTranslation('gamelib')

  if (!timedOut) {
    return null
  }

  const message = tGamelib(
    'webview.epicEmbed.timeout.message',
    'Epic is taking a while to load'
  )
  const reloadLabel = tGamelib('webview.epicEmbed.timeout.reload', 'Reload')
  const openInBrowserLabel = tGamelib(
    'webview.unavailable.open-in-browser',
    'Open in browser'
  )

  const canReload = typeof onReload === 'function'
  const canOpenInBrowser = typeof onOpenInBrowser === 'function'

  return (
    <div className="WebView__embedNoticeRow" role="status">
      <FontAwesomeIcon
        icon={faTriangleExclamation}
        className="WebView__embedNoticeRow-icon"
      />
      <span className="WebView__embedNoticeRow-message">{message}</span>
      <div className="WebView__embedNoticeRow-actions">
        <button
          type="button"
          className="WebView__embedNoticeRow-action"
          disabled={!canReload}
          onClick={() => {
            if (canReload) {
              onReload()
            }
          }}
        >
          {reloadLabel}
        </button>
        <button
          type="button"
          className="WebView__embedNoticeRow-action"
          disabled={!canOpenInBrowser}
          onClick={() => {
            if (canOpenInBrowser) {
              onOpenInBrowser()
            }
          }}
        >
          {openInBrowserLabel}
        </button>
      </div>
    </div>
  )
}
