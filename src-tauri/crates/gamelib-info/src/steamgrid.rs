//! SteamGridDB artwork search (Phase 86, SVC-01), ported from `src/backend/steamgrid/utils.ts` and
//! the `steamgriddb.*` handlers in `enrichmentFlowRegistration.ts`.
//!
//! Five operations: [`has_api_key`] and [`set_api_key`] over the key owner ([`crate::secrets::SgdbKey`],
//! the unchanged `steamgrid-api-key` slot), and [`search_game`], [`get_grids`] and [`get_heroes`]
//! over the SteamGridDB v2 API. The request is the one the TS made and the 86-07 goldens pin (D-10):
//! `GET`, the same path, the query in the order TS built it (`dimensions`, then `styles`, written
//! the way axios writes it), `Authorization: Bearer <key>` and the Heroic-style `User-Agent`.
//!
//! Parity points copied, not fixed (D-03):
//! - no stored key, or one the keyring cannot read, answers `[]` and makes no request;
//! - a non-2xx status rethrows with axios's `Request failed with status code <n>`;
//! - a 2xx whose body does not say `success` rethrows the API's `errors` joined with `, `, or a
//!   fixed fallback per endpoint (`Search failed`, `Failed to get grids`, `Failed to get heroes`);
//! - the results are narrowed to `{id, name}` and `{id, url, thumb}`, copying only fields present.
//!
//! The key travels only in the `Authorization` header: it is never put in a URL, a log line or an
//! error string, and a transport failure is mapped to a fixed category text first (T-86-31). Unlike
//! TS (which set no timeout) each request has a 30 s bound, so a dead connection cannot hold an op
//! open until the application exits.

use std::time::Duration;

use serde::{Deserialize, Deserializer};
use serde_json::{json, Map, Value};

use crate::ctx::InfoCtx;
use crate::http::{axios_query, HttpError, Request};

/// The SteamGridDB v2 API root.
pub const API_URL: &str = "https://www.steamgriddb.com/api/v2";

/// The renderer-facing bound of the search term and of the API key, in UTF-16 code units (zod's
/// `z.string().max(256)`).
pub const TEXT_MAX_UTF16: usize = 256;

/// The most entries a `styles` or `dimensions` list may carry, and the longest entry in UTF-16 units.
pub const LIST_MAX_ITEMS: usize = 64;
pub const LIST_ITEM_MAX_UTF16: usize = 64;

/// One request's bound (TS had none).
const TIMEOUT: Duration = Duration::from_secs(30);

/// `{query}`: the game title to search. Unknown fields are rejected.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SearchArgs {
    pub query: String,
}

/// `{gameId, styles?, dimensions?}`: one game's grids or heroes. `styles` and `dimensions` may be
/// absent but not `null` (zod's `.optional()`). Unknown fields are rejected.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GridArgs {
    pub game_id: u64,
    #[serde(default, deserialize_with = "present_list")]
    pub styles: Option<Vec<String>>,
    #[serde(default, deserialize_with = "present_list")]
    pub dimensions: Option<Vec<String>>,
}

/// `{}`: the key-status check takes nothing. Unknown fields are rejected.
#[derive(Debug, Clone, Default, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct HasKeyArgs {}

/// `{key}`: the API key to store; an empty (after trimming) value clears it. Unknown fields are
/// rejected.
#[derive(Clone, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SetKeyArgs {
    pub key: String,
}

impl std::fmt::Debug for SetKeyArgs {
    /// Never the key.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SetKeyArgs").finish_non_exhaustive()
    }
}

/// A list that, when the field is present, must be a list: `null` is an error (an absent field is
/// `None` through `#[serde(default)]`).
fn present_list<'de, D>(deserializer: D) -> Result<Option<Vec<String>>, D::Error>
where
    D: Deserializer<'de>,
{
    Vec::<String>::deserialize(deserializer).map(Some)
}

fn utf16_len(text: &str) -> usize {
    text.encode_utf16().count()
}

/// The renderer-facing bounds on a [`GridArgs`] (the same limits the zod schema had).
fn check_grid_args(op: &str, args: &GridArgs) -> Result<(), String> {
    let bad = || format!("{op}:bad-args");
    if args.game_id == 0 {
        return Err(bad());
    }
    for list in [&args.styles, &args.dimensions].into_iter().flatten() {
        if list.len() > LIST_MAX_ITEMS || list.iter().any(|s| utf16_len(s) > LIST_ITEM_MAX_UTF16) {
            return Err(bad());
        }
    }
    Ok(())
}

/// The stored key, or `None` when there is none or it cannot be read (TS `getApiKey` was total: a
/// failed read was the same as no key).
fn stored_key(ctx: &InfoCtx, op: &str) -> Option<String> {
    ctx.sgdb_key
        .get(ctx, op)
        .ok()
        .flatten()
        .filter(|key| !key.is_empty())
}

/// `{ hasKey }` as the renderer's boolean: whether a key is stored.
pub fn has_api_key(ctx: &InfoCtx, _args: HasKeyArgs) -> Result<Value, String> {
    Ok(Value::Bool(
        stored_key(ctx, "info_steamgrid_has_key").is_some(),
    ))
}

/// Stores the key trimmed; a value that is empty after trimming clears the slot. A failed keyring
/// write is an `Err` naming only the category (`<op>:secret-timeout|unavailable`); TS swallowed it
/// and told the renderer it had worked, which left the user believing a key was saved.
pub fn set_api_key(ctx: &InfoCtx, args: SetKeyArgs) -> Result<Value, String> {
    const OP: &str = "info_steamgrid_set_key";
    if utf16_len(&args.key) > TEXT_MAX_UTF16 {
        return Err(format!("{OP}:bad-args"));
    }
    ctx.sgdb_key.set(ctx, OP, &args.key)?;
    Ok(Value::Null)
}

/// JS `encodeURIComponent`: everything but `A-Z a-z 0-9 - _ . ! ~ * ' ( )` is `%XX` over the UTF-8
/// bytes (a space is `%20`, not `+`).
fn encode_uri_component(text: &str) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    let mut out = String::with_capacity(text.len());
    for byte in text.bytes() {
        match byte {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'!'
            | b'~'
            | b'*'
            | b'\''
            | b'('
            | b')' => out.push(char::from(byte)),
            _ => {
                out.push('%');
                out.push(char::from(HEX[usize::from(byte >> 4)]));
                out.push(char::from(HEX[usize::from(byte & 0x0F)]));
            }
        }
    }
    out
}

/// The TS `userAgentFor`: the Heroic-style string the recorded requests carry.
fn user_agent(ctx: &InfoCtx) -> String {
    format!(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeroicGamesLauncher/{}",
        ctx.app_version
    )
}

/// JS truthiness of a JSON value.
fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|f| f != 0.0 && !f.is_nan()),
        Value::String(s) => !s.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

/// The error text axios gave for a request that produced no response. Fixed categories only: the
/// request URL never reaches it.
fn transport_message(error: &HttpError) -> String {
    match error {
        HttpError::Timeout => format!("timeout of {}ms exceeded", TIMEOUT.as_millis()),
        HttpError::TooLarge => format!(
            "maxContentLength size of {} exceeded",
            crate::http::DEFAULT_MAX_BODY
        ),
        HttpError::Cancelled => "canceled".to_string(),
        HttpError::Network(_) => "Network Error".to_string(),
    }
}

/// The `data` array of a successful answer, or the error the TS threw. `fallback` is the endpoint's
/// message when the API gave no `errors`.
async fn fetch_list(
    ctx: &InfoCtx,
    key: &str,
    url: String,
    fallback: &str,
) -> Result<Vec<Value>, String> {
    let request = Request::get(url, TIMEOUT)
        .header("Accept", "application/json, text/plain, */*")
        .header("Authorization", &format!("Bearer {key}"))
        .header("User-Agent", &user_agent(ctx));
    let response = ctx
        .http
        .send(request)
        .await
        .map_err(|e| transport_message(&e))?;
    if !(200..300).contains(&response.status) {
        return Err(format!(
            "Request failed with status code {}",
            response.status
        ));
    }
    // axios parses a JSON-looking body and otherwise keeps the text, whose `.success` is undefined.
    let body = serde_json::from_str::<Value>(&String::from_utf8_lossy(&response.body))
        .unwrap_or(Value::String(String::new()));
    let object = match &body {
        Value::Null => {
            return Err("Cannot read properties of null (reading 'success')".to_string());
        }
        Value::Object(object) => object,
        _ => return Err(fallback.to_string()),
    };
    if !object.get("success").is_some_and(truthy) {
        let joined = match object.get("errors") {
            Some(Value::Array(items)) => items
                .iter()
                .map(|item| match item {
                    Value::String(s) => s.clone(),
                    Value::Null => String::new(),
                    other => other.to_string(),
                })
                .collect::<Vec<_>>()
                .join(", "),
            _ => String::new(),
        };
        return Err(if joined.is_empty() {
            fallback.to_string()
        } else {
            joined
        });
    }
    match object.get("data") {
        Some(Value::Array(items)) => Ok(items.clone()),
        None | Some(Value::Null) => {
            let what = if object.contains_key("data") {
                "null"
            } else {
                "undefined"
            };
            Err(format!("Cannot read properties of {what} (reading 'map')"))
        }
        Some(_) => Err("results.map is not a function".to_string()),
    }
}

/// The fields of `item` named in `names`, copied when present (JSON.stringify drops `undefined`).
fn narrow(item: &Value, names: &[&str]) -> Value {
    let mut out = Map::new();
    if let Some(object) = item.as_object() {
        for name in names {
            if let Some(value) = object.get(*name) {
                out.insert((*name).to_string(), value.clone());
            }
        }
    }
    Value::Object(out)
}

/// `[{id, name}]` for the games matching `args.query`. No key: `[]`, no request.
pub async fn search_game(ctx: &InfoCtx, args: SearchArgs) -> Result<Value, String> {
    const OP: &str = "info_steamgrid_search";
    if utf16_len(&args.query) > TEXT_MAX_UTF16 {
        return Err(format!("{OP}:bad-args"));
    }
    let Some(key) = stored_key(ctx, OP) else {
        return Ok(json!([]));
    };
    let url = format!(
        "{API_URL}/search/autocomplete/{}",
        encode_uri_component(&args.query)
    );
    let games = fetch_list(ctx, &key, url, "Search failed").await?;
    Ok(Value::Array(
        games.iter().map(|g| narrow(g, &["id", "name"])).collect(),
    ))
}

/// The URL for a grids or heroes request: the query only when a list is non-empty, `dimensions`
/// first, as the TS params object was built.
fn artwork_url(kind: &str, args: &GridArgs) -> String {
    let joined =
        |list: &Option<Vec<String>>| list.as_ref().filter(|l| !l.is_empty()).map(|l| l.join(","));
    let (dimensions, styles) = (joined(&args.dimensions), joined(&args.styles));
    let mut pairs: Vec<(&str, &str)> = Vec::new();
    if let Some(d) = &dimensions {
        pairs.push(("dimensions", d));
    }
    if let Some(s) = &styles {
        pairs.push(("styles", s));
    }
    let base = format!("{API_URL}/{kind}/game/{}", args.game_id);
    if pairs.is_empty() {
        base
    } else {
        format!("{base}?{}", axios_query(&pairs))
    }
}

async fn artwork(
    ctx: &InfoCtx,
    op: &str,
    kind: &str,
    fallback: &str,
    args: GridArgs,
) -> Result<Value, String> {
    check_grid_args(op, &args)?;
    let Some(key) = stored_key(ctx, op) else {
        return Ok(json!([]));
    };
    let items = fetch_list(ctx, &key, artwork_url(kind, &args), fallback).await?;
    Ok(Value::Array(
        items
            .iter()
            .map(|g| narrow(g, &["id", "url", "thumb"]))
            .collect(),
    ))
}

/// `[{id, url, thumb}]`: the grids of one game. No key: `[]`, no request.
pub async fn get_grids(ctx: &InfoCtx, args: GridArgs) -> Result<Value, String> {
    artwork(
        ctx,
        "info_steamgrid_grids",
        "grids",
        "Failed to get grids",
        args,
    )
    .await
}

/// `[{id, url, thumb}]`: the heroes of one game. No key: `[]`, no request.
pub async fn get_heroes(ctx: &InfoCtx, args: GridArgs) -> Result<Value, String> {
    artwork(
        ctx,
        "info_steamgrid_heroes",
        "heroes",
        "Failed to get heroes",
        args,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_uri_component_matches_javascript() {
        assert_eq!(encode_uri_component("Dead Cells"), "Dead%20Cells");
        assert_eq!(
            encode_uri_component("a-b_c.d!e~f*g'h(i)j"),
            "a-b_c.d!e~f*g'h(i)j"
        );
        assert_eq!(
            encode_uri_component("a/b?c=d&e#f+g,h:i"),
            "a%2Fb%3Fc%3Dd%26e%23f%2Bg%2Ch%3Ai"
        );
        assert_eq!(encode_uri_component("é"), "%C3%A9");
        assert_eq!(encode_uri_component("日本"), "%E6%97%A5%E6%9C%AC");
        assert_eq!(encode_uri_component("100%"), "100%25");
        assert_eq!(encode_uri_component(""), "");
    }

    #[test]
    fn artwork_url_lists_dimensions_before_styles_and_omits_empty_lists() {
        let args = GridArgs {
            game_id: 7,
            styles: Some(vec!["alternate".into(), "material".into()]),
            dimensions: Some(vec!["460x215".into(), "920x430".into()]),
        };
        assert_eq!(
            artwork_url("grids", &args),
            "https://www.steamgriddb.com/api/v2/grids/game/7?dimensions=460x215,920x430&styles=alternate,material"
        );
        let empty = GridArgs {
            game_id: 9,
            styles: Some(vec![]),
            dimensions: None,
        };
        assert_eq!(
            artwork_url("heroes", &empty),
            "https://www.steamgriddb.com/api/v2/heroes/game/9"
        );
        let only_styles = GridArgs {
            game_id: 9,
            styles: Some(vec!["a b".into()]),
            dimensions: Some(vec![]),
        };
        assert_eq!(
            artwork_url("grids", &only_styles),
            "https://www.steamgriddb.com/api/v2/grids/game/9?styles=a+b"
        );
    }

    #[test]
    fn grid_args_decode_is_strict() {
        let ok = |v: Value| serde_json::from_value::<GridArgs>(v).is_ok();
        assert!(ok(json!({ "gameId": 1 })));
        assert!(ok(
            json!({ "gameId": 1, "styles": ["a"], "dimensions": [] })
        ));
        for bad in [
            json!({}),
            json!({ "gameId": "1" }),
            json!({ "gameId": 1.5 }),
            json!({ "gameId": -1 }),
            json!({ "gameId": 1, "extra": 1 }),
            json!({ "gameId": 1, "styles": null }),
            json!({ "gameId": 1, "dimensions": null }),
            json!({ "gameId": 1, "styles": [1] }),
            json!({ "gameId": 1, "styles": "a" }),
        ] {
            assert!(!ok(bad.clone()), "{bad}");
        }
    }

    #[test]
    fn grid_args_bounds_match_the_zod_schema() {
        let base = |styles: Vec<String>| GridArgs {
            game_id: 1,
            styles: Some(styles),
            dimensions: None,
        };
        let check = |a: &GridArgs| check_grid_args("op", a);
        assert!(check(&base(vec!["x".repeat(64); 64])).is_ok());
        assert_eq!(
            check(&base(vec!["x".into(); 65])),
            Err("op:bad-args".into())
        );
        assert_eq!(
            check(&base(vec!["x".repeat(65)])),
            Err("op:bad-args".into())
        );
        // The limit counts UTF-16 units: 33 astral characters are 66.
        assert_eq!(
            check(&base(vec!["\u{1F600}".repeat(33)])),
            Err("op:bad-args".into())
        );
        let zero = GridArgs {
            game_id: 0,
            styles: None,
            dimensions: None,
        };
        assert_eq!(check(&zero), Err("op:bad-args".into()));
    }

    #[test]
    fn truthy_follows_javascript() {
        for (value, want) in [
            (json!(true), true),
            (json!(false), false),
            (json!(null), false),
            (json!(0), false),
            (json!(2), true),
            (json!(""), false),
            (json!("x"), true),
            (json!([]), true),
            (json!({}), true),
        ] {
            assert_eq!(truthy(&value), want, "{value}");
        }
    }

    #[test]
    fn narrow_copies_only_the_named_fields_that_exist() {
        let item = json!({ "id": 1, "name": "n", "types": ["x"], "url": "u" });
        assert_eq!(
            narrow(&item, &["id", "name"]),
            json!({ "id": 1, "name": "n" })
        );
        assert_eq!(
            narrow(&json!({ "id": 1 }), &["id", "name"]),
            json!({ "id": 1 })
        );
        assert_eq!(narrow(&json!(5), &["id"]), json!({}));
    }

    #[test]
    fn the_key_never_shows_in_a_debug_string() {
        let args = SetKeyArgs {
            key: "super-secret".into(),
        };
        assert!(!format!("{args:?}").contains("super-secret"));
    }
}
