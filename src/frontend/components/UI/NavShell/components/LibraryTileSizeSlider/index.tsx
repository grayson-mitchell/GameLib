import { ChangeEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LIBRARY_TILE_WIDTH_MAX,
  LIBRARY_TILE_WIDTH_MIN,
  LIBRARY_TILE_WIDTH_STEP,
  applyLibraryTileWidth,
  readLibraryTileWidth,
  writeLibraryTileWidth
} from 'frontend/screens/Library/libraryTileSize'
import './index.scss'

/**
 * Tile size slider (quick 261011-t4y, D-01/D-02): the last child of the
 * Library panel's `.Header__footer`. Moving it persists the width under
 * `libraryTileWidth` and writes `--library-tile-width` on the document root,
 * which the Library grid and the focus-row strip both read. State lives here,
 * not in the Library, so a drag re-renders this control and nothing else.
 *
 * The visible value and `aria-valuetext` share one string. Literal key and
 * literal default, because i18next-parser resolves nothing else. The
 * interpolation is `width`, not `count`, which i18next reserves for plurals.
 */
export default function LibraryTileSizeSlider() {
  const { t: tGamelib } = useTranslation('gamelib')
  const [width, setWidth] = useState<number>(() =>
    readLibraryTileWidth(window.localStorage)
  )

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = writeLibraryTileWidth(
      window.localStorage,
      Number(event.currentTarget.value)
    )
    applyLibraryTileWidth(document.documentElement, next)
    setWidth(next)
  }

  const valueText = tGamelib(
    'gamelib:library.tileSize.valueText',
    '{{width}} px',
    {
      width
    }
  )

  return (
    <div className="LibraryTileSizeSlider">
      <label
        className="LibraryTileSizeSlider__label"
        htmlFor="library-tile-size"
      >
        {tGamelib('gamelib:library.tileSize.label', 'Tile size')}
      </label>
      <output
        className="LibraryTileSizeSlider__value"
        htmlFor="library-tile-size"
      >
        {valueText}
      </output>
      <input
        id="library-tile-size"
        className="LibraryTileSizeSlider__input"
        type="range"
        min={LIBRARY_TILE_WIDTH_MIN}
        max={LIBRARY_TILE_WIDTH_MAX}
        step={LIBRARY_TILE_WIDTH_STEP}
        value={width}
        onChange={handleChange}
        aria-valuetext={valueText}
      />
    </div>
  )
}
