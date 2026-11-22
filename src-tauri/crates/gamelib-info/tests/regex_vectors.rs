//! The wiki and HowLongToBeat patterns against the JavaScript engine (86-20, Pitfall 4). Each pattern of
//! `wiki::regexes` is run over inputs that separate the two engines (LF, CRLF, a lone CR, U+2028, U+2029,
//! a BOM, NEL, NBSP, a non-ASCII digit, an astral character) and must produce the match, the captures
//! and the list of every match that V8 produced for the TS pattern. The expected values below were
//! recorded once by running the TS patterns (extracted from `wiki_game_info/**`, so a drifted copy would
//! have failed the extraction) in node 22; nothing here runs node.
//!
//! The three character classes the patterns are built from are also proven against the JS definition over
//! every UTF-16 code unit.

use gamelib_info::wiki::regexes::{self, DOT, WS};
use regex::Regex;

/// One recorded run: `first` is `exec` without the `g` flag (the whole match, then each group), `all`
/// is every match of the `g`-flagged pattern (`matchAll`).
struct Vector {
    pattern: &'static str,
    input: &'static str,
    first: Option<&'static [&'static str]>,
    all: &'static [&'static [&'static str]],
}

/// The patterns of the TS wiki sources: eight in PCGamingWiki, three in AppleGamingWiki, five in
/// HowLongToBeat's page scrape and seven in its title matching.
const PATTERN_COUNT: usize = 23;

// GENERATED ONCE from the TS patterns run in node 22 (86-20); the expected matches below are what V8 produced.
const VECTORS: &[Vector] = &[
    Vector { pattern: "metacritic", input: "{{Infobox game/row/reception|Metacritic|elden-ring|96}}\u{a}", first: Some(&["game/row/reception|Metacritic|elden-ring|96", "elden-ring", "96"]), all: &[&["game/row/reception|Metacritic|elden-ring|96", "elden-ring", "96"]] },
    Vector { pattern: "metacritic", input: "|Metacritic text\u{d}\u{a}{{Infobox game/row/reception|Metacritic|elden-ring|96}}\u{d}\u{a}", first: Some(&["game/row/reception|Metacritic|elden-ring|96", "elden-ring", "96"]), all: &[&["game/row/reception|Metacritic|elden-ring|96", "elden-ring", "96"]] },
    Vector { pattern: "metacritic", input: "{{Infobox game/row/reception|Metacritic|id\u{2028}|96}}", first: None, all: &[] },
    Vector { pattern: "metacritic", input: "{{Infobox game/row/reception|Metacritic|id\u{feff}|96}}", first: None, all: &[] },
    Vector { pattern: "metacritic", input: "{{Infobox game/row/reception|Metacritic|id\u{85}x|96}}", first: Some(&["game/row/reception|Metacritic|id\u{85}x|96", "id\u{85}x", "96"]), all: &[&["game/row/reception|Metacritic|id\u{85}x|96", "id\u{85}x", "96"]] },
    Vector { pattern: "metacritic", input: "{{Infobox game/row/reception|Metacritic|id\u{a0}|96}}", first: None, all: &[] },
    Vector { pattern: "metacritic", input: "{{Infobox game/row/reception|Metacritic|18502/elden-ring-nightreign|80}}", first: Some(&["game/row/reception|Metacritic|18502/elden-ring-nightreign|80", "18502/elden-ring-nightreign", "80"]), all: &[&["game/row/reception|Metacritic|18502/elden-ring-nightreign|80", "18502/elden-ring-nightreign", "80"]] },
    Vector { pattern: "metacritic", input: "{{Infobox game/row/reception|Metacritic|a|b|7}}", first: Some(&["game/row/reception|Metacritic|a|b|7", "a|b", "7"]), all: &[&["game/row/reception|Metacritic|a|b|7", "a|b", "7"]] },
    Vector { pattern: "metacritic", input: "{{Infobox game/row/reception|Metacritic||5}}", first: None, all: &[] },
    Vector { pattern: "metacritic", input: "{{Infobox game/row/reception|Metacritic|id|x}}", first: None, all: &[] },
    Vector { pattern: "metacritic", input: "{{Infobox game/row/reception|Metacritic|one|1}}\u{a}{{Infobox game/row/reception|Metacritic|two|2}}", first: Some(&["game/row/reception|Metacritic|one|1", "one", "1"]), all: &[&["game/row/reception|Metacritic|one|1", "one", "1"], &["game/row/reception|Metacritic|two|2", "two", "2"]] },
    Vector { pattern: "opencritic", input: "{{Infobox game/row/reception|OpenCritic|elden-ring|96}}\u{a}", first: Some(&["game/row/reception|OpenCritic|elden-ring|96", "elden-ring", "96"]), all: &[&["game/row/reception|OpenCritic|elden-ring|96", "elden-ring", "96"]] },
    Vector { pattern: "opencritic", input: "|OpenCritic text\u{d}\u{a}{{Infobox game/row/reception|OpenCritic|elden-ring|96}}\u{d}\u{a}", first: Some(&["game/row/reception|OpenCritic|elden-ring|96", "elden-ring", "96"]), all: &[&["game/row/reception|OpenCritic|elden-ring|96", "elden-ring", "96"]] },
    Vector { pattern: "opencritic", input: "{{Infobox game/row/reception|OpenCritic|id\u{2028}|96}}", first: None, all: &[] },
    Vector { pattern: "opencritic", input: "{{Infobox game/row/reception|OpenCritic|id\u{feff}|96}}", first: None, all: &[] },
    Vector { pattern: "opencritic", input: "{{Infobox game/row/reception|OpenCritic|id\u{85}x|96}}", first: Some(&["game/row/reception|OpenCritic|id\u{85}x|96", "id\u{85}x", "96"]), all: &[&["game/row/reception|OpenCritic|id\u{85}x|96", "id\u{85}x", "96"]] },
    Vector { pattern: "opencritic", input: "{{Infobox game/row/reception|OpenCritic|id\u{a0}|96}}", first: None, all: &[] },
    Vector { pattern: "opencritic", input: "{{Infobox game/row/reception|OpenCritic|18502/elden-ring-nightreign|80}}", first: Some(&["game/row/reception|OpenCritic|18502/elden-ring-nightreign|80", "18502/elden-ring-nightreign", "80"]), all: &[&["game/row/reception|OpenCritic|18502/elden-ring-nightreign|80", "18502/elden-ring-nightreign", "80"]] },
    Vector { pattern: "opencritic", input: "{{Infobox game/row/reception|OpenCritic|a|b|7}}", first: Some(&["game/row/reception|OpenCritic|a|b|7", "a|b", "7"]), all: &[&["game/row/reception|OpenCritic|a|b|7", "a|b", "7"]] },
    Vector { pattern: "opencritic", input: "{{Infobox game/row/reception|OpenCritic||5}}", first: None, all: &[] },
    Vector { pattern: "opencritic", input: "{{Infobox game/row/reception|OpenCritic|id|x}}", first: None, all: &[] },
    Vector { pattern: "opencritic", input: "{{Infobox game/row/reception|OpenCritic|one|1}}\u{a}{{Infobox game/row/reception|OpenCritic|two|2}}", first: Some(&["game/row/reception|OpenCritic|one|1", "one", "1"]), all: &[&["game/row/reception|OpenCritic|one|1", "one", "1"], &["game/row/reception|OpenCritic|two|2", "two", "2"]] },
    Vector { pattern: "igdb", input: "{{Infobox game/row/reception|IGDB|elden-ring|96}}\u{a}", first: Some(&["game/row/reception|IGDB|elden-ring|96", "elden-ring", "96"]), all: &[&["game/row/reception|IGDB|elden-ring|96", "elden-ring", "96"]] },
    Vector { pattern: "igdb", input: "|IGDB text\u{d}\u{a}{{Infobox game/row/reception|IGDB|elden-ring|96}}\u{d}\u{a}", first: Some(&["game/row/reception|IGDB|elden-ring|96", "elden-ring", "96"]), all: &[&["game/row/reception|IGDB|elden-ring|96", "elden-ring", "96"]] },
    Vector { pattern: "igdb", input: "{{Infobox game/row/reception|IGDB|id\u{2028}|96}}", first: None, all: &[] },
    Vector { pattern: "igdb", input: "{{Infobox game/row/reception|IGDB|id\u{feff}|96}}", first: None, all: &[] },
    Vector { pattern: "igdb", input: "{{Infobox game/row/reception|IGDB|id\u{85}x|96}}", first: Some(&["game/row/reception|IGDB|id\u{85}x|96", "id\u{85}x", "96"]), all: &[&["game/row/reception|IGDB|id\u{85}x|96", "id\u{85}x", "96"]] },
    Vector { pattern: "igdb", input: "{{Infobox game/row/reception|IGDB|id\u{a0}|96}}", first: None, all: &[] },
    Vector { pattern: "igdb", input: "{{Infobox game/row/reception|IGDB|18502/elden-ring-nightreign|80}}", first: Some(&["game/row/reception|IGDB|18502/elden-ring-nightreign|80", "18502/elden-ring-nightreign", "80"]), all: &[&["game/row/reception|IGDB|18502/elden-ring-nightreign|80", "18502/elden-ring-nightreign", "80"]] },
    Vector { pattern: "igdb", input: "{{Infobox game/row/reception|IGDB|a|b|7}}", first: Some(&["game/row/reception|IGDB|a|b|7", "a|b", "7"]), all: &[&["game/row/reception|IGDB|a|b|7", "a|b", "7"]] },
    Vector { pattern: "igdb", input: "{{Infobox game/row/reception|IGDB||5}}", first: None, all: &[] },
    Vector { pattern: "igdb", input: "{{Infobox game/row/reception|IGDB|id|x}}", first: None, all: &[] },
    Vector { pattern: "igdb", input: "{{Infobox game/row/reception|IGDB|one|1}}\u{a}{{Infobox game/row/reception|IGDB|two|2}}", first: Some(&["game/row/reception|IGDB|one|1", "one", "1"]), all: &[&["game/row/reception|IGDB|one|1", "one", "1"], &["game/row/reception|IGDB|two|2", "two", "2"]] },
    Vector { pattern: "steam_id", input: "|steam appid  = 2622380\u{a}|next", first: Some(&["steam appid  = 2622380", "2622380"]), all: &[&["steam appid  = 2622380", "2622380"]] },
    Vector { pattern: "steam_id", input: "{{Infobox game\u{d}\u{a}|steam appid  = 2622380\u{d}\u{a}|other = 1\u{d}\u{a}}}", first: Some(&["steam appid  = 2622380", "2622380"]), all: &[&["steam appid  = 2622380", "2622380"]] },
    Vector { pattern: "steam_id", input: "|steam appid  = 2622380\u{2028}|next", first: Some(&["steam appid  = 2622380", "2622380"]), all: &[&["steam appid  = 2622380", "2622380"]] },
    Vector { pattern: "steam_id", input: "|steam appid  = 2622380\u{2029}|next", first: Some(&["steam appid  = 2622380", "2622380"]), all: &[&["steam appid  = 2622380", "2622380"]] },
    Vector { pattern: "steam_id", input: "\u{feff}|steam appid  = 2622380", first: Some(&["steam appid  = 2622380", "2622380"]), all: &[&["steam appid  = 2622380", "2622380"]] },
    Vector { pattern: "steam_id", input: "|steam appid  = 2622380\u{feff}\u{a}", first: Some(&["steam appid  = 2622380", "2622380"]), all: &[&["steam appid  = 2622380", "2622380"]] },
    Vector { pattern: "steam_id", input: "|steam appid  = 2622380\u{85}|next", first: Some(&["steam appid  = 2622380", "2622380"]), all: &[&["steam appid  = 2622380", "2622380"]] },
    Vector { pattern: "steam_id", input: "|steam appid  = 2622380\u{d}|next", first: Some(&["steam appid  = 2622380", "2622380"]), all: &[&["steam appid  = 2622380", "2622380"]] },
    Vector { pattern: "steam_id", input: "steam appid  = 2622380", first: Some(&["steam appid  = 2622380", "2622380"]), all: &[&["steam appid  = 2622380", "2622380"]] },
    Vector { pattern: "steam_id", input: "|first steam appid  = 2622380\u{a}|second steam appid  = 99\u{a}", first: Some(&["steam appid  = 2622380", "2622380"]), all: &[&["steam appid  = 2622380", "2622380"], &["steam appid  = 99", "99"]] },
    Vector { pattern: "steam_id", input: "|steam appid = 2622380", first: None, all: &[] },
    Vector { pattern: "steam_id", input: "|steam appid   = 2622380", first: None, all: &[] },
    Vector { pattern: "steam_id", input: "|steam appid  = x2622380", first: None, all: &[] },
    Vector { pattern: "steam_id", input: "|steam appid  = 26\u{663}", first: Some(&["steam appid  = 26", "26"]), all: &[&["steam appid  = 26", "26"]] },
    Vector { pattern: "hltb_id", input: "|hltb         = 160589\u{a}|next", first: Some(&["hltb         = 160589", "160589"]), all: &[&["hltb         = 160589", "160589"]] },
    Vector { pattern: "hltb_id", input: "{{Infobox game\u{d}\u{a}|hltb         = 160589\u{d}\u{a}|other = 1\u{d}\u{a}}}", first: Some(&["hltb         = 160589", "160589"]), all: &[&["hltb         = 160589", "160589"]] },
    Vector { pattern: "hltb_id", input: "|hltb         = 160589\u{2028}|next", first: Some(&["hltb         = 160589", "160589"]), all: &[&["hltb         = 160589", "160589"]] },
    Vector { pattern: "hltb_id", input: "|hltb         = 160589\u{2029}|next", first: Some(&["hltb         = 160589", "160589"]), all: &[&["hltb         = 160589", "160589"]] },
    Vector { pattern: "hltb_id", input: "\u{feff}|hltb         = 160589", first: Some(&["hltb         = 160589", "160589"]), all: &[&["hltb         = 160589", "160589"]] },
    Vector { pattern: "hltb_id", input: "|hltb         = 160589\u{feff}\u{a}", first: Some(&["hltb         = 160589", "160589"]), all: &[&["hltb         = 160589", "160589"]] },
    Vector { pattern: "hltb_id", input: "|hltb         = 160589\u{85}|next", first: Some(&["hltb         = 160589", "160589"]), all: &[&["hltb         = 160589", "160589"]] },
    Vector { pattern: "hltb_id", input: "|hltb         = 160589\u{d}|next", first: Some(&["hltb         = 160589", "160589"]), all: &[&["hltb         = 160589", "160589"]] },
    Vector { pattern: "hltb_id", input: "hltb         = 160589", first: Some(&["hltb         = 160589", "160589"]), all: &[&["hltb         = 160589", "160589"]] },
    Vector { pattern: "hltb_id", input: "|first hltb         = 160589\u{a}|second hltb         = 99\u{a}", first: Some(&["hltb         = 160589", "160589"]), all: &[&["hltb         = 160589", "160589"], &["hltb         = 99", "99"]] },
    Vector { pattern: "hltb_id", input: "|hltb        = 160589", first: None, all: &[] },
    Vector { pattern: "hltb_id", input: "|hltb          = 160589", first: None, all: &[] },
    Vector { pattern: "hltb_id", input: "|hltb         = ", first: None, all: &[] },
    Vector { pattern: "direct3d_versions", input: "|direct3d versions      = 11, 12\u{a}|x", first: Some(&["direct3d versions      = 11, 12", "11, 12"]), all: &[&["direct3d versions      = 11, 12", "11, 12"]] },
    Vector { pattern: "direct3d_versions", input: "|direct3d versions      = 11, 12\u{d}\u{a}|x", first: Some(&["direct3d versions      = 11, 12", "11, 12"]), all: &[&["direct3d versions      = 11, 12", "11, 12"]] },
    Vector { pattern: "direct3d_versions", input: "|direct3d versions      = 11, 12\u{2028}|x", first: Some(&["direct3d versions      = 11, 12", "11, 12"]), all: &[&["direct3d versions      = 11, 12", "11, 12"]] },
    Vector { pattern: "direct3d_versions", input: "|direct3d versions      = 11, 12\u{2029}|x", first: Some(&["direct3d versions      = 11, 12", "11, 12"]), all: &[&["direct3d versions      = 11, 12", "11, 12"]] },
    Vector { pattern: "direct3d_versions", input: "|direct3d versions      = 11, 12\u{d}|x", first: Some(&["direct3d versions      = 11, 12", "11, 12"]), all: &[&["direct3d versions      = 11, 12", "11, 12"]] },
    Vector { pattern: "direct3d_versions", input: "|direct3d versions      = 11\u{feff}, 12\u{a}", first: Some(&["direct3d versions      = 11\u{feff}, 12", "11\u{feff}, 12"]), all: &[&["direct3d versions      = 11\u{feff}, 12", "11\u{feff}, 12"]] },
    Vector { pattern: "direct3d_versions", input: "|direct3d versions      = 11\u{85}, 12\u{a}", first: Some(&["direct3d versions      = 11\u{85}, 12", "11\u{85}, 12"]), all: &[&["direct3d versions      = 11\u{85}, 12", "11\u{85}, 12"]] },
    Vector { pattern: "direct3d_versions", input: "|direct3d versions      = \u{a}|x", first: None, all: &[] },
    Vector { pattern: "direct3d_versions", input: "|direct3d versions     = 11", first: None, all: &[] },
    Vector { pattern: "direct3d_versions", input: "|direct3d versions      = \u{1f3ae}9\u{d}\u{a}", first: Some(&["direct3d versions      = \u{1f3ae}9", "\u{1f3ae}9"]), all: &[&["direct3d versions      = \u{1f3ae}9", "\u{1f3ae}9"]] },
    Vector { pattern: "direct3d_versions", input: "|direct3d versions      = 9\u{a}|direct3d versions      = 12\u{a}", first: Some(&["direct3d versions      = 9", "9"]), all: &[&["direct3d versions      = 9", "9"], &["direct3d versions      = 12", "12"]] },
    Vector { pattern: "genres", input: "{{Infobox game/row/taxonomy/genres | Action, RPG }}", first: Some(&["game/row/taxonomy/genres | Action, RPG }}", "Action, RPG"]), all: &[&["game/row/taxonomy/genres | Action, RPG }}", "Action, RPG"]] },
    Vector { pattern: "genres", input: "{{Infobox game/row/taxonomy/genres\u{a}| Action, RPG\u{a}}}", first: Some(&["game/row/taxonomy/genres\u{a}| Action, RPG\u{a}}}", "Action, RPG"]), all: &[&["game/row/taxonomy/genres\u{a}| Action, RPG\u{a}}}", "Action, RPG"]] },
    Vector { pattern: "genres", input: "{{Infobox game/row/taxonomy/genres\u{d}\u{a}| Action, RPG\u{d}\u{a}}}", first: Some(&["game/row/taxonomy/genres\u{d}\u{a}| Action, RPG\u{d}\u{a}}}", "Action, RPG"]), all: &[&["game/row/taxonomy/genres\u{d}\u{a}| Action, RPG\u{d}\u{a}}}", "Action, RPG"]] },
    Vector { pattern: "genres", input: "{{Infobox game/row/taxonomy/genres | Action, RPG\u{feff}}}", first: Some(&["game/row/taxonomy/genres | Action, RPG\u{feff}}}", "Action, RPG"]), all: &[&["game/row/taxonomy/genres | Action, RPG\u{feff}}}", "Action, RPG"]] },
    Vector { pattern: "genres", input: "{{Infobox game/row/taxonomy/genres\u{feff}| \u{feff}Action}}", first: Some(&["game/row/taxonomy/genres\u{feff}| \u{feff}Action}}", "Action"]), all: &[&["game/row/taxonomy/genres\u{feff}| \u{feff}Action}}", "Action"]] },
    Vector { pattern: "genres", input: "{{Infobox game/row/taxonomy/genres\u{85}| Action }}", first: None, all: &[] },
    Vector { pattern: "genres", input: "{{Infobox game/row/taxonomy/genres |\u{85}Action }}", first: Some(&["game/row/taxonomy/genres |\u{85}Action }}", "\u{85}Action"]), all: &[&["game/row/taxonomy/genres |\u{85}Action }}", "\u{85}Action"]] },
    Vector { pattern: "genres", input: "{{Infobox game/row/taxonomy/genres | Action\u{85} }}", first: Some(&["game/row/taxonomy/genres | Action\u{85} }}", "Action\u{85}"]), all: &[&["game/row/taxonomy/genres | Action\u{85} }}", "Action\u{85}"]] },
    Vector { pattern: "genres", input: "{{Infobox game/row/taxonomy/genres | Action\u{2028} }}", first: Some(&["game/row/taxonomy/genres | Action\u{2028} }}", "Action"]), all: &[&["game/row/taxonomy/genres | Action\u{2028} }}", "Action"]] },
    Vector { pattern: "genres", input: "{{Infobox game/row/taxonomy/genres | Action\u{d}\u{a}More }}", first: None, all: &[] },
    Vector { pattern: "genres", input: "{{Infobox game/row/taxonomy/genres | Action\u{2028}More }}", first: None, all: &[] },
    Vector { pattern: "genres", input: "{{Infobox game/row/taxonomy/genres | }}", first: Some(&["game/row/taxonomy/genres | }}", ""]), all: &[&["game/row/taxonomy/genres | }}", ""]] },
    Vector { pattern: "genres", input: "{{Infobox game/row/taxonomy/genres | A }} {{Infobox game/row/taxonomy/genres | B }}", first: Some(&["game/row/taxonomy/genres | A }}", "A"]), all: &[&["game/row/taxonomy/genres | A }}", "A"], &["game/row/taxonomy/genres | B }}", "B"]] },
    Vector { pattern: "genres", input: "{{Infobox game/row/taxonomy/genres |\u{a0}Action\u{a0}}}", first: Some(&["game/row/taxonomy/genres |\u{a0}Action\u{a0}}}", "Action"]), all: &[&["game/row/taxonomy/genres |\u{a0}Action\u{a0}}}", "Action"]] },
    Vector { pattern: "release_date", input: "{{Infobox game/row/date|Windows|May 29, 2025}}", first: Some(&["game/row/date|Windows|May 29, 2025", "Windows", "May 29, 2025"]), all: &[&["game/row/date|Windows|May 29, 2025", "Windows", "May 29, 2025"]] },
    Vector { pattern: "release_date", input: "{{Infobox game/row/date|Windows|May 29, 2025}}\u{a}{{Infobox game/row/date|OS X|June 1, 2025}}", first: Some(&["game/row/date|Windows|May 29, 2025", "Windows", "May 29, 2025"]), all: &[&["game/row/date|Windows|May 29, 2025", "Windows", "May 29, 2025"], &["game/row/date|OS X|June 1, 2025", "OS X", "June 1, 2025"]] },
    Vector { pattern: "release_date", input: "{{Infobox game/row/date|Windows|May 29,\u{d}\u{a}2025}}", first: Some(&["game/row/date|Windows|May 29,\u{d}\u{a}2025", "Windows", "May 29,\u{d}\u{a}2025"]), all: &[&["game/row/date|Windows|May 29,\u{d}\u{a}2025", "Windows", "May 29,\u{d}\u{a}2025"]] },
    Vector { pattern: "release_date", input: "{{Infobox game/row/date|Windows|May\u{2028}29}}", first: Some(&["game/row/date|Windows|May\u{2028}29", "Windows", "May\u{2028}29"]), all: &[&["game/row/date|Windows|May\u{2028}29", "Windows", "May\u{2028}29"]] },
    Vector { pattern: "release_date", input: "\u{feff}{{Infobox game/row/date|Windows|\u{feff}2025}}", first: Some(&["game/row/date|Windows|\u{feff}2025", "Windows", "\u{feff}2025"]), all: &[&["game/row/date|Windows|\u{feff}2025", "Windows", "\u{feff}2025"]] },
    Vector { pattern: "release_date", input: "{{Infobox game/row/date|Win\u{a}dows|2025}}", first: Some(&["game/row/date|Win\u{a}dows|2025", "Win\u{a}dows", "2025"]), all: &[&["game/row/date|Win\u{a}dows|2025", "Win\u{a}dows", "2025"]] },
    Vector { pattern: "release_date", input: "{{Infobox game/row/date|Windows|}}", first: Some(&["game/row/date|Windows|", "Windows", ""]), all: &[&["game/row/date|Windows|", "Windows", ""]] },
    Vector { pattern: "release_date", input: "{{Infobox game/row/date||2025}}", first: None, all: &[] },
    Vector { pattern: "release_date", input: "{{Infobox game/row/date|Windows|2025|ref}}", first: Some(&["game/row/date|Windows|2025|ref", "Windows", "2025|ref"]), all: &[&["game/row/date|Windows|2025|ref", "Windows", "2025|ref"]] },
    Vector { pattern: "release_date", input: "game/row/date|Windows|2025", first: Some(&["game/row/date|Windows|2025", "Windows", "2025"]), all: &[&["game/row/date|Windows|2025", "Windows", "2025"]] },
    Vector { pattern: "release_date", input: "{{Infobox game/row/date|Windows|2025\u{85}}}", first: Some(&["game/row/date|Windows|2025\u{85}", "Windows", "2025\u{85}"]), all: &[&["game/row/date|Windows|2025\u{85}", "Windows", "2025\u{85}"]] },
    Vector { pattern: "crossover_link", input: "codeweavers  = value\u{a}|x", first: Some(&["codeweavers  = value", "value"]), all: &[&["codeweavers  = value", "value"]] },
    Vector { pattern: "crossover_link", input: "codeweavers  = value\u{d}\u{a}|x", first: Some(&["codeweavers  = value", "value"]), all: &[&["codeweavers  = value", "value"]] },
    Vector { pattern: "crossover_link", input: "codeweavers  = value\u{2028}|x", first: Some(&["codeweavers  = value", "value"]), all: &[&["codeweavers  = value", "value"]] },
    Vector { pattern: "crossover_link", input: "codeweavers  = value\u{2029}|x", first: Some(&["codeweavers  = value", "value"]), all: &[&["codeweavers  = value", "value"]] },
    Vector { pattern: "crossover_link", input: "codeweavers  = value\u{feff}|x", first: Some(&["codeweavers  = value", "value"]), all: &[&["codeweavers  = value", "value"]] },
    Vector { pattern: "crossover_link", input: "\u{feff}codeweavers  = value", first: Some(&["codeweavers  = value", "value"]), all: &[&["codeweavers  = value", "value"]] },
    Vector { pattern: "crossover_link", input: "codeweavers  = va\u{85}lue\u{a}", first: Some(&["codeweavers  = va\u{85}lue", "va\u{85}lue"]), all: &[&["codeweavers  = va\u{85}lue", "va\u{85}lue"]] },
    Vector { pattern: "crossover_link", input: "codeweavers  = va\u{a0}lue\u{a}", first: Some(&["codeweavers  = va", "va"]), all: &[&["codeweavers  = va", "va"]] },
    Vector { pattern: "crossover_link", input: "codeweavers   = value", first: None, all: &[] },
    Vector { pattern: "crossover_link", input: "codeweavers  = \u{a}value", first: None, all: &[] },
    Vector { pattern: "crossover_link", input: "codeweavers  = one\u{a}|codeweavers  = two", first: Some(&["codeweavers  = one", "one"]), all: &[&["codeweavers  = one", "one"], &["codeweavers  = two", "two"]] },
    Vector { pattern: "crossover_rating", input: "|crossover            = value\u{a}|x", first: Some(&["|crossover            = value", "value"]), all: &[&["|crossover            = value", "value"]] },
    Vector { pattern: "crossover_rating", input: "|crossover            = value\u{d}\u{a}|x", first: Some(&["|crossover            = value", "value"]), all: &[&["|crossover            = value", "value"]] },
    Vector { pattern: "crossover_rating", input: "|crossover            = value\u{2028}|x", first: Some(&["|crossover            = value", "value"]), all: &[&["|crossover            = value", "value"]] },
    Vector { pattern: "crossover_rating", input: "|crossover            = value\u{2029}|x", first: Some(&["|crossover            = value", "value"]), all: &[&["|crossover            = value", "value"]] },
    Vector { pattern: "crossover_rating", input: "|crossover            = value\u{feff}|x", first: Some(&["|crossover            = value", "value"]), all: &[&["|crossover            = value", "value"]] },
    Vector { pattern: "crossover_rating", input: "\u{feff}|crossover            = value", first: Some(&["|crossover            = value", "value"]), all: &[&["|crossover            = value", "value"]] },
    Vector { pattern: "crossover_rating", input: "|crossover            = va\u{85}lue\u{a}", first: Some(&["|crossover            = va\u{85}lue", "va\u{85}lue"]), all: &[&["|crossover            = va\u{85}lue", "va\u{85}lue"]] },
    Vector { pattern: "crossover_rating", input: "|crossover            = va\u{a0}lue\u{a}", first: Some(&["|crossover            = va", "va"]), all: &[&["|crossover            = va", "va"]] },
    Vector { pattern: "crossover_rating", input: "|crossover             = value", first: None, all: &[] },
    Vector { pattern: "crossover_rating", input: "|crossover            = \u{a}value", first: None, all: &[] },
    Vector { pattern: "crossover_rating", input: "|crossover            = one\u{a}|crossover            = two", first: Some(&["|crossover            = one", "one"]), all: &[&["|crossover            = one", "one"], &["|crossover            = two", "two"]] },
    Vector { pattern: "wine_rating", input: "|wine                 = value\u{a}|x", first: Some(&["|wine                 = value", "value"]), all: &[&["|wine                 = value", "value"]] },
    Vector { pattern: "wine_rating", input: "|wine                 = value\u{d}\u{a}|x", first: Some(&["|wine                 = value", "value"]), all: &[&["|wine                 = value", "value"]] },
    Vector { pattern: "wine_rating", input: "|wine                 = value\u{2028}|x", first: Some(&["|wine                 = value", "value"]), all: &[&["|wine                 = value", "value"]] },
    Vector { pattern: "wine_rating", input: "|wine                 = value\u{2029}|x", first: Some(&["|wine                 = value", "value"]), all: &[&["|wine                 = value", "value"]] },
    Vector { pattern: "wine_rating", input: "|wine                 = value\u{feff}|x", first: Some(&["|wine                 = value", "value"]), all: &[&["|wine                 = value", "value"]] },
    Vector { pattern: "wine_rating", input: "\u{feff}|wine                 = value", first: Some(&["|wine                 = value", "value"]), all: &[&["|wine                 = value", "value"]] },
    Vector { pattern: "wine_rating", input: "|wine                 = va\u{85}lue\u{a}", first: Some(&["|wine                 = va\u{85}lue", "va\u{85}lue"]), all: &[&["|wine                 = va\u{85}lue", "va\u{85}lue"]] },
    Vector { pattern: "wine_rating", input: "|wine                 = va\u{a0}lue\u{a}", first: Some(&["|wine                 = va", "va"]), all: &[&["|wine                 = va", "va"]] },
    Vector { pattern: "wine_rating", input: "|wine                  = value", first: None, all: &[] },
    Vector { pattern: "wine_rating", input: "|wine                 = \u{a}value", first: None, all: &[] },
    Vector { pattern: "wine_rating", input: "|wine                 = one\u{a}|wine                 = two", first: Some(&["|wine                 = one", "one"]), all: &[&["|wine                 = one", "one"], &["|wine                 = two", "two"]] },
    Vector { pattern: "next_data", input: "<html><head></head><body><script id=\"__NEXT_DATA__\" type=\"application/json\">{\"props\":{\"pageProps\":{}}}</script></body></html>", first: Some(&["<script id=\"__NEXT_DATA__\" type=\"application/json\">{\"props\":{\"pageProps\":{}}}</script>", "{\"props\":{\"pageProps\":{}}}"]), all: &[&["<script id=\"__NEXT_DATA__\" type=\"application/json\">{\"props\":{\"pageProps\":{}}}</script>", "{\"props\":{\"pageProps\":{}}}"]] },
    Vector { pattern: "next_data", input: "<html><head></head><body><script id=\"__NEXT_DATA__\" type=\"application/json\">{\"a\":\u{a}1}</script></body></html>", first: Some(&["<script id=\"__NEXT_DATA__\" type=\"application/json\">{\"a\":\u{a}1}</script>", "{\"a\":\u{a}1}"]), all: &[&["<script id=\"__NEXT_DATA__\" type=\"application/json\">{\"a\":\u{a}1}</script>", "{\"a\":\u{a}1}"]] },
    Vector { pattern: "next_data", input: "<html><head></head><body><script id=\"__NEXT_DATA__\" type=\"application/json\">{\"a\":\u{d}\u{a}1}</script></body></html>", first: Some(&["<script id=\"__NEXT_DATA__\" type=\"application/json\">{\"a\":\u{d}\u{a}1}</script>", "{\"a\":\u{d}\u{a}1}"]), all: &[&["<script id=\"__NEXT_DATA__\" type=\"application/json\">{\"a\":\u{d}\u{a}1}</script>", "{\"a\":\u{d}\u{a}1}"]] },
    Vector { pattern: "next_data", input: "<html><head></head><body><script id=\"__NEXT_DATA__\" type=\"application/json\">{\"a\":\"\u{2028}x\"}</script></body></html>", first: Some(&["<script id=\"__NEXT_DATA__\" type=\"application/json\">{\"a\":\"\u{2028}x\"}</script>", "{\"a\":\"\u{2028}x\"}"]), all: &[&["<script id=\"__NEXT_DATA__\" type=\"application/json\">{\"a\":\"\u{2028}x\"}</script>", "{\"a\":\"\u{2028}x\"}"]] },
    Vector { pattern: "next_data", input: "<html><head></head><body><script id=\"__NEXT_DATA__\" type=\"application/json\">\u{feff}{}</script></body></html>", first: Some(&["<script id=\"__NEXT_DATA__\" type=\"application/json\">\u{feff}{}</script>", "\u{feff}{}"]), all: &[&["<script id=\"__NEXT_DATA__\" type=\"application/json\">\u{feff}{}</script>", "\u{feff}{}"]] },
    Vector { pattern: "next_data", input: "<html><head></head><body><script id=\"__NEXT_DATA__\" type=\"application/json\">{}</script></body></html>\u{a}<html><head></head><body><script id=\"__NEXT_DATA__\" type=\"application/json\">{\"second\":1}</script></body></html>", first: Some(&["<script id=\"__NEXT_DATA__\" type=\"application/json\">{}</script>", "{}"]), all: &[&["<script id=\"__NEXT_DATA__\" type=\"application/json\">{}</script>", "{}"], &["<script id=\"__NEXT_DATA__\" type=\"application/json\">{\"second\":1}</script>", "{\"second\":1}"]] },
    Vector { pattern: "next_data", input: "<html><head></head><body><script id=\"__NEXT_DATA__\" type=\"application/json\"></script></body></html>", first: Some(&["<script id=\"__NEXT_DATA__\" type=\"application/json\"></script>", ""]), all: &[&["<script id=\"__NEXT_DATA__\" type=\"application/json\"></script>", ""]] },
    Vector { pattern: "next_data", input: "<script id=\"__NEXT_DATA__\" type=\"application/json\">{}", first: None, all: &[] },
    Vector { pattern: "next_data", input: "<script id=\"__NEXT_DATA__\"  type=\"application/json\">{}</script>", first: None, all: &[] },
    Vector { pattern: "next_data", input: "<script id=\"__NEXT_DATA__\" type=\"application/json\">{\"</scr\":1}</script>\u{a}</script>", first: Some(&["<script id=\"__NEXT_DATA__\" type=\"application/json\">{\"</scr\":1}</script>", "{\"</scr\":1}"]), all: &[&["<script id=\"__NEXT_DATA__\" type=\"application/json\">{\"</scr\":1}</script>", "{\"</scr\":1}"]] },
    Vector { pattern: "gog_main", input: "<span class=\"howlongtobeat-box__time\"> 12.5 h </span><span class=\"howlongtobeat-box__name\">Main</span>\u{a}", first: Some(&["<span class=\"howlongtobeat-box__time\"> 12.5 h </span><span class=\"howlongtobeat-box__name\">Main</span>", "12.5"]), all: &[&["<span class=\"howlongtobeat-box__time\"> 12.5 h </span><span class=\"howlongtobeat-box__name\">Main</span>", "12.5"]] },
    Vector { pattern: "gog_main", input: "<span class=\"howlongtobeat-box__time\">12.5 h</span><span class=\"howlongtobeat-box__name\">Main</span>\u{d}\u{a}", first: Some(&["<span class=\"howlongtobeat-box__time\">12.5 h</span><span class=\"howlongtobeat-box__name\">Main</span>", "12.5"]), all: &[&["<span class=\"howlongtobeat-box__time\">12.5 h</span><span class=\"howlongtobeat-box__name\">Main</span>", "12.5"]] },
    Vector { pattern: "gog_main", input: "<span class=\"howlongtobeat-box__time\"> 12 h</span><span class=\"howlongtobeat-box__name\">Main</span>\u{2028}", first: Some(&["<span class=\"howlongtobeat-box__time\"> 12 h</span><span class=\"howlongtobeat-box__name\">Main</span>", "12"]), all: &[&["<span class=\"howlongtobeat-box__time\"> 12 h</span><span class=\"howlongtobeat-box__name\">Main</span>", "12"]] },
    Vector { pattern: "gog_main", input: "<span class=\"howlongtobeat-box__time\"> 3 h </span><span class=\"howlongtobeat-box__name\">Other</span><span class=\"howlongtobeat-box__time\"> 12.5 h </span><span class=\"howlongtobeat-box__name\">Main</span>", first: Some(&["<span class=\"howlongtobeat-box__time\"> 12.5 h </span><span class=\"howlongtobeat-box__name\">Main</span>", "12.5"]), all: &[&["<span class=\"howlongtobeat-box__time\"> 12.5 h </span><span class=\"howlongtobeat-box__name\">Main</span>", "12.5"]] },
    Vector { pattern: "gog_main", input: "<span class=\"howlongtobeat-box__time\"> 12.5.1 h </span><span class=\"howlongtobeat-box__name\">Main</span>", first: Some(&["<span class=\"howlongtobeat-box__time\"> 12.5.1 h </span><span class=\"howlongtobeat-box__name\">Main</span>", "12.5.1"]), all: &[&["<span class=\"howlongtobeat-box__time\"> 12.5.1 h </span><span class=\"howlongtobeat-box__name\">Main</span>", "12.5.1"]] },
    Vector { pattern: "gog_main", input: "<span class=\"howlongtobeat-box__time\"> 12.5 h\u{a}</span><span class=\"howlongtobeat-box__name\">Main</span>", first: None, all: &[] },
    Vector { pattern: "gog_main", input: "\u{feff}<span class=\"howlongtobeat-box__time\"> 7 h </span><span class=\"howlongtobeat-box__name\">Main</span>", first: Some(&["<span class=\"howlongtobeat-box__time\"> 7 h </span><span class=\"howlongtobeat-box__name\">Main</span>", "7"]), all: &[&["<span class=\"howlongtobeat-box__time\"> 7 h </span><span class=\"howlongtobeat-box__name\">Main</span>", "7"]] },
    Vector { pattern: "gog_main", input: "<span class=\"howlongtobeat-box__time\">  h </span><span class=\"howlongtobeat-box__name\">Main</span>", first: None, all: &[] },
    Vector { pattern: "gog_main", input: "<span class=\"howlongtobeat-box__time\"> x h </span><span class=\"howlongtobeat-box__name\">Main</span>", first: None, all: &[] },
    Vector { pattern: "gog_main", input: "<span class=\"howlongtobeat-box__time\"> 12.5 h </span><span class=\"howlongtobeat-box__name\">MainX</span>", first: None, all: &[] },
    Vector { pattern: "gog_main", input: "<span class=\"howlongtobeat-box__time\"> \u{661}\u{662} h </span><span class=\"howlongtobeat-box__name\">Main</span>", first: None, all: &[] },
    Vector { pattern: "gog_main", input: "<span class=\"howlongtobeat-box__time\"> 1 h </span><span class=\"howlongtobeat-box__name\">Main</span>\u{a}<span class=\"howlongtobeat-box__time\"> 2 h </span><span class=\"howlongtobeat-box__name\">Main</span>", first: Some(&["<span class=\"howlongtobeat-box__time\"> 1 h </span><span class=\"howlongtobeat-box__name\">Main</span>", "1"]), all: &[&["<span class=\"howlongtobeat-box__time\"> 1 h </span><span class=\"howlongtobeat-box__name\">Main</span>", "1"], &["<span class=\"howlongtobeat-box__time\"> 2 h </span><span class=\"howlongtobeat-box__name\">Main</span>", "2"]] },
    Vector { pattern: "gog_main_sides", input: "<span class=\"howlongtobeat-box__time\"> 12.5 h </span><span class=\"howlongtobeat-box__name\">Main + Sides</span>\u{a}", first: Some(&["<span class=\"howlongtobeat-box__time\"> 12.5 h </span><span class=\"howlongtobeat-box__name\">Main + Sides</span>", "12.5"]), all: &[&["<span class=\"howlongtobeat-box__time\"> 12.5 h </span><span class=\"howlongtobeat-box__name\">Main + Sides</span>", "12.5"]] },
    Vector { pattern: "gog_main_sides", input: "<span class=\"howlongtobeat-box__time\">12.5 h</span><span class=\"howlongtobeat-box__name\">Main + Sides</span>\u{d}\u{a}", first: Some(&["<span class=\"howlongtobeat-box__time\">12.5 h</span><span class=\"howlongtobeat-box__name\">Main + Sides</span>", "12.5"]), all: &[&["<span class=\"howlongtobeat-box__time\">12.5 h</span><span class=\"howlongtobeat-box__name\">Main + Sides</span>", "12.5"]] },
    Vector { pattern: "gog_main_sides", input: "<span class=\"howlongtobeat-box__time\"> 12 h</span><span class=\"howlongtobeat-box__name\">Main + Sides</span>\u{2028}", first: Some(&["<span class=\"howlongtobeat-box__time\"> 12 h</span><span class=\"howlongtobeat-box__name\">Main + Sides</span>", "12"]), all: &[&["<span class=\"howlongtobeat-box__time\"> 12 h</span><span class=\"howlongtobeat-box__name\">Main + Sides</span>", "12"]] },
    Vector { pattern: "gog_main_sides", input: "<span class=\"howlongtobeat-box__time\"> 3 h </span><span class=\"howlongtobeat-box__name\">Other</span><span class=\"howlongtobeat-box__time\"> 12.5 h </span><span class=\"howlongtobeat-box__name\">Main + Sides</span>", first: Some(&["<span class=\"howlongtobeat-box__time\"> 12.5 h </span><span class=\"howlongtobeat-box__name\">Main + Sides</span>", "12.5"]), all: &[&["<span class=\"howlongtobeat-box__time\"> 12.5 h </span><span class=\"howlongtobeat-box__name\">Main + Sides</span>", "12.5"]] },
    Vector { pattern: "gog_main_sides", input: "<span class=\"howlongtobeat-box__time\"> 12.5.1 h </span><span class=\"howlongtobeat-box__name\">Main + Sides</span>", first: Some(&["<span class=\"howlongtobeat-box__time\"> 12.5.1 h </span><span class=\"howlongtobeat-box__name\">Main + Sides</span>", "12.5.1"]), all: &[&["<span class=\"howlongtobeat-box__time\"> 12.5.1 h </span><span class=\"howlongtobeat-box__name\">Main + Sides</span>", "12.5.1"]] },
    Vector { pattern: "gog_main_sides", input: "<span class=\"howlongtobeat-box__time\"> 12.5 h\u{a}</span><span class=\"howlongtobeat-box__name\">Main + Sides</span>", first: None, all: &[] },
    Vector { pattern: "gog_main_sides", input: "\u{feff}<span class=\"howlongtobeat-box__time\"> 7 h </span><span class=\"howlongtobeat-box__name\">Main + Sides</span>", first: Some(&["<span class=\"howlongtobeat-box__time\"> 7 h </span><span class=\"howlongtobeat-box__name\">Main + Sides</span>", "7"]), all: &[&["<span class=\"howlongtobeat-box__time\"> 7 h </span><span class=\"howlongtobeat-box__name\">Main + Sides</span>", "7"]] },
    Vector { pattern: "gog_main_sides", input: "<span class=\"howlongtobeat-box__time\">  h </span><span class=\"howlongtobeat-box__name\">Main + Sides</span>", first: None, all: &[] },
    Vector { pattern: "gog_main_sides", input: "<span class=\"howlongtobeat-box__time\"> x h </span><span class=\"howlongtobeat-box__name\">Main + Sides</span>", first: None, all: &[] },
    Vector { pattern: "gog_main_sides", input: "<span class=\"howlongtobeat-box__time\"> 12.5 h </span><span class=\"howlongtobeat-box__name\">Main + SidesX</span>", first: None, all: &[] },
    Vector { pattern: "gog_main_sides", input: "<span class=\"howlongtobeat-box__time\"> \u{661}\u{662} h </span><span class=\"howlongtobeat-box__name\">Main + Sides</span>", first: None, all: &[] },
    Vector { pattern: "gog_main_sides", input: "<span class=\"howlongtobeat-box__time\"> 1 h </span><span class=\"howlongtobeat-box__name\">Main + Sides</span>\u{a}<span class=\"howlongtobeat-box__time\"> 2 h </span><span class=\"howlongtobeat-box__name\">Main + Sides</span>", first: Some(&["<span class=\"howlongtobeat-box__time\"> 1 h </span><span class=\"howlongtobeat-box__name\">Main + Sides</span>", "1"]), all: &[&["<span class=\"howlongtobeat-box__time\"> 1 h </span><span class=\"howlongtobeat-box__name\">Main + Sides</span>", "1"], &["<span class=\"howlongtobeat-box__time\"> 2 h </span><span class=\"howlongtobeat-box__name\">Main + Sides</span>", "2"]] },
    Vector { pattern: "gog_completionist", input: "<span class=\"howlongtobeat-box__time\"> 12.5 h </span><span class=\"howlongtobeat-box__name\">Completionist</span>\u{a}", first: Some(&["<span class=\"howlongtobeat-box__time\"> 12.5 h </span><span class=\"howlongtobeat-box__name\">Completionist</span>", "12.5"]), all: &[&["<span class=\"howlongtobeat-box__time\"> 12.5 h </span><span class=\"howlongtobeat-box__name\">Completionist</span>", "12.5"]] },
    Vector { pattern: "gog_completionist", input: "<span class=\"howlongtobeat-box__time\">12.5 h</span><span class=\"howlongtobeat-box__name\">Completionist</span>\u{d}\u{a}", first: Some(&["<span class=\"howlongtobeat-box__time\">12.5 h</span><span class=\"howlongtobeat-box__name\">Completionist</span>", "12.5"]), all: &[&["<span class=\"howlongtobeat-box__time\">12.5 h</span><span class=\"howlongtobeat-box__name\">Completionist</span>", "12.5"]] },
    Vector { pattern: "gog_completionist", input: "<span class=\"howlongtobeat-box__time\"> 12 h</span><span class=\"howlongtobeat-box__name\">Completionist</span>\u{2028}", first: Some(&["<span class=\"howlongtobeat-box__time\"> 12 h</span><span class=\"howlongtobeat-box__name\">Completionist</span>", "12"]), all: &[&["<span class=\"howlongtobeat-box__time\"> 12 h</span><span class=\"howlongtobeat-box__name\">Completionist</span>", "12"]] },
    Vector { pattern: "gog_completionist", input: "<span class=\"howlongtobeat-box__time\"> 3 h </span><span class=\"howlongtobeat-box__name\">Other</span><span class=\"howlongtobeat-box__time\"> 12.5 h </span><span class=\"howlongtobeat-box__name\">Completionist</span>", first: Some(&["<span class=\"howlongtobeat-box__time\"> 12.5 h </span><span class=\"howlongtobeat-box__name\">Completionist</span>", "12.5"]), all: &[&["<span class=\"howlongtobeat-box__time\"> 12.5 h </span><span class=\"howlongtobeat-box__name\">Completionist</span>", "12.5"]] },
    Vector { pattern: "gog_completionist", input: "<span class=\"howlongtobeat-box__time\"> 12.5.1 h </span><span class=\"howlongtobeat-box__name\">Completionist</span>", first: Some(&["<span class=\"howlongtobeat-box__time\"> 12.5.1 h </span><span class=\"howlongtobeat-box__name\">Completionist</span>", "12.5.1"]), all: &[&["<span class=\"howlongtobeat-box__time\"> 12.5.1 h </span><span class=\"howlongtobeat-box__name\">Completionist</span>", "12.5.1"]] },
    Vector { pattern: "gog_completionist", input: "<span class=\"howlongtobeat-box__time\"> 12.5 h\u{a}</span><span class=\"howlongtobeat-box__name\">Completionist</span>", first: None, all: &[] },
    Vector { pattern: "gog_completionist", input: "\u{feff}<span class=\"howlongtobeat-box__time\"> 7 h </span><span class=\"howlongtobeat-box__name\">Completionist</span>", first: Some(&["<span class=\"howlongtobeat-box__time\"> 7 h </span><span class=\"howlongtobeat-box__name\">Completionist</span>", "7"]), all: &[&["<span class=\"howlongtobeat-box__time\"> 7 h </span><span class=\"howlongtobeat-box__name\">Completionist</span>", "7"]] },
    Vector { pattern: "gog_completionist", input: "<span class=\"howlongtobeat-box__time\">  h </span><span class=\"howlongtobeat-box__name\">Completionist</span>", first: None, all: &[] },
    Vector { pattern: "gog_completionist", input: "<span class=\"howlongtobeat-box__time\"> x h </span><span class=\"howlongtobeat-box__name\">Completionist</span>", first: None, all: &[] },
    Vector { pattern: "gog_completionist", input: "<span class=\"howlongtobeat-box__time\"> 12.5 h </span><span class=\"howlongtobeat-box__name\">CompletionistX</span>", first: None, all: &[] },
    Vector { pattern: "gog_completionist", input: "<span class=\"howlongtobeat-box__time\"> \u{661}\u{662} h </span><span class=\"howlongtobeat-box__name\">Completionist</span>", first: None, all: &[] },
    Vector { pattern: "gog_completionist", input: "<span class=\"howlongtobeat-box__time\"> 1 h </span><span class=\"howlongtobeat-box__name\">Completionist</span>\u{a}<span class=\"howlongtobeat-box__time\"> 2 h </span><span class=\"howlongtobeat-box__name\">Completionist</span>", first: Some(&["<span class=\"howlongtobeat-box__time\"> 1 h </span><span class=\"howlongtobeat-box__name\">Completionist</span>", "1"]), all: &[&["<span class=\"howlongtobeat-box__time\"> 1 h </span><span class=\"howlongtobeat-box__name\">Completionist</span>", "1"], &["<span class=\"howlongtobeat-box__time\"> 2 h </span><span class=\"howlongtobeat-box__name\">Completionist</span>", "2"]] },
    Vector { pattern: "gog_hltb_id", input: "<a target=\"_blank\" href=\"https://howlongtobeat.com/game/2\">HowLongToBeat</a>", first: Some(&["<a target=\"_blank\" href=\"https://howlongtobeat.com/game/2\">HowLongToBeat</a>", "2"]), all: &[&["<a target=\"_blank\" href=\"https://howlongtobeat.com/game/2\">HowLongToBeat</a>", "2"]] },
    Vector { pattern: "gog_hltb_id", input: "<a target=\"_blank\" href=\"https://howlongtobeat.com/game/160589\">HowLongToBeat</a>\u{a}", first: Some(&["<a target=\"_blank\" href=\"https://howlongtobeat.com/game/160589\">HowLongToBeat</a>", "160589"]), all: &[&["<a target=\"_blank\" href=\"https://howlongtobeat.com/game/160589\">HowLongToBeat</a>", "160589"]] },
    Vector { pattern: "gog_hltb_id", input: "<a target=\"_blank\" href=\"https://howlongtobeat.com/game/160589\">HowLongToBeat</a>\u{d}\u{a}", first: Some(&["<a target=\"_blank\" href=\"https://howlongtobeat.com/game/160589\">HowLongToBeat</a>", "160589"]), all: &[&["<a target=\"_blank\" href=\"https://howlongtobeat.com/game/160589\">HowLongToBeat</a>", "160589"]] },
    Vector { pattern: "gog_hltb_id", input: "<a target=\"_blank\" href=\"https://howlongtobeat\u{a}com/game/1\">HowLongToBeat</a>", first: None, all: &[] },
    Vector { pattern: "gog_hltb_id", input: "<a target=\"_blank\" href=\"https://howlongtobeat\u{d}\u{a}com/game/1\">HowLongToBeat</a>", first: None, all: &[] },
    Vector { pattern: "gog_hltb_id", input: "<a target=\"_blank\" href=\"https://howlongtobeat\u{d}com/game/1\">HowLongToBeat</a>", first: None, all: &[] },
    Vector { pattern: "gog_hltb_id", input: "<a target=\"_blank\" href=\"https://howlongtobeat\u{2028}com/game/1\">HowLongToBeat</a>", first: None, all: &[] },
    Vector { pattern: "gog_hltb_id", input: "<a target=\"_blank\" href=\"https://howlongtobeat\u{2029}com/game/1\">HowLongToBeat</a>", first: None, all: &[] },
    Vector { pattern: "gog_hltb_id", input: "<a target=\"_blank\" href=\"https://howlongtobeat\u{85}com/game/1\">HowLongToBeat</a>", first: Some(&["<a target=\"_blank\" href=\"https://howlongtobeat\u{85}com/game/1\">HowLongToBeat</a>", "1"]), all: &[&["<a target=\"_blank\" href=\"https://howlongtobeat\u{85}com/game/1\">HowLongToBeat</a>", "1"]] },
    Vector { pattern: "gog_hltb_id", input: "<a target=\"_blank\" href=\"https://howlongtobeat\u{feff}com/game/1\">HowLongToBeat</a>", first: Some(&["<a target=\"_blank\" href=\"https://howlongtobeat\u{feff}com/game/1\">HowLongToBeat</a>", "1"]), all: &[&["<a target=\"_blank\" href=\"https://howlongtobeat\u{feff}com/game/1\">HowLongToBeat</a>", "1"]] },
    Vector { pattern: "gog_hltb_id", input: "<a target=\"_blank\" href=\"https://howlongtobeatXcom/game/1\">HowLongToBeat</a>", first: Some(&["<a target=\"_blank\" href=\"https://howlongtobeatXcom/game/1\">HowLongToBeat</a>", "1"]), all: &[&["<a target=\"_blank\" href=\"https://howlongtobeatXcom/game/1\">HowLongToBeat</a>", "1"]] },
    Vector { pattern: "gog_hltb_id", input: "<a target=\"_blank\" href=\"https://howlongtobeat.com/game/x\">HowLongToBeat</a>", first: None, all: &[] },
    Vector { pattern: "gog_hltb_id", input: "<a target=\"_blank\" href=\"https://howlongtobeat.com/game/\u{661}\u{662}\u{663}\">HowLongToBeat</a>", first: None, all: &[] },
    Vector { pattern: "gog_hltb_id", input: "<a target=\"_blank\" href=\"https://howlongtobeat.com/game/1\">HowLongToBeat</a><a target=\"_blank\" href=\"https://howlongtobeat.com/game/2\">HowLongToBeat</a>", first: Some(&["<a target=\"_blank\" href=\"https://howlongtobeat.com/game/1\">HowLongToBeat</a>", "1"]), all: &[&["<a target=\"_blank\" href=\"https://howlongtobeat.com/game/1\">HowLongToBeat</a>", "1"], &["<a target=\"_blank\" href=\"https://howlongtobeat.com/game/2\">HowLongToBeat</a>", "2"]] },
    Vector { pattern: "gog_hltb_id", input: "<a target=\"_blank\" href=\"https://howlongtobeat.com/game/9\">Other</a>", first: None, all: &[] },
    Vector { pattern: "combining_marks", input: "e\u{301}", first: Some(&["\u{301}"]), all: &[&["\u{301}"]] },
    Vector { pattern: "combining_marks", input: "a\u{300}b\u{301}c\u{36f}", first: Some(&["\u{300}"]), all: &[&["\u{300}"], &["\u{301}"], &["\u{36f}"]] },
    Vector { pattern: "combining_marks", input: "abc", first: None, all: &[] },
    Vector { pattern: "combining_marks", input: "\u{300}", first: Some(&["\u{300}"]), all: &[&["\u{300}"]] },
    Vector { pattern: "combining_marks", input: "e\u{2ff}\u{370}", first: None, all: &[] },
    Vector { pattern: "combining_marks", input: "x\u{301}\u{a}y\u{302}", first: Some(&["\u{301}"]), all: &[&["\u{301}"], &["\u{302}"]] },
    Vector { pattern: "combining_marks", input: "\u{1f3ae}\u{301}", first: Some(&["\u{301}"]), all: &[&["\u{301}"]] },
    Vector { pattern: "combining_marks", input: "cafe\u{301}\u{feff}", first: Some(&["\u{301}"]), all: &[&["\u{301}"]] },
    Vector { pattern: "combining_marks", input: "e\u{85}\u{301}", first: Some(&["\u{301}"]), all: &[&["\u{301}"]] },
    Vector { pattern: "combining_marks", input: "e\u{301}\u{302}\u{303}", first: Some(&["\u{301}"]), all: &[&["\u{301}"], &["\u{302}"], &["\u{303}"]] },
    Vector { pattern: "ampersand", input: "a & b", first: Some(&["&"]), all: &[&["&"]] },
    Vector { pattern: "ampersand", input: "&&", first: Some(&["&"]), all: &[&["&"], &["&"]] },
    Vector { pattern: "ampersand", input: "no", first: None, all: &[] },
    Vector { pattern: "ampersand", input: "a&b&c\u{a}", first: Some(&["&"]), all: &[&["&"], &["&"]] },
    Vector { pattern: "ampersand", input: "&\u{d}\u{a}", first: Some(&["&"]), all: &[&["&"]] },
    Vector { pattern: "ampersand", input: "&amp;", first: Some(&["&"]), all: &[&["&"]] },
    Vector { pattern: "ampersand", input: "\u{2028}&\u{2029}", first: Some(&["&"]), all: &[&["&"]] },
    Vector { pattern: "ampersand", input: "\u{feff}&", first: Some(&["&"]), all: &[&["&"]] },
    Vector { pattern: "ampersand", input: "\u{85}&", first: Some(&["&"]), all: &[&["&"]] },
    Vector { pattern: "ampersand", input: "\u{1f3ae}&", first: Some(&["&"]), all: &[&["&"]] },
    Vector { pattern: "non_alphanumeric_run", input: "half-life 2", first: Some(&["-"]), all: &[&["-"], &[" "]] },
    Vector { pattern: "non_alphanumeric_run", input: "a  b", first: Some(&["  "]), all: &[&["  "]] },
    Vector { pattern: "non_alphanumeric_run", input: "ab", first: None, all: &[] },
    Vector { pattern: "non_alphanumeric_run", input: "--", first: Some(&["--"]), all: &[&["--"]] },
    Vector { pattern: "non_alphanumeric_run", input: "a\u{a}b", first: Some(&["\u{a}"]), all: &[&["\u{a}"]] },
    Vector { pattern: "non_alphanumeric_run", input: "a\u{d}\u{a}b", first: Some(&["\u{d}\u{a}"]), all: &[&["\u{d}\u{a}"]] },
    Vector { pattern: "non_alphanumeric_run", input: "a\u{2028}b", first: Some(&["\u{2028}"]), all: &[&["\u{2028}"]] },
    Vector { pattern: "non_alphanumeric_run", input: "\u{feff}x", first: Some(&["\u{feff}"]), all: &[&["\u{feff}"]] },
    Vector { pattern: "non_alphanumeric_run", input: "\u{85}x", first: Some(&["\u{85}"]), all: &[&["\u{85}"]] },
    Vector { pattern: "non_alphanumeric_run", input: "caf\u{e9}", first: Some(&["\u{e9}"]), all: &[&["\u{e9}"]] },
    Vector { pattern: "non_alphanumeric_run", input: "a\u{1f3ae}b", first: Some(&["\u{1f3ae}"]), all: &[&["\u{1f3ae}"]] },
    Vector { pattern: "non_alphanumeric_run", input: "A1", first: Some(&["A"]), all: &[&["A"]] },
    Vector { pattern: "non_alphanumeric_run", input: "z9_z", first: Some(&["_"]), all: &[&["_"]] },
    Vector { pattern: "all_digits", input: "123", first: Some(&["123"]), all: &[&["123"]] },
    Vector { pattern: "all_digits", input: "123\u{a}", first: None, all: &[] },
    Vector { pattern: "all_digits", input: "12 3", first: None, all: &[] },
    Vector { pattern: "all_digits", input: "", first: None, all: &[] },
    Vector { pattern: "all_digits", input: "\u{661}\u{662}\u{663}", first: None, all: &[] },
    Vector { pattern: "all_digits", input: "123\u{2028}", first: None, all: &[] },
    Vector { pattern: "all_digits", input: "123\u{d}\u{a}", first: None, all: &[] },
    Vector { pattern: "all_digits", input: "0", first: Some(&["0"]), all: &[&["0"]] },
    Vector { pattern: "all_digits", input: "00123", first: Some(&["00123"]), all: &[&["00123"]] },
    Vector { pattern: "all_digits", input: "\u{feff}12", first: None, all: &[] },
    Vector { pattern: "all_digits", input: "12\u{85}", first: None, all: &[] },
    Vector { pattern: "all_digits", input: "\u{ff11}\u{ff12}\u{ff13}", first: None, all: &[] },
    Vector { pattern: "all_digits", input: "12a", first: None, all: &[] },
    Vector { pattern: "trademark_glyphs", input: "Sekiro\u{2122}: Shadows Die Twice", first: Some(&["\u{2122}"]), all: &[&["\u{2122}"]] },
    Vector { pattern: "trademark_glyphs", input: "a\u{ae}b\u{a9}c\u{2120}d", first: Some(&["\u{ae}"]), all: &[&["\u{ae}"], &["\u{a9}"], &["\u{2120}"]] },
    Vector { pattern: "trademark_glyphs", input: "none", first: None, all: &[] },
    Vector { pattern: "trademark_glyphs", input: "\u{2122}", first: Some(&["\u{2122}"]), all: &[&["\u{2122}"]] },
    Vector { pattern: "trademark_glyphs", input: "\u{2122}\u{ae}\u{a}", first: Some(&["\u{2122}"]), all: &[&["\u{2122}"], &["\u{ae}"]] },
    Vector { pattern: "trademark_glyphs", input: "\u{2122}\u{d}\u{a}\u{ae}", first: Some(&["\u{2122}"]), all: &[&["\u{2122}"], &["\u{ae}"]] },
    Vector { pattern: "trademark_glyphs", input: "\u{feff}\u{a9}", first: Some(&["\u{a9}"]), all: &[&["\u{a9}"]] },
    Vector { pattern: "trademark_glyphs", input: "\u{85}\u{2120}", first: Some(&["\u{2120}"]), all: &[&["\u{2120}"]] },
    Vector { pattern: "trademark_glyphs", input: "\u{1f3ae}\u{2122}", first: Some(&["\u{2122}"]), all: &[&["\u{2122}"]] },
    Vector { pattern: "trademark_glyphs", input: "TM", first: None, all: &[] },
    Vector { pattern: "whitespace_run", input: "a  b", first: Some(&["  "]), all: &[&["  "]] },
    Vector { pattern: "whitespace_run", input: "a\u{9}b", first: Some(&["\u{9}"]), all: &[&["\u{9}"]] },
    Vector { pattern: "whitespace_run", input: "a\u{a0}b", first: Some(&["\u{a0}"]), all: &[&["\u{a0}"]] },
    Vector { pattern: "whitespace_run", input: "a\u{feff}b", first: Some(&["\u{feff}"]), all: &[&["\u{feff}"]] },
    Vector { pattern: "whitespace_run", input: "a\u{85}b", first: None, all: &[] },
    Vector { pattern: "whitespace_run", input: "a\u{2028}b", first: Some(&["\u{2028}"]), all: &[&["\u{2028}"]] },
    Vector { pattern: "whitespace_run", input: "a\u{2029}b", first: Some(&["\u{2029}"]), all: &[&["\u{2029}"]] },
    Vector { pattern: "whitespace_run", input: "a\u{d}\u{a}b", first: Some(&["\u{d}\u{a}"]), all: &[&["\u{d}\u{a}"]] },
    Vector { pattern: "whitespace_run", input: "ab", first: None, all: &[] },
    Vector { pattern: "whitespace_run", input: " ", first: Some(&[" "]), all: &[&[" "]] },
    Vector { pattern: "whitespace_run", input: "\u{200b}", first: None, all: &[] },
    Vector { pattern: "whitespace_run", input: "a\u{3000}b", first: Some(&["\u{3000}"]), all: &[&["\u{3000}"]] },
    Vector { pattern: "whitespace_run", input: "a\u{1680}b", first: Some(&["\u{1680}"]), all: &[&["\u{1680}"]] },
    Vector { pattern: "whitespace_run", input: "a\u{180e}b", first: None, all: &[] },
    Vector { pattern: "whitespace_run", input: "a\u{202f}b", first: Some(&["\u{202f}"]), all: &[&["\u{202f}"]] },
    Vector { pattern: "whitespace_run", input: "a\u{205f}b", first: Some(&["\u{205f}"]), all: &[&["\u{205f}"]] },
    Vector { pattern: "whitespace_run", input: "a\u{2000}\u{200a}b", first: Some(&["\u{2000}\u{200a}"]), all: &[&["\u{2000}\u{200a}"]] },
    Vector { pattern: "whitespace_run", input: "a\u{b}b", first: Some(&["\u{b}"]), all: &[&["\u{b}"]] },
    Vector { pattern: "whitespace_run", input: "a\u{c}b", first: Some(&["\u{c}"]), all: &[&["\u{c}"]] },
    Vector { pattern: "trailing_punctuation", input: "Hello:", first: Some(&[":"]), all: &[&[":"]] },
    Vector { pattern: "trailing_punctuation", input: "Hi!?", first: Some(&["!?"]), all: &[&["!?"]] },
    Vector { pattern: "trailing_punctuation", input: "a-b-", first: Some(&["-"]), all: &[&["-"]] },
    Vector { pattern: "trailing_punctuation", input: "end.\u{a}", first: None, all: &[] },
    Vector { pattern: "trailing_punctuation", input: "x.\u{2028}", first: None, all: &[] },
    Vector { pattern: "trailing_punctuation", input: "NieR:Automata", first: None, all: &[] },
    Vector { pattern: "trailing_punctuation", input: "a.b.", first: Some(&["."]), all: &[&["."]] },
    Vector { pattern: "trailing_punctuation", input: "...", first: Some(&["..."]), all: &[&["..."]] },
    Vector { pattern: "trailing_punctuation", input: "", first: None, all: &[] },
    Vector { pattern: "trailing_punctuation", input: "abc", first: None, all: &[] },
    Vector { pattern: "trailing_punctuation", input: "a,", first: Some(&[","]), all: &[&[","]] },
    Vector { pattern: "trailing_punctuation", input: "a;;", first: Some(&[";;"]), all: &[&[";;"]] },
    Vector { pattern: "trailing_punctuation", input: "x?\u{d}\u{a}", first: None, all: &[] },
    Vector { pattern: "trailing_punctuation", input: "x?\u{feff}", first: None, all: &[] },
    Vector { pattern: "trailing_punctuation", input: "x?\u{85}", first: None, all: &[] },
    Vector { pattern: "trailing_punctuation", input: "-", first: Some(&["-"]), all: &[&["-"]] },
    Vector { pattern: "trailing_punctuation", input: "a-b", first: None, all: &[] },
];

fn captures_of(re: &Regex, input: &str) -> Option<Vec<String>> {
    re.captures(input).map(|caps| {
        caps.iter()
            .map(|group| {
                group.map_or_else(|| "<unmatched>".to_string(), |m| m.as_str().to_string())
            })
            .collect()
    })
}

#[test]
fn every_pattern_matches_what_the_javascript_engine_produced() {
    let all = regexes::all();
    for vector in VECTORS {
        let named = all
            .iter()
            .find(|n| n.name == vector.pattern)
            .unwrap_or_else(|| panic!("no pattern named {}", vector.pattern));
        let got_first = captures_of(named.regex, vector.input);
        let want_first: Option<Vec<String>> = vector
            .first
            .map(|groups| groups.iter().map(|g| g.to_string()).collect());
        assert_eq!(
            got_first, want_first,
            "{}: first match of {:?}",
            vector.pattern, vector.input
        );
        let got_all: Vec<Vec<String>> = named
            .regex
            .captures_iter(vector.input)
            .map(|caps| {
                caps.iter()
                    .map(|group| {
                        group.map_or_else(|| "<unmatched>".to_string(), |m| m.as_str().to_string())
                    })
                    .collect()
            })
            .collect();
        let want_all: Vec<Vec<String>> = vector
            .all
            .iter()
            .map(|m| m.iter().map(|g| g.to_string()).collect())
            .collect();
        assert_eq!(
            got_all, want_all,
            "{}: every match of {:?}",
            vector.pattern, vector.input
        );
    }
}

#[test]
fn every_pattern_of_the_ts_sources_is_present_with_at_least_four_inputs() {
    let all = regexes::all();
    assert_eq!(all.len(), PATTERN_COUNT);
    let mut names: Vec<&str> = all.iter().map(|n| n.name).collect();
    names.sort_unstable();
    names.dedup();
    assert_eq!(names.len(), PATTERN_COUNT, "a pattern name is used twice");
    for name in names {
        let count = VECTORS.iter().filter(|v| v.pattern == name).count();
        assert!(count >= 4, "{name} has {count} vector(s)");
        // The recorded inputs must include one that matches and one that does not, or the proof is one-sided.
        assert!(
            VECTORS
                .iter()
                .any(|v| v.pattern == name && v.first.is_some()),
            "{name} has no matching input"
        );
        assert!(
            VECTORS
                .iter()
                .any(|v| v.pattern == name && v.first.is_none()),
            "{name} has no non-matching input"
        );
    }
    // A vector for a pattern that does not exist would never run.
    for vector in VECTORS {
        assert!(
            all.iter().any(|n| n.name == vector.pattern),
            "{}",
            vector.pattern
        );
    }
}

/// The inputs that separate JS `.` and `\s` from the Rust defaults really do in this table: the guard
/// that the vectors are not all easy ones.
#[test]
fn the_vectors_include_the_inputs_the_two_engines_disagree_on() {
    for marker in ['\r', '\u{2028}', '\u{2029}', '\u{FEFF}', '\u{85}'] {
        assert!(
            VECTORS.iter().any(|v| v.input.contains(marker)),
            "no vector carries U+{:04X}",
            marker as u32
        );
    }
    assert!(VECTORS.iter().any(|v| v.input.contains("\r\n")));
}

/// Recorded in node 22: every UTF-16 code unit `c` for which `/^\s$/`, `/^.$/` (no) and `/^\d$/` match.
const JS_WHITESPACE: &[u32] = &[
    0x9, 0xA, 0xB, 0xC, 0xD, 0x20, 0xA0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005,
    0x2006, 0x2007, 0x2008, 0x2009, 0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF,
];
const JS_LINE_TERMINATORS: &[u32] = &[0xA, 0xD, 0x2028, 0x2029];

fn code_units() -> impl Iterator<Item = char> {
    (0u32..=0xFFFF).filter_map(char::from_u32)
}

#[test]
fn the_whitespace_class_is_the_javascript_s_over_every_code_unit() {
    let ws = Regex::new(&format!(r"\A[{WS}]\z")).unwrap();
    let not_ws = Regex::new(&format!(r"\A[^{WS}]\z")).unwrap();
    for c in code_units() {
        let text = c.to_string();
        let expected = JS_WHITESPACE.contains(&(c as u32));
        assert_eq!(ws.is_match(&text), expected, "U+{:04X}", c as u32);
        assert_eq!(not_ws.is_match(&text), !expected, "U+{:04X}", c as u32);
    }
}

#[test]
fn the_dot_class_is_the_javascript_dot_over_every_code_unit() {
    let dot = Regex::new(&format!(r"\A{DOT}\z")).unwrap();
    for c in code_units() {
        let expected = !JS_LINE_TERMINATORS.contains(&(c as u32));
        assert_eq!(dot.is_match(&c.to_string()), expected, "U+{:04X}", c as u32);
    }
}
