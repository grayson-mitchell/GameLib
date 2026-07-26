/**
 * Headless-boot integration test for the sidecar (Phase 27 Plan 02 — Task 3).
 *
 * Proves spike 009's two import-time walls (app.getPath, electron-store) are
 * shimmed and the sidecar serves its transport contract, by driving
 * bootstrap.ts's exported `init()` in-process with the `Module._load` hook
 * it installs at import time, against injected `stream.PassThrough` pairs.
 * Follows the project's real-tmpdir black-box pattern (steam
 * library.test.ts precedent) rather than mocking `node:fs`/`graceful-fs`,
 * since this project's ts-jest/CJS interop makes fs exports non-mockable
 * (non-configurable getters) — the shims under test (fileStore.ts,
 * pathShim.ts) read/write the real OS config directory instead, exactly as
 * they would in production.
 *
 * CONTAINMENT (Phase 34.2, gap cycle 3, plan 34.2-19 — REQ-34.2-07/-14):
 * this suite was independently reproduced DESTROYING the developer's real
 * `~/Library/Logs/GameLib/gamelib.log` three times during the 2026-07-26
 * verification (log mtimes 10:49 → 10:56 → 10:57) — each of the three
 * `init()` calls below runs `initHeadless()` → `new
 * LogWriter(getLogFilePath({}))` → `archiveOldLogFile()`'s `renameSync`,
 * unmocked, against whatever `getBaseLogPath()` resolves to. Containment is
 * now enforced structurally by `src/backend/jest.setupContainment.ts`, wired
 * into the backend project's `setupFiles` (`src/backend/jest.config.js`) —
 * NOT by any mock added to this file. That module redirects
 * `os.homedir()` via a project-wide `os` module mock (env-var
 * redirection alone does not reach `os.homedir()`'s native binding inside a
 * Jest test — see `jest.setupContainment.ts`'s own docstring for the full
 * finding) plus `HOME`/`APPDATA`/`XDG_CONFIG_HOME`/`XDG_STATE_HOME`
 * env-var redirection for the Windows/Linux branches. The tripwire test
 * immediately below is this suite's OWN local, failing-loudly proof of that
 * containment, placed first so it runs before any `init()` call — a future
 * removal of the `setupFiles` entry fails HERE too, not only in a distant
 * gate file. Do not add `os` / `pathShim` / `backend/logger/paths`
 * `jest.mock` blocks to this file — doing so would re-establish the
 * per-suite pattern this plan exists to replace, and would make the
 * tripwire vacuous (this suite would then be "contained" by its own local
 * mock, not by the structural mechanism the tripwire is supposed to prove).
 *
 * `backend/online_monitor` is mocked (fix/steam-native-install-stability, 33-05 live-gate gap):
 * `init()` now calls the REAL `initOnlineMonitor()`, which reads `net.isOnline()` from
 * `electron` -- under THIS file's default Jest automock (`src/backend/__mocks__/electron.ts`,
 * auto-applied to every backend test unless overridden, per the convention documented in
 * `skeletonFlows.test.ts`'s header), `net` does not exist at all, so the real function would
 * throw. This suite's whole point is proving the sidecar boots without an uncaught exception
 * under the generic/default mock -- it is not the place to validate online-monitor wiring
 * itself (see `onlineMonitorWiring.test.ts`, which routes 'electron' to the REAL electronStub
 * specifically to exercise that). A no-op stub here is sufficient and keeps this suite's
 * long-standing default-automock convention unperturbed.
 *
 * The mock covers the module's FULL exported surface, not just `initOnlineMonitor`:
 * `./handlers`'s transitive import graph (steamFlowRegistration -> storeManagers/index.ts ->
 * every store manager, plus `downloadmanager/downloadqueue.ts`, `utils.ts`, `launcher.ts`, etc.)
 * pulls in numerous OTHER real (unmocked) modules that import `isOnline`/`runOnceWhenOnline`/
 * `onConnectivityChange` from this same module at their own module scope -- `downloadqueue.ts`
 * calls `onConnectivityChange(...)` immediately at import time, for example. Leaving any of
 * these undefined would reintroduce the exact "Cannot read properties of undefined" import-time
 * crash this suite exists to catch.
 */
jest.mock('../../online_monitor', () => ({
  initOnlineMonitor: jest.fn(),
  isOnline: jest.fn(() => true),
  runOnceWhenOnline: jest.fn((callback: () => unknown) => callback()),
  onConnectivityChange: jest.fn()
}))

import { tmpdir } from 'os'
import { isAbsolute, relative, resolve } from 'path'
import { PassThrough } from 'node:stream'
import { init } from '../bootstrap'
import { handlerRegistry } from '../electronStub'
import { getLogFilePath } from '../../logger/paths'
import {
  READY_SENTINEL,
  UNPORTED_CHANNEL_MARKER
} from 'common/types/sidecarTransport'

/** Buffers newline-delimited output from a PassThrough into discrete lines. */
function collectLines(stream: PassThrough): string[] {
  const lines: string[] = []
  let buffer = ''
  stream.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString()
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      lines.push(buffer.slice(0, newlineIndex))
      buffer = buffer.slice(newlineIndex + 1)
      newlineIndex = buffer.indexOf('\n')
    }
  })
  return lines
}

/** Waits a couple of microtask/macrotask turns for async invoke handlers to resolve. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

describe('sidecar bootstrap (headless boot)', () => {
  // Containment tripwire (Phase 34.2 gap cycle 3, plan 34.2-19 --
  // REQ-34.2-07/-14). FIRST test in this describe block, but this is a
  // DETECTOR, not a preventer (corrected 34.2-29, WR-10 remaining half):
  // being the first `it` in this describe only means it runs before the
  // real `init()` calls further down in THIS test body -- it does NOT run
  // before this file's own module-scope imports (`../bootstrap`,
  // `../../logger/paths`, line 66-75 above), and `constants/paths.ts`
  // performs real filesystem work (an `app.getPath('appData')` read plus a
  // conditional `mkdirSync`) at module scope, i.e. before ANY test body in
  // this file runs, tripwire included. The actual preventer is
  // `src/backend/jest.setupContainment.ts`'s `setupFiles`-time precondition
  // (added by plan 34.2-25): `setupFiles` entries run once per test file,
  // strictly BEFORE that file's own imports are evaluated, so containment
  // is already in place by the time this file's module-scope imports above
  // execute -- something a first-test tripwire structurally cannot do. This
  // test carries no jest.mock for os/pathShim/backend/logger/paths of its
  // own; containment comes entirely from that setupFiles registration. Its
  // real value is as LOCALISED DOCUMENTATION at the exact site of the
  // historical defect: if a future edit removes the setupFiles entry, this
  // test still fails HERE too, not only in a distant gate file -- it just
  // does so as a second, redundant detector, not as the mechanism that kept
  // the destruction from happening in the first place.
  it('containment tripwire: getLogFilePath({}) resolves inside os.tmpdir(), not the developer real home', () => {
    const logPath = getLogFilePath({})
    const tmpRoot = resolve(tmpdir())
    const rel = relative(tmpRoot, resolve(logPath))
    expect(rel.startsWith('..')).toBe(false)
    expect(isAbsolute(rel)).toBe(false)
  })

  // Behavior 1: building + running the sidecar entry under bare `node`
  // (electron absent) reaches READY without an uncaught exception --
  // proves paths.ts's app.getPath() and electron_store.ts's `new Store()`
  // import-time walls (spike 009) are shimmed before backend code sees them.
  it('reaches READY under bare node without an uncaught exception', () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const lines = collectLines(output)

    expect(() => init(input, output)).not.toThrow()

    expect(lines).toContain(READY_SENTINEL)
  })

  // Behavior 2: a health/ping invoke frame written to the sidecar's stdin
  // yields a matching SidecarRpcResponse on stdout within a timeout.
  it('round-trips a health/ping invoke frame over stdio', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const lines = collectLines(output)

    init(input, output)
    input.write(
      `${JSON.stringify({
        id: 'test-ping-1',
        kind: 'invoke',
        channel: 'health',
        args: []
      })}\n`
    )

    await flush()

    const responseLine = lines.find((line) =>
      line.includes('"id":"test-ping-1"')
    )
    expect(responseLine).toBeDefined()
    expect(JSON.parse(responseLine as string)).toEqual({
      id: 'test-ping-1',
      ok: true,
      result: 'ok'
    })
  })

  // Behavior 2b (27-05 regression): an invoke for one of the ~217 deliberately-unported
  // channels must reject with the UNPORTED_CHANNEL_MARKER tag, not a bare message. The
  // renderer's on-page error surface keys off that marker to distinguish a documented seam
  // gap from a real bootstrap failure; without it, any module-scope `.then()` on an unported
  // channel (e.g. getUploadedLogFiles) paints over the whole app at boot.
  it('tags an unported-channel invoke as an expected seam gap', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const lines = collectLines(output)

    init(input, output)
    input.write(
      `${JSON.stringify({
        id: 'test-unported-1',
        kind: 'invoke',
        channel: 'getUploadedLogFiles',
        args: []
      })}\n`
    )

    await flush()

    const responseLine = lines.find((line) =>
      line.includes('"id":"test-unported-1"')
    )
    expect(responseLine).toBeDefined()
    const response = JSON.parse(responseLine as string)
    // Still an honest rejection -- only the reason is classified.
    expect(response.ok).toBe(false)
    expect(response.error).toContain(UNPORTED_CHANNEL_MARKER)
    expect(response.error).toContain('getUploadedLogFiles')
  })

  // Behavior 3: importing REAL backend modules under the installed stub does
  // not throw -- require('backend/electron_store') constructs a store
  // (electron-store wall shimmed) AND
  // require('backend/storeManagers/steam/library') imports headlessly (the
  // transitive Electron coupling the live 27-05 run hits -- it pulls in
  // backend/utils.ts -> backend/storeManagers/index.ts, which eagerly
  // constructs EVERY store manager at import time). At least one ipcMain
  // handler (bootstrap's own ./handlers import) is recorded in the
  // electronStub registry.
  it('imports real backend modules headlessly under the installed stub', () => {
    expect(() => require('backend/electron_store')).not.toThrow()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { TypeCheckedStoreBackend } = require('backend/electron_store')
    const store = new TypeCheckedStoreBackend('configStore', { cwd: 'store' })
    expect(typeof store.get).toBe('function')
    expect(typeof store.set).toBe('function')

    expect(() => require('backend/storeManagers/steam/library')).not.toThrow()

    expect(handlerRegistry.has('health')).toBe(true)
  })
})
