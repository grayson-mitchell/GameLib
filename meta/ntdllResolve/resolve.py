#!/usr/bin/env python3
# GPL-3.0
# Ported from NotProtonNot/NotProton @ 8db22adb237e6ea640a5af148b69b93709daf50c,
# ntdll-patch/resolve.py (x86_64 path only). Upstream carries no per-file copyright line;
# the project is GPL-3.0 (see NOTICE upstream). GameLib ports it per Phase 56 D-03/D-08.
#
# DEVELOPER TOOL ONLY. It is not a runtime, build or CI dependency of GameLib (F5): nothing in
# package.json, .github/workflows or src/ runs or imports it. See meta/ntdllResolve/README.md.
# Reads the per-build constants the x86_64 ntdll detour needs out of a clean ntdll.dll.
import hashlib, pathlib, struct, sys, re, capstone
from capstone import x86 as X86

ARCH = {0x8664: 'x86_64-windows'}

PAYLOAD = {0x8664: 864}  # detour-cx<build>.bin

# Keyed by input sha256 so the comparison only runs against the build the tree pins, so a
# new build will report derived values rather than a wall of expected mismatches
PINNED = {
    '6dff64c00793ce92124f1316985c63783f539f26b392975c70f57637458d2387':
        {'hookRVA': 0x44972, 'stolen': '4883bc24f000000000', 'caveRVA': 0xae000, 'caveSize': 4096,
         'wm': 'r14', 'resume': 0x4497b, 'load_path': 0xd0,
         'payload': 'e35b834408599c45f30b23a6d2bf38acfa5c3df4d15206617c471e23a4a01bfb',
         'exports': {'LdrGetDllHandle': 0x170014bc0, 'LdrLoadDll': 0x170015680,
                     'NtProtectVirtualMemory': 0x17000f380}},
}
EXPORTS = ['LdrGetDllHandle', 'LdrLoadDll', 'NtProtectVirtualMemory']
SECTION_NAME, SECTION_SIZE, SECTION_FLAGS = b'.npdet', 0x1000, 0x60000020


class PE:
    def __init__(self, path):
        self.path = path
        self.d = open(path, 'rb').read()
        e = struct.unpack_from('<I', self.d, 0x3c)[0]
        self.machine = struct.unpack_from('<H', self.d, e + 4)[0]
        nsec = struct.unpack_from('<H', self.d, e + 6)[0]
        optsz = struct.unpack_from('<H', self.d, e + 20)[0]
        self.opt = e + 24
        self.magic = struct.unpack_from('<H', self.d, self.opt)[0]
        wide = self.magic == 0x20b
        self.imagebase = (struct.unpack_from('<Q', self.d, self.opt + 24)[0] if wide
                          else struct.unpack_from('<I', self.d, self.opt + 28)[0])
        self.secs = []
        for i in range(nsec):
            o = e + 24 + optsz + i * 40
            name = self.d[o:o + 8].rstrip(b'\0').decode('latin1')
            vsize, vrva, rsize, roff = struct.unpack_from('<IIII', self.d, o + 8)
            if roff:
                self.secs.append((name, vrva, vsize, roff, rsize))
        self.dirs = self.opt + (112 if wide else 96)
        self.table_end = e + 24 + optsz + nsec * 40
        self.sect_align, self.file_align = struct.unpack_from('<II', self.d, self.opt + 32)
        self.size_of_image, self.size_of_headers = struct.unpack_from('<II', self.d, self.opt + 56)

    def sec(self, prefix):
        for s in self.secs:
            if s[0].startswith(prefix):
                return s
        raise SystemExit(f"{self.path}: no {prefix} section")

    def off(self, rva):
        for _, vrva, vsize, roff, rsize in self.secs:
            if vrva <= rva < vrva + max(vsize, rsize):
                return roff + (rva - vrva)
        raise SystemExit(f"{self.path}: rva {rva:#x} not mapped")

    def text(self):
        _, vrva, _, roff, rsize = self.sec('.text')
        return vrva, self.d[roff:roff + rsize]

    def cs(self):
        md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_64)
        md.detail = True
        return md

    def exports(self):
        edir = struct.unpack_from('<I', self.d, self.dirs)[0]
        o = self.off(edir)
        nnames = struct.unpack_from('<I', self.d, o + 0x18)[0]
        afun, anam, aord = struct.unpack_from('<III', self.d, o + 0x1c)
        fo, no, oo = self.off(afun), self.off(anam), self.off(aord)
        out = {}
        for i in range(nnames):
            nrva = struct.unpack_from('<I', self.d, no + 4 * i)[0]
            ordn = struct.unpack_from('<H', self.d, oo + 2 * i)[0]
            frva = struct.unpack_from('<I', self.d, fo + 4 * ordn)[0]
            s = self.off(nrva)
            out[self.d[s:self.d.index(b'\0', s)].decode('latin1')] = frva
        return out

    def cave(self):
        # PE sections are padded out to the file alignment, so there's dead space
        # at the end that the loader maps but nothing touches. Detour goes there.
        _, vrva, vsize, roff, rsize = self.sec('.text')
        end = vrva + vsize
        return {'caveRVA': end, 'caveSize': (vrva + rsize) - end, 'fill': self.d[roff + vsize],
                'placement': 'padding'}

    def appended(self):
        # The section is mapped at SizeOfImage, and its raw data goes after everything else in
        # the file, the certificate included.
        if self.table_end + 40 > self.size_of_headers or any(self.d[self.table_end:self.table_end + 40]):
            raise SystemExit(f"{self.path}: no free section header slot after the table")
        raw = (len(self.d) + self.file_align - 1) & ~(self.file_align - 1)
        return {'caveRVA': self.size_of_image, 'caveSize': SECTION_SIZE, 'fill': 0,
                'placement': 'section', 'rawOffset': raw}

    def string_refs(self, name):
        """RVAs of instructions referencing a .rdata C string, however the arch addresses it."""
        _, rvrva, _, rroff, rrsize = self.sec('.rdata')
        k = self.d[rroff:rroff + rrsize].find(name.encode() + b'\0')
        if k == -1:
            raise SystemExit(f"{self.path}: no {name} string; not a traced wine build")
        srva = rvrva + k
        tvrva, text = self.text()
        hits = []
        for i in self.cs().disasm(text, tvrva):
            for op in i.operands:
                if op.type == X86.X86_OP_MEM and op.mem.base == X86.X86_REG_RIP:
                    if i.address + i.size + op.mem.disp == srva:
                        hits.append(i.address)
        return srva, hits


def steal(insns, k, need=5):
    """Whole instructions from insns[k] totalling at least `need` bytes."""
    taken, total = [], 0
    while total < need:
        taken.append(insns[k + len(taken)])
        total += taken[-1].size
    return taken, total


def resolve_amd64(pe):
    md = pe.cs()
    tvrva, text = pe.text()
    insns = list(md.disasm(text, tvrva))

    _, pvrva, pvsize, proff, _ = pe.sec('.pdata')
    funcs = []
    for o in range(proff, proff + pvsize, 12):
        begin, end, _ = struct.unpack_from('<III', pe.d, o)
        if begin:
            funcs.append((begin, end))

    owner = {}
    for name in ('build_module', 'alloc_module'):
        _, refs = pe.string_refs(name)
        for r in refs:
            for begin, end in funcs:
                if begin <= r < end:
                    owner.setdefault(name, (begin, end))
    bm = owner['build_module']
    am = owner['alloc_module'][0]

    body = [i for i in insns if bm[0] <= i.address < bm[1]]
    calls = [k for k, i in enumerate(body) if i.mnemonic == 'call' and i.op_str == hex(am)]
    if len(calls) != 1:
        raise SystemExit(f"{pe.path}: {len(calls)} alloc_module calls in build_module, want 1")

    k, wm = calls[0] + 1, None
    while True:
        i = body[k]
        if i.mnemonic == 'test' and i.op_str == 'rax, rax':
            k += 1
        elif i.mnemonic == 'mov' and i.op_str.endswith(', rax'):
            wm = i.op_str.split(',')[0].strip()
            k += 1
        elif i.mnemonic in ('je', 'jz'):
            k += 1
        else:
            break
    hook = body[k]
    slot = amd64_load_path(pe, body, hook.address)
    return {'build_module': bm, 'alloc_module': am, 'wm': wm, 'load_path': slot,
            'hookRVA': hook.address, 'stolen': hook.bytes.hex(), 'insn': f"{hook.mnemonic} {hook.op_str}"}


def amd64_load_path(pe, body, hook):
    """Frame slot holding the load_path argument, read as [rsp+N] at the hook."""
    # Neither build keeps the argument in rcx. One spills it to the stack right away,
    # the other stashes it in a callee-saved register and reuses that a few instructions
    # later.
    src, slot, stored_at = 'rcx', None, None
    for i in body:
        if i.address >= hook:
            break
        if i.mnemonic != 'mov' or ',' not in i.op_str:
            continue
        dst, rhs = (x.strip() for x in i.op_str.split(',', 1))
        if rhs != src:
            continue
        if dst.startswith('qword ptr [rsp'):
            slot = 0 if '+' not in dst else int(dst.split('+')[1].strip().rstrip(']'), 16)
            stored_at = i.address
            break
        if re.fullmatch(r'r[a-z0-9]+', dst):
            src = dst
    if slot is None:
        raise SystemExit(f"{pe.path}: load_path never reaches the frame in build_module")

    # The shim reads the slot off rsp, so anything moving rsp in between would shift it, and
    # a second write to it would mean the slot is reused for something else.
    for i in body:
        if not stored_at < i.address < hook:
            continue
        if i.mnemonic in ('push', 'pop') or (i.mnemonic in ('sub', 'add') and i.op_str.startswith('rsp,')):
            raise SystemExit(f"{pe.path}: rsp moves at {i.address:#x}, load_path slot not rsp-stable")
        if i.mnemonic == 'mov' and i.op_str.startswith(f'qword ptr [rsp + {slot:#x}],'):
            raise SystemExit(f"{pe.path}: load_path slot rewritten at {i.address:#x}")
    return slot


def resolve(path):
    pe = PE(path)
    if pe.machine != 0x8664:
        raise SystemExit(f"{path}: machine {pe.machine:#x} is not x86_64, only x86_64 is supported")
    r = resolve_amd64(pe)
    r.update(pe.cave())
    if r['caveSize'] < PAYLOAD[pe.machine]:
        r.update(pe.appended())
    r['machine'], r['magic'], r['imageBase'] = pe.machine, pe.magic, pe.imagebase
    ex = pe.exports()
    r['exports'] = {n: pe.imagebase + ex[n] for n in EXPORTS if n in ex}
    r['resume'] = r['hookRVA'] + len(r['stolen']) // 2
    r['sha256'] = hashlib.sha256(pe.d).hexdigest()
    return r


def report(path):
    machine = PE(path).machine
    if machine not in ARCH:
        print(f"{path}\n  machine {machine:#x} carries no detour, skipped\n")
        return True
    r = resolve(path)
    pin = PINNED.get(r['sha256'], {})
    arch = ARCH[machine]
    print(f"{path}\n  arch {arch}  machine {r['machine']:#x}  magic {r['magic']:#x}"
          f"  imageBase {r['imageBase']:#x}\n  sha256 {r['sha256']}"
          f"{'  (the pinned build, self-testing)' if pin else '  (not a pinned build)'}")
    ok = True

    def line(label, got, key=None, fmt=lambda v: f"{v:#x}", want=pin):
        nonlocal ok
        tag = ""
        if key and key in want:
            match = want[key] == got
            ok = ok and match
            tag = "  MATCH" if match else f"  MISMATCH (pinned {fmt(want[key])})"
        print(f"  {label:13} {fmt(got)}{tag}")

    for s_ in [r]:
        line('hookRVA', s_['hookRVA'], 'hookRVA')
        print(f"  {'insn':13} {s_['insn']}")
        line('stolen', s_['stolen'], 'stolen', fmt=str)
        line('resume', s_['resume'], 'resume')
        line('wm', s_['wm'], 'wm', fmt=str)
        line('load_path', s_['load_path'], 'load_path', fmt=lambda v: f"rsp+{v:#x}")
    line('caveRVA', r['caveRVA'], 'caveRVA')
    line('caveSize', r['caveSize'], 'caveSize', fmt=str)
    need = PAYLOAD[r['machine']]
    print(f"  {'placement':13} {r['placement']}")
    print(f"  {'cave fill':13} {r['fill']:#02x}   room {r['caveSize']} bytes, payload {need}"
          f" -> {'fits' if r['caveSize'] >= need else 'TOO SMALL'}")
    def table(items, want):
        nonlocal ok
        for n, va in items.items():
            pinned_va = want.get(n)
            tag = ""
            if pinned_va:
                match = pinned_va == va
                ok = ok and match
                tag = "  MATCH" if match else f"  MISMATCH (pinned {pinned_va:#x})"
            print(f"    {n:24} {va:#x}{tag}")

    table(r['exports'], pin.get('exports', {}))
    if pin:
        print(f"  self-test: {'all pinned values reproduced' if ok else 'FAILED'}")
    print()
    return ok if pin else True


def ntdlls(arg):
    """Every ntdll.dll under a bundle, a CrossOver root, or a wine directory."""
    p = pathlib.Path(arg)
    if p.is_file():
        return [str(p)]
    for root in (p / 'Contents/SharedSupport/CrossOver/lib/wine', p / 'lib/wine', p):
        archs = sorted(d for d in root.glob('*-windows') if d.is_dir())
        if not archs:
            continue
        found = []
        for d in archs:
            for name in ('ntdll.dll.notproton-orig', 'ntdll.dll'):
                if (d / name).is_file():
                    found.append(str(d / name))
                    break
        if found:
            return found
    raise SystemExit(f"{arg}: no <arch>-windows/ntdll.dll under it")


def shell_vars(path):
    """Everything build.sh and apply.py need for one ntdll, as shell assignments."""
    r = resolve(path)
    payload = (r['caveRVA'] + 15) & ~15
    room = r['caveSize'] - (payload - r['caveRVA'])
    need = PAYLOAD[r['machine']]
    if room < need:
        raise SystemExit(f"{path}: cave has {room} bytes at {payload:#x}, payload needs {need}")
    scratch = 'rsi' if r['wm'] == 'rbx' else 'rbx'
    out = {
        'NP_ARCH': ARCH[r['machine']], 'NP_MACHINE': f"{r['machine']:#x}",
        'NP_MAGIC': f"{r['magic']:#x}", 'NP_IMAGEBASE': f"{r['imageBase']:#x}",
        'NP_SHA256': r['sha256'],
        'NP_HOOK_RVA': f"{r['hookRVA']:#x}", 'NP_STOLEN': r['stolen'],
        'NP_STOLEN_BYTES': ','.join(f"0x{b:02x}" for b in bytes.fromhex(r['stolen'])),
        'NP_STOLEN_LEN': str(len(r['stolen']) // 2),
        'NP_RESUME_VA': f"{r['imageBase'] + r['resume']:#x}",
        'NP_WM': r['wm'], 'NP_SCRATCH': scratch,
        'NP_LOAD_PATH': f"{r['load_path']:#x}" if r.get('load_path') is not None else '',
        'NP_CAVE_RVA': f"{r['caveRVA']:#x}", 'NP_CAVE_SIZE': str(r['caveSize']),
        'NP_PAYLOAD_RVA': f"{payload:#x}", 'NP_PAYLOAD_VA': f"{r['imageBase'] + payload:#x}",
        'NP_CAVE_ROOM': str(room), 'NP_FILL': f"{r['fill']:#04x}",
        'NP_PLACEMENT': r['placement'],
    }
    if PINNED.get(r['sha256'], {}).get('payload'):
        out['NP_PAYLOAD_SHA256'] = PINNED[r['sha256']]['payload']

    for n, va in r['exports'].items():
        out['NP_' + re.sub(r'(?<!^)(?=[A-Z])', '_', n).upper()] = f"{va:#x}"
    return out


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(f"usage: {sys.argv[0]} [--sh] <CrossOver bundle | wine dir | ntdll.dll> ...")
    if sys.argv[1] == '--sh':
        if len(sys.argv) != 3:
            raise SystemExit("--sh takes one ntdll.dll")
        for k, v in shell_vars(sys.argv[2]).items():
            print(f"{k}='{v}'")
        sys.exit(0)
    paths = [p for arg in sys.argv[1:] for p in ntdlls(arg)]
    sys.exit(0 if all([report(p) for p in paths]) else 1)

