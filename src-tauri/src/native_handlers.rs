//! Handlers the Rust native router serves (Phase 83, D-01). One pure function per channel; the
//! router in `native_router.rs` is glue only.
//!
//! D-07: the Rust positional args type is the schema authority for a native channel. Its shape is
//! described, and its accept/reject vectors are pinned, in
//! `src/common/types/ipc/nativeChannels.json`.

use crate::native_router::invalid_args;
use serde_json::Value;

/// The app version the shell was built as. The shell, `package.json` and `tauri.conf.json` agree
/// on it (plan 83-05 adds the parity gate), so this is what the renderer's About screen shows.
pub(crate) fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// Positional args of `getHeroicVersion`: none. A zero-field tuple struct reads only the empty
/// array, so any extra element is rejected by length before the handler body runs.
#[derive(serde::Deserialize)]
struct GetHeroicVersionArgs();

/// `getHeroicVersion` (invoke): answers the app version from the compiled-in crate version.
pub(crate) fn get_heroic_version(args: &[Value]) -> Result<Value, String> {
    serde_json::from_value::<GetHeroicVersionArgs>(Value::Array(args.to_vec()))
        .map_err(|_| invalid_args("getHeroicVersion", &["(args)"], &["too_big"]))?;
    Ok(Value::String(app_version().to_string()))
}
