/**
 * Quick 261120-uzn: GOG setup's elevated steps run under ONE UAC prompt on Windows.
 *
 * Windows only: every describe is skipped elsewhere, so the ubuntu CI never runs this file.
 * Real temp files, an injected recording spawnAsync; no module is mocked and nothing is spawned.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { initHeadless } from 'backend/logger'
import { createTestAppPaths } from 'backend/testUtils/testAppPaths'
import setup, { type SetupDeps } from '../setup'
import { deriveGogPaths } from '../constants'

const winDescribe = process.platform === 'win32' ? describe : describe.skip

const ID = '1207658930'

interface SpawnCall {
  command: string
  args: string[]
}

winDescribe('261120-uzn GOG setup batches its elevated steps', () => {
  const root = mkdtempSync(join(tmpdir(), 'gamelib-gog-setup-elev-'))
  const paths = createTestAppPaths(root)
  const { gogdlConfigPath, gogRedistPath } = deriveGogPaths(paths)
  // The install folder name holds a space.
  const installPath = join(root, 'games', 'Some Game')

  beforeAll(() => {
    initHeadless()
    mkdirSync(installPath, { recursive: true })
    mkdirSync(join(gogdlConfigPath, 'manifests'), { recursive: true })
    mkdirSync(join(gogRedistPath, '__redist', 'ISI'), { recursive: true })
    writeFileSync(
      join(gogdlConfigPath, 'manifests', ID),
      JSON.stringify({
        version: 2,
        scriptInterpreter: true,
        dependencies: ['MSVC2017', 'MSVC2017_x64'],
        products: [{ productId: ID }]
      })
    )
    writeFileSync(
      join(gogRedistPath, '__redist', 'ISI', 'scriptinterpreter.exe'),
      'x'
    )
    writeFileSync(
      join(gogRedistPath, '.gogdl-redist-manifest'),
      JSON.stringify({
        depots: ['MSVC2017', 'MSVC2017_x64'].map((dependencyId) => ({
          dependencyId,
          readableName: dependencyId,
          executable: { path: `${dependencyId}\\setup.exe`, arguments: '/q' }
        }))
      })
    )
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  function build(): { deps: SetupDeps; calls: SpawnCall[] } {
    const calls: SpawnCall[] = []
    const info = {
      app_name: ID,
      title: 'Some Game',
      is_installed: true,
      install: {
        platform: 'windows',
        install_path: installPath,
        language: 'en-US',
        buildId: '42',
        version: '1.0',
        installedDLCs: []
      }
    }
    const deps = {
      paths,
      libraryManagers: { gog: { getGameInfo: () => info } },
      gameConfigs: { get: () => ({ config: {} }) },
      sendFrontendMessage: () => undefined,
      appRuntime: { events: { emit: () => undefined } },
      spawnAsync: (command: string, args: string[]) => {
        calls.push({ command, args })
        return Promise.resolve({ code: 0, stdout: '', stderr: '' })
      }
    } as unknown as SetupDeps
    return { deps, calls }
  }

  function decode(statement: string): string[] {
    const encoded = /'-EncodedCommand','([A-Za-z0-9+/=]+)'/.exec(statement)?.[1]
    return Buffer.from(encoded as string, 'base64')
      .toString('utf16le')
      .split('\n')
  }

  it('runs the interpreter and both redists under one elevated spawn', async () => {
    const { deps, calls } = build()

    await setup(deps, ID)

    expect(calls).toHaveLength(1)
    expect(calls[0]?.command).toBe('powershell')
    const statement = calls[0]?.args[3] as string
    expect(statement.match(/-Verb RunAs/g)).toHaveLength(1)
    expect(statement).toContain('-EncodedCommand')
    const lines = decode(statement)
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('scriptinterpreter.exe')
    expect(lines[0]).toContain(`/ProductId=${ID}`)
    expect(lines[0]).toContain(
      `-WorkingDirectory '${installPath.replaceAll("'", "''")}'`
    )
    expect(lines[1]).toContain('MSVC2017\\setup.exe')
    expect(lines[2]).toContain('MSVC2017_x64\\setup.exe')
    for (const line of lines.slice(1)) {
      expect(line).toContain(`-WorkingDirectory '${gogRedistPath}'`)
    }
  })

  it('queues only the interpreter step when redists are skipped, and elevates it directly', async () => {
    const { deps, calls } = build()

    await setup(deps, ID, undefined, false)

    expect(calls).toHaveLength(1)
    const args = calls[0]?.args as string[]
    expect(args.join(' ')).not.toContain('-EncodedCommand')
    expect(args[0]).toBe('-NoProfile')
    expect(args[3]).toContain('scriptinterpreter.exe')
    expect(args[3]).toContain('-Verb RunAs')
  })
})
