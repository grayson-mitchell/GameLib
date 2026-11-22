// Host-compiled harness for the pure logic in native/steam-bridge/helper/gamelib_installapp.h
// (quick 261122-n4q): the gap-tolerant folder listing, the folder match, the nesting check and
// the move wait state machine. Same pattern as cbqueue_harness.c: prints `PASS <case>` per case
// and exits non-zero with `FAIL <case>` on the first failure.
//
// A fake IClientAppManager object (a pointer to a 2-entry vtable of static functions) stands in
// for Steam. Nothing here calls gl_ia_attach, gl_ia_find_getter_slot or anything that dlopens,
// so no test ever reaches steamclient or a running Steam.
// argv[1] is a scratch directory the harness may create subdirectories in.
#include <stdio.h>
#include <stdlib.h>
#include <sys/stat.h>
#include "gamelib_installapp.h"

#define CHECK(name, cond)                \
  do {                                   \
    if (!(cond)) {                       \
      printf("FAIL %s\n", name);         \
      exit(1);                           \
    }                                    \
    printf("PASS %s\n", name);           \
  } while (0)

#if defined(__aarch64__)

static const char *fake_paths[GL_IA_MAX_FOLDERS];
static uint32_t fake_count = 0;

static uint32_t fake_get_count(void *self) {
  (void)self;
  return fake_count;
}

static int32_t fake_get_path(void *self, int32_t idx, char *buf, int32_t cap) {
  (void)self;
  const char *p = fake_paths[idx];
  if (!p || !*p) {
    buf[0] = '\0';
    return 0;
  }
  snprintf(buf, (size_t)cap, "%s", p);
  return 1;
}

static void *fake_vt[2] = {(void *)fake_get_count, (void *)fake_get_path};
typedef struct {
  void **vt;
} fake_obj;
static fake_obj fake = {fake_vt};

static void set_paths(uint32_t n, const char *a, const char *b, const char *c,
                      const char *d, const char *e) {
  const char *all[5] = {a, b, c, d, e};
  fake_count = n;
  for (int i = 0; i < GL_IA_MAX_FOLDERS; i++) fake_paths[i] = NULL;
  for (uint32_t i = 0; i < n && i < 5; i++) fake_paths[i] = all[i];
}

static int list(void) { return gl_ia_list_folders(&fake, 0, 1); }

static void mk(char *out, size_t cap, const char *root, const char *name) {
  snprintf(out, cap, "%s/%s", root, name);
  mkdir(out, 0755);
}


/* --- move wait state machine: synthetic readings, one per second from a fixed base --- */
#define BASE_MS 1000000L
#define TGT 2
static long at_s(long sec) { return BASE_MS + sec * 1000L; }
static int tick(gl_ia_move_wait *w, uint32_t prog, int32_t folder, uint32_t st, long sec) {
  return gl_ia_move_wait_step(w, prog, folder, TGT, st, at_s(sec));
}

int main(int argc, char **argv) {
  if (argc < 2) {
    printf("FAIL usage\n");
    return 1;
  }
  char root[PATH_MAX];
  if (!realpath(argv[1], root)) {
    printf("FAIL scratch-dir\n");
    return 1;
  }
  char A[PATH_MAX], B[PATH_MAX], C[PATH_MAX], D[PATH_MAX], sub[PATH_MAX];
  mk(A, sizeof A, root, "realA");
  mk(B, sizeof B, root, "realB");
  mk(C, sizeof C, root, "realC");
  mk(D, sizeof D, root, "realD");
  snprintf(sub, sizeof sub, "%s/inner", A);
  mkdir(sub, 0755);

  /* --- folder listing --- */
  set_paths(5, A, B, "", "", C);
  CHECK("folders-gaps-keep-index",
        list() == 5 && gl_ia_folders[2][0] == '\0' && gl_ia_folders[3][0] == '\0' &&
            strcmp(gl_ia_folders[4], C) == 0 && strcmp(gl_ia_folders[0], A) == 0);
  CHECK("folders-find-skips-gap", gl_ia_find_folder(5, C) == 4 && gl_ia_find_folder(5, A) == 0);
  CHECK("folders-find-unregistered", gl_ia_find_folder(5, D) == -1);

  set_paths(2, A, "relative/dir", NULL, NULL, NULL);
  CHECK("folders-relative-refused", list() == -1);
  set_paths(2, A, "/nonexistent-n4q-dir/x", NULL, NULL, NULL);
  CHECK("folders-missing-dir-refused", list() == -1);
  set_paths(3, "", "", "", NULL, NULL);
  CHECK("folders-all-gaps-refused", list() == -1);
  set_paths(0, NULL, NULL, NULL, NULL, NULL);
  fake_count = 0;
  int zero = list();
  fake_count = GL_IA_MAX_FOLDERS + 1;
  int over = list();
  CHECK("folders-count-out-of-range", zero == -1 && over == -1);

  /* --- path_within --- */
  CHECK("within-child", gl_ia_path_within("/a/b", "/a/b/c") && gl_ia_path_within("/a/b/", "/a/b/c/d"));
  CHECK("within-sibling-prefix", !gl_ia_path_within("/a/b", "/a/bc") && !gl_ia_path_within("/a/b", "/a"));
  CHECK("within-equal", !gl_ia_path_within("/a/b", "/a/b"));
  CHECK("within-root", gl_ia_path_within("/", "/a") && !gl_ia_path_within("/", "/"));

  /* --- nesting --- */
  int idx = -2;
  set_paths(2, A, B, NULL, NULL, NULL);
  list();
  const char *r = gl_ia_nesting_refusal(2, sub, &idx);
  CHECK("nesting-inside", r && strcmp(r, "inside-library") == 0 && idx == 0);
  idx = -2;
  r = gl_ia_nesting_refusal(2, root, &idx);
  CHECK("nesting-contains", r && strcmp(r, "contains-library") == 0 && idx == 0);
  idx = -2;
  r = gl_ia_nesting_refusal(2, D, &idx);
  CHECK("nesting-none", r == NULL && idx == -2);
  set_paths(4, "", "", A, B, NULL);
  list();
  idx = -2;
  r = gl_ia_nesting_refusal(4, sub, &idx);
  CHECK("nesting-skips-gap", r && strcmp(r, "inside-library") == 0 && idx == 2);

  /* --- wait state machine --- */
  {
    /* Spike 090: Steam verifies itself, so the helper never nudges. */
    gl_ia_move_wait w;
    gl_ia_move_wait_init(&w, at_s(0), true);
    int seen_nudge = 0, last = GL_IA_WAIT_CONTINUE;
    long t = 0;
    last = tick(&w, 1, 0, 4, t++); seen_nudge |= last == GL_IA_WAIT_NUDGE;
    for (int i = 0; i < 2; i++) {
      last = tick(&w, 0, TGT, 38, t++); seen_nudge |= last == GL_IA_WAIT_NUDGE;
    }
    last = tick(&w, 0, TGT, 38 | 0x20000, t++); seen_nudge |= last == GL_IA_WAIT_NUDGE;
    last = tick(&w, 0, TGT, 4, t++); seen_nudge |= last == GL_IA_WAIT_NUDGE;
    int first = last;
    last = tick(&w, 0, TGT, 4, t++); seen_nudge |= last == GL_IA_WAIT_NUDGE;
    CHECK("wait-steam-verifies-itself",
          first == GL_IA_WAIT_CONTINUE && last == GL_IA_WAIT_FINISHED && !seen_nudge);
  }
  {
    /* Spike 094: state 46 stays until something starts a verify. */
    gl_ia_move_wait w;
    gl_ia_move_wait_init(&w, at_s(0), true);
    int early = 1, nudges = 0, at5 = -1, last = -1;
    for (long t = 0; t <= 4; t++)
      if (tick(&w, 0, TGT, 46, t) != GL_IA_WAIT_CONTINUE) early = 0;
    at5 = tick(&w, 0, TGT, 46, 5);
    nudges += at5 == GL_IA_WAIT_NUDGE;
    last = tick(&w, 0, TGT, 46 | 0x20000, 6);
    nudges += last == GL_IA_WAIT_NUDGE;
    last = tick(&w, 0, TGT, 4, 7);
    nudges += last == GL_IA_WAIT_NUDGE;
    last = tick(&w, 0, TGT, 4, 8);
    nudges += last == GL_IA_WAIT_NUDGE;
    CHECK("wait-nudge-once-then-finish",
          early && at5 == GL_IA_WAIT_NUDGE && nudges == 1 && last == GL_IA_WAIT_FINISHED);
  }
  {
    gl_ia_move_wait w;
    gl_ia_move_wait_init(&w, at_s(0), true);
    int nudge_at = -1, settled_at = -1, finished = 0, nudges = 0;
    for (long t = 0; t < 200 && settled_at < 0; t++) {
      int r = tick(&w, 0, TGT, 46, t);
      if (r == GL_IA_WAIT_NUDGE) { nudges++; nudge_at = (int)t; }
      if (r == GL_IA_WAIT_FINISHED) finished = 1;
      if (r == GL_IA_WAIT_NOT_SETTLED) settled_at = (int)t;
    }
    CHECK("wait-nudge-then-not-settled",
          nudges == 1 && nudge_at == 5 && settled_at == 5 + GL_IA_MOVE_VERIFY_PENDING_S &&
              !finished);
  }
  {
    gl_ia_move_wait w;
    gl_ia_move_wait_init(&w, at_s(0), false);
    int settled_at = -1, nudged = 0, finished = 0;
    for (long t = 0; t < 200 && settled_at < 0; t++) {
      int r = tick(&w, 0, TGT, 46, t);
      if (r == GL_IA_WAIT_NUDGE) nudged = 1;
      if (r == GL_IA_WAIT_FINISHED) finished = 1;
      if (r == GL_IA_WAIT_NOT_SETTLED) settled_at = (int)t;
    }
    CHECK("wait-no-validate-slot",
          settled_at == GL_IA_MOVE_VERIFY_PENDING_S && !nudged && !finished);
  }
  {
    gl_ia_move_wait w;
    gl_ia_move_wait_init(&w, at_s(0), true);
    int fin_at = -1, nudged = 0;
    for (long t = 0; t < 200 && fin_at < 0; t++) {
      int r = tick(&w, 0, TGT, 14, t);
      if (r == GL_IA_WAIT_NUDGE) nudged = 1;
      if (r == GL_IA_WAIT_FINISHED) fin_at = (int)t;
    }
    CHECK("wait-fallback-without-files-missing",
          fin_at == GL_IA_MOVE_SETTLE_FALLBACK_S && !nudged);
  }
  {
    gl_ia_move_wait w;
    gl_ia_move_wait_init(&w, at_s(0), true);
    int nudged = 0;
    for (long t = 0; t < 30; t++) {
      uint32_t st = ((t / 3) % 2 == 0) ? 46u : (46u | 0x100u);
      if (tick(&w, 0, TGT, st, t) == GL_IA_WAIT_NUDGE) nudged = 1;
    }
    /* Then five continuous quiet seconds do nudge. */
    int at5 = GL_IA_WAIT_CONTINUE;
    long t0 = 30;
    for (long t = t0; t < t0 + 6; t++) {
      int r = tick(&w, 0, TGT, 46, t);
      if (r == GL_IA_WAIT_NUDGE) at5 = (int)(t - t0);
    }
    CHECK("wait-busy-resets-quiet", !nudged && at5 == 5);
  }
  {
    gl_ia_move_wait w;
    gl_ia_move_wait_init(&w, at_s(0), true);
    int early = 1, at = -1;
    for (long t = 0; t <= GL_IA_MOVE_START_GRACE_S; t++) {
      int r = tick(&w, 0, 0, 4, t);
      if (r == GL_IA_WAIT_NOT_STARTED) { at = (int)t; break; }
      if (r != GL_IA_WAIT_CONTINUE) early = 0;
    }
    CHECK("wait-not-started", early && at == GL_IA_MOVE_START_GRACE_S);
  }
  {
    gl_ia_move_wait w;
    gl_ia_move_wait_init(&w, at_s(0), true);
    int early = 1, at = -1;
    for (long t = 0; t <= GL_IA_MOVE_WAIT_CAP_S; t++) {
      int r = tick(&w, 1, 0, 4, t);
      if (r == GL_IA_WAIT_CAP) { at = (int)t; break; }
      if (r != GL_IA_WAIT_CONTINUE) early = 0;
    }
    CHECK("wait-cap", early && at == GL_IA_MOVE_WAIT_CAP_S);
  }

  return 0;
}

#else

int main(void) {
  printf("SKIP arm64-only\n");
  return 0;
}

#endif
