//! The CodeWeavers slug (Phase 86, SVC-01), `src/backend/wiki_game_info/codeweavers/utils.ts`. The page
//! scrape the module once held is gone (Cloudflare answers it with 403); what is left is the slug, the
//! URL segment CodeWeavers' compatibility pages use, and CrossOver ratings come from the index.
//!
//! 86-19 ported the one slug function for the index lookup (`crossover::normalize::slugify`: apostrophes
//! dropped, roman numerals verbatim, any other run of non-alphanumerics one hyphen, ASCII-only output),
//! and the wiki reads that same function: there is no second port. This module is where the wiki finds it,
//! and its test replays every vector of the TS `slugify` test file against it.

pub use crate::crossover::normalize::slugify;

#[cfg(test)]
mod tests {
    use super::slugify;

    /// Every case of `codeweavers/__tests__/utils.test.ts`.
    #[test]
    fn slugify_matches_every_vector_of_the_ts_test_file() {
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
        ] {
            assert_eq!(slugify(title), slug, "{title}");
        }
    }

    /// The output is always `[a-z0-9-]`, so a crafted title cannot inject a path segment or change host
    /// when it is appended to the CodeWeavers compatibility URL (T-16-01).
    #[test]
    fn the_slug_cannot_carry_a_path_segment_or_a_host() {
        for title in [
            "../../etc/passwd",
            "a/b?c=d#e",
            "evil.example.com\\x",
            "https://example.com/",
            "\u{202e}rtl\u{200b}",
            "a\u{0}b",
        ] {
            let slug = slugify(title);
            assert!(
                slug.bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-'),
                "{title:?} -> {slug:?}"
            );
            assert!(!slug.starts_with('-') && !slug.ends_with('-'), "{slug:?}");
        }
    }
}
