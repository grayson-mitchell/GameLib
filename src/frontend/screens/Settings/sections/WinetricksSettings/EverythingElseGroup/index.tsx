import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WinetricksComponent } from 'common/types'
import GroupHeader from '../GroupHeader'
import type { RenderWinetricksRow } from '../Row'
import './index.scss'

type Props = {
  // The whole visible catalog, in parser order (D-07: task groups are shortcut
  // views, so every verb they show is also here).
  components: WinetricksComponent[]
  renderRow: RenderWinetricksRow
}

// Carried forward unchanged from Phase 44: a deliberate anti-noise choice for a
// catalog of about 500 visible verbs.
const SEARCH_MIN_CHARS = 2

// D-05/D-07: the long tail, collapsed by default, with a search that filters
// ONLY this group's flat list -- never Suggested or the task groups, which are
// curated views, so a search hit cannot silently reorder or duplicate a row
// that is already visible elsewhere.
//
// The query is this component's only state besides `expanded`. Selection lives
// in the tab, keyed by verb, so a verb ticked while filtered stays ticked after
// the search is cleared or the group is collapsed (Interaction Contract 3).
//
// The input is a plain `<input type="search">`, not `SearchBar`: SearchBar's
// suggestions overlay is a `display: none` panel that only renders on
// `:focus-within`, and a plain input removes that hazard entirely (Interaction
// Contract 4). Every catalog row renders; there is no virtualisation because no
// measured number justifies it (Phase 44 D-07, still binding).
export default function EverythingElseGroup({ components, renderRow }: Props) {
  const { t: tGamelib } = useTranslation('gamelib')
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState('')

  const bodyId = 'winetricks-group-everythingElse'
  const trimmed = query.trim()
  const needle = trimmed.toLowerCase()
  const searching = trimmed.length >= SEARCH_MIN_CHARS
  const visible = searching
    ? components.filter(
        (component) =>
          component.verb.toLowerCase().includes(needle) ||
          component.title.toLowerCase().includes(needle)
      )
    : components

  const searchLabel = tGamelib(
    'winetricksBrowse.searchPlaceholder',
    'Search components…'
  )

  return (
    <section className="WinetricksEverythingElse">
      <GroupHeader
        label={tGamelib('winetricksBrowse.everythingElse', 'Everything else')}
        count={components.length}
        expanded={expanded}
        onToggle={() => setExpanded((open) => !open)}
        controlsId={bodyId}
      />
      <div
        id={bodyId}
        className="WinetricksEverythingElse__body"
        hidden={!expanded}
      >
        {expanded && (
          <>
            <div className="WinetricksEverythingElse__search">
              <input
                type="search"
                className="WinetricksEverythingElse__input"
                value={query}
                placeholder={searchLabel}
                aria-label={searchLabel}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            {searching && visible.length > 0 && (
              <p className="WinetricksEverythingElse__results">
                {tGamelib('winetricksBrowse.resultsHeading', {
                  count: visible.length,
                  defaultValue: '{{count}} results',
                  defaultValue_one: '{{count}} result',
                  defaultValue_other: '{{count}} results'
                })}
              </p>
            )}
            {searching && visible.length === 0 && (
              <div className="WinetricksEverythingElse__zero">
                <p className="WinetricksEverythingElse__zeroHeading">
                  {tGamelib('winetricksBrowse.zeroResultHeading', {
                    query: trimmed,
                    defaultValue: 'No components match “{{query}}”.'
                  })}
                </p>
                <button
                  type="button"
                  className="WinetricksEverythingElse__clear"
                  onClick={() => setQuery('')}
                >
                  {tGamelib('winetricksBrowse.clearSearch', 'Clear search')}
                </button>
              </div>
            )}
            {visible.map((component) =>
              renderRow(component, 'oneLine', searching)
            )}
          </>
        )}
      </div>
    </section>
  )
}
