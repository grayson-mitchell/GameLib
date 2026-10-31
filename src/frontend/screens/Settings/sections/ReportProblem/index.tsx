import { useContext, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ContextProvider from 'frontend/state/ContextProvider'
import {
  collectDiagnostics,
  getReportEnv,
  isReportingConfigured,
  submitReport
} from 'frontend/helpers/reportProblem'

import type { GameInfo } from 'common/types'
import './index.css'

type Status = 'idle' | 'sending' | 'sent' | 'error'

const gameKey = (g: Pick<GameInfo, 'runner' | 'app_name'>) =>
  `${g.runner}/${g.app_name}`

export default function ReportProblem() {
  const { t } = useTranslation('gamelib')
  const { epic, gog, amazon, steam, humble, sideloadedLibrary } =
    useContext(ContextProvider)

  const configured = isReportingConfigured()

  const [message, setMessage] = useState('')
  const [selectedKey, setSelectedKey] = useState('')
  const [email, setEmail] = useState('')
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [preview, setPreview] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorReason, setErrorReason] = useState('')

  const installedGames = useMemo(() => {
    const all: GameInfo[] = [
      ...(epic?.library ?? []),
      ...(gog?.library ?? []),
      ...(amazon?.library ?? []),
      ...(steam?.library ?? []),
      ...(sideloadedLibrary ?? [])
    ].filter((g) => g.is_installed)
    return all.sort((a, b) => a.title.localeCompare(b.title))
  }, [epic, gog, amazon, steam, sideloadedLibrary])

  const identifiers = [
    epic?.username,
    gog?.username,
    amazon?.user_id,
    amazon?.username,
    steam?.username,
    humble?.username
  ]
  const selectedGame = installedGames.find((g) => gameKey(g) === selectedKey)
  const gameArg = selectedGame && {
    app_name: selectedGame.app_name,
    runner: selectedGame.runner,
    title: selectedGame.title
  }

  useEffect(() => {
    if (!previewOpen || !includeDiagnostics) return
    let cancelled = false
    setPreview(t('reportProblem.previewLoading', 'Collecting...'))
    void collectDiagnostics({
      game: gameArg,
      knownIdentifiers: identifiers
    }).then((text) => {
      if (!cancelled) setPreview(text)
    })
    return () => {
      cancelled = true
    }
  }, [previewOpen, includeDiagnostics, selectedKey])

  const canSend =
    configured && status !== 'sending' && message.trim().length > 0

  async function send() {
    if (!canSend) return
    setStatus('sending')
    const env = await getReportEnv()
    const diagnostics = includeDiagnostics
      ? await collectDiagnostics({
          game: gameArg,
          knownIdentifiers: identifiers
        })
      : undefined
    const result = await submitReport({
      message,
      replyEmail: email,
      diagnostics,
      appVersion: env.appVersion,
      osLabel: env.osLabel
    })
    if (result.ok) {
      setMessage('')
      setEmail('')
      setSelectedKey('')
      setStatus('sent')
    } else {
      setErrorReason(result.reason)
      setStatus('error')
    }
  }

  const errorText = (reason: string) => {
    switch (reason) {
      case 'network':
        return t(
          'reportProblem.error.network',
          "Couldn't connect. Check your internet connection and try again."
        )
      case 'rate-limited':
        return t(
          'reportProblem.error.rateLimited',
          'Too many reports were sent just now. Please wait a little and try again.'
        )
      case 'not-configured':
        return t(
          'reportProblem.error.notConfigured',
          "Reporting isn't set up in this build."
        )
      default:
        return t(
          'reportProblem.error.generic',
          "Your report couldn't be sent. Please try again in a bit. What you typed is still here."
        )
    }
  }

  return (
    <div
      className="reportProblem"
      style={{ width: '770px', textAlign: 'start' }}
    >
      <h3>{t('reportProblem.title', 'Report a problem')}</h3>

      {!configured && (
        <p data-testid="report-unconfigured">
          {t(
            'reportProblem.notConfigured',
            "Reporting isn't set up in this build, so reports can't be sent."
          )}
        </p>
      )}

      <label>
        {t('reportProblem.whatHappened', 'What happened?')}
        <textarea
          data-testid="report-message"
          rows={6}
          style={{ display: 'block', width: '100%' }}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>

      <label style={{ display: 'block', marginTop: '1em' }}>
        {t('reportProblem.whichGame', 'Which game? (optional)')}
        <select
          data-testid="report-game"
          style={{ display: 'block' }}
          value={selectedKey}
          onChange={(e) => setSelectedKey(e.target.value)}
        >
          <option value="">{t('reportProblem.noGame', 'None')}</option>
          {installedGames.map((g) => (
            <option key={gameKey(g)} value={gameKey(g)}>
              {g.title}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'block', marginTop: '1em' }}>
        {t('reportProblem.email', 'Email for a reply (optional)')}
        <input
          data-testid="report-email"
          type="email"
          style={{ display: 'block' }}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <small>
          {t('reportProblem.emailHint', 'Only used to answer this report.')}
        </small>
      </label>

      <label style={{ display: 'block', marginTop: '1em' }}>
        <input
          data-testid="report-include-diagnostics"
          type="checkbox"
          checked={includeDiagnostics}
          onChange={(e) => setIncludeDiagnostics(e.target.checked)}
        />{' '}
        {t('reportProblem.includeDiagnostics', 'Include diagnostics')}
        <br />
        <small>
          {t(
            'reportProblem.includeDiagnosticsHint',
            'Your app version, system, and recent logs help us find the problem. Personal info such as your username and account names is removed first.'
          )}
        </small>
      </label>

      <details
        data-testid="report-preview"
        style={{ marginTop: '1em' }}
        onToggle={(e) => setPreviewOpen(e.currentTarget.open)}
      >
        <summary>
          {t('reportProblem.whatWillBeSent', 'What will be sent')}
        </summary>
        {includeDiagnostics ? (
          <pre
            data-testid="report-preview-text"
            style={{ maxHeight: '300px', overflow: 'auto' }}
          >
            {preview}
          </pre>
        ) : (
          <p>
            {t('reportProblem.noDiagnostics', 'No diagnostics will be sent.')}
          </p>
        )}
      </details>

      {status === 'error' && (
        <p data-testid="report-error" role="alert">
          {errorText(errorReason)}
        </p>
      )}
      {status === 'sent' && (
        <p data-testid="report-thanks" role="status">
          {t('reportProblem.thanks', 'Thank you! Your report was sent.')}
        </p>
      )}

      <button
        data-testid="report-send"
        className="button is-primary"
        disabled={!canSend}
        onClick={() => void send()}
      >
        {status === 'sending'
          ? t('reportProblem.sending', 'Sending...')
          : t('reportProblem.send', 'Send')}
      </button>
    </div>
  )
}
