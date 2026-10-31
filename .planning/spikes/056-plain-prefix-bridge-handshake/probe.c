/*
 * Spike 056 probe: a game-shaped PE that imports the bridge shim the way a real title does
 * (SteamAPI_Init -> SteamAPI_SteamUser_v023() -> vtable), built for x86 and x64. It never links Valve code;
 * it links the shipped shim's import lib. Result -> probe.txt beside the exe (stdout can detach).
 * Vtable slots match native/steam-bridge/generated/bridge_dispatch.h (ISteamUser v023:
 * BLoggedOn=1, GetSteamID=2 via MSVC sret -- vt_SteamUser023_GetSteamID(self, sretOut)).
 */
#include <windows.h>
#include <stdio.h>
#include <stdint.h>
#include <string.h>

__declspec(dllimport) int __cdecl SteamAPI_Init(void);
__declspec(dllimport) void __cdecl SteamAPI_Shutdown(void);
__declspec(dllimport) void *__cdecl SteamAPI_SteamUser_v023(void);

#ifdef _WIN64
typedef int (*bloggedon_fn)(void *);
typedef void *(*getsteamid_fn)(void *, uint64_t *);
#define ARCH "x64"
#else
typedef int (__attribute__((thiscall)) *bloggedon_fn)(void *);
typedef void *(__attribute__((thiscall)) *getsteamid_fn)(void *, uint64_t *);
#define ARCH "x86"
#endif

int main(void) {
  char out[MAX_PATH]; GetModuleFileNameA(NULL, out, sizeof out);
  strcpy(strrchr(out, '\\') + 1, "probe.txt");
  FILE *f = fopen(out, "w"); if (!f) return 2;
  fprintf(f, "arch=%s\n", ARCH); fflush(f);
  int ok = SteamAPI_Init();
  fprintf(f, "init=%d\n", ok); fflush(f);
  void *u = ok ? SteamAPI_SteamUser_v023() : NULL;
  fprintf(f, "steamuser=%s\n", u ? "non-null" : "null"); fflush(f);
  if (u) {
    void **vt = *(void ***)u;
    int lo = ((bloggedon_fn)vt[1])(u);
    uint64_t id = 0; ((getsteamid_fn)vt[2])(u, &id); /* MSVC sret: CSteamID by hidden pointer */
    fprintf(f, "bloggedon=%d\nsteamid=%llu\n", lo, (unsigned long long)id);
  }
  SteamAPI_Shutdown();
  fprintf(f, "result=%s\n", (ok && u) ? "OK" : "FAIL");
  fclose(f);
  return 0;
}
