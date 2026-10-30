// Reproduces CSteamID, UserStatsReceived_t and the multiplayer callback and
// networking structs from the Steamworks SDK 165 headers (field names, types
// and declaration order only; no header text), with the SDK's own pack regions:
// callback structs use the pack macro below, CSteamID/SteamNetworkingIPAddr/
// SteamNetworkingIdentity are pack(1), the networking-messages callbacks are
// pack(1), and SteamNetworkingMessage_t and the matchmaking server types sit
// outside any pack region (natural alignment).
// Windows builds use pack(8) (VALVE_CALLBACK_PACK_LARGE), Mac/Linux builds
// pack(4) (VALVE_CALLBACK_PACK_SMALL, selected here with -DGL_SMALLPACK).
// This file is compiled ONLY by the layout measurement dumper
// (meta/__tests__/msvcCallbackBaseLayout.test.ts); it is never shipped.
// Self-contained: no includes.

typedef unsigned int uint32;
typedef unsigned long long uint64;

typedef unsigned char uint8;
typedef unsigned short uint16;
typedef int int32;
typedef long long int64;
typedef int int32_t;
typedef long long int64_t;
typedef uint64 SteamAPICall_t;
typedef int32 HSteamUser;
typedef uint32 HSteamNetConnection;
typedef uint32 HSteamListenSocket;
typedef uint32 SteamNetworkingPOPID;
typedef int64 SteamNetworkingMicroseconds;

enum EResult { k_EResultNone = 0, k_EResultOK = 1, k_EResultFail = 2 };
enum ESteamNetworkingIdentityType { k_ESteamNetworkingIdentityType_Invalid = 0 };
enum ESteamNetworkingConnectionState { k_ESteamNetworkingConnectionState_None = 0 };
enum ESteamNetworkingAvailability { k_ESteamNetworkingAvailability_Unknown = 0 };
enum ESteamNetworkingConfigValue { k_ESteamNetworkingConfig_Invalid = 0 };
enum ESteamNetworkingConfigDataType { k_ESteamNetworkingConfig_Int32 = 1 };

enum {
  k_iSteamFriendsCallbacks = 300,
  k_iSteamMatchmakingCallbacks = 500,
  k_iSteamUtilsCallbacks = 700,
  k_iSteamNetworkingCallbacks = 1200,
  k_iSteamNetworkingSocketsCallbacks = 1220,
  k_iSteamNetworkingMessagesCallbacks = 1250,
  k_iSteamNetworkingUtilsCallbacks = 1280
};

const int k_cchMaxRichPresenceValueLength = 256;
const int k_cchSteamNetworkingMaxConnectionCloseReason = 128;
const int k_cchSteamNetworkingMaxConnectionDescription = 128;
const int k_cbMaxGameServerGameDir = 32;
const int k_cbMaxGameServerMapName = 32;
const int k_cbMaxGameServerGameDescription = 64;
const int k_cbMaxGameServerName = 64;
const int k_cbMaxGameServerTags = 128;


// ---- CSteamID: pack(1) exactly as steamclientpublic.h defines it ----------
#pragma pack(push, 1)
class CSteamID {
 public:
  CSteamID() { m_steamid.m_unAll64Bits = 0; }
  uint64 ConvertToUint64() const { return m_steamid.m_unAll64Bits; }

 private:
  union SteamID_t {
    struct SteamIDComponent_t {
      uint32 m_unAccountID : 32;
      unsigned int m_unAccountInstance : 20;
      unsigned int m_EAccountType : 4;
      int m_EUniverse : 8;
    } m_comp;
    uint64 m_unAll64Bits;
  } m_steamid;
};
#pragma pack(pop)

// ---- UserStatsReceived_t (quick k51), kept byte-for-byte as first measured --
// Its CSteamIDLegacy member is declared INSIDE the callback pack region (so it
// is 8/4-aligned), which is NOT how the SDK declares CSteamID. The values this
// produces (steamID at 16 on Windows) are pinned by USER_STATS_RECEIVED_LAYOUT
// and gamelib_cbqueue.h; see the 58-02 SUMMARY for the discrepancy with the
// pack(1) CSteamID above.
#ifdef GL_SMALLPACK
#pragma pack(push, 4)
#else
#pragma pack(push, 8)
#endif

class CSteamIDLegacy {
 public:
  CSteamIDLegacy() { m_steamid.m_unAll64Bits = 0; }
  uint64 ConvertToUint64() const { return m_steamid.m_unAll64Bits; }

 private:
  union SteamID_t {
    struct SteamIDComponent_t {
      uint32 m_unAccountID : 32;
      unsigned int m_unAccountInstance : 20;
      unsigned int m_EAccountType : 4;
      int m_EUniverse : 8;
    } m_comp;
    uint64 m_unAll64Bits;
  } m_steamid;
};

struct UserStatsReceived_t {
  enum { k_iCallback = 1101 };
  uint64 m_nGameID;
  EResult m_eResult;
  CSteamIDLegacy m_steamIDUser;
};

// ---- networking value types (steamnetworkingtypes.h) -----------------------
#pragma pack(push, 1)
struct SteamNetworkingIPAddr {
  struct IPv4MappedAddress {
    uint64 m_8zeros;
    uint16 m_0000;
    uint16 m_ffff;
    uint8 m_ip[4];
  };
  union {
    uint8 m_ipv6[16];
    IPv4MappedAddress m_ipv4;
  } data;
  uint16 m_port;
};

struct SteamNetworkingIdentity {
  enum {
    k_cchMaxGenericString = 32,
    k_cchMaxXboxPairwiseID = 33,
    k_cbMaxGenericBytes = 32,
    k_cchMaxString = 128
  };
  ESteamNetworkingIdentityType m_eType;
  int m_cbSize;
  union {
    uint64 m_steamID64;
    uint64 m_PSNID;
    char m_szGenericString[k_cchMaxGenericString];
    char m_szXboxPairwiseID[k_cchMaxXboxPairwiseID];
    uint8 m_genericBytes[k_cbMaxGenericBytes];
    char m_szUnknownRawString[k_cchMaxString];
    SteamNetworkingIPAddr m_ip;
    uint32 m_reserved[32];
  } data;
};
#pragma pack(pop)

struct SteamNetConnectionInfo_t {
  SteamNetworkingIdentity m_identityRemote;
  int64 m_nUserData;
  HSteamListenSocket m_hListenSocket;
  SteamNetworkingIPAddr m_addrRemote;
  uint16 m__pad1;
  SteamNetworkingPOPID m_idPOPRemote;
  SteamNetworkingPOPID m_idPOPRelay;
  ESteamNetworkingConnectionState m_eState;
  int m_eEndReason;
  char m_szEndDebug[k_cchSteamNetworkingMaxConnectionCloseReason];
  char m_szConnectionDescription[k_cchSteamNetworkingMaxConnectionDescription];
  int m_nFlags;
  uint32 reserved[63];
};

struct SteamNetConnectionRealTimeStatus_t {
  ESteamNetworkingConnectionState m_eState;
  int m_nPing;
  float m_flConnectionQualityLocal;
  float m_flConnectionQualityRemote;
  float m_flOutPacketsPerSec;
  float m_flOutBytesPerSec;
  float m_flInPacketsPerSec;
  float m_flInBytesPerSec;
  int m_nSendRateBytesPerSecond;
  int m_cbPendingUnreliable;
  int m_cbPendingReliable;
  int m_cbSentUnackedReliable;
  SteamNetworkingMicroseconds m_usecQueueTime;
  int32 m_usecMaxJitter;
  uint32 reserved[15];
};

struct SteamNetConnectionRealTimeLaneStatus_t {
  int m_cbPendingUnreliable;
  int m_cbPendingReliable;
  int m_cbSentUnackedReliable;
  int _reservePad1;
  SteamNetworkingMicroseconds m_usecQueueTime;
  uint32 reserved[10];
};

// ---- legacy P2P session state (isteamnetworking.h, callback pack) ----------
struct P2PSessionState_t {
  uint8 m_bConnectionActive;
  uint8 m_bConnecting;
  uint8 m_eP2PSessionError;
  uint8 m_bUsingRelay;
  int32 m_nBytesQueuedForSend;
  int32 m_nPacketsQueuedForSend;
  uint32 m_nRemoteIP;
  uint16 m_nRemotePort;
};

// ---- callback structs in the callback pack region --------------------------
struct LobbyInvite_t {
  enum { k_iCallback = k_iSteamMatchmakingCallbacks + 3 };
  uint64 m_ulSteamIDUser;
  uint64 m_ulSteamIDLobby;
  uint64 m_ulGameID;
};
struct LobbyEnter_t {
  enum { k_iCallback = k_iSteamMatchmakingCallbacks + 4 };
  uint64 m_ulSteamIDLobby;
  uint32 m_rgfChatPermissions;
  bool m_bLocked;
  uint32 m_EChatRoomEnterResponse;
};
struct LobbyDataUpdate_t {
  enum { k_iCallback = k_iSteamMatchmakingCallbacks + 5 };
  uint64 m_ulSteamIDLobby;
  uint64 m_ulSteamIDMember;
  uint8 m_bSuccess;
};
struct LobbyChatUpdate_t {
  enum { k_iCallback = k_iSteamMatchmakingCallbacks + 6 };
  uint64 m_ulSteamIDLobby;
  uint64 m_ulSteamIDUserChanged;
  uint64 m_ulSteamIDMakingChange;
  uint32 m_rgfChatMemberStateChange;
};
struct LobbyChatMsg_t {
  enum { k_iCallback = k_iSteamMatchmakingCallbacks + 7 };
  uint64 m_ulSteamIDLobby;
  uint64 m_ulSteamIDUser;
  uint8 m_eChatEntryType;
  uint32 m_iChatID;
};
struct LobbyMatchList_t {
  enum { k_iCallback = k_iSteamMatchmakingCallbacks + 10 };
  uint32 m_nLobbiesMatching;
};
struct LobbyKicked_t {
  enum { k_iCallback = k_iSteamMatchmakingCallbacks + 12 };
  uint64 m_ulSteamIDLobby;
  uint64 m_ulSteamIDAdmin;
  uint8 m_bKickedDueToDisconnect;
};
struct LobbyCreated_t {
  enum { k_iCallback = k_iSteamMatchmakingCallbacks + 13 };
  EResult m_eResult;
  uint64 m_ulSteamIDLobby;
};
struct P2PSessionRequest_t {
  enum { k_iCallback = k_iSteamNetworkingCallbacks + 2 };
  CSteamID m_steamIDRemote;
};
struct P2PSessionConnectFail_t {
  enum { k_iCallback = k_iSteamNetworkingCallbacks + 3 };
  CSteamID m_steamIDRemote;
  uint8 m_eP2PSessionError;
};
struct SteamNetConnectionStatusChangedCallback_t {
  enum { k_iCallback = k_iSteamNetworkingSocketsCallbacks + 1 };
  HSteamNetConnection m_hConn;
  SteamNetConnectionInfo_t m_info;
  ESteamNetworkingConnectionState m_eOldState;
};
struct SteamNetAuthenticationStatus_t {
  enum { k_iCallback = k_iSteamNetworkingSocketsCallbacks + 2 };
  ESteamNetworkingAvailability m_eAvail;
  char m_debugMsg[256];
};
struct SteamAPICallCompleted_t {
  enum { k_iCallback = k_iSteamUtilsCallbacks + 3 };
  SteamAPICall_t m_hAsyncCall;
  int m_iCallback;
  uint32 m_cubParam;
};
struct GameLobbyJoinRequested_t {
  enum { k_iCallback = k_iSteamFriendsCallbacks + 33 };
  CSteamID m_steamIDLobby;
  CSteamID m_steamIDFriend;
};
struct GameRichPresenceJoinRequested_t {
  enum { k_iCallback = k_iSteamFriendsCallbacks + 37 };
  CSteamID m_steamIDFriend;
  char m_rgchConnect[k_cchMaxRichPresenceValueLength];
};
struct CallbackMsg_t {
  HSteamUser m_hSteamUser;
  int m_iCallback;
  uint8 *m_pubParam;
  int m_cubParam;
};

#pragma pack(pop)

// ---- networking-messages callbacks: pack(1) in the SDK ---------------------
#pragma pack(push, 1)
struct SteamNetworkingMessagesSessionRequest_t {
  enum { k_iCallback = k_iSteamNetworkingMessagesCallbacks + 1 };
  SteamNetworkingIdentity m_identityRemote;
};
struct SteamNetworkingMessagesSessionFailed_t {
  enum { k_iCallback = k_iSteamNetworkingMessagesCallbacks + 2 };
  SteamNetConnectionInfo_t m_info;
};
#pragma pack(pop)

// ---- outside any pack region: natural alignment ----------------------------
struct SteamRelayNetworkStatus_t {
  enum { k_iCallback = k_iSteamNetworkingUtilsCallbacks + 1 };
  ESteamNetworkingAvailability m_eAvail;
  int m_bPingMeasurementInProgress;
  ESteamNetworkingAvailability m_eAvailNetworkConfig;
  ESteamNetworkingAvailability m_eAvailAnyRelay;
  char m_debugMsg[256];
};

struct SteamNetworkingMessage_t {
  void *m_pData;
  int m_cbSize;
  HSteamNetConnection m_conn;
  SteamNetworkingIdentity m_identityPeer;
  int64 m_nConnUserData;
  SteamNetworkingMicroseconds m_usecTimeReceived;
  int64 m_nMessageNumber;
  void (*m_pfnFreeData)(SteamNetworkingMessage_t *pMsg);
  void (*m_pfnRelease)(SteamNetworkingMessage_t *pMsg);
  int m_nChannel;
  int m_nFlags;
  int64 m_nUserData;
  uint16 m_idxLane;
  uint16 _pad1__;
};

struct SteamNetworkPingLocation_t {
  uint8 m_data[512];
};

struct SteamNetworkingConfigValue_t {
  ESteamNetworkingConfigValue m_eValue;
  ESteamNetworkingConfigDataType m_eDataType;
  union {
    int32_t m_int32;
    int64_t m_int64;
    float m_float;
    const char *m_string;
    void *m_ptr;
  } m_val;
};

struct servernetadr_t {
  uint16 m_usConnectionPort;
  uint16 m_usQueryPort;
  uint32 m_unIP;
};

struct gameserveritem_t {
  servernetadr_t m_NetAdr;
  int m_nPing;
  bool m_bHadSuccessfulResponse;
  bool m_bDoNotRefresh;
  char m_szGameDir[k_cbMaxGameServerGameDir];
  char m_szMap[k_cbMaxGameServerMapName];
  char m_szGameDescription[k_cbMaxGameServerGameDescription];
  uint32 m_nAppID;
  int m_nPlayers;
  int m_nMaxPlayers;
  int m_nBotPlayers;
  bool m_bPassword;
  bool m_bSecure;
  uint32 m_ulTimeLastPlayed;
  int m_nServerVersion;
  char m_szServerName[k_cbMaxGameServerName];
  char m_szGameTags[k_cbMaxGameServerTags];
  CSteamID m_steamID;
  int m_nCurrentFriendCount;
  int m_nTotalFriendCount;
};

// ---- callback ids: a wrong id fails compilation of this fixture ------------
static_assert(UserStatsReceived_t::k_iCallback == 1101, "id");
static_assert(LobbyInvite_t::k_iCallback == 503, "id");
static_assert(LobbyEnter_t::k_iCallback == 504, "id");
static_assert(LobbyDataUpdate_t::k_iCallback == 505, "id");
static_assert(LobbyChatUpdate_t::k_iCallback == 506, "id");
static_assert(LobbyChatMsg_t::k_iCallback == 507, "id");
static_assert(LobbyMatchList_t::k_iCallback == 510, "id");
static_assert(LobbyKicked_t::k_iCallback == 512, "id");
static_assert(LobbyCreated_t::k_iCallback == 513, "id");
static_assert(P2PSessionRequest_t::k_iCallback == 1202, "id");
static_assert(P2PSessionConnectFail_t::k_iCallback == 1203, "id");
static_assert(SteamNetConnectionStatusChangedCallback_t::k_iCallback == 1221, "id");
static_assert(SteamNetAuthenticationStatus_t::k_iCallback == 1222, "id");
static_assert(SteamNetworkingMessagesSessionRequest_t::k_iCallback == 1251, "id");
static_assert(SteamNetworkingMessagesSessionFailed_t::k_iCallback == 1252, "id");
static_assert(SteamRelayNetworkStatus_t::k_iCallback == 1281, "id");
static_assert(SteamAPICallCompleted_t::k_iCallback == 703, "id");
static_assert(GameLobbyJoinRequested_t::k_iCallback == 333, "id");
static_assert(GameRichPresenceJoinRequested_t::k_iCallback == 337, "id");

// Non-inline use so the records are emitted into the AST layout dump.
uint64 gl_touch_user_stats(UserStatsReceived_t *p) {
  return p->m_nGameID + p->m_steamIDUser.ConvertToUint64();
}

#define GL_FORCE(T) static_assert(sizeof(T) > 0, #T)
GL_FORCE(LobbyInvite_t);
GL_FORCE(LobbyEnter_t);
GL_FORCE(LobbyDataUpdate_t);
GL_FORCE(LobbyChatUpdate_t);
GL_FORCE(LobbyChatMsg_t);
GL_FORCE(LobbyMatchList_t);
GL_FORCE(LobbyKicked_t);
GL_FORCE(LobbyCreated_t);
GL_FORCE(P2PSessionRequest_t);
GL_FORCE(P2PSessionConnectFail_t);
GL_FORCE(SteamNetConnectionStatusChangedCallback_t);
GL_FORCE(SteamNetAuthenticationStatus_t);
GL_FORCE(SteamNetworkingMessagesSessionRequest_t);
GL_FORCE(SteamNetworkingMessagesSessionFailed_t);
GL_FORCE(SteamRelayNetworkStatus_t);
GL_FORCE(SteamAPICallCompleted_t);
GL_FORCE(GameLobbyJoinRequested_t);
GL_FORCE(GameRichPresenceJoinRequested_t);
GL_FORCE(SteamNetworkingIdentity);
GL_FORCE(SteamNetworkingIPAddr);
GL_FORCE(SteamNetConnectionInfo_t);
GL_FORCE(SteamNetConnectionRealTimeStatus_t);
GL_FORCE(P2PSessionState_t);
GL_FORCE(SteamNetworkingMessage_t);
GL_FORCE(CallbackMsg_t);
GL_FORCE(SteamNetworkPingLocation_t);
GL_FORCE(SteamNetworkingConfigValue_t);
GL_FORCE(SteamNetConnectionRealTimeLaneStatus_t);
GL_FORCE(servernetadr_t);
GL_FORCE(gameserveritem_t);
