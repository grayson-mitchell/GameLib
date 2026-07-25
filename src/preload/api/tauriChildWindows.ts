/**
 * Tauri renderer-side child windows (Phase 34.1 Plan 07, D-12).
 *
 * `createNewWindow` and `showAboutWindow` become genuine Tauri `WebviewWindow`s here.
 * This is RENDERER-SIDE by structural necessity, not preference: `WebviewWindow`'s
 * constructor is a webview-context-only JS API (`@tauri-apps/api/webviewWindow`) that
 * the headless Node sidecar cannot call at all -- there is no sidecar arm to route
 * through. D-03's enumerated sidecar-seam list does not name either channel, so this
 * does not contradict it.
 *
 * Fail-closed by design: `src-tauri/capabilities/default.json` scopes its grants to
 * `"windows": ["main"]`. Every window this module creates is labelled `about` or
 * `external-<n>` (NEVER `main`, NEVER derived from the caller-supplied URL), so those
 * windows match NO capability and receive ZERO Tauri command access -- load-bearing
 * because `createNewWindow` loads renderer-SUPPLIED REMOTE content and Tauri provides
 * no `<webview>` isolation boundary of its own.
 *
 * Explicitly NOT implemented here: the `<webview>` login story (navigation
 * interception, OAuth redirect capture, session/cookie access for Epic/GOG/Amazon/
 * Humble logins). That is Phase 34.4's -- it has a real flow
 * (`humbleStartLogin`/`humbleLoginNavigated`) to design against; designing it here,
 * against no consumer, would build the wrong abstraction. Phase 33 D-09 already
 * recorded `session` as an accepted gap.
 *
 * Both exports are TOTAL -- wrapped in try/catch and console.warn on failure -- because
 * they are reached from `window.api` in response to a user click (a reference link, the
 * About menu item); a throw there is a user-visible failure for what should be a
 * harmless action.
 */
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'

function warn(label: string, error: unknown): void {
  console.warn(`[tauriChildWindows] ${label} failed:`, error)
}

let externalWindowCounter = 0

/**
 * Opens `url` in a new, unprivileged child window. Labels are a monotonic counter,
 * never derived from the url -- a url-derived label could otherwise be crafted to
 * collide with `main` or `about` and inherit their capability grants (T-34.1-27).
 */
export const tauriCreateNewWindow = (url: string): void => {
  try {
    externalWindowCounter += 1
    const label = `external-${externalWindowCounter}`
    const win = new WebviewWindow(label, {
      url,
      width: 1200,
      height: 700,
      resizable: true,
      center: true,
      title: 'GameLib'
    })
    win.once('tauri://error', (event) => warn('createNewWindow', event))
  } catch (error) {
    warn('createNewWindow', error)
  }
}

/**
 * Opens (or refocuses) the single About window. Tauri has no native about panel
 * (unlike Electron's `app.showAboutPanel()`), which is exactly why this is a real
 * window backed by the static, capability-free `public/about.html`.
 */
export const tauriShowAboutWindow = (): void => {
  void showAboutWindowAsync().catch((error) => warn('showAboutWindow', error))
}

async function showAboutWindowAsync(): Promise<void> {
  const existing = await WebviewWindow.getByLabel('about')
  if (existing) {
    await existing.setFocus()
    return
  }

  let version = 'unknown'
  try {
    version = await window.api.getHeroicVersion()
  } catch (error) {
    warn('showAboutWindow:getHeroicVersion', error)
  }

  const win = new WebviewWindow('about', {
    url: 'about.html?v=' + encodeURIComponent(version),
    width: 420,
    height: 380,
    resizable: false,
    center: true,
    title: 'About GameLib'
  })
  win.once('tauri://error', (event) => warn('showAboutWindow', event))
}
