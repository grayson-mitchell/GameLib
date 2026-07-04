import { useContext } from 'react'
import ContextProvider from 'frontend/state/ContextProvider'
import LibraryContext from 'frontend/screens/Library/LibraryContext'
import { Trans, useTranslation } from 'react-i18next'
import './index.css'
import { NavLink } from 'react-router-dom'
import AddGameButton from '../AddGameButton'

function EmptyLibraryMessage() {
  const { epic, gog, amazon, zoom, sideloadedLibrary } =
    useContext(ContextProvider)
  const { showHidden, showNonAvailable } = useContext(LibraryContext)
  const { t, i18n } = useTranslation()

  let message = (
    <Trans i18n={i18n} i18nKey="emptyLibrary.noGames">
      Your library is empty.
      <br />
      <br />
      Click <NavLink to="/login">here</NavLink> to log in with your Epic,
      GOG.com, Amazon, or Zoom accounts. Then, your games will show up here in
      the Library.
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

  // LIB-09: context-aware messages for 'only' modes
  if (showHidden === 'only' && showNonAvailable !== 'only') {
    message = (
      <>{t('library.no_hidden_games', 'No hidden games in your library')}</>
    )
  } else if (showNonAvailable === 'only' && showHidden !== 'only') {
    message = (
      <>
        {t(
          'library.no_non_available_games',
          'No non-available games in your library'
        )}
      </>
    )
  }

  return <p className="noResultsMessage">{message}</p>
}

export default EmptyLibraryMessage
