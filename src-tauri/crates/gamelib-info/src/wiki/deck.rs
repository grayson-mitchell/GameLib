//! Steam Deck compatibility (Phase 86, SVC-01), ported from `src/backend/wiki_game_info/steamdeck/utils.ts`:
//! a Steam game's Deck category from the store's compatibility report. Linux only (the aggregator, 86-22,
//! asks it only there).
//!
//! The request is the one the TS made and the 86-06 goldens pin (D-10): `GET
//! https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport?nAppID=<steamID>` with the
//! `GameLib/<version>` User-Agent; the id is interpolated as the caller gave it.
//!
//! Parity points copied, not fixed (D-03):
//! - an absent or empty id answers `None` with no request;
//! - any failure of the request, or an answer whose `results.resolved_category` is not a finite number
//!   (`Number.isFinite`: a numeric text is not one), answers `None`;
//! - the category is passed through as the number the server sent (a non-integer is not rejected).

use serde_json::Value;

use crate::ctx::InfoCtx;
use crate::js::opt_prop;

use super::{get_data, user_agent};

/// `SteamDeckComp`: `{ category }`.
#[derive(Debug, Clone, PartialEq)]
pub struct DeckComp {
    pub category: serde_json::Number,
}

impl DeckComp {
    pub fn to_value(&self) -> Value {
        serde_json::json!({ "category": self.category })
    }
}

/// `getSteamDeckComp(steamID)`.
pub async fn get_comp(ctx: &InfoCtx, steam_id: Option<&str>) -> Option<DeckComp> {
    let steam_id = steam_id.filter(|id| !id.is_empty())?;
    let url = format!(
        "https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport?nAppID={steam_id}"
    );
    let data = match get_data(ctx, url, &user_agent(ctx)).await {
        Ok(data) => data,
        Err(thrown) => {
            ctx.note(&format!("steam deck lookup failed ({})", thrown.word()));
            return None;
        }
    };
    // `Number.isFinite(response.data?.results?.resolved_category)`
    let category = opt_prop(Some(&data), "results")
        .and_then(|results| opt_prop(results, "resolved_category"))
        .ok()
        .flatten();
    match category {
        Some(Value::Number(n)) if n.as_f64().is_some_and(f64::is_finite) => Some(DeckComp {
            category: n.clone(),
        }),
        _ => {
            ctx.note("steam deck answer has no resolved category");
            None
        }
    }
}
