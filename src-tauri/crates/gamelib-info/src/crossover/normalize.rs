//! The CrossOver MATCHING key and the CodeWeavers URL slug, ported from
//! `src/backend/crossover_index/normalize.ts` and `src/backend/wiki_game_info/codeweavers/utils.ts`.
//!
//! The two are siblings, never one function (D-20): the slug keeps numerals verbatim and drops
//! apostrophes before it hyphenates, the matching key strips a known edition-suffix vocabulary to raise
//! the hit rate. Both start from the same base transform (NFKD, strip the combining marks U+0300 to
//! U+036F, lowercase) and both can only emit `[a-z0-9-]`, so a crafted title cannot inject anything
//! into a URL or a map key (T-16-01).
//!
//! `String.prototype.normalize('NFKD')` is `unicode-normalization`'s `nfkd`. `toLowerCase` is
//! `str::to_lowercase`; they differ only on characters that the next step removes anyway (everything
//! outside `a-z0-9` becomes a hyphen).

use unicode_normalization::UnicodeNormalization;

/// D-02's promotion-gate verdict, machine-readable: `true` since the measured PASS of 2026-07-13
/// (candidate C, wrong-hit rate 0.81%, hit rate 85.37%). While `false`, only the exact Steam-AppID join
/// would answer; a Steam-AppID miss and every non-Steam game would be key-absent. Kept as the TS name.
pub const NAME_MATCHING_SHIPS: bool = true;

/// The longest edition-suffix chain stripped (`MAX_EDITION_STRIP_PASSES`).
const MAX_EDITION_STRIP_PASSES: usize = 5;

/// The suffix vocabulary of `EDITION_SUFFIX_RE`, each also matched with a trailing `-edition`.
const EDITION_WORDS: [&str; 17] = [
    "game-of-the-year",
    "goty",
    "definitive",
    "deluxe",
    "digital-deluxe",
    "complete",
    "ultimate",
    "gold",
    "enhanced",
    "special",
    "anniversary",
    "extended",
    "standard",
    "remastered",
    "remaster",
    "directors-cut",
    "game-of-the-year-goty",
];

/// NFKD, strip the combining diacritics, lowercase.
fn base_transform(title: &str) -> String {
    title
        .nfkd()
        .filter(|c| !('\u{300}'..='\u{36f}').contains(c))
        .collect::<String>()
        .to_lowercase()
}

/// `.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')`: every run of other characters is one hyphen,
/// and no hyphen leads or trails.
fn hyphenate(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut in_run = false;
    for c in text.chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            out.push(c);
            in_run = false;
        } else if !in_run {
            out.push('-');
            in_run = true;
        }
    }
    out.trim_matches('-').to_string()
}

/// Candidate B of the TS: `baseTransform`, then the hyphenation.
fn punctuation_stripped(title: &str) -> String {
    hyphenate(&base_transform(title))
}

/// `key.replace(EDITION_SUFFIX_RE, '')`: the regex is `-(?:<word>)(?:-edition)?$`, so it removes from the
/// leftmost hyphen whose remainder is exactly a vocabulary word, with or without `-edition`.
fn strip_edition_suffix(key: &str) -> String {
    for (at, c) in key.char_indices() {
        if c != '-' {
            continue;
        }
        let rest = &key[at + 1..];
        let word = rest.strip_suffix("-edition").unwrap_or(rest);
        if EDITION_WORDS.contains(&rest) || EDITION_WORDS.contains(&word) {
            return key[..at].to_string();
        }
    }
    key.to_string()
}

/// The shipped matching key (candidate C): punctuation-stripped, then the edition suffix stripped,
/// repeated up to five times so a chained suffix resolves ("-goty-edition"). Output is `[a-z0-9-]*`.
pub fn normalize(title: &str) -> String {
    let mut key = punctuation_stripped(title);
    for _ in 0..MAX_EDITION_STRIP_PASSES {
        let stripped = strip_edition_suffix(&key);
        if stripped == key {
            break;
        }
        key = stripped.trim_end_matches('-').to_string();
    }
    key
}

/// The CodeWeavers URL slug (D-04, D-20): apostrophes (`'`, U+2019, U+2018) are dropped, not
/// hyphenated; numerals are verbatim; any other run of non-alphanumerics is one hyphen. The CrossOver
/// index lookup answers it as `slug`; the wiki's CodeWeavers info (86-20) reads the same function.
pub fn slugify(title: &str) -> String {
    let without_apostrophes: String = title
        .chars()
        .filter(|c| !matches!(c, '\'' | '\u{2019}' | '\u{2018}'))
        .collect();
    punctuation_stripped(&without_apostrophes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apostrophe_variants_unify() {
        assert_eq!(
            normalize("Alekhine's Gun"),
            normalize("Alekhine\u{2019}s Gun")
        );
        assert_eq!(normalize("Alekhine's Gun"), "alekhine-s-gun");
    }

    #[test]
    fn roman_numerals_are_kept_verbatim() {
        assert_eq!(normalize("Quake II"), "quake-ii");
        assert_eq!(normalize("Quake 2"), "quake-2");
        assert_ne!(normalize("Quake II"), normalize("Quake 2"));
    }

    #[test]
    fn edition_suffixes_collapse_onto_the_base_title() {
        assert_eq!(
            normalize("Baldur's Gate 3 (Digital Deluxe Edition)"),
            normalize("Baldur's Gate 3")
        );
        assert_eq!(normalize("Some Game GOTY Edition"), normalize("Some Game"));
        assert_eq!(normalize("Some Game GOTY Edition"), "some-game");
        // A chained suffix resolves over the passes.
        assert_eq!(normalize("Foo Gold Edition Remastered"), "foo");
        assert_eq!(normalize("Foo Game of the Year Edition"), "foo");
        assert_eq!(normalize("Foo Game of the Year GOTY Edition"), "foo");
        // The word alone, with no hyphen before it, is a title, not a suffix.
        assert_eq!(normalize("Gold"), "gold");
        assert_eq!(normalize("Directors Cut"), "directors-cut");
        assert_eq!(normalize("Film Directors Cut"), "film");
    }

    #[test]
    fn a_suffix_word_only_matches_at_the_very_end() {
        assert_eq!(normalize("Gold Rush Anniversary"), "gold-rush");
        assert_eq!(
            normalize("Gold Rush Anniversary Party"),
            "gold-rush-anniversary-party"
        );
        assert_eq!(normalize("The Standard Model"), "the-standard-model");
    }

    #[test]
    fn diacritics_and_compatibility_forms_fold() {
        assert_eq!(normalize("Pok\u{e9}mon"), "pokemon");
        // Full-width letters decompose under NFKD.
        assert_eq!(
            normalize("\u{ff28}\u{ff41}\u{ff44}\u{ff45}\u{ff53}"),
            "hades"
        );
        assert_eq!(normalize("Cafe\u{301}"), "cafe");
    }

    #[test]
    fn output_is_only_lowercase_letters_digits_and_hyphens() {
        let crafted = "Game\u{2122}: Special/Edition\u{2122} <script>&amp;\"quotes\" \u{2019}";
        let key = normalize(crafted);
        assert!(
            key.bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-'),
            "{key}"
        );
        assert!(!key.starts_with('-') && !key.ends_with('-'));
        assert_eq!(normalize(""), "");
        assert_eq!(normalize("!!!"), "");
    }

    // The D-02 verdict, held at compile time: flipping it needs this line to change too.
    const _: () = assert!(NAME_MATCHING_SHIPS);

    // The `slugify` vectors of `codeweavers/__tests__/utils.test.ts`.
    #[test]
    fn slugify_matches_the_ts_vectors() {
        for (title, slug) in [
            ("007 Nightfire", "007-nightfire"),
            ("10,000,000", "10-000-000"),
            ("001 Game Creator", "001-game-creator"),
            ("Hades", "hades"),
            ("Baldur's Gate 3", "baldurs-gate-3"),
            (
                "Marvel's Spider-Man Remastered",
                "marvels-spider-man-remastered",
            ),
            (
                "Call of Duty: Modern Warfare II",
                "call-of-duty-modern-warfare-ii",
            ),
            ("Age of Empires II", "age-of-empires-ii"),
            ("Quake II", "quake-ii"),
            ("Alekhine's Gun", "alekhines-gun"),
            ("Pok\u{e9}mon", "pokemon"),
            ("Baldur\u{2019}s Gate 3", "baldurs-gate-3"),
            ("Baldur\u{2018}s Gate 3", "baldurs-gate-3"),
            ("The Witcher 3: Wild Hunt", "the-witcher-3-wild-hunt"),
            ("Anno 1602 - Konigs Edition", "anno-1602-konigs-edition"),
            ("", ""),
        ] {
            assert_eq!(slugify(title), slug, "{title}");
        }
    }

    #[test]
    fn the_slug_keeps_edition_words_that_the_matching_key_strips() {
        assert_eq!(slugify("Foo Deluxe Edition"), "foo-deluxe-edition");
        assert_eq!(normalize("Foo Deluxe Edition"), "foo");
    }
}
