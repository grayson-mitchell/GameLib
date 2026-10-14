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

use serde_json::Value;

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

/// The Epic-only flags every `surface: 'epic'` nav state must carry -- `coerceNavState`
/// (`storeEmbedFlowRegistration.ts`) REQUIRES all three on an Epic event and rejects the event
/// otherwise.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub(crate) struct EpicEmbedNavFlags {
    pub(crate) load_timed_out: bool,
    pub(crate) challenged: bool,
    pub(crate) blocked_launcher_scheme_count: u64,
}

/// Merges `flags` onto a `nav_state_json()` object (review finding 2). The ONE merge both the
/// queued-event path (`EpicEmbedSurface::enqueue_nav_event`) and the direct-return path
/// (`back`/`forward`/`reload`/`navigate`) go through, so no Epic nav state can leave Rust without
/// the fields the renderer's coercion requires. A non-object is returned untouched.
pub(crate) fn epic_nav_state_with_flags(mut event: Value, flags: EpicEmbedNavFlags) -> Value {
    if let Some(map) = event.as_object_mut() {
        map.insert(
            "loadTimedOut".to_string(),
            Value::Bool(flags.load_timed_out),
        );
        map.insert("challenged".to_string(), Value::Bool(flags.challenged));
        map.insert(
            "blockedLauncherSchemeCount".to_string(),
            Value::Number(flags.blocked_launcher_scheme_count.into()),
        );
    }
    event
}

/// Which `WKNavigationDelegate` lifecycle hook is reporting the end of a navigation (G-50-16):
/// one variant per hook in `macos_epic_embed.rs` that can end a navigation and so is a candidate
/// to clear `load_timed_out`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum EpicEmbedNavLifecycle {
    ProvisionalNavigationStarted,
    NavigationFinished,
    NavigationFailed,
    ContentProcessTerminated,
}

/// Whether `event` may clear a `load_timed_out` raise (G-50-16: the banner never surfaced because
/// a navigation failure cleared the flag before the renderer's drain ever saw it raised). `false`
/// only for `NavigationFailed`: every navigation gets a `ProvisionalNavigationStarted` callback
/// first, and that hook already clears the flag, so the only state in which the failure hook
/// finds the flag SET is that the navigation which just failed is the one that timed out -- the
/// hang's own conclusion, for which the timeout banner (Reload / Open in browser) is the correct
/// UI, not a generic WebKit-failure message that gives the user no recovery action. This is the
/// Rust half of the fix; the renderer's intra-batch merge in `useStoreEmbedHost.ts`'s GAP-D drain
/// is the other half, and the one that actually makes the banner appear for the OBSERVED live
/// sequence -- raise, then the `-999` failure, then the next `ProvisionalNavigationStarted`, all
/// landing inside the renderer's same 250 ms drain batch. This change alone would still see only
/// that later, legitimate clear in that batch; the renderer half is necessary and sufficient, this
/// half is a real but secondary durability improvement (the case where the failure lands in a
/// LATER batch than the raise).
pub(crate) fn epic_embed_clears_load_timeout(event: EpicEmbedNavLifecycle) -> bool {
    !matches!(event, EpicEmbedNavLifecycle::NavigationFailed)
}

/// Review finding 12: KVO on `URL`/`canGoBack`/`canGoForward` fires once per key for one
/// same-document navigation (three callbacks for one `history.pushState`), and again for every
/// ordinary navigation the delegate callbacks already report. Skipping an event identical to the
/// newest one already queued keeps the observer from flooding the bounded ring with duplicates;
/// the ring's own oldest-dropped cap stays the hard bound.
pub(crate) fn epic_kvo_event_is_new(last_queued: Option<&Value>, event: &Value) -> bool {
    last_queued != Some(event)
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

    // Finding 2: the direct-return nav state must carry exactly the fields `coerceNavState`
    // requires on a `surface: 'epic'` event.
    #[test]
    fn the_flag_merge_adds_all_three_epic_fields() {
        let base = serde_json::json!({
            "url": "https://store.epicgames.com/en-US/",
            "host": "store.epicgames.com",
            "canGoBack": true,
            "canGoForward": false,
            "surface": "epic",
        });
        let merged = epic_nav_state_with_flags(
            base,
            EpicEmbedNavFlags {
                load_timed_out: true,
                challenged: false,
                blocked_launcher_scheme_count: 2,
            },
        );
        assert_eq!(
            merged,
            serde_json::json!({
                "url": "https://store.epicgames.com/en-US/",
                "host": "store.epicgames.com",
                "canGoBack": true,
                "canGoForward": false,
                "surface": "epic",
                "loadTimedOut": true,
                "challenged": false,
                "blockedLauncherSchemeCount": 2,
            })
        );
    }

    #[test]
    fn the_flag_merge_leaves_a_non_object_untouched() {
        assert_eq!(
            epic_nav_state_with_flags(Value::Null, EpicEmbedNavFlags::default()),
            Value::Null
        );
    }

    // G-50-16: a provisional-navigation-start is every navigation's own fresh-start signal and
    // already clears the flag unconditionally (D-11), so it must stay clearing here too.
    #[test]
    fn a_provisional_navigation_start_clears_a_timeout_raise() {
        assert!(epic_embed_clears_load_timeout(
            EpicEmbedNavLifecycle::ProvisionalNavigationStarted
        ));
    }

    // A genuine finish must drop the banner (D-07) -- a slow-but-eventually-successful load is
    // not a hang.
    #[test]
    fn a_navigation_finish_clears_a_timeout_raise() {
        assert!(epic_embed_clears_load_timeout(
            EpicEmbedNavLifecycle::NavigationFinished
        ));
    }

    // The one asymmetry this fix adds: a navigation failure must NOT clear the raise, because the
    // only navigation a failure hook can be reporting on is the one the monitor already timed
    // out, and the banner is the correct UI for that outcome.
    #[test]
    fn a_navigation_failure_does_not_clear_a_timeout_raise() {
        assert!(!epic_embed_clears_load_timeout(
            EpicEmbedNavLifecycle::NavigationFailed
        ));
    }

    // Content-process termination re-arms the clock like a fresh provisional start (it bumps
    // `nav_generation` too), so it clears the flag like one.
    #[test]
    fn a_content_process_termination_clears_a_timeout_raise() {
        assert!(epic_embed_clears_load_timeout(
            EpicEmbedNavLifecycle::ContentProcessTerminated
        ));
    }

    #[test]
    fn a_kvo_event_identical_to_the_newest_queued_one_is_not_new() {
        let event = serde_json::json!({ "url": "https://store.epicgames.com/p/a" });
        assert!(!epic_kvo_event_is_new(Some(&event), &event));
    }

    #[test]
    fn a_kvo_event_with_a_changed_url_or_an_empty_queue_is_new() {
        let old = serde_json::json!({ "url": "https://store.epicgames.com/p/a" });
        let new = serde_json::json!({ "url": "https://store.epicgames.com/p/b" });
        assert!(epic_kvo_event_is_new(Some(&old), &new));
        assert!(epic_kvo_event_is_new(None, &new));
    }
}
