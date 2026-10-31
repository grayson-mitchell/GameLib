/**
 * GENERATED FILE -- DO NOT EDIT BY HAND.
 * Produced by meta/gen_vtables.ts (`pnpm gen-vtables`), 51-10 -- the
 * helper-side (native arm64, macOS) half of the SAME wire
 * native/steam-bridge/generated/steam_api_shim.c marshals the shim side
 * of. #include'd from native/steam-bridge/helper/bridge_helper.c.
 *
 * Interfaces covered: SteamUser023, SteamFriends018, SteamUser016, SteamFriends011, SteamUtils005, STEAMAPPS_INTERFACE_VERSION004, STEAMUSERSTATS_INTERFACE_VERSION010, SteamFriends013, STEAMAPPS_INTERFACE_VERSION005, STEAMUSERSTATS_INTERFACE_VERSION011, SteamMatchMaking009, SteamClient017, SteamUser019, SteamFriends015, SteamUtils008, STEAMAPPS_INTERFACE_VERSION008, SteamClient014, SteamNetworking006, SteamClient020, SteamClient021, SteamUser021, SteamFriends017, SteamUtils010, STEAMUSERSTATS_INTERFACE_VERSION012, STEAMUSERSTATS_INTERFACE_VERSION013, SteamUtils009, SteamUser018, SteamUtils007, STEAMAPPS_INTERFACE_VERSION007, SteamMatchMakingServers003, SteamNetworkingSockets013, SteamNetworkingUtils004, SteamNetworkingMessages002, SteamNetworkingSockets012.
 */
#ifndef GAMELIB_BRIDGE_DISPATCH_H
#define GAMELIB_BRIDGE_DISPATCH_H

#include <dlfcn.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "gamelib_callresult.h"

// Phase 52: bridge_helper.c defines logts() after #including this header.
static void logts(const char *cat, const char *msg);

// Phase 52 (T-52-04): game-controlled strings reach the FWD log only
// through this sanitizer -- length-bounded, non-printables become '?'.
#define BD_FWD_VERSION_CAP 129
static void bd_fwd_sanitize(const char *in, char *out, size_t cap) {
  size_t i = 0;
  if (cap == 0) return;
  if (in == NULL) { snprintf(out, cap, "(null)"); return; }
  for (; in[i] != '\0' && i < 128 && i + 1 < cap; i++) {
    unsigned char c = (unsigned char)in[i];
    out[i] = (c >= 0x20 && c <= 0x7e) ? (char)c : '?';
  }
  out[i] = '\0';
}

/*
Wire marshaling layout (51-06 Task 3; 51-10 mirrors this exactly):

Request blob (per method, params in manifest declaration order):
  - no kind, or kind 'value': paramWidth(type) raw bytes, host byte order.
  - kind 'in-string': [u32 len][len bytes, NOT NUL-terminated]. A NULL
    pointer packs len = 0xFFFFFFFF and no bytes. len is the real string's
    byte length. A string longer than WIRE_IN_STRING_MAX_BYTES is never
    truncated: it packs len = WIRE_IN_STRING_MAX_BYTES + 1 and no bytes,
    which the helper refuses (status != 0), so the call fails (55 WR-04).
  - kind 'out-value': nothing -- an out-value param is NEVER sent.
  - kind 'out-buffer': [u32 capacity] -- the sibling param named by
    sizeParam, read at call time and capped at WIRE_OUT_BUFFER_MAX_BYTES
    (a negative sizeParam sends capacity 0).
  - kind 'null-in' (53-14): nothing -- a const SteamNetworkingIdentity*
    param is NEVER sent; the helper passes NULL for it.

Response blob (per method):
  - the return value: 0 bytes (returnKind 'void'), 4 bytes (int32/pointer/
    float), 8 bytes (int64/double), [u32 len][bytes] (returnKind 'string',
    decoded by the dedicated string-return branch: accepted only when
    retlen >= 4, len <= retlen - 4 and len < STRING_RETURN_BUF_BYTES,
    otherwise the empty string), or structSize bytes
    (returnKind 'class', the sret branch).
  - then, for every 'out-value' param in declaration order: valueType's
    width (int32/uint32/float/bool = 4 bytes, uint64 = 8 bytes).
  - then, for every 'out-buffer' param in declaration order: [u32 len][len
    bytes] -- len is what the helper actually has (when the param names a
    lenParam, min(that out-value, capacity)); the shim copies
    min(len, capacity) and NUL-terminates only when the param's own type
    is a NUL-terminated string type (e.g. 'char*').

Extended kinds and modes (58-06):

Request blob:
  - kind 'in-buffer': [u32 len][len bytes]. len is the sibling lenParam's
    value. A buffer longer than WIRE_IN_BUFFER_MAX_BYTES (= WIRE_LARGE_MAX_BYTES,
    61440) is never truncated: it packs [u32 WIRE_IN_BUFFER_MAX_BYTES + 1] and
    no bytes, which the helper refuses with STATUS_ERR before touching any
    byte, so the game call returns its failure value. The helper also checks
    len <= remaining request bytes before copying, and that len equals the
    lenParam value.
  - kind 'in-struct': [u8 present][structSize bytes if present]. present 0
    means the game passed NULL and the helper passes NULL. Allowed only for a
    struct whose x64 and mac layouts are byte-identical; any other struct fails
    generation with 'needs repack'.
  - kind 'out-struct': nothing is sent.
  - kind 'out-buffer' with capBytes: the same [u32 capacity], capped at the
    param's capBytes (up to WIRE_LARGE_MAX_BYTES) instead of
    WIRE_OUT_BUFFER_MAX_BYTES.

Response blob:
  - an 'out-value' with valueType 'uint16' (58-12) is 2 bytes on the wire and
    is written as a uint16_t into the game pointer.
  - then, for every 'out-struct' param in declaration order, after the
    out-buffers: [u8 present][structSize bytes]. The shim copies the bytes into
    the game pointer only when that pointer is non-NULL and present is 1.

Messages (58-15):
  - kind 'out-messages': nothing is sent (the sibling countParam is an
    ordinary by-value param). The method's int32 return is the message count
    n; the records follow it, n of them:
      {u32 cbSize, u32 conn, u8 identity[136], i64 connUserData,
       i64 usecTimeReceived, i64 messageNumber, i32 channel, i32 flags,
       u16 lane, u16 pad, cbSize payload bytes}
    (a 180-byte header, then the payload). The records total at most
    WIRE_OUT_MESSAGES_MAX_BYTES. The shim decodes with gl_net_decode_messages:
    every length is checked against the remaining frame bytes before
    allocation; a malformed record ends decoding (earlier, complete records
    stay valid); n greater than the game's count is rejected and nothing is
    allocated. Each message is allocated on the Windows side with gl_msg_alloc,
    so the game owns it and releases it through its own m_pfnRelease.

Method modes:
  - shimLocal: the shim answers the method from its own SHIM_LOCAL_BODIES
    entry. It never produces a frame, so no Windows function pointer can reach
    the helper, and it has no helper dispatch case.
  - helperCustom: the request uses the generic encoding above, but the
    helper's named function (int fn(void *self, const uint8_t *args,
    uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);
    returns 0 for ok) produces the whole response blob, which must follow the
    method's declared response layout.
*/
#define BD_WIRE_IN_STRING_MAX_BYTES 4096
#define BD_WIRE_OUT_BUFFER_MAX_BYTES 4096

// Digest of the SAME sorted (interface, ordinal, slot, layout) wire-method
// tuples BRIDGE_SHIM_TABLE_HASH (steam_api_shim.c) embeds -- a drift
// between the two means the shim and this dispatch table disagree about
// what is on the wire.
#define BRIDGE_DISPATCH_TABLE_HASH "31f348033073"

// Response scratch -- bridge_dispatch() never writes past respCap, which
// the caller (bridge_helper.c) sizes to this constant.
#define BRIDGE_DISPATCH_RESP_SCRATCH_BYTES 61456

typedef void *(*BDAccessorFn_t)(void);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_friends_invite_dialog(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_mms_get_server_details(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_mms_ping_server(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_mms_player_details(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_mms_request_list(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_mms_server_friends(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_mms_server_rules(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_net_check_ping_data(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_net_configure_lanes(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_net_convert_ping_location(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_net_get_config_value(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_net_get_config_value_info(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_net_get_connection_info(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_net_get_local_ping_location(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_net_get_p2p_session_state(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_net_get_pop_list(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_net_read_p2p_packet(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_net_receive_messages(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_net_receive_messages_ch(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_net_receive_messages_pg(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_net_rt_status(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_net_session_info(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_net_set_config_value(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_net_sockets_open(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_nets_close_connection(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

// 58-06: hand-written in bridge_helper.c; returns 0 for ok.
int gl_nets_destroy_poll_group(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);

#define BD_ORDINAL_SteamUser023 1
static BDAccessorFn_t g_bd_accessor_steamuser023;
static void *g_bd_self_steamuser023;
#define BD_ORDINAL_SteamFriends018 2
static BDAccessorFn_t g_bd_accessor_steamfriends018;
static void *g_bd_self_steamfriends018;
#define BD_ORDINAL_SteamUser016 3
static BDAccessorFn_t g_bd_accessor_steamuser016;
static void *g_bd_self_steamuser016;
#define BD_ORDINAL_SteamFriends011 4
static BDAccessorFn_t g_bd_accessor_steamfriends011;
static void *g_bd_self_steamfriends011;
#define BD_ORDINAL_SteamUtils005 5
static BDAccessorFn_t g_bd_accessor_steamutils005;
static void *g_bd_self_steamutils005;
#define BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION004 6
static BDAccessorFn_t g_bd_accessor_steamapps_interface_version004;
static void *g_bd_self_steamapps_interface_version004;
#define BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 7
static BDAccessorFn_t g_bd_accessor_steamuserstats_interface_version010;
static void *g_bd_self_steamuserstats_interface_version010;
#define BD_ORDINAL_SteamFriends013 8
static BDAccessorFn_t g_bd_accessor_steamfriends013;
static void *g_bd_self_steamfriends013;
#define BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 9
static BDAccessorFn_t g_bd_accessor_steamapps_interface_version005;
static void *g_bd_self_steamapps_interface_version005;
#define BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 10
static BDAccessorFn_t g_bd_accessor_steamuserstats_interface_version011;
static void *g_bd_self_steamuserstats_interface_version011;
#define BD_ORDINAL_SteamMatchMaking009 12
static BDAccessorFn_t g_bd_accessor_steammatchmaking009;
static void *g_bd_self_steammatchmaking009;
#define BD_ORDINAL_SteamClient017 16
static BDAccessorFn_t g_bd_accessor_steamclient017;
static void *g_bd_self_steamclient017;
#define BD_ORDINAL_SteamUser019 17
static BDAccessorFn_t g_bd_accessor_steamuser019;
static void *g_bd_self_steamuser019;
#define BD_ORDINAL_SteamFriends015 18
static BDAccessorFn_t g_bd_accessor_steamfriends015;
static void *g_bd_self_steamfriends015;
#define BD_ORDINAL_SteamUtils008 19
static BDAccessorFn_t g_bd_accessor_steamutils008;
static void *g_bd_self_steamutils008;
#define BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 20
static BDAccessorFn_t g_bd_accessor_steamapps_interface_version008;
static void *g_bd_self_steamapps_interface_version008;
#define BD_ORDINAL_SteamClient014 22
static BDAccessorFn_t g_bd_accessor_steamclient014;
static void *g_bd_self_steamclient014;
#define BD_ORDINAL_SteamNetworking006 23
static BDAccessorFn_t g_bd_accessor_steamnetworking006;
static void *g_bd_self_steamnetworking006;
#define BD_ORDINAL_SteamClient020 25
static BDAccessorFn_t g_bd_accessor_steamclient020;
static void *g_bd_self_steamclient020;
#define BD_ORDINAL_SteamClient021 26
static BDAccessorFn_t g_bd_accessor_steamclient021;
static void *g_bd_self_steamclient021;
#define BD_ORDINAL_SteamUser021 27
static BDAccessorFn_t g_bd_accessor_steamuser021;
static void *g_bd_self_steamuser021;
#define BD_ORDINAL_SteamFriends017 28
static BDAccessorFn_t g_bd_accessor_steamfriends017;
static void *g_bd_self_steamfriends017;
#define BD_ORDINAL_SteamUtils010 29
static BDAccessorFn_t g_bd_accessor_steamutils010;
static void *g_bd_self_steamutils010;
#define BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 30
static BDAccessorFn_t g_bd_accessor_steamuserstats_interface_version012;
static void *g_bd_self_steamuserstats_interface_version012;
#define BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 31
static BDAccessorFn_t g_bd_accessor_steamuserstats_interface_version013;
static void *g_bd_self_steamuserstats_interface_version013;
#define BD_ORDINAL_SteamUtils009 54
static BDAccessorFn_t g_bd_accessor_steamutils009;
static void *g_bd_self_steamutils009;
#define BD_ORDINAL_SteamUser018 59
static BDAccessorFn_t g_bd_accessor_steamuser018;
static void *g_bd_self_steamuser018;
#define BD_ORDINAL_SteamUtils007 60
static BDAccessorFn_t g_bd_accessor_steamutils007;
static void *g_bd_self_steamutils007;
#define BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 61
static BDAccessorFn_t g_bd_accessor_steamapps_interface_version007;
static void *g_bd_self_steamapps_interface_version007;
#define BD_ORDINAL_SteamMatchMakingServers003 69
static BDAccessorFn_t g_bd_accessor_steammatchmakingservers003;
static void *g_bd_self_steammatchmakingservers003;
#define BD_ORDINAL_SteamNetworkingSockets013 70
static BDAccessorFn_t g_bd_accessor_steamnetworkingsockets013;
static void *g_bd_self_steamnetworkingsockets013;
#define BD_ORDINAL_SteamNetworkingUtils004 71
static BDAccessorFn_t g_bd_accessor_steamnetworkingutils004;
static void *g_bd_self_steamnetworkingutils004;
#define BD_ORDINAL_SteamNetworkingMessages002 72
static BDAccessorFn_t g_bd_accessor_steamnetworkingmessages002;
static void *g_bd_self_steamnetworkingmessages002;
#define BD_ORDINAL_SteamNetworkingSockets012 73
static BDAccessorFn_t g_bd_accessor_steamnetworkingsockets012;
static void *g_bd_self_steamnetworkingsockets012;

#define BD_SLOT_SteamUser023_GetHSteamUser 0
typedef int32_t (*BDFlatFn_SteamUser023_GetHSteamUser_t)(void *);
static BDFlatFn_SteamUser023_GetHSteamUser_t g_bd_flat_SteamUser023_GetHSteamUser;
#define BD_SLOT_SteamUser023_BLoggedOn 1
typedef int (*BDFlatFn_SteamUser023_BLoggedOn_t)(void *);
static BDFlatFn_SteamUser023_BLoggedOn_t g_bd_flat_SteamUser023_BLoggedOn;
#define BD_SLOT_SteamUser023_GetSteamID 2
typedef uint64_t (*BDFlatFn_SteamUser023_GetSteamID_t)(void *);
static BDFlatFn_SteamUser023_GetSteamID_t g_bd_flat_SteamUser023_GetSteamID;
#define BD_SLOT_SteamUser023_GetAuthSessionTicket 13
typedef uint32_t (*BDFlatFn_SteamUser023_GetAuthSessionTicket_t)(void *, void *, int32_t, uint32_t *, const void *);
static BDFlatFn_SteamUser023_GetAuthSessionTicket_t g_bd_flat_SteamUser023_GetAuthSessionTicket;
#define BD_SLOT_SteamUser023_GetAuthTicketForWebApi 14
typedef uint32_t (*BDFlatFn_SteamUser023_GetAuthTicketForWebApi_t)(void *, const char *);
static BDFlatFn_SteamUser023_GetAuthTicketForWebApi_t g_bd_flat_SteamUser023_GetAuthTicketForWebApi;
#define BD_SLOT_SteamUser023_CancelAuthTicket 17
typedef void (*BDFlatFn_SteamUser023_CancelAuthTicket_t)(void *, uint32_t);
static BDFlatFn_SteamUser023_CancelAuthTicket_t g_bd_flat_SteamUser023_CancelAuthTicket;
#define BD_SLOT_SteamFriends018_GetPersonaName 0
typedef const char * (*BDFlatFn_SteamFriends018_GetPersonaName_t)(void *);
static BDFlatFn_SteamFriends018_GetPersonaName_t g_bd_flat_SteamFriends018_GetPersonaName;
#define BD_SLOT_SteamFriends018_GetPersonaState 1
typedef uint32_t (*BDFlatFn_SteamFriends018_GetPersonaState_t)(void *);
static BDFlatFn_SteamFriends018_GetPersonaState_t g_bd_flat_SteamFriends018_GetPersonaState;
#define BD_SLOT_SteamFriends018_GetFriendPersonaName 6
typedef const char * (*BDFlatFn_SteamFriends018_GetFriendPersonaName_t)(void *, uint64_t);
static BDFlatFn_SteamFriends018_GetFriendPersonaName_t g_bd_flat_SteamFriends018_GetFriendPersonaName;
#define BD_SLOT_SteamUser016_GetHSteamUser 0
typedef int32_t (*BDFlatFn_SteamUser016_GetHSteamUser_t)(void *);
static BDFlatFn_SteamUser016_GetHSteamUser_t g_bd_flat_SteamUser016_GetHSteamUser;
#define BD_SLOT_SteamUser016_BLoggedOn 1
typedef int (*BDFlatFn_SteamUser016_BLoggedOn_t)(void *);
static BDFlatFn_SteamUser016_BLoggedOn_t g_bd_flat_SteamUser016_BLoggedOn;
#define BD_SLOT_SteamUser016_GetSteamID 2
typedef uint64_t (*BDFlatFn_SteamUser016_GetSteamID_t)(void *);
static BDFlatFn_SteamUser016_GetSteamID_t g_bd_flat_SteamUser016_GetSteamID;
#define BD_SLOT_SteamFriends011_GetPersonaName 0
typedef const char * (*BDFlatFn_SteamFriends011_GetPersonaName_t)(void *);
static BDFlatFn_SteamFriends011_GetPersonaName_t g_bd_flat_SteamFriends011_GetPersonaName;
#define BD_SLOT_SteamFriends011_GetPersonaState 2
typedef uint32_t (*BDFlatFn_SteamFriends011_GetPersonaState_t)(void *);
static BDFlatFn_SteamFriends011_GetPersonaState_t g_bd_flat_SteamFriends011_GetPersonaState;
#define BD_SLOT_SteamFriends011_GetFriendPersonaName 7
typedef const char * (*BDFlatFn_SteamFriends011_GetFriendPersonaName_t)(void *, uint64_t);
static BDFlatFn_SteamFriends011_GetFriendPersonaName_t g_bd_flat_SteamFriends011_GetFriendPersonaName;
#define BD_SLOT_SteamUtils005_GetSecondsSinceAppActive 0
typedef uint32_t (*BDFlatFn_SteamUtils005_GetSecondsSinceAppActive_t)(void *);
static BDFlatFn_SteamUtils005_GetSecondsSinceAppActive_t g_bd_flat_SteamUtils005_GetSecondsSinceAppActive;
#define BD_SLOT_SteamUtils005_GetSecondsSinceComputerActive 1
typedef uint32_t (*BDFlatFn_SteamUtils005_GetSecondsSinceComputerActive_t)(void *);
static BDFlatFn_SteamUtils005_GetSecondsSinceComputerActive_t g_bd_flat_SteamUtils005_GetSecondsSinceComputerActive;
#define BD_SLOT_SteamUtils005_GetConnectedUniverse 2
typedef uint32_t (*BDFlatFn_SteamUtils005_GetConnectedUniverse_t)(void *);
static BDFlatFn_SteamUtils005_GetConnectedUniverse_t g_bd_flat_SteamUtils005_GetConnectedUniverse;
#define BD_SLOT_SteamUtils005_GetServerRealTime 3
typedef uint32_t (*BDFlatFn_SteamUtils005_GetServerRealTime_t)(void *);
static BDFlatFn_SteamUtils005_GetServerRealTime_t g_bd_flat_SteamUtils005_GetServerRealTime;
#define BD_SLOT_SteamUtils005_GetIPCountry 4
typedef const char * (*BDFlatFn_SteamUtils005_GetIPCountry_t)(void *);
static BDFlatFn_SteamUtils005_GetIPCountry_t g_bd_flat_SteamUtils005_GetIPCountry;
#define BD_SLOT_SteamUtils005_GetCurrentBatteryPower 8
typedef uint32_t (*BDFlatFn_SteamUtils005_GetCurrentBatteryPower_t)(void *);
static BDFlatFn_SteamUtils005_GetCurrentBatteryPower_t g_bd_flat_SteamUtils005_GetCurrentBatteryPower;
#define BD_SLOT_SteamUtils005_GetAppID 9
typedef uint32_t (*BDFlatFn_SteamUtils005_GetAppID_t)(void *);
static BDFlatFn_SteamUtils005_GetAppID_t g_bd_flat_SteamUtils005_GetAppID;
#define BD_SLOT_SteamUtils005_IsOverlayEnabled 17
typedef int (*BDFlatFn_SteamUtils005_IsOverlayEnabled_t)(void *);
static BDFlatFn_SteamUtils005_IsOverlayEnabled_t g_bd_flat_SteamUtils005_IsOverlayEnabled;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribed 0
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribed_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribed_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribed;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsLowViolence 1
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsLowViolence_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsLowViolence_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsLowViolence;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsCybercafe 2
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsCybercafe_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsCybercafe_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsCybercafe;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsVACBanned 3
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsVACBanned_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsVACBanned_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsVACBanned;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage 4
typedef const char * (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages 5
typedef const char * (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedApp 6
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedApp_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedApp_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedApp;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsDlcInstalled 7
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsDlcInstalled_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsDlcInstalled_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsDlcInstalled;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_GetEarliestPurchaseUnixTime 8
typedef uint32_t (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_GetEarliestPurchaseUnixTime_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_GetEarliestPurchaseUnixTime_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetEarliestPurchaseUnixTime;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedFromFreeWeekend 9
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedFromFreeWeekend_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedFromFreeWeekend_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedFromFreeWeekend;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_GetDLCCount 10
typedef int32_t (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_GetDLCCount_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_GetDLCCount_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetDLCCount;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2 1
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2_t)(void *, const char *, float *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat 2
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_t)(void *, const char *, int32_t *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2 3
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2_t)(void *, const char *, float);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat 4
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_t)(void *, const char *, int32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat 5
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat_t)(void *, const char *, float, double);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement 6
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement_t)(void *, const char *, int *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement 7
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement_t)(void *, const char *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement 8
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement_t)(void *, const char *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime 9
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime_t)(void *, const char *, int *, uint32_t *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_StoreStats 10
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_StoreStats_t)(void *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_StoreStats_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_StoreStats;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute 12
typedef const char * (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_t)(void *, const char *, const char *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress 13
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress_t)(void *, const char *, uint32_t, uint32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_ResetAllStats 19
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_ResetAllStats_t)(void *, int);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_ResetAllStats_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_ResetAllStats;
#define BD_SLOT_SteamFriends013_GetPersonaName 0
typedef const char * (*BDFlatFn_SteamFriends013_GetPersonaName_t)(void *);
static BDFlatFn_SteamFriends013_GetPersonaName_t g_bd_flat_SteamFriends013_GetPersonaName;
#define BD_SLOT_SteamFriends013_GetPersonaState 2
typedef uint32_t (*BDFlatFn_SteamFriends013_GetPersonaState_t)(void *);
static BDFlatFn_SteamFriends013_GetPersonaState_t g_bd_flat_SteamFriends013_GetPersonaState;
#define BD_SLOT_SteamFriends013_GetFriendPersonaName 7
typedef const char * (*BDFlatFn_SteamFriends013_GetFriendPersonaName_t)(void *, uint64_t);
static BDFlatFn_SteamFriends013_GetFriendPersonaName_t g_bd_flat_SteamFriends013_GetFriendPersonaName;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribed 0
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribed_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribed_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribed;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsLowViolence 1
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsLowViolence_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsLowViolence_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsLowViolence;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsCybercafe 2
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsCybercafe_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsCybercafe_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsCybercafe;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsVACBanned 3
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsVACBanned_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsVACBanned_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsVACBanned;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage 4
typedef const char * (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages 5
typedef const char * (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedApp 6
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedApp_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedApp_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedApp;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsDlcInstalled 7
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsDlcInstalled_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsDlcInstalled_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsDlcInstalled;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_GetEarliestPurchaseUnixTime 8
typedef uint32_t (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_GetEarliestPurchaseUnixTime_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_GetEarliestPurchaseUnixTime_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetEarliestPurchaseUnixTime;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedFromFreeWeekend 9
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedFromFreeWeekend_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedFromFreeWeekend_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedFromFreeWeekend;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_GetDLCCount 10
typedef int32_t (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_GetDLCCount_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_GetDLCCount_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetDLCCount;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsAppInstalled 19
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsAppInstalled_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsAppInstalled_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsAppInstalled;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2 1
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2_t)(void *, const char *, float *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat 2
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_t)(void *, const char *, int32_t *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2 3
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2_t)(void *, const char *, float);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat 4
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_t)(void *, const char *, int32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat 5
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat_t)(void *, const char *, float, double);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement 6
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement_t)(void *, const char *, int *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement 7
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement_t)(void *, const char *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement 8
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement_t)(void *, const char *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime 9
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime_t)(void *, const char *, int *, uint32_t *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_StoreStats 10
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_StoreStats_t)(void *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_StoreStats_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_StoreStats;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute 12
typedef const char * (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_t)(void *, const char *, const char *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress 13
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress_t)(void *, const char *, uint32_t, uint32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetNumAchievements 14
typedef uint32_t (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetNumAchievements_t)(void *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetNumAchievements_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetNumAchievements;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName 15
typedef const char * (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName_t)(void *, uint32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_ResetAllStats 21
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_ResetAllStats_t)(void *, int);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_ResetAllStats_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_ResetAllStats;
#define BD_SLOT_SteamMatchMaking009_GetFavoriteGameCount 0
typedef int32_t (*BDFlatFn_SteamMatchMaking009_GetFavoriteGameCount_t)(void *);
static BDFlatFn_SteamMatchMaking009_GetFavoriteGameCount_t g_bd_flat_SteamMatchMaking009_GetFavoriteGameCount;
#define BD_SLOT_SteamMatchMaking009_GetFavoriteGame 1
typedef int (*BDFlatFn_SteamMatchMaking009_GetFavoriteGame_t)(void *, int32_t, uint32_t *, uint32_t *, uint16_t *, uint16_t *, uint32_t *, uint32_t *);
static BDFlatFn_SteamMatchMaking009_GetFavoriteGame_t g_bd_flat_SteamMatchMaking009_GetFavoriteGame;
#define BD_SLOT_SteamMatchMaking009_AddFavoriteGame 2
typedef int32_t (*BDFlatFn_SteamMatchMaking009_AddFavoriteGame_t)(void *, uint32_t, uint32_t, uint32_t, uint32_t, uint32_t, uint32_t);
static BDFlatFn_SteamMatchMaking009_AddFavoriteGame_t g_bd_flat_SteamMatchMaking009_AddFavoriteGame;
#define BD_SLOT_SteamMatchMaking009_RemoveFavoriteGame 3
typedef int (*BDFlatFn_SteamMatchMaking009_RemoveFavoriteGame_t)(void *, uint32_t, uint32_t, uint32_t, uint32_t, uint32_t);
static BDFlatFn_SteamMatchMaking009_RemoveFavoriteGame_t g_bd_flat_SteamMatchMaking009_RemoveFavoriteGame;
#define BD_SLOT_SteamMatchMaking009_RequestLobbyList 4
typedef uint64_t (*BDFlatFn_SteamMatchMaking009_RequestLobbyList_t)(void *);
static BDFlatFn_SteamMatchMaking009_RequestLobbyList_t g_bd_flat_SteamMatchMaking009_RequestLobbyList;
#define BD_SLOT_SteamMatchMaking009_AddRequestLobbyListStringFilter 5
typedef void (*BDFlatFn_SteamMatchMaking009_AddRequestLobbyListStringFilter_t)(void *, const char *, const char *, uint32_t);
static BDFlatFn_SteamMatchMaking009_AddRequestLobbyListStringFilter_t g_bd_flat_SteamMatchMaking009_AddRequestLobbyListStringFilter;
#define BD_SLOT_SteamMatchMaking009_AddRequestLobbyListNumericalFilter 6
typedef void (*BDFlatFn_SteamMatchMaking009_AddRequestLobbyListNumericalFilter_t)(void *, const char *, int32_t, uint32_t);
static BDFlatFn_SteamMatchMaking009_AddRequestLobbyListNumericalFilter_t g_bd_flat_SteamMatchMaking009_AddRequestLobbyListNumericalFilter;
#define BD_SLOT_SteamMatchMaking009_AddRequestLobbyListNearValueFilter 7
typedef void (*BDFlatFn_SteamMatchMaking009_AddRequestLobbyListNearValueFilter_t)(void *, const char *, int32_t);
static BDFlatFn_SteamMatchMaking009_AddRequestLobbyListNearValueFilter_t g_bd_flat_SteamMatchMaking009_AddRequestLobbyListNearValueFilter;
#define BD_SLOT_SteamMatchMaking009_AddRequestLobbyListFilterSlotsAvailable 8
typedef void (*BDFlatFn_SteamMatchMaking009_AddRequestLobbyListFilterSlotsAvailable_t)(void *, int32_t);
static BDFlatFn_SteamMatchMaking009_AddRequestLobbyListFilterSlotsAvailable_t g_bd_flat_SteamMatchMaking009_AddRequestLobbyListFilterSlotsAvailable;
#define BD_SLOT_SteamMatchMaking009_AddRequestLobbyListDistanceFilter 9
typedef void (*BDFlatFn_SteamMatchMaking009_AddRequestLobbyListDistanceFilter_t)(void *, uint32_t);
static BDFlatFn_SteamMatchMaking009_AddRequestLobbyListDistanceFilter_t g_bd_flat_SteamMatchMaking009_AddRequestLobbyListDistanceFilter;
#define BD_SLOT_SteamMatchMaking009_AddRequestLobbyListResultCountFilter 10
typedef void (*BDFlatFn_SteamMatchMaking009_AddRequestLobbyListResultCountFilter_t)(void *, int32_t);
static BDFlatFn_SteamMatchMaking009_AddRequestLobbyListResultCountFilter_t g_bd_flat_SteamMatchMaking009_AddRequestLobbyListResultCountFilter;
#define BD_SLOT_SteamMatchMaking009_AddRequestLobbyListCompatibleMembersFilter 11
typedef void (*BDFlatFn_SteamMatchMaking009_AddRequestLobbyListCompatibleMembersFilter_t)(void *, uint64_t);
static BDFlatFn_SteamMatchMaking009_AddRequestLobbyListCompatibleMembersFilter_t g_bd_flat_SteamMatchMaking009_AddRequestLobbyListCompatibleMembersFilter;
#define BD_SLOT_SteamMatchMaking009_GetLobbyByIndex 12
typedef uint64_t (*BDFlatFn_SteamMatchMaking009_GetLobbyByIndex_t)(void *, int32_t);
static BDFlatFn_SteamMatchMaking009_GetLobbyByIndex_t g_bd_flat_SteamMatchMaking009_GetLobbyByIndex;
#define BD_SLOT_SteamMatchMaking009_CreateLobby 13
typedef uint64_t (*BDFlatFn_SteamMatchMaking009_CreateLobby_t)(void *, uint32_t, int32_t);
static BDFlatFn_SteamMatchMaking009_CreateLobby_t g_bd_flat_SteamMatchMaking009_CreateLobby;
#define BD_SLOT_SteamMatchMaking009_JoinLobby 14
typedef uint64_t (*BDFlatFn_SteamMatchMaking009_JoinLobby_t)(void *, uint64_t);
static BDFlatFn_SteamMatchMaking009_JoinLobby_t g_bd_flat_SteamMatchMaking009_JoinLobby;
#define BD_SLOT_SteamMatchMaking009_LeaveLobby 15
typedef void (*BDFlatFn_SteamMatchMaking009_LeaveLobby_t)(void *, uint64_t);
static BDFlatFn_SteamMatchMaking009_LeaveLobby_t g_bd_flat_SteamMatchMaking009_LeaveLobby;
#define BD_SLOT_SteamMatchMaking009_InviteUserToLobby 16
typedef int (*BDFlatFn_SteamMatchMaking009_InviteUserToLobby_t)(void *, uint64_t, uint64_t);
static BDFlatFn_SteamMatchMaking009_InviteUserToLobby_t g_bd_flat_SteamMatchMaking009_InviteUserToLobby;
#define BD_SLOT_SteamMatchMaking009_GetNumLobbyMembers 17
typedef int32_t (*BDFlatFn_SteamMatchMaking009_GetNumLobbyMembers_t)(void *, uint64_t);
static BDFlatFn_SteamMatchMaking009_GetNumLobbyMembers_t g_bd_flat_SteamMatchMaking009_GetNumLobbyMembers;
#define BD_SLOT_SteamMatchMaking009_GetLobbyMemberByIndex 18
typedef uint64_t (*BDFlatFn_SteamMatchMaking009_GetLobbyMemberByIndex_t)(void *, uint64_t, int32_t);
static BDFlatFn_SteamMatchMaking009_GetLobbyMemberByIndex_t g_bd_flat_SteamMatchMaking009_GetLobbyMemberByIndex;
#define BD_SLOT_SteamMatchMaking009_GetLobbyData 19
typedef const char * (*BDFlatFn_SteamMatchMaking009_GetLobbyData_t)(void *, uint64_t, const char *);
static BDFlatFn_SteamMatchMaking009_GetLobbyData_t g_bd_flat_SteamMatchMaking009_GetLobbyData;
#define BD_SLOT_SteamMatchMaking009_SetLobbyData 20
typedef int (*BDFlatFn_SteamMatchMaking009_SetLobbyData_t)(void *, uint64_t, const char *, const char *);
static BDFlatFn_SteamMatchMaking009_SetLobbyData_t g_bd_flat_SteamMatchMaking009_SetLobbyData;
#define BD_SLOT_SteamMatchMaking009_GetLobbyDataCount 21
typedef int32_t (*BDFlatFn_SteamMatchMaking009_GetLobbyDataCount_t)(void *, uint64_t);
static BDFlatFn_SteamMatchMaking009_GetLobbyDataCount_t g_bd_flat_SteamMatchMaking009_GetLobbyDataCount;
#define BD_SLOT_SteamMatchMaking009_GetLobbyDataByIndex 22
typedef int (*BDFlatFn_SteamMatchMaking009_GetLobbyDataByIndex_t)(void *, uint64_t, int32_t, char *, int32_t, char *, int32_t);
static BDFlatFn_SteamMatchMaking009_GetLobbyDataByIndex_t g_bd_flat_SteamMatchMaking009_GetLobbyDataByIndex;
#define BD_SLOT_SteamMatchMaking009_DeleteLobbyData 23
typedef int (*BDFlatFn_SteamMatchMaking009_DeleteLobbyData_t)(void *, uint64_t, const char *);
static BDFlatFn_SteamMatchMaking009_DeleteLobbyData_t g_bd_flat_SteamMatchMaking009_DeleteLobbyData;
#define BD_SLOT_SteamMatchMaking009_GetLobbyMemberData 24
typedef const char * (*BDFlatFn_SteamMatchMaking009_GetLobbyMemberData_t)(void *, uint64_t, uint64_t, const char *);
static BDFlatFn_SteamMatchMaking009_GetLobbyMemberData_t g_bd_flat_SteamMatchMaking009_GetLobbyMemberData;
#define BD_SLOT_SteamMatchMaking009_SetLobbyMemberData 25
typedef void (*BDFlatFn_SteamMatchMaking009_SetLobbyMemberData_t)(void *, uint64_t, const char *, const char *);
static BDFlatFn_SteamMatchMaking009_SetLobbyMemberData_t g_bd_flat_SteamMatchMaking009_SetLobbyMemberData;
#define BD_SLOT_SteamMatchMaking009_SendLobbyChatMsg 26
typedef int (*BDFlatFn_SteamMatchMaking009_SendLobbyChatMsg_t)(void *, uint64_t, const void *, int32_t);
static BDFlatFn_SteamMatchMaking009_SendLobbyChatMsg_t g_bd_flat_SteamMatchMaking009_SendLobbyChatMsg;
#define BD_SLOT_SteamMatchMaking009_GetLobbyChatEntry 27
typedef int32_t (*BDFlatFn_SteamMatchMaking009_GetLobbyChatEntry_t)(void *, uint64_t, int32_t, uint64_t *, void *, int32_t, uint32_t *);
static BDFlatFn_SteamMatchMaking009_GetLobbyChatEntry_t g_bd_flat_SteamMatchMaking009_GetLobbyChatEntry;
#define BD_SLOT_SteamMatchMaking009_RequestLobbyData 28
typedef int (*BDFlatFn_SteamMatchMaking009_RequestLobbyData_t)(void *, uint64_t);
static BDFlatFn_SteamMatchMaking009_RequestLobbyData_t g_bd_flat_SteamMatchMaking009_RequestLobbyData;
#define BD_SLOT_SteamMatchMaking009_SetLobbyGameServer 29
typedef void (*BDFlatFn_SteamMatchMaking009_SetLobbyGameServer_t)(void *, uint64_t, uint32_t, uint32_t, uint64_t);
static BDFlatFn_SteamMatchMaking009_SetLobbyGameServer_t g_bd_flat_SteamMatchMaking009_SetLobbyGameServer;
#define BD_SLOT_SteamMatchMaking009_GetLobbyGameServer 30
typedef int (*BDFlatFn_SteamMatchMaking009_GetLobbyGameServer_t)(void *, uint64_t, uint32_t *, uint16_t *, uint64_t *);
static BDFlatFn_SteamMatchMaking009_GetLobbyGameServer_t g_bd_flat_SteamMatchMaking009_GetLobbyGameServer;
#define BD_SLOT_SteamMatchMaking009_SetLobbyMemberLimit 31
typedef int (*BDFlatFn_SteamMatchMaking009_SetLobbyMemberLimit_t)(void *, uint64_t, int32_t);
static BDFlatFn_SteamMatchMaking009_SetLobbyMemberLimit_t g_bd_flat_SteamMatchMaking009_SetLobbyMemberLimit;
#define BD_SLOT_SteamMatchMaking009_GetLobbyMemberLimit 32
typedef int32_t (*BDFlatFn_SteamMatchMaking009_GetLobbyMemberLimit_t)(void *, uint64_t);
static BDFlatFn_SteamMatchMaking009_GetLobbyMemberLimit_t g_bd_flat_SteamMatchMaking009_GetLobbyMemberLimit;
#define BD_SLOT_SteamMatchMaking009_SetLobbyType 33
typedef int (*BDFlatFn_SteamMatchMaking009_SetLobbyType_t)(void *, uint64_t, uint32_t);
static BDFlatFn_SteamMatchMaking009_SetLobbyType_t g_bd_flat_SteamMatchMaking009_SetLobbyType;
#define BD_SLOT_SteamMatchMaking009_SetLobbyJoinable 34
typedef int (*BDFlatFn_SteamMatchMaking009_SetLobbyJoinable_t)(void *, uint64_t, int);
static BDFlatFn_SteamMatchMaking009_SetLobbyJoinable_t g_bd_flat_SteamMatchMaking009_SetLobbyJoinable;
#define BD_SLOT_SteamMatchMaking009_GetLobbyOwner 35
typedef uint64_t (*BDFlatFn_SteamMatchMaking009_GetLobbyOwner_t)(void *, uint64_t);
static BDFlatFn_SteamMatchMaking009_GetLobbyOwner_t g_bd_flat_SteamMatchMaking009_GetLobbyOwner;
#define BD_SLOT_SteamMatchMaking009_SetLobbyOwner 36
typedef int (*BDFlatFn_SteamMatchMaking009_SetLobbyOwner_t)(void *, uint64_t, uint64_t);
static BDFlatFn_SteamMatchMaking009_SetLobbyOwner_t g_bd_flat_SteamMatchMaking009_SetLobbyOwner;
#define BD_SLOT_SteamMatchMaking009_SetLinkedLobby 37
typedef int (*BDFlatFn_SteamMatchMaking009_SetLinkedLobby_t)(void *, uint64_t, uint64_t);
static BDFlatFn_SteamMatchMaking009_SetLinkedLobby_t g_bd_flat_SteamMatchMaking009_SetLinkedLobby;
#define BD_SLOT_SteamClient017_CreateSteamPipe 0
typedef int32_t (*BDFlatFn_SteamClient017_CreateSteamPipe_t)(void *);
static BDFlatFn_SteamClient017_CreateSteamPipe_t g_bd_flat_SteamClient017_CreateSteamPipe;
#define BD_SLOT_SteamClient017_BReleaseSteamPipe 1
typedef int (*BDFlatFn_SteamClient017_BReleaseSteamPipe_t)(void *, int32_t);
static BDFlatFn_SteamClient017_BReleaseSteamPipe_t g_bd_flat_SteamClient017_BReleaseSteamPipe;
#define BD_SLOT_SteamClient017_ConnectToGlobalUser 2
typedef int32_t (*BDFlatFn_SteamClient017_ConnectToGlobalUser_t)(void *, int32_t);
static BDFlatFn_SteamClient017_ConnectToGlobalUser_t g_bd_flat_SteamClient017_ConnectToGlobalUser;
#define BD_SLOT_SteamClient017_CreateLocalUser 3
typedef int32_t (*BDFlatFn_SteamClient017_CreateLocalUser_t)(void *, int32_t *, uint32_t);
static BDFlatFn_SteamClient017_CreateLocalUser_t g_bd_flat_SteamClient017_CreateLocalUser;
#define BD_SLOT_SteamClient017_ReleaseUser 4
typedef void (*BDFlatFn_SteamClient017_ReleaseUser_t)(void *, int32_t, int32_t);
static BDFlatFn_SteamClient017_ReleaseUser_t g_bd_flat_SteamClient017_ReleaseUser;
#define BD_SLOT_SteamClient017_GetISteamUser 5
typedef void * (*BDFlatFn_SteamClient017_GetISteamUser_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamUser_t g_bd_flat_SteamClient017_GetISteamUser;
#define BD_SLOT_SteamClient017_GetISteamGameServer 6
typedef void * (*BDFlatFn_SteamClient017_GetISteamGameServer_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamGameServer_t g_bd_flat_SteamClient017_GetISteamGameServer;
#define BD_SLOT_SteamClient017_GetISteamFriends 8
typedef void * (*BDFlatFn_SteamClient017_GetISteamFriends_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamFriends_t g_bd_flat_SteamClient017_GetISteamFriends;
#define BD_SLOT_SteamClient017_GetISteamUtils 9
typedef void * (*BDFlatFn_SteamClient017_GetISteamUtils_t)(void *, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamUtils_t g_bd_flat_SteamClient017_GetISteamUtils;
#define BD_SLOT_SteamClient017_GetISteamMatchmaking 10
typedef void * (*BDFlatFn_SteamClient017_GetISteamMatchmaking_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamMatchmaking_t g_bd_flat_SteamClient017_GetISteamMatchmaking;
#define BD_SLOT_SteamClient017_GetISteamMatchmakingServers 11
typedef void * (*BDFlatFn_SteamClient017_GetISteamMatchmakingServers_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamMatchmakingServers_t g_bd_flat_SteamClient017_GetISteamMatchmakingServers;
#define BD_SLOT_SteamClient017_GetISteamGenericInterface 12
typedef void * (*BDFlatFn_SteamClient017_GetISteamGenericInterface_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamGenericInterface_t g_bd_flat_SteamClient017_GetISteamGenericInterface;
#define BD_SLOT_SteamClient017_GetISteamUserStats 13
typedef void * (*BDFlatFn_SteamClient017_GetISteamUserStats_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamUserStats_t g_bd_flat_SteamClient017_GetISteamUserStats;
#define BD_SLOT_SteamClient017_GetISteamGameServerStats 14
typedef void * (*BDFlatFn_SteamClient017_GetISteamGameServerStats_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamGameServerStats_t g_bd_flat_SteamClient017_GetISteamGameServerStats;
#define BD_SLOT_SteamClient017_GetISteamApps 15
typedef void * (*BDFlatFn_SteamClient017_GetISteamApps_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamApps_t g_bd_flat_SteamClient017_GetISteamApps;
#define BD_SLOT_SteamClient017_GetISteamNetworking 16
typedef void * (*BDFlatFn_SteamClient017_GetISteamNetworking_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamNetworking_t g_bd_flat_SteamClient017_GetISteamNetworking;
#define BD_SLOT_SteamClient017_GetISteamRemoteStorage 17
typedef void * (*BDFlatFn_SteamClient017_GetISteamRemoteStorage_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamRemoteStorage_t g_bd_flat_SteamClient017_GetISteamRemoteStorage;
#define BD_SLOT_SteamClient017_GetISteamScreenshots 18
typedef void * (*BDFlatFn_SteamClient017_GetISteamScreenshots_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamScreenshots_t g_bd_flat_SteamClient017_GetISteamScreenshots;
#define BD_SLOT_SteamClient017_RunFrame 19
typedef void (*BDFlatFn_SteamClient017_RunFrame_t)(void *);
static BDFlatFn_SteamClient017_RunFrame_t g_bd_flat_SteamClient017_RunFrame;
#define BD_SLOT_SteamClient017_GetIPCCallCount 20
typedef uint32_t (*BDFlatFn_SteamClient017_GetIPCCallCount_t)(void *);
static BDFlatFn_SteamClient017_GetIPCCallCount_t g_bd_flat_SteamClient017_GetIPCCallCount;
#define BD_SLOT_SteamClient017_BShutdownIfAllPipesClosed 22
typedef int (*BDFlatFn_SteamClient017_BShutdownIfAllPipesClosed_t)(void *);
static BDFlatFn_SteamClient017_BShutdownIfAllPipesClosed_t g_bd_flat_SteamClient017_BShutdownIfAllPipesClosed;
#define BD_SLOT_SteamClient017_GetISteamHTTP 23
typedef void * (*BDFlatFn_SteamClient017_GetISteamHTTP_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamHTTP_t g_bd_flat_SteamClient017_GetISteamHTTP;
#define BD_SLOT_SteamClient017_DEPRECATED_GetISteamUnifiedMessages 24
typedef void * (*BDFlatFn_SteamClient017_DEPRECATED_GetISteamUnifiedMessages_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_DEPRECATED_GetISteamUnifiedMessages_t g_bd_flat_SteamClient017_DEPRECATED_GetISteamUnifiedMessages;
#define BD_SLOT_SteamClient017_GetISteamController 25
typedef void * (*BDFlatFn_SteamClient017_GetISteamController_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamController_t g_bd_flat_SteamClient017_GetISteamController;
#define BD_SLOT_SteamClient017_GetISteamUGC 26
typedef void * (*BDFlatFn_SteamClient017_GetISteamUGC_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamUGC_t g_bd_flat_SteamClient017_GetISteamUGC;
#define BD_SLOT_SteamClient017_GetISteamAppList 27
typedef void * (*BDFlatFn_SteamClient017_GetISteamAppList_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamAppList_t g_bd_flat_SteamClient017_GetISteamAppList;
#define BD_SLOT_SteamClient017_GetISteamMusic 28
typedef void * (*BDFlatFn_SteamClient017_GetISteamMusic_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamMusic_t g_bd_flat_SteamClient017_GetISteamMusic;
#define BD_SLOT_SteamClient017_GetISteamMusicRemote 29
typedef void * (*BDFlatFn_SteamClient017_GetISteamMusicRemote_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamMusicRemote_t g_bd_flat_SteamClient017_GetISteamMusicRemote;
#define BD_SLOT_SteamClient017_GetISteamHTMLSurface 30
typedef void * (*BDFlatFn_SteamClient017_GetISteamHTMLSurface_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamHTMLSurface_t g_bd_flat_SteamClient017_GetISteamHTMLSurface;
#define BD_SLOT_SteamClient017_GetISteamInventory 34
typedef void * (*BDFlatFn_SteamClient017_GetISteamInventory_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamInventory_t g_bd_flat_SteamClient017_GetISteamInventory;
#define BD_SLOT_SteamClient017_GetISteamVideo 35
typedef void * (*BDFlatFn_SteamClient017_GetISteamVideo_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamVideo_t g_bd_flat_SteamClient017_GetISteamVideo;
#define BD_SLOT_SteamClient017_GetISteamParentalSettings 36
typedef void * (*BDFlatFn_SteamClient017_GetISteamParentalSettings_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamParentalSettings_t g_bd_flat_SteamClient017_GetISteamParentalSettings;
#define BD_SLOT_SteamUser019_GetHSteamUser 0
typedef int32_t (*BDFlatFn_SteamUser019_GetHSteamUser_t)(void *);
static BDFlatFn_SteamUser019_GetHSteamUser_t g_bd_flat_SteamUser019_GetHSteamUser;
#define BD_SLOT_SteamUser019_BLoggedOn 1
typedef int (*BDFlatFn_SteamUser019_BLoggedOn_t)(void *);
static BDFlatFn_SteamUser019_BLoggedOn_t g_bd_flat_SteamUser019_BLoggedOn;
#define BD_SLOT_SteamUser019_GetSteamID 2
typedef uint64_t (*BDFlatFn_SteamUser019_GetSteamID_t)(void *);
static BDFlatFn_SteamUser019_GetSteamID_t g_bd_flat_SteamUser019_GetSteamID;
#define BD_SLOT_SteamFriends015_GetPersonaName 0
typedef const char * (*BDFlatFn_SteamFriends015_GetPersonaName_t)(void *);
static BDFlatFn_SteamFriends015_GetPersonaName_t g_bd_flat_SteamFriends015_GetPersonaName;
#define BD_SLOT_SteamFriends015_GetPersonaState 2
typedef uint32_t (*BDFlatFn_SteamFriends015_GetPersonaState_t)(void *);
static BDFlatFn_SteamFriends015_GetPersonaState_t g_bd_flat_SteamFriends015_GetPersonaState;
#define BD_SLOT_SteamFriends015_GetFriendPersonaName 7
typedef const char * (*BDFlatFn_SteamFriends015_GetFriendPersonaName_t)(void *, uint64_t);
static BDFlatFn_SteamFriends015_GetFriendPersonaName_t g_bd_flat_SteamFriends015_GetFriendPersonaName;
#define BD_SLOT_SteamUtils008_GetSecondsSinceAppActive 0
typedef uint32_t (*BDFlatFn_SteamUtils008_GetSecondsSinceAppActive_t)(void *);
static BDFlatFn_SteamUtils008_GetSecondsSinceAppActive_t g_bd_flat_SteamUtils008_GetSecondsSinceAppActive;
#define BD_SLOT_SteamUtils008_GetSecondsSinceComputerActive 1
typedef uint32_t (*BDFlatFn_SteamUtils008_GetSecondsSinceComputerActive_t)(void *);
static BDFlatFn_SteamUtils008_GetSecondsSinceComputerActive_t g_bd_flat_SteamUtils008_GetSecondsSinceComputerActive;
#define BD_SLOT_SteamUtils008_GetConnectedUniverse 2
typedef uint32_t (*BDFlatFn_SteamUtils008_GetConnectedUniverse_t)(void *);
static BDFlatFn_SteamUtils008_GetConnectedUniverse_t g_bd_flat_SteamUtils008_GetConnectedUniverse;
#define BD_SLOT_SteamUtils008_GetServerRealTime 3
typedef uint32_t (*BDFlatFn_SteamUtils008_GetServerRealTime_t)(void *);
static BDFlatFn_SteamUtils008_GetServerRealTime_t g_bd_flat_SteamUtils008_GetServerRealTime;
#define BD_SLOT_SteamUtils008_GetIPCountry 4
typedef const char * (*BDFlatFn_SteamUtils008_GetIPCountry_t)(void *);
static BDFlatFn_SteamUtils008_GetIPCountry_t g_bd_flat_SteamUtils008_GetIPCountry;
#define BD_SLOT_SteamUtils008_GetCurrentBatteryPower 8
typedef uint32_t (*BDFlatFn_SteamUtils008_GetCurrentBatteryPower_t)(void *);
static BDFlatFn_SteamUtils008_GetCurrentBatteryPower_t g_bd_flat_SteamUtils008_GetCurrentBatteryPower;
#define BD_SLOT_SteamUtils008_GetAppID 9
typedef uint32_t (*BDFlatFn_SteamUtils008_GetAppID_t)(void *);
static BDFlatFn_SteamUtils008_GetAppID_t g_bd_flat_SteamUtils008_GetAppID;
#define BD_SLOT_SteamUtils008_IsOverlayEnabled 17
typedef int (*BDFlatFn_SteamUtils008_IsOverlayEnabled_t)(void *);
static BDFlatFn_SteamUtils008_IsOverlayEnabled_t g_bd_flat_SteamUtils008_IsOverlayEnabled;
#define BD_SLOT_SteamUtils008_GetSteamUILanguage 23
typedef const char * (*BDFlatFn_SteamUtils008_GetSteamUILanguage_t)(void *);
static BDFlatFn_SteamUtils008_GetSteamUILanguage_t g_bd_flat_SteamUtils008_GetSteamUILanguage;
#define BD_SLOT_SteamUtils008_IsSteamRunningInVR 24
typedef int (*BDFlatFn_SteamUtils008_IsSteamRunningInVR_t)(void *);
static BDFlatFn_SteamUtils008_IsSteamRunningInVR_t g_bd_flat_SteamUtils008_IsSteamRunningInVR;
#define BD_SLOT_SteamUtils008_IsSteamInBigPictureMode 26
typedef int (*BDFlatFn_SteamUtils008_IsSteamInBigPictureMode_t)(void *);
static BDFlatFn_SteamUtils008_IsSteamInBigPictureMode_t g_bd_flat_SteamUtils008_IsSteamInBigPictureMode;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribed 0
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribed_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribed_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribed;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsLowViolence 1
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsLowViolence_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsLowViolence_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsLowViolence;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsCybercafe 2
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsCybercafe_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsCybercafe_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsCybercafe;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsVACBanned 3
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsVACBanned_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsVACBanned_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsVACBanned;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_GetCurrentGameLanguage 4
typedef const char * (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetCurrentGameLanguage_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetCurrentGameLanguage_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetCurrentGameLanguage;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_GetAvailableGameLanguages 5
typedef const char * (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetAvailableGameLanguages_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetAvailableGameLanguages_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetAvailableGameLanguages;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedApp 6
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedApp_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedApp_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedApp;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsDlcInstalled 7
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsDlcInstalled_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsDlcInstalled_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsDlcInstalled;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_GetEarliestPurchaseUnixTime 8
typedef uint32_t (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetEarliestPurchaseUnixTime_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetEarliestPurchaseUnixTime_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetEarliestPurchaseUnixTime;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedFromFreeWeekend 9
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedFromFreeWeekend_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedFromFreeWeekend_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedFromFreeWeekend;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_GetDLCCount 10
typedef int32_t (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetDLCCount_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetDLCCount_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetDLCCount;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsAppInstalled 19
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsAppInstalled_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsAppInstalled_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsAppInstalled;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_GetAppOwner 20
typedef uint64_t (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetAppOwner_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetAppOwner_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetAppOwner;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_GetAppBuildId 23
typedef int32_t (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetAppBuildId_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetAppBuildId_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetAppBuildId;
#define BD_SLOT_SteamClient014_CreateSteamPipe 0
typedef int32_t (*BDFlatFn_SteamClient014_CreateSteamPipe_t)(void *);
static BDFlatFn_SteamClient014_CreateSteamPipe_t g_bd_flat_SteamClient014_CreateSteamPipe;
#define BD_SLOT_SteamClient014_BReleaseSteamPipe 1
typedef int (*BDFlatFn_SteamClient014_BReleaseSteamPipe_t)(void *, int32_t);
static BDFlatFn_SteamClient014_BReleaseSteamPipe_t g_bd_flat_SteamClient014_BReleaseSteamPipe;
#define BD_SLOT_SteamClient014_ConnectToGlobalUser 2
typedef int32_t (*BDFlatFn_SteamClient014_ConnectToGlobalUser_t)(void *, int32_t);
static BDFlatFn_SteamClient014_ConnectToGlobalUser_t g_bd_flat_SteamClient014_ConnectToGlobalUser;
#define BD_SLOT_SteamClient014_CreateLocalUser 3
typedef int32_t (*BDFlatFn_SteamClient014_CreateLocalUser_t)(void *, int32_t *, uint32_t);
static BDFlatFn_SteamClient014_CreateLocalUser_t g_bd_flat_SteamClient014_CreateLocalUser;
#define BD_SLOT_SteamClient014_ReleaseUser 4
typedef void (*BDFlatFn_SteamClient014_ReleaseUser_t)(void *, int32_t, int32_t);
static BDFlatFn_SteamClient014_ReleaseUser_t g_bd_flat_SteamClient014_ReleaseUser;
#define BD_SLOT_SteamClient014_GetISteamUser 5
typedef void * (*BDFlatFn_SteamClient014_GetISteamUser_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamUser_t g_bd_flat_SteamClient014_GetISteamUser;
#define BD_SLOT_SteamClient014_GetISteamGameServer 6
typedef void * (*BDFlatFn_SteamClient014_GetISteamGameServer_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamGameServer_t g_bd_flat_SteamClient014_GetISteamGameServer;
#define BD_SLOT_SteamClient014_GetISteamFriends 8
typedef void * (*BDFlatFn_SteamClient014_GetISteamFriends_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamFriends_t g_bd_flat_SteamClient014_GetISteamFriends;
#define BD_SLOT_SteamClient014_GetISteamUtils 9
typedef void * (*BDFlatFn_SteamClient014_GetISteamUtils_t)(void *, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamUtils_t g_bd_flat_SteamClient014_GetISteamUtils;
#define BD_SLOT_SteamClient014_GetISteamMatchmaking 10
typedef void * (*BDFlatFn_SteamClient014_GetISteamMatchmaking_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamMatchmaking_t g_bd_flat_SteamClient014_GetISteamMatchmaking;
#define BD_SLOT_SteamClient014_GetISteamMatchmakingServers 11
typedef void * (*BDFlatFn_SteamClient014_GetISteamMatchmakingServers_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamMatchmakingServers_t g_bd_flat_SteamClient014_GetISteamMatchmakingServers;
#define BD_SLOT_SteamClient014_GetISteamGenericInterface 12
typedef void * (*BDFlatFn_SteamClient014_GetISteamGenericInterface_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamGenericInterface_t g_bd_flat_SteamClient014_GetISteamGenericInterface;
#define BD_SLOT_SteamClient014_GetISteamUserStats 13
typedef void * (*BDFlatFn_SteamClient014_GetISteamUserStats_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamUserStats_t g_bd_flat_SteamClient014_GetISteamUserStats;
#define BD_SLOT_SteamClient014_GetISteamGameServerStats 14
typedef void * (*BDFlatFn_SteamClient014_GetISteamGameServerStats_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamGameServerStats_t g_bd_flat_SteamClient014_GetISteamGameServerStats;
#define BD_SLOT_SteamClient014_GetISteamApps 15
typedef void * (*BDFlatFn_SteamClient014_GetISteamApps_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamApps_t g_bd_flat_SteamClient014_GetISteamApps;
#define BD_SLOT_SteamClient014_GetISteamNetworking 16
typedef void * (*BDFlatFn_SteamClient014_GetISteamNetworking_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamNetworking_t g_bd_flat_SteamClient014_GetISteamNetworking;
#define BD_SLOT_SteamClient014_GetISteamRemoteStorage 17
typedef void * (*BDFlatFn_SteamClient014_GetISteamRemoteStorage_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamRemoteStorage_t g_bd_flat_SteamClient014_GetISteamRemoteStorage;
#define BD_SLOT_SteamClient014_GetISteamScreenshots 18
typedef void * (*BDFlatFn_SteamClient014_GetISteamScreenshots_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamScreenshots_t g_bd_flat_SteamClient014_GetISteamScreenshots;
#define BD_SLOT_SteamClient014_RunFrame 19
typedef void (*BDFlatFn_SteamClient014_RunFrame_t)(void *);
static BDFlatFn_SteamClient014_RunFrame_t g_bd_flat_SteamClient014_RunFrame;
#define BD_SLOT_SteamClient014_GetIPCCallCount 20
typedef uint32_t (*BDFlatFn_SteamClient014_GetIPCCallCount_t)(void *);
static BDFlatFn_SteamClient014_GetIPCCallCount_t g_bd_flat_SteamClient014_GetIPCCallCount;
#define BD_SLOT_SteamClient014_BShutdownIfAllPipesClosed 22
typedef int (*BDFlatFn_SteamClient014_BShutdownIfAllPipesClosed_t)(void *);
static BDFlatFn_SteamClient014_BShutdownIfAllPipesClosed_t g_bd_flat_SteamClient014_BShutdownIfAllPipesClosed;
#define BD_SLOT_SteamClient014_GetISteamHTTP 23
typedef void * (*BDFlatFn_SteamClient014_GetISteamHTTP_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamHTTP_t g_bd_flat_SteamClient014_GetISteamHTTP;
#define BD_SLOT_SteamClient014_GetISteamUnifiedMessages 24
typedef void * (*BDFlatFn_SteamClient014_GetISteamUnifiedMessages_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamUnifiedMessages_t g_bd_flat_SteamClient014_GetISteamUnifiedMessages;
#define BD_SLOT_SteamClient014_GetISteamController 25
typedef void * (*BDFlatFn_SteamClient014_GetISteamController_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamController_t g_bd_flat_SteamClient014_GetISteamController;
#define BD_SLOT_SteamClient014_GetISteamUGC 26
typedef void * (*BDFlatFn_SteamClient014_GetISteamUGC_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamUGC_t g_bd_flat_SteamClient014_GetISteamUGC;
#define BD_SLOT_SteamClient014_GetISteamAppList 27
typedef void * (*BDFlatFn_SteamClient014_GetISteamAppList_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamAppList_t g_bd_flat_SteamClient014_GetISteamAppList;
#define BD_SLOT_SteamClient014_GetISteamMusic 28
typedef void * (*BDFlatFn_SteamClient014_GetISteamMusic_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamMusic_t g_bd_flat_SteamClient014_GetISteamMusic;
#define BD_SLOT_SteamNetworking006_SendP2PPacket 0
typedef int (*BDFlatFn_SteamNetworking006_SendP2PPacket_t)(void *, uint64_t, const void *, uint32_t, uint32_t, int32_t);
static BDFlatFn_SteamNetworking006_SendP2PPacket_t g_bd_flat_SteamNetworking006_SendP2PPacket;
#define BD_SLOT_SteamNetworking006_IsP2PPacketAvailable 1
typedef int (*BDFlatFn_SteamNetworking006_IsP2PPacketAvailable_t)(void *, uint32_t *, int32_t);
static BDFlatFn_SteamNetworking006_IsP2PPacketAvailable_t g_bd_flat_SteamNetworking006_IsP2PPacketAvailable;
#define BD_SLOT_SteamNetworking006_ReadP2PPacket 2
typedef int (*BDFlatFn_SteamNetworking006_ReadP2PPacket_t)(void *, void *, uint32_t, uint32_t *, uint64_t *, int32_t);
static BDFlatFn_SteamNetworking006_ReadP2PPacket_t g_bd_flat_SteamNetworking006_ReadP2PPacket;
#define BD_SLOT_SteamNetworking006_AcceptP2PSessionWithUser 3
typedef int (*BDFlatFn_SteamNetworking006_AcceptP2PSessionWithUser_t)(void *, uint64_t);
static BDFlatFn_SteamNetworking006_AcceptP2PSessionWithUser_t g_bd_flat_SteamNetworking006_AcceptP2PSessionWithUser;
#define BD_SLOT_SteamNetworking006_CloseP2PSessionWithUser 4
typedef int (*BDFlatFn_SteamNetworking006_CloseP2PSessionWithUser_t)(void *, uint64_t);
static BDFlatFn_SteamNetworking006_CloseP2PSessionWithUser_t g_bd_flat_SteamNetworking006_CloseP2PSessionWithUser;
#define BD_SLOT_SteamNetworking006_CloseP2PChannelWithUser 5
typedef int (*BDFlatFn_SteamNetworking006_CloseP2PChannelWithUser_t)(void *, uint64_t, int32_t);
static BDFlatFn_SteamNetworking006_CloseP2PChannelWithUser_t g_bd_flat_SteamNetworking006_CloseP2PChannelWithUser;
#define BD_SLOT_SteamNetworking006_GetP2PSessionState 6
typedef int (*BDFlatFn_SteamNetworking006_GetP2PSessionState_t)(void *, uint64_t, void *);
static BDFlatFn_SteamNetworking006_GetP2PSessionState_t g_bd_flat_SteamNetworking006_GetP2PSessionState;
#define BD_SLOT_SteamNetworking006_AllowP2PPacketRelay 7
typedef int (*BDFlatFn_SteamNetworking006_AllowP2PPacketRelay_t)(void *, int);
static BDFlatFn_SteamNetworking006_AllowP2PPacketRelay_t g_bd_flat_SteamNetworking006_AllowP2PPacketRelay;
#define BD_SLOT_SteamNetworking006_CreateP2PConnectionSocket 9
typedef uint32_t (*BDFlatFn_SteamNetworking006_CreateP2PConnectionSocket_t)(void *, uint64_t, int32_t, int32_t, int);
static BDFlatFn_SteamNetworking006_CreateP2PConnectionSocket_t g_bd_flat_SteamNetworking006_CreateP2PConnectionSocket;
#define BD_SLOT_SteamNetworking006_DestroySocket 11
typedef int (*BDFlatFn_SteamNetworking006_DestroySocket_t)(void *, uint32_t, int);
static BDFlatFn_SteamNetworking006_DestroySocket_t g_bd_flat_SteamNetworking006_DestroySocket;
#define BD_SLOT_SteamNetworking006_DestroyListenSocket 12
typedef int (*BDFlatFn_SteamNetworking006_DestroyListenSocket_t)(void *, uint32_t, int);
static BDFlatFn_SteamNetworking006_DestroyListenSocket_t g_bd_flat_SteamNetworking006_DestroyListenSocket;
#define BD_SLOT_SteamNetworking006_SendDataOnSocket 13
typedef int (*BDFlatFn_SteamNetworking006_SendDataOnSocket_t)(void *, uint32_t, const void *, uint32_t, int);
static BDFlatFn_SteamNetworking006_SendDataOnSocket_t g_bd_flat_SteamNetworking006_SendDataOnSocket;
#define BD_SLOT_SteamNetworking006_IsDataAvailableOnSocket 14
typedef int (*BDFlatFn_SteamNetworking006_IsDataAvailableOnSocket_t)(void *, uint32_t, uint32_t *);
static BDFlatFn_SteamNetworking006_IsDataAvailableOnSocket_t g_bd_flat_SteamNetworking006_IsDataAvailableOnSocket;
#define BD_SLOT_SteamNetworking006_RetrieveDataFromSocket 15
typedef int (*BDFlatFn_SteamNetworking006_RetrieveDataFromSocket_t)(void *, uint32_t, void *, uint32_t, uint32_t *);
static BDFlatFn_SteamNetworking006_RetrieveDataFromSocket_t g_bd_flat_SteamNetworking006_RetrieveDataFromSocket;
#define BD_SLOT_SteamNetworking006_IsDataAvailable 16
typedef int (*BDFlatFn_SteamNetworking006_IsDataAvailable_t)(void *, uint32_t, uint32_t *, uint32_t *);
static BDFlatFn_SteamNetworking006_IsDataAvailable_t g_bd_flat_SteamNetworking006_IsDataAvailable;
#define BD_SLOT_SteamNetworking006_RetrieveData 17
typedef int (*BDFlatFn_SteamNetworking006_RetrieveData_t)(void *, uint32_t, void *, uint32_t, uint32_t *, uint32_t *);
static BDFlatFn_SteamNetworking006_RetrieveData_t g_bd_flat_SteamNetworking006_RetrieveData;
#define BD_SLOT_SteamNetworking006_GetSocketConnectionType 20
typedef uint32_t (*BDFlatFn_SteamNetworking006_GetSocketConnectionType_t)(void *, uint32_t);
static BDFlatFn_SteamNetworking006_GetSocketConnectionType_t g_bd_flat_SteamNetworking006_GetSocketConnectionType;
#define BD_SLOT_SteamNetworking006_GetMaxPacketSize 21
typedef int32_t (*BDFlatFn_SteamNetworking006_GetMaxPacketSize_t)(void *, uint32_t);
static BDFlatFn_SteamNetworking006_GetMaxPacketSize_t g_bd_flat_SteamNetworking006_GetMaxPacketSize;
#define BD_SLOT_SteamClient020_CreateSteamPipe 0
typedef int32_t (*BDFlatFn_SteamClient020_CreateSteamPipe_t)(void *);
static BDFlatFn_SteamClient020_CreateSteamPipe_t g_bd_flat_SteamClient020_CreateSteamPipe;
#define BD_SLOT_SteamClient020_BReleaseSteamPipe 1
typedef int (*BDFlatFn_SteamClient020_BReleaseSteamPipe_t)(void *, int32_t);
static BDFlatFn_SteamClient020_BReleaseSteamPipe_t g_bd_flat_SteamClient020_BReleaseSteamPipe;
#define BD_SLOT_SteamClient020_ConnectToGlobalUser 2
typedef int32_t (*BDFlatFn_SteamClient020_ConnectToGlobalUser_t)(void *, int32_t);
static BDFlatFn_SteamClient020_ConnectToGlobalUser_t g_bd_flat_SteamClient020_ConnectToGlobalUser;
#define BD_SLOT_SteamClient020_CreateLocalUser 3
typedef int32_t (*BDFlatFn_SteamClient020_CreateLocalUser_t)(void *, int32_t *, uint32_t);
static BDFlatFn_SteamClient020_CreateLocalUser_t g_bd_flat_SteamClient020_CreateLocalUser;
#define BD_SLOT_SteamClient020_ReleaseUser 4
typedef void (*BDFlatFn_SteamClient020_ReleaseUser_t)(void *, int32_t, int32_t);
static BDFlatFn_SteamClient020_ReleaseUser_t g_bd_flat_SteamClient020_ReleaseUser;
#define BD_SLOT_SteamClient020_GetISteamUser 5
typedef void * (*BDFlatFn_SteamClient020_GetISteamUser_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamUser_t g_bd_flat_SteamClient020_GetISteamUser;
#define BD_SLOT_SteamClient020_GetISteamGameServer 6
typedef void * (*BDFlatFn_SteamClient020_GetISteamGameServer_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamGameServer_t g_bd_flat_SteamClient020_GetISteamGameServer;
#define BD_SLOT_SteamClient020_GetISteamFriends 8
typedef void * (*BDFlatFn_SteamClient020_GetISteamFriends_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamFriends_t g_bd_flat_SteamClient020_GetISteamFriends;
#define BD_SLOT_SteamClient020_GetISteamUtils 9
typedef void * (*BDFlatFn_SteamClient020_GetISteamUtils_t)(void *, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamUtils_t g_bd_flat_SteamClient020_GetISteamUtils;
#define BD_SLOT_SteamClient020_GetISteamMatchmaking 10
typedef void * (*BDFlatFn_SteamClient020_GetISteamMatchmaking_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamMatchmaking_t g_bd_flat_SteamClient020_GetISteamMatchmaking;
#define BD_SLOT_SteamClient020_GetISteamMatchmakingServers 11
typedef void * (*BDFlatFn_SteamClient020_GetISteamMatchmakingServers_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamMatchmakingServers_t g_bd_flat_SteamClient020_GetISteamMatchmakingServers;
#define BD_SLOT_SteamClient020_GetISteamGenericInterface 12
typedef void * (*BDFlatFn_SteamClient020_GetISteamGenericInterface_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamGenericInterface_t g_bd_flat_SteamClient020_GetISteamGenericInterface;
#define BD_SLOT_SteamClient020_GetISteamUserStats 13
typedef void * (*BDFlatFn_SteamClient020_GetISteamUserStats_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamUserStats_t g_bd_flat_SteamClient020_GetISteamUserStats;
#define BD_SLOT_SteamClient020_GetISteamGameServerStats 14
typedef void * (*BDFlatFn_SteamClient020_GetISteamGameServerStats_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamGameServerStats_t g_bd_flat_SteamClient020_GetISteamGameServerStats;
#define BD_SLOT_SteamClient020_GetISteamApps 15
typedef void * (*BDFlatFn_SteamClient020_GetISteamApps_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamApps_t g_bd_flat_SteamClient020_GetISteamApps;
#define BD_SLOT_SteamClient020_GetISteamNetworking 16
typedef void * (*BDFlatFn_SteamClient020_GetISteamNetworking_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamNetworking_t g_bd_flat_SteamClient020_GetISteamNetworking;
#define BD_SLOT_SteamClient020_GetISteamRemoteStorage 17
typedef void * (*BDFlatFn_SteamClient020_GetISteamRemoteStorage_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamRemoteStorage_t g_bd_flat_SteamClient020_GetISteamRemoteStorage;
#define BD_SLOT_SteamClient020_GetISteamScreenshots 18
typedef void * (*BDFlatFn_SteamClient020_GetISteamScreenshots_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamScreenshots_t g_bd_flat_SteamClient020_GetISteamScreenshots;
#define BD_SLOT_SteamClient020_RunFrame 20
typedef void (*BDFlatFn_SteamClient020_RunFrame_t)(void *);
static BDFlatFn_SteamClient020_RunFrame_t g_bd_flat_SteamClient020_RunFrame;
#define BD_SLOT_SteamClient020_GetIPCCallCount 21
typedef uint32_t (*BDFlatFn_SteamClient020_GetIPCCallCount_t)(void *);
static BDFlatFn_SteamClient020_GetIPCCallCount_t g_bd_flat_SteamClient020_GetIPCCallCount;
#define BD_SLOT_SteamClient020_BShutdownIfAllPipesClosed 23
typedef int (*BDFlatFn_SteamClient020_BShutdownIfAllPipesClosed_t)(void *);
static BDFlatFn_SteamClient020_BShutdownIfAllPipesClosed_t g_bd_flat_SteamClient020_BShutdownIfAllPipesClosed;
#define BD_SLOT_SteamClient020_GetISteamHTTP 24
typedef void * (*BDFlatFn_SteamClient020_GetISteamHTTP_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamHTTP_t g_bd_flat_SteamClient020_GetISteamHTTP;
#define BD_SLOT_SteamClient020_DEPRECATED_GetISteamUnifiedMessages 25
typedef void * (*BDFlatFn_SteamClient020_DEPRECATED_GetISteamUnifiedMessages_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_DEPRECATED_GetISteamUnifiedMessages_t g_bd_flat_SteamClient020_DEPRECATED_GetISteamUnifiedMessages;
#define BD_SLOT_SteamClient020_GetISteamController 26
typedef void * (*BDFlatFn_SteamClient020_GetISteamController_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamController_t g_bd_flat_SteamClient020_GetISteamController;
#define BD_SLOT_SteamClient020_GetISteamUGC 27
typedef void * (*BDFlatFn_SteamClient020_GetISteamUGC_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamUGC_t g_bd_flat_SteamClient020_GetISteamUGC;
#define BD_SLOT_SteamClient020_GetISteamAppList 28
typedef void * (*BDFlatFn_SteamClient020_GetISteamAppList_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamAppList_t g_bd_flat_SteamClient020_GetISteamAppList;
#define BD_SLOT_SteamClient020_GetISteamMusic 29
typedef void * (*BDFlatFn_SteamClient020_GetISteamMusic_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamMusic_t g_bd_flat_SteamClient020_GetISteamMusic;
#define BD_SLOT_SteamClient020_GetISteamMusicRemote 30
typedef void * (*BDFlatFn_SteamClient020_GetISteamMusicRemote_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamMusicRemote_t g_bd_flat_SteamClient020_GetISteamMusicRemote;
#define BD_SLOT_SteamClient020_GetISteamHTMLSurface 31
typedef void * (*BDFlatFn_SteamClient020_GetISteamHTMLSurface_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamHTMLSurface_t g_bd_flat_SteamClient020_GetISteamHTMLSurface;
#define BD_SLOT_SteamClient020_GetISteamInventory 35
typedef void * (*BDFlatFn_SteamClient020_GetISteamInventory_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamInventory_t g_bd_flat_SteamClient020_GetISteamInventory;
#define BD_SLOT_SteamClient020_GetISteamVideo 36
typedef void * (*BDFlatFn_SteamClient020_GetISteamVideo_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamVideo_t g_bd_flat_SteamClient020_GetISteamVideo;
#define BD_SLOT_SteamClient020_GetISteamParentalSettings 37
typedef void * (*BDFlatFn_SteamClient020_GetISteamParentalSettings_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamParentalSettings_t g_bd_flat_SteamClient020_GetISteamParentalSettings;
#define BD_SLOT_SteamClient021_CreateSteamPipe 0
typedef int32_t (*BDFlatFn_SteamClient021_CreateSteamPipe_t)(void *);
static BDFlatFn_SteamClient021_CreateSteamPipe_t g_bd_flat_SteamClient021_CreateSteamPipe;
#define BD_SLOT_SteamClient021_BReleaseSteamPipe 1
typedef int (*BDFlatFn_SteamClient021_BReleaseSteamPipe_t)(void *, int32_t);
static BDFlatFn_SteamClient021_BReleaseSteamPipe_t g_bd_flat_SteamClient021_BReleaseSteamPipe;
#define BD_SLOT_SteamClient021_ConnectToGlobalUser 2
typedef int32_t (*BDFlatFn_SteamClient021_ConnectToGlobalUser_t)(void *, int32_t);
static BDFlatFn_SteamClient021_ConnectToGlobalUser_t g_bd_flat_SteamClient021_ConnectToGlobalUser;
#define BD_SLOT_SteamClient021_CreateLocalUser 3
typedef int32_t (*BDFlatFn_SteamClient021_CreateLocalUser_t)(void *, int32_t *, uint32_t);
static BDFlatFn_SteamClient021_CreateLocalUser_t g_bd_flat_SteamClient021_CreateLocalUser;
#define BD_SLOT_SteamClient021_ReleaseUser 4
typedef void (*BDFlatFn_SteamClient021_ReleaseUser_t)(void *, int32_t, int32_t);
static BDFlatFn_SteamClient021_ReleaseUser_t g_bd_flat_SteamClient021_ReleaseUser;
#define BD_SLOT_SteamClient021_GetISteamUser 5
typedef void * (*BDFlatFn_SteamClient021_GetISteamUser_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamUser_t g_bd_flat_SteamClient021_GetISteamUser;
#define BD_SLOT_SteamClient021_GetISteamGameServer 6
typedef void * (*BDFlatFn_SteamClient021_GetISteamGameServer_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamGameServer_t g_bd_flat_SteamClient021_GetISteamGameServer;
#define BD_SLOT_SteamClient021_GetISteamFriends 8
typedef void * (*BDFlatFn_SteamClient021_GetISteamFriends_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamFriends_t g_bd_flat_SteamClient021_GetISteamFriends;
#define BD_SLOT_SteamClient021_GetISteamUtils 9
typedef void * (*BDFlatFn_SteamClient021_GetISteamUtils_t)(void *, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamUtils_t g_bd_flat_SteamClient021_GetISteamUtils;
#define BD_SLOT_SteamClient021_GetISteamMatchmaking 10
typedef void * (*BDFlatFn_SteamClient021_GetISteamMatchmaking_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamMatchmaking_t g_bd_flat_SteamClient021_GetISteamMatchmaking;
#define BD_SLOT_SteamClient021_GetISteamMatchmakingServers 11
typedef void * (*BDFlatFn_SteamClient021_GetISteamMatchmakingServers_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamMatchmakingServers_t g_bd_flat_SteamClient021_GetISteamMatchmakingServers;
#define BD_SLOT_SteamClient021_GetISteamGenericInterface 12
typedef void * (*BDFlatFn_SteamClient021_GetISteamGenericInterface_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamGenericInterface_t g_bd_flat_SteamClient021_GetISteamGenericInterface;
#define BD_SLOT_SteamClient021_GetISteamUserStats 13
typedef void * (*BDFlatFn_SteamClient021_GetISteamUserStats_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamUserStats_t g_bd_flat_SteamClient021_GetISteamUserStats;
#define BD_SLOT_SteamClient021_GetISteamGameServerStats 14
typedef void * (*BDFlatFn_SteamClient021_GetISteamGameServerStats_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamGameServerStats_t g_bd_flat_SteamClient021_GetISteamGameServerStats;
#define BD_SLOT_SteamClient021_GetISteamApps 15
typedef void * (*BDFlatFn_SteamClient021_GetISteamApps_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamApps_t g_bd_flat_SteamClient021_GetISteamApps;
#define BD_SLOT_SteamClient021_GetISteamNetworking 16
typedef void * (*BDFlatFn_SteamClient021_GetISteamNetworking_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamNetworking_t g_bd_flat_SteamClient021_GetISteamNetworking;
#define BD_SLOT_SteamClient021_GetISteamRemoteStorage 17
typedef void * (*BDFlatFn_SteamClient021_GetISteamRemoteStorage_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamRemoteStorage_t g_bd_flat_SteamClient021_GetISteamRemoteStorage;
#define BD_SLOT_SteamClient021_GetISteamScreenshots 18
typedef void * (*BDFlatFn_SteamClient021_GetISteamScreenshots_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamScreenshots_t g_bd_flat_SteamClient021_GetISteamScreenshots;
#define BD_SLOT_SteamClient021_RunFrame 20
typedef void (*BDFlatFn_SteamClient021_RunFrame_t)(void *);
static BDFlatFn_SteamClient021_RunFrame_t g_bd_flat_SteamClient021_RunFrame;
#define BD_SLOT_SteamClient021_GetIPCCallCount 21
typedef uint32_t (*BDFlatFn_SteamClient021_GetIPCCallCount_t)(void *);
static BDFlatFn_SteamClient021_GetIPCCallCount_t g_bd_flat_SteamClient021_GetIPCCallCount;
#define BD_SLOT_SteamClient021_BShutdownIfAllPipesClosed 23
typedef int (*BDFlatFn_SteamClient021_BShutdownIfAllPipesClosed_t)(void *);
static BDFlatFn_SteamClient021_BShutdownIfAllPipesClosed_t g_bd_flat_SteamClient021_BShutdownIfAllPipesClosed;
#define BD_SLOT_SteamClient021_GetISteamHTTP 24
typedef void * (*BDFlatFn_SteamClient021_GetISteamHTTP_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamHTTP_t g_bd_flat_SteamClient021_GetISteamHTTP;
#define BD_SLOT_SteamClient021_GetISteamController 25
typedef void * (*BDFlatFn_SteamClient021_GetISteamController_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamController_t g_bd_flat_SteamClient021_GetISteamController;
#define BD_SLOT_SteamClient021_GetISteamUGC 26
typedef void * (*BDFlatFn_SteamClient021_GetISteamUGC_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamUGC_t g_bd_flat_SteamClient021_GetISteamUGC;
#define BD_SLOT_SteamClient021_GetISteamMusic 27
typedef void * (*BDFlatFn_SteamClient021_GetISteamMusic_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamMusic_t g_bd_flat_SteamClient021_GetISteamMusic;
#define BD_SLOT_SteamClient021_GetISteamMusicRemote 28
typedef void * (*BDFlatFn_SteamClient021_GetISteamMusicRemote_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamMusicRemote_t g_bd_flat_SteamClient021_GetISteamMusicRemote;
#define BD_SLOT_SteamClient021_GetISteamHTMLSurface 29
typedef void * (*BDFlatFn_SteamClient021_GetISteamHTMLSurface_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamHTMLSurface_t g_bd_flat_SteamClient021_GetISteamHTMLSurface;
#define BD_SLOT_SteamClient021_GetISteamInventory 33
typedef void * (*BDFlatFn_SteamClient021_GetISteamInventory_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamInventory_t g_bd_flat_SteamClient021_GetISteamInventory;
#define BD_SLOT_SteamClient021_GetISteamVideo 34
typedef void * (*BDFlatFn_SteamClient021_GetISteamVideo_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamVideo_t g_bd_flat_SteamClient021_GetISteamVideo;
#define BD_SLOT_SteamClient021_GetISteamParentalSettings 35
typedef void * (*BDFlatFn_SteamClient021_GetISteamParentalSettings_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamParentalSettings_t g_bd_flat_SteamClient021_GetISteamParentalSettings;
#define BD_SLOT_SteamUser021_GetHSteamUser 0
typedef int32_t (*BDFlatFn_SteamUser021_GetHSteamUser_t)(void *);
static BDFlatFn_SteamUser021_GetHSteamUser_t g_bd_flat_SteamUser021_GetHSteamUser;
#define BD_SLOT_SteamUser021_BLoggedOn 1
typedef int (*BDFlatFn_SteamUser021_BLoggedOn_t)(void *);
static BDFlatFn_SteamUser021_BLoggedOn_t g_bd_flat_SteamUser021_BLoggedOn;
#define BD_SLOT_SteamUser021_GetSteamID 2
typedef uint64_t (*BDFlatFn_SteamUser021_GetSteamID_t)(void *);
static BDFlatFn_SteamUser021_GetSteamID_t g_bd_flat_SteamUser021_GetSteamID;
#define BD_SLOT_SteamUser021_GetAuthSessionTicket 13
typedef uint32_t (*BDFlatFn_SteamUser021_GetAuthSessionTicket_t)(void *, void *, int32_t, uint32_t *, const void *);
static BDFlatFn_SteamUser021_GetAuthSessionTicket_t g_bd_flat_SteamUser021_GetAuthSessionTicket;
#define BD_SLOT_SteamUser021_CancelAuthTicket 16
typedef void (*BDFlatFn_SteamUser021_CancelAuthTicket_t)(void *, uint32_t);
static BDFlatFn_SteamUser021_CancelAuthTicket_t g_bd_flat_SteamUser021_CancelAuthTicket;
#define BD_SLOT_SteamFriends017_GetPersonaName 0
typedef const char * (*BDFlatFn_SteamFriends017_GetPersonaName_t)(void *);
static BDFlatFn_SteamFriends017_GetPersonaName_t g_bd_flat_SteamFriends017_GetPersonaName;
#define BD_SLOT_SteamFriends017_GetPersonaState 2
typedef uint32_t (*BDFlatFn_SteamFriends017_GetPersonaState_t)(void *);
static BDFlatFn_SteamFriends017_GetPersonaState_t g_bd_flat_SteamFriends017_GetPersonaState;
#define BD_SLOT_SteamFriends017_GetFriendPersonaName 7
typedef const char * (*BDFlatFn_SteamFriends017_GetFriendPersonaName_t)(void *, uint64_t);
static BDFlatFn_SteamFriends017_GetFriendPersonaName_t g_bd_flat_SteamFriends017_GetFriendPersonaName;
#define BD_SLOT_SteamFriends017_ActivateGameOverlayInviteDialog 33
typedef void (*BDFlatFn_SteamFriends017_ActivateGameOverlayInviteDialog_t)(void *, uint64_t);
static BDFlatFn_SteamFriends017_ActivateGameOverlayInviteDialog_t g_bd_flat_SteamFriends017_ActivateGameOverlayInviteDialog;
#define BD_SLOT_SteamUtils010_GetSecondsSinceAppActive 0
typedef uint32_t (*BDFlatFn_SteamUtils010_GetSecondsSinceAppActive_t)(void *);
static BDFlatFn_SteamUtils010_GetSecondsSinceAppActive_t g_bd_flat_SteamUtils010_GetSecondsSinceAppActive;
#define BD_SLOT_SteamUtils010_GetSecondsSinceComputerActive 1
typedef uint32_t (*BDFlatFn_SteamUtils010_GetSecondsSinceComputerActive_t)(void *);
static BDFlatFn_SteamUtils010_GetSecondsSinceComputerActive_t g_bd_flat_SteamUtils010_GetSecondsSinceComputerActive;
#define BD_SLOT_SteamUtils010_GetConnectedUniverse 2
typedef uint32_t (*BDFlatFn_SteamUtils010_GetConnectedUniverse_t)(void *);
static BDFlatFn_SteamUtils010_GetConnectedUniverse_t g_bd_flat_SteamUtils010_GetConnectedUniverse;
#define BD_SLOT_SteamUtils010_GetServerRealTime 3
typedef uint32_t (*BDFlatFn_SteamUtils010_GetServerRealTime_t)(void *);
static BDFlatFn_SteamUtils010_GetServerRealTime_t g_bd_flat_SteamUtils010_GetServerRealTime;
#define BD_SLOT_SteamUtils010_GetIPCountry 4
typedef const char * (*BDFlatFn_SteamUtils010_GetIPCountry_t)(void *);
static BDFlatFn_SteamUtils010_GetIPCountry_t g_bd_flat_SteamUtils010_GetIPCountry;
#define BD_SLOT_SteamUtils010_GetCurrentBatteryPower 8
typedef uint32_t (*BDFlatFn_SteamUtils010_GetCurrentBatteryPower_t)(void *);
static BDFlatFn_SteamUtils010_GetCurrentBatteryPower_t g_bd_flat_SteamUtils010_GetCurrentBatteryPower;
#define BD_SLOT_SteamUtils010_GetAppID 9
typedef uint32_t (*BDFlatFn_SteamUtils010_GetAppID_t)(void *);
static BDFlatFn_SteamUtils010_GetAppID_t g_bd_flat_SteamUtils010_GetAppID;
#define BD_SLOT_SteamUtils010_IsOverlayEnabled 17
typedef int (*BDFlatFn_SteamUtils010_IsOverlayEnabled_t)(void *);
static BDFlatFn_SteamUtils010_IsOverlayEnabled_t g_bd_flat_SteamUtils010_IsOverlayEnabled;
#define BD_SLOT_SteamUtils010_GetSteamUILanguage 23
typedef const char * (*BDFlatFn_SteamUtils010_GetSteamUILanguage_t)(void *);
static BDFlatFn_SteamUtils010_GetSteamUILanguage_t g_bd_flat_SteamUtils010_GetSteamUILanguage;
#define BD_SLOT_SteamUtils010_IsSteamRunningInVR 24
typedef int (*BDFlatFn_SteamUtils010_IsSteamRunningInVR_t)(void *);
static BDFlatFn_SteamUtils010_IsSteamRunningInVR_t g_bd_flat_SteamUtils010_IsSteamRunningInVR;
#define BD_SLOT_SteamUtils010_IsSteamInBigPictureMode 26
typedef int (*BDFlatFn_SteamUtils010_IsSteamInBigPictureMode_t)(void *);
static BDFlatFn_SteamUtils010_IsSteamInBigPictureMode_t g_bd_flat_SteamUtils010_IsSteamInBigPictureMode;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2 1
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2_t)(void *, const char *, float *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat 2
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_t)(void *, const char *, int32_t *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2 3
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2_t)(void *, const char *, float);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat 4
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_t)(void *, const char *, int32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat 5
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat_t)(void *, const char *, float, double);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement 6
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement_t)(void *, const char *, int *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement 7
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement_t)(void *, const char *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement 8
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement_t)(void *, const char *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime 9
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime_t)(void *, const char *, int *, uint32_t *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_StoreStats 10
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_StoreStats_t)(void *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_StoreStats_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_StoreStats;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute 12
typedef const char * (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute_t)(void *, const char *, const char *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress 13
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress_t)(void *, const char *, uint32_t, uint32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetNumAchievements 14
typedef uint32_t (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetNumAchievements_t)(void *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetNumAchievements_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetNumAchievements;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementName 15
typedef const char * (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementName_t)(void *, uint32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementName_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementName;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_ResetAllStats 21
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_ResetAllStats_t)(void *, int);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_ResetAllStats_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_ResetAllStats;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2 0
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2_t)(void *, const char *, float *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat 1
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_t)(void *, const char *, int32_t *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2 2
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2_t)(void *, const char *, float);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat 3
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_t)(void *, const char *, int32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat 4
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat_t)(void *, const char *, float, double);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement 5
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement_t)(void *, const char *, int *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement 6
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement_t)(void *, const char *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement 7
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement_t)(void *, const char *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime 8
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime_t)(void *, const char *, int *, uint32_t *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_StoreStats 9
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_StoreStats_t)(void *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_StoreStats_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_StoreStats;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute 11
typedef const char * (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute_t)(void *, const char *, const char *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress 12
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress_t)(void *, const char *, uint32_t, uint32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetNumAchievements 13
typedef uint32_t (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetNumAchievements_t)(void *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetNumAchievements_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetNumAchievements;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementName 14
typedef const char * (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementName_t)(void *, uint32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementName_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementName;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_ResetAllStats 20
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_ResetAllStats_t)(void *, int);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_ResetAllStats_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_ResetAllStats;
#define BD_SLOT_SteamUtils009_GetSecondsSinceAppActive 0
typedef uint32_t (*BDFlatFn_SteamUtils009_GetSecondsSinceAppActive_t)(void *);
static BDFlatFn_SteamUtils009_GetSecondsSinceAppActive_t g_bd_flat_SteamUtils009_GetSecondsSinceAppActive;
#define BD_SLOT_SteamUtils009_GetSecondsSinceComputerActive 1
typedef uint32_t (*BDFlatFn_SteamUtils009_GetSecondsSinceComputerActive_t)(void *);
static BDFlatFn_SteamUtils009_GetSecondsSinceComputerActive_t g_bd_flat_SteamUtils009_GetSecondsSinceComputerActive;
#define BD_SLOT_SteamUtils009_GetConnectedUniverse 2
typedef uint32_t (*BDFlatFn_SteamUtils009_GetConnectedUniverse_t)(void *);
static BDFlatFn_SteamUtils009_GetConnectedUniverse_t g_bd_flat_SteamUtils009_GetConnectedUniverse;
#define BD_SLOT_SteamUtils009_GetServerRealTime 3
typedef uint32_t (*BDFlatFn_SteamUtils009_GetServerRealTime_t)(void *);
static BDFlatFn_SteamUtils009_GetServerRealTime_t g_bd_flat_SteamUtils009_GetServerRealTime;
#define BD_SLOT_SteamUtils009_GetIPCountry 4
typedef const char * (*BDFlatFn_SteamUtils009_GetIPCountry_t)(void *);
static BDFlatFn_SteamUtils009_GetIPCountry_t g_bd_flat_SteamUtils009_GetIPCountry;
#define BD_SLOT_SteamUtils009_GetCurrentBatteryPower 8
typedef uint32_t (*BDFlatFn_SteamUtils009_GetCurrentBatteryPower_t)(void *);
static BDFlatFn_SteamUtils009_GetCurrentBatteryPower_t g_bd_flat_SteamUtils009_GetCurrentBatteryPower;
#define BD_SLOT_SteamUtils009_GetAppID 9
typedef uint32_t (*BDFlatFn_SteamUtils009_GetAppID_t)(void *);
static BDFlatFn_SteamUtils009_GetAppID_t g_bd_flat_SteamUtils009_GetAppID;
#define BD_SLOT_SteamUtils009_IsOverlayEnabled 17
typedef int (*BDFlatFn_SteamUtils009_IsOverlayEnabled_t)(void *);
static BDFlatFn_SteamUtils009_IsOverlayEnabled_t g_bd_flat_SteamUtils009_IsOverlayEnabled;
#define BD_SLOT_SteamUtils009_GetSteamUILanguage 23
typedef const char * (*BDFlatFn_SteamUtils009_GetSteamUILanguage_t)(void *);
static BDFlatFn_SteamUtils009_GetSteamUILanguage_t g_bd_flat_SteamUtils009_GetSteamUILanguage;
#define BD_SLOT_SteamUtils009_IsSteamRunningInVR 24
typedef int (*BDFlatFn_SteamUtils009_IsSteamRunningInVR_t)(void *);
static BDFlatFn_SteamUtils009_IsSteamRunningInVR_t g_bd_flat_SteamUtils009_IsSteamRunningInVR;
#define BD_SLOT_SteamUtils009_IsSteamInBigPictureMode 26
typedef int (*BDFlatFn_SteamUtils009_IsSteamInBigPictureMode_t)(void *);
static BDFlatFn_SteamUtils009_IsSteamInBigPictureMode_t g_bd_flat_SteamUtils009_IsSteamInBigPictureMode;
#define BD_SLOT_SteamUser018_GetHSteamUser 0
typedef int32_t (*BDFlatFn_SteamUser018_GetHSteamUser_t)(void *);
static BDFlatFn_SteamUser018_GetHSteamUser_t g_bd_flat_SteamUser018_GetHSteamUser;
#define BD_SLOT_SteamUser018_BLoggedOn 1
typedef int (*BDFlatFn_SteamUser018_BLoggedOn_t)(void *);
static BDFlatFn_SteamUser018_BLoggedOn_t g_bd_flat_SteamUser018_BLoggedOn;
#define BD_SLOT_SteamUser018_GetSteamID 2
typedef uint64_t (*BDFlatFn_SteamUser018_GetSteamID_t)(void *);
static BDFlatFn_SteamUser018_GetSteamID_t g_bd_flat_SteamUser018_GetSteamID;
#define BD_SLOT_SteamUser018_GetAuthSessionTicket 13
typedef uint32_t (*BDFlatFn_SteamUser018_GetAuthSessionTicket_t)(void *, void *, int32_t, uint32_t *, const void *);
static BDFlatFn_SteamUser018_GetAuthSessionTicket_t g_bd_flat_SteamUser018_GetAuthSessionTicket;
#define BD_SLOT_SteamUser018_CancelAuthTicket 16
typedef void (*BDFlatFn_SteamUser018_CancelAuthTicket_t)(void *, uint32_t);
static BDFlatFn_SteamUser018_CancelAuthTicket_t g_bd_flat_SteamUser018_CancelAuthTicket;
#define BD_SLOT_SteamUtils007_GetSecondsSinceAppActive 0
typedef uint32_t (*BDFlatFn_SteamUtils007_GetSecondsSinceAppActive_t)(void *);
static BDFlatFn_SteamUtils007_GetSecondsSinceAppActive_t g_bd_flat_SteamUtils007_GetSecondsSinceAppActive;
#define BD_SLOT_SteamUtils007_GetSecondsSinceComputerActive 1
typedef uint32_t (*BDFlatFn_SteamUtils007_GetSecondsSinceComputerActive_t)(void *);
static BDFlatFn_SteamUtils007_GetSecondsSinceComputerActive_t g_bd_flat_SteamUtils007_GetSecondsSinceComputerActive;
#define BD_SLOT_SteamUtils007_GetConnectedUniverse 2
typedef uint32_t (*BDFlatFn_SteamUtils007_GetConnectedUniverse_t)(void *);
static BDFlatFn_SteamUtils007_GetConnectedUniverse_t g_bd_flat_SteamUtils007_GetConnectedUniverse;
#define BD_SLOT_SteamUtils007_GetServerRealTime 3
typedef uint32_t (*BDFlatFn_SteamUtils007_GetServerRealTime_t)(void *);
static BDFlatFn_SteamUtils007_GetServerRealTime_t g_bd_flat_SteamUtils007_GetServerRealTime;
#define BD_SLOT_SteamUtils007_GetIPCountry 4
typedef const char * (*BDFlatFn_SteamUtils007_GetIPCountry_t)(void *);
static BDFlatFn_SteamUtils007_GetIPCountry_t g_bd_flat_SteamUtils007_GetIPCountry;
#define BD_SLOT_SteamUtils007_GetCurrentBatteryPower 8
typedef uint32_t (*BDFlatFn_SteamUtils007_GetCurrentBatteryPower_t)(void *);
static BDFlatFn_SteamUtils007_GetCurrentBatteryPower_t g_bd_flat_SteamUtils007_GetCurrentBatteryPower;
#define BD_SLOT_SteamUtils007_GetAppID 9
typedef uint32_t (*BDFlatFn_SteamUtils007_GetAppID_t)(void *);
static BDFlatFn_SteamUtils007_GetAppID_t g_bd_flat_SteamUtils007_GetAppID;
#define BD_SLOT_SteamUtils007_IsOverlayEnabled 17
typedef int (*BDFlatFn_SteamUtils007_IsOverlayEnabled_t)(void *);
static BDFlatFn_SteamUtils007_IsOverlayEnabled_t g_bd_flat_SteamUtils007_IsOverlayEnabled;
#define BD_SLOT_SteamUtils007_GetSteamUILanguage 23
typedef const char * (*BDFlatFn_SteamUtils007_GetSteamUILanguage_t)(void *);
static BDFlatFn_SteamUtils007_GetSteamUILanguage_t g_bd_flat_SteamUtils007_GetSteamUILanguage;
#define BD_SLOT_SteamUtils007_IsSteamRunningInVR 24
typedef int (*BDFlatFn_SteamUtils007_IsSteamRunningInVR_t)(void *);
static BDFlatFn_SteamUtils007_IsSteamRunningInVR_t g_bd_flat_SteamUtils007_IsSteamRunningInVR;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribed 0
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribed_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribed_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribed;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsLowViolence 1
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsLowViolence_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsLowViolence_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsLowViolence;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsCybercafe 2
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsCybercafe_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsCybercafe_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsCybercafe;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsVACBanned 3
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsVACBanned_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsVACBanned_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsVACBanned;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_GetCurrentGameLanguage 4
typedef const char * (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetCurrentGameLanguage_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetCurrentGameLanguage_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetCurrentGameLanguage;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_GetAvailableGameLanguages 5
typedef const char * (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetAvailableGameLanguages_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetAvailableGameLanguages_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetAvailableGameLanguages;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedApp 6
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedApp_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedApp_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedApp;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsDlcInstalled 7
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsDlcInstalled_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsDlcInstalled_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsDlcInstalled;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_GetEarliestPurchaseUnixTime 8
typedef uint32_t (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetEarliestPurchaseUnixTime_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetEarliestPurchaseUnixTime_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetEarliestPurchaseUnixTime;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedFromFreeWeekend 9
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedFromFreeWeekend_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedFromFreeWeekend_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedFromFreeWeekend;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_GetDLCCount 10
typedef int32_t (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetDLCCount_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetDLCCount_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetDLCCount;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsAppInstalled 19
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsAppInstalled_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsAppInstalled_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsAppInstalled;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_GetAppOwner 20
typedef uint64_t (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetAppOwner_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetAppOwner_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetAppOwner;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_GetAppBuildId 23
typedef int32_t (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetAppBuildId_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetAppBuildId_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetAppBuildId;
#define BD_SLOT_SteamMatchMakingServers003_RequestInternetServerList 0
typedef void * (*BDFlatFn_SteamMatchMakingServers003_RequestInternetServerList_t)(void *, uint32_t, void *, uint32_t, void *);
static BDFlatFn_SteamMatchMakingServers003_RequestInternetServerList_t g_bd_flat_SteamMatchMakingServers003_RequestInternetServerList;
#define BD_SLOT_SteamMatchMakingServers003_RequestLANServerList 1
typedef void * (*BDFlatFn_SteamMatchMakingServers003_RequestLANServerList_t)(void *, uint32_t, void *);
static BDFlatFn_SteamMatchMakingServers003_RequestLANServerList_t g_bd_flat_SteamMatchMakingServers003_RequestLANServerList;
#define BD_SLOT_SteamMatchMakingServers003_RequestFriendsServerList 2
typedef void * (*BDFlatFn_SteamMatchMakingServers003_RequestFriendsServerList_t)(void *, uint32_t, void *, uint32_t, void *);
static BDFlatFn_SteamMatchMakingServers003_RequestFriendsServerList_t g_bd_flat_SteamMatchMakingServers003_RequestFriendsServerList;
#define BD_SLOT_SteamMatchMakingServers003_RequestFavoritesServerList 3
typedef void * (*BDFlatFn_SteamMatchMakingServers003_RequestFavoritesServerList_t)(void *, uint32_t, void *, uint32_t, void *);
static BDFlatFn_SteamMatchMakingServers003_RequestFavoritesServerList_t g_bd_flat_SteamMatchMakingServers003_RequestFavoritesServerList;
#define BD_SLOT_SteamMatchMakingServers003_RequestHistoryServerList 4
typedef void * (*BDFlatFn_SteamMatchMakingServers003_RequestHistoryServerList_t)(void *, uint32_t, void *, uint32_t, void *);
static BDFlatFn_SteamMatchMakingServers003_RequestHistoryServerList_t g_bd_flat_SteamMatchMakingServers003_RequestHistoryServerList;
#define BD_SLOT_SteamMatchMakingServers003_RequestSpectatorServerList 5
typedef void * (*BDFlatFn_SteamMatchMakingServers003_RequestSpectatorServerList_t)(void *, uint32_t, void *, uint32_t, void *);
static BDFlatFn_SteamMatchMakingServers003_RequestSpectatorServerList_t g_bd_flat_SteamMatchMakingServers003_RequestSpectatorServerList;
#define BD_SLOT_SteamMatchMakingServers003_ReleaseRequest 6
typedef void (*BDFlatFn_SteamMatchMakingServers003_ReleaseRequest_t)(void *, uint64_t);
static BDFlatFn_SteamMatchMakingServers003_ReleaseRequest_t g_bd_flat_SteamMatchMakingServers003_ReleaseRequest;
#define BD_SLOT_SteamMatchMakingServers003_GetServerDetails 7
typedef void * (*BDFlatFn_SteamMatchMakingServers003_GetServerDetails_t)(void *, uint64_t, int32_t);
static BDFlatFn_SteamMatchMakingServers003_GetServerDetails_t g_bd_flat_SteamMatchMakingServers003_GetServerDetails;
#define BD_SLOT_SteamMatchMakingServers003_CancelQuery 8
typedef void (*BDFlatFn_SteamMatchMakingServers003_CancelQuery_t)(void *, uint64_t);
static BDFlatFn_SteamMatchMakingServers003_CancelQuery_t g_bd_flat_SteamMatchMakingServers003_CancelQuery;
#define BD_SLOT_SteamMatchMakingServers003_RefreshQuery 9
typedef void (*BDFlatFn_SteamMatchMakingServers003_RefreshQuery_t)(void *, uint64_t);
static BDFlatFn_SteamMatchMakingServers003_RefreshQuery_t g_bd_flat_SteamMatchMakingServers003_RefreshQuery;
#define BD_SLOT_SteamMatchMakingServers003_IsRefreshing 10
typedef int (*BDFlatFn_SteamMatchMakingServers003_IsRefreshing_t)(void *, uint64_t);
static BDFlatFn_SteamMatchMakingServers003_IsRefreshing_t g_bd_flat_SteamMatchMakingServers003_IsRefreshing;
#define BD_SLOT_SteamMatchMakingServers003_GetServerCount 11
typedef int32_t (*BDFlatFn_SteamMatchMakingServers003_GetServerCount_t)(void *, uint64_t);
static BDFlatFn_SteamMatchMakingServers003_GetServerCount_t g_bd_flat_SteamMatchMakingServers003_GetServerCount;
#define BD_SLOT_SteamMatchMakingServers003_RefreshServer 12
typedef void (*BDFlatFn_SteamMatchMakingServers003_RefreshServer_t)(void *, uint64_t, int32_t);
static BDFlatFn_SteamMatchMakingServers003_RefreshServer_t g_bd_flat_SteamMatchMakingServers003_RefreshServer;
#define BD_SLOT_SteamMatchMakingServers003_PingServer 13
typedef int32_t (*BDFlatFn_SteamMatchMakingServers003_PingServer_t)(void *, uint32_t, uint32_t, void *);
static BDFlatFn_SteamMatchMakingServers003_PingServer_t g_bd_flat_SteamMatchMakingServers003_PingServer;
#define BD_SLOT_SteamMatchMakingServers003_PlayerDetails 14
typedef int32_t (*BDFlatFn_SteamMatchMakingServers003_PlayerDetails_t)(void *, uint32_t, uint32_t, void *);
static BDFlatFn_SteamMatchMakingServers003_PlayerDetails_t g_bd_flat_SteamMatchMakingServers003_PlayerDetails;
#define BD_SLOT_SteamMatchMakingServers003_ServerRules 15
typedef int32_t (*BDFlatFn_SteamMatchMakingServers003_ServerRules_t)(void *, uint32_t, uint32_t, void *);
static BDFlatFn_SteamMatchMakingServers003_ServerRules_t g_bd_flat_SteamMatchMakingServers003_ServerRules;
#define BD_SLOT_SteamMatchMakingServers003_ServerFriends 16
typedef int32_t (*BDFlatFn_SteamMatchMakingServers003_ServerFriends_t)(void *, uint32_t, uint32_t, void *);
static BDFlatFn_SteamMatchMakingServers003_ServerFriends_t g_bd_flat_SteamMatchMakingServers003_ServerFriends;
#define BD_SLOT_SteamMatchMakingServers003_CancelServerQuery 17
typedef void (*BDFlatFn_SteamMatchMakingServers003_CancelServerQuery_t)(void *, int32_t);
static BDFlatFn_SteamMatchMakingServers003_CancelServerQuery_t g_bd_flat_SteamMatchMakingServers003_CancelServerQuery;
#define BD_SLOT_SteamNetworkingSockets013_CreateListenSocketIP 0
typedef uint32_t (*BDFlatFn_SteamNetworkingSockets013_CreateListenSocketIP_t)(void *, void *, int32_t, void *);
static BDFlatFn_SteamNetworkingSockets013_CreateListenSocketIP_t g_bd_flat_SteamNetworkingSockets013_CreateListenSocketIP;
#define BD_SLOT_SteamNetworkingSockets013_ConnectByIPAddress 1
typedef uint32_t (*BDFlatFn_SteamNetworkingSockets013_ConnectByIPAddress_t)(void *, void *, int32_t, void *);
static BDFlatFn_SteamNetworkingSockets013_ConnectByIPAddress_t g_bd_flat_SteamNetworkingSockets013_ConnectByIPAddress;
#define BD_SLOT_SteamNetworkingSockets013_CreateListenSocketP2P 2
typedef uint32_t (*BDFlatFn_SteamNetworkingSockets013_CreateListenSocketP2P_t)(void *, int32_t, int32_t, void *);
static BDFlatFn_SteamNetworkingSockets013_CreateListenSocketP2P_t g_bd_flat_SteamNetworkingSockets013_CreateListenSocketP2P;
#define BD_SLOT_SteamNetworkingSockets013_ConnectP2P 3
typedef uint32_t (*BDFlatFn_SteamNetworkingSockets013_ConnectP2P_t)(void *, void *, int32_t, int32_t, void *);
static BDFlatFn_SteamNetworkingSockets013_ConnectP2P_t g_bd_flat_SteamNetworkingSockets013_ConnectP2P;
#define BD_SLOT_SteamNetworkingSockets013_AcceptConnection 4
typedef uint32_t (*BDFlatFn_SteamNetworkingSockets013_AcceptConnection_t)(void *, uint32_t);
static BDFlatFn_SteamNetworkingSockets013_AcceptConnection_t g_bd_flat_SteamNetworkingSockets013_AcceptConnection;
#define BD_SLOT_SteamNetworkingSockets013_CloseConnection 5
typedef int (*BDFlatFn_SteamNetworkingSockets013_CloseConnection_t)(void *, uint32_t, int32_t, const char *, int);
static BDFlatFn_SteamNetworkingSockets013_CloseConnection_t g_bd_flat_SteamNetworkingSockets013_CloseConnection;
#define BD_SLOT_SteamNetworkingSockets013_CloseListenSocket 6
typedef int (*BDFlatFn_SteamNetworkingSockets013_CloseListenSocket_t)(void *, uint32_t);
static BDFlatFn_SteamNetworkingSockets013_CloseListenSocket_t g_bd_flat_SteamNetworkingSockets013_CloseListenSocket;
#define BD_SLOT_SteamNetworkingSockets013_SetConnectionUserData 7
typedef int (*BDFlatFn_SteamNetworkingSockets013_SetConnectionUserData_t)(void *, uint32_t, int64_t);
static BDFlatFn_SteamNetworkingSockets013_SetConnectionUserData_t g_bd_flat_SteamNetworkingSockets013_SetConnectionUserData;
#define BD_SLOT_SteamNetworkingSockets013_GetConnectionUserData 8
typedef int64_t (*BDFlatFn_SteamNetworkingSockets013_GetConnectionUserData_t)(void *, uint32_t);
static BDFlatFn_SteamNetworkingSockets013_GetConnectionUserData_t g_bd_flat_SteamNetworkingSockets013_GetConnectionUserData;
#define BD_SLOT_SteamNetworkingSockets013_SetConnectionName 9
typedef void (*BDFlatFn_SteamNetworkingSockets013_SetConnectionName_t)(void *, uint32_t, const char *);
static BDFlatFn_SteamNetworkingSockets013_SetConnectionName_t g_bd_flat_SteamNetworkingSockets013_SetConnectionName;
#define BD_SLOT_SteamNetworkingSockets013_GetConnectionName 10
typedef int (*BDFlatFn_SteamNetworkingSockets013_GetConnectionName_t)(void *, uint32_t, char *, int32_t);
static BDFlatFn_SteamNetworkingSockets013_GetConnectionName_t g_bd_flat_SteamNetworkingSockets013_GetConnectionName;
#define BD_SLOT_SteamNetworkingSockets013_SendMessageToConnection 11
typedef uint32_t (*BDFlatFn_SteamNetworkingSockets013_SendMessageToConnection_t)(void *, uint32_t, const void *, uint32_t, int32_t, uint64_t *);
static BDFlatFn_SteamNetworkingSockets013_SendMessageToConnection_t g_bd_flat_SteamNetworkingSockets013_SendMessageToConnection;
#define BD_SLOT_SteamNetworkingSockets013_FlushMessagesOnConnection 13
typedef uint32_t (*BDFlatFn_SteamNetworkingSockets013_FlushMessagesOnConnection_t)(void *, uint32_t);
static BDFlatFn_SteamNetworkingSockets013_FlushMessagesOnConnection_t g_bd_flat_SteamNetworkingSockets013_FlushMessagesOnConnection;
#define BD_SLOT_SteamNetworkingSockets013_ReceiveMessagesOnConnection 14
typedef int32_t (*BDFlatFn_SteamNetworkingSockets013_ReceiveMessagesOnConnection_t)(void *, uint32_t, void *, int32_t);
static BDFlatFn_SteamNetworkingSockets013_ReceiveMessagesOnConnection_t g_bd_flat_SteamNetworkingSockets013_ReceiveMessagesOnConnection;
#define BD_SLOT_SteamNetworkingSockets013_GetConnectionInfo 15
typedef int (*BDFlatFn_SteamNetworkingSockets013_GetConnectionInfo_t)(void *, uint32_t, void *);
static BDFlatFn_SteamNetworkingSockets013_GetConnectionInfo_t g_bd_flat_SteamNetworkingSockets013_GetConnectionInfo;
#define BD_SLOT_SteamNetworkingSockets013_GetConnectionRealTimeStatus 16
typedef uint32_t (*BDFlatFn_SteamNetworkingSockets013_GetConnectionRealTimeStatus_t)(void *, uint32_t, void *, int32_t, void *);
static BDFlatFn_SteamNetworkingSockets013_GetConnectionRealTimeStatus_t g_bd_flat_SteamNetworkingSockets013_GetConnectionRealTimeStatus;
#define BD_SLOT_SteamNetworkingSockets013_GetDetailedConnectionStatus 17
typedef int32_t (*BDFlatFn_SteamNetworkingSockets013_GetDetailedConnectionStatus_t)(void *, uint32_t, char *, int32_t);
static BDFlatFn_SteamNetworkingSockets013_GetDetailedConnectionStatus_t g_bd_flat_SteamNetworkingSockets013_GetDetailedConnectionStatus;
#define BD_SLOT_SteamNetworkingSockets013_GetListenSocketAddress 18
typedef int (*BDFlatFn_SteamNetworkingSockets013_GetListenSocketAddress_t)(void *, uint32_t, void *);
static BDFlatFn_SteamNetworkingSockets013_GetListenSocketAddress_t g_bd_flat_SteamNetworkingSockets013_GetListenSocketAddress;
#define BD_SLOT_SteamNetworkingSockets013_CreateSocketPair 19
typedef int (*BDFlatFn_SteamNetworkingSockets013_CreateSocketPair_t)(void *, uint32_t *, uint32_t *, int, const void *, const void *);
static BDFlatFn_SteamNetworkingSockets013_CreateSocketPair_t g_bd_flat_SteamNetworkingSockets013_CreateSocketPair;
#define BD_SLOT_SteamNetworkingSockets013_ConfigureConnectionLanes 20
typedef uint32_t (*BDFlatFn_SteamNetworkingSockets013_ConfigureConnectionLanes_t)(void *, uint32_t, int32_t, void *, void *);
static BDFlatFn_SteamNetworkingSockets013_ConfigureConnectionLanes_t g_bd_flat_SteamNetworkingSockets013_ConfigureConnectionLanes;
#define BD_SLOT_SteamNetworkingSockets013_GetIdentity 21
typedef int (*BDFlatFn_SteamNetworkingSockets013_GetIdentity_t)(void *, void *);
static BDFlatFn_SteamNetworkingSockets013_GetIdentity_t g_bd_flat_SteamNetworkingSockets013_GetIdentity;
#define BD_SLOT_SteamNetworkingSockets013_InitAuthentication 22
typedef uint32_t (*BDFlatFn_SteamNetworkingSockets013_InitAuthentication_t)(void *);
static BDFlatFn_SteamNetworkingSockets013_InitAuthentication_t g_bd_flat_SteamNetworkingSockets013_InitAuthentication;
#define BD_SLOT_SteamNetworkingSockets013_GetAuthenticationStatus 23
typedef uint32_t (*BDFlatFn_SteamNetworkingSockets013_GetAuthenticationStatus_t)(void *, void *);
static BDFlatFn_SteamNetworkingSockets013_GetAuthenticationStatus_t g_bd_flat_SteamNetworkingSockets013_GetAuthenticationStatus;
#define BD_SLOT_SteamNetworkingSockets013_CreatePollGroup 24
typedef uint32_t (*BDFlatFn_SteamNetworkingSockets013_CreatePollGroup_t)(void *);
static BDFlatFn_SteamNetworkingSockets013_CreatePollGroup_t g_bd_flat_SteamNetworkingSockets013_CreatePollGroup;
#define BD_SLOT_SteamNetworkingSockets013_DestroyPollGroup 25
typedef int (*BDFlatFn_SteamNetworkingSockets013_DestroyPollGroup_t)(void *, uint32_t);
static BDFlatFn_SteamNetworkingSockets013_DestroyPollGroup_t g_bd_flat_SteamNetworkingSockets013_DestroyPollGroup;
#define BD_SLOT_SteamNetworkingSockets013_SetConnectionPollGroup 26
typedef int (*BDFlatFn_SteamNetworkingSockets013_SetConnectionPollGroup_t)(void *, uint32_t, uint32_t);
static BDFlatFn_SteamNetworkingSockets013_SetConnectionPollGroup_t g_bd_flat_SteamNetworkingSockets013_SetConnectionPollGroup;
#define BD_SLOT_SteamNetworkingSockets013_ReceiveMessagesOnPollGroup 27
typedef int32_t (*BDFlatFn_SteamNetworkingSockets013_ReceiveMessagesOnPollGroup_t)(void *, uint32_t, void *, int32_t);
static BDFlatFn_SteamNetworkingSockets013_ReceiveMessagesOnPollGroup_t g_bd_flat_SteamNetworkingSockets013_ReceiveMessagesOnPollGroup;
#define BD_SLOT_SteamNetworkingSockets013_ResetIdentity 40
typedef void (*BDFlatFn_SteamNetworkingSockets013_ResetIdentity_t)(void *, const void *);
static BDFlatFn_SteamNetworkingSockets013_ResetIdentity_t g_bd_flat_SteamNetworkingSockets013_ResetIdentity;
#define BD_SLOT_SteamNetworkingUtils004_GetRelayNetworkStatus 1
typedef uint32_t (*BDFlatFn_SteamNetworkingUtils004_GetRelayNetworkStatus_t)(void *, void *);
static BDFlatFn_SteamNetworkingUtils004_GetRelayNetworkStatus_t g_bd_flat_SteamNetworkingUtils004_GetRelayNetworkStatus;
#define BD_SLOT_SteamNetworkingUtils004_GetLocalPingLocation 2
typedef float (*BDFlatFn_SteamNetworkingUtils004_GetLocalPingLocation_t)(void *, void *);
static BDFlatFn_SteamNetworkingUtils004_GetLocalPingLocation_t g_bd_flat_SteamNetworkingUtils004_GetLocalPingLocation;
#define BD_SLOT_SteamNetworkingUtils004_EstimatePingTimeBetweenTwoLocations 3
typedef int32_t (*BDFlatFn_SteamNetworkingUtils004_EstimatePingTimeBetweenTwoLocations_t)(void *, const void *, const void *);
static BDFlatFn_SteamNetworkingUtils004_EstimatePingTimeBetweenTwoLocations_t g_bd_flat_SteamNetworkingUtils004_EstimatePingTimeBetweenTwoLocations;
#define BD_SLOT_SteamNetworkingUtils004_EstimatePingTimeFromLocalHost 4
typedef int32_t (*BDFlatFn_SteamNetworkingUtils004_EstimatePingTimeFromLocalHost_t)(void *, const void *);
static BDFlatFn_SteamNetworkingUtils004_EstimatePingTimeFromLocalHost_t g_bd_flat_SteamNetworkingUtils004_EstimatePingTimeFromLocalHost;
#define BD_SLOT_SteamNetworkingUtils004_ConvertPingLocationToString 5
typedef void (*BDFlatFn_SteamNetworkingUtils004_ConvertPingLocationToString_t)(void *, void *, char *, int32_t);
static BDFlatFn_SteamNetworkingUtils004_ConvertPingLocationToString_t g_bd_flat_SteamNetworkingUtils004_ConvertPingLocationToString;
#define BD_SLOT_SteamNetworkingUtils004_ParsePingLocationString 6
typedef int (*BDFlatFn_SteamNetworkingUtils004_ParsePingLocationString_t)(void *, const char *, void *);
static BDFlatFn_SteamNetworkingUtils004_ParsePingLocationString_t g_bd_flat_SteamNetworkingUtils004_ParsePingLocationString;
#define BD_SLOT_SteamNetworkingUtils004_CheckPingDataUpToDate 7
typedef int (*BDFlatFn_SteamNetworkingUtils004_CheckPingDataUpToDate_t)(void *, float);
static BDFlatFn_SteamNetworkingUtils004_CheckPingDataUpToDate_t g_bd_flat_SteamNetworkingUtils004_CheckPingDataUpToDate;
#define BD_SLOT_SteamNetworkingUtils004_GetPingToDataCenter 8
typedef int32_t (*BDFlatFn_SteamNetworkingUtils004_GetPingToDataCenter_t)(void *, uint32_t, uint32_t *);
static BDFlatFn_SteamNetworkingUtils004_GetPingToDataCenter_t g_bd_flat_SteamNetworkingUtils004_GetPingToDataCenter;
#define BD_SLOT_SteamNetworkingUtils004_GetDirectPingToPOP 9
typedef int32_t (*BDFlatFn_SteamNetworkingUtils004_GetDirectPingToPOP_t)(void *, uint32_t);
static BDFlatFn_SteamNetworkingUtils004_GetDirectPingToPOP_t g_bd_flat_SteamNetworkingUtils004_GetDirectPingToPOP;
#define BD_SLOT_SteamNetworkingUtils004_GetPOPCount 10
typedef int32_t (*BDFlatFn_SteamNetworkingUtils004_GetPOPCount_t)(void *);
static BDFlatFn_SteamNetworkingUtils004_GetPOPCount_t g_bd_flat_SteamNetworkingUtils004_GetPOPCount;
#define BD_SLOT_SteamNetworkingUtils004_GetPOPList 11
typedef int32_t (*BDFlatFn_SteamNetworkingUtils004_GetPOPList_t)(void *, uint32_t *, int32_t);
static BDFlatFn_SteamNetworkingUtils004_GetPOPList_t g_bd_flat_SteamNetworkingUtils004_GetPOPList;
#define BD_SLOT_SteamNetworkingUtils004_GetLocalTimestamp 12
typedef int64_t (*BDFlatFn_SteamNetworkingUtils004_GetLocalTimestamp_t)(void *);
static BDFlatFn_SteamNetworkingUtils004_GetLocalTimestamp_t g_bd_flat_SteamNetworkingUtils004_GetLocalTimestamp;
#define BD_SLOT_SteamNetworkingUtils004_GetIPv4FakeIPType 14
typedef uint32_t (*BDFlatFn_SteamNetworkingUtils004_GetIPv4FakeIPType_t)(void *, uint32_t);
static BDFlatFn_SteamNetworkingUtils004_GetIPv4FakeIPType_t g_bd_flat_SteamNetworkingUtils004_GetIPv4FakeIPType;
#define BD_SLOT_SteamNetworkingUtils004_GetRealIdentityForFakeIP 15
typedef uint32_t (*BDFlatFn_SteamNetworkingUtils004_GetRealIdentityForFakeIP_t)(void *, const void *, void *);
static BDFlatFn_SteamNetworkingUtils004_GetRealIdentityForFakeIP_t g_bd_flat_SteamNetworkingUtils004_GetRealIdentityForFakeIP;
#define BD_SLOT_SteamNetworkingUtils004_SetConfigValue 16
typedef int (*BDFlatFn_SteamNetworkingUtils004_SetConfigValue_t)(void *, uint32_t, uint32_t, int32_t, uint32_t, void *);
static BDFlatFn_SteamNetworkingUtils004_SetConfigValue_t g_bd_flat_SteamNetworkingUtils004_SetConfigValue;
#define BD_SLOT_SteamNetworkingUtils004_GetConfigValue 17
typedef uint32_t (*BDFlatFn_SteamNetworkingUtils004_GetConfigValue_t)(void *, uint32_t, uint32_t, int32_t, uint32_t *, void *, uint32_t *);
static BDFlatFn_SteamNetworkingUtils004_GetConfigValue_t g_bd_flat_SteamNetworkingUtils004_GetConfigValue;
#define BD_SLOT_SteamNetworkingUtils004_GetConfigValueInfo 18
typedef const char * (*BDFlatFn_SteamNetworkingUtils004_GetConfigValueInfo_t)(void *, uint32_t, uint32_t *, uint32_t *);
static BDFlatFn_SteamNetworkingUtils004_GetConfigValueInfo_t g_bd_flat_SteamNetworkingUtils004_GetConfigValueInfo;
#define BD_SLOT_SteamNetworkingUtils004_IterateGenericEditableConfigValues 19
typedef uint32_t (*BDFlatFn_SteamNetworkingUtils004_IterateGenericEditableConfigValues_t)(void *, uint32_t, int);
static BDFlatFn_SteamNetworkingUtils004_IterateGenericEditableConfigValues_t g_bd_flat_SteamNetworkingUtils004_IterateGenericEditableConfigValues;
#define BD_SLOT_SteamNetworkingMessages002_SendMessageToUser 0
typedef uint32_t (*BDFlatFn_SteamNetworkingMessages002_SendMessageToUser_t)(void *, const void *, const void *, uint32_t, int32_t, int32_t);
static BDFlatFn_SteamNetworkingMessages002_SendMessageToUser_t g_bd_flat_SteamNetworkingMessages002_SendMessageToUser;
#define BD_SLOT_SteamNetworkingMessages002_ReceiveMessagesOnChannel 1
typedef int32_t (*BDFlatFn_SteamNetworkingMessages002_ReceiveMessagesOnChannel_t)(void *, int32_t, void *, int32_t);
static BDFlatFn_SteamNetworkingMessages002_ReceiveMessagesOnChannel_t g_bd_flat_SteamNetworkingMessages002_ReceiveMessagesOnChannel;
#define BD_SLOT_SteamNetworkingMessages002_AcceptSessionWithUser 2
typedef int (*BDFlatFn_SteamNetworkingMessages002_AcceptSessionWithUser_t)(void *, const void *);
static BDFlatFn_SteamNetworkingMessages002_AcceptSessionWithUser_t g_bd_flat_SteamNetworkingMessages002_AcceptSessionWithUser;
#define BD_SLOT_SteamNetworkingMessages002_CloseSessionWithUser 3
typedef int (*BDFlatFn_SteamNetworkingMessages002_CloseSessionWithUser_t)(void *, const void *);
static BDFlatFn_SteamNetworkingMessages002_CloseSessionWithUser_t g_bd_flat_SteamNetworkingMessages002_CloseSessionWithUser;
#define BD_SLOT_SteamNetworkingMessages002_CloseChannelWithUser 4
typedef int (*BDFlatFn_SteamNetworkingMessages002_CloseChannelWithUser_t)(void *, const void *, int32_t);
static BDFlatFn_SteamNetworkingMessages002_CloseChannelWithUser_t g_bd_flat_SteamNetworkingMessages002_CloseChannelWithUser;
#define BD_SLOT_SteamNetworkingMessages002_GetSessionConnectionInfo 5
typedef uint32_t (*BDFlatFn_SteamNetworkingMessages002_GetSessionConnectionInfo_t)(void *, const void *, void *, void *);
static BDFlatFn_SteamNetworkingMessages002_GetSessionConnectionInfo_t g_bd_flat_SteamNetworkingMessages002_GetSessionConnectionInfo;
#define BD_SLOT_SteamNetworkingSockets012_CreateListenSocketIP 0
typedef uint32_t (*BDFlatFn_SteamNetworkingSockets012_CreateListenSocketIP_t)(void *, void *, int32_t, void *);
static BDFlatFn_SteamNetworkingSockets012_CreateListenSocketIP_t g_bd_flat_SteamNetworkingSockets012_CreateListenSocketIP;
#define BD_SLOT_SteamNetworkingSockets012_ConnectByIPAddress 1
typedef uint32_t (*BDFlatFn_SteamNetworkingSockets012_ConnectByIPAddress_t)(void *, void *, int32_t, void *);
static BDFlatFn_SteamNetworkingSockets012_ConnectByIPAddress_t g_bd_flat_SteamNetworkingSockets012_ConnectByIPAddress;
#define BD_SLOT_SteamNetworkingSockets012_CreateListenSocketP2P 2
typedef uint32_t (*BDFlatFn_SteamNetworkingSockets012_CreateListenSocketP2P_t)(void *, int32_t, int32_t, void *);
static BDFlatFn_SteamNetworkingSockets012_CreateListenSocketP2P_t g_bd_flat_SteamNetworkingSockets012_CreateListenSocketP2P;
#define BD_SLOT_SteamNetworkingSockets012_ConnectP2P 3
typedef uint32_t (*BDFlatFn_SteamNetworkingSockets012_ConnectP2P_t)(void *, void *, int32_t, int32_t, void *);
static BDFlatFn_SteamNetworkingSockets012_ConnectP2P_t g_bd_flat_SteamNetworkingSockets012_ConnectP2P;
#define BD_SLOT_SteamNetworkingSockets012_AcceptConnection 4
typedef uint32_t (*BDFlatFn_SteamNetworkingSockets012_AcceptConnection_t)(void *, uint32_t);
static BDFlatFn_SteamNetworkingSockets012_AcceptConnection_t g_bd_flat_SteamNetworkingSockets012_AcceptConnection;
#define BD_SLOT_SteamNetworkingSockets012_CloseConnection 5
typedef int (*BDFlatFn_SteamNetworkingSockets012_CloseConnection_t)(void *, uint32_t, int32_t, const char *, int);
static BDFlatFn_SteamNetworkingSockets012_CloseConnection_t g_bd_flat_SteamNetworkingSockets012_CloseConnection;
#define BD_SLOT_SteamNetworkingSockets012_CloseListenSocket 6
typedef int (*BDFlatFn_SteamNetworkingSockets012_CloseListenSocket_t)(void *, uint32_t);
static BDFlatFn_SteamNetworkingSockets012_CloseListenSocket_t g_bd_flat_SteamNetworkingSockets012_CloseListenSocket;
#define BD_SLOT_SteamNetworkingSockets012_SetConnectionUserData 7
typedef int (*BDFlatFn_SteamNetworkingSockets012_SetConnectionUserData_t)(void *, uint32_t, int64_t);
static BDFlatFn_SteamNetworkingSockets012_SetConnectionUserData_t g_bd_flat_SteamNetworkingSockets012_SetConnectionUserData;
#define BD_SLOT_SteamNetworkingSockets012_GetConnectionUserData 8
typedef int64_t (*BDFlatFn_SteamNetworkingSockets012_GetConnectionUserData_t)(void *, uint32_t);
static BDFlatFn_SteamNetworkingSockets012_GetConnectionUserData_t g_bd_flat_SteamNetworkingSockets012_GetConnectionUserData;
#define BD_SLOT_SteamNetworkingSockets012_SetConnectionName 9
typedef void (*BDFlatFn_SteamNetworkingSockets012_SetConnectionName_t)(void *, uint32_t, const char *);
static BDFlatFn_SteamNetworkingSockets012_SetConnectionName_t g_bd_flat_SteamNetworkingSockets012_SetConnectionName;
#define BD_SLOT_SteamNetworkingSockets012_GetConnectionName 10
typedef int (*BDFlatFn_SteamNetworkingSockets012_GetConnectionName_t)(void *, uint32_t, char *, int32_t);
static BDFlatFn_SteamNetworkingSockets012_GetConnectionName_t g_bd_flat_SteamNetworkingSockets012_GetConnectionName;
#define BD_SLOT_SteamNetworkingSockets012_SendMessageToConnection 11
typedef uint32_t (*BDFlatFn_SteamNetworkingSockets012_SendMessageToConnection_t)(void *, uint32_t, const void *, uint32_t, int32_t, uint64_t *);
static BDFlatFn_SteamNetworkingSockets012_SendMessageToConnection_t g_bd_flat_SteamNetworkingSockets012_SendMessageToConnection;
#define BD_SLOT_SteamNetworkingSockets012_FlushMessagesOnConnection 13
typedef uint32_t (*BDFlatFn_SteamNetworkingSockets012_FlushMessagesOnConnection_t)(void *, uint32_t);
static BDFlatFn_SteamNetworkingSockets012_FlushMessagesOnConnection_t g_bd_flat_SteamNetworkingSockets012_FlushMessagesOnConnection;
#define BD_SLOT_SteamNetworkingSockets012_ReceiveMessagesOnConnection 14
typedef int32_t (*BDFlatFn_SteamNetworkingSockets012_ReceiveMessagesOnConnection_t)(void *, uint32_t, void *, int32_t);
static BDFlatFn_SteamNetworkingSockets012_ReceiveMessagesOnConnection_t g_bd_flat_SteamNetworkingSockets012_ReceiveMessagesOnConnection;
#define BD_SLOT_SteamNetworkingSockets012_GetConnectionInfo 15
typedef int (*BDFlatFn_SteamNetworkingSockets012_GetConnectionInfo_t)(void *, uint32_t, void *);
static BDFlatFn_SteamNetworkingSockets012_GetConnectionInfo_t g_bd_flat_SteamNetworkingSockets012_GetConnectionInfo;
#define BD_SLOT_SteamNetworkingSockets012_GetConnectionRealTimeStatus 16
typedef uint32_t (*BDFlatFn_SteamNetworkingSockets012_GetConnectionRealTimeStatus_t)(void *, uint32_t, void *, int32_t, void *);
static BDFlatFn_SteamNetworkingSockets012_GetConnectionRealTimeStatus_t g_bd_flat_SteamNetworkingSockets012_GetConnectionRealTimeStatus;
#define BD_SLOT_SteamNetworkingSockets012_GetDetailedConnectionStatus 17
typedef int32_t (*BDFlatFn_SteamNetworkingSockets012_GetDetailedConnectionStatus_t)(void *, uint32_t, char *, int32_t);
static BDFlatFn_SteamNetworkingSockets012_GetDetailedConnectionStatus_t g_bd_flat_SteamNetworkingSockets012_GetDetailedConnectionStatus;
#define BD_SLOT_SteamNetworkingSockets012_GetListenSocketAddress 18
typedef int (*BDFlatFn_SteamNetworkingSockets012_GetListenSocketAddress_t)(void *, uint32_t, void *);
static BDFlatFn_SteamNetworkingSockets012_GetListenSocketAddress_t g_bd_flat_SteamNetworkingSockets012_GetListenSocketAddress;
#define BD_SLOT_SteamNetworkingSockets012_CreateSocketPair 19
typedef int (*BDFlatFn_SteamNetworkingSockets012_CreateSocketPair_t)(void *, uint32_t *, uint32_t *, int, const void *, const void *);
static BDFlatFn_SteamNetworkingSockets012_CreateSocketPair_t g_bd_flat_SteamNetworkingSockets012_CreateSocketPair;
#define BD_SLOT_SteamNetworkingSockets012_ConfigureConnectionLanes 20
typedef uint32_t (*BDFlatFn_SteamNetworkingSockets012_ConfigureConnectionLanes_t)(void *, uint32_t, int32_t, void *, void *);
static BDFlatFn_SteamNetworkingSockets012_ConfigureConnectionLanes_t g_bd_flat_SteamNetworkingSockets012_ConfigureConnectionLanes;
#define BD_SLOT_SteamNetworkingSockets012_GetIdentity 21
typedef int (*BDFlatFn_SteamNetworkingSockets012_GetIdentity_t)(void *, void *);
static BDFlatFn_SteamNetworkingSockets012_GetIdentity_t g_bd_flat_SteamNetworkingSockets012_GetIdentity;
#define BD_SLOT_SteamNetworkingSockets012_InitAuthentication 22
typedef uint32_t (*BDFlatFn_SteamNetworkingSockets012_InitAuthentication_t)(void *);
static BDFlatFn_SteamNetworkingSockets012_InitAuthentication_t g_bd_flat_SteamNetworkingSockets012_InitAuthentication;
#define BD_SLOT_SteamNetworkingSockets012_GetAuthenticationStatus 23
typedef uint32_t (*BDFlatFn_SteamNetworkingSockets012_GetAuthenticationStatus_t)(void *, void *);
static BDFlatFn_SteamNetworkingSockets012_GetAuthenticationStatus_t g_bd_flat_SteamNetworkingSockets012_GetAuthenticationStatus;
#define BD_SLOT_SteamNetworkingSockets012_CreatePollGroup 24
typedef uint32_t (*BDFlatFn_SteamNetworkingSockets012_CreatePollGroup_t)(void *);
static BDFlatFn_SteamNetworkingSockets012_CreatePollGroup_t g_bd_flat_SteamNetworkingSockets012_CreatePollGroup;
#define BD_SLOT_SteamNetworkingSockets012_DestroyPollGroup 25
typedef int (*BDFlatFn_SteamNetworkingSockets012_DestroyPollGroup_t)(void *, uint32_t);
static BDFlatFn_SteamNetworkingSockets012_DestroyPollGroup_t g_bd_flat_SteamNetworkingSockets012_DestroyPollGroup;
#define BD_SLOT_SteamNetworkingSockets012_SetConnectionPollGroup 26
typedef int (*BDFlatFn_SteamNetworkingSockets012_SetConnectionPollGroup_t)(void *, uint32_t, uint32_t);
static BDFlatFn_SteamNetworkingSockets012_SetConnectionPollGroup_t g_bd_flat_SteamNetworkingSockets012_SetConnectionPollGroup;
#define BD_SLOT_SteamNetworkingSockets012_ReceiveMessagesOnPollGroup 27
typedef int32_t (*BDFlatFn_SteamNetworkingSockets012_ReceiveMessagesOnPollGroup_t)(void *, uint32_t, void *, int32_t);
static BDFlatFn_SteamNetworkingSockets012_ReceiveMessagesOnPollGroup_t g_bd_flat_SteamNetworkingSockets012_ReceiveMessagesOnPollGroup;
#define BD_SLOT_SteamNetworkingSockets012_ResetIdentity 40
typedef void (*BDFlatFn_SteamNetworkingSockets012_ResetIdentity_t)(void *, const void *);
static BDFlatFn_SteamNetworkingSockets012_ResetIdentity_t g_bd_flat_SteamNetworkingSockets012_ResetIdentity;

// D-51-04: identity-only mode -- set once by bridge_helper.c's argv
// parsing (--identity-only/--report-appid), read by every dispatch case
// above that gates an app-scoped family or special-cases SteamUtils
// GetAppID.
static int g_bd_identity_only = 0;
static uint32_t g_bd_report_appid = 0;

void bridge_dispatch_set_identity_only(int on, uint32_t reportAppId) {
  g_bd_identity_only = on ? 1 : 0;
  g_bd_report_appid = reportAppId;
}

// NULL-tolerant: a dlsym failure here leaves the affected self/flat
// pointer NULL, and every dispatch case above checks for NULL before
// calling through (T-51-23) -- never fatal to the whole helper.
int bridge_dispatch_init(void *dylibHandle) {
  if (!dylibHandle) return 0;
  g_bd_accessor_steamuser023 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUser_v023");
  g_bd_self_steamuser023 = g_bd_accessor_steamuser023 ? g_bd_accessor_steamuser023() : NULL;
  g_bd_flat_SteamUser023_GetHSteamUser = (BDFlatFn_SteamUser023_GetHSteamUser_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetHSteamUser");
  g_bd_flat_SteamUser023_BLoggedOn = (BDFlatFn_SteamUser023_BLoggedOn_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_BLoggedOn");
  g_bd_flat_SteamUser023_GetSteamID = (BDFlatFn_SteamUser023_GetSteamID_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetSteamID");
  g_bd_flat_SteamUser023_GetAuthSessionTicket = (BDFlatFn_SteamUser023_GetAuthSessionTicket_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetAuthSessionTicket");
  g_bd_flat_SteamUser023_GetAuthTicketForWebApi = (BDFlatFn_SteamUser023_GetAuthTicketForWebApi_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetAuthTicketForWebApi");
  g_bd_flat_SteamUser023_CancelAuthTicket = (BDFlatFn_SteamUser023_CancelAuthTicket_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_CancelAuthTicket");
  g_bd_accessor_steamfriends018 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamFriends_v018");
  g_bd_self_steamfriends018 = g_bd_accessor_steamfriends018 ? g_bd_accessor_steamfriends018() : NULL;
  g_bd_flat_SteamFriends018_GetPersonaName = (BDFlatFn_SteamFriends018_GetPersonaName_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetPersonaName");
  g_bd_flat_SteamFriends018_GetPersonaState = (BDFlatFn_SteamFriends018_GetPersonaState_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetPersonaState");
  g_bd_flat_SteamFriends018_GetFriendPersonaName = (BDFlatFn_SteamFriends018_GetFriendPersonaName_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetFriendPersonaName");
  g_bd_accessor_steamuser016 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUser_v023");
  g_bd_self_steamuser016 = g_bd_accessor_steamuser016 ? g_bd_accessor_steamuser016() : NULL;
  g_bd_flat_SteamUser016_GetHSteamUser = (BDFlatFn_SteamUser016_GetHSteamUser_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetHSteamUser");
  g_bd_flat_SteamUser016_BLoggedOn = (BDFlatFn_SteamUser016_BLoggedOn_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_BLoggedOn");
  g_bd_flat_SteamUser016_GetSteamID = (BDFlatFn_SteamUser016_GetSteamID_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetSteamID");
  g_bd_accessor_steamfriends011 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamFriends_v018");
  g_bd_self_steamfriends011 = g_bd_accessor_steamfriends011 ? g_bd_accessor_steamfriends011() : NULL;
  g_bd_flat_SteamFriends011_GetPersonaName = (BDFlatFn_SteamFriends011_GetPersonaName_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetPersonaName");
  g_bd_flat_SteamFriends011_GetPersonaState = (BDFlatFn_SteamFriends011_GetPersonaState_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetPersonaState");
  g_bd_flat_SteamFriends011_GetFriendPersonaName = (BDFlatFn_SteamFriends011_GetFriendPersonaName_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetFriendPersonaName");
  g_bd_accessor_steamutils005 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUtils_v011");
  g_bd_self_steamutils005 = g_bd_accessor_steamutils005 ? g_bd_accessor_steamutils005() : NULL;
  g_bd_flat_SteamUtils005_GetSecondsSinceAppActive = (BDFlatFn_SteamUtils005_GetSecondsSinceAppActive_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSecondsSinceAppActive");
  g_bd_flat_SteamUtils005_GetSecondsSinceComputerActive = (BDFlatFn_SteamUtils005_GetSecondsSinceComputerActive_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSecondsSinceComputerActive");
  g_bd_flat_SteamUtils005_GetConnectedUniverse = (BDFlatFn_SteamUtils005_GetConnectedUniverse_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetConnectedUniverse");
  g_bd_flat_SteamUtils005_GetServerRealTime = (BDFlatFn_SteamUtils005_GetServerRealTime_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetServerRealTime");
  g_bd_flat_SteamUtils005_GetIPCountry = (BDFlatFn_SteamUtils005_GetIPCountry_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetIPCountry");
  g_bd_flat_SteamUtils005_GetCurrentBatteryPower = (BDFlatFn_SteamUtils005_GetCurrentBatteryPower_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetCurrentBatteryPower");
  g_bd_flat_SteamUtils005_GetAppID = (BDFlatFn_SteamUtils005_GetAppID_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetAppID");
  g_bd_flat_SteamUtils005_IsOverlayEnabled = (BDFlatFn_SteamUtils005_IsOverlayEnabled_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_IsOverlayEnabled");
  g_bd_accessor_steamapps_interface_version004 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamApps_v009");
  g_bd_self_steamapps_interface_version004 = g_bd_accessor_steamapps_interface_version004 ? g_bd_accessor_steamapps_interface_version004() : NULL;
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribed = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribed_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsSubscribed");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsLowViolence = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsLowViolence_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsLowViolence");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsCybercafe = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsCybercafe_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsCybercafe");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsVACBanned = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsVACBanned_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsVACBanned");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetCurrentGameLanguage");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetAvailableGameLanguages");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedApp = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedApp_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsSubscribedApp");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsDlcInstalled = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsDlcInstalled_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsDlcInstalled");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetEarliestPurchaseUnixTime = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_GetEarliestPurchaseUnixTime_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetEarliestPurchaseUnixTime");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedFromFreeWeekend = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedFromFreeWeekend_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsSubscribedFromFreeWeekend");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetDLCCount = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_GetDLCCount_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetDLCCount");
  g_bd_accessor_steamuserstats_interface_version010 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUserStats_v013");
  g_bd_self_steamuserstats_interface_version010 = g_bd_accessor_steamuserstats_interface_version010 ? g_bd_accessor_steamuserstats_interface_version010() : NULL;
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2 = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetStatFloat");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetStatInt32");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2 = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_SetStatFloat");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_SetStatInt32");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_UpdateAvgRateStat");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievement");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_SetAchievement");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_ClearAchievement");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievementAndUnlockTime");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_StoreStats = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_StoreStats_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_StoreStats");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievementDisplayAttribute");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_IndicateAchievementProgress");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_ResetAllStats = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_ResetAllStats_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_ResetAllStats");
  g_bd_accessor_steamfriends013 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamFriends_v018");
  g_bd_self_steamfriends013 = g_bd_accessor_steamfriends013 ? g_bd_accessor_steamfriends013() : NULL;
  g_bd_flat_SteamFriends013_GetPersonaName = (BDFlatFn_SteamFriends013_GetPersonaName_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetPersonaName");
  g_bd_flat_SteamFriends013_GetPersonaState = (BDFlatFn_SteamFriends013_GetPersonaState_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetPersonaState");
  g_bd_flat_SteamFriends013_GetFriendPersonaName = (BDFlatFn_SteamFriends013_GetFriendPersonaName_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetFriendPersonaName");
  g_bd_accessor_steamapps_interface_version005 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamApps_v009");
  g_bd_self_steamapps_interface_version005 = g_bd_accessor_steamapps_interface_version005 ? g_bd_accessor_steamapps_interface_version005() : NULL;
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribed = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribed_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsSubscribed");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsLowViolence = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsLowViolence_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsLowViolence");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsCybercafe = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsCybercafe_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsCybercafe");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsVACBanned = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsVACBanned_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsVACBanned");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetCurrentGameLanguage");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetAvailableGameLanguages");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedApp = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedApp_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsSubscribedApp");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsDlcInstalled = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsDlcInstalled_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsDlcInstalled");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetEarliestPurchaseUnixTime = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_GetEarliestPurchaseUnixTime_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetEarliestPurchaseUnixTime");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedFromFreeWeekend = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedFromFreeWeekend_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsSubscribedFromFreeWeekend");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetDLCCount = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_GetDLCCount_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetDLCCount");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsAppInstalled = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsAppInstalled_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsAppInstalled");
  g_bd_accessor_steamuserstats_interface_version011 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUserStats_v013");
  g_bd_self_steamuserstats_interface_version011 = g_bd_accessor_steamuserstats_interface_version011 ? g_bd_accessor_steamuserstats_interface_version011() : NULL;
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2 = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetStatFloat");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetStatInt32");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2 = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_SetStatFloat");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_SetStatInt32");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_UpdateAvgRateStat");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievement");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_SetAchievement");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_ClearAchievement");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievementAndUnlockTime");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_StoreStats = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_StoreStats_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_StoreStats");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievementDisplayAttribute");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_IndicateAchievementProgress");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetNumAchievements = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetNumAchievements_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetNumAchievements");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievementName");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_ResetAllStats = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_ResetAllStats_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_ResetAllStats");
  g_bd_accessor_steammatchmaking009 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamMatchmaking_v009");
  g_bd_self_steammatchmaking009 = g_bd_accessor_steammatchmaking009 ? g_bd_accessor_steammatchmaking009() : NULL;
  g_bd_flat_SteamMatchMaking009_GetFavoriteGameCount = (BDFlatFn_SteamMatchMaking009_GetFavoriteGameCount_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_GetFavoriteGameCount");
  g_bd_flat_SteamMatchMaking009_GetFavoriteGame = (BDFlatFn_SteamMatchMaking009_GetFavoriteGame_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_GetFavoriteGame");
  g_bd_flat_SteamMatchMaking009_AddFavoriteGame = (BDFlatFn_SteamMatchMaking009_AddFavoriteGame_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_AddFavoriteGame");
  g_bd_flat_SteamMatchMaking009_RemoveFavoriteGame = (BDFlatFn_SteamMatchMaking009_RemoveFavoriteGame_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_RemoveFavoriteGame");
  g_bd_flat_SteamMatchMaking009_RequestLobbyList = (BDFlatFn_SteamMatchMaking009_RequestLobbyList_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_RequestLobbyList");
  g_bd_flat_SteamMatchMaking009_AddRequestLobbyListStringFilter = (BDFlatFn_SteamMatchMaking009_AddRequestLobbyListStringFilter_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_AddRequestLobbyListStringFilter");
  g_bd_flat_SteamMatchMaking009_AddRequestLobbyListNumericalFilter = (BDFlatFn_SteamMatchMaking009_AddRequestLobbyListNumericalFilter_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_AddRequestLobbyListNumericalFilter");
  g_bd_flat_SteamMatchMaking009_AddRequestLobbyListNearValueFilter = (BDFlatFn_SteamMatchMaking009_AddRequestLobbyListNearValueFilter_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_AddRequestLobbyListNearValueFilter");
  g_bd_flat_SteamMatchMaking009_AddRequestLobbyListFilterSlotsAvailable = (BDFlatFn_SteamMatchMaking009_AddRequestLobbyListFilterSlotsAvailable_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_AddRequestLobbyListFilterSlotsAvailable");
  g_bd_flat_SteamMatchMaking009_AddRequestLobbyListDistanceFilter = (BDFlatFn_SteamMatchMaking009_AddRequestLobbyListDistanceFilter_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_AddRequestLobbyListDistanceFilter");
  g_bd_flat_SteamMatchMaking009_AddRequestLobbyListResultCountFilter = (BDFlatFn_SteamMatchMaking009_AddRequestLobbyListResultCountFilter_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_AddRequestLobbyListResultCountFilter");
  g_bd_flat_SteamMatchMaking009_AddRequestLobbyListCompatibleMembersFilter = (BDFlatFn_SteamMatchMaking009_AddRequestLobbyListCompatibleMembersFilter_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_AddRequestLobbyListCompatibleMembersFilter");
  g_bd_flat_SteamMatchMaking009_GetLobbyByIndex = (BDFlatFn_SteamMatchMaking009_GetLobbyByIndex_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_GetLobbyByIndex");
  g_bd_flat_SteamMatchMaking009_CreateLobby = (BDFlatFn_SteamMatchMaking009_CreateLobby_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_CreateLobby");
  g_bd_flat_SteamMatchMaking009_JoinLobby = (BDFlatFn_SteamMatchMaking009_JoinLobby_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_JoinLobby");
  g_bd_flat_SteamMatchMaking009_LeaveLobby = (BDFlatFn_SteamMatchMaking009_LeaveLobby_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_LeaveLobby");
  g_bd_flat_SteamMatchMaking009_InviteUserToLobby = (BDFlatFn_SteamMatchMaking009_InviteUserToLobby_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_InviteUserToLobby");
  g_bd_flat_SteamMatchMaking009_GetNumLobbyMembers = (BDFlatFn_SteamMatchMaking009_GetNumLobbyMembers_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_GetNumLobbyMembers");
  g_bd_flat_SteamMatchMaking009_GetLobbyMemberByIndex = (BDFlatFn_SteamMatchMaking009_GetLobbyMemberByIndex_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_GetLobbyMemberByIndex");
  g_bd_flat_SteamMatchMaking009_GetLobbyData = (BDFlatFn_SteamMatchMaking009_GetLobbyData_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_GetLobbyData");
  g_bd_flat_SteamMatchMaking009_SetLobbyData = (BDFlatFn_SteamMatchMaking009_SetLobbyData_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_SetLobbyData");
  g_bd_flat_SteamMatchMaking009_GetLobbyDataCount = (BDFlatFn_SteamMatchMaking009_GetLobbyDataCount_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_GetLobbyDataCount");
  g_bd_flat_SteamMatchMaking009_GetLobbyDataByIndex = (BDFlatFn_SteamMatchMaking009_GetLobbyDataByIndex_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_GetLobbyDataByIndex");
  g_bd_flat_SteamMatchMaking009_DeleteLobbyData = (BDFlatFn_SteamMatchMaking009_DeleteLobbyData_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_DeleteLobbyData");
  g_bd_flat_SteamMatchMaking009_GetLobbyMemberData = (BDFlatFn_SteamMatchMaking009_GetLobbyMemberData_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_GetLobbyMemberData");
  g_bd_flat_SteamMatchMaking009_SetLobbyMemberData = (BDFlatFn_SteamMatchMaking009_SetLobbyMemberData_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_SetLobbyMemberData");
  g_bd_flat_SteamMatchMaking009_SendLobbyChatMsg = (BDFlatFn_SteamMatchMaking009_SendLobbyChatMsg_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_SendLobbyChatMsg");
  g_bd_flat_SteamMatchMaking009_GetLobbyChatEntry = (BDFlatFn_SteamMatchMaking009_GetLobbyChatEntry_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_GetLobbyChatEntry");
  g_bd_flat_SteamMatchMaking009_RequestLobbyData = (BDFlatFn_SteamMatchMaking009_RequestLobbyData_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_RequestLobbyData");
  g_bd_flat_SteamMatchMaking009_SetLobbyGameServer = (BDFlatFn_SteamMatchMaking009_SetLobbyGameServer_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_SetLobbyGameServer");
  g_bd_flat_SteamMatchMaking009_GetLobbyGameServer = (BDFlatFn_SteamMatchMaking009_GetLobbyGameServer_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_GetLobbyGameServer");
  g_bd_flat_SteamMatchMaking009_SetLobbyMemberLimit = (BDFlatFn_SteamMatchMaking009_SetLobbyMemberLimit_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_SetLobbyMemberLimit");
  g_bd_flat_SteamMatchMaking009_GetLobbyMemberLimit = (BDFlatFn_SteamMatchMaking009_GetLobbyMemberLimit_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_GetLobbyMemberLimit");
  g_bd_flat_SteamMatchMaking009_SetLobbyType = (BDFlatFn_SteamMatchMaking009_SetLobbyType_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_SetLobbyType");
  g_bd_flat_SteamMatchMaking009_SetLobbyJoinable = (BDFlatFn_SteamMatchMaking009_SetLobbyJoinable_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_SetLobbyJoinable");
  g_bd_flat_SteamMatchMaking009_GetLobbyOwner = (BDFlatFn_SteamMatchMaking009_GetLobbyOwner_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_GetLobbyOwner");
  g_bd_flat_SteamMatchMaking009_SetLobbyOwner = (BDFlatFn_SteamMatchMaking009_SetLobbyOwner_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_SetLobbyOwner");
  g_bd_flat_SteamMatchMaking009_SetLinkedLobby = (BDFlatFn_SteamMatchMaking009_SetLinkedLobby_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmaking_SetLinkedLobby");
  g_bd_accessor_steamclient017 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamClient");
  g_bd_self_steamclient017 = g_bd_accessor_steamclient017 ? g_bd_accessor_steamclient017() : NULL;
  g_bd_flat_SteamClient017_CreateSteamPipe = (BDFlatFn_SteamClient017_CreateSteamPipe_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_CreateSteamPipe");
  g_bd_flat_SteamClient017_BReleaseSteamPipe = (BDFlatFn_SteamClient017_BReleaseSteamPipe_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_BReleaseSteamPipe");
  g_bd_flat_SteamClient017_ConnectToGlobalUser = (BDFlatFn_SteamClient017_ConnectToGlobalUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_ConnectToGlobalUser");
  g_bd_flat_SteamClient017_CreateLocalUser = (BDFlatFn_SteamClient017_CreateLocalUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_CreateLocalUser");
  g_bd_flat_SteamClient017_ReleaseUser = (BDFlatFn_SteamClient017_ReleaseUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_ReleaseUser");
  g_bd_flat_SteamClient017_GetISteamUser = (BDFlatFn_SteamClient017_GetISteamUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUser");
  g_bd_flat_SteamClient017_GetISteamGameServer = (BDFlatFn_SteamClient017_GetISteamGameServer_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamGameServer");
  g_bd_flat_SteamClient017_GetISteamFriends = (BDFlatFn_SteamClient017_GetISteamFriends_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamFriends");
  g_bd_flat_SteamClient017_GetISteamUtils = (BDFlatFn_SteamClient017_GetISteamUtils_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUtils");
  g_bd_flat_SteamClient017_GetISteamMatchmaking = (BDFlatFn_SteamClient017_GetISteamMatchmaking_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMatchmaking");
  g_bd_flat_SteamClient017_GetISteamMatchmakingServers = (BDFlatFn_SteamClient017_GetISteamMatchmakingServers_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMatchmakingServers");
  g_bd_flat_SteamClient017_GetISteamGenericInterface = (BDFlatFn_SteamClient017_GetISteamGenericInterface_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamGenericInterface");
  g_bd_flat_SteamClient017_GetISteamUserStats = (BDFlatFn_SteamClient017_GetISteamUserStats_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUserStats");
  g_bd_flat_SteamClient017_GetISteamGameServerStats = (BDFlatFn_SteamClient017_GetISteamGameServerStats_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamGameServerStats");
  g_bd_flat_SteamClient017_GetISteamApps = (BDFlatFn_SteamClient017_GetISteamApps_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamApps");
  g_bd_flat_SteamClient017_GetISteamNetworking = (BDFlatFn_SteamClient017_GetISteamNetworking_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamNetworking");
  g_bd_flat_SteamClient017_GetISteamRemoteStorage = (BDFlatFn_SteamClient017_GetISteamRemoteStorage_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamRemoteStorage");
  g_bd_flat_SteamClient017_GetISteamScreenshots = (BDFlatFn_SteamClient017_GetISteamScreenshots_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamScreenshots");
  g_bd_flat_SteamClient017_RunFrame = (BDFlatFn_SteamClient017_RunFrame_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_RunFrame");
  g_bd_flat_SteamClient017_GetIPCCallCount = (BDFlatFn_SteamClient017_GetIPCCallCount_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetIPCCallCount");
  g_bd_flat_SteamClient017_BShutdownIfAllPipesClosed = (BDFlatFn_SteamClient017_BShutdownIfAllPipesClosed_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_BShutdownIfAllPipesClosed");
  g_bd_flat_SteamClient017_GetISteamHTTP = (BDFlatFn_SteamClient017_GetISteamHTTP_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamHTTP");
  g_bd_flat_SteamClient017_DEPRECATED_GetISteamUnifiedMessages = (BDFlatFn_SteamClient017_DEPRECATED_GetISteamUnifiedMessages_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUnifiedMessages");
  g_bd_flat_SteamClient017_GetISteamController = (BDFlatFn_SteamClient017_GetISteamController_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamController");
  g_bd_flat_SteamClient017_GetISteamUGC = (BDFlatFn_SteamClient017_GetISteamUGC_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUGC");
  g_bd_flat_SteamClient017_GetISteamAppList = (BDFlatFn_SteamClient017_GetISteamAppList_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamAppList");
  g_bd_flat_SteamClient017_GetISteamMusic = (BDFlatFn_SteamClient017_GetISteamMusic_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMusic");
  g_bd_flat_SteamClient017_GetISteamMusicRemote = (BDFlatFn_SteamClient017_GetISteamMusicRemote_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMusicRemote");
  g_bd_flat_SteamClient017_GetISteamHTMLSurface = (BDFlatFn_SteamClient017_GetISteamHTMLSurface_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamHTMLSurface");
  g_bd_flat_SteamClient017_GetISteamInventory = (BDFlatFn_SteamClient017_GetISteamInventory_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamInventory");
  g_bd_flat_SteamClient017_GetISteamVideo = (BDFlatFn_SteamClient017_GetISteamVideo_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamVideo");
  g_bd_flat_SteamClient017_GetISteamParentalSettings = (BDFlatFn_SteamClient017_GetISteamParentalSettings_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamParentalSettings");
  g_bd_accessor_steamuser019 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUser_v023");
  g_bd_self_steamuser019 = g_bd_accessor_steamuser019 ? g_bd_accessor_steamuser019() : NULL;
  g_bd_flat_SteamUser019_GetHSteamUser = (BDFlatFn_SteamUser019_GetHSteamUser_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetHSteamUser");
  g_bd_flat_SteamUser019_BLoggedOn = (BDFlatFn_SteamUser019_BLoggedOn_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_BLoggedOn");
  g_bd_flat_SteamUser019_GetSteamID = (BDFlatFn_SteamUser019_GetSteamID_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetSteamID");
  g_bd_accessor_steamfriends015 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamFriends_v018");
  g_bd_self_steamfriends015 = g_bd_accessor_steamfriends015 ? g_bd_accessor_steamfriends015() : NULL;
  g_bd_flat_SteamFriends015_GetPersonaName = (BDFlatFn_SteamFriends015_GetPersonaName_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetPersonaName");
  g_bd_flat_SteamFriends015_GetPersonaState = (BDFlatFn_SteamFriends015_GetPersonaState_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetPersonaState");
  g_bd_flat_SteamFriends015_GetFriendPersonaName = (BDFlatFn_SteamFriends015_GetFriendPersonaName_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetFriendPersonaName");
  g_bd_accessor_steamutils008 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUtils_v011");
  g_bd_self_steamutils008 = g_bd_accessor_steamutils008 ? g_bd_accessor_steamutils008() : NULL;
  g_bd_flat_SteamUtils008_GetSecondsSinceAppActive = (BDFlatFn_SteamUtils008_GetSecondsSinceAppActive_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSecondsSinceAppActive");
  g_bd_flat_SteamUtils008_GetSecondsSinceComputerActive = (BDFlatFn_SteamUtils008_GetSecondsSinceComputerActive_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSecondsSinceComputerActive");
  g_bd_flat_SteamUtils008_GetConnectedUniverse = (BDFlatFn_SteamUtils008_GetConnectedUniverse_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetConnectedUniverse");
  g_bd_flat_SteamUtils008_GetServerRealTime = (BDFlatFn_SteamUtils008_GetServerRealTime_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetServerRealTime");
  g_bd_flat_SteamUtils008_GetIPCountry = (BDFlatFn_SteamUtils008_GetIPCountry_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetIPCountry");
  g_bd_flat_SteamUtils008_GetCurrentBatteryPower = (BDFlatFn_SteamUtils008_GetCurrentBatteryPower_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetCurrentBatteryPower");
  g_bd_flat_SteamUtils008_GetAppID = (BDFlatFn_SteamUtils008_GetAppID_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetAppID");
  g_bd_flat_SteamUtils008_IsOverlayEnabled = (BDFlatFn_SteamUtils008_IsOverlayEnabled_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_IsOverlayEnabled");
  g_bd_flat_SteamUtils008_GetSteamUILanguage = (BDFlatFn_SteamUtils008_GetSteamUILanguage_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSteamUILanguage");
  g_bd_flat_SteamUtils008_IsSteamRunningInVR = (BDFlatFn_SteamUtils008_IsSteamRunningInVR_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_IsSteamRunningInVR");
  g_bd_flat_SteamUtils008_IsSteamInBigPictureMode = (BDFlatFn_SteamUtils008_IsSteamInBigPictureMode_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_IsSteamInBigPictureMode");
  g_bd_accessor_steamapps_interface_version008 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamApps_v009");
  g_bd_self_steamapps_interface_version008 = g_bd_accessor_steamapps_interface_version008 ? g_bd_accessor_steamapps_interface_version008() : NULL;
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribed = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribed_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsSubscribed");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsLowViolence = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsLowViolence_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsLowViolence");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsCybercafe = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsCybercafe_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsCybercafe");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsVACBanned = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsVACBanned_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsVACBanned");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetCurrentGameLanguage = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetCurrentGameLanguage_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetCurrentGameLanguage");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetAvailableGameLanguages = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetAvailableGameLanguages_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetAvailableGameLanguages");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedApp = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedApp_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsSubscribedApp");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsDlcInstalled = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsDlcInstalled_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsDlcInstalled");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetEarliestPurchaseUnixTime = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetEarliestPurchaseUnixTime_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetEarliestPurchaseUnixTime");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedFromFreeWeekend = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedFromFreeWeekend_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsSubscribedFromFreeWeekend");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetDLCCount = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetDLCCount_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetDLCCount");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsAppInstalled = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsAppInstalled_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsAppInstalled");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetAppOwner = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetAppOwner_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetAppOwner");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetAppBuildId = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetAppBuildId_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetAppBuildId");
  g_bd_accessor_steamclient014 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamClient");
  g_bd_self_steamclient014 = g_bd_accessor_steamclient014 ? g_bd_accessor_steamclient014() : NULL;
  g_bd_flat_SteamClient014_CreateSteamPipe = (BDFlatFn_SteamClient014_CreateSteamPipe_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_CreateSteamPipe");
  g_bd_flat_SteamClient014_BReleaseSteamPipe = (BDFlatFn_SteamClient014_BReleaseSteamPipe_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_BReleaseSteamPipe");
  g_bd_flat_SteamClient014_ConnectToGlobalUser = (BDFlatFn_SteamClient014_ConnectToGlobalUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_ConnectToGlobalUser");
  g_bd_flat_SteamClient014_CreateLocalUser = (BDFlatFn_SteamClient014_CreateLocalUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_CreateLocalUser");
  g_bd_flat_SteamClient014_ReleaseUser = (BDFlatFn_SteamClient014_ReleaseUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_ReleaseUser");
  g_bd_flat_SteamClient014_GetISteamUser = (BDFlatFn_SteamClient014_GetISteamUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUser");
  g_bd_flat_SteamClient014_GetISteamGameServer = (BDFlatFn_SteamClient014_GetISteamGameServer_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamGameServer");
  g_bd_flat_SteamClient014_GetISteamFriends = (BDFlatFn_SteamClient014_GetISteamFriends_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamFriends");
  g_bd_flat_SteamClient014_GetISteamUtils = (BDFlatFn_SteamClient014_GetISteamUtils_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUtils");
  g_bd_flat_SteamClient014_GetISteamMatchmaking = (BDFlatFn_SteamClient014_GetISteamMatchmaking_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMatchmaking");
  g_bd_flat_SteamClient014_GetISteamMatchmakingServers = (BDFlatFn_SteamClient014_GetISteamMatchmakingServers_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMatchmakingServers");
  g_bd_flat_SteamClient014_GetISteamGenericInterface = (BDFlatFn_SteamClient014_GetISteamGenericInterface_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamGenericInterface");
  g_bd_flat_SteamClient014_GetISteamUserStats = (BDFlatFn_SteamClient014_GetISteamUserStats_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUserStats");
  g_bd_flat_SteamClient014_GetISteamGameServerStats = (BDFlatFn_SteamClient014_GetISteamGameServerStats_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamGameServerStats");
  g_bd_flat_SteamClient014_GetISteamApps = (BDFlatFn_SteamClient014_GetISteamApps_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamApps");
  g_bd_flat_SteamClient014_GetISteamNetworking = (BDFlatFn_SteamClient014_GetISteamNetworking_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamNetworking");
  g_bd_flat_SteamClient014_GetISteamRemoteStorage = (BDFlatFn_SteamClient014_GetISteamRemoteStorage_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamRemoteStorage");
  g_bd_flat_SteamClient014_GetISteamScreenshots = (BDFlatFn_SteamClient014_GetISteamScreenshots_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamScreenshots");
  g_bd_flat_SteamClient014_RunFrame = (BDFlatFn_SteamClient014_RunFrame_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_RunFrame");
  g_bd_flat_SteamClient014_GetIPCCallCount = (BDFlatFn_SteamClient014_GetIPCCallCount_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetIPCCallCount");
  g_bd_flat_SteamClient014_BShutdownIfAllPipesClosed = (BDFlatFn_SteamClient014_BShutdownIfAllPipesClosed_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_BShutdownIfAllPipesClosed");
  g_bd_flat_SteamClient014_GetISteamHTTP = (BDFlatFn_SteamClient014_GetISteamHTTP_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamHTTP");
  g_bd_flat_SteamClient014_GetISteamUnifiedMessages = (BDFlatFn_SteamClient014_GetISteamUnifiedMessages_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUnifiedMessages");
  g_bd_flat_SteamClient014_GetISteamController = (BDFlatFn_SteamClient014_GetISteamController_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamController");
  g_bd_flat_SteamClient014_GetISteamUGC = (BDFlatFn_SteamClient014_GetISteamUGC_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUGC");
  g_bd_flat_SteamClient014_GetISteamAppList = (BDFlatFn_SteamClient014_GetISteamAppList_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamAppList");
  g_bd_flat_SteamClient014_GetISteamMusic = (BDFlatFn_SteamClient014_GetISteamMusic_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMusic");
  g_bd_accessor_steamnetworking006 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamNetworking_v006");
  g_bd_self_steamnetworking006 = g_bd_accessor_steamnetworking006 ? g_bd_accessor_steamnetworking006() : NULL;
  g_bd_flat_SteamNetworking006_SendP2PPacket = (BDFlatFn_SteamNetworking006_SendP2PPacket_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworking_SendP2PPacket");
  g_bd_flat_SteamNetworking006_IsP2PPacketAvailable = (BDFlatFn_SteamNetworking006_IsP2PPacketAvailable_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworking_IsP2PPacketAvailable");
  g_bd_flat_SteamNetworking006_ReadP2PPacket = (BDFlatFn_SteamNetworking006_ReadP2PPacket_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworking_ReadP2PPacket");
  g_bd_flat_SteamNetworking006_AcceptP2PSessionWithUser = (BDFlatFn_SteamNetworking006_AcceptP2PSessionWithUser_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworking_AcceptP2PSessionWithUser");
  g_bd_flat_SteamNetworking006_CloseP2PSessionWithUser = (BDFlatFn_SteamNetworking006_CloseP2PSessionWithUser_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworking_CloseP2PSessionWithUser");
  g_bd_flat_SteamNetworking006_CloseP2PChannelWithUser = (BDFlatFn_SteamNetworking006_CloseP2PChannelWithUser_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworking_CloseP2PChannelWithUser");
  g_bd_flat_SteamNetworking006_GetP2PSessionState = (BDFlatFn_SteamNetworking006_GetP2PSessionState_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworking_GetP2PSessionState");
  g_bd_flat_SteamNetworking006_AllowP2PPacketRelay = (BDFlatFn_SteamNetworking006_AllowP2PPacketRelay_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworking_AllowP2PPacketRelay");
  g_bd_flat_SteamNetworking006_CreateP2PConnectionSocket = (BDFlatFn_SteamNetworking006_CreateP2PConnectionSocket_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworking_CreateP2PConnectionSocket");
  g_bd_flat_SteamNetworking006_DestroySocket = (BDFlatFn_SteamNetworking006_DestroySocket_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworking_DestroySocket");
  g_bd_flat_SteamNetworking006_DestroyListenSocket = (BDFlatFn_SteamNetworking006_DestroyListenSocket_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworking_DestroyListenSocket");
  g_bd_flat_SteamNetworking006_SendDataOnSocket = (BDFlatFn_SteamNetworking006_SendDataOnSocket_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworking_SendDataOnSocket");
  g_bd_flat_SteamNetworking006_IsDataAvailableOnSocket = (BDFlatFn_SteamNetworking006_IsDataAvailableOnSocket_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworking_IsDataAvailableOnSocket");
  g_bd_flat_SteamNetworking006_RetrieveDataFromSocket = (BDFlatFn_SteamNetworking006_RetrieveDataFromSocket_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworking_RetrieveDataFromSocket");
  g_bd_flat_SteamNetworking006_IsDataAvailable = (BDFlatFn_SteamNetworking006_IsDataAvailable_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworking_IsDataAvailable");
  g_bd_flat_SteamNetworking006_RetrieveData = (BDFlatFn_SteamNetworking006_RetrieveData_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworking_RetrieveData");
  g_bd_flat_SteamNetworking006_GetSocketConnectionType = (BDFlatFn_SteamNetworking006_GetSocketConnectionType_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworking_GetSocketConnectionType");
  g_bd_flat_SteamNetworking006_GetMaxPacketSize = (BDFlatFn_SteamNetworking006_GetMaxPacketSize_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworking_GetMaxPacketSize");
  g_bd_accessor_steamclient020 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamClient");
  g_bd_self_steamclient020 = g_bd_accessor_steamclient020 ? g_bd_accessor_steamclient020() : NULL;
  g_bd_flat_SteamClient020_CreateSteamPipe = (BDFlatFn_SteamClient020_CreateSteamPipe_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_CreateSteamPipe");
  g_bd_flat_SteamClient020_BReleaseSteamPipe = (BDFlatFn_SteamClient020_BReleaseSteamPipe_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_BReleaseSteamPipe");
  g_bd_flat_SteamClient020_ConnectToGlobalUser = (BDFlatFn_SteamClient020_ConnectToGlobalUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_ConnectToGlobalUser");
  g_bd_flat_SteamClient020_CreateLocalUser = (BDFlatFn_SteamClient020_CreateLocalUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_CreateLocalUser");
  g_bd_flat_SteamClient020_ReleaseUser = (BDFlatFn_SteamClient020_ReleaseUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_ReleaseUser");
  g_bd_flat_SteamClient020_GetISteamUser = (BDFlatFn_SteamClient020_GetISteamUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUser");
  g_bd_flat_SteamClient020_GetISteamGameServer = (BDFlatFn_SteamClient020_GetISteamGameServer_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamGameServer");
  g_bd_flat_SteamClient020_GetISteamFriends = (BDFlatFn_SteamClient020_GetISteamFriends_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamFriends");
  g_bd_flat_SteamClient020_GetISteamUtils = (BDFlatFn_SteamClient020_GetISteamUtils_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUtils");
  g_bd_flat_SteamClient020_GetISteamMatchmaking = (BDFlatFn_SteamClient020_GetISteamMatchmaking_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMatchmaking");
  g_bd_flat_SteamClient020_GetISteamMatchmakingServers = (BDFlatFn_SteamClient020_GetISteamMatchmakingServers_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMatchmakingServers");
  g_bd_flat_SteamClient020_GetISteamGenericInterface = (BDFlatFn_SteamClient020_GetISteamGenericInterface_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamGenericInterface");
  g_bd_flat_SteamClient020_GetISteamUserStats = (BDFlatFn_SteamClient020_GetISteamUserStats_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUserStats");
  g_bd_flat_SteamClient020_GetISteamGameServerStats = (BDFlatFn_SteamClient020_GetISteamGameServerStats_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamGameServerStats");
  g_bd_flat_SteamClient020_GetISteamApps = (BDFlatFn_SteamClient020_GetISteamApps_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamApps");
  g_bd_flat_SteamClient020_GetISteamNetworking = (BDFlatFn_SteamClient020_GetISteamNetworking_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamNetworking");
  g_bd_flat_SteamClient020_GetISteamRemoteStorage = (BDFlatFn_SteamClient020_GetISteamRemoteStorage_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamRemoteStorage");
  g_bd_flat_SteamClient020_GetISteamScreenshots = (BDFlatFn_SteamClient020_GetISteamScreenshots_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamScreenshots");
  g_bd_flat_SteamClient020_RunFrame = (BDFlatFn_SteamClient020_RunFrame_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_RunFrame");
  g_bd_flat_SteamClient020_GetIPCCallCount = (BDFlatFn_SteamClient020_GetIPCCallCount_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetIPCCallCount");
  g_bd_flat_SteamClient020_BShutdownIfAllPipesClosed = (BDFlatFn_SteamClient020_BShutdownIfAllPipesClosed_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_BShutdownIfAllPipesClosed");
  g_bd_flat_SteamClient020_GetISteamHTTP = (BDFlatFn_SteamClient020_GetISteamHTTP_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamHTTP");
  g_bd_flat_SteamClient020_DEPRECATED_GetISteamUnifiedMessages = (BDFlatFn_SteamClient020_DEPRECATED_GetISteamUnifiedMessages_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUnifiedMessages");
  g_bd_flat_SteamClient020_GetISteamController = (BDFlatFn_SteamClient020_GetISteamController_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamController");
  g_bd_flat_SteamClient020_GetISteamUGC = (BDFlatFn_SteamClient020_GetISteamUGC_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUGC");
  g_bd_flat_SteamClient020_GetISteamAppList = (BDFlatFn_SteamClient020_GetISteamAppList_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamAppList");
  g_bd_flat_SteamClient020_GetISteamMusic = (BDFlatFn_SteamClient020_GetISteamMusic_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMusic");
  g_bd_flat_SteamClient020_GetISteamMusicRemote = (BDFlatFn_SteamClient020_GetISteamMusicRemote_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMusicRemote");
  g_bd_flat_SteamClient020_GetISteamHTMLSurface = (BDFlatFn_SteamClient020_GetISteamHTMLSurface_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamHTMLSurface");
  g_bd_flat_SteamClient020_GetISteamInventory = (BDFlatFn_SteamClient020_GetISteamInventory_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamInventory");
  g_bd_flat_SteamClient020_GetISteamVideo = (BDFlatFn_SteamClient020_GetISteamVideo_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamVideo");
  g_bd_flat_SteamClient020_GetISteamParentalSettings = (BDFlatFn_SteamClient020_GetISteamParentalSettings_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamParentalSettings");
  g_bd_accessor_steamclient021 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamClient");
  g_bd_self_steamclient021 = g_bd_accessor_steamclient021 ? g_bd_accessor_steamclient021() : NULL;
  g_bd_flat_SteamClient021_CreateSteamPipe = (BDFlatFn_SteamClient021_CreateSteamPipe_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_CreateSteamPipe");
  g_bd_flat_SteamClient021_BReleaseSteamPipe = (BDFlatFn_SteamClient021_BReleaseSteamPipe_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_BReleaseSteamPipe");
  g_bd_flat_SteamClient021_ConnectToGlobalUser = (BDFlatFn_SteamClient021_ConnectToGlobalUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_ConnectToGlobalUser");
  g_bd_flat_SteamClient021_CreateLocalUser = (BDFlatFn_SteamClient021_CreateLocalUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_CreateLocalUser");
  g_bd_flat_SteamClient021_ReleaseUser = (BDFlatFn_SteamClient021_ReleaseUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_ReleaseUser");
  g_bd_flat_SteamClient021_GetISteamUser = (BDFlatFn_SteamClient021_GetISteamUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUser");
  g_bd_flat_SteamClient021_GetISteamGameServer = (BDFlatFn_SteamClient021_GetISteamGameServer_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamGameServer");
  g_bd_flat_SteamClient021_GetISteamFriends = (BDFlatFn_SteamClient021_GetISteamFriends_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamFriends");
  g_bd_flat_SteamClient021_GetISteamUtils = (BDFlatFn_SteamClient021_GetISteamUtils_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUtils");
  g_bd_flat_SteamClient021_GetISteamMatchmaking = (BDFlatFn_SteamClient021_GetISteamMatchmaking_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMatchmaking");
  g_bd_flat_SteamClient021_GetISteamMatchmakingServers = (BDFlatFn_SteamClient021_GetISteamMatchmakingServers_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMatchmakingServers");
  g_bd_flat_SteamClient021_GetISteamGenericInterface = (BDFlatFn_SteamClient021_GetISteamGenericInterface_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamGenericInterface");
  g_bd_flat_SteamClient021_GetISteamUserStats = (BDFlatFn_SteamClient021_GetISteamUserStats_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUserStats");
  g_bd_flat_SteamClient021_GetISteamGameServerStats = (BDFlatFn_SteamClient021_GetISteamGameServerStats_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamGameServerStats");
  g_bd_flat_SteamClient021_GetISteamApps = (BDFlatFn_SteamClient021_GetISteamApps_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamApps");
  g_bd_flat_SteamClient021_GetISteamNetworking = (BDFlatFn_SteamClient021_GetISteamNetworking_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamNetworking");
  g_bd_flat_SteamClient021_GetISteamRemoteStorage = (BDFlatFn_SteamClient021_GetISteamRemoteStorage_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamRemoteStorage");
  g_bd_flat_SteamClient021_GetISteamScreenshots = (BDFlatFn_SteamClient021_GetISteamScreenshots_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamScreenshots");
  g_bd_flat_SteamClient021_RunFrame = (BDFlatFn_SteamClient021_RunFrame_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_RunFrame");
  g_bd_flat_SteamClient021_GetIPCCallCount = (BDFlatFn_SteamClient021_GetIPCCallCount_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetIPCCallCount");
  g_bd_flat_SteamClient021_BShutdownIfAllPipesClosed = (BDFlatFn_SteamClient021_BShutdownIfAllPipesClosed_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_BShutdownIfAllPipesClosed");
  g_bd_flat_SteamClient021_GetISteamHTTP = (BDFlatFn_SteamClient021_GetISteamHTTP_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamHTTP");
  g_bd_flat_SteamClient021_GetISteamController = (BDFlatFn_SteamClient021_GetISteamController_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamController");
  g_bd_flat_SteamClient021_GetISteamUGC = (BDFlatFn_SteamClient021_GetISteamUGC_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUGC");
  g_bd_flat_SteamClient021_GetISteamMusic = (BDFlatFn_SteamClient021_GetISteamMusic_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMusic");
  g_bd_flat_SteamClient021_GetISteamMusicRemote = (BDFlatFn_SteamClient021_GetISteamMusicRemote_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMusicRemote");
  g_bd_flat_SteamClient021_GetISteamHTMLSurface = (BDFlatFn_SteamClient021_GetISteamHTMLSurface_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamHTMLSurface");
  g_bd_flat_SteamClient021_GetISteamInventory = (BDFlatFn_SteamClient021_GetISteamInventory_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamInventory");
  g_bd_flat_SteamClient021_GetISteamVideo = (BDFlatFn_SteamClient021_GetISteamVideo_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamVideo");
  g_bd_flat_SteamClient021_GetISteamParentalSettings = (BDFlatFn_SteamClient021_GetISteamParentalSettings_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamParentalSettings");
  g_bd_accessor_steamuser021 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUser_v023");
  g_bd_self_steamuser021 = g_bd_accessor_steamuser021 ? g_bd_accessor_steamuser021() : NULL;
  g_bd_flat_SteamUser021_GetHSteamUser = (BDFlatFn_SteamUser021_GetHSteamUser_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetHSteamUser");
  g_bd_flat_SteamUser021_BLoggedOn = (BDFlatFn_SteamUser021_BLoggedOn_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_BLoggedOn");
  g_bd_flat_SteamUser021_GetSteamID = (BDFlatFn_SteamUser021_GetSteamID_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetSteamID");
  g_bd_flat_SteamUser021_GetAuthSessionTicket = (BDFlatFn_SteamUser021_GetAuthSessionTicket_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetAuthSessionTicket");
  g_bd_flat_SteamUser021_CancelAuthTicket = (BDFlatFn_SteamUser021_CancelAuthTicket_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_CancelAuthTicket");
  g_bd_accessor_steamfriends017 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamFriends_v018");
  g_bd_self_steamfriends017 = g_bd_accessor_steamfriends017 ? g_bd_accessor_steamfriends017() : NULL;
  g_bd_flat_SteamFriends017_GetPersonaName = (BDFlatFn_SteamFriends017_GetPersonaName_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetPersonaName");
  g_bd_flat_SteamFriends017_GetPersonaState = (BDFlatFn_SteamFriends017_GetPersonaState_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetPersonaState");
  g_bd_flat_SteamFriends017_GetFriendPersonaName = (BDFlatFn_SteamFriends017_GetFriendPersonaName_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetFriendPersonaName");
  g_bd_flat_SteamFriends017_ActivateGameOverlayInviteDialog = (BDFlatFn_SteamFriends017_ActivateGameOverlayInviteDialog_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_ActivateGameOverlayInviteDialog");
  g_bd_accessor_steamutils010 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUtils_v011");
  g_bd_self_steamutils010 = g_bd_accessor_steamutils010 ? g_bd_accessor_steamutils010() : NULL;
  g_bd_flat_SteamUtils010_GetSecondsSinceAppActive = (BDFlatFn_SteamUtils010_GetSecondsSinceAppActive_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSecondsSinceAppActive");
  g_bd_flat_SteamUtils010_GetSecondsSinceComputerActive = (BDFlatFn_SteamUtils010_GetSecondsSinceComputerActive_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSecondsSinceComputerActive");
  g_bd_flat_SteamUtils010_GetConnectedUniverse = (BDFlatFn_SteamUtils010_GetConnectedUniverse_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetConnectedUniverse");
  g_bd_flat_SteamUtils010_GetServerRealTime = (BDFlatFn_SteamUtils010_GetServerRealTime_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetServerRealTime");
  g_bd_flat_SteamUtils010_GetIPCountry = (BDFlatFn_SteamUtils010_GetIPCountry_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetIPCountry");
  g_bd_flat_SteamUtils010_GetCurrentBatteryPower = (BDFlatFn_SteamUtils010_GetCurrentBatteryPower_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetCurrentBatteryPower");
  g_bd_flat_SteamUtils010_GetAppID = (BDFlatFn_SteamUtils010_GetAppID_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetAppID");
  g_bd_flat_SteamUtils010_IsOverlayEnabled = (BDFlatFn_SteamUtils010_IsOverlayEnabled_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_IsOverlayEnabled");
  g_bd_flat_SteamUtils010_GetSteamUILanguage = (BDFlatFn_SteamUtils010_GetSteamUILanguage_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSteamUILanguage");
  g_bd_flat_SteamUtils010_IsSteamRunningInVR = (BDFlatFn_SteamUtils010_IsSteamRunningInVR_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_IsSteamRunningInVR");
  g_bd_flat_SteamUtils010_IsSteamInBigPictureMode = (BDFlatFn_SteamUtils010_IsSteamInBigPictureMode_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_IsSteamInBigPictureMode");
  g_bd_accessor_steamuserstats_interface_version012 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUserStats_v013");
  g_bd_self_steamuserstats_interface_version012 = g_bd_accessor_steamuserstats_interface_version012 ? g_bd_accessor_steamuserstats_interface_version012() : NULL;
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2 = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetStatFloat");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetStatInt32");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2 = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_SetStatFloat");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_SetStatInt32");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_UpdateAvgRateStat");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievement");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_SetAchievement");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_ClearAchievement");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievementAndUnlockTime");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_StoreStats = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_StoreStats_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_StoreStats");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievementDisplayAttribute");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_IndicateAchievementProgress");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetNumAchievements = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetNumAchievements_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetNumAchievements");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementName = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementName_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievementName");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_ResetAllStats = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_ResetAllStats_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_ResetAllStats");
  g_bd_accessor_steamuserstats_interface_version013 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUserStats_v013");
  g_bd_self_steamuserstats_interface_version013 = g_bd_accessor_steamuserstats_interface_version013 ? g_bd_accessor_steamuserstats_interface_version013() : NULL;
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2 = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetStatFloat");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetStatInt32");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2 = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_SetStatFloat");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_SetStatInt32");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_UpdateAvgRateStat");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievement");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_SetAchievement");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_ClearAchievement");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievementAndUnlockTime");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_StoreStats = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_StoreStats_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_StoreStats");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievementDisplayAttribute");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_IndicateAchievementProgress");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetNumAchievements = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetNumAchievements_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetNumAchievements");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementName = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementName_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievementName");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_ResetAllStats = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_ResetAllStats_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_ResetAllStats");
  g_bd_accessor_steamutils009 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUtils_v011");
  g_bd_self_steamutils009 = g_bd_accessor_steamutils009 ? g_bd_accessor_steamutils009() : NULL;
  g_bd_flat_SteamUtils009_GetSecondsSinceAppActive = (BDFlatFn_SteamUtils009_GetSecondsSinceAppActive_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSecondsSinceAppActive");
  g_bd_flat_SteamUtils009_GetSecondsSinceComputerActive = (BDFlatFn_SteamUtils009_GetSecondsSinceComputerActive_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSecondsSinceComputerActive");
  g_bd_flat_SteamUtils009_GetConnectedUniverse = (BDFlatFn_SteamUtils009_GetConnectedUniverse_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetConnectedUniverse");
  g_bd_flat_SteamUtils009_GetServerRealTime = (BDFlatFn_SteamUtils009_GetServerRealTime_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetServerRealTime");
  g_bd_flat_SteamUtils009_GetIPCountry = (BDFlatFn_SteamUtils009_GetIPCountry_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetIPCountry");
  g_bd_flat_SteamUtils009_GetCurrentBatteryPower = (BDFlatFn_SteamUtils009_GetCurrentBatteryPower_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetCurrentBatteryPower");
  g_bd_flat_SteamUtils009_GetAppID = (BDFlatFn_SteamUtils009_GetAppID_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetAppID");
  g_bd_flat_SteamUtils009_IsOverlayEnabled = (BDFlatFn_SteamUtils009_IsOverlayEnabled_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_IsOverlayEnabled");
  g_bd_flat_SteamUtils009_GetSteamUILanguage = (BDFlatFn_SteamUtils009_GetSteamUILanguage_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSteamUILanguage");
  g_bd_flat_SteamUtils009_IsSteamRunningInVR = (BDFlatFn_SteamUtils009_IsSteamRunningInVR_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_IsSteamRunningInVR");
  g_bd_flat_SteamUtils009_IsSteamInBigPictureMode = (BDFlatFn_SteamUtils009_IsSteamInBigPictureMode_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_IsSteamInBigPictureMode");
  g_bd_accessor_steamuser018 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUser_v023");
  g_bd_self_steamuser018 = g_bd_accessor_steamuser018 ? g_bd_accessor_steamuser018() : NULL;
  g_bd_flat_SteamUser018_GetHSteamUser = (BDFlatFn_SteamUser018_GetHSteamUser_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetHSteamUser");
  g_bd_flat_SteamUser018_BLoggedOn = (BDFlatFn_SteamUser018_BLoggedOn_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_BLoggedOn");
  g_bd_flat_SteamUser018_GetSteamID = (BDFlatFn_SteamUser018_GetSteamID_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetSteamID");
  g_bd_flat_SteamUser018_GetAuthSessionTicket = (BDFlatFn_SteamUser018_GetAuthSessionTicket_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetAuthSessionTicket");
  g_bd_flat_SteamUser018_CancelAuthTicket = (BDFlatFn_SteamUser018_CancelAuthTicket_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_CancelAuthTicket");
  g_bd_accessor_steamutils007 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUtils_v011");
  g_bd_self_steamutils007 = g_bd_accessor_steamutils007 ? g_bd_accessor_steamutils007() : NULL;
  g_bd_flat_SteamUtils007_GetSecondsSinceAppActive = (BDFlatFn_SteamUtils007_GetSecondsSinceAppActive_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSecondsSinceAppActive");
  g_bd_flat_SteamUtils007_GetSecondsSinceComputerActive = (BDFlatFn_SteamUtils007_GetSecondsSinceComputerActive_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSecondsSinceComputerActive");
  g_bd_flat_SteamUtils007_GetConnectedUniverse = (BDFlatFn_SteamUtils007_GetConnectedUniverse_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetConnectedUniverse");
  g_bd_flat_SteamUtils007_GetServerRealTime = (BDFlatFn_SteamUtils007_GetServerRealTime_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetServerRealTime");
  g_bd_flat_SteamUtils007_GetIPCountry = (BDFlatFn_SteamUtils007_GetIPCountry_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetIPCountry");
  g_bd_flat_SteamUtils007_GetCurrentBatteryPower = (BDFlatFn_SteamUtils007_GetCurrentBatteryPower_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetCurrentBatteryPower");
  g_bd_flat_SteamUtils007_GetAppID = (BDFlatFn_SteamUtils007_GetAppID_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetAppID");
  g_bd_flat_SteamUtils007_IsOverlayEnabled = (BDFlatFn_SteamUtils007_IsOverlayEnabled_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_IsOverlayEnabled");
  g_bd_flat_SteamUtils007_GetSteamUILanguage = (BDFlatFn_SteamUtils007_GetSteamUILanguage_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSteamUILanguage");
  g_bd_flat_SteamUtils007_IsSteamRunningInVR = (BDFlatFn_SteamUtils007_IsSteamRunningInVR_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_IsSteamRunningInVR");
  g_bd_accessor_steamapps_interface_version007 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamApps_v009");
  g_bd_self_steamapps_interface_version007 = g_bd_accessor_steamapps_interface_version007 ? g_bd_accessor_steamapps_interface_version007() : NULL;
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribed = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribed_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsSubscribed");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsLowViolence = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsLowViolence_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsLowViolence");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsCybercafe = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsCybercafe_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsCybercafe");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsVACBanned = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsVACBanned_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsVACBanned");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetCurrentGameLanguage = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetCurrentGameLanguage_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetCurrentGameLanguage");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetAvailableGameLanguages = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetAvailableGameLanguages_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetAvailableGameLanguages");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedApp = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedApp_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsSubscribedApp");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsDlcInstalled = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsDlcInstalled_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsDlcInstalled");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetEarliestPurchaseUnixTime = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetEarliestPurchaseUnixTime_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetEarliestPurchaseUnixTime");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedFromFreeWeekend = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedFromFreeWeekend_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsSubscribedFromFreeWeekend");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetDLCCount = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetDLCCount_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetDLCCount");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsAppInstalled = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsAppInstalled_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsAppInstalled");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetAppOwner = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetAppOwner_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetAppOwner");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetAppBuildId = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetAppBuildId_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetAppBuildId");
  g_bd_accessor_steammatchmakingservers003 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamMatchmakingServers_v003");
  g_bd_self_steammatchmakingservers003 = g_bd_accessor_steammatchmakingservers003 ? g_bd_accessor_steammatchmakingservers003() : NULL;
  g_bd_flat_SteamMatchMakingServers003_RequestInternetServerList = (BDFlatFn_SteamMatchMakingServers003_RequestInternetServerList_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmakingServers_RequestInternetServerList");
  g_bd_flat_SteamMatchMakingServers003_RequestLANServerList = (BDFlatFn_SteamMatchMakingServers003_RequestLANServerList_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmakingServers_RequestLANServerList");
  g_bd_flat_SteamMatchMakingServers003_RequestFriendsServerList = (BDFlatFn_SteamMatchMakingServers003_RequestFriendsServerList_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmakingServers_RequestFriendsServerList");
  g_bd_flat_SteamMatchMakingServers003_RequestFavoritesServerList = (BDFlatFn_SteamMatchMakingServers003_RequestFavoritesServerList_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmakingServers_RequestFavoritesServerList");
  g_bd_flat_SteamMatchMakingServers003_RequestHistoryServerList = (BDFlatFn_SteamMatchMakingServers003_RequestHistoryServerList_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmakingServers_RequestHistoryServerList");
  g_bd_flat_SteamMatchMakingServers003_RequestSpectatorServerList = (BDFlatFn_SteamMatchMakingServers003_RequestSpectatorServerList_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmakingServers_RequestSpectatorServerList");
  g_bd_flat_SteamMatchMakingServers003_ReleaseRequest = (BDFlatFn_SteamMatchMakingServers003_ReleaseRequest_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmakingServers_ReleaseRequest");
  g_bd_flat_SteamMatchMakingServers003_GetServerDetails = (BDFlatFn_SteamMatchMakingServers003_GetServerDetails_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmakingServers_GetServerDetails");
  g_bd_flat_SteamMatchMakingServers003_CancelQuery = (BDFlatFn_SteamMatchMakingServers003_CancelQuery_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmakingServers_CancelQuery");
  g_bd_flat_SteamMatchMakingServers003_RefreshQuery = (BDFlatFn_SteamMatchMakingServers003_RefreshQuery_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmakingServers_RefreshQuery");
  g_bd_flat_SteamMatchMakingServers003_IsRefreshing = (BDFlatFn_SteamMatchMakingServers003_IsRefreshing_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmakingServers_IsRefreshing");
  g_bd_flat_SteamMatchMakingServers003_GetServerCount = (BDFlatFn_SteamMatchMakingServers003_GetServerCount_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmakingServers_GetServerCount");
  g_bd_flat_SteamMatchMakingServers003_RefreshServer = (BDFlatFn_SteamMatchMakingServers003_RefreshServer_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmakingServers_RefreshServer");
  g_bd_flat_SteamMatchMakingServers003_PingServer = (BDFlatFn_SteamMatchMakingServers003_PingServer_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmakingServers_PingServer");
  g_bd_flat_SteamMatchMakingServers003_PlayerDetails = (BDFlatFn_SteamMatchMakingServers003_PlayerDetails_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmakingServers_PlayerDetails");
  g_bd_flat_SteamMatchMakingServers003_ServerRules = (BDFlatFn_SteamMatchMakingServers003_ServerRules_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmakingServers_ServerRules");
  g_bd_flat_SteamMatchMakingServers003_ServerFriends = (BDFlatFn_SteamMatchMakingServers003_ServerFriends_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmakingServers_ServerFriends");
  g_bd_flat_SteamMatchMakingServers003_CancelServerQuery = (BDFlatFn_SteamMatchMakingServers003_CancelServerQuery_t)dlsym(dylibHandle, "SteamAPI_ISteamMatchmakingServers_CancelServerQuery");
  g_bd_accessor_steamnetworkingsockets013 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamNetworkingSockets_SteamAPI_v013");
  g_bd_self_steamnetworkingsockets013 = g_bd_accessor_steamnetworkingsockets013 ? g_bd_accessor_steamnetworkingsockets013() : NULL;
  g_bd_flat_SteamNetworkingSockets013_CreateListenSocketIP = (BDFlatFn_SteamNetworkingSockets013_CreateListenSocketIP_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_CreateListenSocketIP");
  g_bd_flat_SteamNetworkingSockets013_ConnectByIPAddress = (BDFlatFn_SteamNetworkingSockets013_ConnectByIPAddress_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_ConnectByIPAddress");
  g_bd_flat_SteamNetworkingSockets013_CreateListenSocketP2P = (BDFlatFn_SteamNetworkingSockets013_CreateListenSocketP2P_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_CreateListenSocketP2P");
  g_bd_flat_SteamNetworkingSockets013_ConnectP2P = (BDFlatFn_SteamNetworkingSockets013_ConnectP2P_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_ConnectP2P");
  g_bd_flat_SteamNetworkingSockets013_AcceptConnection = (BDFlatFn_SteamNetworkingSockets013_AcceptConnection_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_AcceptConnection");
  g_bd_flat_SteamNetworkingSockets013_CloseConnection = (BDFlatFn_SteamNetworkingSockets013_CloseConnection_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_CloseConnection");
  g_bd_flat_SteamNetworkingSockets013_CloseListenSocket = (BDFlatFn_SteamNetworkingSockets013_CloseListenSocket_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_CloseListenSocket");
  g_bd_flat_SteamNetworkingSockets013_SetConnectionUserData = (BDFlatFn_SteamNetworkingSockets013_SetConnectionUserData_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_SetConnectionUserData");
  g_bd_flat_SteamNetworkingSockets013_GetConnectionUserData = (BDFlatFn_SteamNetworkingSockets013_GetConnectionUserData_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_GetConnectionUserData");
  g_bd_flat_SteamNetworkingSockets013_SetConnectionName = (BDFlatFn_SteamNetworkingSockets013_SetConnectionName_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_SetConnectionName");
  g_bd_flat_SteamNetworkingSockets013_GetConnectionName = (BDFlatFn_SteamNetworkingSockets013_GetConnectionName_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_GetConnectionName");
  g_bd_flat_SteamNetworkingSockets013_SendMessageToConnection = (BDFlatFn_SteamNetworkingSockets013_SendMessageToConnection_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_SendMessageToConnection");
  g_bd_flat_SteamNetworkingSockets013_FlushMessagesOnConnection = (BDFlatFn_SteamNetworkingSockets013_FlushMessagesOnConnection_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_FlushMessagesOnConnection");
  g_bd_flat_SteamNetworkingSockets013_ReceiveMessagesOnConnection = (BDFlatFn_SteamNetworkingSockets013_ReceiveMessagesOnConnection_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_ReceiveMessagesOnConnection");
  g_bd_flat_SteamNetworkingSockets013_GetConnectionInfo = (BDFlatFn_SteamNetworkingSockets013_GetConnectionInfo_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_GetConnectionInfo");
  g_bd_flat_SteamNetworkingSockets013_GetConnectionRealTimeStatus = (BDFlatFn_SteamNetworkingSockets013_GetConnectionRealTimeStatus_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_GetConnectionRealTimeStatus");
  g_bd_flat_SteamNetworkingSockets013_GetDetailedConnectionStatus = (BDFlatFn_SteamNetworkingSockets013_GetDetailedConnectionStatus_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_GetDetailedConnectionStatus");
  g_bd_flat_SteamNetworkingSockets013_GetListenSocketAddress = (BDFlatFn_SteamNetworkingSockets013_GetListenSocketAddress_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_GetListenSocketAddress");
  g_bd_flat_SteamNetworkingSockets013_CreateSocketPair = (BDFlatFn_SteamNetworkingSockets013_CreateSocketPair_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_CreateSocketPair");
  g_bd_flat_SteamNetworkingSockets013_ConfigureConnectionLanes = (BDFlatFn_SteamNetworkingSockets013_ConfigureConnectionLanes_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_ConfigureConnectionLanes");
  g_bd_flat_SteamNetworkingSockets013_GetIdentity = (BDFlatFn_SteamNetworkingSockets013_GetIdentity_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_GetIdentity");
  g_bd_flat_SteamNetworkingSockets013_InitAuthentication = (BDFlatFn_SteamNetworkingSockets013_InitAuthentication_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_InitAuthentication");
  g_bd_flat_SteamNetworkingSockets013_GetAuthenticationStatus = (BDFlatFn_SteamNetworkingSockets013_GetAuthenticationStatus_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_GetAuthenticationStatus");
  g_bd_flat_SteamNetworkingSockets013_CreatePollGroup = (BDFlatFn_SteamNetworkingSockets013_CreatePollGroup_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_CreatePollGroup");
  g_bd_flat_SteamNetworkingSockets013_DestroyPollGroup = (BDFlatFn_SteamNetworkingSockets013_DestroyPollGroup_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_DestroyPollGroup");
  g_bd_flat_SteamNetworkingSockets013_SetConnectionPollGroup = (BDFlatFn_SteamNetworkingSockets013_SetConnectionPollGroup_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_SetConnectionPollGroup");
  g_bd_flat_SteamNetworkingSockets013_ReceiveMessagesOnPollGroup = (BDFlatFn_SteamNetworkingSockets013_ReceiveMessagesOnPollGroup_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_ReceiveMessagesOnPollGroup");
  g_bd_flat_SteamNetworkingSockets013_ResetIdentity = (BDFlatFn_SteamNetworkingSockets013_ResetIdentity_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_ResetIdentity");
  g_bd_accessor_steamnetworkingutils004 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamNetworkingUtils_SteamAPI_v004");
  g_bd_self_steamnetworkingutils004 = g_bd_accessor_steamnetworkingutils004 ? g_bd_accessor_steamnetworkingutils004() : NULL;
  g_bd_flat_SteamNetworkingUtils004_GetRelayNetworkStatus = (BDFlatFn_SteamNetworkingUtils004_GetRelayNetworkStatus_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingUtils_GetRelayNetworkStatus");
  g_bd_flat_SteamNetworkingUtils004_GetLocalPingLocation = (BDFlatFn_SteamNetworkingUtils004_GetLocalPingLocation_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingUtils_GetLocalPingLocation");
  g_bd_flat_SteamNetworkingUtils004_EstimatePingTimeBetweenTwoLocations = (BDFlatFn_SteamNetworkingUtils004_EstimatePingTimeBetweenTwoLocations_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingUtils_EstimatePingTimeBetweenTwoLocations");
  g_bd_flat_SteamNetworkingUtils004_EstimatePingTimeFromLocalHost = (BDFlatFn_SteamNetworkingUtils004_EstimatePingTimeFromLocalHost_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingUtils_EstimatePingTimeFromLocalHost");
  g_bd_flat_SteamNetworkingUtils004_ConvertPingLocationToString = (BDFlatFn_SteamNetworkingUtils004_ConvertPingLocationToString_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingUtils_ConvertPingLocationToString");
  g_bd_flat_SteamNetworkingUtils004_ParsePingLocationString = (BDFlatFn_SteamNetworkingUtils004_ParsePingLocationString_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingUtils_ParsePingLocationString");
  g_bd_flat_SteamNetworkingUtils004_CheckPingDataUpToDate = (BDFlatFn_SteamNetworkingUtils004_CheckPingDataUpToDate_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingUtils_CheckPingDataUpToDate");
  g_bd_flat_SteamNetworkingUtils004_GetPingToDataCenter = (BDFlatFn_SteamNetworkingUtils004_GetPingToDataCenter_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingUtils_GetPingToDataCenter");
  g_bd_flat_SteamNetworkingUtils004_GetDirectPingToPOP = (BDFlatFn_SteamNetworkingUtils004_GetDirectPingToPOP_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingUtils_GetDirectPingToPOP");
  g_bd_flat_SteamNetworkingUtils004_GetPOPCount = (BDFlatFn_SteamNetworkingUtils004_GetPOPCount_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingUtils_GetPOPCount");
  g_bd_flat_SteamNetworkingUtils004_GetPOPList = (BDFlatFn_SteamNetworkingUtils004_GetPOPList_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingUtils_GetPOPList");
  g_bd_flat_SteamNetworkingUtils004_GetLocalTimestamp = (BDFlatFn_SteamNetworkingUtils004_GetLocalTimestamp_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingUtils_GetLocalTimestamp");
  g_bd_flat_SteamNetworkingUtils004_GetIPv4FakeIPType = (BDFlatFn_SteamNetworkingUtils004_GetIPv4FakeIPType_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingUtils_GetIPv4FakeIPType");
  g_bd_flat_SteamNetworkingUtils004_GetRealIdentityForFakeIP = (BDFlatFn_SteamNetworkingUtils004_GetRealIdentityForFakeIP_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingUtils_GetRealIdentityForFakeIP");
  g_bd_flat_SteamNetworkingUtils004_SetConfigValue = (BDFlatFn_SteamNetworkingUtils004_SetConfigValue_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingUtils_SetConfigValue");
  g_bd_flat_SteamNetworkingUtils004_GetConfigValue = (BDFlatFn_SteamNetworkingUtils004_GetConfigValue_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingUtils_GetConfigValue");
  g_bd_flat_SteamNetworkingUtils004_GetConfigValueInfo = (BDFlatFn_SteamNetworkingUtils004_GetConfigValueInfo_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingUtils_GetConfigValueInfo");
  g_bd_flat_SteamNetworkingUtils004_IterateGenericEditableConfigValues = (BDFlatFn_SteamNetworkingUtils004_IterateGenericEditableConfigValues_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingUtils_IterateGenericEditableConfigValues");
  g_bd_accessor_steamnetworkingmessages002 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamNetworkingMessages_SteamAPI_v002");
  g_bd_self_steamnetworkingmessages002 = g_bd_accessor_steamnetworkingmessages002 ? g_bd_accessor_steamnetworkingmessages002() : NULL;
  g_bd_flat_SteamNetworkingMessages002_SendMessageToUser = (BDFlatFn_SteamNetworkingMessages002_SendMessageToUser_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingMessages_SendMessageToUser");
  g_bd_flat_SteamNetworkingMessages002_ReceiveMessagesOnChannel = (BDFlatFn_SteamNetworkingMessages002_ReceiveMessagesOnChannel_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingMessages_ReceiveMessagesOnChannel");
  g_bd_flat_SteamNetworkingMessages002_AcceptSessionWithUser = (BDFlatFn_SteamNetworkingMessages002_AcceptSessionWithUser_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingMessages_AcceptSessionWithUser");
  g_bd_flat_SteamNetworkingMessages002_CloseSessionWithUser = (BDFlatFn_SteamNetworkingMessages002_CloseSessionWithUser_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingMessages_CloseSessionWithUser");
  g_bd_flat_SteamNetworkingMessages002_CloseChannelWithUser = (BDFlatFn_SteamNetworkingMessages002_CloseChannelWithUser_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingMessages_CloseChannelWithUser");
  g_bd_flat_SteamNetworkingMessages002_GetSessionConnectionInfo = (BDFlatFn_SteamNetworkingMessages002_GetSessionConnectionInfo_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingMessages_GetSessionConnectionInfo");
  g_bd_accessor_steamnetworkingsockets012 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamNetworkingSockets_SteamAPI_v013");
  g_bd_self_steamnetworkingsockets012 = g_bd_accessor_steamnetworkingsockets012 ? g_bd_accessor_steamnetworkingsockets012() : NULL;
  g_bd_flat_SteamNetworkingSockets012_CreateListenSocketIP = (BDFlatFn_SteamNetworkingSockets012_CreateListenSocketIP_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_CreateListenSocketIP");
  g_bd_flat_SteamNetworkingSockets012_ConnectByIPAddress = (BDFlatFn_SteamNetworkingSockets012_ConnectByIPAddress_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_ConnectByIPAddress");
  g_bd_flat_SteamNetworkingSockets012_CreateListenSocketP2P = (BDFlatFn_SteamNetworkingSockets012_CreateListenSocketP2P_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_CreateListenSocketP2P");
  g_bd_flat_SteamNetworkingSockets012_ConnectP2P = (BDFlatFn_SteamNetworkingSockets012_ConnectP2P_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_ConnectP2P");
  g_bd_flat_SteamNetworkingSockets012_AcceptConnection = (BDFlatFn_SteamNetworkingSockets012_AcceptConnection_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_AcceptConnection");
  g_bd_flat_SteamNetworkingSockets012_CloseConnection = (BDFlatFn_SteamNetworkingSockets012_CloseConnection_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_CloseConnection");
  g_bd_flat_SteamNetworkingSockets012_CloseListenSocket = (BDFlatFn_SteamNetworkingSockets012_CloseListenSocket_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_CloseListenSocket");
  g_bd_flat_SteamNetworkingSockets012_SetConnectionUserData = (BDFlatFn_SteamNetworkingSockets012_SetConnectionUserData_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_SetConnectionUserData");
  g_bd_flat_SteamNetworkingSockets012_GetConnectionUserData = (BDFlatFn_SteamNetworkingSockets012_GetConnectionUserData_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_GetConnectionUserData");
  g_bd_flat_SteamNetworkingSockets012_SetConnectionName = (BDFlatFn_SteamNetworkingSockets012_SetConnectionName_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_SetConnectionName");
  g_bd_flat_SteamNetworkingSockets012_GetConnectionName = (BDFlatFn_SteamNetworkingSockets012_GetConnectionName_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_GetConnectionName");
  g_bd_flat_SteamNetworkingSockets012_SendMessageToConnection = (BDFlatFn_SteamNetworkingSockets012_SendMessageToConnection_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_SendMessageToConnection");
  g_bd_flat_SteamNetworkingSockets012_FlushMessagesOnConnection = (BDFlatFn_SteamNetworkingSockets012_FlushMessagesOnConnection_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_FlushMessagesOnConnection");
  g_bd_flat_SteamNetworkingSockets012_ReceiveMessagesOnConnection = (BDFlatFn_SteamNetworkingSockets012_ReceiveMessagesOnConnection_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_ReceiveMessagesOnConnection");
  g_bd_flat_SteamNetworkingSockets012_GetConnectionInfo = (BDFlatFn_SteamNetworkingSockets012_GetConnectionInfo_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_GetConnectionInfo");
  g_bd_flat_SteamNetworkingSockets012_GetConnectionRealTimeStatus = (BDFlatFn_SteamNetworkingSockets012_GetConnectionRealTimeStatus_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_GetConnectionRealTimeStatus");
  g_bd_flat_SteamNetworkingSockets012_GetDetailedConnectionStatus = (BDFlatFn_SteamNetworkingSockets012_GetDetailedConnectionStatus_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_GetDetailedConnectionStatus");
  g_bd_flat_SteamNetworkingSockets012_GetListenSocketAddress = (BDFlatFn_SteamNetworkingSockets012_GetListenSocketAddress_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_GetListenSocketAddress");
  g_bd_flat_SteamNetworkingSockets012_CreateSocketPair = (BDFlatFn_SteamNetworkingSockets012_CreateSocketPair_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_CreateSocketPair");
  g_bd_flat_SteamNetworkingSockets012_ConfigureConnectionLanes = (BDFlatFn_SteamNetworkingSockets012_ConfigureConnectionLanes_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_ConfigureConnectionLanes");
  g_bd_flat_SteamNetworkingSockets012_GetIdentity = (BDFlatFn_SteamNetworkingSockets012_GetIdentity_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_GetIdentity");
  g_bd_flat_SteamNetworkingSockets012_InitAuthentication = (BDFlatFn_SteamNetworkingSockets012_InitAuthentication_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_InitAuthentication");
  g_bd_flat_SteamNetworkingSockets012_GetAuthenticationStatus = (BDFlatFn_SteamNetworkingSockets012_GetAuthenticationStatus_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_GetAuthenticationStatus");
  g_bd_flat_SteamNetworkingSockets012_CreatePollGroup = (BDFlatFn_SteamNetworkingSockets012_CreatePollGroup_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_CreatePollGroup");
  g_bd_flat_SteamNetworkingSockets012_DestroyPollGroup = (BDFlatFn_SteamNetworkingSockets012_DestroyPollGroup_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_DestroyPollGroup");
  g_bd_flat_SteamNetworkingSockets012_SetConnectionPollGroup = (BDFlatFn_SteamNetworkingSockets012_SetConnectionPollGroup_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_SetConnectionPollGroup");
  g_bd_flat_SteamNetworkingSockets012_ReceiveMessagesOnPollGroup = (BDFlatFn_SteamNetworkingSockets012_ReceiveMessagesOnPollGroup_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_ReceiveMessagesOnPollGroup");
  g_bd_flat_SteamNetworkingSockets012_ResetIdentity = (BDFlatFn_SteamNetworkingSockets012_ResetIdentity_t)dlsym(dylibHandle, "SteamAPI_ISteamNetworkingSockets_ResetIdentity");
  return 1;
}

// 53-06 (D-53-13): game-originated call trace tables. Not a wire tuple,
// so BRIDGE_DISPATCH_TABLE_HASH is unaffected.
#define BD_CALL_COUNT 473
static int bd_call_index(uint16_t ordinal, uint16_t slot) {
  switch (((uint32_t)ordinal << 16) | (uint32_t)slot) {
    case (((uint32_t)BD_ORDINAL_SteamUser023 << 16) | (uint32_t)BD_SLOT_SteamUser023_GetHSteamUser): return 0;
    case (((uint32_t)BD_ORDINAL_SteamUser023 << 16) | (uint32_t)BD_SLOT_SteamUser023_BLoggedOn): return 1;
    case (((uint32_t)BD_ORDINAL_SteamUser023 << 16) | (uint32_t)BD_SLOT_SteamUser023_GetSteamID): return 2;
    case (((uint32_t)BD_ORDINAL_SteamUser023 << 16) | (uint32_t)BD_SLOT_SteamUser023_GetAuthSessionTicket): return 3;
    case (((uint32_t)BD_ORDINAL_SteamUser023 << 16) | (uint32_t)BD_SLOT_SteamUser023_GetAuthTicketForWebApi): return 4;
    case (((uint32_t)BD_ORDINAL_SteamUser023 << 16) | (uint32_t)BD_SLOT_SteamUser023_CancelAuthTicket): return 5;
    case (((uint32_t)BD_ORDINAL_SteamFriends018 << 16) | (uint32_t)BD_SLOT_SteamFriends018_GetPersonaName): return 6;
    case (((uint32_t)BD_ORDINAL_SteamFriends018 << 16) | (uint32_t)BD_SLOT_SteamFriends018_GetPersonaState): return 7;
    case (((uint32_t)BD_ORDINAL_SteamFriends018 << 16) | (uint32_t)BD_SLOT_SteamFriends018_GetFriendPersonaName): return 8;
    case (((uint32_t)BD_ORDINAL_SteamUser016 << 16) | (uint32_t)BD_SLOT_SteamUser016_GetHSteamUser): return 9;
    case (((uint32_t)BD_ORDINAL_SteamUser016 << 16) | (uint32_t)BD_SLOT_SteamUser016_BLoggedOn): return 10;
    case (((uint32_t)BD_ORDINAL_SteamUser016 << 16) | (uint32_t)BD_SLOT_SteamUser016_GetSteamID): return 11;
    case (((uint32_t)BD_ORDINAL_SteamFriends011 << 16) | (uint32_t)BD_SLOT_SteamFriends011_GetPersonaName): return 12;
    case (((uint32_t)BD_ORDINAL_SteamFriends011 << 16) | (uint32_t)BD_SLOT_SteamFriends011_GetPersonaState): return 13;
    case (((uint32_t)BD_ORDINAL_SteamFriends011 << 16) | (uint32_t)BD_SLOT_SteamFriends011_GetFriendPersonaName): return 14;
    case (((uint32_t)BD_ORDINAL_SteamUtils005 << 16) | (uint32_t)BD_SLOT_SteamUtils005_GetSecondsSinceAppActive): return 15;
    case (((uint32_t)BD_ORDINAL_SteamUtils005 << 16) | (uint32_t)BD_SLOT_SteamUtils005_GetSecondsSinceComputerActive): return 16;
    case (((uint32_t)BD_ORDINAL_SteamUtils005 << 16) | (uint32_t)BD_SLOT_SteamUtils005_GetConnectedUniverse): return 17;
    case (((uint32_t)BD_ORDINAL_SteamUtils005 << 16) | (uint32_t)BD_SLOT_SteamUtils005_GetServerRealTime): return 18;
    case (((uint32_t)BD_ORDINAL_SteamUtils005 << 16) | (uint32_t)BD_SLOT_SteamUtils005_GetIPCountry): return 19;
    case (((uint32_t)BD_ORDINAL_SteamUtils005 << 16) | (uint32_t)BD_SLOT_SteamUtils005_GetCurrentBatteryPower): return 20;
    case (((uint32_t)BD_ORDINAL_SteamUtils005 << 16) | (uint32_t)BD_SLOT_SteamUtils005_GetAppID): return 21;
    case (((uint32_t)BD_ORDINAL_SteamUtils005 << 16) | (uint32_t)BD_SLOT_SteamUtils005_IsOverlayEnabled): return 22;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION004 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribed): return 23;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION004 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsLowViolence): return 24;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION004 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsCybercafe): return 25;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION004 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsVACBanned): return 26;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION004 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage): return 27;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION004 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages): return 28;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION004 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedApp): return 29;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION004 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsDlcInstalled): return 30;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION004 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_GetEarliestPurchaseUnixTime): return 31;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION004 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedFromFreeWeekend): return 32;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION004 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_GetDLCCount): return 33;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2): return 34;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat): return 35;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2): return 36;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat): return 37;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat): return 38;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement): return 39;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement): return 40;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement): return 41;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime): return 42;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_StoreStats): return 43;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute): return 44;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress): return 45;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_ResetAllStats): return 46;
    case (((uint32_t)BD_ORDINAL_SteamFriends013 << 16) | (uint32_t)BD_SLOT_SteamFriends013_GetPersonaName): return 47;
    case (((uint32_t)BD_ORDINAL_SteamFriends013 << 16) | (uint32_t)BD_SLOT_SteamFriends013_GetPersonaState): return 48;
    case (((uint32_t)BD_ORDINAL_SteamFriends013 << 16) | (uint32_t)BD_SLOT_SteamFriends013_GetFriendPersonaName): return 49;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribed): return 50;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsLowViolence): return 51;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsCybercafe): return 52;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsVACBanned): return 53;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage): return 54;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages): return 55;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedApp): return 56;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsDlcInstalled): return 57;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_GetEarliestPurchaseUnixTime): return 58;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedFromFreeWeekend): return 59;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_GetDLCCount): return 60;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsAppInstalled): return 61;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2): return 62;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat): return 63;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2): return 64;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat): return 65;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat): return 66;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement): return 67;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement): return 68;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement): return 69;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime): return 70;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_StoreStats): return 71;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute): return 72;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress): return 73;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetNumAchievements): return 74;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName): return 75;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_ResetAllStats): return 76;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_GetFavoriteGameCount): return 77;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_GetFavoriteGame): return 78;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_AddFavoriteGame): return 79;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_RemoveFavoriteGame): return 80;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_RequestLobbyList): return 81;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_AddRequestLobbyListStringFilter): return 82;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_AddRequestLobbyListNumericalFilter): return 83;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_AddRequestLobbyListNearValueFilter): return 84;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_AddRequestLobbyListFilterSlotsAvailable): return 85;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_AddRequestLobbyListDistanceFilter): return 86;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_AddRequestLobbyListResultCountFilter): return 87;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_AddRequestLobbyListCompatibleMembersFilter): return 88;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_GetLobbyByIndex): return 89;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_CreateLobby): return 90;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_JoinLobby): return 91;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_LeaveLobby): return 92;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_InviteUserToLobby): return 93;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_GetNumLobbyMembers): return 94;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_GetLobbyMemberByIndex): return 95;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_GetLobbyData): return 96;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_SetLobbyData): return 97;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_GetLobbyDataCount): return 98;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_GetLobbyDataByIndex): return 99;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_DeleteLobbyData): return 100;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_GetLobbyMemberData): return 101;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_SetLobbyMemberData): return 102;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_SendLobbyChatMsg): return 103;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_GetLobbyChatEntry): return 104;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_RequestLobbyData): return 105;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_SetLobbyGameServer): return 106;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_GetLobbyGameServer): return 107;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_SetLobbyMemberLimit): return 108;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_GetLobbyMemberLimit): return 109;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_SetLobbyType): return 110;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_SetLobbyJoinable): return 111;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_GetLobbyOwner): return 112;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_SetLobbyOwner): return 113;
    case (((uint32_t)BD_ORDINAL_SteamMatchMaking009 << 16) | (uint32_t)BD_SLOT_SteamMatchMaking009_SetLinkedLobby): return 114;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_CreateSteamPipe): return 115;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_BReleaseSteamPipe): return 116;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_ConnectToGlobalUser): return 117;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_CreateLocalUser): return 118;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_ReleaseUser): return 119;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamUser): return 120;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamGameServer): return 121;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamFriends): return 122;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamUtils): return 123;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamMatchmaking): return 124;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamMatchmakingServers): return 125;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamGenericInterface): return 126;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamUserStats): return 127;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamGameServerStats): return 128;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamApps): return 129;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamNetworking): return 130;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamRemoteStorage): return 131;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamScreenshots): return 132;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_RunFrame): return 133;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetIPCCallCount): return 134;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_BShutdownIfAllPipesClosed): return 135;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamHTTP): return 136;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_DEPRECATED_GetISteamUnifiedMessages): return 137;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamController): return 138;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamUGC): return 139;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamAppList): return 140;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamMusic): return 141;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamMusicRemote): return 142;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamHTMLSurface): return 143;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamInventory): return 144;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamVideo): return 145;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamParentalSettings): return 146;
    case (((uint32_t)BD_ORDINAL_SteamUser019 << 16) | (uint32_t)BD_SLOT_SteamUser019_GetHSteamUser): return 147;
    case (((uint32_t)BD_ORDINAL_SteamUser019 << 16) | (uint32_t)BD_SLOT_SteamUser019_BLoggedOn): return 148;
    case (((uint32_t)BD_ORDINAL_SteamUser019 << 16) | (uint32_t)BD_SLOT_SteamUser019_GetSteamID): return 149;
    case (((uint32_t)BD_ORDINAL_SteamFriends015 << 16) | (uint32_t)BD_SLOT_SteamFriends015_GetPersonaName): return 150;
    case (((uint32_t)BD_ORDINAL_SteamFriends015 << 16) | (uint32_t)BD_SLOT_SteamFriends015_GetPersonaState): return 151;
    case (((uint32_t)BD_ORDINAL_SteamFriends015 << 16) | (uint32_t)BD_SLOT_SteamFriends015_GetFriendPersonaName): return 152;
    case (((uint32_t)BD_ORDINAL_SteamUtils008 << 16) | (uint32_t)BD_SLOT_SteamUtils008_GetSecondsSinceAppActive): return 153;
    case (((uint32_t)BD_ORDINAL_SteamUtils008 << 16) | (uint32_t)BD_SLOT_SteamUtils008_GetSecondsSinceComputerActive): return 154;
    case (((uint32_t)BD_ORDINAL_SteamUtils008 << 16) | (uint32_t)BD_SLOT_SteamUtils008_GetConnectedUniverse): return 155;
    case (((uint32_t)BD_ORDINAL_SteamUtils008 << 16) | (uint32_t)BD_SLOT_SteamUtils008_GetServerRealTime): return 156;
    case (((uint32_t)BD_ORDINAL_SteamUtils008 << 16) | (uint32_t)BD_SLOT_SteamUtils008_GetIPCountry): return 157;
    case (((uint32_t)BD_ORDINAL_SteamUtils008 << 16) | (uint32_t)BD_SLOT_SteamUtils008_GetCurrentBatteryPower): return 158;
    case (((uint32_t)BD_ORDINAL_SteamUtils008 << 16) | (uint32_t)BD_SLOT_SteamUtils008_GetAppID): return 159;
    case (((uint32_t)BD_ORDINAL_SteamUtils008 << 16) | (uint32_t)BD_SLOT_SteamUtils008_IsOverlayEnabled): return 160;
    case (((uint32_t)BD_ORDINAL_SteamUtils008 << 16) | (uint32_t)BD_SLOT_SteamUtils008_GetSteamUILanguage): return 161;
    case (((uint32_t)BD_ORDINAL_SteamUtils008 << 16) | (uint32_t)BD_SLOT_SteamUtils008_IsSteamRunningInVR): return 162;
    case (((uint32_t)BD_ORDINAL_SteamUtils008 << 16) | (uint32_t)BD_SLOT_SteamUtils008_IsSteamInBigPictureMode): return 163;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribed): return 164;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsLowViolence): return 165;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsCybercafe): return 166;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsVACBanned): return 167;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_GetCurrentGameLanguage): return 168;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_GetAvailableGameLanguages): return 169;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedApp): return 170;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsDlcInstalled): return 171;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_GetEarliestPurchaseUnixTime): return 172;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedFromFreeWeekend): return 173;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_GetDLCCount): return 174;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsAppInstalled): return 175;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_GetAppOwner): return 176;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_GetAppBuildId): return 177;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_CreateSteamPipe): return 178;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_BReleaseSteamPipe): return 179;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_ConnectToGlobalUser): return 180;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_CreateLocalUser): return 181;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_ReleaseUser): return 182;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamUser): return 183;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamGameServer): return 184;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamFriends): return 185;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamUtils): return 186;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamMatchmaking): return 187;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamMatchmakingServers): return 188;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamGenericInterface): return 189;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamUserStats): return 190;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamGameServerStats): return 191;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamApps): return 192;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamNetworking): return 193;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamRemoteStorage): return 194;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamScreenshots): return 195;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_RunFrame): return 196;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetIPCCallCount): return 197;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_BShutdownIfAllPipesClosed): return 198;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamHTTP): return 199;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamUnifiedMessages): return 200;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamController): return 201;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamUGC): return 202;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamAppList): return 203;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamMusic): return 204;
    case (((uint32_t)BD_ORDINAL_SteamNetworking006 << 16) | (uint32_t)BD_SLOT_SteamNetworking006_SendP2PPacket): return 205;
    case (((uint32_t)BD_ORDINAL_SteamNetworking006 << 16) | (uint32_t)BD_SLOT_SteamNetworking006_IsP2PPacketAvailable): return 206;
    case (((uint32_t)BD_ORDINAL_SteamNetworking006 << 16) | (uint32_t)BD_SLOT_SteamNetworking006_ReadP2PPacket): return 207;
    case (((uint32_t)BD_ORDINAL_SteamNetworking006 << 16) | (uint32_t)BD_SLOT_SteamNetworking006_AcceptP2PSessionWithUser): return 208;
    case (((uint32_t)BD_ORDINAL_SteamNetworking006 << 16) | (uint32_t)BD_SLOT_SteamNetworking006_CloseP2PSessionWithUser): return 209;
    case (((uint32_t)BD_ORDINAL_SteamNetworking006 << 16) | (uint32_t)BD_SLOT_SteamNetworking006_CloseP2PChannelWithUser): return 210;
    case (((uint32_t)BD_ORDINAL_SteamNetworking006 << 16) | (uint32_t)BD_SLOT_SteamNetworking006_GetP2PSessionState): return 211;
    case (((uint32_t)BD_ORDINAL_SteamNetworking006 << 16) | (uint32_t)BD_SLOT_SteamNetworking006_AllowP2PPacketRelay): return 212;
    case (((uint32_t)BD_ORDINAL_SteamNetworking006 << 16) | (uint32_t)BD_SLOT_SteamNetworking006_CreateP2PConnectionSocket): return 213;
    case (((uint32_t)BD_ORDINAL_SteamNetworking006 << 16) | (uint32_t)BD_SLOT_SteamNetworking006_DestroySocket): return 214;
    case (((uint32_t)BD_ORDINAL_SteamNetworking006 << 16) | (uint32_t)BD_SLOT_SteamNetworking006_DestroyListenSocket): return 215;
    case (((uint32_t)BD_ORDINAL_SteamNetworking006 << 16) | (uint32_t)BD_SLOT_SteamNetworking006_SendDataOnSocket): return 216;
    case (((uint32_t)BD_ORDINAL_SteamNetworking006 << 16) | (uint32_t)BD_SLOT_SteamNetworking006_IsDataAvailableOnSocket): return 217;
    case (((uint32_t)BD_ORDINAL_SteamNetworking006 << 16) | (uint32_t)BD_SLOT_SteamNetworking006_RetrieveDataFromSocket): return 218;
    case (((uint32_t)BD_ORDINAL_SteamNetworking006 << 16) | (uint32_t)BD_SLOT_SteamNetworking006_IsDataAvailable): return 219;
    case (((uint32_t)BD_ORDINAL_SteamNetworking006 << 16) | (uint32_t)BD_SLOT_SteamNetworking006_RetrieveData): return 220;
    case (((uint32_t)BD_ORDINAL_SteamNetworking006 << 16) | (uint32_t)BD_SLOT_SteamNetworking006_GetSocketConnectionType): return 221;
    case (((uint32_t)BD_ORDINAL_SteamNetworking006 << 16) | (uint32_t)BD_SLOT_SteamNetworking006_GetMaxPacketSize): return 222;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_CreateSteamPipe): return 223;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_BReleaseSteamPipe): return 224;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_ConnectToGlobalUser): return 225;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_CreateLocalUser): return 226;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_ReleaseUser): return 227;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamUser): return 228;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamGameServer): return 229;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamFriends): return 230;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamUtils): return 231;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamMatchmaking): return 232;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamMatchmakingServers): return 233;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamGenericInterface): return 234;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamUserStats): return 235;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamGameServerStats): return 236;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamApps): return 237;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamNetworking): return 238;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamRemoteStorage): return 239;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamScreenshots): return 240;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_RunFrame): return 241;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetIPCCallCount): return 242;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_BShutdownIfAllPipesClosed): return 243;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamHTTP): return 244;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_DEPRECATED_GetISteamUnifiedMessages): return 245;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamController): return 246;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamUGC): return 247;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamAppList): return 248;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamMusic): return 249;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamMusicRemote): return 250;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamHTMLSurface): return 251;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamInventory): return 252;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamVideo): return 253;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamParentalSettings): return 254;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_CreateSteamPipe): return 255;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_BReleaseSteamPipe): return 256;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_ConnectToGlobalUser): return 257;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_CreateLocalUser): return 258;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_ReleaseUser): return 259;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamUser): return 260;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamGameServer): return 261;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamFriends): return 262;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamUtils): return 263;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamMatchmaking): return 264;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamMatchmakingServers): return 265;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamGenericInterface): return 266;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamUserStats): return 267;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamGameServerStats): return 268;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamApps): return 269;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamNetworking): return 270;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamRemoteStorage): return 271;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamScreenshots): return 272;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_RunFrame): return 273;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetIPCCallCount): return 274;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_BShutdownIfAllPipesClosed): return 275;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamHTTP): return 276;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamController): return 277;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamUGC): return 278;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamMusic): return 279;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamMusicRemote): return 280;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamHTMLSurface): return 281;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamInventory): return 282;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamVideo): return 283;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamParentalSettings): return 284;
    case (((uint32_t)BD_ORDINAL_SteamUser021 << 16) | (uint32_t)BD_SLOT_SteamUser021_GetHSteamUser): return 285;
    case (((uint32_t)BD_ORDINAL_SteamUser021 << 16) | (uint32_t)BD_SLOT_SteamUser021_BLoggedOn): return 286;
    case (((uint32_t)BD_ORDINAL_SteamUser021 << 16) | (uint32_t)BD_SLOT_SteamUser021_GetSteamID): return 287;
    case (((uint32_t)BD_ORDINAL_SteamUser021 << 16) | (uint32_t)BD_SLOT_SteamUser021_GetAuthSessionTicket): return 288;
    case (((uint32_t)BD_ORDINAL_SteamUser021 << 16) | (uint32_t)BD_SLOT_SteamUser021_CancelAuthTicket): return 289;
    case (((uint32_t)BD_ORDINAL_SteamFriends017 << 16) | (uint32_t)BD_SLOT_SteamFriends017_GetPersonaName): return 290;
    case (((uint32_t)BD_ORDINAL_SteamFriends017 << 16) | (uint32_t)BD_SLOT_SteamFriends017_GetPersonaState): return 291;
    case (((uint32_t)BD_ORDINAL_SteamFriends017 << 16) | (uint32_t)BD_SLOT_SteamFriends017_GetFriendPersonaName): return 292;
    case (((uint32_t)BD_ORDINAL_SteamFriends017 << 16) | (uint32_t)BD_SLOT_SteamFriends017_ActivateGameOverlayInviteDialog): return 293;
    case (((uint32_t)BD_ORDINAL_SteamUtils010 << 16) | (uint32_t)BD_SLOT_SteamUtils010_GetSecondsSinceAppActive): return 294;
    case (((uint32_t)BD_ORDINAL_SteamUtils010 << 16) | (uint32_t)BD_SLOT_SteamUtils010_GetSecondsSinceComputerActive): return 295;
    case (((uint32_t)BD_ORDINAL_SteamUtils010 << 16) | (uint32_t)BD_SLOT_SteamUtils010_GetConnectedUniverse): return 296;
    case (((uint32_t)BD_ORDINAL_SteamUtils010 << 16) | (uint32_t)BD_SLOT_SteamUtils010_GetServerRealTime): return 297;
    case (((uint32_t)BD_ORDINAL_SteamUtils010 << 16) | (uint32_t)BD_SLOT_SteamUtils010_GetIPCountry): return 298;
    case (((uint32_t)BD_ORDINAL_SteamUtils010 << 16) | (uint32_t)BD_SLOT_SteamUtils010_GetCurrentBatteryPower): return 299;
    case (((uint32_t)BD_ORDINAL_SteamUtils010 << 16) | (uint32_t)BD_SLOT_SteamUtils010_GetAppID): return 300;
    case (((uint32_t)BD_ORDINAL_SteamUtils010 << 16) | (uint32_t)BD_SLOT_SteamUtils010_IsOverlayEnabled): return 301;
    case (((uint32_t)BD_ORDINAL_SteamUtils010 << 16) | (uint32_t)BD_SLOT_SteamUtils010_GetSteamUILanguage): return 302;
    case (((uint32_t)BD_ORDINAL_SteamUtils010 << 16) | (uint32_t)BD_SLOT_SteamUtils010_IsSteamRunningInVR): return 303;
    case (((uint32_t)BD_ORDINAL_SteamUtils010 << 16) | (uint32_t)BD_SLOT_SteamUtils010_IsSteamInBigPictureMode): return 304;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2): return 305;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat): return 306;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2): return 307;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat): return 308;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat): return 309;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement): return 310;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement): return 311;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement): return 312;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime): return 313;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_StoreStats): return 314;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute): return 315;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress): return 316;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetNumAchievements): return 317;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementName): return 318;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_ResetAllStats): return 319;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2): return 320;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat): return 321;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2): return 322;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat): return 323;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat): return 324;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement): return 325;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement): return 326;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement): return 327;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime): return 328;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_StoreStats): return 329;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute): return 330;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress): return 331;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetNumAchievements): return 332;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementName): return 333;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_ResetAllStats): return 334;
    case (((uint32_t)BD_ORDINAL_SteamUtils009 << 16) | (uint32_t)BD_SLOT_SteamUtils009_GetSecondsSinceAppActive): return 335;
    case (((uint32_t)BD_ORDINAL_SteamUtils009 << 16) | (uint32_t)BD_SLOT_SteamUtils009_GetSecondsSinceComputerActive): return 336;
    case (((uint32_t)BD_ORDINAL_SteamUtils009 << 16) | (uint32_t)BD_SLOT_SteamUtils009_GetConnectedUniverse): return 337;
    case (((uint32_t)BD_ORDINAL_SteamUtils009 << 16) | (uint32_t)BD_SLOT_SteamUtils009_GetServerRealTime): return 338;
    case (((uint32_t)BD_ORDINAL_SteamUtils009 << 16) | (uint32_t)BD_SLOT_SteamUtils009_GetIPCountry): return 339;
    case (((uint32_t)BD_ORDINAL_SteamUtils009 << 16) | (uint32_t)BD_SLOT_SteamUtils009_GetCurrentBatteryPower): return 340;
    case (((uint32_t)BD_ORDINAL_SteamUtils009 << 16) | (uint32_t)BD_SLOT_SteamUtils009_GetAppID): return 341;
    case (((uint32_t)BD_ORDINAL_SteamUtils009 << 16) | (uint32_t)BD_SLOT_SteamUtils009_IsOverlayEnabled): return 342;
    case (((uint32_t)BD_ORDINAL_SteamUtils009 << 16) | (uint32_t)BD_SLOT_SteamUtils009_GetSteamUILanguage): return 343;
    case (((uint32_t)BD_ORDINAL_SteamUtils009 << 16) | (uint32_t)BD_SLOT_SteamUtils009_IsSteamRunningInVR): return 344;
    case (((uint32_t)BD_ORDINAL_SteamUtils009 << 16) | (uint32_t)BD_SLOT_SteamUtils009_IsSteamInBigPictureMode): return 345;
    case (((uint32_t)BD_ORDINAL_SteamUser018 << 16) | (uint32_t)BD_SLOT_SteamUser018_GetHSteamUser): return 346;
    case (((uint32_t)BD_ORDINAL_SteamUser018 << 16) | (uint32_t)BD_SLOT_SteamUser018_BLoggedOn): return 347;
    case (((uint32_t)BD_ORDINAL_SteamUser018 << 16) | (uint32_t)BD_SLOT_SteamUser018_GetSteamID): return 348;
    case (((uint32_t)BD_ORDINAL_SteamUser018 << 16) | (uint32_t)BD_SLOT_SteamUser018_GetAuthSessionTicket): return 349;
    case (((uint32_t)BD_ORDINAL_SteamUser018 << 16) | (uint32_t)BD_SLOT_SteamUser018_CancelAuthTicket): return 350;
    case (((uint32_t)BD_ORDINAL_SteamUtils007 << 16) | (uint32_t)BD_SLOT_SteamUtils007_GetSecondsSinceAppActive): return 351;
    case (((uint32_t)BD_ORDINAL_SteamUtils007 << 16) | (uint32_t)BD_SLOT_SteamUtils007_GetSecondsSinceComputerActive): return 352;
    case (((uint32_t)BD_ORDINAL_SteamUtils007 << 16) | (uint32_t)BD_SLOT_SteamUtils007_GetConnectedUniverse): return 353;
    case (((uint32_t)BD_ORDINAL_SteamUtils007 << 16) | (uint32_t)BD_SLOT_SteamUtils007_GetServerRealTime): return 354;
    case (((uint32_t)BD_ORDINAL_SteamUtils007 << 16) | (uint32_t)BD_SLOT_SteamUtils007_GetIPCountry): return 355;
    case (((uint32_t)BD_ORDINAL_SteamUtils007 << 16) | (uint32_t)BD_SLOT_SteamUtils007_GetCurrentBatteryPower): return 356;
    case (((uint32_t)BD_ORDINAL_SteamUtils007 << 16) | (uint32_t)BD_SLOT_SteamUtils007_GetAppID): return 357;
    case (((uint32_t)BD_ORDINAL_SteamUtils007 << 16) | (uint32_t)BD_SLOT_SteamUtils007_IsOverlayEnabled): return 358;
    case (((uint32_t)BD_ORDINAL_SteamUtils007 << 16) | (uint32_t)BD_SLOT_SteamUtils007_GetSteamUILanguage): return 359;
    case (((uint32_t)BD_ORDINAL_SteamUtils007 << 16) | (uint32_t)BD_SLOT_SteamUtils007_IsSteamRunningInVR): return 360;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribed): return 361;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsLowViolence): return 362;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsCybercafe): return 363;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsVACBanned): return 364;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_GetCurrentGameLanguage): return 365;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_GetAvailableGameLanguages): return 366;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedApp): return 367;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsDlcInstalled): return 368;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_GetEarliestPurchaseUnixTime): return 369;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedFromFreeWeekend): return 370;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_GetDLCCount): return 371;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsAppInstalled): return 372;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_GetAppOwner): return 373;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_GetAppBuildId): return 374;
    case (((uint32_t)BD_ORDINAL_SteamMatchMakingServers003 << 16) | (uint32_t)BD_SLOT_SteamMatchMakingServers003_RequestInternetServerList): return 375;
    case (((uint32_t)BD_ORDINAL_SteamMatchMakingServers003 << 16) | (uint32_t)BD_SLOT_SteamMatchMakingServers003_RequestLANServerList): return 376;
    case (((uint32_t)BD_ORDINAL_SteamMatchMakingServers003 << 16) | (uint32_t)BD_SLOT_SteamMatchMakingServers003_RequestFriendsServerList): return 377;
    case (((uint32_t)BD_ORDINAL_SteamMatchMakingServers003 << 16) | (uint32_t)BD_SLOT_SteamMatchMakingServers003_RequestFavoritesServerList): return 378;
    case (((uint32_t)BD_ORDINAL_SteamMatchMakingServers003 << 16) | (uint32_t)BD_SLOT_SteamMatchMakingServers003_RequestHistoryServerList): return 379;
    case (((uint32_t)BD_ORDINAL_SteamMatchMakingServers003 << 16) | (uint32_t)BD_SLOT_SteamMatchMakingServers003_RequestSpectatorServerList): return 380;
    case (((uint32_t)BD_ORDINAL_SteamMatchMakingServers003 << 16) | (uint32_t)BD_SLOT_SteamMatchMakingServers003_ReleaseRequest): return 381;
    case (((uint32_t)BD_ORDINAL_SteamMatchMakingServers003 << 16) | (uint32_t)BD_SLOT_SteamMatchMakingServers003_GetServerDetails): return 382;
    case (((uint32_t)BD_ORDINAL_SteamMatchMakingServers003 << 16) | (uint32_t)BD_SLOT_SteamMatchMakingServers003_CancelQuery): return 383;
    case (((uint32_t)BD_ORDINAL_SteamMatchMakingServers003 << 16) | (uint32_t)BD_SLOT_SteamMatchMakingServers003_RefreshQuery): return 384;
    case (((uint32_t)BD_ORDINAL_SteamMatchMakingServers003 << 16) | (uint32_t)BD_SLOT_SteamMatchMakingServers003_IsRefreshing): return 385;
    case (((uint32_t)BD_ORDINAL_SteamMatchMakingServers003 << 16) | (uint32_t)BD_SLOT_SteamMatchMakingServers003_GetServerCount): return 386;
    case (((uint32_t)BD_ORDINAL_SteamMatchMakingServers003 << 16) | (uint32_t)BD_SLOT_SteamMatchMakingServers003_RefreshServer): return 387;
    case (((uint32_t)BD_ORDINAL_SteamMatchMakingServers003 << 16) | (uint32_t)BD_SLOT_SteamMatchMakingServers003_PingServer): return 388;
    case (((uint32_t)BD_ORDINAL_SteamMatchMakingServers003 << 16) | (uint32_t)BD_SLOT_SteamMatchMakingServers003_PlayerDetails): return 389;
    case (((uint32_t)BD_ORDINAL_SteamMatchMakingServers003 << 16) | (uint32_t)BD_SLOT_SteamMatchMakingServers003_ServerRules): return 390;
    case (((uint32_t)BD_ORDINAL_SteamMatchMakingServers003 << 16) | (uint32_t)BD_SLOT_SteamMatchMakingServers003_ServerFriends): return 391;
    case (((uint32_t)BD_ORDINAL_SteamMatchMakingServers003 << 16) | (uint32_t)BD_SLOT_SteamMatchMakingServers003_CancelServerQuery): return 392;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_CreateListenSocketIP): return 393;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_ConnectByIPAddress): return 394;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_CreateListenSocketP2P): return 395;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_ConnectP2P): return 396;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_AcceptConnection): return 397;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_CloseConnection): return 398;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_CloseListenSocket): return 399;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_SetConnectionUserData): return 400;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_GetConnectionUserData): return 401;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_SetConnectionName): return 402;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_GetConnectionName): return 403;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_SendMessageToConnection): return 404;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_FlushMessagesOnConnection): return 405;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_ReceiveMessagesOnConnection): return 406;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_GetConnectionInfo): return 407;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_GetConnectionRealTimeStatus): return 408;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_GetDetailedConnectionStatus): return 409;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_GetListenSocketAddress): return 410;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_CreateSocketPair): return 411;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_ConfigureConnectionLanes): return 412;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_GetIdentity): return 413;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_InitAuthentication): return 414;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_GetAuthenticationStatus): return 415;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_CreatePollGroup): return 416;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_DestroyPollGroup): return 417;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_SetConnectionPollGroup): return 418;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_ReceiveMessagesOnPollGroup): return 419;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets013 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets013_ResetIdentity): return 420;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingUtils004 << 16) | (uint32_t)BD_SLOT_SteamNetworkingUtils004_GetRelayNetworkStatus): return 421;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingUtils004 << 16) | (uint32_t)BD_SLOT_SteamNetworkingUtils004_GetLocalPingLocation): return 422;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingUtils004 << 16) | (uint32_t)BD_SLOT_SteamNetworkingUtils004_EstimatePingTimeBetweenTwoLocations): return 423;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingUtils004 << 16) | (uint32_t)BD_SLOT_SteamNetworkingUtils004_EstimatePingTimeFromLocalHost): return 424;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingUtils004 << 16) | (uint32_t)BD_SLOT_SteamNetworkingUtils004_ConvertPingLocationToString): return 425;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingUtils004 << 16) | (uint32_t)BD_SLOT_SteamNetworkingUtils004_ParsePingLocationString): return 426;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingUtils004 << 16) | (uint32_t)BD_SLOT_SteamNetworkingUtils004_CheckPingDataUpToDate): return 427;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingUtils004 << 16) | (uint32_t)BD_SLOT_SteamNetworkingUtils004_GetPingToDataCenter): return 428;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingUtils004 << 16) | (uint32_t)BD_SLOT_SteamNetworkingUtils004_GetDirectPingToPOP): return 429;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingUtils004 << 16) | (uint32_t)BD_SLOT_SteamNetworkingUtils004_GetPOPCount): return 430;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingUtils004 << 16) | (uint32_t)BD_SLOT_SteamNetworkingUtils004_GetPOPList): return 431;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingUtils004 << 16) | (uint32_t)BD_SLOT_SteamNetworkingUtils004_GetLocalTimestamp): return 432;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingUtils004 << 16) | (uint32_t)BD_SLOT_SteamNetworkingUtils004_GetIPv4FakeIPType): return 433;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingUtils004 << 16) | (uint32_t)BD_SLOT_SteamNetworkingUtils004_GetRealIdentityForFakeIP): return 434;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingUtils004 << 16) | (uint32_t)BD_SLOT_SteamNetworkingUtils004_SetConfigValue): return 435;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingUtils004 << 16) | (uint32_t)BD_SLOT_SteamNetworkingUtils004_GetConfigValue): return 436;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingUtils004 << 16) | (uint32_t)BD_SLOT_SteamNetworkingUtils004_GetConfigValueInfo): return 437;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingUtils004 << 16) | (uint32_t)BD_SLOT_SteamNetworkingUtils004_IterateGenericEditableConfigValues): return 438;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingMessages002 << 16) | (uint32_t)BD_SLOT_SteamNetworkingMessages002_SendMessageToUser): return 439;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingMessages002 << 16) | (uint32_t)BD_SLOT_SteamNetworkingMessages002_ReceiveMessagesOnChannel): return 440;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingMessages002 << 16) | (uint32_t)BD_SLOT_SteamNetworkingMessages002_AcceptSessionWithUser): return 441;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingMessages002 << 16) | (uint32_t)BD_SLOT_SteamNetworkingMessages002_CloseSessionWithUser): return 442;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingMessages002 << 16) | (uint32_t)BD_SLOT_SteamNetworkingMessages002_CloseChannelWithUser): return 443;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingMessages002 << 16) | (uint32_t)BD_SLOT_SteamNetworkingMessages002_GetSessionConnectionInfo): return 444;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_CreateListenSocketIP): return 445;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_ConnectByIPAddress): return 446;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_CreateListenSocketP2P): return 447;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_ConnectP2P): return 448;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_AcceptConnection): return 449;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_CloseConnection): return 450;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_CloseListenSocket): return 451;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_SetConnectionUserData): return 452;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_GetConnectionUserData): return 453;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_SetConnectionName): return 454;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_GetConnectionName): return 455;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_SendMessageToConnection): return 456;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_FlushMessagesOnConnection): return 457;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_ReceiveMessagesOnConnection): return 458;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_GetConnectionInfo): return 459;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_GetConnectionRealTimeStatus): return 460;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_GetDetailedConnectionStatus): return 461;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_GetListenSocketAddress): return 462;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_CreateSocketPair): return 463;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_ConfigureConnectionLanes): return 464;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_GetIdentity): return 465;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_InitAuthentication): return 466;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_GetAuthenticationStatus): return 467;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_CreatePollGroup): return 468;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_DestroyPollGroup): return 469;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_SetConnectionPollGroup): return 470;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_ReceiveMessagesOnPollGroup): return 471;
    case (((uint32_t)BD_ORDINAL_SteamNetworkingSockets012 << 16) | (uint32_t)BD_SLOT_SteamNetworkingSockets012_ResetIdentity): return 472;
    default: return -1;
  }
}
static const char *bd_call_name(int idx) {
  switch (idx) {
    case 0: return "SteamUser023.GetHSteamUser";
    case 1: return "SteamUser023.BLoggedOn";
    case 2: return "SteamUser023.GetSteamID";
    case 3: return "SteamUser023.GetAuthSessionTicket";
    case 4: return "SteamUser023.GetAuthTicketForWebApi";
    case 5: return "SteamUser023.CancelAuthTicket";
    case 6: return "SteamFriends018.GetPersonaName";
    case 7: return "SteamFriends018.GetPersonaState";
    case 8: return "SteamFriends018.GetFriendPersonaName";
    case 9: return "SteamUser016.GetHSteamUser";
    case 10: return "SteamUser016.BLoggedOn";
    case 11: return "SteamUser016.GetSteamID";
    case 12: return "SteamFriends011.GetPersonaName";
    case 13: return "SteamFriends011.GetPersonaState";
    case 14: return "SteamFriends011.GetFriendPersonaName";
    case 15: return "SteamUtils005.GetSecondsSinceAppActive";
    case 16: return "SteamUtils005.GetSecondsSinceComputerActive";
    case 17: return "SteamUtils005.GetConnectedUniverse";
    case 18: return "SteamUtils005.GetServerRealTime";
    case 19: return "SteamUtils005.GetIPCountry";
    case 20: return "SteamUtils005.GetCurrentBatteryPower";
    case 21: return "SteamUtils005.GetAppID";
    case 22: return "SteamUtils005.IsOverlayEnabled";
    case 23: return "STEAMAPPS_INTERFACE_VERSION004.BIsSubscribed";
    case 24: return "STEAMAPPS_INTERFACE_VERSION004.BIsLowViolence";
    case 25: return "STEAMAPPS_INTERFACE_VERSION004.BIsCybercafe";
    case 26: return "STEAMAPPS_INTERFACE_VERSION004.BIsVACBanned";
    case 27: return "STEAMAPPS_INTERFACE_VERSION004.GetCurrentGameLanguage";
    case 28: return "STEAMAPPS_INTERFACE_VERSION004.GetAvailableGameLanguages";
    case 29: return "STEAMAPPS_INTERFACE_VERSION004.BIsSubscribedApp";
    case 30: return "STEAMAPPS_INTERFACE_VERSION004.BIsDlcInstalled";
    case 31: return "STEAMAPPS_INTERFACE_VERSION004.GetEarliestPurchaseUnixTime";
    case 32: return "STEAMAPPS_INTERFACE_VERSION004.BIsSubscribedFromFreeWeekend";
    case 33: return "STEAMAPPS_INTERFACE_VERSION004.GetDLCCount";
    case 34: return "STEAMUSERSTATS_INTERFACE_VERSION010.GetStat_2";
    case 35: return "STEAMUSERSTATS_INTERFACE_VERSION010.GetStat";
    case 36: return "STEAMUSERSTATS_INTERFACE_VERSION010.SetStat_2";
    case 37: return "STEAMUSERSTATS_INTERFACE_VERSION010.SetStat";
    case 38: return "STEAMUSERSTATS_INTERFACE_VERSION010.UpdateAvgRateStat";
    case 39: return "STEAMUSERSTATS_INTERFACE_VERSION010.GetAchievement";
    case 40: return "STEAMUSERSTATS_INTERFACE_VERSION010.SetAchievement";
    case 41: return "STEAMUSERSTATS_INTERFACE_VERSION010.ClearAchievement";
    case 42: return "STEAMUSERSTATS_INTERFACE_VERSION010.GetAchievementAndUnlockTime";
    case 43: return "STEAMUSERSTATS_INTERFACE_VERSION010.StoreStats";
    case 44: return "STEAMUSERSTATS_INTERFACE_VERSION010.GetAchievementDisplayAttribute";
    case 45: return "STEAMUSERSTATS_INTERFACE_VERSION010.IndicateAchievementProgress";
    case 46: return "STEAMUSERSTATS_INTERFACE_VERSION010.ResetAllStats";
    case 47: return "SteamFriends013.GetPersonaName";
    case 48: return "SteamFriends013.GetPersonaState";
    case 49: return "SteamFriends013.GetFriendPersonaName";
    case 50: return "STEAMAPPS_INTERFACE_VERSION005.BIsSubscribed";
    case 51: return "STEAMAPPS_INTERFACE_VERSION005.BIsLowViolence";
    case 52: return "STEAMAPPS_INTERFACE_VERSION005.BIsCybercafe";
    case 53: return "STEAMAPPS_INTERFACE_VERSION005.BIsVACBanned";
    case 54: return "STEAMAPPS_INTERFACE_VERSION005.GetCurrentGameLanguage";
    case 55: return "STEAMAPPS_INTERFACE_VERSION005.GetAvailableGameLanguages";
    case 56: return "STEAMAPPS_INTERFACE_VERSION005.BIsSubscribedApp";
    case 57: return "STEAMAPPS_INTERFACE_VERSION005.BIsDlcInstalled";
    case 58: return "STEAMAPPS_INTERFACE_VERSION005.GetEarliestPurchaseUnixTime";
    case 59: return "STEAMAPPS_INTERFACE_VERSION005.BIsSubscribedFromFreeWeekend";
    case 60: return "STEAMAPPS_INTERFACE_VERSION005.GetDLCCount";
    case 61: return "STEAMAPPS_INTERFACE_VERSION005.BIsAppInstalled";
    case 62: return "STEAMUSERSTATS_INTERFACE_VERSION011.GetStat_2";
    case 63: return "STEAMUSERSTATS_INTERFACE_VERSION011.GetStat";
    case 64: return "STEAMUSERSTATS_INTERFACE_VERSION011.SetStat_2";
    case 65: return "STEAMUSERSTATS_INTERFACE_VERSION011.SetStat";
    case 66: return "STEAMUSERSTATS_INTERFACE_VERSION011.UpdateAvgRateStat";
    case 67: return "STEAMUSERSTATS_INTERFACE_VERSION011.GetAchievement";
    case 68: return "STEAMUSERSTATS_INTERFACE_VERSION011.SetAchievement";
    case 69: return "STEAMUSERSTATS_INTERFACE_VERSION011.ClearAchievement";
    case 70: return "STEAMUSERSTATS_INTERFACE_VERSION011.GetAchievementAndUnlockTime";
    case 71: return "STEAMUSERSTATS_INTERFACE_VERSION011.StoreStats";
    case 72: return "STEAMUSERSTATS_INTERFACE_VERSION011.GetAchievementDisplayAttribute";
    case 73: return "STEAMUSERSTATS_INTERFACE_VERSION011.IndicateAchievementProgress";
    case 74: return "STEAMUSERSTATS_INTERFACE_VERSION011.GetNumAchievements";
    case 75: return "STEAMUSERSTATS_INTERFACE_VERSION011.GetAchievementName";
    case 76: return "STEAMUSERSTATS_INTERFACE_VERSION011.ResetAllStats";
    case 77: return "SteamMatchMaking009.GetFavoriteGameCount";
    case 78: return "SteamMatchMaking009.GetFavoriteGame";
    case 79: return "SteamMatchMaking009.AddFavoriteGame";
    case 80: return "SteamMatchMaking009.RemoveFavoriteGame";
    case 81: return "SteamMatchMaking009.RequestLobbyList";
    case 82: return "SteamMatchMaking009.AddRequestLobbyListStringFilter";
    case 83: return "SteamMatchMaking009.AddRequestLobbyListNumericalFilter";
    case 84: return "SteamMatchMaking009.AddRequestLobbyListNearValueFilter";
    case 85: return "SteamMatchMaking009.AddRequestLobbyListFilterSlotsAvailable";
    case 86: return "SteamMatchMaking009.AddRequestLobbyListDistanceFilter";
    case 87: return "SteamMatchMaking009.AddRequestLobbyListResultCountFilter";
    case 88: return "SteamMatchMaking009.AddRequestLobbyListCompatibleMembersFilter";
    case 89: return "SteamMatchMaking009.GetLobbyByIndex";
    case 90: return "SteamMatchMaking009.CreateLobby";
    case 91: return "SteamMatchMaking009.JoinLobby";
    case 92: return "SteamMatchMaking009.LeaveLobby";
    case 93: return "SteamMatchMaking009.InviteUserToLobby";
    case 94: return "SteamMatchMaking009.GetNumLobbyMembers";
    case 95: return "SteamMatchMaking009.GetLobbyMemberByIndex";
    case 96: return "SteamMatchMaking009.GetLobbyData";
    case 97: return "SteamMatchMaking009.SetLobbyData";
    case 98: return "SteamMatchMaking009.GetLobbyDataCount";
    case 99: return "SteamMatchMaking009.GetLobbyDataByIndex";
    case 100: return "SteamMatchMaking009.DeleteLobbyData";
    case 101: return "SteamMatchMaking009.GetLobbyMemberData";
    case 102: return "SteamMatchMaking009.SetLobbyMemberData";
    case 103: return "SteamMatchMaking009.SendLobbyChatMsg";
    case 104: return "SteamMatchMaking009.GetLobbyChatEntry";
    case 105: return "SteamMatchMaking009.RequestLobbyData";
    case 106: return "SteamMatchMaking009.SetLobbyGameServer";
    case 107: return "SteamMatchMaking009.GetLobbyGameServer";
    case 108: return "SteamMatchMaking009.SetLobbyMemberLimit";
    case 109: return "SteamMatchMaking009.GetLobbyMemberLimit";
    case 110: return "SteamMatchMaking009.SetLobbyType";
    case 111: return "SteamMatchMaking009.SetLobbyJoinable";
    case 112: return "SteamMatchMaking009.GetLobbyOwner";
    case 113: return "SteamMatchMaking009.SetLobbyOwner";
    case 114: return "SteamMatchMaking009.SetLinkedLobby";
    case 115: return "SteamClient017.CreateSteamPipe";
    case 116: return "SteamClient017.BReleaseSteamPipe";
    case 117: return "SteamClient017.ConnectToGlobalUser";
    case 118: return "SteamClient017.CreateLocalUser";
    case 119: return "SteamClient017.ReleaseUser";
    case 120: return "SteamClient017.GetISteamUser";
    case 121: return "SteamClient017.GetISteamGameServer";
    case 122: return "SteamClient017.GetISteamFriends";
    case 123: return "SteamClient017.GetISteamUtils";
    case 124: return "SteamClient017.GetISteamMatchmaking";
    case 125: return "SteamClient017.GetISteamMatchmakingServers";
    case 126: return "SteamClient017.GetISteamGenericInterface";
    case 127: return "SteamClient017.GetISteamUserStats";
    case 128: return "SteamClient017.GetISteamGameServerStats";
    case 129: return "SteamClient017.GetISteamApps";
    case 130: return "SteamClient017.GetISteamNetworking";
    case 131: return "SteamClient017.GetISteamRemoteStorage";
    case 132: return "SteamClient017.GetISteamScreenshots";
    case 133: return "SteamClient017.RunFrame";
    case 134: return "SteamClient017.GetIPCCallCount";
    case 135: return "SteamClient017.BShutdownIfAllPipesClosed";
    case 136: return "SteamClient017.GetISteamHTTP";
    case 137: return "SteamClient017.DEPRECATED_GetISteamUnifiedMessages";
    case 138: return "SteamClient017.GetISteamController";
    case 139: return "SteamClient017.GetISteamUGC";
    case 140: return "SteamClient017.GetISteamAppList";
    case 141: return "SteamClient017.GetISteamMusic";
    case 142: return "SteamClient017.GetISteamMusicRemote";
    case 143: return "SteamClient017.GetISteamHTMLSurface";
    case 144: return "SteamClient017.GetISteamInventory";
    case 145: return "SteamClient017.GetISteamVideo";
    case 146: return "SteamClient017.GetISteamParentalSettings";
    case 147: return "SteamUser019.GetHSteamUser";
    case 148: return "SteamUser019.BLoggedOn";
    case 149: return "SteamUser019.GetSteamID";
    case 150: return "SteamFriends015.GetPersonaName";
    case 151: return "SteamFriends015.GetPersonaState";
    case 152: return "SteamFriends015.GetFriendPersonaName";
    case 153: return "SteamUtils008.GetSecondsSinceAppActive";
    case 154: return "SteamUtils008.GetSecondsSinceComputerActive";
    case 155: return "SteamUtils008.GetConnectedUniverse";
    case 156: return "SteamUtils008.GetServerRealTime";
    case 157: return "SteamUtils008.GetIPCountry";
    case 158: return "SteamUtils008.GetCurrentBatteryPower";
    case 159: return "SteamUtils008.GetAppID";
    case 160: return "SteamUtils008.IsOverlayEnabled";
    case 161: return "SteamUtils008.GetSteamUILanguage";
    case 162: return "SteamUtils008.IsSteamRunningInVR";
    case 163: return "SteamUtils008.IsSteamInBigPictureMode";
    case 164: return "STEAMAPPS_INTERFACE_VERSION008.BIsSubscribed";
    case 165: return "STEAMAPPS_INTERFACE_VERSION008.BIsLowViolence";
    case 166: return "STEAMAPPS_INTERFACE_VERSION008.BIsCybercafe";
    case 167: return "STEAMAPPS_INTERFACE_VERSION008.BIsVACBanned";
    case 168: return "STEAMAPPS_INTERFACE_VERSION008.GetCurrentGameLanguage";
    case 169: return "STEAMAPPS_INTERFACE_VERSION008.GetAvailableGameLanguages";
    case 170: return "STEAMAPPS_INTERFACE_VERSION008.BIsSubscribedApp";
    case 171: return "STEAMAPPS_INTERFACE_VERSION008.BIsDlcInstalled";
    case 172: return "STEAMAPPS_INTERFACE_VERSION008.GetEarliestPurchaseUnixTime";
    case 173: return "STEAMAPPS_INTERFACE_VERSION008.BIsSubscribedFromFreeWeekend";
    case 174: return "STEAMAPPS_INTERFACE_VERSION008.GetDLCCount";
    case 175: return "STEAMAPPS_INTERFACE_VERSION008.BIsAppInstalled";
    case 176: return "STEAMAPPS_INTERFACE_VERSION008.GetAppOwner";
    case 177: return "STEAMAPPS_INTERFACE_VERSION008.GetAppBuildId";
    case 178: return "SteamClient014.CreateSteamPipe";
    case 179: return "SteamClient014.BReleaseSteamPipe";
    case 180: return "SteamClient014.ConnectToGlobalUser";
    case 181: return "SteamClient014.CreateLocalUser";
    case 182: return "SteamClient014.ReleaseUser";
    case 183: return "SteamClient014.GetISteamUser";
    case 184: return "SteamClient014.GetISteamGameServer";
    case 185: return "SteamClient014.GetISteamFriends";
    case 186: return "SteamClient014.GetISteamUtils";
    case 187: return "SteamClient014.GetISteamMatchmaking";
    case 188: return "SteamClient014.GetISteamMatchmakingServers";
    case 189: return "SteamClient014.GetISteamGenericInterface";
    case 190: return "SteamClient014.GetISteamUserStats";
    case 191: return "SteamClient014.GetISteamGameServerStats";
    case 192: return "SteamClient014.GetISteamApps";
    case 193: return "SteamClient014.GetISteamNetworking";
    case 194: return "SteamClient014.GetISteamRemoteStorage";
    case 195: return "SteamClient014.GetISteamScreenshots";
    case 196: return "SteamClient014.RunFrame";
    case 197: return "SteamClient014.GetIPCCallCount";
    case 198: return "SteamClient014.BShutdownIfAllPipesClosed";
    case 199: return "SteamClient014.GetISteamHTTP";
    case 200: return "SteamClient014.GetISteamUnifiedMessages";
    case 201: return "SteamClient014.GetISteamController";
    case 202: return "SteamClient014.GetISteamUGC";
    case 203: return "SteamClient014.GetISteamAppList";
    case 204: return "SteamClient014.GetISteamMusic";
    case 205: return "SteamNetworking006.SendP2PPacket";
    case 206: return "SteamNetworking006.IsP2PPacketAvailable";
    case 207: return "SteamNetworking006.ReadP2PPacket";
    case 208: return "SteamNetworking006.AcceptP2PSessionWithUser";
    case 209: return "SteamNetworking006.CloseP2PSessionWithUser";
    case 210: return "SteamNetworking006.CloseP2PChannelWithUser";
    case 211: return "SteamNetworking006.GetP2PSessionState";
    case 212: return "SteamNetworking006.AllowP2PPacketRelay";
    case 213: return "SteamNetworking006.CreateP2PConnectionSocket";
    case 214: return "SteamNetworking006.DestroySocket";
    case 215: return "SteamNetworking006.DestroyListenSocket";
    case 216: return "SteamNetworking006.SendDataOnSocket";
    case 217: return "SteamNetworking006.IsDataAvailableOnSocket";
    case 218: return "SteamNetworking006.RetrieveDataFromSocket";
    case 219: return "SteamNetworking006.IsDataAvailable";
    case 220: return "SteamNetworking006.RetrieveData";
    case 221: return "SteamNetworking006.GetSocketConnectionType";
    case 222: return "SteamNetworking006.GetMaxPacketSize";
    case 223: return "SteamClient020.CreateSteamPipe";
    case 224: return "SteamClient020.BReleaseSteamPipe";
    case 225: return "SteamClient020.ConnectToGlobalUser";
    case 226: return "SteamClient020.CreateLocalUser";
    case 227: return "SteamClient020.ReleaseUser";
    case 228: return "SteamClient020.GetISteamUser";
    case 229: return "SteamClient020.GetISteamGameServer";
    case 230: return "SteamClient020.GetISteamFriends";
    case 231: return "SteamClient020.GetISteamUtils";
    case 232: return "SteamClient020.GetISteamMatchmaking";
    case 233: return "SteamClient020.GetISteamMatchmakingServers";
    case 234: return "SteamClient020.GetISteamGenericInterface";
    case 235: return "SteamClient020.GetISteamUserStats";
    case 236: return "SteamClient020.GetISteamGameServerStats";
    case 237: return "SteamClient020.GetISteamApps";
    case 238: return "SteamClient020.GetISteamNetworking";
    case 239: return "SteamClient020.GetISteamRemoteStorage";
    case 240: return "SteamClient020.GetISteamScreenshots";
    case 241: return "SteamClient020.RunFrame";
    case 242: return "SteamClient020.GetIPCCallCount";
    case 243: return "SteamClient020.BShutdownIfAllPipesClosed";
    case 244: return "SteamClient020.GetISteamHTTP";
    case 245: return "SteamClient020.DEPRECATED_GetISteamUnifiedMessages";
    case 246: return "SteamClient020.GetISteamController";
    case 247: return "SteamClient020.GetISteamUGC";
    case 248: return "SteamClient020.GetISteamAppList";
    case 249: return "SteamClient020.GetISteamMusic";
    case 250: return "SteamClient020.GetISteamMusicRemote";
    case 251: return "SteamClient020.GetISteamHTMLSurface";
    case 252: return "SteamClient020.GetISteamInventory";
    case 253: return "SteamClient020.GetISteamVideo";
    case 254: return "SteamClient020.GetISteamParentalSettings";
    case 255: return "SteamClient021.CreateSteamPipe";
    case 256: return "SteamClient021.BReleaseSteamPipe";
    case 257: return "SteamClient021.ConnectToGlobalUser";
    case 258: return "SteamClient021.CreateLocalUser";
    case 259: return "SteamClient021.ReleaseUser";
    case 260: return "SteamClient021.GetISteamUser";
    case 261: return "SteamClient021.GetISteamGameServer";
    case 262: return "SteamClient021.GetISteamFriends";
    case 263: return "SteamClient021.GetISteamUtils";
    case 264: return "SteamClient021.GetISteamMatchmaking";
    case 265: return "SteamClient021.GetISteamMatchmakingServers";
    case 266: return "SteamClient021.GetISteamGenericInterface";
    case 267: return "SteamClient021.GetISteamUserStats";
    case 268: return "SteamClient021.GetISteamGameServerStats";
    case 269: return "SteamClient021.GetISteamApps";
    case 270: return "SteamClient021.GetISteamNetworking";
    case 271: return "SteamClient021.GetISteamRemoteStorage";
    case 272: return "SteamClient021.GetISteamScreenshots";
    case 273: return "SteamClient021.RunFrame";
    case 274: return "SteamClient021.GetIPCCallCount";
    case 275: return "SteamClient021.BShutdownIfAllPipesClosed";
    case 276: return "SteamClient021.GetISteamHTTP";
    case 277: return "SteamClient021.GetISteamController";
    case 278: return "SteamClient021.GetISteamUGC";
    case 279: return "SteamClient021.GetISteamMusic";
    case 280: return "SteamClient021.GetISteamMusicRemote";
    case 281: return "SteamClient021.GetISteamHTMLSurface";
    case 282: return "SteamClient021.GetISteamInventory";
    case 283: return "SteamClient021.GetISteamVideo";
    case 284: return "SteamClient021.GetISteamParentalSettings";
    case 285: return "SteamUser021.GetHSteamUser";
    case 286: return "SteamUser021.BLoggedOn";
    case 287: return "SteamUser021.GetSteamID";
    case 288: return "SteamUser021.GetAuthSessionTicket";
    case 289: return "SteamUser021.CancelAuthTicket";
    case 290: return "SteamFriends017.GetPersonaName";
    case 291: return "SteamFriends017.GetPersonaState";
    case 292: return "SteamFriends017.GetFriendPersonaName";
    case 293: return "SteamFriends017.ActivateGameOverlayInviteDialog";
    case 294: return "SteamUtils010.GetSecondsSinceAppActive";
    case 295: return "SteamUtils010.GetSecondsSinceComputerActive";
    case 296: return "SteamUtils010.GetConnectedUniverse";
    case 297: return "SteamUtils010.GetServerRealTime";
    case 298: return "SteamUtils010.GetIPCountry";
    case 299: return "SteamUtils010.GetCurrentBatteryPower";
    case 300: return "SteamUtils010.GetAppID";
    case 301: return "SteamUtils010.IsOverlayEnabled";
    case 302: return "SteamUtils010.GetSteamUILanguage";
    case 303: return "SteamUtils010.IsSteamRunningInVR";
    case 304: return "SteamUtils010.IsSteamInBigPictureMode";
    case 305: return "STEAMUSERSTATS_INTERFACE_VERSION012.GetStat_2";
    case 306: return "STEAMUSERSTATS_INTERFACE_VERSION012.GetStat";
    case 307: return "STEAMUSERSTATS_INTERFACE_VERSION012.SetStat_2";
    case 308: return "STEAMUSERSTATS_INTERFACE_VERSION012.SetStat";
    case 309: return "STEAMUSERSTATS_INTERFACE_VERSION012.UpdateAvgRateStat";
    case 310: return "STEAMUSERSTATS_INTERFACE_VERSION012.GetAchievement";
    case 311: return "STEAMUSERSTATS_INTERFACE_VERSION012.SetAchievement";
    case 312: return "STEAMUSERSTATS_INTERFACE_VERSION012.ClearAchievement";
    case 313: return "STEAMUSERSTATS_INTERFACE_VERSION012.GetAchievementAndUnlockTime";
    case 314: return "STEAMUSERSTATS_INTERFACE_VERSION012.StoreStats";
    case 315: return "STEAMUSERSTATS_INTERFACE_VERSION012.GetAchievementDisplayAttribute";
    case 316: return "STEAMUSERSTATS_INTERFACE_VERSION012.IndicateAchievementProgress";
    case 317: return "STEAMUSERSTATS_INTERFACE_VERSION012.GetNumAchievements";
    case 318: return "STEAMUSERSTATS_INTERFACE_VERSION012.GetAchievementName";
    case 319: return "STEAMUSERSTATS_INTERFACE_VERSION012.ResetAllStats";
    case 320: return "STEAMUSERSTATS_INTERFACE_VERSION013.GetStat_2";
    case 321: return "STEAMUSERSTATS_INTERFACE_VERSION013.GetStat";
    case 322: return "STEAMUSERSTATS_INTERFACE_VERSION013.SetStat_2";
    case 323: return "STEAMUSERSTATS_INTERFACE_VERSION013.SetStat";
    case 324: return "STEAMUSERSTATS_INTERFACE_VERSION013.UpdateAvgRateStat";
    case 325: return "STEAMUSERSTATS_INTERFACE_VERSION013.GetAchievement";
    case 326: return "STEAMUSERSTATS_INTERFACE_VERSION013.SetAchievement";
    case 327: return "STEAMUSERSTATS_INTERFACE_VERSION013.ClearAchievement";
    case 328: return "STEAMUSERSTATS_INTERFACE_VERSION013.GetAchievementAndUnlockTime";
    case 329: return "STEAMUSERSTATS_INTERFACE_VERSION013.StoreStats";
    case 330: return "STEAMUSERSTATS_INTERFACE_VERSION013.GetAchievementDisplayAttribute";
    case 331: return "STEAMUSERSTATS_INTERFACE_VERSION013.IndicateAchievementProgress";
    case 332: return "STEAMUSERSTATS_INTERFACE_VERSION013.GetNumAchievements";
    case 333: return "STEAMUSERSTATS_INTERFACE_VERSION013.GetAchievementName";
    case 334: return "STEAMUSERSTATS_INTERFACE_VERSION013.ResetAllStats";
    case 335: return "SteamUtils009.GetSecondsSinceAppActive";
    case 336: return "SteamUtils009.GetSecondsSinceComputerActive";
    case 337: return "SteamUtils009.GetConnectedUniverse";
    case 338: return "SteamUtils009.GetServerRealTime";
    case 339: return "SteamUtils009.GetIPCountry";
    case 340: return "SteamUtils009.GetCurrentBatteryPower";
    case 341: return "SteamUtils009.GetAppID";
    case 342: return "SteamUtils009.IsOverlayEnabled";
    case 343: return "SteamUtils009.GetSteamUILanguage";
    case 344: return "SteamUtils009.IsSteamRunningInVR";
    case 345: return "SteamUtils009.IsSteamInBigPictureMode";
    case 346: return "SteamUser018.GetHSteamUser";
    case 347: return "SteamUser018.BLoggedOn";
    case 348: return "SteamUser018.GetSteamID";
    case 349: return "SteamUser018.GetAuthSessionTicket";
    case 350: return "SteamUser018.CancelAuthTicket";
    case 351: return "SteamUtils007.GetSecondsSinceAppActive";
    case 352: return "SteamUtils007.GetSecondsSinceComputerActive";
    case 353: return "SteamUtils007.GetConnectedUniverse";
    case 354: return "SteamUtils007.GetServerRealTime";
    case 355: return "SteamUtils007.GetIPCountry";
    case 356: return "SteamUtils007.GetCurrentBatteryPower";
    case 357: return "SteamUtils007.GetAppID";
    case 358: return "SteamUtils007.IsOverlayEnabled";
    case 359: return "SteamUtils007.GetSteamUILanguage";
    case 360: return "SteamUtils007.IsSteamRunningInVR";
    case 361: return "STEAMAPPS_INTERFACE_VERSION007.BIsSubscribed";
    case 362: return "STEAMAPPS_INTERFACE_VERSION007.BIsLowViolence";
    case 363: return "STEAMAPPS_INTERFACE_VERSION007.BIsCybercafe";
    case 364: return "STEAMAPPS_INTERFACE_VERSION007.BIsVACBanned";
    case 365: return "STEAMAPPS_INTERFACE_VERSION007.GetCurrentGameLanguage";
    case 366: return "STEAMAPPS_INTERFACE_VERSION007.GetAvailableGameLanguages";
    case 367: return "STEAMAPPS_INTERFACE_VERSION007.BIsSubscribedApp";
    case 368: return "STEAMAPPS_INTERFACE_VERSION007.BIsDlcInstalled";
    case 369: return "STEAMAPPS_INTERFACE_VERSION007.GetEarliestPurchaseUnixTime";
    case 370: return "STEAMAPPS_INTERFACE_VERSION007.BIsSubscribedFromFreeWeekend";
    case 371: return "STEAMAPPS_INTERFACE_VERSION007.GetDLCCount";
    case 372: return "STEAMAPPS_INTERFACE_VERSION007.BIsAppInstalled";
    case 373: return "STEAMAPPS_INTERFACE_VERSION007.GetAppOwner";
    case 374: return "STEAMAPPS_INTERFACE_VERSION007.GetAppBuildId";
    case 375: return "SteamMatchMakingServers003.RequestInternetServerList";
    case 376: return "SteamMatchMakingServers003.RequestLANServerList";
    case 377: return "SteamMatchMakingServers003.RequestFriendsServerList";
    case 378: return "SteamMatchMakingServers003.RequestFavoritesServerList";
    case 379: return "SteamMatchMakingServers003.RequestHistoryServerList";
    case 380: return "SteamMatchMakingServers003.RequestSpectatorServerList";
    case 381: return "SteamMatchMakingServers003.ReleaseRequest";
    case 382: return "SteamMatchMakingServers003.GetServerDetails";
    case 383: return "SteamMatchMakingServers003.CancelQuery";
    case 384: return "SteamMatchMakingServers003.RefreshQuery";
    case 385: return "SteamMatchMakingServers003.IsRefreshing";
    case 386: return "SteamMatchMakingServers003.GetServerCount";
    case 387: return "SteamMatchMakingServers003.RefreshServer";
    case 388: return "SteamMatchMakingServers003.PingServer";
    case 389: return "SteamMatchMakingServers003.PlayerDetails";
    case 390: return "SteamMatchMakingServers003.ServerRules";
    case 391: return "SteamMatchMakingServers003.ServerFriends";
    case 392: return "SteamMatchMakingServers003.CancelServerQuery";
    case 393: return "SteamNetworkingSockets013.CreateListenSocketIP";
    case 394: return "SteamNetworkingSockets013.ConnectByIPAddress";
    case 395: return "SteamNetworkingSockets013.CreateListenSocketP2P";
    case 396: return "SteamNetworkingSockets013.ConnectP2P";
    case 397: return "SteamNetworkingSockets013.AcceptConnection";
    case 398: return "SteamNetworkingSockets013.CloseConnection";
    case 399: return "SteamNetworkingSockets013.CloseListenSocket";
    case 400: return "SteamNetworkingSockets013.SetConnectionUserData";
    case 401: return "SteamNetworkingSockets013.GetConnectionUserData";
    case 402: return "SteamNetworkingSockets013.SetConnectionName";
    case 403: return "SteamNetworkingSockets013.GetConnectionName";
    case 404: return "SteamNetworkingSockets013.SendMessageToConnection";
    case 405: return "SteamNetworkingSockets013.FlushMessagesOnConnection";
    case 406: return "SteamNetworkingSockets013.ReceiveMessagesOnConnection";
    case 407: return "SteamNetworkingSockets013.GetConnectionInfo";
    case 408: return "SteamNetworkingSockets013.GetConnectionRealTimeStatus";
    case 409: return "SteamNetworkingSockets013.GetDetailedConnectionStatus";
    case 410: return "SteamNetworkingSockets013.GetListenSocketAddress";
    case 411: return "SteamNetworkingSockets013.CreateSocketPair";
    case 412: return "SteamNetworkingSockets013.ConfigureConnectionLanes";
    case 413: return "SteamNetworkingSockets013.GetIdentity";
    case 414: return "SteamNetworkingSockets013.InitAuthentication";
    case 415: return "SteamNetworkingSockets013.GetAuthenticationStatus";
    case 416: return "SteamNetworkingSockets013.CreatePollGroup";
    case 417: return "SteamNetworkingSockets013.DestroyPollGroup";
    case 418: return "SteamNetworkingSockets013.SetConnectionPollGroup";
    case 419: return "SteamNetworkingSockets013.ReceiveMessagesOnPollGroup";
    case 420: return "SteamNetworkingSockets013.ResetIdentity";
    case 421: return "SteamNetworkingUtils004.GetRelayNetworkStatus";
    case 422: return "SteamNetworkingUtils004.GetLocalPingLocation";
    case 423: return "SteamNetworkingUtils004.EstimatePingTimeBetweenTwoLocations";
    case 424: return "SteamNetworkingUtils004.EstimatePingTimeFromLocalHost";
    case 425: return "SteamNetworkingUtils004.ConvertPingLocationToString";
    case 426: return "SteamNetworkingUtils004.ParsePingLocationString";
    case 427: return "SteamNetworkingUtils004.CheckPingDataUpToDate";
    case 428: return "SteamNetworkingUtils004.GetPingToDataCenter";
    case 429: return "SteamNetworkingUtils004.GetDirectPingToPOP";
    case 430: return "SteamNetworkingUtils004.GetPOPCount";
    case 431: return "SteamNetworkingUtils004.GetPOPList";
    case 432: return "SteamNetworkingUtils004.GetLocalTimestamp";
    case 433: return "SteamNetworkingUtils004.GetIPv4FakeIPType";
    case 434: return "SteamNetworkingUtils004.GetRealIdentityForFakeIP";
    case 435: return "SteamNetworkingUtils004.SetConfigValue";
    case 436: return "SteamNetworkingUtils004.GetConfigValue";
    case 437: return "SteamNetworkingUtils004.GetConfigValueInfo";
    case 438: return "SteamNetworkingUtils004.IterateGenericEditableConfigValues";
    case 439: return "SteamNetworkingMessages002.SendMessageToUser";
    case 440: return "SteamNetworkingMessages002.ReceiveMessagesOnChannel";
    case 441: return "SteamNetworkingMessages002.AcceptSessionWithUser";
    case 442: return "SteamNetworkingMessages002.CloseSessionWithUser";
    case 443: return "SteamNetworkingMessages002.CloseChannelWithUser";
    case 444: return "SteamNetworkingMessages002.GetSessionConnectionInfo";
    case 445: return "SteamNetworkingSockets012.CreateListenSocketIP";
    case 446: return "SteamNetworkingSockets012.ConnectByIPAddress";
    case 447: return "SteamNetworkingSockets012.CreateListenSocketP2P";
    case 448: return "SteamNetworkingSockets012.ConnectP2P";
    case 449: return "SteamNetworkingSockets012.AcceptConnection";
    case 450: return "SteamNetworkingSockets012.CloseConnection";
    case 451: return "SteamNetworkingSockets012.CloseListenSocket";
    case 452: return "SteamNetworkingSockets012.SetConnectionUserData";
    case 453: return "SteamNetworkingSockets012.GetConnectionUserData";
    case 454: return "SteamNetworkingSockets012.SetConnectionName";
    case 455: return "SteamNetworkingSockets012.GetConnectionName";
    case 456: return "SteamNetworkingSockets012.SendMessageToConnection";
    case 457: return "SteamNetworkingSockets012.FlushMessagesOnConnection";
    case 458: return "SteamNetworkingSockets012.ReceiveMessagesOnConnection";
    case 459: return "SteamNetworkingSockets012.GetConnectionInfo";
    case 460: return "SteamNetworkingSockets012.GetConnectionRealTimeStatus";
    case 461: return "SteamNetworkingSockets012.GetDetailedConnectionStatus";
    case 462: return "SteamNetworkingSockets012.GetListenSocketAddress";
    case 463: return "SteamNetworkingSockets012.CreateSocketPair";
    case 464: return "SteamNetworkingSockets012.ConfigureConnectionLanes";
    case 465: return "SteamNetworkingSockets012.GetIdentity";
    case 466: return "SteamNetworkingSockets012.InitAuthentication";
    case 467: return "SteamNetworkingSockets012.GetAuthenticationStatus";
    case 468: return "SteamNetworkingSockets012.CreatePollGroup";
    case 469: return "SteamNetworkingSockets012.DestroyPollGroup";
    case 470: return "SteamNetworkingSockets012.SetConnectionPollGroup";
    case 471: return "SteamNetworkingSockets012.ReceiveMessagesOnPollGroup";
    case 472: return "SteamNetworkingSockets012.ResetIdentity";
    default: return "";
  }
}

uint8_t bridge_dispatch(uint16_t ordinal, uint16_t slot, const uint8_t *arg, uint32_t argLen,
                         uint8_t *resp, uint32_t respCap, uint32_t *respLen) {
  (void)arg; (void)argLen;
  *respLen = 0;
  switch (((uint32_t)ordinal << 16) | (uint32_t)slot) {
    case (((uint32_t)1) << 16 | 0u): { // SteamUser023.GetHSteamUser
      if (g_bd_flat_SteamUser023_GetHSteamUser == NULL || g_bd_self_steamuser023 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_SteamUser023_GetHSteamUser(g_bd_self_steamuser023);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)1) << 16 | 1u): { // SteamUser023.BLoggedOn
      if (g_bd_flat_SteamUser023_BLoggedOn == NULL || g_bd_self_steamuser023 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUser023_BLoggedOn(g_bd_self_steamuser023);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)1) << 16 | 2u): { // SteamUser023.GetSteamID
      if (g_bd_flat_SteamUser023_GetSteamID == NULL || g_bd_self_steamuser023 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint64_t __ret = g_bd_flat_SteamUser023_GetSteamID(g_bd_self_steamuser023);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 8);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)1) << 16 | 13u): { // SteamUser023.GetAuthSessionTicket
      if (g_bd_flat_SteamUser023_GetAuthSessionTicket == NULL || g_bd_self_steamuser023 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static uint8_t g_bd_flat_SteamUser023_GetAuthSessionTicket_pTicket_buf[BD_WIRE_OUT_BUFFER_MAX_BYTES];
      uint32_t cap_pTicket = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&cap_pTicket, arg + 0u, 4);
      if (cap_pTicket > BD_WIRE_OUT_BUFFER_MAX_BYTES) cap_pTicket = BD_WIRE_OUT_BUFFER_MAX_BYTES;
      if (respCap < 12) { *respLen = 0; return 1; }
      if (cap_pTicket > respCap - 12) cap_pTicket = (uint32_t)(respCap - 12); // response must fit the scratch
      memset(g_bd_flat_SteamUser023_GetAuthSessionTicket_pTicket_buf, 0, cap_pTicket); // no earlier call's bytes cross into the game (53-17 WR-04)
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_cbMaxTicket; memcpy(&arg_cbMaxTicket, arg + (0u + 4), 4);
      uint32_t arg_pcbTicket = 0;
      if ((int64_t)arg_cbMaxTicket < 0 || (int64_t)arg_cbMaxTicket > (int64_t)cap_pTicket) arg_cbMaxTicket = (int32_t)cap_pTicket;
      uint32_t __ret = g_bd_flat_SteamUser023_GetAuthSessionTicket(g_bd_self_steamuser023, g_bd_flat_SteamUser023_GetAuthSessionTicket_pTicket_buf, arg_cbMaxTicket, &arg_pcbTicket, NULL);
      if (respCap < 12) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pcbTicket, 4);
      uint32_t outLen_pTicket = cap_pTicket;
      if ((uint32_t)arg_pcbTicket < outLen_pTicket) outLen_pTicket = (uint32_t)arg_pcbTicket;
      memcpy(resp + 8, &outLen_pTicket, 4);
      memcpy(resp + 8 + 4, g_bd_flat_SteamUser023_GetAuthSessionTicket_pTicket_buf, outLen_pTicket);
      *respLen = 8 + 4 + outLen_pTicket;
      return 0;
    }
    case (((uint32_t)1) << 16 | 14u): { // SteamUser023.GetAuthTicketForWebApi
      if (g_bd_flat_SteamUser023_GetAuthTicketForWebApi == NULL || g_bd_self_steamuser023 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_SteamUser023_GetAuthTicketForWebApi_pchIdentity_buf[4096 + 1];
      const char *arg_pchIdentity = NULL;
      uint32_t arg_pchIdentity_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchIdentity_len, arg + 0u, 4);
      if (arg_pchIdentity_len != 0xFFFFFFFFu) {
        if (arg_pchIdentity_len > 4096 || argLen < 0u + 4 + arg_pchIdentity_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamUser023_GetAuthTicketForWebApi_pchIdentity_buf, arg + 0u + 4, arg_pchIdentity_len);
        g_bd_flat_SteamUser023_GetAuthTicketForWebApi_pchIdentity_buf[arg_pchIdentity_len] = '\0';
        arg_pchIdentity = g_bd_flat_SteamUser023_GetAuthTicketForWebApi_pchIdentity_buf;
      } else {
        arg_pchIdentity_len = 0;
      }
      uint32_t __ret = g_bd_flat_SteamUser023_GetAuthTicketForWebApi(g_bd_self_steamuser023, arg_pchIdentity);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)1) << 16 | 17u): { // SteamUser023.CancelAuthTicket
      if (g_bd_flat_SteamUser023_CancelAuthTicket == NULL || g_bd_self_steamuser023 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hAuthTicket; memcpy(&arg_hAuthTicket, arg + 0u, 4);
      g_bd_flat_SteamUser023_CancelAuthTicket(g_bd_self_steamuser023, arg_hAuthTicket);
      *respLen = 0; return 0;
    }
    case (((uint32_t)2) << 16 | 0u): { // SteamFriends018.GetPersonaName
      if (g_bd_flat_SteamFriends018_GetPersonaName == NULL || g_bd_self_steamfriends018 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamFriends018_GetPersonaName(g_bd_self_steamfriends018);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)2) << 16 | 1u): { // SteamFriends018.GetPersonaState
      if (g_bd_flat_SteamFriends018_GetPersonaState == NULL || g_bd_self_steamfriends018 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamFriends018_GetPersonaState(g_bd_self_steamfriends018);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)2) << 16 | 6u): { // SteamFriends018.GetFriendPersonaName
      if (g_bd_flat_SteamFriends018_GetFriendPersonaName == NULL || g_bd_self_steamfriends018 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDFriend; memcpy(&arg_steamIDFriend, arg + 0u, 8);
      const char *result = g_bd_flat_SteamFriends018_GetFriendPersonaName(g_bd_self_steamfriends018, arg_steamIDFriend);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)3) << 16 | 0u): { // SteamUser016.GetHSteamUser
      if (g_bd_flat_SteamUser016_GetHSteamUser == NULL || g_bd_self_steamuser016 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_SteamUser016_GetHSteamUser(g_bd_self_steamuser016);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)3) << 16 | 1u): { // SteamUser016.BLoggedOn
      if (g_bd_flat_SteamUser016_BLoggedOn == NULL || g_bd_self_steamuser016 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUser016_BLoggedOn(g_bd_self_steamuser016);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)3) << 16 | 2u): { // SteamUser016.GetSteamID
      if (g_bd_flat_SteamUser016_GetSteamID == NULL || g_bd_self_steamuser016 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint64_t __ret = g_bd_flat_SteamUser016_GetSteamID(g_bd_self_steamuser016);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 8);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)4) << 16 | 0u): { // SteamFriends011.GetPersonaName
      if (g_bd_flat_SteamFriends011_GetPersonaName == NULL || g_bd_self_steamfriends011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamFriends011_GetPersonaName(g_bd_self_steamfriends011);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)4) << 16 | 2u): { // SteamFriends011.GetPersonaState
      if (g_bd_flat_SteamFriends011_GetPersonaState == NULL || g_bd_self_steamfriends011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamFriends011_GetPersonaState(g_bd_self_steamfriends011);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)4) << 16 | 7u): { // SteamFriends011.GetFriendPersonaName
      if (g_bd_flat_SteamFriends011_GetFriendPersonaName == NULL || g_bd_self_steamfriends011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDFriend; memcpy(&arg_steamIDFriend, arg + 0u, 8);
      const char *result = g_bd_flat_SteamFriends011_GetFriendPersonaName(g_bd_self_steamfriends011, arg_steamIDFriend);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)5) << 16 | 0u): { // SteamUtils005.GetSecondsSinceAppActive
      if (g_bd_flat_SteamUtils005_GetSecondsSinceAppActive == NULL || g_bd_self_steamutils005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils005_GetSecondsSinceAppActive(g_bd_self_steamutils005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)5) << 16 | 1u): { // SteamUtils005.GetSecondsSinceComputerActive
      if (g_bd_flat_SteamUtils005_GetSecondsSinceComputerActive == NULL || g_bd_self_steamutils005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils005_GetSecondsSinceComputerActive(g_bd_self_steamutils005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)5) << 16 | 2u): { // SteamUtils005.GetConnectedUniverse
      if (g_bd_flat_SteamUtils005_GetConnectedUniverse == NULL || g_bd_self_steamutils005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils005_GetConnectedUniverse(g_bd_self_steamutils005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)5) << 16 | 3u): { // SteamUtils005.GetServerRealTime
      if (g_bd_flat_SteamUtils005_GetServerRealTime == NULL || g_bd_self_steamutils005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils005_GetServerRealTime(g_bd_self_steamutils005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)5) << 16 | 4u): { // SteamUtils005.GetIPCountry
      if (g_bd_flat_SteamUtils005_GetIPCountry == NULL || g_bd_self_steamutils005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamUtils005_GetIPCountry(g_bd_self_steamutils005);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)5) << 16 | 8u): { // SteamUtils005.GetCurrentBatteryPower
      if (g_bd_flat_SteamUtils005_GetCurrentBatteryPower == NULL || g_bd_self_steamutils005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils005_GetCurrentBatteryPower(g_bd_self_steamutils005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)5) << 16 | 9u): { // SteamUtils005.GetAppID
      if (g_bd_identity_only) { // D-51-04: identity-only reports the launching game's real AppID, never 480
        uint32_t v = g_bd_report_appid;
        if (respCap < 4) { *respLen = 0; return 1; }
        memcpy(resp, &v, 4); *respLen = 4; return 0;
      }
      if (g_bd_flat_SteamUtils005_GetAppID == NULL || g_bd_self_steamutils005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils005_GetAppID(g_bd_self_steamutils005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)5) << 16 | 17u): { // SteamUtils005.IsOverlayEnabled
      if (g_bd_flat_SteamUtils005_IsOverlayEnabled == NULL || g_bd_self_steamutils005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUtils005_IsOverlayEnabled(g_bd_self_steamutils005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)6) << 16 | 0u): { // STEAMAPPS_INTERFACE_VERSION004.BIsSubscribed
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribed == NULL || g_bd_self_steamapps_interface_version004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribed(g_bd_self_steamapps_interface_version004);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)6) << 16 | 1u): { // STEAMAPPS_INTERFACE_VERSION004.BIsLowViolence
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsLowViolence == NULL || g_bd_self_steamapps_interface_version004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsLowViolence(g_bd_self_steamapps_interface_version004);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)6) << 16 | 2u): { // STEAMAPPS_INTERFACE_VERSION004.BIsCybercafe
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsCybercafe == NULL || g_bd_self_steamapps_interface_version004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsCybercafe(g_bd_self_steamapps_interface_version004);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)6) << 16 | 3u): { // STEAMAPPS_INTERFACE_VERSION004.BIsVACBanned
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsVACBanned == NULL || g_bd_self_steamapps_interface_version004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsVACBanned(g_bd_self_steamapps_interface_version004);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)6) << 16 | 4u): { // STEAMAPPS_INTERFACE_VERSION004.GetCurrentGameLanguage
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage == NULL || g_bd_self_steamapps_interface_version004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage(g_bd_self_steamapps_interface_version004);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)6) << 16 | 5u): { // STEAMAPPS_INTERFACE_VERSION004.GetAvailableGameLanguages
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages == NULL || g_bd_self_steamapps_interface_version004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages(g_bd_self_steamapps_interface_version004);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)6) << 16 | 6u): { // STEAMAPPS_INTERFACE_VERSION004.BIsSubscribedApp
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedApp == NULL || g_bd_self_steamapps_interface_version004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_appID; memcpy(&arg_appID, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedApp(g_bd_self_steamapps_interface_version004, arg_appID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)6) << 16 | 7u): { // STEAMAPPS_INTERFACE_VERSION004.BIsDlcInstalled
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsDlcInstalled == NULL || g_bd_self_steamapps_interface_version004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_appID; memcpy(&arg_appID, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsDlcInstalled(g_bd_self_steamapps_interface_version004, arg_appID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)6) << 16 | 8u): { // STEAMAPPS_INTERFACE_VERSION004.GetEarliestPurchaseUnixTime
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetEarliestPurchaseUnixTime == NULL || g_bd_self_steamapps_interface_version004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nAppID; memcpy(&arg_nAppID, arg + 0u, 4);
      uint32_t __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetEarliestPurchaseUnixTime(g_bd_self_steamapps_interface_version004, arg_nAppID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)6) << 16 | 9u): { // STEAMAPPS_INTERFACE_VERSION004.BIsSubscribedFromFreeWeekend
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedFromFreeWeekend == NULL || g_bd_self_steamapps_interface_version004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedFromFreeWeekend(g_bd_self_steamapps_interface_version004);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)6) << 16 | 10u): { // STEAMAPPS_INTERFACE_VERSION004.GetDLCCount
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetDLCCount == NULL || g_bd_self_steamapps_interface_version004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetDLCCount(g_bd_self_steamapps_interface_version004);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)7) << 16 | 1u): { // STEAMUSERSTATS_INTERFACE_VERSION010.GetStat_2
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2 == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      float arg_pData = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2(g_bd_self_steamuserstats_interface_version010, arg_pchName, &arg_pData);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pData, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)7) << 16 | 2u): { // STEAMUSERSTATS_INTERFACE_VERSION010.GetStat
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int32_t arg_pData = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat(g_bd_self_steamuserstats_interface_version010, arg_pchName, &arg_pData);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pData, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)7) << 16 | 3u): { // STEAMUSERSTATS_INTERFACE_VERSION010.SetStat_2
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2 == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      float arg_fData; memcpy(&arg_fData, arg + (0u + 4 + arg_pchName_len), 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2(g_bd_self_steamuserstats_interface_version010, arg_pchName, arg_fData);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)7) << 16 | 4u): { // STEAMUSERSTATS_INTERFACE_VERSION010.SetStat
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_nData; memcpy(&arg_nData, arg + (0u + 4 + arg_pchName_len), 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat(g_bd_self_steamuserstats_interface_version010, arg_pchName, arg_nData);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)7) << 16 | 5u): { // STEAMUSERSTATS_INTERFACE_VERSION010.UpdateAvgRateStat
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      float arg_flCountThisSession; memcpy(&arg_flCountThisSession, arg + (0u + 4 + arg_pchName_len), 4);
      if (argLen < ((0u + 4 + arg_pchName_len) + 4) + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      double arg_dSessionLength; memcpy(&arg_dSessionLength, arg + ((0u + 4 + arg_pchName_len) + 4), 8);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat(g_bd_self_steamuserstats_interface_version010, arg_pchName, arg_flCountThisSession, arg_dSessionLength);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)7) << 16 | 6u): { // STEAMUSERSTATS_INTERFACE_VERSION010.GetAchievement
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int arg_pbAchieved = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement(g_bd_self_steamuserstats_interface_version010, arg_pchName, &arg_pbAchieved);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pbAchieved, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)7) << 16 | 7u): { // STEAMUSERSTATS_INTERFACE_VERSION010.SetAchievement
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement(g_bd_self_steamuserstats_interface_version010, arg_pchName);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)7) << 16 | 8u): { // STEAMUSERSTATS_INTERFACE_VERSION010.ClearAchievement
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement(g_bd_self_steamuserstats_interface_version010, arg_pchName);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)7) << 16 | 9u): { // STEAMUSERSTATS_INTERFACE_VERSION010.GetAchievementAndUnlockTime
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int arg_pbAchieved = 0;
      uint32_t arg_punUnlockTime = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime(g_bd_self_steamuserstats_interface_version010, arg_pchName, &arg_pbAchieved, &arg_punUnlockTime);
      if (respCap < 12) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pbAchieved, 4);
      memcpy(resp + 8, &arg_punUnlockTime, 4);
      *respLen = 12;
      return 0;
    }
    case (((uint32_t)7) << 16 | 10u): { // STEAMUSERSTATS_INTERFACE_VERSION010.StoreStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_StoreStats == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_StoreStats(g_bd_self_steamuserstats_interface_version010);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)7) << 16 | 12u): { // STEAMUSERSTATS_INTERFACE_VERSION010.GetAchievementDisplayAttribute
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_pchKey_buf[4096 + 1];
      const char *arg_pchKey = NULL;
      uint32_t arg_pchKey_len = 0;
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchKey_len, arg + (0u + 4 + arg_pchName_len), 4);
      if (arg_pchKey_len != 0xFFFFFFFFu) {
        if (arg_pchKey_len > 4096 || argLen < (0u + 4 + arg_pchName_len) + 4 + arg_pchKey_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_pchKey_buf, arg + (0u + 4 + arg_pchName_len) + 4, arg_pchKey_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_pchKey_buf[arg_pchKey_len] = '\0';
        arg_pchKey = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_pchKey_buf;
      } else {
        arg_pchKey_len = 0;
      }
      const char *result = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute(g_bd_self_steamuserstats_interface_version010, arg_pchName, arg_pchKey);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)7) << 16 | 13u): { // STEAMUSERSTATS_INTERFACE_VERSION010.IndicateAchievementProgress
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nCurProgress; memcpy(&arg_nCurProgress, arg + (0u + 4 + arg_pchName_len), 4);
      if (argLen < ((0u + 4 + arg_pchName_len) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nMaxProgress; memcpy(&arg_nMaxProgress, arg + ((0u + 4 + arg_pchName_len) + 4), 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress(g_bd_self_steamuserstats_interface_version010, arg_pchName, arg_nCurProgress, arg_nMaxProgress);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)7) << 16 | 19u): { // STEAMUSERSTATS_INTERFACE_VERSION010.ResetAllStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_ResetAllStats == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int arg_bAchievementsToo; memcpy(&arg_bAchievementsToo, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_ResetAllStats(g_bd_self_steamuserstats_interface_version010, arg_bAchievementsToo);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)8) << 16 | 0u): { // SteamFriends013.GetPersonaName
      if (g_bd_flat_SteamFriends013_GetPersonaName == NULL || g_bd_self_steamfriends013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamFriends013_GetPersonaName(g_bd_self_steamfriends013);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)8) << 16 | 2u): { // SteamFriends013.GetPersonaState
      if (g_bd_flat_SteamFriends013_GetPersonaState == NULL || g_bd_self_steamfriends013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamFriends013_GetPersonaState(g_bd_self_steamfriends013);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)8) << 16 | 7u): { // SteamFriends013.GetFriendPersonaName
      if (g_bd_flat_SteamFriends013_GetFriendPersonaName == NULL || g_bd_self_steamfriends013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDFriend; memcpy(&arg_steamIDFriend, arg + 0u, 8);
      const char *result = g_bd_flat_SteamFriends013_GetFriendPersonaName(g_bd_self_steamfriends013, arg_steamIDFriend);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)9) << 16 | 0u): { // STEAMAPPS_INTERFACE_VERSION005.BIsSubscribed
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribed == NULL || g_bd_self_steamapps_interface_version005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribed(g_bd_self_steamapps_interface_version005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)9) << 16 | 1u): { // STEAMAPPS_INTERFACE_VERSION005.BIsLowViolence
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsLowViolence == NULL || g_bd_self_steamapps_interface_version005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsLowViolence(g_bd_self_steamapps_interface_version005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)9) << 16 | 2u): { // STEAMAPPS_INTERFACE_VERSION005.BIsCybercafe
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsCybercafe == NULL || g_bd_self_steamapps_interface_version005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsCybercafe(g_bd_self_steamapps_interface_version005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)9) << 16 | 3u): { // STEAMAPPS_INTERFACE_VERSION005.BIsVACBanned
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsVACBanned == NULL || g_bd_self_steamapps_interface_version005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsVACBanned(g_bd_self_steamapps_interface_version005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)9) << 16 | 4u): { // STEAMAPPS_INTERFACE_VERSION005.GetCurrentGameLanguage
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage == NULL || g_bd_self_steamapps_interface_version005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage(g_bd_self_steamapps_interface_version005);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)9) << 16 | 5u): { // STEAMAPPS_INTERFACE_VERSION005.GetAvailableGameLanguages
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages == NULL || g_bd_self_steamapps_interface_version005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages(g_bd_self_steamapps_interface_version005);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)9) << 16 | 6u): { // STEAMAPPS_INTERFACE_VERSION005.BIsSubscribedApp
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedApp == NULL || g_bd_self_steamapps_interface_version005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_appID; memcpy(&arg_appID, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedApp(g_bd_self_steamapps_interface_version005, arg_appID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)9) << 16 | 7u): { // STEAMAPPS_INTERFACE_VERSION005.BIsDlcInstalled
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsDlcInstalled == NULL || g_bd_self_steamapps_interface_version005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_appID; memcpy(&arg_appID, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsDlcInstalled(g_bd_self_steamapps_interface_version005, arg_appID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)9) << 16 | 8u): { // STEAMAPPS_INTERFACE_VERSION005.GetEarliestPurchaseUnixTime
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetEarliestPurchaseUnixTime == NULL || g_bd_self_steamapps_interface_version005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nAppID; memcpy(&arg_nAppID, arg + 0u, 4);
      uint32_t __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetEarliestPurchaseUnixTime(g_bd_self_steamapps_interface_version005, arg_nAppID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)9) << 16 | 9u): { // STEAMAPPS_INTERFACE_VERSION005.BIsSubscribedFromFreeWeekend
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedFromFreeWeekend == NULL || g_bd_self_steamapps_interface_version005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedFromFreeWeekend(g_bd_self_steamapps_interface_version005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)9) << 16 | 10u): { // STEAMAPPS_INTERFACE_VERSION005.GetDLCCount
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetDLCCount == NULL || g_bd_self_steamapps_interface_version005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetDLCCount(g_bd_self_steamapps_interface_version005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)9) << 16 | 19u): { // STEAMAPPS_INTERFACE_VERSION005.BIsAppInstalled
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsAppInstalled == NULL || g_bd_self_steamapps_interface_version005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_appID; memcpy(&arg_appID, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsAppInstalled(g_bd_self_steamapps_interface_version005, arg_appID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)10) << 16 | 1u): { // STEAMUSERSTATS_INTERFACE_VERSION011.GetStat_2
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2 == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      float arg_pData = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2(g_bd_self_steamuserstats_interface_version011, arg_pchName, &arg_pData);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pData, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)10) << 16 | 2u): { // STEAMUSERSTATS_INTERFACE_VERSION011.GetStat
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int32_t arg_pData = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat(g_bd_self_steamuserstats_interface_version011, arg_pchName, &arg_pData);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pData, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)10) << 16 | 3u): { // STEAMUSERSTATS_INTERFACE_VERSION011.SetStat_2
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2 == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      float arg_fData; memcpy(&arg_fData, arg + (0u + 4 + arg_pchName_len), 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2(g_bd_self_steamuserstats_interface_version011, arg_pchName, arg_fData);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)10) << 16 | 4u): { // STEAMUSERSTATS_INTERFACE_VERSION011.SetStat
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_nData; memcpy(&arg_nData, arg + (0u + 4 + arg_pchName_len), 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat(g_bd_self_steamuserstats_interface_version011, arg_pchName, arg_nData);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)10) << 16 | 5u): { // STEAMUSERSTATS_INTERFACE_VERSION011.UpdateAvgRateStat
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      float arg_flCountThisSession; memcpy(&arg_flCountThisSession, arg + (0u + 4 + arg_pchName_len), 4);
      if (argLen < ((0u + 4 + arg_pchName_len) + 4) + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      double arg_dSessionLength; memcpy(&arg_dSessionLength, arg + ((0u + 4 + arg_pchName_len) + 4), 8);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat(g_bd_self_steamuserstats_interface_version011, arg_pchName, arg_flCountThisSession, arg_dSessionLength);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)10) << 16 | 6u): { // STEAMUSERSTATS_INTERFACE_VERSION011.GetAchievement
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int arg_pbAchieved = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement(g_bd_self_steamuserstats_interface_version011, arg_pchName, &arg_pbAchieved);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pbAchieved, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)10) << 16 | 7u): { // STEAMUSERSTATS_INTERFACE_VERSION011.SetAchievement
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement(g_bd_self_steamuserstats_interface_version011, arg_pchName);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)10) << 16 | 8u): { // STEAMUSERSTATS_INTERFACE_VERSION011.ClearAchievement
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement(g_bd_self_steamuserstats_interface_version011, arg_pchName);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)10) << 16 | 9u): { // STEAMUSERSTATS_INTERFACE_VERSION011.GetAchievementAndUnlockTime
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int arg_pbAchieved = 0;
      uint32_t arg_punUnlockTime = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime(g_bd_self_steamuserstats_interface_version011, arg_pchName, &arg_pbAchieved, &arg_punUnlockTime);
      if (respCap < 12) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pbAchieved, 4);
      memcpy(resp + 8, &arg_punUnlockTime, 4);
      *respLen = 12;
      return 0;
    }
    case (((uint32_t)10) << 16 | 10u): { // STEAMUSERSTATS_INTERFACE_VERSION011.StoreStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_StoreStats == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_StoreStats(g_bd_self_steamuserstats_interface_version011);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)10) << 16 | 12u): { // STEAMUSERSTATS_INTERFACE_VERSION011.GetAchievementDisplayAttribute
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_pchKey_buf[4096 + 1];
      const char *arg_pchKey = NULL;
      uint32_t arg_pchKey_len = 0;
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchKey_len, arg + (0u + 4 + arg_pchName_len), 4);
      if (arg_pchKey_len != 0xFFFFFFFFu) {
        if (arg_pchKey_len > 4096 || argLen < (0u + 4 + arg_pchName_len) + 4 + arg_pchKey_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_pchKey_buf, arg + (0u + 4 + arg_pchName_len) + 4, arg_pchKey_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_pchKey_buf[arg_pchKey_len] = '\0';
        arg_pchKey = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_pchKey_buf;
      } else {
        arg_pchKey_len = 0;
      }
      const char *result = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute(g_bd_self_steamuserstats_interface_version011, arg_pchName, arg_pchKey);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)10) << 16 | 13u): { // STEAMUSERSTATS_INTERFACE_VERSION011.IndicateAchievementProgress
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nCurProgress; memcpy(&arg_nCurProgress, arg + (0u + 4 + arg_pchName_len), 4);
      if (argLen < ((0u + 4 + arg_pchName_len) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nMaxProgress; memcpy(&arg_nMaxProgress, arg + ((0u + 4 + arg_pchName_len) + 4), 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress(g_bd_self_steamuserstats_interface_version011, arg_pchName, arg_nCurProgress, arg_nMaxProgress);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)10) << 16 | 14u): { // STEAMUSERSTATS_INTERFACE_VERSION011.GetNumAchievements
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetNumAchievements == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetNumAchievements(g_bd_self_steamuserstats_interface_version011);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)10) << 16 | 15u): { // STEAMUSERSTATS_INTERFACE_VERSION011.GetAchievementName
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_iAchievement; memcpy(&arg_iAchievement, arg + 0u, 4);
      const char *result = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName(g_bd_self_steamuserstats_interface_version011, arg_iAchievement);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)10) << 16 | 21u): { // STEAMUSERSTATS_INTERFACE_VERSION011.ResetAllStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_ResetAllStats == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int arg_bAchievementsToo; memcpy(&arg_bAchievementsToo, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_ResetAllStats(g_bd_self_steamuserstats_interface_version011, arg_bAchievementsToo);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)12) << 16 | 0u): { // SteamMatchMaking009.GetFavoriteGameCount
      if (g_bd_flat_SteamMatchMaking009_GetFavoriteGameCount == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_SteamMatchMaking009_GetFavoriteGameCount(g_bd_self_steammatchmaking009);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)12) << 16 | 1u): { // SteamMatchMaking009.GetFavoriteGame
      if (g_bd_flat_SteamMatchMaking009_GetFavoriteGame == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_iGame; memcpy(&arg_iGame, arg + 0u, 4);
      uint32_t arg_pnAppID = 0;
      uint32_t arg_pnIP = 0;
      uint16_t arg_pnConnPort = 0;
      uint16_t arg_pnQueryPort = 0;
      uint32_t arg_punFlags = 0;
      uint32_t arg_pRTime32LastPlayedOnServer = 0;
      int __ret = g_bd_flat_SteamMatchMaking009_GetFavoriteGame(g_bd_self_steammatchmaking009, arg_iGame, &arg_pnAppID, &arg_pnIP, &arg_pnConnPort, &arg_pnQueryPort, &arg_punFlags, &arg_pRTime32LastPlayedOnServer);
      if (respCap < 24) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pnAppID, 4);
      memcpy(resp + 8, &arg_pnIP, 4);
      memcpy(resp + 12, &arg_pnConnPort, 2);
      memcpy(resp + 14, &arg_pnQueryPort, 2);
      memcpy(resp + 16, &arg_punFlags, 4);
      memcpy(resp + 20, &arg_pRTime32LastPlayedOnServer, 4);
      *respLen = 24;
      return 0;
    }
    case (((uint32_t)12) << 16 | 2u): { // SteamMatchMaking009.AddFavoriteGame
      if (g_bd_flat_SteamMatchMaking009_AddFavoriteGame == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nAppID; memcpy(&arg_nAppID, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nIP; memcpy(&arg_nIP, arg + (0u + 4), 4);
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nConnPort; memcpy(&arg_nConnPort, arg + ((0u + 4) + 4), 4);
      if (argLen < (((0u + 4) + 4) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nQueryPort; memcpy(&arg_nQueryPort, arg + (((0u + 4) + 4) + 4), 4);
      if (argLen < ((((0u + 4) + 4) + 4) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_unFlags; memcpy(&arg_unFlags, arg + ((((0u + 4) + 4) + 4) + 4), 4);
      if (argLen < (((((0u + 4) + 4) + 4) + 4) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_rTime32LastPlayedOnServer; memcpy(&arg_rTime32LastPlayedOnServer, arg + (((((0u + 4) + 4) + 4) + 4) + 4), 4);
      int32_t __ret = g_bd_flat_SteamMatchMaking009_AddFavoriteGame(g_bd_self_steammatchmaking009, arg_nAppID, arg_nIP, arg_nConnPort, arg_nQueryPort, arg_unFlags, arg_rTime32LastPlayedOnServer);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)12) << 16 | 3u): { // SteamMatchMaking009.RemoveFavoriteGame
      if (g_bd_flat_SteamMatchMaking009_RemoveFavoriteGame == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nAppID; memcpy(&arg_nAppID, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nIP; memcpy(&arg_nIP, arg + (0u + 4), 4);
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nConnPort; memcpy(&arg_nConnPort, arg + ((0u + 4) + 4), 4);
      if (argLen < (((0u + 4) + 4) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nQueryPort; memcpy(&arg_nQueryPort, arg + (((0u + 4) + 4) + 4), 4);
      if (argLen < ((((0u + 4) + 4) + 4) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_unFlags; memcpy(&arg_unFlags, arg + ((((0u + 4) + 4) + 4) + 4), 4);
      int __ret = g_bd_flat_SteamMatchMaking009_RemoveFavoriteGame(g_bd_self_steammatchmaking009, arg_nAppID, arg_nIP, arg_nConnPort, arg_nQueryPort, arg_unFlags);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)12) << 16 | 4u): { // SteamMatchMaking009.RequestLobbyList
      if (g_bd_flat_SteamMatchMaking009_RequestLobbyList == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint64_t __ret = g_bd_flat_SteamMatchMaking009_RequestLobbyList(g_bd_self_steammatchmaking009);
      if (__ret != 0) gl_helper_cr_track((uint64_t)__ret, 510);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 8);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)12) << 16 | 5u): { // SteamMatchMaking009.AddRequestLobbyListStringFilter
      if (g_bd_flat_SteamMatchMaking009_AddRequestLobbyListStringFilter == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_SteamMatchMaking009_AddRequestLobbyListStringFilter_pchKeyToMatch_buf[4096 + 1];
      const char *arg_pchKeyToMatch = NULL;
      uint32_t arg_pchKeyToMatch_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchKeyToMatch_len, arg + 0u, 4);
      if (arg_pchKeyToMatch_len != 0xFFFFFFFFu) {
        if (arg_pchKeyToMatch_len > 4096 || argLen < 0u + 4 + arg_pchKeyToMatch_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamMatchMaking009_AddRequestLobbyListStringFilter_pchKeyToMatch_buf, arg + 0u + 4, arg_pchKeyToMatch_len);
        g_bd_flat_SteamMatchMaking009_AddRequestLobbyListStringFilter_pchKeyToMatch_buf[arg_pchKeyToMatch_len] = '\0';
        arg_pchKeyToMatch = g_bd_flat_SteamMatchMaking009_AddRequestLobbyListStringFilter_pchKeyToMatch_buf;
      } else {
        arg_pchKeyToMatch_len = 0;
      }
      static char g_bd_flat_SteamMatchMaking009_AddRequestLobbyListStringFilter_pchValueToMatch_buf[4096 + 1];
      const char *arg_pchValueToMatch = NULL;
      uint32_t arg_pchValueToMatch_len = 0;
      if (argLen < (0u + 4 + arg_pchKeyToMatch_len) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchValueToMatch_len, arg + (0u + 4 + arg_pchKeyToMatch_len), 4);
      if (arg_pchValueToMatch_len != 0xFFFFFFFFu) {
        if (arg_pchValueToMatch_len > 4096 || argLen < (0u + 4 + arg_pchKeyToMatch_len) + 4 + arg_pchValueToMatch_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamMatchMaking009_AddRequestLobbyListStringFilter_pchValueToMatch_buf, arg + (0u + 4 + arg_pchKeyToMatch_len) + 4, arg_pchValueToMatch_len);
        g_bd_flat_SteamMatchMaking009_AddRequestLobbyListStringFilter_pchValueToMatch_buf[arg_pchValueToMatch_len] = '\0';
        arg_pchValueToMatch = g_bd_flat_SteamMatchMaking009_AddRequestLobbyListStringFilter_pchValueToMatch_buf;
      } else {
        arg_pchValueToMatch_len = 0;
      }
      if (argLen < ((0u + 4 + arg_pchKeyToMatch_len) + 4 + arg_pchValueToMatch_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_eComparisonType; memcpy(&arg_eComparisonType, arg + ((0u + 4 + arg_pchKeyToMatch_len) + 4 + arg_pchValueToMatch_len), 4);
      g_bd_flat_SteamMatchMaking009_AddRequestLobbyListStringFilter(g_bd_self_steammatchmaking009, arg_pchKeyToMatch, arg_pchValueToMatch, arg_eComparisonType);
      *respLen = 0; return 0;
    }
    case (((uint32_t)12) << 16 | 6u): { // SteamMatchMaking009.AddRequestLobbyListNumericalFilter
      if (g_bd_flat_SteamMatchMaking009_AddRequestLobbyListNumericalFilter == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_SteamMatchMaking009_AddRequestLobbyListNumericalFilter_pchKeyToMatch_buf[4096 + 1];
      const char *arg_pchKeyToMatch = NULL;
      uint32_t arg_pchKeyToMatch_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchKeyToMatch_len, arg + 0u, 4);
      if (arg_pchKeyToMatch_len != 0xFFFFFFFFu) {
        if (arg_pchKeyToMatch_len > 4096 || argLen < 0u + 4 + arg_pchKeyToMatch_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamMatchMaking009_AddRequestLobbyListNumericalFilter_pchKeyToMatch_buf, arg + 0u + 4, arg_pchKeyToMatch_len);
        g_bd_flat_SteamMatchMaking009_AddRequestLobbyListNumericalFilter_pchKeyToMatch_buf[arg_pchKeyToMatch_len] = '\0';
        arg_pchKeyToMatch = g_bd_flat_SteamMatchMaking009_AddRequestLobbyListNumericalFilter_pchKeyToMatch_buf;
      } else {
        arg_pchKeyToMatch_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchKeyToMatch_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_nValueToMatch; memcpy(&arg_nValueToMatch, arg + (0u + 4 + arg_pchKeyToMatch_len), 4);
      if (argLen < ((0u + 4 + arg_pchKeyToMatch_len) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_eComparisonType; memcpy(&arg_eComparisonType, arg + ((0u + 4 + arg_pchKeyToMatch_len) + 4), 4);
      g_bd_flat_SteamMatchMaking009_AddRequestLobbyListNumericalFilter(g_bd_self_steammatchmaking009, arg_pchKeyToMatch, arg_nValueToMatch, arg_eComparisonType);
      *respLen = 0; return 0;
    }
    case (((uint32_t)12) << 16 | 7u): { // SteamMatchMaking009.AddRequestLobbyListNearValueFilter
      if (g_bd_flat_SteamMatchMaking009_AddRequestLobbyListNearValueFilter == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_SteamMatchMaking009_AddRequestLobbyListNearValueFilter_pchKeyToMatch_buf[4096 + 1];
      const char *arg_pchKeyToMatch = NULL;
      uint32_t arg_pchKeyToMatch_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchKeyToMatch_len, arg + 0u, 4);
      if (arg_pchKeyToMatch_len != 0xFFFFFFFFu) {
        if (arg_pchKeyToMatch_len > 4096 || argLen < 0u + 4 + arg_pchKeyToMatch_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamMatchMaking009_AddRequestLobbyListNearValueFilter_pchKeyToMatch_buf, arg + 0u + 4, arg_pchKeyToMatch_len);
        g_bd_flat_SteamMatchMaking009_AddRequestLobbyListNearValueFilter_pchKeyToMatch_buf[arg_pchKeyToMatch_len] = '\0';
        arg_pchKeyToMatch = g_bd_flat_SteamMatchMaking009_AddRequestLobbyListNearValueFilter_pchKeyToMatch_buf;
      } else {
        arg_pchKeyToMatch_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchKeyToMatch_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_nValueToBeCloseTo; memcpy(&arg_nValueToBeCloseTo, arg + (0u + 4 + arg_pchKeyToMatch_len), 4);
      g_bd_flat_SteamMatchMaking009_AddRequestLobbyListNearValueFilter(g_bd_self_steammatchmaking009, arg_pchKeyToMatch, arg_nValueToBeCloseTo);
      *respLen = 0; return 0;
    }
    case (((uint32_t)12) << 16 | 8u): { // SteamMatchMaking009.AddRequestLobbyListFilterSlotsAvailable
      if (g_bd_flat_SteamMatchMaking009_AddRequestLobbyListFilterSlotsAvailable == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_nSlotsAvailable; memcpy(&arg_nSlotsAvailable, arg + 0u, 4);
      g_bd_flat_SteamMatchMaking009_AddRequestLobbyListFilterSlotsAvailable(g_bd_self_steammatchmaking009, arg_nSlotsAvailable);
      *respLen = 0; return 0;
    }
    case (((uint32_t)12) << 16 | 9u): { // SteamMatchMaking009.AddRequestLobbyListDistanceFilter
      if (g_bd_flat_SteamMatchMaking009_AddRequestLobbyListDistanceFilter == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_eLobbyDistanceFilter; memcpy(&arg_eLobbyDistanceFilter, arg + 0u, 4);
      g_bd_flat_SteamMatchMaking009_AddRequestLobbyListDistanceFilter(g_bd_self_steammatchmaking009, arg_eLobbyDistanceFilter);
      *respLen = 0; return 0;
    }
    case (((uint32_t)12) << 16 | 10u): { // SteamMatchMaking009.AddRequestLobbyListResultCountFilter
      if (g_bd_flat_SteamMatchMaking009_AddRequestLobbyListResultCountFilter == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_cMaxResults; memcpy(&arg_cMaxResults, arg + 0u, 4);
      g_bd_flat_SteamMatchMaking009_AddRequestLobbyListResultCountFilter(g_bd_self_steammatchmaking009, arg_cMaxResults);
      *respLen = 0; return 0;
    }
    case (((uint32_t)12) << 16 | 11u): { // SteamMatchMaking009.AddRequestLobbyListCompatibleMembersFilter
      if (g_bd_flat_SteamMatchMaking009_AddRequestLobbyListCompatibleMembersFilter == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      g_bd_flat_SteamMatchMaking009_AddRequestLobbyListCompatibleMembersFilter(g_bd_self_steammatchmaking009, arg_steamIDLobby);
      *respLen = 0; return 0;
    }
    case (((uint32_t)12) << 16 | 12u): { // SteamMatchMaking009.GetLobbyByIndex
      if (g_bd_flat_SteamMatchMaking009_GetLobbyByIndex == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_iLobby; memcpy(&arg_iLobby, arg + 0u, 4);
      uint64_t __ret = g_bd_flat_SteamMatchMaking009_GetLobbyByIndex(g_bd_self_steammatchmaking009, arg_iLobby);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 8);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)12) << 16 | 13u): { // SteamMatchMaking009.CreateLobby
      if (g_bd_flat_SteamMatchMaking009_CreateLobby == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_eLobbyType; memcpy(&arg_eLobbyType, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_cMaxMembers; memcpy(&arg_cMaxMembers, arg + (0u + 4), 4);
      uint64_t __ret = g_bd_flat_SteamMatchMaking009_CreateLobby(g_bd_self_steammatchmaking009, arg_eLobbyType, arg_cMaxMembers);
      if (__ret != 0) gl_helper_cr_track((uint64_t)__ret, 513);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 8);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)12) << 16 | 14u): { // SteamMatchMaking009.JoinLobby
      if (g_bd_flat_SteamMatchMaking009_JoinLobby == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      uint64_t __ret = g_bd_flat_SteamMatchMaking009_JoinLobby(g_bd_self_steammatchmaking009, arg_steamIDLobby);
      if (__ret != 0) gl_helper_cr_track((uint64_t)__ret, 504);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 8);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)12) << 16 | 15u): { // SteamMatchMaking009.LeaveLobby
      if (g_bd_flat_SteamMatchMaking009_LeaveLobby == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      g_bd_flat_SteamMatchMaking009_LeaveLobby(g_bd_self_steammatchmaking009, arg_steamIDLobby);
      *respLen = 0; return 0;
    }
    case (((uint32_t)12) << 16 | 16u): { // SteamMatchMaking009.InviteUserToLobby
      if (g_bd_flat_SteamMatchMaking009_InviteUserToLobby == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      if (argLen < (0u + 8) + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDInvitee; memcpy(&arg_steamIDInvitee, arg + (0u + 8), 8);
      int __ret = g_bd_flat_SteamMatchMaking009_InviteUserToLobby(g_bd_self_steammatchmaking009, arg_steamIDLobby, arg_steamIDInvitee);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)12) << 16 | 17u): { // SteamMatchMaking009.GetNumLobbyMembers
      if (g_bd_flat_SteamMatchMaking009_GetNumLobbyMembers == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      int32_t __ret = g_bd_flat_SteamMatchMaking009_GetNumLobbyMembers(g_bd_self_steammatchmaking009, arg_steamIDLobby);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)12) << 16 | 18u): { // SteamMatchMaking009.GetLobbyMemberByIndex
      if (g_bd_flat_SteamMatchMaking009_GetLobbyMemberByIndex == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      if (argLen < (0u + 8) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_iMember; memcpy(&arg_iMember, arg + (0u + 8), 4);
      uint64_t __ret = g_bd_flat_SteamMatchMaking009_GetLobbyMemberByIndex(g_bd_self_steammatchmaking009, arg_steamIDLobby, arg_iMember);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 8);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)12) << 16 | 19u): { // SteamMatchMaking009.GetLobbyData
      if (g_bd_flat_SteamMatchMaking009_GetLobbyData == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      static char g_bd_flat_SteamMatchMaking009_GetLobbyData_pchKey_buf[4096 + 1];
      const char *arg_pchKey = NULL;
      uint32_t arg_pchKey_len = 0;
      if (argLen < (0u + 8) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchKey_len, arg + (0u + 8), 4);
      if (arg_pchKey_len != 0xFFFFFFFFu) {
        if (arg_pchKey_len > 4096 || argLen < (0u + 8) + 4 + arg_pchKey_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamMatchMaking009_GetLobbyData_pchKey_buf, arg + (0u + 8) + 4, arg_pchKey_len);
        g_bd_flat_SteamMatchMaking009_GetLobbyData_pchKey_buf[arg_pchKey_len] = '\0';
        arg_pchKey = g_bd_flat_SteamMatchMaking009_GetLobbyData_pchKey_buf;
      } else {
        arg_pchKey_len = 0;
      }
      const char *result = g_bd_flat_SteamMatchMaking009_GetLobbyData(g_bd_self_steammatchmaking009, arg_steamIDLobby, arg_pchKey);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)12) << 16 | 20u): { // SteamMatchMaking009.SetLobbyData
      if (g_bd_flat_SteamMatchMaking009_SetLobbyData == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      static char g_bd_flat_SteamMatchMaking009_SetLobbyData_pchKey_buf[4096 + 1];
      const char *arg_pchKey = NULL;
      uint32_t arg_pchKey_len = 0;
      if (argLen < (0u + 8) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchKey_len, arg + (0u + 8), 4);
      if (arg_pchKey_len != 0xFFFFFFFFu) {
        if (arg_pchKey_len > 4096 || argLen < (0u + 8) + 4 + arg_pchKey_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamMatchMaking009_SetLobbyData_pchKey_buf, arg + (0u + 8) + 4, arg_pchKey_len);
        g_bd_flat_SteamMatchMaking009_SetLobbyData_pchKey_buf[arg_pchKey_len] = '\0';
        arg_pchKey = g_bd_flat_SteamMatchMaking009_SetLobbyData_pchKey_buf;
      } else {
        arg_pchKey_len = 0;
      }
      static char g_bd_flat_SteamMatchMaking009_SetLobbyData_pchValue_buf[4096 + 1];
      const char *arg_pchValue = NULL;
      uint32_t arg_pchValue_len = 0;
      if (argLen < ((0u + 8) + 4 + arg_pchKey_len) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchValue_len, arg + ((0u + 8) + 4 + arg_pchKey_len), 4);
      if (arg_pchValue_len != 0xFFFFFFFFu) {
        if (arg_pchValue_len > 4096 || argLen < ((0u + 8) + 4 + arg_pchKey_len) + 4 + arg_pchValue_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamMatchMaking009_SetLobbyData_pchValue_buf, arg + ((0u + 8) + 4 + arg_pchKey_len) + 4, arg_pchValue_len);
        g_bd_flat_SteamMatchMaking009_SetLobbyData_pchValue_buf[arg_pchValue_len] = '\0';
        arg_pchValue = g_bd_flat_SteamMatchMaking009_SetLobbyData_pchValue_buf;
      } else {
        arg_pchValue_len = 0;
      }
      int __ret = g_bd_flat_SteamMatchMaking009_SetLobbyData(g_bd_self_steammatchmaking009, arg_steamIDLobby, arg_pchKey, arg_pchValue);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)12) << 16 | 21u): { // SteamMatchMaking009.GetLobbyDataCount
      if (g_bd_flat_SteamMatchMaking009_GetLobbyDataCount == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      int32_t __ret = g_bd_flat_SteamMatchMaking009_GetLobbyDataCount(g_bd_self_steammatchmaking009, arg_steamIDLobby);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)12) << 16 | 22u): { // SteamMatchMaking009.GetLobbyDataByIndex
      if (g_bd_flat_SteamMatchMaking009_GetLobbyDataByIndex == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      if (argLen < (0u + 8) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_iLobbyData; memcpy(&arg_iLobbyData, arg + (0u + 8), 4);
      static uint8_t g_bd_flat_SteamMatchMaking009_GetLobbyDataByIndex_pchKey_buf[256];
      uint32_t cap_pchKey = 0;
      if (argLen < ((0u + 8) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&cap_pchKey, arg + ((0u + 8) + 4), 4);
      if (cap_pchKey > 256) cap_pchKey = 256;
      if (respCap < 12) { *respLen = 0; return 1; }
      if (cap_pchKey > respCap - 12) cap_pchKey = (uint32_t)(respCap - 12); // response must fit the scratch
      memset(g_bd_flat_SteamMatchMaking009_GetLobbyDataByIndex_pchKey_buf, 0, cap_pchKey); // no earlier call's bytes cross into the game (53-17 WR-04)
      if (argLen < (((0u + 8) + 4) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_cchKeyBufferSize; memcpy(&arg_cchKeyBufferSize, arg + (((0u + 8) + 4) + 4), 4);
      static uint8_t g_bd_flat_SteamMatchMaking009_GetLobbyDataByIndex_pchValue_buf[8192];
      uint32_t cap_pchValue = 0;
      if (argLen < ((((0u + 8) + 4) + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&cap_pchValue, arg + ((((0u + 8) + 4) + 4) + 4), 4);
      if (cap_pchValue > 8192) cap_pchValue = 8192;
      if (respCap < 12) { *respLen = 0; return 1; }
      if (cap_pchValue > respCap - 12) cap_pchValue = (uint32_t)(respCap - 12); // response must fit the scratch
      memset(g_bd_flat_SteamMatchMaking009_GetLobbyDataByIndex_pchValue_buf, 0, cap_pchValue); // no earlier call's bytes cross into the game (53-17 WR-04)
      if (argLen < (((((0u + 8) + 4) + 4) + 4) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_cchValueBufferSize; memcpy(&arg_cchValueBufferSize, arg + (((((0u + 8) + 4) + 4) + 4) + 4), 4);
      if ((int64_t)arg_cchKeyBufferSize < 0 || (int64_t)arg_cchKeyBufferSize > (int64_t)cap_pchKey) arg_cchKeyBufferSize = (int32_t)cap_pchKey;
      if ((int64_t)arg_cchValueBufferSize < 0 || (int64_t)arg_cchValueBufferSize > (int64_t)cap_pchValue) arg_cchValueBufferSize = (int32_t)cap_pchValue;
      int __ret = g_bd_flat_SteamMatchMaking009_GetLobbyDataByIndex(g_bd_self_steammatchmaking009, arg_steamIDLobby, arg_iLobbyData, g_bd_flat_SteamMatchMaking009_GetLobbyDataByIndex_pchKey_buf, arg_cchKeyBufferSize, g_bd_flat_SteamMatchMaking009_GetLobbyDataByIndex_pchValue_buf, arg_cchValueBufferSize);
      if (respCap < 12) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      uint32_t bufOff = 4;
      uint32_t outLen_pchKey = cap_pchKey;
      if (respCap < bufOff + 4 + outLen_pchKey) { *respLen = 0; return 1; }
      memcpy(resp + bufOff, &outLen_pchKey, 4);
      memcpy(resp + bufOff + 4, g_bd_flat_SteamMatchMaking009_GetLobbyDataByIndex_pchKey_buf, outLen_pchKey);
      bufOff += 4 + outLen_pchKey;
      uint32_t outLen_pchValue = cap_pchValue;
      if (respCap < bufOff + 4 + outLen_pchValue) { *respLen = 0; return 1; }
      memcpy(resp + bufOff, &outLen_pchValue, 4);
      memcpy(resp + bufOff + 4, g_bd_flat_SteamMatchMaking009_GetLobbyDataByIndex_pchValue_buf, outLen_pchValue);
      bufOff += 4 + outLen_pchValue;
      *respLen = bufOff;
      return 0;
    }
    case (((uint32_t)12) << 16 | 23u): { // SteamMatchMaking009.DeleteLobbyData
      if (g_bd_flat_SteamMatchMaking009_DeleteLobbyData == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      static char g_bd_flat_SteamMatchMaking009_DeleteLobbyData_pchKey_buf[4096 + 1];
      const char *arg_pchKey = NULL;
      uint32_t arg_pchKey_len = 0;
      if (argLen < (0u + 8) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchKey_len, arg + (0u + 8), 4);
      if (arg_pchKey_len != 0xFFFFFFFFu) {
        if (arg_pchKey_len > 4096 || argLen < (0u + 8) + 4 + arg_pchKey_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamMatchMaking009_DeleteLobbyData_pchKey_buf, arg + (0u + 8) + 4, arg_pchKey_len);
        g_bd_flat_SteamMatchMaking009_DeleteLobbyData_pchKey_buf[arg_pchKey_len] = '\0';
        arg_pchKey = g_bd_flat_SteamMatchMaking009_DeleteLobbyData_pchKey_buf;
      } else {
        arg_pchKey_len = 0;
      }
      int __ret = g_bd_flat_SteamMatchMaking009_DeleteLobbyData(g_bd_self_steammatchmaking009, arg_steamIDLobby, arg_pchKey);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)12) << 16 | 24u): { // SteamMatchMaking009.GetLobbyMemberData
      if (g_bd_flat_SteamMatchMaking009_GetLobbyMemberData == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      if (argLen < (0u + 8) + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDUser; memcpy(&arg_steamIDUser, arg + (0u + 8), 8);
      static char g_bd_flat_SteamMatchMaking009_GetLobbyMemberData_pchKey_buf[4096 + 1];
      const char *arg_pchKey = NULL;
      uint32_t arg_pchKey_len = 0;
      if (argLen < ((0u + 8) + 8) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchKey_len, arg + ((0u + 8) + 8), 4);
      if (arg_pchKey_len != 0xFFFFFFFFu) {
        if (arg_pchKey_len > 4096 || argLen < ((0u + 8) + 8) + 4 + arg_pchKey_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamMatchMaking009_GetLobbyMemberData_pchKey_buf, arg + ((0u + 8) + 8) + 4, arg_pchKey_len);
        g_bd_flat_SteamMatchMaking009_GetLobbyMemberData_pchKey_buf[arg_pchKey_len] = '\0';
        arg_pchKey = g_bd_flat_SteamMatchMaking009_GetLobbyMemberData_pchKey_buf;
      } else {
        arg_pchKey_len = 0;
      }
      const char *result = g_bd_flat_SteamMatchMaking009_GetLobbyMemberData(g_bd_self_steammatchmaking009, arg_steamIDLobby, arg_steamIDUser, arg_pchKey);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)12) << 16 | 25u): { // SteamMatchMaking009.SetLobbyMemberData
      if (g_bd_flat_SteamMatchMaking009_SetLobbyMemberData == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      static char g_bd_flat_SteamMatchMaking009_SetLobbyMemberData_pchKey_buf[4096 + 1];
      const char *arg_pchKey = NULL;
      uint32_t arg_pchKey_len = 0;
      if (argLen < (0u + 8) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchKey_len, arg + (0u + 8), 4);
      if (arg_pchKey_len != 0xFFFFFFFFu) {
        if (arg_pchKey_len > 4096 || argLen < (0u + 8) + 4 + arg_pchKey_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamMatchMaking009_SetLobbyMemberData_pchKey_buf, arg + (0u + 8) + 4, arg_pchKey_len);
        g_bd_flat_SteamMatchMaking009_SetLobbyMemberData_pchKey_buf[arg_pchKey_len] = '\0';
        arg_pchKey = g_bd_flat_SteamMatchMaking009_SetLobbyMemberData_pchKey_buf;
      } else {
        arg_pchKey_len = 0;
      }
      static char g_bd_flat_SteamMatchMaking009_SetLobbyMemberData_pchValue_buf[4096 + 1];
      const char *arg_pchValue = NULL;
      uint32_t arg_pchValue_len = 0;
      if (argLen < ((0u + 8) + 4 + arg_pchKey_len) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchValue_len, arg + ((0u + 8) + 4 + arg_pchKey_len), 4);
      if (arg_pchValue_len != 0xFFFFFFFFu) {
        if (arg_pchValue_len > 4096 || argLen < ((0u + 8) + 4 + arg_pchKey_len) + 4 + arg_pchValue_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamMatchMaking009_SetLobbyMemberData_pchValue_buf, arg + ((0u + 8) + 4 + arg_pchKey_len) + 4, arg_pchValue_len);
        g_bd_flat_SteamMatchMaking009_SetLobbyMemberData_pchValue_buf[arg_pchValue_len] = '\0';
        arg_pchValue = g_bd_flat_SteamMatchMaking009_SetLobbyMemberData_pchValue_buf;
      } else {
        arg_pchValue_len = 0;
      }
      g_bd_flat_SteamMatchMaking009_SetLobbyMemberData(g_bd_self_steammatchmaking009, arg_steamIDLobby, arg_pchKey, arg_pchValue);
      *respLen = 0; return 0;
    }
    case (((uint32_t)12) << 16 | 26u): { // SteamMatchMaking009.SendLobbyChatMsg
      if (g_bd_flat_SteamMatchMaking009_SendLobbyChatMsg == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      static uint8_t g_bd_flat_SteamMatchMaking009_SendLobbyChatMsg_pvMsgBody_buf[61440];
      uint32_t arg_pvMsgBody_len = 0;
      if (argLen < (0u + 8) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pvMsgBody_len, arg + (0u + 8), 4);
      if (arg_pvMsgBody_len > 61440) { gl_net_evidence(1, GL_NET_KIND_OVERSIZE, GL_NET_IFACE_MATCHMAKING, 0, arg_pvMsgBody_len, GL_NET_PATH_UNKNOWN); *respLen = 0; return 1; } // oversize refusal is NET evidence -- 58-10
      if (arg_pvMsgBody_len > 61440 || (uint64_t)argLen < (uint64_t)((0u + 8)) + 4u + arg_pvMsgBody_len) { *respLen = 0; return 1; } // in-buffer past cap or argLen -- T-58-16
      memcpy(g_bd_flat_SteamMatchMaking009_SendLobbyChatMsg_pvMsgBody_buf, arg + (0u + 8) + 4, arg_pvMsgBody_len);
      const void *arg_pvMsgBody = g_bd_flat_SteamMatchMaking009_SendLobbyChatMsg_pvMsgBody_buf;
      if (argLen < ((0u + 8) + 4 + arg_pvMsgBody_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_cubMsgBody; memcpy(&arg_cubMsgBody, arg + ((0u + 8) + 4 + arg_pvMsgBody_len), 4);
      if ((int64_t)arg_cubMsgBody != (int64_t)arg_pvMsgBody_len) { *respLen = 0; return 1; } // lenParam must equal the bytes sent -- T-58-16
      int __ret = g_bd_flat_SteamMatchMaking009_SendLobbyChatMsg(g_bd_self_steammatchmaking009, arg_steamIDLobby, arg_pvMsgBody, arg_cubMsgBody);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)12) << 16 | 27u): { // SteamMatchMaking009.GetLobbyChatEntry
      if (g_bd_flat_SteamMatchMaking009_GetLobbyChatEntry == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      if (argLen < (0u + 8) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_iChatID; memcpy(&arg_iChatID, arg + (0u + 8), 4);
      uint64_t arg_pSteamIDUser = 0;
      static uint8_t g_bd_flat_SteamMatchMaking009_GetLobbyChatEntry_pvData_buf[4096];
      uint32_t cap_pvData = 0;
      if (argLen < ((0u + 8) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&cap_pvData, arg + ((0u + 8) + 4), 4);
      if (cap_pvData > 4096) cap_pvData = 4096;
      if (respCap < 20) { *respLen = 0; return 1; }
      if (cap_pvData > respCap - 20) cap_pvData = (uint32_t)(respCap - 20); // response must fit the scratch
      memset(g_bd_flat_SteamMatchMaking009_GetLobbyChatEntry_pvData_buf, 0, cap_pvData); // no earlier call's bytes cross into the game (53-17 WR-04)
      if (argLen < (((0u + 8) + 4) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_cubData; memcpy(&arg_cubData, arg + (((0u + 8) + 4) + 4), 4);
      uint32_t arg_peChatEntryType = 0;
      if ((int64_t)arg_cubData < 0 || (int64_t)arg_cubData > (int64_t)cap_pvData) arg_cubData = (int32_t)cap_pvData;
      int32_t __ret = g_bd_flat_SteamMatchMaking009_GetLobbyChatEntry(g_bd_self_steammatchmaking009, arg_steamIDLobby, arg_iChatID, &arg_pSteamIDUser, g_bd_flat_SteamMatchMaking009_GetLobbyChatEntry_pvData_buf, arg_cubData, &arg_peChatEntryType);
      if (respCap < 20) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pSteamIDUser, 8);
      memcpy(resp + 12, &arg_peChatEntryType, 4);
      uint32_t outLen_pvData = cap_pvData;
      memcpy(resp + 16, &outLen_pvData, 4);
      memcpy(resp + 16 + 4, g_bd_flat_SteamMatchMaking009_GetLobbyChatEntry_pvData_buf, outLen_pvData);
      *respLen = 16 + 4 + outLen_pvData;
      return 0;
    }
    case (((uint32_t)12) << 16 | 28u): { // SteamMatchMaking009.RequestLobbyData
      if (g_bd_flat_SteamMatchMaking009_RequestLobbyData == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      int __ret = g_bd_flat_SteamMatchMaking009_RequestLobbyData(g_bd_self_steammatchmaking009, arg_steamIDLobby);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)12) << 16 | 29u): { // SteamMatchMaking009.SetLobbyGameServer
      if (g_bd_flat_SteamMatchMaking009_SetLobbyGameServer == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      if (argLen < (0u + 8) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_unGameServerIP; memcpy(&arg_unGameServerIP, arg + (0u + 8), 4);
      if (argLen < ((0u + 8) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_unGameServerPort; memcpy(&arg_unGameServerPort, arg + ((0u + 8) + 4), 4);
      if (argLen < (((0u + 8) + 4) + 4) + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDGameServer; memcpy(&arg_steamIDGameServer, arg + (((0u + 8) + 4) + 4), 8);
      g_bd_flat_SteamMatchMaking009_SetLobbyGameServer(g_bd_self_steammatchmaking009, arg_steamIDLobby, arg_unGameServerIP, arg_unGameServerPort, arg_steamIDGameServer);
      *respLen = 0; return 0;
    }
    case (((uint32_t)12) << 16 | 30u): { // SteamMatchMaking009.GetLobbyGameServer
      if (g_bd_flat_SteamMatchMaking009_GetLobbyGameServer == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      uint32_t arg_punGameServerIP = 0;
      uint16_t arg_punGameServerPort = 0;
      uint64_t arg_psteamIDGameServer = 0;
      int __ret = g_bd_flat_SteamMatchMaking009_GetLobbyGameServer(g_bd_self_steammatchmaking009, arg_steamIDLobby, &arg_punGameServerIP, &arg_punGameServerPort, &arg_psteamIDGameServer);
      if (respCap < 18) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_punGameServerIP, 4);
      memcpy(resp + 8, &arg_punGameServerPort, 2);
      memcpy(resp + 10, &arg_psteamIDGameServer, 8);
      *respLen = 18;
      return 0;
    }
    case (((uint32_t)12) << 16 | 31u): { // SteamMatchMaking009.SetLobbyMemberLimit
      if (g_bd_flat_SteamMatchMaking009_SetLobbyMemberLimit == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      if (argLen < (0u + 8) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_cMaxMembers; memcpy(&arg_cMaxMembers, arg + (0u + 8), 4);
      int __ret = g_bd_flat_SteamMatchMaking009_SetLobbyMemberLimit(g_bd_self_steammatchmaking009, arg_steamIDLobby, arg_cMaxMembers);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)12) << 16 | 32u): { // SteamMatchMaking009.GetLobbyMemberLimit
      if (g_bd_flat_SteamMatchMaking009_GetLobbyMemberLimit == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      int32_t __ret = g_bd_flat_SteamMatchMaking009_GetLobbyMemberLimit(g_bd_self_steammatchmaking009, arg_steamIDLobby);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)12) << 16 | 33u): { // SteamMatchMaking009.SetLobbyType
      if (g_bd_flat_SteamMatchMaking009_SetLobbyType == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      if (argLen < (0u + 8) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_eLobbyType; memcpy(&arg_eLobbyType, arg + (0u + 8), 4);
      int __ret = g_bd_flat_SteamMatchMaking009_SetLobbyType(g_bd_self_steammatchmaking009, arg_steamIDLobby, arg_eLobbyType);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)12) << 16 | 34u): { // SteamMatchMaking009.SetLobbyJoinable
      if (g_bd_flat_SteamMatchMaking009_SetLobbyJoinable == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      if (argLen < (0u + 8) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int arg_bLobbyJoinable; memcpy(&arg_bLobbyJoinable, arg + (0u + 8), 4);
      int __ret = g_bd_flat_SteamMatchMaking009_SetLobbyJoinable(g_bd_self_steammatchmaking009, arg_steamIDLobby, arg_bLobbyJoinable);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)12) << 16 | 35u): { // SteamMatchMaking009.GetLobbyOwner
      if (g_bd_flat_SteamMatchMaking009_GetLobbyOwner == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      uint64_t __ret = g_bd_flat_SteamMatchMaking009_GetLobbyOwner(g_bd_self_steammatchmaking009, arg_steamIDLobby);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 8);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)12) << 16 | 36u): { // SteamMatchMaking009.SetLobbyOwner
      if (g_bd_flat_SteamMatchMaking009_SetLobbyOwner == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      if (argLen < (0u + 8) + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDNewOwner; memcpy(&arg_steamIDNewOwner, arg + (0u + 8), 8);
      int __ret = g_bd_flat_SteamMatchMaking009_SetLobbyOwner(g_bd_self_steammatchmaking009, arg_steamIDLobby, arg_steamIDNewOwner);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)12) << 16 | 37u): { // SteamMatchMaking009.SetLinkedLobby
      if (g_bd_flat_SteamMatchMaking009_SetLinkedLobby == NULL || g_bd_self_steammatchmaking009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobby; memcpy(&arg_steamIDLobby, arg + 0u, 8);
      if (argLen < (0u + 8) + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDLobbyDependent; memcpy(&arg_steamIDLobbyDependent, arg + (0u + 8), 8);
      int __ret = g_bd_flat_SteamMatchMaking009_SetLinkedLobby(g_bd_self_steammatchmaking009, arg_steamIDLobby, arg_steamIDLobbyDependent);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 0u): { // SteamClient017.CreateSteamPipe
      if (g_bd_flat_SteamClient017_CreateSteamPipe == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.CreateSteamPipe unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_SteamClient017_CreateSteamPipe(g_bd_self_steamclient017);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.CreateSteamPipe -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 1u): { // SteamClient017.BReleaseSteamPipe
      if (g_bd_flat_SteamClient017_BReleaseSteamPipe == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.BReleaseSteamPipe unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      int __ret = g_bd_flat_SteamClient017_BReleaseSteamPipe(g_bd_self_steamclient017, arg_hSteamPipe);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.BReleaseSteamPipe -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 2u): { // SteamClient017.ConnectToGlobalUser
      if (g_bd_flat_SteamClient017_ConnectToGlobalUser == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.ConnectToGlobalUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      int32_t __ret = g_bd_flat_SteamClient017_ConnectToGlobalUser(g_bd_self_steamclient017, arg_hSteamPipe);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.ConnectToGlobalUser -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 3u): { // SteamClient017.CreateLocalUser
      if (g_bd_flat_SteamClient017_CreateLocalUser == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.CreateLocalUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t arg_phSteamPipe = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_eAccountType; memcpy(&arg_eAccountType, arg + 0u, 4);
      int32_t __ret = g_bd_flat_SteamClient017_CreateLocalUser(g_bd_self_steamclient017, &arg_phSteamPipe, arg_eAccountType);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.CreateLocalUser -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_phSteamPipe, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)16) << 16 | 4u): { // SteamClient017.ReleaseUser
      if (g_bd_flat_SteamClient017_ReleaseUser == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.ReleaseUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hUser; memcpy(&arg_hUser, arg + (0u + 4), 4);
      g_bd_flat_SteamClient017_ReleaseUser(g_bd_self_steamclient017, arg_hSteamPipe, arg_hUser);
      logts("FWD", "SteamClient017.ReleaseUser " "called");
      *respLen = 0; return 0;
    }
    case (((uint32_t)16) << 16 | 5u): { // SteamClient017.GetISteamUser
      if (g_bd_flat_SteamClient017_GetISteamUser == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamUser_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamUser_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamUser_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamUser_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamUser(g_bd_self_steamclient017, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamUser ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 6u): { // SteamClient017.GetISteamGameServer
      if (g_bd_flat_SteamClient017_GetISteamGameServer == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamGameServer unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamGameServer_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamGameServer_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamGameServer_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamGameServer_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamGameServer(g_bd_self_steamclient017, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamGameServer ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 8u): { // SteamClient017.GetISteamFriends
      if (g_bd_flat_SteamClient017_GetISteamFriends == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamFriends unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamFriends_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamFriends_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamFriends_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamFriends_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamFriends(g_bd_self_steamclient017, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamFriends ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 9u): { // SteamClient017.GetISteamUtils
      if (g_bd_flat_SteamClient017_GetISteamUtils == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamUtils unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      static char g_bd_flat_SteamClient017_GetISteamUtils_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + (0u + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < (0u + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamUtils_pchVersion_buf, arg + (0u + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamUtils_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamUtils_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamUtils(g_bd_self_steamclient017, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamUtils ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 10u): { // SteamClient017.GetISteamMatchmaking
      if (g_bd_flat_SteamClient017_GetISteamMatchmaking == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamMatchmaking unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamMatchmaking_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamMatchmaking_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamMatchmaking_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamMatchmaking_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamMatchmaking(g_bd_self_steamclient017, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamMatchmaking ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 11u): { // SteamClient017.GetISteamMatchmakingServers
      if (g_bd_flat_SteamClient017_GetISteamMatchmakingServers == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamMatchmakingServers unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamMatchmakingServers_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamMatchmakingServers_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamMatchmakingServers_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamMatchmakingServers_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamMatchmakingServers(g_bd_self_steamclient017, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamMatchmakingServers ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 12u): { // SteamClient017.GetISteamGenericInterface
      if (g_bd_flat_SteamClient017_GetISteamGenericInterface == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamGenericInterface unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamGenericInterface_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamGenericInterface_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamGenericInterface_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamGenericInterface_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamGenericInterface(g_bd_self_steamclient017, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamGenericInterface ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 13u): { // SteamClient017.GetISteamUserStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too
      if (g_bd_flat_SteamClient017_GetISteamUserStats == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamUserStats unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamUserStats_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamUserStats_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamUserStats_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamUserStats_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamUserStats(g_bd_self_steamclient017, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamUserStats ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 14u): { // SteamClient017.GetISteamGameServerStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too
      if (g_bd_flat_SteamClient017_GetISteamGameServerStats == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamGameServerStats unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamGameServerStats_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamGameServerStats_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamGameServerStats_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamGameServerStats_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamGameServerStats(g_bd_self_steamclient017, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamGameServerStats ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 15u): { // SteamClient017.GetISteamApps
      if (g_bd_flat_SteamClient017_GetISteamApps == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamApps unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamApps_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamApps_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamApps_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamApps_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamApps(g_bd_self_steamclient017, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamApps ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 16u): { // SteamClient017.GetISteamNetworking
      if (g_bd_flat_SteamClient017_GetISteamNetworking == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamNetworking unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamNetworking_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamNetworking_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamNetworking_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamNetworking_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamNetworking(g_bd_self_steamclient017, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamNetworking ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 17u): { // SteamClient017.GetISteamRemoteStorage
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too
      if (g_bd_flat_SteamClient017_GetISteamRemoteStorage == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamRemoteStorage unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamRemoteStorage_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamRemoteStorage_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamRemoteStorage_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamRemoteStorage_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamRemoteStorage(g_bd_self_steamclient017, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamRemoteStorage ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 18u): { // SteamClient017.GetISteamScreenshots
      if (g_bd_flat_SteamClient017_GetISteamScreenshots == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamScreenshots unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamScreenshots_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamScreenshots_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamScreenshots_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamScreenshots_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamScreenshots(g_bd_self_steamclient017, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamScreenshots ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 19u): { // SteamClient017.RunFrame
      if (g_bd_flat_SteamClient017_RunFrame == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.RunFrame unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      g_bd_flat_SteamClient017_RunFrame(g_bd_self_steamclient017);
      logts("FWD", "SteamClient017.RunFrame " "called");
      *respLen = 0; return 0;
    }
    case (((uint32_t)16) << 16 | 20u): { // SteamClient017.GetIPCCallCount
      if (g_bd_flat_SteamClient017_GetIPCCallCount == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetIPCCallCount unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamClient017_GetIPCCallCount(g_bd_self_steamclient017);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetIPCCallCount -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 22u): { // SteamClient017.BShutdownIfAllPipesClosed
      if (g_bd_flat_SteamClient017_BShutdownIfAllPipesClosed == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.BShutdownIfAllPipesClosed unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamClient017_BShutdownIfAllPipesClosed(g_bd_self_steamclient017);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.BShutdownIfAllPipesClosed -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 23u): { // SteamClient017.GetISteamHTTP
      if (g_bd_flat_SteamClient017_GetISteamHTTP == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamHTTP unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamHTTP_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamHTTP_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamHTTP_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamHTTP_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamHTTP(g_bd_self_steamclient017, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamHTTP ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 24u): { // SteamClient017.DEPRECATED_GetISteamUnifiedMessages
      if (g_bd_flat_SteamClient017_DEPRECATED_GetISteamUnifiedMessages == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.DEPRECATED_GetISteamUnifiedMessages unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_DEPRECATED_GetISteamUnifiedMessages_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_DEPRECATED_GetISteamUnifiedMessages_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_DEPRECATED_GetISteamUnifiedMessages_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_DEPRECATED_GetISteamUnifiedMessages_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_DEPRECATED_GetISteamUnifiedMessages(g_bd_self_steamclient017, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.DEPRECATED_GetISteamUnifiedMessages ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 25u): { // SteamClient017.GetISteamController
      if (g_bd_flat_SteamClient017_GetISteamController == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamController unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamController_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamController_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamController_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamController_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamController(g_bd_self_steamclient017, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamController ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 26u): { // SteamClient017.GetISteamUGC
      if (g_bd_flat_SteamClient017_GetISteamUGC == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamUGC unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamUGC_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamUGC_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamUGC_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamUGC_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamUGC(g_bd_self_steamclient017, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamUGC ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 27u): { // SteamClient017.GetISteamAppList
      if (g_bd_flat_SteamClient017_GetISteamAppList == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamAppList unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamAppList_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamAppList_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamAppList_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamAppList_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamAppList(g_bd_self_steamclient017, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamAppList ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 28u): { // SteamClient017.GetISteamMusic
      if (g_bd_flat_SteamClient017_GetISteamMusic == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamMusic unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamMusic_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamMusic_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamMusic_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamMusic_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamMusic(g_bd_self_steamclient017, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamMusic ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 29u): { // SteamClient017.GetISteamMusicRemote
      if (g_bd_flat_SteamClient017_GetISteamMusicRemote == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamMusicRemote unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamMusicRemote_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamMusicRemote_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamMusicRemote_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamMusicRemote_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamMusicRemote(g_bd_self_steamclient017, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamMusicRemote ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 30u): { // SteamClient017.GetISteamHTMLSurface
      if (g_bd_flat_SteamClient017_GetISteamHTMLSurface == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamHTMLSurface unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamHTMLSurface_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamHTMLSurface_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamHTMLSurface_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamHTMLSurface_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamHTMLSurface(g_bd_self_steamclient017, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamHTMLSurface ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 34u): { // SteamClient017.GetISteamInventory
      if (g_bd_flat_SteamClient017_GetISteamInventory == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamInventory unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamInventory_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamInventory_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamInventory_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamInventory_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamInventory(g_bd_self_steamclient017, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamInventory ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 35u): { // SteamClient017.GetISteamVideo
      if (g_bd_flat_SteamClient017_GetISteamVideo == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamVideo unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamVideo_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamVideo_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamVideo_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamVideo_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamVideo(g_bd_self_steamclient017, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamVideo ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 36u): { // SteamClient017.GetISteamParentalSettings
      if (g_bd_flat_SteamClient017_GetISteamParentalSettings == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamParentalSettings unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamParentalSettings_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamParentalSettings_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamParentalSettings_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamParentalSettings_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamParentalSettings(g_bd_self_steamclient017, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamParentalSettings ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)17) << 16 | 0u): { // SteamUser019.GetHSteamUser
      if (g_bd_flat_SteamUser019_GetHSteamUser == NULL || g_bd_self_steamuser019 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_SteamUser019_GetHSteamUser(g_bd_self_steamuser019);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)17) << 16 | 1u): { // SteamUser019.BLoggedOn
      if (g_bd_flat_SteamUser019_BLoggedOn == NULL || g_bd_self_steamuser019 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUser019_BLoggedOn(g_bd_self_steamuser019);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)17) << 16 | 2u): { // SteamUser019.GetSteamID
      if (g_bd_flat_SteamUser019_GetSteamID == NULL || g_bd_self_steamuser019 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint64_t __ret = g_bd_flat_SteamUser019_GetSteamID(g_bd_self_steamuser019);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 8);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)18) << 16 | 0u): { // SteamFriends015.GetPersonaName
      if (g_bd_flat_SteamFriends015_GetPersonaName == NULL || g_bd_self_steamfriends015 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamFriends015_GetPersonaName(g_bd_self_steamfriends015);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)18) << 16 | 2u): { // SteamFriends015.GetPersonaState
      if (g_bd_flat_SteamFriends015_GetPersonaState == NULL || g_bd_self_steamfriends015 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamFriends015_GetPersonaState(g_bd_self_steamfriends015);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)18) << 16 | 7u): { // SteamFriends015.GetFriendPersonaName
      if (g_bd_flat_SteamFriends015_GetFriendPersonaName == NULL || g_bd_self_steamfriends015 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDFriend; memcpy(&arg_steamIDFriend, arg + 0u, 8);
      const char *result = g_bd_flat_SteamFriends015_GetFriendPersonaName(g_bd_self_steamfriends015, arg_steamIDFriend);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)19) << 16 | 0u): { // SteamUtils008.GetSecondsSinceAppActive
      if (g_bd_flat_SteamUtils008_GetSecondsSinceAppActive == NULL || g_bd_self_steamutils008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils008_GetSecondsSinceAppActive(g_bd_self_steamutils008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)19) << 16 | 1u): { // SteamUtils008.GetSecondsSinceComputerActive
      if (g_bd_flat_SteamUtils008_GetSecondsSinceComputerActive == NULL || g_bd_self_steamutils008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils008_GetSecondsSinceComputerActive(g_bd_self_steamutils008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)19) << 16 | 2u): { // SteamUtils008.GetConnectedUniverse
      if (g_bd_flat_SteamUtils008_GetConnectedUniverse == NULL || g_bd_self_steamutils008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils008_GetConnectedUniverse(g_bd_self_steamutils008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)19) << 16 | 3u): { // SteamUtils008.GetServerRealTime
      if (g_bd_flat_SteamUtils008_GetServerRealTime == NULL || g_bd_self_steamutils008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils008_GetServerRealTime(g_bd_self_steamutils008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)19) << 16 | 4u): { // SteamUtils008.GetIPCountry
      if (g_bd_flat_SteamUtils008_GetIPCountry == NULL || g_bd_self_steamutils008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamUtils008_GetIPCountry(g_bd_self_steamutils008);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)19) << 16 | 8u): { // SteamUtils008.GetCurrentBatteryPower
      if (g_bd_flat_SteamUtils008_GetCurrentBatteryPower == NULL || g_bd_self_steamutils008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils008_GetCurrentBatteryPower(g_bd_self_steamutils008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)19) << 16 | 9u): { // SteamUtils008.GetAppID
      if (g_bd_identity_only) { // D-51-04: identity-only reports the launching game's real AppID, never 480
        uint32_t v = g_bd_report_appid;
        if (respCap < 4) { *respLen = 0; return 1; }
        memcpy(resp, &v, 4); *respLen = 4; return 0;
      }
      if (g_bd_flat_SteamUtils008_GetAppID == NULL || g_bd_self_steamutils008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils008_GetAppID(g_bd_self_steamutils008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)19) << 16 | 17u): { // SteamUtils008.IsOverlayEnabled
      if (g_bd_flat_SteamUtils008_IsOverlayEnabled == NULL || g_bd_self_steamutils008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUtils008_IsOverlayEnabled(g_bd_self_steamutils008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)19) << 16 | 23u): { // SteamUtils008.GetSteamUILanguage
      if (g_bd_flat_SteamUtils008_GetSteamUILanguage == NULL || g_bd_self_steamutils008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamUtils008_GetSteamUILanguage(g_bd_self_steamutils008);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)19) << 16 | 24u): { // SteamUtils008.IsSteamRunningInVR
      if (g_bd_flat_SteamUtils008_IsSteamRunningInVR == NULL || g_bd_self_steamutils008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUtils008_IsSteamRunningInVR(g_bd_self_steamutils008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)19) << 16 | 26u): { // SteamUtils008.IsSteamInBigPictureMode
      if (g_bd_flat_SteamUtils008_IsSteamInBigPictureMode == NULL || g_bd_self_steamutils008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUtils008_IsSteamInBigPictureMode(g_bd_self_steamutils008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)20) << 16 | 0u): { // STEAMAPPS_INTERFACE_VERSION008.BIsSubscribed
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribed == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribed(g_bd_self_steamapps_interface_version008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)20) << 16 | 1u): { // STEAMAPPS_INTERFACE_VERSION008.BIsLowViolence
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsLowViolence == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsLowViolence(g_bd_self_steamapps_interface_version008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)20) << 16 | 2u): { // STEAMAPPS_INTERFACE_VERSION008.BIsCybercafe
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsCybercafe == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsCybercafe(g_bd_self_steamapps_interface_version008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)20) << 16 | 3u): { // STEAMAPPS_INTERFACE_VERSION008.BIsVACBanned
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsVACBanned == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsVACBanned(g_bd_self_steamapps_interface_version008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)20) << 16 | 4u): { // STEAMAPPS_INTERFACE_VERSION008.GetCurrentGameLanguage
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetCurrentGameLanguage == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetCurrentGameLanguage(g_bd_self_steamapps_interface_version008);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)20) << 16 | 5u): { // STEAMAPPS_INTERFACE_VERSION008.GetAvailableGameLanguages
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetAvailableGameLanguages == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetAvailableGameLanguages(g_bd_self_steamapps_interface_version008);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)20) << 16 | 6u): { // STEAMAPPS_INTERFACE_VERSION008.BIsSubscribedApp
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedApp == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_appID; memcpy(&arg_appID, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedApp(g_bd_self_steamapps_interface_version008, arg_appID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)20) << 16 | 7u): { // STEAMAPPS_INTERFACE_VERSION008.BIsDlcInstalled
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsDlcInstalled == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_appID; memcpy(&arg_appID, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsDlcInstalled(g_bd_self_steamapps_interface_version008, arg_appID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)20) << 16 | 8u): { // STEAMAPPS_INTERFACE_VERSION008.GetEarliestPurchaseUnixTime
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetEarliestPurchaseUnixTime == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nAppID; memcpy(&arg_nAppID, arg + 0u, 4);
      uint32_t __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetEarliestPurchaseUnixTime(g_bd_self_steamapps_interface_version008, arg_nAppID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)20) << 16 | 9u): { // STEAMAPPS_INTERFACE_VERSION008.BIsSubscribedFromFreeWeekend
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedFromFreeWeekend == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedFromFreeWeekend(g_bd_self_steamapps_interface_version008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)20) << 16 | 10u): { // STEAMAPPS_INTERFACE_VERSION008.GetDLCCount
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetDLCCount == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetDLCCount(g_bd_self_steamapps_interface_version008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)20) << 16 | 19u): { // STEAMAPPS_INTERFACE_VERSION008.BIsAppInstalled
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsAppInstalled == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_appID; memcpy(&arg_appID, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsAppInstalled(g_bd_self_steamapps_interface_version008, arg_appID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)20) << 16 | 20u): { // STEAMAPPS_INTERFACE_VERSION008.GetAppOwner
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetAppOwner == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint64_t __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetAppOwner(g_bd_self_steamapps_interface_version008);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 8);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)20) << 16 | 23u): { // STEAMAPPS_INTERFACE_VERSION008.GetAppBuildId
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetAppBuildId == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetAppBuildId(g_bd_self_steamapps_interface_version008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 0u): { // SteamClient014.CreateSteamPipe
      if (g_bd_flat_SteamClient014_CreateSteamPipe == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.CreateSteamPipe unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_SteamClient014_CreateSteamPipe(g_bd_self_steamclient014);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.CreateSteamPipe -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 1u): { // SteamClient014.BReleaseSteamPipe
      if (g_bd_flat_SteamClient014_BReleaseSteamPipe == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.BReleaseSteamPipe unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      int __ret = g_bd_flat_SteamClient014_BReleaseSteamPipe(g_bd_self_steamclient014, arg_hSteamPipe);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.BReleaseSteamPipe -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 2u): { // SteamClient014.ConnectToGlobalUser
      if (g_bd_flat_SteamClient014_ConnectToGlobalUser == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.ConnectToGlobalUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      int32_t __ret = g_bd_flat_SteamClient014_ConnectToGlobalUser(g_bd_self_steamclient014, arg_hSteamPipe);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.ConnectToGlobalUser -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 3u): { // SteamClient014.CreateLocalUser
      if (g_bd_flat_SteamClient014_CreateLocalUser == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.CreateLocalUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t arg_phSteamPipe = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_eAccountType; memcpy(&arg_eAccountType, arg + 0u, 4);
      int32_t __ret = g_bd_flat_SteamClient014_CreateLocalUser(g_bd_self_steamclient014, &arg_phSteamPipe, arg_eAccountType);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.CreateLocalUser -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_phSteamPipe, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)22) << 16 | 4u): { // SteamClient014.ReleaseUser
      if (g_bd_flat_SteamClient014_ReleaseUser == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.ReleaseUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hUser; memcpy(&arg_hUser, arg + (0u + 4), 4);
      g_bd_flat_SteamClient014_ReleaseUser(g_bd_self_steamclient014, arg_hSteamPipe, arg_hUser);
      logts("FWD", "SteamClient014.ReleaseUser " "called");
      *respLen = 0; return 0;
    }
    case (((uint32_t)22) << 16 | 5u): { // SteamClient014.GetISteamUser
      if (g_bd_flat_SteamClient014_GetISteamUser == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamUser_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamUser_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamUser_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamUser_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamUser(g_bd_self_steamclient014, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamUser ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 6u): { // SteamClient014.GetISteamGameServer
      if (g_bd_flat_SteamClient014_GetISteamGameServer == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamGameServer unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamGameServer_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamGameServer_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamGameServer_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamGameServer_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamGameServer(g_bd_self_steamclient014, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamGameServer ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 8u): { // SteamClient014.GetISteamFriends
      if (g_bd_flat_SteamClient014_GetISteamFriends == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamFriends unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamFriends_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamFriends_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamFriends_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamFriends_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamFriends(g_bd_self_steamclient014, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamFriends ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 9u): { // SteamClient014.GetISteamUtils
      if (g_bd_flat_SteamClient014_GetISteamUtils == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamUtils unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      static char g_bd_flat_SteamClient014_GetISteamUtils_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + (0u + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < (0u + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamUtils_pchVersion_buf, arg + (0u + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamUtils_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamUtils_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamUtils(g_bd_self_steamclient014, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamUtils ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 10u): { // SteamClient014.GetISteamMatchmaking
      if (g_bd_flat_SteamClient014_GetISteamMatchmaking == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamMatchmaking unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamMatchmaking_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamMatchmaking_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamMatchmaking_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamMatchmaking_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamMatchmaking(g_bd_self_steamclient014, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamMatchmaking ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 11u): { // SteamClient014.GetISteamMatchmakingServers
      if (g_bd_flat_SteamClient014_GetISteamMatchmakingServers == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamMatchmakingServers unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamMatchmakingServers_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamMatchmakingServers_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamMatchmakingServers_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamMatchmakingServers_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamMatchmakingServers(g_bd_self_steamclient014, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamMatchmakingServers ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 12u): { // SteamClient014.GetISteamGenericInterface
      if (g_bd_flat_SteamClient014_GetISteamGenericInterface == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamGenericInterface unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamGenericInterface_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamGenericInterface_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamGenericInterface_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamGenericInterface_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamGenericInterface(g_bd_self_steamclient014, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamGenericInterface ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 13u): { // SteamClient014.GetISteamUserStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too
      if (g_bd_flat_SteamClient014_GetISteamUserStats == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamUserStats unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamUserStats_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamUserStats_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamUserStats_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamUserStats_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamUserStats(g_bd_self_steamclient014, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamUserStats ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 14u): { // SteamClient014.GetISteamGameServerStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too
      if (g_bd_flat_SteamClient014_GetISteamGameServerStats == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamGameServerStats unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamGameServerStats_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamGameServerStats_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamGameServerStats_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamGameServerStats_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamGameServerStats(g_bd_self_steamclient014, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamGameServerStats ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 15u): { // SteamClient014.GetISteamApps
      if (g_bd_flat_SteamClient014_GetISteamApps == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamApps unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamApps_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamApps_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamApps_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamApps_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamApps(g_bd_self_steamclient014, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamApps ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 16u): { // SteamClient014.GetISteamNetworking
      if (g_bd_flat_SteamClient014_GetISteamNetworking == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamNetworking unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamNetworking_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamNetworking_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamNetworking_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamNetworking_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamNetworking(g_bd_self_steamclient014, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamNetworking ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 17u): { // SteamClient014.GetISteamRemoteStorage
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too
      if (g_bd_flat_SteamClient014_GetISteamRemoteStorage == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamRemoteStorage unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamRemoteStorage_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamRemoteStorage_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamRemoteStorage_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamRemoteStorage_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamRemoteStorage(g_bd_self_steamclient014, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamRemoteStorage ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 18u): { // SteamClient014.GetISteamScreenshots
      if (g_bd_flat_SteamClient014_GetISteamScreenshots == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamScreenshots unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamScreenshots_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamScreenshots_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamScreenshots_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamScreenshots_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamScreenshots(g_bd_self_steamclient014, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamScreenshots ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 19u): { // SteamClient014.RunFrame
      if (g_bd_flat_SteamClient014_RunFrame == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.RunFrame unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      g_bd_flat_SteamClient014_RunFrame(g_bd_self_steamclient014);
      logts("FWD", "SteamClient014.RunFrame " "called");
      *respLen = 0; return 0;
    }
    case (((uint32_t)22) << 16 | 20u): { // SteamClient014.GetIPCCallCount
      if (g_bd_flat_SteamClient014_GetIPCCallCount == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetIPCCallCount unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamClient014_GetIPCCallCount(g_bd_self_steamclient014);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetIPCCallCount -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 22u): { // SteamClient014.BShutdownIfAllPipesClosed
      if (g_bd_flat_SteamClient014_BShutdownIfAllPipesClosed == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.BShutdownIfAllPipesClosed unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamClient014_BShutdownIfAllPipesClosed(g_bd_self_steamclient014);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.BShutdownIfAllPipesClosed -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 23u): { // SteamClient014.GetISteamHTTP
      if (g_bd_flat_SteamClient014_GetISteamHTTP == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamHTTP unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamHTTP_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamHTTP_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamHTTP_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamHTTP_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamHTTP(g_bd_self_steamclient014, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamHTTP ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 24u): { // SteamClient014.GetISteamUnifiedMessages
      if (g_bd_flat_SteamClient014_GetISteamUnifiedMessages == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamUnifiedMessages unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamUnifiedMessages_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamUnifiedMessages_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamUnifiedMessages_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamUnifiedMessages_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamUnifiedMessages(g_bd_self_steamclient014, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamUnifiedMessages ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 25u): { // SteamClient014.GetISteamController
      if (g_bd_flat_SteamClient014_GetISteamController == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamController unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamController_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamController_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamController_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamController_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamController(g_bd_self_steamclient014, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamController ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 26u): { // SteamClient014.GetISteamUGC
      if (g_bd_flat_SteamClient014_GetISteamUGC == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamUGC unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamUGC_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamUGC_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamUGC_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamUGC_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamUGC(g_bd_self_steamclient014, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamUGC ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 27u): { // SteamClient014.GetISteamAppList
      if (g_bd_flat_SteamClient014_GetISteamAppList == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamAppList unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamAppList_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamAppList_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamAppList_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamAppList_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamAppList(g_bd_self_steamclient014, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamAppList ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 28u): { // SteamClient014.GetISteamMusic
      if (g_bd_flat_SteamClient014_GetISteamMusic == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamMusic unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamMusic_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamMusic_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamMusic_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamMusic_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamMusic(g_bd_self_steamclient014, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamMusic ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)23) << 16 | 0u): { // SteamNetworking006.SendP2PPacket
      if (g_bd_flat_SteamNetworking006_SendP2PPacket == NULL || g_bd_self_steamnetworking006 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDRemote; memcpy(&arg_steamIDRemote, arg + 0u, 8);
      static uint8_t g_bd_flat_SteamNetworking006_SendP2PPacket_pubData_buf[61440];
      uint32_t arg_pubData_len = 0;
      if (argLen < (0u + 8) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pubData_len, arg + (0u + 8), 4);
      if (arg_pubData_len > 61440) { gl_net_evidence(1, GL_NET_KIND_OVERSIZE, GL_NET_IFACE_NETWORKING, 0, arg_pubData_len, GL_NET_PATH_UNKNOWN); *respLen = 0; return 1; } // oversize refusal is NET evidence -- 58-10
      if (arg_pubData_len > 61440 || (uint64_t)argLen < (uint64_t)((0u + 8)) + 4u + arg_pubData_len) { *respLen = 0; return 1; } // in-buffer past cap or argLen -- T-58-16
      memcpy(g_bd_flat_SteamNetworking006_SendP2PPacket_pubData_buf, arg + (0u + 8) + 4, arg_pubData_len);
      const void *arg_pubData = g_bd_flat_SteamNetworking006_SendP2PPacket_pubData_buf;
      if (argLen < ((0u + 8) + 4 + arg_pubData_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_cubData; memcpy(&arg_cubData, arg + ((0u + 8) + 4 + arg_pubData_len), 4);
      if (argLen < (((0u + 8) + 4 + arg_pubData_len) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_eP2PSendType; memcpy(&arg_eP2PSendType, arg + (((0u + 8) + 4 + arg_pubData_len) + 4), 4);
      if (argLen < ((((0u + 8) + 4 + arg_pubData_len) + 4) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_nChannel; memcpy(&arg_nChannel, arg + ((((0u + 8) + 4 + arg_pubData_len) + 4) + 4), 4);
      if ((int64_t)arg_cubData != (int64_t)arg_pubData_len) { *respLen = 0; return 1; } // lenParam must equal the bytes sent -- T-58-16
      int __ret = g_bd_flat_SteamNetworking006_SendP2PPacket(g_bd_self_steamnetworking006, arg_steamIDRemote, arg_pubData, arg_cubData, arg_eP2PSendType, arg_nChannel);
      if (__ret) gl_net_evidence(1, GL_NET_KIND_SEND, GL_NET_IFACE_NETWORKING, 0, arg_pubData_len, GL_NET_PATH_UNKNOWN);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)23) << 16 | 1u): { // SteamNetworking006.IsP2PPacketAvailable
      if (g_bd_flat_SteamNetworking006_IsP2PPacketAvailable == NULL || g_bd_self_steamnetworking006 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t arg_pcubMsgSize = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_nChannel; memcpy(&arg_nChannel, arg + 0u, 4);
      int __ret = g_bd_flat_SteamNetworking006_IsP2PPacketAvailable(g_bd_self_steamnetworking006, &arg_pcubMsgSize, arg_nChannel);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pcubMsgSize, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)23) << 16 | 2u): { // SteamNetworking006.ReadP2PPacket
      if (g_bd_flat_SteamNetworking006_ReadP2PPacket == NULL || g_bd_self_steamnetworking006 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_read_p2p_packet
        if (gl_net_read_p2p_packet(g_bd_self_steamnetworking006, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)23) << 16 | 3u): { // SteamNetworking006.AcceptP2PSessionWithUser
      if (g_bd_flat_SteamNetworking006_AcceptP2PSessionWithUser == NULL || g_bd_self_steamnetworking006 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDRemote; memcpy(&arg_steamIDRemote, arg + 0u, 8);
      int __ret = g_bd_flat_SteamNetworking006_AcceptP2PSessionWithUser(g_bd_self_steamnetworking006, arg_steamIDRemote);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)23) << 16 | 4u): { // SteamNetworking006.CloseP2PSessionWithUser
      if (g_bd_flat_SteamNetworking006_CloseP2PSessionWithUser == NULL || g_bd_self_steamnetworking006 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDRemote; memcpy(&arg_steamIDRemote, arg + 0u, 8);
      int __ret = g_bd_flat_SteamNetworking006_CloseP2PSessionWithUser(g_bd_self_steamnetworking006, arg_steamIDRemote);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)23) << 16 | 5u): { // SteamNetworking006.CloseP2PChannelWithUser
      if (g_bd_flat_SteamNetworking006_CloseP2PChannelWithUser == NULL || g_bd_self_steamnetworking006 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDRemote; memcpy(&arg_steamIDRemote, arg + 0u, 8);
      if (argLen < (0u + 8) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_nChannel; memcpy(&arg_nChannel, arg + (0u + 8), 4);
      int __ret = g_bd_flat_SteamNetworking006_CloseP2PChannelWithUser(g_bd_self_steamnetworking006, arg_steamIDRemote, arg_nChannel);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)23) << 16 | 6u): { // SteamNetworking006.GetP2PSessionState
      if (g_bd_flat_SteamNetworking006_GetP2PSessionState == NULL || g_bd_self_steamnetworking006 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_get_p2p_session_state
        if (gl_net_get_p2p_session_state(g_bd_self_steamnetworking006, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)23) << 16 | 7u): { // SteamNetworking006.AllowP2PPacketRelay
      if (g_bd_flat_SteamNetworking006_AllowP2PPacketRelay == NULL || g_bd_self_steamnetworking006 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int arg_bAllow; memcpy(&arg_bAllow, arg + 0u, 4);
      int __ret = g_bd_flat_SteamNetworking006_AllowP2PPacketRelay(g_bd_self_steamnetworking006, arg_bAllow);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)23) << 16 | 9u): { // SteamNetworking006.CreateP2PConnectionSocket
      if (g_bd_flat_SteamNetworking006_CreateP2PConnectionSocket == NULL || g_bd_self_steamnetworking006 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDTarget; memcpy(&arg_steamIDTarget, arg + 0u, 8);
      if (argLen < (0u + 8) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_nVirtualPort; memcpy(&arg_nVirtualPort, arg + (0u + 8), 4);
      if (argLen < ((0u + 8) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_nTimeoutSec; memcpy(&arg_nTimeoutSec, arg + ((0u + 8) + 4), 4);
      if (argLen < (((0u + 8) + 4) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int arg_bAllowUseOfPacketRelay; memcpy(&arg_bAllowUseOfPacketRelay, arg + (((0u + 8) + 4) + 4), 4);
      uint32_t __ret = g_bd_flat_SteamNetworking006_CreateP2PConnectionSocket(g_bd_self_steamnetworking006, arg_steamIDTarget, arg_nVirtualPort, arg_nTimeoutSec, arg_bAllowUseOfPacketRelay);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)23) << 16 | 11u): { // SteamNetworking006.DestroySocket
      if (g_bd_flat_SteamNetworking006_DestroySocket == NULL || g_bd_self_steamnetworking006 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hSocket; memcpy(&arg_hSocket, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int arg_bNotifyRemoteEnd; memcpy(&arg_bNotifyRemoteEnd, arg + (0u + 4), 4);
      int __ret = g_bd_flat_SteamNetworking006_DestroySocket(g_bd_self_steamnetworking006, arg_hSocket, arg_bNotifyRemoteEnd);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)23) << 16 | 12u): { // SteamNetworking006.DestroyListenSocket
      if (g_bd_flat_SteamNetworking006_DestroyListenSocket == NULL || g_bd_self_steamnetworking006 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hSocket; memcpy(&arg_hSocket, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int arg_bNotifyRemoteEnd; memcpy(&arg_bNotifyRemoteEnd, arg + (0u + 4), 4);
      int __ret = g_bd_flat_SteamNetworking006_DestroyListenSocket(g_bd_self_steamnetworking006, arg_hSocket, arg_bNotifyRemoteEnd);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)23) << 16 | 13u): { // SteamNetworking006.SendDataOnSocket
      if (g_bd_flat_SteamNetworking006_SendDataOnSocket == NULL || g_bd_self_steamnetworking006 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hSocket; memcpy(&arg_hSocket, arg + 0u, 4);
      static uint8_t g_bd_flat_SteamNetworking006_SendDataOnSocket_pubData_buf[61440];
      uint32_t arg_pubData_len = 0;
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pubData_len, arg + (0u + 4), 4);
      if (arg_pubData_len > 61440) { gl_net_evidence(1, GL_NET_KIND_OVERSIZE, GL_NET_IFACE_NETWORKING, 0, arg_pubData_len, GL_NET_PATH_UNKNOWN); *respLen = 0; return 1; } // oversize refusal is NET evidence -- 58-10
      if (arg_pubData_len > 61440 || (uint64_t)argLen < (uint64_t)((0u + 4)) + 4u + arg_pubData_len) { *respLen = 0; return 1; } // in-buffer past cap or argLen -- T-58-16
      memcpy(g_bd_flat_SteamNetworking006_SendDataOnSocket_pubData_buf, arg + (0u + 4) + 4, arg_pubData_len);
      const void *arg_pubData = g_bd_flat_SteamNetworking006_SendDataOnSocket_pubData_buf;
      if (argLen < ((0u + 4) + 4 + arg_pubData_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_cubData; memcpy(&arg_cubData, arg + ((0u + 4) + 4 + arg_pubData_len), 4);
      if (argLen < (((0u + 4) + 4 + arg_pubData_len) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int arg_bReliable; memcpy(&arg_bReliable, arg + (((0u + 4) + 4 + arg_pubData_len) + 4), 4);
      if ((int64_t)arg_cubData != (int64_t)arg_pubData_len) { *respLen = 0; return 1; } // lenParam must equal the bytes sent -- T-58-16
      int __ret = g_bd_flat_SteamNetworking006_SendDataOnSocket(g_bd_self_steamnetworking006, arg_hSocket, arg_pubData, arg_cubData, arg_bReliable);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)23) << 16 | 14u): { // SteamNetworking006.IsDataAvailableOnSocket
      if (g_bd_flat_SteamNetworking006_IsDataAvailableOnSocket == NULL || g_bd_self_steamnetworking006 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hSocket; memcpy(&arg_hSocket, arg + 0u, 4);
      uint32_t arg_pcubMsgSize = 0;
      int __ret = g_bd_flat_SteamNetworking006_IsDataAvailableOnSocket(g_bd_self_steamnetworking006, arg_hSocket, &arg_pcubMsgSize);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pcubMsgSize, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)23) << 16 | 15u): { // SteamNetworking006.RetrieveDataFromSocket
      if (g_bd_flat_SteamNetworking006_RetrieveDataFromSocket == NULL || g_bd_self_steamnetworking006 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hSocket; memcpy(&arg_hSocket, arg + 0u, 4);
      static uint8_t g_bd_flat_SteamNetworking006_RetrieveDataFromSocket_pubDest_buf[61440];
      uint32_t cap_pubDest = 0;
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&cap_pubDest, arg + (0u + 4), 4);
      if (cap_pubDest > 61440) cap_pubDest = 61440;
      if (respCap < 12) { *respLen = 0; return 1; }
      if (cap_pubDest > respCap - 12) cap_pubDest = (uint32_t)(respCap - 12); // response must fit the scratch
      memset(g_bd_flat_SteamNetworking006_RetrieveDataFromSocket_pubDest_buf, 0, cap_pubDest); // no earlier call's bytes cross into the game (53-17 WR-04)
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_cubDest; memcpy(&arg_cubDest, arg + ((0u + 4) + 4), 4);
      uint32_t arg_pcubMsgSize = 0;
      if ((int64_t)arg_cubDest < 0 || (int64_t)arg_cubDest > (int64_t)cap_pubDest) arg_cubDest = (uint32_t)cap_pubDest;
      int __ret = g_bd_flat_SteamNetworking006_RetrieveDataFromSocket(g_bd_self_steamnetworking006, arg_hSocket, g_bd_flat_SteamNetworking006_RetrieveDataFromSocket_pubDest_buf, arg_cubDest, &arg_pcubMsgSize);
      if (respCap < 12) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pcubMsgSize, 4);
      uint32_t outLen_pubDest = cap_pubDest;
      memcpy(resp + 8, &outLen_pubDest, 4);
      memcpy(resp + 8 + 4, g_bd_flat_SteamNetworking006_RetrieveDataFromSocket_pubDest_buf, outLen_pubDest);
      *respLen = 8 + 4 + outLen_pubDest;
      return 0;
    }
    case (((uint32_t)23) << 16 | 16u): { // SteamNetworking006.IsDataAvailable
      if (g_bd_flat_SteamNetworking006_IsDataAvailable == NULL || g_bd_self_steamnetworking006 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hListenSocket; memcpy(&arg_hListenSocket, arg + 0u, 4);
      uint32_t arg_pcubMsgSize = 0;
      uint32_t arg_phSocket = 0;
      int __ret = g_bd_flat_SteamNetworking006_IsDataAvailable(g_bd_self_steamnetworking006, arg_hListenSocket, &arg_pcubMsgSize, &arg_phSocket);
      if (respCap < 12) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pcubMsgSize, 4);
      memcpy(resp + 8, &arg_phSocket, 4);
      *respLen = 12;
      return 0;
    }
    case (((uint32_t)23) << 16 | 17u): { // SteamNetworking006.RetrieveData
      if (g_bd_flat_SteamNetworking006_RetrieveData == NULL || g_bd_self_steamnetworking006 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hListenSocket; memcpy(&arg_hListenSocket, arg + 0u, 4);
      static uint8_t g_bd_flat_SteamNetworking006_RetrieveData_pubDest_buf[61440];
      uint32_t cap_pubDest = 0;
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&cap_pubDest, arg + (0u + 4), 4);
      if (cap_pubDest > 61440) cap_pubDest = 61440;
      if (respCap < 16) { *respLen = 0; return 1; }
      if (cap_pubDest > respCap - 16) cap_pubDest = (uint32_t)(respCap - 16); // response must fit the scratch
      memset(g_bd_flat_SteamNetworking006_RetrieveData_pubDest_buf, 0, cap_pubDest); // no earlier call's bytes cross into the game (53-17 WR-04)
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_cubDest; memcpy(&arg_cubDest, arg + ((0u + 4) + 4), 4);
      uint32_t arg_pcubMsgSize = 0;
      uint32_t arg_phSocket = 0;
      if ((int64_t)arg_cubDest < 0 || (int64_t)arg_cubDest > (int64_t)cap_pubDest) arg_cubDest = (uint32_t)cap_pubDest;
      int __ret = g_bd_flat_SteamNetworking006_RetrieveData(g_bd_self_steamnetworking006, arg_hListenSocket, g_bd_flat_SteamNetworking006_RetrieveData_pubDest_buf, arg_cubDest, &arg_pcubMsgSize, &arg_phSocket);
      if (respCap < 16) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pcubMsgSize, 4);
      memcpy(resp + 8, &arg_phSocket, 4);
      uint32_t outLen_pubDest = cap_pubDest;
      memcpy(resp + 12, &outLen_pubDest, 4);
      memcpy(resp + 12 + 4, g_bd_flat_SteamNetworking006_RetrieveData_pubDest_buf, outLen_pubDest);
      *respLen = 12 + 4 + outLen_pubDest;
      return 0;
    }
    case (((uint32_t)23) << 16 | 20u): { // SteamNetworking006.GetSocketConnectionType
      if (g_bd_flat_SteamNetworking006_GetSocketConnectionType == NULL || g_bd_self_steamnetworking006 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hSocket; memcpy(&arg_hSocket, arg + 0u, 4);
      uint32_t __ret = g_bd_flat_SteamNetworking006_GetSocketConnectionType(g_bd_self_steamnetworking006, arg_hSocket);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)23) << 16 | 21u): { // SteamNetworking006.GetMaxPacketSize
      if (g_bd_flat_SteamNetworking006_GetMaxPacketSize == NULL || g_bd_self_steamnetworking006 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hSocket; memcpy(&arg_hSocket, arg + 0u, 4);
      int32_t __ret = g_bd_flat_SteamNetworking006_GetMaxPacketSize(g_bd_self_steamnetworking006, arg_hSocket);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 0u): { // SteamClient020.CreateSteamPipe
      if (g_bd_flat_SteamClient020_CreateSteamPipe == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.CreateSteamPipe unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_SteamClient020_CreateSteamPipe(g_bd_self_steamclient020);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.CreateSteamPipe -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 1u): { // SteamClient020.BReleaseSteamPipe
      if (g_bd_flat_SteamClient020_BReleaseSteamPipe == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.BReleaseSteamPipe unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      int __ret = g_bd_flat_SteamClient020_BReleaseSteamPipe(g_bd_self_steamclient020, arg_hSteamPipe);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.BReleaseSteamPipe -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 2u): { // SteamClient020.ConnectToGlobalUser
      if (g_bd_flat_SteamClient020_ConnectToGlobalUser == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.ConnectToGlobalUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      int32_t __ret = g_bd_flat_SteamClient020_ConnectToGlobalUser(g_bd_self_steamclient020, arg_hSteamPipe);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.ConnectToGlobalUser -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 3u): { // SteamClient020.CreateLocalUser
      if (g_bd_flat_SteamClient020_CreateLocalUser == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.CreateLocalUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t arg_phSteamPipe = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_eAccountType; memcpy(&arg_eAccountType, arg + 0u, 4);
      int32_t __ret = g_bd_flat_SteamClient020_CreateLocalUser(g_bd_self_steamclient020, &arg_phSteamPipe, arg_eAccountType);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.CreateLocalUser -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_phSteamPipe, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)25) << 16 | 4u): { // SteamClient020.ReleaseUser
      if (g_bd_flat_SteamClient020_ReleaseUser == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.ReleaseUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hUser; memcpy(&arg_hUser, arg + (0u + 4), 4);
      g_bd_flat_SteamClient020_ReleaseUser(g_bd_self_steamclient020, arg_hSteamPipe, arg_hUser);
      logts("FWD", "SteamClient020.ReleaseUser " "called");
      *respLen = 0; return 0;
    }
    case (((uint32_t)25) << 16 | 5u): { // SteamClient020.GetISteamUser
      if (g_bd_flat_SteamClient020_GetISteamUser == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamUser_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamUser_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamUser_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamUser_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamUser(g_bd_self_steamclient020, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamUser ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 6u): { // SteamClient020.GetISteamGameServer
      if (g_bd_flat_SteamClient020_GetISteamGameServer == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamGameServer unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamGameServer_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamGameServer_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamGameServer_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamGameServer_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamGameServer(g_bd_self_steamclient020, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamGameServer ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 8u): { // SteamClient020.GetISteamFriends
      if (g_bd_flat_SteamClient020_GetISteamFriends == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamFriends unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamFriends_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamFriends_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamFriends_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamFriends_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamFriends(g_bd_self_steamclient020, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamFriends ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 9u): { // SteamClient020.GetISteamUtils
      if (g_bd_flat_SteamClient020_GetISteamUtils == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamUtils unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      static char g_bd_flat_SteamClient020_GetISteamUtils_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + (0u + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < (0u + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamUtils_pchVersion_buf, arg + (0u + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamUtils_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamUtils_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamUtils(g_bd_self_steamclient020, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamUtils ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 10u): { // SteamClient020.GetISteamMatchmaking
      if (g_bd_flat_SteamClient020_GetISteamMatchmaking == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamMatchmaking unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamMatchmaking_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamMatchmaking_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamMatchmaking_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamMatchmaking_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamMatchmaking(g_bd_self_steamclient020, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamMatchmaking ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 11u): { // SteamClient020.GetISteamMatchmakingServers
      if (g_bd_flat_SteamClient020_GetISteamMatchmakingServers == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamMatchmakingServers unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamMatchmakingServers_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamMatchmakingServers_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamMatchmakingServers_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamMatchmakingServers_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamMatchmakingServers(g_bd_self_steamclient020, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamMatchmakingServers ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 12u): { // SteamClient020.GetISteamGenericInterface
      if (g_bd_flat_SteamClient020_GetISteamGenericInterface == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamGenericInterface unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamGenericInterface_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamGenericInterface_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamGenericInterface_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamGenericInterface_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamGenericInterface(g_bd_self_steamclient020, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamGenericInterface ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 13u): { // SteamClient020.GetISteamUserStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too
      if (g_bd_flat_SteamClient020_GetISteamUserStats == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamUserStats unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamUserStats_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamUserStats_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamUserStats_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamUserStats_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamUserStats(g_bd_self_steamclient020, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamUserStats ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 14u): { // SteamClient020.GetISteamGameServerStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too
      if (g_bd_flat_SteamClient020_GetISteamGameServerStats == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamGameServerStats unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamGameServerStats_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamGameServerStats_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamGameServerStats_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamGameServerStats_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamGameServerStats(g_bd_self_steamclient020, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamGameServerStats ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 15u): { // SteamClient020.GetISteamApps
      if (g_bd_flat_SteamClient020_GetISteamApps == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamApps unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamApps_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamApps_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamApps_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamApps_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamApps(g_bd_self_steamclient020, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamApps ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 16u): { // SteamClient020.GetISteamNetworking
      if (g_bd_flat_SteamClient020_GetISteamNetworking == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamNetworking unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamNetworking_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamNetworking_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamNetworking_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamNetworking_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamNetworking(g_bd_self_steamclient020, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamNetworking ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 17u): { // SteamClient020.GetISteamRemoteStorage
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too
      if (g_bd_flat_SteamClient020_GetISteamRemoteStorage == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamRemoteStorage unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamRemoteStorage_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamRemoteStorage_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamRemoteStorage_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamRemoteStorage_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamRemoteStorage(g_bd_self_steamclient020, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamRemoteStorage ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 18u): { // SteamClient020.GetISteamScreenshots
      if (g_bd_flat_SteamClient020_GetISteamScreenshots == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamScreenshots unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamScreenshots_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamScreenshots_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamScreenshots_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamScreenshots_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamScreenshots(g_bd_self_steamclient020, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamScreenshots ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 20u): { // SteamClient020.RunFrame
      if (g_bd_flat_SteamClient020_RunFrame == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.RunFrame unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      g_bd_flat_SteamClient020_RunFrame(g_bd_self_steamclient020);
      logts("FWD", "SteamClient020.RunFrame " "called");
      *respLen = 0; return 0;
    }
    case (((uint32_t)25) << 16 | 21u): { // SteamClient020.GetIPCCallCount
      if (g_bd_flat_SteamClient020_GetIPCCallCount == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetIPCCallCount unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamClient020_GetIPCCallCount(g_bd_self_steamclient020);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetIPCCallCount -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 23u): { // SteamClient020.BShutdownIfAllPipesClosed
      if (g_bd_flat_SteamClient020_BShutdownIfAllPipesClosed == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.BShutdownIfAllPipesClosed unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamClient020_BShutdownIfAllPipesClosed(g_bd_self_steamclient020);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.BShutdownIfAllPipesClosed -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 24u): { // SteamClient020.GetISteamHTTP
      if (g_bd_flat_SteamClient020_GetISteamHTTP == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamHTTP unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamHTTP_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamHTTP_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamHTTP_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamHTTP_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamHTTP(g_bd_self_steamclient020, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamHTTP ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 25u): { // SteamClient020.DEPRECATED_GetISteamUnifiedMessages
      if (g_bd_flat_SteamClient020_DEPRECATED_GetISteamUnifiedMessages == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.DEPRECATED_GetISteamUnifiedMessages unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_DEPRECATED_GetISteamUnifiedMessages_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_DEPRECATED_GetISteamUnifiedMessages_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_DEPRECATED_GetISteamUnifiedMessages_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_DEPRECATED_GetISteamUnifiedMessages_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_DEPRECATED_GetISteamUnifiedMessages(g_bd_self_steamclient020, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.DEPRECATED_GetISteamUnifiedMessages ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 26u): { // SteamClient020.GetISteamController
      if (g_bd_flat_SteamClient020_GetISteamController == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamController unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamController_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamController_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamController_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamController_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamController(g_bd_self_steamclient020, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamController ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 27u): { // SteamClient020.GetISteamUGC
      if (g_bd_flat_SteamClient020_GetISteamUGC == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamUGC unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamUGC_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamUGC_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamUGC_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamUGC_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamUGC(g_bd_self_steamclient020, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamUGC ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 28u): { // SteamClient020.GetISteamAppList
      if (g_bd_flat_SteamClient020_GetISteamAppList == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamAppList unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamAppList_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamAppList_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamAppList_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamAppList_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamAppList(g_bd_self_steamclient020, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamAppList ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 29u): { // SteamClient020.GetISteamMusic
      if (g_bd_flat_SteamClient020_GetISteamMusic == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamMusic unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamMusic_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamMusic_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamMusic_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamMusic_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamMusic(g_bd_self_steamclient020, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamMusic ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 30u): { // SteamClient020.GetISteamMusicRemote
      if (g_bd_flat_SteamClient020_GetISteamMusicRemote == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamMusicRemote unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamMusicRemote_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamMusicRemote_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamMusicRemote_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamMusicRemote_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamMusicRemote(g_bd_self_steamclient020, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamMusicRemote ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 31u): { // SteamClient020.GetISteamHTMLSurface
      if (g_bd_flat_SteamClient020_GetISteamHTMLSurface == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamHTMLSurface unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamHTMLSurface_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamHTMLSurface_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamHTMLSurface_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamHTMLSurface_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamHTMLSurface(g_bd_self_steamclient020, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamHTMLSurface ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 35u): { // SteamClient020.GetISteamInventory
      if (g_bd_flat_SteamClient020_GetISteamInventory == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamInventory unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamInventory_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamInventory_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamInventory_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamInventory_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamInventory(g_bd_self_steamclient020, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamInventory ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 36u): { // SteamClient020.GetISteamVideo
      if (g_bd_flat_SteamClient020_GetISteamVideo == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamVideo unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamVideo_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamVideo_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamVideo_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamVideo_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamVideo(g_bd_self_steamclient020, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamVideo ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 37u): { // SteamClient020.GetISteamParentalSettings
      if (g_bd_flat_SteamClient020_GetISteamParentalSettings == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamParentalSettings unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamParentalSettings_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamParentalSettings_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamParentalSettings_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamParentalSettings_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamParentalSettings(g_bd_self_steamclient020, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamParentalSettings ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 0u): { // SteamClient021.CreateSteamPipe
      if (g_bd_flat_SteamClient021_CreateSteamPipe == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.CreateSteamPipe unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_SteamClient021_CreateSteamPipe(g_bd_self_steamclient021);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.CreateSteamPipe -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 1u): { // SteamClient021.BReleaseSteamPipe
      if (g_bd_flat_SteamClient021_BReleaseSteamPipe == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.BReleaseSteamPipe unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      int __ret = g_bd_flat_SteamClient021_BReleaseSteamPipe(g_bd_self_steamclient021, arg_hSteamPipe);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.BReleaseSteamPipe -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 2u): { // SteamClient021.ConnectToGlobalUser
      if (g_bd_flat_SteamClient021_ConnectToGlobalUser == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.ConnectToGlobalUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      int32_t __ret = g_bd_flat_SteamClient021_ConnectToGlobalUser(g_bd_self_steamclient021, arg_hSteamPipe);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.ConnectToGlobalUser -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 3u): { // SteamClient021.CreateLocalUser
      if (g_bd_flat_SteamClient021_CreateLocalUser == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.CreateLocalUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t arg_phSteamPipe = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_eAccountType; memcpy(&arg_eAccountType, arg + 0u, 4);
      int32_t __ret = g_bd_flat_SteamClient021_CreateLocalUser(g_bd_self_steamclient021, &arg_phSteamPipe, arg_eAccountType);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.CreateLocalUser -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_phSteamPipe, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)26) << 16 | 4u): { // SteamClient021.ReleaseUser
      if (g_bd_flat_SteamClient021_ReleaseUser == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.ReleaseUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hUser; memcpy(&arg_hUser, arg + (0u + 4), 4);
      g_bd_flat_SteamClient021_ReleaseUser(g_bd_self_steamclient021, arg_hSteamPipe, arg_hUser);
      logts("FWD", "SteamClient021.ReleaseUser " "called");
      *respLen = 0; return 0;
    }
    case (((uint32_t)26) << 16 | 5u): { // SteamClient021.GetISteamUser
      if (g_bd_flat_SteamClient021_GetISteamUser == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamUser_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamUser_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamUser_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamUser_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamUser(g_bd_self_steamclient021, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamUser ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 6u): { // SteamClient021.GetISteamGameServer
      if (g_bd_flat_SteamClient021_GetISteamGameServer == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamGameServer unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamGameServer_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamGameServer_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamGameServer_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamGameServer_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamGameServer(g_bd_self_steamclient021, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamGameServer ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 8u): { // SteamClient021.GetISteamFriends
      if (g_bd_flat_SteamClient021_GetISteamFriends == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamFriends unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamFriends_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamFriends_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamFriends_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamFriends_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamFriends(g_bd_self_steamclient021, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamFriends ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 9u): { // SteamClient021.GetISteamUtils
      if (g_bd_flat_SteamClient021_GetISteamUtils == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamUtils unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      static char g_bd_flat_SteamClient021_GetISteamUtils_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + (0u + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < (0u + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamUtils_pchVersion_buf, arg + (0u + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamUtils_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamUtils_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamUtils(g_bd_self_steamclient021, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamUtils ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 10u): { // SteamClient021.GetISteamMatchmaking
      if (g_bd_flat_SteamClient021_GetISteamMatchmaking == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamMatchmaking unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamMatchmaking_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamMatchmaking_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamMatchmaking_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamMatchmaking_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamMatchmaking(g_bd_self_steamclient021, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamMatchmaking ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 11u): { // SteamClient021.GetISteamMatchmakingServers
      if (g_bd_flat_SteamClient021_GetISteamMatchmakingServers == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamMatchmakingServers unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamMatchmakingServers_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamMatchmakingServers_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamMatchmakingServers_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamMatchmakingServers_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamMatchmakingServers(g_bd_self_steamclient021, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamMatchmakingServers ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 12u): { // SteamClient021.GetISteamGenericInterface
      if (g_bd_flat_SteamClient021_GetISteamGenericInterface == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamGenericInterface unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamGenericInterface_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamGenericInterface_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamGenericInterface_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamGenericInterface_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamGenericInterface(g_bd_self_steamclient021, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamGenericInterface ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 13u): { // SteamClient021.GetISteamUserStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too
      if (g_bd_flat_SteamClient021_GetISteamUserStats == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamUserStats unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamUserStats_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamUserStats_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamUserStats_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamUserStats_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamUserStats(g_bd_self_steamclient021, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamUserStats ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 14u): { // SteamClient021.GetISteamGameServerStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too
      if (g_bd_flat_SteamClient021_GetISteamGameServerStats == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamGameServerStats unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamGameServerStats_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamGameServerStats_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamGameServerStats_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamGameServerStats_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamGameServerStats(g_bd_self_steamclient021, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamGameServerStats ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 15u): { // SteamClient021.GetISteamApps
      if (g_bd_flat_SteamClient021_GetISteamApps == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamApps unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamApps_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamApps_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamApps_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamApps_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamApps(g_bd_self_steamclient021, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamApps ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 16u): { // SteamClient021.GetISteamNetworking
      if (g_bd_flat_SteamClient021_GetISteamNetworking == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamNetworking unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamNetworking_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamNetworking_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamNetworking_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamNetworking_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamNetworking(g_bd_self_steamclient021, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamNetworking ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 17u): { // SteamClient021.GetISteamRemoteStorage
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too
      if (g_bd_flat_SteamClient021_GetISteamRemoteStorage == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamRemoteStorage unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamRemoteStorage_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamRemoteStorage_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamRemoteStorage_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamRemoteStorage_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamRemoteStorage(g_bd_self_steamclient021, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamRemoteStorage ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 18u): { // SteamClient021.GetISteamScreenshots
      if (g_bd_flat_SteamClient021_GetISteamScreenshots == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamScreenshots unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamScreenshots_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamScreenshots_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamScreenshots_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamScreenshots_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamScreenshots(g_bd_self_steamclient021, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamScreenshots ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 20u): { // SteamClient021.RunFrame
      if (g_bd_flat_SteamClient021_RunFrame == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.RunFrame unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      g_bd_flat_SteamClient021_RunFrame(g_bd_self_steamclient021);
      logts("FWD", "SteamClient021.RunFrame " "called");
      *respLen = 0; return 0;
    }
    case (((uint32_t)26) << 16 | 21u): { // SteamClient021.GetIPCCallCount
      if (g_bd_flat_SteamClient021_GetIPCCallCount == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetIPCCallCount unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamClient021_GetIPCCallCount(g_bd_self_steamclient021);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetIPCCallCount -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 23u): { // SteamClient021.BShutdownIfAllPipesClosed
      if (g_bd_flat_SteamClient021_BShutdownIfAllPipesClosed == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.BShutdownIfAllPipesClosed unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamClient021_BShutdownIfAllPipesClosed(g_bd_self_steamclient021);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.BShutdownIfAllPipesClosed -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 24u): { // SteamClient021.GetISteamHTTP
      if (g_bd_flat_SteamClient021_GetISteamHTTP == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamHTTP unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamHTTP_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamHTTP_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamHTTP_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamHTTP_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamHTTP(g_bd_self_steamclient021, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamHTTP ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 25u): { // SteamClient021.GetISteamController
      if (g_bd_flat_SteamClient021_GetISteamController == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamController unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamController_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamController_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamController_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamController_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamController(g_bd_self_steamclient021, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamController ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 26u): { // SteamClient021.GetISteamUGC
      if (g_bd_flat_SteamClient021_GetISteamUGC == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamUGC unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamUGC_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamUGC_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamUGC_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamUGC_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamUGC(g_bd_self_steamclient021, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamUGC ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 27u): { // SteamClient021.GetISteamMusic
      if (g_bd_flat_SteamClient021_GetISteamMusic == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamMusic unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamMusic_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamMusic_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamMusic_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamMusic_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamMusic(g_bd_self_steamclient021, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamMusic ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 28u): { // SteamClient021.GetISteamMusicRemote
      if (g_bd_flat_SteamClient021_GetISteamMusicRemote == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamMusicRemote unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamMusicRemote_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamMusicRemote_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamMusicRemote_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamMusicRemote_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamMusicRemote(g_bd_self_steamclient021, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamMusicRemote ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 29u): { // SteamClient021.GetISteamHTMLSurface
      if (g_bd_flat_SteamClient021_GetISteamHTMLSurface == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamHTMLSurface unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamHTMLSurface_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamHTMLSurface_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamHTMLSurface_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamHTMLSurface_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamHTMLSurface(g_bd_self_steamclient021, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamHTMLSurface ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 33u): { // SteamClient021.GetISteamInventory
      if (g_bd_flat_SteamClient021_GetISteamInventory == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamInventory unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamInventory_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamInventory_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamInventory_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamInventory_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamInventory(g_bd_self_steamclient021, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamInventory ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 34u): { // SteamClient021.GetISteamVideo
      if (g_bd_flat_SteamClient021_GetISteamVideo == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamVideo unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamVideo_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamVideo_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamVideo_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamVideo_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamVideo(g_bd_self_steamclient021, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamVideo ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 35u): { // SteamClient021.GetISteamParentalSettings
      if (g_bd_flat_SteamClient021_GetISteamParentalSettings == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamParentalSettings unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamParentalSettings_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamParentalSettings_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamParentalSettings_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamParentalSettings_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamParentalSettings(g_bd_self_steamclient021, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamParentalSettings ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)27) << 16 | 0u): { // SteamUser021.GetHSteamUser
      if (g_bd_flat_SteamUser021_GetHSteamUser == NULL || g_bd_self_steamuser021 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_SteamUser021_GetHSteamUser(g_bd_self_steamuser021);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)27) << 16 | 1u): { // SteamUser021.BLoggedOn
      if (g_bd_flat_SteamUser021_BLoggedOn == NULL || g_bd_self_steamuser021 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUser021_BLoggedOn(g_bd_self_steamuser021);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)27) << 16 | 2u): { // SteamUser021.GetSteamID
      if (g_bd_flat_SteamUser021_GetSteamID == NULL || g_bd_self_steamuser021 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint64_t __ret = g_bd_flat_SteamUser021_GetSteamID(g_bd_self_steamuser021);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 8);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)27) << 16 | 13u): { // SteamUser021.GetAuthSessionTicket
      if (g_bd_flat_SteamUser021_GetAuthSessionTicket == NULL || g_bd_self_steamuser021 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static uint8_t g_bd_flat_SteamUser021_GetAuthSessionTicket_pTicket_buf[BD_WIRE_OUT_BUFFER_MAX_BYTES];
      uint32_t cap_pTicket = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&cap_pTicket, arg + 0u, 4);
      if (cap_pTicket > BD_WIRE_OUT_BUFFER_MAX_BYTES) cap_pTicket = BD_WIRE_OUT_BUFFER_MAX_BYTES;
      if (respCap < 12) { *respLen = 0; return 1; }
      if (cap_pTicket > respCap - 12) cap_pTicket = (uint32_t)(respCap - 12); // response must fit the scratch
      memset(g_bd_flat_SteamUser021_GetAuthSessionTicket_pTicket_buf, 0, cap_pTicket); // no earlier call's bytes cross into the game (53-17 WR-04)
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_cbMaxTicket; memcpy(&arg_cbMaxTicket, arg + (0u + 4), 4);
      uint32_t arg_pcbTicket = 0;
      if ((int64_t)arg_cbMaxTicket < 0 || (int64_t)arg_cbMaxTicket > (int64_t)cap_pTicket) arg_cbMaxTicket = (int32_t)cap_pTicket;
      uint32_t __ret = g_bd_flat_SteamUser021_GetAuthSessionTicket(g_bd_self_steamuser021, g_bd_flat_SteamUser021_GetAuthSessionTicket_pTicket_buf, arg_cbMaxTicket, &arg_pcbTicket, NULL);
      if (respCap < 12) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pcbTicket, 4);
      uint32_t outLen_pTicket = cap_pTicket;
      if ((uint32_t)arg_pcbTicket < outLen_pTicket) outLen_pTicket = (uint32_t)arg_pcbTicket;
      memcpy(resp + 8, &outLen_pTicket, 4);
      memcpy(resp + 8 + 4, g_bd_flat_SteamUser021_GetAuthSessionTicket_pTicket_buf, outLen_pTicket);
      *respLen = 8 + 4 + outLen_pTicket;
      return 0;
    }
    case (((uint32_t)27) << 16 | 16u): { // SteamUser021.CancelAuthTicket
      if (g_bd_flat_SteamUser021_CancelAuthTicket == NULL || g_bd_self_steamuser021 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hAuthTicket; memcpy(&arg_hAuthTicket, arg + 0u, 4);
      g_bd_flat_SteamUser021_CancelAuthTicket(g_bd_self_steamuser021, arg_hAuthTicket);
      *respLen = 0; return 0;
    }
    case (((uint32_t)28) << 16 | 0u): { // SteamFriends017.GetPersonaName
      if (g_bd_flat_SteamFriends017_GetPersonaName == NULL || g_bd_self_steamfriends017 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamFriends017_GetPersonaName(g_bd_self_steamfriends017);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)28) << 16 | 2u): { // SteamFriends017.GetPersonaState
      if (g_bd_flat_SteamFriends017_GetPersonaState == NULL || g_bd_self_steamfriends017 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamFriends017_GetPersonaState(g_bd_self_steamfriends017);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)28) << 16 | 7u): { // SteamFriends017.GetFriendPersonaName
      if (g_bd_flat_SteamFriends017_GetFriendPersonaName == NULL || g_bd_self_steamfriends017 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_steamIDFriend; memcpy(&arg_steamIDFriend, arg + 0u, 8);
      const char *result = g_bd_flat_SteamFriends017_GetFriendPersonaName(g_bd_self_steamfriends017, arg_steamIDFriend);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)28) << 16 | 33u): { // SteamFriends017.ActivateGameOverlayInviteDialog
      if (g_bd_flat_SteamFriends017_ActivateGameOverlayInviteDialog == NULL || g_bd_self_steamfriends017 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_friends_invite_dialog
        if (gl_friends_invite_dialog(g_bd_self_steamfriends017, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)29) << 16 | 0u): { // SteamUtils010.GetSecondsSinceAppActive
      if (g_bd_flat_SteamUtils010_GetSecondsSinceAppActive == NULL || g_bd_self_steamutils010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils010_GetSecondsSinceAppActive(g_bd_self_steamutils010);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)29) << 16 | 1u): { // SteamUtils010.GetSecondsSinceComputerActive
      if (g_bd_flat_SteamUtils010_GetSecondsSinceComputerActive == NULL || g_bd_self_steamutils010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils010_GetSecondsSinceComputerActive(g_bd_self_steamutils010);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)29) << 16 | 2u): { // SteamUtils010.GetConnectedUniverse
      if (g_bd_flat_SteamUtils010_GetConnectedUniverse == NULL || g_bd_self_steamutils010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils010_GetConnectedUniverse(g_bd_self_steamutils010);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)29) << 16 | 3u): { // SteamUtils010.GetServerRealTime
      if (g_bd_flat_SteamUtils010_GetServerRealTime == NULL || g_bd_self_steamutils010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils010_GetServerRealTime(g_bd_self_steamutils010);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)29) << 16 | 4u): { // SteamUtils010.GetIPCountry
      if (g_bd_flat_SteamUtils010_GetIPCountry == NULL || g_bd_self_steamutils010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamUtils010_GetIPCountry(g_bd_self_steamutils010);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)29) << 16 | 8u): { // SteamUtils010.GetCurrentBatteryPower
      if (g_bd_flat_SteamUtils010_GetCurrentBatteryPower == NULL || g_bd_self_steamutils010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils010_GetCurrentBatteryPower(g_bd_self_steamutils010);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)29) << 16 | 9u): { // SteamUtils010.GetAppID
      if (g_bd_identity_only) { // D-51-04: identity-only reports the launching game's real AppID, never 480
        uint32_t v = g_bd_report_appid;
        if (respCap < 4) { *respLen = 0; return 1; }
        memcpy(resp, &v, 4); *respLen = 4; return 0;
      }
      if (g_bd_flat_SteamUtils010_GetAppID == NULL || g_bd_self_steamutils010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils010_GetAppID(g_bd_self_steamutils010);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)29) << 16 | 17u): { // SteamUtils010.IsOverlayEnabled
      if (g_bd_flat_SteamUtils010_IsOverlayEnabled == NULL || g_bd_self_steamutils010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUtils010_IsOverlayEnabled(g_bd_self_steamutils010);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)29) << 16 | 23u): { // SteamUtils010.GetSteamUILanguage
      if (g_bd_flat_SteamUtils010_GetSteamUILanguage == NULL || g_bd_self_steamutils010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamUtils010_GetSteamUILanguage(g_bd_self_steamutils010);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)29) << 16 | 24u): { // SteamUtils010.IsSteamRunningInVR
      if (g_bd_flat_SteamUtils010_IsSteamRunningInVR == NULL || g_bd_self_steamutils010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUtils010_IsSteamRunningInVR(g_bd_self_steamutils010);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)29) << 16 | 26u): { // SteamUtils010.IsSteamInBigPictureMode
      if (g_bd_flat_SteamUtils010_IsSteamInBigPictureMode == NULL || g_bd_self_steamutils010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUtils010_IsSteamInBigPictureMode(g_bd_self_steamutils010);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)30) << 16 | 1u): { // STEAMUSERSTATS_INTERFACE_VERSION012.GetStat_2
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2 == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      float arg_pData = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2(g_bd_self_steamuserstats_interface_version012, arg_pchName, &arg_pData);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pData, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)30) << 16 | 2u): { // STEAMUSERSTATS_INTERFACE_VERSION012.GetStat
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int32_t arg_pData = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat(g_bd_self_steamuserstats_interface_version012, arg_pchName, &arg_pData);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pData, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)30) << 16 | 3u): { // STEAMUSERSTATS_INTERFACE_VERSION012.SetStat_2
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2 == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      float arg_fData; memcpy(&arg_fData, arg + (0u + 4 + arg_pchName_len), 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2(g_bd_self_steamuserstats_interface_version012, arg_pchName, arg_fData);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)30) << 16 | 4u): { // STEAMUSERSTATS_INTERFACE_VERSION012.SetStat
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_nData; memcpy(&arg_nData, arg + (0u + 4 + arg_pchName_len), 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat(g_bd_self_steamuserstats_interface_version012, arg_pchName, arg_nData);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)30) << 16 | 5u): { // STEAMUSERSTATS_INTERFACE_VERSION012.UpdateAvgRateStat
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      float arg_flCountThisSession; memcpy(&arg_flCountThisSession, arg + (0u + 4 + arg_pchName_len), 4);
      if (argLen < ((0u + 4 + arg_pchName_len) + 4) + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      double arg_dSessionLength; memcpy(&arg_dSessionLength, arg + ((0u + 4 + arg_pchName_len) + 4), 8);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat(g_bd_self_steamuserstats_interface_version012, arg_pchName, arg_flCountThisSession, arg_dSessionLength);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)30) << 16 | 6u): { // STEAMUSERSTATS_INTERFACE_VERSION012.GetAchievement
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int arg_pbAchieved = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement(g_bd_self_steamuserstats_interface_version012, arg_pchName, &arg_pbAchieved);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pbAchieved, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)30) << 16 | 7u): { // STEAMUSERSTATS_INTERFACE_VERSION012.SetAchievement
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement(g_bd_self_steamuserstats_interface_version012, arg_pchName);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)30) << 16 | 8u): { // STEAMUSERSTATS_INTERFACE_VERSION012.ClearAchievement
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement(g_bd_self_steamuserstats_interface_version012, arg_pchName);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)30) << 16 | 9u): { // STEAMUSERSTATS_INTERFACE_VERSION012.GetAchievementAndUnlockTime
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int arg_pbAchieved = 0;
      uint32_t arg_punUnlockTime = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime(g_bd_self_steamuserstats_interface_version012, arg_pchName, &arg_pbAchieved, &arg_punUnlockTime);
      if (respCap < 12) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pbAchieved, 4);
      memcpy(resp + 8, &arg_punUnlockTime, 4);
      *respLen = 12;
      return 0;
    }
    case (((uint32_t)30) << 16 | 10u): { // STEAMUSERSTATS_INTERFACE_VERSION012.StoreStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_StoreStats == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_StoreStats(g_bd_self_steamuserstats_interface_version012);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)30) << 16 | 12u): { // STEAMUSERSTATS_INTERFACE_VERSION012.GetAchievementDisplayAttribute
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute_pchKey_buf[4096 + 1];
      const char *arg_pchKey = NULL;
      uint32_t arg_pchKey_len = 0;
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchKey_len, arg + (0u + 4 + arg_pchName_len), 4);
      if (arg_pchKey_len != 0xFFFFFFFFu) {
        if (arg_pchKey_len > 4096 || argLen < (0u + 4 + arg_pchName_len) + 4 + arg_pchKey_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute_pchKey_buf, arg + (0u + 4 + arg_pchName_len) + 4, arg_pchKey_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute_pchKey_buf[arg_pchKey_len] = '\0';
        arg_pchKey = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute_pchKey_buf;
      } else {
        arg_pchKey_len = 0;
      }
      const char *result = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute(g_bd_self_steamuserstats_interface_version012, arg_pchName, arg_pchKey);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)30) << 16 | 13u): { // STEAMUSERSTATS_INTERFACE_VERSION012.IndicateAchievementProgress
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nCurProgress; memcpy(&arg_nCurProgress, arg + (0u + 4 + arg_pchName_len), 4);
      if (argLen < ((0u + 4 + arg_pchName_len) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nMaxProgress; memcpy(&arg_nMaxProgress, arg + ((0u + 4 + arg_pchName_len) + 4), 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress(g_bd_self_steamuserstats_interface_version012, arg_pchName, arg_nCurProgress, arg_nMaxProgress);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)30) << 16 | 14u): { // STEAMUSERSTATS_INTERFACE_VERSION012.GetNumAchievements
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetNumAchievements == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetNumAchievements(g_bd_self_steamuserstats_interface_version012);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)30) << 16 | 15u): { // STEAMUSERSTATS_INTERFACE_VERSION012.GetAchievementName
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementName == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_iAchievement; memcpy(&arg_iAchievement, arg + 0u, 4);
      const char *result = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementName(g_bd_self_steamuserstats_interface_version012, arg_iAchievement);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)30) << 16 | 21u): { // STEAMUSERSTATS_INTERFACE_VERSION012.ResetAllStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_ResetAllStats == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int arg_bAchievementsToo; memcpy(&arg_bAchievementsToo, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_ResetAllStats(g_bd_self_steamuserstats_interface_version012, arg_bAchievementsToo);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)31) << 16 | 0u): { // STEAMUSERSTATS_INTERFACE_VERSION013.GetStat_2
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2 == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      float arg_pData = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2(g_bd_self_steamuserstats_interface_version013, arg_pchName, &arg_pData);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pData, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)31) << 16 | 1u): { // STEAMUSERSTATS_INTERFACE_VERSION013.GetStat
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int32_t arg_pData = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat(g_bd_self_steamuserstats_interface_version013, arg_pchName, &arg_pData);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pData, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)31) << 16 | 2u): { // STEAMUSERSTATS_INTERFACE_VERSION013.SetStat_2
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2 == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      float arg_fData; memcpy(&arg_fData, arg + (0u + 4 + arg_pchName_len), 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2(g_bd_self_steamuserstats_interface_version013, arg_pchName, arg_fData);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)31) << 16 | 3u): { // STEAMUSERSTATS_INTERFACE_VERSION013.SetStat
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_nData; memcpy(&arg_nData, arg + (0u + 4 + arg_pchName_len), 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat(g_bd_self_steamuserstats_interface_version013, arg_pchName, arg_nData);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)31) << 16 | 4u): { // STEAMUSERSTATS_INTERFACE_VERSION013.UpdateAvgRateStat
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      float arg_flCountThisSession; memcpy(&arg_flCountThisSession, arg + (0u + 4 + arg_pchName_len), 4);
      if (argLen < ((0u + 4 + arg_pchName_len) + 4) + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      double arg_dSessionLength; memcpy(&arg_dSessionLength, arg + ((0u + 4 + arg_pchName_len) + 4), 8);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat(g_bd_self_steamuserstats_interface_version013, arg_pchName, arg_flCountThisSession, arg_dSessionLength);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)31) << 16 | 5u): { // STEAMUSERSTATS_INTERFACE_VERSION013.GetAchievement
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int arg_pbAchieved = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement(g_bd_self_steamuserstats_interface_version013, arg_pchName, &arg_pbAchieved);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pbAchieved, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)31) << 16 | 6u): { // STEAMUSERSTATS_INTERFACE_VERSION013.SetAchievement
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement(g_bd_self_steamuserstats_interface_version013, arg_pchName);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)31) << 16 | 7u): { // STEAMUSERSTATS_INTERFACE_VERSION013.ClearAchievement
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement(g_bd_self_steamuserstats_interface_version013, arg_pchName);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)31) << 16 | 8u): { // STEAMUSERSTATS_INTERFACE_VERSION013.GetAchievementAndUnlockTime
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int arg_pbAchieved = 0;
      uint32_t arg_punUnlockTime = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime(g_bd_self_steamuserstats_interface_version013, arg_pchName, &arg_pbAchieved, &arg_punUnlockTime);
      if (respCap < 12) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pbAchieved, 4);
      memcpy(resp + 8, &arg_punUnlockTime, 4);
      *respLen = 12;
      return 0;
    }
    case (((uint32_t)31) << 16 | 9u): { // STEAMUSERSTATS_INTERFACE_VERSION013.StoreStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_StoreStats == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_StoreStats(g_bd_self_steamuserstats_interface_version013);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)31) << 16 | 11u): { // STEAMUSERSTATS_INTERFACE_VERSION013.GetAchievementDisplayAttribute
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute_pchKey_buf[4096 + 1];
      const char *arg_pchKey = NULL;
      uint32_t arg_pchKey_len = 0;
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchKey_len, arg + (0u + 4 + arg_pchName_len), 4);
      if (arg_pchKey_len != 0xFFFFFFFFu) {
        if (arg_pchKey_len > 4096 || argLen < (0u + 4 + arg_pchName_len) + 4 + arg_pchKey_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute_pchKey_buf, arg + (0u + 4 + arg_pchName_len) + 4, arg_pchKey_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute_pchKey_buf[arg_pchKey_len] = '\0';
        arg_pchKey = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute_pchKey_buf;
      } else {
        arg_pchKey_len = 0;
      }
      const char *result = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute(g_bd_self_steamuserstats_interface_version013, arg_pchName, arg_pchKey);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)31) << 16 | 12u): { // STEAMUSERSTATS_INTERFACE_VERSION013.IndicateAchievementProgress
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nCurProgress; memcpy(&arg_nCurProgress, arg + (0u + 4 + arg_pchName_len), 4);
      if (argLen < ((0u + 4 + arg_pchName_len) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nMaxProgress; memcpy(&arg_nMaxProgress, arg + ((0u + 4 + arg_pchName_len) + 4), 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress(g_bd_self_steamuserstats_interface_version013, arg_pchName, arg_nCurProgress, arg_nMaxProgress);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)31) << 16 | 13u): { // STEAMUSERSTATS_INTERFACE_VERSION013.GetNumAchievements
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetNumAchievements == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetNumAchievements(g_bd_self_steamuserstats_interface_version013);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)31) << 16 | 14u): { // STEAMUSERSTATS_INTERFACE_VERSION013.GetAchievementName
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementName == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_iAchievement; memcpy(&arg_iAchievement, arg + 0u, 4);
      const char *result = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementName(g_bd_self_steamuserstats_interface_version013, arg_iAchievement);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)31) << 16 | 20u): { // STEAMUSERSTATS_INTERFACE_VERSION013.ResetAllStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_ResetAllStats == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int arg_bAchievementsToo; memcpy(&arg_bAchievementsToo, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_ResetAllStats(g_bd_self_steamuserstats_interface_version013, arg_bAchievementsToo);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)54) << 16 | 0u): { // SteamUtils009.GetSecondsSinceAppActive
      if (g_bd_flat_SteamUtils009_GetSecondsSinceAppActive == NULL || g_bd_self_steamutils009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils009_GetSecondsSinceAppActive(g_bd_self_steamutils009);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)54) << 16 | 1u): { // SteamUtils009.GetSecondsSinceComputerActive
      if (g_bd_flat_SteamUtils009_GetSecondsSinceComputerActive == NULL || g_bd_self_steamutils009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils009_GetSecondsSinceComputerActive(g_bd_self_steamutils009);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)54) << 16 | 2u): { // SteamUtils009.GetConnectedUniverse
      if (g_bd_flat_SteamUtils009_GetConnectedUniverse == NULL || g_bd_self_steamutils009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils009_GetConnectedUniverse(g_bd_self_steamutils009);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)54) << 16 | 3u): { // SteamUtils009.GetServerRealTime
      if (g_bd_flat_SteamUtils009_GetServerRealTime == NULL || g_bd_self_steamutils009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils009_GetServerRealTime(g_bd_self_steamutils009);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)54) << 16 | 4u): { // SteamUtils009.GetIPCountry
      if (g_bd_flat_SteamUtils009_GetIPCountry == NULL || g_bd_self_steamutils009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamUtils009_GetIPCountry(g_bd_self_steamutils009);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)54) << 16 | 8u): { // SteamUtils009.GetCurrentBatteryPower
      if (g_bd_flat_SteamUtils009_GetCurrentBatteryPower == NULL || g_bd_self_steamutils009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils009_GetCurrentBatteryPower(g_bd_self_steamutils009);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)54) << 16 | 9u): { // SteamUtils009.GetAppID
      if (g_bd_identity_only) { // D-51-04: identity-only reports the launching game's real AppID, never 480
        uint32_t v = g_bd_report_appid;
        if (respCap < 4) { *respLen = 0; return 1; }
        memcpy(resp, &v, 4); *respLen = 4; return 0;
      }
      if (g_bd_flat_SteamUtils009_GetAppID == NULL || g_bd_self_steamutils009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils009_GetAppID(g_bd_self_steamutils009);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)54) << 16 | 17u): { // SteamUtils009.IsOverlayEnabled
      if (g_bd_flat_SteamUtils009_IsOverlayEnabled == NULL || g_bd_self_steamutils009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUtils009_IsOverlayEnabled(g_bd_self_steamutils009);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)54) << 16 | 23u): { // SteamUtils009.GetSteamUILanguage
      if (g_bd_flat_SteamUtils009_GetSteamUILanguage == NULL || g_bd_self_steamutils009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamUtils009_GetSteamUILanguage(g_bd_self_steamutils009);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)54) << 16 | 24u): { // SteamUtils009.IsSteamRunningInVR
      if (g_bd_flat_SteamUtils009_IsSteamRunningInVR == NULL || g_bd_self_steamutils009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUtils009_IsSteamRunningInVR(g_bd_self_steamutils009);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)54) << 16 | 26u): { // SteamUtils009.IsSteamInBigPictureMode
      if (g_bd_flat_SteamUtils009_IsSteamInBigPictureMode == NULL || g_bd_self_steamutils009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUtils009_IsSteamInBigPictureMode(g_bd_self_steamutils009);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)59) << 16 | 0u): { // SteamUser018.GetHSteamUser
      if (g_bd_flat_SteamUser018_GetHSteamUser == NULL || g_bd_self_steamuser018 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_SteamUser018_GetHSteamUser(g_bd_self_steamuser018);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)59) << 16 | 1u): { // SteamUser018.BLoggedOn
      if (g_bd_flat_SteamUser018_BLoggedOn == NULL || g_bd_self_steamuser018 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUser018_BLoggedOn(g_bd_self_steamuser018);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)59) << 16 | 2u): { // SteamUser018.GetSteamID
      if (g_bd_flat_SteamUser018_GetSteamID == NULL || g_bd_self_steamuser018 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint64_t __ret = g_bd_flat_SteamUser018_GetSteamID(g_bd_self_steamuser018);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 8);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)59) << 16 | 13u): { // SteamUser018.GetAuthSessionTicket
      if (g_bd_flat_SteamUser018_GetAuthSessionTicket == NULL || g_bd_self_steamuser018 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static uint8_t g_bd_flat_SteamUser018_GetAuthSessionTicket_pTicket_buf[BD_WIRE_OUT_BUFFER_MAX_BYTES];
      uint32_t cap_pTicket = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&cap_pTicket, arg + 0u, 4);
      if (cap_pTicket > BD_WIRE_OUT_BUFFER_MAX_BYTES) cap_pTicket = BD_WIRE_OUT_BUFFER_MAX_BYTES;
      if (respCap < 12) { *respLen = 0; return 1; }
      if (cap_pTicket > respCap - 12) cap_pTicket = (uint32_t)(respCap - 12); // response must fit the scratch
      memset(g_bd_flat_SteamUser018_GetAuthSessionTicket_pTicket_buf, 0, cap_pTicket); // no earlier call's bytes cross into the game (53-17 WR-04)
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_cbMaxTicket; memcpy(&arg_cbMaxTicket, arg + (0u + 4), 4);
      uint32_t arg_pcbTicket = 0;
      if ((int64_t)arg_cbMaxTicket < 0 || (int64_t)arg_cbMaxTicket > (int64_t)cap_pTicket) arg_cbMaxTicket = (int32_t)cap_pTicket;
      uint32_t __ret = g_bd_flat_SteamUser018_GetAuthSessionTicket(g_bd_self_steamuser018, g_bd_flat_SteamUser018_GetAuthSessionTicket_pTicket_buf, arg_cbMaxTicket, &arg_pcbTicket, NULL);
      if (respCap < 12) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pcbTicket, 4);
      uint32_t outLen_pTicket = cap_pTicket;
      if ((uint32_t)arg_pcbTicket < outLen_pTicket) outLen_pTicket = (uint32_t)arg_pcbTicket;
      memcpy(resp + 8, &outLen_pTicket, 4);
      memcpy(resp + 8 + 4, g_bd_flat_SteamUser018_GetAuthSessionTicket_pTicket_buf, outLen_pTicket);
      *respLen = 8 + 4 + outLen_pTicket;
      return 0;
    }
    case (((uint32_t)59) << 16 | 16u): { // SteamUser018.CancelAuthTicket
      if (g_bd_flat_SteamUser018_CancelAuthTicket == NULL || g_bd_self_steamuser018 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hAuthTicket; memcpy(&arg_hAuthTicket, arg + 0u, 4);
      g_bd_flat_SteamUser018_CancelAuthTicket(g_bd_self_steamuser018, arg_hAuthTicket);
      *respLen = 0; return 0;
    }
    case (((uint32_t)60) << 16 | 0u): { // SteamUtils007.GetSecondsSinceAppActive
      if (g_bd_flat_SteamUtils007_GetSecondsSinceAppActive == NULL || g_bd_self_steamutils007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils007_GetSecondsSinceAppActive(g_bd_self_steamutils007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)60) << 16 | 1u): { // SteamUtils007.GetSecondsSinceComputerActive
      if (g_bd_flat_SteamUtils007_GetSecondsSinceComputerActive == NULL || g_bd_self_steamutils007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils007_GetSecondsSinceComputerActive(g_bd_self_steamutils007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)60) << 16 | 2u): { // SteamUtils007.GetConnectedUniverse
      if (g_bd_flat_SteamUtils007_GetConnectedUniverse == NULL || g_bd_self_steamutils007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils007_GetConnectedUniverse(g_bd_self_steamutils007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)60) << 16 | 3u): { // SteamUtils007.GetServerRealTime
      if (g_bd_flat_SteamUtils007_GetServerRealTime == NULL || g_bd_self_steamutils007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils007_GetServerRealTime(g_bd_self_steamutils007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)60) << 16 | 4u): { // SteamUtils007.GetIPCountry
      if (g_bd_flat_SteamUtils007_GetIPCountry == NULL || g_bd_self_steamutils007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamUtils007_GetIPCountry(g_bd_self_steamutils007);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)60) << 16 | 8u): { // SteamUtils007.GetCurrentBatteryPower
      if (g_bd_flat_SteamUtils007_GetCurrentBatteryPower == NULL || g_bd_self_steamutils007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils007_GetCurrentBatteryPower(g_bd_self_steamutils007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)60) << 16 | 9u): { // SteamUtils007.GetAppID
      if (g_bd_identity_only) { // D-51-04: identity-only reports the launching game's real AppID, never 480
        uint32_t v = g_bd_report_appid;
        if (respCap < 4) { *respLen = 0; return 1; }
        memcpy(resp, &v, 4); *respLen = 4; return 0;
      }
      if (g_bd_flat_SteamUtils007_GetAppID == NULL || g_bd_self_steamutils007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils007_GetAppID(g_bd_self_steamutils007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)60) << 16 | 17u): { // SteamUtils007.IsOverlayEnabled
      if (g_bd_flat_SteamUtils007_IsOverlayEnabled == NULL || g_bd_self_steamutils007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUtils007_IsOverlayEnabled(g_bd_self_steamutils007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)60) << 16 | 23u): { // SteamUtils007.GetSteamUILanguage
      if (g_bd_flat_SteamUtils007_GetSteamUILanguage == NULL || g_bd_self_steamutils007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamUtils007_GetSteamUILanguage(g_bd_self_steamutils007);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)60) << 16 | 24u): { // SteamUtils007.IsSteamRunningInVR
      if (g_bd_flat_SteamUtils007_IsSteamRunningInVR == NULL || g_bd_self_steamutils007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUtils007_IsSteamRunningInVR(g_bd_self_steamutils007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)61) << 16 | 0u): { // STEAMAPPS_INTERFACE_VERSION007.BIsSubscribed
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribed == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribed(g_bd_self_steamapps_interface_version007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)61) << 16 | 1u): { // STEAMAPPS_INTERFACE_VERSION007.BIsLowViolence
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsLowViolence == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsLowViolence(g_bd_self_steamapps_interface_version007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)61) << 16 | 2u): { // STEAMAPPS_INTERFACE_VERSION007.BIsCybercafe
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsCybercafe == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsCybercafe(g_bd_self_steamapps_interface_version007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)61) << 16 | 3u): { // STEAMAPPS_INTERFACE_VERSION007.BIsVACBanned
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsVACBanned == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsVACBanned(g_bd_self_steamapps_interface_version007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)61) << 16 | 4u): { // STEAMAPPS_INTERFACE_VERSION007.GetCurrentGameLanguage
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetCurrentGameLanguage == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetCurrentGameLanguage(g_bd_self_steamapps_interface_version007);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)61) << 16 | 5u): { // STEAMAPPS_INTERFACE_VERSION007.GetAvailableGameLanguages
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetAvailableGameLanguages == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetAvailableGameLanguages(g_bd_self_steamapps_interface_version007);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)61) << 16 | 6u): { // STEAMAPPS_INTERFACE_VERSION007.BIsSubscribedApp
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedApp == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_appID; memcpy(&arg_appID, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedApp(g_bd_self_steamapps_interface_version007, arg_appID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)61) << 16 | 7u): { // STEAMAPPS_INTERFACE_VERSION007.BIsDlcInstalled
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsDlcInstalled == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_appID; memcpy(&arg_appID, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsDlcInstalled(g_bd_self_steamapps_interface_version007, arg_appID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)61) << 16 | 8u): { // STEAMAPPS_INTERFACE_VERSION007.GetEarliestPurchaseUnixTime
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetEarliestPurchaseUnixTime == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nAppID; memcpy(&arg_nAppID, arg + 0u, 4);
      uint32_t __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetEarliestPurchaseUnixTime(g_bd_self_steamapps_interface_version007, arg_nAppID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)61) << 16 | 9u): { // STEAMAPPS_INTERFACE_VERSION007.BIsSubscribedFromFreeWeekend
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedFromFreeWeekend == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedFromFreeWeekend(g_bd_self_steamapps_interface_version007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)61) << 16 | 10u): { // STEAMAPPS_INTERFACE_VERSION007.GetDLCCount
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetDLCCount == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetDLCCount(g_bd_self_steamapps_interface_version007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)61) << 16 | 19u): { // STEAMAPPS_INTERFACE_VERSION007.BIsAppInstalled
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsAppInstalled == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_appID; memcpy(&arg_appID, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsAppInstalled(g_bd_self_steamapps_interface_version007, arg_appID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)61) << 16 | 20u): { // STEAMAPPS_INTERFACE_VERSION007.GetAppOwner
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetAppOwner == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint64_t __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetAppOwner(g_bd_self_steamapps_interface_version007);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 8);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)61) << 16 | 23u): { // STEAMAPPS_INTERFACE_VERSION007.GetAppBuildId
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetAppBuildId == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetAppBuildId(g_bd_self_steamapps_interface_version007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)69) << 16 | 0u): { // SteamMatchMakingServers003.RequestInternetServerList
      if (g_bd_flat_SteamMatchMakingServers003_RequestInternetServerList == NULL || g_bd_self_steammatchmakingservers003 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_mms_request_list
        if (gl_mms_request_list(g_bd_self_steammatchmakingservers003, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)69) << 16 | 1u): { // SteamMatchMakingServers003.RequestLANServerList
      if (g_bd_flat_SteamMatchMakingServers003_RequestLANServerList == NULL || g_bd_self_steammatchmakingservers003 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_mms_request_list
        if (gl_mms_request_list(g_bd_self_steammatchmakingservers003, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)69) << 16 | 2u): { // SteamMatchMakingServers003.RequestFriendsServerList
      if (g_bd_flat_SteamMatchMakingServers003_RequestFriendsServerList == NULL || g_bd_self_steammatchmakingservers003 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_mms_request_list
        if (gl_mms_request_list(g_bd_self_steammatchmakingservers003, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)69) << 16 | 3u): { // SteamMatchMakingServers003.RequestFavoritesServerList
      if (g_bd_flat_SteamMatchMakingServers003_RequestFavoritesServerList == NULL || g_bd_self_steammatchmakingservers003 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_mms_request_list
        if (gl_mms_request_list(g_bd_self_steammatchmakingservers003, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)69) << 16 | 4u): { // SteamMatchMakingServers003.RequestHistoryServerList
      if (g_bd_flat_SteamMatchMakingServers003_RequestHistoryServerList == NULL || g_bd_self_steammatchmakingservers003 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_mms_request_list
        if (gl_mms_request_list(g_bd_self_steammatchmakingservers003, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)69) << 16 | 5u): { // SteamMatchMakingServers003.RequestSpectatorServerList
      if (g_bd_flat_SteamMatchMakingServers003_RequestSpectatorServerList == NULL || g_bd_self_steammatchmakingservers003 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_mms_request_list
        if (gl_mms_request_list(g_bd_self_steammatchmakingservers003, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)69) << 16 | 6u): { // SteamMatchMakingServers003.ReleaseRequest
      if (g_bd_flat_SteamMatchMakingServers003_ReleaseRequest == NULL || g_bd_self_steammatchmakingservers003 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_hRequest; memcpy(&arg_hRequest, arg + 0u, 8);
      g_bd_flat_SteamMatchMakingServers003_ReleaseRequest(g_bd_self_steammatchmakingservers003, arg_hRequest);
      *respLen = 0; return 0;
    }
    case (((uint32_t)69) << 16 | 7u): { // SteamMatchMakingServers003.GetServerDetails
      if (g_bd_flat_SteamMatchMakingServers003_GetServerDetails == NULL || g_bd_self_steammatchmakingservers003 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_mms_get_server_details
        if (gl_mms_get_server_details(g_bd_self_steammatchmakingservers003, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)69) << 16 | 8u): { // SteamMatchMakingServers003.CancelQuery
      if (g_bd_flat_SteamMatchMakingServers003_CancelQuery == NULL || g_bd_self_steammatchmakingservers003 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_hRequest; memcpy(&arg_hRequest, arg + 0u, 8);
      g_bd_flat_SteamMatchMakingServers003_CancelQuery(g_bd_self_steammatchmakingservers003, arg_hRequest);
      *respLen = 0; return 0;
    }
    case (((uint32_t)69) << 16 | 9u): { // SteamMatchMakingServers003.RefreshQuery
      if (g_bd_flat_SteamMatchMakingServers003_RefreshQuery == NULL || g_bd_self_steammatchmakingservers003 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_hRequest; memcpy(&arg_hRequest, arg + 0u, 8);
      g_bd_flat_SteamMatchMakingServers003_RefreshQuery(g_bd_self_steammatchmakingservers003, arg_hRequest);
      *respLen = 0; return 0;
    }
    case (((uint32_t)69) << 16 | 10u): { // SteamMatchMakingServers003.IsRefreshing
      if (g_bd_flat_SteamMatchMakingServers003_IsRefreshing == NULL || g_bd_self_steammatchmakingservers003 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_hRequest; memcpy(&arg_hRequest, arg + 0u, 8);
      int __ret = g_bd_flat_SteamMatchMakingServers003_IsRefreshing(g_bd_self_steammatchmakingservers003, arg_hRequest);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)69) << 16 | 11u): { // SteamMatchMakingServers003.GetServerCount
      if (g_bd_flat_SteamMatchMakingServers003_GetServerCount == NULL || g_bd_self_steammatchmakingservers003 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_hRequest; memcpy(&arg_hRequest, arg + 0u, 8);
      int32_t __ret = g_bd_flat_SteamMatchMakingServers003_GetServerCount(g_bd_self_steammatchmakingservers003, arg_hRequest);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)69) << 16 | 12u): { // SteamMatchMakingServers003.RefreshServer
      if (g_bd_flat_SteamMatchMakingServers003_RefreshServer == NULL || g_bd_self_steammatchmakingservers003 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint64_t arg_hRequest; memcpy(&arg_hRequest, arg + 0u, 8);
      if (argLen < (0u + 8) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_iServer; memcpy(&arg_iServer, arg + (0u + 8), 4);
      g_bd_flat_SteamMatchMakingServers003_RefreshServer(g_bd_self_steammatchmakingservers003, arg_hRequest, arg_iServer);
      *respLen = 0; return 0;
    }
    case (((uint32_t)69) << 16 | 13u): { // SteamMatchMakingServers003.PingServer
      if (g_bd_flat_SteamMatchMakingServers003_PingServer == NULL || g_bd_self_steammatchmakingservers003 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_mms_ping_server
        if (gl_mms_ping_server(g_bd_self_steammatchmakingservers003, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)69) << 16 | 14u): { // SteamMatchMakingServers003.PlayerDetails
      if (g_bd_flat_SteamMatchMakingServers003_PlayerDetails == NULL || g_bd_self_steammatchmakingservers003 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_mms_player_details
        if (gl_mms_player_details(g_bd_self_steammatchmakingservers003, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)69) << 16 | 15u): { // SteamMatchMakingServers003.ServerRules
      if (g_bd_flat_SteamMatchMakingServers003_ServerRules == NULL || g_bd_self_steammatchmakingservers003 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_mms_server_rules
        if (gl_mms_server_rules(g_bd_self_steammatchmakingservers003, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)69) << 16 | 16u): { // SteamMatchMakingServers003.ServerFriends
      if (g_bd_flat_SteamMatchMakingServers003_ServerFriends == NULL || g_bd_self_steammatchmakingservers003 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_mms_server_friends
        if (gl_mms_server_friends(g_bd_self_steammatchmakingservers003, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)69) << 16 | 17u): { // SteamMatchMakingServers003.CancelServerQuery
      if (g_bd_flat_SteamMatchMakingServers003_CancelServerQuery == NULL || g_bd_self_steammatchmakingservers003 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hServerQuery; memcpy(&arg_hServerQuery, arg + 0u, 4);
      g_bd_flat_SteamMatchMakingServers003_CancelServerQuery(g_bd_self_steammatchmakingservers003, arg_hServerQuery);
      *respLen = 0; return 0;
    }
    case (((uint32_t)70) << 16 | 0u): { // SteamNetworkingSockets013.CreateListenSocketIP
      if (g_bd_flat_SteamNetworkingSockets013_CreateListenSocketIP == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_sockets_open
        if (gl_net_sockets_open(g_bd_self_steamnetworkingsockets013, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)70) << 16 | 1u): { // SteamNetworkingSockets013.ConnectByIPAddress
      if (g_bd_flat_SteamNetworkingSockets013_ConnectByIPAddress == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_sockets_open
        if (gl_net_sockets_open(g_bd_self_steamnetworkingsockets013, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)70) << 16 | 2u): { // SteamNetworkingSockets013.CreateListenSocketP2P
      if (g_bd_flat_SteamNetworkingSockets013_CreateListenSocketP2P == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_sockets_open
        if (gl_net_sockets_open(g_bd_self_steamnetworkingsockets013, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)70) << 16 | 3u): { // SteamNetworkingSockets013.ConnectP2P
      if (g_bd_flat_SteamNetworkingSockets013_ConnectP2P == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_sockets_open
        if (gl_net_sockets_open(g_bd_self_steamnetworkingsockets013, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)70) << 16 | 4u): { // SteamNetworkingSockets013.AcceptConnection
      if (g_bd_flat_SteamNetworkingSockets013_AcceptConnection == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hConn; memcpy(&arg_hConn, arg + 0u, 4);
      uint32_t __ret = g_bd_flat_SteamNetworkingSockets013_AcceptConnection(g_bd_self_steamnetworkingsockets013, arg_hConn);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)70) << 16 | 5u): { // SteamNetworkingSockets013.CloseConnection
      if (g_bd_flat_SteamNetworkingSockets013_CloseConnection == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_nets_close_connection
        if (gl_nets_close_connection(g_bd_self_steamnetworkingsockets013, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)70) << 16 | 6u): { // SteamNetworkingSockets013.CloseListenSocket
      if (g_bd_flat_SteamNetworkingSockets013_CloseListenSocket == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hSocket; memcpy(&arg_hSocket, arg + 0u, 4);
      int __ret = g_bd_flat_SteamNetworkingSockets013_CloseListenSocket(g_bd_self_steamnetworkingsockets013, arg_hSocket);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)70) << 16 | 7u): { // SteamNetworkingSockets013.SetConnectionUserData
      if (g_bd_flat_SteamNetworkingSockets013_SetConnectionUserData == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hPeer; memcpy(&arg_hPeer, arg + 0u, 4);
      if (argLen < (0u + 4) + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int64_t arg_nUserData; memcpy(&arg_nUserData, arg + (0u + 4), 8);
      int __ret = g_bd_flat_SteamNetworkingSockets013_SetConnectionUserData(g_bd_self_steamnetworkingsockets013, arg_hPeer, arg_nUserData);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)70) << 16 | 8u): { // SteamNetworkingSockets013.GetConnectionUserData
      if (g_bd_flat_SteamNetworkingSockets013_GetConnectionUserData == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hPeer; memcpy(&arg_hPeer, arg + 0u, 4);
      int64_t __ret = g_bd_flat_SteamNetworkingSockets013_GetConnectionUserData(g_bd_self_steamnetworkingsockets013, arg_hPeer);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 8);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)70) << 16 | 9u): { // SteamNetworkingSockets013.SetConnectionName
      if (g_bd_flat_SteamNetworkingSockets013_SetConnectionName == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hPeer; memcpy(&arg_hPeer, arg + 0u, 4);
      static char g_bd_flat_SteamNetworkingSockets013_SetConnectionName_pszName_buf[4096 + 1];
      const char *arg_pszName = NULL;
      uint32_t arg_pszName_len = 0;
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pszName_len, arg + (0u + 4), 4);
      if (arg_pszName_len != 0xFFFFFFFFu) {
        if (arg_pszName_len > 4096 || argLen < (0u + 4) + 4 + arg_pszName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamNetworkingSockets013_SetConnectionName_pszName_buf, arg + (0u + 4) + 4, arg_pszName_len);
        g_bd_flat_SteamNetworkingSockets013_SetConnectionName_pszName_buf[arg_pszName_len] = '\0';
        arg_pszName = g_bd_flat_SteamNetworkingSockets013_SetConnectionName_pszName_buf;
      } else {
        arg_pszName_len = 0;
      }
      g_bd_flat_SteamNetworkingSockets013_SetConnectionName(g_bd_self_steamnetworkingsockets013, arg_hPeer, arg_pszName);
      *respLen = 0; return 0;
    }
    case (((uint32_t)70) << 16 | 10u): { // SteamNetworkingSockets013.GetConnectionName
      if (g_bd_flat_SteamNetworkingSockets013_GetConnectionName == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hPeer; memcpy(&arg_hPeer, arg + 0u, 4);
      static uint8_t g_bd_flat_SteamNetworkingSockets013_GetConnectionName_pszName_buf[BD_WIRE_OUT_BUFFER_MAX_BYTES];
      uint32_t cap_pszName = 0;
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&cap_pszName, arg + (0u + 4), 4);
      if (cap_pszName > BD_WIRE_OUT_BUFFER_MAX_BYTES) cap_pszName = BD_WIRE_OUT_BUFFER_MAX_BYTES;
      if (respCap < 8) { *respLen = 0; return 1; }
      if (cap_pszName > respCap - 8) cap_pszName = (uint32_t)(respCap - 8); // response must fit the scratch
      memset(g_bd_flat_SteamNetworkingSockets013_GetConnectionName_pszName_buf, 0, cap_pszName); // no earlier call's bytes cross into the game (53-17 WR-04)
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_nMaxLen; memcpy(&arg_nMaxLen, arg + ((0u + 4) + 4), 4);
      if ((int64_t)arg_nMaxLen < 0 || (int64_t)arg_nMaxLen > (int64_t)cap_pszName) arg_nMaxLen = (int32_t)cap_pszName;
      int __ret = g_bd_flat_SteamNetworkingSockets013_GetConnectionName(g_bd_self_steamnetworkingsockets013, arg_hPeer, g_bd_flat_SteamNetworkingSockets013_GetConnectionName_pszName_buf, arg_nMaxLen);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      uint32_t outLen_pszName = cap_pszName;
      memcpy(resp + 4, &outLen_pszName, 4);
      memcpy(resp + 4 + 4, g_bd_flat_SteamNetworkingSockets013_GetConnectionName_pszName_buf, outLen_pszName);
      *respLen = 4 + 4 + outLen_pszName;
      return 0;
    }
    case (((uint32_t)70) << 16 | 11u): { // SteamNetworkingSockets013.SendMessageToConnection
      if (g_bd_flat_SteamNetworkingSockets013_SendMessageToConnection == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hConn; memcpy(&arg_hConn, arg + 0u, 4);
      static uint8_t g_bd_flat_SteamNetworkingSockets013_SendMessageToConnection_pData_buf[61440];
      uint32_t arg_pData_len = 0;
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pData_len, arg + (0u + 4), 4);
      if (arg_pData_len > 61440) { gl_net_evidence(1, GL_NET_KIND_OVERSIZE, GL_NET_IFACE_SOCKETS, 0, arg_pData_len, GL_NET_PATH_UNKNOWN); *respLen = 0; return 1; } // oversize refusal is NET evidence -- 58-10
      if (arg_pData_len > 61440 || (uint64_t)argLen < (uint64_t)((0u + 4)) + 4u + arg_pData_len) { *respLen = 0; return 1; } // in-buffer past cap or argLen -- T-58-16
      memcpy(g_bd_flat_SteamNetworkingSockets013_SendMessageToConnection_pData_buf, arg + (0u + 4) + 4, arg_pData_len);
      const void *arg_pData = g_bd_flat_SteamNetworkingSockets013_SendMessageToConnection_pData_buf;
      if (argLen < ((0u + 4) + 4 + arg_pData_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_cbData; memcpy(&arg_cbData, arg + ((0u + 4) + 4 + arg_pData_len), 4);
      if (argLen < (((0u + 4) + 4 + arg_pData_len) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_nSendFlags; memcpy(&arg_nSendFlags, arg + (((0u + 4) + 4 + arg_pData_len) + 4), 4);
      uint64_t arg_pOutMessageNumber = 0;
      if ((int64_t)arg_cbData != (int64_t)arg_pData_len) { *respLen = 0; return 1; } // lenParam must equal the bytes sent -- T-58-16
      uint32_t __ret = g_bd_flat_SteamNetworkingSockets013_SendMessageToConnection(g_bd_self_steamnetworkingsockets013, arg_hConn, arg_pData, arg_cbData, arg_nSendFlags, &arg_pOutMessageNumber);
      if (__ret > 0) gl_net_evidence(1, GL_NET_KIND_SEND, GL_NET_IFACE_SOCKETS, 0, (uint32_t)__ret, GL_NET_PATH_UNKNOWN);
      if (respCap < 12) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pOutMessageNumber, 8);
      *respLen = 12;
      return 0;
    }
    case (((uint32_t)70) << 16 | 13u): { // SteamNetworkingSockets013.FlushMessagesOnConnection
      if (g_bd_flat_SteamNetworkingSockets013_FlushMessagesOnConnection == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hConn; memcpy(&arg_hConn, arg + 0u, 4);
      uint32_t __ret = g_bd_flat_SteamNetworkingSockets013_FlushMessagesOnConnection(g_bd_self_steamnetworkingsockets013, arg_hConn);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)70) << 16 | 14u): { // SteamNetworkingSockets013.ReceiveMessagesOnConnection
      if (g_bd_flat_SteamNetworkingSockets013_ReceiveMessagesOnConnection == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_receive_messages
        if (gl_net_receive_messages(g_bd_self_steamnetworkingsockets013, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)70) << 16 | 15u): { // SteamNetworkingSockets013.GetConnectionInfo
      if (g_bd_flat_SteamNetworkingSockets013_GetConnectionInfo == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_get_connection_info
        if (gl_net_get_connection_info(g_bd_self_steamnetworkingsockets013, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)70) << 16 | 16u): { // SteamNetworkingSockets013.GetConnectionRealTimeStatus
      if (g_bd_flat_SteamNetworkingSockets013_GetConnectionRealTimeStatus == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_rt_status
        if (gl_net_rt_status(g_bd_self_steamnetworkingsockets013, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)70) << 16 | 17u): { // SteamNetworkingSockets013.GetDetailedConnectionStatus
      if (g_bd_flat_SteamNetworkingSockets013_GetDetailedConnectionStatus == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hConn; memcpy(&arg_hConn, arg + 0u, 4);
      static uint8_t g_bd_flat_SteamNetworkingSockets013_GetDetailedConnectionStatus_pszBuf_buf[BD_WIRE_OUT_BUFFER_MAX_BYTES];
      uint32_t cap_pszBuf = 0;
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&cap_pszBuf, arg + (0u + 4), 4);
      if (cap_pszBuf > BD_WIRE_OUT_BUFFER_MAX_BYTES) cap_pszBuf = BD_WIRE_OUT_BUFFER_MAX_BYTES;
      if (respCap < 8) { *respLen = 0; return 1; }
      if (cap_pszBuf > respCap - 8) cap_pszBuf = (uint32_t)(respCap - 8); // response must fit the scratch
      memset(g_bd_flat_SteamNetworkingSockets013_GetDetailedConnectionStatus_pszBuf_buf, 0, cap_pszBuf); // no earlier call's bytes cross into the game (53-17 WR-04)
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_cbBuf; memcpy(&arg_cbBuf, arg + ((0u + 4) + 4), 4);
      if ((int64_t)arg_cbBuf < 0 || (int64_t)arg_cbBuf > (int64_t)cap_pszBuf) arg_cbBuf = (int32_t)cap_pszBuf;
      int32_t __ret = g_bd_flat_SteamNetworkingSockets013_GetDetailedConnectionStatus(g_bd_self_steamnetworkingsockets013, arg_hConn, g_bd_flat_SteamNetworkingSockets013_GetDetailedConnectionStatus_pszBuf_buf, arg_cbBuf);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      uint32_t outLen_pszBuf = cap_pszBuf;
      memcpy(resp + 4, &outLen_pszBuf, 4);
      memcpy(resp + 4 + 4, g_bd_flat_SteamNetworkingSockets013_GetDetailedConnectionStatus_pszBuf_buf, outLen_pszBuf);
      *respLen = 4 + 4 + outLen_pszBuf;
      return 0;
    }
    case (((uint32_t)70) << 16 | 18u): { // SteamNetworkingSockets013.GetListenSocketAddress
      if (g_bd_flat_SteamNetworkingSockets013_GetListenSocketAddress == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hSocket; memcpy(&arg_hSocket, arg + 0u, 4);
      uint8_t arg_address_buf[18];
      memset(arg_address_buf, 0, 18);
      int __ret = g_bd_flat_SteamNetworkingSockets013_GetListenSocketAddress(g_bd_self_steamnetworkingsockets013, arg_hSocket, arg_address_buf);
      if (respCap < 23) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      uint32_t respEnd = 4;
      resp[respEnd] = 1; memcpy(resp + respEnd + 1, arg_address_buf, 18); respEnd += 1 + 18;
      *respLen = respEnd;
      return 0;
    }
    case (((uint32_t)70) << 16 | 19u): { // SteamNetworkingSockets013.CreateSocketPair
      if (g_bd_flat_SteamNetworkingSockets013_CreateSocketPair == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t arg_pOutConnection1 = 0;
      uint32_t arg_pOutConnection2 = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int arg_bUseNetworkLoopback; memcpy(&arg_bUseNetworkLoopback, arg + 0u, 4);
      uint8_t arg_pPeerIdentity1_buf[136];
      const void *arg_pPeerIdentity1 = NULL;
      uint32_t arg_pPeerIdentity1_present = 0;
      if (argLen < (0u + 4) + 1) { *respLen = 0; return 1; }
      arg_pPeerIdentity1_present = arg[(0u + 4)];
      if (arg_pPeerIdentity1_present > 1) { *respLen = 0; return 1; }
      if (arg_pPeerIdentity1_present == 1) {
        if ((uint64_t)argLen < (uint64_t)((0u + 4)) + 1u + 136u) { *respLen = 0; return 1; }
        memcpy(arg_pPeerIdentity1_buf, arg + (0u + 4) + 1, 136);
        arg_pPeerIdentity1 = arg_pPeerIdentity1_buf;
      }
      uint8_t arg_pPeerIdentity2_buf[136];
      const void *arg_pPeerIdentity2 = NULL;
      uint32_t arg_pPeerIdentity2_present = 0;
      if (argLen < ((0u + 4) + 1 + arg_pPeerIdentity1_present * 136u) + 1) { *respLen = 0; return 1; }
      arg_pPeerIdentity2_present = arg[((0u + 4) + 1 + arg_pPeerIdentity1_present * 136u)];
      if (arg_pPeerIdentity2_present > 1) { *respLen = 0; return 1; }
      if (arg_pPeerIdentity2_present == 1) {
        if ((uint64_t)argLen < (uint64_t)(((0u + 4) + 1 + arg_pPeerIdentity1_present * 136u)) + 1u + 136u) { *respLen = 0; return 1; }
        memcpy(arg_pPeerIdentity2_buf, arg + ((0u + 4) + 1 + arg_pPeerIdentity1_present * 136u) + 1, 136);
        arg_pPeerIdentity2 = arg_pPeerIdentity2_buf;
      }
      int __ret = g_bd_flat_SteamNetworkingSockets013_CreateSocketPair(g_bd_self_steamnetworkingsockets013, &arg_pOutConnection1, &arg_pOutConnection2, arg_bUseNetworkLoopback, arg_pPeerIdentity1, arg_pPeerIdentity2);
      if (respCap < 12) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pOutConnection1, 4);
      memcpy(resp + 8, &arg_pOutConnection2, 4);
      *respLen = 12;
      return 0;
    }
    case (((uint32_t)70) << 16 | 20u): { // SteamNetworkingSockets013.ConfigureConnectionLanes
      if (g_bd_flat_SteamNetworkingSockets013_ConfigureConnectionLanes == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_configure_lanes
        if (gl_net_configure_lanes(g_bd_self_steamnetworkingsockets013, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)70) << 16 | 21u): { // SteamNetworkingSockets013.GetIdentity
      if (g_bd_flat_SteamNetworkingSockets013_GetIdentity == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint8_t arg_pIdentity_buf[136];
      memset(arg_pIdentity_buf, 0, 136);
      int __ret = g_bd_flat_SteamNetworkingSockets013_GetIdentity(g_bd_self_steamnetworkingsockets013, arg_pIdentity_buf);
      if (respCap < 141) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      uint32_t respEnd = 4;
      resp[respEnd] = 1; memcpy(resp + respEnd + 1, arg_pIdentity_buf, 136); respEnd += 1 + 136;
      *respLen = respEnd;
      return 0;
    }
    case (((uint32_t)70) << 16 | 22u): { // SteamNetworkingSockets013.InitAuthentication
      if (g_bd_flat_SteamNetworkingSockets013_InitAuthentication == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamNetworkingSockets013_InitAuthentication(g_bd_self_steamnetworkingsockets013);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)70) << 16 | 23u): { // SteamNetworkingSockets013.GetAuthenticationStatus
      if (g_bd_flat_SteamNetworkingSockets013_GetAuthenticationStatus == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint8_t arg_pDetails_buf[260];
      memset(arg_pDetails_buf, 0, 260);
      uint32_t __ret = g_bd_flat_SteamNetworkingSockets013_GetAuthenticationStatus(g_bd_self_steamnetworkingsockets013, arg_pDetails_buf);
      if (respCap < 265) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      uint32_t respEnd = 4;
      resp[respEnd] = 1; memcpy(resp + respEnd + 1, arg_pDetails_buf, 260); respEnd += 1 + 260;
      *respLen = respEnd;
      return 0;
    }
    case (((uint32_t)70) << 16 | 24u): { // SteamNetworkingSockets013.CreatePollGroup
      if (g_bd_flat_SteamNetworkingSockets013_CreatePollGroup == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamNetworkingSockets013_CreatePollGroup(g_bd_self_steamnetworkingsockets013);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)70) << 16 | 25u): { // SteamNetworkingSockets013.DestroyPollGroup
      if (g_bd_flat_SteamNetworkingSockets013_DestroyPollGroup == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_nets_destroy_poll_group
        if (gl_nets_destroy_poll_group(g_bd_self_steamnetworkingsockets013, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)70) << 16 | 26u): { // SteamNetworkingSockets013.SetConnectionPollGroup
      if (g_bd_flat_SteamNetworkingSockets013_SetConnectionPollGroup == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hConn; memcpy(&arg_hConn, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hPollGroup; memcpy(&arg_hPollGroup, arg + (0u + 4), 4);
      int __ret = g_bd_flat_SteamNetworkingSockets013_SetConnectionPollGroup(g_bd_self_steamnetworkingsockets013, arg_hConn, arg_hPollGroup);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)70) << 16 | 27u): { // SteamNetworkingSockets013.ReceiveMessagesOnPollGroup
      if (g_bd_flat_SteamNetworkingSockets013_ReceiveMessagesOnPollGroup == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_receive_messages_pg
        if (gl_net_receive_messages_pg(g_bd_self_steamnetworkingsockets013, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)70) << 16 | 40u): { // SteamNetworkingSockets013.ResetIdentity
      if (g_bd_flat_SteamNetworkingSockets013_ResetIdentity == NULL || g_bd_self_steamnetworkingsockets013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint8_t arg_pIdentity_buf[136];
      const void *arg_pIdentity = NULL;
      uint32_t arg_pIdentity_present = 0;
      if (argLen < 0u + 1) { *respLen = 0; return 1; }
      arg_pIdentity_present = arg[0u];
      if (arg_pIdentity_present > 1) { *respLen = 0; return 1; }
      if (arg_pIdentity_present == 1) {
        if ((uint64_t)argLen < (uint64_t)(0u) + 1u + 136u) { *respLen = 0; return 1; }
        memcpy(arg_pIdentity_buf, arg + 0u + 1, 136);
        arg_pIdentity = arg_pIdentity_buf;
      }
      g_bd_flat_SteamNetworkingSockets013_ResetIdentity(g_bd_self_steamnetworkingsockets013, arg_pIdentity);
      *respLen = 0; return 0;
    }
    case (((uint32_t)71) << 16 | 1u): { // SteamNetworkingUtils004.GetRelayNetworkStatus
      if (g_bd_flat_SteamNetworkingUtils004_GetRelayNetworkStatus == NULL || g_bd_self_steamnetworkingutils004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint8_t arg_pDetails_buf[272];
      memset(arg_pDetails_buf, 0, 272);
      uint32_t __ret = g_bd_flat_SteamNetworkingUtils004_GetRelayNetworkStatus(g_bd_self_steamnetworkingutils004, arg_pDetails_buf);
      if (respCap < 277) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      uint32_t respEnd = 4;
      resp[respEnd] = 1; memcpy(resp + respEnd + 1, arg_pDetails_buf, 272); respEnd += 1 + 272;
      *respLen = respEnd;
      return 0;
    }
    case (((uint32_t)71) << 16 | 2u): { // SteamNetworkingUtils004.GetLocalPingLocation
      if (g_bd_flat_SteamNetworkingUtils004_GetLocalPingLocation == NULL || g_bd_self_steamnetworkingutils004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_get_local_ping_location
        if (gl_net_get_local_ping_location(g_bd_self_steamnetworkingutils004, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)71) << 16 | 3u): { // SteamNetworkingUtils004.EstimatePingTimeBetweenTwoLocations
      if (g_bd_flat_SteamNetworkingUtils004_EstimatePingTimeBetweenTwoLocations == NULL || g_bd_self_steamnetworkingutils004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint8_t arg_location1_buf[512];
      const void *arg_location1 = NULL;
      uint32_t arg_location1_present = 0;
      if (argLen < 0u + 1) { *respLen = 0; return 1; }
      arg_location1_present = arg[0u];
      if (arg_location1_present > 1) { *respLen = 0; return 1; }
      if (arg_location1_present == 1) {
        if ((uint64_t)argLen < (uint64_t)(0u) + 1u + 512u) { *respLen = 0; return 1; }
        memcpy(arg_location1_buf, arg + 0u + 1, 512);
        arg_location1 = arg_location1_buf;
      }
      uint8_t arg_location2_buf[512];
      const void *arg_location2 = NULL;
      uint32_t arg_location2_present = 0;
      if (argLen < (0u + 1 + arg_location1_present * 512u) + 1) { *respLen = 0; return 1; }
      arg_location2_present = arg[(0u + 1 + arg_location1_present * 512u)];
      if (arg_location2_present > 1) { *respLen = 0; return 1; }
      if (arg_location2_present == 1) {
        if ((uint64_t)argLen < (uint64_t)((0u + 1 + arg_location1_present * 512u)) + 1u + 512u) { *respLen = 0; return 1; }
        memcpy(arg_location2_buf, arg + (0u + 1 + arg_location1_present * 512u) + 1, 512);
        arg_location2 = arg_location2_buf;
      }
      int32_t __ret = g_bd_flat_SteamNetworkingUtils004_EstimatePingTimeBetweenTwoLocations(g_bd_self_steamnetworkingutils004, arg_location1, arg_location2);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)71) << 16 | 4u): { // SteamNetworkingUtils004.EstimatePingTimeFromLocalHost
      if (g_bd_flat_SteamNetworkingUtils004_EstimatePingTimeFromLocalHost == NULL || g_bd_self_steamnetworkingutils004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint8_t arg_remoteLocation_buf[512];
      const void *arg_remoteLocation = NULL;
      uint32_t arg_remoteLocation_present = 0;
      if (argLen < 0u + 1) { *respLen = 0; return 1; }
      arg_remoteLocation_present = arg[0u];
      if (arg_remoteLocation_present > 1) { *respLen = 0; return 1; }
      if (arg_remoteLocation_present == 1) {
        if ((uint64_t)argLen < (uint64_t)(0u) + 1u + 512u) { *respLen = 0; return 1; }
        memcpy(arg_remoteLocation_buf, arg + 0u + 1, 512);
        arg_remoteLocation = arg_remoteLocation_buf;
      }
      int32_t __ret = g_bd_flat_SteamNetworkingUtils004_EstimatePingTimeFromLocalHost(g_bd_self_steamnetworkingutils004, arg_remoteLocation);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)71) << 16 | 5u): { // SteamNetworkingUtils004.ConvertPingLocationToString
      if (g_bd_flat_SteamNetworkingUtils004_ConvertPingLocationToString == NULL || g_bd_self_steamnetworkingutils004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_convert_ping_location
        if (gl_net_convert_ping_location(g_bd_self_steamnetworkingutils004, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)71) << 16 | 6u): { // SteamNetworkingUtils004.ParsePingLocationString
      if (g_bd_flat_SteamNetworkingUtils004_ParsePingLocationString == NULL || g_bd_self_steamnetworkingutils004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_SteamNetworkingUtils004_ParsePingLocationString_pszString_buf[4096 + 1];
      const char *arg_pszString = NULL;
      uint32_t arg_pszString_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pszString_len, arg + 0u, 4);
      if (arg_pszString_len != 0xFFFFFFFFu) {
        if (arg_pszString_len > 4096 || argLen < 0u + 4 + arg_pszString_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamNetworkingUtils004_ParsePingLocationString_pszString_buf, arg + 0u + 4, arg_pszString_len);
        g_bd_flat_SteamNetworkingUtils004_ParsePingLocationString_pszString_buf[arg_pszString_len] = '\0';
        arg_pszString = g_bd_flat_SteamNetworkingUtils004_ParsePingLocationString_pszString_buf;
      } else {
        arg_pszString_len = 0;
      }
      uint8_t arg_pLocation_buf[512];
      memset(arg_pLocation_buf, 0, 512);
      int __ret = g_bd_flat_SteamNetworkingUtils004_ParsePingLocationString(g_bd_self_steamnetworkingutils004, arg_pszString, arg_pLocation_buf);
      if (respCap < 517) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      uint32_t respEnd = 4;
      resp[respEnd] = 1; memcpy(resp + respEnd + 1, arg_pLocation_buf, 512); respEnd += 1 + 512;
      *respLen = respEnd;
      return 0;
    }
    case (((uint32_t)71) << 16 | 7u): { // SteamNetworkingUtils004.CheckPingDataUpToDate
      if (g_bd_flat_SteamNetworkingUtils004_CheckPingDataUpToDate == NULL || g_bd_self_steamnetworkingutils004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_check_ping_data
        if (gl_net_check_ping_data(g_bd_self_steamnetworkingutils004, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)71) << 16 | 8u): { // SteamNetworkingUtils004.GetPingToDataCenter
      if (g_bd_flat_SteamNetworkingUtils004_GetPingToDataCenter == NULL || g_bd_self_steamnetworkingutils004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_popID; memcpy(&arg_popID, arg + 0u, 4);
      uint32_t arg_pViaRelayPoP = 0;
      int32_t __ret = g_bd_flat_SteamNetworkingUtils004_GetPingToDataCenter(g_bd_self_steamnetworkingutils004, arg_popID, &arg_pViaRelayPoP);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pViaRelayPoP, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)71) << 16 | 9u): { // SteamNetworkingUtils004.GetDirectPingToPOP
      if (g_bd_flat_SteamNetworkingUtils004_GetDirectPingToPOP == NULL || g_bd_self_steamnetworkingutils004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_popID; memcpy(&arg_popID, arg + 0u, 4);
      int32_t __ret = g_bd_flat_SteamNetworkingUtils004_GetDirectPingToPOP(g_bd_self_steamnetworkingutils004, arg_popID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)71) << 16 | 10u): { // SteamNetworkingUtils004.GetPOPCount
      if (g_bd_flat_SteamNetworkingUtils004_GetPOPCount == NULL || g_bd_self_steamnetworkingutils004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_SteamNetworkingUtils004_GetPOPCount(g_bd_self_steamnetworkingutils004);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)71) << 16 | 11u): { // SteamNetworkingUtils004.GetPOPList
      if (g_bd_flat_SteamNetworkingUtils004_GetPOPList == NULL || g_bd_self_steamnetworkingutils004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_get_pop_list
        if (gl_net_get_pop_list(g_bd_self_steamnetworkingutils004, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)71) << 16 | 12u): { // SteamNetworkingUtils004.GetLocalTimestamp
      if (g_bd_flat_SteamNetworkingUtils004_GetLocalTimestamp == NULL || g_bd_self_steamnetworkingutils004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int64_t __ret = g_bd_flat_SteamNetworkingUtils004_GetLocalTimestamp(g_bd_self_steamnetworkingutils004);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 8);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)71) << 16 | 14u): { // SteamNetworkingUtils004.GetIPv4FakeIPType
      if (g_bd_flat_SteamNetworkingUtils004_GetIPv4FakeIPType == NULL || g_bd_self_steamnetworkingutils004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nIPv4; memcpy(&arg_nIPv4, arg + 0u, 4);
      uint32_t __ret = g_bd_flat_SteamNetworkingUtils004_GetIPv4FakeIPType(g_bd_self_steamnetworkingutils004, arg_nIPv4);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)71) << 16 | 15u): { // SteamNetworkingUtils004.GetRealIdentityForFakeIP
      if (g_bd_flat_SteamNetworkingUtils004_GetRealIdentityForFakeIP == NULL || g_bd_self_steamnetworkingutils004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint8_t arg_fakeIP_buf[18];
      const void *arg_fakeIP = NULL;
      uint32_t arg_fakeIP_present = 0;
      if (argLen < 0u + 1) { *respLen = 0; return 1; }
      arg_fakeIP_present = arg[0u];
      if (arg_fakeIP_present > 1) { *respLen = 0; return 1; }
      if (arg_fakeIP_present == 1) {
        if ((uint64_t)argLen < (uint64_t)(0u) + 1u + 18u) { *respLen = 0; return 1; }
        memcpy(arg_fakeIP_buf, arg + 0u + 1, 18);
        arg_fakeIP = arg_fakeIP_buf;
      }
      uint8_t arg_pOutRealIdentity_buf[136];
      memset(arg_pOutRealIdentity_buf, 0, 136);
      uint32_t __ret = g_bd_flat_SteamNetworkingUtils004_GetRealIdentityForFakeIP(g_bd_self_steamnetworkingutils004, arg_fakeIP, arg_pOutRealIdentity_buf);
      if (respCap < 141) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      uint32_t respEnd = 4;
      resp[respEnd] = 1; memcpy(resp + respEnd + 1, arg_pOutRealIdentity_buf, 136); respEnd += 1 + 136;
      *respLen = respEnd;
      return 0;
    }
    case (((uint32_t)71) << 16 | 16u): { // SteamNetworkingUtils004.SetConfigValue
      if (g_bd_flat_SteamNetworkingUtils004_SetConfigValue == NULL || g_bd_self_steamnetworkingutils004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_set_config_value
        if (gl_net_set_config_value(g_bd_self_steamnetworkingutils004, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)71) << 16 | 17u): { // SteamNetworkingUtils004.GetConfigValue
      if (g_bd_flat_SteamNetworkingUtils004_GetConfigValue == NULL || g_bd_self_steamnetworkingutils004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_get_config_value
        if (gl_net_get_config_value(g_bd_self_steamnetworkingutils004, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)71) << 16 | 18u): { // SteamNetworkingUtils004.GetConfigValueInfo
      if (g_bd_flat_SteamNetworkingUtils004_GetConfigValueInfo == NULL || g_bd_self_steamnetworkingutils004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_get_config_value_info
        if (gl_net_get_config_value_info(g_bd_self_steamnetworkingutils004, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)71) << 16 | 19u): { // SteamNetworkingUtils004.IterateGenericEditableConfigValues
      if (g_bd_flat_SteamNetworkingUtils004_IterateGenericEditableConfigValues == NULL || g_bd_self_steamnetworkingutils004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_eCurrent; memcpy(&arg_eCurrent, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int arg_bEnumerateDevVars; memcpy(&arg_bEnumerateDevVars, arg + (0u + 4), 4);
      uint32_t __ret = g_bd_flat_SteamNetworkingUtils004_IterateGenericEditableConfigValues(g_bd_self_steamnetworkingutils004, arg_eCurrent, arg_bEnumerateDevVars);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)72) << 16 | 0u): { // SteamNetworkingMessages002.SendMessageToUser
      if (g_bd_flat_SteamNetworkingMessages002_SendMessageToUser == NULL || g_bd_self_steamnetworkingmessages002 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint8_t arg_identityRemote_buf[136];
      const void *arg_identityRemote = NULL;
      uint32_t arg_identityRemote_present = 0;
      if (argLen < 0u + 1) { *respLen = 0; return 1; }
      arg_identityRemote_present = arg[0u];
      if (arg_identityRemote_present > 1) { *respLen = 0; return 1; }
      if (arg_identityRemote_present == 1) {
        if ((uint64_t)argLen < (uint64_t)(0u) + 1u + 136u) { *respLen = 0; return 1; }
        memcpy(arg_identityRemote_buf, arg + 0u + 1, 136);
        arg_identityRemote = arg_identityRemote_buf;
      }
      static uint8_t g_bd_flat_SteamNetworkingMessages002_SendMessageToUser_pubData_buf[61440];
      uint32_t arg_pubData_len = 0;
      if (argLen < (0u + 1 + arg_identityRemote_present * 136u) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pubData_len, arg + (0u + 1 + arg_identityRemote_present * 136u), 4);
      if (arg_pubData_len > 61440) { gl_net_evidence(1, GL_NET_KIND_OVERSIZE, GL_NET_IFACE_MESSAGES, 0, arg_pubData_len, GL_NET_PATH_UNKNOWN); *respLen = 0; return 1; } // oversize refusal is NET evidence -- 58-10
      if (arg_pubData_len > 61440 || (uint64_t)argLen < (uint64_t)((0u + 1 + arg_identityRemote_present * 136u)) + 4u + arg_pubData_len) { *respLen = 0; return 1; } // in-buffer past cap or argLen -- T-58-16
      memcpy(g_bd_flat_SteamNetworkingMessages002_SendMessageToUser_pubData_buf, arg + (0u + 1 + arg_identityRemote_present * 136u) + 4, arg_pubData_len);
      const void *arg_pubData = g_bd_flat_SteamNetworkingMessages002_SendMessageToUser_pubData_buf;
      if (argLen < ((0u + 1 + arg_identityRemote_present * 136u) + 4 + arg_pubData_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_cubData; memcpy(&arg_cubData, arg + ((0u + 1 + arg_identityRemote_present * 136u) + 4 + arg_pubData_len), 4);
      if (argLen < (((0u + 1 + arg_identityRemote_present * 136u) + 4 + arg_pubData_len) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_nSendFlags; memcpy(&arg_nSendFlags, arg + (((0u + 1 + arg_identityRemote_present * 136u) + 4 + arg_pubData_len) + 4), 4);
      if (argLen < ((((0u + 1 + arg_identityRemote_present * 136u) + 4 + arg_pubData_len) + 4) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_nRemoteChannel; memcpy(&arg_nRemoteChannel, arg + ((((0u + 1 + arg_identityRemote_present * 136u) + 4 + arg_pubData_len) + 4) + 4), 4);
      if ((int64_t)arg_cubData != (int64_t)arg_pubData_len) { *respLen = 0; return 1; } // lenParam must equal the bytes sent -- T-58-16
      uint32_t __ret = g_bd_flat_SteamNetworkingMessages002_SendMessageToUser(g_bd_self_steamnetworkingmessages002, arg_identityRemote, arg_pubData, arg_cubData, arg_nSendFlags, arg_nRemoteChannel);
      if (__ret > 0) gl_net_evidence(1, GL_NET_KIND_SEND, GL_NET_IFACE_MESSAGES, 0, (uint32_t)__ret, GL_NET_PATH_UNKNOWN);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)72) << 16 | 1u): { // SteamNetworkingMessages002.ReceiveMessagesOnChannel
      if (g_bd_flat_SteamNetworkingMessages002_ReceiveMessagesOnChannel == NULL || g_bd_self_steamnetworkingmessages002 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_receive_messages_ch
        if (gl_net_receive_messages_ch(g_bd_self_steamnetworkingmessages002, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)72) << 16 | 2u): { // SteamNetworkingMessages002.AcceptSessionWithUser
      if (g_bd_flat_SteamNetworkingMessages002_AcceptSessionWithUser == NULL || g_bd_self_steamnetworkingmessages002 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint8_t arg_identityRemote_buf[136];
      const void *arg_identityRemote = NULL;
      uint32_t arg_identityRemote_present = 0;
      if (argLen < 0u + 1) { *respLen = 0; return 1; }
      arg_identityRemote_present = arg[0u];
      if (arg_identityRemote_present > 1) { *respLen = 0; return 1; }
      if (arg_identityRemote_present == 1) {
        if ((uint64_t)argLen < (uint64_t)(0u) + 1u + 136u) { *respLen = 0; return 1; }
        memcpy(arg_identityRemote_buf, arg + 0u + 1, 136);
        arg_identityRemote = arg_identityRemote_buf;
      }
      int __ret = g_bd_flat_SteamNetworkingMessages002_AcceptSessionWithUser(g_bd_self_steamnetworkingmessages002, arg_identityRemote);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)72) << 16 | 3u): { // SteamNetworkingMessages002.CloseSessionWithUser
      if (g_bd_flat_SteamNetworkingMessages002_CloseSessionWithUser == NULL || g_bd_self_steamnetworkingmessages002 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint8_t arg_identityRemote_buf[136];
      const void *arg_identityRemote = NULL;
      uint32_t arg_identityRemote_present = 0;
      if (argLen < 0u + 1) { *respLen = 0; return 1; }
      arg_identityRemote_present = arg[0u];
      if (arg_identityRemote_present > 1) { *respLen = 0; return 1; }
      if (arg_identityRemote_present == 1) {
        if ((uint64_t)argLen < (uint64_t)(0u) + 1u + 136u) { *respLen = 0; return 1; }
        memcpy(arg_identityRemote_buf, arg + 0u + 1, 136);
        arg_identityRemote = arg_identityRemote_buf;
      }
      int __ret = g_bd_flat_SteamNetworkingMessages002_CloseSessionWithUser(g_bd_self_steamnetworkingmessages002, arg_identityRemote);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)72) << 16 | 4u): { // SteamNetworkingMessages002.CloseChannelWithUser
      if (g_bd_flat_SteamNetworkingMessages002_CloseChannelWithUser == NULL || g_bd_self_steamnetworkingmessages002 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint8_t arg_identityRemote_buf[136];
      const void *arg_identityRemote = NULL;
      uint32_t arg_identityRemote_present = 0;
      if (argLen < 0u + 1) { *respLen = 0; return 1; }
      arg_identityRemote_present = arg[0u];
      if (arg_identityRemote_present > 1) { *respLen = 0; return 1; }
      if (arg_identityRemote_present == 1) {
        if ((uint64_t)argLen < (uint64_t)(0u) + 1u + 136u) { *respLen = 0; return 1; }
        memcpy(arg_identityRemote_buf, arg + 0u + 1, 136);
        arg_identityRemote = arg_identityRemote_buf;
      }
      if (argLen < (0u + 1 + arg_identityRemote_present * 136u) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_nLocalChannel; memcpy(&arg_nLocalChannel, arg + (0u + 1 + arg_identityRemote_present * 136u), 4);
      int __ret = g_bd_flat_SteamNetworkingMessages002_CloseChannelWithUser(g_bd_self_steamnetworkingmessages002, arg_identityRemote, arg_nLocalChannel);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)72) << 16 | 5u): { // SteamNetworkingMessages002.GetSessionConnectionInfo
      if (g_bd_flat_SteamNetworkingMessages002_GetSessionConnectionInfo == NULL || g_bd_self_steamnetworkingmessages002 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_session_info
        if (gl_net_session_info(g_bd_self_steamnetworkingmessages002, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)73) << 16 | 0u): { // SteamNetworkingSockets012.CreateListenSocketIP
      if (g_bd_flat_SteamNetworkingSockets012_CreateListenSocketIP == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_sockets_open
        if (gl_net_sockets_open(g_bd_self_steamnetworkingsockets012, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)73) << 16 | 1u): { // SteamNetworkingSockets012.ConnectByIPAddress
      if (g_bd_flat_SteamNetworkingSockets012_ConnectByIPAddress == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_sockets_open
        if (gl_net_sockets_open(g_bd_self_steamnetworkingsockets012, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)73) << 16 | 2u): { // SteamNetworkingSockets012.CreateListenSocketP2P
      if (g_bd_flat_SteamNetworkingSockets012_CreateListenSocketP2P == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_sockets_open
        if (gl_net_sockets_open(g_bd_self_steamnetworkingsockets012, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)73) << 16 | 3u): { // SteamNetworkingSockets012.ConnectP2P
      if (g_bd_flat_SteamNetworkingSockets012_ConnectP2P == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_sockets_open
        if (gl_net_sockets_open(g_bd_self_steamnetworkingsockets012, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)73) << 16 | 4u): { // SteamNetworkingSockets012.AcceptConnection
      if (g_bd_flat_SteamNetworkingSockets012_AcceptConnection == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hConn; memcpy(&arg_hConn, arg + 0u, 4);
      uint32_t __ret = g_bd_flat_SteamNetworkingSockets012_AcceptConnection(g_bd_self_steamnetworkingsockets012, arg_hConn);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)73) << 16 | 5u): { // SteamNetworkingSockets012.CloseConnection
      if (g_bd_flat_SteamNetworkingSockets012_CloseConnection == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_nets_close_connection
        if (gl_nets_close_connection(g_bd_self_steamnetworkingsockets012, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)73) << 16 | 6u): { // SteamNetworkingSockets012.CloseListenSocket
      if (g_bd_flat_SteamNetworkingSockets012_CloseListenSocket == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hSocket; memcpy(&arg_hSocket, arg + 0u, 4);
      int __ret = g_bd_flat_SteamNetworkingSockets012_CloseListenSocket(g_bd_self_steamnetworkingsockets012, arg_hSocket);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)73) << 16 | 7u): { // SteamNetworkingSockets012.SetConnectionUserData
      if (g_bd_flat_SteamNetworkingSockets012_SetConnectionUserData == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hPeer; memcpy(&arg_hPeer, arg + 0u, 4);
      if (argLen < (0u + 4) + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int64_t arg_nUserData; memcpy(&arg_nUserData, arg + (0u + 4), 8);
      int __ret = g_bd_flat_SteamNetworkingSockets012_SetConnectionUserData(g_bd_self_steamnetworkingsockets012, arg_hPeer, arg_nUserData);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)73) << 16 | 8u): { // SteamNetworkingSockets012.GetConnectionUserData
      if (g_bd_flat_SteamNetworkingSockets012_GetConnectionUserData == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hPeer; memcpy(&arg_hPeer, arg + 0u, 4);
      int64_t __ret = g_bd_flat_SteamNetworkingSockets012_GetConnectionUserData(g_bd_self_steamnetworkingsockets012, arg_hPeer);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 8);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)73) << 16 | 9u): { // SteamNetworkingSockets012.SetConnectionName
      if (g_bd_flat_SteamNetworkingSockets012_SetConnectionName == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hPeer; memcpy(&arg_hPeer, arg + 0u, 4);
      static char g_bd_flat_SteamNetworkingSockets012_SetConnectionName_pszName_buf[4096 + 1];
      const char *arg_pszName = NULL;
      uint32_t arg_pszName_len = 0;
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pszName_len, arg + (0u + 4), 4);
      if (arg_pszName_len != 0xFFFFFFFFu) {
        if (arg_pszName_len > 4096 || argLen < (0u + 4) + 4 + arg_pszName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamNetworkingSockets012_SetConnectionName_pszName_buf, arg + (0u + 4) + 4, arg_pszName_len);
        g_bd_flat_SteamNetworkingSockets012_SetConnectionName_pszName_buf[arg_pszName_len] = '\0';
        arg_pszName = g_bd_flat_SteamNetworkingSockets012_SetConnectionName_pszName_buf;
      } else {
        arg_pszName_len = 0;
      }
      g_bd_flat_SteamNetworkingSockets012_SetConnectionName(g_bd_self_steamnetworkingsockets012, arg_hPeer, arg_pszName);
      *respLen = 0; return 0;
    }
    case (((uint32_t)73) << 16 | 10u): { // SteamNetworkingSockets012.GetConnectionName
      if (g_bd_flat_SteamNetworkingSockets012_GetConnectionName == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hPeer; memcpy(&arg_hPeer, arg + 0u, 4);
      static uint8_t g_bd_flat_SteamNetworkingSockets012_GetConnectionName_pszName_buf[BD_WIRE_OUT_BUFFER_MAX_BYTES];
      uint32_t cap_pszName = 0;
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&cap_pszName, arg + (0u + 4), 4);
      if (cap_pszName > BD_WIRE_OUT_BUFFER_MAX_BYTES) cap_pszName = BD_WIRE_OUT_BUFFER_MAX_BYTES;
      if (respCap < 8) { *respLen = 0; return 1; }
      if (cap_pszName > respCap - 8) cap_pszName = (uint32_t)(respCap - 8); // response must fit the scratch
      memset(g_bd_flat_SteamNetworkingSockets012_GetConnectionName_pszName_buf, 0, cap_pszName); // no earlier call's bytes cross into the game (53-17 WR-04)
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_nMaxLen; memcpy(&arg_nMaxLen, arg + ((0u + 4) + 4), 4);
      if ((int64_t)arg_nMaxLen < 0 || (int64_t)arg_nMaxLen > (int64_t)cap_pszName) arg_nMaxLen = (int32_t)cap_pszName;
      int __ret = g_bd_flat_SteamNetworkingSockets012_GetConnectionName(g_bd_self_steamnetworkingsockets012, arg_hPeer, g_bd_flat_SteamNetworkingSockets012_GetConnectionName_pszName_buf, arg_nMaxLen);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      uint32_t outLen_pszName = cap_pszName;
      memcpy(resp + 4, &outLen_pszName, 4);
      memcpy(resp + 4 + 4, g_bd_flat_SteamNetworkingSockets012_GetConnectionName_pszName_buf, outLen_pszName);
      *respLen = 4 + 4 + outLen_pszName;
      return 0;
    }
    case (((uint32_t)73) << 16 | 11u): { // SteamNetworkingSockets012.SendMessageToConnection
      if (g_bd_flat_SteamNetworkingSockets012_SendMessageToConnection == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hConn; memcpy(&arg_hConn, arg + 0u, 4);
      static uint8_t g_bd_flat_SteamNetworkingSockets012_SendMessageToConnection_pData_buf[61440];
      uint32_t arg_pData_len = 0;
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pData_len, arg + (0u + 4), 4);
      if (arg_pData_len > 61440) { gl_net_evidence(1, GL_NET_KIND_OVERSIZE, GL_NET_IFACE_SOCKETS, 0, arg_pData_len, GL_NET_PATH_UNKNOWN); *respLen = 0; return 1; } // oversize refusal is NET evidence -- 58-10
      if (arg_pData_len > 61440 || (uint64_t)argLen < (uint64_t)((0u + 4)) + 4u + arg_pData_len) { *respLen = 0; return 1; } // in-buffer past cap or argLen -- T-58-16
      memcpy(g_bd_flat_SteamNetworkingSockets012_SendMessageToConnection_pData_buf, arg + (0u + 4) + 4, arg_pData_len);
      const void *arg_pData = g_bd_flat_SteamNetworkingSockets012_SendMessageToConnection_pData_buf;
      if (argLen < ((0u + 4) + 4 + arg_pData_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_cbData; memcpy(&arg_cbData, arg + ((0u + 4) + 4 + arg_pData_len), 4);
      if (argLen < (((0u + 4) + 4 + arg_pData_len) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_nSendFlags; memcpy(&arg_nSendFlags, arg + (((0u + 4) + 4 + arg_pData_len) + 4), 4);
      uint64_t arg_pOutMessageNumber = 0;
      if ((int64_t)arg_cbData != (int64_t)arg_pData_len) { *respLen = 0; return 1; } // lenParam must equal the bytes sent -- T-58-16
      uint32_t __ret = g_bd_flat_SteamNetworkingSockets012_SendMessageToConnection(g_bd_self_steamnetworkingsockets012, arg_hConn, arg_pData, arg_cbData, arg_nSendFlags, &arg_pOutMessageNumber);
      if (__ret > 0) gl_net_evidence(1, GL_NET_KIND_SEND, GL_NET_IFACE_SOCKETS, 0, (uint32_t)__ret, GL_NET_PATH_UNKNOWN);
      if (respCap < 12) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pOutMessageNumber, 8);
      *respLen = 12;
      return 0;
    }
    case (((uint32_t)73) << 16 | 13u): { // SteamNetworkingSockets012.FlushMessagesOnConnection
      if (g_bd_flat_SteamNetworkingSockets012_FlushMessagesOnConnection == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hConn; memcpy(&arg_hConn, arg + 0u, 4);
      uint32_t __ret = g_bd_flat_SteamNetworkingSockets012_FlushMessagesOnConnection(g_bd_self_steamnetworkingsockets012, arg_hConn);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)73) << 16 | 14u): { // SteamNetworkingSockets012.ReceiveMessagesOnConnection
      if (g_bd_flat_SteamNetworkingSockets012_ReceiveMessagesOnConnection == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_receive_messages
        if (gl_net_receive_messages(g_bd_self_steamnetworkingsockets012, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)73) << 16 | 15u): { // SteamNetworkingSockets012.GetConnectionInfo
      if (g_bd_flat_SteamNetworkingSockets012_GetConnectionInfo == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_get_connection_info
        if (gl_net_get_connection_info(g_bd_self_steamnetworkingsockets012, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)73) << 16 | 16u): { // SteamNetworkingSockets012.GetConnectionRealTimeStatus
      if (g_bd_flat_SteamNetworkingSockets012_GetConnectionRealTimeStatus == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_rt_status
        if (gl_net_rt_status(g_bd_self_steamnetworkingsockets012, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)73) << 16 | 17u): { // SteamNetworkingSockets012.GetDetailedConnectionStatus
      if (g_bd_flat_SteamNetworkingSockets012_GetDetailedConnectionStatus == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hConn; memcpy(&arg_hConn, arg + 0u, 4);
      static uint8_t g_bd_flat_SteamNetworkingSockets012_GetDetailedConnectionStatus_pszBuf_buf[BD_WIRE_OUT_BUFFER_MAX_BYTES];
      uint32_t cap_pszBuf = 0;
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&cap_pszBuf, arg + (0u + 4), 4);
      if (cap_pszBuf > BD_WIRE_OUT_BUFFER_MAX_BYTES) cap_pszBuf = BD_WIRE_OUT_BUFFER_MAX_BYTES;
      if (respCap < 8) { *respLen = 0; return 1; }
      if (cap_pszBuf > respCap - 8) cap_pszBuf = (uint32_t)(respCap - 8); // response must fit the scratch
      memset(g_bd_flat_SteamNetworkingSockets012_GetDetailedConnectionStatus_pszBuf_buf, 0, cap_pszBuf); // no earlier call's bytes cross into the game (53-17 WR-04)
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_cbBuf; memcpy(&arg_cbBuf, arg + ((0u + 4) + 4), 4);
      if ((int64_t)arg_cbBuf < 0 || (int64_t)arg_cbBuf > (int64_t)cap_pszBuf) arg_cbBuf = (int32_t)cap_pszBuf;
      int32_t __ret = g_bd_flat_SteamNetworkingSockets012_GetDetailedConnectionStatus(g_bd_self_steamnetworkingsockets012, arg_hConn, g_bd_flat_SteamNetworkingSockets012_GetDetailedConnectionStatus_pszBuf_buf, arg_cbBuf);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      uint32_t outLen_pszBuf = cap_pszBuf;
      memcpy(resp + 4, &outLen_pszBuf, 4);
      memcpy(resp + 4 + 4, g_bd_flat_SteamNetworkingSockets012_GetDetailedConnectionStatus_pszBuf_buf, outLen_pszBuf);
      *respLen = 4 + 4 + outLen_pszBuf;
      return 0;
    }
    case (((uint32_t)73) << 16 | 18u): { // SteamNetworkingSockets012.GetListenSocketAddress
      if (g_bd_flat_SteamNetworkingSockets012_GetListenSocketAddress == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hSocket; memcpy(&arg_hSocket, arg + 0u, 4);
      uint8_t arg_address_buf[18];
      memset(arg_address_buf, 0, 18);
      int __ret = g_bd_flat_SteamNetworkingSockets012_GetListenSocketAddress(g_bd_self_steamnetworkingsockets012, arg_hSocket, arg_address_buf);
      if (respCap < 23) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      uint32_t respEnd = 4;
      resp[respEnd] = 1; memcpy(resp + respEnd + 1, arg_address_buf, 18); respEnd += 1 + 18;
      *respLen = respEnd;
      return 0;
    }
    case (((uint32_t)73) << 16 | 19u): { // SteamNetworkingSockets012.CreateSocketPair
      if (g_bd_flat_SteamNetworkingSockets012_CreateSocketPair == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t arg_pOutConnection1 = 0;
      uint32_t arg_pOutConnection2 = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int arg_bUseNetworkLoopback; memcpy(&arg_bUseNetworkLoopback, arg + 0u, 4);
      uint8_t arg_pIdentity1_buf[136];
      const void *arg_pIdentity1 = NULL;
      uint32_t arg_pIdentity1_present = 0;
      if (argLen < (0u + 4) + 1) { *respLen = 0; return 1; }
      arg_pIdentity1_present = arg[(0u + 4)];
      if (arg_pIdentity1_present > 1) { *respLen = 0; return 1; }
      if (arg_pIdentity1_present == 1) {
        if ((uint64_t)argLen < (uint64_t)((0u + 4)) + 1u + 136u) { *respLen = 0; return 1; }
        memcpy(arg_pIdentity1_buf, arg + (0u + 4) + 1, 136);
        arg_pIdentity1 = arg_pIdentity1_buf;
      }
      uint8_t arg_pIdentity2_buf[136];
      const void *arg_pIdentity2 = NULL;
      uint32_t arg_pIdentity2_present = 0;
      if (argLen < ((0u + 4) + 1 + arg_pIdentity1_present * 136u) + 1) { *respLen = 0; return 1; }
      arg_pIdentity2_present = arg[((0u + 4) + 1 + arg_pIdentity1_present * 136u)];
      if (arg_pIdentity2_present > 1) { *respLen = 0; return 1; }
      if (arg_pIdentity2_present == 1) {
        if ((uint64_t)argLen < (uint64_t)(((0u + 4) + 1 + arg_pIdentity1_present * 136u)) + 1u + 136u) { *respLen = 0; return 1; }
        memcpy(arg_pIdentity2_buf, arg + ((0u + 4) + 1 + arg_pIdentity1_present * 136u) + 1, 136);
        arg_pIdentity2 = arg_pIdentity2_buf;
      }
      int __ret = g_bd_flat_SteamNetworkingSockets012_CreateSocketPair(g_bd_self_steamnetworkingsockets012, &arg_pOutConnection1, &arg_pOutConnection2, arg_bUseNetworkLoopback, arg_pIdentity1, arg_pIdentity2);
      if (respCap < 12) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pOutConnection1, 4);
      memcpy(resp + 8, &arg_pOutConnection2, 4);
      *respLen = 12;
      return 0;
    }
    case (((uint32_t)73) << 16 | 20u): { // SteamNetworkingSockets012.ConfigureConnectionLanes
      if (g_bd_flat_SteamNetworkingSockets012_ConfigureConnectionLanes == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_configure_lanes
        if (gl_net_configure_lanes(g_bd_self_steamnetworkingsockets012, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)73) << 16 | 21u): { // SteamNetworkingSockets012.GetIdentity
      if (g_bd_flat_SteamNetworkingSockets012_GetIdentity == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint8_t arg_pIdentity_buf[136];
      memset(arg_pIdentity_buf, 0, 136);
      int __ret = g_bd_flat_SteamNetworkingSockets012_GetIdentity(g_bd_self_steamnetworkingsockets012, arg_pIdentity_buf);
      if (respCap < 141) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      uint32_t respEnd = 4;
      resp[respEnd] = 1; memcpy(resp + respEnd + 1, arg_pIdentity_buf, 136); respEnd += 1 + 136;
      *respLen = respEnd;
      return 0;
    }
    case (((uint32_t)73) << 16 | 22u): { // SteamNetworkingSockets012.InitAuthentication
      if (g_bd_flat_SteamNetworkingSockets012_InitAuthentication == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamNetworkingSockets012_InitAuthentication(g_bd_self_steamnetworkingsockets012);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)73) << 16 | 23u): { // SteamNetworkingSockets012.GetAuthenticationStatus
      if (g_bd_flat_SteamNetworkingSockets012_GetAuthenticationStatus == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint8_t arg_pDetails_buf[260];
      memset(arg_pDetails_buf, 0, 260);
      uint32_t __ret = g_bd_flat_SteamNetworkingSockets012_GetAuthenticationStatus(g_bd_self_steamnetworkingsockets012, arg_pDetails_buf);
      if (respCap < 265) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      uint32_t respEnd = 4;
      resp[respEnd] = 1; memcpy(resp + respEnd + 1, arg_pDetails_buf, 260); respEnd += 1 + 260;
      *respLen = respEnd;
      return 0;
    }
    case (((uint32_t)73) << 16 | 24u): { // SteamNetworkingSockets012.CreatePollGroup
      if (g_bd_flat_SteamNetworkingSockets012_CreatePollGroup == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamNetworkingSockets012_CreatePollGroup(g_bd_self_steamnetworkingsockets012);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)73) << 16 | 25u): { // SteamNetworkingSockets012.DestroyPollGroup
      if (g_bd_flat_SteamNetworkingSockets012_DestroyPollGroup == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_nets_destroy_poll_group
        if (gl_nets_destroy_poll_group(g_bd_self_steamnetworkingsockets012, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)73) << 16 | 26u): { // SteamNetworkingSockets012.SetConnectionPollGroup
      if (g_bd_flat_SteamNetworkingSockets012_SetConnectionPollGroup == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hConn; memcpy(&arg_hConn, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hPollGroup; memcpy(&arg_hPollGroup, arg + (0u + 4), 4);
      int __ret = g_bd_flat_SteamNetworkingSockets012_SetConnectionPollGroup(g_bd_self_steamnetworkingsockets012, arg_hConn, arg_hPollGroup);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)73) << 16 | 27u): { // SteamNetworkingSockets012.ReceiveMessagesOnPollGroup
      if (g_bd_flat_SteamNetworkingSockets012_ReceiveMessagesOnPollGroup == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      { uint32_t customLen = 0; // helperCustom gl_net_receive_messages_pg
        if (gl_net_receive_messages_pg(g_bd_self_steamnetworkingsockets012, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }
        *respLen = customLen; return 0; }
    }
    case (((uint32_t)73) << 16 | 40u): { // SteamNetworkingSockets012.ResetIdentity
      if (g_bd_flat_SteamNetworkingSockets012_ResetIdentity == NULL || g_bd_self_steamnetworkingsockets012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint8_t arg_pIdentity_buf[136];
      const void *arg_pIdentity = NULL;
      uint32_t arg_pIdentity_present = 0;
      if (argLen < 0u + 1) { *respLen = 0; return 1; }
      arg_pIdentity_present = arg[0u];
      if (arg_pIdentity_present > 1) { *respLen = 0; return 1; }
      if (arg_pIdentity_present == 1) {
        if ((uint64_t)argLen < (uint64_t)(0u) + 1u + 136u) { *respLen = 0; return 1; }
        memcpy(arg_pIdentity_buf, arg + 0u + 1, 136);
        arg_pIdentity = arg_pIdentity_buf;
      }
      g_bd_flat_SteamNetworkingSockets012_ResetIdentity(g_bd_self_steamnetworkingsockets012, arg_pIdentity);
      *respLen = 0; return 0;
    }
    default:
      return 1; // T-51-23: unknown (ordinal, slot) pair -- never read
  }
}

#endif /* GAMELIB_BRIDGE_DISPATCH_H */
