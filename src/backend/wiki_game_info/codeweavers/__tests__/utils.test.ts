import { logError } from 'backend/logger'
import { getInfoFromCodeweavers, slugify, naiveSlugify } from '../utils'
import { axiosClient } from 'backend/utils'

jest.mock('backend/logger')
jest.mock('backend/store_backend')

function htmlWithVideoGameJsonLd(
  macRating: number | null,
  linuxRating: number | null
) {
  const reviews = []
  if (macRating !== null) {
    reviews.push(`{ "@type": "Review", "about": { "operatingSystem": "macOS" },
          "reviewRating": { "@type": "Rating", "ratingValue": ${macRating} } }`)
  }
  if (linuxRating !== null) {
    reviews.push(`{ "@type": "Review", "about": { "operatingSystem": "Linux" },
          "reviewRating": { "@type": "Rating", "ratingValue": ${linuxRating} } }`)
  }

  return `<!doctype html><html><head><title>Will Half-Life 2 run on Mac or Linux? | CodeWeavers</title>
    <script type="application/ld+json">
      { "@context": "https://schema.org", "@graph": [
        { "@type": "VideoGame", "name": "Half-Life 2" },
        ${reviews.join(',\n')}
      ]}
    </script>
  </head><body></body></html>`
}

const SOFT_404_HTML =
  '<!doctype html><html><head><title>404 Not Found | CodeWeavers</title></head><body>Page not found</body></html>'

describe('slugify', () => {
  // KNOWN_GOOD self-check trio (spike/crossover-compat-lookup.mjs:53-57)
  test('007 Nightfire', () => {
    expect(slugify('007 Nightfire')).toBe('007-nightfire')
  })

  test('10,000,000', () => {
    expect(slugify('10,000,000')).toBe('10-000-000')
  })

  test('001 Game Creator', () => {
    expect(slugify('001 Game Creator')).toBe('001-game-creator')
  })

  test('Hades', () => {
    expect(slugify('Hades')).toBe('hades')
  })

  // D-04: apostrophes DROPPED entirely, not hyphenated
  test("Baldur's Gate 3 drops the apostrophe", () => {
    expect(slugify("Baldur's Gate 3")).toBe('baldurs-gate-3')
  })

  test("Marvel's Spider-Man Remastered drops the apostrophe", () => {
    expect(slugify("Marvel's Spider-Man Remastered")).toBe(
      'marvels-spider-man-remastered'
    )
  })

  // D-20: roman numerals kept VERBATIM — the site serves the roman form,
  // converting to Arabic digits was WRONG and pulled two already-matching
  // strings apart.
  test('Call of Duty: Modern Warfare II keeps the roman numeral', () => {
    expect(slugify('Call of Duty: Modern Warfare II')).toBe(
      'call-of-duty-modern-warfare-ii'
    )
  })

  test('Age of Empires II keeps the roman numeral', () => {
    expect(slugify('Age of Empires II')).toBe('age-of-empires-ii')
  })

  test('Quake II keeps the roman numeral', () => {
    expect(slugify('Quake II')).toBe('quake-ii')
  })

  test("Alekhine's Gun drops the apostrophe", () => {
    expect(slugify("Alekhine's Gun")).toBe('alekhines-gun')
  })

  // Diacritics stripped
  test('Pokémon strips the diacritic', () => {
    expect(slugify('Pokémon')).toBe('pokemon')
  })
})

describe('naiveSlugify (pre-D-04 fallback slug)', () => {
  test("Baldur's Gate 3 collapses the apostrophe to a hyphen", () => {
    expect(naiveSlugify("Baldur's Gate 3")).toBe('baldur-s-gate-3')
  })

  test('Call of Duty: Modern Warfare II leaves the roman numeral untouched', () => {
    expect(naiveSlugify('Call of Duty: Modern Warfare II')).toBe(
      'call-of-duty-modern-warfare-ii'
    )
  })
})

describe('getInfoFromCodeweavers', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('HIT: parses per-OS ratings from VideoGame+Review JSON-LD', async () => {
    jest
      .spyOn(axiosClient, 'get')
      .mockResolvedValueOnce({ data: htmlWithVideoGameJsonLd(5, 1) })

    const result = await getInfoFromCodeweavers('Half-Life 2')

    expect(result).toStrictEqual({
      macRating: 5,
      linuxRating: 1,
      slug: 'half-life-2'
    })
  })

  test('SOFT-404 MISS: returns the cacheable EMPTY marker, not null', async () => {
    jest.spyOn(axiosClient, 'get').mockResolvedValue({ data: SOFT_404_HTML })

    const result = await getInfoFromCodeweavers(
      'Definitely Not A Real Game 9000'
    )

    expect(result).not.toBeNull()
    expect(result).toStrictEqual({
      macRating: null,
      linuxRating: null,
      slug: 'definitely-not-a-real-game-9000'
    })
  })

  test('ERROR: fetch rejection returns null (retryable) and logs the error', async () => {
    jest.spyOn(axiosClient, 'get').mockRejectedValueOnce(new Error('Failed'))

    const result = await getInfoFromCodeweavers('Hades')

    expect(result).toBeNull()
    expect(logError).toBeCalledWith(
      expect.arrayContaining([
        'Was not able to get CodeWeavers data for Hades'
      ]),
      'ExtraGameInfo'
    )
  })

  test('UA REGRESSION: request carries a browser-like User-Agent header', async () => {
    const axiosGetSpy = jest
      .spyOn(axiosClient, 'get')
      .mockResolvedValueOnce({ data: htmlWithVideoGameJsonLd(5, 1) })

    await getInfoFromCodeweavers('Hades')

    const [, config] = axiosGetSpy.mock.calls[0]
    expect(config?.headers?.['User-Agent']).toMatch(/Mozilla/)
  })

  test('FALLBACK: primary soft-404 retries once with the naive slug, then returns its hit', async () => {
    const axiosGetSpy = jest
      .spyOn(axiosClient, 'get')
      .mockResolvedValueOnce({ data: SOFT_404_HTML })
      .mockResolvedValueOnce({ data: htmlWithVideoGameJsonLd(4, 1) })

    const result = await getInfoFromCodeweavers("Baldur's Gate 3")

    expect(result).toStrictEqual({
      macRating: 4,
      linuxRating: 1,
      slug: 'baldur-s-gate-3'
    })
    expect(axiosGetSpy).toHaveBeenCalledTimes(2)
    const [fallbackUrl] = axiosGetSpy.mock.calls[1]
    expect(fallbackUrl).toMatch(/\/baldur-s-gate-3$/)
  })

  test('VideoGame present but both ratings null -> treated as miss, fallback fires', async () => {
    const axiosGetSpy = jest
      .spyOn(axiosClient, 'get')
      .mockResolvedValueOnce({ data: htmlWithVideoGameJsonLd(null, null) })
      .mockResolvedValueOnce({ data: htmlWithVideoGameJsonLd(null, null) })

    const result = await getInfoFromCodeweavers("Baldur's Gate 3")

    expect(result).toStrictEqual({
      macRating: null,
      linuxRating: null,
      slug: 'baldurs-gate-3'
    })
    expect(axiosGetSpy).toHaveBeenCalledTimes(2)
  })

  test('FALLBACK: both primary and fallback slug miss -> EMPTY marker, bounded to 2 calls', async () => {
    const axiosGetSpy = jest
      .spyOn(axiosClient, 'get')
      .mockResolvedValueOnce({ data: SOFT_404_HTML })
      .mockResolvedValueOnce({ data: SOFT_404_HTML })

    const result = await getInfoFromCodeweavers("Baldur's Gate 3")

    expect(result).toStrictEqual({
      macRating: null,
      linuxRating: null,
      slug: 'baldurs-gate-3'
    })
    expect(axiosGetSpy).toHaveBeenCalledTimes(2)
  })
})
