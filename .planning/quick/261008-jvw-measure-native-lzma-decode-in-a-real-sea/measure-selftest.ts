/**
 * measure-selftest.ts -- bounded, fake-HOME driver for quick 261008-jvw.
 *
 * WHAT IT MEASURES: runs the compiled SEA sidecar binary in
 * `src-tauri/binaries/` N times with GAMELIB_SIDECAR_SELFTEST=decompress-pool
 * and records, per run, the `SELFTEST pool=` JSON (size / inlineFallback /
 * nativeWorkers) and the `SELFTEST decode=` line. That answers whether the
 * native lzma decode path (when locally forced on at build time) actually
 * engages and decodes a real VZ/AES/SHA-1 chunk inside a real compiled SEA
 * binary, and -- with --expect-native-workers 0 -- that a shipped-state
 * binary is pure-JS.
 *
 *   node meta/runTs.cjs --bundle --platform=node --target=node22 \
 *     .planning/quick/261008-jvw-measure-native-lzma-decode-in-a-real-sea/measure-selftest.ts \
 *     --label native --runs 20 --expect-native-workers 2 --out <abs-or-cwd-relative dir>
 *
 * WHY ISOLATED-ONLY (two-profile rule, Skill gamelib-conventions): the
 * `decompress-pool` self-test branch never calls `init()`
 * (src/sidecar/index.ts L71-75), so no profile-dependent code is reachable;
 * a real-profile arm would add exposure (real session data into a committed
 * capture) without adding coverage. Every run gets a FRESH
 * createFakeHomeProfile(), disposed in `finally`.
 *
 * Bounding is done here (spawn + kill timer) because `timeout`/`gtimeout` are
 * not installed. Paths resolve against process.cwd(); `__dirname` is a runTs
 * private temp dir and must not be used. Kills by pid only, never by name.
 */
import { spawn, spawnSync } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join, resolve } from 'node:path'
import { createFakeHomeProfile } from '../../../src/backend/testUtils/fakeHomeProfile'

function arg(name: string, dflt?: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}

const label = arg('--label')
const runs = Number(arg('--runs', '1'))
const expectNative = Number(arg('--expect-native-workers'))
const outArg = arg('--out')

if (
  !label ||
  !outArg ||
  !Number.isInteger(runs) ||
  runs < 1 ||
  !Number.isInteger(expectNative)
) {
  console.error(
    'usage: --label L --runs N --expect-native-workers K --out DIR (all required)'
  )
  process.exit(2)
}

const OUT = resolve(process.cwd(), outArg)
mkdirSync(OUT, { recursive: true })

const STALL_SAMPLE_MS = 8_000
const KILL_MS = 60_000

function sh(cmd: string, args: string[]): string {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 30_000 })
    return `$ ${cmd} ${args.join(' ')}\n${r.stdout ?? ''}${r.stderr ?? ''}\n`
  } catch (e) {
    return `$ ${cmd} ${args.join(' ')}\n(failed: ${String(e)})\n`
  }
}

function systemSnapshot(): string {
  return [
    `# ${new Date().toISOString()}\n`,
    sh('uptime', []),
    sh('sysctl', ['vm.swapusage', 'kern.memorystatus_vm_pressure_level']),
    sh('vm_stat', []),
    sh('pmset', ['-g', 'therm']),
    sh('top', ['-l', '1', '-n', '15', '-o', 'cpu', '-stats', 'pid,command,cpu,mem'])
  ].join('\n')
}

// a. locate exactly one binary
const binDir = resolve(process.cwd(), 'src-tauri/binaries')
const bins = readdirSync(binDir).filter((f) => f.startsWith('gamelib-sidecar-'))
if (bins.length !== 1) {
  console.error(`expected exactly one gamelib-sidecar-* in ${binDir}, found ${bins.length}`)
  process.exit(2)
}
const binary = join(binDir, bins[0])
const bst = statSync(binary)
const driverTxt = join(OUT, `${label}-driver.txt`)
const git = (a: string[]) =>
  (spawnSync('git', a, { encoding: 'utf8', timeout: 30_000 }).stdout ?? '').trim()

writeFileSync(
  driverTxt,
  [
    `label=${label} runs=${runs} expectNativeWorkers=${expectNative}`,
    `timestamp=${new Date().toISOString()}`,
    `HEAD=${git(['rev-parse', 'HEAD'])}`,
    `git diff --stat -- src:\n${git(['diff', '--stat', '--', 'src']) || '(empty -- src matches HEAD)'}`,
    `binary=${binary}`,
    `size=${bst.size} mtime=${bst.mtime.toISOString()}`,
    ''
  ].join('\n')
)

// b. before-snapshot
writeFileSync(join(OUT, `${label}-system-before.txt`), systemSnapshot())

interface RunResult {
  run: number
  wallMs: number
  exit: number | null
  signal: string | null
  nativeWorkers: number | string
  inlineFallback: boolean | string
  decode: string
  pass: boolean
}

function collectLzmaLogLines(root: string): string[] {
  const hits: string[] = []
  const walk = (dir: string, depth: number) => {
    if (depth > 6) return
    let ents: import('node:fs').Dirent[] = []
    try {
      ents = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of ents) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p, depth + 1)
      else if (e.isFile() && e.name.endsWith('.log')) {
        try {
          for (const line of readFileSync(p, 'utf8').split('\n')) {
            if (/lzma|DecompressPool/i.test(line)) hits.push(`${e.name}: ${line}`)
          }
        } catch {
          /* unreadable -- ignore */
        }
      }
    }
  }
  walk(root, 0)
  return hits
}

async function oneRun(i: number): Promise<RunResult> {
  const profile = createFakeHomeProfile({ prefix: 'gamelib-261008-jvw-' })
  const started = Date.now()
  let stdout = ''
  let stderr = ''
  let exit: number | null = null
  let signal: string | null = null
  try {
    const child = spawn(binary, [], {
      env: profile.childEnv({
        ...process.env,
        GAMELIB_SIDECAR_SELFTEST: 'decompress-pool'
      }),
      stdio: ['ignore', 'pipe', 'pipe']
    })
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))

    const done = new Promise<void>((res) => {
      child.on('close', (code, sig) => {
        exit = code
        signal = sig
        res()
      })
      child.on('error', (err) => {
        stderr += `\nspawn error: ${String(err)}\n`
        res()
      })
    })

    let stallHandled = false
    const stallTimer = setTimeout(() => {
      stallHandled = true
      writeFileSync(
        join(OUT, `${label}-run-${i}-system-at-stall.txt`),
        systemSnapshot()
      )
      if (child.pid) {
        spawnSync(
          '/usr/bin/sample',
          [
            String(child.pid),
            '5',
            '-file',
            join(OUT, `${label}-run-${i}.sample.txt`)
          ],
          { timeout: 30_000 }
        )
      }
    }, STALL_SAMPLE_MS)
    const killTimer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* already gone */
      }
    }, KILL_MS)

    await done
    clearTimeout(stallTimer)
    clearTimeout(killTimer)
    void stallHandled

    const wallMs = Date.now() - started
    const poolLine = stdout.split('\n').find((l) => l.startsWith('SELFTEST pool='))
    const decodeLine =
      stdout.split('\n').find((l) => l.startsWith('SELFTEST decode=')) ??
      '(no SELFTEST decode= line)'
    let nativeWorkers: number | string = 'unparsed'
    let inlineFallback: boolean | string = 'unparsed'
    if (poolLine) {
      try {
        const j = JSON.parse(poolLine.slice('SELFTEST pool='.length)) as {
          nativeWorkers?: number
          inlineFallback?: boolean
        }
        nativeWorkers = j.nativeWorkers ?? 'absent'
        inlineFallback = j.inlineFallback ?? 'absent'
      } catch {
        /* leave unparsed */
      }
    }
    const pass =
      exit === 0 &&
      decodeLine.startsWith('SELFTEST decode=ok bytes=65536 match=true') &&
      inlineFallback === false &&
      nativeWorkers === expectNative

    const logHits = collectLzmaLogLines(profile.root)
    writeFileSync(
      join(OUT, `${label}-run-${i}.log`),
      [
        `run=${i} wallMs=${wallMs} exit=${exit} signal=${signal} pass=${pass}`,
        '--- stdout ---',
        stdout,
        '--- stderr ---',
        stderr,
        '--- lzma/DecompressPool lines from *.log under the fake profile ---',
        logHits.length ? logHits.join('\n') : '(none)',
        ''
      ].join('\n')
    )
    return {
      run: i,
      wallMs,
      exit,
      signal,
      nativeWorkers,
      inlineFallback,
      decode: decodeLine,
      pass
    }
  } finally {
    profile.dispose()
  }
}

async function main(): Promise<void> {
  const results: RunResult[] = []
  for (let i = 1; i <= runs; i++) {
    const r = await oneRun(i)
    results.push(r)
    console.log(
      `run ${i}/${runs} pass=${r.pass} wall=${r.wallMs}ms exit=${r.exit} nativeWorkers=${r.nativeWorkers}`
    )
    if (!r.pass) {
      writeFileSync(join(OUT, `${label}-system-after-fail.txt`), systemSnapshot())
      break
    }
  }
  const k = results.filter((r) => r.pass).length
  const table = [
    '| run | wall ms | exit | signal | nativeWorkers | inlineFallback | decode line |',
    '| --- | ------- | ---- | ------ | ------------- | -------------- | ----------- |',
    ...results.map(
      (r) =>
        `| ${r.run} | ${r.wallMs} | ${r.exit} | ${r.signal ?? '-'} | ${r.nativeWorkers} | ${r.inlineFallback} | ${r.decode} |`
    ),
    ''
  ].join('\n')
  const resultLine = `RESULT label=${label} pass=${k}/${runs} expectNativeWorkers=${expectNative}`
  if (!existsSync(driverTxt)) writeFileSync(driverTxt, '')
  appendFileSync(driverTxt, `${table}\n${resultLine}\n`)
  console.log(resultLine)
  process.exit(k === runs ? 0 : 1)
}

void main()
