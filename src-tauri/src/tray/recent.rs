use super::*;

// ---- Tray recent-games / settings surface (Phase 35 Plan 06, D-05/D-06, REQ-35-04) ----
//
// Phase 34.1 Plan 06 shipped a DELIBERATELY bounded tray (tooltip, left-click show/focus, a
// two-item Show/Quit menu) and re-deferred the rest to Phase 35. This block is that deferral
// coming due: the recent-games section, the About item, and the three tray SETTINGS the
// Electron tray (`src/backend/tray_icon/tray_icon.ts`) honoured. Everything here keeps
// T-34.1-22's discipline -- no `unwrap()`, no `panic!`, every failure logs
// `[shell] WARN: ... -- continuing without tray` and continues.

/// Menu-id prefix for a recent-game entry. The id is CONSTRUCTED here and PARSED back in the
/// tray's `on_menu_event`, so the round-trip is a genuine parsing choke point on a string that
/// reaches a game launch (T-35-20) -- hence `tray_recent_menu_id`/`tray_recent_app_name` below
/// share one predicate and carry their own `#[cfg(test)]` coverage.
pub(crate) const TRAY_RECENT_ID_PREFIX: &str = "recent:";

/// Fallback for `settings.maxRecentGames` when it is absent or unusable. Mirrors
/// `src/backend/recent_games/recent_games.ts`'s own `maxRecentGames || 5` -- READ from that
/// file, not chosen here.
pub(crate) const TRAY_RECENT_DEFAULT_LIMIT: usize = 5;

/// Hard ceiling on rendered recent-game entries regardless of what `maxRecentGames` says. The
/// setting is user-editable JSON on disk; a pathological value (or a corrupted file) must not
/// be able to ask the shell to build an unbounded native menu at startup.
pub(crate) const TRAY_RECENT_MAX_LIMIT: usize = 20;

/// Longest tray menu label we will render for a recent game. Titles come from library data
/// (T-35-20's "not wholly trusted" note); a very long one would produce an unusable menu.
pub(crate) const TRAY_RECENT_TITLE_MAX_CHARS: usize = 60;

/// The frontend-message channel the sidecar pushes on every recent-games mutation
/// (`recent_games.ts`'s `setRecentGames` -> `sendFrontendMessage('recentGamesChanged', ...)`).
/// The shell's reader thread already sees every such frame on its way to the webview, so the
/// tray gets its live rebuild signal by OBSERVING that existing push -- no new channel, no new
/// sidecar registration, and no chance of a send-channel with no registered listener.
pub(crate) const RECENT_GAMES_CHANGED_CHANNEL: &str = "recentGamesChanged";

/// The `Runner` union from `src/common/types.ts:23`, mirrored here as an allow-list.
///
/// Kept in lockstep with that union deliberately: omitting a member would make this list a
/// silently-diverging copy rather than a mirror. A persisted entry naming a runner that is no
/// longer in the union (for example the removed `zoom`) degrades to `None` and takes the
/// `trayResolveRunner` probe fallback.
pub(crate) const TRAY_RUNNERS: &[&str] = &["legendary", "gog", "sideload", "nile", "steam"];

/// A single recent-game tray entry: the appName that will be launched, the label shown, and --
/// when the entry was written by a build that persists it -- the runner that owns the game.
///
/// `runner` is `Option` because it is genuinely absent for real users, not as a hedge: every
/// entry written before Phase 35 plan 06 carries no runner, and the operator's own live
/// `games.recent` was 18 such entries at the time this was written. The `None` arm is the one
/// every existing install runs on, so it is the arm that must not regress.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct TrayRecentGame {
    pub(crate) app_name: String,
    pub(crate) title: String,
    pub(crate) runner: Option<String>,
}

/// The three tray settings `TraySettings.tsx` exposes, plus the recent-games limit, read once
/// at startup from GlobalConfig's on-disk `config.json`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct TraySettingsSnapshot {
    pub(crate) no_tray_icon: bool,
    pub(crate) exit_to_tray: bool,
    pub(crate) start_in_tray: bool,
    pub(crate) max_recent_games: usize,
}

impl Default for TraySettingsSnapshot {
    fn default() -> Self {
        Self {
            no_tray_icon: false,
            exit_to_tray: false,
            start_in_tray: false,
            max_recent_games: TRAY_RECENT_DEFAULT_LIMIT,
        }
    }
}

/// Shell-side cache of the recent-games list backing the tray menu. Seeded at startup from
/// `configStore`'s on-disk JSON and refreshed whenever a `recentGamesChanged` frontend-message
/// frame passes through the reader thread.
static TRAY_RECENT_GAMES: OnceLock<Mutex<Vec<TrayRecentGame>>> = OnceLock::new();

/// Startup snapshot of the two tray settings that are legitimately startup-only: `noTrayIcon`
/// and `startInTray`. Both govern a decision that can only be taken before the tray or the
/// window exists, so a later read could not act on a changed value.
///
/// `exitToTray` is DELIBERATELY NOT served from here even though the snapshot still carries the
/// field. It governs a decision taken when the user closes the window, and it is re-read fresh at
/// that moment (`should_hide_on_close`'s call site). Reading it from this snapshot is exactly the
/// defect plan 35-06 task 3's live gate found.
///
/// THE `OnceLock` IS PRIVATE TO THIS MODULE AND UNREACHABLE FROM ANYWHERE ELSE IN THE PROGRAM.
/// That encapsulation is the point, and it is a compiler-enforced guarantee rather than a
/// convention: `get()` below is the ONLY `get_or_init` call site that can exist for this lock,
/// so a second initialiser with different semantics is not something a reviewer has to notice
/// -- it will not compile.
///
/// It is written this way because the alternative already failed. The lock previously sat at
/// file scope with TWO initialisers: `get_or_init(TraySettingsSnapshot::default)` in the
/// accessor and `get_or_init(load_tray_settings)` in `.setup()`. Whichever ran first won
/// permanently. `tray_settings()`'s caller is the sidecar reader thread's `recentGamesChanged`
/// handler, so a frame arriving before `.setup()` reached its initialiser would have latched the
/// lock to ALL-FALSE defaults, silently turned the real load into a no-op, and disabled every
/// tray setting for the whole run with no error anywhere. Intermittent, and undiagnosable from
/// the symptom.
///
/// The doc comment that made that arrangement look safe said the value was "read exactly once".
/// A comment asserting an invariant is not the same thing as an invariant.
mod tray_settings_lock {
    use super::{load_tray_settings, TraySettingsSnapshot};
    use std::sync::OnceLock;

    static TRAY_SETTINGS: OnceLock<TraySettingsSnapshot> = OnceLock::new();

    /// The one and only initialiser. Always `load_tray_settings` -- never a `default()` fallback,
    /// which is what made the previous two-initialiser arrangement silently lossy. Whoever gets
    /// here first (the reader thread or `.setup()`) performs the real read, and everyone
    /// afterwards sees that same real value.
    ///
    /// `load_tray_settings` is itself fail-open: an unreadable config yields
    /// `TraySettingsSnapshot::default()`. That is a DEGRADE INSIDE the real read, which every
    /// caller then observes consistently -- categorically different from racing a `default()`
    /// initialiser against a real one and latching whichever won.
    ///
    /// The deref is deliberately on its OWN line rather than written as
    /// `*TRAY_SETTINGS.get_or_init(...)`. `stripSourceComments`
    /// (`src/backend/testUtils/stripSourceComments.ts:42`) drops every line matching
    /// `/^\s*(\/\/|\*|\/\*)/` -- intended for block-comment continuation lines, but a Rust
    /// deref-expression at the start of a line is indistinguishable from one. Written the
    /// compact way, this call site is INVISIBLE to every source-level gate that reads main.rs,
    /// which is how the previous two-initialiser arrangement went unnoticed by them. Do not
    /// "simplify" this back onto one line: it would silently blind the gate below.
    pub(super) fn get() -> TraySettingsSnapshot {
        let snapshot = TRAY_SETTINGS.get_or_init(load_tray_settings);
        *snapshot
    }
}

pub(crate) fn tray_recent_games() -> &'static Mutex<Vec<TrayRecentGame>> {
    TRAY_RECENT_GAMES.get_or_init(|| Mutex::new(Vec::new()))
}

/// The process-wide startup tray-settings snapshot. See `tray_settings_lock` for why the lock is
/// encapsulated and why there is exactly one initialiser.
pub(crate) fn tray_settings() -> TraySettingsSnapshot {
    tray_settings_lock::get()
}

/// The cached runner for a recent-game entry, if the entry carries one.
///
/// `Some` means the entry was written by a build that persists `runner` and the tray can call
/// `launch` directly. `None` means either a legacy entry (written before Phase 35 plan 06) or
/// one whose stored runner failed the `TRAY_RUNNERS` check — both fall back to the
/// `trayResolveRunner` probe. A poisoned mutex degrades to `None`, i.e. to the probe, which is
/// the slower-but-correct path rather than a failed launch.
pub(crate) fn tray_recent_runner_for(app_name: &str) -> Option<String> {
    let guard = match tray_recent_games().lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            shell_eprintln!("[shell] WARN: tray recent-games cache mutex poisoned -- recovering");
            poisoned.into_inner()
        }
    };
    recent_runner_in(&guard, app_name)
}

/// The pure half of `tray_recent_runner_for`: find `app_name` in a recent-games slice and return
/// its runner, if it has one. Split out so the launch-path BRANCH (persisted runner vs legacy
/// fallback) is unit-testable without mutating the process-wide cache — the same
/// pure-logic-gets-a-test discipline the rest of this module follows.
pub(crate) fn recent_runner_in(games: &[TrayRecentGame], app_name: &str) -> Option<String> {
    games
        .iter()
        .find(|g| g.app_name == app_name)
        .and_then(|g| g.runner.clone())
}

/// Whether `s` is a "plain appName" in the sense T-35-20 requires: non-empty, bounded, and
/// composed only of characters every runner's appName actually uses (legendary's alphanumeric
/// ids, GOG/Steam numeric ids, sideload UUIDs). Deliberately an ALLOW-list, not a deny-list --
/// the same fail-closed discipline `protocol_url_arg` established for the deep-link surface.
///
/// Load-bearing in BOTH directions: the same predicate gates id CONSTRUCTION and id PARSING, so
/// an entry whose appName could not survive the round-trip is never rendered in the first
/// place, rather than rendering a menu item whose click silently does nothing.
fn is_plain_app_name(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 128
        && s != "."
        && s != ".."
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
}

/// Build the tray menu id for a recent-game entry, or `None` when `app_name` is not a plain
/// appName (see `is_plain_app_name`).
pub(crate) fn tray_recent_menu_id(app_name: &str) -> Option<String> {
    if is_plain_app_name(app_name) {
        Some(format!("{TRAY_RECENT_ID_PREFIX}{app_name}"))
    } else {
        None
    }
}

/// Parse a recent-game appName back out of a tray menu id. Returns `None` for any id that is
/// not `recent:<plain appName>` -- a missing prefix, an empty remainder, or a remainder
/// carrying anything outside the allow-list (path separators, `..`, whitespace, control
/// characters, `;`, quotes, ...).
pub(crate) fn tray_recent_app_name(menu_id: &str) -> Option<&str> {
    let rest = menu_id.strip_prefix(TRAY_RECENT_ID_PREFIX)?;
    if is_plain_app_name(rest) {
        Some(rest)
    } else {
        None
    }
}

/// The label rendered for a recent game. Falls back to the appName when the title is blank,
/// collapses newlines/tabs (a native menu renders them as stray glyphs), and truncates on a
/// CHARACTER boundary so a multi-byte title can never panic a slice.
pub(crate) fn tray_recent_title(game: &TrayRecentGame) -> String {
    let raw = game.title.trim();
    let source = if raw.is_empty() {
        game.app_name.as_str()
    } else {
        raw
    };
    let cleaned: String = source
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    if cleaned.chars().count() <= TRAY_RECENT_TITLE_MAX_CHARS {
        cleaned
    } else {
        let mut out: String = cleaned.chars().take(TRAY_RECENT_TITLE_MAX_CHARS).collect();
        out.push('…');
        out
    }
}

/// Clamp `settings.maxRecentGames` into a sane menu size. Mirrors `recent_games.ts`'s
/// `maxRecentGames || 5` for the absent/zero case, then applies this file's own hard cap.
pub(crate) fn tray_recent_limit(raw: Option<u64>) -> usize {
    match raw {
        Some(n) if n > 0 => (n as usize).min(TRAY_RECENT_MAX_LIMIT),
        _ => TRAY_RECENT_DEFAULT_LIMIT,
    }
}

/// Parse a `RecentGame[]` JSON array (`[{ "appName": ..., "title": ... }]`) into tray entries,
/// dropping anything that is not a usable, launchable entry and truncating to `limit`.
///
/// Total by construction: every shape that is not an array of objects carrying a plain-appName
/// `appName` yields an empty/short list rather than an error -- a malformed recent-games file
/// must degrade to "no recent games in the tray", never to a failed tray build.
pub(crate) fn tray_recent_games_from_value(value: &Value, limit: usize) -> Vec<TrayRecentGame> {
    let Some(items) = value.as_array() else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for item in items {
        if out.len() >= limit {
            break;
        }
        let Some(app_name) = item.get("appName").and_then(|v| v.as_str()) else {
            continue;
        };
        if !is_plain_app_name(app_name) {
            continue;
        }
        // Duplicate appNames would produce two menu items with the SAME id; tauri resolves a
        // click to one of them, so the second is dead weight at best.
        if out.iter().any(|g: &TrayRecentGame| g.app_name == app_name) {
            continue;
        }
        let title = item
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        // Validated against the mirrored `Runner` union rather than trusted: this value comes
        // off disk, and a bad one would be handed to the `launch` channel. `handleLaunch` has
        // its own `hasOwnProperty(libraryManagerMap, rawRunner)` guard (T-34.5-46-01), so this
        // is defence in depth -- but an unrecognised runner degrading to `None` also does
        // something strictly better than rejecting the entry: it falls through to the
        // `trayResolveRunner` probe, exactly as a legacy entry does.
        let runner = item
            .get("runner")
            .and_then(|v| v.as_str())
            .filter(|r| TRAY_RUNNERS.contains(r))
            .map(|r| r.to_string());
        out.push(TrayRecentGame {
            app_name: app_name.to_string(),
            title,
            runner,
        });
    }
    out
}

/// Read the four tray-relevant fields out of GlobalConfig's on-disk shape
/// (`{ "defaultSettings": AppSettings, "version": ... }`, `backend/config.ts:408`). Absent or
/// wrong-typed fields fall back to the defaults -- a config the shell cannot read must produce
/// a WORKING tray, not no tray.
pub(crate) fn tray_settings_from_config(config: &Value) -> TraySettingsSnapshot {
    let settings = config.get("defaultSettings");
    let flag = |key: &str| -> bool {
        settings
            .and_then(|s| s.get(key))
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
    };
    TraySettingsSnapshot {
        no_tray_icon: flag("noTrayIcon"),
        exit_to_tray: flag("exitToTray"),
        start_in_tray: flag("startInTray"),
        max_recent_games: tray_recent_limit(
            settings
                .and_then(|s| s.get("maxRecentGames"))
                .and_then(|v| v.as_u64()),
        ),
    }
}

/// `<appData>/GameLib` -- the same folder `src/backend/sidecar/pathShim.ts`'s
/// `getPath('userData')` resolves to, and therefore the same folder `constants/paths.ts`'s
/// `appFolder` resolves to inside the sidecar.
///
/// This is a DELIBERATE, read-only duplication of that path logic, and it is worth naming why
/// rather than routing through the sidecar: `noTrayIcon` and `startInTray` are decisions that
/// must be made INSIDE `.setup()`, before the tray is built and before the main window is ever
/// displayed. A `sidecar_invoke` round-trip there would either block startup on the sidecar's
/// boot or land late enough to show a tray icon / a window the user asked not to see -- the
/// visible flash being exactly the "affordance that does not do what it says" this phase's D-05
/// exists to eliminate. Every read below is fail-open: an unreadable or unparseable file yields
/// `TraySettingsSnapshot::default()`, i.e. today's behaviour.
fn gamelib_app_folder() -> Option<std::path::PathBuf> {
    #[cfg(target_os = "macos")]
    let base = std::env::var_os("HOME")
        .map(std::path::PathBuf::from)
        .map(|h| h.join("Library").join("Application Support"));
    #[cfg(target_os = "windows")]
    let base = std::env::var_os("APPDATA")
        .map(std::path::PathBuf::from)
        .or_else(|| {
            std::env::var_os("USERPROFILE")
                .map(std::path::PathBuf::from)
                .map(|h| h.join("AppData").join("Roaming"))
        });
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|| {
            std::env::var_os("HOME")
                .map(std::path::PathBuf::from)
                .map(|h| h.join(".config"))
        });
    base.map(|b| b.join("GameLib"))
}

/// Best-effort JSON read. Returns `None` (never an error, never a panic) for a missing,
/// unreadable, or unparseable file.
fn read_json_file(path: &std::path::Path) -> Option<Value> {
    let bytes = std::fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

/// Read the tray settings from `<appFolder>/config.json`, degrading to defaults.
pub(crate) fn load_tray_settings() -> TraySettingsSnapshot {
    let Some(folder) = gamelib_app_folder() else {
        shell_eprintln!(
            "[shell] WARN: could not resolve the GameLib config folder -- using default tray settings"
        );
        return TraySettingsSnapshot::default();
    };
    match read_json_file(&folder.join("config.json")) {
        Some(config) => tray_settings_from_config(&config),
        None => TraySettingsSnapshot::default(),
    }
}

/// Decide, at WINDOW-CLOSE time, whether the close should hide the window instead of exiting.
///
/// Split out as a pure function of a FRESHLY-READ snapshot, not of the startup snapshot, because
/// that distinction is the whole defect this function exists to fix (found by plan 35-06 task 3's
/// live gate). See `close_requested_should_hide`'s call site for why the read is fresh.
///
/// Mirrors `src/backend/main.ts:288` exactly: `if (exitToTray && !noTrayIcon)`.
pub(crate) fn should_hide_on_close(settings: TraySettingsSnapshot) -> bool {
    settings.exit_to_tray && !settings.no_tray_icon
}

/// What a main-window close request does.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum CloseRequestAction {
    /// Hide the window to the tray; the app stays alive.
    Hide,
    /// Hand the quit to the sidecar's `handleExit()` (`quit_via_sidecar`).
    RouteQuit,
}

/// Decide what a main-window close does, given whether a tray existed at startup and whether a
/// FRESH settings read says to hide on close (`should_hide_on_close`).
///
/// Hide only when BOTH hold: hiding a window with no tray to restore it from would trap the
/// user, and a failed settings read degrades to the all-false `TraySettingsSnapshot::default()`
/// so `hide_on_close` is false and the quit is routed -- the user can always close. The fail-safe
/// the old handler's comment describes is preserved: the sidecar exits when nothing is pending,
/// and `exit(0)` is the fallback when it cannot be asked.
pub(crate) fn close_request_action(tray_exists: bool, hide_on_close: bool) -> CloseRequestAction {
    if tray_exists && hide_on_close {
        CloseRequestAction::Hide
    } else {
        CloseRequestAction::RouteQuit
    }
}

/// Seed the recent-games cache from `configStore`'s on-disk JSON
/// (`<appFolder>/store/config.json`, key `games.recent` -- `constants/key_value_stores.ts`'s
/// `new TypeCheckedStoreBackend('configStore', { cwd: 'store' })`).
///
/// Startup seeding is a READ of the same file the sidecar owns, not a second writer: the shell
/// never writes it. Live updates arrive over the existing `recentGamesChanged` frontend-message
/// push instead, so this read exists only to make the tray useful BEFORE the first launch of a
/// session -- without it, the recent-games section would be empty on every cold start, which is
/// a worse reduction than the one this avoids.
pub(crate) fn load_recent_games_from_disk(limit: usize) -> Vec<TrayRecentGame> {
    let Some(folder) = gamelib_app_folder() else {
        return Vec::new();
    };
    let path = folder.join("store").join("config.json");
    let Some(store) = read_json_file(&path) else {
        return Vec::new();
    };
    match store.get("games").and_then(|g| g.get("recent")) {
        Some(recent) => tray_recent_games_from_value(recent, limit),
        None => Vec::new(),
    }
}
