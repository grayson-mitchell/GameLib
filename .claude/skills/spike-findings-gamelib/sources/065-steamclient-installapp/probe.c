// Spike 065: attach to the running native macOS Steam client through
// steamclient.dylib's internal IClientEngine and call IClientAppManager.
//
// Vtable order comes from OpenSteamClient's include/opensteamworks headers
// (IClientEngine.h, IClientAppManager.h). It is NOT verified for this Steam
// build, so every interface pointer is checked by its Itanium RTTI type name
// before any method on it is called, and the first calls are read-only.
//
//   probe attach              -> RTTI names + read-only calls, no side effects
//   probe vtable              -> dump IClientAppManager vtable slot offsets
//   probe install <appId> [folderIndex]
//                             -> IClientAppManager::InstallApp(appId, folder, false)
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

// IClientAppManager slots (OpenSteamClient IClientAppManager.h order).
enum {
  APM_InstallApp = 0,
  APM_GetAppInstallState = 4,
  APM_GetAppInstallDir = 5,
  APM_GetNumInstalledApps = 15, // header says 14; a new method sits at slot 8 in this build
};

static void **vt(void *obj) { return *(void ***)obj; }

static const char *rtti_name(void *obj) {
  if (!obj) return "(null)";
  void **vtable = vt(obj);
  void *ti = vtable[-1];
  if (!ti) return "(no typeinfo)";
  return *(const char **)((char *)ti + 8);
}

static uintptr_t image_base(const char *needle) {
  for (uint32_t i = 0; i < _dyld_image_count(); i++)
    if (strstr(_dyld_get_image_name(i), needle))
      return (uintptr_t)_dyld_get_image_header(i);
  return 0;
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

  // Cross-check the engine slot table on two neighbours before trusting 45.
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

  if (!strcmp(mode, "vtable")) {
    uintptr_t base = image_base("steamclient.dylib");
    void **v = vt(apm);
    for (int i = 0; i < 24; i++)
      printf("{\"slot\":%d,\"off\":\"0x%lx\"}\n", i, (unsigned long)((uintptr_t)v[i] - base));
    return 0;
  }

  if (!strcmp(mode, "attach")) {
    uint32_t n = ((uint32_t(*)(void *))vt(apm)[APM_GetNumInstalledApps])(apm);
    printf("{\"step\":\"GetNumInstalledApps\",\"value\":%u}\n", n);
    fflush(stdout);
    uint32_t ids[] = {440, 264160};
    for (int i = 0; i < 2; i++) {
      uint32_t st = ((uint32_t(*)(void *, uint32_t))vt(apm)[APM_GetAppInstallState])(apm, ids[i]);
      char dir[1024] = {0};
      uint32_t r = ((uint32_t(*)(void *, uint32_t, char *, uint32_t))vt(apm)[APM_GetAppInstallDir])(apm, ids[i], dir, sizeof dir);
      printf("{\"step\":\"app\",\"appId\":%u,\"installState\":%u,\"dirRet\":%u,\"dir\":\"%s\"}\n", ids[i], st, r, dir);
      fflush(stdout);
    }
    return 0;
  }

  if (!strcmp(mode, "install") && argc > 2) {
    uint32_t appId = (uint32_t)strtoul(argv[2], NULL, 10);
    int32_t folder = argc > 3 ? atoi(argv[3]) : 0;
    uint32_t err = ((uint32_t(*)(void *, uint32_t, int32_t, int))vt(apm)[APM_InstallApp])(apm, appId, folder, 0);
    printf("{\"step\":\"InstallApp\",\"appId\":%u,\"folder\":%d,\"EAppUpdateError\":%u}\n", appId, folder, err);
    return 0;
  }

  printf("{\"step\":\"usage\",\"ok\":false}\n");
  return 64;
}
