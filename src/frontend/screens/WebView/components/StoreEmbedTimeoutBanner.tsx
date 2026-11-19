import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons'
import { useTranslation } from 'react-i18next'

interface StoreEmbedTimeoutBannerProps {
  /**
   * Pushed by a Rust-side load-timeout: the Epic surface's monitor (Phase 50
   * Plan 02), or on the Tauri embed `STORE_EMBED_LOAD_TIMEOUT`, raised in the
   * Rust nav-event drain (quick 261120-8i5). This component never owns a
   * timer of its own.
   */
  timedOut: boolean
  /**
   * The macOS Epic surface. Picks the timeout variant's message: Epic keeps
   * its own copy, every other store says the page has not finished loading.
   */
  isEpicSurface: boolean
  onReload: () => void
  onOpenInBrowser: () => void
  /**
   * G-47-9: the app's connectivity status is offline. Driven by the sidecar-owned
   * `uiState.connectivity`; this component never probes the network itself. Takes
   * precedence over `timedOut`.
   */
  offline?: boolean
  /** Re-requests the embed's current URL (offline variant's only action). */
  onTryAgain?: () => void
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
 * Quick 261120-8i5: the timeout variant also serves the Tauri-managed embed,
 * where a failed first navigation while ONLINE sends no event at all on
 * macOS. Only the message differs (`isEpicSurface`); Reload and Open in
 * browser are shared.
 *
 * Hookless beyond `useTranslation`, props-driven, fail-soft: a missing
 * callback disables its own affordance instead of throwing (Phase 40
 * D-22/D-23 chrome discipline, T-40-07-06).
 *
 * G-47-9: the row has two variants, both props-driven with no timer. The
 * offline variant (`offline`) is driven by the sidecar-owned connectivity
 * status and wins over the timeout variant. Its Try again re-requests the
 * embed's CURRENT URL, because a reload on a WKWebView that never committed a
 * page does nothing.
 */
export default function StoreEmbedTimeoutBanner({
  timedOut,
  isEpicSurface,
  onReload,
  onOpenInBrowser,
  offline,
  onTryAgain
}: StoreEmbedTimeoutBannerProps) {
  const { t: tGamelib } = useTranslation('gamelib')
  const { t } = useTranslation()

  if (offline) {
    const canTryAgain = typeof onTryAgain === 'function'
    return (
      <div className="WebView__embedNoticeRow" role="status">
        <FontAwesomeIcon
          icon={faTriangleExclamation}
          className="WebView__embedNoticeRow-icon"
        />
        <span className="WebView__embedNoticeRow-message">
          {t(
            'webview.offline.message',
            "You're offline, so this store can't load."
          )}
        </span>
        <div className="WebView__embedNoticeRow-actions">
          <button
            type="button"
            className="WebView__embedNoticeRow-action"
            disabled={!canTryAgain}
            onClick={() => {
              if (canTryAgain) {
                onTryAgain()
              }
            }}
          >
            {t('webview.offline.tryAgain', 'Try again')}
          </button>
        </div>
      </div>
    )
  }

  if (!timedOut) {
    return null
  }

  const message = isEpicSurface
    ? tGamelib(
        'webview.epicEmbed.timeout.message',
        'Epic is taking a while to load'
      )
    : tGamelib(
        'webview.storeEmbed.timeout.message',
        "This page hasn't finished loading"
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
