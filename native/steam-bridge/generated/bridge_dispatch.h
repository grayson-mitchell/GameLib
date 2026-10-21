/**
 * GENERATED FILE -- DO NOT EDIT BY HAND.
 * Produced by meta/gen_vtables.ts (`pnpm gen-vtables`), 51-10 -- the
 * helper-side (native arm64, macOS) half of the SAME wire
 * native/steam-bridge/generated/steam_api_shim.c marshals the shim side
 * of. #include'd from native/steam-bridge/helper/bridge_helper.c.
 *
 * Interfaces covered: SteamUser023, SteamFriends018, SteamUser016, SteamFriends011, SteamUtils005, STEAMAPPS_INTERFACE_VERSION004, STEAMUSERSTATS_INTERFACE_VERSION010.
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
#define BRIDGE_DISPATCH_TABLE_HASH "f6e26e65fd04"

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

#define BD_SLOT_SteamUser023_GetHSteamUser 0
typedef int32_t (*BDFlatFn_SteamUser023_GetHSteamUser_t)(void *);
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
  return 1;
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
    default:
      return 1; // T-51-23: unknown (ordinal, slot) pair -- never read
  }
}

#endif /* GAMELIB_BRIDGE_DISPATCH_H */
