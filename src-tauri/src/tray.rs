use super::*;

mod icon;
pub(crate) use icon::*;

mod recent;
pub(crate) use recent::*;

/// Sidecar invoke channel that resolves a bare appName to its `Runner`
/// (`appShellFlowRegistration.ts`). The tray's recent-games entries carry only
/// `{ appName, title }` (`common/types.ts`'s `RecentGame`), but the `launch` channel requires a
/// runner and -- correctly -- refuses to guess one (T-34.5-46-03's confused-deputy guard). The
/// Electron tray sidestepped this by handing a deep-link URL to `handleProtocol`, which
/// resolved the runner itself; routing an INTERNAL click out through a URL scheme is exactly
/// what this plan's constraints forbid (T-35-21), so the resolution step is exposed as a plain
/// sidecar channel instead and the launch itself goes through the SAME, already-hardened
/// `launch` handler the UI uses. No URL is constructed anywhere on this path.
const TRAY_RESOLVE_RUNNER_CHANNEL: &str = "trayResolveRunner";

/// Rebuild the tray's context menu from the current recent-games cache.
///
/// Order mirrors `tray_icon.ts`'s own template: recent games first, a separator, then
/// Show / About / Quit. Returns `None` on any builder failure -- callers log and keep the
/// PREVIOUS menu rather than clearing it (T-34.1-22: a stale menu beats no menu).
pub(crate) fn build_tray_menu(app: &AppHandle) -> Option<tauri::menu::Menu<tauri::Wry>> {
    let recents: Vec<TrayRecentGame> = match tray_recent_games().lock() {
        Ok(guard) => guard.clone(),
        Err(poisoned) => {
            shell_eprintln!("[shell] WARN: tray recent-games cache mutex poisoned -- recovering");
            poisoned.into_inner().clone()
        }
    };

    let mut recent_items = Vec::new();
    for game in &recents {
        // `tray_recent_menu_id` returns None for an appName that could not survive the
        // id round-trip; skipping it here is what keeps "every rendered entry is clickable"
        // true by construction rather than by hope.
        let Some(id) = tray_recent_menu_id(&game.app_name) else {
            shell_eprintln!(
                "[shell] WARN: tray recent-games entry skipped -- appName failed the plain-appName check (len={})",
                game.app_name.len()
            );
            continue;
        };
        match MenuItemBuilder::with_id(id, tray_recent_title(game)).build(app) {
            Ok(item) => recent_items.push(item),
            Err(e) => shell_eprintln!(
                "[shell] WARN: tray recent-game menu item failed to build ({e}) -- skipping that entry"
            ),
        }
    }

    let show_item = match MenuItemBuilder::with_id("show", "Show GameLib").build(app) {
        Ok(item) => item,
        Err(e) => {
            shell_eprintln!(
                "[shell] WARN: tray menu items failed to build ({e}) -- continuing without a tray"
            );
            return None;
        }
    };
    let about_item = match MenuItemBuilder::with_id("about", "About GameLib").build(app) {
        Ok(item) => item,
        Err(e) => {
            shell_eprintln!(
                "[shell] WARN: tray menu items failed to build ({e}) -- continuing without a tray"
            );
            return None;
        }
    };
    let quit_item = match MenuItemBuilder::with_id("quit", "Quit").build(app) {
        Ok(item) => item,
        Err(e) => {
            shell_eprintln!(
                "[shell] WARN: tray menu items failed to build ({e}) -- continuing without a tray"
            );
            return None;
        }
    };

    let mut builder = MenuBuilder::new(app);
    if !recent_items.is_empty() {
        for item in &recent_items {
            builder = builder.item(item);
        }
        builder = builder.separator();
    }
    builder = builder.items(&[&show_item, &about_item, &quit_item]);

    match builder.build() {
        Ok(menu) => Some(menu),
        Err(e) => {
            shell_eprintln!(
                "[shell] WARN: tray menu failed to build ({e}) -- continuing without a tray"
            );
            None
        }
    }
}

/// Replace the live tray's menu with a freshly built one. A no-op (with a log line) when no
/// tray exists -- it may legitimately have been suppressed by `noTrayIcon` or failed to build
/// at startup, and neither is an error condition here.
fn refresh_tray_menu(app: &AppHandle) {
    let Some(tray) = app.tray_by_id(TRAY_ICON_ID) else {
        shell_eprintln!("[shell] tray menu refresh: no tray with id {TRAY_ICON_ID:?}, skipping");
        return;
    };
    let Some(menu) = build_tray_menu(app) else {
        shell_eprintln!(
            "[shell] WARN: tray menu refresh failed to build a menu -- keeping the previous menu"
        );
        return;
    };
    if let Err(e) = tray.set_menu(Some(menu)) {
        shell_eprintln!(
            "[shell] WARN: tray menu refresh failed to apply ({e}) -- keeping the previous menu"
        );
    }
}

/// Replace the recent-games cache and rebuild the tray menu. Called from the reader thread on
/// every `recentGamesChanged` push, so the tray tracks the list the same way `tray_icon.ts`'s
/// own `backendEvents.on('recentGamesChanged')` listener did.
pub(crate) fn update_tray_recent_games(app: &AppHandle, games: Vec<TrayRecentGame>) {
    match tray_recent_games().lock() {
        Ok(mut guard) => *guard = games,
        Err(poisoned) => {
            shell_eprintln!("[shell] WARN: tray recent-games cache mutex poisoned -- recovering");
            *poisoned.into_inner() = games;
        }
    }
    refresh_tray_menu(app);
}

/// Open the About dialog from the tray.
///
/// Reaches `window.api.showAboutWindow` (`src/preload/api/helpers.ts`, barrelled into
/// `window.api` by `src/preload/api/index.ts`). Since quick `260905-d33` that function no
/// longer opens a `WebviewWindow`: About is an in-app modal (`AboutDialogHost`,
/// `src/frontend/components/UI/AboutDialog/`), mounted app-level from `App.tsx` inside `main`
/// itself. That migration is exactly what made raising the window here mandatory (fixed by
/// quick `260907-9co`): a free-standing `WebviewWindow` used to come up on its own regardless
/// of `main`'s state; a modal mounted inside `main` cannot. A hidden (`startInTray`), minimized,
/// or backgrounded `main` used to swallow the whole interaction -- the eval ran and the modal
/// mounted, but nothing was ever visible.
///
/// Three calls raise the window before the eval. Referenced against the vendored runtime
/// (`tao-0.35.3`, `src/platform_impl/macos/window.rs`) -- but read the LOAD-BEARING line
/// carefully, because only one of the three actually carries the fix ON MACOS:
///   1. On macOS, `show()` is THE call that fixes this. `set_visible(true)` (`:668-673`) is
///      `util::make_key_and_order_front_sync` -> `makeKeyAndOrderFront:`
///      (`util/async.rs:212-217`), which AppKit defines as deminiaturizing a miniaturized
///      window AND making it key. So on macOS, `show()` alone un-minimizes, raises and focuses.
///   2. On macOS, `unminimize()` is DEFENCE IN DEPTH, not a requirement. See the correction note
///      below. It is free on every non-minimized path: internally `set_minimized(false)`
///      (`:1035-1050`) early-returns when the window is already not miniaturized.
///   3. `set_focus()` is a no-op in the minimized case by design -- it gates on
///      `!is_minimized && is_visible` (`:677-685`) -- and does the real work only for a
///      window that is already visible but backgrounded. The eval comes LAST so the window is
///      already up when the About modal mounts inside it.
///
/// CORRECTION (quick `260907-9co`, after the live gate; scoped to macOS). This comment
/// previously claimed `unminimize()` was mandatory -- that "a minimized `main` would otherwise
/// never focus at all" -- reasoning from `set_focus()`'s `!is_minimized` guard alone. That
/// premise is true and the conclusion was FALSE ON MACOS: it never traced what `show()` does to
/// a miniaturized window there. DISPROVED BY MEASUREMENT, not by re-reading: the tray's own
/// "Show GameLib" arm was `show()` + `set_focus()` with no `unminimize()`, and it restored a
/// Dock-minimized `main` correctly on macOS. `unminimize()` is kept here as an explicit, free
/// statement of intent, but on macOS it is not what makes the minimized case work. Do not cite
/// this site as precedent for it being required on macOS.
///
/// CORRECTED AGAIN (plan 46-06, `46-LIVE-GATE.md` Check 3, 2026-09-24). The prior revision went
/// on to say the four sibling raise sites
/// (`build_tray_menu`'s child-window attachment fallback, the `__GAMELIB_FOCUS__`
/// single-instance socket handler, the tray menu `"show"` arm, and the tray icon left-click
/// handler) shared this fix, leaving nothing outstanding at any of them. That held on macOS
/// only, and was FALSE on Windows. Per tao-0.35.3's Windows implementation
/// (`platform_impl/windows/window.rs:164-172,175-186`;
/// `platform_impl/windows/window_state.rs:390-402`), `set_visible(true)` issues no `ShowWindow`
/// call when the window is already visible (only the VISIBLE flag is diffed, and a
/// minimized-but-visible window has no flag diff), and `set_focus()` is gated on
/// `!is_minimized` -- so `show()` + `set_focus()` alone leaves a minimized window minimized on
/// Windows, exactly as measured live at Check 3. On Windows, `unminimize()`
/// (`set_minimized(false)`, `window.rs:584-597`) IS the load-bearing call: it is the only one of
/// the three that issues `ShowWindow(hwnd, SW_RESTORE)`. As of plan 46-06, the Windows
/// focus-sentinel arm (`handle_windows_single_instance_connection`) and the tray `"show"` menu
/// arm and left-click handler all call `unminimize()` before `show()` and `set_focus()`, for
/// this reason. The Unix socket handler named above was deliberately left UNCHANGED by plan
/// 46-06 -- at that point it sat inside a `#[cfg(unix)]` region pinned byte-identical to the
/// pre-phase baseline (`5bc4fa825`) by the phase-46 Unix-region gate (`46-unix-cfg-regions.awk`),
/// and the Linux case was UNMEASURED and suspect, tracked as
/// `.planning/todos/pending/2026-09-24-linux-unix-focus-sentinel-arm-may-not-restore-a-minimized-window.md`.
///
/// CORRECTED A THIRD TIME (debug session `linux-focus-restore-minimize`, 2026-09-26). Measured
/// live on real Linux hardware (Pop!_OS 22.04, GNOME Shell/mutter, GTK 3.24.33) via a faithful
/// GTK3/X11 port of tao-0.35.3's exact call sequence, read from the vendored source
/// (`platform_impl/linux/window.rs:558-576`, `platform_impl/linux/event_loop.rs:296-324`): tao's
/// Linux `set_focus()` is gated on `!self.minimized.load(..) && self.window.get_visible()`, the
/// same shape as Windows, and `show()` (`show_all()`) does not clear GTK/ICCCM iconic state
/// either. Live EWMH `_NET_WM_STATE` observation confirmed the suspicion: `show()` + `set_focus()`
/// alone left a minimized window at `_NET_WM_STATE_HIDDEN`; adding `unminimize()`
/// (`deiconify()`) before them flipped it to `_NET_WM_STATE_FOCUSED`, reproduced on 3/3 runs. The
/// Unix single-instance socket handler now calls `unminimize()` before `show()` and `set_focus()`,
/// the same shape as the Windows fix -- a deliberate, on-purpose divergence of this
/// `#[cfg(unix)]` region from the phase-46 gate's `5bc4fa825` baseline, not a violation of the
/// pin (the pin only ever scoped "no drive-by edits during phase 46"; this is a targeted,
/// evidenced fix in a later, separate debug session). The above-named todo is now closed.
///
/// Note the CONSEQUENCE for whoever edits the preload name next: the eval below is
/// optional-chained, so if `window.api.showAboutWindow` ever stops existing this menu item does
/// nothing and reports nothing, on either side.
///
/// Deliberately NOT routed as a new frontend-message channel either: nothing in the renderer
/// listens for an inbound `showAboutWindow` push (it has only ever been an OUTBOUND call), so
/// emitting one would be a send with no registered listener -- a live silent no-op, a shape this
/// repo has already shipped once.
///
/// The evaluated script is a FIXED literal with no interpolation -- there is no caller-supplied
/// value anywhere in it, so it carries no injection surface -- and it is fully optional-chained
/// so a webview that has not finished attaching `window.api` yet does nothing instead of
/// throwing into the renderer's console. The three raise calls above take no arguments at all,
/// so they add no injection surface either.
pub(crate) fn open_about_window_from_tray(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        shell_eprintln!(
            "[shell] WARN: tray About: no '{MAIN_WINDOW_LABEL}' window to reach window.api.showAboutWindow -- skipping"
        );
        return;
    };
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    if let Err(e) = window.eval("window.api?.showAboutWindow?.()") {
        shell_eprintln!("[shell] WARN: tray About: eval failed ({e}) -- About window not opened");
    }
}


/// Dispatch a recent-game launch to the sidecar, in-process.
///
/// One hop when the cached entry carries a runner, two when it does not — both on a spawned
/// worker thread so a menu click never blocks the UI thread:
///   1. (ONLY when `known_runner` is `None`) `trayResolveRunner` -> the runner for this appName.
///   2. `launch` -> the SAME invoke handler the renderer's own launch button uses.
///
/// **Why the probe still exists.** `RecentGame` now persists `runner` (`common/types.ts`), so a
/// freshly-written entry needs no lookup at all — the value was always available at the write
/// site and used to be discarded there. But the field is optional and genuinely absent for every
/// entry written before that change, which is to say for every existing install's entire history.
/// `trayResolveRunner` is therefore demoted from "the mechanism" to "the LEGACY FALLBACK", and is
/// deliberately not deleted: a migration that stranded those entries would trade a slow-but-
/// correct path for a dead menu item.
///
/// `launch` IS on `LONG_RUNNING_CHANNELS` (quick 261026-jmm), so this call waits for the real
/// result. For the runners whose handler awaits the whole game session, that means the spawned
/// worker thread blocks for the session, which is fine because it is this call's own thread and
/// never the UI thread. The outcome is still only logged, not surfaced, because the tray has
/// nothing to show the user either way.
pub(crate) fn dispatch_tray_launch(app: &AppHandle, app_name: String, known_runner: Option<String>) {
    let Some(state) = app.try_state::<Arc<SidecarState>>() else {
        shell_eprintln!("[shell] WARN: tray recent-game launch: no sidecar state -- skipping");
        return;
    };
    let state = state.inner().clone();
    thread::spawn(move || {
        let runner = match known_runner {
            Some(runner) => {
                shell_eprintln!(
                    "[shell] tray recent-game launch: using the runner persisted on the entry (no lookup needed)"
                );
                runner
            }
            None => {
                shell_eprintln!(
                    "[shell] tray recent-game launch: entry carries no runner (pre-Phase-35 entry) -- falling back to the trayResolveRunner probe"
                );
                match state.invoke(
                    TRAY_RESOLVE_RUNNER_CHANNEL.to_string(),
                    vec![Value::String(app_name.clone())],
                ) {
                    Ok(Value::String(runner)) => runner,
                    Ok(_) => {
                        shell_eprintln!(
                            "[shell] tray recent-game launch: sidecar could not resolve a runner for the selected entry -- not launching"
                        );
                        return;
                    }
                    Err(e) => {
                        shell_eprintln!(
                            "[shell] WARN: tray recent-game launch: runner lookup failed ({e})"
                        );
                        return;
                    }
                }
            }
        };
        let mut payload = serde_json::Map::new();
        payload.insert("appName".to_string(), Value::String(app_name));
        payload.insert("runner".to_string(), Value::String(runner));
        match state.invoke("launch".to_string(), vec![Value::Object(payload)]) {
            Ok(_) => {
                shell_eprintln!("[shell] tray recent-game launch: dispatched to the sidecar: ok")
            }
            Err(e) => {
                shell_eprintln!(
                    "[shell] tray recent-game launch: dispatched to the sidecar: err={e}"
                )
            }
        }
    });
}


// Swap the real Tauri tray's icon (Phase 34.1 Plan 06, D-11). Backs the sidecar's
// `changeTrayColor` registration (`appShellFlowRegistration.ts`), which reads
// `trayIconVariant` from `GlobalConfig` and forwards it here as `{ variant }` (auto /
// light / dark; pinned by `meta/fixtures/tray-set-icon-wire-args.json`). Still the
// ONLY tray-icon `dispatch_rust_channel` arm -- D-01 keeps window chrome renderer-side
// with zero new Rust arms.
pub(crate) fn rpc_tray_set_icon(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    // Wire-compat (kept deliberately, not tidied into a hard error): the generated
    // `TraySetIconArgs` accepts exactly the three shipped variants, but an unrecognised
    // variant or the retired `{ dark }` shape has always resolved to Auto here (pinned by
    // `tray_variant_wire_contract_retired_dark_bool_shape_is_auto_not_dark`). So a
    // `from_args` failure falls back to the lenient Auto mapping instead of erroring.
    let mode = match TraySetIconArgs::from_args(args) {
        Ok(a) => match a.variant {
            TraySetIconArgsVariant::Auto => TrayIconMode::Auto,
            TraySetIconArgsVariant::Light => TrayIconMode::Light,
            TraySetIconArgsVariant::Dark => TrayIconMode::Dark,
        },
        Err(_) => {
            if let Some(raw) = tray_set_icon_variant_str(args) {
                // Length only, never the value (T-260930-lyk-01/05).
                shell_eprintln!(
                    "[shell] WARN: tray_set_icon: unrecognised variant ({} bytes) -- treating as auto",
                    raw.len()
                );
            }
            tray_set_icon_mode_from_args(args)
        }
    };
    store_tray_icon_mode(mode);
    let system_uses_light_theme = if mode == TrayIconMode::Auto {
        read_system_uses_light_theme()
    } else {
        None
    };
    if mode == TrayIconMode::Auto && system_uses_light_theme.is_none() {
        shell_eprintln!(
            "[shell] tray_set_icon: SystemUsesLightTheme unreadable -- Auto falling back to the light glyph"
        );
    }
    let dark = resolve_tray_icon_dark(mode, system_uses_light_theme);
    match app.tray_by_id(TRAY_ICON_ID) {
        Some(tray) => {
            // Atomic icon+template-flag update (tauri 2.11.5, `tray/mod.rs:569-599`):
            // calling `set_icon` followed by `set_icon_as_template` separately causes a
            // visible flicker on macOS as the icon renders twice. Falls back to plain
            // `set_icon` on Windows/Linux, where `is_template` is a documented no-op.
            tray.set_icon_with_as_template(Some(tray_image(dark)), tray_is_template())
                .map_err(|e| e.to_string())?;
        }
        // A missing tray is not an error condition -- it may have legitimately
        // failed to build at startup (T-34.1-22); log and resolve successfully.
        None => shell_eprintln!(
            "[shell] tray_set_icon: no tray found with id {TRAY_ICON_ID:?}, skipping"
        ),
    }
    Ok(Value::Null)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // ---- quick 260930-lyk: tri-state tray glyph (Auto / Light / Dark) ----

    #[test]
    fn tray_variant_parse_is_an_exact_allow_list() {
        assert_eq!(parse_tray_icon_mode(Some("auto")), TrayIconMode::Auto);
        assert_eq!(parse_tray_icon_mode(Some("light")), TrayIconMode::Light);
        assert_eq!(parse_tray_icon_mode(Some("dark")), TrayIconMode::Dark);
        // Wrong case and absent both fall to the documented default.
        assert_eq!(parse_tray_icon_mode(Some("Dark")), TrayIconMode::Auto);
        assert_eq!(parse_tray_icon_mode(Some("")), TrayIconMode::Auto);
        assert_eq!(parse_tray_icon_mode(None), TrayIconMode::Auto);
    }

    #[test]
    fn tray_variant_taskbar_value_maps_to_the_glyph() {
        // 0 = dark taskbar -> white glyph; 1 = light taskbar -> black glyph; unreadable -> white.
        assert!(!tray_glyph_dark_for_system_uses_light_theme(Some(0)));
        assert!(tray_glyph_dark_for_system_uses_light_theme(Some(1)));
        assert!(!tray_glyph_dark_for_system_uses_light_theme(None));
    }

    #[test]
    fn tray_variant_resolve_honours_the_mode() {
        // Light / Dark ignore the registry value entirely.
        assert!(!resolve_tray_icon_dark(TrayIconMode::Light, Some(1)));
        assert!(resolve_tray_icon_dark(TrayIconMode::Dark, Some(0)));
        assert!(resolve_tray_icon_dark(TrayIconMode::Dark, None));
        // Auto follows the taskbar value.
        assert!(resolve_tray_icon_dark(TrayIconMode::Auto, Some(1)));
        assert!(!resolve_tray_icon_dark(TrayIconMode::Auto, Some(0)));
        assert!(!resolve_tray_icon_dark(TrayIconMode::Auto, None));
    }

    #[test]
    fn tray_variant_mode_store_round_trips() {
        // One test owns the process-wide static so parallel tests cannot interleave writes.
        for mode in [TrayIconMode::Light, TrayIconMode::Dark, TrayIconMode::Auto] {
            store_tray_icon_mode(mode);
            assert_eq!(current_tray_icon_mode(), mode);
        }
        TRAY_ICON_MODE.store(200, Ordering::Relaxed);
        assert_eq!(current_tray_icon_mode(), TrayIconMode::Auto);
        store_tray_icon_mode(TrayIconMode::Auto);
    }

    const TRAY_SET_ICON_WIRE_FIXTURE: &str =
        include_str!("../../meta/fixtures/tray-set-icon-wire-args.json");

    #[test]
    fn tray_variant_wire_contract_parses_every_shipped_payload() {
        let doc: Value = serde_json::from_str(TRAY_SET_ICON_WIRE_FIXTURE)
            .expect("tray_set_icon wire fixture must be valid JSON");
        let arm = doc
            .get("tray_set_icon")
            .and_then(|v| v.as_object())
            .expect("wire fixture missing the tray_set_icon object");
        assert_eq!(arm.len(), 3, "exactly auto/light/dark");
        for (key, args) in arm {
            let args = args.as_array().expect("each entry is an args array");
            assert_eq!(
                tray_set_icon_mode_from_args(args),
                parse_tray_icon_mode(Some(key)),
                "fixture entry {key:?}"
            );
        }
        // Non-vacuity: the keys really are the three known modes, not three Auto fall-throughs.
        assert_eq!(
            tray_set_icon_mode_from_args(arm["dark"].as_array().unwrap()),
            TrayIconMode::Dark
        );
        assert_eq!(
            tray_set_icon_mode_from_args(arm["light"].as_array().unwrap()),
            TrayIconMode::Light
        );
    }

    #[test]
    fn tray_variant_wire_contract_retired_dark_bool_shape_is_auto_not_dark() {
        // Regression lock: the pre-2026-09-30 payload `{ dark: true }` must NOT be read as Dark.
        let retired = vec![json!({ "dark": true })];
        assert_eq!(tray_set_icon_mode_from_args(&retired), TrayIconMode::Auto);
        assert_eq!(tray_set_icon_mode_from_args(&[]), TrayIconMode::Auto);
    }

    /// Real-profile, READ-ONLY measurement: proves the `RegGetValueW` flags and buffer against
    /// this machine's actual value by comparing with `reg.exe`. Ignored by default because a CI
    /// runner's profile may lack the key. Writes nothing.
    #[cfg(windows)]
    #[test]
    #[ignore]
    fn tray_variant_system_uses_light_theme_read_matches_reg_exe() {
        let out = std::process::Command::new("reg")
            .args([
                "query",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize",
                "/v",
                "SystemUsesLightTheme",
            ])
            .output()
            .expect("reg.exe must be runnable");
        let text = String::from_utf8_lossy(&out.stdout).to_string();
        let expected = text
            .lines()
            .find(|l| l.contains("REG_DWORD"))
            .and_then(|l| l.split_whitespace().last())
            .and_then(|hex| hex.strip_prefix("0x"))
            .and_then(|hex| u32::from_str_radix(hex, 16).ok());
        println!("reg.exe SystemUsesLightTheme = {expected:?}");
        assert_eq!(read_system_uses_light_theme(), expected);
    }

    // ---- Tray recent-games id parsing (Phase 35 Plan 06, T-35-20) ----
    //
    // The `recent:<appName>` menu id is the one string in the tray path that crosses from a
    // menu event into a game launch. These tests cover BOTH directions of the round-trip and,
    // per the threat register, an explicit malformed-id rejection set -- a parser that only
    // ever saw well-formed input is not evidence of anything.

    #[test]
    fn recent_menu_id_round_trips_a_plain_app_name() {
        for app_name in ["Iris", "1207658777", "620", "a-b_c.d", "0"] {
            let id = tray_recent_menu_id(app_name);
            assert_eq!(id.as_deref(), Some(format!("recent:{app_name}").as_str()));
            let id = id.unwrap_or_default();
            assert_eq!(tray_recent_app_name(&id), Some(app_name));
        }
    }

    // ---- quick 261008-kvz: Cmd+Q and the red X route through the sidecar ----

    #[test]
    fn quit_routing_close_hides_only_when_a_tray_exists_and_the_setting_says_hide() {
        assert_eq!(close_request_action(true, true), CloseRequestAction::Hide);
        assert_eq!(
            close_request_action(false, true),
            CloseRequestAction::RouteQuit,
            "no tray to restore from: hiding would trap the user"
        );
        assert_eq!(
            close_request_action(true, false),
            CloseRequestAction::RouteQuit,
            "exitToTray off: the close is routed, not hidden"
        );
        assert_eq!(
            close_request_action(false, false),
            CloseRequestAction::RouteQuit
        );
    }

    #[test]
    fn quit_routing_a_failed_settings_read_routes_the_quit_never_hides() {
        // `load_tray_settings()` degrades to `default()` on a read failure.
        assert_eq!(
            close_request_action(true, should_hide_on_close(TraySettingsSnapshot::default())),
            CloseRequestAction::RouteQuit
        );
        for unreadable in [json!({}), json!(null), json!({ "defaultSettings": 3 })] {
            assert_eq!(
                close_request_action(
                    true,
                    should_hide_on_close(tray_settings_from_config(&unreadable))
                ),
                CloseRequestAction::RouteQuit,
                "an unreadable config must never trap the user in an unclosable window"
            );
        }
    }

    #[test]
    fn quit_routing_no_tray_icon_on_disk_routes_even_with_exit_to_tray_on() {
        let on_disk = tray_settings_from_config(&json!({
            "defaultSettings": { "exitToTray": true, "noTrayIcon": true }
        }));
        assert!(on_disk.exit_to_tray && on_disk.no_tray_icon);
        // The tray existed at startup iff noTrayIcon was off.
        let tray_exists = !on_disk.no_tray_icon;
        assert_eq!(
            close_request_action(tray_exists, should_hide_on_close(on_disk)),
            CloseRequestAction::RouteQuit
        );
    }

    #[test]
    fn quit_routing_exit_to_tray_on_with_a_tray_still_hides() {
        let on_disk = tray_settings_from_config(&json!({
            "defaultSettings": { "exitToTray": true, "noTrayIcon": false }
        }));
        assert_eq!(
            close_request_action(!on_disk.no_tray_icon, should_hide_on_close(on_disk)),
            CloseRequestAction::Hide
        );
    }

    #[test]
    fn recent_menu_id_rejects_a_malformed_id() {
        // Missing prefix -- the non-recent menu ids the same handler also sees.
        assert_eq!(tray_recent_app_name("show"), None);
        assert_eq!(tray_recent_app_name("about"), None);
        assert_eq!(tray_recent_app_name("quit"), None);
        assert_eq!(tray_recent_app_name(""), None);
        assert_eq!(tray_recent_app_name("recent"), None);
        // Prefix present, remainder not a plain appName.
        assert_eq!(tray_recent_app_name("recent:"), None);
        assert_eq!(tray_recent_app_name("recent:../../etc/passwd"), None);
        assert_eq!(tray_recent_app_name("recent:.."), None);
        assert_eq!(tray_recent_app_name("recent:."), None);
        assert_eq!(tray_recent_app_name("recent:a/b"), None);
        assert_eq!(tray_recent_app_name("recent:a\\b"), None);
        assert_eq!(tray_recent_app_name("recent:a b"), None);
        assert_eq!(tray_recent_app_name("recent:a;rm -rf /"), None);
        assert_eq!(tray_recent_app_name("recent:a\nb"), None);
        assert_eq!(tray_recent_app_name("recent:a\0b"), None);
        assert_eq!(tray_recent_app_name("recent:$(id)"), None);
        assert_eq!(tray_recent_app_name("recent:\u{e9}quipe"), None);
        // Over the length bound.
        let long = "a".repeat(129);
        assert_eq!(tray_recent_app_name(&format!("recent:{long}")), None);
        assert_eq!(tray_recent_menu_id(&long), None);
    }

    #[test]
    fn a_rejected_app_name_never_becomes_a_menu_id() {
        // The construction side uses the SAME predicate as the parse side, so an entry that
        // could not survive the round-trip is never rendered at all.
        for bad in ["", "..", "a/b", "a b", "a;b", "wine prefix"] {
            assert_eq!(tray_recent_menu_id(bad), None, "expected {bad:?} rejected");
        }
    }

    #[test]
    fn recent_games_parse_drops_unusable_entries_and_respects_the_limit() {
        let payload = json!([
            { "appName": "Iris", "title": "Phoenix Point" },
            { "appName": "620", "title": "Portal 2", "runner": "steam" },
            { "appName": "../escape", "title": "rejected" },
            { "appName": "Iris", "title": "duplicate" },
            { "title": "no appName at all" },
            { "appName": "1124300", "title": "HUMANKIND" }
        ]);
        let games = tray_recent_games_from_value(&payload, 5);
        assert_eq!(
            games,
            vec![
                TrayRecentGame {
                    app_name: "Iris".into(),
                    title: "Phoenix Point".into(),
                    runner: None
                },
                TrayRecentGame {
                    app_name: "620".into(),
                    title: "Portal 2".into(),
                    runner: Some("steam".into())
                },
                TrayRecentGame {
                    app_name: "1124300".into(),
                    title: "HUMANKIND".into(),
                    runner: None
                },
            ]
        );
        // The limit truncates rather than erroring.
        assert_eq!(tray_recent_games_from_value(&payload, 1).len(), 1);
        assert_eq!(tray_recent_games_from_value(&payload, 0).len(), 0);
    }

    // ---- Persisted runner vs the legacy probe fallback (Phase 35 plan 06, operator-initiated) ----
    //
    // `RecentGame` used to be `{ appName, title }`, so the tray had to reconstruct the runner by
    // probing up to six store managers via `trayResolveRunner` — for a value `addRecentGame`
    // already held and discarded. The type now persists it. These tests cover BOTH arms of the
    // resulting branch, because the fallback arm is what every pre-existing install runs on.

    #[test]
    fn a_persisted_runner_is_parsed_and_validated() {
        let payload = json!([
            { "appName": "620", "title": "Portal 2", "runner": "steam" },
            { "appName": "Iris", "title": "Phoenix Point", "runner": "legendary" },
            { "appName": "1207658777", "title": "Empire Earth", "runner": "gog" }
        ]);
        let games = tray_recent_games_from_value(&payload, 5);
        assert_eq!(games[0].runner.as_deref(), Some("steam"));
        assert_eq!(games[1].runner.as_deref(), Some("legendary"));
        assert_eq!(games[2].runner.as_deref(), Some("gog"));
    }

    #[test]
    fn every_member_of_the_typescript_runner_union_survives_the_parse() {
        // Pins TRAY_RUNNERS against `common/types.ts:23`: every member of that union must
        // survive the parse or this allow-list is a silently-diverging copy rather than a
        // mirror.
        for runner in TRAY_RUNNERS {
            let payload = json!([{ "appName": "x1", "title": "T", "runner": runner }]);
            let games = tray_recent_games_from_value(&payload, 5);
            assert_eq!(
                games.first().and_then(|g| g.runner.as_deref()),
                Some(*runner),
                "runner {runner:?} should survive the parse"
            );
        }
    }

    #[test]
    fn legacy_zoom_runner_falls_back_to_probe() {
        // A recent-games entry persisted by a build that still shipped the Zoom Platform store
        // names `"zoom"`, which is no longer a `Runner`. The entry must be KEPT with
        // `runner: None` so the `trayResolveRunner` probe resolves it, not dropped.
        let payload = json!([{ "appName": "x1", "title": "T", "runner": "zoom" }]);
        let games = tray_recent_games_from_value(&payload, 5);
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].app_name, "x1");
        assert_eq!(games[0].runner, None);
    }

    #[test]
    fn a_legacy_entry_and_a_bogus_runner_both_degrade_to_none() {
        // THE ARM EVERY EXISTING INSTALL IS ON. A pre-Phase-35 entry has no `runner` key at all;
        // it must parse cleanly with `runner: None` so the launch path falls back to the probe.
        // A recognised-shape-but-unknown runner degrades the SAME way rather than being dropped
        // or forwarded — falling back is strictly better than rejecting a launchable entry.
        let payload = json!([
            { "appName": "legacy1", "title": "No runner key at all" },
            { "appName": "bogus1", "title": "Unknown runner", "runner": "not-a-runner" },
            { "appName": "bogus2", "title": "Wrong type", "runner": 7 },
            { "appName": "bogus3", "title": "Null runner", "runner": null }
        ]);
        let games = tray_recent_games_from_value(&payload, 5);
        assert_eq!(games.len(), 4, "no entry may be DROPPED for a bad runner");
        for game in &games {
            assert_eq!(
                game.runner, None,
                "{} should degrade to None",
                game.app_name
            );
        }
    }

    #[test]
    fn the_launch_branch_uses_a_persisted_runner_and_falls_back_without_one() {
        let games = vec![
            TrayRecentGame {
                app_name: "620".into(),
                title: "Portal 2".into(),
                runner: Some("steam".into()),
            },
            TrayRecentGame {
                app_name: "legacy1".into(),
                title: "Written before this change".into(),
                runner: None,
            },
        ];

        // Persisted -> `dispatch_tray_launch` receives Some(..) and SKIPS the resolve invoke.
        assert_eq!(
            recent_runner_in(&games, "620"),
            Some("steam".to_string()),
            "a persisted runner must reach the launch call without a lookup"
        );

        // Legacy -> None, so the probe fallback runs. This must not regress.
        assert_eq!(
            recent_runner_in(&games, "legacy1"),
            None,
            "a legacy entry must fall back to the trayResolveRunner probe"
        );

        // An appName not in the cache at all also falls back rather than mis-resolving to a
        // neighbouring entry's runner.
        assert_eq!(recent_runner_in(&games, "not-in-cache"), None);
        assert_eq!(recent_runner_in(&[], "620"), None);
    }

    #[test]
    fn recent_games_parse_is_total_over_junk() {
        // A malformed or absent recent-games file must degrade to "no recent games", never to
        // a failed tray build.
        assert!(tray_recent_games_from_value(&json!(null), 5).is_empty());
        assert!(tray_recent_games_from_value(&json!({}), 5).is_empty());
        assert!(tray_recent_games_from_value(&json!("nope"), 5).is_empty());
        assert!(tray_recent_games_from_value(&json!([1, 2, 3]), 5).is_empty());
    }

    #[test]
    fn recent_title_falls_back_to_app_name_and_is_bounded() {
        let untitled = TrayRecentGame {
            app_name: "620".into(),
            title: "   ".into(),
            runner: None,
        };
        assert_eq!(tray_recent_title(&untitled), "620");

        let controls = TrayRecentGame {
            app_name: "620".into(),
            title: "a\nb\tc".into(),
            runner: None,
        };
        assert_eq!(tray_recent_title(&controls), "a b c");

        // Multi-byte title over the cap: truncation is on a CHARACTER boundary, so this can
        // never panic the way a byte slice would.
        let long = TrayRecentGame {
            app_name: "620".into(),
            title: "\u{e9}".repeat(200),
            runner: None,
        };
        let rendered = tray_recent_title(&long);
        assert_eq!(rendered.chars().count(), TRAY_RECENT_TITLE_MAX_CHARS + 1);
        assert!(rendered.ends_with('\u{2026}'));
    }

    #[test]
    fn recent_limit_mirrors_the_typescript_default_and_caps_pathological_values() {
        // `recent_games.ts`: `maxRecentGames || 5`.
        assert_eq!(tray_recent_limit(None), TRAY_RECENT_DEFAULT_LIMIT);
        assert_eq!(tray_recent_limit(Some(0)), TRAY_RECENT_DEFAULT_LIMIT);
        assert_eq!(tray_recent_limit(Some(3)), 3);
        assert_eq!(tray_recent_limit(Some(1_000_000)), TRAY_RECENT_MAX_LIMIT);
    }

    // ---- exitToTray is decided at CLOSE time, not from the startup snapshot ----
    //
    // Plan 35-06 task 3's live gate: turning `Exit to System Tray` ON mid-session did nothing
    // until relaunch, because the handler was attached only when the STARTUP snapshot already
    // had it true. These tests cover the decision function; the source-level gate in
    // `tauriShellSource.test.ts` pins that the close handler feeds it a FRESH read.

    #[test]
    fn close_hides_only_when_exit_to_tray_is_on_and_a_tray_exists() {
        // Mirrors `src/backend/main.ts:288`'s `if (exitToTray && !noTrayIcon)` truth table.
        let case = |exit_to_tray, no_tray_icon| {
            should_hide_on_close(TraySettingsSnapshot {
                exit_to_tray,
                no_tray_icon,
                start_in_tray: false,
                max_recent_games: TRAY_RECENT_DEFAULT_LIMIT,
            })
        };
        assert!(case(true, false), "exitToTray on with a tray -> hide");
        assert!(!case(false, false), "exitToTray off -> close normally");
        // No tray to restore the window from: hiding would strand a running app the user
        // cannot reach, so the close must proceed even with exitToTray on.
        assert!(!case(true, true), "noTrayIcon overrides exitToTray");
        assert!(!case(false, true));
    }

    #[test]
    fn a_setting_changed_after_startup_changes_the_close_decision() {
        // THE DEFECT, expressed as a test. The startup snapshot on a fresh profile has
        // exitToTray off, so the close decision is "quit". If the user then turns it on, the
        // value the handler reads comes from the CONFIG, and the decision must flip. A handler
        // bound to the startup snapshot cannot produce this transition at all.
        let at_startup = TraySettingsSnapshot::default();
        assert!(!should_hide_on_close(at_startup), "baseline: close quits");

        let after_the_user_toggled_it = tray_settings_from_config(&json!({
            "defaultSettings": { "exitToTray": true, "noTrayIcon": false }
        }));
        assert!(
            should_hide_on_close(after_the_user_toggled_it),
            "a mid-session toggle must change the close decision without a relaunch"
        );
        assert_ne!(
            should_hide_on_close(at_startup),
            should_hide_on_close(after_the_user_toggled_it)
        );
    }

    #[test]
    fn an_unreadable_config_lets_the_window_close_rather_than_trapping_the_user() {
        // FAIL-SAFE DIRECTION. `load_tray_settings()` degrades to `default()` on any read
        // failure; the decision that follows must be "close", never "hide". A user who can
        // always close their window is the safe failure mode -- a user trapped in a window
        // that refuses to close because a config read failed is not.
        for unreadable in [
            json!({}),
            json!(null),
            json!({ "defaultSettings": 3 }),
            json!([]),
        ] {
            assert!(
                !should_hide_on_close(tray_settings_from_config(&unreadable)),
                "an unreadable config must never trap the user in an unclosable window"
            );
        }
    }

    #[test]
    fn tray_settings_read_the_global_config_shape() {
        let config = json!({
            "defaultSettings": {
                "noTrayIcon": true,
                "exitToTray": true,
                "startInTray": false,
                "maxRecentGames": 8
            },
            "version": "v0"
        });
        assert_eq!(
            tray_settings_from_config(&config),
            TraySettingsSnapshot {
                no_tray_icon: true,
                exit_to_tray: true,
                start_in_tray: false,
                max_recent_games: 8,
            }
        );
    }

    #[test]
    fn tray_settings_fail_open_to_a_working_tray() {
        // An absent, empty, or wrong-typed config must yield a tray that EXISTS -- an
        // unreadable config turning the tray off would be the worst possible failure mode.
        for junk in [
            json!({}),
            json!(null),
            json!({ "defaultSettings": 3 }),
            json!([]),
        ] {
            let s = tray_settings_from_config(&junk);
            assert_eq!(s, TraySettingsSnapshot::default());
            assert!(!s.no_tray_icon);
            assert_eq!(s.max_recent_games, TRAY_RECENT_DEFAULT_LIMIT);
        }
    }
}
