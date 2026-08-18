// Phase 23.1 plan 04: minimal test-only worker fixture whose ready
// handshake reports `lzmaKind: 'native'` -- exercises DecompressPool's
// `stats().nativeWorkers` increment/decrement bookkeeping (see
// decompressPool.test.ts's "stats().nativeWorkers" describe block). Does
// NOT implement real decode -- pair with poolTestWorker.js (no lzmaKind,
// the pre-existing back-compat shape) for decode round-trip coverage.
const { parentPort } = require('node:worker_threads')

parentPort.postMessage({ type: 'ready', lzmaKind: 'native' })
