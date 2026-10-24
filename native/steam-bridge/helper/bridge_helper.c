/**
 * Phase 51 Plan 01 (D-51-01) -- the native arm64 host helper, now spawned
 * ONE PER BRIDGE LAUNCH, inited with the launching game's REAL AppID.
 *
 * Supersedes Phase 24 D-03 ("ONE shared, long-lived process, reused across
 * every bridge game") and D-04 ("single generic AppID 480/Spacewar,
 * resolved from a `steam_appid.txt` staged once next to the bundled
 * binary"). "One Steam login" still holds -- Mac Steam itself is still the
 * single signed-in client every helper's `dlopen`'d `libsteam_api.dylib`
 * talks to -- but "one helper" does not: every bridge launch now gets its
 * OWN helper process, told its appId over argv, writing its OWN
 * `steam_appid.txt` into its OWN per-appId working directory (set by the
 * spawning backend, `helperProcess.ts`'s per-appId staging dir under
 * `steamBridgeHelperStateDir`) BEFORE it ever calls `SteamAPI_InitFlat` --
 * so ISteamApps/ISteamUserStats/ISteamRemoteStorage (follow-on plans) and
 * Mac Steam's own In-Game/playtime tracking all see the game's real AppID,
 * never 480. D-51-03 (two bridge games running at once, no lock) falls
 * directly out of this: two appIds simply mean two independent processes
 * on two independent ports -- there is no shared state left to contend on.
 *
 * The OS assigns this helper's listening port (bind port 0, then
 * `getsockname()` to learn what it got) rather than a fixed, well-known
 * port -- there is no shared, predictable `BRIDGE_PORT` left anywhere in
 * this file. The port is announced on ONE stderr line
 * (`LISTEN 127.0.0.1:<port> appid=<id> mode=full` or `mode=identity-only`,
 * D-51-04 -- see Task 2 below) that the spawning backend parses to learn
 * it, and handed to the game's own regenerated shim via
 * `gamelib_bridge.cfg` (`bridgeConfig.ts`) -- the shim fails closed (no
 * fixed-port fallback) if that file is missing/malformed.
 *
 * Phase 51 Plan 10 (51-10): every non-CONTROL request is now dispatched
 * through a SINGLE generated table (`bridge_dispatch`,
 * native/steam-bridge/generated/bridge_dispatch.h, produced by
 * meta/gen_vtables.ts's `generateDispatchHeader()` from the SAME
 * meta/sdk manifests the shim is generated from) rather
 * than a hand-written per-interface, per-method dlsym block -- one manifest
 * now drives both ends of the wire. `--identity-only`/`--report-appid`
 * (D-51-04) put the helper into a mode where an app-scoped family
 * (SteamUserStats, SteamRemoteStorage) answers STATUS_ERR and
 * SteamUtils.GetAppID reports the launching game's real AppID instead of
 * calling through -- `bridge_dispatch_set_identity_only()`, called once at
 * startup from argv, below.
 *
 * Still ONE persistent `127.0.0.1` loopback-only connection per game
 * process, speaking the SAME binary frame defined in
 * `src/backend/storeManagers/steam/bridge/protocol.ts`
 * (24-RESEARCH.md Pattern 3) that the generated shim's own
 * `bridge_transact()` speaks (native/steam-bridge/generated/steam_api_shim.c).
 *
 * Wire frame (matches protocol.ts byte-for-byte):
 *   Request:  [4B LE total_len][4B LE request_id][2B LE ordinal][2B LE slot][N argBlob]
 *     total_len = byte count of request_id+ordinal+slot+argBlob (excludes itself)
 *   Response: [4B LE total_len][4B LE request_id][1B status][N retBlob]
 *     total_len = byte count of request_id+status+retBlob (excludes itself)
 *     status: 0=ok, 1=err/no-live-session (or not-inited, for CONTROL WHOAMI
 *     answered before init succeeds)
 *
 * CONTROL frame (Phase 24 review finding #7, extended D-51-01): a reserved
 * ordinal (0xFFFF) reconciles the human-readable PING/WHOAMI text handshake
 * into this binary protocol, now with a THIRD slot:
 *   - HEALTH (slot 0): answered immediately, BEFORE/independent of whether
 *     `SteamAPI_InitFlat` succeeded -- proves "process up". This is why
 *     dylib-load/init failure below does NOT exit() -- it degrades to
 *     serving HEALTH ok / WHOAMI not-inited rather than crashing the whole
 *     helper.
 *   - WHOAMI (slot 1): answered ok+real-SteamID64-bytes ONLY once InitFlat
 *     succeeded against the live signed-in Mac Steam -- proves "init
 *     succeeded against a live session".
 *   - HELLO (slot 2, D-51-01): answered STATUS_OK unconditionally (like
 *     HEALTH, independent of init outcome) the moment the regenerated
 *     shim's own `SteamAPI_Init()` connects -- proves "this is really a
 *     GameLib per-appId helper, not a stale/foreign listener on the port
 *     read out of gamelib_bridge.cfg". Logged once per connection, not once
 *     per request.
 *
 *   - CREATE_INTERFACE (slot 3, Phase 52 / ROADMAP Scope 1): argBlob is a
 *     4-byte LE length + interface-version bytes (e.g. "SteamClient017").
 *     Asks the genuine native client (SteamInternal_CreateInterface)
 *     whether it accepts that version; reply is a 4-byte LE int32 present
 *     flag. STATUS_ERR before InitFlat succeeds or on a malformed request.
 *     The helper never decides acceptance itself.
 *
 * T-51-01 (mitigate, carries forward T-24-01): binds INADDR_LOOPBACK only
 * -- never a routable/all-interfaces bind, per helper.
 * T-24-03 (mitigate): every inbound frame's declared length is bounds-
 * checked against MAX_FRAME_BYTES BEFORE any read of the body, into a
 * fixed-size (never attacker-sized) static buffer -- never allocates past
 * the cap.
 * T-24-SC (mitigate): the dylib path is built from $HOME (canonical,
 * OS/Steam-provided location), never from attacker-supplied input.
 * T-51-03 (mitigate): the helper re-validates its own `--appid` argument
 * (digits only, length <= 10) independently of whatever validation the
 * spawning backend already did -- never trusts argv blindly.
 *
 * Compiled by clang at packaging time (Plan 24-07/meta/buildSteamBridgeShims.ts),
 * not here.
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

// 51-10: the generated helper-side dispatch table -- bridge_dispatch_init,
// bridge_dispatch, bridge_dispatch_set_identity_only (see module doc).
// Produced by meta/gen_vtables.ts's generateDispatchHeader() from the SAME
// meta/sdk manifests native/steam-bridge/generated/
// steam_api_shim.c is generated from -- resolved via buildSteamBridgeShims.ts's
// `-I native/steam-bridge/generated` compile flag.
#include "bridge_dispatch.h"

// === Frame constants (MUST match src/backend/storeManagers/steam/bridge/protocol.ts) ===

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

// Reserved CONTROL ordinal (review finding #7) -- never a real Steamworks
// interface, placed at the top of the uint16 range.
#define CONTROL_ORDINAL 0xffff
#define CONTROL_SLOT_HEALTH 0
#define CONTROL_SLOT_WHOAMI 1
// D-51-01: the shim's own connect-time handshake slot (see module doc).
#define CONTROL_SLOT_HELLO 2
// Phase 52 (52-02): ask the native client whether it accepts an interface
// version (backs the shim's GameLibBridge_CreateInterface export).
#define CONTROL_SLOT_CREATE_INTERFACE 3
// D-53-07 (53-04): the shim reports a flat-API version it could not serve.
#define CONTROL_SLOT_REPORT_VERSION 4

#define STATUS_OK 0
#define STATUS_ERR 1

// WR-02: bounds how long a single recv() call will block waiting for more
// bytes of an in-progress frame. Generous relative to a legitimate
// request's real latency (pump_callbacks alone sleeps up to 150ms) so this
// never fires during normal operation, but bounded so a partial-send stall
// (crashed bottle mid-frame, wedged/malicious loopback peer) cannot freeze
// this helper -- and, now that a game's own process lifetime owns this
// helper's teardown (bottleProcessMonitor.ts), it never needs to wedge
// another game's bridge session either, since each appId already has its
// own helper -- forever.
#define RECV_TIMEOUT_SECONDS 5

// T-51-03: the longest digit-string this helper accepts as --appid. Real
// Steam AppIDs are well under this; it exists purely to reject nonsense
// input before it reaches anything else.
#define MAX_APPID_DIGITS 10

// === libsteam_api.dylib flat surface (dlsym'd once, held for process life) ===

typedef int         (*InitFlat_t)(char *);
typedef void        (*RunCallbacks_t)(void);

static InitFlat_t     InitFlat;
static RunCallbacks_t RunCB;

// Phase 52: NULL-tolerant -- a Steam build without this export degrades
// CREATE_INTERFACE to STATUS_ERR, never FATAL (T-52-10).
typedef void *(*SteamInternalCreateInterface_t)(const char *);
static SteamInternalCreateInterface_t g_SteamInternal_CreateInterface;

// True once SteamAPI_InitFlat succeeded against a live session -- gates
// CONTROL WHOAMI and every real interface dispatch. HEALTH (and HELLO) are
// answerable regardless of this flag (finding #7 -- "process up" vs "init
// succeeded"). 51-10: per-interface self/flat-function resolution now
// happens in bridge_dispatch_init() (bridge_dispatch.h), called below once
// InitFlat succeeds -- this flag no longer also encodes "every interface
// accessor resolved", since bridge_dispatch's own per-case NULL checks
// (T-51-23) already protect against a partial dylib-resolution failure.
static int g_inited = 0;

// One dlopen'd handle for this process's entire lifetime -- never a second
// dlopen of libsteam_api.dylib anywhere in this file.
static void *g_dylib_handle = NULL;

// D-51-01: this helper's own real AppID, as given on argv, for the HELLO
// log line and the process's self-description. Sized for MAX_APPID_DIGITS
// plus the NUL terminator.
static char g_appid[MAX_APPID_DIGITS + 1];

// Fixed-size argument buffer -- T-24-03: sized to MAX_FRAME_BYTES exactly,
// so an inbound frame's declared length is checked against this cap BEFORE
// any recv() into it; never allocated/resized based on attacker input.
static uint8_t g_argbuf[MAX_FRAME_BYTES];

// 51-10: the single scratch buffer every bridge_dispatch call encodes
// its response into -- bridge_dispatch itself never writes past
// BRIDGE_DISPATCH_RESP_SCRATCH_BYTES (bridge_dispatch.h, generated from
// the same constant gen_vtables.ts sizes it against), so this array can
// never be overrun regardless of which dispatch case ran.
static uint8_t g_dispatch_respbuf[BRIDGE_DISPATCH_RESP_SCRATCH_BYTES];

static void logts(const char *cat, const char *msg) {
  char ts[32];
  time_t t = time(NULL);
  struct tm *g = gmtime(&t);
  strftime(ts, sizeof ts, "%Y-%m-%dT%H:%M:%SZ", g);
  fprintf(stderr, "[%s] %-6s %s\n", ts, cat, msg);
}

/*
 * T-51-03: `--appid` must be 1-MAX_APPID_DIGITS ASCII digits and nothing
 * else -- re-validated here independently of whatever the spawning backend
 * (helperProcess.ts's own NUMERIC_APP_ID guard) already checked.
 */
static int is_valid_appid(const char *s) {
  size_t len = strlen(s);
  if (len == 0 || len > MAX_APPID_DIGITS) return 0;
  for (size_t i = 0; i < len; i++) {
    if (s[i] < '0' || s[i] > '9') return 0;
  }
  return 1;
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
 * D-51-01: writes THIS helper's own real AppID (never "480") into
 * `steam_appid.txt` in the process's working directory -- the spawning
 * backend sets that cwd to a per-appId staging directory
 * (`steamBridgeHelperStateDir/<appId>/`) specifically so two concurrently
 * running helpers (D-51-03) never race on this file. Idempotent,
 * best-effort: a write failure is logged, never fatal -- the single
 * `SteamAPI_InitFlat` call below still runs and simply resolves whatever
 * identity (or lack of one) the cwd happens to carry.
 */
static void ensure_steam_appid_file(const char *appId) {
  FILE *f = fopen("steam_appid.txt", "w");
  if (!f) {
    logts("WARN", "could not write steam_appid.txt in cwd (D-51-01 identity may fail to resolve)");
    return;
  }
  fputs(appId, f);
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
 * failure (Steam is not installed, or a Steam update changed an export this
 * helper relies on) -- the caller does NOT exit() on a 0 return (D-51-01
 * divergence from spike 005b, carried forward from 24-02): the helper must
 * keep serving CONTROL HEALTH/HELLO even when libsteam_api.dylib itself
 * could not be loaded at all.
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

  g_SteamInternal_CreateInterface =
      (SteamInternalCreateInterface_t)dlsym(g_dylib_handle, "SteamInternal_CreateInterface");
  if (!g_SteamInternal_CreateInterface) {
    logts("WARN", "SteamInternal_CreateInterface not exported -- CREATE_INTERFACE answers STATUS_ERR");
  }

  // 51-10: every per-interface accessor/flat-function dlsym now lives in
  // the generated bridge_dispatch_init() (bridge_dispatch.h), called from
  // init_steam_api_once() below once InitFlat succeeds -- NULL-tolerant by
  // design (T-51-23: a missing symbol there degrades that one dispatch
  // case to STATUS_ERR, never this whole helper).
  if (!InitFlat || !RunCB) {
    logts("FATAL", "dlsym failed -- libsteam_api.dylib is present but missing an expected export");
    return 0;
  }
  return 1;
}

/*
 * Calls SteamAPI_InitFlat EXACTLY ONCE, with no AppID parameter (the flat
 * init contract -- identity resolves from the `steam_appid.txt`
 * `ensure_steam_appid_file()` already wrote into this process's own cwd,
 * BEFORE this is called). Structurally, this call -- and this call alone
 * -- precedes the bind/listen/accept loop below; it is never retried, and
 * there is no re-init path anywhere else in this file.
 *
 * Only reached when `load_steam_api()` succeeded -- see main()'s
 * dylib-missing branch, which logs and skips this entirely rather than
 * calling it against unresolved function pointers.
 */
static void init_steam_api_once(const char *appId) {
  char err[1024] = {0};
  int r = InitFlat(err);
  g_inited = (r == 0);
  // WR-04/51-10: only resolve the generated dispatch table's per-interface
  // accessors/flat functions once InitFlat itself reports success --
  // calling an interface accessor before a live session exists is outside
  // the documented Steamworks contract (if the real dylib dereferences
  // not-yet-initialized internal global state inside an accessor, it can
  // crash the helper rather than returning NULL, defeating the "process
  // up, no session" HEALTH/WHOAMI split, finding #7). bridge_dispatch_init
  // is itself NULL-tolerant per symbol (see its own doc comment); a
  // partial resolution failure degrades the affected dispatch case to
  // STATUS_ERR, never this whole helper.
  if (g_inited) {
    bridge_dispatch_init(g_dylib_handle);
  }
  if (!g_inited) {
    char msg[1200];
    snprintf(
      msg, sizeof msg,
      "InitFlat failed r=%d err=%s appid=%s (is Steam running + signed in?) -- "
      "serving HEALTH/HELLO only until a real session is live",
      r, err, appId
    );
    logts("INIT", msg);
  } else {
    char msg[64];
    snprintf(msg, sizeof msg, "SteamAPI ready (single InitFlat call, real appid=%s)", appId);
    logts("INIT", msg);
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
 * terminal send error) instead of raising SIGPIPE and killing this
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

// T-52-09: bound to 128 chars and replace non-printable bytes so a
// game-controlled version string cannot inject log lines.
static uint8_t g_call_seen[BD_CALL_COUNT > 0 ? BD_CALL_COUNT : 1];

static void sanitize_ver(const char *in, char *out, size_t outSize) {
  size_t i = 0;
  for (; in[i] && i < 128 && i + 1 < outSize; i++) {
    unsigned char c = (unsigned char)in[i];
    out[i] = (c >= 0x20 && c <= 0x7e) ? (char)c : '?';
  }
  out[i] = '\0';
}

/*
 * Dispatches one decoded request to the correct CONTROL handler, or (every
 * other ordinal) through the single generated bridge_dispatch table
 * (51-10), and sends the response. Never re-initializes Steamworks --
 * reads the g_inited flag and bridge_dispatch's own already-resolved
 * self/flat pointers only. `helloLogged` is connection-scoped state (owned
 * by `serve_connection`'s stack frame) so the HELLO log line fires once
 * per connection, not once per request on that connection.
 */
static void dispatch_and_respond(int fd, uint32_t requestId, uint16_t ordinal, uint16_t slot,
                                  const uint8_t *argBlob, uint32_t argLen, int *helloLogged) {
  if (ordinal == CONTROL_ORDINAL) {
    if (slot == CONTROL_SLOT_HEALTH) {
      // Answerable pre-init / independent of init outcome -- "process up".
      send_response(fd, requestId, STATUS_OK, NULL, 0);
      return;
    }
    if (slot == CONTROL_SLOT_WHOAMI) {
      // 51-10: WHOAMI calls the generated dispatch table's resolved
      // SteamUser023.GetSteamID self/flat pointers DIRECTLY (never through
      // bridge_dispatch itself) -- this is the one hand-written CONTROL
      // feature that still needs a specific identity method, and keeping
      // it off bridge_dispatch keeps that function's only real call site
      // the one in the non-CONTROL branch below.
      if (!g_inited) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0); // not-inited
        return;
      }
      pump_callbacks();
      if (g_bd_flat_SteamUser023_GetSteamID == NULL || g_bd_self_steamuser023 == NULL) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
        return;
      }
      uint64_t id = g_bd_flat_SteamUser023_GetSteamID(g_bd_self_steamuser023);
      uint8_t retbuf[8];
      memcpy(retbuf, &id, 8); // raw bytes, never parsed to a JS number
      send_response(fd, requestId, STATUS_OK, retbuf, 8);
      return;
    }
    if (slot == CONTROL_SLOT_HELLO) {
      // D-51-01: answerable pre-init, like HEALTH -- proves "this is a
      // real GameLib per-appId helper", independent of whether Steam is
      // signed in yet.
      if (helloLogged && !*helloLogged) {
        char msg[64];
        snprintf(msg, sizeof msg, "shim attached appid=%s", g_appid);
        logts("HELLO", msg);
        *helloLogged = 1;
      }
      send_response(fd, requestId, STATUS_OK, NULL, 0);
      return;
    }
    if (slot == CONTROL_SLOT_CREATE_INTERFACE) {
      // T-52-07: bounds-check before any copy into the fixed buffer.
      if (argBlob == NULL || argLen < 4) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
        return;
      }
      uint32_t len;
      memcpy(&len, argBlob, 4);
      if (len == 0 || len > 4096 || (uint64_t)4 + len > argLen) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
        return;
      }
      char name[4097];
      memcpy(name, argBlob + 4, len);
      name[len] = '\0';
      char safe[132];
      sanitize_ver(name, safe, sizeof safe);
      char msg[256];
      if (!g_inited || g_SteamInternal_CreateInterface == NULL) {
        snprintf(msg, sizeof msg, "FWD CreateInterface ver=%s native=no-client", safe);
        logts("FWD", msg);
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
        return;
      }
      // T-52-08: every request asks the native client; no cache, no table.
      void *iface = g_SteamInternal_CreateInterface(name);
      int32_t present = iface != NULL ? 1 : 0;
      snprintf(msg, sizeof msg, "FWD CreateInterface ver=%s native=%s", safe,
               present ? "present" : "NULL");
      logts("FWD", msg);
      send_response(fd, requestId, STATUS_OK, (const uint8_t *)&present, 4);
      return;
    }
    if (slot == CONTROL_SLOT_REPORT_VERSION) {
      // D-53-07: answerable pre-init. T-53-22: bounds-check (0 < len <= 128,
      // 4 + len <= argLen) before the copy into the fixed buffer. T-53-23:
      // sanitized before logging. Bounded by the shim's 16-report cap (T-53-25).
      if (argBlob == NULL || argLen < 4) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
        return;
      }
      uint32_t vlen;
      memcpy(&vlen, argBlob, 4);
      if (vlen == 0 || vlen > 128 || (uint64_t)4 + vlen > argLen) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
        return;
      }
      char ver[129];
      memcpy(ver, argBlob + 4, vlen);
      ver[vlen] = '\0';
      char vsafe[132];
      sanitize_ver(ver, vsafe, sizeof vsafe);
      char vmsg[192];
      snprintf(vmsg, sizeof vmsg, "flat lookup ver=%s served=no", vsafe);
      logts("NOVER", vmsg);
      send_response(fd, requestId, STATUS_OK, NULL, 0);
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

  // 51-10: every real (non-CONTROL) interface call is served by the single
  // generated dispatch table -- unknown (ordinal, slot), an unresolved
  // symbol, and every param-bounds check all live in bridge_dispatch
  // itself (bridge_dispatch.h), generated from the SAME manifests the
  // shim's own stubs are generated from.
  // D-53-13: CALL trace. Game-originated by construction (only the shim sends
  // wire requests; the helper's own init is not a request). Name only, no
  // arguments or returns; once per method per process, bounded by BD_CALL_COUNT.
  int ci = bd_call_index(ordinal, slot);
  if (ci >= 0 && !g_call_seen[ci]) {
    g_call_seen[ci] = 1;
    logts("CALL", bd_call_name(ci));
  }
  uint32_t respLen = 0;
  uint8_t status = bridge_dispatch(ordinal, slot, argBlob, argLen,
                                    g_dispatch_respbuf, sizeof(g_dispatch_respbuf), &respLen);
  send_response(fd, requestId, status, g_dispatch_respbuf, respLen);
}

/*
 * Serves one accepted connection in a persistent read loop -- decodes as
 * many sequential request frames as the peer sends, WITHOUT re-initializing
 * Steamworks between them (R2's own acceptance bar: >=2 sequential requests
 * over one persistent connection). Returns only when the peer disconnects
 * or sends a malformed frame (T-24-03 -- abort, never read unbounded).
 */
static void serve_connection(int fd) {
  int helloLogged = 0;
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

    dispatch_and_respond(fd, requestId, ordinal, slot, g_argbuf, argLen, &helloLogged);
  }
  close(fd);
}

int main(int argc, char **argv) {
  // WR-03: ignore SIGPIPE process-wide before any socket I/O happens. Its
  // default disposition terminates the process, and writing to a socket
  // whose peer has already closed (e.g. the bridge game exiting
  // mid-request) raises it on macOS -- without this, a disconnect would
  // kill this helper.  send_all() above already treats the resulting
  // EPIPE like any other terminal send error.
  signal(SIGPIPE, SIG_IGN);

  const char *appIdArg = NULL;
  const char *reportAppIdArg = NULL;
  long portArg = 0;
  int identityOnly = 0;
  for (int i = 1; i < argc; i++) {
    if (strcmp(argv[i], "--appid") == 0 && i + 1 < argc) {
      appIdArg = argv[++i];
    } else if (strcmp(argv[i], "--port") == 0 && i + 1 < argc) {
      portArg = strtol(argv[++i], NULL, 10);
    } else if (strcmp(argv[i], "--identity-only") == 0) {
      // D-51-04: real-AppID init failed upstream (Steam refused the AppID,
      // family-shared title, licence check) -- the backend falls back to
      // launching with this helper in identity-only mode rather than
      // refusing the game outright. No value: a bare flag.
      identityOnly = 1;
    } else if (strcmp(argv[i], "--report-appid") == 0 && i + 1 < argc) {
      // D-51-04: the LAUNCHING game's real AppID (never 480) -- what
      // SteamUtils.GetAppID reports back in identity-only mode, even
      // though --appid/steam_appid.txt itself stays 480 so the real
      // AppID-scoped interfaces never see it.
      reportAppIdArg = argv[++i];
    }
  }

  // T-51-03: reject before anything else runs -- no socket, no dylib load,
  // no file write happens on a missing/invalid --appid.
  if (!appIdArg || !is_valid_appid(appIdArg)) {
    logts("FATAL", "missing or invalid --appid (required: 1-10 ASCII digits)");
    return 6;
  }
  if (portArg < 0 || portArg > 65535) {
    logts("FATAL", "invalid --port (must be 0-65535; 0 = OS-assigned ephemeral)");
    return 6;
  }
  // T-51-03 (same re-validation discipline as --appid): a malformed
  // --report-appid is rejected here, independently of whatever the
  // spawning backend already validated.
  if (reportAppIdArg && !is_valid_appid(reportAppIdArg)) {
    logts("FATAL", "invalid --report-appid (required: 1-10 ASCII digits)");
    return 6;
  }

  strncpy(g_appid, appIdArg, MAX_APPID_DIGITS);
  g_appid[MAX_APPID_DIGITS] = '\0';

  bridge_dispatch_set_identity_only(
    identityOnly, reportAppIdArg ? (uint32_t)strtoul(reportAppIdArg, NULL, 10) : 0
  );

  // D-51-01: write THIS helper's own real AppID BEFORE binding/listening,
  // so the identity file is already correct the moment anything could
  // possibly connect.
  ensure_steam_appid_file(appIdArg);

  int s = socket(AF_INET, SOCK_STREAM, 0);
  if (s < 0) {
    logts("FATAL", "socket() failed");
    return 3;
  }
  int yes = 1;
  setsockopt(s, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof yes);

  struct sockaddr_in a = {0};
  a.sin_family = AF_INET;
  a.sin_port = htons((uint16_t)portArg);
  // T-51-01 (carries forward T-24-01): loopback-only bind, NEVER a
  // routable/all-interfaces bind -- per helper, every time.
  a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);

  if (bind(s, (struct sockaddr *)&a, sizeof a) < 0) {
    logts("FATAL", "bind 127.0.0.1 failed");
    return 4;
  }

  // D-51-01: when the caller asked for port 0 (the normal case --
  // helperProcess.ts always passes --port 0), learn whichever ephemeral
  // port the OS actually assigned. There is no fixed, guessable port left
  // in this file at all.
  uint16_t actualPort = (uint16_t)portArg;
  if (portArg == 0) {
    struct sockaddr_in bound = {0};
    socklen_t boundLen = sizeof bound;
    if (getsockname(s, (struct sockaddr *)&bound, &boundLen) == 0) {
      actualPort = ntohs(bound.sin_port);
    } else {
      logts("FATAL", "getsockname() failed after binding an ephemeral port");
      return 4;
    }
  }

  if (listen(s, 8) < 0) {
    logts("FATAL", "listen failed");
    return 5;
  }

  char listenMsg[160];
  snprintf(
    listenMsg, sizeof listenMsg,
    "127.0.0.1:%u appid=%s mode=%s", (unsigned)actualPort, g_appid,
    identityOnly ? "identity-only" : "full"
  );
  logts("LISTEN", listenMsg);

  // D-51-01: a missing/unloadable dylib (Steam not installed) is no longer
  // fatal -- the helper keeps serving CONTROL HEALTH/HELLO so the backend's
  // readiness probe gets a meaningful "not-inited" rather than the process
  // simply never existing.
  if (load_steam_api()) {
    init_steam_api_once(g_appid);
  } else {
    logts("INIT", "dylib-missing -- g_inited stays 0, serving HEALTH/HELLO only");
  }

  for (;;) {
    int c = accept(s, NULL, NULL);
    if (c < 0) continue;
    // WR-02: bound how long recv_all() will block on this connection
    // waiting for more bytes of an in-progress frame -- a partial-send
    // stall (crashed peer mid-frame) times out and closes the connection
    // (recv_all treats the resulting EAGAIN/EWOULDBLOCK as terminal, not
    // EINTR-retried) instead of wedging this helper indefinitely.
    struct timeval recvTimeout;
    recvTimeout.tv_sec = RECV_TIMEOUT_SECONDS;
    recvTimeout.tv_usec = 0;
    setsockopt(c, SOL_SOCKET, SO_RCVTIMEO, &recvTimeout, sizeof recvTimeout);
    serve_connection(c);
  }
}
