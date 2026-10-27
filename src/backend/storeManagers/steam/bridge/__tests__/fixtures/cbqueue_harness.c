// Host-compiled harness for native/steam-bridge/helper/gamelib_cbqueue.h.
// Prints `PASS <case>` per case; exits non-zero with `FAIL <case>` on the first failure.
#include <stdio.h>
#include <stdlib.h>
#include <stddef.h>
#include "gamelib_cbqueue.h"

#define CHECK(name, cond)                \
  do {                                   \
    if (!(cond)) {                       \
      printf("FAIL %s\n", name);         \
      exit(1);                           \
    }                                    \
    printf("PASS %s\n", name);           \
  } while (0)

static gl_cbq_ring ring;

static void fill(uint8_t *buf, uint8_t seed) {
  for (int i = 0; i < GL_CBQ_MAX_PARAM_BYTES; i++) buf[i] = (uint8_t)(seed + i);
}

static uint32_t rd32(const uint8_t *p) {
  uint32_t v;
  memcpy(&v, p, 4);
  return v;
}

static int all_zero(const uint8_t *p, size_t n) {
  for (size_t i = 0; i < n; i++)
    if (p[i]) return 0;
  return 1;
}

int main(void) {
  uint8_t payload[GL_CBQ_MAX_PARAM_BYTES];
  uint8_t out[GL_CBQ_DRAIN_RESP_MAX_BYTES];

  memset(&ring, 0, sizeof ring);
  fill(payload, 7);
  CHECK("offer-valid", gl_cbq_offer(&ring, 168, payload, 2572) == 1 && ring.count == 1);
  uint32_t n = gl_cbq_pop_encode(&ring, out, sizeof out);
  CHECK("pop-encode-layout",
        n == 2584 && rd32(out) == 1 && rd32(out + 4) == 168 &&
            rd32(out + 8) == 2572 && memcmp(out + 12, payload, 2572) == 0);
  CHECK("pop-zeroes-slot",
        all_zero(ring.slots[0].bytes, GL_CBQ_MAX_PARAM_BYTES) && ring.count == 0);

  memset(out, 0xAA, sizeof out);
  n = gl_cbq_pop_encode(&ring, out, sizeof out);
  CHECK("pop-empty", n == 4 && rd32(out) == 0);

  memset(&ring, 0, sizeof ring);
  CHECK("reject-id-163", gl_cbq_offer(&ring, 163, payload, 2572) == 0 && ring.count == 0);
  CHECK("reject-id-101", gl_cbq_offer(&ring, 101, payload, 2572) == 0 && ring.count == 0);
  CHECK("reject-size-2571", gl_cbq_offer(&ring, 168, payload, 2571) == 0);
  CHECK("reject-size-2573", gl_cbq_offer(&ring, 168, payload, 2573) == 0);
  CHECK("reject-size-0", gl_cbq_offer(&ring, 168, payload, 0) == 0);
  CHECK("reject-size-neg", gl_cbq_offer(&ring, 168, payload, -1) == 0);
  CHECK("reject-null", gl_cbq_offer(&ring, 168, NULL, 2572) == 0 && ring.count == 0);

  memset(&ring, 0, sizeof ring);
  uint8_t first[GL_CBQ_MAX_PARAM_BYTES], second[GL_CBQ_MAX_PARAM_BYTES];
  for (int i = 0; i < 9; i++) {
    fill(payload, (uint8_t)(i + 1));
    if (i == 0) memcpy(first, payload, sizeof first);
    if (i == 1) memcpy(second, payload, sizeof second);
    gl_cbq_offer(&ring, 168, payload, 2572);
  }
  CHECK("overflow-count", ring.count == 8 && ring.dropped_full == 1);
  n = gl_cbq_pop_encode(&ring, out, sizeof out);
  CHECK("drop-oldest", n == 2584 && memcmp(out + 12, second, 2572) == 0 &&
                           memcmp(out + 12, first, 2572) != 0);
  CHECK("evicted-slot-zero", all_zero(ring.slots[1].bytes, GL_CBQ_MAX_PARAM_BYTES));

  memset(&ring, 0, sizeof ring);
  fill(payload, 3);
  gl_cbq_offer(&ring, 168, payload, 2572);
  CHECK("small-cap-keeps-entry",
        gl_cbq_pop_encode(&ring, out, GL_CBQ_DRAIN_RESP_MAX_BYTES - 1) == 0 &&
            ring.count == 1);
  CHECK("tiny-cap", gl_cbq_pop_encode(&ring, out, 3) == 0 && ring.count == 1);

  /* ---- 1101 UserStatsReceived_t (quick k51) ---- */
  {
    uint8_t mac[20], win[24], ex[24];
    uint64_t gid = 0x1122334455667788ull, sid = 0x0102030405060708ull;
    int32_t er = 1;
    memset(mac, 0xEE, sizeof mac);
    memcpy(mac, &gid, 8);
    memcpy(mac + 8, &er, 4);
    memcpy(mac + 12, &sid, 8);
    memset(win, 0xCC, sizeof win);
    gl_cbq_repack_user_stats(mac, win);
    memset(ex, 0, sizeof ex);
    memcpy(ex, &gid, 8);
    memcpy(ex + 8, &er, 4);
    memcpy(ex + 16, &sid, 8);
    CHECK("usr-repack", memcmp(win, ex, 24) == 0 && all_zero(win + 12, 4));

    memset(&ring, 0, sizeof ring);
    CHECK("reject-1101-mac-size",
          gl_cbq_offer(&ring, 1101, mac, 20) == 0 && ring.dropped_filtered == 1 &&
              ring.count == 0);
    CHECK("offer-1101-wire", gl_cbq_offer(&ring, 1101, win, 24) == 1 && ring.count == 1);
    n = gl_cbq_pop_encode(&ring, out, sizeof out);
    CHECK("pop-1101-layout",
          n == 12 + 24 && rd32(out) == 1 && rd32(out + 4) == 1101 &&
              rd32(out + 8) == 24 && memcmp(out + 12, win, 24) == 0);

    /* stats machine */
    const uint64_t app = 411300;
    gl_stats_fwd st;
    uint8_t mine[20], other[20], cmp[24];
    uint64_t g2 = 999;
    memset(mine, 0, sizeof mine);
    memcpy(mine, &app, 8);
    memcpy(mine + 8, &er, 4);
    memcpy(mine + 12, &sid, 8);
    memset(other, 0, sizeof other);
    memcpy(other, &g2, 8);
    gl_cbq_repack_user_stats(mine, cmp);

    memset(&st, 0, sizeof st);
    memset(&ring, 0, sizeof ring);
    CHECK("obs-first-forwards",
          gl_stats_on_observed(&st, &ring, mine, 20, app) == GL_STATS_OBS_QUEUED &&
              st.initial_forwarded == 1 && st.have_cached == 1 && ring.count == 1 &&
              memcmp(ring.slots[ring.head].bytes, cmp, 24) == 0);
    CHECK("obs-later-caches-only",
          gl_stats_on_observed(&st, &ring, mine, 20, app) == GL_STATS_OBS_CACHED &&
              ring.count == 1);

    memset(&st, 0, sizeof st);
    memset(&ring, 0, sizeof ring);
    CHECK("obs-other-app",
          gl_stats_on_observed(&st, &ring, other, 20, app) == GL_STATS_OBS_OTHER_APP &&
              st.have_cached == 0 && ring.count == 0 && st.initial_forwarded == 0);
    CHECK("obs-bad-size",
          gl_stats_on_observed(&st, &ring, mine, 16, app) == GL_STATS_OBS_BAD &&
              gl_stats_on_observed(&st, &ring, NULL, 20, app) == GL_STATS_OBS_BAD &&
              st.have_cached == 0 && ring.count == 0 && st.initial_forwarded == 0);

    /* request with cache and empty ring queues the cached bytes */
    memset(&st, 0, sizeof st);
    memset(&ring, 0, sizeof ring);
    gl_stats_on_observed(&st, &ring, mine, 20, app);
    gl_cbq_pop_encode(&ring, out, sizeof out); /* consumed by the game */
    CHECK("req-cached",
          gl_stats_on_request(&st, &ring) == GL_STATS_REQ_QUEUED_CACHED &&
              ring.count == 1 && memcmp(ring.slots[ring.head].bytes, cmp, 24) == 0);
    CHECK("req-already-queued",
          gl_stats_on_request(&st, &ring) == GL_STATS_REQ_ALREADY_QUEUED &&
              ring.count == 1);

    memset(&st, 0, sizeof st);
    memset(&ring, 0, sizeof ring);
    st.pending_call = 77;
    CHECK("req-need-fetch",
          gl_stats_on_request(&st, &ring) == GL_STATS_REQ_NEED_FETCH && st.pending == 1 &&
              st.pending_call == 77 && ring.count == 0);
    /* the first own-app observe was already forwarded, so only pending forwards */
    st.initial_forwarded = 1;
    CHECK("obs-after-pending",
          gl_stats_on_observed(&st, &ring, mine, 20, app) == GL_STATS_OBS_QUEUED &&
              st.pending == 0 && st.pending_call == 0 && ring.count == 1);
  }

#if UINTPTR_MAX == 0xFFFFFFFFFFFFFFFFu
  CHECK("offsets", offsetof(gl_CallbackMsg_t, m_iCallback) == 4 &&
                       offsetof(gl_CallbackMsg_t, m_pubParam) == 8 &&
                       offsetof(gl_CallbackMsg_t, m_cubParam) == 16);
#else
  CHECK("offsets", 1);
#endif
  return 0;
}
