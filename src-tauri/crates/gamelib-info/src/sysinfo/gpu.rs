//! `utils/systeminfo/gpu/{index,linux}.ts`: the GPUs a machine lists, before their names are looked
//! up. Linux asks `lspci -mm -v -n -k` once; macOS lists none.

use serde_json::{json, Map, Value};

use super::{is_js_space, js_trim, run_probe};
use crate::ctx::InfoCtx;

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
}
