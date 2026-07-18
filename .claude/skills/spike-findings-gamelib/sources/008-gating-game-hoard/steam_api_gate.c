// 008 — bridge-GATED drop-in steam_api.dll for Hoard (Reuben.exe).
//
// Reuben.exe imports 7 steam_api symbols (objdump), including the hard gate
// SteamAPI_RestartAppIfNecessary. The canonical game pattern is:
//     if (SteamAPI_RestartAppIfNecessary(appid)) return EXIT;  // relaunch via Steam
// We drive that gate from the bridge:
//   - live native Mac Steam session confirmed -> return 0 (proceed, game runs)
//   - bridge down / no session               -> return 1 (game exits to "relaunch")
// So the game runs iff the bridge validates the real session. All 7 imports are
// exported (a missing one = the DLL won't load). Calls logged to C:\hoard_gate.log.

#include <winsock2.h>
#include <ws2tcpip.h>
#include <stdint.h>
#include <stdio.h>
#include <stdarg.h>
#include <string.h>
#include <stdlib.h>
#include <time.h>

static void glog(const char *fmt, ...) {
  FILE *f = fopen("C:\\hoard_gate.log", "a");
  if (!f) return;
  time_t t = time(NULL); char ts[16];
  strftime(ts, sizeof ts, "%H:%M:%S", gmtime(&t));
  fprintf(f, "[%s] ", ts);
  va_list ap; va_start(ap, fmt); vfprintf(f, fmt, ap); va_end(ap);
  fputc('\n', f); fclose(f);
}

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

// THE GATE. 0 = proceed, 1 = restart/exit.
int SteamAPI_RestartAppIfNecessary(uint32_t appid) {
  uint64_t id = bridge_whoami();
  int live = (id >= 76561197960265728ULL);
  int ret = live ? 0 : 1;
  glog("RestartAppIfNecessary(%u): bridge SteamID64=%llu live=%d -> %d (%s)",
       appid, (unsigned long long)id, live, ret, ret ? "GATE FIRES: exit/relaunch" : "proceed");
  return ret;
}

int  SteamAPI_Init(void) {
  uint64_t id = bridge_whoami();
  int ok = (id >= 76561197960265728ULL);
  glog("Init -> %d (SteamID64=%llu)", ok, (unsigned long long)id);
  return ok;
}

void SteamAPI_RunCallbacks(void) { }
void SteamAPI_RegisterCallback(void *cb, int iCallback)       { (void)cb; (void)iCallback; }
void SteamAPI_UnregisterCallback(void *cb)                    { (void)cb; }
void SteamAPI_RegisterCallResult(void *cb, uint64_t hAPICall) { (void)cb; (void)hAPICall; }
void SteamAPI_UnregisterCallResult(void *cb, uint64_t hAPICall){ (void)cb; (void)hAPICall; }
