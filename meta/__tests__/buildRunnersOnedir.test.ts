import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  ONEDIR_RUNNERS,
  archiveName,
  buildManifestObject,
  extractUpstreamPyinstallerCommand,
  formatSha256Sums,
  toOnedirCommand,
  type RunnerBuildResult
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

// F-34.16-D: the real legendary-0.21.0 .github/workflows/*.yml set, captured
// verbatim (34.16-07 Task 1). Read only, copied into a fresh tmpdir per test
// -- never mutated in place.
const REAL_LEGENDARY_WORKFLOWS_FIXTURE_DIR = join(
  __dirname,
  'fixtures',
  'upstream-workflows',
  'legendary-0.21.0'
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
      expect(RELEASE_TAGS.legendary).toBe('0.21.0')
      expect(RELEASE_TAGS.gogdl).toBe('v1.3.0')
      expect(RELEASE_TAGS.nile).toBe('v1.2.0')
    })

    it('points at the correct upstream repos', () => {
      expect(ONEDIR_RUNNERS.legendary.repo).toBe('legendary-gl/legendary')
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
      expect(result.command).toBe(
        'pyinstaller --onefile --name legendary cli.py'
      )
      expect(result.workingDirectory).toBeUndefined()
    })

    it("captures a step-level working-directory: sibling key (legendary's real shape)", () => {
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

    // -------------------------------------------------------------------
    // F-34.16-D gap closure (34.16-07 Task 1): twelve cases proving the
    // widening (Task 2) is necessary and that it does not weaken either
    // pre-existing refusal or the mention-rejection. Run against the
    // UN-widened extractor first and the RED transcript recorded in
    // 34.16-07-SUMMARY.md before Task 2 touches meta/buildRunnersOnedir.ts.
    // -------------------------------------------------------------------

    it('Shape A (bare console script, the control): first token "pyinstaller" extracts to the exact folded value', () => {
      fixtureDir = mkdtempSync(join(tmpdir(), 'onedir-fixture-shape-a-'))
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
          '      - run: pyinstaller',
          '          --onefile',
          '          --name legendary',
          '          cli.py'
        ].join('\n')
      )

      const result = extractUpstreamPyinstallerCommand(fixtureDir)
      expect(result.command).toBe(
        'pyinstaller --onefile --name legendary cli.py'
      )
      expect(result.workingDirectory).toBeUndefined()
    })

    it('Shape B ("uv run --module PyInstaller") extracts as a recognised invocation', () => {
      fixtureDir = mkdtempSync(join(tmpdir(), 'onedir-fixture-shape-b-'))
      const workflowsDir = join(fixtureDir, '.github', 'workflows')
      mkdirSync(workflowsDir, { recursive: true })
      writeFileSync(
        join(workflowsDir, 'build-base.yml'),
        [
          'name: build',
          'on: push',
          'jobs:',
          '  build:',
          '    steps:',
          '      - run: uv run --module PyInstaller',
          '          --onefile',
          '          --name legendary',
          '          cli.py'
        ].join('\n')
      )

      const result = extractUpstreamPyinstallerCommand(fixtureDir)
      expect(result.command).toBe(
        'uv run --module PyInstaller --onefile --name legendary cli.py'
      )
      expect(result.workingDirectory).toBeUndefined()
    })

    it('Shape B\' ("uv run -m PyInstaller", short module flag) extracts as a recognised invocation', () => {
      fixtureDir = mkdtempSync(join(tmpdir(), 'onedir-fixture-shape-bprime-'))
      const workflowsDir = join(fixtureDir, '.github', 'workflows')
      mkdirSync(workflowsDir, { recursive: true })
      writeFileSync(
        join(workflowsDir, 'build-base.yml'),
        [
          'name: build',
          'on: push',
          'jobs:',
          '  build:',
          '    steps:',
          '      - run: uv run -m PyInstaller --onefile --name legendary cli.py'
        ].join('\n')
      )

      const result = extractUpstreamPyinstallerCommand(fixtureDir)
      expect(result.command).toBe(
        'uv run -m PyInstaller --onefile --name legendary cli.py'
      )
      expect(result.workingDirectory).toBeUndefined()
    })

    it('Shape C ("python -m PyInstaller") extracts as a recognised invocation', () => {
      fixtureDir = mkdtempSync(join(tmpdir(), 'onedir-fixture-shape-c-'))
      const workflowsDir = join(fixtureDir, '.github', 'workflows')
      mkdirSync(workflowsDir, { recursive: true })
      writeFileSync(
        join(workflowsDir, 'build-base.yml'),
        [
          'name: build',
          'on: push',
          'jobs:',
          '  build:',
          '    steps:',
          '      - run: python -m PyInstaller --onefile --name legendary cli.py'
        ].join('\n')
      )

      const result = extractUpstreamPyinstallerCommand(fixtureDir)
      expect(result.command).toBe(
        'python -m PyInstaller --onefile --name legendary cli.py'
      )
      expect(result.workingDirectory).toBeUndefined()
    })

    it('Shape C\' ("python3 -m PyInstaller", versioned interpreter) extracts as a recognised invocation', () => {
      fixtureDir = mkdtempSync(join(tmpdir(), 'onedir-fixture-shape-cprime-'))
      const workflowsDir = join(fixtureDir, '.github', 'workflows')
      mkdirSync(workflowsDir, { recursive: true })
      writeFileSync(
        join(workflowsDir, 'build-base.yml'),
        [
          'name: build',
          'on: push',
          'jobs:',
          '  build:',
          '    steps:',
          '      - run: python3 -m PyInstaller --onefile --name legendary cli.py'
        ].join('\n')
      )

      const result = extractUpstreamPyinstallerCommand(fixtureDir)
      expect(result.command).toBe(
        'python3 -m PyInstaller --onefile --name legendary cli.py'
      )
      expect(result.workingDirectory).toBeUndefined()
    })

    it('Shape B with a working-directory: sibling still resolves the sibling for a module form', () => {
      fixtureDir = mkdtempSync(
        join(tmpdir(), 'onedir-fixture-shape-b-workdir-')
      )
      const workflowsDir = join(fixtureDir, '.github', 'workflows')
      mkdirSync(workflowsDir, { recursive: true })
      writeFileSync(
        join(workflowsDir, 'build-base.yml'),
        [
          'name: build',
          'on: push',
          'jobs:',
          '  build:',
          '    steps:',
          '      - name: Build',
          '        working-directory: legendary',
          '        run: uv run --module PyInstaller',
          '          --onefile',
          '          --name legendary',
          '          cli.py'
        ].join('\n')
      )

      const result = extractUpstreamPyinstallerCommand(fixtureDir)
      expect(result.command).toBe(
        'uv run --module PyInstaller --onefile --name legendary cli.py'
      )
      expect(result.workingDirectory).toBe('legendary')
    })

    it('the REAL captured legendary-0.21.0 fixture set extracts exactly one result -- the "uv run --module PyInstaller" Build step', () => {
      fixtureDir = mkdtempSync(join(tmpdir(), 'onedir-fixture-real-legendary-'))
      const workflowsDir = join(fixtureDir, '.github', 'workflows')
      mkdirSync(workflowsDir, { recursive: true })
      for (const file of readdirSync(REAL_LEGENDARY_WORKFLOWS_FIXTURE_DIR)) {
        copyFileSync(
          join(REAL_LEGENDARY_WORKFLOWS_FIXTURE_DIR, file),
          join(workflowsDir, file)
        )
      }

      // Read the expected values from the captured file itself rather than
      // transcribing them by hand -- the file IS the source of truth.
      const rawBuildBase = readFileSync(
        join(REAL_LEGENDARY_WORKFLOWS_FIXTURE_DIR, 'build-base.yml'),
        'utf-8'
      )
      expect(rawBuildBase).toContain('uv run --module PyInstaller')

      const result = extractUpstreamPyinstallerCommand(fixtureDir)
      expect(result.command).toContain('uv run --module PyInstaller')
      expect(result.command).toContain('--onefile')
      expect(result.command).toContain('cli.py')
      expect(result.workingDirectory).toBe('legendary')
    })

    it('module-name discrimination: "python -m zipapp" (wrong module) is not an invocation, throws the zero-match error', () => {
      fixtureDir = mkdtempSync(join(tmpdir(), 'onedir-fixture-wrong-module-'))
      const workflowsDir = join(fixtureDir, '.github', 'workflows')
      mkdirSync(workflowsDir, { recursive: true })
      writeFileSync(
        join(workflowsDir, 'build-base.yml'),
        [
          'name: build',
          'on: push',
          'jobs:',
          '  build:',
          '    steps:',
          '      - name: Build',
          '        run: python -m zipapp --output dist/x build'
        ].join('\n')
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

    it('launcher discrimination: "uv build" / "uv publish" ("uv" alone) is not a PyInstaller invocation, throws the zero-match error', () => {
      fixtureDir = mkdtempSync(join(tmpdir(), 'onedir-fixture-uv-alone-'))
      const workflowsDir = join(fixtureDir, '.github', 'workflows')
      mkdirSync(workflowsDir, { recursive: true })
      writeFileSync(
        join(workflowsDir, 'release.yml'),
        [
          'name: release',
          'on: push',
          'jobs:',
          '  release:',
          '    steps:',
          '      - run: uv build',
          '      - run: uv publish'
        ].join('\n')
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

    it('zero matches across all three recognised forms still throws naming the workflows dir (F-34.16-D regression)', () => {
      fixtureDir = mkdtempSync(join(tmpdir(), 'onedir-fixture-zero-match-'))
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

    it('two DISTINCT invocations -- one bare shape and one MODULE shape -- still throw naming both (multi-match refusal sees the new forms too)', () => {
      fixtureDir = mkdtempSync(
        join(tmpdir(), 'onedir-fixture-dupe-mixed-shapes-')
      )
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
          '      - run: uv run --module PyInstaller --onefile --name bar bar/cli.py'
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

    it('mentions of pyinstaller (name:, pip/uv-pip install args, an extras name containing the substring) are never extracted', () => {
      fixtureDir = mkdtempSync(join(tmpdir(), 'onedir-fixture-mentions-'))
      const workflowsDir = join(fixtureDir, '.github', 'workflows')
      mkdirSync(workflowsDir, { recursive: true })
      writeFileSync(
        join(workflowsDir, 'build-base.yml'),
        [
          'name: build',
          'on: push',
          'jobs:',
          '  build:',
          '    steps:',
          '      - run: pip3 install --upgrade setuptools pyinstaller',
          '      - run: uv pip install pyinstaller',
          '      - run: uv sync --extra pyinstaller_build --no-install-local',
          '      - name: install pyinstaller build tools',
          '        run: echo hi'
        ].join('\n')
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
  })

  describe('regression: downloadHelperBinaries.ts vendoring unchanged by the extraction', () => {
    // legendary_macOS_*/gogdl_macOS_*/nile_macOS_* literals were REMOVED by
    // Phase 34.9 Plan 06 (darwin now sources from the GameLib rolling
    // release via downloadOnedirAsset(), not these upstream flat-file
    // names) -- see meta/__tests__/downloadHelperBinaries.test.ts's own
    // regression coverage for the darwin-onedir-sourcing behaviour this
    // test file predates. win32/linux and comet/epic-integration are
    // untouched by that plan and stay pinned here.
    //
    // legendary's win32/linux literals moved `_x86_64` -> `_x64` with the
    // legendary 0.21.0 bump (the repo also moved to legendary-gl/legendary).
    // gogdl 1.3.0 and nile 1.2.0 kept their `_x86_64` asset names -- verified
    // against the live release assets, not assumed from legendary's rename.
    it.each([
      'legendary_linux_x64',
      'legendary_windows_x64.exe',
      'gogdl_linux_x86_64',
      'gogdl_windows_x86_64.exe',
      'nile_linux_x86_64',
      'nile_windows_x86_64.exe',
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

  // Plan 34.16-03: these tests pin the exact SHA256SUMS-{arch} line format and
  // the exact BUILD-MANIFEST-{arch}.json top-level key set. Both are the
  // contract meta/pinRunnerDigests.ts (plan 05) is written against -- a
  // change to either shape here is a change to what that parser must handle.
  describe('published audit artifact formats (the pin:runner-digests contract)', () => {
    const FIXTURE_RESULTS: RunnerBuildResult[] = [
      {
        runner: 'legendary',
        repo: 'legendary-gl/legendary',
        tag: RELEASE_TAGS.legendary,
        upstreamLine: 'pyinstaller --onedir --name legendary legendary/cli.py',
        upstreamWorkingDirectory: undefined,
        onedirCommand: 'pyinstaller --onedir --name legendary legendary/cli.py',
        droppedExpressions: [],
        python3Version: 'Python 3.11.0',
        pyinstallerVersion: '6.3.0',
        archiveSha256:
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        archivePath:
          '.build-tools/runners-onedir/out/legendary_macOS_x86_64_onedir.tar.gz',
        fileCount: 120,
        machoCount: 3
      },
      {
        runner: 'gogdl',
        repo: 'Heroic-Games-Launcher/heroic-gogdl',
        tag: RELEASE_TAGS.gogdl,
        upstreamLine: 'pyinstaller --onedir --name gogdl gogdl/cli.py',
        upstreamWorkingDirectory: 'gogdl',
        onedirCommand: 'pyinstaller --onedir --name gogdl gogdl/cli.py',
        droppedExpressions: ['--onefile'],
        python3Version: 'Python 3.11.0',
        pyinstallerVersion: '6.3.0',
        archiveSha256:
          'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        archivePath:
          '.build-tools/runners-onedir/out/gogdl_macOS_x86_64_onedir.tar.gz',
        fileCount: 95,
        machoCount: 2
      },
      {
        runner: 'nile',
        repo: 'imLinguin/nile',
        tag: RELEASE_TAGS.nile,
        upstreamLine: 'pyinstaller --onedir --name nile nile/cli.py',
        upstreamWorkingDirectory: undefined,
        onedirCommand: 'pyinstaller --onedir --name nile nile/cli.py',
        droppedExpressions: [],
        python3Version: 'Python 3.11.0',
        pyinstallerVersion: '6.3.0',
        archiveSha256:
          'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        archivePath:
          '.build-tools/runners-onedir/out/nile_macOS_x86_64_onedir.tar.gz',
        fileCount: 80,
        machoCount: 1
      }
    ]

    const ORIGINAL_GITHUB_RUN_ID = process.env.GITHUB_RUN_ID

    afterEach(() => {
      if (ORIGINAL_GITHUB_RUN_ID === undefined) {
        delete process.env.GITHUB_RUN_ID
      } else {
        process.env.GITHUB_RUN_ID = ORIGINAL_GITHUB_RUN_ID
      }
    })

    describe('formatSha256Sums', () => {
      it('returns one line per result, each "<64 lowercase hex>  <archiveName>"', () => {
        const output = formatSha256Sums('x64', FIXTURE_RESULTS)
        const lines = output.split('\n').filter((line) => line.length > 0)
        expect(lines).toHaveLength(3)
        lines.forEach((line, index) => {
          expect(line).toMatch(/^[0-9a-f]{64} {2}\S+$/)
          const result = FIXTURE_RESULTS[index]
          expect(line).toBe(
            `${result.archiveSha256}  ${archiveName(result.runner, 'x64')}`
          )
        })
      })

      it('ends with exactly one trailing newline and no blank interior line', () => {
        const output = formatSha256Sums('x64', FIXTURE_RESULTS)
        expect(output.endsWith('\n')).toBe(true)
        expect(output.endsWith('\n\n')).toBe(false)
        const withoutTrailingNewline = output.slice(0, -1)
        expect(withoutTrailingNewline.split('\n')).toHaveLength(3)
        expect(withoutTrailingNewline).not.toContain('\n\n')
      })

      it('vacuity guard: a different archiveSha256 produces different output', () => {
        const mutated = FIXTURE_RESULTS.map((r, index) =>
          index === 0
            ? { ...r, archiveSha256: FIXTURE_RESULTS[1].archiveSha256 }
            : r
        )
        const original = formatSha256Sums('x64', FIXTURE_RESULTS)
        const withDuplicateDigest = formatSha256Sums('x64', mutated)
        expect(withDuplicateDigest).not.toBe(original)
      })
    })

    describe('buildManifestObject', () => {
      it('has exactly the three runner keys plus runId at the top level, with every per-runner field preserved (undefined workingDirectory collapsed to null)', () => {
        const manifest = buildManifestObject('arm64', FIXTURE_RESULTS)
        expect(Object.keys(manifest).sort()).toEqual(
          ['gogdl', 'legendary', 'nile', 'runId'].sort()
        )
        expect(manifest.legendary).toEqual({
          repo: FIXTURE_RESULTS[0].repo,
          tag: FIXTURE_RESULTS[0].tag,
          upstreamPyinstallerLine: FIXTURE_RESULTS[0].upstreamLine,
          upstreamWorkingDirectory: null,
          onedirCommand: FIXTURE_RESULTS[0].onedirCommand,
          droppedExpressions: FIXTURE_RESULTS[0].droppedExpressions,
          python3Version: FIXTURE_RESULTS[0].python3Version,
          pyinstallerVersion: FIXTURE_RESULTS[0].pyinstallerVersion,
          archiveSha256: FIXTURE_RESULTS[0].archiveSha256,
          fileCount: FIXTURE_RESULTS[0].fileCount,
          machoCount: FIXTURE_RESULTS[0].machoCount
        })
        expect(
          (manifest.gogdl as { upstreamWorkingDirectory: unknown })
            .upstreamWorkingDirectory
        ).toBe('gogdl')
      })

      it('sets runId to the GITHUB_RUN_ID value when set, and explicit null (never absent) when unset', () => {
        process.env.GITHUB_RUN_ID = '123456789'
        const withRunId = buildManifestObject('x64', FIXTURE_RESULTS)
        expect(withRunId.runId).toBe('123456789')

        delete process.env.GITHUB_RUN_ID
        const withoutRunId = buildManifestObject('x64', FIXTURE_RESULTS)
        expect(withoutRunId.runId).toBeNull()
        expect('runId' in withoutRunId).toBe(true)
      })
    })
  })
})
