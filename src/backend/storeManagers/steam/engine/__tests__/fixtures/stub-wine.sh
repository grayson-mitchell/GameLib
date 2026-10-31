#!/bin/sh
if [ -n "$STUB_RECORD" ]; then printf '%s' "$CX_BOTTLE" > "$STUB_RECORD"; fi
case "$STUB_MODE" in
  licensed) echo "Standard version" ;;
  trial) echo "Demo version (12 days remaining)" ;;
  expired) echo "Demo version (expired 3 days ago)" ;;
  garbage) echo "Something else" ;;
  empty) ;;
  hang) exec sleep 30 ;;
  fail) exit 3 ;;
esac
