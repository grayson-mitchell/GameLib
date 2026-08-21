/**
 * Shared types for the OAuth login-capture channel (Phase 34.4.1 Plan 09, D-04,
 * REQ-34.4.1-08).
 *
 * Lives in `common/types/` rather than being defined in
 * `backend/sidecar/oauthLoginCapture.ts` directly, because `common/types/ipc.ts`'s
 * `AsyncIPCFunctions.oauthCaptureLogin` entry needs both types and this codebase's import
 * direction is always common -> backend/frontend, never the reverse (mirrors every other
 * backend-owned-but-ipc-shared type, e.g. `NileLoginData`/`NileRegisterData` in
 * `common/types/nile.ts`). `oauthLoginCapture.ts` imports and re-exports both names so callers
 * never need to know the type lives here rather than alongside the functions that use it — a
 * single source of truth, never a duplicated definition.
 */

export type OAuthRunner = 'legendary' | 'gog' | 'nile' | 'zoom'

export type OAuthCaptureOutcome =
  | {
      status: 'captured'
      runner: OAuthRunner
      code: string | null
      redirectUrl: string
    }
  | { status: 'cancelled' }
  | { status: 'timeout' }
  | { status: 'unsupported' }
  | { status: 'error'; message: string }
