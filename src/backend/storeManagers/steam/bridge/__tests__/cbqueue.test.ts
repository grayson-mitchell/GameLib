import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  createFakeHomeProfile,
  type FakeHomeProfile
} from 'backend/testUtils/fakeHomeProfile'

import { CALLBACK_LAYOUTS } from '../../../../../../meta/msvcCallbackLayout'

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..', '..')
const HEADER_DIR = join(REPO_ROOT, 'native', 'steam-bridge', 'helper')
const FIXTURE = join(__dirname, 'fixtures', 'cbqueue_harness.c')

const CASES = [
  'offer-valid',
  'pop-encode-layout',
  'pop-zeroes-slot',
  'pop-empty',
  'reject-id-163',
  'reject-id-101',
  'reject-size-2571',
  'reject-size-2573',
  'reject-size-0',
  'reject-size-neg',
  'reject-null',
  'overflow-count',
  'drop-oldest',
  'evicted-slot-zero',
  'small-cap-keeps-entry',
  'tiny-cap',
  'usr-repack',
  'reject-1101-mac-size',
  'offer-1101-wire',
  'pop-1101-layout',
  'obs-first-forwards',
  'obs-later-caches-only',
  'obs-other-app',
  'obs-bad-size',
  'req-cached',
  'req-already-queued',
  'req-need-fetch',
  'obs-after-pending',
  'relay_row_sizes',
  'repack_all_rows',
  'offer_wrong_size_drops',
  'repack_1221_positions',
  'repack_513_positions',
  'offer_513_broadcast',
  'ring_32_slots',
  'ring_33rd_evicts',
  'cr_track_complete',
  'cr_pop_layout',
  'cr_pop_zeroes',
  'cr_pop_empty',
  'cr_untracked_ignored',
  'cr_wrong_size_ignored',
  'cr_table_bounded',
  'cr_complete_510',
  'cr_failed_flag',
  'cr_failed_layout',
  'cr_reject_unknown_id',
  'cr_ring_bounded',
  'mms_ring_evicts_oldest',
  'mms_pop_layout',
  'mms_pop_zeroes',
  'mms_pop_small_cap_keeps',
  'mms_pop_empty',
  'mms_ring_refuses_long_strings',
  'mms_ring_accepts_255',
  'mms_strs_layout',
  'mms_ring_refuses_bad_kind',
  'mms_gsi_repack',
  'mms_gsi_padding_zero',
  'mms_gsi_rows',
  'unlisted_once',
  'unlisted_cap',
  'offsets'
]

describe('gamelib_cbqueue.h ring (P55-5, DRAIN queue)', () => {
  let profile: FakeHomeProfile
  let skipReason: string | null = null
  let output = ''

  beforeAll(() => {
    profile = createFakeHomeProfile({ prefix: 'gamelib-cbqueue-' })
    const bin = join(profile.root, 'cbqueue_harness')
    try {
      execFileSync(
        'clang',
        ['-std=c11', '-Wall', '-Werror', '-I', HEADER_DIR, '-o', bin, FIXTURE],
        { cwd: REPO_ROOT, env: profile.childEnv(), stdio: 'pipe' }
      )
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        skipReason = 'clang not found on PATH'
        return
      }
      throw e
    }
    output = execFileSync(bin, [], {
      cwd: REPO_ROOT,
      env: profile.childEnv(),
      encoding: 'utf8'
    })
  }, 30000)

  afterAll(() => {
    profile?.dispose()
  })

  test.each(CASES)('case %s passes', (name) => {
    if (skipReason) {
      console.warn(`skipped: ${skipReason}`)
      return
    }
    expect(output).toContain(`PASS ${name}\n`)
    expect(output).not.toContain('FAIL')
  })
})

describe('header defines cross-pin to CALLBACK_LAYOUTS (58-02)', () => {
  const header = readFileSync(join(HEADER_DIR, 'gamelib_cbqueue.h'), 'utf8')
  const define = (name: string) => {
    const m = new RegExp(`#define ${name}\\s+(\\d+)`).exec(header)
    if (!m) throw new Error(`define ${name} missing`)
    return Number(m[1])
  }
  const PINS: [string, keyof typeof CALLBACK_LAYOUTS][] = [
    ['LOBBYINVITE', 'LobbyInvite_t'],
    ['LOBBYENTER', 'LobbyEnter_t'],
    ['LOBBYDATAUPDATE', 'LobbyDataUpdate_t'],
    ['LOBBYCHATUPDATE', 'LobbyChatUpdate_t'],
    ['LOBBYCHATMSG', 'LobbyChatMsg_t'],
    ['LOBBYMATCHLIST', 'LobbyMatchList_t'],
    ['LOBBYKICKED', 'LobbyKicked_t'],
    ['LOBBYCREATED', 'LobbyCreated_t'],
    ['GAMELOBBYJOINREQUESTED', 'GameLobbyJoinRequested_t'],
    ['P2PSESSIONREQUEST', 'P2PSessionRequest_t'],
    ['P2PSESSIONCONNECTFAIL', 'P2PSessionConnectFail_t'],
    ['NETCONNSTATUS', 'SteamNetConnectionStatusChangedCallback_t'],
    ['NETAUTHSTATUS', 'SteamNetAuthenticationStatus_t'],
    ['MSGSSESSIONREQUEST', 'SteamNetworkingMessagesSessionRequest_t'],
    ['MSGSSESSIONFAILED', 'SteamNetworkingMessagesSessionFailed_t'],
    ['RELAYNETSTATUS', 'SteamRelayNetworkStatus_t']
  ]

  test.each(PINS)('GL_CBQ_%s sizes equal the measured layout', (tag, name) => {
    expect(define(`GL_CBQ_${tag}_MAC_SIZE`)).toBe(
      CALLBACK_LAYOUTS[name].mac.size
    )
    expect(define(`GL_CBQ_${tag}_WIN_SIZE`)).toBe(
      CALLBACK_LAYOUTS[name].x64.size
    )
  })

  test('gl_cbq_map_513 equals the triples derived from CALLBACK_LAYOUTS.LobbyCreated_t', () => {
    const l = CALLBACK_LAYOUTS.LobbyCreated_t
    const m = /gl_cbq_map_513\[\] = \{(\{[^;]*\})\};/.exec(header)
    if (!m) throw new Error('gl_cbq_map_513 missing')
    const expected = `{{${l.mac.fields.m_eResult}, ${l.x64.fields.m_eResult}, 4}, {${l.mac.fields.m_ulSteamIDLobby}, ${l.x64.fields.m_ulSteamIDLobby}, 8}}`
    expect(`{${m[1]}}`).toBe(expected)
    expect(expected).toBe('{{0, 0, 4}, {4, 8, 8}}')
  })

  test('gl_mms_gsi_map rows equal CALLBACK_LAYOUTS.gameserveritem_t offsets (mac to x64) and size (58-20)', () => {
    const l = CALLBACK_LAYOUTS.gameserveritem_t
    const cr = readFileSync(join(HEADER_DIR, 'gamelib_callresult.h'), 'utf8')
    expect(/#define GL_MMS_GSI_SIZE\s+(\d+)/.exec(cr)?.[1]).toBe(
      String(l.x64.size)
    )
    expect(l.mac.size).toBe(l.x64.size)
    const block = /gl_mms_gsi_map\[\] = \{([\s\S]*?)\n\};/.exec(cr)
    if (!block) throw new Error('gl_mms_gsi_map missing')
    const rows = [...block[1].matchAll(/\{(\d+), (\d+), (\d+)\}/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
      Number(m[3])
    ])
    const names = Object.keys(l.x64.fields)
    expect(rows.map((r) => [r[0], r[1]])).toEqual(
      names.map((n) => [
        (l.mac.fields as Record<string, number>)[n],
        (l.x64.fields as Record<string, number>)[n]
      ])
    )
    // Rows are contiguous-or-padded: no row overlaps the next, none passes the end.
    for (let i = 0; i < rows.length; i++) {
      const end = rows[i][1] + rows[i][2]
      expect(end).toBeLessThanOrEqual(
        i + 1 < rows.length ? rows[i + 1][1] : l.x64.size
      )
    }
  })

  test('gl_cbq_map_333 is one whole-struct copy of the measured size, id 333', () => {
    const l = CALLBACK_LAYOUTS.GameLobbyJoinRequested_t
    expect(l.id).toBe(333)
    expect(l.mac).toEqual(l.x64)
    expect(define('GL_CBQ_ID_GAME_LOBBY_JOIN_REQUESTED')).toBe(333)
    const m =
      /gl_cbq_map_333\[\] = \{\{0, 0, GL_CBQ_GAMELOBBYJOINREQUESTED_MAC_SIZE\}\};/.exec(
        header
      )
    expect(m).not.toBeNull()
  })

  test('1221 and 504 classifier offsets equal the measured Mac layout', () => {
    const c = CALLBACK_LAYOUTS.SteamNetConnectionStatusChangedCallback_t.mac
    const info = CALLBACK_LAYOUTS.SteamNetConnectionInfo_t.mac
    expect(define('GL_CBQ_NETCONNSTATUS_MAC_OFF_ESTATE')).toBe(
      c.fields.m_info + info.fields.m_eState
    )
    expect(define('GL_CBQ_NETCONNSTATUS_MAC_OFF_NFLAGS')).toBe(
      c.fields.m_info + info.fields.m_nFlags
    )
    expect(define('GL_CBQ_NETCONNSTATUS_MAC_OFF_OLDSTATE')).toBe(
      c.fields.m_eOldState
    )
    expect(define('GL_CBQ_LOBBYENTER_MAC_OFF_RESPONSE')).toBe(
      CALLBACK_LAYOUTS.LobbyEnter_t.mac.fields.m_EChatRoomEnterResponse
    )
  })
})
