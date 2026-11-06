//! Port of peSections.ts: the section-name parser behind `scan_steamstub_section`.

use super::{le_u16, le_u32};
use crate::reader::read_prefix;
use serde::Serialize;
use std::path::Path;

/// Callers need only read this many leading bytes of the exe.
pub const PE_SECTION_SCAN_BYTES: usize = 8192;
/// Hard cap on sections parsed, whatever the header claims.
pub const MAX_PE_SECTIONS: usize = 96;

const SECTION_ENTRY_SIZE: usize = 40;
const SECTION_NAME_SIZE: usize = 8;

pub fn parse_section_names(buf: &[u8]) -> Vec<String> {
    parse_inner(buf).unwrap_or_default()
}

fn parse_inner(buf: &[u8]) -> Option<Vec<String>> {
    if buf.len() < 0x40 || le_u16(buf)? != 0x5a4d {
        return None;
    }
    let pe = le_u32(buf.get(0x3c..)?)? as usize;
    if pe > buf.len().saturating_sub(24) {
        return None;
    }
    if le_u32(buf.get(pe..)?)? != 0x0000_4550 {
        return None;
    }
    let count = usize::from(le_u16(buf.get(pe + 6..)?)?);
    let opt_size = usize::from(le_u16(buf.get(pe + 20..)?)?);
    let table = pe + 24 + opt_size;
    if table > buf.len() {
        return None;
    }
    let mut names = Vec::new();
    for i in 0..count.min(MAX_PE_SECTIONS) {
        let off = table + i * SECTION_ENTRY_SIZE;
        let Some(entry) = buf.get(off..off + SECTION_ENTRY_SIZE) else {
            break;
        };
        let raw = entry.get(..SECTION_NAME_SIZE)?;
        let name: String = raw.iter().map(|&c| char::from(c)).collect();
        names.push(name.trim_end_matches('\0').to_string());
    }
    Some(names)
}

/// Exact, case-sensitive `.bind` match (assumption A3).
pub fn has_steamstub_section(names: &[String]) -> bool {
    names.iter().any(|n| n == ".bind")
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SteamstubSectionResult {
    pub drm_wrapper: Option<&'static str>,
    pub read_error: Option<String>,
}

pub fn scan_steamstub_section(exe: &Path) -> SteamstubSectionResult {
    match read_prefix(exe, PE_SECTION_SCAN_BYTES) {
        Ok(buf) => SteamstubSectionResult {
            drm_wrapper: Some(if has_steamstub_section(&parse_section_names(&buf)) {
                "steamstub"
            } else {
                "none"
            }),
            read_error: None,
        },
        Err(e) => SteamstubSectionResult {
            drm_wrapper: None,
            read_error: Some(e.to_string()),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::super::pe_builder::*;
    use super::*;

    fn names_pe(names: &[&'static str]) -> Vec<u8> {
        let mut spec = Spec::new(false);
        spec.sections = names
            .iter()
            .map(|n| Sec {
                name: n,
                va: 0x1000,
                vsize: 0x10,
                rawsize: 0x10,
                rawptr: 0x1000,
            })
            .collect();
        spec.total = 0x400;
        spec.build()
    }

    #[test]
    fn reads_names_in_order() {
        let b = names_pe(&[".text", ".bind"]);
        let n = parse_section_names(&b);
        assert_eq!(n, vec![".text", ".bind"]);
        assert!(has_steamstub_section(&n));
    }

    #[test]
    fn bind_match_is_exact() {
        for s in [".binder", ".BIND", "bind"] {
            assert!(!has_steamstub_section(&[s.to_string()]));
        }
    }

    #[test]
    fn security_section_cap_96() {
        let names: Vec<&'static str> = vec![".s"; 97];
        let mut spec = Spec::new(false);
        spec.sections = names
            .iter()
            .map(|n| Sec {
                name: n,
                va: 0,
                vsize: 0,
                rawsize: 0,
                rawptr: 0,
            })
            .collect();
        spec.total = 0x2000;
        let mut b = spec.build();
        // header claims 97; the builder wrote them all
        assert_eq!(parse_section_names(&b).len(), 96);
        // header claiming far more than exists in a short buffer stops at the cut
        put16(&mut b, 0x86, 65535);
        assert_eq!(parse_section_names(&b[..0x178 + 3 * 40 + 10]).len(), 3);
    }

    #[test]
    fn cut_table_keeps_complete_names() {
        let b = names_pe(&[".text", ".bind", ".data"]);
        let table = 0x80 + 24 + 224;
        let cut = &b[..table + 40 + 20];
        assert_eq!(parse_section_names(cut), vec![".text"]);
    }

    #[test]
    fn garbage_is_empty() {
        assert!(parse_section_names(&[]).is_empty());
        assert!(parse_section_names(&[0u8; 0x80]).is_empty());
        let mut b = names_pe(&[".bind"]);
        put32(&mut b, 0x3c, u32::MAX);
        assert!(parse_section_names(&b).is_empty());
    }

    #[test]
    fn scan_missing_file_reports_read_error() {
        let r = scan_steamstub_section(Path::new("/definitely/not/here.exe"));
        assert_eq!(r.drm_wrapper, None);
        assert!(r.read_error.is_some());
    }

    #[test]
    fn scan_file_end_to_end() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.exe");
        std::fs::write(&p, names_pe(&[".text", ".bind"])).unwrap();
        assert_eq!(scan_steamstub_section(&p).drm_wrapper, Some("steamstub"));
        std::fs::write(&p, names_pe(&[".text"])).unwrap();
        assert_eq!(scan_steamstub_section(&p).drm_wrapper, Some("none"));
    }
}
