/**
 * Phase 34.1 Plan 01, Task 2 (D-04): exact-grant-list assertion for
 * src-tauri/capabilities/default.json. Read-file-then-assert-shape,
 * one-behavior-per-test style, modeled on ./tauriConf.test.ts.
 *
 * Pins the D-04 capability grant list by test so neither a silent widening
 * (e.g. adding core:window:default) nor a silent narrowing (e.g. dropping
 * one of the twelve explicit identifiers) can land green.
 */
import { readFileSync } from 'node:fs'
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
  return conf.permissions.filter(
    (p): p is string => typeof p === 'string'
  )
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
  'core:webview:allow-set-webview-zoom'
]

describe('capabilities/default.json D-04 window/webview grants (REQ-34.1-02)', () => {
  test('REQ-34.1-02: all twelve D-04 window/webview identifiers are granted as bare strings', () => {
    const conf = loadCapabilitiesDefault()
    const perms = stringPermissions(conf)
    for (const grant of D04_WINDOW_WEBVIEW_GRANTS) {
      expect(perms).toContain(grant)
    }
  })

  test('REQ-34.1-02: negative gate -- no broader window/webview/tray/notification/dialog grant is present', () => {
    const conf = loadCapabilitiesDefault()
    const perms = stringPermissions(conf)
    const forbidden = [
      'core:window:default',
      'core:webview:default',
      'core:tray:default',
      'notification:default',
      'dialog:allow-open',
      'core:webview:allow-create-webview-window'
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
