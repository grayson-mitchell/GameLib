/*
 * gamelib_installapp.h -- GameLib-owned (not Valve / Wine code).
 *
 * quick 261105-ord. `steam-bridge-helper --steam-installapp <appId>
 * [--library <absPath>] [--dry-run]` asks the RUNNING native macOS Steam client
 * to install / adopt an app through its internal
 * IClientEngine -> IClientAppManager::InstallApp (spikes 065 / 066).
 *
 * Nothing Valve-licensed is shipped: this dlopen()s the user's own
 * steamclient.dylib from its fixed per-user path, exactly as libsteam_api
 * already is.
 *
 * Trust model. The interface is undocumented and changes between Steam builds,
 * so NOTHING is called on a hard-coded slot unless it has been verified at run
 * time:
 *   - Engine slots 0 (CreateSteamPipe) and 3 (ConnectToGlobalUser) are the
 *     stable vtable prefix and are guarded by their return values
 *     (0 = Steam not running / no signed-in user).
 *   - GetIClientAppManager is NOT stable (header said 45, this build is 43;
 *     slots 42 and 48 crashed the 065 probe). Its slot is found by calling each
 *     candidate in a fork()ed, disposable child that dlopens on its own; the
 *     child reports the RTTI name of what came back. A crash or a timeout just
 *     means "not this slot". The parent never calls an unverified slot: it only
 *     calls the slot a child already proved returns an IClientAppManager, and it
 *     re-verifies the RTTI name before using the pointer.
 *   - App-manager methods are located by their IPC function ID (the proxy
 *     methods load `movz wN,#lo; movk wN,#hi,lsl #16` plus interface id 17).
 *     This reads code bytes only and calls nothing. A method is verified only
 *     when exactly one slot carries its high half. Serializer argument sizes
 *     are NOT decoded: the InstallApp guard is that the NEXT slot carries
 *     UninstallApp's ID (the 065 neighbour order).
 *
 * quick 261106-s3n. `steam-bridge-helper --steam-uninstallapp <appId>
 * [--dry-run]` asks the same running client to UninstallApp (spike 067). The
 * UninstallApp slot is only called when it is the verified InstallApp slot + 1
 * and carries the unique 0x4505 function ID; GetNumInstalledApps (0xde40) is
 * only called on its own unique slot, otherwise installedApps is reported -1.
 *   {"result":"ok","appId":N,"eAppUpdateError":0,...}              exit 0
 *   {"result":"error","appId":N,"eAppUpdateError":E,"installedApps":K} exit 3
 * (error 18 with installedApps 0 = signed-out Steam; nothing was deleted.)
 *
 * quick 261120-p2j. `steam-bridge-helper --steam-validateapp <appId> [--wait]
 * [--dry-run]` asks the same running client to StartValidatingApp (Verify,
 * spike 069: silent, no Steam window). The slot is only called when it is
 * resolved by its unique 0x5078 function ID and CancelValidation (0x9949) sits
 * at that slot + 1. With --wait it then polls GetAppInstallState /
 * GetDownloadingAppID once a second until Steam reports the app inactive (a
 * validate never moves the ACF, so IPC state is the only completion signal).
 *   {"result":"ok","tracked":true,"finished":B,"installState":N[,"reason":"..."]}
 *   {"result":"refused"}                                            exit 3
 *
 * quick 261122-9sl. `steam-bridge-helper --steam-moveapp <appId> --library <absPath>
 * [--wait] [--dry-run]` asks the same running client to CanMoveApp then MoveApp
 * (spike 090: Steam moves the files and ACF itself, no window). MoveApp is only
 * called when its unique 0x4780 ID sits in the run CanMoveApp (-1),
 * GetMoveAppProgress (+1), CancelMoveApp (+2), each by its own unique ID.
 * CancelMoveApp is never called. The folder index comes from Steam's own
 * folder list (the same match --steam-installapp --library does). With --wait it
 * polls GetMoveAppProgress / GetAppLibraryFolder / GetAppInstallState once a
 * second until the move has finished and the post-move verify has settled.
 *   {"result":"ok","tracked":true,"finished":B,"installState":N,"folderIndex":T,
 *    "fromFolder":F[,"reason":"..."]}                                exit 0
 *   {"result":"refused","appId":N,"reason":"not-installed|already-in-folder"} exit 3
 *   {"result":"error","appId":N,"stage":"CanMoveApp|MoveApp","eAppUpdateError":E} exit 3
 *
 * quick 261122-n4q. `--steam-moveapp <appId> --library <absPath> --add-library
 * [--wait] [--dry-run]` also registers a folder Steam does not list as a library
 * (spike 094): IClientAppManager::AddLibraryFolder(path) returns the new folder's
 * index and MoveApp then targets THAT RETURNED INDEX, never a list position (Steam
 * reuses gaps from the top). It runs only when the picked folder matches none of
 * Steam's live folders, after the refusals and a read-only CanMoveApp, so a refused
 * move never leaves a new library behind. The slot is called only when its unique
 * 0x16a1 ID resolves and RemoveLibraryFolder's unique 0xbc0b sits at exactly
 * Add + 3 (guard only: Remove is never called). Without the flag an unmatched
 * library is still `unavailable library-not-registered`. Refused reasons added:
 * library-not-directory, path-too-long, inside-library, contains-library (these
 * carry folderIndex), add-library-refused (addRet), add-library-unverified
 * (folderIndex). Every non-dry-run ok line and the MoveApp-stage error line carry
 * "addedLibrary":true|false. A dry run reports "wouldAddLibrary":true and
 * "addLibrarySlot":S with folderIndex -1, and never calls Add. The dry-run
 * libraryFolders array has one entry per Steam index; a gap is "".
 *
 * Output: exactly ONE JSON line on the original stdout; everything Steam logs
 * goes to stderr (fd 1 is redirected to fd 2 while Steam code runs).
 *   {"result":"ok",...}                       exit 0
 *   {"result":"unavailable","reason":"..."}   exit 2
 *   {"result":"error",...,"eAppUpdateError":E} exit 3
 *   {"result":"usage",...}                    exit 64
 *
 * The whole body is arm64-only (the function-ID decode reads AArch64
 * instructions); other slices print `unsupported-arch`.
 */
#ifndef GAMELIB_INSTALLAPP_H
#define GAMELIB_INSTALLAPP_H

#include <dlfcn.h>
#include <fcntl.h>
#include <limits.h>
#include <poll.h>
#include <signal.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#define GL_IA_EXIT_OK 0
#define GL_IA_EXIT_UNAVAILABLE 2
#define GL_IA_EXIT_ERROR 3
#define GL_IA_EXIT_USAGE 64

#define GL_IA_FN_INSTALLAPP 0xdd9au
#define GL_IA_FN_UNINSTALLAPP 0x4505u
#define GL_IA_FN_NUMINSTALLED 0xde40u
#define GL_IA_FN_NUMFOLDERS 0xab50u
#define GL_IA_FN_FOLDERPATH 0xf27cu
/* quick 261120-p2j: Verify (StartValidatingApp) and its completion signal. */
#define GL_IA_FN_STARTVALIDATING 0x5078u
#define GL_IA_FN_CANCELVALIDATION 0x9949u
#define GL_IA_FN_INSTALLSTATE 0xeaf2u
#define GL_IA_FN_DOWNLOADINGAPP 0xae86u
/* Must track VALIDATE_WAIT_TIMEOUT_MS in steamInstallApp.ts (cap + margin). */
#define GL_IA_VALIDATE_WAIT_CAP_S 21600
#define GL_IA_VALIDATE_START_GRACE_S 20
/* UpdateQueued | UpdateRunning | UpdateStarted | Validating */
#define GL_IA_ACTIVE_STATE_MASK (0x8u | 0x100u | 0x400u | 0x20000u)
#define GL_IA_STATE_UPDATE_PAUSED 0x200u

/* quick 261122-9sl: Move (spike 090 slots 67-70, GetAppLibraryFolder). */
#define GL_IA_FN_CANMOVE 0x68b2u
#define GL_IA_FN_MOVEAPP 0x4780u
#define GL_IA_FN_MOVEPROGRESS 0x5523u
#define GL_IA_FN_CANCELMOVE 0x4309u
#define GL_IA_FN_APPLIBFOLDER 0x166eu
/* Must track MOVE_WAIT_TIMEOUT_MS in steamInstallApp.ts (cap + margin). */
#define GL_IA_MOVE_WAIT_CAP_S 21600
#define GL_IA_MOVE_START_GRACE_S 30
#define GL_IA_MOVE_SETTLE_FALLBACK_S 60
#define GL_IA_STATE_FULLY_INSTALLED 0x4u
#define GL_IA_STATE_FILES_MISSING 0x20u
/* UpdateRunning | UpdateStarted | Validating: work actually running, not queued. */
#define GL_IA_MOVE_BUSY_MASK (0x100u | 0x400u | 0x20000u)

/* quick 261122-n4q: AddLibraryFolder (spike 094 slot 77). RemoveLibraryFolder is a
 * guard only: its unique ID must sit at Add + 3, and it is never called. */
#define GL_IA_FN_ADDFOLDER 0x16a1u
#define GL_IA_FN_REMOVEFOLDER 0xbc0bu
/* Must track STEAM_LIBRARY_PATH_MAX_BYTES in steamInstallApp.ts. Steam's C-string
 * writer for AddLibraryFolder caps at 255 (spike 094), so a longer path would
 * register a truncated, different folder. */
#define GL_IA_ADD_PATH_MAX 254

#define GL_IA_CHILD_TIMEOUT_MS 3000
#define GL_IA_SCAN_CAP_MS 20000
#define GL_IA_MAX_FOLDERS 64
#define GL_IA_PATH_CAP 1024

static int gl_ia_out_fd = 1;

static void gl_ia_emit(const char *fmt, ...) {
  static char buf[GL_IA_MAX_FOLDERS * (GL_IA_PATH_CAP * 2 + 8) + 1024];
  va_list ap;
  va_start(ap, fmt);
  int n = vsnprintf(buf, sizeof buf - 2, fmt, ap);
  va_end(ap);
  if (n < 0) return;
  if ((size_t)n > sizeof buf - 2) n = (int)(sizeof buf - 2);
  buf[n++] = '\n';
  size_t off = 0;
  while (off < (size_t)n) {
    ssize_t w = write(gl_ia_out_fd, buf + off, (size_t)n - off);
    if (w <= 0) break;
    off += (size_t)w;
  }
}

/* Escape backslash and quote; control bytes become '?'. */
__attribute__((unused)) static void gl_ia_json_escape(char *dst, size_t cap, const char *src) {
  size_t o = 0;
  for (; *src && o + 3 < cap; src++) {
    unsigned char c = (unsigned char)*src;
    if (c == '\\' || c == '"') {
      dst[o++] = '\\';
      dst[o++] = (char)c;
    } else if (c < 0x20) {
      dst[o++] = '?';
    } else {
      dst[o++] = (char)c;
    }
  }
  dst[o] = '\0';
}

static int gl_ia_unavailable(const char *reason) {
  gl_ia_emit("{\"result\":\"unavailable\",\"reason\":\"%s\"}", reason);
  return GL_IA_EXIT_UNAVAILABLE;
}

static int gl_ia_usage(const char *why) {
  gl_ia_emit("{\"result\":\"usage\",\"error\":\"%s\"}", why);
  return GL_IA_EXIT_USAGE;
}

/* Absolute, bounded, no `..` segment. */
static bool gl_ia_library_arg_ok(const char *p) {
  size_t len = strlen(p);
  if (len == 0 || len >= GL_IA_PATH_CAP || p[0] != '/') return false;
  if (strstr(p, "/../") != NULL) return false;
  if (len >= 3 && strcmp(p + len - 3, "/..") == 0) return false;
  return true;
}

#if defined(__aarch64__)

typedef void *(*gl_ia_create_interface_fn)(const char *, int *);

typedef struct {
  void *engine;
  int32_t pipe;
  int32_t user;
} gl_ia_session;

static void **gl_ia_vt(void *obj) { return *(void ***)obj; }

static const char *gl_ia_rtti(void *obj) {
  if (!obj) return "(null)";
  void **vtable = gl_ia_vt(obj);
  if (!vtable) return "(no-vtable)";
  void *ti = vtable[-1];
  if (!ti) return "(no-typeinfo)";
  const char *name = *(const char **)((char *)ti + 8);
  return name ? name : "(no-name)";
}

static long gl_ia_now_ms(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (long)ts.tv_sec * 1000L + (long)(ts.tv_nsec / 1000000L);
}

/*
 * dlopen -> CreateInterface -> engine slot 0 -> engine slot 3. Returns NULL on
 * success, otherwise the reason token of the first failing step. Used by every
 * forked scan child and by the parent.
 */
static const char *gl_ia_attach(gl_ia_session *s) {
  const char *home = getenv("HOME");
  char path[GL_IA_PATH_CAP + 128];
  if (!home || !*home) return "steamclient-missing";
  int n = snprintf(path, sizeof path,
                   "%s/Library/Application Support/Steam/Steam.AppBundle/Steam/"
                   "Contents/MacOS/steamclient.dylib",
                   home);
  if (n < 0 || (size_t)n >= sizeof path) return "steamclient-missing";
  if (access(path, R_OK) != 0) return "steamclient-missing";

  void *lib = dlopen(path, RTLD_NOW | RTLD_LOCAL);
  if (!lib) return "dlopen-failed";
  gl_ia_create_interface_fn ci =
      (gl_ia_create_interface_fn)dlsym(lib, "CreateInterface");
  if (!ci) return "no-create-interface";
  int rc = 0;
  void *engine = ci("CLIENTENGINE_INTERFACE_VERSION005", &rc);
  if (!engine || !strstr(gl_ia_rtti(engine), "SteamClient")) return "no-engine";

  int32_t pipe = ((int32_t (*)(void *))gl_ia_vt(engine)[0])(engine);
  if (pipe <= 0) return "steam-not-running";
  int32_t user =
      ((int32_t (*)(void *, int32_t))gl_ia_vt(engine)[3])(engine, pipe);
  if (user <= 0) return "not-signed-in";

  s->engine = engine;
  s->pipe = pipe;
  s->user = user;
  return NULL;
}

static void *gl_ia_call_getter(gl_ia_session *s, int slot) {
  return ((void *(*)(void *, int32_t, int32_t))gl_ia_vt(s->engine)[slot])(
      s->engine, s->user, s->pipe);
}

/* Disposable child: attach, call ONE candidate getter, report, _exit. */
static void gl_ia_scan_child(int slot, int wfd) {
  alarm(4); /* backstop: the parent also SIGKILLs at the per-child timeout */
  char msg[256];
  gl_ia_session s = {0};
  const char *why = gl_ia_attach(&s);
  if (why) {
    snprintf(msg, sizeof msg, "pre:%s", why);
  } else {
    void *obj = gl_ia_call_getter(&s, slot);
    snprintf(msg, sizeof msg, "rtti:%s", gl_ia_rtti(obj));
  }
  ssize_t ignored = write(wfd, msg, strlen(msg));
  (void)ignored;
  _exit(0);
}

/* Candidate order: 43 (last verified), 45 (header), then 36..52 by distance
 * from 43. */
static int gl_ia_candidates(int *out) {
  int n = 0;
  out[n++] = 43;
  out[n++] = 45;
  for (int d = 1; d <= 7; d++) {
    int lo = 43 - d;
    int hi = 43 + d;
    if (lo >= 36 && lo != 45) out[n++] = lo;
    if (hi <= 52 && hi != 45) out[n++] = hi;
  }
  return n;
}

/* Returns the verified getter slot, or -1 with *reason set. */
static int gl_ia_find_getter_slot(const char **reason) {
  int cand[32];
  int count = gl_ia_candidates(cand);
  long started = gl_ia_now_ms();
  static char status[256];

  for (int i = 0; i < count; i++) {
    long elapsed = gl_ia_now_ms() - started;
    if (elapsed >= GL_IA_SCAN_CAP_MS) {
      *reason = "probe-timeout";
      return -1;
    }
    int fds[2];
    if (pipe(fds) != 0) {
      *reason = "app-manager-not-found";
      return -1;
    }
    fflush(NULL);
    pid_t pid = fork();
    if (pid < 0) {
      close(fds[0]);
      close(fds[1]);
      *reason = "app-manager-not-found";
      return -1;
    }
    if (pid == 0) {
      close(fds[0]);
      gl_ia_scan_child(cand[i], fds[1]);
      _exit(0);
    }
    close(fds[1]);

    long remaining = GL_IA_SCAN_CAP_MS - elapsed;
    int wait_ms = remaining < GL_IA_CHILD_TIMEOUT_MS ? (int)remaining
                                                     : GL_IA_CHILD_TIMEOUT_MS;
    struct pollfd pfd = {.fd = fds[0], .events = POLLIN, .revents = 0};
    int pr = poll(&pfd, 1, wait_ms);
    size_t got = 0;
    bool timed_out = (pr == 0);
    if (pr > 0) {
      ssize_t r = read(fds[0], status, sizeof status - 1);
      if (r > 0) got = (size_t)r;
    }
    status[got] = '\0';
    if (timed_out || got == 0) kill(pid, SIGKILL);
    close(fds[0]);
    int wst = 0;
    waitpid(pid, &wst, 0);

    if (timed_out && gl_ia_now_ms() - started >= GL_IA_SCAN_CAP_MS) {
      *reason = "probe-timeout";
      return -1;
    }
    if (strncmp(status, "pre:", 4) == 0) {
      /* A pre-getter failure is the same for every candidate: stop. */
      static char pre[128];
      snprintf(pre, sizeof pre, "%s", status + 4);
      *reason = pre;
      return -1;
    }
    if (strncmp(status, "rtti:", 5) == 0 &&
        strstr(status + 5, "IClientAppManager") != NULL) {
      return cand[i];
    }
  }
  *reason = "app-manager-not-found";
  return -1;
}

/*
 * Find the vtable slot whose proxy loads IPC function-ID high half `hi` with
 * interface id 17. Returns the slot only if exactly one slot carries it.
 * Reads code bytes only; calls nothing.
 */
static int gl_ia_slot_hi(void **vtable, int slot) {
  const uint32_t *code = (const uint32_t *)vtable[slot];
  if (!code) return -1;
  bool iface17 = false;
  for (int i = 0; i < 32; i++) {
    if ((code[i] & 0xFFFFFFE0u) == 0x52800220u) iface17 = true;
  }
  if (!iface17) return -1;
  for (int i = 0; i < 32; i++) {
    uint32_t insn = code[i];
    if ((insn & 0xFFE00000u) != 0x52800000u) continue; /* movz w, hw=0 */
    uint32_t rd = insn & 0x1Fu;
    for (int j = i + 1; j < 32 && j <= i + 8; j++) {
      uint32_t k = code[j];
      if ((k & 0xFFE0001Fu) == (0x72A00000u | rd)) { /* movk w, lsl #16 */
        return (int)((k >> 5) & 0xFFFFu);
      }
    }
  }
  return -1;
}

static int gl_ia_find_method_slot(void **vtable, uint32_t hi) {
  int found = -1;
  int matches = 0;
  for (int s = 0; s < 120; s++) {
    if (gl_ia_slot_hi(vtable, s) == (int)hi) {
      found = s;
      matches++;
    }
  }
  return matches == 1 ? found : -1;
}

/*
 * Reads Steam's own library folders. `gl_ia_folders` is indexed by STEAM index and
 * the returned count includes gaps (spike 094 step 5: a library removal leaves an
 * empty path in Steam's in-memory list, and a later AddLibraryFolder reuses gaps
 * from the top). A gap is skipped, never fatal, and every other folder keeps its
 * Steam index. Returns the count (>=1, at least one real folder) or -1 (lookup
 * unverified). GetNumLibraryFolders / GetLibraryFolderPath shapes are verified
 * (spike 094): `uint32 (this)` and `int32 (this, int32 index, char *buf, int32
 * cap)` (returns 0 and "" for a gap). A non-empty entry that is not absolute, or an
 * absolute path that is not a directory, still fails the whole lookup: non-absolute
 * output is the only run-time signal that the shape drifted (serializer sizes are
 * not decoded), and an absolute path that does not stat is a library on an
 * unmounted volume, which spike 094 lists as untested.
 */
static char gl_ia_folders[GL_IA_MAX_FOLDERS][GL_IA_PATH_CAP];

static int gl_ia_list_folders(void *apm, int slot_n, int slot_p) {
  void **vt = gl_ia_vt(apm);
  uint32_t n = ((uint32_t (*)(void *))vt[slot_n])(apm);
  if (n < 1 || n > GL_IA_MAX_FOLDERS) return -1;
  int real_count = 0;
  for (uint32_t i = 0; i < n; i++) {
    char *buf = gl_ia_folders[i];
    memset(buf, 0, GL_IA_PATH_CAP);
    ((int32_t (*)(void *, int32_t, char *, int32_t))vt[slot_p])(
        apm, (int32_t)i, buf, GL_IA_PATH_CAP);
    buf[GL_IA_PATH_CAP - 1] = '\0';
    if (buf[0] == '\0') continue; /* a gap: keep the index, skip the entry */
    struct stat st;
    if (buf[0] != '/' || stat(buf, &st) != 0 || !S_ISDIR(st.st_mode)) return -1;
    real_count++;
  }
  if (real_count < 1) return -1;
  return (int)n;
}

static bool gl_ia_folder_matches(const char *folder, const char *want) {
  char rf[PATH_MAX];
  char rw[PATH_MAX];
  if (!realpath(folder, rf) || !realpath(want, rw)) return false;
  if (strcmp(rf, rw) == 0) return true;
  char with_sa[PATH_MAX + 16];
  snprintf(with_sa, sizeof with_sa, "%s/steamapps", rf);
  return strcmp(with_sa, rw) == 0;
}

/* The first non-gap Steam index whose folder matches `want`, else -1. */
static int gl_ia_find_folder(int count, const char *want) {
  for (int i = 0; i < count; i++) {
    if (gl_ia_folders[i][0] == '\0') continue;
    if (gl_ia_folder_matches(gl_ia_folders[i], want)) return i;
  }
  return -1;
}

/* quick 261122-n4q: a strict descendant by prefix plus a '/' boundary. "/" holds
 * every other absolute path; an equal path is not within. */
static bool gl_ia_path_within(const char *root, const char *p) {
  size_t rl = strlen(root);
  while (rl > 1 && root[rl - 1] == '/') rl--;
  if (rl == 1 && root[0] == '/') return p[0] == '/' && p[1] != '\0';
  if (strncmp(p, root, rl) != 0) return false;
  return p[rl] == '/' && p[rl + 1] != '\0';
}

/* quick 261122-n4q: Steam cannot nest one library in another. NULL when the picked
 * (already realpath'd) folder neither sits inside nor contains a listed folder;
 * otherwise the refusal reason, with *conflict set to that Steam index. */
static const char *gl_ia_nesting_refusal(int count, const char *picked_real,
                                         int *conflict) {
  for (int i = 0; i < count; i++) {
    if (gl_ia_folders[i][0] == '\0') continue;
    char rf[PATH_MAX];
    const char *f = realpath(gl_ia_folders[i], rf) ? rf : gl_ia_folders[i];
    if (gl_ia_path_within(f, picked_real)) {
      *conflict = i;
      return "inside-library";
    }
    if (gl_ia_path_within(picked_real, f)) {
      *conflict = i;
      return "contains-library";
    }
  }
  return NULL;
}

static int gl_ia_run(uint32_t app_id, const char *library, bool dry_run) {
  /* Steam / steamclient may print on stdout; keep fd 1 for our one line only. */
  fflush(NULL);
  gl_ia_out_fd = dup(1);
  if (gl_ia_out_fd < 0) gl_ia_out_fd = 1;
  else dup2(2, 1);

  const char *reason = NULL;
  int getter_slot = gl_ia_find_getter_slot(&reason);
  if (getter_slot < 0) return gl_ia_unavailable(reason ? reason : "app-manager-not-found");

  gl_ia_session s = {0};
  const char *why = gl_ia_attach(&s);
  if (why) return gl_ia_unavailable(why);
  void *apm = gl_ia_call_getter(&s, getter_slot);
  if (!apm || !strstr(gl_ia_rtti(apm), "IClientAppManager"))
    return gl_ia_unavailable("app-manager-not-found");

  void **vt = gl_ia_vt(apm);
  int install_slot = gl_ia_find_method_slot(vt, GL_IA_FN_INSTALLAPP);
  if (install_slot < 0) return gl_ia_unavailable("method-unverified:InstallApp");
  /* Arg-shape guard: the neighbour order from spike 065. */
  if (gl_ia_slot_hi(vt, install_slot + 1) != (int)GL_IA_FN_UNINSTALLAPP ||
      gl_ia_find_method_slot(vt, GL_IA_FN_UNINSTALLAPP) != install_slot + 1)
    return gl_ia_unavailable("method-unverified:InstallApp");

  int32_t folder_index = 0; /* the only value tested live */
  int folder_count = 0;
  bool listed = false;
  if (library != NULL || dry_run) {
    int slot_n = gl_ia_find_method_slot(vt, GL_IA_FN_NUMFOLDERS);
    int slot_p = gl_ia_find_method_slot(vt, GL_IA_FN_FOLDERPATH);
    if (slot_n < 0 || slot_p < 0) {
      if (library != NULL) return gl_ia_unavailable("library-lookup-unverified");
    } else {
      folder_count = gl_ia_list_folders(apm, slot_n, slot_p);
      if (folder_count < 0) {
        if (library != NULL) return gl_ia_unavailable("library-lookup-unverified");
        folder_count = 0;
      } else {
        listed = true;
      }
    }
    if (library != NULL && listed) {
      int match = gl_ia_find_folder(folder_count, library);
      if (match < 0) return gl_ia_unavailable("library-not-registered");
      folder_index = match;
    }
  }

  if (dry_run) {
    static char list[GL_IA_MAX_FOLDERS * (GL_IA_PATH_CAP * 2 + 8)];
    size_t o = 0;
    list[0] = '\0';
    for (int i = 0; i < folder_count; i++) {
      char esc[GL_IA_PATH_CAP * 2];
      gl_ia_json_escape(esc, sizeof esc, gl_ia_folders[i]);
      int w = snprintf(list + o, sizeof list - o, "%s\"%s\"", i ? "," : "", esc);
      if (w < 0 || (size_t)w >= sizeof list - o) break;
      o += (size_t)w;
    }
    gl_ia_emit("{\"result\":\"ok\",\"appId\":%u,\"folderIndex\":%d,"
               "\"eAppUpdateError\":0,\"engineSlot\":%d,\"installAppSlot\":%d,"
               "\"dryRun\":true,\"libraryFolders\":[%s]}",
               app_id, (int)folder_index, getter_slot, install_slot, list);
    return GL_IA_EXIT_OK;
  }

  uint32_t err = ((uint32_t (*)(void *, uint32_t, int32_t, bool))vt[install_slot])(
      apm, app_id, folder_index, false);
  if (err == 0) {
    gl_ia_emit("{\"result\":\"ok\",\"appId\":%u,\"folderIndex\":%d,"
               "\"eAppUpdateError\":0,\"engineSlot\":%d,\"installAppSlot\":%d}",
               app_id, (int)folder_index, getter_slot, install_slot);
    return GL_IA_EXIT_OK;
  }
  gl_ia_emit("{\"result\":\"error\",\"appId\":%u,\"folderIndex\":%d,"
             "\"eAppUpdateError\":%u}",
             app_id, (int)folder_index, err);
  return GL_IA_EXIT_ERROR;
}

/* quick 261106-s3n: --steam-uninstallapp. Same attach order as gl_ia_run. */
static int gl_ia_run_uninstall(uint32_t app_id, bool dry_run) {
  fflush(NULL);
  gl_ia_out_fd = dup(1);
  if (gl_ia_out_fd < 0) gl_ia_out_fd = 1;
  else dup2(2, 1);

  const char *reason = NULL;
  int getter_slot = gl_ia_find_getter_slot(&reason);
  if (getter_slot < 0) return gl_ia_unavailable(reason ? reason : "app-manager-not-found");

  gl_ia_session s = {0};
  const char *why = gl_ia_attach(&s);
  if (why) return gl_ia_unavailable(why);
  void *apm = gl_ia_call_getter(&s, getter_slot);
  if (!apm || !strstr(gl_ia_rtti(apm), "IClientAppManager"))
    return gl_ia_unavailable("app-manager-not-found");

  void **vt = gl_ia_vt(apm);
  /* Inverted InstallApp guard: UninstallApp must be the slot right after the
   * verified InstallApp slot (spike 067) and carry its own unique ID. */
  int install_slot = gl_ia_find_method_slot(vt, GL_IA_FN_INSTALLAPP);
  int uninstall_slot = gl_ia_find_method_slot(vt, GL_IA_FN_UNINSTALLAPP);
  if (install_slot < 0 || uninstall_slot != install_slot + 1)
    return gl_ia_unavailable("method-unverified:UninstallApp");

  int num_slot = gl_ia_find_method_slot(vt, GL_IA_FN_NUMINSTALLED);

  if (dry_run) {
    int64_t k = num_slot >= 0
                    ? (int64_t)((uint32_t (*)(void *))vt[num_slot])(apm)
                    : -1;
    gl_ia_emit("{\"result\":\"ok\",\"appId\":%u,\"dryRun\":true,"
               "\"engineSlot\":%d,\"uninstallAppSlot\":%d,\"installedApps\":%lld}",
               app_id, getter_slot, uninstall_slot, (long long)k);
    return GL_IA_EXIT_OK;
  }

  uint32_t err = ((uint32_t (*)(void *, uint32_t))vt[uninstall_slot])(apm, app_id);
  if (err == 0) {
    gl_ia_emit("{\"result\":\"ok\",\"appId\":%u,\"eAppUpdateError\":0,"
               "\"engineSlot\":%d,\"uninstallAppSlot\":%d}",
               app_id, getter_slot, uninstall_slot);
    return GL_IA_EXIT_OK;
  }
  int64_t k = num_slot >= 0
                  ? (int64_t)((uint32_t (*)(void *))vt[num_slot])(apm)
                  : -1;
  gl_ia_emit("{\"result\":\"error\",\"appId\":%u,\"eAppUpdateError\":%u,"
             "\"installedApps\":%lld}",
             app_id, err, (long long)k);
  return GL_IA_EXIT_ERROR;
}

/*
 * quick 261120-p2j: --steam-validateapp. Same attach order as the uninstall run.
 * Without --wait: fire StartValidatingApp and report. With --wait: poll IPC app
 * state until Steam is done with the app (the ACF does not move on a validate).
 */
static int gl_ia_run_validate(uint32_t app_id, bool wait, bool dry_run) {
  fflush(NULL);
  gl_ia_out_fd = dup(1);
  if (gl_ia_out_fd < 0) gl_ia_out_fd = 1;
  else dup2(2, 1);

  const char *reason = NULL;
  int getter_slot = gl_ia_find_getter_slot(&reason);
  if (getter_slot < 0) return gl_ia_unavailable(reason ? reason : "app-manager-not-found");

  gl_ia_session s = {0};
  const char *why = gl_ia_attach(&s);
  if (why) return gl_ia_unavailable(why);
  void *apm = gl_ia_call_getter(&s, getter_slot);
  if (!apm || !strstr(gl_ia_rtti(apm), "IClientAppManager"))
    return gl_ia_unavailable("app-manager-not-found");

  void **vt = gl_ia_vt(apm);
  /* Slot guard: unique StartValidatingApp ID, CancelValidation right after. */
  int validate_slot = gl_ia_find_method_slot(vt, GL_IA_FN_STARTVALIDATING);
  if (validate_slot < 0 ||
      gl_ia_slot_hi(vt, validate_slot + 1) != (int)GL_IA_FN_CANCELVALIDATION ||
      gl_ia_find_method_slot(vt, GL_IA_FN_CANCELVALIDATION) != validate_slot + 1)
    return gl_ia_unavailable("method-unverified:StartValidatingApp");

  if (dry_run) {
    int state_slot = gl_ia_find_method_slot(vt, GL_IA_FN_INSTALLSTATE);
    int dl_slot = gl_ia_find_method_slot(vt, GL_IA_FN_DOWNLOADINGAPP);
    gl_ia_emit("{\"result\":\"ok\",\"appId\":%u,\"dryRun\":true,"
               "\"engineSlot\":%d,\"validateSlot\":%d,\"installStateSlot\":%d,"
               "\"downloadingAppSlot\":%d}",
               app_id, getter_slot, validate_slot, state_slot, dl_slot);
    return GL_IA_EXIT_OK;
  }

  /* Resolve the wait-state slots BEFORE the call so an unverified one is
   * reported without a half-tracked validate; untracked is still a success. */
  int state_slot = -1;
  int dl_slot = -1;
  const char *untracked = NULL;
  if (wait) {
    state_slot = gl_ia_find_method_slot(vt, GL_IA_FN_INSTALLSTATE);
    dl_slot = gl_ia_find_method_slot(vt, GL_IA_FN_DOWNLOADINGAPP);
    if (state_slot < 0) untracked = "method-unverified:GetAppInstallState";
    else if (dl_slot < 0) untracked = "method-unverified:GetDownloadingAppID";
  }

  int ok = ((int (*)(void *, uint32_t))vt[validate_slot])(apm, app_id) & 0xff;
  if (!ok) {
    gl_ia_emit("{\"result\":\"refused\",\"appId\":%u}", app_id);
    return GL_IA_EXIT_ERROR;
  }
  if (!wait) {
    gl_ia_emit("{\"result\":\"ok\",\"appId\":%u,\"tracked\":false}", app_id);
    return GL_IA_EXIT_OK;
  }
  if (untracked) {
    gl_ia_emit("{\"result\":\"ok\",\"appId\":%u,\"tracked\":false,\"reason\":\"%s\"}",
               app_id, untracked);
    return GL_IA_EXIT_OK;
  }

  long started = gl_ia_now_ms();
  bool seen_active = false;
  int inactive_run = 0;
  uint32_t last_state = 0;
  uint32_t prev_state = 0xFFFFFFFFu;
  const char *stop_reason = NULL;
  bool finished = false;
  for (;;) {
    uint32_t st = ((uint32_t (*)(void *, uint32_t))vt[state_slot])(apm, app_id);
    uint32_t dl = ((uint32_t (*)(void *))vt[dl_slot])(apm);
    last_state = st;
    bool active = (dl == app_id) || ((st & GL_IA_ACTIVE_STATE_MASK) != 0);
    if (st != prev_state) {
      fprintf(stderr, "[validateapp] app %u installState=%u downloading=%u active=%d\n",
              app_id, st, dl, active ? 1 : 0);
      prev_state = st;
    }
    long elapsed_s = (gl_ia_now_ms() - started) / 1000L;
    if (active) {
      seen_active = true;
      inactive_run = 0;
      if (st & GL_IA_STATE_UPDATE_PAUSED) {
        stop_reason = "paused";
        break;
      }
    } else {
      inactive_run++;
      if (seen_active && inactive_run >= 2) {
        finished = true;
        break;
      }
      if (!seen_active && elapsed_s >= GL_IA_VALIDATE_START_GRACE_S) {
        finished = true; /* never started tracking: Steam finished before we saw it */
        break;
      }
    }
    if (elapsed_s >= GL_IA_VALIDATE_WAIT_CAP_S) {
      stop_reason = "wait-cap";
      break;
    }
    usleep(1000000);
  }
  if (finished) {
    gl_ia_emit("{\"result\":\"ok\",\"appId\":%u,\"tracked\":true,"
               "\"finished\":true,\"installState\":%u}",
               app_id, last_state);
  } else {
    gl_ia_emit("{\"result\":\"ok\",\"appId\":%u,\"tracked\":true,"
               "\"finished\":false,\"installState\":%u,\"reason\":\"%s\"}",
               app_id, last_state, stop_reason ? stop_reason : "unknown");
  }
  return GL_IA_EXIT_OK;
}

/*
 * quick 261122-9sl: --steam-moveapp. Same attach order as the validate run.
 * Spike 090: CanMoveApp is `uint32 (this, appId, uint32 *out)` on this build (NOT
 * the OpenSteamClient (appId, folder) shape, which segfaulted), MoveApp is
 * `uint32 (this, appId, int32 folderIndex)`, GetMoveAppProgress is
 * `uint32 (this, appId, uint64 *, uint64 *, uint32 *)`. Every out-parameter is a
 * real stack variable of exactly that width, never NULL. CancelMoveApp is never
 * called; it only guards the slot order.
 */
static int gl_ia_move_error(uint32_t app_id, const char *stage, uint32_t err,
                            bool added) {
  gl_ia_emit("{\"result\":\"error\",\"appId\":%u,\"stage\":\"%s\","
             "\"eAppUpdateError\":%u,\"addedLibrary\":%s}",
             app_id, stage, err, added ? "true" : "false");
  return GL_IA_EXIT_ERROR;
}

/* quick 261122-n4q: one refused line, exit 3. folder_index < 0 omits the index. */
static int gl_ia_move_refused(uint32_t app_id, const char *reason, int folder_index) {
  if (folder_index >= 0) {
    gl_ia_emit("{\"result\":\"refused\",\"appId\":%u,\"reason\":\"%s\","
               "\"folderIndex\":%d}",
               app_id, reason, folder_index);
  } else {
    gl_ia_emit("{\"result\":\"refused\",\"appId\":%u,\"reason\":\"%s\"}",
               app_id, reason);
  }
  return GL_IA_EXIT_ERROR;
}

static int gl_ia_run_move(uint32_t app_id, const char *library, bool wait,
                          bool dry_run, bool add_library) {
  fflush(NULL);
  gl_ia_out_fd = dup(1);
  if (gl_ia_out_fd < 0) gl_ia_out_fd = 1;
  else dup2(2, 1);

  const char *reason = NULL;
  int getter_slot = gl_ia_find_getter_slot(&reason);
  if (getter_slot < 0) return gl_ia_unavailable(reason ? reason : "app-manager-not-found");

  gl_ia_session s = {0};
  const char *why = gl_ia_attach(&s);
  if (why) return gl_ia_unavailable(why);
  void *apm = gl_ia_call_getter(&s, getter_slot);
  if (!apm || !strstr(gl_ia_rtti(apm), "IClientAppManager"))
    return gl_ia_unavailable("app-manager-not-found");

  void **vt = gl_ia_vt(apm);
  /* Run guard (spike 090 slots 67-70): MoveApp by unique ID, and its three
   * neighbours each by unique ID AND by the high half at the exact position. */
  int move_slot = gl_ia_find_method_slot(vt, GL_IA_FN_MOVEAPP);
  if (move_slot < 1 ||
      gl_ia_find_method_slot(vt, GL_IA_FN_CANMOVE) != move_slot - 1 ||
      gl_ia_slot_hi(vt, move_slot - 1) != (int)GL_IA_FN_CANMOVE ||
      gl_ia_find_method_slot(vt, GL_IA_FN_MOVEPROGRESS) != move_slot + 1 ||
      gl_ia_slot_hi(vt, move_slot + 1) != (int)GL_IA_FN_MOVEPROGRESS ||
      gl_ia_find_method_slot(vt, GL_IA_FN_CANCELMOVE) != move_slot + 2 ||
      gl_ia_slot_hi(vt, move_slot + 2) != (int)GL_IA_FN_CANCELMOVE)
    return gl_ia_unavailable("method-unverified:MoveApp");
  int can_slot = move_slot - 1;
  int prog_slot = move_slot + 1;

  int folder_slot = gl_ia_find_method_slot(vt, GL_IA_FN_APPLIBFOLDER);
  if (folder_slot < 0) return gl_ia_unavailable("method-unverified:GetAppLibraryFolder");

  int slot_n = gl_ia_find_method_slot(vt, GL_IA_FN_NUMFOLDERS);
  int slot_p = gl_ia_find_method_slot(vt, GL_IA_FN_FOLDERPATH);
  if (slot_n < 0 || slot_p < 0) return gl_ia_unavailable("library-lookup-unverified");
  int folder_count = gl_ia_list_folders(apm, slot_n, slot_p);
  if (folder_count < 0) return gl_ia_unavailable("library-lookup-unverified");
  int target = gl_ia_find_folder(folder_count, library);
  int add_slot = -1;
  bool add_pending = false;
  char real[PATH_MAX];
  real[0] = '\0';
  if (target < 0) {
    if (!add_library) return gl_ia_unavailable("library-not-registered");
    /* AddLibraryFolder guard: unique 0x16a1, and RemoveLibraryFolder's unique
     * 0xbc0b at exactly Add + 3. remove_slot is used ONLY in this comparison. */
    add_slot = gl_ia_find_method_slot(vt, GL_IA_FN_ADDFOLDER);
    int remove_slot = gl_ia_find_method_slot(vt, GL_IA_FN_REMOVEFOLDER);
    if (add_slot < 0 || remove_slot != add_slot + 3 ||
        gl_ia_slot_hi(vt, add_slot) != (int)GL_IA_FN_ADDFOLDER ||
        gl_ia_slot_hi(vt, add_slot + 3) != (int)GL_IA_FN_REMOVEFOLDER)
      return gl_ia_unavailable("method-unverified:AddLibraryFolder");
    struct stat st;
    if (!realpath(library, real) || stat(real, &st) != 0 || !S_ISDIR(st.st_mode))
      return gl_ia_move_refused(app_id, "library-not-directory", -1);
    if (strlen(real) > GL_IA_ADD_PATH_MAX)
      return gl_ia_move_refused(app_id, "path-too-long", -1);
    int conflict = -1;
    const char *nest = gl_ia_nesting_refusal(folder_count, real, &conflict);
    if (nest) return gl_ia_move_refused(app_id, nest, conflict);
    add_pending = true;
  }

  int32_t from =
      ((int32_t (*)(void *, uint32_t))vt[folder_slot])(apm, app_id);
  if (from < 0) return gl_ia_move_refused(app_id, "not-installed", -1);
  if (target >= 0 && from == target)
    return gl_ia_move_refused(app_id, "already-in-folder", target);

  /* CanMoveApp: the reply writes 4 bytes into a REAL pointer. Its value's
   * meaning is unknown (always 0 in spike 090), so it is ignored. */
  uint32_t can_out = 0;
  uint32_t can_err =
      ((uint32_t (*)(void *, uint32_t, uint32_t *))vt[can_slot])(apm, app_id,
                                                                 &can_out);

  if (dry_run) {
    static char list[GL_IA_MAX_FOLDERS * (GL_IA_PATH_CAP * 2 + 8)];
    size_t o = 0;
    list[0] = '\0';
    for (int i = 0; i < folder_count; i++) {
      char esc[GL_IA_PATH_CAP * 2];
      gl_ia_json_escape(esc, sizeof esc, gl_ia_folders[i]);
      int w = snprintf(list + o, sizeof list - o, "%s\"%s\"", i ? "," : "", esc);
      if (w < 0 || (size_t)w >= sizeof list - o) break;
      o += (size_t)w;
    }
    char extra[96];
    extra[0] = '\0';
    if (add_pending)
      snprintf(extra, sizeof extra, "\"wouldAddLibrary\":true,\"addLibrarySlot\":%d,",
               add_slot);
    gl_ia_emit("{\"result\":\"ok\",\"appId\":%u,\"dryRun\":true,%s"
               "\"folderIndex\":%d,\"fromFolder\":%d,\"canMoveError\":%u,"
               "\"engineSlot\":%d,\"canMoveSlot\":%d,\"moveSlot\":%d,"
               "\"progressSlot\":%d,\"libraryFolders\":[%s]}",
               app_id, extra, add_pending ? -1 : target, (int)from, can_err,
               getter_slot, can_slot, move_slot, prog_slot, list);
    return GL_IA_EXIT_OK;
  }

  /* Resolve the wait-state slot BEFORE the move: unresolved is untracked, not
   * an error. */
  int state_slot = -1;
  const char *untracked = NULL;
  if (wait) {
    state_slot = gl_ia_find_method_slot(vt, GL_IA_FN_INSTALLSTATE);
    if (state_slot < 0) untracked = "method-unverified:GetAppInstallState";
  }

  /* A CanMoveApp error returns BEFORE any Add, so a refused move never leaves a
   * new library behind. */
  if (can_err != 0) return gl_ia_move_error(app_id, "CanMoveApp", can_err, false);

  bool added = false;
  if (add_pending) {
    int32_t ret = ((int32_t (*)(void *, const char *))vt[add_slot])(apm, real);
    fprintf(stderr, "[moveapp] AddLibraryFolder(%s) -> %d\n", real, (int)ret);
    if (ret < 0) {
      gl_ia_emit("{\"result\":\"refused\",\"appId\":%u,"
                 "\"reason\":\"add-library-refused\",\"addRet\":%d}",
                 app_id, (int)ret);
      return GL_IA_EXIT_ERROR;
    }
    /* The target is Add's RETURN VALUE, never a list position, and it must be
     * re-verified against a fresh listing. */
    int recount = gl_ia_list_folders(apm, slot_n, slot_p);
    if (recount < 0 || ret >= recount || gl_ia_folders[ret][0] == '\0' ||
        !gl_ia_folder_matches(gl_ia_folders[ret], real))
      return gl_ia_move_refused(app_id, "add-library-unverified", (int)ret);
    target = (int)ret;
    folder_count = recount;
    added = true;
  }

  uint32_t err =
      ((uint32_t (*)(void *, uint32_t, int32_t))vt[move_slot])(apm, app_id,
                                                               (int32_t)target);
  if (err != 0) return gl_ia_move_error(app_id, "MoveApp", err, added);

  if (!wait || untracked) {
    if (untracked) {
      gl_ia_emit("{\"result\":\"ok\",\"appId\":%u,\"tracked\":false,"
                 "\"folderIndex\":%d,\"fromFolder\":%d,\"reason\":\"%s\","
                 "\"addedLibrary\":%s}",
                 app_id, target, (int)from, untracked, added ? "true" : "false");
    } else {
      gl_ia_emit("{\"result\":\"ok\",\"appId\":%u,\"tracked\":false,"
                 "\"folderIndex\":%d,\"fromFolder\":%d,\"addedLibrary\":%s}",
                 app_id, target, (int)from, added ? "true" : "false");
    }
    return GL_IA_EXIT_OK;
  }

  long started = gl_ia_now_ms();
  bool seen_moving = false;
  int settled_run = 0;
  long quiet_since_ms = -1; /* start of the continuous no-busy-bits window */
  uint32_t last_state = 0;
  uint32_t prev_prog = 0xFFFFFFFFu;
  uint64_t prev_a = 0;
  uint64_t prev_b = 0;
  int32_t prev_folder = -2;
  uint32_t prev_state = 0xFFFFFFFFu;
  const char *stop_reason = NULL;
  bool finished = false;
  for (;;) {
    uint64_t a = 0;
    uint64_t b = 0;
    uint32_t c = 0;
    uint32_t prog = ((uint32_t (*)(void *, uint32_t, uint64_t *, uint64_t *,
                                   uint32_t *))vt[prog_slot])(apm, app_id, &a,
                                                              &b, &c);
    int32_t folder =
        ((int32_t (*)(void *, uint32_t))vt[folder_slot])(apm, app_id);
    uint32_t st = ((uint32_t (*)(void *, uint32_t))vt[state_slot])(apm, app_id);
    last_state = st;
    if (prog != prev_prog || a != prev_a || b != prev_b || folder != prev_folder ||
        st != prev_state) {
      fprintf(stderr,
              "[moveapp] app %u progress=%u a=%llu b=%llu folder=%d installState=%u\n",
              app_id, prog, (unsigned long long)a, (unsigned long long)b,
              (int)folder, st);
      prev_prog = prog;
      prev_a = a;
      prev_b = b;
      prev_folder = folder;
      prev_state = st;
    }
    long now_ms = gl_ia_now_ms();
    long elapsed_s = (now_ms - started) / 1000L;
    if (prog == 1) seen_moving = true;

    bool at_target = (prog == 0 && folder == target);
    bool settled = at_target && (st & GL_IA_STATE_FULLY_INSTALLED) &&
                   !(st & GL_IA_ACTIVE_STATE_MASK) &&
                   !(st & GL_IA_STATE_FILES_MISSING);
    settled_run = settled ? settled_run + 1 : 0;
    if (settled_run >= 2) {
      finished = true;
      break;
    }
    /* Fallback: at the target with no running work for a continuous window, so
     * a persistent queued/required bit cannot hold the wait forever. */
    if (at_target && !(st & GL_IA_MOVE_BUSY_MASK)) {
      if (quiet_since_ms < 0) quiet_since_ms = now_ms;
      if ((now_ms - quiet_since_ms) / 1000L >= GL_IA_MOVE_SETTLE_FALLBACK_S) {
        finished = true;
        break;
      }
    } else {
      quiet_since_ms = -1;
    }
    if (!seen_moving && folder != target && elapsed_s >= GL_IA_MOVE_START_GRACE_S) {
      stop_reason = "not-started";
      break;
    }
    if (elapsed_s >= GL_IA_MOVE_WAIT_CAP_S) {
      stop_reason = "wait-cap";
      break;
    }
    usleep(1000000);
  }
  if (finished) {
    gl_ia_emit("{\"result\":\"ok\",\"appId\":%u,\"tracked\":true,\"finished\":true,"
               "\"installState\":%u,\"folderIndex\":%d,\"fromFolder\":%d,"
               "\"addedLibrary\":%s}",
               app_id, last_state, target, (int)from, added ? "true" : "false");
  } else {
    gl_ia_emit("{\"result\":\"ok\",\"appId\":%u,\"tracked\":true,\"finished\":false,"
               "\"installState\":%u,\"folderIndex\":%d,\"fromFolder\":%d,"
               "\"reason\":\"%s\",\"addedLibrary\":%s}",
               app_id, last_state, target, (int)from,
               stop_reason ? stop_reason : "unknown", added ? "true" : "false");
  }
  return GL_IA_EXIT_OK;
}

#endif /* __aarch64__ */

/* Shared appId parse: 1..10 digits, 1..0xFFFFFFFF. Returns a usage exit code
 * on failure, or -1 with *out set. */
static int gl_ia_parse_app_id(int argc, char **argv, uint32_t *out) {
  if (argc < 3) return gl_ia_usage("missing-appid");
  const char *id = argv[2];
  size_t idlen = strlen(id);
  if (idlen < 1 || idlen > 10) return gl_ia_usage("bad-appid");
  for (size_t i = 0; i < idlen; i++)
    if (id[i] < '0' || id[i] > '9') return gl_ia_usage("bad-appid");
  unsigned long long parsed = strtoull(id, NULL, 10);
  if (parsed == 0 || parsed > 0xFFFFFFFFull) return gl_ia_usage("bad-appid");
  *out = (uint32_t)parsed;
  return -1;
}

/* argv[1] == "--steam-installapp". Never touches the secret env block,
 * steam_appid.txt, libsteam_api or the socket server. */
static int gamelib_installapp_main(int argc, char **argv) {
  uint32_t app_id = 0;
  int rc = gl_ia_parse_app_id(argc, argv, &app_id);
  if (rc >= 0) return rc;

  const char *library = NULL;
  bool dry_run = false;
  for (int i = 3; i < argc; i++) {
    if (strcmp(argv[i], "--dry-run") == 0) {
      dry_run = true;
    } else if (strcmp(argv[i], "--library") == 0) {
      if (i + 1 >= argc || !gl_ia_library_arg_ok(argv[i + 1]))
        return gl_ia_usage("bad-library");
      library = argv[++i];
    } else {
      return gl_ia_usage("unknown-argument");
    }
  }

#if defined(__aarch64__)
  return gl_ia_run(app_id, library, dry_run);
#else
  (void)library;
  (void)dry_run;
  return gl_ia_unavailable("unsupported-arch");
#endif
}

/* argv[1] == "--steam-uninstallapp" (quick 261106-s3n). Same isolation as
 * the install subcommand; only --dry-run is accepted. */
static int gamelib_uninstallapp_main(int argc, char **argv) {
  uint32_t app_id = 0;
  int rc = gl_ia_parse_app_id(argc, argv, &app_id);
  if (rc >= 0) return rc;

  bool dry_run = false;
  for (int i = 3; i < argc; i++) {
    if (strcmp(argv[i], "--dry-run") == 0) dry_run = true;
    else return gl_ia_usage("unknown-argument");
  }

#if defined(__aarch64__)
  return gl_ia_run_uninstall(app_id, dry_run);
#else
  (void)dry_run;
  (void)app_id;
  return gl_ia_unavailable("unsupported-arch");
#endif
}

/* argv[1] == "--steam-validateapp" (quick 261120-p2j). Same isolation as the
 * other subcommands; accepts --wait and --dry-run. */
static int gamelib_validateapp_main(int argc, char **argv) {
  uint32_t app_id = 0;
  int rc = gl_ia_parse_app_id(argc, argv, &app_id);
  if (rc >= 0) return rc;

  bool wait = false;
  bool dry_run = false;
  for (int i = 3; i < argc; i++) {
    if (strcmp(argv[i], "--wait") == 0) wait = true;
    else if (strcmp(argv[i], "--dry-run") == 0) dry_run = true;
    else return gl_ia_usage("unknown-argument");
  }

#if defined(__aarch64__)
  return gl_ia_run_validate(app_id, wait, dry_run);
#else
  (void)wait;
  (void)dry_run;
  (void)app_id;
  return gl_ia_unavailable("unsupported-arch");
#endif
}

/* argv[1] == "--steam-moveapp" (quick 261122-9sl). Same isolation as the other
 * subcommands; requires --library <abs>, accepts --wait, --dry-run and (quick
 * 261122-n4q) --add-library. */
static int gamelib_moveapp_main(int argc, char **argv) {
  uint32_t app_id = 0;
  int rc = gl_ia_parse_app_id(argc, argv, &app_id);
  if (rc >= 0) return rc;

  const char *library = NULL;
  bool wait = false;
  bool dry_run = false;
  bool add_library = false;
  for (int i = 3; i < argc; i++) {
    if (strcmp(argv[i], "--wait") == 0) {
      wait = true;
    } else if (strcmp(argv[i], "--dry-run") == 0) {
      dry_run = true;
    } else if (strcmp(argv[i], "--add-library") == 0) {
      add_library = true;
    } else if (strcmp(argv[i], "--library") == 0) {
      if (i + 1 >= argc || !gl_ia_library_arg_ok(argv[i + 1]))
        return gl_ia_usage("bad-library");
      library = argv[++i];
    } else {
      return gl_ia_usage("unknown-argument");
    }
  }
  if (library == NULL) return gl_ia_usage("missing-library");

#if defined(__aarch64__)
  return gl_ia_run_move(app_id, library, wait, dry_run, add_library);
#else
  (void)library;
  (void)wait;
  (void)dry_run;
  (void)add_library;
  (void)app_id;
  return gl_ia_unavailable("unsupported-arch");
#endif
}

#endif /* GAMELIB_INSTALLAPP_H */
