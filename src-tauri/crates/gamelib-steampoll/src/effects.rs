//! Effect model. Pure machines are `fn step(state: &mut S, obs: Observation) -> Vec<Effect>`;
//! async tasks gather observations and apply the effects (the applier lives in `outbox`).

use crate::events::{AckReply, StateEvent};
use crate::host::{Notification, NotifyText};
use serde_json::{json, Map, Value};

#[derive(Debug, Clone, PartialEq)]
pub enum Effect {
    Frontend {
        channel: String,
        args: Vec<Value>,
    },
    Notify(Notification),
    /// Send a state event, wait for the ack, then run `then.resolve(reply)`.
    Transition {
        event: StateEvent,
        then: Continuation,
    },
    WriteHoldRecord {
        app_id: String,
        record: Value,
    },
    ClearHoldRecord {
        app_id: String,
    },
    Log {
        level: LogLevel,
        message: String,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    Info,
    Warn,
}

/// One variant per post-ack branch. `resolve` reads the ack (title, bridgeAuthoritative,
/// macArchCheck) so the effect list after the ack can depend on sidecar state.
#[derive(Debug, Clone, PartialEq)]
pub enum Continuation {
    /// Nothing follows the ack.
    None,
    /// Bottle install marked incomplete: `gameStatusUpdate` done.
    InstallIncomplete { app_id: String },
    /// `installed` applied: badge done (or bridge finishing) then the notifications.
    Installed {
        app_id: String,
        installer_owns_completion: bool,
        bridge_install_finalized: bool,
        skipped_depots: Vec<String>,
        notify_restart_steam: bool,
    },
    /// `updateDone` applied: updating, then done (74 UAT 12).
    UpdateDone { app_id: String, completed: bool },
    /// `uninstalled` applied. `survivor_source` is set when a copy survives.
    Uninstalled {
        app_id: String,
        removed_source: String,
        survivor_source: Option<String>,
    },
}

pub fn status_update(app_id: &str, status: &str, extra: Option<(&str, Value)>) -> Effect {
    let mut m = Map::new();
    m.insert("appName".into(), json!(app_id));
    m.insert("runner".into(), json!("steam"));
    m.insert("status".into(), json!(status));
    if let Some((k, v)) = extra {
        m.insert(k.into(), v);
    }
    Effect::Frontend {
        channel: "gameStatusUpdate".into(),
        args: vec![Value::Object(m)],
    }
}

fn key_text(key: &str, default: &str, params: Map<String, Value>) -> NotifyText {
    NotifyText::Key {
        key: key.into(),
        default: default.into(),
        params,
    }
}

/// `copySourceLabel` (installRoot.ts) fallback strings; an unknown source passes through.
pub fn copy_source_label(source: &str) -> String {
    match source {
        "native" => "Mac Steam",
        "bottle" => "Windows Steam (CrossOver)",
        "bridge" => "Steam bridge",
        other => other,
    }
    .to_string()
}

pub fn restart_steam_notice(title: &str) -> Effect {
    let mut params = Map::new();
    params.insert("game".into(), json!(title));
    Effect::Notify(Notification {
        title: NotifyText::Literal(title.into()),
        body: key_text(
            "steam.waitingForSteam.notify",
            "Restart Steam to finish installing {{game}}",
            params,
        ),
    })
}

impl Continuation {
    pub fn resolve(self, reply: &AckReply) -> Vec<Effect> {
        let title = reply.title.clone().unwrap_or_default();
        match self {
            Continuation::None => vec![],
            Continuation::InstallIncomplete { app_id } => {
                vec![status_update(&app_id, "done", None)]
            }
            Continuation::Installed {
                app_id,
                installer_owns_completion,
                bridge_install_finalized,
                skipped_depots,
                notify_restart_steam,
            } => {
                let mut out = vec![];
                if !(installer_owns_completion && bridge_install_finalized) {
                    out.push(if installer_owns_completion {
                        status_update(
                            &app_id,
                            "installing",
                            Some((
                                "context",
                                json!(crate::constants::STEAM_BRIDGE_FINISHING_CONTEXT),
                            )),
                        )
                    } else {
                        status_update(&app_id, "done", None)
                    });
                }
                if !installer_owns_completion {
                    out.push(Effect::Notify(Notification {
                        title: NotifyText::Literal(title.clone()),
                        body: key_text(
                            "notify.install.finished",
                            "Installation Finished",
                            Map::new(),
                        ),
                    }));
                }
                if !skipped_depots.is_empty() {
                    let mut params = Map::new();
                    params.insert("depots".into(), json!(skipped_depots.join(", ")));
                    out.push(Effect::Notify(Notification {
                        title: NotifyText::Literal(title.clone()),
                        body: key_text(
                            "steam.download.notify.depotSkipped",
                            "Installed without depot {{depots}}. Steam wouldn't release its key for this account, so that content was skipped — the game should still run.",
                            params,
                        ),
                    }));
                }
                if notify_restart_steam {
                    out.push(restart_steam_notice(&title));
                }
                out
            }
            Continuation::UpdateDone { app_id, .. } => vec![
                status_update(&app_id, "updating", Some(("managedBySteam", json!(true)))),
                status_update(&app_id, "done", None),
            ],
            Continuation::Uninstalled {
                app_id,
                removed_source,
                survivor_source,
            } => {
                let mut out = vec![status_update(&app_id, "done", None)];
                out.push(Effect::Notify(match survivor_source {
                    Some(survivor) => {
                        let mut params = Map::new();
                        params.insert("removed".into(), json!(copy_source_label(&removed_source)));
                        params.insert("survivor".into(), json!(copy_source_label(&survivor)));
                        Notification {
                            title: NotifyText::Literal(title),
                            body: key_text(
                                "gamelib:steam.uninstall.copySurvives",
                                "Removed the {{removed}} copy. A {{survivor}} copy is still installed — use Remove all copies… to remove it too.",
                                params,
                            ),
                        }
                    }
                    None => Notification {
                        title: NotifyText::Literal(title),
                        body: key_text("notify.uninstalled", "Game Uninstalled", Map::new()),
                    },
                }));
                out
            }
        }
    }
}
