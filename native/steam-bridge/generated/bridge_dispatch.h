/**
 * GENERATED FILE -- DO NOT EDIT BY HAND.
 * Produced by meta/gen_vtables.ts (`pnpm gen-vtables`), 51-10 -- the
 * helper-side (native arm64, macOS) half of the SAME wire
 * native/steam-bridge/generated/steam_api_shim.c marshals the shim side
 * of. #include'd from native/steam-bridge/helper/bridge_helper.c.
 *
 * Interfaces covered: SteamUser023, SteamFriends018.
 */
#ifndef GAMELIB_BRIDGE_DISPATCH_H
#define GAMELIB_BRIDGE_DISPATCH_H

#include <dlfcn.h>
#include <stdint.h>
#include <string.h>

/*
Wire marshaling layout (51-06 Task 3; 51-10 mirrors this exactly):

Request blob (per method, params in manifest declaration order):
  - no kind, or kind 'value': paramWidth(type) raw bytes, host byte order.
  - kind 'in-string': [u32 len][len bytes, NOT NUL-terminated]. A NULL
    pointer packs len = 0xFFFFFFFF and no bytes. len is the real string's
    byte length capped at WIRE_IN_STRING_MAX_BYTES.
  - kind 'out-value': nothing -- an out-value param is NEVER sent.
  - kind 'out-buffer': [u32 capacity] -- the sibling param named by
    sizeParam, read at call time and capped at WIRE_OUT_BUFFER_MAX_BYTES.

Response blob (per method):
  - the return value: 0 bytes (returnKind 'void'), 4 bytes (int32/pointer/
    float), 8 bytes (int64/double), [u32 len][bytes] (returnKind 'string',
    decoded by the dedicated string-return branch), or structSize bytes
    (returnKind 'class', the sret branch).
  - then, for every 'out-value' param in declaration order: valueType's
    width (int32/uint32/float/bool = 4 bytes, uint64 = 8 bytes).
  - then, for every 'out-buffer' param in declaration order: [u32 len][len
    bytes] -- len is what the helper actually has, which may exceed the
    caller's capacity; the shim copies min(len, capacity) and NUL-
    terminates only when the param's own type is a NUL-terminated string
    type (e.g. 'char*').
*/
#define BD_WIRE_IN_STRING_MAX_BYTES 4096

// Digest of the SAME sorted (interface, ordinal, slot, layout) wire-method
// tuples BRIDGE_SHIM_TABLE_HASH (steam_api_shim.c) embeds -- a drift
// between the two means the shim and this dispatch table disagree about
// what is on the wire.
#define BRIDGE_DISPATCH_TABLE_HASH "33b383832d84"

// Response scratch -- bridge_dispatch() never writes past respCap, which
// the caller (bridge_helper.c) sizes to this constant.
#define BRIDGE_DISPATCH_RESP_SCRATCH_BYTES 4096

typedef void *(*BDAccessorFn_t)(void);

#define BD_ORDINAL_SteamUser023 1
static BDAccessorFn_t g_bd_accessor_steamuser023;
static void *g_bd_self_steamuser023;
#define BD_ORDINAL_SteamFriends018 2
static BDAccessorFn_t g_bd_accessor_steamfriends018;
static void *g_bd_self_steamfriends018;

#define BD_SLOT_SteamUser023_GetHSteamUser 0
typedef uint32_t (*BDFlatFn_SteamUser023_GetHSteamUser_t)(void *);
static BDFlatFn_SteamUser023_GetHSteamUser_t g_bd_flat_SteamUser023_GetHSteamUser;
#define BD_SLOT_SteamUser023_BLoggedOn 1
typedef int (*BDFlatFn_SteamUser023_BLoggedOn_t)(void *);
static BDFlatFn_SteamUser023_BLoggedOn_t g_bd_flat_SteamUser023_BLoggedOn;
#define BD_SLOT_SteamUser023_GetSteamID 2
typedef uint64_t (*BDFlatFn_SteamUser023_GetSteamID_t)(void *);
static BDFlatFn_SteamUser023_GetSteamID_t g_bd_flat_SteamUser023_GetSteamID;
#define BD_SLOT_SteamFriends018_GetPersonaName 0
typedef const char * (*BDFlatFn_SteamFriends018_GetPersonaName_t)(void *);
static BDFlatFn_SteamFriends018_GetPersonaName_t g_bd_flat_SteamFriends018_GetPersonaName;

// D-51-04: identity-only mode -- set once by bridge_helper.c's argv
// parsing (--identity-only/--report-appid), read by every dispatch case
// above that gates an app-scoped family or special-cases SteamUtils
// GetAppID.
static int g_bd_identity_only = 0;
static uint32_t g_bd_report_appid = 0;

void bridge_dispatch_set_identity_only(int on, uint32_t reportAppId) {
  g_bd_identity_only = on ? 1 : 0;
  g_bd_report_appid = reportAppId;
}

// NULL-tolerant: a dlsym failure here leaves the affected self/flat
// pointer NULL, and every dispatch case above checks for NULL before
// calling through (T-51-23) -- never fatal to the whole helper.
int bridge_dispatch_init(void *dylibHandle) {
  if (!dylibHandle) return 0;
  g_bd_accessor_steamuser023 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUser_v023");
  g_bd_self_steamuser023 = g_bd_accessor_steamuser023 ? g_bd_accessor_steamuser023() : NULL;
  g_bd_flat_SteamUser023_GetHSteamUser = (BDFlatFn_SteamUser023_GetHSteamUser_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetHSteamUser");
  g_bd_flat_SteamUser023_BLoggedOn = (BDFlatFn_SteamUser023_BLoggedOn_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_BLoggedOn");
  g_bd_flat_SteamUser023_GetSteamID = (BDFlatFn_SteamUser023_GetSteamID_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetSteamID");
  g_bd_accessor_steamfriends018 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamFriends_v018");
  g_bd_self_steamfriends018 = g_bd_accessor_steamfriends018 ? g_bd_accessor_steamfriends018() : NULL;
  g_bd_flat_SteamFriends018_GetPersonaName = (BDFlatFn_SteamFriends018_GetPersonaName_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetPersonaName");
  return 1;
}

uint8_t bridge_dispatch(uint16_t ordinal, uint16_t slot, const uint8_t *arg, uint32_t argLen,
                         uint8_t *resp, uint32_t respCap, uint32_t *respLen) {
  (void)arg; (void)argLen;
  *respLen = 0;
  switch (((uint32_t)ordinal << 16) | (uint32_t)slot) {
    case (((uint32_t)1) << 16 | 0u): { // SteamUser023.GetHSteamUser
      if (g_bd_flat_SteamUser023_GetHSteamUser == NULL || g_bd_self_steamuser023 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUser023_GetHSteamUser(g_bd_self_steamuser023);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)1) << 16 | 1u): { // SteamUser023.BLoggedOn
      if (g_bd_flat_SteamUser023_BLoggedOn == NULL || g_bd_self_steamuser023 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUser023_BLoggedOn(g_bd_self_steamuser023);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)1) << 16 | 2u): { // SteamUser023.GetSteamID
      if (g_bd_flat_SteamUser023_GetSteamID == NULL || g_bd_self_steamuser023 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint64_t __ret = g_bd_flat_SteamUser023_GetSteamID(g_bd_self_steamuser023);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 8);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)2) << 16 | 0u): { // SteamFriends018.GetPersonaName
      if (g_bd_flat_SteamFriends018_GetPersonaName == NULL || g_bd_self_steamfriends018 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamFriends018_GetPersonaName(g_bd_self_steamfriends018);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    default:
      return 1; // T-51-23: unknown (ordinal, slot) pair -- never read
  }
}

#endif /* GAMELIB_BRIDGE_DISPATCH_H */
