import { useContext } from 'react'
import ToggleSwitch from '../ToggleSwitch'
import { useTranslation } from 'react-i18next'
import LibraryContext from 'frontend/screens/Library/LibraryContext'
import { Category, CrossoverRatingFilters, PlatformsFilters } from 'frontend/types'
import ContextProvider from 'frontend/state/ContextProvider'
import type { Runner } from 'common/types'
import Dropdown from '../Dropdown'

// 'sideload' deliberately has no entry here -- its label is handled by the
// gamelib:library.storeOther special-case below, before this map is ever
// consulted, so no dead 'Other' string literal remains for the i18n gate to
// (correctly) flag on this object.
const RunnerToStore = {
  legendary: 'Epic Games',
  gog: 'GOG',
  nile: 'Amazon Games',
  zoom: 'ZOOM Platform',
  steam: 'Steam'
}

export default function LibraryFilters() {
  const { t } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')
  const { platform, epic, gog, amazon, zoom, steam } = useContext(ContextProvider)
  const {
    setShowFavourites,
    setShowHidden,
    setShowInstalledOnly,
    setShowNonAvailable,
    showFavourites,
    showHidden,
    showInstalledOnly,
    showNonAvailable,
    storesFilters,
    setStoresFilters,
    platformsFilters,
    setPlatformsFilters,
    crossoverRatingFilters,
    setCrossoverRatingFilters,
    showSupportOfflineOnly,
    setShowSupportOfflineOnly,
    showThirdPartyManagedOnly,
    setShowThirdPartyManagedOnly,
    showUpdatesOnly,
    setShowUpdatesOnly
  } = useContext(LibraryContext)

  // Cycle: Off→Show (toggle-switch click), Show→Off, Only→Show
  const toggleShowHidden = () => {
    if (showHidden === 'off') setShowHidden('show')
    else if (showHidden === 'show') setShowHidden('off')
    else setShowHidden('show')  // 'only' → 'show' on toggle-switch click
  }
  const setHiddenOnly = () => {
    if (showHidden === 'only') setShowHidden('off')  // re-click 'only' → off
    else setShowHidden('only')
  }

  const toggleShowNonAvailable = () => {
    if (showNonAvailable === 'off') setShowNonAvailable('show')
    else if (showNonAvailable === 'show') setShowNonAvailable('off')
    else setShowNonAvailable('show')
  }
  const setNonAvailableOnly = () => {
    if (showNonAvailable === 'only') setShowNonAvailable('off')
    else setShowNonAvailable('only')
  }

  const toggleOnlyFavorites = () => {
    setShowFavourites(!showFavourites)
  }

  const toggleOnlyInstalled = () => {
    setShowInstalledOnly(!showInstalledOnly)
  }

  const toggleOnlySupportOffline = () => {
    setShowSupportOfflineOnly(!showSupportOfflineOnly)
  }

  const toggleThirdParty = () => {
    setShowThirdPartyManagedOnly(!showThirdPartyManagedOnly)
  }

  const toggleUpdatesOnly = () => {
    setShowUpdatesOnly(!showUpdatesOnly)
  }

  const toggleStoreFilter = (store: Runner) => {
    const currentValue = storesFilters[store]
    const newFilters = { ...storesFilters, [store]: !currentValue }
    setStoresFilters(newFilters)
  }

  const togglePlatformFilter = (plat: keyof PlatformsFilters) => {
    const currentValue = platformsFilters[plat]
    const newFilters = { ...platformsFilters, [plat]: !currentValue }
    setPlatformsFilters(newFilters)
  }

  // D-17: macOS-only, multi-select opt-out CrossOver-rating filter — mirrors
  // togglePlatformFilter's spread-and-flip shape, NOT the tri-state
  // showHidden/showNonAvailable chain (a rating filter is inherently
  // multi-select, not off/show/only).
  const toggleCrossoverRatingFilter = (tier: keyof CrossoverRatingFilters) => {
    const currentValue = crossoverRatingFilters[tier]
    const newFilters = { ...crossoverRatingFilters, [tier]: !currentValue }
    setCrossoverRatingFilters(newFilters)
  }

  const setPlatformOnly = (plat: string) => {
    let newFilters = { win: false, linux: false, mac: false, browser: false }
    newFilters = { ...newFilters, [plat]: true }
    setPlatformsFilters(newFilters)
  }
  const setStoreOnly = (store: Category) => {
    let newFilters = {
      legendary: false,
      gog: false,
      nile: false,
      sideload: false,
      zoom: false,
      steam: false
    }
    newFilters = { ...newFilters, [store]: true }
    setStoresFilters(newFilters)
  }

  const toggleWithOnly = (
    toggle: JSX.Element,
    onOnlyClicked: () => void,
    isOnly?: boolean
  ) => {
    return (
      <div className="toggleWithOnly">
        {toggle}
        <button
          className="only"
          onClick={() => onOnlyClicked()}
          aria-pressed={isOnly ?? false}
        >
          {t('header.only', 'only')}
        </button>
      </div>
    )
  }

  // t('platforms.browser', 'Browser')
  // t('platforms.linux', 'Linux')
  // t('platforms.mac', 'Mac')
  // t('platforms.win', 'Windows')
  const platformToggle = (plat: keyof PlatformsFilters) => {
    const toggle = (
      <ToggleSwitch
        key={plat}
        htmlId={plat}
        handleChange={() => togglePlatformFilter(plat)}
        value={platformsFilters[plat]}
        title={t(`platforms.${plat}`)}
      />
    )

    const onOnlyClick = () => {
      setPlatformOnly(plat)
    }

    return toggleWithOnly(toggle, onOnlyClick)
  }

  // t('header.show_crossover_gold', 'Runs great (gold)')
  // t('header.show_crossover_silver', 'Runs well (silver)')
  // t('header.show_crossover_bronze', 'Runs with issues (bronze)')
  // t('header.show_crossover_wont_run', "Known not to work")
  // t('header.show_crossover_unrated', 'Unrated / not yet checked')
  const crossoverRatingLabels: Record<
    keyof CrossoverRatingFilters,
    [string, string]
  > = {
    gold: ['header.show_crossover_gold', 'Runs great (gold)'],
    silver: ['header.show_crossover_silver', 'Runs well (silver)'],
    bronze: ['header.show_crossover_bronze', 'Runs with issues (bronze)'],
    wontRun: ['header.show_crossover_wont_run', "Known not to work"],
    unrated: ['header.show_crossover_unrated', 'Unrated / not yet checked']
  }

  // D-17: no "only" affordance per tier — filter only, no sort. If parity
  // with platformToggle's "only" button is ever wanted, reuse toggleWithOnly()
  // rather than inventing a second only-button implementation.
  const crossoverRatingToggle = (tier: keyof CrossoverRatingFilters) => {
    const [key, defaultText] = crossoverRatingLabels[tier]
    return (
      <ToggleSwitch
        key={tier}
        htmlId={`crossover-rating-${tier}`}
        handleChange={() => toggleCrossoverRatingFilter(tier)}
        value={crossoverRatingFilters[tier]}
        title={t(key, defaultText)}
      />
    )
  }

  // t('Epic Games', 'Epic Games')
  // t('GOG', 'GOG')
  // t('Amazon Games', 'Amazon Games')
  // 'Other' (sideload) moved to gamelib:library.storeOther below -- no
  // longer routed through the default-namespace t(), so no extraction hint.
  const storeToggle = (store: Runner) => {
    const toggle = (
      <ToggleSwitch
        key={store}
        htmlId={store}
        handleChange={() => toggleStoreFilter(store)}
        value={storesFilters[store]}
        title={
          store === 'sideload'
            ? tGamelib('gamelib:library.storeOther', 'Other')
            : t(RunnerToStore[store])
        }
      />
    )
    const onOnlyClick = () => {
      setStoreOnly(store)
    }
    return toggleWithOnly(toggle, onOnlyClick)
  }

  const resetFilters = () => {
    setStoresFilters({
      legendary: true,
      gog: true,
      nile: true,
      sideload: true,
      zoom: true,
      steam: true
    })
    setPlatformsFilters({
      win: true,
      linux: true,
      mac: true,
      browser: true
    })
    setCrossoverRatingFilters({
      gold: true,
      silver: true,
      bronze: true,
      wontRun: true,
      unrated: true
    })
    setShowHidden('off')
    setShowNonAvailable('off')
    setShowFavourites(false)
    setShowInstalledOnly(false)
    setShowSupportOfflineOnly(false)
    setShowThirdPartyManagedOnly(false)
    setShowUpdatesOnly(false)
  }

  return (
    <Dropdown
      buttonClass="selectStyle"
      title={t('header.filters', 'Filters')}
      className="libraryFilters"
      data-tour="library-filters"
    >
      {epic.username && storeToggle('legendary')}
      {gog.username && storeToggle('gog')}
      {amazon.user_id && storeToggle('nile')}
      {zoom.enabled && zoom.username && storeToggle('zoom')} {}
      {steam.username && storeToggle('steam')}
      {storeToggle('sideload')}
      <hr />
      {platformToggle('win')}
      {platform === 'linux' && platformToggle('linux')}
      {platform === 'darwin' && platformToggle('mac')}
      {platform === 'darwin' && (
        <>
          {crossoverRatingToggle('gold')}
          {crossoverRatingToggle('silver')}
          {crossoverRatingToggle('bronze')}
          {crossoverRatingToggle('wontRun')}
          {crossoverRatingToggle('unrated')}
        </>
      )}
      {platformToggle('browser')}
      <hr />
      {toggleWithOnly(
        <ToggleSwitch
          key="show-hidden"
          htmlId="show-hidden"
          handleChange={toggleShowHidden}
          value={showHidden !== 'off'}
          title={t('header.show_hidden', 'Show Hidden')}
        />,
        setHiddenOnly,
        showHidden === 'only'
      )}
      {toggleWithOnly(
        <ToggleSwitch
          key="show-non-available"
          htmlId="show-non-available"
          handleChange={toggleShowNonAvailable}
          value={showNonAvailable !== 'off'}
          title={t('header.show_available_games', 'Show non-Available games')}
        />,
        setNonAvailableOnly,
        showNonAvailable === 'only'
      )}
      <ToggleSwitch
        key="only-favorites"
        htmlId="only-favorites"
        handleChange={() => toggleOnlyFavorites()}
        value={showFavourites}
        title={t('header.show_favourites_only', 'Show Favourites only')}
      />
      <ToggleSwitch
        key="only-installed"
        htmlId="only-installed"
        handleChange={() => toggleOnlyInstalled()}
        value={showInstalledOnly}
        title={t('header.show_installed_only', 'Show Installed only')}
      />
      <ToggleSwitch
        key="only-support-offline"
        htmlId="only-support-offline"
        handleChange={() => toggleOnlySupportOffline()}
        value={showSupportOfflineOnly}
        title={t(
          'header.show_support_offline_only',
          'Show offline-supported only'
        )}
      />
      <ToggleSwitch
        key="only-third-party-managed"
        htmlId="only-third-party-managed"
        handleChange={() => toggleThirdParty()}
        value={showThirdPartyManagedOnly}
        title={t(
          'header.show_third_party_managed_only',
          'Show third-party managed only'
        )}
      />
      <ToggleSwitch
        key="only-updates-available"
        htmlId="only-updates-available"
        handleChange={() => toggleUpdatesOnly()}
        value={showUpdatesOnly}
        title={t('header.show_updates_only', 'Show games with updates only')}
      />
      <hr />
      <button
        type="reset"
        className="button is-primary"
        onClick={() => resetFilters()}
      >
        {t('header.reset', 'Reset')}
      </button>
    </Dropdown>
  )
}
