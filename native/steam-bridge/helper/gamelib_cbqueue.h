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
 */
#ifndef GAMELIB_CBQUEUE_H
#define GAMELIB_CBQUEUE_H

#include <stdint.h>
#include <stddef.h>
#include <string.h>

#define GL_CBQ_ID_GET_TICKET_FOR_WEB_API_RESPONSE 168
#define GL_CBQ_MAX_PARAM_BYTES 2572
#define GL_CBQ_RING_SLOTS 8
#define GL_CBQ_PUMP_MAX_MSGS 64
#define GL_CBQ_DRAIN_RESP_MAX_BYTES (4 + 4 + 4 + GL_CBQ_MAX_PARAM_BYTES)

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

typedef struct {
  int32_t id;
  uint32_t size;
} gl_cbq_allow_row;

/* Closed allowlist. Adding a row requires a pack(4)->pack(8) repack review
 * for any uint64 member (RESEARCH Pitfall 7). */
static const gl_cbq_allow_row gl_cbq_allow[] = {
    {GL_CBQ_ID_GET_TICKET_FOR_WEB_API_RESPONSE, GL_CBQ_MAX_PARAM_BYTES}};

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

#endif /* GAMELIB_CBQUEUE_H */
