import re,sys,glob,collections
# usage: vis.py <file> <cluster spec: name:start-end,...> [prodend]
f=sys.argv[1]
spec=[(c.split(':')[0],tuple(map(int,c.split(':')[1].split('-')))) for c in sys.argv[2].split(',')]
def cluster_of(n):
    for name,(a,b) in spec:
        if a<=n<=b: return name
    return None
files=glob.glob('*.rs')+glob.glob('wake_lock/*.rs')
def strip_comments(lines):
    out=[];inblock=False
    for l in lines:
        s=re.sub(r'//.*$','',l) if not re.search(r'"[^"]*//[^"]*"',l) else l
        out.append(s)
    return out
src={g:open(g).read().split('\n') for g in files}
code={g:strip_comments(src[g]) for g in files}
L=src[f]
items=[]
for i,l in enumerate(L):
    m=re.match(r'^(pub(?:\([a-z]+\))?\s+)?(?:async\s+)?(?:unsafe\s+)?(?:extern "C"\s+)?(fn|struct|enum|const|static|type|trait|mod)\s+([A-Za-z_]\w*)',l)
    if m:
        items.append((i+1,m.group(1) or '',m.group(2),m.group(3)))
    m=re.match(r'^\s*#\[cfg',l)
for ln,vis,kind,name in items:
    c=cluster_of(ln)
    if c is None: continue
    refs=collections.defaultdict(set)
    for g in files:
        for j,l in enumerate(code[g]):
            if g==f and j+1==ln: continue
            if re.search(r'(?<![\w])'+re.escape(name)+r'(?![\w])',l):
                if g==f:
                    cj=cluster_of(j+1)
                    if cj!=c and cj is not None: refs[g+':'+cj].add(j+1)
                elif g!='ipc_contract.rs':
                    # main.rs tests region excluded for prod ref (note)
                    refs[g].add(j+1)
    cross=[(k,sorted(v)[:3],len(v)) for k,v in refs.items()]
    if cross:
        print(f"{ln:5} [{c}] {vis or '(private)'+' ':14}{kind} {name}: " + '; '.join(f"{k}x{n}@{ls[0]}" for k,ls,n in cross))
