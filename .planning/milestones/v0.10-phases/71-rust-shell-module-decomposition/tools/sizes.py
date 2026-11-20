#!/usr/bin/env python3
"""sizes.py [--max 1000] [--allow PATH=REASON ...]
Prints total and non-test line counts for every shell .rs (except ipc_contract.rs); OVER when non-test > max.
Exit 1 if any OVER path is not allowed. Allowed reasons are printed so SUMMARYs can quote them (D-13)."""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import moveproof  # noqa: E402


def main(argv):
    mx = 1000
    allow = {}
    it = iter(argv)
    for a in it:
        if a == '--max':
            mx = int(next(it))
        elif a == '--allow':
            p, _, reason = next(it).partition('=')
            allow[p] = reason
    r = moveproof.root()
    bad = False
    for p in sorted((r / moveproof.SRC).rglob('*.rs')):
        rel = str(p.relative_to(r))
        if rel.endswith('ipc_contract.rs'):
            continue
        text = p.read_text()
        total = len(text.split('\n')) - (1 if text.endswith('\n') else 0)
        prod = moveproof.cut_test_modules(text)
        nontest = len(prod.split('\n')) - (1 if prod.endswith('\n') else 0)
        mark = ''
        if nontest > mx:
            if rel in allow:
                mark = f'OVER (allowed: {allow[rel]})'
            else:
                mark = 'OVER'
                bad = True
        print(f'{rel:55} total={total:6} nontest={nontest:6} {mark}'.rstrip())
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
