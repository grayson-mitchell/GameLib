#!/usr/bin/env node
/**
 * 34.10-run4-contract-check.mjs
 *
 * Decides whether the run-4 live-gate contract (34.10-LIVE-GATE.md §10.5) is COMPLETE
 * (every verdict slot filled, frontmatter internally consistent) or INCOMPLETE.
 *
 * WHY THIS EXISTS -- F-34.10-07, six recorded collision shapes from run 3's own checker
 * (34.10-LIVE-GATE.md frontmatter, findings: F-34.10-07). This script is designed NOT to
 * repeat any of them:
 *
 *   (1) Run 3's check grepped all of §9 for a literal pending-placeholder STRING, so
 *       authoring prose that merely DESCRIBED the placeholder tripped the same assertion
 *       as a genuinely unfilled slot.
 *       >>> This script never greps for a placeholder token. A slot is "unfilled" only
 *           if the actual table cell / verdict-line text, once parsed structurally, is
 *           empty -- prose elsewhere can say anything it wants about blankness.
 *
 *   (2) The same check rejected any literal `[ ]` anywhere in §9, which the preflight
 *       block's own `[x] pass / [ ] fail` multiple-choice format guarantees will always
 *       contain, even fully filled in.
 *       >>> This script never inspects §10.2's Preflight Results block at all. It slices
 *           the document starting at the `### 10.5` heading, so anything before it
 *           (including every `[ ]` in the preflight table) is structurally out of scope.
 *
 *   (3) It counted verdict cells by the bare literal `| PASS |`, so Markdown emphasis
 *       around a verdict (`**PASS**`) made resolved cells invisible to it.
 *       >>> This script strips `*` and backtick characters (and surrounding whitespace)
 *           before classifying a value, then upper-cases it. `**PASS**` and `PASS`
 *           normalise identically.
 *
 *   (4) It asserted each finding's status inside a fixed 600-character window after the
 *       finding's ID, so a verbose summary pushed the finding's own `status` key outside
 *       that window.
 *       >>> This script never scans a fixed-width window after any string. There is no
 *           finding-ID-relative window logic anywhere below.
 *
 *   (5) It located each finding by `indexOf(id)`, matching the FIRST occurrence of that ID
 *       string anywhere in the frontmatter -- including inside items[].findings
 *       cross-reference arrays, which legitimately mention an ID before (or instead of)
 *       the finding's own canonical entry.
 *   (6) (same class again) prose about scored cells was indistinguishable from actually
 *       scored cells, for the same structural reason as (5).
 *       >>> This script never looks up individual findings by ID at all. Its frontmatter
 *           consistency check only reads `items[].status`, `items_passed` and `verdict` --
 *           three scalar/array fields read directly via the parsed YAML object graph
 *           (js-yaml), never via string search. No `indexOf(` is ever applied to a finding
 *           ID, and no fixed-character-width substring is ever taken.
 *
 * DESIGN RULE: parse STRUCTURE, not literal strings. Markdown table rows and a fixed
 * per-item verdict-line form are the only two places a verdict may live; both are parsed
 * by their shape (leading/trailing `|`, or the `**Item N verdict**...:` line form), never
 * by grepping for an expected value.
 *
 * Usage: node 34.10-run4-contract-check.mjs <path-to-live-gate-markdown>
 * Exit 0  => contract COMPLETE (unfilled === 0, invalid === 0, frontmatter consistent)
 * Exit 1  => contract INCOMPLETE, or a structural/parse problem
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

// Matched as an ANCHORED markdown heading (start of line), never as a bare substring --
// prose earlier in §10's own preamble refers to "### 10.5 Run 4 -- the items" inside
// backticks (naming what this plan writes), and a plain `content.indexOf("### 10.5")`
// finds that mention first. This is exactly F-34.10-07 collision (1)'s shape (prose
// describing a marker tripping the same match a real marker would), just against a
// section heading instead of a placeholder string -- anchoring to line-start is the fix.
const SECTION_HEADING_PATTERN = /^### 10\.5\b.*$/m;
const VERDICT_VALUES = new Set(["PASS", "FAIL", "NOT ATTEMPTED"]);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function readFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`File not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    fail("Could not locate a --- frontmatter block at the top of the file.");
  }
  try {
    return yaml.load(match[1]);
  } catch (err) {
    fail(`Frontmatter did not parse as YAML: ${err.message}`);
  }
  return null;
}

/** Normalise a raw cell/line value for classification. Strips markdown emphasis
 * (`*`, backticks) and surrounding whitespace, then upper-cases. This is what makes
 * `**PASS**`, `` `PASS` ``, and `PASS` all classify identically -- the direct fix for
 * collision (3). */
function normaliseVerdict(raw) {
  return raw.replace(/[*`]/g, "").trim().toUpperCase();
}

function classify(raw) {
  const trimmedRaw = raw.trim();
  if (trimmedRaw === "") {
    return { kind: "UNFILLED", raw: trimmedRaw };
  }
  const normalised = normaliseVerdict(raw);
  if (VERDICT_VALUES.has(normalised)) {
    return { kind: "RESOLVED", value: normalised, raw: trimmedRaw };
  }
  return { kind: "INVALID", raw: trimmedRaw };
}

/** Split a markdown table row line into its cell strings. Assumes the line has already
 * been confirmed to start and end with `|` (leading/trailing whitespace tolerated). */
function splitRowCells(line) {
  const trimmed = line.trim();
  const inner = trimmed.slice(1, -1); // strip the leading and trailing pipe only
  return inner.split("|").map((cell) => cell.trim());
}

/** A separator row is every cell matching optional-colon, one-or-more-dashes,
 * optional-colon (the standard markdown table header/body divider), and nothing else. */
function isSeparatorRow(cells) {
  if (cells.length === 0) return false;
  return cells.every((cell) => /^:?-+:?$/.test(cell.trim()));
}

function isTableRowLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 1;
}

/**
 * Parse every markdown table in `text` into { headerCells, verdictColumnIndexes, rows }.
 * A table is recognised structurally: a `|`-delimited line, immediately followed by a
 * `|`-delimited separator line (dashes/colons only), followed by zero or more further
 * `|`-delimited data rows, terminated by a non-table-row line or end of text.
 */
function parseTables(text) {
  const lines = text.split("\n");
  const tables = [];
  let i = 0;
  while (i < lines.length) {
    if (isTableRowLine(lines[i])) {
      const headerCells = splitRowCells(lines[i]);
      const nextLine = lines[i + 1];
      if (nextLine !== undefined && isTableRowLine(nextLine) && isSeparatorRow(splitRowCells(nextLine))) {
        // Confirmed: this is a real table header + separator pair.
        const table = { headerCells, rows: [] };
        tables.push(table);
        i += 2;
        while (i < lines.length && isTableRowLine(lines[i]) && !isSeparatorRow(splitRowCells(lines[i]))) {
          table.rows.push(splitRowCells(lines[i]));
          i += 1;
        }
        continue;
      }
    }
    i += 1;
  }
  return tables;
}

/** Any header cell whose text contains "erdict" (case-insensitive) is a verdict column --
 * matches "Verdict", "Seam verdict", "Idle ring verdict", etc., without assuming a fixed
 * column index (some of §10.5's tables carry two verdict columns in one row). */
function verdictColumnIndexes(headerCells) {
  return headerCells.reduce((acc, cell, idx) => {
    if (cell.toLowerCase().includes("erdict")) acc.push(idx);
    return acc;
  }, []);
}

function collectTableVerdicts(section) {
  const tables = parseTables(section);
  const slots = [];
  for (const table of tables) {
    const cols = verdictColumnIndexes(table.headerCells);
    if (cols.length === 0) continue;
    for (const row of table.rows) {
      for (const col of cols) {
        const rawCell = row[col] ?? "";
        slots.push({
          location: `table column "${table.headerCells[col]}" / row: ${row[0] ?? "(no leading cell)"}`,
          ...classify(rawCell),
        });
      }
    }
  }
  return slots;
}

/**
 * Per-item verdict lines take the exact form:
 *   **Item N verdict** (<PASS condition spelled out>): <VERDICT>
 * The greedy `.*` before the final required `:` naturally consumes up to the LAST colon
 * on the line, even though the PASS-condition parenthetical legitimately contains its own
 * colons -- there is no need to special-case that, and no fixed-window substring is taken.
 */
function collectLineVerdicts(section) {
  const lines = section.split("\n");
  const slots = [];
  const pattern = /^\*\*Item \d+ verdict\*\*.*:\s*(.*)$/;
  for (const line of lines) {
    const match = line.match(pattern);
    if (match) {
      slots.push({
        // Display-only truncation for the human-readable report line, via regex match
        // rather than slice(a, b) -- kept clear of any fixed-width-window shape at all,
        // even for logging, since that shape is exactly what collision (4) was.
        location: `verdict line: ${line.trim().match(/^.{0,60}/)[0]}...`,
        ...classify(match[1]),
      });
    }
  }
  return slots;
}

function checkFrontmatterConsistency(frontmatter, unfilledCount) {
  const problems = [];
  if (!frontmatter || !Array.isArray(frontmatter.items)) {
    problems.push("frontmatter.items is missing or not an array");
    return { consistent: false, problems };
  }
  const passCount = frontmatter.items.filter((item) => item.status === "pass").length;
  if (frontmatter.items_passed !== passCount) {
    problems.push(
      `items_passed (${frontmatter.items_passed}) does not match the count of items[].status === 'pass' (${passCount})`
    );
  }
  if (frontmatter.verdict === "pass" && frontmatter.items_passed !== 5) {
    problems.push(`verdict is 'pass' but items_passed is ${frontmatter.items_passed}, not 5`);
  }
  if (unfilledCount === 0) {
    const stillPending = frontmatter.items.filter((item) => item.status === "pending");
    if (stillPending.length > 0) {
      problems.push(
        `every §10.5 verdict slot is filled, but items[] still lists pending status for id(s): ${stillPending
          .map((i) => i.id)
          .join(", ")}`
      );
    }
  }
  return { consistent: problems.length === 0, problems };
}

function main() {
  const targetPath = process.argv[2];
  if (!targetPath) {
    fail("Usage: node 34.10-run4-contract-check.mjs <path-to-live-gate-markdown>");
  }
  const content = readFile(targetPath);

  const headingMatch = content.match(SECTION_HEADING_PATTERN);
  if (!headingMatch) {
    fail(`Could not find an anchored "### 10.5" heading (start of line) in ${targetPath}.`);
  }
  const section = content.slice(headingMatch.index);

  const frontmatter = extractFrontmatter(content);

  const tableSlots = collectTableVerdicts(section);
  const lineSlots = collectLineVerdicts(section);
  const allSlots = [...tableSlots, ...lineSlots];

  const resolved = allSlots.filter((s) => s.kind === "RESOLVED");
  const unfilled = allSlots.filter((s) => s.kind === "UNFILLED");
  const invalid = allSlots.filter((s) => s.kind === "INVALID");

  const { consistent, problems } = checkFrontmatterConsistency(frontmatter, unfilled.length);

  console.log(`Target: ${targetPath}`);
  console.log(`Total verdict slots found: ${allSlots.length}`);
  console.log(`  resolved: ${resolved.length}`);
  console.log(`  unfilled: ${unfilled.length}`);
  console.log(`  invalid:  ${invalid.length}`);
  if (invalid.length > 0) {
    console.log("Invalid values found (not PASS / FAIL / NOT ATTEMPTED):");
    for (const s of invalid) {
      console.log(`  - ${s.location} => "${s.raw}"`);
    }
  }
  console.log(`Frontmatter consistency: ${consistent ? "OK" : "FAILED"}`);
  if (!consistent) {
    for (const p of problems) {
      console.log(`  - ${p}`);
    }
  }

  const complete = unfilled.length === 0 && invalid.length === 0 && consistent;
  console.log(complete ? "RESULT: COMPLETE" : "RESULT: INCOMPLETE");
  process.exit(complete ? 0 : 1);
}

// Only run main() when executed directly (not when imported, e.g. from a future test file).
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  main();
}

export { parseTables, verdictColumnIndexes, classify, normaliseVerdict, collectTableVerdicts, collectLineVerdicts };
