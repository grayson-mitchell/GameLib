//! The CrossOver compatibility index (Phase 86, SVC-01), ported from `src/backend/crossover_index/`
//! (`index.ts`, `fetcher.ts`, `schema.ts`, `normalize.ts`, `stores.ts`, `crossoverRatingMap.ts`).
//!
//! The index is a gzip JSON asset on this repository's rolling `crossover-index` release: `{ version,
//! generatedAt, entries: [{ name, rating 1..5, steamid? }] }`, built daily from CodeWeavers' own
//! dump. [`fetcher`] fetches it over HTTPS only, validates it ([`schema`], bounds kept exactly) and
//! keeps the last good copy in the `crossover_index` cache under the key `index`; [`normalize`] is the
//! matching key. This module joins a game to a rating:
//!
//! - an exact Steam-AppID join for a runner whose `app_name` is a Steam appId (never gated);
//! - then, while [`normalize::NAME_MATCHING_SHIPS`] holds, the normalized title (D-02).
//!
//! The lookups are [`codeweavers_for`] (the wiki's CodeWeavers info, 86-22), [`index_has`] (the wiki's
//! synchronous self-heal probe, which reads only what is already stored) and [`index_resolver`]
//! (one load for a whole pass). [`rating_map::rating_map`] resolves a library's ratings in one pass for
//! the grid's badges (op `info_crossover_rating_map`).
//!
//! In-memory state (the failure back-off and the index maps memoized per payload `generatedAt`) lives in
//! [`CrossoverState`] on the context, so it is per process like the TS's per-boot fetcher and memo.

pub mod fetcher;
pub mod normalize;
pub mod rating_map;
pub mod schema;

use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};

use serde_json::{json, Value};

use crate::ctx::InfoCtx;
use crate::runner_caps;
use normalize::{normalize, slugify, NAME_MATCHING_SHIPS};
use schema::Index;

/// The rolling-release asset (`crossoverIndexDescriptor.url`). Must be https (T-19-03).
pub const INDEX_URL: &str = "https://github.com/grayson-mitchell/GameLib/releases/download/crossover-index/crossover-index.json.gz";
/// The cache key (`crossoverIndexDescriptor.name`).
pub const INDEX_KEY: &str = "index";
/// The bundled cold-start snapshot, under the app's `public` directory.
pub const BUNDLED_FILE: &str = "crossover-index.json.gz";
/// The loader's own staleness window (`ttlMinutes: 60 * 24`).
pub const TTL_MINUTES: f64 = 60.0 * 24.0;

/// A game as the lookups see it (`IndexLookupInput`: `runner`, `app_name` and `title`).
#[derive(Debug, Clone, Copy)]
pub struct GameRef<'a> {
    pub runner: &'a str,
    pub app_name: &'a str,
    pub title: &'a str,
}

/// `{ macRating, linuxRating: null, slug }` (`CodeweaversInfo`). A miss is `mac_rating: None` with an
/// empty slug: "checked, none found", which the caller caches and the UI shows as "Unrated".
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodeweaversInfo {
    pub mac_rating: Option<u8>,
    pub slug: String,
}

impl CodeweaversInfo {
    pub fn to_value(&self) -> Value {
        json!({ "macRating": self.mac_rating, "linuxRating": null, "slug": self.slug })
    }
}

/// The two lookup maps of one payload. First wins on a collision (the builder already deduplicated;
/// this is the TS's defensive tie-break).
#[derive(Debug, Default)]
pub struct IndexMaps {
    by_steam_id: HashMap<String, u8>,
    by_name: HashMap<String, u8>,
}

impl IndexMaps {
    fn build(index: &Index) -> IndexMaps {
        let mut maps = IndexMaps::default();
        for entry in &index.entries {
            // `entry.steamid &&`: an empty id is falsy and is skipped.
            if let Some(id) = entry.steamid.as_deref().filter(|id| !id.is_empty()) {
                maps.by_steam_id
                    .entry(id.to_string())
                    .or_insert(entry.rating);
            }
            maps.by_name
                .entry(normalize(&entry.name))
                .or_insert(entry.rating);
        }
        maps
    }

    /// `resolveRating`: the exact Steam-AppID join first (only for a runner whose `app_name` is a Steam
    /// appId, and never gated), then, while the D-02 gate is open, the normalized title. A name that is
    /// not a runner finds nothing (the TS table lookup threw and the caller's `catch` answered null).
    pub fn rating(&self, game: &GameRef<'_>) -> Option<u8> {
        let caps = runner_caps::caps(game.runner)?;
        if caps.app_name_is_steam_app_id {
            if let Some(rating) = self.by_steam_id.get(game.app_name) {
                return Some(*rating);
            }
        }
        if !NAME_MATCHING_SHIPS {
            return None;
        }
        self.by_name.get(&normalize(game.title)).copied()
    }
}

/// `isCrossoverIndexEligible`: "was this game looked up at all?". A Steam-AppID runner always; any
/// other only while the D-02 gate is open. A name that is not a runner is not.
pub fn is_eligible(runner: &str) -> bool {
    runner_caps::caps(runner).is_some_and(|c| c.app_name_is_steam_app_id || NAME_MATCHING_SHIPS)
}

#[derive(Default)]
struct Inner {
    /// When the last refresh failed, for the back-off (one index, so one slot).
    last_failure_ms: Option<u64>,
    /// The maps of the last payload seen, keyed on its `generatedAt`.
    memo: Option<(String, Arc<IndexMaps>)>,
}

/// The index's in-memory session state, held by [`InfoCtx`]. Nothing here is persisted: a restart
/// forgets a back-off and rebuilds the maps, as a new TS boot did.
#[derive(Default)]
pub struct CrossoverState {
    inner: Mutex<Inner>,
    /// One load at a time, so two callers that find a stale cache do not both download (the TS had no
    /// such guard; a second caller now waits, then finds the fresh copy).
    load: tokio::sync::Mutex<()>,
}

impl CrossoverState {
    pub fn new() -> CrossoverState {
        CrossoverState::default()
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub(crate) fn load_lock(&self) -> &tokio::sync::Mutex<()> {
        &self.load
    }

    pub(crate) fn last_failure_ms(&self) -> Option<u64> {
        self.lock().last_failure_ms
    }

    pub(crate) fn record_failure(&self, now_ms: u64) {
        self.lock().last_failure_ms = Some(now_ms);
    }

    pub(crate) fn clear_failure(&self) {
        self.lock().last_failure_ms = None;
    }

    /// `buildMaps`: the maps for `index`, rebuilt only when its `generatedAt` differs from the
    /// memoized one.
    pub(crate) fn maps_for(&self, index: &Index) -> Arc<IndexMaps> {
        let mut inner = self.lock();
        if let Some((generated_at, maps)) = &inner.memo {
            if *generated_at == index.generated_at {
                return Arc::clone(maps);
            }
        }
        let maps = Arc::new(IndexMaps::build(index));
        inner.memo = Some((index.generated_at.clone(), Arc::clone(&maps)));
        maps
    }
}

/// `getCodeweaversFromIndex`: an index-only lookup, with no request beyond the loader's own cached,
/// TTL'd fetch. A hit carries the rating and `slugify(title)`; a loaded miss (including a gated-out name
/// match) is the "checked, none found" marker with an EMPTY slug on purpose (the UI then opens the
/// CodeWeavers search instead of a probable 404); `None` means the index could not load, which the
/// caller treats as retryable rather than a cached miss. Never invents a rating.
pub async fn codeweavers_for(ctx: &InfoCtx, game: &GameRef<'_>) -> Option<CodeweaversInfo> {
    let index = match fetcher::load_index(ctx, INDEX_URL).await {
        Ok(Some(loaded)) => loaded.index,
        Ok(None) | Err(_) => return None,
    };
    // An unknown runner threw inside the TS `try` and answered null.
    runner_caps::caps(game.runner)?;
    let maps = ctx.crossover.maps_for(&index);
    Some(match maps.rating(game) {
        None => CodeweaversInfo {
            mac_rating: None,
            slug: String::new(),
        },
        Some(rating) => CodeweaversInfo {
            mac_rating: Some(rating),
            slug: slugify(game.title),
        },
    })
}

/// `crossoverIndexHas`: the synchronous self-heal probe. It reads the last good payload from the cache
/// (any age, no request) and applies the same gated resolution. False when nothing is stored.
pub fn index_has(ctx: &InfoCtx, game: &GameRef<'_>) -> bool {
    let Some(cached) = fetcher::read_cached(ctx) else {
        return false;
    };
    ctx.crossover.maps_for(&cached.index).rating(game).is_some()
}

/// What [`index_resolver`] returns: the maps of one load, or nothing when the index could not load
/// (every lookup then answers `None`, as the TS `() => null` did).
pub struct Resolver(Option<Arc<IndexMaps>>);

impl Resolver {
    pub fn rating(&self, game: &GameRef<'_>) -> Option<u8> {
        self.0.as_ref()?.rating(game)
    }

    /// Whether the index loaded.
    pub fn is_loaded(&self) -> bool {
        self.0.is_some()
    }
}

/// `buildIndexResolver` (WR-07): loads the index ONCE for a batch and returns a resolver over its maps.
/// A total load failure yields a resolver that finds nothing, so a caller cannot tell a failed load
/// from a miss (deliberate; the degradation D-09 already specifies).
pub async fn index_resolver(ctx: &InfoCtx) -> Resolver {
    match fetcher::load_index(ctx, INDEX_URL).await {
        Ok(Some(loaded)) => Resolver(Some(ctx.crossover.maps_for(&loaded.index))),
        Ok(None) | Err(_) => Resolver(None),
    }
}

#[cfg(test)]
mod tests {
    use super::schema::Entry;
    use super::*;

    fn index(generated_at: &str, entries: &[(&str, u8, Option<&str>)]) -> Index {
        Index {
            generated_at: generated_at.to_string(),
            entries: entries
                .iter()
                .map(|(name, rating, steamid)| Entry {
                    name: (*name).to_string(),
                    rating: *rating,
                    steamid: steamid.map(str::to_string),
                })
                .collect(),
        }
    }

    fn game<'a>(runner: &'a str, app_name: &'a str, title: &'a str) -> GameRef<'a> {
        GameRef {
            runner,
            app_name,
            title,
        }
    }

    fn sample() -> IndexMaps {
        IndexMaps::build(&index(
            "2026-11-21T00:00:00Z",
            &[
                ("Elden Ring", 5, Some("1245620")),
                ("Hades", 5, Some("1145360")),
                ("Quake II", 4, None),
                ("Same Name", 2, None),
                ("Same Name", 3, None),
                ("Dup Id A", 1, Some("77")),
                ("Dup Id B", 4, Some("77")),
                ("Blank Id", 3, Some("")),
            ],
        ))
    }

    #[test]
    fn a_steam_app_id_join_wins_over_the_title_and_only_for_a_steam_runner() {
        let maps = sample();
        // The id decides even when the title says something else.
        assert_eq!(
            maps.rating(&game("steam", "1245620", "Wrong Title")),
            Some(5)
        );
        // A GOG game whose app_name equals a Steam id is not an id join; it falls to the name.
        assert_eq!(
            maps.rating(&game("gog", "1245620", "Nothing Like It")),
            None
        );
        assert_eq!(maps.rating(&game("gog", "gog-1", "Elden Ring")), Some(5));
    }

    #[test]
    fn a_steam_id_miss_falls_through_to_the_normalized_title() {
        let maps = sample();
        assert_eq!(maps.rating(&game("steam", "999", "Elden Ring")), Some(5));
        assert_eq!(maps.rating(&game("steam", "999", "Quake 2")), None);
        assert_eq!(maps.rating(&game("steam", "999", "QUAKE  II")), Some(4));
        assert_eq!(
            maps.rating(&game("legendary", "e", "Hades (Deluxe Edition)")),
            Some(5)
        );
        assert_eq!(maps.rating(&game("sideload", "s", "Unknown")), None);
    }

    #[test]
    fn the_first_entry_wins_a_collision_and_an_empty_id_is_not_indexed() {
        let maps = sample();
        assert_eq!(maps.rating(&game("sideload", "x", "Same Name")), Some(2));
        assert_eq!(maps.rating(&game("steam", "77", "None")), Some(1));
        assert_eq!(maps.rating(&game("steam", "", "None")), None);
    }

    #[test]
    fn a_name_that_is_not_a_runner_finds_nothing_and_is_not_eligible() {
        let maps = sample();
        assert_eq!(maps.rating(&game("humble", "1245620", "Elden Ring")), None);
        assert!(!is_eligible("humble"));
        for runner in ["steam", "gog", "legendary", "nile", "sideload"] {
            assert!(is_eligible(runner), "{runner}");
        }
    }

    #[test]
    fn the_maps_are_rebuilt_only_when_generated_at_changes() {
        let state = CrossoverState::new();
        let first = index("2026-11-21T00:00:00Z", &[("A", 1, None)]);
        let a = state.maps_for(&first);
        assert!(Arc::ptr_eq(&a, &state.maps_for(&first)));
        // The memo is keyed on `generatedAt` alone, as in the TS: the same stamp reuses the maps.
        let same_stamp = index("2026-11-21T00:00:00Z", &[("B", 2, None)]);
        assert!(Arc::ptr_eq(&a, &state.maps_for(&same_stamp)));
        // A new stamp rebuilds them.
        let next = index("2026-11-22T00:00:00Z", &[("B", 2, None)]);
        let b = state.maps_for(&next);
        assert!(!Arc::ptr_eq(&a, &b));
        assert_eq!(
            b.rating(&game("sideload", "s", "B")),
            Some(2),
            "the rebuilt maps hold the new entries"
        );
    }

    #[test]
    fn the_failure_back_off_is_state_that_clears_on_success() {
        let state = CrossoverState::new();
        assert_eq!(state.last_failure_ms(), None);
        state.record_failure(1234);
        assert_eq!(state.last_failure_ms(), Some(1234));
        state.clear_failure();
        assert_eq!(state.last_failure_ms(), None);
    }

    #[test]
    fn a_hit_carries_the_slug_and_a_miss_the_empty_marker() {
        let hit = CodeweaversInfo {
            mac_rating: Some(5),
            slug: slugify("Baldur's Gate 3"),
        };
        assert_eq!(
            hit.to_value(),
            json!({ "macRating": 5, "linuxRating": null, "slug": "baldurs-gate-3" })
        );
        let miss = CodeweaversInfo {
            mac_rating: None,
            slug: String::new(),
        };
        assert_eq!(
            miss.to_value(),
            json!({ "macRating": null, "linuxRating": null, "slug": "" })
        );
    }
}
