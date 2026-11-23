//! ProtonDB (Phase 86, SVC-01), ported from `src/backend/wiki_game_info/protondb/utils.ts`: a Steam
//! game's compatibility tier from the public summaries endpoint. Linux only (the aggregator, 86-22,
//! asks it only there).
//!
//! The request is the one the TS made and the 86-06 goldens pin (D-10): `GET
//! https://www.protondb.com/api/v1/reports/summaries/<steamID>.json` with the `GameLib/<version>`
//! User-Agent. The id goes into the path as given once it is all digits (WR-03: anything else answers `None` with no
//! request, since a `/`, `?` or `#` would rewrite the path; a real Steam app id is digits).
//!
//! Parity points copied, not fixed (D-03):
//! - an absent, empty or non-numeric id answers `None` with no request;
//! - any failure of the request, or an answer whose `tier` is missing or falsy, answers `None`;
//! - the tier is passed through as the server sent it (the TS typed it as a string and checked only that
//!   it was truthy), so a non-text tier is not rejected.

use serde_json::Value;

use crate::ctx::InfoCtx;
use crate::js::{opt_prop, truthy};

use super::{get_data, is_numeric_id, user_agent};

/// `ProtonDBCompatibilityInfo`: `{ level }`.
#[derive(Debug, Clone, PartialEq)]
pub struct ProtonDb {
    pub level: Value,
}

impl ProtonDb {
    pub fn to_value(&self) -> Value {
        serde_json::json!({ "level": self.level })
    }
}

/// `getInfoFromProtonDB(steamID)`.
pub async fn get_info(ctx: &InfoCtx, steam_id: Option<&str>) -> Option<ProtonDb> {
    let steam_id = steam_id.filter(|id| is_numeric_id(id))?;
    let url = format!("https://www.protondb.com/api/v1/reports/summaries/{steam_id}.json");
    let data = match get_data(ctx, url, &user_agent(ctx)).await {
        Ok(data) => data,
        Err(thrown) => {
            ctx.note(&format!("protondb lookup failed ({})", thrown.word()));
            return None;
        }
    };
    // `response.data?.tier`: an answer that is `null` has none.
    match opt_prop(Some(&data), "tier") {
        Ok(Some(tier)) if truthy(tier) => Some(ProtonDb {
            level: tier.clone(),
        }),
        _ => {
            ctx.note("protondb answer has no tier");
            None
        }
    }
}
