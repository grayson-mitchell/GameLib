#!/usr/bin/env node
// G-48-12a focus-ring driver (Phase 48 plan 16, evidence only).
//
//   node drive-cdp.mjs <chrome-headless-shell> <profileDir> --grid <page.html> [--list <page.html>] [--only S0,S1]
//
// Launches chrome-headless-shell, talks CDP over Node's built-in WebSocket (no
// npm dependency) and drives REAL input: Input.dispatchMouseEvent moves in 6
// steps and Input.dispatchKeyEvent rawKeyDown/keyUp Tab. Every scenario starts
// from a fresh Page.navigate. Prints a JSON array of scenario objects, each
// with exactly: id, pass, focusedCard, focusedRinged, ringedCount, listingHover,
// bodyClass, cards  (plus informational `note` / `steps`).
//
// "ringed" = computed outline-style solid, outline-width >= 3px, outline-color
// alpha > 0. A card is ringed by the console ring (3px) but NOT by the list row
// hover outline (2px), so a list row only counts when it wears the focus ring.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const argv = process.argv.slice(2)
const chromePath = argv[0]
const profileDir = argv[1]
const flag = (name) => {
  const i = argv.indexOf(name)
  return i > 0 ? argv[i + 1] : undefined
}
const gridPage = flag('--grid')
const listPage = flag('--list')
const only = flag('--only')?.split(',')
if (!chromePath || !profileDir || !gridPage) {
  console.error('usage: drive-cdp.mjs <chrome> <profileDir> --grid <page> [--list <page>] [--only S0,S1]')
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// --- launch + connect -------------------------------------------------------
const chrome = spawn(
  chromePath,
  [
    '--disable-gpu',
    '--no-sandbox',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    '--window-size=1600,1000',
    'about:blank'
  ],
  { stdio: 'ignore' }
)
const killChrome = () => {
  try {
    chrome.kill('SIGKILL')
  } catch {
    // already gone
  }
}
process.on('exit', killChrome)

let port
for (let i = 0; i < 100 && !port; i++) {
  const f = join(profileDir, 'DevToolsActivePort')
  if (existsSync(f)) {
    const p = Number(readFileSync(f, 'utf8').split('\n')[0])
    if (p) port = p
  }
  if (!port) await sleep(100)
}
if (!port) {
  console.error('DevToolsActivePort never appeared')
  process.exit(1)
}
let wsUrl
for (let i = 0; i < 50 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl
  } catch {
    // not ready
  }
  if (!wsUrl) await sleep(100)
}
if (!wsUrl) {
  console.error('no page target')
  process.exit(1)
}

const ws = new WebSocket(wsUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})
let nextId = 1
const pending = new Map()
const waiters = []
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result)
  } else if (msg.method) {
    for (const w of [...waiters]) {
      if (w.method === msg.method) {
        waiters.splice(waiters.indexOf(w), 1)
        w.res(msg.params)
      }
    }
  }
}
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = nextId++
    pending.set(id, { res, rej })
    ws.send(JSON.stringify({ id, method, params }))
  })
const waitEvent = (method) => new Promise((res) => waiters.push({ method, res }))

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await send('Emulation.setDeviceMetricsOverride', {
  width: 1600,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false
})

const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })
  if (r.exceptionDetails) {
    throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400))
  }
  return r.result.value
}

// --- real input -------------------------------------------------------------
let pos = { x: 0, y: 0 }
const moveTo = async (x, y, steps = 6) => {
  const from = pos
  for (let s = 1; s <= steps; s++) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(from.x + ((x - from.x) * s) / steps),
      y: Math.round(from.y + ((y - from.y) * s) / steps)
    })
  }
  pos = { x: Math.round(x), y: Math.round(y) }
  await sleep(40)
}
const moveSameCoords = async () => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y })
  await sleep(40)
}
const click = async (x, y) => {
  await moveTo(x, y)
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: pos.x,
    y: pos.y,
    button: 'left',
    clickCount: 1
  })
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: pos.x,
    y: pos.y,
    button: 'left',
    clickCount: 1
  })
  await sleep(40)
}
const pressTab = async () => {
  const k = { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 }
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...k })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...k })
  await sleep(40)
}

// --- page helpers -----------------------------------------------------------
const load = async (page) => {
  const loaded = waitEvent('Page.loadEventFired')
  await send('Page.navigate', { url: pathToFileURL(page).href })
  await loaded
  // Start every scenario with the pointer parked at the sidebar's top-left.
  pos = { x: 0, y: 0 }
  await moveTo(100, 400, 3)
  await sleep(40)
}

const MEASURE = `(() => {
  const alpha = (c) => {
    if (!c || c === 'transparent') return 0;
    let m = c.match(/^rgba\\(([^)]*)\\)/);
    if (m) return Number(m[1].split(',')[3]);
    m = c.match(/\\/\\s*([0-9.]+)\\s*\\)/);
    if (m) return Number(m[1]);
    return 1;
  };
  const nodes = [...document.querySelectorAll('.gameCard, .gameListItem')];
  const cards = nodes.map((el, i) => {
    const cs = getComputedStyle(el);
    const w = parseFloat(cs.outlineWidth);
    const ringed = cs.outlineStyle === 'solid' && w >= 3 && alpha(cs.outlineColor) > 0;
    return {
      i,
      list: el.closest('#stripList') ? 'strip' : 'main',
      ringed,
      hovered: el.matches(':hover'),
      zIndex: cs.zIndex,
      outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor
    };
  });
  const ae = document.activeElement;
  const fi = nodes.findIndex((n) => n.contains(ae));
  const listing = document.querySelector('.listing');
  return {
    focusedCard: fi,
    focusedList: fi >= 0 ? cards[fi].list : null,
    focusedRinged: fi >= 0 ? cards[fi].ringed : false,
    ringedCount: cards.filter((c) => c.ringed).length,
    listingHover: !!listing && listing.matches(':hover'),
    bodyClass: document.body.className,
    cards
  };
})()`
const measure = () => evalJs(MEASURE)

const rect = (sel, n) =>
  evalJs(`(() => {
    const e = document.querySelectorAll(${JSON.stringify(sel)})[${n}];
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom,
             cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  })()`)
// main-grid card n (0-based within #mainList)
const mainCard = async (n) => {
  const r = await rect('#mainList .gameCard', n)
  if (!r) throw new Error(`no main grid card ${n}`)
  if (r.cy > 990 || r.cy < 10) throw new Error(`main grid card ${n} is off-screen (cy=${r.cy})`)
  return r
}
const mainRow = async (n) => {
  const r = await rect('#mainList .gameListItem', n)
  if (!r) throw new Error(`no list row ${n}`)
  return r
}
const sidebarBtn = () => rect('#sidebarBtn', 0)

// Tab until `pred(focusState)`; returns { presses, state }.
const FOCUS_STATE = `(() => {
  const nodes = [...document.querySelectorAll('.gameCard, .gameListItem')];
  const fi = nodes.findIndex((n) => n.contains(document.activeElement));
  return { fi, main: fi >= 0 && !!nodes[fi].closest('#mainList') };
})()`
const tabUntil = async (pred, cap = 60) => {
  for (let n = 1; n <= cap; n++) {
    await pressTab()
    const st = await evalJs(FOCUS_STATE)
    if (pred(st)) return { presses: n, state: st }
  }
  return { presses: cap, state: await evalJs(FOCUS_STATE), capped: true }
}

const finish = (id, snap, pass, extra = {}) => ({
  id,
  pass: !!pass,
  focusedCard: snap.focusedCard,
  focusedRinged: snap.focusedRinged,
  ringedCount: snap.ringedCount,
  listingHover: snap.listingHover,
  bodyClass: snap.bodyClass,
  cards: snap.cards,
  ...extra
})

// --- scenarios --------------------------------------------------------------
const SCENARIOS = {}

// S0, instrument: the rig can see hover (z-index 2 + ring) and focus (ring).
SCENARIOS.S0 = async () => {
  await load(gridPage)
  const c3 = await mainCard(3)
  await moveTo(c3.cx, c3.cy)
  const hov = await measure()
  const hoverCard = hov.cards.find((c) => c.list === 'main' && c.hovered)
  const hoverOk = !!hoverCard && hoverCard.ringed && hoverCard.zIndex === '2'
  const sb = await sidebarBtn()
  await moveTo(sb.cx, sb.cy)
  const { presses, state } = await tabUntil((s) => s.fi >= 0)
  const snap = await measure()
  return finish('S0', snap, hoverOk && state.fi >= 0 && snap.focusedRinged, {
    note: `hover phase: hoveredMainCard=${hoverCard?.i} ringed=${hoverCard?.ringed} z=${hoverCard?.zIndex}; tab phase: ${presses} presses`,
    hoverOk
  })
}

// S1 / S1c: Tab into the first main-grid card, pointer in the gap / on the sidebar.
const tabIntoGrid = async (id, pointer) => {
  await load(gridPage)
  if (pointer === 'gap') {
    const a = await mainCard(0)
    const b = await mainCard(1)
    await moveTo((a.right + b.left) / 2, a.cy)
  } else {
    const sb = await sidebarBtn()
    await moveTo(sb.cx, sb.cy)
  }
  const before = await measure()
  const gapOk =
    pointer === 'gap'
      ? before.listingHover && !before.cards.some((c) => c.hovered)
      : !before.listingHover
  const { presses, state, capped } = await tabUntil((s) => s.main)
  const snap = await measure()
  return finish(
    id,
    snap,
    gapOk && !capped && snap.focusedRinged && snap.ringedCount === 1,
    {
      note: `pointer=${pointer} preconditionOk=${gapOk} presses=${presses} focusedMainCard=${state.fi}`
    }
  )
}
SCENARIOS.S1 = () => tabIntoGrid('S1', 'gap')
SCENARIOS.S1c = () => tabIntoGrid('S1c', 'sidebar')

// Index (within all cards) of the main-grid card n, for reporting.
const MAIN_OFFSET = 5

// S2: the pointer rests on grid card 2 (hovered) while Tab focuses another
// grid card. The focused card must be the only ring.
SCENARIOS.S2 = async () => {
  await load(gridPage)
  const hoverRect = await mainCard(2)
  await moveTo(hoverRect.cx, hoverRect.cy)
  const { presses, state, capped } = await tabUntil(
    (st) => st.main && st.fi !== MAIN_OFFSET + 2
  )
  const snap = await measure()
  const hovered = snap.cards.filter((c) => c.hovered).map((c) => c.i)
  return finish(
    'S2',
    snap,
    !capped &&
      snap.focusedRinged &&
      snap.ringedCount === 1 &&
      hovered.includes(MAIN_OFFSET + 2) &&
      !snap.cards[MAIN_OFFSET + 2].ringed,
    {
      note: `pointer on main card 2 (hovered cards: ${hovered.join(',')}); presses=${presses} focusedCard=${state.fi}`
    }
  )
}

// A real click on main card 0's first button, which takes DOM focus.
const clickMainCardButton = async (n) => {
  const r = await evalJs(`(() => {
    const b = document.querySelectorAll('#mainList .gameCard')[${n}].querySelector('button');
    const r = b.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
  })()`)
  if (!r || r.w === 0 || r.h === 0) throw new Error('card button has no box')
  await click(r.cx, r.cy)
}

// S3, stale click: a clicked card, then a real move onto another card.
SCENARIOS.S3 = async () => {
  await load(gridPage)
  await clickMainCardButton(0)
  const afterClick = await evalJs(FOCUS_STATE)
  const c4 = await mainCard(4)
  await moveTo(c4.cx, c4.cy)
  const snap = await measure()
  const ringed = snap.cards.filter((c) => c.ringed).map((c) => c.i)
  return finish(
    'S3',
    snap,
    afterClick.fi === MAIN_OFFSET &&
      ringed.length === 1 &&
      ringed[0] === MAIN_OFFSET + 4,
    {
      note: `focus after click=${afterClick.fi}; ringed after move=${ringed.join(',')}`
    }
  )
}

// S4, stale script focus (the gamepad stand-in): .focus() with no
// controllerLayout, then a real move onto another card.
SCENARIOS.S4 = async () => {
  await load(gridPage)
  await evalJs(
    `document.querySelectorAll('#mainList .gameCard')[0].querySelector('button').focus()`
  )
  const afterFocus = await evalJs(FOCUS_STATE)
  const c4 = await mainCard(4)
  await moveTo(c4.cx, c4.cy)
  const snap = await measure()
  const ringed = snap.cards.filter((c) => c.ringed).map((c) => c.i)
  return finish(
    'S4',
    snap,
    afterFocus.fi === MAIN_OFFSET &&
      ringed.length === 1 &&
      ringed[0] === MAIN_OFFSET + 4,
    {
      note: `focus after script focus=${afterFocus.fi}; ringed after move=${ringed.join(',')}`
    }
  )
}

// S5, keyboard then mouse: S1's end state, then a real move onto card 6.
SCENARIOS.S5 = async () => {
  const s1 = await tabIntoGrid('S1', 'gap')
  const focused = s1.focusedCard
  const c6 = await mainCard(6)
  await moveTo(c6.cx, c6.cy)
  const snap = await measure()
  const ringed = snap.cards.filter((c) => c.ringed).map((c) => c.i)
  return finish(
    'S5',
    snap,
    snap.cards[MAIN_OFFSET + 6].ringed &&
      !snap.cards[focused].ringed &&
      snap.ringedCount === 1 &&
      !/keyboardNav/.test(snap.bodyClass),
    {
      note: `previously focused=${focused} (S1 pass=${s1.pass}); ringed after move=${ringed.join(',')}`
    }
  )
}

// S6, synthetic move: S1's end state, then one mouseMoved at the exact
// coordinates the pointer already rests at.
SCENARIOS.S6 = async () => {
  const s1 = await tabIntoGrid('S1', 'gap')
  await moveSameCoords()
  const snap = await measure()
  return finish(
    'S6',
    snap,
    /keyboardNav/.test(snap.bodyClass) && snap.focusedRinged,
    { note: `S1 pass before the synthetic move=${s1.pass}` }
  )
}

// S7, list rows: the pointer rests in .listing but off every row (the left
// margin strip of .gameListLayout, beside a row), Tab into a row. The row must
// wear the focus ring (3px, not the 2px hover outline).
SCENARIOS.S7 = async () => {
  if (!listPage) throw new Error('S7 needs --list')
  await load(listPage)
  const r3 = await mainRow(3)
  const layout = await rect('#mainList', 0)
  await moveTo(layout.left - 8, r3.cy)
  const pre = await measure()
  const preOk = pre.listingHover && !pre.cards.some((c) => c.hovered)
  const { presses, state, capped } = await tabUntil((st) => st.main)
  const snap = await measure()
  return finish(
    'S7',
    snap,
    preOk && !capped && snap.focusedRinged && snap.ringedCount === 1,
    {
      note: `layout=list preconditionOk=${preOk} presses=${presses} focusedRow=${state.fi}`
    }
  )
}

export { SCENARIOS }

const ids = (only ?? Object.keys(SCENARIOS)).filter((id) => SCENARIOS[id])
const results = []
try {
  for (const id of ids) results.push(await SCENARIOS[id]())
} finally {
  killChrome()
}
process.stdout.write(JSON.stringify(results) + '\n')
process.exit(0)
