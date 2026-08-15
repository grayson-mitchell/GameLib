import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Project } from 'ts-morph'

import {
  EXCLUDED_ATTRIBUTES,
  FILE_EXEMPT_MARKER,
  GlossaryLoadError,
  ScopeLoadError,
  USER_FACING_ATTRIBUTES,
  collectTAliases,
  formatReport,
  loadGlossary,
  scanScope,
  scanSource
} from '../hardcodedStringGate'

const EMPTY_GLOSSARY = { glossary: [] as string[] }

describe('hardcodedStringGate', () => {
  describe('violations', () => {
    it("flags bare JSX text — the phase's central negative proof: a gate that cannot fail is worthless", () => {
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
      const source = "const config = { url: 'https://example.com/foo' }"
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

    it('never flags a window.api.logInfo argument — real useTauriOAuthLogin.ts diagnostic logging under the Tauri sidecar (plan 05)', () => {
      const source = `
        function run(activeRunner: string) {
          window.api.logInfo(\`[useTauriOAuthLogin] runner=\${activeRunner} phase=preparing\`)
        }
      `
      const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

      expect(result.violations).toHaveLength(0)
    })

    it('never flags a window.api.logError argument — same diagnostic-logging category as window.api.logInfo', () => {
      const source = `
        function run() {
          window.api.logError('Repair failed: something went wrong')
        }
      `
      const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

      expect(result.violations).toHaveLength(0)
    })

    it('never flags a CSS value nested inside a style={{}} object — real SteamLogin/index.tsx inline styles (plan 05)', () => {
      const source = `
        export const Example = () => (
          <p style={{ fontSize: 'var(--text-lg)', color: 'var(--text-default)', padding: '8px' }}>
            hi
          </p>
        )
      `
      const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)

      expect(result.violations).toHaveLength(0)
    })

    it('still flags real prose inside a style={{}} sibling attribute — the style exemption is scoped to the style attribute only', () => {
      const source = `
        export const Example = () => (
          <p style={{ color: 'var(--text-default)' }} title="Repair failed. See the log." />
        )
      `
      const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)

      expect(result.violations).toHaveLength(1)
      expect(result.violations[0]).toMatchObject({
        kind: 'jsx-attribute',
        attribute: 'title'
      })
    })
  })

  describe('plan 06 (34.8-06): whole-scope audit fixes', () => {
    describe('composed t()-call arguments', () => {
      it('never flags a ternary default-text argument — real TauriLoginPanel.tsx idiom', () => {
        const source = `
          function run(t: TFunction, runnerLabel?: string) {
            return t(
              'webview.login.oauth.awaiting.heading',
              runnerLabel ? \`Signing in to \${runnerLabel}\` : 'Signing in'
            )
          }
        `
        const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(0)
      })

      it('never flags a ternary KEY argument — real InstalledInfo.tsx idiom', () => {
        const source = `
          function run(t: TFunction, canRunOffline: boolean) {
            return t(canRunOffline ? 'box.no' : 'box.yes')
          }
        `
        const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(0)
      })

      it('never flags a string-concatenation default-text argument — real WebviewUnavailablePanel.tsx idiom', () => {
        const source = `
          function run(t: TFunction) {
            return t(
              'webview.unavailable.body',
              "GameLib's Tauri build does not yet embed a browser view for the " +
                'store and wiki pages.'
            )
          }
        `
        const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(0)
      })

      it('still flags a ternary branch that is NOT a t()-call argument — the exemption is call-site-driven, not shape-driven', () => {
        const source = `
          function run(loading: boolean) {
            return loading ? 'Loading now' : 'Not loading'
          }
        `
        const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(2)
      })
    })

    describe('t(key, { defaultValue }) object-form argument', () => {
      it('never flags a defaultValue property on an object passed to t() — real SteamBottleSetup.tsx idiom', () => {
        const source = `
          function run(t: TFunction, error: string) {
            return t('bottle.setup.errorMessage', {
              defaultValue: 'Steam setup could not start: {{error}}',
              error
            })
          }
        `
        const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(0)
      })

      it('still flags a defaultValue-named property on an object NOT passed to t() — the exemption is call-site-driven', () => {
        const source = `
          const config = { defaultValue: 'Some real prose here' }
        `
        const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(1)
      })
    })

    describe('<Trans> component children', () => {
      it('never flags JSX text as a direct child of <Trans> — real EmptyLibrary/index.tsx idiom', () => {
        const source = `
          export const Example = () => (
            <Trans i18n={i18n} i18nKey="emptyLibrary.noGames">
              Your library is empty.
            </Trans>
          )
        `
        const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(0)
      })

      it('never flags JSX text nested inside a child element of <Trans> — real GamePage/index.tsx wikiLink idiom', () => {
        const source = `
          export const Example = () => (
            <Trans key="wikiLink" i18n={i18n}>
              Important information about this game, read this:
              <Link to={wikiLink}>Open page</Link>
            </Trans>
          )
        `
        const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(0)
      })

      it('never flags a Trans i18nKey attribute value — an i18n key, not prose', () => {
        const source = `
          export const Example = () => (
            <Trans i18nKey="install.warn-crossover-wont-run" ns="gamepage">
              This game is known not to run well.
            </Trans>
          )
        `
        const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(0)
      })

      it('still flags JSX text OUTSIDE a <Trans> element — the exemption is scoped to the Trans tag name only', () => {
        const source = `
          export const Example = () => <p>Real hardcoded prose</p>
        `
        const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(1)
      })
    })

    describe('keyboard event .key comparisons', () => {
      it('never flags a string compared against KeyboardEvent.key — real ConsoleMode idiom', () => {
        const source = `
          function onKeyDown(e: KeyboardEvent) {
            if (e.key === 'Escape' || e.key === 'Backspace') return
          }
        `
        const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(0)
      })

      it('never flags a case clause matched against a switch(x.key) discriminant', () => {
        const source = `
          function onKeyDown(e: KeyboardEvent) {
            switch (e.key) {
              case 'Enter':
                return
              default:
                return
            }
          }
        `
        const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(0)
      })

      it('still flags a string compared against an unrelated property — the exemption is scoped to .key specifically', () => {
        const source = `
          function check(x: { status: string }) {
            if (x.status === 'Some real prose here') return
          }
        `
        const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(1)
      })
    })

    describe('CSS custom-property / value content shapes', () => {
      it.each([
        '--primary-font-family',
        'var(--accent)',
        'var(--cancel-button, var(--danger))',
        '2px',
        '350px',
        'blur(10px)',
        'blur(0)',
        '[data-tour="sidebar-menu"]'
      ])('never flags the CSS-shaped value "%s"', (value) => {
        const source = `const config = { style: '${value}' }`
        const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(0)
      })

      it('still flags real prose that happens to contain a dash — the CSS shape checks are fully anchored', () => {
        const source =
          "const config = { message: 'Something - went wrong here' }"
        const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(1)
      })
    })

    describe('generalized excluded-JSX-attribute nesting', () => {
      it('never flags a CSS class string passed to classNames() nested inside className={} — real SidebarItem/index.tsx idiom', () => {
        const source = `
          export const Example = ({ className }: { className: string }) => (
            <button className={classNames('Sidebar__item', className, { active: true })} />
          )
        `
        const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(0)
      })

      it('never flags a ternary branch used directly as a className value — real SearchBar/index.tsx idiom', () => {
        const source = `
          export const Example = ({ loading }: { loading: boolean }) => (
            <span className={loading ? 'searchButton fa-spin-pulse' : 'searchButton'} />
          )
        `
        const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(0)
      })

      it('never flags a string nested inside a template-literal interpolation inside className={} — real DiscountFilters/index.tsx idiom', () => {
        const source = `
          export const Example = ({ active }: { active: boolean }) => (
            <button
              className={\`discountFilters__segment\${
                active ? ' discountFilters__segment--active' : ''
              }\`}
            />
          )
        `
        const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(0)
      })

      it("still flags real prose nested inside a NON-excluded attribute's ternary — the exemption is attribute-name-driven", () => {
        const source = `
          export const Example = ({ ok }: { ok: boolean }) => (
            <span title={ok ? 'All good here' : 'Something went wrong here'} />
          )
        `
        const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(2)
      })
    })

    describe('new EXCLUDED_ATTRIBUTES entries', () => {
      // 34.13 review A-06: `buttonClass` was added to EXCLUDED_ATTRIBUTES
      // with NO paired fixture, contradicting this file's own stated
      // discipline ("each exemption is proven by a paired negative fixture in
      // the test suite"). Occurrence counts at the time of the finding:
      // htmlId 1, extraClass 1, i18nKey 4, partition 1, buttonClass 0. It is
      // a GLOBAL attribute-name exemption, so after it any component anywhere
      // in the scope rendering `<Anything buttonClass="Some real prose">` is
      // silently exempt -- a real widening of the gate's blind spot, added
      // without the proof every sibling entry carries. Added here.
      // 34.13 review A-16: `buttonClass` is REMOVED from this blanket list --
      // it is now tag-scoped to `Dropdown` (isDropdownButtonClassProp), so a
      // `<div buttonClass=...>` fixture would no longer be exempt and must
      // not claim to be. Its scoped fixtures are the two specs below.
      it.each(['i18nKey', 'htmlId', 'extraClass', 'partition'])(
        'never flags the "%s" attribute',
        (attribute) => {
          const source = `
            export const Example = () => <div ${attribute}="some-value" />
          `
          const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)

          expect(result.violations).toHaveLength(0)
        }
      )

      it('A-06: exempts the real Dropdown-family buttonClass value shape (a CSS class list, not prose)', () => {
        // The literal value the phase actually ships on `MainButton`'s caret.
        const source = `
          export const Example = () => <Dropdown buttonClass="button outline" />
        `
        const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(0)
        // Non-vacuity: the scanner DID look at this element. The identical
        // literal on a non-excluded attribute of the same element IS flagged,
        // so the zero above is an exemption decision, not a blind spot. (A
        // count of `result.exempted` would NOT prove this -- excluded
        // attributes are skipped before that counter is touched.)
        //
        // 34.13 review A-16: this assertion USED to be
        // `expect(sameValueUnexcluded.violations.length).toBeGreaterThanOrEqual(0)`
        // -- true for every array. The comment above it asserted a proof that
        // was never performed, in the fix for a finding ABOUT gates that
        // cannot fail. Running the real scanner on this exact input yields
        // exactly ONE violation, so the real assertion was available all
        // along.
        const sameValueUnexcluded = scanSource(
          'fixture.tsx',
          `export const Example = () => <Dropdown title="button outline" />`,
          EMPTY_GLOSSARY
        )
        expect(sameValueUnexcluded.violations).toHaveLength(1)
        expect(sameValueUnexcluded.violations[0]).toMatchObject({
          kind: 'jsx-attribute',
          attribute: 'title'
        })
      })

      // ── 34.13 review A-16, second half ───────────────────────────────────
      // The blanket `buttonClass` entry did not just lack a fixture, it
      // WIDENED the gate's blind spot: any component anywhere in the 164-file
      // scope could carry real prose in a `buttonClass` and go unflagged. The
      // iteration-2 fix documented that hole rather than closing it. The
      // exemption is now tag-scoped to `Dropdown`, mirroring
      // `isInfoBoxTextKeyProp`'s `text`/`InfoBox` scoping and its stated
      // reason ("too generic an attribute name to exempt everywhere").
      it('A-16: real prose in buttonClass on a NON-Dropdown component is FLAGGED', () => {
        const result = scanSource(
          'fixture.tsx',
          `export const Example = () => <Anything buttonClass="Install with options now" />`,
          EMPTY_GLOSSARY
        )

        expect(result.violations).toHaveLength(1)
        expect(result.violations[0]).toMatchObject({
          kind: 'jsx-attribute',
          attribute: 'buttonClass'
        })
      })

      it('A-16 DISCRIMINATOR: the SAME prose in buttonClass on Dropdown itself stays exempt', () => {
        // Proves the narrowing did not simply delete the exemption -- the
        // real shipped consumer is still covered.
        const result = scanSource(
          'fixture.tsx',
          `export const Example = () => <Dropdown buttonClass="Install with options now" />`,
          EMPTY_GLOSSARY
        )

        expect(result.violations).toHaveLength(0)
      })

      it('A-06 BOUNDARY: the exemption is attribute-name-driven, so real prose in a NEIGHBOURING attribute on the same element is still flagged', () => {
        const source = `
          export const Example = () => (
            <Dropdown buttonClass="button outline" title="Install with options now" />
          )
        `
        const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(1)
        expect(result.violations[0]).toMatchObject({
          kind: 'jsx-attribute',
          attribute: 'title',
          text: 'Install with options now'
        })
      })
    })

    describe('InfoBox text-key prop', () => {
      it('never flags the "text" attribute on an <InfoBox> element — an i18n key forwarded to an internal t(text) call', () => {
        const source = `
          export const Example = () => <InfoBox text="infobox.help">content</InfoBox>
        `
        const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(0)
      })

      it('still flags a "text" attribute on a DIFFERENT component — the exemption is scoped to the InfoBox tag name only', () => {
        const source = `
          export const Example = () => <SomeOtherWidget text="Real hardcoded prose here" />
        `
        const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(1)
      })
    })

    describe('config-store key arguments', () => {
      it.each(['get', 'set', 'get_nodefault'])(
        'never flags a string key argument to configStore.%s(...)',
        (method) => {
          const source = `
            function run() {
              return configStore.${method}('games.hidden', [])
            }
          `
          const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

          expect(result.violations).toHaveLength(0)
        }
      )

      it.each(['storeGet', 'storeSet', 'storeHas', 'storeDelete'])(
        'never flags a string key argument to window.api.%s(...) — real electronStores.ts idiom',
        (method) => {
          const source = `
            function run(key: string) {
              return window.api.${method}('configStore', \`__timestamp.\${key}\`)
            }
          `
          const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

          expect(result.violations).toHaveLength(0)
        }
      )

      it('still flags a string argument to an unrelated method sharing no method-name overlap', () => {
        const source =
          "const x = someOtherApi.fetchData('Real hardcoded prose here')"
        const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

        expect(result.violations).toHaveLength(1)
      })
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

  // ---------------------------------------------------------------------
  // D-14: the four idioms the gate MUST tolerate. Each fixture below is
  // copied verbatim from the real file it protects (aside from trimming
  // unrelated surrounding logic) -- a paraphrased fixture proves nothing
  // about the real file. Each block also carries a negative counterpart
  // proving the exemption is narrow, not a blanket hole.
  // ---------------------------------------------------------------------

  function makeSourceFile(source: string) {
    const project = new Project({ useInMemoryFileSystem: true })
    return project.createSourceFile('fixture.tsx', source)
  }

  describe('D-14: aliased t', () => {
    it('never flags a t() call through the bare, unaliased `t`', () => {
      const source = `
        export const Example = () => {
          const { t } = useTranslation()
          return t('key.name', 'Some English default')
        }
      `
      const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)
      expect(result.violations).toHaveLength(0)

      expect(collectTAliases(makeSourceFile(source))).toEqual(new Set(['t']))
    })

    it("never flags a t() call through `t2` — real GameCard/index.tsx:105 alias (useTranslation('gamepage'))", () => {
      const source = `
        export const Example = () => {
          const { t: t2 } = useTranslation('gamepage')
          return t2('key.name', 'Some English default')
        }
      `
      const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)
      expect(result.violations).toHaveLength(0)

      expect(collectTAliases(makeSourceFile(source))).toEqual(
        new Set(['t', 't2'])
      )
    })

    it('never flags a t() call through `tr` — real InstallModal/DownloadDialog/index.tsx:157 alias', () => {
      const source = `
        export const Example = () => {
          const { t: tr } = useTranslation()
          return tr('key.name', 'Some English default')
        }
      `
      const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)
      expect(result.violations).toHaveLength(0)

      expect(collectTAliases(makeSourceFile(source))).toEqual(
        new Set(['t', 'tr'])
      )
    })

    it('never enforces namespace/key choice (D-13) — a colon-namespaced key through an alias still passes', () => {
      const source = `
        export const Example = () => {
          const { t: t2 } = useTranslation()
          return t2('gamelib:steam.installQueued', 'Install queued')
        }
      `
      const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)
      expect(result.violations).toHaveLength(0)
    })

    it('flags a call through a name that is NOT a known t-alias — proves the exemption is alias-set-driven, not "any call passes"', () => {
      const source = `
        export const Example = () => {
          const { t: tr } = useTranslation()
          return someOtherFn('key.name', 'Not exempt')
        }
      `
      const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)
      expect(result.violations.length).toBeGreaterThan(0)
    })
  })

  describe('D-14: [key, default] tuple tables', () => {
    it("never flags CrossoverBadge.tsx's labelKeyByTier table — real Library/components/GameCard/CrossoverBadge.tsx", () => {
      const source = `
        import { useTranslation } from 'react-i18next'

        interface Props {
          rating: number | null | undefined
        }

        type Tier = 'gold' | 'silver' | 'bronze' | 'wontRun' | 'unknown'

        const CrossoverBadge = ({ rating }: Props) => {
          const { t } = useTranslation()

          if (rating === undefined) {
            return null
          }

          let tier: Tier
          if (rating === null) {
            tier = 'unknown'
          } else if (rating >= 5) {
            tier = 'gold'
          } else if (rating === 4) {
            tier = 'silver'
          } else if (rating === 3) {
            tier = 'bronze'
          } else {
            tier = 'wontRun'
          }

          const labelKeyByTier: Record<Tier, [string, string]> = {
            gold: ['library.crossover_gold', 'Runs great on CrossOver (gold rating)'],
            silver: ['library.crossover_silver', 'Runs well on CrossOver (silver rating)'],
            bronze: [
              'library.crossover_bronze',
              'Runs with issues on CrossOver (bronze rating)'
            ],
            wontRun: ['library.crossover_wont_run', 'Known not to work on CrossOver'],
            unknown: ['library.crossover_unknown', 'CrossOver compatibility unknown']
          }

          const [key, defaultText] = labelKeyByTier[tier]
          const label = t(key, defaultText)

          return (
            <span
              className={\`gameCardCrossoverBadge gameCardCrossoverBadge--\${tier}\`}
              title={label}
              aria-label={label}
              aria-hidden={false}
              style={{ pointerEvents: 'none' }}
            />
          )
        }

        export default CrossoverBadge
      `
      const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)
      expect(result.violations).toHaveLength(0)
    })

    it("never flags LibraryFilters' crossoverRatingLabels table — real components/UI/LibraryFilters/index.tsx:172-194", () => {
      const source = `
        import { useTranslation } from 'react-i18next'

        interface CrossoverRatingFilters {
          gold: boolean
          silver: boolean
          bronze: boolean
          wontRun: boolean
          unrated: boolean
        }

        const LibraryFiltersFixture = (
          crossoverRatingFilters: CrossoverRatingFilters,
          toggleCrossoverRatingFilter: (tier: keyof CrossoverRatingFilters) => void
        ) => {
          const { t } = useTranslation()

          // t('header.show_crossover_gold', 'Runs great (gold)')
          // t('header.show_crossover_silver', 'Runs well (silver)')
          // t('header.show_crossover_bronze', 'Runs with issues (bronze)')
          // t('header.show_crossover_wont_run', "Known not to work")
          // t('header.show_crossover_unrated', 'Unrated / not yet checked')
          const crossoverRatingLabels: Record<
            keyof CrossoverRatingFilters,
            [string, string]
          > = {
            gold: ['header.show_crossover_gold', 'Runs great (gold)'],
            silver: ['header.show_crossover_silver', 'Runs well (silver)'],
            bronze: ['header.show_crossover_bronze', 'Runs with issues (bronze)'],
            wontRun: ['header.show_crossover_wont_run', "Known not to work"],
            unrated: ['header.show_crossover_unrated', 'Unrated / not yet checked']
          }

          const crossoverRatingToggle = (tier: keyof CrossoverRatingFilters) => {
            const [key, defaultText] = crossoverRatingLabels[tier]
            return (
              <ToggleSwitch
                key={tier}
                handleChange={() => toggleCrossoverRatingFilter(tier)}
                value={crossoverRatingFilters[tier]}
                title={t(key, defaultText)}
              />
            )
          }

          return crossoverRatingToggle
        }
      `
      const result = scanSource('fixture.tsx', source, EMPTY_GLOSSARY)
      expect(result.violations).toHaveLength(0)
    })

    it("never flags stateLabels.ts's STATE_LABEL_KEYS table — real screens/Humble/Keys/stateLabels.ts (verbatim)", () => {
      const source = `
        import { HumbleKeyState } from 'common/types/humble'

        export const STATE_LABEL_KEYS: Record<HumbleKeyState, [string, string]> = {
          UNPICKED: ['humbleKeys.state.unpicked', 'Unpicked'],
          UNREVEALED: ['humbleKeys.state.unrevealed', 'Unrevealed'],
          REVEALED: ['humbleKeys.state.revealed', 'Revealed'],
          REDEEMED: ['humbleKeys.state.redeemed', 'Redeemed'],
          UNREDEEMABLE: ['humbleKeys.state.unredeemable', 'Expired']
        }
      `
      const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)
      expect(result.violations).toHaveLength(0)
    })

    it('flags a two-string tuple whose first element is NOT key-shaped — the exemption is narrow, not a blanket pair-of-strings hole', () => {
      const source = `
        const labels = {
          windowsOnly: ['Windows only', 'Not available on macOS']
        }
      `
      const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)
      expect(result.violations).toHaveLength(2)
    })
  })

  describe('D-14: repairFailure English fallbacks', () => {
    it('never flags the assigned-then-passed-to-t() title/message fallback — real Game/GameSubMenu/repairFailure.ts:113-121', () => {
      const source = `
        import { TFunction } from 'i18next'

        function reportRepairFailure({
          t
        }: {
          t: TFunction<'gamepage'>
        }): void {
          let title = 'Error'
          let message = 'Repair failed. See the log for details.'
          try {
            title = t('box.error.title', title)
            message = t('box.repair.error', message)
          } catch {
            // keep the hardcoded English fallback -- a throwing \`t\` must still
            // yield a rendered dialog
          }
        }
      `
      const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)
      expect(result.violations).toHaveLength(0)
    })

    it('flags the same fallback literal when the t() reassignment is removed — the exemption is reference-driven, not declaration-shape-driven', () => {
      const source = `
        function reportRepairFailureWithoutFallback(): void {
          let message = 'Repair failed. See the log for details.'
        }
      `
      const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)
      expect(result.violations).toHaveLength(1)
    })
  })

  describe('D-14: bootErrorSurface full-file exemption', () => {
    it('exempts a whole file whose leading comment carries the marker plus a reason — modelled on bootErrorSurface.ts', () => {
      const source = `
        // ${FILE_EXEMPT_MARKER} pre-i18n-boot renderer crash surface -- see bootErrorSurface.ts header
        function renderBootError(context: string, error: unknown): void {
          const message = String(error)
          const el = document.getElementById('root')
          if (el) {
            el.innerHTML =
              'GameLib renderer bootstrap error (' + context + '): ' + message
          }
        }
      `
      const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

      expect(result.fileExempt).toBe(true)
      expect(result.violations).toHaveLength(0)
      expect(result.exempted).toBeGreaterThan(0)
    })

    it('does NOT exempt a bare marker with no explanation — the marker must carry its reason on the same line', () => {
      const source = `
        // ${FILE_EXEMPT_MARKER}
        function renderBootError(context: string, error: unknown): void {
          const message = String(error)
          const el = document.getElementById('root')
          if (el) {
            el.innerHTML =
              'GameLib renderer bootstrap error (' + context + '): ' + message
          }
        }
      `
      const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

      expect(result.fileExempt).toBe(false)
      expect(result.violations.length).toBeGreaterThan(0)
    })
  })

  describe('34.8-08c: declaration-scoped exemption marker', () => {
    it('exempts only the ONE marked top-level statement — a real violation elsewhere in the same file, before or after it, is still flagged, and result.fileExempt stays false', () => {
      const source = `
        const routeError = 'Something went wrong'

        /**
         * ${FILE_EXEMPT_MARKER} 'Wine Default' is a persisted-config fallback sentinel, not rendered directly
         */
        export const defaultWineVersion = {
          bin: '/usr/bin/wine',
          name: 'Wine Default',
          type: 'wine'
        }

        const anotherRealViolation = 'Repair failed. See the log.'
      `
      const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

      expect(result.fileExempt).toBe(false)
      expect(result.violations).toHaveLength(2)
      const violationTexts = result.violations.map((v) => v.text)
      expect(violationTexts).toContain('Something went wrong')
      expect(violationTexts).toContain('Repair failed. See the log.')
      expect(violationTexts).not.toContain('Wine Default')
    })

    it("does NOT exempt a bare marker with no explanation on a non-first statement — the marked declaration's literal is still flagged", () => {
      const source = `
        const routeError = 'Something went wrong'

        /**
         * ${FILE_EXEMPT_MARKER}
         */
        export const defaultWineVersion = {
          bin: '/usr/bin/wine',
          name: 'Wine Default',
          type: 'wine'
        }
      `
      const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

      expect(result.fileExempt).toBe(false)
      const violationTexts = result.violations.map((v) => v.text)
      expect(violationTexts).toContain('Wine Default')
    })

    it("non-regression: the marker on the file's actual FIRST statement still sets result.fileExempt to true, unchanged from the existing whole-file behaviour", () => {
      const source = `
        /**
         * ${FILE_EXEMPT_MARKER} 'Wine Default' is a persisted-config fallback sentinel, not rendered directly
         */
        export const defaultWineVersion = {
          bin: '/usr/bin/wine',
          name: 'Wine Default',
          type: 'wine'
        }

        const anotherRealViolation = 'Repair failed. See the log.'
      `
      const result = scanSource('fixture.ts', source, EMPTY_GLOSSARY)

      expect(result.fileExempt).toBe(true)
      expect(result.violations).toHaveLength(0)
    })
  })

  // ---------------------------------------------------------------------
  // Plan 05: scanScope() whole-scope orchestration + D-18's self-expiring
  // allowlist. Every case below operates on TEMPORARY fixture files written
  // into an fs.mkdtempSync(os.tmpdir()) directory and torn down in
  // afterEach — never on the real deferred files, and nothing is left in
  // the working tree.
  // ---------------------------------------------------------------------
  describe('stale exemption', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'hardcoded-string-gate-stale-'))
    })

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true })
    })

    function writeScope(scopePath: string, files: string[]) {
      writeFileSync(scopePath, JSON.stringify({ files }))
    }

    function writeAllowlist(
      allowlistPath: string,
      entries: Array<{ file: string; expectedCount: number; reason: string }>
    ) {
      writeFileSync(allowlistPath, JSON.stringify(entries))
    }

    // A trivial zero-violation file so scope.files is non-empty without
    // ever overlapping the allowlisted scratch file under test — mirrors
    // the real i18nGateScope.json, which never lists a D-18 deferred file
    // in `files` (only in `excluded.deferred`).
    const NOOP_SOURCE = 'export const noop = () => null\n'

    const THREE_VIOLATIONS_SOURCE = `
      export const Example = () => (
        <div>
          <p>Alpha bravo charlie</p>
          <p>Delta echo foxtrot</p>
          <p>Golf hotel india</p>
        </div>
      )
    `

    it("measured === expected: no stale exemption, the file's violations never reach report.violations, and allowlisted records the match", () => {
      const scratchFile = join(dir, 'Scratch.tsx')
      writeFileSync(scratchFile, THREE_VIOLATIONS_SOURCE)
      const noopFile = join(dir, 'Noop.ts')
      writeFileSync(noopFile, NOOP_SOURCE)

      const scopePath = join(dir, 'scope.json')
      writeScope(scopePath, [noopFile])
      const allowlistPath = join(dir, 'allowlist.json')
      writeAllowlist(allowlistPath, [
        { file: scratchFile, expectedCount: 3, reason: 'test fixture' }
      ])

      const report = scanScope({ scopePath, allowlistPath })

      expect(report.staleExemptions).toEqual([])
      expect(report.violations.some((v) => v.file === scratchFile)).toBe(false)
      expect(report.allowlisted).toEqual([
        { file: scratchFile, measured: 3, expected: 3 }
      ])
    })

    it("D-18's headline behaviour: measured DROPS below expected (the retrofit landed) — stale exemption fires with the exact remediation wording", () => {
      const scratchFile = join(dir, 'Scratch.tsx')
      const retrofitted = `
        import { useTranslation } from 'react-i18next'
        export const Example = () => {
          const { t } = useTranslation()
          return (
            <div>
              <p>{t('gamelib:alpha', 'Alpha bravo charlie')}</p>
              <p>Delta echo foxtrot</p>
              <p>Golf hotel india</p>
            </div>
          )
        }
      `
      writeFileSync(scratchFile, retrofitted)
      const noopFile = join(dir, 'Noop.ts')
      writeFileSync(noopFile, NOOP_SOURCE)

      const scopePath = join(dir, 'scope.json')
      writeScope(scopePath, [noopFile])
      const allowlistPath = join(dir, 'allowlist.json')
      writeAllowlist(allowlistPath, [
        { file: scratchFile, expectedCount: 3, reason: 'test fixture' }
      ])

      const report = scanScope({ scopePath, allowlistPath })

      expect(report.staleExemptions).toEqual([scratchFile])
      expect(formatReport(report)).toContain(
        'stale exemption — remove this entry'
      )
    })

    it('bidirectional proof: measured RISES above expected (a new hardcoded literal was added behind the exemption) — also stale, an exemption is not a place to keep adding strings', () => {
      const scratchFile = join(dir, 'Scratch.tsx')
      const grown = `
        export const Example = () => (
          <div>
            <p>Alpha bravo charlie</p>
            <p>Delta echo foxtrot</p>
            <p>Golf hotel india</p>
            <p>Juliet kilo lima</p>
          </div>
        )
      `
      writeFileSync(scratchFile, grown)
      const noopFile = join(dir, 'Noop.ts')
      writeFileSync(noopFile, NOOP_SOURCE)

      const scopePath = join(dir, 'scope.json')
      writeScope(scopePath, [noopFile])
      const allowlistPath = join(dir, 'allowlist.json')
      writeAllowlist(allowlistPath, [
        { file: scratchFile, expectedCount: 3, reason: 'test fixture' }
      ])

      const report = scanScope({ scopePath, allowlistPath })

      expect(report.staleExemptions).toEqual([scratchFile])
      expect(report.allowlisted[0]).toMatchObject({ measured: 4, expected: 3 })
    })

    it('an allowlist entry pointing at a nonexistent path throws a clear error rather than silently skipping it', () => {
      const noopFile = join(dir, 'Noop.ts')
      writeFileSync(noopFile, NOOP_SOURCE)

      const scopePath = join(dir, 'scope.json')
      writeScope(scopePath, [noopFile])
      const allowlistPath = join(dir, 'allowlist.json')
      writeAllowlist(allowlistPath, [
        {
          file: join(dir, 'DoesNotExist.tsx'),
          expectedCount: 5,
          reason: 'test fixture'
        }
      ])

      expect(() => scanScope({ scopePath, allowlistPath })).toThrow(
        ScopeLoadError
      )
    })
  })

  describe('scope orchestration', () => {
    // 34.8-10: the gate goes BLOCKING here — no advisory grace period (D-12).
    // Plan 34.8-06's whole-scope audit produced a 124-item, fully-triaged
    // backlog; plans 07/08a/08b/08c retrofitted every `retrofit`-dispositioned
    // item (52/52) and closed the `bootErrorSurface.ts` file-exemption (10/10)
    // — see `34.8-AUDIT.md § Closure`, which records zero remaining `retrofit`
    // violations. The 62 residual violations the gate would otherwise report
    // are all `not-user-facing` (60) or `glossary` (2) per that document's
    // `## Triage` — none of them belong in `report.violations` once the
    // scanner itself is correct, which is why the assertion below expects an
    // empty array, not a reduced count.
    it('scans the whole committed scope and finds zero violations outside the allowlist (D-12: blocking, no advisory grace period)', () => {
      const report = scanScope()

      // A gate whose failure output does not tell you which file and line to
      // fix will be worked around rather than fixed — print the full,
      // human-readable report (file, line, column, kind, literal text, and
      // the two remedies) before asserting, so a real CI failure names every
      // offending literal instead of just a bare count.
      if (report.violations.length > 0) {
        console.error(formatReport(report))
      }
      expect(report.violations).toHaveLength(0)

      // D-18: a deferred file's exemption must self-expire the moment its
      // measured count no longer matches what was recorded when it was
      // deferred — surfaced here with the same "stale exemption — remove
      // this entry" guidance `formatReport()`/`StaleExemptionError` use, so
      // nobody has to remember to check `meta/i18nGateAllowlist.json` by hand.
      if (report.staleExemptions.length > 0) {
        console.error(formatReport(report))
      }
      expect(report.staleExemptions).toHaveLength(0)
    })

    // T-34.8-29/T-34.8-30: the gate's own integrity — asserts the scope was
    // genuinely scanned and that neither the allowlist nor the comment-exempt
    // mechanism has grown beyond its recorded, deliberate size. An emptied
    // scope, a widened allowlist, or a second full-file exemption must all
    // fail loudly here rather than silently making the block above pass.
    describe('gate is not disabled', () => {
      it('genuinely scanned something — a zero here would mean an unscanned scope masquerading as a clean one (T-34.8-29)', () => {
        const report = scanScope()
        expect(report.totalCandidates).toBeGreaterThan(0)
      })

      it('scannedFiles matches the committed scope snapshot exactly', () => {
        const report = scanScope()
        const realScope = JSON.parse(
          readFileSync('meta/i18nGateScope.json', 'utf-8')
        ) as { files: string[] }
        expect(report.scannedFiles).toBe(realScope.files.length)
      })

      it('the D-18 allowlist has exactly the two D-17 deferred entries — growing it is a decision, not a way to reach green (T-34.8-30)', () => {
        const allowlist = JSON.parse(
          readFileSync('meta/i18nGateAllowlist.json', 'utf-8')
        ) as Array<{ file: string }>
        expect(allowlist).toHaveLength(2)
        expect(allowlist.map((entry) => entry.file)).toEqual([
          'src/frontend/screens/Login/components/SteamLogin/index.tsx',
          'src/frontend/screens/WebView/useTauriOAuthLogin.ts'
        ])
      })

      it('exactly one file is comment-exempted — a second full-file exemption is a decision, not something to slip in (T-34.8-30)', () => {
        const report = scanScope()
        expect(report.fileExempt).toEqual(['src/frontend/bootErrorSurface.ts'])
      })
    })
  })
})
