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
 *     for: SteamUser023, SteamFriends018.
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
      return;
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

// === SteamUser023 (ordinal 1, sdkVersion pinned-2026-07-18-rlabrecque-SteamworksSDK-master) ===

// slot 0: GetHSteamUser() -> HSteamUser | __thiscall ret 0
static uint32_t __attribute__((thiscall)) vt_SteamUser023_GetHSteamUser(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(1, 0, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  uint32_t ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 1: BLoggedOn() -> bool | __thiscall ret 0
static int __attribute__((thiscall)) vt_SteamUser023_BLoggedOn(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(1, 1, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 2: GetSteamID() -> CSteamID | __thiscall ret 0
static uint64_t __attribute__((thiscall)) vt_SteamUser023_GetSteamID(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[8]; uint32_t retlen = 0;
  if (!bridge_transact(1, 2, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 8) return 0;
  uint64_t ret; memcpy(&ret, retbuf, 8);
  return ret;
}

// slot 3: BSetDurationControlOnlineState(int32 eNewState) -> bool | __thiscall ret 4
static int __attribute__((thiscall)) vt_SteamUser023_BSetDurationControlOnlineState(void *self, int32_t eNewState) {
  (void)self;
  uint8_t argbuf[4];
  memcpy(argbuf + 0, &eNewState, 4);
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(1, 3, argbuf, 4, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 4: SetTwoIntTest_TESTONLY(int32 a, int32 b) -> void | __thiscall ret 8
// NOTE: ABI-EXERCISE SLOT ONLY -- synthetic, NOT a real Steamworks method. Exists solely to exercise the generator's two-4-byte-param ret N computation (D-09/Pitfall 3).
static void __attribute__((thiscall)) vt_SteamUser023_SetTwoIntTest_TESTONLY(void *self, int32_t a, int32_t b) {
  (void)self;
  uint8_t argbuf[8];
  memcpy(argbuf + 0, &a, 4);
  memcpy(argbuf + 4, &b, 4);
  uint8_t retbuf[1]; uint32_t retlen = 0;
  bridge_transact(1, 4, argbuf, 8, retbuf, sizeof(retbuf), &retlen);
}

// slot 5: GetVoiceOptimalSampleRate() -> uint32 | __thiscall ret 0
static uint32_t __attribute__((thiscall)) vt_SteamUser023_GetVoiceOptimalSampleRate(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(1, 5, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  uint32_t ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 6: GetUserStatsSummary_TESTONLY() -> UserStatsSummary_t | __thiscall ret 4 (SRET -- hidden return pointer)
// NOTE: SRET EXERCISE ONLY -- synthetic slot, NOT a real Steamworks method. Exists solely to exercise the generator's hidden-return-pointer (sret) marshaling for struct returns > 8 bytes (D-09/Pitfall 3).
static void __attribute__((thiscall)) vt_SteamUser023_GetUserStatsSummary_TESTONLY(void *self, void *sretOut) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[16]; uint32_t retlen = 0;
  if (!bridge_transact(1, 6, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 16) {
    memset(sretOut, 0, 16);
    return;
  }
  memcpy(sretOut, retbuf, 16);
}

// slot 7: SetUint64Test_TESTONLY(uint64 hSteamID) -> void | __thiscall ret 8
// NOTE: ABI-EXERCISE SLOT ONLY -- synthetic, NOT a real Steamworks method. Exists solely to exercise the generator's single-8-byte-param (uint64) ret N computation, distinct from the two-int-param case (D-09/Pitfall 3).
static void __attribute__((thiscall)) vt_SteamUser023_SetUint64Test_TESTONLY(void *self, uint64_t hSteamID) {
  (void)self;
  uint8_t argbuf[8];
  memcpy(argbuf + 0, &hSteamID, 8);
  uint8_t retbuf[1]; uint32_t retlen = 0;
  bridge_transact(1, 7, argbuf, 8, retbuf, sizeof(retbuf), &retlen);
}

static vfn g_steamuser023_vtbl[8] = {
  (vfn)vt_SteamUser023_GetHSteamUser, // slot 0
  (vfn)vt_SteamUser023_BLoggedOn, // slot 1
  (vfn)vt_SteamUser023_GetSteamID, // slot 2
  (vfn)vt_SteamUser023_BSetDurationControlOnlineState, // slot 3
  (vfn)vt_SteamUser023_SetTwoIntTest_TESTONLY, // slot 4
  (vfn)vt_SteamUser023_GetVoiceOptimalSampleRate, // slot 5
  (vfn)vt_SteamUser023_GetUserStatsSummary_TESTONLY, // slot 6
  (vfn)vt_SteamUser023_SetUint64Test_TESTONLY, // slot 7
};
struct FakeSteamUser023 { vfn *vptr; };
static struct FakeSteamUser023 g_steamuser023_instance = { g_steamuser023_vtbl };

// === SteamFriends018 (ordinal 2, sdkVersion pinned-2026-07-18-rlabrecque-SteamworksSDK-master) ===

// slot 0: GetPersonaName() -> const char* | __thiscall ret 0 (STRING RETURN -- shim-owned buffer, CR-01)
static char vt_SteamFriends018_GetPersonaName_buf[STRING_RETURN_BUF_BYTES];
static const char * __attribute__((thiscall)) vt_SteamFriends018_GetPersonaName(void *self) {
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

// slot 1: SetPersonaNameTest_TESTONLY(const char* pchPersonaName) -> bool | __thiscall ret 4
// NOTE: ABI-EXERCISE SLOT ONLY -- synthetic, NOT a real Steamworks method. Exercises a single-pointer-param ret N computation (D-09/Pitfall 3).
static int __attribute__((thiscall)) vt_SteamFriends018_SetPersonaNameTest_TESTONLY(void *self, const char * pchPersonaName) {
  (void)self;
  uint8_t argbuf[4];
  memcpy(argbuf + 0, &pchPersonaName, 4);
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(2, 1, argbuf, 4, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int ret; memcpy(&ret, retbuf, 4);
  return ret;
}

// slot 2: GetSmallFriendsGroupIcon_TESTONLY(int32 friendsGroupID) -> int32 | __thiscall ret 4
// NOTE: ABI-EXERCISE SLOT ONLY -- synthetic, NOT a real Steamworks method. Exercises a single-4-byte-param, register-return case (D-09/Pitfall 3).
static int32_t __attribute__((thiscall)) vt_SteamFriends018_GetSmallFriendsGroupIcon_TESTONLY(void *self, int32_t friendsGroupID) {
  (void)self;
  uint8_t argbuf[4];
  memcpy(argbuf + 0, &friendsGroupID, 4);
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(2, 2, argbuf, 4, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  int32_t ret; memcpy(&ret, retbuf, 4);
  return ret;
}

static vfn g_steamfriends018_vtbl[3] = {
  (vfn)vt_SteamFriends018_GetPersonaName, // slot 0
  (vfn)vt_SteamFriends018_SetPersonaNameTest_TESTONLY, // slot 1
  (vfn)vt_SteamFriends018_GetSmallFriendsGroupIcon_TESTONLY, // slot 2
};
struct FakeSteamFriends018 { vfn *vptr; };
static struct FakeSteamFriends018 g_steamfriends018_instance = { g_steamfriends018_vtbl };

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

// === Per-interface flat accessors ===

void *SteamAPI_SteamUser_v023(void) { return &g_steamuser023_instance; }
void *SteamAPI_SteamFriends_v018(void) { return &g_steamfriends018_instance; }
