// Spike 084: ask the running, signed-in Mac Steam client which apps the account owns, through
// steamclient.dylib's internal IClientUser, with no CM logon of our own.
//
// Attach path is 065/069's (CLIENTENGINE_INTERFACE_VERSION005 -> CreateSteamPipe ->
// ConnectToGlobalUser -> engine slot 8, RTTI-checked as IClientUserMap). Method slots are NOT taken
// from any header: every IClientUser slot's proxy is decoded for its IPC function ID
// (movz wN,#lo / movk wN,#hi,lsl #16, the 065 method) and a method is called only if exactly one
// slot carries the expected high half.
//
//   probe scan                    -> one JSON line per IClientUser slot: offset + decoded function ID
//   probe owned <flag> <outfile>  -> GetSubscribedApps(buf, max, flag); appids written one per line
//   probe check <appid>...        -> BIsSubscribedApp(appid) for each
//
// Read-only. Output is JSON lines on stdout.
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
    "/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS/steamclient.dylib";

enum { ENG_CreateSteamPipe = 0, ENG_ConnectToGlobalUser = 3, ENG_GetIClientUser = 8 };

// High halves of the IPC function IDs (OpenSteamClient dumped_data/IClientUserMap.json).
#define HI_BIsSubscribedApp 0x8d36
#define HI_GetSubscribedApps 0x8532
#define HI_GetSteamID 0xd6fc
#define HI_BLoggedOn 0x6585
#define MAX_SLOTS 400

static void **vt(void *obj) { return *(void ***)obj; }
static const char *rtti_name(void *obj) {
  if (!obj) return "(null)";
  void *ti = vt(obj)[-1];
  return ti ? *(const char **)((char *)ti + 8) : "(no typeinfo)";
}
static uintptr_t image_base(const char *needle) {
  for (uint32_t i = 0; i < _dyld_image_count(); i++)
    if (strstr(_dyld_get_image_name(i), needle)) return (uintptr_t)_dyld_get_image_header(i);
  return 0;
}
static int in_steamclient(void *p) {
  Dl_info di;
  return p && dladdr(p, &di) && di.dli_fname && strstr(di.dli_fname, "steamclient.dylib");
}
// First 32-bit movz/movk(lsl 16) pair on the same register within the proxy's first 64 words.
static int64_t decode_fid(void *fn) {
  const uint32_t *w = (const uint32_t *)fn;
  for (int i = 0; i < 64; i++) {
    if ((w[i] & 0xFFE00000u) != 0x52800000u) continue; // movz w, #imm16 (hw=0)
    uint32_t rd = w[i] & 31, lo = (w[i] >> 5) & 0xFFFF;
    for (int j = i + 1; j < i + 6 && j < 64; j++)
      if ((w[j] & 0xFFE00000u) == 0x72A00000u && (w[j] & 31) == rd) // movk w, #imm16, lsl 16
        return ((int64_t)((w[j] >> 5) & 0xFFFF) << 16) | lo;
  }
  return -1;
}

static int nslots;
static int64_t fids[MAX_SLOTS];

static int find_unique(uint32_t hi) {
  int hit = -1, n = 0;
  for (int i = 0; i < nslots; i++)
    if (fids[i] >= 0 && ((uint32_t)fids[i] >> 16) == hi) { hit = i; n++; }
  return n == 1 ? hit : -(n + 1); // -1: none, <=-2: ambiguous
}

int main(int argc, char **argv) {
  const char *mode = argc > 1 ? argv[1] : "scan";
  char path[1024];
  snprintf(path, sizeof path, "%s%s", getenv("HOME"), kSteamclient);
  void *lib = dlopen(path, RTLD_NOW | RTLD_LOCAL);
  if (!lib) { printf("{\"step\":\"dlopen\",\"ok\":false,\"err\":\"%s\"}\n", dlerror()); return 1; }
  CreateInterfaceFn ci = (CreateInterfaceFn)dlsym(lib, "CreateInterface");
  int rc = 0;
  void *engine = ci("CLIENTENGINE_INTERFACE_VERSION005", &rc);
  if (!engine) { printf("{\"step\":\"engine\",\"ok\":false}\n"); return 1; }
  HSteamPipe pipe = ((HSteamPipe(*)(void *))vt(engine)[ENG_CreateSteamPipe])(engine);
  if (!pipe) { printf("{\"step\":\"pipe\",\"ok\":false,\"why\":\"Steam not running?\"}\n"); return 1; }
  HSteamUser user = ((HSteamUser(*)(void *, HSteamPipe))vt(engine)[ENG_ConnectToGlobalUser])(engine, pipe);
  if (!user) { printf("{\"step\":\"user\",\"ok\":false,\"why\":\"no global user\"}\n"); return 1; }
  void *cu = ((void *(*)(void *, HSteamUser, HSteamPipe))vt(engine)[ENG_GetIClientUser])(engine, user, pipe);
  printf("{\"step\":\"attach\",\"engine\":\"%s\",\"pipe\":%d,\"user\":%d,\"clientUser\":\"%s\"}\n",
         rtti_name(engine), pipe, user, rtti_name(cu));
  if (!cu || !strstr(rtti_name(cu), "IClientUser")) {
    printf("{\"step\":\"guard\",\"ok\":false,\"why\":\"engine slot 8 is not IClientUser\"}\n");
    return 2;
  }

  uintptr_t base = image_base("steamclient.dylib");
  void **v = vt(cu);
  for (nslots = 0; nslots < MAX_SLOTS && in_steamclient(v[nslots]); nslots++) fids[nslots] = decode_fid(v[nslots]);

  if (!strcmp(mode, "scan")) {
    for (int i = 0; i < nslots; i++)
      printf("{\"slot\":%d,\"off\":\"0x%lx\",\"fid\":\"%s0x%llx\"}\n", i, (unsigned long)((uintptr_t)v[i] - base),
             fids[i] < 0 ? "-" : "", (unsigned long long)(fids[i] < 0 ? 0 : fids[i]));
    printf("{\"step\":\"scan\",\"slots\":%d}\n", nslots);
    return 0;
  }

  int sGet = find_unique(HI_GetSubscribedApps), sIs = find_unique(HI_BIsSubscribedApp);
  printf("{\"step\":\"resolve\",\"slots\":%d,\"GetSubscribedApps\":%d,\"BIsSubscribedApp\":%d}\n", nslots, sGet, sIs);

  if (!strcmp(mode, "owned") && argc > 3) {
    if (sGet < 0) { printf("{\"step\":\"guard\",\"ok\":false,\"why\":\"GetSubscribedApps not uniquely resolved\"}\n"); return 3; }
    int flag = atoi(argv[2]);
    uint32_t max = 200000;
    uint32_t *buf = calloc(max, sizeof *buf);
    uint32_t n = ((uint32_t(*)(void *, uint32_t *, uint32_t, int))v[sGet])(cu, buf, max, flag);
    FILE *f = fopen(argv[3], "w");
    uint32_t written = 0;
    for (uint32_t i = 0; i < n && i < max; i++) { fprintf(f, "%u\n", buf[i]); written++; }
    fclose(f);
    // Probe the size contract: does a short buffer return the full count or the copied count?
    uint32_t small[4] = {0};
    uint32_t n4 = ((uint32_t(*)(void *, uint32_t *, uint32_t, int))v[sGet])(cu, small, 4, flag);
    printf("{\"step\":\"GetSubscribedApps\",\"flag\":%d,\"ret\":%u,\"written\":%u,\"ret_with_max4\":%u,\"first\":[%u,%u,%u]}\n",
           flag, n, written, n4, buf[0], buf[1], buf[2]);
    return 0;
  }

  if (!strcmp(mode, "whoami")) {
    // Whose library is this? GameLib must refuse Steam's answer for a different account.
    int sId = find_unique(HI_GetSteamID), sOn = find_unique(HI_BLoggedOn);
    printf("{\"step\":\"resolve-whoami\",\"GetSteamID\":%d,\"BLoggedOn\":%d}\n", sId, sOn);
    if (sId < 0 || sOn < 0) return 3;
    uint64_t sid = ((uint64_t(*)(void *))v[sId])(cu); // CSteamID: 8-byte POD, returned in x0
    int on = ((int (*)(void *))v[sOn])(cu) & 0xff;
    printf("{\"step\":\"whoami\",\"steamId64\":\"%llu\",\"loggedOn\":%d}\n", (unsigned long long)sid, on);
    return 0;
  }

  if (!strcmp(mode, "check") && argc > 2) {
    if (sIs < 0) { printf("{\"step\":\"guard\",\"ok\":false,\"why\":\"BIsSubscribedApp not uniquely resolved\"}\n"); return 3; }
    for (int i = 2; i < argc; i++) {
      uint32_t app = (uint32_t)strtoul(argv[i], NULL, 10);
      int r = ((int (*)(void *, uint32_t))v[sIs])(cu, app) & 0xff;
      printf("{\"step\":\"BIsSubscribedApp\",\"appId\":%u,\"ret\":%d}\n", app, r);
    }
    return 0;
  }
  printf("{\"step\":\"usage\"}\n");
  return 64;
}
