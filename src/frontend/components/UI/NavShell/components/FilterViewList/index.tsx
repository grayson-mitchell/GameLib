import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import classNames from 'classnames'
import LibraryContext from 'frontend/screens/Library/LibraryContext'
import './index.scss'

/**
 * Quick filters row of the Games tier-2 filter panel, directly under the
 * already-portalled search box (D-34; search itself is not touched here).
 *
 * Quick 261029-riq: console-style pill chips, `(Installed) | (All) (Native)`.
 * - Installed is an independent on/off toggle (`installedOnly`) that ANDs with
 *   every other filter, Native included.
 * - All / Native is a single-select pair bound to `nativeOnly` (All = no
 *   native restriction). Re-clicking the active one is idempotent.
 * - On Windows (`nativeFilterAvailable === false`) every game is native, so
 *   the divider and the pair are not rendered; only Installed shows (D-riq-1).
 * - Recently played and Favourites left the panel; they remain Focus row
 *   options (`FilterFocusRow`).
 *
 * The component keeps its name: the Header import, the gate lists and the
 * `library-views-collections` tour anchor all reference it.
 *
 * Every label is a literal `tGamelib('gamelib:...', '...')` call site:
 * `i18next-parser`'s `JavascriptLexer` only resolves string-literal first
 * arguments, so a key held in data is invisible to `pnpm i18n`.
 */
export default function FilterViewList() {
  const {
    installedOnly,
    setInstalledOnly,
    nativeOnly,
    setNativeOnly,
    nativeFilterAvailable
  } = useContext(LibraryContext)
  const { t: tGamelib } = useTranslation('gamelib')

  return (
    <nav className="FilterViewList">
      <button
        type="button"
        className={classNames('FilterViewList__chip', {
          active: installedOnly
        })}
        aria-pressed={installedOnly}
        onClick={() => setInstalledOnly(!installedOnly)}
      >
        {tGamelib('gamelib:library.filterPanel.viewInstalled', 'Installed')}
      </button>
      {nativeFilterAvailable && (
        <>
          <span className="FilterViewList__divider" aria-hidden="true" />
          <button
            type="button"
            className={classNames('FilterViewList__chip', {
              active: !nativeOnly
            })}
            aria-pressed={!nativeOnly}
            onClick={() => setNativeOnly(false)}
          >
            {tGamelib('gamelib:library.filterPanel.viewAll', 'All games')}
          </button>
          <button
            type="button"
            className={classNames('FilterViewList__chip', {
              active: nativeOnly
            })}
            aria-pressed={nativeOnly}
            onClick={() => setNativeOnly(true)}
          >
            {tGamelib('gamelib:library.filterPanel.native', 'Native')}
          </button>
        </>
      )}
    </nav>
  )
}
