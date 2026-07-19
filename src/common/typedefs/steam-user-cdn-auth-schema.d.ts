/**
 * Types for steam-user's internal compiled protobuf schema bundle.
 * https://github.com/DoctorMcKay/node-steam-user/blob/master/protobufs/generated/_load.js
 *
 * Debug/steam-install-slow-start cycle 11 ("DECISION 2026-07-19: OPTION B"):
 * this path is UNDOCUMENTED in steam-user's public API and @types/steam-user
 * does not declare it — it may move or change shape on a steam-user version
 * bump (Pitfall 5, T-21-10). depot/cdnAuth.ts's loadCdnAuthTokenSchema()
 * treats this as a minimal, defensively-checked surface (a loud throw if
 * `.encode`/`.decode` are ever missing at runtime), and this ambient
 * declaration exists only to satisfy `tsc` for the dynamic import path
 * itself — NOT as a guarantee steam-user won't change this file. Only the
 * two message classes this module actually uses are declared; the real
 * export is a much larger merged protobufjs Root with hundreds of message
 * types.
 */
declare module 'steam-user/protobufs/generated/_load.js' {
  interface CdnAuthTokenRequestMessage {
    encode(data: Record<string, unknown>): { finish(): Buffer }
    decode(buf: Buffer): {
      app_id?: number
      depot_id?: number
      host_name?: string
    }
  }
  interface CdnAuthTokenResponseMessage {
    encode(data: Record<string, unknown>): { finish(): Buffer }
    decode(buf: Buffer): { token?: string; expiration_time?: number }
  }
  export const CContentServerDirectory_GetCDNAuthToken_Request: CdnAuthTokenRequestMessage
  export const CContentServerDirectory_GetCDNAuthToken_Response: CdnAuthTokenResponseMessage
}
