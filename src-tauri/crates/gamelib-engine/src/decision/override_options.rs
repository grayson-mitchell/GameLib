//! The engine override options (`listEngineOverrideOptions`, `resolveWineManagerStaging`; phase 59 D-11):
//! what the per-game engine picker offers. Automatic, CrossOver (installed or not), the current pin and
//! the previous one when there is one, then every installed Wine Manager macOS build the override
//! grammar accepts. GPTK, toolkit and DXMT builds and custom paths are never offered.

use serde_json::Value;

use crate::ctx::EngineCtx;
use crate::engines::{
    is_installed_macos_release, is_pinned_engine_installed, wine_manager_releases,
};
use crate::game_engine::{option, EngineOption};
use crate::ids::parse_engine_override_str;
use crate::jsutil::{js_to_string, prop};
use crate::pins::{pins, EnginePins};

pub use crate::engines::resolve_wine_manager_staging;

/// `/-DXMT$|gptk|toolkit/i`.
fn is_unusable_release_name(version: &str) -> bool {
    let lower = version.to_lowercase();
    lower.ends_with("-dxmt") || lower.contains("gptk") || lower.contains("toolkit")
}

/// The picker's rows for a CrossOver that is or is not installed and a pin table (`None`: no pin rows,
/// the shared table did not parse). Reads the Wine Manager releases and the pins' install state.
pub fn override_option_rows(
    ctx: &EngineCtx,
    crossover: bool,
    table: Option<&EnginePins>,
) -> Vec<EngineOption> {
    let mut out = vec![option(
        "automatic".to_string(),
        "automatic",
        "Automatic".to_string(),
        true,
        true,
        false,
    )];
    out.push(option(
        "crossover".to_string(),
        "crossover",
        "CrossOver".to_string(),
        crossover,
        crossover,
        false,
    ));
    if let Some(table) = table {
        for (pin, previous) in std::iter::once((&table.current, false))
            .chain(table.previous.as_ref().map(|p| (p, true)))
        {
            out.push(option(
                format!("pinned:{}", pin.id),
                "pinned",
                pin.label.clone(),
                true,
                is_pinned_engine_installed(ctx, pin),
                previous,
            ));
        }
    }
    for release in wine_manager_releases(ctx) {
        if !is_installed_macos_release(&release) {
            continue;
        }
        let version = prop(&release, "version").map_or("undefined".to_string(), js_to_string);
        if is_unusable_release_name(&version) {
            continue;
        }
        let id = format!("wine-manager:{version}");
        if parse_engine_override_str(&id) == "automatic" {
            continue;
        }
        out.push(option(
            id,
            "wine-manager",
            format!("Wine Manager: {version}"),
            true,
            true,
            false,
        ));
    }
    out
}

/// `listEngineOverrideOptions` over the CrossOver locator (D-04): CrossOver is "installed" when its `bin`
/// directory is found. `pins_override` is the pin table (`None`: the shared one).
pub async fn list_engine_override_options(
    ctx: &EngineCtx,
    pins_override: Option<&EnginePins>,
) -> Vec<EngineOption> {
    let crossover = ctx
        .crossover_locator
        .resolve_bin_dir(ctx, &[])
        .await
        .is_some();
    override_option_rows(ctx, crossover, pins_override.or_else(|| pins().ok()))
}

/// The rows as the TS answered them.
pub fn options_value(options: &[EngineOption]) -> Value {
    serde_json::to_value(options).unwrap_or(Value::Null)
}
