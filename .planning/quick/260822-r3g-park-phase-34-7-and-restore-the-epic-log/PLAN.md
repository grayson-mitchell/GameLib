---
quick_id: 260822-r3g
slug: park-phase-34-7-and-restore-the-epic-log
date: 2026-08-22
status: planned
---

# Quick task 260822-r3g — park Phase 34.7 and restore the Epic login tile roles

## Why

ROADMAP Phase 34.7 ("Epic device-auth single sign-in path") was scheduled on the
2026-08-05 premise that the embedded WebKit Epic login was permanently unusable under
Tauri — Talon's anti-bot 403 was judged unfixable, so device-auth (SIDLogin) would become
the **single** sign-in path and the interactive legendary-login UI would be **deleted**.

That premise no longer holds. The pristine (zero-injection) WKWebView login window defeats
the Talon 403, and a fresh logged-out embedded sign-in has completed end to end on macOS.
Operator decision 2026-08-22: **the alternative (embedded) login is now the primary path**;
Phase 34.7 goes ON HOLD rather than being planned, because deleting a working login path is
the wrong shape.

## Scope

1. `src/frontend/screens/Login/index.tsx` — revert the F-34.5-G6-01 Epic tile pivot:
   - drop `primaryLoginAction={isTauri() ? … : undefined}` so the primary tile navigates to
     `epicLoginPath` (the embedded login) in **both** shells — it is labelled
     `login.epic` = "Epic Games Login";
   - collapse `alternativeLoginAction` to `() => setShowSidLogin(true)` so SIDLogin is once
     more the "Alternative Login Method" tile in both shells;
   - drop `deprecatedTile` — nothing on this screen is deletion-pending while 34.7 is on hold;
   - remove the now-unused `isTauri` import if no other call site remains.
2. `src/frontend/screens/Login/components/Runner/index.tsx` — comments only. The
   `primaryLoginAction` / `deprecatedTile` props stay (still supported, still unit-tested);
   only Epic's call site stops passing them.
3. `src/frontend/screens/Login/__tests__/index.test.tsx` — the four SOURCE GATEs of quick
   tasks 260805-d62 / 260808-f80 pin the exact ternary expressions being deleted. Replace
   them with gates that pin the restored shape and **prove the pivot cannot silently return**
   (absence of `primaryLoginAction`, absence of both `deprecatedTile` ternaries, `isTauri`
   absent from the Epic block).
4. `.planning/ROADMAP.md` — mark Phase 34.7 **ON HOLD** with the rationale, and flag the
   residual ownership it was carrying: Epic, `egsSync` and legendary save sync (D-CYCLE6-A),
   plus Phase 35's `Depends on: Phases 34.1–34.7` line.
5. `.planning/STATE.md` — Quick Tasks Completed row + note on the 34.7 hold.

## Out of scope

- Any change to SIDLogin itself, to legendary's device-auth bootstrap, or to the pristine
  login-window Rust code. This task moves tile roles and parks a phase; it ships no new
  auth mechanism.
- Re-homing the `egsSync`/save-sync ownership to another phase. Flagged for the operator,
  not decided here.

## Verification

- `npx jest --config src/frontend/jest.config.js Login` green (Login + Runner suites).
- `npx tsc --noEmit` clean.
- RED proof: the new absence gates must fail against the pre-edit text.
