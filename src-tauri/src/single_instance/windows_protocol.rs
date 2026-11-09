use super::*;

// ---- Windows `gamelib://` self-heal: the DECISION half (quick-260925-uok) -------------------
//
// (1) These eight functions are the deciding half of the Windows `gamelib://` HKCU self-heal;
// `repair_windows_gamelib_protocol_registration` (in the `#[cfg(windows)]` FFI tier below) does
// the I/O and nothing else. The split is not stylistic -- it is REQ-46-07's precedent, restated
// in the banner immediately below this block: every non-FFI decision is a plain function,
// unit-tested in `#[cfg(test)] mod tests` on ANY host, because the FFI tier is testable nowhere.
// None of these eight is `#[cfg(...)]`-gated, so they compile and are exercised on the macOS and
// Linux CI legs too. (The `#[cfg_attr(not(windows), allow(dead_code))]` each carries is a
// conditional LINT attribute, not conditional compilation -- the same annotation every pure
// `windows_*` single-instance helper above already uses, and for the same reason: their only
// non-test caller is `#[cfg(windows)]`.) The last two of the eight
// (`gamelib_protocol_dev_build_dirs` / `gamelib_protocol_exe_is_dev_build`, quick-260926-f3l) are
// a second decision bolted onto the same repair: whether the running exe is a dev build of THIS
// tree, in which case the repair must skip rather than hijack the scheme away from an install.
//
// (2) Byte-compatibility with the NSIS installer is the whole correctness criterion for the
// writer, so the exact shapes are pinned here. The generated installer script writes four values
// under `SHCTX` (= HKCU: `!define INSTALLMODE "currentUser"`), with `$\"` being NSIS's escaped
// double-quote:
//
//     Software\Classes\gamelib                     "URL Protocol"  = ""            (empty REG_SZ)
//     Software\Classes\gamelib                     (default)       = "URL:<bundle id> protocol"
//     Software\Classes\gamelib\DefaultIcon         (default)       = "<exe>",0
//     Software\Classes\gamelib\shell\open\command  (default)       = "<exe>" "%1"
//
// Source: `src-tauri/target/debug/nsis/x64/installer.nsi:922-925` -- NOTE that path is a
// GENERATED BUILD ARTEFACT (`src-tauri/.gitignore:2`) and does NOT resolve on a clean checkout;
// re-derive it with a Windows bundle build if you need to re-read it. The bundle id is NEVER
// hardcoded here: the caller passes `app.config().identifier`, so the written value cannot drift
// from `tauri.conf.json`.
//
// (3) Path comparison is deliberately FILESYSTEM-FREE -- no `canonicalize()`, no `exists()`. The
// live 2026-09-25 incident that motivated this feature left the stored value pointing at a
// DELETED executable, so any comparison that touched the disk would fail on precisely the case
// the repair exists to fix.

/// Extracts the executable path from a `shell\open\command` value, or `None` if the value is
/// empty, whitespace-only, or malformed. Handles all four shapes Windows accepts: a quoted exe
/// with a quoted `"%1"`, a quoted exe with a bare `%1`, an unquoted (space-free) exe, and an exe
/// with no argument at all. An unterminated opening quote yields `None` rather than a guess --
/// this string is untrusted third-party data written by whatever last claimed the scheme
/// (T-UOK-04), and `None` routes to "repair needed", which is the safe outcome.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn gamelib_protocol_command_exe(command: &str) -> Option<String> {
    let trimmed = command.trim();
    let exe = match trimmed.strip_prefix('"') {
        Some(rest) => {
            let end = rest.find('"')?;
            &rest[..end]
        }
        None => trimmed.split_whitespace().next()?,
    };
    if exe.trim().is_empty() {
        return None;
    }
    Some(exe.to_string())
}

/// Whether two executable paths name the same file, for the purposes of the self-heal decision.
/// Ordinal ignore-case (`eq_ignore_ascii_case`, NOT a locale-aware fold -- Windows path
/// comparison is ordinal), surrounding whitespace ignored, and a leading `\\?\` extended-length
/// prefix stripped from either side because `std::env::current_exe()` can return one. Two empty
/// paths are NOT equivalent: an empty stored value must route to repair, not to "already fine".
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn gamelib_protocol_paths_equivalent(a: &str, b: &str) -> bool {
    fn normalised(path: &str) -> &str {
        let trimmed = path.trim();
        match trimmed.strip_prefix(r"\\?\") {
            Some(rest) => rest,
            None => trimmed,
        }
    }
    let (a, b) = (normalised(a), normalised(b));
    !a.is_empty() && a.eq_ignore_ascii_case(b)
}

/// The self-heal decision itself: does `HKCU\Software\Classes\gamelib\shell\open\command`'s
/// stored default value need rewriting to point at `current_exe`? `None` (key or value absent),
/// an empty value, an unparseable value, and a value naming a DIFFERENT executable all mean yes.
/// A value naming the current executable -- in any case, with or without its `"%1"` argument --
/// means NO, and that arm is load-bearing: a naive string equality here would rewrite the user's
/// registry on every single launch for the life of the install.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn gamelib_protocol_repair_needed(stored: Option<&str>, current_exe: &str) -> bool {
    match stored.and_then(gamelib_protocol_command_exe) {
        Some(exe) => !gamelib_protocol_paths_equivalent(&exe, current_exe),
        None => true,
    }
}

/// The `shell\open\command` default value the repair writes: `"<exe>" "%1"`, byte-identical in
/// shape to the installer's row 4 above.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn gamelib_protocol_open_command(exe: &str) -> String {
    format!("\"{exe}\" \"%1\"")
}

/// The `Software\Classes\gamelib` default value the repair writes: `URL:<identifier> protocol`,
/// the installer's row 2. `identifier` is `app.config().identifier`, never a literal.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn gamelib_protocol_default_value(identifier: &str) -> String {
    format!("URL:{identifier} protocol")
}

/// The `DefaultIcon` default value the repair writes: `"<exe>",0`, the installer's row 3. There
/// is deliberately NO space after the comma -- the NSIS output has none.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn gamelib_protocol_default_icon(exe: &str) -> String {
    format!("\"{exe}\",0")
}

/// The set of directories a `current_exe()` value must be inside for
/// `gamelib_protocol_exe_is_dev_build` to treat it as a dev build of this repo (quick-260926-f3l).
/// Baked entirely from compile-time environment -- `env!("CARGO_MANIFEST_DIR")` and
/// `option_env!("CARGO_TARGET_DIR")` -- never read from disk.
///
/// `manifest_dir` contributes `<manifest_dir>\target` (cargo's default output dir) when non-blank
/// after trimming; a blank `manifest_dir` contributes nothing (never the bare `\target`).
/// `cargo_target_dir`, when `Some` and non-blank after trimming, contributes a SECOND directory:
/// used AS-IS when it is Windows-absolute, or joined to `manifest_dir` with `\` otherwise -- this
/// approximates cargo's own rule that a relative `CARGO_TARGET_DIR` resolves relative to the
/// directory cargo was invoked from, which for `tauri dev` is `src-tauri` (=
/// `CARGO_MANIFEST_DIR`). "Windows-absolute" is decided with a plain STRING check (a leading `\\`
/// or `\`, or a drive letter + `:` + `\`/`/`), never `std::path::Path::is_absolute`, because that
/// method is host-dependent -- `C:\x` is NOT absolute on the macOS/Linux CI legs, which would make
/// this function (and its unit tests) disagree across hosts.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn gamelib_protocol_dev_build_dirs(
    manifest_dir: &str,
    cargo_target_dir: Option<&str>,
) -> Vec<String> {
    fn is_windows_absolute(path: &str) -> bool {
        if path.starts_with('\\') {
            return true;
        }
        let bytes = path.as_bytes();
        bytes.len() >= 2
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && (bytes.len() == 2 || bytes[2] == b'\\' || bytes[2] == b'/')
    }

    let mut dirs = Vec::new();
    let manifest_trimmed = manifest_dir.trim();
    if !manifest_trimmed.is_empty() {
        dirs.push(format!("{manifest_trimmed}\\target"));
    }
    if let Some(target_dir) = cargo_target_dir {
        let target_trimmed = target_dir.trim();
        if !target_trimmed.is_empty() {
            if is_windows_absolute(target_trimmed) {
                dirs.push(target_trimmed.to_string());
            } else if !manifest_trimmed.is_empty() {
                dirs.push(format!("{manifest_trimmed}\\{target_trimmed}"));
            } else {
                dirs.push(target_trimmed.to_string());
            }
        }
    }
    dirs
}

/// The dev-build decision itself (quick-260926-f3l): is `current_exe` running from inside one of
/// `build_dirs`? Pure and FILESYSTEM-FREE, for the identical reason as point (3) in the DECISION
/// block banner above -- no `canonicalize()`, no `exists()`.
///
/// Both sides are normalised identically before comparing: trimmed, a leading `\\?\`
/// extended-length prefix stripped, `/` replaced with `\`, and (for the directory) a trailing `\`
/// trimmed. The comparison itself is ordinal ASCII ignore-case (`to_ascii_lowercase`), matching
/// `gamelib_protocol_paths_equivalent`'s own rule -- Windows path comparison is ordinal, not
/// locale-aware. `current_exe` must start with a `dir` (lowercased) followed by a `\` separator,
/// AND have at least one character after that separator: `dir` itself is NOT inside `dir`, and a
/// sibling directory sharing `dir` as a mere text prefix (e.g. `target-other`) is not either --
/// the separator is the boundary, not a bare `starts_with`.
///
/// Every doubt here returns `false`, which routes to REPAIR (T-F3L-01): an empty `current_exe`,
/// an empty `build_dirs`, or `build_dirs` holding only blank entries. A false positive here would
/// silently stop an INSTALLED app from self-healing, which is the uok regression this function
/// must never cause.
///
/// Three predicates were considered for "is this a dev build" and this is the CHOSEN one.
/// `cfg!(debug_assertions)` was rejected because the debug NSIS installer build installed at
/// `%LOCALAPPDATA%\GameLib` is also a debug build, and it must still self-heal. Allow-listing the
/// install root was rejected because the NSIS install directory is not fixed -- user-chosen,
/// per-machine, or a portable copy -- and an allow-list would silently stop repairing every
/// legitimate install outside the one path it knows. Chosen: deny-list exactly THIS build's own
/// cargo target dir, baked at compile time via `env!("CARGO_MANIFEST_DIR")` /
/// `option_env!("CARGO_TARGET_DIR")`, so it names only the tree that produced this binary -- an
/// installed copy of the same binary never runs from inside it.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn gamelib_protocol_exe_is_dev_build(current_exe: &str, build_dirs: &[String]) -> bool {
    fn normalised(path: &str) -> String {
        let trimmed = path.trim();
        let stripped = trimmed.strip_prefix(r"\\?\").unwrap_or(trimmed);
        stripped.replace('/', "\\")
    }

    let exe = normalised(current_exe).to_ascii_lowercase();
    if exe.is_empty() {
        return false;
    }
    build_dirs.iter().any(|dir| {
        let dir_normalised = normalised(dir);
        let dir_trimmed = dir_normalised.trim_end_matches('\\');
        if dir_trimmed.is_empty() {
            return false;
        }
        let prefix = format!("{}\\", dir_trimmed.to_ascii_lowercase());
        exe.starts_with(&prefix) && exe.len() > prefix.len()
    })
}

/// Self-heals the Windows `gamelib://` protocol registration under
/// `HKCU\Software\Classes\gamelib` when it is missing, dangling, or pointing at a different
/// executable, rewriting all four installer-shaped values to point at the CURRENTLY-RUNNING
/// executable. Closes the todo
/// `2026-09-25-windows-gamelib-registration-is-install-time-only.md` (quick-260925-uok, option 1
/// of its Options list). See the decision-point (a) comment block in `.setup()` for why this is
/// deliberately narrower than the deep-link plugin's own whole-scheme registration, and for the
/// last-launch-wins consequence on a machine carrying two GameLib installs.
///
/// FAIL OPEN, NEVER FAIL CLOSED (T-34.5-G6-24, T-UOK-03): returns `()` and is infallible by
/// construction, exactly like `shell_diag`. A missing key, an access-denied, a failed read, a
/// failed write -- every one logs a warning and moves on. There is no `unwrap()`, `expect(`,
/// `panic!` or `?` anywhere in this body (pinned by a region-scoped source gate in
/// `src/backend/__tests__/tauriShellSource.test.ts`), because a protocol registration that could
/// not be repaired must degrade deep links, never abort startup.
///
/// `CI=e2e` returns BEFORE the first registry call (T-UOK-02). That guard is load-bearing HERE in
/// a way it is not on the Linux `register_all()` arm: this path WRITES to the real user registry,
/// so an automated run that skipped it would rewrite the host's protocol association as a side
/// effect of merely starting the app.
///
/// Also skips, before any registry call, when the running exe is a DEV BUILD of this repo --
/// running in place from this build's own cargo target dir (quick-260926-f3l). Without this, every
/// `pnpm tauri:dev` re-pointed the scheme at `src-tauri\target\debug\gamelib-shell.exe` and left it
/// there after the dev session ended, last-launch-wins stealing the scheme from an installed copy
/// (the todo `2026-09-26-gamelib-self-heal-lets-dev-builds-take-over-gamelib-scheme.md`). The
/// decision is `gamelib_protocol_exe_is_dev_build`, the unit-tested half.
///
/// LOG DISCIPLINE (T-UOK-01, the same rule as the deep-link path's T-34.5-G6-25): the stored
/// command value is attacker-controlled, unbounded-length third-party data written by whatever
/// last claimed the scheme. It is NEVER logged verbatim -- only the registry subkey path (our own
/// constants), the outcome, and a coarse classification of `absent` / `unparseable` /
/// `points-elsewhere`.
///
/// Like every other function in this tier it is exercised by NO automated test; the decision it
/// delegates to (`gamelib_protocol_repair_needed`) is the unit-tested half.
#[cfg(windows)]
pub(crate) fn repair_windows_gamelib_protocol_registration(identifier: &str) {
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW, HKEY,
        HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE, REG_EXPAND_SZ, REG_OPTION_NON_VOLATILE, REG_SZ,
    };

    const ROOT_SUBKEY: &str = r"Software\Classes\gamelib";
    const ICON_SUBKEY: &str = r"Software\Classes\gamelib\DefaultIcon";
    const COMMAND_SUBKEY: &str = r"Software\Classes\gamelib\shell\open\command";

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    if std::env::var("CI").as_deref() == Ok("e2e") {
        shell_eprintln!(
            "[shell] CI=e2e -- skipping the gamelib:// HKCU registration repair (unlike the Linux arm, this path WRITES to the real user registry)"
        );
        return;
    }

    let exe_path = match std::env::current_exe() {
        Ok(path) => path,
        Err(e) => {
            shell_eprintln!(
                "[shell] WARN: gamelib:// HKCU repair skipped -- current_exe() failed ({e}) (fail-open, T-34.5-G6-24)"
            );
            return;
        }
    };
    let Some(exe) = exe_path.to_str() else {
        shell_eprintln!(
            "[shell] WARN: gamelib:// HKCU repair skipped -- the executable path is not valid UTF-8 (fail-open, T-34.5-G6-24)"
        );
        return;
    };

    let dev_build_dirs = gamelib_protocol_dev_build_dirs(
        env!("CARGO_MANIFEST_DIR"),
        option_env!("CARGO_TARGET_DIR"),
    );
    if gamelib_protocol_exe_is_dev_build(exe, &dev_build_dirs) {
        shell_eprintln!(
            "[shell] dev build running from its cargo target dir -- skipping the gamelib:// HKCU registration repair (the installed app owns the scheme; quick-260926-f3l)"
        );
        return;
    }

    // SAFETY: every Win32 call below is a registry call taking NUL-terminated wide strings that
    // are kept alive (`command_w`, `empty_name_w`, and the per-write `subkey_w`/`value_name_w`/
    // `value_w`) for the whole of the call that reads them. Both `HKEY`s are local: the read
    // handle is closed by the unconditional `RegCloseKey(key)` at the end of its own `if` body,
    // with no early `return` between the successful `RegOpenKeyExW` and that close; each write
    // handle is closed by the `RegCloseKey(write_key)` immediately after its `RegSetValueExW`,
    // on both the success and the failure path, before the loop can `continue`. `buf` is sized
    // from the two-call `cbData` size probe and the read-back length is re-clamped to
    // `buf.len()` before slicing, so no out-of-bounds read is possible even if the value grew
    // between the probe and the read.
    unsafe {
        let command_w = wide(COMMAND_SUBKEY);
        let empty_name_w: [u16; 1] = [0];

        let mut stored: Option<String> = None;
        let mut key: HKEY = std::ptr::null_mut();
        // ANY non-success open -- including ERROR_FILE_NOT_FOUND, the dangling case -- leaves
        // `stored` as `None`, which is a legitimate "repair needed" input, not an error to bail
        // on. That is the whole point of the feature.
        if RegOpenKeyExW(HKEY_CURRENT_USER, command_w.as_ptr(), 0, KEY_READ, &mut key)
            == ERROR_SUCCESS
        {
            let mut value_type: u32 = 0;
            let mut cb_data: u32 = 0;
            // Two-call size probe: the first call with a null `lpData` reports the byte length.
            if RegQueryValueExW(
                key,
                empty_name_w.as_ptr(),
                std::ptr::null(),
                &mut value_type,
                std::ptr::null_mut(),
                &mut cb_data,
            ) == ERROR_SUCCESS
                && (value_type == REG_SZ || value_type == REG_EXPAND_SZ)
                && cb_data > 0
            {
                let mut buf: Vec<u16> = vec![0u16; (cb_data as usize).div_ceil(2)];
                let mut cb_read = (buf.len() * 2) as u32;
                if RegQueryValueExW(
                    key,
                    empty_name_w.as_ptr(),
                    std::ptr::null(),
                    &mut value_type,
                    buf.as_mut_ptr() as *mut u8,
                    &mut cb_read,
                ) == ERROR_SUCCESS
                    && (value_type == REG_SZ || value_type == REG_EXPAND_SZ)
                {
                    let chars = ((cb_read as usize) / 2).min(buf.len());
                    let slice = &buf[..chars];
                    // A REG_SZ read back this way is not guaranteed to be NUL-terminated, and
                    // may carry more than one trailing NUL. Cut at the first one, or take the
                    // whole slice when there is none.
                    let end = match slice.iter().position(|&unit| unit == 0) {
                        Some(index) => index,
                        None => chars,
                    };
                    stored = Some(String::from_utf16_lossy(&slice[..end]));
                }
            }
            RegCloseKey(key);
        }

        if !gamelib_protocol_repair_needed(stored.as_deref(), exe) {
            // The overwhelmingly common path: the key already points at us. Write nothing and
            // log nothing -- a line here would append to the diagnostic file on every launch.
            return;
        }

        let classification = match stored.as_deref() {
            None => "absent",
            Some(value) if gamelib_protocol_command_exe(value).is_none() => "unparseable",
            Some(_) => "points-elsewhere",
        };

        let root_default = gamelib_protocol_default_value(identifier);
        let icon_default = gamelib_protocol_default_icon(exe);
        let command_default = gamelib_protocol_open_command(exe);

        // All FOUR of the installer's values, in the installer's own order -- not just the
        // command. Whatever rewrote `shell\open\command` may equally have rewritten the default
        // and the icon, and writing the complete installer-shaped set is what leaves the key
        // byte-compatible with a fresh install rather than a third divergent shape.
        let writes: [(&str, &str, &str); 4] = [
            (ROOT_SUBKEY, "URL Protocol", ""),
            (ROOT_SUBKEY, "", root_default.as_str()),
            (ICON_SUBKEY, "", icon_default.as_str()),
            (COMMAND_SUBKEY, "", command_default.as_str()),
        ];

        let mut written = 0usize;
        for (subkey, value_name, value) in writes {
            let subkey_w = wide(subkey);
            let value_name_w = wide(value_name);
            let value_w = wide(value);

            let mut write_key: HKEY = std::ptr::null_mut();
            let created = RegCreateKeyExW(
                HKEY_CURRENT_USER,
                subkey_w.as_ptr(),
                0,
                std::ptr::null(),
                REG_OPTION_NON_VOLATILE,
                KEY_SET_VALUE,
                std::ptr::null(),
                &mut write_key,
                std::ptr::null_mut(),
            );
            if created != ERROR_SUCCESS {
                shell_eprintln!(
                    "[shell] WARN: gamelib:// HKCU repair could not open HKCU\\{subkey} for writing (error {created}) -- continuing with the remaining values (fail-open, T-34.5-G6-24)"
                );
                continue;
            }

            // `cbData` counts BYTES and must include the NUL terminator `wide()` appended.
            let set = RegSetValueExW(
                write_key,
                value_name_w.as_ptr(),
                0,
                REG_SZ,
                value_w.as_ptr() as *const u8,
                (value_w.len() * 2) as u32,
            );
            RegCloseKey(write_key);

            if set == ERROR_SUCCESS {
                written += 1;
            } else {
                shell_eprintln!(
                    "[shell] WARN: gamelib:// HKCU repair could not write HKCU\\{subkey} value '{value_name}' (error {set}) -- continuing with the remaining values (fail-open, T-34.5-G6-24)"
                );
            }
        }

        // One line, through the file-backed sink, because a bundled app's stderr is discarded and
        // "did the repair run, and what did it decide?" is exactly what this sink exists for.
        // The classification, never the stored value itself (T-UOK-01).
        shell_diag(&format!(
            "repaired the gamelib:// HKCU registration (prior value: {classification}) -- {written}/4 installer-shaped values written under HKCU\\{ROOT_SUBKEY}"
        ));
    }
}
