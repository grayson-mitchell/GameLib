/**
 * Phase 34 Plan 01 (Wave-0 config-shape scaffold): asserts the TARGET shape
 * of src-tauri/tauri.conf.json. RED today (bundle.active is currently false,
 * targets is "all", plugins is {}) -- turned GREEN by Plan 34-02.
 *
 * Read-file-then-assert-shape, one-behavior-per-test style, modeled on
 * src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts.
 *
 * T-34-01 (Spoofing / updater feed spoofing): the negative Heroic assertion
 * below is the mitigation for this threat -- it must never silently pass on
 * a config that (re-)derives the updater feed from Heroic upstream.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const TAURI_CONF_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'tauri.conf.json'
)

const SRC_TAURI_DIR = join(__dirname, '..', '..', '..', 'src-tauri')

const RELEASE_WORKFLOW_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '.github',
  'workflows',
  'release-tauri.yml'
)

const PROMOTE_WORKFLOW_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '.github',
  'workflows',
  'promote-updater-feed.yml'
)

function loadTauriConf(): Record<string, unknown> {
  return JSON.parse(readFileSync(TAURI_CONF_PATH, 'utf-8')) as Record<
    string,
    unknown
  >
}

/**
 * Drops lines whose first non-whitespace character is `#`, so a workflow's
 * own explanatory comments cannot satisfy (or invalidate) a `toContain`/regex
 * assertion made against its actual instructions.
 */
function stripComments(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n')
}

describe('tauri.conf.json bundle shape (D-01 / D-02 -- real installable build, all 3 platforms)', () => {
  test('bundle.active is true', () => {
    const conf = loadTauriConf()
    const bundle = conf.bundle as Record<string, unknown>
    expect(bundle.active).toBe(true)
  })

  test('bundle.targets includes nsis, appimage, and dmg', () => {
    const conf = loadTauriConf()
    const bundle = conf.bundle as Record<string, unknown>
    expect(bundle.targets).toEqual(expect.arrayContaining(['nsis', 'appimage', 'dmg']))
  })

  test('bundle.externalBin includes binaries/gamelib-sidecar (D-06)', () => {
    const conf = loadTauriConf()
    const bundle = conf.bundle as Record<string, unknown>
    expect(bundle.externalBin).toEqual(
      expect.arrayContaining(['binaries/gamelib-sidecar'])
    )
  })

  test('bundle.createUpdaterArtifacts is true', () => {
    const conf = loadTauriConf()
    const bundle = conf.bundle as Record<string, unknown>
    expect(bundle.createUpdaterArtifacts).toBe(true)
  })

  test('does NOT declare certificateThumbprint or signCommand (D-04 -- signing-free base config)', () => {
    const conf = loadTauriConf()
    const bundle = conf.bundle as Record<string, unknown>
    const windows = (bundle.windows ?? {}) as Record<string, unknown>
    expect(windows).not.toHaveProperty('certificateThumbprint')
    expect(windows).not.toHaveProperty('signCommand')
  })
})

describe('tauri.conf.json updater plugin shape (D-07 / D-08)', () => {
  test('plugins.updater.pubkey is a non-empty string', () => {
    const conf = loadTauriConf()
    const plugins = conf.plugins as Record<string, unknown>
    const updater = plugins.updater as Record<string, unknown>
    expect(typeof updater.pubkey).toBe('string')
    expect((updater.pubkey as string).length).toBeGreaterThan(0)
  })

  test('plugins.updater.endpoints[0] points at grayson-mitchell/GameLib', () => {
    const conf = loadTauriConf()
    const plugins = conf.plugins as Record<string, unknown>
    const updater = plugins.updater as Record<string, unknown>
    const endpoints = updater.endpoints as string[]
    expect(endpoints[0]).toMatch(/grayson-mitchell\/GameLib/)
  })

  test('the updater feed never contains Heroic-Games-Launcher (T-34-01 -- fork-pointed feed, never derive from defaults)', () => {
    const conf = loadTauriConf()
    expect(JSON.stringify(conf)).not.toContain('Heroic-Games-Launcher')
  })
})

describe('tauri.conf.json icon set (CR-02 -- nsis needs a Windows .ico)', () => {
  test('bundle.icon contains icons/icon.ico', () => {
    const conf = loadTauriConf()
    const bundle = conf.bundle as Record<string, unknown>
    expect(bundle.icon).toEqual(expect.arrayContaining(['icons/icon.ico']))
  })

  test('when bundle.targets includes nsis, at least one bundle.icon entry ends with .ico', () => {
    const conf = loadTauriConf()
    const bundle = conf.bundle as Record<string, unknown>
    const targets = bundle.targets as string[]
    const icons = bundle.icon as string[]
    if (targets.includes('nsis')) {
      expect(icons.some((icon) => icon.endsWith('.ico'))).toBe(true)
    }
  })

  test('every bundle.icon path exists on disk', () => {
    const conf = loadTauriConf()
    const bundle = conf.bundle as Record<string, unknown>
    const icons = bundle.icon as string[]
    const missing = icons.filter(
      (icon) => !existsSync(join(SRC_TAURI_DIR, icon))
    )
    expect(missing).toEqual([])
  })

  test('src-tauri/icons/icon.ico starts with the ICO magic bytes', () => {
    const icoPath = join(SRC_TAURI_DIR, 'icons', 'icon.ico')
    const header = readFileSync(icoPath).subarray(0, 4)
    expect(header).toEqual(Buffer.from([0x00, 0x00, 0x01, 0x00]))
  })
})

/**
 * 34-VERIFICATION.md failed truth #9 / 34-REVIEW.md CR-03 (GAP-3): the
 * updater endpoint used GitHub's `/releases/latest/download/` form, which by
 * design resolves only to the newest NON-prerelease, NON-draft release --
 * while release-tauri.yml's tauri-action step unconditionally sets
 * `prerelease: true`. That combination is a PERMANENT 404, both before and
 * after a human manually publishes the draft, because publishing never
 * clears the prerelease flag.
 *
 * D-09 (34-CONTEXT.md) LOCKS draft + prerelease as the intentional mitigation
 * for the Phase 19 "prerelease-not-Latest" lesson (a 0.x prerelease must
 * never become GitHub "Latest"). Dropping `prerelease: true` is therefore a
 * FORECLOSED remedy -- test 8 below is a deliberate regression guard against
 * a future "simplification" that would reintroduce that failure. The actual
 * fix moves the endpoint to a stable, non-`/latest/` asset location
 * (`/releases/download/<tag>/latest.json`) and adds a `release: published`
 * -triggered promotion workflow that copies `latest.json` there without ever
 * touching the minisign signing key.
 */
describe('updater feed reachability given the release flags (CR-03 / GAP-3 regression guard)', () => {
  test('test 1: if release-tauri.yml sets prerelease: true, the endpoint must not use /releases/latest/download/', () => {
    const conf = loadTauriConf()
    const plugins = conf.plugins as Record<string, unknown>
    const updater = plugins.updater as Record<string, unknown>
    const endpoints = updater.endpoints as string[]
    const workflow = stripComments(readFileSync(RELEASE_WORKFLOW_PATH, 'utf-8'))

    if (workflow.includes('prerelease: true')) {
      expect(endpoints[0]).not.toContain('/releases/latest/download/')
    }
  })

  test('test 2: endpoints[0] is a fixed-tag asset URL a prerelease-only pipeline can serve', () => {
    const conf = loadTauriConf()
    const plugins = conf.plugins as Record<string, unknown>
    const updater = plugins.updater as Record<string, unknown>
    const endpoints = updater.endpoints as string[]

    expect(endpoints[0]).toMatch(
      /^https:\/\/github\.com\/grayson-mitchell\/GameLib\/releases\/download\/([^/]+)\/latest\.json$/
    )
  })

  test('test 3: a promotion workflow uploads latest.json to exactly the tag captured from the endpoint', () => {
    const conf = loadTauriConf()
    const plugins = conf.plugins as Record<string, unknown>
    const updater = plugins.updater as Record<string, unknown>
    const endpoints = updater.endpoints as string[]

    const match = endpoints[0].match(
      /^https:\/\/github\.com\/grayson-mitchell\/GameLib\/releases\/download\/([^/]+)\/latest\.json$/
    )
    expect(match).not.toBeNull()
    const tag = (match as RegExpMatchArray)[1]

    expect(existsSync(PROMOTE_WORKFLOW_PATH)).toBe(true)
    const promoteWorkflow = stripComments(
      readFileSync(PROMOTE_WORKFLOW_PATH, 'utf-8')
    )

    expect(promoteWorkflow).toContain(`gh release upload ${tag} `)
    expect(promoteWorkflow).toContain('--clobber')
  })

  test('test 4: the promotion workflow triggers only on published releases', () => {
    expect(existsSync(PROMOTE_WORKFLOW_PATH)).toBe(true)
    const promoteWorkflow = stripComments(
      readFileSync(PROMOTE_WORKFLOW_PATH, 'utf-8')
    )

    expect(promoteWorkflow).toContain('types: [published]')
    expect(promoteWorkflow).not.toContain('types: [created]')
    expect(promoteWorkflow).not.toContain('types: [prereleased]')
  })

  test('test 5: the promotion workflow is guarded against re-triggering off the feed-holder release', () => {
    expect(existsSync(PROMOTE_WORKFLOW_PATH)).toBe(true)
    const promoteWorkflow = stripComments(
      readFileSync(PROMOTE_WORKFLOW_PATH, 'utf-8')
    )

    expect(promoteWorkflow).toContain(
      "startsWith(github.event.release.tag_name, 'v')"
    )
  })

  test('test 6: the feed-holder release stays a non-draft prerelease', () => {
    expect(existsSync(PROMOTE_WORKFLOW_PATH)).toBe(true)
    const promoteWorkflow = stripComments(
      readFileSync(PROMOTE_WORKFLOW_PATH, 'utf-8')
    )

    expect(promoteWorkflow).toContain('--prerelease')
    expect(promoteWorkflow).not.toContain('--draft')
  })

  test('test 7 (signature-integrity guard): the promotion workflow never holds the signing key or rewrites the manifest', () => {
    expect(existsSync(PROMOTE_WORKFLOW_PATH)).toBe(true)
    const promoteWorkflow = stripComments(
      readFileSync(PROMOTE_WORKFLOW_PATH, 'utf-8')
    )

    expect(promoteWorkflow).not.toContain('TAURI_SIGNING')
    expect(promoteWorkflow).not.toContain('jq ')
    expect(promoteWorkflow).not.toContain('sed ')
    expect(promoteWorkflow).not.toMatch(/>\s*[^\n]*latest\.json/)
  })

  test('test 8 (D-09 guard): release-tauri.yml still sets BOTH releaseDraft: true and prerelease: true', () => {
    const workflow = stripComments(readFileSync(RELEASE_WORKFLOW_PATH, 'utf-8'))

    expect(workflow).toContain('releaseDraft: true')
    expect(workflow).toContain('prerelease: true')
  })

  test('test 9: pre-existing updater invariants are unchanged (pubkey present, no Heroic reference)', () => {
    const conf = loadTauriConf()
    const plugins = conf.plugins as Record<string, unknown>
    const updater = plugins.updater as Record<string, unknown>

    expect(typeof updater.pubkey).toBe('string')
    expect((updater.pubkey as string).length).toBeGreaterThan(0)
    expect(JSON.stringify(conf)).not.toContain('Heroic-Games-Launcher')
  })
})
