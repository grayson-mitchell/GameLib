import { useEffect, useRef, useState } from 'react'
import { useBlocker, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft, faPenToSquare } from '@fortawesome/free-solid-svg-icons'
import useSettingsState from 'frontend/state/settingsState'
import { useThemeSaveFailedNotice } from 'frontend/state/ThemeSaveFailedNotice'
import type { CustomTheme } from 'common/types/customTheme'
import { customThemeKey } from 'frontend/customThemes/customTheme'
import { resolveThemeLabel } from 'frontend/components/UI/ThemeSelector/themeLabels'
import { RenameThemeDialog } from 'frontend/components/UI/ThemeSelector/RenameThemeDialog'
import { PreviewPane } from './PreviewPane'
import { TokenList } from './TokenList'
import { showUnsavedChangesDialog } from './unsavedChangesDialog'
import './index.scss'

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
  const { t: tGamelib } = useTranslation('gamelib')
  const navigate = useNavigate()
  const saveCustomThemeTokens = useSettingsState((s) => s.saveCustomThemeTokens)
  const activeThemeKey = useSettingsState((s) => s.theme)
  // D-05: the draft lives only in this component. It feeds the preview thumbnail; the running app
  // changes only when Save goes through the store.
  const [draft, setDraft] = useState<Record<string, string>>(() => ({
    ...theme.tokens
  }))
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [renaming, setRenaming] = useState(false)
  const inFlight = useRef(false)

  const dirty = !tokensEqual(draft, theme.tokens)

  // An empty value clears a live-derived token so it follows its source again (OD-1).
  const commit = (token: string, value: string) => {
    setDraft((d) => {
      const next = { ...d, [token]: value }
      if (value === '') delete next[token]
      return next
    })
    setStatus('')
  }

  // Resolves with the store outcome, or null when a save was already in flight.
  const save = async (): Promise<'saved' | 'applied' | 'failed' | null> => {
    if (inFlight.current) return null
    inFlight.current = true
    setSaving(true)
    try {
      const outcome = await saveCustomThemeTokens(theme.id, draft)
      if (outcome === 'applied') {
        setStatus(t('gamelib:customThemes.savedApplied', 'Saved and applied'))
      } else if (outcome === 'saved') {
        setStatus(t('gamelib:customThemes.saved', 'Saved'))
      }
      // A refused write announces nothing as saved; the draft stays dirty and the notice says why.
      if (outcome === 'failed')
        useThemeSaveFailedNotice.getState().show(theme.name)
      return outcome
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  // D-06: Back and every other route change share one prompt. Only a change of path counts as
  // leaving; a clean draft, or a save already in flight, never blocks.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !saving && currentLocation.pathname !== nextLocation.pathname
  )
  const latest = useRef({ blocker, save, name: theme.name, t })
  useEffect(() => {
    latest.current = { blocker, save, name: theme.name, t }
  })
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    showUnsavedChangesDialog({
      t,
      name: latest.current.name,
      onKeepEditing: () => latest.current.blocker.reset?.(),
      onDiscard: () => latest.current.blocker.proceed?.(),
      onSave: () => {
        void latest.current.save().then((outcome) => {
          // A refused or skipped save stays in the editor; the draft is still dirty.
          if (outcome === 'saved' || outcome === 'applied')
            latest.current.blocker.proceed?.()
          else latest.current.blocker.reset?.()
        })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per block; the handlers read the latest values through the ref
  }, [blocker.state])

  const isActive = activeThemeKey === customThemeKey(theme.id)

  return (
    <div className="themeEditor">
      <header className="themeEditor__header">
        <button
          type="button"
          className="button is-text themeEditor__back"
          aria-label={t(
            'gamelib:customThemes.backToAppearance',
            'Back to Appearance'
          )}
          onClick={() => void navigate('/accessibility')}
        >
          <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
          {t('gamelib:customThemes.back', 'Appearance')}
        </button>
        <h1 className="headerTitle">
          {t('gamelib:customThemes.editHeading', 'Edit theme')}
        </h1>
        <div className="themeEditor__headerRow">
          <div className="themeEditor__identity">
            <div className="themeEditor__nameRow">
              <p className="themeEditor__name">{theme.name}</p>
              {/* OD-5: the same Rename dialog the gallery card opens. Renaming never touches the
                  token draft, so it neither dirties the editor nor trips the leave prompt. */}
              <button
                type="button"
                className="button is-text themeEditor__rename"
                aria-label={t(
                  'gamelib:customThemes.actionRename',
                  'Rename {{name}}',
                  { name: theme.name }
                )}
                onClick={() => setRenaming(true)}
              >
                <FontAwesomeIcon icon={faPenToSquare} aria-hidden="true" />
              </button>
            </div>
            <p className="themeEditor__base">
              {t('gamelib:customThemes.basedOn', 'Based on {{base}}', {
                base: resolveThemeLabel(theme.base, tGamelib)
              })}
            </p>
          </div>
          <div className="themeEditor__actions">
            {dirty && (
              <p className="themeEditor__unsaved">
                <span className="themeEditor__unsavedDot" aria-hidden="true" />
                {t('gamelib:customThemes.unsaved', 'Unsaved changes')}
              </p>
            )}
            <button
              type="button"
              className="button is-primary"
              disabled={!dirty || saving}
              onClick={() => void save()}
            >
              {t('gamelib:customThemes.saveTheme', 'Save theme')}
            </button>
          </div>
        </div>
        {!isActive && (
          <p className="themeEditor__note">
            {t(
              'gamelib:customThemes.inactiveNote',
              'This isn’t your active theme. Pick it in the gallery to use it.'
            )}
          </p>
        )}
        <p role="status" aria-live="polite" className="themeEditor__status">
          {status}
        </p>
      </header>
      <RenameThemeDialog
        open={renaming}
        themeId={theme.id}
        currentName={theme.name}
        onClose={() => setRenaming(false)}
      />
      <div className="themeEditor__panes">
        <PreviewPane name={theme.name} base={theme.base} tokens={draft} />
        <TokenList base={theme.base} draft={draft} onCommit={commit} />
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
