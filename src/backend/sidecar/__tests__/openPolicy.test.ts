/**
 * Phase 72 D-06..D-08: sidecar open policy plus parity with the Rust shell.
 *
 * Parity reading: the sidecar reveals files and bundles gracefully where
 * Rust's open_path rejects them, so parity means "neither layer OPENS them".
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  OPEN_EXTERNAL_ALLOWED_EXACT_URLS,
  OPEN_EXTERNAL_ALLOWED_SCHEMES,
  OPEN_PATH_BUNDLE_EXTENSIONS,
  OpenPolicyError,
  assertOpenableExternalUrl,
  classifyFolderTarget,
  isLaunchableBundle
} from '../openPolicy'
import { readTauriShellFile } from '../../testUtils/tauriShellSource'
import { stripSourceComments } from '../../testUtils/stripSourceComments'

jest.mock('../../logger', () => ({
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

const fixture = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../../common/__fixtures__/openPolicyCases.json'),
    'utf8'
  )
) as {
  urlCases: { input: string; expect: 'allow' | 'reject' }[]
  folderShapeCases: { input: string; expect: 'reject' }[]
}

function rustStrList(source: string, constName: string): string[] {
  const m = new RegExp(
    `${constName}\\s*:\\s*&\\[&str\\]\\s*=\\s*&\\[([\\s\\S]*?)\\];`
  ).exec(source)
  if (!m) throw new Error(`const ${constName} not found`)
  return [...(m[1] ?? '').matchAll(/"([^"]*)"/g)].map((x) => x[1] as string)
}

describe('openPolicy', () => {
  let dir: string
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-open-policy-'))
  })
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it.each(fixture.urlCases)('url case $input -> $expect', (c) => {
    if (c.expect === 'allow') {
      expect(assertOpenableExternalUrl(c.input, 'openExternalUrl')).toBe(
        c.input
      )
    } else {
      expect(() =>
        assertOpenableExternalUrl(c.input, 'openExternalUrl')
      ).toThrow(OpenPolicyError)
    }
  })

  it('accepts the exact x-apple URL and rejects other x-apple panes', () => {
    for (const u of OPEN_EXTERNAL_ALLOWED_EXACT_URLS) {
      expect(assertOpenableExternalUrl(u, 'x')).toBe(u)
    }
    expect(() =>
      assertOpenableExternalUrl('x-apple.systempreferences:other', 'x')
    ).toThrow(OpenPolicyError)
  })

  it('isLaunchableBundle matches by extension, case-insensitively', () => {
    expect(isLaunchableBundle('/x/Game.app')).toBe(true)
    expect(isLaunchableBundle('/x/GAME.APP/')).toBe(true)
    expect(isLaunchableBundle('/x/game')).toBe(false)
    expect(isLaunchableBundle('/x/.app')).toBe(false)
  })

  it('rejects non-strings', () => {
    expect(() => assertOpenableExternalUrl(undefined, 'x')).toThrow(
      OpenPolicyError
    )
  })

  it.each(fixture.folderShapeCases)('folder shape case rejects', async (c) => {
    await expect(classifyFolderTarget(c.input, 'openFolder')).rejects.toThrow()
  })

  it('classifies directories, files, executables and bundles', async () => {
    const sub = path.join(dir, 'plain')
    fs.mkdirSync(sub)
    const file = path.join(dir, 'f.txt')
    fs.writeFileSync(file, 'x')
    const exe = path.join(dir, 'run.sh')
    fs.writeFileSync(exe, '#!/bin/sh\n', { mode: 0o755 })
    const app = path.join(dir, 'Game.app')
    fs.mkdirSync(app)
    const upper = path.join(dir, 'GAME2.APP')
    fs.mkdirSync(upper)

    expect(await classifyFolderTarget(sub, 'openFolder')).toBe('open')
    expect(await classifyFolderTarget(file, 'openFolder')).toBe('reveal')
    expect(await classifyFolderTarget(exe, 'openFolder')).toBe('reveal')
    expect(await classifyFolderTarget(app, 'openFolder')).toBe('reveal')
    expect(await classifyFolderTarget(upper, 'openFolder')).toBe('reveal')
    await expect(
      classifyFolderTarget(path.join(dir, 'missing'), 'openFolder')
    ).rejects.toThrow(OpenPolicyError)

    if (process.platform !== 'win32') {
      const link = path.join(dir, 'link-to-app')
      fs.symlinkSync(app, link)
      expect(await classifyFolderTarget(link, 'openFolder')).toBe('reveal')
    }
  })

  it('error messages never contain the input', async () => {
    const secret = '/definitely/missing/secret-token-xyz'
    const err = await classifyFolderTarget(secret, 'openFolder').catch(
      (e: Error) => e
    )
    expect((err as Error).message).not.toContain('secret-token-xyz')
    try {
      assertOpenableExternalUrl('zzz://secret-token-xyz', 'x')
    } catch (e) {
      expect((e as Error).message).not.toContain('secret-token-xyz')
    }
  })

  describe('parity with the Rust shell', () => {
    const relay = stripSourceComments(readTauriShellFile('relay_commands.rs'))
    const shellOpen = stripSourceComments(readTauriShellFile('shell_open.rs'))

    it('url constants match relay_commands.rs', () => {
      expect([...OPEN_EXTERNAL_ALLOWED_SCHEMES]).toEqual(
        rustStrList(relay, 'OPEN_EXTERNAL_ALLOWED_SCHEMES')
      )
      expect([...OPEN_EXTERNAL_ALLOWED_EXACT_URLS]).toEqual(
        rustStrList(relay, 'OPEN_EXTERNAL_ALLOWED_EXACT_URLS')
      )
    })

    it('bundle extensions match shell_open.rs', () => {
      expect([...OPEN_PATH_BUNDLE_EXTENSIONS]).toEqual(
        rustStrList(shellOpen, 'OPEN_PATH_BUNDLE_EXTENSIONS')
      )
    })

    it('ShellOpenPath arm delegates to the policy-checked function', () => {
      const embed = stripSourceComments(readTauriShellFile('rust_dispatch.rs'))
      expect(embed).toContain('shell_open::shell_open_path')
      expect(embed).toMatch(
        /^ {8}RustInvokeChannel::ShellOpenPath => shell_open::shell_open_path\(app, args\),$/m
      )
      const policyIdx = shellOpen.indexOf('open_path_policy_check(')
      const openIdx = shellOpen.indexOf('.open_path(')
      expect(policyIdx).toBeGreaterThan(-1)
      expect(openIdx).toBeGreaterThan(policyIdx)
    })

    it('never classifies as open anything the Rust shape check rejects', async () => {
      for (const c of fixture.folderShapeCases) {
        await expect(
          classifyFolderTarget(c.input, 'openFolder')
        ).rejects.toThrow()
      }
    })
  })
})
