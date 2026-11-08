/**
 * Routes external link clicks to the validated `openExternalUrl` channel.
 *
 * tauri-plugin-opener injects `init-iife.js`, a click listener that calls
 * `plugin:opener|open_url` for `<a target=_blank>` and ctrl/meta/shift-clicks.
 * That needs the `opener:default` grant, which Phase 72 D-10 removed (it was a
 * direct webview path to the OS opener that bypassed every check). The plugin
 * is registered with `open_js_links_on_click(false)` and this handler replaces
 * the script, so changelog links keep opening through the sidecar's
 * `assertOpenableExternalUrl`, which stays the enforcing check. This handler
 * is routing only.
 */
const ROUTED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

const installed = new WeakSet<object>()

export function installExternalLinkClickHandler(
  target: Document = document
): void {
  if (installed.has(target)) return
  installed.add(target)

  target.addEventListener('click', (event: MouseEvent) => {
    if (event.defaultPrevented) return
    const source = event.target
    if (!source || typeof (source as Element).closest !== 'function') return
    const anchor = (source as Element).closest('a')
    if (!anchor) return

    let url: URL
    try {
      url = new URL(anchor.href)
    } catch {
      return
    }
    if (!ROUTED_PROTOCOLS.has(url.protocol)) return

    const modified = event.ctrlKey || event.metaKey || event.shiftKey
    if (anchor.target !== '_blank' && !modified) return

    event.preventDefault()
    void window.api.openExternalUrl(url.href)
  })
}
