/**
 * Phase 24 Plan 02 (R2) -- the native arm64 host helper.
 *
 * Upgrades spike 005b's connect-per-call `bridge_server.c`
 * (.claude/skills/spike-findings-gamelib/sources/005b-bottle-to-host-tcp/bridge_server.c)
 * to D-03's persistent-channel design: ONE shared, long-lived process that
 * `dlopen`s the real `libsteam_api.dylib`, calls `SteamAPI_InitFlat` EXACTLY
 * ONCE at startup (D-04 -- the flat init takes no AppID; identity resolves
 * from a `steam_appid.txt` containing `480`/Spacewar in the working
 * directory), holds the inited `ISteamUser`/`ISteamFriends` accessor
 * pointers for the process lifetime, and serves marshaled requests over a
 * single persistent `127.0.0.1` loopback-only connection using the binary
 * frame defined in `src/backend/storeManagers/steam/bridge/protocol.ts`
 * (24-RESEARCH.md Pattern 3 -- the SAME frame the already-generated shim's
 * `bridge_transact()` speaks, native/steam-bridge/generated/steam_api_shim.c).
 *
 * Wire frame (matches protocol.ts byte-for-byte):
 *   Request:  [4B LE total_len][4B LE request_id][2B LE ordinal][2B LE slot][N argBlob]
 *     total_len = byte count of request_id+ordinal+slot+argBlob (excludes itself)
 *   Response: [4B LE total_len][4B LE request_id][1B status][N retBlob]
 *     total_len = byte count of request_id+status+retBlob (excludes itself)
 *     status: 0=ok, 1=err/no-live-session (or not-inited, for CONTROL WHOAMI
 *     answered before init succeeds)
 *
 * CONTROL frame (review finding #7): a reserved ordinal (0xFFFF) reconciles
 * spike 005b's human-readable PING/WHOAMI text handshake into this binary
 * protocol so the 24-06 readiness probe can distinguish two states a single
 * liveness check cannot:
 *   - HEALTH (slot 0): answered immediately, BEFORE/independent of whether
 *     `SteamAPI_InitFlat` succeeded -- proves "process up". This is why
 *     init failure below does NOT exit(); it degrades to serving HEALTH ok
 *     / WHOAMI not-inited rather than crashing the whole helper (a
 *     deliberate divergence from spike 005b, which exits on init failure).
 *   - WHOAMI (slot 1): answered ok+real-SteamID64-bytes ONLY once InitFlat
 *     succeeded against the live signed-in Mac Steam -- proves "init
 *     succeeded against a live session".
 *
 * T-24-01 (mitigate): binds INADDR_LOOPBACK only -- never a routable/
 * all-interfaces bind.
 * T-24-03 (mitigate): every inbound frame's declared length is bounds-
 * checked against MAX_FRAME_BYTES BEFORE any read of the body, into a
 * fixed-size (never attacker-sized) static buffer -- never allocates past
 * the cap.
 * T-24-SC (mitigate): the dylib path is built from $HOME (canonical,
 * OS/Steam-provided location), never from attacker-supplied input.
 *
 * Compiled by clang at packaging time (Plan 24-07), not here.
 */

#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <dlfcn.h>
#include <unistd.h>
#include <time.h>
#include <errno.h>
#include <signal.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <netinet/in.h>
#include <arpa/inet.h>

// === Frame constants (MUST match src/backend/storeManagers/steam/bridge/protocol.ts) ===

#define BRIDGE_PORT 54550

#define LENGTH_FIELD_BYTES 4
#define REQUEST_ID_BYTES 4
#define ORDINAL_BYTES 2
#define SLOT_BYTES 2
#define STATUS_BYTES 1
#define REQUEST_HEADER_BYTES (REQUEST_ID_BYTES + ORDINAL_BYTES + SLOT_BYTES) // 8
#define RESPONSE_HEADER_BYTES (REQUEST_ID_BYTES + STATUS_BYTES)             // 5

// T-24-03: hard cap on a frame's DECLARED length, matching protocol.ts's
// MAX_FRAME_BYTES exactly. Also sizes the fixed argument buffer below, so
// no read into an attacker-controlled-size allocation is ever possible.
#define MAX_FRAME_BYTES 65536

// Interface ordinals -- matches the 24-01 generator's assignment exactly
// (native/steam-bridge/generated/steam_api_shim.c: ordinal 1 = SteamUser023,
// ordinal 2 = SteamFriends018; meta/sdk/*.manifest.json).
#define ORDINAL_FLAT 0
#define ORDINAL_USER 1
#define ORDINAL_FRIENDS 2

// SteamUser023 slots actually served this phase (meta/sdk/isteamuser.manifest.json)
#define USER_SLOT_BLOGGEDON 1
#define USER_SLOT_GETSTEAMID 2

// SteamFriends018 slots actually served this phase (meta/sdk/isteamfriends.manifest.json)
#define FRIENDS_SLOT_GETPERSONANAME 0

// Reserved CONTROL ordinal (review finding #7) -- never a real Steamworks
// interface, placed at the top of the uint16 range.
#define CONTROL_ORDINAL 0xffff
#define CONTROL_SLOT_HEALTH 0
#define CONTROL_SLOT_WHOAMI 1

#define STATUS_OK 0
#define STATUS_ERR 1

// WR-02: bounds how long a single recv() call will block waiting for more
// bytes of an in-progress frame. Generous relative to a legitimate
// request's real latency (pump_callbacks alone sleeps up to 150ms) so this
// never fires during normal operation, but bounded so a partial-send stall
// (crashed bottle mid-frame, wedged/malicious loopback peer) cannot freeze
// the shared helper -- and therefore every OTHER bridge game and readiness
// probe (WR-01's serialized accept loop makes an unbounded stall here
// especially costly) -- forever.
#define RECV_TIMEOUT_SECONDS 5

// === libsteam_api.dylib flat surface (dlsym'd once, held for process life) ===

typedef int         (*InitFlat_t)(char *);
typedef void        (*RunCallbacks_t)(void);
typedef void *      (*Accessor_t)(void);
typedef uint64_t    (*GetSteamID_t)(void *);
typedef int         (*BLoggedOn_t)(void *);
typedef const char *(*GetPersona_t)(void *);

static InitFlat_t     InitFlat;
static RunCallbacks_t RunCB;
static Accessor_t     GetUser, GetFriends;
static GetSteamID_t   GetSteamID;
static BLoggedOn_t    BLoggedOn;
static GetPersona_t   GetPersona;

static void *g_user = NULL, *g_friends = NULL;
// True once SteamAPI_InitFlat succeeded against a live session AND both
// interface accessors resolved to non-NULL -- gates CONTROL WHOAMI and the
// identity slots below. HEALTH is answerable regardless of this flag
// (finding #7 -- "process up" vs "init succeeded").
static int g_inited = 0;

// One dlopen'd handle for the process's entire lifetime (D-04) -- never a
// second dlopen of libsteam_api.dylib anywhere in this file.
static void *g_dylib_handle = NULL;

// Fixed-size argument buffer -- T-24-03: sized to MAX_FRAME_BYTES exactly,
// so an inbound frame's declared length is checked against this cap BEFORE
// any recv() into it; never allocated/resized based on attacker input.
static uint8_t g_argbuf[MAX_FRAME_BYTES];

static void logts(const char *cat, const char *msg) {
  char ts[32];
  time_t t = time(NULL);
  struct tm *g = gmtime(&t);
  strftime(ts, sizeof ts, "%Y-%m-%dT%H:%M:%SZ", g);
  fprintf(stderr, "[%s] %-6s %s\n", ts, cat, msg);
}

/*
 * T-24-SC: builds the canonical, OS/Steam-provided dylib path from $HOME --
 * never from attacker-supplied input, never a caller-provided override.
 */
static void resolve_dylib_path(char *out, size_t outSize) {
  const char *home = getenv("HOME");
  if (!home || home[0] == '\0') home = "/";
  snprintf(
    out, outSize,
    "%s/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/"
    "MacOS/Frameworks/Steam Helper.app/Contents/MacOS/libsteam_api.dylib",
    home
  );
}

/*
 * D-04: the helper carries ONE generic identity-only AppID (480/Spacewar)
 * for its whole life, resolved via a `steam_appid.txt` in the process's
 * working directory. Written here (idempotent, best-effort) so identity
 * resolution never silently fails with "No appID found" regardless of how
 * the helper is spawned -- the single init call below depends on this file
 * existing BEFORE it runs.
 */
static void ensure_steam_appid_file(void) {
  FILE *f = fopen("steam_appid.txt", "w");
  if (!f) {
    logts("WARN", "could not write steam_appid.txt in cwd (D-04 identity may fail to resolve)");
    return;
  }
  fputs("480", f);
  fclose(f);
}

/* Pumps a few Steamworks callback ticks before reading identity-bearing
 * accessors -- mirrors spike 005b's `whoami()` warm-up (RunCallbacks +
 * short sleep) so freshly-resolved account state has a chance to settle. */
static void pump_callbacks(void) {
  for (int i = 0; i < 3; i++) {
    RunCB();
    usleep(50 * 1000);
  }
}

/*
 * dlopen's the real libsteam_api.dylib EXACTLY ONCE and resolves every flat
 * symbol this helper needs. Returns 1 on success, 0 on a fatal dlopen/dlsym
 * failure (helper cannot run at all without these).
 */
static int load_steam_api(void) {
  char dylibPath[1024];
  resolve_dylib_path(dylibPath, sizeof dylibPath);

  g_dylib_handle = dlopen(dylibPath, RTLD_NOW | RTLD_LOCAL);
  if (!g_dylib_handle) {
    logts("FATAL", dlerror());
    return 0;
  }

  InitFlat   = (InitFlat_t)dlsym(g_dylib_handle, "SteamAPI_InitFlat");
  RunCB      = (RunCallbacks_t)dlsym(g_dylib_handle, "SteamAPI_RunCallbacks");
  GetUser    = (Accessor_t)dlsym(g_dylib_handle, "SteamAPI_SteamUser_v023");
  GetFriends = (Accessor_t)dlsym(g_dylib_handle, "SteamAPI_SteamFriends_v018");
  GetSteamID = (GetSteamID_t)dlsym(g_dylib_handle, "SteamAPI_ISteamUser_GetSteamID");
  BLoggedOn  = (BLoggedOn_t)dlsym(g_dylib_handle, "SteamAPI_ISteamUser_BLoggedOn");
  GetPersona = (GetPersona_t)dlsym(g_dylib_handle, "SteamAPI_ISteamFriends_GetPersonaName");

  if (!InitFlat || !RunCB || !GetUser || !GetFriends || !GetSteamID || !BLoggedOn || !GetPersona) {
    logts("FATAL", "dlsym failed -- libsteam_api.dylib is present but missing an expected export");
    return 0;
  }
  return 1;
}

/*
 * D-04: calls SteamAPI_InitFlat EXACTLY ONCE, with no AppID parameter (the
 * flat init contract). Structurally, this call -- and this call alone --
 * precedes the bind/listen/accept loop below; it is never retried, and
 * there is no re-init path anywhere else in this file.
 *
 * Deliberately does NOT exit() on failure (divergence from spike 005b):
 * the helper must keep serving CONTROL HEALTH even when Steam is not
 * running/signed in, so the 24-06 probe can observe "process up" separately
 * from "init succeeded" (finding #7). g_inited gates every identity-bearing
 * slot and CONTROL WHOAMI; HEALTH is unconditional.
 */
static void init_steam_api_once(void) {
  ensure_steam_appid_file();

  char err[1024] = {0};
  int r = InitFlat(err);
  // WR-04: only invoke the interface accessors once InitFlat itself
  // reports success. Calling GetUser()/GetFriends() when r != 0 (Steam
  // not running/signed in) is outside the documented Steamworks contract
  // -- if the real dylib dereferences not-yet-initialized internal global
  // state inside these accessors on a failed init, it can crash the
  // helper instead of returning NULL, defeating the "process up, no
  // session" HEALTH/WHOAMI split (finding #7) this whole init path exists
  // to preserve. g_user/g_friends stay NULL on init failure.
  if (r == 0) {
    g_user = GetUser();
    g_friends = GetFriends();
  }

  g_inited = (r == 0 && g_user != NULL && g_friends != NULL);
  if (!g_inited) {
    char msg[1200];
    snprintf(
      msg, sizeof msg,
      "InitFlat failed r=%d err=%s (is Steam running + signed in?) -- "
      "serving HEALTH only until a real session is live",
      r, err
    );
    logts("INIT", msg);
  } else {
    logts("INIT", "SteamAPI ready (single InitFlat call, identity AppID 480)");
  }
}

// === Persistent-connection framing I/O (blocking, one client at a time --
// matches spike 005b's single-threaded accept loop; R2's own acceptance bar
// only requires >=2 SEQUENTIAL requests, no concurrency this phase) ===

/* Reads exactly `len` bytes into `buf`, looping over short reads. Returns 1
 * on success, 0 on real EOF/error (caller must treat this as "close the
 * connection", never retry indefinitely). WR-05: a signal-interrupted
 * syscall (`errno == EINTR`) is recoverable and is retried, NOT treated as
 * EOF -- only `k == 0` (real EOF) or a non-EINTR error (including the
 * WR-02 SO_RCVTIMEO timeout, which surfaces as EAGAIN/EWOULDBLOCK and is
 * deliberately terminal here, not retried). */
static int recv_all(int fd, void *buf, size_t len) {
  uint8_t *p = (uint8_t *)buf;
  size_t got = 0;
  while (got < len) {
    ssize_t k = recv(fd, p + got, len - got, 0);
    if (k < 0) {
      if (errno == EINTR) continue;
      return 0;
    }
    if (k == 0) return 0; // real EOF
    got += (size_t)k;
  }
  return 1;
}

/* WR-05: same EINTR-retry discipline as recv_all -- an interrupted send()
 * is retried, not treated as a closed connection. WR-03: SIGPIPE is
 * ignored process-wide at startup (main()), so a send() to a peer that has
 * already closed its end returns -1/EPIPE here (handled like any other
 * terminal send error) instead of raising SIGPIPE and killing the shared
 * helper. */
static int send_all(int fd, const void *buf, size_t len) {
  const uint8_t *p = (const uint8_t *)buf;
  size_t sent = 0;
  while (sent < len) {
    ssize_t k = send(fd, p + sent, len - sent, 0);
    if (k < 0) {
      if (errno == EINTR) continue;
      return 0;
    }
    if (k == 0) return 0;
    sent += (size_t)k;
  }
  return 1;
}

/*
 * Sends one Pattern-3 response frame: [4B total_len][4B request_id][1B status][retBlob].
 */
static int send_response(int fd, uint32_t requestId, uint8_t status, const uint8_t *retBlob, uint32_t retLen) {
  uint32_t totalLen = RESPONSE_HEADER_BYTES + retLen;
  uint8_t header[LENGTH_FIELD_BYTES + RESPONSE_HEADER_BYTES];
  memcpy(header + 0, &totalLen, 4);
  memcpy(header + 4, &requestId, 4);
  header[8] = status;
  if (!send_all(fd, header, sizeof header)) return 0;
  if (retLen > 0 && !send_all(fd, retBlob, retLen)) return 0;
  return 1;
}

/*
 * Dispatches one decoded request to the correct identity method / CONTROL
 * handler and sends the response. Never re-initializes Steamworks -- reads
 * the already-resolved g_user/g_friends pointers + g_inited flag only.
 */
static void dispatch_and_respond(int fd, uint32_t requestId, uint16_t ordinal, uint16_t slot,
                                  const uint8_t *argBlob, uint32_t argLen) {
  (void)argBlob;
  (void)argLen;

  if (ordinal == CONTROL_ORDINAL) {
    if (slot == CONTROL_SLOT_HEALTH) {
      // Answerable pre-init / independent of init outcome -- "process up".
      send_response(fd, requestId, STATUS_OK, NULL, 0);
      return;
    }
    if (slot == CONTROL_SLOT_WHOAMI) {
      if (!g_inited) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0); // not-inited
        return;
      }
      pump_callbacks();
      uint64_t id = GetSteamID(g_user);
      uint8_t retbuf[8];
      memcpy(retbuf, &id, 8); // raw bytes, never parsed to a JS number
      send_response(fd, requestId, STATUS_OK, retbuf, 8);
      return;
    }
    send_response(fd, requestId, STATUS_ERR, NULL, 0); // unknown control slot
    return;
  }

  if (!g_inited) {
    // Every real interface call requires a live session (spike-proven --
    // no live Steam, no valid interface pointers to call through).
    send_response(fd, requestId, STATUS_ERR, NULL, 0);
    return;
  }

  if (ordinal == ORDINAL_USER) {
    if (slot == USER_SLOT_GETSTEAMID) {
      pump_callbacks();
      uint64_t id = GetSteamID(g_user);
      uint8_t retbuf[8];
      memcpy(retbuf, &id, 8);
      send_response(fd, requestId, STATUS_OK, retbuf, 8);
      return;
    }
    if (slot == USER_SLOT_BLOGGEDON) {
      int logged = BLoggedOn(g_user);
      uint8_t retbuf[4];
      memcpy(retbuf, &logged, 4);
      send_response(fd, requestId, STATUS_OK, retbuf, 4);
      return;
    }
    // Any other SteamUser023 slot is not served this phase (API/callback
    // breadth is a tracked follow-up, per 24-RESEARCH.md Pattern 1) --
    // answer a clean error rather than hanging or guessing.
    send_response(fd, requestId, STATUS_ERR, NULL, 0);
    return;
  }

  if (ordinal == ORDINAL_FRIENDS) {
    if (slot == FRIENDS_SLOT_GETPERSONANAME) {
      pump_callbacks();
      const char *persona = GetPersona(g_friends);
      if (!persona) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
        return;
      }
      uint32_t len = (uint32_t)strlen(persona);
      send_response(fd, requestId, STATUS_OK, (const uint8_t *)persona, len);
      return;
    }
    send_response(fd, requestId, STATUS_ERR, NULL, 0);
    return;
  }

  // ORDINAL_FLAT and any other ordinal: the flat SteamAPI_* surface is
  // marshaled client-side by the generated shim's own stubs (Plan 24-01);
  // this phase's helper does not serve flat-ordinal requests over the
  // wire. Answer a clean error rather than reading unbounded/hanging.
  send_response(fd, requestId, STATUS_ERR, NULL, 0);
}

/*
 * Serves one accepted connection in a persistent read loop -- decodes as
 * many sequential request frames as the peer sends, WITHOUT re-initializing
 * Steamworks between them (R2's own acceptance bar: >=2 sequential requests
 * over one persistent connection). Returns only when the peer disconnects
 * or sends a malformed frame (T-24-03 -- abort, never read unbounded).
 */
static void serve_connection(int fd) {
  for (;;) {
    uint8_t lenField[LENGTH_FIELD_BYTES];
    if (!recv_all(fd, lenField, sizeof lenField)) break; // peer closed / error

    uint32_t totalLen;
    memcpy(&totalLen, lenField, 4);

    // T-24-03: reject BEFORE reading the body, based on the declared length
    // alone -- never allocate/recv past the cap.
    if (totalLen > MAX_FRAME_BYTES) {
      logts("ABORT", "inbound frame declared length exceeds MAX_FRAME_BYTES -- closing connection (T-24-03)");
      break;
    }
    if (totalLen < REQUEST_HEADER_BYTES) {
      logts("ABORT", "inbound frame declared length shorter than the request header -- malformed, closing connection");
      break;
    }

    uint8_t reqHeader[REQUEST_ID_BYTES + ORDINAL_BYTES + SLOT_BYTES];
    if (!recv_all(fd, reqHeader, sizeof reqHeader)) break;

    uint32_t requestId;
    uint16_t ordinal, slot;
    memcpy(&requestId, reqHeader + 0, 4);
    memcpy(&ordinal, reqHeader + 4, 2);
    memcpy(&slot, reqHeader + 6, 2);

    uint32_t argLen = totalLen - REQUEST_HEADER_BYTES;
    // argLen <= MAX_FRAME_BYTES - REQUEST_HEADER_BYTES < MAX_FRAME_BYTES,
    // already bounds-checked above -- g_argbuf is sized to MAX_FRAME_BYTES,
    // so this recv can never write past the buffer.
    if (argLen > 0 && !recv_all(fd, g_argbuf, argLen)) break;

    dispatch_and_respond(fd, requestId, ordinal, slot, g_argbuf, argLen);
  }
  close(fd);
}

int main(void) {
  // WR-03: ignore SIGPIPE process-wide before any socket I/O happens. Its
  // default disposition terminates the process, and writing to a socket
  // whose peer has already closed (e.g. a bridge game/bottle exiting
  // mid-request) raises it on macOS -- without this, that single peer's
  // disconnect would kill the shared long-lived helper out from under
  // every OTHER in-flight bridge game. send_all() above already treats
  // the resulting EPIPE like any other terminal send error.
  signal(SIGPIPE, SIG_IGN);

  if (!load_steam_api()) return 2;
  init_steam_api_once();

  int s = socket(AF_INET, SOCK_STREAM, 0);
  if (s < 0) {
    logts("FATAL", "socket() failed");
    return 3;
  }
  int yes = 1;
  setsockopt(s, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof yes);

  struct sockaddr_in a = {0};
  a.sin_family = AF_INET;
  a.sin_port = htons(BRIDGE_PORT);
  // T-24-01: loopback-only bind, NEVER a routable/all-interfaces bind.
  a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);

  if (bind(s, (struct sockaddr *)&a, sizeof a) < 0) {
    logts("FATAL", "bind 127.0.0.1:54550 failed");
    return 4;
  }
  if (listen(s, 8) < 0) {
    logts("FATAL", "listen failed");
    return 5;
  }
  logts("LISTEN", "127.0.0.1:54550 (loopback-only, persistent-channel)");

  for (;;) {
    int c = accept(s, NULL, NULL);
    if (c < 0) continue;
    // WR-02: bound how long recv_all() will block on this connection
    // waiting for more bytes of an in-progress frame -- a partial-send
    // stall (crashed peer mid-frame) times out and closes the connection
    // (recv_all treats the resulting EAGAIN/EWOULDBLOCK as terminal, not
    // EINTR-retried) instead of wedging the whole shared, serially-served
    // helper indefinitely.
    struct timeval recvTimeout;
    recvTimeout.tv_sec = RECV_TIMEOUT_SECONDS;
    recvTimeout.tv_usec = 0;
    setsockopt(c, SOL_SOCKET, SO_RCVTIMEO, &recvTimeout, sizeof recvTimeout);
    serve_connection(c);
  }
}
