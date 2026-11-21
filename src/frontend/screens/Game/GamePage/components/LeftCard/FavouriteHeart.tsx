import { useTranslation } from 'react-i18next'
import Favorite from '@mui/icons-material/Favorite'
import FavoriteBorder from '@mui/icons-material/FavoriteBorder'
import { useFavouriteGames } from 'frontend/state/accountHooks'
import './index.css'

interface Props {
  appName: string
  title: string
}

/**
 * Phase 100 (D-01, D-22): the Favourite heart right after the game title.
 * State lives in the control (aria-pressed, outline vs filled); the accessible
 * name is the constant noun "Favourite", only the tooltip describes the action
 * the next press performs.
 */
const FavouriteHeart = ({ appName, title }: Props) => {
  const { t } = useTranslation()
  const favouriteGames = useFavouriteGames()
  const isFavourite = favouriteGames.list.some((f) => f.appName === appName)

  return (
    <button
      type="button"
      className="favouriteHeart"
      aria-pressed={isFavourite}
      aria-label={t('gamelib:gamepage.leftCard.favourite', 'Favourite')}
      title={
        isFavourite
          ? t(
              'gamelib:gamepage.leftCard.removeFavourite',
              'Remove from favourites'
            )
          : t('gamelib:gamepage.leftCard.addFavourite', 'Add to favourites')
      }
      onClick={() =>
        isFavourite
          ? favouriteGames.remove(appName)
          : favouriteGames.add(appName, title)
      }
    >
      {isFavourite ? (
        <Favorite aria-hidden="true" />
      ) : (
        <FavoriteBorder aria-hidden="true" />
      )}
    </button>
  )
}

export default FavouriteHeart
