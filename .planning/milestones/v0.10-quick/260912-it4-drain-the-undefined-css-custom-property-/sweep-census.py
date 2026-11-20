import re, subprocess, collections, sys

# Comment stripping is LOAD-BEARING, not hygiene. Without it,
# `PathSelectionBox/index.css:9` -- the prose "every colour is a
# `var(--token, fallback)`" inside that file's opening /* */ header -- is
# counted as a 23rd undefined name. It is not a reference at all. Mirrors
# `stripSourceComments` (src/backend/testUtils/stripSourceComments.ts):
# strip /* */ blocks FIRST, then drop only WHOLE lines that themselves begin
# with a comment marker -- never a naive /\/\/.*$/ pass, which would truncate
# a code line containing `url(https://...)`.
BLOCK_COMMENT = re.compile(r'/\*[\s\S]*?\*/')
LINE_COMMENT_ONLY = re.compile(r'^\s*(//|\*|/\*)')

def strip_comments(text):
    text = BLOCK_COMMENT.sub(lambda m: '\n' * m.group(0).count('\n'), text)
    return '\n'.join(
        '' if LINE_COMMENT_ONLY.match(line) else line
        for line in text.split('\n')
    )

def ls(*pats):
    out = subprocess.run(['git','ls-files']+list(pats), capture_output=True, text=True).stdout
    return [l for l in out.splitlines() if l]

decl_files = [f for f in ls('src/*','public/*') if f.rsplit('.',1)[-1] in ('css','scss','ts','tsx','js','html')]
ref_files  = [f for f in ls('src/*','public/*') if f.rsplit('.',1)[-1] in ('css','scss')]

declared = set()
for f in decl_files:
    t = strip_comments(open(f, encoding='utf-8', errors='replace').read())
    declared |= set(re.findall(r'(--[A-Za-z0-9_-]+)\s*:', t))
    # runtime setProperty('--x', ...)
    declared |= set(re.findall(r"""setProperty\(\s*['"`](--[A-Za-z0-9_-]+)""", t))

refs = collections.defaultdict(list)
# Scan the WHOLE stripped text, not line by line: prettier wraps long
# declarations, so `var(\n  --primary-button-hover,\n ...)` is a real
# reference that a per-line regex cannot see. That shape hid a 24th undefined
# name (themes.scss:596) from the original census. strip_comments preserves
# line count, so the offset -> line mapping below still points at the real line.
for f in ref_files:
    src = strip_comments(open(f, encoding='utf-8', errors='replace').read())
    for m in re.finditer(r'var\(\s*(--[A-Za-z0-9_-]+)', src):
        line_no = src.count('\n', 0, m.start(1)) + 1
        refs[m.group(1)].append(f'{f}:{line_no}')

missing = {k: v for k, v in refs.items() if k not in declared}
total = sum(len(v) for v in missing.values())
print(f'{total} references across {len(missing)} names\n')
for k in sorted(missing, key=lambda k: (-len(missing[k]), k)):
    print(f'{k}  x{len(missing[k])}')
    for s in missing[k]:
        print(f'    {s}')
