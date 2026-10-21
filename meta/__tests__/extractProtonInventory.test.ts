/**
 * Phase 51 Plan 11 Task 2: unit tests for the one-shot Proton inventory
 * extractor. `parseProtonThunks` is exercised against a synthetic fixture
 * (`fixtures/protonThunkExcerpt.txt`) carrying the three real Proton thunk
 * shapes under INVENTED family/version/method names -- no vendored Valve
 * Steamworks SDK header text anywhere in this file or the fixture (D-09).
 */

import { readFileSync } from 'fs'
import { join } from 'path'

import {
  applyWirePolicy,
  classifyProtonReturn,
  computeFlatAccessor,
  manifestFilenameFor,
  mapProtonCType,
  parseProtonThunks,
  resolveOrdinal,
  splitProtonParam,
  type WirePolicy
} from '../extractProtonInventory'

const FIXTURE_PATH = join(__dirname, 'fixtures', 'protonThunkExcerpt.txt')
const fixtureText = readFileSync(FIXTURE_PATH, 'utf-8')

describe('parseProtonThunks (synthetic fixture, D-09 -- no vendored SDK text)', () => {
  const methods = parseProtonThunks(fixtureText, 'AbiFamily', 'AbiFamily002')

  it('returns methods in VTABLE_ADD_FUNC order with contiguous slot indices 0..n-1', () => {
    expect(methods.map((m) => m.name)).toEqual([
      'GetWidgetCount',
      'GetWidgetID',
      'SetWidgetName'
    ])
    expect(methods.map((m) => m.slot)).toEqual([0, 1, 2])
  })

  it('a zero-arg int32_t-returning method: stackBytes = wrapper size (4) - 4 = 0, returnKind int32', () => {
    const m = methods.find((x) => x.name === 'GetWidgetCount')!
    expect(m.stackBytes).toBe(0)
    expect(m.returnKind).toBe('int32')
    expect(m.params).toEqual([])
  })

  it('an sret CSteamID-returning method: returnKind class, structSize 8, stackBytes = 8 - 4 = 4, no synthetic _ret param leaks through', () => {
    const m = methods.find((x) => x.name === 'GetWidgetID')!
    expect(m.returnKind).toBe('class')
    expect(m.structSize).toBe(8)
    expect(m.stackBytes).toBe(4)
    expect(m.params).toEqual([])
  })

  it('a void-returning method with two real params: both params captured with mapped types, the synthetic leading `this` stripped, stackBytes = 8 - 4 = 4', () => {
    const m = methods.find((x) => x.name === 'SetWidgetName')!
    expect(m.returnKind).toBe('void')
    expect(m.stackBytes).toBe(4)
    expect(m.params).toEqual([
      { name: 'widgetID', type: 'uint32' },
      { name: 'pchName', type: 'const char*' }
    ])
  })

  it('throws a clear error when the requested version has no __ASM_VTABLE block in the text', () => {
    expect(() =>
      parseProtonThunks(fixtureText, 'AbiFamily', 'AbiFamily999')
    ).toThrow(/__ASM_VTABLE/)
  })
})

describe('mapProtonCType', () => {
  it('maps every scalar type the 51-11 action text names', () => {
    expect(mapProtonCType('int32_t')).toBe('int32')
    expect(mapProtonCType('uint32_t')).toBe('uint32')
    expect(mapProtonCType('uint64_t')).toBe('uint64')
    expect(mapProtonCType('int8_t')).toBe('bool')
    expect(mapProtonCType('uint16_t')).toBe('uint32')
    expect(mapProtonCType('float')).toBe('float')
    expect(mapProtonCType('double')).toBe('double')
    expect(mapProtonCType('CSteamID')).toBe('CSteamID')
  })

  it('maps the dedicated out-value pointer tokens', () => {
    expect(mapProtonCType('int32_t *')).toBe('int32*')
    expect(mapProtonCType('float *')).toBe('float*')
    expect(mapProtonCType('int8_t *')).toBe('bool*')
    expect(mapProtonCType('const char *')).toBe('const char*')
  })

  it('normalizes an unrecognized pointer type to end with a single *, never duplicating it', () => {
    expect(mapProtonCType('FriendGameInfo_t *')).toBe('FriendGameInfo_t*')
  })
})

describe('splitProtonParam', () => {
  it('splits a normal "type name" declaration', () => {
    expect(splitProtonParam('const char *pchName')).toEqual({
      name: 'pchName',
      type: 'const char*'
    })
  })

  it('normalizes a function-pointer param to a generic void* with its real name extracted', () => {
    expect(
      splitProtonParam('void (*W_CDECL pFunction)(int32_t, const char *)')
    ).toEqual({ name: 'pFunction', type: 'void*' })
  })
})

describe('classifyProtonReturn', () => {
  it('void -> void', () => {
    expect(classifyProtonReturn('void')).toEqual({
      returnKind: 'void',
      returns: 'void',
      sret: false
    })
  })

  it('const char * -> string (never the sret path)', () => {
    expect(classifyProtonReturn('const char *')).toEqual({
      returnKind: 'string',
      returns: 'const char*',
      sret: false
    })
  })

  it('CSteamID * -> class/sret, structBaseType CSteamID', () => {
    expect(classifyProtonReturn('CSteamID *')).toEqual({
      returnKind: 'class',
      returns: 'CSteamID',
      sret: true,
      structBaseType: 'CSteamID'
    })
  })

  it('int8_t -> int32/bool (Steamworks bool convention)', () => {
    expect(classifyProtonReturn('int8_t')).toEqual({
      returnKind: 'int32',
      returns: 'bool',
      sret: false
    })
  })

  it('uint64_t -> int64/uint64 (8-byte register return, never sret)', () => {
    expect(classifyProtonReturn('uint64_t')).toEqual({
      returnKind: 'int64',
      returns: 'uint64',
      sret: false
    })
  })
})

describe('applyWirePolicy', () => {
  const policy: WirePolicy = {
    AbiFamily: {
      GetWidgetCount: { helperFlat: 'SteamAPI_IAbiFamily_GetWidgetCount' },
      SetWidgetName: {
        helperFlat: 'SteamAPI_IAbiFamily_SetWidgetName',
        params: { pchName: { kind: 'in-string' } }
      }
    }
  }

  it('marks a listed method mode wire, attaching helperFlat, and leaves unlisted methods untouched', () => {
    const methods = parseProtonThunks(fixtureText, 'AbiFamily', 'AbiFamily002')
    const wired = applyWirePolicy(methods, 'AbiFamily', policy)

    const getWidgetCount = wired.find((m) => m.name === 'GetWidgetCount')!
    expect(getWidgetCount.mode).toBe('wire')
    expect(getWidgetCount.helperFlat).toBe('SteamAPI_IAbiFamily_GetWidgetCount')

    const getWidgetId = wired.find((m) => m.name === 'GetWidgetID')!
    expect(getWidgetId.mode).toBeUndefined()
    expect(getWidgetId.helperFlat).toBeUndefined()
  })

  it('overrides a named param kind without disturbing its type or other params', () => {
    const methods = parseProtonThunks(fixtureText, 'AbiFamily', 'AbiFamily002')
    const wired = applyWirePolicy(methods, 'AbiFamily', policy)

    const setWidgetName = wired.find((m) => m.name === 'SetWidgetName')!
    expect(setWidgetName.params).toEqual([
      { name: 'widgetID', type: 'uint32' },
      { name: 'pchName', type: 'const char*', kind: 'in-string' }
    ])
  })

  it('is a no-op when the family has no policy entries at all', () => {
    const methods = parseProtonThunks(fixtureText, 'AbiFamily', 'AbiFamily002')
    expect(applyWirePolicy(methods, 'OtherFamily', policy)).toEqual(methods)
  })

  it('silently ignores a policy entry whose method name is absent from this version (forward-compat for a later version)', () => {
    const methods = parseProtonThunks(fixtureText, 'AbiFamily', 'AbiFamily002')
    const widerPolicy: WirePolicy = {
      AbiFamily: {
        NotInThisVersion: { helperFlat: 'SteamAPI_IAbiFamily_NotInThisVersion' }
      }
    }
    expect(applyWirePolicy(methods, 'AbiFamily', widerPolicy)).toEqual(methods)
  })
})

describe('computeFlatAccessor', () => {
  it('modern "<Family><digits>" versions get SteamAPI_<Family>_v<digits>', () => {
    expect(computeFlatAccessor('SteamUser016', 'SteamUser')).toBe(
      'SteamAPI_SteamUser_v016'
    )
  })

  it('old-style "<WHATEVER>_INTERFACE_VERSION0NN" versions synthesize from the family + trailing digits', () => {
    expect(
      computeFlatAccessor('STEAMAPPS_INTERFACE_VERSION004', 'SteamApps')
    ).toBe('SteamAPI_SteamApps_v004')
  })
})

describe('manifestFilenameFor', () => {
  it('keeps the pre-51-11 bare-family filenames for SteamUser023/SteamFriends018', () => {
    expect(manifestFilenameFor('SteamUser023', 'SteamUser')).toBe(
      'isteamuser.manifest.json'
    )
    expect(manifestFilenameFor('SteamFriends018', 'SteamFriends')).toBe(
      'isteamfriends.manifest.json'
    )
  })

  it('derives i<family><digits>.manifest.json for every other version', () => {
    expect(manifestFilenameFor('SteamUser016', 'SteamUser')).toBe(
      'isteamuser016.manifest.json'
    )
    expect(
      manifestFilenameFor('STEAMAPPS_INTERFACE_VERSION004', 'SteamApps')
    ).toBe('isteamapps004.manifest.json')
  })
})

describe('resolveOrdinal (append-only)', () => {
  it('assigns max+1 for a new version and never reassigns an existing one', () => {
    const scratchPath = join(
      __dirname,
      '..',
      '..',
      'node_modules',
      '.gamelib-ordinals-test.json'
    )
    const fs = require('fs') as typeof import('fs')
    fs.writeFileSync(scratchPath, JSON.stringify({ A: 1, B: 2 }))
    try {
      expect(resolveOrdinal('A', scratchPath)).toBe(1)
      expect(resolveOrdinal('C', scratchPath)).toBe(3)
      const persisted = JSON.parse(fs.readFileSync(scratchPath, 'utf-8'))
      expect(persisted).toEqual({ A: 1, B: 2, C: 3 })
      // Re-resolving C again must return the SAME value, never bump it.
      expect(resolveOrdinal('C', scratchPath)).toBe(3)
    } finally {
      fs.rmSync(scratchPath, { force: true })
    }
  })
})
