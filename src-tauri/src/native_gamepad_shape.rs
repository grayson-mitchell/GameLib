//! Quick task 261031-mj9 (from spike 051, `.planning/spikes/051-powera-pad-drives-gamelib-macos/`):
//! the cfg-free, gilrs-free half of the native gamepad source.
//!
//! WKWebView on macOS does not surface HID pads that Apple's GameController framework does not
//! claim (measured: the PowerA Advantage Wired Controller for Nintendo Switch 2, 20d6:a720, is
//! invisible to `navigator.getGamepads()` in both GameLib and Safari, while raw IOHID reads its
//! full input). `macos_native_gamepad` reads such pads with `gilrs`; this module shapes what it
//! read the way Chromium reports a raw-HID (`mapping: ""`) pad, so the renderer's existing per-pad
//! layouts apply unchanged:
//!
//! - `id`: `"<name> (Vendor: xxxx Product: yyyy)"`, Chromium's format.
//! - `buttons[usage - 1]` for HID Button-page usages. gilrs only holds buttons that have produced
//!   an event and exposes no element list, so the array is padded to `MIN_BUTTONS` (17, the
//!   standard-mapping size and what Chromium reported for the PowerA pad; the first boot measured
//!   buttons=3 without the padding). Higher usages still extend it when pressed.
//! - `axes[usage - 0x30]` for Generic Desktop X..Rz, in Chromium's raw sign (Y up = -1; gilrs
//!   reverses Y on macOS, so it is negated back), and the hat at index 9 as
//!   `direction * 2/7 - 1` with neutral = `15 * 2/7 - 1` (the measured 3.28571).
//!
//! Quick task 261031-nwz: this module also holds the reader's loop policy (`PadSource`,
//! `EmitGate`, `run_reader`), so init failure, hot-plug and emit coalescing are testable without
//! gilrs or a clock.
//!
//! Everything here takes plain data, so `cargo test` covers it on Linux and Windows too.

use serde::Serialize;
use std::time::{Duration, Instant};

pub const NATIVE_GAMEPAD_EVENT: &str = "native_gamepad";

const BUTTON_PAGE: u32 = 0x09;
const GENERIC_DESKTOP_PAGE: u32 = 0x01;
const USAGE_X: u32 = 0x30;
const USAGE_RZ: u32 = 0x35;
const HAT_AXIS_INDEX: usize = 9;
const AXIS_COUNT: usize = 10;
const HAT_NEUTRAL: f64 = 15.0 * 2.0 / 7.0 - 1.0;
const MIN_BUTTONS: usize = 17;

#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NativePad {
    pub index: usize,
    pub id: String,
    /// gilrs `os_name()`; the renderer's dedupe compares it with WebKit's GameController id.
    pub name: String,
    pub vendor_id: Option<u16>,
    pub product_id: Option<u16>,
    pub connected: bool,
    pub buttons: Vec<f64>,
    pub axes: Vec<f64>,
}

#[derive(Serialize, Clone, Debug)]
pub struct NativeGamepadPayload {
    pub pads: Vec<NativePad>,
}

/// Chromium's raw-HID hat encoding from gilrs's emulated D-pad axes (gilrs Y is already
/// reversed on macOS, so up = +1 here).
pub fn hat_value(dpad_x: f32, dpad_y: f32) -> f64 {
    let direction = match (dpad_x.round() as i32, dpad_y.round() as i32) {
        (0, 1) => 0,
        (1, 1) => 1,
        (1, 0) => 2,
        (1, -1) => 3,
        (0, -1) => 4,
        (-1, -1) => 5,
        (-1, 0) => 6,
        (-1, 1) => 7,
        _ => return HAT_NEUTRAL,
    };
    direction as f64 * 2.0 / 7.0 - 1.0
}

/// Chromium's `"<name> (Vendor: xxxx Product: yyyy)"` id; the bare name when either id is missing.
pub fn pad_id(name: &str, vendor: Option<u16>, product: Option<u16>) -> String {
    match (vendor, product) {
        (Some(v), Some(p)) => format!("{name} (Vendor: {v:04x} Product: {p:04x})"),
        _ => name.to_string(),
    }
}

/// `pressed` is every `(raw gilrs code, value)` the pad has reported; the raw code is
/// `usage_page << 16 | usage`.
pub fn shape_buttons(pressed: impl IntoIterator<Item = (u32, f64)>) -> Vec<f64> {
    let mut buttons: Vec<f64> = vec![0.0; MIN_BUTTONS];
    for (raw, value) in pressed {
        let (page, usage) = (raw >> 16, raw & 0xffff);
        if page != BUTTON_PAGE || usage == 0 {
            continue;
        }
        let idx = (usage - 1) as usize;
        if buttons.len() <= idx {
            buttons.resize(idx + 1, 0.0);
        }
        buttons[idx] = value;
    }
    buttons
}

/// `axes` is every `(raw gilrs code, value, is_gilrs_y)`; `hat` is the emulated D-pad
/// `(x, y)` when the pad has one. gilrs reverses the axes it maps as Y, Chromium's raw HID does
/// not, so those are negated back.
pub fn shape_axes(
    axes: impl IntoIterator<Item = (u32, f64, bool)>,
    hat: Option<(f32, f32)>,
) -> Vec<f64> {
    let mut out = vec![0.0; AXIS_COUNT];
    out[HAT_AXIS_INDEX] = HAT_NEUTRAL;
    for (raw, value, is_y) in axes {
        let (page, usage) = (raw >> 16, raw & 0xffff);
        if page == GENERIC_DESKTOP_PAGE && (USAGE_X..=USAGE_RZ).contains(&usage) {
            out[(usage - USAGE_X) as usize] = if is_y { -value } else { value };
        }
    }
    if let Some((x, y)) = hat {
        out[HAT_AXIS_INDEX] = hat_value(x, y);
    }
    out
}

/// Minimum gap between two non-connection emits. The spike 051 pad reports at about 125 Hz
/// (Live 3) and `gamepad.ts` consumes through `requestAnimationFrame` at 60-120 Hz, so 8 ms caps
/// IPC at the pad's own rate and adds at most 8 ms of latency.
pub const MIN_EMIT_INTERVAL: Duration = Duration::from_millis(8);

/// What `PadSource::drain_events` saw this tick.
pub struct Drained {
    /// Any event at all arrived.
    pub any: bool,
    /// A pad connected or disconnected.
    pub connection_changed: bool,
}

/// A source of pad state (gilrs on macOS, a scripted fake in tests).
pub trait PadSource {
    fn drain_events(&mut self) -> Drained;
    fn snapshot(&mut self) -> Vec<NativePad>;
}

/// Decides, per tick, whether a payload goes out: connection changes at once, state changes at
/// most once per `MIN_EMIT_INTERVAL` with a trailing emit, idle ticks take no snapshot.
pub struct EmitGate {
    last: Vec<NativePad>,
    last_emit: Option<Instant>,
    pending: bool,
}

impl EmitGate {
    pub fn new() -> Self {
        Self {
            last: Vec::new(),
            last_emit: None,
            pending: false,
        }
    }

    pub fn tick(
        &mut self,
        now: Instant,
        source: &mut impl PadSource,
    ) -> Option<NativeGamepadPayload> {
        let drained = source.drain_events();
        if !drained.any && !self.pending {
            return None;
        }
        let pads = source.snapshot();
        if !drained.connection_changed {
            if pads == self.last {
                self.pending = false;
                return None;
            }
            let due = self
                .last_emit
                .is_none_or(|t| now.saturating_duration_since(t) >= MIN_EMIT_INTERVAL);
            if !due {
                self.pending = true;
                return None;
            }
        }
        self.pending = false;
        self.last = pads.clone();
        self.last_emit = Some(now);
        Some(NativeGamepadPayload { pads })
    }
}

/// The reader loop. `keep_going` is called once per iteration and is where the caller sleeps
/// (and, in tests, ends the loop).
pub fn run_reader<S: PadSource>(
    init: impl FnOnce() -> Result<S, String>,
    mut emit: impl FnMut(&NativeGamepadPayload),
    mut keep_going: impl FnMut() -> bool,
) {
    let mut source = match init() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[native-gamepad] gilrs init failed: {e}");
            return;
        }
    };
    let mut gate = EmitGate::new();
    while keep_going() {
        let mut changed = false;
        if let Some(payload) = gate.tick_logged(Instant::now(), &mut source, &mut changed) {
            if changed {
                if payload.pads.is_empty() {
                    eprintln!("[native-gamepad] all pads disconnected");
                }
                for p in &payload.pads {
                    eprintln!(
                        "[native-gamepad] pad {} {:?} connected={}",
                        p.index, p.id, p.connected
                    );
                }
            }
            emit(&payload);
        }
    }
}

impl EmitGate {
    /// `tick`, also reporting whether the emit was caused by a connection change.
    fn tick_logged(
        &mut self,
        now: Instant,
        source: &mut impl PadSource,
        connection_changed: &mut bool,
    ) -> Option<NativeGamepadPayload> {
        struct Spy<'a, S: PadSource>(&'a mut S, &'a mut bool);
        impl<S: PadSource> PadSource for Spy<'_, S> {
            fn drain_events(&mut self) -> Drained {
                let d = self.0.drain_events();
                *self.1 = d.connection_changed;
                d
            }
            fn snapshot(&mut self) -> Vec<NativePad> {
                self.0.snapshot()
            }
        }
        self.tick(now, &mut Spy(source, connection_changed))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;

    struct FakeSource {
        steps: VecDeque<(Drained, Vec<NativePad>)>,
        current: Vec<NativePad>,
        snapshots: usize,
    }

    impl FakeSource {
        fn new(steps: Vec<(Drained, Vec<NativePad>)>) -> Self {
            Self {
                steps: steps.into(),
                current: Vec::new(),
                snapshots: 0,
            }
        }
    }

    impl PadSource for FakeSource {
        fn drain_events(&mut self) -> Drained {
            match self.steps.pop_front() {
                Some((d, pads)) => {
                    self.current = pads;
                    d
                }
                None => Drained {
                    any: false,
                    connection_changed: false,
                },
            }
        }
        fn snapshot(&mut self) -> Vec<NativePad> {
            self.snapshots += 1;
            self.current.clone()
        }
    }

    fn pad(index: usize, axis0: f64) -> NativePad {
        let mut axes = vec![0.0; AXIS_COUNT];
        axes[0] = axis0;
        NativePad {
            index,
            id: "P (Vendor: 20d6 Product: a720)".into(),
            name: "P".into(),
            vendor_id: Some(0x20d6),
            product_id: Some(0xa720),
            connected: true,
            buttons: vec![0.0; MIN_BUTTONS],
            axes,
        }
    }

    fn conn() -> Drained {
        Drained {
            any: true,
            connection_changed: true,
        }
    }

    fn ev() -> Drained {
        Drained {
            any: true,
            connection_changed: false,
        }
    }

    #[test]
    fn init_failure_returns_quietly() {
        let mut emits = 0;
        let mut polls = 0;
        run_reader(
            || Err::<FakeSource, _>("nope".to_string()),
            |_| emits += 1,
            || {
                polls += 1;
                true
            },
        );
        assert_eq!((emits, polls), (0, 0));
    }

    #[test]
    fn hotplug_emits_disconnect_and_reconnect() {
        let mut src = FakeSource::new(vec![
            (conn(), vec![pad(0, 0.0)]),
            (conn(), vec![]),
            (conn(), vec![pad(0, 0.0)]),
            (conn(), vec![pad(1, 0.0)]),
        ]);
        let mut gate = EmitGate::new();
        let t0 = Instant::now();
        let mut got = Vec::new();
        // Same instant every tick: connection changes must not wait on the interval.
        for _ in 0..4 {
            got.push(gate.tick(t0, &mut src).expect("emit").pads);
        }
        assert_eq!(got[0], vec![pad(0, 0.0)]);
        assert!(got[1].is_empty());
        assert_eq!(got[2], vec![pad(0, 0.0)]);
        assert_eq!(got[3][0].index, 1);
    }

    #[test]
    fn held_stick_is_coalesced() {
        let mut steps: Vec<_> = (0..250).map(|i| (ev(), vec![pad(0, i as f64)])).collect();
        steps.push((
            Drained {
                any: false,
                connection_changed: false,
            },
            vec![pad(0, 249.0)],
        ));
        let mut src = FakeSource::new(steps);
        let mut gate = EmitGate::new();
        let t0 = Instant::now();
        let mut emits = Vec::new();
        for i in 0..250u64 {
            let now = t0 + Duration::from_millis(4 * i);
            if let Some(p) = gate.tick(now, &mut src) {
                emits.push(p);
            }
        }
        assert!(emits.len() <= 1000 / 8 + 1, "emits = {}", emits.len());
        // Changes stopped; the next tick past the interval delivers the final value.
        let now = t0 + Duration::from_millis(4 * 249 + 8);
        if let Some(p) = gate.tick(now, &mut src) {
            emits.push(p);
        }
        assert_eq!(emits.last().unwrap().pads[0].axes[0], 249.0);
    }

    #[test]
    fn idle_tick_takes_no_snapshot() {
        let mut src = FakeSource::new(vec![]);
        let mut gate = EmitGate::new();
        assert!(gate.tick(Instant::now(), &mut src).is_none());
        assert_eq!(src.snapshots, 0);
    }

    #[test]
    fn unchanged_state_not_reemitted() {
        let mut src = FakeSource::new(vec![(ev(), vec![pad(0, 0.5)]), (ev(), vec![pad(0, 0.5)])]);
        let mut gate = EmitGate::new();
        let t0 = Instant::now();
        assert!(gate.tick(t0, &mut src).is_some());
        assert!(gate
            .tick(t0 + Duration::from_millis(20), &mut src)
            .is_none());
    }

    fn close(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-4
    }

    #[test]
    fn hat_matches_measured_chromium_values() {
        assert!(close(hat_value(0.0, 1.0), -1.0));
        assert!(close(hat_value(1.0, 0.0), -0.42857));
        assert!(close(hat_value(0.0, -1.0), 0.14286));
        assert!(close(hat_value(-1.0, 0.0), 0.71429));
        assert!(close(hat_value(0.0, 0.0), 3.28571));
        assert!(close(hat_value(1.0, 1.0), -0.71429));
        assert!(close(hat_value(-1.0, 1.0), 1.0));
    }

    #[test]
    fn pad_id_follows_chromium_format() {
        let name = "PowerA Advantage Wired Controller for Nintendo Switch 2";
        assert_eq!(
            pad_id(name, Some(0x20d6), Some(0xa720)),
            "PowerA Advantage Wired Controller for Nintendo Switch 2 (Vendor: 20d6 Product: a720)"
        );
        assert_eq!(
            pad_id("X", Some(0x045e), Some(0x02ea)),
            "X (Vendor: 045e Product: 02ea)"
        );
        assert_eq!(pad_id("X", None, Some(1)), "X");
        assert_eq!(pad_id("X", Some(1), None), "X");
    }

    #[test]
    fn buttons_are_padded_and_placed() {
        let none = shape_buttons(Vec::new());
        assert_eq!(none.len(), MIN_BUTTONS);
        assert!(none.iter().all(|v| *v == 0.0));

        let three = shape_buttons(vec![(0x09_0003, 1.0)]);
        assert_eq!(three[2], 1.0);

        let twenty = shape_buttons(vec![(0x09_0014, 1.0)]);
        assert_eq!(twenty.len(), 20);
        assert_eq!(twenty[19], 1.0);

        let ignored = shape_buttons(vec![(0x09_0000, 1.0), (0x01_0003, 1.0)]);
        assert_eq!(ignored.len(), MIN_BUTTONS);
        assert!(ignored.iter().all(|v| *v == 0.0));
    }

    #[test]
    fn axes_are_placed_and_y_reversed() {
        let neutral = shape_axes(Vec::new(), None);
        assert_eq!(neutral.len(), AXIS_COUNT);
        assert!(close(neutral[HAT_AXIS_INDEX], HAT_NEUTRAL));

        let placed = shape_axes(
            vec![
                (0x01_0030, 0.5, false),
                (0x01_0035, -0.25, false),
                (0x01_0031, 0.75, true),
                (0x01_0036, 0.9, false),
                (0x01_002f, 0.9, false),
                (0x09_0030, 0.9, false),
            ],
            None,
        );
        assert_eq!(placed[0], 0.5);
        assert_eq!(placed[5], -0.25);
        assert_eq!(placed[1], -0.75);
        assert_eq!(placed.len(), AXIS_COUNT);
        assert!(placed[2..5].iter().all(|v| *v == 0.0));

        let hat = shape_axes(Vec::new(), Some((0.0, 1.0)));
        assert!(close(hat[HAT_AXIS_INDEX], -1.0));
    }
}
