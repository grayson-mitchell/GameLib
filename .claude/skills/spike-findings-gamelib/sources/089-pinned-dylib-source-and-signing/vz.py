#!/usr/bin/env python3
"""Decode a Valve client package (.zip.vz) to a plain zip.
Layout: b'VZa' + 4-byte version/timestamp + 5-byte LZMA props + LZMA1 stream + footer(crc32 u32, size u32, b'zv')."""
import lzma, struct, sys, zlib
def decode(buf: bytes) -> bytes:
    assert buf[:3] == b'VZa', 'not a VZ file'
    assert buf[-2:] == b'zv', 'bad VZ footer'
    crc, size = struct.unpack('<II', buf[-10:-2])
    props = buf[7:12]
    alone = props + struct.pack('<Q', size) + buf[12:-10]
    out = lzma.LZMADecompressor(format=lzma.FORMAT_ALONE).decompress(alone)[:size]
    assert len(out) == size, f'size {len(out)} != {size}'
    assert zlib.crc32(out) & 0xffffffff == crc, 'crc mismatch'
    return out
if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    open(dst, 'wb').write(decode(open(src, 'rb').read()))
