#!/usr/bin/env python3
"""YAML-frontmatter parse gate over `.planning/STATE.md`, `.planning/ROADMAP.md` (quick task
260911-ayu), and every phase VERIFICATION/UAT ledger `audit-uat` reads (quick task 260928-sph).

Purpose (read this before "fixing" a future failure the wrong way): `.planning/STATE.md`'s
frontmatter was not valid YAML for weeks. `last_activity` carried 2 raw, unescaped `"` characters
inside a double-quoted scalar, which terminated the scalar early and broke the mapping. Nine
green planning gates, every jest project, and `pnpm codecheck` were all blind to it, because
nothing in the repo had ever actually parsed that block -- it was only ever read as prose. This
gate is that parse. It exists so the *next* malformed frontmatter is caught in CI the day it
lands, not discovered by accident weeks later during an unrelated by-hand edit.

REQUIRED_STATE_KEYS below is the anti-vacuity core of this gate, not a nicety. Without a pinned
key list, the cheapest way to silence a future parse error is to delete the offending field
(`last_activity`) or empty it out (`last_activity: ""`) -- both make the document parse again,
and a gate that only checks "does it parse" would go green over either. Both are covered as
REJECT self-test cases below. NEVER shrink REQUIRED_STATE_KEYS to make a real failure go away;
fix the document instead.

PARSER CHOICE IS DELIBERATE. PyYAML is not installed and this repo has no Python dependency
management to add it to. `js-yaml` **4.1.1** is already resolved at `node_modules/js-yaml`
(declared in `package.json`'s `devDependencies` as `^4.1.1` by this same quick task, pinning
which of the two versions locked in `pnpm-lock.yaml` -- `3.14.2` and `4.1.1` -- hoists to the
root). js-yaml 3.x has different `load()` semantics, so this gate hard-fails, rather than
silently degrading, if the resolved major version is not 4. A hand-rolled YAML subset parser in
Python was considered and rejected: it would check something adjacent to "this file parses"
rather than the property itself, and the whole finding this gate closes is a check that was
adjacent to the truth.

FAILURES ARE LOUD, NEVER SKIPPED: if `node` is not on PATH, if `js-yaml` cannot be resolved, or
if the resolved major version is not 4, this gate FAILS the run -- it does not print a warning
and continue as if nothing needed checking. A gate that quietly skips on a missing dependency is
the exact fail-open shape this task exists to end (see `T-AYU-04` in the authoring plan).

TARGET POLICY: `.planning/STATE.md` is REQUIRED to have frontmatter that parses as a mapping
carrying every key in REQUIRED_STATE_KEYS, with `stopped_at` and `last_activity` additionally
required to be non-empty strings. `.planning/ROADMAP.md` is OPTIONAL -- it currently has no
frontmatter at all, and a gate that silently skips an optional target is itself a fail-open green
check, so its absence is reported by an explicit `NOTE:` line and counted separately in the
summary. "Skipped" must never be mistaken for "checked".

PHASE-LEDGER WALK (quick task 260928-sph). `.planning/STATE.md` and `.planning/ROADMAP.md` were
never the only frontmatter this project depends on: every phase `*-VERIFICATION.md`/`*-UAT.md`/
`*-HUMAN-UAT.md` ledger under `.planning/phases/*/` and the archived `.planning/milestones/*-
phases/*/` is read by `@opengsd/gsd-core`'s `audit-uat` (`~/.claude/gsd-core/bin/lib/`; outside
this repo, unversioned, and overwritten by the next gsd-core upgrade -- cite findings as "measured
against 1.14.0", not as a permanent fact). `38-VERIFICATION.md`'s frontmatter was invalid YAML from
2026-09-23 (`e09fbc652`/`aaae8a1d2`) until quick `260928-raq` repaired it on 2026-09-28: `uat.cjs`'s
`extractFrontmatter` returns `{}` on any parse error, so `status` read `undefined`, the
`human_needed`/`gaps_found` gate `parseVerificationItems` checks (`uat.cjs:206-212`) never opened,
and all 11 of that phase's open items silently vanished from `audit-uat`'s `by_phase` map -- no
error, no `parse_gap`, nothing that turned red. `uat.cjs:59`/`:203` select files by substring
(`-UAT`/`-VERIFICATION`), and `uat.cjs:84-123` scans the archived milestone dirs too -- this walk
mirrors both (find_phase_ledgers, DD-7), and found 89 files at the 2026-09-28 census (85 active,
4 archived). Unlike the UAT path (`uat.cjs:137-139,155`, which reads items from the BODY
regardless of frontmatter status and therefore fails safe), the VERIFICATION path is the one where
an unparseable frontmatter is silent data loss -- this is why the walk exists.

Verdict rules (`check_phase_ledger`, DD-2/DD-3/DD-4/DD-6): parse first, and NEVER excuse a failure
by status alone. A ledger that parses as a mapping is OK. A ledger that does not parse is FAIL,
unless it is PINNED in `KNOWN_UNPARSEABLE_TERMINAL` AND a SHAPE READ (`read_status_line`, not a
second parser) of its own column-0 `status:` line equals the pinned status -- then it is a `NOTE:`.
A ledger with no frontmatter fence at all is FAIL, unless pinned in `KNOWN_NO_FRONTMATTER` --
fix-by-deletion is exactly as cheap a way to silence a red gate as fix-by-relabel, and both are
guarded. PINS ONLY EVER SHRINK: a pinned path that no longer exists, now parses, or now has a
fence, FAILS with "stale pin -- remove it", and a pinned file whose shape-read status moves (even
to a DIFFERENT terminal status) FAILS rather than silently re-matching. The opening fence must
also be byte-exact (`---\n` or `---\r\n`, DD-6): a file whose first line strips to `---` but whose
bytes do not open that way would read as NO frontmatter under gsd-core's `frontmatterRegion` while
this gate's `.strip()`-based `extract_frontmatter` would still parse it -- a green-while-hidden
divergence. It convicts 0 files today (measured), but the check exists because "no one has hit it
yet" is not the same claim as "no one can".

`check_divergence_shapes()` (the STATE.md/ROADMAP.md check above) is deliberately NEVER applied to
ledgers (DD-5). Its premise is the retired get-shit-done-cc hand-rolled parser; gsd-core reads
ledgers through vendored js-yaml (`frontmatter.cjs:33`), for which a backslash-escaped `\"` and a
`|` block scalar read IDENTICALLY to this gate's own parse. Applying it would convict 10 ledgers
(19 problems) that are correct under the parser that actually reads them -- including
`38-VERIFICATION.md`'s own repair, which uses exactly the backslash-escaped-quote shape
`check_divergence_shapes` exists to reject. A gate convicting correct code is worse than a gate
that does not check that property at all.

SHAPE (1) IS REJECTED EVEN THOUGH GSD-CORE SOMETIMES RESCUES IT (DD-8). An unquoted plain scalar
containing a colon-space at COLUMN 0 -- the real `score:` shape from the incident -- is rescued by
gsd-core's own `loadWithAmbiguousColonRepair`/`repairAmbiguousColonValues`, which retries a failed
parse by double-quoting column-0 plain values containing `: `. Measured against the real pre-repair
bytes: the score-only defect spliced alone reads `status: "human_needed"` under gsd-core -- it did
NOT, by itself, hide Phase 38. The SAME shape one indentation level deeper (inside a list entry,
e.g. `result:`) is NOT rescued -- `loadWithAmbiguousColonRepair` never touches indented lines, and
it reads `undefined`. This is why the incident needed BOTH shapes: shape (1) alone was cosmetic;
shape (2) (an indented double-quoted scalar with an unescaped inner `"`) is what actually hid the
phase. This gate enforces the STRICT property -- parses under js-yaml 4, the same parser gsd-core
itself uses before any repair -- not "parses under a consumer's repair crutch", so it rejects shape
(1) at column 0 regardless of whether gsd-core would rescue that particular instance.
`39-VERIFICATION.md` is the live example: its lone unescaped-colon `status:` line is rescued by
gsd-core today, so it stays a pinned NOTE rather than being promoted to an OK -- a future session
must not "discover" that this gate is stricter than audit-uat and loosen it to match.

DIVERGENCE-SHAPE CHECK (quick task 260911-j88). Parsing under js-yaml is necessary but not
sufficient: the SDK's own consumers (`sdk/dist/query/frontmatter.js`'s hand-rolled
`parseFrontmatterYamlLines`, used by `gsd-sdk query frontmatter.get`, `audit-uat`, `progress`,
`state`, `phase-lifecycle`, and `workstream`) do not use js-yaml at all, and disagree with it on
specific known shapes. This gate's OWN self-test used to ACCEPT, as its positive control, a
document with both narrative fields written as `|-` block scalars -- exactly the shape that empties
those fields for every one of those consumers, because `parseFrontmatterYamlLines` has no
block-scalar support and returns the literal indicator string (`"|-"`), which
`phase-lifecycle.js:1122`'s `stopped_at:` + regex rewrite (`.` does not cross newlines) then uses
it to orphan every line beneath it. The positive control was the bug.

The fix is `check_divergence_shapes()`: a SHAPE-BASED check, not a second parser. It rejects a bare
block-scalar indicator (`|`, `|-`, `|+`, `>`, `>-`, `>+`, each optionally carrying a digit indent
indicator and/or a trailing comment) as a key's value, and a double-quoted scalar containing a
backslash-escaped `\"` (js-yaml unescapes it; the SDK strips only the *surrounding* quotes and
keeps the backslashes -- a different string reaches every consumer). It is deliberately NOT a port
of `parseFrontmatterYamlLines` and does NOT `require()` the installed SDK: the SDK resolves to an
npx-cache path with a content-hash directory name
(`~/.npm/_npx/<hash>/node_modules/get-shit-done-cc/`) that is neither committed to this repo nor
present in CI, so requiring it would make this gate fail-open (silently skip when the path is
absent) or fail-spuriously (break on an unrelated cache eviction); a vendored COPY would silently
drift from the real parser over time, and the gate would then be asserting agreement with a
fiction it no longer matches -- the same "adjacent to the truth" failure this gate exists to end
(see the PARSER CHOICE note above).

The positive control is now a single-line, single-quoted document -- the shape `STATE.md` ships
today. Single-quoting has exactly ONE known divergence from js-yaml, and it is deliberately
ACCEPTED rather than rejected: an apostrophe is written doubled (`''`) inside a single-quoted
scalar; js-yaml folds it back to one apostrophe, the SDK's hand-rolled parser does not, so the
SDK's read carries one extra character per apostrophe (368 vs 367 chars on the live `stopped_at`
field today -- the entire price of this convention). Rejecting `''` would convict `STATE.md` as it
stands today for a one-character divergence with no `phase-lifecycle.js`-style data-loss
consequence -- a gate can convict correct code, and this one must not.

THE LIMIT, STATED EXPLICITLY: `check_divergence_shapes` catches three known shapes on two named
targets (`STATE.md`, `ROADMAP.md`) only -- it CANNOT catch a divergence shape nobody has found yet,
and it deliberately does NOT run against the 89 phase ledgers (DD-5, above). The phase-ledger walk
added by quick `260928-sph` is narrower still, by design: it checks parse validity, fence
byte-exactness, and status (via a shape read, never a second parser) -- nothing more. It does NOT
check ledger BODIES for divergence shapes; a UAT file's items are read from the body regardless of
frontmatter status (`uat.cjs:137-139,155`), so that surface is audit-uat's own concern, not this
gate's. It does NOT refuse YAML anchors, aliases, or the U+E000 sentinel the way gsd-core's own
`parseGuardedYamlRegion` does (DD-9) -- measured 2026-09-28, no ledger uses any of the three today,
and all 80 active parseable ledgers read the same `status` under both parsers, so this is a stated
limit rather than an implemented one. And everything else under `.planning/` outside `STATE.md`,
`ROADMAP.md`, and these 89 ledgers remains entirely unwalked by any gate in this file. A gate that
implied it caught "frontmatter divergence" in general, rather than these specific known shapes on
these specific targets, would overstate its own reach -- which is worse than a narrow, honestly-
scoped check.

THE SELF-TEST FIXTURE CARRIES REAL HISTORICAL BYTES, HASH-GUARDED. `HISTORICAL_EXCERPT` below is
a 90-byte window sliced out of the actual pre-fix `last_activity` line (extracted
programmatically from git history during this task's planning and authoring, never retyped from
a terminal render). Before any self-test case uses it, its own sha256 is asserted against
`HISTORICAL_EXCERPT_SHA256`. This matters because a rendered dump of this exact region was
independently observed, twice, silently dropping a substring during this task's planning session
-- a fixture corrupted that way must fail this gate loudly (wrong hash) rather than silently test
different bytes than the ones that actually broke the file.

Run `python3 planning-frontmatter-gate.py` (no arguments) for CI mode: self-test first, then walk
the live targets, write nothing. This is the path `meta/runPlanningGates.py` invokes -- discovery
is by `*-gate.py` suffix with no arguments, so the no-argument path has to be the real check. Run
`python3 planning-frontmatter-gate.py --self-test` to run only the self-test.
"""

from __future__ import annotations

import contextlib
import hashlib
import io
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# Resolved from __file__, NEVER from cwd: `meta/runPlanningGates.py` runs each gate with the
# gate's own directory as cwd, but a human runs it from the repo root. __file__ is correct under
# both. Asserted explicitly (not just implied by the constant below) so that repointing this gate
# at a different directory is a deliberate, visible edit and not a one-word slip.
PLANNING_DIR = Path(__file__).resolve().parent
assert PLANNING_DIR.name == ".planning", (
    "PLANNING_DIR must resolve to exactly the repo's .planning/ directory -- repointing this "
    "gate elsewhere must be a deliberate, visible edit, not a typo"
)

# (relative-to-PLANNING_DIR path, required: bool). STATE.md is required; ROADMAP.md is optional
# (see docstring, D-AYU-04 in the authoring plan). This table is the single source of truth for
# what the live walk checks -- widening it is how a future session adds a third target.
TARGETS: tuple[tuple[str, bool], ...] = (
    ("STATE.md", True),
    ("ROADMAP.md", False),
)

# The anti-vacuity core (see docstring). Deleting a key from this list to make a real failure go
# away defeats the entire purpose of this gate -- fix the document, not the check.
REQUIRED_STATE_KEYS: tuple[str, ...] = (
    "gsd_state_version",
    "status",
    "stopped_at",
    "last_activity",
    "last_updated",
    "progress",
)
# Of REQUIRED_STATE_KEYS, these two are additionally required to be non-empty strings -- they are
# the narrative fields a future by-hand append is most likely to corrupt or delete.
NON_EMPTY_STRING_KEYS: tuple[str, ...] = ("stopped_at", "last_activity")

# ---------------------------------------------------------------------------
# Phase VERIFICATION/UAT ledger walk (quick task 260928-sph). See the module docstring's
# PHASE-LEDGER WALK section for the incident and the audit-uat mechanism this closes.
# ---------------------------------------------------------------------------

# Statuses at which gsd-core's audit-uat opens a VERIFICATION file and reads its
# human_verification array. A parse failure at either status silently drops the whole
# phase's open items from the audit -- this is the incident (uat.cjs:206-212, measured
# against @opengsd/gsd-core 1.14.0; that file is outside this repo, unversioned, and moves
# on the next gsd-core upgrade).
OPEN_VERIFICATION_STATUSES: tuple[str, ...] = ("human_needed", "gaps_found")

# 2026-09-28 census: 85 active ledgers under phases/*/ plus 4 archived under
# milestones/v0.1-phases/*/ = 89. A walk below this floor means the glob broke (a directory
# rename, a moved .planning tree), not that ledgers were legitimately deleted -- the same
# tight-floor convention meta/runPlanningGates.py's MINIMUM_EXPECTED_GATES uses (DD-7).
MINIMUM_PHASE_LEDGERS = 89

# NEVER add a pin to either table below to make a real failure go away -- fix the ledger.
# Pins only ever shrink; a stale pin (the file no longer exists, now parses, or now has a
# fence) FAILS loudly rather than silently disappearing (DD-4).

# (path relative to PLANNING_DIR as a posix string, reason). Ledgers with NO frontmatter
# fence at all. audit-uat still reads UAT body items regardless of status (uat.cjs:137-
# 139,155), so these two are not incidents today -- but a NEW no-fence file is not
# automatically safe, hence pinned by name rather than exempted by shape.
KNOWN_NO_FRONTMATTER: tuple[tuple[str, str], ...] = (
    (
        "phases/30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check/30-HUMAN-UAT.md",
        "prose results doc; audit-uat reads its 15 items from the body regardless (uat.cjs:155)",
    ),
    (
        "phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-EMBED-API-VERIFICATION.md",
        "a D-25 crate-source verdict doc, not a verify-phase ledger",
    ),
)

# (path relative to PLANNING_DIR as a posix string, pinned status). Ledgers whose
# frontmatter does not parse but whose status is TERMINAL (never human_needed/gaps_found),
# so audit-uat never opens them today. The pinned status is cross-checked against a SHAPE
# READ of the file's own column-0 `status:` line -- a pinned file whose status silently
# moves still FAILS (DD-2). This is the ledger analogue of REQUIRED_STATE_KEYS above.
KNOWN_UNPARSEABLE_TERMINAL: tuple[tuple[str, str], ...] = (
    (
        "phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md",
        "complete",
    ),
    (
        "phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/34.4.1-VERIFICATION.md",
        "passed",
    ),
    (
        "phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/39-VERIFICATION.md",
        "passed",
    ),
)

assert not any(status in OPEN_VERIFICATION_STATUSES for _, status in KNOWN_UNPARSEABLE_TERMINAL), (
    "a pinned unparseable-terminal status must never be an OPEN status -- pinning an "
    "open-status file as terminal would hide it exactly like the incident this gate exists "
    "to close (DD-4)"
)
_LEDGER_NO_FM_PATHS = {p for p, _ in KNOWN_NO_FRONTMATTER}
_LEDGER_UNPARSEABLE_PATHS = {p for p, _ in KNOWN_UNPARSEABLE_TERMINAL}
assert not (_LEDGER_NO_FM_PATHS & _LEDGER_UNPARSEABLE_PATHS), (
    "a path must not be pinned in both KNOWN_NO_FRONTMATTER and KNOWN_UNPARSEABLE_TERMINAL "
    "-- a ledger either has no fence or has one that fails to parse, never both (DD-4)"
)

# Shape read (NOT a parser -- see read_status_line's own docstring) of a whole column-0
# `status:` line: an optional matching single or double quote around an `[A-Za-z_]+` value,
# tied to its opener via a backreference, and an optional trailing ` #comment`.
STATUS_LINE_RE = re.compile(r'^status:\s*(?P<q>["\']?)(?P<value>[A-Za-z_]+)(?P=q)(?:\s+#.*)?$')

# 90-byte windows sliced from the REAL pre-repair `38-VERIFICATION.md`
# (`git show 0801e07eb^:.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md`),
# before quick `260928-raq`'s syntax repair. Extracted programmatically, never retyped --
# see the docstring's note on HISTORICAL_EXCERPT above for why a hand-rendered dump of a
# region like this is not to be trusted, and why both are sha256-guarded before use.
#
# Score excerpt: the first `score:` line's unquoted plain scalar, sliced starting at the
# substring `11 relocated items OPEN`. Contains the `2026-09-23: ` colon-space shape (real
# incident shape 1) and 0 double quotes.
LEDGER_SCORE_EXCERPT = (
    "11 relocated items OPEN, 15 discharged (sitting 1, 2026-09-23: `38-S06` PASS, `38-S08` FAI"
)
LEDGER_SCORE_EXCERPT_SHA256 = "d96828c5d2f03bf0081cdd1fe83feaa08d5f4800c66d395511cf7e8092bdc853"

# Result excerpt: the `38-S08` `result:` line's double-quoted scalar, sliced starting at the
# substring `the viewport centre as`. Contains 3 raw double quotes (real incident shape 2).
LEDGER_RESULT_EXCERPT = (
    'the viewport centre as `cls":"selectFieldWrapper Field "` (the library dropdown) where eve'
)
LEDGER_RESULT_EXCERPT_SHA256 = "07fa7b5a6a446b4867c45d1d544267a5954faf7bddda04ef8988893c2bf4fa6e"

FENCE = "---"

# 90-byte window sliced from the REAL pre-fix `last_activity` line (file line 8 of
# `.planning/STATE.md` before quick task 260911-ayu, commit 712a7b31d), centered on the second of
# its two raw unescaped double quotes. Extracted programmatically; see docstring for why it is
# hash-guarded before use.
HISTORICAL_EXCERPT = 'terion 3: the arm64 leg concluded failure at "Build the three onedir runners"; x64 never d'
HISTORICAL_EXCERPT_SHA256 = "013b12366fdb0eb74fe955da8e76b3d97d9a9b811aa8bccf2e18027fc11087fb"

# Invoked via `subprocess.run([node, "-e", NODE_YAML_PARSE_JS], input=<frontmatter text>,
# capture_output=True, text=True, encoding="utf-8", errors="strict")` -- argv list, no shell,
# frontmatter text on stdin, one JSON object on stdout. Both ends of the pipe declare UTF-8:
# Windows' text-mode default is the ANSI code page (cp1252), which would crash on or silently
# mangle non-ASCII in either direction, and the node end uses setEncoding so a character split
# across a stdin chunk boundary is carried over rather than replaced with U+FFFD. Taking the document on stdin (rather than as an argv string or a temp file)
# is what lets the self-test's synthetic documents go through the exact same parse path as the
# real target files -- there is no separate "test mode" in the parser itself.
NODE_YAML_PARSE_JS = r"""
const y = require("js-yaml");
let s = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", d => { s += d; });
process.stdin.on("end", () => {
  let version = "<unresolved>";
  try {
    version = require("js-yaml/package.json").version;
  } catch (e) {
    process.stdout.write(JSON.stringify({ resolved: false, error: String(e && e.message || e) }));
    return;
  }
  const out = { resolved: true, version };
  try {
    out.ok = true;
    out.value = y.load(s);
  } catch (e) {
    out.ok = false;
    out.error = e.message;
  }
  process.stdout.write(JSON.stringify(out));
});
"""


def fail(message: str) -> None:
    print(f"GATE FAILED: {message}", file=sys.stderr)
    sys.exit(1)


def find_node() -> str:
    """Loud failure, never a skip, if node is not on PATH (D-AYU-02, T-AYU-04)."""
    node = shutil.which("node")
    if node is None:
        fail(
            "`node` is not on PATH -- this gate requires node to invoke js-yaml. A gate that "
            "skips its check because a dependency is missing is exactly the fail-open shape "
            "this gate exists to end."
        )
    return node  # unreachable after fail(), but keeps type-checkers honest


def run_parser(node: str, frontmatter_text: str) -> dict:
    """Invoke the node/js-yaml helper on one block of frontmatter text. Loud failure, never a
    skip, if js-yaml is unresolvable or resolves to a major version other than 4 (D-AYU-02,
    T-AYU-01, T-AYU-04). Returns the parsed JSON dict on any other outcome (including a YAML
    parse error, which is a normal, expected result this function must be able to return)."""
    result = subprocess.run(
        [node, "-e", NODE_YAML_PARSE_JS],
        input=frontmatter_text,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="strict",
    )
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        fail(
            "the node/js-yaml helper did not emit parseable JSON -- this is an infrastructure "
            f"failure, not a YAML parse error. stdout={result.stdout!r} stderr={result.stderr!r}"
        )
        return {}  # unreachable

    if not data.get("resolved"):
        fail(
            "js-yaml is not resolvable from node -- this gate requires it. Check the `js-yaml` "
            "entry in package.json's devDependencies (should be `^4.1.1`) and re-run "
            f"`pnpm install`. Underlying error: {data.get('error')}"
        )

    version = data.get("version", "")
    major = version.split(".")[0] if version else ""
    if major != "4":
        fail(
            f"js-yaml resolved to version {version or '<unknown>'} (major {major or '?'}), not "
            "4.x. This gate requires js-yaml 4's `load()` semantics -- 3.x behaves differently "
            "and this gate must not silently run against it. Check the `js-yaml` entry in "
            "package.json's devDependencies (should be `^4.1.1`) and re-run `pnpm install`."
        )
    return data


def extract_frontmatter(text: str) -> str | None:
    """Return the raw text BETWEEN the opening `---` fence and the NEXT `---` fence, or None if
    the document has no well-formed frontmatter block. A `---` occurring later in the BODY (a
    markdown horizontal rule) must not re-open or extend the block -- only the first two fences
    delimit frontmatter. An unterminated block (opening fence, no closing fence before EOF) is
    NOT a frontmatter block. Pure: no I/O, usable against both real files and self-test strings.
    """
    lines = text.split("\n")
    if not lines or lines[0].strip() != FENCE:
        return None
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == FENCE:
            return "\n".join(lines[1:i])
    return None


def check_required_keys(value: dict) -> list[str]:
    """Pure function: given an already-parsed mapping, return every anti-vacuity problem found
    ([] if clean). Reports every problem in one pass rather than stopping at the first."""
    problems: list[str] = []
    for key in REQUIRED_STATE_KEYS:
        if key not in value:
            problems.append(f"missing required key `{key}`")
    for key in NON_EMPTY_STRING_KEYS:
        if key in value:
            v = value[key]
            if not isinstance(v, str) or v.strip() == "":
                problems.append(f"`{key}` must be a non-empty string, got {v!r}")
    return problems


# Matches a frontmatter key line, INCLUDING list-item keys (`- test: "..."`), capturing the
# value with trailing whitespace stripped. Pure regex, not a YAML parser -- this is deliberately a
# SHAPE check (see docstring), not a second implementation of the real thing.
KEY_LINE_RE = re.compile(r"^\s*(?:-\s+)?[A-Za-z0-9_-]+:\s*(.*?)\s*$")

# A value that IS, exactly, a block-scalar indicator: `|` or `>`, optionally `+`/`-`, optionally a
# single digit indent indicator, optionally a trailing ` #comment`. Anchored on both ends so a `|`
# INSIDE a quoted value (`note: "a | b"`) cannot match -- the value must be exactly the indicator.
BLOCK_SCALAR_INDICATOR_RE = re.compile(r"^[|>][+-]?[0-9]?(?:\s+#.*)?$")


def check_divergence_shapes(frontmatter_text: str) -> list[str]:
    """Pure function: given raw frontmatter TEXT (not the parsed value -- these are shapes in the
    source bytes, not properties of the parsed result), return every known SDK-divergence problem
    found ([] if clean). Reports every problem in one pass rather than stopping at the first.

    Rejects two shapes (see docstring for why each is a real divergence, and why it is a shape
    check rather than a second parser):
      - a bare block-scalar indicator (`|`, `|-`, `|+`, `>`, `>-`, `>+`) as a key's value -- the
        SDK's parser has no block-scalar support and yields the literal indicator string.
      - a double-quoted scalar containing a backslash-escaped `\\"` -- js-yaml unescapes it, the
        SDK's parser strips only the surrounding quotes and keeps the backslashes.

    Deliberately does NOT reject a single-quoted scalar containing `''` (a doubled apostrophe).
    That divergence is real (js-yaml folds it to one apostrophe, the SDK does not) but it is the
    convention this repo has chosen, already live in STATE.md today -- convicting it would convict
    correct code (T5 in the authoring plan).
    """
    problems: list[str] = []
    for lineno, line in enumerate(frontmatter_text.split("\n"), start=1):
        match = KEY_LINE_RE.match(line)
        if not match:
            continue
        value = match.group(1)
        if not value:
            continue
        if BLOCK_SCALAR_INDICATOR_RE.match(value):
            problems.append(
                f"line {lineno}: value is a bare block-scalar indicator {value!r} -- the SDK's "
                f"hand-rolled parser has no block-scalar support and returns the literal "
                f"indicator string {value!r}; phase-lifecycle.js:1122's `stopped_at:\\s*.+` "
                "rewrite (`.` does not cross newlines) then orphans every line beneath it"
            )
            continue
        if len(value) >= 2 and value[0] == '"' and value[-1] == '"' and '\\"' in value[1:-1]:
            problems.append(
                f'line {lineno}: double-quoted scalar contains a backslash-escaped \\" -- '
                "js-yaml unescapes it, but the SDK's parser strips only the surrounding quotes "
                "and keeps the backslashes -- a different string reaches every SDK consumer"
            )
    return problems


def check_document(text: str, required: bool, node: str, label: str) -> tuple[bool, str]:
    """Pure except for the injected `run_parser` call. The SAME function is used against every
    real target file and every self-test document -- never a reimplementation. Returns (passed,
    one-line report message)."""
    fm = extract_frontmatter(text)
    if fm is None:
        if required:
            return False, f"{label} — REQUIRED target has NO frontmatter block"
        return (
            True,
            f"NOTE: {label} — NO frontmatter block (optional target, nothing parsed).",
        )

    data = run_parser(node, fm)
    if not data.get("ok"):
        return False, f"{label} — frontmatter does NOT parse: {data.get('error')}"

    value = data.get("value")
    if not isinstance(value, dict):
        return (
            False,
            f"{label} — frontmatter parsed but is NOT a mapping (got a "
            f"{type(value).__name__ if value is not None else 'null/empty document'})",
        )

    fm_line_count = len(fm.split("\n"))

    # Divergence-shape check runs for BOTH required and optional targets, and BEFORE the
    # `not required` early return -- an optional target that skips this check is the fail-open
    # shape this check exists to end (T6 in the authoring plan).
    divergence_problems = check_divergence_shapes(fm)
    if divergence_problems:
        return (
            False,
            f"{label} — frontmatter parses, but diverges from what the SDK's own parser reads: "
            + "; ".join(divergence_problems),
        )

    if not required:
        return (
            True,
            f"OK: {label} — frontmatter ({fm_line_count} lines) parses as a mapping with "
            f"{len(value)} key(s); free of known SDK-divergence shapes.",
        )

    problems = check_required_keys(value)
    if problems:
        return False, f"{label} — frontmatter parses, but: " + "; ".join(problems)

    stopped_at_len = len(value["stopped_at"])
    last_activity_len = len(value["last_activity"])
    return (
        True,
        f"OK: {label} — frontmatter ({fm_line_count} lines) parses as a mapping with "
        f"{len(value)} keys; all {len(REQUIRED_STATE_KEYS)} required keys present; "
        f"stopped_at {stopped_at_len} chars, last_activity {last_activity_len} chars; "
        "free of known SDK-divergence shapes.",
    )


def find_phase_ledgers(planning_dir: Path) -> list[Path]:
    """Walk phase-ledger directories and return every file gsd-core's audit-uat would treat
    as a phase VERIFICATION/UAT ledger: name ends `.md` and contains `-UAT` or
    `-VERIFICATION`, mirroring `uat.cjs:59`/`:203`'s substring selection. Walks BOTH
    `phases/*/` and archived `milestones/*-phases/*/`, one level deep, because audit-uat
    scans archives too (`uat.cjs:84-123`, DD-7). Takes `planning_dir` as a PARAMETER, never
    the module global, so the self-test's scan-level floor case can point this at an empty
    temp directory without touching the real tree."""
    phase_dirs: list[Path] = []

    phases_root = planning_dir / "phases"
    if phases_root.is_dir():
        phase_dirs.extend(p for p in phases_root.iterdir() if p.is_dir())

    milestones_root = planning_dir / "milestones"
    if milestones_root.is_dir():
        for milestone_dir in milestones_root.iterdir():
            if milestone_dir.is_dir() and milestone_dir.name.endswith("-phases"):
                phase_dirs.extend(p for p in milestone_dir.iterdir() if p.is_dir())

    found: list[Path] = []
    for phase_dir in phase_dirs:
        for candidate in phase_dir.iterdir():
            if (
                candidate.is_file()
                and candidate.name.endswith(".md")
                and ("-UAT" in candidate.name or "-VERIFICATION" in candidate.name)
            ):
                found.append(candidate)

    return sorted(found)


def read_status_line(frontmatter_text: str) -> str | None:
    """SHAPE READ, not a parser: apply STATUS_LINE_RE to the frontmatter REGION line by
    line (never the body -- callers must pass only the text between the fences). Returns
    the lowercased value when EXACTLY ONE line matches. Returns None for zero matches or
    for more than one -- an ambiguous status line must fail closed, never guess."""
    matches = [
        m.group("value").lower()
        for line in frontmatter_text.split("\n")
        for m in (STATUS_LINE_RE.match(line),)
        if m is not None
    ]
    if len(matches) == 1:
        return matches[0]
    return None


def check_phase_ledger(
    text: str,
    node: str,
    label: str,
    pinned_no_frontmatter: bool = False,
    pinned_status: str | None = None,
) -> tuple[bool, str]:
    """The SAME function used by the live phase-ledger walk (check_phase_ledgers) and every
    `ledger:` self-test case -- never a reimplementation, echoing check_document's own rule
    above. Returns (passed, one-line report message).

    Verdict order:
      (a) no opening `---` fence at all -> NOTE if pinned_no_frontmatter, else FAIL: audit-
          uat reads no status from a fenceless file, and deleting the fence to silence a
          parse failure is not a fix (DD-3).
      (b) pinned_no_frontmatter but a fence now exists -> FAIL, stale pin.
      (c) fence exists but the file does not open with a byte-exact `---\\n` or `---\\r\\n`
          -> FAIL (DD-6): gsd-core's frontmatterRegion would read NO frontmatter here at all
          -- a green-while-hidden divergence.
      (d) opening fence with no closing fence before EOF (unterminated) -> FAIL. This NEVER
          NOTEs: an unterminated block has no frontmatter region left to shape-read.
      (e) parses as a mapping -> FAIL if pinned_status (it parses now, stale pin), else OK,
          reporting the parsed status. Parses but is NOT a mapping -> FAIL regardless of pin.
      (f) does not parse -> shape-read the status via read_status_line.
          - not pinned: FAIL, including the js-yaml error and the shape-read status; if that
            status is open, say explicitly this is the shape that hid Phase 38.
          - pinned: shape status None or != the pin -> FAIL (a pinned file's status silently
            moving is exactly the incident class). shape status == pin -> NOTE.

    check_divergence_shapes is deliberately NEVER called here (DD-5): its premise is the
    retired get-shit-done-cc hand-rolled parser, and applying it to ledgers would convict 10
    of them (19 problems), including `38-VERIFICATION.md`'s own repair.
    """
    lines = text.split("\n")
    has_opening_fence = bool(lines) and lines[0].strip() == FENCE

    if not has_opening_fence:
        if pinned_no_frontmatter:
            return (
                True,
                f"NOTE: {label} — pinned no-frontmatter (audit-uat reads it by body content, "
                "not by status).",
            )
        return (
            False,
            f"{label} — phase ledger has NO frontmatter block at all; audit-uat reads no "
            "status from it, and deleting the fence to silence a parse failure is not a fix.",
        )

    if pinned_no_frontmatter:
        return (
            False,
            f"{label} — pinned in KNOWN_NO_FRONTMATTER, but a `---` fence now exists in this "
            "file -- stale pin, remove it.",
        )

    if not (text.startswith("---\n") or text.startswith("---\r\n")):
        return (
            False,
            f"{label} — the opening fence does not begin the file with a byte-exact "
            "`---\\n` or `---\\r\\n` -- gsd-core's frontmatterRegion would read NO "
            "frontmatter here at all (a green-while-hidden divergence, DD-6).",
        )

    fm = extract_frontmatter(text)
    if fm is None:
        return (
            False,
            f"{label} — opening `---` fence with no closing fence before EOF (unterminated "
            "frontmatter block).",
        )

    data = run_parser(node, fm)
    if data.get("ok"):
        value = data.get("value")
        if not isinstance(value, dict):
            return (
                False,
                f"{label} — frontmatter parsed but is NOT a mapping (got a "
                f"{type(value).__name__ if value is not None else 'null/empty document'}).",
            )
        if pinned_status is not None:
            return (
                False,
                f"{label} — pinned in KNOWN_UNPARSEABLE_TERMINAL as {pinned_status!r}, but "
                "its frontmatter now parses -- stale pin, remove it.",
            )
        status = str(value.get("status")).lower()
        return (True, f"OK: {label} — frontmatter parses as a mapping; status: {status}.")

    # Does not parse. Shape-read the status from the frontmatter region only.
    shape_status = read_status_line(fm)

    if pinned_status is None:
        open_note = ""
        if shape_status in OPEN_VERIFICATION_STATUSES:
            open_note = (
                " This is the EXACT shape that hid Phase 38 from audit-uat (2026-09-23 "
                "until quick 260928-raq's repair): an open-status ledger whose frontmatter "
                "does not parse silently drops the whole phase from the audit."
            )
        return (
            False,
            f"{label} — frontmatter does NOT parse: {data.get('error')} (shape-read status: "
            f"{shape_status!r}).{open_note}",
        )

    if shape_status is None or shape_status != pinned_status:
        return (
            False,
            f"{label} — pinned in KNOWN_UNPARSEABLE_TERMINAL as {pinned_status!r}, but a "
            f"shape read of its status now returns {shape_status!r} -- a pinned file whose "
            "status silently moved is exactly the incident class this gate exists to close.",
        )

    return (
        True,
        f"NOTE: {label} — pinned unparseable-terminal at status {pinned_status!r}; "
        "audit-uat never opens a VERIFICATION file at a terminal status.",
    )


def check_phase_ledgers(planning_dir: Path, node: str) -> list[tuple[bool, str]]:
    """Scan-level driver. First checks that every pinned path still exists (a stale
    existence pin fails loudly rather than silently vanishing from the walk); then walks the
    tree via find_phase_ledgers and enforces the anti-vacuity floor (DD-7) -- a walk that
    finds nothing must FAIL, not silently pass over zero files; then runs check_phase_ledger
    per discovered file, looking pins up by POSIX path relative to planning_dir (never
    basename, so a same-named file in a different phase directory cannot inherit a pin)."""
    results: list[tuple[bool, str]] = []

    for rel, _ in KNOWN_NO_FRONTMATTER:
        if not (planning_dir / rel).is_file():
            results.append(
                (
                    False,
                    f"{rel} — pinned in KNOWN_NO_FRONTMATTER but the file no longer exists "
                    "(stale pin -- remove it).",
                )
            )
    for rel, _ in KNOWN_UNPARSEABLE_TERMINAL:
        if not (planning_dir / rel).is_file():
            results.append(
                (
                    False,
                    f"{rel} — pinned in KNOWN_UNPARSEABLE_TERMINAL but the file no longer "
                    "exists (stale pin -- remove it).",
                )
            )

    ledgers = find_phase_ledgers(planning_dir)
    if len(ledgers) < MINIMUM_PHASE_LEDGERS:
        fail(
            f"phase-ledger walk found only {len(ledgers)} file(s) under "
            f"{planning_dir / 'phases'} and {planning_dir / 'milestones'}/*-phases, below "
            f"the floor of {MINIMUM_PHASE_LEDGERS}. A walk that finds nothing (or too "
            "little) must not pass -- either ledgers were deleted, or the discovery glob "
            "no longer matches them."
        )

    no_fm_pins = dict(KNOWN_NO_FRONTMATTER)
    unparseable_pins = dict(KNOWN_UNPARSEABLE_TERMINAL)

    for path in ledgers:
        rel = path.relative_to(planning_dir).as_posix()
        text = path.read_text(encoding="utf-8")
        results.append(
            check_phase_ledger(
                text,
                node,
                label=str(path),
                pinned_no_frontmatter=rel in no_fm_pins,
                pinned_status=unparseable_pins.get(rel),
            )
        )

    return results


# ---------------------------------------------------------------------------
# Self-test. Every case is discharged through check_document / extract_frontmatter, the SAME
# functions used against the real tree, never a reimplementation.
# ---------------------------------------------------------------------------

VALID_STATE_DOCUMENT = (
    "---\n"
    "gsd_state_version: 1\n"
    "status: ACTIVE\n"
    "stopped_at: 'a plain narrative sentence with a raw \"quote\" inside it and it''s got an "
    "apostrophe too'\n"
    f"last_activity: '{HISTORICAL_EXCERPT}'\n"
    "last_updated: 2026-09-11\n"
    "progress:\n"
    "  total_phases: 39\n"
    "  current_phase: 43\n"
    "---\n"
    "\n"
    "# Body\n"
)

# The repaired form quick `260928-raq` actually shipped for `38-VERIFICATION.md`: a
# single-quoted `score:`, a backslash-escaped double-quoted `result:`, and an `expected: |`
# block scalar. It must ACCEPT -- and it proves DD-5, because `check_divergence_shapes`
# above (STATE.md's own divergence check) would convict BOTH the backslash-escaped `\"` and
# the bare `|` block-scalar indicator if it were ever run against this document. It is not.
_LEDGER_RESULT_ESCAPED = LEDGER_RESULT_EXCERPT.replace('"', '\\"')

VALID_LEDGER_DOCUMENT = (
    "---\n"
    "phase: 38-deferred-hardware-and-environment-uat-gates-windows-linux-ma\n"
    "status: human_needed\n"
    f"score: '{LEDGER_SCORE_EXCERPT}'\n"
    "human_verification:\n"
    '  - id: "38-S08"\n'
    f'    result: "{_LEDGER_RESULT_ESCAPED}"\n'
    "    expected: |\n"
    "      A read-only platform row; library dropdown present; wine section absent; free-\n"
    "      space line present. All four checked independently.\n"
    "---\n"
    "\n"
    "# Body\n"
)


def mutate(base: str, old: str, new: str, why: str) -> str:
    """Route EVERY mutation of VALID_STATE_DOCUMENT through here (T1 in the authoring plan). If
    the document's shape changes and an anchor string is left stale, `str.replace()` silently
    no-ops and hands a REJECT case an UNMUTATED, still-valid document -- a real check quietly
    turned vacuous. Fails loudly, instead, in both failure modes:
      - `old` is not present in `base` at all (the anchor was missed), or
      - the replacement produced no change (old == new, a copy-paste slip).
    """
    if old not in base:
        fail(
            f"mutate() anchor missed ({why}): {old!r} was not found in the base document -- this "
            "would silently hand a REJECT case an UNMUTATED, still-valid document instead of the "
            "intended mutation"
        )
    result = base.replace(old, new, 1)
    if result == base:
        fail(f"mutate() produced no change ({why}) -- `old` and `new` were identical")
    return result


def _case_reject(label: str, text: str, required: bool, node: str) -> None:
    passed, message = check_document(text, required, node, label="<self-test>")
    if passed:
        fail(f"self-test FAILED: {label} did NOT reject bad input -- gate vacuous on this check")
    print(f"  self-test OK: {label} correctly rejected ({message})")


def _case_accept(label: str, text: str, required: bool, node: str) -> None:
    passed, message = check_document(text, required, node, label="<self-test>")
    if not passed:
        fail(
            f"self-test FAILED: {label} was WRONGLY rejected ({message!r}) -- gate convicts "
            "correct input"
        )
    print(f"  self-test OK: {label} correctly accepted ({message})")


def _ledger_reject(label: str, text: str, node: str, **pins) -> None:
    passed, message = check_phase_ledger(text, node, label=label, **pins)
    if passed:
        fail(
            f"self-test FAILED: ledger: {label} did NOT reject bad input -- gate vacuous on "
            "this check"
        )
    print(f"  self-test OK: ledger: {label} correctly rejected ({message})")


def _ledger_accept(label: str, text: str, node: str, expect_prefix: str, **pins) -> None:
    passed, message = check_phase_ledger(text, node, label=label, **pins)
    if not passed:
        fail(
            f"self-test FAILED: ledger: {label} was WRONGLY rejected ({message!r}) -- gate "
            "convicts correct input"
        )
    if not message.startswith(expect_prefix):
        fail(
            f"self-test FAILED: ledger: {label} passed but with an unexpected message shape "
            f"({message!r}) -- expected it to start with {expect_prefix!r}. An OK where a "
            "NOTE was expected (or vice versa) is a distinct regression, not a pass."
        )
    print(f"  self-test OK: ledger: {label} correctly accepted ({message})")


def self_test() -> None:
    node = find_node()

    assert hashlib.sha256(HISTORICAL_EXCERPT.encode("utf-8")).hexdigest() == (
        HISTORICAL_EXCERPT_SHA256
    ), (
        "HISTORICAL_EXCERPT does not match its pinned sha256 -- a rendered dump of this exact "
        "region was observed, twice, silently dropping a substring during this gate's own "
        "authoring session. Re-extract the fixture from git history; do not retype it by hand."
    )
    print("  self-test OK: HISTORICAL_EXCERPT matches its pinned sha256 (fixture not corrupted)")

    case_count = 1  # the hash assertion above counts as case 1

    # Transport pins: the node pipe must round-trip text exactly. Case A is a non-cp1252
    # round-trip (U+2014 is cp1252-encodable, but used to reach node as invalid UTF-8); Case B is
    # a stdin chunk-boundary round-trip (a multi-byte character split across ~64 KiB chunks).
    # Only a non-UTF-8-locale host can see Case A fail; ubuntu CI encodes UTF-8 either way.
    transport_chars = "\u2192 \u2715 \u2500 \u26a0 \u2014"
    transport_doc = 'k: "' + transport_chars + '"\n'
    case_count += 1
    try:
        transport_data = run_parser(node, transport_doc)
    except UnicodeError as exc:
        fail(
            "self-test FAILED: parser transport (non-cp1252 round-trip) -- the node pipe is not "
            f"declaring UTF-8 ({exc.__class__.__name__})."
        )
    if not transport_data.get("ok") or transport_data.get("value") != {"k": transport_chars}:
        fail(
            "self-test FAILED: parser transport (non-cp1252 round-trip) -- round-trip was not "
            f"exact, got {ascii(transport_data.get('value', transport_data.get('error')))}."
        )
    print(
        "  self-test OK: parser transport round-trips U+2192 U+2715 U+2500 U+26A0 U+2014 "
        "exactly"
    )

    big_count = 100000
    big_doc = 'k: "' + "\u2192" * big_count + '"\n'
    case_count += 1
    try:
        big_data = run_parser(node, big_doc)
    except UnicodeError as exc:
        fail(
            "self-test FAILED: parser transport (stdin chunk boundary) -- the node pipe is not "
            f"declaring UTF-8 ({exc.__class__.__name__})."
        )
    big_value = (big_data.get("value") or {}).get("k") if big_data.get("ok") else None
    if not isinstance(big_value, str) or len(big_value) != big_count or "\ufffd" in big_value:
        big_len = len(big_value) if isinstance(big_value, str) else None
        big_bad = big_value.count("\ufffd") if isinstance(big_value, str) else "n/a"
        fail(
            "self-test FAILED: parser transport (stdin chunk boundary) -- expected length "
            f"{big_count} with 0 U+FFFD, got length {big_len} with {big_bad} U+FFFD."
        )
    print(f"  self-test OK: parser transport stdin chunk boundary ({big_count} x U+2192, 0 U+FFFD)")

    def reject(label: str, text: str, required: bool = True) -> None:
        nonlocal case_count
        case_count += 1
        _case_reject(label, text, required, node)

    def accept(label: str, text: str, required: bool = True) -> None:
        nonlocal case_count
        case_count += 1
        _case_accept(label, text, required, node)

    def ledger_reject(label: str, text: str, **pins) -> None:
        nonlocal case_count
        case_count += 1
        _ledger_reject(label, text, node, **pins)

    def ledger_accept(label: str, text: str, expect_prefix: str, **pins) -> None:
        nonlocal case_count
        case_count += 1
        _ledger_accept(label, text, node, expect_prefix, **pins)

    # Sanity: the base document must pass clean before it is mutated into bad input below.
    accept("sanity (base valid STATE-shaped document)", VALID_STATE_DOCUMENT)

    # Case: the REAL historical defect, real bytes -- a raw-quoted scalar carrying the exact
    # excerpt that broke STATE.md for weeks.
    reject(
        "the real historical defect: raw quotes inside a double-quoted last_activity scalar",
        mutate(
            VALID_STATE_DOCUMENT,
            f"last_activity: '{HISTORICAL_EXCERPT}'\n",
            f'last_activity: "{HISTORICAL_EXCERPT}"\n',
            "historical raw-quote defect case",
        ),
    )

    # Case: a minimal synthetic raw-quote scalar, human-readable, exercising the same parser rule
    # without depending on the historical fixture.
    reject(
        "minimal synthetic raw-quote scalar",
        '---\ngsd_state_version: 1\nstatus: ACTIVE\n'
        'stopped_at: "clean"\n'
        'last_activity: "a "b" c"\n'
        'last_updated: 2026-09-11\nprogress:\n  total_phases: 39\n---\n',
    )

    # Case: the NEW trap D-AYU-01's `|-` form introduces -- a continuation line un-indented back
    # to column 0. Must be covered from day one, not discovered the way the original defect was.
    reject(
        "|- block scalar with an un-indented (column-0) continuation line",
        "---\ngsd_state_version: 1\nstatus: ACTIVE\n"
        "stopped_at: |-\nnot indented\n"
        'last_activity: "clean"\n'
        "last_updated: 2026-09-11\nprogress:\n  total_phases: 39\n---\n",
    )

    # Case: duplicate top-level key (js-yaml 4 throws on this natively, M-10).
    reject(
        "duplicate top-level key",
        "---\ngsd_state_version: 1\ngsd_state_version: 2\nstatus: ACTIVE\n"
        'stopped_at: "clean"\nlast_activity: "clean"\n'
        "last_updated: 2026-09-11\nprogress:\n  total_phases: 39\n---\n",
    )

    # Case: tab-indented mapping entry (YAML forbids tabs for indentation).
    reject(
        "tab-indented mapping entry",
        "---\ngsd_state_version: 1\nstatus:\n\tACTIVE: true\n"
        'stopped_at: "clean"\nlast_activity: "clean"\n'
        "last_updated: 2026-09-11\nprogress:\n  total_phases: 39\n---\n",
    )

    # Case: frontmatter that parses cleanly but is not a mapping at all (a bare list).
    reject(
        "frontmatter that parses but is not a mapping (bare list)",
        "---\n- one\n- two\n- three\n---\n",
    )

    # Case: the fix-by-deletion control -- a STATE-shaped document with `last_activity` removed
    # entirely. This is the cheapest way a future session could make a parse error "go away", and
    # it must still fail.
    reject(
        "STATE-shaped document with `last_activity` deleted entirely",
        "---\ngsd_state_version: 1\nstatus: ACTIVE\n"
        'stopped_at: "clean"\n'
        "last_updated: 2026-09-11\nprogress:\n  total_phases: 39\n---\n",
    )

    # Case: the fix-by-emptying control -- `last_activity: ""`. Parses fine as YAML; must still
    # fail because the anti-vacuity key check requires a non-empty string.
    reject(
        "STATE-shaped document with `last_activity: \"\"` (emptied, not deleted)",
        "---\ngsd_state_version: 1\nstatus: ACTIVE\n"
        'stopped_at: "clean"\nlast_activity: ""\n'
        "last_updated: 2026-09-11\nprogress:\n  total_phases: 39\n---\n",
    )

    # Case: the positive control for the whole fix (D1) -- a valid STATE-shaped document, single-
    # line SINGLE-QUOTED narrative fields, one carrying a raw `"` AND an apostrophe doubled as
    # `''`. This is the shape STATE.md ships today; `|-` blocks are now a REJECT case below, not
    # the positive control.
    accept(
        "valid STATE-shaped document, single-line single-quoted narrative fields (STATE.md's "
        "live shape) -- raw quote and doubled-apostrophe divergence both present and accepted",
        VALID_STATE_DOCUMENT,
    )

    # Case: a document with NO frontmatter at all, target OPTIONAL (ROADMAP.md's real shape).
    accept(
        "document with no frontmatter block at all, optional target",
        "# ROADMAP\n\nJust prose, no frontmatter.\n",
        required=False,
    )

    # Case: D1's flip -- `|-` is now a REJECT, not the positive control. Real SDK/phase-lifecycle
    # consequence named in the failure message itself (see check_divergence_shapes docstring).
    reject(
        "last_activity as a |- block scalar (the SDK's hand-rolled parser has no block-scalar "
        "support and returns the literal '|-'; phase-lifecycle.js:1122's regex rewrite then "
        "orphans everything beneath it)",
        mutate(
            VALID_STATE_DOCUMENT,
            f"last_activity: '{HISTORICAL_EXCERPT}'\n",
            f"last_activity: |-\n  {HISTORICAL_EXCERPT}\n",
            "|- block scalar divergence case",
        ),
    )

    # Case: the `>-` folded-scalar sibling of the same divergence.
    reject(
        "last_activity as a >- folded scalar (same SDK/phase-lifecycle consequence as |-)",
        mutate(
            VALID_STATE_DOCUMENT,
            f"last_activity: '{HISTORICAL_EXCERPT}'\n",
            f"last_activity: >-\n  {HISTORICAL_EXCERPT}\n",
            ">- folded scalar divergence case",
        ),
    )

    # Case: a double-quoted scalar with backslash-escaped `\"` -- js-yaml unescapes it, the SDK's
    # parser keeps the backslashes, so the two parsers read different strings.
    reject(
        'last_activity as a double-quoted scalar with a backslash-escaped \\" (js-yaml unescapes '
        "it; the SDK's parser strips only the surrounding quotes and keeps the backslashes)",
        mutate(
            VALID_STATE_DOCUMENT,
            f"last_activity: '{HISTORICAL_EXCERPT}'\n",
            'last_activity: "an escaped \\"quote\\" inside a double-quoted scalar"\n',
            "backslash-escaped-quote divergence case",
        ),
    )

    # Case: the divergence check is NOT gated on `required` -- an OPTIONAL target carrying a
    # block scalar must still fail (T6). If this ever accepts, the check has regressed to only
    # running on required targets, which is the fail-open shape it exists to end.
    reject(
        "block scalar in an OPTIONAL target (proves the divergence check runs regardless of "
        "`required`)",
        "---\nnote: |-\n  optional-target narrative that must still be rejected\n---\n",
        required=False,
    )

    # Case: the ONE divergence this repo deliberately keeps -- a single-quoted scalar containing
    # `''` (a doubled apostrophe). js-yaml folds it to one apostrophe, the SDK's parser does not,
    # but that costs one character and is the live convention (T5) -- must NOT be convicted.
    accept(
        "single-quoted scalar containing '' (doubled apostrophe) -- the one divergence this repo "
        "deliberately keeps, matching STATE.md's live stopped_at shape -- must not be convicted",
        "---\ngsd_state_version: 1\nstatus: ACTIVE\n"
        "stopped_at: 'it''s a clean sentence with a doubled apostrophe'\n"
        'last_activity: "clean"\n'
        "last_updated: 2026-09-11\nprogress:\n  total_phases: 39\n---\n",
    )

    # ---------------------------------------------------------------------------------
    # Phase VERIFICATION/UAT ledger self-test (quick task 260928-sph). Every case below is
    # discharged through check_phase_ledger -- the SAME function the live walk uses -- via
    # the ledger_reject/ledger_accept closures above.
    # ---------------------------------------------------------------------------------

    case_count += 1
    assert hashlib.sha256(LEDGER_SCORE_EXCERPT.encode("utf-8")).hexdigest() == (
        LEDGER_SCORE_EXCERPT_SHA256
    ), (
        "LEDGER_SCORE_EXCERPT does not match its pinned sha256 -- re-extract the fixture "
        "programmatically from `git show 0801e07eb^:...38-VERIFICATION.md`; do not retype it."
    )
    print(
        "  self-test OK: ledger: LEDGER_SCORE_EXCERPT matches its pinned sha256 (fixture "
        "not corrupted)"
    )

    case_count += 1
    assert hashlib.sha256(LEDGER_RESULT_EXCERPT.encode("utf-8")).hexdigest() == (
        LEDGER_RESULT_EXCERPT_SHA256
    ), (
        "LEDGER_RESULT_EXCERPT does not match its pinned sha256 -- re-extract the fixture "
        "programmatically from `git show 0801e07eb^:...38-VERIFICATION.md`; do not retype it."
    )
    print(
        "  self-test OK: ledger: LEDGER_RESULT_EXCERPT matches its pinned sha256 (fixture "
        "not corrupted)"
    )

    # Case: the repaired form quick 260928-raq actually shipped -- single-quoted score,
    # backslash-escaped double-quoted result, `expected: |` block scalar. Proves DD-5: this
    # is the exact shape check_divergence_shapes would convict (bare `|` and `\"`), and this
    # ledger walk never calls it.
    ledger_accept(
        "repaired form (0801e07eb): single-quoted score, backslash-escaped result, "
        "`expected: |` block scalar -- proves DD-5",
        VALID_LEDGER_DOCUMENT,
        expect_prefix="OK:",
    )

    # Case: incident shape 1, real pre-repair bytes -- an unquoted plain `score:` scalar at
    # column 0 containing a colon-space (`2026-09-23: `).
    ledger_reject(
        "incident shape 1 (real pre-repair bytes): unquoted plain `score:` scalar "
        "containing a colon-space, column 0",
        mutate(
            VALID_LEDGER_DOCUMENT,
            f"score: '{LEDGER_SCORE_EXCERPT}'\n",
            f"score: {LEDGER_SCORE_EXCERPT}\n",
            "ledger incident shape 1",
        ),
    )

    # Case: incident shape 2, real pre-repair bytes -- a double-quoted, indented `result:`
    # scalar with unescaped inner double quotes.
    _shape2_broken_human_needed = mutate(
        VALID_LEDGER_DOCUMENT,
        f'    result: "{_LEDGER_RESULT_ESCAPED}"\n',
        f'    result: "{LEDGER_RESULT_EXCERPT}"\n',
        "ledger incident shape 2",
    )
    ledger_reject(
        "incident shape 2 (real pre-repair bytes): double-quoted `result:` scalar with "
        "unescaped inner double quotes, indented",
        _shape2_broken_human_needed,
    )

    # Case: shape 1 INDENTED -- the score excerpt (carrying the same colon-space) as an
    # unquoted plain `result:` value inside the list entry, rather than at column 0.
    # Measured at planning time: gsd-core's column-0 repairAmbiguousColonValues does NOT
    # rescue this indented variant (it reads `undefined`, DD-8) -- this case proves the
    # gate rejects the shape even where gsd-core cannot read a status from it at all.
    ledger_reject(
        "shape 1 INDENTED: score excerpt as an unquoted plain `result:` value inside the "
        "list entry (gsd-core's column-0 repair does NOT rescue this indented variant, "
        "measured `undefined`)",
        mutate(
            VALID_LEDGER_DOCUMENT,
            f'    result: "{_LEDGER_RESULT_ESCAPED}"\n',
            f"    result: {LEDGER_SCORE_EXCERPT}\n",
            "shape 1 indented",
        ),
    )

    # Case: shape 2 broken, with `status: gaps_found` -- the second status audit-uat opens.
    ledger_reject(
        "shape 2 broken with status: gaps_found (the second status audit-uat opens)",
        mutate(
            _shape2_broken_human_needed,
            "status: human_needed\n",
            "status: gaps_found\n",
            "status gaps_found swap",
        ),
    )

    # Case: fix-by-relabel -- shape 2 broken relabeled `status: passed`, NOT pinned. An
    # unpinned unparseable ledger must fail at ANY status; relabeling a broken file's status
    # is the cheapest way someone could try to make a red gate go quiet.
    _shape2_broken_passed = mutate(
        _shape2_broken_human_needed,
        "status: human_needed\n",
        "status: passed\n",
        "status passed swap",
    )
    ledger_reject(
        "fix-by-relabel: shape 2 broken relabeled `status: passed`, NOT pinned -- an "
        "unpinned unparseable ledger fails at any status",
        _shape2_broken_passed,
    )

    # Case: the SAME document as above, but now pinned at status='passed'. This is what
    # legitimizes the relabel above -- ONLY a real pin plus a matching shape-read status can
    # turn an unparseable ledger into a NOTE, never a status change alone.
    ledger_accept(
        "pinned unparseable-terminal: shape 2 broken, status: passed, "
        "pinned_status='passed'",
        _shape2_broken_passed,
        expect_prefix="NOTE:",
        pinned_status="passed",
    )

    # Case: pinned flip -- shape 2 broken but status is human_needed (an OPEN status),
    # pinned_status='passed'. A pinned file whose status silently moved to an open status is
    # exactly the incident class this gate exists to close, so it must FAIL, not NOTE.
    ledger_reject(
        "pinned flip: shape 2 broken, status: human_needed, pinned_status='passed' -- a "
        "pinned file whose status silently moved is the incident class",
        _shape2_broken_human_needed,
        pinned_status="passed",
    )

    # Case: pinned, status line removed -- a pinned file with NO readable status must not
    # fall back to matching the pin; a missing status is not evidence the pin still holds.
    ledger_reject(
        "pinned, status line removed: shape 2 broken with `status:` deleted, "
        "pinned_status='passed' -- a pinned file with no readable status must not match",
        mutate(
            _shape2_broken_human_needed,
            "status: human_needed\n",
            "",
            "status line removed",
        ),
        pinned_status="passed",
    )

    # Case: pinned, ambiguous status -- a second column-0 `status: passed` line is added.
    # read_status_line must fail closed (return None) on two matches, not accidentally agree
    # with the pin because one of the two lines happens to match it.
    ledger_reject(
        "pinned, ambiguous status: shape 2 broken with a second column-0 `status: passed` "
        "line added, pinned_status='passed' -- two status lines must fail closed",
        mutate(
            _shape2_broken_human_needed,
            "status: human_needed\n",
            "status: human_needed\nstatus: passed\n",
            "ambiguous status line added",
        ),
        pinned_status="passed",
    )

    # Case: stale unparseable-terminal pin -- VALID_LEDGER_DOCUMENT (parses cleanly) pinned
    # as unparseable at status='passed'. It parses now, so the pin is stale and must fail
    # loudly rather than silently accepting a file the pin no longer describes.
    ledger_reject(
        "stale unparseable-terminal pin: VALID_LEDGER_DOCUMENT (parses cleanly) with "
        "pinned_status='passed' -- it parses now, so the pin is stale",
        VALID_LEDGER_DOCUMENT,
        pinned_status="passed",
    )

    # Case: fix-by-deletion -- a body-only document with no frontmatter fence at all, not
    # pinned. Deleting the fence is the cheapest way to silence a parse failure (DD-3).
    _ledger_body_only_document = (
        "# Phase 38 notes\n\nJust prose, no frontmatter fence at all.\n"
    )
    ledger_reject(
        "fix-by-deletion: body-only document with no frontmatter fence at all, not pinned",
        _ledger_body_only_document,
    )

    # Case: the SAME body-only document, but pinned in KNOWN_NO_FRONTMATTER. Only a real pin
    # can turn a fenceless ledger into a NOTE, never the shape alone.
    ledger_accept(
        "pinned no-frontmatter: same body-only document, pinned_no_frontmatter=True",
        _ledger_body_only_document,
        expect_prefix="NOTE:",
        pinned_no_frontmatter=True,
    )

    # Case: stale no-frontmatter pin -- VALID_LEDGER_DOCUMENT (has a fence) pinned as
    # no-frontmatter. The fence now exists, so the pin is stale and must fail (DD-4).
    ledger_reject(
        "stale no-frontmatter pin: VALID_LEDGER_DOCUMENT (has a fence) with "
        "pinned_no_frontmatter=True -- the fence now exists, so the pin is stale",
        VALID_LEDGER_DOCUMENT,
        pinned_no_frontmatter=True,
    )

    # Case: unterminated frontmatter -- an opening `---` and keys with no closing fence
    # before EOF. This must never NOTE: an unterminated block has no status to shape-read.
    ledger_reject(
        "unterminated frontmatter: opening `---` and keys with no closing fence before EOF",
        "---\nstatus: human_needed\nscore: something\n",
    )

    # Case: inexact opening fence -- VALID_LEDGER_DOCUMENT's first line changed to `--- `
    # (trailing space). `.strip()` would still treat this as an opening fence, but
    # gsd-core's frontmatterRegion requires a byte-exact `---\n` (DD-6) and would read NO
    # frontmatter at all from this file -- a green-while-hidden divergence this gate must
    # catch even though the document otherwise parses cleanly.
    ledger_reject(
        "inexact opening fence: VALID_LEDGER_DOCUMENT's first line changed to `--- ` "
        "(trailing space) -- gsd-core's frontmatterRegion requires a byte-exact `---\\n` "
        "(DD-6)",
        mutate(
            VALID_LEDGER_DOCUMENT,
            "---\n",
            "--- \n",
            "inexact opening fence",
        ),
    )

    # Case: parses but not a mapping -- a bare list between fences.
    ledger_reject(
        "parses but not a mapping: a bare list between fences",
        "---\n- one\n- two\n---\n",
    )

    # Case (scan-level): a missing target FILE. Exercised against check_document's caller
    # (check_target_file below), not check_document directly -- the missing-file case is an I/O
    # concern, not a parsing one. Its `GATE FAILED:` message is captured, not printed, so a
    # literal "GATE FAILED:" line does not appear in an otherwise-passing self-test run and
    # mislead the next reader who greps the log.
    case_count += 1
    captured = io.StringIO()
    with tempfile.TemporaryDirectory() as tmp:
        missing = Path(tmp) / "DOES-NOT-EXIST.md"
        try:
            with contextlib.redirect_stderr(captured):
                check_target_file(missing, required=True, node=node)
        except SystemExit:
            if "does not exist" not in captured.getvalue():
                fail(
                    "self-test FAILED: a missing target file did not fail via the expected "
                    f"message -- got {captured.getvalue()!r}"
                )
            print(
                "  self-test OK: missing target file correctly rejected "
                "(its GATE FAILED message captured, not printed)"
            )
        else:
            fail("self-test FAILED: a missing target FILE was reported green")

    # Case (scan-level, ledger): the anti-vacuity floor. check_phase_ledgers pointed at an
    # empty temp directory named `.planning` must exit through fail() -- a walk that finds
    # zero files must not silently pass over them. Its GATE FAILED message is captured, not
    # printed, matching the missing-target-file case's convention above.
    case_count += 1
    captured_ledger_floor = io.StringIO()
    with tempfile.TemporaryDirectory() as tmp:
        empty_planning = Path(tmp) / ".planning"
        empty_planning.mkdir()
        try:
            with contextlib.redirect_stderr(captured_ledger_floor):
                check_phase_ledgers(empty_planning, node)
        except SystemExit:
            if "floor" not in captured_ledger_floor.getvalue():
                fail(
                    "self-test FAILED: ledger: scan-level floor did not mention 'floor' in "
                    f"its GATE FAILED message -- got {captured_ledger_floor.getvalue()!r}"
                )
            print(
                "  self-test OK: ledger: scan-level floor correctly rejected an empty "
                "directory (its GATE FAILED message captured, not printed)"
            )
        else:
            fail(
                "self-test FAILED: ledger: an empty .planning directory was reported green "
                "-- the anti-vacuity floor is not enforced"
            )

    print(
        f"\nAll REQUIRED_STATE_KEYS proved capable of catching deletion, `last_activity` proved "
        "incapable of being silenced by emptying, the historical raw-quote defect and a synthetic "
        "equivalent both proved rejectable, the |- un-indentation trap is covered, the "
        "divergence-shape check rejects |-, >-, and backslash-escaped \\\" scalars on both "
        "required AND optional targets, and the positive control -- a single-line single-quoted "
        "document, the shape STATE.md ships today, apostrophes doubled as '' -- is correctly "
        "accepted while that one deliberately-kept '' divergence is not convicted. Both "
        "incident shapes are rejected from hash-pinned real history, the repaired form "
        "(single-quoted score, backslash-escaped result, `expected: |` block scalar) is "
        "accepted proving check_divergence_shapes is never applied to ledgers (DD-5), and "
        "the ledger pin tables shrink-only and cross-check status against a shape read "
        f"({case_count} self-test case(s) total)."
    )


def check_target_file(path: Path, required: bool, node: str) -> tuple[bool, str]:
    """I/O wrapper around check_document for one real target file. A missing file is a hard
    failure regardless of whether the target is 'required' in the frontmatter sense -- a target
    this gate cannot even find is not a target this gate can vouch for."""
    if not path.is_file():
        fail(f"target file {path} does not exist -- this gate cannot check what is not there")
    text = path.read_text(encoding="utf-8")
    return check_document(text, required, node, label=str(path))


def main() -> None:
    # js-yaml error messages embed document text and render a TAB as U+2192. This gate prints
    # them to stdout, and under meta/runPlanningGates.py that stdout is a cp1252 pipe on Windows.
    # The encoding is deliberately NOT changed: the runner decodes every gate's output in the
    # locale code page and every other gate writes in it, so changing only this gate's encoding
    # would make the runner mojibake or crash on it. Only the error handler changes, to
    # backslashreplace, which is what Python already applies to stderr by default. The
    # reconfigure call is unconditional: this is a CLI entry point, so stdout is always a
    # TextIOWrapper.
    sys.stdout.reconfigure(errors="backslashreplace")
    self_test()
    if "--self-test" in sys.argv:
        print(
            "\nSELF-TEST OK: every REJECT case rejects for its stated reason, every ACCEPT case "
            "is left alone."
        )
        sys.exit(0)

    node = find_node()

    results: list[tuple[bool, str]] = []
    for rel, required in TARGETS:
        path = PLANNING_DIR / rel
        results.append(check_target_file(path, required, node))

    for _, message in results:
        print(message)

    checked = sum(1 for _, m in results if m.startswith("OK:"))
    no_frontmatter = sum(1 for _, m in results if m.startswith("NOTE:"))
    failed = [m for ok, m in results if not ok]

    print(
        f"\n{checked} target(s) checked and parsed, {no_frontmatter} target(s) had no "
        f"frontmatter block (optional, reported by name above -- 'skipped' is not 'checked'), "
        f"{len(failed)} target(s) failed."
    )

    # Phase VERIFICATION/UAT ledger walk (quick task 260928-sph). Runs AFTER the TARGETS
    # walk above; its failures join the SAME final fail() call below so a ledger failure
    # alone still exits non-zero -- a printed-but-exit-0 failure is invisible to
    # meta/runPlanningGates.py, which reads the exit code alone.
    ledger_results = check_phase_ledgers(PLANNING_DIR, node)
    for _, message in ledger_results:
        print(message)

    # A stale EXISTENCE pin (the file itself no longer exists) is reported by
    # check_phase_ledgers before it ever walks the tree -- it is not one of the walked
    # files, so it must not inflate the "walked" count below.
    walked = [(ok, m) for ok, m in ledger_results if "no longer exists" not in m]

    ledger_ok = sum(1 for ok, m in walked if ok and m.startswith("OK:"))
    ledger_open = sum(
        1
        for ok, m in walked
        if ok
        and m.startswith("OK:")
        and any(f"status: {s}" in m for s in OPEN_VERIFICATION_STATUSES)
    )
    ledger_nofm_note = sum(1 for ok, m in walked if ok and "pinned no-frontmatter" in m)
    ledger_unp_note = sum(1 for ok, m in walked if ok and "pinned unparseable-terminal" in m)
    ledger_failed = [m for ok, m in ledger_results if not ok]

    print(
        f"\nPHASE LEDGERS: {len(walked)} walked (floor {MINIMUM_PHASE_LEDGERS}); "
        f"{ledger_ok} parsed as a mapping ({ledger_open} at an open status: "
        f"human_needed/gaps_found); {ledger_nofm_note} pinned no-frontmatter NOTE; "
        f"{ledger_unp_note} pinned unparseable-terminal NOTE; {len(ledger_failed)} failed."
    )

    all_failed = failed + ledger_failed
    if all_failed:
        fail("frontmatter check failed for: " + " | ".join(all_failed))

    sys.exit(0)


if __name__ == "__main__":
    main()
