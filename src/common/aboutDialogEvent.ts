/**
 * The window event that opens the in-app About modal (quick `260905-d33`).
 *
 * Lives in `src/common/` because it is the seam between two modules that must
 * not import each other: `src/preload/api/helpers.ts` DISPATCHES it and
 * `src/frontend/components/UI/AboutDialog/AboutDialogHost.tsx` LISTENS for it.
 *
 * Why an event at all, rather than the component owning its own state: About has
 * TWO entry points, and only one of them is React. The Settings row is; the
 * macOS tray's "About GameLib" item is not -- it reaches the renderer by
 * evaluating `window.api?.showAboutWindow?.()` in the main window from Rust
 * (`open_about_window_from_tray`, `src-tauri/src/main.rs`). That eval is
 * optional-chained, so if `window.api.showAboutWindow` ever stops existing the
 * tray item does nothing AND reports nothing. Keeping the preload name alive and
 * routing it through this event is what lets both entry points reach one surface
 * without the tray needing any React knowledge.
 */
export const SHOW_ABOUT_DIALOG_EVENT = 'gamelib:show-about-dialog'
