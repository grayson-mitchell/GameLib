//! Binary VDF (`shortcuts.vdf`) lossless tree and byte-identical round trip.
//!
//! Nothing is normalised: key order, duplicate keys, raw key/string bytes (no UTF-8 check),
//! fixed-size payloads as raw little-endian bytes and any bytes after the root end are kept, so
//! `serialize_bin(parse_bin(b)) == b`. Anything we cannot size or round-trip is a typed error,
//! never a partial tree, so callers never rewrite a file they only partly understood.

const T_MAP: u8 = 0x00;
const T_STR: u8 = 0x01;
const T_INT32: u8 = 0x02;
const T_FLOAT32: u8 = 0x03;
const T_PTR: u8 = 0x04;
const T_WSTR: u8 = 0x05;
const T_COLOR: u8 = 0x06;
const T_UINT64: u8 = 0x07;
const T_END: u8 = 0x08;
const T_INT64: u8 = 0x0A;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BinNode {
    Map(Vec<(Vec<u8>, BinNode)>),
    Str(Vec<u8>),
    Int32(i32),
    Float32([u8; 4]),
    Ptr([u8; 4]),
    /// UTF-16LE bytes before the 2-byte terminator.
    WStr(Vec<u8>),
    Color([u8; 4]),
    Uint64([u8; 8]),
    Int64([u8; 8]),
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct BinDoc {
    pub root: Vec<(Vec<u8>, BinNode)>,
    pub trailing: Vec<u8>,
}

#[derive(Debug, Clone, Copy)]
pub struct BinLimits {
    pub max_bytes: usize,
    pub max_depth: usize,
}

impl BinLimits {
    pub fn shortcuts() -> Self {
        Self {
            max_bytes: 16 * 1024 * 1024,
            max_depth: 64,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BinErrorKind {
    TooLarge,
    TooDeep,
    Truncated,
    UnknownType(u8),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BinError {
    pub kind: BinErrorKind,
    pub offset: usize,
}

struct Reader<'a> {
    b: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn err(&self, kind: BinErrorKind) -> BinError {
        BinError {
            kind,
            offset: self.pos,
        }
    }

    fn byte(&mut self) -> Result<u8, BinError> {
        let v = *self
            .b
            .get(self.pos)
            .ok_or_else(|| self.err(BinErrorKind::Truncated))?;
        self.pos += 1;
        Ok(v)
    }

    fn take<const N: usize>(&mut self) -> Result<[u8; N], BinError> {
        let end = self.pos + N;
        let s = self
            .b
            .get(self.pos..end)
            .ok_or_else(|| self.err(BinErrorKind::Truncated))?;
        let mut out = [0u8; N];
        out.copy_from_slice(s);
        self.pos = end;
        Ok(out)
    }

    fn cstr(&mut self) -> Result<Vec<u8>, BinError> {
        let rest = &self.b[self.pos..];
        let n = rest
            .iter()
            .position(|&c| c == 0)
            .ok_or_else(|| self.err(BinErrorKind::Truncated))?;
        let v = rest[..n].to_vec();
        self.pos += n + 1;
        Ok(v)
    }

    fn wstr(&mut self) -> Result<Vec<u8>, BinError> {
        let mut i = self.pos;
        loop {
            match self.b.get(i..i + 2) {
                None => return Err(self.err(BinErrorKind::Truncated)),
                Some([0, 0]) => break,
                Some(_) => i += 2,
            }
        }
        let v = self.b[self.pos..i].to_vec();
        self.pos = i + 2;
        Ok(v)
    }

    /// Reads `(type, key, payload)` pairs until an end marker.
    fn pairs(
        &mut self,
        depth: usize,
        max_depth: usize,
    ) -> Result<Vec<(Vec<u8>, BinNode)>, BinError> {
        let mut out = Vec::new();
        loop {
            let tag = self.byte()?;
            if tag == T_END {
                return Ok(out);
            }
            let tag_pos = self.pos - 1;
            if !matches!(
                tag,
                T_MAP | T_STR | T_INT32 | T_FLOAT32 | T_PTR | T_WSTR | T_COLOR | T_UINT64 | T_INT64
            ) {
                return Err(BinError {
                    kind: BinErrorKind::UnknownType(tag),
                    offset: tag_pos,
                });
            }
            let key = self.cstr()?;
            let node = match tag {
                T_MAP => {
                    if depth + 1 > max_depth {
                        return Err(self.err(BinErrorKind::TooDeep));
                    }
                    BinNode::Map(self.pairs(depth + 1, max_depth)?)
                }
                T_STR => BinNode::Str(self.cstr()?),
                T_INT32 => BinNode::Int32(i32::from_le_bytes(self.take::<4>()?)),
                T_FLOAT32 => BinNode::Float32(self.take()?),
                T_PTR => BinNode::Ptr(self.take()?),
                T_WSTR => BinNode::WStr(self.wstr()?),
                T_COLOR => BinNode::Color(self.take()?),
                T_UINT64 => BinNode::Uint64(self.take()?),
                _ => BinNode::Int64(self.take()?),
            };
            out.push((key, node));
        }
    }
}

pub fn parse_bin(bytes: &[u8], limits: &BinLimits) -> Result<BinDoc, BinError> {
    if bytes.len() > limits.max_bytes {
        return Err(BinError {
            kind: BinErrorKind::TooLarge,
            offset: 0,
        });
    }
    let mut r = Reader { b: bytes, pos: 0 };
    let root = r.pairs(0, limits.max_depth)?;
    Ok(BinDoc {
        root,
        trailing: bytes[r.pos..].to_vec(),
    })
}

fn write_pairs(out: &mut Vec<u8>, pairs: &[(Vec<u8>, BinNode)]) {
    for (key, node) in pairs {
        let tag = match node {
            BinNode::Map(_) => T_MAP,
            BinNode::Str(_) => T_STR,
            BinNode::Int32(_) => T_INT32,
            BinNode::Float32(_) => T_FLOAT32,
            BinNode::Ptr(_) => T_PTR,
            BinNode::WStr(_) => T_WSTR,
            BinNode::Color(_) => T_COLOR,
            BinNode::Uint64(_) => T_UINT64,
            BinNode::Int64(_) => T_INT64,
        };
        out.push(tag);
        out.extend_from_slice(key);
        out.push(0);
        match node {
            BinNode::Map(m) => {
                write_pairs(out, m);
                out.push(T_END);
            }
            BinNode::Str(s) => {
                out.extend_from_slice(s);
                out.push(0);
            }
            BinNode::Int32(v) => out.extend_from_slice(&v.to_le_bytes()),
            BinNode::Float32(v) | BinNode::Ptr(v) | BinNode::Color(v) => out.extend_from_slice(v),
            BinNode::WStr(s) => {
                out.extend_from_slice(s);
                out.extend_from_slice(&[0, 0]);
            }
            BinNode::Uint64(v) | BinNode::Int64(v) => out.extend_from_slice(v),
        }
    }
}

pub fn serialize_bin(doc: &BinDoc) -> Vec<u8> {
    let mut out = Vec::new();
    write_pairs(&mut out, &doc.root);
    out.push(T_END);
    out.extend_from_slice(&doc.trailing);
    out
}
