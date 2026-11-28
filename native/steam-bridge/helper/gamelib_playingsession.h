/*
 * gamelib_playingsession.h -- GameLib-owned (not Valve / Wine code).
 *
 * Debug bridged-launch-kicks-other-session (2026-11-21). `steam-bridge-helper
 * --steam-playing-session` asks the RUNNING native macOS Steam client one
 * question through steamclient.dylib's internal IClientUser, WITHOUT starting a
 * game session: is another session of this account (a PC, a second Mac) playing
 * a game right now?
 *
 * Why. Mac Steam's own launch runs this check first (IClientUser::
 * BIsOtherSessionPlaying), shows its "playing on another computer" prompt and
 * only then claims the play slot (BKickOtherPlayingSession on "Play here"). The
 * bridge helper's InitFlat registers "playing <appId>" with Mac Steam directly,
 * skipping all of that, and the CM answered by logging one whole session off
 * ("Logged In Elsewhere", three live runs on 2026-11-21: Mac twice, PC once).
 * GameLib reads this before it lets anything register.
 *
 * Read-only and non-registering: it never sets an AppID, never calls
 * SteamAPI_InitFlat and never kicks anything. Like --steam-appstate it attaches
 * (CreateSteamPipe + ConnectToGlobalUser), which is the same call GameLib's
 * adoption watch makes every tick.
 *
 * Trust model (as the sibling subcommands): nothing is called on a hard-coded
 * slot. IClientUser comes from engine slot 8 and is RTTI-checked; BLoggedOn
 * (function-ID high half 0x6585) and BIsOtherSessionPlaying (0x7787) are called
 * only on the unique slot carrying that high half inside steamclient.dylib. The
 * signature is `bool BIsOtherSessionPlaying(uint32_t *pOtherAppId)`: the IPC
 * proxy (arm64, 2026-11-21 build) reads one return byte, then writes four bytes
 * through its first argument unconditionally, so the out pointer is never NULL.
 *
 * BIsOtherSessionPlaying is only meaningful while signed in (the playing-session
 * state is pushed by the CM), so a signed-out Steam answers `loggedOn:0` with the
 * session fields null and the method is not called.
 *
 * Output: exactly ONE JSON line on the original stdout; everything Steam logs
 * goes to stderr. The helper never reads or prints a SteamID.
 *   {"result":"ok","loggedOn":0,"otherSessionPlaying":null,"otherAppId":null}  exit 0
 *   {"result":"ok","loggedOn":1,"otherSessionPlaying":0|1,"otherAppId":N}      exit 0
 *   {"result":"unavailable","reason":"..."}                                    exit 2
 *   {"result":"usage",...}                                                     exit 64
 *
 * ---------------------------------------------------------------------------
 * Debug play-here-other-device (2026-11-28). `steam-bridge-helper
 * --steam-kick-other-session [--dry-run] [--wait <seconds>]` is the "Play here"
 * half: it calls IClientUser::BKickOtherPlayingSession, the call Mac Steam's own
 * "playing on another computer" prompt makes when the user chooses Play here, so
 * the other device's game stops WITHOUT GameLib registering "playing <appId>"
 * first (that unmediated registration is what logged a session off, see above).
 *
 * Signature (read from the arm64 proxy of the 2026-11-13 build, otool): the
 * proxy serialises only the user handle, then reads one return byte, so it is
 * `bool BKickOtherPlayingSession(void)`: no argument beyond `this`. It is
 * resolved by function-ID high half 0x6a30, unique slot only, and is refused
 * unless it sits at exactly BIsOtherSessionPlaying's slot + 1 (the order on both
 * builds seen so far; a rearranged vtable reports method-unverified instead of
 * calling a different method). What the CM does on receipt (stop only the other
 * game, or log the other session off) is NOT readable from the proxy: it is the
 * live measurement this session's checkpoint exists for.
 *
 * Guarded, never blind: it kicks ONLY when BLoggedOn reads 1 AND
 * BIsOtherSessionPlaying reads 1. A signed-out Steam, or an account nobody else
 * is playing on, calls nothing. --dry-run does the same reads and resolves the
 * kick slot but never calls it. --wait N (0..30, default 0) then polls
 * BIsOtherSessionPlaying every 250 ms in the same process until it reads 0 or N
 * seconds pass, and reports how long that took: the figure the "Play here"
 * wait is bounded by.
 *
 * Same cwd/env hardening as the read: an attach Steam tracks as a game is itself
 * a kick. One JSON line on the original stdout:
 *   {"result":"ok","loggedOn":0,"kicked":0,"reason":"signed-out"}                  exit 0
 *   {"result":"ok","loggedOn":1,"otherSessionPlaying":0,"kicked":0,
 *    "reason":"nobody-playing"}                                                    exit 0
 *   {"result":"ok","loggedOn":1,"otherSessionPlaying":1,"otherAppId":N,
 *    "kicked":0,"dryRun":true,"kickSlot":S}                                        exit 0 (--dry-run)
 *   {"result":"ok","loggedOn":1,"otherSessionPlaying":1,"otherAppId":N,"kicked":1,
 *    "returned":0|1,"callMs":T,"stillPlaying":0|1[,"waitMs":W,"cleared":0|1]}      exit 0
 *   {"result":"unavailable","reason":"..."}                                        exit 2
 *   {"result":"usage",...}                                                         exit 64
 *
 * The whole body is arm64-only (the function-ID decode reads AArch64
 * instructions); other slices print `unsupported-arch`.
 */
#ifndef GAMELIB_PLAYINGSESSION_H
#define GAMELIB_PLAYINGSESSION_H

#include "gamelib_ownedapps.h"

#define GL_PS_FN_BISOTHERSESSIONPLAYING 0x7787u
#define GL_PS_FN_BKICKOTHERPLAYINGSESSION 0x6a30u
#define GL_PS_TIMEOUT_S 8
#define GL_PS_WAIT_MAX_S 30
#define GL_PS_WAIT_POLL_MS 250

#if defined(__aarch64__)

static int gl_ps_emit_signed_out(void) {
  gl_ia_emit(
      "{\"result\":\"ok\",\"loggedOn\":0,\"otherSessionPlaying\":null,"
      "\"otherAppId\":null}");
  return GL_IA_EXIT_OK;
}

static int gl_ps_run(void) {
  /* Steam / steamclient may print on stdout; keep fd 1 for our one line only. */
  fflush(NULL);
  gl_ia_out_fd = dup(1);
  if (gl_ia_out_fd < 0) gl_ia_out_fd = 1;
  else dup2(2, 1);
  alarm(GL_PS_TIMEOUT_S); /* a hung client call must not hang the helper */

  gl_ia_session s = {0};
  const char *why = gl_ia_attach(&s);
  if (why) {
    /* The sign-in screen: attach says nobody is signed in. Not an error. */
    if (strcmp(why, "not-signed-in") == 0) return gl_ps_emit_signed_out();
    return gl_ia_unavailable(why); /* includes "steam-not-running" */
  }

  void *cu = gl_ia_call_getter(&s, GL_OA_ENGINE_SLOT_GETICLIENTUSER);
  if (!cu || !strstr(gl_ia_rtti(cu), "IClientUser"))
    return gl_ia_unavailable("no-iclientuser");

  void **uvt = gl_ia_vt(cu);
  int nslots = 0;
  while (nslots < GL_OA_MAX_SLOTS && gl_oa_in_steamclient(uvt[nslots])) nslots++;

  int s_on = gl_oa_find_unique(uvt, nslots, GL_OA_FN_BLOGGEDON);
  if (s_on < 0) return gl_ia_unavailable("method-unverified:BLoggedOn");
  int logged_on = (((int (*)(void *))uvt[s_on])(cu) & 0xff) != 0 ? 1 : 0;
  if (!logged_on) return gl_ps_emit_signed_out();

  int s_other = gl_oa_find_unique(uvt, nslots, GL_PS_FN_BISOTHERSESSIONPLAYING);
  if (s_other < 0)
    return gl_ia_unavailable("method-unverified:BIsOtherSessionPlaying");
  uint32_t other_app = 0;
  int playing = (((int (*)(void *, uint32_t *))uvt[s_other])(cu, &other_app) &
                 0xff) != 0
                    ? 1
                    : 0;
  gl_ia_emit(
      "{\"result\":\"ok\",\"loggedOn\":1,\"otherSessionPlaying\":%d,"
      "\"otherAppId\":%u}",
      playing, playing ? other_app : 0u);
  return GL_IA_EXIT_OK;
}

static long gl_ks_ms_since(long t0) { return gl_ia_now_ms() - t0; }

static int gl_ks_signed_out(void) {
  gl_ia_emit("{\"result\":\"ok\",\"loggedOn\":0,\"kicked\":0,\"reason\":\"signed-out\"}");
  return GL_IA_EXIT_OK;
}

/* --steam-kick-other-session: see the header comment. Resolves everything it is
 * going to call BEFORE it calls anything, and calls the kick last. */
static int gl_ks_run(int dry_run, int wait_s) {
  fflush(NULL);
  gl_ia_out_fd = dup(1);
  if (gl_ia_out_fd < 0) gl_ia_out_fd = 1;
  else dup2(2, 1);
  alarm(GL_PS_TIMEOUT_S + wait_s); /* a hung client call must not hang the helper */

  gl_ia_session s = {0};
  const char *why = gl_ia_attach(&s);
  if (why) {
    if (strcmp(why, "not-signed-in") == 0) return gl_ks_signed_out();
    return gl_ia_unavailable(why); /* includes "steam-not-running" */
  }

  void *cu = gl_ia_call_getter(&s, GL_OA_ENGINE_SLOT_GETICLIENTUSER);
  if (!cu || !strstr(gl_ia_rtti(cu), "IClientUser"))
    return gl_ia_unavailable("no-iclientuser");

  void **uvt = gl_ia_vt(cu);
  int nslots = 0;
  while (nslots < GL_OA_MAX_SLOTS && gl_oa_in_steamclient(uvt[nslots])) nslots++;

  int s_on = gl_oa_find_unique(uvt, nslots, GL_OA_FN_BLOGGEDON);
  if (s_on < 0) return gl_ia_unavailable("method-unverified:BLoggedOn");
  int s_other = gl_oa_find_unique(uvt, nslots, GL_PS_FN_BISOTHERSESSIONPLAYING);
  if (s_other < 0)
    return gl_ia_unavailable("method-unverified:BIsOtherSessionPlaying");
  int s_kick =
      gl_oa_find_unique(uvt, nslots, GL_PS_FN_BKICKOTHERPLAYINGSESSION);
  /* Unique by function ID AND directly after BIsOtherSessionPlaying (the order
   * on both builds seen): a method the helper has never measured is not called
   * on a rearranged vtable. */
  if (s_kick < 0 || s_kick != s_other + 1)
    return gl_ia_unavailable("method-unverified:BKickOtherPlayingSession");

  int logged_on = (((int (*)(void *))uvt[s_on])(cu) & 0xff) != 0 ? 1 : 0;
  if (!logged_on) return gl_ks_signed_out();

  typedef int (*other_fn)(void *, uint32_t *);
  other_fn other = (other_fn)uvt[s_other];
  uint32_t other_app = 0;
  int playing = (other(cu, &other_app) & 0xff) != 0 ? 1 : 0;
  if (!playing) {
    gl_ia_emit(
        "{\"result\":\"ok\",\"loggedOn\":1,\"otherSessionPlaying\":0,"
        "\"kicked\":0,\"reason\":\"nobody-playing\"}");
    return GL_IA_EXIT_OK;
  }
  if (dry_run) {
    gl_ia_emit(
        "{\"result\":\"ok\",\"loggedOn\":1,\"otherSessionPlaying\":1,"
        "\"otherAppId\":%u,\"kicked\":0,\"dryRun\":true,\"kickSlot\":%d}",
        other_app, s_kick);
    return GL_IA_EXIT_OK;
  }

  /* The one call that acts. `bool BKickOtherPlayingSession(void)`. */
  long t_call = gl_ia_now_ms();
  int returned = (((int (*)(void *))uvt[s_kick])(cu) & 0xff) != 0 ? 1 : 0;
  long call_ms = gl_ks_ms_since(t_call);

  uint32_t after_app = 0;
  int still = (other(cu, &after_app) & 0xff) != 0 ? 1 : 0;

  if (wait_s <= 0) {
    gl_ia_emit(
        "{\"result\":\"ok\",\"loggedOn\":1,\"otherSessionPlaying\":1,"
        "\"otherAppId\":%u,\"kicked\":1,\"returned\":%d,\"callMs\":%ld,"
        "\"stillPlaying\":%d}",
        other_app, returned, call_ms, still);
    return GL_IA_EXIT_OK;
  }

  long t_wait = gl_ia_now_ms();
  while (still && gl_ks_ms_since(t_wait) < (long)wait_s * 1000L) {
    struct timespec nap = {0, GL_PS_WAIT_POLL_MS * 1000000L};
    nanosleep(&nap, NULL);
    still = (other(cu, &after_app) & 0xff) != 0 ? 1 : 0;
  }
  gl_ia_emit(
      "{\"result\":\"ok\",\"loggedOn\":1,\"otherSessionPlaying\":1,"
      "\"otherAppId\":%u,\"kicked\":1,\"returned\":%d,\"callMs\":%ld,"
      "\"stillPlaying\":%d,\"waitMs\":%ld,\"cleared\":%d}",
      other_app, returned, call_ms, still, gl_ks_ms_since(t_wait),
      still ? 0 : 1);
  return GL_IA_EXIT_OK;
}

#endif /* __aarch64__ */

/* argv[1] == "--steam-kick-other-session" [--dry-run] [--wait <0..30>]. Same
 * isolation as the read below: no secret env block, no steam_appid.txt, no
 * libsteam_api, no socket server; AppID sources dropped and cwd "/" before it
 * attaches. */
static int gamelib_kickothersession_main(int argc, char **argv) {
  int dry_run = 0;
  int wait_s = 0;
  for (int i = 2; i < argc; i++) {
    if (strcmp(argv[i], "--dry-run") == 0) {
      dry_run = 1;
    } else if (strcmp(argv[i], "--wait") == 0 && i + 1 < argc) {
      const char *v = argv[++i];
      size_t len = strlen(v);
      if (len < 1 || len > 2) return gl_ia_usage("bad-wait");
      for (size_t k = 0; k < len; k++)
        if (v[k] < '0' || v[k] > '9') return gl_ia_usage("bad-wait");
      wait_s = atoi(v);
      if (wait_s > GL_PS_WAIT_MAX_S) return gl_ia_usage("bad-wait");
    } else {
      return gl_ia_usage("unknown-argument");
    }
  }

  unsetenv("SteamAppId");
  unsetenv("SteamGameId");
  unsetenv("SteamOverlayGameId");
  if (chdir("/") != 0) return gl_ia_unavailable("chdir-failed");

#if defined(__aarch64__)
  return gl_ks_run(dry_run, wait_s);
#else
  (void)dry_run;
  (void)wait_s;
  return gl_ia_unavailable("unsupported-arch");
#endif
}

/* argv[1] == "--steam-playing-session". Never touches the secret env block,
 * steam_appid.txt, libsteam_api or the socket server. Takes no further
 * arguments. */
static int gamelib_playingsession_main(int argc, char **argv) {
  (void)argv;
  if (argc > 2) return gl_ia_usage("unknown-argument");

  /* Live 2026-11-22: attaching from a cwd holding steam_appid.txt (the repo
   * root has one saying 480) made Mac Steam track this process as a running
   * AppID 480, and with the PC playing the CM logged the Mac off. A read must
   * never look like a game: drop every AppID source before attaching. */
  unsetenv("SteamAppId");
  unsetenv("SteamGameId");
  unsetenv("SteamOverlayGameId");
  if (chdir("/") != 0) return gl_ia_unavailable("chdir-failed");

#if defined(__aarch64__)
  return gl_ps_run();
#else
  return gl_ia_unavailable("unsupported-arch");
#endif
}

#endif /* GAMELIB_PLAYINGSESSION_H */
