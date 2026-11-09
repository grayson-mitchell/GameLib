/* Spike 039: forwarding steamclient64.dll for SteamStub. It answers nothing itself: CreateInterface
 * hands back the game's own GameLib shim (steam_api64.dll, loaded from the exe's directory) via its
 * SteamInternal_CreateInterface, so every ISteamClient call rides the shim's existing proxies to the
 * helper and the genuine signed-in Mac client. Logs only which interface names were requested. */
#include <windows.h>
#include <stdio.h>
typedef void *(*SICI)(const char *);
static SICI g_sici;
static void logf_(const char *fmt, const char *a, void *p) {
  FILE *f = fopen("C:\\steamclient039.log", "a");
  if (f) { fprintf(f, fmt, a, p); fputc('\n', f); fclose(f); }
}
static SICI shim(void) {
  if (g_sici) return g_sici;
  wchar_t path[MAX_PATH]; DWORD n = GetModuleFileNameW(NULL, path, MAX_PATH);
  while (n && path[n - 1] != L'\\') n--;
  path[n] = 0; wcscat(path, L"steam_api64.dll");
  HMODULE h = LoadLibraryW(path);
  g_sici = h ? (SICI)GetProcAddress(h, "SteamInternal_CreateInterface") : NULL;
  logf_("shim steam_api64.dll -> %s %p", g_sici ? "ok" : "MISSING", (void *)h);
  return g_sici;
}
__declspec(dllexport) void *CreateInterface(const char *name, int *rc) {
  SICI f = shim();
  void *r = f ? f(name) : NULL;
  logf_("CreateInterface(%s) -> %p", name ? name : "(null)", r);
  if (rc) *rc = r ? 0 : 1;
  return r;
}
