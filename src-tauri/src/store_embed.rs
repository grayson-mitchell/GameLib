use super::*;

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

/// Parse `store_embed_set_bounds`'s `{ x, y, w, h }` args, all logical px.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
pub(crate) fn store_embed_set_bounds_args(args: &[Value]) -> Result<(f64, f64, f64, f64), String> {
    let a = StoreEmbedSetBoundsArgs::from_args(args)?;
    Ok((a.x, a.y, a.w, a.h))
}

/// Convert the renderer's logical-px slot rect into the `i32` rect GTK's container API takes.
///
/// GTK's integer API FORCES rounding on Linux (`Fixed::move_` / `set_size_request` take `i32`).
/// This is a Linux-only statement and is NOT a relaxation of D-18's no-rounding rule on macOS,
/// where `set_position`/`set_size` still receive the renderer's `f64` verbatim. `f64::round`
/// rounds half away from zero; spike 026's fractional slot rect (290.5, 96.5, 760.25, 560.75)
/// becomes (291, 97, 760, 561).
///
/// Rejected, each with a named error rather than a clamp or a saturating `as i32`:
/// - non-finite input (`NaN`, infinities);
/// - a value that does not fit in `i32` after rounding;
/// - a negative width or height, because GTK reads `-1` as "unset" and passing it through would
///   silently change the meaning. A negative x/y IS legal (the slot is partly scrolled off, and
///   `GtkFixed` accepts it).
#[cfg(target_os = "linux")]
pub(crate) fn store_embed_linux_gtk_rect(
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<(i32, i32, i32, i32), String> {
    for (name, v) in [("x", x), ("y", y), ("w", w), ("h", h)] {
        if !v.is_finite() {
            return Err(format!("store_embed_set_bounds:non-finite:{name}"));
        }
    }
    let to_i32 = |name: &str, v: f64| -> Result<i32, String> {
        let r = v.round();
        if r < f64::from(i32::MIN) || r > f64::from(i32::MAX) {
            return Err(format!("store_embed_set_bounds:out-of-range:{name}"));
        }
        Ok(r as i32)
    };
    let (xi, yi, wi, hi) = (
        to_i32("x", x)?,
        to_i32("y", y)?,
        to_i32("w", w)?,
        to_i32("h", h)?,
    );
    if wi < 0 || hi < 0 {
        return Err("store_embed_set_bounds:negative-size".to_string());
    }
    Ok((xi, yi, wi, hi))
}

/// True when a slot rect has no area. The renderer's `ResizeObserver` reports `0,0,0x0` when the
/// slot unmounts (a route change, or the Epic panel replacing the slot), and by then the embed is
/// hidden. Applying that rect would park the embed at (0,0) with no usable size, and the next
/// `show()` would draw it over the app chrome (measured live, quick 260930-blh). The Linux branch
/// therefore keeps the last real geometry for a zero-area rect and logs that it did.
#[cfg(target_os = "linux")]
pub(crate) fn store_embed_linux_rect_is_zero_area(rect: (i32, i32, i32, i32)) -> bool {
    rect.2 == 0 || rect.3 == 0
}

/// The macOS sibling of the guard above, on the renderer's `f64` logical rect rather than a
/// converted `i32` one (macOS takes the rect verbatim -- see `store_embed_linux_gtk_rect`'s own
/// note that rounding is a Linux-only consequence of GTK's integer API).
///
/// Since quick 261012-f25 this guard covers Windows too: a 0x0 rect would be applied verbatim by
/// WebView2's `SetWindowPos`, the same hazard measured on macOS. The Windows half is by
/// construction and unmeasured live.
///
/// Measured live on macOS 2026-10-01 (quick 261001-svm), AFTER that task's `show()` fix had
/// already landed: `/store/gog` -> `/store/epic` -> `/store/gog` left the embed invisible even
/// though it was by then being SHOWN. `window.api.storeEmbedShow()` did not bring it back and a
/// bounds flush alone DID, which is what identifies the surviving cause as geometry, not
/// visibility. The Epic panel replaces the slot while the hook stays mounted, so the slot's
/// ResizeObserver reports a final 0x0 rect that this function's caller used to apply verbatim;
/// nothing on macOS re-applies a real rect afterwards, so the embed stayed 0x0 until a genuine
/// window resize. Once in that state even a `/library` round trip stayed blank -- also measured.
///
/// This is the same deliberate deviation from D-18's "apply the oracle's rect verbatim" that the
/// Linux branch took on 2026-09-30, and it carries the same accepted edge: a slot that genuinely
/// collapses to zero area WHILE VISIBLE now keeps its old geometry instead of vanishing. That
/// edge remains unmeasured on both platforms.
/// Non-finite input is folded into the same "not a usable geometry" answer rather than given its
/// own error: Linux rejects `NaN`/infinities during its `i32` conversion, and macOS has no
/// conversion step to reject them in, so this is where they stop. Spelled with `is_finite` and
/// `<=` rather than the shorter `!(w > 0.0)` -- that form also catches `NaN`, but clippy's
/// `neg_cmp_op_on_partial_ord` fires on it twice and the crate's warning ceiling is pinned.
#[cfg(any(target_os = "macos", target_os = "windows"))]
pub(crate) fn store_embed_rect_is_zero_area(w: f64, h: f64) -> bool {
    !w.is_finite() || !h.is_finite() || w <= 0.0 || h <= 0.0
}

/// The one line the Linux layout logs once the embed's geometry has settled. Geometry only --
/// never a URL. `requested` is what the renderer asked for (rounded); `embed` and `main` are the
/// MEASURED GTK allocations (embed relative to main's origin, main relative to the overlay);
/// `vbox` is the measured size of the container holding the overlay. A live run is judged by
/// `check_settled.py` over these lines: embed == requested AND main == (0, 0, vbox_w, vbox_h).
#[cfg(target_os = "linux")]
pub(crate) fn store_embed_linux_settled_line(
    requested: (i32, i32, i32, i32),
    embed: (i32, i32, i32, i32),
    main: (i32, i32, i32, i32),
    vbox: (i32, i32),
) -> String {
    format!(
        "[shell] store_embed(linux): settled requested={},{},{}x{} embed={},{},{}x{} \
         main={},{},{}x{} vbox={}x{}",
        requested.0,
        requested.1,
        requested.2,
        requested.3,
        embed.0,
        embed.1,
        embed.2,
        embed.3,
        main.0,
        main.1,
        main.2,
        main.3,
        vbox.0,
        vbox.1
    )
}

/// D-18: the renderer is the SOLE geometry writer; this arm applies whatever it sends VERBATIM
/// via `set_position`/`set_size` -- no clamping, offsetting, rounding, or default-supplying.
/// Spike 017 measured that two geometry writers silently last-write-wins with no error, so this
/// function is the ONLY place in the Rust tree that may call `Webview::set_position` or
/// `Webview::set_size` on the embed (T-40-02-03). Do not add a second call site, and do not add
/// a "sensible default bounds" fallback here -- that is exactly the second writer D-18 forbids.
///
/// On Linux the sole writer is the `#[cfg(target_os = "linux")]` branch below
/// (`linux_store_embed_layout::apply_bounds`, a `gtk::Fixed::move_` + `set_size_request` +
/// `queue_resize`), plus
/// the one initial `put` in `linux_store_embed_layout::mount` -- mirroring `add_child`'s initial
/// rect on macOS. `Webview::set_position`/`set_size` are never called on Linux: wry's `set_bounds`
/// is a silent no-op there unless the widget's parent is already a fixed container, so calling
/// them would be both dead and a second writer.
///
/// On Windows the sole writer is the same `set_position`/`set_size` pair as macOS (quick
/// 261012-f25). wry's WebView2 `set_bounds` is an unconditional `SetWindowPos` (spike 027 README,
/// step 5), measured at 0 px error at scale 1.25 on the spike harness. It has not yet been
/// measured in the shipped app.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
pub(crate) fn store_embed_set_bounds(app: &AppHandle, args: &[Value]) -> Result<Value, String> {
    let (x, y, w, h) = store_embed_set_bounds_args(args)?;
    // Phase 50 Plan 01 (D-18): when the Epic surface is selected, it is the sole owner of this
    // rect -- route there and return, rather than also re-applying it to the (hidden) Tauri
    // embed below, which would make `set_bounds` a second geometry writer for whichever surface
    // isn't currently showing.
    #[cfg(target_os = "macos")]
    {
        if macos_epic_embed::is_selected() {
            return macos_epic_embed::set_bounds(app, x, y, w, h);
        }
    }
    #[cfg(target_os = "linux")]
    let linux_rect = store_embed_linux_gtk_rect(x, y, w, h)?;
    let webview = app
        .get_webview(STORE_EMBED_LABEL)
        .ok_or_else(|| format!("store_embed_set_bounds:no-webview:{STORE_EMBED_LABEL}"))?;
    #[cfg(target_os = "linux")]
    {
        if store_embed_linux_rect_is_zero_area(linux_rect) {
            shell_eprintln!(
                "[shell] store_embed(linux): ignored zero-area bounds (slot unmounted); \
                 keeping the last real geometry"
            );
            return Ok(Value::Null);
        }
        linux_store_embed_layout::apply_bounds(&webview, linux_rect)?;
        return Ok(Value::Null);
    }
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        if store_embed_rect_is_zero_area(w, h) {
            shell_eprintln!(
                "[shell] store_embed({}): ignored zero-area bounds (slot unmounted); \
                 keeping the last real geometry",
                std::env::consts::OS
            );
            return Ok(Value::Null);
        }
        store_embed_apply_rect(app, &webview, x, y, w, h)?;
        Ok(Value::Null)
    }
}

pub(crate) fn rpc_store_embed_set_bounds(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    {
        store_embed_set_bounds(app, args)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("store_embed_set_bounds:unsupported-platform".to_string())
    }
}

/// macOS/Windows: the single `set_position`/`set_size` writer for the Tauri-managed embed (see
/// `store_embed_set_bounds`' doc comment). On macOS `y` gains the visible titlebar's height first
/// (`macos_epic_embed::main_window_content_top_inset`): wry positions a child in the content
/// view, which under `TitleBarStyle::Visible` spans the titlebar the renderer's viewport starts
/// below. The renderer's rect stays the only rect source (D-18); this is a coordinate-space
/// correction, not a fallback rect. Callers have already applied the zero-area guard.
#[cfg(any(target_os = "macos", target_os = "windows"))]
fn store_embed_apply_rect(
    app: &AppHandle,
    webview: &tauri::Webview,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let y = y + macos_epic_embed::main_window_content_top_inset(app)?;
    #[cfg(not(target_os = "macos"))]
    let _ = app;
    webview
        .set_position(tauri::LogicalPosition::new(x, y))
        .map_err(|e| format!("store_embed_set_bounds:set_position-failed:{e}"))?;
    webview
        .set_size(tauri::LogicalSize::new(w, h))
        .map_err(|e| format!("store_embed_set_bounds:set_size-failed:{e}"))?;
    Ok(())
}

/// Linux layout for the store/wiki embed (quick 260930-blh; strategy (a) of
/// `.planning/todos/completed/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md`,
/// spikes 028/029). Public Tauri Linux API plus stock gtk-rs only -- no `tauri-runtime-wry`/wry
/// patch.
///
/// The layout: on the FIRST open, the main webview's widget moves out of the shared
/// `default_vbox()` into an application-created `gtk::Overlay`, packed into the vbox at main's old
/// position with expand/fill. A `gtk::Fixed` is that Overlay's only overlay child
/// (`set_overlay_pass_through(true)`, so clicks outside the embed reach main). The embed webview
/// Tauri packed into the vbox is then moved into that Fixed and positioned with
/// `Fixed::move_` + `set_size_request`. The Fixed is NEVER a vbox sibling of main (spike 029
/// measured main squeezed to 61-125px when it was).
///
/// Every GTK call runs on the GTK main thread through `Webview::with_webview`; the callers are
/// `rustInvoke` workers, so a bounded `recv_timeout` cannot deadlock.
#[cfg(target_os = "linux")]
pub(crate) mod linux_store_embed_layout {
    use super::{store_embed_linux_settled_line, AppHandle, MAIN_WINDOW_LABEL};
    use gtk::prelude::*;
    use std::cell::Cell;
    use std::time::Duration;
    use tauri::Manager;

    const OVERLAY_NAME: &str = "gamelib-store-embed-overlay";
    const FIXED_NAME: &str = "gamelib-store-embed-fixed";
    const GTK_DISPATCH_TIMEOUT: Duration = Duration::from_secs(10);
    const SETTLE_MS: u64 = 500;

    type Rect = (i32, i32, i32, i32);

    thread_local! {
        /// Bumped on every scheduled settled-log; a timer fires only if it is still current, so
        /// sustained motion logs one line per settle rather than one per frame. GTK main thread only.
        static SETTLE_GENERATION: Cell<u64> = const { Cell::new(0) };
    }

    /// Run `f` on the GTK main thread against one webview's widget. `with_webview`'s own `Ok` is
    /// NOT proof the closure ran (the queued closure can be dropped), so the result is awaited
    /// over a channel with a bounded timeout.
    fn on_gtk_thread<T: Send + 'static>(
        webview: &tauri::Webview,
        op: &str,
        f: impl FnOnce(gtk::Widget) -> Result<T, String> + Send + 'static,
    ) -> Result<T, String> {
        let (tx, rx) = std::sync::mpsc::channel();
        webview
            .with_webview(move |pw| {
                let widget: gtk::Widget = pw.inner().upcast();
                let _ = tx.send(f(widget));
            })
            .map_err(|e| format!("{op}:with-webview-failed:{e}"))?;
        rx.recv_timeout(GTK_DISPATCH_TIMEOUT)
            .map_err(|_| format!("{op}:gtk-dispatch-timeout"))?
    }

    fn find_child_named(container: &gtk::Container, name: &str) -> Option<gtk::Widget> {
        container
            .children()
            .into_iter()
            .find(|c| c.widget_name().as_str() == name)
    }

    /// Idempotently restructure the main window's GTK hierarchy: main -> Overlay(main, Fixed).
    pub fn ensure_overlay(app: &AppHandle) -> Result<(), String> {
        let main = app
            .get_webview(MAIN_WINDOW_LABEL)
            .ok_or_else(|| format!("store_embed_open:no-webview:{MAIN_WINDOW_LABEL}"))?;
        let app2 = app.clone();
        on_gtk_thread(&main, "store_embed_open", move |main_w| {
            let parent = main_w
                .parent()
                .ok_or_else(|| "store_embed_open:linux-main-has-no-parent".to_string())?;
            if parent.widget_name().as_str() == OVERLAY_NAME {
                return Ok(());
            }
            let window = app2
                .get_window(MAIN_WINDOW_LABEL)
                .ok_or_else(|| format!("store_embed_open:no-window:{MAIN_WINDOW_LABEL}"))?;
            let vbox = window
                .default_vbox()
                .map_err(|e| format!("store_embed_open:default-vbox-failed:{e}"))?;
            let vbox_w: gtk::Widget = vbox.clone().upcast();
            if parent != vbox_w {
                // Never restructure a hierarchy we do not recognise.
                return Err(format!(
                    "store_embed_open:linux-unexpected-main-parent:{}",
                    parent.type_().name()
                ));
            }
            let pos = vbox.child_position(&main_w);
            vbox.remove(&main_w);
            let overlay = gtk::Overlay::new();
            overlay.set_widget_name(OVERLAY_NAME);
            overlay.add(&main_w);
            let fixed = gtk::Fixed::new();
            fixed.set_widget_name(FIXED_NAME);
            overlay.add_overlay(&fixed);
            overlay.set_overlay_pass_through(&fixed, true);
            vbox.pack_start(&overlay, true, true, 0);
            vbox.reorder_child(&overlay, pos);
            overlay.show();
            fixed.show();
            main_w.show();
            main_w.grab_focus();
            Ok(())
        })
    }

    /// Move the freshly `add_child`-ed embed out of the vbox and into the pass-through Fixed at
    /// `rect`.
    pub fn mount(app: &AppHandle, embed: &tauri::Webview, rect: Rect) -> Result<(), String> {
        let app2 = app.clone();
        on_gtk_thread(embed, "store_embed_open", move |embed_w| {
            let window = app2
                .get_window(MAIN_WINDOW_LABEL)
                .ok_or_else(|| format!("store_embed_open:no-window:{MAIN_WINDOW_LABEL}"))?;
            let vbox = window
                .default_vbox()
                .map_err(|e| format!("store_embed_open:default-vbox-failed:{e}"))?;
            let overlay_w = find_child_named(vbox.upcast_ref(), OVERLAY_NAME)
                .ok_or_else(|| "store_embed_open:linux-no-overlay".to_string())?;
            let overlay = overlay_w
                .clone()
                .downcast::<gtk::Overlay>()
                .map_err(|_| "store_embed_open:linux-no-overlay".to_string())?;
            let fixed = find_child_named(overlay.upcast_ref(), FIXED_NAME)
                .and_then(|w| w.downcast::<gtk::Fixed>().ok())
                .ok_or_else(|| "store_embed_open:linux-no-fixed".to_string())?;
            if let Some(old_parent) = embed_w
                .parent()
                .and_then(|p| p.downcast::<gtk::Container>().ok())
            {
                old_parent.remove(&embed_w);
            }
            fixed.put(&embed_w, rect.0, rect.1);
            embed_w.set_size_request(rect.2, rect.3);
            embed_w.show();
            schedule_settled_log(&embed_w, rect);
            Ok(())
        })
    }

    /// The sole Linux geometry writer after the initial `put` in `mount` (D-18).
    ///
    /// `queue_resize()` follows `set_size_request` on purpose: GTK 3.24 only queues a resize from
    /// `set_size_request` when the widget is VISIBLE. D-21 hides the embed on route leave and the
    /// existing-embed branch of `store_embed_open` applies the rect BEFORE `show()`, so without it
    /// a rect applied while hidden lands at the new position with the old cached size -- and the
    /// renderer's identical follow-up rect cannot repair it, because `set_size_request` then sees
    /// no change. Measured 2026-11-05 on Linux (R2/R6/R7 stale embed size), quick 261105-q1j.
    pub fn apply_bounds(embed: &tauri::Webview, rect: Rect) -> Result<(), String> {
        on_gtk_thread(embed, "store_embed_set_bounds", move |embed_w| {
            let fixed = embed_w
                .parent()
                .filter(|p| p.widget_name().as_str() == FIXED_NAME)
                .and_then(|p| p.downcast::<gtk::Fixed>().ok())
                // A set_bounds racing a first open lands here: distinguishable, never a silent Ok.
                .ok_or_else(|| "store_embed_set_bounds:linux-not-mounted".to_string())?;
            fixed.move_(&embed_w, rect.0, rect.1);
            embed_w.set_size_request(rect.2, rect.3);
            embed_w.queue_resize();
            schedule_settled_log(&embed_w, rect);
            Ok(())
        })
    }

    /// Debounced measurement log. GTK main thread only.
    fn schedule_settled_log(embed_w: &gtk::Widget, requested: Rect) {
        let generation = SETTLE_GENERATION.with(|g| {
            let next = g.get().wrapping_add(1);
            g.set(next);
            next
        });
        let embed_w = embed_w.clone();
        gtk::glib::timeout_add_local_once(Duration::from_millis(SETTLE_MS), move || {
            if SETTLE_GENERATION.with(|g| g.get()) != generation {
                return;
            }
            // Closed since scheduling: nothing to measure.
            let Some(fixed) = embed_w.parent() else {
                return;
            };
            let Some(overlay) = fixed
                .parent()
                .and_then(|p| p.downcast::<gtk::Overlay>().ok())
            else {
                return;
            };
            let Some(main_w) = overlay.child() else {
                shell_eprintln!(
                    "[shell] store_embed(linux): error settled-log: overlay has no main child"
                );
                return;
            };
            let (Some(embed_pos), Some(main_pos)) = (
                embed_w.translate_coordinates(&main_w, 0, 0),
                main_w.translate_coordinates(&overlay, 0, 0),
            ) else {
                shell_eprintln!(
                    "[shell] store_embed(linux): error settled-log: translate_coordinates failed"
                );
                return;
            };
            let Some(vbox) = overlay.parent() else { return };
            shell_eprintln!(
                "{}",
                store_embed_linux_settled_line(
                    requested,
                    (
                        embed_pos.0,
                        embed_pos.1,
                        embed_w.allocated_width(),
                        embed_w.allocated_height()
                    ),
                    (
                        main_pos.0,
                        main_pos.1,
                        main_w.allocated_width(),
                        main_w.allocated_height()
                    ),
                    (vbox.allocated_width(), vbox.allocated_height()),
                )
            );
        });
    }
}

/// D-21: hide on route leave, never close -- the embed's state and history registry survive.
/// Returns a distinguishable error when the label is absent, never a silent `Ok`.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
fn store_embed_hide(app: &AppHandle) -> Result<Value, String> {
    // Phase 50 Plan 01 (D-01/D-02): the Epic surface and the Tauri embed are never visible at
    // once, so whichever one is selected owns this call exclusively -- route there and return.
    #[cfg(target_os = "macos")]
    {
        if macos_epic_embed::is_selected() {
            return macos_epic_embed::hide(app);
        }
    }
    let webview = app
        .get_webview(STORE_EMBED_LABEL)
        .ok_or_else(|| format!("store_embed_hide:no-webview:{STORE_EMBED_LABEL}"))?;
    webview
        .hide()
        .map_err(|e| format!("store_embed_hide:failed:{e}"))?;
    Ok(Value::Null)
}

/// D-21: show after a prior hide. Returns a distinguishable error when the label is absent,
/// never a silent `Ok`.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
fn store_embed_show(app: &AppHandle) -> Result<Value, String> {
    // Phase 50 Plan 01 (D-01/D-02): symmetric with `store_embed_hide` above.
    #[cfg(target_os = "macos")]
    {
        if macos_epic_embed::is_selected() {
            return macos_epic_embed::show(app);
        }
    }
    let webview = app
        .get_webview(STORE_EMBED_LABEL)
        .ok_or_else(|| format!("store_embed_show:no-webview:{STORE_EMBED_LABEL}"))?;
    webview
        .show()
        .map_err(|e| format!("store_embed_show:failed:{e}"))?;
    Ok(Value::Null)
}

/// D-21: close only at teardown -- unlike `store_embed_hide`, this also clears the history
/// registry (D-22), since a closed embed's history is not meant to survive into the next open.
/// Returns a distinguishable error when the label is absent, never a silent `Ok`.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
fn store_embed_close(app: &AppHandle) -> Result<Value, String> {
    // Phase 50 Plan 01 (D-01/D-02): app teardown closes BOTH surfaces, not whichever one is
    // currently selected -- close the Epic surface first, then fall through to the existing
    // Tauri-embed body below rather than returning early. Neither subview may outlive the app.
    #[cfg(target_os = "macos")]
    {
        macos_epic_embed::close(app)?;
    }
    let webview = app
        .get_webview(STORE_EMBED_LABEL)
        .ok_or_else(|| format!("store_embed_close:no-webview:{STORE_EMBED_LABEL}"))?;
    webview
        .close()
        .map_err(|e| format!("store_embed_close:failed:{e}"))?;
    if let Ok(mut state) = store_embed_state().lock() {
        state.clear();
    }
    Ok(Value::Null)
}

/// Drains the navigation states queued by `on_page_load`'s Finished handler (GAP-D, D-22,
/// REQ-40-06). Takes an `AppHandle` only to read the embed's live URL (native `Webview::url()`,
/// no page-side JS) and reconcile same-document navigations (quick 261102-sk8). The queue lives
/// in the process-static `STORE_EMBED_STATE`, NOT on the webview handle -- which is the point. The 013-015 rule is that a poller must be
/// anchored to a SURVIVOR, and the embed's handle dies with the embed; this state does not, so
/// a drain issued while the embed is closed resolves an empty array rather than erroring.
///
/// A poisoned lock IS surfaced as an error here, unlike the `on_page_load` push path (which
/// logs and continues rather than panicking a webview navigation callback). The asymmetry is
/// deliberate: a failed push loses one event, while a failed drain that resolved `[]` would be
/// indistinguishable from a healthy idle channel -- exactly the F-34.4.2-19 defect class this
/// seam's per-field coercion exists to prevent one layer up.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
fn store_embed_take_nav_events(app: &AppHandle) -> Result<Value, String> {
    // Phase 50 Plan 02 (D-01/D-02): the Epic surface queues its OWN nav events
    // (`macos_epic_embed::EpicEmbedSurface::pending_nav_events`) -- route there when it is the
    // selected surface, symmetric with `store_embed_hide`/`show`/`close` above.
    #[cfg(target_os = "macos")]
    {
        if macos_epic_embed::is_selected() {
            return macos_epic_embed::take_nav_events();
        }
    }
    // Never call into the webview while holding the state lock: the main-thread `on_page_load`
    // handler takes that lock and `Webview::url()` round-trips to the main thread, so holding
    // it across the read can deadlock.
    let generation = store_embed_state()
        .lock()
        .map_err(|_| "store_embed_take_nav_events:history-registry-poisoned".to_string())?
        .nav_generation();
    let live_url = app
        .get_webview(STORE_EMBED_LABEL)
        .and_then(|webview| webview.url().ok());
    let mut state = store_embed_state()
        .lock()
        .map_err(|_| "store_embed_take_nav_events:history-registry-poisoned".to_string())?;
    if let Some(live) = live_url {
        if let Some(change) =
            state.observe_live_url_at(live.as_str(), generation, std::time::Instant::now())
        {
            shell_eprintln!(
                "[shell] store_embed: same-document navigation {} host={}",
                change.as_str(),
                live.host_str().unwrap_or("")
            );
        }
    }
    Ok(Value::Array(state.take_nav_events()))
}

/// Parse `store_embed_navigate`'s `{ url }` arg.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
pub(crate) fn store_embed_navigate_args(args: &[Value]) -> Result<tauri::Url, String> {
    let a = StoreEmbedNavigateArgs::from_args(args)?;
    // No fallback URL on a parse failure (same discipline as `store_embed_open_args`).
    tauri::Url::parse(&a.url).map_err(|e| format!("store_embed_navigate:bad-url:{e}"))
}

/// Phase 40 Plan 07 (D-22/D-25): moves the history cursor back one entry and navigates the
/// embed there. Returns the navigation state (`store_embed_nav_state_json`) derived from the
/// cursor's NEW position -- there is no handle to synchronously ask, so this state IS the read.
///
/// ZERO page-side JS injection: this calls `Webview::navigate(Url)`, the vendored-source-verified
/// mechanism (`40-EMBED-API-VERIFICATION.md` Q1/Q2), never `eval()` or any evaluated history
/// call in the page. The 2026-08-03 Talon root-cause identified document-side injection as the
/// confirmed fingerprint vector -- D-22 makes avoiding it a hard rule for every arm in this
/// section, not a preference, and this comment is the reason a future reader reaching for
/// `eval` here should stop.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
fn store_embed_back(app: &AppHandle) -> Result<Value, String> {
    // Phase 50 Plan 02 (D-01/D-02): the Epic surface owns its own NATIVE back/forward via
    // `WKWebView::goBack()`/`canGoBack()` -- it tracks no Rust-side history stack (see
    // `macos_epic_embed`'s module doc comment). Route there when it is the selected surface,
    // symmetric with `store_embed_hide`/`show`/`close` above.
    #[cfg(target_os = "macos")]
    {
        if macos_epic_embed::is_selected() {
            return macos_epic_embed::back(app);
        }
    }
    let webview = app
        .get_webview(STORE_EMBED_LABEL)
        .ok_or_else(|| format!("store_embed_back:no-webview:{STORE_EMBED_LABEL}"))?;
    let (target_url, json) = {
        let mut state = store_embed_state()
            .lock()
            .map_err(|_| "store_embed_back:history-registry-poisoned".to_string())?;
        let Some(target_url) = state.go_back() else {
            return Err("store_embed_back:no-back-entry".to_string());
        };
        (target_url, store_embed_nav_state_json(&state))
    };
    let parsed_url = tauri::Url::parse(&target_url)
        .map_err(|e| format!("store_embed_back:bad-recorded-url:{e}"))?;
    webview
        .navigate(parsed_url)
        .map_err(|e| format!("store_embed_back:navigate-failed:{e}"))?;
    Ok(json)
}

/// The mirror of `store_embed_back` -- see its doc comment for the shared rationale (D-22/D-25,
/// ZERO page-side JS injection via `Webview::navigate(Url)`, never `eval`).
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
fn store_embed_forward(app: &AppHandle) -> Result<Value, String> {
    // Phase 50 Plan 02 (D-01/D-02): symmetric with `store_embed_back` above.
    #[cfg(target_os = "macos")]
    {
        if macos_epic_embed::is_selected() {
            return macos_epic_embed::forward(app);
        }
    }
    let webview = app
        .get_webview(STORE_EMBED_LABEL)
        .ok_or_else(|| format!("store_embed_forward:no-webview:{STORE_EMBED_LABEL}"))?;
    let (target_url, json) = {
        let mut state = store_embed_state()
            .lock()
            .map_err(|_| "store_embed_forward:history-registry-poisoned".to_string())?;
        let Some(target_url) = state.go_forward() else {
            return Err("store_embed_forward:no-forward-entry".to_string());
        };
        (target_url, store_embed_nav_state_json(&state))
    };
    let parsed_url = tauri::Url::parse(&target_url)
        .map_err(|e| format!("store_embed_forward:bad-recorded-url:{e}"))?;
    webview
        .navigate(parsed_url)
        .map_err(|e| format!("store_embed_forward:navigate-failed:{e}"))?;
    Ok(json)
}

/// Reloads the embed's current page. Arms the one-shot suppression flag FIRST (T-40-07-05) so
/// the `on_page_load` Finished event this reload produces does not push a duplicate history
/// entry for the same URL -- reload must leave the stack unchanged. Calls `Webview::reload()`,
/// never `eval('location.reload()')` (D-22's zero-page-side-JS-injection rule, see
/// `store_embed_back`'s doc comment).
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
fn store_embed_reload(app: &AppHandle) -> Result<Value, String> {
    // Phase 50 Plan 02 (D-01/D-02): symmetric with `store_embed_hide`/`show`/`close` above --
    // the Epic surface's `reload()` re-issues the webview's own current URL, leaving
    // `canGoBack`/`canGoForward` unchanged, matching this arm's own suppression discipline.
    #[cfg(target_os = "macos")]
    {
        if macos_epic_embed::is_selected() {
            return macos_epic_embed::reload(app);
        }
    }
    let webview = app
        .get_webview(STORE_EMBED_LABEL)
        .ok_or_else(|| format!("store_embed_reload:no-webview:{STORE_EMBED_LABEL}"))?;
    let json = {
        let mut state = store_embed_state()
            .lock()
            .map_err(|_| "store_embed_reload:history-registry-poisoned".to_string())?;
        state.arm_reload_suppression();
        store_embed_nav_state_json(&state)
    };
    webview
        .reload()
        .map_err(|e| format!("store_embed_reload:failed:{e}"))?;
    Ok(json)
}

/// The arm plan `40-09`'s deep-link and route-change paths use (T-40-07 interfaces contract).
/// A `store_embed_navigate` call is ITSELF the user-initiated event, so it pushes the new URL
/// immediately -- like a browser's `history.pushState` -- rather than waiting for
/// `on_page_load`'s Finished event to land asynchronously after the network round trip;
/// waiting would return a stale nav state to the caller. It then arms the one-shot suppression
/// flag so that same Finished event (which WILL still fire for this navigation) does not
/// double-push the URL this call already recorded. Pushing truncates any forward entries past
/// the cursor, exactly like a user-initiated navigation (D-22).
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
pub(crate) fn store_embed_navigate(app: &AppHandle, args: &[Value]) -> Result<Value, String> {
    let url = store_embed_navigate_args(args)?;
    // Phase 50 Plan 02 (D-01/D-02): symmetric with `store_embed_hide`/`show`/`close` above.
    #[cfg(target_os = "macos")]
    {
        if macos_epic_embed::is_selected() {
            return macos_epic_embed::navigate(app, &url);
        }
    }
    let webview = app
        .get_webview(STORE_EMBED_LABEL)
        .ok_or_else(|| format!("store_embed_navigate:no-webview:{STORE_EMBED_LABEL}"))?;
    let json = {
        let mut state = store_embed_state()
            .lock()
            .map_err(|_| "store_embed_navigate:history-registry-poisoned".to_string())?;
        state.push(url.to_string());
        state.arm_reload_suppression();
        store_embed_nav_state_json(&state)
    };
    webview
        .navigate(url)
        .map_err(|e| format!("store_embed_navigate:navigate-failed:{e}"))?;
    Ok(json)
}

pub(crate) fn rpc_store_embed_hide(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    StoreEmbedHideArgs::from_args(args)?;
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    {
        store_embed_hide(app)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("store_embed_hide:unsupported-platform".to_string())
    }
}

pub(crate) fn rpc_store_embed_show(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    StoreEmbedShowArgs::from_args(args)?;
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    {
        store_embed_show(app)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("store_embed_show:unsupported-platform".to_string())
    }
}

pub(crate) fn rpc_store_embed_close(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    StoreEmbedCloseArgs::from_args(args)?;
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    {
        store_embed_close(app)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("store_embed_close:unsupported-platform".to_string())
    }
}

// GAP-D (quick task `260905-e61`, D-22, REQ-40-06): the arm that carries an IN-EMBED
// navigation back to the renderer. Without it the four arms below only ever reported
// state for navigations the USER's own chrome initiated, so clicking a link inside the
// embed moved this process's cursor while the renderer's `canGoBack` stayed false
// forever. Drains, never peeks -- same contract as `humble_login_take_events` above.
pub(crate) fn rpc_store_embed_take_nav_events(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    StoreEmbedTakeNavEventsArgs::from_args(args)?;
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    {
        store_embed_take_nav_events(app)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("store_embed_take_nav_events:unsupported-platform".to_string())
    }
}

// Phase 40 Plan 07 (D-22/D-25): the four navigation arms. Each returns the navigation
// state (`store_embed_nav_state_json`) derived from the Rust-owned cursor -- there is
// no `canGoBack()`-style handle to query, so this pushed/returned state IS the read
// (control inverts: Rust pushes, the frontend never polls).
pub(crate) fn rpc_store_embed_back(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    StoreEmbedBackArgs::from_args(args)?;
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    {
        store_embed_back(app)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("store_embed_back:unsupported-platform".to_string())
    }
}

pub(crate) fn rpc_store_embed_forward(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    StoreEmbedForwardArgs::from_args(args)?;
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    {
        store_embed_forward(app)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("store_embed_forward:unsupported-platform".to_string())
    }
}

pub(crate) fn rpc_store_embed_reload(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    StoreEmbedReloadArgs::from_args(args)?;
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    {
        store_embed_reload(app)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("store_embed_reload:unsupported-platform".to_string())
    }
}

pub(crate) fn rpc_store_embed_navigate(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    {
        store_embed_navigate(app, args)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("store_embed_navigate:unsupported-platform".to_string())
    }
}
