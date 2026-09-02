/**
 * Custom-themes handler bodies (Phase 34.1 Plan 02, D-07/D-08).
 *
 * Backs the sidecar's `appShellFlowRegistration.ts`'s `getCustomThemes` /
 * `getThemeCSS` / `getCustomCSS` / `getLoginBackground` `ipcMain.handle`
 * registrations with byte-identical bodies, extracted so the Node sidecar can
 * import the same behavior the Electron build runs (single source of truth,
 * D-07). The registration lines are one-line delegations to these exports
 * (D-08).
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

/**
 * Extensions we are willing to inline as a Manage Accounts background, mapped
 * to the MIME type the `data:` URL needs. Anything else returns '' rather than
 * guessing a type -- an unrecognised extension is far more likely to be a
 * mis-pick than an image we should try to render.
 */
const LOGIN_BACKGROUND_MIME_BY_EXTENSION: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
}

/**
 * Reads the user-selected Manage Accounts (Login) screen background and
 * returns it as a `data:` URL, or '' when no custom image is configured or the
 * configured one cannot be read. '' means "use the bundled default artwork",
 * which is what the renderer falls back to.
 *
 * A `data:` URL rather than `file://` is what makes this work in BOTH shells:
 * the Tauri build serves the UI from `tauri://localhost` and has no asset
 * protocol configured (`src-tauri/tauri.conf.json` sets no `assetProtocol`),
 * so a `file://` image source is blocked there. Inlining the bytes sidesteps
 * the scheme entirely. Backgrounds are read once per Login mount, so the
 * base64 inflation (~4/3 of file size) is not on any hot path.
 */
// Kept async to match the addHandler signature of the sibling
// getCustomThemes/getThemeCSS/getCustomCSS exports in this file; the read is
// synchronous internally.
// eslint-disable-next-line @typescript-eslint/require-await
export async function getLoginBackground(): Promise<string> {
  const { loginBackgroundPath } = GlobalConfig.get().getSettings()

  if (!loginBackgroundPath || !existsSync(loginBackgroundPath)) {
    return ''
  }

  const mimeType =
    LOGIN_BACKGROUND_MIME_BY_EXTENSION[
      path.extname(loginBackgroundPath).toLowerCase()
    ]
  if (!mimeType) {
    return ''
  }

  try {
    const bytes = readFileSync(loginBackgroundPath)
    return `data:${mimeType};base64,${bytes.toString('base64')}`
  } catch {
    // Unreadable (permissions, a directory, a file deleted since it was
    // picked) -- fall back to the bundled default rather than failing the
    // whole Login screen.
    return ''
  }
}
