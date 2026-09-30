/**
 * Tray glyph variant (quick task 260930-lyk).
 *
 * Replaces the retired boolean `darkTrayIcon` with a tri-state setting. The values name the
 * GLYPH, matching the shipped asset polarity and the legacy boolean:
 *
 *   - `dark`  = the BLACK glyph (`TRAY_ICON_DARK`, for a LIGHT taskbar) = legacy `true`
 *   - `light` = the WHITE glyph (`TRAY_ICON_LIGHT`, for a DARK taskbar) = legacy `false`
 *   - `auto`  = the shell picks: on Windows from the TASKBAR theme (`SystemUsesLightTheme`),
 *               never the app theme; elsewhere `TRAY_ICON_AUTO_FALLBACK`.
 *
 * This module is self-contained (imports nothing from `common/types`) so `types.ts` can import
 * the type from here without a cycle. It is shared by the sidecar, `config.ts`, and the
 * Settings UI; the Rust shell mirrors the wire contract in `src-tauri/src/main.rs`.
 */

/** The tray glyph selection. Values name the glyph, not the taskbar. */
export type TrayIconVariant = 'auto' | 'light' | 'dark'

/** Every variant, in display order. */
export const TRAY_ICON_VARIANTS: readonly TrayIconVariant[] = [
  'auto',
  'light',
  'dark'
]

/**
 * What Auto resolves to where no taskbar signal exists: always on Linux, and on Windows when the
 * `SystemUsesLightTheme` read fails. It is the WHITE glyph (for a dark taskbar), which is the
 * Windows 11 default and the tray's historical startup variant. `resolve_tray_icon_dark` in
 * `src-tauri/src/main.rs` mirrors this.
 */
const TRAY_ICON_AUTO_FALLBACK: TrayIconVariant = 'light'

/** Exact, lowercase match only. */
export function isTrayIconVariant(value: unknown): value is TrayIconVariant {
  return (
    typeof value === 'string' &&
    (TRAY_ICON_VARIANTS as readonly string[]).includes(value)
  )
}

/**
 * Derive the variant from a stored settings object.
 *
 * Precedence: a valid `trayIconVariant` wins; otherwise the legacy boolean `darkTrayIcon`
 * (strictly `true` -> 'dark', strictly `false` -> 'light'); otherwise 'auto'.
 *
 * ORDERING TRAP: the caller must pass the RAW stored object (what is on disk), never a
 * factory-default-merged one. The factory default carries `trayIconVariant: 'auto'`, which
 * would win rule 1 and silently discard a legacy `darkTrayIcon: true`.
 */
export function migrateTrayIconVariant(
  stored:
    | { trayIconVariant?: unknown; darkTrayIcon?: unknown }
    | null
    | undefined
): TrayIconVariant {
  if (isTrayIconVariant(stored?.trayIconVariant)) {
    return stored.trayIconVariant
  }
  if (stored?.darkTrayIcon === true) {
    return 'dark'
  }
  if (stored?.darkTrayIcon === false) {
    return 'light'
  }
  return 'auto'
}

/**
 * The variants the Settings selector offers on a platform. macOS: none (the AppKit template
 * image adapts by itself, D-05). Windows: all three. Elsewhere: no Auto, because there is no
 * reliable panel-colour signal to honour it with.
 */
export function trayIconVariantOptions(
  platform: string
): readonly TrayIconVariant[] {
  if (platform === 'darwin') {
    return []
  }
  if (platform === 'win32') {
    return TRAY_ICON_VARIANTS
  }
  return ['light', 'dark']
}

/**
 * The variant the selector should DISPLAY. A stored 'auto' on a platform that does not offer
 * Auto is shown as `TRAY_ICON_AUTO_FALLBACK`, which is what the tray actually shows there.
 */
export function displayedTrayIconVariant(
  stored: TrayIconVariant,
  platform: string
): TrayIconVariant {
  if (trayIconVariantOptions(platform).includes(stored)) {
    return stored
  }
  if (stored === 'auto') {
    return TRAY_ICON_AUTO_FALLBACK
  }
  return stored
}

/**
 * The ONE place the `tray_set_icon` rustInvoke payload is built. Pinned against
 * `meta/fixtures/tray-set-icon-wire-args.json`, which `main.rs` also asserts.
 */
export function trayIconWireArgs(
  variant: TrayIconVariant
): [{ variant: TrayIconVariant }] {
  return [{ variant }]
}
