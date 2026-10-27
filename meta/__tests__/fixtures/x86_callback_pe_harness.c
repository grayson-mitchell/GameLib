/*
 * 32-bit PE harness for the REAL x86 steam_api.dll shim (quick 261027-m1r,
 * P55-9). Built with `zig cc -target x86-windows-gnu` and run under
 * CrossOver's Wine against a fake loopback helper hosted by the jest test.
 * It reaches the shim only through the DLL exports; no shim code is copied.
 *
 * What it proves: SteamAPI_RunCallbacks invokes Run(void*) through vtable
 * slot 1 with __thiscall (ECX == this, one stack arg popped by the callee),
 * the payload and iCallback are right, and the stack stays balanced.
 *
 * -DHARNESS_MUTANT_NO_CALLEE_POP makes the hand-written thunk end in a bare
 * `ret` instead of `ret 4`: the negative control for the ESP assertion.
 */
#ifndef __i386__
#error "x86_callback_pe_harness.c must be built for an i386 target"
#endif

#include <windows.h>

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#define PAYLOAD_SIZE 2572
#define MAX_RECORDS 8
#define THISCALL __attribute__((thiscall))

struct cbobj {
  void **vptr;
  uint8_t flags;
  uint8_t pad[3];
  int32_t iCallback;
  /* harness-private */
  int slot0_traps;
  int slot2_traps;
  int slot3_traps;
};
_Static_assert(offsetof(struct cbobj, flags) == 4, "flags offset");
_Static_assert(offsetof(struct cbobj, iCallback) == 8, "iCallback offset");

struct run_record {
  void *self;
  void *param;
  uint32_t esp_at_entry;
  uint32_t ret_addr;
  int32_t icallback;
  int payload_ok;
  int is_thunk;
};

static struct run_record g_rec[MAX_RECORDS];
static int g_nrec;
static uint8_t g_expected[PAYLOAD_SIZE];

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

/* ------------------------------------------------------------------ */
/* Run(void*) callees                                                  */
/* ------------------------------------------------------------------ */

void __attribute__((cdecl, used))
gl_record_run(void *self, void *param, uint32_t esp_entry) {
  if (g_nrec >= MAX_RECORDS) return;
  struct run_record *r = &g_rec[g_nrec++];
  r->self = self;
  r->param = param;
  r->esp_at_entry = esp_entry;
  r->ret_addr = *(volatile uint32_t *)esp_entry;
  r->icallback = self ? *(int32_t *)((uint8_t *)self + 8) : -1;
  r->payload_ok = param && memcmp(param, g_expected, PAYLOAD_SIZE) == 0;
  r->is_thunk = 1;
}

void gl_run1_thunk(void);
__asm__(
    ".text\n"
    ".globl _gl_run1_thunk\n"
    "_gl_run1_thunk:\n"
    ".intel_syntax noprefix\n"
    "  mov eax, esp\n"
    "  push eax\n"
    "  push dword ptr [eax+4]\n"
    "  push ecx\n"
    "  call _gl_record_run\n"
    "  add esp, 12\n"
#ifdef HARNESS_MUTANT_NO_CALLEE_POP
    "  ret\n"
#else
    "  ret 4\n"
#endif
    ".att_syntax\n");

static void THISCALL gl_run1_c(void *self, void *param) {
  if (g_nrec >= MAX_RECORDS) return;
  struct run_record *r = &g_rec[g_nrec++];
  r->self = self;
  r->param = param;
  r->esp_at_entry = 0;
  r->ret_addr = 0;
  r->icallback = self ? *(int32_t *)((uint8_t *)self + 8) : -1;
  r->payload_ok = param && memcmp(param, g_expected, PAYLOAD_SIZE) == 0;
  r->is_thunk = 0;
}

/* Trap slots: a wrong-slot call must be loud but not corrupt the stack. */
static void THISCALL trap0(struct cbobj *self) {
  self->slot0_traps++;
  printf("FAIL trap slot 0\n");
}
static void THISCALL trap2(struct cbobj *self) {
  self->slot2_traps++;
  printf("FAIL trap slot 2\n");
}
static void THISCALL trap3(struct cbobj *self) {
  self->slot3_traps++;
  printf("FAIL trap slot 3\n");
}

static void *g_vt_thunk[4] = {(void *)trap0, (void *)gl_run1_thunk,
                              (void *)trap2, (void *)trap3};
static void *g_vt_c[4] = {(void *)trap0, (void *)gl_run1_c, (void *)trap2,
                          (void *)trap3};

/* Outer ESP check around a cdecl void(void) call. */
void gl_call_checked(void (*fn)(void));
__asm__(
    ".text\n"
    ".globl _gl_call_checked\n"
    "_gl_call_checked:\n"
    ".intel_syntax noprefix\n"
    "  mov eax, [esp+4]\n"
    "  mov dword ptr [_g_esp_before], esp\n"
    "  call eax\n"
    "  mov dword ptr [_g_esp_after], esp\n"
    "  ret\n"
    ".att_syntax\n");

/* ------------------------------------------------------------------ */

static LONG WINAPI crash_filter(EXCEPTION_POINTERS *ep) {
  printf("FAIL crash code=0x%08lx\n", ep->ExceptionRecord->ExceptionCode);
  fflush(stdout);
  ExitProcess(3);
  return EXCEPTION_EXECUTE_HANDLER;
}

typedef void(__cdecl *reg_fn)(void *, int);
typedef void(__cdecl *unreg_fn)(void *);
typedef void(__cdecl *run_fn)(void);

static struct cbobj objA, objB, objC, objD;

static int find_image(const uint8_t *base, const char *needle) {
  const IMAGE_DOS_HEADER *dos = (const IMAGE_DOS_HEADER *)base;
  const IMAGE_NT_HEADERS *nt = (const IMAGE_NT_HEADERS *)(base + dos->e_lfanew);
  size_t size = nt->OptionalHeader.SizeOfImage;
  size_t n = strlen(needle);
  for (size_t i = 0; i + n <= size; i++) {
    if (base[i] == (uint8_t)needle[0] && memcmp(base + i, needle, n) == 0)
      return 1;
  }
  return 0;
}

static void init_obj(struct cbobj *o, void **vt) {
  memset(o, 0, sizeof(*o));
  o->vptr = vt;
}

int main(void) {
  SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX |
               SEM_NOOPENFILEERRORBOX);
  SetUnhandledExceptionFilter(crash_filter);
  setvbuf(stdout, NULL, _IONBF, 0);

  /* expected payload */
  memset(g_expected, 0, sizeof(g_expected));
  *(uint32_t *)(g_expected + 0) = 0x51A7C0DEu;
  *(int32_t *)(g_expected + 4) = 1;
  *(int32_t *)(g_expected + 8) = 2560;
  for (int i = 0; i < 2560; i++)
    g_expected[12 + i] = (uint8_t)((i * 73 + 11) & 0xff);

  char exe[MAX_PATH];
  DWORD n = GetModuleFileNameA(NULL, exe, MAX_PATH);
  if (n == 0 || n >= MAX_PATH) {
    say_fail("loaded_real_shim", "exe path");
    printf("DONE\n");
    return 1;
  }
  char dir[MAX_PATH];
  strcpy(dir, exe);
  char *slash = strrchr(dir, '\\');
  if (!slash) slash = strrchr(dir, '/');
  if (slash) *slash = 0;
  char dllpath[MAX_PATH + 16];
  snprintf(dllpath, sizeof(dllpath), "%s\\steam_api.dll", dir);

  HMODULE mod = LoadLibraryA(dllpath);
  reg_fn reg = NULL;
  unreg_fn unreg = NULL;
  run_fn run = NULL;
  int loaded_ok = 0;
  if (mod) {
    char modpath[MAX_PATH];
    DWORD mn = GetModuleFileNameA(mod, modpath, MAX_PATH);
    size_t dl = strlen(dir);
    int in_dir = mn > 0 && mn < MAX_PATH && strlen(modpath) >= dl &&
                 _strnicmp(modpath, dir, dl) == 0;
    size_t ml = strlen(modpath);
    int ends = ml >= 13 && _stricmp(modpath + ml - 13, "steam_api.dll") == 0;
    int marker = find_image((const uint8_t *)mod, "GameLibSteamBridgeShim/2");
    printf("INFO module=%p path=%s in_dir=%d ends=%d marker=%d\n", (void *)mod,
           modpath, in_dir, ends, marker);
    loaded_ok = in_dir && ends && marker;
    reg = (reg_fn)GetProcAddress(mod, "SteamAPI_RegisterCallback");
    unreg = (unreg_fn)GetProcAddress(mod, "SteamAPI_UnregisterCallback");
    run = (run_fn)GetProcAddress(mod, "SteamAPI_RunCallbacks");
  }
  verdict("loaded_real_shim", loaded_ok && reg && unreg && run,
          mod ? "image checks or exports" : "LoadLibrary failed");
  if (!mod || !reg || !unreg || !run) {
    printf("DONE\n");
    return 1;
  }
  const uint8_t *img = (const uint8_t *)mod;
  const IMAGE_DOS_HEADER *dos = (const IMAGE_DOS_HEADER *)img;
  const IMAGE_NT_HEADERS *nt = (const IMAGE_NT_HEADERS *)(img + dos->e_lfanew);
  uint32_t img_lo = (uint32_t)(uintptr_t)img;
  uint32_t img_hi = img_lo + nt->OptionalHeader.SizeOfImage;

  init_obj(&objA, g_vt_thunk);
  init_obj(&objB, g_vt_thunk);
  init_obj(&objC, g_vt_c);
  init_obj(&objD, g_vt_thunk);
  reg(&objA, 168);
  reg(&objC, 168);
  reg(&objB, 168);
  reg(&objD, 152);
  printf("INFO A=%p B=%p C=%p D=%p\n", (void *)&objA, (void *)&objB,
         (void *)&objC, (void *)&objD);
  verdict("register_writes_x86_layout",
          (objA.flags & 1) && (objB.flags & 1) && (objC.flags & 1) &&
              (objD.flags & 1) && objA.iCallback == 168 &&
              objB.iCallback == 168 && objC.iCallback == 168 &&
              objD.iCallback == 152,
          "flags/iCallback not written at x86 offsets");

  int esp_mismatch = 0;
  for (int i = 0; i < 60 && g_nrec < 3; i++) {
    gl_call_checked(run);
    if (g_esp_before != g_esp_after) esp_mismatch = 1;
    if (g_nrec >= 3) break;
    Sleep(50);
  }
  Sleep(100);
  gl_call_checked(run);
  if (g_esp_before != g_esp_after) esp_mismatch = 1;
  printf("INFO outer esp before=0x%08x after=0x%08x mismatch=%d\n",
         (unsigned)g_esp_before, (unsigned)g_esp_after, esp_mismatch);

  /* per-record info */
  for (int i = 0; i < g_nrec; i++) {
    printf("INFO rec%d self=%p param=%p esp=0x%08x ret=0x%08x icb=%d ok=%d\n",
           i, g_rec[i].self, g_rec[i].param, (unsigned)g_rec[i].esp_at_entry,
           (unsigned)g_rec[i].ret_addr, (int)g_rec[i].icallback,
           g_rec[i].payload_ok);
  }

  int cA = 0, cB = 0, cC = 0, cD = 0, other = 0;
  for (int i = 0; i < g_nrec; i++) {
    if (g_rec[i].self == &objA) cA++;
    else if (g_rec[i].self == &objB) cB++;
    else if (g_rec[i].self == &objC) cC++;
    else if (g_rec[i].self == &objD) cD++;
    else other++;
  }
  int traps = 0;
  struct cbobj *all[4] = {&objA, &objB, &objC, &objD};
  for (int i = 0; i < 4; i++)
    traps += all[i]->slot0_traps + all[i]->slot2_traps + all[i]->slot3_traps;
  printf("INFO nrec=%d cA=%d cB=%d cC=%d cD=%d other=%d traps=%d\n", g_nrec, cA,
         cB, cC, cD, other, traps);
  verdict("run1_called_once_each",
          g_nrec == 3 && cA == 1 && cB == 1 && cC == 1 && cD == 0 &&
              other == 0 && traps == 0,
          "dispatch count/targets wrong");

  int this_ok = g_nrec > 0;
  for (int i = 0; i < g_nrec; i++) {
    void *s = g_rec[i].self;
    if (s != &objA && s != &objB && s != &objC) this_ok = 0;
    for (int j = i + 1; j < g_nrec; j++)
      if (g_rec[j].self == s) this_ok = 0;
  }
  verdict("run1_thiscall_this", this_ok, "this not a distinct registered obj");

  int payload_ok = g_nrec > 0;
  for (int i = 0; i < g_nrec; i++) {
    if (!g_rec[i].param || !g_rec[i].payload_ok) payload_ok = 0;
    if ((uint8_t *)g_rec[i].param >= g_expected &&
        (uint8_t *)g_rec[i].param < g_expected + PAYLOAD_SIZE)
      payload_ok = 0;
  }
  verdict("run1_payload", payload_ok, "payload missing or mismatched");

  int cb_ok = g_nrec > 0;
  for (int i = 0; i < g_nrec; i++)
    if (g_rec[i].icallback != 168) cb_ok = 0;
  verdict("run1_callback_id", cb_ok, "iCallback != 168");

  int ret_ok = 1, nthunk = 0;
  for (int i = 0; i < g_nrec; i++) {
    if (!g_rec[i].is_thunk) continue;
    nthunk++;
    if (g_rec[i].ret_addr < img_lo || g_rec[i].ret_addr >= img_hi) ret_ok = 0;
  }
  verdict("run1_return_into_shim", ret_ok && nthunk == 2,
          "return address outside shim image");

  uint32_t e0 = 0, e1 = 0;
  int seen = 0;
  for (int i = 0; i < g_nrec; i++) {
    if (!g_rec[i].is_thunk) continue;
    if (seen == 0) e0 = g_rec[i].esp_at_entry;
    else if (seen == 1) e1 = g_rec[i].esp_at_entry;
    seen++;
  }
  printf("INFO thunk esp entries 0x%08x 0x%08x\n", (unsigned)e0, (unsigned)e1);
  verdict("run1_esp_balanced", seen == 2 && e0 == e1 && !esp_mismatch,
          "ESP differs between thunk entries or across RunCallbacks");

  unreg(&objA);
  unreg(&objB);
  unreg(&objC);
  unreg(&objD);
  verdict("unregister_clears_flag",
          !(objA.flags & 1) && !(objB.flags & 1) && !(objC.flags & 1) &&
              !(objD.flags & 1),
          "registered flag still set");

  printf("DONE\n");
  return g_failed ? 1 : 0;
}
