import type { CatalogRating } from 'common/types/discounts'

export {
  REGION_OPTIONS,
  getStoredRegionOverride,
  setStoredRegionOverride,
  getLocaleSettings
} from 'frontend/helpers/storeRegion'

const GOG_AFFILIATE_ID = '1838482841'

// GOG's affiliate program requires links to use the af.gog.com domain with
// the path of the original www.gog.com URL preserved, plus the ?as=<id>
// affiliate parameter. Links pointing at www.gog.com directly are not
// tracked by GOG even if ?as= is present.
export const withAffiliate = (storeLink: string): string => {
  try {
    const url = new URL(storeLink)
    url.hostname = 'af.gog.com'
    url.searchParams.set('as', GOG_AFFILIATE_ID)
    return url.toString()
  } catch {
    return storeLink
  }
}

export const parseDiscountPercent = (discount: string): number => {
  const match = /(\d+)/.exec(discount)
  return match?.[1] ? parseInt(match[1], 10) : 0
}

export const parsePriceAmount = (amount?: string): number => {
  if (!amount) return 0
  const parsed = parseFloat(amount)
  return Number.isFinite(parsed) ? parsed : 0
}

export type DiscountSort =
  | 'trending'
  | 'discount'
  | 'price-asc'
  | 'price-desc'
  | 'release-asc'
  | 'release-desc'
  | 'rating-asc'
  | 'rating-desc'

export const parseReleaseTimestamp = (releaseDate?: string): number => {
  if (!releaseDate) return NaN
  const t = new Date(releaseDate).getTime()
  return Number.isFinite(t) ? t : NaN
}

export const PAGE_SIZE_OPTIONS = [20, 50, 100] as const
export const DEFAULT_PAGE_SIZE: (typeof PAGE_SIZE_OPTIONS)[number] = 50
export const RATING_SCALE_MAX = 10
export const OS_OPTIONS = ['windows', 'linux', 'osx'] as const
export type OsOption = (typeof OS_OPTIONS)[number]

// GOG's reviewsRating is on a 0-50 scale; we display it as 0-10.
export const normalizeRating = (rating?: number): number => {
  if (!rating || rating <= 0) return 0
  return rating / 5
}

// PEGI is the most granular of the rating systems GOG returns and covers most
// of its catalog. We key the age-rating filter off PEGI for simplicity.
export const PEGI_AGE_OPTIONS = [3, 7, 12, 16, 18] as const
export type PegiAge = (typeof PEGI_AGE_OPTIONS)[number]

export const getPegiAge = (ratings?: CatalogRating[]): number | null => {
  if (!ratings) return null
  const pegi = ratings.find((r) => r.name === 'pegiRating')
  if (!pegi) return null
  const n = parseInt(pegi.ageRating, 10)
  return Number.isFinite(n) ? n : null
}

// Persisted filter state (excluding regionOverride, which has its own key).
// Stored in localStorage so filters survive navigation and page reloads.
interface StoredDiscountFilters {
  sortBy?: DiscountSort
  selectedGenres?: string[]
  selectedFeatures?: string[]
  selectedOS?: OsOption[]
  priceRange?: [number, number] | null
  ratingRange?: [number, number]
  releaseYearRange?: [number, number] | null
  maxPegiAge?: PegiAge | null
  searchQuery?: string
  hideDlcs?: boolean
  hideOwned?: boolean
  wishlistOnly?: boolean
  pageSize?: number
}

const FILTERS_STORAGE_KEY = 'discounts.filters'

export const loadStoredFilters = (): StoredDiscountFilters => {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed as StoredDiscountFilters
  } catch {
    return {}
  }
}

export const saveStoredFilters = (filters: StoredDiscountFilters) => {
  try {
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters))
  } catch {
    // ignore (private mode, quota, etc.)
  }
}
