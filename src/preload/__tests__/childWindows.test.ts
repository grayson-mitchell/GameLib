/**
 * Tauri child-window contract test (Phase 34.1 Plan 07, D-12, REQ-34.1-08).
 *
 * Covers `tauriChildWindows.ts`'s export directly (mocking
 * `@tauri-apps/api/webviewWindow`'s `WebviewWindow` class). `helpers.ts`'s
 * `createNewWindow` used to route on a Tauri-context check; Phase 35 plan 17 collapsed
 * that branch, deleting the Electron-branch fallback entirely -- there is no longer a
 * runtime-detection decision to test, so the test that exercised the deleted ELSE arm is
 * gone with it (same treatment `gamepadActionRouting.test.ts` and
 * `steamInstallFormApi.test.ts` gave their own now-unreachable branches).
 *
 * This suite also covered the About window until quick `260905-d33` replaced it with an
 * in-app modal (`components/UI/AboutDialog`); those five cases were deleted with the
 * code they exercised rather than left asserting a surface that no longer exists.
 *
 * jest.config sets `resetMocks: true` -- every mock's implementation/return value is
 * (re)established in `beforeEach`.
 */

const mockedTauriSend = jest.fn()
jest.mock('../tauriTransport', () => ({
  send: (...args: unknown[]) => mockedTauriSend(...args),
  invoke: jest.fn(),
  listen: jest.fn(),
  snapshotGet: jest.fn(),
  snapshotSet: jest.fn(),
  snapshotHas: jest.fn(),
  snapshotDelete: jest.fn(),
  registerStore: jest.fn()
}))

// Phase 35 Plan 18 (T-27-07): this suite used to guard against 'electron' being resolved on
// the Tauri preload path via a throw-on-require jest.mock('electron', ...) factory. Plan 18
// retired the 'electron' devDependency outright, so the guard is now structural: 'electron'
// cannot resolve on ANY path, in ANY suite, because it no longer exists in node_modules at
// all. A jest.mock('electron', ...) call here would itself throw "Cannot find module
// 'electron'" at REGISTRATION time (before this factory could ever run), which is a strictly
// stronger guarantee than the runtime throw it replaces. See meta/__tests__/electronAbsence.test.ts
// for the project-wide mechanized version of this same guarantee.

const onceMock = jest.fn().mockResolvedValue(undefined)
const webviewWindowCtor = jest.fn()

function MockWebviewWindow(label: string, options: unknown) {
  webviewWindowCtor(label, options)
  return { label, options, once: onceMock }
}

jest.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: MockWebviewWindow
}))

import { tauriCreateNewWindow } from '../api/tauriChildWindows'

describe('tauriChildWindows (REQ-34.1-08)', () => {
  it('REQ-34.1-08: tauriCreateNewWindow constructs a WebviewWindow with width 1200, height 700, and the passed url', () => {
    tauriCreateNewWindow('https://www.protondb.com/app/1')

    expect(webviewWindowCtor).toHaveBeenCalledTimes(1)
    const [, options] = webviewWindowCtor.mock.calls[0]
    expect(options).toMatchObject({
      url: 'https://www.protondb.com/app/1',
      width: 1200,
      height: 700
    })
  })

  it('REQ-34.1-08: two successive tauriCreateNewWindow calls use two different labels, neither "main" nor "about"', () => {
    tauriCreateNewWindow('https://www.protondb.com/app/1')
    tauriCreateNewWindow('https://www.protondb.com/app/2')

    const [label1] = webviewWindowCtor.mock.calls[0]
    const [label2] = webviewWindowCtor.mock.calls[1]
    expect(label1).not.toBe(label2)
    expect(label1).not.toBe('main')
    expect(label1).not.toBe('about')
    expect(label2).not.toBe('main')
    expect(label2).not.toBe('about')
  })

  it('REQ-34.1-08: the label is not derived from the url -- calling twice with the SAME url still yields two different labels', () => {
    tauriCreateNewWindow('https://www.protondb.com/app/1')
    tauriCreateNewWindow('https://www.protondb.com/app/1')

    const [label1] = webviewWindowCtor.mock.calls[0]
    const [label2] = webviewWindowCtor.mock.calls[1]
    expect(label1).not.toBe(label2)
  })

  it('REQ-34.1-08: a constructor throw is caught and warned, and the function does not throw', () => {
    webviewWindowCtor.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(() => tauriCreateNewWindow('https://www.protondb.com/app/1')).not.toThrow()
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  // ── WR-04 (Phase 34.1 code review): labels must survive a renderer reload ──

  it('REQ-34.1-08/WR-04: external labels keep the "external-" prefix and are never "main"/"about"', () => {
    tauriCreateNewWindow('https://www.protondb.com/app/1')
    const [label] = webviewWindowCtor.mock.calls[0] as [string, unknown]

    expect(label.startsWith('external-')).toBe(true)
    expect(label).not.toBe('main')
    expect(label).not.toBe('about')
    // The url must not leak into the label (T-34.1-27).
    expect(label).not.toContain('protondb')
  })

  it('REQ-34.1-08/WR-04: labels are NOT a bare reset-on-reload counter -- a fresh module registry (simulating F5) does not re-issue "external-1"', () => {
    tauriCreateNewWindow('https://www.protondb.com/app/1')
    const [labelBefore] = webviewWindowCtor.mock.calls[0] as [string, unknown]

    // Re-importing the module in a fresh registry is exactly what a renderer reload
    // does to `externalWindowCounter` -- while the child OS windows created before the
    // reload are still alive and still own their labels. A bare counter therefore
    // re-requested `external-1`, Tauri rejected the duplicate, and the click silently
    // did nothing.
    jest.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const reloaded = require('../api/tauriChildWindows')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    reloaded.tauriCreateNewWindow('https://www.protondb.com/app/2')
    const [labelAfter] = webviewWindowCtor.mock.calls[1] as [string, unknown]

    expect(labelAfter).not.toBe(labelBefore)
    expect(labelBefore).not.toBe('external-1')
    expect(labelAfter).not.toBe('external-1')
  })

  // ── WR-07: the title of renderer-supplied REMOTE content is its HOST ──
  //
  // These replace an assertion that read `expect(options.title).toBeUndefined()`. That
  // one was true of the CODE and silent about the RESULT: it proved no title was passed
  // at the call site, which is precisely the state in which Tauri applies its own
  // "Tauri App" default. It stayed green for the entire life of the defect. Every case
  // below names the string the window ends up displaying, which under Tauri is the
  // `title` option verbatim.

  it('REQ-34.1-08/WR-07: a createNewWindow child is titled with the remote HOST', () => {
    tauriCreateNewWindow('https://codeweavers.com/compatibility/browse/name/c/1')
    const [, options] = webviewWindowCtor.mock.calls[0] as [string, Record<string, unknown>]

    expect(options.title).toBe('codeweavers.com')
  })

  it('REQ-34.1-08/WR-07: a leading "www." is stripped from the title', () => {
    tauriCreateNewWindow('https://www.protondb.com/app/1')
    const [, options] = webviewWindowCtor.mock.calls[0] as [string, Record<string, unknown>]

    expect(options.title).toBe('protondb.com')
  })

  it('REQ-34.1-08/WR-07: "www." is NOT stripped when doing so would leave a bare TLD (www.com is a real domain)', () => {
    tauriCreateNewWindow('https://www.com/whatever')
    const [, options] = webviewWindowCtor.mock.calls[0] as [string, Record<string, unknown>]

    expect(options.title).toBe('www.com')
  })

  it('REQ-34.1-08/WR-07: a hostile page is titled with the host it is SERVED FROM -- never the app name, never the framework default', () => {
    tauriCreateNewWindow('https://evil.example/looks-official')
    const [, options] = webviewWindowCtor.mock.calls[0] as [string, Record<string, unknown>]

    // An attacker controls `<title>` freely but not the host, which is why the host is
    // the stronger signal here.
    expect(options.title).toBe('evil.example')
    // WR-07's actual requirement: remote content must NOT wear the app's own name.
    expect(options.title).not.toBe('GameLib')
    // And the regression this replaced a blind assertion for.
    expect(options.title).not.toBe('Tauri App')
  })

  it('REQ-34.1-08/WR-07: an unparseable url omits `title` entirely and still opens the window (the helper is total)', () => {
    tauriCreateNewWindow('not-a-url')
    const [, options] = webviewWindowCtor.mock.calls[0] as [string, Record<string, unknown>]

    expect(webviewWindowCtor).toHaveBeenCalledTimes(1)
    // Omitted, not `title: undefined` -- so Tauri sees no title key at all.
    expect('title' in options).toBe(false)
  })

  it('REQ-34.1-08/WR-07: a url with no host (file://) omits `title` rather than passing an empty one', () => {
    tauriCreateNewWindow('file:///etc/passwd')
    const [, options] = webviewWindowCtor.mock.calls[0] as [string, Record<string, unknown>]

    expect('title' in options).toBe(false)
  })

  it('REQ-34.1-08/T-34.1-27: deriving the TITLE from the url does not leak the url into the LABEL', () => {
    tauriCreateNewWindow('https://evil.example/main')
    const [label, options] = webviewWindowCtor.mock.calls[0] as [string, Record<string, unknown>]

    expect(options.title).toBe('evil.example')
    expect(label.startsWith('external-')).toBe(true)
    expect(label).not.toContain('evil')
    expect(label).not.toBe('main')
    expect(label).not.toBe('about')
  })

  // ── Phase 34.4.1 Plan 06 (T-34.1-27): extended label-discipline coverage ──
  //
  // The rule this whole block enforces -- generated window labels are never
  // reserved names and never derived from the caller-supplied url -- is
  // proven TWICE in this codebase, once per language: here, for the
  // renderer-side `external-<n>`/`about` labels `nextExternalWindowLabel()`
  // generates (tauriChildWindows.ts); and on the Rust side, for the
  // sidecar-owned `loginwin-<n>` labels `next_login_window_label()`
  // generates (src-tauri/src/main.rs's `#[cfg(test)] mod tests`, see
  // `humble_login_window_label_is_never_reserved`,
  // `humble_login_window_labels_differ_across_calls`, and
  // `humble_login_window_label_is_never_derived_from_url`). Both halves
  // implement the SAME rule independently (there is no shared code between a
  // renderer TS module and a Rust sidecar binary) -- this comment exists so
  // either side is discoverable from the other.

  it('REQ-34.1-08/T-34.1-27: labels across FIVE successive generations are pairwise unique, not merely adjacent-distinct', () => {
    for (let i = 0; i < 5; i += 1) {
      tauriCreateNewWindow(`https://www.protondb.com/app/${i}`)
    }

    const labels = webviewWindowCtor.mock.calls.map(([label]) => label as string)
    expect(labels).toHaveLength(5)
    expect(new Set(labels).size).toBe(5)
  })

  it('REQ-34.1-08/T-34.1-27: the SAME url called five times in a row never repeats a label', () => {
    for (let i = 0; i < 5; i += 1) {
      tauriCreateNewWindow('https://www.protondb.com/app/1')
    }

    const labels = webviewWindowCtor.mock.calls.map(([label]) => label as string)
    expect(new Set(labels).size).toBe(5)
  })

  it('REQ-34.1-08/T-34.1-27: no label from a batch of varied-url calls ever equals "main" or "about"', () => {
    const urls = [
      'https://www.protondb.com/app/1',
      'https://areweanticheatyet.com/game/2',
      'https://www.humblebundle.com/store/some-game',
      'https://appledb.dev/app/3'
    ]
    for (const url of urls) {
      tauriCreateNewWindow(url)
    }

    const labels = webviewWindowCtor.mock.calls.map(([label]) => label as string)
    for (const label of labels) {
      expect(label).not.toBe('main')
      expect(label).not.toBe('about')
    }
  })

  it("REQ-34.1-08/T-34.1-27: no generated label contains any substring of the url's host, including a humblebundle.com url", () => {
    tauriCreateNewWindow('https://www.humblebundle.com/store/some-game')
    const [label] = webviewWindowCtor.mock.calls[0] as [string, unknown]

    expect(label).not.toContain('humblebundle')
    expect(label).not.toContain('www')
    expect(label).not.toContain('store')
  })
})
