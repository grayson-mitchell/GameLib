import { humbleLoginChromeCssForUrl } from 'common/humble/loginChromeCss'

/**
 * Narrow structural type for the `<webview>` this helper attaches to (quick task 260822-di1,
 * Task 3) -- deliberately NOT `Electron.WebviewTag`, so a plain object built in a
 * node-environment jest project (no jsdom/Electron installed) can stand in for it here.
 */
export interface HumbleLoginChromeCssWebview {
  getURL(): string
  insertCSS(css: string): Promise<string>
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}

/**
 * Wires `dom-ready` -> `insertCSS` on `webview` so Humble's marketing footer AND its
 * `.simple-navbar` logo band (260822-eib) are hidden on the Electron login surface, mirroring
 * the Tauri side's `login_chrome_css_script` (D-1's fail-safe rationale: CSS hiding over DOM
 * surgery, because a page re-skin that stops matching either selector renders unchanged
 * instead of breaking, and the two rules fail independently of each other).
 *
 * Re-applies on EVERY `dom-ready`, deliberately without an idempotence guard: Electron drops
 * inserted CSS on every navigation, so the Google SSO round trip back to humblebundle.com must
 * re-apply it, and idempotence here would be a bug, not a safety net (unlike the Tauri side's
 * `window.__GAMELIB_LOGIN_CHROME_CSS__` flag, which exists because `initialization_script`
 * re-runs once per navigation on a document that has NOT had its styles wiped).
 *
 * `insertCSS` targets the webview's main frame only, which is why this side needs no
 * `window.top !== window` equivalent -- the Tauri side does, because `initialization_script`
 * runs in every frame and spike 013 measured 5 of 8 navigation events on Humble's real login
 * page as third-party iframes.
 *
 * Returns a cleanup function that removes the SAME listener reference that was added.
 */
export function attachHumbleLoginChromeCss(
  webview: HumbleLoginChromeCssWebview
): () => void {
  const onDomReady = () => {
    let url: string
    try {
      url = webview.getURL()
    } catch {
      return undefined
    }

    const css = humbleLoginChromeCssForUrl(url)
    if (css === null) {
      return undefined
    }

    try {
      void webview.insertCSS(css).catch(() => undefined)
    } catch {
      return undefined
    }
    return undefined
  }

  webview.addEventListener('dom-ready', onDomReady)

  return () => {
    webview.removeEventListener('dom-ready', onDomReady)
  }
}
