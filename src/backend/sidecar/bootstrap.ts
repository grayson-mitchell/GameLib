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

// ---- Step 3: start the RPC server, wire the transport, signal READY -------

/**
 * Starts the sidecar: begins serving the stdio JSON-RPC loop, wires
 * electronStub's `shell.openExternal`/`sendFrontendMessage` push path onto
 * it, then prints `READY_SENTINEL`. Streams are injectable for testing
 * (`bootstrap.test.ts` drives this with `stream.PassThrough` pairs);
 * production use (`src/sidecar/index.ts`) relies on the
 * `process.stdin`/`process.stdout` defaults.
 */
export function init(
  input: Readable = process.stdin,
  output: Writable = process.stdout
): void {
  startRpcServer(input, output)
  electronStub.bindTransport({
    openExternal: requestOpenExternal,
    pushFrontendMessage
  })
  output.write(`${READY_SENTINEL}\n`)
}
