import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

import {
  bareAccessorName,
  computeRetN,
  computeWireTableHash,
  generateDefFile,
  generateDispatchHeader,
  generateShimC,
  isSretReturn,
  isStringReturn,
  is64BitRegisterReturn,
  paramWidth,
  toVersionedAccessorSuffix,
  validateManifest,
  FLAT_EXPORTS_SUPERSET,
  STRING_RETURN_BUF_BYTES,
  WIRE_LAYOUT_DOC,
  type InterfaceManifestV2
} from '../gen_vtables'

const SDK_DIR = join(__dirname, '..', 'sdk')
const FIXTURE_DIR = join(__dirname, 'fixtures')

const isteamuser: InterfaceManifestV2 = JSON.parse(
  readFileSync(join(SDK_DIR, 'isteamuser.manifest.json'), 'utf-8')
)
const isteamfriends: InterfaceManifestV2 = JSON.parse(
  readFileSync(join(SDK_DIR, 'isteamfriends.manifest.json'), 'utf-8')
)
const abiExercise: InterfaceManifestV2 = JSON.parse(
  readFileSync(join(FIXTURE_DIR, 'abi-exercise.manifest.json'), 'utf-8')
)

describe('gen_vtables', () => {
  describe('manifest inputs (D-09 -- never a vendored Valve .h)', () => {
    it('the generator source only references meta/sdk, never a .h include', () => {
      const generatorSource = readFileSync(
        join(__dirname, '..', 'gen_vtables.ts'),
        'utf-8'
      )
      expect(generatorSource).toContain("'meta', 'sdk'")
      expect(generatorSource).not.toMatch(/isteamuser\.h/)
      expect(generatorSource).not.toMatch(/isteamfriends\.h/)
      expect(generatorSource).not.toMatch(/#include\s+"[^"]+\.h"/)
    })

    it('loads every *.manifest.json in meta/sdk via a directory listing, not two literal loads', () => {
      const generatorSource = readFileSync(
        join(__dirname, '..', 'gen_vtables.ts'),
        'utf-8'
      )
      expect(generatorSource).not.toMatch(
        /loadManifest\(\s*['"]isteamuser\.manifest\.json['"]\s*\)/
      )
      expect(generatorSource).toContain('readdirSync')
    })

    it('no production manifest under meta/sdk/ contains a method whose name ends in _TESTONLY', () => {
      const manifestFiles = readdirSync(SDK_DIR).filter((f) =>
        f.endsWith('.manifest.json')
      )
      for (const file of manifestFiles) {
        const manifest: InterfaceManifestV2 = JSON.parse(
          readFileSync(join(SDK_DIR, file), 'utf-8')
        )
        const testonly = manifest.methods.filter((m) =>
          m.name.endsWith('_TESTONLY')
        )
        expect(testonly).toEqual([])
      }
    })
  })

  describe('computeRetN (Pattern 2 / Pitfall 2 -- per-slot stack cleanup), now returnKind-driven', () => {
    it('a zero-arg slot (GetHSteamUser) emits ret 0', () => {
      const method = isteamuser.methods.find((m) => m.name === 'GetHSteamUser')!
      expect(computeRetN(method)).toBe(0)
    })

    it('a two-int-param slot (fixture) emits ret 8', () => {
      const method = abiExercise.methods.find(
        (m) => m.name === 'SetTwoIntTest_TESTONLY'
      )!
      expect(computeRetN(method)).toBe(8)
    })

    it('a single-uint64-param slot (fixture) emits ret 8 (distinct mechanism from the two-int case)', () => {
      const method = abiExercise.methods.find(
        (m) => m.name === 'SetUint64Test_TESTONLY'
      )!
      expect(paramWidth('uint64')).toBe(8)
      expect(computeRetN(method)).toBe(8)
    })

    it('a class return (structSize > 8) adds 4 bytes for the hidden return pointer', () => {
      const method = abiExercise.methods.find(
        (m) => m.name === 'GetUserStatsSummary_TESTONLY'
      )!
      expect(isSretReturn(method)).toBe(true)
      expect(computeRetN(method)).toBe(4) // 0 real params + 4-byte hidden sret pointer
    })

    it('GetSteamID (CSteamID, returnKind class, structSize 8) computes ret 4 -- a hidden pointer, not an 8-byte register return', () => {
      const method = isteamuser.methods.find((m) => m.name === 'GetSteamID')!
      expect(isSretReturn(method)).toBe(true)
      expect(computeRetN(method)).toBe(4)
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

  // Planner finding (2026-10-17, VERIFIED against Proton proton_9.0
  // lsteamclient/winISteamUser.c): `CSteamID * __thiscall
  // winISteamUser_SteamUser016_GetSteamID(struct w_steam_iface *_this,
  // CSteamID *_ret)` -- the hidden return pointer travels as the FIRST stack
  // argument after `this` (DEFINE_THISCALL_WRAPPER wrapper size 8, i.e. ret
  // 4 after accounting for the implicit `this`), and the callee RETURNS that
  // same pointer. The previous EDX:EAX register-return stub mis-handled this
  // convention entirely -- this describe block replaces that defect's test.
  describe('GetSteamID: MSVC class-return ABI fix (SRET, not EDX:EAX)', () => {
    it('is64BitRegisterReturn is FALSE for GetSteamID -- it is a class return, not a register return', () => {
      const method = isteamuser.methods.find((m) => m.name === 'GetSteamID')!
      expect(is64BitRegisterReturn(method)).toBe(false)
      expect(isSretReturn(method)).toBe(true)
    })

    it('the generated stub takes a hidden sretOut pointer, returns void *, and returns sretOut (Proton-verified convention)', () => {
      const c = generateShimC([isteamuser, isteamfriends])
      expect(c).toContain(
        'static void * THISCALL vt_SteamUser023_GetSteamID(void *self, void *sretOut) {'
      )
      expect(c).toContain('memcpy(sretOut, retbuf, 8);')
      expect(c).toContain('return sretOut;')
      // The old defect signature must be fully gone.
      expect(c).not.toMatch(
        /static uint64_t __attribute__\(\(thiscall\)\) vt_SteamUser023_GetSteamID/
      )
    })
  })

  describe('sret path is generated and distinct from the register-return path', () => {
    it('a sret stub (fixture) takes a hidden sretOut pointer, returns void *, and returns sretOut', () => {
      const c = generateShimC([abiExercise])
      expect(c).toContain(
        'static void * THISCALL vt_AbiExercise001_GetUserStatsSummary_TESTONLY(void *self, void *sretOut) {'
      )
      expect(c).toContain('memcpy(sretOut, retbuf, 16);')
      expect(c).toContain('return sretOut;')
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

    it('contains "ret 4 (SRET" for GetSteamID', () => {
      const c = generateShimC([isteamuser, isteamfriends])
      expect(c).toMatch(
        /GetSteamID\([^)]*\) -> CSteamID \| __thiscall ret 4 \(SRET/
      )
    })

    it('contains "ret 8" for the two-int-param slot and the uint64-param slot (fixture)', () => {
      const c = generateShimC([abiExercise])
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

    it('24-CR-01: isStringReturn routes exactly GetPersonaName across both pinned manifests', () => {
      const methods = [...isteamuser.methods, ...isteamfriends.methods]
      expect(methods.filter(isStringReturn).map((m) => m.name)).toEqual([
        'GetPersonaName'
      ])
    })

    it('24-CR-01 (fixture): a const char* PARAMETER is not a string return', () => {
      const setName = abiExercise.methods.find(
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

  describe('validateManifest', () => {
    const base: InterfaceManifestV2 = {
      schemaVersion: 2,
      interface: 'TestIface001',
      family: 'TestIface',
      ordinal: 100,
      arches: ['x86'],
      mode: 'wire',
      complete: true,
      source: { kind: 'synthetic', ref: 'unit test', file: 'n/a' },
      methods: [
        {
          slot: 0,
          name: 'DoThing',
          returns: 'int32',
          returnKind: 'int32',
          stackBytes: 0,
          params: []
        }
      ]
    }

    it('a valid manifest has no errors', () => {
      expect(validateManifest(base)).toEqual([])
    })

    it('flags ordinal 0', () => {
      const errors = validateManifest({ ...base, ordinal: 0 })
      expect(errors.some((e) => /ordinal/i.test(e))).toBe(true)
    })

    it('flags ordinal 0xFFFF (reserved for CONTROL)', () => {
      const errors = validateManifest({ ...base, ordinal: 0xffff })
      expect(errors.some((e) => /ordinal/i.test(e))).toBe(true)
    })

    it('flags a duplicate ordinal across manifests', () => {
      const other: InterfaceManifestV2 = { ...base, interface: 'OtherIface001' }
      const errors = validateManifest(base, [base, other])
      expect(errors.some((e) => /duplicate ordinal/i.test(e))).toBe(true)
    })

    it('flags a slot gap when complete is true', () => {
      const withGap: InterfaceManifestV2 = {
        ...base,
        methods: [
          { ...base.methods[0], slot: 0 },
          { ...base.methods[0], slot: 2, name: 'Other' }
        ]
      }
      const errors = validateManifest(withGap)
      expect(errors.some((e) => /slot gap/i.test(e))).toBe(true)
    })

    it('does NOT flag a slot gap when complete is false', () => {
      const withGap: InterfaceManifestV2 = {
        ...base,
        complete: false,
        methods: [
          { ...base.methods[0], slot: 0 },
          { ...base.methods[0], slot: 2, name: 'Other' }
        ]
      }
      expect(validateManifest(withGap)).toEqual([])
    })

    it('flags a wire method whose computeRetN does not match stackBytes', () => {
      const bad: InterfaceManifestV2 = {
        ...base,
        methods: [{ ...base.methods[0], stackBytes: 4 }]
      }
      const errors = validateManifest(bad)
      expect(errors.some((e) => /computeRetN|stackBytes/i.test(e))).toBe(true)
    })

    it('flags an unknown returnKind', () => {
      const bad: InterfaceManifestV2 = {
        ...base,
        methods: [{ ...base.methods[0], returnKind: 'nonsense' as never }]
      }
      const errors = validateManifest(bad)
      expect(errors.some((e) => /returnKind/i.test(e))).toBe(true)
    })

    it('flags a class return without structSize', () => {
      const bad: InterfaceManifestV2 = {
        ...base,
        methods: [{ ...base.methods[0], returnKind: 'class', stackBytes: 4 }]
      }
      const errors = validateManifest(bad)
      expect(errors.some((e) => /structSize/i.test(e))).toBe(true)
    })

    it('flags a _TESTONLY method name', () => {
      const bad: InterfaceManifestV2 = {
        ...base,
        methods: [{ ...base.methods[0], name: 'DoThing_TESTONLY' }]
      }
      const errors = validateManifest(bad)
      expect(errors.some((e) => /_TESTONLY/.test(e))).toBe(true)
    })

    it('every committed meta/sdk manifest validates clean (no cross-manifest duplicates either)', () => {
      const manifestFiles = readdirSync(SDK_DIR).filter((f) =>
        f.endsWith('.manifest.json')
      )
      const manifests: InterfaceManifestV2[] = manifestFiles.map((f) =>
        JSON.parse(readFileSync(join(SDK_DIR, f), 'utf-8'))
      )
      for (const manifest of manifests) {
        expect(validateManifest(manifest, manifests)).toEqual([])
      }
    })
  })

  describe('stub emission from stackBytes (51-06 Task 2)', () => {
    const stubManifest: InterfaceManifestV2 = {
      schemaVersion: 2,
      interface: 'StubExercise001',
      family: 'StubExercise',
      ordinal: 101,
      arches: ['x86'],
      mode: 'stub',
      complete: true,
      source: { kind: 'synthetic', ref: 'unit test', file: 'n/a' },
      methods: [
        {
          slot: 0,
          name: 'StubThreeDummies',
          returns: 'void',
          returnKind: 'void',
          stackBytes: 12,
          params: []
        },
        {
          slot: 1,
          name: 'StubClassReturn',
          returns: 'SomeStruct_t',
          returnKind: 'class',
          structSize: 16,
          stackBytes: 8,
          params: []
        },
        {
          slot: 2,
          name: 'StubInt64Return',
          returns: 'int64',
          returnKind: 'int64',
          stackBytes: 0,
          params: []
        }
      ]
    }

    it('a stub method with stackBytes 12 takes self + three uint32_t dummies and never calls bridge_transact', () => {
      const c = generateShimC([stubManifest])
      const stub = c.match(
        /static void THISCALL vt_StubExercise001_StubThreeDummies\([^{]*\) \{[\s\S]*?\n\}/
      )
      expect(stub).not.toBeNull()
      expect(stub![0]).toContain(
        'void *self, uint32_t dummy0, uint32_t dummy1, uint32_t dummy2'
      )
      expect(stub![0]).not.toContain('bridge_transact')
    })

    it('a stub with a class return takes the real sretOut pointer (not a dummy) plus one dummy for the remaining stackBytes, and zero-fills it', () => {
      const c = generateShimC([stubManifest])
      const stub = c.match(
        /static void \* THISCALL vt_StubExercise001_StubClassReturn\([^{]*\) \{[\s\S]*?\n\}/
      )
      expect(stub).not.toBeNull()
      expect(stub![0]).toContain('void *self, void *sretOut, uint32_t dummy0')
      expect(stub![0]).toContain('memset(sretOut, 0, 16);')
      expect(stub![0]).toContain('return sretOut;')
      expect(stub![0]).not.toContain('bridge_transact')
    })

    it('a stub with an int64 return returns 0LL, never calling bridge_transact', () => {
      const c = generateShimC([stubManifest])
      const stub = c.match(
        /static int64_t THISCALL vt_StubExercise001_StubInt64Return\([^{]*\) \{[\s\S]*?\n\}/
      )
      expect(stub).not.toBeNull()
      expect(stub![0]).toContain('return 0LL;')
      expect(stub![0]).not.toContain('bridge_transact')
    })
  })

  describe('bareAccessorName (51-06 Task 2)', () => {
    it('leaves a normal family name unchanged', () => {
      expect(bareAccessorName('SteamUser')).toBe('SteamUser')
      expect(bareAccessorName('SteamFriends')).toBe('SteamFriends')
    })

    it('fixes the double-capital families to their real export spelling', () => {
      expect(bareAccessorName('SteamMatchMaking')).toBe('SteamMatchmaking')
      expect(bareAccessorName('SteamMatchMakingServers')).toBe(
        'SteamMatchmakingServers'
      )
    })
  })

  describe('g_iface_table and bare legacy accessors (51-06 Task 2)', () => {
    it('emits one g_iface_table row per manifest, guarded on arches, and a bare accessor per family', () => {
      const c = generateShimC([isteamuser, isteamfriends])
      expect(c).toContain('g_iface_table')
      expect(c).toContain('"SteamUser023", "SteamUser"')
      expect(c).toContain('"SteamFriends018", "SteamFriends"')
      expect(c).toMatch(/void \*SteamUser\(void\) \{/)
      expect(c).toMatch(/void \*SteamFriends\(void\) \{/)
    })

    it('the cfg loader collects iface.<Family>=<Version> pairs bounded at 64 entries / 256-byte lines', () => {
      const c = generateShimC([isteamuser, isteamfriends])
      expect(c).toContain('#define MAX_IFACE_CFG_ENTRIES 64')
      expect(c).toContain('MAX_IFACE_CFG_LINE_BYTES')
      expect(c).toContain('"iface."')
    })
  })

  describe('generateDefFile(manifests, arch) (51-06 Task 2)', () => {
    it('defaults to x86 and exports the bare accessors once per family', () => {
      const def = generateDefFile([isteamuser, isteamfriends])
      const steamUserLines = def.split('\n').filter((l) => l === 'SteamUser')
      const steamFriendsLines = def
        .split('\n')
        .filter((l) => l === 'SteamFriends')
      expect(steamUserLines).toHaveLength(1)
      expect(steamFriendsLines).toHaveLength(1)
    })

    it('excludes a manifest whose arches do not include the requested arch', () => {
      const x64Only: InterfaceManifestV2 = {
        ...isteamuser,
        interface: 'SteamUserX64Only001',
        family: 'SteamUserX64Only',
        ordinal: 102,
        arches: ['x64']
      }
      const def = generateDefFile([isteamuser, x64Only], 'x86')
      expect(def).not.toContain('SteamUserX64Only')
    })
  })

  describe('WIRE_LAYOUT_DOC (51-06 Task 3)', () => {
    it('is exported and documents both the request and response blob layouts', () => {
      expect(typeof WIRE_LAYOUT_DOC).toBe('string')
      expect(WIRE_LAYOUT_DOC).toMatch(/in-string/)
      expect(WIRE_LAYOUT_DOC).toMatch(/out-value/)
      expect(WIRE_LAYOUT_DOC).toMatch(/out-buffer/)
    })
  })

  describe('wire marshaling: in-string, out-value, out-buffer (51-06 Task 3, fixture)', () => {
    it('GetStatTest_TESTONLY: an in-string param packs [len][bytes] with a NULL-pointer sentinel length', () => {
      const c = generateShimC([abiExercise])
      const stub = c.match(
        /vt_AbiExercise001_GetStatTest_TESTONLY\(void \*self[^{]*\) \{[\s\S]*?\n\}/
      )
      expect(stub).not.toBeNull()
      const body = stub![0]
      expect(body).toContain('if (pchName == NULL)')
      expect(body).toContain('strLen = 0xFFFFFFFFu;')
      expect(body).toContain('strlen(pchName)')
    })

    it('GetStatTest_TESTONLY: an out-value param is read from the response AFTER the return value, and skipped when the caller passes NULL', () => {
      const c = generateShimC([abiExercise])
      const stub = c.match(
        /vt_AbiExercise001_GetStatTest_TESTONLY\(void \*self[^{]*\) \{[\s\S]*?\n\}/
      )
      const body = stub![0]
      expect(body).toContain('if (pValue != NULL')
      expect(body).toContain('*pValue = outVal;')
      expect(body).not.toContain('bridge_transact(65520, 5, argbuf, 0')
    })

    it('GetDirTest_TESTONLY: an out-buffer param sends a capped [u32 capacity] taken from its sizeParam sibling', () => {
      const c = generateShimC([abiExercise])
      const stub = c.match(
        /vt_AbiExercise001_GetDirTest_TESTONLY\(void \*self[^{]*\) \{[\s\S]*?\n\}/
      )
      expect(stub).not.toBeNull()
      const body = stub![0]
      expect(body).toContain('uint32_t cap = (uint32_t)cubBuffer;')
      expect(body).toContain(
        'if (cap > WIRE_OUT_BUFFER_MAX_BYTES) cap = WIRE_OUT_BUFFER_MAX_BYTES;'
      )
    })

    it('GetDirTest_TESTONLY: the response decode truncates to min(declared len, capacity) and NUL-terminates a char* buffer', () => {
      const c = generateShimC([abiExercise])
      const stub = c.match(
        /vt_AbiExercise001_GetDirTest_TESTONLY\(void \*self[^{]*\) \{[\s\S]*?\n\}/
      )
      const body = stub![0]
      expect(body).toContain(
        'if (copyLen > WIRE_OUT_BUFFER_MAX_BYTES) copyLen = WIRE_OUT_BUFFER_MAX_BYTES;'
      )
      expect(body).toContain("pchDir[copyLen] = '\\0';")
    })
  })

  describe('helperFallback: no bridge_transact, returns the constant (51-06 Task 3)', () => {
    const fallbackManifest: InterfaceManifestV2 = {
      schemaVersion: 2,
      interface: 'FallbackExercise001',
      family: 'FallbackExercise',
      ordinal: 103,
      arches: ['x86'],
      mode: 'wire',
      complete: true,
      source: { kind: 'synthetic', ref: 'unit test', file: 'n/a' },
      methods: [
        {
          slot: 0,
          name: 'RequestCurrentStatsTest_TESTONLY',
          returns: 'bool',
          returnKind: 'int32',
          stackBytes: 0,
          params: [],
          helperFallback: 1
        }
      ]
    }

    it('emits a stub that returns the constant and never calls bridge_transact', () => {
      const c = generateShimC([fallbackManifest])
      const stub = c.match(
        /vt_FallbackExercise001_RequestCurrentStatsTest_TESTONLY\([^{]*\) \{[\s\S]*?\n\}/
      )
      expect(stub).not.toBeNull()
      const body = stub![0]
      expect(body).toContain('return 1;')
      expect(body).not.toContain('bridge_transact')
    })
  })

  describe('validateManifest: wire-param-kind checks (51-06 Task 3)', () => {
    const base: InterfaceManifestV2 = {
      schemaVersion: 2,
      interface: 'WireCheckExercise001',
      family: 'WireCheckExercise',
      ordinal: 104,
      arches: ['x86'],
      mode: 'wire',
      complete: true,
      source: { kind: 'synthetic', ref: 'unit test', file: 'n/a' },
      methods: [
        {
          slot: 0,
          name: 'DoThing',
          returns: 'void',
          returnKind: 'void',
          stackBytes: 4,
          params: [{ name: 'pchName', type: 'const char*' }]
        }
      ]
    }

    it('flags a pointer param used without an explicit kind', () => {
      const errors = validateManifest(base)
      expect(errors.some((e) => /pointer param.*without.*kind/i.test(e))).toBe(
        true
      )
    })

    it('flags an out-buffer param missing sizeParam', () => {
      const bad: InterfaceManifestV2 = {
        ...base,
        methods: [
          {
            ...base.methods[0],
            params: [{ name: 'pchDir', type: 'char*', kind: 'out-buffer' }]
          }
        ]
      }
      const errors = validateManifest(bad)
      expect(errors.some((e) => /out-buffer.*sizeParam/i.test(e))).toBe(true)
    })

    it('flags a by-value struct param (CSteamID)', () => {
      const bad: InterfaceManifestV2 = {
        ...base,
        methods: [
          {
            ...base.methods[0],
            params: [{ name: 'steamID', type: 'CSteamID', kind: 'value' }]
          }
        ]
      }
      const errors = validateManifest(bad)
      expect(errors.some((e) => /by-value struct param/i.test(e))).toBe(true)
    })

    it('does NOT flag an in-string/out-value/out-buffer param with a properly declared kind', () => {
      const good: InterfaceManifestV2 = {
        ...base,
        methods: [
          {
            slot: 0,
            name: 'DoThing',
            returns: 'void',
            returnKind: 'void',
            stackBytes: 16,
            params: [
              { name: 'pchName', type: 'const char*', kind: 'in-string' },
              {
                name: 'pValue',
                type: 'int32*',
                kind: 'out-value',
                valueType: 'int32'
              },
              {
                name: 'pchDir',
                type: 'char*',
                kind: 'out-buffer',
                sizeParam: 'cubBuffer'
              },
              { name: 'cubBuffer', type: 'uint32' }
            ]
          }
        ]
      }
      expect(validateManifest(good)).toEqual([])
    })

    // The abi-exercise fixture deliberately contains _TESTONLY methods and
    // (pre-Task-3) a bare pointer param with no kind (SetPersonaNameTest_
    // TESTONLY) -- validateManifest correctly flags both. It is never
    // loaded through main()'s generation-refusal gate (that only walks
    // meta/sdk, never meta/__tests__/fixtures), so this is expected, not a
    // defect: the fixture's two NEW Task 3 methods are the ones that must
    // be clean on the wire-param-kind checks specifically.
    it('the two new Task 3 fixture methods have no wire-param-kind errors of their own (only the expected, pre-existing _TESTONLY flag)', () => {
      const errors = validateManifest(abiExercise)
      const task3WireKindErrors = errors.filter(
        (e) =>
          /GetStatTest_TESTONLY|GetDirTest_TESTONLY/.test(e) &&
          !/_TESTONLY method/.test(e)
      )
      expect(task3WireKindErrors).toEqual([])
    })
  })

  // 51-10: helper-side dispatch table generation. Both pinned manifests
  // (meta/sdk/isteamuser.manifest.json, isteamfriends.manifest.json) now
  // declare helperInterface/helperFlat for every method -- these tests
  // exercise generateDispatchHeader() against the SAME real manifests the
  // shim is generated from.
  describe('computeWireTableHash (51-10)', () => {
    it('is a 12-character lowercase hex digest', () => {
      const hash = computeWireTableHash([isteamuser, isteamfriends])
      expect(hash).toMatch(/^[0-9a-f]{12}$/)
    })

    it('is independent of manifest array order', () => {
      const a = computeWireTableHash([isteamuser, isteamfriends])
      const b = computeWireTableHash([isteamfriends, isteamuser])
      expect(a).toBe(b)
    })

    it('changes when a wire method layout changes', () => {
      const original = computeWireTableHash([isteamuser])
      const mutated: InterfaceManifestV2 = {
        ...isteamuser,
        methods: isteamuser.methods.map((m) =>
          m.name === 'BLoggedOn'
            ? {
                ...m,
                params: [{ name: 'extra', type: 'int32' }],
                stackBytes: 4
              }
            : m
        )
      }
      expect(computeWireTableHash([mutated])).not.toBe(original)
    })

    it('excludes helperFallback methods (they never reach the helper, 51-06 Task 3)', () => {
      const withFallback: InterfaceManifestV2 = {
        ...isteamuser,
        methods: [
          ...isteamuser.methods,
          {
            slot: 3,
            name: 'FallbackOnly_TESTONLY',
            returns: 'bool',
            returnKind: 'int32',
            stackBytes: 0,
            params: [],
            helperFallback: true
          }
        ]
      }
      expect(computeWireTableHash([withFallback])).toBe(
        computeWireTableHash([isteamuser])
      )
    })

    it('BRIDGE_SHIM_TABLE_HASH (generateShimC) and BRIDGE_DISPATCH_TABLE_HASH (generateDispatchHeader) are the same digest for the real pinned manifests', () => {
      const expected = computeWireTableHash([isteamuser, isteamfriends])
      const shim = generateShimC([isteamuser, isteamfriends])
      const dispatch = generateDispatchHeader([isteamuser, isteamfriends])

      const shimHash = shim.match(/BRIDGE_SHIM_TABLE_HASH "([0-9a-f]+)"/)
      const dispatchHash = dispatch.match(
        /BRIDGE_DISPATCH_TABLE_HASH "([0-9a-f]+)"/
      )
      expect(shimHash).not.toBeNull()
      expect(dispatchHash).not.toBeNull()
      expect(shimHash![1]).toBe(expected)
      expect(dispatchHash![1]).toBe(expected)
    })
  })

  describe('generateDispatchHeader (51-10)', () => {
    const dispatch = generateDispatchHeader([isteamuser, isteamfriends])

    it('emits bridge_dispatch_init, bridge_dispatch, bridge_dispatch_set_identity_only and the table hash', () => {
      expect(dispatch).toContain('int bridge_dispatch_init(void *dylibHandle)')
      expect(dispatch).toMatch(/uint8_t bridge_dispatch\(/)
      expect(dispatch).toContain(
        'void bridge_dispatch_set_identity_only(int on, uint32_t reportAppId)'
      )
      expect(dispatch).toMatch(/#define BRIDGE_DISPATCH_TABLE_HASH "[0-9a-f]+"/)
    })

    it('emits a typed void*-self-first typedef + NULL-tolerant dlsym for each of the four production wire methods', () => {
      for (const flat of [
        'SteamAPI_ISteamUser_GetHSteamUser',
        'SteamAPI_ISteamUser_BLoggedOn',
        'SteamAPI_ISteamUser_GetSteamID',
        'SteamAPI_ISteamFriends_GetPersonaName'
      ]) {
        expect(dispatch).toContain(`dlsym(dylibHandle, "${flat}")`)
      }
      expect(dispatch).toContain(
        'typedef uint64_t (*BDFlatFn_SteamUser023_GetSteamID_t)(void *);'
      )
      expect(dispatch).toContain(
        'typedef const char * (*BDFlatFn_SteamFriends018_GetPersonaName_t)(void *);'
      )
    })

    it('resolves each distinct helperInterface accessor once and calls it to get the self pointer', () => {
      expect(dispatch).toContain(
        'dlsym(dylibHandle, "SteamAPI_SteamUser_v023")'
      )
      expect(dispatch).toContain(
        'dlsym(dylibHandle, "SteamAPI_SteamFriends_v018")'
      )
      expect(dispatch).toContain(
        'g_bd_self_steamuser023 = g_bd_accessor_steamuser023 ? g_bd_accessor_steamuser023() : NULL;'
      )
    })

    it('GetSteamID decodes/encodes 8 bytes', () => {
      const caseBody = dispatch.match(
        /SteamUser023\.GetSteamID\n([\s\S]*?)\n {4}\}/
      )
      expect(caseBody).not.toBeNull()
      expect(caseBody![1]).toContain('memcpy(resp, &__ret, 8);')
    })

    it('BLoggedOn and GetHSteamUser decode/encode a 4-byte int', () => {
      const loggedOn = dispatch.match(
        /SteamUser023\.BLoggedOn\n([\s\S]*?)\n {4}\}/
      )
      const hSteamUser = dispatch.match(
        /SteamUser023\.GetHSteamUser\n([\s\S]*?)\n {4}\}/
      )
      expect(loggedOn![1]).toContain('memcpy(resp, &__ret, 4);')
      expect(hSteamUser![1]).toContain('memcpy(resp, &__ret, 4);')
    })

    it('GetPersonaName encodes [u32 len][bytes] capped at 255', () => {
      const caseBody = dispatch.match(
        /SteamFriends018\.GetPersonaName\n([\s\S]*?)\n {4}\}/
      )
      expect(caseBody).not.toBeNull()
      const body = caseBody![1]
      expect(body).toContain('if (strLen > 255) strLen = 255;')
      expect(body).toContain('memcpy(resp, &strLen, 4);')
      expect(body).toContain('memcpy(resp + 4, result, strLen);')
    })

    it('an unknown (ordinal, slot) pair falls through the default case and returns STATUS_ERR (1)', () => {
      expect(dispatch).toMatch(
        /default:\s*\n\s*return 1; \/\/ T-51-23: unknown \(ordinal, slot\) pair -- never read/
      )
    })

    it('a NULL-resolved flat or self pointer is checked BEFORE any call', () => {
      const caseBody = dispatch.match(
        /SteamUser023\.GetSteamID\n([\s\S]*?)\n {4}\}/
      )!
      const body = caseBody[1]
      const nullCheckIdx = body.indexOf('== NULL')
      const callIdx = body.indexOf('g_bd_flat_SteamUser023_GetSteamID(')
      expect(nullCheckIdx).toBeGreaterThanOrEqual(0)
      expect(callIdx).toBeGreaterThan(nullCheckIdx)
    })

    describe('identity-only gating (D-51-04, T-51-25)', () => {
      const userStatsManifest: InterfaceManifestV2 = {
        schemaVersion: 2,
        interface: 'SteamUserStats013',
        family: 'SteamUserStats',
        ordinal: 50,
        arches: ['x86'],
        mode: 'wire',
        complete: false,
        helperInterface: 'SteamAPI_SteamUserStats_v013',
        source: { kind: 'synthetic', ref: 'unit test', file: 'n/a' },
        methods: [
          {
            slot: 0,
            name: 'GetStatInt32Test_TESTONLY',
            returns: 'bool',
            returnKind: 'int32',
            stackBytes: 0,
            params: [],
            helperFlat: 'SteamAPI_ISteamUserStats_GetStatInt32Test_TESTONLY'
          }
        ]
      }

      it('an app-scoped family (SteamUserStats) answers STATUS_ERR when g_bd_identity_only is set, before touching the flat pointer', () => {
        const c = generateDispatchHeader([userStatsManifest])
        const caseBody = c.match(
          /SteamUserStats013\.GetStatInt32Test_TESTONLY\n([\s\S]*?)\n {4}\}/
        )
        expect(caseBody).not.toBeNull()
        const body = caseBody![1]
        const gateIdx = body.indexOf('if (g_bd_identity_only)')
        const nullCheckIdx = body.indexOf('== NULL')
        expect(gateIdx).toBeGreaterThanOrEqual(0)
        expect(gateIdx).toBeLessThan(nullCheckIdx)
        expect(body).toContain('*respLen = 0; return 1;')
      })

      it('SteamRemoteStorage is gated the same way', () => {
        const remoteStorageManifest: InterfaceManifestV2 = {
          ...userStatsManifest,
          interface: 'SteamRemoteStorage016',
          family: 'SteamRemoteStorage',
          ordinal: 51,
          helperInterface: 'SteamAPI_SteamRemoteStorage_v016',
          methods: [
            {
              ...userStatsManifest.methods[0],
              name: 'FileExistsTest_TESTONLY',
              helperFlat: 'SteamAPI_ISteamRemoteStorage_FileExistsTest_TESTONLY'
            }
          ]
        }
        const c = generateDispatchHeader([remoteStorageManifest])
        expect(c).toMatch(
          /if \(g_bd_identity_only\) \{ \*respLen = 0; return 1; \}/
        )
      })

      it('SteamUtils GetAppID reports g_bd_report_appid when identity-only, falling through to the real call otherwise', () => {
        const steamUtilsManifest: InterfaceManifestV2 = {
          schemaVersion: 2,
          interface: 'SteamUtils011',
          family: 'SteamUtils',
          ordinal: 52,
          arches: ['x86'],
          mode: 'wire',
          complete: false,
          helperInterface: 'SteamAPI_SteamUtils_v011',
          source: { kind: 'synthetic', ref: 'unit test', file: 'n/a' },
          methods: [
            {
              slot: 0,
              name: 'GetAppID',
              returns: 'uint32',
              returnKind: 'int32',
              stackBytes: 0,
              params: [],
              helperFlat: 'SteamAPI_ISteamUtils_GetAppID'
            }
          ]
        }
        const c = generateDispatchHeader([steamUtilsManifest])
        const caseBody = c.match(/SteamUtils011\.GetAppID\n([\s\S]*?)\n {4}\}/)
        expect(caseBody).not.toBeNull()
        const body = caseBody![1]
        expect(body).toContain('if (g_bd_identity_only) {')
        expect(body).toContain('uint32_t v = g_bd_report_appid;')
        expect(body).toContain('memcpy(resp, &v, 4); *respLen = 4; return 0;')
        // Falls through to the real flat call when NOT identity-only.
        expect(body).toContain('g_bd_flat_SteamUtils011_GetAppID(')
      })
    })

    describe('generation-time refusals (never a silently-wrong dispatch case)', () => {
      const base: InterfaceManifestV2 = {
        schemaVersion: 2,
        interface: 'DispatchCheck001',
        family: 'DispatchCheck',
        ordinal: 60,
        arches: ['x86'],
        mode: 'wire',
        complete: true,
        helperInterface: 'SteamAPI_DispatchCheck_v001',
        source: { kind: 'synthetic', ref: 'unit test', file: 'n/a' },
        methods: [
          {
            slot: 0,
            name: 'DoThing_TESTONLY',
            returns: 'void',
            returnKind: 'void',
            stackBytes: 0,
            params: [],
            helperFlat: 'SteamAPI_IDispatchCheck_DoThing_TESTONLY'
          }
        ]
      }

      it('throws when a dispatch-eligible wire method has no helperFlat', () => {
        const bad: InterfaceManifestV2 = {
          ...base,
          methods: [{ ...base.methods[0], helperFlat: undefined }]
        }
        expect(() => generateDispatchHeader([bad])).toThrow(/helperFlat/)
      })

      it('throws when the manifest has no helperInterface', () => {
        const bad: InterfaceManifestV2 = {
          ...base,
          helperInterface: undefined
        }
        expect(() => generateDispatchHeader([bad])).toThrow(/helperInterface/)
      })

      it('throws when a dispatch-eligible method declares an out-value param', () => {
        const bad: InterfaceManifestV2 = {
          ...base,
          methods: [
            {
              ...base.methods[0],
              params: [
                {
                  name: 'pValue',
                  type: 'int32*',
                  kind: 'out-value',
                  valueType: 'int32'
                }
              ]
            }
          ]
        }
        expect(() => generateDispatchHeader([bad])).toThrow(/out-value/)
      })

      it('throws when a dispatch-eligible method declares an out-buffer param', () => {
        const bad: InterfaceManifestV2 = {
          ...base,
          methods: [
            {
              ...base.methods[0],
              params: [
                {
                  name: 'pchDir',
                  type: 'char*',
                  kind: 'out-buffer',
                  sizeParam: 'cubBuffer'
                }
              ]
            }
          ]
        }
        expect(() => generateDispatchHeader([bad])).toThrow(/out-buffer/)
      })

      it('throws when a class return has a structSize other than 8', () => {
        const bad: InterfaceManifestV2 = {
          ...base,
          methods: [
            {
              ...base.methods[0],
              name: 'GetSummary_TESTONLY',
              helperFlat: 'SteamAPI_IDispatchCheck_GetSummary_TESTONLY',
              returns: 'Summary_t',
              returnKind: 'class',
              structSize: 16
            }
          ]
        }
        expect(() => generateDispatchHeader([bad])).toThrow(/structSize/)
      })

      it('a stub or fallback method with helperFlat missing is NOT flagged (never dispatch-eligible)', () => {
        const stubManifest: InterfaceManifestV2 = {
          ...base,
          mode: 'stub',
          methods: [{ ...base.methods[0], helperFlat: undefined }]
        }
        expect(() => generateDispatchHeader([stubManifest])).not.toThrow()

        const fallbackManifest: InterfaceManifestV2 = {
          ...base,
          methods: [
            { ...base.methods[0], helperFlat: undefined, helperFallback: true }
          ]
        }
        expect(() => generateDispatchHeader([fallbackManifest])).not.toThrow()
      })
    })
  })
})
