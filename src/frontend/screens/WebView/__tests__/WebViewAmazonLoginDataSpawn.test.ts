/**
 * Source-text structural gate for quick task 260806-teb Task 1: the Tauri path no longer
 * spawns `nile auth --login --non-interactive` a second time on the `/loginweb/nile` route.
 *
 * THE COST BEING DEFENDED
 *
 * `nile` is one of the vendored PyInstaller `--onefile` runners. Memory
 * `pyinstaller-onefile-spawn-tax` records it hardware-measured at ~12.8s per invocation on
 * macOS (36 ad-hoc-signed Mach-O files re-extracted to a randomly-named `$TMPDIR/_MEIxxxxxx`,
 * defeating the Gatekeeper assessment cache). This is NOT a dev-build artifact -- it reproduces
 * in a signed production build. The only in-repo lever is call-count reduction.
 *
 * Under Tauri, routing to `/loginweb/nile` used to fire that spawn TWICE, from two
 * independent effects in the same component tree: this file's own `/loginweb/nile` effect
 * (whose `amazonLoginData` result feeds only Electron-only consumers -- the `<webview>` `src`
 * and `handleAmazonLogin`, both unreachable under Tauri) and `useTauriOAuthLogin.ts`'s own
 * `getAmazonLoginData()` call (the real path, whose `.url` actually opens the sign-in window).
 * Both fired on mount, concurrently, contending on the same amfid Gatekeeper scan storm, and
 * the sign-in window could not open until the second one resolved.
 *
 * WHAT THIS GATE DOES NOT PROVE
 *
 * That a live login is faster. This is a source-text structural gate, not a timing
 * measurement -- proving the real timing improvement needs a live session (quick task
 * 260806-teb's checkpoint task).
 *
 * WHY A SOURCE-TEXT GATE
 *
 * Nothing in this tree imports `WebView/index.tsx` -- no jsdom/react-test-renderer is
 * installed, and the module graph reaches `window` at import time.
 * `WebViewOAuthNavigation.test.ts` is the established precedent for gating this exact file via
 * its source text; this follows that structure, including its self-test-against-synthetic-
 * regressed-sources anti-vacuity requirement.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const indexPath = join(__dirname, '..', 'index.tsx')

/** Extracts the effect body whose marker appears first, sliced up to the effect's closing
 * `}, [pathname])`. Mirrors WebViewOAuthNavigation.test.ts's own brace-balanced extraction
 * approach, but this effect's own closing dependency array is a simpler, more precise anchor
 * than a generic balanced-brace scan (this effect body itself contains a nested `.then(() =>
 * {...})` whose own braces would otherwise need to be walked through). */
function extractNileEffectBody(source: string): string {
  const marker = "pathname !== '/loginweb/nile'"
  const markerIdx = source.indexOf(marker)
  if (markerIdx === -1) throw new Error(`marker not found: ${marker}`)
  const closeMarker = '}, [pathname])'
  const closeIdx = source.indexOf(closeMarker, markerIdx)
  if (closeIdx === -1)
    throw new Error(`closing marker not found after: ${marker}`)
  return source.slice(markerIdx, closeIdx + closeMarker.length)
}

describe('WebView /loginweb/nile effect -- Tauri no longer spawns nile a second time (quick task 260806-teb)', () => {
  const rawSource = readFileSync(indexPath, 'utf-8')
  const source = stripSourceComments(rawSource)
  const effectBody = extractNileEffectBody(source)

  it('contains an isTauri() early-return guard', () => {
    expect(effectBody).toContain('isTauri()')
  })

  it('positions the isTauri() guard BEFORE the amazon.getLoginData() call', () => {
    const guardIdx = effectBody.indexOf('isTauri()')
    const fetchIdx = effectBody.indexOf('amazon.getLoginData()')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(fetchIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(fetchIdx)
  })

  it('amazon.getLoginData() appears exactly once in the whole file -- no second call site was added elsewhere', () => {
    const matches = source.match(/amazon\.getLoginData\(\)/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it('keeps the Electron loading-indicator setLoading call inside the SAME guarded effect body', () => {
    expect(effectBody).toContain("t('status.preparing_login'")
  })

  it('the raw (non-stripped) source still names the guard rationale in a comment, for a future reader', () => {
    // Checked against the RAW source (not the comment-stripped copy) -- this assertion's whole
    // point is that the comment itself still exists, not its content structure.
    expect(rawSource).toMatch(/spawn[\s\S]*nile auth|nile auth[\s\S]*spawn/i)
  })

  describe('self-test (anti-vacuity)', () => {
    it('the gate FAILS against a synthetic source with the isTauri() guard removed', () => {
      const regressed = `
        pathname !== '/loginweb/nile') return
        console.log('Loading amazon login data')
        setLoading({ refresh: true, message: t('status.preparing_login', 'x') })
        amazon.getLoginData().then((data) => {
          setAmazonLoginData(data)
        }, [pathname])
      `
      expect(regressed).not.toContain('isTauri()')
    })

    it('the gate FAILS against a synthetic source where the guard is placed AFTER getLoginData()', () => {
      const regressed = `
        pathname !== '/loginweb/nile') return
        setLoading({ refresh: true, message: t('status.preparing_login', 'x') })
        amazon.getLoginData().then((data) => {
          setAmazonLoginData(data)
        })
        if (isTauri()) return
      }, [pathname])
      `
      const guardIdx = regressed.indexOf('isTauri()')
      const fetchIdx = regressed.indexOf('amazon.getLoginData()')
      expect(guardIdx).toBeGreaterThan(-1)
      expect(fetchIdx).toBeGreaterThan(-1)
      // In the regressed source the guard comes AFTER the fetch -- the ordering assertion
      // above would fail against this, proving the real gate is non-vacuous.
      expect(guardIdx).toBeGreaterThan(fetchIdx)
    })
  })
})
