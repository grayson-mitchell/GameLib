/**
 * quick 261125-r0j: resolves the GameInfo the game page shows, so the page no
 * longer depends on being opened with router state.
 *
 * Resolution order: router state (`{ gameInfo }`, the fast path every in-app
 * entry takes), then the runner's library store list, then
 * `getGameInfo(appName, runner)`. While that last lookup is in flight the
 * loading spinner shows; when nothing comes back (null, a rejection, or a
 * runner the URL made up) the page shows a not-found state instead of throwing
 * into the route's errorElement.
 */
import { Fragment, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getGameInfo } from 'frontend/helpers'
import UpdateComponent from 'frontend/components/UI/UpdateComponent'
import useLibraryState from 'frontend/state/libraryState'
import type { LibraryState } from 'frontend/state/libraryState'
import type { GameInfo, Runner } from 'common/types'

type LibraryLists = Pick<
  LibraryState,
  | 'epicLibrary'
  | 'gogLibrary'
  | 'amazonLibrary'
  | 'steamLibrary'
  | 'sideloadedLibrary'
>

// A full Record: a new Runner is a type error here until it is mapped.
const RUNNER_LIBRARY: Record<Runner, keyof LibraryLists> = {
  legendary: 'epicLibrary',
  gog: 'gogLibrary',
  nile: 'amazonLibrary',
  steam: 'steamLibrary',
  sideload: 'sideloadedLibrary'
}

/** `runner` is a plain string: it comes straight from the unvalidated URL. */
export function findLibraryGame(
  library: LibraryLists,
  runner: string,
  appName: string
): GameInfo | undefined {
  if (!Object.hasOwn(RUNNER_LIBRARY, runner)) return undefined
  const list = library[RUNNER_LIBRARY[runner as Runner]]
  return list.find((game) => game.app_name === appName)
}

interface FetchResult {
  key: string
  gameInfo: GameInfo | null
}

export default function GamePageGate({
  children
}: {
  children: (gameInfo: GameInfo) => JSX.Element
}): JSX.Element {
  const { t } = useTranslation('gamelib')
  const { appName, runner } = useParams() as { appName: string; runner: string }
  const location = useLocation() as { state: { gameInfo?: GameInfo } | null }
  const stateGameInfo = location.state?.gameInfo

  // A non-reactive read on purpose: the gate subscribes to no store, so a later
  // library refresh or logout can never flip a page that is showing back to the
  // loading state.
  const storeGameInfo = stateGameInfo
    ? undefined
    : findLibraryGame(useLibraryState.getState(), runner, appName)

  const key = `${runner}/${appName}`
  const needsFetch = !stateGameInfo && !storeGameInfo
  const [fetched, setFetched] = useState<FetchResult | null>(null)

  useEffect(() => {
    if (!needsFetch) return
    let cancelled = false
    getGameInfo(appName, runner as Runner)
      .then((result) => {
        if (!cancelled) setFetched({ key, gameInfo: result ?? null })
      })
      .catch((error: unknown) => {
        console.error('GamePageGate: getGameInfo failed', error)
        if (!cancelled) setFetched({ key, gameInfo: null })
      })
    return () => {
      cancelled = true
    }
  }, [appName, runner, needsFetch])

  const resolved =
    stateGameInfo ??
    storeGameInfo ??
    (fetched && fetched.key === key ? fetched.gameInfo : undefined)

  if (resolved === undefined) {
    return <UpdateComponent />
  }

  if (resolved === null) {
    return (
      <div className="gamePageNotFound">
        <p>
          {t('gamelib:gamepage.notFound', "GameLib couldn't find this game.")}
        </p>
        <Link to="/library" className="button is-secondary">
          {t('gamelib:gamepage.backToLibrary', 'Back to Library')}
        </Link>
      </div>
    )
  }

  // Keyed so the body, which seeds its state once, remounts when the game changes.
  return <Fragment key={key}>{children(resolved)}</Fragment>
}
