import {
  EXCLUDED_ATTRIBUTES,
  GlossaryLoadError,
  USER_FACING_ATTRIBUTES,
  loadGlossary,
  scanSource
} from '../hardcodedStringGate'

const EMPTY_GLOSSARY = { glossary: [] as string[] }

describe('hardcodedStringGate', () => {
  describe('violations', () => {
    it('flags bare JSX text — the phase\'s central negative proof: a gate that cannot fail is worthless', () => {
      const source = `
        export const Example = () => <p>Steam client not found</p>
      `
      const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)

      expect(result.violations).toHaveLength(1)
      expect(result.violations[0]).toMatchObject({
        kind: 'jsx-text',
        text: 'Steam client not found'
      })
    })

    it('flags an object-property string — a shape react/jsx-no-literals structurally cannot see', () => {
      const source = `
        const config = { message: 'Repair failed. See the log.' }
      `
      const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

      expect(result.violations).toHaveLength(1)
      expect(result.violations[0]).toMatchObject({
        kind: 'object-property',
        text: 'Repair failed. See the log.'
      })
    })

    it('flags a bare returned label — modelled on the real appleRating.ts:31 finding', () => {
      const source = `
        function getLabel(): string {
          return 'Unrated'
        }
      `
      const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

      expect(result.violations).toHaveLength(1)
      expect(result.violations[0]).toMatchObject({
        kind: 'return',
        text: 'Unrated'
      })
    })

    it.each(USER_FACING_ATTRIBUTES)(
      'flags a prose value on the "%s" attribute',
      (attribute) => {
        const source = `
          export const Example = () => <div ${attribute}="Prose value here" />
        `
        const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(1)
        expect(result.violations[0]).toMatchObject({
          kind: 'jsx-attribute',
          attribute,
          text: 'Prose value here'
        })
      }
    )

    it('flags a template literal with interpolation', () => {
      const source =
        'const msg = `Login failed for ${runner}: status=${status}`'
      const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

      expect(result.violations).toHaveLength(1)
      expect(result.violations[0].text).toContain('Login failed for')
    })
  })

  describe('never flagged', () => {
    it('never flags a console.error argument (Anti-Pattern 1)', () => {
      const source = `
        function log(raw: string) {
          console.error('Repair failed: ' + raw)
        }
      `
      const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

      expect(result.violations).toHaveLength(0)
    })

    it('never flags a thrown Error message', () => {
      const source = `
        function boom() {
          throw new Error('unreachable')
        }
      `
      const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

      expect(result.violations).toHaveLength(0)
    })

    it('never flags prose inside a JSDoc block or a // comment (Pitfall 2)', () => {
      const source = `
        /**
         * No compatibility data available
         */
        function noop() {
          // No compatibility data available
        }
      `
      const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

      expect(result.violations).toHaveLength(0)
    })

    it.each(EXCLUDED_ATTRIBUTES)(
      'never flags the "%s" attribute',
      (attribute) => {
        const source = `
          export const Example = () => <div ${attribute}="some value" />
        `
        const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(0)
      }
    )

    it('never flags a data-* attribute — real LibraryFilters case', () => {
      const source = `
        export const Example = () => <div data-tour="library-filters" />
      `
      const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)

      expect(result.violations).toHaveLength(0)
    })

    it('never flags an aria-* attribute other than aria-label', () => {
      const source = `
        export const Example = () => <div aria-describedby="some-id" />
      `
      const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)

      expect(result.violations).toHaveLength(0)
    })

    it('never flags a filesystem path', () => {
      const source = "const config = { path: '/home/user/game' }"
      const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

      expect(result.violations).toHaveLength(0)
    })

    it('never flags a https:// URL', () => {
      const source =
        "const config = { url: 'https://example.com/foo' }"
      const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

      expect(result.violations).toHaveLength(0)
    })

    it('never flags a bare camelCase identifier string', () => {
      const source = "const config = { token: 'myVariableName' }"
      const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

      expect(result.violations).toHaveLength(0)
    })

    it('never flags a hex colour', () => {
      const source = "const config = { color: '#ff00ff' }"
      const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

      expect(result.violations).toHaveLength(0)
    })
  })

  describe('glossary exemption', () => {
    const REAL_GLOSSARY = loadGlossary()

    it.each([
      'GameLib',
      'Steam',
      'Epic',
      'GOG',
      'Proton',
      'CrossOver',
      'Steam Deck',
      'Linux',
      'macOS',
      'Windows',
      'MB/s',
      'Amazon',
      'ZOOM',
      'Zoom',
      'Epic/Legendary',
      'Amazon/Nile',
      'Amazon Games'
    ])('exempts the glossary term "%s" as an isolated literal', (term) => {
      const source = `export const Example = () => <p>${term}</p>`
      const result = scanSource('fixture.tsx', source, {
        glossary: REAL_GLOSSARY
      })

      expect(result.violations).toHaveLength(0)
      expect(result.exempted).toBe(1)
    })

    it("mechanically proves D-21 — ConsoleMode's store-label map needs no code change", () => {
      const source = `
        const storeFilters = [
          { key: 'legendary', label: 'Epic' },
          { key: 'zoom', label: 'ZOOM' }
        ]
      `
      const result = scanSource('fixture.ts', source, {
        glossary: REAL_GLOSSARY
      })

      expect(result.violations).toHaveLength(0)
    })

    it("mechanically proves D-21 — LogSettings' baseFiles titles need no code change", () => {
      const source = `
        const baseFiles = [
          { title: 'Epic/Legendary', args: {} },
          { title: 'Amazon/Nile', args: {} }
        ]
      `
      const result = scanSource('fixture.ts', source, {
        glossary: REAL_GLOSSARY
      })

      expect(result.violations).toHaveLength(0)
    })

    it('mechanically proves D-22 — PlatformSupport.tsx titles are audit false positives, not omissions', () => {
      const source = `
        export const Example = () => (
          <>
            <span title="Windows" />
            <span title="macOS" />
            <span title="Linux" />
          </>
        )
      `
      const result = scanSource('fixture.tsx', source, {
        glossary: REAL_GLOSSARY
      })

      expect(result.violations).toHaveLength(0)
    })

    it('near-miss: a literal that merely CONTAINS a glossary term is still a violation — matching is whole-string, not substring', () => {
      const containsSteam = scanSource(
        'fixture.tsx',
        'export const Example = () => <p>Steam client not found</p>',
        { glossary: REAL_GLOSSARY }
      )
      expect(containsSteam.violations).toHaveLength(1)

      const containsAmazonGames = scanSource(
        'fixture.tsx',
        'export const Example = () => <p>Amazon Games library</p>',
        { glossary: REAL_GLOSSARY }
      )
      expect(containsAmazonGames.violations).toHaveLength(1)

      const isolatedSteam = scanSource(
        'fixture.tsx',
        'export const Example = () => <p>Steam</p>',
        { glossary: REAL_GLOSSARY }
      )
      expect(isolatedSteam.violations).toHaveLength(0)
    })
  })

  describe('glossary load guard', () => {
    it('throws GlossaryLoadError rather than returning [] for a nonexistent path', () => {
      expect(() => loadGlossary('meta/does-not-exist.json')).toThrow(
        GlossaryLoadError
      )
    })
  })
})
