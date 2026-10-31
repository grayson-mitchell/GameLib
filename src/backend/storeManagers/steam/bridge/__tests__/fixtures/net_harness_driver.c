/* 58-26 host harness: #includes the REAL bridge_helper.c (main renamed) and
 * drives gl_nets_receive and gl_net_read_p2p_packet against fake Mac symbols.
 * Evidence lines go to stderr via the real logts; counters go to stdout. */
#define main gl_helper_real_main
#include "bridge_helper.c"
#undef main

#include <stdio.h>

static int g_release_calls = 0;
static size_t g_oversize_cb = 0;

static void fake_release(void *msg) {
  g_release_calls++;
  free(msg);
}

static int fake_fill(void **msgs, int max) {
  static uint8_t payload[GL_NETS_RECORDS_MAX];
  size_t cb = g_oversize_cb != 0 ? g_oversize_cb : 5;
  uint8_t *m;
  int32_t cb32 = (int32_t)cb;
  void (*rel)(void *) = fake_release;
  const uint8_t *data = payload;
  if (max < 1) return 0;
  m = (uint8_t *)calloc(1, 256);
  memset(payload, 0x41, sizeof payload);
  memcpy(m, &data, sizeof data);
  memcpy(m + 8, &cb32, 4);
  memcpy(m + GL_NETS_MSG_OFF_RELEASE, &rel, sizeof rel);
  msgs[0] = m;
  return 1;
}

int SteamAPI_ISteamNetworkingSockets_ReceiveMessagesOnConnection(void *self, uint32_t h, void **msgs, int max) {
  (void)self; (void)h;
  return fake_fill(msgs, max);
}
int SteamAPI_ISteamNetworkingSockets_ReceiveMessagesOnPollGroup(void *self, uint32_t h, void **msgs, int max) {
  (void)self; (void)h;
  return fake_fill(msgs, max);
}
int SteamAPI_ISteamNetworkingMessages_ReceiveMessagesOnChannel(void *self, uint32_t h, void **msgs, int max) {
  (void)self; (void)h;
  return fake_fill(msgs, max);
}

/* legacy P2P channel: FIFO of packet sizes */
static uint32_t g_q[8];
static int g_qn = 0;
static int g_read_calls = 0;

static int fake_avail(void *self, uint32_t *size, int32_t chan) {
  (void)self; (void)chan;
  if (g_qn == 0) return 0;
  *size = g_q[0];
  return 1;
}
static int fake_read(void *self, void *dest, uint32_t cubDest, uint32_t *got, uint64_t *remote, int32_t chan) {
  (void)self; (void)chan;
  g_read_calls++;
  if (g_qn == 0 || cubDest < g_q[0]) return 0;
  memset(dest, 0x42, g_q[0]);
  *got = g_q[0];
  *remote = 0x1122334455667788ull;
  memmove(g_q, g_q + 1, sizeof(uint32_t) * (size_t)(g_qn - 1));
  g_qn--;
  return 1;
}

static void p2p_call(void) {
  static uint8_t resp[65536];
  uint8_t args[12];
  uint32_t cap = 61440, dest = 61440, rl = 0;
  int32_t chan = 0, ret = -1;
  uint32_t len = 0;
  uint64_t remote = 0;
  memcpy(args, &cap, 4);
  memcpy(args + 4, &dest, 4);
  memcpy(args + 8, &chan, 4);
  gl_net_read_p2p_packet((void *)1, args, 12, resp, sizeof resp, &rl);
  memcpy(&ret, resp, 4);
  memcpy(&remote, resp + 8, 8);
  memcpy(&len, resp + 16, 4);
  printf("call ret=%d len=%u remote=%llu queue=%d reads=%d\n", ret, len, (unsigned long long)remote, g_qn, g_read_calls);
  fflush(stdout);
}

static int g_close_calls = 0;
static int g_destroy_calls = 0;
int SteamAPI_ISteamNetworkingSockets_CloseConnection(void *self, uint32_t h, int32_t reason, const char *dbg, int linger) {
  (void)self; (void)h; (void)reason; (void)dbg; (void)linger;
  g_close_calls++;
  return 1;
}
int SteamAPI_ISteamNetworkingSockets_DestroyPollGroup(void *self, uint32_t h) {
  (void)self; (void)h;
  g_destroy_calls++;
  return 1;
}

static void queue_n(int which, uint32_t handle, int n) {
  gl_nets_queue *q = gl_nets_queue_find(which, handle, 1);
  for (int i = 0; i < n; i++) {
    uint8_t *rec = (uint8_t *)malloc(GL_NETS_REC_HEADER + 4);
    memset(rec, 0x43, GL_NETS_REC_HEADER + 4);
    gl_nets_queue_push(q, rec, GL_NETS_REC_HEADER + 4);
  }
}

int main(int argc, char **argv) {
  const char *c = argc > 1 ? argv[1] : "";
  g_dylib_handle = RTLD_DEFAULT;
  if (strcmp(c, "net-budget") == 0) {
    for (int i = 0; i < 40; i++) gl_net_evidence(1, GL_NET_KIND_SEND, GL_NET_IFACE_SOCKETS, 0, 5, GL_NET_PATH_UNKNOWN);
    gl_net_evidence(1, GL_NET_KIND_JOIN, GL_NET_IFACE_SOCKETS, 1221, 0, GL_NET_PATH_UNKNOWN);
    gl_net_evidence(1, GL_NET_KIND_RECV, GL_NET_IFACE_SOCKETS, 0, 5, GL_NET_PATH_UNKNOWN);
    return 0;
  }
  if (strcmp(c, "nets-evict") == 0) {
    for (uint32_t h = 1; h <= GL_NETS_QUEUE_HANDLES; h++) queue_n(0, h, 1);
    queue_n(0, 999, 1);
    return 0;
  }
  if (strcmp(c, "nets-close-clears") == 0) {
    static uint8_t resp[64];
    uint8_t args[16];
    uint32_t h = 9, reason = 1000, dlen = 0xFFFFFFFFu, linger = 0, rl = 0;
    int32_t ret = -1;
    queue_n(0, 9, 2);
    memcpy(args, &h, 4); memcpy(args + 4, &reason, 4); memcpy(args + 8, &dlen, 4); memcpy(args + 12, &linger, 4);
    gl_nets_close_connection((void *)1, args, 16, resp, sizeof resp, &rl);
    memcpy(&ret, resp, 4);
    printf("found=%d closes=%d ret=%d rl=%u\n", gl_nets_queue_find(0, 9, 0) != NULL, g_close_calls, ret, rl);
    return 0;
  }
  if (strcmp(c, "nets-destroy-pg-clears") == 0) {
    static uint8_t resp[64];
    uint32_t h = 9, rl = 0;
    int32_t ret = -1;
    queue_n(1, 9, 2);
    queue_n(0, 9, 1);
    gl_nets_destroy_poll_group((void *)1, (const uint8_t *)&h, 4, resp, sizeof resp, &rl);
    memcpy(&ret, resp, 4);
    printf("found=%d connfound=%d destroys=%d ret=%d rl=%u\n", gl_nets_queue_find(1, 9, 0) != NULL,
           gl_nets_queue_find(0, 9, 0) != NULL, g_destroy_calls, ret, rl);
    return 0;
  }
  if (strcmp(c, "net-join-budget") == 0) {
    for (int i = 0; i < 40; i++) gl_net_evidence(1, GL_NET_KIND_JOIN, GL_NET_IFACE_SOCKETS, 1221, 0, GL_NET_PATH_UNKNOWN);
    return 0;
  }
  if (strcmp(c, "net-path-latch") == 0) {
    for (int i = 0; i < 40; i++) gl_net_evidence(1, GL_NET_KIND_SEND, GL_NET_IFACE_SOCKETS, 0, 5, GL_NET_PATH_UNKNOWN);
    gl_net_evidence(1, GL_NET_KIND_PATH, GL_NET_IFACE_SOCKETS, 0, 0, GL_NET_PATH_DIRECT);
    gl_net_evidence(1, GL_NET_KIND_PATH, GL_NET_IFACE_NETWORKING, 0, 0, GL_NET_PATH_RELAYED);
    gl_net_evidence(1, GL_NET_KIND_RECV, GL_NET_IFACE_SOCKETS, 0, 5, GL_NET_PATH_UNKNOWN);
    return 0;
  }
  if (strncmp(c, "p2p-", 4) == 0) {
    g_bd_flat_SteamNetworking006_IsP2PPacketAvailable = fake_avail;
    g_bd_flat_SteamNetworking006_ReadP2PPacket = fake_read;
    if (strcmp(c, "p2p-oversize-then-small") == 0) {
      g_q[0] = 70000; g_q[1] = 10; g_qn = 2;
      p2p_call();
      p2p_call();
    } else if (strcmp(c, "p2p-huge") == 0) {
      g_q[0] = 2000000; g_qn = 1;
      p2p_call();
    } else if (strcmp(c, "p2p-normal") == 0) {
      g_q[0] = 100; g_qn = 1;
      p2p_call();
    } else {
      return 2;
    }
    return 0;
  } else {
    int which = strcmp(c, "sockets-conn") == 0 || strcmp(c, "sockets-oversize") == 0 ? 0
              : strcmp(c, "sockets-poll") == 0 ? 1
              : strcmp(c, "messages") == 0 ? 2 : -1;
    static uint8_t resp[65536];
    uint8_t args[8];
    uint32_t handle = 7, rl = 0;
    int32_t nMax = 4, n = 0;
    int rc;
    if (which < 0) return 2;
    if (strcmp(c, "sockets-oversize") == 0) g_oversize_cb = GL_NETS_RECORDS_MAX - GL_NETS_REC_HEADER + 1;
    memcpy(args, &handle, 4);
    memcpy(args + 4, &nMax, 4);
    rc = gl_nets_receive(which, (void *)1, args, 8, resp, sizeof resp, &rl);
    memcpy(&n, resp, 4);
    printf("rc=%d n=%d releases=%d\n", rc, n, g_release_calls);
    fflush(stdout);
    return 0;
  }
}
