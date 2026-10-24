import struct,sys
f=open(sys.argv[1],'rb')
def rd(off,n): f.seek(off); return f.read(n)
pe=struct.unpack('<I',rd(0x3c,4))[0]
nsec=struct.unpack('<H',rd(pe+6,2))[0]; optsz=struct.unpack('<H',rd(pe+20,2))[0]
opt=pe+24; magic=struct.unpack('<H',rd(opt,2))[0]; plus=magic==0x20b
dd=opt+(112 if plus else 96)
drva,dsz=struct.unpack('<II',rd(dd+13*8,8))
secs=[]
for i in range(nsec):
    s=rd(opt+optsz+i*40,40); vsz,va,rsz,ro=struct.unpack('<IIII',s[8:24]); secs.append((va,max(vsz,rsz),ro))
def off(rva):
    for va,sz,ro in secs:
        if va<=rva<va+sz: return rva-va+ro
def cstr(rva):
    o=off(rva); b=rd(o,256); return b.split(b'\0')[0].decode()
i=0
while True:
    d=struct.unpack('<8I',rd(off(drva)+i*32,32)); i+=1
    if d[1]==0: break
    name=cstr(d[1]); syms=[]
    if 'steam' in name.lower() or len(sys.argv)<3:
        p=off(d[4]); w=8 if plus else 4
        while True:
            e=struct.unpack('<Q' if plus else '<I',rd(p,w))[0]; p+=w
            if e==0: break
            if e>>(63 if plus else 31): syms.append('#%d'%(e&0xffff))
            else: syms.append(cstr(e+2))
    print(name,len(syms)); [print('  ',s) for s in syms]
