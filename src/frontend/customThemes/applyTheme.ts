/**
 * Applies a theme key to <body> (Phase 64, D-08). A built-in is its class alone; a custom theme
 * is its base built-in class plus every stored token as an inline custom property on the body
 * (inline properties override `body.<theme>` rules). Only the built-in theme classes are touched,
 * so `isRTL`, `keyboardNav`, `controllerLayout` and any other body class survive a switch.
 */
import type { CustomTheme } from '../../common/types/customTheme'
import { defaultThemes } from '../components/UI/ThemeSelector/themeLabels'
import { resolveThemeKey, type ResolvedTheme } from './customTheme'

let appliedProperties: string[] = []

export function applyTheme(
  body: HTMLElement,
  key: string,
  customs: readonly CustomTheme[],
  fallback: string
): ResolvedTheme {
  for (const name of appliedProperties) body.style.removeProperty(name)
  appliedProperties = []

  for (const themeClass of Object.keys(defaultThemes)) {
    body.classList.remove(themeClass)
  }

  const resolved = resolveThemeKey(key, customs)
  if (resolved.kind === 'builtin') {
    body.classList.add(resolved.key)
  } else if (resolved.kind === 'custom') {
    body.classList.add(resolved.theme.base)
    for (const [name, value] of Object.entries(resolved.theme.tokens)) {
      body.style.setProperty(name, value)
      appliedProperties.push(name)
    }
  } else {
    body.classList.add(fallback)
  }
  return resolved
}
