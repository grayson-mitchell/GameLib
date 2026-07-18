// 005c game-like harness (PE32 i386, runs in the GameLibSteam bottle).
//
// Simulates what a Windows game does with steam_api.dll: LoadLibrary it, resolve
// the flat exports, call SteamAPI_Init(), get the user handle, call GetSteamID().
// The returned ID comes — via our shim + the host bridge — from the REAL signed-in
// native Mac Steam client. Result to stdout and C:\shim_out.txt.

#include <windows.h>
#include <stdint.h>
#include <stdio.h>

typedef int      (*Init_t)(void);
typedef void    *(*User_t)(void);
typedef uint64_t (*GetID_t)(void *);

int main(void) {
  FILE *f = fopen("C:\\shim_out.txt", "w");
  HMODULE m = LoadLibraryA("C:\\steam_api.dll");
  if (!m) { printf("LOADLIB_FAIL %lu\n", GetLastError()); if (f) { fprintf(f, "LOADLIB_FAIL %lu\n", GetLastError()); fclose(f); } return 1; }

  Init_t  init  = (Init_t) GetProcAddress(m, "SteamAPI_Init");
  User_t  user  = (User_t) GetProcAddress(m, "SteamAPI_SteamUser_v023");
  GetID_t getid = (GetID_t)GetProcAddress(m, "SteamAPI_ISteamUser_GetSteamID");
  if (!init || !user || !getid) {
    printf("GETPROC_FAIL init=%p user=%p getid=%p\n", (void*)init, (void*)user, (void*)getid);
    if (f) { fprintf(f, "GETPROC_FAIL\n"); fclose(f); }
    return 2;
  }

  int ok = init();
  uint64_t id = getid(user());
  printf("SHIM_GAME_PATH SteamAPI_Init=%d GetSteamID=%llu\n", ok, (unsigned long long)id);
  if (f) fprintf(f, "SteamAPI_Init=%d GetSteamID=%llu\n", ok, (unsigned long long)id);
  if (f) fclose(f);
  return 0;
}
