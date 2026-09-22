/**
 * quick-260922-nx4: pins that the Tauri CLI's install-time NSIS/WiX bundling does NOT register
 * `gamelib://` on Windows, even though the RUNTIME `register_all()` call in `src-tauri/src/main.rs`
 * is already `#[cfg(target_os = "linux")]` and therefore never runs there.
 *
 * The hazard this closes: the Tauri CLI reads `plugins.deep-link.desktop` (merged across
 * `tauri.conf.json` + the active platform overlay) into its bundler settings, and the NSIS
 * template loops `deep_link_protocols`, emitting `WriteRegStr SHCTX "Software\Classes\<protocol>"`
 * plus a `shell\open\command` pointing at the main exe (the WiX template does the equivalent for
 * `.msi`). Windows currently has NO single-instance guard
 * (`acquire_single_instance()` in `src-tauri/src/main.rs` is `#[cfg(unix)]`), so if the installer
 * registered `gamelib://`, every external open would spawn a SECOND app with a SECOND sidecar over
 * one set of store files and one download queue -- the exact D-05 hazard Phase 35 plan 07's
 * option-c decision exists to prevent (see `.planning/todos/pending/`
 * `2026-08-29-windows-single-instance-guard-and-deep-link-registration.md`).
 *
 * Fix: `src-tauri/tauri.windows.conf.json` adds an EXPLICIT `"schemes": []` override. It must be
 * an explicit empty array, never a deleted key -- `tauri_utils::config::DeepLinkProtocol` (the
 * struct the CLI deserializes `plugins.deep-link.desktop` into) has `schemes: Vec<String>` marked
 * `#[serde(default)]`, so a deleted key and an explicit `[]` both deserialize to an empty Vec
 * TODAY, but only the explicit form's meaning does not depend on that default staying empty. Test
 * A's own-property assertion is the guard against a future edit "cleaning up" the key back into
 * silence.
 *
 * macOS and Linux are NOT touched -- `tauri.macos.conf.json` / `tauri.linux.conf.json` declare no
 * `plugins.deep-link` key at all, so they keep inheriting the base's `["gamelib"]` and keep
 * registering the protocol (macOS at build time via `CFBundleURLTypes`, Linux at runtime via
 * `register_all()`).
 *
 * Test E's merge-patch helper simulates Tauri's documented platform-config merge (RFC 7396 JSON
 * Merge Patch: objects merge recursively, arrays/scalars are replaced wholesale, `null` deletes a
 * key) purely in-test. It is NOT a claim that this reproduces the Tauri CLI's actual merge
 * implementation byte-for-byte -- the empirical, installer-level check (generated `installer.nsi`
 * with and without the override) lives in this quick task's Task 2 and is recorded in
 * `260922-nx4-SUMMARY.md`, not here.
 *
 * Lifting this override is the unblock step named in the todo above: once a Windows
 * single-instance guard exists, remove the override from `tauri.windows.conf.json` AND update this
 * test in the same change (see Task 3 rewrite of `## Then, and only then` in that todo).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE_CONF_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'tauri.conf.json'
)
const WINDOWS_CONF_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'tauri.windows.conf.json'
)
const MACOS_CONF_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'tauri.macos.conf.json'
)
const LINUX_CONF_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'tauri.linux.conf.json'
)

const EXPECTED_WINDOWS_RESOURCES = {
  '../build/bin/x64/win32/': 'build/bin/x64/win32',
  '../build/bin/arm64/win32/': 'build/bin/arm64/win32',
  '../build/bin/legendary.LICENSE': 'build/bin/legendary.LICENSE'
}

interface DeepLinkDesktop {
  schemes?: string[]
}
interface PlatformConfig {
  plugins?: {
    'deep-link'?: {
      desktop?: DeepLinkDesktop
    }
  }
  bundle: {
    resources?: unknown
  }
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T
}

/**
 * Minimal RFC 7396 JSON Merge Patch: objects merge key-by-key (recursing into nested objects),
 * arrays and scalars in `patch` wholesale-replace the corresponding value in `target`, and a
 * `null` value in `patch` deletes the key. This mirrors Tauri's documented platform-config merge
 * behaviour closely enough to exercise the override's effective shape -- see the header comment
 * for the limits of that claim.
 */
function mergePatch(target: unknown, patch: unknown): unknown {
  if (
    typeof patch !== 'object' ||
    patch === null ||
    Array.isArray(patch)
  ) {
    return patch
  }
  const result: Record<string, unknown> =
    typeof target === 'object' && target !== null && !Array.isArray(target)
      ? { ...(target as Record<string, unknown>) }
      : {}
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === null) {
      delete result[key]
    } else {
      result[key] = mergePatch(result[key], value)
    }
  }
  return result
}

describe('quick-260922-nx4: Windows install-time gamelib:// deep-link suppression', () => {
  test('Test A: tauri.windows.conf.json declares an OWN "schemes" property, explicitly empty (not deleted)', () => {
    const windowsConf = loadJson<PlatformConfig>(WINDOWS_CONF_PATH)
    const desktop = windowsConf.plugins?.['deep-link']?.desktop
    expect(desktop).toBeDefined()
    expect(
      Object.prototype.hasOwnProperty.call(desktop, 'schemes')
    ).toBe(true)
    expect(desktop?.schemes).toEqual([])
  })

  test('Test B (preservation control): tauri.windows.conf.json bundle.resources is unchanged by this override', () => {
    const windowsConf = loadJson<PlatformConfig>(WINDOWS_CONF_PATH)
    expect(windowsConf.bundle.resources).toEqual(EXPECTED_WINDOWS_RESOURCES)
  })

  test('Test C (over-reach control): base tauri.conf.json still declares plugins.deep-link.desktop.schemes === ["gamelib"]', () => {
    const baseConf = loadJson<PlatformConfig>(BASE_CONF_PATH)
    expect(baseConf.plugins?.['deep-link']?.desktop?.schemes).toEqual([
      'gamelib'
    ])
  })

  test('Test D (over-reach control): macOS and Linux overlays declare no plugins["deep-link"] key at all', () => {
    const macosConf = loadJson<PlatformConfig>(MACOS_CONF_PATH)
    const linuxConf = loadJson<PlatformConfig>(LINUX_CONF_PATH)
    expect(macosConf.plugins?.['deep-link']).toBeUndefined()
    expect(linuxConf.plugins?.['deep-link']).toBeUndefined()
  })

  test('Test E (merge-patch simulation): merging the windows overlay over base yields schemes === [], macOS/linux still yield ["gamelib"]', () => {
    const baseConf = loadJson<PlatformConfig>(BASE_CONF_PATH)
    const windowsConf = loadJson<PlatformConfig>(WINDOWS_CONF_PATH)
    const macosConf = loadJson<PlatformConfig>(MACOS_CONF_PATH)
    const linuxConf = loadJson<PlatformConfig>(LINUX_CONF_PATH)

    const mergedWindows = mergePatch(baseConf, windowsConf) as PlatformConfig
    const mergedMacos = mergePatch(baseConf, macosConf) as PlatformConfig
    const mergedLinux = mergePatch(baseConf, linuxConf) as PlatformConfig

    expect(mergedWindows.plugins?.['deep-link']?.desktop?.schemes).toEqual([])
    expect(mergedMacos.plugins?.['deep-link']?.desktop?.schemes).toEqual([
      'gamelib'
    ])
    expect(mergedLinux.plugins?.['deep-link']?.desktop?.schemes).toEqual([
      'gamelib'
    ])
  })
})
