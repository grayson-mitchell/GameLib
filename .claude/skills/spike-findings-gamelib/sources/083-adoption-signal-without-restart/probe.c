// Spike 083: watch the running Mac Steam across a sign-in. Each call attaches fresh (no state kept
// across a sign-out/in) and prints one JSON line.
//   probe tick <appid>     -> BLoggedOn, GetSteamID, GetAppInstallState(appid), GetNumInstalledApps
//   probe install <appid>  -> IClientAppManager::InstallApp(appid, 0, false) return code
// Interfaces: engine slot 8 (IClientUser) and slot 43 (IClientAppManager), each RTTI-checked.
// Method slots come from each proxy's IPC function ID (065/084 method), never from a header.
#include <dlfcn.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef int32_t HSteamPipe;
typedef int32_t HSteamUser;
typedef void *(*CreateInterfaceFn)(const char *, int *);
static const char *kSteamclient =
    "/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS/steamclient.dylib";
enum { ENG_CreateSteamPipe = 0, ENG_ConnectToGlobalUser = 3, ENG_GetIClientUser = 8, ENG_GetIClientAppManager = 43 };
// Function-ID high halves: IClientUser (OpenSteamClient dumped_data), IClientAppManager (066 slotmap).
#define HI_BLoggedOn 0x6585
#define HI_GetSteamID 0xd6fc
#define HI_InstallApp 0xdd9a
#define HI_GetAppInstallState 0xeaf2
#define HI_GetNumInstalledApps 0xde40

static void **vt(void *o) { return *(void ***)o; }
static const char *rtti(void *o) {
  if (!o) return "(null)";
  void *ti = vt(o)[-1];
  return ti ? *(const char **)((char *)ti + 8) : "(none)";
}
static int in_sc(void *p) {
  Dl_info d;
  return p && dladdr(p, &d) && d.dli_fname && strstr(d.dli_fname, "steamclient.dylib");
}
static int64_t fid(void *fn) {
  const uint32_t *w = fn;
  for (int i = 0; i < 64; i++) {
    if ((w[i] & 0xFFE00000u) != 0x52800000u) continue;
    uint32_t rd = w[i] & 31, lo = (w[i] >> 5) & 0xFFFF;
    for (int j = i + 1; j < i + 6 && j < 64; j++)
      if ((w[j] & 0xFFE00000u) == 0x72A00000u && (w[j] & 31) == rd) return ((int64_t)((w[j] >> 5) & 0xFFFF) << 16) | lo;
  }
  return -1;
}
// Unique slot whose function ID has this high half, else -1.
static int slot(void *obj, uint32_t hi) {
  void **v = vt(obj);
  int hit = -1, n = 0;
  for (int i = 0; i < 400 && in_sc(v[i]); i++) {
    int64_t f = fid(v[i]);
    if (f >= 0 && ((uint32_t)f >> 16) == hi) { hit = i; n++; }
  }
  return n == 1 ? hit : -1;
}

int main(int argc, char **argv) {
  if (argc < 3) { printf("{\"step\":\"usage\"}\n"); return 64; }
  const char *mode = argv[1];
  uint32_t app = (uint32_t)strtoul(argv[2], NULL, 10);
  char path[1024];
  snprintf(path, sizeof path, "%s%s", getenv("HOME"), kSteamclient);
  void *lib = dlopen(path, RTLD_NOW | RTLD_LOCAL);
  if (!lib) { printf("{\"ok\":false,\"why\":\"dlopen\"}\n"); return 1; }
  void *eng = ((CreateInterfaceFn)dlsym(lib, "CreateInterface"))("CLIENTENGINE_INTERFACE_VERSION005", NULL);
  if (!eng) { printf("{\"ok\":false,\"why\":\"engine\"}\n"); return 1; }
  HSteamPipe pipe = ((HSteamPipe(*)(void *))vt(eng)[ENG_CreateSteamPipe])(eng);
  if (!pipe) { printf("{\"ok\":false,\"why\":\"no pipe (Steam not running?)\"}\n"); return 1; }
  HSteamUser user = ((HSteamUser(*)(void *, HSteamPipe))vt(eng)[ENG_ConnectToGlobalUser])(eng, pipe);
  if (!user) { printf("{\"ok\":false,\"why\":\"no global user\"}\n"); return 1; }
  void *cu = ((void *(*)(void *, HSteamUser, HSteamPipe))vt(eng)[ENG_GetIClientUser])(eng, user, pipe);
  void *am = ((void *(*)(void *, HSteamUser, HSteamPipe))vt(eng)[ENG_GetIClientAppManager])(eng, user, pipe);
  if (!cu || !am || !strstr(rtti(cu), "IClientUser") || !strstr(rtti(am), "IClientAppManager")) {
    printf("{\"ok\":false,\"why\":\"rtti\",\"user\":\"%s\",\"apm\":\"%s\"}\n", rtti(cu), rtti(am));
    return 2;
  }
  int sOn = slot(cu, HI_BLoggedOn), sId = slot(cu, HI_GetSteamID), sIns = slot(am, HI_InstallApp),
      sSt = slot(am, HI_GetAppInstallState), sN = slot(am, HI_GetNumInstalledApps);
  if (sOn < 0 || sId < 0 || sIns < 0 || sSt < 0 || sN < 0) {
    printf("{\"ok\":false,\"why\":\"slots\",\"slots\":[%d,%d,%d,%d,%d]}\n", sOn, sId, sIns, sSt, sN);
    return 3;
  }
  if (!strcmp(mode, "tick")) {
    int on = ((int (*)(void *))vt(cu)[sOn])(cu) & 0xff;
    uint64_t sid = ((uint64_t(*)(void *))vt(cu)[sId])(cu);
    uint32_t st = ((uint32_t(*)(void *, uint32_t))vt(am)[sSt])(am, app);
    uint32_t n = ((uint32_t(*)(void *))vt(am)[sN])(am);
    printf("{\"loggedOn\":%d,\"steamId64\":\"%llu\",\"app\":%u,\"state\":%u,\"installed\":%u}\n", on,
           (unsigned long long)sid, app, st, n);
    return 0;
  }
  if (!strcmp(mode, "install")) {
    uint32_t err = ((uint32_t(*)(void *, uint32_t, int32_t, int))vt(am)[sIns])(am, app, 0, 0);
    printf("{\"step\":\"InstallApp\",\"app\":%u,\"ret\":%u}\n", app, err);
    return 0;
  }
  printf("{\"step\":\"usage\"}\n");
  return 64;
}
