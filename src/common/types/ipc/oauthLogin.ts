import type { OAuthRunner, OAuthCaptureOutcome } from '../oauthLogin'

// ts-prune-ignore-next
export interface OauthLoginAsync {
  // Phase 34.4.1 Plan 09 (D-04, REQ-34.4.1-08): captures an OAuth redirect code/token for one
  // of the still-unported login runners (legendary/gog/nile) via the Tauri
  // login-window seam. This channel captures a redirect -- it does NOT authenticate: `login`,
  // `authGOG` and `authAmazon` above remain unported and still reject with
  // UNPORTED_CHANNEL_MARKER until Phase 34.5 (SEAM Invariant B). Tauri-only by construction --
  // resolves `{ status: 'unsupported' }` under Electron (no seam installed there).
  oauthCaptureLogin: (params: {
    runner: OAuthRunner
    url: string
  }) => Promise<OAuthCaptureOutcome>
}
