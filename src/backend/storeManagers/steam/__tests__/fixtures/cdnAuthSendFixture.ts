// Debug/steam-install-slow-start cycle 11 ("DECISION 2026-07-19: OPTION B"):
// shared test fixture for depot/cdnAuth.ts's `_send`-based manual bypass.
//
// Cycle 10's `_sendUnified`-based fake (used by cdnAuth.test.ts,
// depotPrimitives.test.ts, depot.test.ts) is retired along with the
// production code it mirrored — steam-user's `_sendUnified` was proven on
// real hardware to throw `TypeError: Cannot read properties of undefined
// (reading 'encode')` for this specific RPC (see cdnAuth.ts's module doc
// comment). This fixture instead decodes the REAL, already-encoded request
// `Buffer` cdnAuth.ts's manual bypass sends (via the same compiled protobuf
// classes, `steam-user/protobufs/generated/_load.js`) and hands back a REAL,
// encoded response `Buffer` through the callback — exercising the actual
// wire format end-to-end rather than a pass-through object fake, which is
// exactly the property that matters most after two prior cycles' wiring bugs
// (cycle 6's timeout, cycle 10's TypeError) both slipped past tests that
// mocked the transport too abstractly to notice.
import {
  CContentServerDirectory_GetCDNAuthToken_Request as CdnAuthTokenRequest,
  CContentServerDirectory_GetCDNAuthToken_Response as CdnAuthTokenResponse
} from 'steam-user/protobufs/generated/_load.js'

import type { CDNAuthTokenClient } from '../../depot/cdnAuth'

export type FakeSendCall = {
  methodName: string
  methodData: { app_id: number; depot_id: number; host_name: string }
}

type FakeSendImplResult =
  | { token?: string; expiration_time?: number; eresult?: number }
  | { neverResolves: true }

/** Builds a fake steam-user-shaped client whose `_send` decodes the REAL
 *  request buffer and resolves via a REAL, encoded response buffer. `impl`
 *  receives the exact decoded (methodName, methodData) pair and returns
 *  either a successful `{ token, expiration_time }` body (optionally with a
 *  custom `eresult`) or `{ neverResolves: true }` — used to simulate a
 *  hanging CM round-trip (steam-user's transport never invokes the callback
 *  for a request that never gets a response). */
export function makeFakeSendClient(
  impl?: (call: FakeSendCall) => FakeSendImplResult
): {
  client: CDNAuthTokenClient
  calls: FakeSendCall[]
} {
  const calls: FakeSendCall[] = []
  const client: CDNAuthTokenClient = {
    _send: jest.fn(
      (
        header: { msg: number; proto: { target_job_name: string } },
        body: Buffer,
        callback: (
          body: unknown,
          hdr?: { proto?: { eresult?: number } }
        ) => void
      ) => {
        const decoded = CdnAuthTokenRequest.decode(body)
        const call: FakeSendCall = {
          methodName: header.proto.target_job_name,
          methodData: {
            app_id: decoded.app_id ?? 0,
            depot_id: decoded.depot_id ?? 0,
            host_name: decoded.host_name ?? ''
          }
        }
        calls.push(call)

        const result: FakeSendImplResult = impl
          ? impl(call)
          : {
              token: '?default-token',
              expiration_time: Math.floor(Date.now() / 1000) + 3600
            }
        if ('neverResolves' in result) return // deliberately never calls back

        const responseBuffer = CdnAuthTokenResponse.encode({
          token: result.token,
          expiration_time: result.expiration_time
        }).finish()
        callback(responseBuffer, { proto: { eresult: result.eresult ?? 1 } })
      }
    )
  }
  return { client, calls }
}
