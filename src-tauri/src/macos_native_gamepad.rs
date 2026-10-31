//! Quick task 261031-mj9 (from spike 051, `.planning/spikes/051-powera-pad-drives-gamelib-macos/`):
//! native gamepad source for pads WebKit does not expose.
//!
//! WKWebView on macOS does not surface HID pads that Apple's GameController framework does not
//! claim. This module reads pads with `gilrs` (IOKit backend) on a background thread and emits
//! each pad's state as a `native_gamepad` event; the shaping into Chromium's raw-HID report lives
//! in the cfg-free `native_gamepad_shape` so `cargo test` covers it on every OS.
//!
//! Emits only on change. Started once from `.setup()`; the thread never touches the webview
//! directly, only `AppHandle::emit`.

use crate::native_gamepad_shape::{
    pad_id, shape_axes, shape_buttons, NativeGamepadPayload, NativePad, NATIVE_GAMEPAD_EVENT,
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

/// Spawns the reader thread. Non-blocking and infallible: a spawn or gilrs init failure is
/// logged and the renderer simply sees no native pads.
pub fn start(app: AppHandle) {
    let spawned = std::thread::Builder::new()
        .name("native-gamepad".into())
        .spawn(move || {
            let mut gilrs = match Gilrs::new() {
                Ok(g) => g,
                Err(e) => {
                    eprintln!("[native-gamepad] gilrs init failed: {e}");
                    return;
                }
            };
            let mut last: Vec<NativePad> = Vec::new();
            loop {
                let mut changed_pads = false;
                while let Some(ev) = gilrs.next_event() {
                    if matches!(ev.event, EventType::Connected | EventType::Disconnected) {
                        changed_pads = true;
                    }
                }
                let pads = snapshot(&gilrs);
                if changed_pads || pads != last {
                    if changed_pads {
                        for p in &pads {
                            eprintln!(
                                "[native-gamepad] pad {} {:?} connected={}",
                                p.index, p.id, p.connected
                            );
                        }
                    }
                    let _ = app.emit(
                        NATIVE_GAMEPAD_EVENT,
                        NativeGamepadPayload { pads: pads.clone() },
                    );
                    last = pads;
                }
                std::thread::sleep(POLL_INTERVAL);
            }
        });
    if let Err(e) = spawned {
        eprintln!("[native-gamepad] could not spawn reader thread: {e}");
    }
}
