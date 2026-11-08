#!/usr/bin/env python3
"""Move-proof for Phase 71. usage: moveproof.py <base-ref> [--allow allow.txt]
Layer 1: normalized line multiset, base-ref tree vs working tree, over src-tauri/src/**/*.rs.
Layer 2 (arm->handler): every RustInvokeChannel arm body at base equals the body of fn rpc_<wire> now."""
import re,subprocess,sys,pathlib,collections
BASE=sys.argv[1]
ROOT=pathlib.Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],text=True).strip())
SRC='src-tauri/src'
def base_files():
    names=subprocess.check_output(['git','ls-tree','-r','--name-only',BASE,SRC],text=True,cwd=ROOT).split()
    return {n:subprocess.check_output(['git','show',f'{BASE}:{n}'],text=True,cwd=ROOT) for n in names if n.endswith('.rs')}
def now_files():
    return {str(p.relative_to(ROOT)):p.read_text() for p in (ROOT/SRC).rglob('*.rs')}
VIS=re.compile(r'\bpub\((?:crate|super)\)\s+')
NOISE=re.compile(r'^[{}()\[\];,]*$')
def norm(files, skip=lambda n:False):
    c=collections.Counter()
    for n,t in files.items():
        if skip(n): continue
        for l in t.split('\n'):
            s=VIS.sub('',l.strip())
            if not s or NOISE.match(s): continue
            c[s]+=1
    return c
skip=lambda n: n.endswith('ipc_contract.rs')   # generated; checked by pnpm check:ipc-contract
b,a=norm(base_files(),skip),norm(now_files(),skip)
removed=+(b-a); added=+(a-b)
allow=[re.compile(x) for x in [
  r'^RustInvokeChannel::\w+ => \{$',                       # old arm openers (removed)
  r'^RustInvokeChannel::\w+ => rpc_\w+\(.*\),$',           # router lines (added)
  r'^(pub\(crate\) )?fn rpc_\w+\(.*\) -> Result<Value, String> \{$',  # handler signatures (added)
  r'^(#\[cfg.*\]\s*)?(pub )?mod \w+;$', r'^pub use \w+::\*;$', r'^use super::\*;$', r'^use \w+::\*;$',
  r'^#\[cfg\(test\)\]$', r'^mod tests \{$',
]]
def bad(c): return {k:v for k,v in c.items() if not any(r.match(k) for r in allow)}
rb,ab=bad(removed),bad(added)
print(f'removed-not-allowed: {sum(rb.values())}  added-not-allowed: {sum(ab.values())}')
for k,v in sorted(rb.items())[:80]: print('  -',v,k[:160])
for k,v in sorted(ab.items())[:80]: print('  +',v,k[:160])
sys.exit(1 if rb or ab else 0)
