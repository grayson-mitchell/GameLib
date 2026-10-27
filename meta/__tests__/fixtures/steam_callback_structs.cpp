// Reproduces CSteamID and UserStatsReceived_t from the Steamworks SDK
// (steamclientpublic.h / isteamuserstats.h), declaration order preserved.
// Windows builds use pack(8) (VALVE_CALLBACK_PACK_LARGE), Mac/Linux builds
// pack(4) (VALVE_CALLBACK_PACK_SMALL, selected here with -DGL_SMALLPACK).
// This file is compiled ONLY by the layout measurement dumper
// (meta/__tests__/msvcCallbackBaseLayout.test.ts); it is never shipped.
// Self-contained: no includes.

typedef unsigned int uint32;
typedef unsigned long long uint64;

enum EResult { k_EResultNone = 0, k_EResultOK = 1, k_EResultFail = 2 };

#ifdef GL_SMALLPACK
#pragma pack(push, 4)
#else
#pragma pack(push, 8)
#endif

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

struct UserStatsReceived_t {
  enum { k_iCallback = 1101 };
  uint64 m_nGameID;
  EResult m_eResult;
  CSteamID m_steamIDUser;
};

#pragma pack(pop)

// Non-inline use so the record is emitted into the AST layout dump.
uint64 gl_touch_user_stats(UserStatsReceived_t *p) {
  return p->m_nGameID + p->m_steamIDUser.ConvertToUint64();
}
