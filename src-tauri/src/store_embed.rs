use super::*;

mod controls;
pub(crate) use controls::*;

mod layout;
pub(crate) use layout::*;

mod open;
pub(crate) use open::*;

mod policy;
pub(crate) use policy::*;

mod state;
pub(crate) use state::*;

// ---- In-app store/wiki embed (Phase 40 Plan 02, D-01/D-03/D-17/D-18/D-21) ----
//
// A single child webview, created via the `unstable`-gated child-window constructor (see the
// one call site inside `store_embed_open` below) on the existing config-created `main` window
// (no window restructuring on macOS -- D-01). Every symbol below is macOS + Linux + Windows only
// per D-03's target-gated `unstable` feature (`src-tauri/Cargo.toml`: a macOS table, since quick
// 260930-blh a Linux table, and since quick 261012-f25 a Windows table); on Linux the layout is
// the application's own gtk Overlay/Fixed (`linux_store_embed_layout`, todo decision (a), spikes
// 028/029). Windows uses the macOS positioning path (`set_position`/`set_size`): spike 027 found
// WebView2 child webviews are real `WS_CHILD` HWNDs positioned by an unconditional
// `SetWindowPos`. A target outside those three gets a legible `:unsupported-platform` error from
// the dispatch arms below rather than compiling this section out silently (a silently-absent
// arm is indistinguishable from a dead channel); no shipped target compiles those arms.
//
// The API surface this section is written against was verified from vendored crate source, not
// documentation, in `40-EMBED-API-VERIFICATION.md` (D-25) -- most importantly: neither
// `tauri::webview::Webview` nor wry's `WebView` expose any back/forward/history method, so the
// `StoreEmbedState` history stack below (D-22) is the mechanism, not a fallback.
