/**
 * appimage_smoke.ts -- fake-HOME harness for quick 260930-9l9 (Phase 38 item 38-W05, sitting 11).
 *
 * Copied from quick 260929-v1v's appimage_smoke.ts at b48e8948f, with these changes:
 *   C2  --tag NAME (suffixes every evidence filename), --env K=V (only with --tag diag),
 *       --commit-needle HEX (census), --input ABS (matchers); SCORED / EXTRA_ENV recorded.
 *   C3  third mode `matchers`: applies the stream census to a file, spawns nothing.
 *   C4  profile prefix gl-w05s11-.
 *   C5  census takes the commit needle from --commit-needle (COMMIT_NEEDLE / COMMIT_BYTES_HITS).
 *   C6  census prints EVERY ABOVE_HOST line and APPRUN_EXEC_LINE.
 *   C7  census static NEEDED-soname check (readelf -d) -> STATIC_NEEDED_UNRESOLVED; PREDICTION
 *       order GLIBC, GLIBCXX, MISSING_LIBS, COMPATIBLE.
 *   C8  stream census over the FULL raw stdout/stderr in `finally`, before excerpt and dispose.
 *   C9  SIDECAR_EXE at s=3, SIDECAR_ALIVE_S10 at s=10.
 *   C10 t=30 observation (shell, sidecar, window, screenshot) and EXIT_EVENT_BEFORE_TEARDOWN.
 *   C11 at the 60s window-wait timeout, list visible windows owned by the launch group
 *       (GROUP_WINDOWS_AT_TIMEOUT); non-empty is a HARNESS defect.
 *   C12 shell-first teardown (SIGTERM the shell pid alone), then sidecar group, then the launch
 *       group remainder; POST_TEARDOWN_WINDOWS negative check.
 *   C13 the diag arm alone passes its --env into the child env.
 *
 *   node meta/runTs.cjs --bundle --platform=node --target=node22 <this file> \
 *     --mode census|smoke|matchers --appimage ABS --evidence ABS --scratch ABS --capture-tool ABS
 *
 * Every mode runs under a FRESH createFakeHomeProfile() that is disposed in `finally`:
 *   census   -- static glibc/contents census via `<appimage> --appimage-extract`. Not a launch.
 *   smoke    -- direct launch, window identity, 11-sample survival, t=30, screenshots, shell-first
 *               teardown, orphan and mount check.
 *   matchers -- stream-census self-test over a text file. Spawns nothing.
 *
 * Kills by pid or process GROUP only. Never by name. Uses absolute args and process.cwd(), never
 * __dirname (runTs compiles into a private temp dir).
 */
import { spawn, spawnSync } from 'node:child_process'
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  readlinkSync,
  writeFileSync
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, relative } from 'node:path'
import { createFakeHomeProfile } from '../../../src/backend/testUtils/fakeHomeProfile'

// ---------------------------------------------------------------- args
function arg(name: string, dflt?: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const mode = arg('--mode')
const appimage = arg('--appimage')
const evidence = arg('--evidence')
const scratch = arg('--scratch')
const captureTool = arg('--capture-tool')
const extraLaunchArg = arg('--extra-arg') // only for the FUSE-absent host branch
const tag = arg('--tag')
const envKv = arg('--env')
const commitNeedle = arg('--commit-needle')
const inputFile = arg('--input')
const realHome = homedir()
const sfx = tag ? `-${tag}` : ''
const fname = (base: string, ext: string) => `${base}${sfx}.${ext}`

const lines: string[] = []
function rec(k: string, v: string | number | boolean): void {
  const l = `${k}=${v}`
  lines.push(l)
  console.log(l)
}
function raw(l: string): void {
  lines.push(l)
  console.log(l)
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)))

// ---------------------------------------------------------------- /proc helpers
interface Stat {
  pid: number
  state: string
  ppid: number
  pgrp: number
  session: number
}
function statOf(pid: number): Stat | null {
  try {
    const s = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const rest = s.slice(s.lastIndexOf(')') + 2).split(' ')
    return {
      pid,
      state: rest[0],
      ppid: Number(rest[1]),
      pgrp: Number(rest[2]),
      session: Number(rest[3])
    }
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
const inGroup = (pgid: number) => allProcs().filter((p) => p.pgrp === pgid)
function exeOf(pid: number): string {
  try {
    return readlinkSync(`/proc/${pid}/exe`)
  } catch {
    return ''
  }
}
function unescapeMount(s: string): string {
  return s.replace(/\\([0-7]{3})/g, (_m, o) => String.fromCharCode(parseInt(o, 8)))
}
function mountFstype(mountPoint: string): string | null {
  for (const l of readFileSync('/proc/self/mountinfo', 'utf8').split('\n')) {
    const parts = l.split(' ')
    if (parts.length < 10) continue
    if (unescapeMount(parts[4]) !== mountPoint) continue
    const dash = parts.indexOf('-')
    return parts[dash + 1]
  }
  return null
}
function appImageMounts(): { mp: string; fstype: string }[] {
  const out: { mp: string; fstype: string }[] = []
  for (const l of readFileSync('/proc/self/mountinfo', 'utf8').split('\n')) {
    const parts = l.split(' ')
    if (parts.length < 10) continue
    const mp = unescapeMount(parts[4])
    if (!/\/\.mount_[^/]+$/.test(mp)) continue
    out.push({ mp, fstype: parts[parts.indexOf('-') + 1] })
  }
  return out
}
function mountPresent(mountPoint: string): boolean {
  return mountFstype(mountPoint) !== null
}

function killGroup(pgid: number, sig: NodeJS.Signals): boolean {
  if (!Number.isInteger(pgid) || pgid <= 1 || pgid === process.pid) return false
  const mine = statOf(process.pid)
  if (mine && mine.pgrp === pgid) return false // never signal our own group
  try {
    process.kill(-pgid, sig)
    return true
  } catch {
    return false
  }
}
function killPid(pid: number, sig: NodeJS.Signals): boolean {
  if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) return false
  try {
    process.kill(pid, sig)
    return true
  } catch {
    return false
  }
}
const aliveNonZombie = (pid: number): boolean => {
  const st = statOf(pid)
  return !!st && st.state !== 'Z'
}

// ---------------------------------------------------------------- X helpers
let childEnvFn: (base?: NodeJS.ProcessEnv) => NodeJS.ProcessEnv
function xdo(args: string[]): { rc: number; out: string } {
  const r = spawnSync('xdotool', args, { env: childEnvFn(), encoding: 'utf8', timeout: 10000 })
  return { rc: r.status ?? -1, out: (r.stdout ?? '').trim() }
}
function visibleWindows(): string[] {
  const r = xdo(['search', '--onlyvisible', '--name', '^GameLib$'])
  return r.rc === 0 && r.out ? r.out.split('\n').filter(Boolean) : []
}
function windowPid(id: string): number {
  const r = xdo(['getwindowpid', id])
  return r.rc === 0 && /^\d+$/.test(r.out) ? Number(r.out) : -1
}
function pyEnv(): NodeJS.ProcessEnv {
  // mss/PIL live in the operator's ~/.local (read-only import); a fake HOME hides them.
  return childEnvFn({
    ...process.env,
    PYTHONPATH: join(realHome, '.local/lib/python3.10/site-packages'),
    PYTHONDONTWRITEBYTECODE: '1'
  })
}
function capture(sub: string[]): { rc: number; out: string } {
  const r = spawnSync('python3', [captureTool as string, ...sub], {
    env: pyEnv(),
    encoding: 'utf8',
    timeout: 30000
  })
  return { rc: r.status ?? -1, out: (r.stdout ?? '') + (r.stderr ?? '') }
}
function pngStats(png: string): string {
  const code =
    'import sys;from PIL import Image,ImageStat;i=Image.open(sys.argv[1]).convert("RGB");' +
    'c=i.getcolors(maxcolors=10**8);s=ImageStat.Stat(i);' +
    'print(len(c) if c else -1, ",".join("%.2f"%x for x in s.stddev), i.size[0], i.size[1])'
  const r = spawnSync('python3', ['-c', code, png], {
    env: pyEnv(),
    encoding: 'utf8',
    timeout: 30000
  })
  return (r.stdout ?? '').trim() || `ERR ${r.stderr}`
}

// ---------------------------------------------------------------- census helpers
function verTuple(s: string): number[] {
  return s.split('.').map(Number)
}
function cmpVer(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}
/** Max version string following `prefix` (e.g. "GLIBC_2.") found anywhere in buf. */
function maxVersion(buf: Buffer, prefix: string): string | null {
  const needle = Buffer.from(prefix, 'latin1')
  let best: number[] | null = null
  let bestStr: string | null = null
  let from = 0
  for (;;) {
    const i = buf.indexOf(needle, from)
    if (i < 0) break
    from = i + needle.length
    let j = from
    while (j < buf.length && ((buf[j] >= 0x30 && buf[j] <= 0x39) || buf[j] === 0x2e)) j++
    const tail = buf.subarray(from, j).toString('latin1').replace(/\.$/, '')
    if (!/^\d+(\.\d+)*$/.test(tail) && tail !== '') continue
    if (tail === '') continue
    const full = prefix + tail
    const digits = full.replace(/^[A-Z]+_/, '')
    const tup = verTuple(digits)
    if (best === null || cmpVer(tup, best) > 0) {
      best = tup
      bestStr = full
    }
  }
  return bestStr
}
function countOccurrences(buf: Buffer, needle: string): number {
  const n = Buffer.from(needle, 'latin1')
  let c = 0
  let from = 0
  for (;;) {
    const i = buf.indexOf(n, from)
    if (i < 0) return c
    c++
    from = i + n.length
  }
}
function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isSymbolicLink()) continue
    if (e.isDirectory()) walk(p, acc)
    else if (e.isFile()) acc.push(p)
  }
  return acc
}
/** Every regular file AND symlink (for soname resolution by basename). */
function walkNames(dir: string, acc: Set<string> = new Set()): Set<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isSymbolicLink()) acc.add(e.name)
    else if (e.isDirectory()) walkNames(p, acc)
    else if (e.isFile()) acc.add(e.name)
  }
  return acc
}
function isElf(p: string): boolean {
  try {
    const fd = openSync(p, 'r')
    const b = Buffer.alloc(4)
    readSync(fd, b, 0, 4, 0)
    closeSync(fd)
    return b.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))
  } catch {
    return false
  }
}

// ---------------------------------------------------------------- stream census (C8)
const STREAM_CLASSES: { key: string; re: RegExp }[] = [
  { key: 'GLIBC_NOT_FOUND_LINES', re: /version `GLIBC_[0-9.]+' not found/ },
  { key: 'GLIBCXX_NOT_FOUND_LINES', re: /version `GLIBCXX_[0-9.]+' not found/ },
  { key: 'MISSING_SO_LINES', re: /error while loading shared libraries|cannot open shared object file/ },
  { key: 'EGL_CONFOUND_LINES', re: /EGL_NOT_INITIALIZED|Could not create GBM EGL display/ },
  { key: 'PANIC_LINES', re: /panicked at/ }
]
function splitLines(text: string): string[] {
  if (text === '') return []
  const a = text.split('\n')
  if (a[a.length - 1] === '') a.pop()
  return a
}
function streamCensus(stdoutText: string, stderrText: string, fakeRoot: string): void {
  const red = (s: string) => s.split(fakeRoot).join('<FAKE_HOME>').split(realHome).join('~').slice(0, 300)
  const out = splitLines(stdoutText)
  const err = splitLines(stderrText)
  rec('STDOUT_LINES', out.length)
  rec('STDERR_LINES', err.length)
  const all = [...out, ...err]
  for (const cls of STREAM_CLASSES) {
    const hits = all.filter((l) => cls.re.test(l))
    rec(cls.key, hits.length)
    for (const l of hits.slice(0, 5)) raw(`STREAM_MATCH ${cls.key} ${red(l)}`)
  }
}

// ---------------------------------------------------------------- main
async function main(): Promise<void> {
  const modeOk = !!mode && ['census', 'smoke', 'matchers'].includes(mode)
  const commonOk = !!evidence && !!scratch && !!captureTool
  const modeArgsOk =
    mode === 'matchers' ? !!inputFile : !!appimage && (mode !== 'census' || !!commitNeedle)
  if (!modeOk || !commonOk || !modeArgsOk) {
    console.error(
      'usage: --mode census|smoke|matchers --appimage ABS --evidence ABS --scratch ABS --capture-tool ABS ' +
        '[--tag NAME] [--commit-needle HEX (census)] [--input ABS (matchers)] [--env K=V (only with --tag diag)]'
    )
    process.exit(2)
  }
  if (envKv !== undefined && tag !== 'diag') {
    console.error('usage error: --env is only permitted together with --tag diag (a scored run never carries a workaround)')
    process.exit(2)
  }
  if (envKv !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(envKv)) {
    console.error('usage error: --env must be KEY=VALUE')
    process.exit(2)
  }
  mkdirSync(evidence as string, { recursive: true })
  mkdirSync(scratch as string, { recursive: true })
  const profile = createFakeHomeProfile({ prefix: 'gl-w05s11-' })
  childEnvFn = (b) => profile.childEnv(b)
  rec('FAKE_HOME', 'createFakeHomeProfile')
  rec('MODE', mode as string)
  rec('SCORED', tag ? 'no' : 'yes')
  rec('EXTRA_ENV', envKv ?? '(none)')
  let harnessOk = false
  const groupsToReap: number[] = []
  let outFile = ''
  let errFile = ''
  try {
    if (mode === 'census') {
      await census(profile.root)
      harnessOk = true
    } else if (mode === 'matchers') {
      const text = readFileSync(inputFile as string, 'utf8')
      rec('MATCHERS_INPUT', basename(inputFile as string))
      streamCensus('', text, profile.root)
      harnessOk = true
    } else {
      const stamp = Date.now()
      outFile = join(scratch as string, `w05s11-app-${stamp}.stdout`)
      errFile = join(scratch as string, `w05s11-app-${stamp}.stderr`)
      profile.registerCapture(outFile)
      profile.registerCapture(errFile)
      harnessOk = await smoke(profile.root, outFile, errFile, groupsToReap)
    }
  } catch (e) {
    rec('HARNESS_ERROR', String((e as Error).stack ?? e).replace(/\n/g, ' | '))
  } finally {
    for (const g of groupsToReap) {
      if (inGroup(g).length) {
        killGroup(g, 'SIGTERM')
        await sleep(3000)
        if (inGroup(g).length) killGroup(g, 'SIGKILL')
      }
    }
    if (mode === 'smoke') {
      // C8: census the FULL raw streams and excerpt them BEFORE dispose, with paths redacted.
      try {
        const outText = existsSync(outFile) ? readFileSync(outFile, 'utf8') : ''
        const errText = existsSync(errFile) ? readFileSync(errFile, 'utf8') : ''
        streamCensus(outText, errText, profile.root)
        const red = (s: string) =>
          s.split(profile.root).join('<FAKE_HOME>').split(realHome).join('~').slice(0, 300)
        const ex: string[] = []
        for (const [label, text] of [
          ['stdout', outText],
          ['stderr', errText]
        ] as const) {
          const all = text.split('\n')
          ex.push(`=== ${label}: ${all.length} lines total; first 40 / last 40 ===`)
          if (all.length <= 80) ex.push(...all.map(red))
          else {
            ex.push(...all.slice(0, 40).map(red))
            ex.push(`... [${all.length - 80} lines omitted] ...`)
            ex.push(...all.slice(-40).map(red))
          }
        }
        writeFileSync(join(evidence as string, fname('app-output-excerpt', 'txt')), ex.join('\n') + '\n')
      } catch (e) {
        rec('EXCERPT_ERROR', String(e))
      }
    }
    const root = profile.root
    profile.dispose()
    rec('DISPOSED', existsSync(root) ? 'no' : 'yes')
    rec('HARNESS_OK', harnessOk ? 1 : 0)
    const outName =
      mode === 'census'
        ? fname('census-run', 'txt')
        : mode === 'matchers'
          ? fname('matchers', 'txt')
          : fname('smoke-run', 'txt')
    writeFileSync(join(evidence as string, outName), lines.join('\n') + '\n')
  }
}

// ---------------------------------------------------------------- census
async function census(root: string): Promise<void> {
  const r = spawnSync(appimage as string, ['--appimage-extract'], {
    cwd: root,
    env: childEnvFn(),
    encoding: 'utf8',
    timeout: 300000,
    maxBuffer: 1 << 28
  })
  const sq = join(root, 'squashfs-root')
  const cen: string[] = []
  const c = (k: string, v: string | number) => {
    cen.push(`${k}=${v}`)
    rec(k, v)
  }
  c('CENSUS_EXTRACT_RC', r.status ?? `signal:${r.signal}`)
  const hostGlibc = spawnSync('getconf', ['GNU_LIBC_VERSION'], { encoding: 'utf8' }).stdout.trim()
  c('HOST_GLIBC', hostGlibc)
  const hostTuple = verTuple(hostGlibc.replace(/^glibc /, ''))
  if (!existsSync(sq)) throw new Error('no squashfs-root produced')

  const files = walk(sq)
  let maxG: string | null = null
  let maxGFile = ''
  let maxX: string | null = null
  let maxXFile = ''
  const above: string[] = []
  const elfs: string[] = []
  let elfCount = 0
  for (const f of files) {
    if (!isElf(f)) continue
    elfCount++
    elfs.push(f)
    const buf = readFileSync(f)
    const g = maxVersion(buf, 'GLIBC_2.')
    const x = maxVersion(buf, 'GLIBCXX_3.4.')
    if (g) {
      const t = verTuple(g.replace('GLIBC_', ''))
      if (!maxG || cmpVer(t, verTuple(maxG.replace('GLIBC_', ''))) > 0) {
        maxG = g
        maxGFile = relative(sq, f)
      }
      if (cmpVer(t, hostTuple) > 0) above.push(`ABOVE_HOST ${relative(sq, f)} ${g}`)
    }
    if (x && (!maxX || cmpVer(verTuple(x.replace('GLIBCXX_', '')), verTuple(maxX.replace('GLIBCXX_', ''))) > 0)) {
      maxX = x
      maxXFile = relative(sq, f)
    }
  }
  c('ELF_FILES_SCANNED', elfCount)
  c('REQUIRED_GLIBC_MAX', `${maxG ?? 'none'} (${maxGFile})`)
  c('FILES_ABOVE_HOST_GLIBC', above.length)
  for (const l of above) {
    cen.push(l)
    raw(l)
  }
  // Host libstdc++ (follow the symlink; this is the host's own file, read-only).
  const hostStd = '/usr/lib/x86_64-linux-gnu/libstdc++.so.6'
  const hostX = maxVersion(readFileSync(hostStd), 'GLIBCXX_3.4.')
  c('HOST_GLIBCXX_MAX', hostX ?? 'none')
  c('REQUIRED_GLIBCXX_MAX', `${maxX ?? 'none'} (${maxXFile})`)
  const names = files.map((f) => basename(f))
  const stdBundled = names.filter((n) => /^libstdc\+\+\.so/.test(n))
  const cBundled = names.filter((n) => /^(libc\.so\.6|ld-linux-x86-64\.so\.2|libc-2\.\d+\.so)$/.test(n))
  c('LIBSTDCXX_BUNDLED', stdBundled.length ? `yes (${stdBundled.join(',')})` : 'no')
  c('LIBC_BUNDLED', cBundled.length ? `yes (${cBundled.join(',')})` : 'no')
  const usrBin = join(sq, 'usr/bin')
  const usrBinList = existsSync(usrBin) ? readdirSync(usrBin) : []
  c('USR_BIN', usrBinList.join(','))
  const desktops = readdirSync(sq).filter((n) => n.endsWith('.desktop'))
  for (const d of desktops) {
    const body = readFileSync(join(sq, d), 'utf8')
    for (const key of ['Name', 'Exec', 'Version']) {
      const m = body.match(new RegExp(`^${key}=(.*)$`, 'm'))
      c(`DESKTOP_${key.toUpperCase()}`, m ? m[1] : '')
    }
  }
  let kind = 'missing'
  let appRunExec = ''
  const ar = join(sq, 'AppRun')
  if (existsSync(ar) || lstatSync(ar, { throwIfNoEntry: false })) {
    const ls = lstatSync(ar)
    if (ls.isSymbolicLink()) kind = `symlink->${readlinkSync(ar)}`
    else {
      const body = readFileSync(ar)
      const head = body.subarray(0, 4)
      const isScript = head.subarray(0, 2).toString() === '#!'
      kind = isScript ? 'script' : head.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ? 'ELF' : 'other'
      if (isScript) {
        const ex = body
          .toString('utf8')
          .split('\n')
          .filter((l) => /\bexec\b/.test(l))
        if (ex.length) appRunExec = ex[ex.length - 1].trim().slice(0, 200)
      }
    }
  }
  c('APPRUN_KIND', kind)
  c('APPRUN_EXEC_LINE', appRunExec)
  let hits = 0
  const hitFiles: string[] = []
  for (const n of usrBinList) {
    const p = join(usrBin, n)
    const ls = lstatSync(p)
    if (!ls.isFile()) continue
    const k = countOccurrences(readFileSync(p), commitNeedle as string)
    if (k) hitFiles.push(`${n}:${k}`)
    hits += k
  }
  c('COMMIT_NEEDLE', commitNeedle as string)
  c('COMMIT_BYTES_HITS', `${hits}${hitFiles.length ? ' (' + hitFiles.join(',') + ')' : ''}`)

  // C7: static NEEDED check.
  let unresolved: string[] | 'SKIP' = []
  const provided = walkNames(sq)
  const ldc = spawnSync('ldconfig', ['-p'], { encoding: 'utf8' })
  const ldcOut = ldc.status === 0 ? ldc.stdout : spawnSync('/sbin/ldconfig', ['-p'], { encoding: 'utf8' }).stdout ?? ''
  const sysSonames = new Set<string>()
  for (const l of ldcOut.split('\n')) {
    const m = l.match(/^\s+(\S+)\s+\(/)
    if (m) sysSonames.add(m[1])
  }
  let neededTotal = 0
  const unresolvedMap = new Map<string, string>()
  const probe = spawnSync('readelf', ['-v'], { encoding: 'utf8' })
  if (probe.error || probe.status !== 0) {
    unresolved = 'SKIP'
  } else {
    for (const f of elfs) {
      const rd = spawnSync('readelf', ['-d', f], { encoding: 'utf8', maxBuffer: 1 << 26 })
      for (const l of (rd.stdout ?? '').split('\n')) {
        const m = l.match(/\(NEEDED\)\s+Shared library: \[([^\]]+)\]/)
        if (!m) continue
        neededTotal++
        const so = m[1]
        if (!provided.has(so) && !sysSonames.has(so) && !unresolvedMap.has(so)) unresolvedMap.set(so, relative(sq, f))
      }
    }
    unresolved = [...unresolvedMap.keys()]
  }
  c('STATIC_NEEDED_TOTAL', unresolved === 'SKIP' ? 'SKIP' : neededTotal)
  c('STATIC_NEEDED_UNRESOLVED', unresolved === 'SKIP' ? 'SKIP' : unresolved.length)
  if (unresolved !== 'SKIP')
    for (const so of unresolved) {
      const l = `UNRESOLVED ${so} ${unresolvedMap.get(so)}`
      cen.push(l)
      raw(l)
    }

  let prediction = 'COMPATIBLE'
  if (above.length > 0) prediction = 'GLIBC_INCOMPATIBLE'
  else if (
    maxX &&
    hostX &&
    !stdBundled.length &&
    cmpVer(verTuple(maxX.replace('GLIBCXX_', '')), verTuple(hostX.replace('GLIBCXX_', ''))) > 0
  )
    prediction = 'GLIBCXX_INCOMPATIBLE'
  else if (unresolved !== 'SKIP' && unresolved.length > 0) prediction = 'MISSING_LIBS'
  c('PREDICTION', prediction)
  c(
    'CENSUS_CAVEAT',
    'string scan of version-reference names; cannot separate a needed symbol from a defined one, and counts every ELF in the image whether or not the launch path loads it; the NEEDED check ignores RPATH/RUNPATH and dlopen\'d libraries'
  )
  writeFileSync(join(evidence as string, fname('census', 'txt')), cen.join('\n') + '\n')
}

// ---------------------------------------------------------------- smoke
async function smoke(root: string, outFile: string, errFile: string, groupsToReap: number[]): Promise<boolean> {
  // 1. preflight
  const display = process.env.DISPLAY
  const xauth = process.env.XAUTHORITY
  rec('DISPLAY', display ?? '')
  rec('XAUTHORITY', xauth ?? '')
  if (!display) {
    rec('PREFLIGHT_FAIL', 'DISPLAY unset')
    return false
  }
  if (!xauth || xauth.startsWith(realHome)) {
    rec('PREFLIGHT_FAIL', 'XAUTHORITY unset or inside the real HOME')
    return false
  }
  const pre = visibleWindows()
  rec('PRE_WINDOWS', pre.length)
  if (pre.length !== 0) {
    rec('PREFLIGHT_FAIL', 'a GameLib window is already visible')
    return false
  }
  rec('LAUNCH_ARGS', extraLaunchArg ? extraLaunchArg : '(none)')

  // 2. spawn
  const mountsBefore = new Set(appImageMounts().map((m) => m.mp))
  rec('APPIMAGE_MOUNTS_BEFORE', mountsBefore.size)
  const outFd = openSync(outFile, 'w')
  const errFd = openSync(errFile, 'w')
  const T0 = Date.now()
  rec('LAUNCH_DATE', new Date(T0).toISOString())
  const child = spawn(appimage as string, extraLaunchArg ? [extraLaunchArg] : [], {
    detached: true,
    cwd: root,
    env: profile_env(),
    stdio: ['ignore', outFd, errFd]
  })
  closeSync(outFd)
  closeSync(errFd)
  const launchPid = child.pid as number
  const ls = statOf(launchPid)
  const launchPgid = ls ? ls.pgrp : launchPid
  const launchSid = ls ? ls.session : launchPid
  groupsToReap.push(launchPgid)
  rec('LAUNCH_PID', launchPid)
  rec('LAUNCH_PGID', launchPgid)
  rec('LAUNCH_SID', launchSid)
  rec('SETSID_PROVEN', launchPgid === launchPid && launchSid === launchPid ? 'yes' : 'no')
  let exited = false
  let exitInfo = ''
  child.on('exit', (code, sig) => {
    exited = true
    exitInfo = `code=${code} signal=${sig} t_ms=${Date.now() - T0}`
  })
  child.on('error', (e) => {
    exited = true
    exitInfo = `spawn_error=${e}`
  })

  // 3. window wait
  let windowId = ''
  let shellPid = -1
  let pgidMatch = false
  let tW = 0
  let mountDir = ''
  let shellExe = ''
  let pgidNoMatchNote = ''
  const deadline = T0 + 60000
  let observedMount = ''
  while (Date.now() < deadline && !exited && !windowId) {
    if (!observedMount) {
      const nm = appImageMounts().find((m) => !mountsBefore.has(m.mp))
      if (nm) {
        observedMount = nm.mp
        rec('FIRST_NEW_APPIMAGE_MOUNT', `${nm.mp} fstype=${nm.fstype} t_ms=${Date.now() - T0}`)
      }
    }
    for (const id of visibleWindows()) {
      const wp = windowPid(id)
      const st = wp > 0 ? statOf(wp) : null
      if (!st) continue
      if (st.pgrp === launchPgid) {
        windowId = id
        shellPid = wp
        pgidMatch = true
        tW = Date.now()
        break
      }
      pgidNoMatchNote = `window ${id} pid=${wp} pgrp=${st.pgrp} exe=${exeOf(wp)}`
    }
    if (!windowId) await sleep(250)
  }
  if (pgidNoMatchNote) rec('WINDOW_PGID_MISMATCH_NOTE', pgidNoMatchNote)
  rec('CHILD_EXIT_BEFORE_WINDOW', exited ? exitInfo : 'no')
  if (!observedMount) {
    const nm = appImageMounts().find((m) => !mountsBefore.has(m.mp))
    if (nm) observedMount = nm.mp
  }
  rec('OBSERVED_APPIMAGE_MOUNT', observedMount || '(none seen)')
  if (!windowId) {
    // C11: at the 60s timeout with the group still alive, any visible window owned by a group
    // member means the exact-title premise failed: a HARNESS defect, not an app FAIL.
    let harnessOkNoWindow = true
    if (!exited && inGroup(launchPgid).length) {
      const found: string[] = []
      for (const p of inGroup(launchPgid)) {
        const r = xdo(['search', '--onlyvisible', '--pid', String(p.pid)])
        if (r.rc === 0 && r.out)
          for (const id of r.out.split('\n').filter(Boolean)) {
            const n = xdo(['getwindowname', id])
            found.push(`${id}:${n.out}`)
          }
      }
      rec('GROUP_WINDOWS_AT_TIMEOUT', found.length ? found.join(',') : 'none')
      if (found.length) harnessOkNoWindow = false
    }
    rec('WINDOW_APPEARED', 'no')
    rec('PGID_MATCH', 'no')
    rec('DIRECT_LAUNCH', 'unknown')
    rec('SURVIVED_10S', 'no')
    await teardown(launchPgid, -1, -1, -1, observedMount, T0)
    return harnessOkNoWindow
  }
  rec('WINDOW_APPEARED', 'yes')
  rec('T_W_ISO', new Date(tW).toISOString())
  rec('TIME_TO_WINDOW_MS', tW - T0)
  rec('WINDOW_ID', windowId)
  rec('PGID_MATCH', pgidMatch ? 'yes' : 'no')
  rec('SHELL_PID', shellPid)
  rec('SHELL_PID_EQ_LAUNCH_PID', shellPid === launchPid ? 'yes' : 'no')
  shellExe = exeOf(shellPid)
  rec('SHELL_EXE', shellExe)
  const mm = shellExe.match(/^(.*?\/\.mount_[^/]+)/)
  mountDir = mm ? mm[1] : ''
  rec('MOUNT_DIR', mountDir)
  const fst = mountDir ? mountFstype(mountDir) : null
  rec('MOUNT_FSTYPE', fst ?? '')
  const mountIsFuse = !!fst && fst.startsWith('fuse')
  rec('MOUNT_IS_FUSE', mountIsFuse ? 'yes' : 'no')
  rec('DIRECT_LAUNCH', mountIsFuse && !shellExe.includes('appimage_extracted_') && !extraLaunchArg ? 'yes' : 'no')

  // 4/5. samples s=0..10 at T_W + s*1000; evidence at s=3
  let sidecarPid = -1
  let sidecarPgid = -1
  let sidecarExe = ''
  let allOk = true
  let tenElapsed = -1
  for (let s = 0; s <= 10; s++) {
    await sleep(tW + s * 1000 - Date.now())
    const st = statOf(shellPid)
    const alive = !!st && st.state !== 'Z'
    const vis = visibleWindows().includes(windowId)
    const samePid = vis && windowPid(windowId) === shellPid
    const tms = Date.now() - tW
    raw(
      `SAMPLE s=${s} t_ms=${tms} shell_alive=${alive ? 'y' : 'n'} state=${st ? st.state : '-'} window_visible=${vis ? 'y' : 'n'} same_pid=${samePid ? 'y' : 'n'}`
    )
    if (!alive || !vis || !samePid || exited) allOk = false
    if (s === 3) {
      const f = capture(['find'])
      rec('CAP_FIND', f.out.replace(/\s+/g, ' '))
      try {
        const j = JSON.parse(f.out)
        rec('CAP_FIND_PID_EQ_SHELL_PID', String(j.pid) === String(shellPid) ? 'yes' : 'no')
      } catch {
        rec('CAP_FIND_PID_EQ_SHELL_PID', 'unparsed')
      }
      const g = capture(['grab', '--out', join(evidence as string, fname('window', 'png'))])
      rec('CAP_GRAB_1', g.out.replace(/\s+/g, ' '))
      // descendants of the shell
      const procs = allProcs()
      const kids: Stat[] = []
      const seen = new Set<number>([shellPid])
      let grew = true
      while (grew) {
        grew = false
        for (const p of procs) if (!seen.has(p.pid) && seen.has(p.ppid)) {
          seen.add(p.pid)
          kids.push(p)
          grew = true
        }
      }
      for (const k of kids) {
        const e = exeOf(k.pid)
        rec('CHILD', `pid=${k.pid} ppid=${k.ppid} pgrp=${k.pgrp} exe=${e}`)
        if (basename(e) === 'gamelib-sidecar' && sidecarPid < 0) {
          sidecarPid = k.pid
          sidecarPgid = k.pgrp
          sidecarExe = e
        }
      }
      rec('SIDECAR_PID', sidecarPid)
      rec('SIDECAR_PGID', sidecarPgid)
      rec('SIDECAR_EXE', sidecarExe)
      rec('SIDECAR_BUNDLED', sidecarPid > 0 && mountDir && sidecarExe.startsWith(mountDir + '/') ? 'yes' : 'no')
      if (sidecarPgid > 1 && sidecarPgid !== launchPgid) groupsToReap.push(sidecarPgid)
      try {
        rec('MOUNT_USR_BIN', readdirSync(join(mountDir, 'usr/bin')).join(','))
      } catch (e) {
        rec('MOUNT_USR_BIN', `ERR ${e}`)
      }
    }
    if (s === 10) {
      tenElapsed = Date.now() - T0
      const g = capture(['grab', '--out', join(evidence as string, fname('window-t10', 'png'))])
      rec('CAP_GRAB_2', g.out.replace(/\s+/g, ' '))
      // C9: sidecar identity and liveness at s=10.
      const sst = sidecarPid > 0 ? statOf(sidecarPid) : null
      rec(
        'SIDECAR_ALIVE_S10',
        sidecarPid > 0 && !!sst && sst.state !== 'Z' && exeOf(sidecarPid) === sidecarExe ? 'yes' : 'no'
      )
    }
  }
  rec('ELAPSED_FROM_T0_AT_S10_MS', tenElapsed)
  rec('EXIT_EVENT_DURING_SURVIVAL', exited ? exitInfo : 'no')
  rec('SURVIVED_10S', allOk && !exited ? 'yes' : 'no')

  // 6. pixel stats
  rec('WINDOW_PNG_COLOURS', pngStats(join(evidence as string, fname('window', 'png'))))
  rec('WINDOW_T10_PNG_COLOURS', pngStats(join(evidence as string, fname('window-t10', 'png'))))

  // C10: t=30 observation.
  await sleep(tW + 30000 - Date.now())
  const st30 = statOf(shellPid)
  rec('SHELL_ALIVE_T30', !!st30 && st30.state !== 'Z' ? 'yes' : 'no')
  const sc30 = sidecarPid > 0 ? statOf(sidecarPid) : null
  rec('SIDECAR_ALIVE_T30', sidecarPid > 0 && !!sc30 && sc30.state !== 'Z' && exeOf(sidecarPid) === sidecarExe ? 'yes' : 'no')
  const vis30 = visibleWindows().includes(windowId)
  const same30 = vis30 && windowPid(windowId) === shellPid
  rec('WINDOW_VISIBLE_T30', `${vis30 ? 'yes' : 'no'} same_pid=${same30 ? 'yes' : 'no'}`)
  const g30 = capture(['grab', '--out', join(evidence as string, fname('window-t30', 'png'))])
  rec('CAP_GRAB_3', g30.out.replace(/\s+/g, ' '))
  rec('WINDOW_T30_PNG_COLOURS', pngStats(join(evidence as string, fname('window-t30', 'png'))))
  rec('EXIT_EVENT_BEFORE_TEARDOWN', exited ? exitInfo : 'no')

  // 7. teardown
  await teardown(launchPgid, sidecarPgid, sidecarPid, shellPid, mountDir, T0)
  return true
}

function profile_env(): NodeJS.ProcessEnv {
  // C13: only the diag arm carries an env override; every other run is childEnvFn() exactly.
  if (tag === 'diag' && envKv) {
    const i = envKv.indexOf('=')
    return childEnvFn({ ...process.env, [envKv.slice(0, i)]: envKv.slice(i + 1) })
  }
  return childEnvFn()
}

async function teardown(
  launchPgid: number,
  sidecarPgid: number,
  sidecarPid: number,
  shellPid: number,
  mountDir: string,
  _t0: number
): Promise<void> {
  const tTerm = Date.now()
  rec('T_TERM_ISO', new Date(tTerm).toISOString())
  const trackSidecar = sidecarPgid > 1 && sidecarPgid !== launchPgid
  const sidecarIsGone = (): boolean =>
    trackSidecar ? inGroup(sidecarPgid).length === 0 : sidecarPid > 0 ? !aliveNonZombie(sidecarPid) : true
  let sidecarGone = -1
  let sidecarOrphan = false
  let sidecarTermed = false
  let sidecarKilledAt = -1

  if (shellPid > 1) {
    // C12: the FUSE server in the launch group serves the sidecar's executable pages, so killing it
    // together with the shell would confound the stdin-EOF drain observation: signal the shell alone.
    rec('SIGTERM_TO_SHELL_PID', `${shellPid} ${killPid(shellPid, 'SIGTERM') ? 'sent' : 'not-sent'}`)
    let shellGone = -1
    let shellKilled = false
    for (;;) {
      const el = Date.now() - tTerm
      if (shellGone < 0 && !aliveNonZombie(shellPid)) shellGone = el
      if (trackSidecar || sidecarPid > 0) {
        if (sidecarGone < 0 && sidecarIsGone()) sidecarGone = el
      }
      if (shellGone < 0 && el > 10000 && !shellKilled) {
        shellKilled = true
        rec('SIGKILL_TO_SHELL_AT_MS', el)
        killPid(shellPid, 'SIGKILL')
      }
      if (shellGone >= 0) break
      if (el > 60000) break
      await sleep(250)
    }
    rec('SHELL_GONE_MS', shellGone)
    // (b) sidecar group
    for (;;) {
      const el = Date.now() - tTerm
      if (sidecarGone < 0 && sidecarIsGone()) sidecarGone = el
      if (sidecarGone < 0 && trackSidecar && el > 120000 && !sidecarTermed) {
        sidecarOrphan = true
        sidecarTermed = true
        rec('SIDECAR_ORPHAN_SIGTERM_AT_MS', el)
        killGroup(sidecarPgid, 'SIGTERM')
        sidecarKilledAt = el + 5000
      }
      if (sidecarTermed && sidecarGone < 0 && el > sidecarKilledAt) {
        rec('SIDECAR_ORPHAN_SIGKILL_AT_MS', el)
        killGroup(sidecarPgid, 'SIGKILL')
        sidecarKilledAt = Number.MAX_SAFE_INTEGER
      }
      if (sidecarGone >= 0) break
      if (!trackSidecar && sidecarPid <= 0) {
        sidecarGone = el
        break
      }
      if (el > 150000) break
      await sleep(250)
    }
    rec('SIDECAR_GONE_MS', sidecarGone)
    rec('SIDECAR_EXIT_S', sidecarGone >= 0 ? (sidecarGone / 1000).toFixed(2) : 'never')
    rec('SIDECAR_ORPHAN', sidecarOrphan ? 'yes' : 'no')
    rec('SIDECAR_GROUP_DISTINCT_FROM_LAUNCH', trackSidecar ? 'yes' : 'no')
    // (c) launch group remainder (the runtime's FUSE server is expected)
    const rem = inGroup(launchPgid)
    rec('LAUNCH_GROUP_REMAINDER', rem.length ? rem.map((p) => `${p.pid}:${exeOf(p.pid) || '?'}(${p.state})`).join(',') : 'none')
    const tRem = Date.now()
    let selfExit = -1
    while (Date.now() - tRem < 10000) {
      if (inGroup(launchPgid).length === 0) {
        selfExit = Date.now() - tRem
        break
      }
      await sleep(250)
    }
    rec('LAUNCH_GROUP_SELF_EXIT_MS', selfExit)
    if (selfExit < 0) {
      rec('SIGTERM_TO_LAUNCH_GROUP', killGroup(launchPgid, 'SIGTERM') ? 'sent' : 'not-sent(no such group)')
      const tG = Date.now()
      while (Date.now() - tG < 5000 && inGroup(launchPgid).length) await sleep(250)
      if (inGroup(launchPgid).length) {
        rec('SIGKILL_TO_LAUNCH_GROUP', killGroup(launchPgid, 'SIGKILL') ? 'sent' : 'not-sent')
        await sleep(1000)
      }
    }
  } else {
    // No window ever appeared: the source's group-TERM path.
    rec('SIGTERM_TO_LAUNCH_GROUP', killGroup(launchPgid, 'SIGTERM') ? 'sent' : 'not-sent(no such group)')
    let launchGone = -1
    let launchKilled = false
    for (;;) {
      const el = Date.now() - tTerm
      if (launchGone < 0 && inGroup(launchPgid).length === 0) launchGone = el
      if (launchGone < 0 && el > 10000 && !launchKilled) {
        launchKilled = true
        rec('SIGKILL_TO_LAUNCH_GROUP_AT_MS', el)
        killGroup(launchPgid, 'SIGKILL')
      }
      if (launchGone >= 0) break
      if (el > 60000) break
      await sleep(250)
    }
    rec('LAUNCH_GROUP_GONE_MS', launchGone)
    rec('SIDECAR_GONE_MS', launchGone)
    rec('SIDECAR_EXIT_S', launchGone >= 0 ? (launchGone / 1000).toFixed(2) : 'never')
    rec('SIDECAR_ORPHAN', 'no')
    rec('SIDECAR_GROUP_DISTINCT_FROM_LAUNCH', 'no')
  }
  // (d) The mount can lag the process exit; give it a bounded moment.
  let mountGone = !mountDir || !mountPresent(mountDir)
  for (let i = 0; i < 40 && !mountGone; i++) {
    await sleep(250)
    mountGone = !mountPresent(mountDir)
  }
  rec('MOUNT_GONE', mountGone ? 'yes' : 'no')
  const leftovers = allProcs().filter((p) => p.pgrp === launchPgid || (sidecarPgid > 1 && p.pgrp === sidecarPgid))
  rec('LEFTOVER_PROCS', leftovers.length)
  rec('NO_ORPHANS', leftovers.length === 0 && mountGone ? 'yes' : 'no')
  // Nothing under the launch dir's mount may remain either.
  if (mountDir) rec('MOUNT_DIR_EXISTS_ON_DISK', existsSync(mountDir) ? 'yes' : 'no')
  // (e) the same window query that found the window must now find nothing.
  rec('POST_TEARDOWN_WINDOWS', visibleWindows().length)
}

void main()
