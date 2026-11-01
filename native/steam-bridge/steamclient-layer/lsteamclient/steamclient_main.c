/* Proton's lsteamclient, now for macOS! */
/* GAMELIB-DRM-TRACE BEGIN (Phase 56 D-15/D-16) */
/*
 * GameLib provenance and licence note (Phase 56 plan 02).
 *
 * Origin: NotProtonNot/NotProton @ 8db22adb237e6ea640a5af148b69b93709daf50c,
 * path lsteamclient/steamclient_main.c, layered over Valve's Proton
 * lsteamclient @ 164e0ccd2ea2b1ec2e5d08dc97f65b184c2539ca.
 *
 * This file, including the GameLib additions fenced by the GAMELIB-DRM-TRACE
 * markers, ships under the Steamworks SDK License as part of the separately
 * licensed steamclient-layer component (D-02). No GameLib GPL-3.0-only code is
 * linked with it. It is built by meta/buildLsteamclient.ts.
 *
 * GameLib's additions write two line shapes to the file named by the
 * GAMELIB_DRM_TRACE_FILE environment variable, parsed by drm/drmTrace.ts:
 *   [drm-trace] appId=<id> pid=<n> role=game|helper event=create-interface iface=<name>
 *   [drm-trace] appId=<id> pid=<n> role=game|helper event=call name=<ISteam..._Method>
 * Phase 58 D-08a adds three more shapes (see gamelib_trace_p2p and gamelib_trace_callback):
 *   [drm-trace] ... event=callback id=1202 peer=<ordinal>
 *   [drm-trace] ... event=p2p op=accept peer=<ordinal> ok=0|1
 *   [drm-trace] ... event=p2p op=send|read peer=<ordinal> bytes=<n>
 */
/* GAMELIB-DRM-TRACE END */
#include <stdarg.h>
#include <stdlib.h>
#include <stdio.h>
#include <limits.h>
#include <stdint.h>
#include <assert.h>

#include "windef.h"
#include "winbase.h"
#include "winnls.h"
#include "winuser.h"
#include "winternl.h"
#include "winsock2.h"

#include "steamclient_private.h"

WINE_DEFAULT_DEBUG_CHANNEL(steamclient);

CREATE_TYPE_INFO_VTABLE;

#ifdef __ASM_USE_THISCALL_WRAPPER

#define DEFINE_VTBL_WRAPPER(off)            \
    __ASM_GLOBAL_FUNC(vtbl_wrapper_ ## off, \
        "popl %eax\n\t"                     \
        "popl %ecx\n\t"                     \
        "pushl %eax\n\t"                    \
        "movl 0(%ecx), %eax\n\t"            \
        "jmp *" #off "(%eax)\n\t")

DEFINE_VTBL_WRAPPER(0);
DEFINE_VTBL_WRAPPER(4);
DEFINE_VTBL_WRAPPER(8);
DEFINE_VTBL_WRAPPER(12);
DEFINE_VTBL_WRAPPER(16);
DEFINE_VTBL_WRAPPER(20);
DEFINE_VTBL_WRAPPER(24);
DEFINE_VTBL_WRAPPER(28);
DEFINE_VTBL_WRAPPER(32);
DEFINE_VTBL_WRAPPER(36);
DEFINE_VTBL_WRAPPER(40);
DEFINE_VTBL_WRAPPER(44);
DEFINE_VTBL_WRAPPER(48);
DEFINE_VTBL_WRAPPER(52);
DEFINE_VTBL_WRAPPER(56);

#endif

static char temp_path_buffer[TEMP_PATH_BUFFER_LENGTH];

static CRITICAL_SECTION steamclient_cs = { NULL, -1, 0, 0, 0, 0 };
static HANDLE steam_overlay_event;
static BOOL wsa_initialized;
/* GAMELIB-DRM-TRACE BEGIN (Phase 56 D-15/D-16) */
#define GAMELIB_TRACE_MAX_NAMES 64
#define GAMELIB_TRACE_MAX_LINES 256
#define GAMELIB_TRACE_SLOTS 512
#define GAMELIB_TRACE_PATH_MAX 1024

static BOOL gamelib_trace_enabled;
static const char *gamelib_trace_role = "game";
static char gamelib_trace_appid[11];
static WCHAR gamelib_trace_path[GAMELIB_TRACE_PATH_MAX + 4];
static CRITICAL_SECTION gamelib_trace_cs = { NULL, -1, 0, 0, 0, 0 };
static HANDLE gamelib_trace_file = INVALID_HANDLE_VALUE;
static BOOL gamelib_trace_iface_logged;
static volatile UINT64 gamelib_trace_hashes[GAMELIB_TRACE_SLOTS]; /* 0 = empty */
static unsigned int gamelib_trace_names;
static unsigned int gamelib_trace_lines;

/* Runs under the loader lock: environment and module name reads only, no file I/O. */
static void gamelib_trace_init(void)
{
    WCHAR env[GAMELIB_TRACE_PATH_MAX];
    WCHAR idw[16];
    WCHAR modname[MAX_PATH * 2];
    DWORD n, i, base;

    n = GetEnvironmentVariableW( L"GAMELIB_DRM_TRACE_FILE", env, GAMELIB_TRACE_PATH_MAX );
    if (!n || n >= GAMELIB_TRACE_PATH_MAX || env[0] != '/') return;
    for (i = 0; i < n; i++)
        if (env[i] < 0x20 || env[i] == 0x7f) return;
    gamelib_trace_path[0] = 'Z';
    gamelib_trace_path[1] = ':';
    for (i = 0; i < n; i++) gamelib_trace_path[2 + i] = env[i] == '/' ? '\\' : env[i];
    gamelib_trace_path[2 + n] = 0;

    n = GetEnvironmentVariableW( L"SteamGameId", idw, ARRAY_SIZE(idw) );
    if (!n || n > 10) return;
    for (i = 0; i < n; i++)
    {
        if (idw[i] < '0' || idw[i] > '9') return;
        gamelib_trace_appid[i] = (char)idw[i];
    }
    gamelib_trace_appid[n] = 0;

    n = GetModuleFileNameW( NULL, modname, ARRAY_SIZE(modname) );
    base = 0;
    if (n && n < ARRAY_SIZE(modname))
    {
        for (i = 0; i < n; i++)
            if (modname[i] == '\\' || modname[i] == '/') base = i + 1;
        if (!lstrcmpiW( modname + base, L"steam.exe" )) gamelib_trace_role = "helper";
    }
    gamelib_trace_enabled = TRUE;
}

/* One WriteFile per line so the game and helper processes interleave whole lines. */
static void gamelib_trace_write(const char *line, int len)
{
    DWORD written;

    if (len <= 0) return;
    EnterCriticalSection( &gamelib_trace_cs );
    if (gamelib_trace_enabled && gamelib_trace_lines < GAMELIB_TRACE_MAX_LINES)
    {
        if (gamelib_trace_file == INVALID_HANDLE_VALUE)
        {
            gamelib_trace_file = CreateFileW( gamelib_trace_path, FILE_APPEND_DATA,
                                              FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                                              NULL, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL );
            if (gamelib_trace_file == INVALID_HANDLE_VALUE) gamelib_trace_enabled = FALSE;
        }
        if (gamelib_trace_enabled)
        {
            gamelib_trace_lines++;
            WriteFile( gamelib_trace_file, line, len, &written, NULL );
        }
    }
    LeaveCriticalSection( &gamelib_trace_cs );
}

static BOOL gamelib_trace_name_ok(const char *s, size_t len)
{
    size_t i;
    for (i = 0; i < len; i++)
    {
        char c = s[i];
        if (!((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_'))
            return FALSE;
    }
    return TRUE;
}

static BOOL gamelib_trace_ends_with(const char *s, size_t len, const char *suffix, size_t slen)
{
    size_t i;
    if (len < slen) return FALSE;
    for (i = 0; i < slen; i++)
        if (s[len - slen + i] != suffix[i]) return FALSE;
    return TRUE;
}

static void gamelib_trace_create_interface(const char *iface)
{
    char buf[512];
    size_t len = 0;
    int out;

    if (!gamelib_trace_enabled) return;
    EnterCriticalSection( &gamelib_trace_cs );
    if (gamelib_trace_iface_logged)
    {
        LeaveCriticalSection( &gamelib_trace_cs );
        return;
    }
    gamelib_trace_iface_logged = TRUE;
    LeaveCriticalSection( &gamelib_trace_cs );

    /* The name comes from the game's steam_api: untrusted, so never let it inject bytes. */
    if (iface) while (len <= 64 && iface[len]) len++;
    if (!iface || !len || len > 64 || !gamelib_trace_name_ok( iface, len )) iface = "invalid";
    out = snprintf( buf, sizeof(buf), "[drm-trace] appId=%s pid=%lu role=%s event=create-interface iface=%s\n",
                    gamelib_trace_appid, (unsigned long)GetCurrentProcessId(), gamelib_trace_role, iface );
    if (out > 0 && (size_t)out < sizeof(buf)) gamelib_trace_write( buf, out );
}

static BOOL gamelib_trace_seen(UINT64 hash)
{
    unsigned int slot = (unsigned int)(hash % GAMELIB_TRACE_SLOTS), n;
    for (n = 0; n < GAMELIB_TRACE_SLOTS; n++)
    {
        UINT64 v = gamelib_trace_hashes[(slot + n) % GAMELIB_TRACE_SLOTS];
        if (!v) return FALSE;
        if (v == hash) return TRUE;
    }
    return TRUE; /* table full: report as seen so nothing more is logged */
}

/* Distinct ISteam* method names only. steamclient_* plumbing codes never start with ISteam. */
static void gamelib_trace_call(const char *name)
{
    char buf[512];
    size_t len = 0;
    UINT64 hash = 14695981039346656037ULL;
    BOOL identity;
    unsigned int slot, n;
    int out;

    if (!gamelib_trace_enabled || !name) return;
    if (name[0] != 'I' || name[1] != 'S' || name[2] != 't' || name[3] != 'e' || name[4] != 'a' || name[5] != 'm') return;
    while (len <= 128 && name[len]) len++;
    if (len > 128 || !gamelib_trace_name_ok( name, len )) return;
    for (n = 0; n < len; n++) hash = (hash ^ (unsigned char)name[n]) * 1099511628211ULL;
    if (!hash) hash = 1;

    if (gamelib_trace_seen( hash )) return; /* lock-free fast path: entries are only ever added */

    identity = gamelib_trace_ends_with( name, len, "_GetSteamID", 11 )
            || gamelib_trace_ends_with( name, len, "_BLoggedOn", 10 )
            || gamelib_trace_ends_with( name, len, "_GetPersonaName", 15 );

    EnterCriticalSection( &gamelib_trace_cs );
    if (!gamelib_trace_seen( hash ) && gamelib_trace_enabled
        && gamelib_trace_lines < GAMELIB_TRACE_MAX_LINES
        && (identity || gamelib_trace_names < GAMELIB_TRACE_MAX_NAMES))
    {
        slot = (unsigned int)(hash % GAMELIB_TRACE_SLOTS);
        /* A hash collision suppresses one line; accepted (64-bit FNV-1a over a few hundred names). */
        for (n = 0; n < GAMELIB_TRACE_SLOTS; n++)
        {
            unsigned int s = (slot + n) % GAMELIB_TRACE_SLOTS;
            if (!gamelib_trace_hashes[s])
            {
                gamelib_trace_hashes[s] = hash;
                if (!identity) gamelib_trace_names++;
                LeaveCriticalSection( &gamelib_trace_cs );
                out = snprintf( buf, sizeof(buf), "[drm-trace] appId=%s pid=%lu role=%s event=call name=%s\n",
                                gamelib_trace_appid, (unsigned long)GetCurrentProcessId(), gamelib_trace_role, name );
                if (out > 0 && (size_t)out < sizeof(buf)) gamelib_trace_write( buf, out );
                return;
            }
        }
    }
    LeaveCriticalSection( &gamelib_trace_cs );
}

/* Phase 58 D-08a: bounded SteamID and size evidence for the legacy P2P join path.
 * The raw SteamID64 is read only to be mapped to a per-launch ordinal (1, 2, ...) and is never
 * formatted or written anywhere; nothing else from a packet or payload is read.
 * Scheme: each distinct key (callback 1202 per peer; accept per peer and result; send and read
 * per peer and zero/nonzero size) is written at most once, and at most GAMELIB_TRACE_MAX_P2P
 * lines are written per launch, so a long session cannot crowd out the join evidence. */
#define GAMELIB_TRACE_MAX_P2P 32
static unsigned int gamelib_trace_p2p_lines;

static UINT64 gamelib_trace_u64(const void *p)
{
    const unsigned char *b = p;
    UINT64 v = 0;
    int i;
    for (i = 7; i >= 0; i--) v = (v << 8) | b[i];
    return v;
}

/* Per-launch peer ordinals: first sight of a distinct SteamID64 gets the next small integer. The
 * table is bounded and lock-protected; the ID itself never leaves it. Returns 0 when the table is
 * full, which the writers render as peer=overflow (the census never treats that as a match). */
#define GAMELIB_TRACE_MAX_PEERS 16
static UINT64 gamelib_trace_peer_ids[GAMELIB_TRACE_MAX_PEERS];
static unsigned int gamelib_trace_peer_count;

static unsigned int gamelib_trace_peer_ordinal(UINT64 id)
{
    unsigned int i, ord = 0;

    EnterCriticalSection( &gamelib_trace_cs );
    for (i = 0; i < gamelib_trace_peer_count; i++)
        if (gamelib_trace_peer_ids[i] == id) { ord = i + 1; break; }
    if (!ord && gamelib_trace_peer_count < GAMELIB_TRACE_MAX_PEERS)
    {
        gamelib_trace_peer_ids[gamelib_trace_peer_count++] = id;
        ord = gamelib_trace_peer_count;
    }
    LeaveCriticalSection( &gamelib_trace_cs );
    return ord;
}

/* peer text: decimal ordinal, or "overflow" */
static void gamelib_trace_peer_text(UINT64 id, char *out, size_t n)
{
    unsigned int ord = gamelib_trace_peer_ordinal( id );
    if (ord) snprintf( out, n, "%u", ord );
    else snprintf( out, n, "overflow" );
}

/* TRUE exactly once per key, and only while the P2P line budget lasts. */
static BOOL gamelib_trace_claim(const char *key, int klen)
{
    UINT64 hash = 14695981039346656037ULL;
    unsigned int slot, n;
    BOOL claimed = FALSE;

    if (!gamelib_trace_enabled || klen <= 0) return FALSE;
    for (n = 0; n < (unsigned int)klen; n++) hash = (hash ^ (unsigned char)key[n]) * 1099511628211ULL;
    if (!hash) hash = 1;
    if (gamelib_trace_seen( hash )) return FALSE;

    EnterCriticalSection( &gamelib_trace_cs );
    if (!gamelib_trace_seen( hash ) && gamelib_trace_enabled && gamelib_trace_p2p_lines < GAMELIB_TRACE_MAX_P2P)
    {
        slot = (unsigned int)(hash % GAMELIB_TRACE_SLOTS);
        for (n = 0; n < GAMELIB_TRACE_SLOTS; n++)
        {
            unsigned int s = (slot + n) % GAMELIB_TRACE_SLOTS;
            if (!gamelib_trace_hashes[s])
            {
                gamelib_trace_hashes[s] = hash;
                gamelib_trace_p2p_lines++;
                claimed = TRUE;
                break;
            }
        }
    }
    LeaveCriticalSection( &gamelib_trace_cs );
    return claimed;
}

static void gamelib_trace_p2p(const char *op, UINT64 peer, BOOL has_bytes, uint32_t bytes, BOOL ok)
{
    char buf[512], key[96], ptxt[16];
    int klen, out;

    if (!gamelib_trace_enabled) return;
    gamelib_trace_peer_text( peer, ptxt, sizeof(ptxt) );
    klen = snprintf( key, sizeof(key), "p2p:%s:%s:%u", op, ptxt,
                     has_bytes ? (bytes ? 1u : 0u) : (ok ? 1u : 0u) );
    if (klen <= 0 || (size_t)klen >= sizeof(key)) return;
    if (!gamelib_trace_claim( key, klen )) return;
    if (has_bytes)
        out = snprintf( buf, sizeof(buf), "[drm-trace] appId=%s pid=%lu role=%s event=p2p op=%s peer=%s bytes=%u\n",
                        gamelib_trace_appid, (unsigned long)GetCurrentProcessId(), gamelib_trace_role, op,
                        ptxt, (unsigned int)bytes );
    else
        out = snprintf( buf, sizeof(buf), "[drm-trace] appId=%s pid=%lu role=%s event=p2p op=%s peer=%s ok=%d\n",
                        gamelib_trace_appid, (unsigned long)GetCurrentProcessId(), gamelib_trace_role, op,
                        ptxt, ok ? 1 : 0 );
    if (out > 0 && (size_t)out < sizeof(buf)) gamelib_trace_write( buf, out );
}

#if defined(__x86_64__)
/* The leading fields of the SendP2PPacket, ReadP2PPacket and AcceptP2PSessionWithUser params are
 * identical across ISteamNetworking 003 to 006; only trailing channel arguments differ. The
 * asserts fail the build if a regenerated layout ever moves them. */
#define GAMELIB_P2P_SEND   struct ISteamNetworking_SteamNetworking006_SendP2PPacket_params
#define GAMELIB_P2P_READ   struct ISteamNetworking_SteamNetworking006_ReadP2PPacket_params
#define GAMELIB_P2P_ACCEPT struct ISteamNetworking_SteamNetworking006_AcceptP2PSessionWithUser_params
_Static_assert( offsetof( GAMELIB_P2P_SEND, cubData ) ==
                offsetof( struct ISteamNetworking_SteamNetworking003_SendP2PPacket_params, cubData ), "send layout" );
_Static_assert( offsetof( GAMELIB_P2P_SEND, cubData ) ==
                offsetof( struct ISteamNetworking_SteamNetworking004_SendP2PPacket_params, cubData ), "send layout" );
_Static_assert( offsetof( GAMELIB_P2P_READ, psteamIDRemote ) ==
                offsetof( struct ISteamNetworking_SteamNetworking003_ReadP2PPacket_params, psteamIDRemote ), "read layout" );
_Static_assert( offsetof( GAMELIB_P2P_READ, psteamIDRemote ) ==
                offsetof( struct ISteamNetworking_SteamNetworking004_ReadP2PPacket_params, psteamIDRemote ), "read layout" );

/* Called after a successful unix call. name is compared by suffix after the ISteamNetworking_
 * prefix; args is the Windows-side params struct the game's call filled in. */
static void gamelib_trace_p2p_call(const char *name, const void *args)
{
    static const char prefix[] = "ISteamNetworking_SteamNetworking";
    size_t len = 0;

    if (!gamelib_trace_enabled || !name || !args) return;
    while (len <= 128 && name[len]) len++;
    if (len > 128 || len <= sizeof(prefix) - 1) return;
    if (memcmp( name, prefix, sizeof(prefix) - 1 )) return;

    if (gamelib_trace_ends_with( name, len, "_SendP2PPacket", 14 ))
    {
        const GAMELIB_P2P_SEND *p = args;
        if (p->_ret) gamelib_trace_p2p( "send", gamelib_trace_u64( &p->steamIDRemote ), TRUE, p->cubData, TRUE );
    }
    else if (gamelib_trace_ends_with( name, len, "_ReadP2PPacket", 14 ))
    {
        const GAMELIB_P2P_READ *p = args;
        if (p->_ret && p->pcubMsgSize && p->psteamIDRemote)
            gamelib_trace_p2p( "read", gamelib_trace_u64( p->psteamIDRemote ), TRUE, *p->pcubMsgSize, TRUE );
    }
    else if (gamelib_trace_ends_with( name, len, "_AcceptP2PSessionWithUser", 25 ))
    {
        const GAMELIB_P2P_ACCEPT *p = args;
        gamelib_trace_p2p( "accept", gamelib_trace_u64( &p->steamIDRemote ), FALSE, 0, p->_ret ? TRUE : FALSE );
    }
}
#else
static void gamelib_trace_p2p_call(const char *name, const void *args) { (void)name; (void)args; }
#endif

/* Phase 58 (raft-drm-build-id-mismatch): ISteamApps::GetAppBuildId in DRM mode.
 * The call is forwarded to native Mac Steam, which has no install record for a game GameLib
 * installed itself, so it answers a build id that is not the installed one. Raft's join check
 * compares that id with the host's, so a peer on the real build rejects the join. Fix: when the
 * bottle holds the app's own appmanifest, report its "buildid", the id Windows Steam would report
 * for the same files. WR-02 (quick-261101-j03): the manifest is looked up in the running exe's own
 * library first, then the default library, then up to 8 libraryfolders.vdf paths; only the
 * top-level AppState.buildid is accepted (the file is parsed as KeyValues) and the file is read to
 * EOF into a 256 KiB bounded heap buffer. No manifest, an unreadable or oversize one, or a missing
 * field leaves Mac Steam's answer untouched. Runs once, on the game thread's first GetAppBuildId
 * (never in DllMain), under the critical section. The two integers (Mac Steam's answer, the answer given) are traced; nothing else.
 * Raft calls no other ISteamApps method (host trace 2026-10-31); the layout of _ret is identical
 * across ISteamApps 007 and 008, the only versions that have GetAppBuildId. */
#if defined(__x86_64__)
static void gamelib_apps_emit(const char *op, long ret)
{
    char buf[256], key[64];
    int klen, out;

    klen = snprintf( key, sizeof(key), "apps:%s:%ld", op, ret );
    if (klen <= 0 || (size_t)klen >= sizeof(key) || !gamelib_trace_claim( key, klen )) return;
    out = snprintf( buf, sizeof(buf), "[drm-trace] appId=%s pid=%lu role=%s event=apps op=%s ret=%ld\n",
                    gamelib_trace_appid, (unsigned long)GetCurrentProcessId(), gamelib_trace_role, op, ret );
    if (out > 0 && (size_t)out < sizeof(buf)) gamelib_trace_write( buf, out );
}

/* GAMELIB-ACF-PARSE BEGIN */
/* Pure KeyValues (ACF/VDF) parsing: no libc calls, no Win32 types, no globals, so the host test
 * (meta/__tests__/acfParseHost.test.ts) compiles exactly this text. Every read is checked against
 * len; the input need not be NUL-terminated. */
enum { GL_KV_END = 0, GL_KV_STR = 1, GL_KV_OPEN = 2, GL_KV_CLOSE = 3, GL_KV_ERR = -1 };

static int gamelib_kv_next(const char *d, size_t len, size_t *pos, size_t *tok, size_t *toklen)
{
    size_t p = *pos, q;

    while (p < len)
    {
        if (d[p] == ' ' || d[p] == '\t' || d[p] == '\r' || d[p] == '\n') p++;
        else if (d[p] == '/' && p + 1 < len && d[p + 1] == '/')
        {
            while (p < len && d[p] != '\n') p++;
        }
        else break;
    }
    if (p >= len) { *pos = len; return GL_KV_END; }
    if (d[p] == '{') { *pos = p + 1; return GL_KV_OPEN; }
    if (d[p] == '}') { *pos = p + 1; return GL_KV_CLOSE; }
    if (d[p] == '"')
    {
        q = p + 1;
        while (q < len && d[q] != '"')
        {
            if (d[q] == '\\') q += 2;
            else q++;
        }
        if (q >= len) { *pos = len; return GL_KV_ERR; }
        *tok = p + 1;
        *toklen = q - (p + 1);
        *pos = q + 1;
        return GL_KV_STR;
    }
    q = p;
    while (q < len && d[q] != ' ' && d[q] != '\t' && d[q] != '\r' && d[q] != '\n' &&
           d[q] != '"' && d[q] != '{' && d[q] != '}') q++;
    *tok = p;
    *toklen = q - p;
    *pos = q;
    return GL_KV_STR;
}

/* ASCII case-insensitive equality of a raw token against a lower-case NUL-terminated literal. */
static int gamelib_kv_ieq(const char *raw, size_t rawlen, const char *lit)
{
    size_t i;

    for (i = 0; i < rawlen; i++)
    {
        char c = raw[i];
        if (!lit[i]) return 0;
        if (c >= 'A' && c <= 'Z') c = (char)(c - 'A' + 'a');
        if (c != lit[i]) return 0;
    }
    return lit[i] == 0;
}

/* Consumes tokens up to the close matching an already-consumed open. Returns 1 on success. */
static int gamelib_kv_skip_block(const char *d, size_t len, size_t *pos)
{
    size_t tok, tl;
    int depth = 1, k;

    while (depth > 0)
    {
        k = gamelib_kv_next( d, len, pos, &tok, &tl );
        if (k == GL_KV_OPEN) depth++;
        else if (k == GL_KV_CLOSE) depth--;
        else if (k == GL_KV_END || k == GL_KV_ERR) return 0;
    }
    return 1;
}

/* Top-level AppState.buildid (1..INT32_MAX, pure digits), else 0. */
static int32_t gamelib_acf_buildid(const char *d, size_t len)
{
    size_t pos = 0, tok, tl, vtok, vtl, i;
    int k;
    int64_t v;

    k = gamelib_kv_next( d, len, &pos, &tok, &tl );
    if (k != GL_KV_STR || !gamelib_kv_ieq( d + tok, tl, "appstate" )) return 0;
    if (gamelib_kv_next( d, len, &pos, &tok, &tl ) != GL_KV_OPEN) return 0;
    for (;;)
    {
        k = gamelib_kv_next( d, len, &pos, &tok, &tl );
        if (k != GL_KV_STR) return 0; /* close (no buildid), end, error or stray open */
        k = gamelib_kv_next( d, len, &pos, &vtok, &vtl );
        if (k == GL_KV_OPEN)
        {
            if (gamelib_kv_ieq( d + tok, tl, "buildid" )) return 0;
            if (!gamelib_kv_skip_block( d, len, &pos )) return 0;
            continue;
        }
        if (k != GL_KV_STR) return 0;
        if (!gamelib_kv_ieq( d + tok, tl, "buildid" )) continue;
        if (vtl < 1 || vtl > 10) return 0;
        v = 0;
        for (i = 0; i < vtl; i++)
        {
            if (d[vtok + i] < '0' || d[vtok + i] > '9') return 0;
            v = v * 10 + (d[vtok + i] - '0');
        }
        if (v < 1 || v > 2147483647) return 0;
        return (int32_t)v;
    }
}

/* index-th library "path" (0-based, document order) of libraryfolders.vdf, unescaped into out. */
static size_t gamelib_vdf_library_path(const char *d, size_t len, unsigned int index, char *out, size_t cap)
{
    size_t pos = 0, tok, tl, vtok, vtl, i, o;
    unsigned int count = 0;
    int k, k2;

    if (!out || !cap) return 0;
    k = gamelib_kv_next( d, len, &pos, &tok, &tl );
    if (k != GL_KV_STR || !gamelib_kv_ieq( d + tok, tl, "libraryfolders" )) return 0;
    if (gamelib_kv_next( d, len, &pos, &tok, &tl ) != GL_KV_OPEN) return 0;
    for (;;)
    {
        k = gamelib_kv_next( d, len, &pos, &tok, &tl );
        if (k != GL_KV_STR) return 0;
        k = gamelib_kv_next( d, len, &pos, &vtok, &vtl );
        if (k == GL_KV_STR) continue;
        if (k != GL_KV_OPEN) return 0;
        for (;;) /* one numbered library entry, depth 2 */
        {
            k = gamelib_kv_next( d, len, &pos, &tok, &tl );
            if (k == GL_KV_CLOSE) break;
            if (k != GL_KV_STR) return 0;
            k2 = gamelib_kv_next( d, len, &pos, &vtok, &vtl );
            if (k2 == GL_KV_OPEN)
            {
                if (!gamelib_kv_skip_block( d, len, &pos )) return 0;
                continue;
            }
            if (k2 != GL_KV_STR) return 0;
            if (!gamelib_kv_ieq( d + tok, tl, "path" )) continue;
            if (count++ != index) continue;
            o = 0;
            for (i = 0; i < vtl; )
            {
                char c = d[vtok + i];
                if (c == '\\' && i + 1 < vtl && (d[vtok + i + 1] == '\\' || d[vtok + i + 1] == '"'))
                {
                    c = d[vtok + i + 1];
                    i += 2;
                }
                else i++;
                if (o + 1 >= cap) return 0;
                out[o++] = c;
            }
            if (!o) return 0;
            out[o] = 0;
            return o;
        }
    }
}
/* GAMELIB-ACF-PARSE END */

#define GAMELIB_APPS_FILE_MAX 262144
#define GAMELIB_APPS_MAX_LIBRARIES 8
static const WCHAR gamelib_apps_default_root[] = L"C:\\Program Files (x86)\\Steam";

static WCHAR gamelib_apps_lower(WCHAR c) { return c >= 'A' && c <= 'Z' ? (WCHAR)(c - 'A' + 'a') : c; }

static int gamelib_apps_wide_ieq(const WCHAR *a, size_t alen, const WCHAR *b, size_t blen)
{
    size_t i;

    if (alen != blen) return 0;
    for (i = 0; i < alen; i++) if (gamelib_apps_lower( a[i] ) != gamelib_apps_lower( b[i] )) return 0;
    return 1;
}

/* Reads the whole file (EOF-terminated loop) into a bounded heap buffer; a file over the bound is
 * refused rather than parsed truncated. The caller frees *data with HeapFree. */
static BOOL gamelib_apps_read_file(const WCHAR *path, char **data, size_t *len)
{
    HANDLE file;
    LARGE_INTEGER size;
    char *buf, extra;
    size_t total = 0;
    DWORD got;
    BOOL ok = FALSE;

    file = CreateFileW( path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING,
                        FILE_ATTRIBUTE_NORMAL, NULL );
    if (file == INVALID_HANDLE_VALUE) return FALSE;
    if (!GetFileSizeEx( file, &size ) || size.QuadPart <= 0 || size.QuadPart > GAMELIB_APPS_FILE_MAX)
    {
        CloseHandle( file );
        return FALSE;
    }
    buf = HeapAlloc( GetProcessHeap(), 0, GAMELIB_APPS_FILE_MAX );
    if (!buf) { CloseHandle( file ); return FALSE; }
    for (;;)
    {
        if (total < GAMELIB_APPS_FILE_MAX)
        {
            if (!ReadFile( file, buf + total, (DWORD)(GAMELIB_APPS_FILE_MAX - total), &got, NULL )) break;
            if (!got) { ok = TRUE; break; }
            total += got;
        }
        else
        {
            if (!ReadFile( file, &extra, 1, &got, NULL ) || got) break;
            ok = TRUE;
            break;
        }
    }
    CloseHandle( file );
    if (!ok || !total) { HeapFree( GetProcessHeap(), 0, buf ); return FALSE; }
    *data = buf;
    *len = total;
    return TRUE;
}

static int32_t gamelib_apps_try_library(const WCHAR *root, size_t rootlen, const WCHAR *idw)
{
    WCHAR path[GAMELIB_TRACE_PATH_MAX];
    char *data;
    size_t len, i;
    int n;
    int32_t id;

    if (rootlen + 1 >= ARRAY_SIZE(path)) return 0;
    for (i = 0; i < rootlen; i++) path[i] = root[i];
    n = swprintf( path + rootlen, ARRAY_SIZE(path) - rootlen, L"\\steamapps\\appmanifest_%ls.acf", idw );
    if (n <= 0 || (size_t)n >= ARRAY_SIZE(path) - rootlen) return 0;
    if (!gamelib_apps_read_file( path, &data, &len )) return 0;
    id = gamelib_acf_buildid( data, len );
    HeapFree( GetProcessHeap(), 0, data );
    return id;
}

/* Returns the manifest buildid (> 0), or 0 when it cannot be read. Candidates, first hit wins:
 * the running exe's own library, the default library, then up to GAMELIB_APPS_MAX_LIBRARIES
 * libraryfolders.vdf paths. */
static int32_t gamelib_apps_manifest_buildid(void)
{
    static const WCHAR needle[] = L"\\steamapps\\common\\";
    const size_t nlen = ARRAY_SIZE(needle) - 1;
    const size_t deflen = ARRAY_SIZE(gamelib_apps_default_root) - 1;
    WCHAR idw[16], exe[GAMELIB_TRACE_PATH_MAX], wpath[GAMELIB_TRACE_PATH_MAX];
    char utf8[GAMELIB_TRACE_PATH_MAX], *vdf;
    size_t exelen = 0, vlen, plen, i, j;
    DWORD n;
    unsigned int idx;
    int wn;
    int32_t id;
    BOOL have_exe = FALSE;

    n = GetEnvironmentVariableW( L"SteamGameId", idw, ARRAY_SIZE(idw) );
    if (!n || n > 10) return 0;
    for (i = 0; i < n; i++) if (idw[i] < '0' || idw[i] > '9') return 0;

    n = GetModuleFileNameW( NULL, exe, ARRAY_SIZE(exe) );
    if (n && n < ARRAY_SIZE(exe))
    {
        for (i = n; i >= nlen; i--)
        {
            if (gamelib_apps_wide_ieq( exe + i - nlen, nlen, needle, nlen ))
            {
                exelen = i - nlen;
                have_exe = exelen > 0;
                break;
            }
            if (i == nlen) break;
        }
    }
    if (have_exe && (id = gamelib_apps_try_library( exe, exelen, idw )) > 0) return id;

    if (!(have_exe && gamelib_apps_wide_ieq( exe, exelen, gamelib_apps_default_root, deflen )) &&
        (id = gamelib_apps_try_library( gamelib_apps_default_root, deflen, idw )) > 0)
        return id;

    plen = deflen;
    for (i = 0; i < plen; i++) wpath[i] = gamelib_apps_default_root[i];
    {
        static const WCHAR vdfname[] = L"\\steamapps\\libraryfolders.vdf";
        if (plen + ARRAY_SIZE(vdfname) > ARRAY_SIZE(wpath)) return 0;
        for (j = 0; j < ARRAY_SIZE(vdfname); j++) wpath[plen + j] = vdfname[j];
    }
    if (!gamelib_apps_read_file( wpath, &vdf, &vlen )) return 0;
    for (idx = 0; idx < GAMELIB_APPS_MAX_LIBRARIES; idx++)
    {
        size_t ulen = gamelib_vdf_library_path( vdf, vlen, idx, utf8, sizeof(utf8) );
        if (!ulen) break;
        wn = MultiByteToWideChar( CP_UTF8, MB_ERR_INVALID_CHARS, utf8, (int)ulen, wpath, ARRAY_SIZE(wpath) - 1 );
        if (wn <= 0) continue;
        if (wpath[wn - 1] == '\\') wn--;
        if (wn <= 0) continue;
        if (have_exe && gamelib_apps_wide_ieq( wpath, wn, exe, exelen )) continue;
        if (gamelib_apps_wide_ieq( wpath, wn, gamelib_apps_default_root, deflen )) continue;
        if ((id = gamelib_apps_try_library( wpath, wn, idw )) > 0)
        {
            HeapFree( GetProcessHeap(), 0, vdf );
            return id;
        }
    }
    HeapFree( GetProcessHeap(), 0, vdf );
    return 0;
}

static void gamelib_apps_call(const char *name, void *args)
{
    static const char prefix[] = "ISteamApps_STEAMAPPS_INTERFACE_VERSION";
    static int32_t manifest_id;
    static volatile LONG manifest_state; /* 0 untried, 1 resolving, 2 done */
    struct ISteamApps_STEAMAPPS_INTERFACE_VERSION007_GetAppBuildId_params *p = args;
    size_t len = 0;

    if (!name || !args) return;
    while (len <= 128 && name[len]) len++;
    if (len > 128 || len <= sizeof(prefix) - 1) return;
    if (memcmp( name, prefix, sizeof(prefix) - 1 )) return;
    if (!gamelib_trace_ends_with( name, len, "_GetAppBuildId", 14 )) return;

    if (manifest_state != 2)
    {
        EnterCriticalSection( &gamelib_trace_cs );
        if (manifest_state == 0) { manifest_id = gamelib_apps_manifest_buildid(); manifest_state = 2; }
        LeaveCriticalSection( &gamelib_trace_cs );
    }
    gamelib_apps_emit( "build-id", (long)p->_ret );
    if (manifest_id > 0) p->_ret = manifest_id;
    gamelib_apps_emit( "build-id-given", (long)p->_ret );
}
#else
static void gamelib_apps_call(const char *name, void *args) { (void)name; (void)args; }
#endif

/* Phase 58 D-08: join-signal callbacks the game drains. Only an integer id from a closed set is
 * written, plus one enum integer for 504 and 1221, and (D-08a) the per-launch peer ordinal of the
 * remote peer for 1202 (never the SteamID64). No handle or other payload byte is ever formatted. payload/cub are the Windows-side buffer; a size too small to hold the enum
 * means the value is omitted. */
static const int32_t gamelib_trace_callback_ids[] =
{
    333, 337, 504, 505, 506, 510, 513, 1202, 1203, 1221, 1251, 1252, 1281
};

static void gamelib_trace_callback(int32_t id, const void *payload, uint32_t cub)
{
    char buf[512], key[32];
    UINT64 hash = 14695981039346656037ULL;
    BOOL known = FALSE, have_detail = FALSE;
    int32_t detail = 0;
    unsigned int i, slot, n;
    int out, klen;

    if (!gamelib_trace_enabled) return;
    for (i = 0; i < ARRAY_SIZE(gamelib_trace_callback_ids); i++)
        if (gamelib_trace_callback_ids[i] == id) known = TRUE;
    if (!known) return;

    if (id == 504 && payload)
    {
        size_t off = offsetof( struct LobbyEnter_t, m_EChatRoomEnterResponse );
        if (cub >= off + 4) { detail = (int32_t)*(const uint32_t *)((const char *)payload + off); have_detail = TRUE; }
    }
    else if (id == 1221 && payload)
    {
        size_t off = offsetof( struct w64_SteamNetConnectionStatusChangedCallback_t_153a, m_info.m_eState );
        if (cub >= off + 4) { detail = (int32_t)*(const uint32_t *)((const char *)payload + off); have_detail = TRUE; }
    }
    if (have_detail && (detail < -99 || detail > 999)) have_detail = FALSE;

    if (id == 1202 && payload && cub >= 8)
    {
        /* P2PSessionRequest_t { CSteamID m_steamIDRemote; } */
        char ptxt[16];
        gamelib_trace_peer_text( gamelib_trace_u64( payload ), ptxt, sizeof(ptxt) );
        klen = snprintf( key, sizeof(key), "cb:1202:%s", ptxt );
        if (klen > 0 && (size_t)klen < sizeof(key) && gamelib_trace_claim( key, klen ))
        {
            out = snprintf( buf, sizeof(buf), "[drm-trace] appId=%s pid=%lu role=%s event=callback id=1202 peer=%s\n",
                            gamelib_trace_appid, (unsigned long)GetCurrentProcessId(), gamelib_trace_role,
                            ptxt );
            if (out > 0 && (size_t)out < sizeof(buf)) gamelib_trace_write( buf, out );
        }
        return;
    }

    klen = snprintf( key, sizeof(key), "cb:%d:%d", id, have_detail ? detail : -1000 );
    if (klen <= 0 || (size_t)klen >= sizeof(key)) return;
    for (n = 0; n < (unsigned int)klen; n++) hash = (hash ^ (unsigned char)key[n]) * 1099511628211ULL;
    if (!hash) hash = 1;
    if (gamelib_trace_seen( hash )) return;

    EnterCriticalSection( &gamelib_trace_cs );
    if (!gamelib_trace_seen( hash ) && gamelib_trace_enabled && gamelib_trace_lines < GAMELIB_TRACE_MAX_LINES)
    {
        slot = (unsigned int)(hash % GAMELIB_TRACE_SLOTS);
        for (n = 0; n < GAMELIB_TRACE_SLOTS; n++)
        {
            unsigned int s = (slot + n) % GAMELIB_TRACE_SLOTS;
            if (!gamelib_trace_hashes[s])
            {
                gamelib_trace_hashes[s] = hash;
                LeaveCriticalSection( &gamelib_trace_cs );
                if (have_detail && id == 504)
                    out = snprintf( buf, sizeof(buf), "[drm-trace] appId=%s pid=%lu role=%s event=callback id=%d resp=%d\n",
                                    gamelib_trace_appid, (unsigned long)GetCurrentProcessId(), gamelib_trace_role, id, detail );
                else if (have_detail && id == 1221)
                    out = snprintf( buf, sizeof(buf), "[drm-trace] appId=%s pid=%lu role=%s event=callback id=%d state=%d\n",
                                    gamelib_trace_appid, (unsigned long)GetCurrentProcessId(), gamelib_trace_role, id, detail );
                else
                    out = snprintf( buf, sizeof(buf), "[drm-trace] appId=%s pid=%lu role=%s event=callback id=%d\n",
                                    gamelib_trace_appid, (unsigned long)GetCurrentProcessId(), gamelib_trace_role, id );
                if (out > 0 && (size_t)out < sizeof(buf)) gamelib_trace_write( buf, out );
                return;
            }
        }
    }
    LeaveCriticalSection( &gamelib_trace_cs );
}
/* GAMELIB-DRM-TRACE END */

BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, void *reserved)
{
    TRACE("(%p, %lu, %p)\n", instance, reason, reserved);

    switch (reason)
    {
        case DLL_PROCESS_ATTACH:
            DisableThreadLibraryCalls(instance);
            steam_overlay_event = CreateEventA(NULL, TRUE, FALSE, "__wine_steamclient_GameOverlayActivated");
#if defined(__x86_64__) || defined(__aarch64__)
            init_type_info_rtti( (char *)instance );
            init_rtti( (char *)instance );
#endif
            __wine_init_unix_call();
            /* GAMELIB-DRM-TRACE BEGIN (Phase 56 D-15/D-16) */
            gamelib_trace_init();
            /* GAMELIB-DRM-TRACE END */
            break;
        case DLL_PROCESS_DETACH:
            CloseHandle(steam_overlay_event);
            if (wsa_initialized)
            {
                WSACleanup();
                wsa_initialized = FALSE;
            }
            break;
    }

    return TRUE;
}

NTSTATUS steamclient_call( unsigned int code, void *args, const char *name )
{
    NTSTATUS status = WINE_UNIX_CALL( code, args );
    /* GAMELIB-DRM-TRACE BEGIN (Phase 56 D-15/D-16) */
    if (!status) gamelib_trace_call( name );
    if (!status) gamelib_trace_p2p_call( name, args );
    if (!status) gamelib_apps_call( name, args );
    /* GAMELIB-DRM-TRACE END */

    if (status == STATUS_ACCESS_VIOLATION)
    {
        ERR( "Access violation in %s.\n", name );
        *(volatile int *)0xbeef |= 0;
    }
    if (status) WARN( "%s failed, status %#x\n", name, (UINT)status );
    return status;
}

static BYTE *alloc_start, *alloc_end;

static int8_t allocated_from_steamclient_dll( void *ptr )
{
    return (BYTE *)ptr >= alloc_start && (BYTE *)ptr < alloc_end;
}


static void *get_mem_from_steamclient_dll(size_t size, unsigned int version, void *vtbl)
{
    static BYTE * const error_ptr = (BYTE *)~(ULONG_PTR)0;
    static const unsigned int magic = 0x53ba947a;
    static struct
    {
        unsigned int version;
        void *vtbl;
        size_t size;
        void *ptr;
    }
    allocated[256];
    static unsigned int allocated_count;
    static BYTE *alloc_base;
    unsigned int i;

    if (alloc_base == error_ptr)
    {
        /* Previously failed to locate the section. */
        return NULL;
    }

    if (alloc_base && (IsBadReadPtr(alloc_start, sizeof(magic)) || *(unsigned int *)alloc_start != magic))
    {
        TRACE("steamclient.dll reloaded.\n");
        alloc_base = alloc_start = alloc_end = NULL;
        allocated_count = 0;
    }

    for (i = 0; i < allocated_count; ++i)
    {
        if ((vtbl && allocated[i].vtbl == vtbl) || (!vtbl && allocated[i].version == version))
        {
            if (allocated[i].size != size)
            {
                FIXME("Size does not match.\n");
                return NULL;
            }
            return allocated[i].ptr;
        }
    }

    if (allocated_count == ARRAY_SIZE(allocated))
    {
        FIXME("Too many interface versions.\n");
        return NULL;
    }

    if (!alloc_base)
    {
        static const WCHAR steamclient64W[] = {'s','t','e','a','m','c','l','i','e','n','t','6','4','.','d','l','l',0};
        static const WCHAR steamclientW[] = {'s','t','e','a','m','c','l','i','e','n','t','.','d','l','l',0};
        const IMAGE_SECTION_HEADER *sec;
        const IMAGE_NT_HEADERS *nt;
        HMODULE mod;

        /* A 64 bit game loads steamclient64.dll, a 32 bit one steamclient.dll. */
        if (!(mod = GetModuleHandleW(steamclient64W)) && !(mod = GetModuleHandleW(steamclientW)))
        {
            WARN("Module not found, err %lu.\n", GetLastError());
            alloc_base = error_ptr;
            return NULL;
        }
        if (!(nt = RtlImageNtHeader(mod)))
        {
            FIXME("Got NULL NT image headers.\n");
            alloc_base = error_ptr;
            return NULL;
        }
        sec = (const IMAGE_SECTION_HEADER *)((const BYTE *)&nt->OptionalHeader + nt->FileHeader.SizeOfOptionalHeader);
        for (i = 0; i < nt->FileHeader.NumberOfSections; i++)
        {
            if (!memcmp(sec[i].Name, ".data", 5))
            {
                alloc_start = alloc_base = (BYTE *)mod + sec[i].VirtualAddress;
                alloc_end = alloc_base + sec[i].SizeOfRawData;
                if (alloc_end - alloc_start < sizeof(magic))
                {
                    ERR(".data section is too small.\n");
                    alloc_base = error_ptr;
                    return NULL;
                }
                TRACE("Found .data section, start %p, end %p.\n", alloc_base, alloc_end);
                *(unsigned int *)alloc_base = magic;
                alloc_base += sizeof(unsigned int);
                break;
            }
        }
        if (i == nt->FileHeader.NumberOfSections)
        {
            FIXME(".data section not found.\n");
            alloc_base = error_ptr;
            return NULL;
        }
    }

    if (alloc_end - alloc_base < size)
    {
        FIXME("Not enough section size left.\n");
        return NULL;
    }
    allocated[allocated_count].version = version;
    allocated[allocated_count].vtbl = vtbl;
    allocated[allocated_count].size = size;
    allocated[allocated_count].ptr = alloc_base;
    alloc_base += size;

    return allocated[allocated_count++].ptr;
}

void *alloc_mem_for_iface(size_t size, const char *iface_version)
{
    const char steamclient_iface_name[] = "SteamClient";
    unsigned int version;
    void *ret;

    /* Mafia II depends on SteamClient interface pointer to point inside
     * native Windows steamclient.dll. */
    if (strncmp(iface_version, steamclient_iface_name, ARRAY_SIZE(steamclient_iface_name) - 1))
         goto fallback;

    version = atoi(iface_version + ARRAY_SIZE(steamclient_iface_name) - 1);
    if (!version)
    {
        FIXME("Could not get iface version from %s.\n", iface_version);
        goto fallback;
    }

    if ((ret = get_mem_from_steamclient_dll(size, version, NULL)))
        return ret;

fallback:
    return HeapAlloc(GetProcessHeap(), 0, size);
}

void *alloc_vtable(void *vtable, unsigned int method_count, const char *iface_version)
{
#if defined(__x86_64__) || defined(__aarch64__)
    return vtable;
#else
    static const char *iface_names[] =
    {
        "SteamUser",
        "SteamFriends",
        "SteamUtils",
        "STEAMUSERSTATS",
        "STEAMAPPS",
        "SteamNetworking",
        "SteamClient",
    };
    unsigned int i;
    char *ret;

    for (i = 0; i < ARRAY_SIZE(iface_names); ++i)
        if (!strncmp(iface_version, iface_names[i], strlen(iface_names[i]) - 1))
            break;

    if (i == ARRAY_SIZE(iface_names))
        return vtable;

    if (!(ret = get_mem_from_steamclient_dll(method_count * sizeof(void *), 0, vtable)))
        return vtable;

    TRACE("iface %s, method_count %d, allocating from module.\n", iface_version, method_count);

    memcpy(ret, vtable, method_count * sizeof(void *));
    return ret;
#endif
}

struct steamclient_interface
{
    struct list entry;
    const char *name;
    struct u_iface u_iface;
    struct w_iface *w_iface;
};

static struct list steamclient_interfaces = LIST_INIT(steamclient_interfaces);

struct w_iface *create_win_interface( const char *name, struct u_iface u_iface )
{
    struct steamclient_interface *e;
    struct w_iface *ret = NULL;
    iface_constructor constructor;

    TRACE("trying to create %s\n", name);

    if (!u_iface.handle)
        return NULL;

    EnterCriticalSection(&steamclient_cs);

    LIST_FOR_EACH_ENTRY(e, &steamclient_interfaces, struct steamclient_interface, entry)
    {
        if (e->u_iface.handle == u_iface.handle && !strcmp(e->name, name))
        {
            ret = e->w_iface;
            TRACE("-> %p\n", ret);
            goto done;
        }
    }

    if ((constructor = find_iface_constructor( name )))
    {
        ret = constructor( u_iface );
        if (allocated_from_steamclient_dll( ret ) || allocated_from_steamclient_dll( ret->vtable ))
        {
            /* Don't cache interfaces allocated from steamclient.dll space.
             * steamclient may get reloaded by the app, miss the previous
             * data and potentially have different load address. */
            goto done;
        }

        e = HeapAlloc( GetProcessHeap(), 0, sizeof(*e) );
        e->name = strdup( name );
        e->u_iface = u_iface;
        e->w_iface = ret;
        list_add_tail( &steamclient_interfaces, &e->entry );

        goto done;
    }

done:
    LeaveCriticalSection(&steamclient_cs);
    if (!ret) ERR("Don't recognize interface name: %s\n", name);
    SetLastError(0);
    return ret;
}

void *get_unix_buffer( struct u_buffer buf )
{
    struct steamclient_get_unix_buffer_params params = {.buf = buf};
    void *ret;

    if ((UINT_PTR)buf.ptr == buf.ptr && (UINT_PTR)(buf.ptr + buf.len) == (buf.ptr + buf.len))
        return (void *)(UINT_PTR)buf.ptr;

    if (!(params.ptr = ret = HeapAlloc( GetProcessHeap(), 0, buf.len ))) return NULL;
    if (STEAMCLIENT_CALL( steamclient_get_unix_buffer, &params ) || (ret != params.ptr))
    {
        HeapFree( GetProcessHeap(), 0, ret );
        ret = params.ptr;
    }

    return ret;
}

static BOOL get_env_win(const WCHAR *name, char *value, unsigned int size)
{
    DWORD i, env_size;

    if (!(env_size = GetEnvironmentVariableW(name, (WCHAR *)value, size / sizeof(WCHAR))) || env_size >= size / sizeof(WCHAR))
        return FALSE;

    for (i = 0; i <= env_size; ++i)
        value[i] = ((WCHAR *)value)[i];

    return TRUE;
}

static int load_steamclient(void)
{
    char steam_app_id[4096], ignore_child_processes[4096];
    struct steamclient_init_params params = {.g_tmppath = temp_path_buffer};
    DWORD saved_err = GetLastError();

    if (!get_env_win(u"SteamAppId", steam_app_id, sizeof(steam_app_id)))
        params.steam_app_id_unset = TRUE;
    else
        params.steam_app_id = steam_app_id;

    if (!get_env_win(u"IgnoreChildProcesses", ignore_child_processes, sizeof(ignore_child_processes)))
        params.ignore_child_processes_unset = TRUE;
    else
        params.ignore_child_processes = ignore_child_processes;

    if (STEAMCLIENT_CALL( steamclient_init, &params )) return 0;
    if (!wsa_initialized)
    {
        /* Some games depend on winsocks being initialized after initializing Steam API. */
        WSADATA data;

        WSAStartup(0x202, &data);
        wsa_initialized = TRUE;
    }
    SetLastError(saved_err);
    return 1;
}

void *CDECL CreateInterface(const char *name, int *return_code)
{
    struct steamclient_CreateInterface_params params = {.name = name, .return_code = return_code};

    TRACE("name: %s, return_code: %p\n", name, return_code);
    if (!load_steamclient()) return NULL;
    if (STEAMCLIENT_CALL( steamclient_CreateInterface, &params )) return NULL;
    /* GAMELIB-DRM-TRACE BEGIN (Phase 56 D-15/D-16) */
    if (params._ret.handle) gamelib_trace_create_interface( name );
    /* GAMELIB-DRM-TRACE END */
    return create_win_interface( name, params._ret );
}

void execute_pending_callbacks(void)
{
    struct steamclient_next_callback_params params = {0};

    while (!STEAMCLIENT_CALL( steamclient_next_callback, &params ) && params._ret)
    {
        if (!params.callback || params.size > params.callback->size)
            params.callback = realloc( params.callback, params.size );
        else switch (params.callback->type)
        {
        case SOCKETS_DEBUG_OUTPUT:
            TRACE( "SOCKETS_DEBUG_OUTPUT func %p, type %u, msg %s.\n", params.callback->sockets_debug_output.pfnFunc,
                   params.callback->sockets_debug_output.type, debugstr_a( params.callback->sockets_debug_output.msg ) );
            params.callback->sockets_debug_output.pfnFunc( params.callback->sockets_debug_output.type, params.callback->sockets_debug_output.msg );
            break;
        case WARNING_MESSAGE_HOOK:
            TRACE( "WARNING_MESSAGE_HOOK func %p, severity %d, msg %s.\n", params.callback->warning_message_hook.pFunction,
                   params.callback->warning_message_hook.severity, debugstr_a( params.callback->warning_message_hook.msg ) );
            params.callback->warning_message_hook.pFunction( params.callback->warning_message_hook.severity, params.callback->warning_message_hook.msg );
            break;
        case CALL_CDECL_FUNC_DATA:
            TRACE( "CALL_CDECL_FUNC_DATA func %p, data %p.\n", params.callback->call_cdecl_func_data.pFunc, params.callback->call_cdecl_func_data.data );
            params.callback->call_cdecl_func_data.pFunc( params.callback->call_cdecl_func_data.data );
            break;
#define CALL_VTABLE_CASES(method) \
        case CALL_IFACE_VTABLE_ ## method ## _0: \
            TRACE( "CALL_IFACE_VTABLE_" #method "_0 iface %p.\n", params.callback->call_iface_vtable.iface ); \
            CALL_VTBL_FUNC( params.callback->call_iface_vtable.iface, method * 4, void, (void *), (params.callback->call_iface_vtable.iface) ); \
            break; \
        case CALL_IFACE_VTABLE_ ## method ## _1: \
            TRACE( "CALL_IFACE_VTABLE_" #method "_1 iface %p, arg0 %#I64x.\n", params.callback->call_iface_vtable.iface, \
                   params.callback->call_iface_vtable.arg0 ); \
            CALL_VTBL_FUNC( params.callback->call_iface_vtable.iface, method * 4, void, (void *, intptr_t), (params.callback->call_iface_vtable.iface, \
                            params.callback->call_iface_vtable.arg0) ); \
            break; \
        case CALL_IFACE_VTABLE_ ## method ## _2: \
            TRACE( "CALL_IFACE_VTABLE_" #method "_2 iface %p, arg0 %#I64x, arg1 %#I64x.\n", params.callback->call_iface_vtable.iface, \
                   params.callback->call_iface_vtable.arg0, params.callback->call_iface_vtable.arg1 ); \
            CALL_VTBL_FUNC( params.callback->call_iface_vtable.iface, method * 4, void, (void *, intptr_t, intptr_t), (params.callback->call_iface_vtable.iface, \
                            params.callback->call_iface_vtable.arg0, params.callback->call_iface_vtable.arg1) ); \
            break

        CALL_VTABLE_CASES(0);
        CALL_VTABLE_CASES(1);
        CALL_VTABLE_CASES(2);
#undef CALL_VTABLE_CASES
        case CALL_IFACE_VTABLE_0_SERVER_RESPONDED:
            TRACE( "CALL_IFACE_VTABLE_0_SERVER_RESPONDED iface %p, server %p.\n", params.callback->server_responded.iface,
                   params.callback->server_responded.server );
            CALL_VTBL_FUNC( params.callback->server_responded.iface, 0, void, (void *, gameserveritem_t_165 *), (params.callback->server_responded.iface,
                            params.callback->server_responded.server) );
            break;
        case CALL_IFACE_VTABLE_0_ADD_PLAYER_TO_LIST:
            TRACE( "CALL_IFACE_VTABLE_0_ADD_PLAYER_TO_LIST iface %p, name %s, score %u, time_played %f.\n", params.callback->add_player_to_list.iface,
                   debugstr_a( params.callback->add_player_to_list.name ), params.callback->add_player_to_list.score, params.callback->add_player_to_list.time_played );
            CALL_VTBL_FUNC( params.callback->add_player_to_list.iface, 0, void, (void *, const char *, int32_t, float), (params.callback->add_player_to_list.iface,
                            params.callback->add_player_to_list.name, params.callback->add_player_to_list.score, params.callback->add_player_to_list.time_played) );
            break;
        case CALL_IFACE_VTABLE_0_RULES_RESPONDED:
        {
            const char *value = params.callback->rules_responded.rule_and_value + strlen( params.callback->rules_responded.rule_and_value ) + 1;
            TRACE( "CALL_IFACE_VTABLE_0_RULES_RESPONDED iface %p, rule %s, value %s.\n", params.callback->rules_responded.iface,
                   debugstr_a( params.callback->rules_responded.rule_and_value ), debugstr_a( value ) );
            CALL_VTBL_FUNC( params.callback->rules_responded.iface, 0, void, (void *, const char *, const char *), (params.callback->rules_responded.iface,
                            params.callback->rules_responded.rule_and_value, value) );
            break;
        }
        case CALL_IFACE_VTABLE_0_FRIENDS_RESPONDED:
        {
            TRACE( "CALL_IFACE_VTABLE_0_FRIENDS_RESPONDED iface %p, steam_id %#I64x, name %s, connected %d.\n", params.callback->friends_responded.iface,
                   *(int64_t *)&params.callback->friends_responded.steamid,
                   debugstr_a( params.callback->friends_responded.name ), (int)params.callback->friends_responded.connected );
            CALL_VTBL_FUNC( params.callback->friends_responded.iface, 0, void, (void *, CSteamID, const char *, int8_t), (params.callback->friends_responded.iface,
                            params.callback->friends_responded.steamid, params.callback->friends_responded.name, params.callback->friends_responded.connected) );
            break;
        }
        }
    }

    free( params.callback );
}

static void *last_callback_data;

int8_t CDECL Steam_FreeLastCallback( int32_t pipe )
{
    struct steamclient_Steam_FreeLastCallback_params params = {.pipe = pipe};
    TRACE( "%u\n", pipe );

    if (!load_steamclient()) return 0;

    HeapFree( GetProcessHeap(), 0, last_callback_data );
    last_callback_data = NULL;

    STEAMCLIENT_CALL( steamclient_Steam_FreeLastCallback, &params );
    return params._ret;
}

int8_t CDECL Steam_BGetCallback( int32_t pipe, w_CallbackMsg_t *win_msg, int32_t *ignored )
{
    struct steamclient_Steam_BGetCallback_params params =
    {
        .pipe = pipe,
        .w_msg = win_msg,
        .ignored = ignored,
    };
    struct steamclient_callback_message_receive_params receive_params =
    {
        .w_msg = win_msg,
    };

    TRACE("%u, %p, %p\n", pipe, win_msg, ignored);

    if (!load_steamclient()) return 0;

    execute_pending_callbacks();

next_event:
    STEAMCLIENT_CALL( steamclient_Steam_BGetCallback, &params );
    if (!params._ret)
    {
        SetLastError(0);
        return FALSE;
    }
    receive_params.cookie = params.cookie;

    if (!(win_msg->m_pubParam = HeapAlloc( GetProcessHeap(), 0, win_msg->m_cubParam ))) return FALSE;
    last_callback_data = win_msg->m_pubParam;
    STEAMCLIENT_CALL( steamclient_callback_message_receive, &receive_params );
    /* GAMELIB-DRM-TRACE BEGIN (Phase 56 D-15/D-16) */
    /* Phase 58 D-08: the game drained a broadcast callback; log its id if in the closed set. */
    gamelib_trace_callback( win_msg->m_iCallback, win_msg->m_pubParam, win_msg->m_cubParam );
    /* GAMELIB-DRM-TRACE END */

    if (win_msg->m_iCallback == 0x14b) /* GameOverlayActivated_t::k_iCallback */
    {
        uint8_t activated = *(uint8_t *)win_msg->m_pubParam;
        FIXME( "HACK: Steam overlay %sactivated, %sabling all input events.\n",
               activated ? "" : "de", activated ? "dis" : "en" );
        if (activated)
        {
            SetEvent( steam_overlay_event );
            keybd_event( VK_LSHIFT, 0x2a /* lshift scancode */, KEYEVENTF_KEYUP, 0 );
            keybd_event( VK_RSHIFT, 0x36 /* rshift scancode */, KEYEVENTF_KEYUP, 0 );
            keybd_event( VK_TAB, 0x0f /* tab scancode */, KEYEVENTF_KEYUP, 0 );
        }
        else
        {
            if (WaitForSingleObject( steam_overlay_event, 0 ) == WAIT_TIMEOUT)
            {
                FIXME( "Spurious steam overlay deactivate event, skipping.\n" );
                Steam_FreeLastCallback( pipe );
                goto next_event;
            }
            ResetEvent( steam_overlay_event );
        }
    }

    execute_pending_callbacks();
    return params._ret;
}

int8_t CDECL Steam_GetAPICallResult( int32_t pipe, uint64_t call, void *w_callback,
                                   int w_callback_len, int id, int8_t *failed )
{
    struct steamclient_Steam_GetAPICallResult_params params =
    {
        .pipe = pipe,
        .call = call,
        .w_callback = w_callback,
        .w_callback_len = w_callback_len,
        .id = id,
        .failed = failed,
    };

    TRACE( "%u, x, %p, %u, %u, %p\n", pipe, w_callback, w_callback_len, id, failed );

    if (!load_steamclient()) return FALSE;
    STEAMCLIENT_CALL( steamclient_Steam_GetAPICallResult, &params );
    /* GAMELIB-DRM-TRACE BEGIN (Phase 56 D-15/D-16) */
    /* Phase 58 D-08: a call result the game fetched; log the expected callback id only on success. */
    if (params._ret) gamelib_trace_callback( id, w_callback, (uint32_t)w_callback_len );
    /* GAMELIB-DRM-TRACE END */
    return params._ret;
}

void CDECL Steam_ReleaseThreadLocalMemory(int bThreadExit)
{
    struct steamclient_Steam_ReleaseThreadLocalMemory_params params = {.thread_exit = bThreadExit};
    TRACE("%d\n", bThreadExit);

    if (!load_steamclient()) return;

    STEAMCLIENT_CALL( steamclient_Steam_ReleaseThreadLocalMemory, &params );
}

void CDECL Breakpad_SteamMiniDumpInit( uint32_t a, const char *b, const char *c )
{
    TRACE("\n");
}

void CDECL Breakpad_SteamSetAppID( uint32_t appid )
{
    TRACE("\n");
}

int CDECL Breakpad_SteamSetSteamID( uint64_t steamid )
{
    TRACE("\n");
    return 1;
}

int CDECL Breakpad_SteamWriteMiniDumpSetComment(const char *comment)
{
    TRACE("\n");
    return 1;
}

void CDECL Breakpad_SteamWriteMiniDumpUsingExceptionInfoWithBuildId(int a, int b)
{
    TRACE("\n");
}

int8_t CDECL Steam_IsKnownInterface( const char *pchVersion )
{
    struct steamclient_Steam_IsKnownInterface_params params = {.version = pchVersion};
    TRACE("%s\n", pchVersion);
    load_steamclient();
    STEAMCLIENT_CALL( steamclient_Steam_IsKnownInterface, &params );
    return params._ret;
}

void CDECL Steam_NotifyMissingInterface( int32_t hSteamPipe, const char *pchVersion )
{
    struct steamclient_Steam_NotifyMissingInterface_params params = {.pipe = hSteamPipe, .version = pchVersion};
    TRACE("%u %s\n", hSteamPipe, pchVersion);
    load_steamclient();
    STEAMCLIENT_CALL( steamclient_Steam_NotifyMissingInterface, &params );
}

void steamclient_init_registry(void)
{
    load_steamclient();
    STEAMCLIENT_CALL( steamclient_init_registry, NULL );
}
