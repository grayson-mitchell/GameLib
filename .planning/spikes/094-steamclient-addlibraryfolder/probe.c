// Spike 094: IClientAppManager::AddLibraryFolder / RemoveLibraryFolder.
//
// Same trust model as spike 090's probe: the production helper header finds
// the getter by a fork()ed RTTI scan and each method by its unique IPC
// function-ID high half. No hard-coded slots.
//
// Shapes from proxy disassembly (steamclient.dylib of 2026-11-13, 53,044,832 B):
//   AddLibraryFolder    0x16a14c18  int32 (const char *path)   path sent as a C string
//   RemoveLibraryFolder 0xbc0b4ad0  int32 (int32 idx, bool, bool)  both bools sent, 1 byte each;
//                                   their meaning is unknown, so this probe only ever sends 0,0
//
//   probe folders                 GetNumLibraryFolders / GetLibraryFolderPath
//   probe add <path>              AddLibraryFolder
//   probe remove <index>          RemoveLibraryFolder(index, false, false)
//   probe refresh                 RefreshLibraryFolders (shape not checked: not called)
//
// One JSON object per line on stdout (Steam's own prints go to stderr).
#include "../../../native/steam-bridge/helper/gamelib_installapp.h"

#define FN_ADDFOLDER 0x16a1u     // AddLibraryFolder    (0x16a14ce3 in 066's map)
#define FN_REMOVEFOLDER 0xbc0bu  // RemoveLibraryFolder (0xbc0b4a29 in 066's map)

static void *apm;
static void **avt;

static void list_folders(void) {
  int sn = gl_ia_find_method_slot(avt, GL_IA_FN_NUMFOLDERS);
  int sp = gl_ia_find_method_slot(avt, GL_IA_FN_FOLDERPATH);
  if (sn < 0 || sp < 0) {
    gl_ia_emit("{\"step\":\"folders\",\"ok\":false}");
    return;
  }
  int n = gl_ia_list_folders(apm, sn, sp);
  char esc[2048];
  gl_ia_emit("{\"step\":\"folders\",\"count\":%d}", n);
  for (int i = 0; i < n; i++) {
    gl_ia_json_escape(esc, sizeof esc, gl_ia_folders[i]);
    gl_ia_emit("{\"step\":\"folder\",\"index\":%d,\"path\":\"%s\"}", i, esc);
  }
}

int main(int argc, char **argv) {
  const char *mode = argc > 1 ? argv[1] : "folders";

  fflush(NULL);
  gl_ia_out_fd = dup(1);
  dup2(2, 1);

  const char *reason = NULL;
  int gslot = gl_ia_find_getter_slot(&reason);
  if (gslot < 0) {
    gl_ia_emit("{\"step\":\"getter\",\"ok\":false,\"reason\":\"%s\"}", reason ? reason : "?");
    return 2;
  }
  gl_ia_session s = {0};
  const char *why = gl_ia_attach(&s);
  if (why) {
    gl_ia_emit("{\"step\":\"attach\",\"ok\":false,\"reason\":\"%s\"}", why);
    return 2;
  }
  apm = gl_ia_call_getter(&s, gslot);
  if (!apm || !strstr(gl_ia_rtti(apm), "IClientAppManager")) {
    gl_ia_emit("{\"step\":\"guard\",\"ok\":false,\"rtti\":\"%s\"}", gl_ia_rtti(apm));
    return 2;
  }
  avt = gl_ia_vt(apm);
  long t = (long)time(NULL);

  int sadd = gl_ia_find_method_slot(avt, FN_ADDFOLDER);
  int srem = gl_ia_find_method_slot(avt, FN_REMOVEFOLDER);
  // Neighbour guard: 066 has Add at 77, SetLabel 78, GetLabel 79, Remove 80.
  int guard = sadd >= 0 && srem == sadd + 3;
  gl_ia_emit("{\"step\":\"slots\",\"add\":%d,\"remove\":%d,\"guard\":%s}", sadd, srem,
             guard ? "true" : "false");
  if (!guard) return 2;

  if (!strcmp(mode, "folders")) {
    list_folders();
    return 0;
  }

  // Unfiltered listing: gl_ia_list_folders() returns -1 as soon as one entry is
  // empty or not a directory, which hides a gap left by RemoveLibraryFolder.
  if (!strcmp(mode, "rawfolders")) {
    int sn = gl_ia_find_method_slot(avt, GL_IA_FN_NUMFOLDERS);
    int sp = gl_ia_find_method_slot(avt, GL_IA_FN_FOLDERPATH);
    uint32_t n = ((uint32_t (*)(void *))avt[sn])(apm);
    gl_ia_emit("{\"step\":\"rawfolders\",\"count\":%u}", n);
    for (uint32_t i = 0; i < n && i < 16; i++) {
      char buf[1024] = {0}, esc[2048];
      int32_t r = ((int32_t (*)(void *, int32_t, char *, int32_t))avt[sp])(apm, (int32_t)i, buf, sizeof buf);
      gl_ia_json_escape(esc, sizeof esc, buf);
      gl_ia_emit("{\"step\":\"raw\",\"index\":%u,\"ret\":%d,\"path\":\"%s\"}", i, r, esc);
    }
    return 0;
  }

  if (!strcmp(mode, "add") && argc > 2) {
    char esc[2048];
    gl_ia_json_escape(esc, sizeof esc, argv[2]);
    int32_t r = ((int32_t (*)(void *, const char *))avt[sadd])(apm, argv[2]);
    gl_ia_emit("{\"step\":\"AddLibraryFolder\",\"t\":%ld,\"path\":\"%s\",\"ret\":%d}", t, esc, r);
    list_folders();
    return 0;
  }

  if (!strcmp(mode, "remove") && argc > 2) {
    int32_t idx = (int32_t)atoi(argv[2]);
    if (idx <= 0) {
      gl_ia_emit("{\"step\":\"remove\",\"ok\":false,\"reason\":\"refusing folder 0 or bad index\"}");
      return 64;
    }
    int32_t r = ((int32_t (*)(void *, int32_t, bool, bool))avt[srem])(apm, idx, false, false);
    gl_ia_emit("{\"step\":\"RemoveLibraryFolder\",\"t\":%ld,\"index\":%d,\"b1\":0,\"b2\":0,\"ret\":%d}", t, idx, r);
    list_folders();
    return 0;
  }

  gl_ia_emit("{\"step\":\"usage\"}");
  return 64;
}
