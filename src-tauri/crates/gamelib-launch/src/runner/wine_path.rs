//! `getWinePath` as a runner op (88.2-13, D-02): a path translated by `winepath` inside a game's prefix.
//!
//! The work is 88.1-13's [`get_wine_path`] (`cmd /c winepath -u|-w <path>` through the wine command core with
//! the `runinprefix` verb, a Helper spawn): this module is the op's argument shape and nothing else. Its
//! empty-answer error line is 88.1's fixed text (the TS line carried the path asked about and `winepath`'s own
//! standard error, which can name a profile path), recorded in `golden/wine_path/deltas.json` as
//! `wine-path-error-line`.

use gamelib_wine::wine_cmd::env::GameSettingsView;
use gamelib_wine::wine_cmd::WineHost;
use serde::Deserialize;

use crate::ctx::LaunchCtx;
use crate::prepare::wine_path::{get_wine_path, PathVariant};

/// Which side `winepath` converts to, as the TS spells it (`'win' | 'unix'`, `'unix'` when absent).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VariantArg {
    #[default]
    Unix,
    Win,
}

impl From<VariantArg> for PathVariant {
    fn from(variant: VariantArg) -> PathVariant {
        match variant {
            VariantArg::Unix => PathVariant::Unix,
            VariantArg::Win => PathVariant::Win,
        }
    }
}

/// `getWinePath`'s argument (`launch_wine_path`'s first argument). Strict: an unknown key is a bad argument.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WinePathArgs {
    pub path: String,
    pub game_settings: GameSettingsView,
    #[serde(default)]
    pub variant: VariantArg,
}

/// `getWinePath`: the trimmed `winepath` answer, `""` when it printed nothing.
pub async fn wine_path(ctx: &LaunchCtx, args: WinePathArgs, host: &WineHost) -> String {
    get_wine_path(
        ctx,
        &args.game_settings,
        &args.path,
        args.variant.into(),
        host,
    )
    .await
}
