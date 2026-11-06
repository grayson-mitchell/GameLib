//! Port of legacyMachoParse.ts: the in-process Mach-O defined-external symbol reader (`nm -gU`
//! semantics, nothing spawned) and the DXMT winemac.so metal-view export check.
//! Every read is bounds-checked; anything short, out of range or unsupported is `None`.

use serde::Serialize;
use std::path::Path;

const MH_MAGIC_64: u32 = 0xfeed_facf;
const FAT_MAGIC: u32 = 0xcafe_babe;
const CPU_TYPE_X86_64: u32 = 0x0100_0007;
const LC_SYMTAB: u32 = 0x2;
const LC_DYSYMTAB: u32 = 0xb;
const NLIST_64_SIZE: u64 = 16;
const N_EXT: u8 = 0x01;
const N_TYPE_MASK: u8 = 0x0e;
const N_STAB_MASK: u8 = 0xe0;

/// Same order as the TS `DXMT_REQUIRED_MACDRV_SYMBOLS`.
pub const DXMT_REQUIRED_MACDRV_SYMBOLS: [&str; 4] = [
    "_macdrv_functions",
    "_macdrv_view_create_metal_view",
    "_macdrv_view_get_metal_layer",
    "_macdrv_view_release_metal_view",
];

fn u32_at(buf: &[u8], off: u64, big: bool) -> Option<u32> {
    let start = usize::try_from(off).ok()?;
    let end = start.checked_add(4)?;
    let b: [u8; 4] = buf.get(start..end)?.try_into().ok()?;
    Some(if big {
        u32::from_be_bytes(b)
    } else {
        u32::from_le_bytes(b)
    })
}

/// NUL-terminated string at `start`, which must lie below `limit`; the terminator must not be
/// past `limit` (the TS searches the whole buffer, so we do too).
fn read_c_string(buf: &[u8], start: u64, limit: u64) -> Option<String> {
    if start >= limit {
        return None;
    }
    let s = usize::try_from(start).ok()?;
    let rel = buf.get(s..)?.iter().position(|b| *b == 0)?;
    let end = (s as u64).checked_add(rel as u64)?;
    if end > limit {
        return None;
    }
    Some(String::from_utf8_lossy(&buf[s..s + rel]).into_owned())
}

fn parse_thin(buf: &[u8]) -> Option<Vec<String>> {
    if buf.len() < 32 || u32_at(buf, 0, false)? != MH_MAGIC_64 {
        return None;
    }
    let ncmds = u32_at(buf, 16, false)?;
    let len = buf.len() as u64;
    let mut off: u64 = 32;
    // (symoff, nsyms, stroff, strsize)
    let mut sym: Option<(u64, u64, u64, u64)> = None;
    let mut dysym: Option<(u64, u64)> = None;
    for _ in 0..ncmds {
        if off + 8 > len {
            return None;
        }
        let cmd = u32_at(buf, off, false)?;
        let cmdsize = u64::from(u32_at(buf, off + 4, false)?);
        if cmdsize < 8 || off + cmdsize > len {
            return None;
        }
        if cmd == LC_SYMTAB {
            if cmdsize < 24 {
                return None;
            }
            sym = Some((
                u64::from(u32_at(buf, off + 8, false)?),
                u64::from(u32_at(buf, off + 12, false)?),
                u64::from(u32_at(buf, off + 16, false)?),
                u64::from(u32_at(buf, off + 20, false)?),
            ));
        } else if cmd == LC_DYSYMTAB {
            if cmdsize < 24 {
                return None;
            }
            dysym = Some((
                u64::from(u32_at(buf, off + 16, false)?),
                u64::from(u32_at(buf, off + 20, false)?),
            ));
        }
        off += cmdsize;
    }
    let (symoff, nsyms, stroff, strsize) = sym?;
    let (first, count) = dysym.unwrap_or((0, nsyms));
    if first + count > nsyms {
        return None;
    }
    let str_end = stroff + strsize;
    if str_end > len {
        return None;
    }
    if symoff + nsyms * NLIST_64_SIZE > len {
        return None;
    }
    let mut out = Vec::new();
    for i in first..first + count {
        let p = symoff + i * NLIST_64_SIZE;
        let n_strx = u64::from(u32_at(buf, p, false)?);
        let n_type = *buf.get(usize::try_from(p + 4).ok()?)?;
        if n_type & N_EXT == 0 || n_type & N_TYPE_MASK == 0 || n_type & N_STAB_MASK != 0 {
            continue;
        }
        out.push(read_c_string(buf, stroff + n_strx, str_end)?);
    }
    Some(out)
}

/// Names of defined external symbols, or `None` when not a supported Mach-O. Never panics.
pub fn parse_defined_externals(buf: &[u8]) -> Option<Vec<String>> {
    if buf.len() >= 8 && u32_at(buf, 0, true) == Some(FAT_MAGIC) {
        let n = u32_at(buf, 4, true)?;
        for i in 0..u64::from(n) {
            let p = 8 + i * 20;
            if p + 20 > buf.len() as u64 {
                return None;
            }
            if u32_at(buf, p, true)? != CPU_TYPE_X86_64 {
                continue;
            }
            let offset = u64::from(u32_at(buf, p + 8, true)?);
            let size = u64::from(u32_at(buf, p + 12, true)?);
            if offset + size > buf.len() as u64 {
                return None;
            }
            return parse_thin(&buf[offset as usize..(offset + size) as usize]);
        }
        return None;
    }
    parse_thin(buf)
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(untagged)]
pub enum WinemacMetalCheck {
    Pass {
        ok: bool,
    },
    Fail {
        ok: bool,
        #[serde(rename = "winemacPath")]
        winemac_path: String,
        reason: String,
        missing: Vec<String>,
    },
}

fn all_symbols() -> Vec<String> {
    DXMT_REQUIRED_MACDRV_SYMBOLS
        .iter()
        .map(|s| (*s).to_string())
        .collect()
}

pub fn check_winemac_metal_view_exports(wine_bundle_path: &Path) -> WinemacMetalCheck {
    let winemac = wine_bundle_path
        .join("Contents")
        .join("Resources")
        .join("wine")
        .join("lib")
        .join("wine")
        .join("x86_64-unix")
        .join("winemac.so");
    let fail = |reason: String, missing: Vec<String>| WinemacMetalCheck::Fail {
        ok: false,
        winemac_path: winemac.to_string_lossy().into_owned(),
        reason,
        missing,
    };
    if winemac.to_str().is_none() {
        return fail(
            "could not read winemac.so: non-UTF-8 path".into(),
            all_symbols(),
        );
    }
    if !winemac.exists() {
        return fail("winemac.so not found".into(), all_symbols());
    }
    // Whole-file read on purpose: the TS reads it whole too, and winemac.so is a few MB, a
    // GameLib-installed Wine file rather than game input.
    let buf = match std::fs::read(&winemac) {
        Ok(b) => b,
        Err(e) => return fail(format!("could not read winemac.so: {e}"), all_symbols()),
    };
    let Some(defined) = parse_defined_externals(&buf) else {
        return fail(
            "winemac.so is not a parseable x86_64 Mach-O".into(),
            all_symbols(),
        );
    };
    let has = |n: &str| defined.iter().any(|d| d == n);
    if has(DXMT_REQUIRED_MACDRV_SYMBOLS[0])
        || DXMT_REQUIRED_MACDRV_SYMBOLS[1..].iter().all(|n| has(n))
    {
        return WinemacMetalCheck::Pass { ok: true };
    }
    fail(
        "winemac.so lacks the macdrv metal-view exports".into(),
        all_symbols().into_iter().filter(|n| !has(n)).collect(),
    )
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use serde_json::json;

    fn p32(b: &mut Vec<u8>, v: u32) {
        b.extend_from_slice(&v.to_le_bytes());
    }

    /// Thin x86_64 Mach-O: (name, n_type) symbols; optional LC_DYSYMTAB extdef range.
    pub(crate) fn thin(syms: &[(&str, u8)], dysym: Option<(u32, u32)>) -> Vec<u8> {
        let mut strtab = vec![0u8];
        let mut nlist = Vec::new();
        for (name, t) in syms {
            p32(&mut nlist, strtab.len() as u32);
            nlist.push(*t);
            nlist.extend_from_slice(&[0u8; 11]);
            strtab.extend_from_slice(name.as_bytes());
            strtab.push(0);
        }
        let ncmds = if dysym.is_some() { 2 } else { 1 };
        let cmds_size = 24 + if dysym.is_some() { 80 } else { 0 };
        let symoff = 32 + cmds_size;
        let stroff = symoff + nlist.len();
        let mut b = Vec::new();
        p32(&mut b, MH_MAGIC_64);
        p32(&mut b, CPU_TYPE_X86_64);
        p32(&mut b, 3);
        p32(&mut b, 6);
        p32(&mut b, ncmds);
        p32(&mut b, cmds_size as u32);
        p32(&mut b, 0);
        p32(&mut b, 0);
        p32(&mut b, LC_SYMTAB);
        p32(&mut b, 24);
        p32(&mut b, symoff as u32);
        p32(&mut b, syms.len() as u32);
        p32(&mut b, stroff as u32);
        p32(&mut b, strtab.len() as u32);
        if let Some((first, count)) = dysym {
            p32(&mut b, LC_DYSYMTAB);
            p32(&mut b, 80);
            p32(&mut b, 0);
            p32(&mut b, 0);
            p32(&mut b, first);
            p32(&mut b, count);
            b.extend_from_slice(&[0u8; 80 - 24]);
        }
        b.extend_from_slice(&nlist);
        b.extend_from_slice(&strtab);
        b
    }

    const EXT_DEF: u8 = 0x0f;

    fn fat(slices: &[(u32, &[u8])]) -> Vec<u8> {
        let mut b = Vec::new();
        b.extend_from_slice(&FAT_MAGIC.to_be_bytes());
        b.extend_from_slice(&(slices.len() as u32).to_be_bytes());
        let mut off = 8 + slices.len() * 20;
        for (cpu, s) in slices {
            for v in [*cpu, 3, off as u32, s.len() as u32, 0] {
                b.extend_from_slice(&v.to_be_bytes());
            }
            off += s.len();
        }
        for (_, s) in slices {
            b.extend_from_slice(s);
        }
        b
    }

    fn all_four() -> Vec<u8> {
        let v: Vec<(&str, u8)> = DXMT_REQUIRED_MACDRV_SYMBOLS
            .iter()
            .map(|s| (*s, EXT_DEF))
            .collect();
        thin(&v, None)
    }

    #[test]
    fn macho_thin_defined_externals_only() {
        let b = thin(
            &[
                ("_a", EXT_DEF),
                ("_local", 0x0e),
                ("_undef", 0x01),
                ("_stab", 0x2f),
            ],
            None,
        );
        assert_eq!(parse_defined_externals(&b), Some(vec!["_a".to_string()]));
    }

    #[test]
    fn macho_dysymtab_extdef_range_is_used() {
        let b = thin(
            &[("_a", EXT_DEF), ("_b", EXT_DEF), ("_c", EXT_DEF)],
            Some((1, 1)),
        );
        assert_eq!(parse_defined_externals(&b), Some(vec!["_b".to_string()]));
    }

    #[test]
    fn macho_fat_selects_x86_64_slice() {
        let x = thin(&[("_x", EXT_DEF)], None);
        let other = thin(&[("_arm", EXT_DEF)], None);
        let b = fat(&[(0x0100_000c, &other), (CPU_TYPE_X86_64, &x)]);
        assert_eq!(parse_defined_externals(&b), Some(vec!["_x".to_string()]));
    }

    #[test]
    fn macho_fat_without_x86_64_is_none() {
        let other = thin(&[("_arm", EXT_DEF)], None);
        assert_eq!(
            parse_defined_externals(&fat(&[(0x0100_000c, &other)])),
            None
        );
    }

    #[test]
    fn macho_rejects_short_garbage_and_missing_symtab() {
        assert_eq!(parse_defined_externals(&[]), None);
        assert_eq!(parse_defined_externals(&[0u8; 31]), None);
        assert_eq!(parse_defined_externals(&[7u8; 64]), None);
        let mut b = thin(&[("_a", EXT_DEF)], None);
        b[32] = 0x99; // no LC_SYMTAB any more
        assert_eq!(parse_defined_externals(&b), None);
    }

    #[test]
    fn macho_out_of_range_tables_are_none() {
        let mut b = thin(&[("_a", EXT_DEF)], None);
        let n = b.len();
        b.truncate(n - 3); // strtab runs past EOF
        assert_eq!(parse_defined_externals(&b), None);
        let mut b = thin(&[("_a", EXT_DEF)], None);
        b[32 + 8..32 + 12].copy_from_slice(&0xffff_fff0u32.to_le_bytes()); // symoff far away
        assert_eq!(parse_defined_externals(&b), None);
        let b = thin(&[("_a", EXT_DEF)], Some((5, 5)));
        assert_eq!(parse_defined_externals(&b), None);
    }

    fn bundle(bytes: Option<&[u8]>) -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        if let Some(b) = bytes {
            let dir = d
                .path()
                .join("Contents/Resources/wine/lib/wine/x86_64-unix");
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::write(dir.join("winemac.so"), b).unwrap();
        }
        d
    }

    fn check(d: &tempfile::TempDir) -> serde_json::Value {
        serde_json::to_value(check_winemac_metal_view_exports(d.path())).unwrap()
    }

    #[test]
    fn macho_check_ok_with_functions_or_three_view_symbols() {
        let f = thin(&[("_macdrv_functions", EXT_DEF)], None);
        assert_eq!(check(&bundle(Some(&f))), json!({"ok": true}));
        assert_eq!(check(&bundle(Some(&all_four()))), json!({"ok": true}));
        let three = thin(
            &DXMT_REQUIRED_MACDRV_SYMBOLS[1..]
                .iter()
                .map(|s| (*s, EXT_DEF))
                .collect::<Vec<_>>(),
            None,
        );
        assert_eq!(check(&bundle(Some(&three))), json!({"ok": true}));
    }

    #[test]
    fn macho_check_not_found_unreadable_unparseable_lacking() {
        let d = bundle(None);
        let v = check(&d);
        assert_eq!(v["reason"], "winemac.so not found");
        assert_eq!(v["missing"].as_array().unwrap().len(), 4);
        assert!(v["winemacPath"].as_str().unwrap().ends_with("winemac.so"));

        let d = bundle(None);
        let dir = d
            .path()
            .join("Contents/Resources/wine/lib/wine/x86_64-unix/winemac.so");
        std::fs::create_dir_all(dir).unwrap(); // exists but is a directory: unreadable
        assert!(check(&d)["reason"]
            .as_str()
            .unwrap()
            .starts_with("could not read winemac.so: "));

        let v = check(&bundle(Some(
            b"not a mach-o, but long enough to pass 32 bytes....",
        )));
        assert_eq!(v["reason"], "winemac.so is not a parseable x86_64 Mach-O");
        assert_eq!(v["missing"].as_array().unwrap().len(), 4);

        let two = thin(
            &[
                ("_macdrv_view_create_metal_view", EXT_DEF),
                ("_macdrv_view_get_metal_layer", EXT_DEF),
            ],
            None,
        );
        let v = check(&bundle(Some(&two)));
        assert_eq!(
            v["reason"],
            "winemac.so lacks the macdrv metal-view exports"
        );
        assert_eq!(
            v["missing"],
            json!(["_macdrv_functions", "_macdrv_view_release_metal_view"])
        );
    }

    #[test]
    fn macho_ok_serialises_exactly() {
        assert_eq!(
            serde_json::to_string(&WinemacMetalCheck::Pass { ok: true }).unwrap(),
            r#"{"ok":true}"#
        );
    }
}
