/**
 * The anonymous CM client (Phase 79, D-04): one shared view for public PICS reads
 * (`getProductInfo`). The session is owned by the Rust anon actor (steamcm_anon_*), which keeps
 * it, bounds the connect and closes it when idle; this module only hands out the RustInvoke-backed
 * view and forwards close. An anonymous CM session carries no account, so it can never sign Mac
 * Steam's Friends session out, and it needs no go-offline wrap. Public app info (platform flags,
 * install dir, launch targets) is readable anonymously; entries that need a token come back
 * `missingToken` or `public_only` (see `isPublicOnlyEntry`).
 *
 * This module imports neither the authenticated user module nor the token store: it never reads
 * the keyring and never sees a credential. It holds no timer, socket or child handle (exit
 * contract), and the shell EOF / exit hook owns the Rust teardown.
 */
import { logWarning, LogPrefix } from 'backend/logger'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { RUST_STEAMCM_ANON_CLOSE } from 'common/types/sidecarTransport'
import { createRustAnonClient } from './cm/RustAnonClient'

/** Structurally compatible with platformCapture's PlatformCapturePicsClient. */
interface AnonymousPicsClient {
  getProductInfo(
    apps: number[],
    packages: number[],
    inclTokens?: boolean
  ): Promise<{
    apps?: Record<number, { appinfo?: unknown; missingToken?: boolean }>
    unknownApps?: number[]
  }>
}

export interface AnonymousClientDeps {
  /** The boot's rustInvoke transport: the Rust anon actor owns the session. */
  requestRustInvoke: RustInvokeDeps['requestRustInvoke']
}

export interface AnonymousClient {
  /** The shared anonymous PICS view; the Rust actor connects on first read. */
  get(reason: string): Promise<AnonymousPicsClient | null>
  close(cause: 'idle' | 'logout' | 'shutdown'): void
  /** Stdin EOF: a no-op, the shell exit hook owns the Rust session teardown (D-18). */
  releaseForShutdown(): void
}

/** What a consumer that only reads public app data needs. */
export interface AnonymousClientSlice {
  anonymousClient: Pick<AnonymousClient, 'get'>
}

/** One anonymous client per boot (D-05, D-66.3-14). */
export function createAnonymousClient(
  deps: AnonymousClientDeps
): AnonymousClient {
  let view: AnonymousPicsClient | null = null
  return {
    async get() {
      if (!view) {
        view = createRustAnonClient({
          requestRustInvoke: deps.requestRustInvoke
        })
      }
      return view
    },
    close(cause) {
      deps
        .requestRustInvoke(RUST_STEAMCM_ANON_CLOSE, [{ reason: cause }])
        .catch((err: unknown) =>
          logWarning(
            ['[Steam] steamcm_anon_close failed:', err],
            LogPrefix.Steam
          )
        )
    },
    releaseForShutdown() {
      // No IPC: the shell exit / EOF hook owns the Rust teardown.
    }
  }
}

/**
 * True when a PICS entry carries only public data: the token-gated half was
 * withheld (`missingToken`) or the entry is flagged `public_only`.
 */
export function isPublicOnlyEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false
  const e = entry as { missingToken?: unknown; appinfo?: unknown }
  if (e.missingToken === true) return true
  if (e.appinfo && typeof e.appinfo === 'object') {
    const flag = (e.appinfo as { public_only?: unknown }).public_only
    return flag === true || flag === 1 || flag === '1'
  }
  return false
}
