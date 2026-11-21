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
 * The whole body is arm64-only (the function-ID decode reads AArch64
 * instructions); other slices print `unsupported-arch`.
 */
#ifndef GAMELIB_PLAYINGSESSION_H
#define GAMELIB_PLAYINGSESSION_H

#include "gamelib_ownedapps.h"

#define GL_PS_FN_BISOTHERSESSIONPLAYING 0x7787u
#define GL_PS_TIMEOUT_S 8

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

#endif /* __aarch64__ */

/* argv[1] == "--steam-playing-session". Never touches the secret env block,
 * steam_appid.txt, libsteam_api or the socket server. Takes no further
 * arguments. */
static int gamelib_playingsession_main(int argc, char **argv) {
  (void)argv;
  if (argc > 2) return gl_ia_usage("unknown-argument");

#if defined(__aarch64__)
  return gl_ps_run();
#else
  return gl_ia_unavailable("unsupported-arch");
#endif
}

#endif /* GAMELIB_PLAYINGSESSION_H */
