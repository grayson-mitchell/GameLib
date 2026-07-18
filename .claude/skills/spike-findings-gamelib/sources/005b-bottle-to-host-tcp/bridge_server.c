// 005b/005c host bridge server (native arm64).
//
// Loads the on-disk libsteam_api.dylib once (as 005a proved), inits against the
// live signed-in Mac Steam, then serves the identity over TCP 127.0.0.1:54550.
// This is the *host half* the bottle-side PE talks to.
//   command "PING\n"   -> "PONG\n"
//   command "WHOAMI\n" -> one JSON line: {"steamID64":"...","persona":"...","loggedOn":1}
//
// Single-threaded accept loop (one client at a time) — sufficient for the spike.

#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <dlfcn.h>
#include <unistd.h>
#include <time.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>

typedef int         (*InitFlat_t)(char *);
typedef void        (*Shutdown_t)(void);
typedef void        (*RunCallbacks_t)(void);
typedef void *      (*Accessor_t)(void);
typedef uint64_t    (*GetSteamID_t)(void *);
typedef int         (*BLoggedOn_t)(void *);
typedef const char *(*GetPersona_t)(void *);

static const char *DYLIB =
  "/Users/graysonmitchell/Library/Application Support/Steam/Steam.AppBundle/"
  "Steam/Contents/MacOS/Frameworks/Steam Helper.app/Contents/MacOS/libsteam_api.dylib";

static Accessor_t   GetUser, GetFriends;
static GetSteamID_t GetSteamID;
static BLoggedOn_t  BLoggedOn;
static GetPersona_t GetPersona;
static RunCallbacks_t RunCB;
static void *g_user, *g_friends;

static void logts(const char *cat, const char *msg) {
  char ts[32]; time_t t = time(NULL); struct tm *g = gmtime(&t);
  strftime(ts, sizeof ts, "%Y-%m-%dT%H:%M:%SZ", g);
  fprintf(stderr, "[%s] %-6s %s\n", ts, cat, msg);
}

static void whoami(char *out, size_t n) {
  for (int i = 0; i < 3; i++) { RunCB(); usleep(50 * 1000); }
  uint64_t id = GetSteamID(g_user);
  int logged = BLoggedOn(g_user);
  const char *p = GetPersona(g_friends);
  snprintf(out, n, "{\"steamID64\":\"%llu\",\"persona\":\"%s\",\"loggedOn\":%d}\n",
           (unsigned long long)id, p ? p : "", logged);
}

int main(void) {
  void *h = dlopen(DYLIB, RTLD_NOW | RTLD_LOCAL);
  if (!h) { logts("FATAL", dlerror()); return 2; }
  InitFlat_t InitFlat = (InitFlat_t)dlsym(h, "SteamAPI_InitFlat");
  RunCB      = (RunCallbacks_t)dlsym(h, "SteamAPI_RunCallbacks");
  GetUser    = (Accessor_t)dlsym(h, "SteamAPI_SteamUser_v023");
  GetFriends = (Accessor_t)dlsym(h, "SteamAPI_SteamFriends_v018");
  GetSteamID = (GetSteamID_t)dlsym(h, "SteamAPI_ISteamUser_GetSteamID");
  BLoggedOn  = (BLoggedOn_t)dlsym(h, "SteamAPI_ISteamUser_BLoggedOn");
  GetPersona = (GetPersona_t)dlsym(h, "SteamAPI_ISteamFriends_GetPersonaName");
  if (!InitFlat || !RunCB || !GetUser || !GetFriends || !GetSteamID || !BLoggedOn || !GetPersona) {
    logts("FATAL", "dlsym failed"); return 3;
  }
  char err[1024] = {0};
  int r = InitFlat(err);
  g_user = GetUser(); g_friends = GetFriends();
  if (r != 0 || !g_user || !g_friends) {
    fprintf(stderr, "[INIT] failed r=%d err=%s (is Steam running + signed in? is steam_appid.txt present?)\n", r, err);
    return 4;
  }
  logts("INIT", "SteamAPI ready");

  int s = socket(AF_INET, SOCK_STREAM, 0);
  int yes = 1; setsockopt(s, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof yes);
  struct sockaddr_in a = {0};
  a.sin_family = AF_INET; a.sin_port = htons(54550);
  a.sin_addr.s_addr = htonl(INADDR_LOOPBACK); // 127.0.0.1 only
  if (bind(s, (struct sockaddr *)&a, sizeof a) < 0) { logts("FATAL", "bind 54550 failed"); return 5; }
  listen(s, 8);
  logts("LISTEN", "127.0.0.1:54550 (Ctrl-C to stop)");

  for (;;) {
    int c = accept(s, NULL, NULL);
    if (c < 0) continue;
    char buf[256] = {0};
    ssize_t k = recv(c, buf, sizeof buf - 1, 0);
    if (k > 0) {
      char reply[512];
      if (strncmp(buf, "WHOAMI", 6) == 0)      { whoami(reply, sizeof reply); logts("SERVE", "WHOAMI"); }
      else if (strncmp(buf, "PING", 4) == 0)   { snprintf(reply, sizeof reply, "PONG\n"); logts("SERVE", "PING"); }
      else                                      { snprintf(reply, sizeof reply, "ERR unknown\n"); }
      send(c, reply, strlen(reply), 0);
    }
    close(c);
  }
}
