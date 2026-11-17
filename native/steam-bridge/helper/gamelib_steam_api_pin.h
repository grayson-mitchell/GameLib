/*
 * gamelib_steam_api_pin.h -- the helper's compiled-in libsteam_api.dylib pin and the validator
 * that gates dlopen of a caller-handed path (quick 261117-ubb, T-ubb-02).
 *
 * The sidecar hands the helper `--steam-api-dylib <path>` (the GameLib cache copy of the pinned,
 * Valve-signed dylib). The helper never trusts that path: it loads it only when the file's bytes
 * hash to GAMELIB_STEAM_API_PIN_SHA256. Anything else falls back to the Steam-tree lookup the
 * helper derives from $HOME, logged as UNPINNED with the reason.
 *
 * The pin below is the Oct 21 client build (SteamUser v023). Bump it ONLY together with a
 * `pnpm gen-vtables` regeneration of generated/bridge_dispatch.h and the Rust pin record in
 * src-tauri/crates/gamelib-depot/src/steam_api_pin.rs; `cargo test -p gamelib-depot` fails when
 * the three disagree.
 */
#ifndef GAMELIB_STEAM_API_PIN_H
#define GAMELIB_STEAM_API_PIN_H

#include <CommonCrypto/CommonDigest.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

/* The override exists only so helperIntegration.test.ts can build a test-pinned helper
 * (-DGAMELIB_STEAM_API_PIN_SHA256="..."); production never sets it. */
#ifndef GAMELIB_STEAM_API_PIN_SHA256
#define GAMELIB_STEAM_API_PIN_SHA256 "4162eb404dd42f572e7514f906f9ad5e16b7ab9c3ad29f3a532dacbc30e16bac"
#endif
#define GAMELIB_STEAM_API_PIN_STEAMUSER "SteamUser_v023"

#define GL_PIN_MAX_PATH 1024
#define GL_PIN_MAX_BYTES (16u * 1024u * 1024u)
#define GL_PIN_BASENAME "libsteam_api.dylib"

/* True when `path` contains a `.` or `..` segment (including a trailing one). */
static int gl_pin_has_dot_segment(const char *path) {
  const char *seg = path;
  while (*seg != '\0') {
    while (*seg == '/') seg++;
    const char *end = seg;
    while (*end != '\0' && *end != '/') end++;
    size_t len = (size_t)(end - seg);
    if ((len == 1 && seg[0] == '.') || (len == 2 && seg[0] == '.' && seg[1] == '.')) return 1;
    seg = end;
  }
  return 0;
}

/*
 * Returns 1 only when `path` may be handed to dlopen: an absolute path with no dot segments whose
 * basename is libsteam_api.dylib, naming a regular file (opened with O_NOFOLLOW, so a symlink is
 * refused) owned by this user and not group/world-writable, at most 16 MiB, whose sha256 equals
 * the pin. On 0, *reasonOut names the first failing check.
 */
static int gl_steam_api_pin_check(const char *path, const char **reasonOut) {
  const char *dummy = NULL;
  if (reasonOut == NULL) reasonOut = &dummy;

  size_t len = path ? strlen(path) : 0;
  const size_t baseLen = strlen(GL_PIN_BASENAME);
  if (len == 0 || len >= GL_PIN_MAX_PATH || path[0] != '/' || gl_pin_has_dot_segment(path) ||
      len < baseLen + 1 || path[len - baseLen - 1] != '/' ||
      strcmp(path + len - baseLen, GL_PIN_BASENAME) != 0) {
    *reasonOut = "invalid-path";
    return 0;
  }

  int fd = open(path, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
  if (fd < 0) {
    *reasonOut = "open-failed";
    return 0;
  }

  struct stat st;
  if (fstat(fd, &st) != 0 || !S_ISREG(st.st_mode)) {
    close(fd);
    *reasonOut = "not-regular-file";
    return 0;
  }
  if (st.st_uid != getuid() || (st.st_mode & (S_IWGRP | S_IWOTH)) != 0) {
    close(fd);
    *reasonOut = "unsafe-owner-or-mode";
    return 0;
  }
  if (st.st_size < 0 || (uint64_t)st.st_size > GL_PIN_MAX_BYTES) {
    close(fd);
    *reasonOut = "too-large";
    return 0;
  }

  CC_SHA256_CTX ctx;
  CC_SHA256_Init(&ctx);
  unsigned char buf[16384];
  for (;;) {
    ssize_t n = read(fd, buf, sizeof buf);
    if (n < 0) {
      close(fd);
      *reasonOut = "read-failed";
      return 0;
    }
    if (n == 0) break;
    CC_SHA256_Update(&ctx, buf, (CC_LONG)n);
  }
  close(fd);

  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256_Final(digest, &ctx);
  char hexOut[CC_SHA256_DIGEST_LENGTH * 2 + 1];
  for (int i = 0; i < CC_SHA256_DIGEST_LENGTH; i++) {
    snprintf(hexOut + i * 2, 3, "%02x", digest[i]);
  }
  if (strcmp(hexOut, GAMELIB_STEAM_API_PIN_SHA256) != 0) {
    *reasonOut = "sha256-mismatch";
    return 0;
  }
  return 1;
}

#endif /* GAMELIB_STEAM_API_PIN_H */
