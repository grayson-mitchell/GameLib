/**
 * App-shell appearance handler bodies (Phase 34.1 Plan 02, D-07/D-08).
 *
 * Backs the sidecar's `appShellFlowRegistration.ts`'s `getLoginBackground`
 * `ipcMain.handle` registration. Custom themes and Custom CSS
 * (`getCustomThemes`/`getThemeCSS`/`getCustomCSS`) were removed in quick
 * 261031-bst. Extracted so the Node sidecar can import the same behavior the
 * Electron build ran (single source of truth, D-07); the registration line is
 * a one-line delegation to this export (D-08).
 *
 * MUST NOT import `electron` (or anything that transitively reaches it) --
 * the Node sidecar imports this module directly (D-09).
 */

import { existsSync, readFileSync } from 'graceful-fs'
import * as path from 'path'

import { GlobalConfig } from '../config'

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
// Kept async because the registration is an `ipcMain.handle` that resolves a
// Promise; the read is synchronous internally.
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
