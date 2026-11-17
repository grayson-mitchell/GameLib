import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useSettingsState from 'frontend/state/settingsState'
import { builtinSeed } from 'frontend/customThemes/builtinTokens'
import {
  customThemeKey,
  resolveThemeKey
} from 'frontend/customThemes/customTheme'
import { ThemeCard } from './ThemeCard'
import { ThemeCardActions } from './ThemeCardActions'
import { RenameThemeDialog } from './RenameThemeDialog'
import { confirmDeleteTheme, showThemeLimitDialog } from './themeDialogs'
import { defaultThemes, resolveThemeLabel } from './themeLabels'
import './index.scss'

const editorPath = (id: string) => `/accessibility/themes/${id}`

/**
 * The theme gallery (THEME-01, THEME-02, D-01..D-03, D-07). Built-ins come from build-time token
 * maps, so there is no loading state; clicking a card applies that theme, as the dropdown did.
 * "Your themes" lists the custom themes in stored (creation) order.
 */
export function ThemeGallery() {
  const { theme, customThemes, setTheme, duplicateTheme, deleteCustomTheme } =
    useSettingsState.keys(
      'theme',
      'customThemes',
      'setTheme',
      'duplicateTheme',
      'deleteCustomTheme'
    )
  const { t } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')
  const navigate = useNavigate()
  const headingId = useId()
  const customHeadingId = useId()
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(
    null
  )
  const resolved = resolveThemeKey(theme, customThemes)

  // OD-6: the copy is never applied; the user lands in its editor and applies it from its card.
  const duplicate = (key: string, name: string) => {
    const result = duplicateTheme(key, (n) =>
      n === null
        ? t('gamelib:customThemes.copyName', '{{name}} copy', { name })
        : t('gamelib:customThemes.copyNameNumbered', '{{name}} copy {{n}}', {
            name,
            n
          })
    )
    if (result.ok) void navigate(editorPath(result.id))
    else if (result.reason === 'limit') showThemeLimitDialog(t)
  }

  return (
    <>
      <div className="themeGallery" role="group" aria-labelledby={headingId}>
        <h3 id={headingId} className="themeGallery__heading">
          {t('gamelib:customThemes.groupBuiltIn', 'Built-in')}
        </h3>
        <div className="themeGallery__grid">
          {Object.keys(defaultThemes).map((key) => (
            <ThemeCard
              key={key}
              themeKey={key}
              name={resolveThemeLabel(key, tGamelib)}
              tokens={builtinSeed(key) ?? {}}
              base={key}
              active={resolved.kind === 'builtin' && resolved.key === key}
              readOnly
              onApply={() => setTheme(key)}
              actions={
                <ThemeCardActions
                  name={resolveThemeLabel(key, tGamelib)}
                  onDuplicate={() =>
                    duplicate(key, resolveThemeLabel(key, tGamelib))
                  }
                />
              }
            />
          ))}
        </div>
      </div>
      <div
        className="themeGallery themeGallery--custom"
        role="group"
        aria-labelledby={customHeadingId}
      >
        <h3 id={customHeadingId} className="themeGallery__heading">
          {t('gamelib:customThemes.groupCustom', 'Your themes')}
        </h3>
        {customThemes.length === 0 ? (
          <div className="themeGallery__empty">
            <h3 className="themeGallery__emptyHeading">
              {t('gamelib:customThemes.emptyHeading', 'No custom themes yet')}
            </h3>
            <p className="themeGallery__emptyBody">
              {t(
                'gamelib:customThemes.emptyBody',
                'Duplicate a theme to start your own. Your copy keeps the original colours until you change them.'
              )}
            </p>
          </div>
        ) : (
          <div className="themeGallery__grid">
            {customThemes.map((custom) => {
              const key = customThemeKey(custom.id)
              return (
                <ThemeCard
                  key={custom.id}
                  themeKey={key}
                  name={custom.name}
                  tokens={custom.tokens}
                  base={custom.base}
                  active={
                    resolved.kind === 'custom' &&
                    resolved.theme.id === custom.id
                  }
                  readOnly={false}
                  onApply={() => setTheme(key)}
                  actions={
                    <ThemeCardActions
                      name={custom.name}
                      onEdit={() => void navigate(editorPath(custom.id))}
                      onDuplicate={() => duplicate(key, custom.name)}
                      onRename={() =>
                        setRenaming({ id: custom.id, name: custom.name })
                      }
                      onDelete={() =>
                        confirmDeleteTheme({
                          t,
                          theme: custom,
                          isActive: key === theme,
                          onConfirm: () => deleteCustomTheme(custom.id)
                        })
                      }
                    />
                  }
                />
              )
            })}
          </div>
        )}
      </div>
      <RenameThemeDialog
        open={renaming !== null}
        themeId={renaming?.id ?? ''}
        currentName={renaming?.name ?? ''}
        onClose={() => setRenaming(null)}
      />
    </>
  )
}
