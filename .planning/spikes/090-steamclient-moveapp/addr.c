// Prints each IClientAppManager slot's offset in steamclient.dylib (for otool/lldb).
#include "../../../native/steam-bridge/helper/gamelib_installapp.h"
int main(int argc, char **argv) {
  fflush(NULL); gl_ia_out_fd = dup(1); dup2(2, 1);
  const char *r = NULL; int g = gl_ia_find_getter_slot(&r); if (g < 0) return 2;
  gl_ia_session s = {0}; if (gl_ia_attach(&s)) return 2;
  void *apm = gl_ia_call_getter(&s, g); void **vt = gl_ia_vt(apm);
  for (int i = 1; i < argc; i++) {
    int slot = atoi(argv[i]); Dl_info di; dladdr(vt[slot], &di);
    gl_ia_emit("{\"slot\":%d,\"off\":\"0x%lx\",\"hi\":\"0x%x\"}", slot,
               (unsigned long)((char *)vt[slot] - (char *)di.dli_fbase), gl_ia_slot_hi(vt, slot));
  }
  return 0;
}
