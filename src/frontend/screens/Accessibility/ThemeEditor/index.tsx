import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useSettingsState from 'frontend/state/settingsState'
import type { CustomTheme } from 'common/types/customTheme'
import { PreviewPane } from './PreviewPane'
import { TokenList } from './TokenList'

const tokensEqual = (
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>
): boolean => {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
  )
}

function EditorBody({ theme }: { theme: CustomTheme }) {
  const { t } = useTranslation()
  const saveCustomThemeTokens = useSettingsState((s) => s.saveCustomThemeTokens)
  // D-05: the draft lives only in this component. It feeds the preview thumbnail; the running app
  // changes only when Save goes through the store.
  const [draft, setDraft] = useState<Record<string, string>>(() => ({
    ...theme.tokens
  }))
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const inFlight = useRef(false)

  const dirty = !tokensEqual(draft, theme.tokens)

  const commit = (token: string, value: string) => {
    setDraft((d) => ({ ...d, [token]: value }))
    setStatus('')
  }

  const save = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setSaving(true)
    try {
      const outcome = await saveCustomThemeTokens(theme.id, draft)
      if (outcome === 'applied') {
        setStatus(t('gamelib:customThemes.savedApplied', 'Saved and applied'))
      } else if (outcome === 'saved') {
        setStatus(t('gamelib:customThemes.saved', 'Saved'))
      }
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return (
    <div className="themeEditor">
      <header className="themeEditor__header">
        <h1 className="headerTitle">
          {t('gamelib:customThemes.editHeading', 'Edit theme')}
        </h1>
        <div className="themeEditor__headerRow">
          <p className="themeEditor__name">{theme.name}</p>
          <button
            type="button"
            className="button is-primary"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {t('gamelib:customThemes.saveTheme', 'Save theme')}
          </button>
        </div>
        <p role="status" aria-live="polite" className="themeEditor__status">
          {status}
        </p>
      </header>
      <div className="themeEditor__panes">
        <TokenList draft={draft} onCommit={commit} />
        <PreviewPane name={theme.name} base={theme.base} tokens={draft} />
      </div>
    </div>
  )
}

export default function ThemeEditor() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const customThemes = useSettingsState((s) => s.customThemes)
  const theme = customThemes.find((c) => c.id === id)

  if (!theme) {
    return (
      <div className="themeEditor themeEditor--missing">
        <h1 className="headerTitle">
          {t('gamelib:customThemes.notFoundHeading', 'Theme not found')}
        </h1>
        <p>
          {t(
            'gamelib:customThemes.notFoundBody',
            'That custom theme no longer exists.'
          )}
        </p>
        <button
          type="button"
          className="button is-secondary"
          onClick={() => void navigate('/accessibility')}
        >
          {t('gamelib:customThemes.backToAppearance', 'Back to Appearance')}
        </button>
      </div>
    )
  }
  return <EditorBody key={theme.id} theme={theme} />
}
