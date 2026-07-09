import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CachedImage } from 'frontend/components/UI'
import fallBackImage from 'frontend/assets/gamelib_card.svg?url'
import type { CatalogProduct } from 'common/types/discounts'
import type { DiscountBadge } from 'common/discounts/badges'
import {
  normalizeRating,
  parseDiscountPercent,
  withAffiliate
} from '../../helpers'
import './index.css'

interface Props {
  product: CatalogProduct
  /** D-78..D-85 (Phase 15): resolved by the PARENT (Discounts/index.tsx) via
   * resolveDiscountBadge, once per product list — never recomputed here.
   * Informational only: no click target, no hover state (D-81). */
  badge?: DiscountBadge
}

const DiscountCard = ({ product, badge }: Props) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const cover =
    product.coverVertical || product.coverHorizontal || fallBackImage
  const discountPercent = parseDiscountPercent(product.price.discount)
  const rating = normalizeRating(product.reviewsRating)

  const handleClick = () => {
    const target = withAffiliate(product.storeLink)
    navigate(`/store-page?store-url=${encodeURIComponent(target)}`)
  }

  return (
    <button
      type="button"
      className="discountCard"
      onClick={handleClick}
      title={product.title}
    >
      {rating > 0 && (
        <span
          className="discountCard__score"
          aria-label={t(
            'discounts.aria.rating',
            'Rating {{rating}} out of 10',
            {
              rating: rating.toFixed(1)
            }
          )}
        >
          <span className="discountCard__scoreStar" aria-hidden="true">
            ★
          </span>
          {rating.toFixed(1)}
        </span>
      )}
      {discountPercent > 0 && (
        <span className="discountCard__badge">-{discountPercent}%</span>
      )}
      <CachedImage
        className="discountCard__image"
        src={cover}
        fallback={fallBackImage}
        alt={product.title}
      />
      <div className="discountCard__info">
        {/* D-78..D-85: informational-only ownership pill — a non-interactive
            <span> sibling, exactly like .humbleKeyOwnedBadge in
            HumbleKeyRow. Renders directly above the title, INSIDE
            .discountCard__info — not a third image-overlay corner span next
            to discountCard__score/discountCard__badge (D-80). Owned always
            wins over Key-available (D-85); no pill at all when null
            (D-79). */}
        {badge === 'owned' && (
          <span className="discountCard__badge--owned">
            {t('discounts.badge.owned', 'Owned')}
          </span>
        )}
        {badge === 'key-available' && (
          <span className="discountCard__badge--keyAvailable">
            {t('discounts.badge.keyAvailable', 'Key available')}
          </span>
        )}
        <span className="discountCard__title">{product.title}</span>
        <div className="discountCard__priceRow">
          <span className="discountCard__basePrice">{product.price.base}</span>
          <span className="discountCard__finalPrice">
            {product.price.final}
          </span>
        </div>
      </div>
    </button>
  )
}

export default DiscountCard
