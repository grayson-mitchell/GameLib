/*
 * Spike 034a positive-control probe: an x86 GL app that imports steam_api.dll (so the shim loads at
 * process start, as it does for a game) and OPENGL32!wglGetProcAddress (so the shim has an IAT slot to
 * redirect). Creates a legacy context exactly like a GLEW-era engine, reads wglGetExtensionsStringARB
 * and reports whether WGL_ARB_create_context* tokens are visible. Result -> glprobe.txt beside the exe.
 */
#include <windows.h>
#include <GL/gl.h>
#include <stdio.h>
#include <string.h>

__declspec(dllimport) int __cdecl SteamAPI_IsSteamRunning(void);
int (__cdecl *volatile g_keep_import)(void) = SteamAPI_IsSteamRunning; /* import only, never called */

typedef const char *(WINAPI *PFN_extARB)(HDC);

static int count_prefix(const char *s, const char *prefix) {
  int n = 0; size_t pl = strlen(prefix);
  while (s && *s) {
    while (*s == ' ') s++;
    const char *e = s; while (*e && *e != ' ') e++;
    if ((size_t)(e - s) >= pl && strncmp(s, prefix, pl) == 0) n++;
    s = e;
  }
  return n;
}

int main(void) {
  char out[MAX_PATH]; GetModuleFileNameA(NULL, out, sizeof out);
  strcpy(strrchr(out, '\\') + 1, "glprobe.txt");
  FILE *f = fopen(out, "w"); if (!f) return 2;

  WNDCLASSA wc = {0}; wc.lpfnWndProc = DefWindowProcA; wc.hInstance = GetModuleHandleA(NULL); wc.lpszClassName = "glprobe";
  RegisterClassA(&wc);
  HWND w = CreateWindowA("glprobe", "glprobe", WS_OVERLAPPEDWINDOW, 0, 0, 64, 64, NULL, NULL, wc.hInstance, NULL);
  HDC dc = GetDC(w);
  PIXELFORMATDESCRIPTOR pfd = {sizeof pfd, 1, PFD_DRAW_TO_WINDOW | PFD_SUPPORT_OPENGL | PFD_DOUBLEBUFFER, PFD_TYPE_RGBA, 32};
  pfd.cDepthBits = 24;
  int pf = ChoosePixelFormat(dc, &pfd);
  if (!pf || !SetPixelFormat(dc, pf, &pfd)) { fprintf(f, "result=ERROR pixelformat\n"); fclose(f); return 3; }
  HGLRC rc = wglCreateContext(dc);
  if (!rc || !wglMakeCurrent(dc, rc)) { fprintf(f, "result=ERROR context\n"); fclose(f); return 4; }

  PFN_extARB ext = (PFN_extARB)wglGetProcAddress("wglGetExtensionsStringARB");
  const char *s = ext ? ext(dc) : NULL;
  fprintf(f, "gl_version=%s\n", (const char *)glGetString(GL_VERSION));
  fprintf(f, "wglGetExtensionsStringARB=%s\n", ext ? "present" : "absent");
  fprintf(f, "create_context_tokens=%d\n", count_prefix(s, "WGL_ARB_create_context"));
  fprintf(f, "total_tokens=%d\n", count_prefix(s, ""));
  fprintf(f, "extensions=%s\n", s ? s : "(null)");
  fprintf(f, "result=OK\n");
  fclose(f);
  wglMakeCurrent(NULL, NULL); wglDeleteContext(rc); ReleaseDC(w, dc); DestroyWindow(w);
  return 0;
}
