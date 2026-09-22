/**
 * Blank-launch diagnostic — debug session `packaged-blank-render`, todo
 * `2026-09-17-packaged-app-renders-blank-on-roughly-one-launch-in-four`.
 *
 * i18n-gate-exempt: emits diagnostic text to the backend log, never to the UI.
 *
 * ## What this exists to catch, and why nothing else can
 *
 * The packaged `.app` intermittently shows nothing but the theme background. Measured
 * 2026-09-23 on a blank launch (1 in 34), the shape is NOT the one the todo assumed:
 *
 *   - `GlobalState.componentDidMount` RAN — the log carries its `[refreshLibrary]
 *     origin=mount` and `frontendReady` — so React committed a tree;
 *   - one second later `#root` was `1280.00x0.00` with NO children and no `.App`.
 *
 * The tree mounted and was then REMOVED. Nothing in the app reports that. `bootErrorSurface`
 * deliberately bails to `console.error` once `#root` has children (it exists for the
 * pre-mount case), the Tauri release webview has no devtools, and nothing forwards the
 * webview console anywhere — so on a release build the whole event is invisible.
 *
 * So this module logs, through `window.api.logInfo` (the only channel out of a packaged
 * webview, and one proven to still work in the failure mode):
 *   1. every `error` / `unhandledrejection`, with text and stack, post-mount included;
 *   2. the exact moment `#root` loses its children, which is the event to correlate with;
 *   3. a geometry sample at a few fixed points, so a blank launch carries its own
 *      `getBoundingClientRect()` evidence with no operator present.
 *
 * Healthy launches emit five short lines and no MARK beyond the boot stages. Delete this
 * file, its import in `index.tsx` and the `probeMark` call sites when the todo closes.
 */

const SAMPLE_DELAYS_MS = [1500, 6000, 30000]

interface NodeGeometry {
  tag: string
  id?: string
  cls?: string
  rect: string
  vis: string
}

function describeNode(el: Element): NodeGeometry {
  const rect = el.getBoundingClientRect()
  const style = window.getComputedStyle(el)
  const out: NodeGeometry = {
    tag: el.tagName.toLowerCase(),
    rect: `${Math.round(rect.x)},${Math.round(rect.y)} ${rect.width.toFixed(
      2
    )}x${rect.height.toFixed(2)}`,
    vis: `${style.display}/${style.visibility}/${style.opacity}/${style.overflow}`
  }
  if (el.id) out.id = el.id
  const cls = el.getAttribute('class')
  if (cls) out.cls = cls.slice(0, 60)
  return out
}

/**
 * Boot-stage marker. Cheap enough to leave on: one line per stage, and the stage sequence is
 * what separates "never got there" from "got there and lost it".
 */
export function probeMark(stage: string): void {
  try {
    window.api.logInfo(
      `[BLANKPROBE-MARK] ${stage} t=${Math.round(performance.now())}ms ` +
        `vis=${document.visibilityState} rootKids=${
          document.getElementById('root')?.childElementCount ?? -1
        }`
    )
  } catch {
    // The probe must never be able to break a boot it exists to observe.
  }
}

function sample(label: string): void {
  try {
    const root = document.getElementById('root')
    const app = document.querySelector('.App')
    const centre = document.elementFromPoint(
      Math.floor(window.innerWidth / 2),
      Math.floor(window.innerHeight / 2)
    )

    const payload = {
      at: label,
      viewport: `${window.innerWidth}x${window.innerHeight} dpr=${window.devicePixelRatio}`,
      doc: `${document.readyState}/${document.visibilityState}/focus=${document.hasFocus()}`,
      body: describeNode(document.body),
      root: root ? describeNode(root) : 'MISSING',
      appGrid: app
        ? {
            rows: window.getComputedStyle(app).gridTemplateRows,
            cols: window.getComputedStyle(app).gridTemplateColumns,
            height: window.getComputedStyle(app).height
          }
        : 'NO .App',
      // `#root`'s children and each of their children -- the two descendant levels the
      // originating todo asked for.
      level1: root
        ? Array.from(root.children).map((child) => ({
            self: describeNode(child),
            level2: Array.from(child.children).map(describeNode)
          }))
        : [],
      centre: centre ? describeNode(centre) : 'NOTHING AT CENTRE'
    }

    window.api.logInfo(`[BLANKPROBE] ${JSON.stringify(payload)}`)
  } catch (error) {
    window.api.logInfo(`[BLANKPROBE] sample "${label}" threw: ${String(error)}`)
  }
}

function describeError(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message} | ${(value.stack ?? '(no stack)').slice(0, 900)}`
  }
  return String(value).slice(0, 900)
}

// 1. Errors, post-mount included. `bootErrorSurface` stops at `console.error` once `#root`
//    has children, and `index.tsx`'s own handler passes `ev.error` to `logError`, which
//    serialises nothing useful for a non-Error throw and never sees a rejection at all.
window.addEventListener('error', (ev: ErrorEvent) => {
  probeMark(`window-error ${describeError(ev.error ?? ev.message)}`)
})
window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
  probeMark(`unhandled-rejection ${describeError(ev.reason)}`)
})

// 2. The disappearance itself. A React root that unmounts (an uncaught render error, or a
//    suspension with no boundary above it) empties `#root` and leaves the window painting
//    `body`'s background -- which is exactly what a "blank launch" looks like.
const rootEl = document.getElementById('root')
if (rootEl) {
  const nodeName = (node: Node) => {
    if (!(node instanceof Element)) return node.nodeName
    const cls = node.getAttribute('class')
    return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${
      cls ? `.${cls.split(/\s+/).join('.').slice(0, 40)}` : ''
    }`
  }

  let hadChildren = rootEl.childElementCount > 0
  new MutationObserver((records) => {
    const has = rootEl.childElementCount > 0
    if (hadChildren && !has) {
      // Name what left and what (if anything) arrived in the same batch, and whether the
      // container is still the one this observer was attached to. Two fixes aimed at
      // i18next suspense left this firing 10 launches out of 10, so the shape of the
      // mutation is the measurement that matters -- not another hypothesis.
      const removed = records.flatMap((r) => Array.from(r.removedNodes).map(nodeName))
      const added = records.flatMap((r) => Array.from(r.addedNodes).map(nodeName))
      probeMark(
        `ROOT-EMPTIED removed=[${removed.join(',')}] added=[${added.join(',')}] ` +
          `sameContainer=${document.getElementById('root') === rootEl} ` +
          `bodyKids=${document.body.childElementCount}`
      )
      sample('root-emptied')
      // Did it come back, and as what?
      window.setTimeout(() => {
        probeMark(
          `after-emptied +250ms kids=${rootEl.childElementCount} ` +
            `first=${rootEl.firstElementChild ? nodeName(rootEl.firstElementChild) : 'NONE'}`
        )
      }, 250)
    }
    hadChildren = has
  }).observe(rootEl, { childList: true })
}

for (const delay of SAMPLE_DELAYS_MS) {
  window.setTimeout(() => sample(`t+${delay}ms`), delay)
}

window.addEventListener('focus', () => sample('focus'))
document.addEventListener('visibilitychange', () =>
  probeMark(`visibilitychange->${document.visibilityState}`)
)
