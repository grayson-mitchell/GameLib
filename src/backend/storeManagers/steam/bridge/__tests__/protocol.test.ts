import {
  CONTROL_ORDINAL,
  CONTROL_SLOT,
  FrameTooLargeError,
  FrameTruncatedError,
  INTERFACE_ORDINAL,
  MAX_FRAME_BYTES,
  STATUS_ERR,
  STATUS_OK,
  decodeRequest,
  decodeResponse,
  encodeControl,
  encodeRequest,
  encodeResponse
} from '../protocol'

describe('protocol -- request round-trip', () => {
  it('recovers request_id/ordinal/slot/argBlob byte-for-byte', () => {
    const argBlob = Buffer.from([0xde, 0xad, 0xbe, 0xef])
    const frame = encodeRequest(42, INTERFACE_ORDINAL.user, 2, argBlob)
    const decoded = decodeRequest(frame)

    expect(decoded.requestId).toBe(42)
    expect(decoded.ordinal).toBe(INTERFACE_ORDINAL.user)
    expect(decoded.slot).toBe(2)
    expect(decoded.argBlob).toEqual(argBlob)
  })

  it('round-trips an empty arg blob', () => {
    const frame = encodeRequest(1, INTERFACE_ORDINAL.flat, 0)
    const decoded = decodeRequest(frame)
    expect(decoded.argBlob.length).toBe(0)
  })

  it('the first 4 LE bytes equal the total frame length declared by the frame', () => {
    const argBlob = Buffer.from([1, 2, 3])
    const frame = encodeRequest(7, INTERFACE_ORDINAL.friends, 0, argBlob)
    const declaredLen = frame.readUInt32LE(0)
    // declared length excludes the 4-byte length field itself, matching
    // the already-generated shim's bridge_transact() framing
    expect(frame.length).toBe(4 + declaredLen)
  })
})

describe('protocol -- response round-trip', () => {
  it('decodeResponse(encodeResponse(...)) recovers request_id/status/blob byte-for-byte', () => {
    const retBlob = Buffer.from('76561197995867096', 'ascii')
    const frame = encodeResponse(99, STATUS_OK, retBlob)
    const decoded = decodeResponse(frame)

    expect(decoded.requestId).toBe(99)
    expect(decoded.status).toBe(STATUS_OK)
    expect(decoded.retBlob).toEqual(retBlob)
  })

  it('round-trips an error status with an empty blob', () => {
    const frame = encodeResponse(5, STATUS_ERR)
    const decoded = decodeResponse(frame)
    expect(decoded.status).toBe(STATUS_ERR)
    expect(decoded.retBlob.length).toBe(0)
  })
})

describe('protocol -- MAX_FRAME_BYTES bounds (T-24-03)', () => {
  it('encodeRequest rejects an arg blob that would push total_len past MAX_FRAME_BYTES', () => {
    const oversized = Buffer.alloc(MAX_FRAME_BYTES)
    expect(() =>
      encodeRequest(1, INTERFACE_ORDINAL.flat, 0, oversized)
    ).toThrow(FrameTooLargeError)
  })

  it('encodeResponse rejects a return blob that would push total_len past MAX_FRAME_BYTES', () => {
    const oversized = Buffer.alloc(MAX_FRAME_BYTES)
    expect(() => encodeResponse(1, STATUS_OK, oversized)).toThrow(
      FrameTooLargeError
    )
  })

  it('decodeRequest rejects an oversized declared length WITHOUT allocating/slicing past the cap', () => {
    // Craft only a 4-byte length-prefix header declaring an enormous length
    // -- the decoder must reject based on the header alone, never touching
    // (or requiring) a body anywhere near that size.
    const header = Buffer.alloc(4)
    header.writeUInt32LE(MAX_FRAME_BYTES + 1, 0)
    expect(() => decodeRequest(header)).toThrow(FrameTooLargeError)
  })

  it('decodeResponse rejects an oversized declared length WITHOUT allocating/slicing past the cap', () => {
    const header = Buffer.alloc(4)
    header.writeUInt32LE(0xffffffff, 0)
    expect(() => decodeResponse(header)).toThrow(FrameTooLargeError)
  })

  it('a frame at exactly MAX_FRAME_BYTES is accepted (boundary, not off-by-one rejected)', () => {
    const argBlob = Buffer.alloc(MAX_FRAME_BYTES - 8) // REQUEST_HEADER_BYTES = 8
    const frame = encodeRequest(1, INTERFACE_ORDINAL.flat, 0, argBlob)
    expect(() => decodeRequest(frame)).not.toThrow()
  })
})

describe('protocol -- truncated frames (never silently accepted)', () => {
  it('decodeRequest reports a truncated frame (fewer bytes than declared) as incomplete', () => {
    const argBlob = Buffer.from([1, 2, 3, 4])
    const fullFrame = encodeRequest(1, INTERFACE_ORDINAL.user, 0, argBlob)
    const truncated = fullFrame.subarray(0, fullFrame.length - 2)
    expect(() => decodeRequest(truncated)).toThrow(FrameTruncatedError)
  })

  it('decodeResponse reports a truncated frame (fewer bytes than declared) as incomplete', () => {
    const retBlob = Buffer.from([9, 9, 9, 9, 9, 9, 9, 9])
    const fullFrame = encodeResponse(1, STATUS_OK, retBlob)
    const truncated = fullFrame.subarray(0, fullFrame.length - 3)
    expect(() => decodeResponse(truncated)).toThrow(FrameTruncatedError)
  })

  it('decodeRequest reports a frame shorter than the 4-byte length prefix as truncated', () => {
    expect(() => decodeRequest(Buffer.from([1, 2]))).toThrow(
      FrameTruncatedError
    )
  })
})

describe('protocol -- interface ordinals + CONTROL reservation (review finding #7)', () => {
  it('INTERFACE_ORDINAL maps flat=0, user=1, friends=2 (matches the 24-01 generator)', () => {
    expect(INTERFACE_ORDINAL.flat).toBe(0)
    expect(INTERFACE_ORDINAL.user).toBe(1)
    expect(INTERFACE_ORDINAL.friends).toBe(2)
  })

  it('CONTROL_ORDINAL is reserved and distinct from every real interface ordinal', () => {
    expect(CONTROL_ORDINAL).toBe(0xffff)
    expect(Object.values(INTERFACE_ORDINAL)).not.toContain(CONTROL_ORDINAL)
  })

  it('CONTROL_SLOT exposes health and whoami slots', () => {
    expect(CONTROL_SLOT.health).toBe(0)
    expect(CONTROL_SLOT.whoami).toBe(1)
  })
})

describe('protocol -- CONTROL HEALTH/WHOAMI round-trip (review finding #7)', () => {
  it('encodeControl(HEALTH) produces a request frame on CONTROL_ORDINAL/health slot', () => {
    const frame = encodeControl(1, 'health')
    const decoded = decodeRequest(frame)
    expect(decoded.ordinal).toBe(CONTROL_ORDINAL)
    expect(decoded.slot).toBe(CONTROL_SLOT.health)
    expect(decoded.argBlob.length).toBe(0)
  })

  it('encodeControl(WHOAMI) produces a request frame on CONTROL_ORDINAL/whoami slot', () => {
    const frame = encodeControl(2, 'whoami')
    const decoded = decodeRequest(frame)
    expect(decoded.ordinal).toBe(CONTROL_ORDINAL)
    expect(decoded.slot).toBe(CONTROL_SLOT.whoami)
  })

  it('a HEALTH response (process up, pre-init) round-trips an ok status', () => {
    // The helper answers HEALTH immediately at process start, independent
    // of InitFlat success -- proves "process up", not "session live".
    const response = encodeResponse(1, STATUS_OK)
    const decoded = decodeResponse(response)
    expect(decoded.status).toBe(STATUS_OK)
  })

  it('a WHOAMI response after successful init round-trips ok + the real SteamID64 as raw bytes', () => {
    // SteamID64 kept as raw bytes end-to-end -- never parsed to a JS number
    // (project constraint: 64-bit IDs are strings/bytes, not doubles).
    const steamId64Bytes = Buffer.alloc(8)
    steamId64Bytes.writeBigUInt64LE(BigInt('76561197995867096'), 0)

    const response = encodeResponse(2, STATUS_OK, steamId64Bytes)
    const decoded = decodeResponse(response)

    expect(decoded.status).toBe(STATUS_OK)
    expect(decoded.retBlob).toEqual(steamId64Bytes)
    expect(decoded.retBlob.readBigUInt64LE(0)).toBe(BigInt('76561197995867096'))
  })

  it('a WHOAMI response before init succeeds round-trips a not-inited (err) status distinguishable from HEALTH ok', () => {
    const healthResponse = decodeResponse(encodeResponse(1, STATUS_OK))
    const whoamiNotInitedResponse = decodeResponse(
      encodeResponse(2, STATUS_ERR)
    )

    // The two-state readiness contract 24-06 depends on: HEALTH can be ok
    // while WHOAMI is simultaneously not-inited.
    expect(healthResponse.status).toBe(STATUS_OK)
    expect(whoamiNotInitedResponse.status).toBe(STATUS_ERR)
    expect(whoamiNotInitedResponse.status).not.toBe(healthResponse.status)
  })
})
