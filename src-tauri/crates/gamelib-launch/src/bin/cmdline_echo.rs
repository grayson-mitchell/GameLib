//! The command-line echo stub behind `tests/windows_quoting.rs` (88.2-14, SC1). Never part of a shipped build
//! (`required-features = ["harness"]`).
//!
//! On Windows it prints the exact command line the process was started with (`GetCommandLineW()`, as UTF-8) on
//! the first line, and its own parse of that line (`std::env::args_os()`, which follows the CommandLineToArgvW
//! rules every C runtime child uses) as a JSON array on the second. The test compares the first line across the
//! three ways GameLib and Node can start a process, and the second against the arguments each was handed. On
//! other platforms there is no command line to echo: it prints its argv as JSON, one line.

fn argv_json() -> String {
    let argv: Vec<String> = std::env::args_os()
        .skip(1)
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect();
    serde_json::to_string(&argv).unwrap_or_else(|_| "[]".to_string())
}

#[cfg(windows)]
fn command_line() -> String {
    use windows_sys::Win32::System::Environment::GetCommandLineW;
    // SAFETY: `GetCommandLineW` takes no arguments and returns a pointer to the process's own, NUL-terminated
    // command line, valid for the life of the process; it is only read, up to its terminator.
    let text = unsafe {
        let start = GetCommandLineW();
        let mut len = 0usize;
        while *start.add(len) != 0 {
            len += 1;
        }
        std::slice::from_raw_parts(start, len)
    };
    String::from_utf16_lossy(text)
}

fn main() {
    #[cfg(windows)]
    {
        println!("{}", command_line());
    }
    println!("{}", argv_json());
}
