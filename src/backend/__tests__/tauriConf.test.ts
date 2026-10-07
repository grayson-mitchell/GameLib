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
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  extractRunBlock,
  runStepScript,
  stripHashComments,
  substituteExpressions,
  writeStubExecutable
} from './helpers/workflowSteps'

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
  return stripHashComments(text)
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
    expect(bundle.targets).toEqual(
      expect.arrayContaining(['nsis', 'appimage', 'dmg'])
    )
  })

  // 2026-09-24 (quick-260924-f9y): `dmg` is NOT an updater-enabled target.
  // With `createUpdaterArtifacts: true` and no `app` target the bundler builds
  // no macOS updater artifact at all, so the updater manifest can never gain a
  // `darwin-*` platform -- observed on release run 35841476015, whose macOS leg
  // finished green (notarized, stapled, dmg uploaded) and still produced no
  // `GameLib.app.tar.gz`/`.sig` for the manifest to reference. The installed CLI
  // (@tauri-apps/cli 2.11.4) enumerates its updater-enabled targets in the
  // warning it emits for exactly this case: app, appimage, msi, nsis.
  //
  // Asserted separately from the target-set pin in
  // meta/__tests__/artifactTargets.test.ts so that dropping `app` fails a test
  // that NAMES what broke, rather than reading as a generic array mismatch.
  test('when createUpdaterArtifacts is true, bundle.targets includes the updater-enabled macOS target app', () => {
    const conf = loadTauriConf()
    const bundle = conf.bundle as Record<string, unknown>
    const targets = bundle.targets as string[]
    if (bundle.createUpdaterArtifacts === true) {
      expect(targets).toContain('app')
    }
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

/**
 * Quick task 261008-gf1 (todo 2026-10-05 "Set a restrictive CSP on the Tauri
 * webview"): `app.security.csp` was `null` with `withGlobalTauri: true`, so any
 * XSS in the main renderer reached `sidecar_invoke` unhindered. The policy is
 * derived from a census of what the renderer ACTUALLY loads (2026-10-08):
 *
 *   - scripts: the Vite bundle only (`<script type="module" src=...>`), plus
 *     Tauri's own injected scripts, which Tauri nonces/hashes itself
 *     (`tauri-2.11.5/src/manager/mod.rs set_csp`) -- so NO 'unsafe-inline' and
 *     NO 'unsafe-eval' in script-src. `withGlobalTauri`'s `bundle.global.js` is a
 *     webview initialization script, outside CSP entirely.
 *   - styles: the Vite CSS, MUI/emotion's runtime `<style>` injection, AND the
 *     user-facing Settings -> Custom CSS feature, which writes arbitrary CSS into
 *     `<style id="customCSS">` (`src/frontend/index.tsx setCustomCSS`). That
 *     feature is the reason style-src carries 'unsafe-inline'; it is a
 *     deliberate user-authored surface, not an oversight.
 *   - images: store artwork from whatever CDN each store hands back, SteamGridDB
 *     and `steamgrid.usebottles.com` results, user-entered sideload URLs, and
 *     the `data:` URL the backend returns for the login background. Not
 *     allow-listable by host without breaking artwork -- scheme-wide
 *     `https: http:` plus `data:` it is. `file:` is deliberately absent: no
 *     asset protocol is configured, so `file://` never loaded before either.
 *   - fonts: `NotoColorEmoji.subset.ttf` (bundled, 'self') AND the @fontsource
 *     Rubik/Cabin faces pulled in from node_modules -- one Cabin subset is under
 *     Vite's 4 KB `assetsInlineLimit` and ships as `url(data:font/woff2...)`.
 *     MISSED by the first census (it grepped `src/` for @font-face; the faces
 *     live in node_modules) and CAUGHT by the live gate: `font-src blocked data`
 *     in gamelib.log on the first bundled run. Hence `font-src 'self' data:`.
 *
 * LIVE-GATE FINDING #2, the Tauri nonce trap: tauri-codegen injects a nonce
 * attribute on EVERY <style> in the bundled index.html (`tauri-utils html.rs
 * inject_nonce(document, "style", ...)`) -- ours has `<style id="customCSS">` --
 * and at serve time `set_csp` appends the matching 'nonce-N' to style-src. Per
 * the CSP spec a nonce in a directive makes browsers IGNORE 'unsafe-inline' in
 * that same directive, so MUI/emotion's runtime <style> injection was blocked
 * (`style-src-elem blocked inline`, twice on the startup path) even though the
 * config said 'unsafe-inline'. `dangerousDisableAssetCspModification:
 * ["style-src"]` tells Tauri to leave style-src alone; it does NOT weaken the
 * policy we set, it stops Tauri from adding the one token that neutralised it.
 * script-src stays Tauri-managed.
 *   - connect: every `window.api.*` call is a Tauri `invoke`, which on desktop
 *     is `fetch('ipc://localhost/...')` (Windows: `http://ipc.localhost`) --
 *     `tauri-2.11.5/scripts/ipc-protocol.js` -- so connect-src MUST carry
 *     `ipc: http://ipc.localhost` or every invoke dies. i18n locale JSON is a
 *     relative fetch ('self'). The ONE direct remote call in the renderer is
 *     SideloadDialog's `axios.get('https://steamgrid.usebottles.com/...')`.
 *   - frames / objects / workers: none. Store embeds and login windows are
 *     NATIVE child webviews loading remote URLs -- not iframes, and Tauri does
 *     not apply this policy to remote documents at all.
 *
 * Scope fact that bounds the live gate: Tauri applies the CSP only to HTML it
 * serves itself (`manager/mod.rs get_asset` -> `tauri://` response header, or a
 * `<meta>` on Linux). With `build.devUrl` set, `tauri dev` serves nothing through
 * Tauri, so NO policy applies in dev and `devCsp` would be inert -- which is why
 * it is not set. The policy is live only in a bundled build
 * (`pnpm tauri:dev:packaged` / `tauri build`).
 */
describe('tauri.conf.json content security policy (quick task 261008-gf1)', () => {
  function loadCsp(): Record<string, string> {
    const conf = loadTauriConf()
    const app = conf.app as Record<string, unknown>
    const security = app.security as Record<string, unknown>
    return security.csp as Record<string, string>
  }

  function sources(directive: string): string[] {
    const value = loadCsp()[directive]
    expect(typeof value).toBe('string')
    return value.split(/\s+/).filter(Boolean)
  }

  test('app.security.csp is a directive map, not null and not a single string', () => {
    const csp = loadCsp()
    expect(csp).not.toBeNull()
    expect(typeof csp).toBe('object')
  })

  test("default-src is exactly 'self'", () => {
    expect(sources('default-src')).toEqual(["'self'"])
  })

  test("script-src is exactly 'self' -- no 'unsafe-inline', no 'unsafe-eval', no remote host (Tauri adds its own nonces/hashes at serve time)", () => {
    expect(sources('script-src')).toEqual(["'self'"])
  })

  test("font-src is exactly 'self' data: -- the @fontsource Cabin subset is Vite-inlined as a data: URL (live-gate finding #1)", () => {
    expect(sources('font-src')).toEqual(["'self'", 'data:'])
  })

  test("dangerousDisableAssetCspModification is exactly ['style-src'] -- Tauri's injected style nonce would otherwise nullify 'unsafe-inline' and block MUI's runtime <style> (live-gate finding #2); script-src stays Tauri-managed", () => {
    const conf = loadTauriConf()
    const app = conf.app as Record<string, unknown>
    const security = app.security as Record<string, unknown>
    expect(security.dangerousDisableAssetCspModification).toEqual(['style-src'])
  })

  test("style-src carries 'unsafe-inline' (the Settings -> Custom CSS feature writes into a <style>) and nothing remote", () => {
    const src = sources('style-src')
    expect(src).toContain("'self'")
    expect(src).toContain("'unsafe-inline'")
    expect(src.filter((s) => !s.startsWith("'"))).toEqual([])
  })

  test('connect-src carries BOTH Tauri IPC origins -- without them every window.api call fails in a bundled build', () => {
    const src = sources('connect-src')
    expect(src).toContain('ipc:')
    expect(src).toContain('http://ipc.localhost')
  })

  test("connect-src carries 'self' (i18n locale JSON) and the one direct remote call the renderer makes (steamgrid.usebottles.com), and no scheme-wide https:", () => {
    const src = sources('connect-src')
    expect(src).toContain("'self'")
    expect(src).toContain('https://steamgrid.usebottles.com')
    expect(src).not.toContain('https:')
    expect(src).not.toContain('http:')
  })

  test("img-src allows 'self', data:, https: and http: -- store artwork comes from arbitrary CDNs and the login background is a data: URL", () => {
    expect(sources('img-src')).toEqual(["'self'", 'data:', 'https:', 'http:'])
  })

  test("object-src, frame-src and worker-src are 'none' -- the renderer uses none of them; embeds are native child webviews", () => {
    expect(sources('object-src')).toEqual(["'none'"])
    expect(sources('frame-src')).toEqual(["'none'"])
    expect(sources('worker-src')).toEqual(["'none'"])
  })

  test("base-uri and form-action are 'self'", () => {
    expect(sources('base-uri')).toEqual(["'self'"])
    expect(sources('form-action')).toEqual(["'self'"])
  })

  test("no directive anywhere carries 'unsafe-eval'", () => {
    for (const [directive, value] of Object.entries(loadCsp())) {
      expect({
        directive,
        hasUnsafeEval: value.includes("'unsafe-eval'")
      }).toEqual({ directive, hasUnsafeEval: false })
    }
  })

  test('devCsp is NOT set -- with build.devUrl present it would be inert, and a present-but-inert key invites someone to trust it', () => {
    const conf = loadTauriConf()
    const app = conf.app as Record<string, unknown>
    const security = app.security as Record<string, unknown>
    const build = conf.build as Record<string, unknown>
    expect(typeof build.devUrl).toBe('string')
    expect(security).not.toHaveProperty('devCsp')
  })

  test('the renderer forwards CSP violations to the sidecar log (src/frontend/index.tsx listens for securitypolicyviolation and calls window.api.logError)', () => {
    const entry = readFileSync(
      join(__dirname, '..', '..', 'frontend', 'index.tsx'),
      'utf8'
    )
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n')
    const start = entry.indexOf("addEventListener('securitypolicyviolation'")
    expect(start).toBeGreaterThan(-1)
    expect(entry.slice(start, start + 400)).toMatch(/window\.api\.logError\(/)
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

/**
 * 34-REVIEW.md (gap cycle 2) WR-07: the promotion workflow's download step treated EVERY
 * non-zero `gh release download` exit as "no asset, nothing to promote" -- an expired
 * token, a 5xx, a rate limit or a network fault all set found=false, skipped every
 * downstream step and left the job green, while printing a ::notice:: asserting a cause
 * that may be false. Because this workflow is the sole mechanism keeping
 * /releases/download/updater/latest.json current, that silently pins every installed
 * client to the previous manifest forever.
 *
 * These tests EXECUTE the step's real shell body against a stubbed `gh` on PATH, so they
 * distinguish the three outcomes by behaviour rather than by text shape.
 */
const GH_STUB = `#!/usr/bin/env bash
set -u
echo "$*" >> gh-calls.log
CMD="\${1:-}"
SUB="\${2:-}"
ARG="\${3:-}"
DIR="."
while [ $# -gt 0 ]; do
  if [ "$1" = "--dir" ]; then
    DIR="\${2:-.}"
  fi
  shift
done
if [ "$CMD" = "release" ] && [ "$SUB" = "view" ]; then
  if [ "\${GH_STUB_VIEW_STATUS:-0}" != "0" ]; then
    echo "gh: could not reach the API" >&2
    exit "\${GH_STUB_VIEW_STATUS}"
  fi
  printf '%s' "\${GH_STUB_ASSETS:-}"
  exit 0
fi
if [ "$CMD" = "release" ] && [ "$SUB" = "download" ]; then
  if [ "$ARG" = "updater" ]; then
    if [ -z "\${GH_STUB_CURRENT_MANIFEST:-}" ]; then
      echo "release not found" >&2
      exit 1
    fi
    mkdir -p "$DIR"
    printf '%s' "$GH_STUB_CURRENT_MANIFEST" > "$DIR/latest.json"
    exit 0
  fi
  if [ "\${GH_STUB_DOWNLOAD_STATUS:-0}" != "0" ]; then
    exit "\${GH_STUB_DOWNLOAD_STATUS}"
  fi
  mkdir -p "$DIR"
  printf '%s' "\${GH_STUB_MANIFEST:-{}}" > "$DIR/latest.json"
  exit 0
fi
if [ "$CMD" = "release" ] && [ "$SUB" = "upload" ]; then
  exit 0
fi
echo "unexpected gh invocation" >&2
exit 99
`

const DOWNLOAD_STEP_NAME = 'Download latest.json from the published release'
const describeOnPosix = process.platform === 'win32' ? describe.skip : describe

describeOnPosix(
  'promote-updater-feed.yml download step, executed (WR-07 regression guard)',
  () => {
    let workdir: string
    let binDir: string

    beforeEach(() => {
      workdir = mkdtempSync(join(tmpdir(), 'gamelib-promote-'))
      binDir = join(workdir, 'stub-bin')
      mkdirSync(binDir, { recursive: true })
      writeStubExecutable(binDir, 'gh', GH_STUB)
    })

    afterEach(() => {
      rmSync(workdir, { recursive: true, force: true })
    })

    function runDownloadStep(env: Record<string, string>): {
      status: number | null
      stdout: string
      outputs: string
      ghCalls: string
    } {
      const script = substituteExpressions(
        extractRunBlock(
          readFileSync(PROMOTE_WORKFLOW_PATH, 'utf-8'),
          DOWNLOAD_STEP_NAME
        ),
        { 'github.event.release.tag_name': 'v0.7.0' }
      )
      const outputPath = join(workdir, 'github-output')
      writeFileSync(outputPath, '')
      const result = runStepScript(script, workdir, {
        GITHUB_OUTPUT: outputPath,
        TAG: 'v0.7.0',
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        ...env
      })
      const ghCallsPath = join(workdir, 'gh-calls.log')
      return {
        status: result.status,
        stdout: result.stdout,
        outputs: readFileSync(outputPath, 'utf-8'),
        ghCalls: existsSync(ghCallsPath)
          ? readFileSync(ghCallsPath, 'utf-8')
          : ''
      }
    }

    test('a release that really carries latest.json is downloaded and marked found=true', () => {
      const result = runDownloadStep({
        GH_STUB_ASSETS: JSON.stringify({
          assets: [
            { name: 'latest.json' },
            { name: 'GameLib_0.7.0_amd64.AppImage' }
          ]
        }),
        GH_STUB_MANIFEST: JSON.stringify({ version: '0.7.0' })
      })
      expect(result.status).toBe(0)
      expect(result.outputs).toContain('found=true')
      expect(existsSync(join(workdir, 'feed', 'latest.json'))).toBe(true)
    })

    test('an Electron-only release (no latest.json asset) skips quietly and stays green', () => {
      const result = runDownloadStep({
        GH_STUB_ASSETS: JSON.stringify({
          assets: [{ name: 'GameLib-0.7.0-macOS-arm64.dmg' }]
        })
      })
      expect(result.status).toBe(0)
      expect(result.outputs).toContain('found=false')
      expect(result.stdout).toContain('::notice::')
      // It must not even attempt the download when the asset is known absent.
      expect(result.ghCalls).not.toContain('release download')
    })

    test('WR-07: an unreadable release (auth/network/rate-limit) FAILS the job instead of reporting "nothing to promote"', () => {
      const result = runDownloadStep({ GH_STUB_VIEW_STATUS: '1' })
      expect(result.status).not.toBe(0)
      expect(result.stdout).toContain('::error::')
      // The misleading "nothing to promote" NOTICE must not be emitted for an
      // API failure -- only the error is.
      expect(result.stdout).not.toContain('::notice::')
      expect(result.outputs).not.toContain('found=')
    })

    test('WR-07: an API failure never silently marks the feed as up to date', () => {
      const result = runDownloadStep({ GH_STUB_VIEW_STATUS: '8' })
      expect(result.status).not.toBe(0)
      expect(result.outputs).not.toContain('found=true')
      expect(existsSync(join(workdir, 'feed', 'latest.json'))).toBe(false)
    })

    test('a download that fails AFTER the asset was confirmed present still fails the job', () => {
      const result = runDownloadStep({
        GH_STUB_ASSETS: JSON.stringify({ assets: [{ name: 'latest.json' }] }),
        GH_STUB_DOWNLOAD_STATUS: '1'
      })
      expect(result.status).not.toBe(0)
      expect(result.outputs).not.toContain('found=true')
    })
  }
)

/**
 * 34-REVIEW.md (gap cycle 2) WR-08: the promotion's only guard was the `v*` tag prefix.
 * Since release-tauri.yml creates DRAFT releases held for human review (D-09), drafts
 * accumulate and can be published out of order -- each publish unconditionally clobbered
 * the feed, so an older manifest could silently replace a newer one (tauri-plugin-updater
 * refuses to INSTALL a downgrade, so nothing alarms; the feed just stops advertising the
 * newest build). Nothing checked that the promoted manifest's own version matched the tag
 * it came from either.
 */
const PUBLISH_STEP_NAME = 'Publish the manifest to the stable feed location'

describeOnPosix(
  'promote-updater-feed.yml publish step, executed (WR-08 regression guard)',
  () => {
    let workdir: string
    let binDir: string

    beforeEach(() => {
      workdir = mkdtempSync(join(tmpdir(), 'gamelib-publish-'))
      binDir = join(workdir, 'stub-bin')
      mkdirSync(binDir, { recursive: true })
      writeStubExecutable(binDir, 'gh', GH_STUB)
      mkdirSync(join(workdir, 'feed'), { recursive: true })
    })

    afterEach(() => {
      rmSync(workdir, { recursive: true, force: true })
    })

    function runPublishStep(options: {
      newVersion: string | null
      currentVersion?: string
      tag?: string
    }): {
      status: number | null
      stdout: string
      outputs: string
      uploaded: boolean
    } {
      const tag = options.tag ?? `v${options.newVersion ?? '0.0.0'}`
      writeFileSync(
        join(workdir, 'feed', 'latest.json'),
        JSON.stringify(
          options.newVersion === null
            ? { notes: 'no version here' }
            : { version: options.newVersion }
        )
      )
      const script = substituteExpressions(
        extractRunBlock(
          readFileSync(PROMOTE_WORKFLOW_PATH, 'utf-8'),
          PUBLISH_STEP_NAME
        ),
        { 'github.event.release.tag_name': tag }
      )
      const outputPath = join(workdir, 'github-output')
      writeFileSync(outputPath, '')
      const env: Record<string, string> = {
        GITHUB_OUTPUT: outputPath,
        TAG: tag,
        PATH: `${binDir}:${process.env.PATH ?? ''}`
      }
      if (options.currentVersion !== undefined) {
        env.GH_STUB_CURRENT_MANIFEST = JSON.stringify({
          version: options.currentVersion
        })
      }
      const result = runStepScript(script, workdir, env)
      const ghCallsPath = join(workdir, 'gh-calls.log')
      const ghCalls = existsSync(ghCallsPath)
        ? readFileSync(ghCallsPath, 'utf-8')
        : ''
      return {
        status: result.status,
        stdout: result.stdout,
        outputs: readFileSync(outputPath, 'utf-8'),
        uploaded: ghCalls.includes('release upload updater')
      }
    }

    test('a newer manifest is promoted over the current feed version', () => {
      const result = runPublishStep({
        newVersion: '0.7.0',
        currentVersion: '0.6.0'
      })
      expect(result.status).toBe(0)
      expect(result.uploaded).toBe(true)
      expect(result.outputs).toContain('promoted=true')
    })

    test('WR-08: an OLDER manifest is refused, leaving the newer feed in place', () => {
      const result = runPublishStep({
        newVersion: '0.7.0',
        currentVersion: '0.8.0'
      })
      expect(result.status).toBe(0)
      expect(result.uploaded).toBe(false)
      expect(result.outputs).toContain('promoted=false')
      expect(result.stdout).toContain('::warning::')
    })

    test('WR-08: version ordering is semantic, not lexicographic (0.10.0 beats 0.9.0)', () => {
      const older = runPublishStep({
        newVersion: '0.9.0',
        currentVersion: '0.10.0'
      })
      expect(older.uploaded).toBe(false)

      const newer = runPublishStep({
        newVersion: '0.10.0',
        currentVersion: '0.9.0'
      })
      expect(newer.uploaded).toBe(true)
    })

    test('the first ever promotion (no feed-holder release yet) uploads unconditionally', () => {
      const result = runPublishStep({ newVersion: '0.7.0' })
      expect(result.status).toBe(0)
      expect(result.uploaded).toBe(true)
      expect(result.outputs).toContain('promoted=true')
    })

    test('re-promoting the SAME version is allowed (byte-identical, idempotent clobber)', () => {
      const result = runPublishStep({
        newVersion: '0.7.0',
        currentVersion: '0.7.0'
      })
      expect(result.status).toBe(0)
      expect(result.uploaded).toBe(true)
    })

    test('WR-08: a manifest whose version does not match the published tag is flagged', () => {
      const result = runPublishStep({
        newVersion: '0.6.0',
        currentVersion: '0.5.0',
        tag: 'v0.7.0'
      })
      expect(result.stdout).toContain('::warning::')
      expect(result.stdout).toContain('0.6.0')
      // Still promoted -- a prerelease tag legitimately differs from the version.
      expect(result.uploaded).toBe(true)
    })

    test('a matching tag/version pair promotes without any warning', () => {
      const result = runPublishStep({
        newVersion: '0.7.0',
        currentVersion: '0.6.0',
        tag: 'v0.7.0'
      })
      expect(result.stdout).not.toContain('::warning::')
      expect(result.uploaded).toBe(true)
    })

    test('a manifest with no version field is refused rather than promoted blind', () => {
      const result = runPublishStep({
        newVersion: null,
        currentVersion: '0.6.0'
      })
      expect(result.status).not.toBe(0)
      expect(result.stdout).toContain('::error::')
      expect(result.uploaded).toBe(false)
    })
  }
)

/**
 * 34-REVIEW.md (gap cycle 2) WR-09: the "audit trail" step was a bare
 * `sha256sum feed/latest.json` -- one line into an expiring job log, compared against
 * nothing, asserted by no test, with the upload happening two steps later with no re-hash.
 * It read as a control while detecting nothing. The digest is now exported and re-checked
 * against what the feed actually serves after the upload.
 *
 * `sha256sum` is a GNU coreutils tool present on the ubuntu-24.04 runner this job uses;
 * macOS dev machines ship `shasum` instead, so a byte-compatible shim is installed on
 * PATH when the real binary is absent. The workflow instructions themselves are executed
 * verbatim either way.
 */
const DIGEST_STEP_NAME = 'Record the manifest checksum (audit trail)'
const VERIFY_STEP_NAME = 'Verify the promoted feed round-trips byte-identically'

const SHA256SUM_SHIM = `#!/usr/bin/env bash
shasum -a 256 "$@"
`

describeOnPosix(
  'promote-updater-feed.yml checksum audit trail, executed (WR-09 regression guard)',
  () => {
    let workdir: string
    let binDir: string

    beforeEach(() => {
      workdir = mkdtempSync(join(tmpdir(), 'gamelib-digest-'))
      binDir = join(workdir, 'stub-bin')
      mkdirSync(binDir, { recursive: true })
      writeStubExecutable(binDir, 'gh', GH_STUB)
      if (runStepScript('command -v sha256sum', workdir).status !== 0) {
        writeStubExecutable(binDir, 'sha256sum', SHA256SUM_SHIM)
      }
      mkdirSync(join(workdir, 'feed'), { recursive: true })
    })

    afterEach(() => {
      rmSync(workdir, { recursive: true, force: true })
    })

    function stepEnv(
      extra: Record<string, string> = {}
    ): Record<string, string> {
      return {
        TAG: 'v0.7.0',
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        ...extra
      }
    }

    function runStep(
      stepName: string,
      env: Record<string, string>
    ): {
      status: number | null
      stdout: string
      outputs: string
      summary: string
    } {
      const script = substituteExpressions(
        extractRunBlock(readFileSync(PROMOTE_WORKFLOW_PATH, 'utf-8'), stepName),
        {
          'github.event.release.tag_name': 'v0.7.0',
          'steps.digest.outputs.sha256': env.EXPECTED_SHA256 ?? ''
        }
      )
      const outputPath = join(workdir, `github-output-${Math.random()}`)
      const summaryPath = join(workdir, `github-summary-${Math.random()}`)
      writeFileSync(outputPath, '')
      writeFileSync(summaryPath, '')
      const result = runStepScript(script, workdir, {
        ...env,
        GITHUB_OUTPUT: outputPath,
        GITHUB_STEP_SUMMARY: summaryPath
      })
      return {
        status: result.status,
        stdout: result.stdout,
        outputs: readFileSync(outputPath, 'utf-8'),
        summary: readFileSync(summaryPath, 'utf-8')
      }
    }

    /** sha256 of the manifest bytes the tests write, computed independently. */
    function digestOf(contents: string): string {
      return createHash('sha256').update(contents).digest('hex')
    }

    test('WR-09: the digest is exported as a step output, not just printed to a log', () => {
      const manifest = JSON.stringify({ version: '0.7.0' })
      writeFileSync(join(workdir, 'feed', 'latest.json'), manifest)
      const result = runStep(DIGEST_STEP_NAME, stepEnv())
      expect(result.status).toBe(0)
      expect(result.outputs).toContain(`sha256=${digestOf(manifest)}`)
    })

    test('WR-09: the digest is persisted to the run summary, not an expiring job log', () => {
      const manifest = JSON.stringify({ version: '0.7.0' })
      writeFileSync(join(workdir, 'feed', 'latest.json'), manifest)
      const result = runStep(DIGEST_STEP_NAME, stepEnv())
      expect(result.summary).toContain(digestOf(manifest))
      expect(result.summary).toContain('v0.7.0')
    })

    test('WR-09: the promoted feed is re-hashed and accepted when it matches', () => {
      const manifest = JSON.stringify({ version: '0.7.0' })
      const result = runStep(
        VERIFY_STEP_NAME,
        stepEnv({
          EXPECTED_SHA256: digestOf(manifest),
          GH_STUB_CURRENT_MANIFEST: manifest
        })
      )
      expect(result.status).toBe(0)
      expect(result.summary).toContain(digestOf(manifest))
    })

    test('WR-09: a feed serving DIFFERENT bytes than were recorded fails the job', () => {
      const recorded = JSON.stringify({ version: '0.7.0' })
      const served = JSON.stringify({ version: '0.7.0', tampered: true })
      const result = runStep(
        VERIFY_STEP_NAME,
        stepEnv({
          EXPECTED_SHA256: digestOf(recorded),
          GH_STUB_CURRENT_MANIFEST: served
        })
      )
      expect(result.status).not.toBe(0)
      expect(result.stdout).toContain('::error::')
    })

    test('WR-09: the verify step is gated on an actual promotion having happened', () => {
      const promote = stripComments(
        readFileSync(PROMOTE_WORKFLOW_PATH, 'utf-8')
      )
      expect(promote).toContain("steps.publish.outputs.promoted == 'true'")
      // ...and it must run AFTER the upload, or it would verify stale bytes.
      expect(promote.indexOf('gh release upload updater')).toBeLessThan(
        promote.indexOf(VERIFY_STEP_NAME)
      )
    })
  }
)
