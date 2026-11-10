import * as fs from 'fs'
import * as os from 'os'
import { join } from 'path'
import {
  chooseInstallBranch,
  decodeUserAppConfigBetaKey,
  isValidBetaKey,
  readAcfBetaKey,
  readLocalConfigBetaKey,
  resolveUserBetaKey,
  steamId64ToAccountId
} from '../depot/betaBranch'
import { selectDepots } from '../depot/select'

// The real logger dereferences a writer only a full init assigns; spy the loaded module's
// functions (no jest.mock: backend-di-ceilings ratchet).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const loggerModule = require('../../../logger')
beforeAll(() => {
  for (const fn of ['logInfo', 'logWarning', 'logError', 'logDebug']) {
    jest.spyOn(loggerModule, fn).mockImplementation(() => undefined)
  }
})

const ADOM_HEX =
  '0055736572436f6e66696700016c616e677561676500656e676c6973680001426574614b6579007075626c6963000808'
const INTERNAL_HEX =
  '00696e7465726e616c00016c616e677561676500656e676c697368000808'

const cstr = (s: string) =>
  Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])])

function encodeUserConfig(beta: string, withInt = false): string {
  const parts = [
    Buffer.from([0x00]),
    cstr('UserConfig'),
    Buffer.from([0x01]),
    cstr('language'),
    cstr('english')
  ]
  if (withInt) {
    parts.push(Buffer.from([0x02]), cstr('count'), Buffer.from([1, 0, 0, 0]))
  }
  parts.push(
    Buffer.from([0x01]),
    cstr('BetaKey'),
    cstr(beta),
    Buffer.from([0x08, 0x08])
  )
  return Buffer.concat(parts).toString('hex')
}

describe('decodeUserAppConfigBetaKey', () => {
  it('decodes the real ADOM blob', () => {
    expect(decodeUserAppConfigBetaKey(ADOM_HEX)).toBe('public')
  })
  it('returns undefined for the internal-only blob', () => {
    expect(decodeUserAppConfigBetaKey(INTERNAL_HEX)).toBeUndefined()
  })
  it('decodes an encoded release-101 blob, skipping an int32', () => {
    expect(decodeUserAppConfigBetaKey(encodeUserConfig('release-101'))).toBe(
      'release-101'
    )
    expect(
      decodeUserAppConfigBetaKey(encodeUserConfig('release-101', true))
    ).toBe('release-101')
  })
  it('never throws on garbage', () => {
    expect(decodeUserAppConfigBetaKey('')).toBeUndefined()
    expect(decodeUserAppConfigBetaKey('abc')).toBeUndefined()
    expect(decodeUserAppConfigBetaKey('zz')).toBeUndefined()
    expect(decodeUserAppConfigBetaKey(ADOM_HEX.slice(0, 40))).toBeUndefined()
    expect(decodeUserAppConfigBetaKey('0900')).toBeUndefined()
  })
})

describe('file readers and resolver', () => {
  let dir: string
  beforeEach(() => {
    dir = fs.mkdtempSync(join(os.tmpdir(), 'betabranch-'))
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const writeAcf = (userConfig: string, appId = '333300') =>
    fs.writeFileSync(
      join(dir, `appmanifest_${appId}.acf`),
      `"AppState"\n{\n\t"appid"\t\t"${appId}"\n\t"UserConfig"\n\t{\n${userConfig}\t}\n}\n`
    )

  const writeLocalConfig = (blobs: Record<string, string>) => {
    const root = join(dir, 'steam')
    const cfg = join(root, 'userdata', '35601368', 'config')
    fs.mkdirSync(cfg, { recursive: true })
    const entries = Object.entries(blobs)
      .map(([id, hex]) => `\t\t\t"${id}"\t\t"${hex}"\n`)
      .join('')
    fs.writeFileSync(
      join(cfg, 'localconfig.vdf'),
      `"UserLocalConfigStore"\n{\n\t"Software"\n\t{\n\t\t"Valve"\n\t\t{\n\t\t\t"333300"\n\t\t\t{\n\t\t\t\t"x"\t\t"1"\n\t\t\t}\n\t\t}\n\t}\n\t"UserAppConfig"\n\t{\n${entries.replace(/\t\t\t"/g, '\t\t"')}\t}\n}\n`
    )
    return root
  }

  it('readAcfBetaKey reads, and tolerates missing/empty/garbage', () => {
    writeAcf('\t\t"BetaKey"\t\t"release-101"\n')
    expect(readAcfBetaKey(dir, '333300')).toBe('release-101')
    writeAcf('\t\t"BetaKey"\t\t"public"\n')
    expect(readAcfBetaKey(dir, '333300')).toBe('public')
    writeAcf('')
    expect(readAcfBetaKey(dir, '333300')).toBeUndefined()
    expect(readAcfBetaKey(dir, '1')).toBeUndefined()
    fs.writeFileSync(join(dir, 'appmanifest_2.acf'), '{{{ not vdf')
    expect(readAcfBetaKey(dir, '2')).toBeUndefined()
  })

  it('readLocalConfigBetaKey finds the blob in UserAppConfig only', () => {
    const root = writeLocalConfig({ '333300': encodeUserConfig('release-101') })
    const p = join(root, 'userdata', '35601368', 'config', 'localconfig.vdf')
    expect(readLocalConfigBetaKey(p, '333300')).toBe('release-101')
    expect(readLocalConfigBetaKey(p, '999')).toBeUndefined()
    expect(
      readLocalConfigBetaKey(join(dir, 'nope.vdf'), '333300')
    ).toBeUndefined()
  })

  it('steamId64ToAccountId', () => {
    expect(steamId64ToAccountId('76561197995867096')).toBe('35601368')
    expect(steamId64ToAccountId('abc')).toBeUndefined()
    expect(steamId64ToAccountId('123')).toBeUndefined()
  })

  it('resolveUserBetaKey precedence and validity', () => {
    const root = writeLocalConfig({ '333300': encodeUserConfig('from-local') })
    const base = {
      appId: '333300',
      steamappsDir: dir,
      steamRoot: root,
      steamId64: '76561197995867096'
    }
    // ACF absent -> localconfig
    expect(resolveUserBetaKey(base)).toBe('from-local')
    // ACF wins
    writeAcf('\t\t"BetaKey"\t\t"release-101"\n')
    expect(resolveUserBetaKey(base)).toBe('release-101')
    // ACF public is authoritative
    writeAcf('\t\t"BetaKey"\t\t"public"\n')
    expect(resolveUserBetaKey(base)).toBe('public')
    // ACF without BetaKey falls through
    writeAcf('')
    expect(resolveUserBetaKey(base)).toBe('from-local')
    // neither
    expect(resolveUserBetaKey({ appId: '5', steamappsDir: dir })).toBe('public')
    // invalid keys
    for (const bad of ['bad"key', 'a b', 'x'.repeat(200)]) {
      writeAcf(`\t\t"BetaKey"\t\t"${bad.replace(/"/g, '\\"')}"\n`)
      expect(resolveUserBetaKey(base)).toBe('public')
    }
    const badRoot = writeLocalConfig({ '333300': encodeUserConfig('a b') })
    expect(
      resolveUserBetaKey({
        ...base,
        steamappsDir: join(dir, 'empty'),
        steamRoot: badRoot
      })
    ).toBe('public')
  })
})

describe('isValidBetaKey', () => {
  it('accepts and rejects', () => {
    expect(isValidBetaKey('release-101')).toBe(true)
    expect(isValidBetaKey('')).toBe(false)
    expect(isValidBetaKey(5)).toBe(false)
  })
})

describe('chooseInstallBranch', () => {
  const info = (branches: unknown) => ({ depots: { branches } })
  it('handles public, present, absent, password-protected', () => {
    expect(chooseInstallBranch(info({}), 'public', '1')).toBe('public')
    expect(
      chooseInstallBranch(info({ beta: { buildid: 2 } }), 'beta', '1')
    ).toBe('beta')
    expect(chooseInstallBranch(info({ public: {} }), 'beta', '1')).toBe(
      'public'
    )
    expect(
      chooseInstallBranch(info({ beta: { pwdrequired: '1' } }), 'beta', '1')
    ).toBe('public')
    expect(
      chooseInstallBranch(info({ beta: { pwdrequired: 1 } }), 'beta', '1')
    ).toBe('public')
    expect(chooseInstallBranch({}, 'beta', '1')).toBe('public')
  })
})

describe('selectDepots on a beta branch', () => {
  const owned = { apps: new Set<number>(), depots: new Set<number>([1, 2]) }
  const appinfo = {
    depots: {
      '1': { manifests: { public: '111', beta: '222' } },
      '2': { manifests: { public: '333' } }
    }
  }
  it('uses the branch manifest, falling back to public per depot', () => {
    const out = selectDepots(
      appinfo,
      owned,
      { os: 'windows', branch: 'beta' },
      '10'
    )
    expect(out.find((d) => d.id === '1')?.manifest).toBe('222')
    expect(out.find((d) => d.id === '2')?.manifest).toBe('333')
  })
  it('public ignores beta manifests', () => {
    const out = selectDepots(appinfo, owned, { os: 'windows' }, '10')
    expect(out.find((d) => d.id === '1')?.manifest).toBe('111')
  })
})
