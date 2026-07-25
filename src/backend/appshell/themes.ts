/**
 * Custom-themes handler bodies (Phase 34.1 Plan 02, D-07/D-08).
 *
 * Backs `main.ts`'s `getCustomThemes` / `getThemeCSS` / `getCustomCSS`
 * `addHandler` registrations (`main.ts:1513-1539`) with byte-identical
 * bodies, extracted so the Node sidecar can import the same behavior the
 * Electron build runs (single source of truth, D-07). `main.ts` keeps the
 * registration lines as one-line delegations to these exports (D-08).
 *
 * MUST NOT import `electron` (or anything that transitively reaches it) --
 * the Node sidecar imports this module directly (D-09).
 */

import { existsSync, readdirSync, readFileSync } from 'graceful-fs'
import * as path from 'path'

import { GlobalConfig } from '../config'

export async function getCustomThemes(): Promise<string[]> {
  const { customThemesPath } = GlobalConfig.get().getSettings()

  if (!existsSync(customThemesPath)) {
    return []
  }

  return readdirSync(customThemesPath).filter((fileName) =>
    fileName.endsWith('.css')
  )
}

export async function getThemeCSS(theme: string): Promise<string> {
  const { customThemesPath = '' } = GlobalConfig.get().getSettings()

  const cssPath = path.join(customThemesPath, theme)

  if (!existsSync(cssPath)) {
    return ''
  }

  return readFileSync(cssPath, 'utf-8')
}

export async function getCustomCSS(): Promise<string> {
  return GlobalConfig.get().getSettings().customCSS
}
