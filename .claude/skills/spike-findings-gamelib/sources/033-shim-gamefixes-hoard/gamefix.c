/*
 * Spike 033: per-game fixes applied from inside GameLib's steam_api.dll shim, by redirecting the
 * game EXE's own import-table (IAT) slots at DLL_PROCESS_ATTACH. Game files on disk are untouched.
 * Compiled beside the unmodified generated native/steam-bridge/generated/steam_api_shim.c.
 *
 *   GAMELIB_FIX_WGL=1        hide WGL_ARB_create_context* from wglGetExtensionsString{ARB,EXT}
 *                            so GLEW-era engines take their legacy-context path (spike 030).
 *   GAMELIB_FIX_SEEKCACHE=1  answer SetFilePointerEx in user space for read-only, synchronous disk
 *                            handles; sync the real pointer lazily before each ReadFile (spike 030
 *                            follow-up: ~165 seeks per read, each two wine syscalls under Rosetta).
 *   GAMELIB_FIX_PROFILE=1    sampling profiler: every 10 ms suspend the main thread, record its EIP and
 *                            the first Reuben.exe return address up its EBP chain -- only while no frame
 *                            has been presented for >2 s, so the histogram covers just the freeze.
 *   (always)                 frame-gap meter on GDI32!SwapBuffers -- the "freeze" made measurable.
 *
 * Everything is logged to C:\gamefix033.log.
 */
#include <windows.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Win32 x86 code legally hands us 4-byte-aligned LARGE_INTEGER pointers and by-value LARGE_INTEGERs
 * (MSVC x86 ABI); zig's default Debug build enables UBSan, whose alignment check panics on them
 * (measured, run C). Disable ONLY the alignment check, for this file's functions. */
#pragma clang attribute push(__attribute__((no_sanitize("alignment"))), apply_to = function)

static FILE *g_log;
static LARGE_INTEGER g_qpf, g_t0;

static double now_s(void) {
  LARGE_INTEGER t; QueryPerformanceCounter(&t);
  return (double)(t.QuadPart - g_t0.QuadPart) / (double)g_qpf.QuadPart;
}

static void glog(const char *fmt, ...) {
  if (!g_log) return;
  va_list ap; va_start(ap, fmt);
  fprintf(g_log, "[%8.3f] ", now_s()); vfprintf(g_log, fmt, ap); fputc('\n', g_log);
  va_end(ap); fflush(g_log);
}

static int env_on(const char *name) {
  char v[8]; DWORD n = GetEnvironmentVariableA(name, v, sizeof v);
  return n > 0 && n < sizeof v && v[0] == '1';
}

/* Find the IAT slot of `dll!func` (imported by name) in `mod`. */
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
  if (!slot) { glog("hook %s!%s: NOT IMPORTED", dll, func); return 0; }
  DWORD old;
  if (!VirtualProtect(slot, sizeof *slot, PAGE_READWRITE, &old)) { glog("hook %s!%s: VirtualProtect failed", dll, func); return 0; }
  *orig = *slot; *slot = repl;
  VirtualProtect(slot, sizeof *slot, old, &old);
  glog("hook %s!%s: ok (orig %p)", dll, func, *orig);
  return 1;
}

/* ---------------- fix 1: hide WGL_ARB_create_context ---------------- */

typedef PROC(WINAPI *PFN_wglGetProcAddress)(LPCSTR);
typedef const char *(WINAPI *PFN_extARB)(HDC);
typedef const char *(WINAPI *PFN_extEXT)(void);
static PFN_wglGetProcAddress real_wglGetProcAddress;
static PFN_extARB real_extARB;
static PFN_extEXT real_extEXT;
static char g_extbuf[16384];

static const char *filter_wgl_exts(const char *s) {
  if (!s) return s;
  size_t o = 0; int dropped = 0;
  while (*s) {
    while (*s == ' ') s++;
    const char *e = s; while (*e && *e != ' ') e++;
    size_t n = (size_t)(e - s);
    if (n == 0) break;
    if (n >= 22 && strncmp(s, "WGL_ARB_create_context", 22) == 0) dropped++;
    else if (o + n + 2 < sizeof g_extbuf) { if (o) g_extbuf[o++] = ' '; memcpy(g_extbuf + o, s, n); o += n; }
    s = e;
  }
  g_extbuf[o] = 0;
  static int logged;
  if (!logged++) glog("wgl: filtered extension string, dropped %d WGL_ARB_create_context* token(s)", dropped);
  return g_extbuf;
}
static const char *WINAPI my_extARB(HDC hdc) { return filter_wgl_exts(real_extARB(hdc)); }
static const char *WINAPI my_extEXT(void) { return filter_wgl_exts(real_extEXT()); }

static PROC WINAPI my_wglGetProcAddress(LPCSTR name) {
  PROC p = real_wglGetProcAddress(name);
  if (!p || !name) return p;
  if (strcmp(name, "wglGetExtensionsStringARB") == 0) { real_extARB = (PFN_extARB)p; return (PROC)my_extARB; }
  if (strcmp(name, "wglGetExtensionsStringEXT") == 0) { real_extEXT = (PFN_extEXT)p; return (PROC)my_extEXT; }
  return p;
}

/* ---------------- fix 2: user-space seek cache ---------------- */

typedef HANDLE(WINAPI *PFN_CreateFileW)(LPCWSTR, DWORD, DWORD, LPSECURITY_ATTRIBUTES, DWORD, DWORD, HANDLE);
typedef HANDLE(WINAPI *PFN_CreateFileA)(LPCSTR, DWORD, DWORD, LPSECURITY_ATTRIBUTES, DWORD, DWORD, HANDLE);
typedef BOOL(WINAPI *PFN_SetFilePointerEx)(HANDLE, LARGE_INTEGER, PLARGE_INTEGER, DWORD);
typedef BOOL(WINAPI *PFN_ReadFile)(HANDLE, LPVOID, DWORD, LPDWORD, LPOVERLAPPED);
typedef BOOL(WINAPI *PFN_CloseHandle)(HANDLE);
static PFN_CreateFileW real_CreateFileW;
static PFN_CreateFileA real_CreateFileA;
static PFN_SetFilePointerEx real_SetFilePointerEx;
static PFN_ReadFile real_ReadFile;
static PFN_CloseHandle real_CloseHandle;

#define NFS 1024
typedef struct { HANDLE h; LONGLONG size, virt, real; } FileState;
static FileState g_fs[NFS];
static CRITICAL_SECTION g_cs;
static volatile LONG g_tracked, g_virt_seeks, g_real_seeks, g_reads;

static FileState *fs_find(HANDLE h, int create) {
  unsigned i = (unsigned)(((ULONG_PTR)h >> 2) & (NFS - 1));
  for (unsigned k = 0; k < NFS; k++, i = (i + 1) & (NFS - 1)) {
    if (g_fs[i].h == h) return &g_fs[i];
    if (g_fs[i].h == NULL) { if (!create) return NULL; g_fs[i].h = h; return &g_fs[i]; }
  }
  return NULL; /* table full: caller falls through to the real API */
}

static void maybe_track(HANDLE h, DWORD access, DWORD disp, DWORD flags) {
  if (h == INVALID_HANDLE_VALUE) return;
  if (access & (GENERIC_WRITE | GENERIC_ALL | FILE_WRITE_DATA | FILE_APPEND_DATA)) return;
  if (disp != OPEN_EXISTING || (flags & FILE_FLAG_OVERLAPPED)) return;
  if (GetFileType(h) != FILE_TYPE_DISK) return;
  LARGE_INTEGER sz; if (!GetFileSizeEx(h, &sz)) return;
  EnterCriticalSection(&g_cs);
  FileState *f = fs_find(h, 1);
  if (f) { f->size = sz.QuadPart; f->virt = f->real = 0; InterlockedIncrement(&g_tracked); }
  LeaveCriticalSection(&g_cs);
}

static HANDLE WINAPI my_CreateFileW(LPCWSTR n, DWORD a, DWORD s, LPSECURITY_ATTRIBUTES sa, DWORD d, DWORD f, HANDLE t) {
  HANDLE h = real_CreateFileW(n, a, s, sa, d, f, t); maybe_track(h, a, d, f); return h;
}
static HANDLE WINAPI my_CreateFileA(LPCSTR n, DWORD a, DWORD s, LPSECURITY_ATTRIBUTES sa, DWORD d, DWORD f, HANDLE t) {
  HANDLE h = real_CreateFileA(n, a, s, sa, d, f, t); maybe_track(h, a, d, f); return h;
}

static BOOL WINAPI my_SetFilePointerEx(HANDLE h, LARGE_INTEGER dist, PLARGE_INTEGER out, DWORD method) {
  EnterCriticalSection(&g_cs);
  FileState *f = fs_find(h, 0);
  if (f) {
    LONGLONG target = method == FILE_BEGIN ? dist.QuadPart
                    : method == FILE_CURRENT ? f->virt + dist.QuadPart
                    : method == FILE_END ? f->size + dist.QuadPart : -1;
    if (target >= 0) {
      f->virt = target;
      if (out) out->QuadPart = target;
      LeaveCriticalSection(&g_cs);
      InterlockedIncrement(&g_virt_seeks);
      return TRUE;
    }
  }
  LeaveCriticalSection(&g_cs);
  /* untracked handle, or an invalid target whose error semantics belong to the real API */
  BOOL ok = real_SetFilePointerEx(h, dist, out, method);
  if (f) { /* resync after a real seek on a tracked handle */
    LARGE_INTEGER z = {0}, cur;
    if (real_SetFilePointerEx(h, z, &cur, FILE_CURRENT)) { EnterCriticalSection(&g_cs); f->virt = f->real = cur.QuadPart; LeaveCriticalSection(&g_cs); }
  }
  return ok;
}

static BOOL WINAPI my_ReadFile(HANDLE h, LPVOID buf, DWORD n, LPDWORD got, LPOVERLAPPED ov) {
  EnterCriticalSection(&g_cs);
  FileState *f = ov ? NULL : fs_find(h, 0);
  LONGLONG want = f ? f->virt : 0;
  int need_seek = f && f->real != f->virt;
  LeaveCriticalSection(&g_cs);
  if (!f) return real_ReadFile(h, buf, n, got, ov);
  if (need_seek) {
    LARGE_INTEGER d; d.QuadPart = want;
    real_SetFilePointerEx(h, d, NULL, FILE_BEGIN);
    InterlockedIncrement(&g_real_seeks);
  }
  DWORD local = 0;
  BOOL ok = real_ReadFile(h, buf, n, got ? got : &local, NULL);
  DWORD r = got ? *got : local;
  InterlockedIncrement(&g_reads);
  EnterCriticalSection(&g_cs);
  if (ok) { f->real = f->virt = want + r; }
  else {
    LARGE_INTEGER z = {0}, cur;
    if (real_SetFilePointerEx(h, z, &cur, FILE_CURRENT)) f->real = f->virt = cur.QuadPart;
  }
  LeaveCriticalSection(&g_cs);
  return ok;
}

static BOOL WINAPI my_CloseHandle(HANDLE h) {
  EnterCriticalSection(&g_cs);
  FileState *f = fs_find(h, 0);
  if (f) {
    /* tombstone-free removal: re-insert the rest of the probe cluster */
    unsigned i = (unsigned)(f - g_fs);
    f->h = NULL;
    for (unsigned j = (i + 1) & (NFS - 1); g_fs[j].h; j = (j + 1) & (NFS - 1)) {
      FileState tmp = g_fs[j]; g_fs[j].h = NULL;
      FileState *dst = fs_find(tmp.h, 1); *dst = tmp;
    }
  }
  LeaveCriticalSection(&g_cs);
  return real_CloseHandle(h);
}

/* ---------------- frame-gap meter ---------------- */

typedef BOOL(WINAPI *PFN_SwapBuffers)(HDC);
static PFN_SwapBuffers real_SwapBuffers;
static double g_last_frame = -1, g_max_gap, g_max_gap_at;
static volatile LONG g_frames, g_last_frame_ms = -1;
static void prof_dump(const char *why);

static BOOL WINAPI my_SwapBuffers(HDC hdc) {
  double t = now_s();
  if (g_last_frame >= 0) {
    double gap = t - g_last_frame;
    if (gap > 1.0) glog("frame gap %.2fs ending at frame %ld (seeks virt=%ld real=%ld reads=%ld)", gap, g_frames, g_virt_seeks, g_real_seeks, g_reads);
    if (gap > 2.0) prof_dump("freeze ended");
    if (gap > g_max_gap) { g_max_gap = gap; g_max_gap_at = t; }
  }
  g_last_frame = t; InterlockedExchange(&g_last_frame_ms, (LONG)(t * 1000)); InterlockedIncrement(&g_frames);
  return real_SwapBuffers(hdc);
}


/* ---------------- sampling profiler (freeze-only) ---------------- */

#define NBK 4096
typedef struct { DWORD key; LONG n; } Bucket;
static Bucket g_eip[NBK], g_game[NBK];
static volatile LONG g_samples, g_prof_on;
static HANDLE g_main_thread;

static void bk_add(Bucket *b, DWORD key) {
  unsigned i = (key * 2654435761u) & (NBK - 1);
  for (unsigned k = 0; k < NBK; k++, i = (i + 1) & (NBK - 1)) {
    if (b[i].key == key) { b[i].n++; return; }
    if (b[i].key == 0) { b[i].key = key; b[i].n = 1; return; }
  }
}

static const char *mod_of(DWORD addr, char *buf, DWORD cap) {
  HMODULE m = NULL;
  if (!GetModuleHandleExA(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT, (LPCSTR)(ULONG_PTR)addr, &m) || !m) return "?";
  char full[MAX_PATH]; if (!GetModuleFileNameA(m, full, sizeof full)) return "?";
  const char *b = strrchr(full, '\\'); snprintf(buf, cap, "%s+0x%lx", b ? b + 1 : full, (unsigned long)(addr - (DWORD)(ULONG_PTR)m));
  return buf;
}

static int in_exe(DWORD a) { return a >= 0x401000 && a < 0x52d000; } /* Reuben.exe .text */

static DWORD WINAPI prof_thread(LPVOID unused) {
  (void)unused;
  for (;;) {
    Sleep(10);
    LONG last = g_last_frame_ms;
    if (last < 0 || (LONG)(now_s() * 1000) - last < 2000) continue; /* not frozen */
    if (SuspendThread(g_main_thread) == (DWORD)-1) continue;
    CONTEXT c; memset(&c, 0, sizeof c); c.ContextFlags = CONTEXT_CONTROL | CONTEXT_INTEGER;
    if (GetThreadContext(g_main_thread, &c)) {
      DWORD eip = c.Eip, ebp = c.Ebp, game = in_exe(eip) ? eip : 0;
      for (int d = 0; !game && d < 16 && ebp; d++) { /* walk the EBP chain to the first game frame */
        DWORD fr[2]; SIZE_T got = 0;
        if (!ReadProcessMemory(GetCurrentProcess(), (LPCVOID)(ULONG_PTR)ebp, fr, sizeof fr, &got) || got != sizeof fr) break;
        if (in_exe(fr[1])) game = fr[1];
        if (fr[0] <= ebp) break;
        ebp = fr[0];
      }
      bk_add(g_eip, eip & ~0xffu); bk_add(g_game, game & ~0xfu);
      InterlockedIncrement(&g_samples);
    }
    ResumeThread(g_main_thread);
  }
  return 0;
}

static int bk_cmp(const void *a, const void *b) { return ((const Bucket *)b)->n - ((const Bucket *)a)->n; }

static void prof_dump(const char *why) {
  if (!g_prof_on || !g_samples) return;
  static Bucket tmp[NBK]; char mb[160];
  glog("profile (%s): %ld samples @10ms", why, g_samples);
  const char *title[2] = {"EIP (256B buckets)", "first game frame (16B buckets; 0 = none found)"};
  Bucket *src[2] = {g_eip, g_game};
  for (int k = 0; k < 2; k++) {
    memcpy(tmp, src[k], sizeof tmp); qsort(tmp, NBK, sizeof *tmp, bk_cmp);
    glog("  top %s:", title[k]);
    for (int i = 0; i < 12 && tmp[i].n; i++)
      glog("    %5.1f%%  %08lx  %s", 100.0 * tmp[i].n / g_samples, (unsigned long)tmp[i].key, tmp[i].key ? mod_of(tmp[i].key, mb, sizeof mb) : "-");
  }
  memset(g_eip, 0, sizeof g_eip); memset(g_game, 0, sizeof g_game); g_samples = 0;
}

/* ---------------- install ---------------- */

static void gamefix_install(void) {
  QueryPerformanceFrequency(&g_qpf); QueryPerformanceCounter(&g_t0);
  g_log = fopen("C:\\gamefix033.log", "w");
  InitializeCriticalSection(&g_cs);
  HMODULE exe = GetModuleHandleW(NULL);
  int wgl = env_on("GAMELIB_FIX_WGL"), seek = env_on("GAMELIB_FIX_SEEKCACHE");
  g_prof_on = env_on("GAMELIB_FIX_PROFILE");
  glog("gamefix033 attach: exe=%p wgl=%d seekcache=%d profile=%ld", (void *)exe, wgl, seek, g_prof_on);
  if (g_prof_on) { /* DllMain at process init runs on the main thread */
    DuplicateHandle(GetCurrentProcess(), GetCurrentThread(), GetCurrentProcess(), &g_main_thread,
                    THREAD_SUSPEND_RESUME | THREAD_GET_CONTEXT, FALSE, 0);
    CreateThread(NULL, 0, prof_thread, NULL, 0, NULL);
  }
  hook(exe, "GDI32.dll", "SwapBuffers", (void *)my_SwapBuffers, (void **)&real_SwapBuffers);
  if (wgl) hook(exe, "OPENGL32.dll", "wglGetProcAddress", (void *)my_wglGetProcAddress, (void **)&real_wglGetProcAddress);
  if (seek) {
    hook(exe, "KERNEL32.dll", "CreateFileW", (void *)my_CreateFileW, (void **)&real_CreateFileW);
    hook(exe, "KERNEL32.dll", "CreateFileA", (void *)my_CreateFileA, (void **)&real_CreateFileA);
    hook(exe, "KERNEL32.dll", "SetFilePointerEx", (void *)my_SetFilePointerEx, (void **)&real_SetFilePointerEx);
    hook(exe, "KERNEL32.dll", "ReadFile", (void *)my_ReadFile, (void **)&real_ReadFile);
    hook(exe, "KERNEL32.dll", "CloseHandle", (void *)my_CloseHandle, (void **)&real_CloseHandle);
  }
}

BOOL WINAPI DllMain(HINSTANCE inst, DWORD reason, LPVOID reserved) {
  (void)inst; (void)reserved;
  if (reason == DLL_PROCESS_ATTACH) gamefix_install();
  else if (reason == DLL_PROCESS_DETACH && g_log) {
    glog("detach: frames=%ld max_frame_gap=%.2fs at t=%.2fs tracked=%ld virt_seeks=%ld real_seeks=%ld reads=%ld",
         g_frames, g_max_gap, g_max_gap_at, g_tracked, g_virt_seeks, g_real_seeks, g_reads);
    fclose(g_log); g_log = NULL;
  }
  return TRUE;
}

#pragma clang attribute pop
