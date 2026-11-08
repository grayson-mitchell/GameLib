import re,sys
f=sys.argv[1]; lo=int(sys.argv[2]); hi=int(sys.argv[3])
L=open(f).read().split('\n')
pat=re.compile(r'^(pub(\([a-z]+\))? )?(async )?(unsafe )?(extern "C" )?(fn|struct|enum|const|static|type|impl|mod|trait|macro_rules!|use)\b|^#\[(tauri::command|path|cfg)')
items=[]
i=lo-1
while i<min(hi,len(L)):
    l=L[i]
    if re.match(r'^(pub(\([a-z]+\))? )?(async )?(unsafe )?(fn|struct|enum|const|static|type|impl|mod|trait|macro_rules!)\b',l) or l.startswith('define_class!') :
        # name
        m=re.search(r'(fn|struct|enum|const|static|type|mod|trait|impl(?:<[^>]*>)?)\s+([A-Za-z_][\w:<>]*)',l)
        name=(m.group(1)[:4]+' '+m.group(2)) if m else l[:40]
        s=i
        cfg=''
        while s>0 and (L[s-1].startswith('///') or L[s-1].startswith('#[') or L[s-1].startswith('//') ):
            if L[s-1].startswith('#[cfg'): cfg=L[s-1][:60]
            s-=1
        # find end: first line == '}' or ends with ';' at col0 after i
        e=i
        if l.rstrip().endswith('{') or l.rstrip().endswith('(') or not l.rstrip().endswith(';'):
            e=i
            while e<len(L) and not (re.match(r'^[})\]]',L[e]) and e>i): e+=1
            # handle one-line items
            if e>=len(L): e=len(L)-1
        items.append((s+1,e+1,name,cfg))
        i=e+1
    else: i+=1
for s,e,n,c in items: print(f"{s:5}-{e:5} {e-s+1:4} {n:50} {c}")
