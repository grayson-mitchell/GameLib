//! The fuzzy title match behind the Humble ownership dedup, ported from
//! `src/common/matching/titleMatch.ts` (Phase 94, D-06, Pitfall 7).
//!
//! The match lives twice: the TypeScript module stays for the renderer (`RedeemSteamKeyDialog`, the
//! store-search badges), and this copy serves the Rust dedup. One vector file,
//! `src/common/matching/__tests__/fixtures/titleMatchVectors.json`, is replayed by BOTH (the TS test
//! beside it and this module's tests), so the copies cannot drift.
//!
//! Where JavaScript semantics matter they are spelled out:
//!
//! - `normalizeTitle` keeps only `[a-z0-9]` and whitespace, so every other character, an accented
//!   letter, a CJK title, an emoji, becomes a separator and the result is ASCII. That is what makes
//!   the Levenshtein distance below the same over bytes as `fastest-levenshtein` computes over UTF-16
//!   code units (Pitfall 7).
//! - The two guards compare the RAW titles' lengths in UTF-16 code units (`String.length`), not
//!   bytes or chars.
//! - The ratio is `1.0 - d as f64 / max_len as f64` compared with `>=`: three vectors sit at exactly
//!   0.85 (`1 - 3/20`, `1 - 6/40`, `1 - 9/60` in f64) and all match.
//! - The keyword lists are fixed, developer-controlled literals (T-12-01): no pattern is built from
//!   a title, and the lists are matched with plain substring tests.

/// The match threshold, locked at 85% (HDEDUP-01 success criterion 3): DLC titles false-positive
/// match base games at lower thresholds.
pub const HUMBLE_FUZZY_MATCH_THRESHOLD: f64 = 0.85;

/// Suffixes stripped by [`normalize_title`], in the order the TypeScript strips them, each on a word
/// boundary. They are the SAME base game, so they must keep matching.
const EDITION_SUFFIXES: [&str; 11] = [
    "game of the year edition",
    "goty edition",
    "goty",
    "definitive edition",
    "enhanced edition",
    "anniversary edition",
    "complete edition",
    "ultimate edition",
    "deluxe edition",
    "standard edition",
    "collection",
];

/// A DLC or expansion is a different product from its base game.
const DLC_KEYWORDS: [&str; 9] = [
    "dlc",
    "season pass",
    "expansion",
    "soundtrack",
    "artbook",
    "art book",
    "content pack",
    "bonus content",
    "upgrade pack",
];

/// A remaster or remake is a different product from the original (quick 260715-a7g); `remaster`
/// covers `remastered` by substring.
const PRODUCT_VARIANT_KEYWORDS: [&str; 2] = ["remaster", "remake"];

/// A JavaScript regex `\w` character in the ASCII-only sense `\b` uses without the `u` flag.
fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

/// `text.replace(/\([^)]*\)/g, ' ')`: a `(`, anything but `)`, then `)`. A `(` with no `)` after it
/// stays, and so does every later `(` (none of them has a `)` after it either).
fn replace_parentheticals(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(open) = rest.find('(') {
        let Some(close) = rest[open..].find(')') else {
            break;
        };
        out.push_str(&rest[..open]);
        out.push(' ');
        rest = &rest[open + close + 1..];
    }
    out.push_str(rest);
    out
}

/// `text.replace(new RegExp('\\b' + suffix + '\\b', 'g'), '')` for an ASCII `suffix` that starts and
/// ends with a letter: every non-overlapping occurrence, left to right, with a non-word character (or
/// the string's end) on both sides.
fn remove_word(text: &str, suffix: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let needle: Vec<char> = suffix.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    while i < chars.len() {
        let end = i + needle.len();
        let hit = end <= chars.len()
            && chars[i..end] == needle[..]
            && (i == 0 || !is_word(chars[i - 1]))
            && (end == chars.len() || !is_word(chars[end]));
        if hit {
            i = end;
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

/// Lower case, trademark symbols out, parenthetical qualifiers (`(Steam)`) out, edition suffixes out,
/// everything but `[a-z0-9]` a single space, the ends trimmed.
///
/// The parenthetical strip is required by the documented must-match fixture "Into the Breach" vs
/// "Into The Breach (Steam)": the trailing qualifier alone drops the ratio to about 0.71.
pub fn normalize_title(title: &str) -> String {
    let lowered: String = title
        .to_lowercase()
        .chars()
        .filter(|c| !matches!(c, '\u{2122}' | '\u{ae}' | '\u{a9}'))
        .collect();
    let mut text = replace_parentheticals(&lowered);
    for suffix in EDITION_SUFFIXES {
        text = remove_word(&text, suffix);
    }
    // `[^a-z0-9\s]` -> ' ', `\s+` -> ' ', `trim()`: any run of anything but a-z and 0-9 is one space.
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            out.push(c);
        } else if !out.is_empty() && !out.ends_with(' ') {
            out.push(' ');
        }
    }
    if out.ends_with(' ') {
        out.pop();
    }
    out
}

/// The Levenshtein distance (insert, delete, substitute, each 1) between two byte strings.
fn distance(a: &[u8], b: &[u8]) -> usize {
    let mut previous: Vec<usize> = (0..=b.len()).collect();
    let mut current = vec![0; b.len() + 1];
    for (i, x) in a.iter().enumerate() {
        current[0] = i + 1;
        for (j, y) in b.iter().enumerate() {
            let substitute = previous[j] + usize::from(x != y);
            current[j + 1] = substitute.min(previous[j + 1] + 1).min(current[j] + 1);
        }
        std::mem::swap(&mut previous, &mut current);
    }
    previous[b.len()]
}

/// Length-sensitive similarity: `1 - distance / maxLen` over the normalised titles, `0` when either is
/// empty after normalising. A base-game and DLC pair differs substantially in length, so this ratio
/// penalises the containment relationship token-set algorithms reward.
pub fn title_similarity(a: &str, b: &str) -> f64 {
    let (na, nb) = (normalize_title(a), normalize_title(b));
    if na.is_empty() || nb.is_empty() {
        return 0.0;
    }
    let max_len = na.len().max(nb.len());
    1.0 - distance(na.as_bytes(), nb.as_bytes()) as f64 / max_len as f64
}

/// `[shorter, longer]` by `String.length` (UTF-16 code units), the first on a tie.
fn shorter_longer<'a>(a: &'a str, b: &'a str) -> (&'a str, &'a str) {
    if a.encode_utf16().count() <= b.encode_utf16().count() {
        (a, b)
    } else {
        (b, a)
    }
}

/// Whether the raw longer title carries one of `keywords` the shorter lacks.
fn longer_only_carries(a: &str, b: &str, keywords: &[&str]) -> bool {
    let (shorter, longer) = shorter_longer(a, b);
    let (longer, shorter) = (longer.to_lowercase(), shorter.to_lowercase());
    keywords
        .iter()
        .any(|kw| longer.contains(kw) && !shorter.contains(kw))
}

/// Defence in depth beside the ratio: if the raw longer title carries a DLC or expansion keyword the
/// shorter lacks, never a match, whatever the score.
pub fn is_dlc_false_positive_risk(a: &str, b: &str) -> bool {
    longer_only_carries(a, b, &DLC_KEYWORDS)
}

/// The same guard for a remaster or remake: a distinct product from the original release. An exact
/// remaster title against itself (both carry the keyword) is unaffected.
pub fn is_remaster_false_positive_risk(a: &str, b: &str) -> bool {
    longer_only_carries(a, b, &PRODUCT_VARIANT_KEYWORDS)
}

/// Whether two titles name the same game: neither guard trips and the similarity is at least
/// [`HUMBLE_FUZZY_MATCH_THRESHOLD`].
pub fn fuzzy_match(humble_title: &str, steam_title: &str) -> bool {
    if is_dlc_false_positive_risk(humble_title, steam_title)
        || is_remaster_false_positive_risk(humble_title, steam_title)
    {
        return false;
    }
    title_similarity(humble_title, steam_title) >= HUMBLE_FUZZY_MATCH_THRESHOLD
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    /// The vector file both languages replay (`titleMatchVectors.test.ts` reads the same path).
    const VECTORS: &str =
        include_str!("../../../../src/common/matching/__tests__/fixtures/titleMatchVectors.json");

    /// The floor the TypeScript test carries too, so lowering the file alone cannot weaken either.
    const VECTOR_FLOOR: usize = 60;

    #[derive(Deserialize)]
    struct Vector {
        a: String,
        b: String,
        #[serde(rename = "normalizedA")]
        normalized_a: String,
        #[serde(rename = "normalizedB")]
        normalized_b: String,
        similarity: f64,
        #[serde(rename = "fuzzyMatch")]
        fuzzy_match: bool,
    }

    fn vectors() -> Vec<Vector> {
        serde_json::from_str(VECTORS).expect("the shared vectors parse")
    }

    #[test]
    fn every_shared_vector_is_reproduced() {
        let vectors = vectors();
        assert!(
            vectors.len() >= VECTOR_FLOOR,
            "the shared file holds {} vectors, the floor is {VECTOR_FLOOR}",
            vectors.len()
        );
        let mut failures = Vec::new();
        for v in &vectors {
            let got = (
                normalize_title(&v.a),
                normalize_title(&v.b),
                title_similarity(&v.a, &v.b),
                fuzzy_match(&v.a, &v.b),
            );
            let want = (
                v.normalized_a.clone(),
                v.normalized_b.clone(),
                v.similarity,
                v.fuzzy_match,
            );
            if got != want {
                failures.push(format!(
                    "{:?} vs {:?}: got {got:?}, vector {want:?}",
                    v.a, v.b
                ));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// The file is not a trivial one: matches and non-matches, non-ASCII input, and pairs exactly at
    /// the threshold (the `>=` boundary), below it and above it.
    #[test]
    fn the_shared_vectors_cover_what_the_port_must_get_right() {
        let vectors = vectors();
        let matches = vectors.iter().filter(|v| v.fuzzy_match).count();
        assert!(matches >= 20 && vectors.len() - matches >= 20);
        assert!(vectors.iter().any(|v| !v.a.is_ascii() || !v.b.is_ascii()));
        let at_threshold: Vec<&Vector> = vectors
            .iter()
            .filter(|v| v.similarity == HUMBLE_FUZZY_MATCH_THRESHOLD)
            .collect();
        assert!(at_threshold.len() >= 3, "pairs exactly at 0.85");
        assert!(at_threshold.iter().all(|v| v.fuzzy_match), "0.85 matches");
        assert!(vectors
            .iter()
            .any(|v| v.similarity < HUMBLE_FUZZY_MATCH_THRESHOLD && v.similarity > 0.8));
        assert!(vectors
            .iter()
            .any(|v| v.similarity > HUMBLE_FUZZY_MATCH_THRESHOLD && v.similarity < 0.9));
        assert!(vectors.iter().any(|v| v.similarity == 0.0));
    }

    /// The replay discriminates: a strict `>` flips every vector at exactly 0.85, and a comparison
    /// done over `char` counts instead of UTF-16 units would disagree with the guards' tie-break on
    /// an astral title. So the vectors, not the code's own tests, pin both.
    #[test]
    fn the_replay_discriminates_a_strict_threshold() {
        let flipped = vectors()
            .iter()
            .filter(|v| {
                let strict = !is_dlc_false_positive_risk(&v.a, &v.b)
                    && !is_remaster_false_positive_risk(&v.a, &v.b)
                    && title_similarity(&v.a, &v.b) > HUMBLE_FUZZY_MATCH_THRESHOLD;
                strict != v.fuzzy_match
            })
            .count();
        assert!(flipped >= 3, "only {flipped} vectors pin the >= comparison");
    }

    #[test]
    fn the_distance_is_levenshtein() {
        assert_eq!(distance(b"", b""), 0);
        assert_eq!(distance(b"abc", b""), 3);
        assert_eq!(distance(b"", b"abc"), 3);
        assert_eq!(distance(b"kitten", b"sitting"), 3);
        assert_eq!(distance(b"flaw", b"lawn"), 2);
        assert_eq!(distance(b"same", b"same"), 0);
    }

    #[test]
    fn normalising_strips_parentheticals_editions_symbols_and_non_ascii() {
        for (title, want) in [
            ("FRAMED Collection\u{2122}", "framed"),
            ("Assault Android Cactus+", "assault android cactus"),
            ("Skyrim: Game of the Year Edition", "skyrim"),
            ("Into The Breach (Steam)", "into the breach"),
            ("Unbalanced (paren", "unbalanced paren"),
            ("(a) (b) c", "c"),
            // Not on a word boundary: nothing stripped.
            ("Collections", "collections"),
            ("megoty", "megoty"),
            ("goty goty", ""),
            // An accented letter and a CJK title become separators.
            ("Pok\u{e9}mon Caf\u{e9}", "pok mon caf"),
            ("\u{65e5}\u{672c}\u{8a9e}", ""),
            ("  Spaced   Out  ", "spaced out"),
            ("", ""),
        ] {
            assert_eq!(normalize_title(title), want, "{title:?}");
        }
    }

    /// `String.length` counts UTF-16 units: two emoji are length 4 (two chars), so against "dlc"
    /// (length 3) the emoji title is the LONGER one and carries no keyword. A char count would call it
    /// the shorter, and the guard would trip. The expected values were taken from the TypeScript.
    #[test]
    fn the_guards_measure_length_in_utf16_units() {
        assert!(!is_dlc_false_positive_risk("\u{1f600}\u{1f600}", "dlc"));
        assert!(!is_dlc_false_positive_risk("dlc", "\u{1f600}\u{1f600}"));
    }

    /// On a length tie the FIRST argument is the shorter one, so the guard is not symmetric there.
    #[test]
    fn a_length_tie_keeps_the_first_argument_as_the_shorter() {
        assert!(is_dlc_false_positive_risk("abc", "dlc"));
        assert!(!is_dlc_false_positive_risk("dlc", "abc"));
    }
}
