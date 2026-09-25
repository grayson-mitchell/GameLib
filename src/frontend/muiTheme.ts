import { createTheme, Theme } from '@mui/material/styles'

/**
 * Single app-wide MUI theme factory (quick task 260926-bil, closing
 * `.planning/todos/completed/2026-09-26-disabled-mui-inputs-render-black-in-dark-themes.md`).
 *
 * Why this palette exists: `src/frontend/App.tsx` used to call `createTheme`
 * with NO `palette` key. With no `palette.mode`, MUI 5.17.1 defaults to
 * LIGHT mode, which emits `palette.text.disabled = rgba(0,0,0,0.38)` and
 * `palette.action.disabled = rgba(0,0,0,0.26)` -- both near-black. Every
 * disabled MUI input in every GameLib theme (dark or light) painted its
 * text/icon in that colour, most visibly the Steam install dialog's
 * read-only "Windows" platform row.
 *
 * Why ONLY `text.disabled` and `action.disabled` are set here, and nothing
 * else (no `mode`, `primary`, `secondary`, ...): MUI 5.17.1 emits these two
 * keys VERBATIM -- no `alpha()`/`darken()`/`lighten()`/etc. colour maths is
 * ever run on them, confirmed by reading the component sources directly:
 *   - InputBase.js:81 root `&.Mui-disabled { color: palette.text.disabled }`
 *   - InputBase.js:176 input `&.Mui-disabled { WebkitTextFillColor: palette.text.disabled }`
 *     (MUI Select's display div carries the `MuiInputBase-input` class, so
 *     this is what paints a disabled SelectField's selected-value text; the
 *     FontAwesome SvgIcon beside it inherits `currentColor` from the root)
 *   - FormLabel.js:54, FormControlLabel.js -> palette.text.disabled
 *   - OutlinedInput.js:61 (outline), Button.js:118/122, Checkbox.js:62,
 *     NativeSelectInput.js -> palette.action.disabled
 * Other palette keys (`primary`, `secondary`, ...) go through `augmentColor`,
 * which DOES run colour maths and would throw on a `var(...)` string -- so
 * they are deliberately left unset. `muiTheme.test.ts`'s "colour-maths
 * ratchet" describe block re-scans the installed `@mui/material` package on
 * every test run and fails the build if a future upgrade starts running
 * colour maths on either of these two keys (T-260926bil-01 in the plan's
 * threat_model).
 *
 * Why `--text-secondary`: defined in the base `body {}` block of
 * `src/frontend/themes.scss` (line 3) and overridden per-theme (including
 * `nord-light`, a LIGHT theme, at line 384), so it resolves in every theme
 * with no fallback needed. `--text-tertiary` was considered and rejected --
 * it is #101111 (near-black) in the `classic` theme, which would reproduce
 * this exact bug.
 *
 * Why `--icon-disabled` has a `var(..., var(--text-secondary))` fallback:
 * it is a theme-authored disabled colour, but only `midnightMirage`,
 * `classic`/`cyberSpaceOasis`(Alt) and `gruvbox_dark` define it -- the
 * fallback covers every other theme.
 *
 * Why no `palette.mode`: `nord-light` is a light theme; the rest are dark.
 * A single hard-coded mode would be wrong for at least one theme, and MUI's
 * mode switch also changes unrelated defaults beyond these two keys.
 */
export const MUI_DISABLED_TEXT = 'var(--text-secondary)'
export const MUI_DISABLED_ACTION = 'var(--icon-disabled, var(--text-secondary))'

export function buildMuiTheme(isRTL: boolean): Theme {
  return createTheme({
    direction: isRTL ? 'rtl' : 'ltr',
    typography: {
      fontFamily: 'var(--primary-font-family)'
    },
    palette: {
      text: {
        disabled: MUI_DISABLED_TEXT
      },
      action: {
        disabled: MUI_DISABLED_ACTION
      }
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            color: 'var(--text-default)',
            backgroundColor: 'var(--background)'
          }
        }
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            fontSize: 'var(--text-md)',
            backgroundColor: 'var(--background-darker)',
            color: 'var(--text-primary)',
            padding: 'var(--space-md)',
            borderRadius: 'var(--space-sm)',
            maxWidth: '350px'
          }
        }
      }
    }
  })
}
