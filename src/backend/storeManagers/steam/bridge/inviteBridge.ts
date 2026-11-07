/**
 * Phase 58 Plan 31 (M-01 Direction A): control client for the helper's
 * friend-list (slot 13) and invite (slot 14) slots.
 *
 * Every call is one single-shot loopback connection: HELLO with the probe
 * role (so no `shim attached` line splits the census segment), one control
 * frame, then destroy. The timeout is unref'd (sidecar exit contract) and the
 * socket is destroyed on every settle path. Persona names and ordinals are
 * never logged -- only fixed words and counts.
 */
import { Socket } from 'node:net'

import { logInfo, LogPrefix } from 'backend/logger'
import type {
  BridgeFriend,
  BridgeInviteResult,
  BridgeListFriendsResult
} from 'common/types/steam'
import { getBridgeHelperConnection } from './helperRegistry'
import {
  CONTROL_ORDINAL,
  CONTROL_SLOT,
  FrameTooLargeError,
  HELLO_ROLE_PROBE,
  INVITE_RESULT,
  STATUS_OK,
  decodeFriendList,
  decodeResponse,
  encodeHello,
  encodeInviteFriendArgs,
  encodeRequest
} from './protocol'

const BRIDGE_HOST = '127.0.0.1'
const CONTROL_TIMEOUT_MS = 3000
const HELLO_REQUEST_ID = 1
const CONTROL_REQUEST_ID = 2

/** Resolves the control reply payload, or null on any failure. */
function controlRoundTrip(
  port: number,
  secret: string,
  slot: number,
  args: Buffer
): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const socket = new Socket()
    let settled = false
    let stage: 'hello' | 'control' = 'hello'
    let received = Buffer.alloc(0)

    const finish = (result: Buffer | null) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      socket.destroy()
      resolve(result)
    }

    const timeout = setTimeout(() => finish(null), CONTROL_TIMEOUT_MS)
    timeout.unref?.()

    socket.once('error', () => finish(null))

    socket.connect(port, BRIDGE_HOST, () => {
      try {
        socket.write(encodeHello(HELLO_REQUEST_ID, secret, HELLO_ROLE_PROBE))
      } catch {
        finish(null)
      }
    })

    socket.on('data', (chunk: Buffer) => {
      received = Buffer.concat([received, chunk])
      let decoded
      try {
        decoded = decodeResponse(received)
      } catch (error) {
        if (error instanceof FrameTooLargeError) finish(null)
        return // truncated: wait for more, bounded by the timeout
      }
      received = Buffer.alloc(0)
      if (decoded.status !== STATUS_OK) {
        finish(null)
        return
      }
      if (stage === 'hello') {
        if (decoded.requestId !== HELLO_REQUEST_ID) return finish(null)
        stage = 'control'
        socket.write(
          encodeRequest(CONTROL_REQUEST_ID, CONTROL_ORDINAL, slot, args)
        )
        return
      }
      if (decoded.requestId !== CONTROL_REQUEST_ID) return finish(null)
      finish(decoded.retBlob)
    })
  })
}

export async function listBridgeFriends(
  appId: string
): Promise<BridgeListFriendsResult> {
  const conn = getBridgeHelperConnection(appId)
  if (!conn) {
    logInfo(`bridge invite [${appId}]: list result=no-helper`, LogPrefix.Steam)
    return { ok: false, reason: 'no-helper' }
  }
  const payload = await controlRoundTrip(
    conn.port,
    conn.secret,
    CONTROL_SLOT.listFriends,
    Buffer.alloc(0)
  )
  if (!payload) {
    logInfo(`bridge invite [${appId}]: list result=error`, LogPrefix.Steam)
    return { ok: false, reason: 'error' }
  }
  try {
    const friends: BridgeFriend[] = decodeFriendList(payload)
    logInfo(
      `bridge invite [${appId}]: list n=${friends.length}`,
      LogPrefix.Steam
    )
    return { ok: true, friends }
  } catch {
    logInfo(`bridge invite [${appId}]: list result=error`, LogPrefix.Steam)
    return { ok: false, reason: 'error' }
  }
}

const RESULT_WORDS: Record<number, BridgeInviteResult> = {
  [INVITE_RESULT.ok]: 'sent',
  [INVITE_RESULT.macRefused]: 'steam-refused',
  [INVITE_RESULT.noPending]: 'no-pending',
  [INVITE_RESULT.expired]: 'expired',
  [INVITE_RESULT.badOrdinal]: 'bad-ordinal'
}

export async function sendBridgeInvite(
  appId: string,
  ordinal: number
): Promise<BridgeInviteResult> {
  const log = (word: BridgeInviteResult) => {
    logInfo(`bridge invite [${appId}]: result=${word}`, LogPrefix.Steam)
    return word
  }
  if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal > 0xffffffff) {
    return log('bad-ordinal')
  }
  const conn = getBridgeHelperConnection(appId)
  if (!conn) return log('no-helper')
  const payload = await controlRoundTrip(
    conn.port,
    conn.secret,
    CONTROL_SLOT.inviteFriend,
    encodeInviteFriendArgs(ordinal)
  )
  if (!payload || payload.length !== 4) return log('error')
  return log(RESULT_WORDS[payload.readInt32LE(0)] ?? 'error')
}
