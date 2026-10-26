/**
 * D-51-01 tracer acceptance bar (Phase 51 Plan 01, Task 1): the ONE
 * real-compiled-binary proof that the registry conversion actually works
 * end to end -- compiles the REAL `bridge_helper.c` with clang (the exact
 * `buildHelperCompileArgv()` invocation `pnpm build-steam-bridge` runs,
 * redirected to a throwaway output path), spawns it through the REAL
 * (unmocked) `ensureBridgeHelperReady()`, and asserts the three things a
 * mock of either side could never prove:
 *  - the per-appId `steam_appid.txt` the helper writes into ITS OWN cwd
 *    really does carry the game's real AppID, never the old shared "480";
 *  - two concurrently-running helpers for two different appIds really do
 *    bind two DIFFERENT OS-assigned ephemeral ports (D-51-03, no lock);
 *  - a raw CONTROL HELLO round-trip against the real compiled binary
 *    really does answer STATUS_OK.
 *
 * Darwin only (Mach-O clang compile + the production code's own
 * macOS-only `resolve_dylib_path()` assumptions) -- skipped elsewhere with
 * an explicit reason in the describe title rather than silently vanishing.
 *
 * Fake-HOME isolation (gamelib-conventions, CLAUDE.md two-profile rule):
 * the CLANG COMPILE below is an in-repo spawn and goes through
 * `createFakeHomeProfile()` per the convention. The LATER real
 * `ensureBridgeHelperReady()` spawn is PRODUCTION code and -- per the
 * project's fakeHomeIsolation gate -- never hand-rolls an env literal of
 * its own.
 *
 * CORRECTED (Phase 51 Plan 01, Task 3 live-tracer divergence follow-up,
 * measured live 2026-10-17): this previously assumed `jest.setupContainment
 * .ts`'s HOME redirection reaches that real spawn because it "has already
 * redirected HOME/APPDATA/etc ... before this file's own imports run." That
 * redirection is real but only for THIS TEST's own sandboxed JS
 * (`process.env` / the mocked `os.homedir()`) -- `node:child_process`'s
 * builtin module is loaded once, outside Jest's per-test-file VM sandbox,
 * and builds a real spawned child's environment from the ACTUAL host
 * `process.env`, never the sandboxed clone. Verified directly: a jest test
 * that prints its own `process.env.HOME` sees the fake contained root, but
 * `execFileSync('/usr/bin/printenv', ['HOME'])` run from inside that SAME
 * test prints the developer's real `$HOME`. So the real
 * `ensureBridgeHelperReady()` spawn below was never actually isolated --
 * on a prior test host with no native Steam.app installed at all, there
 * was simply no real `libsteam_api.dylib` anywhere to find (isolated or
 * not), so `'not-inited'` held for the wrong reason. Once a genuine native
 * Mac Steam.app exists at the real `$HOME`'s canonical
 * `Library/Application Support/Steam/Steam.AppBundle/...` path (as it does
 * on any machine that has run the Task 3 live checkpoint), the real spawn
 * resolves the REAL dylib and `ensureBridgeHelperReady()` reports `'ready'`
 * instead -- a false pass this test could not see. Fixed by explicitly
 * handing the real spawn THIS SAME `createFakeHomeProfile()` instance's
 * env via the test-only `__setBridgeHelperSpawnEnvForTests()` hook (mirrors
 * `__setBridgeHelperPathForTests()`'s existing shape) -- real isolation,
 * not ambient propagation that never happens.
 */
import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { Socket } from 'node:net'
import { join, resolve } from 'node:path'

import {
  createFakeHomeProfile,
  type FakeHomeProfile
} from 'backend/testUtils/fakeHomeProfile'
import { steamBridgeHelperStateDir } from 'backend/constants/paths'
import {
  ensureBridgeHelperReady,
  stopBridgeHelper,
  __setBridgeHelperPathForTests,
  __setBridgeHelperSpawnEnvForTests
} from '../helperProcess'
import {
  encodeControl,
  encodeRequest,
  decodeResponse,
  CONTROL_ORDINAL,
  CONTROL_SLOT,
  STATUS_ERR,
  STATUS_OK
} from '../protocol'
// eslint-disable-next-line @typescript-eslint/no-var-requires -- meta/ is
// outside src/'s tsconfig `include`; other real-build suites (e.g.
// lzmaNativeBinding.test.ts) already cross this same boundary with a
// relative import, so this is the established, reviewed pattern -- not a
// new exception.
import { buildHelperCompileArgv } from '../../../../../../meta/buildSteamBridgeShims'

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

jest.mock('backend/ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..', '..')
const HELPER_SOURCE_PATH = join(
  REPO_ROOT,
  'native',
  'steam-bridge',
  'helper',
  'bridge_helper.c'
)

// The old D-03/D-04 fixed shared port -- a real per-appId helper must
// NEVER bind this port again (D-51-01).
const FORMER_SHARED_PORT = 54550

const AVERNUM_APP_ID = '206060'
const HOARD_APP_ID = '63000'

const IS_DARWIN = process.platform === 'darwin'
const describeDarwinOnly = IS_DARWIN ? describe : describe.skip

/**
 * Resolves once `port` refuses a connection (the helper has really
 * exited), or rejects after a bounded number of attempts -- never an
 * unbounded recursive/polling wait.
 */
async function expectPortEventuallyClosed(port: number): Promise<void> {
  const MAX_ATTEMPTS = 20
  const RETRY_MS = 200

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const closed = await new Promise<boolean>((resolvePromise) => {
      const socket = new Socket()
      socket.once('error', () => {
        socket.destroy()
        resolvePromise(true)
      })
      socket.once('connect', () => {
        socket.destroy()
        resolvePromise(false)
      })
      socket.connect(port, '127.0.0.1')
    })
    if (closed) return
    await new Promise((r) => setTimeout(r, RETRY_MS))
  }
  throw new Error(`port ${port} never closed after helper teardown`)
}

/**
 * Opens a short-lived raw socket to `port` and sends one CONTROL HELLO
 * request, returning the decoded status byte.
 */
function sendControlHello(port: number): Promise<number> {
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = new Socket()
    let received = Buffer.alloc(0)
    const timeout = setTimeout(() => {
      socket.destroy()
      rejectPromise(new Error('CONTROL HELLO timed out'))
    }, 2000)

    socket.once('error', (error) => {
      clearTimeout(timeout)
      rejectPromise(error)
    })

    socket.connect(port, '127.0.0.1', () => {
      socket.write(encodeControl(1, 'hello'))
    })

    socket.on('data', (chunk: Buffer) => {
      received = Buffer.concat([received, chunk])
      try {
        const decoded = decodeResponse(received)
        clearTimeout(timeout)
        socket.destroy()
        resolvePromise(decoded.status)
      } catch {
        // Truncated -- wait for more bytes.
      }
    })
  })
}

/**
 * Sends one request frame over an ALREADY-OPEN, already-connected socket
 * and resolves with the decoded response -- unlike `sendControlHello`
 * above (which opens and tears down its own short-lived socket per call),
 * this reuses the SAME connection across multiple calls so a test can
 * prove the helper's `serve_connection()` read loop really does keep
 * serving sequential frames after an error response (R2's own acceptance
 * bar: >=2 sequential requests over one persistent connection).
 */
function sendFrameOnSocket(
  socket: Socket,
  frame: Buffer
): Promise<{ status: number; retBlob: Buffer }> {
  return new Promise((resolvePromise, rejectPromise) => {
    let received = Buffer.alloc(0)
    const timeout = setTimeout(() => {
      socket.off('data', onData)
      rejectPromise(new Error('frame response timed out'))
    }, 2000)

    const onData = (chunk: Buffer) => {
      received = Buffer.concat([received, chunk])
      try {
        const decoded = decodeResponse(received)
        clearTimeout(timeout)
        socket.off('data', onData)
        resolvePromise(decoded)
      } catch {
        // Truncated -- wait for more bytes.
      }
    }
    socket.on('data', onData)
    socket.write(frame)
  })
}

describeDarwinOnly(
  'helperIntegration (real compiled bridge_helper.c -- darwin only, skipped elsewhere: Mach-O clang compile + macOS-only dylib resolution)',
  () => {
    let profile: FakeHomeProfile
    let compiledHelperPath: string

    beforeAll(() => {
      profile = createFakeHomeProfile({
        prefix: 'gamelib-helperIntegration-home-'
      })

      const buildDir = mkdtempSync(join(profile.root, 'helper-build-'))
      compiledHelperPath = join(buildDir, 'steam-bridge-helper')

      const { command, args } = buildHelperCompileArgv()
      const outputFlagIndex = args.indexOf('-o')
      const customArgs = [...args]
      customArgs[outputFlagIndex + 1] = compiledHelperPath

      execFileSync(command, customArgs, {
        cwd: REPO_ROOT,
        env: profile.childEnv(),
        stdio: 'pipe'
      })
      chmodSync(compiledHelperPath, 0o755)

      __setBridgeHelperPathForTests(compiledHelperPath)
      // Isolation follow-up (Task 3 live-tracer divergence, measured live
      // 2026-10-17): jest.setupContainment.ts's HOME redirection is visible
      // only to this test's OWN sandboxed JS (process.env/os.homedir()) --
      // node:child_process's builtin is loaded outside that per-test-file
      // sandbox and builds a real spawned child's env from the REAL host
      // process.env, so it never actually isolated the real
      // ensureBridgeHelperReady() spawn below. On a machine with a
      // genuinely-installed native Steam.app this let the real
      // libsteam_api.dylib resolve under the developer's real $HOME,
      // flipping the assertion below from 'not-inited' to 'ready'. Pass
      // THIS SAME createFakeHomeProfile() instance's env explicitly so the
      // real spawn is isolated for real, per CLAUDE.md's "never a
      // hand-rolled env literal -- use createFakeHomeProfile()" convention.
      __setBridgeHelperSpawnEnvForTests(profile.childEnv())
    }, 30000)

    afterAll(() => {
      __setBridgeHelperPathForTests(null)
      __setBridgeHelperSpawnEnvForTests(null)
      profile?.dispose()
    })

    test('two per-appId helpers: real AppID file, distinct ephemeral ports, HELLO round-trip, clean teardown (D-51-01/D-51-03)', async () => {
      const first = await ensureBridgeHelperReady(AVERNUM_APP_ID)
      expect(first.status).toBe('not-inited')
      expect(first.ready).toBe(false)
      expect(typeof first.port).toBe('number')
      expect(first.port).not.toBe(FORMER_SHARED_PORT)

      const appIdFile = join(
        steamBridgeHelperStateDir,
        AVERNUM_APP_ID,
        'steam_appid.txt'
      )
      expect(readFileSync(appIdFile, 'utf-8')).toBe(AVERNUM_APP_ID)

      // D-51-03: a second helper for a different appId, concurrently alive
      // alongside the first -- no lock, no refusal.
      const second = await ensureBridgeHelperReady(HOARD_APP_ID)
      expect(second.status).toBe('not-inited')
      expect(typeof second.port).toBe('number')
      expect(second.port).not.toBe(first.port)
      expect(second.port).not.toBe(FORMER_SHARED_PORT)

      const helloStatus = await sendControlHello(first.port as number)
      expect(helloStatus).toBe(STATUS_OK)

      stopBridgeHelper(AVERNUM_APP_ID)
      stopBridgeHelper(HOARD_APP_ID)

      await expectPortEventuallyClosed(first.port as number)
      await expectPortEventuallyClosed(second.port as number)
    }, 30000)

    // 51-10 Task 2, D-51-04: the compiled helper spawned directly (not
    // through ensureBridgeHelperReady(), which has no argv for this) with
    // --identity-only --report-appid really does print mode=identity-only
    // on its own LISTEN line.
    test('--identity-only --report-appid prints mode=identity-only on the LISTEN line (D-51-04)', async () => {
      const stageDir = mkdtempSync(join(profile.root, 'identity-only-'))
      mkdirSync(stageDir, { recursive: true })

      const child = spawn(
        compiledHelperPath,
        [
          '--appid',
          '480',
          '--port',
          '0',
          '--identity-only',
          '--report-appid',
          AVERNUM_APP_ID
        ],
        {
          cwd: stageDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          // Per gamelib-conventions (fake-HOME isolation, two-profile
          // rule): this is an in-repo direct spawn of the compiled binary,
          // never a hand-rolled env literal.
          env: profile.childEnv()
        }
      )

      try {
        const listenLine = await new Promise<string>(
          (resolvePromise, rejectPromise) => {
            let stderr = ''
            const timeout = setTimeout(() => {
              rejectPromise(
                new Error(
                  `no LISTEN line within timeout -- stderr so far: ${stderr}`
                )
              )
            }, 5000)
            child.stderr?.on('data', (data: Buffer) => {
              stderr += data.toString()
              const match = /LISTEN .*$/m.exec(stderr)
              if (match) {
                clearTimeout(timeout)
                resolvePromise(match[0])
              }
            })
          }
        )
        expect(listenLine).toContain('mode=identity-only')
      } finally {
        child.kill()
      }
    }, 10000)

    // T-51-23/T-51-25: an unknown (ordinal, slot) pair -- here a made-up
    // ordinal no manifest declares -- answers STATUS_ERR, and the SAME
    // persistent connection keeps serving a next frame afterward (R2's own
    // acceptance bar: >=2 sequential requests over one connection, never a
    // close-on-error).
    test('an unknown ordinal frame answers STATUS_ERR and keeps the connection open for the next frame', async () => {
      const THIRD_APP_ID = '400'
      const ready = await ensureBridgeHelperReady(THIRD_APP_ID)
      expect(typeof ready.port).toBe('number')
      const port = ready.port as number

      try {
        const socket = new Socket()
        await new Promise<void>((resolvePromise, rejectPromise) => {
          socket.once('error', rejectPromise)
          socket.connect(port, '127.0.0.1', () => resolvePromise())
        })

        try {
          const UNKNOWN_ORDINAL = 9999
          const unknownOrdinalFrame = encodeRequest(1, UNKNOWN_ORDINAL, 0)
          const first = await sendFrameOnSocket(socket, unknownOrdinalFrame)
          expect(first.status).toBe(STATUS_ERR)

          // The SAME connection, a SECOND frame (CONTROL HELLO -- always
          // answerable regardless of init state) -- proves the connection
          // was never closed after the error response above.
          const second = await sendFrameOnSocket(
            socket,
            encodeControl(2, 'hello')
          )
          expect(second.status).toBe(STATUS_OK)
        } finally {
          socket.destroy()
        }
      } finally {
        stopBridgeHelper(THIRD_APP_ID)
        await expectPortEventuallyClosed(port)
      }
    }, 30000)

    // Phase 52 (52-02): CONTROL CREATE_INTERFACE against a helper with no
    // signed-in client (the fake HOME has no Steam, so g_inited stays 0).
    // The real-profile arm -- a signed-in client answering `native=present`
    // -- is deliberately left to the live gate (52-11), the named
    // real-profile arm for this behavior.
    test('CREATE_INTERFACE answers STATUS_ERR with no client, rejects malformed frames, logs FWD, and unknown slots stay refused', async () => {
      const stageDir = mkdtempSync(join(profile.root, 'create-interface-'))
      const child = spawn(
        compiledHelperPath,
        ['--appid', '480', '--port', '0'],
        {
          cwd: stageDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: profile.childEnv()
        }
      )
      let stderr = ''
      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      const nameFrame = (
        requestId: number,
        name: string,
        declared?: number
      ) => {
        const bytes = Buffer.from(name, 'ascii')
        const len = Buffer.alloc(4)
        len.writeUInt32LE(declared ?? bytes.length, 0)
        return encodeRequest(
          requestId,
          CONTROL_ORDINAL,
          CONTROL_SLOT.createInterface,
          Buffer.concat([len, bytes])
        )
      }

      try {
        const port = await new Promise<number>((resolvePromise, reject) => {
          const timeout = setTimeout(
            () => reject(new Error(`no LISTEN line -- stderr: ${stderr}`)),
            5000
          )
          const poll = setInterval(() => {
            const m = /LISTEN 127\.0\.0\.1:(\d+)/.exec(stderr)
            if (m) {
              clearInterval(poll)
              clearTimeout(timeout)
              resolvePromise(Number(m[1]))
            }
          }, 25)
        })

        const connect = async () => {
          const socket = new Socket()
          await new Promise<void>((res, rej) => {
            socket.once('error', rej)
            socket.connect(port, '127.0.0.1', () => res())
          })
          return socket
        }

        const socket = await connect()
        try {
          const ok = await sendFrameOnSocket(
            socket,
            nameFrame(1, 'SteamClient017')
          )
          expect(ok.status).toBe(STATUS_ERR)

          // Malformed: argLen < 4, len 0, len > 4096.
          const short = await sendFrameOnSocket(
            socket,
            encodeRequest(
              2,
              CONTROL_ORDINAL,
              CONTROL_SLOT.createInterface,
              Buffer.from([1, 2])
            )
          )
          expect(short.status).toBe(STATUS_ERR)
          expect(
            (await sendFrameOnSocket(socket, nameFrame(3, ''))).status
          ).toBe(STATUS_ERR)
          const huge = await sendFrameOnSocket(
            socket,
            nameFrame(4, 'SteamClient017', 5000)
          )
          expect(huge.status).toBe(STATUS_ERR)

          // Unknown CONTROL slot.
          const unknownSlot = await sendFrameOnSocket(
            socket,
            encodeRequest(5, CONTROL_ORDINAL, 9)
          )
          expect(unknownSlot.status).toBe(STATUS_ERR)
        } finally {
          socket.destroy()
        }

        // The helper did not crash: a fresh connection still gets HEALTH.
        const fresh = await connect()
        try {
          const health = await sendFrameOnSocket(
            fresh,
            encodeControl(6, 'health')
          )
          expect(health.status).toBe(STATUS_OK)
        } finally {
          fresh.destroy()
        }

        expect(stderr).toMatch(
          /FWD CreateInterface ver=SteamClient017 native=no-client/
        )
      } finally {
        child.kill()
      }
    }, 15000)

    // 53-06 (D-53-07, T-53-22/23): CONTROL REPORT_VERSION logs a NOVER line
    // naming the unserved flat version, rejects malformed lengths silently,
    // sanitises control characters, answers pre-init and never logs CALL.
    test('REPORT_VERSION logs NOVER, rejects malformed frames without logging, sanitises, never logs CALL', async () => {
      const stageDir = mkdtempSync(join(profile.root, 'report-version-'))
      const child = spawn(
        compiledHelperPath,
        ['--appid', '480', '--port', '0'],
        {
          cwd: stageDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: profile.childEnv()
        }
      )
      let stderr = ''
      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      const verFrame = (
        requestId: number,
        bytes: Buffer,
        declared?: number
      ) => {
        const len = Buffer.alloc(4)
        len.writeUInt32LE(declared ?? bytes.length, 0)
        return encodeRequest(
          requestId,
          CONTROL_ORDINAL,
          CONTROL_SLOT.reportVersion,
          Buffer.concat([len, bytes])
        )
      }

      try {
        const port = await new Promise<number>((resolvePromise, reject) => {
          const timeout = setTimeout(
            () => reject(new Error(`no LISTEN line -- stderr: ${stderr}`)),
            5000
          )
          const poll = setInterval(() => {
            const m = /LISTEN 127\.0\.0\.1:(\d+)/.exec(stderr)
            if (m) {
              clearInterval(poll)
              clearTimeout(timeout)
              resolvePromise(Number(m[1]))
            }
          }, 25)
        })

        const socket = new Socket()
        await new Promise<void>((res, rej) => {
          socket.once('error', rej)
          socket.connect(port, '127.0.0.1', () => res())
        })
        try {
          const ok = await sendFrameOnSocket(
            socket,
            verFrame(1, Buffer.from('SteamUser024', 'ascii'))
          )
          expect(ok.status).toBe(STATUS_OK)

          const before = stderr.length
          expect(
            (await sendFrameOnSocket(socket, verFrame(2, Buffer.alloc(0))))
              .status
          ).toBe(STATUS_ERR)
          expect(
            (
              await sendFrameOnSocket(
                socket,
                verFrame(3, Buffer.alloc(129, 0x41))
              )
            ).status
          ).toBe(STATUS_ERR)
          expect(
            (
              await sendFrameOnSocket(
                socket,
                verFrame(4, Buffer.from('abc', 'ascii'), 50)
              )
            ).status
          ).toBe(STATUS_ERR)
          expect(
            (
              await sendFrameOnSocket(
                socket,
                encodeRequest(
                  5,
                  CONTROL_ORDINAL,
                  CONTROL_SLOT.reportVersion,
                  Buffer.from([1, 2])
                )
              )
            ).status
          ).toBe(STATUS_ERR)
          await new Promise((r) => setTimeout(r, 100))
          expect(stderr.slice(before)).not.toMatch(/NOVER/)

          const dirty = await sendFrameOnSocket(
            socket,
            verFrame(6, Buffer.from('Bad\nFAKE\x01Line', 'latin1'))
          )
          expect(dirty.status).toBe(STATUS_OK)
        } finally {
          socket.destroy()
        }

        await new Promise((r) => setTimeout(r, 100))
        expect(stderr).toMatch(
          /NOVER {2}flat lookup ver=SteamUser024 served=no/
        )
        expect(stderr).toMatch(
          /NOVER {2}flat lookup ver=Bad\?FAKE\?Line served=no/
        )
        expect(stderr).not.toMatch(/Bad\n/)
        expect(stderr).not.toMatch(/CALL/)
      } finally {
        child.kill()
      }
    }, 15000)

    // 53-13 WR-06 (T-53-47): the helper caps logged NOVER lines at 16 per
    // process whatever a peer sends; further frames still answer STATUS_OK.
    test('REPORT_VERSION logs at most 16 NOVER lines and still answers STATUS_OK', async () => {
      const stageDir = mkdtempSync(join(profile.root, 'nover-cap-'))
      const child = spawn(
        compiledHelperPath,
        ['--appid', '480', '--port', '0'],
        {
          cwd: stageDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: profile.childEnv()
        }
      )
      let stderr = ''
      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })
      try {
        const port = await new Promise<number>((resolvePromise, reject) => {
          const timeout = setTimeout(
            () => reject(new Error(`no LISTEN line -- stderr: ${stderr}`)),
            5000
          )
          const poll = setInterval(() => {
            const m = /LISTEN 127\.0\.0\.1:(\d+)/.exec(stderr)
            if (m) {
              clearInterval(poll)
              clearTimeout(timeout)
              resolvePromise(Number(m[1]))
            }
          }, 25)
        })
        const socket = new Socket()
        await new Promise<void>((res, rej) => {
          socket.once('error', rej)
          socket.connect(port, '127.0.0.1', () => res())
        })
        try {
          for (let i = 0; i < 20; i++) {
            const bytes = Buffer.from(`SteamFake${i}`, 'ascii')
            const len = Buffer.alloc(4)
            len.writeUInt32LE(bytes.length, 0)
            const res = await sendFrameOnSocket(
              socket,
              encodeRequest(
                i + 1,
                CONTROL_ORDINAL,
                CONTROL_SLOT.reportVersion,
                Buffer.concat([len, bytes])
              )
            )
            expect(res.status).toBe(STATUS_OK)
          }
        } finally {
          socket.destroy()
        }
        await new Promise((r) => setTimeout(r, 100))
        expect(stderr.match(/NOVER {2}flat lookup ver=/g)).toHaveLength(16)
      } finally {
        child.kill()
      }
    }, 15000)

    // quick 261025-kax (D-53-15, T-kax-01/03/04): CONTROL REPORT_INIT logs a
    // GINIT line for the game's own SteamAPI_Init, answers pre-init, rejects
    // malformed frames without logging, caps at 8, never logs CALL or INIT.
    test('REPORT_INIT logs GINIT, rejects malformed frames, caps at 8, never logs CALL or INIT', async () => {
      const stageDir = mkdtempSync(join(profile.root, 'report-init-'))
      const child = spawn(
        compiledHelperPath,
        ['--appid', '480', '--port', '0'],
        {
          cwd: stageDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: profile.childEnv()
        }
      )
      let stderr = ''
      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })
      const initFrame = (requestId: number, fn: number, ret: number) => {
        const b = Buffer.alloc(8)
        b.writeUInt32LE(fn, 0)
        b.writeInt32LE(ret, 4)
        return encodeRequest(
          requestId,
          CONTROL_ORDINAL,
          CONTROL_SLOT.reportInit,
          b
        )
      }
      try {
        const port = await new Promise<number>((resolvePromise, reject) => {
          const timeout = setTimeout(
            () => reject(new Error(`no LISTEN line -- stderr: ${stderr}`)),
            5000
          )
          const poll = setInterval(() => {
            const m = /LISTEN 127\.0\.0\.1:(\d+)/.exec(stderr)
            if (m) {
              clearInterval(poll)
              clearTimeout(timeout)
              resolvePromise(Number(m[1]))
            }
          }, 25)
        })
        const socket = new Socket()
        await new Promise<void>((res, rej) => {
          socket.once('error', rej)
          socket.connect(port, '127.0.0.1', () => res())
        })
        // The helper's own startup init logs INIT; only frames sent from here
        // on must add none.
        const afterStartup = stderr.length
        try {
          expect(
            (await sendFrameOnSocket(socket, initFrame(1, 0, 1))).status
          ).toBe(STATUS_OK)
          expect(
            (await sendFrameOnSocket(socket, initFrame(2, 1, 0))).status
          ).toBe(STATUS_OK)
          expect(
            (await sendFrameOnSocket(socket, initFrame(3, 1, 2))).status
          ).toBe(STATUS_OK)
          await new Promise((r) => setTimeout(r, 100))
          // WR-02: the helper's READY marker follows LISTEN and precedes accept
          // (a frame is only answered once accept runs).
          expect(stderr).toMatch(
            /READY {2}init=(ok|failed|dylib-missing) appid=\d+\n/
          )
          expect(stderr.indexOf('READY  init=')).toBeGreaterThan(
            stderr.indexOf('LISTEN 127.0.0.1:')
          )
          expect(stderr).toMatch(
            /GINIT {2}fn=SteamAPI_Init ret=1 ok=1 session=0\n/
          )
          expect(stderr).toMatch(
            /GINIT {2}fn=SteamInternal_SteamAPI_Init ret=0 ok=1 session=0\n/
          )
          expect(stderr).toMatch(
            /GINIT {2}fn=SteamInternal_SteamAPI_Init ret=2 ok=0 session=0\n/
          )

          const before = stderr.length
          expect(
            (await sendFrameOnSocket(socket, initFrame(4, 4, 1))).status
          ).toBe(STATUS_ERR)
          expect(
            (
              await sendFrameOnSocket(
                socket,
                encodeRequest(
                  5,
                  CONTROL_ORDINAL,
                  CONTROL_SLOT.reportInit,
                  Buffer.from([1, 2, 3, 4])
                )
              )
            ).status
          ).toBe(STATUS_ERR)
          expect(
            (
              await sendFrameOnSocket(
                socket,
                encodeRequest(
                  6,
                  CONTROL_ORDINAL,
                  CONTROL_SLOT.reportInit,
                  Buffer.alloc(0)
                )
              )
            ).status
          ).toBe(STATUS_ERR)
          await new Promise((r) => setTimeout(r, 100))
          expect(stderr.slice(before)).not.toMatch(/GINIT/)

          for (let i = 0; i < 12; i++) {
            const res = await sendFrameOnSocket(socket, initFrame(10 + i, 0, 1))
            expect(res.status).toBe(STATUS_OK)
          }
        } finally {
          socket.destroy()
        }
        await new Promise((r) => setTimeout(r, 100))
        expect(stderr.match(/GINIT {2}fn=/g)).toHaveLength(8)
        expect(stderr).not.toMatch(/CALL/)
        expect(stderr.slice(afterStartup)).not.toMatch(/ INIT /)
      } finally {
        child.kill()
      }
    }, 15000)

    // Phase 55 (55-03, P55-5): CONTROL DRAIN (slot 6) answers OK count 0 with
    // no Steam, rejects args, and fabricates nothing.
    test('DRAIN answers OK count 0 when not inited, rejects args, and fabricates nothing (P55-5)', async () => {
      const stageDir = mkdtempSync(join(profile.root, 'drain-'))
      const child = spawn(
        compiledHelperPath,
        ['--appid', '480', '--port', '0'],
        {
          cwd: stageDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: profile.childEnv()
        }
      )
      let stderr = ''
      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })
      try {
        const port = await new Promise<number>((resolvePromise, reject) => {
          const timeout = setTimeout(
            () => reject(new Error(`no LISTEN line -- stderr: ${stderr}`)),
            5000
          )
          const poll = setInterval(() => {
            const m = /LISTEN 127\.0\.0\.1:(\d+)/.exec(stderr)
            if (m) {
              clearInterval(poll)
              clearTimeout(timeout)
              resolvePromise(Number(m[1]))
            }
          }, 25)
        })
        const socket = new Socket()
        await new Promise<void>((res, rej) => {
          socket.once('error', rej)
          socket.connect(port, '127.0.0.1', () => res())
        })
        try {
          for (const id of [1, 2]) {
            const res = await sendFrameOnSocket(
              socket,
              encodeRequest(id, CONTROL_ORDINAL, CONTROL_SLOT.drainCallbacks)
            )
            expect(res.status).toBe(STATUS_OK)
            expect(Buffer.from(res.retBlob).equals(Buffer.alloc(4))).toBe(true)
          }
          const withArgs = await sendFrameOnSocket(
            socket,
            encodeRequest(
              3,
              CONTROL_ORDINAL,
              CONTROL_SLOT.drainCallbacks,
              Buffer.from([1])
            )
          )
          expect(withArgs.status).toBe(STATUS_ERR)
          const health = await sendFrameOnSocket(
            socket,
            encodeRequest(4, CONTROL_ORDINAL, CONTROL_SLOT.health)
          )
          expect(health.status).toBe(STATUS_OK)
          const slot7 = await sendFrameOnSocket(
            socket,
            encodeRequest(5, CONTROL_ORDINAL, 7)
          )
          expect(slot7.status).toBe(STATUS_ERR)
        } finally {
          socket.destroy()
        }
        await new Promise((r) => setTimeout(r, 100))
        expect(stderr).not.toMatch(/CBQ/)
      } finally {
        child.kill()
      }
    }, 15000)

    test('DRAIN source pins: slot 6, no sleep in handler, integer-only CBQ log (P55-5)', () => {
      const raw = readFileSync(HELPER_SOURCE_PATH, 'utf8')
      const src = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      expect(raw).toContain('#define CONTROL_SLOT_DRAIN_CALLBACKS 6')
      expect(raw).toContain('#include "gamelib_cbqueue.h"')
      const start = src.indexOf('slot == CONTROL_SLOT_DRAIN_CALLBACKS')
      const end = src.indexOf('// unknown control slot')
      expect(start).toBeGreaterThan(-1)
      expect(end).toBeGreaterThan(start)
      const handler = src.slice(start, end)
      expect(handler).not.toContain('usleep')
      expect(handler).not.toContain('RunCB(')
      const cbqCalls = [...src.matchAll(/logts(?:_f)?\("CBQ",[^;]*;/g)]
      expect(cbqCalls.length).toBeGreaterThan(0)
      for (const call of cbqCalls) {
        const fmt = /"[^"]*"/g
        const strings = [...call[0].matchAll(fmt)].slice(1).map((m) => m[0])
        for (const f of strings) {
          expect(f).not.toMatch(/%s|%x|%02x|%p/)
        }
      }
      expect(src).not.toContain('m_rgubTicket')
      const pumpAt = src.indexOf('static void pump_callbacks')
      const pumpBody = src.slice(pumpAt, src.indexOf('\n}\n', pumpAt))
      const runAt = pumpBody.indexOf('RunCB()')
      expect(runAt).toBeGreaterThan(-1)
      expect(pumpBody.slice(0, runAt)).toMatch(/g_manual_dispatch/)
      expect(pumpBody.slice(0, runAt)).toMatch(/else/)
    })

    // 53-13 WR-04: source pin -- the CALL trace sits after bridge_dispatch and
    // is guarded by STATUS_OK, so a failed call is never trace evidence.
    test('source pin: CALL is logged after bridge_dispatch, guarded by STATUS_OK', () => {
      const src = readFileSync(HELPER_SOURCE_PATH, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      const dispatchAt = src.lastIndexOf('bridge_dispatch(')
      const callAt = src.indexOf('logts("CALL"')
      expect(dispatchAt).toBeGreaterThan(-1)
      expect(callAt).toBeGreaterThan(dispatchAt)
      expect(src).toContain('status == STATUS_OK && ci >= 0')
    })
  }
)
