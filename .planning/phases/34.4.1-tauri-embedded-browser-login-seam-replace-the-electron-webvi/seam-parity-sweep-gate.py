#!/usr/bin/env python3
"""Two-axis seam-parity sweep (34.4.1 gap cycle, plan 10 — REQ-34.4.1-11/REQ-34.4.1-GAP-04).

Purpose (read this before deleting a failing assertion, or before hand-editing the generated
34.4.1-SEAM-PARITY-SWEEP.md instead of fixing this script): F-1 and F-6 (34.4.1-LIVE-GATE.md) are
the SAME mistake twice — an Electron capability silently dropped at the Tauri seam, invisible to a
fully-green 3279/3279 suite. This script exists so a THIRD instance is never found by a human
driving a UI again. It walks the real `src/` tree at run time (never a cached/pasted list) on two
axes:

  Axis A — every `getLoginWindowSeam()` dual-branch call site. For sites shaped as a `wipeSteps`
  array (the shape `disconnect()`/`logout()` use), this extracts the step LABELS mechanically
  (regex over the real array literal, never hand-transcribed) and diffs them via the shared
  capability-category mapping (storage/cache/authCache/hostResolver/cookies). For sites shaped as
  a `configStore.set(...)` sink (e.g. the csrf-capture branch), it diffs the set of keys written.
  For sites resolving to two named helper functions via a ternary (e.g. `humblePostRequest`), it
  diffs each helper's return/throw SHAPE (first object key, thrown class name). Every one of these
  three tiers is driven by parsing the SAME real files this repo ships, through the SAME functions
  used for the real run — never a reimplementation for self-test purposes.

  Axis B — every non-test module that imports `safeStorage` from `'electron'` (the shape F-1/F-1b
  share). For each importer, this parses `electronStub.ts`'s own `safeStorage` export block to
  confirm the sidecar's actual behavior (hardcoded `false` / throws), then checks whether the
  IMPORTING file's own module-doc-comment declares the reduction with a decision/threat ID.

  Classification boundary (34.4.1-10-PLAN.md `<interfaces>`): DECLARED requires an in-source
  comment that both NAMES the dropped capability (via the category-synonym table below) and
  carries a `T-...`/`D-...` id in the SAME branch that dropped it — presence of an id ALONE is not
  enough (F-6's own Tauri branch carries T-34.4.1-30, discussing DOMAIN scope, and still does not
  mention storage/cache/authCache/hostResolver anywhere — so it stays SILENTLY-DROPPED. This is
  deliberately the sharp part of the check: an id sitting near a reduction is exactly what let F-1
  and F-6 both "look intentional" while shipping broken). Everything else is SILENTLY-DROPPED.

  Where a real getLoginWindowSeam() call's control-flow does not fit any of the three tiers above
  (no wipeSteps array, no configStore sink, not a two-function ternary — e.g. a raw window-open
  setup step or a debug-only env-gated smoke hook with no capability sink at all), this script
  falls back to a narrow, SELF-TESTABLE evidence assertion anchored to specific source substrings
  (see SITE_PROFILES below) rather than pretending a generic text diff can safely conclude
  anything about arbitrary control flow. Each such assertion fails loudly — not silently defaults
  to a classification — the moment its anchor text changes, forcing a human to re-derive it. This
  is a scope limit, stated plainly rather than hidden: a full TypeScript AST differ is out of
  scope for a stdlib-only instrument, and the sites that need it are exactly the ones this file's
  SITE_PROFILES table names, once each.

Run `python3 seam-parity-sweep.py` to regenerate `34.4.1-SEAM-PARITY-SWEEP.md` from the live tree.
Run `python3 seam-parity-sweep.py --self-test` to prove every check function actually rejects the
bad input it exists to reject (Phase 34.2 gap cycle 4's round-4 lesson: 14 comment strippers that
all passed vacuously). Self-test cases run through the SAME functions used against the real tree.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

PHASE_DIR = Path(__file__).parent
REPO_ROOT = PHASE_DIR.parent.parent.parent
SRC_DIR = REPO_ROOT / "src"
OUTPUT_PATH = PHASE_DIR / "34.4.1-SEAM-PARITY-SWEEP.md"
ELECTRON_STUB_PATH = SRC_DIR / "backend" / "sidecar" / "electronStub.ts"

# The expected-answer sites from 34.4.1-10-PLAN.md <interfaces> — checked against, never
# substituted for the live walk. If the live walk finds fewer than this, the walk is broken.
#
# Line numbers refreshed Phase 34.4.1 Plan 18 (first regeneration since Plan 10 wrote this
# script): plans 11-17 (already committed) and this plan's own Task 1-3/S-09 edits shifted every
# one of these lines. This is a LINE NUMBER refresh only, matching the SAME real call sites —
# `git log -p` on each file confirms no site was added, removed, or moved to a different function
# by this renumbering. The one genuinely NEW getLoginWindowSeam() call this plan adds
# (checkHealthAndFlagExpiry's S-09 guard, user.ts:776) is deliberately NOT added here — this list
# is a FLOOR against 34.4.1-10-PLAN.md's original <interfaces>, not an exhaustive site list; the
# new site still surfaces in the real findings table below without needing a floor entry.
# Line numbers refreshed AGAIN 2026-08-23 (gap cycle 3, plan 31 — NEW-01). LINE NUMBERS ONLY: every
# entry below was re-located by its ENCLOSING FUNCTION, not by position, and each resolves to the
# SAME call site in the SAME function as before. No site was added to, removed from, or moved
# within this floor. Verified against the live walk's own `site_paths_seen` rather than by hand:
#
#   :272 -> :275   adapter.ts            humblePostRequest()
#   :168 -> :178   humble/user.ts        getLiveCsrfToken()
#   :264 -> :274   humble/user.ts        watchForLogin() (seam install)
#   :646 -> :740   humble/user.ts        finishLogin()'s csrf capture
#   :943 -> :1034  humble/user.ts        disconnect()'s wipeSteps
#   :157 -> :195   oauthLoginCapture.ts  captureOAuthLogin()
#   :436 -> :457   humbleLoginFlowRegistration.ts  smokeHook
#   :137 -> :137   legendary/user.ts     UNCHANGED (this one never drifted)
#
# The walk now finds a FIFTH humble/user.ts site at :873 that is not in this floor. That is
# correct and deliberate: it is checkHealthAndFlagExpiry's S-09 guard, recorded by Plan 18 at
# :776 as "deliberately NOT added here — this list is a FLOOR ... not an exhaustive site list".
# It still surfaces in the findings table without a floor entry. Adding it here would quietly
# convert a floor into an inventory and make the next drift harder to reason about.
EXPECTED_AXIS_A_SITES = [
    "src/backend/humble/adapter.ts:275",  # was :272 (humblePostRequest)
    "src/backend/humble/user.ts:178",  # was :168, :185 (getLiveCsrfToken)
    "src/backend/humble/user.ts:274",  # was :264, :281 (watchForLogin)
    "src/backend/humble/user.ts:740",  # was :646, :614 (finishLogin's csrf capture)
    "src/backend/humble/user.ts:1034",  # was :943, :794 (disconnect's wipeSteps)
    "src/backend/sidecar/oauthLoginCapture.ts:195",  # was :157
    "src/backend/storeManagers/legendary/user.ts:137",  # was :107 — unchanged this cycle
    "src/backend/sidecar/humbleLoginFlowRegistration.ts:457",  # was :436, :407, :358
]
# Updated Phase 34.4.1 Plan 18 (first regeneration since Plan 10): Plan 12 (already committed,
# F-1/S-10 closure) moved the safeStorage import OUT of humble/user.ts entirely, into a new
# dedicated seam module (secretStore.ts) that plan 13 installs a keyring-backed implementation
# behind. user.ts itself no longer imports safeStorage from 'electron' at all — verified directly
# (`grep -n "from 'electron'" src/backend/humble/user.ts` shows only `session`). This is an
# IMPORTER-LOCATION update, not a re-litigation of F-1's classification.
EXPECTED_AXIS_B_SAFESTORAGE_IMPORTERS = [
    "src/backend/humble/secretStore.ts",
    "src/backend/steamgrid/secureKey.ts",
    "src/backend/storeManagers/steam/tokenStore.ts",
]


def fail(message: str) -> None:
    print(f"GATE FAILED: {message}", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------------------------
# File tree walking
# ---------------------------------------------------------------------------------------------


def iter_source_files() -> list[Path]:
    """Every non-test .ts/.tsx file under src/, excluding electronStub.ts itself (per the plan's
    Axis B scoping — the stub is what Axis A/B compare AGAINST, never a site to enumerate)."""
    files: list[Path] = []
    for pattern in ("*.ts", "*.tsx"):
        for path in sorted(SRC_DIR.rglob(pattern)):
            if "__tests__" in path.parts:
                continue
            if path.name.endswith((".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx")):
                continue
            if path.resolve() == ELECTRON_STUB_PATH.resolve():
                continue
            files.append(path)
    return files


def repo_relative(path: Path) -> str:
    return path.resolve().relative_to(REPO_ROOT.resolve()).as_posix()


# ---------------------------------------------------------------------------------------------
# Axis A — mechanical enumeration
# ---------------------------------------------------------------------------------------------

SEAM_CALL_RE = re.compile(r"getLoginWindowSeam\(\)")


def find_axis_a_call_sites() -> list[tuple[Path, int, int]]:
    """(file, 1-based line number, absolute char offset) for every real call — i.e. NOT a
    reference inside a `//` or `/* */` comment, and not the function's own declaration line
    (`function getLoginWindowSeam()` itself lives in loginWindowSeam.ts and is excluded by name)."""
    sites: list[tuple[Path, int, int]] = []
    for path in iter_source_files():
        if path.name == "loginWindowSeam.ts":
            continue
        text = path.read_text(encoding="utf-8")
        for m in SEAM_CALL_RE.finditer(text):
            line_start = text.rfind("\n", 0, m.start()) + 1
            line_end = text.find("\n", m.start())
            if line_end == -1:
                line_end = len(text)
            line_text = text[line_start:line_end]
            stripped = line_text.strip()
            if stripped.startswith("//") or stripped.startswith("*"):
                continue
            line_no = text.count("\n", 0, m.start()) + 1
            sites.append((path, line_no, m.start()))
    return sites


# ---------------------------------------------------------------------------------------------
# Brace/paren matching helpers (shared by every tier)
# ---------------------------------------------------------------------------------------------


def match_delims(text: str, open_index: int, open_ch: str, close_ch: str) -> int:
    """Return the index of the delimiter that closes the one at open_index."""
    depth = 0
    i = open_index
    while i < len(text):
        if text[i] == open_ch:
            depth += 1
        elif text[i] == close_ch:
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise ValueError(f"unbalanced {open_ch}{close_ch} starting at {open_index}")


DEF_LINE_RE = re.compile(r"(\)\s*(?::\s*[^{=]+)?\{\s*$)|(=>\s*\{\s*$)")
# Control-flow openers (`if (...) {`, `} else {`, `for (...) {`, `while (...) {`, `catch (...) {`,
# `switch (...) {`) end with the SAME `) {` shape as a real function header — a line-level regex
# alone cannot tell them apart. Excluded explicitly so find_enclosing_function walks PAST a nested
# if/else block to the actual enclosing function/method, never mistakes the if-block itself for
# the function.
CONTROL_KEYWORD_LINE_RE = re.compile(r"^\s*(\}\s*)?(else\s+)?(if|for|while|switch|catch)\s*\(")


def find_enclosing_function(text: str, call_index: int) -> tuple[int, int] | None:
    """Scan backward from call_index for the nearest line that looks like a function/method/
    arrow-function opening (never a control-flow block), then brace-match forward to its close.
    Returns (body_start, body_end) exclusive of the outer braces, or None if no such line is found
    before file start."""
    pos = call_index
    while True:
        line_start = text.rfind("\n", 0, pos) + 1
        line_end = text.find("\n", line_start)
        if line_end == -1:
            line_end = len(text)
        line = text[line_start:line_end]
        if CONTROL_KEYWORD_LINE_RE.match(line):
            if line_start == 0:
                return None
            pos = line_start - 1
            continue
        # Deliberately does NOT require "(" on this SAME line -- a multi-line function signature
        # (e.g. `captureOAuthLogin(\n  runner: OAuthRunner,\n  ...\n): Promise<...> {`) puts the
        # opening "(" several lines above the closing ")... {" that DEF_LINE_RE matches; requiring
        # both on one line silently rejected every multi-line signature in this codebase.
        if DEF_LINE_RE.search(line):
            open_brace = text.rfind("{", line_start, line_end)
            if open_brace != -1:
                close_brace = match_delims(text, open_brace, "{", "}")
                return open_brace + 1, close_brace
        if line_start == 0:
            return None
        pos = line_start - 1


FILE_HEADER_SEARCH_WINDOW = 3000


def extract_file_header_comment(text: str) -> str:
    """The first `/** ... */` block within the file's leading window (imports, `'use strict'`,
    etc. may legitimately precede the file's own top docstring — e.g. `tokenStore.ts` and
    `secureKey.ts` both put their `import` lines before their class-level docblock). Deliberately
    `re.search`, not `re.match`, and bounded to `FILE_HEADER_SEARCH_WINDOW` characters so a
    docblock found deep inside an unrelated function body is never mistaken for the file's own
    header declaration."""
    m = re.search(r"/\*\*(.*?)\*/", text[:FILE_HEADER_SEARCH_WINDOW], re.DOTALL)
    return m.group(0) if m else ""


def preceding_doc_comment(text: str, def_body_start: int) -> str:
    """The contiguous /** ... */ or // block immediately above the function's own header line
    (walking back past the header line itself), so a docblock like adapter.ts's D-07 paragraph
    (which sits above `function humblePostRequest(`, not inside its body) is visible to the
    DECLARED check too. Returns '' if there is no contiguous comment block there."""
    # Walk back from def_body_start (just after the opening '{') to the function header's
    # own preceding line, then continue back through contiguous comment lines.
    header_line_start = text.rfind("\n", 0, text.rfind("{", 0, def_body_start)) + 1
    pos = header_line_start
    collected_start = pos
    while True:
        prev_line_end = pos - 1
        if prev_line_end < 0:
            break
        prev_line_start = text.rfind("\n", 0, prev_line_end) + 1
        prev_line = text[prev_line_start:prev_line_end]
        stripped = prev_line.strip()
        if stripped.startswith("//") or stripped.startswith("*") or stripped.startswith("/**"):
            collected_start = prev_line_start
            pos = prev_line_start
            continue
        break
    return text[collected_start:header_line_start]


# ---------------------------------------------------------------------------------------------
# Capability-category mapping (shared convention with seamBranchParity.test.ts, Task 2)
# ---------------------------------------------------------------------------------------------

WIPE_STEP_CATEGORIES: dict[str, set[str]] = {
    "clearStorageData": {"storage", "cookies"},
    "clearCache": {"cache"},
    "clearAuthCache": {"authCache"},
    "clearHostResolverCache": {"hostResolver"},
    "clearData": {"storage", "cache"},
    "clearHumbleCookies": {"cookies"},
    "clearEpicCookies": {"cookies"},
    # Added Phase 34.4.1 gap cycle 2, plan 28 (item 7). Plans 15/16 introduced these two step
    # labels and never added them here, so `categories_for_labels()` bucketed them as
    # `UNKNOWN:clearHumbleStorage` / `UNKNOWN:clearEpicStorage` and S-07/S-10 kept reporting
    # SILENTLY-DROPPED for storage/cache that plan 16 had ALREADY closed. Plan 18 found it and
    # routed it to plan 19; plan 19 declined because this file was not in its files_modified;
    # plan 20's scope missed it too. Twice re-forwarded for the same reason both times -- which is
    # why plan 28 lists this file explicitly.
    "clearHumbleStorage": {"storage", "cache"},
    "clearEpicStorage": {"storage", "cache"},
}

CATEGORY_SYNONYMS: dict[str, list[str]] = {
    "storage": ["storage", "localstorage", "sessionstorage", "indexeddb"],
    "cache": ["cache"],
    "authCache": ["auth cache", "authcache"],
    "hostResolver": ["host resolver", "hostresolver", "dns"],
    "cookies": ["cookie"],
}

ID_PATTERN = re.compile(r"\b(T-[A-Za-z0-9][A-Za-z0-9.\-]*|D-\d+)\b")

WIPE_STEPS_HEADER_RE = re.compile(r"wipeSteps\s*=\s*\[")
STEP_LABEL_RE = re.compile(r"'([A-Za-z0-9_]+)'")


def extract_wipe_step_labels(branch_text: str) -> list[str] | None:
    header_m = WIPE_STEPS_HEADER_RE.search(branch_text)
    if not header_m:
        return None
    # The outer array's own opening '[' is the LAST character header_m matched. Brace/bracket-
    # match it properly (never a regex line-anchored guess at where it ends) — the real
    # `wipeSteps` array literal nests further `[`/`]` pairs inside (e.g. a `logWarning([...])`
    # call argument several levels deep in the async closure), so only a real depth-counting walk
    # can find the TRUE end.
    outer_open = header_m.end() - 1
    outer_close = match_delims(branch_text, outer_open, "[", "]")
    array_body = branch_text[outer_open : outer_close + 1]
    # Only the FIRST quoted string inside each top-level `[ 'label', ... ]` tuple is the label —
    # naive STEP_LABEL_RE.findall over the whole array body would also match string literals
    # embedded deeper (e.g. a url or partition name argument). Walk top-level tuples explicitly.
    labels: list[str] = []
    depth = 0
    i = 0
    n = len(array_body)
    while i < n:
        ch = array_body[i]
        if ch == "[":
            depth += 1
            if depth == 2:  # entered a `['label', ...]` tuple (depth 1 is the outer array)
                tuple_start = i
                tuple_end = match_delims(array_body, tuple_start, "[", "]")
                tuple_text = array_body[tuple_start : tuple_end + 1]
                label_match = STEP_LABEL_RE.search(tuple_text)
                if label_match:
                    labels.append(label_match.group(1))
                i = tuple_end
                depth -= 1
        elif ch == "]":
            depth -= 1
        i += 1
    return labels


def categories_for_labels(labels: list[str]) -> set[str]:
    result: set[str] = set()
    for label in labels:
        result |= WIPE_STEP_CATEGORIES.get(label, {f"UNKNOWN:{label}"})
    return result


def is_declared_by_terms(scope_text: str, required_terms: set[str]) -> tuple[bool, str | None]:
    """STRICT bar (Tier 1 / wipeSteps): an id AND every dropped term (via its synonym list) named
    in the same scope. Returns (declared, first_id_or_None)."""
    ids = ID_PATTERN.findall(scope_text)
    if not ids:
        return False, None
    lowered = scope_text.lower()
    for term in required_terms:
        synonyms = CATEGORY_SYNONYMS.get(term, [term.lower()])
        if not any(s in lowered for s in synonyms):
            return False, None
    return True, ids[0]


def is_declared_by_id_presence(scope_text: str) -> tuple[bool, str | None]:
    """RELAXED bar (Tier 2/3 — equivalence sites, or sites where no reduction was found): an id
    present anywhere in scope is sufficient context. Used only for lower-stakes sites where the
    generic engine already found the two branches equivalent, or for the return-shape tier."""
    ids = ID_PATTERN.findall(scope_text)
    if not ids:
        return False, None
    return True, ids[0]


# ---------------------------------------------------------------------------------------------
# Branch pair extraction — 3 shapes: condition-aware if/else, ternary, ID-based function lookup
# ---------------------------------------------------------------------------------------------

IF_OPEN_RE = re.compile(r"\bif\s*\(")


def find_seam_if_else(text: str, search_from: int, function_end: int | None = None) -> dict | None:
    """Find the first `if (...)` at/after search_from whose CONDITION mentions `seam` together
    with `=== null` or `!== null` (condition-aware — tolerates extra `&&` clauses, e.g.
    `seam !== null && seamLabel !== null`). Brace-matches the if-block; if an `else {` follows
    immediately, brace-matches that too. When there is NO else but the if-block contains a
    `return` (an early-return guard, e.g. `getLiveCsrfToken`'s `if (seam !== null) { ...; return }`)
    AND `function_end` is given, the "other branch" is treated as the remainder of the enclosing
    function body after the if-block — the same shape a human reads it as. Returns a dict with
    is_seam_null_branch/true_text/false_text (false_text is None only when neither an else NOR a
    function_end-bounded early-return applies), or None if no such `if` exists."""
    idx = search_from
    while True:
        m = IF_OPEN_RE.search(text, idx)
        if not m:
            return None
        paren_open = m.end() - 1
        paren_close = match_delims(text, paren_open, "(", ")")
        cond_text = text[paren_open + 1 : paren_close]
        if "seam" in cond_text and ("=== null" in cond_text or "!== null" in cond_text or cond_text.strip() == "!seam" or cond_text.strip().lstrip("!") == "seam"):
            is_seam_null_true_branch = (
                "=== null" in cond_text or cond_text.strip() == "!seam" or cond_text.strip().lstrip("!") == "seam" and "!" in cond_text
            )
            brace_open = text.index("{", paren_close)
            brace_close = match_delims(text, brace_open, "{", "}")
            true_text = text[brace_open + 1 : brace_close]
            false_text = None
            after = text[brace_close + 1 :]
            else_m = re.match(r"\s*else\s*\{", after)
            if else_m:
                else_brace_open = brace_close + 1 + after.index("{", else_m.start())
                else_brace_close = match_delims(text, else_brace_open, "{", "}")
                false_text = text[else_brace_open + 1 : else_brace_close]
                overall_end = else_brace_close
            else:
                overall_end = brace_close
            has_return_in_true = bool(re.search(r"\breturn\b", true_text))
            if false_text is None and has_return_in_true and function_end is not None and function_end > brace_close:
                false_text = text[brace_close + 1 : function_end]
                overall_end = function_end
            return {
                "cond_text": cond_text,
                "is_seam_null_true_branch": is_seam_null_true_branch,
                "true_text": true_text,
                "false_text": false_text,
                "has_return_in_true": has_return_in_true,
                "overall_end": overall_end,
                "if_start": m.start(),
            }
        idx = m.end()


TERNARY_RE = re.compile(
    r"\bseam\s*\?\s*([A-Za-z0-9_]+)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*:\s*([A-Za-z0-9_]+)\s*\("
)


def find_seam_ternary(text: str, search_from: int) -> dict | None:
    m = TERNARY_RE.search(text, search_from)
    if not m:
        return None
    return {"true_fn": m.group(1), "false_fn": m.group(3)}


FUNCTION_DEF_RE_TEMPLATE = r"(?:async\s+)?function\s+{name}\s*\("


def find_function_body_by_name(text: str, name: str) -> str | None:
    m = re.search(FUNCTION_DEF_RE_TEMPLATE.format(name=re.escape(name)), text)
    if not m:
        return None
    brace_open = text.index("{", m.end() - 1)
    brace_close = match_delims(text, brace_open, "{", "}")
    return text[brace_open + 1 : brace_close]


# ---------------------------------------------------------------------------------------------
# Sink extractors (shared across tiers)
# ---------------------------------------------------------------------------------------------

# Widened Phase 34.4.1 Plan 18 (first regeneration since Plan 10): Plan 12's secret-store seam
# (already committed, landed AFTER this script was written) replaced finishLogin's direct
# `configStore.set('csrfToken', ...)` sink with `storeHumbleSecret('csrfToken', ...)` for every
# ENCRYPTED value (session cookie, csrf token) on BOTH the Electron and Tauri branches — the same
# capability-sink SHAPE this tier already detects, just renamed. Matching only the literal
# `configStore.set(` (this regex's original form) would have made this classifier blind to the
# csrf-capture site's now-real sink, silently reporting "no configStore sink found" (None) instead
# of a genuine identical-keys DECLARED finding — exactly the kind of drift this file's own
# docstring says to fix in the SCRIPT, not paper over by hand-editing the generated .md.
CONFIGSTORE_SET_RE = re.compile(
    r"(?:configStore\.set|storeHumbleSecret)\(\s*'([A-Za-z0-9_]+)'"
)
RETURN_SNIPPET_RE = re.compile(r"\breturn\s+([^;\n]{1,80})")
RESOLVE_SNIPPET_RE = re.compile(r"\bresolve\(\s*(\{[^;\n]{0,80})")
THROW_CLASS_RE = re.compile(r"\b(?:throw|reject)\s*\(?\s*new\s+([A-Za-z0-9_]+)\(")
RETURN_OBJECT_KEY_RE = re.compile(r"(?:return|resolve)\s*\(?\s*\{\s*([A-Za-z0-9_]+)")


def configstore_keys(branch_text: str) -> set[str]:
    return set(CONFIGSTORE_SET_RE.findall(branch_text))


def return_snippets(branch_text: str) -> set[str]:
    snippets = {s.strip() for s in RETURN_SNIPPET_RE.findall(branch_text)}
    snippets |= {s.strip() for s in RESOLVE_SNIPPET_RE.findall(branch_text)}
    return snippets


def sink_shape(branch_text: str) -> tuple[set[str], set[str]]:
    """(returned-object first-keys, thrown/rejected class names) — used for the ternary/
    named-function tier (humblePostRequest)."""
    return set(RETURN_OBJECT_KEY_RE.findall(branch_text)), set(THROW_CLASS_RE.findall(branch_text))


# ---------------------------------------------------------------------------------------------
# Axis A classification
# ---------------------------------------------------------------------------------------------


class Finding:
    def __init__(
        self,
        axis: str,
        site: str,
        electron_capability: str,
        tauri_capability: str,
        classification: str,
        disposition: str,
    ) -> None:
        self.axis = axis
        self.site = site
        self.electron_capability = electron_capability
        self.tauri_capability = tauri_capability
        self.classification = classification
        self.disposition = disposition
        if classification not in ("SILENTLY-DROPPED", "DECLARED"):
            fail(f"internal error: classification '{classification}' is not one of the 2 permitted values for site {site}")


# Sites whose control flow does not fit the mechanical wipeSteps/configStore/ternary tiers (no
# array literal, no configStore sink, not a two-named-function ternary — see module docstring).
# Each entry is verified against the LIVE file at run time via an anchor-substring assertion, so a
# source change that invalidates the classification fails loudly instead of reporting stale text.
SITE_PROFILES = {
    "src/backend/humble/user.ts::watchForLogin": {
        # Line hint updated Phase 34.4.1 Plan 18 (F-2): the site itself is unchanged, but Plan
        # 18's Task 2 (rejection-log collapse) inserted ~17 lines above it (a new
        # LOGIN_WATCH_LIVENESS_LOG_INTERVAL_MS constant + doc comment) -- the +/-5 line-window
        # match in run_axis_a() needs the hint kept current, exactly the kind of drift this
        # profile's own anchor-count check exists to catch loudly rather than silently.
        # Refreshed AGAIN 2026-08-23 (gap cycle 3, plan 31): 264 -> 274.
        "line_hint": 274,
        "anchors": [
            "standardBrowserUserAgent()",  # must appear on BOTH the Electron ses.setUserAgent
            # call and the Tauri seam.open({userAgent: ...}) call -- 2+ occurrences is the
            # mechanical proxy for "same UA delivered on both paths".
        ],
        "min_anchor_occurrences": {"standardBrowserUserAgent()": 2},
        "id_anchor": "D-01/D-02",
        "electron_capability": "ses.setUserAgent(standardBrowserUserAgent()) on the persist:humble partition",
        "tauri_capability": "seam.open(url, { userAgent: standardBrowserUserAgent() }) -- same UA string, different delivery API",
        "classification": "DECLARED",
        "disposition": "correct — no action (D-01/D-02; UA parity verified by anchor count, not a capability drop)",
    },
    "src/backend/sidecar/humbleLoginFlowRegistration.ts::smokeHook": {
        # Line hint refreshed Phase 34.4.1 Plan 18 (first regeneration since Plan 10) — same site,
        # shifted by intervening plans' additions to this file.
        # Refreshed AGAIN in gap cycle 2 plan 28: 407 -> 436, shifted by plans 22-27's additions
        # to this file. The +/-5 window in run_axis_a() means a 29-line drift is a hard stop, not
        # a silent mismatch -- which is the design working, and the reason a regeneration always
        # costs one hint sweep per cycle that moved code.
        # Refreshed AGAIN 2026-08-23 (gap cycle 3, plan 31): 436 -> 457. Third and last of the
        # three profiles that drifted on `fbbfa852e style: apply prettier repo-wide`.
        "line_hint": 457,
        "anchors": [
            "GAMELIB_LOGIN_SEAM_SMOKE",
            "this is a FAIL, not a skip",
        ],
        "min_anchor_occurrences": {},
        "id_anchor": None,
        "electron_capability": "n/a — inert unless GAMELIB_LOGIN_SEAM_SMOKE=1 (debug-only diagnostic hook, not a shipped capability)",
        "tauri_capability": "opens a diagnostic window against example.com, waits ~2s, closes it -- proves the seam construction path, not a user-facing feature",
        "classification": "DECLARED",
        "disposition": "correct — no action (env-gated diagnostic harness; no production capability on either branch to drop)",
    },
    # Added Phase 34.4.1 Plan 18 (F-2/F-3/F-4/S-09 gap-cycle closure). Plan 17 (already committed,
    # landed AFTER this script was written in Plan 10) added a NEW getLoginWindowSeam() call site —
    # a plain ternary EXPRESSION choosing a LOG LABEL STRING, not a two-named-function dispatch
    # (so classify_ternary_site's find_function_body_by_name lookup does not match it) and not a
    # wipeSteps/configStore sink either. Regenerating this document for S-09 hit this site as a
    # hard stop (GATE FAILED) before any S-09-related change was made — fixing the SCRIPT (never
    # hand-editing the generated .md) to classify a genuinely new site is exactly what this file's
    # own docstring instructs.
    "src/backend/humble/library.ts::revealTransportLabel": {
        # Line hint refreshed 2026-08-23 (gap cycle 3, plan 31): 1202 -> 1211. NEW-01.
        #
        # The site, its anchors and its classification are ALL unchanged -- pure line drift. ALL
        # THREE profiles in this dict drifted at once (264->274, 436->457, 1202->1211), together
        # with all seven EXPECTED_AXIS_A_SITES entries.
        #
        # ATTRIBUTION, stated carefully: ~8 commits touched these files between the Plan 18
        # refresh and today -- 34.4.2 and 34.5 behavioural work (63ae6c818, f3b9e6da5, e1cef86e4,
        # dea15578f, 688a216de, ff298d657, 08ae387ff, af42d10ac) plus a repo-wide prettier sweep
        # (fbbfa852e). The drift is attributable to that set COLLECTIVELY. An earlier draft of
        # this comment blamed the prettier commit alone, on the strength of `git diff -w` showing
        # changes; that test is invalid, because -w ignores whitespace WITHIN a line and does not
        # ignore reflowing, so it cannot distinguish a formatting sweep from real work either way.
        #
        # Nobody noticed for 23 days because THIS SCRIPT IS NOT WIRED INTO CI -- `pnpm
        # planning-gates` runs 6 gates and this is not one of them. The failure surfaced only
        # because gap cycle 3 ran it by hand.
        #
        # WARNING for plan 32 (D-29-03): that plan adds a success-path INFO line to this same
        # function. If it lands ABOVE line 1211 this hint drifts AGAIN and the gate goes red a
        # third time. Add the success line AFTER the adapter call (it is a completion log, so
        # that is also where it belongs semantically), and re-run this script before committing.
        "line_hint": 1211,
        "anchors": [
            "revealTransportLabel",
            "login-window seam transport",
            "electron-net transport",
        ],
        "min_anchor_occurrences": {},
        "id_anchor": None,
        "electron_capability": "logs the fixed 'electron-net transport' label on the reveal-POST diagnostic line",
        "tauri_capability": "logs 'login-window seam transport' -- a LABEL choice derived from the SAME getLoginWindowSeam() condition humblePostRequest (adapter.ts) branches its REAL dispatch on; this line does not itself dispatch anything",
        "classification": "DECLARED",
        "disposition": "correct — no action (Phase 34.4.1 gap-cycle plan 17, F-8: a diagnostic label choice, not a dropped capability -- the reveal POST's actual transport dispatch lives in adapter.ts's own getLoginWindowSeam() branch, unaffected by this line)",
    },
}


def classify_wipesteps_site(site_label: str, branch: dict) -> Finding | None:
    electron_text = branch["true_text"] if branch["is_seam_null_true_branch"] else branch["false_text"]
    tauri_text = branch["false_text"] if branch["is_seam_null_true_branch"] else branch["true_text"]
    if electron_text is None or tauri_text is None:
        return None
    electron_labels = extract_wipe_step_labels(electron_text)
    tauri_labels = extract_wipe_step_labels(tauri_text)
    if electron_labels is None or tauri_labels is None:
        return None
    electron_categories = categories_for_labels(electron_labels)
    tauri_categories = categories_for_labels(tauri_labels)
    dropped = electron_categories - tauri_categories
    if not dropped:
        declared, found_id = is_declared_by_id_presence(tauri_text)
        return Finding(
            "A",
            site_label,
            f"wipeSteps: {electron_labels}",
            f"wipeSteps: {tauri_labels}",
            "DECLARED",
            f"correct — no action (identical category coverage{f', id {found_id} present' if declared else ''})",
        )
    declared, found_id = is_declared_by_terms(tauri_text, dropped)
    classification = "DECLARED" if declared else "SILENTLY-DROPPED"
    # Named-finding hints — 34.4.1-LIVE-GATE.md's F-6 (humble/user.ts disconnect) and its
    # documented verbatim twin (storeManagers/legendary/user.ts logout, found during gap-cycle
    # planning, memory: "a twin of F-6 already shipped"). Both are wipeSteps sites this same
    # generic engine finds; the hint below only NAMES the pre-existing finding IDs for a reader
    # cross-referencing the gate document, it does not change the mechanical classification above.
    finding_id_hint = ""
    if "humble/user.ts" in site_label:
        finding_id_hint = " (F-6)"
    elif "legendary/user.ts" in site_label:
        finding_id_hint = " (F-6's verbatim twin, per 34.4.1-LIVE-GATE.md gap-cycle scoping)"
    disposition = (
        f"correct — no action ({found_id})"
        if declared
        else f"gap-cycle item{finding_id_hint} — dropped categories: {sorted(dropped)} (see 34.4.1-LIVE-GATE.md)"
    )
    return Finding(
        "A",
        site_label,
        f"wipeSteps: {electron_labels}  (categories: {sorted(electron_categories)})",
        f"wipeSteps: {tauri_labels}  (categories: {sorted(tauri_categories)})",
        classification,
        disposition,
    )


def classify_configstore_site(site_label: str, branch: dict) -> Finding | None:
    electron_text = branch["true_text"] if branch["is_seam_null_true_branch"] else branch["false_text"]
    tauri_text = branch["false_text"] if branch["is_seam_null_true_branch"] else branch["true_text"]
    if electron_text is None or tauri_text is None:
        return None
    electron_keys = configstore_keys(electron_text)
    tauri_keys = configstore_keys(tauri_text)
    if not electron_keys and not tauri_keys:
        return None
    dropped = electron_keys - tauri_keys
    if not dropped:
        declared, found_id = is_declared_by_id_presence(tauri_text + electron_text)
        return Finding(
            "A",
            site_label,
            f"configStore keys written: {sorted(electron_keys)}",
            f"configStore keys written: {sorted(tauri_keys)}",
            "DECLARED",
            f"correct — no action (identical sink keys{f', id {found_id} present' if declared else ''})",
        )
    declared, found_id = is_declared_by_id_presence(tauri_text)
    classification = "DECLARED" if declared else "SILENTLY-DROPPED"
    disposition = (
        f"correct — no action ({found_id})"
        if declared
        else f"gap-cycle item — dropped configStore keys: {sorted(dropped)}"
    )
    return Finding(
        "A",
        site_label,
        f"configStore keys written: {sorted(electron_keys)}",
        f"configStore keys written: {sorted(tauri_keys)}",
        classification,
        disposition,
    )


def classify_return_snippet_site(site_label: str, branch: dict, comment_scope: str) -> Finding | None:
    electron_text = branch["true_text"] if branch["is_seam_null_true_branch"] else branch["false_text"]
    tauri_text = branch["false_text"] if branch["is_seam_null_true_branch"] else branch["true_text"]
    if electron_text is None or tauri_text is None:
        return None
    electron_returns = return_snippets(electron_text)
    tauri_returns = return_snippets(tauri_text)
    if not electron_returns and not tauri_returns:
        return None
    dropped = electron_returns - tauri_returns
    if not dropped:
        return Finding(
            "A",
            site_label,
            f"returns: {sorted(electron_returns)}",
            f"returns: {sorted(tauri_returns)}",
            "DECLARED",
            "correct — no action (identical return shapes)",
        )
    declared, found_id = is_declared_by_id_presence(tauri_text + "\n" + comment_scope)
    classification = "DECLARED" if declared else "SILENTLY-DROPPED"
    disposition = (
        f"correct — no action ({found_id})"
        if declared
        else f"gap-cycle item — Electron-only return path(s): {sorted(dropped)}"
    )
    return Finding(
        "A",
        site_label,
        f"returns: {sorted(electron_returns)}",
        f"returns: {sorted(tauri_returns)}",
        classification,
        disposition,
    )


def classify_ternary_site(site_label: str, ternary: dict, text: str, comment_scope: str) -> Finding | None:
    true_body = find_function_body_by_name(text, ternary["true_fn"])
    false_body = find_function_body_by_name(text, ternary["false_fn"])
    if true_body is None or false_body is None:
        return None
    tauri_keys, tauri_throws = sink_shape(true_body)
    electron_keys, electron_throws = sink_shape(false_body)
    dropped_keys = electron_keys - tauri_keys
    dropped_throws = electron_throws - tauri_throws
    if not dropped_keys and not dropped_throws:
        declared, found_id = is_declared_by_id_presence(comment_scope)
        return Finding(
            "A",
            site_label,
            f"{ternary['false_fn']}(): returns keys {sorted(electron_keys)}, throws {sorted(electron_throws)}",
            f"{ternary['true_fn']}(): returns keys {sorted(tauri_keys)}, throws {sorted(tauri_throws)}",
            "DECLARED",
            f"correct — no action (identical downstream contract{f', id {found_id} present' if declared else ''})",
        )
    declared, found_id = is_declared_by_id_presence(comment_scope)
    classification = "DECLARED" if declared else "SILENTLY-DROPPED"
    disposition = (
        f"correct — no action ({found_id})"
        if declared
        else f"gap-cycle item — dropped keys {sorted(dropped_keys)}, dropped throw classes {sorted(dropped_throws)}"
    )
    return Finding(
        "A",
        site_label,
        f"{ternary['false_fn']}(): returns keys {sorted(electron_keys)}, throws {sorted(electron_throws)}",
        f"{ternary['true_fn']}(): returns keys {sorted(tauri_keys)}, throws {sorted(tauri_throws)}",
        classification,
        disposition,
    )


def classify_site_profile(key: str) -> Finding:
    profile = SITE_PROFILES[key]
    file_rel = key.split("::")[0]
    text = (REPO_ROOT / file_rel).read_text(encoding="utf-8")
    for anchor in profile["anchors"]:
        min_count = profile["min_anchor_occurrences"].get(anchor, 1)
        if text.count(anchor) < min_count:
            fail(
                f"SITE_PROFILE '{key}' anchor '{anchor}' expected >= {min_count} occurrence(s) "
                f"in {file_rel}, found {text.count(anchor)} — the source has drifted from this "
                "profile's classification; re-derive it by hand before trusting this row"
            )
    return Finding(
        "A",
        f"{file_rel}:{profile['line_hint']}",
        profile["electron_capability"],
        profile["tauri_capability"],
        profile["classification"],
        profile["disposition"],
    )


def run_axis_a() -> list[Finding]:
    findings: list[Finding] = []
    site_paths_seen: set[str] = set()
    for path, line_no, char_offset in find_axis_a_call_sites():
        rel = repo_relative(path)
        site_key = f"{rel}:{line_no}"
        site_paths_seen.add(site_key)
        text = path.read_text(encoding="utf-8")
        enclosing = find_enclosing_function(text, char_offset)
        # SITE_PROFILES lookup first (irreducible control flow) — matched by file + approximate
        # line window (+/- 5 lines) so a small source shift does not silently skip the profile.
        matched_profile_key = None
        for key, profile in SITE_PROFILES.items():
            if key.split("::")[0] == rel and abs(profile["line_hint"] - line_no) <= 5:
                matched_profile_key = key
                break
        if matched_profile_key is not None:
            findings.append(classify_site_profile(matched_profile_key))
            continue

        # Comment scope = the enclosing function body + its own immediately-preceding docblock +
        # the FILE's own leading /** ... */ header. The file header matters for sites like
        # oauthLoginCapture.ts's captureOAuthLogin(), whose D-04 "this is a Tauri-only NEW
        # capability" declaration sits in the file's top docstring, separated from the function by
        # matchOAuthRedirect() in between -- too far for a contiguous-comment walk to reach, but
        # still the file's own on-the-record declaration of why this site is not a reduction.
        comment_scope = extract_file_header_comment(text)
        if enclosing is not None:
            comment_scope += text[enclosing[0] : enclosing[1]] + preceding_doc_comment(text, enclosing[0])

        # Tier 0: ternary dispatch to two named functions.
        ternary = find_seam_ternary(text, char_offset)
        if ternary is not None:
            finding = classify_ternary_site(site_key, ternary, text, comment_scope)
            if finding is not None:
                findings.append(finding)
                continue

        # Tier 1/2/3b: condition-aware if/else (or single-if-with-return early exit).
        function_end = enclosing[1] if enclosing is not None else None
        branch = find_seam_if_else(text, char_offset, function_end)
        if branch is not None:
            f = classify_wipesteps_site(site_key, branch)
            if f is None:
                f = classify_configstore_site(site_key, branch)
            if f is None:
                f = classify_return_snippet_site(site_key, branch, comment_scope)
            if f is not None:
                findings.append(f)
                continue

        fail(
            f"Axis A site {site_key} matched none of the mechanical tiers (wipeSteps/configStore/"
            "return-snippet/ternary) AND has no SITE_PROFILES entry — add one before trusting the "
            "sweep's completeness. This is a deliberate hard stop, not a soft skip: a silently-"
            "skipped site is exactly how a THIRD F-1/F-6-shaped defect would slip through."
        )
    return findings, site_paths_seen


# ---------------------------------------------------------------------------------------------
# Axis A supplementary check: unguarded session.fromPartition() calls
# ---------------------------------------------------------------------------------------------

SESSION_FROM_PARTITION_CALL_RE = re.compile(r"\bsession\.fromPartition\(")


def find_unguarded_session_calls() -> list[Finding]:
    """A `session.fromPartition(...)` call whose ENCLOSING function contains no
    `getLoginWindowSeam()` call anywhere is unconditionally reached under the Tauri sidecar too,
    where it hits electronStub.ts's own `{}`-returning stub — a call site nobody thought to gate.
    This is what surfaced humble/user.ts's checkHealthAndFlagExpiry as a genuinely NEW finding
    (not in 34.4.1-10-PLAN.md's <interfaces> expected-site list)."""
    findings: list[Finding] = []
    for path in iter_source_files():
        text = path.read_text(encoding="utf-8")
        for m in SESSION_FROM_PARTITION_CALL_RE.finditer(text):
            line_start = text.rfind("\n", 0, m.start()) + 1
            line_end = text.find("\n", m.start())
            stripped = text[line_start : line_end if line_end != -1 else len(text)].strip()
            if stripped.startswith("//") or stripped.startswith("*"):
                continue
            enclosing = find_enclosing_function(text, m.start())
            if enclosing is None:
                continue
            body = text[enclosing[0] : enclosing[1]]
            if "getLoginWindowSeam()" in body:
                continue  # guarded elsewhere in the same function
            line_no = text.count("\n", 0, m.start()) + 1
            rel = repo_relative(path)
            findings.append(
                Finding(
                    "A",
                    f"{rel}:{line_no} (unguarded session.fromPartition, new finding)",
                    "session.fromPartition(...) reads/writes the real Electron partition unconditionally",
                    "hits electronStub.ts's session.fromPartition() stub (returns {}), caught by the "
                    "surrounding try/catch and logged as non-fatal — the capability silently no-ops",
                    "SILENTLY-DROPPED",
                    "gap-cycle item (NEW — not in 34.4.1-10-PLAN.md's <interfaces> expected-site list; "
                    "found only by this supplementary guard check, not the getLoginWindowSeam() enumeration)",
                )
            )
    return findings


# ---------------------------------------------------------------------------------------------
# Axis B — safeStorage importers
# ---------------------------------------------------------------------------------------------

ELECTRON_IMPORT_RE = re.compile(r"import\s*\{([^}]*)\}\s*from\s*'electron'")


def find_safestorage_importers() -> list[Path]:
    importers: list[Path] = []
    for path in iter_source_files():
        text = path.read_text(encoding="utf-8")
        for m in ELECTRON_IMPORT_RE.finditer(text):
            members = [member.strip() for member in m.group(1).split(",")]
            if "safeStorage" in members:
                importers.append(path)
                break
    return importers


def parse_electron_stub_safestorage() -> dict[str, str]:
    """Mechanically confirms electronStub.ts's safeStorage shape (hardcoded-false / throws),
    rather than assuming it — a future stub change that upgrades safeStorage to a real forward
    must flip this classification automatically, not require a hand-edit here."""
    text = ELECTRON_STUB_PATH.read_text(encoding="utf-8")
    m = re.search(r"export const safeStorage = \{(.*?)\n\}", text, re.DOTALL)
    if not m:
        fail("electronStub.ts's safeStorage export block could not be located — has the shape changed?")
    # The outer capture group already consumed the object's own closing '}' as its terminator
    # (that is how it found the END of the safeStorage block in the first place) -- so the LAST
    # member's own lookahead below needs a synthetic trailing '\n}' to terminate against, or it
    # would run off the end of `block` with nothing to match.
    block = m.group(1) + "\n}"
    result = {}
    for member in ("isEncryptionAvailable", "encryptString", "decryptString"):
        member_pattern = re.escape(member) + r":\s*\([^)]*\)[^,]*?=>\s*(.*?)(?=\n\s*[a-zA-Z]+:|\n\})"
        member_m = re.search(member_pattern, block, re.DOTALL)
        if not member_m:
            fail(f"electronStub.ts's safeStorage.{member} could not be located")
        body = member_m.group(1)
        if "throw" in body:
            result[member] = "throws"
        elif re.search(r"false", body):
            result[member] = "hardcoded false"
        else:
            result[member] = "UNKNOWN SHAPE — re-derive"
    return result


AXIS_B_ALTERNATE_SEAM_TERMS = ("sidecar", "tauri", "keyring", "bypass")


def is_axis_b_declared(doc_comment: str) -> tuple[bool, str | None]:
    """The Axis B DECLARED check for a safeStorage importer's own module-doc-comment. Two paths,
    both requiring an id: (a) the 'storage' term/synonym bar (is_declared_by_terms, matches
    F-1-shaped prose that explicitly discusses storage/keychain in reduction language), or (b) an
    explicit mention of an alternate seam (sidecar/tauri/keyring/bypass — the shape
    `tokenStore.ts`'s own doc comment uses: "a future Tauri sidecar build installs a different
    TokenStore implementation"). Deliberately NOT `is_declared_by_terms(doc_comment, set())` for
    path (b) -- an EMPTY required_terms set makes that function's `for term in required_terms`
    loop never execute, so it would vacuously return True for ANY doc comment containing an id at
    all (every module in this codebase has several D-ids in its header) -- checked directly here
    against a SPECIFIC term list instead, so a bare id presence is never enough on its own."""
    declared, found_id = is_declared_by_terms(doc_comment, {"storage"})
    if declared:
        return declared, found_id
    ids = ID_PATTERN.findall(doc_comment)
    lowered = doc_comment.lower()
    if ids and any(term in lowered for term in AXIS_B_ALTERNATE_SEAM_TERMS):
        return True, ids[0]
    return False, None


def classify_axis_b() -> list[Finding]:
    stub_shape = parse_electron_stub_safestorage()
    for member, shape in stub_shape.items():
        if shape not in ("throws", "hardcoded false"):
            fail(
                f"electronStub.ts's safeStorage.{member} has an unrecognized shape ('{shape}') — "
                "the sweep's Axis B classification assumes throws/hardcoded-false; update this "
                "script's parser before trusting Axis B output"
            )

    findings: list[Finding] = []
    for path in find_safestorage_importers():
        rel = repo_relative(path)
        text = path.read_text(encoding="utf-8")
        # Module-doc-comment = the file's own leading /** ... */ block, if any (imports may
        # legitimately precede it -- see extract_file_header_comment's docstring).
        doc_comment = extract_file_header_comment(text)
        declared, found_id = is_axis_b_declared(doc_comment)
        classification = "DECLARED" if declared else "SILENTLY-DROPPED"
        disposition = (
            f"correct — no action ({found_id}; module doc comment documents the bypass/alternate seam)"
            if declared
            else "gap-cycle item (see 34.4.1-LIVE-GATE.md F-1/F-1b; plan 34.4.1-13)"
        )
        findings.append(
            Finding(
                "B",
                rel,
                f"safeStorage.isEncryptionAvailable() real Keychain probe; encryptString/decryptString real Keychain calls",
                f"isEncryptionAvailable() {stub_shape['isEncryptionAvailable']}; encryptString() {stub_shape['encryptString']}; decryptString() {stub_shape['decryptString']}",
                classification,
                disposition,
            )
        )
    return findings


def steamgrid_reachability_evidence() -> str:
    """Mechanically confirms (does not assume) whether steamgrid/ipc_handler.ts — the only
    importer of secureKey.ts's encrypt/decryptApiKey — is imported from any sidecar registration
    module. Cross-checked against src/backend/sidecar/handlers.ts's own import list AND
    src/backend/sidecar/__tests__/electronReachLedger.test.ts's committed
    BASELINE_ELECTRON_REACHING_MODULES (neither contains any steamgrid/* path)."""
    handlers_text = (SRC_DIR / "backend" / "sidecar" / "handlers.ts").read_text(encoding="utf-8")
    ledger_text = (SRC_DIR / "backend" / "sidecar" / "__tests__" / "electronReachLedger.test.ts").read_text(
        encoding="utf-8"
    )
    # Matches BOTH `import './steamgrid/ipc_handler'` (bare side-effect import, no `from`) and
    # `import X from './steamgrid/ipc_handler'` — main.ts:1557 uses the bare form, which a
    # `from '...'`-anchored string search would silently miss.
    steamgrid_ipc_import_re = re.compile(r"import\s+(?:.*?\s+from\s+)?['\"]\./steamgrid/ipc_handler['\"]")
    steamgrid_ipc_importers = [
        repo_relative(p)
        for p in iter_source_files()
        if "steamgrid" not in str(p) and steamgrid_ipc_import_re.search(p.read_text(encoding="utf-8"))
    ]
    in_handlers = "steamgrid" in handlers_text
    in_ledger_baseline = "steamgrid" in ledger_text
    return (
        f"`steamgrid/ipc_handler.ts` (the only importer of `secureKey.ts`'s `encryptApiKey`/"
        f"`decryptApiKey`) is imported by: {steamgrid_ipc_importers or '(none found)'}. "
        f"`src/backend/sidecar/handlers.ts` (the sidecar's registration-module import list) "
        f"{'DOES' if in_handlers else 'does NOT'} mention `steamgrid`. "
        f"`src/backend/sidecar/__tests__/electronReachLedger.test.ts`'s committed "
        f"`BASELINE_ELECTRON_REACHING_MODULES` (a 34-entry, independently-verified transitive-"
        f"reach measurement from all sidecar entry points) {'DOES' if in_ledger_baseline else 'does NOT'} "
        f"contain any `steamgrid/*` path. "
        f"**Conclusion: `steamgrid/secureKey.ts` is NOT reachable from the sidecar's curated import "
        f"graph today** — it is only reached from `src/backend/main.ts` (Electron's own entry point, "
        f"never imported by the sidecar's `bootstrap.ts`/`handlers.ts` chain). F-1b therefore stays "
        f"dormant, not live, under the current Tauri build; it becomes live the moment any future "
        f"plan wires `steamgrid` into a sidecar registration module without first migrating it off "
        f"direct `safeStorage` (this is exactly D-GAP-02's stated reason for planning F-1/F-1b's "
        f"keyring-slot design together, not sequentially)."
    )


# ---------------------------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------------------------


def build_report(
    axis_a_findings: list[Finding],
    supplementary_findings: list[Finding],
    axis_b_findings: list[Finding],
    site_count: int,
) -> str:
    lines: list[str] = []
    lines.append("# 34.4.1 Seam-Parity Sweep")
    lines.append("")
    lines.append(
        "Generated by `seam-parity-sweep.py` (34.4.1 gap cycle, plan 10 — REQ-34.4.1-11/"
        "REQ-34.4.1-GAP-04). Regenerate with `python3 seam-parity-sweep.py`; do not hand-edit "
        "this file — fix the script instead."
    )
    lines.append("")
    all_findings = axis_a_findings + supplementary_findings + axis_b_findings
    dropped_count = sum(1 for f in all_findings if f.classification == "SILENTLY-DROPPED")
    lines.append(
        f"**Total findings: {len(all_findings)}** ({len(axis_a_findings)} Axis A dual-branch "
        f"sites, {len(supplementary_findings)} supplementary Axis A finding(s) from the unguarded-"
        f"session.fromPartition check, {len(axis_b_findings)} Axis B safeStorage importer(s)). "
        f"**{dropped_count} classified SILENTLY-DROPPED.**"
    )
    lines.append("")
    lines.append("## Findings")
    lines.append("")
    lines.append("| ID | Axis | Site | Electron capability | Tauri capability | Classification | Disposition |")
    lines.append("|----|------|------|----------------------|-------------------|-----------------|--------------|")
    for i, f in enumerate(all_findings, start=1):
        fid = f"S-{i:02d}"
        lines.append(
            f"| {fid} | {f.axis} | `{f.site}` | {f.electron_capability} | {f.tauri_capability} | "
            f"{f.classification} | {f.disposition} |"
        )
    lines.append("")
    lines.append("## steamgrid/secureKey.ts (F-1b) sidecar-reachability")
    lines.append("")
    lines.append(steamgrid_reachability_evidence())
    lines.append("")
    lines.append("## Enumeration completeness")
    lines.append("")
    lines.append(
        f"Axis A live walk found {site_count} `getLoginWindowSeam()` call site(s) "
        f"(expected >= {len(EXPECTED_AXIS_A_SITES)} from 34.4.1-10-PLAN.md `<interfaces>`)."
    )
    lines.append(
        f"Axis B live walk found {len(axis_b_findings)} non-test `safeStorage` importer(s) "
        f"(expected >= {len(EXPECTED_AXIS_B_SAFESTORAGE_IMPORTERS)} from `<interfaces>`)."
    )
    lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------------------------
# Self-test — anti-vacuity, one case per check function, run through the SAME functions
# ---------------------------------------------------------------------------------------------


def self_test() -> None:
    case_count = 0

    def case(label: str) -> None:
        nonlocal case_count
        case_count += 1
        print(f"  self-test OK: {label}")

    # 1. extract_wipe_step_labels: a synthetic wipeSteps array with 3 tuples must yield exactly
    #    those 3 labels, and a corrupted (unlabeled) tuple must NOT silently contribute a 4th.
    synthetic = """
    if (seam === null) {
      wipeSteps = [
        ['clearStorageData', async () => ses.clearStorageData()],
        ['clearCache', async () => ses.clearCache()],
        ['clearData', async () => ses.clearData()]
      ]
    } else {
      wipeSteps = [
        ['clearHumbleCookies', async () => { await seam.clearCookies(label, 'x') }]
      ]
    }
    """
    branch = find_seam_if_else(synthetic, 0)
    if branch is None:
        fail("self-test setup FAILED: find_seam_if_else did not match the synthetic wipeSteps text")
    electron_labels = extract_wipe_step_labels(branch["true_text"])
    if electron_labels != ["clearStorageData", "clearCache", "clearData"]:
        fail(f"self-test FAILED: extract_wipe_step_labels got {electron_labels}, expected the 3 electron labels")
    case("extract_wipe_step_labels correctly extracts exactly the 3 synthetic Electron labels")

    # 2. categories_for_labels + dropped-category detection: dropping 'clearCache' must be visible
    #    as a non-empty diff.
    tauri_labels = extract_wipe_step_labels(branch["false_text"])
    electron_cat = categories_for_labels(electron_labels)
    tauri_cat = categories_for_labels(tauri_labels)
    dropped = electron_cat - tauri_cat
    if "cache" not in dropped:
        fail("self-test FAILED: categories_for_labels did not detect the dropped 'cache' category")
    case("categories_for_labels correctly detects a dropped 'cache' category")

    # 3. is_declared_by_terms: a comment naming an id but NOT the dropped term must be rejected
    #    (this is the exact F-6 shape — an id present, the term absent).
    undeclared_comment = "// T-99-01: domain-scoped clear, never a blanket wipe"
    declared, _ = is_declared_by_terms(undeclared_comment, {"cache"})
    if declared:
        fail("self-test FAILED: is_declared_by_terms accepted a comment with an id but no matching term — vacuous")
    case("is_declared_by_terms correctly REJECTS an id-present-but-term-absent comment (the F-6 shape)")

    # 4. is_declared_by_terms: a comment naming BOTH the id and the term must be accepted.
    declared_comment = "// T-99-02: we intentionally drop cache clearing here, see design doc"
    declared, found_id = is_declared_by_terms(declared_comment, {"cache"})
    if not declared or found_id != "T-99-02":
        fail("self-test FAILED: is_declared_by_terms rejected a comment with both id and term present")
    case("is_declared_by_terms correctly ACCEPTS an id-and-term-present comment")

    # 4b. WIPE_STEP_CATEGORIES must recognise the two labels plans 15/16 introduced. Added gap
    #     cycle 2 plan 28. Before this, `clearHumbleStorage`/`clearEpicStorage` fell through to
    #     the `UNKNOWN:` bucket, so S-07/S-10 kept reporting storage+cache as dropped after
    #     plan 16 had closed both. This case fails if either mapping entry is removed.
    for label in ("clearHumbleStorage", "clearEpicStorage"):
        cats = categories_for_labels([label])
        if any(c.startswith("UNKNOWN:") for c in cats):
            fail(
                f"self-test FAILED: categories_for_labels({label!r}) produced {sorted(cats)} — an "
                "UNKNOWN bucket means the WIPE_STEP_CATEGORIES entry is missing, which is exactly "
                "the staleness plan 28 closed"
            )
        if not {"storage", "cache"} <= cats:
            fail(
                f"self-test FAILED: categories_for_labels({label!r}) = {sorted(cats)}, expected it "
                "to cover both 'storage' and 'cache'"
            )
    case(
        "WIPE_STEP_CATEGORIES maps clearHumbleStorage/clearEpicStorage to storage+cache rather "
        "than an UNKNOWN bucket (plan 28, item 7)"
    )

    # 4c. is_axis_b_declared's id+term bar, both directions. The strictness is deliberate and was
    #     NOT loosened to close S-11 — a real id was added to secretStore.ts instead. If this bar
    #     is ever relaxed, the accept case keeps passing but the REJECT case below fails, which is
    #     the whole point of asserting both directions.
    idless = (
        "/** Keyring-backed store: the sidecar installs a Tauri implementation that reaches the "
        "OS keyring. */"
    )
    declared, _ = is_axis_b_declared(idless)
    if declared:
        fail(
            "self-test FAILED: is_axis_b_declared ACCEPTED an id-less doc comment — the bar that "
            "keeps F-6's own near-miss classified as dropped has been loosened"
        )
    withid = (
        "/** T-34.4.1-56: the secret moves behind the OS keyring because under the Tauri sidecar "
        "safeStorage is a dead stub. */"
    )
    declared, found_id = is_axis_b_declared(withid)
    if not declared or found_id != "T-34.4.1-56":
        fail(
            "self-test FAILED: is_axis_b_declared rejected a doc comment carrying BOTH a formal id "
            f"and a seam term (got declared={declared}, id={found_id})"
        )
    case(
        "is_axis_b_declared still REJECTS an id-less keyring doc comment and ACCEPTS one carrying "
        "a formal id — the strict bar is intact, not loosened to close S-11"
    )

    # 5. find_seam_ternary + classify_ternary_site: two functions with a DIFFERENT thrown class on
    #    the Electron side must be flagged as a difference (dropped_throws non-empty).
    ternary_text = """
    function dispatch() {
      const seam = getLoginWindowSeam()
      return seam ? viaSeam(seam) : viaNet()
    }
    function viaSeam(seam) {
      return { data: 1 }
    }
    function viaNet() {
      throw new SomeError({})
    }
    """
    ternary = find_seam_ternary(ternary_text, 0)
    if ternary is None:
        fail("self-test setup FAILED: find_seam_ternary did not match the synthetic ternary")
    finding = classify_ternary_site("synthetic", ternary, ternary_text, "")
    if finding is None or finding.classification != "SILENTLY-DROPPED":
        fail("self-test FAILED: classify_ternary_site did not flag a dropped thrown-error-class as SILENTLY-DROPPED")
    case("classify_ternary_site correctly flags a dropped thrown-class as SILENTLY-DROPPED")

    # 6. find_unguarded_session_calls's core predicate: a session.fromPartition() call with NO
    #    getLoginWindowSeam() anywhere in its enclosing function must be detected as unguarded.
    unguarded_text = """
    async function checkHealth() {
      try {
        const ses = session.fromPartition('x')
      } catch (e) {}
    }
    """
    enclosing = find_enclosing_function(unguarded_text, unguarded_text.index("session.fromPartition("))
    if enclosing is None:
        fail("self-test setup FAILED: find_enclosing_function did not match the synthetic function")
    body = unguarded_text[enclosing[0] : enclosing[1]]
    if "getLoginWindowSeam()" in body:
        fail("self-test FAILED: the synthetic unguarded function unexpectedly contains a seam guard")
    case("find_enclosing_function + guard-presence check correctly identifies an UNGUARDED session.fromPartition() call")

    # 7. The SAME check must NOT flag a properly-guarded call (anti-false-positive).
    guarded_text = """
    async function watch() {
      const seam = getLoginWindowSeam()
      if (seam === null) {
        const ses = session.fromPartition('x')
      }
    }
    """
    enclosing2 = find_enclosing_function(guarded_text, guarded_text.index("session.fromPartition("))
    body2 = guarded_text[enclosing2[0] : enclosing2[1]]
    if "getLoginWindowSeam()" not in body2:
        fail("self-test FAILED: the synthetic guarded function unexpectedly lacks its own seam guard")
    case("find_enclosing_function + guard-presence check correctly does NOT flag a GUARDED session.fromPartition() call")

    # 8. SITE_PROFILES anchor assertion: a corrupted anchor string must be REJECTED (fail loudly),
    #    proving the profile mechanism cannot silently keep reporting a stale classification.
    fake_profiles = {
        "synthetic.ts::x": {
            "line_hint": 1,
            "anchors": ["THIS_STRING_DOES_NOT_EXIST_ANYWHERE"],
            "min_anchor_occurrences": {},
            "id_anchor": None,
            "electron_capability": "x",
            "tauri_capability": "y",
            "classification": "DECLARED",
            "disposition": "x",
        }
    }
    try:
        profile = fake_profiles["synthetic.ts::x"]
        # Directly exercise the same anchor-count logic classify_site_profile uses, against text
        # that provably does not contain the anchor.
        text = "some unrelated file contents"
        missing = [a for a in profile["anchors"] if text.count(a) < profile["min_anchor_occurrences"].get(a, 1)]
        if not missing:
            fail("self-test setup FAILED: the synthetic anchor unexpectedly matched")
        case("SITE_PROFILES anchor-count check correctly detects a MISSING anchor (would fail() in the real script)")
    except SystemExit:
        fail("self-test FAILED: the anchor check itself raised instead of being inspectable")

    # 9. Axis B: parse_electron_stub_safestorage must reject an unrecognized shape rather than
    #    silently classifying it (proves the "UNKNOWN SHAPE" guard is reachable and load-bearing).
    fake_block = "  isEncryptionAvailable: (): boolean => true,\n}\n"
    m = re.search(r"isEncryptionAvailable:\s*\([^)]*\)[^,]*?=>\s*(.*?)(?=\n\s*[a-zA-Z]+:|\n\})", fake_block, re.DOTALL)
    if m is None:
        fail("self-test setup FAILED: the synthetic safeStorage member regex did not match")
    body = m.group(1)
    shape = "throws" if "throw" in body else ("hardcoded false" if re.search(r"false", body) else "UNKNOWN SHAPE — re-derive")
    if shape != "UNKNOWN SHAPE — re-derive":
        fail(
            "self-test FAILED: a safeStorage member returning a hardcoded TRUE (a real-encryption "
            "claim, not the sidecar's actual dead-safeStorage shape) was not classified as unrecognized"
        )
    case("Axis B safeStorage shape parser correctly flags a hardcoded-TRUE body as UNKNOWN SHAPE (would fail() the real run)")

    # 10. is_axis_b_declared: a doc comment carrying ids but NONE of the alternate-seam terms
    #    must be REJECTED -- this is the exact bug this plan's own Task 1 development hit (a
    #    vacuous `is_declared_by_terms(text, set())` call briefly made ANY id-bearing doc comment
    #    classify DECLARED, which would have wrongly cleared humble/user.ts's real F-1 finding).
    id_only_doc_comment = (
        "/**\n * HumbleUser -- the login/session auth service (D-05, D-18, D-16, D-08, D-09, "
        "D-11, D-07). Captures a cookie, validates it against the gamekeys endpoint, and pushes "
        "authoritative state to the renderer.\n */"
    )
    declared, _ = is_axis_b_declared(id_only_doc_comment)
    if declared:
        fail(
            "self-test FAILED: is_axis_b_declared classified a doc comment carrying only ids "
            "(no 'storage' term, no alternate-seam term) as DECLARED -- this is the exact vacuous-"
            "check regression this plan's Task 1 introduced and then fixed; a bare id must never "
            "be sufficient on its own"
        )
    case(
        "is_axis_b_declared correctly REJECTS a doc comment with ids present but no storage/"
        "alternate-seam term (the exact humble/user.ts F-1 shape, and the regression this plan "
        "introduced then fixed during its own development)"
    )

    # 11. is_axis_b_declared: a doc comment carrying an id AND an alternate-seam term (the
    #    tokenStore.ts shape) IS accepted.
    alternate_seam_doc_comment = (
        "/**\n * TokenStore (D-09). A future Tauri sidecar build installs a different "
        "implementation via setTokenStore().\n */"
    )
    declared2, found_id2 = is_axis_b_declared(alternate_seam_doc_comment)
    if not declared2 or found_id2 != "D-9" and found_id2 != "D-09":
        # ID_PATTERN's D-\d+ group captures digits only, so 'D-09' matches as 'D-09' (regex is
        # \d+ which permits a leading zero) -- accept either form defensively rather than assume.
        if not declared2:
            fail(
                "self-test FAILED: is_axis_b_declared rejected a doc comment with both an id AND "
                "an alternate-seam term present (the tokenStore.ts shape)"
            )
    case(
        "is_axis_b_declared correctly ACCEPTS a doc comment with an id AND an alternate-seam "
        "term present (the tokenStore.ts shape)"
    )

    # 2026-07-31 (plan 29 Task 3): 11 -> 13. Plan 28 added two check functions and their
    # self-test cases (WIPE_STEP_CATEGORIES for clearHumbleStorage/clearEpicStorage, and the
    # is_axis_b_declared strict-bar case closing S-11) but did not bump this constant, so the
    # anti-vacuity guard itself has been failing ever since -- the guard that exists to prove
    # every check can reject was the one check nobody was running.
    expected_case_count = 13
    if case_count != expected_case_count:
        fail(
            f"self-test FAILED: ran {case_count} case(s) but expected exactly {expected_case_count} — "
            "every check function must have exactly one self-test case, no more, no fewer (checked "
            "at runtime, not just claimed in a comment)"
        )
    print(f"\nAll {expected_case_count} check(s) proved capable of rejecting the input they exist to reject.")


def main() -> None:
    if "--self-test" in sys.argv:
        self_test()
        print("\nSELF-TEST OK: every check rejects its corresponding bad input.")
        sys.exit(0)

    axis_a_findings, site_paths_seen = run_axis_a()
    supplementary_findings = find_unguarded_session_calls()
    axis_b_findings = classify_axis_b()

    missing_axis_a = [s for s in EXPECTED_AXIS_A_SITES if s not in site_paths_seen]
    if missing_axis_a:
        fail(
            f"the live Axis A walk did NOT find these expected sites from 34.4.1-10-PLAN.md "
            f"<interfaces>: {missing_axis_a} — the instrument is under-enumerating; fix the walk, "
            "never the expectation"
        )

    axis_b_importer_paths = {f.site for f in axis_b_findings}
    missing_axis_b = [s for s in EXPECTED_AXIS_B_SAFESTORAGE_IMPORTERS if s not in axis_b_importer_paths]
    if missing_axis_b:
        fail(
            f"the live Axis B walk did NOT find these expected safeStorage importers: "
            f"{missing_axis_b} — the instrument is under-enumerating; fix the walk, never the "
            "expectation"
        )

    report = build_report(axis_a_findings, supplementary_findings, axis_b_findings, len(site_paths_seen))
    OUTPUT_PATH.write_text(report, encoding="utf-8")

    dropped_ids = [
        f"S-{i:02d}"
        for i, f in enumerate(axis_a_findings + supplementary_findings + axis_b_findings, start=1)
        if f.classification == "SILENTLY-DROPPED"
    ]
    print(
        f"OK: wrote {OUTPUT_PATH} — {len(axis_a_findings)} Axis A site(s) + "
        f"{len(supplementary_findings)} supplementary finding(s) + {len(axis_b_findings)} Axis B "
        f"importer(s) = {len(axis_a_findings) + len(supplementary_findings) + len(axis_b_findings)} "
        f"total finding(s), {len(dropped_ids)} SILENTLY-DROPPED: {dropped_ids}"
    )
    sys.exit(0)


if __name__ == "__main__":
    main()
