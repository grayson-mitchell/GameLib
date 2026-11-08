// Spike 069 (from 065/066/067): attach to the running native macOS Steam client through
// steamclient.dylib's internal IClientEngine and call IClientAppManager.
//
// Vtable order comes from OpenSteamClient's include/opensteamworks headers
// (IClientEngine.h, IClientAppManager.h). It is NOT verified for this Steam
// build, so every interface pointer is checked by its Itanium RTTI type name
// before any method on it is called, and the first calls are read-only.
//
//   probe status <appId>          -> read-only: install state, up-to-date, beta, update info
//   probe install <appId> [folder] -> InstallApp(appId, folder, false)
//   probe setbeta <appId> [branch] -> SetActiveBeta ("" = public)
//   probe autoupdate <appId> <n>   -> SetAppAutoUpdateBehavior (0 always, 1 on launch, 2 high prio)
//   probe validate <appId>         -> StartValidatingApp
//   probe queue <appId> <placement> -> ChangeAppDownloadQueuePlacement
//
// Output is one JSON object per line on stdout.
#include <dlfcn.h>
#include <mach-o/dyld.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef int32_t HSteamPipe;
typedef int32_t HSteamUser;
typedef void *(*CreateInterfaceFn)(const char *, int *);

static const char *kSteamclient =
    "/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/"
    "MacOS/steamclient.dylib";

// IClientEngine slots (OpenSteamClient IClientEngine.h order).
enum {
  ENG_CreateSteamPipe = 0,
  ENG_BReleaseSteamPipe = 1,
  ENG_ConnectToGlobalUser = 3,
  ENG_ReleaseUser = 6,
  ENG_GetIClientUser = 8,
  ENG_GetIClientUtils = 14,
  ENG_GetIClientAppManager = 43, // header says 45; RTTI-verified 43 on Steam build of 2026-10-22
};

// IClientAppManager slots. Each was matched by its proxy's IPC function-ID high half
// (066 slotmap.txt, same steamclient build 2026-10-22); arg shapes from
// OpenSteamClient dumped_data/IClientAppManagerMap.json.
enum {
  APM_InstallApp = 0,
  APM_GetAppInstallState = 4,
  APM_GetNumInstalledApps = 15,
  APM_GetUpdateInfo = 20,          // (appId, AppUpdateInfo_s*) -> bool; 120-byte struct
  APM_BIsAppUpToDate = 21,         // (appId) -> bool
  APM_StartValidatingApp = 27,     // (appId) -> bool
  APM_SetActiveBeta = 36,          // (appId, const char*) -> bool
  APM_GetActiveBeta = 37,          // (appId, char*, int) -> bool
  APM_GetDownloadingAppID = 42,    // () -> appId
  APM_GetAppAutoUpdateBehavior = 48, // (appId) -> enum
  APM_SetAppAutoUpdateBehavior = 49, // (appId, enum) -> bool
  APM_ChangeAppDownloadQueuePlacement = 56, // (appId, EAppDownloadQueuePlacement) -> bool
  APM_GetAppDownloadQueueIndex = 58,        // (appId) -> int
  APM_GetAppAutoUpdateDelayedUntilTime = 59, // (appId) -> RTime32
};

static void **vt(void *obj) { return *(void ***)obj; }

static const char *rtti_name(void *obj) {
  if (!obj) return "(null)";
  void **vtable = vt(obj);
  void *ti = vtable[-1];
  if (!ti) return "(no typeinfo)";
  return *(const char **)((char *)ti + 8);
}

int main(int argc, char **argv) {
  const char *mode = argc > 1 ? argv[1] : "attach";
  char path[1024];
  snprintf(path, sizeof path, "%s%s", getenv("HOME"), kSteamclient);

  void *lib = dlopen(path, RTLD_NOW | RTLD_LOCAL);
  if (!lib) {
    printf("{\"step\":\"dlopen\",\"ok\":false,\"err\":\"%s\"}\n", dlerror());
    return 1;
  }
  CreateInterfaceFn ci = (CreateInterfaceFn)dlsym(lib, "CreateInterface");
  int rc = 0;
  void *engine = ci("CLIENTENGINE_INTERFACE_VERSION005", &rc);
  printf("{\"step\":\"engine\",\"ok\":%s,\"rc\":%d,\"rtti\":\"%s\"}\n",
         engine ? "true" : "false", rc, rtti_name(engine));
  if (!engine) return 1;
  fflush(stdout);

  HSteamPipe pipe = ((HSteamPipe(*)(void *))vt(engine)[ENG_CreateSteamPipe])(engine);
  printf("{\"step\":\"pipe\",\"pipe\":%d}\n", pipe);
  fflush(stdout);
  if (!pipe) return 1;
  HSteamUser user = ((HSteamUser(*)(void *, HSteamPipe))vt(engine)[ENG_ConnectToGlobalUser])(engine, pipe);
  printf("{\"step\":\"user\",\"user\":%d}\n", user);
  fflush(stdout);
  if (!user) return 1;

  void *cuser = ((void *(*)(void *, HSteamUser, HSteamPipe))vt(engine)[ENG_GetIClientUser])(engine, user, pipe);
  void *cutils = ((void *(*)(void *, HSteamPipe))vt(engine)[ENG_GetIClientUtils])(engine, pipe);
  void *apm = ((void *(*)(void *, HSteamUser, HSteamPipe))vt(engine)[ENG_GetIClientAppManager])(engine, user, pipe);
  printf("{\"step\":\"rtti\",\"clientUser\":\"%s\",\"clientUtils\":\"%s\",\"appManager\":\"%s\"}\n",
         rtti_name(cuser), rtti_name(cutils), rtti_name(apm));
  fflush(stdout);

  if (!apm || !strstr(rtti_name(apm), "IClientAppManager")) {
    printf("{\"step\":\"guard\",\"ok\":false,\"why\":\"slot 43 is not IClientAppManager\"}\n");
    return 2;
  }


  #define FN(slot, T) ((T)vt(apm)[slot])
  if (!strcmp(mode, "status") && argc > 2) {
    uint32_t appId = (uint32_t)strtoul(argv[2], NULL, 10);
    uint32_t st = FN(APM_GetAppInstallState, uint32_t (*)(void *, uint32_t))(apm, appId);
    int upToDate = FN(APM_BIsAppUpToDate, int (*)(void *, uint32_t))(apm, appId) & 0xff;
    char beta[256] = {0};
    int betaOk = FN(APM_GetActiveBeta, int (*)(void *, uint32_t, char *, int))(apm, appId, beta, sizeof beta) & 0xff;
    uint32_t aub = FN(APM_GetAppAutoUpdateBehavior, uint32_t (*)(void *, uint32_t))(apm, appId);
    uint32_t dl = FN(APM_GetDownloadingAppID, uint32_t (*)(void *))(apm);
    int32_t qi = FN(APM_GetAppDownloadQueueIndex, int32_t (*)(void *, uint32_t))(apm, appId);
    uint32_t delayed = FN(APM_GetAppAutoUpdateDelayedUntilTime, uint32_t (*)(void *, uint32_t))(apm, appId);
    uint8_t info[1024];
    memset(info, 0, sizeof info);
    int uiOk = FN(APM_GetUpdateInfo, int (*)(void *, uint32_t, void *))(apm, appId, info) & 0xff;
    // AppUpdateInfo_s per OpenSteamClient: u32 start, u32 state, then u64 counters (8-aligned).
    uint32_t start = *(uint32_t *)(info + 0), ustate = *(uint32_t *)(info + 4);
    uint64_t *q = (uint64_t *)(info + 8);
    printf("{\"step\":\"status\",\"appId\":%u,\"installState\":%u,\"upToDate\":%d,\"activeBeta\":\"%s\",\"betaOk\":%d,"
           "\"autoUpdateBehavior\":%u,\"downloadingAppId\":%u,\"queueIndex\":%d,\"delayedUntil\":%u,"
           "\"updateInfoOk\":%d,\"timeUpdateStart\":%u,\"updateState\":%u,\"bytesToDownload\":%llu,\"bytesDownloaded\":%llu,"
           "\"bytesToProcess\":%llu,\"bytesProcessed\":%llu,\"raw\":\"",
           appId, st, upToDate, beta, betaOk, aub, dl, qi, delayed, uiOk, start, ustate,
           (unsigned long long)q[0], (unsigned long long)q[1], (unsigned long long)q[2], (unsigned long long)q[3]);
    for (int i = 0; i < 160; i++) printf("%02x", info[i]);
    printf("\"}\n");
    return 0;
  }

  if (!strcmp(mode, "install") && argc > 2) {
    uint32_t appId = (uint32_t)strtoul(argv[2], NULL, 10);
    int32_t folder = argc > 3 ? atoi(argv[3]) : 0;
    uint32_t err = FN(APM_InstallApp, uint32_t (*)(void *, uint32_t, int32_t, int))(apm, appId, folder, 0);
    printf("{\"step\":\"InstallApp\",\"appId\":%u,\"folder\":%d,\"EAppUpdateError\":%u}\n", appId, folder, err);
    return 0;
  }

  if (!strcmp(mode, "setbeta") && argc > 2) {
    uint32_t appId = (uint32_t)strtoul(argv[2], NULL, 10);
    const char *b = argc > 3 ? argv[3] : "";
    int ok = FN(APM_SetActiveBeta, int (*)(void *, uint32_t, const char *))(apm, appId, b) & 0xff;
    printf("{\"step\":\"SetActiveBeta\",\"appId\":%u,\"beta\":\"%s\",\"ret\":%d}\n", appId, b, ok);
    return 0;
  }

  if (!strcmp(mode, "autoupdate") && argc > 3) {
    uint32_t appId = (uint32_t)strtoul(argv[2], NULL, 10);
    uint32_t v = (uint32_t)strtoul(argv[3], NULL, 10);
    int ok = FN(APM_SetAppAutoUpdateBehavior, int (*)(void *, uint32_t, uint32_t))(apm, appId, v) & 0xff;
    printf("{\"step\":\"SetAppAutoUpdateBehavior\",\"appId\":%u,\"value\":%u,\"ret\":%d}\n", appId, v, ok);
    return 0;
  }

  if (!strcmp(mode, "validate") && argc > 2) {
    uint32_t appId = (uint32_t)strtoul(argv[2], NULL, 10);
    int ok = FN(APM_StartValidatingApp, int (*)(void *, uint32_t))(apm, appId) & 0xff;
    printf("{\"step\":\"StartValidatingApp\",\"appId\":%u,\"ret\":%d}\n", appId, ok);
    return 0;
  }

  if (!strcmp(mode, "queue") && argc > 3) {
    uint32_t appId = (uint32_t)strtoul(argv[2], NULL, 10);
    uint32_t p = (uint32_t)strtoul(argv[3], NULL, 10);
    int ok = FN(APM_ChangeAppDownloadQueuePlacement, int (*)(void *, uint32_t, uint32_t))(apm, appId, p) & 0xff;
    printf("{\"step\":\"ChangeAppDownloadQueuePlacement\",\"appId\":%u,\"placement\":%u,\"ret\":%d}\n", appId, p, ok);
    return 0;
  }

  printf("{\"step\":\"usage\",\"ok\":false}\n");
  return 64;
}
