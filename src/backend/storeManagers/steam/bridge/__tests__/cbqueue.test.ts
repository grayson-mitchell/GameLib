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
