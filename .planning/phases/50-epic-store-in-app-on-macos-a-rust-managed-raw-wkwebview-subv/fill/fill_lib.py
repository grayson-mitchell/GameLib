"""
Shared helpers for the Phase 50 plan 04 locale-fill scripts.

Both `preflight.py` and `write_fill.py` import this module so the
serialisation-combination detector and the order-preserving insertion logic
have exactly ONE implementation. Two independent copies could silently
drift and let `write_fill.py` commit something `preflight.py` would have
caught -- the same "single source of truth" principle `meta/lintTranslations.ts`
applies to `missingPairs()` (one derivation of "missing", reused by both the
live gate and the baseline writer).

Not listed in PLAN.md Task 1's <files> (`preflight.py`, `write_fill.py`
only) -- added as supporting infrastructure. Documented as a deviation in
50-04-SUMMARY.md.
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from typing import Optional

# .../fill/fill_lib.py -> parents[0]=fill, [1]=50-epic-...-wkwebview-subv,
# [2]=phases, [3]=.planning, [4]=REPO_ROOT.
REPO_ROOT = Path(__file__).resolve().parents[4]
PHASE_DIR = Path(__file__).resolve().parent
LOCALES_DIR = REPO_ROOT / "public" / "locales"
GLOSSARY_PATH = REPO_ROOT / "meta" / "i18nGlossary.json"
PROPOSED_PATH = PHASE_DIR / "proposed.json"
VALIDATE_BRIDGE_PATH = PHASE_DIR / "validate_bridge.ts"

# The six keys plan 03 minted into en/gamelib.json; this plan fills them
# into the 48 non-English catalogues. Derived once here so preflight.py and
# write_fill.py can never disagree on the key list.
NEW_KEYS = [
    "webview.epicEmbed.timeout.message",
    "webview.epicEmbed.timeout.reload",
    "webview.epicEmbed.launcherBlocked.message",
    "webview.unavailable.epic-challenged.heading",
    "webview.unavailable.epic-challenged.body",
    "webview.unavailable.epic-challenged.tryAgain",
]

# The two brand-new parent groups this fill inserts. Confirmed by direct
# grep (`grep -l epicEmbed public/locales/*/gamelib.json`, `grep -l
# epic-challenged ...`) that NEITHER group exists in ANY of the 48
# non-English catalogues today -- this is not a sibling-key insert, it is a
# whole-new-object insert at two points per locale.
NEW_GROUPS = [
    {"parent_path": "webview", "group_key": "epicEmbed"},
    {"parent_path": "webview.unavailable", "group_key": "epic-challenged"},
]

# Pinned per the plan's own callout: "Epic Games Launcher" in the D-14
# string is a product name the validator's generic glossary loop does not
# fully pin on its own ("Epic Games" and "Epic" are glossary terms; the
# three-word phrase is not), so it is checked as an explicit, additional
# invariant rather than relying on the generic mechanism alone.
PINNED_PHRASE_KEY = "webview.epicEmbed.launcherBlocked.message"
PINNED_PHRASE = "Epic Games Launcher"


def flatten(obj: dict, prefix: str = "") -> dict:
    out = {}
    for k, v in obj.items():
        kp = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.update(flatten(v, kp))
        else:
            out[kp] = v
    return out


def get_nested(obj: dict, dotted_key: str):
    cur = obj
    for p in dotted_key.split("."):
        if not isinstance(cur, dict) or p not in cur:
            return None
        cur = cur[p]
    return cur


def repo_relative(path: Path) -> str:
    return str(path.relative_to(REPO_ROOT)).replace("\\", "/")


def git_show_head(repo_rel_path: str) -> Optional[str]:
    """None if the path does not exist at HEAD (defensive; every target of
    this fill is pre-existing, so this should never actually return None
    for a real target)."""
    result = subprocess.run(
        ["git", "show", f"HEAD:{repo_rel_path}"],
        cwd=REPO_ROOT,
        capture_output=True,
    )
    if result.returncode != 0:
        return None
    return result.stdout.decode("utf-8")


# All plausible combinations the repo's own write paths could plausibly
# have used (machineFillGamelib.ts's two confirmed combos -- indent 4 for
# gamelib.json, indent 2 for gamelib.mt.json, both ensure_ascii=False with a
# trailing newline -- plus the adjacent combinations a careless rewrite
# could introduce, so a drifted file fails loudly instead of silently
# matching the wrong combo).
SERIALISATION_COMBOS = [
    (indent, ensure_ascii, trailing_newline)
    for indent in (2, 4)
    for ensure_ascii in (False, True)
    for trailing_newline in (True, False)
]


def detect_serialisation(text: str):
    """Returns the (indent, ensure_ascii, trailing_newline) combination
    under which re-dumping `json.loads(text)` reproduces `text`
    byte-for-byte, or None if no combination in SERIALISATION_COMBOS does."""
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return None
    for indent, ensure_ascii, trailing_newline in SERIALISATION_COMBOS:
        candidate = json.dumps(parsed, indent=indent, ensure_ascii=ensure_ascii)
        if trailing_newline:
            candidate += "\n"
        if candidate == text:
            return (indent, ensure_ascii, trailing_newline)
    return None


def serialise(obj, combo) -> str:
    indent, ensure_ascii, trailing_newline = combo
    text = json.dumps(obj, indent=indent, ensure_ascii=ensure_ascii)
    if trailing_newline:
        text += "\n"
    return text


def insertion_landing_point(existing_keys, new_key):
    """The first EXISTING key, in the object's OWN current iteration order
    (NOT a global sort), that sorts after `new_key` under Python's default
    string comparison. None means "append at the end" -- every existing key
    sorts at or before the new key. This is what lets a brand-new key land
    sensibly in a locale file whose own key order is not alphabetical,
    without ever reflowing that locale's existing order."""
    for k in existing_keys:
        if k > new_key:
            return k
    return None


def insert_before(obj: dict, new_key: str, new_value, landing_key) -> dict:
    """Rebuilds `obj` as a new dict with `new_key` inserted immediately
    before `landing_key` (or appended at the end if `landing_key` is None),
    preserving every existing key's position and value. Plain dict
    assignment can only ever append -- Python dicts have no "insert at
    position" primitive -- so this is the one place that actually moves the
    computed landing point into real key order."""
    result = {}
    inserted = False
    for k, v in obj.items():
        if not inserted and k == landing_key:
            result[new_key] = new_value
            inserted = True
        result[k] = v
    if not inserted:
        result[new_key] = new_value
    return result


def load_glossary_terms():
    return json.loads(GLOSSARY_PATH.read_text(encoding="utf-8"))["terms"]


def _escape_regexp(term: str) -> str:
    return re.escape(term)


def contains_term_source_presence(text: str, term: str) -> bool:
    """Mirrors `containsTermSourcePresence` in meta/machineFillGamelib.ts
    exactly: a term is "present in the source" only if it occurs with a
    non-[A-Za-z0-9_] boundary (or string edge) on BOTH sides. Case-sensitive,
    same as the TypeScript original."""
    pattern = r"(?<![A-Za-z0-9_])" + _escape_regexp(term) + r"(?![A-Za-z0-9_])"
    return re.search(pattern, text) is not None


def contains_term_verbatim(text: str, term: str) -> bool:
    """Mirrors `containsTermVerbatim` in meta/machineFillGamelib.ts exactly:
    only the LEADING boundary is checked (260903-ly4 relaxed the trailing
    one deliberately, to let inflected suffixes attach to a glossary term
    without failing survival). Case-sensitive."""
    pattern = r"(?<![A-Za-z0-9_])" + _escape_regexp(term)
    return re.search(pattern, text) is not None


def load_proposed():
    """Returns the proposed-translation table, or None if fill/proposed.json
    does not exist yet (Task 1's pre-flight run, before any translation is
    authored). Shape: {locale: {key: value}}."""
    if not PROPOSED_PATH.exists():
        return None
    return json.loads(PROPOSED_PATH.read_text(encoding="utf-8"))


def non_english_locales():
    """Derived from the directory listing every time -- never hard-coded,
    per the plan's explicit prohibition."""
    return sorted(
        p.name
        for p in LOCALES_DIR.iterdir()
        if p.is_dir() and p.name != "en"
    )


def run_validate_bridge(items, glossary):
    """Invokes the TypeScript bridge (validate_bridge.ts) which imports the
    GENUINE `validateTranslation` from meta/machineFillGamelib.ts and runs
    it once per item. `JEST_WORKER_ID` is set in the subprocess environment
    (not inside the .ts file -- ES import hoisting would make an in-file
    assignment too late) so machineFillGamelib.ts's own
    `if (!process.env.JEST_WORKER_ID) void main()` entrypoint guard never
    fires a real network call / filesystem write / process.exit.

    `items`: list of {"source": str, "target": str, "countOptional": bool}.
    Returns a list (same length/order as `items`) of problem-string lists.
    """
    import os

    payload = json.dumps({"glossary": glossary, "items": items})
    env = dict(os.environ)
    env["JEST_WORKER_ID"] = "1"
    result = subprocess.run(
        [
            "node",
            "meta/runTs.cjs",
            "--bundle",
            "--platform=node",
            "--target=node21",
            repo_relative(VALIDATE_BRIDGE_PATH),
        ],
        cwd=REPO_ROOT,
        input=payload.encode("utf-8"),
        capture_output=True,
        env=env,
    )
    if result.returncode != 0:
        raise RuntimeError(
            "validate_bridge.ts subprocess failed "
            f"(exit {result.returncode}): {result.stderr.decode('utf-8', 'replace')}"
        )
    return json.loads(result.stdout.decode("utf-8"))
