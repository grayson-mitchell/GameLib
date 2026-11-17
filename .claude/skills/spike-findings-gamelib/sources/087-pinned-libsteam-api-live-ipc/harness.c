// 087 — pinned libsteam_api.dylib vs the Steam client copy, against the live Mac Steam client.
//
// Usage: ./harness <dylib-path> <appid> <label>
// Loads ONE dylib (argv[1]) the same way bridge_helper.c does (dlopen RTLD_NOW|RTLD_LOCAL,
// flat API only, no SDK headers), then exercises the bridge's load-bearing surface:
//   init (InitFlat, or legacy SteamAPI_Init when the pin predates InitFlat)
//   accessor probing by version (like bridge_dispatch.h's bd_probe_accessor)
//   identity: BLoggedOn, GetSteamID, GetPersonaName
//   utils/apps: GetAppID, BIsSubscribed, GetCurrentGameLanguage
//   manual dispatch: Init, GetHSteamPipe, RunFrame/GetNextCallback drain
//   call result: RequestUserStats -> 703 SteamAPICallCompleted -> GetAPICallResult(1101)
// Emits ISO-timestamped events to stderr + run-<label>.log and one JSON verdict line on stdout.
#include <dlfcn.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#pragma pack(push, 4)
typedef struct { int32_t hUser; int32_t iCallback; uint8_t *pub; int32_t cub; } CallbackMsg;
typedef struct { uint64_t hAsyncCall; int32_t iCallback; uint32_t cubParam; } APICallCompleted;
typedef struct { uint64_t gameID; int32_t eResult; uint64_t steamID; } UserStatsReceived; // mac size 20
#pragma pack(pop)

static FILE *g_log;
static void ev(const char *cat, const char *fmt, ...) {
  char ts[40]; struct timespec now; clock_gettime(CLOCK_REALTIME, &now);
  struct tm g; gmtime_r(&now.tv_sec, &g);
  size_t n = strftime(ts, sizeof ts, "%Y-%m-%dT%H:%M:%S", &g);
  snprintf(ts + n, sizeof ts - n, ".%03ldZ", now.tv_nsec / 1000000);
  char buf[1200]; va_list ap; va_start(ap, fmt); vsnprintf(buf, sizeof buf, fmt, ap); va_end(ap);
  fprintf(stderr, "[%s] %-8s %s\n", ts, cat, buf);
  if (g_log) { fprintf(g_log, "[%s] %-8s %s\n", ts, cat, buf); fflush(g_log); }
}

typedef void *(*Acc)(void);
static void *h;
static Acc probe(const char *prefix, int hi, int lo, int *ver) {
  char name[128];
  for (int v = hi; v >= lo; v--) {
    snprintf(name, sizeof name, "%s%03d", prefix, v);
    Acc a = (Acc)dlsym(h, name);
    if (a) { *ver = v; return a; }
  }
  *ver = -1; return NULL;
}
#define SYM(type, name) ((type)dlsym(h, name))

int main(int argc, char **argv) {
  if (argc < 4) { fprintf(stderr, "usage: %s <dylib> <appid> <label>\n", argv[0]); return 64; }
  const char *path = argv[1], *appid = argv[2], *label = argv[3];
  char lp[256]; snprintf(lp, sizeof lp, "run-%s.log", label); g_log = fopen(lp, "w");
  ev("START", "label=%s pid=%d appid=%s dylib=%s", label, getpid(), appid, path);
  FILE *f = fopen("steam_appid.txt", "w"); if (f) { fputs(appid, f); fclose(f); }

  h = dlopen(path, RTLD_NOW | RTLD_LOCAL);
  if (!h) { ev("FATAL", "dlopen: %s", dlerror()); printf("{\"label\":\"%s\",\"ok\":false,\"stage\":\"dlopen\"}\n", label); return 2; }
  Dl_info di; void *initflat = dlsym(h, "SteamAPI_InitFlat");
  if (dladdr(initflat ? initflat : dlsym(h, "SteamAPI_Init"), &di)) ev("DLOPEN", "image=%s", di.dli_fname);

  // --- init ---
  int initResult = -99; char err[1024] = {0}; const char *initKind;
  if (initflat) {
    initKind = "InitFlat";
    initResult = ((int (*)(char *))initflat)(err);
  } else {
    initKind = "SteamAPI_Init(legacy)";
    bool (*legacy)(void) = SYM(bool (*)(void), "SteamAPI_Init");
    initResult = legacy && legacy() ? 0 : 1;
  }
  ev("INIT", "%s -> %d err=\"%s\"", initKind, initResult, err);
  if (initResult != 0) { printf("{\"label\":\"%s\",\"ok\":false,\"stage\":\"init\",\"init\":%d,\"err\":\"%s\"}\n", label, initResult, err); return 3; }

  // --- accessors (same probe ranges as bridge_dispatch.h) ---
  int vU, vF, vUt, vA, vS;
  Acc aU = probe("SteamAPI_SteamUser_v", 39, 16, &vU);
  Acc aF = probe("SteamAPI_SteamFriends_v", 34, 11, &vF);
  Acc aUt = probe("SteamAPI_SteamUtils_v", 27, 5, &vUt);
  Acc aA = probe("SteamAPI_SteamApps_v", 25, 4, &vA);
  Acc aS = probe("SteamAPI_SteamUserStats_v", 29, 10, &vS);
  ev("ACCESS", "SteamUser=v%03d Friends=v%03d Utils=v%03d Apps=v%03d UserStats=v%03d", vU, vF, vUt, vA, vS);
  void *user = aU ? aU() : NULL, *fr = aF ? aF() : NULL, *ut = aUt ? aUt() : NULL, *ap = aA ? aA() : NULL, *st = aS ? aS() : NULL;
  ev("IFACE", "user=%p friends=%p utils=%p apps=%p stats=%p", user, fr, ut, ap, st);

  // --- manual dispatch (the helper's callback path) ---
  void (*mdInit)(void) = SYM(void (*)(void), "SteamAPI_ManualDispatch_Init");
  void (*mdRun)(int32_t) = SYM(void (*)(int32_t), "SteamAPI_ManualDispatch_RunFrame");
  bool (*mdNext)(int32_t, CallbackMsg *) = SYM(bool (*)(int32_t, CallbackMsg *), "SteamAPI_ManualDispatch_GetNextCallback");
  void (*mdFree)(int32_t) = SYM(void (*)(int32_t), "SteamAPI_ManualDispatch_FreeLastCallback");
  bool (*mdRes)(int32_t, uint64_t, void *, int, int, bool *) =
      SYM(bool (*)(int32_t, uint64_t, void *, int, int, bool *), "SteamAPI_ManualDispatch_GetAPICallResult");
  int32_t (*getPipe)(void) = SYM(int32_t (*)(void), "SteamAPI_GetHSteamPipe");
  int md = mdInit && mdRun && mdNext && mdFree && mdRes && getPipe;
  int32_t pipe = 0;
  if (md) { mdInit(); pipe = getPipe(); }
  ev("MD", "manual dispatch %s pipe=%d", md ? "ready" : "MISSING", pipe);

  // --- identity + basic reads ---
  bool logged = user ? SYM(bool (*)(void *), "SteamAPI_ISteamUser_BLoggedOn")(user) : false;
  uint64_t sid = user ? SYM(uint64_t (*)(void *), "SteamAPI_ISteamUser_GetSteamID")(user) : 0;
  const char *persona = fr ? SYM(const char *(*)(void *), "SteamAPI_ISteamFriends_GetPersonaName")(fr) : NULL;
  uint32_t gotApp = ut ? SYM(uint32_t (*)(void *), "SteamAPI_ISteamUtils_GetAppID")(ut) : 0;
  bool subscribed = ap ? SYM(bool (*)(void *), "SteamAPI_ISteamApps_BIsSubscribed")(ap) : false;
  const char *lang = ap ? SYM(const char *(*)(void *), "SteamAPI_ISteamApps_GetCurrentGameLanguage")(ap) : NULL;
  int personaLen = persona ? (int)strlen(persona) : -1; // persona deliberately not printed (privacy)
  ev("READ", "BLoggedOn=%d steamID64=%llu personaLen=%d GetAppID=%u BIsSubscribed=%d lang=%s",
     logged, (unsigned long long)sid, personaLen, gotApp, subscribed, lang ? lang : "(null)");

  // --- call result round trip ---
  int cbTotal = 0, got703 = 0, got1101 = 0, statsResult = -1; uint64_t call = 0;
  uint64_t (*reqStats)(void *, uint64_t) = SYM(uint64_t (*)(void *, uint64_t), "SteamAPI_ISteamUserStats_RequestUserStats");
  if (st && reqStats && md) {
    call = reqStats(st, sid);
    ev("CALL", "RequestUserStats -> hAPICall=%llu", (unsigned long long)call);
    for (int tick = 0; tick < 100 && !got1101; tick++) {
      mdRun(pipe);
      CallbackMsg m;
      while (mdNext(pipe, &m)) {
        cbTotal++;
        if (m.iCallback == 703 && m.cub >= (int32_t)sizeof(APICallCompleted)) {
          APICallCompleted c; memcpy(&c, m.pub, sizeof c);
          if (c.hAsyncCall == call) {
            got703 = 1;
            UserStatsReceived r; bool failed = true;
            bool ok = mdRes(pipe, call, &r, (int)sizeof r, 1101, &failed);
            got1101 = ok && !failed;
            statsResult = r.eResult;
            ev("CB", "703 for our call (cub=%u) -> GetAPICallResult ok=%d failed=%d gameID=%llu eResult=%d user_match=%d",
               c.cubParam, ok, failed, (unsigned long long)r.gameID, r.eResult, r.steamID == sid);
          }
        } else if (cbTotal <= 20) {
          ev("CB", "callback id=%d cub=%d", m.iCallback, m.cub);
        }
        mdFree(pipe);
      }
      usleep(50 * 1000);
    }
  }
  ev("CB", "drained %d callbacks total, 703=%d 1101=%d", cbTotal, got703, got1101);

  int ok = logged && sid >= 76561197960265728ULL && personaLen > 0 && gotApp == (uint32_t)atoi(appid) && got1101;
  printf("{\"label\":\"%s\",\"ok\":%s,\"init\":\"%s\",\"user\":%d,\"friends\":%d,\"utils\":%d,\"apps\":%d,\"stats\":%d,"
         "\"loggedOn\":%d,\"realSteamID\":%d,\"personaLen\":%d,\"appidMatch\":%d,\"subscribed\":%d,\"lang\":\"%s\","
         "\"md\":%d,\"callbacks\":%d,\"cb703\":%d,\"cb1101\":%d,\"statsEResult\":%d}\n",
         label, ok ? "true" : "false", initKind, vU, vF, vUt, vA, vS, logged, sid >= 76561197960265728ULL, personaLen,
         gotApp == (uint32_t)atoi(appid), subscribed, lang ? lang : "", md, cbTotal, got703, got1101, statsResult);
  void (*shutdown)(void) = SYM(void (*)(void), "SteamAPI_Shutdown");
  if (shutdown) shutdown();
  ev("END", "ok=%d", ok);
  return ok ? 0 : 1;
}
