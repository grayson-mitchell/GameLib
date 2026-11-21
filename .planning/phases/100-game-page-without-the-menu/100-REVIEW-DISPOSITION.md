---
phase: 100
review: 100-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: open
    title: "Verify, Update and What's new vanish for any installed game with no `install.version`"
  - id: CR-02
    severity: critical
    disposition: open
    title: "A Move that runs longer than 60 s is shown as \"Move failed\", and the Retry link can start a second move"
  - id: WR-01
    severity: warning
    disposition: open
    title: "The \"Edit details\" button sits on top of the 32-bit macOS badge"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Installed third-party-managed games lose \"Browse Files\""
  - id: WR-03
    severity: warning
    disposition: open
    title: "The long-action guard's header and the CloudSavesSync failure path point at a deleted behavioural test"
  - id: WR-04
    severity: warning
    disposition: open
    title: "Row failure state is sticky, and a second simultaneous failure is hidden"
  - id: WR-05
    severity: warning
    disposition: open
    title: "Danger-zone confirms have no failure path (unhandled rejections)"
  - id: IN-01
    severity: info
    disposition: open
    title: "`StoreBadgeLink` interpolates the store URL into the query string unencoded"
  - id: IN-02
    severity: info
    disposition: open
    title: "`ProtonDbLink` dropped the `gamesdb.steamID` fallback"
  - id: IN-03
    severity: info
    disposition: open
    title: "Stale comments and naming left over from the plan-by-plan rollout"
  - id: IN-04
    severity: info
    disposition: open
    title: "Two `useTranslation()` results with the same namespace in `EosOverlaySetting`"
  - id: IN-05
    severity: info
    disposition: open
    title: "Accessibility details"
  - id: IN-06
    severity: info
    disposition: open
    title: "The footer play-time suffix appears for states that are not idle in practice"
---

# Phase 100: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | open | - |
| CR-02 | critical | open | - |
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-05 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |
