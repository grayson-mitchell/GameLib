// Spike 009 (deep) — a *tolerant* electron shim that coerces to benign values so the backend
// bundle evaluates as far as possible. This maps the FULL import-time Electron surface (the code
// that runs at module load, before any app.whenReady) — the part a Tauri sidecar cannot defer.
//
// Run: node probe-deep.mjs [path-to-built-main.js]

import { createRequire } from 'node:module'
import Module from 'node:module'
import path from 'node:path'
import os from 'node:os'
import process from 'node:process'

const require = createRequire(import.meta.url)
const touches = []
const fakePath = path.join(os.tmpdir(), 'gamelib-sidecar-probe')

// Tolerant recorder: records access, but coerces to a plausible value so evaluation continues.
function recorder(prefixPath, hint) {
  const fn = function () {
    touches.push({ path: `${prefixPath}()` })
    // Heuristic returns so downstream code keeps going:
    if (/getPath|getAppPath|toString|resolve|join/i.test(prefixPath)) return fakePath
    if (/getVersion|getName|getLocale/i.test(prefixPath)) return '0.0.0-probe'
    if (/is[A-Z]|has[A-Z]|whenReady|requestSingleInstanceLock/i.test(prefixPath)) return true
    return recorder(`${prefixPath}()`)
  }
  return new Proxy(fn, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive) return () => fakePath
      if (prop === 'then') return undefined
      if (typeof prop === 'symbol') return undefined
      const p = `${prefixPath}.${String(prop)}`
      touches.push({ path: p })
      return recorder(p)
    },
    apply(_t, _this, args) {
      touches.push({ path: `${prefixPath}()`, argc: args.length })
      if (/getPath|getAppPath/i.test(prefixPath)) return fakePath
      if (/whenReady/i.test(prefixPath)) return Promise.resolve()
      if (/on|once|handle|removeListener|setAppUserModelId|disableHardwareAcceleration/i.test(prefixPath)) return undefined
      return recorder(`${prefixPath}()`)
    },
    construct() {
      touches.push({ path: `new ${prefixPath}` })
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
      touches.push({ path: `electron.${p}`, import: true })
      return recorder(`electron.${p}`)
    }
  }
)

Module._load = ((orig) =>
  function (request, parent, isMain) {
    if (request === 'electron') return electronStub
    return orig.call(this, request, parent, isMain)
  })(Module._load)

const mainPath = path.resolve(
  process.argv[2] || path.join(process.cwd(), '..', '..', '..', 'build', 'main', 'main.js')
)

let fault = null
try {
  require(mainPath)
} catch (err) {
  fault = { message: err?.message, stackTop: String(err?.stack).split('\n').slice(0, 3) }
}

const apis = new Map()
for (const t of touches) {
  const m = /electron\.([A-Za-z]+)/.exec(t.path)
  if (m) apis.set(m[1], (apis.get(m[1]) || 0) + 1)
}

console.log(
  JSON.stringify(
    {
      import_time_electron_apis: Object.fromEntries([...apis.entries()].sort((a, b) => b[1] - a[1])),
      distinct_apis: apis.size,
      total_touches: touches.length,
      faulted: !!fault,
      fault,
      note: 'These APIs run at module-evaluation time (before whenReady). A Tauri sidecar cannot defer them — each needs a shim or a refactor.'
    },
    null,
    2
  )
)
