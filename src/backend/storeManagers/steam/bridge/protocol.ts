/**
 * Phase 24 Plan 02 (R2) -- the TypeScript-side definition of the binary wire
 * frame the bottle-side generated shim (`native/steam-bridge/generated/steam_api_shim.c`,
 * Plan 24-01) and the native arm64 host helper (`native/steam-bridge/helper/bridge_helper.c`,
 * Plan 24-02) both speak over the persistent 127.0.0.1 loopback connection.
 *
 * The REAL wire code lives in C on both ends (`bridge_transact()` in the
 * generated shim; the read-loop in `bridge_helper.c`). This module exists so:
 *  - the layout has a single, testable source of truth on the TS side
 *    (24-RESEARCH.md Pattern 3), matched byte-for-byte against the shim's
 *    ALREADY-GENERATED `bridge_transact()` framing (verified against
 *    `native/steam-bridge/generated/steam_api_shim.c` lines 55-85);
 *  - the 24-06 readiness probe (Node `net` client) can encode/decode CONTROL
 *    HEALTH/WHOAMI frames without a native dependency.
 *
 * Frame layout (both request and response share the same outer shape --
 * a 4-byte LE length prefix whose VALUE EXCLUDES ITSELF, i.e. it is the byte
 * count of everything AFTER the length field):
 *
 *   Request  (shim -> helper):
 *     [4B LE total_len]  -- byte count of request_id+ordinal+slot+argBlob
 *     [4B LE request_id] -- correlates the response on the persistent conn
 *     [2B LE ordinal]    -- 0=flat API, 1=ISteamUser, 2=ISteamFriends,
 *                            0xffff=CONTROL (reserved, finding #7)
 *     [2B LE slot]       -- method slot (generator's vtable slot table), or
 *                            CONTROL_SLOT.health/whoami on the CONTROL ordinal
 *     [N bytes] argBlob  -- raw little-endian packed args
 *
 *   Response (helper -> shim):
 *     [4B LE total_len]  -- byte count of request_id+status+retBlob
 *     [4B LE request_id] -- echoes the request
 *     [1B status]        -- 0=ok, 1=err/no-live-session (or not-inited, for
 *                            a CONTROL WHOAMI answered before init succeeds)
 *     [N bytes] retBlob  -- register-return raw bytes OR full sret struct
 *                            bytes OR (CONTROL WHOAMI, ok) the SteamID64 as
 *                            raw 8 bytes -- NEVER parsed to a JS number
 *                            end-to-end (project constraint: 64-bit IDs are
 *                            strings/bytes, never parsed through a lossy
 *                            numeric path).
 *
 * CONTROL frame (review finding #7): reuses this identical shape on a
 * reserved ordinal so the 24-06 readiness probe can distinguish two states
 * that a single PING-style liveness check cannot:
 *   - HEALTH (slot 0): answerable by the helper immediately at process
 *     start, BEFORE `SteamAPI_InitFlat` completes -- proves "process up".
 *   - WHOAMI (slot 1): answerable ok+SteamID64-bytes ONLY after
 *     `SteamAPI_InitFlat` succeeded against the live signed-in Mac Steam --
 *     proves "init succeeded against a live session". Answers
 *     status=err/not-inited otherwise.
 */

// ── Frame field widths (all fields little-endian) ──────────────────────────

const LENGTH_FIELD_BYTES = 4
const REQUEST_ID_BYTES = 4
const ORDINAL_BYTES = 2
const SLOT_BYTES = 2
const STATUS_BYTES = 1

/** Byte count of request_id+ordinal+slot -- everything the request's
 * `total_len` field counts besides the arg blob. */
const REQUEST_HEADER_BYTES = REQUEST_ID_BYTES + ORDINAL_BYTES + SLOT_BYTES // 8

/** Byte count of request_id+status -- everything the response's
 * `total_len` field counts besides the return blob. */
const RESPONSE_HEADER_BYTES = REQUEST_ID_BYTES + STATUS_BYTES // 5

/**
 * T-24-03 mitigation: hard cap on the frame's DECLARED length (the
 * `total_len` field), enforced BEFORE any allocation/slice of the frame
 * body. 64 KiB is generous for every payload this phase's acceptance set
 * needs (SteamID64 = 8 bytes, persona name strings, small struct returns)
 * while still bounding a malicious/malformed declared length.
 */
export const MAX_FRAME_BYTES = 65536

// ── Interface ordinals + CONTROL reservation ────────────────────────────────

/** Matches the generator's (Plan 24-01) ordinal assignment exactly --
 * `native/steam-bridge/generated/steam_api_shim.c`: ordinal 1 = SteamUser023,
 * ordinal 2 = SteamFriends018. Ordinal 0 is reserved for the flat
 * `SteamAPI_*` exports. */
export const INTERFACE_ORDINAL = {
  flat: 0,
  user: 1,
  friends: 2
} as const

export type InterfaceOrdinalName = keyof typeof INTERFACE_ORDINAL

/** Reserved ordinal for the CONTROL frame (review finding #7) -- never a
 * real Steamworks interface, so it is placed at the top of the uint16
 * range, far from any plausible future interface ordinal. */
export const CONTROL_ORDINAL = 0xffff

export const CONTROL_SLOT = {
  health: 0,
  whoami: 1
} as const

export type ControlSlotName = keyof typeof CONTROL_SLOT

// ── Response status codes ───────────────────────────────────────────────────

export const STATUS_OK = 0
/** Generic error, OR (on a CONTROL WHOAMI response specifically) "not yet
 * inited against a live session" -- see module doc. */
export const STATUS_ERR = 1

// ── Decoded shapes ──────────────────────────────────────────────────────────

export interface DecodedRequest {
  requestId: number
  ordinal: number
  slot: number
  argBlob: Buffer
}

export interface DecodedResponse {
  requestId: number
  status: number
  retBlob: Buffer
}

// ── Errors ───────────────────────────────────────────────────────────────────

/**
 * Thrown when a frame's DECLARED length exceeds MAX_FRAME_BYTES. Thrown
 * immediately after reading the 4-byte length prefix, before any attempt to
 * allocate or slice the (attacker-controllable) body -- T-24-03.
 */
export class FrameTooLargeError extends Error {
  constructor(declaredLength: number) {
    super(
      `Frame declares length ${declaredLength}, exceeding MAX_FRAME_BYTES (${MAX_FRAME_BYTES}) -- rejected before allocating (T-24-03)`
    )
    this.name = 'FrameTooLargeError'
  }
}

/**
 * Thrown when the supplied buffer contains fewer bytes than the frame's own
 * declared length promises -- a truncated frame is reported as incomplete,
 * never silently accepted/parsed with garbage past the end of the buffer.
 */
export class FrameTruncatedError extends Error {
  constructor(declaredLength: number, availableLength: number) {
    super(
      `Frame declares length ${declaredLength} but only ${availableLength} bytes are available -- truncated, not accepted`
    )
    this.name = 'FrameTruncatedError'
  }
}

function assertUint16(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new RangeError(
      `${fieldName} must be a uint16 (0-65535), got ${value}`
    )
  }
}

function assertUint32(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError(`${fieldName} must be a uint32, got ${value}`)
  }
}

function assertUint8(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`${fieldName} must be a uint8 (0-255), got ${value}`)
  }
}

// ── Request encode/decode ───────────────────────────────────────────────────

export function encodeRequest(
  requestId: number,
  ordinal: number,
  slot: number,
  argBlob: Buffer = Buffer.alloc(0)
): Buffer {
  assertUint32(requestId, 'requestId')
  assertUint16(ordinal, 'ordinal')
  assertUint16(slot, 'slot')

  const totalLen = REQUEST_HEADER_BYTES + argBlob.length
  if (totalLen > MAX_FRAME_BYTES) {
    throw new FrameTooLargeError(totalLen)
  }

  const buf = Buffer.alloc(LENGTH_FIELD_BYTES + totalLen)
  buf.writeUInt32LE(totalLen, 0)
  buf.writeUInt32LE(requestId, 4)
  buf.writeUInt16LE(ordinal, 8)
  buf.writeUInt16LE(slot, 10)
  argBlob.copy(buf, 12)
  return buf
}

/**
 * Decodes a request frame from `buffer`. The declared length is checked
 * against MAX_FRAME_BYTES BEFORE any attempt to slice the arg blob out of
 * `buffer` (T-24-03 -- never allocate/copy past the cap based on an
 * attacker-controlled declared length).
 */
export function decodeRequest(buffer: Buffer): DecodedRequest {
  if (buffer.length < LENGTH_FIELD_BYTES) {
    throw new FrameTruncatedError(LENGTH_FIELD_BYTES, buffer.length)
  }

  const totalLen = buffer.readUInt32LE(0)
  if (totalLen > MAX_FRAME_BYTES) {
    throw new FrameTooLargeError(totalLen)
  }
  if (totalLen < REQUEST_HEADER_BYTES) {
    throw new FrameTruncatedError(REQUEST_HEADER_BYTES, totalLen)
  }

  const frameEnd = LENGTH_FIELD_BYTES + totalLen
  if (buffer.length < frameEnd) {
    throw new FrameTruncatedError(frameEnd, buffer.length)
  }

  const requestId = buffer.readUInt32LE(4)
  const ordinal = buffer.readUInt16LE(8)
  const slot = buffer.readUInt16LE(10)
  const argBlob = buffer.subarray(12, frameEnd)

  return { requestId, ordinal, slot, argBlob }
}

// ── Response encode/decode ──────────────────────────────────────────────────

export function encodeResponse(
  requestId: number,
  status: number,
  retBlob: Buffer = Buffer.alloc(0)
): Buffer {
  assertUint32(requestId, 'requestId')
  assertUint8(status, 'status')

  const totalLen = RESPONSE_HEADER_BYTES + retBlob.length
  if (totalLen > MAX_FRAME_BYTES) {
    throw new FrameTooLargeError(totalLen)
  }

  const buf = Buffer.alloc(LENGTH_FIELD_BYTES + totalLen)
  buf.writeUInt32LE(totalLen, 0)
  buf.writeUInt32LE(requestId, 4)
  buf.writeUInt8(status, 8)
  retBlob.copy(buf, 9)
  return buf
}

/**
 * Decodes a response frame from `buffer`. Same T-24-03 ordering as
 * `decodeRequest`: the declared length is bounds-checked against
 * MAX_FRAME_BYTES before any slice of the (potentially large) return blob.
 */
export function decodeResponse(buffer: Buffer): DecodedResponse {
  if (buffer.length < LENGTH_FIELD_BYTES) {
    throw new FrameTruncatedError(LENGTH_FIELD_BYTES, buffer.length)
  }

  const totalLen = buffer.readUInt32LE(0)
  if (totalLen > MAX_FRAME_BYTES) {
    throw new FrameTooLargeError(totalLen)
  }
  if (totalLen < RESPONSE_HEADER_BYTES) {
    throw new FrameTruncatedError(RESPONSE_HEADER_BYTES, totalLen)
  }

  const frameEnd = LENGTH_FIELD_BYTES + totalLen
  if (buffer.length < frameEnd) {
    throw new FrameTruncatedError(frameEnd, buffer.length)
  }

  const requestId = buffer.readUInt32LE(4)
  const status = buffer.readUInt8(8)
  const retBlob = buffer.subarray(9, frameEnd)

  return { requestId, status, retBlob }
}

// ── CONTROL frame helper (review finding #7) ────────────────────────────────

/**
 * Builds a CONTROL request frame (reserved `CONTROL_ORDINAL`) for either the
 * HEALTH or WHOAMI slot. HEALTH is answerable by the helper pre-init;
 * WHOAMI is answerable ok+SteamID64-bytes only post-successful-init (see
 * module doc). The caller supplies `requestId` so it can correlate the
 * response on the persistent connection like any other request.
 */
export function encodeControl(
  requestId: number,
  slot: ControlSlotName
): Buffer {
  return encodeRequest(
    requestId,
    CONTROL_ORDINAL,
    CONTROL_SLOT[slot],
    Buffer.alloc(0)
  )
}
