/*
 * Host harness for the generated callback registry (55-04, P55-3).
 * The test writes generateCallbackRegistryC() to gl_cb_registry.c and this
 * file includes it, so the SAME generated text that ships is what is proven.
 * Locks are ERRORCHECK mutexes: a re-lock returns EDEADLK and we exit(1)
 * instead of hanging.
 */
/*
 * Feature-test macro: MUST precede every system include. The test compiles
 * with -std=c11, which on glibc (the ubuntu CI runner) sets __STRICT_ANSI__
 * and hides usleep(), pthread_mutexattr_settype() and
 * PTHREAD_MUTEX_ERRORCHECK, all of which this host scaffolding uses. Darwin's
 * headers expose them regardless, which is why the harness only ever compiled
 * on a Mac until the Test workflow ran it on Linux. Harmless on Darwin.
 */
#define _GNU_SOURCE
#include <errno.h>
#include <pthread.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#define THISCALL

static pthread_mutex_t g_reg;
static pthread_mutex_t g_bridge;
static const char *g_case = "?";

static void fail_at(const char *what, int line) {
  printf("FAIL %s %s:%d\n", g_case, what, line);
  fflush(stdout);
  exit(1);
}
#define CHECK(c)                                                              \
  do {                                                                        \
    if (!(c)) fail_at(#c, __LINE__);                                          \
  } while (0)

static void h_lock(void) {
  int r = pthread_mutex_lock(&g_reg);
  if (r) {
    printf("FAIL lock %d\n", r);
    fflush(stdout);
    exit(1);
  }
}
static void h_unlock(void) {
  int r = pthread_mutex_unlock(&g_reg);
  if (r) {
    printf("FAIL unlock %d\n", r);
    fflush(stdout);
    exit(1);
  }
}
#define GL_CB_LOCK() h_lock()
#define GL_CB_UNLOCK() h_unlock()

/* Thread ids for the in-flight rule (WR-01): a per-thread counter value. */
static _Thread_local uint32_t h_tid_val;
static uint32_t h_tid_next = 1;
static uint32_t h_tid(void) {
  if (h_tid_val == 0) h_tid_val = __atomic_fetch_add(&h_tid_next, 1, __ATOMIC_SEQ_CST);
  return h_tid_val;
}
#define GL_CB_THREAD_ID() h_tid()
#define GL_CB_YIELD() usleep(1000)

/* ---- scripted transport + fake clock ---- */
#define MAXQ 16
#define CAP 2584
typedef struct {
  int ok;
  uint32_t len;
  uint8_t data[2700];
} reply_t;
static reply_t g_q[MAXQ];
static int g_qhead, g_qtail;
static int g_tcalls;
static uint8_t *g_lastbuf;
static uint32_t g_now;
static uint8_t g_expect[2572];

static uint32_t gl_cb_now_ms(void) { return g_now; }

static int gl_cb_transport_drain(uint8_t *buf, uint32_t cap,
                                 uint32_t *lenOut) {
  int r;
  g_tcalls++;
  g_lastbuf = buf;
  r = pthread_mutex_trylock(&g_reg);
  CHECK(r == 0); /* registry lock must NOT be held across the transport */
  pthread_mutex_unlock(&g_reg);
  if (g_qhead == g_qtail) {
    memset(buf, 0, 4);
    *lenOut = 4;
    return 1;
  }
  {
    reply_t *q = &g_q[g_qhead++];
    if (!q->ok) return 0;
    CHECK(q->len <= cap);
    memcpy(buf, q->data, q->len);
    *lenOut = q->len;
    return 1;
  }
}

/* 58-10: scripted call-result transport (CONTROL slot 11). */
static reply_t g_cq[MAXQ];
static int g_cqhead, g_cqtail;
static int g_ctcalls;
static uint8_t *g_lastcrbuf;

static int gl_cb_transport_drain_cr(uint8_t *buf, uint32_t cap,
                                    uint32_t *lenOut) {
  int r;
  g_ctcalls++;
  g_lastcrbuf = buf;
  r = pthread_mutex_trylock(&g_reg);
  CHECK(r == 0); /* registry lock must NOT be held across the transport */
  pthread_mutex_unlock(&g_reg);
  if (g_cqhead == g_cqtail) {
    memset(buf, 0, 4);
    *lenOut = 4;
    return 1;
  }
  {
    reply_t *q = &g_cq[g_cqhead++];
    if (!q->ok) return 0;
    CHECK(q->len <= cap);
    memcpy(buf, q->data, q->len);
    *lenOut = q->len;
    return 1;
  }
}

/* quick k51: the embedder hook. Records every report and asserts the registry
 * lock is NOT held when it is called. */
#define MAXREP 32
static struct {
  int32_t id;
  uint32_t nd;
  uint32_t held;
} g_rep[MAXREP];
static int g_nrep;
static void gl_cb_report_dispatch(int32_t id, uint32_t ndispatched,
                                  uint32_t held) {
  int r = pthread_mutex_trylock(&g_reg);
  CHECK(r == 0); /* report_hook_unlocked: registry lock must NOT be held */
  pthread_mutex_unlock(&g_reg);
  CHECK(g_nrep < MAXREP);
  g_rep[g_nrep].id = id;
  g_rep[g_nrep].nd = ndispatched;
  g_rep[g_nrep].held = held;
  g_nrep++;
}

/* 58-14: the networking function-pointer hook. Inert (id 0, any 0) except in
 * the net_intercept_* cases. Asserts the registry lock is NOT held. */
static int32_t g_net_icept_id;
static int g_net_icept_calls;
static int g_net_any;
static int h_icept(int32_t id, void *param) {
  int r;
  (void)param;
  if (id != g_net_icept_id) return 0;
  r = pthread_mutex_trylock(&g_reg);
  CHECK(r == 0); /* net_intercept: registry lock must NOT be held */
  pthread_mutex_unlock(&g_reg);
  g_net_icept_calls++;
  return 1;
}
#define GL_NET_CB_INTERCEPT(id, param) h_icept((id), (param))
#define GL_NET_CB_ANY() g_net_any

#include "gl_cb_registry.c"

typedef struct fobj {
  void **vptr;
  uint8_t flags;
  uint8_t pad[3];
  int32_t iCallback;
  int calls;
  int payload_ok;
  int lock_free;
  uint8_t got[24];
  int cr_calls;
  uint64_t cr_h;
  int cr_failed;
  int cr_lock_free;
  uint8_t cr_got[24];
} fobj;

_Static_assert(offsetof(fobj, flags) == GL_CB_FLAGS_OFF, "flags offset");
_Static_assert(offsetof(fobj, iCallback) == GL_CB_ICALLBACK_OFF,
               "iCallback offset");

static fobj objA, objB, objG, objR, objS, objX, objU, objC, objD, objY;
static fobj bulk[520];

static void trap(void *self) {
  (void)self;
  printf("FAIL %s trap vtable slot called\n", g_case);
  fflush(stdout);
  exit(1);
}
static void h_run1(void *self, void *param);
static int g_x_run_done;
static int g_x_saw_done = -1;
static pthread_t g_x_thread;
static void *xthread_unregister(void *arg) {
  (void)arg;
  gl_cb_unregister(&objX);
  g_x_saw_done = __atomic_load_n(&g_x_run_done, __ATOMIC_SEQ_CST);
  return NULL;
}
static void h_run3(void *self, void *param, int failed, uint64_t h);
static void *g_vt[4] = {(void *)h_run3, (void *)h_run1, (void *)trap,
                        (void *)trap};
static int g_y_run_done;
static int g_y_saw_done = -1;
static pthread_t g_y_thread;
static uint64_t g_y_h;
static void *ythread_unregister(void *arg) {
  (void)arg;
  gl_cr_unregister(&objY, g_y_h);
  g_y_saw_done = __atomic_load_n(&g_y_run_done, __ATOMIC_SEQ_CST);
  return NULL;
}

static void h_run3(void *self, void *param, int failed, uint64_t h) {
  fobj *o = (fobj *)self;
  int r = pthread_mutex_trylock(&g_reg);
  o->cr_calls++;
  o->cr_lock_free = (r == 0);
  if (r == 0) pthread_mutex_unlock(&g_reg);
  o->cr_h = h;
  o->cr_failed = failed;
  if (param) memcpy(o->cr_got, param, 16);
  if (o == &objY) {
    pthread_t t;
    g_y_h = h;
    CHECK(pthread_create(&t, NULL, ythread_unregister, NULL) == 0);
    usleep(50000);
    __atomic_store_n(&g_y_run_done, 1, __ATOMIC_SEQ_CST);
    g_y_thread = t;
  }
}

static void h_run1(void *self, void *param) {
  fobj *o = (fobj *)self;
  int r = pthread_mutex_trylock(&g_reg);
  o->calls++;
  o->lock_free = (r == 0);
  if (r == 0) pthread_mutex_unlock(&g_reg);
  if (param && o->iCallback != 168) {
    memcpy(o->got, param, 24);
    o->payload_ok = 1;
  } else if (param) {
    o->payload_ok = (memcmp(param, g_expect, sizeof g_expect) == 0);
  }
  if (o == &objX) {
    /* WR-01: another thread unregisters this object while Run is in
     * flight; it must not return before Run does. */
    pthread_t t;
    CHECK(pthread_create(&t, NULL, xthread_unregister, NULL) == 0);
    usleep(50000);
    __atomic_store_n(&g_x_run_done, 1, __ATOMIC_SEQ_CST);
    g_x_thread = t;
  }
  if (o == &objR) {
    gl_cb_unregister(&objR);
    gl_cb_register(&objS, 168);
    CHECK(pthread_mutex_lock(&g_bridge) == 0);
    CHECK(pthread_mutex_unlock(&g_bridge) == 0);
  }
}

static void init_obj(fobj *o) {
  memset(o, 0, sizeof *o);
  o->vptr = g_vt;
}

static void reset(void) {
  size_t i;
  gl_cb_clear_all();
  gl_cb_have_drained = 0;
  gl_cb_fail_count = 0;
  gl_cb_overflow = 0;
  gl_cb_no_target = 0;
  memset(gl_cb_held, 0, sizeof gl_cb_held);
  memset(gl_cr_held, 0, sizeof gl_cr_held);
  gl_cr_count = 0;
  gl_cr_held_count = 0;
  gl_cr_overflow = 0;
  gl_cr_held_overflow = 0;
  gl_cr_held_expired = 0;
  gl_cr_fail_count = 0;
  gl_cr_last_fail_ms = 0;
  gl_cb_running = 0;
  gl_md_enabled = 0;
  gl_md_head = gl_md_count = 0;
  gl_md_front_out = gl_md_front_reported = 0;
  gl_md_dropped = 0;
  gl_md_running = 0;
  gl_md_have_run = 0;
  gl_md_res_dropped = 0;
  gl_md_poll_have = 0;
  memset(gl_md_fifo, 0, sizeof gl_md_fifo);
  memset(gl_md_results, 0, sizeof gl_md_results);
  g_cqhead = g_cqtail = 0;
  g_ctcalls = 0;
  g_lastcrbuf = NULL;
  g_nrep = 0;
  g_qhead = g_qtail = 0;
  g_tcalls = 0;
  g_lastbuf = NULL;
  g_now += 100000u;
  init_obj(&objA);
  init_obj(&objB);
  init_obj(&objG);
  init_obj(&objR);
  init_obj(&objS);
  init_obj(&objX);
  init_obj(&objU);
  init_obj(&objC);
  init_obj(&objD);
  init_obj(&objY);
  for (i = 0; i < sizeof bulk / sizeof bulk[0]; i++) init_obj(&bulk[i]);
}

static void push_raw(int ok, const void *d, uint32_t len) {
  reply_t *q = &g_q[g_qtail++];
  CHECK(g_qtail <= MAXQ);
  q->ok = ok;
  q->len = len;
  if (d) memcpy(q->data, d, len);
}

/* [u32 count][i32 id][u32 cub][bodylen bytes]; body = hdr{h,1,4} then 0xAB */
static void push_msg(int32_t id, uint32_t count, uint32_t cub,
                     uint32_t bodylen) {
  uint8_t tmp[2700];
  uint32_t i;
  uint32_t hdr[3] = {0x11223344u, 1u, 4u};
  memcpy(tmp, &count, 4);
  memcpy(tmp + 4, &id, 4);
  memcpy(tmp + 8, &cub, 4);
  for (i = 0; i < bodylen; i++) {
    tmp[12 + i] = i < 12 ? ((uint8_t *)hdr)[i] : 0xAB;
  }
  push_raw(1, tmp, 12 + bodylen);
}

/* [u32 1][i32 1101][u32 24][24 bytes all `seed`] */
static void push_1101(uint8_t seed) {
  uint8_t tmp[12 + 24];
  uint32_t one = 1u, cub = 24u;
  int32_t id = 1101;
  memcpy(tmp, &one, 4);
  memcpy(tmp + 4, &id, 4);
  memcpy(tmp + 8, &cub, 4);
  memset(tmp + 12, seed, 24);
  push_raw(1, tmp, sizeof tmp);
}

static int held_valid(int32_t id) {
  int row = gl_cb_relay_row_index(id);
  return row >= 0 && gl_cb_held[row].valid;
}

#define PASS() printf("PASS %s\n", g_case)

static void case_register_sets_flag_and_id(void) {
  g_case = "register_sets_flag_and_id";
  reset();
  objG.flags = 0x02;
  gl_cb_register(&objA, 168);
  gl_cb_register(&objG, 168);
  CHECK(objA.flags == 0x01);
  CHECK(objA.iCallback == 168);
  CHECK(objG.flags == 0x03);
  CHECK(gl_cb_count == 2);
  PASS();
}

static void case_unregister_clears(void) {
  g_case = "unregister_clears";
  reset();
  objG.flags = 0x02;
  gl_cb_register(&objA, 168);
  gl_cb_register(&objG, 168);
  gl_cb_unregister(&objA);
  CHECK((objA.flags & 0x01) == 0);
  gl_cb_unregister(&objG);
  CHECK(objG.flags == 0x02);
  CHECK(gl_cb_count == 0);
  objB.flags = 0x01;
  gl_cb_unregister(&objB);
  CHECK(objB.flags == 0);
  PASS();
}

static void case_gate_no_relay_ids(void) {
  g_case = "gate_no_relay_ids";
  reset();
  gl_cb_register(&objB, 101);
  gl_cb_run_callbacks();
  CHECK(g_tcalls == 0);
  PASS();
}

static void case_dispatch_matching_only(void) {
  g_case = "dispatch_matching_only";
  reset();
  objG.flags = 0x02;
  gl_cb_register(&objA, 168);
  gl_cb_register(&objB, 101);
  gl_cb_register(&objG, 168);
  push_msg(168, 1, 2572, 2572);
  gl_cb_run_callbacks();
  CHECK(objA.calls == 1);
  CHECK(objA.payload_ok == 1);
  CHECK(objB.calls == 0);
  CHECK(objG.calls == 0);
  PASS();
}

static void case_no_lock_held(void) {
  g_case = "no_lock_held";
  reset();
  gl_cb_register(&objA, 168);
  push_msg(168, 1, 2572, 2572);
  gl_cb_run_callbacks();
  CHECK(objA.calls == 1);
  CHECK(objA.lock_free == 1);
  CHECK(g_tcalls >= 1); /* transport asserts trylock==0 itself */
  PASS();
}

static void case_reentrant_handler(void) {
  g_case = "reentrant_handler";
  reset();
  gl_cb_register(&objR, 168);
  push_msg(168, 1, 2572, 2572);
  gl_cb_run_callbacks();
  CHECK(objR.calls == 1);
  CHECK((objR.flags & 0x01) == 0);
  CHECK((objS.flags & 0x01) == 1);
  CHECK(objS.iCallback == 168);
  CHECK(gl_cb_count == 1);
  PASS();
}

static void case_cross_thread_unregister_waits(void) {
  g_case = "cross_thread_unregister_waits";
  reset();
  g_x_run_done = 0;
  g_x_saw_done = -1;
  gl_cb_register(&objX, 168);
  push_msg(168, 1, 2572, 2572);
  gl_cb_run_callbacks();
  CHECK(objX.calls == 1);
  CHECK(pthread_join(g_x_thread, NULL) == 0);
  CHECK(g_x_saw_done == 1);
  CHECK((objX.flags & 0x01) == 0);
  CHECK(gl_cb_count == 0);
  CHECK(gl_cb_dispatching == NULL);
  CHECK(gl_cb_running == 0);
  PASS();
}

static void case_no_target_counted(void) {
  g_case = "no_target_counted";
  reset();
  objG.flags = 0x02; /* gameserver-only handler: never a target */
  gl_cb_register(&objG, 168);
  push_msg(168, 1, 2572, 2572);
  gl_cb_run_callbacks();
  CHECK(objG.calls == 0);
  CHECK(gl_cb_no_target == 1);
  gl_cb_register(&objA, 168);
  push_msg(168, 1, 2572, 2572);
  g_now += 31;
  gl_cb_run_callbacks();
  CHECK(objA.calls == 1);
  CHECK(gl_cb_no_target == 1);
  PASS();
}

static void case_reentrant_run_skipped(void) {
  g_case = "reentrant_run_skipped";
  reset();
  gl_cb_register(&objA, 168);
  gl_cb_running = 1; /* as if another RunCallbacks were in flight */
  push_msg(168, 1, 2572, 2572);
  gl_cb_run_callbacks();
  CHECK(g_tcalls == 0);
  CHECK(objA.calls == 0);
  gl_cb_running = 0;
  gl_cb_run_callbacks();
  CHECK(g_tcalls >= 1);
  CHECK(objA.calls == 1);
  PASS();
}

static void case_throttle(void) {
  uint32_t t;
  g_case = "throttle";
  reset();
  gl_cb_register(&objA, 168);
  t = g_now;
  gl_cb_run_callbacks();
  g_now = t + 10;
  gl_cb_run_callbacks();
  CHECK(g_tcalls == 1);
  g_now = t + 31;
  gl_cb_run_callbacks();
  CHECK(g_tcalls == 2);
  PASS();
}

static void case_max_per_run(void) {
  int i;
  g_case = "max_per_run";
  reset();
  gl_cb_register(&objA, 168);
  for (i = 0; i < 6; i++) push_msg(168, 1, 2572, 2572);
  gl_cb_run_callbacks();
  CHECK(g_tcalls == 4);
  CHECK(objA.calls == 4);
  PASS();
}

static void case_backoff(void) {
  int i;
  g_case = "backoff";
  reset();
  gl_cb_register(&objA, 168);
  for (i = 0; i < 8; i++) push_raw(0, NULL, 0);
  for (i = 0; i < 8; i++) {
    g_now += 31;
    gl_cb_run_callbacks();
  }
  CHECK(g_tcalls == 8);
  g_now += 31;
  gl_cb_run_callbacks();
  CHECK(g_tcalls == 8);
  g_now += 500;
  gl_cb_run_callbacks();
  CHECK(g_tcalls == 8);
  g_now += 470; /* 1001 ms since the last attempt */
  gl_cb_run_callbacks();
  CHECK(g_tcalls == 9);
  CHECK(gl_cb_fail_count == 0);
  g_now += 31;
  gl_cb_run_callbacks();
  CHECK(g_tcalls == 10);
  PASS();
}

static void malformed_one(const char *name, int which) {
  uint8_t two[2] = {1, 0};
  uint32_t eight[2] = {1u, 168u};
  g_case = name;
  reset();
  gl_cb_register(&objA, 168);
  switch (which) {
    case 0: push_msg(168, 2, 2572, 2572); break;
    case 1: push_msg(168, 1, 2572, 2000); break;
    case 2: push_msg(168, 1, 2571, 2571); break;
    case 3: push_msg(999, 1, 2572, 2572); break;
    case 4: push_raw(1, two, 2); break;
    default: push_raw(1, eight, 8); break;
  }
  gl_cb_run_callbacks();
  CHECK(objA.calls == 0);
}

static void case_malformed(void) {
  malformed_one("malformed", 0);
  malformed_one("malformed", 1);
  malformed_one("malformed", 2);
  malformed_one("malformed", 3);
  malformed_one("malformed", 4);
  malformed_one("malformed", 5);
  g_case = "malformed";
  PASS();
}

static void case_capacity(void) {
  int i;
  g_case = "capacity";
  reset();
  for (i = 0; i < 513; i++) gl_cb_register(&bulk[i], 168);
  CHECK(gl_cb_count == 512);
  CHECK(bulk[511].flags == 0x01);
  CHECK(bulk[512].flags == 0);
  CHECK(bulk[512].iCallback == 0);
  CHECK(gl_cb_overflow >= 1);
  PASS();
}

static void case_clear_all(void) {
  g_case = "clear_all";
  reset();
  gl_cb_register(&objA, 168);
  gl_cb_clear_all();
  CHECK(gl_cb_count == 0);
  CHECK(objA.flags == 0x01); /* clear_all does not write object memory */
  gl_cb_run_callbacks();
  CHECK(g_tcalls == 0);
  PASS();
}

static void case_buffer_zeroed(void) {
  int left = 0;
  uint32_t i;
  g_case = "buffer_zeroed";
  reset();
  gl_cb_register(&objA, 168);
  push_msg(168, 1, 2572, 2572);
  gl_cb_run_callbacks();
  /* inline scan, no calls: the dead frame is still intact */
  if (g_lastbuf) {
    for (i = 0; i < CAP; i++)
      if (g_lastbuf[i] == 0xAB) left++;
  }
  CHECK(objA.calls == 1);
  CHECK(g_lastbuf != NULL);
  CHECK(left == 0);
  PASS();
}

static void case_relay_1101_dispatch(void) {
  uint8_t want[24];
  g_case = "relay_1101_dispatch";
  reset();
  memset(want, 0x5A, sizeof want);
  gl_cb_register(&objU, 1101);
  push_1101(0x5A);
  gl_cb_run_callbacks();
  CHECK(objU.calls == 1);
  CHECK(objU.payload_ok == 1);
  CHECK(memcmp(objU.got, want, 24) == 0);
  CHECK(objU.lock_free == 1);
  CHECK(g_nrep == 1);
  CHECK(g_rep[0].id == 1101 && g_rep[0].nd == 1 && g_rep[0].held == 0);
  CHECK(!held_valid(1101));
  PASS();
}

static void case_hold_1101_until_listener(void) {
  uint8_t want[24];
  g_case = "hold_1101_until_listener";
  reset();
  gl_cb_register(&objA, 168); /* keeps the drain running, but no 1101 listener */
  push_1101(0x11);
  gl_cb_run_callbacks();
  CHECK(objA.calls == 0);
  CHECK(gl_cb_no_target == 0); /* held, not dropped */
  CHECK(held_valid(1101));
  CHECK(g_nrep == 1);
  CHECK(g_rep[0].id == 1101 && g_rep[0].nd == 0 && g_rep[0].held == 1);
  /* a second held 1101 replaces the first (latest wins) */
  push_1101(0x22);
  g_now += 31;
  gl_cb_run_callbacks();
  CHECK(held_valid(1101));
  CHECK(gl_cb_no_target == 0);
  CHECK(g_nrep == 2);
  CHECK(g_rep[1].id == 1101 && g_rep[1].nd == 0 && g_rep[1].held == 1);
  /* a listener registers: the next RunCallbacks dispatches the held bytes */
  gl_cb_register(&objU, 1101);
  g_now += 31;
  gl_cb_run_callbacks();
  memset(want, 0x22, sizeof want);
  CHECK(objU.calls == 1);
  CHECK(memcmp(objU.got, want, 24) == 0);
  CHECK(!held_valid(1101));
  CHECK(g_nrep == 3);
  CHECK(g_rep[2].id == 1101 && g_rep[2].nd == 1 && g_rep[2].held == 0);
  /* delivered once: not dispatched again */
  g_now += 31;
  gl_cb_run_callbacks();
  CHECK(objU.calls == 1);
  PASS();
}

static void case_hold_dispatches_before_new_drain(void) {
  uint8_t want[24];
  g_case = "hold_dispatches_before_new_drain";
  reset();
  gl_cb_register(&objA, 168);
  push_1101(0x33);
  gl_cb_run_callbacks();
  CHECK(held_valid(1101));
  gl_cb_register(&objU, 1101);
  push_1101(0x44); /* newer message waiting in the helper */
  g_now += 31;
  gl_cb_run_callbacks();
  /* held 0x33 first, then the drained 0x44 */
  CHECK(objU.calls == 2);
  memset(want, 0x44, sizeof want);
  CHECK(memcmp(objU.got, want, 24) == 0);
  CHECK(g_nrep == 3);
  CHECK(g_rep[1].nd == 1 && g_rep[1].held == 0);
  CHECK(g_rep[2].nd == 1 && g_rep[2].held == 0);
  PASS();
}

static void case_no_hold_168(void) {
  int left = 0;
  uint32_t i;
  g_case = "no_hold_168";
  reset();
  objG.flags = 0x02; /* gameserver-only: no live target */
  gl_cb_register(&objG, 168);
  push_msg(168, 1, 2572, 2572);
  gl_cb_run_callbacks();
  CHECK(gl_cb_no_target == 1);
  CHECK(!held_valid(168));
  CHECK(g_nrep == 1);
  CHECK(g_rep[0].id == 168 && g_rep[0].nd == 0 && g_rep[0].held == 0);
  /* the held store never contains a 168 byte (ticket) */
  for (i = 0; i < sizeof gl_cb_held; i++)
    if (((uint8_t *)gl_cb_held)[i] != 0) left++;
  CHECK(left == 0);
  left = 0;
  CHECK(g_lastbuf != NULL);
  for (i = 0; i < CAP; i++)
    if (g_lastbuf[i] == 0xAB) left++;
  CHECK(left == 0);
  PASS();
}

static void case_report_hook_unlocked(void) {
  g_case = "report_hook_unlocked";
  reset();
  gl_cb_register(&objU, 1101);
  gl_cb_register(&objA, 168);
  push_1101(0x01);
  push_msg(168, 1, 2572, 2572);
  gl_cb_run_callbacks();
  /* the hook CHECKs trylock==0 on every call */
  CHECK(g_nrep == 2);
  PASS();
}

/* [u32 1][u64 h][i32 id][u32 failed][u32 cub][cub bytes all `seed`] */
static void push_cr_raw(uint64_t h, int32_t id, uint32_t failed, uint32_t cub,
                        uint32_t bodylen, uint8_t seed) {
  uint8_t tmp[2700];
  uint32_t one = 1u;
  memcpy(tmp, &one, 4);
  memcpy(tmp + 4, &h, 8);
  memcpy(tmp + 12, &id, 4);
  memcpy(tmp + 16, &failed, 4);
  memcpy(tmp + 20, &cub, 4);
  memset(tmp + 24, seed, bodylen);
  {
    reply_t *q = &g_cq[g_cqtail++];
    CHECK(g_cqtail <= MAXQ);
    q->ok = 1;
    q->len = 24 + bodylen;
    memcpy(q->data, tmp, q->len);
  }
}
static void push_cr(uint64_t h, int32_t id, uint32_t failed, uint8_t seed) {
  uint32_t cub = id == 513 ? 16u : id == 510 ? 4u : 24u;
  push_cr_raw(h, id, failed, cub, cub, seed);
}

static int all_zero(const void *p, size_t n) {
  size_t i;
  for (i = 0; i < n; i++)
    if (((const uint8_t *)p)[i] != 0) return 0;
  return 1;
}

static void case_relay_504_dispatch(void) {
  g_case = "relay_504_dispatch";
  reset();
  gl_cb_register(&objA, 504);
  gl_cb_register(&objB, 503);
  push_msg(504, 1, 24, 24);
  gl_cb_run_callbacks();
  CHECK(objA.calls == 1);
  CHECK(memcmp(objA.got, g_expect, 24) == 0);
  CHECK(objB.calls == 0);
  CHECK(g_nrep == 1 && g_rep[0].id == 504 && g_rep[0].nd == 1);
  CHECK(!held_valid(504)); /* broadcast rows are never held */
  PASS();
}

static void case_relay_1221_dispatch(void) {
  g_case = "relay_1221_dispatch";
  reset();
  gl_cb_register(&objA, 1221);
  gl_cb_register(&objB, 1222);
  push_msg(1221, 1, 712, 712);
  gl_cb_run_callbacks();
  CHECK(objA.calls == 1);
  CHECK(memcmp(objA.got, g_expect, 24) == 0);
  CHECK(objB.calls == 0);
  PASS();
}

static void case_net_intercept_registry(void) {
  g_case = "net_intercept_registry";
  reset();
  g_net_any = 1;
  g_net_icept_id = 1221;
  g_net_icept_calls = 0;
  /* no CCallback registered at all: a stored function pointer alone drains */
  push_msg(1221, 1, 712, 712);
  gl_cb_run_callbacks();
  CHECK(g_tcalls >= 1); /* drained although no CCallback is registered */
  CHECK(g_net_icept_calls == 1);
  CHECK(g_nrep == 1 && g_rep[0].id == 1221 && g_rep[0].nd == 1 && g_rep[0].held == 0);
  /* a registered CCallback for the same id is bypassed: the function wins */
  gl_cb_register(&objA, 1221);
  push_msg(1221, 1, 712, 712);
  g_now += 31;
  gl_cb_run_callbacks();
  CHECK(g_net_icept_calls == 2);
  CHECK(objA.calls == 0);
  /* another id still reaches its CCallback */
  gl_cb_register(&objB, 1222);
  push_msg(1222, 1, 260, 260);
  g_now += 31;
  gl_cb_run_callbacks();
  CHECK(objB.calls == 1);
  CHECK(g_net_icept_calls == 2);
  /* without the hook (any 0, no listener) nothing is pulled */
  g_net_any = 0;
  g_net_icept_id = 0;
  gl_cb_clear_all();
  g_tcalls = 0;
  push_msg(1221, 1, 712, 712);
  g_now += 31;
  gl_cb_run_callbacks();
  CHECK(g_tcalls == 0);
  PASS();
}

static void case_net_intercept_md(void) {
  uint8_t raw[24];
  g_case = "net_intercept_md";
  reset();
  g_net_any = 0;
  g_net_icept_id = 1281;
  g_net_icept_calls = 0;
  gl_md_init();
  push_msg(1281, 1, 272, 272);
  gl_md_run_frame();
  CHECK(g_net_icept_calls == 1);
  CHECK(gl_md_get_next(raw) == 0); /* consumed, never queued */
  CHECK(g_nrep == 1 && g_rep[0].id == 1281 && g_rep[0].nd == 1);
  push_msg(1221, 1, 712, 712);
  g_now += 31;
  gl_md_run_frame();
  CHECK(g_net_icept_calls == 1);
  CHECK(gl_md_get_next(raw) == 1); /* an unmatched id is queued as before */
  g_net_icept_id = 0;
  PASS();
}

static void case_cr_register_complete(void) {
  uint8_t want[16];
  g_case = "cr_register_complete";
  reset();
  memset(want, 0x5C, sizeof want);
  gl_cr_register(&objC, 0x1234);
  CHECK(gl_cr_count == 1);
  push_cr(0x1234, 513, 0, 0x5C);
  gl_cb_run_callbacks();
  CHECK(objC.cr_calls == 1);
  CHECK(objC.cr_h == 0x1234);
  CHECK(objC.cr_failed == 0);
  CHECK(memcmp(objC.cr_got, want, 16) == 0);
  CHECK(gl_cr_count == 0);
  CHECK(g_tcalls == 0); /* no broadcast listener: slot 6 never pulled */
  /* exactly once */
  push_cr(0x1234, 513, 0, 0x5C);
  g_now += 31;
  gl_cb_run_callbacks();
  CHECK(objC.cr_calls == 1);
  PASS();
}

static void case_cr_failed_passed(void) {
  g_case = "cr_failed_passed";
  reset();
  gl_cr_register(&objC, 0x77);
  push_cr(0x77, 510, 1, 0);
  gl_cb_run_callbacks();
  CHECK(objC.cr_calls == 1);
  CHECK(objC.cr_failed == 1);
  PASS();
}

static void case_cr_late_register_hold(void) {
  g_case = "cr_late_register_hold";
  reset();
  gl_cr_register(&objC, 0x1);
  push_cr(0x2, 513, 0, 0x6D);
  gl_cb_run_callbacks();
  CHECK(objC.cr_calls == 0);
  CHECK(gl_cr_held_count == 1);
  CHECK(g_nrep == 1 && g_rep[0].id == 513 && g_rep[0].nd == 0 &&
        g_rep[0].held == 1);
  gl_cr_register(&objD, 0x2);
  g_now += 31;
  gl_cb_run_callbacks();
  CHECK(objD.cr_calls == 1);
  CHECK(objD.cr_h == 0x2);
  CHECK(objC.cr_calls == 0);
  CHECK(gl_cr_held_count == 0);
  CHECK(all_zero(gl_cr_held, sizeof gl_cr_held));
  CHECK(gl_cr_count == 1); /* only the unrelated pair remains */
  PASS();
}

static void case_cr_expiry_zeroed(void) {
  g_case = "cr_expiry_zeroed";
  reset();
  gl_cr_register(&objC, 0x1);
  push_cr(0x2, 513, 0, 0x6D);
  gl_cb_run_callbacks();
  CHECK(gl_cr_held_count == 1);
  g_now += 9000;
  gl_cb_run_callbacks();
  CHECK(gl_cr_held_count == 1);
  g_now += 1001; /* 10001 ms since arrival */
  gl_cb_run_callbacks();
  CHECK(gl_cr_held_count == 0);
  CHECK(gl_cr_held_expired == 1);
  CHECK(all_zero(gl_cr_held, sizeof gl_cr_held));
  /* a late registration after expiry sees nothing */
  gl_cr_register(&objD, 0x2);
  g_now += 31;
  gl_cb_run_callbacks();
  CHECK(objD.cr_calls == 0);
  PASS();
}

static void case_cr_unregister_race(void) {
  g_case = "cr_unregister_race";
  reset();
  g_y_run_done = 0;
  g_y_saw_done = -1;
  gl_cr_register(&objY, 0x99);
  push_cr(0x99, 504, 0, 0x01);
  gl_cb_run_callbacks();
  CHECK(objY.cr_calls == 1);
  CHECK(pthread_join(g_y_thread, NULL) == 0);
  CHECK(g_y_saw_done == 1); /* unregister waited for Run to return */
  CHECK(gl_cr_count == 0);
  CHECK(gl_cb_dispatching == NULL);
  CHECK(gl_cb_running == 0);
  PASS();
}

static void case_cr_no_lock_held(void) {
  g_case = "cr_no_lock_held";
  reset();
  gl_cr_register(&objC, 0x10);
  push_cr(0x10, 513, 0, 0x01);
  gl_cb_run_callbacks();
  CHECK(objC.cr_calls == 1);
  CHECK(objC.cr_lock_free == 1);
  CHECK(g_ctcalls >= 1); /* the transport asserts trylock==0 itself */
  PASS();
}

static void case_cr_capacity(void) {
  int i;
  g_case = "cr_capacity";
  reset();
  for (i = 0; i < 65; i++) gl_cr_register(&bulk[i], (uint64_t)i + 1);
  CHECK(gl_cr_count == 64);
  CHECK(gl_cr_overflow == 1);
  /* the same pair twice adds nothing */
  gl_cr_register(&bulk[0], 1);
  CHECK(gl_cr_count == 64);
  gl_cr_unregister(&bulk[0], 1);
  CHECK(gl_cr_count == 63);
  PASS();
}

static void case_cr_report_hook(void) {
  g_case = "cr_report_hook";
  reset();
  gl_cr_register(&objC, 0x21);
  gl_cr_register(&objD, 0x22);
  push_cr(0x21, 513, 0, 0x01);
  push_cr(0x22, 510, 0, 0x02);
  gl_cb_run_callbacks();
  /* the hook CHECKs trylock==0 on every call */
  CHECK(g_nrep == 2);
  CHECK(g_rep[0].id == 513 && g_rep[0].nd == 1 && g_rep[0].held == 0);
  CHECK(g_rep[1].id == 510 && g_rep[1].nd == 1 && g_rep[1].held == 0);
  PASS();
}

static void case_cr_rejects_malformed_and_168(void) {
  g_case = "cr_rejects_malformed_and_168";
  reset();
  gl_cr_register(&objC, 0x31);
  push_cr_raw(0x31, 513, 0, 17, 17, 0x01); /* wrong cub for the id */
  g_now += 31;
  gl_cb_run_callbacks();
  push_cr_raw(0x31, 513, 0, 16, 15, 0x01); /* body shorter than cub */
  g_now += 31;
  gl_cb_run_callbacks();
  push_cr_raw(0x31, 513, 2, 16, 16, 0x01); /* failed not 0/1 */
  g_now += 31;
  gl_cb_run_callbacks();
  push_cr_raw(0x31, 999, 0, 16, 16, 0x01); /* id not a call-result row */
  g_now += 31;
  gl_cb_run_callbacks();
  push_cr_raw(0x32, 168, 0, 2572, 2572, 0xAB); /* ticket: never held */
  g_now += 31;
  gl_cb_run_callbacks();
  CHECK(objC.cr_calls == 0);
  CHECK(gl_cr_held_count == 0);
  CHECK(all_zero(gl_cr_held, sizeof gl_cr_held));
  PASS();
}

static void case_cr_held_capacity(void) {
  int i;
  g_case = "cr_held_capacity";
  reset();
  gl_cr_register(&objC, 0x1);
  for (i = 0; i < 17; i++) {
    /* one per run keeps the scripted queue small */
    g_cqhead = g_cqtail = 0;
    push_cr(0x100 + (uint64_t)i, 513, 0, 0x01);
    g_now += 31;
    gl_cb_run_callbacks();
  }
  CHECK(gl_cr_held_count == 16);
  CHECK(gl_cr_held_overflow == 1);
  PASS();
}

static void case_cr_max_per_run_and_backoff(void) {
  int i;
  g_case = "cr_max_per_run_and_backoff";
  reset();
  gl_cr_register(&objC, 0x1);
  for (i = 0; i < 6; i++) push_cr(0x500 + (uint64_t)i, 513, 0, 0x01);
  gl_cb_run_callbacks();
  CHECK(g_ctcalls == 4);
  /* an old helper fails every pull: after 8 failures pulls back off */
  reset();
  gl_cr_register(&objC, 0x1);
  for (i = 0; i < 8; i++) {
    reply_t *q = &g_cq[g_cqtail++];
    q->ok = 0;
    q->len = 0;
  }
  for (i = 0; i < 8; i++) {
    g_now += 31;
    gl_cb_run_callbacks();
  }
  CHECK(g_ctcalls == 8);
  g_now += 31;
  gl_cb_run_callbacks();
  CHECK(g_ctcalls == 8);
  g_now += 1000;
  gl_cb_run_callbacks();
  CHECK(g_ctcalls == 9);
  PASS();
}

static void case_cr_buffer_zeroed(void) {
  int left = 0;
  uint32_t i;
  g_case = "cr_buffer_zeroed";
  reset();
  gl_cr_register(&objC, 0x41);
  push_cr(0x41, 504, 0, 0xCD);
  gl_cb_run_callbacks();
  CHECK(objC.cr_calls == 1);
  CHECK(g_lastcrbuf != NULL);
  for (i = 0; i < 2600; i++)
    if (g_lastcrbuf[i] == 0xCD) left++;
  CHECK(left == 0);
  PASS();
}


/* ---- 58-11: manual dispatch and the results table ---- */
typedef struct {
  int32_t user;
  int32_t id;
  void *pub;
  int32_t cub;
} md_view;

static md_view md_read(const uint8_t *raw) {
  md_view v;
  memcpy(&v.user, raw + 0, 4);
  memcpy(&v.id, raw + 4, 4);
  memcpy(&v.pub, raw + 8, sizeof(void *));
  memcpy(&v.cub, raw + 16, 4);
  return v;
}

static void case_md_broadcast(void) {
  uint8_t raw[24];
  md_view v;
  uint8_t keep[64];
  uint32_t size = gl_cb_relay_size(504);
  g_case = "md_broadcast";
  reset();
  CHECK(size > 0 && size <= sizeof keep);
  gl_md_init();
  push_msg(504, 1, size, size);
  gl_md_run_frame();
  CHECK(gl_md_get_next(raw) == 1);
  v = md_read(raw);
  CHECK(v.id == 504);
  CHECK(v.cub == (int32_t)size);
  CHECK(v.user == 1);
  CHECK(((uint8_t *)v.pub)[12] == 0xAB);
  CHECK(((uint32_t *)v.pub)[0] == 0x11223344u);
  /* a second get_next before free is the same message */
  CHECK(gl_md_get_next(raw) == 1);
  CHECK(md_read(raw).pub == v.pub);
  memcpy(keep, v.pub, size);
  gl_md_free_last();
  CHECK(gl_md_get_next(raw) == 0);
  /* freed buffer is zero */
  CHECK(all_zero(&gl_md_fifo[0], sizeof gl_md_fifo[0]));
  PASS();
}

static void case_md_callresult(void) {
  uint8_t raw[24];
  uint8_t out[64];
  uint8_t failed = 7;
  md_view v;
  uint64_t ah;
  int32_t aid;
  uint32_t acub;
  uint32_t size = gl_cr_size(513);
  g_case = "md_callresult";
  reset();
  gl_md_init();
  push_cr(9, 513, 0, 0x5A);
  gl_md_run_frame();
  CHECK(gl_md_get_next(raw) == 1);
  v = md_read(raw);
  CHECK(v.id == 703);
  CHECK(v.cub == 16);
  memcpy(&ah, (uint8_t *)v.pub + 0, 8);
  memcpy(&aid, (uint8_t *)v.pub + 8, 4);
  memcpy(&acub, (uint8_t *)v.pub + 12, 4);
  CHECK(ah == 9 && aid == 513 && acub == size);
  gl_md_free_last();
  CHECK(gl_md_get_api_call_result(9, out, (int)size, 513, &failed) == 1);
  CHECK(failed == 0);
  CHECK(out[0] == 0x5A);
  CHECK(gl_md_get_api_call_result(9, out, (int)size, 513, &failed) == 0);
  PASS();
}

static void case_md_callresult_failed_flag(void) {
  uint8_t out[64];
  uint8_t failed = 0;
  uint32_t size = gl_cr_size(513);
  g_case = "md_callresult_failed_flag";
  reset();
  gl_md_init();
  push_cr(11, 513, 1, 0x33);
  gl_md_run_frame();
  CHECK(gl_md_get_api_call_result(11, out, (int)size, 513, &failed) == 1);
  CHECK(failed == 1);
  PASS();
}

static void case_md_callresult_wrong_id(void) {
  uint8_t out[64];
  uint8_t failed = 0;
  uint32_t size = gl_cr_size(513);
  g_case = "md_callresult_wrong_id";
  reset();
  gl_md_init();
  push_cr(9, 513, 0, 0x5A);
  gl_md_run_frame();
  CHECK(gl_md_get_api_call_result(9, out, (int)size, 510, &failed) == 0);
  CHECK(gl_md_get_api_call_result(9, out, (int)size + 1, 513, &failed) == 0);
  CHECK(gl_md_get_api_call_result(9, out, (int)size, 513, &failed) == 1);
  PASS();
}

static void case_md_fifo_bounded(void) {
  uint8_t raw[24];
  int i;
  uint32_t size = gl_cb_relay_size(504);
  g_case = "md_fifo_bounded";
  reset();
  gl_md_init();
  for (i = 0; i < 33; i++) {
    CHECK(gl_md_head < GL_MD_FIFO_CAP);
    {
      uint8_t body[64];
      int32_t dropped = 0;
      memset(body, (uint8_t)(i + 1), sizeof body);
      GL_CB_LOCK();
      gl_md_push_locked(504, body, size, &dropped);
      GL_CB_UNLOCK();
    }
  }
  CHECK(gl_md_count == 32);
  CHECK(gl_md_dropped == 1);
  /* the oldest (seed 1) was evicted: the front is seed 2 */
  CHECK(gl_md_get_next(raw) == 1);
  CHECK(((uint8_t *)md_read(raw).pub)[0] == 2);
  /* with the front in the game's hands a full FIFO drops the new message */
  {
    uint8_t body[64];
    int32_t dropped = 0;
    int r;
    memset(body, 0x77, sizeof body);
    GL_CB_LOCK();
    r = gl_md_push_locked(504, body, size, &dropped);
    GL_CB_UNLOCK();
    CHECK(r == 2);
    CHECK(gl_md_count == 32);
  }
  PASS();
}

static void case_md_runcallbacks_inert(void) {
  g_case = "md_runcallbacks_inert";
  reset();
  gl_cb_register(&objA, 504);
  gl_cr_register(&objC, 0x10);
  gl_md_init();
  push_msg(504, 1, gl_cb_relay_size(504), gl_cb_relay_size(504));
  push_cr(0x10, 513, 0, 0x01);
  gl_cb_run_callbacks();
  CHECK(g_tcalls == 0);
  CHECK(g_ctcalls == 0);
  CHECK(objA.calls == 0);
  CHECK(objC.cr_calls == 0);
  PASS();
}

static void case_md_report(void) {
  uint8_t raw[24];
  uint32_t size = gl_cb_relay_size(504);
  g_case = "md_report";
  reset();
  gl_md_init();
  push_msg(504, 1, size, size);
  gl_md_run_frame();
  CHECK(g_nrep == 0);
  CHECK(gl_md_get_next(raw) == 1);
  CHECK(gl_md_get_next(raw) == 1);
  CHECK(g_nrep == 1);
  CHECK(g_rep[0].id == 504 && g_rep[0].nd == 1 && g_rep[0].held == 0);
  gl_md_free_last();
  /* an unread result expires and reports (id, 0, 0) */
  push_cr(9, 513, 0, 0x5A);
  g_now += 31;
  gl_md_run_frame();
  g_nrep = 0;
  g_now += GL_CR_HELD_EXPIRY_MS;
  gl_md_expire(g_now);
  CHECK(g_nrep == 1);
  CHECK(g_rep[0].id == 513 && g_rep[0].nd == 0 && g_rep[0].held == 0);
  CHECK(all_zero(gl_md_results, sizeof gl_md_results));
  PASS();
}

static void case_utils_poll(void) {
  uint8_t failed = 9;
  uint8_t out[64];
  uint32_t size = gl_cr_size(513);
  g_case = "utils_poll";
  reset();
  push_cr(9, 513, 0, 0x5A);
  CHECK(gl_md_is_api_call_completed(9, &failed) == 1);
  CHECK(failed == 0);
  CHECK(gl_md_is_api_call_completed(9, &failed) == 1);
  CHECK(gl_md_get_api_call_result(9, out, (int)size, 513, &failed) == 1);
  g_now += 31;
  CHECK(gl_md_is_api_call_completed(9, &failed) == 0);
  PASS();
}

static void case_md_registry_unmatched_pollable(void) {
  uint8_t failed = 0;
  g_case = "md_registry_unmatched_pollable";
  reset();
  /* a registry-mode result with no CCallResult is also readable by polling */
  gl_cr_register(&objC, 0x1);
  push_cr(0x77, 513, 0, 0x01);
  gl_cb_run_callbacks();
  CHECK(gl_cr_held_count == 1);
  CHECK(gl_md_is_api_call_completed(0x77, &failed) == 1);
  PASS();
}

int main(void) {
  pthread_mutexattr_t attr;
  uint32_t i;
  uint32_t hdr[3] = {0x11223344u, 1u, 4u};
  pthread_mutexattr_init(&attr);
  pthread_mutexattr_settype(&attr, PTHREAD_MUTEX_ERRORCHECK);
  pthread_mutex_init(&g_reg, &attr);
  pthread_mutex_init(&g_bridge, &attr);
  for (i = 0; i < sizeof g_expect; i++)
    g_expect[i] = i < 12 ? ((uint8_t *)hdr)[i] : 0xAB;
  case_register_sets_flag_and_id();
  case_unregister_clears();
  case_gate_no_relay_ids();
  case_dispatch_matching_only();
  case_no_lock_held();
  case_reentrant_handler();
  case_cross_thread_unregister_waits();
  case_reentrant_run_skipped();
  case_no_target_counted();
  case_throttle();
  case_max_per_run();
  case_backoff();
  case_malformed();
  case_capacity();
  case_clear_all();
  case_buffer_zeroed();
  case_relay_1101_dispatch();
  case_hold_1101_until_listener();
  case_hold_dispatches_before_new_drain();
  case_no_hold_168();
  case_report_hook_unlocked();
  case_relay_504_dispatch();
  case_relay_1221_dispatch();
  case_net_intercept_registry();
  case_net_intercept_md();
  case_cr_register_complete();
  case_cr_failed_passed();
  case_cr_late_register_hold();
  case_cr_expiry_zeroed();
  case_cr_unregister_race();
  case_cr_no_lock_held();
  case_cr_capacity();
  case_cr_report_hook();
  case_cr_rejects_malformed_and_168();
  case_cr_held_capacity();
  case_cr_max_per_run_and_backoff();
  case_cr_buffer_zeroed();
  case_md_broadcast();
  case_md_callresult();
  case_md_callresult_failed_flag();
  case_md_callresult_wrong_id();
  case_md_fifo_bounded();
  case_md_runcallbacks_inert();
  case_md_report();
  case_utils_poll();
  case_md_registry_unmatched_pollable();
  return 0;
}
