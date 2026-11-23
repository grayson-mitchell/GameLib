//! The renderer pushes of the engine state (`engineStateChanged`, Phase 59 D-10) and the three notices
//! that re-push the last published state with a fresh `seq`: the overlay-setup failure, the overlay
//! exit and the launch deadline.
//!
//! Each notice answers whether it published. It never throws: the game launches regardless (D-08), and
//! the renderer push is one-way, so a push that does not arrive cannot fail the launch. A notice for a
//! title nothing was published for yet answers `false` and pushes nothing.

use serde_json::Value;

use crate::ctx::EngineCtx;
use crate::key::engine_key_for;
use crate::state::engine_state::{DeadlineNotice, EngineState, ExitNotice, OverlayNotice};

/// The renderer channel.
pub const ENGINE_STATE_CHANGED: &str = "engineStateChanged";

/// The closed overlay-setup step union (`OverlayNoticeStep`).
pub const OVERLAY_STEPS: [&str; 6] = [
    "steam-dylibs",
    "shim",
    "crossover-detect",
    "clone",
    "resign",
    "env",
];

/// The longest launch-deadline title, in UTF-16 units (a title is a display label, T-61-27).
const DEADLINE_TITLE_MAX: usize = 200;

/// Pushes one state as `engineStateChanged`, the same payload and channel the sidecar relayed.
pub fn emit_engine_state(ctx: &EngineCtx, state: &EngineState) {
    ctx.emitter
        .emit(ENGINE_STATE_CHANGED, vec![state.to_value()]);
}

fn republish(
    ctx: &EngineCtx,
    runner: &str,
    app_name: &str,
    change: impl FnOnce(&mut EngineState, u64),
) -> bool {
    let Some(key) = engine_key_for(runner, app_name) else {
        return false;
    };
    let Some(state) = ctx.engine_state.republish(&key, change) else {
        return false;
    };
    emit_engine_state(ctx, &state);
    true
}

/// Phase 60 G4 / D-09: an in-app overlay-unavailable notice for the step that failed. Re-pushes the last
/// published state with a fresh `seq` (the shared counter), so the renderer shows it once per failure,
/// never deduplicated. A step outside the closed union publishes nothing.
pub fn publish_overlay_notice(ctx: &EngineCtx, runner: &str, app_name: &str, step: &str) -> bool {
    if !OVERLAY_STEPS.contains(&step) {
        return false;
    }
    let step = step.to_string();
    republish(ctx, runner, app_name, move |state, seq| {
        state.overlay_notice = Some(OverlayNotice { step, seq });
    })
}

/// Quick 261105-ast: an in-app "game closed soon after starting" notice for an overlay launch that
/// exited abnormally. Never retries and never changes settings (D-10).
pub fn publish_overlay_exit_notice(ctx: &EngineCtx, runner: &str, app_name: &str) -> bool {
    republish(ctx, runner, app_name, |state, seq| {
        state.exit_notice = Some(ExitNotice { seq });
    })
}

/// Plan 61-27 (WR-02): "couldn't confirm the game started" as an in-app toast. Nothing is stopped. The
/// title is cut to 200 UTF-16 units, at a character boundary.
pub fn publish_launch_deadline_notice(
    ctx: &EngineCtx,
    runner: &str,
    app_name: &str,
    title: &str,
    seconds: Value,
) -> bool {
    let mut units = 0;
    let title: String = title
        .chars()
        .take_while(|c| {
            units += c.len_utf16();
            units <= DEADLINE_TITLE_MAX
        })
        .collect();
    republish(ctx, runner, app_name, move |state, seq| {
        state.deadline_notice = Some(DeadlineNotice {
            title,
            seconds,
            seq,
        });
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bottles::registry::EngineSelection;
    use crate::config::{EffectiveEngine, EngineSource};
    use crate::ctx::{EnginePaths, Platform};
    use crate::decision::launch::{LaunchDecision, LaunchUse};
    use crate::state::engine_state::{record_launch_decision, GameFacts};
    use crate::testing::{FixedClock, RecordingEmitter};
    use gamelib_core::shutdown::Shutdown;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use serde_json::json;
    use std::sync::Arc;

    fn published(home: &FakeHome) -> (EngineCtx, Arc<RecordingEmitter>) {
        let root = home.root().to_path_buf();
        let emitter = Arc::new(RecordingEmitter::new());
        let ctx = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(FixedClock::new(1)),
            Platform::Mac,
            EnginePaths {
                app_folder: root.clone(),
                user_data: root.join("userData"),
                tools_path: root.join("tools"),
                user_home: root.clone(),
                temp: root.join("tmp"),
            },
            Shutdown::new(),
        )
        .with_emitter(emitter.clone());
        let facts = GameFacts {
            bottle: Some("b".to_string()),
            state_without_bottle: false,
            override_eligible: true,
            overlay_eligible: false,
            wine_tools_eligible: false,
            effective: EffectiveEngine::Override {
                id: "automatic".to_string(),
                source: EngineSource::Derived,
            },
            prefix_kind: None,
            per_game_bottle_name: None,
        };
        let decision = LaunchDecision::Use(Box::new(LaunchUse {
            selection: EngineSelection::Crossover {
                reason: "cx-healthy".to_string(),
                crossover_build: None,
                bin_dir: "/cx/bin".to_string(),
            },
            preflight: None,
            pin: None,
            needs_download: false,
            override_id: "automatic".to_string(),
            log_lines: Vec::new(),
        }));
        record_launch_decision(&ctx, "legendary", "game-a", &decision, "b", &facts);
        (ctx, emitter)
    }

    #[test]
    fn a_deadline_title_is_cut_to_200_utf16_units_at_a_character_boundary() {
        let home = FakeHome::new("engine-publish-title-");
        let (ctx, emitter) = published(&home);
        // 99 astral characters are 198 units; the 100th would make 200, the 101st 202.
        let title = "\u{1F600}".repeat(101);
        assert!(publish_launch_deadline_notice(
            &ctx,
            "legendary",
            "game-a",
            &title,
            json!(90)
        ));
        let pushed = emitter.pushed();
        let cut = pushed.last().unwrap().1[0]["deadlineNotice"]["title"]
            .as_str()
            .unwrap()
            .to_string();
        assert_eq!(cut.chars().count(), 100);
        assert_eq!(cut.encode_utf16().count(), 200);
        assert_eq!(
            pushed.last().unwrap().1[0]["deadlineNotice"]["seconds"],
            json!(90)
        );
    }

    #[test]
    fn a_notice_for_a_title_nothing_was_published_for_answers_false_and_pushes_nothing() {
        let home = FakeHome::new("engine-publish-none-");
        let (ctx, emitter) = published(&home);
        let before = emitter.pushed().len();
        assert!(!publish_overlay_notice(&ctx, "legendary", "other", "shim"));
        assert!(!publish_overlay_exit_notice(&ctx, "legendary", "other"));
        assert!(!publish_launch_deadline_notice(
            &ctx,
            "nope",
            "x",
            "t",
            json!(1)
        ));
        // A step outside the closed union is not a notice.
        assert!(!publish_overlay_notice(
            &ctx,
            "legendary",
            "game-a",
            "bogus"
        ));
        assert_eq!(emitter.pushed().len(), before);
        assert!(publish_overlay_notice(
            &ctx,
            "legendary",
            "game-a",
            "resign"
        ));
        assert_eq!(emitter.pushed().len(), before + 1);
    }

    #[test]
    fn the_state_push_is_the_engine_state_changed_channel_with_one_payload() {
        let home = FakeHome::new("engine-publish-channel-");
        let (_ctx, emitter) = published(&home);
        let pushed = emitter.pushed();
        assert_eq!(pushed.len(), 1);
        assert_eq!(pushed[0].0, "engineStateChanged");
        assert_eq!(pushed[0].1.len(), 1);
        let state = pushed[0].1[0].as_object().unwrap();
        // The 23 keys of the TS payload, none dropped for a null.
        assert_eq!(state.len(), 23, "{:?}", state.keys().collect::<Vec<_>>());
        assert_eq!(state["engineLabel"], json!("CrossOver"));
    }
}
