// Spike 009 — Can GameLib's Node backend run headless (as a Tauri sidecar would force),
// or is it welded to the Electron main-process runtime?
//
// Approach: intercept `require('electron')` the way a bare Node process (or Tauri sidecar)
// would see it — Electron's main APIs (app, dialog, BrowserWindow, safeStorage, shell...)
// simply DO NOT EXIST outside the Electron runtime. We install a Proxy that records every
// Electron API the backend touches during startup, then let the real bundle run until it
// faults. The ordered touch-list + the fault point is the evidence.
//
// Run: node probe-electron-coupling.mjs [path-to-built-main.js]

import { createRequire } from 'node:module'
import Module from 'node:module'
import path from 'node:path'
import process from 'node:process'

const require = createRequire(import.meta.url)
const touches = []
let faultedAt = null

// Anything accessed off `electron` is a main-process API that a Tauri/Rust sidecar
// would have to replace. Record the access path; return further proxies so we can see
// how deep the very first call chain goes before it blows up.
function recorder(prefixPath) {
  const target = function () {}
  return new Proxy(target, {
    get(_t, prop) {
      if (typeof prop === 'symbol') return undefined
      if (prop === 'then') return undefined // don't look thenable to await
      const p = `${prefixPath}.${String(prop)}`
      touches.push({ kind: 'get', path: p, at: new Date().toISOString() })
      return recorder(p)
    },
    apply(_t, _this, args) {
      touches.push({ kind: 'call', path: `${prefixPath}()`, argc: args.length })
      return recorder(`${prefixPath}()`)
    },
    construct() {
      touches.push({ kind: 'new', path: `new ${prefixPath}` })
      return recorder(`new ${prefixPath}`)
    }
  })
}

const electronStub = new Proxy(
  {},
  {
    get(_t, prop) {
      if (typeof prop === 'symbol') return undefined
      const p = String(prop)
      touches.push({ kind: 'import', path: `electron.${p}` })
      return recorder(`electron.${p}`)
    }
  }
)

// Hook module resolution: every `require('electron')` gets our stub.
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return electronStub
  return origLoad.call(this, request, parent, isMain)
}

const mainPath = path.resolve(
  process.argv[2] || path.join(process.cwd(), '..', '..', '..', 'build', 'main', 'main.js')
)

console.error(`[probe] loading backend bundle head-less: ${mainPath}`)
console.error(`[probe] electron runtime is ABSENT (as in a Tauri sidecar)\n`)

try {
  require(mainPath)
} catch (err) {
  faultedAt = { message: err?.message, stackTop: String(err?.stack).split('\n').slice(0, 4) }
}

// Summarize: distinct top-level electron APIs touched before fault.
const apis = new Map()
for (const t of touches) {
  const m = /electron\.([A-Za-z]+)/.exec(t.path)
  if (m) apis.set(m[1], (apis.get(m[1]) || 0) + 1)
}

const summary = {
  backend_bundle: mainPath,
  distinct_electron_apis_touched_before_fault: [...apis.keys()],
  api_touch_counts: Object.fromEntries([...apis.entries()].sort((a, b) => b[1] - a[1])),
  total_touch_events: touches.length,
  faulted: !!faultedAt,
  fault: faultedAt,
  first_20_touches: touches.slice(0, 20).map((t) => t.path)
}

console.error('\n=== HEADLESS STARTUP PROBE RESULT ===')
console.log(JSON.stringify(summary, null, 2))
console.error(
  `\n[probe] verdict signal: backend ${faultedAt ? 'FAULTED' : 'survived'} at startup with electron absent.`
)
