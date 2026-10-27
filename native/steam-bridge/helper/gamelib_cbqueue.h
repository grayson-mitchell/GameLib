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
#define GL_CBQ_RING_SLOTS 8
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

typedef struct {
  int32_t id;
  uint32_t size;
} gl_cbq_allow_row;

/* Closed allowlist. Rows are WIRE sizes (what the shim relays). Any row whose
 * Mac struct differs from the wire form (a uint64 member, RESEARCH Pitfall 7)
 * is never offered raw from the pump but goes through its repack first. */
static const gl_cbq_allow_row gl_cbq_allow[] = {
    {GL_CBQ_ID_GET_TICKET_FOR_WEB_API_RESPONSE, GL_CBQ_MAX_PARAM_BYTES},
    {GL_CBQ_ID_USER_STATS_RECEIVED, GL_CBQ_USR_WIN_SIZE}};

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

static uint32_t gl_cbq_allowed_size(int32_t id) {
  for (size_t i = 0; i < sizeof gl_cbq_allow / sizeof gl_cbq_allow[0]; i++)
    if (gl_cbq_allow[i].id == id) return gl_cbq_allow[i].size;
  return 0;
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
  memset(out, 0, GL_CBQ_USR_WIN_SIZE);
  memcpy(out + GL_CBQ_USR_WIN_OFF_GAMEID, mac + 0, 8);
  memcpy(out + GL_CBQ_USR_WIN_OFF_ERESULT, mac + 8, 4);
  memcpy(out + GL_CBQ_USR_WIN_OFF_STEAMID, mac + 12, 8);
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
