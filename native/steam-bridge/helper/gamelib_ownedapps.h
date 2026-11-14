/*
 * gamelib_ownedapps.h -- GameLib-owned (not Valve / Wine code).
 *
 * Phase 79 (D-14, D-15). `steam-bridge-helper --steam-owned-apps
 * --expect-steamid <id64>` asks the RUNNING, signed-in native macOS Steam client
 * which apps the account owns, through steamclient.dylib's internal IClientUser
 * (spike 084). Out of process: steamclient.dylib is never loaded into the Tauri
 * process (D-15). Reuses gl_ia_* attach / output helpers from
 * gamelib_installapp.h (include that first).
 *
 * Guards, in order (Pitfall 12): attach -> BLoggedOn == 1 -> GetSteamID ==
 * --expect-steamid -> GetSubscribedApps resolved by IPC function-ID high half
 * 0x8532, unique slot only (never a slot index) -> called twice (count, then a
 * buffer of that size).
 *
 * Output: JSON lines on the original stdout (Steam's own stdout noise is sent to
 * stderr). Never prints a SteamID: only a `match` boolean.
 *   exit 0  {"ok":true,"count":N,"appIds":[...]}
 *   exit 2  guard failure: not-logged-on | account-mismatch | attach-failed
 *   exit 3  ambiguous or unresolved slot, or implausible count
 *   exit 64 usage
 */
#ifndef GAMELIB_OWNEDAPPS_H
#define GAMELIB_OWNEDAPPS_H

#include "gamelib_installapp.h"

#define GL_OA_FN_BLOGGEDON 0x6585u
#define GL_OA_FN_GETSTEAMID 0xd6fcu
#define GL_OA_FN_GETSUBSCRIBEDAPPS 0x8532u

#define GL_OA_ENGINE_SLOT_GETICLIENTUSER 8
#define GL_OA_MAX_SLOTS 400
#define GL_OA_MAX_APPS 100000u
#define GL_OA_TIMEOUT_S 20

static int gl_oa_usage(const char *why) {
  gl_ia_emit("{\"ok\":false,\"why\":\"usage:%s\"}", why);
  return GL_IA_EXIT_USAGE;
}

#if defined(__aarch64__)

static bool gl_oa_in_steamclient(void *p) {
  Dl_info di;
  return p && dladdr(p, &di) && di.dli_fname &&
         strstr(di.dli_fname, "steamclient.dylib") != NULL;
}

/* IPC function-ID high half of one proxy: first movz/movk(lsl 16) pair on the
 * same register within the first 64 words (spike 084 decode). -1 if none. */
static int gl_oa_slot_hi(void **vtable, int slot) {
  const uint32_t *w = (const uint32_t *)vtable[slot];
  if (!w) return -1;
  for (int i = 0; i < 64; i++) {
    if ((w[i] & 0xFFE00000u) != 0x52800000u) continue;
    uint32_t rd = w[i] & 31u;
    for (int j = i + 1; j < i + 6 && j < 64; j++) {
      if ((w[j] & 0xFFE00000u) == 0x72A00000u && (w[j] & 31u) == rd)
        return (int)((w[j] >> 5) & 0xFFFFu);
    }
  }
  return -1;
}

/* Slot carrying `hi`, only if exactly one does; else -1. */
static int gl_oa_find_unique(void **vtable, int nslots, uint32_t hi) {
  int found = -1, matches = 0;
  for (int s = 0; s < nslots; s++) {
    if (gl_oa_slot_hi(vtable, s) == (int)hi) {
      found = s;
      matches++;
    }
  }
  return matches == 1 ? found : -1;
}

static int gl_oa_unresolved(const char *fn) {
  gl_ia_emit("{\"step\":\"guard\",\"ok\":false,\"why\":\"%s not uniquely resolved\"}", fn);
  return GL_IA_EXIT_ERROR;
}

static int gl_oa_run(uint64_t expect) {
  fflush(NULL);
  gl_ia_out_fd = dup(1);
  if (gl_ia_out_fd < 0) gl_ia_out_fd = 1;
  else dup2(2, 1);
  alarm(GL_OA_TIMEOUT_S); /* a hung client call must not hang the helper */

  gl_ia_session s = {0};
  const char *why = gl_ia_attach(&s);
  if (why) {
    gl_ia_emit("{\"ok\":false,\"why\":\"attach-failed\",\"detail\":\"%s\"}", why);
    return GL_IA_EXIT_UNAVAILABLE;
  }
  void *cu = ((void *(*)(void *, int32_t, int32_t))
                  gl_ia_vt(s.engine)[GL_OA_ENGINE_SLOT_GETICLIENTUSER])(
      s.engine, s.user, s.pipe);
  if (!cu || !strstr(gl_ia_rtti(cu), "IClientUser")) {
    gl_ia_emit("{\"ok\":false,\"why\":\"attach-failed\",\"detail\":\"no-iclientuser\"}");
    return GL_IA_EXIT_UNAVAILABLE;
  }
  gl_ia_emit("{\"step\":\"attach\",\"ok\":true}");

  void **vt = gl_ia_vt(cu);
  int nslots = 0;
  while (nslots < GL_OA_MAX_SLOTS && gl_oa_in_steamclient(vt[nslots])) nslots++;

  int s_on = gl_oa_find_unique(vt, nslots, GL_OA_FN_BLOGGEDON);
  if (s_on < 0) return gl_oa_unresolved("BLoggedOn");
  int s_id = gl_oa_find_unique(vt, nslots, GL_OA_FN_GETSTEAMID);
  if (s_id < 0) return gl_oa_unresolved("GetSteamID");
  int s_get = gl_oa_find_unique(vt, nslots, GL_OA_FN_GETSUBSCRIBEDAPPS);
  if (s_get < 0) return gl_oa_unresolved("GetSubscribedApps");
  gl_ia_emit("{\"step\":\"resolve\",\"ok\":true}");

  int on = ((int (*)(void *))vt[s_on])(cu) & 0xff;
  if (on != 1) {
    gl_ia_emit("{\"step\":\"logon\",\"ok\":false,\"why\":\"not-logged-on\"}");
    return GL_IA_EXIT_UNAVAILABLE;
  }
  uint64_t sid = ((uint64_t (*)(void *))vt[s_id])(cu);
  bool match = (sid == expect);
  gl_ia_emit("{\"step\":\"account\",\"match\":%s}", match ? "true" : "false");
  if (!match) {
    gl_ia_emit("{\"ok\":false,\"why\":\"account-mismatch\"}");
    return GL_IA_EXIT_UNAVAILABLE;
  }

  typedef uint32_t (*get_fn)(void *, uint32_t *, uint32_t, int);
  get_fn get = (get_fn)vt[s_get];
  uint32_t n = get(cu, NULL, 0, 0);
  if (n > GL_OA_MAX_APPS) {
    gl_ia_emit("{\"ok\":false,\"why\":\"count-out-of-range\"}");
    return GL_IA_EXIT_ERROR;
  }
  uint32_t *buf = (uint32_t *)calloc(n ? n : 1, sizeof *buf);
  if (!buf) {
    gl_ia_emit("{\"ok\":false,\"why\":\"alloc-failed\"}");
    return GL_IA_EXIT_ERROR;
  }
  uint32_t n2 = get(cu, buf, n, 0);
  if (n2 > n) {
    free(buf);
    gl_ia_emit("{\"ok\":false,\"why\":\"count-grew\"}");
    return GL_IA_EXIT_ERROR;
  }
  size_t cap = (size_t)n2 * 11 + 64;
  char *out = (char *)malloc(cap);
  if (!out) {
    free(buf);
    gl_ia_emit("{\"ok\":false,\"why\":\"alloc-failed\"}");
    return GL_IA_EXIT_ERROR;
  }
  size_t o = (size_t)snprintf(out, cap, "{\"ok\":true,\"count\":%u,\"appIds\":[", n2);
  for (uint32_t i = 0; i < n2 && o + 12 < cap; i++)
    o += (size_t)snprintf(out + o, cap - o, "%s%u", i ? "," : "", buf[i]);
  snprintf(out + o, cap - o, "]}");
  gl_ia_emit("%s", out);
  free(out);
  free(buf);
  return GL_IA_EXIT_OK;
}

#endif /* __aarch64__ */

/* argv[1] == "--steam-owned-apps". Never touches the secret env block,
 * libsteam_api or the socket server. */
static int gamelib_ownedapps_main(int argc, char **argv) {
  const char *id = NULL;
  for (int i = 2; i < argc; i++) {
    if (strcmp(argv[i], "--expect-steamid") == 0 && i + 1 < argc) id = argv[++i];
    else return gl_oa_usage("unknown-argument");
  }
  if (!id) return gl_oa_usage("missing-expect-steamid");
  size_t len = strlen(id);
  if (len < 1 || len > 20) return gl_oa_usage("bad-steamid");
  for (size_t i = 0; i < len; i++)
    if (id[i] < '0' || id[i] > '9') return gl_oa_usage("bad-steamid");
  unsigned long long expect = strtoull(id, NULL, 10);
  if (expect == 0) return gl_oa_usage("bad-steamid");

#if defined(__aarch64__)
  return gl_oa_run((uint64_t)expect);
#else
  (void)expect;
  gl_ia_emit("{\"ok\":false,\"why\":\"attach-failed\",\"detail\":\"unsupported-arch\"}");
  return GL_IA_EXIT_UNAVAILABLE;
#endif
}

#endif /* GAMELIB_OWNEDAPPS_H */
