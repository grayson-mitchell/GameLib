/* Spike 036: a Proton-steam_helper-style responder for the CEG start handshake (spike 035), for a
 * GameLib BRIDGE bottle (no Windows Steam client). Modelled on ValveSoftware/Proton
 * steam_helper/steam.c (set_active_process_pid, Steam3Master_SharedMemLock, steam_drm_thread).
 * It does NOT parse or answer STEAMSTART contents and does NOT touch the game's code -- it only
 * ACKs the start request so the genuine Steam path (shim -> bridge helper -> native Mac Steam)
 * gets its turn.
 *
 * usage: dipc_responder.exe <game.exe> [args...]
 * env:   DIPC_ACK=0 disables the ACK (negative control); DIPC_LOG overrides C:\dipc036.log */
#include <windows.h>
#include <stdio.h>
#include <wchar.h>

typedef LONG NTSTATUS;
typedef struct { USHORT Length, MaximumLength; PWSTR Buffer; } USTR;
typedef struct { ULONG Length; HANDLE RootDirectory; USTR *ObjectName; ULONG Attributes; PVOID Sd, Sqos; } OATTR;
typedef struct { USTR ObjectName; USTR ObjectTypeName; } DIRINFO;
typedef NTSTATUS (NTAPI *pNtOpenDirectoryObject)(HANDLE *, ACCESS_MASK, OATTR *);
typedef NTSTATUS (NTAPI *pNtQueryDirectoryObject)(HANDLE, PVOID, ULONG, BOOLEAN, BOOLEAN, ULONG *, ULONG *);

static FILE *g_log;
static DWORD g_t0;
static void logf(const char *fmt, ...) {
  va_list ap; SYSTEMTIME st; GetSystemTime(&st);
  fprintf(g_log, "%04d-%02d-%02dT%02d:%02d:%02d.%03dZ +%lums ", st.wYear, st.wMonth, st.wDay, st.wHour,
          st.wMinute, st.wSecond, st.wMilliseconds, GetTickCount() - g_t0);
  va_start(ap, fmt); vfprintf(g_log, fmt, ap); va_end(ap); fputc('\n', g_log); fflush(g_log);
}

/* Enumerate a named-object directory for STEAM_START_ACK_EVENT*; open and return it. */
static HANDLE find_ack_in(const wchar_t *dirname) {
  pNtOpenDirectoryObject open = (pNtOpenDirectoryObject)GetProcAddress(GetModuleHandleA("ntdll"), "NtOpenDirectoryObject");
  pNtQueryDirectoryObject query = (pNtQueryDirectoryObject)GetProcAddress(GetModuleHandleA("ntdll"), "NtQueryDirectoryObject");
  USTR us = { (USHORT)(wcslen(dirname) * 2), (USHORT)(wcslen(dirname) * 2 + 2), (PWSTR)dirname };
  OATTR oa = { sizeof(oa), NULL, &us, 0, NULL, NULL };
  HANDLE dir, ret = NULL; ULONG ctx = 0, size; char buf[2048]; DIRINFO *di = (DIRINFO *)buf; int n = 0;
  NTSTATUS st = open(&dir, 0x0001 /* DIRECTORY_QUERY */, &oa);
  if (st) { logf("dir %ls: open failed 0x%08lx", dirname, (unsigned long)st); return NULL; }
  st = query(dir, buf, sizeof(buf), TRUE, TRUE, &ctx, &size);
  while (!st) {
    n++;
    if (di->ObjectName.Buffer && !wcsncmp(di->ObjectName.Buffer, L"STEAM_", 6))
      logf("dir %ls: saw %.*ls (%.*ls)", dirname, di->ObjectName.Length / 2, di->ObjectName.Buffer,
           di->ObjectTypeName.Length / 2, di->ObjectTypeName.Buffer);
    if (!ret && di->ObjectName.Buffer && !wcsncmp(di->ObjectName.Buffer, L"STEAM_START_ACK_EVENT", 21)) {
      wchar_t name[256]; swprintf(name, 256, L"%.*ls", di->ObjectName.Length / 2, di->ObjectName.Buffer);
      ret = OpenEventW(SYNCHRONIZE | EVENT_MODIFY_STATE, FALSE, name);
      logf("ACK event %ls -> open %s (err %lu)", name, ret ? "ok" : "FAILED", ret ? 0 : GetLastError());
    }
    st = query(dir, buf, sizeof(buf), TRUE, FALSE, &ctx, &size);
  }
  logf("dir %ls: %d entries scanned, end status 0x%08lx", dirname, n, (unsigned long)st);
  CloseHandle(dir);
  return ret;
}


static void dump_section(const char *name) {
  HANDLE m = OpenFileMappingA(FILE_MAP_READ, FALSE, name); unsigned char *v; MEMORY_BASIC_INFORMATION mbi;
  char line[200]; size_t sz, last = 0;
  if (!m) { logf("section %s: open failed err %lu", name, GetLastError()); return; }
  v = MapViewOfFile(m, FILE_MAP_READ, 0, 0, 0);
  if (!v) { logf("section %s: map failed err %lu", name, GetLastError()); CloseHandle(m); return; }
  VirtualQuery(v, &mbi, sizeof(mbi)); sz = mbi.RegionSize;
  for (size_t i = 0; i < sz; i++) if (v[i]) last = i + 1;
  logf("section %s: region %lu bytes, nonzero through %lu", name, (unsigned long)sz, (unsigned long)last);
  for (size_t off = 0; off < last && off < 1024; off += 16) {
    int n = sprintf(line, "  %04lx:", (unsigned long)off);
    for (int j = 0; j < 16; j++) n += sprintf(line + n, " %02x", v[off + j]);
    n += sprintf(line + n, "  ");
    for (int j = 0; j < 16; j++) line[n++] = (v[off + j] >= 32 && v[off + j] < 127) ? v[off + j] : '.';
    line[n] = 0; logf("%s", line);
  }
  UnmapViewOfFile(v); CloseHandle(m);
}

static DWORD g_child;
static DWORD WINAPI drm_thread(void *arg) {
  HANDLE consume = CreateSemaphoreW(NULL, 0, 512, L"STEAM_DIPC_CONSUME");
  HANDLE produce = CreateSemaphoreW(NULL, 1, 512, L"SREAM_DIPC_PRODUCE");
  BOOL ack = !(getenv("DIPC_ACK") && getenv("DIPC_ACK")[0] == '0');
  LONG prev;
  logf("drm thread: consume=%p produce=%p ack=%d", consume, produce, ack);
  if (!consume || !produce) { logf("semaphore create failed err %lu", GetLastError()); return 1; }
  while (WaitForSingleObject(consume, INFINITE) == WAIT_OBJECT_0) {
    HANDLE ev;
    logf("DIPC request: CONSUME signalled");
    { char dn[64]; dump_section("STEAM_DRM_IPC"); sprintf(dn, "STEAM_DATA.%lu", g_child); dump_section(dn); }
    if (!ack) { logf("negative control: NOT acking"); ReleaseSemaphore(produce, 1, &prev); continue; }
    ev = find_ack_in(L"\\BaseNamedObjects\\Session\\1");
    if (!ev) ev = find_ack_in(L"\\Sessions\\1\\BaseNamedObjects");
    if (!ev) ev = find_ack_in(L"\\BaseNamedObjects");
    if (ev) { logf("SetEvent(ACK) -> %d", SetEvent(ev)); CloseHandle(ev); }
    else logf("no ACK event found in any directory");
    Sleep(50); logf("after ACK:"); dump_section("STEAM_DRM_IPC");
    ReleaseSemaphore(produce, 1, &prev);
    logf("PRODUCE released (prev %ld)", prev);
  }
  return 0;
}

int main(int argc, char **argv) {
  char cmd[4096] = ""; DWORD pid = GetCurrentProcessId(), code = 0;
  STARTUPINFOA si = { sizeof(si) }; PROCESS_INFORMATION pi;
  const char *lp = getenv("DIPC_LOG");
  g_t0 = GetTickCount();
  g_log = fopen(lp ? lp : "C:\\dipc036.log", "w"); if (!g_log) g_log = stderr;
  if (argc < 2) { logf("usage: dipc_responder.exe <game.exe> [args]"); return 2; }

  /* Proton's game-process setup, minus the VR/registry-from-lsteamclient parts. */
  CreateEventW(NULL, FALSE, FALSE, L"Steam3Master_SharedMemLock");
  CreateEventW(NULL, FALSE, FALSE, L"Global\\Valve_SteamIPC_Class");
  logf("ActiveProcess\\pid=%lu -> %ld", pid, RegSetKeyValueW(HKEY_CURRENT_USER, L"Software\\Valve\\Steam\\ActiveProcess",
       L"pid", REG_DWORD, &pid, sizeof(pid)));
  /* DIPC_CLIENTDLL=<win path>: register a steamclient.dll the way Proton's lsteamclient
   * steamclient_init_registry does (spike 037) -- HKCU only; HKLM\Software\Valve\Steam stays absent
   * because its presence diverts the game into "steam.exe -applaunch" (036 o1). */
  if (getenv("DIPC_CLIENTDLL")) {
    const char *dll = getenv("DIPC_CLIENTDLL");
    logf("SteamClientDll=%s -> %ld", dll, RegSetKeyValueA(HKEY_CURRENT_USER, "Software\\Valve\\Steam\\ActiveProcess",
         "SteamClientDll", REG_SZ, dll, (DWORD)strlen(dll) + 1));
    const char *dll64 = getenv("DIPC_CLIENTDLL64") ? getenv("DIPC_CLIENTDLL64") : dll;   /* 038: x64 games read this one */
    logf("SteamClientDll64=%s", dll64);
    RegSetKeyValueA(HKEY_CURRENT_USER, "Software\\Valve\\Steam\\ActiveProcess", "SteamClientDll64", REG_SZ, dll64, (DWORD)strlen(dll64) + 1);
    RegSetKeyValueA(HKEY_CURRENT_USER, "Software\\Valve\\Steam\\ActiveProcess", "Universe", REG_SZ, "Public", 7);
  }
  SetEnvironmentVariableA("SteamPath", "C:\\Program Files (x86)\\Steam");
  if (!getenv("SteamGameId")) SetEnvironmentVariableA("SteamGameId", "200510");
  if (!getenv("SteamAppId")) SetEnvironmentVariableA("SteamAppId", "200510");
  /* the env a real Steam client launch carries (DIPC_STEAMENV=0 to omit) */
  if (!(getenv("DIPC_STEAMENV") && getenv("DIPC_STEAMENV")[0] == '0')) {
    SetEnvironmentVariableA("SteamClientLaunch", "1"); SetEnvironmentVariableA("SteamEnv", "1");
    SetEnvironmentVariableA("SteamOverlayGameId", "200510");
  }
  /* Proton's steam.exe also sets ValvePlatformMutex = the (game) exe path with forward slashes */
  if (!(getenv("DIPC_VPM") && getenv("DIPC_VPM")[0] == '0')) {
    char vpm[MAX_PATH]; GetFullPathNameA(argv[1], MAX_PATH, vpm, NULL);
    for (char *q = vpm; *q; q++) if (*q == '\\') *q = '/';
    SetEnvironmentVariableA("ValvePlatformMutex", vpm);
    logf("ValvePlatformMutex=%s", vpm);
  }

  CreateThread(NULL, 0, drm_thread, NULL, 0, NULL);
  Sleep(100); /* semaphores exist before the game can look for them */

  for (int i = 1; i < argc; i++) { strcat(cmd, "\""); strcat(cmd, argv[i]); strcat(cmd, "\" "); }
  if (!CreateProcessA(NULL, cmd, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) {
    logf("CreateProcess(%s) failed err %lu", cmd, GetLastError()); return 3;
  }
  g_child = pi.dwProcessId;
  logf("game started pid=%lu cmd=%s", pi.dwProcessId, cmd);
  WaitForSingleObject(pi.hProcess, INFINITE);
  GetExitCodeProcess(pi.hProcess, &code);
  logf("game exited code=%lu (0x%08lx)", code, code);
  /* DIPC_RELAUNCH=N: act like Steam answering a STEAMSTART request -- start the game again */
  for (int r = 0, max = getenv("DIPC_RELAUNCH") ? atoi(getenv("DIPC_RELAUNCH")) : 0; r < max; r++) {
    DWORD t = GetTickCount();
    CloseHandle(pi.hProcess); CloseHandle(pi.hThread);
    if (!CreateProcessA(NULL, cmd, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) { logf("relaunch failed %lu", GetLastError()); break; }
    g_child = pi.dwProcessId;
    logf("relaunch %d: pid=%lu", r + 1, pi.dwProcessId);
    WaitForSingleObject(pi.hProcess, INFINITE);
    GetExitCodeProcess(pi.hProcess, &code);
    logf("relaunch %d exited code=%lu after %lums", r + 1, code, GetTickCount() - t);
  }
  return (int)code;
}
