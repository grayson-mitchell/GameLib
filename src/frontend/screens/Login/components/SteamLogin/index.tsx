import { useEffect, useRef, useState } from 'react'
import { Tab, Tabs } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faSyncAlt,
  faTriangleExclamation,
  faCircleExclamation,
  faCheckCircle
} from '@fortawesome/free-solid-svg-icons'
import QRCode from 'react-qr-code'
import TabPanel from 'frontend/components/UI/TabPanel'
import useAuthState from 'frontend/state/authState'
import { Dialog, DialogHeader } from 'frontend/components/UI/Dialog'
import './index.scss'

/** The QR challenge to draw after a poll: the rotated one when the poll carries a new one, else unchanged. */
export function nextQrChallengeUrl(
  current: string | null,
  poll: { challengeUrl?: string }
): string | null {
  return poll.challengeUrl && poll.challengeUrl !== current
    ? poll.challengeUrl
    : current
}

export type Step =
  | 'checking'
  | 'not-installed'
  | 'tab'
  | 'qr-active'
  | 'qr-confirmed'
  | 'credentials-1'
  | 'credentials-2'

// D-01 (quick task 260822-elw): no account-creation offer once authentication
// is actually in flight -- 'qr-confirmed' (QR scanned, completing sign-in) and
// 'credentials-2' (Steam Guard entry) are excluded so the link never appears
// at the moment the user is closest to success. 'checking' is a bare spinner
// and 'not-installed' already owns its own two-button row with a different
// job, so neither gets the link either.
const CREATE_ACCOUNT_STEPS: readonly Step[] = [
  'tab',
  'qr-active',
  'credentials-1'
]

export function showsCreateAccountLink(step: Step): boolean {
  return CREATE_ACCOUNT_STEPS.includes(step)
}

export function renderCreateAccountLink(step: Step) {
  if (!showsCreateAccountLink(step)) {
    return null
  }

  return (
    <div className="steamCreateAccount">
      <span className="steamCreateAccountPrompt">
        Don&apos;t have a Steam account?
      </span>
      <button
        type="button"
        className="steamCreateAccountLink"
        aria-label="Create a Steam account at steampowered.com"
        onClick={() =>
          window.api.openExternalUrl('https://store.steampowered.com/join/')
        }
      >
        Create one
      </button>
    </div>
  )
}

interface Props {
  dismiss: () => void
}

/** Shown when the credential flow can no longer finish and the user has to start again. */
export const SIGN_IN_ENDED_MESSAGE =
  'This Steam sign-in expired or was declined. Sign in again to get a new code.'

export default function SteamLogin({ dismiss }: Props) {
  const steamLogin = useAuthState((s) => s.steamLogin)
  const closeWindow = () => dismiss()

  const [step, setStep] = useState<Step>('checking')
  const [activeTab, setActiveTab] = useState<'qr' | 'credentials'>('qr')
  const [challengeUrl, setChallengeUrl] = useState<string | null>(null)
  const [isQRLoading, setIsQRLoading] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [guardCode, setGuardCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [signedIn, setSignedIn] = useState(false)

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const credPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  )
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const guardInputRef = useRef<HTMLInputElement>(null)
  const qrRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Bumped whenever the QR poll is stopped or a new QR flow starts: a tick, or
  // a flow start, still awaiting the backend when that happens drops its result
  // so it cannot redraw a dead challenge over the new flow's code (C2/WR-05).
  const qrPollGenRef = useRef(0)
  // Bumped whenever the credential poll is stopped: a tick already awaiting
  // steamPollCredential when its interval is cleared drops its result.
  const credPollGenRef = useRef(0)
  // Bumped when a credential attempt ends without a sign-in: a new submit, Back
  // to Credentials, a tab change or the dialog closing. A submit that resolves
  // after its attempt ended must not restart the poll or move the step.
  const credAttemptRef = useRef(0)

  // --- Cleanup helpers ---
  // quick-261113-wro: a successful sign-in must play the dialog's own exit
  // FIRST; `dismiss` (which slides the login panel down via `loginFlowOpen`)
  // is deferred to the Dialog's onExited. Calling `dismiss` directly left the
  // dialog fully open while the panel slid behind it, then unmounted it
  // un-animated.
  function finishSignIn() {
    setSignedIn(true)
  }

  function clearPollInterval() {
    qrPollGenRef.current++
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }

  function clearCredPollInterval() {
    credPollGenRef.current++
    if (credPollIntervalRef.current) {
      clearInterval(credPollIntervalRef.current)
      credPollIntervalRef.current = null
    }
  }

  function clearErrorTimer() {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current)
      errorTimerRef.current = null
    }
  }

  function endCredAttempt() {
    credAttemptRef.current++
  }

  function clearQrRefreshTimer() {
    if (qrRefreshTimerRef.current) {
      clearTimeout(qrRefreshTimerRef.current)
      qrRefreshTimerRef.current = null
    }
  }

  function showError(msg: string) {
    clearErrorTimer()
    setError(msg)
    errorTimerRef.current = setTimeout(() => {
      setError(null)
    }, 3000)
  }

  // --- Credential poll (out-of-band DeviceConfirmation / phone-approval path) ---
  // Mirrors the QR poll: polls steamPollCredential every 2 s so that if the user
  // approves the login on their phone (DeviceConfirmation) before typing the
  // authenticator code, the frontend learns and dismisses the overlay automatically.
  function startCredPoll() {
    clearCredPollInterval()
    const gen = credPollGenRef.current
    credPollIntervalRef.current = setInterval(async () => {
      const poll = await window.api.steamPollCredential()
      // Stopped while this tick was in flight (sign-in finished on another
      // tick, guard submit, tab change, dialog closed): drop the result.
      if (gen !== credPollGenRef.current) return
      if (poll.status === 'done' && poll.username) {
        clearCredPollInterval()
        setStep('qr-confirmed') // reuse the "completing sign-in" UI
        await steamLogin({ status: 'done', username: poll.username })
        finishSignIn()
      } else if (poll.status === 'done') {
        // Authenticated but CM connect still in flight — keep polling for username.
        setStep('qr-confirmed')
      } else if (poll.status === 'error') {
        // The flow is over (phone denied, timed out, status reads failing,
        // finalisation failed): another code cannot succeed, so say so and
        // go back to the credentials form (C2/WR-02).
        returnToCredentials(SIGN_IN_ENDED_MESSAGE)
      }
      // 'waiting' — keep polling
    }, 2000)
  }

  // The credential flow is gone: stop its poll and ask for the details again.
  // The typed username and password stay, so starting again is one click.
  function returnToCredentials(message: string) {
    endCredAttempt()
    clearCredPollInterval()
    setGuardCode('')
    setStep('credentials-1')
    showError(message)
  }

  // --- QR flow ---
  async function startQRFlow(isCancelled: () => boolean = () => false) {
    setIsQRLoading(true)
    setChallengeUrl(null)
    clearPollInterval()
    clearQrRefreshTimer()
    const gen = qrPollGenRef.current

    const result = await window.api.steamStartQR()
    // A newer flow, a tab change or the dialog closing superseded this start.
    if (isCancelled() || gen !== qrPollGenRef.current) {
      setIsQRLoading(false)
      return
    }
    setIsQRLoading(false)
    if (result.status === 'error' || !result.challengeUrl) {
      showError(
        'Could not generate QR code. Check your connection and try again.'
      )
      setStep('tab')
      return
    }

    setChallengeUrl(result.challengeUrl)
    setStep('qr-active')

    // Poll for scan confirmation
    pollIntervalRef.current = setInterval(async () => {
      const poll = await window.api.steamPollQR()
      // This flow was stopped while the poll was in flight: its challenge is dead.
      if (gen !== qrPollGenRef.current) return
      // Steam rotates the QR challenge (~22 s): redraw so the user never scans a dead code.
      setChallengeUrl((current) => nextQrChallengeUrl(current, poll))
      if (poll.status === 'done' && poll.username) {
        // Username is populated — background CM connect has resolved.
        // Finalize login and dismiss the overlay.
        clearPollInterval()
        clearQrRefreshTimer()
        setStep('qr-confirmed')
        await steamLogin({ status: 'done', username: poll.username })
        finishSignIn()
      } else if (poll.status === 'done') {
        // QR approved but username not yet populated — the background CM
        // connect (connectingPromise) is still in-flight. Show the
        // confirming UI state and keep polling. The connect always
        // resolves within 15 s (worst case: 'Steam User' fallback),
        // so a later poll will carry a username and finalize. Cannot re-hang.
        // The flow is approved: the 110 s auto-refresh must not restart it
        // now, or the window would poll the new flow and never see this
        // sign-in's username.
        clearQrRefreshTimer()
        setStep('qr-confirmed')
      } else if (poll.status === 'error') {
        clearPollInterval()
        // Auto-refresh: silently start a new QR session
        await startQRFlow()
      }
      // 'waiting' — keep polling
    }, 2000)

    // Auto-refresh just before the 2-minute session timeout expires
    qrRefreshTimerRef.current = setTimeout(async () => {
      clearPollInterval()
      await startQRFlow()
    }, 110000)
  }

  // --- Mount: check Steam install ---
  useEffect(() => {
    let mounted = true

    window.api.checkSteamInstalled().then((installed) => {
      if (!mounted) return
      if (!installed) {
        setStep('not-installed')
      } else {
        setStep('tab')
      }
    })

    return () => {
      mounted = false
      endCredAttempt()
      clearPollInterval()
      clearCredPollInterval()
      clearErrorTimer()
      clearQrRefreshTimer()
    }
  }, [])

  // --- Start QR when QR tab is shown ---
  useEffect(() => {
    let cancelled = false

    if (step === 'tab' && activeTab === 'qr') {
      const run = async () => {
        await startQRFlow(() => cancelled)
      }
      run()
    }

    return () => {
      cancelled = true
      setIsQRLoading(false)
      // Do NOT clear the poll interval or refresh timer here. startQRFlow sets
      // them up AFTER calling setStep('qr-active'), which triggers this cleanup
      // before the timers are created. Clearing here would kill the poll
      // immediately after it's set up. Interval/timer cleanup is handled by
      // the mount-effect's unmount callback ([] deps) and explicit calls in
      // handleTabChange and startQRFlow itself.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, activeTab])

  // --- Focus guard input on step 2 ---
  useEffect(() => {
    if (step === 'credentials-2') {
      guardInputRef.current?.focus()
    }
  }, [step])

  // --- Credential submit (step 1) ---
  async function handleCredentialSubmit() {
    endCredAttempt()
    const attempt = credAttemptRef.current
    setLoading(true)
    setError(null)
    const result = await window.api.steamStartCredentials({
      username,
      password
    })
    setLoading(false)

    if (result.status === 'done') {
      const userInfo = await window.api.getSteamUserInfo()
      await steamLogin({ status: 'done', username: userInfo?.username })
      finishSignIn()
    } else if (attempt !== credAttemptRef.current) {
      // The dialog closed or the user left the credentials step while the
      // start was in flight: starting a poll now would outlive the dialog.
      return
    } else if (result.status === 'guard_required') {
      // Start polling for out-of-band completion (DeviceConfirmation phone-approval path).
      // If the user approves on their phone before typing a code, the poll fires
      // authenticated → pollCredentialLogin returns 'done' → we dismiss the overlay.
      // Also covers the case where the session errors mid-wait (e.g. phone denied).
      startCredPoll()
      setStep('credentials-2')
    } else {
      showError(
        'Incorrect username or password. Check your credentials and try again.'
      )
    }
  }

  // --- SteamGuard submit (step 2) ---
  async function handleGuardSubmit() {
    // Stop the out-of-band poll before submitting: if phone approval already
    // settled credSessionState='done', the poll would dismiss the overlay while
    // we're mid-await — clearing it avoids a double-dismissal race.
    clearCredPollInterval()
    const attempt = credAttemptRef.current
    setLoading(true)
    setError(null)
    const result = await window.api.steamSubmitGuard(
      guardCode.trim().toUpperCase()
    )
    setLoading(false)

    if (result.status === 'done') {
      const userInfo = await window.api.getSteamUserInfo()
      await steamLogin({ status: 'done', username: userInfo?.username })
      finishSignIn()
    } else if (attempt !== credAttemptRef.current) {
      // Closed, Back to Credentials or a tab change during the submit: the
      // attempt is over, so do not restart its poll (it would never be cleared).
      return
    } else if (result.reason === 'wrongCode' || result.reason === 'failed') {
      // The flow is still waiting for a code: resume the out-of-band poll so a phone approval
      // after a rejected code still completes sign-in (UAT 79-A item 7).
      startCredPoll()
      showError(
        result.reason === 'wrongCode'
          ? 'Incorrect code. Check your email or authenticator app and try again.'
          : 'Could not reach Steam to check the code. Try again.'
      )
    } else {
      // The flow expired, was declined or failed to finish (C2/WR-02): a retry
      // with any code would fail too.
      returnToCredentials(SIGN_IN_ENDED_MESSAGE)
    }
  }

  // --- Tab change ---
  function handleTabChange(
    _e: React.SyntheticEvent,
    val: 'qr' | 'credentials'
  ) {
    endCredAttempt()
    clearPollInterval()
    clearCredPollInterval()
    clearQrRefreshTimer()
    setError(null)
    setActiveTab(val)
    if (val === 'qr') {
      // The QR poll and refresh timer were just stopped, so whatever flow the
      // step names ('qr-active', 'qr-confirmed', or a credentials step) is no
      // longer followed. Go back to 'tab' so the QR effect above starts a fresh
      // flow; clearPollInterval has already bumped the generation, so a start
      // or tick from the old flow cannot draw over it (C2/WR-05).
      setChallengeUrl(null)
      setStep('tab')
    }
  }

  // --- Render: QR tab content ---
  function renderQRContent() {
    // Quick task 260820-u29 (re-run 2): the loading state and the qr-active
    // state now share ONE markup shape -- same top/bottom <p>, same
    // .steamQrContainer > .steamQrBox nesting -- swapping only the box's
    // inner child (spinner vs QR code) and the bottom caption's text. The
    // box itself is a fixed-size CSS class (index.scss), so its footprint
    // never changes between the two children it can hold, and neither <p>
    // depends on which branch is active. This means the QR's arrival now
    // contributes exactly zero height delta by construction, instead of via
    // a computed reservation on a differently-shaped loading state (see
    // index.scss for why that reservation was removed rather than re-tuned).
    if (isQRLoading || (step === 'qr-active' && challengeUrl)) {
      const showQr = !isQRLoading && !!challengeUrl
      return (
        <div>
          <p
            style={{
              fontSize: 'var(--text-md)',
              color: 'var(--text-default)',
              marginBottom: 'var(--space-md)',
              lineHeight: 1.4
            }}
          >
            Open Steam on your phone and scan this code.
          </p>
          <div className="steamQrContainer">
            <div className="steamQrBox">
              {!isQRLoading && challengeUrl ? (
                <QRCode
                  value={challengeUrl}
                  size={200}
                  fgColor="#000000"
                  bgColor="#ffffff"
                  aria-label="Steam QR code for mobile login"
                  role="img"
                />
              ) : (
                <FontAwesomeIcon
                  icon={faSyncAlt}
                  spin
                  style={{ fontSize: '2.5em', color: 'var(--text-default)' }}
                />
              )}
            </div>
          </div>
          <p
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              textAlign: 'center',
              lineHeight: 1.4
            }}
          >
            {showQr
              ? 'QR code refreshes automatically.'
              : 'Generating QR code...'}
          </p>
        </div>
      )
    }

    if (step === 'qr-confirmed') {
      return (
        <div style={{ textAlign: 'center', padding: 'var(--space-lg) 0' }}>
          <FontAwesomeIcon
            icon={faCheckCircle}
            style={{
              fontSize: '2.5em',
              color: 'var(--status-success)',
              marginBottom: 'var(--space-sm)'
            }}
          />
          <p
            style={{ fontSize: 'var(--text-md)', color: 'var(--text-default)' }}
          >
            QR scanned. Completing sign-in...
          </p>
        </div>
      )
    }

    // Fallback while transitioning
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-lg) 0' }}>
        <FontAwesomeIcon
          icon={faSyncAlt}
          spin
          style={{ fontSize: '2.5em', color: 'var(--text-default)' }}
        />
      </div>
    )
  }

  // --- Render: Credentials tab content ---
  function renderCredentialsContent() {
    // Step 2: SteamGuard
    if (step === 'credentials-2') {
      return (
        <div>
          <p
            id="steamguard-instructions"
            style={{
              fontSize: 'var(--text-md)',
              color: 'var(--text-default)',
              marginBottom: 'var(--space-md)'
            }}
          >
            Check your email or authenticator app for a Steam Guard code.
          </p>

          <div style={{ marginBottom: 'var(--space-md)' }}>
            <label
              htmlFor="steamguard-input"
              style={{
                display: 'block',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
                marginBottom: 'var(--space-3xs)',
                fontWeight: 'var(--regular)'
              }}
            >
              Steam Guard Code
            </label>
            <input
              id="steamguard-input"
              ref={guardInputRef}
              type="text"
              className="sid-input"
              inputMode="text"
              maxLength={5}
              value={guardCode}
              aria-label="Steam Guard code (letters or digits)"
              aria-describedby="steamguard-instructions"
              autoCapitalize="characters"
              style={{ textTransform: 'uppercase' }}
              onChange={(e) => {
                setGuardCode(e.target.value.replace(/\s/g, '').toUpperCase())
                if (error) setError(null)
              }}
            />
          </div>

          {error && (
            <p role="alert" className="steamError">
              <FontAwesomeIcon
                icon={faCircleExclamation}
                style={{ marginRight: 'var(--space-3xs)' }}
              />
              {error}
            </p>
          )}

          <div
            style={{
              display: 'flex',
              gap: 'var(--space-sm)',
              marginTop: 'var(--space-md)'
            }}
          >
            <button
              className="button is-primary"
              disabled={guardCode.length < 5 || loading}
              onClick={handleGuardSubmit}
              style={{ flex: 1 }}
            >
              {loading ? (
                <>
                  <FontAwesomeIcon
                    icon={faSyncAlt}
                    spin
                    style={{ marginRight: 'var(--space-3xs)' }}
                  />
                  Verifying...
                </>
              ) : (
                'Verify Code'
              )}
            </button>
            <button
              className="button is-tertiary"
              onClick={() => {
                endCredAttempt()
                clearCredPollInterval()
                setStep('credentials-1')
                setUsername('')
                setPassword('')
                setGuardCode('')
                setError(null)
              }}
            >
              Back to Credentials
            </button>
          </div>
        </div>
      )
    }

    // Step 1: username + password
    return (
      <div>
        <div style={{ marginBottom: 'var(--space-md)' }}>
          <label
            htmlFor="steam-username"
            style={{
              display: 'block',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              marginBottom: 'var(--space-3xs)',
              fontWeight: 'var(--regular)'
            }}
          >
            Username
          </label>
          <input
            id="steam-username"
            type="text"
            className="sid-input"
            value={username}
            disabled={loading}
            onChange={(e) => {
              setUsername(e.target.value)
              if (error) setError(null)
            }}
          />
        </div>

        <div style={{ marginBottom: 'var(--space-md)' }}>
          <label
            htmlFor="steam-password"
            style={{
              display: 'block',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              marginBottom: 'var(--space-3xs)',
              fontWeight: 'var(--regular)'
            }}
          >
            Password
          </label>
          <input
            id="steam-password"
            type="password"
            className="sid-input"
            value={password}
            disabled={loading}
            onChange={(e) => {
              setPassword(e.target.value)
              if (error) setError(null)
            }}
          />
        </div>

        {error && (
          <p role="alert" className="steamError">
            <FontAwesomeIcon
              icon={faCircleExclamation}
              style={{ marginRight: 'var(--space-3xs)' }}
            />
            {error}
          </p>
        )}

        <button
          className="button is-primary"
          disabled={!username || !password || loading}
          onClick={handleCredentialSubmit}
          style={{ width: '100%', marginTop: 'var(--space-lg)' }}
        >
          {loading ? (
            <>
              <FontAwesomeIcon
                icon={faSyncAlt}
                spin
                style={{ marginRight: 'var(--space-3xs)' }}
              />
              Signing in...
            </>
          ) : (
            'Sign In to Steam'
          )}
        </button>
      </div>
    )
  }

  // --- Render: State 1 (not installed) ---
  // --- Render: checking state ---
  // --- Render: main tabs view (State 2-9) ---
  // All three top-level branches are selected here and rendered inside the
  // single Dialog window shell mounted below, so the window itself never
  // unmounts/remounts as `step` changes.
  function renderWindowBody() {
    if (step === 'not-installed') {
      return (
        <div className="steamNotFound">
          <FontAwesomeIcon
            icon={faTriangleExclamation}
            style={{
              color: 'var(--status-warning)',
              fontSize: 'var(--text-lg)',
              marginBottom: 'var(--space-xs)'
            }}
          />
          <h2
            style={{
              fontSize: 'var(--text-lg)',
              fontWeight: 'var(--bold)',
              fontFamily: 'var(--primary-font-family)',
              color: 'var(--text-default)',
              marginBottom: 'var(--space-xs)'
            }}
          >
            Steam client not found
          </h2>
          <p
            style={{
              fontSize: 'var(--text-md)',
              color: 'var(--text-default)',
              marginBottom: 'var(--space-lg)'
            }}
          >
            GameLib requires the Steam client to authenticate and launch games.
          </p>
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-sm)',
              flexWrap: 'wrap'
            }}
          >
            <button
              className="button is-secondary"
              aria-label="Download Steam client from steampowered.com"
              onClick={() =>
                window.api.openExternalUrl(
                  'https://store.steampowered.com/about/'
                )
              }
            >
              Download Steam
            </button>
            <button className="button is-tertiary" onClick={closeWindow}>
              Return to Login
            </button>
          </div>
        </div>
      )
    }

    if (step === 'checking') {
      return (
        <FontAwesomeIcon icon={faSyncAlt} spin style={{ fontSize: '2em' }} />
      )
    }

    return (
      <>
        <Tabs value={activeTab} onChange={handleTabChange} variant="fullWidth">
          <Tab
            value="qr"
            label="QR Code"
            id="tab-qr"
            aria-controls="tabpanel-qr"
          />
          <Tab
            value="credentials"
            label="Username & Password"
            id="tab-credentials"
            aria-controls="tabpanel-credentials"
          />
        </Tabs>

        <TabPanel value={activeTab} index="qr">
          {renderQRContent()}
        </TabPanel>

        <TabPanel value={activeTab} index="credentials">
          {renderCredentialsContent()}
        </TabPanel>

        {renderCreateAccountLink(step)}
      </>
    )
  }

  return (
    <Dialog
      showCloseButton={true}
      onClose={closeWindow}
      open={!signedIn}
      onExited={signedIn ? closeWindow : undefined}
      className="steamLoginDialog"
    >
      <DialogHeader onClose={closeWindow}>Sign in to Steam</DialogHeader>
      <div className="steamLoginBody">{renderWindowBody()}</div>
    </Dialog>
  )
}
