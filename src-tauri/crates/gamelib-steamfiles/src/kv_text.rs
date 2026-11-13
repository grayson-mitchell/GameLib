//! Text VDF/KV1 parser: a lossless ordered tree plus merged and ordered views (P75-A, D-06).
//!
//! The core tree ([`parse`]) keeps source order and duplicate sibling keys and never merges.
//! [`merged`] gives `@node-steam/vdf`-style semantics (a repeated map key re-opens the earlier
//! map, a repeated scalar is last-wins). [`find`] is the ordered view: first match in file order.
//!
//! Differences from the TS oracles being replaced (to be recorded in 75-PARITY.md):
//! - no number/bool coercion: every value stays a string;
//! - quoted strings keep raw bytes; escapes are decoded only by [`RawStr::decoded`];
//! - key matching and merging are ASCII-case-insensitive (Steam-correct, D-07);
//! - strict on unbalanced/truncated input (typed [`KvError`]), where `parseAcfTree` was tolerant
//!   and `@node-steam/vdf` hung on truncated input;
//! - UTF-8 BOM skipped, CRLF handled, `//` comments skipped, `[$COND]` kept in [`Pair::cond`];
//! - input above `max_bytes` or nesting above `max_depth` is an error, never a stack overflow.

/// Resource limits applied before and during parsing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Limits {
    pub max_bytes: usize,
    pub max_depth: usize,
}

impl Limits {
    /// 64 MiB, depth 64.
    pub fn local_file() -> Self {
        Limits {
            max_bytes: 64 * 1024 * 1024,
            max_depth: 64,
        }
    }
}

/// Raw bytes of a key or value, exactly as in the file (escapes not applied).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawStr(pub Vec<u8>);

impl RawStr {
    /// Apply Steam escapes (`\\` `\"` `\n` `\t`); any other backslash is kept literally.
    /// Invalid UTF-8 is replaced lossily.
    pub fn decoded(&self) -> String {
        let b = &self.0;
        let mut out = Vec::with_capacity(b.len());
        let mut i = 0;
        while i < b.len() {
            if b[i] == b'\\' && i + 1 < b.len() {
                let rep = match b[i + 1] {
                    b'\\' => Some(b'\\'),
                    b'"' => Some(b'"'),
                    b'n' => Some(b'\n'),
                    b't' => Some(b'\t'),
                    _ => None,
                };
                if let Some(c) = rep {
                    out.push(c);
                    i += 2;
                    continue;
                }
            }
            out.push(b[i]);
            i += 1;
        }
        String::from_utf8_lossy(&out).into_owned()
    }

    pub fn eq_ignore_ascii_case(&self, other: &str) -> bool {
        self.0.eq_ignore_ascii_case(other.as_bytes())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pair {
    pub key: RawStr,
    /// Conditional such as `$WIN32` (brackets stripped), if one followed the key or value.
    pub cond: Option<String>,
    pub value: Value,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Value {
    Str(RawStr),
    Map(Vec<Pair>),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KvErrorKind {
    TooLarge,
    TooDeep,
    Unbalanced,
    UnterminatedString,
    MissingValue,
    UnexpectedOpen,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KvError {
    pub kind: KvErrorKind,
    pub offset: usize,
}

fn err<T>(kind: KvErrorKind, offset: usize) -> Result<T, KvError> {
    Err(KvError { kind, offset })
}

fn is_ws(c: u8) -> bool {
    matches!(c, b' ' | b'\t' | b'\r' | b'\n' | 0x0b | 0x0c)
}

enum Tok {
    Str(RawStr),
    Open,
    Close,
    Eof,
}

struct Lexer<'a> {
    b: &'a [u8],
    i: usize,
}

impl Lexer<'_> {
    fn skip_ws_and_comments(&mut self) {
        loop {
            while self.i < self.b.len() && is_ws(self.b[self.i]) {
                self.i += 1;
            }
            if self.b[self.i.min(self.b.len())..].starts_with(b"//") {
                while self.i < self.b.len() && self.b[self.i] != b'\n' {
                    self.i += 1;
                }
            } else {
                return;
            }
        }
    }

    fn next(&mut self) -> Result<Tok, KvError> {
        self.skip_ws_and_comments();
        let Some(&c) = self.b.get(self.i) else {
            return Ok(Tok::Eof);
        };
        match c {
            b'{' => {
                self.i += 1;
                Ok(Tok::Open)
            }
            b'}' => {
                self.i += 1;
                Ok(Tok::Close)
            }
            b'"' => {
                let start = self.i;
                self.i += 1;
                let from = self.i;
                while self.i < self.b.len() {
                    match self.b[self.i] {
                        b'\\' => self.i += 2,
                        b'"' => {
                            let s = RawStr(self.b[from..self.i].to_vec());
                            self.i += 1;
                            return Ok(Tok::Str(s));
                        }
                        _ => self.i += 1,
                    }
                }
                self.i = self.b.len();
                err(KvErrorKind::UnterminatedString, start)
            }
            _ => {
                let from = self.i;
                while self.i < self.b.len()
                    && !is_ws(self.b[self.i])
                    && !matches!(self.b[self.i], b'{' | b'}' | b'"')
                {
                    self.i += 1;
                }
                Ok(Tok::Str(RawStr(self.b[from..self.i].to_vec())))
            }
        }
    }

    /// A `[...]` on the same line, brackets stripped.
    fn cond(&mut self) -> Option<String> {
        let mut j = self.i;
        while j < self.b.len() && matches!(self.b[j], b' ' | b'\t') {
            j += 1;
        }
        if self.b.get(j) != Some(&b'[') {
            return None;
        }
        let mut k = j + 1;
        while k < self.b.len() && self.b[k] != b']' && self.b[k] != b'\n' {
            k += 1;
        }
        if self.b.get(k) != Some(&b']') {
            return None;
        }
        let s = String::from_utf8_lossy(&self.b[j + 1..k]).into_owned();
        self.i = k + 1;
        Some(s)
    }
}

/// Parse text KV1 into the lossless ordered tree (the root is the list of top-level pairs).
pub fn parse(bytes: &[u8], limits: &Limits) -> Result<Vec<Pair>, KvError> {
    if bytes.len() > limits.max_bytes {
        return err(KvErrorKind::TooLarge, 0);
    }
    let start = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        3
    } else {
        0
    };
    let mut lx = Lexer { b: bytes, i: start };
    // Each open block: (key, cond, siblings so far). Index 0 is the root (empty key).
    let mut stack: Vec<(RawStr, Option<String>, Vec<Pair>)> =
        vec![(RawStr(Vec::new()), None, Vec::new())];
    loop {
        match lx.next()? {
            Tok::Eof => {
                if stack.len() > 1 {
                    return err(KvErrorKind::Unbalanced, lx.i);
                }
                break;
            }
            Tok::Open => return err(KvErrorKind::UnexpectedOpen, lx.i - 1),
            Tok::Close => {
                if stack.len() == 1 {
                    return err(KvErrorKind::Unbalanced, lx.i - 1);
                }
                let (key, cond, children) =
                    stack
                        .pop()
                        .unwrap_or((RawStr(Vec::new()), None, Vec::new()));
                if let Some(top) = stack.last_mut() {
                    top.2.push(Pair {
                        key,
                        cond,
                        value: Value::Map(children),
                    });
                }
            }
            Tok::Str(key) => {
                let kcond = lx.cond();
                match lx.next()? {
                    Tok::Eof => return err(KvErrorKind::MissingValue, lx.i),
                    Tok::Close => {
                        return if stack.len() == 1 {
                            err(KvErrorKind::Unbalanced, lx.i - 1)
                        } else {
                            err(KvErrorKind::MissingValue, lx.i - 1)
                        }
                    }
                    Tok::Open => {
                        if stack.len() > limits.max_depth {
                            return err(KvErrorKind::TooDeep, lx.i - 1);
                        }
                        stack.push((key, kcond, Vec::new()));
                    }
                    Tok::Str(val) => {
                        let vcond = lx.cond();
                        if let Some(top) = stack.last_mut() {
                            top.2.push(Pair {
                                key,
                                cond: vcond.or(kcond),
                                value: Value::Str(val),
                            });
                        }
                    }
                }
            }
        }
    }
    Ok(stack.pop().map(|f| f.2).unwrap_or_default())
}

/// Ordered view: first case-insensitive match in file order.
pub fn find<'a>(pairs: &'a [Pair], key: &str) -> Option<&'a Pair> {
    pairs.iter().find(|p| p.key.eq_ignore_ascii_case(key))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MergedValue {
    Str(RawStr),
    Map(MergedMap),
}

/// Merged view of one sibling list; keys keep the first-seen spelling, in first-seen order.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct MergedMap(Vec<(String, MergedValue)>);

impl MergedMap {
    pub fn get(&self, key: &str) -> Option<&MergedValue> {
        self.0
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(key))
            .map(|(_, v)| v)
    }

    /// Decoded string value, `None` if absent or a map.
    pub fn str(&self, key: &str) -> Option<String> {
        match self.get(key)? {
            MergedValue::Str(s) => Some(s.decoded()),
            MergedValue::Map(_) => None,
        }
    }

    pub fn map(&self, key: &str) -> Option<&MergedMap> {
        match self.get(key)? {
            MergedValue::Map(m) => Some(m),
            MergedValue::Str(_) => None,
        }
    }

    pub fn iter(&self) -> impl Iterator<Item = (&str, &MergedValue)> {
        self.0.iter().map(|(k, v)| (k.as_str(), v))
    }

    fn fold(&mut self, pairs: &[Pair]) {
        for p in pairs {
            let key = String::from_utf8_lossy(&p.key.0).into_owned();
            let existing = self
                .0
                .iter()
                .position(|(k, _)| k.eq_ignore_ascii_case(&key));
            match (&p.value, existing) {
                (Value::Map(children), Some(i)) => {
                    if let MergedValue::Map(m) = &mut self.0[i].1 {
                        m.fold(children);
                    } else {
                        self.0[i].1 = MergedValue::Map(merged(children));
                    }
                }
                (Value::Map(children), None) => {
                    self.0.push((key, MergedValue::Map(merged(children))));
                }
                (Value::Str(s), Some(i)) => self.0[i].1 = MergedValue::Str(s.clone()),
                (Value::Str(s), None) => self.0.push((key, MergedValue::Str(s.clone()))),
            }
        }
    }
}

/// Merged view: repeated map keys re-open the earlier map, repeated scalars are last-wins.
pub fn merged(pairs: &[Pair]) -> MergedMap {
    let mut m = MergedMap::default();
    m.fold(pairs);
    m
}
