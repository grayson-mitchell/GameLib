/**
 * Theme-key identity for custom themes (Phase 64, D-08). A theme key is a built-in key
 * (`midnightMirage`, ...) or `custom:<id>`. `resolveThemeKey` is the one resolver that answers
 * "which theme is this" everywhere. Relative imports only so the module stays bundle-safe.
 */
import type { CustomTheme } from '../../common/types/customTheme'
import { isBuiltInThemeKey } from './builtinTokens'
import type { SupportsFn } from './validate'

export const CUSTOM_THEME_PREFIX = 'custom:'
export const DEFAULT_THEME_KEY = 'midnightMirage'

export const MAX_CUSTOM_THEMES = 50
export const MAX_THEME_NAME_LENGTH = 60
export const MAX_TOKENS_PER_THEME = 256
export const MAX_TOKEN_VALUE_LENGTH = 512
export const THEME_ID_PATTERN = /^[0-9a-f]{16}$/

export const customThemeKey = (id: string): string =>
  `${CUSTOM_THEME_PREFIX}${id}`

export type ResolvedTheme =
  | { kind: 'builtin'; key: string }
  | { kind: 'custom'; theme: CustomTheme }
  | { kind: 'unknown'; key: string }

export function resolveThemeKey(
  key: string,
  customs: readonly CustomTheme[]
): ResolvedTheme {
  if (isBuiltInThemeKey(key)) return { kind: 'builtin', key }
  if (key.startsWith(CUSTOM_THEME_PREFIX)) {
    const id = key.slice(CUSTOM_THEME_PREFIX.length)
    const theme = customs.find((c) => c.id === id)
    if (theme) return { kind: 'custom', theme }
  }
  return { kind: 'unknown', key }
}

/** A frozen copy: a NEW tokens object, the original built-in base kept (D-08). */
export function makeCopy(
  source: { base: string; tokens: Readonly<Record<string, string>> },
  id: string,
  name: string
): CustomTheme {
  return { id, name, base: source.base, tokens: { ...source.tokens } }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** First structural pass: never throws; anything malformed is dropped. */
export function parseCustomThemes(
  raw: unknown,
  _supports?: SupportsFn
): CustomTheme[] {
  if (!Array.isArray(raw)) return []
  const out: CustomTheme[] = []
  for (const entry of raw) {
    try {
      if (!isPlainObject(entry)) continue
      const { id, name, base, tokens } = entry
      if (typeof id !== 'string' || typeof name !== 'string') continue
      if (typeof base !== 'string' || !isBuiltInThemeKey(base)) continue
      if (!isPlainObject(tokens)) continue
      const kept: Record<string, string> = {}
      for (const [k, v] of Object.entries(tokens)) {
        if (typeof v === 'string') kept[k] = v
      }
      out.push({ id, name, base, tokens: kept })
    } catch {
      // a hostile entry (throwing getter) is dropped, never fatal at boot
    }
  }
  return out
}

export function validateThemeName(
  _name: string,
  _others: readonly { id: string; name: string }[],
  _selfId?: string
): 'empty' | 'too-long' | 'taken' | null {
  return null
}

export function nextCopyName(
  _sourceName: string,
  _existingNames: readonly string[],
  format: (n: number | null) => string
): string {
  return format(null)
}

export function newCustomThemeId(
  _existingIds: ReadonlySet<string>,
  _random: (b: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)
): string {
  return ''
}
