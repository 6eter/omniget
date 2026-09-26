//! Pace: is a window being spent faster than it refills?
//!
//! Follows CodexBar's `UsagePace` (github.com/steipete/CodexBar,
//! `Sources/CodexBarCore/UsagePace.swift`, MIT): the share of the window
//! already used against the share of its time already gone, extrapolated
//! linearly; if the extrapolation reaches 100 % only after the reset, the
//! window lasts. ClaudeBar and ai-usagebar show the same "ahead / behind"
//! delta. Reimplemented here, not copied. Pure functions, no clock.

use super::LimitWindow;
use serde::Serialize;

/// Below this share of the window gone, a forecast is noise (CodexBar hides
/// its pace for the first 3 %).
pub const MIN_SHOWN: f64 = 0.03;
/// A notification needs more history than a label: a burst in the first
/// minutes of a 5 h window says little about the next four hours.
pub const MIN_ALERT: f64 = 0.15;

/// Share of the window's time already gone, 0..1, when the reset and the
/// length are known and consistent.
pub fn elapsed(resets_at: i64, span_ms: i64, now: i64) -> Option<f64> {
    if span_ms <= 0 {
        return None;
    }
    let until_reset = resets_at - now;
    if until_reset <= 0 || until_reset > span_ms {
        return None;
    }
    Some((span_ms - until_reset) as f64 / span_ms as f64)
}

/// Epoch ms at which the window runs out at the current pace, or `None` when
/// it lasts until the reset (or nothing can be said yet).
pub fn runs_out_at(used: f64, resets_at: i64, span_ms: i64, now: i64) -> Option<i64> {
    let gone = elapsed(resets_at, span_ms, now)?;
    let actual = used.clamp(0.0, 1.0);
    if actual >= 1.0 {
        return Some(now);
    }
    if gone <= 0.0 || actual <= 0.0 {
        return None;
    }
    let elapsed_ms = gone * span_ms as f64;
    let left_ms = (1.0 - actual) / (actual / elapsed_ms);
    (left_ms < (resets_at - now) as f64).then(|| now + left_ms as i64)
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Pace {
    /// Share of the window's time gone, 0..1: where the "on pace" tick sits.
    pub expected: f64,
    /// `used - expected`: positive = ahead of pace (spending too fast).
    pub delta: f64,
    /// When the window runs out at this pace, if before the reset.
    pub runs_out_at: Option<i64>,
}

/// The pace of one window, or `None` when it has no reset, no length or too
/// little history.
pub fn of(w: &LimitWindow, now: i64) -> Option<Pace> {
    let used = w.used? as f64;
    let (resets_at, span) = (w.resets_at?, w.span_ms?);
    let expected = elapsed(resets_at, span, now)?;
    if expected < MIN_SHOWN {
        return None;
    }
    Some(Pace {
        expected,
        delta: used - expected,
        runs_out_at: runs_out_at(used, resets_at, span, now),
    })
}

/// Whether a window deserves a "will run out before the reset" warning now.
pub fn at_risk(w: &LimitWindow, now: i64) -> Option<i64> {
    let used = w.used? as f64;
    if used >= 1.0 {
        // Already out: that is the 100 % alert's news, not a forecast.
        return None;
    }
    let (resets_at, span) = (w.resets_at?, w.span_ms?);
    if elapsed(resets_at, span, now)? < MIN_ALERT {
        return None;
    }
    runs_out_at(used, resets_at, span, now)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::limits_strip::HOUR_MS;

    const NOW: i64 = 1_800_000_000_000;

    #[test]
    fn a_fast_pace_runs_out_before_the_reset() {
        // 2 h of a 5 h window gone, 60 % used: 100 % at 3 h20, before the reset.
        let at = runs_out_at(0.6, NOW + 3 * HOUR_MS, 5 * HOUR_MS, NOW).unwrap();
        assert_eq!(at, NOW + 80 * 60_000);
        assert_eq!(runs_out_at(0.2, NOW + 3 * HOUR_MS, 5 * HOUR_MS, NOW), None);
        assert_eq!(runs_out_at(1.0, NOW + HOUR_MS, 5 * HOUR_MS, NOW), Some(NOW));
        // A reset further away than the window is not trusted.
        assert_eq!(runs_out_at(0.5, NOW + 6 * HOUR_MS, 5 * HOUR_MS, NOW), None);
    }

    #[test]
    fn the_pace_delta_is_used_minus_time_gone() {
        let w = LimitWindow::percent("session", "S", 60.0)
            .resets(Some(NOW + 3 * HOUR_MS))
            .span(5 * HOUR_MS);
        let p = of(&w, NOW).unwrap();
        assert!((p.expected - 0.4).abs() < 1e-9);
        assert!((p.delta - 0.2).abs() < 1e-6);
        assert!(p.runs_out_at.is_some());
        // Too early in the window: no pace at all.
        let early = LimitWindow::percent("session", "S", 5.0)
            .resets(Some(NOW + 5 * HOUR_MS - 60_000))
            .span(5 * HOUR_MS);
        assert_eq!(of(&early, NOW), None);
    }

    #[test]
    fn only_a_forecast_with_history_is_worth_a_notification() {
        // 10 % gone, 40 % used: runs out, but it is too early to say so.
        let w = LimitWindow::percent("session", "S", 40.0)
            .resets(Some(NOW + 270 * 60_000))
            .span(5 * HOUR_MS);
        assert_eq!(at_risk(&w, NOW), None);
        // 40 % gone, 60 % used: worth it.
        let w = LimitWindow::percent("session", "S", 60.0)
            .resets(Some(NOW + 3 * HOUR_MS))
            .span(5 * HOUR_MS);
        assert!(at_risk(&w, NOW).is_some());
        // Already out is the 100 % alert's job.
        let out = LimitWindow::percent("session", "S", 100.0)
            .resets(Some(NOW + 3 * HOUR_MS))
            .span(5 * HOUR_MS);
        assert_eq!(at_risk(&out, NOW), None);
    }
}
