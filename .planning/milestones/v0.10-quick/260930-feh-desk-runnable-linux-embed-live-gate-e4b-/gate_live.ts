/**
 * gate_live.ts -- live harness for quick 260930-feh (desk live gate: E4b, E5, HiDPI, drag-resize).
 *
 * PROVENANCE: a copy of quick 260930-blh's embed_live.ts (itself modelled on 260930-aof's
 * appimage_smoke.ts). The ONLY edits against embed_live.ts are:
 *   (a) profile prefix `gl-feh-`;
 *   (b) `--diag-env` replaced by a repeatable `--set K=V` (identity `SET=<comma list>`); exit 2 with
 *       PREFLIGHT REFUSED if any --set names WEBKIT_DISABLE_DMABUF_RENDERER or LD_PRELOAD, so a
 *       scored run can never re-add the workaround;
 *   (c) identity gains LD_PRELOAD_VAR=present|absent and GDK_SCALE_VAR=<value|absent>, read from the
 *       shell's /proc/<pid>/environ (DMABUF_VAR_PRESENT kept);
 *   (d) statOf() gains `comm`; descendants() is ported from 260930-ea0's probe_live.ts; in the hold
 *       loop, once per second, one `WEBPROC pid=<n> dmabuf=<v|absent> gdk_scale=<v|absent>` line is
 *       appended to <label>-identity.txt for every NEW descendant whose comm starts with
 *       `WebKitWebProces` (every one, not only the first -- the embed may run in its own process);
 *   (e) stderr is drained every 50 ms (not 1000 ms) and every kept `store_embed(linux)` line is
 *       written as `T=<Date.now()> <line>`; the process-group scan and the stop-file / max-seconds
 *       checks stay at a 1000 ms cadence.
 * Everything else (WINDOW_ID / EXE_MATCH identity, teardown order, dispose() in finally,
 * GAMELIB_DEV_SECRET_VAULT, GAMELIB_NODE, the `delete childEnv.WEBKIT_DISABLE_DMABUF_RENDERER`
 * line) is unchanged. The harness never writes profile.root to any output.
 *
 *   node meta/runTs.cjs --bundle --platform=node --target=node22 <this file> \
 *     --binary ABS/src-tauri/target/debug/gamelib-shell --evidence ABS_DIR --label NAME \
 *     --stop-file ABS_PATH --max-seconds 1500 [--set GDK_SCALE=2]...
 *
 * Launches the DEV binary (it loads devUrl http://localhost:5173, so a vite server must already be
 * running) under a FRESH createFakeHomeProfile(). Proves identity by window -> _NET_WM_PID -> /proc
 * exe. Holds until the stop-file appears, the child exits, or --max-seconds elapses. Tears down
 * shell-first, then recorded groups, then environ-matched helpers, and writes <label>-teardown.txt
 * with POST_TEARDOWN_PROCS. Kills by pid or process GROUP only, never by name.
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
function args(name: string): string[] {
  const out: string[] = []
  for (let i = 0; i < process.argv.length - 1; i++) {
    if (process.argv[i] === name) out.push(process.argv[i + 1])
  }
  return out
}
const binary = arg('--binary')
const evidence = arg('--evidence')
const label = arg('--label')
const stopFile = arg('--stop-file')
const maxSeconds = Number(arg('--max-seconds') ?? '1500')
const setVars = args('--set')
if (!binary || !evidence || !label || !stopFile) {
  console.error('usage: --binary ABS --evidence ABS --label NAME --stop-file ABS [--max-seconds N] [--set K=V]...')
  process.exit(2)
}
for (const s of setVars) {
  const k = s.includes('=') ? s.slice(0, s.indexOf('=')) : s
  if (k === 'WEBKIT_DISABLE_DMABUF_RENDERER' || k === 'LD_PRELOAD') {
    console.error(`PREFLIGHT REFUSED: --set ${k} is not allowed in a scored run`)
    process.exit(2)
  }
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)))
const ev = (name: string) => join(evidence, `${label}-${name}`)

interface Stat {
  pid: number
  comm: string
  state: string
  ppid: number
  pgrp: number
}
function statOf(pid: number): Stat | null {
  try {
    const s = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const l = s.indexOf('(')
    const r = s.lastIndexOf(')')
    const rest = s.slice(r + 2).split(' ')
    return { pid, comm: s.slice(l + 1, r), state: rest[0], ppid: Number(rest[1]), pgrp: Number(rest[2]) }
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
function descendants(root: number): Stat[] {
  const all = allProcs()
  const set = new Set<number>([root])
  let grew = true
  while (grew) {
    grew = false
    for (const p of all) {
      if (!set.has(p.pid) && set.has(p.ppid)) {
        set.add(p.pid)
        grew = true
      }
    }
  }
  return all.filter((p) => set.has(p.pid))
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
function envVal(environ: string, name: string): string {
  const m = new RegExp(`(^|\\0)${name}=([^\\0]*)`).exec(environ)
  return m ? m[2] : 'absent'
}
function xdo(a: string[], env: NodeJS.ProcessEnv): { rc: number; out: string } {
  const r = spawnSync('xdotool', a, { env, encoding: 'utf8', timeout: 10000 })
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
  // `--no-vite`: a RELEASE binary serves its embedded frontend, so the dev-server ping is not a precondition.
  if (!process.argv.includes('--no-vite') && !(await vitePing())) {
    console.error('PREFLIGHT REFUSED: http://localhost:5173/ did not answer within 3s')
    return 2
  }
  if (!existsSync(binary!)) {
    console.error(`PREFLIGHT REFUSED: binary not found: ${binary}`)
    return 2
  }

  // ---- launch ----------------------------------------------------------------------------
  const profile = createFakeHomeProfile({ prefix: 'gl-feh-' })
  const childEnv: NodeJS.ProcessEnv = profile.childEnv(process.env)
  delete childEnv.WEBKIT_DISABLE_DMABUF_RENDERER
  childEnv.GAMELIB_DEV_SECRET_VAULT = '1'
  childEnv.GAMELIB_NODE = process.execPath
  for (const s of setVars) {
    const eq = s.indexOf('=')
    if (eq > 0) childEnv[s.slice(0, eq)] = s.slice(eq + 1)
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
    idRec('LD_PRELOAD_VAR', /(^|\0)LD_PRELOAD=/.test(environ) ? 'present' : 'absent')
    idRec('GDK_SCALE_VAR', envVal(environ, 'GDK_SCALE'))
    idRec('FAKE_HOME', 'createFakeHomeProfile')
    idRec('SET', setVars.join(','))
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
    const webprocSeen = new Set<number>()
    const drain = () => {
      let size = 0
      try {
        size = statSync(errPath).size
      } catch {
        return
      }
      if (size <= errOffset) return
      const now = Date.now()
      const fd = openSync(errPath, 'r')
      try {
        const buf = Buffer.alloc(size - errOffset)
        readSync(fd, buf, 0, buf.length, errOffset)
        errOffset = size
        const text = carry + buf.toString('utf8')
        const parts = text.split('\n')
        carry = parts.pop() ?? ''
        const keep = parts.filter((l) => l.includes('store_embed(linux)'))
        if (keep.length) appendFileSync(settledLog, keep.map((l) => `T=${now} ${l}`).join('\n') + '\n')
      } finally {
        closeSync(fd)
      }
    }
    let nextSlow = 0
    for (;;) {
      drain()
      if (Date.now() >= nextSlow) {
        nextSlow = Date.now() + 1000
        for (const p of allProcs()) {
          if (p.ppid === shellPid && p.pgrp > 1) groups.add(p.pgrp)
        }
        for (const d of descendants(shellPid)) {
          if (d.comm.startsWith('WebKitWebProces') && !webprocSeen.has(d.pid)) {
            webprocSeen.add(d.pid)
            const we = readEnviron(d.pid)
            appendFileSync(
              ev('identity.txt'),
              `WEBPROC pid=${d.pid} dmabuf=${envVal(we, 'WEBKIT_DISABLE_DMABUF_RENDERER')} gdk_scale=${envVal(we, 'GDK_SCALE')}\n`
            )
          }
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
      }
      await sleep(50)
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
      for (const p of left)
        lines.push(
          `LEFT_PID=${p.pid} EXE=${(() => {
            try {
              return readlinkSync(`/proc/${p.pid}/exe`)
            } catch {
              return '?'
            }
          })()}`
        )
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
