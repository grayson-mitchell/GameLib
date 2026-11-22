//! GOG GamesDB (Phase 86, SVC-01), ported from `src/backend/wiki_game_info/gamesdb/utils.ts`: the Steam id
//! of a store game, read out of GOG's cross-store release table. The one request is
//! [`super::gog_ctx::gamesdb_release`] (D-23); the answer's shape is read with the JS semantics of
//! [`crate::js`].
//!
//! Parity points copied, not fixed (D-03):
//! - a runner with no `storeMap` entry (sideload) or whose app name already is a Steam app id answers
//!   `{ steamID: "" }` with no request (a Steam title's own appId is its Steam id, and `storeMap.steam`
//!   must not add a GOG call);
//! - a failed request, a 404 and every other non-2xx answer read as "no data" and give `""`;
//! - an answer with data but no `game.releases` list made the TS throw out of the lookup (a property
//!   read of `undefined`), which failed the whole wiki lookup: here it is `Err`, and the aggregator
//!   (86-22) maps it to the same `null` result;
//! - the `steamID` is `external_id` of the first release whose `platform_id` is `steam`, passed through
//!   as sent (a list entry that is `null` before the match throws, as in the TS).

use gamelib_store::json::{Json, Obj};
use serde_json::Value;

use crate::ctx::InfoCtx;
use crate::js::{opt_prop, prop, truthy};
use crate::runner_caps;

use super::gog_ctx::gamesdb_release;
use super::Thrown;

/// `GamesDBInfo`: `{ steamID }`. A text in every real answer, so it is kept as the JSON value only to
/// stay exactly what the cache would have held.
#[derive(Debug, Clone, PartialEq)]
pub struct GamesDb {
    pub steam_id: Value,
}

impl GamesDb {
    /// `{ steamID: "" }`.
    pub fn empty() -> GamesDb {
        GamesDb {
            steam_id: Value::String(String::new()),
        }
    }

    pub fn to_json(&self) -> Json {
        let mut object = Obj::new();
        object.insert_js("steamID", Json::from(self.steam_id.clone()));
        Json::Obj(object)
    }

    pub fn to_value(&self) -> Value {
        self.to_json().to_value()
    }

    /// `steamID` is truthy (`gamesdb?.steamID || pcgamingwiki?.steamID` in the aggregator).
    pub fn has_steam_id(&self) -> bool {
        truthy(&self.steam_id)
    }
}

/// `getInfoFromGamesDB(deps, title, appName, runner)`. The title only went into a log line in the TS;
/// here it is not used at all (a diagnostic line never carries one).
pub async fn get(
    ctx: &InfoCtx,
    _title: &str,
    app_name: &str,
    runner: &str,
) -> Result<GamesDb, Thrown> {
    ctx.note("getting gamesdb data");
    let store = runner_caps::store_map(runner);
    let is_steam = runner_caps::caps(runner).is_some_and(|caps| caps.app_name_is_steam_app_id);
    let Some(store) = store.filter(|_| !is_steam) else {
        return Ok(GamesDb::empty());
    };
    let Some(data) = gamesdb_release(ctx, store, app_name).await else {
        return Ok(GamesDb::empty());
    };

    // `gamesdb.data?.game.releases.find((entry) => entry.platform_id === 'steam')?.external_id ?? ''`
    let releases = prop(prop(Some(&data), "game")?, "releases")?;
    let Some(Value::Array(releases)) = releases else {
        // `undefined.find` or `find` of a value that has none.
        return Err(Thrown::Shape);
    };
    for entry in releases {
        let platform = prop(Some(entry), "platform_id")?;
        if platform == Some(&Value::String("steam".to_string())) {
            let external = opt_prop(Some(entry), "external_id")?;
            let steam_id = external
                .filter(|id| !id.is_null())
                .cloned()
                .unwrap_or_else(|| Value::String(String::new()));
            return Ok(GamesDb { steam_id });
        }
    }
    Ok(GamesDb::empty())
}
