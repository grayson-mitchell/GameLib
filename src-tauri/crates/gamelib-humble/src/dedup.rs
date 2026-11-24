//! The ownership dedup, ported from `src/backend/humble/dedup.ts` (Phase 94, D-06, HDEDUP-01,
//! D-44/D-45).
//!
//! Pure: no I/O, no logging, no store. The Steam library and the D-42 override predicate are passed
//! in, so this is unit-testable with no collaborator, exactly as the TypeScript is.
//!
//! Two-tier matching:
//!
//! 1. If a key carries `steam_app_id`, ownership is decided by EXACT AppID equality against the Steam
//!    library's `app_name` (the stringified AppID). For a Humble-supplied id the verdict is final, with
//!    NO fuzzy fallback (D-44). An id GameLib resolved from the title (`steam_app_id_resolved`, see
//!    [`crate::app_id_resolver`]) can only upgrade: a miss falls through to the fuzzy tier.
//! 2. Otherwise a length-sensitive normalised-Levenshtein ratio at 85% or more
//!    ([`crate::title_match::HUMBLE_FUZZY_MATCH_THRESHOLD`]) with the DLC and remaster guards,
//!    deliberately NOT token-set matching (12-RESEARCH.md Pattern 3 / Pitfall 1).
//!
//! The matcher primitives live in [`crate::title_match`] and are re-exported here, as the TypeScript
//! module re-exports them, so a caller of this module reads one namespace.

use serde::Deserialize;

use crate::classify::{HumbleKey, HumbleKeyState, MatchConfidence};

pub use crate::title_match::{
    fuzzy_match, is_dlc_false_positive_risk, normalize_title, title_similarity,
};

/// The two fields of a Steam library entry (`GameInfo`) the matcher reads: the stringified AppID and
/// the title. Any other field of the entry is ignored on read.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct SteamGame {
    pub app_name: String,
    pub title: String,
}

/// Recomputes the ownership overlay (`owned_elsewhere` / `match_confidence`) for every key against
/// the given Steam library snapshot. Rules, in order:
///
/// - an `UNPICKED` pseudo-entry is excluded from matching entirely (D-27): returned unchanged;
/// - an EMPTY library is "no usable Steam data": every key is returned unchanged rather than zeroed
///   (D-48 unit-level floor; the connectivity gate lives in the caller);
/// - a usable `steam_app_id` is an exact `app_name` equality (`exact` on a hit; on a miss `none` with
///   NO fuzzy fallback, D-44, unless the id was resolved by GameLib from the title);
/// - otherwise fuzzy title matching across the whole library (`fuzzy` on a hit), with no platform
///   gate: a GOG or Epic key matching a Steam-owned title is the intended cross-platform behaviour;
/// - the D-42 override ("Not the same game") only ever clears a FUZZY match: an exact AppID match is
///   ground truth and cannot be overridden.
pub fn recompute_ownership(
    keys: &[HumbleKey],
    steam_games: &[SteamGame],
    is_overridden: &dyn Fn(&str) -> bool,
) -> Vec<HumbleKey> {
    if steam_games.is_empty() {
        return keys.to_vec();
    }
    keys.iter()
        .map(|key| {
            if key.state == HumbleKeyState::Unpicked {
                return key.clone();
            }
            let mut owned_elsewhere = false;
            let mut confidence = MatchConfidence::None;
            // D-71 / WR-01: a falsy-but-present id ('' or '0') must not shadow the fuzzy tier. The
            // string '0' is truthy in JavaScript, so it is excluded explicitly alongside '' and absent.
            let usable_id = key
                .steam_app_id
                .as_deref()
                .filter(|id| !id.is_empty() && *id != "0");
            if let Some(id) = usable_id {
                if steam_games.iter().any(|game| game.app_name == id) {
                    owned_elsewhere = true;
                    confidence = MatchConfidence::Exact;
                }
            }
            // Fuzzy tier: no usable id, OR a GameLib-resolved id that missed the library (never
            // worse than before the resolver existed). A Humble-supplied id that missed stays
            // `none` (D-44).
            let fuzzy_eligible = usable_id.is_none() || key.steam_app_id_resolved == Some(true);
            if confidence == MatchConfidence::None
                && fuzzy_eligible
                && steam_games
                    .iter()
                    .any(|game| fuzzy_match(&key.title, &game.title))
            {
                owned_elsewhere = true;
                confidence = MatchConfidence::Fuzzy;
            }
            if confidence == MatchConfidence::Fuzzy && is_overridden(&key.machine_name) {
                owned_elsewhere = false;
                confidence = MatchConfidence::None;
            }
            HumbleKey {
                owned_elsewhere,
                match_confidence: confidence,
                ..key.clone()
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    //! One module per `describe` of `dedup.test.ts` and one test per `it`, with the TypeScript title
    //! in a doc comment. The Steam library fixtures are read from the recorded goldens' inputs (the
    //! same objects the TypeScript fixtures built), not retyped.

    use super::*;
    use std::path::PathBuf;

    fn never_overridden(_: &str) -> bool {
        false
    }

    fn always_overridden(_: &str) -> bool {
        true
    }

    /// `makeKey(overrides)`.
    fn make_key(overrides: impl FnOnce(&mut HumbleKey)) -> HumbleKey {
        let mut key = HumbleKey {
            gamekey: "order-1".to_string(),
            machine_name: "somegame_steam".to_string(),
            state: HumbleKeyState::Unrevealed,
            title: "Some Game".to_string(),
            platform: "steam".to_string(),
            expiration: None,
            origin: "Some Bundle".to_string(),
            steam_app_id: None,
            steam_app_id_resolved: None,
            owned_elsewhere: false,
            match_confidence: MatchConfidence::None,
        };
        overrides(&mut key);
        key
    }

    fn golden_games(case: &str) -> Vec<SteamGame> {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/golden/dedup")
            .join(format!("{case}.json"));
        let golden: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        serde_json::from_value(golden["input"]["steamGames"].clone()).unwrap()
    }

    /// `ownedSteamLibrary`: Portal 2, Assault Android Cactus, Framed Collection, Into The Breach
    /// (Steam), Game X, Batman: Arkham Knight, Stardew Valley.
    fn owned_steam_library() -> Vec<SteamGame> {
        let games = golden_games("dedup-appid-exact");
        assert_eq!(games.len(), 7);
        games
    }

    /// `[steamOwnedGameX]`.
    fn steam_owned_game_x() -> Vec<SteamGame> {
        let games = golden_games("dedup-library-game-x-only-portal");
        assert_eq!(games.len(), 1);
        games
    }

    /// `[steamOwnedBatmanArkhamKnight]`.
    fn steam_owned_batman() -> Vec<SteamGame> {
        let games = golden_games("dedup-library-batman-only-portal");
        assert_eq!(games.len(), 1);
        games
    }

    fn first(keys: Vec<HumbleKey>) -> HumbleKey {
        keys.into_iter().next().expect("one result")
    }

    mod recompute_ownership_appid_tier_d44 {
        use super::*;

        /// appid: steamAppId present and owned -> exact match
        #[test]
        fn appid_steam_app_id_present_and_owned_is_an_exact_match() {
            let key = make_key(|k| {
                k.steam_app_id = Some("620".to_string());
                k.title = "Portal 2".to_string();
            });
            let result = first(recompute_ownership(
                &[key],
                &owned_steam_library(),
                &never_overridden,
            ));
            assert!(result.owned_elsewhere);
            assert_eq!(result.match_confidence, MatchConfidence::Exact);
        }

        /// appid: steamAppId present but NOT owned -> none, no fuzzy fallback
        #[test]
        fn appid_steam_app_id_present_but_not_owned_is_none_with_no_fuzzy_fallback() {
            // The title would trivially fuzzy-match an owned title, but D-44 says the AppID
            // verdict is final.
            let key = make_key(|k| {
                k.steam_app_id = Some("999999".to_string());
                k.title = "Portal 2".to_string();
            });
            let result = first(recompute_ownership(
                &[key],
                &owned_steam_library(),
                &never_overridden,
            ));
            assert!(!result.owned_elsewhere);
            assert_eq!(result.match_confidence, MatchConfidence::None);
        }
    }

    mod recompute_ownership_fuzzy_match_tier_d45 {
        use super::*;

        fn fuzzy_hit(title: &str) {
            let key = make_key(|k| k.title = title.to_string());
            let result = first(recompute_ownership(
                &[key],
                &owned_steam_library(),
                &never_overridden,
            ));
            assert!(result.owned_elsewhere, "{title}");
            assert_eq!(result.match_confidence, MatchConfidence::Fuzzy, "{title}");
        }

        /// fuzzy match: %s matches owned %s at 85%+ (`it.each`, three rows)
        #[test]
        fn fuzzy_match_assault_android_cactus_matches_at_85_percent() {
            fuzzy_hit("Assault Android Cactus+");
        }

        #[test]
        fn fuzzy_match_framed_collection_matches_at_85_percent() {
            fuzzy_hit("FRAMED Collection");
        }

        #[test]
        fn fuzzy_match_into_the_breach_matches_at_85_percent() {
            fuzzy_hit("Into the Breach");
        }

        /// fuzzy match: unrelated title does not match anything
        #[test]
        fn fuzzy_match_unrelated_title_does_not_match_anything() {
            let key = make_key(|k| k.title = "Totally Different".to_string());
            let result = first(recompute_ownership(
                &[key],
                &owned_steam_library(),
                &never_overridden,
            ));
            assert!(!result.owned_elsewhere);
            assert_eq!(result.match_confidence, MatchConfidence::None);
        }

        /// cross-platform (D-45): a gog-platform key fuzzy-matches a Steam-owned title
        #[test]
        fn cross_platform_a_gog_platform_key_fuzzy_matches_a_steam_owned_title() {
            let key = make_key(|k| {
                k.platform = "gog".to_string();
                k.title = "Stardew Valley".to_string();
            });
            let result = first(recompute_ownership(
                &[key],
                &owned_steam_library(),
                &never_overridden,
            ));
            assert!(result.owned_elsewhere);
            assert_eq!(result.match_confidence, MatchConfidence::Fuzzy);
        }
    }

    mod recompute_ownership_dlc_guard_success_criterion_3 {
        use super::*;

        /// dlc: "Game X: Season Pass" does NOT match owned "Game X"
        #[test]
        fn dlc_game_x_season_pass_does_not_match_owned_game_x() {
            let key = make_key(|k| k.title = "Game X: Season Pass".to_string());
            let result = first(recompute_ownership(
                &[key],
                &steam_owned_game_x(),
                &never_overridden,
            ));
            assert!(!result.owned_elsewhere);
            assert_eq!(result.match_confidence, MatchConfidence::None);
        }

        /// dlc: "Batman" does NOT match owned "Batman: Arkham Knight"
        #[test]
        fn dlc_batman_does_not_match_owned_batman_arkham_knight() {
            let key = make_key(|k| k.title = "Batman".to_string());
            let result = first(recompute_ownership(
                &[key],
                &steam_owned_batman(),
                &never_overridden,
            ));
            assert!(!result.owned_elsewhere);
            assert_eq!(result.match_confidence, MatchConfidence::None);
        }
    }

    mod recompute_ownership_wr01_falsy_steam_app_id_fix_d71 {
        use super::*;

        fn stardew_with(id: Option<&str>) -> HumbleKey {
            make_key(|k| {
                k.steam_app_id = id.map(str::to_string);
                k.title = "Stardew Valley".to_string();
            })
        }

        /// falsy steamAppId '' falls through to the fuzzy tier instead of skipping both
        #[test]
        fn falsy_steam_app_id_empty_string_falls_through_to_the_fuzzy_tier() {
            let result = first(recompute_ownership(
                &[stardew_with(Some(""))],
                &owned_steam_library(),
                &never_overridden,
            ));
            assert!(result.owned_elsewhere);
            assert_eq!(result.match_confidence, MatchConfidence::Fuzzy);
        }

        /// falsy steamAppId '0' falls through to the fuzzy tier instead of skipping both
        #[test]
        fn falsy_steam_app_id_zero_string_falls_through_to_the_fuzzy_tier() {
            let result = first(recompute_ownership(
                &[stardew_with(Some("0"))],
                &owned_steam_library(),
                &never_overridden,
            ));
            assert!(result.owned_elsewhere);
            assert_eq!(result.match_confidence, MatchConfidence::Fuzzy);
        }

        /// regression: a real exact-matching steamAppId still returns exact (no regression)
        #[test]
        fn regression_a_real_exact_matching_steam_app_id_still_returns_exact() {
            let key = make_key(|k| {
                k.steam_app_id = Some("620".to_string());
                k.title = "Portal 2".to_string();
            });
            let result = first(recompute_ownership(
                &[key],
                &owned_steam_library(),
                &never_overridden,
            ));
            assert!(result.owned_elsewhere);
            assert_eq!(result.match_confidence, MatchConfidence::Exact);
        }

        /// regression: steamAppId undefined still fuzzy-matches (no regression)
        #[test]
        fn regression_steam_app_id_undefined_still_fuzzy_matches() {
            let result = first(recompute_ownership(
                &[stardew_with(None)],
                &owned_steam_library(),
                &never_overridden,
            ));
            assert!(result.owned_elsewhere);
            assert_eq!(result.match_confidence, MatchConfidence::Fuzzy);
        }
    }

    mod recompute_ownership_unpicked_exclusion_d27 {
        use super::*;

        /// unpicked: an UNPICKED pseudo-entry is never matched, returned unchanged
        #[test]
        fn unpicked_an_unpicked_pseudo_entry_is_never_matched_and_returned_unchanged() {
            // The title is deliberately identical to an owned game: still skipped.
            let key = make_key(|k| {
                k.state = HumbleKeyState::Unpicked;
                k.title = "Portal 2".to_string();
            });
            let result = first(recompute_ownership(
                std::slice::from_ref(&key),
                &owned_steam_library(),
                &never_overridden,
            ));
            assert_eq!(result, key);
            assert!(!result.owned_elsewhere);
            assert_eq!(result.match_confidence, MatchConfidence::None);
        }
    }

    mod recompute_ownership_keep_last_known_d48_unit_level {
        use super::*;

        /// keep-last-known: an empty Steam library leaves prior values unchanged
        #[test]
        fn keep_last_known_an_empty_steam_library_leaves_prior_values_unchanged() {
            let previously_matched = make_key(|k| {
                k.title = "Stardew Valley".to_string();
                k.owned_elsewhere = true;
                k.match_confidence = MatchConfidence::Fuzzy;
            });
            let untouched = make_key(|k| {
                k.machine_name = "other_steam".to_string();
                k.title = "Totally Different".to_string();
            });
            let keys = [previously_matched, untouched];
            assert_eq!(
                recompute_ownership(&keys, &[], &never_overridden),
                keys.to_vec()
            );
        }
    }

    mod recompute_ownership_d42_override {
        use super::*;

        /// override clears a fuzzy match ("Not the same game")
        #[test]
        fn override_clears_a_fuzzy_match() {
            let key = make_key(|k| k.title = "Stardew Valley".to_string());
            let result = first(recompute_ownership(
                &[key],
                &owned_steam_library(),
                &always_overridden,
            ));
            assert!(!result.owned_elsewhere);
            assert_eq!(result.match_confidence, MatchConfidence::None);
        }

        /// override never clears an exact AppID match
        #[test]
        fn override_never_clears_an_exact_app_id_match() {
            let key = make_key(|k| {
                k.steam_app_id = Some("620".to_string());
                k.title = "Portal 2".to_string();
            });
            let result = first(recompute_ownership(
                &[key],
                &owned_steam_library(),
                &always_overridden,
            ));
            assert!(result.owned_elsewhere);
            assert_eq!(result.match_confidence, MatchConfidence::Exact);
        }
    }

    mod normalize_title_tests {
        use super::*;

        /// lowercases, strips trademark symbols, punctuation, and edition suffixes
        #[test]
        fn lowercases_strips_trademark_symbols_punctuation_and_edition_suffixes() {
            assert_eq!(normalize_title("FRAMED Collection\u{2122}"), "framed");
            assert_eq!(
                normalize_title("Assault Android Cactus+"),
                "assault android cactus"
            );
            assert_eq!(
                normalize_title("Skyrim: Game of the Year Edition"),
                "skyrim"
            );
        }

        /// strips parenthetical qualifiers like "(Steam)"
        #[test]
        fn strips_parenthetical_qualifiers_like_steam() {
            assert_eq!(
                normalize_title("Into The Breach (Steam)"),
                "into the breach"
            );
        }
    }

    mod title_similarity_tests {
        use super::*;

        /// identical-after-normalization titles score 1
        #[test]
        fn identical_after_normalization_titles_score_1() {
            assert_eq!(
                title_similarity("FRAMED Collection", "Framed Collection"),
                1.0
            );
        }

        /// empty-after-normalization input scores 0
        #[test]
        fn empty_after_normalization_input_scores_0() {
            assert_eq!(title_similarity("\u{2122}\u{ae}\u{a9}", "Portal 2"), 0.0);
        }

        /// a DLC title scores well below threshold against its base game
        #[test]
        fn a_dlc_title_scores_well_below_threshold_against_its_base_game() {
            assert!(title_similarity("Game X: Season Pass", "Game X") < 0.85);
        }
    }

    mod is_dlc_false_positive_risk_tests {
        use super::*;

        /// flags when the longer raw title carries a DLC keyword the shorter lacks
        #[test]
        fn flags_when_the_longer_raw_title_carries_a_dlc_keyword_the_shorter_lacks() {
            assert!(is_dlc_false_positive_risk("Game X", "Game X: Season Pass"));
            assert!(is_dlc_false_positive_risk("Game X: Season Pass", "Game X"));
            assert!(is_dlc_false_positive_risk(
                "Half-Life",
                "Half-Life (Original Soundtrack)"
            ));
        }

        /// does not flag when neither or both titles carry DLC keywords
        #[test]
        fn does_not_flag_when_neither_or_both_titles_carry_dlc_keywords() {
            assert!(!is_dlc_false_positive_risk("Portal 2", "Portal 2"));
            assert!(!is_dlc_false_positive_risk(
                "Game X Season Pass",
                "Game X: Season Pass"
            ));
        }
    }

    mod fuzzy_match_tests {
        use super::*;

        /// accepts documented should-match pairs at the 85% threshold
        #[test]
        fn accepts_documented_should_match_pairs_at_the_85_percent_threshold() {
            assert!(fuzzy_match(
                "Assault Android Cactus+",
                "Assault Android Cactus"
            ));
            assert!(fuzzy_match("FRAMED Collection", "Framed Collection"));
            assert!(fuzzy_match("Into the Breach", "Into The Breach (Steam)"));
        }

        /// rejects documented should-NOT-match pairs (DLC guard + length penalty)
        #[test]
        fn rejects_documented_should_not_match_pairs() {
            assert!(!fuzzy_match("Game X: Season Pass", "Game X"));
            assert!(!fuzzy_match("Batman", "Batman: Arkham Knight"));
        }
    }

    mod recompute_ownership_resolved_steam_app_id_tier {
        use super::*;

        /// resolved id present in the library -> exact
        #[test]
        fn resolved_id_present_in_the_library_is_exact() {
            let key = make_key(|k| {
                k.steam_app_id = Some("620".to_string());
                k.steam_app_id_resolved = Some(true);
                k.title = "Portal 2".to_string();
            });
            let result = first(recompute_ownership(
                &[key],
                &owned_steam_library(),
                &never_overridden,
            ));
            assert!(result.owned_elsewhere);
            assert_eq!(result.match_confidence, MatchConfidence::Exact);
        }

        /// resolved id absent but title fuzzy-matches -> fuzzy fallback, override still clears it
        #[test]
        fn resolved_id_absent_but_title_fuzzy_matches_falls_back_to_fuzzy_and_the_override_clears_it(
        ) {
            let key = make_key(|k| {
                k.steam_app_id = Some("999999".to_string());
                k.steam_app_id_resolved = Some(true);
                k.title = "Portal 2".to_string();
            });
            let result = first(recompute_ownership(
                std::slice::from_ref(&key),
                &owned_steam_library(),
                &never_overridden,
            ));
            assert_eq!(result.match_confidence, MatchConfidence::Fuzzy);
            let overridden = first(recompute_ownership(
                &[key],
                &owned_steam_library(),
                &always_overridden,
            ));
            assert_eq!(overridden.match_confidence, MatchConfidence::None);
            assert!(!overridden.owned_elsewhere);
        }

        /// resolved id absent and no fuzzy match -> none
        #[test]
        fn resolved_id_absent_and_no_fuzzy_match_is_none() {
            let key = make_key(|k| {
                k.steam_app_id = Some("999999".to_string());
                k.steam_app_id_resolved = Some(true);
                k.title = "Totally Unrelated Title Zzz".to_string();
            });
            let result = first(recompute_ownership(
                &[key],
                &owned_steam_library(),
                &never_overridden,
            ));
            assert_eq!(result.match_confidence, MatchConfidence::None);
            assert!(!result.owned_elsewhere);
        }

        /// Humble-supplied id absent -> none with no fuzzy fallback (D-44)
        #[test]
        fn a_humble_supplied_id_absent_is_none_with_no_fuzzy_fallback() {
            let key = make_key(|k| {
                k.steam_app_id = Some("999999".to_string());
                k.title = "Portal 2".to_string();
            });
            let result = first(recompute_ownership(
                &[key],
                &owned_steam_library(),
                &never_overridden,
            ));
            assert_eq!(result.match_confidence, MatchConfidence::None);
        }

        /// exact via a resolved id is not cleared by the override
        #[test]
        fn exact_via_a_resolved_id_is_not_cleared_by_the_override() {
            let key = make_key(|k| {
                k.steam_app_id = Some("620".to_string());
                k.steam_app_id_resolved = Some(true);
                k.title = "Portal 2".to_string();
            });
            let result = first(recompute_ownership(
                &[key],
                &owned_steam_library(),
                &always_overridden,
            ));
            assert_eq!(result.match_confidence, MatchConfidence::Exact);
        }
    }
}
