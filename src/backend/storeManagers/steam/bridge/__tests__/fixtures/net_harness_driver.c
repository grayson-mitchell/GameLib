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

/* 58-29: invite path fakes. Fake SteamIDs are 17-digit decimals so a log leak
 * is detectable; the response must not contain their little-endian bytes. */
static int g_dialog_calls = 0;
static uint64_t g_dialog_lobby = 0;
static void fake_dialog(void *self, uint64_t lobby) {
  (void)self;
  g_dialog_calls++;
  g_dialog_lobby = lobby;
}
static const uint64_t k_fid[3] = {76561198000000001ull, 76561198000000002ull, 76561198000000003ull};
static int fake_friend_count(void *self, int flags) {
  (void)self; (void)flags;
  return 3;
}
static uint64_t fake_friend_by_index(void *self, int i, int flags) {
  (void)self; (void)flags;
  return k_fid[i];
}
static int fake_friend_state(void *self, uint64_t id) {
  (void)self;
  return id == k_fid[1] ? 0 : 1;
}
static int fake_friend_played(void *self, uint64_t id, void *info) {
  uint64_t gid = 3205720ull;
  (void)self;
  if (id != k_fid[2]) return 0;
  memcpy(info, &gid, 8);
  return 1;
}
static const char *fake_friend_name(void *self, uint64_t id) {
  (void)self;
  return id == k_fid[0] ? "Alice" : id == k_fid[1] ? "Bob" : "Cara";
}
static int g_inv_calls = 0;
static uint64_t g_inv_lobby = 0, g_inv_target = 0;
static int fake_invite(void *self, uint64_t lobby, uint64_t invitee) {
  (void)self;
  g_inv_calls++;
  g_inv_lobby = lobby;
  g_inv_target = invitee;
  return 1;
}

static void setup_invite_fakes(void) {
  g_bd_flat_SteamFriends017_ActivateGameOverlayInviteDialog = fake_dialog;
  g_bd_flat_SteamFriends017_GetFriendPersonaName = fake_friend_name;
  g_bd_flat_SteamMatchMaking009_InviteUserToLobby = fake_invite;
}
int SteamAPI_ISteamFriends_GetFriendCount(void *self, int f) { return fake_friend_count(self, f); }
uint64_t SteamAPI_ISteamFriends_GetFriendByIndex(void *self, int i, int f) { return fake_friend_by_index(self, i, f); }
int SteamAPI_ISteamFriends_GetFriendPersonaState(void *self, uint64_t id) { return fake_friend_state(self, id); }
int SteamAPI_ISteamFriends_GetFriendGamePlayed(void *self, uint64_t id, void *info) { return fake_friend_played(self, id, info); }

static int read_frame(int fd, uint8_t *status, uint8_t *body, uint32_t cap) {
  uint8_t h[9];
  uint32_t total;
  size_t got = 0;
  while (got < sizeof h) {
    ssize_t r = read(fd, h + got, sizeof h - got);
    if (r <= 0) return -1;
    got += (size_t)r;
  }
  memcpy(&total, h, 4);
  *status = h[8];
  if (total < 5 || total - 5 > cap) return -1;
  got = 0;
  while (got < total - 5) {
    ssize_t r = read(fd, body + got, (total - 5) - got);
    if (r <= 0) return -1;
    got += (size_t)r;
  }
  return (int)(total - 5);
}

static int control_call(int authenticated, uint16_t slot, const uint8_t *arg, uint32_t argLen, uint8_t *status,
                        uint8_t *body, uint32_t cap) {
  int sv[2], hl = 0, auth = authenticated, n;
  socketpair(AF_UNIX, SOCK_STREAM, 0, sv);
  dispatch_and_respond(sv[0], 1, CONTROL_ORDINAL, slot, arg, argLen, &hl, &auth);
  n = read_frame(sv[1], status, body, cap);
  close(sv[0]);
  close(sv[1]);
  return n;
}

int main(int argc, char **argv) {
  const char *c = argc > 1 ? argv[1] : "";
  g_dylib_handle = RTLD_DEFAULT;
  if (strncmp(c, "invite-", 7) == 0 || strcmp(c, "list-friends") == 0 || strcmp(c, "control-unauth") == 0 ||
      strcmp(c, "mms-lobby-args") == 0) {
    uint8_t body[GL_INVITE_FRIENDS_RESP_MAX];
    uint8_t status = 9;
    uint8_t arg[16];
    uint32_t ord;
    int n;
    setup_invite_fakes();
    g_bd_self_steamfriends017 = (void *)1;
    g_bd_self_steammatchmaking009 = (void *)2;
    g_appid_u64 = 3205720ull;
    strcpy(g_appid, "3205720");
    if (strcmp(c, "invite-dialog") == 0) {
      uint64_t lobby = 109775240000000001ull;
      uint32_t rl = 0;
      memcpy(arg, &lobby, 8);
      gl_friends_invite_dialog((void *)1, arg, 8, body, sizeof body, &rl);
      printf("dialog calls=%d match=%d rl=%u bad=%d\n", g_dialog_calls, g_dialog_lobby == lobby, rl,
             gl_friends_invite_dialog((void *)1, arg, 7, body, sizeof body, &rl));
      return 0;
    }
    if (strcmp(c, "invite-dialog-ratelimit") == 0) {
      uint64_t lobby = 109775240000000001ull;
      uint32_t rl = 0;
      memcpy(arg, &lobby, 8);
      for (int i = 0; i < 20; i++) gl_friends_invite_dialog((void *)1, arg, 8, body, sizeof body, &rl);
      /* cap: pretend 2 s passed between every call */
      for (int i = 0; i < 40; i++) {
        g_invite_last_log_ms -= 3000;
        gl_friends_invite_dialog((void *)1, arg, 8, body, sizeof body, &rl);
      }
      printf("dialog calls=%d\n", g_dialog_calls);
      return 0;
    }
    if (strcmp(c, "mms-lobby-args") == 0) {
      uint8_t a[12];
      int32_t type = 1, max = 4, v = 1;
      uint64_t lobby = 109775240000000001ull;
      int ciCreate = bd_call_index(BD_ORDINAL_SteamMatchMaking009, BD_SLOT_SteamMatchMaking009_CreateLobby);
      int ciJoin = bd_call_index(BD_ORDINAL_SteamMatchMaking009, BD_SLOT_SteamMatchMaking009_SetLobbyJoinable);
      int ciType = bd_call_index(BD_ORDINAL_SteamMatchMaking009, BD_SLOT_SteamMatchMaking009_SetLobbyType);
      memcpy(a, &type, 4);
      memcpy(a + 4, &max, 4);
      for (int i = 0; i < 5; i++) gl_mms_lobby_log(ciCreate, a, 8);
      memcpy(a, &lobby, 8);
      memcpy(a + 8, &v, 4);
      gl_mms_lobby_log(ciJoin, a, 12);
      gl_mms_lobby_log(ciType, a, 12);
      return 0;
    }
    if (strcmp(c, "list-friends") == 0) {
      uint32_t fn = 0;
      int rc;
      g_dispatch_respbuf[0] = 0;
      rc = gl_invite_list_friends((void *)1, body, sizeof body, &fn);
      printf("rc=%d len=%u leak=", rc, fn);
      {
        int leak = 0;
        for (int k = 0; k < 3; k++)
          for (uint32_t o = 0; o + 8 <= fn; o++)
            if (memcmp(body + o, &k_fid[k], 8) == 0) leak = 1;
        printf("%d\n", leak);
      }
      {
        uint32_t cnt, off = 4;
        memcpy(&cnt, body, 4);
        printf("count=%u\n", cnt);
        for (uint32_t i = 0; i < cnt; i++) {
          uint32_t o;
          uint16_t nl;
          memcpy(&o, body + off, 4);
          memcpy(&nl, body + off + 6, 2);
          printf("f ord=%u online=%u playing=%u name=%.*s\n", o, body[off + 4], body[off + 5], (int)nl,
                 (const char *)body + off + 8);
          off += 8u + nl;
        }
      }
      return 0;
    }
    if (strcmp(c, "invite-ok") == 0) {
      uint64_t lobby = 109775240000000001ull;
      uint32_t rl = 0, fn = 0;
      int32_t r;
      memcpy(arg, &lobby, 8);
      gl_friends_invite_dialog((void *)1, arg, 8, body, sizeof body, &rl);
      gl_invite_list_friends((void *)1, body, sizeof body, &fn);
      r = gl_invite_send((void *)2, 2);
      printf("r=%d calls=%d lobbyok=%d targetok=%d\n", r, g_inv_calls, g_inv_lobby == lobby, g_inv_target == k_fid[2]);
      return 0;
    }
    if (strcmp(c, "invite-refusals") == 0) {
      uint64_t lobby = 109775240000000001ull;
      uint32_t rl = 0, fn = 0;
      int32_t a1, a2, a3, a4;
      a1 = gl_invite_send((void *)2, 0);
      memcpy(arg, &lobby, 8);
      gl_friends_invite_dialog((void *)1, arg, 8, body, sizeof body, &rl);
      a3 = gl_invite_send((void *)2, 0); /* no snapshot yet */
      gl_invite_list_friends((void *)1, body, sizeof body, &fn);
      a4 = gl_invite_send((void *)2, 3);
      g_invite_born_ms = gl_invite_now_ms() - 601000ull;
      a2 = gl_invite_send((void *)2, 0);
      printf("nopending=%d expired=%d nosnap=%d badord=%d calls=%d\n", a1, a2, a3, a4, g_inv_calls);
      {
        uint8_t st = 9;
        g_invite_born_ms = gl_invite_now_ms();
        ord = 0;
        memcpy(arg, &ord, 4);
        n = control_call(1, CONTROL_SLOT_INVITE_FRIEND, arg, 3, &st, body, sizeof body);
        printf("badlen status=%u\n", st);
      }
      return 0;
    }
    /* control-unauth */
    g_inited = 1;
    n = control_call(0, CONTROL_SLOT_LIST_FRIENDS, NULL, 0, &status, body, sizeof body);
    printf("unauth13 status=%u n=%d\n", status, n);
    ord = 0;
    memcpy(arg, &ord, 4);
    n = control_call(0, CONTROL_SLOT_INVITE_FRIEND, arg, 4, &status, body, sizeof body);
    printf("unauth14 status=%u n=%d\n", status, n);
    n = control_call(1, CONTROL_SLOT_LIST_FRIENDS, NULL, 0, &status, body, sizeof body);
    printf("auth13 status=%u n=%d\n", status, n);
    n = control_call(1, CONTROL_SLOT_INVITE_FRIEND, arg, 4, &status, body, sizeof body);
    printf("auth14 status=%u n=%d\n", status, n);
    return 0;
  }
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
