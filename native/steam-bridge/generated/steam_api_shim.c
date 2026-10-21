/**
 * GENERATED FILE -- DO NOT EDIT BY HAND.
 * Produced by meta/gen_vtables.ts (`pnpm gen-vtables`) from the GameLib-authored
 * interface manifests in meta/sdk/*.manifest.json (D-09 -- never vendored Valve
 * Steamworks SDK header text; D-07 -- source is committed, the PE binary is
 * built only at packaging time, Plan 24-07).
 *
 * Implements:
 *   - The flat SteamAPI_* exports (acceptance-set superset, R3 finding #9).
 *   - Per-interface __thiscall C++ vtables (spike 006's proven ABI mechanism)
 *     for: SteamUser023, SteamFriends018, SteamUser016, SteamFriends011, SteamUtils005, STEAMAPPS_INTERFACE_VERSION004, STEAMUSERSTATS_INTERFACE_VERSION010, SteamFriends013, STEAMAPPS_INTERFACE_VERSION005, STEAMUSERSTATS_INTERFACE_VERSION011, STEAMREMOTESTORAGE_INTERFACE_VERSION005, SteamMatchMaking009, SteamMatchMakingServers002, SteamNetworking005, STEAMREMOTESTORAGE_INTERFACE_VERSION010.
 *
 * ABI ground truth (24-RESEARCH.md Pattern 2): MSVC __thiscall -- `this` in
 * ECX, callee cleans the stack; ret N = summed non-`this` param widths (+4 for
 * a hidden sret pointer). Register-return for <=8-byte returns (EAX or
 * EDX:EAX); hidden-return-pointer (sret) for struct returns > 8 bytes.
 *
 * Wire frame (24-RESEARCH.md Pattern 3 -- Plan 24-02's helper speaks the
 * IDENTICAL frame):
 *   Request:  [4B LE len][4B LE request_id][2B LE ordinal][2B LE slot][N arg blob]
 *   Response: [4B LE len][4B LE request_id][1B status][N return blob]
 */

#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

// D-51-01: there is NO fixed, shared port left in this file at all -- each
// per-appId native helper binds an OS-assigned ephemeral port and the
// backend hands it to THIS specific game process via a small text file,
// `gamelib_bridge.cfg`, written beside its own .exe
// (src/backend/storeManagers/steam/bridge/bridgeConfig.ts). The shim reads
// that file, once, lazily, from beside its OWN module path -- never from a
// hardcoded port, never from a second/divergent filename.
#define BRIDGE_CONFIG_FILENAME "gamelib_bridge.cfg"
#define BRIDGE_CFG_READ_MAX 4096

// Matches protocol.ts's CONTROL_ORDINAL / CONTROL_SLOT.hello exactly --
// the connect-time handshake bridge_helper.c answers unconditionally
// (independent of whether Steam itself is signed in), proving this really
// is a GameLib per-appId helper before any real interface call is issued.
#define BRIDGE_CONTROL_ORDINAL 0xffff
#define BRIDGE_CONTROL_SLOT_HELLO 2

// CR-01: byte capacity of each string-returning stub's shim-owned static
// return buffer -- emitted directly from the generator's
// STRING_RETURN_BUF_BYTES constant, so this generated file and the value
// emitVtableStub() sizes each stub's transact buffer against can never
// drift apart.
#define STRING_RETURN_BUF_BYTES 256

/*
Wire marshaling layout (51-06 Task 3; 51-10 mirrors this exactly):

Request blob (per method, params in manifest declaration order):
  - no kind, or kind 'value': paramWidth(type) raw bytes, host byte order.
  - kind 'in-string': [u32 len][len bytes, NOT NUL-terminated]. A NULL
    pointer packs len = 0xFFFFFFFF and no bytes. len is the real string's
    byte length capped at WIRE_IN_STRING_MAX_BYTES.
  - kind 'out-value': nothing -- an out-value param is NEVER sent.
  - kind 'out-buffer': [u32 capacity] -- the sibling param named by
    sizeParam, read at call time and capped at WIRE_OUT_BUFFER_MAX_BYTES.

Response blob (per method):
  - the return value: 0 bytes (returnKind 'void'), 4 bytes (int32/pointer/
    float), 8 bytes (int64/double), [u32 len][bytes] (returnKind 'string',
    decoded by the dedicated string-return branch), or structSize bytes
    (returnKind 'class', the sret branch).
  - then, for every 'out-value' param in declaration order: valueType's
    width (int32/uint32/float/bool = 4 bytes, uint64 = 8 bytes).
  - then, for every 'out-buffer' param in declaration order: [u32 len][len
    bytes] -- len is what the helper actually has, which may exceed the
    caller's capacity; the shim copies min(len, capacity) and NUL-
    terminates only when the param's own type is a NUL-terminated string
    type (e.g. 'char*').

*/
#define WIRE_IN_STRING_MAX_BYTES 4096
#define WIRE_OUT_BUFFER_MAX_BYTES 4096

// 51-10: digest of the sorted (interface, ordinal, slot, layout) wire-method
// tuples this shim marshals -- computeWireTableHash(manifests), the SAME
// function 51-10's helper-side generateDispatchHeader() calls against the
// IDENTICAL manifest set. A reader (or a pin test) can diff this against
// BRIDGE_DISPATCH_TABLE_HASH in the generated bridge_dispatch.h to catch the
// shim and the helper's dispatch table drifting apart -- never a silent
// mismatch between the two generated artifacts.
#define BRIDGE_SHIM_TABLE_HASH "7ca9fac60fe6"

// 51-06 Task 2: bounded storage for every `iface.<Family>=<Version>`
// pair `gamelib_bridge.cfg` carries -- the backend
// (bridgeConfig.ts's `writeBridgeConfig`) writes one such line per family
// the game needs pinned to a specific interface VERSION, so a bare legacy
// accessor (`SteamUser()`) knows which vtable instance to hand back. 64
// entries and 64-byte fields are generous headroom over any real game's
// handful of families; a longer line or a fuller table is silently
// ignored (never a buffer overrun, never a crash on a malformed cfg).
#define MAX_IFACE_CFG_ENTRIES 64
#define MAX_IFACE_CFG_LINE_BYTES 256
#define MAX_IFACE_CFG_FIELD_BYTES 64

typedef struct {
  char family[MAX_IFACE_CFG_FIELD_BYTES];
  char version[MAX_IFACE_CFG_FIELD_BYTES];
} GIfaceCfgEntry;

static GIfaceCfgEntry g_iface_cfg_entries[MAX_IFACE_CFG_ENTRIES];
static int g_iface_cfg_count = 0;

// 51-06: every generated vtable stub uses MSVC __thiscall -- but THAT
// attribute is only meaningful (and only accepted by clang/gcc) on an i386
// target; on every other target (including the x64 target 51-15 adds) a
// __thiscall function would be rejected at compile time, and the x64 MSVC
// member-function convention passes `this` in RCX by the platform's own
// ordinary calling convention with no attribute needed at all. Guarding on
// `__i386__` (not a generator-time flag) means ONE generated .c file
// compiles correctly for both targets -- the arch becomes a build-time
// parameter, never a forked generator.
#if defined(__i386__)
#define THISCALL __attribute__((thiscall))
#else
#define THISCALL
#endif

static SOCKET g_bridge_sock = INVALID_SOCKET;
static uint32_t g_next_request_id = 1;

// 0 until load_bridge_port_once() resolves a valid port out of
// gamelib_bridge.cfg -- bridge_ensure_connected() refuses to connect while
// it is 0 (D-51-01: fail closed, never a fixed-port fallback).
static int g_bridge_port = 0;
static int g_bridge_port_load_attempted = 0;

// 51-07: an identity marker the version-capture pass can grep the shipped
// DLL for, so it never mistakes a GameLib shim for a game's own original
// steam_api.dll. Referenced from SteamAPI_Init() through a volatile read
// below so the linker cannot dead-strip it as unused.
static const char g_gamelib_shim_marker[] = "GameLibSteamBridgeShim/2";

/*
 * Scans `buf` (the raw bytes read from gamelib_bridge.cfg) line-by-line
 * for a `port=<digits>` line and, if its value parses as a valid
 * ephemeral/registered port (1024-65535), assigns g_bridge_port. Any other
 * line (appid=, iface.*=, a trailing blank line) is silently skipped --
 * this parser only ever looks for the one field it needs.
 */
static void parse_bridge_port_from_buffer(const char *buf, uint32_t len) {
  uint32_t i = 0;
  while (i < len) {
    uint32_t lineStart = i;
    while (i < len && buf[i] != '\n' && buf[i] != '\r') i++;
    uint32_t lineLen = i - lineStart;
    if (lineLen > 5 && strncmp(buf + lineStart, "port=", 5) == 0) {
      char numBuf[16];
      uint32_t numLen = lineLen - 5;
      if (numLen >= sizeof(numBuf)) numLen = sizeof(numBuf) - 1;
      memcpy(numBuf, buf + lineStart + 5, numLen);
      numBuf[numLen] = '\0';
      long parsed = strtol(numBuf, NULL, 10);
      if (parsed >= 1024 && parsed <= 65535) {
        g_bridge_port = (int)parsed;
      }
    } else if (
      lineLen > 6 &&
      lineLen <= MAX_IFACE_CFG_LINE_BYTES &&
      strncmp(buf + lineStart, "iface.", 6) == 0 &&
      g_iface_cfg_count < MAX_IFACE_CFG_ENTRIES
    ) {
      uint32_t lineEnd = lineStart + lineLen;
      uint32_t eq = lineStart + 6;
      while (eq < lineEnd && buf[eq] != '=') eq++;
      if (eq < lineEnd) {
        uint32_t familyLen = eq - (lineStart + 6);
        uint32_t versionLen = lineEnd - (eq + 1);
        if (
          familyLen > 0 && familyLen < MAX_IFACE_CFG_FIELD_BYTES &&
          versionLen > 0 && versionLen < MAX_IFACE_CFG_FIELD_BYTES
        ) {
          GIfaceCfgEntry *entry = &g_iface_cfg_entries[g_iface_cfg_count];
          memcpy(entry->family, buf + lineStart + 6, familyLen);
          entry->family[familyLen] = '\0';
          memcpy(entry->version, buf + eq + 1, versionLen);
          entry->version[versionLen] = '\0';
          g_iface_cfg_count++;
        }
      }
    }
    while (i < len && (buf[i] == '\n' || buf[i] == '\r')) i++;
  }
}

/*
 * Resolves gamelib_bridge.cfg's `port=` value into g_bridge_port -- ONCE,
 * lazily, on first use (g_bridge_port_load_attempted guards every repeat
 * call). The file is resolved beside THIS DLL's own on-disk path (never a
 * caller-supplied/relative path): GetModuleHandleExA with
 * GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS resolves the module that contains
 * this very function, then GetModuleFileNameA yields that module's full
 * path; the file name component is replaced with BRIDGE_CONFIG_FILENAME.
 * On ANY failure (module path unresolvable, file missing, file
 * unreadable, no valid `port=` line) g_bridge_port simply stays 0 --
 * there is no fixed-port fallback (D-51-01): a missing/malformed cfg means
 * bridge_ensure_connected() below refuses to connect at all, rather than
 * ever guessing the old shared port.
 */
static void load_bridge_port_once(void) {
  if (g_bridge_port_load_attempted) return;
  g_bridge_port_load_attempted = 1;

  HMODULE hModule = NULL;
  if (!GetModuleHandleExA(
        GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
        (LPCSTR)&load_bridge_port_once,
        &hModule)) {
    return;
  }

  char cfgPath[MAX_PATH];
  DWORD pathLen = GetModuleFileNameA(hModule, cfgPath, sizeof(cfgPath));
  if (pathLen == 0 || pathLen >= sizeof(cfgPath)) {
    return;
  }

  char *lastSlash = strrchr(cfgPath, '\\');
  char *fileNameStart = lastSlash ? lastSlash + 1 : cfgPath;
  size_t prefixLen = (size_t)(fileNameStart - cfgPath);
  if (prefixLen + strlen(BRIDGE_CONFIG_FILENAME) >= sizeof(cfgPath)) {
    return;
  }
  strcpy(fileNameStart, BRIDGE_CONFIG_FILENAME);

  FILE *f = fopen(cfgPath, "rb");
  if (!f) return;
  char buf[BRIDGE_CFG_READ_MAX];
  size_t readLen = fread(buf, 1, sizeof(buf), f);
  fclose(f);
  if (readLen == 0) return;

  parse_bridge_port_from_buffer(buf, (uint32_t)readLen);
}

static int bridge_ensure_connected(void) {
  if (g_bridge_sock != INVALID_SOCKET) return 1;
  load_bridge_port_once();
  // D-51-01: fail closed -- never falls back to a fixed/guessed port.
  if (g_bridge_port == 0) return 0;
  WSADATA w;
  if (WSAStartup(MAKEWORD(2, 2), &w) != 0) return 0;
  SOCKET s = socket(AF_INET, SOCK_STREAM, 0);
  struct sockaddr_in a; memset(&a, 0, sizeof a);
  a.sin_family = AF_INET;
  a.sin_port = htons((uint16_t)g_bridge_port);
  a.sin_addr.s_addr = inet_addr("127.0.0.1"); // loopback-only, never a routable interface
  if (connect(s, (struct sockaddr *)&a, sizeof a) != 0) { closesocket(s); return 0; }
  g_bridge_sock = s;
  return 1;
}

/*
 * One real attempt at marshaling an interface-ordinal + method-slot call
 * over the persistent bridge connection. `*transportFailed` distinguishes
 * a broken CONNECTION (worth retrying once on a fresh socket -- see
 * bridge_transact below) from a legitimate error RESPONSE (a live, healthy
 * connection that simply answered status != 0 -- never retried, since
 * retrying would just repeat the same answer).
 */
static int bridge_transact_once(uint16_t ordinal, uint16_t slot,
                                 const uint8_t *argBuf, uint32_t argLen,
                                 uint8_t *retBuf, uint32_t retBufCap, uint32_t *retLenOut,
                                 int *transportFailed) {
  *retLenOut = 0;
  *transportFailed = 0;
  if (!bridge_ensure_connected()) { *transportFailed = 1; return 0; }

  uint32_t requestId = g_next_request_id++;
  uint32_t frameLen = 4 + 2 + 2 + argLen;
  uint8_t header[12];
  memcpy(header + 0, &frameLen, 4);
  memcpy(header + 4, &requestId, 4);
  memcpy(header + 8, &ordinal, 2);
  memcpy(header + 10, &slot, 2);

  if (send(g_bridge_sock, (const char *)header, sizeof(header), 0) != sizeof(header)) { *transportFailed = 1; return 0; }
  if (argLen > 0 && send(g_bridge_sock, (const char *)argBuf, argLen, 0) != (int)argLen) { *transportFailed = 1; return 0; }

  uint8_t respHeader[9];
  if (recv(g_bridge_sock, (char *)respHeader, sizeof(respHeader), MSG_WAITALL) != (int)sizeof(respHeader)) { *transportFailed = 1; return 0; }
  uint32_t respLen, respRequestId; uint8_t status;
  memcpy(&respLen, respHeader + 0, 4);
  memcpy(&respRequestId, respHeader + 4, 4);
  status = respHeader[8];
  if (respRequestId != requestId) { *transportFailed = 1; return 0; }
  if (status != 0) return 0; // legitimate error response -- healthy connection, do not retry

  uint32_t retLen = respLen - 5; // subtract request_id(4) + status(1)
  if (retLen > retBufCap) return 0; // caller-buffer mismatch -- not a transport failure
  if (retLen > 0 && recv(g_bridge_sock, (char *)retBuf, retLen, MSG_WAITALL) != (int)retLen) { *transportFailed = 1; return 0; }
  *retLenOut = retLen;
  return 1;
}

/*
 * Marshal one interface-ordinal + method-slot call to the persistent bridge
 * connection and block for the response (Pattern 3). Returns 1 on ok, 0 on
 * transport/protocol error -- callers fall back to a safe zero/false value on
 * error (this shim is a compatibility layer, not a DRM gate, spike 008).
 *
 * Retries the WHOLE request exactly once, on a fresh connection, when the
 * first attempt fails at the TRANSPORT level -- the helper's own 5s
 * SO_RCVTIMEO closes an idle persistent connection, so a transport failure
 * on an otherwise-healthy link usually just means "reconnect and resend",
 * not a real protocol error.
 */
static int bridge_transact(uint16_t ordinal, uint16_t slot,
                            const uint8_t *argBuf, uint32_t argLen,
                            uint8_t *retBuf, uint32_t retBufCap, uint32_t *retLenOut) {
  int transportFailed = 0;
  int ok = bridge_transact_once(ordinal, slot, argBuf, argLen, retBuf, retBufCap, retLenOut, &transportFailed);
  if (ok || !transportFailed) return ok;

  if (g_bridge_sock != INVALID_SOCKET) {
    closesocket(g_bridge_sock);
    g_bridge_sock = INVALID_SOCKET;
  }
  return bridge_transact_once(ordinal, slot, argBuf, argLen, retBuf, retBufCap, retLenOut, &transportFailed);
}

typedef void *vfn;

// === SteamUser023 (ordinal 1, family SteamUser) ===

// slot 0: GetHSteamUser() -> int32 | __thiscall ret 0
static int32_t THISCALL vt_SteamUser023_GetHSteamUser(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(1, 0, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int32_t ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 1: BLoggedOn() -> bool | __thiscall ret 0
static int THISCALL vt_SteamUser023_BLoggedOn(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(1, 1, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 2: GetSteamID() -> CSteamID | __thiscall ret 4 (SRET -- hidden return pointer)
static void * THISCALL vt_SteamUser023_GetSteamID(void *self, void *sretOut) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[8]; uint32_t retlen = 0;
  if (!bridge_transact(1, 2, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 8) {
    memset(sretOut, 0, 8);
    return sretOut;
  }
  memcpy(sretOut, retbuf, 8);
  return sretOut;
}

// slot 3: InitiateGameConnection_DEPRECATED(void* pAuthBlob, int32 cbMaxAuthBlob, CSteamID steamIDGameServer, uint32 unIPServer, uint32 usPortServer, bool bSecure) -> int32 | __thiscall ret 28 (STUB)
static int32_t THISCALL vt_SteamUser023_InitiateGameConnection_DEPRECATED(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5, uint32_t dummy6) {
  (void)self;
  return 0;
}

// slot 4: TerminateGameConnection_DEPRECATED(uint32 unIPServer, uint32 usPortServer) -> void | __thiscall ret 8 (STUB)
static void THISCALL vt_SteamUser023_TerminateGameConnection_DEPRECATED(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
}

// slot 5: TrackAppUsageEvent(CGameID gameID, int32 eAppUsageEvent, const char* pchExtraInfo) -> void | __thiscall ret 16 (STUB)
static void THISCALL vt_SteamUser023_TrackAppUsageEvent(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
}

// slot 6: GetUserDataFolder(char* pchBuffer, int32 cubBuffer) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamUser023_GetUserDataFolder(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 7: StartVoiceRecording() -> void | __thiscall ret 0 (STUB)
static void THISCALL vt_SteamUser023_StartVoiceRecording(void *self) {
  (void)self;
}

// slot 8: StopVoiceRecording() -> void | __thiscall ret 0 (STUB)
static void THISCALL vt_SteamUser023_StopVoiceRecording(void *self) {
  (void)self;
}

// slot 9: GetAvailableVoice(uint32* pcbCompressed, uint32* pcbUncompressed_Deprecated, uint32 nUncompressedVoiceDesiredSampleRate_Deprecated) -> uint32 | __thiscall ret 12 (STUB)
static uint32_t THISCALL vt_SteamUser023_GetAvailableVoice(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 10: GetVoice(bool bWantCompressed, void* pDestBuffer, uint32 cbDestBufferSize, uint32* nBytesWritten, bool bWantUncompressed_Deprecated, void* pUncompressedDestBuffer_Deprecated, uint32 cbUncompressedDestBufferSize_Deprecated, uint32* nUncompressBytesWritten_Deprecated, uint32 nUncompressedVoiceDesiredSampleRate_Deprecated) -> uint32 | __thiscall ret 36 (STUB)
static uint32_t THISCALL vt_SteamUser023_GetVoice(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5, uint32_t dummy6, uint32_t dummy7, uint32_t dummy8) {
  (void)self;
  return 0;
}

// slot 11: DecompressVoice(const void* pCompressed, uint32 cbCompressed, void* pDestBuffer, uint32 cbDestBufferSize, uint32* nBytesWritten, uint32 nDesiredSampleRate) -> uint32 | __thiscall ret 24 (STUB)
static uint32_t THISCALL vt_SteamUser023_DecompressVoice(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5) {
  (void)self;
  return 0;
}

// slot 12: GetVoiceOptimalSampleRate() -> uint32 | __thiscall ret 0 (STUB)
static uint32_t THISCALL vt_SteamUser023_GetVoiceOptimalSampleRate(void *self) {
  (void)self;
  return 0;
}

// slot 13: GetAuthSessionTicket(void* pTicket, int32 cbMaxTicket, uint32* pcbTicket, const SteamNetworkingIdentity_144* pSteamNetworkingIdentity) -> uint32 | __thiscall ret 16 (STUB)
static uint32_t THISCALL vt_SteamUser023_GetAuthSessionTicket(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 14: GetAuthTicketForWebApi(const char* pchIdentity) -> uint32 | __thiscall ret 4 (STUB)
static uint32_t THISCALL vt_SteamUser023_GetAuthTicketForWebApi(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 15: BeginAuthSession(const void* pAuthTicket, int32 cbAuthTicket, CSteamID steamID) -> uint32 | __thiscall ret 16 (STUB)
static uint32_t THISCALL vt_SteamUser023_BeginAuthSession(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 16: EndAuthSession(CSteamID steamID) -> void | __thiscall ret 8 (STUB)
static void THISCALL vt_SteamUser023_EndAuthSession(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
}

// slot 17: CancelAuthTicket(uint32 hAuthTicket) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_SteamUser023_CancelAuthTicket(void *self, uint32_t dummy0) {
  (void)self;
}

// slot 18: UserHasLicenseForApp(CSteamID steamID, uint32 appID) -> uint32 | __thiscall ret 12 (STUB)
static uint32_t THISCALL vt_SteamUser023_UserHasLicenseForApp(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 19: BIsBehindNAT() -> bool | __thiscall ret 0 (STUB)
static int THISCALL vt_SteamUser023_BIsBehindNAT(void *self) {
  (void)self;
  return 0;
}

// slot 20: AdvertiseGame(CSteamID steamIDGameServer, uint32 unIPServer, uint32 usPortServer) -> void | __thiscall ret 16 (STUB)
static void THISCALL vt_SteamUser023_AdvertiseGame(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
}

// slot 21: RequestEncryptedAppTicket(void* pDataToInclude, int32 cbDataToInclude) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_SteamUser023_RequestEncryptedAppTicket(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 22: GetEncryptedAppTicket(void* pTicket, int32 cbMaxTicket, uint32* pcbTicket) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamUser023_GetEncryptedAppTicket(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 23: GetGameBadgeLevel(int32 nSeries, bool bFoil) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamUser023_GetGameBadgeLevel(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 24: GetPlayerSteamLevel() -> int32 | __thiscall ret 0 (STUB)
static int32_t THISCALL vt_SteamUser023_GetPlayerSteamLevel(void *self) {
  (void)self;
  return 0;
}

// slot 25: RequestStoreAuthURL(const char* pchRedirectURL) -> uint64 | __thiscall ret 4 (STUB)
static uint64_t THISCALL vt_SteamUser023_RequestStoreAuthURL(void *self, uint32_t dummy0) {
  (void)self;
  return 0LL;
}

// slot 26: BIsPhoneVerified() -> bool | __thiscall ret 0 (STUB)
static int THISCALL vt_SteamUser023_BIsPhoneVerified(void *self) {
  (void)self;
  return 0;
}

// slot 27: BIsTwoFactorEnabled() -> bool | __thiscall ret 0 (STUB)
static int THISCALL vt_SteamUser023_BIsTwoFactorEnabled(void *self) {
  (void)self;
  return 0;
}

// slot 28: BIsPhoneIdentifying() -> bool | __thiscall ret 0 (STUB)
static int THISCALL vt_SteamUser023_BIsPhoneIdentifying(void *self) {
  (void)self;
  return 0;
}

// slot 29: BIsPhoneRequiringVerification() -> bool | __thiscall ret 0 (STUB)
static int THISCALL vt_SteamUser023_BIsPhoneRequiringVerification(void *self) {
  (void)self;
  return 0;
}

// slot 30: GetMarketEligibility() -> uint64 | __thiscall ret 0 (STUB)
static uint64_t THISCALL vt_SteamUser023_GetMarketEligibility(void *self) {
  (void)self;
  return 0LL;
}

// slot 31: GetDurationControl() -> uint64 | __thiscall ret 0 (STUB)
static uint64_t THISCALL vt_SteamUser023_GetDurationControl(void *self) {
  (void)self;
  return 0LL;
}

// slot 32: BSetDurationControlOnlineState(uint32 eNewState) -> bool | __thiscall ret 4 (STUB)
static int THISCALL vt_SteamUser023_BSetDurationControlOnlineState(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

static vfn g_steamuser023_vtbl[33] = {
  (vfn)vt_SteamUser023_GetHSteamUser, // slot 0
  (vfn)vt_SteamUser023_BLoggedOn, // slot 1
  (vfn)vt_SteamUser023_GetSteamID, // slot 2
  (vfn)vt_SteamUser023_InitiateGameConnection_DEPRECATED, // slot 3
  (vfn)vt_SteamUser023_TerminateGameConnection_DEPRECATED, // slot 4
  (vfn)vt_SteamUser023_TrackAppUsageEvent, // slot 5
  (vfn)vt_SteamUser023_GetUserDataFolder, // slot 6
  (vfn)vt_SteamUser023_StartVoiceRecording, // slot 7
  (vfn)vt_SteamUser023_StopVoiceRecording, // slot 8
  (vfn)vt_SteamUser023_GetAvailableVoice, // slot 9
  (vfn)vt_SteamUser023_GetVoice, // slot 10
  (vfn)vt_SteamUser023_DecompressVoice, // slot 11
  (vfn)vt_SteamUser023_GetVoiceOptimalSampleRate, // slot 12
  (vfn)vt_SteamUser023_GetAuthSessionTicket, // slot 13
  (vfn)vt_SteamUser023_GetAuthTicketForWebApi, // slot 14
  (vfn)vt_SteamUser023_BeginAuthSession, // slot 15
  (vfn)vt_SteamUser023_EndAuthSession, // slot 16
  (vfn)vt_SteamUser023_CancelAuthTicket, // slot 17
  (vfn)vt_SteamUser023_UserHasLicenseForApp, // slot 18
  (vfn)vt_SteamUser023_BIsBehindNAT, // slot 19
  (vfn)vt_SteamUser023_AdvertiseGame, // slot 20
  (vfn)vt_SteamUser023_RequestEncryptedAppTicket, // slot 21
  (vfn)vt_SteamUser023_GetEncryptedAppTicket, // slot 22
  (vfn)vt_SteamUser023_GetGameBadgeLevel, // slot 23
  (vfn)vt_SteamUser023_GetPlayerSteamLevel, // slot 24
  (vfn)vt_SteamUser023_RequestStoreAuthURL, // slot 25
  (vfn)vt_SteamUser023_BIsPhoneVerified, // slot 26
  (vfn)vt_SteamUser023_BIsTwoFactorEnabled, // slot 27
  (vfn)vt_SteamUser023_BIsPhoneIdentifying, // slot 28
  (vfn)vt_SteamUser023_BIsPhoneRequiringVerification, // slot 29
  (vfn)vt_SteamUser023_GetMarketEligibility, // slot 30
  (vfn)vt_SteamUser023_GetDurationControl, // slot 31
  (vfn)vt_SteamUser023_BSetDurationControlOnlineState, // slot 32
};
struct FakeSteamUser023 { vfn *vptr; };
static struct FakeSteamUser023 g_steamuser023_instance = { g_steamuser023_vtbl };

// === SteamFriends018 (ordinal 2, family SteamFriends) ===

// slot 0: GetPersonaName() -> const char* | __thiscall ret 0 (STRING RETURN -- shim-owned buffer, CR-01)
static char vt_SteamFriends018_GetPersonaName_buf[STRING_RETURN_BUF_BYTES];
static const char * THISCALL vt_SteamFriends018_GetPersonaName(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[STRING_RETURN_BUF_BYTES - 1]; uint32_t retlen = 0;
  if (!bridge_transact(2, 0, argbuf, 0, retbuf, sizeof(retbuf), &retlen)) {
    vt_SteamFriends018_GetPersonaName_buf[0] = '\0';
    return vt_SteamFriends018_GetPersonaName_buf;
  }
  memcpy(vt_SteamFriends018_GetPersonaName_buf, retbuf, retlen);
  vt_SteamFriends018_GetPersonaName_buf[retlen] = '\0';
  return vt_SteamFriends018_GetPersonaName_buf;
}

// slot 1: GetPersonaState() -> uint32 | __thiscall ret 0
static uint32_t THISCALL vt_SteamFriends018_GetPersonaState(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(2, 1, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  uint32_t ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 2: GetFriendCount(int32 iFriendFlags) -> int32 | __thiscall ret 4 (STUB)
static int32_t THISCALL vt_SteamFriends018_GetFriendCount(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 3: GetFriendByIndex(CSteamID* _ret, int32 iFriend) -> CSteamID | __thiscall ret 12 (SRET -- hidden return pointer) (STUB)
static void * THISCALL vt_SteamFriends018_GetFriendByIndex(void *self, void *sretOut, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  memset(sretOut, 0, 8);
  return sretOut;
}

// slot 4: GetFriendRelationship(CSteamID steamIDFriend) -> uint32 | __thiscall ret 8 (STUB)
static uint32_t THISCALL vt_SteamFriends018_GetFriendRelationship(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 5: GetFriendPersonaState(CSteamID steamIDFriend) -> uint32 | __thiscall ret 8 (STUB)
static uint32_t THISCALL vt_SteamFriends018_GetFriendPersonaState(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 6: GetFriendPersonaName(CSteamID steamIDFriend) -> const char* | __thiscall ret 8 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_SteamFriends018_GetFriendPersonaName(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return "";
}

// slot 7: GetFriendGamePlayed(CSteamID steamIDFriend, FriendGameInfo_t* pFriendGameInfo) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamFriends018_GetFriendGamePlayed(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 8: GetFriendPersonaNameHistory(CSteamID steamIDFriend, int32 iPersonaName) -> const char* | __thiscall ret 12 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_SteamFriends018_GetFriendPersonaNameHistory(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return "";
}

// slot 9: GetFriendSteamLevel(CSteamID steamIDFriend) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends018_GetFriendSteamLevel(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 10: GetPlayerNickname(CSteamID steamIDPlayer) -> const char* | __thiscall ret 8 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_SteamFriends018_GetPlayerNickname(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return "";
}

// slot 11: GetFriendsGroupCount() -> int32 | __thiscall ret 0 (STUB)
static int32_t THISCALL vt_SteamFriends018_GetFriendsGroupCount(void *self) {
  (void)self;
  return 0;
}

// slot 12: GetFriendsGroupIDByIndex(int32 iFG) -> uint32 | __thiscall ret 4 (STUB)
static uint32_t THISCALL vt_SteamFriends018_GetFriendsGroupIDByIndex(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 13: GetFriendsGroupName(uint32 friendsGroupID) -> const char* | __thiscall ret 4 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_SteamFriends018_GetFriendsGroupName(void *self, uint32_t dummy0) {
  (void)self;
  return "";
}

// slot 14: GetFriendsGroupMembersCount(uint32 friendsGroupID) -> int32 | __thiscall ret 4 (STUB)
static int32_t THISCALL vt_SteamFriends018_GetFriendsGroupMembersCount(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 15: GetFriendsGroupMembersList(uint32 friendsGroupID, CSteamID* pOutSteamIDMembers, int32 nMembersCount) -> void | __thiscall ret 12 (STUB)
static void THISCALL vt_SteamFriends018_GetFriendsGroupMembersList(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
}

// slot 16: HasFriend(CSteamID steamIDFriend, int32 iFriendFlags) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamFriends018_HasFriend(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 17: GetClanCount() -> int32 | __thiscall ret 0 (STUB)
static int32_t THISCALL vt_SteamFriends018_GetClanCount(void *self) {
  (void)self;
  return 0;
}

// slot 18: GetClanByIndex(CSteamID* _ret) -> CSteamID | __thiscall ret 8 (SRET -- hidden return pointer) (STUB)
static void * THISCALL vt_SteamFriends018_GetClanByIndex(void *self, void *sretOut, uint32_t dummy0) {
  (void)self;
  memset(sretOut, 0, 8);
  return sretOut;
}

// slot 19: GetClanName(CSteamID steamIDClan) -> const char* | __thiscall ret 8 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_SteamFriends018_GetClanName(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return "";
}

// slot 20: GetClanTag(CSteamID steamIDClan) -> const char* | __thiscall ret 8 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_SteamFriends018_GetClanTag(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return "";
}

// slot 21: GetClanActivityCounts(CSteamID steamIDClan, int32* pnOnline, int32* pnInGame, int32* pnChatting) -> bool | __thiscall ret 20 (STUB)
static int THISCALL vt_SteamFriends018_GetClanActivityCounts(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4) {
  (void)self;
  return 0;
}

// slot 22: DownloadClanActivityCounts(CSteamID* psteamIDClans, int32 cClansToRequest) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_SteamFriends018_DownloadClanActivityCounts(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 23: GetFriendCountFromSource(CSteamID steamIDSource) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends018_GetFriendCountFromSource(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 24: GetFriendFromSourceByIndex(CSteamID* _ret, CSteamID steamIDSource) -> CSteamID | __thiscall ret 16 (SRET -- hidden return pointer) (STUB)
static void * THISCALL vt_SteamFriends018_GetFriendFromSourceByIndex(void *self, void *sretOut, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  memset(sretOut, 0, 8);
  return sretOut;
}

// slot 25: IsUserInSource(CSteamID steamIDUser, CSteamID steamIDSource) -> bool | __thiscall ret 16 (STUB)
static int THISCALL vt_SteamFriends018_IsUserInSource(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 26: SetInGameVoiceSpeaking(CSteamID steamIDUser, bool bSpeaking) -> void | __thiscall ret 12 (STUB)
static void THISCALL vt_SteamFriends018_SetInGameVoiceSpeaking(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
}

// slot 27: ActivateGameOverlay(const char* pchDialog) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_SteamFriends018_ActivateGameOverlay(void *self, uint32_t dummy0) {
  (void)self;
}

// slot 28: ActivateGameOverlayToUser(const char* pchDialog, CSteamID steamID) -> void | __thiscall ret 12 (STUB)
static void THISCALL vt_SteamFriends018_ActivateGameOverlayToUser(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
}

// slot 29: ActivateGameOverlayToWebPage(const char* pchURL, uint32 eMode) -> void | __thiscall ret 8 (STUB)
static void THISCALL vt_SteamFriends018_ActivateGameOverlayToWebPage(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
}

// slot 30: ActivateGameOverlayToStore(uint32 nAppID, uint32 eFlag) -> void | __thiscall ret 8 (STUB)
static void THISCALL vt_SteamFriends018_ActivateGameOverlayToStore(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
}

// slot 31: SetPlayedWith(CSteamID steamIDUserPlayedWith) -> void | __thiscall ret 8 (STUB)
static void THISCALL vt_SteamFriends018_SetPlayedWith(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
}

// slot 32: ActivateGameOverlayInviteDialog(CSteamID steamIDLobby) -> void | __thiscall ret 8 (STUB)
static void THISCALL vt_SteamFriends018_ActivateGameOverlayInviteDialog(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
}

// slot 33: GetSmallFriendAvatar(CSteamID steamIDFriend) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends018_GetSmallFriendAvatar(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 34: GetMediumFriendAvatar(CSteamID steamIDFriend) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends018_GetMediumFriendAvatar(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 35: GetLargeFriendAvatar(CSteamID steamIDFriend) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends018_GetLargeFriendAvatar(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 36: RequestUserInformation(CSteamID steamIDUser, bool bRequireNameOnly) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamFriends018_RequestUserInformation(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 37: RequestClanOfficerList(CSteamID steamIDClan) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_SteamFriends018_RequestClanOfficerList(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 38: GetClanOwner(CSteamID* _ret) -> CSteamID | __thiscall ret 8 (SRET -- hidden return pointer) (STUB)
static void * THISCALL vt_SteamFriends018_GetClanOwner(void *self, void *sretOut, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  memset(sretOut, 0, 8);
  return sretOut;
}

// slot 39: GetClanOfficerCount(CSteamID steamIDClan) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends018_GetClanOfficerCount(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 40: GetClanOfficerByIndex(CSteamID* _ret, CSteamID steamIDClan) -> CSteamID | __thiscall ret 16 (SRET -- hidden return pointer) (STUB)
static void * THISCALL vt_SteamFriends018_GetClanOfficerByIndex(void *self, void *sretOut, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  memset(sretOut, 0, 8);
  return sretOut;
}

// slot 41: SetRichPresence(const char* pchKey, const char* pchValue) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamFriends018_SetRichPresence(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 42: ClearRichPresence() -> void | __thiscall ret 0 (STUB)
static void THISCALL vt_SteamFriends018_ClearRichPresence(void *self) {
  (void)self;
}

// slot 43: GetFriendRichPresence(CSteamID steamIDFriend, const char* pchKey) -> const char* | __thiscall ret 12 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_SteamFriends018_GetFriendRichPresence(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return "";
}

// slot 44: GetFriendRichPresenceKeyCount(CSteamID steamIDFriend) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends018_GetFriendRichPresenceKeyCount(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 45: GetFriendRichPresenceKeyByIndex(CSteamID steamIDFriend, int32 iKey) -> const char* | __thiscall ret 12 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_SteamFriends018_GetFriendRichPresenceKeyByIndex(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return "";
}

// slot 46: RequestFriendRichPresence(CSteamID steamIDFriend) -> void | __thiscall ret 8 (STUB)
static void THISCALL vt_SteamFriends018_RequestFriendRichPresence(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
}

// slot 47: InviteUserToGame(CSteamID steamIDFriend, const char* pchConnectString) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamFriends018_InviteUserToGame(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 48: GetCoplayFriendCount() -> int32 | __thiscall ret 0 (STUB)
static int32_t THISCALL vt_SteamFriends018_GetCoplayFriendCount(void *self) {
  (void)self;
  return 0;
}

// slot 49: GetCoplayFriend(CSteamID* _ret) -> CSteamID | __thiscall ret 8 (SRET -- hidden return pointer) (STUB)
static void * THISCALL vt_SteamFriends018_GetCoplayFriend(void *self, void *sretOut, uint32_t dummy0) {
  (void)self;
  memset(sretOut, 0, 8);
  return sretOut;
}

// slot 50: GetFriendCoplayTime(CSteamID steamIDFriend) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends018_GetFriendCoplayTime(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 51: GetFriendCoplayGame(CSteamID steamIDFriend) -> uint32 | __thiscall ret 8 (STUB)
static uint32_t THISCALL vt_SteamFriends018_GetFriendCoplayGame(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 52: JoinClanChatRoom(CSteamID steamIDClan) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_SteamFriends018_JoinClanChatRoom(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 53: LeaveClanChatRoom(CSteamID steamIDClan) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamFriends018_LeaveClanChatRoom(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 54: GetClanChatMemberCount(CSteamID steamIDClan) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends018_GetClanChatMemberCount(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 55: GetChatMemberByIndex(CSteamID* _ret, CSteamID steamIDClan) -> CSteamID | __thiscall ret 16 (SRET -- hidden return pointer) (STUB)
static void * THISCALL vt_SteamFriends018_GetChatMemberByIndex(void *self, void *sretOut, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  memset(sretOut, 0, 8);
  return sretOut;
}

// slot 56: SendClanChatMessage(CSteamID steamIDClanChat, const char* pchText) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamFriends018_SendClanChatMessage(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 57: GetClanChatMessage(CSteamID steamIDClanChat, int32 iMessage, void* prgchText, int32 cchTextMax, uint32* peChatEntryType, CSteamID* psteamidChatter) -> int32 | __thiscall ret 28 (STUB)
static int32_t THISCALL vt_SteamFriends018_GetClanChatMessage(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5, uint32_t dummy6) {
  (void)self;
  return 0;
}

// slot 58: IsClanChatAdmin(CSteamID steamIDClanChat, CSteamID steamIDUser) -> bool | __thiscall ret 16 (STUB)
static int THISCALL vt_SteamFriends018_IsClanChatAdmin(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 59: IsClanChatWindowOpenInSteam(CSteamID steamIDClanChat) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamFriends018_IsClanChatWindowOpenInSteam(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 60: OpenClanChatWindowInSteam(CSteamID steamIDClanChat) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamFriends018_OpenClanChatWindowInSteam(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 61: CloseClanChatWindowInSteam(CSteamID steamIDClanChat) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamFriends018_CloseClanChatWindowInSteam(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 62: SetListenForFriendsMessages(bool bInterceptEnabled) -> bool | __thiscall ret 4 (STUB)
static int THISCALL vt_SteamFriends018_SetListenForFriendsMessages(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 63: ReplyToFriendMessage(CSteamID steamIDFriend, const char* pchMsgToSend) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamFriends018_ReplyToFriendMessage(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 64: GetFriendMessage(CSteamID steamIDFriend, int32 iMessageID, void* pvData, int32 cubData, uint32* peChatEntryType) -> int32 | __thiscall ret 24 (STUB)
static int32_t THISCALL vt_SteamFriends018_GetFriendMessage(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5) {
  (void)self;
  return 0;
}

// slot 65: GetFollowerCount(CSteamID steamID) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_SteamFriends018_GetFollowerCount(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 66: IsFollowing(CSteamID steamID) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_SteamFriends018_IsFollowing(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 67: EnumerateFollowingList(uint32 unStartIndex) -> uint64 | __thiscall ret 4 (STUB)
static uint64_t THISCALL vt_SteamFriends018_EnumerateFollowingList(void *self, uint32_t dummy0) {
  (void)self;
  return 0LL;
}

// slot 68: IsClanPublic(CSteamID steamIDClan) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamFriends018_IsClanPublic(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 69: IsClanOfficialGameGroup(CSteamID steamIDClan) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamFriends018_IsClanOfficialGameGroup(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 70: GetNumChatsWithUnreadPriorityMessages() -> int32 | __thiscall ret 0 (STUB)
static int32_t THISCALL vt_SteamFriends018_GetNumChatsWithUnreadPriorityMessages(void *self) {
  (void)self;
  return 0;
}

// slot 71: ActivateGameOverlayRemotePlayTogetherInviteDialog(CSteamID steamIDLobby) -> void | __thiscall ret 8 (STUB)
static void THISCALL vt_SteamFriends018_ActivateGameOverlayRemotePlayTogetherInviteDialog(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
}

// slot 72: RegisterProtocolInOverlayBrowser(const char* pchProtocol) -> bool | __thiscall ret 4 (STUB)
static int THISCALL vt_SteamFriends018_RegisterProtocolInOverlayBrowser(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 73: ActivateGameOverlayInviteDialogConnectString(const char* pchConnectString) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_SteamFriends018_ActivateGameOverlayInviteDialogConnectString(void *self, uint32_t dummy0) {
  (void)self;
}

// slot 74: RequestEquippedProfileItems(CSteamID steamID) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_SteamFriends018_RequestEquippedProfileItems(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 75: BHasEquippedProfileItem(CSteamID steamID, uint32 itemType) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamFriends018_BHasEquippedProfileItem(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 76: GetProfileItemPropertyString(CSteamID steamID, uint32 itemType, uint32 prop) -> const char* | __thiscall ret 16 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_SteamFriends018_GetProfileItemPropertyString(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return "";
}

// slot 77: GetProfileItemPropertyUint(CSteamID steamID, uint32 itemType, uint32 prop) -> uint32 | __thiscall ret 16 (STUB)
static uint32_t THISCALL vt_SteamFriends018_GetProfileItemPropertyUint(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

static vfn g_steamfriends018_vtbl[78] = {
  (vfn)vt_SteamFriends018_GetPersonaName, // slot 0
  (vfn)vt_SteamFriends018_GetPersonaState, // slot 1
  (vfn)vt_SteamFriends018_GetFriendCount, // slot 2
  (vfn)vt_SteamFriends018_GetFriendByIndex, // slot 3
  (vfn)vt_SteamFriends018_GetFriendRelationship, // slot 4
  (vfn)vt_SteamFriends018_GetFriendPersonaState, // slot 5
  (vfn)vt_SteamFriends018_GetFriendPersonaName, // slot 6
  (vfn)vt_SteamFriends018_GetFriendGamePlayed, // slot 7
  (vfn)vt_SteamFriends018_GetFriendPersonaNameHistory, // slot 8
  (vfn)vt_SteamFriends018_GetFriendSteamLevel, // slot 9
  (vfn)vt_SteamFriends018_GetPlayerNickname, // slot 10
  (vfn)vt_SteamFriends018_GetFriendsGroupCount, // slot 11
  (vfn)vt_SteamFriends018_GetFriendsGroupIDByIndex, // slot 12
  (vfn)vt_SteamFriends018_GetFriendsGroupName, // slot 13
  (vfn)vt_SteamFriends018_GetFriendsGroupMembersCount, // slot 14
  (vfn)vt_SteamFriends018_GetFriendsGroupMembersList, // slot 15
  (vfn)vt_SteamFriends018_HasFriend, // slot 16
  (vfn)vt_SteamFriends018_GetClanCount, // slot 17
  (vfn)vt_SteamFriends018_GetClanByIndex, // slot 18
  (vfn)vt_SteamFriends018_GetClanName, // slot 19
  (vfn)vt_SteamFriends018_GetClanTag, // slot 20
  (vfn)vt_SteamFriends018_GetClanActivityCounts, // slot 21
  (vfn)vt_SteamFriends018_DownloadClanActivityCounts, // slot 22
  (vfn)vt_SteamFriends018_GetFriendCountFromSource, // slot 23
  (vfn)vt_SteamFriends018_GetFriendFromSourceByIndex, // slot 24
  (vfn)vt_SteamFriends018_IsUserInSource, // slot 25
  (vfn)vt_SteamFriends018_SetInGameVoiceSpeaking, // slot 26
  (vfn)vt_SteamFriends018_ActivateGameOverlay, // slot 27
  (vfn)vt_SteamFriends018_ActivateGameOverlayToUser, // slot 28
  (vfn)vt_SteamFriends018_ActivateGameOverlayToWebPage, // slot 29
  (vfn)vt_SteamFriends018_ActivateGameOverlayToStore, // slot 30
  (vfn)vt_SteamFriends018_SetPlayedWith, // slot 31
  (vfn)vt_SteamFriends018_ActivateGameOverlayInviteDialog, // slot 32
  (vfn)vt_SteamFriends018_GetSmallFriendAvatar, // slot 33
  (vfn)vt_SteamFriends018_GetMediumFriendAvatar, // slot 34
  (vfn)vt_SteamFriends018_GetLargeFriendAvatar, // slot 35
  (vfn)vt_SteamFriends018_RequestUserInformation, // slot 36
  (vfn)vt_SteamFriends018_RequestClanOfficerList, // slot 37
  (vfn)vt_SteamFriends018_GetClanOwner, // slot 38
  (vfn)vt_SteamFriends018_GetClanOfficerCount, // slot 39
  (vfn)vt_SteamFriends018_GetClanOfficerByIndex, // slot 40
  (vfn)vt_SteamFriends018_SetRichPresence, // slot 41
  (vfn)vt_SteamFriends018_ClearRichPresence, // slot 42
  (vfn)vt_SteamFriends018_GetFriendRichPresence, // slot 43
  (vfn)vt_SteamFriends018_GetFriendRichPresenceKeyCount, // slot 44
  (vfn)vt_SteamFriends018_GetFriendRichPresenceKeyByIndex, // slot 45
  (vfn)vt_SteamFriends018_RequestFriendRichPresence, // slot 46
  (vfn)vt_SteamFriends018_InviteUserToGame, // slot 47
  (vfn)vt_SteamFriends018_GetCoplayFriendCount, // slot 48
  (vfn)vt_SteamFriends018_GetCoplayFriend, // slot 49
  (vfn)vt_SteamFriends018_GetFriendCoplayTime, // slot 50
  (vfn)vt_SteamFriends018_GetFriendCoplayGame, // slot 51
  (vfn)vt_SteamFriends018_JoinClanChatRoom, // slot 52
  (vfn)vt_SteamFriends018_LeaveClanChatRoom, // slot 53
  (vfn)vt_SteamFriends018_GetClanChatMemberCount, // slot 54
  (vfn)vt_SteamFriends018_GetChatMemberByIndex, // slot 55
  (vfn)vt_SteamFriends018_SendClanChatMessage, // slot 56
  (vfn)vt_SteamFriends018_GetClanChatMessage, // slot 57
  (vfn)vt_SteamFriends018_IsClanChatAdmin, // slot 58
  (vfn)vt_SteamFriends018_IsClanChatWindowOpenInSteam, // slot 59
  (vfn)vt_SteamFriends018_OpenClanChatWindowInSteam, // slot 60
  (vfn)vt_SteamFriends018_CloseClanChatWindowInSteam, // slot 61
  (vfn)vt_SteamFriends018_SetListenForFriendsMessages, // slot 62
  (vfn)vt_SteamFriends018_ReplyToFriendMessage, // slot 63
  (vfn)vt_SteamFriends018_GetFriendMessage, // slot 64
  (vfn)vt_SteamFriends018_GetFollowerCount, // slot 65
  (vfn)vt_SteamFriends018_IsFollowing, // slot 66
  (vfn)vt_SteamFriends018_EnumerateFollowingList, // slot 67
  (vfn)vt_SteamFriends018_IsClanPublic, // slot 68
  (vfn)vt_SteamFriends018_IsClanOfficialGameGroup, // slot 69
  (vfn)vt_SteamFriends018_GetNumChatsWithUnreadPriorityMessages, // slot 70
  (vfn)vt_SteamFriends018_ActivateGameOverlayRemotePlayTogetherInviteDialog, // slot 71
  (vfn)vt_SteamFriends018_RegisterProtocolInOverlayBrowser, // slot 72
  (vfn)vt_SteamFriends018_ActivateGameOverlayInviteDialogConnectString, // slot 73
  (vfn)vt_SteamFriends018_RequestEquippedProfileItems, // slot 74
  (vfn)vt_SteamFriends018_BHasEquippedProfileItem, // slot 75
  (vfn)vt_SteamFriends018_GetProfileItemPropertyString, // slot 76
  (vfn)vt_SteamFriends018_GetProfileItemPropertyUint, // slot 77
};
struct FakeSteamFriends018 { vfn *vptr; };
static struct FakeSteamFriends018 g_steamfriends018_instance = { g_steamfriends018_vtbl };

// === SteamUser016 (ordinal 3, family SteamUser) ===

// slot 0: GetHSteamUser() -> int32 | __thiscall ret 0
static int32_t THISCALL vt_SteamUser016_GetHSteamUser(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(3, 0, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int32_t ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 1: BLoggedOn() -> bool | __thiscall ret 0
static int THISCALL vt_SteamUser016_BLoggedOn(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(3, 1, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 2: GetSteamID() -> CSteamID | __thiscall ret 4 (SRET -- hidden return pointer)
static void * THISCALL vt_SteamUser016_GetSteamID(void *self, void *sretOut) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[8]; uint32_t retlen = 0;
  if (!bridge_transact(3, 2, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 8) {
    memset(sretOut, 0, 8);
    return sretOut;
  }
  memcpy(sretOut, retbuf, 8);
  return sretOut;
}

// slot 3: InitiateGameConnection(void* pAuthBlob, int32 cbMaxAuthBlob, CSteamID steamIDGameServer, uint32 unIPServer, uint32 usPortServer, bool bSecure) -> int32 | __thiscall ret 28 (STUB)
static int32_t THISCALL vt_SteamUser016_InitiateGameConnection(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5, uint32_t dummy6) {
  (void)self;
  return 0;
}

// slot 4: TerminateGameConnection(uint32 unIPServer, uint32 usPortServer) -> void | __thiscall ret 8 (STUB)
static void THISCALL vt_SteamUser016_TerminateGameConnection(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
}

// slot 5: TrackAppUsageEvent(CGameID gameID, int32 eAppUsageEvent, const char* pchExtraInfo) -> void | __thiscall ret 16 (STUB)
static void THISCALL vt_SteamUser016_TrackAppUsageEvent(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
}

// slot 6: GetUserDataFolder(char* pchBuffer, int32 cubBuffer) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamUser016_GetUserDataFolder(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 7: StartVoiceRecording() -> void | __thiscall ret 0 (STUB)
static void THISCALL vt_SteamUser016_StartVoiceRecording(void *self) {
  (void)self;
}

// slot 8: StopVoiceRecording() -> void | __thiscall ret 0 (STUB)
static void THISCALL vt_SteamUser016_StopVoiceRecording(void *self) {
  (void)self;
}

// slot 9: GetAvailableVoice(uint32* pcbCompressed, uint32* pcbUncompressed, uint32 nUncompressedVoiceDesiredSampleRate) -> uint32 | __thiscall ret 12 (STUB)
static uint32_t THISCALL vt_SteamUser016_GetAvailableVoice(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 10: GetVoice(bool bWantCompressed, void* pDestBuffer, uint32 cbDestBufferSize, uint32* nBytesWritten, bool bWantUncompressed, void* pUncompressedDestBuffer, uint32 cbUncompressedDestBufferSize, uint32* nUncompressBytesWritten, uint32 nUncompressedVoiceDesiredSampleRate) -> uint32 | __thiscall ret 36 (STUB)
static uint32_t THISCALL vt_SteamUser016_GetVoice(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5, uint32_t dummy6, uint32_t dummy7, uint32_t dummy8) {
  (void)self;
  return 0;
}

// slot 11: DecompressVoice(const void* pCompressed, uint32 cbCompressed, void* pDestBuffer, uint32 cbDestBufferSize, uint32* nBytesWritten, uint32 nDesiredSampleRate) -> uint32 | __thiscall ret 24 (STUB)
static uint32_t THISCALL vt_SteamUser016_DecompressVoice(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5) {
  (void)self;
  return 0;
}

// slot 12: GetVoiceOptimalSampleRate() -> uint32 | __thiscall ret 0 (STUB)
static uint32_t THISCALL vt_SteamUser016_GetVoiceOptimalSampleRate(void *self) {
  (void)self;
  return 0;
}

// slot 13: GetAuthSessionTicket(void* pTicket, int32 cbMaxTicket, uint32* pcbTicket) -> uint32 | __thiscall ret 12 (STUB)
static uint32_t THISCALL vt_SteamUser016_GetAuthSessionTicket(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 14: BeginAuthSession(const void* pAuthTicket, int32 cbAuthTicket, CSteamID steamID) -> uint32 | __thiscall ret 16 (STUB)
static uint32_t THISCALL vt_SteamUser016_BeginAuthSession(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 15: EndAuthSession(CSteamID steamID) -> void | __thiscall ret 8 (STUB)
static void THISCALL vt_SteamUser016_EndAuthSession(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
}

// slot 16: CancelAuthTicket(uint32 hAuthTicket) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_SteamUser016_CancelAuthTicket(void *self, uint32_t dummy0) {
  (void)self;
}

// slot 17: UserHasLicenseForApp(CSteamID steamID, uint32 appID) -> uint32 | __thiscall ret 12 (STUB)
static uint32_t THISCALL vt_SteamUser016_UserHasLicenseForApp(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 18: BIsBehindNAT() -> bool | __thiscall ret 0 (STUB)
static int THISCALL vt_SteamUser016_BIsBehindNAT(void *self) {
  (void)self;
  return 0;
}

// slot 19: AdvertiseGame(CSteamID steamIDGameServer, uint32 unIPServer, uint32 usPortServer) -> void | __thiscall ret 16 (STUB)
static void THISCALL vt_SteamUser016_AdvertiseGame(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
}

// slot 20: RequestEncryptedAppTicket(void* pDataToInclude, int32 cbDataToInclude) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_SteamUser016_RequestEncryptedAppTicket(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 21: GetEncryptedAppTicket(void* pTicket, int32 cbMaxTicket, uint32* pcbTicket) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamUser016_GetEncryptedAppTicket(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

static vfn g_steamuser016_vtbl[22] = {
  (vfn)vt_SteamUser016_GetHSteamUser, // slot 0
  (vfn)vt_SteamUser016_BLoggedOn, // slot 1
  (vfn)vt_SteamUser016_GetSteamID, // slot 2
  (vfn)vt_SteamUser016_InitiateGameConnection, // slot 3
  (vfn)vt_SteamUser016_TerminateGameConnection, // slot 4
  (vfn)vt_SteamUser016_TrackAppUsageEvent, // slot 5
  (vfn)vt_SteamUser016_GetUserDataFolder, // slot 6
  (vfn)vt_SteamUser016_StartVoiceRecording, // slot 7
  (vfn)vt_SteamUser016_StopVoiceRecording, // slot 8
  (vfn)vt_SteamUser016_GetAvailableVoice, // slot 9
  (vfn)vt_SteamUser016_GetVoice, // slot 10
  (vfn)vt_SteamUser016_DecompressVoice, // slot 11
  (vfn)vt_SteamUser016_GetVoiceOptimalSampleRate, // slot 12
  (vfn)vt_SteamUser016_GetAuthSessionTicket, // slot 13
  (vfn)vt_SteamUser016_BeginAuthSession, // slot 14
  (vfn)vt_SteamUser016_EndAuthSession, // slot 15
  (vfn)vt_SteamUser016_CancelAuthTicket, // slot 16
  (vfn)vt_SteamUser016_UserHasLicenseForApp, // slot 17
  (vfn)vt_SteamUser016_BIsBehindNAT, // slot 18
  (vfn)vt_SteamUser016_AdvertiseGame, // slot 19
  (vfn)vt_SteamUser016_RequestEncryptedAppTicket, // slot 20
  (vfn)vt_SteamUser016_GetEncryptedAppTicket, // slot 21
};
struct FakeSteamUser016 { vfn *vptr; };
static struct FakeSteamUser016 g_steamuser016_instance = { g_steamuser016_vtbl };

// === SteamFriends011 (ordinal 4, family SteamFriends) ===

// slot 0: GetPersonaName() -> const char* | __thiscall ret 0 (STRING RETURN -- shim-owned buffer, CR-01)
static char vt_SteamFriends011_GetPersonaName_buf[STRING_RETURN_BUF_BYTES];
static const char * THISCALL vt_SteamFriends011_GetPersonaName(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[STRING_RETURN_BUF_BYTES - 1]; uint32_t retlen = 0;
  if (!bridge_transact(4, 0, argbuf, 0, retbuf, sizeof(retbuf), &retlen)) {
    vt_SteamFriends011_GetPersonaName_buf[0] = '\0';
    return vt_SteamFriends011_GetPersonaName_buf;
  }
  memcpy(vt_SteamFriends011_GetPersonaName_buf, retbuf, retlen);
  vt_SteamFriends011_GetPersonaName_buf[retlen] = '\0';
  return vt_SteamFriends011_GetPersonaName_buf;
}

// slot 1: SetPersonaName(const char* pchPersonaName) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_SteamFriends011_SetPersonaName(void *self, uint32_t dummy0) {
  (void)self;
}

// slot 2: GetPersonaState() -> uint32 | __thiscall ret 0
static uint32_t THISCALL vt_SteamFriends011_GetPersonaState(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(4, 2, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  uint32_t ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 3: GetFriendCount(int32 iFriendFlags) -> int32 | __thiscall ret 4 (STUB)
static int32_t THISCALL vt_SteamFriends011_GetFriendCount(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 4: GetFriendByIndex(CSteamID* _ret, int32 iFriend) -> CSteamID | __thiscall ret 12 (SRET -- hidden return pointer) (STUB)
static void * THISCALL vt_SteamFriends011_GetFriendByIndex(void *self, void *sretOut, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  memset(sretOut, 0, 8);
  return sretOut;
}

// slot 5: GetFriendRelationship(CSteamID steamIDFriend) -> uint32 | __thiscall ret 8 (STUB)
static uint32_t THISCALL vt_SteamFriends011_GetFriendRelationship(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 6: GetFriendPersonaState(CSteamID steamIDFriend) -> uint32 | __thiscall ret 8 (STUB)
static uint32_t THISCALL vt_SteamFriends011_GetFriendPersonaState(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 7: GetFriendPersonaName(CSteamID steamIDFriend) -> const char* | __thiscall ret 8 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_SteamFriends011_GetFriendPersonaName(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return "";
}

// slot 8: GetFriendGamePlayed(CSteamID steamIDFriend, FriendGameInfo_t* pFriendGameInfo) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamFriends011_GetFriendGamePlayed(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 9: GetFriendPersonaNameHistory(CSteamID steamIDFriend, int32 iPersonaName) -> const char* | __thiscall ret 12 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_SteamFriends011_GetFriendPersonaNameHistory(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return "";
}

// slot 10: HasFriend(CSteamID steamIDFriend, int32 iFriendFlags) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamFriends011_HasFriend(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 11: GetClanCount() -> int32 | __thiscall ret 0 (STUB)
static int32_t THISCALL vt_SteamFriends011_GetClanCount(void *self) {
  (void)self;
  return 0;
}

// slot 12: GetClanByIndex(CSteamID* _ret) -> CSteamID | __thiscall ret 8 (SRET -- hidden return pointer) (STUB)
static void * THISCALL vt_SteamFriends011_GetClanByIndex(void *self, void *sretOut, uint32_t dummy0) {
  (void)self;
  memset(sretOut, 0, 8);
  return sretOut;
}

// slot 13: GetClanName(CSteamID steamIDClan) -> const char* | __thiscall ret 8 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_SteamFriends011_GetClanName(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return "";
}

// slot 14: GetClanTag(CSteamID steamIDClan) -> const char* | __thiscall ret 8 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_SteamFriends011_GetClanTag(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return "";
}

// slot 15: GetClanActivityCounts(CSteamID steamIDClan, int32* pnOnline, int32* pnInGame, int32* pnChatting) -> bool | __thiscall ret 20 (STUB)
static int THISCALL vt_SteamFriends011_GetClanActivityCounts(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4) {
  (void)self;
  return 0;
}

// slot 16: DownloadClanActivityCounts(CSteamID* psteamIDClans, int32 cClansToRequest) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_SteamFriends011_DownloadClanActivityCounts(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 17: GetFriendCountFromSource(CSteamID steamIDSource) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends011_GetFriendCountFromSource(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 18: GetFriendFromSourceByIndex(CSteamID* _ret, CSteamID steamIDSource) -> CSteamID | __thiscall ret 16 (SRET -- hidden return pointer) (STUB)
static void * THISCALL vt_SteamFriends011_GetFriendFromSourceByIndex(void *self, void *sretOut, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  memset(sretOut, 0, 8);
  return sretOut;
}

// slot 19: IsUserInSource(CSteamID steamIDUser, CSteamID steamIDSource) -> bool | __thiscall ret 16 (STUB)
static int THISCALL vt_SteamFriends011_IsUserInSource(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 20: SetInGameVoiceSpeaking(CSteamID steamIDUser, bool bSpeaking) -> void | __thiscall ret 12 (STUB)
static void THISCALL vt_SteamFriends011_SetInGameVoiceSpeaking(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
}

// slot 21: ActivateGameOverlay(const char* pchDialog) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_SteamFriends011_ActivateGameOverlay(void *self, uint32_t dummy0) {
  (void)self;
}

// slot 22: ActivateGameOverlayToUser(const char* pchDialog, CSteamID steamID) -> void | __thiscall ret 12 (STUB)
static void THISCALL vt_SteamFriends011_ActivateGameOverlayToUser(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
}

// slot 23: ActivateGameOverlayToWebPage(const char* pchURL) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_SteamFriends011_ActivateGameOverlayToWebPage(void *self, uint32_t dummy0) {
  (void)self;
}

// slot 24: ActivateGameOverlayToStore(uint32 nAppID) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_SteamFriends011_ActivateGameOverlayToStore(void *self, uint32_t dummy0) {
  (void)self;
}

// slot 25: SetPlayedWith(CSteamID steamIDUserPlayedWith) -> void | __thiscall ret 8 (STUB)
static void THISCALL vt_SteamFriends011_SetPlayedWith(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
}

// slot 26: ActivateGameOverlayInviteDialog(CSteamID steamIDLobby) -> void | __thiscall ret 8 (STUB)
static void THISCALL vt_SteamFriends011_ActivateGameOverlayInviteDialog(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
}

// slot 27: GetSmallFriendAvatar(CSteamID steamIDFriend) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends011_GetSmallFriendAvatar(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 28: GetMediumFriendAvatar(CSteamID steamIDFriend) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends011_GetMediumFriendAvatar(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 29: GetLargeFriendAvatar(CSteamID steamIDFriend) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends011_GetLargeFriendAvatar(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 30: RequestUserInformation(CSteamID steamIDUser, bool bRequireNameOnly) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamFriends011_RequestUserInformation(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 31: RequestClanOfficerList(CSteamID steamIDClan) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_SteamFriends011_RequestClanOfficerList(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 32: GetClanOwner(CSteamID* _ret) -> CSteamID | __thiscall ret 8 (SRET -- hidden return pointer) (STUB)
static void * THISCALL vt_SteamFriends011_GetClanOwner(void *self, void *sretOut, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  memset(sretOut, 0, 8);
  return sretOut;
}

// slot 33: GetClanOfficerCount(CSteamID steamIDClan) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends011_GetClanOfficerCount(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 34: GetClanOfficerByIndex(CSteamID* _ret, CSteamID steamIDClan) -> CSteamID | __thiscall ret 16 (SRET -- hidden return pointer) (STUB)
static void * THISCALL vt_SteamFriends011_GetClanOfficerByIndex(void *self, void *sretOut, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  memset(sretOut, 0, 8);
  return sretOut;
}

// slot 35: GetUserRestrictions() -> uint32 | __thiscall ret 0 (STUB)
static uint32_t THISCALL vt_SteamFriends011_GetUserRestrictions(void *self) {
  (void)self;
  return 0;
}

// slot 36: SetRichPresence(const char* pchKey, const char* pchValue) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamFriends011_SetRichPresence(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 37: ClearRichPresence() -> void | __thiscall ret 0 (STUB)
static void THISCALL vt_SteamFriends011_ClearRichPresence(void *self) {
  (void)self;
}

// slot 38: GetFriendRichPresence(CSteamID steamIDFriend, const char* pchKey) -> const char* | __thiscall ret 12 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_SteamFriends011_GetFriendRichPresence(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return "";
}

// slot 39: GetFriendRichPresenceKeyCount(CSteamID steamIDFriend) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends011_GetFriendRichPresenceKeyCount(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 40: GetFriendRichPresenceKeyByIndex(CSteamID steamIDFriend, int32 iKey) -> const char* | __thiscall ret 12 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_SteamFriends011_GetFriendRichPresenceKeyByIndex(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return "";
}

// slot 41: RequestFriendRichPresence(CSteamID steamIDFriend) -> void | __thiscall ret 8 (STUB)
static void THISCALL vt_SteamFriends011_RequestFriendRichPresence(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
}

// slot 42: InviteUserToGame(CSteamID steamIDFriend, const char* pchConnectString) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamFriends011_InviteUserToGame(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 43: GetCoplayFriendCount() -> int32 | __thiscall ret 0 (STUB)
static int32_t THISCALL vt_SteamFriends011_GetCoplayFriendCount(void *self) {
  (void)self;
  return 0;
}

// slot 44: GetCoplayFriend(CSteamID* _ret) -> CSteamID | __thiscall ret 8 (SRET -- hidden return pointer) (STUB)
static void * THISCALL vt_SteamFriends011_GetCoplayFriend(void *self, void *sretOut, uint32_t dummy0) {
  (void)self;
  memset(sretOut, 0, 8);
  return sretOut;
}

// slot 45: GetFriendCoplayTime(CSteamID steamIDFriend) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends011_GetFriendCoplayTime(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 46: GetFriendCoplayGame(CSteamID steamIDFriend) -> uint32 | __thiscall ret 8 (STUB)
static uint32_t THISCALL vt_SteamFriends011_GetFriendCoplayGame(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 47: JoinClanChatRoom(CSteamID steamIDClan) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_SteamFriends011_JoinClanChatRoom(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 48: LeaveClanChatRoom(CSteamID steamIDClan) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamFriends011_LeaveClanChatRoom(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 49: GetClanChatMemberCount(CSteamID steamIDClan) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends011_GetClanChatMemberCount(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 50: GetChatMemberByIndex(CSteamID* _ret, CSteamID steamIDClan) -> CSteamID | __thiscall ret 16 (SRET -- hidden return pointer) (STUB)
static void * THISCALL vt_SteamFriends011_GetChatMemberByIndex(void *self, void *sretOut, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  memset(sretOut, 0, 8);
  return sretOut;
}

// slot 51: SendClanChatMessage(CSteamID steamIDClanChat, const char* pchText) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamFriends011_SendClanChatMessage(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 52: GetClanChatMessage(CSteamID steamIDClanChat, int32 iMessage, void* prgchText, int32 cchTextMax, uint32* _e, CSteamID* _f) -> int32 | __thiscall ret 28 (STUB)
static int32_t THISCALL vt_SteamFriends011_GetClanChatMessage(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5, uint32_t dummy6) {
  (void)self;
  return 0;
}

// slot 53: IsClanChatAdmin(CSteamID steamIDClanChat, CSteamID steamIDUser) -> bool | __thiscall ret 16 (STUB)
static int THISCALL vt_SteamFriends011_IsClanChatAdmin(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 54: IsClanChatWindowOpenInSteam(CSteamID steamIDClanChat) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamFriends011_IsClanChatWindowOpenInSteam(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 55: OpenClanChatWindowInSteam(CSteamID steamIDClanChat) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamFriends011_OpenClanChatWindowInSteam(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 56: CloseClanChatWindowInSteam(CSteamID steamIDClanChat) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamFriends011_CloseClanChatWindowInSteam(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 57: SetListenForFriendsMessages(bool bInterceptEnabled) -> bool | __thiscall ret 4 (STUB)
static int THISCALL vt_SteamFriends011_SetListenForFriendsMessages(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 58: ReplyToFriendMessage(CSteamID steamIDFriend, const char* pchMsgToSend) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamFriends011_ReplyToFriendMessage(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 59: GetFriendMessage(CSteamID steamIDFriend, int32 iMessageID, void* pvData, int32 cubData, uint32* peChatEntryType) -> int32 | __thiscall ret 24 (STUB)
static int32_t THISCALL vt_SteamFriends011_GetFriendMessage(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5) {
  (void)self;
  return 0;
}

// slot 60: GetFollowerCount(CSteamID steamID) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_SteamFriends011_GetFollowerCount(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 61: IsFollowing(CSteamID steamID) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_SteamFriends011_IsFollowing(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 62: EnumerateFollowingList(uint32 unStartIndex) -> uint64 | __thiscall ret 4 (STUB)
static uint64_t THISCALL vt_SteamFriends011_EnumerateFollowingList(void *self, uint32_t dummy0) {
  (void)self;
  return 0LL;
}

static vfn g_steamfriends011_vtbl[63] = {
  (vfn)vt_SteamFriends011_GetPersonaName, // slot 0
  (vfn)vt_SteamFriends011_SetPersonaName, // slot 1
  (vfn)vt_SteamFriends011_GetPersonaState, // slot 2
  (vfn)vt_SteamFriends011_GetFriendCount, // slot 3
  (vfn)vt_SteamFriends011_GetFriendByIndex, // slot 4
  (vfn)vt_SteamFriends011_GetFriendRelationship, // slot 5
  (vfn)vt_SteamFriends011_GetFriendPersonaState, // slot 6
  (vfn)vt_SteamFriends011_GetFriendPersonaName, // slot 7
  (vfn)vt_SteamFriends011_GetFriendGamePlayed, // slot 8
  (vfn)vt_SteamFriends011_GetFriendPersonaNameHistory, // slot 9
  (vfn)vt_SteamFriends011_HasFriend, // slot 10
  (vfn)vt_SteamFriends011_GetClanCount, // slot 11
  (vfn)vt_SteamFriends011_GetClanByIndex, // slot 12
  (vfn)vt_SteamFriends011_GetClanName, // slot 13
  (vfn)vt_SteamFriends011_GetClanTag, // slot 14
  (vfn)vt_SteamFriends011_GetClanActivityCounts, // slot 15
  (vfn)vt_SteamFriends011_DownloadClanActivityCounts, // slot 16
  (vfn)vt_SteamFriends011_GetFriendCountFromSource, // slot 17
  (vfn)vt_SteamFriends011_GetFriendFromSourceByIndex, // slot 18
  (vfn)vt_SteamFriends011_IsUserInSource, // slot 19
  (vfn)vt_SteamFriends011_SetInGameVoiceSpeaking, // slot 20
  (vfn)vt_SteamFriends011_ActivateGameOverlay, // slot 21
  (vfn)vt_SteamFriends011_ActivateGameOverlayToUser, // slot 22
  (vfn)vt_SteamFriends011_ActivateGameOverlayToWebPage, // slot 23
  (vfn)vt_SteamFriends011_ActivateGameOverlayToStore, // slot 24
  (vfn)vt_SteamFriends011_SetPlayedWith, // slot 25
  (vfn)vt_SteamFriends011_ActivateGameOverlayInviteDialog, // slot 26
  (vfn)vt_SteamFriends011_GetSmallFriendAvatar, // slot 27
  (vfn)vt_SteamFriends011_GetMediumFriendAvatar, // slot 28
  (vfn)vt_SteamFriends011_GetLargeFriendAvatar, // slot 29
  (vfn)vt_SteamFriends011_RequestUserInformation, // slot 30
  (vfn)vt_SteamFriends011_RequestClanOfficerList, // slot 31
  (vfn)vt_SteamFriends011_GetClanOwner, // slot 32
  (vfn)vt_SteamFriends011_GetClanOfficerCount, // slot 33
  (vfn)vt_SteamFriends011_GetClanOfficerByIndex, // slot 34
  (vfn)vt_SteamFriends011_GetUserRestrictions, // slot 35
  (vfn)vt_SteamFriends011_SetRichPresence, // slot 36
  (vfn)vt_SteamFriends011_ClearRichPresence, // slot 37
  (vfn)vt_SteamFriends011_GetFriendRichPresence, // slot 38
  (vfn)vt_SteamFriends011_GetFriendRichPresenceKeyCount, // slot 39
  (vfn)vt_SteamFriends011_GetFriendRichPresenceKeyByIndex, // slot 40
  (vfn)vt_SteamFriends011_RequestFriendRichPresence, // slot 41
  (vfn)vt_SteamFriends011_InviteUserToGame, // slot 42
  (vfn)vt_SteamFriends011_GetCoplayFriendCount, // slot 43
  (vfn)vt_SteamFriends011_GetCoplayFriend, // slot 44
  (vfn)vt_SteamFriends011_GetFriendCoplayTime, // slot 45
  (vfn)vt_SteamFriends011_GetFriendCoplayGame, // slot 46
  (vfn)vt_SteamFriends011_JoinClanChatRoom, // slot 47
  (vfn)vt_SteamFriends011_LeaveClanChatRoom, // slot 48
  (vfn)vt_SteamFriends011_GetClanChatMemberCount, // slot 49
  (vfn)vt_SteamFriends011_GetChatMemberByIndex, // slot 50
  (vfn)vt_SteamFriends011_SendClanChatMessage, // slot 51
  (vfn)vt_SteamFriends011_GetClanChatMessage, // slot 52
  (vfn)vt_SteamFriends011_IsClanChatAdmin, // slot 53
  (vfn)vt_SteamFriends011_IsClanChatWindowOpenInSteam, // slot 54
  (vfn)vt_SteamFriends011_OpenClanChatWindowInSteam, // slot 55
  (vfn)vt_SteamFriends011_CloseClanChatWindowInSteam, // slot 56
  (vfn)vt_SteamFriends011_SetListenForFriendsMessages, // slot 57
  (vfn)vt_SteamFriends011_ReplyToFriendMessage, // slot 58
  (vfn)vt_SteamFriends011_GetFriendMessage, // slot 59
  (vfn)vt_SteamFriends011_GetFollowerCount, // slot 60
  (vfn)vt_SteamFriends011_IsFollowing, // slot 61
  (vfn)vt_SteamFriends011_EnumerateFollowingList, // slot 62
};
struct FakeSteamFriends011 { vfn *vptr; };
static struct FakeSteamFriends011 g_steamfriends011_instance = { g_steamfriends011_vtbl };

// === SteamUtils005 (ordinal 5, family SteamUtils) ===

// slot 0: GetSecondsSinceAppActive() -> uint32 | __thiscall ret 0
static uint32_t THISCALL vt_SteamUtils005_GetSecondsSinceAppActive(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(5, 0, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  uint32_t ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 1: GetSecondsSinceComputerActive() -> uint32 | __thiscall ret 0
static uint32_t THISCALL vt_SteamUtils005_GetSecondsSinceComputerActive(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(5, 1, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  uint32_t ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 2: GetConnectedUniverse() -> uint32 | __thiscall ret 0
static uint32_t THISCALL vt_SteamUtils005_GetConnectedUniverse(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(5, 2, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  uint32_t ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 3: GetServerRealTime() -> uint32 | __thiscall ret 0
static uint32_t THISCALL vt_SteamUtils005_GetServerRealTime(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(5, 3, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  uint32_t ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 4: GetIPCountry() -> const char* | __thiscall ret 0 (STRING RETURN -- shim-owned buffer, CR-01)
static char vt_SteamUtils005_GetIPCountry_buf[STRING_RETURN_BUF_BYTES];
static const char * THISCALL vt_SteamUtils005_GetIPCountry(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[STRING_RETURN_BUF_BYTES - 1]; uint32_t retlen = 0;
  if (!bridge_transact(5, 4, argbuf, 0, retbuf, sizeof(retbuf), &retlen)) {
    vt_SteamUtils005_GetIPCountry_buf[0] = '\0';
    return vt_SteamUtils005_GetIPCountry_buf;
  }
  memcpy(vt_SteamUtils005_GetIPCountry_buf, retbuf, retlen);
  vt_SteamUtils005_GetIPCountry_buf[retlen] = '\0';
  return vt_SteamUtils005_GetIPCountry_buf;
}

// slot 5: GetImageSize(int32 iImage, uint32* pnWidth, uint32* pnHeight) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamUtils005_GetImageSize(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 6: GetImageRGBA(int32 iImage, uint8_t* pubDest, int32 nDestBufferSize) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamUtils005_GetImageRGBA(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 7: GetCSERIPPort(uint32* unIP, uint16_t* usPort) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamUtils005_GetCSERIPPort(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 8: GetCurrentBatteryPower() -> uint32 | __thiscall ret 0
static uint32_t THISCALL vt_SteamUtils005_GetCurrentBatteryPower(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(5, 8, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  uint32_t ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 9: GetAppID() -> uint32 | __thiscall ret 0
static uint32_t THISCALL vt_SteamUtils005_GetAppID(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(5, 9, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  uint32_t ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 10: SetOverlayNotificationPosition(uint32 eNotificationPosition) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_SteamUtils005_SetOverlayNotificationPosition(void *self, uint32_t dummy0) {
  (void)self;
}

// slot 11: IsAPICallCompleted(uint64 hSteamAPICall, bool* pbFailed) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamUtils005_IsAPICallCompleted(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 12: GetAPICallFailureReason(uint64 hSteamAPICall) -> uint32 | __thiscall ret 8 (STUB)
static uint32_t THISCALL vt_SteamUtils005_GetAPICallFailureReason(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 13: GetAPICallResult(uint64 hSteamAPICall, void* pCallback, int32 cubCallback, int32 iCallbackExpected, bool* pbFailed) -> bool | __thiscall ret 24 (STUB)
static int THISCALL vt_SteamUtils005_GetAPICallResult(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5) {
  (void)self;
  return 0;
}

// slot 14: RunFrame() -> void | __thiscall ret 0 (STUB)
static void THISCALL vt_SteamUtils005_RunFrame(void *self) {
  (void)self;
}

// slot 15: GetIPCCallCount() -> uint32 | __thiscall ret 0 (STUB)
static uint32_t THISCALL vt_SteamUtils005_GetIPCCallCount(void *self) {
  (void)self;
  return 0;
}

// slot 16: SetWarningMessageHook(void* pFunction) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_SteamUtils005_SetWarningMessageHook(void *self, uint32_t dummy0) {
  (void)self;
}

// slot 17: IsOverlayEnabled() -> bool | __thiscall ret 0
static int THISCALL vt_SteamUtils005_IsOverlayEnabled(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(5, 17, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 18: BOverlayNeedsPresent() -> bool | __thiscall ret 0 (STUB)
static int THISCALL vt_SteamUtils005_BOverlayNeedsPresent(void *self) {
  (void)self;
  return 0;
}

// slot 19: CheckFileSignature(const char* szFileName) -> uint64 | __thiscall ret 4 (STUB)
static uint64_t THISCALL vt_SteamUtils005_CheckFileSignature(void *self, uint32_t dummy0) {
  (void)self;
  return 0LL;
}

// slot 20: ShowGamepadTextInput(uint32 eInputMode, uint32 eLineInputMode, const char* pchDescription, uint32 unCharMax) -> bool | __thiscall ret 16 (STUB)
static int THISCALL vt_SteamUtils005_ShowGamepadTextInput(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 21: GetEnteredGamepadTextLength() -> uint32 | __thiscall ret 0 (STUB)
static uint32_t THISCALL vt_SteamUtils005_GetEnteredGamepadTextLength(void *self) {
  (void)self;
  return 0;
}

// slot 22: GetEnteredGamepadTextInput(char* pchText, uint32 cchText) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamUtils005_GetEnteredGamepadTextInput(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

static vfn g_steamutils005_vtbl[23] = {
  (vfn)vt_SteamUtils005_GetSecondsSinceAppActive, // slot 0
  (vfn)vt_SteamUtils005_GetSecondsSinceComputerActive, // slot 1
  (vfn)vt_SteamUtils005_GetConnectedUniverse, // slot 2
  (vfn)vt_SteamUtils005_GetServerRealTime, // slot 3
  (vfn)vt_SteamUtils005_GetIPCountry, // slot 4
  (vfn)vt_SteamUtils005_GetImageSize, // slot 5
  (vfn)vt_SteamUtils005_GetImageRGBA, // slot 6
  (vfn)vt_SteamUtils005_GetCSERIPPort, // slot 7
  (vfn)vt_SteamUtils005_GetCurrentBatteryPower, // slot 8
  (vfn)vt_SteamUtils005_GetAppID, // slot 9
  (vfn)vt_SteamUtils005_SetOverlayNotificationPosition, // slot 10
  (vfn)vt_SteamUtils005_IsAPICallCompleted, // slot 11
  (vfn)vt_SteamUtils005_GetAPICallFailureReason, // slot 12
  (vfn)vt_SteamUtils005_GetAPICallResult, // slot 13
  (vfn)vt_SteamUtils005_RunFrame, // slot 14
  (vfn)vt_SteamUtils005_GetIPCCallCount, // slot 15
  (vfn)vt_SteamUtils005_SetWarningMessageHook, // slot 16
  (vfn)vt_SteamUtils005_IsOverlayEnabled, // slot 17
  (vfn)vt_SteamUtils005_BOverlayNeedsPresent, // slot 18
  (vfn)vt_SteamUtils005_CheckFileSignature, // slot 19
  (vfn)vt_SteamUtils005_ShowGamepadTextInput, // slot 20
  (vfn)vt_SteamUtils005_GetEnteredGamepadTextLength, // slot 21
  (vfn)vt_SteamUtils005_GetEnteredGamepadTextInput, // slot 22
};
struct FakeSteamUtils005 { vfn *vptr; };
static struct FakeSteamUtils005 g_steamutils005_instance = { g_steamutils005_vtbl };

// === STEAMAPPS_INTERFACE_VERSION004 (ordinal 6, family SteamApps) ===

// slot 0: BIsSubscribed() -> bool | __thiscall ret 0
static int THISCALL vt_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribed(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(6, 0, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 1: BIsLowViolence() -> bool | __thiscall ret 0
static int THISCALL vt_STEAMAPPS_INTERFACE_VERSION004_BIsLowViolence(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(6, 1, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 2: BIsCybercafe() -> bool | __thiscall ret 0
static int THISCALL vt_STEAMAPPS_INTERFACE_VERSION004_BIsCybercafe(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(6, 2, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 3: BIsVACBanned() -> bool | __thiscall ret 0
static int THISCALL vt_STEAMAPPS_INTERFACE_VERSION004_BIsVACBanned(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(6, 3, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 4: GetCurrentGameLanguage() -> const char* | __thiscall ret 0 (STRING RETURN -- shim-owned buffer, CR-01)
static char vt_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage_buf[STRING_RETURN_BUF_BYTES];
static const char * THISCALL vt_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[STRING_RETURN_BUF_BYTES - 1]; uint32_t retlen = 0;
  if (!bridge_transact(6, 4, argbuf, 0, retbuf, sizeof(retbuf), &retlen)) {
    vt_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage_buf[0] = '\0';
    return vt_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage_buf;
  }
  memcpy(vt_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage_buf, retbuf, retlen);
  vt_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage_buf[retlen] = '\0';
  return vt_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage_buf;
}

// slot 5: GetAvailableGameLanguages() -> const char* | __thiscall ret 0 (STRING RETURN -- shim-owned buffer, CR-01)
static char vt_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages_buf[STRING_RETURN_BUF_BYTES];
static const char * THISCALL vt_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[STRING_RETURN_BUF_BYTES - 1]; uint32_t retlen = 0;
  if (!bridge_transact(6, 5, argbuf, 0, retbuf, sizeof(retbuf), &retlen)) {
    vt_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages_buf[0] = '\0';
    return vt_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages_buf;
  }
  memcpy(vt_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages_buf, retbuf, retlen);
  vt_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages_buf[retlen] = '\0';
  return vt_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages_buf;
}

// slot 6: BIsSubscribedApp(uint32 appID) -> bool | __thiscall ret 4
static int THISCALL vt_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedApp(void *self, uint32_t appID) {
  (void)self;
  uint8_t argbuf[4];
  uint32_t argOff = 0;
  memcpy(argbuf + argOff, &appID, 4); argOff += 4;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(6, 6, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 7: BIsDlcInstalled(uint32 appID) -> bool | __thiscall ret 4
static int THISCALL vt_STEAMAPPS_INTERFACE_VERSION004_BIsDlcInstalled(void *self, uint32_t appID) {
  (void)self;
  uint8_t argbuf[4];
  uint32_t argOff = 0;
  memcpy(argbuf + argOff, &appID, 4); argOff += 4;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(6, 7, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 8: GetEarliestPurchaseUnixTime(uint32 nAppID) -> uint32 | __thiscall ret 4
static uint32_t THISCALL vt_STEAMAPPS_INTERFACE_VERSION004_GetEarliestPurchaseUnixTime(void *self, uint32_t nAppID) {
  (void)self;
  uint8_t argbuf[4];
  uint32_t argOff = 0;
  memcpy(argbuf + argOff, &nAppID, 4); argOff += 4;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(6, 8, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  uint32_t ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 9: BIsSubscribedFromFreeWeekend() -> bool | __thiscall ret 0
static int THISCALL vt_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedFromFreeWeekend(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(6, 9, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 10: GetDLCCount() -> int32 | __thiscall ret 0
static int32_t THISCALL vt_STEAMAPPS_INTERFACE_VERSION004_GetDLCCount(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(6, 10, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int32_t ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 11: BGetDLCDataByIndex(int32 iDLC, uint32* pAppID, bool* pbAvailable, char* pchName, int32 cchNameBufferSize) -> bool | __thiscall ret 20 (STUB)
static int THISCALL vt_STEAMAPPS_INTERFACE_VERSION004_BGetDLCDataByIndex(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4) {
  (void)self;
  return 0;
}

// slot 12: InstallDLC(uint32 nAppID) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_STEAMAPPS_INTERFACE_VERSION004_InstallDLC(void *self, uint32_t dummy0) {
  (void)self;
}

// slot 13: UninstallDLC(uint32 nAppID) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_STEAMAPPS_INTERFACE_VERSION004_UninstallDLC(void *self, uint32_t dummy0) {
  (void)self;
}

static vfn g_steamapps_interface_version004_vtbl[14] = {
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribed, // slot 0
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION004_BIsLowViolence, // slot 1
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION004_BIsCybercafe, // slot 2
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION004_BIsVACBanned, // slot 3
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage, // slot 4
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages, // slot 5
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedApp, // slot 6
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION004_BIsDlcInstalled, // slot 7
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION004_GetEarliestPurchaseUnixTime, // slot 8
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedFromFreeWeekend, // slot 9
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION004_GetDLCCount, // slot 10
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION004_BGetDLCDataByIndex, // slot 11
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION004_InstallDLC, // slot 12
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION004_UninstallDLC, // slot 13
};
struct FakeSTEAMAPPS_INTERFACE_VERSION004 { vfn *vptr; };
static struct FakeSTEAMAPPS_INTERFACE_VERSION004 g_steamapps_interface_version004_instance = { g_steamapps_interface_version004_vtbl };

// === STEAMUSERSTATS_INTERFACE_VERSION010 (ordinal 7, family SteamUserStats) ===

// slot 0: RequestCurrentStats() -> bool | __thiscall ret 0 (HELPER FALLBACK)
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_RequestCurrentStats(void *self) {
  (void)self;
  return 1;
}

// slot 1: GetStat_2(const char* pchName, float* pData) -> bool | __thiscall ret 8
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2(void *self, const char * pchName, float * pData) {
  (void)self;
  uint8_t argbuf[4100];
  uint32_t argOff = 0;
  {
    uint32_t strLen;
    if (pchName == NULL) {
      strLen = 0xFFFFFFFFu;
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
    } else {
      size_t rawLen = strlen(pchName);
      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
      memcpy(argbuf + argOff, pchName, strLen); argOff += strLen;
    }
  }
  uint8_t retbuf[8]; uint32_t retlen = 0;
  if (!bridge_transact(7, 1, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  uint32_t respOff = 4;
  if (pData != NULL && retlen >= respOff + 4) {
    float outVal; memcpy(&outVal, retbuf + respOff, 4);
    *pData = outVal;
  }
  respOff += 4;
  return ret;
}

// slot 2: GetStat(const char* pchName, int32* pData) -> bool | __thiscall ret 8
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat(void *self, const char * pchName, int32_t * pData) {
  (void)self;
  uint8_t argbuf[4100];
  uint32_t argOff = 0;
  {
    uint32_t strLen;
    if (pchName == NULL) {
      strLen = 0xFFFFFFFFu;
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
    } else {
      size_t rawLen = strlen(pchName);
      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
      memcpy(argbuf + argOff, pchName, strLen); argOff += strLen;
    }
  }
  uint8_t retbuf[8]; uint32_t retlen = 0;
  if (!bridge_transact(7, 2, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  uint32_t respOff = 4;
  if (pData != NULL && retlen >= respOff + 4) {
    int32_t outVal; memcpy(&outVal, retbuf + respOff, 4);
    *pData = outVal;
  }
  respOff += 4;
  return ret;
}

// slot 3: SetStat_2(const char* pchName, float fData) -> bool | __thiscall ret 8
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2(void *self, const char * pchName, uint32_t fData) {
  (void)self;
  uint8_t argbuf[4104];
  uint32_t argOff = 0;
  {
    uint32_t strLen;
    if (pchName == NULL) {
      strLen = 0xFFFFFFFFu;
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
    } else {
      size_t rawLen = strlen(pchName);
      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
      memcpy(argbuf + argOff, pchName, strLen); argOff += strLen;
    }
  }
  memcpy(argbuf + argOff, &fData, 4); argOff += 4;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(7, 3, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 4: SetStat(const char* pchName, int32 nData) -> bool | __thiscall ret 8
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat(void *self, const char * pchName, int32_t nData) {
  (void)self;
  uint8_t argbuf[4104];
  uint32_t argOff = 0;
  {
    uint32_t strLen;
    if (pchName == NULL) {
      strLen = 0xFFFFFFFFu;
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
    } else {
      size_t rawLen = strlen(pchName);
      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
      memcpy(argbuf + argOff, pchName, strLen); argOff += strLen;
    }
  }
  memcpy(argbuf + argOff, &nData, 4); argOff += 4;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(7, 4, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 5: UpdateAvgRateStat(const char* pchName, float flCountThisSession, double dSessionLength) -> bool | __thiscall ret 16
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat(void *self, const char * pchName, uint32_t flCountThisSession, double dSessionLength) {
  (void)self;
  uint8_t argbuf[4112];
  uint32_t argOff = 0;
  {
    uint32_t strLen;
    if (pchName == NULL) {
      strLen = 0xFFFFFFFFu;
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
    } else {
      size_t rawLen = strlen(pchName);
      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
      memcpy(argbuf + argOff, pchName, strLen); argOff += strLen;
    }
  }
  memcpy(argbuf + argOff, &flCountThisSession, 4); argOff += 4;
  memcpy(argbuf + argOff, &dSessionLength, 8); argOff += 8;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(7, 5, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 6: GetAchievement(const char* pchName, bool* pbAchieved) -> bool | __thiscall ret 8
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement(void *self, const char * pchName, int * pbAchieved) {
  (void)self;
  uint8_t argbuf[4100];
  uint32_t argOff = 0;
  {
    uint32_t strLen;
    if (pchName == NULL) {
      strLen = 0xFFFFFFFFu;
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
    } else {
      size_t rawLen = strlen(pchName);
      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
      memcpy(argbuf + argOff, pchName, strLen); argOff += strLen;
    }
  }
  uint8_t retbuf[8]; uint32_t retlen = 0;
  if (!bridge_transact(7, 6, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  uint32_t respOff = 4;
  if (pbAchieved != NULL && retlen >= respOff + 4) {
    int outVal; memcpy(&outVal, retbuf + respOff, 4);
    *pbAchieved = outVal;
  }
  respOff += 4;
  return ret;
}

// slot 7: SetAchievement(const char* pchName) -> bool | __thiscall ret 4
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement(void *self, const char * pchName) {
  (void)self;
  uint8_t argbuf[4100];
  uint32_t argOff = 0;
  {
    uint32_t strLen;
    if (pchName == NULL) {
      strLen = 0xFFFFFFFFu;
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
    } else {
      size_t rawLen = strlen(pchName);
      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
      memcpy(argbuf + argOff, pchName, strLen); argOff += strLen;
    }
  }
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(7, 7, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 8: ClearAchievement(const char* pchName) -> bool | __thiscall ret 4
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement(void *self, const char * pchName) {
  (void)self;
  uint8_t argbuf[4100];
  uint32_t argOff = 0;
  {
    uint32_t strLen;
    if (pchName == NULL) {
      strLen = 0xFFFFFFFFu;
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
    } else {
      size_t rawLen = strlen(pchName);
      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
      memcpy(argbuf + argOff, pchName, strLen); argOff += strLen;
    }
  }
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(7, 8, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 9: GetAchievementAndUnlockTime(const char* pchName, bool* pbAchieved, uint32* punUnlockTime) -> bool | __thiscall ret 12
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime(void *self, const char * pchName, int * pbAchieved, uint32_t * punUnlockTime) {
  (void)self;
  uint8_t argbuf[4100];
  uint32_t argOff = 0;
  {
    uint32_t strLen;
    if (pchName == NULL) {
      strLen = 0xFFFFFFFFu;
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
    } else {
      size_t rawLen = strlen(pchName);
      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
      memcpy(argbuf + argOff, pchName, strLen); argOff += strLen;
    }
  }
  uint8_t retbuf[12]; uint32_t retlen = 0;
  if (!bridge_transact(7, 9, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  uint32_t respOff = 4;
  if (pbAchieved != NULL && retlen >= respOff + 4) {
    int outVal; memcpy(&outVal, retbuf + respOff, 4);
    *pbAchieved = outVal;
  }
  respOff += 4;
  if (punUnlockTime != NULL && retlen >= respOff + 4) {
    uint32_t outVal; memcpy(&outVal, retbuf + respOff, 4);
    *punUnlockTime = outVal;
  }
  respOff += 4;
  return ret;
}

// slot 10: StoreStats() -> bool | __thiscall ret 0
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_StoreStats(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(7, 10, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 11: GetAchievementIcon(const char* pchName) -> int32 | __thiscall ret 4 (STUB)
static int32_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementIcon(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 12: GetAchievementDisplayAttribute(const char* pchName, const char* pchKey) -> const char* | __thiscall ret 8 (STRING RETURN -- shim-owned buffer, CR-01)
static char vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_buf[STRING_RETURN_BUF_BYTES];
static const char * THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute(void *self, const char * pchName, const char * pchKey) {
  (void)self;
  uint8_t argbuf[8200];
  uint32_t argOff = 0;
  {
    uint32_t strLen;
    if (pchName == NULL) {
      strLen = 0xFFFFFFFFu;
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
    } else {
      size_t rawLen = strlen(pchName);
      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
      memcpy(argbuf + argOff, pchName, strLen); argOff += strLen;
    }
  }
  {
    uint32_t strLen;
    if (pchKey == NULL) {
      strLen = 0xFFFFFFFFu;
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
    } else {
      size_t rawLen = strlen(pchKey);
      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
      memcpy(argbuf + argOff, pchKey, strLen); argOff += strLen;
    }
  }
  uint8_t retbuf[STRING_RETURN_BUF_BYTES - 1]; uint32_t retlen = 0;
  if (!bridge_transact(7, 12, argbuf, argOff, retbuf, sizeof(retbuf), &retlen)) {
    vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_buf[0] = '\0';
    return vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_buf;
  }
  memcpy(vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_buf, retbuf, retlen);
  vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_buf[retlen] = '\0';
  return vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_buf;
}

// slot 13: IndicateAchievementProgress(const char* pchName, uint32 nCurProgress, uint32 nMaxProgress) -> bool | __thiscall ret 12
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress(void *self, const char * pchName, uint32_t nCurProgress, uint32_t nMaxProgress) {
  (void)self;
  uint8_t argbuf[4108];
  uint32_t argOff = 0;
  {
    uint32_t strLen;
    if (pchName == NULL) {
      strLen = 0xFFFFFFFFu;
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
    } else {
      size_t rawLen = strlen(pchName);
      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
      memcpy(argbuf + argOff, pchName, strLen); argOff += strLen;
    }
  }
  memcpy(argbuf + argOff, &nCurProgress, 4); argOff += 4;
  memcpy(argbuf + argOff, &nMaxProgress, 4); argOff += 4;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(7, 13, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 14: RequestUserStats(CSteamID steamIDUser) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_RequestUserStats(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 15: GetUserStat_2(CSteamID steamIDUser, const char* pchName, float* pData) -> bool | __thiscall ret 16 (STUB)
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetUserStat_2(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 16: GetUserStat(CSteamID steamIDUser, const char* pchName, int32* pData) -> bool | __thiscall ret 16 (STUB)
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetUserStat(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 17: GetUserAchievement(CSteamID steamIDUser, const char* pchName, bool* pbAchieved) -> bool | __thiscall ret 16 (STUB)
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetUserAchievement(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 18: GetUserAchievementAndUnlockTime(CSteamID steamIDUser, const char* pchName, bool* pbAchieved, uint32* punUnlockTime) -> bool | __thiscall ret 20 (STUB)
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetUserAchievementAndUnlockTime(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4) {
  (void)self;
  return 0;
}

// slot 19: ResetAllStats(bool bAchievementsToo) -> bool | __thiscall ret 4
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_ResetAllStats(void *self, int bAchievementsToo) {
  (void)self;
  uint8_t argbuf[4];
  uint32_t argOff = 0;
  memcpy(argbuf + argOff, &bAchievementsToo, 4); argOff += 4;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(7, 19, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 20: FindOrCreateLeaderboard(const char* pchLeaderboardName, uint32 eLeaderboardSortMethod, uint32 eLeaderboardDisplayType) -> uint64 | __thiscall ret 12 (STUB)
static uint64_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_FindOrCreateLeaderboard(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0LL;
}

// slot 21: FindLeaderboard(const char* pchLeaderboardName) -> uint64 | __thiscall ret 4 (STUB)
static uint64_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_FindLeaderboard(void *self, uint32_t dummy0) {
  (void)self;
  return 0LL;
}

// slot 22: GetLeaderboardName(uint64 hSteamLeaderboard) -> const char* | __thiscall ret 8 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetLeaderboardName(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return "";
}

// slot 23: GetLeaderboardEntryCount(uint64 hSteamLeaderboard) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetLeaderboardEntryCount(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 24: GetLeaderboardSortMethod(uint64 hSteamLeaderboard) -> uint32 | __thiscall ret 8 (STUB)
static uint32_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetLeaderboardSortMethod(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 25: GetLeaderboardDisplayType(uint64 hSteamLeaderboard) -> uint32 | __thiscall ret 8 (STUB)
static uint32_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetLeaderboardDisplayType(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 26: DownloadLeaderboardEntries(uint64 hSteamLeaderboard, uint32 eLeaderboardDataRequest, int32 nRangeStart, int32 nRangeEnd) -> uint64 | __thiscall ret 20 (STUB)
static uint64_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_DownloadLeaderboardEntries(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4) {
  (void)self;
  return 0LL;
}

// slot 27: DownloadLeaderboardEntriesForUsers(uint64 hSteamLeaderboard, CSteamID* prgUsers, int32 cUsers) -> uint64 | __thiscall ret 16 (STUB)
static uint64_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_DownloadLeaderboardEntriesForUsers(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0LL;
}

// slot 28: GetDownloadedLeaderboardEntry(uint64 hSteamLeaderboardEntries, int32 index, w_LeaderboardEntry_t_111x* pLeaderboardEntry, int32* pDetails, int32 cDetailsMax) -> bool | __thiscall ret 24 (STUB)
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetDownloadedLeaderboardEntry(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5) {
  (void)self;
  return 0;
}

// slot 29: UploadLeaderboardScore(uint64 hSteamLeaderboard, uint32 eLeaderboardUploadScoreMethod, int32 nScore, const int32_t* pScoreDetails, int32 cScoreDetailsCount) -> uint64 | __thiscall ret 24 (STUB)
static uint64_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_UploadLeaderboardScore(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5) {
  (void)self;
  return 0LL;
}

// slot 30: AttachLeaderboardUGC(uint64 hSteamLeaderboard, uint64 hUGC) -> uint64 | __thiscall ret 16 (STUB)
static uint64_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_AttachLeaderboardUGC(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0LL;
}

// slot 31: GetNumberOfCurrentPlayers() -> uint64 | __thiscall ret 0 (STUB)
static uint64_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetNumberOfCurrentPlayers(void *self) {
  (void)self;
  return 0LL;
}

// slot 32: RequestGlobalAchievementPercentages() -> uint64 | __thiscall ret 0 (STUB)
static uint64_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_RequestGlobalAchievementPercentages(void *self) {
  (void)self;
  return 0LL;
}

// slot 33: GetMostAchievedAchievementInfo(char* pchName, uint32 unNameBufLen, float* pflPercent, bool* pbAchieved) -> int32 | __thiscall ret 16 (STUB)
static int32_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetMostAchievedAchievementInfo(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 34: GetNextMostAchievedAchievementInfo(int32 iIteratorPrevious, char* pchName, uint32 unNameBufLen, float* pflPercent, bool* pbAchieved) -> int32 | __thiscall ret 20 (STUB)
static int32_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetNextMostAchievedAchievementInfo(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4) {
  (void)self;
  return 0;
}

// slot 35: GetAchievementAchievedPercent(const char* pchName, float* pflPercent) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAchievedPercent(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 36: RequestGlobalStats(int32 nHistoryDays) -> uint64 | __thiscall ret 4 (STUB)
static uint64_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_RequestGlobalStats(void *self, uint32_t dummy0) {
  (void)self;
  return 0LL;
}

// slot 37: GetGlobalStat_2(const char* pchStatName, double* pData) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetGlobalStat_2(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 38: GetGlobalStat(const char* pchStatName, int64_t* pData) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetGlobalStat(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 39: GetGlobalStatHistory_2(const char* pchStatName, double* pData, uint32 cubData) -> int32 | __thiscall ret 12 (STUB)
static int32_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetGlobalStatHistory_2(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 40: GetGlobalStatHistory(const char* pchStatName, int64_t* pData, uint32 cubData) -> int32 | __thiscall ret 12 (STUB)
static int32_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetGlobalStatHistory(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

static vfn g_steamuserstats_interface_version010_vtbl[41] = {
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_RequestCurrentStats, // slot 0
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2, // slot 1
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat, // slot 2
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2, // slot 3
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat, // slot 4
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat, // slot 5
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement, // slot 6
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement, // slot 7
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement, // slot 8
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime, // slot 9
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_StoreStats, // slot 10
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementIcon, // slot 11
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute, // slot 12
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress, // slot 13
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_RequestUserStats, // slot 14
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetUserStat_2, // slot 15
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetUserStat, // slot 16
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetUserAchievement, // slot 17
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetUserAchievementAndUnlockTime, // slot 18
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_ResetAllStats, // slot 19
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_FindOrCreateLeaderboard, // slot 20
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_FindLeaderboard, // slot 21
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetLeaderboardName, // slot 22
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetLeaderboardEntryCount, // slot 23
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetLeaderboardSortMethod, // slot 24
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetLeaderboardDisplayType, // slot 25
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_DownloadLeaderboardEntries, // slot 26
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_DownloadLeaderboardEntriesForUsers, // slot 27
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetDownloadedLeaderboardEntry, // slot 28
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_UploadLeaderboardScore, // slot 29
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_AttachLeaderboardUGC, // slot 30
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetNumberOfCurrentPlayers, // slot 31
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_RequestGlobalAchievementPercentages, // slot 32
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetMostAchievedAchievementInfo, // slot 33
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetNextMostAchievedAchievementInfo, // slot 34
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAchievedPercent, // slot 35
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_RequestGlobalStats, // slot 36
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetGlobalStat_2, // slot 37
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetGlobalStat, // slot 38
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetGlobalStatHistory_2, // slot 39
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION010_GetGlobalStatHistory, // slot 40
};
struct FakeSTEAMUSERSTATS_INTERFACE_VERSION010 { vfn *vptr; };
static struct FakeSTEAMUSERSTATS_INTERFACE_VERSION010 g_steamuserstats_interface_version010_instance = { g_steamuserstats_interface_version010_vtbl };

// === SteamFriends013 (ordinal 8, family SteamFriends) ===

// slot 0: GetPersonaName() -> const char* | __thiscall ret 0 (STRING RETURN -- shim-owned buffer, CR-01)
static char vt_SteamFriends013_GetPersonaName_buf[STRING_RETURN_BUF_BYTES];
static const char * THISCALL vt_SteamFriends013_GetPersonaName(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[STRING_RETURN_BUF_BYTES - 1]; uint32_t retlen = 0;
  if (!bridge_transact(8, 0, argbuf, 0, retbuf, sizeof(retbuf), &retlen)) {
    vt_SteamFriends013_GetPersonaName_buf[0] = '\0';
    return vt_SteamFriends013_GetPersonaName_buf;
  }
  memcpy(vt_SteamFriends013_GetPersonaName_buf, retbuf, retlen);
  vt_SteamFriends013_GetPersonaName_buf[retlen] = '\0';
  return vt_SteamFriends013_GetPersonaName_buf;
}

// slot 1: SetPersonaName(const char* pchPersonaName) -> uint64 | __thiscall ret 4 (STUB)
static uint64_t THISCALL vt_SteamFriends013_SetPersonaName(void *self, uint32_t dummy0) {
  (void)self;
  return 0LL;
}

// slot 2: GetPersonaState() -> uint32 | __thiscall ret 0
static uint32_t THISCALL vt_SteamFriends013_GetPersonaState(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(8, 2, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  uint32_t ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 3: GetFriendCount(int32 iFriendFlags) -> int32 | __thiscall ret 4 (STUB)
static int32_t THISCALL vt_SteamFriends013_GetFriendCount(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 4: GetFriendByIndex(CSteamID* _ret, int32 iFriend) -> CSteamID | __thiscall ret 12 (SRET -- hidden return pointer) (STUB)
static void * THISCALL vt_SteamFriends013_GetFriendByIndex(void *self, void *sretOut, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  memset(sretOut, 0, 8);
  return sretOut;
}

// slot 5: GetFriendRelationship(CSteamID steamIDFriend) -> uint32 | __thiscall ret 8 (STUB)
static uint32_t THISCALL vt_SteamFriends013_GetFriendRelationship(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 6: GetFriendPersonaState(CSteamID steamIDFriend) -> uint32 | __thiscall ret 8 (STUB)
static uint32_t THISCALL vt_SteamFriends013_GetFriendPersonaState(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 7: GetFriendPersonaName(CSteamID steamIDFriend) -> const char* | __thiscall ret 8 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_SteamFriends013_GetFriendPersonaName(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return "";
}

// slot 8: GetFriendGamePlayed(CSteamID steamIDFriend, FriendGameInfo_t* pFriendGameInfo) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamFriends013_GetFriendGamePlayed(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 9: GetFriendPersonaNameHistory(CSteamID steamIDFriend, int32 iPersonaName) -> const char* | __thiscall ret 12 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_SteamFriends013_GetFriendPersonaNameHistory(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return "";
}

// slot 10: HasFriend(CSteamID steamIDFriend, int32 iFriendFlags) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamFriends013_HasFriend(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 11: GetClanCount() -> int32 | __thiscall ret 0 (STUB)
static int32_t THISCALL vt_SteamFriends013_GetClanCount(void *self) {
  (void)self;
  return 0;
}

// slot 12: GetClanByIndex(CSteamID* _ret) -> CSteamID | __thiscall ret 8 (SRET -- hidden return pointer) (STUB)
static void * THISCALL vt_SteamFriends013_GetClanByIndex(void *self, void *sretOut, uint32_t dummy0) {
  (void)self;
  memset(sretOut, 0, 8);
  return sretOut;
}

// slot 13: GetClanName(CSteamID steamIDClan) -> const char* | __thiscall ret 8 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_SteamFriends013_GetClanName(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return "";
}

// slot 14: GetClanTag(CSteamID steamIDClan) -> const char* | __thiscall ret 8 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_SteamFriends013_GetClanTag(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return "";
}

// slot 15: GetClanActivityCounts(CSteamID steamIDClan, int32* pnOnline, int32* pnInGame, int32* pnChatting) -> bool | __thiscall ret 20 (STUB)
static int THISCALL vt_SteamFriends013_GetClanActivityCounts(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4) {
  (void)self;
  return 0;
}

// slot 16: DownloadClanActivityCounts(CSteamID* psteamIDClans, int32 cClansToRequest) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_SteamFriends013_DownloadClanActivityCounts(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 17: GetFriendCountFromSource(CSteamID steamIDSource) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends013_GetFriendCountFromSource(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 18: GetFriendFromSourceByIndex(CSteamID* _ret, CSteamID steamIDSource) -> CSteamID | __thiscall ret 16 (SRET -- hidden return pointer) (STUB)
static void * THISCALL vt_SteamFriends013_GetFriendFromSourceByIndex(void *self, void *sretOut, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  memset(sretOut, 0, 8);
  return sretOut;
}

// slot 19: IsUserInSource(CSteamID steamIDUser, CSteamID steamIDSource) -> bool | __thiscall ret 16 (STUB)
static int THISCALL vt_SteamFriends013_IsUserInSource(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 20: SetInGameVoiceSpeaking(CSteamID steamIDUser, bool bSpeaking) -> void | __thiscall ret 12 (STUB)
static void THISCALL vt_SteamFriends013_SetInGameVoiceSpeaking(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
}

// slot 21: ActivateGameOverlay(const char* pchDialog) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_SteamFriends013_ActivateGameOverlay(void *self, uint32_t dummy0) {
  (void)self;
}

// slot 22: ActivateGameOverlayToUser(const char* pchDialog, CSteamID steamID) -> void | __thiscall ret 12 (STUB)
static void THISCALL vt_SteamFriends013_ActivateGameOverlayToUser(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
}

// slot 23: ActivateGameOverlayToWebPage(const char* pchURL) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_SteamFriends013_ActivateGameOverlayToWebPage(void *self, uint32_t dummy0) {
  (void)self;
}

// slot 24: ActivateGameOverlayToStore(uint32 nAppID, uint32 eFlag) -> void | __thiscall ret 8 (STUB)
static void THISCALL vt_SteamFriends013_ActivateGameOverlayToStore(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
}

// slot 25: SetPlayedWith(CSteamID steamIDUserPlayedWith) -> void | __thiscall ret 8 (STUB)
static void THISCALL vt_SteamFriends013_SetPlayedWith(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
}

// slot 26: ActivateGameOverlayInviteDialog(CSteamID steamIDLobby) -> void | __thiscall ret 8 (STUB)
static void THISCALL vt_SteamFriends013_ActivateGameOverlayInviteDialog(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
}

// slot 27: GetSmallFriendAvatar(CSteamID steamIDFriend) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends013_GetSmallFriendAvatar(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 28: GetMediumFriendAvatar(CSteamID steamIDFriend) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends013_GetMediumFriendAvatar(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 29: GetLargeFriendAvatar(CSteamID steamIDFriend) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends013_GetLargeFriendAvatar(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 30: RequestUserInformation(CSteamID steamIDUser, bool bRequireNameOnly) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamFriends013_RequestUserInformation(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 31: RequestClanOfficerList(CSteamID steamIDClan) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_SteamFriends013_RequestClanOfficerList(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 32: GetClanOwner(CSteamID* _ret) -> CSteamID | __thiscall ret 8 (SRET -- hidden return pointer) (STUB)
static void * THISCALL vt_SteamFriends013_GetClanOwner(void *self, void *sretOut, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  memset(sretOut, 0, 8);
  return sretOut;
}

// slot 33: GetClanOfficerCount(CSteamID steamIDClan) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends013_GetClanOfficerCount(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 34: GetClanOfficerByIndex(CSteamID* _ret, CSteamID steamIDClan) -> CSteamID | __thiscall ret 16 (SRET -- hidden return pointer) (STUB)
static void * THISCALL vt_SteamFriends013_GetClanOfficerByIndex(void *self, void *sretOut, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  memset(sretOut, 0, 8);
  return sretOut;
}

// slot 35: GetUserRestrictions() -> uint32 | __thiscall ret 0 (STUB)
static uint32_t THISCALL vt_SteamFriends013_GetUserRestrictions(void *self) {
  (void)self;
  return 0;
}

// slot 36: SetRichPresence(const char* pchKey, const char* pchValue) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamFriends013_SetRichPresence(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 37: ClearRichPresence() -> void | __thiscall ret 0 (STUB)
static void THISCALL vt_SteamFriends013_ClearRichPresence(void *self) {
  (void)self;
}

// slot 38: GetFriendRichPresence(CSteamID steamIDFriend, const char* pchKey) -> const char* | __thiscall ret 12 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_SteamFriends013_GetFriendRichPresence(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return "";
}

// slot 39: GetFriendRichPresenceKeyCount(CSteamID steamIDFriend) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends013_GetFriendRichPresenceKeyCount(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 40: GetFriendRichPresenceKeyByIndex(CSteamID steamIDFriend, int32 iKey) -> const char* | __thiscall ret 12 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_SteamFriends013_GetFriendRichPresenceKeyByIndex(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return "";
}

// slot 41: RequestFriendRichPresence(CSteamID steamIDFriend) -> void | __thiscall ret 8 (STUB)
static void THISCALL vt_SteamFriends013_RequestFriendRichPresence(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
}

// slot 42: InviteUserToGame(CSteamID steamIDFriend, const char* pchConnectString) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamFriends013_InviteUserToGame(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 43: GetCoplayFriendCount() -> int32 | __thiscall ret 0 (STUB)
static int32_t THISCALL vt_SteamFriends013_GetCoplayFriendCount(void *self) {
  (void)self;
  return 0;
}

// slot 44: GetCoplayFriend(CSteamID* _ret) -> CSteamID | __thiscall ret 8 (SRET -- hidden return pointer) (STUB)
static void * THISCALL vt_SteamFriends013_GetCoplayFriend(void *self, void *sretOut, uint32_t dummy0) {
  (void)self;
  memset(sretOut, 0, 8);
  return sretOut;
}

// slot 45: GetFriendCoplayTime(CSteamID steamIDFriend) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends013_GetFriendCoplayTime(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 46: GetFriendCoplayGame(CSteamID steamIDFriend) -> uint32 | __thiscall ret 8 (STUB)
static uint32_t THISCALL vt_SteamFriends013_GetFriendCoplayGame(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 47: JoinClanChatRoom(CSteamID steamIDClan) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_SteamFriends013_JoinClanChatRoom(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 48: LeaveClanChatRoom(CSteamID steamIDClan) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamFriends013_LeaveClanChatRoom(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 49: GetClanChatMemberCount(CSteamID steamIDClan) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamFriends013_GetClanChatMemberCount(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 50: GetChatMemberByIndex(CSteamID* _ret, CSteamID steamIDClan) -> CSteamID | __thiscall ret 16 (SRET -- hidden return pointer) (STUB)
static void * THISCALL vt_SteamFriends013_GetChatMemberByIndex(void *self, void *sretOut, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  memset(sretOut, 0, 8);
  return sretOut;
}

// slot 51: SendClanChatMessage(CSteamID steamIDClanChat, const char* pchText) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamFriends013_SendClanChatMessage(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 52: GetClanChatMessage(CSteamID steamIDClanChat, int32 iMessage, void* prgchText, int32 cchTextMax, uint32* _e, CSteamID* _f) -> int32 | __thiscall ret 28 (STUB)
static int32_t THISCALL vt_SteamFriends013_GetClanChatMessage(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5, uint32_t dummy6) {
  (void)self;
  return 0;
}

// slot 53: IsClanChatAdmin(CSteamID steamIDClanChat, CSteamID steamIDUser) -> bool | __thiscall ret 16 (STUB)
static int THISCALL vt_SteamFriends013_IsClanChatAdmin(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 54: IsClanChatWindowOpenInSteam(CSteamID steamIDClanChat) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamFriends013_IsClanChatWindowOpenInSteam(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 55: OpenClanChatWindowInSteam(CSteamID steamIDClanChat) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamFriends013_OpenClanChatWindowInSteam(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 56: CloseClanChatWindowInSteam(CSteamID steamIDClanChat) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamFriends013_CloseClanChatWindowInSteam(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 57: SetListenForFriendsMessages(bool bInterceptEnabled) -> bool | __thiscall ret 4 (STUB)
static int THISCALL vt_SteamFriends013_SetListenForFriendsMessages(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 58: ReplyToFriendMessage(CSteamID steamIDFriend, const char* pchMsgToSend) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamFriends013_ReplyToFriendMessage(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 59: GetFriendMessage(CSteamID steamIDFriend, int32 iMessageID, void* pvData, int32 cubData, uint32* peChatEntryType) -> int32 | __thiscall ret 24 (STUB)
static int32_t THISCALL vt_SteamFriends013_GetFriendMessage(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5) {
  (void)self;
  return 0;
}

// slot 60: GetFollowerCount(CSteamID steamID) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_SteamFriends013_GetFollowerCount(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 61: IsFollowing(CSteamID steamID) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_SteamFriends013_IsFollowing(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 62: EnumerateFollowingList(uint32 unStartIndex) -> uint64 | __thiscall ret 4 (STUB)
static uint64_t THISCALL vt_SteamFriends013_EnumerateFollowingList(void *self, uint32_t dummy0) {
  (void)self;
  return 0LL;
}

static vfn g_steamfriends013_vtbl[63] = {
  (vfn)vt_SteamFriends013_GetPersonaName, // slot 0
  (vfn)vt_SteamFriends013_SetPersonaName, // slot 1
  (vfn)vt_SteamFriends013_GetPersonaState, // slot 2
  (vfn)vt_SteamFriends013_GetFriendCount, // slot 3
  (vfn)vt_SteamFriends013_GetFriendByIndex, // slot 4
  (vfn)vt_SteamFriends013_GetFriendRelationship, // slot 5
  (vfn)vt_SteamFriends013_GetFriendPersonaState, // slot 6
  (vfn)vt_SteamFriends013_GetFriendPersonaName, // slot 7
  (vfn)vt_SteamFriends013_GetFriendGamePlayed, // slot 8
  (vfn)vt_SteamFriends013_GetFriendPersonaNameHistory, // slot 9
  (vfn)vt_SteamFriends013_HasFriend, // slot 10
  (vfn)vt_SteamFriends013_GetClanCount, // slot 11
  (vfn)vt_SteamFriends013_GetClanByIndex, // slot 12
  (vfn)vt_SteamFriends013_GetClanName, // slot 13
  (vfn)vt_SteamFriends013_GetClanTag, // slot 14
  (vfn)vt_SteamFriends013_GetClanActivityCounts, // slot 15
  (vfn)vt_SteamFriends013_DownloadClanActivityCounts, // slot 16
  (vfn)vt_SteamFriends013_GetFriendCountFromSource, // slot 17
  (vfn)vt_SteamFriends013_GetFriendFromSourceByIndex, // slot 18
  (vfn)vt_SteamFriends013_IsUserInSource, // slot 19
  (vfn)vt_SteamFriends013_SetInGameVoiceSpeaking, // slot 20
  (vfn)vt_SteamFriends013_ActivateGameOverlay, // slot 21
  (vfn)vt_SteamFriends013_ActivateGameOverlayToUser, // slot 22
  (vfn)vt_SteamFriends013_ActivateGameOverlayToWebPage, // slot 23
  (vfn)vt_SteamFriends013_ActivateGameOverlayToStore, // slot 24
  (vfn)vt_SteamFriends013_SetPlayedWith, // slot 25
  (vfn)vt_SteamFriends013_ActivateGameOverlayInviteDialog, // slot 26
  (vfn)vt_SteamFriends013_GetSmallFriendAvatar, // slot 27
  (vfn)vt_SteamFriends013_GetMediumFriendAvatar, // slot 28
  (vfn)vt_SteamFriends013_GetLargeFriendAvatar, // slot 29
  (vfn)vt_SteamFriends013_RequestUserInformation, // slot 30
  (vfn)vt_SteamFriends013_RequestClanOfficerList, // slot 31
  (vfn)vt_SteamFriends013_GetClanOwner, // slot 32
  (vfn)vt_SteamFriends013_GetClanOfficerCount, // slot 33
  (vfn)vt_SteamFriends013_GetClanOfficerByIndex, // slot 34
  (vfn)vt_SteamFriends013_GetUserRestrictions, // slot 35
  (vfn)vt_SteamFriends013_SetRichPresence, // slot 36
  (vfn)vt_SteamFriends013_ClearRichPresence, // slot 37
  (vfn)vt_SteamFriends013_GetFriendRichPresence, // slot 38
  (vfn)vt_SteamFriends013_GetFriendRichPresenceKeyCount, // slot 39
  (vfn)vt_SteamFriends013_GetFriendRichPresenceKeyByIndex, // slot 40
  (vfn)vt_SteamFriends013_RequestFriendRichPresence, // slot 41
  (vfn)vt_SteamFriends013_InviteUserToGame, // slot 42
  (vfn)vt_SteamFriends013_GetCoplayFriendCount, // slot 43
  (vfn)vt_SteamFriends013_GetCoplayFriend, // slot 44
  (vfn)vt_SteamFriends013_GetFriendCoplayTime, // slot 45
  (vfn)vt_SteamFriends013_GetFriendCoplayGame, // slot 46
  (vfn)vt_SteamFriends013_JoinClanChatRoom, // slot 47
  (vfn)vt_SteamFriends013_LeaveClanChatRoom, // slot 48
  (vfn)vt_SteamFriends013_GetClanChatMemberCount, // slot 49
  (vfn)vt_SteamFriends013_GetChatMemberByIndex, // slot 50
  (vfn)vt_SteamFriends013_SendClanChatMessage, // slot 51
  (vfn)vt_SteamFriends013_GetClanChatMessage, // slot 52
  (vfn)vt_SteamFriends013_IsClanChatAdmin, // slot 53
  (vfn)vt_SteamFriends013_IsClanChatWindowOpenInSteam, // slot 54
  (vfn)vt_SteamFriends013_OpenClanChatWindowInSteam, // slot 55
  (vfn)vt_SteamFriends013_CloseClanChatWindowInSteam, // slot 56
  (vfn)vt_SteamFriends013_SetListenForFriendsMessages, // slot 57
  (vfn)vt_SteamFriends013_ReplyToFriendMessage, // slot 58
  (vfn)vt_SteamFriends013_GetFriendMessage, // slot 59
  (vfn)vt_SteamFriends013_GetFollowerCount, // slot 60
  (vfn)vt_SteamFriends013_IsFollowing, // slot 61
  (vfn)vt_SteamFriends013_EnumerateFollowingList, // slot 62
};
struct FakeSteamFriends013 { vfn *vptr; };
static struct FakeSteamFriends013 g_steamfriends013_instance = { g_steamfriends013_vtbl };

// === STEAMAPPS_INTERFACE_VERSION005 (ordinal 9, family SteamApps) ===

// slot 0: BIsSubscribed() -> bool | __thiscall ret 0
static int THISCALL vt_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribed(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(9, 0, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 1: BIsLowViolence() -> bool | __thiscall ret 0
static int THISCALL vt_STEAMAPPS_INTERFACE_VERSION005_BIsLowViolence(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(9, 1, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 2: BIsCybercafe() -> bool | __thiscall ret 0
static int THISCALL vt_STEAMAPPS_INTERFACE_VERSION005_BIsCybercafe(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(9, 2, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 3: BIsVACBanned() -> bool | __thiscall ret 0
static int THISCALL vt_STEAMAPPS_INTERFACE_VERSION005_BIsVACBanned(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(9, 3, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 4: GetCurrentGameLanguage() -> const char* | __thiscall ret 0 (STRING RETURN -- shim-owned buffer, CR-01)
static char vt_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage_buf[STRING_RETURN_BUF_BYTES];
static const char * THISCALL vt_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[STRING_RETURN_BUF_BYTES - 1]; uint32_t retlen = 0;
  if (!bridge_transact(9, 4, argbuf, 0, retbuf, sizeof(retbuf), &retlen)) {
    vt_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage_buf[0] = '\0';
    return vt_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage_buf;
  }
  memcpy(vt_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage_buf, retbuf, retlen);
  vt_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage_buf[retlen] = '\0';
  return vt_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage_buf;
}

// slot 5: GetAvailableGameLanguages() -> const char* | __thiscall ret 0 (STRING RETURN -- shim-owned buffer, CR-01)
static char vt_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages_buf[STRING_RETURN_BUF_BYTES];
static const char * THISCALL vt_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[STRING_RETURN_BUF_BYTES - 1]; uint32_t retlen = 0;
  if (!bridge_transact(9, 5, argbuf, 0, retbuf, sizeof(retbuf), &retlen)) {
    vt_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages_buf[0] = '\0';
    return vt_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages_buf;
  }
  memcpy(vt_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages_buf, retbuf, retlen);
  vt_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages_buf[retlen] = '\0';
  return vt_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages_buf;
}

// slot 6: BIsSubscribedApp(uint32 appID) -> bool | __thiscall ret 4
static int THISCALL vt_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedApp(void *self, uint32_t appID) {
  (void)self;
  uint8_t argbuf[4];
  uint32_t argOff = 0;
  memcpy(argbuf + argOff, &appID, 4); argOff += 4;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(9, 6, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 7: BIsDlcInstalled(uint32 appID) -> bool | __thiscall ret 4
static int THISCALL vt_STEAMAPPS_INTERFACE_VERSION005_BIsDlcInstalled(void *self, uint32_t appID) {
  (void)self;
  uint8_t argbuf[4];
  uint32_t argOff = 0;
  memcpy(argbuf + argOff, &appID, 4); argOff += 4;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(9, 7, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 8: GetEarliestPurchaseUnixTime(uint32 nAppID) -> uint32 | __thiscall ret 4
static uint32_t THISCALL vt_STEAMAPPS_INTERFACE_VERSION005_GetEarliestPurchaseUnixTime(void *self, uint32_t nAppID) {
  (void)self;
  uint8_t argbuf[4];
  uint32_t argOff = 0;
  memcpy(argbuf + argOff, &nAppID, 4); argOff += 4;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(9, 8, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  uint32_t ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 9: BIsSubscribedFromFreeWeekend() -> bool | __thiscall ret 0
static int THISCALL vt_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedFromFreeWeekend(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(9, 9, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 10: GetDLCCount() -> int32 | __thiscall ret 0
static int32_t THISCALL vt_STEAMAPPS_INTERFACE_VERSION005_GetDLCCount(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(9, 10, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int32_t ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 11: BGetDLCDataByIndex(int32 iDLC, uint32* pAppID, bool* pbAvailable, char* pchName, int32 cchNameBufferSize) -> bool | __thiscall ret 20 (STUB)
static int THISCALL vt_STEAMAPPS_INTERFACE_VERSION005_BGetDLCDataByIndex(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4) {
  (void)self;
  return 0;
}

// slot 12: InstallDLC(uint32 nAppID) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_STEAMAPPS_INTERFACE_VERSION005_InstallDLC(void *self, uint32_t dummy0) {
  (void)self;
}

// slot 13: UninstallDLC(uint32 nAppID) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_STEAMAPPS_INTERFACE_VERSION005_UninstallDLC(void *self, uint32_t dummy0) {
  (void)self;
}

// slot 14: RequestAppProofOfPurchaseKey(uint32 nAppID) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_STEAMAPPS_INTERFACE_VERSION005_RequestAppProofOfPurchaseKey(void *self, uint32_t dummy0) {
  (void)self;
}

// slot 15: GetCurrentBetaName(char* pchName, int32 cchNameBufferSize) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_STEAMAPPS_INTERFACE_VERSION005_GetCurrentBetaName(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 16: MarkContentCorrupt(bool bMissingFilesOnly) -> bool | __thiscall ret 4 (STUB)
static int THISCALL vt_STEAMAPPS_INTERFACE_VERSION005_MarkContentCorrupt(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 17: GetInstalledDepots(uint32* pvecDepots, uint32 cMaxDepots) -> uint32 | __thiscall ret 8 (STUB)
static uint32_t THISCALL vt_STEAMAPPS_INTERFACE_VERSION005_GetInstalledDepots(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 18: GetAppInstallDir(uint32 appID, char* pchFolder, uint32 cchFolderBufferSize) -> uint32 | __thiscall ret 12 (STUB)
static uint32_t THISCALL vt_STEAMAPPS_INTERFACE_VERSION005_GetAppInstallDir(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 19: BIsAppInstalled(uint32 appID) -> bool | __thiscall ret 4
static int THISCALL vt_STEAMAPPS_INTERFACE_VERSION005_BIsAppInstalled(void *self, uint32_t appID) {
  (void)self;
  uint8_t argbuf[4];
  uint32_t argOff = 0;
  memcpy(argbuf + argOff, &appID, 4); argOff += 4;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(9, 19, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

static vfn g_steamapps_interface_version005_vtbl[20] = {
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribed, // slot 0
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION005_BIsLowViolence, // slot 1
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION005_BIsCybercafe, // slot 2
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION005_BIsVACBanned, // slot 3
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage, // slot 4
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages, // slot 5
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedApp, // slot 6
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION005_BIsDlcInstalled, // slot 7
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION005_GetEarliestPurchaseUnixTime, // slot 8
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedFromFreeWeekend, // slot 9
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION005_GetDLCCount, // slot 10
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION005_BGetDLCDataByIndex, // slot 11
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION005_InstallDLC, // slot 12
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION005_UninstallDLC, // slot 13
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION005_RequestAppProofOfPurchaseKey, // slot 14
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION005_GetCurrentBetaName, // slot 15
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION005_MarkContentCorrupt, // slot 16
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION005_GetInstalledDepots, // slot 17
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION005_GetAppInstallDir, // slot 18
  (vfn)vt_STEAMAPPS_INTERFACE_VERSION005_BIsAppInstalled, // slot 19
};
struct FakeSTEAMAPPS_INTERFACE_VERSION005 { vfn *vptr; };
static struct FakeSTEAMAPPS_INTERFACE_VERSION005 g_steamapps_interface_version005_instance = { g_steamapps_interface_version005_vtbl };

// === STEAMUSERSTATS_INTERFACE_VERSION011 (ordinal 10, family SteamUserStats) ===

// slot 0: RequestCurrentStats() -> bool | __thiscall ret 0 (HELPER FALLBACK)
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_RequestCurrentStats(void *self) {
  (void)self;
  return 1;
}

// slot 1: GetStat_2(const char* pchName, float* pData) -> bool | __thiscall ret 8
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2(void *self, const char * pchName, float * pData) {
  (void)self;
  uint8_t argbuf[4100];
  uint32_t argOff = 0;
  {
    uint32_t strLen;
    if (pchName == NULL) {
      strLen = 0xFFFFFFFFu;
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
    } else {
      size_t rawLen = strlen(pchName);
      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
      memcpy(argbuf + argOff, pchName, strLen); argOff += strLen;
    }
  }
  uint8_t retbuf[8]; uint32_t retlen = 0;
  if (!bridge_transact(10, 1, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  uint32_t respOff = 4;
  if (pData != NULL && retlen >= respOff + 4) {
    float outVal; memcpy(&outVal, retbuf + respOff, 4);
    *pData = outVal;
  }
  respOff += 4;
  return ret;
}

// slot 2: GetStat(const char* pchName, int32* pData) -> bool | __thiscall ret 8
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat(void *self, const char * pchName, int32_t * pData) {
  (void)self;
  uint8_t argbuf[4100];
  uint32_t argOff = 0;
  {
    uint32_t strLen;
    if (pchName == NULL) {
      strLen = 0xFFFFFFFFu;
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
    } else {
      size_t rawLen = strlen(pchName);
      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
      memcpy(argbuf + argOff, pchName, strLen); argOff += strLen;
    }
  }
  uint8_t retbuf[8]; uint32_t retlen = 0;
  if (!bridge_transact(10, 2, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  uint32_t respOff = 4;
  if (pData != NULL && retlen >= respOff + 4) {
    int32_t outVal; memcpy(&outVal, retbuf + respOff, 4);
    *pData = outVal;
  }
  respOff += 4;
  return ret;
}

// slot 3: SetStat_2(const char* pchName, float fData) -> bool | __thiscall ret 8
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2(void *self, const char * pchName, uint32_t fData) {
  (void)self;
  uint8_t argbuf[4104];
  uint32_t argOff = 0;
  {
    uint32_t strLen;
    if (pchName == NULL) {
      strLen = 0xFFFFFFFFu;
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
    } else {
      size_t rawLen = strlen(pchName);
      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
      memcpy(argbuf + argOff, pchName, strLen); argOff += strLen;
    }
  }
  memcpy(argbuf + argOff, &fData, 4); argOff += 4;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(10, 3, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 4: SetStat(const char* pchName, int32 nData) -> bool | __thiscall ret 8
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat(void *self, const char * pchName, int32_t nData) {
  (void)self;
  uint8_t argbuf[4104];
  uint32_t argOff = 0;
  {
    uint32_t strLen;
    if (pchName == NULL) {
      strLen = 0xFFFFFFFFu;
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
    } else {
      size_t rawLen = strlen(pchName);
      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
      memcpy(argbuf + argOff, pchName, strLen); argOff += strLen;
    }
  }
  memcpy(argbuf + argOff, &nData, 4); argOff += 4;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(10, 4, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 5: UpdateAvgRateStat(const char* pchName, float flCountThisSession, double dSessionLength) -> bool | __thiscall ret 16
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat(void *self, const char * pchName, uint32_t flCountThisSession, double dSessionLength) {
  (void)self;
  uint8_t argbuf[4112];
  uint32_t argOff = 0;
  {
    uint32_t strLen;
    if (pchName == NULL) {
      strLen = 0xFFFFFFFFu;
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
    } else {
      size_t rawLen = strlen(pchName);
      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
      memcpy(argbuf + argOff, pchName, strLen); argOff += strLen;
    }
  }
  memcpy(argbuf + argOff, &flCountThisSession, 4); argOff += 4;
  memcpy(argbuf + argOff, &dSessionLength, 8); argOff += 8;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(10, 5, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 6: GetAchievement(const char* pchName, bool* pbAchieved) -> bool | __thiscall ret 8
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement(void *self, const char * pchName, int * pbAchieved) {
  (void)self;
  uint8_t argbuf[4100];
  uint32_t argOff = 0;
  {
    uint32_t strLen;
    if (pchName == NULL) {
      strLen = 0xFFFFFFFFu;
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
    } else {
      size_t rawLen = strlen(pchName);
      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
      memcpy(argbuf + argOff, pchName, strLen); argOff += strLen;
    }
  }
  uint8_t retbuf[8]; uint32_t retlen = 0;
  if (!bridge_transact(10, 6, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  uint32_t respOff = 4;
  if (pbAchieved != NULL && retlen >= respOff + 4) {
    int outVal; memcpy(&outVal, retbuf + respOff, 4);
    *pbAchieved = outVal;
  }
  respOff += 4;
  return ret;
}

// slot 7: SetAchievement(const char* pchName) -> bool | __thiscall ret 4
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement(void *self, const char * pchName) {
  (void)self;
  uint8_t argbuf[4100];
  uint32_t argOff = 0;
  {
    uint32_t strLen;
    if (pchName == NULL) {
      strLen = 0xFFFFFFFFu;
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
    } else {
      size_t rawLen = strlen(pchName);
      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
      memcpy(argbuf + argOff, pchName, strLen); argOff += strLen;
    }
  }
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(10, 7, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 8: ClearAchievement(const char* pchName) -> bool | __thiscall ret 4
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement(void *self, const char * pchName) {
  (void)self;
  uint8_t argbuf[4100];
  uint32_t argOff = 0;
  {
    uint32_t strLen;
    if (pchName == NULL) {
      strLen = 0xFFFFFFFFu;
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
    } else {
      size_t rawLen = strlen(pchName);
      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
      memcpy(argbuf + argOff, pchName, strLen); argOff += strLen;
    }
  }
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(10, 8, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 9: GetAchievementAndUnlockTime(const char* pchName, bool* pbAchieved, uint32* punUnlockTime) -> bool | __thiscall ret 12
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime(void *self, const char * pchName, int * pbAchieved, uint32_t * punUnlockTime) {
  (void)self;
  uint8_t argbuf[4100];
  uint32_t argOff = 0;
  {
    uint32_t strLen;
    if (pchName == NULL) {
      strLen = 0xFFFFFFFFu;
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
    } else {
      size_t rawLen = strlen(pchName);
      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
      memcpy(argbuf + argOff, pchName, strLen); argOff += strLen;
    }
  }
  uint8_t retbuf[12]; uint32_t retlen = 0;
  if (!bridge_transact(10, 9, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  uint32_t respOff = 4;
  if (pbAchieved != NULL && retlen >= respOff + 4) {
    int outVal; memcpy(&outVal, retbuf + respOff, 4);
    *pbAchieved = outVal;
  }
  respOff += 4;
  if (punUnlockTime != NULL && retlen >= respOff + 4) {
    uint32_t outVal; memcpy(&outVal, retbuf + respOff, 4);
    *punUnlockTime = outVal;
  }
  respOff += 4;
  return ret;
}

// slot 10: StoreStats() -> bool | __thiscall ret 0
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_StoreStats(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(10, 10, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 11: GetAchievementIcon(const char* pchName) -> int32 | __thiscall ret 4 (STUB)
static int32_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementIcon(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 12: GetAchievementDisplayAttribute(const char* pchName, const char* pchKey) -> const char* | __thiscall ret 8 (STRING RETURN -- shim-owned buffer, CR-01)
static char vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_buf[STRING_RETURN_BUF_BYTES];
static const char * THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute(void *self, const char * pchName, const char * pchKey) {
  (void)self;
  uint8_t argbuf[8200];
  uint32_t argOff = 0;
  {
    uint32_t strLen;
    if (pchName == NULL) {
      strLen = 0xFFFFFFFFu;
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
    } else {
      size_t rawLen = strlen(pchName);
      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
      memcpy(argbuf + argOff, pchName, strLen); argOff += strLen;
    }
  }
  {
    uint32_t strLen;
    if (pchKey == NULL) {
      strLen = 0xFFFFFFFFu;
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
    } else {
      size_t rawLen = strlen(pchKey);
      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
      memcpy(argbuf + argOff, pchKey, strLen); argOff += strLen;
    }
  }
  uint8_t retbuf[STRING_RETURN_BUF_BYTES - 1]; uint32_t retlen = 0;
  if (!bridge_transact(10, 12, argbuf, argOff, retbuf, sizeof(retbuf), &retlen)) {
    vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_buf[0] = '\0';
    return vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_buf;
  }
  memcpy(vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_buf, retbuf, retlen);
  vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_buf[retlen] = '\0';
  return vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_buf;
}

// slot 13: IndicateAchievementProgress(const char* pchName, uint32 nCurProgress, uint32 nMaxProgress) -> bool | __thiscall ret 12
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress(void *self, const char * pchName, uint32_t nCurProgress, uint32_t nMaxProgress) {
  (void)self;
  uint8_t argbuf[4108];
  uint32_t argOff = 0;
  {
    uint32_t strLen;
    if (pchName == NULL) {
      strLen = 0xFFFFFFFFu;
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
    } else {
      size_t rawLen = strlen(pchName);
      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);
      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;
      memcpy(argbuf + argOff, pchName, strLen); argOff += strLen;
    }
  }
  memcpy(argbuf + argOff, &nCurProgress, 4); argOff += 4;
  memcpy(argbuf + argOff, &nMaxProgress, 4); argOff += 4;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(10, 13, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 14: GetNumAchievements() -> uint32 | __thiscall ret 0
static uint32_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetNumAchievements(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(10, 14, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  uint32_t ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 15: GetAchievementName(uint32 iAchievement) -> const char* | __thiscall ret 4 (STRING RETURN -- shim-owned buffer, CR-01)
static char vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName_buf[STRING_RETURN_BUF_BYTES];
static const char * THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName(void *self, uint32_t iAchievement) {
  (void)self;
  uint8_t argbuf[4];
  uint32_t argOff = 0;
  memcpy(argbuf + argOff, &iAchievement, 4); argOff += 4;
  uint8_t retbuf[STRING_RETURN_BUF_BYTES - 1]; uint32_t retlen = 0;
  if (!bridge_transact(10, 15, argbuf, argOff, retbuf, sizeof(retbuf), &retlen)) {
    vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName_buf[0] = '\0';
    return vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName_buf;
  }
  memcpy(vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName_buf, retbuf, retlen);
  vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName_buf[retlen] = '\0';
  return vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName_buf;
}

// slot 16: RequestUserStats(CSteamID steamIDUser) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_RequestUserStats(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 17: GetUserStat_2(CSteamID steamIDUser, const char* pchName, float* pData) -> bool | __thiscall ret 16 (STUB)
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetUserStat_2(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 18: GetUserStat(CSteamID steamIDUser, const char* pchName, int32* pData) -> bool | __thiscall ret 16 (STUB)
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetUserStat(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 19: GetUserAchievement(CSteamID steamIDUser, const char* pchName, bool* pbAchieved) -> bool | __thiscall ret 16 (STUB)
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetUserAchievement(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 20: GetUserAchievementAndUnlockTime(CSteamID steamIDUser, const char* pchName, bool* pbAchieved, uint32* punUnlockTime) -> bool | __thiscall ret 20 (STUB)
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetUserAchievementAndUnlockTime(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4) {
  (void)self;
  return 0;
}

// slot 21: ResetAllStats(bool bAchievementsToo) -> bool | __thiscall ret 4
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_ResetAllStats(void *self, int bAchievementsToo) {
  (void)self;
  uint8_t argbuf[4];
  uint32_t argOff = 0;
  memcpy(argbuf + argOff, &bAchievementsToo, 4); argOff += 4;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(10, 21, argbuf, argOff, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 22: FindOrCreateLeaderboard(const char* pchLeaderboardName, uint32 eLeaderboardSortMethod, uint32 eLeaderboardDisplayType) -> uint64 | __thiscall ret 12 (STUB)
static uint64_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_FindOrCreateLeaderboard(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0LL;
}

// slot 23: FindLeaderboard(const char* pchLeaderboardName) -> uint64 | __thiscall ret 4 (STUB)
static uint64_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_FindLeaderboard(void *self, uint32_t dummy0) {
  (void)self;
  return 0LL;
}

// slot 24: GetLeaderboardName(uint64 hSteamLeaderboard) -> const char* | __thiscall ret 8 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetLeaderboardName(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return "";
}

// slot 25: GetLeaderboardEntryCount(uint64 hSteamLeaderboard) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetLeaderboardEntryCount(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 26: GetLeaderboardSortMethod(uint64 hSteamLeaderboard) -> uint32 | __thiscall ret 8 (STUB)
static uint32_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetLeaderboardSortMethod(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 27: GetLeaderboardDisplayType(uint64 hSteamLeaderboard) -> uint32 | __thiscall ret 8 (STUB)
static uint32_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetLeaderboardDisplayType(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 28: DownloadLeaderboardEntries(uint64 hSteamLeaderboard, uint32 eLeaderboardDataRequest, int32 nRangeStart, int32 nRangeEnd) -> uint64 | __thiscall ret 20 (STUB)
static uint64_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_DownloadLeaderboardEntries(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4) {
  (void)self;
  return 0LL;
}

// slot 29: DownloadLeaderboardEntriesForUsers(uint64 hSteamLeaderboard, CSteamID* prgUsers, int32 cUsers) -> uint64 | __thiscall ret 16 (STUB)
static uint64_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_DownloadLeaderboardEntriesForUsers(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0LL;
}

// slot 30: GetDownloadedLeaderboardEntry(uint64 hSteamLeaderboardEntries, int32 index, w_LeaderboardEntry_t_123* pLeaderboardEntry, int32* pDetails, int32 cDetailsMax) -> bool | __thiscall ret 24 (STUB)
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetDownloadedLeaderboardEntry(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5) {
  (void)self;
  return 0;
}

// slot 31: UploadLeaderboardScore(uint64 hSteamLeaderboard, uint32 eLeaderboardUploadScoreMethod, int32 nScore, const int32_t* pScoreDetails, int32 cScoreDetailsCount) -> uint64 | __thiscall ret 24 (STUB)
static uint64_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_UploadLeaderboardScore(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5) {
  (void)self;
  return 0LL;
}

// slot 32: AttachLeaderboardUGC(uint64 hSteamLeaderboard, uint64 hUGC) -> uint64 | __thiscall ret 16 (STUB)
static uint64_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_AttachLeaderboardUGC(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0LL;
}

// slot 33: GetNumberOfCurrentPlayers() -> uint64 | __thiscall ret 0 (STUB)
static uint64_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetNumberOfCurrentPlayers(void *self) {
  (void)self;
  return 0LL;
}

// slot 34: RequestGlobalAchievementPercentages() -> uint64 | __thiscall ret 0 (STUB)
static uint64_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_RequestGlobalAchievementPercentages(void *self) {
  (void)self;
  return 0LL;
}

// slot 35: GetMostAchievedAchievementInfo(char* pchName, uint32 unNameBufLen, float* pflPercent, bool* pbAchieved) -> int32 | __thiscall ret 16 (STUB)
static int32_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetMostAchievedAchievementInfo(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 36: GetNextMostAchievedAchievementInfo(int32 iIteratorPrevious, char* pchName, uint32 unNameBufLen, float* pflPercent, bool* pbAchieved) -> int32 | __thiscall ret 20 (STUB)
static int32_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetNextMostAchievedAchievementInfo(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4) {
  (void)self;
  return 0;
}

// slot 37: GetAchievementAchievedPercent(const char* pchName, float* pflPercent) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAchievedPercent(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 38: RequestGlobalStats(int32 nHistoryDays) -> uint64 | __thiscall ret 4 (STUB)
static uint64_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_RequestGlobalStats(void *self, uint32_t dummy0) {
  (void)self;
  return 0LL;
}

// slot 39: GetGlobalStat_2(const char* pchStatName, double* pData) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetGlobalStat_2(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 40: GetGlobalStat(const char* pchStatName, int64_t* pData) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetGlobalStat(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 41: GetGlobalStatHistory_2(const char* pchStatName, double* pData, uint32 cubData) -> int32 | __thiscall ret 12 (STUB)
static int32_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetGlobalStatHistory_2(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 42: GetGlobalStatHistory(const char* pchStatName, int64_t* pData, uint32 cubData) -> int32 | __thiscall ret 12 (STUB)
static int32_t THISCALL vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetGlobalStatHistory(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

static vfn g_steamuserstats_interface_version011_vtbl[43] = {
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_RequestCurrentStats, // slot 0
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2, // slot 1
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat, // slot 2
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2, // slot 3
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat, // slot 4
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat, // slot 5
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement, // slot 6
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement, // slot 7
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement, // slot 8
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime, // slot 9
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_StoreStats, // slot 10
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementIcon, // slot 11
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute, // slot 12
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress, // slot 13
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetNumAchievements, // slot 14
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName, // slot 15
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_RequestUserStats, // slot 16
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetUserStat_2, // slot 17
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetUserStat, // slot 18
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetUserAchievement, // slot 19
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetUserAchievementAndUnlockTime, // slot 20
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_ResetAllStats, // slot 21
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_FindOrCreateLeaderboard, // slot 22
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_FindLeaderboard, // slot 23
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetLeaderboardName, // slot 24
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetLeaderboardEntryCount, // slot 25
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetLeaderboardSortMethod, // slot 26
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetLeaderboardDisplayType, // slot 27
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_DownloadLeaderboardEntries, // slot 28
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_DownloadLeaderboardEntriesForUsers, // slot 29
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetDownloadedLeaderboardEntry, // slot 30
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_UploadLeaderboardScore, // slot 31
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_AttachLeaderboardUGC, // slot 32
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetNumberOfCurrentPlayers, // slot 33
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_RequestGlobalAchievementPercentages, // slot 34
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetMostAchievedAchievementInfo, // slot 35
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetNextMostAchievedAchievementInfo, // slot 36
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAchievedPercent, // slot 37
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_RequestGlobalStats, // slot 38
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetGlobalStat_2, // slot 39
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetGlobalStat, // slot 40
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetGlobalStatHistory_2, // slot 41
  (vfn)vt_STEAMUSERSTATS_INTERFACE_VERSION011_GetGlobalStatHistory, // slot 42
};
struct FakeSTEAMUSERSTATS_INTERFACE_VERSION011 { vfn *vptr; };
static struct FakeSTEAMUSERSTATS_INTERFACE_VERSION011 g_steamuserstats_interface_version011_instance = { g_steamuserstats_interface_version011_vtbl };

// === STEAMREMOTESTORAGE_INTERFACE_VERSION005 (ordinal 11, family SteamRemoteStorage) ===

// slot 0: FileWrite(const char* pchFile, const void* pvData, int32 cubData) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_FileWrite(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 1: FileRead(const char* pchFile, void* pvData, int32 cubDataToRead) -> int32 | __thiscall ret 12 (STUB)
static int32_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_FileRead(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 2: FileForget(const char* pchFile) -> bool | __thiscall ret 4 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_FileForget(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 3: FileDelete(const char* pchFile) -> bool | __thiscall ret 4 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_FileDelete(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 4: FileShare(const char* pchFile) -> uint64 | __thiscall ret 4 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_FileShare(void *self, uint32_t dummy0) {
  (void)self;
  return 0LL;
}

// slot 5: SetSyncPlatforms(const char* pchFile, uint32 eRemoteStoragePlatform) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_SetSyncPlatforms(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 6: FileExists(const char* pchFile) -> bool | __thiscall ret 4 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_FileExists(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 7: FilePersisted(const char* pchFile) -> bool | __thiscall ret 4 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_FilePersisted(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 8: GetFileSize(const char* pchFile) -> int32 | __thiscall ret 4 (STUB)
static int32_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_GetFileSize(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 9: GetFileTimestamp(const char* pchFile) -> int64 | __thiscall ret 4 (STUB)
static int64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_GetFileTimestamp(void *self, uint32_t dummy0) {
  (void)self;
  return 0LL;
}

// slot 10: GetSyncPlatforms(const char* pchFile) -> uint32 | __thiscall ret 4 (STUB)
static uint32_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_GetSyncPlatforms(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 11: GetFileCount() -> int32 | __thiscall ret 0 (STUB)
static int32_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_GetFileCount(void *self) {
  (void)self;
  return 0;
}

// slot 12: GetFileNameAndSize(int32 iFile, int32* pnFileSizeInBytes) -> const char* | __thiscall ret 8 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_GetFileNameAndSize(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return "";
}

// slot 13: GetQuota(int32* pnTotalBytes, int32* puAvailableBytes) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_GetQuota(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 14: IsCloudEnabledForAccount() -> bool | __thiscall ret 0 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_IsCloudEnabledForAccount(void *self) {
  (void)self;
  return 0;
}

// slot 15: IsCloudEnabledForApp() -> bool | __thiscall ret 0 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_IsCloudEnabledForApp(void *self) {
  (void)self;
  return 0;
}

// slot 16: SetCloudEnabledForApp(bool bEnabled) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_SetCloudEnabledForApp(void *self, uint32_t dummy0) {
  (void)self;
}

// slot 17: UGCDownload(uint64 hContent) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_UGCDownload(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 18: GetUGCDetails(uint64 hContent, uint32* pnAppID, char** ppchName, int32* pnFileSizeInBytes, CSteamID* pSteamIDOwner) -> bool | __thiscall ret 24 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_GetUGCDetails(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5) {
  (void)self;
  return 0;
}

// slot 19: UGCRead(uint64 hContent, void* pvData, int32 cubDataToRead) -> int32 | __thiscall ret 16 (STUB)
static int32_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_UGCRead(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 20: GetCachedUGCCount() -> int32 | __thiscall ret 0 (STUB)
static int32_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_GetCachedUGCCount(void *self) {
  (void)self;
  return 0;
}

// slot 21: GetCachedUGCHandle(int32 iCachedContent) -> uint64 | __thiscall ret 4 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_GetCachedUGCHandle(void *self, uint32_t dummy0) {
  (void)self;
  return 0LL;
}

// slot 22: PublishFile(const char* pchFile, const char* pchPreviewFile, uint32 nConsumerAppId, const char* pchTitle, const char* pchDescription, uint32 eVisibility, w_SteamParamStringArray_t* pTags) -> uint64 | __thiscall ret 28 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_PublishFile(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5, uint32_t dummy6) {
  (void)self;
  return 0LL;
}

// slot 23: PublishWorkshopFile(const char* pchFile, const char* pchPreviewFile, uint32 nConsumerAppId, const char* pchTitle, const char* pchDescription, w_SteamParamStringArray_t* pTags) -> uint64 | __thiscall ret 24 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_PublishWorkshopFile(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5) {
  (void)self;
  return 0LL;
}

// slot 24: UpdatePublishedFile(w_RemoteStorageUpdatePublishedFileRequest_t updatePublishedFileRequest) -> uint64 | __thiscall ret 4 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_UpdatePublishedFile(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5, uint32_t dummy6, uint32_t dummy7, uint32_t dummy8, uint32_t dummy9) {
  (void)self;
  return 0LL;
}

// slot 25: GetPublishedFileDetails(uint64 unPublishedFileId) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_GetPublishedFileDetails(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 26: DeletePublishedFile(uint64 unPublishedFileId) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_DeletePublishedFile(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 27: EnumerateUserPublishedFiles(uint32 unStartIndex) -> uint64 | __thiscall ret 4 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_EnumerateUserPublishedFiles(void *self, uint32_t dummy0) {
  (void)self;
  return 0LL;
}

// slot 28: SubscribePublishedFile(uint64 unPublishedFileId) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_SubscribePublishedFile(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 29: EnumerateUserSubscribedFiles(uint32 unStartIndex) -> uint64 | __thiscall ret 4 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_EnumerateUserSubscribedFiles(void *self, uint32_t dummy0) {
  (void)self;
  return 0LL;
}

// slot 30: UnsubscribePublishedFile(uint64 unPublishedFileId) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_UnsubscribePublishedFile(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

static vfn g_steamremotestorage_interface_version005_vtbl[31] = {
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_FileWrite, // slot 0
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_FileRead, // slot 1
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_FileForget, // slot 2
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_FileDelete, // slot 3
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_FileShare, // slot 4
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_SetSyncPlatforms, // slot 5
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_FileExists, // slot 6
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_FilePersisted, // slot 7
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_GetFileSize, // slot 8
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_GetFileTimestamp, // slot 9
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_GetSyncPlatforms, // slot 10
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_GetFileCount, // slot 11
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_GetFileNameAndSize, // slot 12
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_GetQuota, // slot 13
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_IsCloudEnabledForAccount, // slot 14
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_IsCloudEnabledForApp, // slot 15
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_SetCloudEnabledForApp, // slot 16
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_UGCDownload, // slot 17
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_GetUGCDetails, // slot 18
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_UGCRead, // slot 19
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_GetCachedUGCCount, // slot 20
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_GetCachedUGCHandle, // slot 21
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_PublishFile, // slot 22
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_PublishWorkshopFile, // slot 23
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_UpdatePublishedFile, // slot 24
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_GetPublishedFileDetails, // slot 25
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_DeletePublishedFile, // slot 26
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_EnumerateUserPublishedFiles, // slot 27
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_SubscribePublishedFile, // slot 28
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_EnumerateUserSubscribedFiles, // slot 29
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION005_UnsubscribePublishedFile, // slot 30
};
struct FakeSTEAMREMOTESTORAGE_INTERFACE_VERSION005 { vfn *vptr; };
static struct FakeSTEAMREMOTESTORAGE_INTERFACE_VERSION005 g_steamremotestorage_interface_version005_instance = { g_steamremotestorage_interface_version005_vtbl };

// === SteamMatchMaking009 (ordinal 12, family SteamMatchmaking) ===

// slot 0: GetFavoriteGameCount() -> int32 | __thiscall ret 0 (STUB)
static int32_t THISCALL vt_SteamMatchMaking009_GetFavoriteGameCount(void *self) {
  (void)self;
  return 0;
}

// slot 1: GetFavoriteGame(int32 iGame, uint32* pnAppID, uint32* pnIP, uint16_t* pnConnPort, uint16_t* pnQueryPort, uint32* punFlags, uint32* pRTime32LastPlayedOnServer) -> bool | __thiscall ret 28 (STUB)
static int THISCALL vt_SteamMatchMaking009_GetFavoriteGame(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5, uint32_t dummy6) {
  (void)self;
  return 0;
}

// slot 2: AddFavoriteGame(uint32 nAppID, uint32 nIP, uint32 nConnPort, uint32 nQueryPort, uint32 unFlags, uint32 rTime32LastPlayedOnServer) -> int32 | __thiscall ret 24 (STUB)
static int32_t THISCALL vt_SteamMatchMaking009_AddFavoriteGame(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5) {
  (void)self;
  return 0;
}

// slot 3: RemoveFavoriteGame(uint32 nAppID, uint32 nIP, uint32 nConnPort, uint32 nQueryPort, uint32 unFlags) -> bool | __thiscall ret 20 (STUB)
static int THISCALL vt_SteamMatchMaking009_RemoveFavoriteGame(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4) {
  (void)self;
  return 0;
}

// slot 4: RequestLobbyList() -> uint64 | __thiscall ret 0 (STUB)
static uint64_t THISCALL vt_SteamMatchMaking009_RequestLobbyList(void *self) {
  (void)self;
  return 0LL;
}

// slot 5: AddRequestLobbyListStringFilter(const char* pchKeyToMatch, const char* pchValueToMatch, uint32 eComparisonType) -> void | __thiscall ret 12 (STUB)
static void THISCALL vt_SteamMatchMaking009_AddRequestLobbyListStringFilter(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
}

// slot 6: AddRequestLobbyListNumericalFilter(const char* pchKeyToMatch, int32 nValueToMatch, uint32 eComparisonType) -> void | __thiscall ret 12 (STUB)
static void THISCALL vt_SteamMatchMaking009_AddRequestLobbyListNumericalFilter(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
}

// slot 7: AddRequestLobbyListNearValueFilter(const char* pchKeyToMatch, int32 nValueToBeCloseTo) -> void | __thiscall ret 8 (STUB)
static void THISCALL vt_SteamMatchMaking009_AddRequestLobbyListNearValueFilter(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
}

// slot 8: AddRequestLobbyListFilterSlotsAvailable(int32 nSlotsAvailable) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_SteamMatchMaking009_AddRequestLobbyListFilterSlotsAvailable(void *self, uint32_t dummy0) {
  (void)self;
}

// slot 9: AddRequestLobbyListDistanceFilter(uint32 eLobbyDistanceFilter) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_SteamMatchMaking009_AddRequestLobbyListDistanceFilter(void *self, uint32_t dummy0) {
  (void)self;
}

// slot 10: AddRequestLobbyListResultCountFilter(int32 cMaxResults) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_SteamMatchMaking009_AddRequestLobbyListResultCountFilter(void *self, uint32_t dummy0) {
  (void)self;
}

// slot 11: AddRequestLobbyListCompatibleMembersFilter(CSteamID steamIDLobby) -> void | __thiscall ret 8 (STUB)
static void THISCALL vt_SteamMatchMaking009_AddRequestLobbyListCompatibleMembersFilter(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
}

// slot 12: GetLobbyByIndex(int32 iLobby) -> CSteamID | __thiscall ret 8 (SRET -- hidden return pointer) (STUB)
static void * THISCALL vt_SteamMatchMaking009_GetLobbyByIndex(void *self, void *sretOut, uint32_t dummy0) {
  (void)self;
  memset(sretOut, 0, 8);
  return sretOut;
}

// slot 13: CreateLobby(uint32 eLobbyType, int32 cMaxMembers) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_SteamMatchMaking009_CreateLobby(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 14: JoinLobby(CSteamID steamIDLobby) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_SteamMatchMaking009_JoinLobby(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 15: LeaveLobby(CSteamID steamIDLobby) -> void | __thiscall ret 8 (STUB)
static void THISCALL vt_SteamMatchMaking009_LeaveLobby(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
}

// slot 16: InviteUserToLobby(CSteamID steamIDLobby, CSteamID steamIDInvitee) -> bool | __thiscall ret 16 (STUB)
static int THISCALL vt_SteamMatchMaking009_InviteUserToLobby(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 17: GetNumLobbyMembers(CSteamID steamIDLobby) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamMatchMaking009_GetNumLobbyMembers(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 18: GetLobbyMemberByIndex(CSteamID steamIDLobby, int32 iMember) -> CSteamID | __thiscall ret 16 (SRET -- hidden return pointer) (STUB)
static void * THISCALL vt_SteamMatchMaking009_GetLobbyMemberByIndex(void *self, void *sretOut, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  memset(sretOut, 0, 8);
  return sretOut;
}

// slot 19: GetLobbyData(CSteamID steamIDLobby, const char* pchKey) -> const char* | __thiscall ret 12 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_SteamMatchMaking009_GetLobbyData(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return "";
}

// slot 20: SetLobbyData(CSteamID steamIDLobby, const char* pchKey, const char* pchValue) -> bool | __thiscall ret 16 (STUB)
static int THISCALL vt_SteamMatchMaking009_SetLobbyData(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 21: GetLobbyDataCount(CSteamID steamIDLobby) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamMatchMaking009_GetLobbyDataCount(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 22: GetLobbyDataByIndex(CSteamID steamIDLobby, int32 iLobbyData, char* pchKey, int32 cchKeyBufferSize, char* pchValue, int32 cchValueBufferSize) -> bool | __thiscall ret 28 (STUB)
static int THISCALL vt_SteamMatchMaking009_GetLobbyDataByIndex(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5, uint32_t dummy6) {
  (void)self;
  return 0;
}

// slot 23: DeleteLobbyData(CSteamID steamIDLobby, const char* pchKey) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamMatchMaking009_DeleteLobbyData(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 24: GetLobbyMemberData(CSteamID steamIDLobby, CSteamID steamIDUser, const char* pchKey) -> const char* | __thiscall ret 20 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_SteamMatchMaking009_GetLobbyMemberData(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4) {
  (void)self;
  return "";
}

// slot 25: SetLobbyMemberData(CSteamID steamIDLobby, const char* pchKey, const char* pchValue) -> void | __thiscall ret 16 (STUB)
static void THISCALL vt_SteamMatchMaking009_SetLobbyMemberData(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
}

// slot 26: SendLobbyChatMsg(CSteamID steamIDLobby, const void* pvMsgBody, int32 cubMsgBody) -> bool | __thiscall ret 16 (STUB)
static int THISCALL vt_SteamMatchMaking009_SendLobbyChatMsg(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 27: GetLobbyChatEntry(CSteamID steamIDLobby, int32 iChatID, CSteamID* pSteamIDUser, void* pvData, int32 cubData, uint32* peChatEntryType) -> int32 | __thiscall ret 28 (STUB)
static int32_t THISCALL vt_SteamMatchMaking009_GetLobbyChatEntry(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5, uint32_t dummy6) {
  (void)self;
  return 0;
}

// slot 28: RequestLobbyData(CSteamID steamIDLobby) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamMatchMaking009_RequestLobbyData(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 29: SetLobbyGameServer(CSteamID steamIDLobby, uint32 unGameServerIP, uint32 unGameServerPort, CSteamID steamIDGameServer) -> void | __thiscall ret 24 (STUB)
static void THISCALL vt_SteamMatchMaking009_SetLobbyGameServer(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5) {
  (void)self;
}

// slot 30: GetLobbyGameServer(CSteamID steamIDLobby, uint32* punGameServerIP, uint16_t* punGameServerPort, CSteamID* psteamIDGameServer) -> bool | __thiscall ret 20 (STUB)
static int THISCALL vt_SteamMatchMaking009_GetLobbyGameServer(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4) {
  (void)self;
  return 0;
}

// slot 31: SetLobbyMemberLimit(CSteamID steamIDLobby, int32 cMaxMembers) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamMatchMaking009_SetLobbyMemberLimit(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 32: GetLobbyMemberLimit(CSteamID steamIDLobby) -> int32 | __thiscall ret 8 (STUB)
static int32_t THISCALL vt_SteamMatchMaking009_GetLobbyMemberLimit(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 33: SetLobbyType(CSteamID steamIDLobby, uint32 eLobbyType) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamMatchMaking009_SetLobbyType(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 34: SetLobbyJoinable(CSteamID steamIDLobby, bool bLobbyJoinable) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamMatchMaking009_SetLobbyJoinable(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 35: GetLobbyOwner(CSteamID steamIDLobby) -> CSteamID | __thiscall ret 12 (SRET -- hidden return pointer) (STUB)
static void * THISCALL vt_SteamMatchMaking009_GetLobbyOwner(void *self, void *sretOut, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  memset(sretOut, 0, 8);
  return sretOut;
}

// slot 36: SetLobbyOwner(CSteamID steamIDLobby, CSteamID steamIDNewOwner) -> bool | __thiscall ret 16 (STUB)
static int THISCALL vt_SteamMatchMaking009_SetLobbyOwner(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 37: SetLinkedLobby(CSteamID steamIDLobby, CSteamID steamIDLobbyDependent) -> bool | __thiscall ret 16 (STUB)
static int THISCALL vt_SteamMatchMaking009_SetLinkedLobby(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

static vfn g_steammatchmaking009_vtbl[38] = {
  (vfn)vt_SteamMatchMaking009_GetFavoriteGameCount, // slot 0
  (vfn)vt_SteamMatchMaking009_GetFavoriteGame, // slot 1
  (vfn)vt_SteamMatchMaking009_AddFavoriteGame, // slot 2
  (vfn)vt_SteamMatchMaking009_RemoveFavoriteGame, // slot 3
  (vfn)vt_SteamMatchMaking009_RequestLobbyList, // slot 4
  (vfn)vt_SteamMatchMaking009_AddRequestLobbyListStringFilter, // slot 5
  (vfn)vt_SteamMatchMaking009_AddRequestLobbyListNumericalFilter, // slot 6
  (vfn)vt_SteamMatchMaking009_AddRequestLobbyListNearValueFilter, // slot 7
  (vfn)vt_SteamMatchMaking009_AddRequestLobbyListFilterSlotsAvailable, // slot 8
  (vfn)vt_SteamMatchMaking009_AddRequestLobbyListDistanceFilter, // slot 9
  (vfn)vt_SteamMatchMaking009_AddRequestLobbyListResultCountFilter, // slot 10
  (vfn)vt_SteamMatchMaking009_AddRequestLobbyListCompatibleMembersFilter, // slot 11
  (vfn)vt_SteamMatchMaking009_GetLobbyByIndex, // slot 12
  (vfn)vt_SteamMatchMaking009_CreateLobby, // slot 13
  (vfn)vt_SteamMatchMaking009_JoinLobby, // slot 14
  (vfn)vt_SteamMatchMaking009_LeaveLobby, // slot 15
  (vfn)vt_SteamMatchMaking009_InviteUserToLobby, // slot 16
  (vfn)vt_SteamMatchMaking009_GetNumLobbyMembers, // slot 17
  (vfn)vt_SteamMatchMaking009_GetLobbyMemberByIndex, // slot 18
  (vfn)vt_SteamMatchMaking009_GetLobbyData, // slot 19
  (vfn)vt_SteamMatchMaking009_SetLobbyData, // slot 20
  (vfn)vt_SteamMatchMaking009_GetLobbyDataCount, // slot 21
  (vfn)vt_SteamMatchMaking009_GetLobbyDataByIndex, // slot 22
  (vfn)vt_SteamMatchMaking009_DeleteLobbyData, // slot 23
  (vfn)vt_SteamMatchMaking009_GetLobbyMemberData, // slot 24
  (vfn)vt_SteamMatchMaking009_SetLobbyMemberData, // slot 25
  (vfn)vt_SteamMatchMaking009_SendLobbyChatMsg, // slot 26
  (vfn)vt_SteamMatchMaking009_GetLobbyChatEntry, // slot 27
  (vfn)vt_SteamMatchMaking009_RequestLobbyData, // slot 28
  (vfn)vt_SteamMatchMaking009_SetLobbyGameServer, // slot 29
  (vfn)vt_SteamMatchMaking009_GetLobbyGameServer, // slot 30
  (vfn)vt_SteamMatchMaking009_SetLobbyMemberLimit, // slot 31
  (vfn)vt_SteamMatchMaking009_GetLobbyMemberLimit, // slot 32
  (vfn)vt_SteamMatchMaking009_SetLobbyType, // slot 33
  (vfn)vt_SteamMatchMaking009_SetLobbyJoinable, // slot 34
  (vfn)vt_SteamMatchMaking009_GetLobbyOwner, // slot 35
  (vfn)vt_SteamMatchMaking009_SetLobbyOwner, // slot 36
  (vfn)vt_SteamMatchMaking009_SetLinkedLobby, // slot 37
};
struct FakeSteamMatchMaking009 { vfn *vptr; };
static struct FakeSteamMatchMaking009 g_steammatchmaking009_instance = { g_steammatchmaking009_vtbl };

// === SteamMatchMakingServers002 (ordinal 13, family SteamMatchmakingServers) ===

// slot 0: RequestInternetServerList(uint32 iApp, MatchMakingKeyValuePair_t** ppchFilters, uint32 nFilters, w_ISteamMatchmakingServerListResponse_106* pRequestServersResponse) -> void* | __thiscall ret 16 (STUB)
static void * THISCALL vt_SteamMatchMakingServers002_RequestInternetServerList(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return NULL;
}

// slot 1: RequestLANServerList(uint32 iApp, w_ISteamMatchmakingServerListResponse_106* pRequestServersResponse) -> void* | __thiscall ret 8 (STUB)
static void * THISCALL vt_SteamMatchMakingServers002_RequestLANServerList(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return NULL;
}

// slot 2: RequestFriendsServerList(uint32 iApp, MatchMakingKeyValuePair_t** ppchFilters, uint32 nFilters, w_ISteamMatchmakingServerListResponse_106* pRequestServersResponse) -> void* | __thiscall ret 16 (STUB)
static void * THISCALL vt_SteamMatchMakingServers002_RequestFriendsServerList(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return NULL;
}

// slot 3: RequestFavoritesServerList(uint32 iApp, MatchMakingKeyValuePair_t** ppchFilters, uint32 nFilters, w_ISteamMatchmakingServerListResponse_106* pRequestServersResponse) -> void* | __thiscall ret 16 (STUB)
static void * THISCALL vt_SteamMatchMakingServers002_RequestFavoritesServerList(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return NULL;
}

// slot 4: RequestHistoryServerList(uint32 iApp, MatchMakingKeyValuePair_t** ppchFilters, uint32 nFilters, w_ISteamMatchmakingServerListResponse_106* pRequestServersResponse) -> void* | __thiscall ret 16 (STUB)
static void * THISCALL vt_SteamMatchMakingServers002_RequestHistoryServerList(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return NULL;
}

// slot 5: RequestSpectatorServerList(uint32 iApp, MatchMakingKeyValuePair_t** ppchFilters, uint32 nFilters, w_ISteamMatchmakingServerListResponse_106* pRequestServersResponse) -> void* | __thiscall ret 16 (STUB)
static void * THISCALL vt_SteamMatchMakingServers002_RequestSpectatorServerList(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return NULL;
}

// slot 6: ReleaseRequest(uint32 _unknownArg0) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_SteamMatchMakingServers002_ReleaseRequest(void *self, uint32_t dummy0) {
  (void)self;
}

// slot 7: GetServerDetails(void* hRequest, int32 iServer) -> gameserveritem_t_105* | __thiscall ret 8 (STUB)
static void * THISCALL vt_SteamMatchMakingServers002_GetServerDetails(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return NULL;
}

// slot 8: CancelQuery(void* hRequest) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_SteamMatchMakingServers002_CancelQuery(void *self, uint32_t dummy0) {
  (void)self;
}

// slot 9: RefreshQuery(void* hRequest) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_SteamMatchMakingServers002_RefreshQuery(void *self, uint32_t dummy0) {
  (void)self;
}

// slot 10: IsRefreshing(void* hRequest) -> bool | __thiscall ret 4 (STUB)
static int THISCALL vt_SteamMatchMakingServers002_IsRefreshing(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 11: GetServerCount(void* hRequest) -> int32 | __thiscall ret 4 (STUB)
static int32_t THISCALL vt_SteamMatchMakingServers002_GetServerCount(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 12: RefreshServer(void* hRequest, int32 iServer) -> void | __thiscall ret 8 (STUB)
static void THISCALL vt_SteamMatchMakingServers002_RefreshServer(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
}

// slot 13: PingServer(uint32 unIP, uint32 usPort, w_ISteamMatchmakingPingResponse* pRequestServersResponse) -> int32 | __thiscall ret 12 (STUB)
static int32_t THISCALL vt_SteamMatchMakingServers002_PingServer(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 14: PlayerDetails(uint32 unIP, uint32 usPort, w_ISteamMatchmakingPlayersResponse* pRequestServersResponse) -> int32 | __thiscall ret 12 (STUB)
static int32_t THISCALL vt_SteamMatchMakingServers002_PlayerDetails(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 15: ServerRules(uint32 unIP, uint32 usPort, w_ISteamMatchmakingRulesResponse* pRequestServersResponse) -> int32 | __thiscall ret 12 (STUB)
static int32_t THISCALL vt_SteamMatchMakingServers002_ServerRules(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 16: CancelServerQuery(int32 hServerQuery) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_SteamMatchMakingServers002_CancelServerQuery(void *self, uint32_t dummy0) {
  (void)self;
}

static vfn g_steammatchmakingservers002_vtbl[17] = {
  (vfn)vt_SteamMatchMakingServers002_RequestInternetServerList, // slot 0
  (vfn)vt_SteamMatchMakingServers002_RequestLANServerList, // slot 1
  (vfn)vt_SteamMatchMakingServers002_RequestFriendsServerList, // slot 2
  (vfn)vt_SteamMatchMakingServers002_RequestFavoritesServerList, // slot 3
  (vfn)vt_SteamMatchMakingServers002_RequestHistoryServerList, // slot 4
  (vfn)vt_SteamMatchMakingServers002_RequestSpectatorServerList, // slot 5
  (vfn)vt_SteamMatchMakingServers002_ReleaseRequest, // slot 6
  (vfn)vt_SteamMatchMakingServers002_GetServerDetails, // slot 7
  (vfn)vt_SteamMatchMakingServers002_CancelQuery, // slot 8
  (vfn)vt_SteamMatchMakingServers002_RefreshQuery, // slot 9
  (vfn)vt_SteamMatchMakingServers002_IsRefreshing, // slot 10
  (vfn)vt_SteamMatchMakingServers002_GetServerCount, // slot 11
  (vfn)vt_SteamMatchMakingServers002_RefreshServer, // slot 12
  (vfn)vt_SteamMatchMakingServers002_PingServer, // slot 13
  (vfn)vt_SteamMatchMakingServers002_PlayerDetails, // slot 14
  (vfn)vt_SteamMatchMakingServers002_ServerRules, // slot 15
  (vfn)vt_SteamMatchMakingServers002_CancelServerQuery, // slot 16
};
struct FakeSteamMatchMakingServers002 { vfn *vptr; };
static struct FakeSteamMatchMakingServers002 g_steammatchmakingservers002_instance = { g_steammatchmakingservers002_vtbl };

// === SteamNetworking005 (ordinal 14, family SteamNetworking) ===

// slot 0: SendP2PPacket(CSteamID steamIDRemote, const void* pubData, uint32 cubData, uint32 eP2PSendType, int32 nChannel) -> bool | __thiscall ret 24 (STUB)
static int THISCALL vt_SteamNetworking005_SendP2PPacket(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5) {
  (void)self;
  return 0;
}

// slot 1: IsP2PPacketAvailable(uint32* pcubMsgSize, int32 nChannel) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamNetworking005_IsP2PPacketAvailable(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 2: ReadP2PPacket(void* pubDest, uint32 cubDest, uint32* pcubMsgSize, CSteamID* psteamIDRemote, int32 nChannel) -> bool | __thiscall ret 20 (STUB)
static int THISCALL vt_SteamNetworking005_ReadP2PPacket(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4) {
  (void)self;
  return 0;
}

// slot 3: AcceptP2PSessionWithUser(CSteamID steamIDRemote) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamNetworking005_AcceptP2PSessionWithUser(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 4: CloseP2PSessionWithUser(CSteamID steamIDRemote) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamNetworking005_CloseP2PSessionWithUser(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 5: CloseP2PChannelWithUser(CSteamID steamIDRemote, int32 nChannel) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamNetworking005_CloseP2PChannelWithUser(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 6: GetP2PSessionState(CSteamID steamIDRemote, P2PSessionState_t* pConnectionState) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamNetworking005_GetP2PSessionState(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 7: AllowP2PPacketRelay(bool bAllow) -> bool | __thiscall ret 4 (STUB)
static int THISCALL vt_SteamNetworking005_AllowP2PPacketRelay(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 8: CreateListenSocket(int32 nVirtualP2PPort, uint32 nIP, uint32 nPort, bool bAllowUseOfPacketRelay) -> uint32 | __thiscall ret 16 (STUB)
static uint32_t THISCALL vt_SteamNetworking005_CreateListenSocket(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 9: CreateP2PConnectionSocket(CSteamID steamIDTarget, int32 nVirtualPort, int32 nTimeoutSec, bool bAllowUseOfPacketRelay) -> uint32 | __thiscall ret 20 (STUB)
static uint32_t THISCALL vt_SteamNetworking005_CreateP2PConnectionSocket(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4) {
  (void)self;
  return 0;
}

// slot 10: CreateConnectionSocket(uint32 nIP, uint32 nPort, int32 nTimeoutSec) -> uint32 | __thiscall ret 12 (STUB)
static uint32_t THISCALL vt_SteamNetworking005_CreateConnectionSocket(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 11: DestroySocket(uint32 hSocket, bool bNotifyRemoteEnd) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamNetworking005_DestroySocket(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 12: DestroyListenSocket(uint32 hSocket, bool bNotifyRemoteEnd) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamNetworking005_DestroyListenSocket(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 13: SendDataOnSocket(uint32 hSocket, void* pubData, uint32 cubData, bool bReliable) -> bool | __thiscall ret 16 (STUB)
static int THISCALL vt_SteamNetworking005_SendDataOnSocket(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 14: IsDataAvailableOnSocket(uint32 hSocket, uint32* pcubMsgSize) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_SteamNetworking005_IsDataAvailableOnSocket(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 15: RetrieveDataFromSocket(uint32 hSocket, void* pubDest, uint32 cubDest, uint32* pcubMsgSize) -> bool | __thiscall ret 16 (STUB)
static int THISCALL vt_SteamNetworking005_RetrieveDataFromSocket(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 16: IsDataAvailable(uint32 hListenSocket, uint32* pcubMsgSize, uint32* phSocket) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamNetworking005_IsDataAvailable(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 17: RetrieveData(uint32 hListenSocket, void* pubDest, uint32 cubDest, uint32* pcubMsgSize, uint32* phSocket) -> bool | __thiscall ret 20 (STUB)
static int THISCALL vt_SteamNetworking005_RetrieveData(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4) {
  (void)self;
  return 0;
}

// slot 18: GetSocketInfo(uint32 hSocket, CSteamID* pSteamIDRemote, int32* peSocketStatus, uint32* punIPRemote, uint16_t* punPortRemote) -> bool | __thiscall ret 20 (STUB)
static int THISCALL vt_SteamNetworking005_GetSocketInfo(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4) {
  (void)self;
  return 0;
}

// slot 19: GetListenSocketInfo(uint32 hListenSocket, uint32* pnIP, uint16_t* pnPort) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_SteamNetworking005_GetListenSocketInfo(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 20: GetSocketConnectionType(uint32 hSocket) -> uint32 | __thiscall ret 4 (STUB)
static uint32_t THISCALL vt_SteamNetworking005_GetSocketConnectionType(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 21: GetMaxPacketSize(uint32 hSocket) -> int32 | __thiscall ret 4 (STUB)
static int32_t THISCALL vt_SteamNetworking005_GetMaxPacketSize(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

static vfn g_steamnetworking005_vtbl[22] = {
  (vfn)vt_SteamNetworking005_SendP2PPacket, // slot 0
  (vfn)vt_SteamNetworking005_IsP2PPacketAvailable, // slot 1
  (vfn)vt_SteamNetworking005_ReadP2PPacket, // slot 2
  (vfn)vt_SteamNetworking005_AcceptP2PSessionWithUser, // slot 3
  (vfn)vt_SteamNetworking005_CloseP2PSessionWithUser, // slot 4
  (vfn)vt_SteamNetworking005_CloseP2PChannelWithUser, // slot 5
  (vfn)vt_SteamNetworking005_GetP2PSessionState, // slot 6
  (vfn)vt_SteamNetworking005_AllowP2PPacketRelay, // slot 7
  (vfn)vt_SteamNetworking005_CreateListenSocket, // slot 8
  (vfn)vt_SteamNetworking005_CreateP2PConnectionSocket, // slot 9
  (vfn)vt_SteamNetworking005_CreateConnectionSocket, // slot 10
  (vfn)vt_SteamNetworking005_DestroySocket, // slot 11
  (vfn)vt_SteamNetworking005_DestroyListenSocket, // slot 12
  (vfn)vt_SteamNetworking005_SendDataOnSocket, // slot 13
  (vfn)vt_SteamNetworking005_IsDataAvailableOnSocket, // slot 14
  (vfn)vt_SteamNetworking005_RetrieveDataFromSocket, // slot 15
  (vfn)vt_SteamNetworking005_IsDataAvailable, // slot 16
  (vfn)vt_SteamNetworking005_RetrieveData, // slot 17
  (vfn)vt_SteamNetworking005_GetSocketInfo, // slot 18
  (vfn)vt_SteamNetworking005_GetListenSocketInfo, // slot 19
  (vfn)vt_SteamNetworking005_GetSocketConnectionType, // slot 20
  (vfn)vt_SteamNetworking005_GetMaxPacketSize, // slot 21
};
struct FakeSteamNetworking005 { vfn *vptr; };
static struct FakeSteamNetworking005 g_steamnetworking005_instance = { g_steamnetworking005_vtbl };

// === STEAMREMOTESTORAGE_INTERFACE_VERSION010 (ordinal 15, family SteamRemoteStorage) ===

// slot 0: FileWrite(const char* pchFile, const void* pvData, int32 cubData) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_FileWrite(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 1: FileRead(const char* pchFile, void* pvData, int32 cubDataToRead) -> int32 | __thiscall ret 12 (STUB)
static int32_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_FileRead(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 2: FileForget(const char* pchFile) -> bool | __thiscall ret 4 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_FileForget(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 3: FileDelete(const char* pchFile) -> bool | __thiscall ret 4 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_FileDelete(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 4: FileShare(const char* pchFile) -> uint64 | __thiscall ret 4 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_FileShare(void *self, uint32_t dummy0) {
  (void)self;
  return 0LL;
}

// slot 5: SetSyncPlatforms(const char* pchFile, uint32 eRemoteStoragePlatform) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_SetSyncPlatforms(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 6: FileWriteStreamOpen(const char* pchFile) -> uint64 | __thiscall ret 4 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_FileWriteStreamOpen(void *self, uint32_t dummy0) {
  (void)self;
  return 0LL;
}

// slot 7: FileWriteStreamWriteChunk(uint64 writeHandle, const void* pvData, int32 cubData) -> bool | __thiscall ret 16 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_FileWriteStreamWriteChunk(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 8: FileWriteStreamClose(uint64 writeHandle) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_FileWriteStreamClose(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 9: FileWriteStreamCancel(uint64 writeHandle) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_FileWriteStreamCancel(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 10: FileExists(const char* pchFile) -> bool | __thiscall ret 4 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_FileExists(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 11: FilePersisted(const char* pchFile) -> bool | __thiscall ret 4 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_FilePersisted(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 12: GetFileSize(const char* pchFile) -> int32 | __thiscall ret 4 (STUB)
static int32_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetFileSize(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 13: GetFileTimestamp(const char* pchFile) -> int64 | __thiscall ret 4 (STUB)
static int64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetFileTimestamp(void *self, uint32_t dummy0) {
  (void)self;
  return 0LL;
}

// slot 14: GetSyncPlatforms(const char* pchFile) -> uint32 | __thiscall ret 4 (STUB)
static uint32_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetSyncPlatforms(void *self, uint32_t dummy0) {
  (void)self;
  return 0;
}

// slot 15: GetFileCount() -> int32 | __thiscall ret 0 (STUB)
static int32_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetFileCount(void *self) {
  (void)self;
  return 0;
}

// slot 16: GetFileNameAndSize(int32 iFile, int32* pnFileSizeInBytes) -> const char* | __thiscall ret 8 (STRING RETURN -- shim-owned buffer, CR-01) (STUB)
static const char * THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetFileNameAndSize(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return "";
}

// slot 17: GetQuota(int32* pnTotalBytes, int32* puAvailableBytes) -> bool | __thiscall ret 8 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetQuota(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0;
}

// slot 18: IsCloudEnabledForAccount() -> bool | __thiscall ret 0 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_IsCloudEnabledForAccount(void *self) {
  (void)self;
  return 0;
}

// slot 19: IsCloudEnabledForApp() -> bool | __thiscall ret 0 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_IsCloudEnabledForApp(void *self) {
  (void)self;
  return 0;
}

// slot 20: SetCloudEnabledForApp(bool bEnabled) -> void | __thiscall ret 4 (STUB)
static void THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_SetCloudEnabledForApp(void *self, uint32_t dummy0) {
  (void)self;
}

// slot 21: UGCDownload(uint64 hContent, uint32 unPriority) -> uint64 | __thiscall ret 12 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_UGCDownload(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0LL;
}

// slot 22: GetUGCDownloadProgress(uint64 hContent, int32* pnBytesDownloaded, int32* pnBytesExpected) -> bool | __thiscall ret 16 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetUGCDownloadProgress(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0;
}

// slot 23: GetUGCDetails(uint64 hContent, uint32* pnAppID, char** ppchName, int32* pnFileSizeInBytes, CSteamID* pSteamIDOwner) -> bool | __thiscall ret 24 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetUGCDetails(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5) {
  (void)self;
  return 0;
}

// slot 24: UGCRead(uint64 hContent, void* pvData, int32 cubDataToRead, uint32 cOffset) -> int32 | __thiscall ret 20 (STUB)
static int32_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_UGCRead(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4) {
  (void)self;
  return 0;
}

// slot 25: GetCachedUGCCount() -> int32 | __thiscall ret 0 (STUB)
static int32_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetCachedUGCCount(void *self) {
  (void)self;
  return 0;
}

// slot 26: GetCachedUGCHandle(int32 iCachedContent) -> uint64 | __thiscall ret 4 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetCachedUGCHandle(void *self, uint32_t dummy0) {
  (void)self;
  return 0LL;
}

// slot 27: PublishWorkshopFile(const char* pchFile, const char* pchPreviewFile, uint32 nConsumerAppId, const char* pchTitle, const char* pchDescription, uint32 eVisibility, w_SteamParamStringArray_t* pTags, uint32 eWorkshopFileType) -> uint64 | __thiscall ret 32 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_PublishWorkshopFile(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5, uint32_t dummy6, uint32_t dummy7) {
  (void)self;
  return 0LL;
}

// slot 28: CreatePublishedFileUpdateRequest(uint64 unPublishedFileId) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_CreatePublishedFileUpdateRequest(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 29: UpdatePublishedFileFile(uint64 updateHandle, const char* pchFile) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_UpdatePublishedFileFile(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 30: UpdatePublishedFilePreviewFile(uint64 updateHandle, const char* pchPreviewFile) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_UpdatePublishedFilePreviewFile(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 31: UpdatePublishedFileTitle(uint64 updateHandle, const char* pchTitle) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_UpdatePublishedFileTitle(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 32: UpdatePublishedFileDescription(uint64 updateHandle, const char* pchDescription) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_UpdatePublishedFileDescription(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 33: UpdatePublishedFileVisibility(uint64 updateHandle, uint32 eVisibility) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_UpdatePublishedFileVisibility(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 34: UpdatePublishedFileTags(uint64 updateHandle, w_SteamParamStringArray_t* pTags) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_UpdatePublishedFileTags(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 35: CommitPublishedFileUpdate(uint64 updateHandle) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_CommitPublishedFileUpdate(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 36: GetPublishedFileDetails(uint64 unPublishedFileId) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetPublishedFileDetails(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 37: DeletePublishedFile(uint64 unPublishedFileId) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_DeletePublishedFile(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 38: EnumerateUserPublishedFiles(uint32 unStartIndex) -> uint64 | __thiscall ret 4 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_EnumerateUserPublishedFiles(void *self, uint32_t dummy0) {
  (void)self;
  return 0LL;
}

// slot 39: SubscribePublishedFile(uint64 unPublishedFileId) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_SubscribePublishedFile(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 40: EnumerateUserSubscribedFiles(uint32 unStartIndex) -> uint64 | __thiscall ret 4 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_EnumerateUserSubscribedFiles(void *self, uint32_t dummy0) {
  (void)self;
  return 0LL;
}

// slot 41: UnsubscribePublishedFile(uint64 unPublishedFileId) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_UnsubscribePublishedFile(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 42: UpdatePublishedFileSetChangeDescription(uint64 updateHandle, const char* pchChangeDescription) -> bool | __thiscall ret 12 (STUB)
static int THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_UpdatePublishedFileSetChangeDescription(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0;
}

// slot 43: GetPublishedItemVoteDetails(uint64 unPublishedFileId) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetPublishedItemVoteDetails(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 44: UpdateUserPublishedItemVote(uint64 unPublishedFileId, bool bVoteUp) -> uint64 | __thiscall ret 12 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_UpdateUserPublishedItemVote(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0LL;
}

// slot 45: GetUserPublishedItemVoteDetails(uint64 unPublishedFileId) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetUserPublishedItemVoteDetails(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 46: EnumerateUserSharedWorkshopFiles(CSteamID steamId, uint32 unStartIndex, w_SteamParamStringArray_t* pRequiredTags, w_SteamParamStringArray_t* pExcludedTags) -> uint64 | __thiscall ret 20 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_EnumerateUserSharedWorkshopFiles(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4) {
  (void)self;
  return 0LL;
}

// slot 47: PublishVideo(uint32 eVideoProvider, const char* pchVideoAccount, const char* pchVideoIdentifier, const char* pchPreviewFile, uint32 nConsumerAppId, const char* pchTitle, const char* pchDescription, uint32 eVisibility, w_SteamParamStringArray_t* pTags) -> uint64 | __thiscall ret 36 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_PublishVideo(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5, uint32_t dummy6, uint32_t dummy7, uint32_t dummy8) {
  (void)self;
  return 0LL;
}

// slot 48: SetUserPublishedFileAction(uint64 unPublishedFileId, uint32 eAction) -> uint64 | __thiscall ret 12 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_SetUserPublishedFileAction(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2) {
  (void)self;
  return 0LL;
}

// slot 49: EnumeratePublishedFilesByUserAction(uint32 eAction, uint32 unStartIndex) -> uint64 | __thiscall ret 8 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_EnumeratePublishedFilesByUserAction(void *self, uint32_t dummy0, uint32_t dummy1) {
  (void)self;
  return 0LL;
}

// slot 50: EnumeratePublishedWorkshopFiles(uint32 eEnumerationType, uint32 unStartIndex, uint32 unCount, uint32 unDays, w_SteamParamStringArray_t* pTags, w_SteamParamStringArray_t* pUserTags) -> uint64 | __thiscall ret 24 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_EnumeratePublishedWorkshopFiles(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3, uint32_t dummy4, uint32_t dummy5) {
  (void)self;
  return 0LL;
}

// slot 51: UGCDownloadToLocation(uint64 hContent, const char* pchLocation, uint32 unPriority) -> uint64 | __thiscall ret 16 (STUB)
static uint64_t THISCALL vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_UGCDownloadToLocation(void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2, uint32_t dummy3) {
  (void)self;
  return 0LL;
}

static vfn g_steamremotestorage_interface_version010_vtbl[52] = {
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_FileWrite, // slot 0
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_FileRead, // slot 1
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_FileForget, // slot 2
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_FileDelete, // slot 3
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_FileShare, // slot 4
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_SetSyncPlatforms, // slot 5
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_FileWriteStreamOpen, // slot 6
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_FileWriteStreamWriteChunk, // slot 7
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_FileWriteStreamClose, // slot 8
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_FileWriteStreamCancel, // slot 9
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_FileExists, // slot 10
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_FilePersisted, // slot 11
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetFileSize, // slot 12
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetFileTimestamp, // slot 13
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetSyncPlatforms, // slot 14
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetFileCount, // slot 15
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetFileNameAndSize, // slot 16
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetQuota, // slot 17
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_IsCloudEnabledForAccount, // slot 18
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_IsCloudEnabledForApp, // slot 19
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_SetCloudEnabledForApp, // slot 20
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_UGCDownload, // slot 21
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetUGCDownloadProgress, // slot 22
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetUGCDetails, // slot 23
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_UGCRead, // slot 24
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetCachedUGCCount, // slot 25
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetCachedUGCHandle, // slot 26
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_PublishWorkshopFile, // slot 27
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_CreatePublishedFileUpdateRequest, // slot 28
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_UpdatePublishedFileFile, // slot 29
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_UpdatePublishedFilePreviewFile, // slot 30
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_UpdatePublishedFileTitle, // slot 31
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_UpdatePublishedFileDescription, // slot 32
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_UpdatePublishedFileVisibility, // slot 33
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_UpdatePublishedFileTags, // slot 34
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_CommitPublishedFileUpdate, // slot 35
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetPublishedFileDetails, // slot 36
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_DeletePublishedFile, // slot 37
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_EnumerateUserPublishedFiles, // slot 38
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_SubscribePublishedFile, // slot 39
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_EnumerateUserSubscribedFiles, // slot 40
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_UnsubscribePublishedFile, // slot 41
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_UpdatePublishedFileSetChangeDescription, // slot 42
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetPublishedItemVoteDetails, // slot 43
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_UpdateUserPublishedItemVote, // slot 44
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_GetUserPublishedItemVoteDetails, // slot 45
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_EnumerateUserSharedWorkshopFiles, // slot 46
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_PublishVideo, // slot 47
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_SetUserPublishedFileAction, // slot 48
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_EnumeratePublishedFilesByUserAction, // slot 49
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_EnumeratePublishedWorkshopFiles, // slot 50
  (vfn)vt_STEAMREMOTESTORAGE_INTERFACE_VERSION010_UGCDownloadToLocation, // slot 51
};
struct FakeSTEAMREMOTESTORAGE_INTERFACE_VERSION010 { vfn *vptr; };
static struct FakeSTEAMREMOTESTORAGE_INTERFACE_VERSION010 g_steamremotestorage_interface_version010_instance = { g_steamremotestorage_interface_version010_vtbl };

// === Legacy bare accessors (51-06 Task 2, selected per game via gamelib_bridge.cfg's iface.<Family>=<Version>) ===

typedef struct { const char *version; const char *family; void *instance; } GIfaceTableEntry;
static const GIfaceTableEntry g_iface_table[] = {
#if defined(__i386__)
  { "SteamUser023", "SteamUser", &g_steamuser023_instance },
#endif
#if defined(__i386__)
  { "SteamFriends018", "SteamFriends", &g_steamfriends018_instance },
#endif
#if defined(__i386__)
  { "SteamUser016", "SteamUser", &g_steamuser016_instance },
#endif
#if defined(__i386__)
  { "SteamFriends011", "SteamFriends", &g_steamfriends011_instance },
#endif
#if defined(__i386__)
  { "SteamUtils005", "SteamUtils", &g_steamutils005_instance },
#endif
#if defined(__i386__)
  { "STEAMAPPS_INTERFACE_VERSION004", "SteamApps", &g_steamapps_interface_version004_instance },
#endif
#if defined(__i386__)
  { "STEAMUSERSTATS_INTERFACE_VERSION010", "SteamUserStats", &g_steamuserstats_interface_version010_instance },
#endif
#if defined(__i386__)
  { "SteamFriends013", "SteamFriends", &g_steamfriends013_instance },
#endif
#if defined(__i386__)
  { "STEAMAPPS_INTERFACE_VERSION005", "SteamApps", &g_steamapps_interface_version005_instance },
#endif
#if defined(__i386__)
  { "STEAMUSERSTATS_INTERFACE_VERSION011", "SteamUserStats", &g_steamuserstats_interface_version011_instance },
#endif
#if defined(__i386__)
  { "STEAMREMOTESTORAGE_INTERFACE_VERSION005", "SteamRemoteStorage", &g_steamremotestorage_interface_version005_instance },
#endif
#if defined(__i386__)
  { "SteamMatchMaking009", "SteamMatchmaking", &g_steammatchmaking009_instance },
#endif
#if defined(__i386__)
  { "SteamMatchMakingServers002", "SteamMatchmakingServers", &g_steammatchmakingservers002_instance },
#endif
#if defined(__i386__)
  { "SteamNetworking005", "SteamNetworking", &g_steamnetworking005_instance },
#endif
#if defined(__i386__)
  { "STEAMREMOTESTORAGE_INTERFACE_VERSION010", "SteamRemoteStorage", &g_steamremotestorage_interface_version010_instance },
#endif
};
#define G_IFACE_TABLE_LEN (sizeof(g_iface_table) / sizeof(g_iface_table[0]))

static void *resolve_bare_iface(const char *family) {
  load_bridge_port_once();
  const char *version = NULL;
  int i;
  for (i = 0; i < g_iface_cfg_count; i++) {
    if (strcmp(g_iface_cfg_entries[i].family, family) == 0) {
      version = g_iface_cfg_entries[i].version;
      break;
    }
  }
  if (!version) return NULL;
  for (i = 0; i < (int)G_IFACE_TABLE_LEN; i++) {
    if (strcmp(g_iface_table[i].family, family) == 0 && strcmp(g_iface_table[i].version, version) == 0) {
      return (void *)g_iface_table[i].instance;
    }
  }
  return NULL;
}

void *SteamApps(void) {
  return resolve_bare_iface("SteamApps");
}

void *SteamFriends(void) {
  return resolve_bare_iface("SteamFriends");
}

void *SteamMatchmaking(void) {
  return resolve_bare_iface("SteamMatchmaking");
}

void *SteamMatchmakingServers(void) {
  return resolve_bare_iface("SteamMatchmakingServers");
}

void *SteamNetworking(void) {
  return resolve_bare_iface("SteamNetworking");
}

void *SteamRemoteStorage(void) {
  return resolve_bare_iface("SteamRemoteStorage");
}

void *SteamUser(void) {
  return resolve_bare_iface("SteamUser");
}

void *SteamUserStats(void) {
  return resolve_bare_iface("SteamUserStats");
}

void *SteamUtils(void) {
  return resolve_bare_iface("SteamUtils");
}

// === Flat SteamAPI_* exports (acceptance-set superset, R3 finding #9) ===

int SteamAPI_Init(void) {
  volatile const char *gamelib_marker_keepalive = g_gamelib_shim_marker;
  (void)gamelib_marker_keepalive;
  uint8_t retbuf[1]; uint32_t retlen = 0;
  if (!bridge_transact(BRIDGE_CONTROL_ORDINAL, BRIDGE_CONTROL_SLOT_HELLO, NULL, 0, retbuf, sizeof(retbuf), &retlen)) return 0;
  return 1;
}
int SteamAPI_InitFlat(char *pErrMsg) { (void)pErrMsg; return 0; }
void SteamAPI_Shutdown(void) {
  if (g_bridge_sock != INVALID_SOCKET) {
    closesocket(g_bridge_sock);
    g_bridge_sock = INVALID_SOCKET;
    WSACleanup();
  }
}
int SteamAPI_RestartAppIfNecessary(uint32_t unOwnAppID) { (void)unOwnAppID; return 0; }
int SteamAPI_IsSteamRunning(void) { return 1; }
void SteamAPI_RunCallbacks(void) { }
void SteamAPI_RegisterCallback(void *pCallback, int iCallback) { (void)pCallback; (void)iCallback; }
void SteamAPI_UnregisterCallback(void *pCallback) { (void)pCallback; }
void SteamAPI_RegisterCallResult(void *pCallback, uint64_t hAPICall) { (void)pCallback; (void)hAPICall; }
void SteamAPI_UnregisterCallResult(void *pCallback, uint64_t hAPICall) { (void)pCallback; (void)hAPICall; }

// === SteamGameServer* flat stubs (51-14 Task 2, Pitfall 2 -- cdecl, caller-cleans, honest unavailable answers) ===

int SteamGameServer_Init(void) { return 0; }
void SteamGameServer_Shutdown(void) { }
void SteamGameServer_RunCallbacks(void) { }
int SteamGameServer_BSecure(void) { return 0; }
uint64_t SteamGameServer_GetSteamID(void) { return 0; }
int SteamGameServer_GetHSteamPipe(void) { return 0; }
int SteamGameServer_GetHSteamUser(void) { return 0; }
void *SteamGameServer(void) { return NULL; }
void *SteamGameServerStats(void) { return NULL; }
void *SteamGameServerNetworking(void) { return NULL; }
void *SteamGameServerUtils(void) { return NULL; }

// === Per-interface flat accessors ===

void *SteamAPI_SteamUser_v023(void) { return &g_steamuser023_instance; }
void *SteamAPI_SteamFriends_v018(void) { return &g_steamfriends018_instance; }
void *SteamAPI_SteamUser_v016(void) { return &g_steamuser016_instance; }
void *SteamAPI_SteamFriends_v011(void) { return &g_steamfriends011_instance; }
void *SteamAPI_SteamUtils_v005(void) { return &g_steamutils005_instance; }
void *SteamAPI_SteamApps_v004(void) { return &g_steamapps_interface_version004_instance; }
void *SteamAPI_SteamUserStats_v010(void) { return &g_steamuserstats_interface_version010_instance; }
void *SteamAPI_SteamFriends_v013(void) { return &g_steamfriends013_instance; }
void *SteamAPI_SteamApps_v005(void) { return &g_steamapps_interface_version005_instance; }
void *SteamAPI_SteamUserStats_v011(void) { return &g_steamuserstats_interface_version011_instance; }
void *SteamAPI_SteamRemoteStorage_v005(void) { return &g_steamremotestorage_interface_version005_instance; }
void *SteamAPI_SteamMatchMaking_v009(void) { return &g_steammatchmaking009_instance; }
void *SteamAPI_SteamMatchMakingServers_v002(void) { return &g_steammatchmakingservers002_instance; }
void *SteamAPI_SteamNetworking_v005(void) { return &g_steamnetworking005_instance; }
void *SteamAPI_SteamRemoteStorage_v010(void) { return &g_steamremotestorage_interface_version010_instance; }
