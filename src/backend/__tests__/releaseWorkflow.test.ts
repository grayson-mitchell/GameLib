/**
 * Phase 34 Plan 01 (Wave-0 config-shape scaffold): asserts the TARGET shape
 * of .github/workflows/release-tauri.yml (D-05, D-09). RED today -- the
 * workflow file does not exist yet (the readFileSync throw below is the
 * expected RED signal), turned GREEN by Plan 34-06.
 *
 * Raw-text assertions (no YAML-parser dependency required per the plan),
 * modeled on the read-file-then-assert-shape style of
 * src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts.
 *
 * T-34-02 (Tampering / release draft+prerelease flags): the releaseDraft
 * and prerelease assertions below are the mitigation -- a regression here
 * would silently remove the D-09 human-review gate before publish.
 */
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const RELEASE_WORKFLOW_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '.github',
  'workflows',
  'release-tauri.yml'
)

function loadReleaseWorkflow(): string {
  return readFileSync(RELEASE_WORKFLOW_PATH, 'utf-8')
}

/**
 * Extracts a step's literal `run: |` block body, dedented, so a test can
 * EXECUTE the workflow's real shell instructions instead of pattern-matching
 * their text. Fails loudly if the named step (or its run block) is missing,
 * rather than silently returning an empty script that would vacuously pass.
 */
function extractRunBlock(stepName: string): string {
  const lines = loadReleaseWorkflow().split('\n')
  const stepIndex = lines.findIndex((line) => line.trim() === `- name: ${stepName}`)
  expect(stepIndex).toBeGreaterThanOrEqual(0)

  const runIndex = lines.findIndex(
    (line, index) => index > stepIndex && line.trim() === 'run: |'
  )
  expect(runIndex).toBeGreaterThan(stepIndex)

  const runIndent = lines[runIndex].length - lines[runIndex].trimStart().length
  const body: string[] = []
  for (let index = runIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') {
      body.push('')
      continue
    }
    const indent = line.length - line.trimStart().length
    if (indent <= runIndent) {
      break
    }
    body.push(line.slice(runIndent + 2))
  }
  expect(body.join('').trim().length).toBeGreaterThan(0)
  return body.join('\n')
}

/**
 * Runs an extracted run block exactly the way GitHub's `shell: bash` does
 * (`bash --noprofile --norc -eo pipefail {0}`), in a throwaway working
 * directory, so a failing guard inside the script surfaces as a non-zero
 * status here too.
 */
function runStepScript(
  script: string,
  cwd: string,
  env: Record<string, string> = {}
): { status: number | null; stderr: string } {
  const scriptPath = join(cwd, 'step.sh')
  writeFileSync(scriptPath, script)
  const result = spawnSync(
    'bash',
    ['--noprofile', '--norc', '-eo', 'pipefail', scriptPath],
    { cwd, env: { ...process.env, ...env }, encoding: 'utf-8' }
  )
  return { status: result.status, stderr: result.stderr }
}

/** Creates a file (and any missing parent directories) under `root`. */
function touch(root: string, relativePath: string, contents = 'x'): void {
  const target = join(root, relativePath)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, contents)
}

describe('release-tauri.yml trigger shape (D-05, D-09)', () => {
  test('triggers on the v* tag pattern', () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain("'v*'")
  })

  test('also has a workflow_dispatch manual trigger', () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain('workflow_dispatch')
  })
})

describe('release-tauri.yml matrix runners (D-05 -- windows-latest + ubuntu + macos-latest)', () => {
  test('includes windows-latest', () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain('windows-latest')
  })

  test('includes an ubuntu runner (24.04 or latest)', () => {
    const source = loadReleaseWorkflow()
    expect(source).toMatch(/ubuntu-(24\.04|latest)/)
  })

  test('includes macos-latest', () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain('macos-latest')
  })
})

describe('release-tauri.yml build tooling', () => {
  test('uses tauri-apps/tauri-action', () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain('tauri-apps/tauri-action')
  })

  test('uses the existing ./.github/actions/install-deps composite action', () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain('./.github/actions/install-deps')
  })
})

describe('release-tauri.yml draft/prerelease flags (D-09 regression guard)', () => {
  test('sets releaseDraft: true', () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain('releaseDraft: true')
  })

  test('sets prerelease: true', () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain('prerelease: true')
  })
})

describe('release-tauri.yml Windows signing graceful-skip conditional (D-04, Pitfall 4)', () => {
  test('gates Windows cert import behind env.WINDOWS_CERTIFICATE != \'\'', () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain("env.WINDOWS_CERTIFICATE != ''")
  })
})

describe('release-tauri.yml per-OS "Signing skipped" clear-warning steps (D-04 regression guard)', () => {
  test('emits ::warning::Signing skipped when APPLE_CERTIFICATE is empty', () => {
    const source = loadReleaseWorkflow()
    expect(source).toMatch(/env\.APPLE_CERTIFICATE == ''[\s\S]*?::warning::Signing skipped/)
  })

  test('emits ::warning::Signing skipped when WINDOWS_CERTIFICATE is empty', () => {
    const source = loadReleaseWorkflow()
    expect(source).toMatch(/env\.WINDOWS_CERTIFICATE == ''[\s\S]*?::warning::Signing skipped/)
  })
})

describe('release-tauri.yml never regresses to Heroic', () => {
  test('does NOT contain the string Heroic', () => {
    const source = loadReleaseWorkflow()
    expect(source).not.toContain('Heroic')
  })
})

describe('release-tauri.yml per-leg sidecar target triple (CR-01 regression guard)', () => {
  test('wires GAMELIB_SIDECAR_TARGET_TRIPLE from matrix.sidecar_triple', () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain('GAMELIB_SIDECAR_TARGET_TRIPLE: ${{ matrix.sidecar_triple }}')
  })

  test('declares all four target triples across the matrix legs', () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain("sidecar_triple: 'aarch64-apple-darwin'")
    expect(source).toContain("sidecar_triple: 'x86_64-apple-darwin'")
    expect(source).toContain("sidecar_triple: 'x86_64-unknown-linux-gnu'")
    expect(source).toContain("sidecar_triple: 'x86_64-pc-windows-msvc'")
  })

  test('declares exactly four sidecar_triple matrix entries', () => {
    const source = loadReleaseWorkflow()
    const matches = source.match(/sidecar_triple: '/g) ?? []
    expect(matches).toHaveLength(4)
  })

  test('the SEA build step carries the GAMELIB_SIDECAR_TARGET_TRIPLE env wiring', () => {
    const source = loadReleaseWorkflow()
    expect(source).toMatch(
      /Build self-contained sidecar \(Node SEA\)[\s\S]*?GAMELIB_SIDECAR_TARGET_TRIPLE/
    )
  })
})

describe('release-tauri.yml Windows cert material cleanup (WR-02 regression guard)', () => {
  test('removes cert.pfx with -Force after import', () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain('Remove-Item -Path cert.pfx -Force')
  })

  test('the removal always follows the Import-PfxCertificate call', () => {
    const source = loadReleaseWorkflow()
    expect(source).toMatch(/Import-PfxCertificate[\s\S]*?Remove-Item -Path cert\.pfx -Force/)
  })

  test('the removal sits in a finally block', () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain('finally {')
  })

  test('no longer contains the inaccurate "ONLY in-memory" claim', () => {
    const source = loadReleaseWorkflow()
    expect(source).not.toContain('ONLY in-memory')
  })

  test('has no upload-artifact or cache step that could exfiltrate the workspace (and its cert.pfx)', () => {
    const source = loadReleaseWorkflow()
    expect(source).not.toContain('actions/upload-artifact')
    expect(source).not.toContain('actions/cache')
  })
})

// 34-VERIFICATION.md failed truth #5 / 34-REVIEW.md CR-01: release-tauri.yml never runs
// `electron-vite build`, yet tauri.conf.json has `beforeBuildCommand: ""` and
// `frontendDist: "../build"` -- a directory only that command populates. These assertions
// MUST fail against the pre-fix workflow (RED); GAP-1's fix (34-12 Task 2) makes them pass.
describe('release-tauri.yml renderer + asset build steps (CR-01 / GAP-1 regression guard)', () => {
  test('builds the renderer via electron-vite before bundling', () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain('run: pnpm exec electron-vite build')
  })

  test('the renderer build step precedes tauri-action', () => {
    const source = loadReleaseWorkflow()
    expect(source).toMatch(/run: pnpm exec electron-vite build[\s\S]*?uses: tauri-apps\/tauri-action/)
  })

  test('builds the macOS Steam bridge shims, gated to macOS legs', () => {
    const source = loadReleaseWorkflow()
    expect(source).toMatch(
      /if: startsWith\(matrix\.platform, 'macos'\)[\s\S]*?run: pnpm build-steam-bridge/
    )
  })

  test('the steam-bridge build step precedes the renderer build', () => {
    const source = loadReleaseWorkflow()
    expect(source).toMatch(/run: pnpm build-steam-bridge[\s\S]*?run: pnpm exec electron-vite build/)
  })

  test('fetches the bundled CrossOver index snapshot', () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain(
      'gh release download crossover-index --pattern crossover-index.json.gz --dir public --clobber'
    )
  })

  test('the crossover index fetch precedes the renderer build', () => {
    const source = loadReleaseWorkflow()
    expect(source).toMatch(
      /gh release download crossover-index[\s\S]*?run: pnpm exec electron-vite build/
    )
  })

  test('the crossover index fetch tolerates a missing published index', () => {
    const source = loadReleaseWorkflow()
    expect(source).toMatch(/gh release download crossover-index[^\n]*\n?[^\n]*\|\|\s*echo/)
  })

  test('the header states the pipeline is unproven live, not verified fact', () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain('UNPROVEN LIVE')
  })

  test('invariant guard: the SEA sidecar build step still precedes tauri-action', () => {
    const source = loadReleaseWorkflow()
    expect(source).toMatch(/run: pnpm build:sidecar-sea[\s\S]*?uses: tauri-apps\/tauri-action/)
  })
})

// 34-REVIEW.md (gap cycle 2) CR-01: GAP-1's new `pnpm build-steam-bridge` step was
// host-arch-driven -- meta/buildSteamBridgeShims.ts emitted to
// public/bin/${process.arch}/darwin/, and both macos-latest legs are Apple Silicon, so
// the `--target x86_64-apple-darwin` bundle shipped bin/arm64/... while its own x64
// sidecar resolves bin/x64/... at runtime. Rather than asserting the raw expression
// string, these tests EVALUATE the workflow's GitHub-expression ternary for each macOS
// matrix leg and assert the arch it actually yields.
describe('release-tauri.yml steam-bridge target arch (CR-01 regression guard)', () => {
  /** The `${{ ... }}` expression the bridge step assigns to GAMELIB_BRIDGE_TARGET_ARCH. */
  function bridgeArchExpression(): string {
    const source = loadReleaseWorkflow()
    const line = source
      .split('\n')
      .find((l) => l.includes('GAMELIB_BRIDGE_TARGET_ARCH:'))
    expect(line).toBeDefined()
    return (line as string).split('GAMELIB_BRIDGE_TARGET_ARCH:')[1].trim()
  }

  /**
   * Evaluates the GitHub Actions `<lhs> == '<literal>' && '<a>' || '<b>'`
   * ternary idiom for a concrete matrix.sidecar_triple value. Deliberately
   * strict: an expression shape this cannot parse fails the test rather than
   * silently returning a default.
   */
  function evaluateBridgeArch(expression: string, sidecarTriple: string): string {
    const match = expression.match(
      /^\$\{\{\s*matrix\.sidecar_triple\s*==\s*'([^']+)'\s*&&\s*'([^']+)'\s*\|\|\s*'([^']+)'\s*\}\}$/
    )
    expect(match).not.toBeNull()
    const [, comparedTriple, whenTrue, whenFalse] = match as RegExpMatchArray
    return sidecarTriple === comparedTriple ? whenTrue : whenFalse
  }

  test('the x86_64-apple-darwin leg builds an x64-pathed bridge, not arm64', () => {
    const expression = bridgeArchExpression()
    expect(evaluateBridgeArch(expression, 'x86_64-apple-darwin')).toBe('x64')
  })

  test('the aarch64-apple-darwin leg still builds an arm64-pathed bridge', () => {
    const expression = bridgeArchExpression()
    expect(evaluateBridgeArch(expression, 'aarch64-apple-darwin')).toBe('arm64')
  })

  test('the two macOS legs never resolve to the same arch', () => {
    const expression = bridgeArchExpression()
    expect(evaluateBridgeArch(expression, 'x86_64-apple-darwin')).not.toBe(
      evaluateBridgeArch(expression, 'aarch64-apple-darwin')
    )
  })

  test('the env var the workflow sets is the one the build script actually reads', () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain('GAMELIB_BRIDGE_TARGET_ARCH:')

    const buildScript = readFileSync(
      join(__dirname, '..', '..', '..', 'meta', 'buildSteamBridgeShims.ts'),
      'utf-8'
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(buildScript).toContain('env.GAMELIB_BRIDGE_TARGET_ARCH')
  })

  test('the arch env wiring belongs to the steam-bridge step (not some later step)', () => {
    const source = loadReleaseWorkflow()
    expect(source).toMatch(
      /Build steam bridge shims \(macOS only\)[\s\S]*?GAMELIB_BRIDGE_TARGET_ARCH:[\s\S]*?run: pnpm build-steam-bridge/
    )
  })
})

// 34-REVIEW.md (gap cycle 2) CR-02: tauri.conf.json's `frontendDist: "../build"` is the
// SAME directory meta/buildSidecarSea.ts uses as scratch space, so once GAP-1 populated
// build/ the shipped installer embedded a ~58 MB Node dist tarball, the unminified
// full-backend SEA bundle, the raw SEA blob and the Electron main/preload output --
// webview-fetchable, with `csp: null`. These tests EXECUTE the prune step's real shell
// body against a synthetic build/ tree rather than asserting on its text, so a prune line
// that stops removing an intermediate (or starts eating the renderer output) fails here.
const PRUNE_STEP_NAME = 'Prune non-frontend build intermediates before bundling'
const describeOnPosix = process.platform === 'win32' ? describe.skip : describe

describeOnPosix('release-tauri.yml prunes frontendDist before bundling (CR-02 regression guard)', () => {
  let workdir: string

  /** Mirrors the build/ contents observed after renderer build + SEA build. */
  function seedBuildTree(root: string, { withBridge }: { withBridge: boolean }): void {
    touch(root, join('build', 'index.html'), '<!doctype html>')
    touch(root, join('build', 'assets', 'index-abc123.js'))
    touch(root, join('build', 'assets', 'index-abc123.css'))
    touch(root, join('build', 'node-dist', 'node-v26.2.0-darwin-x64.tar.gz'))
    touch(root, join('build', 'node-dist', 'node-v26.2.0-darwin-x64', 'bin', 'node'))
    touch(root, join('build', 'main', 'sidecar-sea-bundle.js'))
    touch(root, join('build', 'main', 'sidecar.js'))
    touch(root, join('build', 'main', 'main.js'))
    touch(root, join('build', 'main', 'chunks', 'chunk-1.js'))
    touch(root, join('build', 'main', 'decompressWorker.js'))
    touch(root, join('build', 'preload', 'index.js'))
    touch(root, join('build', 'sea-config.json'), '{}')
    touch(root, join('build', 'sidecar-prep.blob'))
    if (withBridge) {
      touch(root, join('build', 'bin', 'x64', 'darwin', 'steam-bridge-helper'))
      touch(root, join('build', 'bin', 'x64', 'darwin', 'steam_api.dll'))
    }
  }

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), 'gamelib-prune-'))
  })

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true })
  })

  test('the prune step runs after the SEA build and before tauri-action', () => {
    const source = loadReleaseWorkflow()
    expect(source).toMatch(
      new RegExp(
        `run: pnpm build:sidecar-sea[\\s\\S]*?${PRUNE_STEP_NAME}[\\s\\S]*?uses: tauri-apps/tauri-action`
      )
    )
  })

  test('executing it removes every SEA/Electron intermediate from frontendDist', () => {
    seedBuildTree(workdir, { withBridge: true })
    const result = runStepScript(extractRunBlock(PRUNE_STEP_NAME), workdir, {
      IS_MACOS: 'true'
    })
    expect(result.status).toBe(0)

    for (const leftover of [
      join('build', 'node-dist'),
      join('build', 'main'),
      join('build', 'preload'),
      join('build', 'sea-config.json'),
      join('build', 'sidecar-prep.blob')
    ]) {
      expect(existsSync(join(workdir, leftover))).toBe(false)
    }
  })

  test('executing it leaves the renderer output and the bundled bridge assets intact', () => {
    seedBuildTree(workdir, { withBridge: true })
    const result = runStepScript(extractRunBlock(PRUNE_STEP_NAME), workdir, {
      IS_MACOS: 'true'
    })
    expect(result.status).toBe(0)

    for (const kept of [
      join('build', 'index.html'),
      join('build', 'assets', 'index-abc123.js'),
      join('build', 'assets', 'index-abc123.css'),
      join('build', 'bin', 'x64', 'darwin', 'steam-bridge-helper'),
      join('build', 'bin', 'x64', 'darwin', 'steam_api.dll')
    ]) {
      expect(existsSync(join(workdir, kept))).toBe(true)
    }
  })

  test('it fails loudly if the prune ate the renderer entrypoint', () => {
    seedBuildTree(workdir, { withBridge: true })
    rmSync(join(workdir, 'build', 'index.html'))
    const result = runStepScript(extractRunBlock(PRUNE_STEP_NAME), workdir, {
      IS_MACOS: 'true'
    })
    expect(result.status).not.toBe(0)
  })

  test('it fails loudly on a macOS leg whose bridge assets never reached build/ (CR-01 interlock)', () => {
    seedBuildTree(workdir, { withBridge: false })
    const result = runStepScript(extractRunBlock(PRUNE_STEP_NAME), workdir, {
      IS_MACOS: 'true'
    })
    expect(result.status).not.toBe(0)
  })

  test('the bridge-asset guard does not fire on the non-macOS legs', () => {
    seedBuildTree(workdir, { withBridge: false })
    const result = runStepScript(extractRunBlock(PRUNE_STEP_NAME), workdir, {
      IS_MACOS: 'false'
    })
    expect(result.status).toBe(0)
  })
})

// 34-VERIFICATION.md truth #7 PARTIAL / 34-REVIEW.md WR-03: the Windows signing override
// gate tests only `-n "$WINDOWS_CERTIFICATE"` and never `WINDOWS_CERT_THUMBPRINT`. Enrolling
// the certificate secret without the thumbprint secret renders `"certificateThumbprint":""`
// into the --config override, tauri invokes signtool with an empty thumbprint, and the
// Windows leg hard-fails -- contradicting D-04's locked "CI must never fail on missing certs"
// invariant. WR-03's secondary defect: the secret-derived `args` output is written to
// $GITHUB_OUTPUT with the single-line key=value form, which a newline in the thumbprint
// secret could use to inject arbitrary step outputs. These assertions MUST fail against the
// pre-fix workflow (RED); GAP-4's fix (34-15 Task 2) makes them pass.
//
// Tests 2, 4 and 6 assert against a comment-stripped copy of the workflow -- the file's own
// header/step comments already mention certificateThumbprint, WINDOWS_CERT_THUMBPRINT, and
// "never fail", so an unstripped assertion would be self-invalidating (prose alone could
// satisfy or defeat it).
describe('release-tauri.yml Windows signing gate requires BOTH secrets (WR-03 / GAP-4 regression guard)', () => {
  function loadStrippedReleaseWorkflow(): string {
    return loadReleaseWorkflow()
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n')
  }

  test('Test 1: the signing-override branch requires BOTH secrets on the same if line', () => {
    const source = loadReleaseWorkflow()
    const ifLine = source
      .split('\n')
      .find((line) => line.includes('-n "$WINDOWS_CERTIFICATE"'))
    expect(ifLine).toBeDefined()
    expect(ifLine).toContain('-n "$WINDOWS_CERT_THUMBPRINT"')
  })

  test('Test 2: certificateThumbprint is only reachable after the thumbprint check', () => {
    const stripped = loadStrippedReleaseWorkflow()
    const idxThumbCheck = stripped.indexOf('-n "$WINDOWS_CERT_THUMBPRINT" ]')
    const idxCertThumbprint = stripped.indexOf('certificateThumbprint')
    expect(idxThumbCheck).toBeGreaterThanOrEqual(0)
    expect(idxCertThumbprint).toBeGreaterThanOrEqual(0)
    expect(idxThumbCheck).toBeLessThan(idxCertThumbprint)
  })

  test('Test 3: a warn-and-skip middle branch exists naming WINDOWS_CERT_THUMBPRINT', () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain('elif')
    expect(source).toMatch(/::warning::[^\n]*WINDOWS_CERT_THUMBPRINT/)
  })

  test('Test 4: the warn-and-skip branch does not fail the job (no exit 1)', () => {
    const stripped = loadStrippedReleaseWorkflow()
    const elifMatch = stripped.match(/elif[\s\S]*?WINDOWS_CERT_THUMBPRINT[\s\S]*?fi\b/)
    expect(elifMatch).not.toBeNull()
    expect(elifMatch?.[0]).not.toMatch(/exit 1/)
  })

  test('Test 5: the cert-import step if: line is gated on the thumbprint too', () => {
    const source = loadReleaseWorkflow()
    const ifLine = source
      .split('\n')
      .find(
        (line) =>
          line.trim().startsWith('if:') && line.includes("env.WINDOWS_CERTIFICATE != ''")
      )
    expect(ifLine).toBeDefined()
    expect(ifLine).toContain("env.WINDOWS_CERT_THUMBPRINT != ''")
  })

  test('Test 6: secret-derived args output uses a heredoc, not single-line echo', () => {
    const stripped = loadStrippedReleaseWorkflow()
    expect(stripped).toContain('args<<')
    expect(stripped).not.toMatch(/echo "args=[^\n]*CONFIG_OVERRIDE/)
  })

  test('Test 7: the heredoc delimiter is randomised via $RANDOM', () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain('$RANDOM')
  })

  test('Test 8 (D-04 invariant guard): existing per-OS Signing-skipped warnings still present', () => {
    const source = loadReleaseWorkflow()
    expect(source).toMatch(/env\.APPLE_CERTIFICATE == ''[\s\S]*?::warning::Signing skipped/)
    expect(source).toMatch(/env\.WINDOWS_CERTIFICATE == ''[\s\S]*?::warning::Signing skipped/)
  })

  test('Test 9 (34-11 regression guard): cert.pfx cleanup still sits in a finally block', () => {
    const source = loadReleaseWorkflow()
    expect(source).toMatch(
      /Import-PfxCertificate[\s\S]*?finally \{[\s\S]*?Remove-Item -Path cert\.pfx -Force/
    )
  })
})
