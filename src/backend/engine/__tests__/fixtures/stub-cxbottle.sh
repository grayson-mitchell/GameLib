#!/bin/sh
# argv: --create --bottle <name> --template win10_64. The bottle name picks the behaviour.
name="$3"
dir="$HOME/Library/Application Support/CrossOver/Bottles/$name"
case "$name" in
  *hang*) mkdir -p "$dir"; exec sleep 30 ;;
  *noconf*) mkdir -p "$dir"; exit 0 ;;
  *) mkdir -p "$dir"; : > "$dir/cxbottle.conf" ;;
esac
