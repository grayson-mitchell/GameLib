#!/usr/bin/env python3
"""Spike 040: read-only decode of a SteamStub 3.1 x64 .bind header, plus a PE
signature survey. Opens every input read-only; never writes to an input path.

Layout from Steamless (atom0s), Variant31.x64: the 0xF0-byte header sits just
before AddressOfEntryPoint, XOR-chained with the first dword as the key, and
decodes correctly when Signature == 0xC0DEC0DF.

Usage: python3 -I decode_bind.py <pe> [<pe> ...]
"""
import json
import struct
import sys

FLAGS = {
    0x02: "NoModuleVerification",
    0x04: "NoEncryption",
    0x10: "NoOwnershipCheck",
    0x20: "NoDebuggerCheck",
    0x40: "NoErrorDialog",
}


def pe_info(data):
    pe = struct.unpack_from("<I", data, 0x3C)[0]
    assert data[pe:pe + 4] == b"PE\0\0", "not a PE"
    nsec = struct.unpack_from("<H", data, pe + 6)[0]
    optsz = struct.unpack_from("<H", data, pe + 20)[0]
    opt = pe + 24
    magic = struct.unpack_from("<H", data, opt)[0]
    entry = struct.unpack_from("<I", data, opt + 16)[0]
    ddir = opt + (112 if magic == 0x20B else 96)
    sec_va, sec_sz = struct.unpack_from("<II", data, ddir + 4 * 8)  # IMAGE_DIRECTORY_ENTRY_SECURITY
    sections = []
    for i in range(nsec):
        s = opt + optsz + 40 * i
        name = data[s:s + 8].rstrip(b"\0").decode("latin-1")
        vsz, va, rsz, raw = struct.unpack_from("<IIII", data, s + 8)
        sections.append({"name": name, "va": va, "vsize": vsz, "raw": raw, "rsize": rsz})
    return {"pe64": magic == 0x20B, "entry": entry, "sections": sections,
            "authenticode": {"offset": sec_va, "size": sec_sz}}


def rva_to_off(sections, rva):
    for s in sections:
        if s["va"] <= rva < s["va"] + max(s["vsize"], s["rsize"]):
            return rva - s["va"] + s["raw"]
    return None


def steam_xor(buf):
    key = struct.unpack_from("<I", buf, 0)[0]
    out = bytearray(buf)
    for x in range(4, len(buf), 4):
        val = struct.unpack_from("<I", buf, x)[0]
        struct.pack_into("<I", out, x, val ^ key)
        key = val
    return bytes(out)


def decode_header(data, info):
    off = rva_to_off(info["sections"], info["entry"])
    if off is None or off < 0xF0:
        return {"error": "entry point not in a section"}
    h = steam_xor(data[off - 0xF0:off])
    (xor_key, sig, image_base, ep, bind_off, _u0, oep, _u1, payload_size,
     drmp_off, drmp_size, appid, flags, bind_vsize, _u2) = struct.unpack_from("<IIQQIIQIIIIIIII", h, 0)
    if sig != 0xC0DEC0DF:
        return {"error": f"signature mismatch 0x{sig:08X} (not 3.1 x64, or entry moved to TLS)"}
    return {
        "variant": "3.1 x64",
        "signature": f"0x{sig:08X}",
        "steam_appid": appid,
        "flags": f"0x{flags:08X}",
        "flags_set": [n for b, n in FLAGS.items() if flags & b],
        "checks_enabled": {
            "module_verification": not flags & 0x02,
            "ownership_check": not flags & 0x10,
            "debugger_check": not flags & 0x20,
            "error_dialog": not flags & 0x40,
            "code_encrypted": not flags & 0x04,
        },
        "original_entry_point": f"0x{oep:X}",
        "payload_size": payload_size,
        "drmp_dll_size": drmp_size,
    }


def tail_markers(data):
    # Valve signs its own binaries with a trailing "VLV" block; record where it is.
    hits = []
    start = max(0, len(data) - 0x4000)
    i = data.find(b"VLV\0", start)
    while i != -1:
        hits.append(i)
        i = data.find(b"VLV\0", i + 1)
    return {"vlv_offsets_in_last_16k": hits, "file_size": len(data)}


def main(paths):
    report = []
    for p in paths:
        with open(p, "rb") as f:
            data = f.read()
        info = pe_info(data)
        names = [s["name"] for s in info["sections"]]
        entry = {"path": p, "pe64": info["pe64"], "sections": names,
                 "authenticode": info["authenticode"], "tail": tail_markers(data)}
        if ".bind" in names:
            entry["bind"] = decode_header(data, info)
        report.append(entry)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main(sys.argv[1:])
