//! Pure gate for the macOS raw Epic `WKWebView`'s JS `alert`/`confirm`/`prompt` sheets (Phase 50
//! review of D-13).
//!
//! D-13 is a recorded user decision (`50-DISCUSSION-LOG.md`, "Native NSAlert via the shipped
//! helpers", chosen over "Suppress (return defaults)"), so this surface keeps native dialogs
//! rather than matching wry's ignore-every-dialog behaviour -- the wry-parity answer is what a
//! REFUSED dialog gets instead (alert completes, confirm is `false`, prompt is `nil`). What the
//! review found unsafe was the shape of the shipped helpers when fed by an ordinary store page:
//! app-modal `runModal()`, any frame, page-controlled text with no origin, no rate limit, even
//! while the surface was hidden. So a dialog is shown only when ALL of these hold: it comes from
//! the main frame; the surface is visible; no other dialog is open; and at least
//! `EPIC_EMBED_JS_DIALOG_MIN_GAP` has passed since the last one was dismissed (an `alert()` loop
//! re-fires the instant a sheet closes -- measuring from dismissal leaves the user a window to
//! switch away, which hides the surface and so refuses the rest). The sheet is attached to the
//! main window (window-modal, not app-modal), titled with the page's origin, and its page text is
//! capped. The pristine login window keeps the shipped `present_native_js_*` helpers unchanged --
//! its login-seam pages are not arbitrary store content.
//!
//! Not cfg-gated: `macos_epic_embed.rs` is, so the decisions its `WKUIDelegate` dialog hooks
//! make live here, where `cargo test` can cover them on Linux.
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use std::time::{Duration, Instant};

/// Cap on the page-supplied text a dialog shows -- page-controlled content in a native panel.
pub(crate) const JS_DIALOG_MESSAGE_MAX_CHARS: usize = 1000;

/// Minimum quiet period after a dialog is dismissed before the next may be shown.
pub(crate) const EPIC_EMBED_JS_DIALOG_MIN_GAP: Duration = Duration::from_secs(3);

/// Admission state for the Epic surface's JS dialogs: whether one is open, and when the last one
/// was dismissed. Pure apart from its own fields, like `HandoffThrottle` (main.rs).
#[derive(Debug, Default)]
pub(crate) struct JsDialogGate {
    open: bool,
    last_closed: Option<Instant>,
}

impl JsDialogGate {
    pub(crate) const fn new() -> Self {
        Self {
            open: false,
            last_closed: None,
        }
    }

    /// Whether a dialog may be shown now; marks it open if so. A refusal changes nothing, so it
    /// neither extends the gap nor occupies the one open slot.
    pub(crate) fn admit(
        &mut self,
        is_main_frame: bool,
        surface_visible: bool,
        now: Instant,
        min_gap: Duration,
    ) -> bool {
        if !is_main_frame || !surface_visible || self.open {
            return false;
        }
        if let Some(last) = self.last_closed {
            if now.saturating_duration_since(last) < min_gap {
                return false;
            }
        }
        self.open = true;
        true
    }

    /// Records that the admitted dialog was dismissed at `now`.
    pub(crate) fn close(&mut self, now: Instant) {
        self.open = false;
        self.last_closed = Some(now);
    }
}

/// The origin shown as a dialog's title, from the page's (main frame's) URL: `scheme://host[:port]`
/// for `http`/`https`, `None` for anything else. `None` means the dialog is refused -- a page
/// whose origin cannot be shown does not get to speak through a native panel.
pub(crate) fn js_dialog_origin_label(page_url: &str) -> Option<String> {
    let parsed = tauri::Url::parse(page_url).ok()?;
    match parsed.scheme() {
        "http" | "https" if parsed.host_str().is_some() => {
            Some(parsed.origin().ascii_serialization())
        }
        _ => None,
    }
}

/// The page-supplied dialog text as shown: at most `JS_DIALOG_MESSAGE_MAX_CHARS` characters, with
/// a trailing ellipsis when cut.
pub(crate) fn js_dialog_message_text(message: &str) -> String {
    if message.chars().count() <= JS_DIALOG_MESSAGE_MAX_CHARS {
        return message.to_string();
    }
    let mut cut: String = message.chars().take(JS_DIALOG_MESSAGE_MAX_CHARS).collect();
    cut.push('\u{2026}');
    cut
}

#[cfg(test)]
mod js_dialog_gate_tests {
    use super::*;

    const GAP: Duration = EPIC_EMBED_JS_DIALOG_MIN_GAP;

    #[test]
    fn a_main_frame_dialog_on_a_visible_surface_is_admitted() {
        let mut gate = JsDialogGate::new();
        assert!(gate.admit(true, true, Instant::now(), GAP));
    }

    #[test]
    fn a_subframe_dialog_is_never_admitted() {
        let mut gate = JsDialogGate::new();
        assert!(!gate.admit(false, true, Instant::now(), GAP));
    }

    #[test]
    fn a_dialog_from_a_hidden_surface_is_never_admitted() {
        let mut gate = JsDialogGate::new();
        assert!(!gate.admit(true, false, Instant::now(), GAP));
    }

    #[test]
    fn only_one_dialog_is_open_at_a_time() {
        let mut gate = JsDialogGate::new();
        let t0 = Instant::now();
        assert!(gate.admit(true, true, t0, GAP));
        assert!(!gate.admit(true, true, t0 + GAP * 10, GAP));
    }

    #[test]
    fn the_next_dialog_waits_out_the_gap_after_the_last_was_dismissed() {
        let mut gate = JsDialogGate::new();
        let t0 = Instant::now();
        assert!(gate.admit(true, true, t0, GAP));
        gate.close(t0 + Duration::from_secs(10));
        // An `alert()` loop re-fires the instant the sheet closes: refused...
        assert!(!gate.admit(true, true, t0 + Duration::from_secs(10), GAP));
        assert!(!gate.admit(true, true, t0 + Duration::from_secs(12), GAP));
        // ...until the gap has passed, measured from the DISMISSAL, not the presentation.
        assert!(gate.admit(true, true, t0 + Duration::from_secs(13), GAP));
    }

    #[test]
    fn a_refused_dialog_does_not_restart_the_gap() {
        let mut gate = JsDialogGate::new();
        let t0 = Instant::now();
        assert!(gate.admit(true, true, t0, GAP));
        gate.close(t0);
        assert!(!gate.admit(true, true, t0 + Duration::from_secs(2), GAP));
        assert!(gate.admit(true, true, t0 + GAP, GAP));
    }

    #[test]
    fn the_origin_label_is_the_page_origin_for_http_and_https() {
        assert_eq!(
            js_dialog_origin_label("https://store.epicgames.com/en-US/p/x?y=1#z").as_deref(),
            Some("https://store.epicgames.com")
        );
        assert_eq!(
            js_dialog_origin_label("http://example.com:8080/a").as_deref(),
            Some("http://example.com:8080")
        );
    }

    #[test]
    fn no_origin_label_means_no_dialog_for_opaque_or_unparsable_pages() {
        for url in [
            "",
            "about:blank",
            "data:text/html,x",
            "not a url",
            "file:///tmp/x",
        ] {
            assert_eq!(js_dialog_origin_label(url), None, "{url:?}");
        }
    }

    #[test]
    fn the_page_text_is_capped() {
        let long = "x".repeat(10_000);
        let shown = js_dialog_message_text(&long);
        assert!(shown.chars().count() <= JS_DIALOG_MESSAGE_MAX_CHARS + 1);
        assert!(shown.ends_with('\u{2026}'));
        assert_eq!(js_dialog_message_text("short"), "short");
    }

    /// Source-text check (the glue is macOS-only and cannot be compiled here): every Epic dialog
    /// hook goes through the gate and a sheet, never the app-modal `runModal()` helpers.
    #[test]
    fn the_epic_dialog_hooks_use_the_gate_and_a_sheet_not_run_modal() {
        let source = include_str!("macos_epic_embed.rs");
        assert!(!source.contains("present_native_js_"));
        assert!(!source.contains(".runModal("));
        for kind in ["alert", "confirm", "prompt"] {
            assert!(
                source.contains(&format!(
                    "epic_embed_js_dialog_admit(webview, frame, \"{kind}\")"
                )),
                "{kind} hook must consult the gate"
            );
        }
        assert!(source.contains("beginSheetModalForWindow_completionHandler"));
    }
}
