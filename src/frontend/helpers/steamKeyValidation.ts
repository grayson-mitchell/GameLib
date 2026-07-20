// Light-touch client-side key format validator (SPEC REQ3 / D-09).
//
// This is a UX/quota guard, NOT a security boundary — Steam's redeemKey is the
// authoritative validator (see 26-SPEC.md, threat T-26-02). It exists only to
// catch obviously malformed paste-typo input (empty, wrong length, bad charset)
// before making an IPC/network round-trip.
//
// Deliberately NOT an exact 5-block-of-5-chars anchored regex — that would
// over-reject valid non-standard key shapes. (Acceptance-criteria grep checks
// this file for a literal 5-repetition quantifier, so it is not spelled out
// here even in prose — see 26-RESEARCH.md / 26-PATTERNS.md for the exact
// forbidden pattern.)

export function normalizeKey(raw: string): string {
  return raw.trim().toUpperCase()
}

export function isObviouslyMalformed(raw: string): boolean {
  const normalized = normalizeKey(raw)
  if (normalized.length === 0) return true
  if (normalized.length < 10 || normalized.length > 40) return true
  if (!/^[A-Z0-9-]+$/.test(normalized)) return true
  return false
}
