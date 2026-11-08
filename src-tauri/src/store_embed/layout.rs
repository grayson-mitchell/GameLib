use super::*;

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
pub(crate) fn store_embed_apply_rect(
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

#[cfg(test)]
mod tests {
    use super::*;

    // ---- Linux GTK-box-native store-embed layout (quick 260930-blh) -- pure helpers only ----

    #[cfg(target_os = "linux")]
    #[test]
    fn store_embed_linux_gtk_rect_rounds_fractional_px_half_away_from_zero() {
        // Spike 026's fractional slot rect.
        assert_eq!(
            store_embed_linux_gtk_rect(290.5, 96.5, 760.25, 560.75),
            Ok((291, 97, 760, 561))
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn store_embed_linux_gtk_rect_accepts_a_zero_rect() {
        assert_eq!(
            store_embed_linux_gtk_rect(0.0, 0.0, 0.0, 0.0),
            Ok((0, 0, 0, 0))
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn store_embed_linux_gtk_rect_accepts_a_negative_position() {
        // A slot partly scrolled off is legal; GtkFixed accepts a negative position.
        assert_eq!(
            store_embed_linux_gtk_rect(10.0, -40.0, 300.0, 200.0),
            Ok((10, -40, 300, 200))
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn store_embed_linux_gtk_rect_rejects_a_negative_size() {
        // GTK reads -1 as "unset", so passing it through would silently change the meaning.
        let e = store_embed_linux_gtk_rect(0.0, 0.0, -1.0, 10.0).unwrap_err();
        assert!(e.contains("negative-size"), "{e}");
        let e = store_embed_linux_gtk_rect(0.0, 0.0, 10.0, -0.6).unwrap_err();
        assert!(e.contains("negative-size"), "{e}");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn store_embed_linux_gtk_rect_rejects_non_finite_input() {
        for bad in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            for slot in 0..4 {
                let mut v = [1.0_f64; 4];
                v[slot] = bad;
                let e = store_embed_linux_gtk_rect(v[0], v[1], v[2], v[3]).unwrap_err();
                assert!(e.contains("non-finite"), "{e}");
            }
        }
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn store_embed_linux_gtk_rect_rejects_out_of_range_input() {
        // Never a saturating `as i32`.
        let e = store_embed_linux_gtk_rect(3.0e10, 0.0, 1.0, 1.0).unwrap_err();
        assert!(e.contains("out-of-range"), "{e}");
        let e = store_embed_linux_gtk_rect(0.0, -3.0e10, 1.0, 1.0).unwrap_err();
        assert!(e.contains("out-of-range"), "{e}");
        let e = store_embed_linux_gtk_rect(0.0, 0.0, 1.0, 3.0e10).unwrap_err();
        assert!(e.contains("out-of-range"), "{e}");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn store_embed_linux_gtk_rect_errors_carry_the_op_prefix() {
        let e = store_embed_linux_gtk_rect(f64::NAN, 0.0, 1.0, 1.0).unwrap_err();
        assert!(e.starts_with("store_embed_set_bounds:"), "{e}");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn store_embed_linux_zero_area_rect_is_recognised() {
        assert!(store_embed_linux_rect_is_zero_area((0, 0, 0, 0)));
        assert!(store_embed_linux_rect_is_zero_area((204, 82, 0, 418)));
        assert!(store_embed_linux_rect_is_zero_area((204, 82, 1076, 0)));
        assert!(!store_embed_linux_rect_is_zero_area((0, 0, 1, 1)));
        assert!(!store_embed_linux_rect_is_zero_area((-40, -40, 300, 200)));
    }

    /// macOS sibling of the test above (quick 261001-svm). The 0x0 case is the one actually
    /// measured live -- the slot's final ResizeObserver report once the Epic panel has replaced
    /// it -- and before this guard existed it was applied verbatim and left the embed invisible
    /// at zero size until a genuine window resize. Since quick 261012-f25 this also guards the
    /// WebView2 branch, which shares the same guard (wry's `SetWindowPos` would apply a 0x0 rect
    /// verbatim); the test keeps its name to avoid churn.
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    #[test]
    fn store_embed_macos_zero_area_rect_is_recognised() {
        // The measured case: slot unmounted, every field zero.
        assert!(store_embed_rect_is_zero_area(0.0, 0.0));
        // One collapsed axis is still unusable.
        assert!(store_embed_rect_is_zero_area(0.0, 418.0));
        assert!(store_embed_rect_is_zero_area(1076.0, 0.0));
        // Negative extents are not a geometry this can honour either; GTK's branch rejects them
        // outright in conversion, and macOS has no conversion step to reject them in.
        assert!(store_embed_rect_is_zero_area(-1.0, 200.0));
        assert!(store_embed_rect_is_zero_area(300.0, -1.0));
        // Non-finite input stops here rather than reaching `set_size`. A bare `w <= 0.0` test
        // would let NaN THROUGH (every comparison with NaN is false), so these two cases are the
        // ones that turn red if the `is_finite` half is ever dropped as redundant.
        assert!(store_embed_rect_is_zero_area(f64::NAN, 200.0));
        assert!(store_embed_rect_is_zero_area(300.0, f64::NAN));
        assert!(store_embed_rect_is_zero_area(f64::INFINITY, 200.0));
        assert!(store_embed_rect_is_zero_area(300.0, f64::NEG_INFINITY));
        // Real geometry, including the fractional rects a logical-px slot rect actually carries,
        // must pass through untouched -- D-18's verbatim rule still holds for every usable rect.
        assert!(!store_embed_rect_is_zero_area(1076.0, 418.0));
        assert!(!store_embed_rect_is_zero_area(760.25, 560.75));
        assert!(!store_embed_rect_is_zero_area(0.5, 0.5));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn store_embed_linux_settled_line_has_the_pinned_format() {
        assert_eq!(
            store_embed_linux_settled_line(
                (291, 97, 760, 561),
                (291, 97, 760, 561),
                (0, 0, 1280, 800),
                (1280, 800)
            ),
            "[shell] store_embed(linux): settled requested=291,97,760x561 \
             embed=291,97,760x561 main=0,0,1280x800 vbox=1280x800"
        );
    }
}
