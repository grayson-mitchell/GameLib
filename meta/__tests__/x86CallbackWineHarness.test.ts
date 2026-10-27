/**
 * quick 261027-m1r (P55-9): runs the REAL x86 steam_api.dll shim under
 * CrossOver's Wine with a 32-bit PE harness and a fake loopback helper, to
 * prove the __thiscall Run(void*) slot-1 dispatch. Skips only when CrossOver
 * or the pinned zig are absent, unless GAMELIB_REQUIRE_WINE_HARNESS=1.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'

import { createFakeHomeProfile } from '../../src/backend/testUtils/fakeHomeProfile'
import { buildShimCompileArgv } from '../buildSteamBridgeShims'

const REPO = join(__dirname, '..', '..')
const CX_BIN =
  '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin'
const WINELOADER = join(CX_BIN, 'wineloader')
const WINESERVER = join(CX_BIN, 'wineserver')
const ZIG = join(REPO, '.build-tools', 'zig', 'zig')
const FIXTURE = join(__dirname, 'fixtures', 'x86_callback_pe_harness.c')

const CONTROL = 0xffff
const SLOT_HELLO = 2
const SLOT_DRAIN = 6
const SLOT_CBDISP = 10

interface Frame {
  conn: number
  ordinal: number
  slot: number
  args: Buffer
}
interface RunResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  frames: Frame[]
  durationMs: number
}

function spawnArgv(
  command: string,
  args: string[],
  opts: { cwd?: string; env: NodeJS.ProcessEnv; timeoutMs?: number }
): Promise<{
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true
          child.kill('SIGKILL')
        }, opts.timeoutMs)
      : undefined
    child.stdout?.on('data', (d) => (stdout += d.toString()))
    child.stderr?.on('data', (d) => (stderr += d.toString()))
    child.on('error', (e) => {
      if (timer) clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut })
    })
  })
}

function payload168(): Buffer {
  const b = Buffer.alloc(2572)
  b.writeUInt32LE(0x51a7c0de, 0)
  b.writeInt32LE(1, 4)
  b.writeInt32LE(2560, 8)
  for (let i = 0; i < 2560; i++) b[12 + i] = (i * 73 + 11) & 0xff
  return b
}

function response(requestId: number, status: number, blob: Buffer): Buffer {
  const out = Buffer.alloc(9 + blob.length)
  out.writeUInt32LE(5 + blob.length, 0)
  out.writeUInt32LE(requestId, 4)
  out.writeUInt8(status, 8)
  blob.copy(out, 9)
  return out
}

function skipReasonNow(): string | undefined {
  if (process.platform !== 'darwin') return 'not macOS'
  if (!existsSync(WINELOADER)) return 'CrossOver wineloader not found'
  if (!existsSync(ZIG)) return 'pinned zig not found (.build-tools/zig/zig)'
  return undefined
}

async function runVariant(mutant: boolean): Promise<RunResult> {
  const profile = createFakeHomeProfile({ prefix: 'gamelib-x86cbwine-' })
  const sockets = new Set<net.Socket>()
  const server = net.createServer()
  const frames: Frame[] = []
  try {
    const work = join(profile.root, 'run')
    mkdirSync(work, { recursive: true })
    const env = profile.childEnv()

    const { command, args } = buildShimCompileArgv(ZIG)
    if (!args.includes('x86-windows-gnu')) {
      throw new Error('buildShimCompileArgv no longer targets x86-windows-gnu')
    }
    const oi = args.indexOf('-o')
    if (oi < 0) throw new Error('shim argv has no -o')
    const shimArgs = [...args]
    shimArgs[oi + 1] = join(work, 'steam_api.dll')
    const shim = await spawnArgv(command, shimArgs, {
      cwd: REPO,
      env,
      timeoutMs: 180_000
    })
    if (shim.code !== 0) throw new Error(`shim build failed:\n${shim.stderr}`)

    const hz = await spawnArgv(
      ZIG,
      [
        'cc',
        '-target',
        'x86-windows-gnu',
        '-O2',
        '-std=c11',
        '-Wall',
        '-Werror',
        ...(mutant ? ['-DHARNESS_MUTANT_NO_CALLEE_POP'] : []),
        '-o',
        join(work, 'harness.exe'),
        FIXTURE
      ],
      { cwd: work, env, timeoutMs: 180_000 }
    )
    if (hz.code !== 0) throw new Error(`harness build failed:\n${hz.stderr}`)

    const secret = randomBytes(32).toString('hex')
    const secretBuf = Buffer.from(secret, 'ascii')
    let drains = 0
    let connSeq = 0
    server.on('connection', (sock) => {
      sockets.add(sock)
      sock.on('close', () => sockets.delete(sock))
      sock.on('error', () => undefined)
      const conn = ++connSeq
      let helloed = false
      let acc = Buffer.alloc(0)
      sock.on('data', (d) => {
        acc = Buffer.concat([acc, d])
        for (;;) {
          if (acc.length < 4) return
          const len = acc.readUInt32LE(0)
          if (acc.length < 4 + len) return
          const body = acc.subarray(4, 4 + len)
          acc = acc.subarray(4 + len)
          const requestId = body.readUInt32LE(0)
          const ordinal = body.readUInt16LE(4)
          const slot = body.readUInt16LE(6)
          const fargs = Buffer.from(body.subarray(8))
          frames.push({ conn, ordinal, slot, args: fargs })
          let reply: Buffer
          if (ordinal === CONTROL && slot === SLOT_HELLO) {
            if (fargs.equals(secretBuf)) {
              helloed = true
              reply = response(requestId, 0, Buffer.alloc(0))
            } else reply = response(requestId, 1, Buffer.alloc(0))
          } else if (!helloed) {
            reply = response(requestId, 1, Buffer.alloc(0))
          } else if (ordinal === CONTROL && slot === SLOT_DRAIN) {
            drains++
            if (drains === 1) {
              const blob = Buffer.alloc(4 + 4 + 4 + 2572)
              blob.writeUInt32LE(1, 0)
              blob.writeInt32LE(168, 4)
              blob.writeUInt32LE(2572, 8)
              payload168().copy(blob, 12)
              reply = response(requestId, 0, blob)
            } else reply = response(requestId, 0, Buffer.alloc(4))
          } else if (ordinal === CONTROL && slot === SLOT_CBDISP) {
            reply = response(requestId, 0, Buffer.alloc(0))
          } else {
            reply = response(requestId, 1, Buffer.alloc(0))
          }
          sock.write(reply)
        }
      })
    })
    await new Promise<void>((res) => server.listen(0, '127.0.0.1', res))
    const port = (server.address() as net.AddressInfo).port
    writeFileSync(
      join(work, 'gamelib_bridge.cfg'),
      `port=${port}\nsecret=${secret}\n`
    )

    const t0 = Date.now()
    const wine = await spawnArgv(WINELOADER, [join(work, 'harness.exe')], {
      cwd: work,
      env: {
        ...env,
        WINEPREFIX: join(profile.root, 'wineprefix'),
        WINEDEBUG: '-all',
        WINEDLLOVERRIDES: 'mscoree,mshtml='
      },
      timeoutMs: 120_000
    })
    const durationMs = Date.now() - t0
    return {
      code: wine.code,
      stdout: wine.stdout.replace(/\r\n/g, '\n'),
      stderr: wine.stderr,
      timedOut: wine.timedOut,
      frames,
      durationMs
    }
  } finally {
    try {
      await spawnArgv(WINESERVER, ['-k'], {
        env: {
          ...profile.childEnv(),
          WINEPREFIX: join(profile.root, 'wineprefix'),
          WINEDEBUG: '-all'
        },
        timeoutMs: 30_000
      })
    } catch {
      /* ignore */
    }
    for (const s of sockets) s.destroy()
    await new Promise<void>((res) => server.close(() => res()))
    profile.dispose()
  }
}

const NAMES = [
  'loaded_real_shim',
  'register_writes_x86_layout',
  'run1_called_once_each',
  'run1_thiscall_this',
  'run1_payload',
  'run1_callback_id',
  'run1_return_into_shim',
  'run1_esp_balanced',
  'unregister_clears_flag'
]

describe('x86 callback dispatch under Wine (P55-9)', () => {
  let skipReason: string | undefined
  let normal: RunResult
  let mutant: RunResult

  beforeAll(async () => {
    skipReason = skipReasonNow()
    if (skipReason) {
      if (process.env.GAMELIB_REQUIRE_WINE_HARNESS === '1') {
        throw new Error(`x86 Wine harness required but: ${skipReason}`)
      }
      console.warn(`x86CallbackWineHarness skipped: ${skipReason}`)
      return
    }
    normal = await runVariant(false)
    console.log(
      `normal run ${normal.durationMs} ms, code=${normal.code}, timedOut=${normal.timedOut}\n${normal.stdout}\n${normal.stderr}`
    )
    mutant = await runVariant(true)
    console.log(
      `mutant run ${mutant.durationMs} ms, code=${mutant.code}, timedOut=${mutant.timedOut}\n${mutant.stdout}\n${mutant.stderr}`
    )
  }, 400_000)

  for (const name of NAMES) {
    it(`PASS ${name}`, () => {
      if (skipReason) return
      expect(normal.stdout).toContain(`PASS ${name}\n`)
    })
  }

  it('harness completes cleanly', () => {
    if (skipReason) return
    expect(normal.timedOut).toBe(false)
    expect(normal.stdout).toContain('DONE')
    expect(normal.stdout).not.toContain('FAIL')
    expect(normal.code).toBe(0)
  })

  it('fake helper saw HELLO, one 168 drain and CBDISP 168/3/0', () => {
    if (skipReason) return
    const f = normal.frames
    const firstPerConn = new Map<number, Frame>()
    for (const fr of f)
      if (!firstPerConn.has(fr.conn)) firstPerConn.set(fr.conn, fr)
    expect(firstPerConn.size).toBeGreaterThan(0)
    for (const fr of firstPerConn.values()) {
      expect(fr.ordinal).toBe(CONTROL)
      expect(fr.slot).toBe(SLOT_HELLO)
      expect(fr.args.length).toBe(64)
    }
    expect(f.filter((x) => x.slot === SLOT_DRAIN).length).toBeGreaterThan(0)
    const cb = f.filter((x) => x.slot === SLOT_CBDISP)
    expect(cb).toHaveLength(1)
    expect(cb[0].args.readInt32LE(0)).toBe(168)
    expect(cb[0].args.readUInt32LE(4)).toBe(3)
    expect(cb[0].args.readUInt32LE(8)).toBe(0)
    for (const fr of f) {
      expect([SLOT_HELLO, SLOT_DRAIN, SLOT_CBDISP]).toContain(fr.slot)
    }
  })

  it('mutant (no callee pop) does not pass the ESP check', () => {
    if (skipReason) return
    expect(mutant.stdout).not.toContain('PASS run1_esp_balanced')
    const caught =
      mutant.stdout.includes('FAIL run1_esp_balanced') ||
      mutant.code !== 0 ||
      mutant.stdout.includes('FAIL crash')
    if (!caught) {
      throw new Error('mutant passed: the ESP balance check proves nothing')
    }
  })
})
