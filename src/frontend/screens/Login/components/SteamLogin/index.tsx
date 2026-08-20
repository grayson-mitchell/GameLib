import { useContext, useEffect, useRef, useState } from 'react'
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
import ContextProvider from 'frontend/state/ContextProvider'
import { Dialog, DialogHeader } from 'frontend/components/UI/Dialog'
import './index.scss'

type Step =
  | 'checking'
  | 'not-installed'
  | 'tab'
  | 'qr-active'
  | 'qr-confirmed'
  | 'credentials-1'
  | 'credentials-2'

interface Props {
  dismiss: () => void
}

export default function SteamLogin({ dismiss }: Props) {
  const { steam } = useContext(ContextProvider)
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

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const credPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const guardInputRef = useRef<HTMLInputElement>(null)
  const qrRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // --- Cleanup helpers ---
  function clearPollInterval() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }

  function clearCredPollInterval() {
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
    credPollIntervalRef.current = setInterval(async () => {
      const poll = await window.api.steamPollCredential()
      if (poll.status === 'done' && poll.username) {
        clearCredPollInterval()
        setStep('qr-confirmed') // reuse the "completing sign-in" UI
        await steam.login({ status: 'done', username: poll.username })
        closeWindow()
      } else if (poll.status === 'done') {
        // Authenticated but CM connect still in flight — keep polling for username.
        setStep('qr-confirmed')
      } else if (poll.status === 'error') {
        // Session errored (e.g. poll failure, phone denied).
        // Stop polling; the guard-code input remains so the user can retry
        // or press "Back to Credentials" to start a fresh session.
        clearCredPollInterval()
      }
      // 'waiting' — keep polling
    }, 2000)
  }

  // --- QR flow ---
  async function startQRFlow(isCancelled: () => boolean = () => false) {
    setIsQRLoading(true)
    setChallengeUrl(null)
    clearPollInterval()
    clearQrRefreshTimer()

    const result = await window.api.steamStartQR()
    if (isCancelled()) {
      setIsQRLoading(false)
      return
    }
    setIsQRLoading(false)
    if (result.status === 'error' || !result.challengeUrl) {
      showError('Could not generate QR code. Check your connection and try again.')
      setStep('tab')
      return
    }

    setChallengeUrl(result.challengeUrl)
    setStep('qr-active')

    // Poll for scan confirmation
    pollIntervalRef.current = setInterval(async () => {
      const poll = await window.api.steamPollQR()
      if (poll.status === 'done' && poll.username) {
        // Username is populated — background CM connect has resolved.
        // Finalize login and dismiss the overlay.
        clearPollInterval()
        clearQrRefreshTimer()
        setStep('qr-confirmed')
        await steam.login({ status: 'done', username: poll.username })
        closeWindow()
      } else if (poll.status === 'done') {
        // QR approved but username not yet populated — the background CM
        // connect (connectingPromise) is still in-flight. Show the
        // confirming UI state and keep polling. The connect always
        // resolves within 15 s (worst case: 'Steam User' fallback),
        // so a later poll will carry a username and finalize. Cannot re-hang.
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
    setLoading(true)
    setError(null)
    const result = await window.api.steamStartCredentials({ username, password })
    setLoading(false)

    if (result.status === 'done') {
      const userInfo = await window.api.getSteamUserInfo()
      await steam.login({ status: 'done', username: userInfo?.username })
      closeWindow()
    } else if (result.status === 'guard_required') {
      // Start polling for out-of-band completion (DeviceConfirmation phone-approval path).
      // If the user approves on their phone before typing a code, the poll fires
      // authenticated → pollCredentialLogin returns 'done' → we dismiss the overlay.
      // Also covers the case where the session errors mid-wait (e.g. phone denied).
      startCredPoll()
      setStep('credentials-2')
    } else {
      showError('Incorrect username or password. Check your credentials and try again.')
    }
  }

  // --- SteamGuard submit (step 2) ---
  async function handleGuardSubmit() {
    // Stop the out-of-band poll before submitting: if phone approval already
    // settled credSessionState='done', the poll would dismiss the overlay while
    // we're mid-await — clearing it avoids a double-dismissal race.
    clearCredPollInterval()
    setLoading(true)
    setError(null)
    const result = await window.api.steamSubmitGuard(guardCode.trim().toUpperCase())
    setLoading(false)

    if (result.status === 'done') {
      const userInfo = await window.api.getSteamUserInfo()
      await steam.login({ status: 'done', username: userInfo?.username })
      closeWindow()
    } else {
      showError('Incorrect code. Check your email or authenticator app and try again.')
    }
  }

  // --- Tab change ---
  function handleTabChange(_e: React.SyntheticEvent, val: 'qr' | 'credentials') {
    clearPollInterval()
    clearCredPollInterval()
    clearQrRefreshTimer()
    setError(null)
    setActiveTab(val)
    if (val === 'qr') {
      // startQRFlow will be triggered by the effect above
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
            {showQr ? 'QR code refreshes automatically.' : 'Generating QR code...'}
          </p>
        </div>
      )
    }

    if (step === 'qr-confirmed') {
      return (
        <div style={{ textAlign: 'center', padding: 'var(--space-lg) 0' }}>
          <FontAwesomeIcon
            icon={faCheckCircle}
            style={{ fontSize: '2.5em', color: 'var(--status-success)', marginBottom: 'var(--space-sm)' }}
          />
          <p style={{ fontSize: 'var(--text-md)', color: 'var(--text-default)' }}>
            QR scanned. Completing sign-in...
          </p>
        </div>
      )
    }

    // Fallback while transitioning
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-lg) 0' }}>
        <FontAwesomeIcon icon={faSyncAlt} spin style={{ fontSize: '2.5em', color: 'var(--text-default)' }} />
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
            style={{ fontSize: 'var(--text-md)', color: 'var(--text-default)', marginBottom: 'var(--space-md)' }}
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
              <FontAwesomeIcon icon={faCircleExclamation} style={{ marginRight: 'var(--space-3xs)' }} />
              {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
            <button
              className="button is-primary"
              disabled={guardCode.length < 5 || loading}
              onClick={handleGuardSubmit}
              style={{ flex: 1 }}
            >
              {loading ? (
                <>
                  <FontAwesomeIcon icon={faSyncAlt} spin style={{ marginRight: 'var(--space-3xs)' }} />
                  Verifying...
                </>
              ) : (
                'Verify Code'
              )}
            </button>
            <button
              className="button is-tertiary"
              onClick={() => {
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
            <FontAwesomeIcon icon={faCircleExclamation} style={{ marginRight: 'var(--space-3xs)' }} />
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
              <FontAwesomeIcon icon={faSyncAlt} spin style={{ marginRight: 'var(--space-3xs)' }} />
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
            style={{ color: 'var(--status-warning)', fontSize: 'var(--text-lg)', marginBottom: 'var(--space-xs)' }}
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
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
            <button
              className="button is-secondary"
              aria-label="Download Steam client from steampowered.com"
              onClick={() => window.api.openExternalUrl('https://store.steampowered.com/about/')}
            >
              Download Steam
            </button>
            <button
              className="button is-tertiary"
              onClick={closeWindow}
            >
              Return to Login
            </button>
          </div>
        </div>
      )
    }

    if (step === 'checking') {
      return <FontAwesomeIcon icon={faSyncAlt} spin style={{ fontSize: '2em' }} />
    }

    return (
      <>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="fullWidth"
        >
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
      </>
    )
  }

  return (
    <Dialog showCloseButton={true} onClose={closeWindow} className="steamLoginDialog">
      <DialogHeader onClose={closeWindow}>Sign in to Steam</DialogHeader>
      <div className="steamLoginBody">{renderWindowBody()}</div>
    </Dialog>
  )
}
