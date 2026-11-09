/* Spike 036: dump the environment block of a running process (default XCOMLauncher.exe) by reading its
 * PEB, to learn what a genuine Steam launch puts in a game's environment. Writes C:\envdump036.txt.
 * Values are printed only for Steam/Valve/SDL-prefixed keys; everything else is NAME=<len> (privacy). */
#include <windows.h>
#include <tlhelp32.h>
#include <stdio.h>
#include <wchar.h>
typedef LONG (NTAPI *pNtQIP)(HANDLE, int, PVOID, ULONG, PULONG);
typedef struct { PVOID r1; PVOID PebBaseAddress; PVOID r2[2]; ULONG_PTR pid; PVOID r3; } PBI;
static int show(const wchar_t *k) {
  return !_wcsnicmp(k, L"Steam", 5) || !_wcsnicmp(k, L"Valve", 5) || !_wcsnicmp(k, L"SDL_", 4) ||
         !_wcsnicmp(k, L"Enable", 6) || !_wcsnicmp(k, L"Game", 4) || !_wcsnicmp(k, L"ENABLE_VK", 9);
}
int main(int argc, char **argv) {
  const char *target = argc > 1 ? argv[1] : "XCOMLauncher.exe";
  FILE *out = fopen("C:\\envdump036.txt", "w"); PROCESSENTRY32 pe = { sizeof(pe) }; DWORD pid = 0, ppid = 0;
  HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  for (BOOL ok = Process32First(snap, &pe); ok; ok = Process32Next(snap, &pe)) {
    fprintf(out, "proc %lu parent %lu %s\n", pe.th32ProcessID, pe.th32ParentProcessID, pe.szExeFile);
    if (!_stricmp(pe.szExeFile, target)) { pid = pe.th32ProcessID; ppid = pe.th32ParentProcessID; }
  }
  if (!pid) { fprintf(out, "target %s not found\n", target); return 1; }
  HANDLE h = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, pid);
  PBI pbi; ULONG n; BYTE peb[0x48]; BYTE pp[0x4c]; PVOID envp; SIZE_T rd;
  pNtQIP q = (pNtQIP)GetProcAddress(GetModuleHandleA("ntdll"), "NtQueryInformationProcess");
  q(h, 0, &pbi, sizeof(pbi), &n);
  ReadProcessMemory(h, pbi.PebBaseAddress, peb, sizeof(peb), &rd);
  PVOID params = *(PVOID *)(peb + 0x10);                    /* PEB32.ProcessParameters */
  ReadProcessMemory(h, params, pp, sizeof(pp), &rd);
  envp = *(PVOID *)(pp + 0x48);                              /* RTL_USER_PROCESS_PARAMETERS32.Environment */
  static wchar_t env[65536]; rd = 0;
  for (SIZE_T off = 0, got; off < sizeof(env) - 4096; off += got) {   /* page-sized reads: stop at the region end */
    SIZE_T chunk = 4096 - (((ULONG_PTR)envp + off) & 4095);
    if (!ReadProcessMemory(h, (BYTE *)envp + off, (BYTE *)env + off, chunk, &got) || !got) break;
    rd = off + got;
  }
  fprintf(out, "target %s pid %lu parent %lu env@%p read %lu\n", target, pid, ppid, envp, (unsigned long)rd);
  for (wchar_t *e = env; *e && (BYTE *)e < (BYTE *)env + rd; e += wcslen(e) + 1) {
    wchar_t *eq = wcschr(e + 1, L'='); if (!eq) continue;
    *eq = 0;
    if (show(e)) fprintf(out, "  %ls=%ls\n", e, eq + 1); else fprintf(out, "  %ls=<%u chars>\n", e, (unsigned)wcslen(eq + 1));
    *eq = L'=';
  }
  fclose(out); return 0;
}
