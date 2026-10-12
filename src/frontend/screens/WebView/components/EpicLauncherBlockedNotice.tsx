import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons'
import { useTranslation } from 'react-i18next'

export interface EpicLauncherBlockedNoticeProps {
  visible: boolean
  onDismissed: () => void
}

/**
 * Bounded auto-dismiss interval (ms). D-14 names no dismiss control for this
 * notice, so it is one-shot per blocked-launcher-scheme attempt rather than
 * persistent chrome.
 */
const AUTO_DISMISS_MS = 4000

/**
 * D-14 (Phase 50 Plan 03): the blocked-launcher-scheme notice, shown once per
 * navigation attempt the Rust-side `com.epicgames.launcher://` block (Phase
 * 50 Plan 02) rejects.
 *
 * Hookless beyond `useTranslation` (Phase 40 D-22/D-23 chrome discipline,
 * T-40-07-06): this component holds no timer-tracking state of its own.
 * While `visible` is true it schedules exactly one `setTimeout` call to
 * `onDismissed` per invocation, as a plain side effect of being called --
 * not inside a hook. The host owns the mount cadence (D-14's "one toast per
 * attempt"): it is expected to flip `visible` from `false` to `true` once
 * per blocked attempt, and back to `false` once this notice's own
 * `onDismissed` fires, rather than keeping `visible` true across repeated,
 * unrelated re-renders -- which would otherwise schedule a fresh timer on
 * every one of those renders.
 *
 * Deferred idea, not this notice's job: mapping the Epic Games Launcher
 * links this notice reports onto GameLib's own Epic install flow is a NEW
 * CAPABILITY. This notice only blocks the scheme and informs; it starts no
 * install of its own.
 */
export default function EpicLauncherBlockedNotice({
  visible,
  onDismissed
}: EpicLauncherBlockedNoticeProps) {
  const { t: tGamelib } = useTranslation('gamelib')

  if (!visible) {
    return null
  }

  if (typeof onDismissed === 'function') {
    setTimeout(onDismissed, AUTO_DISMISS_MS)
  }

  const message = tGamelib(
    'webview.epicEmbed.launcherBlocked.message',
    "Install from your Library instead — this view can't open the Epic Games Launcher."
  )

  return (
    <div className="WebView__embedNoticeRow" role="status">
      <FontAwesomeIcon
        icon={faTriangleExclamation}
        className="WebView__embedNoticeRow-icon"
      />
      <span className="WebView__embedNoticeRow-message">{message}</span>
    </div>
  )
}
