// 005a — native macOS Steam helper handshake
//
// Proves the load-bearing claim behind the out-of-process bridge (Idea B):
// a native process that is NOT launched by Steam can dlopen the on-disk
// libsteam_api.dylib, init against the *running, signed-in* Mac Steam client,
// and read the real SteamID + persona. No SDK headers — we declare only the
// handful of flat-API symbols we dlsym (found via `nm -gU`).
//
// Build: see build.sh   Run: see run.sh (needs Steam running + signed in)

#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <dlfcn.h>
#include <time.h>
#include <unistd.h>

// Flat-API signatures (verified present in the dylib via nm):
typedef int         (*InitFlat_t)(char * /*SteamErrMsg[1024]*/);
typedef void        (*Shutdown_t)(void);
typedef void        (*RunCallbacks_t)(void);
typedef void *      (*UserAccessor_t)(void);      // SteamAPI_SteamUser_v023
typedef void *      (*FriendsAccessor_t)(void);   // SteamAPI_SteamFriends_v018
typedef uint64_t    (*GetSteamID_t)(void *);      // SteamAPI_ISteamUser_GetSteamID -> CSteamID(uint64)
typedef int         (*BLoggedOn_t)(void *);       // SteamAPI_ISteamUser_BLoggedOn -> bool
typedef const char *(*GetPersona_t)(void *);      // SteamAPI_ISteamFriends_GetPersonaName

static FILE *g_log = NULL;
static void ev(const char *cat, const char *fmt, ...) {
  char ts[32]; time_t t = time(NULL); struct tm *g = gmtime(&t);
  strftime(ts, sizeof ts, "%Y-%m-%dT%H:%M:%SZ", g);
  char buf[1024]; va_list ap; va_start(ap, fmt);
  vsnprintf(buf, sizeof buf, fmt, ap); va_end(ap);
  fprintf(stderr, "[%s] %-8s %s\n", ts, cat, buf);
  if (g_log) { fprintf(g_log, "[%s] %-8s %s\n", ts, cat, buf); fflush(g_log); }
}

#define NEED(var, type, name) \
  type var = (type)dlsym(h, name); \
  if (!var) { ev("FATAL", "dlsym failed: %s", name); return 3; }

int main(void) {
  const char *DYLIB =
    "/Users/graysonmitchell/Library/Application Support/Steam/Steam.AppBundle/"
    "Steam/Contents/MacOS/Frameworks/Steam Helper.app/Contents/MacOS/libsteam_api.dylib";

  g_log = fopen("run.log", "w");
  ev("START", "helper pid=%d arch=arm64", (int)getpid());
  ev("APPID", "SteamAppId=%s (steam_appid.txt in cwd)", getenv("SteamAppId") ? getenv("SteamAppId") : "(unset)");

  void *h = dlopen(DYLIB, RTLD_NOW | RTLD_LOCAL);
  if (!h) { ev("FATAL", "dlopen failed: %s", dlerror()); return 2; }
  ev("DLOPEN", "loaded %s", DYLIB);

  NEED(InitFlat,     InitFlat_t,        "SteamAPI_InitFlat");
  NEED(Shutdown,     Shutdown_t,        "SteamAPI_Shutdown");
  NEED(RunCB,        RunCallbacks_t,    "SteamAPI_RunCallbacks");
  NEED(GetUser,      UserAccessor_t,    "SteamAPI_SteamUser_v023");
  NEED(GetFriends,   FriendsAccessor_t, "SteamAPI_SteamFriends_v018");
  NEED(GetSteamID,   GetSteamID_t,      "SteamAPI_ISteamUser_GetSteamID");
  NEED(BLoggedOn,    BLoggedOn_t,       "SteamAPI_ISteamUser_BLoggedOn");
  NEED(GetPersona,   GetPersona_t,      "SteamAPI_ISteamFriends_GetPersonaName");
  ev("DLSYM", "resolved 8/8 flat-API symbols");

  char err[1024] = {0};
  int r = InitFlat(err);                 // modern flat init: 0 == k_ESteamAPIInitResult_OK
  ev("INIT", "SteamAPI_InitFlat returned %d, errmsg=\"%s\"", r, err);

  void *user = GetUser();
  void *friends = GetFriends();
  ev("IFACE", "ISteamUser=%p ISteamFriends=%p", user, friends);
  if (!user || !friends) {
    ev("FAIL", "null interface pointer — not connected to a running Steam client");
    Shutdown(); return 4;
  }

  // Let callback state settle, then read live identity.
  for (int i = 0; i < 5; i++) { RunCB(); usleep(100 * 1000); }

  int logged = BLoggedOn(user);
  uint64_t id = GetSteamID(user);
  const char *persona = GetPersona(friends);
  ev("READ", "BLoggedOn=%d SteamID64=%llu persona=\"%s\"", logged, (unsigned long long)id, persona ? persona : "(null)");

  // Individual SteamID64s start at 76561197960265728. A real proxied identity
  // is the single strongest signal the handshake worked end-to-end.
  int real = (id >= 76561197960265728ULL);
  printf("{\n");
  printf("  \"ok\": %s,\n", (real && logged) ? "true" : "false");
  printf("  \"initResult\": %d,\n", r);
  printf("  \"initErr\": \"%s\",\n", err);
  printf("  \"bLoggedOn\": %d,\n", logged);
  printf("  \"steamID64\": \"%llu\",\n", (unsigned long long)id);
  printf("  \"persona\": \"%s\",\n", persona ? persona : "");
  printf("  \"realIdentity\": %s\n", real ? "true" : "false");
  printf("}\n");

  ev(real ? "PASS" : "FAIL", "realIdentity=%d loggedOn=%d", real, logged);
  Shutdown();
  if (g_log) fclose(g_log);
  return (real && logged) ? 0 : 1;
}
