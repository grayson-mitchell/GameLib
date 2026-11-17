/*
 * gamelib_appstate.h -- GameLib-owned (not Valve / Wine code).
 *
 * Phase 81 D-08, spike 083 tick mode. `steam-bridge-helper --steam-appstate
 * <appId>` asks the RUNNING native macOS Steam client two questions through
 * steamclient.dylib's internal interfaces:
 *   - is it signed in (IClientUser::BLoggedOn), and
 *   - what install state does it hold for the app (IClientAppManager::
 *     GetAppInstallState; bit 4 = fully installed = Steam adopted GameLib's
 *     ACF) plus how many apps it lists (GetNumInstalledApps).
 * GameLib's adoption watch reads this once per tick to see the sign-in adoption
 * the pid rule cannot (Steam open at its sign-in screen, the operator signs in,
 * the same pid adopts).
 *
 * Reuses the gl_ia_* attach / getter-scan / method-slot helpers from
 * gamelib_installapp.h and the gl_oa_* IClientUser helpers from
 * gamelib_ownedapps.h; it copies nothing from them.
 *
 * Trust model. Same as the sibling subcommands: nothing is called on a
 * hard-coded slot unless it was verified at run time.
 *   - The app-manager getter slot is found by the forked-child RTTI scan
 *     (gl_ia_find_getter_slot); the parent never calls an unverified slot and
 *     re-checks the RTTI name of what came back.
 *   - IClientUser comes from engine slot 8 and is RTTI-checked; BLoggedOn is
 *     called only on the unique slot carrying its function ID (0x6585) that
 *     lies inside steamclient.dylib.
 *   - GetAppInstallState (0xeaf2) and GetNumInstalledApps (0xde40) are called
 *     only on a unique function-ID slot; an unresolved slot reports null for
 *     that field and nothing is called.
 *
 * Re-attaches on every call, so no handle outlives a sign-in: a handle opened
 * while Steam was signed out is not trusted after the operator signs in
 * (spike 083 attaches fresh per tick for the same reason).
 *
 * Signed-in state comes from BLoggedOn only. ConnectToGlobalUser does not track
 * the sign-in screen (CONTEXT D-08, A1), so an attach that fails with
 * not-signed-in is reported as loggedOn 0, not as an error.
 *
 * Output: exactly ONE JSON line on the original stdout; everything Steam logs
 * goes to stderr (fd 1 is redirected to fd 2 while Steam code runs). The helper
 * never reads or prints a SteamID.
 *   {"result":"ok","loggedOn":0|1,"state":N|null,"installed":K|null}  exit 0
 *   {"result":"unavailable","reason":"..."}                           exit 2
 *   {"result":"usage",...}                                            exit 64
 *
 * The whole body is arm64-only (the function-ID decode reads AArch64
 * instructions); other slices print `unsupported-arch`.
 */
#ifndef GAMELIB_APPSTATE_H
#define GAMELIB_APPSTATE_H

#include "gamelib_ownedapps.h"

#define GL_AS_FN_GETAPPINSTALLSTATE 0xeaf2u
#define GL_AS_TIMEOUT_S 8

#if defined(__aarch64__)

/* The sign-in screen: attach says nobody is signed in. Not an error (A1). */
static int gl_as_emit_signed_out(void) {
  gl_ia_emit("{\"result\":\"ok\",\"loggedOn\":0,\"state\":null,\"installed\":null}");
  return GL_IA_EXIT_OK;
}

/* A failed attach step: steam-not-running and not-signed-in have their own
 * answers, every other reason is unavailable(reason). */
static int gl_as_attach_failed(const char *reason) {
  if (strcmp(reason, "not-signed-in") == 0) return gl_as_emit_signed_out();
  return gl_ia_unavailable(reason); /* includes "steam-not-running" */
}

static int gl_as_run(uint32_t app_id) {
  /* Steam / steamclient may print on stdout; keep fd 1 for our one line only. */
  fflush(NULL);
  gl_ia_out_fd = dup(1);
  if (gl_ia_out_fd < 0) gl_ia_out_fd = 1;
  else dup2(2, 1);
  alarm(GL_AS_TIMEOUT_S); /* a hung client call must not hang the helper */

  /* Verified getter slot first, in disposable children (as gl_ia_run). A
   * failure here is only fatal when it is the same for every step; any other
   * reason leaves state/installed null and BLoggedOn is still read below. */
  const char *reason = NULL;
  int getter_slot = gl_ia_find_getter_slot(&reason);
  if (getter_slot < 0 && reason != NULL &&
      (strcmp(reason, "steam-not-running") == 0 ||
       strcmp(reason, "not-signed-in") == 0))
    return gl_as_attach_failed(reason);

  gl_ia_session s = {0};
  const char *why = gl_ia_attach(&s);
  if (why) return gl_as_attach_failed(why);

  void *cu = gl_ia_call_getter(&s, GL_OA_ENGINE_SLOT_GETICLIENTUSER);
  if (!cu || !strstr(gl_ia_rtti(cu), "IClientUser"))
    return gl_ia_unavailable("no-iclientuser");

  void **uvt = gl_ia_vt(cu);
  int nslots = 0;
  while (nslots < GL_OA_MAX_SLOTS && gl_oa_in_steamclient(uvt[nslots])) nslots++;
  int s_on = gl_oa_find_unique(uvt, nslots, GL_OA_FN_BLOGGEDON);
  if (s_on < 0) return gl_ia_unavailable("method-unverified:BLoggedOn");
  int logged_on = (((int (*)(void *))uvt[s_on])(cu) & 0xff) != 0 ? 1 : 0;

  bool have_state = false;
  bool have_installed = false;
  uint32_t state = 0;
  uint32_t installed = 0;
  if (getter_slot >= 0) {
    void *apm = gl_ia_call_getter(&s, getter_slot);
    if (apm && strstr(gl_ia_rtti(apm), "IClientAppManager")) {
      void **avt = gl_ia_vt(apm);
      int s_state = gl_ia_find_method_slot(avt, GL_AS_FN_GETAPPINSTALLSTATE);
      int s_num = gl_ia_find_method_slot(avt, GL_IA_FN_NUMINSTALLED);
      if (s_state >= 0) {
        state = ((uint32_t (*)(void *, uint32_t))avt[s_state])(apm, app_id);
        have_state = true;
      }
      if (s_num >= 0) {
        installed = ((uint32_t (*)(void *))avt[s_num])(apm);
        have_installed = true;
      }
    }
  }

  char st[16];
  char ins[16];
  if (have_state) snprintf(st, sizeof st, "%u", state);
  else snprintf(st, sizeof st, "null");
  if (have_installed) snprintf(ins, sizeof ins, "%u", installed);
  else snprintf(ins, sizeof ins, "null");
  gl_ia_emit("{\"result\":\"ok\",\"loggedOn\":%d,\"state\":%s,\"installed\":%s}",
             logged_on, st, ins);
  return GL_IA_EXIT_OK;
}

#endif /* __aarch64__ */

/* argv[1] == "--steam-appstate". Never touches the secret env block,
 * steam_appid.txt, libsteam_api or the socket server. Exactly one argument, the
 * appId, follows. */
static int gamelib_appstate_main(int argc, char **argv) {
  uint32_t app_id = 0;
  int rc = gl_ia_parse_app_id(argc, argv, &app_id);
  if (rc >= 0) return rc;
  if (argc > 3) return gl_ia_usage("unknown-argument");

#if defined(__aarch64__)
  return gl_as_run(app_id);
#else
  (void)app_id;
  return gl_ia_unavailable("unsupported-arch");
#endif
}

#endif /* GAMELIB_APPSTATE_H */
