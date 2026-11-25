//! `formatSystemInfo` and the npm `filesize` (10.1.6) calls it and `fetchSystemInfo` make, byte for byte:
//! `filesize(n, { base: 2 })` for the two sizes of the information object and plain `filesize(n)` for the
//! two the text prints.

use super::SystemInformation;
use crate::ctx::Platform;

const SYMBOLS_IEC: [&str; 9] = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];
const SYMBOLS_JEDEC: [&str; 9] = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

/// `Math.round`: half up (towards positive infinity). The sizes are never negative.
fn js_round(value: f64) -> f64 {
    let floor = value.floor();
    if value - floor >= 0.5 {
        floor + 1.0
    } else {
        floor
    }
}

/// A JS number printed the way `Array.prototype.join` prints it. The values here are a whole number or a
/// number rounded to two places, below `1e21`, where Rust's shortest round-trip print equals JS's.
fn js_number(value: f64) -> String {
    format!("{value}")
}

/// `filesize(bytes, { base: 2 })` when `base2` (IEC symbols over 1024) and `filesize(bytes)` otherwise
/// (decimal, 1000, with `kB` for the first step), both rounded to two places above a byte and joined with a
/// space.
pub fn filesize(bytes: f64, base2: bool) -> String {
    let ceil: f64 = if base2 { 1024.0 } else { 1000.0 };
    let mut e = (bytes.ln() / ceil.ln()).floor();
    if e.is_nan() || e < 0.0 {
        e = 0.0;
    }
    if e > 8.0 {
        e = 8.0;
    }
    let mut index = e as usize;
    let value = if bytes == 0.0 {
        0.0
    } else {
        let divisor = if base2 {
            2f64.powi(index as i32 * 10)
        } else {
            1000f64.powi(index as i32)
        };
        let scale = 10f64.powi(if index > 0 { 2 } else { 0 });
        let mut rounded = js_round(bytes / divisor * scale) / scale;
        if rounded == ceil && index < 8 {
            rounded = 1.0;
            index += 1;
        }
        rounded
    };
    let symbol = if !base2 && index == 1 {
        "kB"
    } else if base2 {
        SYMBOLS_IEC[index]
    } else {
        SYMBOLS_JEDEC[index]
    };
    format!("{} {symbol}", js_number(value))
}

/// `formatSystemInfo`: the text Settings copies to the clipboard. `platform` is `process.platform`'s
/// answer, which decides whether the Flatpak and AppImage lines are printed (Linux only).
pub fn format_system_info(info: &SystemInformation, platform: Platform) -> String {
    let probe = &info.probe;
    let gpus = probe
        .gpus
        .iter()
        .enumerate()
        .map(|(index, gpu)| {
            let undefined =
                |value: &Option<String>| value.clone().unwrap_or_else(|| "undefined".to_string());
            format!(
                "  GPU {index}:\n    Name: {} {}\n    IDs: D={} V={} SD={} SV={}\n    Driver: {}",
                gpu.vendor_string,
                gpu.device_string,
                gpu.gpu.device_id,
                gpu.gpu.vendor_id,
                undefined(&gpu.gpu.subdevice_id),
                undefined(&gpu.gpu.subvendor_id),
                undefined(&gpu.gpu.driver_version),
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let deck = match &probe.steam_deck {
        super::deck::SteamDeckInfo::NotDeck => " not a Steam Deck".to_string(),
        super::deck::SteamDeckInfo::Deck { model, game_mode } => format!(
            " a Steam Deck (model: {model}) in {} mode",
            if *game_mode { "game" } else { "desktop" }
        ),
    };
    let container = if platform == Platform::Linux {
        format!(
            "We are{} running inside a Flatpak container\nWe are{} running from an AppImage\n",
            if probe.is_flatpak { "" } else { " not" },
            if probe.is_app_image { "" } else { " not" },
        )
    } else {
        String::new()
    };
    format!(
        "CPU: {}x {}\nMemory: {} (used: {})\nGPUs:\n{}\nOS: {} {} ({})\n\nThe current system is{}\n{}\nSoftware Versions:\n  {}: {}\n  Legendary: {}\n  gogdl: {}\n  comet: {}\n  Nile: {}",
        probe.cores,
        probe.cpu_model,
        filesize(probe.memory.total as f64, false),
        filesize(probe.memory.used as f64, false),
        gpus,
        probe.os_name,
        probe.os_version,
        probe.os_platform,
        deck,
        container,
        APP_DISPLAY_NAME,
        info.software.heroic_version,
        info.software.legendary_version,
        info.software.gogdl_version,
        info.software.comet_version,
        info.software.nile_version,
    )
}

/// `APP_DISPLAY_NAME` of `backend/constants/others.ts`.
const APP_DISPLAY_NAME: &str = "GameLib";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zero_and_small_sizes_are_bytes_with_no_decimals() {
        assert_eq!(filesize(0.0, true), "0 B");
        assert_eq!(filesize(0.0, false), "0 B");
        assert_eq!(filesize(999.0, false), "999 B");
        assert_eq!(filesize(1000.0, true), "1000 B");
    }

    #[test]
    fn the_first_decimal_step_is_kb_and_the_binary_steps_are_iec() {
        assert_eq!(filesize(1000.0, false), "1 kB");
        assert_eq!(filesize(1536.0, true), "1.5 KiB");
        assert_eq!(filesize(16_642_998_272.0, true), "15.5 GiB");
        assert_eq!(filesize(16_642_998_272.0, false), "16.64 GB");
    }

    #[test]
    fn a_rounding_up_to_the_next_unit_moves_to_it() {
        // 999999 / 1000 rounds to 1000, which is the ceiling: 1 MB.
        assert_eq!(filesize(999_999.0, false), "1 MB");
        assert_eq!(filesize(1_048_575.0, true), "1 MiB");
    }
}
