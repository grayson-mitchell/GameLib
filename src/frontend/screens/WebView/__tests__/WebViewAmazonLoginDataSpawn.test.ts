/**
 * Source-text structural gate for quick task 260806-teb Task 1, extended by Phase 35 plan
 * 17: the `/loginweb/nile` effect in `WebView/index.tsx` no longer spawns
 * `nile auth --login --non-interactive` AT ALL.
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
 * (whose `amazonLoginData` result fed only Electron-only consumers -- the `<webview>` `src`
 * and `handleAmazonLogin`, both unreachable under Tauri) and `useTauriOAuthLogin.ts`'s own
 * `getAmazonLoginData()` call (the real path, whose `.url` actually opens the sign-in window).
 * Quick task 260806-teb fixed this by gating this effect's own fetch behind a Tauri-context
 * early return, dropping the count from two calls to one.
 *
 * Phase 35 plan 17: Tauri is the only shell now, so that guard always evaluated true -- the
 * body it gated (this effect's own login-data fetch AND its Electron-only consumers) was
 * permanently dead code and has been deleted outright, not collapsed to unconditional.
 * Collapsing it to unconditional would have REINTRODUCED the double-spawn this file's gate
 * exists to prevent -- the guard's condition was always true, but ITS BODY, if kept
 * unconditional, would have started running for real. This gate is rewritten to assert the
 * resulting STRONGER invariant: zero calls in this effect, not one guarded call.
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
 *
 * Phase 40 Plan 01 (REQ-40-10). Verdict: RE-POINT, no functional change needed. This plan
 * retired Model A wholesale from `WebView/index.tsx` (deleted the `<webview>` render, its
 * `handleAmazonLogin`, and the surrounding conditional structure this effect's rationale
 * references), which raised the question of whether this gate's markers still exist at the
 * same relative position and its invariant still holds. Measured directly against the
 * rewritten file rather than assumed: the `/loginweb/nile` effect (`extractNileEffectBody`'s
 * `pathname !== '/loginweb/nile'` ... `}, [pathname])` markers) is untouched -- it was already
 * a no-op effect body pre-dating this plan (Phase 35 plan 17's own zero-calls fix), and this
 * plan's Model A deletions lived entirely in the JSX return path below it, not in this effect.
 * `amazon.getLoginData()` still appears zero times in the file; `useTauriOAuthLogin.ts` (not
 * touched by this plan) still owns exactly one `getAmazonLoginData()` call; the raw source
 * still carries the spawn-tax rationale comment. All four assertions below continue to hold
 * against the post-retirement source, unmodified. RE-POINT rather than RE-DERIVE because the
 * property being measured (call count at this site) did not change in kind or strength --
 * Model A's deletion removed dead consumers of `amazonLoginData`'s *result*
 * (`handleAmazonLogin`, the `<webview src>`), not the fetch-suppression this gate defends.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const indexPath = join(__dirname, '..', 'index.tsx')
const useTauriOAuthLoginPath = join(__dirname, '..', 'useTauriOAuthLogin.ts')

/** Extracts the effect body whose marker appears first, sliced up to the effect's closing
 * `}, [pathname])`. Mirrors WebViewOAuthNavigation.test.ts's own brace-balanced extraction
 * approach, but this effect's own closing dependency array is a simpler, more precise anchor
 * than a generic balanced-brace scan. */
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

describe('WebView /loginweb/nile effect -- no login-data fetch of its own (quick task 260806-teb, Phase 35 plan 17)', () => {
  const rawSource = readFileSync(indexPath, 'utf-8')
  const source = stripSourceComments(rawSource)
  const effectBody = extractNileEffectBody(source)

  it('the effect body contains no amazon.getLoginData() call', () => {
    expect(effectBody).not.toContain('amazon.getLoginData()')
  })

  it('amazon.getLoginData() appears zero times in the whole file -- the fetch was deleted, not merely re-guarded', () => {
    const matches = source.match(/amazon\.getLoginData\(\)/g) ?? []
    expect(matches).toHaveLength(0)
  })

  it('useTauriOAuthLogin.ts still owns exactly one getAmazonLoginData() call -- the fetch has a single remaining source, not zero', () => {
    const hookSource = stripSourceComments(
      readFileSync(useTauriOAuthLoginPath, 'utf-8')
    )
    const matches =
      hookSource.match(/window\.api\.getAmazonLoginData\(\)/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it('the raw (non-stripped) source still names the spawn-tax rationale in a comment, for a future reader', () => {
    // Checked against the RAW source (not the comment-stripped copy) -- this assertion's whole
    // point is that the comment itself still exists, not its content structure.
    expect(rawSource).toMatch(/spawn[\s\S]*nile auth|nile auth[\s\S]*spawn/i)
  })

  describe('self-test (anti-vacuity)', () => {
    it('the gate FAILS against a synthetic source where the fetch was reintroduced unconditionally', () => {
      const regressed = `
        pathname !== '/loginweb/nile') return
        console.log('Loading amazon login data')
        setLoading({ refresh: true, message: t('status.preparing_login', 'x') })
        amazon.getLoginData().then((data) => {
          setAmazonLoginData(data)
        })
      }, [pathname])
      `
      const matches = regressed.match(/amazon\.getLoginData\(\)/g) ?? []
      expect(matches).not.toHaveLength(0)
    })

    it('the gate FAILS against a synthetic source where getAmazonLoginData() was duplicated into a second call site', () => {
      const regressedHook = `
        const amazonData1 = await window.api.getAmazonLoginData()
        const amazonData2 = await window.api.getAmazonLoginData()
      `
      const matches =
        regressedHook.match(/window\.api\.getAmazonLoginData\(\)/g) ?? []
      expect(matches).not.toHaveLength(1)
    })
  })
})
