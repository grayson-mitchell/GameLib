//! The bottle-creation decision (`decideCreationEngine`; phase 59 D-07, 59-REVIEW WR-02/WR-03).
//!
//! A presence check only: `--demo-status` against another title's bottle read that bottle's trial
//! clock, not this one's, so creation never probes. CrossOver is chosen when its `wine` is present and
//! executable (with the 120 s create cap, D-12 and D-17), else the current pin with the reason; a
//! CrossOver create failure falls back later.

use std::path::Path;

use serde_json::{json, Value};

use crate::crossover::tested_versions::read_crossover_build;
use crate::ctx::EngineCtx;
use crate::decision::launch::FallbackReason;
use crate::decision::preflight::is_executable;
use crate::jsutil::path_join;
use crate::pins::{pins, EnginePin, EnginePins};

/// Bounds the D-12 create-under-expiry case; a normal cxbottle create is well under a minute.
pub const CX_CREATE_CAP_MS: u64 = 120_000;

#[derive(Debug, Clone, PartialEq)]
pub enum CreationDecision {
    Crossover {
        create_timeout_ms: u64,
        probed: bool,
        build: Option<String>,
    },
    Pinned {
        reason: FallbackReason,
        pin: Box<EnginePin>,
    },
}

impl CreationDecision {
    pub fn kind(&self) -> &'static str {
        match self {
            CreationDecision::Crossover { .. } => "crossover",
            CreationDecision::Pinned { .. } => "pinned",
        }
    }

    pub fn to_value(&self) -> Value {
        match self {
            CreationDecision::Crossover {
                create_timeout_ms,
                probed,
                build,
            } => json!({
                "kind": "crossover",
                "createTimeoutMs": create_timeout_ms,
                "probed": probed,
                "build": build,
            }),
            CreationDecision::Pinned { reason, pin } => json!({
                "kind": "pinned",
                "reason": reason.as_str(),
                "pin": serde_json::to_value(pin.as_ref()).unwrap_or(Value::Null),
            }),
        }
    }
}

/// `decideCreationEngine`. `pins` is the table (`None`: the shared one). `Err` only for a shared table
/// that does not parse.
pub async fn decide_creation_engine(
    ctx: &EngineCtx,
    key: &str,
    pins_override: Option<&EnginePins>,
) -> Result<CreationDecision, &'static str> {
    let shared;
    let table: &EnginePins = match pins_override {
        Some(table) => table,
        None => {
            shared = pins()?;
            shared
        }
    };
    let pin = Box::new(table.current.clone());
    let decision = decide(ctx, pin).await;
    if let Some(log) = &ctx.log {
        log.info(&format!(
            "Engine: key {key} bottle creation engine {} (presence check only; a CrossOver create failure falls back, 59-REVIEW WR-02/WR-03)",
            decision.kind()
        ));
    }
    Ok(decision)
}

async fn decide(ctx: &EngineCtx, pin: Box<EnginePin>) -> CreationDecision {
    let Some(bin_dir) = ctx.crossover_locator.resolve_bin_dir(ctx, &[]).await else {
        return CreationDecision::Pinned {
            reason: FallbackReason::CxMissing,
            pin,
        };
    };
    let wine_bin = path_join(&[&bin_dir, "wine"]);
    if !Path::new(&wine_bin).exists() {
        return CreationDecision::Pinned {
            reason: FallbackReason::CxMissing,
            pin,
        };
    }
    if !is_executable(Path::new(&wine_bin)) {
        return CreationDecision::Pinned {
            reason: FallbackReason::CxBroken,
            pin,
        };
    }
    CreationDecision::Crossover {
        create_timeout_ms: CX_CREATE_CAP_MS,
        probed: false,
        build: read_crossover_build(ctx, &bin_dir).await,
    }
}
