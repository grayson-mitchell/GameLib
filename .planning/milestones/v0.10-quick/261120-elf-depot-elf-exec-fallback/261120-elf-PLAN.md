---
phase: quick-261120-elf
plan: 01
type: execute
autonomous: true
---

# Quick 261120-elf: ELF +x fallback for Linux depot installs

Recorded after the fact: the work was done and live-verified in-session before this record was
written (no planner/executor spawn). Source: todo `2026-11-20-depot-install-leaves-linux-elf-binaries-non-executable`.

Add an ELF content fallback beside the Mach-O and shebang ones in `gamelib-depot` `post.rs`, count it,
surface it in the `[depot-rust] outcome` line, unit-test it, and confirm live on Linux.
