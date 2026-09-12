import re, subprocess, collections, sys

def ls(*pats):
    out = subprocess.run(['git','ls-files']+list(pats), capture_output=True, text=True).stdout
    return [l for l in out.splitlines() if l]

decl_files = [f for f in ls('src/*','public/*') if f.rsplit('.',1)[-1] in ('css','scss','ts','tsx','js','html')]
ref_files  = [f for f in ls('src/*','public/*') if f.rsplit('.',1)[-1] in ('css','scss')]

declared = set()
for f in decl_files:
    t = open(f, encoding='utf-8', errors='replace').read()
    declared |= set(re.findall(r'(--[A-Za-z0-9_-]+)\s*:', t))
    # runtime setProperty('--x', ...)
    declared |= set(re.findall(r"""setProperty\(\s*['"`](--[A-Za-z0-9_-]+)""", t))

refs = collections.defaultdict(list)
for f in ref_files:
    for i, line in enumerate(open(f, encoding='utf-8', errors='replace'), 1):
        for m in re.findall(r'var\(\s*(--[A-Za-z0-9_-]+)', line):
            refs[m].append(f'{f}:{i}')

missing = {k: v for k, v in refs.items() if k not in declared}
total = sum(len(v) for v in missing.values())
print(f'{total} references across {len(missing)} names\n')
for k in sorted(missing, key=lambda k: (-len(missing[k]), k)):
    print(f'{k}  x{len(missing[k])}')
    for s in missing[k]:
        print(f'    {s}')
