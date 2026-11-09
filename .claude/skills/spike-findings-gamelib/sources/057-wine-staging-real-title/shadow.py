"""Spike 057: build a shadow tree of a real install inside a target prefix.

Every entry is a symlink into the real install EXCEPT the directory chain leading to each shim
directory, which is made real so the shim + gamelib_bridge.cfg can be placed without touching the
real install (035's pattern). Usage: python3 -I shadow.py <src> <dst> <rel shim dir>...
"""
import os, sys

src, dst, shim_dirs = sys.argv[1], sys.argv[2], sys.argv[3:]
real = {""}
for d in shim_dirs:
    parts = [p for p in d.split("/") if p and p != "."]
    for i in range(1, len(parts) + 1):
        real.add("/".join(parts[:i]))

def mirror(rel):
    s, t = os.path.join(src, rel), os.path.join(dst, rel)
    os.makedirs(t, exist_ok=True)
    for name in os.listdir(s):
        r = f"{rel}/{name}" if rel else name
        tp = os.path.join(t, name)
        if r in real and os.path.isdir(os.path.join(s, name)):
            if os.path.islink(tp):
                os.unlink(tp)
            mirror(r)
        elif not os.path.lexists(tp):
            os.symlink(os.path.join(s, name), tp)

mirror("")
print(f"shadow tree: {dst} (real dirs: {sorted(real)})")
