//! `getCrossoverBottleFolder` (`launcher.ts`): the folder of a game's CrossOver bottle, read from the
//! verbose output of a `whoami` the bottle runs, so a third-party-managed game's log can say where it lives.
//!
//! The command is `<crossover wine> --bottle <bottle> --verbose whoami` through gamelib-wine's
//! `run_wine_command` with the prefix check skipped (a Helper spawn through the context's runner, D-21), and
//! `WINEPREFIX = "<folder>"` is read off its stderr. Any failure, a command that did not run or one whose
//! output has no such line, is `None`; nothing is logged.

use gamelib_wine::ctx::WineCtx;
use gamelib_wine::wine_cmd::command::{run_wine_command, WineCommandArgs};
use gamelib_wine::wine_cmd::env::GameSettingsView;
use gamelib_wine::wine_cmd::WineHost;

/// The line terminators JavaScript's `.` does not match.
fn is_line_terminator(c: char) -> bool {
    matches!(c, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

/// `stderr.match(/WINEPREFIX = "(.*)"\n/)?.[1]`: the first `WINEPREFIX = "` whose line ends in `"` and a
/// line feed. `.*` cannot cross a line terminator, so the closing quote has to be the last character before
/// the first terminator after the opening one, and that terminator has to be `\n` itself (a `\r\n` line, or
/// a final line with no terminator, does not match).
pub fn parse_bottle_folder(stderr: &str) -> Option<String> {
    const OPEN: &str = "WINEPREFIX = \"";
    let mut from = 0;
    while let Some(at) = stderr[from..].find(OPEN) {
        let start = from + at + OPEN.len();
        let rest = &stderr[start..];
        if let Some(end) = rest.find(is_line_terminator) {
            if rest[end..].starts_with('\n') && rest[..end].ends_with('"') {
                return Some(rest[..end - 1].to_string());
            }
        }
        from += at + 1;
    }
    None
}

/// The bottle folder of `settings` (its `wineCrossoverBottle`), or `None`.
pub async fn crossover_bottle_folder(
    ctx: &WineCtx,
    settings: &GameSettingsView,
    host: &WineHost,
) -> Option<String> {
    let args = WineCommandArgs {
        game_settings: Some(settings.clone()),
        command_parts: vec![
            "--bottle".to_string(),
            settings.wine_crossover_bottle.clone(),
            // So it prints the WINEPREFIX env value.
            "--verbose".to_string(),
            // `whoami`, because a command has to be called.
            "whoami".to_string(),
        ],
        skip_prefix_check: true,
        ..WineCommandArgs::default()
    };
    let result = run_wine_command(ctx, args, host).await;
    parse_bottle_folder(&result.stderr)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_folder_is_the_quoted_value_on_a_line_that_ends_in_a_line_feed() {
        assert_eq!(
            parse_bottle_folder("cx: starting\nWINEPREFIX = \"/b/Bottle1\"\ncx: done\n"),
            Some("/b/Bottle1".to_string())
        );
        // The first matching line wins.
        assert_eq!(
            parse_bottle_folder("WINEPREFIX = \"/a\"\nWINEPREFIX = \"/b\"\n"),
            Some("/a".to_string())
        );
        // An empty folder is a match, as `(.*)` matches nothing.
        assert_eq!(
            parse_bottle_folder("WINEPREFIX = \"\"\n"),
            Some(String::new())
        );
        // The greedy group runs to the last quote on the line.
        assert_eq!(
            parse_bottle_folder("WINEPREFIX = \"/a\" \"/b\"\n"),
            Some("/a\" \"/b".to_string())
        );
    }

    #[test]
    fn a_line_without_a_closing_quote_and_line_feed_is_no_match() {
        for text in [
            "",
            "cx: starting\ncx: done\n",
            // The recorded quirk: the last line has no line feed.
            "cx: starting\nWINEPREFIX = \"/b/Bottle1\"",
            "WINEPREFIX = \"/b\"\r\n",
            "WINEPREFIX = \"/b\u{2028}\"\n",
            "WINEPREFIX = /b\n",
            "WINEPREFIX = \"/b\n\"\n",
        ] {
            assert_eq!(parse_bottle_folder(text), None, "{text:?}");
        }
        // A bad line does not hide a good one after it.
        assert_eq!(
            parse_bottle_folder("WINEPREFIX = \"/x\r\nWINEPREFIX = \"/ok\"\n"),
            Some("/ok".to_string())
        );
    }
}
