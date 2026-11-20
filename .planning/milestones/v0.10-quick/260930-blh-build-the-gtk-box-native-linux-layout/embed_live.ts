/**
 * embed_live.ts -- live harness for quick 260930-blh (Linux GTK-box-native store-embed layout).
 *
 * Modelled on quick 260930-aof's appimage_smoke.ts (spawn / identity / teardown functions).
 *
 *   node meta/runTs.cjs --bundle --platform=node --target=node22 <this file> \
 *     --binary ABS/src-tauri/target/debug/gamelib-shell --evidence ABS_DIR --label tracer|expansion \
 *     --stop-file ABS_PATH --max-seconds 1500
 *
 * Launches the DEV binary (it loads devUrl http://localhost:5173, so a vite server must already be
 * running) under a FRESH createFakeHomeProfile(), with WEBKIT_DISABLE_DMABUF_RENDERER absent from
 * the child environment. Proves identity by window -> _NET_WM_PID -> /proc exe. Holds until the
 * stop-file appears, the child exits, or --max-seconds elapses, appending each NEW stderr line that
 * contains `store_embed(linux)` to <label>-settled.log once per second so a driver can read it
 * between UI steps. Tears down shell-first, then recorded groups, then environ-matched helpers,
 * and writes <label>-teardown.txt with POST_TEARDOWN_PROCS. Kills by pid or process GROUP only,
 * never by name. Uses absolute args and process.cwd(), never __dirname.
 *
 * Exit codes: 0 ok, 2 preflight refusal, 3 identity failure.
 */
import { spawn, spawnSync } from 'node:child_process'
import {
  appendFileSync,
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  readSync,
  realpathSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { get as httpGet } from 'node:http'
import { join } from 'node:path'
import { createFakeHomeProfile } from '../../../src/backend/testUtils/fakeHomeProfile'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined
}
const binary = arg('--binary')
const evidence = arg('--evidence')
const label = arg('--label')
const stopFile = arg('--stop-file')
const maxSeconds = Number(arg('--max-seconds') ?? '1500')
// DIAGNOSTIC ONLY (never used for a scored run): --diag-env K=V adds one variable to the child env.
const diagEnv = arg('--diag-env')
if (!binary || !evidence || !label || !stopFile) {
  console.error('usage: --binary ABS --evidence ABS --label NAME --stop-file ABS [--max-seconds N]')
  process.exit(2)
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)))
const ev = (name: string) => join(evidence, `${label}-${name}`)

interface Stat {
  pid: number
  state: string
  ppid: number
  pgrp: number
}
function statOf(pid: number): Stat | null {
  try {
    const s = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const rest = s.slice(s.lastIndexOf(')') + 2).split(' ')
    return { pid, state: rest[0], ppid: Number(rest[1]), pgrp: Number(rest[2]) }
  } catch {
    return null
  }
}
function allProcs(): Stat[] {
  const out: Stat[] = []
  for (const e of readdirSync('/proc')) {
    if (!/^\d+$/.test(e)) continue
    const s = statOf(Number(e))
    if (s) out.push(s)
  }
  return out
}
const aliveNonZombie = (pid: number): boolean => {
  const st = statOf(pid)
  return !!st && st.state !== 'Z'
}
function killGroup(pgid: number, sig: NodeJS.Signals): void {
  if (!Number.isInteger(pgid) || pgid <= 1) return
  const mine = statOf(process.pid)
  if (mine && mine.pgrp === pgid) return // never signal our own group
  try {
    process.kill(-pgid, sig)
  } catch {
    /* already gone */
  }
}
function killPid(pid: number, sig: NodeJS.Signals): void {
  if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) return
  try {
    process.kill(pid, sig)
  } catch {
    /* already gone */
  }
}
function readEnviron(pid: number): string {
  try {
    return readFileSync(`/proc/${pid}/environ`, 'latin1')
  } catch {
    return ''
  }
}
function xdo(args: string[], env: NodeJS.ProcessEnv): { rc: number; out: string } {
  const r = spawnSync('xdotool', args, { env, encoding: 'utf8', timeout: 10000 })
  return { rc: r.status ?? -1, out: (r.stdout ?? '').trim() }
}
function vitePing(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = httpGet('http://localhost:5173/', (res) => {
      res.resume()
      resolve((res.statusCode ?? 0) > 0)
    })
    req.setTimeout(3000, () => {
      req.destroy()
      resolve(false)
    })
    req.on('error', () => resolve(false))
  })
}

async function main(): Promise<number> {
  // ---- preflight -------------------------------------------------------------------------
  for (const e of readdirSync('/proc')) {
    if (!/^\d+$/.test(e)) continue
    try {
      if (readFileSync(`/proc/${e}/comm`, 'utf8').trim() === 'gamelib-shell') {
        console.error(`PREFLIGHT REFUSED: a gamelib-shell is already running (pid ${e})`)
        return 2
      }
    } catch {
      /* raced away */
    }
  }
  if (!(await vitePing())) {
    console.error('PREFLIGHT REFUSED: http://localhost:5173/ did not answer within 3s')
    return 2
  }
  if (!existsSync(binary!)) {
    console.error(`PREFLIGHT REFUSED: binary not found: ${binary}`)
    return 2
  }

  // ---- launch ----------------------------------------------------------------------------
  const profile = createFakeHomeProfile({ prefix: 'gl-blh-' })
  const childEnv: NodeJS.ProcessEnv = profile.childEnv(process.env)
  delete childEnv.WEBKIT_DISABLE_DMABUF_RENDERER
  childEnv.GAMELIB_DEV_SECRET_VAULT = '1'
  childEnv.GAMELIB_NODE = process.execPath
  if (diagEnv && diagEnv.includes('=')) {
    const eq = diagEnv.indexOf('=')
    childEnv[diagEnv.slice(0, eq)] = diagEnv.slice(eq + 1)
  }

  const settledLog = ev('settled.log')
  writeFileSync(settledLog, '')
  const outPath = join(profile.root, 'shell.stdout')
  const errPath = join(profile.root, 'shell.stderr')
  const outFd = openSync(outPath, 'w')
  const errFd = openSync(errPath, 'w')

  let shellPid = -1
  const groups = new Set<number>()
  let stopReason = 'unknown'
  const idLines: string[] = []
  const idRec = (k: string, v: string | number | boolean) => idLines.push(`${k}=${v}`)

  try {
    const child = spawn(binary!, [], {
      detached: true,
      env: childEnv,
      stdio: ['ignore', outFd, errFd]
    })
    shellPid = child.pid ?? -1
    let exited = false
    child.on('exit', () => {
      exited = true
    })
    closeSync(outFd)
    closeSync(errFd)
    if (shellPid <= 1) {
      console.error('spawn failed')
      return 3
    }
    groups.add(shellPid) // detached => the shell is its own group leader

    // ---- identity (within 60s) ------------------------------------------------------------
    let windowId = ''
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline && !exited) {
      const r = xdo(['search', '--onlyvisible', '--pid', String(shellPid)], childEnv)
      for (const wid of r.out.split('\n').filter(Boolean)) {
        const g = xdo(['getwindowgeometry', '--shell', wid], childEnv).out
        const wm = /WIDTH=(\d+)/.exec(g)
        const hm = /HEIGHT=(\d+)/.exec(g)
        if (wm && hm && Number(wm[1]) >= 300 && Number(hm[1]) >= 300) {
          windowId = wid
          break
        }
      }
      if (windowId) break
      await sleep(1000)
    }
    const exeReal = (() => {
      try {
        return realpathSync(`/proc/${shellPid}/exe`)
      } catch {
        return ''
      }
    })()
    const wantReal = realpathSync(binary!)
    const environ = readEnviron(shellPid)
    idRec('WINDOW_ID', windowId || 'NONE')
    idRec('LAUNCH_PID', shellPid)
    idRec('EXE_MATCH', exeReal !== '' && exeReal === wantReal ? 'yes' : 'no')
    idRec('DMABUF_VAR_PRESENT', /(^|\0)WEBKIT_DISABLE_DMABUF_RENDERER=/.test(environ) ? 'yes' : 'no')
    idRec('FAKE_HOME', 'createFakeHomeProfile')
    if (diagEnv) idRec('DIAG_ENV', diagEnv)
    writeFileSync(ev('identity.txt'), idLines.join('\n') + '\n')
    console.log(idLines.join('\n'))
    if (!windowId) {
      stopReason = 'identity-failed'
      return 3
    }

    // ---- hold ------------------------------------------------------------------------------
    const t0 = Date.now()
    let errOffset = 0
    let carry = ''
    const drain = () => {
      let size = 0
      try {
        size = statSync(errPath).size
      } catch {
        return
      }
      if (size <= errOffset) return
      const fd = openSync(errPath, 'r')
      try {
        const buf = Buffer.alloc(size - errOffset)
        readSync(fd, buf, 0, buf.length, errOffset)
        errOffset = size
        const text = carry + buf.toString('utf8')
        const parts = text.split('\n')
        carry = parts.pop() ?? ''
        const keep = parts.filter((l) => l.includes('store_embed(linux)'))
        if (keep.length) appendFileSync(settledLog, keep.join('\n') + '\n')
      } finally {
        closeSync(fd)
      }
    }
    for (;;) {
      drain()
      for (const p of allProcs()) {
        if (p.ppid === shellPid && p.pgrp > 1) groups.add(p.pgrp)
      }
      if (existsSync(stopFile!)) {
        stopReason = 'stop-file'
        break
      }
      if (exited) {
        stopReason = 'child-exit'
        break
      }
      if ((Date.now() - t0) / 1000 > maxSeconds) {
        stopReason = 'max-seconds'
        break
      }
      await sleep(1000)
    }
    drain()
    return 0
  } finally {
    // ---- teardown --------------------------------------------------------------------------
    const lines: string[] = [`STOP_REASON=${stopReason}`]
    if (shellPid > 1) {
      killPid(shellPid, 'SIGTERM')
      const until = Date.now() + 10_000
      while (Date.now() < until && aliveNonZombie(shellPid)) await sleep(250)
      lines.push(`SHELL_EXITED_AFTER_TERM=${!aliveNonZombie(shellPid)}`)
      for (const g of groups) killGroup(g, 'SIGTERM')
      await sleep(2000)
      for (const g of groups) killGroup(g, 'SIGKILL')
      await sleep(500)
      // Remaining helpers (WebKit processes etc.) carry the fake profile root in their environ.
      const stragglers = () =>
        allProcs()
          .filter((p) => p.pid !== process.pid && p.state !== 'Z')
          .filter((p) => readEnviron(p.pid).includes(profile.root) || groups.has(p.pgrp) || p.pid === shellPid)
      for (const p of stragglers()) killPid(p.pid, 'SIGTERM')
      await sleep(1500)
      for (const p of stragglers()) killPid(p.pid, 'SIGKILL')
      await sleep(500)
      const left = stragglers()
      lines.push(`POST_TEARDOWN_PROCS=${left.length}`)
      for (const p of left) lines.push(`LEFT_PID=${p.pid} EXE=${(() => { try { return readlinkSync(`/proc/${p.pid}/exe`) } catch { return '?' } })()}`)
    } else {
      lines.push('POST_TEARDOWN_PROCS=0')
    }
    writeFileSync(ev('teardown.txt'), lines.join('\n') + '\n')
    console.log(lines.join('\n'))
    profile.dispose()
  }
}

main().then(
  (rc) => process.exit(rc),
  (e) => {
    console.error(e)
    process.exit(1)
  }
)
