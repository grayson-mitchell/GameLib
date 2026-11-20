import struct, sys, datetime

MAC_EPOCH = datetime.datetime(2001,1,1,tzinfo=datetime.timezone.utc)

def cstr(buf, off):
    end = buf.index(b'\x00', off)
    return buf[off:end].decode('utf-8', 'replace')

def parse(path):
    d = open(path,'rb').read()
    assert d[:4] == b'cook', 'not a binarycookies file'
    npages = struct.unpack('>I', d[4:8])[0]
    sizes = struct.unpack('>%dI' % npages, d[8:8+4*npages])
    pos = 8 + 4*npages
    out = []
    for psize in sizes:
        page = d[pos:pos+psize]
        pos += psize
        ncook = struct.unpack('<I', page[4:8])[0]
        offs = struct.unpack('<%dI' % ncook, page[8:8+4*ncook])
        for o in offs:
            c = page[o:]
            size = struct.unpack('<I', c[:4])[0]
            c = c[:size]
            flags = struct.unpack('<I', c[8:12])[0]
            url_o, name_o, path_o, val_o = struct.unpack('<4I', c[16:32])
            exp, crt = struct.unpack('<2d', c[40:56])
            out.append(dict(
                domain=cstr(c, url_o), name=cstr(c, name_o),
                path=cstr(c, path_o), flags=flags,
                expiry=MAC_EPOCH + datetime.timedelta(seconds=exp),
                created=MAC_EPOCH + datetime.timedelta(seconds=crt),
            ))
    return out

recs = parse(sys.argv[1])
print("TOTAL LIVE RECORDS (index-walked):", len(recs))
from collections import defaultdict
by = defaultdict(list)
for r in recs: by[r['domain']].append(r)
for dom in sorted(by):
    names = sorted(x['name'] for x in by[dom])
    print(f"{dom:28} {len(names):3}  {' '.join(names)}")
print()
print("--- GOG / AMAZON records in detail (UTC) ---")
for r in recs:
    if 'gog.com' in r['domain'] or 'amazon' in r['domain']:
        print(f"  {r['domain']:22} {r['name']:20} created={r['created']:%Y-%m-%d %H:%M:%S}Z expires={r['expiry']:%Y-%m-%d %H:%M:%S}Z")
