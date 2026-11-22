//! Title matching for HowLongToBeat's search results (Phase 86, SVC-01), ported from
//! `src/backend/wiki_game_info/howlongtobeat/titleMatch.ts`.
//!
//! An HLTB id is exact; a title search returns ranked guesses, and the wrong playtime is worse than none,
//! so [`pick_best_match`] refuses whenever it cannot tell two candidates apart: similarity below
//! [`MIN_CONFIDENCE`], a runner-up within the margin, or sequel numbers that disagree. Pure and
//! network-free. Every pattern is the one in [`super::regexes`] (86-20), and every vector of
//! `titleMatch.test.ts` is repeated in this file's tests.

use std::collections::HashMap;

use unicode_normalization::UnicodeNormalization;

use super::regexes;

/// Minimum similarity for a candidate to be considered at all.
pub const MIN_CONFIDENCE: f64 = 0.9;

/// How far the best candidate must beat the runner-up (`Doom` 1993 and `DOOM` 2016 normalize
/// identically, so similarity alone would pick whichever HLTB ranked first).
const MIN_MARGIN: f64 = 0.05;

/// The arabic text of a normalized (`[a-z0-9]`) roman numeral word, or `None`. The TS read a JS object
/// literal here, so a trailing `constructor` found `Object.prototype.constructor` and was folded to
/// that function's text; this table has no such entry.
fn roman_numeral(word: &str) -> Option<&'static str> {
    Some(match word {
        "i" => "1",
        "ii" => "2",
        "iii" => "3",
        "iv" => "4",
        "v" => "5",
        "vi" => "6",
        "vii" => "7",
        "viii" => "8",
        "ix" => "9",
        "x" => "10",
        "xi" => "11",
        "xii" => "12",
        "xiii" => "13",
        "xiv" => "14",
        "xv" => "15",
        "xvi" => "16",
        _ => return None,
    })
}

/// `normalizeTitle`: NFKD, diacritics out, lower case, `&` spelled `and`, every run of anything but
/// `a-z0-9` one space, the ends trimmed, and a TRAILING roman numeral folded to its arabic value (so
/// `Final Fantasy VII` meets `Final Fantasy 7`). Editions are not stripped.
pub fn normalize_title(title: &str) -> String {
    let decomposed: String = title.nfkd().collect();
    let stripped = regexes::combining_marks().replace_all(&decomposed, "");
    let lowered = stripped.to_lowercase();
    let spelled = regexes::ampersand().replace_all(&lowered, " and ");
    let squashed = regexes::non_alphanumeric_run().replace_all(&spelled, " ");
    // Only spaces remain at the ends, so JS `trim()` is a trim of spaces.
    let normalized = squashed.trim_matches(' ');

    let mut words: Vec<&str> = normalized.split(' ').collect();
    let last = words.last().copied().unwrap_or_default();
    if words.len() > 1 && !last.is_empty() {
        if let Some(folded) = roman_numeral(last) {
            let at = words.len() - 1;
            words[at] = folded;
            return words.join(" ");
        }
    }
    normalized.to_string()
}

/// `sequelToken`: the trailing number of an ALREADY-NORMALIZED title, `None` when it has none or it is
/// not a safe integer (`Portal` is `None`, which keeps it apart from `Portal 2`).
pub fn sequel_token(normalized: &str) -> Option<u64> {
    const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
    let last_word = normalized.split(' ').next_back().unwrap_or_default();
    if last_word.is_empty() || !regexes::all_digits().is_match(last_word) {
        return None;
    }
    // `parseInt` of a longer digit run than `u64` holds is far beyond the safe range.
    last_word
        .parse::<u64>()
        .ok()
        .filter(|parsed| *parsed <= MAX_SAFE_INTEGER)
}

/// Sørensen-Dice coefficient over character bigrams, counted in UTF-16 code units as the JS string
/// methods count them.
pub fn dice_similarity(a: &str, b: &str) -> f64 {
    if a == b {
        return 1.0;
    }
    let a: Vec<u16> = a.encode_utf16().collect();
    let b: Vec<u16> = b.encode_utf16().collect();
    if a.len() < 2 || b.len() < 2 {
        return 0.0;
    }
    let bigrams = |s: &[u16]| {
        let mut counts: HashMap<(u16, u16), usize> = HashMap::new();
        for pair in s.windows(2) {
            *counts.entry((pair[0], pair[1])).or_insert(0) += 1;
        }
        counts
    };
    let (a_grams, b_grams) = (bigrams(&a), bigrams(&b));
    let intersection: usize = a_grams
        .iter()
        .map(|(gram, count)| (*count).min(b_grams.get(gram).copied().unwrap_or(0)))
        .sum();
    (2 * intersection) as f64 / ((a.len() - 1) + (b.len() - 1)) as f64
}

/// `toSearchTerms`: the trademark glyphs blanked, the title split on whitespace, trailing punctuation
/// cut from each term, empty terms dropped. Diacritics and interior punctuation stay (HLTB handles
/// `Pokémon Snap` and `NieR:Automata`). This widens the search; it never decides a match.
pub fn to_search_terms(title: &str) -> Vec<String> {
    let blanked = regexes::trademark_glyphs().replace_all(title, " ");
    regexes::whitespace_run()
        .split(&blanked)
        // The TS `.trim()` after the cut has nothing to trim: no term holds a character `\s` matches.
        .map(|term| {
            regexes::trailing_punctuation()
                .replace(term, "")
                .into_owned()
        })
        .filter(|term| !term.is_empty())
        .collect()
}

/// `pickBestMatch`: the one candidate that is unambiguously the same game, or `None`. Three conditions,
/// all required: similarity at or above [`MIN_CONFIDENCE`]; the runner-up trailing by at least the
/// margin (a rival that normalizes identically counts); sequel tokens that agree exactly (checked
/// before scoring, so a sequel can never be the runner-up a legitimate match must out-margin).
pub fn pick_best_match<T>(query: &str, candidates: Vec<(String, T)>) -> Option<T> {
    let normalized_query = normalize_title(query);
    if normalized_query.is_empty() || candidates.is_empty() {
        return None;
    }
    let query_sequel = sequel_token(&normalized_query);

    let mut scored: Vec<(f64, T)> = candidates
        .into_iter()
        .filter_map(|(title, value)| {
            let normalized = normalize_title(&title);
            (sequel_token(&normalized) == query_sequel)
                .then(|| (dice_similarity(&normalized_query, &normalized), value))
        })
        .collect();
    // `sort((a, b) => b.score - a.score)` is stable: equal scores keep the HLTB ranking.
    scored.sort_by(|a, b| b.0.total_cmp(&a.0));

    let best_score = scored.first()?.0;
    if best_score < MIN_CONFIDENCE {
        return None;
    }
    let contenders = scored
        .iter()
        .filter(|(score, _)| best_score - score < MIN_MARGIN)
        .count();
    if contenders > 1 {
        return None;
    }
    scored.into_iter().next().map(|(_, value)| value)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidates(titles: &[&str]) -> Vec<(String, String)> {
        titles
            .iter()
            .map(|t| ((*t).to_string(), (*t).to_string()))
            .collect()
    }

    fn pick(query: &str, titles: &[&str]) -> Option<String> {
        pick_best_match(query, candidates(titles))
    }

    #[test]
    fn normalize_title_lowercases_strips_punctuation_and_collapses_whitespace() {
        assert_eq!(
            normalize_title("  The Witcher 3: Wild Hunt  "),
            "the witcher 3 wild hunt"
        );
        assert_eq!(normalize_title("Pokémon Snap"), "pokemon snap");
        assert_eq!(normalize_title("Sam & Max"), "sam and max");
        assert_eq!(
            normalize_title("Dark Souls: Remastered"),
            "dark souls remastered"
        );
    }

    #[test]
    fn normalize_title_folds_a_trailing_roman_numeral_only() {
        assert_eq!(normalize_title("Final Fantasy VII"), "final fantasy 7");
        assert_eq!(normalize_title("Final Fantasy 7"), "final fantasy 7");
        assert_eq!(normalize_title("Rome II Total War"), "rome ii total war");
        assert_eq!(normalize_title("X"), "x");
    }

    /// Recorded by running the TS function in node: compatibility forms fold through NFKD (a small
    /// roman numeral, the fraction slash) and the dotted capital I loses its dot.
    #[test]
    fn normalize_title_matches_the_ts_on_unicode_input() {
        assert_eq!(
            normalize_title("Ünïcode İstanbul Ⅶ ½"),
            "unicode istanbul vii 1 2"
        );
        assert_eq!(normalize_title("Final Fantasy ⅶ"), "final fantasy 7");
    }

    /// A trailing `constructor` is an ordinary word, not `Object.prototype.constructor` as it was in
    /// the TS's object-literal lookup.
    #[test]
    fn a_trailing_constructor_is_left_as_a_word() {
        assert_eq!(normalize_title("Bridge Constructor"), "bridge constructor");
        assert_eq!(normalize_title("Constructor"), "constructor");
        assert_eq!(
            pick("Bridge Constructor", &["Bridge Constructor"]).as_deref(),
            Some("Bridge Constructor")
        );
    }

    #[test]
    fn sequel_token_reads_a_trailing_number() {
        assert_eq!(sequel_token(&normalize_title("Portal 2")), Some(2));
        assert_eq!(sequel_token(&normalize_title("Final Fantasy VII")), Some(7));
        assert_eq!(sequel_token(&normalize_title("Portal")), None);
        assert_eq!(sequel_token(&normalize_title("Half-Life: Alyx")), None);
        // Past the safe-integer range the token is `null`; at it, it is a number.
        assert_eq!(
            sequel_token("x 9007199254740991"),
            Some(9_007_199_254_740_991)
        );
        assert_eq!(sequel_token("x 9007199254740992"), None);
        assert_eq!(sequel_token("x 99999999999999999999999"), None);
        assert_eq!(sequel_token(""), None);
    }

    #[test]
    fn to_search_terms_drops_glyphs_and_trailing_punctuation_only() {
        assert_eq!(
            to_search_terms("Sekiro™: Shadows Die Twice"),
            ["Sekiro", "Shadows", "Die", "Twice"]
        );
        assert_eq!(to_search_terms("Pokémon Snap"), ["Pokémon", "Snap"]);
        assert_eq!(to_search_terms("NieR:Automata"), ["NieR:Automata"]);
        assert_eq!(to_search_terms("Hades  ®  "), ["Hades"]);
        assert_eq!(to_search_terms("What?! Wait..."), ["What", "Wait"]);
        assert!(to_search_terms("   ").is_empty());
    }

    #[test]
    fn dice_similarity_scores_identical_disjoint_and_symmetric() {
        assert_eq!(dice_similarity("portal", "portal"), 1.0);
        assert_eq!(dice_similarity("abcd", "wxyz"), 0.0);
        assert_eq!(dice_similarity("a", "ab"), 0.0);
        let (forward, backward) = (
            dice_similarity("celeste", "celestia"),
            dice_similarity("celestia", "celeste"),
        );
        assert!((forward - backward).abs() < 1e-12);
    }

    #[test]
    fn pick_best_match_accepts_the_same_title_after_normalization() {
        assert_eq!(
            pick("The Witcher 3: Wild Hunt", &["the witcher 3 wild hunt"]).as_deref(),
            Some("the witcher 3 wild hunt")
        );
        assert_eq!(
            pick("Final Fantasy VII", &["Final Fantasy 7"]).as_deref(),
            Some("Final Fantasy 7")
        );
        assert_eq!(
            pick(
                "Final Fantasy VII",
                &[
                    "Final Fantasy VIII",
                    "Final Fantasy VII",
                    "Final Fantasy VI"
                ]
            )
            .as_deref(),
            Some("Final Fantasy VII")
        );
        assert_eq!(
            pick("Hollow Knight", &["Hollow Knight"]).as_deref(),
            Some("Hollow Knight")
        );
        assert!(
            dice_similarity(
                &normalize_title("Hollow Knight"),
                &normalize_title("Hollow Knight")
            ) >= MIN_CONFIDENCE
        );
    }

    #[test]
    fn pick_best_match_refuses_what_it_cannot_tell_apart() {
        // Two distinct entries that normalize identically.
        assert_eq!(pick("Doom", &["Doom", "DOOM"]), None);
        // A sequel when the query has no sequel token, and the reverse.
        assert_eq!(pick("Portal", &["Portal 2"]), None);
        assert_eq!(pick("Portal 2", &["Portal"]), None);
        // The sequel guard's only load-bearing cases: above the threshold, with no runner-up.
        assert_eq!(pick("Final Fantasy VII", &["Final Fantasy VIII"]), None);
        assert_eq!(pick("Dragon Quest 11", &["Dragon Quest 12"]), None);
        // An edition variant, a near-tie, and a score below the threshold.
        assert_eq!(pick("Dark Souls", &["Dark Souls: Remastered"]), None);
        assert_eq!(pick("Celeste", &["Celeste", "Celeste!"]), None);
        assert_eq!(pick("Hades", &["Hollow Knight"]), None);
        // Nothing to pick from, and nothing to look for.
        assert_eq!(pick("Hades", &[]), None);
        assert_eq!(pick("   ", &["Hades"]), None);
    }

    #[test]
    fn a_tie_between_the_best_scores_keeps_the_first_ranked_only_when_alone() {
        // Stable ordering: the first of two equal scores is `best`, but both are contenders.
        assert_eq!(pick("Doom", &["DOOM", "doom"]), None);
        // A weaker second candidate does not block the best one.
        assert_eq!(
            pick("Hollow Knight", &["Hollow Knight", "Hallow Night Saga"]).as_deref(),
            Some("Hollow Knight")
        );
    }
}
