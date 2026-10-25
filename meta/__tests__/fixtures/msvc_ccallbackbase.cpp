// Reproduces the CCallbackBase / CCallbackImpl / CCallback hierarchy from the
// Steamworks SDK header steam_api_common.h (approximately lines 138-230),
// declaration order preserved. This file is compiled ONLY by the layout
// measurement dumper (meta/__tests__/msvcCallbackBaseLayout.test.ts); it is
// never shipped. Self-contained: no includes.

typedef unsigned char uint8;
typedef unsigned long long uint64;
typedef uint64 SteamAPICall_t;

class CCallbackMgr;

class CCallbackBase {
 public:
  CCallbackBase() {
    m_nCallbackFlags = 0;
    m_iCallback = 0;
  }
  // NOTE: no virtual destructor
  virtual void Run(void *pvParam) = 0;
  virtual void Run(void *pvParam, bool bIOFailure,
                   SteamAPICall_t hSteamAPICall) = 0;
  int GetICallback() { return m_iCallback; }
  virtual int GetCallbackSizeBytes() = 0;

 protected:
  enum {
    k_ECallbackFlagsRegistered = 0x01,
    k_ECallbackFlagsGameServer = 0x02
  };
  uint8 m_nCallbackFlags;
  int m_iCallback;
  friend class CCallbackMgr;

 private:
  CCallbackBase(const CCallbackBase &);
  CCallbackBase &operator=(const CCallbackBase &);
};

template <int sizeof_P>
class CCallbackImpl : protected CCallbackBase {
 public:
  virtual ~CCallbackImpl() {}

 protected:
  virtual void Run(void *pvParam) = 0;
  virtual void Run(void *pvParam, bool, SteamAPICall_t) { Run(pvParam); }
  virtual int GetCallbackSizeBytes() { return sizeof_P; }
};

template <class T, class P, bool bGameserver = false>
class CCallback : public CCallbackImpl<sizeof(P)> {
 public:
  typedef void (T::*func_t)(P *);
  CCallback(T *pObj, func_t func) : m_pObj(pObj), m_Func(func) {}

 protected:
  virtual void Run(void *pvParam) { (m_pObj->*m_Func)((P *)pvParam); }
  T *m_pObj;
  func_t m_Func;
};

struct P {
  char bytes[2572];
};

struct Obj {
  void OnCallback(P *) {}
};

// Non-inline so both vtables are emitted.
void ForceVtableEmission(Obj *o) {
  CCallback<Obj, P> cb(o, &Obj::OnCallback);
  (void)cb;
}
