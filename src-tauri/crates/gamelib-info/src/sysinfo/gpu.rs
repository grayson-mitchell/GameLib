//! `utils/systeminfo/gpu/{index,linux,windows}.ts`: the GPUs a machine lists, then their `pci.ids`
//! names. Linux asks `lspci -mm -v -n -k` once, Windows asks WMI through PowerShell, macOS lists none.

use serde_json::{json, Map, Value};

use super::dns::TxtResolver;
use super::pci_ids::{populate_device_and_vendor_name, GpuInfo, PciCaches};
use super::{is_js_space, is_line_terminator, js_trim, run_probe, ProbeError};
use crate::ctx::{InfoCtx, Platform};

/// `PartialGpuInfo`: a GPU's ids and driver, before `pci.ids` names it.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct PartialGpu {
    pub vendor_id: String,
    pub device_id: String,
    pub subvendor_id: Option<String>,
    pub subdevice_id: Option<String>,
    pub driver_version: Option<String>,
}

impl PartialGpu {
    /// The fields of the TS object, an absent one left out as `undefined` is.
    pub fn to_value(&self) -> Value {
        let mut fields = Map::new();
        fields.insert("vendorId".into(), json!(self.vendor_id));
        fields.insert("deviceId".into(), json!(self.device_id));
        for (key, value) in [
            ("subvendorId", &self.subvendor_id),
            ("subdeviceId", &self.subdevice_id),
            ("driverVersion", &self.driver_version),
        ] {
            if let Some(value) = value {
                fields.insert(key.into(), json!(value));
            }
        }
        Value::Object(fields)
    }
}

/// PCI display classes: VGA compatible, 3D controller, display controller (other).
const GPU_CLASSES: [&str; 3] = ["0300", "0302", "0380"];

/// `/^[0-9a-f]{4}$/i`.
pub(crate) fn is_hex4(value: &str) -> bool {
    value.len() == 4 && value.bytes().all(|b| b.is_ascii_hexdigit())
}

/// `stdout.split(/\r?\n\s*\r?\n/)`: records are split at the first line break of a run of white space
/// that holds at least two of them, through the last of them (the greedy `\s*` backtracks to it).
fn split_records(stdout: &str) -> Vec<&str> {
    let mut records = Vec::new();
    let mut record_start = 0;
    let mut i = 0;
    let bytes = stdout.as_bytes();
    while i < stdout.len() {
        // The white-space run that begins at the first '\n' at or after `i`.
        let Some(rel) = stdout[i..].find('\n') else {
            break;
        };
        let first_nl = i + rel;
        let after_first = first_nl + 1;
        let run_end = after_first
            + stdout[after_first..]
                .find(|c: char| !is_js_space(c))
                .unwrap_or(stdout.len() - after_first);
        match stdout[after_first..run_end].rfind('\n') {
            Some(last_rel) => {
                let last_nl = after_first + last_rel;
                // A `\r` right before the first '\n' is part of the separator (`\r?\n`).
                let sep_start = if first_nl > 0 && bytes[first_nl - 1] == b'\r' {
                    first_nl - 1
                } else {
                    first_nl
                };
                records.push(&stdout[record_start..sep_start]);
                record_start = last_nl + 1;
                i = record_start;
            }
            None => i = after_first,
        }
    }
    records.push(&stdout[record_start..]);
    records
}

/// `parseLspciGpus`: the GPU records of `lspci -mm -v -n -k`, in lspci's bus order. Non-GPU records
/// and records with malformed ids are dropped.
pub fn parse_lspci_gpus(stdout: &str) -> Vec<PartialGpu> {
    let mut gpus = Vec::new();
    for record in split_records(stdout) {
        let mut fields: Vec<(&str, &str)> = Vec::new();
        for line in record.split('\n') {
            let line = line.strip_suffix('\r').unwrap_or(line);
            let Some(at) = line.find(':') else {
                continue;
            };
            let (key, value) = (js_trim(&line[..at]), js_trim(&line[at + 1..]));
            match fields.iter_mut().find(|(k, _)| *k == key) {
                Some(existing) => existing.1 = value,
                None => fields.push((key, value)),
            }
        }
        let get = |key: &str| fields.iter().find(|(k, _)| *k == key).map(|(_, v)| *v);

        let class = get("Class").map(str::to_lowercase).unwrap_or_default();
        if class.is_empty() || !GPU_CLASSES.contains(&class.as_str()) {
            continue;
        }
        let (Some(vendor), Some(device)) = (get("Vendor"), get("Device")) else {
            continue;
        };
        if !is_hex4(vendor) || !is_hex4(device) {
            continue;
        }
        let hex4 = |key: &str| get(key).filter(|v| is_hex4(v)).map(str::to_lowercase);
        gpus.push(PartialGpu {
            vendor_id: vendor.to_lowercase(),
            device_id: device.to_lowercase(),
            subvendor_id: hex4("SVendor"),
            subdevice_id: hex4("SDevice"),
            driver_version: get("Driver").filter(|d| !d.is_empty()).map(str::to_string),
        });
    }
    gpus
}

/// `getGpuInfo_linux`: one `lspci` call lists every display-class device with its subsystem ids and
/// kernel driver. A missing `lspci`, a non-zero exit and a timeout each give `[]` and a fixed warning;
/// this probe never fails.
pub async fn gpu_info_linux(ctx: &InfoCtx) -> Vec<PartialGpu> {
    match run_probe(
        ctx,
        "info.sysinfo.lspci",
        "lspci",
        &["-mm", "-v", "-n", "-k"],
        &[],
        false,
    )
    .await
    {
        Err(_) => {
            ctx.note("Could not list GPUs: lspci missing or failed");
            Vec::new()
        }
        Ok(out) if out.code != Some(0) => {
            ctx.note("Could not list GPUs: lspci did not exit successfully");
            Vec::new()
        }
        Ok(out) => parse_lspci_gpus(&out.stdout),
    }
}

/// `Win32_VideoController` of the PowerShell answer: all three fields must be strings.
fn video_controller(value: &Value) -> Option<(&str, &str, &str)> {
    let object = value.as_object()?;
    Some((
        object.get("AdapterCompatibility")?.as_str()?,
        object.get("DriverVersion")?.as_str()?,
        object.get("PnPDeviceID")?.as_str()?,
    ))
}

/// `getFormattedDriverVersion`: NVIDIA's `31.0.15.3713` is really driver `537.13` (the last five digits,
/// a dot after the third); every other maker's version is shown as it is.
fn formatted_driver_version(driver_version: &str, manufacturer: &str) -> String {
    if manufacturer != "NVIDIA" {
        return driver_version.to_string();
    }
    let digits: Vec<char> = driver_version.chars().filter(|c| *c != '.').collect();
    // `slice(-5, -2)` of the dotless text, then `slice(-2)` of the dotted one.
    let from_end = |chars: &[char], start: usize, end: usize| -> String {
        let len = chars.len();
        let (from, to) = (len.saturating_sub(start), len.saturating_sub(end));
        if from >= to {
            String::new()
        } else {
            chars[from..to].iter().collect()
        }
    };
    let dotted: Vec<char> = driver_version.chars().collect();
    format!("{}.{}", from_end(&digits, 5, 2), from_end(&dotted, 2, 0))
}

/// The four characters at `at` (`.{4}`: no line terminator among them).
fn four_chars(chars: &[char], at: usize) -> Option<&[char]> {
    let four = chars.get(at..at + 4)?;
    if four.iter().any(|c| is_line_terminator(*c)) {
        return None;
    }
    Some(four)
}

/// `/VEN_(.{4})&DEV_(.{4})&SUBSYS_(.{4})(.{4})/` on a PnP device id, the first place it matches:
/// `(vendor, device, subdevice, subvendor)`, lowercased (WMI spells the hex in capitals).
fn pnp_ids(pnp: &str) -> Option<(String, String, String, String)> {
    let chars: Vec<char> = pnp.chars().collect();
    let literal = |at: usize, text: &str| {
        text.chars()
            .enumerate()
            .all(|(offset, c)| chars.get(at + offset) == Some(&c))
    };
    let lower = |part: &[char]| part.iter().collect::<String>().to_lowercase();
    for start in 0..chars.len() {
        if !literal(start, "VEN_") {
            continue;
        }
        let vendor = start + 4;
        let device_tag = vendor + 4;
        let device = device_tag + 5;
        let subsys_tag = device + 4;
        let sub = subsys_tag + 8;
        if !(literal(device_tag, "&DEV_") && literal(subsys_tag, "&SUBSYS_")) {
            continue;
        }
        let (Some(ven), Some(dev), Some(subdevice), Some(subvendor)) = (
            four_chars(&chars, vendor),
            four_chars(&chars, device),
            four_chars(&chars, sub),
            four_chars(&chars, sub + 4),
        ) else {
            continue;
        };
        return Some((lower(ven), lower(dev), lower(subdevice), lower(subvendor)));
    }
    None
}

/// The GPUs of `Get-CimInstance Win32_VideoController | ConvertTo-Json`: one object for one GPU, an
/// array for several. An answer that is not JSON, or has a controller missing a field, lists none; a
/// controller whose PnP id carries no vendor and device ids is skipped.
pub fn parse_windows_gpus(stdout: &str) -> Vec<PartialGpu> {
    let Ok(parsed) = serde_json::from_str::<Value>(stdout) else {
        return Vec::new();
    };
    let controllers: Vec<(&str, &str, &str)> = match &parsed {
        Value::Array(items) => {
            let all: Option<Vec<_>> = items.iter().map(video_controller).collect();
            match all {
                Some(all) => all,
                None => return Vec::new(),
            }
        }
        single => match video_controller(single) {
            Some(controller) => vec![controller],
            None => return Vec::new(),
        },
    };
    controllers
        .into_iter()
        .filter_map(|(manufacturer, driver_version, pnp)| {
            let (vendor_id, device_id, subdevice_id, subvendor_id) = pnp_ids(pnp)?;
            Some(PartialGpu {
                vendor_id,
                device_id,
                subvendor_id: Some(subvendor_id),
                subdevice_id: Some(subdevice_id),
                driver_version: Some(formatted_driver_version(driver_version, manufacturer)),
            })
        })
        .collect()
}

/// `getGpuInfo_windows`: one PowerShell query. A missing PowerShell is the error; a timeout or a
/// non-zero exit leaves whatever stdout there was to parse, as the TS did.
pub async fn gpu_info_windows(ctx: &InfoCtx) -> Result<Vec<PartialGpu>, ProbeError> {
    let out = run_probe(
        ctx,
        "info.sysinfo.powershell_gpu",
        "powershell",
        &[
            "Get-CimInstance",
            "-Class",
            "Win32_VideoController",
            "-Property",
            "AdapterCompatibility,DriverVersion,PnPDeviceID",
            "|",
            "Select-Object",
            "AdapterCompatibility,DriverVersion,PnPDeviceID",
            "|",
            "ConvertTo-Json",
            "-Compress",
        ],
        &[],
        true,
    )
    .await?;
    Ok(parse_windows_gpus(&out.stdout))
}

/// `getGpuInfo`: the machine's GPUs with their names. A failure anywhere gives `[]` and one fixed
/// warning (never the error: it could name a program, a path or a hardware id); a GPU whose device or
/// vendor name cannot be found is left out.
pub async fn get_gpu_info(ctx: &InfoCtx, resolver: &dyn TxtResolver) -> Vec<GpuInfo> {
    const COULD_NOT: &str = "Could not gather GPU info";
    let partial = match ctx.platform {
        Platform::Windows => match gpu_info_windows(ctx).await {
            Ok(gpus) => gpus,
            Err(_) => {
                ctx.note(COULD_NOT);
                return Vec::new();
            }
        },
        Platform::Linux => gpu_info_linux(ctx).await,
        // macOS GPU probing is not implemented.
        Platform::Mac => Vec::new(),
    };
    if partial.is_empty() {
        return Vec::new();
    }
    let named = match PciCaches::open(ctx) {
        Ok(caches) => populate_device_and_vendor_name(&caches, resolver, partial).await,
        Err(error) => Err(error),
    };
    match named {
        Ok(gpus) => gpus,
        Err(_) => {
            ctx.note(COULD_NOT);
            Vec::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rec(fields: &[(&str, &str)]) -> String {
        fields
            .iter()
            .map(|(k, v)| format!("{k}:\t{v}"))
            .collect::<Vec<_>>()
            .join("\n")
    }

    #[test]
    fn a_blank_line_run_splits_records_and_carriage_returns_belong_to_the_separator() {
        assert_eq!(split_records("a\n\nb"), vec!["a", "b"]);
        assert_eq!(split_records("a\r\n\r\nb"), vec!["a", "b"]);
        assert_eq!(split_records("a\n \t\n\n b"), vec!["a", " b"]);
        assert_eq!(split_records("a\nb"), vec!["a\nb"]);
        assert_eq!(split_records(""), vec![""]);
        assert_eq!(split_records("a\n\n"), vec!["a", ""]);
    }

    #[test]
    fn a_gpu_record_keeps_lowercased_ids_and_the_driver() {
        let text = format!(
            "{}\n\n{}",
            rec(&[
                ("Slot", "00:01.1"),
                ("Class", "0604"),
                ("Vendor", "1022"),
                ("Device", "1634")
            ]),
            rec(&[
                ("Class", "0300"),
                ("Vendor", "1002"),
                ("Device", "73BF"),
                ("SVendor", "1DA2"),
                ("SDevice", "e445"),
                ("Driver", "amdgpu"),
            ])
        );
        assert_eq!(
            parse_lspci_gpus(&text),
            vec![PartialGpu {
                vendor_id: "1002".into(),
                device_id: "73bf".into(),
                subvendor_id: Some("1da2".into()),
                subdevice_id: Some("e445".into()),
                driver_version: Some("amdgpu".into()),
            }]
        );
    }

    #[test]
    fn records_with_bad_ids_or_a_non_display_class_are_dropped() {
        for bad in [
            rec(&[("Class", "0300"), ("Vendor", "zzzz"), ("Device", "73bf")]),
            rec(&[("Class", "0300"), ("Vendor", "1002")]),
            rec(&[("Class", "0c03"), ("Vendor", "1002"), ("Device", "73bf")]),
            rec(&[("Vendor", "1002"), ("Device", "73bf")]),
            "garbage".to_string(),
        ] {
            assert!(parse_lspci_gpus(&bad).is_empty(), "{bad}");
        }
        assert!(parse_lspci_gpus("").is_empty());
    }

    #[test]
    fn malformed_subsystem_ids_are_left_out_and_the_gpu_is_kept() {
        let text = rec(&[
            ("Class", "0302"),
            ("Vendor", "10de"),
            ("Device", "2860"),
            ("SVendor", "xyz"),
            ("SDevice", "12345"),
        ]);
        let gpus = parse_lspci_gpus(&text);
        assert_eq!(gpus.len(), 1);
        assert_eq!(gpus[0].subvendor_id, None);
        assert_eq!(gpus[0].subdevice_id, None);
        assert_eq!(gpus[0].driver_version, None);
    }

    #[test]
    fn crlf_output_parses_like_lf_output() {
        let text = "Class:\t0300\r\nVendor:\t1002\r\nDevice:\t73bf\r\n\r\nClass:\t0380\r\nVendor:\t10de\r\nDevice:\t2860\r\n";
        let gpus = parse_lspci_gpus(text);
        assert_eq!(gpus.len(), 2);
        assert_eq!(gpus[1].vendor_id, "10de");
    }

    #[test]
    fn to_value_leaves_out_what_is_absent() {
        let gpu = PartialGpu {
            vendor_id: "1002".into(),
            device_id: "163f".into(),
            driver_version: Some("amdgpu".into()),
            ..PartialGpu::default()
        };
        assert_eq!(
            gpu.to_value(),
            json!({ "vendorId": "1002", "deviceId": "163f", "driverVersion": "amdgpu" })
        );
    }

    #[test]
    fn a_single_object_and_an_array_both_parse_and_ids_are_lowercased() {
        let one = r#"{"AdapterCompatibility":"Intel Corporation","DriverVersion":"1.2.3","PnPDeviceID":"PCI\\VEN_8086&DEV_1234&SUBSYS_5678ABCD"}"#;
        let gpus = parse_windows_gpus(one);
        assert_eq!(
            gpus,
            vec![PartialGpu {
                vendor_id: "8086".into(),
                device_id: "1234".into(),
                subdevice_id: Some("5678".into()),
                subvendor_id: Some("abcd".into()),
                driver_version: Some("1.2.3".into()),
            }]
        );
        let two = format!("[{one},{one}]");
        assert_eq!(parse_windows_gpus(&two).len(), 2);
    }

    #[test]
    fn nvidia_driver_versions_are_reformatted_and_others_kept() {
        assert_eq!(formatted_driver_version("31.0.15.3713", "NVIDIA"), "537.13");
        assert_eq!(
            formatted_driver_version("31.0.21001.1", "Advanced Micro Devices, Inc."),
            "31.0.21001.1"
        );
        assert_eq!(
            formatted_driver_version("1.2.3", "Intel Corporation"),
            "1.2.3"
        );
        // Short versions follow JS `slice` clamping rather than panicking.
        assert_eq!(formatted_driver_version("1.2", "NVIDIA"), "..2");
        assert_eq!(formatted_driver_version("", "NVIDIA"), ".");
        assert_eq!(formatted_driver_version("12345", "NVIDIA"), "123.45");
    }

    #[test]
    fn malformed_windows_answers_list_no_gpu() {
        for bad in [
            "",
            "not json",
            "null",
            "42",
            r#"{"AdapterCompatibility":"NVIDIA"}"#,
            r#"{"AdapterCompatibility":1,"DriverVersion":"1","PnPDeviceID":"x"}"#,
            // One bad member spoils the whole array.
            r#"[{"AdapterCompatibility":"a","DriverVersion":"1","PnPDeviceID":"PCI\\VEN_8086&DEV_1234&SUBSYS_5678ABCD"},{"x":1}]"#,
            r#"{"AdapterCompatibility":"a","DriverVersion":"1","PnPDeviceID":"USB\\ROOT_HUB30\\4&1"}"#,
            // The subsystem ids are part of the match.
            r#"{"AdapterCompatibility":"a","DriverVersion":"1","PnPDeviceID":"PCI\\VEN_8086&DEV_1234"}"#,
        ] {
            assert!(parse_windows_gpus(bad).is_empty(), "{bad}");
        }
    }

    #[test]
    fn the_pnp_id_pattern_matches_where_it_first_can_and_not_across_a_line() {
        assert_eq!(
            pnp_ids("xx VEN_10DE&DEV_2684&SUBSYS_88EE1043&REV_A1"),
            Some(("10de".into(), "2684".into(), "88ee".into(), "1043".into()))
        );
        // `VEN_` that does not complete the pattern is passed over for a later one that does.
        assert_eq!(
            pnp_ids("VEN_zz&DEV_ VEN_1002&DEV_1681&SUBSYS_88231043"),
            Some(("1002".into(), "1681".into(), "8823".into(), "1043".into()))
        );
        assert_eq!(pnp_ids("VEN_10DE&DEV_2684&SUBSYS_88\n21043"), None);
        assert_eq!(pnp_ids("VEN_10DE&DEV_2684&SUBSYS_88EE104"), None);
    }
}
