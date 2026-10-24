/* Phase 52 (52-03), ROADMAP Scope 2: x64 forwarding steamclient64.dll for SteamStub titles.
 *
 * This DLL answers NOTHING itself. CreateInterface hands every request to
 * GameLibBridge_CreateInterface exported by the game's already-loaded GameLib shim
 * (steam_api64.dll), so the whole game process keeps ONE helper connection. The locked
 * boundary forbids adding any local answer, logging fake client or stand-in here: the only
 * thing this file may return is what the shim (and through it the genuine client) returns.
 */
#include <windows.h>
#include <wchar.h>

typedef void *(*BridgeCreateInterfaceFn)(const char *, int *);

static BridgeCreateInterfaceFn g_fn;

static HMODULE load_sibling_shim(void) {
  static const wchar_t kName[] = L"steam_api64.dll";
  HMODULE self = NULL;
  wchar_t path[MAX_PATH];
  DWORD n;
  if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
                              GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                          (LPCWSTR)&load_sibling_shim, &self))
    return NULL;
  n = GetModuleFileNameW(self, path, MAX_PATH);
  /* 0 = failure; n == MAX_PATH = truncated. Either way, refuse. */
  if (n == 0 || n >= MAX_PATH) return NULL;
  while (n && path[n - 1] != L'\\') n--;
  /* Bound the concatenation: directory prefix plus name plus terminator must fit. */
  if (n + (sizeof(kName) / sizeof(kName[0])) > MAX_PATH) return NULL;
  wmemcpy(path + n, kName, sizeof(kName) / sizeof(kName[0]));
  return LoadLibraryW(path);
}

static BridgeCreateInterfaceFn resolve(void) {
  HMODULE h;
  if (g_fn) return g_fn;
  /* The instance the game already loaded: one module, one helper connection. */
  h = GetModuleHandleW(L"steam_api64.dll");
  if (!h) h = load_sibling_shim();
  if (!h) return NULL;
  g_fn = (BridgeCreateInterfaceFn)GetProcAddress(h, "GameLibBridge_CreateInterface");
  return g_fn;
}

__declspec(dllexport) void *CreateInterface(const char *name, int *rc) {
  BridgeCreateInterfaceFn f = name ? resolve() : NULL;
  void *result;
  if (!f) {
    if (rc) *rc = 1;
    return NULL;
  }
  result = f(name, rc);
  if (rc) *rc = result ? 0 : 1;
  return result;
}
