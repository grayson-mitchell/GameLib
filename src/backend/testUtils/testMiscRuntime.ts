/**
 * A fresh, isolated misc runtime for consumer tests (66.4-18). Plain object, no jest APIs: every call
 * builds its own metadata-override push, Mac arch prompt chain and ITAD rate-limit gate, so two tests never
 * share state. Required lazily (testServices builds one by default for every suite, and loading it at
 * import would pull the override, recovery and ITAD modules in ahead of suites that mock them).
 */
import type { MiscRuntime, MiscRuntimeDeps } from '../miscRuntime'

/** A transport that was not wired for this test: any call rejects instead of reaching Rust. */
const unwiredRustInvoke = (() =>
  Promise.reject(
    new Error('requestRustInvoke is not wired for this test')
  )) as unknown as MiscRuntimeDeps['requestRustInvoke']

export function createTestMiscRuntime(
  opts: Partial<MiscRuntimeDeps> = {}
): MiscRuntime {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createMiscRuntime } =
    require('../miscRuntime') as typeof import('../miscRuntime')
  /* eslint-enable @typescript-eslint/no-require-imports */
  return createMiscRuntime({
    metadataChanged: opts.metadataChanged,
    requestRustInvoke: opts.requestRustInvoke ?? unwiredRustInvoke
  })
}
