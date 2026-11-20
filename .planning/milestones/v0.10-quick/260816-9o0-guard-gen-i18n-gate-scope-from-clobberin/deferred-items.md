# Deferred items — quick-260816-9o0

Out-of-scope discoveries. Per the SCOPE BOUNDARY rule these were logged, NOT fixed:
this task changed only `meta/genI18nGateScope.ts`,
`meta/__tests__/genI18nGateScope.test.ts` and `package.json`.

## D-9o0-01 — `pnpm test:ci` has 2 pre-existing failing suites (NOT caused by this task)

> **CLOSED 2026-08-16 by quick task 260816-a5o** (plan
> `.planning/quick/260816-a5o-teach-the-rust-quote-balance-check-about/260816-a5o-PLAN.md`).
> Both suites are green.
>
> **The original diagnosis below was WRONG in two independent ways.** It is kept
> verbatim rather than deleted, because a future reader who only sees the fix would
> otherwise re-derive it. The corrected diagnosis is in
> **"Correction (260816-a5o)"** at the end of this section — read that, not the
> "Root cause" and "Suggested owner" blocks below.
>
> What the record got RIGHT, and what made this task findable at all, is its
> **provenance evidence**: the `git log -L` output proving both failures predate
> quick-260816-9o0, and the "cannot be this task's doing" reasoning. Both stand.

**Suites:**

- `src/backend/__tests__/longRunningChannels.test.ts`
- `src/backend/__tests__/tauriShellSource.test.ts`

**Observed:** `Test Suites: 2 failed, 276 passed, 278 total` /
`Tests: 2 failed, 1 skipped, 5702 passed, 5705 total`.

**Root cause (measured, not assumed):** — ⚠️ **SUPERSEDED, see the Correction below.
This paragraph is wrong on both counts and is retained only so the mistake is not
re-derived.** `longRunningChannels.test.ts:442` runs a
quote-balance check over `src-tauri/src/main.rs` and reports line 3383:

```
                     Electron's own macOS-only app.hide()"
```

The apostrophe in `Electron's` inside a Rust string makes the checker's
`quoteCount` odd, so the line is reported as unbalanced.

**Provenance — proves it predates this task:**

```
git log -1 --format="%h %s" -L 3383,3383:src-tauri/src/main.rs
206a31db7 feat(quick-vvz): wire electronStub app.hide to Tauri AppHandle::hide
```

`206a31db7` is from the PREVIOUS quick task (quick-260815-vvz) and sits four
commits before this task's first commit. Branch HEAD at task start was
`b59e111cd`.

**Why it cannot be this task's doing:** neither failing suite references
`package.json` or `genI18nGateScope` (`grep -l` returns no match), and neither
file is reachable from the three files this task modified.
`meta/__tests__/genI18nGateScope.test.ts` PASSES.

**Suggested owner:** — ⚠️ **SUPERSEDED, see the Correction below. The fix was NOT
in `stripRustCharLiterals`, which is correct and was not modified.** whoever closes
out quick-260815-vvz. The fix is likely in the checker's `stripRustCharLiterals` /
quote-balance logic (an apostrophe inside a Rust string literal is legal and must
not be counted), not in `main.rs`.

---

### Correction (260816-a5o) — the record above named ONE cause; there were TWO, and neither was the apostrophe

**Correction 1 — the apostrophe was incidental, and `stripRustCharLiterals` was
never at fault.**

The real cause is the WR-08 guard's **per-PHYSICAL-line assumption** meeting a
**backslash-continued Rust string literal**. `main.rs:3381-3383` is ONE logical
string literal split across three physical lines with trailing `\` continuations:

```rust
eprintln!(
    "[dispatch_rust_channel] app_hide: declared no-op off macOS -- \
     AppHandle::hide() does not exist on this platform, exact parity with real \
     Electron's own macOS-only app.hide()"
);
```

The opener (3381) and the closer (3383) each carry exactly one `"`, so a per-line
count calls both odd. The observed failure was **two** entries, not one — post
comment-strip indices `1852` and `1854`, `quoteCount: 1` each. The record above
noticed only the second and attributed it to the apostrophe it happened to contain.

`stripRustCharLiterals`'s pattern requires a closing `'` after exactly one
character. In `'s own ...` the next character is a space, so **nothing matches and
nothing is removed** — line 1854's odd count comes from the literal's closing `"`,
full stop. Had the apostrophe been the cause, index 1852 (which contains none)
could not have been reported. `stripRustCharLiterals` behaved correctly throughout
and was **not modified** by the fix.

This was the SECOND time the per-line assumption broke on legitimate Rust
(`29e12621f` taught the guard about escaped quotes and was the first), so
260816-a5o removed the assumption structurally — a shared
`src/backend/testUtils/rustQuoteBalance.ts` with a logical-line joiner — rather
than adding a third special case.

**Correction 2 — the two suites were red for two UNRELATED reasons.**

The record attributes both suites to a single cause. `tauriShellSource.test.ts`
contains **no quote-balance logic at all** — `grep -rln "quoteCount" src/ meta/`
matches `longRunningChannels.test.ts` and nothing else. It was red because its
REQ-34.1-07 dispatch-arm census (`expect(newArms).toEqual(['tray_set_icon'])`) is a
ledger, and the same commit `206a31db7` added an `"app_hide" =>` arm at
`main.rs:3373` without declaring it there. Observed:
`Received: ["app_hide", "tray_set_icon"]`.

The two defects share only a commit, not a mechanism. Fixing the quote-balance
guard would never have made `tauriShellSource.test.ts` pass.

**Fix, as landed:** `main.rs` is byte-unchanged (the literal there is legitimate
Rust; editing it to dodge the checker was explicitly out of bounds). The guard now
folds `\`-continued physical lines into logical lines before counting, with
executed discriminators proving a plain unterminated literal AND a continuation
that never closes are both still reported — the fix does not degenerate into
"stop checking". The census now declares `app_hide` with an explicit note that its
proof status is weaker than the entries above it.
