//! The library-wide CrossOver rating map, ported from `src/backend/crossover_index/crossoverRatingMap.ts`
//! (`buildCrossoverRatingMap`), the op `info_crossover_rating_map` behind the renderer's
//! `getCrossoverIndex`.
//!
//! D-11/D-16: every library title's rating is resolved ONCE, into a three-state map keyed by `app_name`
//! so the grid never fires a per-card request to paint a badge:
//!
//! - key absent: the game was never looked up (not eligible: a non-Steam title while the D-02 name gate
//!   is closed), so no mark is painted for it;
//! - `null`: looked up, nothing found, an "unknown" mark;
//! - a number 1 to 5: matched, the badge.
//!
//! Empty off macOS: the CrossOver question only applies to a macOS translation layer (D-10).
//!
//! The index is loaded once for the pass, and lazily: a library with nothing eligible never consults it
//! (WR-07). The caller, the TS resolver `info/crossover.ts`, only gathers the games (D-24).

use serde::Deserialize;
use serde_json::{Map, Value};

use super::{index_resolver, is_eligible, GameRef};
use crate::ctx::{InfoCtx, Platform};
use crate::runner_caps;

/// The most games one call takes (T-86-47). A library is hundreds to a few thousand.
pub const MAX_GAMES: usize = 20_000;

/// One game of the library, as the TS resolver sends it.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Game {
    pub app_name: String,
    pub title: String,
    pub runner: String,
}

/// `{ games }`. Unknown fields are rejected.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct RatingMapArgs {
    pub games: Vec<Game>,
}

/// `buildCrossoverRatingMap` over `games`, in order. A later game with the same `app_name` overwrites an
/// earlier one, as the TS object assignment did.
pub async fn rating_map(ctx: &InfoCtx, games: &[Game]) -> Map<String, Value> {
    let mut map = Map::new();
    if ctx.platform != Platform::Mac {
        return map;
    }
    let mut resolver = None;
    for game in games {
        if !is_eligible(&game.runner) {
            // Never looked up: the key stays absent (D-16).
            continue;
        }
        if resolver.is_none() {
            resolver = Some(index_resolver(ctx).await);
        }
        let Some(loaded) = resolver.as_ref() else {
            continue;
        };
        let rating = loaded.rating(&GameRef {
            runner: &game.runner,
            app_name: &game.app_name,
            title: &game.title,
        });
        map.insert(
            game.app_name.clone(),
            rating.map_or(Value::Null, |r| Value::from(u64::from(r))),
        );
    }
    map
}

/// The op: decodes nothing itself (the dispatcher did), refuses what the renderer schema refuses and
/// answers the map as a JSON object.
pub async fn rating_map_op(ctx: &InfoCtx, args: RatingMapArgs) -> Result<Value, String> {
    const BAD: &str = "info_crossover_rating_map:bad-args";
    if args.games.len() > MAX_GAMES {
        return Err(BAD.to_string());
    }
    // The TS table lookup threw for a name that is not a runner, which rejected the whole call.
    if args
        .games
        .iter()
        .any(|g| runner_caps::caps(&g.runner).is_none())
    {
        return Err(BAD.to_string());
    }
    Ok(Value::Object(rating_map(ctx, &args.games).await))
}
