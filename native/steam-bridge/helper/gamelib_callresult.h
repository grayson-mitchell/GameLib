/*
 * gamelib_callresult.h -- Phase 58 (58-07): helper-side call-result completion.
 *
 * A wire method that returned a SteamAPICall_t handle is recorded with
 * gl_cr_track(handle, expectedCallbackId). When SteamAPICallCompleted_t (703)
 * names a tracked handle the pump fetches the result with the MAC size of the
 * expected struct and calls gl_cr_complete, which repacks to the MSVC wire form
 * and queues it for CONTROL slot 11 (drainCallResults).
 *
 * Header-only, no I/O, no logging, no allocation: host-harness testable.
 * Included by bridge_helper.c AFTER gamelib_cbqueue.h.
 *
 * Slot 11 reply:
 *   [u32 count 0|1]  if 1: [u64 hAPICall][i32 iCallback][u32 ioFailure 0|1]
 *                          [u32 cub][cub bytes]
 * Credential/identity hygiene: results carry SteamIDs. Slots are zeroed on pop
 * and on eviction; callers never log the bytes.
 */
#ifndef GAMELIB_CALLRESULT_H
#define GAMELIB_CALLRESULT_H

#include "gamelib_cbqueue.h"

#define GL_CR_TRACK_SLOTS 16
#define GL_CR_RING_SLOTS 8
#define GL_CR_DRAIN_RESP_MAX_BYTES (4 + 8 + 4 + 4 + 4 + GL_CBQ_MAX_PARAM_BYTES)

#define GL_CR_ID_LOBBY_MATCH_LIST 510
#define GL_CR_ID_LOBBY_CREATED 513

static const gl_cbq_field_map gl_cr_map_510[] = {{0, 0, GL_CBQ_LOBBYMATCHLIST_MAC_SIZE}};

/* Rows: winSize, macSize, field map. 504 and 513 share the broadcast row. */
static const gl_cbq_allow_row gl_cr_rows[] = {
    GL_CBQ_ROW(GL_CR_ID_LOBBY_MATCH_LIST, GL_CBQ_LOBBYMATCHLIST_WIN_SIZE,
               GL_CBQ_LOBBYMATCHLIST_MAC_SIZE, gl_cr_map_510),
};

/* Row for a call-result id (504 and 513 resolve to the broadcast row), or NULL. */
static const gl_cbq_allow_row *gl_cr_row(int32_t id) {
  for (size_t i = 0; i < sizeof gl_cr_rows / sizeof gl_cr_rows[0]; i++)
    if (gl_cr_rows[i].id == id) return &gl_cr_rows[i];
  if (id == GL_CBQ_ID_LOBBY_ENTER || id == GL_CR_ID_LOBBY_CREATED) return gl_cbq_row(id);
  return NULL;
}

/* Wire size of a call-result id, or 0. */
static uint32_t gl_cr_allowed_size(int32_t id) {
  const gl_cbq_allow_row *r = gl_cr_row(id);
  return r ? r->winSize : 0;
}

/* Mac size to request from ManualDispatch_GetAPICallResult, or 0. */
static uint32_t gl_cr_mac_size(int32_t id) {
  const gl_cbq_allow_row *r = gl_cr_row(id);
  return r ? r->macSize : 0;
}

typedef struct {
  uint64_t h;
  int32_t id;
  int used;
} gl_cr_pending;

typedef struct {
  uint64_t h;
  int32_t id;
  uint32_t failed;
  uint32_t cub;
  uint8_t bytes[GL_CBQ_MAX_PARAM_BYTES];
} gl_cr_entry;

typedef struct {
  gl_cr_pending pend[GL_CR_TRACK_SLOTS];
  uint32_t pend_next; /* next eviction victim cursor (oldest-first) */
  uint32_t pend_age[GL_CR_TRACK_SLOTS];
  uint32_t pend_clock;
  gl_cr_entry ring[GL_CR_RING_SLOTS];
  uint32_t head;
  uint32_t count;
  uint32_t dropped_full;
} gl_cr_state;

/* Records a handle. Returns 1 when tracked, 0 for an unknown id or a zero
 * handle (k_uAPICallInvalid). The oldest entry is evicted when full. */
static int gl_cr_track(gl_cr_state *st, uint64_t h, int32_t id) {
  if (h == 0 || gl_cr_allowed_size(id) == 0) return 0;
  uint32_t victim = 0, best = 0xFFFFFFFFu;
  for (uint32_t i = 0; i < GL_CR_TRACK_SLOTS; i++) {
    if (!st->pend[i].used) {
      victim = i;
      best = 0;
      break;
    }
    if (st->pend[i].h == h) {
      victim = i;
      best = 0;
      break;
    }
    if (st->pend_age[i] < best) {
      best = st->pend_age[i];
      victim = i;
    }
  }
  st->pend[victim].h = h;
  st->pend[victim].id = id;
  st->pend[victim].used = 1;
  st->pend_age[victim] = ++st->pend_clock;
  return 1;
}

/* Expected callback id for a tracked handle, or 0. */
static int32_t gl_cr_lookup(const gl_cr_state *st, uint64_t h) {
  for (uint32_t i = 0; i < GL_CR_TRACK_SLOTS; i++)
    if (st->pend[i].used && st->pend[i].h == h) return st->pend[i].id;
  return 0;
}

static void gl_cr_untrack(gl_cr_state *st, uint64_t h) {
  for (uint32_t i = 0; i < GL_CR_TRACK_SLOTS; i++)
    if (st->pend[i].used && st->pend[i].h == h) {
      st->pend[i].used = 0;
      st->pend[i].h = 0;
      st->pend[i].id = 0;
    }
}

/* Completes a tracked handle. `mac` holds `cub` bytes (ignored when failed).
 * Returns 1 when a result was queued, 0 when untracked or the size is wrong. A
 * failed completion is queued with zero-filled bytes of the wire size. */
static int gl_cr_complete(gl_cr_state *st, uint64_t h, const uint8_t *mac, uint32_t cub,
                          int failed) {
  int32_t id = gl_cr_lookup(st, h);
  if (id == 0) return 0;
  const gl_cbq_allow_row *row = gl_cr_row(id);
  gl_cr_untrack(st, h);
  if (row == NULL) return 0;
  if (!failed && (mac == NULL || cub != row->macSize)) return 0;
  if (st->count == GL_CR_RING_SLOTS) {
    gl_cbq_secure_zero(&st->ring[st->head], sizeof st->ring[0]);
    st->head = (st->head + 1) % GL_CR_RING_SLOTS;
    st->count--;
    st->dropped_full++;
  }
  gl_cr_entry *e = &st->ring[(st->head + st->count) % GL_CR_RING_SLOTS];
  gl_cbq_secure_zero(e, sizeof *e);
  e->h = h;
  e->id = id;
  e->failed = failed ? 1u : 0u;
  e->cub = row->winSize;
  if (!failed) gl_cbq_repack_fields(mac, e->bytes, row);
  st->count++;
  return 1;
}

/* Encodes and pops one result. Returns bytes written, or 0 when `cap` is too
 * small (the entry is kept). The popped slot is zeroed. */
static uint32_t gl_cr_pop(gl_cr_state *st, uint8_t *out, uint32_t cap) {
  if (cap < 4) return 0;
  if (st->count == 0) {
    uint32_t zero = 0;
    memcpy(out, &zero, 4);
    return 4;
  }
  gl_cr_entry *e = &st->ring[st->head];
  uint32_t total = 4 + 8 + 4 + 4 + 4 + e->cub;
  if (cap < total) return 0;
  uint32_t one = 1;
  memcpy(out, &one, 4);
  memcpy(out + 4, &e->h, 8);
  memcpy(out + 12, &e->id, 4);
  memcpy(out + 16, &e->failed, 4);
  memcpy(out + 20, &e->cub, 4);
  memcpy(out + 24, e->bytes, e->cub);
  gl_cbq_secure_zero(e, sizeof *e);
  st->head = (st->head + 1) % GL_CR_RING_SLOTS;
  st->count--;
  return total;
}

/* ---- Server-browser event ring (58-20, CONTROL slot 12) ----
 * The helper passes its OWN C response objects to Mac Steam; their callbacks
 * push events here and the shim drains one per round trip (slot 12). Bounded
 * at 64; the oldest is zeroed and evicted on overflow; a popped slot is zeroed.
 *
 * Slot 12 reply:
 *   [u32 count 0|1]  if 1: [u8 kind][u32 hRequest][i32 iServer][i32 value]
 *                          [u32 cub][cub bytes]
 * Kinds (the final table lives in the 58-20 SUMMARY):
 *   1 list ServerResponded(hRequest, iServer)      2 list ServerFailedToRespond
 *   3 list RefreshComplete (value = EMatchMakingServerResponse)
 *   4 ping ServerResponded (payload = 380-byte gameserveritem_t)  5 ping failed
 *   6 players AddPlayerToList (value = score, iServer = float bits of the time
 *     played, payload = name NUL)                  7 players failed  8 players done
 *   9 rules RulesResponded (payload = rule NUL value NUL)  10 failed  11 done
 *   12 friends (value = vtable slot index, no payload)
 * hRequest is the low 32 bits of the Mac HServerListRequest for kinds 1-3 and
 * the HServerQuery for kinds 4-12. Strings are NUL-terminated, 255 chars at most;
 * a longer one refuses the whole event. The ring carries SteamIDs (the
 * gameserveritem_t): callers never log the bytes. */
#define GL_MMS_RING_SLOTS 64
#define GL_MMS_STR_MAX 255 /* chars; 256 bytes with the NUL */
#define GL_MMS_PAYLOAD_MAX 512
#define GL_MMS_GSI_SIZE 380
#define GL_MMS_DRAIN_RESP_MAX_BYTES (4 + 1 + 4 + 4 + 4 + 4 + GL_MMS_PAYLOAD_MAX)

enum {
  GL_MMS_EV_LIST_RESPONDED = 1,
  GL_MMS_EV_LIST_FAILED = 2,
  GL_MMS_EV_LIST_COMPLETE = 3,
  GL_MMS_EV_PING_RESPONDED = 4,
  GL_MMS_EV_PING_FAILED = 5,
  GL_MMS_EV_PLAYERS_ADD = 6,
  GL_MMS_EV_PLAYERS_FAILED = 7,
  GL_MMS_EV_PLAYERS_DONE = 8,
  GL_MMS_EV_RULES_RESPONDED = 9,
  GL_MMS_EV_RULES_FAILED = 10,
  GL_MMS_EV_RULES_DONE = 11,
  GL_MMS_EV_FRIENDS = 12,
  GL_MMS_EV_MAX = 12
};

typedef struct {
  uint8_t kind;
  uint32_t h;
  int32_t iServer;
  int32_t value;
  uint32_t cub;
  uint8_t bytes[GL_MMS_PAYLOAD_MAX];
} gl_mms_ev;

typedef struct {
  gl_mms_ev ring[GL_MMS_RING_SLOTS];
  uint32_t head;
  uint32_t count;
  uint32_t dropped_full;
  uint32_t refused;
} gl_mms_ring;

/* Queues an event with a raw payload of `cub` bytes. Returns 1 when queued, 0
 * for an unknown kind or an oversize payload (nothing queued). */
static int gl_mms_ev_push(gl_mms_ring *r, uint8_t kind, uint32_t h, int32_t iServer,
                          int32_t value, const void *payload, uint32_t cub) {
  if (kind == 0 || kind > GL_MMS_EV_MAX || cub > GL_MMS_PAYLOAD_MAX ||
      (cub != 0 && payload == NULL)) {
    r->refused++;
    return 0;
  }
  if (r->count == GL_MMS_RING_SLOTS) {
    gl_cbq_secure_zero(&r->ring[r->head], sizeof r->ring[0]);
    r->head = (r->head + 1) % GL_MMS_RING_SLOTS;
    r->count--;
    r->dropped_full++;
  }
  gl_mms_ev *e = &r->ring[(r->head + r->count) % GL_MMS_RING_SLOTS];
  gl_cbq_secure_zero(e, sizeof *e);
  e->kind = kind;
  e->h = h;
  e->iServer = iServer;
  e->value = value;
  e->cub = cub;
  if (cub != 0) memcpy(e->bytes, payload, cub);
  r->count++;
  return 1;
}

/* Length of a string capped at GL_MMS_STR_MAX; returns -1 when `s` is NULL or
 * has no NUL within GL_MMS_STR_MAX + 1 bytes. */
static int32_t gl_mms_str_len(const char *s) {
  if (s == NULL) return -1;
  for (int32_t i = 0; i <= GL_MMS_STR_MAX; i++)
    if (s[i] == '\0') return i;
  return -1;
}

/* Queues an event whose payload is `a` NUL (and `b` NUL when b != NULL). Either
 * string over GL_MMS_STR_MAX chars (or NULL `a`) refuses the whole event. */
static int gl_mms_ev_push_strs(gl_mms_ring *r, uint8_t kind, uint32_t h, int32_t iServer,
                               int32_t value, const char *a, const char *b) {
  uint8_t buf[GL_MMS_PAYLOAD_MAX];
  int32_t la = gl_mms_str_len(a);
  int32_t lb = 0;
  if (la < 0 || (b != NULL && (lb = gl_mms_str_len(b)) < 0)) {
    r->refused++;
    return 0;
  }
  memcpy(buf, a, (size_t)la + 1);
  uint32_t n = (uint32_t)la + 1;
  if (b != NULL) {
    memcpy(buf + n, b, (size_t)lb + 1);
    n += (uint32_t)lb + 1;
  }
  int ok = gl_mms_ev_push(r, kind, h, iServer, value, buf, n);
  gl_cbq_secure_zero(buf, sizeof buf);
  return ok;
}

/* Encodes and pops one event. Returns bytes written, or 0 when `cap` is too
 * small (the entry is kept). The popped slot is zeroed. */
static uint32_t gl_mms_ev_pop(gl_mms_ring *r, uint8_t *out, uint32_t cap) {
  if (cap < 4) return 0;
  if (r->count == 0) {
    uint32_t zero = 0;
    memcpy(out, &zero, 4);
    return 4;
  }
  gl_mms_ev *e = &r->ring[r->head];
  uint32_t total = 4 + 1 + 4 + 4 + 4 + 4 + e->cub;
  if (cap < total) return 0;
  uint32_t one = 1;
  memcpy(out, &one, 4);
  out[4] = e->kind;
  memcpy(out + 5, &e->h, 4);
  memcpy(out + 9, &e->iServer, 4);
  memcpy(out + 13, &e->value, 4);
  memcpy(out + 17, &e->cub, 4);
  memcpy(out + 21, e->bytes, e->cub);
  gl_cbq_secure_zero(e, sizeof *e);
  r->head = (r->head + 1) % GL_MMS_RING_SLOTS;
  r->count--;
  return total;
}

/* gameserveritem_t repack (macOff, winOff, width), built from CALLBACK_LAYOUTS
 * gameserveritem_t (58-02: x64 and mac both 380 bytes, identical offsets). One
 * row per field, in layout order; cbqueue.test.ts pins every row to the
 * measured offsets. */
static const gl_cbq_field_map gl_mms_gsi_map[] = {
    {0, 0, 8},      /* m_NetAdr */
    {8, 8, 4},      /* m_nPing */
    {12, 12, 1},    /* m_bHadSuccessfulResponse */
    {13, 13, 1},    /* m_bDoNotRefresh */
    {14, 14, 32},   /* m_szGameDir */
    {46, 46, 32},   /* m_szMap */
    {78, 78, 64},   /* m_szGameDescription */
    {144, 144, 4},  /* m_nAppID */
    {148, 148, 4},  /* m_nPlayers */
    {152, 152, 4},  /* m_nMaxPlayers */
    {156, 156, 4},  /* m_nBotPlayers */
    {160, 160, 1},  /* m_bPassword */
    {161, 161, 1},  /* m_bSecure */
    {164, 164, 4},  /* m_ulTimeLastPlayed */
    {168, 168, 4},  /* m_nServerVersion */
    {172, 172, 64}, /* m_szServerName */
    {236, 236, 128}, /* m_szGameTags */
    {364, 364, 8},  /* m_steamID */
    {372, 372, 4},  /* m_nCurrentFriendCount */
    {376, 376, 4},  /* m_nTotalFriendCount */
};

static const gl_cbq_allow_row gl_mms_gsi_row = {
    0, GL_MMS_GSI_SIZE, GL_MMS_GSI_SIZE, gl_mms_gsi_map, GL_CBQ_MAPLEN(gl_mms_gsi_map)};

/* Repacks a Mac gameserveritem_t (380 bytes) into the Windows x64 form at every
 * measured field offset; padding is zero and every string field is forced
 * NUL-terminated so the game never reads past it. */
static void gl_mms_gsi_repack(const uint8_t *mac, uint8_t *win) {
  gl_cbq_repack_fields(mac, win, &gl_mms_gsi_row);
  win[14 + 31] = 0;
  win[46 + 31] = 0;
  win[78 + 63] = 0;
  win[172 + 63] = 0;
  win[236 + 127] = 0;
}

/* ---- NET evidence (58-05 grammar) ----
 * Implemented by bridge_helper.c (non-static) so the generated dispatch header
 * can call it. game: 1 = role=game, 0 = role=helper. Closed enums; an
 * out-of-range value logs nothing. Never carries ids of people, addresses,
 * handles or payload. */
enum { GL_NET_KIND_JOIN = 0, GL_NET_KIND_SEND, GL_NET_KIND_RECV, GL_NET_KIND_PATH,
       GL_NET_KIND_OVERSIZE };
enum { GL_NET_IFACE_MATCHMAKING = 0, GL_NET_IFACE_NETWORKING, GL_NET_IFACE_SOCKETS,
       GL_NET_IFACE_MESSAGES };
enum { GL_NET_PATH_UNKNOWN = 0, GL_NET_PATH_DIRECT, GL_NET_PATH_RELAYED };

void gl_net_evidence(int game, int kind, int iface, int32_t cb, uint32_t n, int path);

/* Called by the generated dispatch after a wire method returned a
 * SteamAPICall_t: records the handle so the pump completes it. Returns 1 when
 * tracked. Implemented by bridge_helper.c over its single gl_cr_state. */
int gl_helper_cr_track(uint64_t hCall, int32_t iCallback);

#endif /* GAMELIB_CALLRESULT_H */
