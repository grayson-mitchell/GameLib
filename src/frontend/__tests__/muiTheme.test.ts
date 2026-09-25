/**
 * Pins `buildMuiTheme` (quick task 260926-bil, closing
 * `.planning/todos/completed/2026-09-26-disabled-mui-inputs-render-black-in-dark-themes.md`).
 *
 * Root cause: `src/frontend/App.tsx` used to call `createTheme` with no
 * `palette` key, so MUI 5.17.1 fell back to its LIGHT-mode defaults for
 * `palette.text.disabled` (rgba(0,0,0,0.38)) and `palette.action.disabled`
 * (rgba(0,0,0,0.26)) -- both near-black, painted verbatim onto disabled
 * inputs in every GameLib theme, dark or light.
 *
 * This file has two describe blocks:
 * - `buildMuiTheme` pins the factory's shape (this task, Task 1).
 * - `MUI disabled-key colour-maths ratchet` (Task 2) proves the fix's
 *   precondition -- that MUI 5.17.1 emits `palette.text.disabled` /
 *   `palette.action.disabled` VERBATIM, with no `alpha()`/`darken()`/etc.
 *   colour maths applied -- stays true across a future `@mui/material`
 *   upgrade. A var() string survives verbatim emission; it would THROW if
 *   MUI ever ran colour maths on it (see the DoS threat entry in the plan's
 *   threat_model, T-260926bil-01).
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import {
  buildMuiTheme,
  MUI_DISABLED_TEXT,
  MUI_DISABLED_ACTION
} from '../muiTheme'

const APP_TSX_SOURCE = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8')
const MUI_THEME_SOURCE = readFileSync(
  join(__dirname, '..', 'muiTheme.ts'),
  'utf8'
)

describe('buildMuiTheme', () => {
  it('exports the disabled-colour constants as pure var() strings (no colour literal)', () => {
    expect(MUI_DISABLED_TEXT).toBe('var(--text-secondary)')
    expect(MUI_DISABLED_ACTION).toBe(
      'var(--icon-disabled, var(--text-secondary))'
    )
    for (const value of [MUI_DISABLED_TEXT, MUI_DISABLED_ACTION]) {
      expect(value).not.toContain('rgba(')
      expect(value).not.toContain('rgb(')
      expect(value).not.toContain('#')
    }
  })

  it('palette.text.disabled / palette.action.disabled resolve to the exported constants AND the literal var() strings', () => {
    const theme = buildMuiTheme(false)
    // Compared against the exported constants AND the literal strings so a
    // constant edit alone cannot silently pass this test.
    expect(theme.palette.text.disabled).toBe(MUI_DISABLED_TEXT)
    expect(theme.palette.text.disabled).toBe('var(--text-secondary)')
    expect(theme.palette.action.disabled).toBe(MUI_DISABLED_ACTION)
    expect(theme.palette.action.disabled).toBe(
      'var(--icon-disabled, var(--text-secondary))'
    )
  })

  it('carries no colour literal in the disabled palette values', () => {
    const theme = buildMuiTheme(false)
    for (const value of [
      theme.palette.text.disabled,
      theme.palette.action.disabled
    ]) {
      expect(value).not.toContain('rgba(')
      expect(value).not.toContain('rgb(')
      expect(value).not.toContain('#')
    }
  })

  it('direction follows the isRTL argument', () => {
    expect(buildMuiTheme(true).direction).toBe('rtl')
    expect(buildMuiTheme(false).direction).toBe('ltr')
  })

  it('preserves the pre-existing MuiPaper root styleOverrides verbatim (regression pin for the App.tsx move)', () => {
    const theme = buildMuiTheme(false)
    expect(theme.components?.MuiPaper?.styleOverrides?.root).toEqual({
      color: 'var(--text-default)',
      backgroundColor: 'var(--background)'
    })
  })

  it('preserves the pre-existing MuiTooltip tooltip styleOverrides verbatim (regression pin for the App.tsx move)', () => {
    const theme = buildMuiTheme(false)
    expect(theme.components?.MuiTooltip?.styleOverrides?.tooltip).toEqual({
      fontSize: 'var(--text-md)',
      backgroundColor: 'var(--background-darker)',
      color: 'var(--text-primary)',
      padding: 'var(--space-md)',
      borderRadius: 'var(--space-sm)',
      maxWidth: '350px'
    })
  })

  it('typography.fontFamily is unchanged', () => {
    const theme = buildMuiTheme(false)
    expect(theme.typography.fontFamily).toBe('var(--primary-font-family)')
  })

  it('does not set palette.mode -- nord-light is a light theme; the rest are dark; a fixed mode is wrong for at least one', () => {
    const theme = buildMuiTheme(false)
    // MUI's own default when no `mode` is requested is 'light'. Asserting
    // this pins the ABSENCE of an explicit mode choice, not an intentional
    // 'light' selection.
    expect(theme.palette.mode).toBe('light')

    // Source-text check: `mode` must not appear as a palette key anywhere
    // in muiTheme.ts, comments stripped, so a future edit can't reintroduce
    // a hard-coded mode and still pass the runtime assertion above by
    // coincidence (MUI's default happens to also be 'light').
    const stripped = stripSourceComments(MUI_THEME_SOURCE)
    expect(stripped).not.toMatch(/\bmode\s*:/)
  })

  it('App.tsx builds its theme only via buildMuiTheme(isRTL) -- no inline createTheme call remains', () => {
    const stripped = stripSourceComments(APP_TSX_SOURCE)
    expect(stripped).toMatch(/buildMuiTheme\(isRTL\)/)
    expect(stripped).not.toMatch(/\bcreateTheme\(/)
  })
})

describe('MUI disabled-key colour-maths ratchet (Task 2)', () => {
  const muiPackageJsonPath = require.resolve('@mui/material/package.json')
  const muiRoot = dirname(muiPackageJsonPath)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const muiVersion: string = require(muiPackageJsonPath).version

  /** Top-level component directories only -- skip umd/, legacy/, modern/, node/ and esm duplicates. */
  function collectComponentJsFiles(): string[] {
    const out: string[] = []
    for (const entry of readdirSync(muiRoot)) {
      if (
        ['umd', 'legacy', 'modern', 'node', 'esm', 'node_modules'].includes(
          entry
        )
      ) {
        continue
      }
      const dirPath = join(muiRoot, entry)
      let stat
      try {
        stat = statSync(dirPath)
      } catch {
        continue
      }
      if (!stat.isDirectory()) continue
      for (const file of readdirSync(dirPath)) {
        if (file === `${entry}.js`) {
          out.push(join(dirPath, file))
        }
      }
    }
    return out
  }

  it(`consumer sites still exist against installed @mui/material@${muiVersion}: InputBase/FormLabel reference palette.text.disabled; OutlinedInput/Button/Checkbox reference palette.action.disabled`, () => {
    const textDisabledSites = [
      join(muiRoot, 'InputBase', 'InputBase.js'),
      join(muiRoot, 'FormLabel', 'FormLabel.js')
    ]
    const actionDisabledSites = [
      join(muiRoot, 'OutlinedInput', 'OutlinedInput.js'),
      join(muiRoot, 'Button', 'Button.js'),
      join(muiRoot, 'Checkbox', 'Checkbox.js')
    ]
    for (const file of textDisabledSites) {
      const source = readFileSync(file, 'utf8')
      expect(source).toMatch(/palette\.text\.disabled/)
    }
    for (const file of actionDisabledSites) {
      const source = readFileSync(file, 'utf8')
      expect(source).toMatch(/palette\.action\.disabled/)
    }
  })

  it(`no colour maths is run on palette.text.disabled or palette.action.disabled anywhere in @mui/material@${muiVersion}'s component sources`, () => {
    const files = collectComponentJsFiles()
    // Guards against a wrong glob passing vacuously (the green-check-proving-nothing
    // pattern CLAUDE.md warns about).
    expect(files.length).toBeGreaterThan(50)

    const colourMathsFn =
      /(alpha|darken|lighten|emphasize|decomposeColor|getContrastRatio|getLuminance)\([^)]*(text|action)\.disabled/

    const offenders: string[] = []
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, idx) => {
        if (colourMathsFn.test(line)) {
          offenders.push(`${file}:${idx + 1}: ${line.trim()}`)
        }
      })
    }

    if (offenders.length > 0) {
      throw new Error(
        `@mui/material@${muiVersion} now runs colour maths on palette.text.disabled ` +
          'or palette.action.disabled -- a var() palette string in src/frontend/muiTheme.ts ' +
          `would now THROW at render (T-260926bil-01). Offending line(s):\n${offenders.join('\n')}`
      )
    }
  })

  it('the ratchet regex is provably able to fail: it flags a synthetic colour-maths call on a disabled key', () => {
    const colourMathsFn =
      /(alpha|darken|lighten|emphasize|decomposeColor|getContrastRatio|getLuminance)\([^)]*(text|action)\.disabled/
    expect(
      colourMathsFn.test('color: alpha(theme.palette.action.disabled, 0.5)')
    ).toBe(true)
  })

  it('buildMuiTheme(false) does not throw with var() disabled values', () => {
    expect(() => buildMuiTheme(false)).not.toThrow()
  })
})
