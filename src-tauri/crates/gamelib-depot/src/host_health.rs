//! Content-server host health scoring and failover. Port of `depot/hostHealth.ts`.
//!
//! Every constant below carries the incident fix that produced it in the TS file's doc comments
//! (see `.planning/debug/steam-install-slow-start.md`, `humankind-depot-full-stall.md`); change
//! them only with new hardware evidence. One tracker per download run, never a global.

use std::collections::HashMap;

/// Outcome of one fetch attempt against one host.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostAttemptOutcome {
    Success,
    Timeout,
    Error,
}

#[derive(Debug, Default, Clone)]
struct HostStats {
    attempts: u32,
    successes: u32,
    /// Resets to 0 on ANY success (half-open circuit breaker).
    consecutive_failures: u32,
    total_ms: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct HostStatsSnapshot {
    pub host: String,
    pub attempts: u32,
    pub successes: u32,
    pub consecutive_failures: u32,
    pub avg_ms: u64,
    /// 1.0 (optimistic default) when there is no attempt history.
    pub success_rate: f64,
    pub unhealthy: bool,
}

// TS origin: depot/hostHealth.ts MAX_CONSECUTIVE_FAILURES
/// A host with this many consecutive failures is deprioritized at once.
pub const MAX_CONSECUTIVE_FAILURES: u32 = 5;

// TS origin: depot/hostHealth.ts MIN_SAMPLES_FOR_UNHEALTHY
/// Below this many attempts the success RATE is not a reliable signal.
pub const MIN_SAMPLES_FOR_UNHEALTHY: u32 = 5;

// TS origin: depot/hostHealth.ts MIN_SUCCESS_RATE_FOR_HEALTHY
/// At/above `MIN_SAMPLES_FOR_UNHEALTHY` attempts, a rate below this marks a host unhealthy.
pub const MIN_SUCCESS_RATE_FOR_HEALTHY: f64 = 0.35;

// TS origin: depot/hostHealth.ts LATENCY_SCORE_DIVISOR_MS
/// Latency only breaks near-ties; a 0%-success host never outranks a 90% one by failing fast.
const LATENCY_SCORE_DIVISOR_MS: f64 = 50_000.0;

// TS origin: depot/hostHealth.ts WEIGHTEDLOAD_PRIOR_DIVISOR
/// Converts directory `weightedload` into a 0..1 cold-start prior (lower load, higher prior).
const WEIGHTEDLOAD_PRIOR_DIVISOR: f64 = 50.0;

// TS origin: depot/hostHealth.ts PRIOR_HALFLIFE_SAMPLES
/// Attempts at which the prior and the empirical score weigh equally.
pub const PRIOR_HALFLIFE_SAMPLES: u32 = MIN_SAMPLES_FOR_UNHEALTHY;

// TS origin: depot/hostHealth.ts TOP_N_FANOUT
/// How many top healthy hosts attempt 0 fans concurrent workers across (raised 3 -> 8 on
/// 2026-08-17; see the TS doc comment).
pub const TOP_N_FANOUT: usize = 8;

// TS origin: depot/hostHealth.ts DEMOTED_PROBE_INTERVAL
/// One in this many attempt-0 picks probes the best demoted host so the circuit can close.
pub const DEMOTED_PROBE_INTERVAL: u64 = 32;

/// `priorScoreFromWeightedLoad`: monotonically decreasing in the load.
pub fn prior_score_from_weighted_load(weightedload: f64) -> f64 {
    1.0 / (1.0 + weightedload / WEIGHTEDLOAD_PRIOR_DIVISOR)
}

fn is_unhealthy(s: &HostStats) -> bool {
    if s.consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
        return true;
    }
    if s.attempts < MIN_SAMPLES_FOR_UNHEALTHY {
        return false;
    }
    (s.successes as f64) / (s.attempts as f64) < MIN_SUCCESS_RATE_FOR_HEALTHY
}

/// Composite score, higher is better. `prior == None` means "no prior signal", not "prior 1".
fn score(s: &HostStats, prior: Option<f64>) -> f64 {
    if s.attempts == 0 {
        return prior.unwrap_or(1.0);
    }
    let success_rate = (s.successes as f64) / (s.attempts as f64);
    let avg_ms = (s.total_ms as f64) / (s.attempts as f64);
    let empirical = success_rate - avg_ms / LATENCY_SCORE_DIVISOR_MS;
    match prior {
        None => empirical,
        Some(p) => {
            let w = (PRIOR_HALFLIFE_SAMPLES as f64)
                / ((PRIOR_HALFLIFE_SAMPLES as f64) + (s.attempts as f64));
            w * p + (1.0 - w) * empirical
        }
    }
}

#[derive(Debug, Default)]
pub struct HostHealthTracker {
    stats: HashMap<String, HostStats>,
    weighted_loads: HashMap<String, f64>,
    /// Incremented once per `pick_host` with `attempt_index == 0`; drives the probe cadence.
    attempt_zero_counter: u64,
}

impl HostHealthTracker {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_weighted_loads(weighted_loads: HashMap<String, f64>) -> Self {
        Self {
            weighted_loads,
            ..Self::default()
        }
    }

    fn prior_for(&self, host: &str) -> Option<f64> {
        self.weighted_loads
            .get(host)
            .map(|w| prior_score_from_weighted_load(*w))
    }

    fn composite(&self, host: &str) -> f64 {
        let default = HostStats::default();
        score(self.stats.get(host).unwrap_or(&default), self.prior_for(host))
    }

    fn unhealthy_now(&self, host: &str) -> bool {
        self.stats.get(host).map(is_unhealthy).unwrap_or(false)
    }

    /// Records the outcome of one attempt. Cancellations must never be recorded by the caller.
    pub fn record(&mut self, host: &str, outcome: HostAttemptOutcome, ms: u64) {
        let s = self.stats.entry(host.to_string()).or_default();
        s.attempts += 1;
        s.total_ms += ms;
        if outcome == HostAttemptOutcome::Success {
            s.successes += 1;
            s.consecutive_failures = 0;
        } else {
            s.consecutive_failures += 1;
        }
    }

    /// Host to try for `attempt_index` (0-based). Healthy hosts first by composite score (stable,
    /// so a cold pool keeps the seed-rotated order), demoted hosts last but never excluded.
    /// Attempt 0 fans `worker_slot` across the top `TOP_N_FANOUT` healthy hosts; every
    /// `DEMOTED_PROBE_INTERVAL`-th attempt 0 probes the best demoted host; a retry with
    /// `previous_host` rotates away from it while another candidate exists.
    pub fn pick_host(
        &mut self,
        hosts: &[String],
        seed: usize,
        attempt_index: usize,
        worker_slot: usize,
        previous_host: Option<&str>,
    ) -> Result<String, String> {
        if hosts.is_empty() {
            return Err("HostHealthTracker.pickHost: empty hosts list".into());
        }
        let n = hosts.len();
        let rotated: Vec<&String> = (0..n).map(|i| &hosts[(seed + i) % n]).collect();

        let mut healthy: Vec<&String> = Vec::new();
        let mut unhealthy: Vec<&String> = Vec::new();
        for h in rotated {
            if self.unhealthy_now(h) {
                unhealthy.push(h);
            } else {
                healthy.push(h);
            }
        }
        let by_score_desc = |a: &&String, b: &&String| {
            self.composite(b)
                .partial_cmp(&self.composite(a))
                .unwrap_or(std::cmp::Ordering::Equal)
        };
        healthy.sort_by(by_score_desc);
        unhealthy.sort_by(by_score_desc);
        let ordered: Vec<&String> = healthy.iter().chain(unhealthy.iter()).copied().collect();

        if attempt_index == 0 {
            self.attempt_zero_counter += 1;
            if !unhealthy.is_empty()
                && !healthy.is_empty()
                && self.attempt_zero_counter.is_multiple_of(DEMOTED_PROBE_INTERVAL)
            {
                return Ok(unhealthy[0].clone());
            }
        }

        let top = TOP_N_FANOUT.min(healthy.len());
        if attempt_index == 0 && top > 1 {
            return Ok(healthy[worker_slot % top].clone());
        }
        if attempt_index > 0 {
            if let Some(prev) = previous_host {
                let others: Vec<&String> =
                    ordered.iter().copied().filter(|h| h.as_str() != prev).collect();
                if !others.is_empty() {
                    return Ok(others[(attempt_index - 1) % others.len()].clone());
                }
            }
        }
        Ok(ordered[attempt_index % ordered.len()].clone())
    }

    /// Read-only; never creates an entry for an unknown host.
    pub fn snapshot(&self, host: &str) -> HostStatsSnapshot {
        let default = HostStats::default();
        let s = self.stats.get(host).unwrap_or(&default);
        HostStatsSnapshot {
            host: host.to_string(),
            attempts: s.attempts,
            successes: s.successes,
            consecutive_failures: s.consecutive_failures,
            avg_ms: if s.attempts > 0 {
                ((s.total_ms as f64) / (s.attempts as f64)).round() as u64
            } else {
                0
            },
            success_rate: if s.attempts > 0 {
                (s.successes as f64) / (s.attempts as f64)
            } else {
                1.0
            },
            unhealthy: is_unhealthy(s),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use HostAttemptOutcome::{Error, Success};

    fn v(xs: &[&str]) -> Vec<String> {
        xs.iter().map(|s| s.to_string()).collect()
    }
    fn four() -> Vec<String> {
        v(&["host-a", "host-b", "host-c", "host-d"])
    }
    fn rec(t: &mut HostHealthTracker, h: &str, n: usize, o: HostAttemptOutcome, ms: u64) {
        for _ in 0..n {
            t.record(h, o, ms);
        }
    }
    fn pick(t: &mut HostHealthTracker, hs: &[String], seed: usize, a: usize) -> String {
        t.pick_host(hs, seed, a, 0, None).unwrap()
    }
    /// Four hosts, all 100% success, distinct latencies a < b < c < d.
    fn graded() -> HostHealthTracker {
        let mut t = HostHealthTracker::new();
        rec(&mut t, "host-a", 6, Success, 50);
        rec(&mut t, "host-b", 6, Success, 150);
        rec(&mut t, "host-c", 6, Success, 300);
        rec(&mut t, "host-d", 6, Success, 450);
        t
    }

    #[test]
    fn cold_start_preserves_seed_rotation_order() {
        let mut t = HostHealthTracker::new();
        let hs = four();
        for (i, e) in ["host-a", "host-b", "host-c", "host-d"].iter().enumerate() {
            assert_eq!(pick(&mut t, &hs, 0, i), *e);
        }
        for (i, e) in ["host-c", "host-d", "host-a", "host-b"].iter().enumerate() {
            assert_eq!(pick(&mut t, &hs, 2, i), *e);
        }
    }

    #[test]
    fn host_at_max_consecutive_failures_is_deprioritized_to_the_back() {
        let mut t = HostHealthTracker::new();
        let hs = four();
        const { assert!(MAX_CONSECUTIVE_FAILURES <= MIN_SAMPLES_FOR_UNHEALTHY) };
        rec(&mut t, "host-a", MAX_CONSECUTIVE_FAILURES as usize, Error, 100);
        let first = pick(&mut t, &hs, 0, 0);
        assert!(["host-b", "host-c", "host-d"].contains(&first.as_str()));
        assert_eq!(pick(&mut t, &hs, 0, 3), "host-a");
    }

    #[test]
    fn single_success_resets_consecutive_failures_half_open_circuit_breaker() {
        let mut t = HostHealthTracker::new();
        rec(&mut t, "host-a", 20, Success, 100);
        rec(&mut t, "host-a", MAX_CONSECUTIVE_FAILURES as usize, Error, 100);
        assert!(t.snapshot("host-a").unhealthy);
        t.record("host-a", Success, 50);
        assert!(!t.snapshot("host-a").unhealthy);
        assert_eq!(t.snapshot("host-a").consecutive_failures, 0);
    }

    #[test]
    fn low_success_rate_marks_unhealthy_without_a_consecutive_streak() {
        let mut t = HostHealthTracker::new();
        for o in [
            Success, Error, Error, Error, Success, Error, Error, Error,
        ] {
            t.record("host-a", o, 100);
        }
        let s = t.snapshot("host-a");
        assert!(s.attempts >= MIN_SAMPLES_FOR_UNHEALTHY);
        assert!(s.success_rate < MIN_SUCCESS_RATE_FOR_HEALTHY);
        assert!(s.unhealthy);
    }

    #[test]
    fn single_early_failure_does_not_condemn_a_host() {
        let mut t = HostHealthTracker::new();
        t.record("host-a", Error, 100);
        assert!(t.snapshot("host-a").attempts < MIN_SAMPLES_FOR_UNHEALTHY);
        assert!(!t.snapshot("host-a").unhealthy);
    }

    #[test]
    fn faster_host_ranks_earlier_among_comparable_success_rates() {
        let mut t = HostHealthTracker::new();
        rec(&mut t, "host-a", 6, Success, 100);
        rec(&mut t, "host-b", 6, Success, 4000);
        t.record("host-c", Success, 250);
        t.record("host-d", Success, 250);
        assert_eq!(pick(&mut t, &four(), 1, 0), "host-a");
    }

    #[test]
    fn zero_percent_host_never_outranks_a_healthy_one_by_failing_fast() {
        let mut t = HostHealthTracker::new();
        rec(&mut t, "host-a", 8, Error, 5);
        for i in 0..8 {
            t.record("host-b", if i == 0 { Error } else { Success }, 3000);
        }
        assert!(t.snapshot("host-a").unhealthy);
        assert!(!t.snapshot("host-b").unhealthy);
        let hs = v(&["host-a", "host-b"]);
        let order: Vec<String> = (0..4).map(|i| pick(&mut t, &hs, 0, i)).collect();
        assert_eq!(order[0], "host-b");
        assert_eq!(order[1], "host-a");
    }

    #[test]
    fn never_excludes_a_host_entirely_when_all_are_unhealthy() {
        let mut t = HostHealthTracker::new();
        let hs = four();
        for h in &hs {
            rec(&mut t, h, MAX_CONSECUTIVE_FAILURES as usize, Error, 100);
        }
        for i in 0..hs.len() {
            assert!(hs.contains(&pick(&mut t, &hs, 0, i)));
        }
    }

    #[test]
    fn attempt_index_beyond_hosts_len_wraps_to_the_front() {
        let mut t = HostHealthTracker::new();
        let hs = four();
        let first = pick(&mut t, &hs, 0, 0);
        assert_eq!(pick(&mut t, &hs, 0, hs.len()), first);
    }

    #[test]
    fn pick_host_errors_on_an_empty_hosts_list() {
        let mut t = HostHealthTracker::new();
        let e = t.pick_host(&[], 0, 0, 0, None).unwrap_err();
        assert!(e.contains("empty hosts list"));
    }

    #[test]
    fn snapshot_of_a_never_recorded_host_is_optimistic_and_does_not_mutate() {
        let mut t = HostHealthTracker::new();
        let s = t.snapshot("never-seen-host");
        assert_eq!(s.attempts, 0);
        assert_eq!(s.success_rate, 1.0);
        assert!(!s.unhealthy);
        assert!(t.stats.is_empty());
        let hs = v(&["never-seen-host", "host-x"]);
        assert_eq!(pick(&mut t, &hs, 0, 0), "never-seen-host");
    }

    // weightedload-aware selection (cycle 5)

    fn auckland() -> Vec<String> {
        v(&["cache1-akl-edgx", "cache1-akl-tpwr", "cache2-akl-tpwr", "alibaba-cdn"])
    }
    fn loads() -> HashMap<String, f64> {
        [
            ("cache1-akl-edgx", 20.0),
            ("cache1-akl-tpwr", 37.0),
            ("cache2-akl-tpwr", 48.0),
            ("alibaba-cdn", 130.0),
        ]
        .iter()
        .map(|(k, w)| (k.to_string(), *w))
        .collect()
    }

    #[test]
    fn cold_start_prefers_local_cache_by_weightedload_prior() {
        let mut t = HostHealthTracker::with_weighted_loads(loads());
        let hs = auckland();
        let seed = hs.iter().position(|h| h == "alibaba-cdn").unwrap();
        let order: Vec<String> = (0..4).map(|i| pick(&mut t, &hs, seed, i)).collect();
        assert_eq!(order[0], "cache1-akl-edgx");
        assert_eq!(order[3], "alibaba-cdn");
        assert_eq!(order, auckland());
    }

    #[test]
    fn cold_start_host_without_weightedload_uses_neutral_prior() {
        let mut t = HostHealthTracker::with_weighted_loads(loads());
        let mut hs = auckland();
        hs.push("unknown-new-host".into());
        assert_eq!(pick(&mut t, &hs, 0, 0), "unknown-new-host");
    }

    #[test]
    fn edgx_flakes_despite_good_prior_and_is_demoted_below_reliable_hosts() {
        let mut t = HostHealthTracker::with_weighted_loads(loads());
        let pool = v(&["cache1-akl-edgx", "cache1-akl-tpwr", "cache2-akl-tpwr"]);
        assert_eq!(pick(&mut t, &pool, 0, 0), "cache1-akl-edgx");
        rec(&mut t, "cache1-akl-edgx", MAX_CONSECUTIVE_FAILURES as usize, Error, 60);
        assert!(t.snapshot("cache1-akl-edgx").unhealthy);
        for _ in 0..10 {
            t.record("cache1-akl-tpwr", Success, 285);
            t.record("cache2-akl-tpwr", Success, 298);
        }
        let order: Vec<String> = (0..3).map(|i| pick(&mut t, &pool, 0, i)).collect();
        assert_ne!(order[0], "cache1-akl-edgx");
        assert!(["cache1-akl-tpwr", "cache2-akl-tpwr"].contains(&order[0].as_str()));
        assert_eq!(order[2], "cache1-akl-edgx");
    }

    #[test]
    fn prior_fades_toward_empirical_as_attempts_accumulate() {
        let mut t = HostHealthTracker::with_weighted_loads(loads());
        rec(&mut t, "cache1-akl-tpwr", (PRIOR_HALFLIFE_SAMPLES * 4) as usize, Success, 100);
        assert!(!t.snapshot("cache1-akl-edgx").unhealthy);
        let pool = v(&["cache1-akl-edgx", "cache1-akl-tpwr"]);
        assert_eq!(pick(&mut t, &pool, 0, 0), "cache1-akl-tpwr");
    }

    #[test]
    fn prior_score_from_weighted_load_is_monotonically_decreasing() {
        let p = prior_score_from_weighted_load;
        assert!(p(20.0) > p(37.0));
        assert!(p(37.0) > p(48.0));
        assert!(p(48.0) > p(130.0));
    }

    #[test]
    fn omitting_weighted_loads_reproduces_neutral_cold_start_order() {
        let mut t = HostHealthTracker::new();
        let pool = auckland();
        for (i, e) in pool.iter().enumerate() {
            assert_eq!(&pick(&mut t, &pool, 0, i), e);
        }
    }

    // worker-slot-aware fan-out (Phase 25)

    #[test]
    fn attempt_zero_distinct_worker_slots_spread_across_top_n_healthy_hosts() {
        let mut t = graded();
        let hs = four();
        let picks: Vec<String> = (0..3)
            .map(|slot| t.pick_host(&hs, 0, 0, slot, None).unwrap())
            .collect();
        let distinct: std::collections::HashSet<_> = picks.iter().collect();
        assert!(distinct.len() > 1);
        const { assert!(TOP_N_FANOUT > 1) };
        for p in &picks {
            assert!(hs.contains(p));
        }
    }

    #[test]
    fn retry_attempts_are_unaffected_by_worker_slot() {
        let mut t = graded();
        let hs = four();
        for a in [1usize, 2, 3] {
            let base = pick(&mut t, &hs, 0, a);
            for slot in 0..3 {
                assert_eq!(t.pick_host(&hs, 0, a, slot, None).unwrap(), base);
            }
        }
    }

    #[test]
    fn omitting_worker_slot_reproduces_the_pre_phase_25_pick() {
        let mut t = HostHealthTracker::new();
        let hs = four();
        for (i, e) in ["host-a", "host-b", "host-c", "host-d"].iter().enumerate() {
            assert_eq!(pick(&mut t, &hs, 0, i), *e);
        }
        assert_eq!(pick(&mut t, &hs, 2, 0), "host-c");
    }

    #[test]
    fn retry_with_previous_host_never_returns_it_while_another_exists() {
        let mut t = graded();
        let hs = four();
        let mut previous = t.pick_host(&hs, 0, 0, 1, None).unwrap();
        assert_eq!(previous, "host-b");
        let mut retries = Vec::new();
        for a in 1..=4 {
            let p = t.pick_host(&hs, 0, a, 1, Some(&previous)).unwrap();
            assert_ne!(p, previous);
            retries.push(p.clone());
            previous = p;
        }
        assert_eq!(retries, v(&["host-a", "host-c", "host-d", "host-a"]));

        let pair = v(&["host-a", "host-b"]);
        assert_eq!(t.pick_host(&pair, 0, 1, 1, Some("host-b")).unwrap(), "host-a");
        assert_eq!(t.pick_host(&pair, 0, 2, 1, Some("host-a")).unwrap(), "host-b");
        let one = v(&["host-a"]);
        assert_eq!(t.pick_host(&one, 0, 1, 0, Some("host-a")).unwrap(), "host-a");
    }

    // demoted-host probe recovery (IHR-01)

    #[test]
    fn exports_demoted_probe_interval() {
        const { assert!(DEMOTED_PROBE_INTERVAL > 1) };
    }

    #[test]
    fn demoted_host_gets_exactly_one_probe_within_the_interval() {
        let mut t = HostHealthTracker::new();
        let hs = four();
        rec(&mut t, "host-a", MAX_CONSECUTIVE_FAILURES as usize, Error, 100);
        assert!(t.snapshot("host-a").unhealthy);
        let mut probes = 0;
        for _ in 0..DEMOTED_PROBE_INTERVAL {
            if t.pick_host(&hs, 0, 0, 0, None).unwrap() == "host-a" {
                probes += 1;
            }
        }
        assert_eq!(probes, 1);
    }

    #[test]
    fn probed_demoted_host_rejoins_fanout_after_a_success() {
        let mut t = HostHealthTracker::new();
        let hs = v(&["host-a", "host-b", "host-c"]);
        rec(&mut t, "host-a", 20, Success, 100);
        rec(&mut t, "host-a", MAX_CONSECUTIVE_FAILURES as usize, Error, 100);
        rec(&mut t, "host-b", 6, Success, 150);
        rec(&mut t, "host-c", 6, Success, 200);
        assert!(t.snapshot("host-a").unhealthy);
        let mut probe = String::new();
        for _ in 0..DEMOTED_PROBE_INTERVAL {
            probe = t.pick_host(&hs, 0, 0, 0, None).unwrap();
        }
        assert_eq!(probe, "host-a");
        t.record("host-a", Success, 90);
        assert!(!t.snapshot("host-a").unhealthy);
        assert_eq!(t.snapshot("host-a").consecutive_failures, 0);
        let picks: std::collections::HashSet<String> = (0..3)
            .map(|slot| t.pick_host(&hs, 0, 0, slot, None).unwrap())
            .collect();
        let all: std::collections::HashSet<String> = hs.iter().cloned().collect();
        assert_eq!(picks, all);
    }

    #[test]
    fn no_probe_fires_when_every_host_is_healthy() {
        let mut t = graded();
        let hs = four();
        for _ in 0..DEMOTED_PROBE_INTERVAL + 5 {
            assert_eq!(t.pick_host(&hs, 0, 0, 0, None).unwrap(), "host-a");
            assert_eq!(t.pick_host(&hs, 0, 0, 1, None).unwrap(), "host-b");
            assert_eq!(t.pick_host(&hs, 0, 0, 2, None).unwrap(), "host-c");
        }
    }

    #[test]
    fn retry_selection_is_unaffected_by_probe_counter_or_demotion() {
        let mut t = HostHealthTracker::new();
        let hs = four();
        rec(&mut t, "host-a", MAX_CONSECUTIVE_FAILURES as usize, Error, 100);
        for _ in 0..DEMOTED_PROBE_INTERVAL + 3 {
            t.pick_host(&hs, 0, 0, 0, None).unwrap();
        }
        assert_eq!(pick(&mut t, &hs, 0, 1), "host-c");
        assert_eq!(pick(&mut t, &hs, 0, 2), "host-d");
        assert_eq!(pick(&mut t, &hs, 0, 3), "host-a");
    }

    #[test]
    fn one_healthy_host_and_zero_demoted_is_unchanged() {
        let mut t = HostHealthTracker::new();
        let hs = v(&["host-a"]);
        for _ in 0..DEMOTED_PROBE_INTERVAL + 2 {
            assert_eq!(pick(&mut t, &hs, 0, 0), "host-a");
        }
        assert_eq!(pick(&mut t, &hs, 0, 1), "host-a");
    }

    #[test]
    fn empty_hosts_list_still_errors_regardless_of_probe_state() {
        let mut t = HostHealthTracker::new();
        let hs = v(&["host-a"]);
        for _ in 0..3 {
            pick(&mut t, &hs, 0, 0);
        }
        assert!(t
            .pick_host(&[], 0, 0, 0, None)
            .unwrap_err()
            .contains("empty hosts list"));
    }
}
