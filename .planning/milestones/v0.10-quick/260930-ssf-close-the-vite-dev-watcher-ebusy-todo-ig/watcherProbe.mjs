// Read-only Vite dev-watcher probe (quick 260930-ssf).
//
// Usage: node watcherProbe.mjs <baseline|postfix> <outPath> [--listen]
//
// Builds a real Vite dev server from vite.config.ts (repo root = cwd) and asks
// its chokidar watcher what it holds, via server.watcher.getWatched(). By default
// it never calls server.listen(): the watcher is constructed inside createServer,
// so there is no port bind, no dep-optimizer write and no plugin startup hook,
// and a live `pnpm tauri:dev` on 5173 is untouched. --listen uses port 5199.
//
// Output is counts only. The repo root is replaced by {repo}; nothing else from
// the environment is emitted. Re-run this after any Vite/chokidar upgrade.
import fs from 'node:fs'
import path from 'node:path'
import { createServer, version } from 'vite'

const [label, outPath, flag] = process.argv.slice(2)
if (
  (label !== 'baseline' && label !== 'postfix') ||
  !outPath ||
  (flag !== undefined && flag !== '--listen')
) {
  console.error('usage: node watcherProbe.mjs <baseline|postfix> <outPath> [--listen]')
  process.exit(64)
}
const listen = flag === '--listen'

const watchdog = setTimeout(() => {
  console.error('watchdog: 150s exceeded')
  process.exit(2)
}, 150_000)
watchdog.unref()

const norm = (s) => s.replace(/\\/g, '/')
const cwd = norm(process.cwd())
const cwdLower = cwd.toLowerCase()
const rel = (key) => {
  const k = norm(key)
  if (k.toLowerCase() === cwdLower) return ''
  if (k.toLowerCase().startsWith(cwdLower + '/')) return k.slice(cwd.length + 1)
  return k
}
const redact = (s) => {
  const n = norm(s)
  const i = n.toLowerCase().indexOf(cwdLower)
  return i === -1 ? n : n.slice(0, i) + '{repo}' + n.slice(i + cwd.length)
}

const server = await createServer({
  configFile: 'vite.config.ts',
  mode: 'development',
  logLevel: 'silent',
  // Nothing under server.watch inline: mergeConfig concatenates arrays and would
  // void the measurement.
  server: { port: 5199, strictPort: true }
})
let watcherErrors = 0
server.watcher.on('error', () => {
  watcherErrors++
})
if (listen) await server.listen()

const trajectory = []
let settled = false
const t0 = Date.now()
while (Date.now() - t0 < 120_000) {
  await new Promise((r) => setTimeout(r, 2000))
  trajectory.push(Object.keys(server.watcher.getWatched()).length)
  const n = trajectory.length
  if (n >= 3 && trajectory[n - 1] === trajectory[n - 2] && trajectory[n - 2] === trajectory[n - 3]) {
    settled = true
    break
  }
}

const watched = server.watcher.getWatched()
const keys = Object.keys(watched).map((k) => ({ rel: rel(k), entries: watched[k].length }))
const under = (r, base) => r === base || r.startsWith(base + '/')
const hasSeg = (r, seg) => r.split('/').includes(seg)
const sum = (arr) => arr.reduce((a, k) => a + k.entries, 0)

const tc = keys.filter((k) => hasSeg(k.rel, 'target-cache'))
const ignoredRaw = server.watcher.options?.ignored
const ignoredList = (Array.isArray(ignoredRaw) ? ignoredRaw : [ignoredRaw])
  .filter((x) => typeof x === 'string')
  .map(redact)

const lines = [
  `label: ${label}`,
  `vite_version: ${version}`,
  `listened: ${listen ? 'yes' : 'no'}`,
  `settled: ${settled ? 'yes' : 'no'}`,
  `settle_trajectory: ${trajectory.join(',')}`,
  `total_dirs: ${keys.length}`,
  `total_entries: ${sum(keys)}`,
  `target_cache_dirs: ${tc.length}`,
  `target_cache_entries: ${sum(tc)}`,
  `src_tauri_target_dirs: ${keys.filter((k) => under(k.rel, 'src-tauri/target')).length}`,
  `graphify_out_dirs: ${keys.filter((k) => under(k.rel, 'graphify-out')).length}`,
  `planning_dirs: ${keys.filter((k) => under(k.rel, '.planning') && !hasSeg(k.rel, 'target-cache')).length}`,
  `watcher_errors: ${watcherErrors}`,
  `ignored_resolved: ${ignoredList.join(' | ')}`,
  `has_target_cache_entry: ${ignoredList.includes('**/target-cache/**') ? 'yes' : 'no'}`
]
const text = lines.join('\n') + '\n'
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, text)
process.stdout.write(text)

await server.close()
process.exit(0)
