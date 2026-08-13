/**
 * Phase 34.1 Plan 01, Task 2 (D-04): exact-grant-list assertion for
 * src-tauri/capabilities/default.json. Read-file-then-assert-shape,
 * one-behavior-per-test style, modeled on ./tauriConf.test.ts.
 *
 * Pins the D-04 capability grant list by test so neither a silent widening
 * (e.g. adding core:window:default) nor a silent narrowing (e.g. dropping
 * one of the thirteen explicit identifiers) can land green.
 *
 * gap cycle 1 (plan 34.1-10, G4): core:window:allow-set-title-bar-style added as the
 * thirteenth D-04 identifier, alongside a CLOSURE gate (below) the file previously
 * lacked -- see that test's own docstring for why it is needed.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const CAPABILITIES_DEFAULT_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'capabilities',
  'default.json'
)

const CAPABILITIES_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'capabilities'
)

interface ShellAllowExecutePermission {
  identifier: string
  allow: Array<{ name: string; sidecar: boolean }>
}

interface CapabilitiesDefault {
  $schema: string
  identifier: string
  description: string
  windows: string[]
  permissions: Array<string | ShellAllowExecutePermission>
}

function loadCapabilitiesDefault(): CapabilitiesDefault {
  return JSON.parse(
    readFileSync(CAPABILITIES_DEFAULT_PATH, 'utf-8')
  ) as CapabilitiesDefault
}

function stringPermissions(conf: CapabilitiesDefault): string[] {
  return conf.permissions.filter((p): p is string => typeof p === 'string')
}

const D04_WINDOW_WEBVIEW_GRANTS = [
  'core:window:allow-minimize',
  'core:window:allow-maximize',
  'core:window:allow-toggle-maximize',
  'core:window:allow-unmaximize',
  'core:window:allow-close',
  'core:window:allow-start-dragging',
  'core:window:allow-set-fullscreen',
  'core:window:allow-is-fullscreen',
  'core:window:allow-is-maximized',
  'core:window:allow-is-minimized',
  'core:window:allow-set-decorations',
  'core:window:allow-set-title-bar-style',
  'core:webview:allow-set-webview-zoom'
]

describe('capabilities/default.json D-04 window/webview grants (REQ-34.1-02)', () => {
  test('REQ-34.1-02: all thirteen D-04 window/webview identifiers are granted as bare strings', () => {
    const conf = loadCapabilitiesDefault()
    const perms = stringPermissions(conf)
    for (const grant of D04_WINDOW_WEBVIEW_GRANTS) {
      expect(perms).toContain(grant)
    }
    expect(D04_WINDOW_WEBVIEW_GRANTS).toHaveLength(13)
  })

  // gap cycle 1 (plan 34.1-10, G4): CLOSURE gate the file previously lacked. The
  // pre-existing negative gate above (`forbidden`) names only five specific broader
  // identifiers, so it cannot catch an unanticipated FOURTEENTH core:window:*/core:webview:*
  // grant landing beside the named thirteen -- every existing `toContain` assertion would
  // still pass even with an extra grant present. This test closes that gap by asserting
  // every core:window:*/core:webview:* string permission is EITHER a member of
  // D04_WINDOW_WEBVIEW_GRANTS OR exactly the separately-owned
  // core:webview:allow-create-webview-window (REQ-34.1-08, owned by the describe block below
  // -- do not fold it into D04_WINDOW_WEBVIEW_GRANTS).
  test('REQ-34.1-02 CLOSURE: no core:window:*/core:webview:* string permission exists outside the named thirteen plus create-webview-window', () => {
    const conf = loadCapabilitiesDefault()
    const perms = stringPermissions(conf)
    const windowOrWebviewPerms = perms.filter((p) =>
      /^core:(window|webview):/.test(p)
    )
    const allowed = new Set([
      ...D04_WINDOW_WEBVIEW_GRANTS,
      'core:webview:allow-create-webview-window'
    ])
    const unexpected = windowOrWebviewPerms.filter((p) => !allowed.has(p))
    expect(unexpected).toEqual([])
  })

  test('REQ-34.1-02: negative gate -- no broader window/webview/tray/notification/dialog grant is present', () => {
    const conf = loadCapabilitiesDefault()
    const perms = stringPermissions(conf)
    const forbidden = [
      'core:window:default',
      'core:webview:default',
      'core:tray:default',
      'notification:default',
      'dialog:allow-open'
    ]
    for (const grant of forbidden) {
      expect(perms).not.toContain(grant)
    }
  })

  test('REQ-34.1-02: windows is scoped to exactly ["main"]', () => {
    const conf = loadCapabilitiesDefault()
    expect(conf.windows).toEqual(['main'])
  })

  test('REQ-34.1-02: pre-existing grants survive the D-04 addition', () => {
    const conf = loadCapabilitiesDefault()
    const perms = stringPermissions(conf)
    expect(perms).toContain('core:default')
    expect(perms).toContain('opener:default')
    expect(perms).toContain('notification:allow-is-permission-granted')
    expect(perms).toContain('updater:default')

    const shellAllowExecute = conf.permissions.find(
      (p): p is ShellAllowExecutePermission =>
        typeof p === 'object' && p.identifier === 'shell:allow-execute'
    )
    expect(shellAllowExecute).toBeDefined()
    expect(shellAllowExecute?.allow).toHaveLength(1)
    expect(shellAllowExecute?.allow[0]).toEqual({
      name: 'binaries/gamelib-sidecar',
      sidecar: true
    })
  })

  test('REQ-34.1-02: description records the verified core:window:default composition (rationale gate)', () => {
    const conf = loadCapabilitiesDefault()
    expect(conf.description).toContain('core:window:default')
    expect(conf.description).toContain('read-only getter set')
  })
})

describe('capabilities/default.json D-12 child-window grant (REQ-34.1-08)', () => {
  test('REQ-34.1-08: core:webview:allow-create-webview-window is granted', () => {
    const conf = loadCapabilitiesDefault()
    const perms = stringPermissions(conf)
    expect(perms).toContain('core:webview:allow-create-webview-window')
  })

  test('REQ-34.1-08: windows still deep-equals ["main"] -- the fail-closed child-window boundary', () => {
    const conf = loadCapabilitiesDefault()
    expect(conf.windows).toEqual(['main'])
  })

  test('REQ-34.1-08: src-tauri/capabilities/ contains exactly one .json file', () => {
    const jsonFiles = readdirSync(CAPABILITIES_DIR).filter((f) =>
      f.endsWith('.json')
    )
    expect(jsonFiles).toEqual(['default.json'])
  })

  test('REQ-34.1-08: no entry matches the bare core:webview:allow-create-webview identifier (without the -window suffix)', () => {
    const conf = loadCapabilitiesDefault()
    const perms = stringPermissions(conf)
    expect(perms).not.toContain('core:webview:allow-create-webview')
  })

  test('REQ-34.1-08: description records the ZERO Tauri command access fail-closed rationale', () => {
    const conf = loadCapabilitiesDefault()
    expect(conf.description).toContain('ZERO Tauri command access')
  })
})
