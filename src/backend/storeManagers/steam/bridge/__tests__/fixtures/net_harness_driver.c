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
/* quick-261101-mv3: 513 injector driven through the real pump. */
#define INJ_MAX 4
static gl_CallbackMsg_t g_inj_q[INJ_MAX];
static uint8_t g_inj_buf[INJ_MAX][12];
static gl_SteamAPICallCompleted_t g_inj_done[INJ_MAX];
static uint8_t g_inj_cr[12];
static int g_inj_n = 0, g_inj_pos = 0;
static void inj_run_frame(int32_t pipe) { (void)pipe; }
static void inj_free_last(int32_t pipe) { (void)pipe; }
static bool inj_get_next(int32_t pipe, gl_CallbackMsg_t *m) {
  (void)pipe;
  if (g_inj_pos >= g_inj_n) return false;
  *m = g_inj_q[g_inj_pos++];
  return true;
}
static bool inj_get_api_call_result(int32_t pipe, uint64_t h, void *buf, int cub, int id, bool *failed) {
  (void)pipe;
  (void)h;
  if (cub != 12 || id != 513) return false;
  memcpy(buf, g_inj_cr, 12);
  *failed = false;
  return true;
}
static void inj_pack(uint8_t *b, int32_t eResult, uint64_t lobby) {
  memcpy(b, &eResult, 4);
  memcpy(b + 4, &lobby, 8);
}
static void inj_push(int32_t id, int32_t eResult, uint64_t lobby) {
  gl_CallbackMsg_t *m = &g_inj_q[g_inj_n];
  inj_pack(g_inj_buf[g_inj_n], eResult, lobby);
  memset(m, 0, sizeof *m);
  m->m_iCallback = id;
  m->m_pubParam = g_inj_buf[g_inj_n];
  m->m_cubParam = 12;
  g_inj_n++;
}
static void inj_push_703(uint64_t hCall, int32_t eResult, uint64_t lobby) {
  gl_CallbackMsg_t *m = &g_inj_q[g_inj_n];
  gl_SteamAPICallCompleted_t *d = &g_inj_done[g_inj_n];
  inj_pack(g_inj_cr, eResult, lobby);
  d->m_hAsyncCall = hCall;
  d->m_iCallback = 513;
  d->m_cubParam = 12;
  memset(m, 0, sizeof *m);
  m->m_iCallback = GL_CBQ_ID_API_CALL_COMPLETED;
  m->m_pubParam = (uint8_t *)d;
  m->m_cubParam = (int32_t)sizeof *d;
  g_inj_n++;
}
static void inj_pump(void) {
  g_inj_pos = 0;
  gl_manual_pump_into_ring();
  g_inj_n = 0;
  g_inj_pos = 0;
}
static void inj_setup(void) {
  g_manual_dispatch = 1;
  g_md_run_frame = inj_run_frame;
  g_md_get_next = inj_get_next;
  g_md_free_last = inj_free_last;
}
int SteamAPI_ISteamFriends_GetFriendCount(void *self, int f) { return fake_friend_count(self, f); }
uint64_t SteamAPI_ISteamFriends_GetFriendByIndex(void *self, int i, int f) { return fake_friend_by_index(self, i, f); }
int SteamAPI_ISteamFriends_GetFriendPersonaState(void *self, uint64_t id) { return fake_friend_state(self, id); }
int SteamAPI_ISteamFriends_GetFriendGamePlayed(void *self, uint64_t id, void *info) { return fake_friend_played(self, id, info); }

/* 58-30: server-browser fakes. */
static int g_ping_calls = 0, g_cancel_calls = 0, g_relreq_calls = 0;
static int32_t g_cancel_last = 0;
static int32_t g_next_query = 100;
static uint64_t g_next_list = 1;
int32_t SteamAPI_ISteamMatchmakingServers_PingServer(void *self, uint32_t ip, uint16_t port, void *resp) {
  (void)self; (void)ip; (void)port; (void)resp;
  g_ping_calls++;
  return g_next_query++;
}
void SteamAPI_ISteamMatchmakingServers_CancelServerQuery(void *self, int32_t q) {
  (void)self;
  g_cancel_calls++;
  g_cancel_last = q;
}
void SteamAPI_ISteamMatchmakingServers_ReleaseRequest(void *self, void *h) {
  (void)self; (void)h;
  g_relreq_calls++;
}
void *SteamAPI_ISteamMatchmakingServers_RequestInternetServerList(void *self, uint32_t app, void *f, uint32_t n, void *r) {
  (void)self; (void)app; (void)f; (void)n; (void)r;
  return (void *)(uintptr_t)(g_next_list++);
}

static int32_t do_ping(void) {
  uint8_t a[8] = {1, 2, 3, 4, 0x39, 0x30, 0, 0};
  uint8_t r[8];
  uint32_t rl = 0;
  int32_t q = 12345;
  int rc = gl_mms_ping_server((void *)1, a, 8, r, sizeof r, &rl);
  if (rc != 0 || rl != 4) return 12345;
  memcpy(&q, r, 4);
  return q;
}
static uint64_t do_list(void) {
  uint8_t a[12] = {0};
  uint8_t r[8];
  uint32_t rl = 0;
  uint64_t h = 777;
  if (gl_mms_request_list((void *)1, a, 12, r, sizeof r, &rl) != 0 || rl != 8) return 777;
  memcpy(&h, r, 8);
  return h;
}
static int do_cancel(int32_t q) {
  uint32_t rl = 0;
  uint8_t r[4];
  return gl_mms_cancel_server_query((void *)1, (const uint8_t *)&q, 4, r, sizeof r, &rl);
}
static int do_release(uint64_t h) {
  uint32_t rl = 0;
  uint8_t r[4];
  return gl_mms_release_request((void *)1, (const uint8_t *)&h, 8, r, sizeof r, &rl);
}
static int pool_bound(void) {
  int n = 0;
  for (int i = 0; i < GL_MMS_POOL; i++) n += g_mms_bind[GL_MMS_G_PING][i].used;
  return n;
}

static int run_mms_case(const char *c) {
  g_dylib_handle = RTLD_DEFAULT;
  if (strcmp(c, "mms-pool-full") == 0) {
    int ok = 1;
    int32_t extra;
    for (int i = 0; i < GL_MMS_POOL; i++) if (do_ping() != 100 + i) ok = 0;
    extra = do_ping();
    for (int i = 0; i < GL_MMS_POOL; i++) if (g_mms_bind[GL_MMS_G_PING][i].handle != 100 + i) ok = 0;
    printf("pool=%d ok=%d extra=%d calls=%d bound=%d\n", GL_MMS_POOL, ok, extra, g_ping_calls, pool_bound());
  } else if (strcmp(c, "mms-cancel-releases") == 0) {
    int32_t again;
    for (int i = 0; i < GL_MMS_POOL; i++) do_ping();
    printf("full-refused=%d\n", do_ping() == -1);
    do_cancel(105);
    printf("cancel calls=%d last=%d bound=%d\n", g_cancel_calls, g_cancel_last, pool_bound());
    again = do_ping();
    printf("again=%d bound=%d slot5=%d\n", again, pool_bound(), g_mms_bind[GL_MMS_G_PING][5].handle);
  } else if (strcmp(c, "mms-cancel-unknown") == 0) {
    do_ping();
    do_ping();
    do_cancel(9999);
    printf("cancel calls=%d last=%d bound=%d h0=%d h1=%d\n", g_cancel_calls, g_cancel_last, pool_bound(),
           g_mms_bind[GL_MMS_G_PING][0].handle, g_mms_bind[GL_MMS_G_PING][1].handle);
  } else if (strcmp(c, "mms-issued-full") == 0) {
    int ok = 1;
    uint64_t extra;
    for (uint64_t i = 1; i <= GL_MMS_ISSUED_MAX; i++) if (do_list() != i) ok = 0;
    printf("kept=%d releases=%d\n", ok, g_relreq_calls);
    extra = do_list();
    printf("extra=%llu releases=%d\n", (unsigned long long)extra, g_relreq_calls);
    ok = 1;
    for (uint64_t i = 1; i <= GL_MMS_ISSUED_MAX; i++) if (!gl_mms_is_issued(i)) ok = 0;
    printf("all-issued=%d\n", ok);
  } else if (strcmp(c, "mms-release-frees") == 0) {
    uint64_t h = 0x100000005ull, h2 = 0x200000005ull;
    printf("issue=%d is=%d\n", gl_mms_issue(h), gl_mms_is_issued(h));
    do_release(h);
    printf("release calls=%d is=%d\n", g_relreq_calls, gl_mms_is_issued(h));
    printf("reissue=%d\n", gl_mms_issue(h2));
  } else if (strcmp(c, "mms-collision") == 0) {
    uint64_t h = 0x100000005ull, h2 = 0x200000005ull;
    printf("first=%d same=%d collide=%d is2=%d\n", gl_mms_issue(h), gl_mms_issue(h), gl_mms_issue(h2),
           gl_mms_is_issued(h2));
  } else {
    return 2;
  }
  fflush(stdout);
  return 0;
}

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

/* WR-07 p2pfb-*: legacy-P2P fallback, per-1202 remote + allowlist. */
#define PFB_BASE 76561198100000000ull
static uint64_t g_pfb_acc[128];
static int g_pfb_accn = 0;
static uint64_t g_pfb_lobby_l = 0, g_pfb_lobby_m = 0;
static uint64_t g_pfb_member_l = 0, g_pfb_member_m = 0;
static int32_t g_pfb_lobby_count = 0;
static int pfb_accept(void *self, uint64_t remote) {
  (void)self;
  if (g_pfb_accn < 128) g_pfb_acc[g_pfb_accn++] = remote;
  return 1;
}
static int32_t pfb_num(void *self, uint64_t lobby) {
  (void)self;
  return lobby == g_pfb_lobby_l ? g_pfb_lobby_count : lobby == g_pfb_lobby_m ? 1 : 0;
}
static uint64_t pfb_member(void *self, uint64_t lobby, int32_t i) {
  (void)self;
  (void)i;
  return lobby == g_pfb_lobby_l ? g_pfb_member_l : lobby == g_pfb_lobby_m ? g_pfb_member_m : 0;
}
static void pfb_run_frame(int32_t pipe) { (void)pipe; }
static bool pfb_get_next(int32_t pipe, gl_CallbackMsg_t *m) {
  (void)pipe;
  (void)m;
  return false;
}
static void pfb_setup(void) {
  g_inited = 1;
  g_manual_dispatch = 1;
  g_md_run_frame = pfb_run_frame;
  g_md_get_next = pfb_get_next;
  g_bd_self_steamnetworking006 = (void *)3;
  g_bd_self_steammatchmaking009 = (void *)2;
  g_bd_flat_SteamNetworking006_AcceptP2PSessionWithUser = pfb_accept;
  g_bd_flat_SteamMatchMaking009_GetNumLobbyMembers = pfb_num;
  g_bd_flat_SteamMatchMaking009_GetLobbyMemberByIndex = pfb_member;
}
static void pfb_serve(uint64_t remote) {
  uint8_t body[GL_CBQ_DRAIN_RESP_MAX_BYTES], status = 9;
  gl_cbq_offer(&g_cbq, GL_CBQ_ID_P2P_SESSION_REQUEST, (const uint8_t *)&remote, 8);
  control_call(1, CONTROL_SLOT_DRAIN_CALLBACKS, NULL, 0, &status, body, sizeof body);
}
static void pfb_report(uint32_t dn) {
  uint8_t body[16], status = 9, arg[12];
  int32_t id = GL_CBQ_ID_P2P_SESSION_REQUEST;
  uint32_t dh = 0;
  memcpy(arg, &id, 4);
  memcpy(arg + 4, &dn, 4);
  memcpy(arg + 8, &dh, 4);
  control_call(1, CONTROL_SLOT_REPORT_CB_DISPATCH, arg, 12, &status, body, sizeof body);
}
static void pfb_sent(uint64_t remote) {
  uint8_t args[32];
  memset(args, 0, sizeof args);
  memcpy(args, &remote, 8);
  gl_p2p_note_call(bd_call_index(BD_ORDINAL_SteamNetworking006, BD_SLOT_SteamNetworking006_SendP2PPacket), args,
                   sizeof args);
}
static void pfb_lobby_enter(uint64_t lobby, int32_t resp) {
  uint8_t buf[GL_CBQ_LOBBYENTER_MAC_SIZE];
  memset(buf, 0, sizeof buf);
  memcpy(buf, &lobby, 8);
  memcpy(buf + GL_CBQ_LOBBYENTER_MAC_OFF_RESPONSE, &resp, 4);
  gl_p2p_note_lobby_from_mac(GL_CBQ_ID_LOBBY_ENTER, buf);
}
static void pfb_print(const char *tag) {
  printf("%s accepts=%d idx=", tag, g_pfb_accn);
  for (int i = 0; i < g_pfb_accn; i++) printf("%lld,", (long long)(g_pfb_acc[i] - PFB_BASE));
  printf("\n");
}
static int run_pfb_case(const char *c) {
  pfb_setup();
  if (strcmp(c, "p2pfb-order") == 0) {
    pfb_sent(PFB_BASE + 1);
    pfb_sent(PFB_BASE + 2);
    pfb_serve(PFB_BASE + 1);
    pfb_serve(PFB_BASE + 2);
    pfb_report(0);
    pfb_report(0);
    pfb_print("order");
  } else if (strcmp(c, "p2pfb-stranger") == 0) {
    pfb_serve(PFB_BASE + 77);
    pfb_report(0);
    pfb_print("stranger");
  } else if (strcmp(c, "p2pfb-lobby") == 0) {
    g_pfb_lobby_l = 109775240000000001ull;
    g_pfb_lobby_m = 109775240000000002ull;
    g_pfb_member_l = PFB_BASE + 5;
    g_pfb_member_m = PFB_BASE + 6; /* Z is only in lobby M (response 2, never recorded) */
    g_pfb_lobby_count = 1;
    pfb_lobby_enter(g_pfb_lobby_l, 1);
    pfb_lobby_enter(g_pfb_lobby_m, 2);
    pfb_serve(PFB_BASE + 5);
    pfb_report(0);
    pfb_print("member");
    pfb_serve(PFB_BASE + 6);
    pfb_report(0);
    pfb_print("response2");
    g_pfb_lobby_count = 0; /* left the lobby */
    pfb_serve(PFB_BASE + 5);
    pfb_report(0);
    pfb_print("left");
  } else if (strcmp(c, "p2pfb-listener") == 0) {
    pfb_sent(PFB_BASE + 1);
    pfb_sent(PFB_BASE + 2);
    pfb_serve(PFB_BASE + 1);
    pfb_serve(PFB_BASE + 2);
    pfb_report(1);
    pfb_report(0);
    pfb_print("listener");
  } else if (strcmp(c, "p2pfb-empty") == 0) {
    pfb_report(0);
    pfb_print("empty");
  } else if (strcmp(c, "p2pfb-reaccept") == 0) {
    pfb_sent(PFB_BASE + 1);
    pfb_serve(PFB_BASE + 1);
    pfb_report(0);
    pfb_serve(PFB_BASE + 1);
    pfb_report(0);
    pfb_print("reaccept");
  } else if (strcmp(c, "p2pfb-sent-evict") == 0) {
    for (int i = 0; i <= 64; i++) pfb_sent(PFB_BASE + 1000 + i);
    pfb_serve(PFB_BASE + 1000);
    pfb_report(0);
    pfb_print("evicted");
    pfb_serve(PFB_BASE + 1064);
    pfb_report(0);
    pfb_print("newest");
  } else if (strcmp(c, "p2pfb-overflow") == 0) {
    for (int i = 0; i < 40; i++) pfb_sent(PFB_BASE + 2000 + i);
    for (int i = 0; i < 40; i++) pfb_serve(PFB_BASE + 2000 + i);
    for (int i = 0; i < 8; i++) pfb_report(0);
    pfb_print("skipped");
    pfb_report(0);
    pfb_print("ninth");
  } else if (strcmp(c, "p2pfb-strangers-flood") == 0) {
    for (int i = 0; i < 40; i++) {
      pfb_serve(PFB_BASE + 3000 + i);
      pfb_report(0);
    }
    pfb_print("flood");
  } else if (strcmp(c, "p2pfb-many") == 0) {
    for (int k = 1; k <= 8; k++) pfb_sent(PFB_BASE + 4000 + k);
    for (int k = 1; k <= 8; k++) {
      pfb_serve(PFB_BASE + 4000 + k);
      pfb_report(0);
    }
    pfb_print("many");
  } else {
    return 2;
  }
  return 0;
}

int main(int argc, char **argv) {
  const char *c = argc > 1 ? argv[1] : "";
  if (strncmp(c, "mms-", 4) == 0 && strcmp(c, "mms-lobby-args") != 0) return run_mms_case(c);
  g_dylib_handle = RTLD_DEFAULT;
  if (strncmp(c, "p2pfb-", 6) == 0) return run_pfb_case(c);
  if (strcmp(c, "unlisted-cub") == 0) {
    /* quick 261106-qvp: an unlisted id logs once per id with its payload size. */
    inj_setup();
    inj_push(1298, 0, 0);
    inj_pump();
    inj_push(1298, 0, 0);
    inj_pump();
    printf("unlisted-cub done\n");
    return 0;
  }
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
      /* no count cap (58 WR-01): pretend 2 s passed between every call */
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
          /* 58 WR-04: the ordinal is a (generation << 8) | index token. */
          printf("f idx=%u gen=%u online=%u playing=%u name=%.*s\n", o & 0xffu, o >> 8, body[off + 4], body[off + 5], (int)nl,
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
      r = gl_invite_send((void *)2, (g_friend_snapshot_gen << 8) | 2u);
      printf("r=%d calls=%d lobbyok=%d targetok=%d\n", r, g_inv_calls, g_inv_lobby == lobby, g_inv_target == k_fid[2]);
      return 0;
    }
    if (strcmp(c, "invite-zero-adopt") == 0) {
      uint64_t lobby = 109775240000000002ull;
      uint32_t rl = 0, fn = 0;
      int32_t pre, r;
      inj_setup();
      memset(arg, 0, 8);
      gl_friends_invite_dialog((void *)1, arg, 8, body, sizeof body, &rl);
      gl_invite_list_friends((void *)1, body, sizeof body, &fn);
      pre = gl_invite_send((void *)2, (g_friend_snapshot_gen << 8) | 2u);
      inj_push(513, 1, lobby);
      inj_pump();
      r = gl_invite_send((void *)2, (g_friend_snapshot_gen << 8) | 2u);
      printf("pre=%d r=%d calls=%d lobbyok=%d targetok=%d\n", pre, r, g_inv_calls, g_inv_lobby == lobby,
             g_inv_target == k_fid[2]);
      return 0;
    }
    if (strcmp(c, "invite-zero-guards") == 0) {
      uint64_t l1 = 109775240000000011ull, l2 = 109775240000000012ull, l3 = 109775240000000013ull,
               l4 = 109775240000000014ull;
      uint32_t rl = 0;
      int badres, zerolobby, explicit_, cr, oneshot;
      inj_setup();
      memset(arg, 0, 8);
      gl_friends_invite_dialog((void *)1, arg, 8, body, sizeof body, &rl);
      inj_push(513, 2, l2);
      inj_pump();
      badres = g_invite_lobby != 0;
      g_invite_lobby = 0;
      gl_friends_invite_dialog((void *)1, arg, 8, body, sizeof body, &rl);
      inj_push(513, 1, 0);
      inj_pump();
      zerolobby = g_invite_lobby != 0;
      memcpy(arg, &l1, 8);
      gl_friends_invite_dialog((void *)1, arg, 8, body, sizeof body, &rl);
      inj_push(513, 1, l2);
      inj_pump();
      explicit_ = g_invite_lobby == l1;
      g_invite_lobby = 0;
      memset(arg, 0, 8);
      gl_friends_invite_dialog((void *)1, arg, 8, body, sizeof body, &rl);
      g_md_get_api_call_result = inj_get_api_call_result;
      gl_helper_cr_track(0x1234ull, 513);
      inj_push_703(0x1234ull, 1, l3);
      inj_pump();
      cr = g_invite_lobby == l3;
      inj_push(513, 1, l4);
      inj_pump();
      oneshot = g_invite_lobby == l3;
      printf("badres=%d zerolobby=%d explicit=%d cr=%d oneshot=%d\n", badres, zerolobby, explicit_, cr, oneshot);
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
      a4 = gl_invite_send((void *)2, (g_friend_snapshot_gen << 8) | 3u);
      {
        /* 58 WR-04: a token from a superseded snapshot, a bare index and a
         * current token. Only the last one reaches InviteUserToLobby. */
        uint32_t stale = (g_friend_snapshot_gen << 8) | 0u;
        int32_t s1, s2, s3;
        gl_invite_list_friends((void *)1, body, sizeof body, &fn);
        s1 = gl_invite_send((void *)2, stale);
        s2 = gl_invite_send((void *)2, 0);
        s3 = gl_invite_send((void *)2, (g_friend_snapshot_gen << 8) | 0u);
        printf("stale=%d bare=%d current=%d target0=%d\n", s1, s2, s3, g_inv_target == k_fid[0]);
      }
      g_invite_born_ms = gl_invite_now_ms() - 601000ull;
      a2 = gl_invite_send((void *)2, (g_friend_snapshot_gen << 8) | 0u);
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
