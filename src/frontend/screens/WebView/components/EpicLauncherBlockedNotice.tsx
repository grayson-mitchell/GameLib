import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

interface EpicLauncherBlockedNoticeProps {
  visible: boolean
  /**
   * Identity of the blocked attempt this notice is reporting -- the host passes
   * `useStoreEmbedHost`'s `launcherSchemeBlockedAt`, a fresh value per NEW attempt. The
   * auto-dismiss timer is keyed on it, so a second attempt while the notice is still up restarts
   * the full interval instead of inheriting the first attempt's remainder.
   */
  attemptKey: number | null
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
 * The auto-dismiss timer lives in ONE effect keyed on `[visible, attemptKey]`,
 * with a cleanup that clears it (Phase 50 review finding 15). It used to be a
 * bare `setTimeout` issued during render, which scheduled a fresh timer on
 * EVERY render while visible -- and the host re-renders on every nav-state
 * drain -- so stale timers from earlier renders dismissed a later attempt's
 * notice early, breaking D-14's "one toast per attempt". Now an unrelated
 * re-render schedules nothing, hiding clears the pending timer, and a new
 * attempt restarts the full interval. `onDismissed` is read through a ref so
 * the host's inline callback (a new identity each render) never re-arms it.
 * Still no display state of its own (Phase 40 D-22/D-23 chrome discipline,
 * T-40-07-06): `visible` stays the host's.
 *
 * Deferred idea, not this notice's job: mapping the Epic Games Launcher
 * links this notice reports onto GameLib's own Epic install flow is a NEW
 * CAPABILITY. This notice only blocks the scheme and informs; it starts no
 * install of its own.
 */
export default function EpicLauncherBlockedNotice({
  visible,
  attemptKey,
  onDismissed
}: EpicLauncherBlockedNoticeProps) {
  const { t: tGamelib } = useTranslation('gamelib')

  const onDismissedRef = useRef(onDismissed)
  onDismissedRef.current = onDismissed

  useEffect(() => {
    if (!visible) return undefined
    const handle = setTimeout(() => {
      const dismiss = onDismissedRef.current
      if (typeof dismiss === 'function') dismiss()
    }, AUTO_DISMISS_MS)
    return () => clearTimeout(handle)
  }, [visible, attemptKey])

  if (!visible) {
    return null
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
