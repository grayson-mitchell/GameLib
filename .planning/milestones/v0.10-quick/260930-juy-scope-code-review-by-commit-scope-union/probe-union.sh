#!/bin/bash
# Probe harness for quick task 260930-juy. Validated 2026-09-30 against phases 41, 34.6, 42.
# $1 = scope alternation (POSIX ERE, dots already escaped), $2 = DIFF_BASE, $3 = DIFF_HEAD
ALT="$1"; BASE="$2"; ANCHOR="$3"
filt() {
  /usr/bin/grep -v '^\.planning/' \
  | /usr/bin/grep -vxF 'ROADMAP.md' \
  | /usr/bin/grep -vxF 'STATE.md' \
  | /usr/bin/grep -v -- '-SUMMARY\.md$' \
  | /usr/bin/grep -v -- '-VERIFICATION\.md$' \
  | /usr/bin/grep -v -- '-PLAN\.md$' \
  | /usr/bin/grep -vxF 'package-lock.json' \
  | /usr/bin/grep -vxF 'yarn.lock' \
  | /usr/bin/grep -vxF 'Gemfile.lock' \
  | /usr/bin/grep -vxF 'poetry.lock'
}
SCOPED=$(git log --format="%H %s" | /usr/bin/grep -E "^[0-9a-f]+ [a-z]+\((phase-)?(${ALT})(-[0-9]+)?\)!?:" | cut -d' ' -f1)
NCOMMITS=$(printf '%s\n' "$SCOPED" | /usr/bin/grep -c . )
UNION_RAW=""
for c in $(printf '%s' "$SCOPED"); do
  UNION_RAW="${UNION_RAW}$(git show --format= --name-only "$c" 2>/dev/null)
"
done
UNION=$(printf '%s\n' "$UNION_RAW" | /usr/bin/grep -v '^$' | filt | sort -u)
NUNION=$(printf '%s\n' "$UNION" | /usr/bin/grep -c . )
RANGE=$(git diff --name-only "${BASE}..${ANCHOR}" -- . \
  ':!.planning/' ':!ROADMAP.md' ':!STATE.md' \
  ':!*-SUMMARY.md' ':!*-VERIFICATION.md' ':!*-PLAN.md' \
  ':!package-lock.json' ':!yarn.lock' ':!Gemfile.lock' ':!poetry.lock' 2>/dev/null | sort -u)
NRANGE=$(printf '%s\n' "$RANGE" | /usr/bin/grep -c . )
DROPS=$(comm -23 <(printf '%s\n' "$RANGE" | /usr/bin/grep -v '^$') <(printf '%s\n' "$UNION" | /usr/bin/grep -v '^$'))
NDROPS=$(printf '%s\n' "$DROPS" | /usr/bin/grep -c . )
OUTSIDE=$(comm -13 <(printf '%s\n' "$RANGE" | /usr/bin/grep -v '^$') <(printf '%s\n' "$UNION" | /usr/bin/grep -v '^$'))
NOUT=$(printf '%s\n' "$OUTSIDE" | /usr/bin/grep -c . )
NWINDOW=$(git log --format=%H "${BASE}..${ANCHOR}" 2>/dev/null | /usr/bin/grep -c . )
echo "alt=${ALT} scoped_commits=${NCOMMITS} commits_in_window=${NWINDOW} range=${NRANGE} union=${NUNION} range_minus_union=${NDROPS} union_minus_range=${NOUT}"
[ "${DUMP_DROPS:-}" = "1" ] && printf '%s\n' "$DROPS"
exit 0
