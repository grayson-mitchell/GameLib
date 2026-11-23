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
