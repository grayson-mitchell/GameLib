/**
 * Theme-key identity for custom themes (Phase 64, D-08). A theme key is a built-in key
 * (`midnightMirage`, ...) or `custom:<id>`. `resolveThemeKey` is the one resolver that answers
 * "which theme is this" everywhere. Relative imports only so the module stays bundle-safe.
 */
import type { CustomTheme } from '../../common/types/customTheme'
import { BUILTIN_TOKENS, isBuiltInThemeKey } from './builtinTokens'
import { LIVE_DERIVED_TOKENS, NON_COLOUR_TOKENS } from './tokens'
import { normaliseColour } from './colour'
import {
  isValidTokenValue,
  looksLikeGradient,
  type SupportsFn
} from './validate'

/**
 * i18n-gate-exempt: the `custom:` literal is the persisted theme-key prefix, never rendered to a user
 */
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

// The token universe: every key any built-in seed holds plus the live-derived names, minus the
// non-colour tokens. A stored name outside it is dropped, so no arbitrary property reaches
// `body.style` (T-64-11).
const KNOWN_TOKENS: ReadonlySet<string> = new Set(
  [
    ...Object.values(BUILTIN_TOKENS).flatMap((seed) => Object.keys(seed)),
    ...Object.keys(LIVE_DERIVED_TOKENS)
  ].filter((name) => !(NON_COLOUR_TOKENS as readonly string[]).includes(name))
)

const TOKEN_NAME_PATTERN = /^--[a-z0-9-]+$/

/** The canonical stored form of one token value, or null when it must be dropped. */
function cleanTokenValue(
  name: string,
  value: unknown,
  supports?: SupportsFn
): string | null {
  if (typeof value !== 'string' || value.length > MAX_TOKEN_VALUE_LENGTH) {
    return null
  }
  if (!isValidTokenValue(name, value, supports)) return null
  return looksLikeGradient(value) ? value : normaliseColour(value)
}

/**
 * Keeps only the tokens that are well-named, in the known universe and valid, with colours in
 * canonical form. null when `raw` is not a plain object or holds too many tokens. Shared by the
 * parser and by Save, so what is written is what a later boot will keep.
 */
export function cleanTokens(
  raw: unknown,
  supports?: SupportsFn
): Record<string, string> | null {
  if (!isPlainObject(raw)) return null
  const names = Object.keys(raw)
  if (names.length > MAX_TOKENS_PER_THEME) return null
  const kept: Record<string, string> = {}
  for (const name of names) {
    if (!TOKEN_NAME_PATTERN.test(name) || !KNOWN_TOKENS.has(name)) continue
    const value = cleanTokenValue(name, raw[name], supports)
    if (value !== null) kept[name] = value
  }
  return kept
}

/**
 * Total parse of the persisted `customThemes` value: never throws, drops what is malformed and
 * keeps at most MAX_CUSTOM_THEMES in stored (creation) order (T-64-10).
 */
export function parseCustomThemes(
  raw: unknown,
  supports?: SupportsFn
): CustomTheme[] {
  if (!Array.isArray(raw)) return []
  const out: CustomTheme[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    if (out.length >= MAX_CUSTOM_THEMES) break
    try {
      if (!isPlainObject(entry)) continue
      const { id, name, base, tokens } = entry
      if (typeof id !== 'string' || !THEME_ID_PATTERN.test(id)) continue
      if (seen.has(id)) continue
      if (typeof name !== 'string') continue
      if (name.trim() === '' || name.length > MAX_THEME_NAME_LENGTH) continue
      if (typeof base !== 'string' || !isBuiltInThemeKey(base)) continue
      const cleaned = cleanTokens(tokens, supports)
      if (cleaned === null) continue
      seen.add(id)
      out.push({ id, name, base, tokens: cleaned })
    } catch {
      // a hostile entry (throwing getter) is dropped, never fatal at boot
    }
  }
  return out
}

/** Why a theme name is refused, or null when it is acceptable (trimmed, case-insensitive). */
export function validateThemeName(
  name: string,
  others: readonly { id: string; name: string }[],
  selfId?: string
): 'empty' | 'too-long' | 'taken' | null {
  const trimmed = name.trim()
  if (trimmed === '') return 'empty'
  if (trimmed.length > MAX_THEME_NAME_LENGTH) return 'too-long'
  const wanted = trimmed.toLowerCase()
  const clash = others.some(
    (o) => o.id !== selfId && o.name.trim().toLowerCase() === wanted
  )
  return clash ? 'taken' : null
}

/**
 * The first free copy name: `format(null)`, then `format(2)`, `format(3)`... A result over the
 * name limit loses the end of the SOURCE part (found inside the formatted text), never the
 * copy suffix.
 */
export function nextCopyName(
  sourceName: string,
  existingNames: readonly string[],
  format: (n: number | null) => string
): string {
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()))
  const fit = (candidate: string): string => {
    if (candidate.length <= MAX_THEME_NAME_LENGTH) return candidate
    const excess = candidate.length - MAX_THEME_NAME_LENGTH
    const shortened = sourceName
      .slice(0, Math.max(0, sourceName.length - excess))
      .trimEnd()
    return sourceName !== '' && candidate.includes(sourceName)
      ? candidate.replace(sourceName, () => shortened)
      : candidate.slice(0, MAX_THEME_NAME_LENGTH)
  }
  let n: number | null = null
  for (let i = 0; i <= taken.size; i++) {
    const candidate = fit(format(n))
    if (!taken.has(candidate.toLowerCase())) return candidate
    n = n === null ? 2 : n + 1
  }
  return fit(format(n))
}

/** 16 lowercase hex characters from 8 random bytes, regenerated on a collision. */
export function newCustomThemeId(
  existingIds: ReadonlySet<string>,
  random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)
): string {
  for (let attempt = 0; attempt < 64; attempt++) {
    const bytes = new Uint8Array(8)
    random(bytes)
    const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
      ''
    )
    if (THEME_ID_PATTERN.test(id) && !existingIds.has(id)) return id
  }
  throw new Error('newCustomThemeId: no free id after 64 attempts')
}
