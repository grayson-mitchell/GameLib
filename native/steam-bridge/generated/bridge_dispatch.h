/**
 * GENERATED FILE -- DO NOT EDIT BY HAND.
 * Produced by meta/gen_vtables.ts (`pnpm gen-vtables`), 51-10 -- the
 * helper-side (native arm64, macOS) half of the SAME wire
 * native/steam-bridge/generated/steam_api_shim.c marshals the shim side
 * of. #include'd from native/steam-bridge/helper/bridge_helper.c.
 *
 * Interfaces covered: SteamUser023, SteamFriends018, SteamUser016, SteamFriends011, SteamUtils005, STEAMAPPS_INTERFACE_VERSION004, STEAMUSERSTATS_INTERFACE_VERSION010, SteamFriends013, STEAMAPPS_INTERFACE_VERSION005, STEAMUSERSTATS_INTERFACE_VERSION011, SteamClient017, SteamUser019, SteamFriends015, SteamUtils008, STEAMAPPS_INTERFACE_VERSION008, SteamClient014, SteamClient020, SteamClient021, SteamUser021, SteamFriends017, SteamUtils010, STEAMUSERSTATS_INTERFACE_VERSION012, STEAMUSERSTATS_INTERFACE_VERSION013, SteamUtils009, SteamUser018, SteamUtils007, STEAMAPPS_INTERFACE_VERSION007.
 */
#ifndef GAMELIB_BRIDGE_DISPATCH_H
#define GAMELIB_BRIDGE_DISPATCH_H

#include <dlfcn.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

// Phase 52: bridge_helper.c defines logts() after #including this header.
static void logts(const char *cat, const char *msg);

// Phase 52 (T-52-04): game-controlled strings reach the FWD log only
// through this sanitizer -- length-bounded, non-printables become '?'.
#define BD_FWD_VERSION_CAP 129
static void bd_fwd_sanitize(const char *in, char *out, size_t cap) {
  size_t i = 0;
  if (cap == 0) return;
  if (in == NULL) { snprintf(out, cap, "(null)"); return; }
  for (; in[i] != '\0' && i < 128 && i + 1 < cap; i++) {
    unsigned char c = (unsigned char)in[i];
    out[i] = (c >= 0x20 && c <= 0x7e) ? (char)c : '?';
  }
  out[i] = '\0';
}

/*
Wire marshaling layout (51-06 Task 3; 51-10 mirrors this exactly):

Request blob (per method, params in manifest declaration order):
  - no kind, or kind 'value': paramWidth(type) raw bytes, host byte order.
  - kind 'in-string': [u32 len][len bytes, NOT NUL-terminated]. A NULL
    pointer packs len = 0xFFFFFFFF and no bytes. len is the real string's
    byte length. A string longer than WIRE_IN_STRING_MAX_BYTES is never
    truncated: it packs len = WIRE_IN_STRING_MAX_BYTES + 1 and no bytes,
    which the helper refuses (status != 0), so the call fails (55 WR-04).
  - kind 'out-value': nothing -- an out-value param is NEVER sent.
  - kind 'out-buffer': [u32 capacity] -- the sibling param named by
    sizeParam, read at call time and capped at WIRE_OUT_BUFFER_MAX_BYTES
    (a negative sizeParam sends capacity 0).
  - kind 'null-in' (53-14): nothing -- a const SteamNetworkingIdentity*
    param is NEVER sent; the helper passes NULL for it.

Response blob (per method):
  - the return value: 0 bytes (returnKind 'void'), 4 bytes (int32/pointer/
    float), 8 bytes (int64/double), [u32 len][bytes] (returnKind 'string',
    decoded by the dedicated string-return branch), or structSize bytes
    (returnKind 'class', the sret branch).
  - then, for every 'out-value' param in declaration order: valueType's
    width (int32/uint32/float/bool = 4 bytes, uint64 = 8 bytes).
  - then, for every 'out-buffer' param in declaration order: [u32 len][len
    bytes] -- len is what the helper actually has (when the param names a
    lenParam, min(that out-value, capacity)); the shim copies
    min(len, capacity) and NUL-terminates only when the param's own type
    is a NUL-terminated string type (e.g. 'char*').
*/
#define BD_WIRE_IN_STRING_MAX_BYTES 4096
#define BD_WIRE_OUT_BUFFER_MAX_BYTES 4096

// Digest of the SAME sorted (interface, ordinal, slot, layout) wire-method
// tuples BRIDGE_SHIM_TABLE_HASH (steam_api_shim.c) embeds -- a drift
// between the two means the shim and this dispatch table disagree about
// what is on the wire.
#define BRIDGE_DISPATCH_TABLE_HASH "e05aec2c174d"

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
#define BD_ORDINAL_SteamUser016 3
static BDAccessorFn_t g_bd_accessor_steamuser016;
static void *g_bd_self_steamuser016;
#define BD_ORDINAL_SteamFriends011 4
static BDAccessorFn_t g_bd_accessor_steamfriends011;
static void *g_bd_self_steamfriends011;
#define BD_ORDINAL_SteamUtils005 5
static BDAccessorFn_t g_bd_accessor_steamutils005;
static void *g_bd_self_steamutils005;
#define BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION004 6
static BDAccessorFn_t g_bd_accessor_steamapps_interface_version004;
static void *g_bd_self_steamapps_interface_version004;
#define BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 7
static BDAccessorFn_t g_bd_accessor_steamuserstats_interface_version010;
static void *g_bd_self_steamuserstats_interface_version010;
#define BD_ORDINAL_SteamFriends013 8
static BDAccessorFn_t g_bd_accessor_steamfriends013;
static void *g_bd_self_steamfriends013;
#define BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 9
static BDAccessorFn_t g_bd_accessor_steamapps_interface_version005;
static void *g_bd_self_steamapps_interface_version005;
#define BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 10
static BDAccessorFn_t g_bd_accessor_steamuserstats_interface_version011;
static void *g_bd_self_steamuserstats_interface_version011;
#define BD_ORDINAL_SteamClient017 16
static BDAccessorFn_t g_bd_accessor_steamclient017;
static void *g_bd_self_steamclient017;
#define BD_ORDINAL_SteamUser019 17
static BDAccessorFn_t g_bd_accessor_steamuser019;
static void *g_bd_self_steamuser019;
#define BD_ORDINAL_SteamFriends015 18
static BDAccessorFn_t g_bd_accessor_steamfriends015;
static void *g_bd_self_steamfriends015;
#define BD_ORDINAL_SteamUtils008 19
static BDAccessorFn_t g_bd_accessor_steamutils008;
static void *g_bd_self_steamutils008;
#define BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 20
static BDAccessorFn_t g_bd_accessor_steamapps_interface_version008;
static void *g_bd_self_steamapps_interface_version008;
#define BD_ORDINAL_SteamClient014 22
static BDAccessorFn_t g_bd_accessor_steamclient014;
static void *g_bd_self_steamclient014;
#define BD_ORDINAL_SteamClient020 25
static BDAccessorFn_t g_bd_accessor_steamclient020;
static void *g_bd_self_steamclient020;
#define BD_ORDINAL_SteamClient021 26
static BDAccessorFn_t g_bd_accessor_steamclient021;
static void *g_bd_self_steamclient021;
#define BD_ORDINAL_SteamUser021 27
static BDAccessorFn_t g_bd_accessor_steamuser021;
static void *g_bd_self_steamuser021;
#define BD_ORDINAL_SteamFriends017 28
static BDAccessorFn_t g_bd_accessor_steamfriends017;
static void *g_bd_self_steamfriends017;
#define BD_ORDINAL_SteamUtils010 29
static BDAccessorFn_t g_bd_accessor_steamutils010;
static void *g_bd_self_steamutils010;
#define BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 30
static BDAccessorFn_t g_bd_accessor_steamuserstats_interface_version012;
static void *g_bd_self_steamuserstats_interface_version012;
#define BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 31
static BDAccessorFn_t g_bd_accessor_steamuserstats_interface_version013;
static void *g_bd_self_steamuserstats_interface_version013;
#define BD_ORDINAL_SteamUtils009 54
static BDAccessorFn_t g_bd_accessor_steamutils009;
static void *g_bd_self_steamutils009;
#define BD_ORDINAL_SteamUser018 59
static BDAccessorFn_t g_bd_accessor_steamuser018;
static void *g_bd_self_steamuser018;
#define BD_ORDINAL_SteamUtils007 60
static BDAccessorFn_t g_bd_accessor_steamutils007;
static void *g_bd_self_steamutils007;
#define BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 61
static BDAccessorFn_t g_bd_accessor_steamapps_interface_version007;
static void *g_bd_self_steamapps_interface_version007;

#define BD_SLOT_SteamUser023_GetHSteamUser 0
typedef int32_t (*BDFlatFn_SteamUser023_GetHSteamUser_t)(void *);
static BDFlatFn_SteamUser023_GetHSteamUser_t g_bd_flat_SteamUser023_GetHSteamUser;
#define BD_SLOT_SteamUser023_BLoggedOn 1
typedef int (*BDFlatFn_SteamUser023_BLoggedOn_t)(void *);
static BDFlatFn_SteamUser023_BLoggedOn_t g_bd_flat_SteamUser023_BLoggedOn;
#define BD_SLOT_SteamUser023_GetSteamID 2
typedef uint64_t (*BDFlatFn_SteamUser023_GetSteamID_t)(void *);
static BDFlatFn_SteamUser023_GetSteamID_t g_bd_flat_SteamUser023_GetSteamID;
#define BD_SLOT_SteamUser023_GetAuthSessionTicket 13
typedef uint32_t (*BDFlatFn_SteamUser023_GetAuthSessionTicket_t)(void *, void *, int32_t, uint32_t *, const void *);
static BDFlatFn_SteamUser023_GetAuthSessionTicket_t g_bd_flat_SteamUser023_GetAuthSessionTicket;
#define BD_SLOT_SteamUser023_GetAuthTicketForWebApi 14
typedef uint32_t (*BDFlatFn_SteamUser023_GetAuthTicketForWebApi_t)(void *, const char *);
static BDFlatFn_SteamUser023_GetAuthTicketForWebApi_t g_bd_flat_SteamUser023_GetAuthTicketForWebApi;
#define BD_SLOT_SteamUser023_CancelAuthTicket 17
typedef void (*BDFlatFn_SteamUser023_CancelAuthTicket_t)(void *, uint32_t);
static BDFlatFn_SteamUser023_CancelAuthTicket_t g_bd_flat_SteamUser023_CancelAuthTicket;
#define BD_SLOT_SteamFriends018_GetPersonaName 0
typedef const char * (*BDFlatFn_SteamFriends018_GetPersonaName_t)(void *);
static BDFlatFn_SteamFriends018_GetPersonaName_t g_bd_flat_SteamFriends018_GetPersonaName;
#define BD_SLOT_SteamFriends018_GetPersonaState 1
typedef uint32_t (*BDFlatFn_SteamFriends018_GetPersonaState_t)(void *);
static BDFlatFn_SteamFriends018_GetPersonaState_t g_bd_flat_SteamFriends018_GetPersonaState;
#define BD_SLOT_SteamUser016_GetHSteamUser 0
typedef int32_t (*BDFlatFn_SteamUser016_GetHSteamUser_t)(void *);
static BDFlatFn_SteamUser016_GetHSteamUser_t g_bd_flat_SteamUser016_GetHSteamUser;
#define BD_SLOT_SteamUser016_BLoggedOn 1
typedef int (*BDFlatFn_SteamUser016_BLoggedOn_t)(void *);
static BDFlatFn_SteamUser016_BLoggedOn_t g_bd_flat_SteamUser016_BLoggedOn;
#define BD_SLOT_SteamUser016_GetSteamID 2
typedef uint64_t (*BDFlatFn_SteamUser016_GetSteamID_t)(void *);
static BDFlatFn_SteamUser016_GetSteamID_t g_bd_flat_SteamUser016_GetSteamID;
#define BD_SLOT_SteamFriends011_GetPersonaName 0
typedef const char * (*BDFlatFn_SteamFriends011_GetPersonaName_t)(void *);
static BDFlatFn_SteamFriends011_GetPersonaName_t g_bd_flat_SteamFriends011_GetPersonaName;
#define BD_SLOT_SteamFriends011_GetPersonaState 2
typedef uint32_t (*BDFlatFn_SteamFriends011_GetPersonaState_t)(void *);
static BDFlatFn_SteamFriends011_GetPersonaState_t g_bd_flat_SteamFriends011_GetPersonaState;
#define BD_SLOT_SteamUtils005_GetSecondsSinceAppActive 0
typedef uint32_t (*BDFlatFn_SteamUtils005_GetSecondsSinceAppActive_t)(void *);
static BDFlatFn_SteamUtils005_GetSecondsSinceAppActive_t g_bd_flat_SteamUtils005_GetSecondsSinceAppActive;
#define BD_SLOT_SteamUtils005_GetSecondsSinceComputerActive 1
typedef uint32_t (*BDFlatFn_SteamUtils005_GetSecondsSinceComputerActive_t)(void *);
static BDFlatFn_SteamUtils005_GetSecondsSinceComputerActive_t g_bd_flat_SteamUtils005_GetSecondsSinceComputerActive;
#define BD_SLOT_SteamUtils005_GetConnectedUniverse 2
typedef uint32_t (*BDFlatFn_SteamUtils005_GetConnectedUniverse_t)(void *);
static BDFlatFn_SteamUtils005_GetConnectedUniverse_t g_bd_flat_SteamUtils005_GetConnectedUniverse;
#define BD_SLOT_SteamUtils005_GetServerRealTime 3
typedef uint32_t (*BDFlatFn_SteamUtils005_GetServerRealTime_t)(void *);
static BDFlatFn_SteamUtils005_GetServerRealTime_t g_bd_flat_SteamUtils005_GetServerRealTime;
#define BD_SLOT_SteamUtils005_GetIPCountry 4
typedef const char * (*BDFlatFn_SteamUtils005_GetIPCountry_t)(void *);
static BDFlatFn_SteamUtils005_GetIPCountry_t g_bd_flat_SteamUtils005_GetIPCountry;
#define BD_SLOT_SteamUtils005_GetCurrentBatteryPower 8
typedef uint32_t (*BDFlatFn_SteamUtils005_GetCurrentBatteryPower_t)(void *);
static BDFlatFn_SteamUtils005_GetCurrentBatteryPower_t g_bd_flat_SteamUtils005_GetCurrentBatteryPower;
#define BD_SLOT_SteamUtils005_GetAppID 9
typedef uint32_t (*BDFlatFn_SteamUtils005_GetAppID_t)(void *);
static BDFlatFn_SteamUtils005_GetAppID_t g_bd_flat_SteamUtils005_GetAppID;
#define BD_SLOT_SteamUtils005_IsOverlayEnabled 17
typedef int (*BDFlatFn_SteamUtils005_IsOverlayEnabled_t)(void *);
static BDFlatFn_SteamUtils005_IsOverlayEnabled_t g_bd_flat_SteamUtils005_IsOverlayEnabled;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribed 0
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribed_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribed_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribed;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsLowViolence 1
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsLowViolence_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsLowViolence_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsLowViolence;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsCybercafe 2
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsCybercafe_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsCybercafe_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsCybercafe;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsVACBanned 3
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsVACBanned_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsVACBanned_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsVACBanned;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage 4
typedef const char * (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages 5
typedef const char * (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedApp 6
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedApp_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedApp_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedApp;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsDlcInstalled 7
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsDlcInstalled_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsDlcInstalled_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsDlcInstalled;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_GetEarliestPurchaseUnixTime 8
typedef uint32_t (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_GetEarliestPurchaseUnixTime_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_GetEarliestPurchaseUnixTime_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetEarliestPurchaseUnixTime;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedFromFreeWeekend 9
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedFromFreeWeekend_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedFromFreeWeekend_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedFromFreeWeekend;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_GetDLCCount 10
typedef int32_t (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_GetDLCCount_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_GetDLCCount_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetDLCCount;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2 1
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2_t)(void *, const char *, float *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat 2
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_t)(void *, const char *, int32_t *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2 3
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2_t)(void *, const char *, uint32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat 4
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_t)(void *, const char *, int32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat 5
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat_t)(void *, const char *, uint32_t, double);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement 6
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement_t)(void *, const char *, int *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement 7
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement_t)(void *, const char *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement 8
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement_t)(void *, const char *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime 9
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime_t)(void *, const char *, int *, uint32_t *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_StoreStats 10
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_StoreStats_t)(void *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_StoreStats_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_StoreStats;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute 12
typedef const char * (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_t)(void *, const char *, const char *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress 13
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress_t)(void *, const char *, uint32_t, uint32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_ResetAllStats 19
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_ResetAllStats_t)(void *, int);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_ResetAllStats_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_ResetAllStats;
#define BD_SLOT_SteamFriends013_GetPersonaName 0
typedef const char * (*BDFlatFn_SteamFriends013_GetPersonaName_t)(void *);
static BDFlatFn_SteamFriends013_GetPersonaName_t g_bd_flat_SteamFriends013_GetPersonaName;
#define BD_SLOT_SteamFriends013_GetPersonaState 2
typedef uint32_t (*BDFlatFn_SteamFriends013_GetPersonaState_t)(void *);
static BDFlatFn_SteamFriends013_GetPersonaState_t g_bd_flat_SteamFriends013_GetPersonaState;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribed 0
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribed_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribed_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribed;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsLowViolence 1
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsLowViolence_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsLowViolence_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsLowViolence;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsCybercafe 2
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsCybercafe_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsCybercafe_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsCybercafe;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsVACBanned 3
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsVACBanned_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsVACBanned_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsVACBanned;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage 4
typedef const char * (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages 5
typedef const char * (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedApp 6
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedApp_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedApp_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedApp;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsDlcInstalled 7
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsDlcInstalled_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsDlcInstalled_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsDlcInstalled;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_GetEarliestPurchaseUnixTime 8
typedef uint32_t (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_GetEarliestPurchaseUnixTime_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_GetEarliestPurchaseUnixTime_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetEarliestPurchaseUnixTime;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedFromFreeWeekend 9
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedFromFreeWeekend_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedFromFreeWeekend_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedFromFreeWeekend;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_GetDLCCount 10
typedef int32_t (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_GetDLCCount_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_GetDLCCount_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetDLCCount;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsAppInstalled 19
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsAppInstalled_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsAppInstalled_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsAppInstalled;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2 1
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2_t)(void *, const char *, float *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat 2
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_t)(void *, const char *, int32_t *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2 3
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2_t)(void *, const char *, uint32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat 4
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_t)(void *, const char *, int32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat 5
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat_t)(void *, const char *, uint32_t, double);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement 6
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement_t)(void *, const char *, int *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement 7
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement_t)(void *, const char *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement 8
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement_t)(void *, const char *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime 9
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime_t)(void *, const char *, int *, uint32_t *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_StoreStats 10
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_StoreStats_t)(void *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_StoreStats_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_StoreStats;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute 12
typedef const char * (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_t)(void *, const char *, const char *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress 13
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress_t)(void *, const char *, uint32_t, uint32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetNumAchievements 14
typedef uint32_t (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetNumAchievements_t)(void *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetNumAchievements_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetNumAchievements;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName 15
typedef const char * (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName_t)(void *, uint32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_ResetAllStats 21
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_ResetAllStats_t)(void *, int);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_ResetAllStats_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_ResetAllStats;
#define BD_SLOT_SteamClient017_CreateSteamPipe 0
typedef int32_t (*BDFlatFn_SteamClient017_CreateSteamPipe_t)(void *);
static BDFlatFn_SteamClient017_CreateSteamPipe_t g_bd_flat_SteamClient017_CreateSteamPipe;
#define BD_SLOT_SteamClient017_BReleaseSteamPipe 1
typedef int (*BDFlatFn_SteamClient017_BReleaseSteamPipe_t)(void *, int32_t);
static BDFlatFn_SteamClient017_BReleaseSteamPipe_t g_bd_flat_SteamClient017_BReleaseSteamPipe;
#define BD_SLOT_SteamClient017_ConnectToGlobalUser 2
typedef int32_t (*BDFlatFn_SteamClient017_ConnectToGlobalUser_t)(void *, int32_t);
static BDFlatFn_SteamClient017_ConnectToGlobalUser_t g_bd_flat_SteamClient017_ConnectToGlobalUser;
#define BD_SLOT_SteamClient017_CreateLocalUser 3
typedef int32_t (*BDFlatFn_SteamClient017_CreateLocalUser_t)(void *, int32_t *, uint32_t);
static BDFlatFn_SteamClient017_CreateLocalUser_t g_bd_flat_SteamClient017_CreateLocalUser;
#define BD_SLOT_SteamClient017_ReleaseUser 4
typedef void (*BDFlatFn_SteamClient017_ReleaseUser_t)(void *, int32_t, int32_t);
static BDFlatFn_SteamClient017_ReleaseUser_t g_bd_flat_SteamClient017_ReleaseUser;
#define BD_SLOT_SteamClient017_GetISteamUser 5
typedef void * (*BDFlatFn_SteamClient017_GetISteamUser_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamUser_t g_bd_flat_SteamClient017_GetISteamUser;
#define BD_SLOT_SteamClient017_GetISteamGameServer 6
typedef void * (*BDFlatFn_SteamClient017_GetISteamGameServer_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamGameServer_t g_bd_flat_SteamClient017_GetISteamGameServer;
#define BD_SLOT_SteamClient017_GetISteamFriends 8
typedef void * (*BDFlatFn_SteamClient017_GetISteamFriends_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamFriends_t g_bd_flat_SteamClient017_GetISteamFriends;
#define BD_SLOT_SteamClient017_GetISteamUtils 9
typedef void * (*BDFlatFn_SteamClient017_GetISteamUtils_t)(void *, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamUtils_t g_bd_flat_SteamClient017_GetISteamUtils;
#define BD_SLOT_SteamClient017_GetISteamMatchmaking 10
typedef void * (*BDFlatFn_SteamClient017_GetISteamMatchmaking_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamMatchmaking_t g_bd_flat_SteamClient017_GetISteamMatchmaking;
#define BD_SLOT_SteamClient017_GetISteamMatchmakingServers 11
typedef void * (*BDFlatFn_SteamClient017_GetISteamMatchmakingServers_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamMatchmakingServers_t g_bd_flat_SteamClient017_GetISteamMatchmakingServers;
#define BD_SLOT_SteamClient017_GetISteamGenericInterface 12
typedef void * (*BDFlatFn_SteamClient017_GetISteamGenericInterface_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamGenericInterface_t g_bd_flat_SteamClient017_GetISteamGenericInterface;
#define BD_SLOT_SteamClient017_GetISteamUserStats 13
typedef void * (*BDFlatFn_SteamClient017_GetISteamUserStats_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamUserStats_t g_bd_flat_SteamClient017_GetISteamUserStats;
#define BD_SLOT_SteamClient017_GetISteamGameServerStats 14
typedef void * (*BDFlatFn_SteamClient017_GetISteamGameServerStats_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamGameServerStats_t g_bd_flat_SteamClient017_GetISteamGameServerStats;
#define BD_SLOT_SteamClient017_GetISteamApps 15
typedef void * (*BDFlatFn_SteamClient017_GetISteamApps_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamApps_t g_bd_flat_SteamClient017_GetISteamApps;
#define BD_SLOT_SteamClient017_GetISteamNetworking 16
typedef void * (*BDFlatFn_SteamClient017_GetISteamNetworking_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamNetworking_t g_bd_flat_SteamClient017_GetISteamNetworking;
#define BD_SLOT_SteamClient017_GetISteamRemoteStorage 17
typedef void * (*BDFlatFn_SteamClient017_GetISteamRemoteStorage_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamRemoteStorage_t g_bd_flat_SteamClient017_GetISteamRemoteStorage;
#define BD_SLOT_SteamClient017_GetISteamScreenshots 18
typedef void * (*BDFlatFn_SteamClient017_GetISteamScreenshots_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamScreenshots_t g_bd_flat_SteamClient017_GetISteamScreenshots;
#define BD_SLOT_SteamClient017_RunFrame 19
typedef void (*BDFlatFn_SteamClient017_RunFrame_t)(void *);
static BDFlatFn_SteamClient017_RunFrame_t g_bd_flat_SteamClient017_RunFrame;
#define BD_SLOT_SteamClient017_GetIPCCallCount 20
typedef uint32_t (*BDFlatFn_SteamClient017_GetIPCCallCount_t)(void *);
static BDFlatFn_SteamClient017_GetIPCCallCount_t g_bd_flat_SteamClient017_GetIPCCallCount;
#define BD_SLOT_SteamClient017_BShutdownIfAllPipesClosed 22
typedef int (*BDFlatFn_SteamClient017_BShutdownIfAllPipesClosed_t)(void *);
static BDFlatFn_SteamClient017_BShutdownIfAllPipesClosed_t g_bd_flat_SteamClient017_BShutdownIfAllPipesClosed;
#define BD_SLOT_SteamClient017_GetISteamHTTP 23
typedef void * (*BDFlatFn_SteamClient017_GetISteamHTTP_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamHTTP_t g_bd_flat_SteamClient017_GetISteamHTTP;
#define BD_SLOT_SteamClient017_DEPRECATED_GetISteamUnifiedMessages 24
typedef void * (*BDFlatFn_SteamClient017_DEPRECATED_GetISteamUnifiedMessages_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_DEPRECATED_GetISteamUnifiedMessages_t g_bd_flat_SteamClient017_DEPRECATED_GetISteamUnifiedMessages;
#define BD_SLOT_SteamClient017_GetISteamController 25
typedef void * (*BDFlatFn_SteamClient017_GetISteamController_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamController_t g_bd_flat_SteamClient017_GetISteamController;
#define BD_SLOT_SteamClient017_GetISteamUGC 26
typedef void * (*BDFlatFn_SteamClient017_GetISteamUGC_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamUGC_t g_bd_flat_SteamClient017_GetISteamUGC;
#define BD_SLOT_SteamClient017_GetISteamAppList 27
typedef void * (*BDFlatFn_SteamClient017_GetISteamAppList_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamAppList_t g_bd_flat_SteamClient017_GetISteamAppList;
#define BD_SLOT_SteamClient017_GetISteamMusic 28
typedef void * (*BDFlatFn_SteamClient017_GetISteamMusic_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamMusic_t g_bd_flat_SteamClient017_GetISteamMusic;
#define BD_SLOT_SteamClient017_GetISteamMusicRemote 29
typedef void * (*BDFlatFn_SteamClient017_GetISteamMusicRemote_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamMusicRemote_t g_bd_flat_SteamClient017_GetISteamMusicRemote;
#define BD_SLOT_SteamClient017_GetISteamHTMLSurface 30
typedef void * (*BDFlatFn_SteamClient017_GetISteamHTMLSurface_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamHTMLSurface_t g_bd_flat_SteamClient017_GetISteamHTMLSurface;
#define BD_SLOT_SteamClient017_GetISteamInventory 34
typedef void * (*BDFlatFn_SteamClient017_GetISteamInventory_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamInventory_t g_bd_flat_SteamClient017_GetISteamInventory;
#define BD_SLOT_SteamClient017_GetISteamVideo 35
typedef void * (*BDFlatFn_SteamClient017_GetISteamVideo_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamVideo_t g_bd_flat_SteamClient017_GetISteamVideo;
#define BD_SLOT_SteamClient017_GetISteamParentalSettings 36
typedef void * (*BDFlatFn_SteamClient017_GetISteamParentalSettings_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient017_GetISteamParentalSettings_t g_bd_flat_SteamClient017_GetISteamParentalSettings;
#define BD_SLOT_SteamUser019_GetHSteamUser 0
typedef int32_t (*BDFlatFn_SteamUser019_GetHSteamUser_t)(void *);
static BDFlatFn_SteamUser019_GetHSteamUser_t g_bd_flat_SteamUser019_GetHSteamUser;
#define BD_SLOT_SteamUser019_BLoggedOn 1
typedef int (*BDFlatFn_SteamUser019_BLoggedOn_t)(void *);
static BDFlatFn_SteamUser019_BLoggedOn_t g_bd_flat_SteamUser019_BLoggedOn;
#define BD_SLOT_SteamUser019_GetSteamID 2
typedef uint64_t (*BDFlatFn_SteamUser019_GetSteamID_t)(void *);
static BDFlatFn_SteamUser019_GetSteamID_t g_bd_flat_SteamUser019_GetSteamID;
#define BD_SLOT_SteamFriends015_GetPersonaName 0
typedef const char * (*BDFlatFn_SteamFriends015_GetPersonaName_t)(void *);
static BDFlatFn_SteamFriends015_GetPersonaName_t g_bd_flat_SteamFriends015_GetPersonaName;
#define BD_SLOT_SteamFriends015_GetPersonaState 2
typedef uint32_t (*BDFlatFn_SteamFriends015_GetPersonaState_t)(void *);
static BDFlatFn_SteamFriends015_GetPersonaState_t g_bd_flat_SteamFriends015_GetPersonaState;
#define BD_SLOT_SteamUtils008_GetSecondsSinceAppActive 0
typedef uint32_t (*BDFlatFn_SteamUtils008_GetSecondsSinceAppActive_t)(void *);
static BDFlatFn_SteamUtils008_GetSecondsSinceAppActive_t g_bd_flat_SteamUtils008_GetSecondsSinceAppActive;
#define BD_SLOT_SteamUtils008_GetSecondsSinceComputerActive 1
typedef uint32_t (*BDFlatFn_SteamUtils008_GetSecondsSinceComputerActive_t)(void *);
static BDFlatFn_SteamUtils008_GetSecondsSinceComputerActive_t g_bd_flat_SteamUtils008_GetSecondsSinceComputerActive;
#define BD_SLOT_SteamUtils008_GetConnectedUniverse 2
typedef uint32_t (*BDFlatFn_SteamUtils008_GetConnectedUniverse_t)(void *);
static BDFlatFn_SteamUtils008_GetConnectedUniverse_t g_bd_flat_SteamUtils008_GetConnectedUniverse;
#define BD_SLOT_SteamUtils008_GetServerRealTime 3
typedef uint32_t (*BDFlatFn_SteamUtils008_GetServerRealTime_t)(void *);
static BDFlatFn_SteamUtils008_GetServerRealTime_t g_bd_flat_SteamUtils008_GetServerRealTime;
#define BD_SLOT_SteamUtils008_GetIPCountry 4
typedef const char * (*BDFlatFn_SteamUtils008_GetIPCountry_t)(void *);
static BDFlatFn_SteamUtils008_GetIPCountry_t g_bd_flat_SteamUtils008_GetIPCountry;
#define BD_SLOT_SteamUtils008_GetCurrentBatteryPower 8
typedef uint32_t (*BDFlatFn_SteamUtils008_GetCurrentBatteryPower_t)(void *);
static BDFlatFn_SteamUtils008_GetCurrentBatteryPower_t g_bd_flat_SteamUtils008_GetCurrentBatteryPower;
#define BD_SLOT_SteamUtils008_GetAppID 9
typedef uint32_t (*BDFlatFn_SteamUtils008_GetAppID_t)(void *);
static BDFlatFn_SteamUtils008_GetAppID_t g_bd_flat_SteamUtils008_GetAppID;
#define BD_SLOT_SteamUtils008_IsOverlayEnabled 17
typedef int (*BDFlatFn_SteamUtils008_IsOverlayEnabled_t)(void *);
static BDFlatFn_SteamUtils008_IsOverlayEnabled_t g_bd_flat_SteamUtils008_IsOverlayEnabled;
#define BD_SLOT_SteamUtils008_GetSteamUILanguage 23
typedef const char * (*BDFlatFn_SteamUtils008_GetSteamUILanguage_t)(void *);
static BDFlatFn_SteamUtils008_GetSteamUILanguage_t g_bd_flat_SteamUtils008_GetSteamUILanguage;
#define BD_SLOT_SteamUtils008_IsSteamRunningInVR 24
typedef int (*BDFlatFn_SteamUtils008_IsSteamRunningInVR_t)(void *);
static BDFlatFn_SteamUtils008_IsSteamRunningInVR_t g_bd_flat_SteamUtils008_IsSteamRunningInVR;
#define BD_SLOT_SteamUtils008_IsSteamInBigPictureMode 26
typedef int (*BDFlatFn_SteamUtils008_IsSteamInBigPictureMode_t)(void *);
static BDFlatFn_SteamUtils008_IsSteamInBigPictureMode_t g_bd_flat_SteamUtils008_IsSteamInBigPictureMode;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribed 0
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribed_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribed_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribed;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsLowViolence 1
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsLowViolence_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsLowViolence_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsLowViolence;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsCybercafe 2
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsCybercafe_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsCybercafe_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsCybercafe;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsVACBanned 3
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsVACBanned_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsVACBanned_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsVACBanned;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_GetCurrentGameLanguage 4
typedef const char * (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetCurrentGameLanguage_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetCurrentGameLanguage_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetCurrentGameLanguage;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_GetAvailableGameLanguages 5
typedef const char * (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetAvailableGameLanguages_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetAvailableGameLanguages_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetAvailableGameLanguages;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedApp 6
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedApp_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedApp_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedApp;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsDlcInstalled 7
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsDlcInstalled_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsDlcInstalled_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsDlcInstalled;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_GetEarliestPurchaseUnixTime 8
typedef uint32_t (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetEarliestPurchaseUnixTime_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetEarliestPurchaseUnixTime_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetEarliestPurchaseUnixTime;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedFromFreeWeekend 9
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedFromFreeWeekend_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedFromFreeWeekend_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedFromFreeWeekend;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_GetDLCCount 10
typedef int32_t (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetDLCCount_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetDLCCount_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetDLCCount;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsAppInstalled 19
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsAppInstalled_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsAppInstalled_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsAppInstalled;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_GetAppOwner 20
typedef uint64_t (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetAppOwner_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetAppOwner_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetAppOwner;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_GetAppBuildId 23
typedef int32_t (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetAppBuildId_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetAppBuildId_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetAppBuildId;
#define BD_SLOT_SteamClient014_CreateSteamPipe 0
typedef int32_t (*BDFlatFn_SteamClient014_CreateSteamPipe_t)(void *);
static BDFlatFn_SteamClient014_CreateSteamPipe_t g_bd_flat_SteamClient014_CreateSteamPipe;
#define BD_SLOT_SteamClient014_BReleaseSteamPipe 1
typedef int (*BDFlatFn_SteamClient014_BReleaseSteamPipe_t)(void *, int32_t);
static BDFlatFn_SteamClient014_BReleaseSteamPipe_t g_bd_flat_SteamClient014_BReleaseSteamPipe;
#define BD_SLOT_SteamClient014_ConnectToGlobalUser 2
typedef int32_t (*BDFlatFn_SteamClient014_ConnectToGlobalUser_t)(void *, int32_t);
static BDFlatFn_SteamClient014_ConnectToGlobalUser_t g_bd_flat_SteamClient014_ConnectToGlobalUser;
#define BD_SLOT_SteamClient014_CreateLocalUser 3
typedef int32_t (*BDFlatFn_SteamClient014_CreateLocalUser_t)(void *, int32_t *, uint32_t);
static BDFlatFn_SteamClient014_CreateLocalUser_t g_bd_flat_SteamClient014_CreateLocalUser;
#define BD_SLOT_SteamClient014_ReleaseUser 4
typedef void (*BDFlatFn_SteamClient014_ReleaseUser_t)(void *, int32_t, int32_t);
static BDFlatFn_SteamClient014_ReleaseUser_t g_bd_flat_SteamClient014_ReleaseUser;
#define BD_SLOT_SteamClient014_GetISteamUser 5
typedef void * (*BDFlatFn_SteamClient014_GetISteamUser_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamUser_t g_bd_flat_SteamClient014_GetISteamUser;
#define BD_SLOT_SteamClient014_GetISteamGameServer 6
typedef void * (*BDFlatFn_SteamClient014_GetISteamGameServer_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamGameServer_t g_bd_flat_SteamClient014_GetISteamGameServer;
#define BD_SLOT_SteamClient014_GetISteamFriends 8
typedef void * (*BDFlatFn_SteamClient014_GetISteamFriends_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamFriends_t g_bd_flat_SteamClient014_GetISteamFriends;
#define BD_SLOT_SteamClient014_GetISteamUtils 9
typedef void * (*BDFlatFn_SteamClient014_GetISteamUtils_t)(void *, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamUtils_t g_bd_flat_SteamClient014_GetISteamUtils;
#define BD_SLOT_SteamClient014_GetISteamMatchmaking 10
typedef void * (*BDFlatFn_SteamClient014_GetISteamMatchmaking_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamMatchmaking_t g_bd_flat_SteamClient014_GetISteamMatchmaking;
#define BD_SLOT_SteamClient014_GetISteamMatchmakingServers 11
typedef void * (*BDFlatFn_SteamClient014_GetISteamMatchmakingServers_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamMatchmakingServers_t g_bd_flat_SteamClient014_GetISteamMatchmakingServers;
#define BD_SLOT_SteamClient014_GetISteamGenericInterface 12
typedef void * (*BDFlatFn_SteamClient014_GetISteamGenericInterface_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamGenericInterface_t g_bd_flat_SteamClient014_GetISteamGenericInterface;
#define BD_SLOT_SteamClient014_GetISteamUserStats 13
typedef void * (*BDFlatFn_SteamClient014_GetISteamUserStats_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamUserStats_t g_bd_flat_SteamClient014_GetISteamUserStats;
#define BD_SLOT_SteamClient014_GetISteamGameServerStats 14
typedef void * (*BDFlatFn_SteamClient014_GetISteamGameServerStats_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamGameServerStats_t g_bd_flat_SteamClient014_GetISteamGameServerStats;
#define BD_SLOT_SteamClient014_GetISteamApps 15
typedef void * (*BDFlatFn_SteamClient014_GetISteamApps_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamApps_t g_bd_flat_SteamClient014_GetISteamApps;
#define BD_SLOT_SteamClient014_GetISteamNetworking 16
typedef void * (*BDFlatFn_SteamClient014_GetISteamNetworking_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamNetworking_t g_bd_flat_SteamClient014_GetISteamNetworking;
#define BD_SLOT_SteamClient014_GetISteamRemoteStorage 17
typedef void * (*BDFlatFn_SteamClient014_GetISteamRemoteStorage_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamRemoteStorage_t g_bd_flat_SteamClient014_GetISteamRemoteStorage;
#define BD_SLOT_SteamClient014_GetISteamScreenshots 18
typedef void * (*BDFlatFn_SteamClient014_GetISteamScreenshots_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamScreenshots_t g_bd_flat_SteamClient014_GetISteamScreenshots;
#define BD_SLOT_SteamClient014_RunFrame 19
typedef void (*BDFlatFn_SteamClient014_RunFrame_t)(void *);
static BDFlatFn_SteamClient014_RunFrame_t g_bd_flat_SteamClient014_RunFrame;
#define BD_SLOT_SteamClient014_GetIPCCallCount 20
typedef uint32_t (*BDFlatFn_SteamClient014_GetIPCCallCount_t)(void *);
static BDFlatFn_SteamClient014_GetIPCCallCount_t g_bd_flat_SteamClient014_GetIPCCallCount;
#define BD_SLOT_SteamClient014_BShutdownIfAllPipesClosed 22
typedef int (*BDFlatFn_SteamClient014_BShutdownIfAllPipesClosed_t)(void *);
static BDFlatFn_SteamClient014_BShutdownIfAllPipesClosed_t g_bd_flat_SteamClient014_BShutdownIfAllPipesClosed;
#define BD_SLOT_SteamClient014_GetISteamHTTP 23
typedef void * (*BDFlatFn_SteamClient014_GetISteamHTTP_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamHTTP_t g_bd_flat_SteamClient014_GetISteamHTTP;
#define BD_SLOT_SteamClient014_GetISteamUnifiedMessages 24
typedef void * (*BDFlatFn_SteamClient014_GetISteamUnifiedMessages_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamUnifiedMessages_t g_bd_flat_SteamClient014_GetISteamUnifiedMessages;
#define BD_SLOT_SteamClient014_GetISteamController 25
typedef void * (*BDFlatFn_SteamClient014_GetISteamController_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamController_t g_bd_flat_SteamClient014_GetISteamController;
#define BD_SLOT_SteamClient014_GetISteamUGC 26
typedef void * (*BDFlatFn_SteamClient014_GetISteamUGC_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamUGC_t g_bd_flat_SteamClient014_GetISteamUGC;
#define BD_SLOT_SteamClient014_GetISteamAppList 27
typedef void * (*BDFlatFn_SteamClient014_GetISteamAppList_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamAppList_t g_bd_flat_SteamClient014_GetISteamAppList;
#define BD_SLOT_SteamClient014_GetISteamMusic 28
typedef void * (*BDFlatFn_SteamClient014_GetISteamMusic_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient014_GetISteamMusic_t g_bd_flat_SteamClient014_GetISteamMusic;
#define BD_SLOT_SteamClient020_CreateSteamPipe 0
typedef int32_t (*BDFlatFn_SteamClient020_CreateSteamPipe_t)(void *);
static BDFlatFn_SteamClient020_CreateSteamPipe_t g_bd_flat_SteamClient020_CreateSteamPipe;
#define BD_SLOT_SteamClient020_BReleaseSteamPipe 1
typedef int (*BDFlatFn_SteamClient020_BReleaseSteamPipe_t)(void *, int32_t);
static BDFlatFn_SteamClient020_BReleaseSteamPipe_t g_bd_flat_SteamClient020_BReleaseSteamPipe;
#define BD_SLOT_SteamClient020_ConnectToGlobalUser 2
typedef int32_t (*BDFlatFn_SteamClient020_ConnectToGlobalUser_t)(void *, int32_t);
static BDFlatFn_SteamClient020_ConnectToGlobalUser_t g_bd_flat_SteamClient020_ConnectToGlobalUser;
#define BD_SLOT_SteamClient020_CreateLocalUser 3
typedef int32_t (*BDFlatFn_SteamClient020_CreateLocalUser_t)(void *, int32_t *, uint32_t);
static BDFlatFn_SteamClient020_CreateLocalUser_t g_bd_flat_SteamClient020_CreateLocalUser;
#define BD_SLOT_SteamClient020_ReleaseUser 4
typedef void (*BDFlatFn_SteamClient020_ReleaseUser_t)(void *, int32_t, int32_t);
static BDFlatFn_SteamClient020_ReleaseUser_t g_bd_flat_SteamClient020_ReleaseUser;
#define BD_SLOT_SteamClient020_GetISteamUser 5
typedef void * (*BDFlatFn_SteamClient020_GetISteamUser_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamUser_t g_bd_flat_SteamClient020_GetISteamUser;
#define BD_SLOT_SteamClient020_GetISteamGameServer 6
typedef void * (*BDFlatFn_SteamClient020_GetISteamGameServer_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamGameServer_t g_bd_flat_SteamClient020_GetISteamGameServer;
#define BD_SLOT_SteamClient020_GetISteamFriends 8
typedef void * (*BDFlatFn_SteamClient020_GetISteamFriends_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamFriends_t g_bd_flat_SteamClient020_GetISteamFriends;
#define BD_SLOT_SteamClient020_GetISteamUtils 9
typedef void * (*BDFlatFn_SteamClient020_GetISteamUtils_t)(void *, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamUtils_t g_bd_flat_SteamClient020_GetISteamUtils;
#define BD_SLOT_SteamClient020_GetISteamMatchmaking 10
typedef void * (*BDFlatFn_SteamClient020_GetISteamMatchmaking_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamMatchmaking_t g_bd_flat_SteamClient020_GetISteamMatchmaking;
#define BD_SLOT_SteamClient020_GetISteamMatchmakingServers 11
typedef void * (*BDFlatFn_SteamClient020_GetISteamMatchmakingServers_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamMatchmakingServers_t g_bd_flat_SteamClient020_GetISteamMatchmakingServers;
#define BD_SLOT_SteamClient020_GetISteamGenericInterface 12
typedef void * (*BDFlatFn_SteamClient020_GetISteamGenericInterface_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamGenericInterface_t g_bd_flat_SteamClient020_GetISteamGenericInterface;
#define BD_SLOT_SteamClient020_GetISteamUserStats 13
typedef void * (*BDFlatFn_SteamClient020_GetISteamUserStats_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamUserStats_t g_bd_flat_SteamClient020_GetISteamUserStats;
#define BD_SLOT_SteamClient020_GetISteamGameServerStats 14
typedef void * (*BDFlatFn_SteamClient020_GetISteamGameServerStats_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamGameServerStats_t g_bd_flat_SteamClient020_GetISteamGameServerStats;
#define BD_SLOT_SteamClient020_GetISteamApps 15
typedef void * (*BDFlatFn_SteamClient020_GetISteamApps_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamApps_t g_bd_flat_SteamClient020_GetISteamApps;
#define BD_SLOT_SteamClient020_GetISteamNetworking 16
typedef void * (*BDFlatFn_SteamClient020_GetISteamNetworking_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamNetworking_t g_bd_flat_SteamClient020_GetISteamNetworking;
#define BD_SLOT_SteamClient020_GetISteamRemoteStorage 17
typedef void * (*BDFlatFn_SteamClient020_GetISteamRemoteStorage_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamRemoteStorage_t g_bd_flat_SteamClient020_GetISteamRemoteStorage;
#define BD_SLOT_SteamClient020_GetISteamScreenshots 18
typedef void * (*BDFlatFn_SteamClient020_GetISteamScreenshots_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamScreenshots_t g_bd_flat_SteamClient020_GetISteamScreenshots;
#define BD_SLOT_SteamClient020_RunFrame 20
typedef void (*BDFlatFn_SteamClient020_RunFrame_t)(void *);
static BDFlatFn_SteamClient020_RunFrame_t g_bd_flat_SteamClient020_RunFrame;
#define BD_SLOT_SteamClient020_GetIPCCallCount 21
typedef uint32_t (*BDFlatFn_SteamClient020_GetIPCCallCount_t)(void *);
static BDFlatFn_SteamClient020_GetIPCCallCount_t g_bd_flat_SteamClient020_GetIPCCallCount;
#define BD_SLOT_SteamClient020_BShutdownIfAllPipesClosed 23
typedef int (*BDFlatFn_SteamClient020_BShutdownIfAllPipesClosed_t)(void *);
static BDFlatFn_SteamClient020_BShutdownIfAllPipesClosed_t g_bd_flat_SteamClient020_BShutdownIfAllPipesClosed;
#define BD_SLOT_SteamClient020_GetISteamHTTP 24
typedef void * (*BDFlatFn_SteamClient020_GetISteamHTTP_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamHTTP_t g_bd_flat_SteamClient020_GetISteamHTTP;
#define BD_SLOT_SteamClient020_DEPRECATED_GetISteamUnifiedMessages 25
typedef void * (*BDFlatFn_SteamClient020_DEPRECATED_GetISteamUnifiedMessages_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_DEPRECATED_GetISteamUnifiedMessages_t g_bd_flat_SteamClient020_DEPRECATED_GetISteamUnifiedMessages;
#define BD_SLOT_SteamClient020_GetISteamController 26
typedef void * (*BDFlatFn_SteamClient020_GetISteamController_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamController_t g_bd_flat_SteamClient020_GetISteamController;
#define BD_SLOT_SteamClient020_GetISteamUGC 27
typedef void * (*BDFlatFn_SteamClient020_GetISteamUGC_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamUGC_t g_bd_flat_SteamClient020_GetISteamUGC;
#define BD_SLOT_SteamClient020_GetISteamAppList 28
typedef void * (*BDFlatFn_SteamClient020_GetISteamAppList_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamAppList_t g_bd_flat_SteamClient020_GetISteamAppList;
#define BD_SLOT_SteamClient020_GetISteamMusic 29
typedef void * (*BDFlatFn_SteamClient020_GetISteamMusic_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamMusic_t g_bd_flat_SteamClient020_GetISteamMusic;
#define BD_SLOT_SteamClient020_GetISteamMusicRemote 30
typedef void * (*BDFlatFn_SteamClient020_GetISteamMusicRemote_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamMusicRemote_t g_bd_flat_SteamClient020_GetISteamMusicRemote;
#define BD_SLOT_SteamClient020_GetISteamHTMLSurface 31
typedef void * (*BDFlatFn_SteamClient020_GetISteamHTMLSurface_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamHTMLSurface_t g_bd_flat_SteamClient020_GetISteamHTMLSurface;
#define BD_SLOT_SteamClient020_GetISteamInventory 35
typedef void * (*BDFlatFn_SteamClient020_GetISteamInventory_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamInventory_t g_bd_flat_SteamClient020_GetISteamInventory;
#define BD_SLOT_SteamClient020_GetISteamVideo 36
typedef void * (*BDFlatFn_SteamClient020_GetISteamVideo_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamVideo_t g_bd_flat_SteamClient020_GetISteamVideo;
#define BD_SLOT_SteamClient020_GetISteamParentalSettings 37
typedef void * (*BDFlatFn_SteamClient020_GetISteamParentalSettings_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient020_GetISteamParentalSettings_t g_bd_flat_SteamClient020_GetISteamParentalSettings;
#define BD_SLOT_SteamClient021_CreateSteamPipe 0
typedef int32_t (*BDFlatFn_SteamClient021_CreateSteamPipe_t)(void *);
static BDFlatFn_SteamClient021_CreateSteamPipe_t g_bd_flat_SteamClient021_CreateSteamPipe;
#define BD_SLOT_SteamClient021_BReleaseSteamPipe 1
typedef int (*BDFlatFn_SteamClient021_BReleaseSteamPipe_t)(void *, int32_t);
static BDFlatFn_SteamClient021_BReleaseSteamPipe_t g_bd_flat_SteamClient021_BReleaseSteamPipe;
#define BD_SLOT_SteamClient021_ConnectToGlobalUser 2
typedef int32_t (*BDFlatFn_SteamClient021_ConnectToGlobalUser_t)(void *, int32_t);
static BDFlatFn_SteamClient021_ConnectToGlobalUser_t g_bd_flat_SteamClient021_ConnectToGlobalUser;
#define BD_SLOT_SteamClient021_CreateLocalUser 3
typedef int32_t (*BDFlatFn_SteamClient021_CreateLocalUser_t)(void *, int32_t *, uint32_t);
static BDFlatFn_SteamClient021_CreateLocalUser_t g_bd_flat_SteamClient021_CreateLocalUser;
#define BD_SLOT_SteamClient021_ReleaseUser 4
typedef void (*BDFlatFn_SteamClient021_ReleaseUser_t)(void *, int32_t, int32_t);
static BDFlatFn_SteamClient021_ReleaseUser_t g_bd_flat_SteamClient021_ReleaseUser;
#define BD_SLOT_SteamClient021_GetISteamUser 5
typedef void * (*BDFlatFn_SteamClient021_GetISteamUser_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamUser_t g_bd_flat_SteamClient021_GetISteamUser;
#define BD_SLOT_SteamClient021_GetISteamGameServer 6
typedef void * (*BDFlatFn_SteamClient021_GetISteamGameServer_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamGameServer_t g_bd_flat_SteamClient021_GetISteamGameServer;
#define BD_SLOT_SteamClient021_GetISteamFriends 8
typedef void * (*BDFlatFn_SteamClient021_GetISteamFriends_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamFriends_t g_bd_flat_SteamClient021_GetISteamFriends;
#define BD_SLOT_SteamClient021_GetISteamUtils 9
typedef void * (*BDFlatFn_SteamClient021_GetISteamUtils_t)(void *, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamUtils_t g_bd_flat_SteamClient021_GetISteamUtils;
#define BD_SLOT_SteamClient021_GetISteamMatchmaking 10
typedef void * (*BDFlatFn_SteamClient021_GetISteamMatchmaking_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamMatchmaking_t g_bd_flat_SteamClient021_GetISteamMatchmaking;
#define BD_SLOT_SteamClient021_GetISteamMatchmakingServers 11
typedef void * (*BDFlatFn_SteamClient021_GetISteamMatchmakingServers_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamMatchmakingServers_t g_bd_flat_SteamClient021_GetISteamMatchmakingServers;
#define BD_SLOT_SteamClient021_GetISteamGenericInterface 12
typedef void * (*BDFlatFn_SteamClient021_GetISteamGenericInterface_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamGenericInterface_t g_bd_flat_SteamClient021_GetISteamGenericInterface;
#define BD_SLOT_SteamClient021_GetISteamUserStats 13
typedef void * (*BDFlatFn_SteamClient021_GetISteamUserStats_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamUserStats_t g_bd_flat_SteamClient021_GetISteamUserStats;
#define BD_SLOT_SteamClient021_GetISteamGameServerStats 14
typedef void * (*BDFlatFn_SteamClient021_GetISteamGameServerStats_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamGameServerStats_t g_bd_flat_SteamClient021_GetISteamGameServerStats;
#define BD_SLOT_SteamClient021_GetISteamApps 15
typedef void * (*BDFlatFn_SteamClient021_GetISteamApps_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamApps_t g_bd_flat_SteamClient021_GetISteamApps;
#define BD_SLOT_SteamClient021_GetISteamNetworking 16
typedef void * (*BDFlatFn_SteamClient021_GetISteamNetworking_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamNetworking_t g_bd_flat_SteamClient021_GetISteamNetworking;
#define BD_SLOT_SteamClient021_GetISteamRemoteStorage 17
typedef void * (*BDFlatFn_SteamClient021_GetISteamRemoteStorage_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamRemoteStorage_t g_bd_flat_SteamClient021_GetISteamRemoteStorage;
#define BD_SLOT_SteamClient021_GetISteamScreenshots 18
typedef void * (*BDFlatFn_SteamClient021_GetISteamScreenshots_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamScreenshots_t g_bd_flat_SteamClient021_GetISteamScreenshots;
#define BD_SLOT_SteamClient021_RunFrame 20
typedef void (*BDFlatFn_SteamClient021_RunFrame_t)(void *);
static BDFlatFn_SteamClient021_RunFrame_t g_bd_flat_SteamClient021_RunFrame;
#define BD_SLOT_SteamClient021_GetIPCCallCount 21
typedef uint32_t (*BDFlatFn_SteamClient021_GetIPCCallCount_t)(void *);
static BDFlatFn_SteamClient021_GetIPCCallCount_t g_bd_flat_SteamClient021_GetIPCCallCount;
#define BD_SLOT_SteamClient021_BShutdownIfAllPipesClosed 23
typedef int (*BDFlatFn_SteamClient021_BShutdownIfAllPipesClosed_t)(void *);
static BDFlatFn_SteamClient021_BShutdownIfAllPipesClosed_t g_bd_flat_SteamClient021_BShutdownIfAllPipesClosed;
#define BD_SLOT_SteamClient021_GetISteamHTTP 24
typedef void * (*BDFlatFn_SteamClient021_GetISteamHTTP_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamHTTP_t g_bd_flat_SteamClient021_GetISteamHTTP;
#define BD_SLOT_SteamClient021_GetISteamController 25
typedef void * (*BDFlatFn_SteamClient021_GetISteamController_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamController_t g_bd_flat_SteamClient021_GetISteamController;
#define BD_SLOT_SteamClient021_GetISteamUGC 26
typedef void * (*BDFlatFn_SteamClient021_GetISteamUGC_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamUGC_t g_bd_flat_SteamClient021_GetISteamUGC;
#define BD_SLOT_SteamClient021_GetISteamMusic 27
typedef void * (*BDFlatFn_SteamClient021_GetISteamMusic_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamMusic_t g_bd_flat_SteamClient021_GetISteamMusic;
#define BD_SLOT_SteamClient021_GetISteamMusicRemote 28
typedef void * (*BDFlatFn_SteamClient021_GetISteamMusicRemote_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamMusicRemote_t g_bd_flat_SteamClient021_GetISteamMusicRemote;
#define BD_SLOT_SteamClient021_GetISteamHTMLSurface 29
typedef void * (*BDFlatFn_SteamClient021_GetISteamHTMLSurface_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamHTMLSurface_t g_bd_flat_SteamClient021_GetISteamHTMLSurface;
#define BD_SLOT_SteamClient021_GetISteamInventory 33
typedef void * (*BDFlatFn_SteamClient021_GetISteamInventory_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamInventory_t g_bd_flat_SteamClient021_GetISteamInventory;
#define BD_SLOT_SteamClient021_GetISteamVideo 34
typedef void * (*BDFlatFn_SteamClient021_GetISteamVideo_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamVideo_t g_bd_flat_SteamClient021_GetISteamVideo;
#define BD_SLOT_SteamClient021_GetISteamParentalSettings 35
typedef void * (*BDFlatFn_SteamClient021_GetISteamParentalSettings_t)(void *, int32_t, int32_t, const char *);
static BDFlatFn_SteamClient021_GetISteamParentalSettings_t g_bd_flat_SteamClient021_GetISteamParentalSettings;
#define BD_SLOT_SteamUser021_GetHSteamUser 0
typedef int32_t (*BDFlatFn_SteamUser021_GetHSteamUser_t)(void *);
static BDFlatFn_SteamUser021_GetHSteamUser_t g_bd_flat_SteamUser021_GetHSteamUser;
#define BD_SLOT_SteamUser021_BLoggedOn 1
typedef int (*BDFlatFn_SteamUser021_BLoggedOn_t)(void *);
static BDFlatFn_SteamUser021_BLoggedOn_t g_bd_flat_SteamUser021_BLoggedOn;
#define BD_SLOT_SteamUser021_GetSteamID 2
typedef uint64_t (*BDFlatFn_SteamUser021_GetSteamID_t)(void *);
static BDFlatFn_SteamUser021_GetSteamID_t g_bd_flat_SteamUser021_GetSteamID;
#define BD_SLOT_SteamUser021_GetAuthSessionTicket 13
typedef uint32_t (*BDFlatFn_SteamUser021_GetAuthSessionTicket_t)(void *, void *, int32_t, uint32_t *, const void *);
static BDFlatFn_SteamUser021_GetAuthSessionTicket_t g_bd_flat_SteamUser021_GetAuthSessionTicket;
#define BD_SLOT_SteamUser021_CancelAuthTicket 16
typedef void (*BDFlatFn_SteamUser021_CancelAuthTicket_t)(void *, uint32_t);
static BDFlatFn_SteamUser021_CancelAuthTicket_t g_bd_flat_SteamUser021_CancelAuthTicket;
#define BD_SLOT_SteamFriends017_GetPersonaName 0
typedef const char * (*BDFlatFn_SteamFriends017_GetPersonaName_t)(void *);
static BDFlatFn_SteamFriends017_GetPersonaName_t g_bd_flat_SteamFriends017_GetPersonaName;
#define BD_SLOT_SteamFriends017_GetPersonaState 2
typedef uint32_t (*BDFlatFn_SteamFriends017_GetPersonaState_t)(void *);
static BDFlatFn_SteamFriends017_GetPersonaState_t g_bd_flat_SteamFriends017_GetPersonaState;
#define BD_SLOT_SteamUtils010_GetSecondsSinceAppActive 0
typedef uint32_t (*BDFlatFn_SteamUtils010_GetSecondsSinceAppActive_t)(void *);
static BDFlatFn_SteamUtils010_GetSecondsSinceAppActive_t g_bd_flat_SteamUtils010_GetSecondsSinceAppActive;
#define BD_SLOT_SteamUtils010_GetSecondsSinceComputerActive 1
typedef uint32_t (*BDFlatFn_SteamUtils010_GetSecondsSinceComputerActive_t)(void *);
static BDFlatFn_SteamUtils010_GetSecondsSinceComputerActive_t g_bd_flat_SteamUtils010_GetSecondsSinceComputerActive;
#define BD_SLOT_SteamUtils010_GetConnectedUniverse 2
typedef uint32_t (*BDFlatFn_SteamUtils010_GetConnectedUniverse_t)(void *);
static BDFlatFn_SteamUtils010_GetConnectedUniverse_t g_bd_flat_SteamUtils010_GetConnectedUniverse;
#define BD_SLOT_SteamUtils010_GetServerRealTime 3
typedef uint32_t (*BDFlatFn_SteamUtils010_GetServerRealTime_t)(void *);
static BDFlatFn_SteamUtils010_GetServerRealTime_t g_bd_flat_SteamUtils010_GetServerRealTime;
#define BD_SLOT_SteamUtils010_GetIPCountry 4
typedef const char * (*BDFlatFn_SteamUtils010_GetIPCountry_t)(void *);
static BDFlatFn_SteamUtils010_GetIPCountry_t g_bd_flat_SteamUtils010_GetIPCountry;
#define BD_SLOT_SteamUtils010_GetCurrentBatteryPower 8
typedef uint32_t (*BDFlatFn_SteamUtils010_GetCurrentBatteryPower_t)(void *);
static BDFlatFn_SteamUtils010_GetCurrentBatteryPower_t g_bd_flat_SteamUtils010_GetCurrentBatteryPower;
#define BD_SLOT_SteamUtils010_GetAppID 9
typedef uint32_t (*BDFlatFn_SteamUtils010_GetAppID_t)(void *);
static BDFlatFn_SteamUtils010_GetAppID_t g_bd_flat_SteamUtils010_GetAppID;
#define BD_SLOT_SteamUtils010_IsOverlayEnabled 17
typedef int (*BDFlatFn_SteamUtils010_IsOverlayEnabled_t)(void *);
static BDFlatFn_SteamUtils010_IsOverlayEnabled_t g_bd_flat_SteamUtils010_IsOverlayEnabled;
#define BD_SLOT_SteamUtils010_GetSteamUILanguage 23
typedef const char * (*BDFlatFn_SteamUtils010_GetSteamUILanguage_t)(void *);
static BDFlatFn_SteamUtils010_GetSteamUILanguage_t g_bd_flat_SteamUtils010_GetSteamUILanguage;
#define BD_SLOT_SteamUtils010_IsSteamRunningInVR 24
typedef int (*BDFlatFn_SteamUtils010_IsSteamRunningInVR_t)(void *);
static BDFlatFn_SteamUtils010_IsSteamRunningInVR_t g_bd_flat_SteamUtils010_IsSteamRunningInVR;
#define BD_SLOT_SteamUtils010_IsSteamInBigPictureMode 26
typedef int (*BDFlatFn_SteamUtils010_IsSteamInBigPictureMode_t)(void *);
static BDFlatFn_SteamUtils010_IsSteamInBigPictureMode_t g_bd_flat_SteamUtils010_IsSteamInBigPictureMode;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2 1
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2_t)(void *, const char *, float *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat 2
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_t)(void *, const char *, int32_t *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2 3
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2_t)(void *, const char *, uint32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat 4
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_t)(void *, const char *, int32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat 5
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat_t)(void *, const char *, uint32_t, double);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement 6
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement_t)(void *, const char *, int *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement 7
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement_t)(void *, const char *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement 8
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement_t)(void *, const char *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime 9
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime_t)(void *, const char *, int *, uint32_t *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_StoreStats 10
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_StoreStats_t)(void *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_StoreStats_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_StoreStats;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute 12
typedef const char * (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute_t)(void *, const char *, const char *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress 13
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress_t)(void *, const char *, uint32_t, uint32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetNumAchievements 14
typedef uint32_t (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetNumAchievements_t)(void *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetNumAchievements_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetNumAchievements;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementName 15
typedef const char * (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementName_t)(void *, uint32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementName_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementName;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_ResetAllStats 21
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_ResetAllStats_t)(void *, int);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_ResetAllStats_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_ResetAllStats;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2 0
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2_t)(void *, const char *, float *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat 1
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_t)(void *, const char *, int32_t *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2 2
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2_t)(void *, const char *, uint32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat 3
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_t)(void *, const char *, int32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat 4
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat_t)(void *, const char *, uint32_t, double);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement 5
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement_t)(void *, const char *, int *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement 6
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement_t)(void *, const char *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement 7
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement_t)(void *, const char *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime 8
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime_t)(void *, const char *, int *, uint32_t *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_StoreStats 9
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_StoreStats_t)(void *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_StoreStats_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_StoreStats;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute 11
typedef const char * (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute_t)(void *, const char *, const char *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress 12
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress_t)(void *, const char *, uint32_t, uint32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetNumAchievements 13
typedef uint32_t (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetNumAchievements_t)(void *);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetNumAchievements_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetNumAchievements;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementName 14
typedef const char * (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementName_t)(void *, uint32_t);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementName_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementName;
#define BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_ResetAllStats 20
typedef int (*BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_ResetAllStats_t)(void *, int);
static BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_ResetAllStats_t g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_ResetAllStats;
#define BD_SLOT_SteamUtils009_GetSecondsSinceAppActive 0
typedef uint32_t (*BDFlatFn_SteamUtils009_GetSecondsSinceAppActive_t)(void *);
static BDFlatFn_SteamUtils009_GetSecondsSinceAppActive_t g_bd_flat_SteamUtils009_GetSecondsSinceAppActive;
#define BD_SLOT_SteamUtils009_GetSecondsSinceComputerActive 1
typedef uint32_t (*BDFlatFn_SteamUtils009_GetSecondsSinceComputerActive_t)(void *);
static BDFlatFn_SteamUtils009_GetSecondsSinceComputerActive_t g_bd_flat_SteamUtils009_GetSecondsSinceComputerActive;
#define BD_SLOT_SteamUtils009_GetConnectedUniverse 2
typedef uint32_t (*BDFlatFn_SteamUtils009_GetConnectedUniverse_t)(void *);
static BDFlatFn_SteamUtils009_GetConnectedUniverse_t g_bd_flat_SteamUtils009_GetConnectedUniverse;
#define BD_SLOT_SteamUtils009_GetServerRealTime 3
typedef uint32_t (*BDFlatFn_SteamUtils009_GetServerRealTime_t)(void *);
static BDFlatFn_SteamUtils009_GetServerRealTime_t g_bd_flat_SteamUtils009_GetServerRealTime;
#define BD_SLOT_SteamUtils009_GetIPCountry 4
typedef const char * (*BDFlatFn_SteamUtils009_GetIPCountry_t)(void *);
static BDFlatFn_SteamUtils009_GetIPCountry_t g_bd_flat_SteamUtils009_GetIPCountry;
#define BD_SLOT_SteamUtils009_GetCurrentBatteryPower 8
typedef uint32_t (*BDFlatFn_SteamUtils009_GetCurrentBatteryPower_t)(void *);
static BDFlatFn_SteamUtils009_GetCurrentBatteryPower_t g_bd_flat_SteamUtils009_GetCurrentBatteryPower;
#define BD_SLOT_SteamUtils009_GetAppID 9
typedef uint32_t (*BDFlatFn_SteamUtils009_GetAppID_t)(void *);
static BDFlatFn_SteamUtils009_GetAppID_t g_bd_flat_SteamUtils009_GetAppID;
#define BD_SLOT_SteamUtils009_IsOverlayEnabled 17
typedef int (*BDFlatFn_SteamUtils009_IsOverlayEnabled_t)(void *);
static BDFlatFn_SteamUtils009_IsOverlayEnabled_t g_bd_flat_SteamUtils009_IsOverlayEnabled;
#define BD_SLOT_SteamUtils009_GetSteamUILanguage 23
typedef const char * (*BDFlatFn_SteamUtils009_GetSteamUILanguage_t)(void *);
static BDFlatFn_SteamUtils009_GetSteamUILanguage_t g_bd_flat_SteamUtils009_GetSteamUILanguage;
#define BD_SLOT_SteamUtils009_IsSteamRunningInVR 24
typedef int (*BDFlatFn_SteamUtils009_IsSteamRunningInVR_t)(void *);
static BDFlatFn_SteamUtils009_IsSteamRunningInVR_t g_bd_flat_SteamUtils009_IsSteamRunningInVR;
#define BD_SLOT_SteamUtils009_IsSteamInBigPictureMode 26
typedef int (*BDFlatFn_SteamUtils009_IsSteamInBigPictureMode_t)(void *);
static BDFlatFn_SteamUtils009_IsSteamInBigPictureMode_t g_bd_flat_SteamUtils009_IsSteamInBigPictureMode;
#define BD_SLOT_SteamUser018_GetHSteamUser 0
typedef int32_t (*BDFlatFn_SteamUser018_GetHSteamUser_t)(void *);
static BDFlatFn_SteamUser018_GetHSteamUser_t g_bd_flat_SteamUser018_GetHSteamUser;
#define BD_SLOT_SteamUser018_BLoggedOn 1
typedef int (*BDFlatFn_SteamUser018_BLoggedOn_t)(void *);
static BDFlatFn_SteamUser018_BLoggedOn_t g_bd_flat_SteamUser018_BLoggedOn;
#define BD_SLOT_SteamUser018_GetSteamID 2
typedef uint64_t (*BDFlatFn_SteamUser018_GetSteamID_t)(void *);
static BDFlatFn_SteamUser018_GetSteamID_t g_bd_flat_SteamUser018_GetSteamID;
#define BD_SLOT_SteamUser018_GetAuthSessionTicket 13
typedef uint32_t (*BDFlatFn_SteamUser018_GetAuthSessionTicket_t)(void *, void *, int32_t, uint32_t *, const void *);
static BDFlatFn_SteamUser018_GetAuthSessionTicket_t g_bd_flat_SteamUser018_GetAuthSessionTicket;
#define BD_SLOT_SteamUser018_CancelAuthTicket 16
typedef void (*BDFlatFn_SteamUser018_CancelAuthTicket_t)(void *, uint32_t);
static BDFlatFn_SteamUser018_CancelAuthTicket_t g_bd_flat_SteamUser018_CancelAuthTicket;
#define BD_SLOT_SteamUtils007_GetSecondsSinceAppActive 0
typedef uint32_t (*BDFlatFn_SteamUtils007_GetSecondsSinceAppActive_t)(void *);
static BDFlatFn_SteamUtils007_GetSecondsSinceAppActive_t g_bd_flat_SteamUtils007_GetSecondsSinceAppActive;
#define BD_SLOT_SteamUtils007_GetSecondsSinceComputerActive 1
typedef uint32_t (*BDFlatFn_SteamUtils007_GetSecondsSinceComputerActive_t)(void *);
static BDFlatFn_SteamUtils007_GetSecondsSinceComputerActive_t g_bd_flat_SteamUtils007_GetSecondsSinceComputerActive;
#define BD_SLOT_SteamUtils007_GetConnectedUniverse 2
typedef uint32_t (*BDFlatFn_SteamUtils007_GetConnectedUniverse_t)(void *);
static BDFlatFn_SteamUtils007_GetConnectedUniverse_t g_bd_flat_SteamUtils007_GetConnectedUniverse;
#define BD_SLOT_SteamUtils007_GetServerRealTime 3
typedef uint32_t (*BDFlatFn_SteamUtils007_GetServerRealTime_t)(void *);
static BDFlatFn_SteamUtils007_GetServerRealTime_t g_bd_flat_SteamUtils007_GetServerRealTime;
#define BD_SLOT_SteamUtils007_GetIPCountry 4
typedef const char * (*BDFlatFn_SteamUtils007_GetIPCountry_t)(void *);
static BDFlatFn_SteamUtils007_GetIPCountry_t g_bd_flat_SteamUtils007_GetIPCountry;
#define BD_SLOT_SteamUtils007_GetCurrentBatteryPower 8
typedef uint32_t (*BDFlatFn_SteamUtils007_GetCurrentBatteryPower_t)(void *);
static BDFlatFn_SteamUtils007_GetCurrentBatteryPower_t g_bd_flat_SteamUtils007_GetCurrentBatteryPower;
#define BD_SLOT_SteamUtils007_GetAppID 9
typedef uint32_t (*BDFlatFn_SteamUtils007_GetAppID_t)(void *);
static BDFlatFn_SteamUtils007_GetAppID_t g_bd_flat_SteamUtils007_GetAppID;
#define BD_SLOT_SteamUtils007_IsOverlayEnabled 17
typedef int (*BDFlatFn_SteamUtils007_IsOverlayEnabled_t)(void *);
static BDFlatFn_SteamUtils007_IsOverlayEnabled_t g_bd_flat_SteamUtils007_IsOverlayEnabled;
#define BD_SLOT_SteamUtils007_GetSteamUILanguage 23
typedef const char * (*BDFlatFn_SteamUtils007_GetSteamUILanguage_t)(void *);
static BDFlatFn_SteamUtils007_GetSteamUILanguage_t g_bd_flat_SteamUtils007_GetSteamUILanguage;
#define BD_SLOT_SteamUtils007_IsSteamRunningInVR 24
typedef int (*BDFlatFn_SteamUtils007_IsSteamRunningInVR_t)(void *);
static BDFlatFn_SteamUtils007_IsSteamRunningInVR_t g_bd_flat_SteamUtils007_IsSteamRunningInVR;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribed 0
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribed_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribed_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribed;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsLowViolence 1
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsLowViolence_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsLowViolence_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsLowViolence;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsCybercafe 2
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsCybercafe_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsCybercafe_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsCybercafe;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsVACBanned 3
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsVACBanned_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsVACBanned_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsVACBanned;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_GetCurrentGameLanguage 4
typedef const char * (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetCurrentGameLanguage_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetCurrentGameLanguage_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetCurrentGameLanguage;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_GetAvailableGameLanguages 5
typedef const char * (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetAvailableGameLanguages_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetAvailableGameLanguages_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetAvailableGameLanguages;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedApp 6
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedApp_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedApp_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedApp;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsDlcInstalled 7
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsDlcInstalled_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsDlcInstalled_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsDlcInstalled;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_GetEarliestPurchaseUnixTime 8
typedef uint32_t (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetEarliestPurchaseUnixTime_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetEarliestPurchaseUnixTime_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetEarliestPurchaseUnixTime;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedFromFreeWeekend 9
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedFromFreeWeekend_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedFromFreeWeekend_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedFromFreeWeekend;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_GetDLCCount 10
typedef int32_t (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetDLCCount_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetDLCCount_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetDLCCount;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsAppInstalled 19
typedef int (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsAppInstalled_t)(void *, uint32_t);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsAppInstalled_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsAppInstalled;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_GetAppOwner 20
typedef uint64_t (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetAppOwner_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetAppOwner_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetAppOwner;
#define BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_GetAppBuildId 23
typedef int32_t (*BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetAppBuildId_t)(void *);
static BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetAppBuildId_t g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetAppBuildId;

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
  g_bd_flat_SteamUser023_GetAuthSessionTicket = (BDFlatFn_SteamUser023_GetAuthSessionTicket_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetAuthSessionTicket");
  g_bd_flat_SteamUser023_GetAuthTicketForWebApi = (BDFlatFn_SteamUser023_GetAuthTicketForWebApi_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetAuthTicketForWebApi");
  g_bd_flat_SteamUser023_CancelAuthTicket = (BDFlatFn_SteamUser023_CancelAuthTicket_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_CancelAuthTicket");
  g_bd_accessor_steamfriends018 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamFriends_v018");
  g_bd_self_steamfriends018 = g_bd_accessor_steamfriends018 ? g_bd_accessor_steamfriends018() : NULL;
  g_bd_flat_SteamFriends018_GetPersonaName = (BDFlatFn_SteamFriends018_GetPersonaName_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetPersonaName");
  g_bd_flat_SteamFriends018_GetPersonaState = (BDFlatFn_SteamFriends018_GetPersonaState_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetPersonaState");
  g_bd_accessor_steamuser016 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUser_v023");
  g_bd_self_steamuser016 = g_bd_accessor_steamuser016 ? g_bd_accessor_steamuser016() : NULL;
  g_bd_flat_SteamUser016_GetHSteamUser = (BDFlatFn_SteamUser016_GetHSteamUser_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetHSteamUser");
  g_bd_flat_SteamUser016_BLoggedOn = (BDFlatFn_SteamUser016_BLoggedOn_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_BLoggedOn");
  g_bd_flat_SteamUser016_GetSteamID = (BDFlatFn_SteamUser016_GetSteamID_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetSteamID");
  g_bd_accessor_steamfriends011 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamFriends_v018");
  g_bd_self_steamfriends011 = g_bd_accessor_steamfriends011 ? g_bd_accessor_steamfriends011() : NULL;
  g_bd_flat_SteamFriends011_GetPersonaName = (BDFlatFn_SteamFriends011_GetPersonaName_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetPersonaName");
  g_bd_flat_SteamFriends011_GetPersonaState = (BDFlatFn_SteamFriends011_GetPersonaState_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetPersonaState");
  g_bd_accessor_steamutils005 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUtils_v011");
  g_bd_self_steamutils005 = g_bd_accessor_steamutils005 ? g_bd_accessor_steamutils005() : NULL;
  g_bd_flat_SteamUtils005_GetSecondsSinceAppActive = (BDFlatFn_SteamUtils005_GetSecondsSinceAppActive_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSecondsSinceAppActive");
  g_bd_flat_SteamUtils005_GetSecondsSinceComputerActive = (BDFlatFn_SteamUtils005_GetSecondsSinceComputerActive_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSecondsSinceComputerActive");
  g_bd_flat_SteamUtils005_GetConnectedUniverse = (BDFlatFn_SteamUtils005_GetConnectedUniverse_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetConnectedUniverse");
  g_bd_flat_SteamUtils005_GetServerRealTime = (BDFlatFn_SteamUtils005_GetServerRealTime_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetServerRealTime");
  g_bd_flat_SteamUtils005_GetIPCountry = (BDFlatFn_SteamUtils005_GetIPCountry_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetIPCountry");
  g_bd_flat_SteamUtils005_GetCurrentBatteryPower = (BDFlatFn_SteamUtils005_GetCurrentBatteryPower_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetCurrentBatteryPower");
  g_bd_flat_SteamUtils005_GetAppID = (BDFlatFn_SteamUtils005_GetAppID_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetAppID");
  g_bd_flat_SteamUtils005_IsOverlayEnabled = (BDFlatFn_SteamUtils005_IsOverlayEnabled_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_IsOverlayEnabled");
  g_bd_accessor_steamapps_interface_version004 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamApps_v009");
  g_bd_self_steamapps_interface_version004 = g_bd_accessor_steamapps_interface_version004 ? g_bd_accessor_steamapps_interface_version004() : NULL;
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribed = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribed_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsSubscribed");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsLowViolence = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsLowViolence_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsLowViolence");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsCybercafe = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsCybercafe_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsCybercafe");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsVACBanned = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsVACBanned_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsVACBanned");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetCurrentGameLanguage");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetAvailableGameLanguages");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedApp = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedApp_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsSubscribedApp");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsDlcInstalled = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsDlcInstalled_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsDlcInstalled");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetEarliestPurchaseUnixTime = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_GetEarliestPurchaseUnixTime_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetEarliestPurchaseUnixTime");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedFromFreeWeekend = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedFromFreeWeekend_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsSubscribedFromFreeWeekend");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetDLCCount = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION004_GetDLCCount_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetDLCCount");
  g_bd_accessor_steamuserstats_interface_version010 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUserStats_v013");
  g_bd_self_steamuserstats_interface_version010 = g_bd_accessor_steamuserstats_interface_version010 ? g_bd_accessor_steamuserstats_interface_version010() : NULL;
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2 = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetStatFloat");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetStatInt32");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2 = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_SetStatFloat");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_SetStatInt32");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_UpdateAvgRateStat");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievement");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_SetAchievement");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_ClearAchievement");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievementAndUnlockTime");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_StoreStats = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_StoreStats_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_StoreStats");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievementDisplayAttribute");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_IndicateAchievementProgress");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_ResetAllStats = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION010_ResetAllStats_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_ResetAllStats");
  g_bd_accessor_steamfriends013 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamFriends_v018");
  g_bd_self_steamfriends013 = g_bd_accessor_steamfriends013 ? g_bd_accessor_steamfriends013() : NULL;
  g_bd_flat_SteamFriends013_GetPersonaName = (BDFlatFn_SteamFriends013_GetPersonaName_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetPersonaName");
  g_bd_flat_SteamFriends013_GetPersonaState = (BDFlatFn_SteamFriends013_GetPersonaState_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetPersonaState");
  g_bd_accessor_steamapps_interface_version005 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamApps_v009");
  g_bd_self_steamapps_interface_version005 = g_bd_accessor_steamapps_interface_version005 ? g_bd_accessor_steamapps_interface_version005() : NULL;
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribed = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribed_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsSubscribed");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsLowViolence = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsLowViolence_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsLowViolence");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsCybercafe = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsCybercafe_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsCybercafe");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsVACBanned = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsVACBanned_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsVACBanned");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetCurrentGameLanguage");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetAvailableGameLanguages");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedApp = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedApp_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsSubscribedApp");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsDlcInstalled = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsDlcInstalled_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsDlcInstalled");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetEarliestPurchaseUnixTime = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_GetEarliestPurchaseUnixTime_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetEarliestPurchaseUnixTime");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedFromFreeWeekend = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedFromFreeWeekend_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsSubscribedFromFreeWeekend");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetDLCCount = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_GetDLCCount_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetDLCCount");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsAppInstalled = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION005_BIsAppInstalled_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsAppInstalled");
  g_bd_accessor_steamuserstats_interface_version011 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUserStats_v013");
  g_bd_self_steamuserstats_interface_version011 = g_bd_accessor_steamuserstats_interface_version011 ? g_bd_accessor_steamuserstats_interface_version011() : NULL;
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2 = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetStatFloat");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetStatInt32");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2 = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_SetStatFloat");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_SetStatInt32");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_UpdateAvgRateStat");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievement");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_SetAchievement");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_ClearAchievement");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievementAndUnlockTime");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_StoreStats = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_StoreStats_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_StoreStats");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievementDisplayAttribute");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_IndicateAchievementProgress");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetNumAchievements = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetNumAchievements_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetNumAchievements");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievementName");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_ResetAllStats = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION011_ResetAllStats_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_ResetAllStats");
  g_bd_accessor_steamclient017 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamClient");
  g_bd_self_steamclient017 = g_bd_accessor_steamclient017 ? g_bd_accessor_steamclient017() : NULL;
  g_bd_flat_SteamClient017_CreateSteamPipe = (BDFlatFn_SteamClient017_CreateSteamPipe_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_CreateSteamPipe");
  g_bd_flat_SteamClient017_BReleaseSteamPipe = (BDFlatFn_SteamClient017_BReleaseSteamPipe_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_BReleaseSteamPipe");
  g_bd_flat_SteamClient017_ConnectToGlobalUser = (BDFlatFn_SteamClient017_ConnectToGlobalUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_ConnectToGlobalUser");
  g_bd_flat_SteamClient017_CreateLocalUser = (BDFlatFn_SteamClient017_CreateLocalUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_CreateLocalUser");
  g_bd_flat_SteamClient017_ReleaseUser = (BDFlatFn_SteamClient017_ReleaseUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_ReleaseUser");
  g_bd_flat_SteamClient017_GetISteamUser = (BDFlatFn_SteamClient017_GetISteamUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUser");
  g_bd_flat_SteamClient017_GetISteamGameServer = (BDFlatFn_SteamClient017_GetISteamGameServer_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamGameServer");
  g_bd_flat_SteamClient017_GetISteamFriends = (BDFlatFn_SteamClient017_GetISteamFriends_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamFriends");
  g_bd_flat_SteamClient017_GetISteamUtils = (BDFlatFn_SteamClient017_GetISteamUtils_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUtils");
  g_bd_flat_SteamClient017_GetISteamMatchmaking = (BDFlatFn_SteamClient017_GetISteamMatchmaking_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMatchmaking");
  g_bd_flat_SteamClient017_GetISteamMatchmakingServers = (BDFlatFn_SteamClient017_GetISteamMatchmakingServers_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMatchmakingServers");
  g_bd_flat_SteamClient017_GetISteamGenericInterface = (BDFlatFn_SteamClient017_GetISteamGenericInterface_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamGenericInterface");
  g_bd_flat_SteamClient017_GetISteamUserStats = (BDFlatFn_SteamClient017_GetISteamUserStats_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUserStats");
  g_bd_flat_SteamClient017_GetISteamGameServerStats = (BDFlatFn_SteamClient017_GetISteamGameServerStats_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamGameServerStats");
  g_bd_flat_SteamClient017_GetISteamApps = (BDFlatFn_SteamClient017_GetISteamApps_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamApps");
  g_bd_flat_SteamClient017_GetISteamNetworking = (BDFlatFn_SteamClient017_GetISteamNetworking_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamNetworking");
  g_bd_flat_SteamClient017_GetISteamRemoteStorage = (BDFlatFn_SteamClient017_GetISteamRemoteStorage_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamRemoteStorage");
  g_bd_flat_SteamClient017_GetISteamScreenshots = (BDFlatFn_SteamClient017_GetISteamScreenshots_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamScreenshots");
  g_bd_flat_SteamClient017_RunFrame = (BDFlatFn_SteamClient017_RunFrame_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_RunFrame");
  g_bd_flat_SteamClient017_GetIPCCallCount = (BDFlatFn_SteamClient017_GetIPCCallCount_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetIPCCallCount");
  g_bd_flat_SteamClient017_BShutdownIfAllPipesClosed = (BDFlatFn_SteamClient017_BShutdownIfAllPipesClosed_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_BShutdownIfAllPipesClosed");
  g_bd_flat_SteamClient017_GetISteamHTTP = (BDFlatFn_SteamClient017_GetISteamHTTP_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamHTTP");
  g_bd_flat_SteamClient017_DEPRECATED_GetISteamUnifiedMessages = (BDFlatFn_SteamClient017_DEPRECATED_GetISteamUnifiedMessages_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUnifiedMessages");
  g_bd_flat_SteamClient017_GetISteamController = (BDFlatFn_SteamClient017_GetISteamController_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamController");
  g_bd_flat_SteamClient017_GetISteamUGC = (BDFlatFn_SteamClient017_GetISteamUGC_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUGC");
  g_bd_flat_SteamClient017_GetISteamAppList = (BDFlatFn_SteamClient017_GetISteamAppList_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamAppList");
  g_bd_flat_SteamClient017_GetISteamMusic = (BDFlatFn_SteamClient017_GetISteamMusic_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMusic");
  g_bd_flat_SteamClient017_GetISteamMusicRemote = (BDFlatFn_SteamClient017_GetISteamMusicRemote_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMusicRemote");
  g_bd_flat_SteamClient017_GetISteamHTMLSurface = (BDFlatFn_SteamClient017_GetISteamHTMLSurface_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamHTMLSurface");
  g_bd_flat_SteamClient017_GetISteamInventory = (BDFlatFn_SteamClient017_GetISteamInventory_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamInventory");
  g_bd_flat_SteamClient017_GetISteamVideo = (BDFlatFn_SteamClient017_GetISteamVideo_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamVideo");
  g_bd_flat_SteamClient017_GetISteamParentalSettings = (BDFlatFn_SteamClient017_GetISteamParentalSettings_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamParentalSettings");
  g_bd_accessor_steamuser019 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUser_v023");
  g_bd_self_steamuser019 = g_bd_accessor_steamuser019 ? g_bd_accessor_steamuser019() : NULL;
  g_bd_flat_SteamUser019_GetHSteamUser = (BDFlatFn_SteamUser019_GetHSteamUser_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetHSteamUser");
  g_bd_flat_SteamUser019_BLoggedOn = (BDFlatFn_SteamUser019_BLoggedOn_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_BLoggedOn");
  g_bd_flat_SteamUser019_GetSteamID = (BDFlatFn_SteamUser019_GetSteamID_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetSteamID");
  g_bd_accessor_steamfriends015 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamFriends_v018");
  g_bd_self_steamfriends015 = g_bd_accessor_steamfriends015 ? g_bd_accessor_steamfriends015() : NULL;
  g_bd_flat_SteamFriends015_GetPersonaName = (BDFlatFn_SteamFriends015_GetPersonaName_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetPersonaName");
  g_bd_flat_SteamFriends015_GetPersonaState = (BDFlatFn_SteamFriends015_GetPersonaState_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetPersonaState");
  g_bd_accessor_steamutils008 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUtils_v011");
  g_bd_self_steamutils008 = g_bd_accessor_steamutils008 ? g_bd_accessor_steamutils008() : NULL;
  g_bd_flat_SteamUtils008_GetSecondsSinceAppActive = (BDFlatFn_SteamUtils008_GetSecondsSinceAppActive_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSecondsSinceAppActive");
  g_bd_flat_SteamUtils008_GetSecondsSinceComputerActive = (BDFlatFn_SteamUtils008_GetSecondsSinceComputerActive_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSecondsSinceComputerActive");
  g_bd_flat_SteamUtils008_GetConnectedUniverse = (BDFlatFn_SteamUtils008_GetConnectedUniverse_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetConnectedUniverse");
  g_bd_flat_SteamUtils008_GetServerRealTime = (BDFlatFn_SteamUtils008_GetServerRealTime_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetServerRealTime");
  g_bd_flat_SteamUtils008_GetIPCountry = (BDFlatFn_SteamUtils008_GetIPCountry_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetIPCountry");
  g_bd_flat_SteamUtils008_GetCurrentBatteryPower = (BDFlatFn_SteamUtils008_GetCurrentBatteryPower_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetCurrentBatteryPower");
  g_bd_flat_SteamUtils008_GetAppID = (BDFlatFn_SteamUtils008_GetAppID_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetAppID");
  g_bd_flat_SteamUtils008_IsOverlayEnabled = (BDFlatFn_SteamUtils008_IsOverlayEnabled_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_IsOverlayEnabled");
  g_bd_flat_SteamUtils008_GetSteamUILanguage = (BDFlatFn_SteamUtils008_GetSteamUILanguage_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSteamUILanguage");
  g_bd_flat_SteamUtils008_IsSteamRunningInVR = (BDFlatFn_SteamUtils008_IsSteamRunningInVR_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_IsSteamRunningInVR");
  g_bd_flat_SteamUtils008_IsSteamInBigPictureMode = (BDFlatFn_SteamUtils008_IsSteamInBigPictureMode_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_IsSteamInBigPictureMode");
  g_bd_accessor_steamapps_interface_version008 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamApps_v009");
  g_bd_self_steamapps_interface_version008 = g_bd_accessor_steamapps_interface_version008 ? g_bd_accessor_steamapps_interface_version008() : NULL;
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribed = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribed_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsSubscribed");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsLowViolence = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsLowViolence_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsLowViolence");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsCybercafe = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsCybercafe_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsCybercafe");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsVACBanned = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsVACBanned_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsVACBanned");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetCurrentGameLanguage = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetCurrentGameLanguage_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetCurrentGameLanguage");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetAvailableGameLanguages = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetAvailableGameLanguages_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetAvailableGameLanguages");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedApp = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedApp_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsSubscribedApp");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsDlcInstalled = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsDlcInstalled_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsDlcInstalled");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetEarliestPurchaseUnixTime = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetEarliestPurchaseUnixTime_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetEarliestPurchaseUnixTime");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedFromFreeWeekend = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedFromFreeWeekend_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsSubscribedFromFreeWeekend");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetDLCCount = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetDLCCount_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetDLCCount");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsAppInstalled = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_BIsAppInstalled_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsAppInstalled");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetAppOwner = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetAppOwner_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetAppOwner");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetAppBuildId = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION008_GetAppBuildId_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetAppBuildId");
  g_bd_accessor_steamclient014 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamClient");
  g_bd_self_steamclient014 = g_bd_accessor_steamclient014 ? g_bd_accessor_steamclient014() : NULL;
  g_bd_flat_SteamClient014_CreateSteamPipe = (BDFlatFn_SteamClient014_CreateSteamPipe_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_CreateSteamPipe");
  g_bd_flat_SteamClient014_BReleaseSteamPipe = (BDFlatFn_SteamClient014_BReleaseSteamPipe_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_BReleaseSteamPipe");
  g_bd_flat_SteamClient014_ConnectToGlobalUser = (BDFlatFn_SteamClient014_ConnectToGlobalUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_ConnectToGlobalUser");
  g_bd_flat_SteamClient014_CreateLocalUser = (BDFlatFn_SteamClient014_CreateLocalUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_CreateLocalUser");
  g_bd_flat_SteamClient014_ReleaseUser = (BDFlatFn_SteamClient014_ReleaseUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_ReleaseUser");
  g_bd_flat_SteamClient014_GetISteamUser = (BDFlatFn_SteamClient014_GetISteamUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUser");
  g_bd_flat_SteamClient014_GetISteamGameServer = (BDFlatFn_SteamClient014_GetISteamGameServer_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamGameServer");
  g_bd_flat_SteamClient014_GetISteamFriends = (BDFlatFn_SteamClient014_GetISteamFriends_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamFriends");
  g_bd_flat_SteamClient014_GetISteamUtils = (BDFlatFn_SteamClient014_GetISteamUtils_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUtils");
  g_bd_flat_SteamClient014_GetISteamMatchmaking = (BDFlatFn_SteamClient014_GetISteamMatchmaking_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMatchmaking");
  g_bd_flat_SteamClient014_GetISteamMatchmakingServers = (BDFlatFn_SteamClient014_GetISteamMatchmakingServers_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMatchmakingServers");
  g_bd_flat_SteamClient014_GetISteamGenericInterface = (BDFlatFn_SteamClient014_GetISteamGenericInterface_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamGenericInterface");
  g_bd_flat_SteamClient014_GetISteamUserStats = (BDFlatFn_SteamClient014_GetISteamUserStats_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUserStats");
  g_bd_flat_SteamClient014_GetISteamGameServerStats = (BDFlatFn_SteamClient014_GetISteamGameServerStats_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamGameServerStats");
  g_bd_flat_SteamClient014_GetISteamApps = (BDFlatFn_SteamClient014_GetISteamApps_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamApps");
  g_bd_flat_SteamClient014_GetISteamNetworking = (BDFlatFn_SteamClient014_GetISteamNetworking_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamNetworking");
  g_bd_flat_SteamClient014_GetISteamRemoteStorage = (BDFlatFn_SteamClient014_GetISteamRemoteStorage_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamRemoteStorage");
  g_bd_flat_SteamClient014_GetISteamScreenshots = (BDFlatFn_SteamClient014_GetISteamScreenshots_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamScreenshots");
  g_bd_flat_SteamClient014_RunFrame = (BDFlatFn_SteamClient014_RunFrame_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_RunFrame");
  g_bd_flat_SteamClient014_GetIPCCallCount = (BDFlatFn_SteamClient014_GetIPCCallCount_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetIPCCallCount");
  g_bd_flat_SteamClient014_BShutdownIfAllPipesClosed = (BDFlatFn_SteamClient014_BShutdownIfAllPipesClosed_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_BShutdownIfAllPipesClosed");
  g_bd_flat_SteamClient014_GetISteamHTTP = (BDFlatFn_SteamClient014_GetISteamHTTP_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamHTTP");
  g_bd_flat_SteamClient014_GetISteamUnifiedMessages = (BDFlatFn_SteamClient014_GetISteamUnifiedMessages_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUnifiedMessages");
  g_bd_flat_SteamClient014_GetISteamController = (BDFlatFn_SteamClient014_GetISteamController_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamController");
  g_bd_flat_SteamClient014_GetISteamUGC = (BDFlatFn_SteamClient014_GetISteamUGC_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUGC");
  g_bd_flat_SteamClient014_GetISteamAppList = (BDFlatFn_SteamClient014_GetISteamAppList_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamAppList");
  g_bd_flat_SteamClient014_GetISteamMusic = (BDFlatFn_SteamClient014_GetISteamMusic_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMusic");
  g_bd_accessor_steamclient020 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamClient");
  g_bd_self_steamclient020 = g_bd_accessor_steamclient020 ? g_bd_accessor_steamclient020() : NULL;
  g_bd_flat_SteamClient020_CreateSteamPipe = (BDFlatFn_SteamClient020_CreateSteamPipe_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_CreateSteamPipe");
  g_bd_flat_SteamClient020_BReleaseSteamPipe = (BDFlatFn_SteamClient020_BReleaseSteamPipe_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_BReleaseSteamPipe");
  g_bd_flat_SteamClient020_ConnectToGlobalUser = (BDFlatFn_SteamClient020_ConnectToGlobalUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_ConnectToGlobalUser");
  g_bd_flat_SteamClient020_CreateLocalUser = (BDFlatFn_SteamClient020_CreateLocalUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_CreateLocalUser");
  g_bd_flat_SteamClient020_ReleaseUser = (BDFlatFn_SteamClient020_ReleaseUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_ReleaseUser");
  g_bd_flat_SteamClient020_GetISteamUser = (BDFlatFn_SteamClient020_GetISteamUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUser");
  g_bd_flat_SteamClient020_GetISteamGameServer = (BDFlatFn_SteamClient020_GetISteamGameServer_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamGameServer");
  g_bd_flat_SteamClient020_GetISteamFriends = (BDFlatFn_SteamClient020_GetISteamFriends_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamFriends");
  g_bd_flat_SteamClient020_GetISteamUtils = (BDFlatFn_SteamClient020_GetISteamUtils_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUtils");
  g_bd_flat_SteamClient020_GetISteamMatchmaking = (BDFlatFn_SteamClient020_GetISteamMatchmaking_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMatchmaking");
  g_bd_flat_SteamClient020_GetISteamMatchmakingServers = (BDFlatFn_SteamClient020_GetISteamMatchmakingServers_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMatchmakingServers");
  g_bd_flat_SteamClient020_GetISteamGenericInterface = (BDFlatFn_SteamClient020_GetISteamGenericInterface_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamGenericInterface");
  g_bd_flat_SteamClient020_GetISteamUserStats = (BDFlatFn_SteamClient020_GetISteamUserStats_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUserStats");
  g_bd_flat_SteamClient020_GetISteamGameServerStats = (BDFlatFn_SteamClient020_GetISteamGameServerStats_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamGameServerStats");
  g_bd_flat_SteamClient020_GetISteamApps = (BDFlatFn_SteamClient020_GetISteamApps_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamApps");
  g_bd_flat_SteamClient020_GetISteamNetworking = (BDFlatFn_SteamClient020_GetISteamNetworking_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamNetworking");
  g_bd_flat_SteamClient020_GetISteamRemoteStorage = (BDFlatFn_SteamClient020_GetISteamRemoteStorage_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamRemoteStorage");
  g_bd_flat_SteamClient020_GetISteamScreenshots = (BDFlatFn_SteamClient020_GetISteamScreenshots_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamScreenshots");
  g_bd_flat_SteamClient020_RunFrame = (BDFlatFn_SteamClient020_RunFrame_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_RunFrame");
  g_bd_flat_SteamClient020_GetIPCCallCount = (BDFlatFn_SteamClient020_GetIPCCallCount_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetIPCCallCount");
  g_bd_flat_SteamClient020_BShutdownIfAllPipesClosed = (BDFlatFn_SteamClient020_BShutdownIfAllPipesClosed_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_BShutdownIfAllPipesClosed");
  g_bd_flat_SteamClient020_GetISteamHTTP = (BDFlatFn_SteamClient020_GetISteamHTTP_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamHTTP");
  g_bd_flat_SteamClient020_DEPRECATED_GetISteamUnifiedMessages = (BDFlatFn_SteamClient020_DEPRECATED_GetISteamUnifiedMessages_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUnifiedMessages");
  g_bd_flat_SteamClient020_GetISteamController = (BDFlatFn_SteamClient020_GetISteamController_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamController");
  g_bd_flat_SteamClient020_GetISteamUGC = (BDFlatFn_SteamClient020_GetISteamUGC_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUGC");
  g_bd_flat_SteamClient020_GetISteamAppList = (BDFlatFn_SteamClient020_GetISteamAppList_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamAppList");
  g_bd_flat_SteamClient020_GetISteamMusic = (BDFlatFn_SteamClient020_GetISteamMusic_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMusic");
  g_bd_flat_SteamClient020_GetISteamMusicRemote = (BDFlatFn_SteamClient020_GetISteamMusicRemote_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMusicRemote");
  g_bd_flat_SteamClient020_GetISteamHTMLSurface = (BDFlatFn_SteamClient020_GetISteamHTMLSurface_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamHTMLSurface");
  g_bd_flat_SteamClient020_GetISteamInventory = (BDFlatFn_SteamClient020_GetISteamInventory_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamInventory");
  g_bd_flat_SteamClient020_GetISteamVideo = (BDFlatFn_SteamClient020_GetISteamVideo_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamVideo");
  g_bd_flat_SteamClient020_GetISteamParentalSettings = (BDFlatFn_SteamClient020_GetISteamParentalSettings_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamParentalSettings");
  g_bd_accessor_steamclient021 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamClient");
  g_bd_self_steamclient021 = g_bd_accessor_steamclient021 ? g_bd_accessor_steamclient021() : NULL;
  g_bd_flat_SteamClient021_CreateSteamPipe = (BDFlatFn_SteamClient021_CreateSteamPipe_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_CreateSteamPipe");
  g_bd_flat_SteamClient021_BReleaseSteamPipe = (BDFlatFn_SteamClient021_BReleaseSteamPipe_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_BReleaseSteamPipe");
  g_bd_flat_SteamClient021_ConnectToGlobalUser = (BDFlatFn_SteamClient021_ConnectToGlobalUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_ConnectToGlobalUser");
  g_bd_flat_SteamClient021_CreateLocalUser = (BDFlatFn_SteamClient021_CreateLocalUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_CreateLocalUser");
  g_bd_flat_SteamClient021_ReleaseUser = (BDFlatFn_SteamClient021_ReleaseUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_ReleaseUser");
  g_bd_flat_SteamClient021_GetISteamUser = (BDFlatFn_SteamClient021_GetISteamUser_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUser");
  g_bd_flat_SteamClient021_GetISteamGameServer = (BDFlatFn_SteamClient021_GetISteamGameServer_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamGameServer");
  g_bd_flat_SteamClient021_GetISteamFriends = (BDFlatFn_SteamClient021_GetISteamFriends_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamFriends");
  g_bd_flat_SteamClient021_GetISteamUtils = (BDFlatFn_SteamClient021_GetISteamUtils_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUtils");
  g_bd_flat_SteamClient021_GetISteamMatchmaking = (BDFlatFn_SteamClient021_GetISteamMatchmaking_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMatchmaking");
  g_bd_flat_SteamClient021_GetISteamMatchmakingServers = (BDFlatFn_SteamClient021_GetISteamMatchmakingServers_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMatchmakingServers");
  g_bd_flat_SteamClient021_GetISteamGenericInterface = (BDFlatFn_SteamClient021_GetISteamGenericInterface_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamGenericInterface");
  g_bd_flat_SteamClient021_GetISteamUserStats = (BDFlatFn_SteamClient021_GetISteamUserStats_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUserStats");
  g_bd_flat_SteamClient021_GetISteamGameServerStats = (BDFlatFn_SteamClient021_GetISteamGameServerStats_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamGameServerStats");
  g_bd_flat_SteamClient021_GetISteamApps = (BDFlatFn_SteamClient021_GetISteamApps_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamApps");
  g_bd_flat_SteamClient021_GetISteamNetworking = (BDFlatFn_SteamClient021_GetISteamNetworking_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamNetworking");
  g_bd_flat_SteamClient021_GetISteamRemoteStorage = (BDFlatFn_SteamClient021_GetISteamRemoteStorage_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamRemoteStorage");
  g_bd_flat_SteamClient021_GetISteamScreenshots = (BDFlatFn_SteamClient021_GetISteamScreenshots_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamScreenshots");
  g_bd_flat_SteamClient021_RunFrame = (BDFlatFn_SteamClient021_RunFrame_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_RunFrame");
  g_bd_flat_SteamClient021_GetIPCCallCount = (BDFlatFn_SteamClient021_GetIPCCallCount_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetIPCCallCount");
  g_bd_flat_SteamClient021_BShutdownIfAllPipesClosed = (BDFlatFn_SteamClient021_BShutdownIfAllPipesClosed_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_BShutdownIfAllPipesClosed");
  g_bd_flat_SteamClient021_GetISteamHTTP = (BDFlatFn_SteamClient021_GetISteamHTTP_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamHTTP");
  g_bd_flat_SteamClient021_GetISteamController = (BDFlatFn_SteamClient021_GetISteamController_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamController");
  g_bd_flat_SteamClient021_GetISteamUGC = (BDFlatFn_SteamClient021_GetISteamUGC_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamUGC");
  g_bd_flat_SteamClient021_GetISteamMusic = (BDFlatFn_SteamClient021_GetISteamMusic_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMusic");
  g_bd_flat_SteamClient021_GetISteamMusicRemote = (BDFlatFn_SteamClient021_GetISteamMusicRemote_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamMusicRemote");
  g_bd_flat_SteamClient021_GetISteamHTMLSurface = (BDFlatFn_SteamClient021_GetISteamHTMLSurface_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamHTMLSurface");
  g_bd_flat_SteamClient021_GetISteamInventory = (BDFlatFn_SteamClient021_GetISteamInventory_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamInventory");
  g_bd_flat_SteamClient021_GetISteamVideo = (BDFlatFn_SteamClient021_GetISteamVideo_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamVideo");
  g_bd_flat_SteamClient021_GetISteamParentalSettings = (BDFlatFn_SteamClient021_GetISteamParentalSettings_t)dlsym(dylibHandle, "SteamAPI_ISteamClient_GetISteamParentalSettings");
  g_bd_accessor_steamuser021 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUser_v023");
  g_bd_self_steamuser021 = g_bd_accessor_steamuser021 ? g_bd_accessor_steamuser021() : NULL;
  g_bd_flat_SteamUser021_GetHSteamUser = (BDFlatFn_SteamUser021_GetHSteamUser_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetHSteamUser");
  g_bd_flat_SteamUser021_BLoggedOn = (BDFlatFn_SteamUser021_BLoggedOn_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_BLoggedOn");
  g_bd_flat_SteamUser021_GetSteamID = (BDFlatFn_SteamUser021_GetSteamID_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetSteamID");
  g_bd_flat_SteamUser021_GetAuthSessionTicket = (BDFlatFn_SteamUser021_GetAuthSessionTicket_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetAuthSessionTicket");
  g_bd_flat_SteamUser021_CancelAuthTicket = (BDFlatFn_SteamUser021_CancelAuthTicket_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_CancelAuthTicket");
  g_bd_accessor_steamfriends017 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamFriends_v018");
  g_bd_self_steamfriends017 = g_bd_accessor_steamfriends017 ? g_bd_accessor_steamfriends017() : NULL;
  g_bd_flat_SteamFriends017_GetPersonaName = (BDFlatFn_SteamFriends017_GetPersonaName_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetPersonaName");
  g_bd_flat_SteamFriends017_GetPersonaState = (BDFlatFn_SteamFriends017_GetPersonaState_t)dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetPersonaState");
  g_bd_accessor_steamutils010 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUtils_v011");
  g_bd_self_steamutils010 = g_bd_accessor_steamutils010 ? g_bd_accessor_steamutils010() : NULL;
  g_bd_flat_SteamUtils010_GetSecondsSinceAppActive = (BDFlatFn_SteamUtils010_GetSecondsSinceAppActive_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSecondsSinceAppActive");
  g_bd_flat_SteamUtils010_GetSecondsSinceComputerActive = (BDFlatFn_SteamUtils010_GetSecondsSinceComputerActive_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSecondsSinceComputerActive");
  g_bd_flat_SteamUtils010_GetConnectedUniverse = (BDFlatFn_SteamUtils010_GetConnectedUniverse_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetConnectedUniverse");
  g_bd_flat_SteamUtils010_GetServerRealTime = (BDFlatFn_SteamUtils010_GetServerRealTime_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetServerRealTime");
  g_bd_flat_SteamUtils010_GetIPCountry = (BDFlatFn_SteamUtils010_GetIPCountry_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetIPCountry");
  g_bd_flat_SteamUtils010_GetCurrentBatteryPower = (BDFlatFn_SteamUtils010_GetCurrentBatteryPower_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetCurrentBatteryPower");
  g_bd_flat_SteamUtils010_GetAppID = (BDFlatFn_SteamUtils010_GetAppID_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetAppID");
  g_bd_flat_SteamUtils010_IsOverlayEnabled = (BDFlatFn_SteamUtils010_IsOverlayEnabled_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_IsOverlayEnabled");
  g_bd_flat_SteamUtils010_GetSteamUILanguage = (BDFlatFn_SteamUtils010_GetSteamUILanguage_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSteamUILanguage");
  g_bd_flat_SteamUtils010_IsSteamRunningInVR = (BDFlatFn_SteamUtils010_IsSteamRunningInVR_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_IsSteamRunningInVR");
  g_bd_flat_SteamUtils010_IsSteamInBigPictureMode = (BDFlatFn_SteamUtils010_IsSteamInBigPictureMode_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_IsSteamInBigPictureMode");
  g_bd_accessor_steamuserstats_interface_version012 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUserStats_v013");
  g_bd_self_steamuserstats_interface_version012 = g_bd_accessor_steamuserstats_interface_version012 ? g_bd_accessor_steamuserstats_interface_version012() : NULL;
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2 = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetStatFloat");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetStatInt32");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2 = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_SetStatFloat");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_SetStatInt32");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_UpdateAvgRateStat");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievement");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_SetAchievement");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_ClearAchievement");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievementAndUnlockTime");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_StoreStats = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_StoreStats_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_StoreStats");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievementDisplayAttribute");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_IndicateAchievementProgress");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetNumAchievements = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetNumAchievements_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetNumAchievements");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementName = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementName_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievementName");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_ResetAllStats = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION012_ResetAllStats_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_ResetAllStats");
  g_bd_accessor_steamuserstats_interface_version013 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUserStats_v013");
  g_bd_self_steamuserstats_interface_version013 = g_bd_accessor_steamuserstats_interface_version013 ? g_bd_accessor_steamuserstats_interface_version013() : NULL;
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2 = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetStatFloat");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetStatInt32");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2 = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_SetStatFloat");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_SetStatInt32");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_UpdateAvgRateStat");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievement");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_SetAchievement");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_ClearAchievement");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievementAndUnlockTime");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_StoreStats = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_StoreStats_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_StoreStats");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievementDisplayAttribute");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_IndicateAchievementProgress");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetNumAchievements = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetNumAchievements_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetNumAchievements");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementName = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementName_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_GetAchievementName");
  g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_ResetAllStats = (BDFlatFn_STEAMUSERSTATS_INTERFACE_VERSION013_ResetAllStats_t)dlsym(dylibHandle, "SteamAPI_ISteamUserStats_ResetAllStats");
  g_bd_accessor_steamutils009 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUtils_v011");
  g_bd_self_steamutils009 = g_bd_accessor_steamutils009 ? g_bd_accessor_steamutils009() : NULL;
  g_bd_flat_SteamUtils009_GetSecondsSinceAppActive = (BDFlatFn_SteamUtils009_GetSecondsSinceAppActive_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSecondsSinceAppActive");
  g_bd_flat_SteamUtils009_GetSecondsSinceComputerActive = (BDFlatFn_SteamUtils009_GetSecondsSinceComputerActive_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSecondsSinceComputerActive");
  g_bd_flat_SteamUtils009_GetConnectedUniverse = (BDFlatFn_SteamUtils009_GetConnectedUniverse_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetConnectedUniverse");
  g_bd_flat_SteamUtils009_GetServerRealTime = (BDFlatFn_SteamUtils009_GetServerRealTime_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetServerRealTime");
  g_bd_flat_SteamUtils009_GetIPCountry = (BDFlatFn_SteamUtils009_GetIPCountry_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetIPCountry");
  g_bd_flat_SteamUtils009_GetCurrentBatteryPower = (BDFlatFn_SteamUtils009_GetCurrentBatteryPower_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetCurrentBatteryPower");
  g_bd_flat_SteamUtils009_GetAppID = (BDFlatFn_SteamUtils009_GetAppID_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetAppID");
  g_bd_flat_SteamUtils009_IsOverlayEnabled = (BDFlatFn_SteamUtils009_IsOverlayEnabled_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_IsOverlayEnabled");
  g_bd_flat_SteamUtils009_GetSteamUILanguage = (BDFlatFn_SteamUtils009_GetSteamUILanguage_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSteamUILanguage");
  g_bd_flat_SteamUtils009_IsSteamRunningInVR = (BDFlatFn_SteamUtils009_IsSteamRunningInVR_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_IsSteamRunningInVR");
  g_bd_flat_SteamUtils009_IsSteamInBigPictureMode = (BDFlatFn_SteamUtils009_IsSteamInBigPictureMode_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_IsSteamInBigPictureMode");
  g_bd_accessor_steamuser018 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUser_v023");
  g_bd_self_steamuser018 = g_bd_accessor_steamuser018 ? g_bd_accessor_steamuser018() : NULL;
  g_bd_flat_SteamUser018_GetHSteamUser = (BDFlatFn_SteamUser018_GetHSteamUser_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetHSteamUser");
  g_bd_flat_SteamUser018_BLoggedOn = (BDFlatFn_SteamUser018_BLoggedOn_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_BLoggedOn");
  g_bd_flat_SteamUser018_GetSteamID = (BDFlatFn_SteamUser018_GetSteamID_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetSteamID");
  g_bd_flat_SteamUser018_GetAuthSessionTicket = (BDFlatFn_SteamUser018_GetAuthSessionTicket_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_GetAuthSessionTicket");
  g_bd_flat_SteamUser018_CancelAuthTicket = (BDFlatFn_SteamUser018_CancelAuthTicket_t)dlsym(dylibHandle, "SteamAPI_ISteamUser_CancelAuthTicket");
  g_bd_accessor_steamutils007 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamUtils_v011");
  g_bd_self_steamutils007 = g_bd_accessor_steamutils007 ? g_bd_accessor_steamutils007() : NULL;
  g_bd_flat_SteamUtils007_GetSecondsSinceAppActive = (BDFlatFn_SteamUtils007_GetSecondsSinceAppActive_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSecondsSinceAppActive");
  g_bd_flat_SteamUtils007_GetSecondsSinceComputerActive = (BDFlatFn_SteamUtils007_GetSecondsSinceComputerActive_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSecondsSinceComputerActive");
  g_bd_flat_SteamUtils007_GetConnectedUniverse = (BDFlatFn_SteamUtils007_GetConnectedUniverse_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetConnectedUniverse");
  g_bd_flat_SteamUtils007_GetServerRealTime = (BDFlatFn_SteamUtils007_GetServerRealTime_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetServerRealTime");
  g_bd_flat_SteamUtils007_GetIPCountry = (BDFlatFn_SteamUtils007_GetIPCountry_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetIPCountry");
  g_bd_flat_SteamUtils007_GetCurrentBatteryPower = (BDFlatFn_SteamUtils007_GetCurrentBatteryPower_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetCurrentBatteryPower");
  g_bd_flat_SteamUtils007_GetAppID = (BDFlatFn_SteamUtils007_GetAppID_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetAppID");
  g_bd_flat_SteamUtils007_IsOverlayEnabled = (BDFlatFn_SteamUtils007_IsOverlayEnabled_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_IsOverlayEnabled");
  g_bd_flat_SteamUtils007_GetSteamUILanguage = (BDFlatFn_SteamUtils007_GetSteamUILanguage_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_GetSteamUILanguage");
  g_bd_flat_SteamUtils007_IsSteamRunningInVR = (BDFlatFn_SteamUtils007_IsSteamRunningInVR_t)dlsym(dylibHandle, "SteamAPI_ISteamUtils_IsSteamRunningInVR");
  g_bd_accessor_steamapps_interface_version007 = (BDAccessorFn_t)dlsym(dylibHandle, "SteamAPI_SteamApps_v009");
  g_bd_self_steamapps_interface_version007 = g_bd_accessor_steamapps_interface_version007 ? g_bd_accessor_steamapps_interface_version007() : NULL;
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribed = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribed_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsSubscribed");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsLowViolence = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsLowViolence_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsLowViolence");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsCybercafe = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsCybercafe_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsCybercafe");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsVACBanned = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsVACBanned_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsVACBanned");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetCurrentGameLanguage = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetCurrentGameLanguage_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetCurrentGameLanguage");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetAvailableGameLanguages = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetAvailableGameLanguages_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetAvailableGameLanguages");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedApp = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedApp_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsSubscribedApp");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsDlcInstalled = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsDlcInstalled_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsDlcInstalled");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetEarliestPurchaseUnixTime = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetEarliestPurchaseUnixTime_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetEarliestPurchaseUnixTime");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedFromFreeWeekend = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedFromFreeWeekend_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsSubscribedFromFreeWeekend");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetDLCCount = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetDLCCount_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetDLCCount");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsAppInstalled = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_BIsAppInstalled_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_BIsAppInstalled");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetAppOwner = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetAppOwner_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetAppOwner");
  g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetAppBuildId = (BDFlatFn_STEAMAPPS_INTERFACE_VERSION007_GetAppBuildId_t)dlsym(dylibHandle, "SteamAPI_ISteamApps_GetAppBuildId");
  return 1;
}

// 53-06 (D-53-13): game-originated call trace tables. Not a wire tuple,
// so BRIDGE_DISPATCH_TABLE_HASH is unaffected.
#define BD_CALL_COUNT 313
static int bd_call_index(uint16_t ordinal, uint16_t slot) {
  switch (((uint32_t)ordinal << 16) | (uint32_t)slot) {
    case (((uint32_t)BD_ORDINAL_SteamUser023 << 16) | (uint32_t)BD_SLOT_SteamUser023_GetHSteamUser): return 0;
    case (((uint32_t)BD_ORDINAL_SteamUser023 << 16) | (uint32_t)BD_SLOT_SteamUser023_BLoggedOn): return 1;
    case (((uint32_t)BD_ORDINAL_SteamUser023 << 16) | (uint32_t)BD_SLOT_SteamUser023_GetSteamID): return 2;
    case (((uint32_t)BD_ORDINAL_SteamUser023 << 16) | (uint32_t)BD_SLOT_SteamUser023_GetAuthSessionTicket): return 3;
    case (((uint32_t)BD_ORDINAL_SteamUser023 << 16) | (uint32_t)BD_SLOT_SteamUser023_GetAuthTicketForWebApi): return 4;
    case (((uint32_t)BD_ORDINAL_SteamUser023 << 16) | (uint32_t)BD_SLOT_SteamUser023_CancelAuthTicket): return 5;
    case (((uint32_t)BD_ORDINAL_SteamFriends018 << 16) | (uint32_t)BD_SLOT_SteamFriends018_GetPersonaName): return 6;
    case (((uint32_t)BD_ORDINAL_SteamFriends018 << 16) | (uint32_t)BD_SLOT_SteamFriends018_GetPersonaState): return 7;
    case (((uint32_t)BD_ORDINAL_SteamUser016 << 16) | (uint32_t)BD_SLOT_SteamUser016_GetHSteamUser): return 8;
    case (((uint32_t)BD_ORDINAL_SteamUser016 << 16) | (uint32_t)BD_SLOT_SteamUser016_BLoggedOn): return 9;
    case (((uint32_t)BD_ORDINAL_SteamUser016 << 16) | (uint32_t)BD_SLOT_SteamUser016_GetSteamID): return 10;
    case (((uint32_t)BD_ORDINAL_SteamFriends011 << 16) | (uint32_t)BD_SLOT_SteamFriends011_GetPersonaName): return 11;
    case (((uint32_t)BD_ORDINAL_SteamFriends011 << 16) | (uint32_t)BD_SLOT_SteamFriends011_GetPersonaState): return 12;
    case (((uint32_t)BD_ORDINAL_SteamUtils005 << 16) | (uint32_t)BD_SLOT_SteamUtils005_GetSecondsSinceAppActive): return 13;
    case (((uint32_t)BD_ORDINAL_SteamUtils005 << 16) | (uint32_t)BD_SLOT_SteamUtils005_GetSecondsSinceComputerActive): return 14;
    case (((uint32_t)BD_ORDINAL_SteamUtils005 << 16) | (uint32_t)BD_SLOT_SteamUtils005_GetConnectedUniverse): return 15;
    case (((uint32_t)BD_ORDINAL_SteamUtils005 << 16) | (uint32_t)BD_SLOT_SteamUtils005_GetServerRealTime): return 16;
    case (((uint32_t)BD_ORDINAL_SteamUtils005 << 16) | (uint32_t)BD_SLOT_SteamUtils005_GetIPCountry): return 17;
    case (((uint32_t)BD_ORDINAL_SteamUtils005 << 16) | (uint32_t)BD_SLOT_SteamUtils005_GetCurrentBatteryPower): return 18;
    case (((uint32_t)BD_ORDINAL_SteamUtils005 << 16) | (uint32_t)BD_SLOT_SteamUtils005_GetAppID): return 19;
    case (((uint32_t)BD_ORDINAL_SteamUtils005 << 16) | (uint32_t)BD_SLOT_SteamUtils005_IsOverlayEnabled): return 20;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION004 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribed): return 21;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION004 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsLowViolence): return 22;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION004 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsCybercafe): return 23;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION004 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsVACBanned): return 24;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION004 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage): return 25;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION004 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages): return 26;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION004 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedApp): return 27;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION004 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsDlcInstalled): return 28;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION004 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_GetEarliestPurchaseUnixTime): return 29;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION004 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedFromFreeWeekend): return 30;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION004 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION004_GetDLCCount): return 31;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2): return 32;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat): return 33;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2): return 34;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat): return 35;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat): return 36;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement): return 37;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement): return 38;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement): return 39;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime): return 40;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_StoreStats): return 41;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute): return 42;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress): return 43;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION010 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION010_ResetAllStats): return 44;
    case (((uint32_t)BD_ORDINAL_SteamFriends013 << 16) | (uint32_t)BD_SLOT_SteamFriends013_GetPersonaName): return 45;
    case (((uint32_t)BD_ORDINAL_SteamFriends013 << 16) | (uint32_t)BD_SLOT_SteamFriends013_GetPersonaState): return 46;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribed): return 47;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsLowViolence): return 48;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsCybercafe): return 49;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsVACBanned): return 50;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage): return 51;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages): return 52;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedApp): return 53;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsDlcInstalled): return 54;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_GetEarliestPurchaseUnixTime): return 55;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedFromFreeWeekend): return 56;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_GetDLCCount): return 57;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION005 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION005_BIsAppInstalled): return 58;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2): return 59;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat): return 60;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2): return 61;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat): return 62;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat): return 63;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement): return 64;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement): return 65;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement): return 66;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime): return 67;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_StoreStats): return 68;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute): return 69;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress): return 70;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetNumAchievements): return 71;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName): return 72;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION011 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION011_ResetAllStats): return 73;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_CreateSteamPipe): return 74;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_BReleaseSteamPipe): return 75;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_ConnectToGlobalUser): return 76;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_CreateLocalUser): return 77;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_ReleaseUser): return 78;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamUser): return 79;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamGameServer): return 80;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamFriends): return 81;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamUtils): return 82;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamMatchmaking): return 83;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamMatchmakingServers): return 84;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamGenericInterface): return 85;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamUserStats): return 86;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamGameServerStats): return 87;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamApps): return 88;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamNetworking): return 89;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamRemoteStorage): return 90;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamScreenshots): return 91;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_RunFrame): return 92;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetIPCCallCount): return 93;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_BShutdownIfAllPipesClosed): return 94;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamHTTP): return 95;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_DEPRECATED_GetISteamUnifiedMessages): return 96;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamController): return 97;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamUGC): return 98;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamAppList): return 99;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamMusic): return 100;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamMusicRemote): return 101;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamHTMLSurface): return 102;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamInventory): return 103;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamVideo): return 104;
    case (((uint32_t)BD_ORDINAL_SteamClient017 << 16) | (uint32_t)BD_SLOT_SteamClient017_GetISteamParentalSettings): return 105;
    case (((uint32_t)BD_ORDINAL_SteamUser019 << 16) | (uint32_t)BD_SLOT_SteamUser019_GetHSteamUser): return 106;
    case (((uint32_t)BD_ORDINAL_SteamUser019 << 16) | (uint32_t)BD_SLOT_SteamUser019_BLoggedOn): return 107;
    case (((uint32_t)BD_ORDINAL_SteamUser019 << 16) | (uint32_t)BD_SLOT_SteamUser019_GetSteamID): return 108;
    case (((uint32_t)BD_ORDINAL_SteamFriends015 << 16) | (uint32_t)BD_SLOT_SteamFriends015_GetPersonaName): return 109;
    case (((uint32_t)BD_ORDINAL_SteamFriends015 << 16) | (uint32_t)BD_SLOT_SteamFriends015_GetPersonaState): return 110;
    case (((uint32_t)BD_ORDINAL_SteamUtils008 << 16) | (uint32_t)BD_SLOT_SteamUtils008_GetSecondsSinceAppActive): return 111;
    case (((uint32_t)BD_ORDINAL_SteamUtils008 << 16) | (uint32_t)BD_SLOT_SteamUtils008_GetSecondsSinceComputerActive): return 112;
    case (((uint32_t)BD_ORDINAL_SteamUtils008 << 16) | (uint32_t)BD_SLOT_SteamUtils008_GetConnectedUniverse): return 113;
    case (((uint32_t)BD_ORDINAL_SteamUtils008 << 16) | (uint32_t)BD_SLOT_SteamUtils008_GetServerRealTime): return 114;
    case (((uint32_t)BD_ORDINAL_SteamUtils008 << 16) | (uint32_t)BD_SLOT_SteamUtils008_GetIPCountry): return 115;
    case (((uint32_t)BD_ORDINAL_SteamUtils008 << 16) | (uint32_t)BD_SLOT_SteamUtils008_GetCurrentBatteryPower): return 116;
    case (((uint32_t)BD_ORDINAL_SteamUtils008 << 16) | (uint32_t)BD_SLOT_SteamUtils008_GetAppID): return 117;
    case (((uint32_t)BD_ORDINAL_SteamUtils008 << 16) | (uint32_t)BD_SLOT_SteamUtils008_IsOverlayEnabled): return 118;
    case (((uint32_t)BD_ORDINAL_SteamUtils008 << 16) | (uint32_t)BD_SLOT_SteamUtils008_GetSteamUILanguage): return 119;
    case (((uint32_t)BD_ORDINAL_SteamUtils008 << 16) | (uint32_t)BD_SLOT_SteamUtils008_IsSteamRunningInVR): return 120;
    case (((uint32_t)BD_ORDINAL_SteamUtils008 << 16) | (uint32_t)BD_SLOT_SteamUtils008_IsSteamInBigPictureMode): return 121;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribed): return 122;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsLowViolence): return 123;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsCybercafe): return 124;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsVACBanned): return 125;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_GetCurrentGameLanguage): return 126;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_GetAvailableGameLanguages): return 127;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedApp): return 128;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsDlcInstalled): return 129;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_GetEarliestPurchaseUnixTime): return 130;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedFromFreeWeekend): return 131;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_GetDLCCount): return 132;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_BIsAppInstalled): return 133;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_GetAppOwner): return 134;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION008 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION008_GetAppBuildId): return 135;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_CreateSteamPipe): return 136;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_BReleaseSteamPipe): return 137;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_ConnectToGlobalUser): return 138;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_CreateLocalUser): return 139;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_ReleaseUser): return 140;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamUser): return 141;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamGameServer): return 142;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamFriends): return 143;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamUtils): return 144;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamMatchmaking): return 145;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamMatchmakingServers): return 146;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamGenericInterface): return 147;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamUserStats): return 148;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamGameServerStats): return 149;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamApps): return 150;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamNetworking): return 151;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamRemoteStorage): return 152;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamScreenshots): return 153;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_RunFrame): return 154;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetIPCCallCount): return 155;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_BShutdownIfAllPipesClosed): return 156;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamHTTP): return 157;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamUnifiedMessages): return 158;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamController): return 159;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamUGC): return 160;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamAppList): return 161;
    case (((uint32_t)BD_ORDINAL_SteamClient014 << 16) | (uint32_t)BD_SLOT_SteamClient014_GetISteamMusic): return 162;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_CreateSteamPipe): return 163;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_BReleaseSteamPipe): return 164;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_ConnectToGlobalUser): return 165;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_CreateLocalUser): return 166;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_ReleaseUser): return 167;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamUser): return 168;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamGameServer): return 169;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamFriends): return 170;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamUtils): return 171;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamMatchmaking): return 172;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamMatchmakingServers): return 173;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamGenericInterface): return 174;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamUserStats): return 175;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamGameServerStats): return 176;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamApps): return 177;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamNetworking): return 178;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamRemoteStorage): return 179;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamScreenshots): return 180;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_RunFrame): return 181;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetIPCCallCount): return 182;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_BShutdownIfAllPipesClosed): return 183;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamHTTP): return 184;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_DEPRECATED_GetISteamUnifiedMessages): return 185;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamController): return 186;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamUGC): return 187;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamAppList): return 188;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamMusic): return 189;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamMusicRemote): return 190;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamHTMLSurface): return 191;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamInventory): return 192;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamVideo): return 193;
    case (((uint32_t)BD_ORDINAL_SteamClient020 << 16) | (uint32_t)BD_SLOT_SteamClient020_GetISteamParentalSettings): return 194;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_CreateSteamPipe): return 195;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_BReleaseSteamPipe): return 196;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_ConnectToGlobalUser): return 197;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_CreateLocalUser): return 198;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_ReleaseUser): return 199;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamUser): return 200;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamGameServer): return 201;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamFriends): return 202;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamUtils): return 203;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamMatchmaking): return 204;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamMatchmakingServers): return 205;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamGenericInterface): return 206;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamUserStats): return 207;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamGameServerStats): return 208;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamApps): return 209;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamNetworking): return 210;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamRemoteStorage): return 211;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamScreenshots): return 212;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_RunFrame): return 213;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetIPCCallCount): return 214;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_BShutdownIfAllPipesClosed): return 215;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamHTTP): return 216;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamController): return 217;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamUGC): return 218;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamMusic): return 219;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamMusicRemote): return 220;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamHTMLSurface): return 221;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamInventory): return 222;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamVideo): return 223;
    case (((uint32_t)BD_ORDINAL_SteamClient021 << 16) | (uint32_t)BD_SLOT_SteamClient021_GetISteamParentalSettings): return 224;
    case (((uint32_t)BD_ORDINAL_SteamUser021 << 16) | (uint32_t)BD_SLOT_SteamUser021_GetHSteamUser): return 225;
    case (((uint32_t)BD_ORDINAL_SteamUser021 << 16) | (uint32_t)BD_SLOT_SteamUser021_BLoggedOn): return 226;
    case (((uint32_t)BD_ORDINAL_SteamUser021 << 16) | (uint32_t)BD_SLOT_SteamUser021_GetSteamID): return 227;
    case (((uint32_t)BD_ORDINAL_SteamUser021 << 16) | (uint32_t)BD_SLOT_SteamUser021_GetAuthSessionTicket): return 228;
    case (((uint32_t)BD_ORDINAL_SteamUser021 << 16) | (uint32_t)BD_SLOT_SteamUser021_CancelAuthTicket): return 229;
    case (((uint32_t)BD_ORDINAL_SteamFriends017 << 16) | (uint32_t)BD_SLOT_SteamFriends017_GetPersonaName): return 230;
    case (((uint32_t)BD_ORDINAL_SteamFriends017 << 16) | (uint32_t)BD_SLOT_SteamFriends017_GetPersonaState): return 231;
    case (((uint32_t)BD_ORDINAL_SteamUtils010 << 16) | (uint32_t)BD_SLOT_SteamUtils010_GetSecondsSinceAppActive): return 232;
    case (((uint32_t)BD_ORDINAL_SteamUtils010 << 16) | (uint32_t)BD_SLOT_SteamUtils010_GetSecondsSinceComputerActive): return 233;
    case (((uint32_t)BD_ORDINAL_SteamUtils010 << 16) | (uint32_t)BD_SLOT_SteamUtils010_GetConnectedUniverse): return 234;
    case (((uint32_t)BD_ORDINAL_SteamUtils010 << 16) | (uint32_t)BD_SLOT_SteamUtils010_GetServerRealTime): return 235;
    case (((uint32_t)BD_ORDINAL_SteamUtils010 << 16) | (uint32_t)BD_SLOT_SteamUtils010_GetIPCountry): return 236;
    case (((uint32_t)BD_ORDINAL_SteamUtils010 << 16) | (uint32_t)BD_SLOT_SteamUtils010_GetCurrentBatteryPower): return 237;
    case (((uint32_t)BD_ORDINAL_SteamUtils010 << 16) | (uint32_t)BD_SLOT_SteamUtils010_GetAppID): return 238;
    case (((uint32_t)BD_ORDINAL_SteamUtils010 << 16) | (uint32_t)BD_SLOT_SteamUtils010_IsOverlayEnabled): return 239;
    case (((uint32_t)BD_ORDINAL_SteamUtils010 << 16) | (uint32_t)BD_SLOT_SteamUtils010_GetSteamUILanguage): return 240;
    case (((uint32_t)BD_ORDINAL_SteamUtils010 << 16) | (uint32_t)BD_SLOT_SteamUtils010_IsSteamRunningInVR): return 241;
    case (((uint32_t)BD_ORDINAL_SteamUtils010 << 16) | (uint32_t)BD_SLOT_SteamUtils010_IsSteamInBigPictureMode): return 242;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2): return 243;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat): return 244;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2): return 245;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat): return 246;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat): return 247;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement): return 248;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement): return 249;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement): return 250;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime): return 251;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_StoreStats): return 252;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute): return 253;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress): return 254;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetNumAchievements): return 255;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementName): return 256;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION012 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION012_ResetAllStats): return 257;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2): return 258;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat): return 259;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2): return 260;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat): return 261;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat): return 262;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement): return 263;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement): return 264;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement): return 265;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime): return 266;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_StoreStats): return 267;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute): return 268;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress): return 269;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetNumAchievements): return 270;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementName): return 271;
    case (((uint32_t)BD_ORDINAL_STEAMUSERSTATS_INTERFACE_VERSION013 << 16) | (uint32_t)BD_SLOT_STEAMUSERSTATS_INTERFACE_VERSION013_ResetAllStats): return 272;
    case (((uint32_t)BD_ORDINAL_SteamUtils009 << 16) | (uint32_t)BD_SLOT_SteamUtils009_GetSecondsSinceAppActive): return 273;
    case (((uint32_t)BD_ORDINAL_SteamUtils009 << 16) | (uint32_t)BD_SLOT_SteamUtils009_GetSecondsSinceComputerActive): return 274;
    case (((uint32_t)BD_ORDINAL_SteamUtils009 << 16) | (uint32_t)BD_SLOT_SteamUtils009_GetConnectedUniverse): return 275;
    case (((uint32_t)BD_ORDINAL_SteamUtils009 << 16) | (uint32_t)BD_SLOT_SteamUtils009_GetServerRealTime): return 276;
    case (((uint32_t)BD_ORDINAL_SteamUtils009 << 16) | (uint32_t)BD_SLOT_SteamUtils009_GetIPCountry): return 277;
    case (((uint32_t)BD_ORDINAL_SteamUtils009 << 16) | (uint32_t)BD_SLOT_SteamUtils009_GetCurrentBatteryPower): return 278;
    case (((uint32_t)BD_ORDINAL_SteamUtils009 << 16) | (uint32_t)BD_SLOT_SteamUtils009_GetAppID): return 279;
    case (((uint32_t)BD_ORDINAL_SteamUtils009 << 16) | (uint32_t)BD_SLOT_SteamUtils009_IsOverlayEnabled): return 280;
    case (((uint32_t)BD_ORDINAL_SteamUtils009 << 16) | (uint32_t)BD_SLOT_SteamUtils009_GetSteamUILanguage): return 281;
    case (((uint32_t)BD_ORDINAL_SteamUtils009 << 16) | (uint32_t)BD_SLOT_SteamUtils009_IsSteamRunningInVR): return 282;
    case (((uint32_t)BD_ORDINAL_SteamUtils009 << 16) | (uint32_t)BD_SLOT_SteamUtils009_IsSteamInBigPictureMode): return 283;
    case (((uint32_t)BD_ORDINAL_SteamUser018 << 16) | (uint32_t)BD_SLOT_SteamUser018_GetHSteamUser): return 284;
    case (((uint32_t)BD_ORDINAL_SteamUser018 << 16) | (uint32_t)BD_SLOT_SteamUser018_BLoggedOn): return 285;
    case (((uint32_t)BD_ORDINAL_SteamUser018 << 16) | (uint32_t)BD_SLOT_SteamUser018_GetSteamID): return 286;
    case (((uint32_t)BD_ORDINAL_SteamUser018 << 16) | (uint32_t)BD_SLOT_SteamUser018_GetAuthSessionTicket): return 287;
    case (((uint32_t)BD_ORDINAL_SteamUser018 << 16) | (uint32_t)BD_SLOT_SteamUser018_CancelAuthTicket): return 288;
    case (((uint32_t)BD_ORDINAL_SteamUtils007 << 16) | (uint32_t)BD_SLOT_SteamUtils007_GetSecondsSinceAppActive): return 289;
    case (((uint32_t)BD_ORDINAL_SteamUtils007 << 16) | (uint32_t)BD_SLOT_SteamUtils007_GetSecondsSinceComputerActive): return 290;
    case (((uint32_t)BD_ORDINAL_SteamUtils007 << 16) | (uint32_t)BD_SLOT_SteamUtils007_GetConnectedUniverse): return 291;
    case (((uint32_t)BD_ORDINAL_SteamUtils007 << 16) | (uint32_t)BD_SLOT_SteamUtils007_GetServerRealTime): return 292;
    case (((uint32_t)BD_ORDINAL_SteamUtils007 << 16) | (uint32_t)BD_SLOT_SteamUtils007_GetIPCountry): return 293;
    case (((uint32_t)BD_ORDINAL_SteamUtils007 << 16) | (uint32_t)BD_SLOT_SteamUtils007_GetCurrentBatteryPower): return 294;
    case (((uint32_t)BD_ORDINAL_SteamUtils007 << 16) | (uint32_t)BD_SLOT_SteamUtils007_GetAppID): return 295;
    case (((uint32_t)BD_ORDINAL_SteamUtils007 << 16) | (uint32_t)BD_SLOT_SteamUtils007_IsOverlayEnabled): return 296;
    case (((uint32_t)BD_ORDINAL_SteamUtils007 << 16) | (uint32_t)BD_SLOT_SteamUtils007_GetSteamUILanguage): return 297;
    case (((uint32_t)BD_ORDINAL_SteamUtils007 << 16) | (uint32_t)BD_SLOT_SteamUtils007_IsSteamRunningInVR): return 298;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribed): return 299;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsLowViolence): return 300;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsCybercafe): return 301;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsVACBanned): return 302;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_GetCurrentGameLanguage): return 303;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_GetAvailableGameLanguages): return 304;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedApp): return 305;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsDlcInstalled): return 306;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_GetEarliestPurchaseUnixTime): return 307;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedFromFreeWeekend): return 308;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_GetDLCCount): return 309;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_BIsAppInstalled): return 310;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_GetAppOwner): return 311;
    case (((uint32_t)BD_ORDINAL_STEAMAPPS_INTERFACE_VERSION007 << 16) | (uint32_t)BD_SLOT_STEAMAPPS_INTERFACE_VERSION007_GetAppBuildId): return 312;
    default: return -1;
  }
}
static const char *bd_call_name(int idx) {
  switch (idx) {
    case 0: return "SteamUser023.GetHSteamUser";
    case 1: return "SteamUser023.BLoggedOn";
    case 2: return "SteamUser023.GetSteamID";
    case 3: return "SteamUser023.GetAuthSessionTicket";
    case 4: return "SteamUser023.GetAuthTicketForWebApi";
    case 5: return "SteamUser023.CancelAuthTicket";
    case 6: return "SteamFriends018.GetPersonaName";
    case 7: return "SteamFriends018.GetPersonaState";
    case 8: return "SteamUser016.GetHSteamUser";
    case 9: return "SteamUser016.BLoggedOn";
    case 10: return "SteamUser016.GetSteamID";
    case 11: return "SteamFriends011.GetPersonaName";
    case 12: return "SteamFriends011.GetPersonaState";
    case 13: return "SteamUtils005.GetSecondsSinceAppActive";
    case 14: return "SteamUtils005.GetSecondsSinceComputerActive";
    case 15: return "SteamUtils005.GetConnectedUniverse";
    case 16: return "SteamUtils005.GetServerRealTime";
    case 17: return "SteamUtils005.GetIPCountry";
    case 18: return "SteamUtils005.GetCurrentBatteryPower";
    case 19: return "SteamUtils005.GetAppID";
    case 20: return "SteamUtils005.IsOverlayEnabled";
    case 21: return "STEAMAPPS_INTERFACE_VERSION004.BIsSubscribed";
    case 22: return "STEAMAPPS_INTERFACE_VERSION004.BIsLowViolence";
    case 23: return "STEAMAPPS_INTERFACE_VERSION004.BIsCybercafe";
    case 24: return "STEAMAPPS_INTERFACE_VERSION004.BIsVACBanned";
    case 25: return "STEAMAPPS_INTERFACE_VERSION004.GetCurrentGameLanguage";
    case 26: return "STEAMAPPS_INTERFACE_VERSION004.GetAvailableGameLanguages";
    case 27: return "STEAMAPPS_INTERFACE_VERSION004.BIsSubscribedApp";
    case 28: return "STEAMAPPS_INTERFACE_VERSION004.BIsDlcInstalled";
    case 29: return "STEAMAPPS_INTERFACE_VERSION004.GetEarliestPurchaseUnixTime";
    case 30: return "STEAMAPPS_INTERFACE_VERSION004.BIsSubscribedFromFreeWeekend";
    case 31: return "STEAMAPPS_INTERFACE_VERSION004.GetDLCCount";
    case 32: return "STEAMUSERSTATS_INTERFACE_VERSION010.GetStat_2";
    case 33: return "STEAMUSERSTATS_INTERFACE_VERSION010.GetStat";
    case 34: return "STEAMUSERSTATS_INTERFACE_VERSION010.SetStat_2";
    case 35: return "STEAMUSERSTATS_INTERFACE_VERSION010.SetStat";
    case 36: return "STEAMUSERSTATS_INTERFACE_VERSION010.UpdateAvgRateStat";
    case 37: return "STEAMUSERSTATS_INTERFACE_VERSION010.GetAchievement";
    case 38: return "STEAMUSERSTATS_INTERFACE_VERSION010.SetAchievement";
    case 39: return "STEAMUSERSTATS_INTERFACE_VERSION010.ClearAchievement";
    case 40: return "STEAMUSERSTATS_INTERFACE_VERSION010.GetAchievementAndUnlockTime";
    case 41: return "STEAMUSERSTATS_INTERFACE_VERSION010.StoreStats";
    case 42: return "STEAMUSERSTATS_INTERFACE_VERSION010.GetAchievementDisplayAttribute";
    case 43: return "STEAMUSERSTATS_INTERFACE_VERSION010.IndicateAchievementProgress";
    case 44: return "STEAMUSERSTATS_INTERFACE_VERSION010.ResetAllStats";
    case 45: return "SteamFriends013.GetPersonaName";
    case 46: return "SteamFriends013.GetPersonaState";
    case 47: return "STEAMAPPS_INTERFACE_VERSION005.BIsSubscribed";
    case 48: return "STEAMAPPS_INTERFACE_VERSION005.BIsLowViolence";
    case 49: return "STEAMAPPS_INTERFACE_VERSION005.BIsCybercafe";
    case 50: return "STEAMAPPS_INTERFACE_VERSION005.BIsVACBanned";
    case 51: return "STEAMAPPS_INTERFACE_VERSION005.GetCurrentGameLanguage";
    case 52: return "STEAMAPPS_INTERFACE_VERSION005.GetAvailableGameLanguages";
    case 53: return "STEAMAPPS_INTERFACE_VERSION005.BIsSubscribedApp";
    case 54: return "STEAMAPPS_INTERFACE_VERSION005.BIsDlcInstalled";
    case 55: return "STEAMAPPS_INTERFACE_VERSION005.GetEarliestPurchaseUnixTime";
    case 56: return "STEAMAPPS_INTERFACE_VERSION005.BIsSubscribedFromFreeWeekend";
    case 57: return "STEAMAPPS_INTERFACE_VERSION005.GetDLCCount";
    case 58: return "STEAMAPPS_INTERFACE_VERSION005.BIsAppInstalled";
    case 59: return "STEAMUSERSTATS_INTERFACE_VERSION011.GetStat_2";
    case 60: return "STEAMUSERSTATS_INTERFACE_VERSION011.GetStat";
    case 61: return "STEAMUSERSTATS_INTERFACE_VERSION011.SetStat_2";
    case 62: return "STEAMUSERSTATS_INTERFACE_VERSION011.SetStat";
    case 63: return "STEAMUSERSTATS_INTERFACE_VERSION011.UpdateAvgRateStat";
    case 64: return "STEAMUSERSTATS_INTERFACE_VERSION011.GetAchievement";
    case 65: return "STEAMUSERSTATS_INTERFACE_VERSION011.SetAchievement";
    case 66: return "STEAMUSERSTATS_INTERFACE_VERSION011.ClearAchievement";
    case 67: return "STEAMUSERSTATS_INTERFACE_VERSION011.GetAchievementAndUnlockTime";
    case 68: return "STEAMUSERSTATS_INTERFACE_VERSION011.StoreStats";
    case 69: return "STEAMUSERSTATS_INTERFACE_VERSION011.GetAchievementDisplayAttribute";
    case 70: return "STEAMUSERSTATS_INTERFACE_VERSION011.IndicateAchievementProgress";
    case 71: return "STEAMUSERSTATS_INTERFACE_VERSION011.GetNumAchievements";
    case 72: return "STEAMUSERSTATS_INTERFACE_VERSION011.GetAchievementName";
    case 73: return "STEAMUSERSTATS_INTERFACE_VERSION011.ResetAllStats";
    case 74: return "SteamClient017.CreateSteamPipe";
    case 75: return "SteamClient017.BReleaseSteamPipe";
    case 76: return "SteamClient017.ConnectToGlobalUser";
    case 77: return "SteamClient017.CreateLocalUser";
    case 78: return "SteamClient017.ReleaseUser";
    case 79: return "SteamClient017.GetISteamUser";
    case 80: return "SteamClient017.GetISteamGameServer";
    case 81: return "SteamClient017.GetISteamFriends";
    case 82: return "SteamClient017.GetISteamUtils";
    case 83: return "SteamClient017.GetISteamMatchmaking";
    case 84: return "SteamClient017.GetISteamMatchmakingServers";
    case 85: return "SteamClient017.GetISteamGenericInterface";
    case 86: return "SteamClient017.GetISteamUserStats";
    case 87: return "SteamClient017.GetISteamGameServerStats";
    case 88: return "SteamClient017.GetISteamApps";
    case 89: return "SteamClient017.GetISteamNetworking";
    case 90: return "SteamClient017.GetISteamRemoteStorage";
    case 91: return "SteamClient017.GetISteamScreenshots";
    case 92: return "SteamClient017.RunFrame";
    case 93: return "SteamClient017.GetIPCCallCount";
    case 94: return "SteamClient017.BShutdownIfAllPipesClosed";
    case 95: return "SteamClient017.GetISteamHTTP";
    case 96: return "SteamClient017.DEPRECATED_GetISteamUnifiedMessages";
    case 97: return "SteamClient017.GetISteamController";
    case 98: return "SteamClient017.GetISteamUGC";
    case 99: return "SteamClient017.GetISteamAppList";
    case 100: return "SteamClient017.GetISteamMusic";
    case 101: return "SteamClient017.GetISteamMusicRemote";
    case 102: return "SteamClient017.GetISteamHTMLSurface";
    case 103: return "SteamClient017.GetISteamInventory";
    case 104: return "SteamClient017.GetISteamVideo";
    case 105: return "SteamClient017.GetISteamParentalSettings";
    case 106: return "SteamUser019.GetHSteamUser";
    case 107: return "SteamUser019.BLoggedOn";
    case 108: return "SteamUser019.GetSteamID";
    case 109: return "SteamFriends015.GetPersonaName";
    case 110: return "SteamFriends015.GetPersonaState";
    case 111: return "SteamUtils008.GetSecondsSinceAppActive";
    case 112: return "SteamUtils008.GetSecondsSinceComputerActive";
    case 113: return "SteamUtils008.GetConnectedUniverse";
    case 114: return "SteamUtils008.GetServerRealTime";
    case 115: return "SteamUtils008.GetIPCountry";
    case 116: return "SteamUtils008.GetCurrentBatteryPower";
    case 117: return "SteamUtils008.GetAppID";
    case 118: return "SteamUtils008.IsOverlayEnabled";
    case 119: return "SteamUtils008.GetSteamUILanguage";
    case 120: return "SteamUtils008.IsSteamRunningInVR";
    case 121: return "SteamUtils008.IsSteamInBigPictureMode";
    case 122: return "STEAMAPPS_INTERFACE_VERSION008.BIsSubscribed";
    case 123: return "STEAMAPPS_INTERFACE_VERSION008.BIsLowViolence";
    case 124: return "STEAMAPPS_INTERFACE_VERSION008.BIsCybercafe";
    case 125: return "STEAMAPPS_INTERFACE_VERSION008.BIsVACBanned";
    case 126: return "STEAMAPPS_INTERFACE_VERSION008.GetCurrentGameLanguage";
    case 127: return "STEAMAPPS_INTERFACE_VERSION008.GetAvailableGameLanguages";
    case 128: return "STEAMAPPS_INTERFACE_VERSION008.BIsSubscribedApp";
    case 129: return "STEAMAPPS_INTERFACE_VERSION008.BIsDlcInstalled";
    case 130: return "STEAMAPPS_INTERFACE_VERSION008.GetEarliestPurchaseUnixTime";
    case 131: return "STEAMAPPS_INTERFACE_VERSION008.BIsSubscribedFromFreeWeekend";
    case 132: return "STEAMAPPS_INTERFACE_VERSION008.GetDLCCount";
    case 133: return "STEAMAPPS_INTERFACE_VERSION008.BIsAppInstalled";
    case 134: return "STEAMAPPS_INTERFACE_VERSION008.GetAppOwner";
    case 135: return "STEAMAPPS_INTERFACE_VERSION008.GetAppBuildId";
    case 136: return "SteamClient014.CreateSteamPipe";
    case 137: return "SteamClient014.BReleaseSteamPipe";
    case 138: return "SteamClient014.ConnectToGlobalUser";
    case 139: return "SteamClient014.CreateLocalUser";
    case 140: return "SteamClient014.ReleaseUser";
    case 141: return "SteamClient014.GetISteamUser";
    case 142: return "SteamClient014.GetISteamGameServer";
    case 143: return "SteamClient014.GetISteamFriends";
    case 144: return "SteamClient014.GetISteamUtils";
    case 145: return "SteamClient014.GetISteamMatchmaking";
    case 146: return "SteamClient014.GetISteamMatchmakingServers";
    case 147: return "SteamClient014.GetISteamGenericInterface";
    case 148: return "SteamClient014.GetISteamUserStats";
    case 149: return "SteamClient014.GetISteamGameServerStats";
    case 150: return "SteamClient014.GetISteamApps";
    case 151: return "SteamClient014.GetISteamNetworking";
    case 152: return "SteamClient014.GetISteamRemoteStorage";
    case 153: return "SteamClient014.GetISteamScreenshots";
    case 154: return "SteamClient014.RunFrame";
    case 155: return "SteamClient014.GetIPCCallCount";
    case 156: return "SteamClient014.BShutdownIfAllPipesClosed";
    case 157: return "SteamClient014.GetISteamHTTP";
    case 158: return "SteamClient014.GetISteamUnifiedMessages";
    case 159: return "SteamClient014.GetISteamController";
    case 160: return "SteamClient014.GetISteamUGC";
    case 161: return "SteamClient014.GetISteamAppList";
    case 162: return "SteamClient014.GetISteamMusic";
    case 163: return "SteamClient020.CreateSteamPipe";
    case 164: return "SteamClient020.BReleaseSteamPipe";
    case 165: return "SteamClient020.ConnectToGlobalUser";
    case 166: return "SteamClient020.CreateLocalUser";
    case 167: return "SteamClient020.ReleaseUser";
    case 168: return "SteamClient020.GetISteamUser";
    case 169: return "SteamClient020.GetISteamGameServer";
    case 170: return "SteamClient020.GetISteamFriends";
    case 171: return "SteamClient020.GetISteamUtils";
    case 172: return "SteamClient020.GetISteamMatchmaking";
    case 173: return "SteamClient020.GetISteamMatchmakingServers";
    case 174: return "SteamClient020.GetISteamGenericInterface";
    case 175: return "SteamClient020.GetISteamUserStats";
    case 176: return "SteamClient020.GetISteamGameServerStats";
    case 177: return "SteamClient020.GetISteamApps";
    case 178: return "SteamClient020.GetISteamNetworking";
    case 179: return "SteamClient020.GetISteamRemoteStorage";
    case 180: return "SteamClient020.GetISteamScreenshots";
    case 181: return "SteamClient020.RunFrame";
    case 182: return "SteamClient020.GetIPCCallCount";
    case 183: return "SteamClient020.BShutdownIfAllPipesClosed";
    case 184: return "SteamClient020.GetISteamHTTP";
    case 185: return "SteamClient020.DEPRECATED_GetISteamUnifiedMessages";
    case 186: return "SteamClient020.GetISteamController";
    case 187: return "SteamClient020.GetISteamUGC";
    case 188: return "SteamClient020.GetISteamAppList";
    case 189: return "SteamClient020.GetISteamMusic";
    case 190: return "SteamClient020.GetISteamMusicRemote";
    case 191: return "SteamClient020.GetISteamHTMLSurface";
    case 192: return "SteamClient020.GetISteamInventory";
    case 193: return "SteamClient020.GetISteamVideo";
    case 194: return "SteamClient020.GetISteamParentalSettings";
    case 195: return "SteamClient021.CreateSteamPipe";
    case 196: return "SteamClient021.BReleaseSteamPipe";
    case 197: return "SteamClient021.ConnectToGlobalUser";
    case 198: return "SteamClient021.CreateLocalUser";
    case 199: return "SteamClient021.ReleaseUser";
    case 200: return "SteamClient021.GetISteamUser";
    case 201: return "SteamClient021.GetISteamGameServer";
    case 202: return "SteamClient021.GetISteamFriends";
    case 203: return "SteamClient021.GetISteamUtils";
    case 204: return "SteamClient021.GetISteamMatchmaking";
    case 205: return "SteamClient021.GetISteamMatchmakingServers";
    case 206: return "SteamClient021.GetISteamGenericInterface";
    case 207: return "SteamClient021.GetISteamUserStats";
    case 208: return "SteamClient021.GetISteamGameServerStats";
    case 209: return "SteamClient021.GetISteamApps";
    case 210: return "SteamClient021.GetISteamNetworking";
    case 211: return "SteamClient021.GetISteamRemoteStorage";
    case 212: return "SteamClient021.GetISteamScreenshots";
    case 213: return "SteamClient021.RunFrame";
    case 214: return "SteamClient021.GetIPCCallCount";
    case 215: return "SteamClient021.BShutdownIfAllPipesClosed";
    case 216: return "SteamClient021.GetISteamHTTP";
    case 217: return "SteamClient021.GetISteamController";
    case 218: return "SteamClient021.GetISteamUGC";
    case 219: return "SteamClient021.GetISteamMusic";
    case 220: return "SteamClient021.GetISteamMusicRemote";
    case 221: return "SteamClient021.GetISteamHTMLSurface";
    case 222: return "SteamClient021.GetISteamInventory";
    case 223: return "SteamClient021.GetISteamVideo";
    case 224: return "SteamClient021.GetISteamParentalSettings";
    case 225: return "SteamUser021.GetHSteamUser";
    case 226: return "SteamUser021.BLoggedOn";
    case 227: return "SteamUser021.GetSteamID";
    case 228: return "SteamUser021.GetAuthSessionTicket";
    case 229: return "SteamUser021.CancelAuthTicket";
    case 230: return "SteamFriends017.GetPersonaName";
    case 231: return "SteamFriends017.GetPersonaState";
    case 232: return "SteamUtils010.GetSecondsSinceAppActive";
    case 233: return "SteamUtils010.GetSecondsSinceComputerActive";
    case 234: return "SteamUtils010.GetConnectedUniverse";
    case 235: return "SteamUtils010.GetServerRealTime";
    case 236: return "SteamUtils010.GetIPCountry";
    case 237: return "SteamUtils010.GetCurrentBatteryPower";
    case 238: return "SteamUtils010.GetAppID";
    case 239: return "SteamUtils010.IsOverlayEnabled";
    case 240: return "SteamUtils010.GetSteamUILanguage";
    case 241: return "SteamUtils010.IsSteamRunningInVR";
    case 242: return "SteamUtils010.IsSteamInBigPictureMode";
    case 243: return "STEAMUSERSTATS_INTERFACE_VERSION012.GetStat_2";
    case 244: return "STEAMUSERSTATS_INTERFACE_VERSION012.GetStat";
    case 245: return "STEAMUSERSTATS_INTERFACE_VERSION012.SetStat_2";
    case 246: return "STEAMUSERSTATS_INTERFACE_VERSION012.SetStat";
    case 247: return "STEAMUSERSTATS_INTERFACE_VERSION012.UpdateAvgRateStat";
    case 248: return "STEAMUSERSTATS_INTERFACE_VERSION012.GetAchievement";
    case 249: return "STEAMUSERSTATS_INTERFACE_VERSION012.SetAchievement";
    case 250: return "STEAMUSERSTATS_INTERFACE_VERSION012.ClearAchievement";
    case 251: return "STEAMUSERSTATS_INTERFACE_VERSION012.GetAchievementAndUnlockTime";
    case 252: return "STEAMUSERSTATS_INTERFACE_VERSION012.StoreStats";
    case 253: return "STEAMUSERSTATS_INTERFACE_VERSION012.GetAchievementDisplayAttribute";
    case 254: return "STEAMUSERSTATS_INTERFACE_VERSION012.IndicateAchievementProgress";
    case 255: return "STEAMUSERSTATS_INTERFACE_VERSION012.GetNumAchievements";
    case 256: return "STEAMUSERSTATS_INTERFACE_VERSION012.GetAchievementName";
    case 257: return "STEAMUSERSTATS_INTERFACE_VERSION012.ResetAllStats";
    case 258: return "STEAMUSERSTATS_INTERFACE_VERSION013.GetStat_2";
    case 259: return "STEAMUSERSTATS_INTERFACE_VERSION013.GetStat";
    case 260: return "STEAMUSERSTATS_INTERFACE_VERSION013.SetStat_2";
    case 261: return "STEAMUSERSTATS_INTERFACE_VERSION013.SetStat";
    case 262: return "STEAMUSERSTATS_INTERFACE_VERSION013.UpdateAvgRateStat";
    case 263: return "STEAMUSERSTATS_INTERFACE_VERSION013.GetAchievement";
    case 264: return "STEAMUSERSTATS_INTERFACE_VERSION013.SetAchievement";
    case 265: return "STEAMUSERSTATS_INTERFACE_VERSION013.ClearAchievement";
    case 266: return "STEAMUSERSTATS_INTERFACE_VERSION013.GetAchievementAndUnlockTime";
    case 267: return "STEAMUSERSTATS_INTERFACE_VERSION013.StoreStats";
    case 268: return "STEAMUSERSTATS_INTERFACE_VERSION013.GetAchievementDisplayAttribute";
    case 269: return "STEAMUSERSTATS_INTERFACE_VERSION013.IndicateAchievementProgress";
    case 270: return "STEAMUSERSTATS_INTERFACE_VERSION013.GetNumAchievements";
    case 271: return "STEAMUSERSTATS_INTERFACE_VERSION013.GetAchievementName";
    case 272: return "STEAMUSERSTATS_INTERFACE_VERSION013.ResetAllStats";
    case 273: return "SteamUtils009.GetSecondsSinceAppActive";
    case 274: return "SteamUtils009.GetSecondsSinceComputerActive";
    case 275: return "SteamUtils009.GetConnectedUniverse";
    case 276: return "SteamUtils009.GetServerRealTime";
    case 277: return "SteamUtils009.GetIPCountry";
    case 278: return "SteamUtils009.GetCurrentBatteryPower";
    case 279: return "SteamUtils009.GetAppID";
    case 280: return "SteamUtils009.IsOverlayEnabled";
    case 281: return "SteamUtils009.GetSteamUILanguage";
    case 282: return "SteamUtils009.IsSteamRunningInVR";
    case 283: return "SteamUtils009.IsSteamInBigPictureMode";
    case 284: return "SteamUser018.GetHSteamUser";
    case 285: return "SteamUser018.BLoggedOn";
    case 286: return "SteamUser018.GetSteamID";
    case 287: return "SteamUser018.GetAuthSessionTicket";
    case 288: return "SteamUser018.CancelAuthTicket";
    case 289: return "SteamUtils007.GetSecondsSinceAppActive";
    case 290: return "SteamUtils007.GetSecondsSinceComputerActive";
    case 291: return "SteamUtils007.GetConnectedUniverse";
    case 292: return "SteamUtils007.GetServerRealTime";
    case 293: return "SteamUtils007.GetIPCountry";
    case 294: return "SteamUtils007.GetCurrentBatteryPower";
    case 295: return "SteamUtils007.GetAppID";
    case 296: return "SteamUtils007.IsOverlayEnabled";
    case 297: return "SteamUtils007.GetSteamUILanguage";
    case 298: return "SteamUtils007.IsSteamRunningInVR";
    case 299: return "STEAMAPPS_INTERFACE_VERSION007.BIsSubscribed";
    case 300: return "STEAMAPPS_INTERFACE_VERSION007.BIsLowViolence";
    case 301: return "STEAMAPPS_INTERFACE_VERSION007.BIsCybercafe";
    case 302: return "STEAMAPPS_INTERFACE_VERSION007.BIsVACBanned";
    case 303: return "STEAMAPPS_INTERFACE_VERSION007.GetCurrentGameLanguage";
    case 304: return "STEAMAPPS_INTERFACE_VERSION007.GetAvailableGameLanguages";
    case 305: return "STEAMAPPS_INTERFACE_VERSION007.BIsSubscribedApp";
    case 306: return "STEAMAPPS_INTERFACE_VERSION007.BIsDlcInstalled";
    case 307: return "STEAMAPPS_INTERFACE_VERSION007.GetEarliestPurchaseUnixTime";
    case 308: return "STEAMAPPS_INTERFACE_VERSION007.BIsSubscribedFromFreeWeekend";
    case 309: return "STEAMAPPS_INTERFACE_VERSION007.GetDLCCount";
    case 310: return "STEAMAPPS_INTERFACE_VERSION007.BIsAppInstalled";
    case 311: return "STEAMAPPS_INTERFACE_VERSION007.GetAppOwner";
    case 312: return "STEAMAPPS_INTERFACE_VERSION007.GetAppBuildId";
    default: return "";
  }
}

uint8_t bridge_dispatch(uint16_t ordinal, uint16_t slot, const uint8_t *arg, uint32_t argLen,
                         uint8_t *resp, uint32_t respCap, uint32_t *respLen) {
  (void)arg; (void)argLen;
  *respLen = 0;
  switch (((uint32_t)ordinal << 16) | (uint32_t)slot) {
    case (((uint32_t)1) << 16 | 0u): { // SteamUser023.GetHSteamUser
      if (g_bd_flat_SteamUser023_GetHSteamUser == NULL || g_bd_self_steamuser023 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_SteamUser023_GetHSteamUser(g_bd_self_steamuser023);
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
    case (((uint32_t)1) << 16 | 13u): { // SteamUser023.GetAuthSessionTicket
      if (g_bd_flat_SteamUser023_GetAuthSessionTicket == NULL || g_bd_self_steamuser023 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static uint8_t g_bd_flat_SteamUser023_GetAuthSessionTicket_pTicket_buf[BD_WIRE_OUT_BUFFER_MAX_BYTES];
      uint32_t cap_pTicket = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&cap_pTicket, arg + 0u, 4);
      if (cap_pTicket > BD_WIRE_OUT_BUFFER_MAX_BYTES) cap_pTicket = BD_WIRE_OUT_BUFFER_MAX_BYTES;
      if (respCap < 12) { *respLen = 0; return 1; }
      if (cap_pTicket > respCap - 12) cap_pTicket = (uint32_t)(respCap - 12); // response must fit the scratch
      memset(g_bd_flat_SteamUser023_GetAuthSessionTicket_pTicket_buf, 0, cap_pTicket); // no earlier call's bytes cross into the game (53-17 WR-04)
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_cbMaxTicket; memcpy(&arg_cbMaxTicket, arg + (0u + 4), 4);
      uint32_t arg_pcbTicket = 0;
      if ((int64_t)arg_cbMaxTicket < 0 || (int64_t)arg_cbMaxTicket > (int64_t)cap_pTicket) arg_cbMaxTicket = (int32_t)cap_pTicket;
      uint32_t __ret = g_bd_flat_SteamUser023_GetAuthSessionTicket(g_bd_self_steamuser023, g_bd_flat_SteamUser023_GetAuthSessionTicket_pTicket_buf, arg_cbMaxTicket, &arg_pcbTicket, NULL);
      if (respCap < 12) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pcbTicket, 4);
      uint32_t outLen_pTicket = cap_pTicket;
      if ((uint32_t)arg_pcbTicket < outLen_pTicket) outLen_pTicket = (uint32_t)arg_pcbTicket;
      memcpy(resp + 8, &outLen_pTicket, 4);
      memcpy(resp + 8 + 4, g_bd_flat_SteamUser023_GetAuthSessionTicket_pTicket_buf, outLen_pTicket);
      *respLen = 8 + 4 + outLen_pTicket;
      return 0;
    }
    case (((uint32_t)1) << 16 | 14u): { // SteamUser023.GetAuthTicketForWebApi
      if (g_bd_flat_SteamUser023_GetAuthTicketForWebApi == NULL || g_bd_self_steamuser023 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_SteamUser023_GetAuthTicketForWebApi_pchIdentity_buf[4096 + 1];
      const char *arg_pchIdentity = NULL;
      uint32_t arg_pchIdentity_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchIdentity_len, arg + 0u, 4);
      if (arg_pchIdentity_len != 0xFFFFFFFFu) {
        if (arg_pchIdentity_len > 4096 || argLen < 0u + 4 + arg_pchIdentity_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamUser023_GetAuthTicketForWebApi_pchIdentity_buf, arg + 0u + 4, arg_pchIdentity_len);
        g_bd_flat_SteamUser023_GetAuthTicketForWebApi_pchIdentity_buf[arg_pchIdentity_len] = '\0';
        arg_pchIdentity = g_bd_flat_SteamUser023_GetAuthTicketForWebApi_pchIdentity_buf;
      } else {
        arg_pchIdentity_len = 0;
      }
      uint32_t __ret = g_bd_flat_SteamUser023_GetAuthTicketForWebApi(g_bd_self_steamuser023, arg_pchIdentity);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)1) << 16 | 17u): { // SteamUser023.CancelAuthTicket
      if (g_bd_flat_SteamUser023_CancelAuthTicket == NULL || g_bd_self_steamuser023 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hAuthTicket; memcpy(&arg_hAuthTicket, arg + 0u, 4);
      g_bd_flat_SteamUser023_CancelAuthTicket(g_bd_self_steamuser023, arg_hAuthTicket);
      *respLen = 0; return 0;
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
    case (((uint32_t)2) << 16 | 1u): { // SteamFriends018.GetPersonaState
      if (g_bd_flat_SteamFriends018_GetPersonaState == NULL || g_bd_self_steamfriends018 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamFriends018_GetPersonaState(g_bd_self_steamfriends018);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)3) << 16 | 0u): { // SteamUser016.GetHSteamUser
      if (g_bd_flat_SteamUser016_GetHSteamUser == NULL || g_bd_self_steamuser016 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_SteamUser016_GetHSteamUser(g_bd_self_steamuser016);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)3) << 16 | 1u): { // SteamUser016.BLoggedOn
      if (g_bd_flat_SteamUser016_BLoggedOn == NULL || g_bd_self_steamuser016 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUser016_BLoggedOn(g_bd_self_steamuser016);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)3) << 16 | 2u): { // SteamUser016.GetSteamID
      if (g_bd_flat_SteamUser016_GetSteamID == NULL || g_bd_self_steamuser016 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint64_t __ret = g_bd_flat_SteamUser016_GetSteamID(g_bd_self_steamuser016);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 8);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)4) << 16 | 0u): { // SteamFriends011.GetPersonaName
      if (g_bd_flat_SteamFriends011_GetPersonaName == NULL || g_bd_self_steamfriends011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamFriends011_GetPersonaName(g_bd_self_steamfriends011);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)4) << 16 | 2u): { // SteamFriends011.GetPersonaState
      if (g_bd_flat_SteamFriends011_GetPersonaState == NULL || g_bd_self_steamfriends011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamFriends011_GetPersonaState(g_bd_self_steamfriends011);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)5) << 16 | 0u): { // SteamUtils005.GetSecondsSinceAppActive
      if (g_bd_flat_SteamUtils005_GetSecondsSinceAppActive == NULL || g_bd_self_steamutils005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils005_GetSecondsSinceAppActive(g_bd_self_steamutils005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)5) << 16 | 1u): { // SteamUtils005.GetSecondsSinceComputerActive
      if (g_bd_flat_SteamUtils005_GetSecondsSinceComputerActive == NULL || g_bd_self_steamutils005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils005_GetSecondsSinceComputerActive(g_bd_self_steamutils005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)5) << 16 | 2u): { // SteamUtils005.GetConnectedUniverse
      if (g_bd_flat_SteamUtils005_GetConnectedUniverse == NULL || g_bd_self_steamutils005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils005_GetConnectedUniverse(g_bd_self_steamutils005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)5) << 16 | 3u): { // SteamUtils005.GetServerRealTime
      if (g_bd_flat_SteamUtils005_GetServerRealTime == NULL || g_bd_self_steamutils005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils005_GetServerRealTime(g_bd_self_steamutils005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)5) << 16 | 4u): { // SteamUtils005.GetIPCountry
      if (g_bd_flat_SteamUtils005_GetIPCountry == NULL || g_bd_self_steamutils005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamUtils005_GetIPCountry(g_bd_self_steamutils005);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)5) << 16 | 8u): { // SteamUtils005.GetCurrentBatteryPower
      if (g_bd_flat_SteamUtils005_GetCurrentBatteryPower == NULL || g_bd_self_steamutils005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils005_GetCurrentBatteryPower(g_bd_self_steamutils005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)5) << 16 | 9u): { // SteamUtils005.GetAppID
      if (g_bd_identity_only) { // D-51-04: identity-only reports the launching game's real AppID, never 480
        uint32_t v = g_bd_report_appid;
        if (respCap < 4) { *respLen = 0; return 1; }
        memcpy(resp, &v, 4); *respLen = 4; return 0;
      }
      if (g_bd_flat_SteamUtils005_GetAppID == NULL || g_bd_self_steamutils005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils005_GetAppID(g_bd_self_steamutils005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)5) << 16 | 17u): { // SteamUtils005.IsOverlayEnabled
      if (g_bd_flat_SteamUtils005_IsOverlayEnabled == NULL || g_bd_self_steamutils005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUtils005_IsOverlayEnabled(g_bd_self_steamutils005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)6) << 16 | 0u): { // STEAMAPPS_INTERFACE_VERSION004.BIsSubscribed
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribed == NULL || g_bd_self_steamapps_interface_version004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribed(g_bd_self_steamapps_interface_version004);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)6) << 16 | 1u): { // STEAMAPPS_INTERFACE_VERSION004.BIsLowViolence
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsLowViolence == NULL || g_bd_self_steamapps_interface_version004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsLowViolence(g_bd_self_steamapps_interface_version004);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)6) << 16 | 2u): { // STEAMAPPS_INTERFACE_VERSION004.BIsCybercafe
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsCybercafe == NULL || g_bd_self_steamapps_interface_version004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsCybercafe(g_bd_self_steamapps_interface_version004);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)6) << 16 | 3u): { // STEAMAPPS_INTERFACE_VERSION004.BIsVACBanned
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsVACBanned == NULL || g_bd_self_steamapps_interface_version004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsVACBanned(g_bd_self_steamapps_interface_version004);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)6) << 16 | 4u): { // STEAMAPPS_INTERFACE_VERSION004.GetCurrentGameLanguage
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage == NULL || g_bd_self_steamapps_interface_version004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetCurrentGameLanguage(g_bd_self_steamapps_interface_version004);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)6) << 16 | 5u): { // STEAMAPPS_INTERFACE_VERSION004.GetAvailableGameLanguages
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages == NULL || g_bd_self_steamapps_interface_version004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetAvailableGameLanguages(g_bd_self_steamapps_interface_version004);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)6) << 16 | 6u): { // STEAMAPPS_INTERFACE_VERSION004.BIsSubscribedApp
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedApp == NULL || g_bd_self_steamapps_interface_version004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_appID; memcpy(&arg_appID, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedApp(g_bd_self_steamapps_interface_version004, arg_appID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)6) << 16 | 7u): { // STEAMAPPS_INTERFACE_VERSION004.BIsDlcInstalled
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsDlcInstalled == NULL || g_bd_self_steamapps_interface_version004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_appID; memcpy(&arg_appID, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsDlcInstalled(g_bd_self_steamapps_interface_version004, arg_appID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)6) << 16 | 8u): { // STEAMAPPS_INTERFACE_VERSION004.GetEarliestPurchaseUnixTime
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetEarliestPurchaseUnixTime == NULL || g_bd_self_steamapps_interface_version004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nAppID; memcpy(&arg_nAppID, arg + 0u, 4);
      uint32_t __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetEarliestPurchaseUnixTime(g_bd_self_steamapps_interface_version004, arg_nAppID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)6) << 16 | 9u): { // STEAMAPPS_INTERFACE_VERSION004.BIsSubscribedFromFreeWeekend
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedFromFreeWeekend == NULL || g_bd_self_steamapps_interface_version004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_BIsSubscribedFromFreeWeekend(g_bd_self_steamapps_interface_version004);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)6) << 16 | 10u): { // STEAMAPPS_INTERFACE_VERSION004.GetDLCCount
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetDLCCount == NULL || g_bd_self_steamapps_interface_version004 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION004_GetDLCCount(g_bd_self_steamapps_interface_version004);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)7) << 16 | 1u): { // STEAMUSERSTATS_INTERFACE_VERSION010.GetStat_2
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2 == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      float arg_pData = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_2(g_bd_self_steamuserstats_interface_version010, arg_pchName, &arg_pData);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pData, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)7) << 16 | 2u): { // STEAMUSERSTATS_INTERFACE_VERSION010.GetStat
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int32_t arg_pData = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetStat(g_bd_self_steamuserstats_interface_version010, arg_pchName, &arg_pData);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pData, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)7) << 16 | 3u): { // STEAMUSERSTATS_INTERFACE_VERSION010.SetStat_2
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2 == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_fData; memcpy(&arg_fData, arg + (0u + 4 + arg_pchName_len), 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_2(g_bd_self_steamuserstats_interface_version010, arg_pchName, arg_fData);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)7) << 16 | 4u): { // STEAMUSERSTATS_INTERFACE_VERSION010.SetStat
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_nData; memcpy(&arg_nData, arg + (0u + 4 + arg_pchName_len), 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetStat(g_bd_self_steamuserstats_interface_version010, arg_pchName, arg_nData);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)7) << 16 | 5u): { // STEAMUSERSTATS_INTERFACE_VERSION010.UpdateAvgRateStat
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_flCountThisSession; memcpy(&arg_flCountThisSession, arg + (0u + 4 + arg_pchName_len), 4);
      if (argLen < ((0u + 4 + arg_pchName_len) + 4) + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      double arg_dSessionLength; memcpy(&arg_dSessionLength, arg + ((0u + 4 + arg_pchName_len) + 4), 8);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_UpdateAvgRateStat(g_bd_self_steamuserstats_interface_version010, arg_pchName, arg_flCountThisSession, arg_dSessionLength);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)7) << 16 | 6u): { // STEAMUSERSTATS_INTERFACE_VERSION010.GetAchievement
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int arg_pbAchieved = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievement(g_bd_self_steamuserstats_interface_version010, arg_pchName, &arg_pbAchieved);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pbAchieved, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)7) << 16 | 7u): { // STEAMUSERSTATS_INTERFACE_VERSION010.SetAchievement
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_SetAchievement(g_bd_self_steamuserstats_interface_version010, arg_pchName);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)7) << 16 | 8u): { // STEAMUSERSTATS_INTERFACE_VERSION010.ClearAchievement
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_ClearAchievement(g_bd_self_steamuserstats_interface_version010, arg_pchName);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)7) << 16 | 9u): { // STEAMUSERSTATS_INTERFACE_VERSION010.GetAchievementAndUnlockTime
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int arg_pbAchieved = 0;
      uint32_t arg_punUnlockTime = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementAndUnlockTime(g_bd_self_steamuserstats_interface_version010, arg_pchName, &arg_pbAchieved, &arg_punUnlockTime);
      if (respCap < 12) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pbAchieved, 4);
      memcpy(resp + 8, &arg_punUnlockTime, 4);
      *respLen = 12;
      return 0;
    }
    case (((uint32_t)7) << 16 | 10u): { // STEAMUSERSTATS_INTERFACE_VERSION010.StoreStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_StoreStats == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_StoreStats(g_bd_self_steamuserstats_interface_version010);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)7) << 16 | 12u): { // STEAMUSERSTATS_INTERFACE_VERSION010.GetAchievementDisplayAttribute
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_pchKey_buf[4096 + 1];
      const char *arg_pchKey = NULL;
      uint32_t arg_pchKey_len = 0;
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchKey_len, arg + (0u + 4 + arg_pchName_len), 4);
      if (arg_pchKey_len != 0xFFFFFFFFu) {
        if (arg_pchKey_len > 4096 || argLen < (0u + 4 + arg_pchName_len) + 4 + arg_pchKey_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_pchKey_buf, arg + (0u + 4 + arg_pchName_len) + 4, arg_pchKey_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_pchKey_buf[arg_pchKey_len] = '\0';
        arg_pchKey = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute_pchKey_buf;
      } else {
        arg_pchKey_len = 0;
      }
      const char *result = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_GetAchievementDisplayAttribute(g_bd_self_steamuserstats_interface_version010, arg_pchName, arg_pchKey);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)7) << 16 | 13u): { // STEAMUSERSTATS_INTERFACE_VERSION010.IndicateAchievementProgress
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nCurProgress; memcpy(&arg_nCurProgress, arg + (0u + 4 + arg_pchName_len), 4);
      if (argLen < ((0u + 4 + arg_pchName_len) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nMaxProgress; memcpy(&arg_nMaxProgress, arg + ((0u + 4 + arg_pchName_len) + 4), 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_IndicateAchievementProgress(g_bd_self_steamuserstats_interface_version010, arg_pchName, arg_nCurProgress, arg_nMaxProgress);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)7) << 16 | 19u): { // STEAMUSERSTATS_INTERFACE_VERSION010.ResetAllStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_ResetAllStats == NULL || g_bd_self_steamuserstats_interface_version010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int arg_bAchievementsToo; memcpy(&arg_bAchievementsToo, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION010_ResetAllStats(g_bd_self_steamuserstats_interface_version010, arg_bAchievementsToo);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)8) << 16 | 0u): { // SteamFriends013.GetPersonaName
      if (g_bd_flat_SteamFriends013_GetPersonaName == NULL || g_bd_self_steamfriends013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamFriends013_GetPersonaName(g_bd_self_steamfriends013);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)8) << 16 | 2u): { // SteamFriends013.GetPersonaState
      if (g_bd_flat_SteamFriends013_GetPersonaState == NULL || g_bd_self_steamfriends013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamFriends013_GetPersonaState(g_bd_self_steamfriends013);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)9) << 16 | 0u): { // STEAMAPPS_INTERFACE_VERSION005.BIsSubscribed
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribed == NULL || g_bd_self_steamapps_interface_version005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribed(g_bd_self_steamapps_interface_version005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)9) << 16 | 1u): { // STEAMAPPS_INTERFACE_VERSION005.BIsLowViolence
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsLowViolence == NULL || g_bd_self_steamapps_interface_version005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsLowViolence(g_bd_self_steamapps_interface_version005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)9) << 16 | 2u): { // STEAMAPPS_INTERFACE_VERSION005.BIsCybercafe
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsCybercafe == NULL || g_bd_self_steamapps_interface_version005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsCybercafe(g_bd_self_steamapps_interface_version005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)9) << 16 | 3u): { // STEAMAPPS_INTERFACE_VERSION005.BIsVACBanned
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsVACBanned == NULL || g_bd_self_steamapps_interface_version005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsVACBanned(g_bd_self_steamapps_interface_version005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)9) << 16 | 4u): { // STEAMAPPS_INTERFACE_VERSION005.GetCurrentGameLanguage
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage == NULL || g_bd_self_steamapps_interface_version005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetCurrentGameLanguage(g_bd_self_steamapps_interface_version005);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)9) << 16 | 5u): { // STEAMAPPS_INTERFACE_VERSION005.GetAvailableGameLanguages
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages == NULL || g_bd_self_steamapps_interface_version005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetAvailableGameLanguages(g_bd_self_steamapps_interface_version005);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)9) << 16 | 6u): { // STEAMAPPS_INTERFACE_VERSION005.BIsSubscribedApp
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedApp == NULL || g_bd_self_steamapps_interface_version005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_appID; memcpy(&arg_appID, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedApp(g_bd_self_steamapps_interface_version005, arg_appID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)9) << 16 | 7u): { // STEAMAPPS_INTERFACE_VERSION005.BIsDlcInstalled
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsDlcInstalled == NULL || g_bd_self_steamapps_interface_version005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_appID; memcpy(&arg_appID, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsDlcInstalled(g_bd_self_steamapps_interface_version005, arg_appID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)9) << 16 | 8u): { // STEAMAPPS_INTERFACE_VERSION005.GetEarliestPurchaseUnixTime
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetEarliestPurchaseUnixTime == NULL || g_bd_self_steamapps_interface_version005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nAppID; memcpy(&arg_nAppID, arg + 0u, 4);
      uint32_t __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetEarliestPurchaseUnixTime(g_bd_self_steamapps_interface_version005, arg_nAppID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)9) << 16 | 9u): { // STEAMAPPS_INTERFACE_VERSION005.BIsSubscribedFromFreeWeekend
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedFromFreeWeekend == NULL || g_bd_self_steamapps_interface_version005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsSubscribedFromFreeWeekend(g_bd_self_steamapps_interface_version005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)9) << 16 | 10u): { // STEAMAPPS_INTERFACE_VERSION005.GetDLCCount
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetDLCCount == NULL || g_bd_self_steamapps_interface_version005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_GetDLCCount(g_bd_self_steamapps_interface_version005);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)9) << 16 | 19u): { // STEAMAPPS_INTERFACE_VERSION005.BIsAppInstalled
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsAppInstalled == NULL || g_bd_self_steamapps_interface_version005 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_appID; memcpy(&arg_appID, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION005_BIsAppInstalled(g_bd_self_steamapps_interface_version005, arg_appID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)10) << 16 | 1u): { // STEAMUSERSTATS_INTERFACE_VERSION011.GetStat_2
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2 == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      float arg_pData = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_2(g_bd_self_steamuserstats_interface_version011, arg_pchName, &arg_pData);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pData, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)10) << 16 | 2u): { // STEAMUSERSTATS_INTERFACE_VERSION011.GetStat
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int32_t arg_pData = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetStat(g_bd_self_steamuserstats_interface_version011, arg_pchName, &arg_pData);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pData, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)10) << 16 | 3u): { // STEAMUSERSTATS_INTERFACE_VERSION011.SetStat_2
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2 == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_fData; memcpy(&arg_fData, arg + (0u + 4 + arg_pchName_len), 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_2(g_bd_self_steamuserstats_interface_version011, arg_pchName, arg_fData);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)10) << 16 | 4u): { // STEAMUSERSTATS_INTERFACE_VERSION011.SetStat
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_nData; memcpy(&arg_nData, arg + (0u + 4 + arg_pchName_len), 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetStat(g_bd_self_steamuserstats_interface_version011, arg_pchName, arg_nData);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)10) << 16 | 5u): { // STEAMUSERSTATS_INTERFACE_VERSION011.UpdateAvgRateStat
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_flCountThisSession; memcpy(&arg_flCountThisSession, arg + (0u + 4 + arg_pchName_len), 4);
      if (argLen < ((0u + 4 + arg_pchName_len) + 4) + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      double arg_dSessionLength; memcpy(&arg_dSessionLength, arg + ((0u + 4 + arg_pchName_len) + 4), 8);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_UpdateAvgRateStat(g_bd_self_steamuserstats_interface_version011, arg_pchName, arg_flCountThisSession, arg_dSessionLength);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)10) << 16 | 6u): { // STEAMUSERSTATS_INTERFACE_VERSION011.GetAchievement
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int arg_pbAchieved = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievement(g_bd_self_steamuserstats_interface_version011, arg_pchName, &arg_pbAchieved);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pbAchieved, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)10) << 16 | 7u): { // STEAMUSERSTATS_INTERFACE_VERSION011.SetAchievement
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_SetAchievement(g_bd_self_steamuserstats_interface_version011, arg_pchName);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)10) << 16 | 8u): { // STEAMUSERSTATS_INTERFACE_VERSION011.ClearAchievement
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_ClearAchievement(g_bd_self_steamuserstats_interface_version011, arg_pchName);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)10) << 16 | 9u): { // STEAMUSERSTATS_INTERFACE_VERSION011.GetAchievementAndUnlockTime
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int arg_pbAchieved = 0;
      uint32_t arg_punUnlockTime = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementAndUnlockTime(g_bd_self_steamuserstats_interface_version011, arg_pchName, &arg_pbAchieved, &arg_punUnlockTime);
      if (respCap < 12) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pbAchieved, 4);
      memcpy(resp + 8, &arg_punUnlockTime, 4);
      *respLen = 12;
      return 0;
    }
    case (((uint32_t)10) << 16 | 10u): { // STEAMUSERSTATS_INTERFACE_VERSION011.StoreStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_StoreStats == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_StoreStats(g_bd_self_steamuserstats_interface_version011);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)10) << 16 | 12u): { // STEAMUSERSTATS_INTERFACE_VERSION011.GetAchievementDisplayAttribute
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_pchKey_buf[4096 + 1];
      const char *arg_pchKey = NULL;
      uint32_t arg_pchKey_len = 0;
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchKey_len, arg + (0u + 4 + arg_pchName_len), 4);
      if (arg_pchKey_len != 0xFFFFFFFFu) {
        if (arg_pchKey_len > 4096 || argLen < (0u + 4 + arg_pchName_len) + 4 + arg_pchKey_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_pchKey_buf, arg + (0u + 4 + arg_pchName_len) + 4, arg_pchKey_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_pchKey_buf[arg_pchKey_len] = '\0';
        arg_pchKey = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute_pchKey_buf;
      } else {
        arg_pchKey_len = 0;
      }
      const char *result = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementDisplayAttribute(g_bd_self_steamuserstats_interface_version011, arg_pchName, arg_pchKey);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)10) << 16 | 13u): { // STEAMUSERSTATS_INTERFACE_VERSION011.IndicateAchievementProgress
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nCurProgress; memcpy(&arg_nCurProgress, arg + (0u + 4 + arg_pchName_len), 4);
      if (argLen < ((0u + 4 + arg_pchName_len) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nMaxProgress; memcpy(&arg_nMaxProgress, arg + ((0u + 4 + arg_pchName_len) + 4), 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_IndicateAchievementProgress(g_bd_self_steamuserstats_interface_version011, arg_pchName, arg_nCurProgress, arg_nMaxProgress);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)10) << 16 | 14u): { // STEAMUSERSTATS_INTERFACE_VERSION011.GetNumAchievements
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetNumAchievements == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetNumAchievements(g_bd_self_steamuserstats_interface_version011);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)10) << 16 | 15u): { // STEAMUSERSTATS_INTERFACE_VERSION011.GetAchievementName
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_iAchievement; memcpy(&arg_iAchievement, arg + 0u, 4);
      const char *result = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_GetAchievementName(g_bd_self_steamuserstats_interface_version011, arg_iAchievement);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)10) << 16 | 21u): { // STEAMUSERSTATS_INTERFACE_VERSION011.ResetAllStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_ResetAllStats == NULL || g_bd_self_steamuserstats_interface_version011 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int arg_bAchievementsToo; memcpy(&arg_bAchievementsToo, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION011_ResetAllStats(g_bd_self_steamuserstats_interface_version011, arg_bAchievementsToo);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 0u): { // SteamClient017.CreateSteamPipe
      if (g_bd_flat_SteamClient017_CreateSteamPipe == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.CreateSteamPipe unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_SteamClient017_CreateSteamPipe(g_bd_self_steamclient017);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.CreateSteamPipe -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 1u): { // SteamClient017.BReleaseSteamPipe
      if (g_bd_flat_SteamClient017_BReleaseSteamPipe == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.BReleaseSteamPipe unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      int __ret = g_bd_flat_SteamClient017_BReleaseSteamPipe(g_bd_self_steamclient017, arg_hSteamPipe);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.BReleaseSteamPipe -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 2u): { // SteamClient017.ConnectToGlobalUser
      if (g_bd_flat_SteamClient017_ConnectToGlobalUser == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.ConnectToGlobalUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      int32_t __ret = g_bd_flat_SteamClient017_ConnectToGlobalUser(g_bd_self_steamclient017, arg_hSteamPipe);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.ConnectToGlobalUser -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 3u): { // SteamClient017.CreateLocalUser
      if (g_bd_flat_SteamClient017_CreateLocalUser == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.CreateLocalUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t arg_phSteamPipe = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_eAccountType; memcpy(&arg_eAccountType, arg + 0u, 4);
      int32_t __ret = g_bd_flat_SteamClient017_CreateLocalUser(g_bd_self_steamclient017, &arg_phSteamPipe, arg_eAccountType);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.CreateLocalUser -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_phSteamPipe, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)16) << 16 | 4u): { // SteamClient017.ReleaseUser
      if (g_bd_flat_SteamClient017_ReleaseUser == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.ReleaseUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hUser; memcpy(&arg_hUser, arg + (0u + 4), 4);
      g_bd_flat_SteamClient017_ReleaseUser(g_bd_self_steamclient017, arg_hSteamPipe, arg_hUser);
      logts("FWD", "SteamClient017.ReleaseUser " "called");
      *respLen = 0; return 0;
    }
    case (((uint32_t)16) << 16 | 5u): { // SteamClient017.GetISteamUser
      if (g_bd_flat_SteamClient017_GetISteamUser == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamUser_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamUser_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamUser_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamUser_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamUser(g_bd_self_steamclient017, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamUser ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 6u): { // SteamClient017.GetISteamGameServer
      if (g_bd_flat_SteamClient017_GetISteamGameServer == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamGameServer unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamGameServer_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamGameServer_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamGameServer_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamGameServer_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamGameServer(g_bd_self_steamclient017, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamGameServer ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 8u): { // SteamClient017.GetISteamFriends
      if (g_bd_flat_SteamClient017_GetISteamFriends == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamFriends unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamFriends_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamFriends_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamFriends_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamFriends_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamFriends(g_bd_self_steamclient017, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamFriends ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 9u): { // SteamClient017.GetISteamUtils
      if (g_bd_flat_SteamClient017_GetISteamUtils == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamUtils unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      static char g_bd_flat_SteamClient017_GetISteamUtils_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + (0u + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < (0u + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamUtils_pchVersion_buf, arg + (0u + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamUtils_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamUtils_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamUtils(g_bd_self_steamclient017, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamUtils ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 10u): { // SteamClient017.GetISteamMatchmaking
      if (g_bd_flat_SteamClient017_GetISteamMatchmaking == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamMatchmaking unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamMatchmaking_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamMatchmaking_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamMatchmaking_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamMatchmaking_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamMatchmaking(g_bd_self_steamclient017, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamMatchmaking ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 11u): { // SteamClient017.GetISteamMatchmakingServers
      if (g_bd_flat_SteamClient017_GetISteamMatchmakingServers == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamMatchmakingServers unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamMatchmakingServers_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamMatchmakingServers_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamMatchmakingServers_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamMatchmakingServers_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamMatchmakingServers(g_bd_self_steamclient017, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamMatchmakingServers ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 12u): { // SteamClient017.GetISteamGenericInterface
      if (g_bd_flat_SteamClient017_GetISteamGenericInterface == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamGenericInterface unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamGenericInterface_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamGenericInterface_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamGenericInterface_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamGenericInterface_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamGenericInterface(g_bd_self_steamclient017, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamGenericInterface ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 13u): { // SteamClient017.GetISteamUserStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too
      if (g_bd_flat_SteamClient017_GetISteamUserStats == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamUserStats unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamUserStats_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamUserStats_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamUserStats_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamUserStats_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamUserStats(g_bd_self_steamclient017, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamUserStats ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 14u): { // SteamClient017.GetISteamGameServerStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too
      if (g_bd_flat_SteamClient017_GetISteamGameServerStats == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamGameServerStats unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamGameServerStats_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamGameServerStats_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamGameServerStats_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamGameServerStats_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamGameServerStats(g_bd_self_steamclient017, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamGameServerStats ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 15u): { // SteamClient017.GetISteamApps
      if (g_bd_flat_SteamClient017_GetISteamApps == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamApps unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamApps_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamApps_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamApps_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamApps_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamApps(g_bd_self_steamclient017, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamApps ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 16u): { // SteamClient017.GetISteamNetworking
      if (g_bd_flat_SteamClient017_GetISteamNetworking == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamNetworking unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamNetworking_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamNetworking_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamNetworking_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamNetworking_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamNetworking(g_bd_self_steamclient017, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamNetworking ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 17u): { // SteamClient017.GetISteamRemoteStorage
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too
      if (g_bd_flat_SteamClient017_GetISteamRemoteStorage == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamRemoteStorage unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamRemoteStorage_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamRemoteStorage_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamRemoteStorage_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamRemoteStorage_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamRemoteStorage(g_bd_self_steamclient017, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamRemoteStorage ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 18u): { // SteamClient017.GetISteamScreenshots
      if (g_bd_flat_SteamClient017_GetISteamScreenshots == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamScreenshots unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamScreenshots_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamScreenshots_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamScreenshots_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamScreenshots_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamScreenshots(g_bd_self_steamclient017, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamScreenshots ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 19u): { // SteamClient017.RunFrame
      if (g_bd_flat_SteamClient017_RunFrame == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.RunFrame unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      g_bd_flat_SteamClient017_RunFrame(g_bd_self_steamclient017);
      logts("FWD", "SteamClient017.RunFrame " "called");
      *respLen = 0; return 0;
    }
    case (((uint32_t)16) << 16 | 20u): { // SteamClient017.GetIPCCallCount
      if (g_bd_flat_SteamClient017_GetIPCCallCount == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetIPCCallCount unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamClient017_GetIPCCallCount(g_bd_self_steamclient017);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetIPCCallCount -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 22u): { // SteamClient017.BShutdownIfAllPipesClosed
      if (g_bd_flat_SteamClient017_BShutdownIfAllPipesClosed == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.BShutdownIfAllPipesClosed unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamClient017_BShutdownIfAllPipesClosed(g_bd_self_steamclient017);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.BShutdownIfAllPipesClosed -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 23u): { // SteamClient017.GetISteamHTTP
      if (g_bd_flat_SteamClient017_GetISteamHTTP == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamHTTP unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamHTTP_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamHTTP_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamHTTP_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamHTTP_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamHTTP(g_bd_self_steamclient017, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamHTTP ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 24u): { // SteamClient017.DEPRECATED_GetISteamUnifiedMessages
      if (g_bd_flat_SteamClient017_DEPRECATED_GetISteamUnifiedMessages == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.DEPRECATED_GetISteamUnifiedMessages unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_DEPRECATED_GetISteamUnifiedMessages_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_DEPRECATED_GetISteamUnifiedMessages_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_DEPRECATED_GetISteamUnifiedMessages_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_DEPRECATED_GetISteamUnifiedMessages_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_DEPRECATED_GetISteamUnifiedMessages(g_bd_self_steamclient017, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.DEPRECATED_GetISteamUnifiedMessages ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 25u): { // SteamClient017.GetISteamController
      if (g_bd_flat_SteamClient017_GetISteamController == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamController unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamController_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamController_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamController_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamController_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamController(g_bd_self_steamclient017, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamController ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 26u): { // SteamClient017.GetISteamUGC
      if (g_bd_flat_SteamClient017_GetISteamUGC == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamUGC unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamUGC_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamUGC_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamUGC_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamUGC_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamUGC(g_bd_self_steamclient017, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamUGC ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 27u): { // SteamClient017.GetISteamAppList
      if (g_bd_flat_SteamClient017_GetISteamAppList == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamAppList unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamAppList_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamAppList_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamAppList_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamAppList_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamAppList(g_bd_self_steamclient017, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamAppList ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 28u): { // SteamClient017.GetISteamMusic
      if (g_bd_flat_SteamClient017_GetISteamMusic == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamMusic unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamMusic_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamMusic_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamMusic_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamMusic_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamMusic(g_bd_self_steamclient017, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamMusic ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 29u): { // SteamClient017.GetISteamMusicRemote
      if (g_bd_flat_SteamClient017_GetISteamMusicRemote == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamMusicRemote unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamMusicRemote_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamMusicRemote_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamMusicRemote_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamMusicRemote_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamMusicRemote(g_bd_self_steamclient017, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamMusicRemote ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 30u): { // SteamClient017.GetISteamHTMLSurface
      if (g_bd_flat_SteamClient017_GetISteamHTMLSurface == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamHTMLSurface unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamHTMLSurface_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamHTMLSurface_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamHTMLSurface_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamHTMLSurface_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamHTMLSurface(g_bd_self_steamclient017, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamHTMLSurface ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 34u): { // SteamClient017.GetISteamInventory
      if (g_bd_flat_SteamClient017_GetISteamInventory == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamInventory unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamInventory_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamInventory_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamInventory_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamInventory_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamInventory(g_bd_self_steamclient017, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamInventory ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 35u): { // SteamClient017.GetISteamVideo
      if (g_bd_flat_SteamClient017_GetISteamVideo == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamVideo unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamVideo_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamVideo_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamVideo_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamVideo_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamVideo(g_bd_self_steamclient017, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamVideo ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)16) << 16 | 36u): { // SteamClient017.GetISteamParentalSettings
      if (g_bd_flat_SteamClient017_GetISteamParentalSettings == NULL || g_bd_self_steamclient017 == NULL) { logts("FWD", "SteamClient017.GetISteamParentalSettings unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient017_GetISteamParentalSettings_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient017_GetISteamParentalSettings_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient017_GetISteamParentalSettings_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient017_GetISteamParentalSettings_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient017_GetISteamParentalSettings(g_bd_self_steamclient017, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient017.GetISteamParentalSettings ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)17) << 16 | 0u): { // SteamUser019.GetHSteamUser
      if (g_bd_flat_SteamUser019_GetHSteamUser == NULL || g_bd_self_steamuser019 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_SteamUser019_GetHSteamUser(g_bd_self_steamuser019);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)17) << 16 | 1u): { // SteamUser019.BLoggedOn
      if (g_bd_flat_SteamUser019_BLoggedOn == NULL || g_bd_self_steamuser019 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUser019_BLoggedOn(g_bd_self_steamuser019);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)17) << 16 | 2u): { // SteamUser019.GetSteamID
      if (g_bd_flat_SteamUser019_GetSteamID == NULL || g_bd_self_steamuser019 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint64_t __ret = g_bd_flat_SteamUser019_GetSteamID(g_bd_self_steamuser019);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 8);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)18) << 16 | 0u): { // SteamFriends015.GetPersonaName
      if (g_bd_flat_SteamFriends015_GetPersonaName == NULL || g_bd_self_steamfriends015 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamFriends015_GetPersonaName(g_bd_self_steamfriends015);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)18) << 16 | 2u): { // SteamFriends015.GetPersonaState
      if (g_bd_flat_SteamFriends015_GetPersonaState == NULL || g_bd_self_steamfriends015 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamFriends015_GetPersonaState(g_bd_self_steamfriends015);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)19) << 16 | 0u): { // SteamUtils008.GetSecondsSinceAppActive
      if (g_bd_flat_SteamUtils008_GetSecondsSinceAppActive == NULL || g_bd_self_steamutils008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils008_GetSecondsSinceAppActive(g_bd_self_steamutils008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)19) << 16 | 1u): { // SteamUtils008.GetSecondsSinceComputerActive
      if (g_bd_flat_SteamUtils008_GetSecondsSinceComputerActive == NULL || g_bd_self_steamutils008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils008_GetSecondsSinceComputerActive(g_bd_self_steamutils008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)19) << 16 | 2u): { // SteamUtils008.GetConnectedUniverse
      if (g_bd_flat_SteamUtils008_GetConnectedUniverse == NULL || g_bd_self_steamutils008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils008_GetConnectedUniverse(g_bd_self_steamutils008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)19) << 16 | 3u): { // SteamUtils008.GetServerRealTime
      if (g_bd_flat_SteamUtils008_GetServerRealTime == NULL || g_bd_self_steamutils008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils008_GetServerRealTime(g_bd_self_steamutils008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)19) << 16 | 4u): { // SteamUtils008.GetIPCountry
      if (g_bd_flat_SteamUtils008_GetIPCountry == NULL || g_bd_self_steamutils008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamUtils008_GetIPCountry(g_bd_self_steamutils008);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)19) << 16 | 8u): { // SteamUtils008.GetCurrentBatteryPower
      if (g_bd_flat_SteamUtils008_GetCurrentBatteryPower == NULL || g_bd_self_steamutils008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils008_GetCurrentBatteryPower(g_bd_self_steamutils008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)19) << 16 | 9u): { // SteamUtils008.GetAppID
      if (g_bd_identity_only) { // D-51-04: identity-only reports the launching game's real AppID, never 480
        uint32_t v = g_bd_report_appid;
        if (respCap < 4) { *respLen = 0; return 1; }
        memcpy(resp, &v, 4); *respLen = 4; return 0;
      }
      if (g_bd_flat_SteamUtils008_GetAppID == NULL || g_bd_self_steamutils008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils008_GetAppID(g_bd_self_steamutils008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)19) << 16 | 17u): { // SteamUtils008.IsOverlayEnabled
      if (g_bd_flat_SteamUtils008_IsOverlayEnabled == NULL || g_bd_self_steamutils008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUtils008_IsOverlayEnabled(g_bd_self_steamutils008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)19) << 16 | 23u): { // SteamUtils008.GetSteamUILanguage
      if (g_bd_flat_SteamUtils008_GetSteamUILanguage == NULL || g_bd_self_steamutils008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamUtils008_GetSteamUILanguage(g_bd_self_steamutils008);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)19) << 16 | 24u): { // SteamUtils008.IsSteamRunningInVR
      if (g_bd_flat_SteamUtils008_IsSteamRunningInVR == NULL || g_bd_self_steamutils008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUtils008_IsSteamRunningInVR(g_bd_self_steamutils008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)19) << 16 | 26u): { // SteamUtils008.IsSteamInBigPictureMode
      if (g_bd_flat_SteamUtils008_IsSteamInBigPictureMode == NULL || g_bd_self_steamutils008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUtils008_IsSteamInBigPictureMode(g_bd_self_steamutils008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)20) << 16 | 0u): { // STEAMAPPS_INTERFACE_VERSION008.BIsSubscribed
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribed == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribed(g_bd_self_steamapps_interface_version008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)20) << 16 | 1u): { // STEAMAPPS_INTERFACE_VERSION008.BIsLowViolence
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsLowViolence == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsLowViolence(g_bd_self_steamapps_interface_version008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)20) << 16 | 2u): { // STEAMAPPS_INTERFACE_VERSION008.BIsCybercafe
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsCybercafe == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsCybercafe(g_bd_self_steamapps_interface_version008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)20) << 16 | 3u): { // STEAMAPPS_INTERFACE_VERSION008.BIsVACBanned
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsVACBanned == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsVACBanned(g_bd_self_steamapps_interface_version008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)20) << 16 | 4u): { // STEAMAPPS_INTERFACE_VERSION008.GetCurrentGameLanguage
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetCurrentGameLanguage == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetCurrentGameLanguage(g_bd_self_steamapps_interface_version008);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)20) << 16 | 5u): { // STEAMAPPS_INTERFACE_VERSION008.GetAvailableGameLanguages
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetAvailableGameLanguages == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetAvailableGameLanguages(g_bd_self_steamapps_interface_version008);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)20) << 16 | 6u): { // STEAMAPPS_INTERFACE_VERSION008.BIsSubscribedApp
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedApp == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_appID; memcpy(&arg_appID, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedApp(g_bd_self_steamapps_interface_version008, arg_appID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)20) << 16 | 7u): { // STEAMAPPS_INTERFACE_VERSION008.BIsDlcInstalled
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsDlcInstalled == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_appID; memcpy(&arg_appID, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsDlcInstalled(g_bd_self_steamapps_interface_version008, arg_appID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)20) << 16 | 8u): { // STEAMAPPS_INTERFACE_VERSION008.GetEarliestPurchaseUnixTime
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetEarliestPurchaseUnixTime == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nAppID; memcpy(&arg_nAppID, arg + 0u, 4);
      uint32_t __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetEarliestPurchaseUnixTime(g_bd_self_steamapps_interface_version008, arg_nAppID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)20) << 16 | 9u): { // STEAMAPPS_INTERFACE_VERSION008.BIsSubscribedFromFreeWeekend
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedFromFreeWeekend == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsSubscribedFromFreeWeekend(g_bd_self_steamapps_interface_version008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)20) << 16 | 10u): { // STEAMAPPS_INTERFACE_VERSION008.GetDLCCount
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetDLCCount == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetDLCCount(g_bd_self_steamapps_interface_version008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)20) << 16 | 19u): { // STEAMAPPS_INTERFACE_VERSION008.BIsAppInstalled
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsAppInstalled == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_appID; memcpy(&arg_appID, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_BIsAppInstalled(g_bd_self_steamapps_interface_version008, arg_appID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)20) << 16 | 20u): { // STEAMAPPS_INTERFACE_VERSION008.GetAppOwner
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetAppOwner == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint64_t __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetAppOwner(g_bd_self_steamapps_interface_version008);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 8);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)20) << 16 | 23u): { // STEAMAPPS_INTERFACE_VERSION008.GetAppBuildId
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetAppBuildId == NULL || g_bd_self_steamapps_interface_version008 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION008_GetAppBuildId(g_bd_self_steamapps_interface_version008);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 0u): { // SteamClient014.CreateSteamPipe
      if (g_bd_flat_SteamClient014_CreateSteamPipe == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.CreateSteamPipe unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_SteamClient014_CreateSteamPipe(g_bd_self_steamclient014);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.CreateSteamPipe -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 1u): { // SteamClient014.BReleaseSteamPipe
      if (g_bd_flat_SteamClient014_BReleaseSteamPipe == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.BReleaseSteamPipe unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      int __ret = g_bd_flat_SteamClient014_BReleaseSteamPipe(g_bd_self_steamclient014, arg_hSteamPipe);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.BReleaseSteamPipe -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 2u): { // SteamClient014.ConnectToGlobalUser
      if (g_bd_flat_SteamClient014_ConnectToGlobalUser == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.ConnectToGlobalUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      int32_t __ret = g_bd_flat_SteamClient014_ConnectToGlobalUser(g_bd_self_steamclient014, arg_hSteamPipe);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.ConnectToGlobalUser -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 3u): { // SteamClient014.CreateLocalUser
      if (g_bd_flat_SteamClient014_CreateLocalUser == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.CreateLocalUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t arg_phSteamPipe = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_eAccountType; memcpy(&arg_eAccountType, arg + 0u, 4);
      int32_t __ret = g_bd_flat_SteamClient014_CreateLocalUser(g_bd_self_steamclient014, &arg_phSteamPipe, arg_eAccountType);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.CreateLocalUser -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_phSteamPipe, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)22) << 16 | 4u): { // SteamClient014.ReleaseUser
      if (g_bd_flat_SteamClient014_ReleaseUser == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.ReleaseUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hUser; memcpy(&arg_hUser, arg + (0u + 4), 4);
      g_bd_flat_SteamClient014_ReleaseUser(g_bd_self_steamclient014, arg_hSteamPipe, arg_hUser);
      logts("FWD", "SteamClient014.ReleaseUser " "called");
      *respLen = 0; return 0;
    }
    case (((uint32_t)22) << 16 | 5u): { // SteamClient014.GetISteamUser
      if (g_bd_flat_SteamClient014_GetISteamUser == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamUser_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamUser_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamUser_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamUser_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamUser(g_bd_self_steamclient014, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamUser ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 6u): { // SteamClient014.GetISteamGameServer
      if (g_bd_flat_SteamClient014_GetISteamGameServer == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamGameServer unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamGameServer_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamGameServer_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamGameServer_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamGameServer_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamGameServer(g_bd_self_steamclient014, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamGameServer ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 8u): { // SteamClient014.GetISteamFriends
      if (g_bd_flat_SteamClient014_GetISteamFriends == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamFriends unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamFriends_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamFriends_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamFriends_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamFriends_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamFriends(g_bd_self_steamclient014, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamFriends ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 9u): { // SteamClient014.GetISteamUtils
      if (g_bd_flat_SteamClient014_GetISteamUtils == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamUtils unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      static char g_bd_flat_SteamClient014_GetISteamUtils_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + (0u + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < (0u + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamUtils_pchVersion_buf, arg + (0u + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamUtils_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamUtils_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamUtils(g_bd_self_steamclient014, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamUtils ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 10u): { // SteamClient014.GetISteamMatchmaking
      if (g_bd_flat_SteamClient014_GetISteamMatchmaking == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamMatchmaking unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamMatchmaking_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamMatchmaking_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamMatchmaking_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamMatchmaking_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamMatchmaking(g_bd_self_steamclient014, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamMatchmaking ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 11u): { // SteamClient014.GetISteamMatchmakingServers
      if (g_bd_flat_SteamClient014_GetISteamMatchmakingServers == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamMatchmakingServers unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamMatchmakingServers_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamMatchmakingServers_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamMatchmakingServers_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamMatchmakingServers_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamMatchmakingServers(g_bd_self_steamclient014, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamMatchmakingServers ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 12u): { // SteamClient014.GetISteamGenericInterface
      if (g_bd_flat_SteamClient014_GetISteamGenericInterface == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamGenericInterface unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamGenericInterface_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamGenericInterface_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamGenericInterface_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamGenericInterface_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamGenericInterface(g_bd_self_steamclient014, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamGenericInterface ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 13u): { // SteamClient014.GetISteamUserStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too
      if (g_bd_flat_SteamClient014_GetISteamUserStats == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamUserStats unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamUserStats_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamUserStats_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamUserStats_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamUserStats_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamUserStats(g_bd_self_steamclient014, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamUserStats ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 14u): { // SteamClient014.GetISteamGameServerStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too
      if (g_bd_flat_SteamClient014_GetISteamGameServerStats == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamGameServerStats unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamGameServerStats_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamGameServerStats_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamGameServerStats_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamGameServerStats_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamGameServerStats(g_bd_self_steamclient014, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamGameServerStats ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 15u): { // SteamClient014.GetISteamApps
      if (g_bd_flat_SteamClient014_GetISteamApps == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamApps unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamApps_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamApps_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamApps_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamApps_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamApps(g_bd_self_steamclient014, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamApps ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 16u): { // SteamClient014.GetISteamNetworking
      if (g_bd_flat_SteamClient014_GetISteamNetworking == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamNetworking unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamNetworking_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamNetworking_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamNetworking_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamNetworking_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamNetworking(g_bd_self_steamclient014, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamNetworking ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 17u): { // SteamClient014.GetISteamRemoteStorage
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too
      if (g_bd_flat_SteamClient014_GetISteamRemoteStorage == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamRemoteStorage unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamRemoteStorage_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamRemoteStorage_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamRemoteStorage_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamRemoteStorage_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamRemoteStorage(g_bd_self_steamclient014, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamRemoteStorage ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 18u): { // SteamClient014.GetISteamScreenshots
      if (g_bd_flat_SteamClient014_GetISteamScreenshots == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamScreenshots unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamScreenshots_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamScreenshots_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamScreenshots_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamScreenshots_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamScreenshots(g_bd_self_steamclient014, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamScreenshots ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 19u): { // SteamClient014.RunFrame
      if (g_bd_flat_SteamClient014_RunFrame == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.RunFrame unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      g_bd_flat_SteamClient014_RunFrame(g_bd_self_steamclient014);
      logts("FWD", "SteamClient014.RunFrame " "called");
      *respLen = 0; return 0;
    }
    case (((uint32_t)22) << 16 | 20u): { // SteamClient014.GetIPCCallCount
      if (g_bd_flat_SteamClient014_GetIPCCallCount == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetIPCCallCount unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamClient014_GetIPCCallCount(g_bd_self_steamclient014);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetIPCCallCount -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 22u): { // SteamClient014.BShutdownIfAllPipesClosed
      if (g_bd_flat_SteamClient014_BShutdownIfAllPipesClosed == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.BShutdownIfAllPipesClosed unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamClient014_BShutdownIfAllPipesClosed(g_bd_self_steamclient014);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.BShutdownIfAllPipesClosed -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 23u): { // SteamClient014.GetISteamHTTP
      if (g_bd_flat_SteamClient014_GetISteamHTTP == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamHTTP unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamHTTP_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamHTTP_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamHTTP_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamHTTP_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamHTTP(g_bd_self_steamclient014, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamHTTP ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 24u): { // SteamClient014.GetISteamUnifiedMessages
      if (g_bd_flat_SteamClient014_GetISteamUnifiedMessages == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamUnifiedMessages unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamUnifiedMessages_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamUnifiedMessages_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamUnifiedMessages_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamUnifiedMessages_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamUnifiedMessages(g_bd_self_steamclient014, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamUnifiedMessages ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 25u): { // SteamClient014.GetISteamController
      if (g_bd_flat_SteamClient014_GetISteamController == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamController unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamController_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamController_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamController_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamController_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamController(g_bd_self_steamclient014, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamController ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 26u): { // SteamClient014.GetISteamUGC
      if (g_bd_flat_SteamClient014_GetISteamUGC == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamUGC unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamUGC_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamUGC_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamUGC_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamUGC_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamUGC(g_bd_self_steamclient014, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamUGC ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 27u): { // SteamClient014.GetISteamAppList
      if (g_bd_flat_SteamClient014_GetISteamAppList == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamAppList unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamAppList_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamAppList_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamAppList_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamAppList_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamAppList(g_bd_self_steamclient014, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamAppList ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)22) << 16 | 28u): { // SteamClient014.GetISteamMusic
      if (g_bd_flat_SteamClient014_GetISteamMusic == NULL || g_bd_self_steamclient014 == NULL) { logts("FWD", "SteamClient014.GetISteamMusic unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient014_GetISteamMusic_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient014_GetISteamMusic_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient014_GetISteamMusic_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient014_GetISteamMusic_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient014_GetISteamMusic(g_bd_self_steamclient014, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient014.GetISteamMusic ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 0u): { // SteamClient020.CreateSteamPipe
      if (g_bd_flat_SteamClient020_CreateSteamPipe == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.CreateSteamPipe unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_SteamClient020_CreateSteamPipe(g_bd_self_steamclient020);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.CreateSteamPipe -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 1u): { // SteamClient020.BReleaseSteamPipe
      if (g_bd_flat_SteamClient020_BReleaseSteamPipe == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.BReleaseSteamPipe unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      int __ret = g_bd_flat_SteamClient020_BReleaseSteamPipe(g_bd_self_steamclient020, arg_hSteamPipe);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.BReleaseSteamPipe -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 2u): { // SteamClient020.ConnectToGlobalUser
      if (g_bd_flat_SteamClient020_ConnectToGlobalUser == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.ConnectToGlobalUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      int32_t __ret = g_bd_flat_SteamClient020_ConnectToGlobalUser(g_bd_self_steamclient020, arg_hSteamPipe);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.ConnectToGlobalUser -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 3u): { // SteamClient020.CreateLocalUser
      if (g_bd_flat_SteamClient020_CreateLocalUser == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.CreateLocalUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t arg_phSteamPipe = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_eAccountType; memcpy(&arg_eAccountType, arg + 0u, 4);
      int32_t __ret = g_bd_flat_SteamClient020_CreateLocalUser(g_bd_self_steamclient020, &arg_phSteamPipe, arg_eAccountType);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.CreateLocalUser -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_phSteamPipe, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)25) << 16 | 4u): { // SteamClient020.ReleaseUser
      if (g_bd_flat_SteamClient020_ReleaseUser == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.ReleaseUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hUser; memcpy(&arg_hUser, arg + (0u + 4), 4);
      g_bd_flat_SteamClient020_ReleaseUser(g_bd_self_steamclient020, arg_hSteamPipe, arg_hUser);
      logts("FWD", "SteamClient020.ReleaseUser " "called");
      *respLen = 0; return 0;
    }
    case (((uint32_t)25) << 16 | 5u): { // SteamClient020.GetISteamUser
      if (g_bd_flat_SteamClient020_GetISteamUser == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamUser_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamUser_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamUser_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamUser_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamUser(g_bd_self_steamclient020, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamUser ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 6u): { // SteamClient020.GetISteamGameServer
      if (g_bd_flat_SteamClient020_GetISteamGameServer == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamGameServer unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamGameServer_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamGameServer_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamGameServer_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamGameServer_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamGameServer(g_bd_self_steamclient020, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamGameServer ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 8u): { // SteamClient020.GetISteamFriends
      if (g_bd_flat_SteamClient020_GetISteamFriends == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamFriends unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamFriends_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamFriends_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamFriends_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamFriends_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamFriends(g_bd_self_steamclient020, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamFriends ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 9u): { // SteamClient020.GetISteamUtils
      if (g_bd_flat_SteamClient020_GetISteamUtils == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamUtils unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      static char g_bd_flat_SteamClient020_GetISteamUtils_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + (0u + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < (0u + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamUtils_pchVersion_buf, arg + (0u + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamUtils_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamUtils_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamUtils(g_bd_self_steamclient020, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamUtils ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 10u): { // SteamClient020.GetISteamMatchmaking
      if (g_bd_flat_SteamClient020_GetISteamMatchmaking == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamMatchmaking unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamMatchmaking_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamMatchmaking_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamMatchmaking_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamMatchmaking_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamMatchmaking(g_bd_self_steamclient020, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamMatchmaking ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 11u): { // SteamClient020.GetISteamMatchmakingServers
      if (g_bd_flat_SteamClient020_GetISteamMatchmakingServers == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamMatchmakingServers unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamMatchmakingServers_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamMatchmakingServers_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamMatchmakingServers_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamMatchmakingServers_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamMatchmakingServers(g_bd_self_steamclient020, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamMatchmakingServers ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 12u): { // SteamClient020.GetISteamGenericInterface
      if (g_bd_flat_SteamClient020_GetISteamGenericInterface == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamGenericInterface unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamGenericInterface_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamGenericInterface_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamGenericInterface_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamGenericInterface_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamGenericInterface(g_bd_self_steamclient020, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamGenericInterface ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 13u): { // SteamClient020.GetISteamUserStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too
      if (g_bd_flat_SteamClient020_GetISteamUserStats == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamUserStats unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamUserStats_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamUserStats_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamUserStats_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamUserStats_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamUserStats(g_bd_self_steamclient020, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamUserStats ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 14u): { // SteamClient020.GetISteamGameServerStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too
      if (g_bd_flat_SteamClient020_GetISteamGameServerStats == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamGameServerStats unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamGameServerStats_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamGameServerStats_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamGameServerStats_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamGameServerStats_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamGameServerStats(g_bd_self_steamclient020, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamGameServerStats ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 15u): { // SteamClient020.GetISteamApps
      if (g_bd_flat_SteamClient020_GetISteamApps == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamApps unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamApps_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamApps_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamApps_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamApps_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamApps(g_bd_self_steamclient020, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamApps ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 16u): { // SteamClient020.GetISteamNetworking
      if (g_bd_flat_SteamClient020_GetISteamNetworking == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamNetworking unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamNetworking_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamNetworking_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamNetworking_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamNetworking_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamNetworking(g_bd_self_steamclient020, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamNetworking ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 17u): { // SteamClient020.GetISteamRemoteStorage
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too
      if (g_bd_flat_SteamClient020_GetISteamRemoteStorage == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamRemoteStorage unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamRemoteStorage_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamRemoteStorage_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamRemoteStorage_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamRemoteStorage_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamRemoteStorage(g_bd_self_steamclient020, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamRemoteStorage ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 18u): { // SteamClient020.GetISteamScreenshots
      if (g_bd_flat_SteamClient020_GetISteamScreenshots == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamScreenshots unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamScreenshots_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamScreenshots_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamScreenshots_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamScreenshots_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamScreenshots(g_bd_self_steamclient020, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamScreenshots ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 20u): { // SteamClient020.RunFrame
      if (g_bd_flat_SteamClient020_RunFrame == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.RunFrame unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      g_bd_flat_SteamClient020_RunFrame(g_bd_self_steamclient020);
      logts("FWD", "SteamClient020.RunFrame " "called");
      *respLen = 0; return 0;
    }
    case (((uint32_t)25) << 16 | 21u): { // SteamClient020.GetIPCCallCount
      if (g_bd_flat_SteamClient020_GetIPCCallCount == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetIPCCallCount unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamClient020_GetIPCCallCount(g_bd_self_steamclient020);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetIPCCallCount -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 23u): { // SteamClient020.BShutdownIfAllPipesClosed
      if (g_bd_flat_SteamClient020_BShutdownIfAllPipesClosed == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.BShutdownIfAllPipesClosed unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamClient020_BShutdownIfAllPipesClosed(g_bd_self_steamclient020);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.BShutdownIfAllPipesClosed -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 24u): { // SteamClient020.GetISteamHTTP
      if (g_bd_flat_SteamClient020_GetISteamHTTP == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamHTTP unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamHTTP_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamHTTP_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamHTTP_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamHTTP_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamHTTP(g_bd_self_steamclient020, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamHTTP ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 25u): { // SteamClient020.DEPRECATED_GetISteamUnifiedMessages
      if (g_bd_flat_SteamClient020_DEPRECATED_GetISteamUnifiedMessages == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.DEPRECATED_GetISteamUnifiedMessages unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_DEPRECATED_GetISteamUnifiedMessages_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_DEPRECATED_GetISteamUnifiedMessages_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_DEPRECATED_GetISteamUnifiedMessages_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_DEPRECATED_GetISteamUnifiedMessages_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_DEPRECATED_GetISteamUnifiedMessages(g_bd_self_steamclient020, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.DEPRECATED_GetISteamUnifiedMessages ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 26u): { // SteamClient020.GetISteamController
      if (g_bd_flat_SteamClient020_GetISteamController == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamController unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamController_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamController_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamController_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamController_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamController(g_bd_self_steamclient020, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamController ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 27u): { // SteamClient020.GetISteamUGC
      if (g_bd_flat_SteamClient020_GetISteamUGC == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamUGC unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamUGC_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamUGC_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamUGC_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamUGC_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamUGC(g_bd_self_steamclient020, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamUGC ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 28u): { // SteamClient020.GetISteamAppList
      if (g_bd_flat_SteamClient020_GetISteamAppList == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamAppList unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamAppList_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamAppList_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamAppList_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamAppList_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamAppList(g_bd_self_steamclient020, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamAppList ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 29u): { // SteamClient020.GetISteamMusic
      if (g_bd_flat_SteamClient020_GetISteamMusic == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamMusic unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamMusic_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamMusic_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamMusic_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamMusic_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamMusic(g_bd_self_steamclient020, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamMusic ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 30u): { // SteamClient020.GetISteamMusicRemote
      if (g_bd_flat_SteamClient020_GetISteamMusicRemote == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamMusicRemote unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamMusicRemote_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamMusicRemote_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamMusicRemote_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamMusicRemote_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamMusicRemote(g_bd_self_steamclient020, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamMusicRemote ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 31u): { // SteamClient020.GetISteamHTMLSurface
      if (g_bd_flat_SteamClient020_GetISteamHTMLSurface == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamHTMLSurface unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamHTMLSurface_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamHTMLSurface_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamHTMLSurface_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamHTMLSurface_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamHTMLSurface(g_bd_self_steamclient020, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamHTMLSurface ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 35u): { // SteamClient020.GetISteamInventory
      if (g_bd_flat_SteamClient020_GetISteamInventory == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamInventory unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamInventory_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamInventory_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamInventory_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamInventory_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamInventory(g_bd_self_steamclient020, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamInventory ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 36u): { // SteamClient020.GetISteamVideo
      if (g_bd_flat_SteamClient020_GetISteamVideo == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamVideo unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamVideo_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamVideo_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamVideo_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamVideo_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamVideo(g_bd_self_steamclient020, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamVideo ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)25) << 16 | 37u): { // SteamClient020.GetISteamParentalSettings
      if (g_bd_flat_SteamClient020_GetISteamParentalSettings == NULL || g_bd_self_steamclient020 == NULL) { logts("FWD", "SteamClient020.GetISteamParentalSettings unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient020_GetISteamParentalSettings_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient020_GetISteamParentalSettings_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient020_GetISteamParentalSettings_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient020_GetISteamParentalSettings_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient020_GetISteamParentalSettings(g_bd_self_steamclient020, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient020.GetISteamParentalSettings ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 0u): { // SteamClient021.CreateSteamPipe
      if (g_bd_flat_SteamClient021_CreateSteamPipe == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.CreateSteamPipe unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_SteamClient021_CreateSteamPipe(g_bd_self_steamclient021);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.CreateSteamPipe -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 1u): { // SteamClient021.BReleaseSteamPipe
      if (g_bd_flat_SteamClient021_BReleaseSteamPipe == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.BReleaseSteamPipe unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      int __ret = g_bd_flat_SteamClient021_BReleaseSteamPipe(g_bd_self_steamclient021, arg_hSteamPipe);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.BReleaseSteamPipe -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 2u): { // SteamClient021.ConnectToGlobalUser
      if (g_bd_flat_SteamClient021_ConnectToGlobalUser == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.ConnectToGlobalUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      int32_t __ret = g_bd_flat_SteamClient021_ConnectToGlobalUser(g_bd_self_steamclient021, arg_hSteamPipe);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.ConnectToGlobalUser -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 3u): { // SteamClient021.CreateLocalUser
      if (g_bd_flat_SteamClient021_CreateLocalUser == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.CreateLocalUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t arg_phSteamPipe = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_eAccountType; memcpy(&arg_eAccountType, arg + 0u, 4);
      int32_t __ret = g_bd_flat_SteamClient021_CreateLocalUser(g_bd_self_steamclient021, &arg_phSteamPipe, arg_eAccountType);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.CreateLocalUser -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_phSteamPipe, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)26) << 16 | 4u): { // SteamClient021.ReleaseUser
      if (g_bd_flat_SteamClient021_ReleaseUser == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.ReleaseUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hUser; memcpy(&arg_hUser, arg + (0u + 4), 4);
      g_bd_flat_SteamClient021_ReleaseUser(g_bd_self_steamclient021, arg_hSteamPipe, arg_hUser);
      logts("FWD", "SteamClient021.ReleaseUser " "called");
      *respLen = 0; return 0;
    }
    case (((uint32_t)26) << 16 | 5u): { // SteamClient021.GetISteamUser
      if (g_bd_flat_SteamClient021_GetISteamUser == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamUser unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamUser_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamUser_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamUser_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamUser_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamUser(g_bd_self_steamclient021, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamUser ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 6u): { // SteamClient021.GetISteamGameServer
      if (g_bd_flat_SteamClient021_GetISteamGameServer == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamGameServer unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamGameServer_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamGameServer_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamGameServer_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamGameServer_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamGameServer(g_bd_self_steamclient021, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamGameServer ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 8u): { // SteamClient021.GetISteamFriends
      if (g_bd_flat_SteamClient021_GetISteamFriends == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamFriends unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamFriends_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamFriends_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamFriends_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamFriends_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamFriends(g_bd_self_steamclient021, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamFriends ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 9u): { // SteamClient021.GetISteamUtils
      if (g_bd_flat_SteamClient021_GetISteamUtils == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamUtils unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + 0u, 4);
      static char g_bd_flat_SteamClient021_GetISteamUtils_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + (0u + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < (0u + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamUtils_pchVersion_buf, arg + (0u + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamUtils_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamUtils_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamUtils(g_bd_self_steamclient021, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamUtils ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 10u): { // SteamClient021.GetISteamMatchmaking
      if (g_bd_flat_SteamClient021_GetISteamMatchmaking == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamMatchmaking unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamMatchmaking_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamMatchmaking_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamMatchmaking_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamMatchmaking_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamMatchmaking(g_bd_self_steamclient021, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamMatchmaking ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 11u): { // SteamClient021.GetISteamMatchmakingServers
      if (g_bd_flat_SteamClient021_GetISteamMatchmakingServers == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamMatchmakingServers unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamMatchmakingServers_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamMatchmakingServers_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamMatchmakingServers_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamMatchmakingServers_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamMatchmakingServers(g_bd_self_steamclient021, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamMatchmakingServers ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 12u): { // SteamClient021.GetISteamGenericInterface
      if (g_bd_flat_SteamClient021_GetISteamGenericInterface == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamGenericInterface unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamGenericInterface_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamGenericInterface_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamGenericInterface_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamGenericInterface_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamGenericInterface(g_bd_self_steamclient021, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamGenericInterface ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 13u): { // SteamClient021.GetISteamUserStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too
      if (g_bd_flat_SteamClient021_GetISteamUserStats == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamUserStats unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamUserStats_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamUserStats_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamUserStats_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamUserStats_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamUserStats(g_bd_self_steamclient021, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamUserStats ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 14u): { // SteamClient021.GetISteamGameServerStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too
      if (g_bd_flat_SteamClient021_GetISteamGameServerStats == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamGameServerStats unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamGameServerStats_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamGameServerStats_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamGameServerStats_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamGameServerStats_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamGameServerStats(g_bd_self_steamclient021, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamGameServerStats ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 15u): { // SteamClient021.GetISteamApps
      if (g_bd_flat_SteamClient021_GetISteamApps == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamApps unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamApps_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamApps_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamApps_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamApps_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamApps(g_bd_self_steamclient021, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamApps ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 16u): { // SteamClient021.GetISteamNetworking
      if (g_bd_flat_SteamClient021_GetISteamNetworking == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamNetworking unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamNetworking_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamNetworking_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamNetworking_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamNetworking_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamNetworking(g_bd_self_steamclient021, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamNetworking ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 17u): { // SteamClient021.GetISteamRemoteStorage
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too
      if (g_bd_flat_SteamClient021_GetISteamRemoteStorage == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamRemoteStorage unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamRemoteStorage_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamRemoteStorage_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamRemoteStorage_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamRemoteStorage_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamRemoteStorage(g_bd_self_steamclient021, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamRemoteStorage ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 18u): { // SteamClient021.GetISteamScreenshots
      if (g_bd_flat_SteamClient021_GetISteamScreenshots == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamScreenshots unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamScreenshots_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamScreenshots_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamScreenshots_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamScreenshots_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamScreenshots(g_bd_self_steamclient021, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamScreenshots ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 20u): { // SteamClient021.RunFrame
      if (g_bd_flat_SteamClient021_RunFrame == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.RunFrame unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      g_bd_flat_SteamClient021_RunFrame(g_bd_self_steamclient021);
      logts("FWD", "SteamClient021.RunFrame " "called");
      *respLen = 0; return 0;
    }
    case (((uint32_t)26) << 16 | 21u): { // SteamClient021.GetIPCCallCount
      if (g_bd_flat_SteamClient021_GetIPCCallCount == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetIPCCallCount unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamClient021_GetIPCCallCount(g_bd_self_steamclient021);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetIPCCallCount -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 23u): { // SteamClient021.BShutdownIfAllPipesClosed
      if (g_bd_flat_SteamClient021_BShutdownIfAllPipesClosed == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.BShutdownIfAllPipesClosed unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamClient021_BShutdownIfAllPipesClosed(g_bd_self_steamclient021);
      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.BShutdownIfAllPipesClosed -> %d", (int)__ret); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 24u): { // SteamClient021.GetISteamHTTP
      if (g_bd_flat_SteamClient021_GetISteamHTTP == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamHTTP unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamHTTP_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamHTTP_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamHTTP_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamHTTP_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamHTTP(g_bd_self_steamclient021, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamHTTP ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 25u): { // SteamClient021.GetISteamController
      if (g_bd_flat_SteamClient021_GetISteamController == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamController unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamController_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamController_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamController_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamController_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamController(g_bd_self_steamclient021, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamController ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 26u): { // SteamClient021.GetISteamUGC
      if (g_bd_flat_SteamClient021_GetISteamUGC == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamUGC unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamUser; memcpy(&arg_hSteamUser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamUGC_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamUGC_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamUGC_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamUGC_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamUGC(g_bd_self_steamclient021, arg_hSteamUser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamUGC ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 27u): { // SteamClient021.GetISteamMusic
      if (g_bd_flat_SteamClient021_GetISteamMusic == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamMusic unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamMusic_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamMusic_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamMusic_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamMusic_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamMusic(g_bd_self_steamclient021, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamMusic ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 28u): { // SteamClient021.GetISteamMusicRemote
      if (g_bd_flat_SteamClient021_GetISteamMusicRemote == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamMusicRemote unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamMusicRemote_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamMusicRemote_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamMusicRemote_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamMusicRemote_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamMusicRemote(g_bd_self_steamclient021, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamMusicRemote ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 29u): { // SteamClient021.GetISteamHTMLSurface
      if (g_bd_flat_SteamClient021_GetISteamHTMLSurface == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamHTMLSurface unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamHTMLSurface_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamHTMLSurface_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamHTMLSurface_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamHTMLSurface_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamHTMLSurface(g_bd_self_steamclient021, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamHTMLSurface ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 33u): { // SteamClient021.GetISteamInventory
      if (g_bd_flat_SteamClient021_GetISteamInventory == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamInventory unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamInventory_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamInventory_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamInventory_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamInventory_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamInventory(g_bd_self_steamclient021, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamInventory ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 34u): { // SteamClient021.GetISteamVideo
      if (g_bd_flat_SteamClient021_GetISteamVideo == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamVideo unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamVideo_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamVideo_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamVideo_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamVideo_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamVideo(g_bd_self_steamclient021, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamVideo ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)26) << 16 | 35u): { // SteamClient021.GetISteamParentalSettings
      if (g_bd_flat_SteamClient021_GetISteamParentalSettings == NULL || g_bd_self_steamclient021 == NULL) { logts("FWD", "SteamClient021.GetISteamParentalSettings unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamuser; memcpy(&arg_hSteamuser, arg + 0u, 4);
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_hSteamPipe; memcpy(&arg_hSteamPipe, arg + (0u + 4), 4);
      static char g_bd_flat_SteamClient021_GetISteamParentalSettings_pchVersion_buf[4096 + 1];
      const char *arg_pchVersion = NULL;
      uint32_t arg_pchVersion_len = 0;
      if (argLen < ((0u + 4) + 4) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchVersion_len, arg + ((0u + 4) + 4), 4);
      if (arg_pchVersion_len != 0xFFFFFFFFu) {
        if (arg_pchVersion_len > 4096 || argLen < ((0u + 4) + 4) + 4 + arg_pchVersion_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_SteamClient021_GetISteamParentalSettings_pchVersion_buf, arg + ((0u + 4) + 4) + 4, arg_pchVersion_len);
        g_bd_flat_SteamClient021_GetISteamParentalSettings_pchVersion_buf[arg_pchVersion_len] = '\0';
        arg_pchVersion = g_bd_flat_SteamClient021_GetISteamParentalSettings_pchVersion_buf;
      } else {
        arg_pchVersion_len = 0;
      }
      void *result = g_bd_flat_SteamClient021_GetISteamParentalSettings(g_bd_self_steamclient021, arg_hSteamuser, arg_hSteamPipe, arg_pchVersion);
      int32_t present = (result != NULL) ? 1 : 0;
      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_pchVersion, fwdv, sizeof(fwdv));
        snprintf(fwdmsg, sizeof(fwdmsg), "SteamClient021.GetISteamParentalSettings ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &present, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)27) << 16 | 0u): { // SteamUser021.GetHSteamUser
      if (g_bd_flat_SteamUser021_GetHSteamUser == NULL || g_bd_self_steamuser021 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_SteamUser021_GetHSteamUser(g_bd_self_steamuser021);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)27) << 16 | 1u): { // SteamUser021.BLoggedOn
      if (g_bd_flat_SteamUser021_BLoggedOn == NULL || g_bd_self_steamuser021 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUser021_BLoggedOn(g_bd_self_steamuser021);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)27) << 16 | 2u): { // SteamUser021.GetSteamID
      if (g_bd_flat_SteamUser021_GetSteamID == NULL || g_bd_self_steamuser021 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint64_t __ret = g_bd_flat_SteamUser021_GetSteamID(g_bd_self_steamuser021);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 8);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)27) << 16 | 13u): { // SteamUser021.GetAuthSessionTicket
      if (g_bd_flat_SteamUser021_GetAuthSessionTicket == NULL || g_bd_self_steamuser021 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static uint8_t g_bd_flat_SteamUser021_GetAuthSessionTicket_pTicket_buf[BD_WIRE_OUT_BUFFER_MAX_BYTES];
      uint32_t cap_pTicket = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&cap_pTicket, arg + 0u, 4);
      if (cap_pTicket > BD_WIRE_OUT_BUFFER_MAX_BYTES) cap_pTicket = BD_WIRE_OUT_BUFFER_MAX_BYTES;
      if (respCap < 12) { *respLen = 0; return 1; }
      if (cap_pTicket > respCap - 12) cap_pTicket = (uint32_t)(respCap - 12); // response must fit the scratch
      memset(g_bd_flat_SteamUser021_GetAuthSessionTicket_pTicket_buf, 0, cap_pTicket); // no earlier call's bytes cross into the game (53-17 WR-04)
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_cbMaxTicket; memcpy(&arg_cbMaxTicket, arg + (0u + 4), 4);
      uint32_t arg_pcbTicket = 0;
      if ((int64_t)arg_cbMaxTicket < 0 || (int64_t)arg_cbMaxTicket > (int64_t)cap_pTicket) arg_cbMaxTicket = (int32_t)cap_pTicket;
      uint32_t __ret = g_bd_flat_SteamUser021_GetAuthSessionTicket(g_bd_self_steamuser021, g_bd_flat_SteamUser021_GetAuthSessionTicket_pTicket_buf, arg_cbMaxTicket, &arg_pcbTicket, NULL);
      if (respCap < 12) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pcbTicket, 4);
      uint32_t outLen_pTicket = cap_pTicket;
      if ((uint32_t)arg_pcbTicket < outLen_pTicket) outLen_pTicket = (uint32_t)arg_pcbTicket;
      memcpy(resp + 8, &outLen_pTicket, 4);
      memcpy(resp + 8 + 4, g_bd_flat_SteamUser021_GetAuthSessionTicket_pTicket_buf, outLen_pTicket);
      *respLen = 8 + 4 + outLen_pTicket;
      return 0;
    }
    case (((uint32_t)27) << 16 | 16u): { // SteamUser021.CancelAuthTicket
      if (g_bd_flat_SteamUser021_CancelAuthTicket == NULL || g_bd_self_steamuser021 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hAuthTicket; memcpy(&arg_hAuthTicket, arg + 0u, 4);
      g_bd_flat_SteamUser021_CancelAuthTicket(g_bd_self_steamuser021, arg_hAuthTicket);
      *respLen = 0; return 0;
    }
    case (((uint32_t)28) << 16 | 0u): { // SteamFriends017.GetPersonaName
      if (g_bd_flat_SteamFriends017_GetPersonaName == NULL || g_bd_self_steamfriends017 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamFriends017_GetPersonaName(g_bd_self_steamfriends017);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)28) << 16 | 2u): { // SteamFriends017.GetPersonaState
      if (g_bd_flat_SteamFriends017_GetPersonaState == NULL || g_bd_self_steamfriends017 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamFriends017_GetPersonaState(g_bd_self_steamfriends017);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)29) << 16 | 0u): { // SteamUtils010.GetSecondsSinceAppActive
      if (g_bd_flat_SteamUtils010_GetSecondsSinceAppActive == NULL || g_bd_self_steamutils010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils010_GetSecondsSinceAppActive(g_bd_self_steamutils010);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)29) << 16 | 1u): { // SteamUtils010.GetSecondsSinceComputerActive
      if (g_bd_flat_SteamUtils010_GetSecondsSinceComputerActive == NULL || g_bd_self_steamutils010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils010_GetSecondsSinceComputerActive(g_bd_self_steamutils010);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)29) << 16 | 2u): { // SteamUtils010.GetConnectedUniverse
      if (g_bd_flat_SteamUtils010_GetConnectedUniverse == NULL || g_bd_self_steamutils010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils010_GetConnectedUniverse(g_bd_self_steamutils010);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)29) << 16 | 3u): { // SteamUtils010.GetServerRealTime
      if (g_bd_flat_SteamUtils010_GetServerRealTime == NULL || g_bd_self_steamutils010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils010_GetServerRealTime(g_bd_self_steamutils010);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)29) << 16 | 4u): { // SteamUtils010.GetIPCountry
      if (g_bd_flat_SteamUtils010_GetIPCountry == NULL || g_bd_self_steamutils010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamUtils010_GetIPCountry(g_bd_self_steamutils010);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)29) << 16 | 8u): { // SteamUtils010.GetCurrentBatteryPower
      if (g_bd_flat_SteamUtils010_GetCurrentBatteryPower == NULL || g_bd_self_steamutils010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils010_GetCurrentBatteryPower(g_bd_self_steamutils010);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)29) << 16 | 9u): { // SteamUtils010.GetAppID
      if (g_bd_identity_only) { // D-51-04: identity-only reports the launching game's real AppID, never 480
        uint32_t v = g_bd_report_appid;
        if (respCap < 4) { *respLen = 0; return 1; }
        memcpy(resp, &v, 4); *respLen = 4; return 0;
      }
      if (g_bd_flat_SteamUtils010_GetAppID == NULL || g_bd_self_steamutils010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils010_GetAppID(g_bd_self_steamutils010);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)29) << 16 | 17u): { // SteamUtils010.IsOverlayEnabled
      if (g_bd_flat_SteamUtils010_IsOverlayEnabled == NULL || g_bd_self_steamutils010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUtils010_IsOverlayEnabled(g_bd_self_steamutils010);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)29) << 16 | 23u): { // SteamUtils010.GetSteamUILanguage
      if (g_bd_flat_SteamUtils010_GetSteamUILanguage == NULL || g_bd_self_steamutils010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamUtils010_GetSteamUILanguage(g_bd_self_steamutils010);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)29) << 16 | 24u): { // SteamUtils010.IsSteamRunningInVR
      if (g_bd_flat_SteamUtils010_IsSteamRunningInVR == NULL || g_bd_self_steamutils010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUtils010_IsSteamRunningInVR(g_bd_self_steamutils010);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)29) << 16 | 26u): { // SteamUtils010.IsSteamInBigPictureMode
      if (g_bd_flat_SteamUtils010_IsSteamInBigPictureMode == NULL || g_bd_self_steamutils010 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUtils010_IsSteamInBigPictureMode(g_bd_self_steamutils010);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)30) << 16 | 1u): { // STEAMUSERSTATS_INTERFACE_VERSION012.GetStat_2
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2 == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      float arg_pData = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_2(g_bd_self_steamuserstats_interface_version012, arg_pchName, &arg_pData);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pData, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)30) << 16 | 2u): { // STEAMUSERSTATS_INTERFACE_VERSION012.GetStat
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int32_t arg_pData = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetStat(g_bd_self_steamuserstats_interface_version012, arg_pchName, &arg_pData);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pData, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)30) << 16 | 3u): { // STEAMUSERSTATS_INTERFACE_VERSION012.SetStat_2
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2 == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_fData; memcpy(&arg_fData, arg + (0u + 4 + arg_pchName_len), 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_2(g_bd_self_steamuserstats_interface_version012, arg_pchName, arg_fData);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)30) << 16 | 4u): { // STEAMUSERSTATS_INTERFACE_VERSION012.SetStat
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_nData; memcpy(&arg_nData, arg + (0u + 4 + arg_pchName_len), 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetStat(g_bd_self_steamuserstats_interface_version012, arg_pchName, arg_nData);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)30) << 16 | 5u): { // STEAMUSERSTATS_INTERFACE_VERSION012.UpdateAvgRateStat
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_flCountThisSession; memcpy(&arg_flCountThisSession, arg + (0u + 4 + arg_pchName_len), 4);
      if (argLen < ((0u + 4 + arg_pchName_len) + 4) + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      double arg_dSessionLength; memcpy(&arg_dSessionLength, arg + ((0u + 4 + arg_pchName_len) + 4), 8);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_UpdateAvgRateStat(g_bd_self_steamuserstats_interface_version012, arg_pchName, arg_flCountThisSession, arg_dSessionLength);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)30) << 16 | 6u): { // STEAMUSERSTATS_INTERFACE_VERSION012.GetAchievement
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int arg_pbAchieved = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievement(g_bd_self_steamuserstats_interface_version012, arg_pchName, &arg_pbAchieved);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pbAchieved, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)30) << 16 | 7u): { // STEAMUSERSTATS_INTERFACE_VERSION012.SetAchievement
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_SetAchievement(g_bd_self_steamuserstats_interface_version012, arg_pchName);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)30) << 16 | 8u): { // STEAMUSERSTATS_INTERFACE_VERSION012.ClearAchievement
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_ClearAchievement(g_bd_self_steamuserstats_interface_version012, arg_pchName);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)30) << 16 | 9u): { // STEAMUSERSTATS_INTERFACE_VERSION012.GetAchievementAndUnlockTime
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int arg_pbAchieved = 0;
      uint32_t arg_punUnlockTime = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementAndUnlockTime(g_bd_self_steamuserstats_interface_version012, arg_pchName, &arg_pbAchieved, &arg_punUnlockTime);
      if (respCap < 12) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pbAchieved, 4);
      memcpy(resp + 8, &arg_punUnlockTime, 4);
      *respLen = 12;
      return 0;
    }
    case (((uint32_t)30) << 16 | 10u): { // STEAMUSERSTATS_INTERFACE_VERSION012.StoreStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_StoreStats == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_StoreStats(g_bd_self_steamuserstats_interface_version012);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)30) << 16 | 12u): { // STEAMUSERSTATS_INTERFACE_VERSION012.GetAchievementDisplayAttribute
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute_pchKey_buf[4096 + 1];
      const char *arg_pchKey = NULL;
      uint32_t arg_pchKey_len = 0;
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchKey_len, arg + (0u + 4 + arg_pchName_len), 4);
      if (arg_pchKey_len != 0xFFFFFFFFu) {
        if (arg_pchKey_len > 4096 || argLen < (0u + 4 + arg_pchName_len) + 4 + arg_pchKey_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute_pchKey_buf, arg + (0u + 4 + arg_pchName_len) + 4, arg_pchKey_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute_pchKey_buf[arg_pchKey_len] = '\0';
        arg_pchKey = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute_pchKey_buf;
      } else {
        arg_pchKey_len = 0;
      }
      const char *result = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementDisplayAttribute(g_bd_self_steamuserstats_interface_version012, arg_pchName, arg_pchKey);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)30) << 16 | 13u): { // STEAMUSERSTATS_INTERFACE_VERSION012.IndicateAchievementProgress
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nCurProgress; memcpy(&arg_nCurProgress, arg + (0u + 4 + arg_pchName_len), 4);
      if (argLen < ((0u + 4 + arg_pchName_len) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nMaxProgress; memcpy(&arg_nMaxProgress, arg + ((0u + 4 + arg_pchName_len) + 4), 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_IndicateAchievementProgress(g_bd_self_steamuserstats_interface_version012, arg_pchName, arg_nCurProgress, arg_nMaxProgress);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)30) << 16 | 14u): { // STEAMUSERSTATS_INTERFACE_VERSION012.GetNumAchievements
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetNumAchievements == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetNumAchievements(g_bd_self_steamuserstats_interface_version012);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)30) << 16 | 15u): { // STEAMUSERSTATS_INTERFACE_VERSION012.GetAchievementName
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementName == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_iAchievement; memcpy(&arg_iAchievement, arg + 0u, 4);
      const char *result = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_GetAchievementName(g_bd_self_steamuserstats_interface_version012, arg_iAchievement);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)30) << 16 | 21u): { // STEAMUSERSTATS_INTERFACE_VERSION012.ResetAllStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_ResetAllStats == NULL || g_bd_self_steamuserstats_interface_version012 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int arg_bAchievementsToo; memcpy(&arg_bAchievementsToo, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION012_ResetAllStats(g_bd_self_steamuserstats_interface_version012, arg_bAchievementsToo);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)31) << 16 | 0u): { // STEAMUSERSTATS_INTERFACE_VERSION013.GetStat_2
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2 == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      float arg_pData = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_2(g_bd_self_steamuserstats_interface_version013, arg_pchName, &arg_pData);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pData, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)31) << 16 | 1u): { // STEAMUSERSTATS_INTERFACE_VERSION013.GetStat
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int32_t arg_pData = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetStat(g_bd_self_steamuserstats_interface_version013, arg_pchName, &arg_pData);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pData, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)31) << 16 | 2u): { // STEAMUSERSTATS_INTERFACE_VERSION013.SetStat_2
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2 == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_fData; memcpy(&arg_fData, arg + (0u + 4 + arg_pchName_len), 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_2(g_bd_self_steamuserstats_interface_version013, arg_pchName, arg_fData);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)31) << 16 | 3u): { // STEAMUSERSTATS_INTERFACE_VERSION013.SetStat
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_nData; memcpy(&arg_nData, arg + (0u + 4 + arg_pchName_len), 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetStat(g_bd_self_steamuserstats_interface_version013, arg_pchName, arg_nData);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)31) << 16 | 4u): { // STEAMUSERSTATS_INTERFACE_VERSION013.UpdateAvgRateStat
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_flCountThisSession; memcpy(&arg_flCountThisSession, arg + (0u + 4 + arg_pchName_len), 4);
      if (argLen < ((0u + 4 + arg_pchName_len) + 4) + 8) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      double arg_dSessionLength; memcpy(&arg_dSessionLength, arg + ((0u + 4 + arg_pchName_len) + 4), 8);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_UpdateAvgRateStat(g_bd_self_steamuserstats_interface_version013, arg_pchName, arg_flCountThisSession, arg_dSessionLength);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)31) << 16 | 5u): { // STEAMUSERSTATS_INTERFACE_VERSION013.GetAchievement
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int arg_pbAchieved = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievement(g_bd_self_steamuserstats_interface_version013, arg_pchName, &arg_pbAchieved);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pbAchieved, 4);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)31) << 16 | 6u): { // STEAMUSERSTATS_INTERFACE_VERSION013.SetAchievement
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_SetAchievement(g_bd_self_steamuserstats_interface_version013, arg_pchName);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)31) << 16 | 7u): { // STEAMUSERSTATS_INTERFACE_VERSION013.ClearAchievement
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_ClearAchievement(g_bd_self_steamuserstats_interface_version013, arg_pchName);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)31) << 16 | 8u): { // STEAMUSERSTATS_INTERFACE_VERSION013.GetAchievementAndUnlockTime
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      int arg_pbAchieved = 0;
      uint32_t arg_punUnlockTime = 0;
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementAndUnlockTime(g_bd_self_steamuserstats_interface_version013, arg_pchName, &arg_pbAchieved, &arg_punUnlockTime);
      if (respCap < 12) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pbAchieved, 4);
      memcpy(resp + 8, &arg_punUnlockTime, 4);
      *respLen = 12;
      return 0;
    }
    case (((uint32_t)31) << 16 | 9u): { // STEAMUSERSTATS_INTERFACE_VERSION013.StoreStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_StoreStats == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_StoreStats(g_bd_self_steamuserstats_interface_version013);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)31) << 16 | 11u): { // STEAMUSERSTATS_INTERFACE_VERSION013.GetAchievementDisplayAttribute
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute_pchKey_buf[4096 + 1];
      const char *arg_pchKey = NULL;
      uint32_t arg_pchKey_len = 0;
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchKey_len, arg + (0u + 4 + arg_pchName_len), 4);
      if (arg_pchKey_len != 0xFFFFFFFFu) {
        if (arg_pchKey_len > 4096 || argLen < (0u + 4 + arg_pchName_len) + 4 + arg_pchKey_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute_pchKey_buf, arg + (0u + 4 + arg_pchName_len) + 4, arg_pchKey_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute_pchKey_buf[arg_pchKey_len] = '\0';
        arg_pchKey = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute_pchKey_buf;
      } else {
        arg_pchKey_len = 0;
      }
      const char *result = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementDisplayAttribute(g_bd_self_steamuserstats_interface_version013, arg_pchName, arg_pchKey);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)31) << 16 | 12u): { // STEAMUSERSTATS_INTERFACE_VERSION013.IndicateAchievementProgress
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static char g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress_pchName_buf[4096 + 1];
      const char *arg_pchName = NULL;
      uint32_t arg_pchName_len = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&arg_pchName_len, arg + 0u, 4);
      if (arg_pchName_len != 0xFFFFFFFFu) {
        if (arg_pchName_len > 4096 || argLen < 0u + 4 + arg_pchName_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24
        memcpy(g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress_pchName_buf, arg + 0u + 4, arg_pchName_len);
        g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress_pchName_buf[arg_pchName_len] = '\0';
        arg_pchName = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress_pchName_buf;
      } else {
        arg_pchName_len = 0;
      }
      if (argLen < (0u + 4 + arg_pchName_len) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nCurProgress; memcpy(&arg_nCurProgress, arg + (0u + 4 + arg_pchName_len), 4);
      if (argLen < ((0u + 4 + arg_pchName_len) + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nMaxProgress; memcpy(&arg_nMaxProgress, arg + ((0u + 4 + arg_pchName_len) + 4), 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_IndicateAchievementProgress(g_bd_self_steamuserstats_interface_version013, arg_pchName, arg_nCurProgress, arg_nMaxProgress);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)31) << 16 | 13u): { // STEAMUSERSTATS_INTERFACE_VERSION013.GetNumAchievements
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetNumAchievements == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetNumAchievements(g_bd_self_steamuserstats_interface_version013);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)31) << 16 | 14u): { // STEAMUSERSTATS_INTERFACE_VERSION013.GetAchievementName
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementName == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_iAchievement; memcpy(&arg_iAchievement, arg + 0u, 4);
      const char *result = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_GetAchievementName(g_bd_self_steamuserstats_interface_version013, arg_iAchievement);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)31) << 16 | 20u): { // STEAMUSERSTATS_INTERFACE_VERSION013.ResetAllStats
      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: SteamUserStats is app-scoped -- refused in identity-only mode
      if (g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_ResetAllStats == NULL || g_bd_self_steamuserstats_interface_version013 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int arg_bAchievementsToo; memcpy(&arg_bAchievementsToo, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMUSERSTATS_INTERFACE_VERSION013_ResetAllStats(g_bd_self_steamuserstats_interface_version013, arg_bAchievementsToo);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)54) << 16 | 0u): { // SteamUtils009.GetSecondsSinceAppActive
      if (g_bd_flat_SteamUtils009_GetSecondsSinceAppActive == NULL || g_bd_self_steamutils009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils009_GetSecondsSinceAppActive(g_bd_self_steamutils009);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)54) << 16 | 1u): { // SteamUtils009.GetSecondsSinceComputerActive
      if (g_bd_flat_SteamUtils009_GetSecondsSinceComputerActive == NULL || g_bd_self_steamutils009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils009_GetSecondsSinceComputerActive(g_bd_self_steamutils009);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)54) << 16 | 2u): { // SteamUtils009.GetConnectedUniverse
      if (g_bd_flat_SteamUtils009_GetConnectedUniverse == NULL || g_bd_self_steamutils009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils009_GetConnectedUniverse(g_bd_self_steamutils009);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)54) << 16 | 3u): { // SteamUtils009.GetServerRealTime
      if (g_bd_flat_SteamUtils009_GetServerRealTime == NULL || g_bd_self_steamutils009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils009_GetServerRealTime(g_bd_self_steamutils009);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)54) << 16 | 4u): { // SteamUtils009.GetIPCountry
      if (g_bd_flat_SteamUtils009_GetIPCountry == NULL || g_bd_self_steamutils009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamUtils009_GetIPCountry(g_bd_self_steamutils009);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)54) << 16 | 8u): { // SteamUtils009.GetCurrentBatteryPower
      if (g_bd_flat_SteamUtils009_GetCurrentBatteryPower == NULL || g_bd_self_steamutils009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils009_GetCurrentBatteryPower(g_bd_self_steamutils009);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)54) << 16 | 9u): { // SteamUtils009.GetAppID
      if (g_bd_identity_only) { // D-51-04: identity-only reports the launching game's real AppID, never 480
        uint32_t v = g_bd_report_appid;
        if (respCap < 4) { *respLen = 0; return 1; }
        memcpy(resp, &v, 4); *respLen = 4; return 0;
      }
      if (g_bd_flat_SteamUtils009_GetAppID == NULL || g_bd_self_steamutils009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils009_GetAppID(g_bd_self_steamutils009);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)54) << 16 | 17u): { // SteamUtils009.IsOverlayEnabled
      if (g_bd_flat_SteamUtils009_IsOverlayEnabled == NULL || g_bd_self_steamutils009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUtils009_IsOverlayEnabled(g_bd_self_steamutils009);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)54) << 16 | 23u): { // SteamUtils009.GetSteamUILanguage
      if (g_bd_flat_SteamUtils009_GetSteamUILanguage == NULL || g_bd_self_steamutils009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamUtils009_GetSteamUILanguage(g_bd_self_steamutils009);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)54) << 16 | 24u): { // SteamUtils009.IsSteamRunningInVR
      if (g_bd_flat_SteamUtils009_IsSteamRunningInVR == NULL || g_bd_self_steamutils009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUtils009_IsSteamRunningInVR(g_bd_self_steamutils009);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)54) << 16 | 26u): { // SteamUtils009.IsSteamInBigPictureMode
      if (g_bd_flat_SteamUtils009_IsSteamInBigPictureMode == NULL || g_bd_self_steamutils009 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUtils009_IsSteamInBigPictureMode(g_bd_self_steamutils009);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)59) << 16 | 0u): { // SteamUser018.GetHSteamUser
      if (g_bd_flat_SteamUser018_GetHSteamUser == NULL || g_bd_self_steamuser018 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_SteamUser018_GetHSteamUser(g_bd_self_steamuser018);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)59) << 16 | 1u): { // SteamUser018.BLoggedOn
      if (g_bd_flat_SteamUser018_BLoggedOn == NULL || g_bd_self_steamuser018 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUser018_BLoggedOn(g_bd_self_steamuser018);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)59) << 16 | 2u): { // SteamUser018.GetSteamID
      if (g_bd_flat_SteamUser018_GetSteamID == NULL || g_bd_self_steamuser018 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint64_t __ret = g_bd_flat_SteamUser018_GetSteamID(g_bd_self_steamuser018);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 8);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)59) << 16 | 13u): { // SteamUser018.GetAuthSessionTicket
      if (g_bd_flat_SteamUser018_GetAuthSessionTicket == NULL || g_bd_self_steamuser018 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      static uint8_t g_bd_flat_SteamUser018_GetAuthSessionTicket_pTicket_buf[BD_WIRE_OUT_BUFFER_MAX_BYTES];
      uint32_t cap_pTicket = 0;
      if (argLen < 0u + 4) { *respLen = 0; return 1; }
      memcpy(&cap_pTicket, arg + 0u, 4);
      if (cap_pTicket > BD_WIRE_OUT_BUFFER_MAX_BYTES) cap_pTicket = BD_WIRE_OUT_BUFFER_MAX_BYTES;
      if (respCap < 12) { *respLen = 0; return 1; }
      if (cap_pTicket > respCap - 12) cap_pTicket = (uint32_t)(respCap - 12); // response must fit the scratch
      memset(g_bd_flat_SteamUser018_GetAuthSessionTicket_pTicket_buf, 0, cap_pTicket); // no earlier call's bytes cross into the game (53-17 WR-04)
      if (argLen < (0u + 4) + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      int32_t arg_cbMaxTicket; memcpy(&arg_cbMaxTicket, arg + (0u + 4), 4);
      uint32_t arg_pcbTicket = 0;
      if ((int64_t)arg_cbMaxTicket < 0 || (int64_t)arg_cbMaxTicket > (int64_t)cap_pTicket) arg_cbMaxTicket = (int32_t)cap_pTicket;
      uint32_t __ret = g_bd_flat_SteamUser018_GetAuthSessionTicket(g_bd_self_steamuser018, g_bd_flat_SteamUser018_GetAuthSessionTicket_pTicket_buf, arg_cbMaxTicket, &arg_pcbTicket, NULL);
      if (respCap < 12) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      memcpy(resp + 4, &arg_pcbTicket, 4);
      uint32_t outLen_pTicket = cap_pTicket;
      if ((uint32_t)arg_pcbTicket < outLen_pTicket) outLen_pTicket = (uint32_t)arg_pcbTicket;
      memcpy(resp + 8, &outLen_pTicket, 4);
      memcpy(resp + 8 + 4, g_bd_flat_SteamUser018_GetAuthSessionTicket_pTicket_buf, outLen_pTicket);
      *respLen = 8 + 4 + outLen_pTicket;
      return 0;
    }
    case (((uint32_t)59) << 16 | 16u): { // SteamUser018.CancelAuthTicket
      if (g_bd_flat_SteamUser018_CancelAuthTicket == NULL || g_bd_self_steamuser018 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_hAuthTicket; memcpy(&arg_hAuthTicket, arg + 0u, 4);
      g_bd_flat_SteamUser018_CancelAuthTicket(g_bd_self_steamuser018, arg_hAuthTicket);
      *respLen = 0; return 0;
    }
    case (((uint32_t)60) << 16 | 0u): { // SteamUtils007.GetSecondsSinceAppActive
      if (g_bd_flat_SteamUtils007_GetSecondsSinceAppActive == NULL || g_bd_self_steamutils007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils007_GetSecondsSinceAppActive(g_bd_self_steamutils007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)60) << 16 | 1u): { // SteamUtils007.GetSecondsSinceComputerActive
      if (g_bd_flat_SteamUtils007_GetSecondsSinceComputerActive == NULL || g_bd_self_steamutils007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils007_GetSecondsSinceComputerActive(g_bd_self_steamutils007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)60) << 16 | 2u): { // SteamUtils007.GetConnectedUniverse
      if (g_bd_flat_SteamUtils007_GetConnectedUniverse == NULL || g_bd_self_steamutils007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils007_GetConnectedUniverse(g_bd_self_steamutils007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)60) << 16 | 3u): { // SteamUtils007.GetServerRealTime
      if (g_bd_flat_SteamUtils007_GetServerRealTime == NULL || g_bd_self_steamutils007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils007_GetServerRealTime(g_bd_self_steamutils007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)60) << 16 | 4u): { // SteamUtils007.GetIPCountry
      if (g_bd_flat_SteamUtils007_GetIPCountry == NULL || g_bd_self_steamutils007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamUtils007_GetIPCountry(g_bd_self_steamutils007);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)60) << 16 | 8u): { // SteamUtils007.GetCurrentBatteryPower
      if (g_bd_flat_SteamUtils007_GetCurrentBatteryPower == NULL || g_bd_self_steamutils007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils007_GetCurrentBatteryPower(g_bd_self_steamutils007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)60) << 16 | 9u): { // SteamUtils007.GetAppID
      if (g_bd_identity_only) { // D-51-04: identity-only reports the launching game's real AppID, never 480
        uint32_t v = g_bd_report_appid;
        if (respCap < 4) { *respLen = 0; return 1; }
        memcpy(resp, &v, 4); *respLen = 4; return 0;
      }
      if (g_bd_flat_SteamUtils007_GetAppID == NULL || g_bd_self_steamutils007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint32_t __ret = g_bd_flat_SteamUtils007_GetAppID(g_bd_self_steamutils007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)60) << 16 | 17u): { // SteamUtils007.IsOverlayEnabled
      if (g_bd_flat_SteamUtils007_IsOverlayEnabled == NULL || g_bd_self_steamutils007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUtils007_IsOverlayEnabled(g_bd_self_steamutils007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)60) << 16 | 23u): { // SteamUtils007.GetSteamUILanguage
      if (g_bd_flat_SteamUtils007_GetSteamUILanguage == NULL || g_bd_self_steamutils007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_SteamUtils007_GetSteamUILanguage(g_bd_self_steamutils007);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)60) << 16 | 24u): { // SteamUtils007.IsSteamRunningInVR
      if (g_bd_flat_SteamUtils007_IsSteamRunningInVR == NULL || g_bd_self_steamutils007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_SteamUtils007_IsSteamRunningInVR(g_bd_self_steamutils007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)61) << 16 | 0u): { // STEAMAPPS_INTERFACE_VERSION007.BIsSubscribed
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribed == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribed(g_bd_self_steamapps_interface_version007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)61) << 16 | 1u): { // STEAMAPPS_INTERFACE_VERSION007.BIsLowViolence
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsLowViolence == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsLowViolence(g_bd_self_steamapps_interface_version007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)61) << 16 | 2u): { // STEAMAPPS_INTERFACE_VERSION007.BIsCybercafe
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsCybercafe == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsCybercafe(g_bd_self_steamapps_interface_version007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)61) << 16 | 3u): { // STEAMAPPS_INTERFACE_VERSION007.BIsVACBanned
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsVACBanned == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsVACBanned(g_bd_self_steamapps_interface_version007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)61) << 16 | 4u): { // STEAMAPPS_INTERFACE_VERSION007.GetCurrentGameLanguage
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetCurrentGameLanguage == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetCurrentGameLanguage(g_bd_self_steamapps_interface_version007);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)61) << 16 | 5u): { // STEAMAPPS_INTERFACE_VERSION007.GetAvailableGameLanguages
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetAvailableGameLanguages == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      const char *result = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetAvailableGameLanguages(g_bd_self_steamapps_interface_version007);
      if (result == NULL) { *respLen = 0; return 1; }
      uint32_t strLen = (uint32_t)strlen(result);
      if (strLen > 255) strLen = 255;
      if (respCap < 4 + strLen) { *respLen = 0; return 1; }
      memcpy(resp, &strLen, 4);
      memcpy(resp + 4, result, strLen);
      *respLen = 4 + strLen;
      return 0;
    }
    case (((uint32_t)61) << 16 | 6u): { // STEAMAPPS_INTERFACE_VERSION007.BIsSubscribedApp
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedApp == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_appID; memcpy(&arg_appID, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedApp(g_bd_self_steamapps_interface_version007, arg_appID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)61) << 16 | 7u): { // STEAMAPPS_INTERFACE_VERSION007.BIsDlcInstalled
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsDlcInstalled == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_appID; memcpy(&arg_appID, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsDlcInstalled(g_bd_self_steamapps_interface_version007, arg_appID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)61) << 16 | 8u): { // STEAMAPPS_INTERFACE_VERSION007.GetEarliestPurchaseUnixTime
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetEarliestPurchaseUnixTime == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_nAppID; memcpy(&arg_nAppID, arg + 0u, 4);
      uint32_t __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetEarliestPurchaseUnixTime(g_bd_self_steamapps_interface_version007, arg_nAppID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)61) << 16 | 9u): { // STEAMAPPS_INTERFACE_VERSION007.BIsSubscribedFromFreeWeekend
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedFromFreeWeekend == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsSubscribedFromFreeWeekend(g_bd_self_steamapps_interface_version007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)61) << 16 | 10u): { // STEAMAPPS_INTERFACE_VERSION007.GetDLCCount
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetDLCCount == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetDLCCount(g_bd_self_steamapps_interface_version007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)61) << 16 | 19u): { // STEAMAPPS_INTERFACE_VERSION007.BIsAppInstalled
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsAppInstalled == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      if (argLen < 0u + 4) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23
      uint32_t arg_appID; memcpy(&arg_appID, arg + 0u, 4);
      int __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_BIsAppInstalled(g_bd_self_steamapps_interface_version007, arg_appID);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    case (((uint32_t)61) << 16 | 20u): { // STEAMAPPS_INTERFACE_VERSION007.GetAppOwner
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetAppOwner == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      uint64_t __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetAppOwner(g_bd_self_steamapps_interface_version007);
      if (respCap < 8) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 8);
      *respLen = 8;
      return 0;
    }
    case (((uint32_t)61) << 16 | 23u): { // STEAMAPPS_INTERFACE_VERSION007.GetAppBuildId
      if (g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetAppBuildId == NULL || g_bd_self_steamapps_interface_version007 == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called
      int32_t __ret = g_bd_flat_STEAMAPPS_INTERFACE_VERSION007_GetAppBuildId(g_bd_self_steamapps_interface_version007);
      if (respCap < 4) { *respLen = 0; return 1; }
      memcpy(resp, &__ret, 4);
      *respLen = 4;
      return 0;
    }
    default:
      return 1; // T-51-23: unknown (ordinal, slot) pair -- never read
  }
}

#endif /* GAMELIB_BRIDGE_DISPATCH_H */
