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
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync } from 'node:fs'
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
import { encodeControl, decodeResponse, STATUS_OK } from '../protocol'
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
  }
)
