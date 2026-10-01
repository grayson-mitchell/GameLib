/**
 * Regression: the store-embed reload loop (debug session
 * `linux-embed-gog-reload-loop-real-profile`).
 *
 * THE BUG THIS PINS
 *
 * Stores -> GOG Store on the operator's real profile kept reloading continuously: the embed's URL
 * label flicked `af.gog.com` <-> `track.adtraction.com` forever. The loop was OUR renderer
 * re-pointing the live embed, not the page:
 *
 *   1. `WebView/index.tsx` re-derived `startUrl` from `localStorage` `last-url-<store>` on EVERY
 *      render (and `removeItem`'d a rejected value during render);
 *   2. `useStoreEmbedHost` persisted every main-frame URL the embed reported, unvalidated -- the
 *      redirect chain's tracker interstitial, and on a store switch the PREVIOUS store's URL;
 *   3. its start-URL effect turns every change of `startUrl` into a real `webview.navigate()`.
 *
 * So any independent re-render (the real profile re-rendered ~1.5/s) re-read whatever page the embed
 * had last reported and navigated there; against a page that hops between valid GOG URLs and the
 * tracker the value never settled. Real log: 1849 renders, ~780 `storeEmbedNavigate` calls in
 * ~20 minutes, a 3-URL cycle default -> A -> B -> default.
 *
 * WHAT THIS TEST RUNS
 *
 * The REAL `useStoreEmbedHost`, and the REAL restore statements from `WebView/index.tsx` (sliced
 * out of the source and compiled -- the same technique `WebViewDeepLinkAndRestore.test.ts` uses,
 * because that file cannot be imported without jsdom), wired together the way `index.tsx` wires them,
 * driven in VIRTUAL TIME against a JS port of the Rust `StoreEmbedState` (`src-tauri/src/main.rs`
 * 5488-5612 `push`/`arm_reload_suppression`, 6423-6440 `store_embed_navigate`), including the detail
 * that matters here: `push()` CONSUMES a pending one-shot suppression flag and returns without
 * pushing, so only the FIRST `Finished` after our own navigate is eaten and a second one re-enters
 * the loop.
 *
 * HONEST SCOPE. Two of the loop's three ignition conditions were INFERRED, not observed: the page's
 * hop (the page model below is derived from the real log's cycle structure, not recorded from a real
 * page) and the continuing source of re-renders (modelled as a fixed-interval re-render; what
 * actually drives it on the real profile was not identified). The test therefore proves that the
 * renderer machinery can no longer be driven round that loop by ANY page behaviour / re-render
 * source -- it does not prove which page or source the real profile had. The control arm at the
 * bottom proves the simulation can loop at all, so the zeros above it are not a harness that cannot.
 *
 * Anti-vacuity beyond the control arm: this file was run against the pre-fix `index.tsx` +
 * `useStoreEmbedHost.ts` and went red on every `it` except the control (see the session's
 * Resolution.verification).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import * as ts from 'typescript'

jest.useFakeTimers()

type ReactMock = {
  __beginRender: () => void
  __resetMount: () => void
  useMemo: (fn: () => unknown, deps: unknown[]) => unknown
  useEffect: (effect: () => void | (() => void), deps?: unknown[]) => void
}

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let stateSlots: unknown[] = []
  let stateCursor = 0
  let refSlots: { current: unknown }[] = []
  let refCursor = 0
  let memoSlots: { deps: unknown[]; value: unknown }[] = []
  let memoCursor = 0
  let effectDeps: (unknown[] | undefined)[] = []
  let effectCleanups: (void | (() => void))[] = []
  let effectCursor = 0

  const depsChanged = (
    prev: unknown[] | undefined,
    next: unknown[] | undefined
  ): boolean => {
    if (!prev || !next) return true
    if (prev.length !== next.length) return true
    return prev.some((d, i) => !Object.is(d, next[i]))
  }

  return {
    ...actualReact,
    useState: (initial: unknown) => {
      const idx = stateCursor++
      if (idx >= stateSlots.length) {
        stateSlots[idx] =
          typeof initial === 'function' ? (initial as () => unknown)() : initial
      }
      const setState = (updater: unknown) => {
        const next =
          typeof updater === 'function'
            ? (updater as (prev: unknown) => unknown)(stateSlots[idx])
            : updater
        // React bails out on an Object.is-equal state; anything else schedules a re-render.
        if (!Object.is(next, stateSlots[idx])) {
          ;(globalThis as unknown as { __needsRender: boolean }).__needsRender =
            true
        }
        stateSlots[idx] = next
      }
      return [stateSlots[idx], setState]
    },
    useRef: (initial: unknown) => {
      const idx = refCursor++
      if (idx >= refSlots.length) refSlots[idx] = { current: initial }
      return refSlots[idx]
    },
    useCallback: <T,>(fn: T) => fn,
    useContext: () => ({
      suppressed: false,
      acquire: () => undefined,
      release: () => undefined
    }),
    useMemo: (fn: () => unknown, deps: unknown[]) => {
      const idx = memoCursor++
      const slot = memoSlots[idx]
      if (slot === undefined || depsChanged(slot.deps, deps)) {
        memoSlots[idx] = { deps, value: fn() }
      }
      return memoSlots[idx].value
    },
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      const idx = effectCursor++
      if (depsChanged(effectDeps[idx], deps)) {
        const priorCleanup = effectCleanups[idx]
        if (typeof priorCleanup === 'function') priorCleanup()
        effectDeps[idx] = deps
        effectCleanups[idx] = effect()
      }
    },
    __beginRender: () => {
      stateCursor = 0
      refCursor = 0
      memoCursor = 0
      effectCursor = 0
    },
    __resetMount: () => {
      stateSlots = []
      stateCursor = 0
      refSlots = []
      refCursor = 0
      memoSlots = []
      memoCursor = 0
      effectDeps = []
      effectCleanups = []
      effectCursor = 0
    }
  }
})

class MockResizeObserver {
  private callback: () => void
  constructor(callback: () => void) {
    this.callback = callback
  }
  // The real spec: observing an element reports its current size once, immediately.
  observe(): void {
    this.callback()
  }
  unobserve(): void {
    /* not used by the hook */
  }
  disconnect(): void {
    /* nothing to release */
  }
}
;(
  globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }
).ResizeObserver = MockResizeObserver

const mockApi = {
  storeEmbedOpen: jest.fn(),
  storeEmbedSetBounds: jest.fn(),
  storeEmbedHide: jest.fn(),
  storeEmbedShow: jest.fn(),
  storeEmbedClose: jest.fn(),
  storeEmbedBack: jest.fn(),
  storeEmbedForward: jest.fn(),
  storeEmbedReload: jest.fn(),
  storeEmbedNavigate: jest.fn(),
  storeEmbedTakeNavEvents: jest.fn(),
  logInfo: jest.fn()
}
;(globalThis as unknown as { window: unknown }).window = {
  api: mockApi,
  addEventListener: () => undefined,
  removeEventListener: () => undefined
}

// Map-backed `localStorage` (this project's jest env is `node`). Every write is recorded so a test
// can assert on the whole history of a key, not only its final value.
const storage = new Map<string, string>()
const storageWrites: { key: string; value: string }[] = []
const fakeLocalStorage = {
  getItem: (key: string) =>
    storage.has(key) ? (storage.get(key) as string) : null,
  setItem: (key: string, value: string) => {
    storageWrites.push({ key, value })
    storage.set(key, value)
  },
  removeItem: (key: string) => {
    storage.delete(key)
  },
  clear: () => storage.clear(),
  key: () => null,
  length: 0
} as Storage
;(globalThis as unknown as { localStorage: Storage }).localStorage =
  fakeLocalStorage

// Imported after the mocks above (textual order -- this project's ts-jest setup does not hoist
// jest.mock like babel-jest; see useStoreEmbedHost.test.tsx).
import { useStoreEmbedHost } from '../useStoreEmbedHost'
import { resolveStoreForUrl } from '../storeEmbedOrigins'

// ── The REAL restore statements, sliced out of `index.tsx` ─────────────────────────────────────
// Same marker pair `WebViewDeepLinkAndRestore.test.ts` uses. Both markers exist in the pre-fix
// source too, so this file can be run unchanged against the pre-fix tree (the anti-vacuity check):
// there the slice is the old inline `if (store) { ... removeItem }` and simply ignores the two hook
// parameters.
const indexSource = readFileSync(join(__dirname, '..', 'index.tsx'), 'utf-8')

function extractRawBetween(
  source: string,
  startMarker: string,
  endMarker: string
): string {
  const startIdx = source.indexOf(startMarker)
  if (startIdx === -1) throw new Error(`start marker not found: ${startMarker}`)
  const endIdx = source.indexOf(endMarker, startIdx)
  if (endIdx === -1) throw new Error(`end marker not found: ${endMarker}`)
  return source.slice(startIdx, endIdx)
}

const lastUrlStorageKeyLine = indexSource.match(
  /const lastUrlStorageKey = .+/
)?.[0]
if (!lastUrlStorageKeyLine)
  throw new Error('lastUrlStorageKey definition not found')

const restoreStatements = extractRawBetween(
  indexSource,
  'let startUrl = urls[pathname]',
  'const isStorePageDeepLink = pathname.match(/store-page/) !== null'
)

const { outputText: restoreJs } = ts.transpileModule(
  `${lastUrlStorageKeyLine}\n${restoreStatements}`,
  { compilerOptions: { target: ts.ScriptTarget.ES2019 } }
)
// eslint-disable-next-line @typescript-eslint/no-implied-eval -- deliberate: see file docstring.
const computeRealStartUrl = new Function(
  'pathname',
  'urls',
  'store',
  'localStorage',
  'resolveStoreForUrl',
  'useMemo',
  'useEffect',
  `${restoreJs}\nreturn startUrl;`
) as (
  pathname: string,
  urls: Record<string, string>,
  store: string | undefined,
  localStorage: Storage,
  resolveStoreForUrl: unknown,
  useMemo: ReactMock['useMemo'],
  useEffect: ReactMock['useEffect']
) => string

// `index.tsx` hands the slice's `startUrl` to the hook as exactly this call. The simulation below
// re-states that glue, so pin it: if it drifts, this file must be revisited rather than keep
// simulating a wiring the component no longer has.
it('wires startUrl from the restore slice into useStoreEmbedHost the way the simulation does', () => {
  expect(indexSource).toMatch(
    /useStoreEmbedHost\(\{\s*slotNode,\s*startUrl,\s*storeKey,\s*isStoreRoute\s*\}\)/
  )
})

// ── Fixtures ────────────────────────────────────────────────────────────────────────────────────
const DEFAULT_GOG = 'https://af.gog.com?as=1838482841'
const TRACKER =
  'https://track.adtraction.com/t/t?a=1&as=1838482841&t=2&tk=1&url=http://www.gog.com'
const LANDING =
  'https://www.gog.com/en/?utm_campaign=adtraction&utm_medium=affiliate&utm_source=adtraction'
const HOP_A = 'https://www.gog.com/en/?utm_source=adtraction&cid=2'
const HOP_B = 'https://www.gog.com/en/?utm_source=adtraction&cid=4'
const EPIC = 'https://www.epicgames.com/store/en/'

const ROUTE_URLS: Record<string, string> = {
  '/store/gog': DEFAULT_GOG,
  '/store/epic': EPIC
}

// ── JS port of the Rust nav state (see the file docstring for the line references) ───────────────
interface NavJson {
  url: string
  host: string
  canGoBack: boolean
  canGoForward: boolean
}

class RustEmbedPort {
  history: string[] = []
  cursor = 0
  suppressNextPush = false
  pendingNavEvents: NavJson[] = []
  constructor(private readonly sim: Sim) {}

  private navJson(): NavJson {
    const url = this.history[this.cursor] ?? ''
    let host = ''
    try {
      host = new URL(url).host
    } catch {
      /* a malformed URL has no host, exactly as in the hook's own derivation */
    }
    return {
      url,
      host,
      canGoBack: this.cursor > 0,
      canGoForward:
        this.history.length > 0 && this.cursor + 1 < this.history.length
    }
  }

  // main.rs `StoreEmbedState::push`
  push(url: string): void {
    if (this.suppressNextPush) {
      this.suppressNextPush = false
      return
    }
    this.history.length = Math.min(this.cursor + 1, this.history.length)
    this.history.push(url)
    this.cursor = this.history.length - 1
    this.pendingNavEvents.push(this.navJson())
  }

  // `on_page_load` Finished -> `state.push(payload.url())`
  pageFinished(url: string): void {
    this.push(url)
  }

  // `store_embed_open` on a fresh embed: loads the URL, pushes nothing.
  open(url: string): void {
    this.sim.startLoad(url)
  }

  // `store_embed_navigate`: push, THEN arm suppression, then `webview.navigate()`.
  navigate(url: string): NavJson {
    this.push(url)
    this.suppressNextPush = true
    const json = this.navJson()
    this.sim.startLoad(url)
    return json
  }

  // `store_embed_take_nav_events`: drains.
  takeNavEvents(): NavJson[] {
    const drained = this.pendingNavEvents
    this.pendingNavEvents = []
    return drained
  }
}

// What the embedded page does after a load: a list of `{ delay, url }` main-frame Finished events.
type PageModel = (url: string) => { delay: number; url: string }[]

// The real fake-profile chain, observed in the packaged AppImage: af.gog.com 302s to the tracker
// interstitial (+1.6 s), which `location.replace`s to the landing page (+6.3 s). One-way, ends.
const observedChain: PageModel = (url) =>
  url === DEFAULT_GOG
    ? [
        { delay: 1500, url: TRACKER },
        { delay: 6200, url: LANDING }
      ]
    : [{ delay: 900, url }]

// INFERRED from the real log's 3-URL cycle (default -> A -> B -> default), not recorded from a real
// page: valid gog.com URLs JS-hop to one another and one hop bounces through the tracker. A page
// like this only keeps going while something re-navigates it, which is exactly what the old renderer
// did -- it is the model of the loop AS OBSERVED.
const restartingPage: PageModel = (url) => {
  if (url === DEFAULT_GOG) {
    return [
      { delay: 1500, url: TRACKER },
      { delay: 3200, url: HOP_B }
    ]
  }
  if (url === HOP_B) {
    return [
      { delay: 800, url: HOP_B },
      { delay: 1600, url: HOP_A }
    ]
  }
  if (url === HOP_A) {
    return [
      { delay: 800, url: HOP_A },
      { delay: 1500, url: TRACKER },
      { delay: 3200, url: HOP_B }
    ]
  }
  return [{ delay: 900, url }]
}

// The WORST CASE, and the one that does not depend on the inference above being right: a page that
// never settles whatever the renderer does, forever reporting main-frame Finished events through
// valid GOG URLs and the tracker interstitial in turn (a consent reload, a refresh timer, a
// fingerprint redirect...). The renderer must stay out of its way, because nothing the page reports
// is a reason to navigate.
const neverSettlingPage: PageModel = () => {
  const cycle = [TRACKER, HOP_B, HOP_A]
  const events: { delay: number; url: string }[] = []
  for (let i = 0; i < 40; i++) {
    events.push({ delay: 1500 + 1600 * i, url: cycle[i % cycle.length] })
  }
  return events
}

const STEP_MS = 100

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

class Sim {
  now = 0
  readonly rust = new RustEmbedPort(this)
  private pending: { at: number; url: string }[] = []
  store = 'epic'
  haveSlot = false
  readonly renders: string[] = []
  /** An independent re-render source (a context update, a progress event...): every `churnMs`. */
  churnMs = 0
  private nextChurn = 0
  readonly navigateCalls: string[] = []
  readonly openCalls: string[] = []
  private readonly slot = {
    getBoundingClientRect: () => ({ x: 204, y: 82, width: 1076, height: 718 })
  } as unknown as HTMLDivElement

  constructor(
    private readonly deriveStartUrl: (store: string) => string,
    private readonly page: PageModel
  ) {
    mockApi.storeEmbedOpen.mockImplementation((url: string) => {
      this.openCalls.push(url)
      this.rust.open(url)
      return Promise.resolve({ status: 'ok' })
    })
    mockApi.storeEmbedNavigate.mockImplementation((url: string) => {
      this.navigateCalls.push(url)
      return Promise.resolve({
        status: 'ok',
        navState: this.rust.navigate(url)
      })
    })
    mockApi.storeEmbedTakeNavEvents.mockImplementation(() =>
      Promise.resolve(this.rust.takeNavEvents())
    )
    mockApi.storeEmbedHide.mockResolvedValue({ status: 'ok' })
    mockApi.storeEmbedShow.mockResolvedValue({ status: 'ok' })
    reactMock().__resetMount()
  }

  startLoad(url: string): void {
    this.pending = this.page(url).map((e) => ({
      at: this.now + e.delay,
      url: e.url
    }))
  }

  /** One component render: the restore statements, then the hook, as `index.tsx` orders them. */
  render(): void {
    reactMock().__beginRender()
    ;(globalThis as unknown as { __needsRender: boolean }).__needsRender = false
    const startUrl = this.deriveStartUrl(this.store)
    // eslint-disable-next-line react-hooks/rules-of-hooks -- a render harness, not a component.
    useStoreEmbedHost({
      slotNode: this.haveSlot ? this.slot : null,
      startUrl,
      storeKey: this.store,
      isStoreRoute: true
    })
    this.renders.push(startUrl)
  }

  /** Advance virtual time: timers, page events reaching Rust, and any re-render React would do. */
  async advance(ms: number): Promise<void> {
    for (let t = 0; t < ms; t += STEP_MS) {
      this.now += STEP_MS
      jest.advanceTimersByTime(STEP_MS)
      await flushMicrotasks()
      const due = this.pending.filter((e) => e.at <= this.now)
      this.pending = this.pending.filter((e) => e.at > this.now)
      for (const event of due) this.rust.pageFinished(event.url)
      await flushMicrotasks()
      let needsRender = (globalThis as unknown as { __needsRender: boolean })
        .__needsRender
      if (this.churnMs > 0 && this.now >= this.nextChurn) {
        this.nextChurn = this.now + this.churnMs
        needsRender = true
      }
      if (needsRender) this.render()
    }
  }

  /**
   * Stores -> Epic panel (no slot), then the GOG tile: render A is GOG with no slot yet, render B
   * once the callback ref has attached the slot. This is the sequence the operator performed.
   */
  enterGogFromEpic(): void {
    this.store = 'epic'
    this.haveSlot = false
    this.render()
    this.store = 'gog'
    this.render()
    this.haveSlot = true
    this.render()
  }
}

function reactMock(): ReactMock {
  return jest.requireMock('react') as unknown as ReactMock
}

// The restore as the REAL component computes it, with the render-persistent hooks from the harness.
const realDerive = (store: string): string =>
  computeRealStartUrl(
    `/store/${store}`,
    ROUTE_URLS,
    store,
    fakeLocalStorage,
    resolveStoreForUrl,
    reactMock().useMemo,
    reactMock().useEffect
  )

// CONTROL ONLY. The pre-fix restore, restated by hand: re-read on EVERY render and `removeItem`
// during render. NOT a claim about production code -- it exists so the control arm can show that
// the simulation does loop when the restore is per-render.
const legacyPerRenderDerive = (store: string): string => {
  let startUrl = ROUTE_URLS[`/store/${store}`]
  const lastUrl = localStorage.getItem(`last-url-${store}`)
  if (lastUrl) {
    const resolved = resolveStoreForUrl(lastUrl)
    if (resolved && resolved.key === store) startUrl = lastUrl
    else localStorage.removeItem(`last-url-${store}`)
  }
  return startUrl
}

const VIRTUAL_RUN_MS = 90_000
const CHURN_MS = 700

describe('store-embed reload loop (debug session linux-embed-gog-reload-loop-real-profile)', () => {
  beforeEach(() => {
    storage.clear()
    storageWrites.length = 0
  })

  afterEach(() => {
    jest.clearAllTimers()
  })

  // [label, page, minimum persisted writes proving the page's events really reached the hook]
  const pages: [string, PageModel, number][] = [
    [
      'the loop as observed (restarts only when re-navigated)',
      restartingPage,
      1
    ],
    ['a page that never settles (the worst case)', neverSettlingPage, 10]
  ]
  const profiles: [string, boolean][] = [
    ['a returning profile (a valid last-url-gog is stored)', true],
    ['a fresh profile (nothing stored)', false]
  ]

  describe.each(pages)('page: %s', (_pageLabel, page, minWrites) => {
    it.each(profiles)(
      'under continuing re-renders the embed is never re-navigated: %s',
      async (_label, seeded) => {
        if (seeded) storage.set('last-url-gog', LANDING)
        const sim = new Sim(realDerive, page)
        sim.churnMs = CHURN_MS
        sim.enterGogFromEpic()
        const entryRenders = sim.renders.length
        await sim.advance(VIRTUAL_RUN_MS)

        // Plenty of renders happened, so this is not a quiet run that never gave the loop a
        // chance...
        expect(sim.renders.length - entryRenders).toBeGreaterThan(50)
        // ...yet no render changed the embed's start URL, so none became a navigation. This is the
        // loop itself: before the fix this array held dozens of entries.
        expect(sim.navigateCalls).toEqual([])
        expect(new Set(sim.renders.slice(entryRenders - 1)).size).toBe(1)
        // The page's navigations did reach the hook and were persisted (so a restore value that
        // CAN move was moving)...
        const gogWrites = storageWrites.filter((w) => w.key === 'last-url-gog')
        expect(gogWrites.length).toBeGreaterThanOrEqual(minWrites)
        // ...and never as anything but a GOG page: not the tracker interstitial, not Epic's URL.
        for (const write of gogWrites) {
          expect(resolveStoreForUrl(write.value)?.key).toBe('gog')
        }
        // The embed was opened exactly once, at the store's start (or its restored page).
        expect(sim.openCalls).toEqual([seeded ? LANDING : DEFAULT_GOG])
      }
    )
  })

  it('the restore survives the Epic -> GOG switch: the embed opens at the stored page and the key is never overwritten with a page that is not GOG', async () => {
    storage.set('last-url-gog', LANDING)
    const sim = new Sim(realDerive, observedChain)
    sim.enterGogFromEpic()
    // Opened at the restored page, not the affiliate default (the old stomp wrote the Epic URL
    // under last-url-gog on the store switch, so the next render discarded the restore).
    expect(sim.openCalls).toEqual([LANDING])

    await sim.advance(30_000)

    // Every value ever written under last-url-gog resolves to GOG -- never the tracker interstitial,
    // never the previous store's URL.
    const gogWrites = storageWrites.filter((w) => w.key === 'last-url-gog')
    for (const write of gogWrites) {
      expect(resolveStoreForUrl(write.value)?.key).toBe('gog')
    }
    expect(storage.get('last-url-gog')).toBe(LANDING)
    expect(sim.navigateCalls).toEqual([])
  })

  it('the redirect chain of a fresh profile persists only the landing page, and one later unrelated re-render does not navigate to it', async () => {
    const sim = new Sim(realDerive, observedChain)
    sim.enterGogFromEpic()
    await sim.advance(20_000)

    // The tracker interstitial was reported as a main-frame URL while it sat there, and must not
    // have been stored; the landing page is what a restart should restore.
    const gogWrites = storageWrites.filter((w) => w.key === 'last-url-gog')
    expect(gogWrites.map((w) => w.value)).not.toContain(TRACKER)
    expect(storage.get('last-url-gog')).toBe(LANDING)

    // ONE unrelated re-render now (any context update). Before the fix this re-derived startUrl from
    // the stored landing page and navigated the live embed to it, restarting the page.
    sim.render()
    await sim.advance(20_000)
    expect(sim.navigateCalls).toEqual([])
  })

  describe('control arm (the simulation can loop at all)', () => {
    it.each([
      ['the loop as observed', restartingPage],
      ['a page that never settles', neverSettlingPage]
    ])(
      'with the restore re-read on every render (the pre-fix restore) %s and the same re-render churn DO sustain a navigation loop',
      async (_label, page) => {
        const sim = new Sim(legacyPerRenderDerive, page)
        sim.churnMs = CHURN_MS
        sim.enterGogFromEpic()
        await sim.advance(VIRTUAL_RUN_MS)

        // Dozens of navigations in 90 s of virtual time. If this ever reads 0 the harness has lost
        // the ability to loop and every zero asserted above is vacuous.
        expect(sim.navigateCalls.length).toBeGreaterThan(10)
      }
    )
  })
})
