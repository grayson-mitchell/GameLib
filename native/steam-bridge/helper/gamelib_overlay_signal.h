/*
 * gamelib_overlay_signal.h -- GameLib-owned (not Valve / Wine code).
 *
 * Phase 60 plan 15. 60-12 returned V-NONE: the probe saw no overlay open /
 * close marker in the game process. Mac Steam does report the transition to
 * the bridge helper as GameOverlayActivated_t (k_iCallback 331); the helper
 * used to drop it as "unlisted". Plan 60-19 (60-18 verdict X-RELEASE+BLOCK,
 * signal cb): the helper now publishes each transition on every launch as the
 * Darwin notification
 *   com.gamelib.steambridge.overlay.<appid>
 * (state 1 = open, 0 = closed) that overlay_input.dylib listens to. The publish
 * is production; the per-transition log stays diagnostic, behind
 * GAMELIB_OVERLAY_INPUT_PROBE=1.
 *
 * 60-REVIEW WR-01: the open state carries the publishing helper's pid,
 *   state = (pid << 8) | 1   (open; never 0)
 *   state = 0                (closed)
 * so overlay_input can tell a dead publisher from a long, legitimate open and
 * close only when the helper is provably gone (kill(pid, 0) fails with ESRCH).
 * A listener that only tests `state != 0` (the 60-11 probe) reads it unchanged.
 *
 * Self-contained: stdint/string/notify/unistd only, no allocation, no logging.
 * 331 is NEVER added to the callback allowlist (the game gets no new callback).
 */
#ifndef GAMELIB_OVERLAY_SIGNAL_H
#define GAMELIB_OVERLAY_SIGNAL_H

#include <notify.h>
#include <stdint.h>
#include <string.h>
#include <unistd.h>

#define GL_OVL_CALLBACK_ID 331
#define GL_OVL_NOTIFY_PREFIX "com.gamelib.steambridge.overlay."
#define GL_OVL_LOG_BUDGET 256

typedef struct {
  int publish; /* production: on whenever name is valid */
  int log;     /* diagnostic: GAMELIB_OVERLAY_INPUT_PROBE=1 only */
  int registered;
  int token;
  char name[64];
  unsigned logged;
} gl_ovl_state;

/* Byte 0 of GameOverlayActivated_t is uint8 m_bActive. -1 = unusable. */
static inline int gl_ovl_parse_active(const void *p, int cub) {
  if (p == NULL || cub < 1) return -1;
  return ((const uint8_t *)p)[0] != 0 ? 1 : 0;
}

/* appid: 1-10 ASCII digits. Returns 0 on success, -1 (buf emptied) otherwise. */
static inline int gl_ovl_notify_name(char *buf, size_t n, const char *appid) {
  size_t plen = sizeof(GL_OVL_NOTIFY_PREFIX) - 1;
  size_t alen, i;
  if (buf == NULL || n == 0) return -1;
  buf[0] = '\0';
  if (appid == NULL) return -1;
  alen = strlen(appid);
  if (alen < 1 || alen > 10) return -1;
  for (i = 0; i < alen; i++)
    if (appid[i] < '0' || appid[i] > '9') return -1;
  if (plen + alen + 1 > n) return -1;
  memcpy(buf, GL_OVL_NOTIFY_PREFIX, plen);
  memcpy(buf + plen, appid, alen + 1);
  return 0;
}

static inline int gl_ovl_enabled_from_env(const char *v) {
  return v != NULL && strcmp(v, "1") == 0;
}

/* WR-01: the open state for publisher `pid` (see the header comment). */
static inline uint64_t gl_ovl_open_state(pid_t pid) {
  return ((uint64_t)(uint32_t)pid << 8) | 1u;
}

/* Returns 0 on success, -1 on failure. */
static inline int gl_ovl_publish(gl_ovl_state *s, int active) {
  if (s == NULL || s->name[0] == '\0') return -1;
  if (!s->registered) {
    if (notify_register_check(s->name, &s->token) != NOTIFY_STATUS_OK) return -1;
    s->registered = 1;
  }
  if (notify_set_state(s->token, active ? gl_ovl_open_state(getpid()) : 0) != NOTIFY_STATUS_OK)
    return -1;
  if (notify_post(s->name) != NOTIFY_STATUS_OK) return -1;
  return 0;
}

static inline int gl_ovl_log_take(gl_ovl_state *s) {
  if (s == NULL || !s->log || s->logged >= GL_OVL_LOG_BUDGET) return 0;
  s->logged++;
  return 1;
}

#endif
