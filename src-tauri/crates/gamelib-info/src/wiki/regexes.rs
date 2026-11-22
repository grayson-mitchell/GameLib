//! Every wikitext and HowLongToBeat pattern of the TS wiki sources, in one place, with the JavaScript
//! engine's semantics spelled out (Phase 86, Pitfall 4). The Rust `regex` crate reads the same pattern
//! text differently from V8 in four places, and each is made explicit here instead of left to the
//! default:
//!
//! - **`.`** excludes `\n`, `\r`, U+2028 and U+2029 in JS; Rust's excludes only `\n`. Every `.` is the
//!   class [`DOT`].
//! - **`\s`** is the JS `WhiteSpace` and `LineTerminator` set: it includes U+FEFF (BOM) and not U+0085
//!   (NEL), where Rust's `\s` is Unicode `White_Space`, which has U+0085 and not U+FEFF. Every `\s` is
//!   the class [`WS`], and `\S` is its complement.
//! - **`\d`** is `[0-9]` in JS and any Unicode decimal digit in Rust. Every `\d` is `[0-9]`.
//! - **`m`** makes `^` and `$` match at line breaks in JS. No TS pattern here has an anchor except
//!   [`all_digits`] and [`trailing_punctuation`], neither of which carries the flag, so the flag never
//!   appears; the Rust `$` without `(?m)` is the end of the text only, as the JS one is.
//!
//! The `g` flag is not part of a pattern in Rust: a pattern the TS ran with `g` is used through
//! `find_iter` / `captures_iter` / `replace_all` by its caller. The leftmost-first match semantics of the
//! `regex` crate are the same a backtracking engine gives, so lazy and greedy quantifiers capture the
//! same text. A pattern with an unescaped `.` the TS meant literally (`howlongtobeat.com` in the GOG link
//! pattern) keeps its `.` as [`DOT`], not as an escaped dot, because that is what the TS matched.
//!
//! `tests/regex_vectors.rs` proves each pattern against the match the TS engine produced, recorded by
//! running the TS pattern in node over LF, CRLF, U+2028, BOM and NEL inputs.

use std::sync::OnceLock;

use regex::Regex;

/// JS `.` (without the `s` flag): anything but the four line terminators.
pub const DOT: &str = r"[^\n\r\u{2028}\u{2029}]";

/// JS `\s`: `WhiteSpace` (tab, VT, FF, space, NBSP, U+1680, U+2000 to U+200A, U+202F, U+205F, U+3000,
/// BOM) and `LineTerminator` (LF, CR, U+2028, U+2029). The members, for a class body.
pub const WS: &str = r"\t\n\u{B}\u{C}\r \u{A0}\u{1680}\u{2000}-\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}\u{FEFF}";

/// A compiled pattern named for its owner: `name` is the vector key in `regex_vectors.rs`.
pub struct Named {
    pub name: &'static str,
    pub regex: &'static Regex,
}

fn build(source: impl AsRef<str>) -> Regex {
    // The sources are literals of this file: a failure is a typo that the vector test run catches.
    match Regex::new(source.as_ref()) {
        Ok(regex) => regex,
        Err(error) => panic!("wiki pattern does not compile: {error}"),
    }
}

macro_rules! pattern {
    ($(#[$doc:meta])* $name:ident, $source:expr) => {
        $(#[$doc])*
        pub fn $name() -> &'static Regex {
            static CELL: OnceLock<Regex> = OnceLock::new();
            CELL.get_or_init(|| build($source))
        }
    };
}

// ---- PCGamingWiki (`pcgamingwiki/constants.ts`) ----

pattern!(
    /// `/game\/row\/reception\|Metacritic\|(\S+)\|([0-9]+)/m`: group 1 the page id, group 2 the score.
    metacritic,
    format!(r"game/row/reception\|Metacritic\|([^{WS}]+)\|([0-9]+)")
);
pattern!(
    /// `/game\/row\/reception\|OpenCritic\|(\S+)\|([0-9]+)/m`.
    opencritic,
    format!(r"game/row/reception\|OpenCritic\|([^{WS}]+)\|([0-9]+)")
);
pattern!(
    /// `/game\/row\/reception\|IGDB\|(\S+)\|([0-9]+)/m` (the TS constant is spelled `idgbRegEx`).
    igdb,
    format!(r"game/row/reception\|IGDB\|([^{WS}]+)\|([0-9]+)")
);
pattern!(
    /// `/steam appid {2}= ([0-9]+)/m`.
    steam_id,
    r"steam appid {2}= ([0-9]+)"
);
pattern!(
    /// `/hltb {9}= ([0-9]+)/m`.
    hltb_id,
    r"hltb {9}= ([0-9]+)"
);
pattern!(
    /// `/direct3d versions {6}= (.+)/m`.
    direct3d_versions,
    format!(r"direct3d versions {{6}}= ({DOT}+)")
);
pattern!(
    /// `/game\/row\/taxonomy\/genres\s*\|\s*(.*?)\s*}}/`.
    genres,
    format!(r"game/row/taxonomy/genres[{WS}]*\|[{WS}]*({DOT}*?)[{WS}]*\}}\}}")
);
pattern!(
    /// `/game\/row\/date\|([^|]+)\|([^}]*)/g`: used with `captures_iter`.
    release_date,
    r"game/row/date\|([^|]+)\|([^}]*)"
);

// ---- AppleGamingWiki (`applegamingwiki/constants.ts`) ----

pattern!(
    /// `/codeweavers {2}= (\S+)/m`.
    crossover_link,
    format!(r"codeweavers {{2}}= ([^{WS}]+)")
);
pattern!(
    /// `/\|crossover {12}= (\S+)/m`.
    crossover_rating,
    format!(r"\|crossover {{12}}= ([^{WS}]+)")
);
pattern!(
    /// `/\|wine {17}= (\S+)/m`.
    wine_rating,
    format!(r"\|wine {{17}}= ([^{WS}]+)")
);

// ---- HowLongToBeat (`howlongtobeat/utils.ts`, `titleMatch.ts`) ----

pattern!(
    /// `/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/`. `[\s\S]` is any
    /// character at all, which is `(?s:.)` here.
    next_data,
    r#"<script id="__NEXT_DATA__" type="application/json">((?s:.)*?)</script>"#
);
pattern!(
    /// The GOG store page's `Main` time: `/<span class="howlongtobeat-box__time"> ?([\d.]+) h ?<\/span><span class="howlongtobeat-box__name">Main<\/span>/`.
    gog_main,
    r#"<span class="howlongtobeat-box__time"> ?([0-9.]+) h ?</span><span class="howlongtobeat-box__name">Main</span>"#
);
pattern!(
    /// The `Main + Sides` time (`Main \+ Sides` in the TS pattern: a literal plus sign).
    gog_main_sides,
    r#"<span class="howlongtobeat-box__time"> ?([0-9.]+) h ?</span><span class="howlongtobeat-box__name">Main \+ Sides</span>"#
);
pattern!(
    /// The `Completionist` time.
    gog_completionist,
    r#"<span class="howlongtobeat-box__time"> ?([0-9.]+) h ?</span><span class="howlongtobeat-box__name">Completionist</span>"#
);
pattern!(
    /// `/<a target="_blank" href="https:\/\/howlongtobeat.com\/game\/(\d+)">HowLongToBeat<\/a>/`; the
    /// dot in `howlongtobeat.com` is unescaped in the TS, so it is [`DOT`].
    gog_hltb_id,
    format!(
        r#"<a target="_blank" href="https://howlongtobeat{DOT}com/game/([0-9]+)">HowLongToBeat</a>"#
    )
);
pattern!(
    /// `/[̀-ͯ]/g`: the combining diacritical marks `normalizeTitle` strips after NFKD.
    combining_marks,
    r"[\u{300}-\u{36F}]"
);
pattern!(
    /// `/&/g`.
    ampersand,
    "&"
);
pattern!(
    /// `/[^a-z0-9]+/g`.
    non_alphanumeric_run,
    "[^a-z0-9]+"
);
pattern!(
    /// `/^\d+$/` (no `m` flag): the whole text is digits.
    all_digits,
    r"\A[0-9]+\z"
);
pattern!(
    /// `/[™®©℠]/g`: the trademark glyphs `toSearchTerms` blanks.
    trademark_glyphs,
    "[\u{2122}\u{AE}\u{A9}\u{2120}]"
);
pattern!(
    /// `/\s+/`, the separator `toSearchTerms` splits on.
    whitespace_run,
    format!("[{WS}]+")
);
pattern!(
    /// `/[:,.;!?-]+$/` (no `m` flag): the trailing punctuation of one search term.
    trailing_punctuation,
    r"[:,.;!?\-]+\z"
);

/// Every pattern above, in the order of this file, for the vector test to prove one by one.
pub fn all() -> Vec<Named> {
    let list: [(&'static str, &'static Regex); 20] = [
        ("metacritic", metacritic()),
        ("opencritic", opencritic()),
        ("igdb", igdb()),
        ("steam_id", steam_id()),
        ("hltb_id", hltb_id()),
        ("direct3d_versions", direct3d_versions()),
        ("genres", genres()),
        ("release_date", release_date()),
        ("crossover_link", crossover_link()),
        ("crossover_rating", crossover_rating()),
        ("wine_rating", wine_rating()),
        ("next_data", next_data()),
        ("gog_main", gog_main()),
        ("gog_main_sides", gog_main_sides()),
        ("gog_completionist", gog_completionist()),
        ("gog_hltb_id", gog_hltb_id()),
        ("combining_marks", combining_marks()),
        ("ampersand", ampersand()),
        ("non_alphanumeric_run", non_alphanumeric_run()),
        ("all_digits", all_digits()),
    ];
    let rest: [(&'static str, &'static Regex); 3] = [
        ("trademark_glyphs", trademark_glyphs()),
        ("whitespace_run", whitespace_run()),
        ("trailing_punctuation", trailing_punctuation()),
    ];
    list.into_iter()
        .chain(rest)
        .map(|(name, regex)| Named { name, regex })
        .collect()
}
