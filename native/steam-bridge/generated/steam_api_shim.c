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
#include <stdint.h>
#include <string.h>
#include <stdlib.h>

#define BRIDGE_PORT 54550

static SOCKET g_bridge_sock = INVALID_SOCKET;
static uint32_t g_next_request_id = 1;

static int bridge_ensure_connected(void) {
  if (g_bridge_sock != INVALID_SOCKET) return 1;
  WSADATA w;
  if (WSAStartup(MAKEWORD(2, 2), &w) != 0) return 0;
  SOCKET s = socket(AF_INET, SOCK_STREAM, 0);
  struct sockaddr_in a; memset(&a, 0, sizeof a);
  a.sin_family = AF_INET;
  a.sin_port = htons(BRIDGE_PORT);
  a.sin_addr.s_addr = inet_addr("127.0.0.1"); // loopback-only, never a routable interface
  if (connect(s, (struct sockaddr *)&a, sizeof a) != 0) { closesocket(s); return 0; }
  g_bridge_sock = s;
  return 1;
}

/*
 * Marshal one interface-ordinal + method-slot call to the persistent bridge
 * connection and block for the response (Pattern 3). Returns 1 on ok, 0 on
 * transport/protocol error -- callers fall back to a safe zero/false value on
 * error (this shim is a compatibility layer, not a DRM gate, spike 008).
 */
static int bridge_transact(uint16_t ordinal, uint16_t slot,
                            const uint8_t *argBuf, uint32_t argLen,
                            uint8_t *retBuf, uint32_t retBufCap, uint32_t *retLenOut) {
  *retLenOut = 0;
  if (!bridge_ensure_connected()) return 0;

  uint32_t requestId = g_next_request_id++;
  uint32_t frameLen = 4 + 2 + 2 + argLen;
  uint8_t header[12];
  memcpy(header + 0, &frameLen, 4);
  memcpy(header + 4, &requestId, 4);
  memcpy(header + 8, &ordinal, 2);
  memcpy(header + 10, &slot, 2);

  if (send(g_bridge_sock, (const char *)header, sizeof(header), 0) != sizeof(header)) return 0;
  if (argLen > 0 && send(g_bridge_sock, (const char *)argBuf, argLen, 0) != (int)argLen) return 0;

  uint8_t respHeader[9];
  if (recv(g_bridge_sock, (char *)respHeader, sizeof(respHeader), MSG_WAITALL) != (int)sizeof(respHeader)) return 0;
  uint32_t respLen, respRequestId; uint8_t status;
  memcpy(&respLen, respHeader + 0, 4);
  memcpy(&respRequestId, respHeader + 4, 4);
  status = respHeader[8];
  if (respRequestId != requestId || status != 0) return 0;

  uint32_t retLen = respLen - 5; // subtract request_id(4) + status(1)
  if (retLen > retBufCap) return 0;
  if (retLen > 0 && recv(g_bridge_sock, (char *)retBuf, retLen, MSG_WAITALL) != (int)retLen) return 0;
  *retLenOut = retLen;
  return 1;
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

// slot 0: GetPersonaName() -> const char* | __thiscall ret 0
static const char * __attribute__((thiscall)) vt_SteamFriends018_GetPersonaName(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(2, 0, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  const char * ret; memcpy(&ret, retbuf, 4);
  return ret;
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

int SteamAPI_Init(void) { return 1; }
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
