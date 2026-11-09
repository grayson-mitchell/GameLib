"""Spike 060: set the clone bottle's trial InstallTime dword (Software\\CodeWeavers\\CrossOver\\cxoffice).

Usage: python3 -I backdate.py <bottle dir> <value>
  <value> = 0xHEX (set exactly) | sub:<seconds> (original minus N) | xor-days:<days> (see README)
The wineserver must be stopped first (run.sh backdate does this) so the edit is not overwritten.
The original value is kept in <bottle>/InstallTime.orig on first use.
"""
import re, sys, pathlib

bottle, arg = pathlib.Path(sys.argv[1]), sys.argv[2]
reg = bottle / "system.reg"
s = reg.read_text()
m = re.search(r'(\[Software\\\\CodeWeavers\\\\CrossOver\\\\cxoffice\][^\[]*?"InstallTime"=dword:)([0-9a-f]{8})', s)
if not m:
    sys.exit("no InstallTime in system.reg -- run ./run.sh status first, then stop the wineserver")
orig_file = bottle / "InstallTime.orig"
if not orig_file.exists():
    orig_file.write_text(m.group(2))
orig = int(orig_file.read_text(), 16)
if arg.startswith("0x"):
    new = int(arg, 16)
elif arg.startswith("sub:"):
    new = (orig - int(arg[4:])) & 0xFFFFFFFF
else:
    sys.exit("value must be 0xHEX or sub:<seconds>")
reg.write_text(s[: m.start(2)] + f"{new:08x}" + s[m.end(2):])
print(f"InstallTime {m.group(2)} -> {new:08x} (orig {orig:08x})")
