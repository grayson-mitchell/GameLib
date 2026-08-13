import './index.scss'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faSpinner,
  faSearch,
  faTimes,
  faArrowLeft
} from '@fortawesome/free-solid-svg-icons'
import CachedImage from 'frontend/components/UI/CachedImage'
import TextInputWithIconField from 'frontend/components/UI/TextInputWithIconField'
import { SGDBGame, SGDBGrid } from 'common/types'
import {
  callOrDeclare,
  STEAMGRIDDB_FEATURE,
  STEAMGRIDDB_CHANNEL_BY_MEMBER,
  DEFERRAL_D03
} from 'frontend/helpers/declaredUnavailable'

interface Props {
  initialTitle: string
  onSelect: (url: string) => void
  onClose: () => void
  mode?: 'grids' | 'heroes'
  dimensions?: string[]
  styles?: string[]
}

const DEFAULT_GRID_DIMENSIONS = ['600x900', '342x482', '660x930']
const DEFAULT_GRID_STYLES = ['material', 'alternate', 'blurred']

export default function SteamGridDBPicker({
  initialTitle,
  onSelect,
  onClose,
  mode = 'grids',
  dimensions,
  styles
}: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState(initialTitle)
  const [games, setGames] = useState<SGDBGame[]>([])
  const [grids, setGrids] = useState<SGDBGrid[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSelectGame = useCallback(
    async (gameId: number) => {
      setSelectedGameId(gameId)
      setLoading(true)
      setError(null)
      setGrids([])
      const fetchDims =
        dimensions ?? (mode === 'heroes' ? [] : DEFAULT_GRID_DIMENSIONS)
      const fetchStyles =
        styles ?? (mode === 'heroes' ? [] : DEFAULT_GRID_STYLES)
      const fetchArgs = { gameId, styles: fetchStyles, dimensions: fetchDims }
      // Two distinct declared call sites on purpose (not one ternary-selected thunk shared by
      // a single wrapper) -- each names its own inventory channel, mirroring AdvancedSettings'
      // per-channel callOrDeclare convention.
      const result =
        mode === 'heroes'
          ? await callOrDeclare({
              channel: STEAMGRIDDB_CHANNEL_BY_MEMBER.getHeroes,
              feature: STEAMGRIDDB_FEATURE,
              deferral: DEFERRAL_D03,
              call: () => window.api.steamgriddb.getHeroes(fetchArgs)
            })
          : await callOrDeclare({
              channel: STEAMGRIDDB_CHANNEL_BY_MEMBER.getGrids,
              feature: STEAMGRIDDB_FEATURE,
              deferral: DEFERRAL_D03,
              call: () => window.api.steamgriddb.getGrids(fetchArgs)
            })
      setLoading(false)
      if (!result.ok) {
        setError(
          t(
            'steamgriddb.error.unavailable',
            'SteamGridDB artwork is unavailable on this build'
          )
        )
        return
      }
      setGrids(result.value)
      if (result.value.length === 0) {
        setError(
          t('steamgriddb.error.no-grids', 'No covers found for this game.')
        )
      }
    },
    [t, mode, dimensions, styles]
  )

  const searchGames = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery) return
      setLoading(true)
      setError(null)
      setGrids([])
      setGames([])
      setSelectedGameId(null)
      const result = await callOrDeclare({
        channel: STEAMGRIDDB_CHANNEL_BY_MEMBER.searchGame,
        feature: STEAMGRIDDB_FEATURE,
        deferral: DEFERRAL_D03,
        call: () => window.api.steamgriddb.searchGame(searchQuery)
      })
      setLoading(false)
      if (!result.ok) {
        setError(
          t(
            'steamgriddb.error.unavailable',
            'SteamGridDB artwork is unavailable on this build'
          )
        )
        return
      }
      const results = result.value
      setGames(results)
      if (results.length === 1) {
        void handleSelectGame(results[0].id)
      } else if (results.length === 0) {
        setError(t('steamgriddb.error.no-games', 'No games found.'))
      }
    },
    [t, handleSelectGame]
  )

  const goBack = () => {
    setSelectedGameId(null)
    setGrids([])
    setError(null)
  }

  useEffect(() => {
    if (initialTitle) {
      void searchGames(initialTitle)
    }
  }, [initialTitle, searchGames])

  return (
    <div className={`SteamGridDBPicker SteamGridDBPicker--${mode}`}>
      <div className="SteamGridDBPicker__header">
        <div className="SteamGridDBPicker__title-group">
          {selectedGameId && (
            <button className="button is-ghost" onClick={goBack}>
              <FontAwesomeIcon icon={faArrowLeft} />
            </button>
          )}
          <h3>{t('steamgriddb.picker.title', 'SteamGridDB Covers')}</h3>
        </div>
        <button className="button is-ghost" onClick={onClose}>
          <FontAwesomeIcon icon={faTimes} />
        </button>
      </div>

      {!selectedGameId && (
        <TextInputWithIconField
          htmlId="steamgriddb-search"
          label={t('steamgriddb.picker.search', 'Search Game')}
          value={query}
          onChange={setQuery}
          icon={<FontAwesomeIcon icon={faSearch} />}
          onIconClick={() => void searchGames(query)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void searchGames(query)
            }
          }}
        />
      )}

      {loading && (
        <div className="SteamGridDBPicker__loading">
          <FontAwesomeIcon icon={faSpinner} spin size="2x" />
        </div>
      )}

      {error && <div className="SteamGridDBPicker__error">{error}</div>}

      {!loading && games.length > 1 && !selectedGameId && (
        <div className="SteamGridDBPicker__games">
          <h4>{t('steamgriddb.picker.select-game', 'Select a Game:')}</h4>
          <ul>
            {games.map((game) => (
              <li key={game.id} onClick={() => void handleSelectGame(game.id)}>
                {game.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loading && grids.length > 0 && (
        <div className="SteamGridDBPicker__grids">
          {grids.map((grid) => (
            <div
              key={grid.id}
              className="SteamGridDBPicker__grid-item"
              onClick={() => onSelect(grid.url)}
            >
              <CachedImage src={grid.thumb} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
