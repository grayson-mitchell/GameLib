//! The host facts the TS system-information probes read from Node (`os.cpus()`, `os.release()`,
//! `os.totalmem()`, `os.freemem()`, the os-release file, `process.env.FLATPAK_ID` and `APPIMAGE`, the
//! Steam Deck game-mode flag), behind one trait so the goldens replay on any OS (D-13).
//!
//! [`RealHostFacts`] is the production implementation, one per OS. The three facts that are
//! environment variables in the TS are handed in by the shell through [`HostEnv`]: this crate reads no
//! environment variable of its own.

/// The three os-release locations the TS probes in order (the first that exists wins): the host's
/// file inside a Flatpak, the host's file inside a snap, and the regular one.
pub const OS_RELEASE_PATHS: [&str; 3] = [
    "/run/host/os-release",
    "/var/lib/snapd/hostfs/etc/os-release",
    "/etc/os-release",
];

/// What the probes ask the machine, other than by spawning a program.
pub trait HostFacts: Send + Sync {
    /// The model name of each logical CPU, as `os.cpus()` lists them (so the length is the core count
    /// the system information reports). Empty when the host reports no CPU.
    fn cpu_models(&self) -> Vec<String>;
    /// `os.release()`: the kernel release on Linux and macOS, `major.minor.build` on Windows.
    fn release(&self) -> String;
    /// `os.totalmem()` in bytes.
    fn total_mem(&self) -> u64;
    /// `os.freemem()` in bytes. Only the Windows memory probe reads it.
    fn free_mem(&self) -> u64;
    /// The text of the os-release file at `path`; `None` when the file does not exist (or cannot be
    /// read), which sends the search on to the next location.
    fn read_os_release(&self, path: &str) -> Option<String>;
    /// `FLATPAK_ID`, when set.
    fn flatpak_id(&self) -> Option<String>;
    /// `APPIMAGE`, when set.
    fn appimage(&self) -> Option<String>;
    /// Whether the Steam Deck is in game mode (`isSteamDeckGameMode`).
    fn steam_deck_game_mode(&self) -> bool;
}

/// The environment-derived facts the shell reads once and passes in.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct HostEnv {
    pub flatpak_id: Option<String>,
    pub appimage: Option<String>,
    pub steam_deck_game_mode: bool,
}

/// The production [`HostFacts`] of the OS the crate is built for.
#[derive(Debug, Clone, Default)]
pub struct RealHostFacts {
    env: HostEnv,
}

impl RealHostFacts {
    pub fn new(env: HostEnv) -> RealHostFacts {
        RealHostFacts { env }
    }
}

impl HostFacts for RealHostFacts {
    fn cpu_models(&self) -> Vec<String> {
        os::cpu_models()
    }

    fn release(&self) -> String {
        os::release()
    }

    fn total_mem(&self) -> u64 {
        os::total_mem()
    }

    fn free_mem(&self) -> u64 {
        os::free_mem()
    }

    fn read_os_release(&self, path: &str) -> Option<String> {
        // `stat` then `readFile` in the TS; a file that is there but unreadable is "not found" here,
        // so the search goes on to the next location instead of ending the whole read.
        std::fs::read(path)
            .ok()
            .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
    }

    fn flatpak_id(&self) -> Option<String> {
        self.env.flatpak_id.clone()
    }

    fn appimage(&self) -> Option<String> {
        self.env.appimage.clone()
    }

    fn steam_deck_game_mode(&self) -> bool {
        self.env.steam_deck_game_mode
    }
}

/// `n` copies of `model`, as `os.cpus()` lists one entry per logical CPU.
#[cfg(any(target_os = "macos", test))]
fn repeat_model(model: &str, count: usize) -> Vec<String> {
    vec![model.to_string(); count]
}

#[cfg(target_os = "linux")]
mod os {
    //! `/proc` reads: no child process and no libc call.

    fn proc_text(path: &str) -> String {
        std::fs::read(path)
            .map(|b| String::from_utf8_lossy(&b).into_owned())
            .unwrap_or_default()
    }

    pub(super) fn cpu_models() -> Vec<String> {
        parse_cpuinfo(&proc_text("/proc/cpuinfo"))
    }

    /// One entry per `processor` line, each with the `model name` that follows it (`unknown` when the
    /// kernel prints none, as libuv does).
    pub(super) fn parse_cpuinfo(text: &str) -> Vec<String> {
        let mut models: Vec<String> = Vec::new();
        let mut current_has_model = true;
        for line in text.lines() {
            let Some((key, value)) = line.split_once(':') else {
                continue;
            };
            match key.trim() {
                "processor" => {
                    models.push("unknown".to_string());
                    current_has_model = false;
                }
                "model name" if !current_has_model => {
                    if let Some(last) = models.last_mut() {
                        *last = value.trim().to_string();
                    }
                    current_has_model = true;
                }
                _ => {}
            }
        }
        models
    }

    pub(super) fn release() -> String {
        proc_text("/proc/sys/kernel/osrelease").trim().to_string()
    }

    fn meminfo_bytes(key: &str) -> u64 {
        proc_text("/proc/meminfo")
            .lines()
            .find_map(|line| {
                let (name, rest) = line.split_once(':')?;
                (name == key).then_some(rest)
            })
            .and_then(|rest| rest.split_whitespace().next()?.parse::<u64>().ok())
            .map_or(0, |kib| kib.saturating_mul(1024))
    }

    pub(super) fn total_mem() -> u64 {
        meminfo_bytes("MemTotal")
    }

    pub(super) fn free_mem() -> u64 {
        meminfo_bytes("MemAvailable")
    }
}

#[cfg(target_os = "macos")]
mod os {
    //! Short synchronous `sysctl` probes on `Command::output()` (the repo's rule for a one-shot
    //! probe, as `osascript` and `pgrep` elsewhere); the program is the absolute system path.

    use std::process::Command;

    fn sysctl(name: &str) -> Option<String> {
        let out = Command::new("/usr/sbin/sysctl")
            .args(["-n", name])
            .output()
            .ok()?;
        out.status
            .success()
            .then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
    }

    pub(super) fn cpu_models() -> Vec<String> {
        let model = sysctl("machdep.cpu.brand_string").unwrap_or_else(|| "unknown".to_string());
        let count = sysctl("hw.logicalcpu")
            .and_then(|n| n.parse::<usize>().ok())
            .unwrap_or(0);
        super::repeat_model(&model, count)
    }

    pub(super) fn release() -> String {
        sysctl("kern.osrelease").unwrap_or_default()
    }

    pub(super) fn total_mem() -> u64 {
        sysctl("hw.memsize")
            .and_then(|n| n.parse::<u64>().ok())
            .unwrap_or(0)
    }

    /// Nothing on macOS reads it (the macOS memory probe uses `vm_stat`), so it is not probed.
    pub(super) fn free_mem() -> u64 {
        0
    }
}

#[cfg(windows)]
mod os {
    //! The registry processor name and `GlobalMemoryStatusEx`, through the `windows-sys` features the
    //! workspace already locks (no child process).

    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_LOCAL_MACHINE, KEY_READ,
        REG_DWORD, REG_SZ,
    };
    use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn open(path: &str) -> Option<HKEY> {
        let mut key: HKEY = std::ptr::null_mut();
        let path = wide(path);
        // SAFETY: `path` is NUL-terminated and outlives the call; `key` is a valid out pointer.
        let status =
            unsafe { RegOpenKeyExW(HKEY_LOCAL_MACHINE, path.as_ptr(), 0, KEY_READ, &mut key) };
        (status == ERROR_SUCCESS).then_some(key)
    }

    fn read_value(key: HKEY, name: &str, want_type: u32) -> Option<Vec<u8>> {
        let name = wide(name);
        let mut kind = 0u32;
        let mut len = 0u32;
        // SAFETY: a size query: a null data pointer asks only for the length.
        let status = unsafe {
            RegQueryValueExW(
                key,
                name.as_ptr(),
                std::ptr::null(),
                &mut kind,
                std::ptr::null_mut(),
                &mut len,
            )
        };
        if status != ERROR_SUCCESS || kind != want_type {
            return None;
        }
        let mut data = vec![0u8; len as usize];
        // SAFETY: `data` holds `len` bytes, the size the first call reported.
        let status = unsafe {
            RegQueryValueExW(
                key,
                name.as_ptr(),
                std::ptr::null(),
                &mut kind,
                data.as_mut_ptr(),
                &mut len,
            )
        };
        if status != ERROR_SUCCESS {
            return None;
        }
        data.truncate(len as usize);
        Some(data)
    }

    fn string_value(path: &str, name: &str) -> Option<String> {
        let key = open(path)?;
        let data = read_value(key, name, REG_SZ);
        // SAFETY: `key` was opened above and is closed once.
        unsafe { RegCloseKey(key) };
        let data = data?;
        let units: Vec<u16> = data
            .chunks(2)
            .filter_map(|c| <[u8; 2]>::try_from(c).ok())
            .map(u16::from_le_bytes)
            .take_while(|u| *u != 0)
            .collect();
        Some(String::from_utf16_lossy(&units).trim().to_string())
    }

    fn dword_value(path: &str, name: &str) -> Option<u32> {
        let key = open(path)?;
        let data = read_value(key, name, REG_DWORD);
        // SAFETY: `key` was opened above and is closed once.
        unsafe { RegCloseKey(key) };
        let bytes: [u8; 4] = data?.get(..4)?.try_into().ok()?;
        Some(u32::from_le_bytes(bytes))
    }

    const CPU_ROOT: &str = r"HARDWARE\DESCRIPTION\System\CentralProcessor";
    const NT_VERSION: &str = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion";

    /// Node's `os.cpus()` lists `CentralProcessor\<n>` subkeys until one is missing.
    pub(super) fn cpu_models() -> Vec<String> {
        let mut models = Vec::new();
        loop {
            let path = format!(r"{CPU_ROOT}\{}", models.len());
            match string_value(&path, "ProcessorNameString") {
                Some(model) => models.push(model),
                None => break,
            }
        }
        models
    }

    pub(super) fn release() -> String {
        match (
            dword_value(NT_VERSION, "CurrentMajorVersionNumber"),
            dword_value(NT_VERSION, "CurrentMinorVersionNumber"),
            string_value(NT_VERSION, "CurrentBuildNumber"),
        ) {
            (Some(major), Some(minor), Some(build)) => format!("{major}.{minor}.{build}"),
            _ => String::new(),
        }
    }

    fn memory_status() -> Option<MEMORYSTATUSEX> {
        // SAFETY: MEMORYSTATUSEX is plain data; `dwLength` is set as the call requires.
        let mut status: MEMORYSTATUSEX = unsafe { std::mem::zeroed() };
        status.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
        // SAFETY: `status` is a valid, initialised out structure.
        (unsafe { GlobalMemoryStatusEx(&mut status) } != 0).then_some(status)
    }

    pub(super) fn total_mem() -> u64 {
        memory_status().map_or(0, |s| s.ullTotalPhys)
    }

    pub(super) fn free_mem() -> u64 {
        memory_status().map_or(0, |s| s.ullAvailPhys)
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
mod os {
    pub(super) fn cpu_models() -> Vec<String> {
        Vec::new()
    }
    pub(super) fn release() -> String {
        String::new()
    }
    pub(super) fn total_mem() -> u64 {
        0
    }
    pub(super) fn free_mem() -> u64 {
        0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repeat_model_lists_one_entry_per_cpu() {
        assert_eq!(repeat_model("M1", 3), vec!["M1", "M1", "M1"]);
        assert!(repeat_model("M1", 0).is_empty());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn cpuinfo_lists_one_model_per_processor_entry() {
        let text = "processor\t: 0\nmodel name\t: AMD Custom APU 0405\ncpu MHz\t: 1\n\nprocessor\t: 1\nmodel name\t: AMD Custom APU 0405\n\nprocessor\t: 2\n";
        assert_eq!(
            os::parse_cpuinfo(text),
            vec!["AMD Custom APU 0405", "AMD Custom APU 0405", "unknown"]
        );
        assert!(os::parse_cpuinfo("").is_empty());
    }
}
