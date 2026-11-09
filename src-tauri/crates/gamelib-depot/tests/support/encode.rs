//! Test-only encoders for the chunk containers and the manifest wrapper. Plan 07 reuses these to
//! build fixtures. Deterministic: the IV is a parameter.

use aes::cipher::block_padding::NoPadding;
use aes::cipher::{BlockCipherEncrypt, BlockModeEncrypt, KeyInit, KeyIvInit};
use std::io::Write;

pub fn crc32(data: &[u8]) -> u32 {
    let mut c = flate2::Crc::new();
    c.update(data);
    c.sum()
}

/// Encrypt already-padded `padded` (length multiple of 16) with the Steam layout:
/// ECB(iv) || CBC(padded).
pub fn steam_encrypt_raw(padded: &[u8], key: &[u8; 32], iv: &[u8; 16]) -> Vec<u8> {
    assert_eq!(padded.len() % 16, 0);
    let cipher = aes::Aes256::new(key.into());
    let mut enc_iv = *iv;
    cipher.encrypt_block((&mut enc_iv).into());
    let mut body = padded.to_vec();
    cbc::Encryptor::<aes::Aes256>::new(key.into(), iv.into())
        .encrypt_padded::<NoPadding>(&mut body, padded.len())
        .unwrap();
    let mut out = enc_iv.to_vec();
    out.extend_from_slice(&body);
    out
}

/// PKCS7-pad then encrypt.
pub fn steam_encrypt(plain: &[u8], key: &[u8; 32], iv: &[u8; 16]) -> Vec<u8> {
    let pad = 16 - plain.len() % 16;
    let mut p = plain.to_vec();
    p.extend(std::iter::repeat_n(pad as u8, pad));
    steam_encrypt_raw(&p, key, iv)
}

/// Minimal literal-only LZMA encoder (lc=3 lp=0 pb=2, no end marker). Valve's VZ streams carry the
/// size in the footer and have no end-of-payload marker, which liblzma's own encoder cannot
/// produce; a literal-only stream exercises the same decoder path.
pub fn lzma_alone_parts(data: &[u8]) -> ([u8; 5], Vec<u8>) {
    struct Rc {
        low: u64,
        range: u32,
        cache: u8,
        cache_size: u64,
        out: Vec<u8>,
    }
    impl Rc {
        fn shift_low(&mut self) {
            if (self.low as u32) < 0xFF00_0000 || (self.low >> 32) != 0 {
                let mut temp = self.cache;
                loop {
                    self.out.push(temp.wrapping_add((self.low >> 32) as u8));
                    temp = 0xFF;
                    self.cache_size -= 1;
                    if self.cache_size == 0 {
                        break;
                    }
                }
                self.cache = ((self.low >> 24) & 0xFF) as u8;
            }
            self.cache_size += 1;
            self.low = (self.low & 0x00FF_FFFF) << 8;
        }
        fn bit(&mut self, prob: &mut u16, bit: u32) {
            let bound = (self.range >> 11) * u32::from(*prob);
            if bit == 0 {
                self.range = bound;
                *prob += (2048 - *prob) >> 5;
            } else {
                self.low += u64::from(bound);
                self.range -= bound;
                *prob -= *prob >> 5;
            }
            while self.range < (1 << 24) {
                self.range <<= 8;
                self.shift_low();
            }
        }
    }
    let mut rc = Rc {
        low: 0,
        range: 0xFFFF_FFFF,
        cache: 0,
        cache_size: 1,
        out: Vec::new(),
    };
    let mut is_match = [1024u16; 12 * 16];
    let mut lit = vec![1024u16; 0x300 << 3];
    let mut prev = 0u8;
    for (pos, &byte) in data.iter().enumerate() {
        rc.bit(&mut is_match[pos & 3], 0); // state 0, pos_state = pos & 3
        let base = 0x300 * usize::from(prev >> 5);
        let mut sym = 1usize;
        for i in (0..8).rev() {
            let b = u32::from((byte >> i) & 1);
            rc.bit(&mut lit[base + sym], b);
            sym = (sym << 1) | b as usize;
        }
        prev = byte;
    }
    for _ in 0..5 {
        rc.shift_low();
    }
    let mut props = [0u8; 5];
    props[0] = 0x5D;
    props[1..].copy_from_slice(&(1u32 << 16).to_le_bytes());
    (props, rc.out)
}

pub fn vz_wrap(data: &[u8]) -> Vec<u8> {
    let (props, payload) = lzma_alone_parts(data);
    let mut v = b"VZa".to_vec();
    v.extend_from_slice(&[0u8; 4]);
    v.extend_from_slice(&props);
    v.extend_from_slice(&payload);
    v.extend_from_slice(&crc32(data).to_le_bytes());
    v.extend_from_slice(&(data.len() as u32).to_le_bytes());
    v.extend_from_slice(b"zv");
    v
}

pub fn vsza_wrap_with_footer_size(data: &[u8], footer_size: u32) -> Vec<u8> {
    let mut v = b"VSZa".to_vec();
    v.extend_from_slice(&[0u8; 4]);
    v.extend_from_slice(&zstd::encode_all(data, 3).unwrap());
    v.extend_from_slice(&crc32(data).to_le_bytes());
    v.extend_from_slice(&footer_size.to_le_bytes());
    v.extend_from_slice(&[0u8; 4]);
    v.extend_from_slice(b"zsv");
    v
}

pub fn vsza_wrap(data: &[u8]) -> Vec<u8> {
    vsza_wrap_with_footer_size(data, data.len() as u32)
}

fn local_header(
    flags: u16,
    method: u16,
    crc: u32,
    csize: u32,
    usize_: u32,
    name: &[u8],
) -> Vec<u8> {
    let mut v = b"PK\x03\x04".to_vec();
    v.extend_from_slice(&20u16.to_le_bytes());
    v.extend_from_slice(&flags.to_le_bytes());
    v.extend_from_slice(&method.to_le_bytes());
    v.extend_from_slice(&[0u8; 4]); // time/date
    v.extend_from_slice(&crc.to_le_bytes());
    v.extend_from_slice(&csize.to_le_bytes());
    v.extend_from_slice(&usize_.to_le_bytes());
    v.extend_from_slice(&(name.len() as u16).to_le_bytes());
    v.extend_from_slice(&0u16.to_le_bytes());
    v.extend_from_slice(name);
    v
}

#[allow(clippy::too_many_arguments)]
fn central_dir(
    flags: u16,
    method: u16,
    crc: u32,
    csize: u32,
    usize_: u32,
    name: &[u8],
    local_off: u32,
    cd_off: u32,
) -> Vec<u8> {
    let mut v = b"PK\x01\x02".to_vec();
    v.extend_from_slice(&20u16.to_le_bytes());
    v.extend_from_slice(&20u16.to_le_bytes());
    v.extend_from_slice(&flags.to_le_bytes());
    v.extend_from_slice(&method.to_le_bytes());
    v.extend_from_slice(&[0u8; 4]);
    v.extend_from_slice(&crc.to_le_bytes());
    v.extend_from_slice(&csize.to_le_bytes());
    v.extend_from_slice(&usize_.to_le_bytes());
    v.extend_from_slice(&(name.len() as u16).to_le_bytes());
    v.extend_from_slice(&[0u8; 12]); // extra, comment, disk, internal attrs (2 each) + external attrs (4)
    v.extend_from_slice(&local_off.to_le_bytes());
    v.extend_from_slice(name);
    let cd_len = v.len() as u32;
    v.extend_from_slice(b"PK\x05\x06");
    v.extend_from_slice(&[0u8; 4]);
    v.extend_from_slice(&1u16.to_le_bytes());
    v.extend_from_slice(&1u16.to_le_bytes());
    v.extend_from_slice(&cd_len.to_le_bytes());
    v.extend_from_slice(&cd_off.to_le_bytes());
    v.extend_from_slice(&0u16.to_le_bytes());
    v
}

/// Stored entry with the bit-3 data descriptor, followed by a central directory and EOCD (the
/// trailing metadata the TS over-read bug absorbed).
pub fn pk_stored_dd(data: &[u8]) -> Vec<u8> {
    let crc = crc32(data);
    let mut v = local_header(0x08, 0, 0, 0, 0, b"z");
    v.extend_from_slice(data);
    v.extend_from_slice(b"PK\x07\x08");
    v.extend_from_slice(&crc.to_le_bytes());
    v.extend_from_slice(&(data.len() as u32).to_le_bytes());
    v.extend_from_slice(&(data.len() as u32).to_le_bytes());
    let cd_off = v.len() as u32;
    v.extend(central_dir(
        0x08,
        0,
        crc,
        data.len() as u32,
        data.len() as u32,
        b"z",
        0,
        cd_off,
    ));
    v
}

pub fn deflate_raw(data: &[u8]) -> Vec<u8> {
    let mut e = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::default());
    e.write_all(data).unwrap();
    e.finish().unwrap()
}

/// Deflate (method 8) local entry, no data descriptor, with trailing central directory.
pub fn pk_deflate(data: &[u8]) -> Vec<u8> {
    zip_wrap(data, 8)
}

/// A real one-entry zip. `method` is 0 (stored) or 8 (deflate).
pub fn zip_wrap(data: &[u8], method: u16) -> Vec<u8> {
    let crc = crc32(data);
    let body = if method == 8 {
        deflate_raw(data)
    } else {
        data.to_vec()
    };
    let mut v = local_header(
        0,
        method,
        crc,
        body.len() as u32,
        data.len() as u32,
        b"manifest.bin",
    );
    v.extend_from_slice(&body);
    let cd_off = v.len() as u32;
    v.extend(central_dir(
        0,
        method,
        crc,
        body.len() as u32,
        data.len() as u32,
        b"manifest.bin",
        0,
        cd_off,
    ));
    v
}
