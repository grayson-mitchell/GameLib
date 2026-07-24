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
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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
