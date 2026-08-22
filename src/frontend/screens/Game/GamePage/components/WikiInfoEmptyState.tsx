import { useContext, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@mui/material'
import { Refresh } from '@mui/icons-material'
import GameContext from '../../GameContext'

/**
 * Empty state for the game page's "Extra info" tab.
 *
 * Exists because the tab used to be HIDDEN whenever it had nothing to show, which made a
 * failed lookup indistinguishable from a game that genuinely has no scores. That is not a
 * cosmetic distinction: PCGamingWiki answered `403` to our default axios User-Agent for
 * months (see `backend/utils.ts`), which emptied `pcgamingwiki` and — because HowLongToBeat
 * takes its ID from that result — `howlongtobeat` with it. The UI's honest-looking answer
 * to a total outage was to silently render no tab at all, for every game in the library.
 *
 * So this component's job is to make the three cases SAY WHICH ONE THEY ARE:
 *   error   -> the lookup failed; retrying may fix it
 *   notfound-> we asked, the sources had nothing
 *   unknown -> the cached entry predates outcome tracking (`fetchStatus` is optional
 *              precisely because `wikiGameInfoStore` is a 30-day cache holding old-shaped
 *              objects), so we cannot claim either of the above
 *
 * The Retry button is wired to `refreshWikiInfo`, the existing forceRefresh path. Before
 * this component that path had exactly ONE caller — the Refresh icon inside AppleWikiInfo's
 * CrossOver row, which only renders on macOS for a game with CodeWeavers data. On
 * Windows/Linux there was no way to force a re-fetch at all.
 */
const WikiInfoEmptyState = () => {
  const { t } = useTranslation('gamelib')
  const { wikiInfo, refreshWikiInfo } = useContext(GameContext)
  const [refreshing, setRefreshing] = useState(false)

  const onRetry = async () => {
    setRefreshing(true)
    try {
      await refreshWikiInfo?.()
    } finally {
      setRefreshing(false)
    }
  }

  const status = wikiInfo?.fetchStatus
  const failed = status?.pcgamingwiki === 'error'

  const title = failed
    ? t('gamepage.extraInfoErrorTitle', "Couldn't load extra info")
    : t('gamepage.extraInfoEmptyTitle', 'No extra info found')

  let body: string
  if (failed) {
    body = t(
      'gamepage.extraInfoErrorBody',
      'The lookup failed, which is not the same as this game having no data. Try again.'
    )
  } else if (!status) {
    // No `fetchStatus` at all: a pre-existing cache entry. Claiming "the sources had
    // nothing" here would assert something we did not observe.
    body = t(
      'gamepage.extraInfoStaleBody',
      'This result was cached before load outcomes were recorded, so it may be out of date. Refresh to check.'
    )
  } else {
    body = t(
      'gamepage.extraInfoEmptyBody',
      'Metacritic, OpenCritic and HowLongToBeat had nothing for this title.'
    )
  }

  return (
    <div className="wikiInfoEmptyState">
      <b>{title}</b>
      <span>{body}</span>
      <Button
        size="small"
        color="inherit"
        startIcon={<Refresh fontSize="small" />}
        disabled={refreshing}
        onClick={onRetry}
      >
        {t('gamepage.extraInfoRetry', 'Retry')}
      </Button>
    </div>
  )
}

export default WikiInfoEmptyState
