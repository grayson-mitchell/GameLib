/**
 * Phase 34.1 gap cycle 1, plan 34.1-10 (D-06 mechanism reversal, G4, REQ-34.1-09):
 * config gate for the `main` window block in `src-tauri/tauri.conf.json`, in particular
 * its `titleBarStyle` value.
 *
 * Read-file-then-assert-shape, one-behavior-per-test style, modeled on
 * `./tauriConf.test.ts` and `./capabilitiesDefault.test.ts`.
 *
 * WHY THE EXACT LITERAL MATTERS: the Rust-side `TitleBarStyle` deserializer
 * (`tauri-utils` `lib.rs:190-202`) lowercases the input string and silently falls back to
 * `Visible` for ANY unrecognised value -- a typo like `"Ovrelay"` compiles clean under
 * `cargo check` and yields a silently different window. `cargo check` therefore validates
 * the rest of this file's schema but is NOT a real gate for this key. This exact-literal,
 * case-sensitive JSON assertion is the only thing that catches a typo here.
 *
 * WHY THE VALUE IS "Visible" AND NOT "Overlay": this key declares only the CREATION-TIME
 * titlebar state -- the state the window is in before any JavaScript has run. It must
 * therefore match `settings.framelessWindow`'s DEFAULT, which is `false` -> `Visible`.
 * Creating the window in `Overlay` and then immediately driving it to `visible` on the
 * default (non-frameless) user's first launch would introduce a startup flip that UAT
 * test 3 ("no startup flip") already measures as absent today. Every state AFTER
 * creation -- the pre-paint apply in `tauriAttach.ts`, the post-hydration re-apply in
 * `index.tsx`, and every user toggle -- is owned by the runtime `setTitleBarStyle` setter
 * (`src/preload/api/tauriWindowChrome.ts`), not by this config key.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const TAURI_CONF_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'tauri.conf.json'
)

const CAPABILITIES_DEFAULT_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'capabilities',
  'default.json'
)

interface TauriWindowConfig {
  label: string
  titleBarStyle?: string
  [key: string]: unknown
}

interface TauriConf {
  app: {
    windows: TauriWindowConfig[]
  }
}

function loadTauriConf(): TauriConf {
  return JSON.parse(readFileSync(TAURI_CONF_PATH, 'utf-8')) as TauriConf
}

/**
 * Looks up a window object BY LABEL, never by array index -- index 0 is an assumption
 * that can silently drift if `app.windows` is ever reordered or gains a second entry.
 */
function findWindowByLabel(
  windows: TauriWindowConfig[],
  label: string
): TauriWindowConfig | undefined {
  return windows.find((w) => w.label === label)
}

describe('tauri.conf.json main window titleBarStyle (REQ-34.1-09, G4 mechanism reversal)', () => {
  test('the main window declares titleBarStyle exactly "Visible" (case-sensitive)', () => {
    const conf = loadTauriConf()
    const mainWindow = findWindowByLabel(conf.app.windows, 'main')
    expect(mainWindow).toBeDefined()
    expect(mainWindow?.titleBarStyle).toBe('Visible')
  })

  // SANITY case (gate-must-fail-against-known-bad-input, per this project's standing
  // rule): proves the assertion above is not vacuous by running the identical
  // lookup-and-assert helper against a fixture carrying the plausible WRONG value --
  // "Overlay" is not an arbitrary bad string, it is the exact value a prior draft of
  // this plan specified before the "no runtime setter" premise was found false.
  test('SANITY: the same lookup-and-assert helper FAILS against a fixture window carrying titleBarStyle "Overlay"', () => {
    const badFixtureWindows: TauriWindowConfig[] = [
      { label: 'main', titleBarStyle: 'Overlay' }
    ]
    const mainWindow = findWindowByLabel(badFixtureWindows, 'main')
    expect(mainWindow?.titleBarStyle).toBeDefined()
    expect(() => expect(mainWindow?.titleBarStyle).toBe('Visible')).toThrow()
  })

  test('exactly one window object in app.windows has label "main" -- a second "main"-labelled window would silently inherit the whole capabilities/default.json grant list (scoped "windows": ["main"])', () => {
    const conf = loadTauriConf()
    const mainWindows = conf.app.windows.filter((w) => w.label === 'main')
    expect(mainWindows).toHaveLength(1)
  })

  test('capabilities/default.json still declares "windows": ["main"] -- the exact-grant-list assertions themselves live in capabilitiesDefault.test.ts, this only pins the scoping this file depends on', () => {
    const capabilities = JSON.parse(
      readFileSync(CAPABILITIES_DEFAULT_PATH, 'utf-8')
    ) as { windows: string[] }
    expect(capabilities.windows).toEqual(['main'])
  })
})
