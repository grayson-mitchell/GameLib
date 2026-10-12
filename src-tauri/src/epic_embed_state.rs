//! Phase 50 review fixes: the Epic surface's selection/visibility state machine and its nav-state
//! flag merge, as plain data with NO objc2, NO `AppHandle` and NO `cfg(target_os)` gate -- so
//! `cargo test` runs every transition on Linux, where `macos_epic_embed.rs` (macOS-only by its own
//! `#![cfg]`) never even compiles. That module keeps only the thin AppKit glue: it asks this one
//! for the answer and applies it with a single `setHidden` writer.
//!
//! **Why visibility is DERIVED, not stored** (review findings 5 and 7, correcting D-10's first
//! cut): the raw `WKWebView`'s `hidden` flag used to have two independent writers -- the
//! renderer's `hide()`/`show()`/warm `open()` (the user's tab state) and the challenge hook's
//! Rust-owned hide (D-10). Each overwrote the other: `show()` re-revealed a challenged page over
//! the `'epic-challenged'` panel, and a challenge the page cleared by navigating itself away left
//! the surface hidden with nothing to un-hide it. Here the two causes are separate inputs
//! (`user_hidden`, `challenged`) plus `selected` (D-02), and `hidden()` is the only answer anyone
//! applies -- so neither cause can undo the other.

/// The three inputs the Epic subview's visibility is derived from. Every transition returns the
/// resulting `hidden()` so the caller applies it in the SAME main-thread step that changed the
/// state (review finding 13: `selected` and the visible flag must never be observed out of step).
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub(crate) struct EpicEmbedVisibility {
    /// D-02: the Epic surface is the store embed the slot currently shows.
    selected: bool,
    /// The renderer's own `hide()` (occlusion, modal, route leave) -- cleared by `show()` and by
    /// `open()`.
    user_hidden: bool,
    /// D-09/D-10: the current main-frame response was a Cloudflare challenge. Cleared by the next
    /// main-frame navigation start and by a chrome `navigate()` (D-11: every load starts fresh).
    challenged: bool,
}

impl EpicEmbedVisibility {
    pub(crate) fn selected(&self) -> bool {
        self.selected
    }

    pub(crate) fn challenged(&self) -> bool {
        self.challenged
    }

    /// The ONE visibility answer: hidden when not the selected surface, when the renderer hid it,
    /// or while a challenge is up (D-10 -- the panel, not the challenge page, owns the slot).
    pub(crate) fn hidden(&self) -> bool {
        !self.selected || self.user_hidden || self.challenged
    }

    /// Cold or warm `open()`: selects the surface and clears the renderer's own hide. A standing
    /// challenge still keeps it hidden -- `open()` decides separately whether to reload it.
    pub(crate) fn open(&mut self) -> bool {
        self.selected = true;
        self.user_hidden = false;
        self.hidden()
    }

    pub(crate) fn hide(&mut self) -> bool {
        self.user_hidden = true;
        self.hidden()
    }

    pub(crate) fn show(&mut self) -> bool {
        self.user_hidden = false;
        self.hidden()
    }

    /// D-02 store switch away from Epic. `None` when the surface was not selected (a no-op the
    /// caller must not turn into a `setHidden` call), else the resulting `hidden()` (always
    /// `true`).
    pub(crate) fn deselect(&mut self) -> Option<bool> {
        if !self.selected {
            return None;
        }
        self.selected = false;
        Some(self.hidden())
    }

    pub(crate) fn set_challenged(&mut self, challenged: bool) -> bool {
        self.challenged = challenged;
        self.hidden()
    }

    /// `close()`: the surface is gone; the next cold `open()` starts from nothing.
    pub(crate) fn reset(&mut self) {
        *self = Self::default();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opened() -> EpicEmbedVisibility {
        let mut state = EpicEmbedVisibility::default();
        state.open();
        state
    }

    #[test]
    fn a_never_opened_surface_is_hidden_and_unselected() {
        let state = EpicEmbedVisibility::default();
        assert!(state.hidden());
        assert!(!state.selected());
    }

    #[test]
    fn open_selects_and_shows() {
        let mut state = EpicEmbedVisibility::default();
        assert!(!state.open());
        assert!(state.selected());
    }

    #[test]
    fn hide_then_show_round_trips() {
        let mut state = opened();
        assert!(state.hide());
        assert!(!state.show());
    }

    // Finding 5: `show()` used to `setHidden(false)` unconditionally, re-revealing the challenge
    // page over the `'epic-challenged'` panel.
    #[test]
    fn show_does_not_reveal_a_challenged_surface() {
        let mut state = opened();
        assert!(state.set_challenged(true));
        state.hide();
        assert!(
            state.show(),
            "a challenge keeps the surface hidden through show()"
        );
    }

    // Finding 5, warm-`open()` half.
    #[test]
    fn warm_open_does_not_reveal_a_challenged_surface() {
        let mut state = opened();
        state.set_challenged(true);
        assert!(state.open());
    }

    // Finding 7: a challenge the page clears by navigating itself away must un-hide the surface
    // it hid -- previously nothing did.
    #[test]
    fn clearing_the_challenge_un_hides_a_selected_shown_surface() {
        let mut state = opened();
        assert!(state.set_challenged(true));
        assert!(!state.set_challenged(false));
    }

    #[test]
    fn clearing_the_challenge_does_not_un_hide_a_user_hidden_surface() {
        let mut state = opened();
        state.set_challenged(true);
        state.hide();
        assert!(state.set_challenged(false));
    }

    #[test]
    fn clearing_the_challenge_does_not_un_hide_a_deselected_surface() {
        let mut state = opened();
        state.set_challenged(true);
        state.deselect();
        assert!(state.set_challenged(false));
    }

    // Finding 13: deselect reports the hide AND the selection change as one transition.
    #[test]
    fn deselect_of_a_selected_surface_hides_and_unselects_in_one_step() {
        let mut state = opened();
        assert_eq!(state.deselect(), Some(true));
        assert!(!state.selected());
    }

    #[test]
    fn deselect_of_an_unselected_surface_is_a_no_op() {
        let mut state = EpicEmbedVisibility::default();
        assert_eq!(state.deselect(), None);
        assert_eq!(state, EpicEmbedVisibility::default());
    }

    #[test]
    fn re_open_after_deselect_shows_again() {
        let mut state = opened();
        state.deselect();
        assert!(!state.open());
    }

    #[test]
    fn reset_forgets_a_challenge() {
        let mut state = opened();
        state.set_challenged(true);
        state.reset();
        assert!(!state.challenged());
        assert!(!state.open());
    }
}
