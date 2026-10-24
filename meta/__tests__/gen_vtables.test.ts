import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

import {
  bareAccessorName,
  hasGameServerFlatStub,
  cfgFamilyName,
  computeRetN,
  computeWireTableHash,
  generateDefFile,
  generateDispatchHeader,
  generateShimC,
  generateShimExportsTs,
  emitFlatExports,
  flatMethodName,
  LIFECYCLE_NOOP_EXPORTS,
  isSretReturn,
  isRaxStructSize,
  isHiddenPointerFlatReturn,
  isStringReturn,
  is64BitRegisterReturn,
  paramWidth,
  toVersionedAccessorSuffix,
  validateManifest,
  FLAT_EXPORTS_SUPERSET,
  GAMESERVER_FLAT_STUBS,
  MODERN_LOOKUP_FLAT_EXPORTS,
  STRING_RETURN_BUF_BYTES,
  WIRE_LAYOUT_DOC,
  X64_NULL_OBJECT_SLOTS,
  type InterfaceManifestV2
} from '../gen_vtables'
import { CONTROL_SLOT } from '../../src/backend/storeManagers/steam/bridge/protocol'
import { BARE_ACCESSOR_FAMILY } from '../../src/backend/storeManagers/steam/bridge/interfaceVersions'
import {
  SHIM_SERVED_INTERFACE_VERSIONS,
  SHIM64_SERVED_INTERFACE_VERSIONS
} from '../../src/backend/storeManagers/steam/bridge/shimCoverage'

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

function loadAllManifests(): InterfaceManifestV2[] {
  return readdirSync(SDK_DIR)
    .filter((f) => f.endsWith('.manifest.json'))
    .map((f) => JSON.parse(readFileSync(join(SDK_DIR, f), 'utf-8')))
    .filter((m) => m.schemaVersion === 2 && m.family)
}

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

    it('the identity marker keepalive is a volatile POINTER object (survives -O2)', () => {
      // Regression found by quick 261023-tyf: at -O2 a pointer-to-volatile
      // local is dead and gets deleted, taking the GameLibSteamBridgeShim/2
      // string out of both DLLs (measured: 0 occurrences). A store to a
      // volatile pointer object has to be emitted.
      const c = generateShimC([isteamuser, isteamfriends])
      expect(c).toContain(
        'const char *volatile gamelib_marker_keepalive = g_gamelib_shim_marker;'
      )
      expect(c).not.toContain('volatile const char *gamelib_marker_keepalive')
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
    // 51-11: isteamuser.manifest.json is now Proton-extracted (complete,
    // all 33 real SteamUser023 slots) rather than hand-authored -- the
    // extractor's classifyProtonReturn() reports GetHSteamUser's real C
    // return type (`int32_t`) as "int32", not the old hand-picked semantic
    // label "HSteamUser". Both map to the same 4-byte register return
    // (cType('int32') -> int32_t, cType('HSteamUser') -> uint32_t); only
    // the display string in this generated comment changed.
    it('contains "ret 0" for the zero-arg slot', () => {
      const c = generateShimC([isteamuser, isteamfriends])
      expect(c).toMatch(/GetHSteamUser\([^)]*\) -> int32 \| __thiscall ret 0/)
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

    // 51-11: isteamfriends.manifest.json is now Proton-extracted and
    // complete (78 real SteamFriends018 slots), so many OTHER methods
    // (GetFriendPersonaName, GetClanName, ...) are also genuinely
    // const-char*-returning -- the pin narrows to "GetPersonaName is
    // among them" rather than "is the only one", which was only ever true
    // of the old hand-authored 1-method partial manifest.
    it('24-CR-01: isStringReturn classifies GetPersonaName as a string return, across both pinned manifests', () => {
      const methods = [...isteamuser.methods, ...isteamfriends.methods]
      expect(methods.filter(isStringReturn).map((m) => m.name)).toContain(
        'GetPersonaName'
      )
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

    // 51-11 Task 3: the enforced completeness gate -- every production
    // manifest under meta/sdk/ must declare every real slot of its
    // interface version (never a partial/placeholder manifest committed
    // to the repo). Separate from the "validates clean" test above
    // because `complete: false` is not itself a validateManifest error
    // (it only SKIPS the slot-gap check) -- this test is the one place
    // that refuses a manifest for being incomplete, not merely internally
    // consistent.
    it('every committed meta/sdk manifest has complete: true', () => {
      const manifestFiles = readdirSync(SDK_DIR).filter((f) =>
        f.endsWith('.manifest.json')
      )
      expect(manifestFiles.length).toBeGreaterThan(0)
      for (const file of manifestFiles) {
        const manifest: InterfaceManifestV2 = JSON.parse(
          readFileSync(join(SDK_DIR, file), 'utf-8')
        )
        expect({ file, complete: manifest.complete }).toEqual({
          file,
          complete: true
        })
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

    it('keeps the Proton/export spelling (lowercase m) unchanged', () => {
      expect(bareAccessorName('SteamMatchmaking')).toBe('SteamMatchmaking')
      expect(bareAccessorName('SteamMatchmakingServers')).toBe(
        'SteamMatchmakingServers'
      )
    })
  })

  describe('cfgFamilyName (CR-02)', () => {
    it('maps the manifest spelling to the backend cfg spelling', () => {
      expect(cfgFamilyName('SteamMatchmaking')).toBe('SteamMatchMaking')
      expect(cfgFamilyName('SteamMatchmakingServers')).toBe(
        'SteamMatchMakingServers'
      )
      expect(cfgFamilyName('SteamUser')).toBe('SteamUser')
    })

    it('generated C looks matchmaking up under the cfg spelling, exports under the real spelling', () => {
      const mm = loadAllManifests().filter((m) =>
        /^SteamMatchmaking(Servers)?$/.test(m.family)
      )
      expect(mm.length).toBeGreaterThanOrEqual(2)
      const c = generateShimC(mm)
      expect(c).toContain('{ "SteamMatchMaking009", "SteamMatchMaking",')
      expect(c).toContain(
        '{ "SteamMatchMakingServers002", "SteamMatchMakingServers",'
      )
      expect(c).toMatch(
        /void \*SteamMatchmaking\(void\) \{\n {2}return resolve_bare_iface\("SteamMatchMaking"\);/
      )
      expect(c).toMatch(
        /void \*SteamMatchmakingServers\(void\) \{\n {2}return resolve_bare_iface\("SteamMatchMakingServers"\);/
      )
      expect(c).not.toContain('resolve_bare_iface("SteamMatchmaking")')
    })
  })

  describe('family spelling pin across manifest / backend cfg / served map (CR-02)', () => {
    function familyMismatches(manifests: InterfaceManifestV2[]): string[] {
      const out: string[] = []
      for (const m of manifests) {
        const bare = bareAccessorName(m.family)
        // Phase 53: SteamGameServer / SteamGameServerStats keep their fixed
        // GAMESERVER flat stubs as the bare export (no iface cfg lookup).
        if (hasGameServerFlatStub(bare)) continue
        if (!(bare in BARE_ACCESSOR_FAMILY)) {
          out.push(
            `${m.interface}: bare export ${bare} not in BARE_ACCESSOR_FAMILY`
          )
          continue
        }
        if (cfgFamilyName(m.family) !== BARE_ACCESSOR_FAMILY[bare]) {
          out.push(
            `${m.interface}: cfg ${cfgFamilyName(m.family)} != backend ${BARE_ACCESSOR_FAMILY[bare]}`
          )
        }
      }
      for (const m of manifests) {
        for (const map of [
          SHIM_SERVED_INTERFACE_VERSIONS,
          SHIM64_SERVED_INTERFACE_VERSIONS
        ]) {
          const served = map.get(m.interface)
          if (served && served.family !== cfgFamilyName(m.family)) {
            out.push(
              `${m.interface}: served ${served.family} != cfg ${cfgFamilyName(m.family)}`
            )
          }
        }
      }
      return out
    }

    it('every manifest family agrees with BARE_ACCESSOR_FAMILY and served maps', () => {
      const manifests = loadAllManifests()
      expect(manifests.length).toBeGreaterThan(10)
      // every manifest family must itself be a bare accessor key (not vacuous)
      expect(familyMismatches(manifests)).toEqual([])
    })

    it('negative control: a drifted family is reported', () => {
      const mm = loadAllManifests().find(
        (m) => m.interface === 'SteamMatchMaking009'
      )!
      const bad = { ...mm, family: 'SteamMatchMakingX' }
      expect(familyMismatches([mm])).toEqual([])
      expect(familyMismatches([bad]).length).toBeGreaterThan(0)
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

  // 51-14 Task 2: Pitfall 2 -- XCOM's nine SteamGameServer* imports (plus
  // two accessors XCOM doesn't import but a future title might) must all be
  // honest, unavailable, cdecl-flat stubs so the exe loads at all.
  describe('GAMESERVER_FLAT_STUBS (51-14 Task 2)', () => {
    it('contains all eleven GameServer export names', () => {
      expect([...GAMESERVER_FLAT_STUBS].sort()).toEqual(
        [
          'SteamGameServer_Init',
          'SteamGameServer_Shutdown',
          'SteamGameServer_RunCallbacks',
          'SteamGameServer_BSecure',
          'SteamGameServer_GetSteamID',
          'SteamGameServer_GetHSteamPipe',
          'SteamGameServer_GetHSteamUser',
          'SteamGameServer',
          'SteamGameServerStats',
          'SteamGameServerNetworking',
          'SteamGameServerUtils'
        ].sort()
      )
    })

    it('.def includes every GameServer flat stub name exactly once, arch-agnostic (not manifest-driven)', () => {
      const def = generateDefFile([isteamuser, isteamfriends])
      for (const name of GAMESERVER_FLAT_STUBS) {
        const lines = def.split('\n').filter((l) => l === name)
        expect(lines).toHaveLength(1)
      }
    })

    it('SteamGameServer_Init returns 0, the four accessors return NULL, never a success value', () => {
      const c = generateShimC([isteamuser, isteamfriends])
      expect(c).toMatch(/int SteamGameServer_Init\(void\) \{\s*return 0;\s*\}/)
      expect(c).toMatch(/void \*SteamGameServer\(void\) \{\s*return NULL;\s*\}/)
      expect(c).toMatch(
        /void \*SteamGameServerStats\(void\) \{\s*return NULL;\s*\}/
      )
      expect(c).toMatch(
        /void \*SteamGameServerNetworking\(void\) \{\s*return NULL;\s*\}/
      )
      expect(c).toMatch(
        /void \*SteamGameServerUtils\(void\) \{\s*return NULL;\s*\}/
      )
    })

    it('every GameServer stub is declared cdecl (void) -- no THISCALL attribute on its declaration line', () => {
      const c = generateShimC([isteamuser, isteamfriends])
      for (const name of GAMESERVER_FLAT_STUBS) {
        const re = new RegExp(`^((?!THISCALL).)*\\b${name}\\(void\\)`, 'm')
        expect(c).toMatch(re)
      }
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

  describe('Win64 core interfaces reuse the x86 helper accessors (51-26)', () => {
    const header = generateDispatchHeader(loadAllManifests())
    const load = (name: string): InterfaceManifestV2 =>
      JSON.parse(readFileSync(join(SDK_DIR, name), 'utf-8'))

    it.each([
      ['isteamuser019', 'isteamuser016', 'steamuser019'],
      ['isteamfriends015', 'isteamfriends011', 'steamfriends015'],
      ['isteamutils008', 'isteamutils005', 'steamutils008'],
      ['isteamapps008', 'isteamapps004', 'steamapps_interface_version008']
    ])('%s dlsyms the same accessor string as %s', (x64, x86, suffix) => {
      const x64Manifest = load(`${x64}.manifest.json`)
      const x86Manifest = load(`${x86}.manifest.json`)
      expect(x64Manifest.helperInterface).toBeTruthy()
      expect(x64Manifest.helperInterface).toBe(x86Manifest.helperInterface)
      const line = new RegExp(
        `g_bd_accessor_${suffix} = \\(BDAccessorFn_t\\)dlsym\\(dylibHandle, "${x64Manifest.helperInterface}"\\)`
      )
      expect(header).toMatch(line)
    })
  })

  describe('call-name tables (53-06, D-53-13)', () => {
    const all = loadAllManifests()
    const header = generateDispatchHeader(all)

    it('defines BD_CALL_COUNT, bd_call_index and bd_call_name', () => {
      const count = /#define BD_CALL_COUNT (\d+)/.exec(header)
      expect(count).not.toBeNull()
      expect(Number(count![1])).toBeGreaterThan(0)
      expect(header).toContain('static int bd_call_index(uint16_t ordinal')
      expect(header).toContain('static const char *bd_call_name(int idx)')
      const names = [...header.matchAll(/case \d+: return "([^"]*)";/g)].map(
        (m) => m[1]
      )
      expect(names.length).toBe(Number(count![1]))
    })

    it('call names contain only [A-Za-z0-9_.]', () => {
      const names = [...header.matchAll(/case \d+: return "([^"]*)";/g)].map(
        (m) => m[1]
      )
      expect(names.length).toBeGreaterThan(0)
      for (const n of names) expect(n).toMatch(/^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/)
    })

    it('does not change the wire-table hash', () => {
      const committed = readFileSync(
        join(
          __dirname,
          '../../native/steam-bridge/generated/bridge_dispatch.h'
        ),
        'utf-8'
      )
      const hash = /BRIDGE_DISPATCH_TABLE_HASH "([0-9a-f]+)"/.exec(committed)
      expect(hash![1]).toBe(computeWireTableHash(all))
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

  // 51-15 Task 1: D-51-13 GO -- the Win64 shim target. `arch` is a
  // generator/build/coverage parameter (assumption_delta_decision: promote)
  // rather than a forked generator -- these tests exercise the x64-aware
  // additions to the SAME generateShimC/generateDefFile this file's other
  // describe blocks already cover for x86.
  describe('51-15: Win64 shim generation (D-51-13 GO)', () => {
    const x86OnlyManifest: InterfaceManifestV2 = {
      schemaVersion: 2,
      interface: 'GameLibX86Only001',
      family: 'GameLibX86Only',
      ordinal: 9001,
      arches: ['x86'],
      mode: 'stub',
      complete: true,
      flatAccessor: 'SteamAPI_GameLibX86Only_v001',
      source: { kind: 'synthetic', ref: 'unit test', file: 'n/a' },
      methods: [
        {
          slot: 0,
          name: 'DoThing_TESTONLY',
          returns: 'void',
          returnKind: 'void',
          stackBytes: 0,
          params: []
        }
      ]
    }
    const x64OnlyManifest: InterfaceManifestV2 = {
      schemaVersion: 2,
      interface: 'GameLibX64Only001',
      family: 'GameLibX64Only',
      ordinal: 9002,
      arches: ['x64'],
      mode: 'stub',
      complete: true,
      flatAccessor: 'SteamAPI_GameLibX64Only_v001',
      source: { kind: 'synthetic', ref: 'unit test', file: 'n/a' },
      methods: [
        {
          slot: 0,
          name: 'DoOtherThing_TESTONLY',
          returns: 'void',
          returnKind: 'void',
          stackBytes: 0,
          params: []
        }
      ]
    }

    describe('X64_NULL_OBJECT_SLOTS', () => {
      it('is 256', () => {
        expect(X64_NULL_OBJECT_SLOTS).toBe(256)
      })

      it('the generated null-object vtable array declares exactly that many slots, gated under __x86_64__', () => {
        const c = generateShimC([x86OnlyManifest])
        expect(c).toContain('#if defined(__x86_64__)')
        expect(c).toContain(
          `static vfn g_x64_null_object_vtbl[${X64_NULL_OBJECT_SLOTS}]`
        )
        const entryCount = (c.match(/\(vfn\)vt_x64_null_object,/g) ?? []).length
        expect(entryCount).toBe(X64_NULL_OBJECT_SLOTS)
      })
    })

    describe("generateDefFile(manifests, 'x64')", () => {
      it('starts with LIBRARY steam_api64', () => {
        const def = generateDefFile([x64OnlyManifest], 'x64')
        expect(def.split('\n')[0]).toBe('LIBRARY steam_api64')
      })

      it("includes an x64-arched manifest's flat accessor but excludes an x86-only one", () => {
        const def = generateDefFile([x86OnlyManifest, x64OnlyManifest], 'x64')
        expect(def).toContain('SteamAPI_GameLibX64Only_v001')
        expect(def).not.toContain('SteamAPI_GameLibX86Only_v001')
      })

      it("the x86 def excludes an x64-only manifest's flat accessor", () => {
        const def = generateDefFile([x86OnlyManifest, x64OnlyManifest], 'x86')
        expect(def).toContain('SteamAPI_GameLibX86Only_v001')
        expect(def).not.toContain('SteamAPI_GameLibX64Only_v001')
      })

      it('lists SteamInternal_CreateInterface / SteamAPI_GetHSteamUser / SteamAPI_GetHSteamPipe on x64 but not on x86 (Win64-only modern lookup family)', () => {
        const defX64 = generateDefFile([x86OnlyManifest], 'x64')
        const defX86 = generateDefFile([x86OnlyManifest], 'x86')
        for (const name of MODERN_LOOKUP_FLAT_EXPORTS) {
          expect(defX64.split('\n')).toContain(name)
          expect(defX86.split('\n')).not.toContain(name)
        }
      })
    })

    describe("arch-gated vtable/table rows (prohibition: x64 build never includes an x86-only manifest's vtable, and vice versa)", () => {
      it("an x86-only manifest's vtable stub is wrapped in #if defined(__i386__)", () => {
        const c = generateShimC([x86OnlyManifest])
        expect(c).toMatch(/#if defined\(__i386__\)\n\/\/ === GameLibX86Only001/)
      })

      it("an x64-only manifest's vtable stub is wrapped in #if defined(__x86_64__)", () => {
        const c = generateShimC([x64OnlyManifest])
        expect(c).toMatch(
          /#if defined\(__x86_64__\)\n\/\/ === GameLibX64Only001/
        )
      })

      it("a dual-arch manifest's vtable stub carries no arch guard at all", () => {
        const dualArch: InterfaceManifestV2 = {
          ...x86OnlyManifest,
          interface: 'GameLibDualArch001',
          arches: ['x86', 'x64']
        }
        const c = generateShimC([dualArch])
        expect(c).toContain('// === GameLibDualArch001')
        expect(c).not.toMatch(/#if[^\n]*\n\/\/ === GameLibDualArch001/)
      })

      it("an x64-only manifest's flat accessor is also arch-gated", () => {
        const c = generateShimC([x64OnlyManifest])
        expect(c).toMatch(
          /#if defined\(__x86_64__\)\nvoid \*SteamAPI_GameLibX64Only_v001/
        )
      })
    })

    describe('SteamInternal_CreateInterface (modern-SDK lookup family)', () => {
      it('appears in the generated shim, gated under __x86_64__, and resolves by exact version string with an x64 null-object fallback', () => {
        const c = generateShimC([x86OnlyManifest])
        expect(c).toContain('SteamInternal_CreateInterface')
        expect(c).toMatch(
          /#if defined\(__x86_64__\)\nvoid \*SteamInternal_CreateInterface/
        )
        expect(c).toContain('resolve_iface_by_exact_version(pszVersion)')
        expect(c).toContain('return (void *)&g_x64_null_object_instance;')
      })

      it('SteamAPI_GetHSteamUser and SteamAPI_GetHSteamPipe both answer the constant handle 1', () => {
        const c = generateShimC([x86OnlyManifest])
        expect(c).toContain('int SteamAPI_GetHSteamUser(void) { return 1; }')
        expect(c).toContain('int SteamAPI_GetHSteamPipe(void) { return 1; }')
      })

      it('resolve_iface_by_exact_version is forward-declared before vtableSections and defined once, after g_iface_table is complete', () => {
        const c = generateShimC([x86OnlyManifest])
        const protoIdx = c.indexOf(
          'static void *resolve_iface_by_exact_version(const char *version);'
        )
        const defIdx = c.indexOf(
          'static void *resolve_iface_by_exact_version(const char *version) {'
        )
        const vtableIdx = c.indexOf('// === GameLibX86Only001')
        expect(protoIdx).toBeGreaterThanOrEqual(0)
        expect(defIdx).toBeGreaterThan(protoIdx)
        expect(protoIdx).toBeLessThan(vtableIdx)
        expect(defIdx).toBeGreaterThan(vtableIdx)
      })
    })

    describe('SteamClient-family GetISteamXxx version-lookup special case', () => {
      const steamClientManifest: InterfaceManifestV2 = {
        schemaVersion: 2,
        interface: 'SteamClient017',
        family: 'SteamClient',
        ordinal: 9003,
        arches: ['x64'],
        mode: 'stub',
        complete: true,
        source: { kind: 'synthetic', ref: 'unit test', file: 'n/a' },
        methods: [
          {
            slot: 0,
            name: 'GetISteamUser',
            returns: 'void*',
            returnKind: 'pointer',
            stackBytes: 12,
            params: [
              { name: 'hSteamUser', type: 'HSteamUser' },
              { name: 'hSteamPipe', type: 'HSteamPipe' },
              { name: 'pchVersion', type: 'const char*' }
            ]
          },
          {
            slot: 1,
            name: 'CreateSteamPipe',
            returns: 'HSteamPipe',
            returnKind: 'int32',
            stackBytes: 0,
            params: [],
            helperFallback: 1
          }
        ]
      }

      it('GetISteamUser resolves by the version-string param and ignores hSteamUser/hSteamPipe', () => {
        const c = generateShimC([steamClientManifest])
        const match = c.match(
          /static void \* THISCALL vt_SteamClient017_GetISteamUser\([^{]*\) \{[\s\S]*?\n\}/
        )
        expect(match).not.toBeNull()
        const body = match![0]
        expect(body).toContain('(void)hSteamUser;')
        expect(body).toContain('(void)hSteamPipe;')
        expect(body).not.toContain('(void)pchVersion;')
        expect(body).toContain('resolve_iface_by_exact_version(pchVersion)')
        expect(body).not.toContain('bridge_transact')
      })

      it('CreateSteamPipe (not a GetISteamXxx accessor) is unaffected and keeps its ordinary helperFallback behavior', () => {
        const c = generateShimC([steamClientManifest])
        expect(c).toContain(
          'static uint32_t THISCALL vt_SteamClient017_CreateSteamPipe(void *self) {'
        )
        expect(c).toMatch(
          /vt_SteamClient017_CreateSteamPipe\(void \*self\) \{\n {2}\(void\)self;\n {2}return 1;\n\}/
        )
      })
    })
  })
  describe('modern-SDK SteamInternal_* exports (quick 261024-i94)', () => {
    const FIVE = [
      'SteamInternal_SteamAPI_Init',
      'SteamInternal_ContextInit',
      'SteamInternal_FindOrCreateUserInterface',
      'SteamInternal_FindOrCreateGameServerInterface',
      'SteamInternal_GameServer_Init_V2'
    ]
    const manifests = [isteamuser, isteamfriends]

    function modernBlock(): string {
      const c = generateShimC(manifests)
      const start = c.indexOf('// === Modern-SDK lookup family')
      expect(start).toBeGreaterThan(-1)
      const end = c.indexOf('// === SteamGameServer*', start)
      return c.slice(start, end)
    }

    function body(name: string): string {
      const block = modernBlock()
      const at = block.search(new RegExp(`\\b${name}\\(`))
      expect(at).toBeGreaterThan(-1)
      const next = block.indexOf('\n}\n', at)
      return block.slice(at, next === -1 ? undefined : next + 3)
    }

    it('x64 .def lists all five; x86 .def lists none', () => {
      const x64 = generateDefFile(manifests, 'x64')
      const x86 = generateDefFile(manifests, 'x86')
      for (const n of FIVE) {
        expect(x64).toMatch(new RegExp(`^\\s*${n}\\s*$`, 'm'))
        expect(x86).not.toContain(n)
      }
      expect(generateDefFile(loadAllManifests(), 'x86')).toBe(
        readFileSync(
          join(
            __dirname,
            '..',
            '..',
            'native/steam-bridge/generated/steam_api.def'
          ),
          'utf-8'
        )
      )
    })

    it('defines each of the five inside the x64-only modern block', () => {
      const block = modernBlock()
      for (const n of FIVE) expect(block).toContain(n + '(')
    })

    it('SteamInternal_SteamAPI_Init calls SteamAPI_Init, returns 0 on ok and 2 on failure', () => {
      const b = body('SteamInternal_SteamAPI_Init')
      expect(b).toContain('SteamAPI_Init()')
      expect(b).toContain('return 0;')
      expect(b).toContain('return 2;')
    })

    it('SteamInternal_GameServer_Init_V2 returns 1 and never 0', () => {
      const b = body('SteamInternal_GameServer_Init_V2')
      expect(b).toContain('return 1;')
      expect(b).not.toContain('return 0;')
    })

    it('Phase 53 (D-53-11): pre-V2 SteamInternal_GameServer_Init is x64-only, returns bool false and never reaches the helper', () => {
      const all = loadAllManifests()
      expect(generateDefFile(all, 'x64')).toMatch(
        /^\s*SteamInternal_GameServer_Init\s*$/m
      )
      expect(generateDefFile(all, 'x86')).not.toContain(
        'SteamInternal_GameServer_Init'
      )
      const b = body('SteamInternal_GameServer_Init')
      expect(b).toContain('return 0;')
      expect(b).not.toContain('return 1;')
      expect(b).not.toContain('bridge_transact')
      expect(b).not.toContain('snprintf')
    })

    it('Phase 53 (D-53-03): the new versions get their own instances inside the x64 guard', () => {
      const c = generateShimC(loadAllManifests())
      for (const inst of [
        'g_steamclient020_instance',
        'g_steamclient021_instance',
        'g_steamutils010_instance',
        'g_steaminput006_instance',
        'g_steamgameserverstats001_instance'
      ]) {
        expect(c).toContain(inst)
      }
    })

    it('Phase 53 (D-53-06): SteamUtils010 IsSteamRunningOnSteamDeck is a local stub answering 0', () => {
      const c = generateShimC(loadAllManifests())
      const m = c.match(
        /vt_SteamUtils010_IsSteamRunningOnSteamDeck\(void \*self\) \{[^}]*\}/
      )
      expect(m).not.toBeNull()
      expect(m![0]).toContain('return 0;')
      expect(m![0]).not.toContain('bridge_transact')
    })

    it('FindOrCreate* resolve by exact version with null-object fallback', () => {
      for (const n of [
        'SteamInternal_FindOrCreateUserInterface',
        'SteamInternal_FindOrCreateGameServerInterface'
      ]) {
        const b = body(n)
        expect(b).toContain('resolve_iface_by_exact_version(')
        expect(b).toContain('g_x64_null_object_instance')
      }
    })

    it('ContextInit guards NULL and only calls pFn when the counter differs', () => {
      const b = body('SteamInternal_ContextInit')
      expect(b).toContain('return NULL')
      expect(b).toContain('g_gamelib_context_counter')
      expect(b).toMatch(/!=\s*g_gamelib_context_counter/)
    })
  })

  describe('Phase 52: GameLibBridge_CreateInterface (52-07)', () => {
    const manifests = [isteamuser, isteamfriends]
    function cBody(): string {
      const c = generateShimC(manifests)
      const at = c.indexOf('void *GameLibBridge_CreateInterface(')
      expect(at).toBeGreaterThan(-1)
      return c.slice(at, c.indexOf('\n}\n', at) + 3)
    }

    it('Phase 52: x64 .def lists it, x86 .def does not', () => {
      expect(generateDefFile(manifests, 'x64')).toMatch(
        /^\s*GameLibBridge_CreateInterface\s*$/m
      )
      expect(generateDefFile(manifests, 'x86')).not.toContain(
        'GameLibBridge_CreateInterface'
      )
    })

    it('Phase 52: control slot define equals protocol.ts CONTROL_SLOT.createInterface', () => {
      const c = generateShimC(manifests)
      const m = c.match(/#define BRIDGE_CONTROL_SLOT_CREATE_INTERFACE (\d+)/)
      expect(m).not.toBeNull()
      expect(Number(m![1])).toBe(CONTROL_SLOT.createInterface)
    })

    it('Phase 52: body is native-backed and never returns the null object', () => {
      const b = cBody()
      expect(b).toContain('BRIDGE_CONTROL_SLOT_CREATE_INTERFACE')
      expect(b).toContain('resolve_iface_by_exact_version')
      expect(b).not.toContain('g_x64_null_object_instance')
    })

    it('Phase 52: lives inside the x64-only block', () => {
      const c = generateShimC(manifests)
      const at = c.indexOf('void *GameLibBridge_CreateInterface(')
      const guard = c.lastIndexOf('#if defined(__x86_64__)', at)
      expect(guard).toBeGreaterThan(-1)
      expect(c.slice(guard, at)).not.toContain('#endif')
    })
  })

  describe('Phase 52: SteamClient forwarding manifests', () => {
    const load = (file: string): InterfaceManifestV2 =>
      JSON.parse(readFileSync(join(SDK_DIR, file), 'utf-8'))
    const c17 = load('isteamclient017.manifest.json')
    const c14 = load('isteamclient014.manifest.json')
    const localOnly = new Set([
      'SetWarningMessageHook',
      'DEPRECATED_Set_SteamAPI_CPostAPIResultInProcess',
      'DEPRECATED_Remove_SteamAPI_CPostAPIResultInProcess',
      'Set_SteamAPI_CCheckCallbackRegisteredInProcess',
      'SetLocalIPBinding'
    ])
    const strip = (n: string) => n.replace(/^DEPRECATED_/, '')

    it.each([
      ['SteamClient017', c17],
      ['SteamClient014', c14]
    ])('%s is a wire manifest on helperInterface SteamClient', (_n, m) => {
      expect(m.helperInterface).toBe('SteamClient')
      expect(m.mode).toBe('wire')
      expect(m.arches).toEqual(['x64'])
      expect(JSON.stringify(m)).not.toContain('helperFallback')
    })

    it.each([
      ['SteamClient017', c17],
      ['SteamClient014', c14]
    ])('%s forwards every method except the local-only set', (_n, m) => {
      for (const method of m.methods) {
        if (localOnly.has(method.name)) {
          expect(method.mode).toBe('stub')
          continue
        }
        expect(method.mode).toBe('wire')
        expect(method.helperFlat).toBe(
          `SteamAPI_ISteamClient_${strip(method.name)}`
        )
        for (const p of method.params) {
          if (p.name === 'pchVersion') expect(p.kind).toBe('in-string')
        }
      }
      const create = m.methods.find((x) => x.name === 'CreateLocalUser')!
      const pipe = create.params.find((p) => p.name === 'phSteamPipe')!
      expect(pipe.kind).toBe('out-value')
      expect(pipe.valueType).toBe('int32')
    })

    it('SteamClient014 has 29 slots equal in shape to 017 slots 0-28', () => {
      expect(c14.methods).toHaveLength(29)
      for (let i = 0; i < 29; i++) {
        const a = c14.methods[i]
        const b = c17.methods[i]
        expect(strip(a.name)).toBe(strip(b.name))
        expect(a.returnKind).toBe(b.returnKind)
        expect(a.params.length).toBe(b.params.length)
      }
    })

    it('ordinals.json carries SteamClient014 without moving existing ordinals', () => {
      const ords = JSON.parse(
        readFileSync(join(SDK_DIR, 'ordinals.json'), 'utf-8')
      )
      expect(ords.SteamClient014).toBe(22)
      expect(ords.SteamClient017).toBe(16)
    })
  })

  describe('Phase 52: SteamClient forwarded lookups and FWD dispatch', () => {
    const load = (file: string): InterfaceManifestV2 =>
      JSON.parse(readFileSync(join(SDK_DIR, file), 'utf-8'))
    const c17 = load('isteamclient017.manifest.json')
    const c14 = load('isteamclient014.manifest.json')
    const shim = generateShimC([c17, c14])
    const dispatch = generateDispatchHeader([c17, c14])

    const fnBody = (src: string, name: string): string => {
      const start = src.indexOf(`${name}(`)
      expect(start).toBeGreaterThan(-1)
      return src.slice(start, src.indexOf('\n}\n', start))
    }
    const caseBody = (name: string): string => {
      const start = dispatch.indexOf(`// ${name}\n`)
      expect(start).toBeGreaterThan(-1)
      return dispatch.slice(start, dispatch.indexOf('\n    }', start))
    }

    const FLAG = 'if (!g_bridge_steamstub_path_active)'
    const assertGated = (b: string): void => {
      const flagAt = b.indexOf(FLAG)
      const txAt = b.indexOf('bridge_transact(')
      expect(flagAt).toBeGreaterThan(-1)
      expect(txAt).toBeGreaterThan(flagAt)
      const local = b.slice(flagAt, txAt)
      expect(local).not.toContain('bridge_transact(')
      expect(local).toContain('resolve_iface_by_exact_version(pchVersion)')
      expect(b.slice(0, flagAt)).toContain('#if defined(__x86_64__)')
      expect(local).toContain(
        'return local != NULL ? local : (void *)&g_x64_null_object_instance;'
      )
      expect(b.slice(txAt)).toContain('if (present == 0) return NULL;')
    }

    it.each(['SteamClient017', 'SteamClient014'])(
      'CR-01: %s GetISteamUser gates forwarding behind the SteamStub flag with a null-object fallback',
      (iface) => {
        const b = fnBody(shim, `vt_${iface}_GetISteamUser`)
        assertGated(b)
        expect(b).toContain('resolve_iface_by_exact_version(pchVersion)')
      }
    )

    it('CR-01: every wire GetISteam* lookup in 017 and 014 has the flag branch', () => {
      let seen = 0
      for (const m of [c17, c14]) {
        for (const method of m.methods) {
          if (method.mode !== 'wire') continue
          if (!/GetISteam/.test(method.name)) continue
          assertGated(fnBody(shim, `vt_${m.interface}_${method.name}`))
          seen++
        }
      }
      expect(seen).toBeGreaterThan(0)
    })

    // WR-09 (52-20): pre-phase local answers at 7ed535984.
    const OFF_PATH_EXPECTED: Record<string, string> = {
      CreateSteamPipe: ' 1',
      ConnectToGlobalUser: ' 1',
      BReleaseSteamPipe: ' 0',
      CreateLocalUser: ' 0',
      GetIPCCallCount: ' 0',
      BShutdownIfAllPipesClosed: ' 0',
      ReleaseUser: '',
      RunFrame: ''
    }
    const assertOffPathGated = (b: string, ret: string): void => {
      const flagAt = b.indexOf(FLAG)
      const txAt = b.indexOf('bridge_transact(')
      expect(flagAt).toBeGreaterThan(-1)
      expect(txAt).toBeGreaterThan(flagAt)
      expect(b.slice(0, flagAt)).toContain('#if defined(__x86_64__)')
      const local = b.slice(flagAt, txAt)
      expect(local).toContain(`{ return${ret}; }`)
      expect(local).not.toContain('bridge_transact(')
    }

    it('WR-09: every wire method of 017 and 014 is gated ahead of bridge_transact', () => {
      for (const m of [c17, c14]) {
        let nonLookups = 0
        for (const method of m.methods) {
          if (method.mode !== 'wire') continue
          const b = fnBody(shim, `vt_${m.interface}_${method.name}`)
          if (/GetISteam/.test(method.name)) {
            assertGated(b)
            continue
          }
          expect(OFF_PATH_EXPECTED).toHaveProperty(method.name)
          assertOffPathGated(b, OFF_PATH_EXPECTED[method.name])
          nonLookups++
        }
        expect(nonLookups).toBe(8)
      }
    })

    it('WR-09: a non-SteamClient wire method has no SteamStub flag', () => {
      const out = generateShimC([isteamuser])
      expect(out).not.toContain('if (!g_bridge_steamstub_path_active)')
    })

    it('WR-09: generation refuses a SteamClient non-lookup wire method with no off-path value', () => {
      const bad: InterfaceManifestV2 = JSON.parse(JSON.stringify(c17))
      const m = bad.methods.find((x) => x.name === 'CreateSteamPipe')!
      m.returnKind = 'pointer'
      expect(() => generateShimC([bad])).toThrow(
        /SteamClient017\.CreateSteamPipe/
      )
    })

    it('WR-09: committed steam_api_shim.c gates all 16 non-lookup functions', () => {
      const committed = readFileSync(
        join(
          __dirname,
          '..',
          '..',
          'native',
          'steam-bridge',
          'generated',
          'steam_api_shim.c'
        ),
        'utf-8'
      )
      let seen = 0
      for (const iface of ['SteamClient017', 'SteamClient014']) {
        for (const [name, ret] of Object.entries(OFF_PATH_EXPECTED)) {
          assertOffPathGated(fnBody(committed, `vt_${iface}_${name}`), ret)
          seen++
        }
      }
      expect(seen).toBe(16)
    })

    it('CR-01: committed steam_api_shim.c keeps the null-object fallback for ordinary titles', () => {
      const committed = readFileSync(
        join(
          __dirname,
          '..',
          '..',
          'native',
          'steam-bridge',
          'generated',
          'steam_api_shim.c'
        ),
        'utf-8'
      )
      for (const name of [
        'vt_SteamClient017_GetISteamMatchmaking',
        'vt_SteamClient017_GetISteamUser',
        'vt_SteamClient017_GetISteamUtils',
        'vt_SteamClient014_GetISteamMatchmaking'
      ]) {
        const b = fnBody(committed, name)
        expect(b).toContain(FLAG)
        expect(b).toContain('(void *)&g_x64_null_object_instance')
      }
    })

    it('CR-01: GameLibBridge_CreateInterface sets the flag after the NULL check and never returns the null object', () => {
      const b = fnBody(shim, 'void *GameLibBridge_CreateInterface')
      const nullAt = b.indexOf('if (pszName == NULL) return NULL;')
      const setAt = b.indexOf('g_bridge_steamstub_path_active = 1;')
      expect(nullAt).toBeGreaterThan(-1)
      expect(setAt).toBeGreaterThan(nullAt)
      expect(b).not.toContain('g_x64_null_object_instance')
    })

    it('a stub-mode SteamClient GetISteam* keeps the old local lookup', () => {
      const stubbed: InterfaceManifestV2 = JSON.parse(JSON.stringify(c17))
      stubbed.interface = 'SteamClient017'
      const m = stubbed.methods.find((x) => x.name === 'GetISteamUser')!
      m.mode = 'stub'
      delete m.helperFlat
      const out = generateShimC([stubbed])
      const b = fnBody(out, 'vt_SteamClient017_GetISteamUser')
      expect(b).toContain('g_x64_null_object_instance')
      expect(b).not.toContain('g_bridge_steamstub_path_active')
      expect(b).not.toContain('bridge_transact(')
    })

    it('encodes a pointer return as a 4-byte presence int', () => {
      const b = caseBody('SteamClient017.GetISteamUser')
      expect(b).toContain('int32_t present = (result != NULL) ? 1 : 0;')
      expect(b).toContain('memcpy(resp, &present, 4);')
      expect(b).toContain('*respLen = 4;')
      expect(b).toContain('native=%s')
    })

    it('still refuses a pointer return outside the SteamClient lookup family', () => {
      const bad: InterfaceManifestV2 = JSON.parse(JSON.stringify(isteamuser))
      const m = bad.methods.find((x) => x.name === 'GetHSteamUser')!
      m.returnKind = 'pointer'
      m.returns = 'void*'
      expect(() => generateDispatchHeader([bad])).toThrow(/unsupported/)

      const bad2: InterfaceManifestV2 = JSON.parse(JSON.stringify(c17))
      const m2 = bad2.methods.find((x) => x.name === 'GetIPCCallCount')!
      m2.returnKind = 'pointer'
      m2.returns = 'void*'
      expect(() => generateDispatchHeader([bad2])).toThrow(/unsupported/)
    })

    it('every SteamClient dispatch case logs a FWD line, including the unresolved branch', () => {
      expect(dispatch).toContain(
        'logts("FWD", "SteamClient017.GetISteamUser unresolved")'
      )
      expect(dispatch).toContain(
        'logts("FWD", "SteamClient017.CreateSteamPipe unresolved")'
      )
      expect(caseBody('SteamClient017.CreateSteamPipe')).toContain(
        'logts("FWD"'
      )
      expect(caseBody('SteamClient017.ReleaseUser')).toContain('logts("FWD"')
      expect(caseBody('SteamClient017.GetISteamUser')).toContain('logts("FWD"')
      expect((dispatch.match(/FWD/g) ?? []).length).toBeGreaterThanOrEqual(30)
    })

    it('forward-declares logts and bounds/sanitises logged version strings', () => {
      expect(dispatch).toContain(
        'static void logts(const char *cat, const char *msg);'
      )
      expect(dispatch).toContain('static void bd_fwd_sanitize(')
      expect(dispatch).toContain('i < 128')
      expect(dispatch).toContain("(c >= 0x20 && c <= 0x7e) ? (char)c : '?'")
      expect(dispatch).toContain('"(null)"')
    })

    it('logs no CSteamID or 64-bit values on the SteamClient path', () => {
      for (const m of [c17, c14]) {
        for (const method of m.methods) {
          expect(['uint64', 'int64', 'class']).not.toContain(method.returnKind)
        }
      }
    })

    it.each([
      'GetISteamUserStats',
      'GetISteamRemoteStorage',
      'GetISteamGameServerStats'
    ])('identity-only refuses forwarded %s (T-52-03)', (name) => {
      const b = caseBody(`SteamClient017.${name}`)
      expect(b.split('\n')[1]).toContain(
        'if (g_bd_identity_only) { *respLen = 0; return 1; }'
      )
      expect(b).toContain('T-52-03')
    })

    it('does not gate the non-app-scoped lookups', () => {
      expect(caseBody('SteamClient017.GetISteamUser')).not.toContain(
        'g_bd_identity_only'
      )
    })

    it('shim and dispatch table hashes agree for the real manifest set', () => {
      const all = loadAllManifests()
      const s = generateShimC(all).match(/BRIDGE_SHIM_TABLE_HASH "([0-9a-f]+)"/)
      const d = generateDispatchHeader(all).match(
        /BRIDGE_DISPATCH_TABLE_HASH "([0-9a-f]+)"/
      )
      expect(s![1]).toBe(d![1])
      expect(s![1]).toBe(computeWireTableHash(all))
    })
  })
})

// ---------------------------------------------------------------------------
// Phase 53 (53-04): the generated flat C API
// ---------------------------------------------------------------------------

type FlatMethod = InterfaceManifestV2['methods'][number]

function flatMethod(
  slot: number,
  name: string,
  returns: string,
  returnKind: FlatMethod['returnKind'],
  params: Array<[string, string]> = [],
  extra: Partial<FlatMethod> = {}
): FlatMethod {
  return {
    slot,
    name,
    returns,
    returnKind,
    stackBytes: 0,
    params: params.map(([type, pname]) => ({ type, name: pname })),
    ...extra
  }
}

function flatFixture(
  iface: string,
  ordinal: number,
  methods: FlatMethod[],
  family = 'Fx'
): InterfaceManifestV2 {
  return {
    schemaVersion: 2,
    interface: iface,
    family,
    ordinal,
    arches: ['x64'],
    mode: 'stub',
    complete: true,
    source: { kind: 'synthetic', ref: 'test', file: 'test' },
    methods
  }
}

function functionBody(c: string, signaturePrefix: string): string {
  const start = c.indexOf(signaturePrefix)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = c.indexOf('\n}\n', start)
  return c.slice(start, end + 3)
}

describe('Phase 53 flat API', () => {
  const real = loadAllManifests()

  it("dispatches every version of a two-version family from self, with each version's own slot and return type", () => {
    const m = [
      flatFixture('Fx001', 901, [
        flatMethod(0, 'A', 'int32', 'int32'),
        flatMethod(1, 'B', 'int32', 'int32'),
        flatMethod(2, 'C', 'int32', 'int32'),
        flatMethod(3, 'Foo', 'int32', 'int32')
      ]),
      flatFixture('Fx002', 902, [
        flatMethod(0, 'A', 'int32', 'int32'),
        flatMethod(1, 'B', 'int32', 'int32'),
        flatMethod(2, 'C', 'int32', 'int32'),
        flatMethod(3, 'D', 'int32', 'int32'),
        flatMethod(4, 'E', 'int32', 'int32'),
        flatMethod(5, 'Foo', 'int32', 'int32')
      ])
    ]
    const c = generateShimC(m)
    const body = functionBody(c, 'int32_t SteamAPI_IFx_Foo(')
    expect(body).toContain('self == (void *)&g_fx001_instance')
    expect(body).toContain('self == (void *)&g_fx002_instance')
    expect(body).toContain('vt[3]')
    expect(body).toContain('vt[5]')
    expect(body).toContain('int32_t (*)(void *)')
  })

  it('an sret method passes a zeroed local as the hidden out pointer and returns it in RAX', () => {
    const c = generateShimC(real)
    expect(c).toContain('uint64_t SteamAPI_ISteamUser_GetSteamID(void *self)')
    const body = functionBody(
      c,
      'uint64_t SteamAPI_ISteamUser_GetSteamID(void *self)'
    )
    expect(body).toContain('uint64_t out = 0;')
    expect(body).toContain('(void * (*)(void *, void *))')
    expect(body).toContain('(self, &out)')
    expect(body).toContain('return out;')
    expect(body).not.toContain('(uint64_t (*)(void *))')
  })

  it('a position whose type differs between versions is widened; each case keeps its own signature and casts', () => {
    const m = [
      flatFixture('Fx001', 901, [
        flatMethod(0, 'Foo', 'int32', 'int32', [['int32', 'a']]),
        flatMethod(1, 'Flag', 'int32', 'int32', [['bool', 'b']])
      ]),
      flatFixture('Fx002', 902, [
        flatMethod(0, 'Foo', 'int32', 'int32', [
          ['int32', 'a'],
          ['void*', 'b']
        ]),
        flatMethod(1, 'Flag', 'int32', 'int32', [['uint32', 'b']])
      ])
    ]
    const c = generateShimC(m)
    const foo = functionBody(c, 'int32_t SteamAPI_IFx_Foo(')
    expect(foo).toMatch(
      /SteamAPI_IFx_Foo\(void \*self, int32_t a1, void \* a2\)/
    )
    expect(foo).toContain('(int32_t (*)(void *, int32_t))vt[0]')
    expect(foo).toContain('(int32_t (*)(void *, int32_t, void *))vt[0]')
    const flag = functionBody(c, 'int32_t SteamAPI_IFx_Flag(')
    expect(flag).toContain('SteamAPI_IFx_Flag(void *self, uint64_t a1)')
    expect(flag).toContain('(bool)(uint8_t)a1')
    expect(flag).toContain('(uint32_t)(uint32_t)a1')
  })

  it('refuses an XMM/GPR mix at one position unless that version is listed; a listed version is left undispatched', () => {
    const m = [
      flatFixture('Fx001', 901, [
        flatMethod(0, 'Foo', 'int32', 'int32', [['float', 'a']])
      ]),
      flatFixture('Fx002', 902, [
        flatMethod(0, 'Foo', 'int32', 'int32', [['int32', 'a']])
      ])
    ]
    expect(() => generateShimC(m)).toThrow(/Fx\.Foo\.Fx00[12]/)
    const c = generateShimC(m, { unrepresentable: ['Fx.Foo.Fx001'] })
    expect(c).toContain('not dispatched: Fx.Foo.Fx001')
    const body = functionBody(c, 'int32_t SteamAPI_IFx_Foo(')
    expect(body).toContain('g_fx002_instance')
    expect(body).not.toContain('g_fx001_instance')
  })

  it('every lifecycle no-op is x64-only, and ManualDispatch answers false without touching the bridge', () => {
    const c = generateShimC(real)
    const x64Start = c.indexOf('Steamworks.NET lifecycle no-ops')
    const guardOpen = c.indexOf('#if defined(__x86_64__)', x64Start)
    expect(guardOpen).toBeGreaterThan(x64Start)
    const guardEnd = c.indexOf('#endif', guardOpen)
    const block = c.slice(guardOpen, guardEnd)
    const x64Def = generateDefFile(real, 'x64')
    const x86Def = generateDefFile(real, 'x86')
    for (const name of LIFECYCLE_NOOP_EXPORTS) {
      expect(block).toMatch(new RegExp(`[ *]${name}\\(`))
      expect(x64Def.split('\n')).toContain(name)
      expect(x86Def.split('\n')).not.toContain(name)
    }
    for (const name of [
      'SteamAPI_ManualDispatch_GetNextCallback',
      'SteamAPI_ManualDispatch_GetAPICallResult'
    ]) {
      expect(block).toContain(`int ${name}(void) { return 0; }`)
    }
    expect(block).not.toContain('bridge_transact')
  })

  it('a float parameter keeps its real type in the signature and the call cast', () => {
    const m = [
      flatFixture('Fx001', 901, [
        flatMethod(0, 'Set', 'bool', 'int32', [
          ['const char*', 'n'],
          ['float', 'f']
        ])
      ])
    ]
    const body = functionBody(generateShimC(m), 'bool SteamAPI_IFx_Set(')
    expect(body).toContain('float a2')
    expect(body).toContain('(int (*)(void *, const char *, float))')
    expect(body).toContain('(float)a2')
    expect(body).not.toMatch(/uint32_t dummy/)
  })

  it('names overload pairs from the numeric parameter type', () => {
    const methods = [
      flatMethod(0, 'GetStat', 'bool', 'int32', [['int32*', 'p']]),
      flatMethod(1, 'GetStat_2', 'bool', 'int32', [['float*', 'p']]),
      flatMethod(2, 'GetBig', 'bool', 'int32', [['int64_t*', 'p']]),
      flatMethod(3, 'GetBig_2', 'bool', 'int32', [['double*', 'p']]),
      flatMethod(4, 'SetStat', 'bool', 'int32', [['int32', 'p']]),
      flatMethod(5, 'SetStat_2', 'bool', 'int32', [['float', 'p']])
    ]
    const names = methods.map((x) => flatMethodName('Fx', x, methods))
    expect(names).toEqual([
      'GetStatInt32',
      'GetStatFloat',
      'GetBigInt64',
      'GetBigDouble',
      'SetStatInt32',
      'SetStatFloat'
    ])
  })

  it('a class return wider than 8 bytes is emitted via the hidden pointer (53-10), 8 stays in RAX', () => {
    const wide = [
      flatFixture('Fx001', 901, [
        flatMethod(0, 'Big', 'Big_t', 'class', [], { structSize: 16 })
      ])
    ]
    expect(generateShimC(wide)).toContain(
      'void * SteamAPI_IFx_Big(void *ret, void *self)'
    )
    const ok = [
      flatFixture('Fx001', 901, [
        flatMethod(0, 'Id', 'CSteamID', 'class', [], { structSize: 8 })
      ])
    ]
    expect(() => generateShimC(ok)).not.toThrow()
  })

  it('flat ISteamClient_GetISteamUser answers NULL for an unknown version and reports it', () => {
    const c = generateShimC(real)
    const body = functionBody(c, 'void * SteamAPI_ISteamClient_GetISteamUser(')
    expect(body).toContain('resolve_iface_by_exact_version')
    expect(body).toContain('flat_report_unknown_version')
    expect(body).toContain('return NULL')
    expect(body).not.toContain('g_x64_null_object_instance')
    expect(c).toContain('#define BRIDGE_CONTROL_SLOT_REPORT_VERSION 4')
    expect(c).toContain('BRIDGE_CONTROL_SLOT_REPORT_VERSION, req')
  })

  it("an unknown or NULL self returns the return type's zero", () => {
    const m = [
      flatFixture('Fx001', 901, [
        flatMethod(0, 'N', 'int32', 'int32'),
        flatMethod(1, 'P', 'void*', 'pointer'),
        flatMethod(2, 'V', 'void', 'void')
      ])
    ]
    const c = generateShimC(m)
    expect(functionBody(c, 'int32_t SteamAPI_IFx_N(')).toMatch(/return 0;\n}/)
    expect(functionBody(c, 'void * SteamAPI_IFx_P(')).toMatch(/return 0;\n}/)
    expect(functionBody(c, 'void SteamAPI_IFx_V(')).toMatch(/return;\n}/)
  })

  it('flat bodies are x64-only: the x86 .def carries none, the x64 .def carries each name once', () => {
    const c = generateShimC(real)
    const flatStart = c.indexOf('Steamworks flat C API (53-04')
    expect(c.slice(flatStart, flatStart + 200)).toContain('Win64 only')
    expect(
      c.slice(c.indexOf('#if', flatStart), c.indexOf('#if', flatStart) + 30)
    ).toContain('#if defined(__x86_64__)')
    const x86 = generateDefFile(real, 'x86').split('\n')
    expect(x86.filter((n) => n.startsWith('SteamAPI_ISteam'))).toEqual([])
    const x64 = generateDefFile(real, 'x64').split('\n')
    const { names } = emitFlatExports(real)
    expect(names.length).toBeGreaterThan(400)
    for (const n of names) {
      expect(x64.filter((l) => l === n)).toHaveLength(1)
    }
  })

  it('IsSteamRunningOnSteamDeck is exported and answers false through the SteamUtils010 stub', () => {
    const c = generateShimC(real)
    expect(generateDefFile(real, 'x64').split('\n')).toContain(
      'SteamAPI_ISteamUtils_IsSteamRunningOnSteamDeck'
    )
    const body = functionBody(
      c,
      'bool SteamAPI_ISteamUtils_IsSteamRunningOnSteamDeck('
    )
    expect(body).toContain('g_steamutils010_instance')
  })

  it('generateShimExportsTs lists the sorted x64 .def names in a prettier-stable shape', () => {
    const ts = generateShimExportsTs(real)
    expect(ts).toContain('GENERATED FILE')
    expect(ts).toContain(
      'export const SHIM64_GENERATED_EXPORTS: readonly string[] = ['
    )
    const listed = [...ts.matchAll(/^ {2}'([^']+)',?$/gm)].map((x) => x[1])
    const defNames = generateDefFile(real, 'x64')
      .split('\n')
      .slice(2)
      .filter(Boolean)
    expect(listed).toEqual([...defNames].sort())
    expect(ts).not.toMatch(/^[^/\n].*;\s*$/m)
    expect(ts.endsWith(']\n')).toBe(true)
  })

  it('the existing null-object pins are untouched', () => {
    const c = generateShimC(real)
    expect(c).toMatch(
      /#if defined\(__x86_64__\)\nvoid \*SteamInternal_CreateInterface/
    )
    expect(c).toContain('return (void *)&g_x64_null_object_instance;')
  })

  it('the flat client lookup and every manifest helperFlat agree on the derived name', () => {
    expect(() => emitFlatExports(real)).not.toThrow()
  })
})

describe('CR-01 / WR-01 / WR-07 / WR-08: struct returns on the x64 flat path (53-10)', () => {
  const real = loadAllManifests()
  const classMethod = (name: string, size: number | undefined, slot = 0) =>
    flatMethod(slot, name, 'Big_t', 'class', [['int32', 'n']], {
      structSize: size
    })

  it('53-10 CR-01 hidden pointer: a 16-byte class return takes the Win64 hidden-pointer form', () => {
    const c = generateShimC([
      flatFixture('Fx001', 901, [classMethod('Get', 16)])
    ])
    const body = functionBody(
      c,
      'void * SteamAPI_IFx_Get(void *ret, void *self'
    )
    expect(body).toContain('self == (void *)&g_fx001_instance')
    expect(body).toContain('(self, ret, (int32_t)a1)')
    expect(body).toContain('return ret;')
    expect(body).toContain('memset(ret, 0, 16);')
    expect(body).not.toContain('uint64_t out')
  })

  it('53-10 CR-01 RAX path: 2-byte and 8-byte class returns keep the uint64_t out form with self first', () => {
    for (const size of [1, 2, 4, 8]) {
      const c = generateShimC([
        flatFixture('Fx001', 901, [classMethod('Get', size)])
      ])
      const body = functionBody(c, 'uint64_t SteamAPI_IFx_Get(void *self')
      expect(body).toContain('uint64_t out = 0;')
      expect(body).toContain('return out;')
    }
  })

  it('53-10 CR-01 odd size: 3, 5, 6, 7 and 20 take the hidden-pointer form', () => {
    for (const size of [3, 5, 6, 7, 20, 40]) {
      expect(isRaxStructSize(size)).toBe(false)
      const c = generateShimC([
        flatFixture('Fx001', 901, [classMethod('Get', size)])
      ])
      expect(c).toContain('void * SteamAPI_IFx_Get(void *ret, void *self')
      expect(c).toContain(`memset(ret, 0, ${size});`)
    }
    for (const size of [1, 2, 4, 8]) expect(isRaxStructSize(size)).toBe(true)
    expect(isHiddenPointerFlatReturn(classMethod('Get', 16))).toBe(true)
    expect(isHiddenPointerFlatReturn(classMethod('Get', 8))).toBe(false)
  })

  it('53-10 WR-07: an unsized class return fails closed from emitFlatExports', () => {
    const m = flatFixture('Fx001', 901, [classMethod('Get', undefined)])
    expect(() => emitFlatExports([m])).toThrow(/Fx001.*Get.*fail closed/)
  })

  it('53-10 WR-08: validateManifest refuses an x64 manifest whose method leads with `_ret`; x86-only still validates', () => {
    const withRet = (arches: Array<'x86' | 'x64'>) => {
      const m = flatFixture('Fx001', 901, [
        flatMethod(0, 'Get', 'Big_t', 'pointer', [['Big_t*', '_ret']])
      ])
      return { ...m, arches }
    }
    const errs = validateManifest(withRet(['x64']))
    expect(errs.join('\n')).toMatch(
      /Fx001.*Get.*_ret.*returnKind 'class' with structSize/
    )
    expect(
      validateManifest(withRet(['x86'])).filter((e) => e.includes('_ret'))
    ).toEqual([])
  })

  it('53-10: no x64 committed manifest models a struct return as a leading `_ret` param', () => {
    const offenders: string[] = []
    for (const m of real) {
      if (!m.arches.includes('x64')) continue
      for (const x of m.methods) {
        if (x.params[0]?.name === '_ret')
          offenders.push(`${m.interface}.${x.name}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('53-10 reconcile mix: versions mixing a RAX-sized and a hidden-pointer struct return throw', () => {
    const m = [
      flatFixture('Fx001', 901, [classMethod('Get', 8)]),
      flatFixture('Fx002', 902, [classMethod('Get', 16)])
    ]
    expect(() => emitFlatExports(m)).toThrow(/Fx.*Get/)
  })
  it('53-10: x64 vtable class return of 2 bytes is sret (MSVC member rule), flat stays RAX', () => {
    const c = generateShimC(real)
    const vt = functionBody(c, 'vt_SteamInput006_GetDigitalActionData(')
    expect(vt).toMatch(/\(void \*self, void \*sretOut, /)
    expect(vt).toContain('memset(sretOut, 0, 2);')
    expect(vt).toContain('return sretOut;')
    const flat = functionBody(
      c,
      'uint64_t SteamAPI_ISteamInput_GetDigitalActionData(void *self'
    )
    expect(flat).toContain('uint64_t out = 0;')
  })

  it('53-10 WR-01: x64 vtable stubs for the remodelled Input006/GameServer methods zero and return the caller buffer', () => {
    const c = generateShimC(real)
    for (const [name, size] of [
      ['vt_SteamInput006_GetAnalogActionData(', 16],
      ['vt_SteamInput006_GetMotionData(', 40],
      ['vt_SteamGameServer014_GetPublicIP(', 20],
      ['vt_SteamGameServer015_GetPublicIP(', 20]
    ] as const) {
      const vt = functionBody(c, name)
      expect(vt).toContain(`memset(sretOut, 0, ${size});`)
      expect(vt).toContain('return sretOut;')
    }
    expect(c).toContain(
      'void * SteamAPI_ISteamInput_GetAnalogActionData(void *ret, void *self'
    )
    expect(c).toContain(
      'void * SteamAPI_ISteamGameServer_GetPublicIP(void *ret, void *self'
    )
  })
})
