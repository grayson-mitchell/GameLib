/**
 * quick 261105-svg: real-process tests of the parent-death watchdog.
 *
 * Each test spawns a throwaway `node -e` parent with no `env`. It reads no profile and is neither
 * the sidecar nor the SEA binary, so the fake-HOME harness is not required here. The parent
 * spawns the watchdog the way steamDownloadMonitor does, so SIGKILLing it reproduces a hard-killed
 * sidecar.
 *
 * The live block at the bottom runs real script/nettop and is skipped unless GAMELIB_LIVE_NETTOP=1
 * on darwin. It is not a CI gate, so its skip is not a false green.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { buildWatchdogSpawn, WATCHDOG_SH } from '../childWatchdog'
import { at } from './fixtures/indexed'

jest.setTimeout(20000)

const describeReal = process.platform === 'win32' ? describe.skip : describe
const describeLive =
  process.platform === 'darwin' && process.env.GAMELIB_LIVE_NETTOP === '1'
    ? describe
    : describe.skip

const PARENT_SRC = `
const { spawn } = require('child_process')
const { args } = JSON.parse(process.argv[1])
args[3] = String(process.pid)
const c = spawn(process.argv[2], args, { stdio: ['ignore', 'pipe', 'ignore'] })
c.unref()
c.stdout.unref()
console.log(c.pid)
setInterval(() => {}, 1000)
`

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function childrenOf(pid: number): number[] {
  try {
    return execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map(Number)
  } catch {
    return []
  }
}

function commandOf(pid: number): string {
  try {
    return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], {
      encoding: 'utf8'
    })
  } catch {
    return ''
  }
}

async function waitFor(cond: () => boolean, ms: number): Promise<number> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (cond()) return Date.now() - t0
    await sleep(50)
  }
  return cond() ? Date.now() - t0 : -1
}

const spawned: ChildProcess[] = []
const discovered: number[] = []

function track(pid: number): number {
  discovered.push(pid)
  return pid
}

afterEach(() => {
  for (const pid of discovered.splice(0)) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // already gone
    }
  }
  for (const c of spawned.splice(0)) c.kill('SIGKILL')
})

async function startParent(built: { file: string; args: string[] }) {
  const parent = spawn(
    process.execPath,
    ['-e', PARENT_SRC, JSON.stringify({ args: built.args }), built.file],
    { stdio: ['ignore', 'pipe', 'ignore'] }
  )
  spawned.push(parent)
  track(parent.pid as number)
  const wdPid = await new Promise<number>((resolve) => {
    parent.stdout.once('data', (d) => resolve(Number(String(d).trim())))
  })
  track(wdPid)
  return { parent, wdPid }
}

async function resolveTree(wdPid: number) {
  let inner = 0
  let grand = 0
  await waitFor(() => {
    // the watchdog also has a short-lived `sleep 1` tick child, so pick the inner sh by command
    inner =
      childrenOf(wdPid).find((pid) => commandOf(pid).includes(at(INNER, 2))) ??
      0
    grand = inner ? (childrenOf(inner)[0] ?? 0) : 0
    return grand !== 0
  }, 2000)
  expect(inner).not.toBe(0)
  expect(grand).not.toBe(0)
  track(inner)
  track(grand)
  return { inner, grand }
}

const INNER = ['/bin/sh', '-c', 'sleep 300 & wait']

describe('buildWatchdogSpawn', () => {
  it('passes pids and argv as positional parameters', () => {
    expect(buildWatchdogSpawn(11, 22, ['/x', 'a'])).toEqual({
      file: '/bin/sh',
      args: ['-c', WATCHDOG_SH, 'gamelib-watchdog', '11', '22', '/x', 'a']
    })
  })
})

describeReal('childWatchdog (real processes)', () => {
  it('removes the tree within 5s of a hard parent SIGKILL', async () => {
    const { parent, wdPid } = await startParent(
      buildWatchdogSpawn(0, process.pid, INNER)
    )
    const { inner, grand } = await resolveTree(wdPid)
    parent.kill('SIGKILL')
    const gone = await waitFor(
      () => !alive(wdPid) && !alive(inner) && !alive(grand),
      5000
    )
    expect(gone).toBeGreaterThanOrEqual(0)
  })

  it('still kills the grandchild when the middle process dies first', async () => {
    const { parent, wdPid } = await startParent(
      buildWatchdogSpawn(0, process.pid, INNER)
    )
    const { inner, grand } = await resolveTree(wdPid)
    // let at least one full tick record the grandchild, as it always has in a long-lived monitor
    await sleep(1500)
    process.kill(inner, 'SIGKILL')
    await sleep(300)
    // the field shape: the grandchild outlived its parent
    expect(alive(grand)).toBe(true)
    parent.kill('SIGKILL')
    const gone = await waitFor(() => !alive(grand) && !alive(wdPid), 5000)
    expect(gone).toBeGreaterThanOrEqual(0)
  })

  it('removes the tree within 2s of a clean SIGTERM', async () => {
    const { parent, wdPid } = await startParent(
      buildWatchdogSpawn(0, process.pid, INNER)
    )
    const { inner, grand } = await resolveTree(wdPid)
    process.kill(wdPid, 'SIGTERM')
    const gone = await waitFor(
      () => !alive(wdPid) && !alive(inner) && !alive(grand),
      2000
    )
    expect(gone).toBeGreaterThanOrEqual(0)
    expect(alive(parent.pid as number)).toBe(true)
  })

  it('exits the tree when the watched pid exits', async () => {
    const watched = spawn('sleep', ['300'], { stdio: 'ignore' })
    spawned.push(watched)
    const { parent, wdPid } = await startParent(
      buildWatchdogSpawn(0, watched.pid as number, INNER)
    )
    const { inner, grand } = await resolveTree(wdPid)
    watched.kill('SIGKILL')
    const gone = await waitFor(
      () => !alive(wdPid) && !alive(inner) && !alive(grand),
      5000
    )
    expect(gone).toBeGreaterThanOrEqual(0)
    expect(alive(parent.pid as number)).toBe(true)
  })
})

describeLive('childWatchdog (live script/nettop, darwin only)', () => {
  const NETTOP = [
    '/usr/bin/script',
    '-q',
    '/dev/null',
    '/usr/bin/nettop',
    '-x',
    '-n',
    '-L',
    '0',
    '-s',
    '1',
    '-J',
    'bytes_in',
    '-p'
  ]
  const nettopPids = (sleepPid: number): number[] => {
    try {
      return (
        execFileSync(
          'pgrep',
          ['-f', `nettop -x -n -L 0 -s 1 -J bytes_in -p ${sleepPid}`],
          { encoding: 'utf8' }
        )
          .split('\n')
          .filter(Boolean)
          .map(Number)
          // pgrep -f also matches the script/sh wrappers whose argv contains the text;
          // keep only the real nettop executable
          .filter((pid) => {
            try {
              return execFileSync('ps', ['-o', 'comm=', '-p', String(pid)], {
                encoding: 'utf8'
              })
                .trim()
                .endsWith('nettop')
            } catch {
              return false
            }
          })
      )
    } catch {
      return []
    }
  }

  async function arm(withWatchdog: boolean) {
    const sleeper = spawn('sleep', ['600'], { stdio: 'ignore' })
    spawned.push(sleeper)
    const sleepPid = track(sleeper.pid as number)
    const argv = [...NETTOP, String(sleepPid)]
    const built = withWatchdog
      ? buildWatchdogSpawn(0, sleepPid, argv)
      : { file: at(argv, 0), args: argv.slice(1) }
    // the bare arm has no placeholder to patch; patching args[3] there would corrupt the argv
    const src = withWatchdog
      ? PARENT_SRC
      : PARENT_SRC.replace('args[3] = String(process.pid)', '')
    const parent = spawn(
      process.execPath,
      ['-e', src, JSON.stringify({ args: built.args }), built.file],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    )
    spawned.push(parent)
    track(parent.pid as number)
    const childPid = await new Promise<number>((resolve) => {
      parent.stdout.once('data', (d) => resolve(Number(String(d).trim())))
    })
    track(childPid)
    await sleep(3000)
    const nettopBefore = nettopPids(sleepPid)
    nettopBefore.forEach(track)
    expect(nettopBefore.length).toBeGreaterThan(0)
    const killedAt = Date.now()
    parent.kill('SIGKILL')
    return { sleepPid, childPid, killedAt }
  }

  it('baseline: bare script/nettop is left behind by a hard kill', async () => {
    const { sleepPid, childPid } = await arm(false)
    await sleep(6000)
    const nettop = nettopPids(sleepPid)
    console.log(
      `baseline 6s after SIGKILL: nettop=${JSON.stringify(nettop)} scriptAlive=${alive(childPid)}`
    )
    nettop.forEach((pid) => process.kill(pid, 'SIGKILL'))
    // Observation, not an assertion: if it does not orphan, the SUMMARY records that honestly.
  }, 30000)

  it('fixed: watchdog removes nettop, script and itself within 5s', async () => {
    const { sleepPid, childPid, killedAt } = await arm(true)
    const gone = await waitFor(
      () => !alive(childPid) && nettopPids(sleepPid).length === 0,
      5000
    )
    console.log(`fixed arm kill-to-gone: ${Date.now() - killedAt}ms`)
    expect(gone).toBeGreaterThanOrEqual(0)
  }, 30000)
})
