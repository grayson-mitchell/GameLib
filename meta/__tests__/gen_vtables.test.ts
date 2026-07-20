import { readFileSync } from 'fs'
import { join } from 'path'

import {
  computeRetN,
  generateDefFile,
  generateShimC,
  isSretReturn,
  is64BitRegisterReturn,
  paramWidth,
  toVersionedAccessorSuffix,
  FLAT_EXPORTS_SUPERSET,
  type InterfaceManifest
} from '../gen_vtables'

const isteamuser: InterfaceManifest = JSON.parse(
  readFileSync(
    join(__dirname, '..', 'sdk', 'isteamuser.manifest.json'),
    'utf-8'
  )
)
const isteamfriends: InterfaceManifest = JSON.parse(
  readFileSync(
    join(__dirname, '..', 'sdk', 'isteamfriends.manifest.json'),
    'utf-8'
  )
)

describe('gen_vtables', () => {
  describe('manifest inputs (D-09 -- never a vendored Valve .h)', () => {
    it('the generator source only references meta/sdk/*.manifest.json, never a .h include', () => {
      const generatorSource = readFileSync(
        join(__dirname, '..', 'gen_vtables.ts'),
        'utf-8'
      )
      expect(generatorSource).toContain('isteamuser.manifest')
      expect(generatorSource).toContain('isteamfriends.manifest')
      // No path anywhere in the generator ends in a vendored SDK header.
      expect(generatorSource).not.toMatch(/isteamuser\.h/)
      expect(generatorSource).not.toMatch(/isteamfriends\.h/)
      expect(generatorSource).not.toMatch(/#include\s+"[^"]+\.h"/)
    })
  })

  describe('computeRetN (Pattern 2 / Pitfall 2 -- per-slot stack cleanup)', () => {
    it('a zero-arg slot (GetHSteamUser) emits ret 0', () => {
      const method = isteamuser.methods.find((m) => m.name === 'GetHSteamUser')!
      expect(computeRetN(method)).toBe(0)
    })

    it('a single-int-param slot (BSetDurationControlOnlineState) emits ret 4', () => {
      const method = isteamuser.methods.find(
        (m) => m.name === 'BSetDurationControlOnlineState'
      )!
      expect(computeRetN(method)).toBe(4)
    })

    it('a two-int-param slot emits ret 8', () => {
      const method = isteamuser.methods.find(
        (m) => m.name === 'SetTwoIntTest_TESTONLY'
      )!
      expect(computeRetN(method)).toBe(8)
    })

    it('a single-uint64-param slot emits ret 8 (distinct mechanism from the two-int case)', () => {
      const method = isteamuser.methods.find(
        (m) => m.name === 'SetUint64Test_TESTONLY'
      )!
      expect(paramWidth('uint64')).toBe(8)
      expect(computeRetN(method)).toBe(8)
    })

    it('the sret-exercise slot (struct return > 8 bytes) adds 4 bytes for the hidden return pointer', () => {
      const method = isteamuser.methods.find(
        (m) => m.name === 'GetUserStatsSummary_TESTONLY'
      )!
      expect(isSretReturn(method)).toBe(true)
      expect(computeRetN(method)).toBe(4) // 0 real params + 4-byte hidden sret pointer
    })
  })

  describe('slot-order preservation (manifest declaration order 1:1)', () => {
    it('slot 2 in the ISteamUser manifest is GetSteamID', () => {
      const slot2 = isteamuser.methods.find((m) => m.slot === 2)
      expect(slot2?.name).toBe('GetSteamID')
    })

    it('the generated vtable array lists GetHSteamUser, BLoggedOn, GetSteamID in that order', () => {
      const c = generateShimC([isteamuser, isteamfriends])
      const arrayMatch = c.match(
        /static vfn g_steamuser023_vtbl\[\d+\] = \{([\s\S]*?)\};/
      )
      expect(arrayMatch).not.toBeNull()
      const arrayBody = arrayMatch![1]
      const idxHSteamUser = arrayBody.indexOf('vt_SteamUser023_GetHSteamUser')
      const idxLoggedOn = arrayBody.indexOf('vt_SteamUser023_BLoggedOn')
      const idxSteamID = arrayBody.indexOf('vt_SteamUser023_GetSteamID')
      expect(idxHSteamUser).toBeGreaterThanOrEqual(0)
      expect(idxLoggedOn).toBeGreaterThan(idxHSteamUser)
      expect(idxSteamID).toBeGreaterThan(idxLoggedOn)
    })
  })

  describe('GetSteamID 64-bit return marshaling (not a 4-byte return)', () => {
    it('is64BitRegisterReturn is true for GetSteamID (CSteamID, EDX:EAX)', () => {
      const method = isteamuser.methods.find((m) => m.name === 'GetSteamID')!
      expect(is64BitRegisterReturn(method)).toBe(true)
    })

    it('the generated stub declares a uint64_t return type and an 8-byte retbuf', () => {
      const c = generateShimC([isteamuser, isteamfriends])
      const stubMatch = c.match(
        /static uint64_t __attribute__\(\(thiscall\)\) vt_SteamUser023_GetSteamID\(void \*self\) \{[\s\S]*?\}/
      )
      expect(stubMatch).not.toBeNull()
      expect(stubMatch![0]).toContain('retbuf[8]')
      expect(stubMatch![0]).not.toContain('retbuf[4]')
    })
  })

  describe('sret path is generated and distinct from the register-return path', () => {
    it('the sret-exercise stub takes a hidden sretOut pointer and returns void', () => {
      const c = generateShimC([isteamuser, isteamfriends])
      expect(c).toContain(
        'static void __attribute__((thiscall)) vt_SteamUser023_GetUserStatsSummary_TESTONLY(void *self, void *sretOut) {'
      )
      expect(c).toContain('memcpy(sretOut, retbuf, 16);')
    })

    it('a register-return stub (GetHSteamUser) has no sretOut parameter', () => {
      const c = generateShimC([isteamuser, isteamfriends])
      const stubMatch = c.match(/vt_SteamUser023_GetHSteamUser\(void \*self\)/)
      expect(stubMatch).not.toBeNull()
    })
  })

  describe('per-slot ret N annotations present in generated source (Pitfall 2 auditability)', () => {
    it('contains "ret 0" for the zero-arg slot', () => {
      const c = generateShimC([isteamuser, isteamfriends])
      expect(c).toMatch(
        /GetHSteamUser\([^)]*\) -> HSteamUser \| __thiscall ret 0/
      )
    })

    it('contains "ret 4" for the single-int-param slot', () => {
      const c = generateShimC([isteamuser, isteamfriends])
      expect(c).toMatch(
        /BSetDurationControlOnlineState\(int32 eNewState\) -> bool \| __thiscall ret 4/
      )
    })

    it('contains "ret 8" for the two-int-param slot and the uint64-param slot', () => {
      const c = generateShimC([isteamuser, isteamfriends])
      expect(c).toMatch(
        /SetTwoIntTest_TESTONLY\([^)]*\) -> void \| __thiscall ret 8/
      )
      expect(c).toMatch(
        /SetUint64Test_TESTONLY\([^)]*\) -> void \| __thiscall ret 8/
      )
    })
  })

  describe('wire marshaling uses the Pattern 3 frame (interface ordinal + slot index)', () => {
    it('every bridge_transact call site is keyed by the manifest ordinal + slot, never a hand-different layout', () => {
      const c = generateShimC([isteamuser, isteamfriends])
      // ISteamUser ordinal=1: GetSteamID is slot 2
      expect(c).toContain('bridge_transact(1, 2, argbuf')
      // ISteamFriends ordinal=2: GetPersonaName is slot 0
      expect(c).toContain('bridge_transact(2, 0, argbuf')
    })

    it('the request frame packs [len][request_id][ordinal][slot][argblob] per 24-RESEARCH.md Pattern 3', () => {
      const c = generateShimC([isteamuser, isteamfriends])
      expect(c).toContain('uint32_t frameLen = 4 + 2 + 2 + argLen')
      expect(c).toContain('memcpy(header + 8, &ordinal, 2)')
      expect(c).toContain('memcpy(header + 10, &slot, 2)')
    })
  })

  describe('.def flat-export coverage (acceptance-set superset, R3 finding #9)', () => {
    it('exports SteamAPI_Init, SteamAPI_Shutdown, SteamAPI_RunCallbacks', () => {
      const def = generateDefFile([isteamuser, isteamfriends])
      expect(def).toContain('SteamAPI_Init')
      expect(def).toContain('SteamAPI_Shutdown')
      expect(def).toContain('SteamAPI_RunCallbacks')
    })

    it('exports the versioned flat accessors for both pinned interfaces', () => {
      const def = generateDefFile([isteamuser, isteamfriends])
      expect(def).toContain('SteamAPI_SteamUser_v023')
      expect(def).toContain('SteamAPI_SteamFriends_v018')
    })

    it('starts with the LIBRARY steam_api / EXPORTS header the PE linker expects', () => {
      const def = generateDefFile([isteamuser, isteamfriends])
      expect(def.startsWith('LIBRARY steam_api\nEXPORTS\n')).toBe(true)
    })
  })

  describe('toVersionedAccessorSuffix', () => {
    it('converts SteamUser023 -> SteamUser_v023', () => {
      expect(toVersionedAccessorSuffix('SteamUser023')).toBe('SteamUser_v023')
    })

    it('converts SteamFriends018 -> SteamFriends_v018', () => {
      expect(toVersionedAccessorSuffix('SteamFriends018')).toBe(
        'SteamFriends_v018'
      )
    })
  })

  describe('FLAT_EXPORTS_SUPERSET', () => {
    it('covers every symbol Avernum 4 (spike 007) and Hoard (spike 008) import', () => {
      const avernumImports = ['SteamAPI_Init', 'SteamAPI_Shutdown']
      const hoardImports = [
        'SteamAPI_Init',
        'SteamAPI_RestartAppIfNecessary',
        'SteamAPI_RunCallbacks',
        'SteamAPI_RegisterCallback',
        'SteamAPI_UnregisterCallback',
        'SteamAPI_RegisterCallResult',
        'SteamAPI_UnregisterCallResult'
      ]
      for (const symbol of [...avernumImports, ...hoardImports]) {
        expect(FLAT_EXPORTS_SUPERSET).toContain(symbol)
      }
    })
  })
})
