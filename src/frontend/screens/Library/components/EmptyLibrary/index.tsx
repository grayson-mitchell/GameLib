import { useContext } from 'react'
import ContextProvider from 'frontend/state/ContextProvider'
import LibraryContext from 'frontend/screens/Library/LibraryContext'
import { Trans, useTranslation } from 'react-i18next'
import './index.css'
import { NavLink } from 'react-router-dom'
import AddGameButton from '../AddGameButton'

function EmptyLibraryMessage() {
  const { epic, gog, amazon, steam, zoom, sideloadedLibrary } =
    useContext(ContextProvider)
  const { showHidden, showNonAvailable, noStorePage } =
    useContext(LibraryContext)
  const { t, i18n } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')

  let message = (
    <Trans i18n={i18n} i18nKey="emptyLibrary.noGames">
      Your library is empty.
      <br />
      <br />
      Click <NavLink to="/login">here</NavLink> to log in with your Epic,
      GOG.com, Amazon, Steam, or Zoom accounts. Then, your games will show up
      here in the Library.
      <br />
      <br />
      To use games or apps from other sources, click <AddGameButton /> to add
      them manually.
    </Trans>
  )

  if (
    epic.library.length +
      gog.library.length +
      amazon.library.length +
      (steam?.library.length ?? 0) +
      zoom.library.length +
      sideloadedLibrary.length >
    0
  ) {
    message = (
      <Trans i18n={i18n} i18nKey="emptyLibrary.noResults">
        The current filters produced no results.
      </Trans>
    )
  }

  // LIB-09: context-aware messages for 'only' modes.
  //
  // 37-VERIFICATION G-01: `noStorePage` is the THIRD tri-state and D-10
  // promised it would inherit zero-result handling alongside the chip row and
  // the group badge. Each branch fires only when its own tri-state is the SOLE
  // 'only' -- a union of two or more 'only's is not describable by any single
  // message, so it deliberately falls through to the generic "no results".
  const onlyCount = [showHidden, showNonAvailable, noStorePage].filter(
    (mode) => mode === 'only'
  ).length

  if (onlyCount === 1) {
    if (showHidden === 'only') {
      message = (
        <>{t('library.no_hidden_games', 'No hidden games in your library')}</>
      )
    } else if (showNonAvailable === 'only') {
      message = (
        <>
          {t(
            'library.no_non_available_games',
            'No non-available games in your library'
          )}
        </>
      )
    } else if (noStorePage === 'only') {
      // New key in the `gamelib:` namespace, NOT translation.json: the badge
      // rename in 37-03b established that convention, and D-06 keeps
      // GameLib-only strings out of the upstream catalog.
      message = (
        <>
          {tGamelib(
            'gamelib:library.no_no_store_page_games',
            'No games without a store page in your library'
          )}
        </>
      )
    }
  }

  return <p className="noResultsMessage">{message}</p>
}

export default EmptyLibraryMessage
