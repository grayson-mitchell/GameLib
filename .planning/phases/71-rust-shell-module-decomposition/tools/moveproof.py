#!/usr/bin/env python3
"""Move-proof for Phase 71 (stdlib only).

usage:
  moveproof.py --base REF --wave N [--include-tests] [--require-all] [--stem NAME ...]
  moveproof.py --self-test

File set: every src-tauri/src/**/*.rs at REF (git) and in the working tree, minus ipc_contract.rs
(generated; `pnpm check:ipc-contract` covers it).

Shared cut rule (identical in 71-02's TS cutter and 71-03's Rust cutter): a test module block starts at a
line that is exactly `#[cfg(test)]` at column 0 whose NEXT line matches `^mod [A-Za-z_][A-Za-z0-9_]* \\{$` at
column 0, and ends at the first following line that is exactly `}`. Only that block is removed. Leading
comment lines above `#[cfg(test)]` stay. A `#[cfg(test)]` inside a comment, an indented one, or one on a
non-mod item is not cut. By default production text only is compared; --include-tests (wave 5) uses full text.

Layer 1 (all waves): normalized line multiset diff (strip, pub(crate)/pub(super) removed, bare-punctuation
  lines dropped, comments kept) after a declaration filter; per-wave allow profile for what remains.
Layer 2 (wave 1): every RustInvokeChannel arm body at REF equals the body of fn rpc_<snake(X)> now.
Layer 3 (waves 2-4): per-item (kind, name, body-hash) multiset over the wave's target files
  (or over the files of every --stem NAME given, repeatable, for a move that crosses module stems).
"""
import collections
import hashlib
import pathlib
import re
import subprocess
import sys

SRC = 'src-tauri/src'
VIS = re.compile(r'\bpub\((?:crate|super)\)\s+')
NOISE = re.compile(r'^[{}()\[\];,]*$')
MOD_LINE = re.compile(r'^mod [A-Za-z_][A-Za-z0-9_]* \{$')
DECL = [
    re.compile(r'^(pub )?mod \w+;$'),
    re.compile(r'^(pub )?use [\w:]+::\*;$'),
    re.compile(r'^use super::\*;$'),
]
RPC_SIG = re.compile(r'^(pub )?fn rpc_\w+\([^)]*\) -> Result<Value, String> \{$')
CFG_ATTR_RPC = '#[cfg_attr(not(target_os = "macos"), allow(unused_variables))]'
USE_LINE = re.compile(r'^(pub )?use .*;$')
SHELL_DIRECT = {'ShellOpenPath', 'ShellShowItemInFolder'}
WAVE_STEM = {2: 'login_window', 3: 'store_embed', 4: 'macos_epic_embed'}


def cut_test_modules(text):
    """The shared cut rule. Returns text with every top-level `#[cfg(test)] mod x {` ... `}` block removed."""
    lines = text.split('\n')
    out = []
    i = 0
    n = len(lines)
    while i < n:
        if lines[i] == '#[cfg(test)]' and i + 1 < n and MOD_LINE.match(lines[i + 1]):
            j = i + 2
            while j < n and lines[j] != '}':
                j += 1
            i = j + 1  # skip the closing brace line too
            continue
        out.append(lines[i])
        i += 1
    return '\n'.join(out)


# ---------------------------------------------------------------- file loading
def root():
    return pathlib.Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip())


def base_files(ref):
    r = root()
    names = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', ref, SRC], text=True, cwd=r).split('\n')
    return {n: subprocess.check_output(['git', 'show', f'{ref}:{n}'], text=True, cwd=r)
            for n in names if n.endswith('.rs')}


def now_files():
    r = root()
    return {str(p.relative_to(r)): p.read_text() for p in (r / SRC).rglob('*.rs')}


def select(files, include_tests):
    out = {}
    for n, t in files.items():
        if n.endswith('ipc_contract.rs'):
            continue
        out[n] = t if include_tests else cut_test_modules(t)
    return out


# ---------------------------------------------------------------- layer 1
def join_use(lines):
    """Join multi-line `use ... {` statements into one stripped line so import review is per statement."""
    out = []
    i = 0
    while i < len(lines):
        s = lines[i]
        if re.match(r'^(pub(\([a-z]+\))? )?use ', s) and not s.endswith(';'):
            parts = [s]
            while i + 1 < len(lines) and not parts[-1].endswith(';'):
                i += 1
                parts.append(lines[i].strip())
            s = ' '.join(parts)
        out.append(s)
        i += 1
    return out


def prep(text, wave):
    """Normalized, filtered line list for one file."""
    raw = [VIS.sub('', l.strip()) for l in text.split('\n')]
    ls = join_use(raw)
    n = len(ls)

    def next_nonblank(i):
        j = i + 1
        while j < n and ls[j] == '':
            j += 1
        return ls[j] if j < n else ''

    def after_attrs(i):
        j = i + 1
        while j < n and (ls[j] == '' or ls[j].startswith('#[')):
            j += 1
        return ls[j] if j < n else ''

    def is_decl(s):
        return any(d.match(s) for d in DECL)

    out = []
    for i, s in enumerate(ls):
        if is_decl(s):
            continue
        if (s.startswith('#[cfg(') or s.startswith('#[cfg_attr(')) and is_decl(after_attrs(i)):
            continue
        if wave == 1 and s == CFG_ATTR_RPC and RPC_SIG.match(next_nonblank(i)):
            continue
        if wave == 5 and s == '#[cfg(test)]' and MOD_LINE.match(next_nonblank(i)):
            continue
        if not s or NOISE.match(s):
            continue
        if wave == 5:
            s = re.sub(r'include_str!\("(\.\./)+', 'include_str!("<UP>/', s)
        out.append(s)
    return out


def norm(files, wave):
    c = collections.Counter()
    for t in files.values():
        c.update(prep(t, wave))
    return c


ALLOW = {
    1: ([r'^RustInvokeChannel::\w+ => \{$', r'^shell_open::shell_(open_path|show_item_in_folder)\(app, args\)$'],
        [r'^RustInvokeChannel::\w+ => [\w:]+\([\w, ]*\),$', r'^//!( .*)?$', r'^fn rpc_\w+\([^)]*\) -> Result<Value, String> \{$']),
    2: ([], [r'^//!( .*)?$', r'^#\[cfg\(target_os = "macos"\)\]$']),  # 71-10: cfg on mod/use decls and duplicated child imports; per-item cfgs stay proven by Layer 3
}
IMPORT_WAVES = {2, 4, 5}


def layer1(b_files, n_files, wave):
    b, a = norm(b_files, wave), norm(n_files, wave)
    removed, added = +(b - a), +(a - b)
    rem_allow = [re.compile(x) for x in ALLOW.get(wave, ([], []))[0]]
    add_allow = [re.compile(x) for x in ALLOW.get(wave, ([], []))[1]]
    imports = []
    rb, ab = {}, {}
    for k, v in removed.items():
        if any(r.match(k) for r in rem_allow):
            continue
        if wave in IMPORT_WAVES and USE_LINE.match(k):
            imports.append(('-', v, k))
            continue
        rb[k] = v
    for k, v in added.items():
        if any(r.match(k) for r in add_allow):
            continue
        if wave in IMPORT_WAVES and USE_LINE.match(k):
            imports.append(('+', v, k))
            continue
        ab[k] = v
    return rb, ab, imports


# ---------------------------------------------------------------- layer 2
def snake(x):
    return re.sub(r'(?<!^)(?=[A-Z])', '_', x).lower()


def arm_bodies(text):
    lines = text.split('\n')
    arms = {}
    i = 0
    while i < len(lines):
        m = re.match(r'^        RustInvokeChannel::(\w+) => \{$', lines[i])
        if m:
            j = i + 1
            while j < len(lines) and lines[j] != '        }':
                j += 1
            arms[m.group(1)] = [l.strip() for l in lines[i + 1:j] if l.strip()]
            i = j
        i += 1
    return arms


def rpc_body(files, name):
    sig = re.compile(r'^(pub(\([a-z]+\))? )?(async )?fn rpc_' + re.escape(name) + r'\(')
    for t in files.values():
        lines = t.split('\n')
        for i, l in enumerate(lines):
            if sig.match(l):
                j = i
                while j < len(lines) and not lines[j].rstrip().endswith('{'):
                    j += 1
                k = j + 1
                while k < len(lines) and lines[k] != '}':
                    k += 1
                return [x.strip() for x in lines[j + 1:k] if x.strip()]
    return None


def layer2(b_files, n_files):
    holder = [t for t in b_files.values() if 'fn dispatch_rust_channel' in t]
    res = []
    if not holder:
        return [('(none)', 'MISMATCH: no file holds fn dispatch_rust_channel at REF')]
    arms = arm_bodies(holder[0])
    now_arms = set()
    for t in n_files.values():
        now_arms.update(arm_bodies(t).keys())
    for x, body in sorted(arms.items()):
        rb = rpc_body(n_files, snake(x))
        if rb is not None:
            res.append((x, 'matched' if rb == body else 'MISMATCH'))
        elif x in now_arms:
            res.append((x, 'still-inline'))
        elif x in SHELL_DIRECT:
            res.append((x, 'router-direct'))
        else:
            res.append((x, 'MISMATCH (arm gone, no fn rpc_%s)' % snake(x)))
    return res


# ---------------------------------------------------------------- layer 3
ITEM = re.compile(r'^(pub(\([a-z]+\))? )?(async )?(unsafe )?(extern "C" )?(const )?'
                  r'(fn|struct|enum|const|static|type|impl|mod|trait|macro_rules!|use)\b')


def split_items(text):
    L = text.split('\n')
    starts = [i for i, l in enumerate(L) if ITEM.match(l) or l.startswith('define_class!')]
    begins = []
    for i in starts:
        s = i
        while s > 0 and (L[s - 1].startswith('///') or L[s - 1].startswith('//') or L[s - 1].startswith('#[')):
            s -= 1
        begins.append(s)
    items = []
    for k, i in enumerate(starts):
        end = begins[k + 1] if k + 1 < len(starts) else len(L)
        header = L[i]
        body = L[begins[k]:end]
        h = header.strip()
        if re.match(r'^(pub(\([a-z]+\))? )?use\b', h):
            kind, name = 'use', h
        elif re.match(r'^(pub(\([a-z]+\))? )?mod \w+;$', h):
            continue
        elif h.startswith('define_class!'):
            kind, name = 'macro', h
        else:
            m = re.search(r'\b(fn|struct|enum|const|static|type|mod|trait|macro_rules!)\s+([A-Za-z_]\w*)', h)
            if m and not re.match(r'^(pub(\([a-z]+\))? )?(unsafe )?impl\b', h):
                kind, name = m.group(1), m.group(2)
            else:
                kind, name = 'impl', re.sub(r'\s*\{.*$', '', h)
        lines = [VIS.sub('', x.strip()) for x in body]
        lines = [x for x in lines if x]
        digest = hashlib.sha1('\n'.join(lines).encode()).hexdigest()[:12]
        items.append((kind, name, digest))
    return items


def target_files(files, stems):
    if isinstance(stems, str):
        stems = [stems]
    out = {}
    for n, t in files.items():
        rel = n[len(SRC) + 1:] if n.startswith(SRC + '/') else n
        if any(rel == stem + '.rs' or rel.startswith(stem + '/') for stem in stems):
            out[n] = t
    return out


def layer3(b_files, n_files, wave, stems=None):
    stem = stems or [WAVE_STEM[wave]]

    def ms(files):
        c = collections.Counter()
        review = []
        for n, t in sorted(target_files(files, stem).items()):
            for kind, name, d in split_items(t):
                if kind == 'use':
                    review.append(name)
                else:
                    c[(kind, name, d)] += 1
        return c, review

    (bc, br), (nc, nr) = ms(b_files), ms(n_files)
    return +(bc - nc), +(nc - bc), br, nr


# ---------------------------------------------------------------- driver
def run(base, now, wave, include_tests=False, require_all=False, out=print, stems=None):
    b, n = select(base, include_tests), select(now, include_tests)
    fail = False
    rb, ab, imports = layer1(b, n, wave)
    out(f'LAYER 1 wave {wave}: removed-not-allowed {sum(rb.values())}  added-not-allowed {sum(ab.values())}')
    for k, v in sorted(rb.items())[:80]:
        out(f'  - {v} {k[:160]}')
    for k, v in sorted(ab.items())[:80]:
        out(f'  + {v} {k[:160]}')
    if rb or ab:
        fail = True
    if imports:
        out('import lines (review):')
        for sign, v, k in sorted(imports, key=lambda x: x[2])[:120]:
            out(f'  {sign} {v} {k[:160]}')
    if wave == 1:
        res = layer2(b, n)
        cnt = collections.Counter(r for _, r in res)
        out('LAYER 2: ' + ', '.join(f'{k.split(" ")[0]}={v}' for k, v in sorted(cnt.items())))
        for x, r in res:
            if r.startswith('MISMATCH'):
                out(f'  {x}: {r}')
                fail = True
            elif r == 'still-inline' and require_all:
                out(f'  {x}: still-inline (--require-all)')
                fail = True
    if wave in WAVE_STEM:
        rem, add, br, nr = layer3(b, n, wave, stems)
        out(f'LAYER 3 ({"+".join(stems or [WAVE_STEM[wave]])}): items removed/changed {sum(rem.values())}  added/changed {sum(add.values())}')
        for k, v in sorted(rem.items()):
            out(f'  - {v} {k[0]} {k[1]} #{k[2]}')
        for k, v in sorted(add.items()):
            out(f'  + {v} {k[0]} {k[1]} #{k[2]}')
        if rem or add:
            fail = True
        if br != nr:
            out('use items (review):')
            for u in sorted(set(br) - set(nr)):
                out(f'  - {u[:160]}')
            for u in sorted(set(nr) - set(br)):
                out(f'  + {u[:160]}')
    out('MOVEPROOF ' + ('FAIL' if fail else 'PASS'))
    return 1 if fail else 0


# ---------------------------------------------------------------- self-test
def self_test():
    quiet = lambda *_: None

    def go(base, now, wave, **kw):
        return run(base, now, wave, out=quiet, **kw)

    # cutter
    src = ('fn a() {}\n// #[cfg(test)]\n    #[cfg(test)]\n    mod nope {\n    }\n'
           '#[cfg(test)]\nfn only_test_fn() {}\n'
           '#[cfg(test)]\nmod shell_open_tests {\n    fn t() {}\n}\nfn after() {}\n'
           '#[cfg(test)]\nmod tests {\n    use super::*;\n}\n')
    cut = cut_test_modules(src)
    assert 'shell_open_tests' not in cut and 'mod tests' not in cut and 'fn t()' not in cut
    assert 'fn after() {}' in cut and 'fn a() {}' in cut
    assert '// #[cfg(test)]' in cut and '    mod nope {' in cut and 'fn only_test_fn' in cut
    assert cut.count('#[cfg(test)]') == 3, cut  # comment, indented, non-mod item

    # pure move (waves 0), dropped line, duplicated line
    A = 'fn one() {\n    let x = 1;\n    let y = 2;\n}\nfn two() {\n    work();\n}\n'
    base = {'src-tauri/src/a.rs': A}
    moved = {'src-tauri/src/a.rs': 'mod b;\nfn one() {\n    let x = 1;\n    let y = 2;\n}\n',
             'src-tauri/src/b.rs': 'use super::*;\nfn two() {\n    work();\n}\n'}
    assert go(base, moved, 0) == 0, 'pure move must pass'
    dropped = {'src-tauri/src/a.rs': A.replace('    let y = 2;\n', '')}
    assert go(base, dropped, 0) == 1, 'dropped line must fail'
    duped = {'src-tauri/src/a.rs': A.replace('    let y = 2;\n', '    let y = 2;\n    let y = 2;\n')}
    assert go(base, duped, 0) == 1, 'duplicated line must fail'
    # D-05 lines: visibility, signature-free braces/indent changes pass
    vis = {'src-tauri/src/a.rs': A.replace('fn one', 'pub(crate) fn one').replace('    let', '        let')}
    assert go(base, vis, 0) == 0, 'visibility/indent changes must pass'

    # wave 1
    disp = ('pub(crate) fn dispatch_rust_channel(channel: &str, args: &[Value], app: &AppHandle) -> Result<Value, String> {\n'
            '    match ch {\n'
            '        // doc\n'
            '        RustInvokeChannel::Foo => {\n'
            '            let a = x(args)?;\n'
            '            Ok(json!(a))\n'
            '        }\n'
            '        RustInvokeChannel::ShellOpenPath => {\n'
            '            shell_open::shell_open_path(app, args)\n'
            '        }\n'
            '    }\n'
            '}\n')
    b1 = {'src-tauri/src/store_embed.rs': disp}
    disp2 = (disp.replace('        RustInvokeChannel::Foo => {\n            let a = x(args)?;\n            Ok(json!(a))\n        }\n',
                          '        RustInvokeChannel::Foo => rpc_foo(args),\n')
             .replace('        RustInvokeChannel::ShellOpenPath => {\n            shell_open::shell_open_path(app, args)\n        }\n',
                      '        RustInvokeChannel::ShellOpenPath => shell_open::shell_open_path(app, args),\n'))
    rpc = ('#[cfg_attr(not(target_os = "macos"), allow(unused_variables))]\n'
           'fn rpc_foo(args: &[Value]) -> Result<Value, String> {\n'
           '    let a = x(args)?;\n    Ok(json!(a))\n}\n')
    n1 = {'src-tauri/src/store_embed.rs': disp2, 'src-tauri/src/rpc.rs': 'use super::*;\n' + rpc}
    assert go(b1, n1, 1) == 0, 'wave-1 conversion must pass'
    n1bad = {'src-tauri/src/store_embed.rs': disp2,
             'src-tauri/src/rpc.rs': rpc.replace('Ok(json!(a))', 'Ok(json!(a + 1))')}
    assert go(b1, n1bad, 1) == 1, 'edited handler body must fail'
    r2 = layer2(select(b1, False), select(n1bad, False))
    assert dict(r2)['Foo'] == 'MISMATCH', r2
    # --require-all: a still-inline arm fails only with the flag
    part = {'src-tauri/src/store_embed.rs': disp.replace(
        '        RustInvokeChannel::ShellOpenPath => {\n            shell_open::shell_open_path(app, args)\n        }\n',
        '        RustInvokeChannel::ShellOpenPath => shell_open::shell_open_path(app, args),\n')}
    assert go(b1, part, 1) == 0 and go(b1, part, 1, require_all=True) == 1
    inline = {'src-tauri/src/store_embed.rs': disp}
    assert go(b1, inline, 1) == 0 and go(b1, inline, 1, require_all=True) == 1

    # layer 3 (wave 2)
    lw = ('/// doc\nfn alpha() {\n    one();\n}\nstruct S {\n    f: u8,\n}\nimpl S {\n    fn m(&self) {}\n}\n')
    b3 = {'src-tauri/src/login_window.rs': lw}
    n3 = {'src-tauri/src/login_window.rs': 'mod parts;\npub(crate) use parts::*;\n',
          'src-tauri/src/login_window/parts.rs': 'use super::*;\n' + lw}
    assert go(b3, n3, 2) == 0, 'item move must pass layer 3'
    n3bad = {'src-tauri/src/login_window.rs': 'mod parts;\n',
             'src-tauri/src/login_window/parts.rs': lw.replace('one();', 'two();')}
    assert go(b3, n3bad, 2) == 1, 'item body edit must fail'
    kh = '/// doc\nfn kh() {\n    one();\n}\n'
    b4 = {'src-tauri/src/login_window.rs': 'use super::*;\n' + kh}
    n4 = {'src-tauri/src/login_window.rs': 'use super::*;\n',
          'src-tauri/src/keyring_dispatch.rs': 'use super::*;\n' + kh}
    assert go(b4, n4, 2) == 1, 'cross-stem move must fail without --stem'
    assert run(b4, n4, 2, out=quiet, stems=['login_window', 'keyring_dispatch']) == 0, 'cross-stem move must pass with --stem'
    print('SELF-TEST PASS')
    return 0


def main(argv):
    if '--self-test' in argv:
        return self_test()
    args = {'wave': None, 'base': None}
    it = iter(argv)
    for a in it:
        if a == '--base':
            args['base'] = next(it)
        elif a == '--wave':
            args['wave'] = int(next(it))
        elif a == '--stem':
            args.setdefault('stems', []).append(next(it))
    if args['base'] is None or args['wave'] is None:
        print(__doc__)
        return 2
    return run(base_files(args['base']), now_files(), args['wave'],
               include_tests='--include-tests' in argv, require_all='--require-all' in argv, stems=args.get('stems'))


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
