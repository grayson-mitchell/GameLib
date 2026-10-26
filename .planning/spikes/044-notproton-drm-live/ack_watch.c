/* Spike 044 run 3: signal the CEG start ACK with the access genuine Steam uses.
 *
 * Runs beside NotProton's steam.exe in the same prefix. It creates no DIPC semaphores and launches
 * nothing, so it does not race steam.exe for the start request; it only polls the named-object
 * directories for STEAM_START_ACK_EVENT_* and SetEvent()s each new one, opened with
 * SYNCHRONIZE|EVENT_MODIFY_STATE (0x100002, the mask in spike 036's genuine-Steam oracle) where
 * NotProton's helper opens it SYNCHRONIZE-only (0x100000).
 *
 * usage: ack_watch.exe [seconds]   (default 120)
 * env:   ACK_LOG overrides C:\ack044.log; ACK_DELAY_MS waits before signalling (default 0) */
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
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

static pNtOpenDirectoryObject nt_open;
static pNtQueryDirectoryObject nt_query;
static wchar_t g_done[32][128];
static int g_ndone;

static int already(const wchar_t *name) {
  for (int i = 0; i < g_ndone; i++) if (!wcscmp(g_done[i], name)) return 1;
  return 0;
}

/* Scan one named-object directory; ACK every STEAM_START_ACK_EVENT* not yet signalled. */
static void scan(const wchar_t *dirname, DWORD delay) {
  USTR us = { (USHORT)(wcslen(dirname) * 2), (USHORT)(wcslen(dirname) * 2 + 2), (PWSTR)dirname };
  OATTR oa = { sizeof(oa), NULL, &us, 0, NULL, NULL };
  HANDLE dir; ULONG ctx = 0, size; char buf[2048]; DIRINFO *di = (DIRINFO *)buf;
  if (nt_open(&dir, 0x0001 /* DIRECTORY_QUERY */, &oa)) return;
  NTSTATUS st = nt_query(dir, buf, sizeof(buf), TRUE, TRUE, &ctx, &size);
  while (!st) {
    if (di->ObjectName.Buffer && di->ObjectName.Length / 2 < 128 &&
        !wcsncmp(di->ObjectName.Buffer, L"STEAM_START_ACK_EVENT", 21)) {
      wchar_t name[128]; swprintf(name, 128, L"%.*ls", di->ObjectName.Length / 2, di->ObjectName.Buffer);
      if (!already(name) && g_ndone < 32) {
        HANDLE ev;
        wcscpy(g_done[g_ndone++], name);
        logf("saw %ls in %ls", name, dirname);
        if (delay) Sleep(delay);
        /* Control first: does the SYNCHRONIZE-only mask NotProton's helper uses signal it alone? */
        ev = OpenEventW(SYNCHRONIZE, FALSE, name);
        if (ev) {
          BOOL ok = SetEvent(ev);
          logf("  control SetEvent(0x100000 handle) -> %d err %lu", ok, ok ? 0 : GetLastError());
          CloseHandle(ev);
        }
        ev = OpenEventW(SYNCHRONIZE | EVENT_MODIFY_STATE, FALSE, name);
        if (!ev) logf("  open FAILED err %lu", GetLastError());
        else {
          BOOL ok = SetEvent(ev);
          logf("  SetEvent(0x100002 handle) -> %d err %lu", ok, ok ? 0 : GetLastError());
          CloseHandle(ev);
        }
      }
    }
    st = nt_query(dir, buf, sizeof(buf), TRUE, FALSE, &ctx, &size);
  }
  CloseHandle(dir);
}

int main(int argc, char **argv) {
  const char *lp = getenv("ACK_LOG"), *dl = getenv("ACK_DELAY_MS");
  DWORD secs = argc > 1 ? (DWORD)atoi(argv[1]) : 120, delay = dl ? (DWORD)atoi(dl) : 0;
  g_t0 = GetTickCount();
  g_log = fopen(lp ? lp : "C:\\ack044.log", "w"); if (!g_log) g_log = stderr;
  nt_open = (pNtOpenDirectoryObject)GetProcAddress(GetModuleHandleA("ntdll"), "NtOpenDirectoryObject");
  nt_query = (pNtQueryDirectoryObject)GetProcAddress(GetModuleHandleA("ntdll"), "NtQueryDirectoryObject");
  logf("ack_watch: polling %lus, delay %lums", (unsigned long)secs, (unsigned long)delay);
  while (GetTickCount() - g_t0 < secs * 1000) {
    scan(L"\\BaseNamedObjects\\Session\\1", delay);
    scan(L"\\Sessions\\1\\BaseNamedObjects", delay);
    scan(L"\\BaseNamedObjects", delay);
    Sleep(5);
  }
  logf("ack_watch: done, %d ACK event(s) handled", g_ndone);
  return 0;
}
