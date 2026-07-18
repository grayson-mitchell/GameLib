// 006 harness (PE32 i386) — dispatches ISteamUser::GetSteamID the way an
// MSVC-compiled game does: read the vtable from the object, call slot 2 with
// the MSVC __thiscall convention (this in ECX; 8-byte CSteamID in EDX:EAX).
//
// Why hand-dispatch instead of a C++ virtual call? mingw/clang windows-gnu C++
// uses the Itanium ABI (this passed on the stack), NOT MSVC's ECX-thiscall that
// real Steam games use. To prove the shim is callable *by a real MSVC game*, we
// reconstruct the MSVC thiscall dispatch explicitly. Steamworks CSteamID is an
// 8-byte trivially-copyable value → returned in EDX:EAX under the MSVC i386 ABI.

#include <windows.h>
#include <stdint.h>
#include <stdio.h>

typedef int   (*Init_t)(void);
typedef void *(*User_t)(void);

// MSVC __thiscall dispatch: ECX = this, call fn, read 8-byte return from EDX:EAX.
static uint64_t msvc_thiscall_ret64(void *self, void *fn) {
  uint32_t lo, hi;
  __asm__ volatile(
      "movl %2, %%ecx\n\t"
      "call *%3\n\t"
      : "=a"(lo), "=d"(hi)
      : "r"(self), "r"(fn)
      : "ecx", "memory");
  return ((uint64_t)hi << 32) | lo;
}

int main(void) {
  FILE *f = fopen("C:\\vtable_out.txt", "w");
  HMODULE m = LoadLibraryA("C:\\steam_api.dll");
  Init_t init  = m ? (Init_t)GetProcAddress(m, "SteamAPI_Init") : 0;
  User_t suser = m ? (User_t)GetProcAddress(m, "SteamAPI_SteamUser_v023") : 0;
  if (!m || !init || !suser) { printf("SETUP_FAIL m=%p init=%p user=%p\n", (void*)m, (void*)init, (void*)suser); if (f) fclose(f); return 1; }

  init();
  void *u = suser();
  void **vtbl = *(void ***)u;   // object's first word -> vtable (MSVC/Itanium: vptr at slot 0)
  void *getid = vtbl[2];         // ISteamUser slot 2 = GetSteamID
  uint64_t id = msvc_thiscall_ret64(u, getid);

  printf("VTABLE_GAME_PATH ISteamUser::GetSteamID (slot 2, MSVC __thiscall) = %llu\n", (unsigned long long)id);
  if (f) { fprintf(f, "GetSteamID=%llu\n", (unsigned long long)id); fclose(f); }
  return 0;
}
