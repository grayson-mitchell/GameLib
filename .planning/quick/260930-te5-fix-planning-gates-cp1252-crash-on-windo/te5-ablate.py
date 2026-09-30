#!/usr/bin/env python3
"""Ablation harness for quick 260930-te5: prove each of the three encoding edits in
.planning/planning-frontmatter-gate.py is load-bearing.

For each variant, a copy of the gate (with one edit removed, or none for the control) is written
to <tmp>/.planning/planning-frontmatter-gate.py and run as `--self-test` from the repo root under
`-X utf8=0` with PYTHONUTF8 / PYTHONIOENCODING scrubbed. Stdout and stderr are captured as BYTES.

Exit 0 only if the control is green and every ablation is red with its own marker. Exit 2 if the
host is a UTF-8-locale host, where ablations 1 and 3 are not observable (refuse rather than
report a vacuous green). Stdlib only; prints no paths and no environment.
"""

import os
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
GATE = REPO_ROOT / ".planning" / "planning-frontmatter-gate.py"
assert GATE.is_file(), "planning-frontmatter-gate.py not found under the resolved repo root"


def scrubbed_env() -> dict:
    env = dict(os.environ)
    env.pop("PYTHONUTF8", None)
    env.pop("PYTHONIOENCODING", None)
    return env


def host_is_utf8() -> bool:
    probe = subprocess.run(
        [
            sys.executable,
            "-X",
            "utf8=0",
            "-c",
            "import locale,sys;sys.stdout.write(locale.getpreferredencoding(False))",
        ],
        env=scrubbed_env(),
        capture_output=True,
    )
    answer = probe.stdout.decode("ascii", "replace").strip().lower()
    return answer in ("utf-8", "utf8")


def main() -> int:
    if host_is_utf8():
        print(
            "REFUSING: this host's preferred encoding is UTF-8, so ablations 1 and 3 are only "
            "observable on a non-UTF-8-locale host (e.g. Windows cp1252). Refusing rather than "
            "report a vacuous green."
        )
        return 2

    source = GATE.read_text(encoding="utf-8")

    # (name, old, new, expected marker bytes or None for the control)
    variants = [
        ("control", None, None, None),
        (
            "no-utf8-pipe",
            '        encoding="utf-8",\n        errors="strict",\n',
            "",
            b"parser transport (non-cp1252 round-trip)",
        ),
        (
            "no-setEncoding",
            'process.stdin.setEncoding("utf8");\n',
            "",
            b"parser transport (stdin chunk boundary)",
        ),
        (
            "no-stdout-backslashreplace",
            'sys.stdout.reconfigure(errors="backslashreplace")',
            "pass",
            b"UnicodeEncodeError",
        ),
    ]

    all_ok = True
    with tempfile.TemporaryDirectory() as tmp:
        planning = Path(tmp) / ".planning"
        planning.mkdir()
        copy = planning / "planning-frontmatter-gate.py"
        for name, old, new, marker in variants:
            text = source
            if old is not None:
                assert text.count(old) == 1, f"{name}: old text must occur exactly once"
                text = text.replace(old, new)
                assert text != source, f"{name}: ablation did not change the source"
            copy.write_text(text, encoding="utf-8", newline="")
            result = subprocess.run(
                [sys.executable, "-X", "utf8=0", str(copy), "--self-test"],
                cwd=REPO_ROOT,
                env=scrubbed_env(),
                capture_output=True,
                timeout=300,
            )
            if marker is None:
                expected = result.returncode == 0
                found = "n/a"
            else:
                found_bool = marker in result.stderr
                expected = result.returncode != 0 and found_bool
                found = "yes" if found_bool else "no"
            all_ok = all_ok and expected
            print(
                f"{name}: exit={result.returncode} marker_found={found} "
                f"{'OK' if expected else 'UNEXPECTED'}"
            )
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
