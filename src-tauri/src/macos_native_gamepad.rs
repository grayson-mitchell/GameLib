//! Quick task 261031-mj9 (from spike 051, `.planning/spikes/051-powera-pad-drives-gamelib-macos/`):
//! native gamepad source for pads WebKit does not expose.
//!
//! WKWebView on macOS does not surface HID pads that Apple's GameController framework does not
//! claim. This module reads pads with `gilrs` (IOKit backend) on a background thread and emits
//! each pad's state as a `native_gamepad` event; the shaping into Chromium's raw-HID report lives
//! in the cfg-free `native_gamepad_shape` so `cargo test` covers it on every OS.
//!
//! Emits only on change, coalesced by `EmitGate`. Started once from `.setup()`; the thread never touches the webview
//! directly, only `AppHandle::emit`.

use crate::native_gamepad_shape::{
    pad_id, run_reader, shape_axes, shape_buttons, Drained, NativePad, PadSource,
    NATIVE_GAMEPAD_EVENT,
};
use gilrs::ev::AxisOrBtn;
use gilrs::{Axis, EventType, Gilrs};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const POLL_INTERVAL: Duration = Duration::from_millis(4);

fn snapshot(gilrs: &Gilrs) -> Vec<NativePad> {
    let mut pads = Vec::new();
    for (id, gp) in gilrs.gamepads() {
        let buttons = shape_buttons(
            gp.state()
                .buttons()
                .map(|(code, data)| (code.into_u32(), data.value() as f64)),
        );
        let mut has_hat = false;
        let mut axis_data = Vec::new();
        for (code, data) in gp.state().axes() {
            let name = gp.axis_or_btn_name(code);
            let is_y = matches!(
                name,
                Some(AxisOrBtn::Axis(Axis::LeftStickY | Axis::RightStickY))
            );
            if matches!(name, Some(AxisOrBtn::Axis(Axis::DPadX | Axis::DPadY))) {
                has_hat = true;
            }
            axis_data.push((code.into_u32(), data.value() as f64, is_y));
        }
        let hat = has_hat.then(|| (gp.value(Axis::DPadX), gp.value(Axis::DPadY)));
        let axes = shape_axes(axis_data, hat);
        let name = gp.os_name();
        pads.push(NativePad {
            index: usize::from(id),
            id: pad_id(name, gp.vendor_id(), gp.product_id()),
            name: name.to_string(),
            vendor_id: gp.vendor_id(),
            product_id: gp.product_id(),
            connected: gp.is_connected(),
            buttons,
            axes,
        });
    }
    pads
}

struct GilrsSource(Gilrs);

impl PadSource for GilrsSource {
    fn drain_events(&mut self) -> Drained {
        let mut d = Drained {
            any: false,
            connection_changed: false,
        };
        while let Some(ev) = self.0.next_event() {
            d.any = true;
            if matches!(ev.event, EventType::Connected | EventType::Disconnected) {
                d.connection_changed = true;
            }
        }
        d
    }

    fn snapshot(&mut self) -> Vec<NativePad> {
        snapshot(&self.0)
    }
}

/// Spawns the reader thread. Non-blocking and infallible: a spawn or gilrs init failure is
/// logged and the renderer simply sees no native pads.
pub fn start(app: AppHandle) {
    let spawned = std::thread::Builder::new()
        .name("native-gamepad".into())
        .spawn(move || {
            run_reader(
                || Gilrs::new().map(GilrsSource).map_err(|e| e.to_string()),
                |p| {
                    let _ = app.emit(NATIVE_GAMEPAD_EVENT, p.clone());
                },
                || {
                    std::thread::sleep(POLL_INTERVAL);
                    true
                },
            );
        });
    if let Err(e) = spawned {
        shell_eprintln!("[native-gamepad] could not spawn reader thread: {e}");
    }
}
