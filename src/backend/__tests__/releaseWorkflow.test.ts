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

import {
  extractRunBlock as extractRunBlockFrom,
  readGithubEnv,
  runStepScript,
  stripHashComments,
  substituteExpressions
} from './helpers/workflowSteps'

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
 * Drops lines whose first non-whitespace character is `#`, so the workflow's
 * own explanatory prose can neither satisfy nor invalidate a `toContain`/regex
 * assertion made against its actual instructions (WR-04).
 */
function loadStrippedWorkflow(): string {
  return stripHashComments(loadReleaseWorkflow())
}

/** Loads a step's literal `run: |` body from this workflow (shared helper). */
function extractRunBlock(stepName: string): string {
  return extractRunBlockFrom(loadReleaseWorkflow(), stepName)
}

/** Substitutes this workflow's `${{ matrix.* }}` expressions (shared helper). */
function substituteMatrixExpressions(
  script: string,
  values: Record<string, string>
): string {
  return substituteExpressions(script, {
    'matrix.platform': values.platform,
    'matrix.args': values.args
  })
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
  test("gates Windows cert import behind env.WINDOWS_CERTIFICATE != ''", () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain("env.WINDOWS_CERTIFICATE != ''")
  })
})

describe('release-tauri.yml per-OS "Signing skipped" clear-warning steps (D-04 regression guard)', () => {
  // GAP-A (34-16): the APPLE_CERTIFICATE sibling of this test was deleted --
  // it asserted on the WARNING STRING's shape and stayed green through live
  // run 30084918812, which failed on `security import` because the "warning"
  // step never prevented the signing attempt. Its replacement is the
  // executed-path "Apple signing env gate" describe block below, which reads
  // resolved $GITHUB_ENV content instead of source text.
  test('emits ::warning::Signing skipped when WINDOWS_CERTIFICATE is empty', () => {
    const source = loadReleaseWorkflow()
    expect(source).toMatch(
      /env\.WINDOWS_CERTIFICATE == ''[\s\S]*?::warning::Signing skipped/
    )
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
    expect(source).toContain(
      'GAMELIB_SIDECAR_TARGET_TRIPLE: ${{ matrix.sidecar_triple }}'
    )
  })

  test('declares all three target triples across the matrix legs', () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain("sidecar_triple: 'aarch64-apple-darwin'")
    expect(source).toContain("sidecar_triple: 'x86_64-unknown-linux-gnu'")
    expect(source).toContain("sidecar_triple: 'x86_64-pc-windows-msvc'")
  })

  test('declares exactly three sidecar_triple matrix entries', () => {
    const source = loadReleaseWorkflow()
    const matches = source.match(/sidecar_triple: '/g) ?? []
    expect(matches).toHaveLength(3)
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
    expect(source).toMatch(
      /Import-PfxCertificate[\s\S]*?Remove-Item -Path cert\.pfx -Force/
    )
  })

  test('the removal sits in a finally block', () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain('finally {')
  })

  // WR-01 (34-REVIEW.md gap cycle 2): `expect(source).toContain('finally {')` is
  // satisfied by a finally block that does not actually cover the file write. The
  // step's own comment claimed cert.pfx is removed "even when the import itself
  // throws", but Set-Content and ConvertTo-SecureString both sat OUTSIDE the try,
  // and ConvertTo-SecureString -String "" is a TERMINATING error under GitHub's
  // pwsh -- leaving the PKCS#12 private key in the runner workspace. These
  // assertions check containment in the step's real run block, not mere presence.
  describe('cert.pfx never exists on disk outside the try/finally (WR-01)', () => {
    const CERT_STEP_NAME = 'Import Windows signing certificate (if present)'

    test('every cert.pfx reference sits inside the try block', () => {
      const block = extractRunBlock(CERT_STEP_NAME)
      const tryIndex = block.indexOf('try {')
      expect(tryIndex).toBeGreaterThanOrEqual(0)

      const certIndexes: number[] = []
      for (
        let index = block.indexOf('cert.pfx');
        index !== -1;
        index = block.indexOf('cert.pfx', index + 1)
      ) {
        certIndexes.push(index)
      }
      expect(certIndexes.length).toBeGreaterThan(0)
      for (const certIndex of certIndexes) {
        expect(certIndex).toBeGreaterThan(tryIndex)
      }
    })

    test('the file write happens after `try {`, not before it', () => {
      const block = extractRunBlock(CERT_STEP_NAME)
      expect(block.indexOf('Set-Content -Path cert.pfx')).toBeGreaterThan(
        block.indexOf('try {')
      )
    })

    test('the only fallible pre-try statement runs while nothing is on disk yet', () => {
      const block = extractRunBlock(CERT_STEP_NAME)
      // ConvertTo-SecureString throws on an empty/unset password secret; it
      // must therefore run BEFORE any key material is written.
      expect(block.indexOf('ConvertTo-SecureString')).toBeLessThan(
        block.indexOf('Set-Content -Path cert.pfx')
      )
    })

    test('the finally block still removes the file', () => {
      const block = extractRunBlock(CERT_STEP_NAME)
      const finallyIndex = block.indexOf('finally {')
      expect(finallyIndex).toBeGreaterThan(
        block.indexOf('Import-PfxCertificate')
      )
      expect(
        block.indexOf('Remove-Item -Path cert.pfx -Force')
      ).toBeGreaterThan(finallyIndex)
    })
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

// 34-VERIFICATION.md failed truth #5 / 34-REVIEW.md CR-01: release-tauri.yml never ran a
// renderer build at all, yet tauri.conf.json has `beforeBuildCommand: ""` and
// `frontendDist: "../build"` -- a directory only that command populates. These assertions
// MUST fail against the pre-fix workflow (RED); GAP-1's fix (34-12 Task 2) makes them pass.
//
// Phase 35 plan 03 (D-12) retargeted the anchor from `pnpm exec electron-vite build` to
// `pnpm exec vite build`. The guard is unchanged in substance -- it still asserts that a
// renderer build exists and runs after the steam-bridge build and the CrossOver index
// fetch, and before tauri-action. Only the command that performs it changed. The literal
// string is deliberately exact: `electron-vite build` also contains the substring
// `vite build`, so a loose anchor would have passed against the old workflow and made
// this guard vacuous.
describe('release-tauri.yml renderer + asset build steps (CR-01 / GAP-1 regression guard)', () => {
  test('builds the renderer via vite before bundling', () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain('run: pnpm exec vite build')
  })

  test('the renderer build step precedes tauri-action', () => {
    const source = loadReleaseWorkflow()
    expect(source).toMatch(
      /run: pnpm exec vite build[\s\S]*?uses: tauri-apps\/tauri-action/
    )
  })

  test('builds the macOS Steam bridge shims, gated to macOS legs', () => {
    const source = loadReleaseWorkflow()
    expect(source).toMatch(
      /if: startsWith\(matrix\.platform, 'macos'\)[\s\S]*?run: pnpm build-steam-bridge/
    )
  })

  test('the steam-bridge build step precedes the renderer build', () => {
    const source = loadReleaseWorkflow()
    expect(source).toMatch(
      /run: pnpm build-steam-bridge[\s\S]*?run: pnpm exec vite build/
    )
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
      /gh release download crossover-index[\s\S]*?run: pnpm exec vite build/
    )
  })

  test('the crossover index fetch tolerates a missing published index', () => {
    const source = loadReleaseWorkflow()
    expect(source).toMatch(
      /gh release download crossover-index[^\n]*\n?[^\n]*\|\|\s*echo/
    )
  })

  test('the header states the pipeline is unproven live, not verified fact', () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain('UNPROVEN LIVE')
  })

  test('invariant guard: the SEA sidecar build step still precedes tauri-action', () => {
    const source = loadReleaseWorkflow()
    expect(source).toMatch(
      /run: pnpm build:sidecar-sea[\s\S]*?uses: tauri-apps\/tauri-action/
    )
  })
})

// 34-REVIEW.md (gap cycle 2) CR-01 (historical): GAP-1's new `pnpm build-steam-bridge`
// step was host-arch-driven -- meta/buildSteamBridgeShims.ts emitted to
// public/bin/${process.arch}/darwin/, and both macos-latest legs are Apple Silicon, so
// the (now-retired) `--target x86_64-apple-darwin` bundle shipped bin/arm64/... while its
// own x64 sidecar resolved bin/x64/... at runtime. quick-260901-i8i: the Intel leg is
// gone and GAMELIB_BRIDGE_TARGET_ARCH is now a literal ('arm64'), so the ternary-eval
// helpers that used to parse the expression are gone too -- these tests assert the
// literal and its absence-of-Intel-branch directly.
describe('release-tauri.yml steam-bridge target arch (CR-01 regression guard)', () => {
  test('the bridge step targets arm64 via a literal, not a per-leg ternary', () => {
    const source = loadReleaseWorkflow()
    expect(source).toContain("GAMELIB_BRIDGE_TARGET_ARCH: 'arm64'")
  })

  test('no sidecar_triple matrix leg or --target arg names the retired Intel Mac triple', () => {
    const source = loadReleaseWorkflow()
    expect(source).not.toContain("sidecar_triple: 'x86_64-apple-darwin'")
    expect(source).not.toContain('--target x86_64-apple-darwin')
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

describeOnPosix(
  'release-tauri.yml prunes frontendDist before bundling (CR-02 regression guard)',
  () => {
    let workdir: string

    /** Mirrors the build/ contents observed after renderer build + SEA build. */
    function seedBuildTree(
      root: string,
      { withBridge }: { withBridge: boolean }
    ): void {
      touch(root, join('build', 'index.html'), '<!doctype html>')
      touch(root, join('build', 'assets', 'index-abc123.js'))
      touch(root, join('build', 'assets', 'index-abc123.css'))
      touch(root, join('build', 'renderer', 'index.html'), '<!doctype html>')
      touch(root, join('build', 'renderer', 'assets', 'index-abc123.js'))
      touch(root, join('build', 'node-dist', 'node-v26.2.0-darwin-x64.tar.gz'))
      touch(
        root,
        join('build', 'node-dist', 'node-v26.2.0-darwin-x64', 'bin', 'node')
      )
      touch(root, join('build', 'main', 'sidecar-sea-bundle.js'))
      touch(root, join('build', 'main', 'sidecar.js'))
      touch(root, join('build', 'main', 'main.js'))
      touch(root, join('build', 'main', 'chunks', 'chunk-1.js'))
      touch(root, join('build', 'main', 'decompressWorker.js'))
      touch(root, join('build', 'preload', 'index.js'))
      touch(root, join('build', 'sea-config.json'), '{}')
      touch(root, join('build', 'sidecar-prep.blob'))
      if (withBridge) {
        touch(
          root,
          join('build', 'bin', 'arm64', 'darwin', 'steam-bridge-helper')
        )
        touch(root, join('build', 'bin', 'arm64', 'darwin', 'steam_api.dll'))
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
        join('build', 'renderer', 'index.html'),
        join('build', 'renderer', 'assets', 'index-abc123.js'),
        join('build', 'bin', 'arm64', 'darwin', 'steam-bridge-helper'),
        join('build', 'bin', 'arm64', 'darwin', 'steam_api.dll')
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

    // Quick task 260901-b8z: an additive guard alongside the one above.
    // frontendDist now points at build/renderer, not build -- a build whose
    // build/index.html survives but whose build/renderer/index.html is
    // missing or empty would previously sail through this step and ship a
    // white screen. This guard, and this test, are what close that gap.
    test('it fails loudly if build/renderer/index.html is missing (frontendDist repoint guard)', () => {
      seedBuildTree(workdir, { withBridge: true })
      rmSync(join(workdir, 'build', 'renderer', 'index.html'))
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
  }
)

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
  // WR-04: this used to be a third private copy of the comment-stripper; it
  // now delegates to the single module-level helper so every assertion in
  // this file can reach it (the whole reason Test 3 and Test 7 were checking
  // the UNSTRIPPED source and passing on comment prose alone).
  const loadStrippedReleaseWorkflow = loadStrippedWorkflow

  test('Test 1: the signing-override branch requires ALL THREE secrets on the same if line', () => {
    const source = loadReleaseWorkflow()
    const ifLine = source
      .split('\n')
      .find((line) => line.includes('-n "$WINDOWS_CERTIFICATE"'))
    expect(ifLine).toBeDefined()
    expect(ifLine).toContain('-n "$WINDOWS_CERT_THUMBPRINT"')
    // WR-02: the password secret was checked nowhere in the workflow.
    expect(ifLine).toContain('-n "$WINDOWS_CERTIFICATE_PASSWORD"')
  })

  test('Test 2: certificateThumbprint is only reachable after the thumbprint check', () => {
    const stripped = loadStrippedReleaseWorkflow()
    const idxThumbCheck = stripped.indexOf('-n "$WINDOWS_CERT_THUMBPRINT" ]')
    const idxCertThumbprint = stripped.indexOf('certificateThumbprint')
    expect(idxThumbCheck).toBeGreaterThanOrEqual(0)
    expect(idxCertThumbprint).toBeGreaterThanOrEqual(0)
    expect(idxThumbCheck).toBeLessThan(idxCertThumbprint)
  })

  // WR-04: both assertions used to run against the UNSTRIPPED source, where the
  // step's own comment prose already names `elif` and WINDOWS_CERT_THUMBPRINT.
  test('Test 3: a warn-and-skip middle branch exists naming WINDOWS_CERT_THUMBPRINT', () => {
    const stripped = loadStrippedReleaseWorkflow()
    expect(stripped).toContain('elif')
    expect(stripped).toMatch(/::warning::[^\n]*WINDOWS_CERT_THUMBPRINT/)
  })

  test('Test 4: the warn-and-skip branch does not fail the job (no exit 1)', () => {
    const stripped = loadStrippedReleaseWorkflow()
    const elifMatch = stripped.match(
      /elif[\s\S]*?WINDOWS_CERT_THUMBPRINT[\s\S]*?fi\b/
    )
    expect(elifMatch).not.toBeNull()
    expect(elifMatch?.[0]).not.toMatch(/exit 1/)
  })

  test('Test 5: the cert-import step if: line is gated on the thumbprint AND the password', () => {
    const source = loadReleaseWorkflow()
    const ifLine = source
      .split('\n')
      .find(
        (line) =>
          line.trim().startsWith('if:') &&
          line.includes("env.WINDOWS_CERTIFICATE != ''")
      )
    expect(ifLine).toBeDefined()
    expect(ifLine).toContain("env.WINDOWS_CERT_THUMBPRINT != ''")
    // WR-02: without this, cert+thumbprint-without-password reached the pwsh
    // step and ConvertTo-SecureString -String "" hard-failed the whole leg.
    expect(ifLine).toContain("env.WINDOWS_CERTIFICATE_PASSWORD != ''")
  })

  test('Test 6: secret-derived args output uses a heredoc, not single-line echo', () => {
    const stripped = loadStrippedReleaseWorkflow()
    expect(stripped).toContain('args<<')
    expect(stripped).not.toMatch(/echo "args=[^\n]*CONFIG_OVERRIDE/)
  })

  // WR-04: `expect(source).toContain('$RANDOM')` against the UNSTRIPPED file was
  // satisfied by the step comment that merely DESCRIBES the randomisation -- so
  // replacing DELIM="ARGS_${RANDOM}..." with a fixed DELIM="ARGS_EOF" (the exact
  // regression this test exists to prevent) left it green. It now asserts against the
  // instructions only, and additionally forbids a fixed literal delimiter. The
  // executed-behaviour counterpart lives in the "build-args secret gating, executed"
  // block below, which runs the step twice and proves the delimiter really varies.
  test('Test 7: the heredoc delimiter is randomised via $RANDOM', () => {
    const stripped = loadStrippedReleaseWorkflow()
    expect(stripped).toMatch(/DELIM=.*\$\{?RANDOM\}?/)
    expect(stripped).not.toMatch(/args<<[A-Za-z_][A-Za-z0-9_]*\s*$/m)
  })

  // GAP-A (34-16): this test used to also assert
  // `env.APPLE_CERTIFICATE == ''[\s\S]*?::warning::Signing skipped` -- that
  // half was deleted along with the step it described (job-level
  // APPLE_CERTIFICATE no longer exists at all, see the executed-path "Apple
  // signing env gate" describe block below). The Windows half below is
  // unaffected and out of scope for this gap.
  test('Test 8 (D-04 invariant guard): existing Windows Signing-skipped warning still present', () => {
    const source = loadReleaseWorkflow()
    expect(source).toMatch(
      /env\.WINDOWS_CERTIFICATE == ''[\s\S]*?::warning::Signing skipped/
    )
  })

  test('Test 9 (34-11 regression guard): cert.pfx cleanup still sits in a finally block', () => {
    const source = loadReleaseWorkflow()
    expect(source).toMatch(
      /Import-PfxCertificate[\s\S]*?finally \{[\s\S]*?Remove-Item -Path cert\.pfx -Force/
    )
  })
})

// 34-REVIEW.md (gap cycle 2) WR-03: the workflow header states every signing path is
// conditional on its secret and that the secrets-absent default is "skip, warn, ship
// unsigned, job green". That holds for APPLE_CERTIFICATE and WINDOWS_CERTIFICATE but NOT
// for TAURI_SIGNING_PRIVATE_KEY: with `createUpdaterArtifacts: true` and a committed
// pubkey, `tauri build` errors out instead of skipping, killing all three legs. The
// coupling below is the invariant -- it is expressed as a conditional so that flipping
// createUpdaterArtifacts to false legitimately retires the guard.
describe('release-tauri.yml updater signing key preflight (WR-03 regression guard)', () => {
  function updaterArtifactsEnabled(): boolean {
    const conf = JSON.parse(
      readFileSync(
        join(__dirname, '..', '..', '..', 'src-tauri', 'tauri.conf.json'),
        'utf-8'
      )
    ) as { bundle?: { createUpdaterArtifacts?: boolean } }
    return conf.bundle?.createUpdaterArtifacts === true
  }

  test("createUpdaterArtifacts: true implies a TAURI_SIGNING_PRIVATE_KEY == '' guard exists", () => {
    if (!updaterArtifactsEnabled()) {
      return
    }
    const stripped = loadStrippedWorkflow()
    expect(stripped).toContain("env.TAURI_SIGNING_PRIVATE_KEY == ''")
  })

  test('the guard fails the job loudly rather than warning and continuing', () => {
    if (!updaterArtifactsEnabled()) {
      return
    }
    const stripped = loadStrippedWorkflow()
    const guardBlock = stripped.match(
      /if: env\.TAURI_SIGNING_PRIVATE_KEY == ''[\s\S]*?exit 1/
    )
    expect(guardBlock).not.toBeNull()
    expect(guardBlock?.[0]).toContain('::error::')
  })

  test('the guard runs before any build step, so the failure is fast and cheap', () => {
    if (!updaterArtifactsEnabled()) {
      return
    }
    const stripped = loadStrippedWorkflow()
    const guardIndex = stripped.indexOf("env.TAURI_SIGNING_PRIVATE_KEY == ''")
    expect(guardIndex).toBeGreaterThanOrEqual(0)
    for (const laterStep of [
      'run: pnpm exec vite build',
      'run: pnpm build:sidecar-sea',
      'uses: tauri-apps/tauri-action'
    ]) {
      expect(guardIndex).toBeLessThan(stripped.indexOf(laterStep))
    }
  })

  test('the guard names the concrete remedy, not just the missing secret', () => {
    if (!updaterArtifactsEnabled()) {
      return
    }
    const stripped = loadStrippedWorkflow()
    const guardBlock = stripped.match(
      /if: env\.TAURI_SIGNING_PRIVATE_KEY == ''[\s\S]*?exit 1/
    )
    expect(guardBlock).not.toBeNull()
    expect(guardBlock?.[0]).toContain('createUpdaterArtifacts')
  })

  // GAP-B (34-17, live run 30084918812): the presence-only guard above does not
  // catch a non-empty key with a WRONG password (the actual live failure) or a
  // key that decodes but does not match the committed pubkey. These tests prove
  // the decode-and-match preflight (`pnpm verify:updater-key`) is wired in, and
  // that it runs after dependency install (it needs the Tauri CLI) but before
  // every expensive build step it exists to protect.
  test('GAP-B: the workflow runs pnpm verify:updater-key', () => {
    const stripped = loadStrippedWorkflow()
    expect(stripped).toContain('run: pnpm verify:updater-key')
  })

  test('GAP-B: the decode preflight runs after install-deps but before every expensive build step', () => {
    const stripped = loadStrippedWorkflow()
    const installDepsIndex = stripped.indexOf(
      'uses: ./.github/actions/install-deps'
    )
    const preflightIndex = stripped.indexOf('run: pnpm verify:updater-key')
    expect(installDepsIndex).toBeGreaterThanOrEqual(0)
    expect(preflightIndex).toBeGreaterThan(installDepsIndex)
    for (const laterStep of [
      'run: pnpm exec vite build',
      'run: pnpm build:sidecar-sea',
      'uses: tauri-apps/tauri-action'
    ]) {
      expect(preflightIndex).toBeLessThan(stripped.indexOf(laterStep))
    }
  })

  test('GAP-B: package.json really defines a verify:updater-key script', () => {
    const packageJson = JSON.parse(
      readFileSync(join(__dirname, '..', '..', '..', 'package.json'), 'utf-8')
    ) as { scripts?: Record<string, string> }
    expect(packageJson.scripts?.['verify:updater-key']).toBeDefined()
    expect(packageJson.scripts?.['verify:updater-key']).toContain(
      'meta/verifyUpdaterSigningKey.ts'
    )
  })
})

// 34-REVIEW.md (gap cycle 2) WR-02: GAP-4's "both secrets required" gate never checked
// WINDOWS_CERTIFICATE_PASSWORD, so a cert+thumbprint-without-password secret set still
// reached the pwsh import step and hard-failed the windows-latest leg -- the same class of
// failure GAP-4 existed to eliminate. The prior tests asserted only on the text of the if
// line; these EXECUTE the three-branch shell for every secret combination and assert on
// the args value it actually writes to $GITHUB_OUTPUT.
const BUILD_ARGS_STEP_NAME =
  'Compute tauri-action build args (Windows signing override merge)'

describeOnPosix(
  'release-tauri.yml build-args secret gating, executed (WR-02 regression guard)',
  () => {
    let workdir: string

    beforeEach(() => {
      workdir = mkdtempSync(join(tmpdir(), 'gamelib-buildargs-'))
    })

    afterEach(() => {
      rmSync(workdir, { recursive: true, force: true })
    })

    /** Reads back the `args<<DELIM` heredoc GitHub's $GITHUB_OUTPUT protocol uses. */
    function readArgsOutput(outputPath: string): string {
      const lines = readFileSync(outputPath, 'utf-8').split('\n')
      const header = lines[0].match(/^args<<(.+)$/)
      expect(header).not.toBeNull()
      const delimiter = (header as RegExpMatchArray)[1]
      const body: string[] = []
      for (let index = 1; index < lines.length; index += 1) {
        if (lines[index] === delimiter) {
          return body.join('\n')
        }
        body.push(lines[index])
      }
      throw new Error(`unterminated args heredoc (delimiter ${delimiter})`)
    }

    function runBuildArgs(
      secrets: Record<string, string>,
      platform = 'windows-latest',
      matrixArgs = ''
    ): {
      status: number | null
      stdout: string
      args: string
      rawOutput: string
    } {
      const script = substituteMatrixExpressions(
        extractRunBlock(BUILD_ARGS_STEP_NAME),
        { platform, args: matrixArgs }
      )
      const outputPath = join(workdir, `github-output-${Math.random()}`)
      writeFileSync(outputPath, '')
      const result = runStepScript(script, workdir, {
        GITHUB_OUTPUT: outputPath,
        WINDOWS_CERTIFICATE: '',
        WINDOWS_CERT_THUMBPRINT: '',
        WINDOWS_CERTIFICATE_PASSWORD: '',
        ...secrets
      })
      return {
        status: result.status,
        stdout: result.stdout,
        args: readArgsOutput(outputPath),
        rawOutput: readFileSync(outputPath, 'utf-8')
      }
    }

    test('all three Windows secrets present -> the signing override is merged in', () => {
      const result = runBuildArgs({
        WINDOWS_CERTIFICATE: 'BASE64CERT',
        WINDOWS_CERT_THUMBPRINT: 'AABBCCDD',
        WINDOWS_CERTIFICATE_PASSWORD: 'hunter2'
      })
      expect(result.status).toBe(0)
      expect(result.args).toContain('"certificateThumbprint":"AABBCCDD"')
      expect(result.args).toContain('"digestAlgorithm":"sha256"')
    })

    test('WR-02: cert + thumbprint but NO password -> warn and ship unsigned, job stays green', () => {
      const result = runBuildArgs({
        WINDOWS_CERTIFICATE: 'BASE64CERT',
        WINDOWS_CERT_THUMBPRINT: 'AABBCCDD'
      })
      expect(result.status).toBe(0)
      expect(result.args).not.toContain('certificateThumbprint')
      expect(result.stdout).toContain('::warning::')
      expect(result.stdout).toContain('WINDOWS_CERTIFICATE_PASSWORD')
    })

    test('cert + password but NO thumbprint -> warn and ship unsigned, job stays green', () => {
      const result = runBuildArgs({
        WINDOWS_CERTIFICATE: 'BASE64CERT',
        WINDOWS_CERTIFICATE_PASSWORD: 'hunter2'
      })
      expect(result.status).toBe(0)
      expect(result.args).not.toContain('certificateThumbprint')
      expect(result.stdout).toContain('WINDOWS_CERT_THUMBPRINT')
    })

    test('no Windows secrets at all -> matrix.args passes through untouched (D-04 default)', () => {
      const result = runBuildArgs({}, 'windows-latest', '--verbose')
      expect(result.status).toBe(0)
      expect(result.args.trim()).toBe('--verbose')
      expect(result.stdout).not.toContain('::warning::')
    })

    test('WR-02: thumbprint/password present but NO cert -> warn naming the cert, ship unsigned, job stays green', () => {
      const result = runBuildArgs({
        WINDOWS_CERT_THUMBPRINT: 'AABBCCDD',
        WINDOWS_CERTIFICATE_PASSWORD: 'hunter2'
      })
      expect(result.status).toBe(0)
      expect(result.args).not.toContain('certificateThumbprint')
      expect(result.stdout).toContain('::warning::')
      expect(result.stdout).toContain('WINDOWS_CERTIFICATE is missing')
    })

    test('a non-Windows leg never merges a signing override even with secrets enrolled', () => {
      const result = runBuildArgs(
        {
          WINDOWS_CERTIFICATE: 'BASE64CERT',
          WINDOWS_CERT_THUMBPRINT: 'AABBCCDD',
          WINDOWS_CERTIFICATE_PASSWORD: 'hunter2'
        },
        'macos-latest',
        '--target aarch64-apple-darwin'
      )
      expect(result.status).toBe(0)
      expect(result.args.trim()).toBe('--target aarch64-apple-darwin')
      expect(result.args).not.toContain('certificateThumbprint')
    })

    // WR-04: the previous `expect(source).toContain('$RANDOM')` assertion was satisfied by
    // the step's own comment prose and would have stayed green against a fixed delimiter.
    // Running the block twice proves the delimiter really varies per run.
    test('the $GITHUB_OUTPUT heredoc delimiter is randomised per run, not a fixed literal', () => {
      const secrets = { WINDOWS_CERTIFICATE: '', WINDOWS_CERT_THUMBPRINT: '' }
      const first = runBuildArgs(secrets).rawOutput.split('\n')[0]
      const second = runBuildArgs(secrets).rawOutput.split('\n')[0]
      expect(first).toMatch(/^args<<\S+$/)
      expect(second).toMatch(/^args<<\S+$/)
      expect(first).not.toBe(second)
    })

    test('a newline-bearing thumbprint secret cannot inject extra step outputs', () => {
      const result = runBuildArgs({
        WINDOWS_CERTIFICATE: 'BASE64CERT',
        WINDOWS_CERT_THUMBPRINT: 'AABBCCDD\nevil=pwned',
        WINDOWS_CERTIFICATE_PASSWORD: 'hunter2'
      })
      expect(result.status).toBe(0)
      // The injected line lands INSIDE the heredoc body (part of args), never
      // as a sibling `evil=pwned` output key.
      expect(result.args).toContain('evil=pwned')
      expect(result.rawOutput.split('\n')[0]).toMatch(/^args<</)
      const delimiter = result.rawOutput.split('\n')[0].replace('args<<', '')
      const trailing = result.rawOutput.split(`\n${delimiter}\n`)[1] ?? ''
      expect(trailing.trim()).toBe('')
    })
  }
)

// GAP-A (live run 30084918812): both macOS legs failed with `failed to run command
// security import: failed to import keychain certificate` even though NO Apple cert
// secret is enrolled -- a direct D-04 violation. Root cause: the job-level `env:` block
// unconditionally mapped `APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}`, which
// resolves to a DEFINED, EMPTY variable when the secret is absent. The Tauri bundler's
// macOS signing path tests the variable's *presence*, not its truthiness, so it entered
// the keychain-import branch on empty data. The prior `Warn if macOS signing will be
// skipped` step only printed a line -- it prevented nothing. These tests assert on
// RESOLVED $GITHUB_ENV CONTENT produced by executing the gate step's real shell body,
// never on a warning string alone.
const APPLE_GATE_STEP_NAME =
  'Enable Apple signing only when a complete cert secret set is enrolled'

describeOnPosix(
  'release-tauri.yml Apple signing env gate, executed (GAP-A regression guard)',
  () => {
    let workdir: string

    beforeEach(() => {
      workdir = mkdtempSync(join(tmpdir(), 'gamelib-applegate-'))
    })

    afterEach(() => {
      rmSync(workdir, { recursive: true, force: true })
    })

    type AppleGateInput = Partial<
      Record<
        | 'IN_APPLE_CERTIFICATE'
        | 'IN_APPLE_CERTIFICATE_PASSWORD'
        | 'IN_APPLE_SIGNING_IDENTITY'
        | 'IN_APPLE_ID'
        | 'IN_APPLE_PASSWORD'
        | 'IN_APPLE_TEAM_ID',
        string
      >
    >

    function runAppleGate(inputs: AppleGateInput): {
      status: number | null
      stdout: string
      rawEnv: string
      env: Record<string, string>
    } {
      const envFilePath = join(workdir, `github-env-${Math.random()}`)
      writeFileSync(envFilePath, '')
      const result = runStepScript(
        extractRunBlock(APPLE_GATE_STEP_NAME),
        workdir,
        {
          GITHUB_ENV: envFilePath,
          IN_APPLE_CERTIFICATE: '',
          IN_APPLE_CERTIFICATE_PASSWORD: '',
          IN_APPLE_SIGNING_IDENTITY: '',
          IN_APPLE_ID: '',
          IN_APPLE_PASSWORD: '',
          IN_APPLE_TEAM_ID: '',
          ...inputs
        }
      )
      const rawEnv = readFileSync(envFilePath, 'utf-8')
      return {
        status: result.status,
        stdout: result.stdout,
        rawEnv,
        env: readGithubEnv(envFilePath)
      }
    }

    test('Test A (the live failure): all Apple secrets empty -> nothing exported, warned', () => {
      const result = runAppleGate({})
      expect(result.status).toBe(0)
      expect(result.rawEnv).not.toMatch(/^APPLE_/m)
      expect(result.stdout).toContain(
        '::warning::Signing skipped — no Apple cert secret set; shipping unsigned artifact'
      )
    })

    test('Test B: full signing trio exports exactly those three, nothing else', () => {
      const result = runAppleGate({
        IN_APPLE_CERTIFICATE: 'CERTDATA',
        IN_APPLE_CERTIFICATE_PASSWORD: 'certpass',
        IN_APPLE_SIGNING_IDENTITY: 'Developer ID Application: Foo'
      })
      expect(result.status).toBe(0)
      expect(result.env.APPLE_CERTIFICATE).toBe('CERTDATA')
      expect(result.env.APPLE_CERTIFICATE_PASSWORD).toBe('certpass')
      expect(result.env.APPLE_SIGNING_IDENTITY).toBe(
        'Developer ID Application: Foo'
      )
      expect(result.env.APPLE_ID).toBeUndefined()
      expect(result.env.APPLE_PASSWORD).toBeUndefined()
      expect(result.env.APPLE_TEAM_ID).toBeUndefined()
    })

    test('Test C (partial set, D-04): cert set but password empty -> warn, ship unsigned', () => {
      const result = runAppleGate({ IN_APPLE_CERTIFICATE: 'CERTDATA' })
      expect(result.status).toBe(0)
      expect(result.rawEnv).not.toMatch(/^APPLE_/m)
      expect(result.stdout).toContain('::warning::')
      expect(result.stdout).toContain('APPLE_CERTIFICATE_PASSWORD')
    })

    test('Test D (partial set): cert + password set, identity empty -> warn, ship unsigned', () => {
      const result = runAppleGate({
        IN_APPLE_CERTIFICATE: 'CERTDATA',
        IN_APPLE_CERTIFICATE_PASSWORD: 'certpass'
      })
      expect(result.status).toBe(0)
      expect(result.rawEnv).not.toMatch(/^APPLE_/m)
      expect(result.stdout).toContain('APPLE_SIGNING_IDENTITY')
    })

    test('Test E (notarization): full signing trio + full notarization trio -> all six exported', () => {
      const result = runAppleGate({
        IN_APPLE_CERTIFICATE: 'CERTDATA',
        IN_APPLE_CERTIFICATE_PASSWORD: 'certpass',
        IN_APPLE_SIGNING_IDENTITY: 'Developer ID Application: Foo',
        IN_APPLE_ID: 'dev@example.com',
        IN_APPLE_PASSWORD: 'app-specific-pw',
        IN_APPLE_TEAM_ID: 'TEAM1234'
      })
      expect(result.status).toBe(0)
      expect(result.env.APPLE_CERTIFICATE).toBe('CERTDATA')
      expect(result.env.APPLE_CERTIFICATE_PASSWORD).toBe('certpass')
      expect(result.env.APPLE_SIGNING_IDENTITY).toBe(
        'Developer ID Application: Foo'
      )
      expect(result.env.APPLE_ID).toBe('dev@example.com')
      expect(result.env.APPLE_PASSWORD).toBe('app-specific-pw')
      expect(result.env.APPLE_TEAM_ID).toBe('TEAM1234')
    })

    test('Test F (never notarize an unsigned bundle): notarization trio set but no cert -> nothing exported', () => {
      const result = runAppleGate({
        IN_APPLE_ID: 'dev@example.com',
        IN_APPLE_PASSWORD: 'app-specific-pw',
        IN_APPLE_TEAM_ID: 'TEAM1234'
      })
      expect(result.status).toBe(0)
      expect(result.rawEnv).not.toMatch(/^APPLE_/m)
    })

    test('Test G (injection, mirrors WR-03): a newline-bearing identity cannot inject an extra GITHUB_ENV key', () => {
      // PRECONDITION: cert + password must also be set, or the signing branch
      // (and its write_env call) is never reached -- see the plan's note on
      // why an identity-only variant of this test would pass vacuously.
      const result = runAppleGate({
        IN_APPLE_CERTIFICATE: 'CERTDATA',
        IN_APPLE_CERTIFICATE_PASSWORD: 'certpass',
        IN_APPLE_SIGNING_IDENTITY: 'Developer ID Application: Foo\nEVIL=pwned'
      })
      expect(result.status).toBe(0)
      expect(result.env.APPLE_SIGNING_IDENTITY).toContain('EVIL=pwned')
      expect(result.env.EVIL).toBeUndefined()
    })

    test('Test I (WR-02): cert absent but a secondary Apple secret present -> nothing exported, cert named as the missing one', () => {
      const result = runAppleGate({
        IN_APPLE_CERTIFICATE_PASSWORD: 'certpass',
        IN_APPLE_SIGNING_IDENTITY: 'Developer ID Application: Foo'
      })
      expect(result.status).toBe(0)
      expect(result.rawEnv).not.toMatch(/^APPLE_/m)
      expect(result.stdout).toContain('::warning::')
      expect(result.stdout).toContain('APPLE_CERTIFICATE is missing')
      // The misdiagnosis WR-02 flags: a partial set must NOT read as the all-empty
      // "no Apple cert secret set" case (that string belongs to Test A only).
      expect(result.stdout).not.toContain('no Apple cert secret set')
    })
  }
)

// The other half of the GAP-A invariant: even a flawless gate step is defeated if the
// job-level `env:` block still maps an APPLE_* secret directly (reintroducing the
// defined-but-empty variable the live run failed on). Runs outside describeOnPosix --
// it is a static text check, not a shell execution, so it applies on every platform.
describe('release-tauri.yml job-level env has no APPLE_ keys (GAP-A regression guard)', () => {
  test('Test H: the job-level env: block defines no APPLE_ key', () => {
    const stripped = loadStrippedWorkflow()
    const envStart = stripped.indexOf('\n    env:')
    const stepsStart = stripped.indexOf('\n    steps:')
    expect(envStart).toBeGreaterThanOrEqual(0)
    expect(stepsStart).toBeGreaterThan(envStart)
    const jobEnvSlice = stripped.slice(envStart, stepsStart)
    expect(jobEnvSlice).not.toMatch(/APPLE_/)
  })
})
