import { renderToStaticMarkup } from 'react-dom/server'
import { BUILTIN_TOKENS } from 'frontend/customThemes/builtinTokens'
import { thumbnailPalette } from 'frontend/customThemes/thumbnailPalette'
import { ThemeThumbnail } from '../ThemeThumbnail'

const dracula = BUILTIN_TOKENS['dracula'] ?? {}
const nordLight = BUILTIN_TOKENS['nord-light'] ?? {}

describe('ThemeThumbnail', () => {
  it('draws every palette colour as a fill or stroke', () => {
    const markup = renderToStaticMarkup(
      <ThemeThumbnail tokens={dracula} base="dracula" />
    )
    const palette = thumbnailPalette(dracula, 'dracula')
    for (const colour of Object.values(palette)) {
      expect(markup).toContain(`fill="${colour}"`)
    }
    expect(markup).toContain(`stroke="${palette.searchStroke}"`)
  })

  it('uses no <text> element, so there is no font dependency', () => {
    const markup = renderToStaticMarkup(
      <ThemeThumbnail tokens={dracula} base="dracula" />
    )
    expect(markup).not.toContain('<text')
  })

  it('is decorative without a label', () => {
    const markup = renderToStaticMarkup(
      <ThemeThumbnail tokens={dracula} base="dracula" />
    )
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain('focusable="false"')
    expect(markup).not.toContain('role="img"')
  })

  it('is an image named by the label when given', () => {
    const markup = renderToStaticMarkup(
      <ThemeThumbnail tokens={dracula} base="dracula" label="Dracula preview" />
    )
    expect(markup).toContain('role="img"')
    expect(markup).toContain('aria-label="Dracula preview"')
    expect(markup).not.toContain('aria-hidden')
  })

  it('never lets a hostile token value reach the markup', () => {
    const markup = renderToStaticMarkup(
      <ThemeThumbnail
        tokens={{ ...dracula, '--body-background': '"/><script>' }}
        base="dracula"
      />
    )
    expect(markup).not.toContain('<script')
    expect(markup).not.toContain('"/>')
    expect(markup).not.toContain('var(')
  })

  it('draws the Nord Light success button in the base theme colour', () => {
    const markup = renderToStaticMarkup(
      <ThemeThumbnail
        tokens={{ ...nordLight, '--success-button': '#ff0000' }}
        base="nord-light"
      />
    )
    expect(markup).toMatch(
      /data-part="button-success"><rect[^>]*fill="#81a1c1"/
    )
    expect(markup).not.toContain('#ff0000')
  })
})
