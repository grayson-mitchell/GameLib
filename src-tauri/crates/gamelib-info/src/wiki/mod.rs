//! The wiki game info sources (Phase 86, SVC-01), ported from `src/backend/wiki_game_info/`:
//! [`pcgw`] (PCGamingWiki), [`agw`] (AppleGamingWiki), [`protondb`], [`deck`] (Steam Deck
//! compatibility) and [`codeweavers`] (the slug), plus [`gamesdb`] and [`gog_ctx`] (the two unauthenticated GOG GETs D-23 moved into Rust, 86-21). The
//! aggregator that calls them, the cache and the stale rules are 86-22.
//!
//! Every source asks through `ctx.http`, with the 10 s timeout of the TS `axiosClient`, the response read
//! the way axios reads it (a 2xx status, the body parsed as JSON when it parses and kept as text when it
//! does not) and the properties of the answer read with the JS semantics of [`crate::js`]: a read of
//! `undefined` throws, and a source maps what its TS threw to its own failure value (`error` for
//! PCGamingWiki, `null` for AppleGamingWiki, ProtonDB and Steam Deck).
//!
//! A diagnostic line (`ctx.note`) is fixed text plus a status number or a category word: never a URL, a
//! title, or anything the server sent.

use std::time::Duration;

use serde_json::Value;

use crate::ctx::InfoCtx;
use crate::http::{HttpError, Request, Response};

pub mod agw;
pub mod codeweavers;
pub mod deck;
pub mod gamesdb;
pub mod gog_ctx;
pub mod pcgw;
pub mod protondb;
pub mod regexes;

/// The TS `axiosClient`'s `timeout: 10 * 1000`.
pub const TIMEOUT: Duration = Duration::from_secs(10);

/// What the TS `axiosClient` sends as its `User-Agent`: `GameLib/<version> (+<repository>)`.
pub fn user_agent(ctx: &InfoCtx) -> String {
    format!(
        "GameLib/{} (+https://github.com/grayson-mitchell/GameLib)",
        ctx.app_version
    )
}

/// Why a lookup threw. [`Thrown::word`] is what a diagnostic line says.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Thrown {
    /// A status outside 2xx (axios rejects every one of them).
    Status(u16),
    Timeout,
    TooLarge,
    Network,
    /// The answer did not have the shape the code reads (a property read of `undefined`, a value that is
    /// not the text the parser needs).
    Shape,
}

impl Thrown {
    pub fn word(&self) -> String {
        match self {
            Thrown::Status(status) => format!("status {status}"),
            Thrown::Timeout => "timeout".to_string(),
            Thrown::TooLarge => "too large".to_string(),
            Thrown::Network => "network".to_string(),
            Thrown::Shape => "shape".to_string(),
        }
    }
}

impl From<HttpError> for Thrown {
    fn from(error: HttpError) -> Thrown {
        match error {
            HttpError::Timeout => Thrown::Timeout,
            HttpError::TooLarge => Thrown::TooLarge,
            HttpError::Network(_) | HttpError::Cancelled => Thrown::Network,
        }
    }
}

impl From<crate::js::TypeError> for Thrown {
    fn from(_: crate::js::TypeError) -> Thrown {
        Thrown::Shape
    }
}

/// The outcome a source reports with its data (`WikiSourceOutcome` in `common/types`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Ok,
    NotFound,
    Error,
}

impl Outcome {
    /// The word the wiki info cache stores.
    pub fn word(self) -> &'static str {
        match self {
            Outcome::Ok => "ok",
            Outcome::NotFound => "notfound",
            Outcome::Error => "error",
        }
    }
}

/// `axiosClient.get(url, { headers: { 'User-Agent': user_agent } })` and then `response.data`: a 2xx
/// answer's body, parsed as JSON when it parses (a leading BOM is stripped first, as axios strips it) and
/// otherwise the text itself; anything else is what axios would have rejected with.
pub(crate) async fn get_data(
    ctx: &InfoCtx,
    url: String,
    user_agent: &str,
) -> Result<Value, Thrown> {
    let request = Request::get(url, TIMEOUT).header("User-Agent", user_agent);
    let response = ctx.http.send(request).await.map_err(Thrown::from)?;
    if !(200..300).contains(&response.status) {
        return Err(Thrown::Status(response.status));
    }
    Ok(data_of(&response))
}

/// axios's `response.data` for any status: the body parsed as JSON when it parses (a leading BOM is
/// stripped first, as axios strips it) and otherwise the text itself.
pub(crate) fn data_of(response: &Response) -> Value {
    let text = String::from_utf8_lossy(&response.body);
    let text = text.strip_prefix('\u{FEFF}').unwrap_or(&text);
    serde_json::from_str(text).unwrap_or_else(|_| Value::String(text.to_string()))
}
