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
 * WR-04 (Phase 34.1 code review): child-window labels must survive a renderer reload.
 *
 * `externalWindowCounter` is module state in the RENDERER bundle, but child
 * `WebviewWindow`s are separate OS windows that OUTLIVE a main-window reload (F5,
 * devtools reload, `location.reload()`). After a reload the counter restarted at 0, so
 * the next `createNewWindow` requested the already-taken label `external-1`, Tauri
 * rejected it, and the only symptom was a `tauri://error` `console.warn` -- from the
 * user's side, clicking a ProtonDB / AppleWiki / AreWeAntiCheatYet link simply did
 * nothing.
 *
 * The timestamp+random suffix makes collisions independent of renderer lifetime while
 * keeping the two properties T-34.1-27 depends on: the label is NEVER derived from the
 * caller-supplied url, and it can never equal `main` or `about` (the `external-` prefix
 * is fixed and neither reserved label starts with it), so these windows continue to
 * match NO capability and receive ZERO Tauri command access.
 */
function nextExternalWindowLabel(): string {
  externalWindowCounter += 1
  const entropy = Math.random().toString(36).slice(2, 8)
  return `external-${Date.now()}-${externalWindowCounter}-${entropy}`
}

/**
 * Opens `url` in a new, unprivileged child window. Labels are generated, never derived
 * from the url -- a url-derived label could otherwise be crafted to collide with `main`
 * or `about` and inherit their capability grants (T-34.1-27).
 */
export const tauriCreateNewWindow = (url: string): void => {
  try {
    const win = new WebviewWindow(nextExternalWindowLabel(), {
      url,
      width: 1200,
      height: 700,
      resizable: true,
      center: true
      // WR-07 (Phase 34.1 code review): NO hard-coded `title` here, deliberately.
      //
      // This window loads renderer-SUPPLIED REMOTE content. Titling it 'GameLib'
      // presented an attacker-controlled page under the app's own name -- a phishing
      // affordance that Electron's equivalent (`new BrowserWindow(...).loadURL(url)`,
      // main.ts:797-799) did not have, because there the remote page's own `<title>`
      // showed. Omitting `title` restores that Electron behaviour: Tauri falls back to
      // the loaded document's own title. Do not "fix" this by adding a title back.
    })
    // WR-06: `once()` returns a promise; float it explicitly rather than leaving a
    // floating rejection for `bootErrorSurface` to downgrade.
    void win
      .once('tauri://error', (event) => warn('createNewWindow', event))
      .catch((error) => warn('createNewWindow:once', error))
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

/**
 * WR-06 (Phase 34.1 code review): how long the About window may wait on the sidecar.
 *
 * `getHeroicVersion()` is a `sidecar_invoke` round-trip bounded by `INVOKE_TIMEOUT`
 * (60s, `src-tauri/src/main.rs`). Awaiting it UNBOUNDED before constructing the window
 * meant that with a slow or wedged sidecar the About menu item appeared to do nothing
 * for up to a minute and then opened. The version string is cosmetic; the window is
 * not. One second is far longer than a healthy round-trip and far shorter than a
 * user-visible hang.
 */
const ABOUT_VERSION_TIMEOUT_MS = 1000

async function resolveAboutVersion(): Promise<string> {
  try {
    return await Promise.race([
      window.api.getHeroicVersion(),
      new Promise<string>((resolve) => setTimeout(() => resolve('unknown'), ABOUT_VERSION_TIMEOUT_MS))
    ])
  } catch (error) {
    warn('showAboutWindow:getHeroicVersion', error)
    return 'unknown'
  }
}

async function showAboutWindowAsync(): Promise<void> {
  const existing = await WebviewWindow.getByLabel('about')
  if (existing) {
    await existing.setFocus()
    return
  }

  const version = await resolveAboutVersion()

  const win = new WebviewWindow('about', {
    url: 'about.html?v=' + encodeURIComponent(version),
    width: 420,
    height: 380,
    resizable: false,
    center: true,
    // Unlike `tauriCreateNewWindow` above, a hard-coded title is CORRECT here: this
    // window loads the static, first-party, capability-free `public/about.html`, not
    // renderer-supplied remote content, so WR-07's phishing concern does not apply.
    title: 'About GameLib'
  })
  // WR-06: float the `once()` promise explicitly (see tauriCreateNewWindow).
  void win
    .once('tauri://error', (event) => warn('showAboutWindow', event))
    .catch((error) => warn('showAboutWindow:once', error))
}
