//! `utils/systeminfo/steamDeck.ts`: whether the machine is a Steam Deck, from the first CPU's model and
//! the first GPU's ids.

use serde_json::{json, Value};

use super::pci_ids::GpuInfo;

/// `SteamDeckInfo`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SteamDeckInfo {
    NotDeck,
    Deck {
        model: &'static str,
        game_mode: bool,
    },
}

impl SteamDeckInfo {
    /// The TS object: `{ isDeck: false }` or `{ isDeck: true, model, mode }`.
    pub fn to_value(&self) -> Value {
        match self {
            SteamDeckInfo::NotDeck => json!({ "isDeck": false }),
            SteamDeckInfo::Deck { model, game_mode } => json!({
                "isDeck": true,
                "model": model,
                "mode": if *game_mode { "game" } else { "desktop" },
            }),
        }
    }
}

/// `getSteamDeckInfo(cpus, gpus)`: the two Deck APUs, then the first GPU being AMD's with the LCD's or
/// the OLED's device id. `first_cpu_model` is `os.cpus()[0]?.model`.
pub fn steam_deck_info(
    first_cpu_model: Option<&str>,
    gpus: &[GpuInfo],
    game_mode: bool,
) -> SteamDeckInfo {
    if !matches!(
        first_cpu_model,
        Some("AMD Custom APU 0405" | "AMD Custom APU 0932")
    ) {
        return SteamDeckInfo::NotDeck;
    }
    let Some(primary) = gpus.first() else {
        return SteamDeckInfo::NotDeck;
    };
    if primary.gpu.vendor_id != "1002" {
        return SteamDeckInfo::NotDeck;
    }
    match primary.gpu.device_id.as_str() {
        "163f" => SteamDeckInfo::Deck {
            model: "LCD",
            game_mode,
        },
        "1435" => SteamDeckInfo::Deck {
            model: "OLED",
            game_mode,
        },
        _ => SteamDeckInfo::NotDeck,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sysinfo::gpu::PartialGpu;

    fn gpu(vendor: &str, device: &str) -> GpuInfo {
        GpuInfo {
            gpu: PartialGpu {
                vendor_id: vendor.into(),
                device_id: device.into(),
                ..PartialGpu::default()
            },
            device_string: "d".into(),
            vendor_string: "v".into(),
        }
    }

    #[test]
    fn the_two_apus_with_the_matching_amd_gpu_are_a_deck() {
        let lcd = steam_deck_info(Some("AMD Custom APU 0405"), &[gpu("1002", "163f")], true);
        assert_eq!(
            lcd.to_value(),
            json!({ "isDeck": true, "model": "LCD", "mode": "game" })
        );
        let oled = steam_deck_info(Some("AMD Custom APU 0932"), &[gpu("1002", "1435")], false);
        assert_eq!(
            oled.to_value(),
            json!({ "isDeck": true, "model": "OLED", "mode": "desktop" })
        );
    }

    #[test]
    fn anything_else_is_not_a_deck() {
        let deck_gpu = [gpu("1002", "163f")];
        assert_eq!(
            steam_deck_info(None, &deck_gpu, false),
            SteamDeckInfo::NotDeck
        );
        assert_eq!(
            steam_deck_info(Some("AMD Ryzen 7"), &deck_gpu, false),
            SteamDeckInfo::NotDeck
        );
        assert_eq!(
            steam_deck_info(Some("AMD Custom APU 0405"), &[], false),
            SteamDeckInfo::NotDeck
        );
        assert_eq!(
            steam_deck_info(Some("AMD Custom APU 0405"), &[gpu("10de", "163f")], false),
            SteamDeckInfo::NotDeck
        );
        assert_eq!(
            steam_deck_info(Some("AMD Custom APU 0405"), &[gpu("1002", "73bf")], false),
            SteamDeckInfo::NotDeck
        );
        // Only the first GPU counts.
        assert_eq!(
            steam_deck_info(
                Some("AMD Custom APU 0405"),
                &[gpu("1002", "73bf"), gpu("1002", "163f")],
                false
            ),
            SteamDeckInfo::NotDeck
        );
    }
}
