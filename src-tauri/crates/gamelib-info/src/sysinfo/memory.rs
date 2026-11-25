//! `utils/systeminfo/memory/*.ts`: total and used memory in bytes. Linux asks `free -b`, macOS asks
//! `sysctl` and `vm_stat`, Windows reads the host facts.

use super::host::HostFacts;
use super::{
    digits_to_number, is_js_space, js_trim, line_starts, run_probe, split_digits, to_bytes,
    ProbeError,
};
use crate::ctx::{InfoCtx, Platform};

/// A page is 4096 bytes when `sysctl` gives no usable answer.
const DEFAULT_PAGE_SIZE: f64 = 4096.0;

/// `PartialMemoryInfo`: the byte counts before they are formatted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct MemoryInfo {
    pub total: u64,
    pub used: u64,
}

/// `getMemoryInfo`: the probe of the platform the context says the app runs on.
pub async fn get_memory_info(
    ctx: &InfoCtx,
    host: &dyn HostFacts,
) -> Result<MemoryInfo, ProbeError> {
    match ctx.platform {
        Platform::Linux => memory_linux(ctx).await,
        Platform::Mac => memory_macos(ctx, host).await,
        Platform::Windows => Ok(memory_windows(host)),
    }
}

/// `free -b` with `LANG=C` added to the environment, so the labelled line is English whatever the
/// user's locale. The TS replaced the environment with a copy of its own plus `LANG`; this crate reads
/// no environment, so the runner adds `LANG` to the one the child inherits (the same variables).
async fn memory_linux(ctx: &InfoCtx) -> Result<MemoryInfo, ProbeError> {
    let out = run_probe(
        ctx,
        "info.sysinfo.free",
        "free",
        &["-b"],
        &[("LANG", "C")],
        false,
    )
    .await?;
    let (total, used) = parse_free(&out.stdout);
    Ok(MemoryInfo {
        total: to_bytes(total),
        used: to_bytes(used),
    })
}

/// `stdout.match(/^\S*:\s*(\d*)\s*(\d*)/m)`: the first line start from which a run of non-space
/// characters holds a colon (the last one in the run, as the greedy `\S*` backtracks to it), then the
/// two numbers that follow the white space. Both are `0` when no line matches or a capture is empty.
pub(crate) fn parse_free(stdout: &str) -> (f64, f64) {
    for start in line_starts(stdout) {
        let rest = &stdout[start..];
        let run_end = rest.find(is_js_space).unwrap_or(rest.len());
        let Some(colon) = rest[..run_end].rfind(':') else {
            continue;
        };
        let after = rest[colon + 1..].trim_start_matches(is_js_space);
        let (total, after) = split_digits(after);
        let after = after.trim_start_matches(is_js_space);
        let (used, _) = split_digits(after);
        return (digits_to_number(total), digits_to_number(used));
    }
    (0.0, 0.0)
}

/// The Windows read: `os.totalmem()` and `os.freemem()`.
fn memory_windows(host: &dyn HostFacts) -> MemoryInfo {
    let total = host.total_mem();
    MemoryInfo {
        total,
        used: total.saturating_sub(host.free_mem()),
    }
}

/// `os.totalmem()` for the total; the used figure is the active and wired pages times the page size.
async fn memory_macos(ctx: &InfoCtx, host: &dyn HostFacts) -> Result<MemoryInfo, ProbeError> {
    let total = host.total_mem();
    let page_size = page_size(ctx).await?;
    let (active, wired) = active_and_wired_pages(ctx).await?;
    Ok(MemoryInfo {
        total,
        used: to_bytes(active * page_size + wired * page_size),
    })
}

async fn page_size(ctx: &InfoCtx) -> Result<f64, ProbeError> {
    let out = run_probe(
        ctx,
        "info.sysinfo.sysctl",
        "sysctl",
        &["-n", "vm.pagesize"],
        &[],
        false,
    )
    .await?;
    let size = js_number(js_trim(&out.stdout));
    // A timed-out or failed probe leaves stdout empty, which `Number()` reads as 0.
    Ok(if size.is_finite() && size > 0.0 {
        size
    } else {
        DEFAULT_PAGE_SIZE
    })
}

/// `Number(text)` for the forms a page size can take: a decimal literal, or a `0x`, `0o` or `0b`
/// integer; anything else is `NaN` and the empty string is `0`.
fn js_number(text: &str) -> f64 {
    if text.is_empty() {
        return 0.0;
    }
    let radix = |prefix: &str, radix: u32| {
        text.strip_prefix(prefix)
            .or_else(|| text.strip_prefix(&prefix.to_uppercase()))
            .map(|digits| u64::from_str_radix(digits, radix).map_or(f64::NAN, |n| n as f64))
    };
    if let Some(n) = radix("0x", 16)
        .or_else(|| radix("0o", 8))
        .or_else(|| radix("0b", 2))
    {
        return n;
    }
    // Rust also reads `inf`, `infinity` and `nan`; none is finite and positive, so the caller's
    // check treats each as JS's `Infinity` and `NaN` are treated.
    let decimal_only = text
        .chars()
        .all(|c| c.is_ascii_digit() || matches!(c, '+' | '-' | '.' | 'e' | 'E'));
    if !decimal_only {
        return f64::NAN;
    }
    text.parse::<f64>().unwrap_or(f64::NAN)
}

async fn active_and_wired_pages(ctx: &InfoCtx) -> Result<(f64, f64), ProbeError> {
    let out = run_probe(ctx, "info.sysinfo.vm_stat", "vm_stat", &[], &[], false).await?;
    Ok(parse_vm_stat(&out.stdout))
}

/// `/^Pages active:\s*(\d*)[\s\S]*^Pages wired down:\s*(\d*)/m`: the first "Pages active:" line that
/// has a "Pages wired down:" line after it (the last one, as the greedy `[\s\S]*` backtracks to it).
/// `(0, 0)` when nothing matches or either capture is empty.
pub(crate) fn parse_vm_stat(stdout: &str) -> (f64, f64) {
    const ACTIVE: &str = "Pages active:";
    const WIRED: &str = "Pages wired down:";
    let starts = line_starts(stdout);
    for &start in &starts {
        let Some(rest) = stdout[start..].strip_prefix(ACTIVE) else {
            continue;
        };
        let rest = rest.trim_start_matches(is_js_space);
        let (active, after_active) = split_digits(rest);
        let after_active_at = stdout.len() - after_active.len();
        let wired_start = starts
            .iter()
            .rev()
            .copied()
            .find(|&p| p >= after_active_at && stdout[p..].starts_with(WIRED));
        let Some(wired_start) = wired_start else {
            continue;
        };
        let wired_rest = stdout[wired_start + WIRED.len()..].trim_start_matches(is_js_space);
        let (wired, _) = split_digits(wired_rest);
        if active.is_empty() || wired.is_empty() {
            return (0.0, 0.0);
        }
        return (digits_to_number(active), digits_to_number(wired));
    }
    (0.0, 0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    const FREE: &str = "               total        used        free      shared  buff/cache   available\nMem:     16642998272  5500000000  1000  100  200  300\nSwap:    0 0 0\n";

    #[test]
    fn free_reads_the_first_labelled_line() {
        assert_eq!(parse_free(FREE), (16_642_998_272.0, 5_500_000_000.0));
    }

    #[test]
    fn free_without_a_labelled_line_or_numbers_is_zero() {
        assert_eq!(parse_free(""), (0.0, 0.0));
        assert_eq!(parse_free("no colon here\nnor here"), (0.0, 0.0));
        assert_eq!(parse_free("Mem: n/a n/a"), (0.0, 0.0));
    }

    #[test]
    fn free_digits_may_sit_on_the_next_line_as_the_white_space_class_spans_lines() {
        assert_eq!(parse_free("Mem:\n 7 8\n"), (7.0, 8.0));
    }

    #[test]
    fn vm_stat_reads_active_and_wired() {
        let text = "Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free:     100.\nPages active:      2000.\nPages inactive:  3.\nPages wired down:      500.\n";
        assert_eq!(parse_vm_stat(text), (2000.0, 500.0));
    }

    #[test]
    fn vm_stat_needs_wired_after_active_and_numbers_in_both() {
        assert_eq!(
            parse_vm_stat("Pages wired down: 5.\nPages active: 6.\n"),
            (0.0, 0.0)
        );
        assert_eq!(
            parse_vm_stat("Pages active: x\nPages wired down: 5.\n"),
            (0.0, 0.0)
        );
        assert_eq!(parse_vm_stat("garbage"), (0.0, 0.0));
    }

    #[test]
    fn number_text_follows_js_for_page_sizes() {
        assert_eq!(js_number("16384"), 16384.0);
        assert_eq!(js_number(""), 0.0);
        assert_eq!(js_number("0x4000"), 16384.0);
        assert!(js_number("abc").is_nan());
        assert!(js_number("inf").is_nan());
        assert!(js_number("1e400").is_infinite());
    }
}
