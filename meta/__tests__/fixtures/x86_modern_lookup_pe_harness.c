/*
 * 32-bit PE harness for the REAL x86 steam_api.dll shim (quick 261120-rdo,
 * D-53-09 tier 1). Built with `zig cc -target x86-windows-gnu` and run under
 * CrossOver's Wine by meta/__tests__/x86ModernLookupWineHarness.test.ts. It
 * reaches the shim only through the DLL exports; no shim code is copied.
 *
 * What it proves on the shipped x86 export table:
 *  - the modern SteamInternal_* lookup family exists and follows the SDK
 *    contract (handles, the ContextInit callback-and-counter protocol),
 *  - a served version resolves to the same proxy through both lookups,
 *  - a version GameLib has a manifest for but does not serve on x86 resolves to a
 *    null object whose slots pop EXACTLY their manifest stackBytes (__thiscall is
 *    callee-cleans, so a wrong pop corrupts the caller's stack), including an
 *    sret slot that zero-fills and returns the caller's buffer,
 *  - the ESP check is live (a deliberate one-dword mismatch is detected),
 *  - a version with no manifest answers NULL.
 *
 * Slot numbers and byte counts come from the manifests via -D defines:
 *   UGC_SLOT, UGC_STACK_DWORDS  (STEAMUGC_INTERFACE_VERSION017 slot 0)
 *   INPUT_SLOT, INPUT_STRUCT    (SteamInput006 sret slot; stackBytes 12)
 */
#ifndef __i386__
#error "x86_modern_lookup_pe_harness.c must be built for an i386 target"
#endif
#if !defined(UGC_SLOT) || !defined(UGC_STACK_DWORDS) || !defined(INPUT_SLOT) || \
    !defined(INPUT_STRUCT)
#error "slot defines missing"
#endif

#include <windows.h>

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

volatile uint32_t g_esp_before;
volatile uint32_t g_esp_after;

static int g_failed;

static void say_pass(const char *name) { printf("PASS %s\n", name); }
static void say_fail(const char *name, const char *detail) {
  g_failed = 1;
  printf("FAIL %s %s\n", name, detail);
}
static void verdict(const char *name, int ok, const char *detail) {
  if (ok)
    say_pass(name);
  else
    say_fail(name, detail);
}

/*
 * uint32 gl_thiscall_n(void *fn, void *self, const uint32_t *args, int nargs, uint32_t *out2)
 * (cdecl). Pushes args right-to-left, loads ECX = self, calls fn, and records
 * ESP just before the pushes and right after the call into g_esp_before /
 * g_esp_after: a callee that pops exactly the pushed bytes leaves them equal.
 * EAX / EDX of the call are stored in out2[0] / out2[1]. ESP is then restored
 * from the frame, so a mismatching callee cannot corrupt the harness.
 */
void gl_thiscall_n(void *fn, void *self, const uint32_t *args, int nargs,
                   uint32_t *out2);
__asm__(
    ".text\n"
    ".globl _gl_thiscall_n\n"
    "_gl_thiscall_n:\n"
    ".intel_syntax noprefix\n"
    "  push ebp\n"
    "  mov ebp, esp\n"
    "  push ebx\n"
    "  push esi\n"
    "  push edi\n"
    "  mov esi, [ebp+16]\n"
    "  mov ebx, [ebp+20]\n"
    "  mov dword ptr [_g_esp_before], esp\n"
    "gl_tc_loop:\n"
    "  test ebx, ebx\n"
    "  jz gl_tc_call\n"
    "  push dword ptr [esi+ebx*4-4]\n"
    "  dec ebx\n"
    "  jmp gl_tc_loop\n"
    "gl_tc_call:\n"
    "  mov ecx, [ebp+12]\n"
    "  call dword ptr [ebp+8]\n"
    "  mov dword ptr [_g_esp_after], esp\n"
    "  mov edi, [ebp+24]\n"
    "  mov [edi], eax\n"
    "  mov [edi+4], edx\n"
    "  lea esp, [ebp-12]\n"
    "  pop edi\n"
    "  pop esi\n"
    "  pop ebx\n"
    "  pop ebp\n"
    "  ret\n"
    ".att_syntax\n");

static LONG WINAPI crash_filter(EXCEPTION_POINTERS *ep) {
  printf("FAIL crash code=0x%08lx\n", ep->ExceptionRecord->ExceptionCode);
  fflush(stdout);
  ExitProcess(3);
  return EXCEPTION_EXECUTE_HANDLER;
}

typedef int(__cdecl *get_handle_fn)(void);
typedef void *(__cdecl *create_fn)(const char *);
typedef void *(__cdecl *find_fn)(int, const char *);
typedef void *(__cdecl *ctx_init_fn)(void *);
typedef int(__cdecl *steam_init_fn)(const char *, char *);
typedef int(__cdecl *gs_init_v2_fn)(uint32_t, uint16_t, uint16_t, int,
                                    const char *, const char *, char *);

struct ctx_block {
  void(__cdecl *pFn)(void *pCtx);
  uintptr_t counter;
  void *ctx;
};

static find_fn g_find;
static int g_ctx_calls;

static void __cdecl ctx_fn(void *pCtx) {
  g_ctx_calls++;
  *(void **)pCtx = g_find(1, "SteamUser023");
}

static void *vslot(void *obj, int slot) {
  void **vt = *(void ***)obj;
  return vt[slot];
}

int main(void) {
  SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX |
               SEM_NOOPENFILEERRORBOX);
  SetUnhandledExceptionFilter(crash_filter);
  setvbuf(stdout, NULL, _IONBF, 0);

  char exe[MAX_PATH];
  DWORD n = GetModuleFileNameA(NULL, exe, MAX_PATH);
  if (n == 0 || n >= MAX_PATH) {
    printf("FAIL load exe path\nDONE\n");
    return 1;
  }
  char *slash = strrchr(exe, '\\');
  if (!slash) slash = strrchr(exe, '/');
  if (slash) *slash = 0;
  char dllpath[MAX_PATH + 16];
  snprintf(dllpath, sizeof(dllpath), "%s\\steam_api.dll", exe);

  HMODULE mod = LoadLibraryA(dllpath);
  if (!mod) {
    printf("FAIL load LoadLibrary failed\nDONE\n");
    return 1;
  }
  get_handle_fn get_user = (get_handle_fn)GetProcAddress(mod, "SteamAPI_GetHSteamUser");
  get_handle_fn get_pipe = (get_handle_fn)GetProcAddress(mod, "SteamAPI_GetHSteamPipe");
  create_fn create = (create_fn)GetProcAddress(mod, "SteamInternal_CreateInterface");
  find_fn find = (find_fn)GetProcAddress(mod, "SteamInternal_FindOrCreateUserInterface");
  ctx_init_fn ctx_init = (ctx_init_fn)GetProcAddress(mod, "SteamInternal_ContextInit");
  steam_init_fn steam_init = (steam_init_fn)GetProcAddress(mod, "SteamInternal_SteamAPI_Init");
  gs_init_v2_fn gs_init_v2 = (gs_init_v2_fn)GetProcAddress(mod, "SteamInternal_GameServer_Init_V2");
  if (!get_user || !get_pipe || !create || !find || !ctx_init || !steam_init ||
      !gs_init_v2) {
    printf("FAIL load a modern export is missing from the x86 shim\nDONE\n");
    return 1;
  }
  g_find = find;

  verdict("hsteam_handles", get_user() == 1 && get_pipe() == 1,
          "GetHSteamUser/GetHSteamPipe did not both return 1");

  /* SDK callback-and-counter protocol. */
  struct ctx_block blk;
  memset(&blk, 0, sizeof(blk));
  blk.pFn = ctx_fn;
  void *r1 = ctx_init(&blk);
  void *r2 = ctx_init(&blk);
  void *want = (void *)((uint8_t *)&blk + 8);
  verdict("context_init_protocol",
          g_ctx_calls == 1 && r1 == want && r2 == want && blk.ctx != NULL,
          "pFn not run exactly once, or the return is not data+8, or ctx NULL");

  void *served = create("SteamUser023");
  void *via_find = find(1, "SteamUser023");
  verdict("find_or_create_served",
          served != NULL && via_find == served,
          "FindOrCreateUserInterface != CreateInterface for a served version");

  void *nul = find(1, "STEAMUGC_INTERFACE_VERSION017");
  verdict("null_object_known_version", nul != NULL && nul != served,
          "no distinct null object for a manifest-known, x86-unserved version");

  /* A null slot with N stack bytes must pop exactly N. */
  uint32_t args[16];
  uint32_t out[2];
  int ugc_ok = 0;
  if (nul) {
    for (int i = 0; i < UGC_STACK_DWORDS; i++) args[i] = 0xC0DE0000u + (uint32_t)i;
    out[0] = out[1] = 0xFFFFFFFFu;
    gl_thiscall_n(vslot(nul, UGC_SLOT), nul, args, UGC_STACK_DWORDS, out);
    ugc_ok = g_esp_before == g_esp_after && out[0] == 0 && out[1] == 0;
    printf("INFO ugc esp before=0x%08x after=0x%08x eax=0x%08x edx=0x%08x\n",
           (unsigned)g_esp_before, (unsigned)g_esp_after, (unsigned)out[0],
           (unsigned)out[1]);
  }
  verdict("null_slot_esp_balanced", ugc_ok,
          "null slot did not pop exactly its stackBytes or did not return 0");

  /* sret null slot: GetMotionData(this, sret, uint64 handle), pops 12. */
  void *input = find(1, "SteamInput006");
  int sret_ok = 0;
  if (input) {
    uint8_t buf[INPUT_STRUCT];
    memset(buf, 0xAA, sizeof(buf));
    args[0] = (uint32_t)(uintptr_t)buf;
    args[1] = 0x11112222u;
    args[2] = 0x33334444u;
    out[0] = out[1] = 0xFFFFFFFFu;
    gl_thiscall_n(vslot(input, INPUT_SLOT), input, args, 3, out);
    int zero = 1;
    for (size_t i = 0; i < sizeof(buf); i++)
      if (buf[i] != 0) zero = 0;
    sret_ok = g_esp_before == g_esp_after && out[0] == (uint32_t)(uintptr_t)buf && zero;
    printf("INFO sret esp before=0x%08x after=0x%08x eax=0x%08x zero=%d\n",
           (unsigned)g_esp_before, (unsigned)g_esp_after, (unsigned)out[0], zero);
  }
  verdict("null_sret_slot", sret_ok,
          "sret null slot unbalanced, did not return the buffer, or left it non-zero");

  /* Negative control: one extra dword must be seen as an ESP mismatch of 4. */
  int mismatch_seen = 0;
  if (nul) {
    for (int i = 0; i < UGC_STACK_DWORDS + 1; i++) args[i] = 0xBAD00000u + (uint32_t)i;
    gl_thiscall_n(vslot(nul, UGC_SLOT), nul, args, UGC_STACK_DWORDS + 1, out);
    mismatch_seen = g_esp_before - g_esp_after == 4;
    printf("INFO mutant esp before=0x%08x after=0x%08x\n", (unsigned)g_esp_before,
           (unsigned)g_esp_after);
  }
  verdict("esp_check_detects_mismatch", mismatch_seen,
          "an extra pushed dword was not detected as ESP off by 4");

  verdict("unknown_version_null",
          create("GameLibNoSuchInterface999") == NULL && find(1, NULL) == NULL,
          "unknown version or NULL did not answer NULL");

  char msg[1024];
  memset(msg, 0, sizeof(msg));
  int rc = steam_init(NULL, msg);
  verdict("steaminternal_init_fails_closed", rc == 2 && msg[0] != 0,
          "SteamInternal_SteamAPI_Init without a helper did not return 2 with a message");

  char msg2[1024];
  memset(msg2, 0, sizeof(msg2));
  int rc2 = gs_init_v2(0, 0, 0, 0, NULL, NULL, msg2);
  verdict("gameserver_init_v2_fails", rc2 == 1, "GameServer_Init_V2 did not return 1");

  printf("DONE\n");
  return g_failed ? 1 : 0;
}
