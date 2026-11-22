import fs from 'fs'
import path from 'path'
import { cssBlock } from '../../testUtils/scssTokenSource'
import { stripSourceComments } from '../../../backend/testUtils/stripSourceComments'
import { BUILTIN_TOKENS } from '../builtinTokens'
import {
  BASE_OVERRIDDEN_TOKENS,
  BASE_PREVIEW_OVERRIDES,
  PREVIEW_TOKENS,
  thumbnailPalette
} from '../thumbnailPalette'

const dracula = BUILTIN_TOKENS['dracula'] ?? {}
const nordLight = BUILTIN_TOKENS['nord-light'] ?? {}
const gamelibLight = BUILTIN_TOKENS['gamelib-light'] ?? {}

const without = (
  tokens: Readonly<Record<string, string>>,
  ...names: string[]
): Record<string, string> => {
  const copy: Record<string, string> = { ...tokens }
  for (const name of names) delete copy[name]
  return copy
}

describe('thumbnailPalette consumer fallback chains', () => {
  it('draws inactive labels from --navbar-inactive, else --navbar-accent', () => {
    const tokens = {
      '--navbar-inactive': '#111111',
      '--navbar-accent': '#222222'
    }
    expect(thumbnailPalette(tokens, 'dracula').inactiveLabel).toBe('#111111')
    expect(
      thumbnailPalette(without(tokens, '--navbar-inactive'), 'dracula')
        .inactiveLabel
    ).toBe('#222222')
  })

  it('draws the active label from --navbar-active, then --accent-overlay, then --accent', () => {
    const tokens = {
      '--navbar-active': '#111111',
      '--accent-overlay': '#222222',
      '--accent': '#333333'
    }
    expect(thumbnailPalette(tokens, 'dracula').activeLabel).toBe('#111111')
    expect(
      thumbnailPalette(without(tokens, '--navbar-active'), 'dracula')
        .activeLabel
    ).toBe('#222222')
    expect(
      thumbnailPalette(
        without(tokens, '--navbar-active', '--accent-overlay'),
        'dracula'
      ).activeLabel
    ).toBe('#333333')
  })

  it('fills the search bar from --search-bar-background, else --input-background, and strokes --search-bar-border else --accent', () => {
    const tokens = {
      '--search-bar-background': '#111111',
      '--input-background': '#222222',
      '--search-bar-border': '#333333',
      '--accent': '#444444'
    }
    const full = thumbnailPalette(tokens, 'dracula')
    expect(full.searchFill).toBe('#111111')
    expect(full.searchStroke).toBe('#333333')
    const bare = thumbnailPalette(
      without(tokens, '--search-bar-background', '--search-bar-border'),
      'dracula'
    )
    expect(bare.searchFill).toBe('#222222')
    expect(bare.searchStroke).toBe('#444444')
  })

  it('falls back to --status-success and --status-danger when the button tokens are absent', () => {
    const tokens = {
      '--status-success': '#aaaaaa',
      '--status-danger': '#bbbbbb',
      '--cancel-button': '#cccccc'
    }
    const palette = thumbnailPalette(tokens, 'dracula')
    expect(palette.success).toBe('#aaaaaa')
    expect(palette.danger).toBe('#cccccc')
    expect(
      thumbnailPalette(without(tokens, '--cancel-button'), 'dracula').danger
    ).toBe('#bbbbbb')
  })

  it('paints the dracula tab bar from its own token, not the body', () => {
    const palette = thumbnailPalette(dracula, 'dracula')
    expect(palette.tabBar).toBe(dracula['--navbar-background'])
    expect(palette.body).toBe(dracula['--body-background'])
    expect(palette.tabBar).not.toBe(palette.body)
  })
})

describe('thumbnailPalette sanitising', () => {
  it.each(['#12', 'var(--x)', '"/><script>', 'not a colour'])(
    'draws the base colour, never the raw text, for %s',
    (hostile) => {
      const palette = thumbnailPalette(
        { ...dracula, '--body-background': hostile },
        'dracula'
      )
      expect(palette.body).toBe(dracula['--body-background'])
      expect(JSON.stringify(palette)).not.toContain(hostile)
    }
  )

  it('draws a transparent last resort when neither the theme nor its base has the token', () => {
    expect(thumbnailPalette({}, 'not-a-base').body).toBe('#00000000')
  })

  it('canonicalises a valid value to lowercase hex', () => {
    expect(
      thumbnailPalette({ '--body-background': '#ABC' }, 'dracula').body
    ).toBe('#aabbcc')
  })
})

describe('Nord Light base overrides (OD-2)', () => {
  it('names exactly the three base-owned preview colours', () => {
    expect(BASE_PREVIEW_OVERRIDES['nord-light']).toEqual({
      success: { literal: '#81a1c1' },
      successLabel: { token: '--text-default' },
      primaryLabel: { token: '--text-default' }
    })
    expect(Object.keys(BASE_PREVIEW_OVERRIDES)).toEqual([
      'gamelib-light',
      'nord-light'
    ])
  })

  it('draws the success button #81a1c1 whatever --success-button holds', () => {
    const palette = thumbnailPalette(
      { ...nordLight, '--success-button': '#ff0000' },
      'nord-light'
    )
    expect(palette.success).toBe('#81a1c1')
    expect(palette.successLabel).toBe(nordLight['--text-default'])
    expect(palette.primaryLabel).toBe(nordLight['--text-default'])
  })

  it('leaves other bases on the generic chains', () => {
    const palette = thumbnailPalette(dracula, 'dracula')
    expect(palette.success).toBe(dracula['--success-button'])
    expect(palette.primaryLabel).toBe(dracula['--text-tertiary'])
  })

  it('records --success-button as set by the nord-light base', () => {
    expect(BASE_OVERRIDDEN_TOKENS['nord-light']).toEqual(['--success-button'])
  })

  it('pins the overrides to the nord-light rules in themes.scss', () => {
    const scss = stripSourceComments(
      fs.readFileSync(path.join(__dirname, '../../themes.scss'), 'utf8')
    )
    const block = cssBlock(scss, 'body.nord-light')
    // `button.is-primary` also matches inside `.button.is-primary`, so anchor on a line start.
    const primaryStart = block.search(/^\s*button\.is-primary \{/m)
    expect(primaryStart).toBeGreaterThanOrEqual(0)
    const primary = cssBlock(block.slice(primaryStart), 'button.is-primary')
    const success = cssBlock(block, '.button.is-success')
    expect(primary).toMatch(/color:\s*var\(--text-default\)\s*;/)
    expect(success).toMatch(/background-color:\s*#81a1c1\s*;/)
    expect(success).toMatch(/(^|[\s;])color:\s*var\(--text-default\)\s*;/)
  })
})

describe('GameLib Light base overrides (OD-2)', () => {
  it('names exactly the three base-owned preview colours', () => {
    expect(BASE_PREVIEW_OVERRIDES['gamelib-light']).toEqual({
      success: { literal: '#81a1c1' },
      successLabel: { token: '--text-default' },
      primaryLabel: { token: '--text-default' }
    })
  })

  it('draws the success button #81a1c1 whatever --success-button holds', () => {
    const palette = thumbnailPalette(
      { ...gamelibLight, '--success-button': '#ff0000' },
      'gamelib-light'
    )
    expect(palette.success).toBe('#81a1c1')
    expect(palette.successLabel).toBe(gamelibLight['--text-default'])
    expect(palette.primaryLabel).toBe(gamelibLight['--text-default'])
  })

  it('records --success-button as set by the gamelib-light base', () => {
    expect(BASE_OVERRIDDEN_TOKENS['gamelib-light']).toEqual([
      '--success-button'
    ])
  })

  it('pins the overrides to the gamelib-light rules in themes.scss', () => {
    const scss = stripSourceComments(
      fs.readFileSync(path.join(__dirname, '../../themes.scss'), 'utf8')
    )
    const block = cssBlock(scss, 'body.gamelib-light')
    // `button.is-primary` also matches inside `.button.is-primary`, so anchor on a line start.
    const primaryStart = block.search(/^\s*button\.is-primary \{/m)
    expect(primaryStart).toBeGreaterThanOrEqual(0)
    const primary = cssBlock(block.slice(primaryStart), 'button.is-primary')
    const success = cssBlock(block, '.button.is-success')
    expect(primary).toMatch(/color:\s*var\(--text-default\)\s*;/)
    expect(success).toMatch(/background-color:\s*#81a1c1\s*;/)
    expect(success).toMatch(/(^|[\s;])color:\s*var\(--text-default\)\s*;/)
  })
})

describe('PREVIEW_TOKENS', () => {
  it('holds every token a palette chain reads', () => {
    for (const name of [
      '--body-background',
      '--navbar-background',
      '--navbar-inactive',
      '--navbar-accent',
      '--navbar-active',
      '--accent-overlay',
      '--accent',
      '--navbar-active-background',
      '--search-bar-background',
      '--input-background',
      '--search-bar-border',
      '--background',
      '--gamecard-title-color',
      '--primary',
      '--secondary-button',
      '--success-button',
      '--status-success',
      '--cancel-button',
      '--status-danger',
      '--text-tertiary',
      '--text-default',
      '--text-secondary'
    ]) {
      expect(PREVIEW_TOKENS.has(name)).toBe(true)
    }
  })

  it('leaves out tokens the thumbnail never draws', () => {
    for (const name of ['--modal-background', '--border-color', '--danger']) {
      expect(PREVIEW_TOKENS.has(name)).toBe(false)
    }
  })
})
