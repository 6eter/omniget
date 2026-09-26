//! Threshold crossings and "limit reset", as pure functions of two readings.
//! The engine turns what comes out into a notification and a
//! `limits://chime` event; nothing here touches a clock or the app.

use super::{LimitWindow, Reading};
use serde::Serialize;

/// A reset only counts when the window had something to give back.
const RESET_MIN_DROP: f32 = 0.10;
/// Slack when comparing two `resets_at` of the same window.
const RESET_SLACK_MS: i64 = 60_000;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Alert {
    /// `percent` is the threshold that was crossed, not the usage.
    Threshold {
        window: String,
        label: String,
        percent: u8,
    },
    Reset {
        window: String,
        label: String,
    },
    /// At the current pace the window runs out before it resets
    /// (`super::pace::at_risk`). Raised once per window period.
    Pace {
        window: String,
        label: String,
        runs_out_at: i64,
        /// Minutes from the reading to `runs_out_at`, for the notification.
        in_minutes: i64,
    },
}

/// The highest threshold that sits in `(prev, next]`.
pub fn crossed(prev: f32, next: f32, thresholds: &[u8]) -> Option<u8> {
    thresholds
        .iter()
        .copied()
        .filter(|t| {
            let t = f32::from(*t) / 100.0;
            prev < t && next >= t
        })
        .max()
}

/// The window emptied because its period rolled over, not because a rolling
/// average drifted down: usage fell by a real amount and either the old reset
/// time has passed or the provider now names a later one.
pub fn was_reset(prev: &LimitWindow, next: &LimitWindow, now_ms: i64) -> bool {
    let (Some(before), Some(after)) = (prev.used, next.used) else {
        return false;
    };
    if before - after < RESET_MIN_DROP {
        return false;
    }
    match (prev.resets_at, next.resets_at) {
        (Some(old), Some(new)) => old <= now_ms || new > old + RESET_SLACK_MS,
        (Some(old), None) => old <= now_ms,
        _ => false,
    }
}

/// What changed between two readings of one provider. A first reading raises
/// nothing: opening the strip at 90% is not news, going from 79% to 81% is.
pub fn between(
    prev: Option<&Reading>,
    next: &Reading,
    thresholds: &[u8],
    now_ms: i64,
) -> Vec<Alert> {
    let Some(prev) = prev else {
        return Vec::new();
    };
    // Running out is always news, whatever thresholds the user picked.
    let mut thresholds = thresholds.to_vec();
    if !thresholds.contains(&100) {
        thresholds.push(100);
    }
    let thresholds = thresholds.as_slice();
    let mut out = Vec::new();
    for w in &next.windows {
        let Some(old) = prev.windows.iter().find(|p| p.id == w.id) else {
            continue;
        };
        if was_reset(old, w, now_ms) {
            out.push(Alert::Reset {
                window: w.id.clone(),
                label: w.label.clone(),
            });
        } else if let (Some(a), Some(b)) = (old.used, w.used) {
            if let Some(percent) = crossed(a, b, thresholds) {
                out.push(Alert::Threshold {
                    window: w.id.clone(),
                    label: w.label.clone(),
                    percent,
                });
            }
        }
    }
    out
}

/// Windows of `next` that run out before their reset at the current pace
/// and were not warned about yet. `warned` holds `(window id, resets_at)` of
/// the warnings already raised, so each period warns at most once.
pub fn pace(next: &Reading, warned: &[(String, i64)], now_ms: i64) -> Vec<Alert> {
    next.windows
        .iter()
        .filter_map(|w| {
            let at = super::pace::at_risk(w, now_ms)?;
            let period = w.resets_at?;
            if warned.iter().any(|(id, r)| *id == w.id && *r == period) {
                return None;
            }
            Some(Alert::Pace {
                window: w.id.clone(),
                label: w.label.clone(),
                runs_out_at: at,
                in_minutes: ((at - now_ms).max(0) + 59_999) / 60_000,
            })
        })
        .collect()
}

/// Drops what the user asked not to hear about.
pub fn wanted(
    alerts: Vec<Alert>,
    thresholds_on: bool,
    reset_on: bool,
    pace_on: bool,
) -> Vec<Alert> {
    alerts
        .into_iter()
        .filter(|a| match a {
            Alert::Threshold { .. } => thresholds_on,
            Alert::Reset { .. } => reset_on,
            Alert::Pace { .. } => pace_on,
        })
        .collect()
}

fn minutes(m: i64) -> String {
    match (m / 60, m % 60) {
        (0, m) => format!("{m} min"),
        (h, 0) => format!("{h} h"),
        (h, m) => format!("{h} h {m} min"),
    }
}

/// Title and body of the notification. English on purpose: it is raised by the
/// backend, which has no locale; the strip's own pulse carries no words.
pub fn notification(provider_label: &str, alert: &Alert) -> (String, String) {
    match alert {
        Alert::Threshold { label, percent, .. } if *percent >= 100 => (
            format!("{provider_label}: limit reached"),
            format!("{label} is used up."),
        ),
        Alert::Threshold { label, percent, .. } => (
            format!("{provider_label}: {percent}% used"),
            format!("{label} passed {percent}%."),
        ),
        Alert::Pace {
            label, in_minutes, ..
        } => (
            format!("{provider_label}: on pace to run out"),
            format!(
                "{label} runs out in about {} at this pace, before it resets.",
                minutes(*in_minutes)
            ),
        ),
        Alert::Reset { label, .. } => (
            format!("{provider_label}: limit reset"),
            format!("{label} is fresh again."),
        ),
    }
}

/// One notification for everything a reading raised: several banners at once
/// are noise, and on macOS each one is a blocking call on a runtime thread.
pub fn summary(provider_label: &str, alerts: &[Alert]) -> Option<(String, String)> {
    match alerts {
        [] => None,
        [one] => Some(notification(provider_label, one)),
        many => {
            // The most urgent title leads: used up, then pace, then the rest.
            let rank = |a: &Alert| match a {
                Alert::Threshold { percent, .. } if *percent >= 100 => 0,
                Alert::Pace { .. } => 1,
                Alert::Threshold { .. } => 2,
                Alert::Reset { .. } => 3,
            };
            let lead = many.iter().min_by_key(|a| rank(a))?;
            let (title, _) = notification(provider_label, lead);
            let body = many
                .iter()
                .map(|a| notification(provider_label, a).1)
                .collect::<Vec<_>>()
                .join(" ");
            Some((title, body))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reading(id: &str, pct: f64, resets_at: Option<i64>) -> Reading {
        Reading {
            windows: vec![LimitWindow::percent(id, "5h limit", pct).resets(resets_at)],
            ..Default::default()
        }
    }

    #[test]
    fn only_a_crossing_counts_and_the_highest_one_wins() {
        let t = [80, 95];
        assert_eq!(crossed(0.79, 0.81, &t), Some(80));
        assert_eq!(crossed(0.81, 0.90, &t), None);
        assert_eq!(crossed(0.50, 0.97, &t), Some(95));
        assert_eq!(crossed(0.95, 0.95, &t), None);
        assert_eq!(crossed(0.90, 0.80, &t), None);
    }

    #[test]
    fn a_first_reading_is_not_news() {
        assert!(between(None, &reading("session", 99.0, None), &[80, 95], 0).is_empty());
    }

    #[test]
    fn crossing_eighty_raises_one_threshold_alert() {
        let a = reading("session", 79.0, Some(10_000));
        let b = reading("session", 82.0, Some(10_000));
        assert_eq!(
            between(Some(&a), &b, &[80, 95], 5_000),
            vec![Alert::Threshold {
                window: "session".into(),
                label: "5h limit".into(),
                percent: 80
            }]
        );
        assert!(between(Some(&b), &b, &[80, 95], 5_000).is_empty());
    }

    #[test]
    fn a_rollover_is_a_reset_and_a_drift_is_not() {
        let full = reading("session", 90.0, Some(10_000));
        let fresh_later = reading("session", 2.0, Some(10_000 + 18_000_000));
        assert_eq!(
            between(Some(&full), &fresh_later, &[80], 9_000),
            vec![Alert::Reset {
                window: "session".into(),
                label: "5h limit".into()
            }]
        );
        // Same reset time still ahead, usage merely lower: a rolling window.
        let drifted = reading("session", 70.0, Some(10_000));
        assert!(between(Some(&full), &drifted, &[80], 9_000).is_empty());
        // The old reset time has passed.
        assert!(was_reset(&full.windows[0], &drifted.windows[0], 10_001));
        // A tiny dip is never a reset.
        let dip = reading("session", 85.0, Some(99_999_999));
        assert!(!was_reset(&full.windows[0], &dip.windows[0], 10_001));
    }

    #[test]
    fn muted_kinds_are_dropped() {
        let all = vec![
            Alert::Reset {
                window: "w".into(),
                label: "W".into(),
            },
            Alert::Threshold {
                window: "w".into(),
                label: "W".into(),
                percent: 95,
            },
        ];
        assert_eq!(wanted(all.clone(), true, false, true).len(), 1);
        assert_eq!(wanted(all.clone(), false, false, true).len(), 0);
        let (title, body) = notification("Codex", &all[1]);
        assert_eq!(title, "Codex: 95% used");
        assert_eq!(body, "W passed 95%.");
    }

    #[test]
    fn running_out_is_always_news() {
        let a = reading("session", 97.0, Some(10_000));
        let b = reading("session", 100.0, Some(10_000));
        let got = between(Some(&a), &b, &[80, 95], 5_000);
        assert_eq!(
            got,
            vec![Alert::Threshold {
                window: "session".into(),
                label: "5h limit".into(),
                percent: 100
            }]
        );
        assert_eq!(notification("Claude", &got[0]).0, "Claude: limit reached");
    }

    #[test]
    fn a_pace_warning_is_raised_once_per_period() {
        use crate::limits_strip::HOUR_MS;
        let now = 1_800_000_000_000;
        let resets = now + 3 * HOUR_MS;
        let r = Reading {
            windows: vec![LimitWindow::percent("session", "5h limit", 60.0)
                .resets(Some(resets))
                .span(5 * HOUR_MS)],
            ..Default::default()
        };
        let got = pace(&r, &[], now);
        assert_eq!(got.len(), 1);
        let Alert::Pace { in_minutes, .. } = &got[0] else {
            panic!()
        };
        assert_eq!(*in_minutes, 80);
        assert!(pace(&r, &[("session".into(), resets)], now).is_empty());
        assert_eq!(pace(&r, &[("session".into(), resets - 1)], now).len(), 1);
        let (title, body) = notification("Claude", &got[0]);
        assert_eq!(title, "Claude: on pace to run out");
        assert!(body.contains("1 h 20 min"), "{body}");
    }

    #[test]
    fn several_alerts_make_one_notification() {
        let many = vec![
            Alert::Threshold {
                window: "w".into(),
                label: "Weekly".into(),
                percent: 80,
            },
            Alert::Threshold {
                window: "s".into(),
                label: "Session".into(),
                percent: 100,
            },
        ];
        let (title, body) = summary("Codex", &many).unwrap();
        assert_eq!(title, "Codex: limit reached");
        assert_eq!(body, "Weekly passed 80%. Session is used up.");
        assert!(summary("Codex", &[]).is_none());
    }
}
