/*
 * gamelib_cbqueue.h -- Phase 55 (55-03): bounded, allowlisted ring of Steam
 * callbacks captured by the bridge helper via manual dispatch, plus the
 * DRAIN wire encoder.
 *
 * Header-only with no dylib, socket, logging, I/O or allocation, so a
 * host-compiled harness can unit-test it. Included by bridge_helper.c.
 *
 * Wire (CONTROL slot 6 response blob):
 *   [u32 count]                                  count is 0 or 1
 *   if count == 1: [i32 iCallback][u32 cub][cub bytes]
 * Max blob = GL_CBQ_DRAIN_RESP_MAX_BYTES.
 *
 * Credential hygiene: callback 168 carries a web-API auth ticket. A slot is
 * zeroed on pop and on eviction; callers never log the bytes.
 *
 * Quick k51: callback 1101 (UserStatsReceived_t) is also allowlisted, as its
 * 24-byte MSVC pack(8) WIRE form (the Mac struct is 20 bytes, pack 4). The
 * pump never offers a raw Mac 1101; it goes through gl_stats_on_observed,
 * which repacks first. 1101 carries no credential.
 */
#ifndef GAMELIB_CBQUEUE_H
#define GAMELIB_CBQUEUE_H

#include <stdint.h>
#include <stddef.h>
#include <string.h>

#define GL_CBQ_ID_GET_TICKET_FOR_WEB_API_RESPONSE 168
#define GL_CBQ_ID_USER_STATS_RECEIVED 1101
#define GL_CBQ_ID_API_CALL_COMPLETED 703
#define GL_CBQ_MAX_PARAM_BYTES 2572
#define GL_CBQ_RING_SLOTS 32
#define GL_CBQ_PUMP_MAX_MSGS 64
#define GL_CBQ_DRAIN_RESP_MAX_BYTES (4 + 4 + 4 + GL_CBQ_MAX_PARAM_BYTES)

/* UserStatsReceived_t layouts, measured by meta/msvcCallbackLayout.ts
 * (USER_STATS_RECEIVED_LAYOUT; cross-pinned in msvcCallbackBaseLayout.test.ts).
 * Mac pack(4): gameID@0 eResult@8 steamID@12, size 20.
 * Windows (x64 and x86, pack 8): gameID@0 eResult@8 steamID@16, size 24. */
#define GL_CBQ_USR_MAC_SIZE 20
#define GL_CBQ_USR_WIN_OFF_GAMEID 0
#define GL_CBQ_USR_WIN_OFF_ERESULT 8
#define GL_CBQ_USR_WIN_OFF_STEAMID 16
#define GL_CBQ_USR_WIN_SIZE 24

/* SDK CallbackMsg_t is declared under pack(4). */
#pragma pack(push, 4)
typedef struct {
  int32_t m_hSteamUser;
  int32_t m_iCallback;
  uint8_t *m_pubParam;
  int32_t m_cubParam;
} gl_CallbackMsg_t;
#pragma pack(pop)

#if UINTPTR_MAX == 0xFFFFFFFFFFFFFFFFu
_Static_assert(offsetof(gl_CallbackMsg_t, m_iCallback) == 4, "m_iCallback offset");
_Static_assert(offsetof(gl_CallbackMsg_t, m_pubParam) == 8, "m_pubParam offset");
_Static_assert(offsetof(gl_CallbackMsg_t, m_cubParam) == 16, "m_cubParam offset");
#endif

#pragma pack(push, 4)
typedef struct {
  uint64_t m_nGameID;
  int32_t m_eResult;
  uint64_t m_steamIDUser;
} gl_UserStatsReceived_mac_t;

/* SteamAPICallCompleted_t, k_iCallback 703. */
typedef struct {
  uint64_t m_hAsyncCall;
  int32_t m_iCallback;
  uint32_t m_cubParam;
} gl_SteamAPICallCompleted_t;
#pragma pack(pop)

_Static_assert(offsetof(gl_UserStatsReceived_mac_t, m_eResult) == 8, "usr mac eResult");
_Static_assert(offsetof(gl_UserStatsReceived_mac_t, m_steamIDUser) == 12, "usr mac steamID");
_Static_assert(sizeof(gl_UserStatsReceived_mac_t) == GL_CBQ_USR_MAC_SIZE, "usr mac size");
_Static_assert(offsetof(gl_SteamAPICallCompleted_t, m_iCallback) == 8, "703 iCallback");
_Static_assert(offsetof(gl_SteamAPICallCompleted_t, m_cubParam) == 12, "703 cubParam");
_Static_assert(sizeof(gl_SteamAPICallCompleted_t) == 16, "703 size");

/* Phase 58 (58-07): relayed broadcast callbacks. Sizes are measured by
 * meta/msvcCallbackLayout.ts CALLBACK_LAYOUTS (58-02) and cross-pinned to it by
 * cbqueue.test.ts. MAC is what Mac Steam hands the pump, WIN the x64 MSVC wire
 * form the shim relays. */
#define GL_CBQ_ID_LOBBY_INVITE 503
#define GL_CBQ_ID_LOBBY_ENTER 504
#define GL_CBQ_ID_LOBBY_DATA_UPDATE 505
#define GL_CBQ_ID_LOBBY_CHAT_UPDATE 506
#define GL_CBQ_ID_LOBBY_CHAT_MSG 507
#define GL_CBQ_ID_LOBBY_MATCH_LIST 510
#define GL_CBQ_ID_LOBBY_KICKED 512
#define GL_CBQ_ID_LOBBY_CREATED 513
#define GL_CBQ_ID_P2P_SESSION_REQUEST 1202
#define GL_CBQ_ID_P2P_SESSION_CONNECT_FAIL 1203
#define GL_CBQ_ID_NET_CONN_STATUS_CHANGED 1221
#define GL_CBQ_ID_NET_AUTH_STATUS 1222
#define GL_CBQ_ID_MSGS_SESSION_REQUEST 1251
#define GL_CBQ_ID_MSGS_SESSION_FAILED 1252
#define GL_CBQ_ID_RELAY_NETWORK_STATUS 1281

#define GL_CBQ_LOBBYINVITE_MAC_SIZE 24
#define GL_CBQ_LOBBYINVITE_WIN_SIZE 24
#define GL_CBQ_LOBBYENTER_MAC_SIZE 20
#define GL_CBQ_LOBBYENTER_WIN_SIZE 24
#define GL_CBQ_LOBBYDATAUPDATE_MAC_SIZE 20
#define GL_CBQ_LOBBYDATAUPDATE_WIN_SIZE 24
#define GL_CBQ_LOBBYCHATUPDATE_MAC_SIZE 28
#define GL_CBQ_LOBBYCHATUPDATE_WIN_SIZE 32
#define GL_CBQ_LOBBYCHATMSG_MAC_SIZE 24
#define GL_CBQ_LOBBYCHATMSG_WIN_SIZE 24
#define GL_CBQ_LOBBYMATCHLIST_MAC_SIZE 4
#define GL_CBQ_LOBBYMATCHLIST_WIN_SIZE 4
#define GL_CBQ_LOBBYKICKED_MAC_SIZE 20
#define GL_CBQ_LOBBYKICKED_WIN_SIZE 24
#define GL_CBQ_LOBBYCREATED_MAC_SIZE 12
#define GL_CBQ_LOBBYCREATED_WIN_SIZE 16
#define GL_CBQ_P2PSESSIONREQUEST_MAC_SIZE 8
#define GL_CBQ_P2PSESSIONREQUEST_WIN_SIZE 8
#define GL_CBQ_P2PSESSIONCONNECTFAIL_MAC_SIZE 9
#define GL_CBQ_P2PSESSIONCONNECTFAIL_WIN_SIZE 9
#define GL_CBQ_NETCONNSTATUS_MAC_SIZE 704
#define GL_CBQ_NETCONNSTATUS_WIN_SIZE 712
#define GL_CBQ_NETAUTHSTATUS_MAC_SIZE 260
#define GL_CBQ_NETAUTHSTATUS_WIN_SIZE 260
#define GL_CBQ_MSGSSESSIONREQUEST_MAC_SIZE 136
#define GL_CBQ_MSGSSESSIONREQUEST_WIN_SIZE 136
#define GL_CBQ_MSGSSESSIONFAILED_MAC_SIZE 696
#define GL_CBQ_MSGSSESSIONFAILED_WIN_SIZE 696
#define GL_CBQ_RELAYNETSTATUS_MAC_SIZE 272
#define GL_CBQ_RELAYNETSTATUS_WIN_SIZE 272

/* Offsets the helper reads from the Mac buffer to classify a join (NET
 * evidence). 504: m_EChatRoomEnterResponse@16. 1221: m_info@4 on Mac, so
 * m_info.m_eState@180, m_info.m_nFlags@444, m_eOldState@700. */
#define GL_CBQ_LOBBYENTER_MAC_OFF_RESPONSE 16
#define GL_CBQ_NETCONNSTATUS_MAC_OFF_ESTATE 180
#define GL_CBQ_NETCONNSTATUS_MAC_OFF_NFLAGS 444
#define GL_CBQ_NETCONNSTATUS_MAC_OFF_OLDSTATE 700

/* One copied field: bytes [macOff, macOff+width) -> [winOff, winOff+width). */
typedef struct {
  uint16_t macOff;
  uint16_t winOff;
  uint16_t width;
} gl_cbq_field_map;

typedef struct {
  int32_t id;
  uint32_t winSize;
  uint32_t macSize;
  const gl_cbq_field_map *map;
  uint8_t mapLen;
} gl_cbq_allow_row;

#define GL_CBQ_MAPLEN(a) ((uint8_t)(sizeof(a) / sizeof((a)[0])))

/* Whole-struct copies (mac layout is a prefix of the win layout; the tail is
 * zero padding). */
static const gl_cbq_field_map gl_cbq_map_168[] = {{0, 0, GL_CBQ_MAX_PARAM_BYTES}};
static const gl_cbq_field_map gl_cbq_map_1101[] = {
    {0, GL_CBQ_USR_WIN_OFF_GAMEID, 8}, {8, GL_CBQ_USR_WIN_OFF_ERESULT, 4},
    {12, GL_CBQ_USR_WIN_OFF_STEAMID, 8}};
static const gl_cbq_field_map gl_cbq_map_503[] = {{0, 0, GL_CBQ_LOBBYINVITE_MAC_SIZE}};
static const gl_cbq_field_map gl_cbq_map_504[] = {{0, 0, GL_CBQ_LOBBYENTER_MAC_SIZE}};
static const gl_cbq_field_map gl_cbq_map_505[] = {{0, 0, GL_CBQ_LOBBYDATAUPDATE_MAC_SIZE}};
static const gl_cbq_field_map gl_cbq_map_506[] = {{0, 0, GL_CBQ_LOBBYCHATUPDATE_MAC_SIZE}};
static const gl_cbq_field_map gl_cbq_map_507[] = {{0, 0, GL_CBQ_LOBBYCHATMSG_MAC_SIZE}};
static const gl_cbq_field_map gl_cbq_map_512[] = {{0, 0, GL_CBQ_LOBBYKICKED_MAC_SIZE}};
/* LobbyCreated_t (513): m_eResult@0, m_ulSteamIDLobby 4 (Mac pack 4) -> 8
 * (MSVC pack 8); measured in CALLBACK_LAYOUTS.LobbyCreated_t. Relayed as a
 * broadcast AND as the CreateLobby call result (real Steam delivers both, and
 * Steamworks.NET games listen through Callback<> or CallResult<>). */
static const gl_cbq_field_map gl_cbq_map_513[] = {{0, 0, 4}, {4, 8, 8}};
static const gl_cbq_field_map gl_cbq_map_1202[] = {{0, 0, GL_CBQ_P2PSESSIONREQUEST_MAC_SIZE}};
static const gl_cbq_field_map gl_cbq_map_1203[] = {{0, 0, GL_CBQ_P2PSESSIONCONNECTFAIL_MAC_SIZE}};
/* 1221: m_hConn@0, m_info 4 -> 8 (696 bytes), m_eOldState 700 -> 704. */
static const gl_cbq_field_map gl_cbq_map_1221[] = {{0, 0, 4}, {4, 8, 696}, {700, 704, 4}};
static const gl_cbq_field_map gl_cbq_map_1222[] = {{0, 0, GL_CBQ_NETAUTHSTATUS_MAC_SIZE}};
static const gl_cbq_field_map gl_cbq_map_1251[] = {{0, 0, GL_CBQ_MSGSSESSIONREQUEST_MAC_SIZE}};
static const gl_cbq_field_map gl_cbq_map_1252[] = {{0, 0, GL_CBQ_MSGSSESSIONFAILED_MAC_SIZE}};
static const gl_cbq_field_map gl_cbq_map_1281[] = {{0, 0, GL_CBQ_RELAYNETSTATUS_MAC_SIZE}};

#define GL_CBQ_ROW(id, win, mac, m) {id, win, mac, m, GL_CBQ_MAPLEN(m)}

/* Closed allowlist. winSize is the WIRE size (what the shim relays and what
 * gl_cbq_offer demands). A row whose macSize != winSize, or whose layout moved a
 * field, is never offered raw from the pump but goes through
 * gl_cbq_repack_fields first (RESEARCH Pitfall 7). */
static const gl_cbq_allow_row gl_cbq_allow[] = {
    GL_CBQ_ROW(GL_CBQ_ID_GET_TICKET_FOR_WEB_API_RESPONSE, GL_CBQ_MAX_PARAM_BYTES,
               GL_CBQ_MAX_PARAM_BYTES, gl_cbq_map_168),
    GL_CBQ_ROW(GL_CBQ_ID_USER_STATS_RECEIVED, GL_CBQ_USR_WIN_SIZE, GL_CBQ_USR_MAC_SIZE,
               gl_cbq_map_1101),
    GL_CBQ_ROW(503, GL_CBQ_LOBBYINVITE_WIN_SIZE, GL_CBQ_LOBBYINVITE_MAC_SIZE, gl_cbq_map_503),
    GL_CBQ_ROW(504, GL_CBQ_LOBBYENTER_WIN_SIZE, GL_CBQ_LOBBYENTER_MAC_SIZE, gl_cbq_map_504),
    GL_CBQ_ROW(505, GL_CBQ_LOBBYDATAUPDATE_WIN_SIZE, GL_CBQ_LOBBYDATAUPDATE_MAC_SIZE,
               gl_cbq_map_505),
    GL_CBQ_ROW(506, GL_CBQ_LOBBYCHATUPDATE_WIN_SIZE, GL_CBQ_LOBBYCHATUPDATE_MAC_SIZE,
               gl_cbq_map_506),
    GL_CBQ_ROW(507, GL_CBQ_LOBBYCHATMSG_WIN_SIZE, GL_CBQ_LOBBYCHATMSG_MAC_SIZE, gl_cbq_map_507),
    GL_CBQ_ROW(512, GL_CBQ_LOBBYKICKED_WIN_SIZE, GL_CBQ_LOBBYKICKED_MAC_SIZE, gl_cbq_map_512),
    GL_CBQ_ROW(GL_CBQ_ID_LOBBY_CREATED, GL_CBQ_LOBBYCREATED_WIN_SIZE,
               GL_CBQ_LOBBYCREATED_MAC_SIZE, gl_cbq_map_513),
    GL_CBQ_ROW(1202, GL_CBQ_P2PSESSIONREQUEST_WIN_SIZE, GL_CBQ_P2PSESSIONREQUEST_MAC_SIZE,
               gl_cbq_map_1202),
    GL_CBQ_ROW(1203, GL_CBQ_P2PSESSIONCONNECTFAIL_WIN_SIZE, GL_CBQ_P2PSESSIONCONNECTFAIL_MAC_SIZE,
               gl_cbq_map_1203),
    GL_CBQ_ROW(1221, GL_CBQ_NETCONNSTATUS_WIN_SIZE, GL_CBQ_NETCONNSTATUS_MAC_SIZE,
               gl_cbq_map_1221),
    GL_CBQ_ROW(1222, GL_CBQ_NETAUTHSTATUS_WIN_SIZE, GL_CBQ_NETAUTHSTATUS_MAC_SIZE,
               gl_cbq_map_1222),
    GL_CBQ_ROW(1251, GL_CBQ_MSGSSESSIONREQUEST_WIN_SIZE, GL_CBQ_MSGSSESSIONREQUEST_MAC_SIZE,
               gl_cbq_map_1251),
    GL_CBQ_ROW(1252, GL_CBQ_MSGSSESSIONFAILED_WIN_SIZE, GL_CBQ_MSGSSESSIONFAILED_MAC_SIZE,
               gl_cbq_map_1252),
    GL_CBQ_ROW(1281, GL_CBQ_RELAYNETSTATUS_WIN_SIZE, GL_CBQ_RELAYNETSTATUS_MAC_SIZE,
               gl_cbq_map_1281)};

typedef struct {
  int32_t iCallback;
  uint32_t cub;
  uint8_t bytes[GL_CBQ_MAX_PARAM_BYTES];
} gl_cbq_entry;

typedef struct {
  gl_cbq_entry slots[GL_CBQ_RING_SLOTS];
  uint32_t head;
  uint32_t count;
  uint32_t dropped_full;
  uint32_t dropped_filtered;
} gl_cbq_ring;

static void gl_cbq_secure_zero(void *p, size_t n) {
  volatile uint8_t *v = (volatile uint8_t *)p;
  while (n--) *v++ = 0;
}

static const gl_cbq_allow_row *gl_cbq_row(int32_t id) {
  for (size_t i = 0; i < sizeof gl_cbq_allow / sizeof gl_cbq_allow[0]; i++)
    if (gl_cbq_allow[i].id == id) return &gl_cbq_allow[i];
  return NULL;
}

/* Wire (win) size for a relayable broadcast id, or 0. */
static uint32_t gl_cbq_allowed_size(int32_t id) {
  const gl_cbq_allow_row *r = gl_cbq_row(id);
  return r ? r->winSize : 0;
}

/* Rewrites a Mac buffer into the MSVC wire form: `win` (row->winSize bytes) is
 * zeroed, then every mapped field copied. Caller guarantees `mac` holds
 * row->macSize bytes. */
static void gl_cbq_repack_fields(const uint8_t *mac, uint8_t *win, const gl_cbq_allow_row *row) {
  memset(win, 0, row->winSize);
  for (uint8_t i = 0; i < row->mapLen; i++) {
    const gl_cbq_field_map *f = &row->map[i];
    if ((uint32_t)f->macOff + f->width <= row->macSize &&
        (uint32_t)f->winOff + f->width <= row->winSize)
      memcpy(win + f->winOff, mac + f->macOff, f->width);
  }
}

/* Unlisted-id observation (D-09): returns 1 the first time an id is seen (and
 * only while fewer than 32 distinct ids were recorded), else 0. */
#define GL_CBQ_UNLISTED_MAX 32
static int32_t gl_cbq_unlisted_seen[GL_CBQ_UNLISTED_MAX];
static uint32_t gl_cbq_unlisted_n = 0;
static int gl_cbq_note_unlisted(int32_t id) {
  for (uint32_t i = 0; i < gl_cbq_unlisted_n; i++)
    if (gl_cbq_unlisted_seen[i] == id) return 0;
  if (gl_cbq_unlisted_n >= GL_CBQ_UNLISTED_MAX) return 0;
  gl_cbq_unlisted_seen[gl_cbq_unlisted_n++] = id;
  return 1;
}

static void gl_cbq_zero_entry(gl_cbq_entry *e) {
  gl_cbq_secure_zero(e, sizeof *e);
}

/* Returns 1 when queued, else 0. */
static int gl_cbq_offer(gl_cbq_ring *r, int32_t id, const uint8_t *p, int32_t cub) {
  uint32_t want = gl_cbq_allowed_size(id);
  if (want == 0 || p == NULL || cub <= 0 || (uint32_t)cub != want) {
    r->dropped_filtered++;
    return 0;
  }
  if (r->count == GL_CBQ_RING_SLOTS) {
    gl_cbq_zero_entry(&r->slots[r->head]);
    r->head = (r->head + 1) % GL_CBQ_RING_SLOTS;
    r->count--;
    r->dropped_full++;
  }
  gl_cbq_entry *e = &r->slots[(r->head + r->count) % GL_CBQ_RING_SLOTS];
  e->iCallback = id;
  e->cub = (uint32_t)cub;
  memcpy(e->bytes, p, (uint32_t)cub);
  r->count++;
  return 1;
}

/* Returns bytes written (4 or 4+4+4+cub), or 0 when cap is too small. */
static uint32_t gl_cbq_pop_encode(gl_cbq_ring *r, uint8_t *out, uint32_t cap) {
  if (cap < 4) return 0;
  if (r->count == 0) {
    uint32_t zero = 0;
    memcpy(out, &zero, 4);
    return 4;
  }
  gl_cbq_entry *e = &r->slots[r->head];
  uint32_t total = 12 + e->cub;
  if (cap < total) return 0;
  uint32_t one = 1;
  memcpy(out, &one, 4);
  memcpy(out + 4, &e->iCallback, 4);
  memcpy(out + 8, &e->cub, 4);
  memcpy(out + 12, e->bytes, e->cub);
  gl_cbq_zero_entry(e);
  r->head = (r->head + 1) % GL_CBQ_RING_SLOTS;
  r->count--;
  return total;
}

/* Returns 1 when the ring holds an entry with this id, else 0. */
static int gl_cbq_contains(const gl_cbq_ring *r, int32_t id) {
  for (uint32_t i = 0; i < r->count; i++)
    if (r->slots[(r->head + i) % GL_CBQ_RING_SLOTS].iCallback == id) return 1;
  return 0;
}

/* Repacks the 20-byte Mac (pack 4) UserStatsReceived_t into the 24-byte MSVC
 * (pack 8) wire form. Bytes 12..15 (the padding) are zero. */
static void gl_cbq_repack_user_stats(const uint8_t *mac, uint8_t out[GL_CBQ_USR_WIN_SIZE]) {
  gl_cbq_repack_fields(mac, out, gl_cbq_row(GL_CBQ_ID_USER_STATS_RECEIVED));
}

/* UserStatsReceived_t forwarding state machine (pure; the caller owns I/O).
 *   cached           latest own-app 1101, already in wire form
 *   pending          the game asked and nothing was cached: forward the next
 *   initial_forwarded the first own-app 1101 has been forwarded unprompted
 *   pending_call     RequestUserStats handle in flight (owned by the caller;
 *                    the one-fetch-in-flight rule) */
typedef struct {
  uint8_t cached[GL_CBQ_USR_WIN_SIZE];
  int have_cached;
  int pending;
  int initial_forwarded;
  uint64_t pending_call;
} gl_stats_fwd;

#define GL_STATS_OBS_BAD (-1)         /* NULL or cub != 20: no state change */
#define GL_STATS_OBS_OTHER_APP 0      /* gameID != appid: ignored */
#define GL_STATS_OBS_CACHED 1         /* cached only */
#define GL_STATS_OBS_QUEUED 2         /* cached and offered to the ring */

#define GL_STATS_REQ_ALREADY_QUEUED 0 /* a 1101 is already in the ring */
#define GL_STATS_REQ_QUEUED_CACHED 1  /* cached copy offered */
#define GL_STATS_REQ_NEED_FETCH 2     /* nothing cached: pending set */

static int gl_stats_on_observed(gl_stats_fwd *st, gl_cbq_ring *r, const uint8_t *mac,
                                int32_t cub, uint64_t appid) {
  if (mac == NULL || cub != GL_CBQ_USR_MAC_SIZE) return GL_STATS_OBS_BAD;
  uint64_t gid;
  memcpy(&gid, mac, 8);
  if (gid != appid) return GL_STATS_OBS_OTHER_APP;
  gl_cbq_repack_user_stats(mac, st->cached);
  st->have_cached = 1;
  if (st->pending || !st->initial_forwarded) {
    gl_cbq_offer(r, GL_CBQ_ID_USER_STATS_RECEIVED, st->cached, GL_CBQ_USR_WIN_SIZE);
    st->initial_forwarded = 1;
    st->pending = 0;
    st->pending_call = 0;
    return GL_STATS_OBS_QUEUED;
  }
  return GL_STATS_OBS_CACHED;
}

static int gl_stats_on_request(gl_stats_fwd *st, gl_cbq_ring *r) {
  if (gl_cbq_contains(r, GL_CBQ_ID_USER_STATS_RECEIVED)) return GL_STATS_REQ_ALREADY_QUEUED;
  if (st->have_cached) {
    gl_cbq_offer(r, GL_CBQ_ID_USER_STATS_RECEIVED, st->cached, GL_CBQ_USR_WIN_SIZE);
    return GL_STATS_REQ_QUEUED_CACHED;
  }
  st->pending = 1;
  return GL_STATS_REQ_NEED_FETCH;
}

#endif /* GAMELIB_CBQUEUE_H */
