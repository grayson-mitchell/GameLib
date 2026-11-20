// Live-gate probe for quick task 261015-n5k (verifies 261015-dlu's `.WebView__embedContainer`
// `grid-template-columns: minmax(0, 1fr)` in the RUNNING app, not the static harness).
//
// Loaded into the main webview from the Web Inspector console with
//   import('/@fs/<repo>/.planning/quick/261015-n5k-.../evidence/probe.js')
// (vite dev serves any workspace file under /@fs/; `tauri dev` applies no CSP).
//
// It installs two globals:
//
//   __gateArm(on)  -- wraps `window.api.storeEmbedTakeNavEvents` (the 250 ms drain in
//                     useStoreEmbedHost.ts) so every non-empty batch carries `loadTimedOut: true`
//                     and an empty batch is replaced by one synthesized event carrying the same
//                     flag. The real hook then sets navState.loadTimedOut and the REAL
//                     StoreEmbedTimeoutBanner renders through the real React/i18n path. No
//                     /etc/hosts edit, no 45 s wait, no sudo. `__gateArm(false)` restores the
//                     original and clears the flag on the next drain.
//
//   __measure(tag) -- reads the live layout with getBoundingClientRect/getComputedStyle and
//                     writes a compact JSON record to document.title (read back from outside the
//                     app via CGWindowList's window name), and to console.log.
//
// Nothing here changes any stylesheet. The only DOM the probe writes is document.title.

;(function () {
  const w = window
  if (!w.__gateProbeInstalled) {
    w.__gateProbeInstalled = true
    const api = w.api
    const original = api.storeEmbedTakeNavEvents.bind(api)
    let armed = false
    let lastSeen = null
    api.storeEmbedTakeNavEvents = async function () {
      const events = await original()
      if (events && events.length) lastSeen = events[events.length - 1]
      if (!armed) return events
      if (events && events.length) {
        return events.map((e) => ({ ...e, loadTimedOut: true }))
      }
      const base = lastSeen || {
        url: 'https://store.epicgames.com/',
        host: 'store.epicgames.com',
        canGoBack: false,
        canGoForward: false
      }
      return [{ ...base, loadTimedOut: true, challenged: false }]
    }
    w.__gateArm = (on) => {
      armed = !!on
      if (!armed) {
        // one explicit clear so the hook sees loadTimedOut:false on the next drain
        const base = lastSeen || {
          url: 'https://store.epicgames.com/',
          host: 'store.epicgames.com',
          canGoBack: false,
          canGoForward: false
        }
        const prev = api.storeEmbedTakeNavEvents
        api.storeEmbedTakeNavEvents = async function () {
          api.storeEmbedTakeNavEvents = prev
          const events = await original()
          return events && events.length
            ? events.map((e) => ({ ...e, loadTimedOut: false }))
            : [{ ...base, loadTimedOut: false, challenged: false }]
        }
      }
      return armed
    }
  }

  const r = (el) => {
    if (!el) return null
    const b = el.getBoundingClientRect()
    return {
      l: +b.left.toFixed(2),
      r: +b.right.toFixed(2),
      w: +b.width.toFixed(2),
      t: +b.top.toFixed(2),
      h: +b.height.toFixed(2)
    }
  }

  w.__measure = (tag) => {
    const q = (s) => document.querySelector(s)
    const container = q('.WebView__embedContainer')
    const row = q('.WebView__embedNoticeRow')
    const msg = q('.WebView__embedNoticeRow-message')
    const actions = q('.WebView__embedNoticeRow-actions')
    const btns = Array.from(document.querySelectorAll('.WebView__embedNoticeRow-action'))
    const content = q('.App .content') || q('.content')
    const app = q('.App')
    const vw = document.documentElement.clientWidth
    const out = {
      tag,
      vw,
      iw: w.innerWidth,
      dpr: w.devicePixelRatio,
      hash: location.hash,
      app: app ? r(app) : null,
      appCols: app ? getComputedStyle(app).gridTemplateColumns : null,
      content: r(content),
      container: r(container),
      containerCols: container ? getComputedStyle(container).gridTemplateColumns : null,
      row: r(row),
      msg: msg
        ? {
            ...r(msg),
            sw: msg.scrollWidth,
            cw: msg.clientWidth,
            ellipsised: msg.scrollWidth > msg.clientWidth,
            text: msg.textContent
          }
        : null,
      actions: r(actions),
      btns: btns.map((b) => ({ label: b.textContent, ...r(b) })),
      // The E3 contract: the actions may not clip. Clipped == any action's right edge lies past
      // the container's right edge OR past the viewport.
      actionsClipped:
        actions && container
          ? actions.getBoundingClientRect().right > container.getBoundingClientRect().right + 0.5 ||
            actions.getBoundingClientRect().right > vw + 0.5
          : null,
      bannerPresent: !!row
    }
    const json = JSON.stringify(out)
    // document.title does NOT reach the native window title under Tauri (measured: CGWindowList
    // kept reporting "GameLib"); the readable channels are the console and gamelib.log.
    console.log('GATE ' + json)
    if (w.api && typeof w.api.logInfo === 'function') w.api.logInfo('GATE ' + json)
    return out
  }

  w.__measure('probe-installed')
})()
