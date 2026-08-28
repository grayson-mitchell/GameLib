/**
 * Phase 35, plan 35-12 -- D-11: the artifact target set is pinned so the
 * reduction cannot silently drift back.
 *
 * What D-11 decided, and in which direction each half is intentional:
 *
 *  - The **Flatpak/Flathub publishing path was DELETED, not deferred.** The
 *    `flatpak/` tree, `flathub/update-flathub.ts`, the five `package.json`
 *    scripts that drove them (`dist:flatpak`, `flatpak:build`,
 *    `flatpak:prepare`, `flatpak:prepare-release`, `release:updateFlathub:ci`)
 *    and both CI workflows (`flatpak-build.yml`, `release_flathub.yml`) were
 *    built around `com.heroicgameslauncher.hgl` and Heroic's Flathub identity,
 *    which GameLib cannot publish under. If a Flatpak channel ever returns it
 *    is its own project, under its own identity -- not a revert of this commit.
 *
 *  - **deb/rpm/pacman/tar.xz were DEFERRED**, not deleted. Adding one back is a
 *    one-line change to `bundle.targets`. This test therefore pins the exact
 *    array so that such a change is a deliberate, visible edit that also
 *    updates this file -- it is a tripwire, not a prohibition.
 *
 * The over-reach control below exists because D-11 reduced the *Linux* target
 * set. A future edit that read it as "reduce all targets" and dropped `nsis` or
 * `dmg` would pass every other assertion here while silently retiring Windows
 * or macOS packaging. This repo has learned that an absence assertion audited
 * in only one direction misses the other entirely.
 *
 * SCOPE NOTE -- read before "finishing the cleanup" with a broader grep.
 * The token `flatpak` still appears ~119 times in `src/` and
 * `public/locales/`, and that is CORRECT. Those are *runtime host detection*
 * (`isFlatpak`, `flatpakHome`, `flatpakRuntimeVersion`, the Steam-installed-
 * via-Flatpak probe in `backend/config.ts`, and the Gamescope/MangoHud
 * "install the flatpak package" user strings) -- i.e. GameLib noticing it is
 * *running inside* a Flatpak, or that the user's Steam is a Flatpak. That is a
 * different concern from GameLib *publishing* a Flatpak, and D-11 says nothing
 * about it. The assertions below are deliberately scoped to the publishing
 * path so this test does not become a lever for deleting live behaviour.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(__dirname, '..', '..')
const TAURI_CONF_PATH = join(REPO_ROOT, 'src-tauri', 'tauri.conf.json')
const PACKAGE_JSON_PATH = join(REPO_ROOT, 'package.json')
const WORKFLOWS_DIR = join(REPO_ROOT, '.github', 'workflows')

/**
 * The intended artifact set, in the order `tauri.conf.json` declares it.
 * nsis -> Windows, appimage -> Linux, dmg -> macOS.
 */
const EXPECTED_TARGETS = ['nsis', 'appimage', 'dmg']

/**
 * Tokens that name the *publishing* path specifically. Deliberately narrower
 * than a bare /flatpak/ -- see the SCOPE NOTE in the header. `flatpak-builder`
 * and `flatpak:` (the script-name prefix) cannot appear in runtime host
 * detection, whereas `flatpak` alone appears there constantly.
 *
 * The `i` flag is load-bearing and was added because the mutation run caught
 * this gate failing OPEN without it: the real deleted script was
 * `release:updateFlathub:ci` and the real deleted workflow was named
 * "Draft Release Flathub" -- both spell it `Flathub` with a capital F, which a
 * case-sensitive /flathub/ silently does not match. Do not drop the flag.
 */
const PUBLISHING_PATH_PATTERN =
  /flathub|flatpak-builder|flatpak:prepare|flatpak:build|dist:flatpak|prepareFlatpak/i

type TauriConf = { bundle?: { targets?: unknown } }

const readTauriConf = (): TauriConf =>
  JSON.parse(readFileSync(TAURI_CONF_PATH, 'utf-8')) as TauriConf

const readScripts = (): Record<string, string> => {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8')) as {
    scripts?: Record<string, string>
  }
  return pkg.scripts ?? {}
}

describe('D-11: artifact target set is pinned to nsis/appimage/dmg', () => {
  it('bundle.targets deep-equals the exact intended array (not merely includes appimage)', () => {
    const targets = readTauriConf().bundle?.targets

    // Deep equality, not membership: a list that grew back to include `deb`
    // and `rpm` would pass an `includes('appimage')` check.
    expect(targets).toEqual(EXPECTED_TARGETS)
  })

  it('OVER-REACH CONTROL: nsis and dmg survive -- D-11 reduced the LINUX set only', () => {
    const targets = readTauriConf().bundle?.targets as string[]

    // Asserted separately from the deep-equal above so that a failure here
    // reads as "Windows/macOS packaging was dropped" rather than as a generic
    // array mismatch. This is the direction a sweep audited only for
    // under-reach misses entirely.
    expect(targets).toContain('nsis')
    expect(targets).toContain('dmg')
  })

  it('exactly one Linux target ships, and it is appimage', () => {
    const targets = readTauriConf().bundle?.targets as string[]
    const linuxTargets = targets.filter((t) =>
      ['appimage', 'deb', 'rpm', 'pacman', 'tar.xz', 'flatpak'].includes(t)
    )

    expect(linuxTargets).toEqual(['appimage'])
  })
})

describe('D-11: the Flatpak/Flathub publishing path stays deleted', () => {
  it('neither flatpak/ nor flathub/ exists on disk', () => {
    expect(existsSync(join(REPO_ROOT, 'flatpak'))).toBe(false)
    expect(existsSync(join(REPO_ROOT, 'flathub'))).toBe(false)
  })

  it('no package.json script invokes the deleted publishing path', () => {
    const offenders = Object.entries(readScripts())
      .filter(([, value]) => PUBLISHING_PATH_PATTERN.test(value))
      .map(([name, value]) => `${name}: ${value}`)

    expect(offenders).toEqual([])
  })

  it('the five deleted script names do not come back', () => {
    const scripts = readScripts()

    // Named individually because `dist:flatpak` chained into `flatpak:prepare`
    // and `flatpak:build`; re-adding any one of them resurrects a broken chain.
    for (const name of [
      'dist:flatpak',
      'flatpak:build',
      'flatpak:prepare',
      'flatpak:prepare-release',
      'release:updateFlathub:ci'
    ]) {
      expect(scripts).not.toHaveProperty(name)
    }
  })

  it('the electron-builder release scripts are NOT collateral damage of this deletion', () => {
    const scripts = readScripts()

    // Plan 35-14 owns these. If they vanish, it must be that plan doing it
    // deliberately -- not a widened flatpak sweep.
    for (const name of ['release:linux', 'release:mac', 'release:win']) {
      expect(scripts).toHaveProperty(name)
    }
  })

  it('no CI workflow references the deleted publishing path', () => {
    const offenders = readdirSync(WORKFLOWS_DIR)
      .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
      .filter((file) =>
        PUBLISHING_PATH_PATTERN.test(
          readFileSync(join(WORKFLOWS_DIR, file), 'utf-8')
        )
      )

    expect(offenders).toEqual([])
  })
})
