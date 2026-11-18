//! The `steam_window_raise` rustInvoke channel: bring Steam's own window forward on Windows.
//!
//! Why the shell does this and not a `steam://open/main` URL: a signed-out Steam holds a command
//! line until login finishes (Steam's `console_log.txt` logs `ExecCommandLine` only after sign-in,
//! never for the presses made while the sign-in window was up), so the URL cannot raise the sign-in
//! window, and "Open Steam" on the adoption note exists for exactly that state. The shell is the
//! foreground process when the user clicks, so `SetForegroundWindow` from here is allowed.
//!
//! Steam's visible window belongs to `steamwebhelper.exe`, not `steam.exe`, so the window is chosen
//! by its owning executable name (either), not by a pid. The choice is a pure function over plain
//! window facts so it is proven by `#[cfg(test)]` without a desktop; the Win32 glue only gathers
//! those facts. Off Windows the arm answers `false` and touches nothing.
//!
//! Nothing here logs a window title or path (T-28-04): the only output is a fixed category.

use super::*;

/// Executable names whose top-level windows count as Steam's own (ASCII case-insensitive).
#[cfg(any(windows, test))]
const STEAM_EXE_NAMES: [&str; 2] = ["steam.exe", "steamwebhelper.exe"];

/// What the pick needs to know about one top-level window. `hwnd` is the raw handle value, kept as
/// an integer so the list is plain data (a Win32 `HWND` is a raw pointer, which is not `Send`).
#[cfg(any(windows, test))]
#[derive(Debug, Clone, PartialEq, Eq)]
struct TopLevelWindow {
    hwnd: isize,
    visible: bool,
    has_owner: bool,
    tool_window: bool,
    has_title: bool,
    /// The owning process's executable file name; `None` when it was not looked up or not readable.
    exe: Option<String>,
}

/// The file-name part of a Windows or POSIX style path.
#[cfg(any(windows, test))]
fn exe_file_name(path: &str) -> Option<String> {
    let name = path.rsplit(['\\', '/']).next().unwrap_or("");
    if name.is_empty() {
        None
    } else {
        Some(name.to_string())
    }
}

#[cfg(any(windows, test))]
fn is_steam_exe(name: &str) -> bool {
    STEAM_EXE_NAMES
        .iter()
        .any(|steam| name.eq_ignore_ascii_case(steam))
}

/// The window to raise: the first (`windows` is in z-order, topmost first, so the one the user used
/// last) that looks like an app window (visible, no owner, not a tool window, has a title) and
/// belongs to a Steam executable. A minimized window is still visible, so it qualifies. `None`
/// when Steam has no such window (not running, or hidden to the tray).
#[cfg(any(windows, test))]
fn pick_steam_window(windows: &[TopLevelWindow]) -> Option<isize> {
    windows
        .iter()
        .find(|w| {
            w.visible
                && !w.has_owner
                && !w.tool_window
                && w.has_title
                && w.exe.as_deref().is_some_and(is_steam_exe)
        })
        .map(|w| w.hwnd)
}

#[cfg(windows)]
mod win32 {
    use super::{exe_file_name, pick_steam_window, TopLevelWindow};
    use std::collections::HashMap;
    use windows_sys::Win32::Foundation::{CloseHandle, HWND, LPARAM};
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindow, GetWindowLongW, GetWindowTextLengthW, GetWindowThreadProcessId,
        IsIconic, IsWindowVisible, SetForegroundWindow, ShowWindow, GWL_EXSTYLE, GW_OWNER,
        SW_RESTORE, WS_EX_TOOLWINDOW,
    };

    /// Long enough for any path Windows returns here (extended-length paths included in practice).
    const IMAGE_PATH_CAPACITY: usize = 1024;

    unsafe extern "system" fn collect_hwnd(hwnd: HWND, out: LPARAM) -> i32 {
        // SAFETY: `out` is the `&mut Vec<isize>` `top_level_hwnds` passed to `EnumWindows`, which
        // calls this synchronously and never after it returns.
        let handles = unsafe { &mut *(out as *mut Vec<isize>) };
        handles.push(hwnd as isize);
        1
    }

    /// Every top-level window, topmost first (the order `EnumWindows` yields).
    fn top_level_hwnds() -> Vec<isize> {
        let mut handles: Vec<isize> = Vec::new();
        // SAFETY: the callback only reads its `LPARAM` as the `Vec` pointer passed here, and
        // `EnumWindows` does not return until the walk is done.
        unsafe {
            EnumWindows(Some(collect_hwnd), &mut handles as *mut Vec<isize> as LPARAM);
        }
        handles
    }

    /// The executable file name of a process, or `None` when it cannot be opened or read (a
    /// protected process, or one that has exited since the window list was taken).
    fn process_exe_name(pid: u32) -> Option<String> {
        // SAFETY: plain Win32 calls; the handle is closed on every path that opened it.
        unsafe {
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if process.is_null() {
                return None;
            }
            let mut buf = [0u16; IMAGE_PATH_CAPACITY];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, buf.as_mut_ptr(), &mut len);
            CloseHandle(process);
            if ok == 0 {
                return None;
            }
            exe_file_name(&String::from_utf16_lossy(&buf[..len as usize]))
        }
    }

    fn describe(hwnd_raw: isize, exe_by_pid: &mut HashMap<u32, Option<String>>) -> TopLevelWindow {
        let hwnd = hwnd_raw as HWND;
        // SAFETY: read-only queries on a window handle; a window destroyed since the walk just
        // answers "not visible / no owner / no title".
        let (visible, has_owner, tool_window, has_title) = unsafe {
            (
                IsWindowVisible(hwnd) != 0,
                !GetWindow(hwnd, GW_OWNER).is_null(),
                (GetWindowLongW(hwnd, GWL_EXSTYLE) as u32 & WS_EX_TOOLWINDOW) != 0,
                GetWindowTextLengthW(hwnd) > 0,
            )
        };
        // The owning exe is only worth a process query for a window that could be raised at all.
        let exe = if visible && !has_owner && !tool_window && has_title {
            let mut pid = 0u32;
            // SAFETY: `pid` is a valid out pointer for the call.
            unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
            exe_by_pid
                .entry(pid)
                .or_insert_with(|| process_exe_name(pid))
                .clone()
        } else {
            None
        };
        TopLevelWindow {
            hwnd: hwnd_raw,
            visible,
            has_owner,
            tool_window,
            has_title,
            exe,
        }
    }

    pub(super) fn enumerate_top_level_windows() -> Vec<TopLevelWindow> {
        let mut exe_by_pid = HashMap::new();
        top_level_hwnds()
            .into_iter()
            .map(|h| describe(h, &mut exe_by_pid))
            .collect()
    }

    /// Restores a minimized Steam window and brings the topmost Steam window to the front. `true`
    /// when Windows accepted the foreground change.
    pub(super) fn raise_steam_window() -> bool {
        let windows = enumerate_top_level_windows();
        let Some(raw) = pick_steam_window(&windows) else {
            shell_eprintln!("[shell] steam_window_raise: no Steam window to raise");
            return false;
        };
        let hwnd = raw as HWND;
        // SAFETY: both calls take the handle by value and tolerate a window that has since closed.
        let raised = unsafe {
            if IsIconic(hwnd) != 0 {
                ShowWindow(hwnd, SW_RESTORE);
            }
            SetForegroundWindow(hwnd) != 0
        };
        shell_eprintln!(
            "[shell] steam_window_raise: {}",
            if raised { "raised" } else { "foreground change refused" }
        );
        raised
    }
}

/// Off Windows there is nothing to raise: Steam is brought forward by `open steam://open/main`.
#[cfg(not(windows))]
fn raise_steam_window() -> bool {
    false
}

#[cfg(windows)]
use win32::raise_steam_window;

/// `steam_window_raise`: takes no args, resolves a boolean (see `RUST_STEAM_WINDOW_RAISE`).
pub(crate) fn rpc_steam_window_raise(args: &[Value]) -> Result<Value, String> {
    SteamWindowRaiseArgs::from_args(args)?;
    Ok(Value::Bool(raise_steam_window()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn window(hwnd: isize, exe: Option<&str>) -> TopLevelWindow {
        TopLevelWindow {
            hwnd,
            visible: true,
            has_owner: false,
            tool_window: false,
            has_title: true,
            exe: exe.map(str::to_string),
        }
    }

    #[test]
    fn picks_a_steamwebhelper_window_not_only_steam_exe() {
        // Measured on Windows 11: the visible "Steam" window belongs to steamwebhelper.exe.
        let windows = [window(1, Some("Code.exe")), window(2, Some("steamwebhelper.exe"))];
        assert_eq!(pick_steam_window(&windows), Some(2));
    }

    #[test]
    fn matches_steam_exe_case_insensitively() {
        assert_eq!(pick_steam_window(&[window(7, Some("Steam.EXE"))]), Some(7));
    }

    #[test]
    fn takes_the_topmost_steam_window() {
        let windows = [
            window(3, Some("notepad.exe")),
            window(4, Some("steamwebhelper.exe")),
            window(5, Some("steamwebhelper.exe")),
        ];
        assert_eq!(pick_steam_window(&windows), Some(4));
    }

    #[test]
    fn skips_hidden_owned_tool_and_untitled_windows() {
        let mut hidden = window(1, Some("steam.exe"));
        hidden.visible = false;
        let mut owned = window(2, Some("steam.exe"));
        owned.has_owner = true;
        let mut tool = window(3, Some("steam.exe"));
        tool.tool_window = true;
        let mut untitled = window(4, Some("steam.exe"));
        untitled.has_title = false;
        assert_eq!(pick_steam_window(&[hidden, owned, tool, untitled]), None);
    }

    #[test]
    fn a_minimized_window_is_still_visible_so_it_qualifies() {
        // `IsWindowVisible` is true for a minimized window; the glue restores it before raising.
        assert_eq!(pick_steam_window(&[window(9, Some("steamwebhelper.exe"))]), Some(9));
    }

    #[test]
    fn ignores_other_programs_and_unreadable_owners() {
        let windows = [
            window(1, Some("steamservice.exe")),
            window(2, Some("gameoverlayui.exe")),
            window(3, None),
        ];
        assert_eq!(pick_steam_window(&windows), None);
        assert_eq!(pick_steam_window(&[]), None);
    }

    #[test]
    fn exe_file_name_takes_the_last_path_component() {
        assert_eq!(
            exe_file_name(r"C:\Program Files (x86)\Steam\bin\cef\cef.win64\steamwebhelper.exe"),
            Some("steamwebhelper.exe".to_string())
        );
        assert_eq!(exe_file_name("/a/b/steam.exe"), Some("steam.exe".to_string()));
        assert_eq!(exe_file_name("steam.exe"), Some("steam.exe".to_string()));
        assert_eq!(exe_file_name(r"C:\dir\"), None);
        assert_eq!(exe_file_name(""), None);
    }

    // Windows answers whether a real Steam window was raised, which a unit test cannot assume.
    #[cfg(not(windows))]
    #[test]
    fn off_windows_the_arm_answers_false() {
        assert_eq!(rpc_steam_window_raise(&[]).unwrap(), Value::Bool(false));
    }

    /// LIVE, run by hand with Steam running (`cargo test live_steam_window -- --ignored
    /// --nocapture`): the real walk finds Steam's window and the real raise accepts it. Prints the
    /// handle only, never a title or path (T-28-04).
    #[cfg(windows)]
    #[test]
    #[ignore = "needs a running Steam client on the desktop"]
    fn live_steam_window_is_found_and_raised() {
        let windows = super::win32::enumerate_top_level_windows();
        let picked = pick_steam_window(&windows).expect("a visible Steam window");
        println!("picked hwnd={picked}");
        assert!(super::win32::raise_steam_window());
    }

    #[cfg(windows)]
    #[test]
    fn the_win32_walk_returns_windows_without_panicking() {
        // A real desktop session always has at least one top-level window; a CI service session may
        // have none, so only the call's safety is asserted, not a count.
        let _ = super::win32::enumerate_top_level_windows();
    }
}
