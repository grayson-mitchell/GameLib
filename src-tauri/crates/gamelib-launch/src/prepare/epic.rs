//! `isEpicServiceOffline` (`utils.ts`) and its pure decision `checkEpicServiceOffline`
//! (`utils/epicServiceStatus.ts`): whether the Epic status page says Epic, Fortnite or Rocket League is
//! down, so a launch goes offline instead of failing at login.
//!
//! The request is one JSON GET through the engine's [`gamelib_engine::fetch::Fetch`] seam (D-08), so the
//! golden replays the recorded exchanges and no test opens a socket. The app is online when the engine
//! context says so ([`gamelib_engine::ctx::EngineCtx::is_online`], the TS `onlineMonitor.isOnline()`).
//!
//! Prohibition 1: a log line is fixed text. The TS logged the error object (`epic-status-log-fixed-text`
//! in `golden/epic_status/deltas.json`); a request error here is a [`gamelib_engine::fetch::FetchError`]
//! category and nothing else, and the status URL is never in a line.
//!
//! Recorded quirks kept as the TS has them (D-20, three todos filed by 88.1-02): only the literal status
//! `major` counts as offline (the status page says `major_outage`), and a service the page does not list
//! shows the offline notification and then answers online.

use std::time::Duration;

use gamelib_engine::fetch::{FetchError, FetchRequest};
use serde_json::{json, Map, Value};

use crate::ctx::LaunchCtx;

/// The status page the TS asked (`epicStatusApi`).
pub const STATUS_URL: &str = "https://status.epicgames.com/api/v2/components.json";

/// axios's default `Accept`, which the TS sent and the recordings pin.
const ACCEPT: &str = "application/json, text/plain, */*";

/// The shared axios client's timeout (`axiosClient`), connect and body together.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

/// The services the status page lists that a launch or an install asks about (`type` of the TS).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum EpicService {
    #[default]
    EpicGamesStore,
    Fortnite,
    RocketLeague,
}

impl EpicService {
    /// The component name the status page uses, which is also the label the notification shows.
    pub fn name(self) -> &'static str {
        match self {
            EpicService::EpicGamesStore => "Epic Games Store",
            EpicService::Fortnite => "Fortnite",
            EpicService::RocketLeague => "Rocket League",
        }
    }

    /// `None` for anything but the three names, exactly.
    pub fn parse(text: &str) -> Option<EpicService> {
        [
            EpicService::EpicGamesStore,
            EpicService::Fortnite,
            EpicService::RocketLeague,
        ]
        .into_iter()
        .find(|service| service.name() == text)
    }
}

/// Why the status request produced no usable answer, in the vocabulary of the TS `isNetworkLevelFailure`:
/// only a request that went out and got no response at all is "unreachable".
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StatusFailure {
    /// The request went out and no HTTP response came back (DNS, connect, TLS, a reset, a timeout).
    NoResponse,
    /// The request was cancelled.
    Cancelled,
    /// An HTTP response with a non-2xx status.
    Http(u16),
    /// Anything else, as a fixed category word (a body over the cap, an unreadable body).
    Other(&'static str),
}

impl StatusFailure {
    /// `isNetworkLevelFailure`: true only for [`StatusFailure::NoResponse`]. An error that carries an HTTP
    /// response, a cancelled request and a failure raised before sending are all false.
    pub fn is_network_level(&self) -> bool {
        matches!(self, StatusFailure::NoResponse)
    }

    /// The category a log line names: fixed text, never a URL or a transport message.
    fn category(&self) -> String {
        match self {
            StatusFailure::NoResponse => "network".to_string(),
            StatusFailure::Cancelled => "cancelled".to_string(),
            StatusFailure::Http(status) => format!("status({status})"),
            StatusFailure::Other(word) => (*word).to_string(),
        }
    }
}

impl From<FetchError> for StatusFailure {
    fn from(error: FetchError) -> StatusFailure {
        match error {
            FetchError::Network => StatusFailure::NoResponse,
            FetchError::Aborted => StatusFailure::Cancelled,
            FetchError::Status(status) => StatusFailure::Http(status),
            FetchError::TooLarge => StatusFailure::Other("too-large"),
            FetchError::FailedToGetHeaders | FetchError::Io => StatusFailure::Other("io"),
        }
    }
}

/// What the TS decision called back: the notification, the unreachable warning or the error line.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Callback {
    /// `deps.notify()`.
    Notify,
    /// `deps.onUnreachable(error)`.
    Unreachable,
    /// `deps.onError(error)`, with the category the fixed-text line names.
    Error(String),
}

/// The answer of [`check_epic_service_offline`]: whether Epic is offline and the one callback it made.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Check {
    pub offline: bool,
    pub callback: Option<Callback>,
}

/// `checkEpicServiceOffline`: the decision over one fetch outcome, with the notification, the log lines and
/// the request left to the caller. `fetched` is the decoded JSON body (`Null` for a body that was not JSON,
/// which axios hands back as a string and the TS then failed on) or why there was none.
pub fn check_epic_service_offline(
    fetched: Result<&Value, &StatusFailure>,
    service: EpicService,
) -> Check {
    let data = match fetched {
        Ok(data) => data,
        Err(failure) if failure.is_network_level() => {
            return Check {
                offline: true,
                callback: Some(Callback::Unreachable),
            }
        }
        Err(failure) => {
            return Check {
                offline: false,
                callback: Some(Callback::Error(failure.category())),
            }
        }
    };
    match decide(data, service) {
        Some(Decision::Found { offline }) => Check {
            offline,
            callback: offline.then_some(Callback::Notify),
        },
        // The component is not listed: the TS notified and answered online.
        Some(Decision::Absent) => Check {
            offline: false,
            callback: Some(Callback::Notify),
        },
        // `data.components` is not iterable, or a listed entry cannot be destructured: a TypeError.
        None => Check {
            offline: false,
            callback: Some(Callback::Error("unexpected-response".to_string())),
        },
    }
}

enum Decision {
    /// The first component named `service` was found; `offline` is its status being `major`.
    Found { offline: bool },
    /// No component carries the name.
    Absent,
}

/// The loop over `data.components`: the first entry named `service` decides. `None` is the JS `TypeError`:
/// `data` is not an object with an iterable `components`, or an entry is `null`.
fn decide(data: &Value, service: EpicService) -> Option<Decision> {
    let entries = match data.as_object()?.get("components")? {
        Value::Array(entries) => entries,
        // A string is iterable (by character), and no character is an object named `service`.
        Value::String(_) => return Some(Decision::Absent),
        _ => return None,
    };
    for entry in entries {
        // `const { name, status } = null` throws; any other non-object destructures to `undefined`.
        if entry.is_null() {
            return None;
        }
        let Some(object) = entry.as_object() else {
            continue;
        };
        if object.get("name").and_then(Value::as_str) == Some(service.name()) {
            let offline = object.get("status").and_then(Value::as_str) == Some("major");
            return Some(Decision::Found { offline });
        }
    }
    Some(Decision::Absent)
}

/// One request to the status page, decoded: the JSON body, `Null` when the body is not JSON.
async fn fetch_components(ctx: &LaunchCtx) -> Result<Value, StatusFailure> {
    let request = FetchRequest::get(STATUS_URL)
        .header("Accept", ACCEPT)
        .gamelib_agent(&ctx.engine.app_version)
        .timeout(REQUEST_TIMEOUT);
    let response = ctx
        .engine
        .fetch
        .get(request)
        .await
        .and_then(|response| response.error_for_status())?;
    Ok(serde_json::from_slice(&response.body).unwrap_or(Value::Null))
}

fn log_warn(ctx: &LaunchCtx, line: &str) {
    if let Some(log) = &ctx.engine.log {
        log.warn(line);
    }
}

fn log_error(ctx: &LaunchCtx, line: &str) {
    if let Some(log) = &ctx.engine.log {
        log.error(line);
    }
}

/// `isEpicServiceOffline`: `true` when the app is not online (no request is made), when the page says the
/// service is `major`, or when the page cannot be reached at all. A non-operational answer shows the
/// notification (`EngineUi::notify`); an HTTP error or an unreadable body answers online with one
/// fixed-text error line.
pub async fn epic_service_offline(ctx: &LaunchCtx, service: EpicService) -> bool {
    if !ctx.engine.is_online() {
        return true;
    }
    let fetched = fetch_components(ctx).await;
    let check = check_epic_service_offline(fetched.as_ref(), service);
    match &check.callback {
        None => {}
        Some(Callback::Notify) => notify(ctx, service),
        Some(Callback::Unreachable) => log_warn(
            ctx,
            "Could not reach the Epic status page, treating Epic as offline for this launch/install check",
        ),
        Some(Callback::Error(category)) => log_error(
            ctx,
            &format!("Failed to get epic service status with {category}"),
        ),
    }
    check.offline
}

/// The notification: `<type> <epic.offline-notification-title>` and `epic.offline-notification-body`.
fn notify(ctx: &LaunchCtx, service: EpicService) {
    let Some(ui) = &ctx.engine.ui else {
        return;
    };
    let none = Map::<String, Value>::new();
    let title = format!(
        "{} {}",
        service.name(),
        ctx.engine
            .i18n
            .t("epic.offline-notification-title", "offline", &none)
    );
    let body = ctx.engine.i18n.t(
        "epic.offline-notification-body",
        "GameLib will maybe not work probably!",
        &none,
    );
    ui.notify(&title, &body);
}

/// The `launch_epic_service_offline` op's argument: `null` is the default service (`Epic Games Store`),
/// a string is one of the three names, anything else is `None`.
pub(crate) fn service_arg(value: &Value) -> Option<EpicService> {
    match value {
        Value::Null => Some(EpicService::default()),
        Value::String(text) => EpicService::parse(text),
        _ => None,
    }
}

/// The op's reply: a bare boolean.
pub(crate) fn offline_reply(offline: bool) -> Value {
    json!(offline)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn components(entries: Value) -> Value {
        json!({ "components": entries })
    }

    fn check(data: &Value, service: EpicService) -> Check {
        check_epic_service_offline(Ok(data), service)
    }

    #[test]
    fn only_the_literal_major_is_offline_and_it_notifies() {
        let data = components(json!([{"name": "Epic Games Store", "status": "major"}]));
        assert_eq!(
            check(&data, EpicService::EpicGamesStore),
            Check {
                offline: true,
                callback: Some(Callback::Notify)
            }
        );
        for status in ["operational", "major_outage", "partial_outage", ""] {
            let data = components(json!([{"name": "Epic Games Store", "status": status}]));
            assert_eq!(
                check(&data, EpicService::EpicGamesStore),
                Check {
                    offline: false,
                    callback: None
                },
                "{status}"
            );
        }
    }

    #[test]
    fn a_service_the_page_does_not_list_notifies_and_answers_online() {
        let data = components(json!([{"name": "Other", "status": "major"}]));
        assert_eq!(
            check(&data, EpicService::EpicGamesStore),
            Check {
                offline: false,
                callback: Some(Callback::Notify)
            }
        );
    }

    #[test]
    fn the_service_argument_selects_the_component_and_the_first_one_wins() {
        let data = components(json!([
            {"name": "Epic Games Store", "status": "operational"},
            {"name": "Fortnite", "status": "major"},
            {"name": "Fortnite", "status": "operational"}
        ]));
        assert!(!check(&data, EpicService::EpicGamesStore).offline);
        assert!(check(&data, EpicService::Fortnite).offline);
    }

    #[test]
    fn a_body_without_an_iterable_components_list_is_the_error_answer() {
        for data in [
            json!({}),
            Value::Null,
            json!([]),
            json!({"components": null}),
            json!({"components": {}}),
            json!({"components": 3}),
            json!({"components": [null]}),
        ] {
            assert_eq!(
                check(&data, EpicService::EpicGamesStore),
                Check {
                    offline: false,
                    callback: Some(Callback::Error("unexpected-response".to_string()))
                },
                "{data}"
            );
        }
    }

    #[test]
    fn only_a_request_with_no_response_is_offline() {
        let unreachable =
            check_epic_service_offline(Err(&StatusFailure::NoResponse), Default::default());
        assert_eq!(
            unreachable,
            Check {
                offline: true,
                callback: Some(Callback::Unreachable)
            }
        );
        for failure in [
            StatusFailure::Cancelled,
            StatusFailure::Http(503),
            StatusFailure::Other("io"),
        ] {
            let got = check_epic_service_offline(Err(&failure), Default::default());
            assert!(!got.offline, "{failure:?}");
            assert!(matches!(got.callback, Some(Callback::Error(_))));
        }
        assert!(StatusFailure::from(FetchError::Network).is_network_level());
        assert!(!StatusFailure::from(FetchError::Status(500)).is_network_level());
    }

    #[test]
    fn an_error_line_names_a_category_and_never_a_url() {
        for failure in [
            StatusFailure::Http(503),
            StatusFailure::Cancelled,
            StatusFailure::Other("too-large"),
        ] {
            assert!(!failure.category().contains("http"), "{failure:?}");
        }
        assert_eq!(StatusFailure::Http(503).category(), "status(503)");
    }

    #[test]
    fn the_service_names_round_trip_and_nothing_else_parses() {
        for service in [
            EpicService::EpicGamesStore,
            EpicService::Fortnite,
            EpicService::RocketLeague,
        ] {
            assert_eq!(EpicService::parse(service.name()), Some(service));
        }
        assert_eq!(EpicService::parse("fortnite"), None);
        assert_eq!(service_arg(&Value::Null), Some(EpicService::EpicGamesStore));
        assert_eq!(service_arg(&json!(1)), None);
    }
}
