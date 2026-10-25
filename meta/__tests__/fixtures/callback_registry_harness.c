/*
 * Host harness for the generated callback registry (55-04, P55-3).
 * The test writes generateCallbackRegistryC() to gl_cb_registry.c and this
 * file includes it, so the SAME generated text that ships is what is proven.
 * Locks are ERRORCHECK mutexes: a re-lock returns EDEADLK and we exit(1)
 * instead of hanging.
 */
#include <errno.h>
#include <pthread.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

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

#include "gl_cb_registry.c"

typedef struct fobj {
  void **vptr;
  uint8_t flags;
  uint8_t pad[3];
  int32_t iCallback;
  int calls;
  int payload_ok;
  int lock_free;
} fobj;

_Static_assert(offsetof(fobj, flags) == GL_CB_FLAGS_OFF, "flags offset");
_Static_assert(offsetof(fobj, iCallback) == GL_CB_ICALLBACK_OFF,
               "iCallback offset");

static fobj objA, objB, objG, objR, objS;
static fobj bulk[520];

static void trap(void *self) {
  (void)self;
  printf("FAIL %s trap vtable slot called\n", g_case);
  fflush(stdout);
  exit(1);
}
static void h_run1(void *self, void *param);
static void *g_vt[4] = {(void *)trap, (void *)h_run1, (void *)trap,
                        (void *)trap};

static void h_run1(void *self, void *param) {
  fobj *o = (fobj *)self;
  int r = pthread_mutex_trylock(&g_reg);
  o->calls++;
  o->lock_free = (r == 0);
  if (r == 0) pthread_mutex_unlock(&g_reg);
  if (param) o->payload_ok = (memcmp(param, g_expect, sizeof g_expect) == 0);
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
  g_qhead = g_qtail = 0;
  g_tcalls = 0;
  g_lastbuf = NULL;
  g_now += 100000u;
  init_obj(&objA);
  init_obj(&objB);
  init_obj(&objG);
  init_obj(&objR);
  init_obj(&objS);
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
  case_throttle();
  case_max_per_run();
  case_backoff();
  case_malformed();
  case_capacity();
  case_clear_all();
  case_buffer_zeroed();
  return 0;
}
