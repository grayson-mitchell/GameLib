/**
 * Library tile-size slider (quick 261011-t4y). A node-environment behaviour
 * table for the pure tile-width helpers, plus comment-stripped source gates
 * for the grid rule, the `.listing` derivation, the slider markup and the
 * catalogue keys. The Frontend jest project has no jsdom and no CSS engine,
 * so rendered pixels are not provable here; the owed live check is recorded
 * in the closed todo's Resolution section.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import {
  LIBRARY_TILE_WIDTH_DEFAULT,
  LIBRARY_TILE_WIDTH_MAX,
  LIBRARY_TILE_WIDTH_MIN,
  LIBRARY_TILE_WIDTH_STEP,
  LIBRARY_TILE_WIDTH_STORAGE_KEY,
  applyLibraryTileWidth,
  clampLibraryTileWidth,
  readLibraryTileWidth,
  writeLibraryTileWidth
} from '../libraryTileSize'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')

const readRaw = (relPath: string) =>
  readFileSync(join(REPO_ROOT, relPath), 'utf8')
const read = (relPath: string) => stripSourceComments(readRaw(relPath))

const LIBRARY_CSS_PATH = 'src/frontend/screens/Library/index.css'
const LIBRARY_TSX_PATH = 'src/frontend/screens/Library/index.tsx'
const TILE_SIZE_TS_PATH = 'src/frontend/screens/Library/libraryTileSize.ts'
const SLIDER_TSX_PATH =
  'src/frontend/components/UI/NavShell/components/LibraryTileSizeSlider/index.tsx'
const GAMELIB_JSON_PATH = 'public/locales/en/gamelib.json'

/** Brace-counted block extractor, copied from focusRowStripSource.test.ts. */
function cssBlock(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`)
  if (start === -1) {
    throw new Error(`selector ${selector} not found`)
  }
  let depth = 0
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') {
      depth--
      if (depth === 0) {
        return source.slice(source.indexOf('{', start) + 1, i)
      }
    }
  }
  throw new Error(`unterminated block for ${selector}`)
}

describe('libraryTileSize -- constants', () => {
  it('pins the range, step and default', () => {
    expect(LIBRARY_TILE_WIDTH_MIN).toBe(140)
    expect(LIBRARY_TILE_WIDTH_MAX).toBe(320)
    expect(LIBRARY_TILE_WIDTH_STEP).toBe(4)
    expect(LIBRARY_TILE_WIDTH_DEFAULT).toBe(156)
    expect(LIBRARY_TILE_WIDTH_STORAGE_KEY).toBe('libraryTileWidth')
  })

  it('the default and the maximum are both reachable from the minimum in whole steps', () => {
    expect(
      (LIBRARY_TILE_WIDTH_DEFAULT - LIBRARY_TILE_WIDTH_MIN) %
        LIBRARY_TILE_WIDTH_STEP
    ).toBe(0)
    expect(
      (LIBRARY_TILE_WIDTH_MAX - LIBRARY_TILE_WIDTH_MIN) %
        LIBRARY_TILE_WIDTH_STEP
    ).toBe(0)
  })
})

describe('clampLibraryTileWidth', () => {
  it.each([
    [null, 156],
    [undefined, 156],
    ['', 156],
    ['  ', 156],
    ['abc', 156],
    [NaN, 156],
    [Infinity, 156],
    [-Infinity, 156],
    [{}, 156],
    ['200', 200],
    [200, 200],
    [100, 140],
    [999, 320],
    [157, 156],
    [158, 160],
    [141.9, 140],
    [140, 140],
    [320, 320]
  ])('clamp(%p) === %p', (input, expected) => {
    expect(clampLibraryTileWidth(input)).toBe(expected)
  })
})

describe('readLibraryTileWidth', () => {
  it.each([
    [null, 156],
    ['240', 240],
    ['9999', 320],
    ['junk', 156]
  ])('getItem -> %p reads %p', (stored, expected) => {
    const storage = { getItem: jest.fn().mockReturnValue(stored) }
    expect(readLibraryTileWidth(storage)).toBe(expected)
    expect(storage.getItem).toHaveBeenCalledWith('libraryTileWidth')
  })

  it('returns the default when getItem throws', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked')
      }
    }
    expect(readLibraryTileWidth(storage)).toBe(156)
  })
})

describe('writeLibraryTileWidth', () => {
  it('stores and returns an in-range width', () => {
    const storage = { setItem: jest.fn() }
    expect(writeLibraryTileWidth(storage, 240)).toBe(240)
    expect(storage.setItem).toHaveBeenCalledWith('libraryTileWidth', '240')
  })

  it('stores the clamped string for out-of-range input', () => {
    const storage = { setItem: jest.fn() }
    expect(writeLibraryTileWidth(storage, 5000)).toBe(320)
    expect(storage.setItem).toHaveBeenCalledWith('libraryTileWidth', '320')
    expect(writeLibraryTileWidth(storage, 'nope')).toBe(156)
    expect(storage.setItem).toHaveBeenLastCalledWith('libraryTileWidth', '156')
  })

  it('still returns the clamped width when setItem throws', () => {
    const storage = {
      setItem: () => {
        throw new Error('quota')
      }
    }
    expect(() => writeLibraryTileWidth(storage, 240)).not.toThrow()
    expect(writeLibraryTileWidth(storage, 240)).toBe(240)
  })
})

describe('applyLibraryTileWidth', () => {
  it('writes --library-tile-width in px', () => {
    const setProperty = jest.fn()
    applyLibraryTileWidth({ style: { setProperty } }, 240)
    expect(setProperty).toHaveBeenCalledWith('--library-tile-width', '240px')
  })

  it('clamps before writing, so a raw string never reaches setProperty', () => {
    const setProperty = jest.fn()
    applyLibraryTileWidth({ style: { setProperty } }, '9999; color: red')
    expect(setProperty).toHaveBeenCalledWith('--library-tile-width', '156px')
    applyLibraryTileWidth({ style: { setProperty } }, 9999)
    expect(setProperty).toHaveBeenLastCalledWith(
      '--library-tile-width',
      '320px'
    )
  })

  it('does not throw for a null target or a throwing setProperty', () => {
    expect(() => applyLibraryTileWidth(null, 200)).not.toThrow()
    expect(() => applyLibraryTileWidth(undefined, 200)).not.toThrow()
    const throwing = {
      style: {
        setProperty: () => {
          throw new Error('nope')
        }
      }
    }
    expect(() => applyLibraryTileWidth(throwing, 200)).not.toThrow()
  })
})

describe('Library/index.css -- fixed-width tile columns (source gate)', () => {
  const css = read(LIBRARY_CSS_PATH)

  it('.gameList uses fixed auto-fill tracks at the derived tile width and packs leftover width at the end', () => {
    const block = cssBlock(css, '.gameList')
    const m = block.match(
      /grid-template-columns:\s*repeat\(\s*auto-fill,\s*var\(--library-tile-css-width,\s*(\d+(?:\.\d+)?)px\)\s*\)/
    )
    expect(m).not.toBeNull()
    expect(Number(m?.[1])).toBe(LIBRARY_TILE_WIDTH_DEFAULT)
    expect(block).toMatch(/justify-content:\s*start/)
    expect(block).not.toMatch(/minmax\(/)
    expect(block).not.toMatch(/1fr/)
  })

  it('.listing derives --library-tile-css-width as the slider value divided by the applied webview zoom (D-04)', () => {
    const block = cssBlock(css, '.listing')
    const m = block.match(
      /--library-tile-css-width:\s*calc\(\s*var\(--library-tile-width,\s*(\d+(?:\.\d+)?)px\)\s*\/\s*var\(--webview-zoom,\s*1\)\s*\)\s*;/
    )
    expect(m).not.toBeNull()
    expect(Number(m?.[1])).toBe(LIBRARY_TILE_WIDTH_DEFAULT)
  })
})

describe('library tile width wiring (source gate)', () => {
  it('libraryTileSize.ts writes the property by string literal at the call site (cssTokenSweep needs it)', () => {
    expect(read(TILE_SIZE_TS_PATH)).toContain(
      "setProperty('--library-tile-width'"
    )
  })

  it('tauriWindowChrome.ts publishes --webview-zoom by string literal at the call site (cssTokenSweep needs it)', () => {
    // Read as text, not imported: the module pulls in the Tauri window API.
    expect(read('src/preload/api/tauriWindowChrome.ts')).toContain(
      "setProperty('--webview-zoom'"
    )
  })

  it('Library/index.tsx restores the saved width in a mount-only useLayoutEffect', () => {
    const source = read(LIBRARY_TSX_PATH)
    expect(source).toMatch(
      /useLayoutEffect\(\s*\(\)\s*=>\s*{\s*applyLibraryTileWidth\(\s*document\.documentElement,\s*readLibraryTileWidth\(storage\)\s*\)\s*},\s*\[\]\s*\)/
    )
  })

  it('the slider is a labelled range input bound to the three constants, with aria-valuetext', () => {
    const source = read(SLIDER_TSX_PATH)
    expect(source).toMatch(/type="range"/)
    expect(source).toMatch(/min=\{LIBRARY_TILE_WIDTH_MIN\}/)
    expect(source).toMatch(/max=\{LIBRARY_TILE_WIDTH_MAX\}/)
    expect(source).toMatch(/step=\{LIBRARY_TILE_WIDTH_STEP\}/)
    expect(source).toMatch(/aria-valuetext=/)
    const id = source.match(/<input[^>]*\bid="([^"]+)"/)?.[1]
    expect(id).toBeDefined()
    expect(source).toContain(`htmlFor="${id}"`)
    expect(source).toContain("'gamelib:library.tileSize.label'")
    expect(source).toContain("'gamelib:library.tileSize.valueText'")
    expect(source).toMatch(/applyLibraryTileWidth\(document\.documentElement/)
  })

  it('the English catalogue carries the two keys', () => {
    const catalogue = JSON.parse(readRaw(GAMELIB_JSON_PATH)) as {
      library: { tileSize: { label: string; valueText: string } }
    }
    expect(catalogue.library.tileSize.label).toBe('Tile size')
    expect(catalogue.library.tileSize.valueText).toBe('{{width}} px')
  })
})
