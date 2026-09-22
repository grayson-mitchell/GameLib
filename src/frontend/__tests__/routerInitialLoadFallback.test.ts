/**
 * Source gate: the data router must never render the initial-load state as nothing.
 *
 * `App()` renders `<RouterProvider>`, and EVERY route module is behind `lazy:`
 * (`makeLazyFunc`). While the router resolves the FIRST route it renders `fallbackElement` —
 * and with no `fallbackElement` it renders `null`. Because every route element lives inside
 * the router, including the `Root` that owns `<div className="App">`, that state empties
 * `#root` completely: the window paints `body`'s theme background and nothing else.
 *
 * Measured on the packaged build 2026-09-23, three launches out of three: React's own
 * `<Suspense>` fallback (`div.UpdateComponent`) is REMOVED with nothing added, `#root` sits
 * empty ~260-290ms, then `div#app.App` appears. On 1 launch in 39 it never appeared and the
 * app sat blank with `#root` at 1280x0, no error logged anywhere. See
 * `.planning/todos/pending/2026-09-17-packaged-app-renders-blank-on-roughly-one-launch-in-four.md`.
 *
 * TWO REFUTED HYPOTHESES, kept here so they are not re-tried: `withTranslation()` on
 * `GlobalState` (a suspending component above the `<Suspense>` boundary) and the
 * `useTranslation()` calls in `screens/Loading` + `UpdateComponent` (a suspending fallback).
 * Both are real hazards in principle; both were implemented and MEASURED, and the empty-root
 * window stayed at 10 launches out of 10 either way. The mutation record — `removed=`
 * naming the fallback with `added=[]` — is what separated them from the actual cause.
 *
 * WHAT THIS CAN AND CANNOT SEE. It reads one file's source; it does not render a router. The
 * frontend jest project is `testEnvironment: 'node'` with no jsdom (see
 * `src/frontend/jest.config.js`), and `createHashRouter` touches `document` on call, so
 * nothing here can mount the tree and watch `#root`. It convicts the two regressions that
 * would bring the blank window back — dropping `fallbackElement`, or unbounding the route
 * module wait — and it is blind to any other way of rendering nothing.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..')

const APP = 'src/frontend/App.tsx'

const appSource = stripSourceComments(readFileSync(join(REPO_ROOT, APP), 'utf8'))

/** `<RouterProvider ... fallbackElement={...} />` — anything non-empty to render meanwhile. */
const HAS_FALLBACK_ELEMENT = /<RouterProvider[^>]*\bfallbackElement=\{[^}]+\}/

/** The route-module wait must be bounded, so a stalled import becomes a visible error. */
const BOUNDED_ROUTE_WAIT = /Promise\.race\(\[\s*importedFile\b/

describe('the router never renders its initial-load state as nothing', () => {
  it('gives RouterProvider a fallbackElement', () => {
    expect(appSource).toMatch(HAS_FALLBACK_ELEMENT)
  })

  it('renders a real component there, not null or a fragment', () => {
    const match = HAS_FALLBACK_ELEMENT.exec(appSource)
    expect(match).not.toBeNull()
    expect(match![0]).not.toMatch(/fallbackElement=\{(null|undefined|<>\s*<\/>)\}/)
    // Whatever it is must be imported, i.e. a component and not a bare literal.
    expect(appSource).toMatch(/import Loading from '\.\/screens\/Loading'/)
  })

  it('bounds the wait for a route module', () => {
    expect(appSource).toMatch(BOUNDED_ROUTE_WAIT)
    expect(appSource).toMatch(/ROUTE_MODULE_TIMEOUT_MS\s*=\s*[\d_]+/)
  })

  it('still routes a failed route module to an errorElement', () => {
    // The timeout above is only useful because a rejection has somewhere to land.
    expect(appSource).toMatch(/errorElement:\s*<RouteErrorSurface\s*\/>/)
  })

  // Negative controls. A source gate that cannot demonstrate a conviction is a green check
  // proving nothing, so each matcher is shown rejecting the shape it exists to catch.
  describe('the matchers can actually convict', () => {
    it('catches a RouterProvider with no fallbackElement', () => {
      expect('return <RouterProvider router={router} />').not.toMatch(
        HAS_FALLBACK_ELEMENT
      )
    })

    it('accepts one that has it', () => {
      expect(
        'return <RouterProvider router={router} fallbackElement={<Loading />} />'
      ).toMatch(HAS_FALLBACK_ELEMENT)
    })

    it.each([
      ['the unbounded await this replaced', 'const component = await importedFile'],
      // Caught by mutation: without the \b, a renamed binding slipped straight through.
      ['a race against something else entirely', 'Promise.race([importedFileX, other])']
    ])('catches %s', (_label, snippet) => {
      expect(snippet).not.toMatch(BOUNDED_ROUTE_WAIT)
    })

    it('accepts the bounded form', () => {
      expect(
        'const component = await Promise.race([\n        importedFile,\n        new Promise('
      ).toMatch(BOUNDED_ROUTE_WAIT)
    })
  })
})
