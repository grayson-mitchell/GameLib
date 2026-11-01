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
 * connection. WHOAMI, REPORT_VERSION, REPORT_INIT,
 * REPORT_NULL_SRET, REPORT_STUB_CALL, REQUEST_CURRENT_STATS,
 * REPORT_CB_DISPATCH, DRAIN and
 * every interface ordinal answer STATUS_ERR (empty ret, connection kept
 * open) until a matching HELLO. The ring is bound to the launch secret, NOT to
 * a socket: it is never cleared on accept or close, because the shim
 * reconnects routinely (RECV_TIMEOUT_SECONDS inactivity close, WR-02 oversize drop) and the
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
 *   - REQUEST_CURRENT_STATS (slot 9, quick 261027-k51): empty argBlob, sent by
 *     the shim on EVERY game call to ISteamUserStats::RequestCurrentStats (a
 *     shim-local fallback, because the Mac libsteam_api has no such export).
 *     Authenticated only; always answers STATUS_OK with an empty ret (the
 *     game's fallback still returns 1). The helper pumps once, then queues the
 *     cached UserStatsReceived_t (1101) if it has one, does nothing if a 1101
 *     is already queued, and otherwise calls RequestUserStats for the local
 *     user (at most one fetch in flight) and forwards the next own-app 1101.
 *     Logged as `STATS  request ...` (integers and fixed words only, never a
 *     SteamID, gameID or call handle; max 32 lines plus one cap line). Never
 *     sleeps, never logs CALL.
 *
 *   - REPORT_CB_DISPATCH (slot 10, quick 261027-k51): argBlob is exactly 12
 *     bytes {i32 iCallback, u32 ndispatched, u32 held}, sent by the shim for
 *     each relayed callback it dispatched or held. Authenticated only; the id
 *     must be allowlisted, ndispatched <= 512, held 0 or 1, else STATUS_ERR
 *     with no log. Logged as `CBDISP iCallback=<id> targets=<n> held=<h>`
 *     (max 32 lines plus one cap line). Never pumps, never logs CALL.
 *
 *   - Slot 3 (Phase 52 CREATE_INTERFACE) was retired in Phase 56 (56-14, D-20)
 *     and is refused as an unknown slot; never reuse it.
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
#include <poll.h>
#include <fcntl.h>
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
#include "gamelib_callresult.h"

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
// Slot 3 retired in Phase 56 (56-14, D-20); never reuse it.
// D-53-07 (53-04): the shim reports a flat-API version it could not serve.
#define CONTROL_SLOT_REPORT_VERSION 4
// D-53-15 (quick 261025-kax): the shim reports the GAME's own SteamAPI_Init
// result as {u32 fn, i32 ret}; logged under the GINIT category. GINIT is
// emitted ONLY from this wire handler, so this helper's own in-process
// SteamAPI_InitFlat (logged as INIT) can never produce one.
#define CONTROL_SLOT_REPORT_INIT 5
// Phase 55: the shim drains queued Steam callbacks (168 and 1101) from RunCallbacks; pull-only, one message per round trip.
#define CONTROL_SLOT_DRAIN_CALLBACKS 6
// quick 261027-ijs: the shim reports the first call of each per-version x64 sret null-object slot, logged as NULLSRET.
#define CONTROL_SLOT_REPORT_NULL_SRET 7
// quick 261027-jgs: the shim reports the first call of each locally-answered method or x64 null-object slot, logged as STUBCALL.
#define CONTROL_SLOT_REPORT_STUB_CALL 8
// quick 261027-k51: the game asked for its stats (RequestCurrentStats); the helper forwards a UserStatsReceived_t (1101).
#define CONTROL_SLOT_REQUEST_CURRENT_STATS 9
// quick 261027-k51: the shim reports each relayed callback it dispatched or held, logged as CBDISP.
#define CONTROL_SLOT_REPORT_CB_DISPATCH 10
// Phase 58 (58-07): the shim drains one completed call result (CreateLobby, JoinLobby, RequestLobbyList) per round trip.
#define CONTROL_SLOT_DRAIN_CALL_RESULTS 11
// Phase 58 (58-20): the shim drains one server-browser event (list, ping, players, rules) per round trip.
#define CONTROL_SLOT_DRAIN_SERVER_EVENTS 12
// Phase 58 (58-29): GameLib's own UI lists the signed-in account's friends (ordinals, never SteamIDs) and invites one to the lobby the game asked to invite to.
#define CONTROL_SLOT_LIST_FRIENDS 13
#define CONTROL_SLOT_INVITE_FRIEND 14

#define STATUS_OK 0
#define STATUS_ERR 1

// WR-03: per-launch secret (backend -> env). Matches protocol.ts's
// BRIDGE_SECRET_ENV / BRIDGE_SECRET_HEX_LEN / HELLO_ROLE_PROBE exactly.
#define BRIDGE_SECRET_ENV "GAMELIB_BRIDGE_SECRET"
#define BRIDGE_SECRET_HEX_LEN 64
#define HELLO_ROLE_PROBE 0x01
// At most this many `AUTH refused` log lines per process (hostile-client flood cap).
#define AUTH_REFUSED_LOG_MAX 16

// WR-02 / 58-35: per-connection bound -- a connection that sends no bytes for
// this long is closed (mid-frame or idle), and a response send that cannot
// complete within it (SO_SNDTIMEO) closes that connection, never the helper.
// Previously bounded a blocking recv() waiting for more bytes of a frame. Generous relative to a legitimate
// request's real latency (pump_callbacks alone sleeps up to 150ms) so this
// never fires during normal operation, but bounded so a partial-send stall
// (crashed bottle mid-frame, wedged/malicious loopback peer) cannot freeze
// this helper -- and, now that a game's own process lifetime owns this
// helper's teardown (bottleProcessMonitor.ts), it never needs to wedge
// another game's bridge session either, since each appId already has its
// own helper -- forever.
#define RECV_TIMEOUT_SECONDS 5

// 58-35: the connection table. The helper multiplexes the listen socket and
// every open connection with ONE poll() loop on the main thread (Steam calls
// keep their thread affinity). A connection accepted while the table is full
// is closed at once; the "table full" ABORT line is logged at most
// GL_CONN_CAP_LOG_MAX times per process.
#define GL_MAX_CONNS 16
#define GL_CONN_CAP_LOG_MAX 16
// 58 WR-02: a connection that has not authenticated with HELLO within this
// many seconds of accept() is closed, however actively it trickles bytes.
// Every legitimate client (shim, backend probe, invite control client)
// sends HELLO immediately after connecting, so this only reaps squatters.
#define GL_AUTH_DEADLINE_SECONDS RECV_TIMEOUT_SECONDS
// 58 WR-03: per-stall bound on a blocking send() in the single serving thread.
// The largest response (BRIDGE_DISPATCH_RESP_SCRATCH_BYTES + header, ~61 KB)
// fits in an empty loopback send buffer (macOS default 128 KB), and every
// legitimate client reads each reply before its next request, so a send only
// blocks when a peer has let replies pile up unread. That peer is dropped
// after this stall (send_all's EAGAIN path) instead of freezing every other
// connection and the Steam pump for 5 s.
#define GL_SEND_TIMEOUT_USEC 250000

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
static gl_cr_state     g_cr;
// 58-07: latest join observed by the pump, awaiting the shim's slot-10 report.
static struct { int valid; int32_t id; int path; } g_join_note;
// 58-28 (WR-06): segmented NET budgets. join has its own budget; each
// (kind, iface) of send/recv/oversize has its own. PATH is exempt (callers
// latch it). Worst case 16 + 3*4*8 = 112 lines per launch. Scope: the helper is
// stopped at game stop (games.ts stopBridgeHelper), so per process == per launch
// and no reset is needed.
#define GL_NET_JOIN_MAX 16
#define GL_NET_KIND_IFACE_MAX 8
static unsigned g_net_join_logged = 0;
static int g_net_join_cap_noted = 0;
static unsigned g_net_ki_logged[5][4];
static int g_net_ki_cap_noted[5][4];
// quick 261031-ixa: per-id log budgets. One process-wide cap let steady
// 1281/1222 traffic hide a later 513 line. Fixed 32-id table; a new id beyond
// it is silent. gl_logbudget_take: 1 = log it, 2 = first refusal (emit a cap
// line), 0 = silent.
typedef struct { int32_t id; uint8_t n; } gl_logbudget_slot;
typedef struct { gl_logbudget_slot s[32]; unsigned count; } gl_logbudget;
static int gl_logbudget_take(gl_logbudget *b, int32_t id, unsigned max) {
  for (unsigned i = 0; i < b->count; i++) {
    if (b->s[i].id != id) continue;
    if (b->s[i].n < max) { b->s[i].n++; return 1; }
    if (b->s[i].n == max) { b->s[i].n++; return 2; }
    return 0;
  }
  if (b->count >= 32) return 0;
  b->s[b->count].id = id;
  b->s[b->count].n = 1;
  b->count++;
  return 1;
}
static gl_logbudget g_cbq_budget;
static gl_logbudget g_cr_done_budget;
static gl_logbudget g_cr_drain_budget;
static gl_logbudget g_cbdisp_budget;

// quick 261027-k51: UserStatsReceived_t (1101) forwarding. Both exports are
// NULL-tolerant: a missing one degrades only the fetch path.
typedef bool     (*MDGetAPICallResult_t)(int32_t, uint64_t, void *, int, int, bool *);
typedef uint64_t (*RequestUserStats_t)(void *, uint64_t);
static MDGetAPICallResult_t g_md_get_api_call_result;
static RequestUserStats_t   g_request_user_stats;
static gl_stats_fwd         g_stats;
static uint64_t             g_appid_u64 = 0;
static unsigned             g_cbq_stats_logged = 0;
static unsigned             g_stats_logged = 0;
static int                  g_stats_cap_noted = 0;
#define STATS_LOG_MAX 32
#define CBDISP_PER_ID_LOG_MAX 4
#define CBDISP_MAX_TARGETS 512

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
  g_md_get_api_call_result =
      (MDGetAPICallResult_t)dlsym(g_dylib_handle, "SteamAPI_ManualDispatch_GetAPICallResult");
  g_request_user_stats =
      (RequestUserStats_t)dlsym(g_dylib_handle, "SteamAPI_ISteamUserStats_RequestUserStats");
  if (!g_md_get_api_call_result || !g_request_user_stats) {
    logts("WARN", "RequestUserStats/GetAPICallResult not exported -- 1101 can only be forwarded from a broadcast");
  }
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

// quick 261027-k51: one CBQ line per observed own-app-candidate 1101. The
// format is a literal at every call (T-55-08/T-k51-03): integers and fixed
// words only, never the gameID, SteamID, call handle or payload.
#define GL_LOG_STATS_OBS(srcword, appword, actword, res) \
  logts_f("CBQ", "stats iCallback=1101 src=" srcword " result=%d app=" appword " action=" actword, (int)(res))

static void gl_log_stats_obs(int from_callresult, int rc, int32_t result) {
  if (g_cbq_stats_logged >= 32) return;
  g_cbq_stats_logged++;
  if (from_callresult) {
    if (rc == GL_STATS_OBS_QUEUED) GL_LOG_STATS_OBS("callresult", "own", "queued", result);
    else if (rc == GL_STATS_OBS_CACHED) GL_LOG_STATS_OBS("callresult", "own", "cached", result);
    else if (rc == GL_STATS_OBS_OTHER_APP) GL_LOG_STATS_OBS("callresult", "other", "ignored", result);
    else GL_LOG_STATS_OBS("callresult", "unknown", "bad", result);
  } else {
    if (rc == GL_STATS_OBS_QUEUED) GL_LOG_STATS_OBS("callback", "own", "queued", result);
    else if (rc == GL_STATS_OBS_CACHED) GL_LOG_STATS_OBS("callback", "own", "cached", result);
    else if (rc == GL_STATS_OBS_OTHER_APP) GL_LOG_STATS_OBS("callback", "other", "ignored", result);
    else GL_LOG_STATS_OBS("callback", "unknown", "bad", result);
  }
}

// Phase 58 (58-07, D-08 / M-05): NET evidence lines in the 58-05 grammar. Words
// come from closed literal tables; the only runtime values are integers
// (callback id, count). Never a SteamID, address, handle or payload (V7).
static void gl_net_append(char *dst, size_t cap, const char *lit) {
  size_t n = strlen(dst);
  size_t l = strlen(lit);
  if (n + l + 1 > cap) return;
  memcpy(dst + n, lit, l + 1);
}

void gl_net_evidence(int game, int kind, int iface, int32_t cb, uint32_t n, int path) {
  static const char *const k_kind[] = {"join", "send", "recv", "path", "oversize"};
  static const char *const k_iface[] = {"Matchmaking", "Networking", "Sockets", "Messages"};
  static const char *const k_path[] = {"unknown", "direct", "relayed"};
  if (kind < 0 || kind > GL_NET_KIND_OVERSIZE || iface < 0 || iface > GL_NET_IFACE_MESSAGES ||
      path < 0 || path > GL_NET_PATH_RELAYED || cb < 0 || cb > 99999)
    return;
  if (kind == GL_NET_KIND_JOIN) {
    if (g_net_join_logged >= GL_NET_JOIN_MAX) {
      if (!g_net_join_cap_noted) {
        g_net_join_cap_noted = 1;
        logts("NET", "cap kind=join reached; later lines are not logged");
      }
      return;
    }
    g_net_join_logged++;
  } else if (kind != GL_NET_KIND_PATH) {
    if (g_net_ki_logged[kind][iface] >= GL_NET_KIND_IFACE_MAX) {
      if (!g_net_ki_cap_noted[kind][iface]) {
        char cap[96];
        g_net_ki_cap_noted[kind][iface] = 1;
        cap[0] = '\0';
        gl_net_append(cap, sizeof cap, "cap kind=");
        gl_net_append(cap, sizeof cap, k_kind[kind]);
        gl_net_append(cap, sizeof cap, " iface=");
        gl_net_append(cap, sizeof cap, k_iface[iface]);
        gl_net_append(cap, sizeof cap, " reached; later lines are not logged");
        logts("NET", cap);
      }
      return;
    }
    g_net_ki_logged[kind][iface]++;
  }
  char msg[160];
  char num[16];
  msg[0] = '\0';
  gl_net_append(msg, sizeof msg, game ? "role=game kind=" : "role=helper kind=");
  gl_net_append(msg, sizeof msg, k_kind[kind]);
  gl_net_append(msg, sizeof msg, " iface=");
  gl_net_append(msg, sizeof msg, k_iface[iface]);
  gl_net_append(msg, sizeof msg, " cb=");
  snprintf(num, sizeof num, "%d", (int)cb);
  gl_net_append(msg, sizeof msg, num);
  gl_net_append(msg, sizeof msg, " n=");
  snprintf(num, sizeof num, "%u", (unsigned)n);
  gl_net_append(msg, sizeof msg, num);
  gl_net_append(msg, sizeof msg, " path=");
  gl_net_append(msg, sizeof msg, k_path[path]);
  logts("NET", msg);
}

int gl_helper_cr_track(uint64_t hCall, int32_t iCallback) {
  return gl_cr_track(&g_cr, hCall, iCallback);
}

/* === 58-13: legacy ISteamNetworking 006 P2P helpers ======================= */

#define GL_P2P_MAX_READ 61440u
/* WR-07 legacy-P2P fallback state. Helper-only; SteamIDs are NEVER logged.
 * Every bounded table fails CLOSED when full: the sent-to and lobby rings evict
 * the oldest (an evicted peer is refused), the served FIFO overflow is skipped in
 * step (g_p2p_served_skip) so later reports still pair with their own 1202. There
 * is no accept-once table any more: with one report per 1202 there is no duplicate
 * to suppress, a 1202 means Steam holds no session with that peer (a real listener
 * would accept again), and after the allowlist it is no longer a security gate. */
#define GL_P2P_SERVED_MAX 32
#define GL_P2P_SENT_MAX 64
#define GL_P2P_LOBBY_MAX 4
#define GL_P2P_LOBBY_MEMBERS_MAX 250
#define GL_P2P_LOG_MAX 16
static uint64_t g_p2p_served[GL_P2P_SERVED_MAX];
static unsigned g_p2p_served_head = 0;
static unsigned g_p2p_served_count = 0;
static unsigned g_p2p_served_skip = 0;
static uint64_t g_p2p_sent[GL_P2P_SENT_MAX];
static unsigned g_p2p_sent_next = 0;
static unsigned g_p2p_sent_n = 0;
static uint64_t g_p2p_lobbies[GL_P2P_LOBBY_MAX];
static unsigned g_p2p_lobby_next = 0;
static unsigned g_p2p_lobby_n = 0;
static int      g_p2p_path_seen[2];

/* Fail-closed ReadP2PPacket (Pitfall 4). Request (generic encoding):
 * [u32 capacity][u32 cubDest][i32 nChannel]. Response: [i32 ret][u32 pcubMsgSize]
 * [u64 steamIDRemote][u32 len][len bytes]. A packet larger than
 * min(cubDest, 61440, capacity, response room) and at most 1 MiB is consumed
 * and discarded -- never truncated and never delivered -- so the channel does
 * not stall. Above 1 MiB it is left unread. */
int gl_net_read_p2p_packet(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                           uint32_t respCap, uint32_t *respLen) {
  *respLen = 0;
  if (args == NULL || argLen != 12 || resp == NULL || respCap < 20) return 1;
  if (self == NULL || g_bd_flat_SteamNetworking006_IsP2PPacketAvailable == NULL ||
      g_bd_flat_SteamNetworking006_ReadP2PPacket == NULL)
    return 1;
  uint32_t cap, cubDest;
  int32_t chan;
  memcpy(&cap, args, 4);
  memcpy(&cubDest, args + 4, 4);
  memcpy(&chan, args + 8, 4);
  uint32_t limit = cubDest;
  if (cap < limit) limit = cap;
  if (limit > GL_P2P_MAX_READ) limit = GL_P2P_MAX_READ;
  if (limit > respCap - 20) limit = respCap - 20;

  int32_t ret = 0;
  uint32_t msgSize = 0;
  uint64_t remote = 0;
  uint32_t len = 0;
  uint32_t avail = 0;
  int have = g_bd_flat_SteamNetworking006_IsP2PPacketAvailable(self, &avail, chan) & 0xff;
  if (have) {
    if (avail > limit) {
      /* CR-02: consume and discard so the channel head advances. Real Steam
       * only pops a packet when cubDest >= its size. The scratch is capped at
       * 1 MiB (T-58-82); above the cap the packet is left, recorded only. */
      if (avail <= (1u << 20)) {
        uint8_t *scratch = (uint8_t *)malloc(avail);
        if (scratch != NULL) {
          uint32_t dgot = 0;
          uint64_t dremote = 0;
          (void)g_bd_flat_SteamNetworking006_ReadP2PPacket(self, scratch, avail, &dgot, &dremote, chan);
          gl_cbq_secure_zero(scratch, avail);
          free(scratch);
        }
      }
      gl_net_evidence(1, GL_NET_KIND_OVERSIZE, GL_NET_IFACE_NETWORKING, 0, avail, GL_NET_PATH_UNKNOWN);
    } else {
      uint32_t got = 0;
      int ok = g_bd_flat_SteamNetworking006_ReadP2PPacket(self, resp + 20, limit, &got, &remote, chan) & 0xff;
      if (ok && got <= limit) {
        ret = 1;
        msgSize = got;
        len = got;
        gl_net_evidence(1, GL_NET_KIND_RECV, GL_NET_IFACE_NETWORKING, 0, got, GL_NET_PATH_UNKNOWN);
      } else {
        remote = 0;
        gl_cbq_secure_zero(resp + 20, limit);
      }
    }
  }
  memcpy(resp, &ret, 4);
  memcpy(resp + 4, &msgSize, 4);
  memcpy(resp + 8, &remote, 8);
  memcpy(resp + 16, &len, 4);
  *respLen = 20 + len;
  return 0;
}

/* GetP2PSessionState with relay/direct observation (D-06). Request:
 * [u64 steamIDRemote]. Response: [i32 ret][u8 present][20 bytes
 * P2PSessionState_t]. */
int gl_net_get_p2p_session_state(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                                 uint32_t respCap, uint32_t *respLen) {
  *respLen = 0;
  if (args == NULL || argLen != 8 || resp == NULL || respCap < 25) return 1;
  if (self == NULL || g_bd_flat_SteamNetworking006_GetP2PSessionState == NULL) return 1;
  uint64_t remote;
  memcpy(&remote, args, 8);
  uint8_t st[20];
  memset(st, 0, sizeof st);
  int32_t ret = g_bd_flat_SteamNetworking006_GetP2PSessionState(self, remote, st) & 0xff;
  memcpy(resp, &ret, 4);
  resp[4] = 1;
  memcpy(resp + 5, st, sizeof st);
  *respLen = 25;
  if (ret) {
    int relayed = st[3] != 0; /* m_bUsingRelay, measured offset 3 (58-02) */
    if (!g_p2p_path_seen[relayed]) {
      g_p2p_path_seen[relayed] = 1;
      gl_net_evidence(1, GL_NET_KIND_PATH, GL_NET_IFACE_NETWORKING, 0, 0,
                      relayed ? GL_NET_PATH_RELAYED : GL_NET_PATH_DIRECT);
    }
  }
  return 0;
}

/* === 58-14: ISteamNetworkingUtils helpers ================================== */
/* Each function below is a helperCustom for SteamNetworkingUtils004. The shim
 * reaches it through gl_bridge_call_raw (the method is shimLocal there), and
 * the request layout is defined by the shim's NETWORKING_LOCAL_C. The Mac
 * symbols are resolved with dlsym on the helper's one dylib handle on first
 * use. A Windows function pointer can never arrive here: the shim keeps every
 * Ptr value and Callback_* config in its own store, and these handlers refuse
 * both again (T-58-44). Nothing here logs a string. */

#define GL_NETU_CFG_CB_FIRST 201
#define GL_NETU_CFG_CB_LAST 207
#define GL_NETU_CFG_PTR 5
#define GL_NETU_STRING_MAX 4096
#define GL_NETU_GET_MAX 4096
#define GL_NETU_POP_MAX 256
#define GL_NETU_PING_LOC_BYTES 512
#define GL_NETU_NAME_MAX 127

static void *gl_netu_sym(const char *name) {
  return g_dylib_handle != NULL ? dlsym(g_dylib_handle, name) : NULL;
}

/* [i32 eValue][i32 scope][i64 obj][i32 type][u32 len][len bytes] -> [i32 ret].
 * type 1 or 3 needs len 4, type 2 len 8, type 4 len 1..4096 ending in NUL; a
 * len of 0 resets to the inherited value. Type 5 (Ptr) and the Callback_* ids
 * are refused before the value is read. */
int gl_net_set_config_value(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                            uint32_t respCap, uint32_t *respLen) {
  typedef int (*SetCfg_t)(void *, int32_t, int32_t, intptr_t, int32_t, const void *);
  static SetCfg_t fn = NULL;
  int32_t e, scope, type, ret;
  int64_t obj;
  uint32_t len;
  const void *val = NULL;
  *respLen = 0;
  if (args == NULL || resp == NULL || respCap < 4 || argLen < 24) return 1;
  memcpy(&e, args, 4);
  memcpy(&scope, args + 4, 4);
  memcpy(&obj, args + 8, 8);
  memcpy(&type, args + 16, 4);
  memcpy(&len, args + 20, 4);
  if (type == GL_NETU_CFG_PTR) return 1;
  if (e >= GL_NETU_CFG_CB_FIRST && e <= GL_NETU_CFG_CB_LAST) return 1;
  if (scope < 1 || scope > 4) return 1;
  if (type < 1 || type > 4) return 1;
  if (len > GL_NETU_STRING_MAX || argLen != 24u + len) return 1;
  if (len != 0) {
    if ((type == 1 || type == 3) && len != 4) return 1;
    if (type == 2 && len != 8) return 1;
    if (type == 4 && args[24 + len - 1] != 0) return 1;
    val = args + 24;
  }
  if (self == NULL) return 1;
  if (fn == NULL) fn = (SetCfg_t)gl_netu_sym("SteamAPI_ISteamNetworkingUtils_SetConfigValue");
  if (fn == NULL) return 1;
  ret = fn(self, e, scope, (intptr_t)obj, type, val) & 0xff;
  memcpy(resp, &ret, 4);
  *respLen = 4;
  return 0;
}

/* [i32 eValue][i32 scope][i64 obj][u32 cap] -> [i32 ret][i32 type][u64 needed]
 * [u32 n][n bytes]. cap is at most 4096. A Callback_* id is refused up front,
 * and a native reply of type Ptr is refused so a Mac pointer never leaves. */
int gl_net_get_config_value(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                            uint32_t respCap, uint32_t *respLen) {
  typedef int (*GetCfg_t)(void *, int32_t, int32_t, intptr_t, int32_t *, void *, size_t *);
  static GetCfg_t fn = NULL;
  int32_t e, scope, ret, type = 0;
  int64_t obj;
  uint32_t cap, n = 0;
  uint64_t needed;
  size_t cb = 0;
  uint8_t buf[GL_NETU_GET_MAX];
  *respLen = 0;
  if (args == NULL || resp == NULL || argLen != 20) return 1;
  memcpy(&e, args, 4);
  memcpy(&scope, args + 4, 4);
  memcpy(&obj, args + 8, 8);
  memcpy(&cap, args + 16, 4);
  if (e >= GL_NETU_CFG_CB_FIRST && e <= GL_NETU_CFG_CB_LAST) return 1;
  if (scope < 1 || scope > 4) return 1;
  if (cap > GL_NETU_GET_MAX || respCap < 20u + cap) return 1;
  if (self == NULL) return 1;
  if (fn == NULL) fn = (GetCfg_t)gl_netu_sym("SteamAPI_ISteamNetworkingUtils_GetConfigValue");
  if (fn == NULL) return 1;
  memset(buf, 0, sizeof buf);
  cb = cap;
  ret = fn(self, e, scope, (intptr_t)obj, &type, cap != 0 ? buf : NULL, &cb);
  if (type == GL_NETU_CFG_PTR) {
    gl_cbq_secure_zero(buf, sizeof buf);
    return 1;
  }
  needed = (uint64_t)cb;
  if ((ret == 1 || ret == 2) && cap != 0) n = (uint32_t)(cb < cap ? cb : cap);
  memcpy(resp, &ret, 4);
  memcpy(resp + 4, &type, 4);
  memcpy(resp + 8, &needed, 8);
  memcpy(resp + 16, &n, 4);
  if (n != 0) memcpy(resp + 20, buf, n);
  *respLen = 20 + n;
  return 0;
}

/* [i32 nListSz] -> [i32 ret][u32 n][n x u32]; at most 256 entries. */
int gl_net_get_pop_list(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                        uint32_t respCap, uint32_t *respLen) {
  typedef int (*PopList_t)(void *, uint32_t *, int);
  static PopList_t fn = NULL;
  int32_t want, ret;
  uint32_t list[GL_NETU_POP_MAX];
  uint32_t n = 0;
  *respLen = 0;
  if (args == NULL || resp == NULL || argLen != 4) return 1;
  memcpy(&want, args, 4);
  if (want < 0 || want > GL_NETU_POP_MAX) return 1;
  if (respCap < 8u + 4u * (uint32_t)want) return 1;
  if (self == NULL) return 1;
  if (fn == NULL) fn = (PopList_t)gl_netu_sym("SteamAPI_ISteamNetworkingUtils_GetPOPList");
  if (fn == NULL) return 1;
  memset(list, 0, sizeof list);
  ret = fn(self, list, want);
  if (ret > 0) n = (uint32_t)(ret < want ? ret : want);
  memcpy(resp, &ret, 4);
  memcpy(resp + 4, &n, 4);
  if (n != 0) memcpy(resp + 8, list, 4u * n);
  *respLen = 8 + 4 * n;
  return 0;
}

/* [] -> [f32 ret][u8 present][512 bytes SteamNetworkPingLocation_t]. */
int gl_net_get_local_ping_location(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                                   uint32_t respCap, uint32_t *respLen) {
  typedef float (*LocalPing_t)(void *, void *);
  static LocalPing_t fn = NULL;
  uint8_t loc[GL_NETU_PING_LOC_BYTES];
  float ret;
  (void)args;
  *respLen = 0;
  if (resp == NULL || argLen != 0 || respCap < 5u + GL_NETU_PING_LOC_BYTES) return 1;
  if (self == NULL) return 1;
  if (fn == NULL) fn = (LocalPing_t)gl_netu_sym("SteamAPI_ISteamNetworkingUtils_GetLocalPingLocation");
  if (fn == NULL) return 1;
  memset(loc, 0, sizeof loc);
  ret = fn(self, loc);
  memcpy(resp, &ret, 4);
  resp[4] = 1;
  memcpy(resp + 5, loc, sizeof loc);
  *respLen = 5 + GL_NETU_PING_LOC_BYTES;
  return 0;
}

/* [f32 flMaxAgeSeconds] -> [i32 ret]. */
int gl_net_check_ping_data(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                           uint32_t respCap, uint32_t *respLen) {
  typedef int (*CheckPing_t)(void *, float);
  static CheckPing_t fn = NULL;
  float age;
  int32_t ret;
  *respLen = 0;
  if (args == NULL || resp == NULL || argLen != 4 || respCap < 4) return 1;
  if (self == NULL) return 1;
  memcpy(&age, args, 4);
  if (fn == NULL) fn = (CheckPing_t)gl_netu_sym("SteamAPI_ISteamNetworkingUtils_CheckPingDataUpToDate");
  if (fn == NULL) return 1;
  ret = fn(self, age) & 0xff;
  memcpy(resp, &ret, 4);
  *respLen = 4;
  return 0;
}

/* [512 bytes location][i32 cap] -> [u32 len][len bytes], cap 1..1024. */
int gl_net_convert_ping_location(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                                 uint32_t respCap, uint32_t *respLen) {
  typedef void (*ConvertPing_t)(void *, const void *, char *, int);
  static ConvertPing_t fn = NULL;
  char out[1024];
  int32_t cap;
  uint32_t n;
  *respLen = 0;
  if (args == NULL || resp == NULL || argLen != GL_NETU_PING_LOC_BYTES + 4) return 1;
  memcpy(&cap, args + GL_NETU_PING_LOC_BYTES, 4);
  if (cap < 1 || cap > (int32_t)sizeof out || respCap < 4u + (uint32_t)cap) return 1;
  if (self == NULL) return 1;
  if (fn == NULL) fn = (ConvertPing_t)gl_netu_sym("SteamAPI_ISteamNetworkingUtils_ConvertPingLocationToString");
  if (fn == NULL) return 1;
  memset(out, 0, sizeof out);
  fn(self, args, out, cap);
  out[cap - 1] = 0;
  n = (uint32_t)strlen(out);
  memcpy(resp, &n, 4);
  memcpy(resp + 4, out, n);
  *respLen = 4 + n;
  return 0;
}

/* [i32 eValue] -> [u32 nameLen][name][i32 type][i32 scope]; nameLen 0 for an
 * unknown value. The name is capped at 127 bytes and never logged. */
int gl_net_get_config_value_info(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                                 uint32_t respCap, uint32_t *respLen) {
  typedef const char *(*CfgInfo_t)(void *, int32_t, int32_t *, int32_t *);
  static CfgInfo_t fn = NULL;
  int32_t e, type = 0, scope = 0;
  const char *name;
  uint32_t n = 0;
  *respLen = 0;
  if (args == NULL || resp == NULL || argLen != 4 || respCap < 4u + GL_NETU_NAME_MAX + 8u) return 1;
  memcpy(&e, args, 4);
  if (self == NULL) return 1;
  if (fn == NULL) fn = (CfgInfo_t)gl_netu_sym("SteamAPI_ISteamNetworkingUtils_GetConfigValueInfo");
  if (fn == NULL) return 1;
  name = fn(self, e, &type, &scope);
  if (name != NULL) {
    while (n < GL_NETU_NAME_MAX && name[n] != 0) n++;
  } else {
    type = 0;
    scope = 0;
  }
  memcpy(resp, &n, 4);
  if (n != 0) memcpy(resp + 4, name, n);
  memcpy(resp + 4 + n, &type, 4);
  memcpy(resp + 8 + n, &scope, 4);
  *respLen = 12 + n;
  return 0;
}

/* === 58-15: ISteamNetworkingSockets 013 helpers ============================ */
/* helperCustom functions for the Sockets013 wire. Each resolves its Mac symbol
 * with dlsym on the one dylib handle at first use. The dispatch thread is the
 * only caller, so the carry queue needs no lock. Payloads and identities are
 * never logged: the only runtime values in a NET line are integer counts. */

#define GL_NETS_BATCH_MAX 64
#define GL_NETS_RECORDS_MAX 61440u
#define GL_NETS_REC_HEADER 180u
#define GL_NETS_QUEUE_RECORDS 256
#define GL_NETS_QUEUE_HANDLES 32
#define GL_NETS_QUEUE_BYTES (1u << 20)
#define GL_NETS_MSG_OFF_RELEASE 184
#define GL_NETS_OPEN_OPTIONS_MAX 32
#define GL_NETS_OPEN_STRING_MAX 1024
#define GL_NETS_LANES_MAX 255
#define GL_NETS_INFO_BYTES 696
#define GL_NETS_INFO_OFF_FLAGS 440
#define GL_NETS_INFO_FLAG_RELAYED 16
#define GL_NETS_RT_BYTES 120
#define GL_NETS_RT_LANE_BYTES 64

/* A carry-queue record: a malloc'd COPY (header then payload). No Mac pointer
 * is ever stored here; every Mac message is Released inside the call that
 * received it. */
typedef struct {
  uint8_t *rec;
  uint32_t size;
} gl_nets_rec;

typedef struct {
  int used;
  int which; /* 0 = connection, 1 = poll group, 2 = Messages channel (58-16) */
  uint32_t handle;
  uint32_t head;
  uint32_t count;
  uint32_t bytes;
  gl_nets_rec q[GL_NETS_QUEUE_RECORDS];
} gl_nets_queue;

static gl_nets_queue g_nets_queue[GL_NETS_QUEUE_HANDLES];
static uint32_t g_nets_evict = 0;
static int g_nets_path_seen[2];
static int g_netm_path_seen[2];

static void *gl_nets_sym(const char *name) {
  return g_dylib_handle != NULL ? dlsym(g_dylib_handle, name) : NULL;
}

static void gl_nets_rec_free(gl_nets_rec *r) {
  if (r->rec != NULL) {
    gl_cbq_secure_zero(r->rec, r->size);
    free(r->rec);
  }
  r->rec = NULL;
  r->size = 0;
}

static void gl_nets_queue_clear(gl_nets_queue *s) {
  for (uint32_t i = 0; i < s->count; i++) gl_nets_rec_free(&s->q[(s->head + i) % GL_NETS_QUEUE_RECORDS]);
  memset(s, 0, sizeof *s);
}

/* 58-28 (WR-08): CloseChannelWithUser deliberately does NOT clear a queue. The
 * Messages queues (which == 2) are keyed by channel, not by peer, so clearing
 * on one peer's close would drop the other peers' carried messages. */
static gl_nets_queue *gl_nets_queue_find(int which, uint32_t handle, int create) {
  gl_nets_queue *free_slot = NULL;
  for (int i = 0; i < GL_NETS_QUEUE_HANDLES; i++) {
    gl_nets_queue *s = &g_nets_queue[i];
    if (s->used && s->which == which && s->handle == handle) return s;
    if (!s->used && free_slot == NULL) free_slot = s;
  }
  if (!create) return NULL;
  if (free_slot == NULL) {
    free_slot = &g_nets_queue[g_nets_evict++ % GL_NETS_QUEUE_HANDLES];
    // 58-28 (WR-08): eviction drops carried records; say how many (integer only).
    if (free_slot->count > 0)
      gl_net_evidence(1, GL_NET_KIND_OVERSIZE, free_slot->which == 2 ? GL_NET_IFACE_MESSAGES : GL_NET_IFACE_SOCKETS,
                      0, free_slot->count, GL_NET_PATH_UNKNOWN);
    gl_nets_queue_clear(free_slot);
  }
  free_slot->used = 1;
  free_slot->which = which;
  free_slot->handle = handle;
  return free_slot;
}

/* Drops the oldest record of a full queue, logged as an oversize line. */
static void gl_nets_queue_drop_oldest(gl_nets_queue *s) {
  gl_nets_rec *r = &s->q[s->head];
  gl_net_evidence(1, GL_NET_KIND_OVERSIZE, s->which == 2 ? GL_NET_IFACE_MESSAGES : GL_NET_IFACE_SOCKETS, 0,
                  r->size, GL_NET_PATH_UNKNOWN);
  s->bytes -= r->size;
  gl_nets_rec_free(r);
  s->head = (s->head + 1) % GL_NETS_QUEUE_RECORDS;
  s->count--;
}

/* Takes ownership of rec (malloc'd). */
static void gl_nets_queue_push(gl_nets_queue *s, uint8_t *rec, uint32_t size) {
  while (s->count > 0 && (s->count >= GL_NETS_QUEUE_RECORDS || s->bytes + size > GL_NETS_QUEUE_BYTES))
    gl_nets_queue_drop_oldest(s);
  gl_nets_rec *r = &s->q[(s->head + s->count) % GL_NETS_QUEUE_RECORDS];
  r->rec = rec;
  r->size = size;
  s->count++;
  s->bytes += size;
}

/* Copies one Mac message into the out-messages record layout. */
static void gl_nets_encode(uint8_t *dst, const uint8_t *msg, uint32_t cb, const uint8_t *data) {
  memset(dst, 0, GL_NETS_REC_HEADER);
  memcpy(dst, &cb, 4);
  memcpy(dst + 4, msg + 12, 4);
  memcpy(dst + 8, msg + 16, 136);
  memcpy(dst + 144, msg + 152, 8);
  memcpy(dst + 152, msg + 160, 8);
  memcpy(dst + 160, msg + 168, 8);
  memcpy(dst + 168, msg + 192, 4);
  memcpy(dst + 172, msg + 196, 4);
  memcpy(dst + 176, msg + 208, 2);
  if (cb > 0) memcpy(dst + GL_NETS_REC_HEADER, data, cb);
}

static void gl_nets_release(void *msg) {
  void (*rel)(void *);
  memcpy(&rel, (const uint8_t *)msg + GL_NETS_MSG_OFF_RELEASE, sizeof rel);
  if (rel != NULL) rel(msg);
}

/* Fail-closed, loss-free receive (Pitfalls 3-5). Request: [u32 handle]
 * [i32 nMaxMessages]. Response: [i32 n] then n records (out-messages). At most
 * min(nMaxMessages, 64) Mac messages are taken per call; each is copied and
 * Released at once. Whatever does not fit in 61440 record bytes waits in the
 * per-handle carry queue and is returned first next time. A single message too
 * big for any response is dropped with an oversize line, never truncated. */
static int gl_nets_receive(int which, void *self, const uint8_t *args, uint32_t argLen,
                           uint8_t *resp, uint32_t respCap, uint32_t *respLen) {
  typedef int (*Recv_t)(void *, uint32_t, void **, int);
  static Recv_t fn[3];
  uint32_t handle, off = 4, limit;
  const int iface = which == 2 ? GL_NET_IFACE_MESSAGES : GL_NET_IFACE_SOCKETS;
  int32_t nMax, n = 0;
  gl_nets_queue *slot;
  *respLen = 0;
  if (args == NULL || resp == NULL || argLen != 8 || respCap < 4) return 1;
  if (self == NULL) return 1;
  memcpy(&handle, args, 4);
  memcpy(&nMax, args + 4, 4);
  if (fn[which] == NULL)
    fn[which] = (Recv_t)gl_nets_sym(which == 0   ? "SteamAPI_ISteamNetworkingSockets_ReceiveMessagesOnConnection"
                                    : which == 1 ? "SteamAPI_ISteamNetworkingSockets_ReceiveMessagesOnPollGroup"
                                                 : "SteamAPI_ISteamNetworkingMessages_ReceiveMessagesOnChannel");
  if (fn[which] == NULL) return 1;
  limit = respCap < 4u + GL_NETS_RECORDS_MAX ? respCap : 4u + GL_NETS_RECORDS_MAX;
  slot = gl_nets_queue_find(which, handle, 0);
  /* 1. what an earlier call could not fit */
  while (slot != NULL && slot->count > 0 && n < nMax) {
    gl_nets_rec *r = &slot->q[slot->head];
    if (off + r->size > limit) break;
    memcpy(resp + off, r->rec, r->size);
    off += r->size;
    n++;
    slot->bytes -= r->size;
    gl_nets_rec_free(r);
    slot->head = (slot->head + 1) % GL_NETS_QUEUE_RECORDS;
    slot->count--;
  }
  /* 2. new Mac messages, only once the queue is empty so order is kept */
  if (n < nMax && (slot == NULL || slot->count == 0)) {
    int want = nMax - n > GL_NETS_BATCH_MAX ? GL_NETS_BATCH_MAX : (int)(nMax - n);
    void *msgs[GL_NETS_BATCH_MAX];
    int got, queueing = 0;
    memset(msgs, 0, sizeof msgs);
    got = fn[which](self, handle, msgs, want);
    if (got < 0) got = 0;
    if (got > want) got = want;
    for (int i = 0; i < got; i++) {
      const uint8_t *m = (const uint8_t *)msgs[i];
      int32_t cb;
      const uint8_t *data;
      uint32_t size;
      if (m == NULL) continue;
      memcpy(&cb, m + 8, 4);
      memcpy(&data, m, sizeof data);
      if (cb < 0 || (cb > 0 && data == NULL) || (uint32_t)cb > GL_NETS_RECORDS_MAX - GL_NETS_REC_HEADER) {
        gl_net_evidence(1, GL_NET_KIND_OVERSIZE, iface, 0, cb < 0 ? 0u : (uint32_t)cb,
                        GL_NET_PATH_UNKNOWN);
        gl_nets_release((void *)m);
        continue;
      }
      size = GL_NETS_REC_HEADER + (uint32_t)cb;
      if (!queueing && off + size <= limit) {
        gl_nets_encode(resp + off, m, (uint32_t)cb, data);
        off += size;
        n++;
      } else {
        uint8_t *copy = (uint8_t *)malloc(size);
        queueing = 1;
        if (copy == NULL) {
          gl_net_evidence(1, GL_NET_KIND_OVERSIZE, iface, 0, size, GL_NET_PATH_UNKNOWN);
        } else {
          gl_nets_encode(copy, m, (uint32_t)cb, data);
          if (slot == NULL) slot = gl_nets_queue_find(which, handle, 1);
          gl_nets_queue_push(slot, copy, size);
        }
      }
      gl_nets_release((void *)m);
    }
  }
  memcpy(resp, &n, 4);
  *respLen = off;
  if (n > 0) gl_net_evidence(1, GL_NET_KIND_RECV, iface, 0, (uint32_t)n, GL_NET_PATH_UNKNOWN);
  return 0;
}

int gl_net_receive_messages(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                            uint32_t respCap, uint32_t *respLen) {
  return gl_nets_receive(0, self, args, argLen, resp, respCap, respLen);
}

int gl_net_receive_messages_pg(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                               uint32_t respCap, uint32_t *respLen) {
  return gl_nets_receive(1, self, args, argLen, resp, respCap, respLen);
}

/* ReceiveMessagesOnChannel. Request [u32 nLocalChannel][i32 nMaxMessages]; same
 * response and carry queue as the Sockets variants, keyed by channel. */
int gl_net_receive_messages_ch(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                               uint32_t respCap, uint32_t *respLen) {
  return gl_nets_receive(2, self, args, argLen, resp, respCap, respLen);
}

/* GetSessionConnectionInfo. Request [u8 present][136 identity]. Response [i32 ret]
 * [u8 1][696 SteamNetConnectionInfo_t][u8 1][120 SteamNetConnectionRealTimeStatus_t].
 * Logs kind=path from m_nFlags & 16 once per direct/relayed. No identity logged. */
int gl_net_session_info(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                        uint32_t respCap, uint32_t *respLen) {
  typedef int (*Sess_t)(void *, const void *, void *, void *);
  static Sess_t fn = NULL;
  int32_t ret, flags;
  int relayed;
  uint8_t info[GL_NETS_INFO_BYTES];
  uint8_t status[GL_NETS_RT_BYTES];
  *respLen = 0;
  if (args == NULL || resp == NULL || argLen != 137 || args[0] != 1) return 1;
  if (respCap < 4u + 1u + GL_NETS_INFO_BYTES + 1u + GL_NETS_RT_BYTES || self == NULL) return 1;
  if (fn == NULL) fn = (Sess_t)gl_nets_sym("SteamAPI_ISteamNetworkingMessages_GetSessionConnectionInfo");
  if (fn == NULL) return 1;
  memset(info, 0, sizeof info);
  memset(status, 0, sizeof status);
  ret = fn(self, args + 1, info, status);
  memcpy(resp, &ret, 4);
  resp[4] = 1;
  memcpy(resp + 5, info, sizeof info);
  resp[5 + GL_NETS_INFO_BYTES] = 1;
  memcpy(resp + 6 + GL_NETS_INFO_BYTES, status, sizeof status);
  *respLen = 6u + GL_NETS_INFO_BYTES + GL_NETS_RT_BYTES;
  memcpy(&flags, info + GL_NETS_INFO_OFF_FLAGS, 4);
  relayed = (flags & GL_NETS_INFO_FLAG_RELAYED) != 0;
  if (ret != 0 && !g_netm_path_seen[relayed]) {
    g_netm_path_seen[relayed] = 1;
    gl_net_evidence(1, GL_NET_KIND_PATH, GL_NET_IFACE_MESSAGES, 0, 0,
                    relayed ? GL_NET_PATH_RELAYED : GL_NET_PATH_DIRECT);
  }
  return 0;
}

/* Logs the connection path once per kind, from m_nFlags & 16 (relayed). */
void gl_net_conn_info_path(const uint8_t *info) {
  int32_t flags;
  int relayed;
  memcpy(&flags, info + GL_NETS_INFO_OFF_FLAGS, 4);
  relayed = (flags & GL_NETS_INFO_FLAG_RELAYED) != 0;
  if (g_nets_path_seen[relayed]) return;
  g_nets_path_seen[relayed] = 1;
  gl_net_evidence(1, GL_NET_KIND_PATH, GL_NET_IFACE_SOCKETS, 0, 0,
                  relayed ? GL_NET_PATH_RELAYED : GL_NET_PATH_DIRECT);
}

/* GetConnectionInfo. Request [u32 hConn]. Response [i32 ret][u8 present]
 * [696 bytes SteamNetConnectionInfo_t]. */
int gl_net_get_connection_info(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                               uint32_t respCap, uint32_t *respLen) {
  typedef int (*Info_t)(void *, uint32_t, void *);
  static Info_t fn = NULL;
  uint32_t hConn;
  int32_t ret;
  uint8_t info[GL_NETS_INFO_BYTES];
  *respLen = 0;
  if (args == NULL || resp == NULL || argLen != 4 || respCap < 5u + GL_NETS_INFO_BYTES) return 1;
  if (self == NULL) return 1;
  memcpy(&hConn, args, 4);
  if (fn == NULL) fn = (Info_t)gl_nets_sym("SteamAPI_ISteamNetworkingSockets_GetConnectionInfo");
  if (fn == NULL) return 1;
  memset(info, 0, sizeof info);
  ret = fn(self, hConn, info) & 0xff;
  memcpy(resp, &ret, 4);
  resp[4] = 1;
  memcpy(resp + 5, info, sizeof info);
  *respLen = 5u + GL_NETS_INFO_BYTES;
  if (ret) gl_net_conn_info_path(info);
  return 0;
}

/* 58-28 (WR-08): CloseConnection / DestroyPollGroup drop the handle's carry
 * queue (securely zeroed by gl_nets_rec_free) so a reused handle never receives
 * the old messages. Request/response layouts match the generic encoding the
 * helperFlat path used: CloseConnection [u32 h][i32 reason][u32 len|0xFFFFFFFF]
 * [len bytes][i32 linger] -> [i32 ret]; DestroyPollGroup [u32 h] -> [i32 ret]. */
int gl_nets_close_connection(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                             uint32_t respCap, uint32_t *respLen) {
  typedef int (*Close_t)(void *, uint32_t, int32_t, const char *, int);
  static Close_t fn = NULL;
  static char dbg[4096 + 1];
  uint32_t handle, dlen;
  int32_t reason, linger, ret;
  const char *pdbg = NULL;
  gl_nets_queue *q;
  *respLen = 0;
  if (args == NULL || resp == NULL || respCap < 4 || self == NULL || argLen < 12) return 1;
  memcpy(&handle, args, 4);
  memcpy(&reason, args + 4, 4);
  memcpy(&dlen, args + 8, 4);
  if (dlen == 0xFFFFFFFFu) {
    dlen = 0;
  } else {
    if (dlen > 4096 || argLen < 12u + dlen) return 1;
    memcpy(dbg, args + 12, dlen);
    dbg[dlen] = '\0';
    pdbg = dbg;
  }
  if (argLen < 12u + dlen + 4) return 1;
  memcpy(&linger, args + 12 + dlen, 4);
  if (fn == NULL) fn = (Close_t)gl_nets_sym("SteamAPI_ISteamNetworkingSockets_CloseConnection");
  if (fn == NULL) return 1;
  ret = fn(self, handle, reason, pdbg, linger) & 0xff;
  q = gl_nets_queue_find(0, handle, 0);
  if (q != NULL) gl_nets_queue_clear(q);
  memcpy(resp, &ret, 4);
  *respLen = 4;
  return 0;
}

int gl_nets_destroy_poll_group(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                               uint32_t respCap, uint32_t *respLen) {
  typedef int (*Destroy_t)(void *, uint32_t);
  static Destroy_t fn = NULL;
  uint32_t handle;
  int32_t ret;
  gl_nets_queue *q;
  *respLen = 0;
  if (args == NULL || resp == NULL || respCap < 4 || self == NULL || argLen != 4) return 1;
  memcpy(&handle, args, 4);
  if (fn == NULL) fn = (Destroy_t)gl_nets_sym("SteamAPI_ISteamNetworkingSockets_DestroyPollGroup");
  if (fn == NULL) return 1;
  ret = fn(self, handle) & 0xff;
  q = gl_nets_queue_find(1, handle, 0);
  if (q != NULL) gl_nets_queue_clear(q);
  memcpy(resp, &ret, 4);
  *respLen = 4;
  return 0;
}

/* GetConnectionRealTimeStatus. Request [u32 hConn][u32 nLanes]. Response
 * [i32 ret][u8 present][120 bytes][u32 nl][nl x 64 bytes]. */
int gl_net_rt_status(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                     uint32_t respCap, uint32_t *respLen) {
  typedef int (*Rt_t)(void *, uint32_t, void *, int, void *);
  static Rt_t fn = NULL;
  uint32_t hConn, nLanes;
  int32_t ret;
  uint8_t status[GL_NETS_RT_BYTES];
  static uint8_t lanes[GL_NETS_LANES_MAX * GL_NETS_RT_LANE_BYTES];
  *respLen = 0;
  if (args == NULL || resp == NULL || argLen != 8) return 1;
  memcpy(&hConn, args, 4);
  memcpy(&nLanes, args + 4, 4);
  if (nLanes > GL_NETS_LANES_MAX) return 1;
  if (respCap < 9u + GL_NETS_RT_BYTES + nLanes * GL_NETS_RT_LANE_BYTES) return 1;
  if (self == NULL) return 1;
  if (fn == NULL) fn = (Rt_t)gl_nets_sym("SteamAPI_ISteamNetworkingSockets_GetConnectionRealTimeStatus");
  if (fn == NULL) return 1;
  memset(status, 0, sizeof status);
  memset(lanes, 0, nLanes * GL_NETS_RT_LANE_BYTES);
  ret = fn(self, hConn, status, (int)nLanes, nLanes != 0 ? lanes : NULL);
  memcpy(resp, &ret, 4);
  resp[4] = 1;
  memcpy(resp + 5, status, sizeof status);
  memcpy(resp + 5 + GL_NETS_RT_BYTES, &nLanes, 4);
  memcpy(resp + 9 + GL_NETS_RT_BYTES, lanes, nLanes * GL_NETS_RT_LANE_BYTES);
  *respLen = 9u + GL_NETS_RT_BYTES + nLanes * GL_NETS_RT_LANE_BYTES;
  return 0;
}

/* ConfigureConnectionLanes. Request [u32 hConn][i32 n][u8 hasPrio][u8 hasWeights]
 * [n x i32][n x u16]. Response [i32 EResult]. */
int gl_net_configure_lanes(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                           uint32_t respCap, uint32_t *respLen) {
  typedef int (*Lanes_t)(void *, uint32_t, int, const int32_t *, const uint16_t *);
  static Lanes_t fn = NULL;
  uint32_t hConn, off = 10;
  int32_t n, ret;
  int32_t prio[GL_NETS_LANES_MAX];
  uint16_t weights[GL_NETS_LANES_MAX];
  int hasPrio, hasWeights;
  *respLen = 0;
  if (args == NULL || resp == NULL || respCap < 4 || argLen < 10) return 1;
  memcpy(&hConn, args, 4);
  memcpy(&n, args + 4, 4);
  hasPrio = args[8];
  hasWeights = args[9];
  if (n < 1 || n > GL_NETS_LANES_MAX || hasPrio > 1 || hasWeights > 1) return 1;
  if (argLen != 10u + (hasPrio ? 4u * (uint32_t)n : 0u) + (hasWeights ? 2u * (uint32_t)n : 0u)) return 1;
  if (hasPrio) {
    memcpy(prio, args + off, 4u * (uint32_t)n);
    off += 4u * (uint32_t)n;
  }
  if (hasWeights) memcpy(weights, args + off, 2u * (uint32_t)n);
  if (self == NULL) return 1;
  if (fn == NULL) fn = (Lanes_t)gl_nets_sym("SteamAPI_ISteamNetworkingSockets_ConfigureConnectionLanes");
  if (fn == NULL) return 1;
  ret = fn(self, hConn, n, hasPrio ? prio : NULL, hasWeights ? weights : NULL);
  memcpy(resp, &ret, 4);
  *respLen = 4;
  return 0;
}

/* CreateListenSocketIP / ConnectByIPAddress / CreateListenSocketP2P /
 * ConnectP2P. Request [u8 op][struct bytes][i32 port][u32 nKept][kept options],
 * each kept option [i32 e][i32 type][u32 len][bytes]. Response [u32 handle].
 * Option data type 5 (Ptr) and ids 201-207 are refused before any value is
 * read, and every kept option is length-checked before it is used (T-58-50). */
int gl_net_sockets_open(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                        uint32_t respCap, uint32_t *respLen) {
  typedef uint32_t (*Addr_t)(void *, const void *, int, const void *);
  typedef uint32_t (*P2pListen_t)(void *, int, int, const void *);
  typedef uint32_t (*P2pConnect_t)(void *, const void *, int, int, const void *);
  static void *fns[4];
  static const char *const names[4] = {
      "SteamAPI_ISteamNetworkingSockets_CreateListenSocketIP",
      "SteamAPI_ISteamNetworkingSockets_ConnectByIPAddress",
      "SteamAPI_ISteamNetworkingSockets_CreateListenSocketP2P",
      "SteamAPI_ISteamNetworkingSockets_ConnectP2P"};
  static const uint32_t stLen[4] = {18, 18, 0, 136};
  uint8_t cfg[GL_NETS_OPEN_OPTIONS_MAX][16];
  char strs[GL_NETS_OPEN_OPTIONS_MAX][GL_NETS_OPEN_STRING_MAX];
  uint32_t off, nKept, handle = 0;
  int32_t port;
  uint8_t op;
  const uint8_t *st;
  *respLen = 0;
  if (args == NULL || resp == NULL || respCap < 4 || argLen < 1) return 1;
  op = args[0];
  if (op > 3) return 1;
  if (argLen < 1u + stLen[op] + 8u) return 1;
  st = args + 1;
  off = 1u + stLen[op];
  memcpy(&port, args + off, 4);
  memcpy(&nKept, args + off + 4, 4);
  off += 8;
  if (nKept > GL_NETS_OPEN_OPTIONS_MAX) return 1;
  memset(cfg, 0, sizeof cfg);
  for (uint32_t i = 0; i < nKept; i++) {
    int32_t e, type;
    uint32_t len;
    if (argLen - off < 12u) return 1;
    memcpy(&e, args + off, 4);
    memcpy(&type, args + off + 4, 4);
    memcpy(&len, args + off + 8, 4);
    off += 12;
    if (type == 5 || (e >= 201 && e <= 207)) return 1;
    if (len > argLen - off) return 1;
    if (type == 1 || type == 3) {
      if (len != 4) return 1;
      memcpy(cfg[i] + 8, args + off, 4);
    } else if (type == 2) {
      if (len != 8) return 1;
      memcpy(cfg[i] + 8, args + off, 8);
    } else if (type == 4) {
      const char *sp = strs[i];
      if (len < 1 || len > GL_NETS_OPEN_STRING_MAX || args[off + len - 1] != 0) return 1;
      memcpy(strs[i], args + off, len);
      memcpy(cfg[i] + 8, &sp, sizeof sp);
    } else {
      return 1;
    }
    memcpy(cfg[i], &e, 4);
    memcpy(cfg[i] + 4, &type, 4);
    off += len;
  }
  if (off != argLen) return 1;
  if (self == NULL) return 1;
  if (fns[op] == NULL) fns[op] = gl_nets_sym(names[op]);
  if (fns[op] == NULL) return 1;
  switch (op) {
    case 0:
    case 1:
      handle = ((Addr_t)fns[op])(self, st, (int)nKept, nKept != 0 ? cfg : NULL);
      break;
    case 2:
      handle = ((P2pListen_t)fns[op])(self, port, (int)nKept, nKept != 0 ? cfg : NULL);
      break;
    default:
      handle = ((P2pConnect_t)fns[op])(self, st, port, (int)nKept, nKept != 0 ? cfg : NULL);
      break;
  }
  memcpy(resp, &handle, 4);
  *respLen = 4;
  return 0;
}

/* Inserts into a bounded ring: skips a duplicate, otherwise overwrites the oldest. */
static void gl_p2p_ring_add(uint64_t *ring, unsigned cap, unsigned *next, unsigned *n, uint64_t v) {
  for (unsigned i = 0; i < *n; i++)
    if (ring[i] == v) return;
  ring[*next] = v;
  *next = (*next + 1) % cap;
  if (*n < cap) (*n)++;
}

/* Slot-6 serve time: remember the remote of each 1202 handed to the shim, in order.
 * `out` is the encoded [u32 count][i32 id][u32 cub][cub bytes] message. */
static void gl_p2p_note_served(const uint8_t *out, uint32_t n) {
  int32_t id;
  uint32_t cub;
  if (n != 12 + GL_CBQ_P2PSESSIONREQUEST_WIN_SIZE) return;
  memcpy(&id, out + 4, 4);
  memcpy(&cub, out + 8, 4);
  if (id != GL_CBQ_ID_P2P_SESSION_REQUEST || cub != GL_CBQ_P2PSESSIONREQUEST_WIN_SIZE) return;
  if (g_p2p_served_count == GL_P2P_SERVED_MAX) {
    g_p2p_served[g_p2p_served_head] = 0;
    g_p2p_served_head = (g_p2p_served_head + 1) % GL_P2P_SERVED_MAX;
    g_p2p_served_count--;
    g_p2p_served_skip++;
  }
  memcpy(&g_p2p_served[(g_p2p_served_head + g_p2p_served_count) % GL_P2P_SERVED_MAX], out + 12, 8);
  g_p2p_served_count++;
}

/* SendP2PPacket success: Steam implicitly accepts a peer the game sends to. */
static void gl_p2p_note_call(int ci, const uint8_t *args, uint32_t argLen) {
  if (ci < 0 || ci != bd_call_index(BD_ORDINAL_SteamNetworking006, BD_SLOT_SteamNetworking006_SendP2PPacket))
    return;
  if (args == NULL || argLen < 8) return;
  uint64_t remote;
  memcpy(&remote, args, 8);
  if (remote == 0) return;
  gl_p2p_ring_add(g_p2p_sent, GL_P2P_SENT_MAX, &g_p2p_sent_next, &g_p2p_sent_n, remote);
}

/* LobbyEnter with response 1: the game is in that lobby (membership is checked live). */
static void gl_p2p_note_lobby_from_mac(int32_t id, const uint8_t *mac) {
  int32_t resp;
  uint64_t lobby;
  if (id != GL_CBQ_ID_LOBBY_ENTER) return;
  memcpy(&resp, mac + GL_CBQ_LOBBYENTER_MAC_OFF_RESPONSE, 4);
  if (resp != 1) return;
  memcpy(&lobby, mac, 8);
  if (lobby == 0) return;
  gl_p2p_ring_add(g_p2p_lobbies, GL_P2P_LOBBY_MAX, &g_p2p_lobby_next, &g_p2p_lobby_n, lobby);
}

static int gl_p2p_allowed(uint64_t remote) {
  if (remote == 0) return 0;
  for (unsigned i = 0; i < g_p2p_sent_n; i++)
    if (g_p2p_sent[i] == remote) return 1;
  if (g_bd_self_steammatchmaking009 == NULL || g_bd_flat_SteamMatchMaking009_GetNumLobbyMembers == NULL ||
      g_bd_flat_SteamMatchMaking009_GetLobbyMemberByIndex == NULL)
    return 0;
  for (unsigned l = 0; l < g_p2p_lobby_n; l++) {
    int32_t cnt = g_bd_flat_SteamMatchMaking009_GetNumLobbyMembers(g_bd_self_steammatchmaking009, g_p2p_lobbies[l]);
    if (cnt < 0) cnt = 0;
    if (cnt > GL_P2P_LOBBY_MEMBERS_MAX) cnt = GL_P2P_LOBBY_MEMBERS_MAX;
    for (int32_t i = 0; i < cnt; i++)
      if (g_bd_flat_SteamMatchMaking009_GetLobbyMemberByIndex(g_bd_self_steammatchmaking009,
                                                                g_p2p_lobbies[l], i) == remote)
        return 1;
  }
  return 0;
}

/* M-04 fallback (58-REVIEW WR-07): the shim reported a 1202 with no listener
 * (ndispatched 0, held 0). Accept the remote of THAT 1202, and only if the game
 * already sends to it or shares a live lobby with it (Steam's implicit-accept
 * rule). Helper-originated: logged as src=helper, fixed strings only, never
 * counted as evidence. */
static void gl_p2p_fallback_accept(uint64_t remote) {
  static int accepted_logs = 0, refused_logs = 0;
  if (g_bd_self_steamnetworking006 == NULL || g_bd_flat_SteamNetworking006_AcceptP2PSessionWithUser == NULL)
    return;
  if (gl_p2p_allowed(remote)) {
    (void)g_bd_flat_SteamNetworking006_AcceptP2PSessionWithUser(g_bd_self_steamnetworking006, remote);
    if (accepted_logs < GL_P2P_LOG_MAX) {
      accepted_logs++;
      logts("CBQ", "p2p-accept src=helper");
    }
  } else if (refused_logs < GL_P2P_LOG_MAX) {
    refused_logs++;
    logts("CBQ", "p2p-accept src=helper action=refused");
  }
}

/* Every validated 1202 report pops exactly one served remote (skip first). */
static void gl_p2p_on_report(uint32_t dn, uint32_t dheld) {
  uint64_t remote;
  if (g_p2p_served_skip > 0) {
    g_p2p_served_skip--;
    return;
  }
  if (g_p2p_served_count == 0) return;
  remote = g_p2p_served[g_p2p_served_head];
  g_p2p_served[g_p2p_served_head] = 0;
  g_p2p_served_head = (g_p2p_served_head + 1) % GL_P2P_SERVED_MAX;
  g_p2p_served_count--;
  if (dn == 0 && dheld == 0) gl_p2p_fallback_accept(remote);
  remote = 0;
}

/* Records a join seen by the pump (latest wins); resolved by the shim's slot-10
 * report for the same id. `mac` is the raw Mac buffer, size already checked. */
static void gl_note_join_from_mac(int32_t id, const uint8_t *mac) {
  if (id == GL_CBQ_ID_LOBBY_ENTER) {
    int32_t resp;
    memcpy(&resp, mac + GL_CBQ_LOBBYENTER_MAC_OFF_RESPONSE, 4);
    if (resp == 1) {
      g_join_note.valid = 1;
      g_join_note.id = id;
      g_join_note.path = GL_NET_PATH_UNKNOWN;
    }
  } else if (id == GL_CBQ_ID_NET_CONN_STATUS_CHANGED) {
    int32_t state, old, flags;
    memcpy(&state, mac + GL_CBQ_NETCONNSTATUS_MAC_OFF_ESTATE, 4);
    memcpy(&old, mac + GL_CBQ_NETCONNSTATUS_MAC_OFF_OLDSTATE, 4);
    memcpy(&flags, mac + GL_CBQ_NETCONNSTATUS_MAC_OFF_NFLAGS, 4);
    if (state == 3 && old != 3) {
      g_join_note.valid = 1;
      g_join_note.id = id;
      g_join_note.path = (flags & 16) ? GL_NET_PATH_RELAYED : GL_NET_PATH_UNKNOWN;
    }
  }
}

/* Runs one manual-dispatch frame and moves allowlisted callbacks into the
 * ring. Bounded to GL_CBQ_PUMP_MAX_MSGS messages. FreeLastCallback is ALWAYS
 * called after a true GetNextCallback (SDK contract). Never logs or copies
 * callback bytes anywhere but the ring (and the 1101 cache, which carries no
 * credential).
 *
 * 1101 (Mac struct: 20 bytes, pack 4) is NEVER offered raw: it goes through
 * gl_stats_on_observed, which repacks it to the 24-byte wire form first. Our
 * own RequestUserStats call result arrives as a 703 SteamAPICallCompleted_t
 * and its payload is fetched BEFORE the (single, unconditional) free below. */
static void gl_manual_pump_into_ring(void) {
  if (!g_manual_dispatch) return;
  g_md_run_frame(g_hpipe);
  for (int i = 0; i < GL_CBQ_PUMP_MAX_MSGS; i++) {
    gl_CallbackMsg_t msg;
    memset(&msg, 0, sizeof msg);
    if (!g_md_get_next(g_hpipe, &msg)) break;
    if (msg.m_iCallback == GL_CBQ_ID_USER_STATS_RECEIVED) {
      int32_t result = 0;
      if (msg.m_pubParam != NULL && msg.m_cubParam == GL_CBQ_USR_MAC_SIZE)
        memcpy(&result, msg.m_pubParam + 8, 4);
      int rc = gl_stats_on_observed(&g_stats, &g_cbq, msg.m_pubParam, msg.m_cubParam, g_appid_u64);
      gl_log_stats_obs(0, rc, result);
    } else if (msg.m_iCallback == GL_CBQ_ID_API_CALL_COMPLETED) {
      // 703 is handled wholly here: our own stats call, a tracked call result
      // (58-07), or ignored. Never offered to the ring or counted as unlisted.
      if (msg.m_pubParam != NULL && msg.m_cubParam == (int32_t)sizeof(gl_SteamAPICallCompleted_t) &&
          g_md_get_api_call_result != NULL) {
        gl_SteamAPICallCompleted_t done;
        memcpy(&done, msg.m_pubParam, sizeof done);
        int32_t crId = gl_cr_lookup(&g_cr, done.m_hAsyncCall);
        if (g_stats.pending_call != 0 && done.m_hAsyncCall == g_stats.pending_call &&
            done.m_iCallback == GL_CBQ_ID_USER_STATS_RECEIVED &&
            done.m_cubParam == GL_CBQ_USR_MAC_SIZE) {
          uint8_t buf[GL_CBQ_USR_MAC_SIZE];
          bool failed = false;
          memset(buf, 0, sizeof buf);
          bool got = g_md_get_api_call_result(g_hpipe, done.m_hAsyncCall, buf,
                                              (int)sizeof buf, GL_CBQ_ID_USER_STATS_RECEIVED, &failed);
          if (got && !failed) {
            int32_t result = 0;
            memcpy(&result, buf + 8, 4);
            int rc = gl_stats_on_observed(&g_stats, &g_cbq, buf, (int32_t)sizeof buf, g_appid_u64);
            gl_log_stats_obs(1, rc, result);
          } else {
            if (g_cbq_stats_logged < 32) {
              g_cbq_stats_logged++;
              logts_f("CBQ", "stats iCallback=1101 src=callresult failed=1");
            }
            // Leave `pending` set so a broadcast 1101 still satisfies the request.
            g_stats.pending_call = 0;
          }
          gl_cbq_secure_zero(buf, sizeof buf);
        } else if (crId != 0) {
          // Fetch BEFORE the single unconditional free below, with the MAC size
          // of the expected struct (a wrong size makes Steam refuse the fetch).
          uint32_t macSize = gl_cr_mac_size(crId);
          uint8_t buf[64];
          bool failed = false;
          memset(buf, 0, sizeof buf);
          if (macSize == 0 || macSize > sizeof buf || done.m_iCallback != crId ||
              done.m_cubParam != macSize) {
            gl_cr_untrack(&g_cr, done.m_hAsyncCall);
            if (gl_logbudget_take(&g_cr_done_budget, crId, 1) == 1)
              logts_f("CBQ", "callresult iCallback=%d action=mismatch", (int)crId);
          } else {
            bool got = g_md_get_api_call_result(g_hpipe, done.m_hAsyncCall, buf,
                                                (int)macSize, crId, &failed);
            if (got && !failed) {
              if (gl_cr_complete(&g_cr, done.m_hAsyncCall, buf, macSize, 0)) {
                gl_note_join_from_mac(crId, buf);
                if (gl_logbudget_take(&g_cr_done_budget, crId, 1) == 1)
                  logts_f("CBQ", "callresult iCallback=%d failed=%d cub=%u", (int)crId, 0,
                          (unsigned)macSize);
              }
            } else {
              if (gl_cr_complete(&g_cr, done.m_hAsyncCall, NULL, 0, 1) &&
                  gl_logbudget_take(&g_cr_done_budget, crId, 1) == 1)
                logts_f("CBQ", "callresult iCallback=%d failed=%d cub=%u", (int)crId, 1,
                        (unsigned)macSize);
            }
          }
          gl_cbq_secure_zero(buf, sizeof buf);
        }
      }
    } else {
      const gl_cbq_allow_row *row = gl_cbq_row(msg.m_iCallback);
      int queued = 0;
      if (row == NULL) {
        if (gl_cbq_note_unlisted(msg.m_iCallback)) {
          if (gl_cr_allowed_size(msg.m_iCallback) != 0)
            logts_f("CBQ", "unlisted iCallback=%d action=drop callresult=1", (int)msg.m_iCallback);
          else
            logts_f("CBQ", "unlisted iCallback=%d action=drop callresult=0", (int)msg.m_iCallback);
        }
      } else if (msg.m_pubParam != NULL && msg.m_cubParam > 0 &&
                 (uint32_t)msg.m_cubParam == row->macSize) {
        // Repack Mac -> MSVC wire form before queueing (RESEARCH Pitfall 7).
        uint8_t win[GL_CBQ_MAX_PARAM_BYTES];
        gl_cbq_repack_fields(msg.m_pubParam, win, row);
        queued = gl_cbq_offer(&g_cbq, msg.m_iCallback, win, (int32_t)row->winSize);
        if (msg.m_iCallback == GL_CBQ_ID_LOBBY_ENTER) gl_p2p_note_lobby_from_mac(msg.m_iCallback, msg.m_pubParam);
        if (queued) gl_note_join_from_mac(msg.m_iCallback, msg.m_pubParam);
        gl_cbq_secure_zero(win, sizeof win);
      } else {
        g_cbq.dropped_filtered++;
      }
      if (row != NULL && gl_logbudget_take(&g_cbq_budget, msg.m_iCallback, 4) == 1) {
        if (queued)
          logts_f("CBQ", "queued iCallback=%d cub=%d", (int)msg.m_iCallback, (int)row->winSize);
        else
          logts_f("CBQ", "dropped iCallback=%d cub=%d", (int)msg.m_iCallback, (int)msg.m_cubParam);
      }
    }
    g_md_free_last(g_hpipe);
  }
}

// === Persistent-connection framing I/O (58-35: one thread, one poll() loop
// over a bounded connection table; see gl_serve_forever below) ===

/* WR-05: an EINTR-interrupted send()
 * is retried, not treated as a closed connection. WR-03: SIGPIPE is
 * ignored process-wide at startup (main()), so a send() to a peer that has
 * already closed its end returns -1/EPIPE here (handled like any other
 * terminal send error) instead of raising SIGPIPE and killing this
 * helper. */
// 58-35: set by send_all on any terminal failure (including an SO_SNDTIMEO
// EAGAIN) so the serving loop can close just that connection; the ~48
// send_response call sites ignore the return value and need no edits.
static int g_send_failed = 0;

static int send_all(int fd, const void *buf, size_t len) {
  const uint8_t *p = (const uint8_t *)buf;
  size_t sent = 0;
  while (sent < len) {
    ssize_t k = send(fd, p + sent, len - sent, 0);
    if (k < 0) {
      if (errno == EINTR) continue;
      g_send_failed = 1;
      return 0;
    }
    if (k == 0) { g_send_failed = 1; return 0; }
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

// WR-03: the launch secret, copied from env at startup, then scrubbed in place and unsetenv'd.
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

/* ===== Phase 58 (58-20): server-browser response relay (helper half) =====
 * The helper never calls a Windows vtable. It hands Mac Steam its OWN C response
 * objects (Itanium ABI: an object whose first word points at an array of
 * function pointers); their callbacks push events onto g_mms and the shim drains
 * them over CONTROL slot 12. The shim half is 58-21.
 *
 * Ping, players, rules and friends callbacks carry no query handle, so each
 * query takes one object from a small pool (GL_MMS_POOL per interface) and the
 * object remembers the HServerQuery it was bound to. A bound object is never
 * recycled (58-30, WR-03): a full pool refuses the new query (HSERVERQUERY_INVALID)
 * and CancelServerQuery frees the binding. Objects are static, so a late
 * callback never touches freed memory. No game-supplied pointer is ever accepted: the
 * custom request encodings carry only integers and 256-byte string slots. */
/* Equals GL_MMS_MAP_CAP, the shim's 64-entry server-browser map (meta/gen_vtables.ts). */
#define GL_MMS_POOL 64
#define GL_MMS_FILTER_MAX 32
#define GL_MMS_FILTER_BYTES 256
#define GL_MMS_ISSUED_MAX 64
enum { GL_MMS_G_PING = 0, GL_MMS_G_PLAYERS, GL_MMS_G_RULES, GL_MMS_G_FRIENDS, GL_MMS_G_COUNT };

typedef struct { const void *const *vt; uint32_t idx; } gl_mms_obj;
typedef struct { int used; int32_t handle; } gl_mms_bind;

static gl_mms_ring g_mms;
static gl_mms_obj  g_mms_obj[GL_MMS_G_COUNT][GL_MMS_POOL];
static gl_mms_bind g_mms_bind[GL_MMS_G_COUNT][GL_MMS_POOL];
static uint64_t    g_mms_issued[GL_MMS_ISSUED_MAX];

/* Pool slot of `o` in `group`, or -1 when it is not one of that group's objects. */
static int gl_mms_slot_of(int group, const void *o) {
  const gl_mms_obj *base = g_mms_obj[group];
  if ((const gl_mms_obj *)o < base || (const gl_mms_obj *)o >= base + GL_MMS_POOL) return -1;
  return (int)((const gl_mms_obj *)o - base);
}

/* Event handle for a pooled object (0 when unbound). */
static uint32_t gl_mms_obj_handle(int group, int slot) {
  return g_mms_bind[group][slot].used ? (uint32_t)g_mms_bind[group][slot].handle : 0u;
}

static void gl_mms_obj_release(int group, int slot) {
  memset(&g_mms_bind[group][slot], 0, sizeof g_mms_bind[group][slot]);
}

/* Takes a free pool object, or returns -1 when every object is bound. */
static int gl_mms_obj_acquire(int group) {
  for (int i = 0; i < GL_MMS_POOL; i++) {
    if (!g_mms_bind[group][i].used) {
      g_mms_bind[group][i].used = 1;
      g_mms_bind[group][i].handle = 0;
      return i;
    }
  }
  return -1;
}

/* ---- list response (ISteamMatchmakingServerListResponse, 3 slots) ---- */
static void gl_mms_cb_list_responded(void *self, void *hRequest, int iServer) {
  (void)self;
  gl_mms_ev_push(&g_mms, GL_MMS_EV_LIST_RESPONDED, (uint32_t)(uintptr_t)hRequest, iServer, 0, NULL, 0);
}
static void gl_mms_cb_list_failed(void *self, void *hRequest, int iServer) {
  (void)self;
  gl_mms_ev_push(&g_mms, GL_MMS_EV_LIST_FAILED, (uint32_t)(uintptr_t)hRequest, iServer, 0, NULL, 0);
}
static void gl_mms_cb_list_complete(void *self, void *hRequest, int response) {
  (void)self;
  gl_mms_ev_push(&g_mms, GL_MMS_EV_LIST_COMPLETE, (uint32_t)(uintptr_t)hRequest, 0, response, NULL, 0);
}
static const void *const gl_mms_list_vt[3] = {(const void *)gl_mms_cb_list_responded,
                                              (const void *)gl_mms_cb_list_failed,
                                              (const void *)gl_mms_cb_list_complete};
static gl_mms_obj g_mms_list_obj = {gl_mms_list_vt, 0};

/* ---- ping response (2 slots) ---- */
static void gl_mms_cb_ping_responded(void *self, const void *item) {
  int s = gl_mms_slot_of(GL_MMS_G_PING, self);
  uint8_t win[GL_MMS_GSI_SIZE];
  if (s < 0 || item == NULL) return;
  gl_mms_gsi_repack((const uint8_t *)item, win);
  gl_mms_ev_push(&g_mms, GL_MMS_EV_PING_RESPONDED, gl_mms_obj_handle(GL_MMS_G_PING, s), 0, 0, win, sizeof win);
  gl_cbq_secure_zero(win, sizeof win);
  gl_mms_obj_release(GL_MMS_G_PING, s);
}
static void gl_mms_cb_ping_failed(void *self) {
  int s = gl_mms_slot_of(GL_MMS_G_PING, self);
  if (s < 0) return;
  gl_mms_ev_push(&g_mms, GL_MMS_EV_PING_FAILED, gl_mms_obj_handle(GL_MMS_G_PING, s), 0, 0, NULL, 0);
  gl_mms_obj_release(GL_MMS_G_PING, s);
}
static const void *const gl_mms_ping_vt[2] = {(const void *)gl_mms_cb_ping_responded,
                                              (const void *)gl_mms_cb_ping_failed};

/* ---- players response (3 slots) ---- */
static void gl_mms_cb_players_add(void *self, const char *name, int score, float timePlayed) {
  int s = gl_mms_slot_of(GL_MMS_G_PLAYERS, self);
  int32_t bits;
  if (s < 0) return;
  memcpy(&bits, &timePlayed, 4);
  gl_mms_ev_push_strs(&g_mms, GL_MMS_EV_PLAYERS_ADD, gl_mms_obj_handle(GL_MMS_G_PLAYERS, s), bits, score,
                      name, NULL);
}
static void gl_mms_cb_players_failed(void *self) {
  int s = gl_mms_slot_of(GL_MMS_G_PLAYERS, self);
  if (s < 0) return;
  gl_mms_ev_push(&g_mms, GL_MMS_EV_PLAYERS_FAILED, gl_mms_obj_handle(GL_MMS_G_PLAYERS, s), 0, 0, NULL, 0);
  gl_mms_obj_release(GL_MMS_G_PLAYERS, s);
}
static void gl_mms_cb_players_done(void *self) {
  int s = gl_mms_slot_of(GL_MMS_G_PLAYERS, self);
  if (s < 0) return;
  gl_mms_ev_push(&g_mms, GL_MMS_EV_PLAYERS_DONE, gl_mms_obj_handle(GL_MMS_G_PLAYERS, s), 0, 0, NULL, 0);
  gl_mms_obj_release(GL_MMS_G_PLAYERS, s);
}
static const void *const gl_mms_players_vt[3] = {(const void *)gl_mms_cb_players_add,
                                                 (const void *)gl_mms_cb_players_failed,
                                                 (const void *)gl_mms_cb_players_done};

/* ---- rules response (3 slots) ---- */
static void gl_mms_cb_rules_responded(void *self, const char *rule, const char *value) {
  int s = gl_mms_slot_of(GL_MMS_G_RULES, self);
  if (s < 0) return;
  gl_mms_ev_push_strs(&g_mms, GL_MMS_EV_RULES_RESPONDED, gl_mms_obj_handle(GL_MMS_G_RULES, s), 0, 0, rule,
                      value != NULL ? value : "");
}
static void gl_mms_cb_rules_failed(void *self) {
  int s = gl_mms_slot_of(GL_MMS_G_RULES, self);
  if (s < 0) return;
  gl_mms_ev_push(&g_mms, GL_MMS_EV_RULES_FAILED, gl_mms_obj_handle(GL_MMS_G_RULES, s), 0, 0, NULL, 0);
  gl_mms_obj_release(GL_MMS_G_RULES, s);
}
static void gl_mms_cb_rules_done(void *self) {
  int s = gl_mms_slot_of(GL_MMS_G_RULES, self);
  if (s < 0) return;
  gl_mms_ev_push(&g_mms, GL_MMS_EV_RULES_DONE, gl_mms_obj_handle(GL_MMS_G_RULES, s), 0, 0, NULL, 0);
  gl_mms_obj_release(GL_MMS_G_RULES, s);
}
static const void *const gl_mms_rules_vt[3] = {(const void *)gl_mms_cb_rules_responded,
                                               (const void *)gl_mms_cb_rules_failed,
                                               (const void *)gl_mms_cb_rules_done};

/* ---- server-friends response ----
 * The callback shape of ServerFriends is not measured, so every one of four
 * slots only records which slot Mac Steam called (value); arguments are never
 * read. Four slots bound the damage of a wider real vtable to a harmless no-op. */
static void gl_mms_friends_note(void *self, int32_t which) {
  int s = gl_mms_slot_of(GL_MMS_G_FRIENDS, self);
  if (s < 0) return;
  gl_mms_ev_push(&g_mms, GL_MMS_EV_FRIENDS, gl_mms_obj_handle(GL_MMS_G_FRIENDS, s), 0, which, NULL, 0);
}
static void gl_mms_cb_friends0(void *self) { gl_mms_friends_note(self, 0); }
static void gl_mms_cb_friends1(void *self) { gl_mms_friends_note(self, 1); }
static void gl_mms_cb_friends2(void *self) { gl_mms_friends_note(self, 2); }
static void gl_mms_cb_friends3(void *self) { gl_mms_friends_note(self, 3); }
static const void *const gl_mms_friends_vt[4] = {(const void *)gl_mms_cb_friends0,
                                                 (const void *)gl_mms_cb_friends1,
                                                 (const void *)gl_mms_cb_friends2,
                                                 (const void *)gl_mms_cb_friends3};

static int g_mms_objs_ready = 0;
static void gl_mms_objs_init(void) {
  if (g_mms_objs_ready) return;
  const void *const *vts[GL_MMS_G_COUNT] = {gl_mms_ping_vt, gl_mms_players_vt, gl_mms_rules_vt,
                                            gl_mms_friends_vt};
  for (int g = 0; g < GL_MMS_G_COUNT; g++)
    for (uint32_t i = 0; i < GL_MMS_POOL; i++) {
      g_mms_obj[g][i].vt = vts[g];
      g_mms_obj[g][i].idx = i;
    }
  g_mms_objs_ready = 1;
}

static void *gl_mms_sym(const char *name) { return gl_nets_sym(name); }

/* Records a freshly issued list handle in the first free slot. Returns 1 when kept
 * and 0 when refused (collision, or no free slot). ReleaseRequest frees the slot. A handle whose low
 * 32 bits equal another live handle's (but is not the same handle) is refused:
 * slot 12 events name a request by its low 32 bits. */
static int gl_mms_issue(uint64_t h) {
  for (uint32_t i = 0; i < GL_MMS_ISSUED_MAX; i++) {
    if (g_mms_issued[i] == h) return 1;
    if (g_mms_issued[i] != 0 && (uint32_t)g_mms_issued[i] == (uint32_t)h) return 0;
  }
  for (uint32_t i = 0; i < GL_MMS_ISSUED_MAX; i++) {
    if (g_mms_issued[i] == 0) {
      g_mms_issued[i] = h;
      return 1;
    }
  }
  return 0; /* set full: refuse rather than evict a live request (58-30, WR-04) */
}

static int gl_mms_is_issued(uint64_t h) {
  if (h == 0) return 0;
  for (uint32_t i = 0; i < GL_MMS_ISSUED_MAX; i++)
    if (g_mms_issued[i] == h) return 1;
  return 0;
}

/* The six Request*ServerList variants. Request (exact length):
 * [u32 variant 0..5 = Internet, LAN, Friends, Favorites, History, Spectator]
 * [u32 appId][u32 nFilters <= 32] then nFilters x ([256 key][256 value]), each
 * slot holding a NUL inside its 256 bytes. LAN takes no filters. Response: [u64
 * Mac HServerListRequest] (0 = Mac Steam refused). */
int gl_mms_request_list(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                        uint32_t respCap, uint32_t *respLen) {
  static const char *const names[6] = {
      "SteamAPI_ISteamMatchmakingServers_RequestInternetServerList",
      "SteamAPI_ISteamMatchmakingServers_RequestLANServerList",
      "SteamAPI_ISteamMatchmakingServers_RequestFriendsServerList",
      "SteamAPI_ISteamMatchmakingServers_RequestFavoritesServerList",
      "SteamAPI_ISteamMatchmakingServers_RequestHistoryServerList",
      "SteamAPI_ISteamMatchmakingServers_RequestSpectatorServerList"};
  typedef void *(*Req_t)(void *, uint32_t, void *, uint32_t, void *);
  typedef void *(*Lan_t)(void *, uint32_t, void *);
  static void *fn[6];
  uint32_t variant, appId, nFilters;
  *respLen = 0;
  if (args == NULL || resp == NULL || self == NULL || argLen < 12 || respCap < 8) return 1;
  memcpy(&variant, args, 4);
  memcpy(&appId, args + 4, 4);
  memcpy(&nFilters, args + 8, 4);
  if (variant > 5 || nFilters > GL_MMS_FILTER_MAX) return 1;
  if (argLen != 12u + nFilters * 2u * GL_MMS_FILTER_BYTES) return 1;
  if (variant == 1 && nFilters != 0) return 1;
  for (uint32_t i = 0; i < nFilters * 2u; i++)
    if (memchr(args + 12 + i * GL_MMS_FILTER_BYTES, 0, GL_MMS_FILTER_BYTES) == NULL) return 1;
  if (fn[variant] == NULL) fn[variant] = gl_mms_sym(names[variant]);
  if (fn[variant] == NULL) return 1;
  /* MatchMakingKeyValuePair_t is two 256-byte char arrays; ppchFilters points at
   * a pointer to the contiguous array. */
  static uint8_t filters[GL_MMS_FILTER_MAX * 2 * GL_MMS_FILTER_BYTES];
  void *pFilters = filters;
  memset(filters, 0, sizeof filters);
  if (nFilters != 0) memcpy(filters, args + 12, (size_t)nFilters * 2u * GL_MMS_FILTER_BYTES);
  void *h = (variant == 1) ? ((Lan_t)fn[1])(self, appId, &g_mms_list_obj)
                           : ((Req_t)fn[variant])(self, appId, &pFilters, nFilters, &g_mms_list_obj);
  uint64_t out = (uint64_t)(uintptr_t)h;
  if (out != 0 && !gl_mms_issue(out)) {
    typedef void (*Rel_t)(void *, void *);
    Rel_t rel = (Rel_t)gl_mms_sym("SteamAPI_ISteamMatchmakingServers_ReleaseRequest");
    if (rel != NULL) rel(self, h);
    out = 0;
  }
  memcpy(resp, &out, 8);
  *respLen = 8;
  return 0;
}

/* Shared body of the four per-server queries. Request (exact length): [u32 ip]
 * [u32 port <= 65535]. Response: [i32 HServerQuery] (-1 = invalid). */
static int gl_mms_query(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                        uint32_t respCap, uint32_t *respLen, int group, const char *symName) {
  typedef int32_t (*Q_t)(void *, uint32_t, uint16_t, void *);
  static void *fn[GL_MMS_G_COUNT];
  uint32_t ip, port;
  *respLen = 0;
  if (args == NULL || resp == NULL || self == NULL || argLen != 8 || respCap < 4) return 1;
  memcpy(&ip, args, 4);
  memcpy(&port, args + 4, 4);
  if (port > 65535u) return 1;
  if (fn[group] == NULL) fn[group] = gl_mms_sym(symName);
  if (fn[group] == NULL) return 1;
  gl_mms_objs_init();
  int slot = gl_mms_obj_acquire(group);
  int32_t q;
  if (slot < 0) {
    q = -1; /* every pool object is bound to a live query: refuse, never recycle */
    memcpy(resp, &q, 4);
    *respLen = 4;
    return 0;
  }
  q = ((Q_t)fn[group])(self, ip, (uint16_t)port, &g_mms_obj[group][slot]);
  if (q == -1) {
    gl_mms_obj_release(group, slot);
  } else {
    g_mms_bind[group][slot].handle = q;
  }
  memcpy(resp, &q, 4);
  *respLen = 4;
  return 0;
}

/* helperCustom for CancelServerQuery. Request [i32 hServerQuery]; no response.
 * Forwards to Mac, then frees the pool binding for that handle. */
int gl_mms_cancel_server_query(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                               uint32_t respCap, uint32_t *respLen) {
  typedef void (*C_t)(void *, int32_t);
  static C_t fn;
  int32_t q;
  (void)resp; (void)respCap;
  *respLen = 0;
  if (args == NULL || self == NULL || argLen != 4) return 1;
  memcpy(&q, args, 4);
  if (fn == NULL) fn = (C_t)gl_mms_sym("SteamAPI_ISteamMatchmakingServers_CancelServerQuery");
  if (fn == NULL) return 1;
  fn(self, q);
  for (int g = 0; g < GL_MMS_G_COUNT; g++)
    for (int i = 0; i < GL_MMS_POOL; i++)
      if (g_mms_bind[g][i].used && g_mms_bind[g][i].handle == q) gl_mms_obj_release(g, i);
  return 0;
}

/* helperCustom for ReleaseRequest. Request [u64 hRequest]; no response.
 * Forwards to Mac, then forgets the handle so its details are no longer served. */
int gl_mms_release_request(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                           uint32_t respCap, uint32_t *respLen) {
  typedef void (*R_t)(void *, void *);
  static R_t fn;
  uint64_t h;
  (void)resp; (void)respCap;
  *respLen = 0;
  if (args == NULL || self == NULL || argLen != 8) return 1;
  memcpy(&h, args, 8);
  if (fn == NULL) fn = (R_t)gl_mms_sym("SteamAPI_ISteamMatchmakingServers_ReleaseRequest");
  if (fn == NULL) return 1;
  fn(self, (void *)(uintptr_t)h);
  if (h != 0)
    for (uint32_t i = 0; i < GL_MMS_ISSUED_MAX; i++)
      if (g_mms_issued[i] == h) g_mms_issued[i] = 0;
  return 0;
}

int gl_mms_ping_server(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                       uint32_t respCap, uint32_t *respLen) {
  return gl_mms_query(self, args, argLen, resp, respCap, respLen, GL_MMS_G_PING,
                      "SteamAPI_ISteamMatchmakingServers_PingServer");
}
int gl_mms_player_details(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                          uint32_t respCap, uint32_t *respLen) {
  return gl_mms_query(self, args, argLen, resp, respCap, respLen, GL_MMS_G_PLAYERS,
                      "SteamAPI_ISteamMatchmakingServers_PlayerDetails");
}
int gl_mms_server_rules(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                        uint32_t respCap, uint32_t *respLen) {
  return gl_mms_query(self, args, argLen, resp, respCap, respLen, GL_MMS_G_RULES,
                      "SteamAPI_ISteamMatchmakingServers_ServerRules");
}
int gl_mms_server_friends(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                          uint32_t respCap, uint32_t *respLen) {
  return gl_mms_query(self, args, argLen, resp, respCap, respLen, GL_MMS_G_FRIENDS,
                      "SteamAPI_ISteamMatchmakingServers_ServerFriends");
}

/* GetServerDetails. Request (exact length 12): [u64 hRequest][i32 iServer]. The
 * handle must be one this helper issued and iServer must be inside the Mac
 * server count. Response: [u32 present 0|1][380 bytes gameserveritem_t]
 * (zero-filled when not present). */
int gl_mms_get_server_details(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                              uint32_t respCap, uint32_t *respLen) {
  typedef const uint8_t *(*Det_t)(void *, void *, int32_t);
  typedef int32_t (*Cnt_t)(void *, void *);
  static Det_t det;
  static Cnt_t cnt;
  uint64_t h;
  int32_t iServer;
  *respLen = 0;
  if (args == NULL || resp == NULL || self == NULL || argLen != 12 || respCap < 4u + GL_MMS_GSI_SIZE)
    return 1;
  memcpy(&h, args, 8);
  memcpy(&iServer, args + 8, 4);
  if (det == NULL) det = (Det_t)gl_mms_sym("SteamAPI_ISteamMatchmakingServers_GetServerDetails");
  if (cnt == NULL) cnt = (Cnt_t)gl_mms_sym("SteamAPI_ISteamMatchmakingServers_GetServerCount");
  if (det == NULL || cnt == NULL) return 1;
  memset(resp, 0, 4u + GL_MMS_GSI_SIZE);
  *respLen = 4u + GL_MMS_GSI_SIZE;
  if (!gl_mms_is_issued(h) || iServer < 0 || iServer >= cnt(self, (void *)(uintptr_t)h)) return 0;
  const uint8_t *item = det(self, (void *)(uintptr_t)h, iServer);
  if (item == NULL) return 0;
  uint32_t one = 1;
  memcpy(resp, &one, 4);
  gl_mms_gsi_repack(item, resp + 4);
  return 0;
}

/* === 58-29: invite path ====================================================
 * The game's "+" control calls ActivateGameOverlayInviteDialog(lobby), which
 * Mac Steam cannot show for a Wine game. The helper keeps that lobby (set ONLY
 * by the game's own call, never by a wire request carrying an id) and exposes
 * an authenticated friend snapshot plus an invite action to GameLib's own UI.
 * This helper is single-threaded (one accept loop, see main), so this state
 * needs no mutex. SteamIDs and the lobby id are never logged. */

#define GL_INVITE_FRIENDS_MAX 100u
#define GL_INVITE_NAME_MAX 128u
#define GL_INVITE_EXPIRY_MS 600000ull
#define GL_INVITE_DIALOG_LOG_GAP_MS 2000ull
#define GL_INVITE_FRIENDS_RESP_MAX (4u + GL_INVITE_FRIENDS_MAX * (8u + GL_INVITE_NAME_MAX))

static uint64_t g_invite_lobby = 0;
static uint64_t g_invite_born_ms = 0;
static unsigned g_invite_dialog_logged = 0;
static uint64_t g_invite_last_log_ms = 0;
static uint64_t g_friend_snapshot[GL_INVITE_FRIENDS_MAX];
static uint32_t g_friend_snapshot_n = 0;
static int g_friend_snapshot_taken = 0;
/* 58 WR-04: the "ordinal" on the wire is an opaque per-snapshot token,
 * (generation << GL_INVITE_TOKEN_IDX_BITS) | index. Every list call bumps the
 * generation, so an invite carrying a token from an older rendered list is
 * refused as bad-ordinal instead of indexing a re-ordered snapshot and
 * inviting someone else. No SteamID leaves the helper. */
#define GL_INVITE_TOKEN_IDX_BITS 8u
#define GL_INVITE_TOKEN_IDX_MASK ((1u << GL_INVITE_TOKEN_IDX_BITS) - 1u)
#define GL_INVITE_TOKEN_GEN_MASK (0xFFFFFFFFu >> GL_INVITE_TOKEN_IDX_BITS)
_Static_assert(GL_INVITE_FRIENDS_MAX <= (1u << GL_INVITE_TOKEN_IDX_BITS), "friend index must fit the token");
static uint32_t g_friend_snapshot_gen = 0;

static uint64_t gl_invite_now_ms(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (uint64_t)ts.tv_sec * 1000ull + (uint64_t)ts.tv_nsec / 1000000ull;
}

/* helperCustom for SteamFriends017.ActivateGameOverlayInviteDialog. Request
 * (generic encoding): [u64 steamIDLobby]. Void response. */
int gl_friends_invite_dialog(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp,
                             uint32_t respCap, uint32_t *respLen) {
  uint64_t lobby;
  uint64_t now;
  (void)resp; (void)respCap;
  *respLen = 0;
  if (args == NULL || argLen != 8) return 1;
  if (self == NULL || g_bd_flat_SteamFriends017_ActivateGameOverlayInviteDialog == NULL) return 1;
  memcpy(&lobby, args, 8);
  now = gl_invite_now_ms();
  g_invite_lobby = lobby;
  g_invite_born_ms = now;
  g_bd_flat_SteamFriends017_ActivateGameOverlayInviteDialog(self, lobby);
  /* This line is the backend's picker trigger (helperProcess.ts), not just a
   * log line, so it is never capped by count: every call past the 2 s gap
   * emits it. The gap (plus the backend's own debounce) bounds the volume. */
  if (!g_invite_dialog_logged || now - g_invite_last_log_ms >= GL_INVITE_DIALOG_LOG_GAP_MS) {
    g_invite_dialog_logged = 1;
    g_invite_last_log_ms = now;
    logts_f("INVITE", "dialog appid=%s", g_appid);
  }
  return 0;
}

/* Record-only lobby-shape measurement: integer arguments, never the lobby id.
 * CreateLobby [u32 type][i32 max]; SetLobbyType [u64 lobby][u32 type];
 * SetLobbyJoinable [u64 lobby][i32 value]. Each op logs at most 4 lines. */
static void gl_mms_lobby_log(int ci, const uint8_t *args, uint32_t argLen) {
  static unsigned n[3];
  int32_t a = 0, b = 0;
  if (ci < 0 || args == NULL) return;
  if (ci == bd_call_index(BD_ORDINAL_SteamMatchMaking009, BD_SLOT_SteamMatchMaking009_CreateLobby)) {
    if (argLen < 8 || n[0] >= 4) return;
    n[0]++;
    memcpy(&a, args, 4);
    memcpy(&b, args + 4, 4);
    logts_f("MMS", "lobby op=create type=%d max=%d", (int)a, (int)b);
  } else if (ci == bd_call_index(BD_ORDINAL_SteamMatchMaking009, BD_SLOT_SteamMatchMaking009_SetLobbyType)) {
    if (argLen < 12 || n[1] >= 4) return;
    n[1]++;
    memcpy(&a, args + 8, 4);
    logts_f("MMS", "lobby op=set-type type=%d", (int)a);
  } else if (ci == bd_call_index(BD_ORDINAL_SteamMatchMaking009, BD_SLOT_SteamMatchMaking009_SetLobbyJoinable)) {
    if (argLen < 12 || n[2] >= 4) return;
    n[2]++;
    memcpy(&a, args + 8, 4);
    logts_f("MMS", "lobby op=set-joinable value=%d", (int)a);
  }
}

/* Slot 13. Response: [u32 count] then per friend
 * [u32 ordinal (58 WR-04: per-snapshot token)][u8 online][u8 playingThisApp][u16 nameLen][name]. Returns 0 on
 * success, 1 when Mac Steam's friends API is unavailable. */
static int gl_invite_list_friends(void *friendsSelf, uint8_t *out, uint32_t cap, uint32_t *outLen) {
  typedef int (*Count_t)(void *, int);
  typedef uint64_t (*ByIdx_t)(void *, int, int);
  typedef int (*State_t)(void *, uint64_t);
  typedef int (*Played_t)(void *, uint64_t, void *);
  static Count_t cnt;
  static ByIdx_t byIdx;
  static State_t state;
  static Played_t played;
  uint32_t n = 0, off = 4;
  int total;
  *outLen = 0;
  if (cnt == NULL) cnt = (Count_t)gl_nets_sym("SteamAPI_ISteamFriends_GetFriendCount");
  if (byIdx == NULL) byIdx = (ByIdx_t)gl_nets_sym("SteamAPI_ISteamFriends_GetFriendByIndex");
  if (state == NULL) state = (State_t)gl_nets_sym("SteamAPI_ISteamFriends_GetFriendPersonaState");
  if (played == NULL) played = (Played_t)gl_nets_sym("SteamAPI_ISteamFriends_GetFriendGamePlayed");
  if (friendsSelf == NULL || cap < 4 || cnt == NULL || byIdx == NULL || state == NULL || played == NULL ||
      g_bd_flat_SteamFriends017_GetFriendPersonaName == NULL)
    return 1;
  total = cnt(friendsSelf, 0x04 /* k_EFriendFlagImmediate */);
  g_friend_snapshot_n = 0;
  g_friend_snapshot_taken = 1;
  // 58 WR-04: a new snapshot invalidates every token handed out before it.
  // Generation 0 is skipped so a bare positional index is never valid.
  g_friend_snapshot_gen = (g_friend_snapshot_gen + 1u) & GL_INVITE_TOKEN_GEN_MASK;
  if (g_friend_snapshot_gen == 0) g_friend_snapshot_gen = 1;
  for (int i = 0; i < total && n < GL_INVITE_FRIENDS_MAX; i++) {
    uint64_t id = byIdx(friendsSelf, i, 0x04);
    const char *name = g_bd_flat_SteamFriends017_GetFriendPersonaName(friendsSelf, id);
    uint8_t info[64];
    size_t nl = 0;
    uint8_t online, playing = 0;
    uint16_t nl16;
    uint32_t ord = (g_friend_snapshot_gen << GL_INVITE_TOKEN_IDX_BITS) | n;
    if (id == 0) continue;
    if (name != NULL) {
      while (nl < GL_INVITE_NAME_MAX + 1 && name[nl] != '\0') nl++;
      if (nl > GL_INVITE_NAME_MAX) {
        nl = GL_INVITE_NAME_MAX;
        while (nl > 0 && ((uint8_t)name[nl] & 0xC0) == 0x80) nl--;
      }
    }
    if (off + 8u + (uint32_t)nl > cap) break;
    online = state(friendsSelf, id) != 0 ? 1 : 0;
    memset(info, 0, sizeof info);
    if (played(friendsSelf, id, info) & 0xff) {
      uint64_t gid;
      memcpy(&gid, info, 8);
      playing = (gid & 0xFFFFFFull) == g_appid_u64 ? 1 : 0;
    }
    nl16 = (uint16_t)nl;
    memcpy(out + off, &ord, 4);
    out[off + 4] = online;
    out[off + 5] = playing;
    memcpy(out + off + 6, &nl16, 2);
    if (nl > 0) memcpy(out + off + 8, name, nl);
    off += 8u + (uint32_t)nl;
    g_friend_snapshot[n++] = id;
  }
  g_friend_snapshot_n = n;
  memcpy(out, &n, 4);
  *outLen = off;
  logts_f("INVITE", "friends n=%u", (unsigned)n);
  return 0;
}

#define GL_INVITE_NO_PENDING (-1)
#define GL_INVITE_EXPIRED (-2)
#define GL_INVITE_BAD_ORDINAL (-3)

/* Slot 14. Returns the result code for [i32 result]. */
static int32_t gl_invite_send(void *mmSelf, uint32_t ordinal) {
  int ok;
  uint32_t idx = ordinal & GL_INVITE_TOKEN_IDX_MASK;
  uint32_t gen = ordinal >> GL_INVITE_TOKEN_IDX_BITS;
  if (g_invite_lobby == 0) {
    logts("INVITE", "refused reason=no-pending");
    return GL_INVITE_NO_PENDING;
  }
  if (gl_invite_now_ms() - g_invite_born_ms >= GL_INVITE_EXPIRY_MS) {
    logts("INVITE", "refused reason=expired");
    return GL_INVITE_EXPIRED;
  }
  // 58 WR-04: a token from a superseded snapshot is refused, never re-indexed.
  if (!g_friend_snapshot_taken || gen != g_friend_snapshot_gen || idx >= g_friend_snapshot_n) {
    logts("INVITE", "refused reason=bad-ordinal");
    return GL_INVITE_BAD_ORDINAL;
  }
  ok = (mmSelf != NULL && g_bd_flat_SteamMatchMaking009_InviteUserToLobby != NULL &&
        (g_bd_flat_SteamMatchMaking009_InviteUserToLobby(mmSelf, g_invite_lobby, g_friend_snapshot[idx]) & 0xff))
           ? 1
           : 0;
  logts_f("INVITE", "sent ok=%d", ok);
  return ok;
}

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
 * by a gl_conn slot) so the HELLO log line fires once
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
    if (slot == CONTROL_SLOT_REQUEST_CURRENT_STATS) {
      // quick 261027-k51 (T-k51-02/03/05): behind the auth gate; argLen must be
      // 0; never sleeps; one RequestUserStats in flight; integer/fixed-word
      // logging only, capped at STATS_LOG_MAX plus one cap line. The reply is
      // always an empty STATUS_OK (the game's fallback ignores it).
      if (argLen != 0) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
        return;
      }
      int logIt = 0;
      if (g_stats_logged < STATS_LOG_MAX) {
        g_stats_logged++;
        logIt = 1;
      } else if (!g_stats_cap_noted) {
        g_stats_cap_noted = 1;
        logts("STATS", "cap of 32 reached; later requests are not logged");
      }
      if (!g_inited || !g_manual_dispatch) {
        if (logIt) logts_f("STATS", "request session=0");
        send_response(fd, requestId, STATUS_OK, NULL, 0);
        return;
      }
      if (g_bd_identity_only) {
        // SteamUserStats is app-scoped and refused in identity-only mode (T-51-25).
        if (logIt) logts_f("STATS", "request mode=identity-only");
        send_response(fd, requestId, STATUS_OK, NULL, 0);
        return;
      }
      // Pump first so an init-time 1101 still sitting in Steam's pipe reaches the cache.
      gl_manual_pump_into_ring();
      int rr = gl_stats_on_request(&g_stats, &g_cbq);
      if (rr == GL_STATS_REQ_ALREADY_QUEUED) {
        if (logIt) logts_f("STATS", "request action=already-queued");
      } else if (rr == GL_STATS_REQ_QUEUED_CACHED) {
        if (logIt) logts_f("STATS", "request action=queued-cached");
      } else if (g_stats.pending_call != 0) {
        if (logIt) logts_f("STATS", "request action=fetch call=inflight");
      } else if (g_request_user_stats == NULL || g_bd_self_steamuserstats_interface_version013 == NULL ||
                 g_bd_flat_SteamUser023_GetSteamID == NULL || g_bd_self_steamuser023 == NULL) {
        if (logIt) logts_f("STATS", "request action=fetch call=unavailable");
      } else {
        uint64_t localUser = g_bd_flat_SteamUser023_GetSteamID(g_bd_self_steamuser023);
        uint64_t call = g_request_user_stats(g_bd_self_steamuserstats_interface_version013, localUser);
        if (call == 0) {
          if (logIt) logts_f("STATS", "request action=fetch call=invalid");
        } else {
          g_stats.pending_call = call;
          if (logIt) logts_f("STATS", "request action=fetch call=ok");
        }
      }
      send_response(fd, requestId, STATUS_OK, NULL, 0);
      return;
    }
    if (slot == CONTROL_SLOT_REPORT_CB_DISPATCH) {
      // quick 261027-k51 (T-k51-01/08): behind the auth gate; exactly 12 bytes;
      // id must be allowlisted; bounded counts. Never pumps or dispatches.
      if (argBlob == NULL || argLen != 12) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
        return;
      }
      int32_t did;
      uint32_t dn, dheld;
      memcpy(&did, argBlob, 4);
      memcpy(&dn, argBlob + 4, 4);
      memcpy(&dheld, argBlob + 8, 4);
      if ((gl_cbq_allowed_size(did) == 0 && gl_cr_allowed_size(did) == 0) || dn > CBDISP_MAX_TARGETS ||
          dheld > 2 || (dheld == 2 && (gl_cr_allowed_size(did) == 0 || dn > 1))) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
        return;
      }
      if (did == GL_CBQ_ID_P2P_SESSION_REQUEST) gl_p2p_on_report(dn, dheld);
      // D-08: promote a pending join to role=game only when the shim says it
      // dispatched the callback to at least one registered target.
      if (g_join_note.valid && g_join_note.id == did) {
        gl_net_evidence(dn >= 1, GL_NET_KIND_JOIN,
                        did == GL_CBQ_ID_LOBBY_ENTER ? GL_NET_IFACE_MATCHMAKING : GL_NET_IFACE_SOCKETS,
                        did, dn, g_join_note.path);
        g_join_note.valid = 0;
      }
      int bud = gl_logbudget_take(&g_cbdisp_budget, did, CBDISP_PER_ID_LOG_MAX);
      if (bud == 2) {
        logts_f("CBDISP", "cap reached iCallback=%d", (int)did);
      } else if (bud == 1) {
        if (dheld == 2)
          logts_f("CBDISP", "iCallback=%d targets=%u src=callresult", (int)did, (unsigned)dn);
        else
          logts_f("CBDISP", "iCallback=%d targets=%u held=%u", (int)did, (unsigned)dn,
                  (unsigned)dheld);
      }
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
        gl_p2p_note_served(out, n);
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
    if (slot == CONTROL_SLOT_DRAIN_CALL_RESULTS) {
      // Phase 58 (58-07, T-58-20/T-58-23): behind the auth gate above; argLen
      // must be 0; one result per round trip; never sleeps; buffer zeroed.
      if (argLen != 0 || g_bd_identity_only) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
        return;
      }
      uint8_t cout[GL_CR_DRAIN_RESP_MAX_BYTES];
      uint32_t cn;
      if (g_inited && g_manual_dispatch) {
        gl_manual_pump_into_ring();
        cn = gl_cr_pop(&g_cr, cout, sizeof cout);
      } else {
        uint32_t zero = 0;
        memcpy(cout, &zero, 4);
        cn = 4;
      }
      if (cn == 0) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
      } else {
        uint32_t reply_count = 0;
        memcpy(&reply_count, cout, 4);
        if (cn >= 16 && reply_count == 1) {
          int32_t drained_id = 0;
          memcpy(&drained_id, cout + 12, 4);
          if (gl_logbudget_take(&g_cr_drain_budget, drained_id, 1) == 1)
            logts_f("CBQ", "callresult iCallback=%d action=drained", (int)drained_id);
        }
        send_response(fd, requestId, STATUS_OK, cout, cn);
      }
      gl_cbq_secure_zero(cout, sizeof cout);
      return;
    }
    if (slot == CONTROL_SLOT_DRAIN_SERVER_EVENTS) {
      // Phase 58 (58-20, T-58-60/T-58-72): behind the auth gate above; argLen must
      // be 0; one event per round trip; never sleeps; never logs; buffer zeroed.
      if (argLen != 0 || g_bd_identity_only) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
        return;
      }
      uint8_t mout[GL_MMS_DRAIN_RESP_MAX_BYTES];
      uint32_t mn;
      if (g_inited && g_manual_dispatch) {
        gl_manual_pump_into_ring();
        mn = gl_mms_ev_pop(&g_mms, mout, sizeof mout);
      } else {
        uint32_t zero = 0;
        memcpy(mout, &zero, 4);
        mn = 4;
      }
      if (mn == 0) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
      } else {
        send_response(fd, requestId, STATUS_OK, mout, mn);
      }
      gl_cbq_secure_zero(mout, sizeof mout);
      return;
    }
    if (slot == CONTROL_SLOT_LIST_FRIENDS) {
      // Phase 58 (58-29, T-58-95/96): behind the auth gate above; argLen must be 0;
      // SteamIDs stay in the helper snapshot, only ordinals and names leave.
      uint8_t fout[GL_INVITE_FRIENDS_RESP_MAX];
      uint32_t fn = 0;
      if (argLen != 0 || !g_inited || g_bd_identity_only ||
          gl_invite_list_friends(g_bd_self_steamfriends017, fout, sizeof fout, &fn) != 0) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
      } else {
        send_response(fd, requestId, STATUS_OK, fout, fn);
      }
      gl_cbq_secure_zero(fout, sizeof fout);
      return;
    }
    if (slot == CONTROL_SLOT_INVITE_FRIEND) {
      // Phase 58 (58-29, T-58-97/98): the request carries an ordinal only; the
      // target lobby is the one the game itself named.
      uint32_t ord;
      int32_t result;
      if (argLen != 4 || argBlob == NULL || !g_inited || g_bd_identity_only) {
        send_response(fd, requestId, STATUS_ERR, NULL, 0);
        return;
      }
      memcpy(&ord, argBlob, 4);
      result = gl_invite_send(g_bd_self_steammatchmaking009, ord);
      send_response(fd, requestId, STATUS_OK, (const uint8_t *)&result, 4);
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
  if (status == STATUS_OK) gl_mms_lobby_log(ci, argBlob, argLen);
  if (status == STATUS_OK) gl_p2p_note_call(ci, argBlob, argLen);
  if (status == STATUS_OK && ci >= 0 && !g_call_seen[ci]) {
    g_call_seen[ci] = 1;
    logts("CALL", bd_call_name(ci));
  }
  send_response(fd, requestId, status, g_dispatch_respbuf, respLen);
  // 58-13: packet bytes and SteamIDs never linger in the shared scratch.
  if (respLen <= sizeof(g_dispatch_respbuf)) gl_cbq_secure_zero(g_dispatch_respbuf, respLen);
}

/*
 * 58-35: per-connection state. Each slot decodes sequential request frames
 * over its own persistent connection WITHOUT re-initializing Steamworks
 * between them (R2). A slot closes on peer disconnect, a malformed frame
 * (T-24-03 -- abort, never read unbounded), inactivity or a send failure.
 */
struct gl_conn {
  int fd; // -1 = free slot
  int authenticated; // WR-03: per-connection, set only by a matching HELLO
  int helloLogged;
  uint32_t have;
  time_t lastRxSec;
  time_t acceptedSec; // 58 WR-02: pre-auth deadline is measured from here
  uint8_t buf[LENGTH_FIELD_BYTES + MAX_FRAME_BYTES];
};
static struct gl_conn g_conns[GL_MAX_CONNS];
static int g_conn_cap_logged = 0;

static time_t gl_now_sec(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return ts.tv_sec;
}

static void gl_conn_close(struct gl_conn *c) {
  if (c->fd >= 0) close(c->fd);
  c->fd = -1;
  c->have = 0;
  c->authenticated = 0;
  c->helloLogged = 0;
}

// Reads at most one step of one frame from `c` (never past the current
// frame; pipelined bytes stay in the kernel for the next poll pass) and
// dispatches it once complete. Closes the slot on EOF, error, a malformed
// length (T-24-03), or a failed response send.
static void gl_conn_service(struct gl_conn *c) {
  uint32_t want = LENGTH_FIELD_BYTES;
  uint32_t totalLen = 0;
  if (c->have >= LENGTH_FIELD_BYTES) {
    memcpy(&totalLen, c->buf, 4);
    want = LENGTH_FIELD_BYTES + totalLen;
  }
  ssize_t k = recv(c->fd, c->buf + c->have, want - c->have, MSG_DONTWAIT);
  if (k == 0) { gl_conn_close(c); return; }
  if (k < 0) {
    if (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR) return;
    gl_conn_close(c);
    return;
  }
  c->have += (uint32_t)k;
  c->lastRxSec = gl_now_sec();
  if (c->have < LENGTH_FIELD_BYTES) return;
  memcpy(&totalLen, c->buf, 4);
  // T-24-03: reject based on the declared length alone, before any body byte.
  if (totalLen > MAX_FRAME_BYTES) {
    logts("ABORT", "inbound frame declared length exceeds MAX_FRAME_BYTES -- closing connection (T-24-03)");
    gl_conn_close(c);
    return;
  }
  if (totalLen < REQUEST_HEADER_BYTES) {
    logts("ABORT", "inbound frame declared length shorter than the request header -- malformed, closing connection");
    gl_conn_close(c);
    return;
  }
  if (c->have < LENGTH_FIELD_BYTES + totalLen) return; // partial frame

  const uint8_t *hdr = c->buf + LENGTH_FIELD_BYTES;
  uint32_t requestId;
  uint16_t ordinal, slot;
  memcpy(&requestId, hdr + 0, 4);
  memcpy(&ordinal, hdr + 4, 2);
  memcpy(&slot, hdr + 6, 2);
  uint32_t argLen = totalLen - REQUEST_HEADER_BYTES;
  g_send_failed = 0;
  dispatch_and_respond(c->fd, requestId, ordinal, slot, hdr + REQUEST_HEADER_BYTES, argLen, &c->helloLogged, &c->authenticated);
  c->have = 0;
  if (g_send_failed) gl_conn_close(c);
}

// 58-35: the one serving loop (replaces the blocking accept -> serve one
// connection until it closes). Single thread; Steam is only ever touched
// inside dispatch_and_respond.
static void gl_serve_forever(int listenFd) {
  for (int i = 0; i < GL_MAX_CONNS; i++) g_conns[i].fd = -1;
  int lf = fcntl(listenFd, F_GETFL, 0);
  if (lf >= 0) fcntl(listenFd, F_SETFL, lf | O_NONBLOCK);

  for (;;) {
    // Inactivity close (mid-frame or idle): same cadence as the old SO_RCVTIMEO.
    time_t now = gl_now_sec();
    int anyUsed = 0;
    for (int i = 0; i < GL_MAX_CONNS; i++) {
      if (g_conns[i].fd < 0) continue;
      if (now - g_conns[i].lastRxSec >= RECV_TIMEOUT_SECONDS) {
        gl_conn_close(&g_conns[i]);
        continue;
      }
      // 58 WR-02: lastRxSec is refreshed on every byte, so a pre-auth peer
      // trickling bytes would otherwise hold its slot forever.
      if (!g_conns[i].authenticated && now - g_conns[i].acceptedSec >= GL_AUTH_DEADLINE_SECONDS) {
        gl_conn_close(&g_conns[i]);
        continue;
      }
      anyUsed = 1;
    }

    struct pollfd pfds[GL_MAX_CONNS + 1];
    int slotOf[GL_MAX_CONNS + 1];
    int n = 0;
    pfds[n].fd = listenFd; pfds[n].events = POLLIN; pfds[n].revents = 0; slotOf[n] = -1; n++;
    for (int i = 0; i < GL_MAX_CONNS; i++) {
      if (g_conns[i].fd < 0) continue;
      pfds[n].fd = g_conns[i].fd; pfds[n].events = POLLIN; pfds[n].revents = 0; slotOf[n] = i; n++;
    }
    int pr = poll(pfds, (nfds_t)n, anyUsed ? 500 : -1);
    if (pr < 0) continue; // EINTR and friends: retry
    if (pr == 0) continue;

    for (int j = 1; j < n; j++) {
      if (pfds[j].revents & (POLLIN | POLLHUP | POLLERR)) gl_conn_service(&g_conns[slotOf[j]]);
    }

    if (pfds[0].revents & POLLIN) {
      int c = accept(listenFd, NULL, NULL);
      if (c >= 0) {
        // BSD/macOS: the accepted fd inherits O_NONBLOCK; send_all relies on
        // blocking sends bounded by SO_SNDTIMEO.
        int fl = fcntl(c, F_GETFL, 0);
        if (fl >= 0) fcntl(c, F_SETFL, fl & ~O_NONBLOCK);
        struct timeval sndTimeout;
        sndTimeout.tv_sec = 0;
        sndTimeout.tv_usec = GL_SEND_TIMEOUT_USEC; // 58 WR-03
        setsockopt(c, SOL_SOCKET, SO_SNDTIMEO, &sndTimeout, sizeof sndTimeout);
        // 58 WR-03: guarantee the "one reply fits in an empty buffer"
        // premise above instead of trusting the net.inet.tcp.sendspace
        // default. Only ever raises the buffer.
        {
          int sndBuf = 0;
          socklen_t sbLen = sizeof sndBuf;
          int wantBuf = 2 * (LENGTH_FIELD_BYTES + MAX_FRAME_BYTES);
          if (getsockopt(c, SOL_SOCKET, SO_SNDBUF, &sndBuf, &sbLen) == 0 && sndBuf < wantBuf)
            setsockopt(c, SOL_SOCKET, SO_SNDBUF, &wantBuf, sizeof wantBuf);
        }
        int free_i = -1;
        for (int i = 0; i < GL_MAX_CONNS; i++) {
          if (g_conns[i].fd < 0) { free_i = i; break; }
        }
        if (free_i < 0) {
          // 58 WR-02: a full table evicts its oldest unauthenticated slot
          // rather than refusing, so pre-auth squatters cannot lock the
          // shim and the invite client out. Authenticated slots are kept.
          int victim = -1;
          for (int i = 0; i < GL_MAX_CONNS; i++) {
            if (g_conns[i].authenticated) continue;
            if (victim < 0 || g_conns[i].acceptedSec < g_conns[victim].acceptedSec) victim = i;
          }
          if (victim >= 0) {
            gl_conn_close(&g_conns[victim]);
            free_i = victim;
          }
        }
        if (free_i < 0) {
          if (g_conn_cap_logged < GL_CONN_CAP_LOG_MAX) {
            g_conn_cap_logged++;
            logts("ABORT", "connection table full -- closing new connection");
          }
          close(c);
        } else {
          g_conns[free_i].fd = c;
          g_conns[free_i].authenticated = 0;
          g_conns[free_i].helloLogged = 0;
          g_conns[free_i].have = 0;
          g_conns[free_i].lastRxSec = gl_now_sec();
          g_conns[free_i].acceptedSec = g_conns[free_i].lastRxSec;
        }
      }
    }
  }
}

int main(int argc, char **argv) {
  // WR-03: ignore SIGPIPE process-wide before any socket I/O happens. Its
  // default disposition terminates the process, and writing to a socket
  // whose peer has already closed (e.g. the bridge game exiting
  // mid-request) raises it on macOS -- without this, a disconnect would
  // kill this helper.  send_all() above already treats the resulting
  // EPIPE like any other terminal send error.
  signal(SIGPIPE, SIG_IGN);

  // WR-03: load the per-launch secret from env, never argv (argv is
  // world-visible in `ps`). getenv() returns a pointer into the process's
  // startup env block, which macOS serves to `ps eww` via KERN_PROCARGS2;
  // unsetenv() only removes the libc `environ` entry and leaves that block
  // untouched. So the string is overwritten in place (volatile, over its full
  // strlen, whether valid or not) and only then unset, which also keeps it
  // out of anything the Steam dylib spawns. Residual exposure: the same uid
  // or root can still read the 0600 gamelib_bridge.cfg, so this closes the
  // `ps` channel and nothing more. Missing or malformed -> fail closed: every
  // authenticated slot is refused.
  {
    char *envSecret = getenv(BRIDGE_SECRET_ENV);
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
    if (envSecret != NULL) {
      size_t n = strlen(envSecret);
      volatile char *scrub = (volatile char *)envSecret;
      for (size_t i = 0; i < n; i++) scrub[i] = 0;
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
  g_appid_u64 = strtoull(g_appid, NULL, 10); // validated digits-only above

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

  gl_serve_forever(s);
  return 0;
}
