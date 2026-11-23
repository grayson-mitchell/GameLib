//! The winemac Metal-view export gate (`tools/machoExports.ts`, quick 261031-rjv): DXMT v0.80's
//! `winemetal.so` resolves macdrv metal-view symbols that Wine-Staging-macOS's `winemac.so` does not
//! always define, so a copy of such a Wine cannot present D3D11 games.
//!
//! The scan itself is `gamelib-scan`'s (the Mach-O reader), and this crate takes no domain-crate
//! dependency: the shell implements [`MachoScan`] over `gamelib_scan::dispatch` and puts it in the
//! [`WineCtx`](crate::ctx::WineCtx); a test puts a scripted one. The TS wrapper failed closed (a
//! transport rejection resolved `ok: false`, never `ok: true`) and so does
//! [`check_winemac_metal_view_exports`].

use std::path::{Path, PathBuf};

use serde_json::Value;

/// The macdrv metal-view symbols DXMT needs `winemac.so` to define (`DXMT_REQUIRED_MACDRV_SYMBOLS`,
/// same order as the scanner's).
pub const DXMT_REQUIRED_MACDRV_SYMBOLS: [&str; 4] = [
    "_macdrv_functions",
    "_macdrv_view_create_metal_view",
    "_macdrv_view_get_metal_layer",
    "_macdrv_view_release_metal_view",
];

/// The answer of the gate (`WinemacMetalCheck`): the Wine passes, or it does not and says why.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WinemacMetalCheck {
    Pass,
    Fail {
        /// The `winemac.so` that was read (or would have been).
        winemac_path: String,
        reason: String,
        /// The symbols the file does not define.
        missing: Vec<String>,
    },
}

impl WinemacMetalCheck {
    /// The scanner's JSON answer (`{ok: true}` or `{ok: false, winemacPath, reason, missing}`), or
    /// `None` for any other shape.
    pub fn from_value(value: &Value) -> Option<WinemacMetalCheck> {
        let map = value.as_object()?;
        if map.get("ok")?.as_bool()? {
            return Some(WinemacMetalCheck::Pass);
        }
        Some(WinemacMetalCheck::Fail {
            winemac_path: map.get("winemacPath")?.as_str()?.to_string(),
            reason: map.get("reason")?.as_str()?.to_string(),
            missing: map
                .get("missing")?
                .as_array()?
                .iter()
                .map(|s| s.as_str().map(str::to_string))
                .collect::<Option<Vec<String>>>()?,
        })
    }
}

/// `winemacPathFor`: where a bundle keeps its `winemac.so`.
pub fn winemac_path_for(wine_bundle: &Path) -> PathBuf {
    wine_bundle
        .join("Contents")
        .join("Resources")
        .join("wine")
        .join("lib")
        .join("wine")
        .join("x86_64-unix")
        .join("winemac.so")
}

/// Reads a Wine bundle's `winemac.so` for the DXMT symbols (`scan_winemac_metal_exports`). `Err` is a
/// scan that could not run (the TS transport rejecting); the gate treats it as a failed check.
pub trait MachoScan: Send + Sync {
    fn winemac_metal_exports(&self, wine_bundle: &Path) -> Result<WinemacMetalCheck, String>;
}

/// The scan a context has until the shell's is installed: it never runs, so the gate stays closed.
#[derive(Debug, Default, Clone, Copy)]
pub struct UnavailableScan;

impl MachoScan for UnavailableScan {
    fn winemac_metal_exports(&self, _wine_bundle: &Path) -> Result<WinemacMetalCheck, String> {
        Err("no scanner is installed".to_string())
    }
}

/// `checkWinemacMetalViewExports`: the scan's answer, or a failed check when the scan could not
/// answer, so a broken scanner skips DXMT rather than copying it onto a Wine that cannot use it.
pub fn check_winemac_metal_view_exports(
    scan: &dyn MachoScan,
    wine_bundle: &Path,
) -> WinemacMetalCheck {
    match scan.winemac_metal_exports(wine_bundle) {
        Ok(check) => check,
        Err(error) => WinemacMetalCheck::Fail {
            winemac_path: winemac_path_for(wine_bundle).to_string_lossy().into_owned(),
            reason: format!("could not read winemac.so: rust scan failed: {error}"),
            missing: DXMT_REQUIRED_MACDRV_SYMBOLS
                .iter()
                .map(|s| (*s).to_string())
                .collect(),
        },
    }
}

/// A scan a test scripts: the bundles it fails (with the scanner's own reason), whether the whole
/// scan is rejected, and the bundles it was asked about.
#[cfg(any(test, feature = "testing"))]
pub struct ScriptedScan {
    fail_for: Vec<PathBuf>,
    reject: bool,
    asked: std::sync::Mutex<Vec<PathBuf>>,
}

#[cfg(any(test, feature = "testing"))]
impl ScriptedScan {
    /// Every bundle passes.
    pub fn passing() -> ScriptedScan {
        ScriptedScan {
            fail_for: Vec::new(),
            reject: false,
            asked: std::sync::Mutex::new(Vec::new()),
        }
    }

    /// The listed bundles fail the gate; every other passes.
    pub fn failing(bundles: Vec<PathBuf>) -> ScriptedScan {
        ScriptedScan {
            fail_for: bundles,
            ..ScriptedScan::passing()
        }
    }

    /// Every scan is rejected (the transport closed).
    pub fn rejecting() -> ScriptedScan {
        ScriptedScan {
            reject: true,
            ..ScriptedScan::passing()
        }
    }

    /// The bundles the gate asked about, in order.
    pub fn asked(&self) -> Vec<PathBuf> {
        self.asked.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
}

#[cfg(any(test, feature = "testing"))]
impl MachoScan for ScriptedScan {
    fn winemac_metal_exports(&self, wine_bundle: &Path) -> Result<WinemacMetalCheck, String> {
        self.asked
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(wine_bundle.to_path_buf());
        if self.reject {
            return Err("Error: scan transport closed".to_string());
        }
        if self.fail_for.iter().any(|p| p == wine_bundle) {
            return Ok(WinemacMetalCheck::Fail {
                winemac_path: winemac_path_for(wine_bundle).to_string_lossy().into_owned(),
                reason: "winemac.so lacks the macdrv metal-view exports".to_string(),
                missing: DXMT_REQUIRED_MACDRV_SYMBOLS
                    .iter()
                    .map(|s| (*s).to_string())
                    .collect(),
            });
        }
        Ok(WinemacMetalCheck::Pass)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn the_scanners_answer_decodes_and_other_shapes_do_not() {
        assert_eq!(
            WinemacMetalCheck::from_value(&json!({"ok": true})),
            Some(WinemacMetalCheck::Pass)
        );
        let fail = WinemacMetalCheck::from_value(&json!({
            "ok": false, "winemacPath": "/w/winemac.so", "reason": "r", "missing": ["a", "b"]
        }));
        assert_eq!(
            fail,
            Some(WinemacMetalCheck::Fail {
                winemac_path: "/w/winemac.so".to_string(),
                reason: "r".to_string(),
                missing: vec!["a".to_string(), "b".to_string()],
            })
        );
        for bad in [
            json!(null),
            json!({}),
            json!({"ok": false}),
            json!({"ok": false, "winemacPath": "p", "reason": "r", "missing": [1]}),
        ] {
            assert!(WinemacMetalCheck::from_value(&bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn a_scan_that_cannot_answer_fails_the_gate_closed() {
        let bundle = Path::new("/tools/wine/W");
        let check = check_winemac_metal_view_exports(&UnavailableScan, bundle);
        let WinemacMetalCheck::Fail {
            winemac_path,
            reason,
            missing,
        } = check
        else {
            panic!("a scan that cannot run must not pass");
        };
        assert!(winemac_path.ends_with("winemac.so"));
        assert!(reason.starts_with("could not read winemac.so: rust scan failed: "));
        assert_eq!(missing.len(), 4);
    }

    #[test]
    fn a_scripted_scan_passes_fails_and_remembers_what_it_was_asked() {
        let one = PathBuf::from("/tools/wine/A");
        let two = PathBuf::from("/tools/wine/B");
        let scan = ScriptedScan::failing(vec![two.clone()]);
        assert_eq!(
            check_winemac_metal_view_exports(&scan, &one),
            WinemacMetalCheck::Pass
        );
        assert!(matches!(
            check_winemac_metal_view_exports(&scan, &two),
            WinemacMetalCheck::Fail { .. }
        ));
        assert_eq!(scan.asked(), vec![one, two]);
    }
}
