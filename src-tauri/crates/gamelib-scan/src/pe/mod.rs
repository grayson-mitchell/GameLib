//! Native PE parsing over `RangeRead`, ported from peSteamDrm.ts / peSections.ts.
//! Every read is bounds-checked; a short read is `None`, which the callers map to the
//! TS "unparsed" result. All offset arithmetic saturates, so overflow becomes a failed read.

pub mod delay;
pub mod drm;
pub mod imports;
pub mod sections;

use crate::reader::RangeRead;

/// Hard cap on sections parsed, whatever the header claims (TS MAX_SECTIONS).
pub(crate) const MAX_SECTIONS: usize = 96;
/// Cap on ASCIIZ names read from import tables (TS MAX_NAME_BYTES).
pub(crate) const MAX_NAME_BYTES: usize = 256;

pub(crate) fn le_u16(b: &[u8]) -> Option<u16> {
    Some(u16::from_le_bytes([*b.first()?, *b.get(1)?]))
}

pub(crate) fn le_u32(b: &[u8]) -> Option<u32> {
    Some(u32::from_le_bytes([
        *b.first()?,
        *b.get(1)?,
        *b.get(2)?,
        *b.get(3)?,
    ]))
}

pub(crate) fn rd_u16(r: &mut impl RangeRead, off: u64) -> Option<u16> {
    le_u16(&r.read_at(off, 2)?)
}

pub(crate) fn rd_u32(r: &mut impl RangeRead, off: u64) -> Option<u32> {
    le_u32(&r.read_at(off, 4)?)
}

/// ASCIIZ at `offset`, one byte per char, at most `MAX_NAME_BYTES`; longer or unterminated is `None`.
pub(crate) fn read_asciiz(r: &mut impl RangeRead, offset: u64) -> Option<String> {
    let mut out = String::new();
    for i in 0..MAX_NAME_BYTES as u64 {
        let c = *r.read_at(offset.saturating_add(i), 1)?.first()?;
        if c == 0 {
            return Some(out);
        }
        out.push(char::from(c));
    }
    None
}

#[derive(Clone, Debug)]
pub(crate) struct Section {
    pub name: String,
    pub va: u32,
    /// VirtualSize, or SizeOfRawData only when VirtualSize == 0 (53-15).
    pub span: u64,
    pub raw_ptr: u32,
}

/// The fixed prologue shared by every PE reader: MZ, PE signature, COFF counts,
/// optional-header magic and NumberOfRvaAndSizes.
#[derive(Clone, Debug)]
pub(crate) struct PeInfo {
    pub number_of_sections: u16,
    pub size_of_optional_header: u16,
    /// File offset of the optional header.
    pub opt: u64,
    pub is_plus: bool,
    pub num_rva_and_sizes: u32,
    /// SizeOfHeaders (optional header +60 in both PE32 and PE32+): RVAs below it map to the
    /// same file offset, which the Windows loader and objdump both accept.
    pub size_of_headers: u32,
}

impl PeInfo {
    pub(crate) fn parse(r: &mut impl RangeRead) -> Option<PeInfo> {
        let mz = r.read_at(0, 2)?;
        if mz.first() != Some(&0x4d) || mz.get(1) != Some(&0x5a) {
            return None;
        }
        let pe = u64::from(rd_u32(r, 0x3c)?);
        if rd_u32(r, pe)? != 0x0000_4550 {
            return None;
        }
        let number_of_sections = rd_u16(r, pe.saturating_add(6))?;
        let size_of_optional_header = rd_u16(r, pe.saturating_add(20))?;
        let opt = pe.saturating_add(24);
        let is_plus = match rd_u16(r, opt)? {
            0x10b => false,
            0x20b => true,
            _ => return None,
        };
        let num_rva_and_sizes = rd_u32(r, opt.saturating_add(if is_plus { 108 } else { 92 }))?;
        let size_of_headers = rd_u32(r, opt.saturating_add(60))?;
        Some(PeInfo {
            number_of_sections,
            size_of_optional_header,
            opt,
            is_plus,
            num_rva_and_sizes,
            size_of_headers,
        })
    }

    pub(crate) fn dirs_offset(&self) -> u64 {
        self.opt.saturating_add(if self.is_plus { 112 } else { 96 })
    }

    /// (rva, size) of data directory `idx`; the caller checks `num_rva_and_sizes` first.
    pub(crate) fn data_dir(&self, r: &mut impl RangeRead, idx: u64) -> Option<(u32, u32)> {
        let at = self.dirs_offset().saturating_add(idx.saturating_mul(8));
        Some((rd_u32(r, at)?, rd_u32(r, at.saturating_add(4))?))
    }

    /// The section table, capped at 96. Any short read fails the whole table.
    pub(crate) fn read_sections(&self, r: &mut impl RangeRead) -> Option<Vec<Section>> {
        let table = self
            .opt
            .saturating_add(u64::from(self.size_of_optional_header));
        let count = usize::from(self.number_of_sections).min(MAX_SECTIONS);
        let mut out = Vec::with_capacity(count);
        for i in 0..count as u64 {
            let base = table.saturating_add(i.saturating_mul(40));
            let raw_name = r.read_at(base, 8)?;
            let mut name = String::new();
            for &c in &raw_name {
                if c == 0 {
                    break;
                }
                name.push(char::from(c));
            }
            let virtual_size = rd_u32(r, base.saturating_add(8))?;
            let va = rd_u32(r, base.saturating_add(12))?;
            let size_of_raw = rd_u32(r, base.saturating_add(16))?;
            let raw_ptr = rd_u32(r, base.saturating_add(20))?;
            out.push(Section {
                name,
                va,
                span: u64::from(if virtual_size > 0 {
                    virtual_size
                } else {
                    size_of_raw
                }),
                raw_ptr,
            });
        }
        Some(out)
    }
}

/// RVA -> file offset through the first containing section; `None` outside every section.
pub(crate) fn rva_to_offset(sections: &[Section], rva: i128) -> Option<u64> {
    let s = sections.iter().find(|s| {
        let va = i128::from(s.va);
        va <= rva && rva < va + i128::from(s.span)
    })?;
    let off = i128::from(s.raw_ptr) + (rva - i128::from(s.va));
    u64::try_from(off).ok()
}

/// `rva_to_offset`, falling back to the header region (RVA < SizeOfHeaders maps to file
/// offset == RVA) when no section contains the RVA. The Windows loader and objdump both
/// accept import tables and names placed there; used by the import-table readers (63 WR-01).
pub(crate) fn rva_to_offset_or_header(
    sections: &[Section],
    size_of_headers: u32,
    rva: i128,
) -> Option<u64> {
    rva_to_offset(sections, rva).or_else(|| {
        if rva >= 0 && rva < i128::from(size_of_headers) {
            u64::try_from(rva).ok()
        } else {
            None
        }
    })
}

#[cfg(test)]
pub(crate) mod pe_builder {
    //! Minimal PE builder for tests. Sections map RVA == file offset unless stated.

    pub struct Sec {
        pub name: &'static str,
        pub va: u32,
        pub vsize: u32,
        pub rawsize: u32,
        pub rawptr: u32,
    }

    pub struct Spec {
        pub plus: bool,
        pub image_base: u64,
        pub num_rva: u32,
        pub dirs: Vec<(u32, u32)>,
        pub sections: Vec<Sec>,
        pub total: usize,
    }

    impl Spec {
        pub fn new(plus: bool) -> Spec {
            Spec {
                plus,
                image_base: 0x40_0000,
                num_rva: 16,
                dirs: vec![(0, 0); 16],
                sections: vec![Sec {
                    name: ".rdata",
                    va: 0x1000,
                    vsize: 0x4000,
                    rawsize: 0x4000,
                    rawptr: 0x1000,
                }],
                total: 0x5000,
            }
        }

        pub fn build(&self) -> Vec<u8> {
            let mut b = vec![0u8; self.total.max(0x400)];
            b[0] = 0x4d;
            b[1] = 0x5a;
            put32(&mut b, 0x3c, 0x80);
            put32(&mut b, 0x80, 0x4550);
            put16(&mut b, 0x84, if self.plus { 0x8664 } else { 0x14c });
            put16(&mut b, 0x86, self.sections.len() as u16);
            let opt_size: u16 = if self.plus { 240 } else { 224 };
            put16(&mut b, 0x80 + 20, opt_size);
            let opt = 0x80 + 24;
            put16(&mut b, opt, if self.plus { 0x20b } else { 0x10b });
            if self.plus {
                put32(&mut b, opt + 24, self.image_base as u32);
                put32(&mut b, opt + 28, (self.image_base >> 32) as u32);
                put32(&mut b, opt + 108, self.num_rva);
            } else {
                put32(&mut b, opt + 28, self.image_base as u32);
                put32(&mut b, opt + 92, self.num_rva);
            }
            let dirs = opt + if self.plus { 112 } else { 96 };
            for (i, (rva, size)) in self.dirs.iter().enumerate() {
                put32(&mut b, dirs + i * 8, *rva);
                put32(&mut b, dirs + i * 8 + 4, *size);
            }
            let table = opt + opt_size as usize;
            for (i, s) in self.sections.iter().enumerate() {
                let base = table + i * 40;
                if base + 40 > b.len() {
                    break;
                }
                b[base..base + s.name.len()].copy_from_slice(s.name.as_bytes());
                put32(&mut b, base + 8, s.vsize);
                put32(&mut b, base + 12, s.va);
                put32(&mut b, base + 16, s.rawsize);
                put32(&mut b, base + 20, s.rawptr);
            }
            b
        }
    }

    pub fn put16(b: &mut [u8], off: usize, v: u16) {
        b[off..off + 2].copy_from_slice(&v.to_le_bytes());
    }

    pub fn put32(b: &mut [u8], off: usize, v: u32) {
        b[off..off + 4].copy_from_slice(&v.to_le_bytes());
    }

    pub fn put_str(b: &mut [u8], off: usize, s: &str) {
        b[off..off + s.len()].copy_from_slice(s.as_bytes());
        b[off + s.len()] = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::pe_builder::*;
    use super::*;
    use crate::reader::SliceReader;

    #[test]
    fn rva_uses_virtual_size_then_raw_fallback() {
        let s = |va, span, raw| Section {
            name: String::new(),
            va,
            span,
            raw_ptr: raw,
        };
        let secs = vec![s(0x1000, 0x100, 0x400), s(0x2000, 0x100, 0x800)];
        assert_eq!(rva_to_offset(&secs, 0x1010), Some(0x410));
        assert_eq!(rva_to_offset(&secs, 0x1100), None);
        assert_eq!(rva_to_offset(&secs, -5), None);
        // Header region: only the `_or_header` variant maps it, and only below SizeOfHeaders.
        assert_eq!(rva_to_offset(&secs, 0x200), None);
        assert_eq!(rva_to_offset_or_header(&secs, 0x400, 0x200), Some(0x200));
        assert_eq!(rva_to_offset_or_header(&secs, 0x400, 0x400), None);
        assert_eq!(rva_to_offset_or_header(&secs, 0x400, -1), None);
        assert_eq!(rva_to_offset_or_header(&secs, 0x400, 0x1010), Some(0x410));
        // VirtualSize == 0 falls back to SizeOfRawData
        let mut spec = Spec::new(false);
        spec.sections[0].vsize = 0;
        spec.sections[0].rawsize = 0x200;
        let bytes = spec.build();
        let mut r = SliceReader::new(&bytes);
        let info = PeInfo::parse(&mut r).unwrap();
        let secs = info.read_sections(&mut r).unwrap();
        assert_eq!(secs[0].span, 0x200);
    }

    #[test]
    fn parse_rejects_bad_magic_and_short() {
        let mut bytes = Spec::new(false).build();
        put16(&mut bytes, 0x80 + 24, 0x999);
        assert!(PeInfo::parse(&mut SliceReader::new(&bytes)).is_none());
        assert!(PeInfo::parse(&mut SliceReader::new(&[])).is_none());
        assert!(PeInfo::parse(&mut SliceReader::new(&[0x4d, 0x5a])).is_none());
    }
}
