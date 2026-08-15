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
 *
 * QUICK-260815-k25 (hide the painted native title without blanking the OS-level name):
 *
 * `setTitleBarStyle('overlay')` does NOT hide the title. In `tauri-runtime-wry-2.11.4`,
 * `TitleBarStyle::Overlay` sets ONLY `titlebar_transparent(true)` + `fullsize_content_view(true)`
 * -- at the creation path (`src/lib.rs:1211-1214`) AND at the runtime `SetTitleBarStyle` message
 * handler (`src/lib.rs:3653-3656`). Neither path touches title visibility. So the frameless
 * toggle makes the title bar transparent and lets the webview extend under it, while AppKit keeps
 * painting the title text on top -- that was the whole symptom this quick task fixes.
 *
 * Title visibility is an INDEPENDENT, CREATION-ONLY knob: `hidden_title(bool)` ->
 * `with_title_hidden` (`tauri-runtime-wry-2.11.4/src/lib.rs:1233-1234`) -> tao applies
 * `ns_window.setTitleVisibility(NSWindowTitleVisibility::Hidden)`
 * (`tao-0.35.3/src/platform_impl/macos/window.rs:269-271`). `WindowMessage` in
 * `tauri-runtime-wry-2.11.4/src/lib.rs` has `SetTitle(String)` (line 1435) and
 * `SetTitleBarStyle` (line 1471) but NO title-visibility variant -- there is no runtime setter.
 * That is exactly why this is the right fix: applied once at window creation, it is structurally
 * immune to every later frameless toggle, `setDecorations` call, and `setTitleBarStyle` call.
 *
 * `hiddenTitle` and `title` are ORTHOGONAL. `tauri-utils-2.9.3/src/config.rs:2066-2068`
 * declares `pub hidden_title: bool` with `#[serde(default, alias = "hidden-title")]`; the struct
 * carries `#[serde(rename_all = "camelCase", deny_unknown_fields)]` (`config.rs:1916-1917`), so
 * the JSON key is camelCase `hiddenTitle` and defaults to `false` (`config.rs:2333`). On macOS,
 * `setTitleVisibility(Hidden)` suppresses only the DRAWN text; `NSWindow.title` keeps its string.
 * Mission Control, the Window menu, Cmd-Tab and VoiceOver all read the string, not the drawing.
 *
 * Division of labour, because of `deny_unknown_fields`: a misspelled key (`"hiddentitle"`,
 * `"hidden_title"`) is a HARD `cargo check` build failure -- cargo owns key SPELLING. What cargo
 * can NOT catch is the VALUE: `"hiddenTitle": false` compiles perfectly and does nothing. The
 * jest gates below own the VALUE (`hiddenTitle === true` and `title === "GameLib"`); the human
 * checkpoint owns "is the pixel actually gone" -- jest cannot observe AppKit's paint.
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
  title?: string
  titleBarStyle?: string
  hiddenTitle?: boolean
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

describe('tauri.conf.json main window title rendering (QUICK-260815-k25)', () => {
  test('the main window declares hiddenTitle exactly boolean true', () => {
    const conf = loadTauriConf()
    const mainWindow = findWindowByLabel(conf.app.windows, 'main')
    expect(mainWindow).toBeDefined()
    // toBe(true), not toBeTruthy(): the Rust field is a bool and the point of this gate
    // is the VALUE -- "hiddenTitle": false compiles clean under deny_unknown_fields and
    // does nothing (see header docstring's division-of-labour note).
    expect(mainWindow?.hiddenTitle).toBe(true)
  })

  // SANITY (non-vacuity, two known-bad fixtures, neither arbitrary):
  test('SANITY: the same lookup-and-assert helper FAILS against fixtures missing/defaulting hiddenTitle', () => {
    // (i) the EXACT pre-change on-disk shape -- the key simply absent.
    const preChangeFixture: TauriWindowConfig[] = [
      { label: 'main', title: 'GameLib' }
    ]
    const preChangeWindow = findWindowByLabel(preChangeFixture, 'main')
    expect(() => expect(preChangeWindow?.hiddenTitle).toBe(true)).toThrow()

    // (ii) the serde default written out explicitly -- cargo check accepts this happily
    // and it does nothing (F4 in the plan: cargo owns spelling, not value).
    const explicitDefaultFixture: TauriWindowConfig[] = [
      { label: 'main', title: 'GameLib', hiddenTitle: false }
    ]
    const explicitDefaultWindow = findWindowByLabel(explicitDefaultFixture, 'main')
    expect(() => expect(explicitDefaultWindow?.hiddenTitle).toBe(true)).toThrow()
  })

  // Hiding the PAINTED title must not be confused with blanking the window's NAME.
  // Blanking `title` was an option the user explicitly REJECTED; this test is the
  // standing regression guard for that. Four consumers would silently lose the window's
  // name if `title` were ever blanked instead of hidden: the macOS menu bar's Window
  // menu, Mission Control (F3 / Ctrl-Up), Cmd-Tab / taskbar previews, and VoiceOver's
  // window announcement -- all four read `NSWindow.title`, not the drawn text.
  test('the main window\'s OS-level title is still exactly "GameLib"', () => {
    const conf = loadTauriConf()
    const mainWindow = findWindowByLabel(conf.app.windows, 'main')
    expect(mainWindow).toBeDefined()
    expect(mainWindow?.title).toBe('GameLib')
  })

  // SANITY (non-vacuity for the title=="GameLib" pin): the rejected "blank the title"
  // implementation, and title dropped entirely, are both known-bad inputs.
  test('SANITY: the same lookup-and-assert helper FAILS against fixtures with a blanked or missing title', () => {
    // (i) the rejected "blank the title" implementation.
    const blankedTitleFixture: TauriWindowConfig[] = [
      { label: 'main', title: '', hiddenTitle: true }
    ]
    const blankedTitleWindow = findWindowByLabel(blankedTitleFixture, 'main')
    expect(() => expect(blankedTitleWindow?.title).toBe('GameLib')).toThrow()

    // (ii) title dropped entirely.
    const missingTitleFixture: TauriWindowConfig[] = [
      { label: 'main', hiddenTitle: true }
    ]
    const missingTitleWindow = findWindowByLabel(missingTitleFixture, 'main')
    expect(() => expect(missingTitleWindow?.title).toBe('GameLib')).toThrow()
  })
})
