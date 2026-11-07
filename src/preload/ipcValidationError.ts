import { IPC_INVALID_ARGS, parseIpcInvalidArgsError } from 'common/types/sidecarTransport'

/**
 * Typed renderer-side form of a sidecar schema rejection (D-08). Carries only the channel,
 * the failing argument paths and zod issue codes: no argument values are ever available
 * here (D-10).
 */
export class IpcValidationError extends Error {
  readonly code: typeof IPC_INVALID_ARGS = IPC_INVALID_ARGS
  readonly channel: string
  readonly paths: string[]
  readonly codes: string[]

  constructor(channel: string, paths: string[], codes: string[]) {
    super(`Invalid arguments for IPC channel '${channel}' at ${paths.join(', ')}`)
    this.name = 'IpcValidationError'
    this.channel = channel
    this.paths = paths
    this.codes = codes
    Object.setPrototypeOf(this, IpcValidationError.prototype)
  }

  /** Tauri rejects with strings; accept Error or string, return null for anything else. */
  static fromRejection(err: unknown): IpcValidationError | null {
    const message = err instanceof Error ? err.message : typeof err === 'string' ? err : null
    if (message === null) return null
    const payload = parseIpcInvalidArgsError(message)
    if (!payload) return null
    return new IpcValidationError(payload.channel, payload.paths, payload.codes)
  }
}
