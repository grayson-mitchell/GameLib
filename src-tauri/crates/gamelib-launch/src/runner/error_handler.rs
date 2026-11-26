//! The runner's `errorHandler` and `askForceUninstall` (88.2-09, D-02), ported from `utils.ts`.
//!
//! A runner command's output (or the message of one that failed) is read for the few failures the user
//! can act on: a game folder that is gone asks whether to remove the game from the installed list, and the
//! reach into the TS manager that does it is [`ManagerHooks::force_uninstall`] (D-26). The question goes
//! through the answered-dialog seam of the prepare steps ([`crate::prepare::dialogs::ask`]), so a context
//! with no dialog source (the CLI, a headless run) answers it as a dismissal, which is "No" (the CR-04
//! fail-safe, T-88.2-13): nothing is ever uninstalled without a click on "Yes".
//!
//! [`error_handler`] is what `call_runner` calls fire and forget (see [`handle_in_background`]).

use serde_json::{Map, Value};

use crate::ctx::LaunchCtx;
use crate::prepare::dialogs;
use crate::runner::RunnerName;

/// The index of the "Yes" button, the one destructive answer.
const YES: usize = 1;

/// The dialog title: the manager's title for the game, the app name when the hook fails, is absent or
/// answers an empty string (`resolveTitleForGame`: an empty title counts as absent).
async fn title_for(ctx: &LaunchCtx, runner: RunnerName, app_name: &str) -> String {
    let Some(hooks) = &ctx.hooks else {
        return app_name.to_string();
    };
    match hooks.game_title(runner, app_name).await {
        Ok(title) if !title.is_empty() => title,
        _ => app_name.to_string(),
    }
}

/// `askForceUninstall`: asks whether to remove a game whose folder is gone from the installed list, and
/// removes it through the hook on "Yes". Answers the index of the clicked button, or `None` for a dismissal
/// (an Esc, a closed window, a dialog that could not be shown, or a context with no dialog source), which is
/// answered like "No": the hook is called only for index 1 (T-88.2-13).
pub async fn ask_force_uninstall(
    ctx: &LaunchCtx,
    runner: RunnerName,
    app_name: &str,
) -> Option<usize> {
    let title = title_for(ctx, runner, app_name).await;
    let none = Map::new();
    let i18n = &ctx.engine.i18n;
    let message = i18n.t(
        "box.error.folder-not-found.title",
        "Game folder appears to be deleted, do you want to remove the game from the installed list?",
        &none,
    );
    let buttons = [
        i18n.t("box.no", "No", &none),
        i18n.t("box.yes", "Yes", &none),
    ];
    let answer = dialogs::ask(ctx, &title, &message, &buttons);
    if answer == Some(YES) {
        if let Some(hooks) = &ctx.hooks {
            if hooks.force_uninstall(runner, app_name).await.is_err() {
                if let Some(log) = &ctx.engine.log {
                    log.error(&format!("forceUninstall hook failed ({})", runner.as_str()));
                }
            }
        }
    }
    answer
}

/// Texts a run's output may hold that are never worth a dialog: the macOS false alarm when no CrossOver is
/// found, and the zipapp Legendary's dependency warning.
const IGNORE: [&str; 2] = [
    "IndexError: list index out of range",
    "RequestsDependencyWarning",
];

/// The JavaScript regex `/legendary.*\.py/`: the word, then `.py` later on the same line. `.` matches
/// everything but a line terminator (LF, CR, U+2028, U+2029), so the `.py` must come before the next one.
fn is_legendary_py_error(error: &str) -> bool {
    error.match_indices("legendary").any(|(at, word)| {
        let rest = &error[at + word.len()..];
        let line = rest
            .find(['\n', '\r', '\u{2028}', '\u{2029}'])
            .map_or(rest, |end| &rest[..end]);
        line.contains(".py")
    })
}

/// Shows an in-app error modal (`showDialogBoxModalAuto`: the main window is raised first, the frame carries
/// no buttons and no acknowledgement id). A context with no UI shows nothing.
fn show_error_modal(ctx: &LaunchCtx, title: &str, message: &str) {
    let Some(ui) = ctx.engine.ui.as_deref() else {
        return;
    };
    ui.raise_main_window();
    ui.show_dialog(title, message, "ERROR", "");
}

/// `errorHandler`: reads `error` (the joined output of a finished run, or the message of one that failed)
/// for what the user should hear about, in the TS order: an empty error and the ignore list return; a game
/// folder that is gone (with an app name) asks [`ask_force_uninstall`]; a `legendary ... .py` traceback shows
/// the generic Legendary error unless it is a `MemoryError`; expired credentials show their message.
pub async fn error_handler(ctx: &LaunchCtx, error: &str, app_name: &str, runner: RunnerName) {
    let plat = if runner == RunnerName::Legendary {
        "Legendary (Epic Games)"
    } else {
        runner.as_str()
    };
    if error.is_empty() || IGNORE.iter().any(|ignored| error.contains(ignored)) {
        return;
    }
    if error.contains("appears to be deleted") && !app_name.is_empty() {
        ask_force_uninstall(ctx, runner, app_name).await;
        return;
    }
    let i18n = &ctx.engine.i18n;
    if is_legendary_py_error(error) {
        if error.contains("MemoryError: ") {
            return;
        }
        let mut params = Map::new();
        params.insert("error".to_string(), Value::String(error.to_string()));
        params.insert("newline".to_string(), Value::String("\n".to_string()));
        let message = i18n.t(
            "box.error.legendary.generic",
            "An error has occurred! Try to Logout and Login on your Epic account. {{newline}}  {{error}}",
            &params,
        );
        show_error_modal(ctx, plat, &message);
        return;
    }
    if error.contains("No saved credentials") {
        let message = i18n.t(
            "box.error.credentials.message",
            "Your Crendentials have expired, Logout and Login Again!",
            &Map::new(),
        );
        show_error_modal(ctx, plat, &message);
    }
}

/// Runs [`error_handler`] without making the caller wait: the TS called it without `await`. The task holds
/// a shutdown registrant for its lifetime and gives way to the app shutdown.
pub fn handle_in_background(ctx: &LaunchCtx, error: &str, app_name: &str, runner: RunnerName) {
    let Ok(runtime) = tokio::runtime::Handle::try_current() else {
        return;
    };
    let ctx = ctx.clone();
    let error = error.to_string();
    let app_name = app_name.to_string();
    runtime.spawn(async move {
        let _registrant = ctx.engine.shutdown.register("launch-error-handler");
        let token = ctx.engine.shutdown.token();
        tokio::select! {
            biased;
            _ = token.cancelled() => {}
            _ = error_handler(&ctx, &error, &app_name, runner) => {}
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_legendary_rule_is_the_js_regex_with_dot_stopping_at_a_line_end() {
        for (text, want) in [
            ("legendary/cli.py", true),
            ("legendary.py", true),
            ("a legendary b .py c", true),
            ("legendary\ncli.py", false),
            ("legendary\rcli.py", false),
            ("legendary\u{2028}cli.py", false),
            ("cli.py then legendary", false),
            ("legendary only", false),
            ("legendary no\n legendary yes.py", true),
            ("", false),
        ] {
            assert_eq!(is_legendary_py_error(text), want, "{text:?}");
        }
    }
}
