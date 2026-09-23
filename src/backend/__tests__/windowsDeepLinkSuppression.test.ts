/**
 * quick-260922-nx4 (history): pinned that the Tauri CLI's install-time NSIS/WiX bundling did NOT
 * register `gamelib://` on Windows, even though the RUNTIME `register_all()` call in
 * `src-tauri/src/main.rs` was already `#[cfg(target_os = "linux")]` and therefore never ran there.
 *
 * The hazard that override closed: the Tauri CLI reads `plugins.deep-link.desktop` (merged across
 * `tauri.conf.json` + the active platform overlay) into its bundler settings, and the NSIS
 * template loops `deep_link_protocols`, emitting `WriteRegStr SHCTX "Software\Classes\<protocol>"`
 * plus a `shell\open\command` pointing at the main exe (the WiX template does the equivalent for
 * `.msi`). At the time, Windows had NO single-instance guard
 * (`acquire_single_instance()` in `src-tauri/src/main.rs` was `#[cfg(unix)]`), so if the installer
 * had registered `gamelib://`, every external open would have spawned a SECOND app with a SECOND
 * sidecar over one set of store files and one download queue -- the exact D-05 hazard Phase 35
 * plan 07's option-c decision existed to prevent (see `.planning/todos/pending/`
 * `2026-08-29-windows-single-instance-guard-and-deep-link-registration.md`).
 *
 * The nx4 fix: `src-tauri/tauri.windows.conf.json` added an EXPLICIT `"schemes": []` override,
 * chosen over a deleted key because `tauri_utils::config::DeepLinkProtocol` (the struct the CLI
 * deserializes `plugins.deep-link.desktop` into) has `schemes: Vec<String>` marked
 * `#[serde(default)]` -- a deleted key and an explicit `[]` both deserialized to an empty Vec at
 * the time, but only the explicit form's meaning did not depend on that default staying empty.
 *
 * **Phase 46 lifts the override.** Plans 46-02/46-03 shipped a real Windows single-instance guard
 * (`CreateMutexW` primary/secondary decision, `CreateNamedPipeW` warm-delivery accept loop --
 * `run_windows_single_instance_accept_loop`, `src-tauri/src/main.rs`), so the D-05 hazard above no
 * longer applies: every external `gamelib://` open now reaches a single running instance, on
 * Windows exactly as it already did on macOS/Linux. `tauri.windows.conf.json`'s `plugins` key was
 * deleted in the SAME commit as this file's Test A/E inversion (REQ-46-05), so the base
 * `tauri.conf.json`'s `["gamelib"]` now flows through to Windows unmodified -- the Windows overlay
 * is the same shape as the macOS/Linux overlays with respect to `plugins`: absent (Test D's
 * pre-existing shape is now what Test A also asserts of Windows).
 *
 * Test A now guards the OPPOSITE failure mode from its nx4 original: it fails if a future edit
 * silently reintroduces a `plugins.deep-link` override, which would quietly kill Windows deep
 * links again without any other signal. Test E pins full three-platform parity: base, macOS,
 * Linux and (now) Windows all merge to `schemes: ["gamelib"]`. Tests B, C and D are unchanged
 * controls (Test D already asserted the macOS/Linux "no override key" shape Windows now shares).
 *
 * Test E's merge-patch helper simulates Tauri's documented platform-config merge (RFC 7396 JSON
 * Merge Patch: objects merge recursively, arrays/scalars are replaced wholesale, `null` deletes a
 * key) purely in-test. It is NOT a claim that this reproduces the Tauri CLI's actual merge
 * implementation byte-for-byte -- the empirical, installer-level check (generated `installer.nsi`
 * now carrying the 6 `Classes\gamelib` lines) is recorded in `46-04-SUMMARY.md`, not here.
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
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
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

describe('Windows gamelib:// deep-link registration (quick-260922-nx4 suppression, lifted by phase 46)', () => {
  test('Test A (inverted, phase 46): tauri.windows.conf.json declares NO plugins["deep-link"] key -- Windows inherits the base schemes now that a single-instance guard exists', () => {
    const windowsConf = loadJson<PlatformConfig>(WINDOWS_CONF_PATH)
    expect(windowsConf.plugins?.['deep-link']).toBeUndefined()
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

  test('Test E (merge-patch simulation, inverted): merging the windows overlay over base now yields schemes === ["gamelib"], matching macOS/linux -- full three-platform parity', () => {
    const baseConf = loadJson<PlatformConfig>(BASE_CONF_PATH)
    const windowsConf = loadJson<PlatformConfig>(WINDOWS_CONF_PATH)
    const macosConf = loadJson<PlatformConfig>(MACOS_CONF_PATH)
    const linuxConf = loadJson<PlatformConfig>(LINUX_CONF_PATH)

    const mergedWindows = mergePatch(baseConf, windowsConf) as PlatformConfig
    const mergedMacos = mergePatch(baseConf, macosConf) as PlatformConfig
    const mergedLinux = mergePatch(baseConf, linuxConf) as PlatformConfig

    expect(mergedWindows.plugins?.['deep-link']?.desktop?.schemes).toEqual([
      'gamelib'
    ])
    expect(mergedMacos.plugins?.['deep-link']?.desktop?.schemes).toEqual([
      'gamelib'
    ])
    expect(mergedLinux.plugins?.['deep-link']?.desktop?.schemes).toEqual([
      'gamelib'
    ])
  })
})
