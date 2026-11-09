use super::*;

// ---- Tray icon (Phase 34.1 Plan 06, D-11; macOS template redirect, gap G3) ----
//
// Icon bytes are embedded at COMPILE TIME via `include_bytes!`, not resolved at runtime from
// `publicDir`/`app.getAppPath()`. This deliberately sidesteps this repo's recurring
// publicDir/getAppPath path-resolution failure family
// ([[publicdir-getapppath-chunking]], the bundled-JSON-asset gotcha) -- no runtime path is
// resolved and no file can be substituted post-build (T-34.1-21).
//
// **macOS** uses a THIRD asset, `TRAY_ICON_TEMPLATE`, instead of choosing between the two
// colour variants below. The two rasters then named `public/icon-dark.png` and
// `public/icon-light.png` were found to be
// byte-identical (see `.planning/todos/pending/tray-dark-light-icons-are-identical.md`), and a
// straight RGB inversion of the full-colour artwork was tried and REJECTED (see
// `meta/trayIconVariants.ts`'s docstring) because it produced a differently-coloured smudge, not
// a legible glyph, at 22px. The fix actually adopted is a macOS AppKit template image --
// `meta/trayIconVariants.ts` hue-segments the cat glyph out of its starburst background and
// emits `public/icon-tray-template.png`: solid black RGB, the glyph silhouette carried entirely
// in alpha. `TrayIcon::set_icon_as_template`/`icon_as_template` (tauri 2.11.5,
// `tray/mod.rs:294,560` -- verified against the installed crate, not from memory) tell macOS to
// render it black-on-light and white-on-dark automatically. **Consequence, stated explicitly:**
// on macOS, the tri-state `trayIconVariant` setting becomes VESTIGIAL (and Settings hides it,
// D-05) -- `tray_image` below returns the same template
// image regardless of the `dark` argument, so toggling the setting has zero visible effect
// there BY DESIGN. This is a deliberate no-op, not a regression of this same bug: the setting
// still round-trips through the existing single `tray_set_icon` arm (D-01's "zero new Rust
// arms" is preserved), it simply has no macOS-visible effect, exactly like several other
// settings that are meaningful on some platforms and not others.
//
// **Windows/Linux** still select between `TRAY_ICON_DARK`/`TRAY_ICON_LIGHT`, because neither
// platform has an equivalent of AppKit's template auto-invert -- the choice has to be made by
// the `trayIconVariant` setting (Auto / Light / Dark; Auto reads the Windows TASKBAR theme, see
// `resolve_tray_icon_dark`) rather than by the OS. Those two files were byte-identical for the
// project's entire history, which is what made the setting a no-op; as of 2026-08-22 they are
// generated from the same hue-segmented mask as the template, differing only in fill (black for
// a light taskbar, white for a dark one), and `meta/trayIconVariants.ts` refuses to write an
// identical pair at any scale.

/// Unique id for the app's single tray icon; looked up later via `app.tray_by_id(...)`.
pub(crate) const TRAY_ICON_ID: &str = "gamelib-tray";
/// 1x1 fully-transparent pixel, used only if all bundled tray PNGs fail to decode. Should
/// never happen in practice (they are checked-in assets) -- exists purely so `tray_image`
/// has an infallible last resort and can never panic (T-34.1-22).
const TRAY_ICON_FALLBACK_PIXEL: [u8; 4] = [0, 0, 0, 0];

/// Whether the tray icon should be marked as an AppKit template image. **macOS only** --
/// `TrayIcon::set_icon_as_template`/`TrayIconBuilder::icon_as_template` are documented no-ops on
/// Windows/Linux (tauri 2.11.5, `tray/mod.rs:294,560`), but this helper keeps call sites
/// self-documenting about WHY macOS is special-cased rather than relying on the callee's silent
/// no-op.
pub(crate) fn tray_is_template() -> bool {
    cfg!(target_os = "macos")
}

/// Decode the requested tray icon. **macOS** always returns the template silhouette
/// (`TRAY_ICON_TEMPLATE`), ignoring `dark` -- see the block comment above. **Windows/Linux**
/// keep the original dark/light colour selection. Every failure path degrades instead of
/// panicking: on macOS a bad/corrupt template asset falls through to the colour selection
/// below; a bad/corrupt colour asset falls back to the light variant; if that also fails to
/// decode, falls back to a blank 1x1 pixel image built via `Image::new` (infallible, no decode
/// step) -- `tray_image` can never be the reason `.setup()` panics (T-34.1-22).
pub(crate) fn tray_image(dark: bool) -> Image<'static> {
    #[cfg(target_os = "macos")]
    {
        if let Ok(img) = Image::from_bytes(TRAY_ICON_TEMPLATE) {
            return img;
        }
        shell_eprintln!(
            "[shell] WARN: macOS tray template image failed to decode, falling back to the colour variant"
        );
    }
    let bytes = if dark {
        TRAY_ICON_DARK
    } else {
        TRAY_ICON_LIGHT
    };
    if let Ok(img) = Image::from_bytes(bytes) {
        return img;
    }
    shell_eprintln!(
        "[shell] WARN: requested tray icon variant (dark={dark}) failed to decode, trying light variant"
    );
    if let Ok(img) = Image::from_bytes(TRAY_ICON_LIGHT) {
        return img;
    }
    shell_eprintln!(
        "[shell] WARN: both tray icon variants failed to decode, using a blank fallback"
    );
    Image::new(&TRAY_ICON_FALLBACK_PIXEL, 1, 1)
}

/// The user's tray glyph selection (quick 260930-lyk), mirroring `TrayIconVariant` in
/// `src/common/trayIconVariant.ts`. Values name the GLYPH: `Dark` is the black glyph (for a
/// LIGHT taskbar), `Light` the white glyph (for a DARK taskbar), `Auto` lets the shell pick.
///
/// On Windows, Auto reads the TASKBAR theme (`SystemUsesLightTheme`), never the app theme
/// value and never the window theme -- see `read_system_uses_light_theme`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum TrayIconMode {
    Auto,
    Light,
    Dark,
}

/// Exact lowercase allow-list parse. Anything else -- including `None` and `"Dark"` -- is the
/// documented default, `Auto` (T-260930-lyk-01).
pub(crate) fn parse_tray_icon_mode(value: Option<&str>) -> TrayIconMode {
    match value {
        Some("light") => TrayIconMode::Light,
        Some("dark") => TrayIconMode::Dark,
        _ => TrayIconMode::Auto,
    }
}

/// The raw `variant` string of a `tray_set_icon` payload (`[{ "variant": "..." }]`), if present.
pub(crate) fn tray_set_icon_variant_str(args: &[Value]) -> Option<&str> {
    args.first()
        .and_then(|v| v.get("variant"))
        .and_then(|v| v.as_str())
}

/// Parse a `tray_set_icon` payload. The shape is pinned by
/// `meta/fixtures/tray-set-icon-wire-args.json`, which the sidecar's tests assert too.
pub(crate) fn tray_set_icon_mode_from_args(args: &[Value]) -> TrayIconMode {
    parse_tray_icon_mode(tray_set_icon_variant_str(args))
}

/// Map the Windows TASKBAR-theme value to a glyph. `SystemUsesLightTheme == 0` is a dark taskbar,
/// so the WHITE glyph (`false`); any other value is a light taskbar, so the BLACK glyph (`true`).
/// `None` (unreadable) is the white-glyph fallback -- the Windows 11 default dark taskbar and the
/// tray's historical startup variant; mirrors `TRAY_ICON_AUTO_FALLBACK` in
/// `src/common/trayIconVariant.ts`.
pub(crate) fn tray_glyph_dark_for_system_uses_light_theme(system_uses_light_theme: Option<u32>) -> bool {
    match system_uses_light_theme {
        Some(0) => false,
        Some(_) => true,
        None => false,
    }
}

/// Resolve a mode to "use the dark (black) glyph?". `Light` and `Dark` ignore the registry
/// argument; `Auto` follows the taskbar value (see `read_system_uses_light_theme`).
pub(crate) fn resolve_tray_icon_dark(mode: TrayIconMode, system_uses_light_theme: Option<u32>) -> bool {
    match mode {
        TrayIconMode::Light => false,
        TrayIconMode::Dark => true,
        TrayIconMode::Auto => tray_glyph_dark_for_system_uses_light_theme(system_uses_light_theme),
    }
}

/// The mode most recently received on `tray_set_icon`, so the Windows taskbar-theme watcher knows
/// whether Auto is in force. Starts as Auto (the factory default) until the sidecar's first sync.
pub(crate) static TRAY_ICON_MODE: AtomicU8 = AtomicU8::new(0);

pub(crate) fn store_tray_icon_mode(mode: TrayIconMode) {
    let byte = match mode {
        TrayIconMode::Auto => 0,
        TrayIconMode::Light => 1,
        TrayIconMode::Dark => 2,
    };
    TRAY_ICON_MODE.store(byte, Ordering::Relaxed);
}

/// Any unknown byte reads as Auto.
pub(crate) fn current_tray_icon_mode() -> TrayIconMode {
    match TRAY_ICON_MODE.load(Ordering::Relaxed) {
        1 => TrayIconMode::Light,
        2 => TrayIconMode::Dark,
        _ => TrayIconMode::Auto,
    }
}

/// The glyph for the mode currently in force, reading the registry only for Auto. Used for the
/// tray's startup image, so it is correct on Windows before the sidecar's first sync arrives.
pub(crate) fn resolve_current_tray_icon_dark() -> bool {
    let mode = current_tray_icon_mode();
    let system_uses_light_theme = if mode == TrayIconMode::Auto {
        read_system_uses_light_theme()
    } else {
        None
    };
    resolve_tray_icon_dark(mode, system_uses_light_theme)
}

/// Registry subkey (under HKCU) holding the Windows theme values.
#[cfg(windows)]
const PERSONALIZE_SUBKEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";
/// The TASKBAR / system-UI theme value: 1 = light taskbar, 0 = dark taskbar.
#[cfg(windows)]
const SYSTEM_USES_LIGHT_THEME_VALUE: &str = "SystemUsesLightTheme";

#[cfg(windows)]
fn wide_nul(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Read `SystemUsesLightTheme` from HKCU (Windows). This is the TASKBAR theme -- never the app
/// theme and never the window theme. `Some(value)` only for a genuine 4-byte DWORD; every other
/// outcome (missing key/value, wrong type, error) is `None`, which resolves to the white glyph.
/// No logging here: the caller logs once when Auto falls back.
#[cfg(windows)]
pub(crate) fn read_system_uses_light_theme() -> Option<u32> {
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};

    let subkey = wide_nul(PERSONALIZE_SUBKEY);
    let value_name = wide_nul(SYSTEM_USES_LIGHT_THEME_VALUE);
    let mut data: u32 = 0;
    let mut cb: u32 = std::mem::size_of::<u32>() as u32;
    // SAFETY: `subkey` and `value_name` are NUL-terminated UTF-16 buffers that outlive the call.
    // `data` is a live, aligned `u32` and `cb` is its exact byte size, so the callee can write at
    // most 4 bytes; `RRF_RT_REG_DWORD` makes it reject any non-DWORD value type, and the type
    // out-pointer is null (not requested). No handle is opened or retained (HKEY_CURRENT_USER is
    // a predefined root), so there is nothing to close.
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            value_name.as_ptr(),
            RRF_RT_REG_DWORD,
            std::ptr::null_mut(),
            &mut data as *mut u32 as *mut core::ffi::c_void,
            &mut cb,
        )
    };
    if status == ERROR_SUCCESS && cb == std::mem::size_of::<u32>() as u32 {
        Some(data)
    } else {
        None
    }
}

/// Off Windows there is no taskbar-theme signal, so Auto resolves to the white glyph (Linux,
/// DEC-4). macOS never reaches the colour choice: `tray_image` returns the AppKit template.
#[cfg(not(windows))]
pub(crate) fn read_system_uses_light_theme() -> Option<u32> {
    None
}

/// Windows only: re-resolve the tray glyph whenever the Windows theme registry key changes, so
/// Auto follows a TASKBAR-only theme change with no restart (quick 260930-lyk).
///
/// Why `RegNotifyChangeKeyValue` and NOT tao's `WindowEvent::ThemeChanged` (measured in the
/// installed tao 0.35.3, `src/platform_impl/windows/event_loop.rs:2269-2291`): `update_theme`
/// (reached from the `WM_SETTINGCHANGE` arm) recomputes the window theme from the APP-theme
/// registry value (`AppsUseLightTheme`) and emits `ThemeChanged` ONLY when that value differs
/// from the stored one -- and returns early with no event at all when a preferred theme is set.
/// A taskbar-only change (Colors set to "Custom", only the Windows mode flipped) never changes
/// the app-theme value, so ThemeChanged would never fire for exactly the scenario this task
/// exists for. The app-theme value is therefore deliberately not read anywhere in this file, and
/// neither is the window theme.
///
/// The key notification is only a TRIGGER: every glyph decision is recomputed from a fresh
/// `SystemUsesLightTheme` read, and nothing from the notification is used as a value. Only acts
/// when the mode in force is Auto. Every failure logs once and ends the thread -- a failing
/// notify must never become a busy loop (T-260930-lyk-03) -- and nothing here can panic.
#[cfg(windows)]
pub(crate) fn spawn_taskbar_theme_watcher(app: tauri::AppHandle) {
    let spawned = std::thread::Builder::new()
        .name("tray-taskbar-theme".into())
        .spawn(move || {
            use windows_sys::Win32::Foundation::ERROR_SUCCESS;
            use windows_sys::Win32::System::Registry::{
                HKEY, HKEY_CURRENT_USER, KEY_NOTIFY, REG_NOTIFY_CHANGE_LAST_SET, RegCloseKey,
                RegNotifyChangeKeyValue, RegOpenKeyExW,
            };

            let subkey = wide_nul(PERSONALIZE_SUBKEY);
            let mut key: HKEY = std::ptr::null_mut();
            // SAFETY: `subkey` is a NUL-terminated UTF-16 buffer that outlives the call, and
            // `key` is a live local the callee writes the opened handle into.
            let opened = unsafe {
                RegOpenKeyExW(HKEY_CURRENT_USER, subkey.as_ptr(), 0, KEY_NOTIFY, &mut key)
            };
            if opened != ERROR_SUCCESS {
                shell_eprintln!(
                    "[shell] WARN: taskbar theme watcher could not open the Personalize key (code {opened}) -- Auto keeps the value read at the last sync"
                );
                return;
            }

            loop {
                // SAFETY: `key` is the handle opened above with KEY_NOTIFY; it is closed exactly
                // once, after this loop, on every path out of it (no early `return` between the
                // successful open and the close). No event handle is passed and the call is
                // synchronous (`fasynchronous == 0`), so it blocks this dedicated thread until
                // a value directly under the key changes; nothing else can invalidate `key`.
                let status = unsafe {
                    RegNotifyChangeKeyValue(
                        key,
                        0,
                        REG_NOTIFY_CHANGE_LAST_SET,
                        std::ptr::null_mut(),
                        0,
                    )
                };
                if status != ERROR_SUCCESS {
                    shell_eprintln!(
                        "[shell] WARN: taskbar theme watcher stopped -- RegNotifyChangeKeyValue returned {status}"
                    );
                    break;
                }
                if current_tray_icon_mode() != TrayIconMode::Auto {
                    continue;
                }
                let dark = resolve_tray_icon_dark(TrayIconMode::Auto, read_system_uses_light_theme());
                match app.tray_by_id(TRAY_ICON_ID) {
                    Some(tray) => {
                        if let Err(e) =
                            tray.set_icon_with_as_template(Some(tray_image(dark)), tray_is_template())
                        {
                            shell_eprintln!(
                                "[shell] WARN: taskbar theme watcher could not set the tray icon ({e})"
                            );
                        }
                    }
                    None => {
                        shell_eprintln!(
                            "[shell] taskbar theme watcher: no tray with id {TRAY_ICON_ID:?} -- stopping"
                        );
                        break;
                    }
                }
            }

            // SAFETY: `key` is the still-open handle from the successful `RegOpenKeyExW` above.
            unsafe {
                RegCloseKey(key);
            }
        });
    if let Err(e) = spawned {
        shell_eprintln!("[shell] WARN: could not spawn the taskbar theme watcher thread ({e})");
    }
}
