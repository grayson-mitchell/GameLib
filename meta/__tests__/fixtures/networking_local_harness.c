/*
 * Host harness for the shim-local networking C block (58-14).
 * The test writes NETWORKING_LOCAL_C plus the generated export wrappers to
 * gl_net_local.c and this file includes it, so the SAME text that ships is what
 * is proven. The transport is a recording fake; the registry lock is an
 * ERRORCHECK mutex so a callback invoked under it fails loudly.
 */
#define _GNU_SOURCE
#include <errno.h>
#include <pthread.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static pthread_mutex_t g_reg;
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
#define PASS()                                                                \
  do {                                                                        \
    printf("PASS %s\n", g_case);                                              \
    fflush(stdout);                                                           \
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

/* ---- counting allocator ---- */
static int g_allocs, g_frees;
static void *h_alloc(size_t n) {
  g_allocs++;
  return calloc(1, n);
}
static void h_free(void *p) {
  g_frees++;
  free(p);
}
#define GL_NET_ALLOC(n) h_alloc(n)
#define GL_NET_FREE(p) h_free(p)

/* ---- recording fake transport ---- */
static int g_tcalls;
static uint16_t g_t_ordinal, g_t_slot;
static uint8_t g_t_req[8192];
static uint32_t g_t_reqlen;
static uint8_t g_t_resp[8192];
static uint32_t g_t_resplen;
static int g_t_ok;

static int bridge_transact(uint16_t ordinal, uint16_t slot, const uint8_t *argBuf,
                           uint32_t argLen, uint8_t *retBuf, uint32_t retBufCap,
                           uint32_t *retLenOut) {
  int r = pthread_mutex_trylock(&g_reg);
  CHECK(r == 0); /* the store lock must NOT be held across the transport */
  pthread_mutex_unlock(&g_reg);
  g_tcalls++;
  g_t_ordinal = ordinal;
  g_t_slot = slot;
  CHECK(argLen <= sizeof g_t_req);
  if (argLen > 0) memcpy(g_t_req, argBuf, argLen);
  g_t_reqlen = argLen;
  *retLenOut = 0;
  if (!g_t_ok) return 0;
  CHECK(g_t_resplen <= retBufCap);
  memcpy(retBuf, g_t_resp, g_t_resplen);
  *retLenOut = g_t_resplen;
  return 1;
}

#include "gl_net_local.c"

static void reset(void) {
  memset(gl_net_cfg, 0, sizeof gl_net_cfg);
  gl_net_cfg_n = 0;
  gl_net_cb_count = 0;
  g_tcalls = 0;
  g_t_ok = 1;
  g_t_resplen = 0;
  g_t_reqlen = 0;
}

static void case_identity_steamid(void) {
  gl_net_ident id, id2;
  char buf[160];
  g_case = "identity_steamid";
  memset(&id, 0xAA, sizeof id);
  SteamAPI_SteamNetworkingIdentity_Clear(&id);
  CHECK(SteamAPI_SteamNetworkingIdentity_IsInvalid(&id));
  SteamAPI_SteamNetworkingIdentity_SetSteamID64(&id, 76561197960265729ull);
  CHECK(SteamAPI_SteamNetworkingIdentity_GetSteamID64(&id) == 76561197960265729ull);
  CHECK(SteamAPI_SteamNetworkingIdentity_GetSteamID(&id) == 76561197960265729ull);
  CHECK(!SteamAPI_SteamNetworkingIdentity_IsInvalid(&id));
  CHECK(id.type == 16 && id.cb == 8);
  SteamAPI_SteamNetworkingIdentity_ToString(&id, buf, sizeof buf);
  CHECK(strcmp(buf, "steamid:76561197960265729") == 0);
  CHECK(SteamAPI_SteamNetworkingIdentity_ParseString(&id2, buf));
  CHECK(SteamAPI_SteamNetworkingIdentity_IsEqualTo(&id, &id2));
  CHECK(SteamAPI_SteamNetworkingIdentity_GetPSNID(&id) == 0);
  /* a short buffer truncates and terminates */
  SteamAPI_SteamNetworkingIdentity_ToString(&id, buf, 6);
  CHECK(strcmp(buf, "steam") == 0);
  /* malformed text fails and leaves the identity cleared */
  CHECK(!SteamAPI_SteamNetworkingIdentity_ParseString(&id2, "steamid:12x"));
  CHECK(SteamAPI_SteamNetworkingIdentity_IsInvalid(&id2));
  CHECK(!SteamAPI_SteamNetworkingIdentity_ParseString(&id2, "steamid:99999999999999999999999"));
  PASS();
}

static void case_identity_ip(void) {
  gl_net_ident id, id2;
  char buf[160];
  g_case = "identity_ip";
  SteamAPI_SteamNetworkingIdentity_SetIPv4Addr(&id, 0x0A000002u, 27015);
  CHECK(SteamAPI_SteamNetworkingIdentity_GetIPv4(&id) == 0x0A000002u);
  CHECK(SteamAPI_SteamNetworkingIdentity_GetIPAddr(&id) != NULL);
  SteamAPI_SteamNetworkingIdentity_ToString(&id, buf, sizeof buf);
  CHECK(strcmp(buf, "ip:10.0.0.2:27015") == 0);
  CHECK(SteamAPI_SteamNetworkingIdentity_ParseString(&id2, buf));
  CHECK(SteamAPI_SteamNetworkingIdentity_IsEqualTo(&id, &id2));
  CHECK(!SteamAPI_SteamNetworkingIdentity_IsLocalHost(&id));
  SteamAPI_SteamNetworkingIdentity_SetLocalHost(&id);
  CHECK(SteamAPI_SteamNetworkingIdentity_IsLocalHost(&id));
  SteamAPI_SteamNetworkingIdentity_ToString(&id, buf, sizeof buf);
  CHECK(strcmp(buf, "ip:[::1]:0") == 0);
  CHECK(SteamAPI_SteamNetworkingIdentity_GetIPAddr(&id2) != NULL);
  SteamAPI_SteamNetworkingIdentity_SetSteamID64(&id2, 5);
  CHECK(SteamAPI_SteamNetworkingIdentity_GetIPAddr(&id2) == NULL);
  CHECK(SteamAPI_SteamNetworkingIdentity_GetIPv4(&id2) == 0);
  CHECK(SteamAPI_SteamNetworkingIdentity_GetFakeIPType(&id2) == 0);
  SteamAPI_SteamNetworkingIdentity_SetIPv4Addr(&id, 0xA9FE0001u, 1);
  CHECK(SteamAPI_SteamNetworkingIdentity_IsFakeIP(&id));
  PASS();
}

static void case_identity_generic(void) {
  gl_net_ident id, id2;
  uint8_t bytes[40];
  char buf[160];
  int cb = -1;
  const uint8_t *got;
  g_case = "identity_generic";
  CHECK(SteamAPI_SteamNetworkingIdentity_SetGenericString(&id, "abc"));
  CHECK(strcmp(SteamAPI_SteamNetworkingIdentity_GetGenericString(&id), "abc") == 0);
  CHECK(SteamAPI_SteamNetworkingIdentity_GetGenericBytes(&id, &cb) == NULL);
  SteamAPI_SteamNetworkingIdentity_ToString(&id, buf, sizeof buf);
  CHECK(strcmp(buf, "str:abc") == 0);
  CHECK(!SteamAPI_SteamNetworkingIdentity_SetGenericString(&id, "0123456789012345678901234567890123"));
  CHECK(!SteamAPI_SteamNetworkingIdentity_SetGenericString(&id, NULL));
  memset(bytes, 0x5A, sizeof bytes);
  CHECK(!SteamAPI_SteamNetworkingIdentity_SetGenericBytes(&id, bytes, 33));
  CHECK(SteamAPI_SteamNetworkingIdentity_SetGenericBytes(&id, bytes, 32));
  got = SteamAPI_SteamNetworkingIdentity_GetGenericBytes(&id, &cb);
  CHECK(got != NULL && cb == 32 && memcmp(got, bytes, 32) == 0);
  CHECK(SteamAPI_SteamNetworkingIdentity_GetGenericString(&id) == NULL);
  SteamAPI_SteamNetworkingIdentity_ToString(&id, buf, sizeof buf);
  CHECK(strncmp(buf, "gen:5a5a", 8) == 0 && strlen(buf) == 4 + 64);
  CHECK(SteamAPI_SteamNetworkingIdentity_ParseString(&id2, buf));
  CHECK(SteamAPI_SteamNetworkingIdentity_IsEqualTo(&id, &id2));
  /* oversize generic bytes in text form are refused */
  CHECK(!SteamAPI_SteamNetworkingIdentity_ParseString(
      &id2, "gen:00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00"));
  /* a well-formed unknown type is accepted as UnknownType */
  CHECK(SteamAPI_SteamNetworkingIdentity_ParseString(&id2, "future:abc"));
  CHECK(id2.type == 4);
  SteamAPI_SteamNetworkingIdentity_ToString(&id2, buf, sizeof buf);
  CHECK(strcmp(buf, "future:abc") == 0);
  CHECK(!SteamAPI_SteamNetworkingIdentity_ParseString(&id2, "no colon here"));
  CHECK(SteamAPI_SteamNetworkingIdentity_SetXboxPairwiseID(&id, "xuid"));
  CHECK(strcmp(SteamAPI_SteamNetworkingIdentity_GetXboxPairwiseID(&id), "xuid") == 0);
  CHECK(!SteamAPI_SteamNetworkingIdentity_SetXboxPairwiseID(&id, ""));
  PASS();
}

static void case_identity_equal(void) {
  gl_net_ident a, b;
  g_case = "identity_equal";
  SteamAPI_SteamNetworkingIdentity_SetSteamID64(&a, 77);
  SteamAPI_SteamNetworkingIdentity_SetSteamID64(&b, 77);
  CHECK(SteamAPI_SteamNetworkingIdentity_IsEqualTo(&a, &b));
  SteamAPI_SteamNetworkingIdentity_SetSteamID64(&b, 78);
  CHECK(!SteamAPI_SteamNetworkingIdentity_IsEqualTo(&a, &b));
  SteamAPI_SteamNetworkingIdentity_SetPSNID(&b, 77);
  CHECK(!SteamAPI_SteamNetworkingIdentity_IsEqualTo(&a, &b)); /* across types */
  SteamAPI_SteamNetworkingIdentity_Clear(&a);
  CHECK(SteamAPI_SteamNetworkingIdentity_IsInvalid(&a));
  CHECK(sizeof(gl_net_ident) == 136 && sizeof(gl_net_ip) == 18);
  PASS();
}

static void case_ipaddr(void) {
  gl_net_ip a, b;
  char buf[64];
  const uint8_t v6[16] = {0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1};
  g_case = "ipaddr";
  SteamAPI_SteamNetworkingIPAddr_SetIPv4(&a, 0x7F000001u, 80);
  CHECK(SteamAPI_SteamNetworkingIPAddr_IsIPv4(&a));
  CHECK(SteamAPI_SteamNetworkingIPAddr_GetIPv4(&a) == 0x7F000001u);
  CHECK(SteamAPI_SteamNetworkingIPAddr_IsLocalHost(&a));
  SteamAPI_SteamNetworkingIPAddr_ToString(&a, buf, sizeof buf, 1);
  CHECK(strcmp(buf, "127.0.0.1:80") == 0);
  SteamAPI_SteamNetworkingIPAddr_ToString(&a, buf, sizeof buf, 0);
  CHECK(strcmp(buf, "127.0.0.1") == 0);
  SteamAPI_SteamNetworkingIPAddr_SetIPv6LocalHost(&a, 9);
  CHECK(!SteamAPI_SteamNetworkingIPAddr_IsIPv4(&a));
  CHECK(SteamAPI_SteamNetworkingIPAddr_GetIPv4(&a) == 0);
  CHECK(SteamAPI_SteamNetworkingIPAddr_IsLocalHost(&a));
  SteamAPI_SteamNetworkingIPAddr_ToString(&a, buf, sizeof buf, 1);
  CHECK(strcmp(buf, "[::1]:9") == 0);
  SteamAPI_SteamNetworkingIPAddr_ToString(&a, buf, sizeof buf, 0);
  CHECK(strcmp(buf, "::1") == 0);
  SteamAPI_SteamNetworkingIPAddr_SetIPv6(&a, v6, 443);
  SteamAPI_SteamNetworkingIPAddr_ToString(&a, buf, sizeof buf, 1);
  CHECK(strcmp(buf, "[2001:db8::1]:443") == 0);
  CHECK(SteamAPI_SteamNetworkingIPAddr_ParseString(&b, buf));
  CHECK(SteamAPI_SteamNetworkingIPAddr_IsEqualTo(&a, &b));
  CHECK(SteamAPI_SteamNetworkingIPAddr_ParseString(&b, "10.1.2.3:27015"));
  CHECK(SteamAPI_SteamNetworkingIPAddr_GetIPv4(&b) == 0x0A010203u && b.port == 27015);
  CHECK(SteamAPI_SteamNetworkingIPAddr_ParseString(&b, "10.1.2.3"));
  CHECK(b.port == 0);
  CHECK(SteamAPI_SteamNetworkingIPAddr_ParseString(&b, "::"));
  CHECK(SteamAPI_SteamNetworkingIPAddr_IsIPv6AllZeros(&b));
  CHECK(SteamAPI_SteamNetworkingIPAddr_ParseString(&b, "1:2:3:4:5:6:7:8"));
  SteamAPI_SteamNetworkingIPAddr_ToString(&b, buf, sizeof buf, 0);
  CHECK(strcmp(buf, "1:2:3:4:5:6:7:8") == 0);
  CHECK(!SteamAPI_SteamNetworkingIPAddr_ParseString(&b, "10.1.2.256"));
  CHECK(!SteamAPI_SteamNetworkingIPAddr_ParseString(&b, "10.1.2.3:70000"));
  CHECK(!SteamAPI_SteamNetworkingIPAddr_ParseString(&b, "1:2:3:4:5:6:7:8:9"));
  CHECK(!SteamAPI_SteamNetworkingIPAddr_ParseString(&b, "[::1"));
  CHECK(!SteamAPI_SteamNetworkingIPAddr_ParseString(&b, "1::2::3"));
  CHECK(!SteamAPI_SteamNetworkingIPAddr_ParseString(&b, ""));
  CHECK(SteamAPI_SteamNetworkingIPAddr_IsIPv6AllZeros(&b)); /* cleared on failure */
  SteamAPI_SteamNetworkingIPAddr_Clear(&a);
  CHECK(SteamAPI_SteamNetworkingIPAddr_IsIPv6AllZeros(&a));
  SteamAPI_SteamNetworkingIPAddr_SetIPv4(&a, 0xA9FE0A0Bu, 1);
  CHECK(SteamAPI_SteamNetworkingIPAddr_IsFakeIP(&a));
  CHECK(SteamAPI_SteamNetworkingIPAddr_GetFakeIPType(&a) == 2);
  SteamAPI_SteamNetworkingIPAddr_SetIPv4(&a, 0x0A000001u, 1);
  CHECK(SteamAPI_SteamNetworkingIPAddr_GetFakeIPType(&a) == 1);
  /* NULL self never crashes */
  SteamAPI_SteamNetworkingIPAddr_ToString(NULL, buf, sizeof buf, 1);
  CHECK(buf[0] == 0);
  PASS();
}

static int g_user_free_calls;
static void user_free(void *msg) {
  (void)msg;
  g_user_free_calls++;
}

static void case_msg_pool(void) {
  uint8_t *m, *z;
  void *data;
  int32_t cb;
  void (*rel)(void *);
  g_case = "msg_pool";
  g_allocs = g_frees = 0;
  m = gl_msg_alloc(100);
  CHECK(m != NULL);
  memcpy(&data, m, sizeof data);
  memcpy(&cb, m + 8, 4);
  memcpy(&rel, m + 184, sizeof rel);
  CHECK(data != NULL && cb == 100 && rel != NULL);
  memset(data, 0x77, 100); /* writable */
  CHECK(m + 216 == (uint8_t *)data);
  SteamAPI_SteamNetworkingMessage_t_Release(m);
  CHECK(g_allocs == 1 && g_frees == 1);
  z = gl_msg_alloc(0);
  CHECK(z != NULL);
  memcpy(&data, z, sizeof data);
  memcpy(&rel, z + 176, sizeof rel);
  CHECK(data == NULL && rel == NULL);
  SteamAPI_SteamNetworkingMessage_t_Release(z);
  CHECK(g_allocs == 2 && g_frees == 2);
  CHECK(gl_msg_alloc(-1) == NULL);
  CHECK(gl_msg_alloc((int32_t)(GL_NET_MSG_MAX_DATA + 1u)) == NULL);
  CHECK(g_allocs == 2);
  /* a game-supplied m_pfnFreeData runs once, then the block is freed once */
  m = gl_msg_alloc(8);
  {
    void (*uf)(void *) = user_free;
    memcpy(m + 176, &uf, sizeof uf);
  }
  g_user_free_calls = 0;
  SteamAPI_SteamNetworkingMessage_t_Release(m);
  CHECK(g_user_free_calls == 1 && g_frees == 3 && g_allocs == 3);
  SteamAPI_SteamNetworkingMessage_t_Release(NULL);
  PASS();
}

static int g_cb_calls;
static void *g_cb_arg;
static void cb_a(void *p) {
  g_cb_calls++;
  g_cb_arg = p;
}
static void cb_b(void *p) { (void)p; }

static void case_cfg_ptr_local(void) {
  void (*fn)(void *) = cb_a;
  void (*fnb)(void *) = cb_b;
  uint8_t payload[712];
  uint32_t hconn = 7;
  void *got;
  g_case = "cfg_ptr_local";
  reset();
  CHECK(gl_net_set_config_value(201, 1, 0, 5, &fn));
  CHECK(g_tcalls == 0); /* a pointer never reaches the transport */
  memset(payload, 0, sizeof payload);
  CHECK(gl_net_cb_fn_for(1221, payload) == (void *)fn);
  CHECK(gl_net_cb_fn_for(1222, payload) == NULL);
  CHECK(gl_net_cb_fn_for(168, payload) == NULL);
  CHECK(gl_net_cb_any());
  /* per connection wins over global for a payload carrying that handle */
  CHECK(gl_net_set_config_value(201, 4, 7, 5, &fnb));
  CHECK(g_tcalls == 0);
  memcpy(payload, &hconn, 4);
  CHECK(gl_net_cb_fn_for(1221, payload) == (void *)fnb);
  hconn = 8;
  memcpy(payload, &hconn, 4);
  CHECK(gl_net_cb_fn_for(1221, payload) == (void *)fn);
  /* a callback id with a non-Ptr type is refused outright */
  {
    int32_t v = 1;
    CHECK(!gl_net_set_config_value(201, 1, 0, 1, &v));
    CHECK(g_tcalls == 0);
  }
  /* GetConfigValue answers a callback from the store, never the transport */
  {
    int32_t type = 0;
    size_t cbr = sizeof(void *);
    got = NULL;
    CHECK(gl_net_get_config_value(201, 1, 0, &type, &got, &cbr) == 1);
    CHECK(type == 5 && cbr == sizeof(void *) && got == (void *)fn);
    cbr = 2;
    CHECK(gl_net_get_config_value(201, 1, 0, &type, &got, &cbr) == -3);
    CHECK(g_tcalls == 0);
  }
  /* NULL clears */
  {
    void *nullfn = NULL;
    CHECK(gl_net_set_config_value(201, 4, 7, 5, &nullfn));
    CHECK(gl_net_set_config_value(201, 1, 0, 5, &nullfn));
    CHECK(!gl_net_cb_any());
    hconn = 7;
    memcpy(payload, &hconn, 4);
    CHECK(gl_net_cb_fn_for(1221, payload) == NULL);
  }
  PASS();
}

static void case_cb_intercept(void) {
  void (*fn)(void *) = cb_a;
  uint8_t payload[260];
  g_case = "cb_intercept";
  reset();
  memset(payload, 0x42, sizeof payload);
  CHECK(!gl_net_cb_intercept(1222, payload));
  CHECK(gl_net_set_config_value(202, 1, 0, 5, &fn));
  g_cb_calls = 0;
  CHECK(gl_net_cb_intercept(1222, payload));
  CHECK(g_cb_calls == 1 && g_cb_arg == payload);
  CHECK(!gl_net_cb_intercept(1281, payload));
  CHECK(gl_net_set_config_value(203, 1, 0, 5, &fn));
  CHECK(gl_net_cb_intercept(1281, payload));
  CHECK(g_cb_calls == 2);
  PASS();
}

static void reenter_cb(void *p) {
  void (*fn)(void *) = cb_b;
  (void)p;
  /* would deadlock (EDEADLK -> exit) if the store lock were still held */
  CHECK(gl_net_set_config_value(204, 1, 0, 5, &fn));
  CHECK(gl_net_cb_fn_for(1251, NULL) == (void *)fn);
}

static void case_cb_no_lock_held(void) {
  void (*fn)(void *) = reenter_cb;
  uint8_t payload[16];
  g_case = "cb_no_lock_held";
  reset();
  memset(payload, 0, sizeof payload);
  CHECK(gl_net_set_config_value(205, 1, 0, 5, &fn));
  CHECK(gl_net_cb_intercept(1252, payload));
  CHECK(gl_net_cb_fn_for(1251, NULL) == (void *)cb_b);
  PASS();
}

static void case_cfg_int_forwarded(void) {
  int32_t v = 0x11223344;
  int32_t e = 24, scope = 1, type = 1;
  int64_t obj = 0;
  uint32_t len = 4;
  uint8_t want[28];
  g_case = "cfg_int_forwarded";
  reset();
  g_t_resplen = 4;
  {
    int32_t one = 1;
    memcpy(g_t_resp, &one, 4);
  }
  CHECK(gl_net_set_config_value(24, 1, 0, 1, &v));
  CHECK(g_tcalls == 1);
  CHECK(g_t_ordinal == 71 && g_t_slot == 16);
  memcpy(want, &e, 4);
  memcpy(want + 4, &scope, 4);
  memcpy(want + 8, &obj, 8);
  memcpy(want + 16, &type, 4);
  memcpy(want + 20, &len, 4);
  memcpy(want + 24, &v, 4);
  CHECK(g_t_reqlen == 28 && memcmp(g_t_req, want, 28) == 0);
  /* helper refusal -> false */
  {
    int32_t zero = 0;
    memcpy(g_t_resp, &zero, 4);
  }
  CHECK(!gl_net_set_config_value(24, 1, 0, 1, &v));
  /* transport failure -> false */
  g_t_ok = 0;
  CHECK(!gl_net_set_config_value(24, 1, 0, 1, &v));
  g_t_ok = 1;
  /* a string is sent NUL-terminated, length-prefixed */
  {
    int32_t one = 1;
    memcpy(g_t_resp, &one, 4);
  }
  g_tcalls = 0;
  CHECK(gl_net_set_config_value(25, 1, 0, 4, "hi"));
  CHECK(g_tcalls == 1 && g_t_reqlen == 24 + 3);
  {
    uint32_t sl;
    memcpy(&sl, g_t_req + 20, 4);
    CHECK(sl == 3 && memcmp(g_t_req + 24, "hi\0", 3) == 0);
  }
  /* strings at or past 4096 bytes and bad types/scopes never reach the wire */
  g_tcalls = 0;
  {
    static char big[5000];
    memset(big, 'a', sizeof big - 1);
    CHECK(!gl_net_set_config_value(25, 1, 0, 4, big));
  }
  CHECK(!gl_net_set_config_value(25, 1, 0, 9, &v));
  CHECK(!gl_net_set_config_value(25, 0, 0, 1, &v));
  CHECK(!gl_net_set_config_value(25, 5, 0, 1, &v));
  CHECK(g_tcalls == 0);
  PASS();
}

static void case_cfg_store_bounded(void) {
  int i;
  void (*fn)(void *) = cb_a;
  g_case = "cfg_store_bounded";
  reset();
  for (i = 0; i < 256; i++) CHECK(gl_net_set_config_value(201, 4, 1000 + i, 5, &fn));
  CHECK(gl_net_cfg_n == 256);
  CHECK(!gl_net_set_config_value(201, 4, 5000, 5, &fn)); /* the 257th */
  CHECK(gl_net_cfg_n == 256);
  /* updating an existing entry still works at capacity */
  CHECK(gl_net_set_config_value(201, 4, 1000, 5, &fn));
  CHECK(g_tcalls == 0);
  PASS();
}

static void case_cfg_get_forwarded(void) {
  uint8_t out[8];
  size_t cbr = sizeof out;
  int32_t type = 0;
  int32_t ret = 1;
  uint64_t needed = 4;
  uint32_t n = 4;
  int32_t val = 99, ptrType = 5, intType = 1;
  g_case = "cfg_get_forwarded";
  reset();
  memcpy(g_t_resp, &ret, 4);
  memcpy(g_t_resp + 4, &intType, 4);
  memcpy(g_t_resp + 8, &needed, 8);
  memcpy(g_t_resp + 16, &n, 4);
  memcpy(g_t_resp + 20, &val, 4);
  g_t_resplen = 24;
  CHECK(gl_net_get_config_value(24, 1, 0, &type, out, &cbr) == 1);
  CHECK(g_t_slot == 17 && g_t_reqlen == 20);
  CHECK(type == 1 && cbr == 4 && memcmp(out, &val, 4) == 0);
  /* a helper reply claiming a Ptr is refused: no Mac pointer reaches the game */
  memcpy(g_t_resp + 4, &ptrType, 4);
  memset(out, 0, sizeof out);
  cbr = sizeof out;
  CHECK(gl_net_get_config_value(24, 1, 0, &type, out, &cbr) == -1);
  CHECK(memcmp(out, &val, 4) != 0);
  /* a truncated reply is refused */
  memcpy(g_t_resp + 4, &intType, 4);
  g_t_resplen = 22;
  CHECK(gl_net_get_config_value(24, 1, 0, &type, out, &cbr) == -1);
  PASS();
}

static void case_utils_calls(void) {
  uint32_t list[4];
  uint8_t loc[512];
  char buf[32];
  int32_t pop = 3;
  g_case = "utils_calls";
  reset();
  /* GetPOPList: fills at most the caller's capacity */
  {
    int32_t ret = 7;
    uint32_t n = 2;
    uint32_t a = 11, b = 22;
    memcpy(g_t_resp, &ret, 4);
    memcpy(g_t_resp + 4, &n, 4);
    memcpy(g_t_resp + 8, &a, 4);
    memcpy(g_t_resp + 12, &b, 4);
    g_t_resplen = 16;
  }
  CHECK(gl_net_get_pop_list(list, 2) == 7);
  CHECK(list[0] == 11 && list[1] == 22);
  CHECK(g_t_slot == 11);
  {
    int32_t want;
    memcpy(&want, g_t_req, 4);
    CHECK(want == 2);
  }
  /* more entries than asked for is refused */
  list[0] = 0;
  CHECK(gl_net_get_pop_list(list, 1) == 0);
  CHECK(list[0] == 0);
  /* GetLocalPingLocation */
  {
    float f = 12.5f;
    memcpy(g_t_resp, &f, 4);
    g_t_resp[4] = 1;
    memset(g_t_resp + 5, 0x33, 512);
    g_t_resplen = 517;
  }
  CHECK(gl_net_get_local_ping_location(loc) == 12.5f);
  CHECK(loc[0] == 0x33 && loc[511] == 0x33);
  g_t_ok = 0;
  CHECK(gl_net_get_local_ping_location(loc) == -1.0f);
  g_t_ok = 1;
  /* CheckPingDataUpToDate sends the float bits */
  {
    int32_t one = 1;
    memcpy(g_t_resp, &one, 4);
    g_t_resplen = 4;
  }
  CHECK(gl_net_check_ping_data(1e10f));
  CHECK(g_t_slot == 7 && g_t_reqlen == 4);
  {
    float f;
    memcpy(&f, g_t_req, 4);
    CHECK(f == 1e10f);
  }
  /* ConvertPingLocationToString */
  memset(loc, 0x44, sizeof loc);
  {
    uint32_t n = 3;
    memcpy(g_t_resp, &n, 4);
    memcpy(g_t_resp + 4, "abc", 3);
    g_t_resplen = 7;
  }
  gl_net_convert_ping_location(loc, buf, sizeof buf);
  CHECK(strcmp(buf, "abc") == 0 && g_t_slot == 5 && g_t_reqlen == 516);
  gl_net_convert_ping_location(loc, buf, 3); /* too small for 3 + NUL: left empty */
  CHECK(buf[0] == 0);
  /* GetConfigValueInfo */
  {
    uint32_t n = 4;
    int32_t t = 1, s = 2;
    memcpy(g_t_resp, &n, 4);
    memcpy(g_t_resp + 4, "name", 4);
    memcpy(g_t_resp + 8, &t, 4);
    memcpy(g_t_resp + 12, &s, 4);
    g_t_resplen = 16;
  }
  {
    int32_t ot = 0, os = 0;
    const char *nm = gl_net_get_config_value_info(pop, &ot, &os);
    CHECK(nm != NULL && strcmp(nm, "name") == 0 && ot == 1 && os == 2);
  }
  g_t_resplen = 10;
  CHECK(gl_net_get_config_value_info(pop, NULL, NULL) == NULL);
  PASS();
}

static void case_flat_inline(void) {
  void (*fn)(void *) = cb_a;
  g_case = "flat_inline";
  reset();
  CHECK(SteamAPI_ISteamNetworkingUtils_SetGlobalCallback_SteamNetConnectionStatusChanged(NULL, fn));
  CHECK(g_tcalls == 0);
  CHECK(gl_net_cb_fn_for(1221, NULL) == (void *)fn);
  CHECK(SteamAPI_ISteamNetworkingUtils_SetGlobalCallback_MessagesSessionFailed(NULL, fn));
  CHECK(gl_net_cb_fn_for(1252, NULL) == (void *)fn);
  CHECK(SteamAPI_ISteamNetworkingUtils_SetGlobalCallback_SteamRelayNetworkStatusChanged(NULL, fn));
  CHECK(SteamAPI_ISteamNetworkingUtils_SetGlobalCallback_SteamNetAuthenticationStatusChanged(NULL, fn));
  CHECK(SteamAPI_ISteamNetworkingUtils_SetGlobalCallback_MessagesSessionRequest(NULL, fn));
  CHECK(SteamAPI_ISteamNetworkingUtils_SetGlobalCallback_FakeIPResult(NULL, fn));
  CHECK(SteamAPI_ISteamNetworkingUtils_SetGlobalConfigValuePtr(NULL, 201, NULL));
  CHECK(gl_net_cb_fn_for(1221, NULL) == NULL);
  /* typed helpers forward exactly once with the right scope */
  {
    int32_t one = 1;
    memcpy(g_t_resp, &one, 4);
    g_t_resplen = 4;
  }
  CHECK(SteamAPI_ISteamNetworkingUtils_SetGlobalConfigValueInt32(NULL, 24, 5));
  CHECK(g_tcalls == 1);
  CHECK(SteamAPI_ISteamNetworkingUtils_SetConnectionConfigValueInt32(NULL, 9, 24, 5));
  CHECK(g_tcalls == 2);
  {
    int32_t sc;
    int64_t ob;
    memcpy(&sc, g_t_req + 4, 4);
    memcpy(&ob, g_t_req + 8, 8);
    CHECK(sc == 4 && ob == 9);
  }
  CHECK(SteamAPI_ISteamNetworkingUtils_SetGlobalConfigValueFloat(NULL, 25, 1.5f));
  CHECK(SteamAPI_ISteamNetworkingUtils_SetGlobalConfigValueString(NULL, 26, "x"));
  CHECK(SteamAPI_ISteamNetworkingUtils_SetConnectionConfigValueFloat(NULL, 9, 25, 1.5f));
  CHECK(SteamAPI_ISteamNetworkingUtils_SetConnectionConfigValueString(NULL, 9, 26, "x"));
  CHECK(g_tcalls == 6);
  /* SetConfigValueStruct: int forwards, ptr stays local */
  {
    uint8_t opt[16];
    int32_t e = 27, t = 1, v = 6;
    memset(opt, 0, sizeof opt);
    memcpy(opt, &e, 4);
    memcpy(opt + 4, &t, 4);
    memcpy(opt + 8, &v, 4);
    g_tcalls = 0;
    CHECK(SteamAPI_ISteamNetworkingUtils_SetConfigValueStruct(NULL, opt, 1, 0));
    CHECK(g_tcalls == 1);
    e = 202;
    t = 5;
    memcpy(opt, &e, 4);
    memcpy(opt + 4, &t, 4);
    memcpy(opt + 8, &fn, sizeof fn);
    CHECK(SteamAPI_ISteamNetworkingUtils_SetConfigValueStruct(NULL, opt, 1, 0));
    CHECK(g_tcalls == 1);
    CHECK(gl_net_cb_fn_for(1222, NULL) == (void *)fn);
    CHECK(!SteamAPI_ISteamNetworkingUtils_SetConfigValueStruct(NULL, NULL, 1, 0));
  }
  /* InitRelayNetworkAccess / IsFakeIPv4 go through the utils object's vtable */
  SteamAPI_ISteamNetworkingUtils_InitRelayNetworkAccess(NULL);
  CHECK(!SteamAPI_ISteamNetworkingUtils_IsFakeIPv4(NULL, 1));
  PASS();
}

static float g_vt_age;
static int vt_check(void *self, float age) {
  (void)self;
  g_vt_age = age;
  return 1;
}
static int vt_fake(void *self, uint32_t ip) {
  (void)self;
  return ip == 0xA9FE0001u ? 2 : 1;
}

static void case_flat_vtable(void) {
  void *vt[26];
  void *obj;
  g_case = "flat_vtable";
  memset(vt, 0, sizeof vt);
  vt[7] = (void *)vt_check;
  vt[14] = (void *)vt_fake;
  obj = vt;
  g_vt_age = 0;
  SteamAPI_ISteamNetworkingUtils_InitRelayNetworkAccess(&obj);
  CHECK(g_vt_age == 1e10f);
  CHECK(SteamAPI_ISteamNetworkingUtils_IsFakeIPv4(&obj, 0xA9FE0001u));
  CHECK(!SteamAPI_ISteamNetworkingUtils_IsFakeIPv4(&obj, 0x0A000001u));
  PASS();
}


/* ---- 58-15: out-messages decode, option filtering, lanes ---- */
static int g_live(void) { return g_allocs - g_frees; }

/* one record: 180-byte header then payload */
static uint32_t put_rec(uint8_t *dst, uint32_t cb, uint32_t conn, int32_t chan, int64_t num,
                        uint8_t fill) {
  uint16_t lane = 3;
  memset(dst, 0, 180);
  memcpy(dst, &cb, 4);
  memcpy(dst + 4, &conn, 4);
  memset(dst + 8, 0x5A, 136);
  memcpy(dst + 160, &num, 8);
  memcpy(dst + 168, &chan, 4);
  memcpy(dst + 176, &lane, 2);
  memset(dst + 180, fill, cb);
  return 180 + cb;
}

static void case_outmsg_decode_two(void) {
  uint8_t buf[180 + 5 + 180 + 1200];
  void *out[4];
  uint32_t off;
  int32_t n;
  uint8_t *m0, *m1;
  int32_t cbs, chan;
  uint32_t conn;
  int64_t num;
  uint8_t *data;
  g_case = "outmsg_decode_two";
  memset(out, 0, sizeof out);
  off = put_rec(buf, 5, 77, 9, 1001, 0x11);
  off += put_rec(buf + off, 1200, 78, 10, 1002, 0x22);
  n = gl_net_decode_messages(buf, off, 2, 4, out);
  CHECK(n == 2);
  m0 = (uint8_t *)out[0];
  m1 = (uint8_t *)out[1];
  memcpy(&cbs, m0 + 8, 4);
  CHECK(cbs == 5);
  memcpy(&conn, m0 + 12, 4);
  CHECK(conn == 77);
  memcpy(&chan, m0 + 192, 4);
  CHECK(chan == 9);
  memcpy(&num, m0 + 168, 8);
  CHECK(num == 1001);
  CHECK(m0[16] == 0x5A && m0[16 + 135] == 0x5A);
  memcpy(&data, m0, sizeof data);
  CHECK(data[0] == 0x11 && data[4] == 0x11);
  memcpy(&cbs, m1 + 8, 4);
  CHECK(cbs == 1200);
  memcpy(&data, m1, sizeof data);
  CHECK(data[1199] == 0x22);
  {
    void (*rel)(void *);
    memcpy(&rel, m1 + 184, sizeof rel);
    CHECK(rel == gl_msg_release);
  }
  gl_msg_release_via_fn(out[0]);
  gl_msg_release_via_fn(out[1]);
  PASS();
}

static void case_outmsg_rejects_lying_size(void) {
  uint8_t buf[180 + 4 + 180 + 64];
  void *out[4];
  uint32_t off, bad = 1000000;
  int32_t n;
  int before = g_live();
  g_case = "outmsg_rejects_lying_size";
  memset(out, 0, sizeof out);
  off = put_rec(buf, 4, 1, 0, 1, 0x33);
  put_rec(buf + off, 64, 2, 0, 2, 0x44);
  memcpy(buf + off, &bad, 4); /* the second record claims far more than the frame holds */
  n = gl_net_decode_messages(buf, off + 180 + 64, 2, 4, out);
  CHECK(n == 1);
  CHECK(out[1] == NULL);
  CHECK(g_live() == before + 1); /* the failed record allocated nothing */
  /* a record that claims more than the bytes left, by one */
  off = put_rec(buf, 10, 1, 0, 1, 0x33);
  n = gl_net_decode_messages(buf, off - 1, 1, 4, out);
  CHECK(n == 0);
  /* a frame shorter than one header */
  n = gl_net_decode_messages(buf, 100, 1, 4, out);
  CHECK(n == 0);
  gl_msg_release_via_fn(out[0]);
  CHECK(g_live() == before);
  PASS();
}

static void case_outmsg_rejects_n_over_max(void) {
  uint8_t buf[180 * 3];
  void *out[2] = {NULL, NULL};
  uint32_t off = 0;
  int before = g_live();
  g_case = "outmsg_rejects_n_over_max";
  off += put_rec(buf + off, 0, 1, 0, 1, 0);
  off += put_rec(buf + off, 0, 1, 0, 2, 0);
  off += put_rec(buf + off, 0, 1, 0, 3, 0);
  CHECK(gl_net_decode_messages(buf, off, 3, 2, out) == 0);
  CHECK(out[0] == NULL && out[1] == NULL);
  CHECK(g_live() == before);
  CHECK(gl_net_decode_messages(buf, off, 0, 2, out) == 0);
  CHECK(gl_net_decode_messages(buf, off, 2, 0, out) == 0);
  CHECK(gl_net_decode_messages(buf, off, -1, 2, out) == 0);
  CHECK(gl_net_decode_messages(buf, off, 2, 2, NULL) == 0);
  PASS();
}

static void case_outmsg_release_all(void) {
  uint8_t buf[(180 + 7) * 4];
  void *out[4];
  uint32_t off = 0;
  int i;
  int before = g_live();
  g_case = "outmsg_release_all";
  for (i = 0; i < 4; i++) off += put_rec(buf + off, 7, 5, i, i, (uint8_t)i);
  CHECK(gl_net_decode_messages(buf, off, 4, 4, out) == 4);
  CHECK(g_live() == before + 4);
  for (i = 0; i < 4; i++) SteamAPI_SteamNetworkingMessage_t_Release(out[i]);
  CHECK(g_live() == before);
  PASS();
}

static void mkopt(uint8_t *o, int32_t e, int32_t type, const void *val, size_t n) {
  memset(o, 0, 16);
  memcpy(o, &e, 4);
  memcpy(o + 4, &type, 4);
  memcpy(o + 8, val, n);
}

static void case_open_filters_options(void) {
  uint8_t opts[16 * 4];
  uint8_t addr[18];
  int32_t i32 = 5;
  void *fn = (void *)0x1234;
  const char *str = "hello";
  uint32_t h = 41, nKept, len;
  int32_t e, type, port;
  g_case = "open_filters_options";
  reset();
  memset(addr, 7, sizeof addr);
  mkopt(opts, 201, 5, &fn, sizeof fn);           /* Callback_ConnectionStatusChanged: bound */
  mkopt(opts + 16, 23, 1, &i32, 4);               /* Int32: forwarded */
  mkopt(opts + 32, 25, 4, &str, sizeof str);      /* String: forwarded as bytes */
  mkopt(opts + 48, 99, 5, &fn, sizeof fn);        /* a plain Ptr: bound too */
  memcpy(g_t_resp, &h, 4);
  g_t_resplen = 4;
  CHECK(gl_net_open(0, addr, 0, 4, opts, GL_NET_SCOPE_LISTEN) == 41);
  CHECK(g_t_ordinal == 70 && g_t_slot == 0);
  CHECK(g_t_req[0] == 0);
  CHECK(memcmp(g_t_req + 1, addr, 18) == 0);
  memcpy(&port, g_t_req + 19, 4);
  CHECK(port == 0);
  memcpy(&nKept, g_t_req + 23, 4);
  CHECK(nKept == 2);
  memcpy(&e, g_t_req + 27, 4);
  memcpy(&type, g_t_req + 31, 4);
  memcpy(&len, g_t_req + 35, 4);
  CHECK(e == 23 && type == 1 && len == 4);
  memcpy(&e, g_t_req + 43, 4);
  CHECK(e == 25);
  /* neither pointer value is anywhere in the request */
  {
    uint32_t k;
    for (k = 0; k + sizeof fn <= g_t_reqlen; k++) CHECK(memcmp(g_t_req + k, &fn, sizeof fn) != 0);
  }
  CHECK(gl_net_cfg_get(201, GL_NET_SCOPE_LISTEN, 41) == fn);
  CHECK(gl_net_cfg_get(99, GL_NET_SCOPE_LISTEN, 41) == fn);
  CHECK(gl_net_cfg_get(201, GL_NET_SCOPE_CONNECTION, 41) == NULL);
  /* a callback id carried as a non-Ptr type is refused and nothing is sent */
  reset();
  mkopt(opts, 202, 1, &i32, 4);
  CHECK(gl_net_open(0, addr, 0, 1, opts, GL_NET_SCOPE_LISTEN) == 0);
  CHECK(g_tcalls == 0);
  /* a NULL string, an unknown type, too many options, NULL options */
  {
    const char *nul = NULL;
    mkopt(opts, 30, 4, &nul, sizeof nul);
    CHECK(gl_net_open(0, addr, 0, 1, opts, GL_NET_SCOPE_LISTEN) == 0);
    mkopt(opts, 30, 9, &i32, 4);
    CHECK(gl_net_open(0, addr, 0, 1, opts, GL_NET_SCOPE_LISTEN) == 0);
    CHECK(gl_net_open(0, addr, 0, 33, opts, GL_NET_SCOPE_LISTEN) == 0);
    CHECK(gl_net_open(0, addr, 0, 1, NULL, GL_NET_SCOPE_LISTEN) == 0);
    CHECK(gl_net_open(0, NULL, 0, 0, NULL, GL_NET_SCOPE_LISTEN) == 0);
    CHECK(gl_net_open(4, addr, 0, 0, NULL, GL_NET_SCOPE_LISTEN) == 0);
    CHECK(g_tcalls == 0);
  }
  /* a rejected handle (0) binds nothing */
  reset();
  mkopt(opts, 201, 5, &fn, sizeof fn);
  h = 0;
  memcpy(g_t_resp, &h, 4);
  g_t_resplen = 4;
  CHECK(gl_net_open(2, NULL, 7, 1, opts, GL_NET_SCOPE_LISTEN) == 0);
  CHECK(g_t_slot == 2);
  CHECK(!gl_net_cb_any());
  /* P2P connect sends the 136-byte identity and the virtual port; scope CONNECTION */
  reset();
  {
    uint8_t id[136];
    memset(id, 3, sizeof id);
    h = 55;
    memcpy(g_t_resp, &h, 4);
    g_t_resplen = 4;
    mkopt(opts, 201, 5, &fn, sizeof fn);
    CHECK(gl_net_open(3, id, 9, 1, opts, GL_NET_SCOPE_CONNECTION) == 55);
    CHECK(g_t_slot == 3 && g_t_reqlen == 1 + 136 + 4 + 4);
    memcpy(&port, g_t_req + 137, 4);
    CHECK(port == 9);
    CHECK(gl_net_cfg_get(201, GL_NET_SCOPE_CONNECTION, 55) == fn);
  }
  PASS();
}

static void case_open_bind_failure_closes(void) {
  uint8_t opts[16];
  uint8_t addr[18];
  void *fn = (void *)0x1234;
  uint32_t h = 61;
  int32_t i;
  g_case = "open_bind_failure_closes";
  reset();
  memset(addr, 1, sizeof addr);
  for (i = 0; i < 256; i++) CHECK(gl_net_cfg_put(300 + i, 1, 0, fn));
  mkopt(opts, 201, 5, &fn, sizeof fn);
  memcpy(g_t_resp, &h, 4);
  g_t_resplen = 4;
  CHECK(gl_net_open(0, addr, 0, 1, opts, GL_NET_SCOPE_LISTEN) == 0);
  /* the last transport call closed the unbound listen socket (slot 6) */
  CHECK(g_t_slot == 6 && g_t_reqlen == 4);
  PASS();
}

static void case_rt_status_and_lanes(void) {
  uint8_t status[120], lanes[128];
  uint8_t prio[8];
  uint16_t w[2] = {5, 6};
  uint32_t nl = 2, want;
  int32_t ret = 1;
  g_case = "rt_status_and_lanes";
  reset();
  memset(status, 0, sizeof status);
  memset(lanes, 0, sizeof lanes);
  memcpy(g_t_resp, &ret, 4);
  g_t_resp[4] = 1;
  memset(g_t_resp + 5, 0x21, 120);
  memcpy(g_t_resp + 125, &nl, 4);
  memset(g_t_resp + 129, 0x42, 128);
  g_t_resplen = 257;
  CHECK(gl_net_rt_status(9, status, 2, lanes) == 1);
  CHECK(g_t_slot == 16);
  memcpy(&want, g_t_req + 4, 4);
  CHECK(want == 2);
  CHECK(status[0] == 0x21 && status[119] == 0x21);
  CHECK(lanes[0] == 0x42 && lanes[127] == 0x42);
  /* no lane array: no lanes are asked for */
  g_t_resplen = 129;
  memset(g_t_resp + 125, 0, 4);
  CHECK(gl_net_rt_status(9, status, 2, NULL) == 1);
  memcpy(&want, g_t_req + 4, 4);
  CHECK(want == 0);
  /* more lanes than asked for is refused */
  memcpy(g_t_resp + 125, &nl, 4);
  g_t_resplen = 257;
  CHECK(gl_net_rt_status(9, status, 1, lanes) == 0);
  /* lanes */
  memset(prio, 0, sizeof prio);
  prio[0] = 1;
  ret = 1;
  memcpy(g_t_resp, &ret, 4);
  g_t_resplen = 4;
  CHECK(gl_net_configure_lanes(9, 2, prio, w) == 1);
  CHECK(g_t_slot == 20 && g_t_reqlen == 10 + 8 + 4);
  CHECK(g_t_req[8] == 1 && g_t_req[9] == 1);
  CHECK(gl_net_configure_lanes(9, 0, prio, w) == 2);
  CHECK(gl_net_configure_lanes(9, 256, prio, w) == 2);
  PASS();
}

int main(void) {
  pthread_mutexattr_t attr;
  pthread_mutexattr_init(&attr);
  pthread_mutexattr_settype(&attr, PTHREAD_MUTEX_ERRORCHECK);
  pthread_mutex_init(&g_reg, &attr);
  case_identity_steamid();
  case_identity_ip();
  case_identity_generic();
  case_identity_equal();
  case_ipaddr();
  case_msg_pool();
  case_cfg_ptr_local();
  case_cfg_int_forwarded();
  case_cfg_store_bounded();
  case_cfg_get_forwarded();
  case_cb_intercept();
  case_cb_no_lock_held();
  case_utils_calls();
  case_flat_inline();
  case_flat_vtable();
  case_outmsg_decode_two();
  case_outmsg_rejects_lying_size();
  case_outmsg_rejects_n_over_max();
  case_outmsg_release_all();
  case_open_filters_options();
  case_open_bind_failure_closes();
  case_rt_status_and_lanes();
  return 0;
}
