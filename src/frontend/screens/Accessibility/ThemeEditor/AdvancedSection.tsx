import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import classnames from 'classnames'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown } from '@fortawesome/free-solid-svg-icons'
import { builtinSeed } from 'frontend/customThemes/builtinTokens'
import {
  CORE_TOKENS,
  LIVE_DERIVED_TOKENS,
  NON_COLOUR_TOKENS
} from 'frontend/customThemes/tokens'
import { looksLikeGradient } from 'frontend/customThemes/validate'
import { TokenRow } from './TokenRow'
import { resolveTokenLabel } from './tokenLabels'

interface AdvancedSectionProps {
  /** The theme's base: its frozen seed names every token a copy can carry. */
  base: string
  draft: Readonly<Record<string, string>>
  onCommit: (token: string, value: string) => void
}

const CORE = new Set<string>(CORE_TOKENS)
const NON_COLOUR = new Set<string>(NON_COLOUR_TOKENS)

/**
 * Every resolved token that is not one of the 27 core rows, sorted by name (D-12): the base seed's
 * keys, the draft's keys and the live-derived tokens (which a copy never stores, OD-1), minus the
 * core tokens and the non-colour `--focus-ring-width`.
 */
export function advancedTokens(
  base: string,
  draft: Readonly<Record<string, string>>
): string[] {
  const names = new Set([
    ...Object.keys(builtinSeed(base) ?? {}),
    ...Object.keys(draft),
    ...Object.keys(LIVE_DERIVED_TOKENS)
  ])
  return [...names].filter((n) => !CORE.has(n) && !NON_COLOUR.has(n)).sort()
}

/**
 * The collapsed "Advanced" disclosure (D-12): a count of the hidden tokens; when open, a filter
 * input and one flat list. Colours get the same row as the core tokens; a gradient token gets a raw
 * text field (D-14). `--gradient-body-background` is always a gradient row, even while empty.
 */
export function AdvancedSection({
  base,
  draft,
  onCommit
}: AdvancedSectionProps) {
  const { t } = useTranslation()
  const panelId = useId()
  const filter = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const tokens = useMemo(() => advancedTokens(base, draft), [base, draft])

  // A native listener, not React's onChange, so the on-screen keyboard works (as ColourField).
  useEffect(() => {
    const element = filter.current
    if (!element) return
    const handler = () => setQuery(element.value)
    element.addEventListener('input', handler)
    return () => element.removeEventListener('input', handler)
  }, [open])

  const needle = query.trim().toLowerCase()
  const visible = needle
    ? tokens.filter(
        (name) =>
          name.toLowerCase().includes(needle) ||
          resolveTokenLabel(name, t).toLowerCase().includes(needle)
      )
    : tokens

  const seed = builtinSeed(base)
  const isGradient = (name: string) =>
    name === '--gradient-body-background' ||
    looksLikeGradient(draft[name] ?? seed?.[name] ?? '')

  return (
    <section className="themeEditor__advanced">
      <button
        type="button"
        className="themeEditor__advancedToggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <FontAwesomeIcon
          icon={faChevronDown}
          aria-hidden="true"
          className={classnames('themeEditor__advancedChevron', {
            'is-open': open
          })}
        />
        <span className="themeEditor__advancedTitle">
          {t('gamelib:customThemes.advanced', 'Advanced')}
        </span>
        <span className="themeEditor__advancedCount">
          {t('gamelib:customThemes.advancedCount', {
            count: tokens.length,
            defaultValue_one: '{{count}} more token',
            defaultValue_other: '{{count}} more tokens'
          })}
        </span>
      </button>
      {open && (
        <div id={panelId} className="themeEditor__advancedPanel">
          <input
            ref={filter}
            type="text"
            className="themeEditor__filter"
            defaultValue={query}
            placeholder={t(
              'gamelib:customThemes.filterPlaceholder',
              'Filter tokens'
            )}
            aria-label={t(
              'gamelib:customThemes.filterPlaceholder',
              'Filter tokens'
            )}
            spellCheck={false}
            autoComplete="off"
          />
          {visible.length === 0 ? (
            <p className="themeEditor__filterEmpty">
              {t(
                'gamelib:customThemes.filterEmpty',
                'No tokens match “{{query}}”.',
                { query: query.trim() }
              )}
            </p>
          ) : (
            visible.map((name) => (
              <TokenRow
                key={name}
                token={name}
                value={draft[name] ?? ''}
                onCommit={onCommit}
                base={base}
                gradient={isGradient(name)}
              />
            ))
          )}
        </div>
      )}
    </section>
  )
}
