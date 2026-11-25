//! The macOS shortcut icon: a PNG or JPEG becomes a `shortcut.icns` holding one raw `ic11` element.
//! Ported from `convertPngToICNS` (`backend/shortcuts/shortcuts/shortcuts.ts`) and the `sips` chain
//! behind `nativeImage` (`sidecar/nativeImageShim.ts`).
//!
//! The geometry is the one that ships (D-25, superseding D-13's `0,0` origin): resize to width 512
//! keeping the aspect, then crop 512x512 from the CENTRE. The TypeScript asks for `crop({x: 0, y:
//! 0, ...})` but `sips` ignores the offset and crops centred (measured at planning time), so a tall
//! icon loses its top and bottom equally. An image shorter than 512 after the resize is not padded:
//! the crop clamps to the image, as `crop_imm` does. The pixels may differ from `sips`' (a different
//! resampler); the `icon_geometry` goldens pin the band colours at fixed sample points.
//!
//! The container is the TypeScript's: `IconIcns.addFromPng(png, ['ic11'], true)` writes the PNG as
//! one raw `ic11` element, here through the `icns` crate (`IconElement::new`).
//!
//! T-94-26: the icon is a downloaded file. Only PNG and JPEG decode (`image` is built with those two
//! codecs), the file size and the decoded dimensions are bounded, and any failure is an `Err` the
//! caller turns into an iconless bundle.

use std::fs;
use std::io::{Cursor, Read};
use std::path::Path;

use ::icns::{IconElement, IconFamily, OSType};
use image::imageops::{self, FilterType};
use image::{DynamicImage, ImageFormat, ImageReader, Limits};

/// The side of the square icon, and the width the source is resized to.
const SIDE: u32 = 512;
/// A downloaded cover is a few hundred KiB; this only stops a file nobody meant as an icon.
const MAX_FILE_BYTES: u64 = 32 * 1024 * 1024;
/// The largest decoded side accepted.
const MAX_DECODED_SIDE: u32 = 16_384;
/// The largest resized height built: a source more than 32:1 tall would need a bitmap far larger
/// than the 512 rows the crop keeps.
const MAX_RESIZED_HEIGHT: u32 = 16_384;
/// The decoder's allocation cap.
const MAX_ALLOC_BYTES: u64 = 256 * 1024 * 1024;

/// The one element the `.icns` holds, as the TypeScript's `addFromPng(..., ['ic11'], true)` writes.
const ICON_ELEMENT: OSType = OSType(*b"ic11");

/// Decodes `bytes` (PNG or JPEG, by content), resizes to width 512 keeping the aspect, crops 512x512
/// from the centre and encodes the PNG.
pub fn icon_png_512(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let mut limits = Limits::no_limits();
    limits.max_image_width = Some(MAX_DECODED_SIDE);
    limits.max_image_height = Some(MAX_DECODED_SIDE);
    limits.max_alloc = Some(MAX_ALLOC_BYTES);
    let mut reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| format!("icon unreadable: {e}"))?;
    reader.limits(limits);
    let decoded = reader
        .decode()
        .map_err(|e| format!("icon not decodable: {e}"))?
        .to_rgba8();

    let (width, height) = decoded.dimensions();
    if width == 0 || height == 0 {
        return Err("icon is empty".to_string());
    }
    let resized_height = if width == SIDE {
        height
    } else {
        let scaled =
            (u64::from(height) * u64::from(SIDE) + u64::from(width) / 2) / u64::from(width);
        u32::try_from(scaled)
            .map_err(|_| "icon too tall".to_string())?
            .max(1)
    };
    if resized_height > MAX_RESIZED_HEIGHT {
        return Err("icon too tall to resize".to_string());
    }
    let resized = if width == SIDE {
        decoded
    } else {
        imageops::resize(&decoded, SIDE, resized_height, FilterType::Lanczos3)
    };
    // `sips` crops centred whatever offset is asked for (D-25).
    let top = resized_height.saturating_sub(SIDE) / 2;
    let cropped = imageops::crop_imm(&resized, 0, top, SIDE, SIDE.min(resized_height)).to_image();

    let mut png = Vec::new();
    DynamicImage::ImageRgba8(cropped)
        .write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
        .map_err(|e| format!("icon not encodable: {e}"))?;
    Ok(png)
}

/// The bytes of an `.icns` holding `png` as one raw `ic11` element.
pub fn icns_bytes(png: Vec<u8>) -> Result<Vec<u8>, String> {
    let mut family = IconFamily::new();
    family.elements.push(IconElement::new(ICON_ELEMENT, png));
    let mut out = Vec::new();
    family
        .write(&mut out)
        .map_err(|e| format!("icns not writable: {e}"))?;
    Ok(out)
}

/// Converts the icon at `icon` into the `.icns` at `dest`. Nothing is written unless the whole
/// conversion succeeded; an `Err` leaves `dest` absent (best effort on a failed write), and the
/// caller then writes the iconless bundle.
pub fn png_to_icns(icon: &Path, dest: &Path) -> Result<(), String> {
    let file = fs::File::open(icon).map_err(|e| format!("icon not readable: {e}"))?;
    let mut bytes = Vec::new();
    file.take(MAX_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("icon not readable: {e}"))?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("icon file too large".to_string());
    }
    let icns = icns_bytes(icon_png_512(&bytes)?)?;
    if let Err(e) = fs::write(dest, icns) {
        let _ = fs::remove_file(dest);
        return Err(format!("icns not writable: {e}"));
    }
    Ok(())
}
