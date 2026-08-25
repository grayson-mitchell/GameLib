import axios from 'axios'
import { app } from 'electron'
import { logError, logInfo, LogPrefix, logWarning } from 'backend/logger'
import { GOGUser } from 'backend/storeManagers/gog/user'
import type {
  CatalogLocaleSettings,
  CatalogProduct
} from 'common/types/discounts'

/**
 * `getGogDiscounts`'s underlying fetch logic, extracted out of
 * `discounts/index.ts`'s `addHandler(...)` call body (Phase 34.6 Plan 09,
 * REQ-34.6-08, A-03/D-07).
 *
 * `discounts/index.ts` self-registers via `addHandler` at module scope, so
 * — exactly like every other feature's `ipc_handler.ts` — it can never be
 * imported by the sidecar's curated registration modules without dragging
 * `backend/ipc`'s real `electron` import along with it (D-04's
 * underlying-module-not-`ipc_handler` rule, applied here since this feature
 * had no separate underlying module before this plan). This file is that
 * underlying module: `discounts/index.ts` and
 * `sidecar/enrichmentFlowRegistration.ts` both import `getGogDiscounts` from
 * here, so the two builds cannot drift apart.
 *
 * NOTE this module DOES import `app` from `electron` (for the catalog
 * request's `User-Agent` header) — a real, direct electron reach. That is
 * unchanged behavior carried over verbatim from `discounts/index.ts`; it is
 * accounted for in `electronReachLedger.test.ts`'s
 * `BASELINE_ELECTRON_REACHING_MODULES`, not avoided by this extraction.
 */

interface CatalogResponse {
  pages: number
  productCount: number
  products: CatalogProduct[]
}

const CATALOG_URL = 'https://catalog.gog.com/v1/catalog'
const PAGE_LIMIT = 48
const MAX_PAGES = 30

const FALLBACK_LOCALE: CatalogLocaleSettings = {
  countryCode: 'US',
  locale: 'en-US',
  currencyCode: 'USD'
}

const isFallbackLocale = (locale: CatalogLocaleSettings) =>
  locale.countryCode === FALLBACK_LOCALE.countryCode &&
  locale.currencyCode === FALLBACK_LOCALE.currencyCode &&
  locale.locale === FALLBACK_LOCALE.locale

const buildUrl = (
  page: number,
  locale: CatalogLocaleSettings,
  hideOwned: boolean,
  wishlistOnly: boolean
) => {
  const params = new URLSearchParams({
    limit: String(PAGE_LIMIT),
    order: 'desc:trending',
    discounted: 'eq:true',
    productType: 'in:game,pack,dlc',
    page: String(page),
    countryCode: locale.countryCode,
    locale: locale.locale,
    currencyCode: locale.currencyCode
  })

  if (hideOwned) {
    params.append('hideOwned', 'true')
  }

  if (wishlistOnly) {
    params.append('wishlist', 'eq:true')
  }

  return `${CATALOG_URL}?${params.toString()}`
}

const fetchPage = async (
  page: number,
  locale: CatalogLocaleSettings,
  hideOwned: boolean,
  wishlistOnly: boolean,
  token: string | undefined
) => {
  const headers: Record<string, string> = {
    'User-Agent': `HeroicGamesLauncher/${app.getVersion()}`
  }

  if ((hideOwned && token) || (wishlistOnly && token)) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const { data } = await axios.get<CatalogResponse>(
    buildUrl(page, locale, hideOwned, wishlistOnly),
    {
      timeout: 15000,
      headers
    }
  )
  return data
}

const fetchAllDiscounts = async (
  locale: CatalogLocaleSettings,
  hideOwned: boolean,
  wishlistOnly: boolean,
  token: string | undefined
) => {
  const first = await fetchPage(1, locale, hideOwned, wishlistOnly, token)
  const totalPages = Math.min(first.pages, MAX_PAGES)
  if (totalPages <= 1) return first.products

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) =>
      fetchPage(i + 2, locale, hideOwned, wishlistOnly, token)
        .then((d) => d.products)
        .catch((err: unknown) => {
          logError(
            `Failed to fetch discounts page ${i + 2}: ${String(err)}`,
            LogPrefix.Backend
          )
          return [] as CatalogProduct[]
        })
    )
  )

  const all = [...first.products, ...rest.flat()]
  // GOG's catalog is ordered by dynamic trending, so the same product can
  // appear on multiple pages if ranking shifts mid-fetch. Dedupe by id to
  // avoid duplicate React keys in the grid.
  const seen = new Set<string>()
  return all.filter((p) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })
}

/**
 * `getGogDiscounts`'s full handler body, byte-identical to
 * `discounts/index.ts`'s pre-extraction `addHandler` callback. Both the
 * Electron `addHandler` wrapper and the sidecar's `ipcMain.handle`
 * registration call this same function.
 */
export async function getGogDiscounts(
  locale: CatalogLocaleSettings,
  hideOwned = false,
  wishlistOnly = false
): Promise<CatalogProduct[]> {
  try {
    let token: string | undefined = undefined

    if (hideOwned || wishlistOnly) {
      const credentials = await GOGUser.getCredentials()
      if (credentials) {
        token = credentials.access_token
      } else {
        hideOwned = false
        wishlistOnly = false
        logWarning(
          'Failed to get user credentials: User maybe is not looged in',
          LogPrefix.Backend
        )
      }
    }

    const products = await fetchAllDiscounts(
      locale,
      hideOwned,
      wishlistOnly,
      token
    )
    if (products.length > 0 || isFallbackLocale(locale)) {
      return products
    }

    logInfo(
      `No discounts for ${locale.countryCode}/${locale.currencyCode}, retrying with US/USD`,
      LogPrefix.Backend
    )
    return await fetchAllDiscounts(
      FALLBACK_LOCALE,
      hideOwned,
      wishlistOnly,
      token
    )
  } catch (err) {
    logError(`Failed to fetch GOG discounts: ${String(err)}`, LogPrefix.Backend)
    throw err
  }
}
