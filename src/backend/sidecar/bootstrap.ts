/**
 * Sidecar bootstrap module (Phase 27 Plan 02 — Task 2).
 *
 * The real process entry is `src/sidecar/index.ts` (bundled by `pnpm
 * build:sidecar` to `build/main/sidecar.js`, spawned by the Rust shell —
 * `src-tauri/src/main.rs`, 27-01), which imports `init` from this module and
 * calls it unconditionally.
 *
 * This module's ordering is load-bearing (spike 009's sharp edge): the
 * `Module._load` hook that redirects `require('electron')` -> electronStub
 * AND `require('electron-store')` -> fileStore MUST be installed BEFORE
 * `./handlers` is imported, because `backend/constants/paths.ts` calls
 * `app.getPath()` at MODULE SCOPE and `backend/electron_store.ts`
 * constructs `new Store()` at MODULE SCOPE (20 files route through it) —
 * intercepting only 'electron' leaves that second wall standing.
 */

import Module from 'node:module'
import type { Readable, Writable } from 'node:stream'
import * as electronStub from './electronStub'
import FileStore from './fileStore'
import { READY_SENTINEL } from 'common/types/sidecarTransport'

// ---- Step 1: install the require hook — BEFORE any backend import below ----

interface ModuleWithLoad {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}

const moduleWithLoad = Module as unknown as ModuleWithLoad
const originalLoad = moduleWithLoad._load.bind(moduleWithLoad)

moduleWithLoad._load = (
  request: string,
  parent: unknown,
  isMain: boolean
): unknown => {
  if (request === 'electron') {
    return electronStub
  }
  if (request === 'electron-store') {
    return { __esModule: true, default: FileStore }
  }
  return originalLoad(request, parent, isMain)
}

// ---- Step 2: import the backend registration path — AFTER the hook -------

import './handlers'
import {
  startRpcServer,
  pushFrontendMessage,
  requestOpenExternal
} from './sidecarRpc'
// Deviation (Rule 3 — blocking, Phase 27 Plan 04): `backend/logger`'s
// `logInfo`/`logWarning`/`logError` (called throughout the REAL Steam
// read/action flow code Plan 04 wires up — e.g. library.ts's refresh()
// "Steam client not ready..." warning, games.ts's launch() "launching
// appId..." info line, buildSteamProtocolUrl's guard-rejection warning)
// dereference a module-private `heroicLogWriter` that is ONLY ever assigned
// by that module's exported `init()`/`initHeadless()`. The headless sidecar
// has no Electron-app startup hook, so every one of those log calls threw
// `Cannot read properties of undefined (reading 'logInfo')` the instant a
// real flow handler ran (discovered by Task 2's own end-to-end test). Uses
// `initHeadless()` (added by this same deviation, `backend/logger/index.ts`)
// rather than the real `init()` Electron's main process calls: `init()`
// pulls in `GlobalConfig.get()` (assumes an already-initialized `userData`
// config file — a real Electron app guarantees this, this headless process
// does not) and fires a fire-and-forget system-info dump (shells out to
// hardware/binary-version probes; its async chain can outlive a short-lived
// caller, e.g. a test process tearing down before it resolves).
// `initHeadless()` assigns the SAME `heroicLogWriter` singleton via the
// SAME real `LogWriter` class, skipping only those two Electron-app-only
// side effects — not a reimplementation of logging itself.
import { initHeadless as initLogger } from '../logger'

// ---- Step 3: start the RPC server, wire the transport, signal READY -------

/**
 * Starts the sidecar: begins serving the stdio JSON-RPC loop, wires
 * electronStub's `shell.openExternal`/`sendFrontendMessage` push path onto
 * it, then prints `READY_SENTINEL`. Streams are injectable for testing
 * (`bootstrap.test.ts` drives this with `stream.PassThrough` pairs);
 * production use (`src/sidecar/index.ts`) relies on the
 * `process.stdin`/`process.stdout` defaults.
 */
let loggerInitialized = false

export function init(
  input: Readable = process.stdin,
  output: Writable = process.stdout
): void {
  // Idempotent — bootstrap.test.ts / skeletonFlows.test.ts each call this
  // function multiple times per file (fresh streams per test); production
  // calls it once per process, same as the Electron main process's own
  // single `init()`/`initHeadless()` startup call.
  if (!loggerInitialized) {
    initLogger()
    loggerInitialized = true
  }
  startRpcServer(input, output)
  electronStub.bindTransport({
    openExternal: requestOpenExternal,
    pushFrontendMessage
  })
  output.write(`${READY_SENTINEL}\n`)
}
