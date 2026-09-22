# Phase 46 Unix-region diff gate (checker issue W1).
#
# Prints every item in src-tauri/src/main.rs that carries a standalone `#[cfg(unix)]`
# attribute line, from that attribute through the item's end: the line where the brace
# depth returns to zero, or the first `;`-terminated line if the item opens no brace.
# Each region is prefixed with a `=== cfg(unix) region N ===` header. Line numbers are
# deliberately NOT printed, so inserting Windows code elsewhere in the file does not
# change the output. Any edit INSIDE a #[cfg(unix)] item (the SingleInstanceRole enum,
# acquire_single_instance, the main() guard arms, the .setup() accept loop, and the
# other unix arms) does change it.
#
# Usage (plans 46-01, 46-02 and 46-03; the baseline is the pre-phase-46 main.rs):
#   BASE=5bc4fa825   # the phase-46 planning commit; main.rs is untouched by phase 46 there
#   git show "$BASE":src-tauri/src/main.rs | awk -f <this file> > /tmp/unix-before.txt
#   awk -f <this file> src-tauri/src/main.rs > /tmp/unix-after.txt
#   diff /tmp/unix-before.txt /tmp/unix-after.txt   # must print nothing and exit 0
#
# Brace counting does not special-case string or char literals. Both sides use the same extraction,
# so this can only matter if an edit lands inside a region, which the gate forbids anyway.
/^[ \t]*#\[cfg\(unix\)\][ \t]*$/ {
  if (!inside) {
    n++
    print "=== cfg(unix) region " n " ==="
    inside = 1
    depth = 0
    opened = 0
  }
}
inside {
  print
  line = $0
  opens = gsub(/\{/, "{", line)
  closes = gsub(/\}/, "}", line)
  depth += opens - closes
  if (opens > 0) opened = 1
  if (opened && depth <= 0) {
    inside = 0
  } else if (!opened && $0 !~ /^[ \t]*#\[/ && $0 ~ /;[ \t]*$/) {
    inside = 0
  }
}
