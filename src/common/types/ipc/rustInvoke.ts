import type { z } from 'zod'
import type { RustInvokeChannel } from '../sidecarTransport'

/**
 * Phase 67 D-13: one args-tuple schema per RUST_INVOKE_CHANNELS entry, consumed by
 * `meta/genIpcContract.ts` to emit Rust arg structs. Filled by 67-06; the sidecar does not
 * re-check these at runtime. Kept out of `sidecarTransport.ts` because the preload value-imports
 * that file and zod must not reach the renderer.
 */
export const rustInvokeArgs: Partial<Record<RustInvokeChannel, z.ZodTuple>> = {}
