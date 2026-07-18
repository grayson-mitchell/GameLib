// 006 — replacement steam_api.dll exposing a real C++ VTABLE for ISteamUser.
//
// 005c proved the FLAT export path. This proves the harder, load-bearing path:
// an unmodified game calls SteamUser()->GetSteamID() as a C++ virtual call —
// dispatched through the object's vtable with the MSVC ABI (this in ECX via
// __thiscall; CSteamID (8 bytes) returned in EDX:EAX). We hand-build a vtable
// whose slot functions are __thiscall and marshal to the host bridge.
//
// SteamAPI_SteamUser_v023() returns a pointer to an object whose first word is
// the vtable pointer. Slot order matches ISteamUser: 0 GetHSteamUser,
// 1 BLoggedOn, 2 GetSteamID.

#include <winsock2.h>
#include <ws2tcpip.h>
#include <stdint.h>
#include <string.h>
#include <stdlib.h>

static uint64_t bridge_whoami(void) {
  WSADATA w;
  if (WSAStartup(MAKEWORD(2, 2), &w) != 0) return 0;
  SOCKET s = socket(AF_INET, SOCK_STREAM, 0);
  struct sockaddr_in a; memset(&a, 0, sizeof a);
  a.sin_family = AF_INET; a.sin_port = htons(54550);
  a.sin_addr.s_addr = inet_addr("127.0.0.1");
  if (connect(s, (struct sockaddr *)&a, sizeof a) != 0) { closesocket(s); WSACleanup(); return 0; }
  send(s, "WHOAMI\n", 7, 0);
  char buf[512]; memset(buf, 0, sizeof buf);
  int k = recv(s, buf, sizeof buf - 1, 0);
  closesocket(s); WSACleanup();
  if (k <= 0) return 0;
  char *p = strstr(buf, "\"steamID64\":\"");
  if (!p) return 0;
  p += strlen("\"steamID64\":\"");
  return strtoull(p, NULL, 10);
}

// --- ISteamUser vtable slots (MSVC __thiscall: `this` in ECX, callee cleans) ---
static int      __attribute__((thiscall)) vt_GetHSteamUser(void *self) { (void)self; return 1; }
static int      __attribute__((thiscall)) vt_BLoggedOn(void *self)     { (void)self; return 1; }
static uint64_t __attribute__((thiscall)) vt_GetSteamID(void *self)    { (void)self; return bridge_whoami(); }

typedef void *vfn;
static vfn g_isteamuser_vtbl[8] = {
  (vfn)vt_GetHSteamUser,  // slot 0
  (vfn)vt_BLoggedOn,      // slot 1
  (vfn)vt_GetSteamID,     // slot 2
  0, 0, 0, 0, 0
};
struct FakeUser { vfn *vptr; };
static struct FakeUser g_user = { g_isteamuser_vtbl };  // object.first_word = &vtbl[0]

// --- exported flat surface (a game still calls Init + the versioned accessor) ---
int   SteamAPI_Init(void)             { return 1; }
int   SteamAPI_InitFlat(char *e)      { (void)e; return 0; }
void  SteamAPI_Shutdown(void)         { }
void  SteamAPI_RunCallbacks(void)     { }
void *SteamAPI_SteamUser_v023(void)   { return &g_user; }
