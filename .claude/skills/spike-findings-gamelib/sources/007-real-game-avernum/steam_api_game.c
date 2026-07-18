// 007 — drop-in steam_api.dll for a REAL commercial game (Avernum 4).
//
// Avernum 4.exe imports exactly two symbols from steam_api.dll: SteamAPI_Init
// and SteamAPI_Shutdown (verified via objdump). It's a pure Steam ownership/DRM
// gate. We make SteamAPI_Init return true ONLY IF the host bridge confirms the
// real signed-in native Mac Steam session — so a successful game launch is
// genuinely bridge-backed, not a hardcoded pass. Every call is logged to
// C:\steam007.log so we get a precise trace of what the real game invokes.

#include <winsock2.h>
#include <ws2tcpip.h>
#include <stdint.h>
#include <stdio.h>
#include <stdarg.h>
#include <string.h>
#include <stdlib.h>
#include <time.h>

static void glog(const char *fmt, ...) {
  FILE *f = fopen("C:\\steam007.log", "a");
  if (!f) return;
  time_t t = time(NULL); char ts[32];
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

// Avernum's ownership gate. Real game trusts this return value.
int SteamAPI_Init(void) {
  uint64_t id = bridge_whoami();
  int ok = (id >= 76561197960265728ULL);   // real individual SteamID from the live client
  glog("SteamAPI_Init: bridge SteamID64=%llu -> returning %d", (unsigned long long)id, ok);
  return ok;
}

void SteamAPI_Shutdown(void) { glog("SteamAPI_Shutdown"); }

// Harmless extra stubs in case a build variant imports them (Avernum does not).
int SteamAPI_RestartAppIfNecessary(uint32_t appid) { glog("SteamAPI_RestartAppIfNecessary(%u) -> false", appid); return 0; }
int SteamAPI_IsSteamRunning(void) { glog("SteamAPI_IsSteamRunning -> true"); return 1; }
