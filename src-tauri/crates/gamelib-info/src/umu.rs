//! The umu id lookup (Phase 86, SVC-01, D-04), ported from `src/backend/wiki_game_info/umu/utils.ts`:
//! `info_umu_get {appName, runner}` answers the umu id GameLib hands to umu-launcher for a store game,
//! or `null`.
//!
//! The request is the one the TS made and the 86-06 goldens pin (D-10): `GET
//! https://umu.openwinecomponents.org/umu_api.php` with `codename` (the app name lower-cased) and then
//! `store` (the umu name of the runner's store, from `runnerCapabilities.json`), the query written the
//! way axios writes it. The result is cached in `store_cache/umu.json` over [`CacheView`] with the TS
//! store's parameters (6 hours, `invalidate WhenFalsy`).
//!
//! Parity points copied, not fixed (D-03):
//! - a runner without a store catalog (sideload) answers `null` with no request and no cache read;
//! - a cached value is used only when it is truthy, so a cached `null` (a confirmed miss) is asked for
//!   again on every call (the todo `2026-11-22-umu-cached-null-refetched-every-call`), and because the
//!   store only drops an expired entry whose value is falsy, an expired truthy id is kept and served;
//! - a transport failure, a non-2xx status or a 2xx other than 200 answers `null` and writes nothing;
//! - an empty list is a miss: `null` answered and cached;
//! - an answer that is not a list, or whose first entry has no `umu_id`, made the TS throw (a failed
//!   destructure, a TypeError, or conf refusing to store `undefined`): the op rejects with
//!   `info_umu_get:bad-response` and writes nothing.
//!
//! Unlike TS (which set no timeout) the request has a 30 s bound, so a dead connection cannot hold the
//! op open until the application exits (T-86-49).

use std::time::Duration;

use gamelib_store::json::Json;
use serde::Deserialize;
use serde_json::Value;

use crate::cache_view::{is_falsy, CacheView, UMU};
use crate::ctx::InfoCtx;
use crate::http::{axios_query, Request};
use crate::runner_caps;

const OP: &str = "info_umu_get";

/// The umu lookup endpoint.
pub const API_URL: &str = "https://umu.openwinecomponents.org/umu_api.php";

const TIMEOUT: Duration = Duration::from_secs(30);

/// `{appName, runner}`: the store game to look up. `runner` is one of the five runner names. Unknown
/// fields are rejected.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct UmuArgs {
    pub app_name: String,
    pub runner: String,
}

fn bad_response() -> String {
    format!("{OP}:bad-response")
}

/// `getUmuId`. `Ok` is the id as the cache or the server held it (a string in practice) or `null`.
pub async fn get(ctx: &InfoCtx, args: UmuArgs) -> Result<Value, String> {
    // The TS table lookup threw for a name that is not a runner.
    let (Some(caps), Some(store)) = (
        runner_caps::caps(&args.runner),
        runner_caps::umu_store(&args.runner),
    ) else {
        return Err(format!("{OP}:bad-args"));
    };
    // If it's a sideload, there won't be any umu id.
    if !caps.has_store_catalog {
        return Ok(Value::Null);
    }

    let key = format!("{}_{}", args.runner, args.app_name);
    let view = CacheView::open(&ctx.host, &ctx.paths.user_data, UMU, ctx.clock.clone())
        .map_err(|_| format!("{OP}:store-unavailable"))?;
    if let Some(cached) = view.get_opt(&key).filter(|value| !is_falsy(value)) {
        return Ok(cached.to_value());
    }

    let url = format!(
        "{API_URL}?{}",
        axios_query(&[
            ("codename", args.app_name.to_lowercase().as_str()),
            ("store", store)
        ])
    );
    // The TS caught every failure of the request itself, a non-2xx status included.
    let Ok(response) = ctx.http.send(Request::get(url, TIMEOUT)).await else {
        return Ok(Value::Null);
    };
    if response.status != 200 {
        return Ok(Value::Null);
    }

    // `const [firstMatch] = response.data`. axios hands back the text when the body is not JSON.
    let data: Value = serde_json::from_slice(&response.body)
        .unwrap_or_else(|_| Value::String(String::from_utf8_lossy(&response.body).into_owned()));
    let first = match &data {
        Value::Array(items) => items.first(),
        // An empty text iterates to nothing; any other text yields a character with no `umu_id`.
        Value::String(text) if text.is_empty() => None,
        _ => return Err(bad_response()),
    };
    let Some(first) = first else {
        view.set(&key, Json::Null)
            .map_err(|_| format!("{OP}:store-write"))?;
        return Ok(Value::Null);
    };
    let Some(umu_id) = first.as_object().and_then(|entry| entry.get("umu_id")) else {
        return Err(bad_response());
    };
    view.set(&key, Json::from(umu_id.clone()))
        .map_err(|_| format!("{OP}:store-write"))?;
    Ok(umu_id.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn args_reject_unknown_fields_and_missing_ones() {
        let ok: UmuArgs =
            serde_json::from_value(serde_json::json!({"appName": "a", "runner": "gog"})).unwrap();
        assert_eq!(ok.app_name, "a");
        for bad in [
            serde_json::json!({"appName": "a"}),
            serde_json::json!({"runner": "gog"}),
            serde_json::json!({"appName": "a", "runner": "gog", "x": 1}),
            serde_json::json!({"appName": 1, "runner": "gog"}),
        ] {
            assert!(serde_json::from_value::<UmuArgs>(bad).is_err());
        }
    }
}
