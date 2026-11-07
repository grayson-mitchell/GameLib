import { z } from 'zod'

import type { OAuthCaptureOutcome } from '../oauthLogin'

import { urlArg, type InvokeFns } from './schemaTypes'

// Phase 34.4.1 Plan 09 (D-04, REQ-34.4.1-08): captures an OAuth redirect code/token for one
// of the still-unported login runners (legendary/gog/nile) via the Tauri login-window seam.
// This channel captures a redirect -- it does NOT authenticate: `login`, `authGOG` and
// `authAmazon` remain the credential channels. Tauri-only by construction -- resolves
// `{ status: 'unsupported' }` under Electron (no seam installed there).
//
// `url` is any parseable URL: the handler's own https-only check is authoritative and answers
// with a typed `{ status: 'error', message }` outcome, which a boundary reject would replace
// with a wire error (D-05; scheme allow-lists are Phase 72).
export const oauthLoginAsyncArgs = {
  oauthCaptureLogin: z.tuple([
    z.strictObject({
      runner: z.enum(['legendary', 'gog', 'nile']),
      url: urlArg()
    })
  ])
}

interface OauthLoginAsyncReturns {
  oauthCaptureLogin: Promise<OAuthCaptureOutcome>
}

export type OauthLoginAsync = InvokeFns<
  typeof oauthLoginAsyncArgs,
  OauthLoginAsyncReturns
>
