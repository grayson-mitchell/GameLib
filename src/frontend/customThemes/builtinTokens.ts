/**
 * Typed access to the generated, frozen token map of each built-in theme
 * (D-10/D-11). The JSON is produced by `pnpm gen:theme-tokens` from
 * `themes.scss` and `_colors.scss`; never edit it by hand. Relative imports
 * only so the module stays bundle-safe.
 */
import { defaultThemes } from '../components/UI/ThemeSelector/themeLabels'
import seeds from './builtinTokens.generated.json'

export const BUILTIN_TOKENS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = seeds

/** Own-property check, so `constructor` or `__proto__` are not theme keys. */
export const isBuiltInThemeKey = (key: string): boolean =>
  Object.prototype.hasOwnProperty.call(defaultThemes, key)

/** The frozen seed for a built-in theme, or undefined for any other key. */
export const builtinSeed = (
  key: string
): Readonly<Record<string, string>> | undefined =>
  Object.prototype.hasOwnProperty.call(BUILTIN_TOKENS, key)
    ? BUILTIN_TOKENS[key]
    : undefined
