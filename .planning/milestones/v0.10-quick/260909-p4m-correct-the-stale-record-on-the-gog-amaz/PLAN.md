---
quick_id: 260909-p4m
slug: correct-the-stale-record-on-the-gog-amaz
created: 2026-09-09T06:05:33.309Z
description: "Correct the stale record on the GOG/Amazon cookie-jar logout todo — its prescribed fix shipped 5 days after filing; re-scope to the one outstanding live gate"
---

# Quick Task: correct the stale record on the GOG/Amazon cookie-jar todo

## Why

`.planning/todos/pending/2026-09-02-gog-and-amazon-logout-never-clear-the-shared-cookie-jar.md`
still reads as though nothing in the repo clears GOG or Amazon cookies on logout. That stopped
being true on **2026-09-04**, five days after the todo was filed, in commit `84fc0ea90`
(Phase 40 plan 04, Task 3, D-15). Two of the todo's own sections are now actively misleading:

1. **"The one gesture that sets severity — run this BEFORE writing any fix"** — the fix is
   written. The gesture was designed to decide whether the fix was worth building; that question
   is closed. Left as-is, it tells the next reader to run a login/logout cycle *before* touching
   code that already exists.
2. **"Deliberately out of scope: the embedded store browser. It does not exist"** — it shipped in
   Phase 40. `store_embed_open` is live in `src-tauri/src/main.rs` with a full scheme policy, and
   today's jar census proves it is depositing GOG cookies.

This is the `a-todos-prescribed-fix-can-already-be-shipped` failure mode: a stale trap that deters
the very work it is asking for. The remedy is to correct the record, not to re-do the fix.

## Evidence gathered before planning (all re-verified this session, not quoted from the todo)

**The fix, shipped:**

| site | what |
|---|---|
| `src/backend/storeManagers/gog/user.ts:24` | `GOG_COOKIE_HOSTS = ['gog.com']`, `GOG_COOKIE_CLEAR_NO_WINDOW_LABEL`, `clearGogCookiesForLogout()`; `logout()` now async |
| `src/backend/storeManagers/nile/user.ts` | `AMAZON_COOKIE_HOSTS`, `AMAZON_COOKIE_CLEAR_NO_WINDOW_LABEL`, `clearAmazonCookiesForLogout()` |
| `src-tauri/src/main.rs:3511` | `STORE_LOGOUT_COOKIE_DOMAINS: &[&str] = &["gog.com", "amazon.com"]` + `store_logout_cookie_domain_matches()` |
| `src-tauri/src/main.rs:7001`, `:7507` | the matcher OR'd into both no-window dispatch gates |
| `src/backend/sidecar/runnerAuthFlowRegistration.ts:238`, `:242` | `logoutAmazon` (handle) / `logoutGOG` (send) both registered and live |

`npx jest` over `gog/__tests__/logoutCookies.test.ts` + `nile/__tests__/logoutCookies.test.ts`:
**17 passed, 2 suites passed** (run 2026-09-09).

All four of the todo's own "Constraints any fix MUST honour" are met by the shipped code:
no-window sentinel label (1), macOS-gated with the storage step absent rather than ordered
wrongly (2), `verified_delete_count` consumed instead of the removal call's own signal (3), and
separate per-storefront lists rather than widening `EPIC_COOKIE_DOMAINS` (4).

**Today's census** — index-walked `~/Library/HTTPStorages/gamelib-shell.binarycookies`
(never `strings`, per the todo's own caveat; timestamps converted out of UTC before reading),
71 live records total, **23** GOG/Amazon against **14** at filing:

| host | now | at filing | delta |
|---|---|---|---|
| `.gog.com` | 9 | 2 | `checkout_ab` `csrf` `gog_us` `patron_visibility` `utm_campaign` `utm_medium` `utm_source` added, created 09-07/09-08 |
| `login.gog.com` | 3 | 3 | unchanged, created 08-19 |
| `www.gog.com` | 1 | 0 | `CookieConsent`, created 09-07 |
| `.amazon.com` | 8 | 8 | unchanged, created 08-19 |
| `www.amazon.com` | 1 | 1 | unchanged |

The growth is not a regression: the shipped fix is forward-acting only — it fires on `logout()`,
and no GOG or Amazon logout has run since it shipped. Every one of the 23 is suffix-covered by
the shipped `gog.com` / `amazon.com` apexes.

## What remains

Exactly one thing, and `40-04-SUMMARY.md` already flagged it against itself:

> "Live per-domain cookie census before/after logout was NOT performed in this execution ...
> this coverage claim is a structural argument from the comparator's own logic, not a
> live-measured count, and should be flagged as an assumption pending a live UAT pass."

That gate is destructive — `gog_store/auth.json` holds a live account id and
`nile_config/nile/user.json` is present, so running it signs both storefronts out and costs two
webview re-logins. It is not being run in this task.

## Tasks

### Task 1: correct the todo's record

Edit `.planning/todos/pending/2026-09-02-gog-and-amazon-logout-never-clear-the-shared-cookie-jar.md`:

- Frontmatter: `needs: test-then-fix` -> `needs: live-verification-of-a-shipped-fix`; repoint
  `files:` at the three real fix sites (`gog/user.ts`, `nile/user.ts`, `src-tauri/src/main.rs`)
  instead of `oauthLoginCapture.ts`, which was jar-sharing *evidence* and never a fix site.
  `severity: medium`, `platform: any`, `ready: live-gate`, `status: OPEN` all stay — the live
  gate is genuinely still outstanding.
- Insert a `## STATUS 2026-09-09 — THE FIX SHIPPED` block immediately under the title, naming
  the commit, the sites, the test result, and what is left.
- Retitle the severity-gesture section to mark it **superseded**, keep its reasoning (it is the
  record of *why* `medium`), and replace its 3-step gesture with the before/after census gate
  that is actually outstanding.
- Rewrite the "Deliberately out of scope" section: the embed exists, and the census shows it
  writing GOG cookies. Keep the conclusion (it changes nothing about the fix) but on true premises.
- Record the census table.
- Note the one place the shipped code deliberately diverges from the todo's constraint 4
  (`amazon.com` apex rather than something narrower), and that D-15 recorded that as a decision.

Leave the Zoom non-finding alone — re-verified as still accurate.

### Task 2: gate + commit

- `pnpm planning-gates` (todo frontmatter gate is `pending/`-scoped and this file stays pending)
- `npx prettier --check` on the touched file
- Atomic commit with an explicit pathspec — never `git add -A`, and never a `gsd-sdk` commit verb
  (it stages the whole tree; three unrelated untracked paths are live in this working tree)

## Constraints

- **No `gsd-sdk state.*` / `roadmap.*` verbs.** They corrupt STATE.md. The orchestrator hand-edits
  the Quick Tasks row and diffs it before staging.
- No production code changes. The fix is correct as shipped; this task only corrects the record.
- Do not re-run or re-derive the census from the todo's prose — the numbers above are this
  session's own measurement.
