//! The answered-dialog seam of the prepare steps (Phase 88.1, D-28).
//!
//! `checkWineBeforeLaunch` asks the user a two-button question ("We found another wine, continue with it?") and
//! acts on the answer. The question is a modal the shell shows, so the crate sees it as a trait: the shell
//! implements [`LaunchDialogs`] over the same native message box the `dialog_message` channel shows
//! (`dialogs::rpc_dialog_message`), and a test implements it with [`testing::ScriptedDialogs`]. The CLI has no
//! window, so it has none: [`ask`] answers every question as a dismissal.
//!
//! A dismissal is `None`, never index 0 (the CR-04 rule of `rpc_dialog_message`: an Esc or a closed window is
//! not the first button). The caller decides what a dismissal means; for `checkWineBeforeLaunch` it is the
//! last button, "No", which the TS `dialogs.showMessageBox` mapped it to (T-88.1-34).

use crate::ctx::LaunchCtx;

/// A modal the prepare steps ask. `buttons` are the labels in order; the answer is the index of the one the
/// user clicked, or `None` when the dialog was dismissed (or could not be shown).
pub trait LaunchDialogs: Send + Sync {
    fn ask(&self, title: &str, message: &str, buttons: &[String]) -> Option<usize>;
}

/// Asks through the context's dialog seam. A context with none (the CLI, a headless run) answers every ask as
/// a dismissal; the main window is raised first, as the TS `showMessageBox` did, when there is a UI to raise.
pub fn ask(ctx: &LaunchCtx, title: &str, message: &str, buttons: &[String]) -> Option<usize> {
    let dialogs = ctx.dialogs.as_ref()?;
    if let Some(ui) = ctx.engine.ui.as_deref() {
        ui.raise_main_window();
    }
    dialogs.ask(title, message, buttons)
}

#[cfg(feature = "testing")]
pub mod testing {
    use std::sync::Mutex;

    use super::LaunchDialogs;

    /// One question a test saw.
    #[derive(Debug, Clone, PartialEq, Eq)]
    pub struct Asked {
        pub title: String,
        pub message: String,
        pub buttons: Vec<String>,
    }

    /// A dialog source that answers from a script, in order, and records every question. A question past the
    /// end of the script is a dismissal (`None`), the same as a headless run.
    #[derive(Default)]
    pub struct ScriptedDialogs {
        answers: Mutex<Vec<Option<usize>>>,
        asked: Mutex<Vec<Asked>>,
    }

    impl ScriptedDialogs {
        pub fn new(answers: Vec<Option<usize>>) -> ScriptedDialogs {
            ScriptedDialogs {
                answers: Mutex::new(answers),
                asked: Mutex::new(Vec::new()),
            }
        }

        /// Every question asked so far, in order.
        pub fn asked(&self) -> Vec<Asked> {
            self.asked.lock().unwrap_or_else(|e| e.into_inner()).clone()
        }
    }

    impl LaunchDialogs for ScriptedDialogs {
        fn ask(&self, title: &str, message: &str, buttons: &[String]) -> Option<usize> {
            self.asked
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .push(Asked {
                    title: title.to_string(),
                    message: message.to_string(),
                    buttons: buttons.to_vec(),
                });
            let mut answers = self.answers.lock().unwrap_or_else(|e| e.into_inner());
            if answers.is_empty() {
                None
            } else {
                answers.remove(0)
            }
        }
    }
}
