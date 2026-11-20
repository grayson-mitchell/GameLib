/**
 * probe_live.ts -- fake-HOME launch harness for quick 260930-ea0 (stop auto-opening the Web
 * Inspector on Linux debug builds).
 *
 * Provenance: copied from debug session linux-dev-app-blank-without-dmabuf-workaround
 * (scratchpad h/probe_live.ts, 2026-09-30). Edits made here, and no others: this header; the
 * relative fakeHomeProfile import; profile prefix gl-ea0-; identity line LD_PRELOAD_VAR;
 * identity lines WEBPROC_PID / WEBPROC_DMABUF_VAR (first WebKitWebProcess descendant seen);
 * teardown line WEBPROCS_AT_STOP.
 *
 * Purpose: prove the dev app mounts with WEBKIT_DISABLE_DMABUF_RENDERER genuinely absent from
 * both the shell and the page WebKitWebProcess environment. Launches a binary under a FRESH createFakeHomeProfile() (two-profile rule, isolated arm),
 * with the DMABUF variable removed from the inherited env unless --set puts it back.
 *
 *   node meta/runTs.cjs --bundle --platform=node --target=node22 <this> --binary ABS --out ABS_DIR --label L
 *        --stop-file ABS [--max-seconds N] [--set K=V]... [--unset K]... [--arg A]... [--snap-every S]
 *
 * Copies shell.stderr / shell.stdout / gamelib.log to <out>/<label>-*.txt before dispose (fake profile only,
 * no real data). Kills by pid / process GROUP only, never by name.
 */
import { spawn } from 'node:child_process'
import {
  appendFileSync,
  closeSync,
  copyFileSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createFakeHomeProfile } from '../../../src/backend/testUtils/fakeHomeProfile'

function args(name: string): string[] {
  const out: string[] = []
  for (let i = 0; i < process.argv.length - 1; i++) if (process.argv[i] === name) out.push(process.argv[i + 1])
  return out
}
const one = (n: string) => args(n)[0]
const binary = one('--binary')
const outDir = one('--out')
const label = one('--label')
const stopFile = one('--stop-file')
const maxSeconds = Number(one('--max-seconds') ?? '300')
const snapEvery = Number(one('--snap-every') ?? '10')
if (!binary || !outDir || !label || !stopFile) {
  console.error('usage: --binary --out --label --stop-file')
  process.exit(2)
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)))
const ev = (n: string) => join(outDir, `${label}-${n}`)

interface Stat { pid: number; state: string; ppid: number; pgrp: number; comm: string }
function statOf(pid: number): Stat | null {
  try {
    const s = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const l = s.indexOf('('), r = s.lastIndexOf(')')
    const rest = s.slice(r + 2).split(' ')
    return { pid, comm: s.slice(l + 1, r), state: rest[0], ppid: Number(rest[1]), pgrp: Number(rest[2]) }
  } catch { return null }
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
const alive = (pid: number) => { const s = statOf(pid); return !!s && s.state !== 'Z' }
function killGroup(pgid: number, sig: NodeJS.Signals) {
  if (!Number.isInteger(pgid) || pgid <= 1) return
  const mine = statOf(process.pid)
  if (mine && mine.pgrp === pgid) return
  try { process.kill(-pgid, sig) } catch { /* gone */ }
}
function killPid(pid: number, sig: NodeJS.Signals) {
  if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) return
  try { process.kill(pid, sig) } catch { /* gone */ }
}
const readEnviron = (pid: number) => { try { return readFileSync(`/proc/${pid}/environ`, 'latin1') } catch { return '' } }
function descendants(root: number): Stat[] {
  const all = allProcs()
  const set = new Set<number>([root])
  let grew = true
  while (grew) {
    grew = false
    for (const p of all) if (!set.has(p.pid) && set.has(p.ppid)) { set.add(p.pid); grew = true }
  }
  return all.filter((p) => set.has(p.pid))
}
function threadsOf(pid: number): string[] {
  const out: string[] = []
  try {
    for (const t of readdirSync(`/proc/${pid}/task`)) {
      let name = '?', st = '?', wchan = '?', sc = '?'
      try { name = readFileSync(`/proc/${pid}/task/${t}/comm`, 'utf8').trim() } catch { /* */ }
      try {
        const s = readFileSync(`/proc/${pid}/task/${t}/stat`, 'utf8')
        st = s.slice(s.lastIndexOf(')') + 2).split(' ')[0]
      } catch { /* */ }
      try { wchan = readFileSync(`/proc/${pid}/task/${t}/wchan`, 'utf8').trim() } catch { /* */ }
      try { sc = readFileSync(`/proc/${pid}/task/${t}/syscall`, 'utf8').trim().split(' ')[0] } catch { /* */ }
      out.push(`    tid=${t} ${name} st=${st} wchan=${wchan} sysc=${sc}`)
    }
  } catch { /* */ }
  return out
}
function xdo(a: string[], env: NodeJS.ProcessEnv) {
  const r = spawnSync('xdotool', a, { env, encoding: 'utf8', timeout: 10000 })
  return { rc: r.status ?? -1, out: (r.stdout ?? '').trim() }
}
function findLog(root: string): string | null {
  const cands = [
    join(root, '.local/state/GameLib/logs/gamelib.log'),
    join(root, '.config/gamelib/GameLib/logs/gamelib.log')
  ]
  for (const c of cands) if (existsSync(c)) return c
  return null
}

async function main(): Promise<number> {
  for (const e of readdirSync('/proc')) {
    if (!/^\d+$/.test(e)) continue
    try {
      if (readFileSync(`/proc/${e}/comm`, 'utf8').trim() === 'gamelib-shell') {
        console.error(`PREFLIGHT REFUSED: a gamelib-shell is already running (pid ${e})`)
        return 2
      }
    } catch { /* raced */ }
  }
  if (!existsSync(binary!)) { console.error('binary missing'); return 2 }

  const profile = createFakeHomeProfile({ prefix: 'gl-ea0-' })
  const childEnv: NodeJS.ProcessEnv = profile.childEnv(process.env)
  delete childEnv.WEBKIT_DISABLE_DMABUF_RENDERER
  childEnv.GAMELIB_DEV_SECRET_VAULT = '1'
  childEnv.GAMELIB_NODE = process.execPath
  for (const u of args('--unset')) delete childEnv[u]
  for (const s of args('--set')) {
    const eq = s.indexOf('=')
    childEnv[s.slice(0, eq)] = s.slice(eq + 1)
  }
  const outPath = join(profile.root, 'shell.stdout')
  const errPath = join(profile.root, 'shell.stderr')
  const outFd = openSync(outPath, 'w')
  const errFd = openSync(errPath, 'w')
  let shellPid = -1
  const groups = new Set<number>()
  let stopReason = 'unknown'
  const idLines: string[] = []
  const idRec = (k: string, v: string | number | boolean) => idLines.push(`${k}=${v}`)
  const snapPath = ev('state.txt')
  writeFileSync(snapPath, '')
  try {
    const t0 = Date.now()
    const wrap = args('--wrap')
    const cmd = wrap.length ? wrap[0] : binary!
    const cmdArgs = wrap.length ? [...wrap.slice(1), binary!, ...args('--arg')] : args('--arg')
    const child = spawn(cmd, cmdArgs, { detached: true, env: childEnv, stdio: ['ignore', outFd, errFd] })
    shellPid = child.pid ?? -1
    let exited = false
    child.on('exit', (c, s) => { exited = true; appendFileSync(snapPath, `EXIT code=${c} sig=${s} at +${Date.now() - t0}ms\n`) })
    closeSync(outFd); closeSync(errFd)
    if (shellPid <= 1) return 3
    groups.add(shellPid)

    let windowId = ''
    const noWindow = args('--no-window').length > 0
    const deadline = Date.now() + (noWindow ? 0 : 90_000)
    if (noWindow) windowId = 'NOWINDOW'
    while (Date.now() < deadline && !exited) {
      const pidsToTry = wrap.length ? descendants(shellPid).map((d) => d.pid) : [shellPid]
      const found: string[] = []
      for (const pp of pidsToTry) {
        const r = xdo(['search', '--onlyvisible', '--pid', String(pp)], childEnv)
        found.push(...r.out.split('\n').filter(Boolean))
      }
      for (const wid of found) {
        const g = xdo(['getwindowgeometry', '--shell', wid], childEnv).out
        const wm = /WIDTH=(\d+)/.exec(g), hm = /HEIGHT=(\d+)/.exec(g)
        if (wm && hm && Number(wm[1]) >= 300 && Number(hm[1]) >= 300) { windowId = wid; break }
      }
      if (windowId) break
      await sleep(500)
    }
    idRec('WINDOW_ID', windowId || 'NONE')
    idRec('WINDOW_AT_MS', Date.now() - t0)
    idRec('LAUNCH_PID', shellPid)
    idRec('EXE', (() => { try { return realpathSync(`/proc/${shellPid}/exe`) } catch { return '?' } })())
    idRec('DMABUF_VAR', /(^|\0)WEBKIT_DISABLE_DMABUF_RENDERER=([^\0]*)/.exec(readEnviron(shellPid))?.[0]?.replace('\0', '') ?? 'absent')
    idRec('LD_PRELOAD_VAR', /(^|\0)LD_PRELOAD=/.test(readEnviron(shellPid)) ? 'present' : 'absent')
    idRec('SET', args('--set').join(','))
    idRec('UNSET', args('--unset').join(','))
    idRec('ARGS', args('--arg').join(' '))
    writeFileSync(ev('identity.txt'), idLines.join('\n') + '\n')
    console.log(idLines.join('\n'))
    if (!windowId) { stopReason = 'no-window'; return 3 }

    let nextSnap = 0
    let webprocSeen = false
    for (;;) {
      const now = (Date.now() - t0) / 1000
      if (!webprocSeen) {
        const wp = descendants(shellPid).find((d) => d.comm.startsWith('WebKitWebProces'))
        if (wp) {
          webprocSeen = true
          const m = /(^|\0)WEBKIT_DISABLE_DMABUF_RENDERER=([^\0]*)/.exec(readEnviron(wp.pid))
          appendFileSync(
            ev('identity.txt'),
            `WEBPROC_PID=${wp.pid}\nWEBPROC_DMABUF_VAR=${m ? m[2] : 'absent'}\n`
          )
        }
      }
      if (now >= nextSnap) {
        nextSnap = now + (now < 60 ? snapEvery : 30)
        const lines: string[] = [`--- SNAP t=${now.toFixed(1)}s`]
        for (const p of descendants(shellPid)) {
          lines.push(`  pid=${p.pid} ppid=${p.ppid} ${p.comm} st=${p.state}`)
          if (/WebKit|gamelib-shell/.test(p.comm) || p.pid === shellPid) lines.push(...threadsOf(p.pid))
        }
        const lp = findLog(profile.root)
        if (lp) {
          const txt = readFileSync(lp, 'utf8')
          const marks = txt.split('\n').filter((l) => l.includes('BLANKPROBE'))
          lines.push(`  LOG ${lp.replace(profile.root, '<ROOT>')} bytes=${txt.length} blankprobe_lines=${marks.length}`)
          for (const m of marks.slice(-6)) lines.push(`    ${m.slice(0, 200)}`)
        } else lines.push('  LOG none yet')
        appendFileSync(snapPath, lines.join('\n') + '\n')
      }
      for (const p of allProcs()) if (p.ppid === shellPid && p.pgrp > 1) groups.add(p.pgrp)
      if (existsSync(stopFile!)) { stopReason = 'stop-file'; break }
      if (exited) { stopReason = 'child-exit'; break }
      if (now > maxSeconds) { stopReason = 'max-seconds'; break }
      await sleep(1000)
    }
    return 0
  } finally {
    const lines: string[] = [`STOP_REASON=${stopReason}`]
    try { copyFileSync(errPath, ev('stderr.txt')) } catch { /* */ }
    try { copyFileSync(outPath, ev('stdout.txt')) } catch { /* */ }
    const lp = findLog(profile.root)
    if (lp) { try { copyFileSync(lp, ev('gamelib.log')) } catch { /* */ } }
    if (shellPid > 1) {
      lines.push(
        `WEBPROCS_AT_STOP=${descendants(shellPid).filter((d) => d.comm.startsWith('WebKitWebProces') && d.state !== 'Z').length}`
      )
      killPid(shellPid, 'SIGTERM')
      const until = Date.now() + 10_000
      while (Date.now() < until && alive(shellPid)) await sleep(250)
      lines.push(`SHELL_EXITED_AFTER_TERM=${!alive(shellPid)}`)
      for (const g of groups) killGroup(g, 'SIGTERM')
      await sleep(2000)
      for (const g of groups) killGroup(g, 'SIGKILL')
      await sleep(500)
      const stragglers = () =>
        allProcs().filter((p) => p.pid !== process.pid && p.state !== 'Z')
          .filter((p) => readEnviron(p.pid).includes(profile.root) || groups.has(p.pgrp) || p.pid === shellPid)
      for (const p of stragglers()) killPid(p.pid, 'SIGTERM')
      await sleep(1500)
      for (const p of stragglers()) killPid(p.pid, 'SIGKILL')
      await sleep(500)
      const left = stragglers()
      lines.push(`POST_TEARDOWN_PROCS=${left.length}`)
      for (const p of left) lines.push(`LEFT_PID=${p.pid} EXE=${(() => { try { return readlinkSync(`/proc/${p.pid}/exe`) } catch { return '?' } })()}`)
    }
    writeFileSync(ev('teardown.txt'), lines.join('\n') + '\n')
    console.log(lines.join('\n'))
    profile.dispose()
  }
}
main().then((rc) => process.exit(rc), (e) => { console.error(e); process.exit(1) })
