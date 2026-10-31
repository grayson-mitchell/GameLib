// Host-compiled harness for native/steam-bridge/helper/gamelib_cbqueue.h.
// Prints `PASS <case>` per case; exits non-zero with `FAIL <case>` on the first failure.
#include <stdio.h>
#include <stdlib.h>
#include <stddef.h>
#include "gamelib_cbqueue.h"
#include "gamelib_callresult.h"

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
  for (int i = 0; i < 33; i++) {
    fill(payload, (uint8_t)(i + 1));
    if (i == 0) memcpy(first, payload, sizeof first);
    if (i == 1) memcpy(second, payload, sizeof second);
    gl_cbq_offer(&ring, 168, payload, 2572);
  }
  CHECK("overflow-count", ring.count == 32 && ring.dropped_full == 1);
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

  /* ---- Phase 58-07: relay rows, repack, call results ---- */
  {
    static const int32_t ids[] = {333, 503, 504, 505, 506, 507, 512, 513, 1202, 1203,
                                  1221, 1222, 1251, 1252, 1281};
    int sizes_ok = 1, repack_ok = 1, wrongsize_ok = 1;
    for (size_t k = 0; k < sizeof ids / sizeof ids[0]; k++) {
      const gl_cbq_allow_row *row = gl_cbq_row(ids[k]);
      if (!row || gl_cbq_allowed_size(ids[k]) != row->winSize) {
        sizes_ok = 0;
        continue;
      }
      uint8_t mac[GL_CBQ_MAX_PARAM_BYTES], win[GL_CBQ_MAX_PARAM_BYTES];
      uint8_t exp[GL_CBQ_MAX_PARAM_BYTES];
      for (uint32_t i = 0; i < row->macSize; i++) mac[i] = (uint8_t)(0x11 + i * 7 + k);
      memset(win, 0xCC, sizeof win);
      gl_cbq_repack_fields(mac, win, row);
      memset(exp, 0, sizeof exp);
      for (uint8_t m = 0; m < row->mapLen; m++)
        memcpy(exp + row->map[m].winOff, mac + row->map[m].macOff, row->map[m].width);
      if (memcmp(win, exp, row->winSize) != 0) repack_ok = 0;
      /* every mapped byte is distinct-pattern; padding must be zero */
      memset(&ring, 0, sizeof ring);
      if (row->macSize != row->winSize && gl_cbq_offer(&ring, ids[k], mac, (int32_t)row->macSize))
        wrongsize_ok = 0;
      memset(&ring, 0, sizeof ring);
      if (!gl_cbq_offer(&ring, ids[k], win, (int32_t)row->winSize)) wrongsize_ok = 0;
    }
    CHECK("relay_row_sizes", sizes_ok && gl_cbq_allowed_size(510) == 0 &&
                                 gl_cbq_allowed_size(513) == 16 && gl_cbq_allowed_size(703) == 0 &&
                                 gl_cr_row(513) == gl_cbq_row(513));
    CHECK("repack_all_rows", repack_ok);
    CHECK("offer_wrong_size_drops", wrongsize_ok);

    /* 1221 and 513 field positions, explicitly */
    uint8_t m1221[704], w1221[712];
    memset(m1221, 0, sizeof m1221);
    uint32_t hconn = 0xA1B2C3D4u, oldst = 3u, st = 3u, fl = 16u;
    memcpy(m1221, &hconn, 4);
    memcpy(m1221 + 4 + 176, &st, 4);
    memcpy(m1221 + 4 + 440, &fl, 4);
    memcpy(m1221 + 700, &oldst, 4);
    gl_cbq_repack_fields(m1221, w1221, gl_cbq_row(1221));
    CHECK("repack_1221_positions",
          memcmp(w1221, &hconn, 4) == 0 && memcmp(w1221 + 8 + 176, &st, 4) == 0 &&
              memcmp(w1221 + 8 + 440, &fl, 4) == 0 && memcmp(w1221 + 704, &oldst, 4) == 0 &&
              all_zero(w1221 + 4, 4) && all_zero(w1221 + 708, 4));
    uint8_t m513[12], w513[16];
    uint32_t er = 1;
    uint64_t lob = 0x1122334455667788ull;
    memcpy(m513, &er, 4);
    memcpy(m513 + 4, &lob, 8);
    gl_cbq_repack_fields(m513, w513, gl_cr_row(513));
    CHECK("repack_513_positions",
          memcmp(w513, &er, 4) == 0 && all_zero(w513 + 4, 4) && memcmp(w513 + 8, &lob, 8) == 0);

    /* 513 as a broadcast: repack through the shared row, offer at 16, pop. */
    {
      static gl_cbq_ring r513;
      uint8_t mb[12], wb[GL_CBQ_MAX_PARAM_BYTES], po[GL_CBQ_DRAIN_RESP_MAX_BYTES];
      uint32_t e1 = 1;
      uint64_t lid = 0x0110000100000042ull;
      memset(&r513, 0, sizeof r513);
      memcpy(mb, &e1, 4);
      memcpy(mb + 4, &lid, 8);
      memset(wb, 0xCC, sizeof wb);
      gl_cbq_repack_fields(mb, wb, gl_cbq_row(513));
      int q = gl_cbq_offer(&r513, 513, wb, 16);
      uint32_t pn = gl_cbq_pop_encode(&r513, po, sizeof po);
      CHECK("offer_513_broadcast",
            q == 1 && pn == 12 + 16 && rd32(po) == 1 && rd32(po + 4) == 513 &&
                rd32(po + 8) == 16 && memcmp(po + 12, &e1, 4) == 0 && all_zero(po + 16, 4) &&
                memcmp(po + 20, &lid, 8) == 0);
    }

    memset(&ring, 0, sizeof ring);
    fill(payload, 5);
    int all_in = 1;
    for (int i = 0; i < 32; i++) all_in &= gl_cbq_offer(&ring, 168, payload, 2572);
    CHECK("ring_32_slots", all_in && ring.count == 32 && ring.dropped_full == 0);
    gl_cbq_offer(&ring, 168, payload, 2572);
    CHECK("ring_33rd_evicts", ring.count == 32 && ring.dropped_full == 1);

    /* call results */
    static gl_cr_state cr;
    uint8_t rout[GL_CR_DRAIN_RESP_MAX_BYTES];
    memset(&cr, 0, sizeof cr);
    CHECK("cr_track_complete",
          gl_cr_track(&cr, 7, 513) == 1 && gl_cr_complete(&cr, 7, m513, 12, 0) == 1 &&
              cr.count == 1);
    uint32_t rn = gl_cr_pop(&cr, rout, sizeof rout);
    uint64_t h7;
    memcpy(&h7, rout + 4, 8);
    CHECK("cr_pop_layout", rn == 24 + 16 && rd32(rout) == 1 && h7 == 7 && rd32(rout + 12) == 513 &&
                               rd32(rout + 16) == 0 && rd32(rout + 20) == 16 &&
                               memcmp(rout + 24, w513, 16) == 0);
    CHECK("cr_pop_zeroes", all_zero((uint8_t *)&cr.ring[0], sizeof cr.ring[0]) && cr.count == 0);
    rn = gl_cr_pop(&cr, rout, sizeof rout);
    CHECK("cr_pop_empty", rn == 4 && rd32(rout) == 0);

    memset(&cr, 0, sizeof cr);
    CHECK("cr_untracked_ignored", gl_cr_complete(&cr, 99, m513, 12, 0) == 0 && cr.count == 0);
    gl_cr_track(&cr, 5, 513);
    CHECK("cr_wrong_size_ignored", gl_cr_complete(&cr, 5, m513, 16, 0) == 0 && cr.count == 0);

    memset(&cr, 0, sizeof cr);
    for (uint64_t i = 1; i <= 17; i++) gl_cr_track(&cr, i, 513);
    CHECK("cr_table_bounded", gl_cr_complete(&cr, 1, m513, 12, 0) == 0 &&
                                  gl_cr_complete(&cr, 17, m513, 12, 0) == 1);

    memset(&cr, 0, sizeof cr);
    gl_cr_track(&cr, 8, 510);
    uint8_t ml[4] = {1, 2, 3, 4};
    CHECK("cr_complete_510", gl_cr_complete(&cr, 8, ml, 4, 0) == 1);
    gl_cr_pop(&cr, rout, sizeof rout);
    gl_cr_track(&cr, 9, 513);
    CHECK("cr_failed_flag", gl_cr_complete(&cr, 9, NULL, 0, 1) == 1);
    rn = gl_cr_pop(&cr, rout, sizeof rout);
    CHECK("cr_failed_layout", rn == 40 && rd32(rout + 16) == 1 && all_zero(rout + 24, 16));
    CHECK("cr_reject_unknown_id", gl_cr_mac_size(513) == 12 && gl_cr_mac_size(510) == 4 &&
                                       gl_cr_mac_size(504) == 20 && gl_cr_track(&cr, 3, 9999) == 0 && gl_cr_track(&cr, 0, 513) == 0);

    memset(&cr, 0, sizeof cr);
    for (uint64_t i = 1; i <= 9; i++) {
      gl_cr_track(&cr, i, 513);
      gl_cr_complete(&cr, i, m513, 12, 0);
    }
    CHECK("cr_ring_bounded", cr.count == 8 && cr.dropped_full == 1);

    CHECK("unlisted_once", gl_cbq_note_unlisted(333) == 1 && gl_cbq_note_unlisted(333) == 0);
    int cap_ok = 1;
    for (int32_t i = 1000; i < 1031; i++) cap_ok &= gl_cbq_note_unlisted(i);
    CHECK("unlisted_cap", cap_ok && gl_cbq_note_unlisted(5000) == 0);
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
