//! The non-Steam "a game process exists" first-match signal (`gameProcessWatch.ts`, 61-16 D-18, spike 068;
//! ported in 87-51, D-08, D-17).
//!
//! Spike 068's verdict (`z-path`): match a `ps` command line against the game's install dir,
//! case-insensitively, with a trailing separator kept, in up to four forms: the unix path (persistent under
//! GPTK, only the first 1-2 s under CrossOver), the `Z:` form (`Z:` plus the absolute path with
//! backslashes), for installs under the home dir the `Y:` form (`Y:` plus the path relative to home) and,
//! for installs under the bottle's `drive_c`, the `C:` form (CR-02). The trailing separator stops
//! `Avernum 4` matching `Avernum 4 Remaster`. A bare-basename launch (cwd plus `Game.exe`) cannot be
//! matched and is not detected; the non-Steam deadline never kills on a missing match (it only shows a
//! notice).
//!
//! A form matches when the command line starts with it, or carries it as a later argument (GPTK:
//! `wine64-preloader .../wine64 <install>/Game.exe`), preceded by whitespace, a quote or `=`, never glued
//! to a longer path.
//!
//! Only bottle-backed launches are armed. Plain-prefix pinned and Wine Manager launches have no bottle
//! wineserver to stop and are not CrossOver launches.
//!
//! The shutdown contract: the watch is one tokio task holding an `engine-watch` registrant while it runs
//! and ending with the shutdown token, bounded by its own cap and by consecutive listing failures, polling
//! every 1.5 s through the one spawn seam. The listing is raced against the stop and the quit, so a stopped
//! watch never waits for a `ps`.

use std::time::Duration;

use crate::ctx::EngineCtx;
use crate::launch::deadline::LAUNCH_DEADLINE_MS;
use crate::launch::process_listing::{list_processes_via, parse_ps_line};

/// The listing interval.
pub const POLL_MS: u64 = 1500;
/// How many listings in a row may fail before the watch gives up.
pub const MAX_CONSECUTIVE_LISTING_FAILURES: u32 = 20;
/// The watch's own cap: the deadline plus five seconds, so the deadline always gets to end it first.
pub const DEFAULT_MAX_DURATION_MS: u64 = LAUNCH_DEADLINE_MS + 5_000;

fn with_trailing_sep(path: &str, sep: char) -> String {
    if path.ends_with(sep) {
        path.to_string()
    } else {
        format!("{path}{sep}")
    }
}

fn backslashed(path: &str) -> String {
    path.replace('/', "\\")
}

/// Every lowercased prefix form a game process command line can carry, or empty when the install path is
/// not usable (empty, relative, or the filesystem root).
pub fn derive_game_process_prefixes(
    install_path: &str,
    home: &str,
    bottle_dir: Option<&str>,
) -> Vec<String> {
    if !install_path.starts_with('/') {
        return Vec::new();
    }
    let trimmed = install_path.trim_end_matches('/');
    if trimmed.is_empty() {
        return Vec::new();
    }

    let mut forms = vec![with_trailing_sep(trimmed, '/')];
    forms.push(format!(
        "Z:{}",
        with_trailing_sep(&backslashed(trimmed), '\\')
    ));

    let home_trimmed = home.trim_end_matches('/');
    if !home_trimmed.is_empty() {
        if let Some(rel) = trimmed
            .strip_prefix(home_trimmed)
            .and_then(|rest| rest.strip_prefix('/'))
        {
            forms.push(format!(
                "Y:\\{}",
                with_trailing_sep(&backslashed(rel), '\\')
            ));
        }
    }

    let bottle_trimmed = bottle_dir.unwrap_or("").trim_end_matches('/');
    if !bottle_trimmed.is_empty() {
        if let Some(rel) = trimmed
            .strip_prefix(bottle_trimmed)
            .and_then(|rest| rest.strip_prefix("/drive_c/"))
        {
            forms.push(format!(
                "C:\\{}",
                with_trailing_sep(&backslashed(rel), '\\')
            ));
        }
    }
    forms.into_iter().map(|form| form.to_lowercase()).collect()
}

/// The unix-path form of the prefix (trailing separator kept), or `None` if not derivable.
pub fn derive_game_process_prefix(install_path: &str) -> Option<String> {
    derive_game_process_prefixes(install_path, "", None)
        .into_iter()
        .next()
}

/// `commandMatches`: whether the lowercased command line carries one of the prefixes, at its start or after
/// whitespace, a double quote or `=`.
pub fn matches(lower_command: &str, prefixes: &[String]) -> bool {
    for prefix in prefixes {
        let mut from = 0;
        while let Some(found) = lower_command[from..].find(prefix.as_str()) {
            let at = from + found;
            let before = lower_command[..at].chars().next_back();
            if before.map_or(true, |c| matches!(c, ' ' | '\t' | '"' | '=')) {
                return true;
            }
            // Resume one character past the failed hit, as the TS did one unit past it.
            from = at + lower_command[at..].chars().next().map_or(1, char::len_utf8);
        }
    }
    false
}

/// The pid of the first process in a `ps` or `pgrep` listing whose command matches, in listing order.
/// A line that does not parse is skipped.
pub fn first_match_pid(listing: &str, prefixes: &[String]) -> Option<String> {
    listing.split('\n').find_map(|line| {
        let (pid, command) = parse_ps_line(line)?;
        matches(&command.to_lowercase(), prefixes).then_some(pid)
    })
}

/// Why a watch gave up.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GiveUp {
    /// The watch's own cap passed.
    MaxDuration,
    /// Twenty listings in a row failed.
    ListingFailures,
}

impl GiveUp {
    pub fn as_str(self) -> &'static str {
        match self {
            GiveUp::MaxDuration => "max-duration",
            GiveUp::ListingFailures => "listing-failures",
        }
    }
}

/// How a watch ended by itself. A watch that was stopped, or ended by the quit, ends with neither.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WatchEnd {
    /// A process matched; its pid.
    FirstMatch {
        pid: String,
    },
    GaveUp(GiveUp),
}

/// What a watch is told.
#[derive(Debug, Clone)]
pub struct WatchArgs {
    pub install_path: String,
    pub bottle_dir: Option<String>,
    pub poll: Duration,
    pub max_duration: Duration,
}

impl WatchArgs {
    pub fn new(install_path: &str, bottle_dir: Option<&str>) -> WatchArgs {
        WatchArgs {
            install_path: install_path.to_string(),
            bottle_dir: bottle_dir.map(str::to_string),
            poll: Duration::from_millis(POLL_MS),
            max_duration: Duration::from_millis(DEFAULT_MAX_DURATION_MS),
        }
    }
}

/// Starts the watch of `key` (`watchForGameProcess`): `true` when one is running. A path with no usable
/// form, a context that was never shared and a call outside a runtime start nothing. Any watch the key
/// already had ends. `on_end` runs once when the watch ends by itself (a match or a give-up) and not when
/// it was stopped ([`crate::launch::LaunchState::stop_watcher`]) or the app is quitting; by then the
/// watch has left the state.
pub fn start(
    ctx: &EngineCtx,
    key: &str,
    args: &WatchArgs,
    on_end: impl FnOnce(WatchEnd) + Send + 'static,
) -> bool {
    let prefixes = derive_game_process_prefixes(
        &args.install_path,
        &ctx.paths.user_home.to_string_lossy(),
        args.bottle_dir.as_deref(),
    );
    if prefixes.is_empty() {
        return false;
    }
    let (Some(me), Ok(runtime)) = (ctx.weak(), tokio::runtime::Handle::try_current()) else {
        return false;
    };
    let (generation, stop) = ctx.launch_state.begin_watcher(key);
    let registrant = ctx.shutdown.register("engine-watch");
    let quit = ctx.shutdown.token();
    let proc = ctx.proc.clone();
    let log = ctx.log.clone();
    let clock = ctx.clock.clone();
    let key = key.to_string();
    let (poll, max_duration) = (args.poll, args.max_duration);

    runtime.spawn(async move {
        let _registrant = registrant;
        let started = clock.now_ms();
        let cap = tokio::time::sleep(max_duration);
        tokio::pin!(cap);
        let mut failures: u32 = 0;
        let end = loop {
            tokio::select! {
                biased;
                () = quit.cancelled() => {
                    if let Some(ctx) = me.upgrade() {
                        ctx.launch_state.claim_watcher(&key, generation);
                    }
                    return;
                }
                () = stop.cancelled() => return,
                () = &mut cap => break WatchEnd::GaveUp(GiveUp::MaxDuration),
                () = tokio::time::sleep(poll) => {}
            }
            let listing = tokio::select! {
                biased;
                () = quit.cancelled() => {
                    if let Some(ctx) = me.upgrade() {
                        ctx.launch_state.claim_watcher(&key, generation);
                    }
                    return;
                }
                () = stop.cancelled() => return,
                () = &mut cap => break WatchEnd::GaveUp(GiveUp::MaxDuration),
                listing = list_processes_via(&*proc) => listing,
            };
            match listing {
                Ok(stdout) => {
                    failures = 0;
                    if let Some(pid) = first_match_pid(&stdout, &prefixes) {
                        break WatchEnd::FirstMatch { pid };
                    }
                }
                Err(message) => {
                    failures += 1;
                    if let Some(log) = log.as_deref() {
                        log.warn(&format!(
                            "gameProcessWatch: process listing failed ({failures}/{MAX_CONSECUTIVE_LISTING_FAILURES}): {message}"
                        ));
                    }
                    if failures >= MAX_CONSECUTIVE_LISTING_FAILURES {
                        break WatchEnd::GaveUp(GiveUp::ListingFailures);
                    }
                }
            }
        };

        // The watch ends by itself: it is the one that leaves the state, or it was stopped meanwhile.
        let Some(ctx) = me.upgrade() else {
            return;
        };
        if !ctx.launch_state.claim_watcher(&key, generation) {
            return;
        }
        if let Some(log) = log.as_deref() {
            match &end {
                // The pid only, never another process's command line.
                WatchEnd::FirstMatch { pid } => {
                    log.info(&format!("gameProcessWatch: game process seen (pid {pid})"));
                }
                WatchEnd::GaveUp(reason) => log.info(&format!(
                    "gameProcessWatch: gave up ({}) after {} ms",
                    reason.as_str(),
                    clock.now_ms().saturating_sub(started)
                )),
            }
        }
        on_end(end);
    });
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn prefixes(install: &str, home: &str, bottle: Option<&str>) -> Vec<String> {
        derive_game_process_prefixes(install, home, bottle)
    }

    #[test]
    fn the_forms_are_the_unix_path_the_z_form_and_the_home_and_bottle_forms() {
        assert_eq!(
            prefixes("/Users/u/Games/Avernum 4", "/Users/u", None),
            [
                "/users/u/games/avernum 4/",
                "z:\\users\\u\\games\\avernum 4\\",
                "y:\\games\\avernum 4\\"
            ]
        );
        assert_eq!(prefixes("/Volumes/x/G", "/Users/u", None).len(), 2);
        assert!(prefixes("rel/path", "/Users/u", None).is_empty());
        assert!(prefixes("/", "/Users/u", None).is_empty());
        let bottle = "/Users/u/Library/Application Support/CrossOver/Bottles/B";
        let install = format!("{bottle}/drive_c/Program Files/Game");
        assert!(prefixes(&install, "/Users/u", Some(bottle))
            .contains(&"c:\\program files\\game\\".to_string()));
        assert_eq!(
            prefixes(&install, "/Users/u", Some(&format!("{bottle}/"))),
            prefixes(&install, "/Users/u", Some(bottle))
        );
        assert_eq!(prefixes(&install, "/Users/u", None).len(), 3);
        assert_eq!(derive_game_process_prefix("/a/B").as_deref(), Some("/a/b/"));
        assert_eq!(derive_game_process_prefix("nope"), None);
    }

    #[test]
    fn a_form_matches_at_the_start_or_after_a_separator_and_never_glued_to_a_longer_path() {
        let forms = prefixes("/Users/u/Games/Avernum 4", "/Users/u", None);
        for hit in [
            "/users/u/games/avernum 4/game.exe",
            "wine64-preloader /w/bin/wine64 /users/u/games/avernum 4/game.exe",
            "wine \"/users/u/games/avernum 4/game.exe\"",
            "launcher --root=/users/u/games/avernum 4/data",
            "wine\t/users/u/games/avernum 4/game.exe",
        ] {
            assert!(matches(hit, &forms), "{hit}");
        }
        for miss in [
            "x/users/u/games/avernum 4/game.exe",
            "/users/u/games/avernum 4 remaster/game.exe",
            "/opt/users/u/games/avernum 4/x",
            "open /users/u/games/avernum 4",
        ] {
            assert!(!matches(miss, &forms), "{miss}");
        }
        // A glued first hit does not hide a later, separated one.
        assert!(matches(
            "x/users/u/games/avernum 4/a /users/u/games/avernum 4/b",
            &forms
        ));
    }
}
