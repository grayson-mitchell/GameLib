import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  ONEDIR_RUNNERS,
  archiveName,
  extractUpstreamPyinstallerCommand,
  toOnedirCommand
} from '../buildRunnersOnedir'
import { RELEASE_TAGS } from '../releaseTags'

// Structural source assertion -- proves the extraction refactor (Task 1)
// changed no vendoring behaviour: every pre-existing win32/linux/darwin asset
// filename string for legendary/gogdl/nile/comet/epic-integration must still
// be present, byte-identical, in meta/downloadHelperBinaries.ts.
const DOWNLOAD_HELPER_BINARIES_SOURCE = readFileSync(
  join(__dirname, '..', 'downloadHelperBinaries.ts'),
  'utf-8'
)

describe('buildRunnersOnedir', () => {
  describe('ONEDIR_RUNNERS (comet/epic-integration structurally unreachable)', () => {
    it('is exactly legendary/gogdl/nile -- comet and epic-integration are absent', () => {
      expect(Object.keys(ONEDIR_RUNNERS).sort()).toEqual(
        ['gogdl', 'legendary', 'nile'].sort()
      )
    })

    it('reads its tags from RELEASE_TAGS (version-drift guard, constraint 7)', () => {
      expect(ONEDIR_RUNNERS.legendary.tag).toBe(RELEASE_TAGS.legendary)
      expect(ONEDIR_RUNNERS.gogdl.tag).toBe(RELEASE_TAGS.gogdl)
      expect(ONEDIR_RUNNERS.nile.tag).toBe(RELEASE_TAGS.nile)

      // The no-drift guard, asserted against meta/releaseTags.ts's own
      // literal values rather than restated here.
      expect(RELEASE_TAGS.legendary).toBe('0.20.43')
      expect(RELEASE_TAGS.gogdl).toBe('v1.2.1')
      expect(RELEASE_TAGS.nile).toBe('v1.1.2')
    })

    it('points at the correct upstream repos', () => {
      expect(ONEDIR_RUNNERS.legendary.repo).toBe(
        'Heroic-Games-Launcher/legendary'
      )
      expect(ONEDIR_RUNNERS.gogdl.repo).toBe(
        'Heroic-Games-Launcher/heroic-gogdl'
      )
      expect(ONEDIR_RUNNERS.nile.repo).toBe('imLinguin/nile')
    })
  })

  describe('archiveName', () => {
    it('matches the existing upstream _macOS_arm64 naming', () => {
      expect(archiveName('nile', 'arm64')).toBe(
        'nile_macOS_arm64_onedir.tar.gz'
      )
    })

    it('matches the existing upstream _macOS_x86_64 naming for x64', () => {
      expect(archiveName('nile', 'x64')).toBe('nile_macOS_x86_64_onedir.tar.gz')
    })

    it('throws for any arch other than x64 or arm64', () => {
      expect(() => archiveName('nile', 'armv7')).toThrow()
    })
  })

  describe('toOnedirCommand (flag-swap guard, mutation-proven)', () => {
    it('swaps --onefile for --onedir and drops the GitHub expression, recording it', () => {
      const result = toOnedirCommand(
        'pyinstaller --onefile --name nile ${{ steps.strip.outputs.option }} nile/cli.py'
      )
      expect(result.command).toContain('--onedir')
      expect(result.command).not.toContain('--onefile')
      expect(result.command).not.toContain('${{')
      expect(result.droppedExpressions).toEqual([
        '${{ steps.strip.outputs.option }}'
      ])
    })

    it('throws naming --onefile when the upstream line lacks it', () => {
      expect(() =>
        toOnedirCommand('pyinstaller --name nile nile/cli.py')
      ).toThrow(/--onefile/)
    })

    it('throws when --onefile appears more than once (ambiguous)', () => {
      expect(() =>
        toOnedirCommand('pyinstaller --onefile --onefile x.py')
      ).toThrow()
    })
  })

  describe('extractUpstreamPyinstallerCommand (never guesses)', () => {
    let fixtureDir: string

    afterEach(() => {
      if (fixtureDir) {
        rmSync(fixtureDir, { recursive: true, force: true })
      }
    })

    it('throws naming the dir when no workflow contains pyinstaller', () => {
      fixtureDir = mkdtempSync(join(tmpdir(), 'onedir-fixture-empty-'))
      const workflowsDir = join(fixtureDir, '.github', 'workflows')
      mkdirSync(workflowsDir, { recursive: true })
      writeFileSync(
        join(workflowsDir, 'build.yml'),
        'name: build\non: push\njobs:\n  build:\n    steps:\n      - run: echo hi\n'
      )

      let thrown: Error | undefined
      try {
        extractUpstreamPyinstallerCommand(fixtureDir)
      } catch (error) {
        thrown = error as Error
      }
      expect(thrown).toBeDefined()
      expect(thrown?.message).toContain(workflowsDir)
    })

    it('does not throw when two workflow files declare the byte-identical pyinstaller command (legendary python.yml/release.yml shape)', () => {
      fixtureDir = mkdtempSync(join(tmpdir(), 'onedir-fixture-dupe-identical-'))
      const workflowsDir = join(fixtureDir, '.github', 'workflows')
      mkdirSync(workflowsDir, { recursive: true })
      const identicalRun =
        '      - name: Build\n' +
        '        run: pyinstaller\n' +
        '          --onefile\n' +
        '          --name legendary\n' +
        '          cli.py\n'
      writeFileSync(
        join(workflowsDir, 'python.yml'),
        `name: python\non: push\njobs:\n  build:\n    steps:\n${identicalRun}`
      )
      writeFileSync(
        join(workflowsDir, 'release.yml'),
        `name: release\non: push\njobs:\n  build:\n    steps:\n${identicalRun}`
      )

      const result = extractUpstreamPyinstallerCommand(fixtureDir)
      expect(result.command).toBe('pyinstaller --onefile --name legendary cli.py')
      expect(result.workingDirectory).toBeUndefined()
    })

    it('captures a step-level working-directory: sibling key (legendary\'s real shape)', () => {
      fixtureDir = mkdtempSync(join(tmpdir(), 'onedir-fixture-workdir-'))
      const workflowsDir = join(fixtureDir, '.github', 'workflows')
      mkdirSync(workflowsDir, { recursive: true })
      writeFileSync(
        join(workflowsDir, 'release.yml'),
        [
          'name: release',
          'on: push',
          'jobs:',
          '  build:',
          '    steps:',
          '      - name: Build',
          '        working-directory: legendary',
          '        run: pyinstaller',
          '          --onefile',
          '          --name legendary',
          '          -i ../assets/windows_icon.ico',
          '          cli.py'
        ].join('\n')
      )

      const result = extractUpstreamPyinstallerCommand(fixtureDir)
      expect(result.command).toBe(
        'pyinstaller --onefile --name legendary -i ../assets/windows_icon.ico cli.py'
      )
      expect(result.workingDirectory).toBe('legendary')
    })

    it('throws naming both matches when two pyinstaller lines exist', () => {
      fixtureDir = mkdtempSync(join(tmpdir(), 'onedir-fixture-dupe-'))
      const workflowsDir = join(fixtureDir, '.github', 'workflows')
      mkdirSync(workflowsDir, { recursive: true })
      writeFileSync(
        join(workflowsDir, 'build.yml'),
        [
          'name: build',
          'on: push',
          'jobs:',
          '  build:',
          '    steps:',
          '      - run: pyinstaller --onefile --name foo foo/cli.py',
          '  build-other:',
          '    steps:',
          '      - run: pyinstaller --onefile --name bar bar/cli.py'
        ].join('\n')
      )

      let thrown: Error | undefined
      try {
        extractUpstreamPyinstallerCommand(fixtureDir)
      } catch (error) {
        thrown = error as Error
      }
      expect(thrown).toBeDefined()
      expect(thrown?.message).toContain('foo/cli.py')
      expect(thrown?.message).toContain('bar/cli.py')
    })
  })

  describe('regression: downloadHelperBinaries.ts vendoring unchanged by the extraction', () => {
    it.each([
      'legendary_linux_x86_64',
      'legendary_windows_x86_64.exe',
      'legendary_macOS_arm64',
      'gogdl_linux_x86_64',
      'gogdl_windows_x86_64.exe',
      'gogdl_macOS_arm64',
      'nile_linux_x86_64',
      'nile_windows_x86_64.exe',
      'nile_macOS_arm64',
      'comet-x86_64-unknown-linux-gnu',
      'comet-aarch64-apple-darwin',
      'comet-x86_64-pc-windows-msvc.exe',
      'EpicGamesLauncher.exe'
    ])('still contains the literal %s', (literal) => {
      expect(DOWNLOAD_HELPER_BINARIES_SOURCE).toContain(literal)
    })

    it('still imports RELEASE_TAGS from the new shared module', () => {
      expect(DOWNLOAD_HELPER_BINARIES_SOURCE).toMatch(/from '\.\/releaseTags'/)
    })
  })
})
