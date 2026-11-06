//! Port of `detectSteamDrmInPe` (peSteamDrm.ts): CEG resource names plus the `.bind` flag.

use super::{rd_u16, rd_u32, rva_to_offset, PeInfo};
use crate::reader::{FileReader, RangeRead};
use serde::Serialize;
use std::path::Path;

pub const CEG_RESOURCE_NAMES: [&str; 3] = ["STEAM_SPLIT_GUID", "STEAM_GUIDD", "STEAM_MINSTANCE"];

const MAX_DIR_ENTRIES: u32 = 4096;
const MAX_NAME_UNITS: u16 = 256;
const RT_RCDATA: u32 = 10;

#[derive(Debug, PartialEq, Default)]
pub struct PeSteamDrmResult {
    pub parsed: bool,
    pub ceg_markers: Vec<String>,
    pub has_bind_section: bool,
}

struct DirEntry {
    name: u32,
    data: u32,
    is_named: bool,
}

fn read_dir(r: &mut impl RangeRead, dir: u64) -> Option<Vec<DirEntry>> {
    let named = u32::from(rd_u16(r, dir.saturating_add(12))?);
    let ids = u32::from(rd_u16(r, dir.saturating_add(14))?);
    let total = named + ids;
    if total > MAX_DIR_ENTRIES {
        return None;
    }
    let mut out = Vec::with_capacity(total as usize);
    for i in 0..total {
        let e = dir
            .saturating_add(16)
            .saturating_add(u64::from(i).saturating_mul(8));
        out.push(DirEntry {
            name: rd_u32(r, e)?,
            data: rd_u32(r, e.saturating_add(4))?,
            is_named: i < named,
        });
    }
    Some(out)
}

pub fn detect_steam_drm(r: &mut impl RangeRead) -> PeSteamDrmResult {
    detect_inner(r).unwrap_or_default()
}

fn detect_inner(r: &mut impl RangeRead) -> Option<PeSteamDrmResult> {
    let info = PeInfo::parse(r)?;
    let (mut resource_rva, mut resource_size) = (0u32, 0u32);
    if info.num_rva_and_sizes >= 3 {
        (resource_rva, resource_size) = info.data_dir(r, 2)?;
    }
    let sections = info.read_sections(r)?;
    let has_bind_section = sections.iter().any(|s| s.name == ".bind");
    if resource_size == 0 || resource_rva == 0 {
        return Some(PeSteamDrmResult {
            parsed: true,
            ceg_markers: Vec::new(),
            has_bind_section,
        });
    }
    let root = rva_to_offset(&sections, i128::from(resource_rva))?;

    let mut markers: Vec<String> = Vec::new();
    for top in read_dir(r, root)? {
        if top.is_named || top.name != RT_RCDATA || top.data & 0x8000_0000 == 0 {
            continue;
        }
        let sub_rel = top.data & 0x7fff_ffff;
        // Cycle guard: a subdirectory must sit strictly after its parent.
        if sub_rel == 0 {
            return None;
        }
        let sub = root.saturating_add(u64::from(sub_rel));
        for entry in read_dir(r, sub)? {
            if entry.name & 0x8000_0000 == 0 {
                continue;
            }
            let str_off = root.saturating_add(u64::from(entry.name & 0x7fff_ffff));
            let len = rd_u16(r, str_off)?.min(MAX_NAME_UNITS);
            let raw = r.read_at(str_off.saturating_add(2), usize::from(len) * 2)?;
            // Per-code-unit decode like String.fromCharCode. A lone surrogate becomes U+FFFD;
            // no CEG name contains one, so the match outcome is identical to TS.
            let units = raw
                .chunks_exact(2)
                .map(|c| u16::from_le_bytes([c[0], c[1]]));
            let s: String = char::decode_utf16(units)
                .map(|u| u.unwrap_or('\u{FFFD}'))
                .collect();
            let upper = s.to_uppercase();
            if CEG_RESOURCE_NAMES.contains(&upper.as_str()) && !markers.contains(&s) {
                markers.push(s);
            }
        }
    }
    Some(PeSteamDrmResult {
        parsed: true,
        ceg_markers: markers,
        has_bind_section,
    })
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SteamDrmScanResult {
    pub parsed: bool,
    pub ceg_markers: Vec<String>,
    pub has_bind_section: bool,
    pub read_error: Option<String>,
}

pub fn scan_steam_drm(exe: &Path) -> SteamDrmScanResult {
    match FileReader::open(exe) {
        Ok(mut r) => {
            let d = detect_steam_drm(&mut r);
            SteamDrmScanResult {
                parsed: d.parsed,
                ceg_markers: d.ceg_markers,
                has_bind_section: d.has_bind_section,
                read_error: None,
            }
        }
        Err(e) => SteamDrmScanResult {
            parsed: false,
            ceg_markers: Vec::new(),
            has_bind_section: false,
            read_error: Some(e.to_string()),
        },
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::super::pe_builder::*;
    use super::*;
    use crate::reader::SliceReader;

    /// PE with an RT_RCDATA directory at 0x1000 naming `names`; `ids` extra id entries come first.
    pub(crate) fn ceg_pe(plus: bool, names: &[&str], bind: bool) -> Vec<u8> {
        let mut spec = Spec::new(plus);
        spec.dirs[2] = (0x1000, 0x800);
        if bind {
            spec.sections.push(Sec {
                name: ".bind",
                va: 0x9000,
                vsize: 0x10,
                rawsize: 0x10,
                rawptr: 0x9000,
            });
            spec.total = 0x9100;
        }
        let mut b = spec.build();
        let root = 0x1000;
        // root: 0 named, 1 id (RT_RCDATA -> subdir at +0x20)
        put16(&mut b, root + 12, 0);
        put16(&mut b, root + 14, 1);
        put32(&mut b, root + 16, RT_RCDATA);
        put32(&mut b, root + 20, 0x8000_0000 | 0x20);
        let sub = root + 0x20;
        put16(&mut b, sub + 12, names.len() as u16);
        put16(&mut b, sub + 14, 0);
        let mut str_rel = 0x100u32;
        for (i, n) in names.iter().enumerate() {
            put32(&mut b, sub + 16 + i * 8, 0x8000_0000 | str_rel);
            put32(&mut b, sub + 20 + i * 8, 0);
            let at = root + str_rel as usize;
            let units: Vec<u16> = n.encode_utf16().collect();
            put16(&mut b, at, units.len() as u16);
            for (k, u) in units.iter().enumerate() {
                put16(&mut b, at + 2 + k * 2, *u);
            }
            str_rel += 0x40;
        }
        b
    }

    fn detect(b: &[u8]) -> PeSteamDrmResult {
        detect_steam_drm(&mut SliceReader::new(b))
    }

    #[test]
    fn finds_markers_any_case_original_spelling_deduped_in_order() {
        let b = ceg_pe(
            false,
            &[
                "steam_split_guid",
                "OTHER",
                "STEAM_MINSTANCE",
                "steam_split_guid",
            ],
            false,
        );
        let d = detect(&b);
        assert!(d.parsed);
        assert_eq!(d.ceg_markers, vec!["steam_split_guid", "STEAM_MINSTANCE"]);
        assert!(!d.has_bind_section);
    }

    #[test]
    fn pe32_plus_and_bind_flag() {
        let b = ceg_pe(true, &["STEAM_GUIDD"], true);
        let d = detect(&b);
        assert_eq!(d.ceg_markers, vec!["STEAM_GUIDD"]);
        assert!(d.has_bind_section);
    }

    #[test]
    fn no_resources_is_parsed_and_empty() {
        let b = Spec::new(false).build();
        let d = detect(&b);
        assert!(d.parsed && d.ceg_markers.is_empty());
    }

    #[test]
    fn id_entries_are_ignored() {
        let mut b = ceg_pe(false, &["STEAM_GUIDD"], false);
        // turn the sub-entry name into an id (high bit clear)
        put32(&mut b, 0x1000 + 0x20 + 16, 0x100);
        assert!(detect(&b).ceg_markers.is_empty());
    }

    #[test]
    fn virtual_size_beats_raw_size_53_15() {
        // Section A has a huge raw size but small VirtualSize; the resource sits in B.
        let mut spec = Spec::new(false);
        spec.dirs[2] = (0x6000, 0x100);
        spec.sections = vec![
            Sec {
                name: ".pck",
                va: 0x1000,
                vsize: 0x1000,
                rawsize: 0x10_0000,
                rawptr: 0x1000,
            },
            Sec {
                name: ".rsrc",
                va: 0x6000,
                vsize: 0x100,
                rawsize: 0x100,
                rawptr: 0x3000,
            },
        ];
        spec.total = 0x4000;
        let mut b = spec.build();
        put16(&mut b, 0x3000 + 14, 0);
        let d = detect(&b);
        assert!(d.parsed);
    }

    #[test]
    fn security_self_referencing_directory() {
        let mut b = ceg_pe(false, &["STEAM_GUIDD"], false);
        put32(&mut b, 0x1000 + 20, 0x8000_0000); // relative offset 0
        assert_eq!(detect(&b), PeSteamDrmResult::default());
    }

    #[test]
    fn security_resource_rva_outside_every_section() {
        let mut spec = Spec::new(false);
        spec.dirs[2] = (0x9000_0000, 0x100);
        let d = detect(&spec.build());
        assert!(!d.parsed);
    }

    #[test]
    fn security_dir_entries_cap_4096() {
        let mut b = ceg_pe(false, &[], false);
        // sub dir claims 4097 entries
        put16(&mut b, 0x1020 + 12, 4097);
        assert!(!detect(&b).parsed);
        // exactly at the cap is tolerated shape-wise (reads may then run off the section: still no panic)
        put16(&mut b, 0x1020 + 12, 4096);
        let _ = detect(&b);
    }

    #[test]
    fn security_name_length_cap_256_units() {
        let mut b = ceg_pe(false, &["STEAM_GUIDD"], false);
        put16(&mut b, 0x1000 + 0x100, 0xffff); // claims 65535 units; only 256 are read
        let d = detect(&b);
        assert!(d.parsed);
        assert!(d.ceg_markers.is_empty());
    }

    #[test]
    fn security_unpaired_surrogate_does_not_panic() {
        let mut b = ceg_pe(false, &["STEAM_GUIDD"], false);
        put16(&mut b, 0x1000 + 0x100 + 2, 0xd800);
        assert!(detect(&b).ceg_markers.is_empty());
    }

    #[test]
    fn short_read_is_unparsed() {
        let b = ceg_pe(false, &["STEAM_GUIDD"], false);
        assert!(!detect(&b[..0x1020]).parsed);
        assert!(!detect(&[]).parsed);
    }

    #[test]
    fn open_error_sets_read_error() {
        let r = scan_steam_drm(Path::new("/definitely/not/here.exe"));
        assert!(!r.parsed && r.ceg_markers.is_empty() && !r.has_bind_section);
        assert!(r.read_error.is_some());
    }
}
