//! A subset of ICU root collation, for the one place TS used `String.prototype.localeCompare`: the
//! tie-break between two deals at the same price (`a.storeName.localeCompare(b.storeName)`).
//!
//! ICU compares whole strings level by level. First the base characters only (case and accents
//! ignored), then, if those are equal, the accents, then the case (lower case first). A space sorts
//! before punctuation, punctuation before digits and digits before letters. This reproduces that for
//! ASCII text and the Latin-1 and Latin Extended-A letters; any other character sorts after the
//! Latin letters by code point, which is NOT what ICU does for other scripts or for non-ASCII
//! punctuation. ICU itself is not added (D-03): the divergence is recorded in the
//! `2026-11-22-itad-deal-order-localecompare-subset` todo. Shop names ITAD returns are Latin text
//! (the 86-07 recordings hold no other), and no fixture orders differently.

use std::cmp::Ordering;

use super::cache::is_js_space;

/// ASCII punctuation and symbols in ICU's order (CLDR root: `_ - , ; : ! ? . ' " ( ) [ ] { } @ * / \
/// & # % ` ^ + < = > | ~ $`).
const PUNCTUATION: &str = "_-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$";

const SPACE_BASE: u32 = 1;
const PUNCT_BASE: u32 = 100;
const DIGIT_BASE: u32 = 200;
const LETTER_BASE: u32 = 300;
const OTHER_BASE: u32 = 10_000;

// Secondary weights, in the DUCET order of the combining marks.
const ACUTE: u8 = 1;
const GRAVE: u8 = 2;
const BREVE: u8 = 3;
const CIRC: u8 = 4;
const CARON: u8 = 5;
const RING: u8 = 6;
const DIAER: u8 = 7;
const DACUTE: u8 = 8;
const TILDE: u8 = 9;
const DOT: u8 = 10;
const STROKE: u8 = 11;
const CEDILLA: u8 = 12;
const OGONEK: u8 = 13;
const MACRON: u8 = 14;

/// Lower-case accented Latin letters: the character, its base letter, its accent.
const ACCENTED: &[(char, char, u8)] = &[
    ('á', 'a', ACUTE),
    ('à', 'a', GRAVE),
    ('ă', 'a', BREVE),
    ('â', 'a', CIRC),
    ('ǎ', 'a', CARON),
    ('å', 'a', RING),
    ('ä', 'a', DIAER),
    ('ã', 'a', TILDE),
    ('ȧ', 'a', DOT),
    ('ą', 'a', OGONEK),
    ('ā', 'a', MACRON),
    ('ć', 'c', ACUTE),
    ('ĉ', 'c', CIRC),
    ('č', 'c', CARON),
    ('ċ', 'c', DOT),
    ('ç', 'c', CEDILLA),
    ('ď', 'd', CARON),
    ('đ', 'd', STROKE),
    ('é', 'e', ACUTE),
    ('è', 'e', GRAVE),
    ('ĕ', 'e', BREVE),
    ('ê', 'e', CIRC),
    ('ě', 'e', CARON),
    ('ë', 'e', DIAER),
    ('ė', 'e', DOT),
    ('ę', 'e', OGONEK),
    ('ē', 'e', MACRON),
    ('ĝ', 'g', CIRC),
    ('ğ', 'g', BREVE),
    ('ġ', 'g', DOT),
    ('ģ', 'g', CEDILLA),
    ('ĥ', 'h', CIRC),
    ('ħ', 'h', STROKE),
    ('í', 'i', ACUTE),
    ('ì', 'i', GRAVE),
    ('ĭ', 'i', BREVE),
    ('î', 'i', CIRC),
    ('ï', 'i', DIAER),
    ('ĩ', 'i', TILDE),
    ('į', 'i', OGONEK),
    ('ī', 'i', MACRON),
    ('ĵ', 'j', CIRC),
    ('ķ', 'k', CEDILLA),
    ('ĺ', 'l', ACUTE),
    ('ľ', 'l', CARON),
    ('ł', 'l', STROKE),
    ('ļ', 'l', CEDILLA),
    ('ń', 'n', ACUTE),
    ('ň', 'n', CARON),
    ('ñ', 'n', TILDE),
    ('ņ', 'n', CEDILLA),
    ('ó', 'o', ACUTE),
    ('ò', 'o', GRAVE),
    ('ŏ', 'o', BREVE),
    ('ô', 'o', CIRC),
    ('ö', 'o', DIAER),
    ('ő', 'o', DACUTE),
    ('õ', 'o', TILDE),
    ('ø', 'o', STROKE),
    ('ǫ', 'o', OGONEK),
    ('ō', 'o', MACRON),
    ('ŕ', 'r', ACUTE),
    ('ř', 'r', CARON),
    ('ŗ', 'r', CEDILLA),
    ('ś', 's', ACUTE),
    ('ŝ', 's', CIRC),
    ('š', 's', CARON),
    ('ş', 's', CEDILLA),
    ('ť', 't', CARON),
    ('ţ', 't', CEDILLA),
    ('ŧ', 't', STROKE),
    ('ú', 'u', ACUTE),
    ('ù', 'u', GRAVE),
    ('ŭ', 'u', BREVE),
    ('û', 'u', CIRC),
    ('ů', 'u', RING),
    ('ü', 'u', DIAER),
    ('ű', 'u', DACUTE),
    ('ũ', 'u', TILDE),
    ('ų', 'u', OGONEK),
    ('ū', 'u', MACRON),
    ('ŵ', 'w', CIRC),
    ('ý', 'y', ACUTE),
    ('ŷ', 'y', CIRC),
    ('ÿ', 'y', DIAER),
    ('ź', 'z', ACUTE),
    ('ž', 'z', CARON),
    ('ż', 'z', DOT),
];

/// Ligatures that expand to two base letters.
const EXPANSIONS: &[(char, &str)] = &[('æ', "ae"), ('œ', "oe"), ('ß', "ss")];

/// One collation element: primary (base character), secondary (accent), tertiary (case).
type Element = (u32, u8, u8);

fn push_char(c: char, out: &mut Vec<Element>) {
    let upper = c.is_uppercase();
    let case = u8::from(upper);
    let mut lowered = c.to_lowercase();
    let lower = match (lowered.next(), lowered.next()) {
        (Some(only), None) => only,
        _ => c,
    };
    if let Some((_, letters)) = EXPANSIONS.iter().find(|(ch, _)| *ch == lower) {
        // A ligature sorts as its letters, with a tertiary difference from the plain pair.
        for letter in letters.chars() {
            out.push((LETTER_BASE + (letter as u32 - 'a' as u32), 0, 2 + case));
        }
        return;
    }
    if let Some((_, base, accent)) = ACCENTED.iter().find(|(ch, _, _)| *ch == lower) {
        out.push((LETTER_BASE + (*base as u32 - 'a' as u32), *accent, case));
        return;
    }
    let primary = if lower.is_ascii_lowercase() {
        LETTER_BASE + (lower as u32 - 'a' as u32)
    } else if lower.is_ascii_digit() {
        DIGIT_BASE + (lower as u32 - '0' as u32)
    } else if is_js_space(lower) {
        SPACE_BASE
    } else if let Some(at) = PUNCTUATION.find(lower) {
        PUNCT_BASE + at as u32
    } else {
        OTHER_BASE + lower as u32
    };
    out.push((primary, 0, case));
}

fn elements(text: &str) -> Vec<Element> {
    let mut out = Vec::with_capacity(text.len());
    for c in text.chars() {
        push_char(c, &mut out);
    }
    out
}

/// `a.localeCompare(b)` for the subset described in the module comment: the base characters of the
/// whole strings first, then the accents, then the case (lower before upper). `Equal` when all three
/// agree, as `localeCompare` answers 0, so a stable sort keeps the input order.
pub fn locale_compare(a: &str, b: &str) -> Ordering {
    let (ka, kb) = (elements(a), elements(b));
    let level = |pick: fn(&Element) -> u32| ka.iter().map(pick).cmp(kb.iter().map(pick));
    level(|e| e.0)
        .then_with(|| level(|e| u32::from(e.1)))
        .then_with(|| level(|e| u32::from(e.2)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sorted(names: &[&str]) -> Vec<String> {
        let mut v: Vec<String> = names.iter().map(|s| (*s).to_string()).collect();
        v.sort_by(|a, b| locale_compare(a, b));
        v
    }

    #[test]
    fn the_golden_equal_price_order_alpha_epic_zebra() {
        // The 86-07 fixture, in the order ICU produced: lower before upper before accented...
        assert_eq!(
            sorted(&["zebra", "Álpha", "alpha", "Beta", "Alpha", "épic", "epic"]),
            vec!["alpha", "Alpha", "Álpha", "Beta", "epic", "épic", "zebra"]
        );
    }

    #[test]
    fn base_letters_decide_before_accents_and_accents_before_case() {
        // "Álpha" has a different accent but "alpha" differs only by case: the accent loses to base,
        // and accent beats case at the same base.
        assert_eq!(locale_compare("Alpha", "Álpha"), Ordering::Less);
        assert_eq!(locale_compare("alpha", "Alpha"), Ordering::Less);
        assert_eq!(locale_compare("Álpha", "alpha"), Ordering::Greater);
        assert_eq!(locale_compare("Épic", "Fanatical"), Ordering::Less);
        assert_eq!(locale_compare("Épic", "epic"), Ordering::Greater);
        assert_eq!(locale_compare("epic", "Fanatical"), Ordering::Less);
        assert_eq!(locale_compare("épic", "Fanatical"), Ordering::Less);
    }

    #[test]
    fn spaces_before_punctuation_before_digits_before_letters() {
        assert_eq!(locale_compare("a b", "a-b"), Ordering::Less);
        assert_eq!(locale_compare("a-b", "a1"), Ordering::Less);
        assert_eq!(locale_compare("a1", "ab"), Ordering::Less);
        assert_eq!(
            locale_compare("GamesPlanet UK", "GamesPlanet US"),
            Ordering::Less
        );
        assert_eq!(
            locale_compare("GamesPlanet", "GamesPlanet UK"),
            Ordering::Less
        );
        assert_eq!(locale_compare("Steam", "steam"), Ordering::Greater);
    }

    #[test]
    fn equal_strings_and_ligatures() {
        assert_eq!(locale_compare("Steam", "Steam"), Ordering::Equal);
        assert_eq!(locale_compare("", ""), Ordering::Equal);
        assert_eq!(locale_compare("", "a"), Ordering::Less);
        assert_eq!(locale_compare("straße", "strasse"), Ordering::Greater);
        assert_eq!(locale_compare("strasse", "straße"), Ordering::Less);
        assert_eq!(locale_compare("æon", "aeon"), Ordering::Greater);
        assert_eq!(locale_compare("æon", "afon"), Ordering::Less);
    }

    #[test]
    fn a_character_outside_the_subset_sorts_after_the_latin_letters() {
        assert_eq!(locale_compare("zebra", "日本"), Ordering::Less);
    }
}
