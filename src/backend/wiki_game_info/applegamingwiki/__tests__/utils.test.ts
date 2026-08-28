import { logError } from 'backend/logger'
import { getInfoFromAppleGamingWiki } from '../utils'
import { axiosClient } from 'backend/utils'
import { AppleGamingWikiInfo } from 'common/types'

jest.mock('backend/logger')
jest.mock('backend/store_backend')

describe('getInfoFromAppleGamingWiki', () => {
  test('fetches successfully', async () => {
    const mockAxios = jest.spyOn(axiosClient, 'get').mockResolvedValueOnce({
      data: { query: { search: [{ pageid: 1 }] } }
    })
    mockAxios.mockResolvedValueOnce({
      data: {
        parse: {
          wikitext: {
            '*':
              '|pcgamingwiki = The_Witcher_3:_Wild_Hunt\n' +
              '|codeweavers  = the-witcher-3-wild-hunt\n' +
              '|crossover            = Playable\n' +
              '|wine                 = Playable\n'
          }
        }
      }
    })

    const result = await getInfoFromAppleGamingWiki('The Witcher 3')
    expect(result).toStrictEqual(testAppleGamingWikiInfo)
  })

  test('does not find page id', async () => {
    jest.spyOn(axiosClient, 'get').mockResolvedValueOnce({
      data: { query: { search: [{ pageid: undefined }] } }
    })

    // No wiki page => "checked, none found" marker (cacheable), not null.
    // null is reserved for genuine fetch errors so those retry.
    const result = await getInfoFromAppleGamingWiki('The Witcher 3')
    expect(result).toStrictEqual({
      crossoverLink: '',
      wineRating: '',
      crossoverRating: ''
    })
  })

  test('does not find wikitext', async () => {
    const mockAxios = jest.spyOn(axiosClient, 'get').mockResolvedValueOnce({
      data: { query: { search: [{ pageid: 1 }] } }
    })
    mockAxios.mockResolvedValueOnce({
      data: {
        parse: {
          invalid: ''
        }
      }
    })

    const result = await getInfoFromAppleGamingWiki('The Witcher 3')
    expect(result).toStrictEqual({
      crossoverLink: '',
      wineRating: '',
      crossoverRating: ''
    })
  })

  test('wikitext empty', async () => {
    const mockAxios = jest.spyOn(axiosClient, 'get').mockResolvedValueOnce({
      data: { query: { search: [{ pageid: 1 }] } }
    })
    mockAxios.mockResolvedValueOnce({
      data: {
        parse: {
          wikitext: undefined
        }
      }
    })

    const result = await getInfoFromAppleGamingWiki('The Witcher 3')
    expect(result).toStrictEqual({
      crossoverLink: '',
      wineRating: '',
      crossoverRating: ''
    })
  })

  test('catches axios throws', async () => {
    jest.spyOn(axiosClient, 'get').mockRejectedValueOnce(new Error('Failed'))

    const result = await getInfoFromAppleGamingWiki('The Witcher 3')
    expect(result).toBeNull()
    expect(logError).toBeCalledWith(
      [
        'Was not able to get AppleGamingWiki data for The Witcher 3',
        Error('Failed')
      ],
      'ExtraGameInfo'
    )
  })

  // ── DETAIL-02 / T-07-04: Browser User-Agent regression tests ─────────────────
  //
  // Root cause of "everything shows Unrated": AppleGamingWiki sits behind
  // Cloudflare, which 403s axios' default `axios/x.y` User-Agent. Both
  // getPageID and getWikiText must send a browser-like UA to avoid the block.

  test('getPageID request carries a browser-like User-Agent header (DETAIL-02 T-07-04)', async () => {
    const axiosGetSpy = jest
      .spyOn(axiosClient, 'get')
      .mockResolvedValueOnce({
        data: { query: { search: [{ pageid: 123 }] } }
      })
      .mockResolvedValueOnce({
        data: {
          parse: {
            wikitext: { '*': '|crossover = Playable\n|wine = Playable\n' }
          }
        }
      })

    await getInfoFromAppleGamingWiki('Half-Life 2')

    // First call is getPageID — URL must be encodeURIComponent-encoded and
    // the config object must carry a Mozilla-like User-Agent (not the axios default).
    const [searchUrl, searchConfig] = axiosGetSpy.mock.calls[0]
    expect(searchUrl).toContain(encodeURIComponent('Half-Life 2'))
    expect(searchConfig?.headers?.['User-Agent']).toMatch(/Mozilla/)
  })

  test('getWikiText request also carries a browser-like User-Agent header (DETAIL-02 T-07-04)', async () => {
    const axiosGetSpy = jest
      .spyOn(axiosClient, 'get')
      .mockResolvedValueOnce({
        data: { query: { search: [{ pageid: 456 }] } }
      })
      .mockResolvedValueOnce({
        data: {
          parse: {
            wikitext: { '*': '|crossover = Playable\n' }
          }
        }
      })

    await getInfoFromAppleGamingWiki("Baldur's Gate 3")

    // Second call is getWikiText — must also carry Mozilla UA
    const [, wikiConfig] = axiosGetSpy.mock.calls[1]
    expect(wikiConfig?.headers?.['User-Agent']).toMatch(/Mozilla/)
  })
})

const testAppleGamingWikiInfo = {
  crossoverRating: 'Playable',
  wineRating: 'Playable',
  crossoverLink: 'the-witcher-3-wild-hunt'
} as AppleGamingWikiInfo
