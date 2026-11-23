//! The bottle's engine marker `<bottle>/.gamelib-engine.json` (D-07, ported from `engineSwitch.ts`):
//! which engine a bottle was set up by. Reading, the read-only views, inference for a marker-less
//! bottle, the contradiction rule, and the one writer.
//!
//! The marker is the one-way on-disk state of this phase: Rust writes it byte for byte as the TS
//! did (keys `kind`, `id`, `wineserverBin`, optional `dxvk` as `{dir, version}` or `"failed"`, then
//! `version`; compact; mode 0644; `.gamelib-engine.json.tmp-<pid>`, then a rename). Before every
//! write the writer asks the version gate in process (`gamelib_store::version_gate`, chain
//! [`ENGINE_MARKER_CHAIN`]): a marker a newer build wrote is never overwritten, a gate nobody could
//! ask refuses the write, and an unreadable marker is rewritten, as the TS did (FND-06 keeps the
//! unreadable bytes only where a caller asks for a backup; the engine never resets one).

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

use gamelib_store::json::{to_compact_bytes, Json, Num, Obj};
use gamelib_store::version_gate::{version_gate, GateState};
use serde_json::Value;

use super::paths::{basename, bottle_dir, is_clean_bottle_name, is_inside};
use crate::ctx::EngineCtx;
use crate::engines::{
    is_pinned_engine_installed, pin_engine, pinned_engine_root, NonCrossoverEngine,
};
use crate::ids::{is_version_token, pin_by_id};
use crate::jsutil::{path_join, prop};
use crate::pins::{pins, EnginePin};
use crate::sinks::EngineLog;

/// The marker's file name inside a bottle.
pub const MARKER_FILE: &str = ".gamelib-engine.json";
/// The marker's chain key in `gamelib-store`'s `Chains` table.
pub const ENGINE_MARKER_CHAIN: &str = "engine/gamelib-engine-marker";
/// The version the marker is written at: the baseline, as its chain has no steps.
pub const BOTTLE_FILE_VERSION: u32 = 1;
/// The DXVK-macOS version file a contradicted marker is judged by.
const DXVK_VERSION_FILE: &str = "current_dxvk-macOS";
const CONF_FILE: &str = "cxbottle.conf";

/// Which engine set the bottle up (`MarkerKind`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EngineKind {
    Crossover,
    Pinned,
    WineManager,
}

impl EngineKind {
    pub fn as_str(self) -> &'static str {
        match self {
            EngineKind::Crossover => "crossover",
            EngineKind::Pinned => "pinned",
            EngineKind::WineManager => "wine-manager",
        }
    }

    fn parse(text: &str) -> Option<EngineKind> {
        match text {
            "crossover" => Some(EngineKind::Crossover),
            "pinned" => Some(EngineKind::Pinned),
            "wine-manager" => Some(EngineKind::WineManager),
            _ => None,
        }
    }
}

/// The marker's `dxvk` field: the DXVK build installed in the bottle, or `failed` when a switch
/// handed the bottle over but DXVK did not install.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DxvkField {
    Failed,
    Installed { dir: String, version: String },
}

/// The marker (`EngineMarker`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Marker {
    pub kind: EngineKind,
    pub id: String,
    pub wineserver_bin: String,
    pub dxvk: Option<DxvkField>,
}

/// What the version gate answered for the marker's path, or `None` when it could not be asked. In
/// the app it is always [`process_gate`]; the goldens inject a gate that cannot be asked or that
/// answers `newer`, the two states the TS fake of the Rust channel produced.
pub type Gate<'a> = &'a (dyn Fn(&Path) -> Option<GateState> + 'a);

/// The in-process gate: `version_gate(path, ENGINE_MARKER_CHAIN)`. It always answers.
pub fn process_gate(path: &Path) -> Option<GateState> {
    Some(version_gate(path, ENGINE_MARKER_CHAIN).state)
}

/// `gateAllowsWrite`: absent, current and unreadable are writable; `newer` and a gate nobody could
/// ask are not.
pub fn gate_allows_write(state: Option<GateState>) -> bool {
    matches!(
        state,
        Some(GateState::Absent | GateState::Ok | GateState::Unreadable)
    )
}

pub(crate) fn marker_path(bottle_dir: &str) -> String {
    path_join(&[bottle_dir, MARKER_FILE])
}

fn info(log: Option<&dyn EngineLog>, line: &str) {
    if let Some(log) = log {
        log.info(line);
    }
}

fn warn(log: Option<&dyn EngineLog>, line: &str) {
    if let Some(log) = log {
        log.warn(line);
    }
}

/// `readMarker`: the marker, or `None` for an absent, unparseable or ill-formed one. A hand-edited
/// `dxvk.dir` outside the pinned-engine root, or a `dxvk.version` that is not a token, is dropped
/// rather than trusted (T-59-60).
pub fn read(ctx: &EngineCtx, bottle_dir: &str) -> Option<Marker> {
    let bytes = fs::read(marker_path(bottle_dir)).ok()?;
    let raw: Value = serde_json::from_str(&String::from_utf8_lossy(&bytes)).ok()?;
    let kind = EngineKind::parse(prop(&raw, "kind")?.as_str()?)?;
    let id = prop(&raw, "id")?.as_str()?;
    if !is_version_token(id) {
        return None;
    }
    let wineserver_bin = prop(&raw, "wineserverBin")?.as_str()?.to_string();
    let mut out = Marker {
        kind,
        id: id.to_string(),
        wineserver_bin,
        dxvk: None,
    };
    match prop(&raw, "dxvk") {
        Some(Value::String(text)) if text == "failed" => out.dxvk = Some(DxvkField::Failed),
        Some(field @ Value::Object(_)) => {
            let dir = prop(field, "dir").and_then(Value::as_str);
            let version = prop(field, "version").and_then(Value::as_str);
            if let (Some(dir), Some(version)) = (dir, version) {
                if is_inside(&pinned_engine_root(ctx), dir) && is_version_token(version) {
                    out.dxvk = Some(DxvkField::Installed {
                        dir: dir.to_string(),
                        version: version.to_string(),
                    });
                }
            }
        }
        _ => {}
    }
    Some(out)
}

/// `hasStagingDxvk`: DXVK-macOS is installed only by non-CrossOver paths and every switch to
/// CrossOver removes it, so a bottle that carries it was set up by a non-CrossOver engine
/// (76-VERIFICATION CR-01).
pub(crate) fn has_staging_dxvk(bottle_dir: &str) -> bool {
    Path::new(bottle_dir).join(DXVK_VERSION_FILE).exists()
}

/// `isContradictedCrossover`: a crossover marker in a bottle that carries DXVK-macOS (76 CR-01).
fn is_contradicted_crossover(bottle_dir: &str, marker: Option<&Marker>) -> bool {
    marker.is_some_and(|m| m.kind == EngineKind::Crossover) && has_staging_dxvk(bottle_dir)
}

fn current_pin() -> Option<&'static EnginePin> {
    pins().ok().map(|table| &table.current)
}

/// `viewMarker` (76 review WR-01): the marker as the switch sees it, for the read-only views, without
/// logging. A contradicted crossover marker reads as the pinned marker [`infer`] would give, with its
/// wineserver left empty: the views never use it to act.
pub fn view(ctx: &EngineCtx, bottle_dir: &str) -> Option<Marker> {
    let marker = read(ctx, bottle_dir);
    if is_contradicted_crossover(bottle_dir, marker.as_ref()) {
        return Some(Marker {
            kind: EngineKind::Pinned,
            id: current_pin()?.id.clone(),
            wineserver_bin: String::new(),
            dxvk: None,
        });
    }
    marker
}

/// `trustedMarker`: a crossover marker contradicted by DXVK-macOS is not trusted (76 CR-01), so the
/// bottle reads as marker-less.
pub fn trusted(
    log: Option<&dyn EngineLog>,
    bottle_dir: &str,
    bottle_name: &str,
    marker: Option<Marker>,
) -> Option<Marker> {
    if is_contradicted_crossover(bottle_dir, marker.as_ref()) {
        warn(
            log,
            &format!(
                "engine marker for \"{bottle_name}\" says crossover but DXVK-macOS is installed; treating it as inferred (76 CR-01)"
            ),
        );
        return None;
    }
    marker
}

/// The current pin as an installed engine, or `None` when it is not on disk (`defaultCurrentPinEngine`).
pub(crate) fn current_pin_engine(ctx: &EngineCtx) -> Option<NonCrossoverEngine> {
    let pin = current_pin()?;
    is_pinned_engine_installed(ctx, pin).then(|| pin_engine(ctx, pin))
}

/// `inferMarker`: without a trusted marker, DXVK-macOS in the bottle means a non-CrossOver engine set
/// it up (CrossOver's own probe adds a Timestamp, 76 CR-01); otherwise a conf `Timestamp` means
/// CrossOver; otherwise the pin. CrossOver's template `create()` always writes a Timestamp, so a conf
/// without one was written by GameLib's own conf writer. `None` only when the pin table is corrupt.
pub fn infer(ctx: &EngineCtx, bottle_dir: &str) -> Option<Marker> {
    let pinned = || -> Option<Marker> {
        Some(Marker {
            kind: EngineKind::Pinned,
            id: current_pin()?.id.clone(),
            wineserver_bin: current_pin_engine(ctx)
                .map(|e| e.wineserver_bin)
                .unwrap_or_default(),
            dxvk: None,
        })
    };
    if has_staging_dxvk(bottle_dir) {
        return pinned();
    }
    let conf = fs::read(Path::new(bottle_dir).join(CONF_FILE)).unwrap_or_default();
    if String::from_utf8_lossy(&conf).contains("Timestamp") {
        return Some(Marker {
            kind: EngineKind::Crossover,
            id: "crossover".to_string(),
            wineserver_bin: String::new(),
            dxvk: None,
        });
    }
    pinned()
}

/// The marker's bytes: `Obj::insert_js` in the TS key order, `version` last, compact (never
/// `serde_json`, whose object order is sorted).
pub fn marker_bytes(marker: &Marker) -> Vec<u8> {
    let mut obj = Obj::new();
    obj.insert_js("kind", Json::Str(marker.kind.as_str().to_string()));
    obj.insert_js("id", Json::Str(marker.id.clone()));
    obj.insert_js("wineserverBin", Json::Str(marker.wineserver_bin.clone()));
    match &marker.dxvk {
        None => {}
        Some(DxvkField::Failed) => {
            obj.insert_js("dxvk", Json::Str("failed".to_string()));
        }
        Some(DxvkField::Installed { dir, version }) => {
            let mut inner = Obj::new();
            inner.insert_js("dir", Json::Str(dir.clone()));
            inner.insert_js("version", Json::Str(version.clone()));
            obj.insert_js("dxvk", Json::Obj(inner));
        }
    }
    obj.insert_js("version", Json::Num(Num::U(u64::from(BOTTLE_FILE_VERSION))));
    to_compact_bytes(&Json::Obj(obj))
}

/// `writeMarker`: asks the gate, then writes `.gamelib-engine.json.tmp-<pid>` (0644, subject to the
/// umask as `writeFileSync`'s mode was) and renames it over the marker. False, with nothing written,
/// for a `newer` marker or a gate nobody could ask; false and the tmp file removed when the write
/// fails.
pub fn write_marker_with(
    log: Option<&dyn EngineLog>,
    gate: Gate<'_>,
    bottle_dir: &str,
    marker: &Marker,
) -> bool {
    let path = marker_path(bottle_dir);
    let state = gate(Path::new(&path));
    if !gate_allows_write(state) {
        warn(
            log,
            if state.is_none() {
                "engine marker version gate could not be asked; not overwriting a marker that may be from a newer GameLib build"
            } else {
                "engine marker is from a newer GameLib build; not overwriting it"
            },
        );
        return false;
    }
    let tmp = path_join(&[
        bottle_dir,
        &format!("{MARKER_FILE}.tmp-{}", std::process::id()),
    ]);
    let written = write_new(&tmp, &marker_bytes(marker)).and_then(|()| fs::rename(&tmp, &path));
    if written.is_err() {
        let _ = fs::remove_file(&tmp);
        warn(log, "engine marker write failed");
        return false;
    }
    true
}

/// [`write_marker_with`] over the in-process gate.
pub fn write_marker(log: Option<&dyn EngineLog>, bottle_dir: &str, marker: &Marker) -> bool {
    write_marker_with(log, &process_gate, bottle_dir, marker)
}

/// `writeFileSync(path, bytes, { mode: 0o644 })`: create or truncate, mode 0644 on create.
fn write_new(path: &str, bytes: &[u8]) -> std::io::Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o644);
    }
    let mut file = options.open(path)?;
    file.write_all(bytes)
}

/// What the read-only marker views report (`readBottleEngineMarkerSummary`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MarkerSummary {
    pub crossover: bool,
    /// The pin id of a pinned marker, else `None`.
    pub pin_id: Option<String>,
    /// The recorded Wine Manager version (the id is already a token), else `None`.
    pub wine_manager_version: Option<String>,
    /// A pinned marker's recorded wineserver, only when inside the pinned-engine root and named
    /// `wineserver` (T-59-60), else `None`.
    pub pin_wineserver_bin: Option<String>,
}

impl MarkerSummary {
    /// The JSON the TS answered.
    pub fn to_value(&self) -> Value {
        serde_json::json!({
            "kind": if self.crossover { "crossover" } else { "non-crossover" },
            "pinId": self.pin_id,
            "wineManagerVersion": self.wine_manager_version,
            "pinWineserverBin": self.pin_wineserver_bin,
        })
    }
}

/// The view of a clean bottle name's marker; `None` for an unsafe name or no readable marker.
fn view_of(ctx: &EngineCtx, bottle_name: &str) -> Option<Marker> {
    if !is_clean_bottle_name(bottle_name) {
        return None;
    }
    view(ctx, &bottle_dir(&ctx.paths.user_home, bottle_name))
}

/// `readBottleEngineMarkerKind` (G22, 59-38): the read-only kind for the launch path. `None` for an
/// absent or unreadable marker or an unsafe name; never infers or writes a marker. A crossover marker
/// contradicted by DXVK-macOS reads as the pin (76 review WR-01). `true` is crossover.
pub fn read_marker_kind_is_crossover(ctx: &EngineCtx, bottle_name: &str) -> Option<bool> {
    view_of(ctx, bottle_name).map(|m| m.kind == EngineKind::Crossover)
}

/// `readBottleEngineMarkerSummary` (WR-01): kind plus the pin id and the bounded wineserver.
pub fn read_marker_summary(ctx: &EngineCtx, bottle_name: &str) -> Option<MarkerSummary> {
    let marker = view_of(ctx, bottle_name)?;
    let pin_wineserver_bin = (marker.kind == EngineKind::Pinned
        && is_inside(&pinned_engine_root(ctx), &marker.wineserver_bin)
        && basename(&marker.wineserver_bin) == "wineserver")
        .then(|| marker.wineserver_bin.clone());
    Some(MarkerSummary {
        crossover: marker.kind == EngineKind::Crossover,
        pin_id: (marker.kind == EngineKind::Pinned).then(|| marker.id.clone()),
        wine_manager_version: (marker.kind == EngineKind::WineManager).then(|| marker.id.clone()),
        pin_wineserver_bin,
    })
}

/// `restoreNeedsAbsentPin` (G22, 59-38): true when switching this bottle back to a healthy CrossOver
/// would have to download a pin that is not installed. False whenever the restore needs no pin
/// download, and for any unreadable state.
pub fn restore_needs_absent_pin(ctx: &EngineCtx, bottle_name: &str) -> bool {
    if !is_clean_bottle_name(bottle_name) {
        return false;
    }
    let dir = bottle_dir(&ctx.paths.user_home, bottle_name);
    let Some(prev) = view(ctx, &dir) else {
        return false;
    };
    if prev.kind == EngineKind::Crossover {
        return false;
    }
    let restore_needed = has_staging_dxvk(&dir) || prev.dxvk.is_some();
    if !restore_needed {
        return false;
    }
    let pin = if prev.kind == EngineKind::Pinned {
        pin_by_id(&prev.id)
    } else {
        None
    }
    .or_else(current_pin);
    let Some(pin) = pin else {
        return false;
    };
    if is_pinned_engine_installed(ctx, pin) {
        return false;
    }
    // A healthy CrossOver restores from the marker's own DXVK copy without the pin.
    if let Some(DxvkField::Installed { dir, .. }) = &prev.dxvk {
        if Path::new(dir).join("x64").exists() {
            return false;
        }
    }
    true
}

/// What `reconcileBottleEngineMarker` decided.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reconciled {
    Crossover,
    Pinned,
}

impl Reconciled {
    pub fn as_str(self) -> &'static str {
        match self {
            Reconciled::Crossover => "crossover",
            Reconciled::Pinned => "pinned",
        }
    }
}

/// `identityOf`: `crossover`, else `<kind>:<id>`.
pub fn identity_of(marker: &Marker) -> String {
    if marker.kind == EngineKind::Crossover {
        "crossover".to_string()
    } else {
        format!("{}:{}", marker.kind.as_str(), marker.id)
    }
}

/// `reconcileBottleEngineMarker` (76 gap, CR-01): persists the bottle's engine before any CrossOver
/// probe touches `cxbottle.conf`. Writes only for a provisioned bottle whose marker is missing or
/// contradicted by DXVK-macOS; answers what it wrote, or `None` when it wrote nothing.
pub fn reconcile_with(ctx: &EngineCtx, gate: Gate<'_>, bottle_name: &str) -> Option<Reconciled> {
    let log = ctx.log.as_deref();
    if !is_clean_bottle_name(bottle_name) {
        return None;
    }
    let dir = bottle_dir(&ctx.paths.user_home, bottle_name);
    if !Path::new(&dir).join(CONF_FILE).exists() {
        return None;
    }
    if !gate_allows_write(gate(Path::new(&marker_path(&dir)))) {
        return None;
    }
    let marker = read(ctx, &dir);
    let was_present = marker.is_some();
    if trusted(log, &dir, bottle_name, marker).is_some() {
        return None;
    }
    let inferred = infer(ctx, &dir)?;
    if !write_marker_with(log, gate, &dir, &inferred) {
        return None;
    }
    info(
        log,
        &format!(
            "engine marker for \"{bottle_name}\" reconciled before the CrossOver pre-flight: {} ({})",
            identity_of(&inferred),
            if was_present {
                "crossover marker contradicted by DXVK-macOS"
            } else {
                "missing"
            }
        ),
    );
    Some(if inferred.kind == EngineKind::Crossover {
        Reconciled::Crossover
    } else {
        Reconciled::Pinned
    })
}

/// [`reconcile_with`] over the in-process gate.
pub fn reconcile(ctx: &EngineCtx, bottle_name: &str) -> Option<Reconciled> {
    reconcile_with(ctx, &process_gate, bottle_name)
}

/// `markerWritable`: the bottle's directory when its name is clean, the directory exists and the gate
/// lets the marker be rewritten.
fn marker_writable(ctx: &EngineCtx, gate: Gate<'_>, bottle_name: &str) -> Option<String> {
    if !is_clean_bottle_name(bottle_name) {
        return None;
    }
    let dir = bottle_dir(&ctx.paths.user_home, bottle_name);
    if !Path::new(&dir).exists() {
        return None;
    }
    gate_allows_write(gate(Path::new(&marker_path(&dir)))).then_some(dir)
}

/// `recordPinnedBottleEngine` (76 gap, CR-01): the marker a pinned-engine bottle gets at creation, so
/// it is never marker-less when CrossOver's probe later adds a Timestamp. The `dxvk` field is recorded
/// only when the engine has one and the bottle carries DXVK-macOS.
pub fn record_pinned_with(
    ctx: &EngineCtx,
    gate: Gate<'_>,
    bottle_name: &str,
    pin_id: &str,
    engine: &NonCrossoverEngine,
) -> bool {
    let log = ctx.log.as_deref();
    if !is_version_token(pin_id) {
        return false;
    }
    let Some(dir) = marker_writable(ctx, gate, bottle_name) else {
        return false;
    };
    let dxvk = match &engine.dxvk {
        Some(build) if has_staging_dxvk(&dir) => Some(DxvkField::Installed {
            dir: build.dir.clone(),
            version: build.version.clone(),
        }),
        _ => None,
    };
    let marker = Marker {
        kind: EngineKind::Pinned,
        id: pin_id.to_string(),
        wineserver_bin: engine.wineserver_bin.clone(),
        dxvk,
    };
    if !write_marker_with(log, gate, &dir, &marker) {
        return false;
    }
    info(
        log,
        &format!("engine marker for \"{bottle_name}\" recorded at creation: pinned:{pin_id}"),
    );
    true
}

/// [`record_pinned_with`] over the in-process gate.
pub fn record_pinned(
    ctx: &EngineCtx,
    bottle_name: &str,
    pin_id: &str,
    engine: &NonCrossoverEngine,
) -> bool {
    record_pinned_with(ctx, &process_gate, bottle_name, pin_id, engine)
}

/// `recordCrossoverBottleEngine` (D-07a): the marker a CrossOver-created bridge bottle gets at
/// creation; it names the CrossOver wineserver under `bin_dir`.
pub fn record_crossover_with(
    ctx: &EngineCtx,
    gate: Gate<'_>,
    bottle_name: &str,
    bin_dir: &str,
) -> bool {
    let log = ctx.log.as_deref();
    let Some(dir) = marker_writable(ctx, gate, bottle_name) else {
        return false;
    };
    let marker = Marker {
        kind: EngineKind::Crossover,
        id: "crossover".to_string(),
        wineserver_bin: path_join(&[bin_dir, "wineserver"]),
        dxvk: None,
    };
    if !write_marker_with(log, gate, &dir, &marker) {
        return false;
    }
    info(
        log,
        &format!("engine marker for \"{bottle_name}\" recorded at creation: crossover"),
    );
    true
}

/// [`record_crossover_with`] over the in-process gate.
pub fn record_crossover(ctx: &EngineCtx, bottle_name: &str, bin_dir: &str) -> bool {
    record_crossover_with(ctx, &process_gate, bottle_name, bin_dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn marker(dxvk: Option<DxvkField>) -> Marker {
        Marker {
            kind: EngineKind::Pinned,
            id: "wine-staging-11.20".to_string(),
            wineserver_bin: "/t/wineserver".to_string(),
            dxvk,
        }
    }

    #[test]
    fn the_bytes_are_the_ts_key_order_compact_with_the_version_last() {
        assert_eq!(
            String::from_utf8(marker_bytes(&marker(None))).unwrap(),
            r#"{"kind":"pinned","id":"wine-staging-11.20","wineserverBin":"/t/wineserver","version":1}"#
        );
        assert_eq!(
            String::from_utf8(marker_bytes(&marker(Some(DxvkField::Failed)))).unwrap(),
            r#"{"kind":"pinned","id":"wine-staging-11.20","wineserverBin":"/t/wineserver","dxvk":"failed","version":1}"#
        );
        let installed = DxvkField::Installed {
            dir: "/t/d".to_string(),
            version: "v1".to_string(),
        };
        assert!(String::from_utf8(marker_bytes(&marker(Some(installed))))
            .unwrap()
            .contains(r#""dxvk":{"dir":"/t/d","version":"v1"},"version":1}"#));
    }

    #[test]
    fn a_gate_nobody_could_ask_and_a_newer_answer_both_refuse_a_write() {
        let home = gamelib_testutil::FakeHome::new("marker-gate-");
        let dir = home.root().to_string_lossy().into_owned();
        let m = marker(None);
        assert!(!write_marker_with(None, &|_| None, &dir, &m));
        assert!(!write_marker_with(
            None,
            &|_| Some(GateState::Newer),
            &dir,
            &m
        ));
        assert!(!home.root().join(MARKER_FILE).exists());
        assert!(write_marker_with(
            None,
            &|_| Some(GateState::Absent),
            &dir,
            &m
        ));
        assert!(home.root().join(MARKER_FILE).exists());
        // The in-process gate then sees a current marker and allows the rewrite.
        assert!(write_marker(None, &dir, &m));
    }
}
