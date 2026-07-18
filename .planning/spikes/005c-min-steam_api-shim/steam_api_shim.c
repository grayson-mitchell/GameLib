// 005c — minimal replacement steam_api.dll (PE32 i386) for the GameLib bottle.
//
// A stand-in for the game's real steam_api.dll. It implements just enough of the
// Steamworks flat API to prove the shim path: on GetSteamID it marshals a WHOAMI
// to the host bridge (005b bridge_server) over TCP and returns the REAL SteamID64
// the host read from native Mac Steam. Steamworks S_API is __cdecl on i386, which
// is the default calling convention here.
//
// SCOPE: flat-API path only. An unmodified game calls SteamUser()->GetSteamID()
// through the C++ vtable, not this flat export — reproducing that vtable ABI
// (sret/__thiscall/ret N) is what L4D2-launcher's gen_vtables.py does and is the
// remaining productionization step (see README "What this does NOT prove").

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
  a.sin_family = AF_INET;
  a.sin_port = htons(54550);
  a.sin_addr.s_addr = inet_addr("127.0.0.1");
  if (connect(s, (struct sockaddr *)&a, sizeof a) != 0) { closesocket(s); WSACleanup(); return 0; }
  send(s, "WHOAMI\n", 7, 0);
  char buf[512]; memset(buf, 0, sizeof buf);
  int k = recv(s, buf, sizeof buf - 1, 0);
  closesocket(s); WSACleanup();
  if (k <= 0) return 0;
  char *p = strstr(buf, "\"steamID64\":\"");   // {"steamID64":"NNN",...}
  if (!p) return 0;
  p += strlen("\"steamID64\":\"");
  return strtoull(p, NULL, 10);
}

// --- Steamworks flat API surface (minimal) ---
int      SteamAPI_Init(void)                    { return 1; }   // bool true
int      SteamAPI_InitFlat(char *e)             { (void)e; return 0; } // enum OK
void     SteamAPI_Shutdown(void)                { }
void     SteamAPI_RunCallbacks(void)            { }
void    *SteamAPI_SteamUser_v023(void)          { return (void *)0x1; } // opaque non-null handle
uint64_t SteamAPI_ISteamUser_GetSteamID(void *self) { (void)self; return bridge_whoami(); }
