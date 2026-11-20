// Spikes 090 (MoveApp) and 091 (StartValidatingApp repair).
//
// Reuses the PRODUCTION helper's trust model by including its header:
// gl_ia_attach (dlopen + engine slots 0/3), gl_ia_find_getter_slot (fork()ed
// RTTI scan for GetIClientAppManager) and gl_ia_find_method_slot (IPC
// function-ID high half, unique match only). No IClientAppManager method is
// called on a hard-coded slot: steamclient.dylib changed on 2026-11-13, after
// 066 mapped the slots.
//
//   probe status   <appId>          read-only: state, folder, dir, folders, slots
//   probe canmove  <appId> <folder> CanMoveApp
//   probe move     <appId> <folder> MoveApp
//   probe progress <appId>          GetMoveAppProgress
//   probe cancelmove <appId>        CancelMoveApp
//   probe validate <appId>          StartValidatingApp
//   probe cancelvalidate <appId>    CancelValidation
//
// One JSON object per line on stdout (Steam's own prints go to stderr).
#include "../../../native/steam-bridge/helper/gamelib_installapp.h"

// IPC function-ID high halves, from 066 slotmap.txt (full IDs in brackets).
#define FN_INSTALLSTATE 0xeaf2u   // GetAppInstallState      (0xeaf261b3)
#define FN_INSTALLDIR 0x369au     // GetAppInstallDir        (0x369a58d3)
#define FN_UPTODATE 0x5016u       // BIsAppUpToDate          (0x5016b41e)
#define FN_VALIDATE 0x5078u       // StartValidatingApp      (0x507803d4)
#define FN_CANCELVALID 0x9949u    // CancelValidation        (0x9949ca74)
#define FN_CANMOVE 0x68b2u        // CanMoveApp              (0x68b2f951)
#define FN_MOVE 0x4780u           // MoveApp                 (0x47804aad)
#define FN_MOVEPROG 0x5523u       // GetMoveAppProgress      (0x55236b92)
#define FN_CANCELMOVE 0x4309u     // CancelMoveApp           (0x43090df2)
#define FN_APPFOLDER 0x166eu      // GetAppLibraryFolder     (0x166ebab8)

static void *apm;
static void **avt;

static int slot_of(uint32_t hi, const char *name) {
  int s = gl_ia_find_method_slot(avt, hi);
  if (s < 0) gl_ia_emit("{\"step\":\"slot\",\"method\":\"%s\",\"ok\":false}", name);
  return s;
}
#define REQ(var, hi, name)       \
  int var = slot_of(hi, name);   \
  if (var < 0) return 2;

int main(int argc, char **argv) {
  const char *mode = argc > 1 ? argv[1] : "status";
  uint32_t app = argc > 2 ? (uint32_t)strtoul(argv[2], NULL, 10) : 0;
  int32_t folder = argc > 3 ? (int32_t)atoi(argv[3]) : -1;

  // Keep fd 1 for our JSON lines only.
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

  if (!strcmp(mode, "status")) {
    REQ(sst, FN_INSTALLSTATE, "GetAppInstallState");
    REQ(sdir, FN_INSTALLDIR, "GetAppInstallDir");
    REQ(sup, FN_UPTODATE, "BIsAppUpToDate");
    REQ(sfold, FN_APPFOLDER, "GetAppLibraryFolder");
    int sn = gl_ia_find_method_slot(avt, GL_IA_FN_NUMFOLDERS);
    int sp = gl_ia_find_method_slot(avt, GL_IA_FN_FOLDERPATH);
    uint32_t st = ((uint32_t (*)(void *, uint32_t))avt[sst])(apm, app);
    char dir[1024] = {0};
    uint32_t dr = ((uint32_t (*)(void *, uint32_t, char *, uint32_t))avt[sdir])(apm, app, dir, sizeof dir);
    int up = ((int (*)(void *, uint32_t))avt[sup])(apm, app) & 0xff;
    int32_t f = ((int32_t (*)(void *, uint32_t))avt[sfold])(apm, app);
    char esc[2048];
    gl_ia_json_escape(esc, sizeof esc, dir);
    gl_ia_emit("{\"step\":\"status\",\"t\":%ld,\"appId\":%u,\"installState\":%u,\"upToDate\":%d,"
               "\"libraryFolder\":%d,\"installDirRet\":%u,\"installDir\":\"%s\",\"getterSlot\":%d,"
               "\"slots\":{\"state\":%d,\"dir\":%d,\"upToDate\":%d,\"appFolder\":%d,\"validate\":%d,"
               "\"canMove\":%d,\"move\":%d,\"moveProgress\":%d,\"cancelMove\":%d}}",
               t, app, st, up, f, dr, esc, gslot, sst, sdir, sup, sfold,
               gl_ia_find_method_slot(avt, FN_VALIDATE), gl_ia_find_method_slot(avt, FN_CANMOVE),
               gl_ia_find_method_slot(avt, FN_MOVE), gl_ia_find_method_slot(avt, FN_MOVEPROG),
               gl_ia_find_method_slot(avt, FN_CANCELMOVE));
    if (sn >= 0 && sp >= 0) {
      int n = gl_ia_list_folders(apm, sn, sp);
      for (int i = 0; i < n; i++) {
        gl_ia_json_escape(esc, sizeof esc, gl_ia_folders[i]);
        gl_ia_emit("{\"step\":\"folder\",\"index\":%d,\"path\":\"%s\"}", i, esc);
      }
    }
    return 0;
  }

  // CanMoveApp on this build (proxy disassembly, 2026-11-20): serializes ONLY
  // appId; the 2nd arg is an OUT pointer the reply writes 4 bytes into. The
  // OpenSteamClient shape (appId, LibraryFolder_t) segfaulted for folder 1.
  if (!strcmp(mode, "canmove")) {
    REQ(sl, FN_CANMOVE, "CanMoveApp");
    uint32_t out = 0xdeadbeefu;
    uint32_t r = ((uint32_t (*)(void *, uint32_t, uint32_t *))avt[sl])(apm, app, &out);
    gl_ia_emit("{\"step\":\"CanMoveApp\",\"t\":%ld,\"appId\":%u,\"ret\":%u,\"out\":%u,\"slot\":%d}", t, app, r, out, sl);
    return 0;
  }

  if (!strcmp(mode, "move") && folder >= 0) {
    REQ(sl, FN_MOVE, "MoveApp");
    uint32_t err = ((uint32_t (*)(void *, uint32_t, int32_t))avt[sl])(apm, app, folder);
    gl_ia_emit("{\"step\":\"MoveApp\",\"t\":%ld,\"appId\":%u,\"folder\":%d,\"EAppUpdateError\":%u,\"slot\":%d}", t, app, folder, err, sl);
    return 0;
  }

  if (!strcmp(mode, "progress")) {
    REQ(sl, FN_MOVEPROG, "GetMoveAppProgress");
    uint64_t a = 0xdeadbeefull, b = 0xdeadbeefull;
    uint32_t c = 0xdeadbeefu;
    uint32_t r = ((uint32_t (*)(void *, uint32_t, uint64_t *, uint64_t *, uint32_t *))avt[sl])(apm, app, &a, &b, &c);
    gl_ia_emit("{\"step\":\"GetMoveAppProgress\",\"t\":%ld,\"appId\":%u,\"ret\":%u,\"a\":%llu,\"b\":%llu,\"c\":%u}",
               t, app, r, (unsigned long long)a, (unsigned long long)b, c);
    return 0;
  }

  if (!strcmp(mode, "cancelmove")) {
    REQ(sl, FN_CANCELMOVE, "CancelMoveApp");
    uint32_t r = ((uint32_t (*)(void *, uint32_t))avt[sl])(apm, app);
    gl_ia_emit("{\"step\":\"CancelMoveApp\",\"t\":%ld,\"appId\":%u,\"ret\":%u}", t, app, r);
    return 0;
  }

  if (!strcmp(mode, "validate")) {
    REQ(sl, FN_VALIDATE, "StartValidatingApp");
    int ok = ((int (*)(void *, uint32_t))avt[sl])(apm, app) & 0xff;
    gl_ia_emit("{\"step\":\"StartValidatingApp\",\"t\":%ld,\"appId\":%u,\"ret\":%d,\"slot\":%d}", t, app, ok, sl);
    return 0;
  }

  if (!strcmp(mode, "cancelvalidate")) {
    REQ(sl, FN_CANCELVALID, "CancelValidation");
    uint32_t r = ((uint32_t (*)(void *, uint32_t))avt[sl])(apm, app);
    gl_ia_emit("{\"step\":\"CancelValidation\",\"t\":%ld,\"appId\":%u,\"ret\":%u}", t, app, r);
    return 0;
  }

  gl_ia_emit("{\"step\":\"usage\"}");
  return 64;
}
