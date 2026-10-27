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
 *   - HEALTH (slot 0): answered independent of whether `SteamAPI_InitFlat`
 *     succeeded, but only once the accept loop runs, i.e. after init has RUN
 *     (single-threaded; see the READY line in main()) -- proves "process up
 *     and serving". This is why
 *     dylib-load/init failure below does NOT exit() -- it degrades to
 *     serving HEALTH ok / WHOAMI not-inited rather than crashing the whole
 *     helper.
 *   - WHOAMI (slot 1): answered ok+real-SteamID64-bytes ONLY once InitFlat
 *     succeeded against the live signed-in Mac Steam -- proves "init
 *     succeeded against a live session".
 *   - HELLO (slot 2, D-51-01; WR-03): the connection handshake. The arg
 *     blob is the 64 ASCII-hex per-launch secret, optionally followed by ONE
 *     role byte (HELLO_ROLE_PROBE = the backend readiness probe). A
 *     constant-time match against the secret this process got from env marks
 *     the connection authenticated and answers STATUS_OK; a mismatch (or no
 *     secret in env) answers STATUS_ERR and de-authenticates the connection.
 *     "shim attached" is logged once per connection, only for a matching
 *     HELLO with NO role byte (the probe never manufactures that evidence).
 *
 * AUTHENTICATION (Phase 55 WR-03): the loopback listener is reachable by any
 * local user, and the callback ring can hold a Steam web-API auth ticket.
 * HEALTH and HELLO are the ONLY slots served on an unauthenticated
 * connection. WHOAMI, CREATE_INTERFACE, REPORT_VERSION, REPORT_INIT,
 * REPORT_NULL_SRET, DRAIN and
 * every interface ordinal answer STATUS_ERR (empty ret, connection kept
 * open) until a matching HELLO. The ring is bound to the launch secret, NOT to
 * a socket: it is never cleared on accept or close, because the shim
 * reconnects routinely (idle SO_RCVTIMEO close, WR-02 oversize drop) and the
 * next, re-authenticating connection is almost always the same game waiting
 * for its ticket. Threat model: other OS users and processes that cannot read
 * this user's files are in scope; a same-user attacker can read
 * gamelib_bridge.cfg and the stored Steam refresh token and is out of scope.
 * No env secret -> fail closed (every authenticated slot refused).
 *
 *   - REPORT_INIT (slot 5, D-53-15): argBlob is {u32 fn, i32 ret}, the GAME's
 *     own SteamAPI_Init result as reported by the shim. Answered regardless of g_inited (authenticated connections only, WR-03);
 *     logged as `GINIT` (fn name from a closed table, ints only, max 8).
 *     GINIT is written only from this wire handler: this helper's own
 *     in-process InitFlat logs under `INIT`, so it can never emit GINIT.
 *
 *   - REPORT_NULL_SRET (slot 7, quick 261027-ijs): argBlob is
 *     {u32 slot, u32 structSize, u32 vlen, vlen bytes of version}, sent by the
 *     shim the first time the GAME calls a per-version x64 sret null-object
 *     slot. Authenticated only; logged as `NULLSRET <ver> slot=<n> size=<n>`
 *     (version sanitised, max 64 lines). NULLSRET is written only from this
 *     wire handler, which only the in-game shim drives.
 *
 *   - REPORT_STUB_CALL (slot 8, quick 261027-jgs): argBlob is
 *     {u32 kind, u32 slot, u32 vlen, u32 mlen, vlen bytes version, mlen bytes
 *     method} (no NULs), sent by the shim the first time the GAME calls a
 *     method the shim answers locally. kind: 0 stub, 1 fallback, 2 offpath,
 *     3 null (x64 null-object slot; method empty). Authenticated only; logged
 *     as `STUBCALL <ver>.<method> slot=<n> kind=<k>` (`<ver> slot=<n> kind=null`
 *     for kind 3), version and method sanitised, max 256 lines plus one cap
 *     line. STUBCALL is written only from this wire handler, which only the
 *     in-game shim drives.
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
#include <stdarg.h>
#include <stdbool.h>
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
// Phase 55: bounded allowlisted callback ring. A quoted include resolves
// beside this file, so no extra -I flag is needed.
#include "gamelib_cbqueue.h"

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
// D-53-15 (quick 261025-kax): the shim reports the GAME's own SteamAPI_Init
// result as {u32 fn, i32 ret}; logged under the GINIT category. GINIT is
// emitted ONLY from this wire handler, so this helper's own in-process
// SteamAPI_InitFlat (logged as INIT) can never produce one.
#define CONTROL_SLOT_REPORT_INIT 5
// Phase 55: the shim drains queued Steam callbacks (only 168 today) from RunCallbacks; pull-only, one message per round trip.
#define CONTROL_SLOT_DRAIN_CALLBACKS 6
// quick 261027-ijs: the shim reports the first call of each per-version x64 sret null-object slot, logged as NULLSRET.
#define CONTROL_SLOT_REPORT_NULL_SRET 7
// quick 261027-jgs: the shim reports the first call of each locally-answered method or x64 null-object slot, logged as STUBCALL.
#define CONTROL_SLOT_REPORT_STUB_CALL 8

#define STATUS_OK 0
#define STATUS_ERR 1

// WR-03: per-launch secret (backend -> env). Matches protocol.ts's
// BRIDGE_SECRET_ENV / BRIDGE_SECRET_HEX_LEN / HELLO_ROLE_PROBE exactly.
#define BRIDGE_SECRET_ENV "GAMELIB_BRIDGE_SECRET"
#define BRIDGE_SECRET_HEX_LEN 64
#define HELLO_ROLE_PROBE 0x01
// At most this many `AUTH refused` log lines per process (hostile-client flood cap).
#define AUTH_REFUSED_LOG_MAX 16

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

// Phase 55: Steamworks manual-dispatch flat API. Once ManualDispatch_Init has
// run, SteamAPI_RunCallbacks must never be called (SDK contract).
typedef void    (*MDInit_t)(void);
typedef void    (*MDRunFrame_t)(int32_t);
typedef bool    (*MDGetNext_t)(int32_t, gl_CallbackMsg_t *);
typedef void    (*MDFreeLast_t)(int32_t);
typedef int32_t (*GetHSteamPipe_t)(void);

static MDInit_t        g_md_init;
static MDRunFrame_t    g_md_run_frame;
static MDGetNext_t     g_md_get_next;
static MDFreeLast_t    g_md_free_last;
static GetHSteamPipe_t g_get_hsteampipe;
static int             g_manual_dispatch = 0;
static int32_t         g_hpipe = 0;
static gl_cbq_ring     g_cbq;
static unsigned        g_cbq_logged = 0;

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
static void gl_manual_pump_into_ring(void);

static void pump_callbacks(void) {
  // RunCB is never called once ManualDispatch_Init ran (SDK contract,
  // RESEARCH Pitfall 6); the manual pump feeds the ring so a 168 arriving
  // during WHOAMI's warm-up is queued, not swallowed.
  for (int i = 0; i < 3; i++) {
    if (g_manual_dispatch) {
      gl_manual_pump_into_ring();
    } else {
      RunCB();
    }
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
  g_md_init        = (MDInit_t)dlsym(g_dylib_handle, "SteamAPI_ManualDispatch_Init");
  g_md_run_frame   = (MDRunFrame_t)dlsym(g_dylib_handle, "SteamAPI_ManualDispatch_RunFrame");
  g_md_get_next    = (MDGetNext_t)dlsym(g_dylib_handle, "SteamAPI_ManualDispatch_GetNextCallback");
  g_md_free_last   = (MDFreeLast_t)dlsym(g_dylib_handle, "SteamAPI_ManualDispatch_FreeLastCallback");
  g_get_hsteampipe = (GetHSteamPipe_t)dlsym(g_dylib_handle, "SteamAPI_GetHSteamPipe");
  if (!g_md_init || !g_md_run_frame || !g_md_get_next || !g_md_free_last || !g_get_hsteampipe) {
    logts("WARN", "manual dispatch exports missing -- DRAIN answers count 0");
  }

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
 * -- runs after bind/listen and the LISTEN line, and before the accept loop
 * below; it is never retried, and
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
    if (g_md_init && g_md_run_frame && g_md_get_next && g_md_free_last && g_get_hsteampipe) {
      g_md_init();
      g_hpipe = g_get_hsteampipe();
      g_manual_dispatch = (g_hpipe != 0);
    }
    logts("INIT", g_manual_dispatch ? "manual dispatch ready" : "manual dispatch unavailable");
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

// printf-style logts for the CBQ category: the format string is a literal at
// every call site so integer-only logging is auditable (T-55-08).
static void logts_f(const char *cat, const char *fmt, ...) {
  char msg[160];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(msg, sizeof msg, fmt, ap);
  va_end(ap);
  logts(cat, msg);
}

/* Runs one manual-dispatch frame and moves allowlisted callbacks into the
 * ring. Bounded to GL_CBQ_PUMP_MAX_MSGS messages. FreeLastCallback is ALWAYS
 * called after a true GetNextCallback (SDK contract). Never logs or copies
 * callback bytes anywhere but the ring. */
static void gl_manual_pump_into_ring(void) {
  if (!g_manual_dispatch) return;
  g_md_run_frame(g_hpipe);
  for (int i = 0; i < GL_CBQ_PUMP_MAX_MSGS; i++) {
    gl_CallbackMsg_t msg;
    memset(&msg, 0, sizeof msg);
    if (!g_md_get_next(g_hpipe, &msg)) break;
    int allowed = gl_cbq_allowed_size(msg.m_iCallback) != 0;
    int queued = gl_cbq_offer(&g_cbq, msg.m_iCallback, msg.m_pubParam, msg.m_cubParam);
    if (g_cbq_logged < 32) {
      if (queued) {
        int32_t eresult = 0;
        memcpy(&eresult, msg.m_pubParam + 4, 4);
        g_cbq_logged++;
        logts_f("CBQ", "queued iCallback=%d result=%d cub=%d",
                (int)msg.m_iCallback, (int)eresult, (int)msg.m_cubParam);
      } else if (allowed) {
        g_cbq_logged++;
        logts_f("CBQ", "dropped iCallback=%d cub=%d",
                (int)msg.m_iCallback, (int)msg.m_cubParam);
      }
    }
    g_md_free_last(g_hpipe);
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

// D-53-13 / 53-13 WR-04: once-per-method CALL latch, set only on a successful dispatch.
static uint8_t g_call_seen[BD_CALL_COUNT > 0 ? BD_CALL_COUNT : 1];

// 53-13 WR-06: helper-side cap; the shim's 16-report cap (T-53-25) is not a trust boundary.
static unsigned g_nover_logged = 0;

// WR-03: the launch secret, copied from env at startup (then unsetenv'd).
static char g_secret[BRIDGE_SECRET_HEX_LEN];
static int g_secret_set = 0;
static unsigned g_auth_refused_logged = 0;

// Constant-time equality over exactly n bytes (no early exit). The length of
// the candidate is public and is checked by the caller first.
static int ct_equal(const uint8_t *a, const uint8_t *b, size_t n) {
  volatile uint8_t acc = 0;
  for (size_t i = 0; i < n; i++) acc |= (uint8_t)(a[i] ^ b[i]);
  return acc == 0;
}

// Capped refusal log: one line per refused frame, at most
// AUTH_REFUSED_LOG_MAX per process. Never prints any frame bytes.
static void log_auth_refused(uint16_t ordinal, uint16_t slot) {
  if (g_auth_refused_logged >= AUTH_REFUSED_LOG_MAX) return;
  g_auth_refused_logged++;
  logts_f("AUTH", "refused unauthenticated frame ordinal=%u slot=%u secret=%s",
          (unsigned)ordinal, (unsigned)slot, g_secret_set ? "required" : "unset");
}
// D-53-15 (T-kax-04): cap on GINIT lines per process.
static unsigned g_ginit_logged = 0;
// quick 261027-ijs (T-ijs-03): cap on NULLSRET lines per process. 189 sites
// exist, the shim is one-shot per site, and a game touches only a handful.
#define NULLSRET_LOG_MAX 64
static unsigned g_nullsret_logged = 0;
// quick 261027-jgs (T-jgs-03): cap on STUBCALL lines per process. About 2000
// manifest stub sites exist and the shim is one-shot per site, but ELEX alone
// stubs 16 interfaces, so the cap is higher than NULLSRET's.
#define STUBCALL_LOG_MAX 256
static unsigned g_stubcall_logged = 0;
static int g_stubcall_cap_noted = 0;
static const char *const k_stubcall_kind[4] = {"stub", "fallback", "offpath", "null"};

// T-52-09: bound to 128 chars and replace non-printable bytes so a
// game-controlled version string cannot inject log lines.

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
                                  const uint8_t *argBlob, uint32_t argLen, int *helloLogged,
                                  int *authenticated) {
  if (ordinal == CONTROL_ORDINAL) {
    if (slot == CONTROL_SLOT_HELLO) {
      // WR-03: HELLO is the authentication step. Match = 64 hex bytes, plus
      // optionally the single probe role byte, equal to the env secret.
      int matched = g_secret_set && argBlob != NULL &&
                    (argLen == BRIDGE_SECRET_HEX_LEN ||
                     (argLen == BRIDGE_SECRET_HEX_LEN + 1 && argBlob[BRIDGE_SECRET_HEX_LEN] == HELLO_ROLE_PROBE)) &&
                    ct_equal(argBlob, (const uint8_t *)g_secret, BRIDGE_SECRET_HEX_LEN);
      if (!matched) {
        // Fail closed: even a previously-authenticated socket is demoted.
        *authenticated = 0;
        log_auth_refused(ordinal, slot);
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
        return;
      }
      *authenticated = 1;
      // D-51-01: answered regardless of g_inited, like HEALTH. The role byte
      // (backend probe) suppresses the "shim attached" evidence line.
      if (helloLogged && !*helloLogged && argLen == BRIDGE_SECRET_HEX_LEN) {
        char msg[64];
        snprintf(msg, sizeof msg, "shim attached appid=%s", g_appid);
        logts("HELLO", msg);
        *helloLogged = 1;
      }
      send_response(fd, requestId, STATUS_OK, NULL, 0);
      return;
    }
    if (slot == CONTROL_SLOT_HEALTH) {
      // Answered regardless of g_inited / init outcome -- "process up".
      send_response(fd, requestId, STATUS_OK, NULL, 0);
      return;
    }
    if (!*authenticated) {
      // WR-03: every CONTROL slot other than HEALTH/HELLO needs an
      // authenticated connection. Return BEFORE touching the ring, logging
      // fwd/version/init lines, or pumping callbacks.
      log_auth_refused(ordinal, slot);
      send_response(fd, requestId, STATUS_ERR, NULL, 0);
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
      if (g_nover_logged >= 16) {
        send_response(fd, requestId, STATUS_OK, NULL, 0);
        return;
      }
      g_nover_logged++;
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
    if (slot == CONTROL_SLOT_REPORT_INIT) {
      // D-53-15: answered regardless of g_inited (like HELLO). T-kax-01: bounds-check before
      // the copy, closed code table, only table strings and %d reach the log.
      static const char *const k_init_names[4] = {
          "SteamAPI_Init", "SteamInternal_SteamAPI_Init", "SteamAPI_InitSafe",
          "SteamAPI_InitFlat"};
      if (argBlob == NULL || argLen < 8) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
        return;
      }
      uint32_t code;
      int32_t ret;
      memcpy(&code, argBlob, 4);
      memcpy(&ret, argBlob + 4, 4);
      if (code >= 4) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
        return;
      }
      if (g_ginit_logged >= 8) {
        send_response(fd, requestId, STATUS_OK, NULL, 0);
        return;
      }
      g_ginit_logged++;
      // Codes 0/2 are bool APIs (ok = nonzero); 1/3 return ESteamAPIInitResult
      // (ok = 0).
      int ok = (code == 0 || code == 2) ? (ret != 0) : (ret == 0);
      char imsg[160];
      snprintf(imsg, sizeof imsg, "fn=%s ret=%d ok=%d session=%d",
               k_init_names[code], (int)ret, ok, g_inited ? 1 : 0);
      logts("GINIT", imsg);
      send_response(fd, requestId, STATUS_OK, NULL, 0);
      return;
    }
    if (slot == CONTROL_SLOT_REPORT_NULL_SRET) {
      // quick 261027-ijs: answered regardless of g_inited (null objects are
      // handed out exactly when Steam did not serve a version). T-ijs-01:
      // every bound is checked before the copy into the fixed buffer.
      // T-ijs-02: sanitized before logging. Never pumps or dispatches.
      if (argBlob == NULL || argLen < 12) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
        return;
      }
      uint32_t nslot, nsize, nvlen;
      memcpy(&nslot, argBlob, 4);
      memcpy(&nsize, argBlob + 4, 4);
      memcpy(&nvlen, argBlob + 8, 4);
      if (nslot >= 256 || nsize == 0 || nsize > 4096 || nvlen == 0 ||
          nvlen > 128 || (uint64_t)12 + nvlen > argLen) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
        return;
      }
      if (g_nullsret_logged >= NULLSRET_LOG_MAX) {
        send_response(fd, requestId, STATUS_OK, NULL, 0);
        return;
      }
      g_nullsret_logged++;
      char nver[129];
      memcpy(nver, argBlob + 12, nvlen);
      nver[nvlen] = '\0';
      char nsafe[132];
      sanitize_ver(nver, nsafe, sizeof nsafe);
      char nmsg[192];
      snprintf(nmsg, sizeof nmsg, "%s slot=%u size=%u", nsafe, (unsigned)nslot,
               (unsigned)nsize);
      logts("NULLSRET", nmsg);
      send_response(fd, requestId, STATUS_OK, NULL, 0);
      return;
    }
    if (slot == CONTROL_SLOT_REPORT_STUB_CALL) {
      // quick 261027-jgs: answered regardless of g_inited; behind the auth
      // gate. T-jgs-01: every bound is checked before any copy into the fixed
      // buffers. T-jgs-02: version and method sanitised. Never pumps or
      // dispatches.
      if (argBlob == NULL || argLen < 16) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
        return;
      }
      uint32_t skind, sslot, svlen, smlen;
      memcpy(&skind, argBlob, 4);
      memcpy(&sslot, argBlob + 4, 4);
      memcpy(&svlen, argBlob + 8, 4);
      memcpy(&smlen, argBlob + 12, 4);
      if (skind >= 4 || sslot >= 256 || svlen == 0 || svlen > 128 ||
          smlen > 128 || (uint64_t)16 + svlen + smlen > argLen ||
          (skind == 3) != (smlen == 0)) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
        return;
      }
      if (g_stubcall_logged >= STUBCALL_LOG_MAX) {
        if (!g_stubcall_cap_noted) {
          g_stubcall_cap_noted = 1;
          logts("STUBCALL", "cap of 256 reached; later first calls are not logged");
        }
        send_response(fd, requestId, STATUS_OK, NULL, 0);
        return;
      }
      g_stubcall_logged++;
      char sver[129], smeth[129];
      memcpy(sver, argBlob + 16, svlen);
      sver[svlen] = '\0';
      memcpy(smeth, argBlob + 16 + svlen, smlen);
      smeth[smlen] = '\0';
      char sverSafe[132], smethSafe[132];
      sanitize_ver(sver, sverSafe, sizeof sverSafe);
      sanitize_ver(smeth, smethSafe, sizeof smethSafe);
      char smsg[320];
      if (skind == 3) {
        snprintf(smsg, sizeof smsg, "%s slot=%u kind=%s", sverSafe,
                 (unsigned)sslot, k_stubcall_kind[skind]);
      } else {
        snprintf(smsg, sizeof smsg, "%s.%s slot=%u kind=%s", sverSafe,
                 smethSafe, (unsigned)sslot, k_stubcall_kind[skind]);
      }
      logts("STUBCALL", smsg);
      send_response(fd, requestId, STATUS_OK, NULL, 0);
      return;
    }
    if (slot == CONTROL_SLOT_DRAIN_CALLBACKS) {
      // Phase 55: answered regardless of g_inited, like HEALTH. Never sleeps (the shim
      // blocks in recv with no timeout while holding g_bridge_lock) and never
      // logs bytes. At most one queued message per round trip.
      if (argLen != 0) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
        return;
      }
      uint8_t out[GL_CBQ_DRAIN_RESP_MAX_BYTES];
      uint32_t n;
      if (g_inited && g_manual_dispatch) {
        gl_manual_pump_into_ring();
        n = gl_cbq_pop_encode(&g_cbq, out, sizeof out);
      } else {
        uint32_t zero = 0;
        memcpy(out, &zero, 4);
        n = 4;
      }
      if (n == 0) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
      } else {
        send_response(fd, requestId, STATUS_OK, out, n);
      }
      gl_cbq_secure_zero(out, sizeof out);
      return;
    }
    send_response(fd, requestId, STATUS_ERR, NULL, 0); // unknown control slot
    return;
  }

  if (!*authenticated) {
    // WR-03: interface dispatch requires an authenticated connection.
    log_auth_refused(ordinal, slot);
    send_response(fd, requestId, STATUS_ERR, NULL, 0);
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
  // D-53-13 / 53-13 WR-04: CALL trace. Post-dispatch and success-only: a call
  // that failed bounds checks or hit an unresolved symbol is never evidence.
  // Game-originated by construction (only the shim sends wire requests; the
  // helper's own init is not a request). Name only, no arguments or returns;
  // once per method per process, bounded by BD_CALL_COUNT.
  int ci = bd_call_index(ordinal, slot);
  uint32_t respLen = 0;
  uint8_t status = bridge_dispatch(ordinal, slot, argBlob, argLen,
                                    g_dispatch_respbuf, sizeof(g_dispatch_respbuf), &respLen);
  if (status == STATUS_OK && ci >= 0 && !g_call_seen[ci]) {
    g_call_seen[ci] = 1;
    logts("CALL", bd_call_name(ci));
  }
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
  int authenticated = 0; // WR-03: per-connection, set only by a matching HELLO
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

    dispatch_and_respond(fd, requestId, ordinal, slot, g_argbuf, argLen, &helloLogged, &authenticated);
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

  // WR-03: load the per-launch secret from env (never argv -- visible in ps),
  // then unsetenv() so nothing the Steam dylib spawns inherits it. Missing or
  // malformed -> fail closed: every authenticated slot is refused.
  {
    const char *envSecret = getenv(BRIDGE_SECRET_ENV);
    int valid = envSecret != NULL && strlen(envSecret) == BRIDGE_SECRET_HEX_LEN;
    for (size_t i = 0; valid && i < BRIDGE_SECRET_HEX_LEN; i++) {
      char ch = envSecret[i];
      if (!((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f'))) valid = 0;
    }
    if (valid) {
      memcpy(g_secret, envSecret, BRIDGE_SECRET_HEX_LEN);
      g_secret_set = 1;
    } else {
      logts("AUTH", "no valid secret in env -- authenticated slots refused (fail closed)");
    }
    unsetenv(BRIDGE_SECRET_ENV);
  }

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
  const char *initOutcome;
  if (load_steam_api()) {
    init_steam_api_once(g_appid);
    initOutcome = g_inited ? "ok" : "failed";
  } else {
    logts("INIT", "dylib-missing -- g_inited stays 0, serving HEALTH/HELLO only");
    initOutcome = "dylib-missing";
  }

  // WR-02 fix: the ONE terminal "now serving" marker. Printed exactly once, on
  // every path that reaches accept() (this helper is single-threaded, so a
  // connection made during init sits unanswered in the listen backlog).
  // helperProcess.ts's READY_LINE parses it byte-for-byte, and nothing but the
  // accept loop follows it.
  logts_f("READY", "init=%s appid=%s", initOutcome, g_appid);

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
