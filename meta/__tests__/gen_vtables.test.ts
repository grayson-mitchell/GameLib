import { readFileSync } from 'fs'
import { join } from 'path'

import {
  computeRetN,
  generateDefFile,
  generateShimC,
  isSretReturn,
  isStringReturn,
  is64BitRegisterReturn,
  paramWidth,
  toVersionedAccessorSuffix,
  FLAT_EXPORTS_SUPERSET,
  STRING_RETURN_BUF_BYTES,
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

  // 24-CR-01 (fixed in 1e744d204): the defect routed a `const char*` return
  // through the generic register-return path, which memcpy'd a 4-byte wire
  // value into a pointer and returned it -- a pointer into the bridge helper's
  // address space. These tests pin BOTH the generator and the committed
  // artifact, because the shim is compiled from the committed .c
  // (`buildShimCompileArgv`).
  describe('string-return marshaling (24-CR-01 -- GetPersonaName shim-owned buffer)', () => {
    const SHIM_C_PATH = join(
      __dirname,
      '..',
      '..',
      'native',
      'steam-bridge',
      'generated',
      'steam_api_shim.c'
    )

    it('24-CR-01: isStringReturn routes exactly GetPersonaName across both pinned manifests (a const char* PARAMETER is not a string return)', () => {
      const methods = [...isteamuser.methods, ...isteamfriends.methods]
      expect(methods.filter(isStringReturn).map((m) => m.name)).toEqual([
        'GetPersonaName'
      ])
      const setName = methods.find(
        (m) => m.name === 'SetPersonaNameTest_TESTONLY'
      )
      expect(setName).toBeDefined()
      expect(isStringReturn(setName!)).toBe(false)
    })

    it('24-CR-01: STRING_RETURN_BUF_BYTES leaves headroom over k_cchPersonaNameMax (128 incl. NUL) and is emitted verbatim as the shim #define', () => {
      expect(STRING_RETURN_BUF_BYTES).toBeGreaterThanOrEqual(128)
      const source = generateShimC([isteamuser, isteamfriends])
      expect(source).toContain(
        `#define STRING_RETURN_BUF_BYTES ${STRING_RETURN_BUF_BYTES}`
      )
    })

    it.each<[string, () => string]>([
      [
        'generateShimC output',
        () => generateShimC([isteamuser, isteamfriends])
      ],
      [
        'committed native/steam-bridge/generated/steam_api_shim.c',
        () => readFileSync(SHIM_C_PATH, 'utf-8')
      ]
    ])(
      '24-CR-01 (%s): GetPersonaName copies the wire bytes into a shim-owned static buffer and returns a pointer into it, never a wire-received pointer value',
      (_label, getSource) => {
        const source = getSource()
        const stub = source.match(
          /vt_SteamFriends018_GetPersonaName\(void \*self\) \{[\s\S]*?\n\}/
        )
        expect(stub).not.toBeNull()
        const body = stub![0]

        // The defect signature.
        expect(body).not.toContain('retbuf[4]')
        expect(body).not.toContain('memcpy(&ret, retbuf')

        // The shim-owned-buffer copy-and-return.
        expect(body).toContain('uint8_t retbuf[STRING_RETURN_BUF_BYTES - 1]')
        expect(body).toContain(
          "vt_SteamFriends018_GetPersonaName_buf[0] = '\\0';"
        )
        expect(body).toContain(
          'memcpy(vt_SteamFriends018_GetPersonaName_buf, retbuf, retlen);'
        )
        expect(body).toContain(
          "vt_SteamFriends018_GetPersonaName_buf[retlen] = '\\0';"
        )
        expect(body).toContain('return vt_SteamFriends018_GetPersonaName_buf;')

        expect(source).toContain(
          'static char vt_SteamFriends018_GetPersonaName_buf[STRING_RETURN_BUF_BYTES];'
        )
        const define = source.match(/^#define STRING_RETURN_BUF_BYTES (\d+)$/m)
        expect(define).not.toBeNull()
        expect(Number(define![1])).toBeGreaterThanOrEqual(128)
      }
    )
  })
})
