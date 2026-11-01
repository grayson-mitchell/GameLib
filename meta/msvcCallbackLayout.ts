/**
 * MSVC C++ ABI layout of the Steamworks `CCallbackBase` hierarchy.
 *
 * These values are MEASURED, never assumed: they come from the pinned zig
 * 0.16.0 clang MS-ABI dumper run against the SDK-faithful fixture
 * meta/__tests__/fixtures/msvc_ccallbackbase.cpp, committed raw as
 * meta/__tests__/fixtures/msvc_ccallbackbase.layout.txt. They are consumed by
 * meta/gen_vtables.ts in 55-04 as GL_CB_* defines and must change only
 * together with a re-measured dump (meta/__tests__/msvcCallbackBaseLayout.test.ts
 * checks them against the dump and, on darwin, against a live re-measurement).
 *
 * MSVC reverses overloaded virtuals, so the three-arg Run (declared second in
 * the SDK) takes slot 0 and the one-arg Run(void*) takes slot 1.
 */

/** vtable slot of CCallbackBase::Run(void*). */
// ts-prune-ignore-next -- measured layout data consumed by meta/gen_vtables.ts / meta/__tests__ (plan 58-02/58-10); ts-prune cannot see that use
export const MSVC_CCALLBACKBASE_VSLOT_RUN_1ARG = 1
/** vtable slot of CCallbackBase::Run(void*, bool, SteamAPICall_t). */
// ts-prune-ignore-next -- measured layout data consumed by meta/gen_vtables.ts / meta/__tests__ (plan 58-02/58-10); ts-prune cannot see that use
export const MSVC_CCALLBACKBASE_VSLOT_RUN_3ARG = 0
/** vtable slot of CCallbackBase::GetCallbackSizeBytes(). */
// ts-prune-ignore-next -- measured layout data consumed by meta/gen_vtables.ts / meta/__tests__ (plan 58-02/58-10); ts-prune cannot see that use
export const MSVC_CCALLBACKBASE_VSLOT_GET_SIZE = 2

/** Byte offsets of m_nCallbackFlags / m_iCallback per target arch. */
// ts-prune-ignore-next -- measured layout data consumed by meta/gen_vtables.ts / meta/__tests__ (plan 58-02/58-10); ts-prune cannot see that use
export const MSVC_CCALLBACKBASE_OFFSETS = {
  x64: { flags: 8, iCallback: 12 },
  x86: { flags: 4, iCallback: 8 }
} as const

// ts-prune-ignore-next -- measured layout data consumed by meta/gen_vtables.ts / meta/__tests__ (plan 58-02/58-10); ts-prune cannot see that use
export const STEAM_CALLBACK_FLAG_REGISTERED = 0x01
// ts-prune-ignore-next -- measured layout data consumed by meta/gen_vtables.ts / meta/__tests__ (plan 58-02/58-10); ts-prune cannot see that use
export const STEAM_CALLBACK_FLAG_GAMESERVER = 0x02

interface MsvcCallbackLayout {
  vslotRun1Arg: number
  vslotRun3Arg: number
  vslotGetSize: number
  flagsOffset: number
  iCallbackOffset: number
}

type MsvcTriple = 'x86_64-pc-windows-msvc' | 'i686-pc-windows-msvc'

const TRIPLES: readonly MsvcTriple[] = [
  'x86_64-pc-windows-msvc',
  'i686-pc-windows-msvc'
]

function vtableIndex(block: string, signature: string, triple: string) {
  for (const line of block.split('\n')) {
    const m = /^\s*(\d+) \| (.*?)\s*$/.exec(line)
    if (m && m[2] === signature) return Number(m[1])
  }
  throw new Error(
    `${triple}: CCallbackBase VFTable has no entry "${signature}"`
  )
}

function parseSection(section: string, triple: string): MsvcCallbackLayout {
  const vt =
    /VFTable indices for 'CCallbackBase'[^\n]*\n((?:\s*\d+ \|[^\n]*\n?)+)/.exec(
      section
    )
  if (!vt) {
    throw new Error(`${triple}: missing VFTable block for 'CCallbackBase'`)
  }
  const block = vt[1]
  const rec =
    /Type: class CCallbackBase\n[\s\S]*?FieldOffsets: \[(\d+), (\d+)\]/.exec(
      section
    )
  if (!rec) {
    throw new Error(
      `${triple}: missing record layout FieldOffsets for CCallbackBase`
    )
  }
  return {
    vslotRun1Arg: vtableIndex(block, 'void CCallbackBase::Run(void *)', triple),
    vslotRun3Arg: vtableIndex(
      block,
      'void CCallbackBase::Run(void *, bool, SteamAPICall_t)',
      triple
    ),
    vslotGetSize: vtableIndex(
      block,
      'int CCallbackBase::GetCallbackSizeBytes()',
      triple
    ),
    flagsOffset: Number(rec[1]) / 8,
    iCallbackOffset: Number(rec[2]) / 8
  }
}

/**
 * Parses dumper output sections introduced by `=== triple: <triple> ...`
 * header lines. Throws (never defaults) when a triple or block is missing.
 */
// ts-prune-ignore-next -- measured layout data consumed by meta/gen_vtables.ts / meta/__tests__ (plan 58-02/58-10); ts-prune cannot see that use
export function parseMsvcCallbackLayoutDump(
  text: string
): Record<MsvcTriple, MsvcCallbackLayout> {
  const sections = new Map<string, string>()
  const re = /^=== triple: (\S+)[^\n]*\n/gm
  const heads: { triple: string; start: number; bodyStart: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    heads.push({
      triple: m[1],
      start: m.index,
      bodyStart: m.index + m[0].length
    })
  }
  heads.forEach((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].start : text.length
    if (!sections.has(h.triple)) {
      sections.set(h.triple, text.slice(h.bodyStart, end))
    }
  })
  const out = {} as Record<MsvcTriple, MsvcCallbackLayout>
  for (const triple of TRIPLES) {
    const section = sections.get(triple)
    if (section === undefined) {
      throw new Error(`${triple}: no section in dump (missing VFTable data)`)
    }
    out[triple] = parseSection(section, triple)
  }
  return out
}

/**
 * Byte layout of the Steamworks `UserStatsReceived_t` (k_iCallback 1101).
 *
 * MEASURED, never assumed, in the same way as the CCallbackBase values above:
 * they come from the pinned zig 0.16.0 clang record-layout dumper run against
 * the SDK-faithful fixture meta/__tests__/fixtures/steam_callback_structs.cpp
 * (Windows under pack(8), Mac under pack(4)), committed raw as
 * meta/__tests__/fixtures/steam_callback_structs.layout.txt. Both Windows
 * arches agree (24 bytes, 0/8/16), so the helper repacks once into that wire
 * form; the Mac struct is 20 bytes (0/8/12) because pack(4) drops the padding
 * before the CSteamID. native/steam-bridge/helper/gamelib_cbqueue.h must equal
 * these (cross-pinned in msvcCallbackBaseLayout.test.ts).
 */
interface UserStatsReceivedLayout {
  /** byte offset of uint64 m_nGameID */
  gameID: number
  /** byte offset of EResult m_eResult */
  eResult: number
  /** byte offset of CSteamID m_steamIDUser */
  steamID: number
  /** sizeof(UserStatsReceived_t) in bytes */
  size: number
}

// ts-prune-ignore-next -- measured layout data consumed by meta/gen_vtables.ts / meta/__tests__ (plan 58-02/58-10); ts-prune cannot see that use
export const USER_STATS_RECEIVED_LAYOUT = {
  x64: { gameID: 0, eResult: 8, steamID: 16, size: 24 },
  x86: { gameID: 0, eResult: 8, steamID: 16, size: 24 },
  mac: { gameID: 0, eResult: 8, steamID: 12, size: 20 }
} as const

// Compile-time shape check (kept off the export: ts-prune reads `satisfies` / `Record` there as export names).
USER_STATS_RECEIVED_LAYOUT satisfies Record<string, UserStatsReceivedLayout>

// ts-prune-ignore-next -- measured layout data consumed by meta/gen_vtables.ts / meta/__tests__ (plan 58-02/58-10); ts-prune cannot see that use
export type UserStatsTriple =
  | 'x86_64-pc-windows-msvc'
  | 'i686-pc-windows-msvc'
  | 'arm64-apple-macosx'

const USER_STATS_TRIPLES: readonly UserStatsTriple[] = [
  'x86_64-pc-windows-msvc',
  'i686-pc-windows-msvc',
  'arm64-apple-macosx'
]

function parseUserStatsSection(
  section: string,
  triple: string
): UserStatsReceivedLayout {
  const rec =
    /Type: struct UserStatsReceived_t\n[\s\S]*?Size:(\d+)\n[\s\S]*?FieldOffsets: \[(\d+), (\d+), (\d+)\]/.exec(
      section
    )
  if (!rec) {
    throw new Error(
      `${triple}: missing record layout (Size/FieldOffsets) for UserStatsReceived_t`
    )
  }
  return {
    gameID: Number(rec[2]) / 8,
    eResult: Number(rec[3]) / 8,
    steamID: Number(rec[4]) / 8,
    size: Number(rec[1]) / 8
  }
}

/**
 * Parses dumper output sections introduced by `=== triple: <triple> ...`
 * header lines. Throws (never defaults) when a triple or the record is missing.
 */
// ts-prune-ignore-next -- measured layout data consumed by meta/gen_vtables.ts / meta/__tests__ (plan 58-02/58-10); ts-prune cannot see that use
export function parseUserStatsReceivedLayoutDump(
  text: string
): Record<UserStatsTriple, UserStatsReceivedLayout> {
  const sections = new Map<string, string>()
  const re = /^=== triple: (\S+)[^\n]*\n/gm
  const heads: { triple: string; start: number; bodyStart: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    heads.push({
      triple: m[1],
      start: m.index,
      bodyStart: m.index + m[0].length
    })
  }
  heads.forEach((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].start : text.length
    if (!sections.has(h.triple)) {
      sections.set(h.triple, text.slice(h.bodyStart, end))
    }
  })
  const out = {} as Record<UserStatsTriple, UserStatsReceivedLayout>
  for (const triple of USER_STATS_TRIPLES) {
    const section = sections.get(triple)
    if (section === undefined) {
      throw new Error(`${triple}: no section in dump (missing record layout)`)
    }
    out[triple] = parseUserStatsSection(section, triple)
  }
  return out
}

/**
 * Measured layouts of every callback, call-result and networking struct the
 * multiplayer wiring (phase 58) relays or copies.
 *
 * MEASURED, never assumed: every size and offset below is read from the raw
 * zig 0.16.0 clang record-layout dump committed as
 * meta/__tests__/fixtures/steam_callback_structs.layout.txt, produced from the
 * GameLib-authored fixture meta/__tests__/fixtures/steam_callback_structs.cpp
 * (SDK 165 field lists and pack regions). They change only together with a
 * re-measured dump; msvcCallbackBaseLayout.test.ts pins them to the committed
 * dump and, on darwin, to a live re-measurement.
 *
 * Keys are struct names; `fields` maps each direct field to its byte offset in
 * declaration order (parseCallbackLayoutsDump relies on that order). `id` is
 * the callback's k_iCallback, or null for a plain struct.
 */
// ts-prune-ignore-next -- measured layout data consumed by meta/gen_vtables.ts / meta/__tests__ (plan 58-02/58-10); ts-prune cannot see that use
export type CallbackLayoutArch = 'x64' | 'x86' | 'mac'

interface StructLayout {
  /** sizeof the struct in bytes */
  size: number
  /** byte offset of every direct field, by name, in declaration order */
  fields: Readonly<Record<string, number>>
}

// ts-prune-ignore-next -- measured layout data consumed by meta/gen_vtables.ts / meta/__tests__ (plan 58-02/58-10); ts-prune cannot see that use
export interface CallbackLayoutEntry {
  id: number | null
  x64: StructLayout
  x86: StructLayout
  mac: StructLayout
}

export const CALLBACK_LAYOUTS = {
  LobbyInvite_t: {
    id: 503,
    x64: {
      size: 24,
      fields: { m_ulSteamIDUser: 0, m_ulSteamIDLobby: 8, m_ulGameID: 16 }
    },
    x86: {
      size: 24,
      fields: { m_ulSteamIDUser: 0, m_ulSteamIDLobby: 8, m_ulGameID: 16 }
    },
    mac: {
      size: 24,
      fields: { m_ulSteamIDUser: 0, m_ulSteamIDLobby: 8, m_ulGameID: 16 }
    }
  },
  LobbyEnter_t: {
    id: 504,
    x64: {
      size: 24,
      fields: {
        m_ulSteamIDLobby: 0,
        m_rgfChatPermissions: 8,
        m_bLocked: 12,
        m_EChatRoomEnterResponse: 16
      }
    },
    x86: {
      size: 24,
      fields: {
        m_ulSteamIDLobby: 0,
        m_rgfChatPermissions: 8,
        m_bLocked: 12,
        m_EChatRoomEnterResponse: 16
      }
    },
    mac: {
      size: 20,
      fields: {
        m_ulSteamIDLobby: 0,
        m_rgfChatPermissions: 8,
        m_bLocked: 12,
        m_EChatRoomEnterResponse: 16
      }
    }
  },
  LobbyDataUpdate_t: {
    id: 505,
    x64: {
      size: 24,
      fields: { m_ulSteamIDLobby: 0, m_ulSteamIDMember: 8, m_bSuccess: 16 }
    },
    x86: {
      size: 24,
      fields: { m_ulSteamIDLobby: 0, m_ulSteamIDMember: 8, m_bSuccess: 16 }
    },
    mac: {
      size: 20,
      fields: { m_ulSteamIDLobby: 0, m_ulSteamIDMember: 8, m_bSuccess: 16 }
    }
  },
  LobbyChatUpdate_t: {
    id: 506,
    x64: {
      size: 32,
      fields: {
        m_ulSteamIDLobby: 0,
        m_ulSteamIDUserChanged: 8,
        m_ulSteamIDMakingChange: 16,
        m_rgfChatMemberStateChange: 24
      }
    },
    x86: {
      size: 32,
      fields: {
        m_ulSteamIDLobby: 0,
        m_ulSteamIDUserChanged: 8,
        m_ulSteamIDMakingChange: 16,
        m_rgfChatMemberStateChange: 24
      }
    },
    mac: {
      size: 28,
      fields: {
        m_ulSteamIDLobby: 0,
        m_ulSteamIDUserChanged: 8,
        m_ulSteamIDMakingChange: 16,
        m_rgfChatMemberStateChange: 24
      }
    }
  },
  LobbyChatMsg_t: {
    id: 507,
    x64: {
      size: 24,
      fields: {
        m_ulSteamIDLobby: 0,
        m_ulSteamIDUser: 8,
        m_eChatEntryType: 16,
        m_iChatID: 20
      }
    },
    x86: {
      size: 24,
      fields: {
        m_ulSteamIDLobby: 0,
        m_ulSteamIDUser: 8,
        m_eChatEntryType: 16,
        m_iChatID: 20
      }
    },
    mac: {
      size: 24,
      fields: {
        m_ulSteamIDLobby: 0,
        m_ulSteamIDUser: 8,
        m_eChatEntryType: 16,
        m_iChatID: 20
      }
    }
  },
  LobbyMatchList_t: {
    id: 510,
    x64: { size: 4, fields: { m_nLobbiesMatching: 0 } },
    x86: { size: 4, fields: { m_nLobbiesMatching: 0 } },
    mac: { size: 4, fields: { m_nLobbiesMatching: 0 } }
  },
  LobbyKicked_t: {
    id: 512,
    x64: {
      size: 24,
      fields: {
        m_ulSteamIDLobby: 0,
        m_ulSteamIDAdmin: 8,
        m_bKickedDueToDisconnect: 16
      }
    },
    x86: {
      size: 24,
      fields: {
        m_ulSteamIDLobby: 0,
        m_ulSteamIDAdmin: 8,
        m_bKickedDueToDisconnect: 16
      }
    },
    mac: {
      size: 20,
      fields: {
        m_ulSteamIDLobby: 0,
        m_ulSteamIDAdmin: 8,
        m_bKickedDueToDisconnect: 16
      }
    }
  },
  LobbyCreated_t: {
    id: 513,
    x64: { size: 16, fields: { m_eResult: 0, m_ulSteamIDLobby: 8 } },
    x86: { size: 16, fields: { m_eResult: 0, m_ulSteamIDLobby: 8 } },
    mac: { size: 12, fields: { m_eResult: 0, m_ulSteamIDLobby: 4 } }
  },
  P2PSessionRequest_t: {
    id: 1202,
    x64: { size: 8, fields: { m_steamIDRemote: 0 } },
    x86: { size: 8, fields: { m_steamIDRemote: 0 } },
    mac: { size: 8, fields: { m_steamIDRemote: 0 } }
  },
  P2PSessionConnectFail_t: {
    id: 1203,
    x64: { size: 9, fields: { m_steamIDRemote: 0, m_eP2PSessionError: 8 } },
    x86: { size: 9, fields: { m_steamIDRemote: 0, m_eP2PSessionError: 8 } },
    mac: { size: 9, fields: { m_steamIDRemote: 0, m_eP2PSessionError: 8 } }
  },
  SteamNetConnectionStatusChangedCallback_t: {
    id: 1221,
    x64: { size: 712, fields: { m_hConn: 0, m_info: 8, m_eOldState: 704 } },
    x86: { size: 712, fields: { m_hConn: 0, m_info: 8, m_eOldState: 704 } },
    mac: { size: 704, fields: { m_hConn: 0, m_info: 4, m_eOldState: 700 } }
  },
  SteamNetAuthenticationStatus_t: {
    id: 1222,
    x64: { size: 260, fields: { m_eAvail: 0, m_debugMsg: 4 } },
    x86: { size: 260, fields: { m_eAvail: 0, m_debugMsg: 4 } },
    mac: { size: 260, fields: { m_eAvail: 0, m_debugMsg: 4 } }
  },
  SteamNetworkingMessagesSessionRequest_t: {
    id: 1251,
    x64: { size: 136, fields: { m_identityRemote: 0 } },
    x86: { size: 136, fields: { m_identityRemote: 0 } },
    mac: { size: 136, fields: { m_identityRemote: 0 } }
  },
  SteamNetworkingMessagesSessionFailed_t: {
    id: 1252,
    x64: { size: 696, fields: { m_info: 0 } },
    x86: { size: 696, fields: { m_info: 0 } },
    mac: { size: 696, fields: { m_info: 0 } }
  },
  SteamRelayNetworkStatus_t: {
    id: 1281,
    x64: {
      size: 272,
      fields: {
        m_eAvail: 0,
        m_bPingMeasurementInProgress: 4,
        m_eAvailNetworkConfig: 8,
        m_eAvailAnyRelay: 12,
        m_debugMsg: 16
      }
    },
    x86: {
      size: 272,
      fields: {
        m_eAvail: 0,
        m_bPingMeasurementInProgress: 4,
        m_eAvailNetworkConfig: 8,
        m_eAvailAnyRelay: 12,
        m_debugMsg: 16
      }
    },
    mac: {
      size: 272,
      fields: {
        m_eAvail: 0,
        m_bPingMeasurementInProgress: 4,
        m_eAvailNetworkConfig: 8,
        m_eAvailAnyRelay: 12,
        m_debugMsg: 16
      }
    }
  },
  SteamAPICallCompleted_t: {
    id: 703,
    x64: {
      size: 16,
      fields: { m_hAsyncCall: 0, m_iCallback: 8, m_cubParam: 12 }
    },
    x86: {
      size: 16,
      fields: { m_hAsyncCall: 0, m_iCallback: 8, m_cubParam: 12 }
    },
    mac: {
      size: 16,
      fields: { m_hAsyncCall: 0, m_iCallback: 8, m_cubParam: 12 }
    }
  },
  GameLobbyJoinRequested_t: {
    id: 333,
    x64: { size: 16, fields: { m_steamIDLobby: 0, m_steamIDFriend: 8 } },
    x86: { size: 16, fields: { m_steamIDLobby: 0, m_steamIDFriend: 8 } },
    mac: { size: 16, fields: { m_steamIDLobby: 0, m_steamIDFriend: 8 } }
  },
  GameRichPresenceJoinRequested_t: {
    id: 337,
    x64: { size: 264, fields: { m_steamIDFriend: 0, m_rgchConnect: 8 } },
    x86: { size: 264, fields: { m_steamIDFriend: 0, m_rgchConnect: 8 } },
    mac: { size: 264, fields: { m_steamIDFriend: 0, m_rgchConnect: 8 } }
  },
  SteamNetworkingIdentity: {
    id: null,
    x64: { size: 136, fields: { m_eType: 0, m_cbSize: 4, data: 8 } },
    x86: { size: 136, fields: { m_eType: 0, m_cbSize: 4, data: 8 } },
    mac: { size: 136, fields: { m_eType: 0, m_cbSize: 4, data: 8 } }
  },
  SteamNetworkingIPAddr: {
    id: null,
    x64: { size: 18, fields: { data: 0, m_port: 16 } },
    x86: { size: 18, fields: { data: 0, m_port: 16 } },
    mac: { size: 18, fields: { data: 0, m_port: 16 } }
  },
  SteamNetConnectionInfo_t: {
    id: null,
    x64: {
      size: 696,
      fields: {
        m_identityRemote: 0,
        m_nUserData: 136,
        m_hListenSocket: 144,
        m_addrRemote: 148,
        m__pad1: 166,
        m_idPOPRemote: 168,
        m_idPOPRelay: 172,
        m_eState: 176,
        m_eEndReason: 180,
        m_szEndDebug: 184,
        m_szConnectionDescription: 312,
        m_nFlags: 440,
        reserved: 444
      }
    },
    x86: {
      size: 696,
      fields: {
        m_identityRemote: 0,
        m_nUserData: 136,
        m_hListenSocket: 144,
        m_addrRemote: 148,
        m__pad1: 166,
        m_idPOPRemote: 168,
        m_idPOPRelay: 172,
        m_eState: 176,
        m_eEndReason: 180,
        m_szEndDebug: 184,
        m_szConnectionDescription: 312,
        m_nFlags: 440,
        reserved: 444
      }
    },
    mac: {
      size: 696,
      fields: {
        m_identityRemote: 0,
        m_nUserData: 136,
        m_hListenSocket: 144,
        m_addrRemote: 148,
        m__pad1: 166,
        m_idPOPRemote: 168,
        m_idPOPRelay: 172,
        m_eState: 176,
        m_eEndReason: 180,
        m_szEndDebug: 184,
        m_szConnectionDescription: 312,
        m_nFlags: 440,
        reserved: 444
      }
    }
  },
  SteamNetConnectionRealTimeStatus_t: {
    id: null,
    x64: {
      size: 120,
      fields: {
        m_eState: 0,
        m_nPing: 4,
        m_flConnectionQualityLocal: 8,
        m_flConnectionQualityRemote: 12,
        m_flOutPacketsPerSec: 16,
        m_flOutBytesPerSec: 20,
        m_flInPacketsPerSec: 24,
        m_flInBytesPerSec: 28,
        m_nSendRateBytesPerSecond: 32,
        m_cbPendingUnreliable: 36,
        m_cbPendingReliable: 40,
        m_cbSentUnackedReliable: 44,
        m_usecQueueTime: 48,
        m_usecMaxJitter: 56,
        reserved: 60
      }
    },
    x86: {
      size: 120,
      fields: {
        m_eState: 0,
        m_nPing: 4,
        m_flConnectionQualityLocal: 8,
        m_flConnectionQualityRemote: 12,
        m_flOutPacketsPerSec: 16,
        m_flOutBytesPerSec: 20,
        m_flInPacketsPerSec: 24,
        m_flInBytesPerSec: 28,
        m_nSendRateBytesPerSecond: 32,
        m_cbPendingUnreliable: 36,
        m_cbPendingReliable: 40,
        m_cbSentUnackedReliable: 44,
        m_usecQueueTime: 48,
        m_usecMaxJitter: 56,
        reserved: 60
      }
    },
    mac: {
      size: 120,
      fields: {
        m_eState: 0,
        m_nPing: 4,
        m_flConnectionQualityLocal: 8,
        m_flConnectionQualityRemote: 12,
        m_flOutPacketsPerSec: 16,
        m_flOutBytesPerSec: 20,
        m_flInPacketsPerSec: 24,
        m_flInBytesPerSec: 28,
        m_nSendRateBytesPerSecond: 32,
        m_cbPendingUnreliable: 36,
        m_cbPendingReliable: 40,
        m_cbSentUnackedReliable: 44,
        m_usecQueueTime: 48,
        m_usecMaxJitter: 56,
        reserved: 60
      }
    }
  },
  P2PSessionState_t: {
    id: null,
    x64: {
      size: 20,
      fields: {
        m_bConnectionActive: 0,
        m_bConnecting: 1,
        m_eP2PSessionError: 2,
        m_bUsingRelay: 3,
        m_nBytesQueuedForSend: 4,
        m_nPacketsQueuedForSend: 8,
        m_nRemoteIP: 12,
        m_nRemotePort: 16
      }
    },
    x86: {
      size: 20,
      fields: {
        m_bConnectionActive: 0,
        m_bConnecting: 1,
        m_eP2PSessionError: 2,
        m_bUsingRelay: 3,
        m_nBytesQueuedForSend: 4,
        m_nPacketsQueuedForSend: 8,
        m_nRemoteIP: 12,
        m_nRemotePort: 16
      }
    },
    mac: {
      size: 20,
      fields: {
        m_bConnectionActive: 0,
        m_bConnecting: 1,
        m_eP2PSessionError: 2,
        m_bUsingRelay: 3,
        m_nBytesQueuedForSend: 4,
        m_nPacketsQueuedForSend: 8,
        m_nRemoteIP: 12,
        m_nRemotePort: 16
      }
    }
  },
  SteamNetworkingMessage_t: {
    id: null,
    x64: {
      size: 216,
      fields: {
        m_pData: 0,
        m_cbSize: 8,
        m_conn: 12,
        m_identityPeer: 16,
        m_nConnUserData: 152,
        m_usecTimeReceived: 160,
        m_nMessageNumber: 168,
        m_pfnFreeData: 176,
        m_pfnRelease: 184,
        m_nChannel: 192,
        m_nFlags: 196,
        m_nUserData: 200,
        m_idxLane: 208,
        _pad1__: 210
      }
    },
    x86: {
      size: 208,
      fields: {
        m_pData: 0,
        m_cbSize: 4,
        m_conn: 8,
        m_identityPeer: 12,
        m_nConnUserData: 152,
        m_usecTimeReceived: 160,
        m_nMessageNumber: 168,
        m_pfnFreeData: 176,
        m_pfnRelease: 180,
        m_nChannel: 184,
        m_nFlags: 188,
        m_nUserData: 192,
        m_idxLane: 200,
        _pad1__: 202
      }
    },
    mac: {
      size: 216,
      fields: {
        m_pData: 0,
        m_cbSize: 8,
        m_conn: 12,
        m_identityPeer: 16,
        m_nConnUserData: 152,
        m_usecTimeReceived: 160,
        m_nMessageNumber: 168,
        m_pfnFreeData: 176,
        m_pfnRelease: 184,
        m_nChannel: 192,
        m_nFlags: 196,
        m_nUserData: 200,
        m_idxLane: 208,
        _pad1__: 210
      }
    }
  },
  CallbackMsg_t: {
    id: null,
    x64: {
      size: 24,
      fields: { m_hSteamUser: 0, m_iCallback: 4, m_pubParam: 8, m_cubParam: 16 }
    },
    x86: {
      size: 16,
      fields: { m_hSteamUser: 0, m_iCallback: 4, m_pubParam: 8, m_cubParam: 12 }
    },
    mac: {
      size: 20,
      fields: { m_hSteamUser: 0, m_iCallback: 4, m_pubParam: 8, m_cubParam: 16 }
    }
  },
  SteamNetworkPingLocation_t: {
    id: null,
    x64: { size: 512, fields: { m_data: 0 } },
    x86: { size: 512, fields: { m_data: 0 } },
    mac: { size: 512, fields: { m_data: 0 } }
  },
  SteamNetworkingConfigValue_t: {
    id: null,
    x64: { size: 16, fields: { m_eValue: 0, m_eDataType: 4, m_val: 8 } },
    x86: { size: 16, fields: { m_eValue: 0, m_eDataType: 4, m_val: 8 } },
    mac: { size: 16, fields: { m_eValue: 0, m_eDataType: 4, m_val: 8 } }
  },
  SteamNetConnectionRealTimeLaneStatus_t: {
    id: null,
    x64: {
      size: 64,
      fields: {
        m_cbPendingUnreliable: 0,
        m_cbPendingReliable: 4,
        m_cbSentUnackedReliable: 8,
        _reservePad1: 12,
        m_usecQueueTime: 16,
        reserved: 24
      }
    },
    x86: {
      size: 64,
      fields: {
        m_cbPendingUnreliable: 0,
        m_cbPendingReliable: 4,
        m_cbSentUnackedReliable: 8,
        _reservePad1: 12,
        m_usecQueueTime: 16,
        reserved: 24
      }
    },
    mac: {
      size: 64,
      fields: {
        m_cbPendingUnreliable: 0,
        m_cbPendingReliable: 4,
        m_cbSentUnackedReliable: 8,
        _reservePad1: 12,
        m_usecQueueTime: 16,
        reserved: 24
      }
    }
  },
  servernetadr_t: {
    id: null,
    x64: {
      size: 8,
      fields: { m_usConnectionPort: 0, m_usQueryPort: 2, m_unIP: 4 }
    },
    x86: {
      size: 8,
      fields: { m_usConnectionPort: 0, m_usQueryPort: 2, m_unIP: 4 }
    },
    mac: {
      size: 8,
      fields: { m_usConnectionPort: 0, m_usQueryPort: 2, m_unIP: 4 }
    }
  },
  gameserveritem_t: {
    id: null,
    x64: {
      size: 380,
      fields: {
        m_NetAdr: 0,
        m_nPing: 8,
        m_bHadSuccessfulResponse: 12,
        m_bDoNotRefresh: 13,
        m_szGameDir: 14,
        m_szMap: 46,
        m_szGameDescription: 78,
        m_nAppID: 144,
        m_nPlayers: 148,
        m_nMaxPlayers: 152,
        m_nBotPlayers: 156,
        m_bPassword: 160,
        m_bSecure: 161,
        m_ulTimeLastPlayed: 164,
        m_nServerVersion: 168,
        m_szServerName: 172,
        m_szGameTags: 236,
        m_steamID: 364,
        m_nCurrentFriendCount: 372,
        m_nTotalFriendCount: 376
      }
    },
    x86: {
      size: 380,
      fields: {
        m_NetAdr: 0,
        m_nPing: 8,
        m_bHadSuccessfulResponse: 12,
        m_bDoNotRefresh: 13,
        m_szGameDir: 14,
        m_szMap: 46,
        m_szGameDescription: 78,
        m_nAppID: 144,
        m_nPlayers: 148,
        m_nMaxPlayers: 152,
        m_nBotPlayers: 156,
        m_bPassword: 160,
        m_bSecure: 161,
        m_ulTimeLastPlayed: 164,
        m_nServerVersion: 168,
        m_szServerName: 172,
        m_szGameTags: 236,
        m_steamID: 364,
        m_nCurrentFriendCount: 372,
        m_nTotalFriendCount: 376
      }
    },
    mac: {
      size: 380,
      fields: {
        m_NetAdr: 0,
        m_nPing: 8,
        m_bHadSuccessfulResponse: 12,
        m_bDoNotRefresh: 13,
        m_szGameDir: 14,
        m_szMap: 46,
        m_szGameDescription: 78,
        m_nAppID: 144,
        m_nPlayers: 148,
        m_nMaxPlayers: 152,
        m_nBotPlayers: 156,
        m_bPassword: 160,
        m_bSecure: 161,
        m_ulTimeLastPlayed: 164,
        m_nServerVersion: 168,
        m_szServerName: 172,
        m_szGameTags: 236,
        m_steamID: 364,
        m_nCurrentFriendCount: 372,
        m_nTotalFriendCount: 376
      }
    }
  }
} as const

// Compile-time shape check (kept off the export for the same ts-prune reason as USER_STATS_RECEIVED_LAYOUT).
CALLBACK_LAYOUTS satisfies Record<string, CallbackLayoutEntry>

const CALLBACK_LAYOUT_TRIPLES: readonly {
  triple: UserStatsTriple
  arch: CallbackLayoutArch
}[] = [
  { triple: 'x86_64-pc-windows-msvc', arch: 'x64' },
  { triple: 'i686-pc-windows-msvc', arch: 'x86' },
  { triple: 'arm64-apple-macosx', arch: 'mac' }
]

function splitDumpSections(text: string): Map<string, string> {
  const sections = new Map<string, string>()
  const re = /^=== triple: (\S+)[^\n]*\n/gm
  const heads: { triple: string; start: number; bodyStart: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    heads.push({
      triple: m[1],
      start: m.index,
      bodyStart: m.index + m[0].length
    })
  }
  heads.forEach((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].start : text.length
    if (!sections.has(h.triple)) {
      sections.set(h.triple, text.slice(h.bodyStart, end))
    }
  })
  return sections
}

/**
 * Parses a dump into the shape of CALLBACK_LAYOUTS (size and field offsets per
 * struct per arch). The struct list and field-name order come from the table
 * literal; the numbers come only from the dump. Throws, never defaults, naming
 * the triple and struct when a section, a record or a field count is missing.
 */
// ts-prune-ignore-next -- measured layout data consumed by meta/gen_vtables.ts / meta/__tests__ (plan 58-02/58-10); ts-prune cannot see that use
export function parseCallbackLayoutsDump(
  text: string
): Record<string, Record<CallbackLayoutArch, StructLayout>> {
  const sections = splitDumpSections(text)
  const out: Record<string, Record<CallbackLayoutArch, StructLayout>> = {}
  for (const { triple, arch } of CALLBACK_LAYOUT_TRIPLES) {
    const section = sections.get(triple)
    if (section === undefined) {
      throw new Error(`${triple}: no section in dump (missing record layouts)`)
    }
    for (const name of Object.keys(CALLBACK_LAYOUTS)) {
      const rec = new RegExp(
        `Type: struct ${name}\\n[\\s\\S]*?Size:(\\d+)\\n[\\s\\S]*?FieldOffsets: \\[([^\\]]*)\\]`
      ).exec(section)
      if (!rec) {
        throw new Error(
          `${triple}: missing record layout (Size/FieldOffsets) for ${name}`
        )
      }
      const names = Object.keys(
        (CALLBACK_LAYOUTS as Record<string, CallbackLayoutEntry>)[name][arch]
          .fields
      )
      const offsets = rec[2].split(', ').map((o) => Number(o) / 8)
      if (offsets.length !== names.length) {
        throw new Error(
          `${triple}: ${name} has ${offsets.length} fields in the dump, ${names.length} in the table`
        )
      }
      const fields: Record<string, number> = {}
      names.forEach((n, i) => {
        fields[n] = offsets[i]
      })
      ;(out[name] ??= {} as Record<CallbackLayoutArch, StructLayout>)[arch] = {
        size: Number(rec[1]) / 8,
        fields
      }
    }
  }
  return out
}
