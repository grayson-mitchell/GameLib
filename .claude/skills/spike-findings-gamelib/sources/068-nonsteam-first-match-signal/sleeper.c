#include <windows.h>
#include <stdio.h>
int main(void) {
  FILE *f = fopen("sleeper.txt", "w");
  if (f) { fwprintf(f, L"%ls\n", GetCommandLineW()); fclose(f); }
  Sleep(30000);
  return 0;
}
