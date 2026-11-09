"""Spike 033: where does the main thread's time go during the splash freeze?
Pairs +relay Call/Ret lines on the game's main thread, finds the longest gap between SwapBuffers
calls (the freeze), and splits that window into time inside each TOP-LEVEL API call (as seen from
the game's code) vs time in the game's own code. usage: python3 -I relay_time.py <relay.cxlog>"""
import re, sys
from collections import defaultdict

path = sys.argv[1]
line_re = re.compile(r'^(\d+\.\d+):([0-9a-f]{4}):([0-9a-f]{4}):(Call|Ret)\s+([A-Za-z0-9_]+\.[A-Za-z0-9_@?]+)')
main = None
events = []  # (t, kind, name)
with open(path, 'rb') as fh:
    for raw in fh:
        if main is None and b'Reuben.exe" at' in raw and b'Loaded' in raw:
            p = raw.split(b':'); main = (p[1].decode(), p[2].decode())
            continue
        if main is None or b':Call ' not in raw and b':Ret  ' not in raw:
            continue
        m = line_re.match(raw.decode('latin-1'))
        if not m or (m.group(2), m.group(3)) != main:
            continue
        events.append((float(m.group(1)), m.group(4), m.group(5)))

swaps = [t for t, k, n in events if k == 'Call' and n.endswith('.SwapBuffers')]
gaps = sorted(((b - a, a, b) for a, b in zip(swaps, swaps[1:])), reverse=True)
if not gaps:
    sys.exit(f'main={main} events={len(events)} swaps={len(swaps)}: no frame gaps')
gap, w0, w1 = gaps[0]
print(f'main thread {main}; {len(events)} relay events; {len(swaps)} SwapBuffers; freeze window {gap:.2f}s')

stack, incl, cnt = [], defaultdict(float), defaultdict(int)
for t, kind, name in events:
    if kind == 'Call':
        stack.append((name, t))
        continue
    for i in range(len(stack) - 1, -1, -1):  # pop the matching frame (tolerate missing Rets)
        if stack[i][0] == name:
            n, t0 = stack[i]
            if i == 0:  # top-level call: time the GAME spent waiting on this API
                a, b = max(t0, w0), min(t, w1)
                if b > a:
                    incl[n] += b - a; cnt[n] += 1
            del stack[i:]
            break

api = sum(incl.values())
print(f'  inside top-level API calls: {api:6.2f}s ({100*api/gap:4.1f}%)   game code (no API call open): {gap-api:6.2f}s ({100*(gap-api)/gap:4.1f}%)')
for n, s in sorted(incl.items(), key=lambda kv: -kv[1])[:15]:
    print(f'    {s:7.3f}s  {cnt[n]:8d} calls  {n}')
