import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import classNames from 'classnames'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons'
import type { WinetricksComponent } from 'common/types'
import { resolveCuratedComponents } from 'common/winetricks/verbs'
import type { VerbErrorMap } from 'common/winetricks/deriveRowState'
import SearchBar from '../../SearchBar'
import Dropdown from '../../Dropdown'
import Row from './Row'
import './index.scss'

type Props = {
  allComponents: WinetricksComponent[]
  installed: readonly string[]
  installing: boolean
  installingComponent: string
  erroredVerbs: VerbErrorMap
  loadingAvailable: boolean
  isRevalidatingInstalled: boolean
  onInstall: (verb: string) => void
  onOpenGui: () => void
}

// Phase 44, plan 04. The browse container: search chrome (SearchBar used for
// input only, see the call site below), a curated "Commonly needed" group
// open by default, one collapsible group per parsed category, and a flat
// results view that replaces the grouped structure at >=2 search
// characters. Composes `Row` (plan 44-03) -- it is not reimplemented here.
export default function WinetricksBrowse({
  allComponents,
  installed,
  installing,
  installingComponent,
  erroredVerbs,
  loadingAvailable,
  isRevalidatingInstalled,
  onInstall,
  onOpenGui
}: Props) {
  const { t } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')

  // The ONLY local state this component holds (C-2 / REQ-44-26 / UI-SPEC
  // Interaction Contract §3): the search string. No "current selection"
  // variable of any kind exists anywhere in this file -- every `Row` below
  // closes over its own `component.verb`, so install is always that row's
  // own action, never a value read out of search-box state or a separately
  // tracked highlight.
  //
  // Category expand/collapse is deliberately NOT lifted into state here --
  // it lives inside each `Dropdown` instance (`useState(false)`), which is
  // what gives D-04's "reset to Default on every dialog open" for free: this
  // component (and every `Dropdown` inside it) mounts fresh on every open,
  // so there is no persistence surface to build or forget to clear. See
  // 44-04-PLAN.md <planner_decisions> §1 and §3.
  const [search, setSearch] = useState('')

  // D-14: categories are derived from the data in first-occurrence order --
  // never sorted, never hardcoded to the UI-SPEC's drawn five (winetricks
  // could add a sixth `===== <category> =====` header and this must not
  // silently drop it). A single `Map` pass preserves insertion order for
  // both the category keys and each key's own member order, so no separate
  // ordering pass or `.sort()` call is needed anywhere in this file.
  const categoryGroups = useMemo(() => {
    const map = new Map<string, WinetricksComponent[]>()
    for (const component of allComponents) {
      const existing = map.get(component.category)
      if (existing) {
        existing.push(component)
      } else {
        map.set(component.category, [component])
      }
    }
    return map
  }, [allComponents])

  // D-03: a curated verb absent from the parsed set is skipped silently --
  // no placeholder row. D-02: `resolveCuratedComponents` does NOT filter
  // matched verbs out of `allComponents`, so a curated verb still appears in
  // its own category group below -- curated is a shortcut view, not a
  // partition.
  const curatedComponents = useMemo(
    () => resolveCuratedComponents(allComponents),
    [allComponents]
  )

  // Ported from `WinetricksSearch/index.tsx:28-45` with one deliberate
  // removal (D-13): that file's line 42,
  // `filtered.filter((c) => !installed?.includes(c.verb))`, is NOT carried
  // forward here. Installed components now appear in search results,
  // badged -- the old installed-filter made searching for something you
  // already have return nothing, which read as "not available" and is a
  // false negative this phase removes. Do NOT restore that line.
  //
  // `useMemo`, not the effect-plus-state-round-trip the old component used:
  // a 567-entry filter does not need a render-then-effect-then-render cycle,
  // and the effect version re-renders twice per keystroke.
  const searchResults = useMemo(() => {
    if (search.length < 2) {
      return []
    }
    const query = search.toLowerCase()
    return allComponents.filter(
      (component) =>
        component.verb.includes(query) ||
        component.title.toLowerCase().includes(query)
    )
  }, [search, allComponents])

  // UI-SPEC Interaction Contract §2: 0-1 characters is the grouped/browse
  // view, >=2 is the flat results view. Threshold unchanged from the
  // existing `WinetricksSearchBar` -- a deliberate anti-noise choice for a
  // 567-item set, not revisited here.
  const isSearching = search.length >= 2

  const clearSearch = () => setSearch('')

  const isFirstLoad = loadingAvailable && allComponents.length === 0
  const isEmpty = !loadingAvailable && allComponents.length === 0

  const rowProps = {
    installed,
    installing,
    installingComponent,
    erroredVerbs,
    onInstall,
    onOpenGui
  }

  return (
    <div className="WinetricksBrowse">
      {/* UI-SPEC Interaction Contract §1, the single most important
          interaction decision in this spec: no suggestions prop is ever
          passed here, so `.autoComplete` (`display: none` except
          `:focus-within`) never renders. Building a browse-first list on
          that focus-conditional overlay would tie the list's mount
          lifecycle to focus state -- this SearchBar is input chrome only.
          The curated group, category groups and flat results below are an
          always-mounted sibling, independent of this input's focus state. */}
      <SearchBar
        onInputChanged={setSearch}
        value={search}
        placeholder={tGamelib(
          'winetricksBrowse.searchPlaceholder',
          'Search components…'
        )}
        loading={loadingAvailable}
      />

      <div className="WinetricksBrowse__region">
        {/* Stale-while-revalidate half of C-1 (plan 44-05 wires up
            `isRevalidatingInstalled`): an overlay only. It must never gate
            whether the panes or their rows below render. */}
        {isRevalidatingInstalled && (
          <div
            className="WinetricksBrowse__revalidating"
            aria-hidden="true"
          />
        )}

        {isFirstLoad && (
          <div className="WinetricksBrowse__loading">
            {t(
              'winetricks.loading-available',
              'Loading available components ...'
            )}
          </div>
        )}

        {isEmpty && (
          <div className="WinetricksBrowse__empty">
            <FontAwesomeIcon icon={faTriangleExclamation} />
            <p className="WinetricksBrowse__emptyHeading">
              {tGamelib(
                'winetricksBrowse.emptyHeading',
                'No components available'
              )}
            </p>
            <p className="WinetricksBrowse__emptyBody">
              {tGamelib(
                'winetricksBrowse.emptyBody',
                'Winetricks metadata could not be loaded for this bottle.'
              )}
            </p>
          </div>
        )}

        {/* Both panes below are ALWAYS mounted as siblings -- only one is
            ever `display: none` via the `--hidden` class (see
            44-04-PLAN.md <planner_decisions> §1). `Dropdown` owns its
            `isExpanded` state internally with no controlled prop, so
            unmounting either pane while the other renders would reset
            every category's expand/collapse state on every search
            round-trip, which UI-SPEC Interaction Contract §2 forbids
            ("collapsing a category to search and back should not silently
            re-collapse a group the user had deliberately opened"). */}
        <div
          className={classNames(
            'WinetricksBrowse__pane',
            'WinetricksBrowse__pane--grouped',
            { 'WinetricksBrowse__pane--hidden': isSearching }
          )}
        >
          {/* Open by default (D-04's Default state), so this is a plain
              always-expanded group, NOT a collapsed `Dropdown` -- rendering
              it as a `Dropdown` would start it collapsed. */}
          {curatedComponents.length > 0 && (
            <div className="WinetricksBrowse__group WinetricksBrowse__group--curated">
              <div className="WinetricksBrowse__groupHeader WinetricksBrowse__groupHeader--curated">
                <span className="WinetricksBrowse__groupTitle">
                  {tGamelib(
                    'winetricksBrowse.curatedGroup',
                    'Commonly needed'
                  )}
                </span>
                <span className="WinetricksBrowse__groupCount">
                  {curatedComponents.length}
                </span>
              </div>
              <div className="WinetricksBrowse__groupBody">
                {curatedComponents.map((component) => (
                  <Row key={component.verb} component={component} {...rowProps} />
                ))}
              </div>
            </div>
          )}

          {/* One `Dropdown`-backed group per distinct `category` value, in
              first-occurrence order (D-14). The header text is the parser's
              own raw category string (`dlls`, `apps`, ...), uppercased by
              CSS `text-transform` -- D-09 cut the five per-category
              translation keys the UI-SPEC drew, so there is no mapping
              table and no translation call here. Every row renders (D-07):
              no windowing, no slicing, no virtualisation library. A curated
              verb is NOT filtered out of its category (D-02), so category
              counts stay honest against the parse. */}
          {Array.from(categoryGroups.entries()).map(([category, components]) => (
            <Dropdown
              key={category}
              className="WinetricksBrowse__group"
              title={
                <>
                  <span className="WinetricksBrowse__groupTitle">
                    {category}
                  </span>
                  <span className="WinetricksBrowse__groupCount">
                    {components.length}
                  </span>
                </>
              }
            >
              {components.map((component) => (
                <Row key={component.verb} component={component} {...rowProps} />
              ))}
            </Dropdown>
          ))}
        </div>

        <div
          className={classNames(
            'WinetricksBrowse__pane',
            'WinetricksBrowse__pane--flat',
            { 'WinetricksBrowse__pane--hidden': !isSearching }
          )}
        >
          <div className="WinetricksBrowse__resultsHeading">
            {tGamelib(
              'winetricksBrowse.resultsHeading',
              '{{total}} results',
              { total: searchResults.length }
            )}
          </div>

          {searchResults.length === 0 ? (
            // REQ-44-25 / UI-SPEC "Zero-result": the state this surface
            // historically got wrong by omission -- the old panel showed
            // nothing typed, no why, no way out. Names the query and offers
            // the same clear path as the search bar's own X.
            <div className="WinetricksBrowse__zeroResult">
              <p className="WinetricksBrowse__zeroResultHeading">
                {tGamelib(
                  'winetricksBrowse.zeroResultHeading',
                  'No components match “{{query}}”.',
                  { query: search }
                )}
              </p>
              <button
                type="button"
                className="WinetricksBrowse__clearSearchButton"
                onClick={clearSearch}
              >
                {tGamelib('winetricksBrowse.clearSearch', 'Clear search')}
              </button>
            </div>
          ) : (
            // D-13: installed components appear here too, badged -- the
            // installed-filter this used to run through is not ported (see
            // the `searchResults` memo above). Each row additionally shows
            // its category as an inline tag, since the grouping that would
            // otherwise supply that context is gone (UI-SPEC §2).
            searchResults.map((component) => (
              <div key={component.verb} className="WinetricksBrowse__flatRow">
                <span className="WinetricksBrowse__categoryTag">
                  {component.category}
                </span>
                <Row component={component} {...rowProps} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
