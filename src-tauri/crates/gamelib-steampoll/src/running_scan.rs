//! Mac running-game signal: a process-table scan by executable path (quick 261118-uma).
//!
//! Mac Steam never writes `RunningAppID` to `registry.vdf` (615 bytes with two games running at
//! the 2026-11-18 phase-81 gate), so the registry probe always read 0 and restart-on-Play quit
//! Steam under a running game (todo `2026-11-18-mac-restart-on-play-ignores-running-game`).
//! This finds the game from the process table instead: a process whose executable lives under
//! `<library>/steamapps/common/<installdir>/` of any Steam library is that game, and the appId
//! comes from the library's ACF with that `installdir`.
//!
//! Measured on the Mac at planning time:
//!
//! - Executable path, not argv. A process started as `./mygame` shows `ps` args `./mygame`, while
//!   `proc_pidpath` returns the full path. Bastion's shell launcher exe is `/bin/bash` (no match),
//!   but its child `./Bastion.bin.osx` matches.
//! - `/tmp` is a symlink to `/private/tmp`, and `proc_pidpath` returns the canonical form, so a
//!   library path is compared both as given and canonicalized.
//! - `proc_listallpids` returns a pid COUNT, not bytes.
//! - The whole scan takes about 2 ms for ~950 pids and spawns no child process.
//!
//! Only the appId (a number) leaves this module; paths are never logged or returned (T-uma-04).

use std::path::{Path, PathBuf};

/// A source of executable paths for every visible process. Injected so tests need no real
/// processes.
pub type ExeLister = dyn Fn() -> Result<Vec<PathBuf>, String> + Send + Sync;

/// The executable path of every process this user can inspect. macOS only; every other target
/// answers an empty list, and is never reached in production because only the Darwin arm of the
/// on-demand read calls it.
#[cfg(target_os = "macos")]
pub fn list_process_exe_paths() -> Result<Vec<PathBuf>, String> {
    use std::ffi::{c_int, c_void, OsStr};
    use std::os::unix::ffi::OsStrExt;

    // SAFETY: a null buffer with size 0 only asks for the pid count; nothing is written.
    let count = unsafe { libc::proc_listallpids(std::ptr::null_mut(), 0) };
    if count <= 0 {
        return Err("proc_listallpids: no pid count".to_string());
    }
    let mut pids: Vec<c_int> = vec![0; count as usize + 256];
    let bytes = std::mem::size_of_val(pids.as_slice()) as c_int;
    // SAFETY: `pids` is a live, zeroed buffer of exactly `bytes` bytes (its whole length).
    let got = unsafe { libc::proc_listallpids(pids.as_mut_ptr().cast::<c_void>(), bytes) };
    if got <= 0 {
        return Err("proc_listallpids: empty pid list".to_string());
    }
    // The return value is a pid COUNT; never trust it past the buffer.
    let got = (got as usize).min(pids.len());
    let mut out = Vec::new();
    let mut buf = vec![0u8; libc::PROC_PIDPATHINFO_MAXSIZE as usize];
    for &pid in &pids[..got] {
        if pid <= 0 {
            continue;
        }
        // SAFETY: `buf` is a live buffer of exactly `buf.len()` bytes, the size passed.
        let r =
            unsafe { libc::proc_pidpath(pid, buf.as_mut_ptr().cast::<c_void>(), buf.len() as u32) };
        if r <= 0 {
            // EPERM (other user, kernel process) or ESRCH (exited): skip.
            continue;
        }
        let r = (r as usize).min(buf.len());
        out.push(PathBuf::from(OsStr::from_bytes(&buf[..r])));
    }
    Ok(out)
}

#[cfg(not(target_os = "macos"))]
pub fn list_process_exe_paths() -> Result<Vec<PathBuf>, String> {
    Ok(Vec::new())
}

/// `steamapps/common` prefixes for a library: as given, plus its canonical form when different.
fn common_prefixes(library: &Path) -> Vec<PathBuf> {
    let mut v = vec![library.join("steamapps").join("common")];
    if let Ok(canon) = std::fs::canonicalize(library) {
        let c = canon.join("steamapps").join("common");
        if !v.contains(&c) {
            v.push(c);
        }
    }
    v
}

/// The game folder name when `exe` sits at least one level inside `<prefix>/<folder>/`.
fn folder_under(exe: &Path, prefix: &Path) -> Option<String> {
    let rest = exe.strip_prefix(prefix).ok()?;
    let mut comps = rest.components();
    let folder = comps.next()?;
    // The exe must be INSIDE the game folder, not the folder itself or a file in common/.
    comps.next()?;
    Some(folder.as_os_str().to_string_lossy().into_owned())
}

fn acf_app_id(record_appid: &Option<String>, file_name: &str) -> u32 {
    let from_record = record_appid
        .as_deref()
        .and_then(|s| s.trim().parse::<u32>().ok())
        .filter(|&n| n > 0);
    if let Some(n) = from_record {
        return n;
    }
    file_name
        .strip_prefix("appmanifest_")
        .and_then(|s| s.strip_suffix(".acf"))
        .and_then(|s| s.parse::<u32>().ok())
        .filter(|&n| n > 0)
        .unwrap_or(0)
}

/// The appId of the lowest-numbered game whose folder holds one of `exe_paths`, 0 when none.
///
/// A path matches by whole components (`Bastion2` never matches `Bastion`). ACFs are read only
/// for a library that already holds a candidate process. The ACF `installdir` is compared
/// (ASCII case-insensitive, default APFS) and never joined into a path (T-uma-05).
pub fn app_id_from_exe_paths(exe_paths: &[PathBuf], libraries: &[PathBuf]) -> u32 {
    let mut best: u32 = 0;
    for library in libraries {
        let prefixes = common_prefixes(library);
        let mut folders: Vec<String> = Vec::new();
        for exe in exe_paths {
            for prefix in &prefixes {
                if let Some(f) = folder_under(exe, prefix) {
                    if !folders.contains(&f) {
                        folders.push(f);
                    }
                }
            }
        }
        if folders.is_empty() {
            continue;
        }
        let steamapps = library.join("steamapps").to_string_lossy().into_owned();
        let scan = gamelib_steamfiles::library::scan_acfs(&[steamapps]);
        for rec in &scan.records {
            let Some(installdir) = rec.record.installdir.as_deref() else {
                continue;
            };
            if !folders.iter().any(|f| f.eq_ignore_ascii_case(installdir)) {
                continue;
            }
            let id = acf_app_id(&rec.record.appid, &rec.file_name);
            if id != 0 && (best == 0 || id < best) {
                best = id;
            }
        }
    }
    best
}

/// Resolve the Steam libraries (root plus `libraryfolders.vdf`), list the processes and match.
///
/// `strict` makes an unreadable library list or process list an error instead of "nothing
/// running", so a safety guard (the uninstall check) can refuse. With no library on disk the
/// answer is `Ok(0)` and the process table is never listed.
pub fn scan_running_app_id(
    profile_home: &Path,
    steam_root: Option<&str>,
    strict: bool,
    lister: &ExeLister,
) -> Result<u32, String> {
    let root: PathBuf = match steam_root {
        Some(r) if !r.is_empty() => PathBuf::from(r),
        _ => profile_home
            .join("Library")
            .join("Application Support")
            .join("Steam"),
    };
    let mut libraries: Vec<PathBuf> = Vec::new();
    let listed = crate::acf_state::steam_libraries(&root.to_string_lossy(), strict)?;
    for lib in listed.into_iter().chain(std::iter::once(root)) {
        // A library with no steamapps dir holds no game.
        if lib.join("steamapps").is_dir() && !libraries.contains(&lib) {
            libraries.push(lib);
        }
    }
    if libraries.is_empty() {
        return Ok(0);
    }
    match lister() {
        Ok(paths) => Ok(app_id_from_exe_paths(&paths, &libraries)),
        Err(e) if strict => Err(format!("running app id: process list failed: {e}")),
        Err(_) => Ok(0),
    }
}
