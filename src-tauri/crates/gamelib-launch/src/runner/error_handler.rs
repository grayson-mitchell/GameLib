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

use serde_json::Map;

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

/// `errorHandler`: reads `error` (the joined output of a finished run, or the message of one that failed)
/// for what the user should hear about. Tracer: the deleted-folder branch only.
pub async fn error_handler(ctx: &LaunchCtx, error: &str, app_name: &str, runner: RunnerName) {
    if error.is_empty() {
        return;
    }
    if error.contains("appears to be deleted") && !app_name.is_empty() {
        ask_force_uninstall(ctx, runner, app_name).await;
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
