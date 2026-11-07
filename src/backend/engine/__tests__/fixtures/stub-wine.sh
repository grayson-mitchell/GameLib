#!/bin/sh
if [ -n "$STUB_RECORD" ]; then printf '%s' "$CX_BOTTLE" > "$STUB_RECORD"; fi
case "$STUB_MODE" in
  licensed) echo "Standard version" ;;
  trial) echo "Demo version (12 days remaining)" ;;
  expired) echo "Demo version (expired 3 days ago)" ;;
  garbage) echo "Something else" ;;
  empty) ;;
  hang) exec sleep 30 ;;
  hang-once) if [ -e "$STUB_STATE" ]; then echo "Standard version"; else : > "$STUB_STATE"; exec sleep 30; fi ;;
  fail) exit 3 ;;
  cxfatal) echo "cxmessage standin was called."; echo "Fatal Error"; echo "'cxbottle.conf' is not readable"; exit 1 ;;
  bigout) printf 'x%.0s' $(seq 1 2000); echo; exit 1 ;;
esac
