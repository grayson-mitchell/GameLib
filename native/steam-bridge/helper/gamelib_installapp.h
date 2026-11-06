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
 * Reads Steam's own library folders. Returns count (>=1) or -1 (lookup
 * unverified). GetNumLibraryFolders / GetLibraryFolderPath were located in
 * spike 066 but never called; assumed shapes are `uint32 (this)` and
 * `int32 (this, int32 index, char *buf, int32 cap)`, hence the strict output
 * validation below.
 */
static char gl_ia_folders[GL_IA_MAX_FOLDERS][GL_IA_PATH_CAP];

static int gl_ia_list_folders(void *apm, int slot_n, int slot_p) {
  void **vt = gl_ia_vt(apm);
  uint32_t n = ((uint32_t (*)(void *))vt[slot_n])(apm);
  if (n < 1 || n > GL_IA_MAX_FOLDERS) return -1;
  for (uint32_t i = 0; i < n; i++) {
    char *buf = gl_ia_folders[i];
    memset(buf, 0, GL_IA_PATH_CAP);
    ((int32_t (*)(void *, int32_t, char *, int32_t))vt[slot_p])(
        apm, (int32_t)i, buf, GL_IA_PATH_CAP);
    buf[GL_IA_PATH_CAP - 1] = '\0';
    struct stat st;
    if (buf[0] != '/' || stat(buf, &st) != 0 || !S_ISDIR(st.st_mode)) return -1;
  }
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
      int match = -1;
      for (int i = 0; i < folder_count; i++) {
        if (gl_ia_folder_matches(gl_ia_folders[i], library)) {
          match = i;
          break;
        }
      }
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

#endif /* GAMELIB_INSTALLAPP_H */
