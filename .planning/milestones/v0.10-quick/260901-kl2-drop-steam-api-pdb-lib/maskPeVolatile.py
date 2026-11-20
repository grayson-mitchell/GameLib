# quick-260901-kl2 verification tool. Zeroes the four PE spans that `zig cc -target
# x86-windows-gnu -shared` re-randomises on every invocation, so two builds of the SAME
# source can be compared:
#
#   (128, 4)      COFF TimeDateStamp        -- wall-clock, advances every second
#   (208, 4)      OptionalHeader CheckSum
#   (729092, 4)   debug-directory entry TimeDateStamp
#   (729120, 20)  RSDS GUID(16) + Age(4)    -- derived from PDB content
#
# Offsets are DERIVED from the PE headers at run time, not hard-coded; a non-PE input fails
# loud.
#
# PRECONDITION -- THE COMPARED FILES MUST HAVE BEEN LINKED WITH THE SAME `-o` BASENAME.
# The RSDS record continues past the masked GUID+Age span with a NUL-terminated PDB name
# string (at 729140 in this artifact: `steam_api.pdb`). That string is deliberately NOT
# masked, so two builds emitted as `steam_api.dll` and `DIFFERENT_NAME.dll` mask to
# `cc3e8b4a...` and `5607d2f8...` respectively and this tool reports a MISMATCH. That is
# correct behaviour, not a bug: the name is real content of the artifact. It is safe for this
# task because `shimOutputPath()` always emits the fixed name `steam_api.dll`, so every file
# compared here shares a basename. If you hit a false RED, check the `-o` basename FIRST --
# do NOT widen the mask to cover the name string. A mask wide enough to ignore the PDB name
# is a mask that has started hiding real differences.
#
# Validated during planning: two fresh builds AND the 2026-08-31 shipped baseline all mask to
# cc3e8b4a1fba55b9ab9cb69927b9c76d. Non-vacuous -- a one-line change to the shim source
# (identical 805,888 B output) masks to d8a979b6..., and a BRIDGE_PORT constant flip
# 54550->54551 is likewise caught.

import struct, sys, hashlib

def mask(path):
    d = bytearray(open(path, 'rb').read())
    pe = struct.unpack_from('<I', d, 0x3c)[0]
    nsec  = struct.unpack_from('<H', d, pe + 6)[0]
    optsz = struct.unpack_from('<H', d, pe + 20)[0]
    spans = []
    spans.append((pe + 8, 4))                      # COFF TimeDateStamp
    opt = pe + 24
    magic = struct.unpack_from('<H', d, opt)[0]
    spans.append((opt + 64, 4))                    # OptionalHeader CheckSum
    ddir = opt + (96 if magic == 0x10b else 112)   # PE32 vs PE32+
    dbg_rva, dbg_sz = struct.unpack_from('<II', d, ddir + 6 * 8)
    # section table -> RVA to file offset
    sect = pe + 24 + optsz
    def rva2off(rva):
        for i in range(nsec):
            s = sect + i * 40
            va  = struct.unpack_from('<I', d, s + 12)[0]
            vsz = struct.unpack_from('<I', d, s + 8)[0]
            raw = struct.unpack_from('<I', d, s + 20)[0]
            rsz = struct.unpack_from('<I', d, s + 16)[0]
            if va <= rva < va + max(vsz, rsz):
                return raw + (rva - va)
        return None
    if dbg_rva and dbg_sz:
        base = rva2off(dbg_rva)
        for i in range(dbg_sz // 28):
            e = base + i * 28
            spans.append((e + 4, 4))               # debug entry TimeDateStamp
            praw = struct.unpack_from('<I', d, e + 24)[0]
            if d[praw:praw + 4] == b'RSDS':
                spans.append((praw + 4, 20))       # RSDS GUID(16) + Age(4)
    for off, n in spans:
        d[off:off + n] = b'\x00' * n
    return bytes(d), spans

if __name__ == '__main__':
    out = []
    for p in sys.argv[1:]:
        m, spans = mask(p)
        out.append((p, hashlib.sha256(m).hexdigest(), spans))
    for p, h, spans in out:
        print(f'{h[:32]}  masked-spans={spans}  {p}')
    print('ALL MASKED HASHES EQUAL:', len({h for _, h, _ in out}) == 1)
