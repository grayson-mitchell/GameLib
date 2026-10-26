/*
 * Spike 034a: a generic, data-parameterised shim feature, compiled BESIDE the unmodified generated
 * native/steam-bridge/generated/steam_api_shim.c with the shipping release flags (-O2, UBSan off).
 *
 * Feature lines live in the same gamelib_bridge.cfg the backend already writes beside every placed
 * shim (bridgeConfig.ts). The shim's own loader (load_bridge_port_once) reads that file lazily at the
 * first Steam call, which is too late for a hook that must be in place before the game creates its GL
 * context, so this module reads the cfg once more at DLL_PROCESS_ATTACH and only looks at `fix.` lines:
 *
 *   fix.wgl.hideExtensions=<pattern>[,<pattern>...]
 *       Drop matching tokens from wglGetExtensionsString{ARB,EXT}. A pattern is an exact token, or a
 *       prefix ending in '*'. Nothing about any particular game: Hoard's profile just passes
 *       `WGL_ARB_create_context*` (spike 030/033).
 *
 * No `fix.` line = no hook installed at all (the IAT is never touched).
 * Logged to `gamelib_shimfix.log` beside this DLL (spike only).
 */
#include <windows.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>

#define CFG_NAME "gamelib_bridge.cfg"
#define LOG_NAME "gamelib_shimfix.log"
#define CFG_READ_MAX 8192
#define MAX_PATTERNS 16
#define MAX_PATTERN_BYTES 64

static FILE *g_log;
static char g_patterns[MAX_PATTERNS][MAX_PATTERN_BYTES];
static int g_npatterns;

static void flog(const char *fmt, ...) {
  if (!g_log) return;
  va_list ap; va_start(ap, fmt);
  vfprintf(g_log, fmt, ap); fputc('\n', g_log); fflush(g_log);
  va_end(ap);
}

/* Path of a file beside THIS module (same resolution as the shim's load_bridge_port_once). */
static int beside_self(const char *name, char *out, DWORD cap) {
  HMODULE self = NULL;
  if (!GetModuleHandleExA(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                          (LPCSTR)&beside_self, &self)) return 0;
  DWORD n = GetModuleFileNameA(self, out, cap);
  if (n == 0 || n >= cap) return 0;
  char *slash = strrchr(out, '\\');
  char *file = slash ? slash + 1 : out;
  if ((size_t)(file - out) + strlen(name) >= cap) return 0;
  strcpy(file, name);
  return 1;
}

/* ---------------- cfg: fix.* lines ---------------- */

static void add_patterns(const char *v, size_t len) {
  size_t i = 0;
  while (i < len && g_npatterns < MAX_PATTERNS) {
    size_t s = i;
    while (i < len && v[i] != ',') i++;
    size_t n = i - s;
    while (n && v[s] == ' ') { s++; n--; }
    while (n && v[s + n - 1] == ' ') n--;
    if (n > 0 && n < MAX_PATTERN_BYTES) { memcpy(g_patterns[g_npatterns], v + s, n); g_patterns[g_npatterns++][n] = 0; }
    else if (n) flog("cfg: pattern too long (%u bytes), ignored", (unsigned)n);
    i++;
  }
}

static void read_fix_lines(void) {
  char path[MAX_PATH];
  if (!beside_self(CFG_NAME, path, sizeof path)) return;
  FILE *f = fopen(path, "rb");
  if (!f) { flog("cfg: %s not found, no fixes", path); return; }
  static char buf[CFG_READ_MAX];
  size_t len = fread(buf, 1, sizeof buf, f);
  fclose(f);
  static const char key[] = "fix.wgl.hideExtensions=";
  size_t i = 0;
  while (i < len) {
    size_t s = i;
    while (i < len && buf[i] != '\n' && buf[i] != '\r') i++;
    size_t n = i - s;
    if (n > sizeof key - 1 && memcmp(buf + s, key, sizeof key - 1) == 0)
      add_patterns(buf + s + sizeof key - 1, n - (sizeof key - 1));
    else if (n > 4 && memcmp(buf + s, "fix.", 4) == 0)
      flog("cfg: unknown fix line ignored: %.*s", (int)n, buf + s);
    while (i < len && (buf[i] == '\n' || buf[i] == '\r')) i++;
  }
}

/* ---------------- IAT hook ---------------- */

static void **find_iat_slot(HMODULE mod, const char *dll, const char *func) {
  BYTE *base = (BYTE *)mod;
  IMAGE_NT_HEADERS *nt = (IMAGE_NT_HEADERS *)(base + ((IMAGE_DOS_HEADER *)base)->e_lfanew);
  IMAGE_DATA_DIRECTORY dir = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT];
  if (!dir.VirtualAddress) return NULL;
  for (IMAGE_IMPORT_DESCRIPTOR *d = (IMAGE_IMPORT_DESCRIPTOR *)(base + dir.VirtualAddress); d->Name; d++) {
    if (_stricmp((const char *)(base + d->Name), dll) != 0) continue;
    IMAGE_THUNK_DATA *names = (IMAGE_THUNK_DATA *)(base + (d->OriginalFirstThunk ? d->OriginalFirstThunk : d->FirstThunk));
    IMAGE_THUNK_DATA *iat = (IMAGE_THUNK_DATA *)(base + d->FirstThunk);
    for (; names->u1.AddressOfData; names++, iat++) {
      if (IMAGE_SNAP_BY_ORDINAL(names->u1.Ordinal)) continue;
      IMAGE_IMPORT_BY_NAME *ibn = (IMAGE_IMPORT_BY_NAME *)(base + names->u1.AddressOfData);
      if (strcmp((const char *)ibn->Name, func) == 0) return (void **)&iat->u1.Function;
    }
  }
  return NULL;
}

static int hook(HMODULE mod, const char *dll, const char *func, void *repl, void **orig) {
  void **slot = find_iat_slot(mod, dll, func);
  if (!slot) { flog("hook %s!%s: not imported by the exe, feature inactive", dll, func); return 0; }
  DWORD old;
  if (!VirtualProtect(slot, sizeof *slot, PAGE_READWRITE, &old)) { flog("hook %s!%s: VirtualProtect failed", dll, func); return 0; }
  *orig = *slot; *slot = repl;
  VirtualProtect(slot, sizeof *slot, old, &old);
  flog("hook %s!%s: ok", dll, func);
  return 1;
}

/* ---------------- wgl.hideExtensions ---------------- */

typedef PROC(WINAPI *PFN_wglGetProcAddress)(LPCSTR);
typedef const char *(WINAPI *PFN_extARB)(HDC);
typedef const char *(WINAPI *PFN_extEXT)(void);
static PFN_wglGetProcAddress real_wglGetProcAddress;
static PFN_extARB real_extARB;
static PFN_extEXT real_extEXT;
static char g_bufARB[16384], g_bufEXT[16384];

static int token_hidden(const char *t, size_t n) {
  for (int i = 0; i < g_npatterns; i++) {
    const char *p = g_patterns[i];
    size_t pl = strlen(p);
    if (pl && p[pl - 1] == '*') { if (n >= pl - 1 && strncmp(t, p, pl - 1) == 0) return 1; }
    else if (n == pl && strncmp(t, p, n) == 0) return 1;
  }
  return 0;
}

static const char *filter_exts(const char *s, char *out, size_t cap, const char *which) {
  if (!s) return s;
  size_t o = 0; int dropped = 0, overflow = 0;
  while (*s) {
    while (*s == ' ') s++;
    const char *e = s; while (*e && *e != ' ') e++;
    size_t n = (size_t)(e - s);
    if (n == 0) break;
    if (token_hidden(s, n)) { dropped++; flog("wgl: %s hid %.*s", which, (int)n, s); }
    else if (o + n + 2 < cap) { if (o) out[o++] = ' '; memcpy(out + o, s, n); o += n; }
    else overflow = 1;
    s = e;
  }
  out[o] = 0;
  if (overflow) flog("wgl: %s extension string exceeded %u bytes, truncated", which, (unsigned)cap);
  flog("wgl: %s dropped %d token(s)", which, dropped);
  return out;
}
static const char *WINAPI my_extARB(HDC hdc) { return filter_exts(real_extARB(hdc), g_bufARB, sizeof g_bufARB, "ARB"); }
static const char *WINAPI my_extEXT(void) { return filter_exts(real_extEXT(), g_bufEXT, sizeof g_bufEXT, "EXT"); }

static PROC WINAPI my_wglGetProcAddress(LPCSTR name) {
  PROC p = real_wglGetProcAddress(name);
  if (!p || !name || ((ULONG_PTR)name >> 16) == 0) return p; /* ordinal lookups pass through */
  if (strcmp(name, "wglGetExtensionsStringARB") == 0) { real_extARB = (PFN_extARB)p; return (PROC)my_extARB; }
  if (strcmp(name, "wglGetExtensionsStringEXT") == 0) { real_extEXT = (PFN_extEXT)p; return (PROC)my_extEXT; }
  return p;
}

/* ---------------- attach ---------------- */

static void shim_features_attach(void) {
  char lp[MAX_PATH];
  if (beside_self(LOG_NAME, lp, sizeof lp)) g_log = fopen(lp, "w");
  read_fix_lines();
  flog("attach: %d wgl.hideExtensions pattern(s)", g_npatterns);
  for (int i = 0; i < g_npatterns; i++) flog("  pattern[%d]=%s", i, g_patterns[i]);
  if (g_npatterns)
    hook(GetModuleHandleW(NULL), "OPENGL32.dll", "wglGetProcAddress", (void *)my_wglGetProcAddress, (void **)&real_wglGetProcAddress);
}

BOOL WINAPI DllMain(HINSTANCE inst, DWORD reason, LPVOID reserved) {
  (void)inst; (void)reserved;
  if (reason == DLL_PROCESS_ATTACH) shim_features_attach();
  else if (reason == DLL_PROCESS_DETACH && g_log) { fclose(g_log); g_log = NULL; }
  return TRUE;
}
