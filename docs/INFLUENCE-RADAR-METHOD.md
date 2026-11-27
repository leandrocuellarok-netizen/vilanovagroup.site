# INFLUENCE RADAR AI — 24-Hour Evidence Method

**Status:** Prototype aggregation layer. No live provider or social-listening connection is configured.

## Purpose
The first operational layer is an evidence snapshot, not an influencer leaderboard. It organizes source-attributed observations for public people and creators during an explicit rolling window.

## Eligibility
An observation qualifies only when its event type is brand deal, endorsement, public appearance, news mention or platform metric; the entity is a person or creator; verification is `verified`; confidence is high or medium; and a dated observation falls inside the window without being future-dated. Platform metric snapshots must also have been captured inside the window.

Undated items are excluded. Capture time alone does not prove that an old event happened recently.

## Separate dimensions
1. **Brand deals:** documented sponsorships or commercial collaborations.
2. **Endorsements:** explicit, attributable endorsements. A mention is not an endorsement.
3. **Public appearances:** dated public appearances.
4. **News mentions:** dated media coverage. Visibility is not positive sentiment.
5. **Platform metrics:** platform, metric, unit, scope and observation window are preserved.

No fame score is calculated. Views are not unique reach, and public visibility is not approval.

## 24-hour momentum
Momentum requires at least two verified snapshots for the same entity, platform, metric name, unit and scope. Their observation windows must have comparable durations (within five minutes). The output reports raw delta and percentage change. If the previous value is zero, percentage change is `null`, not infinity. Different platforms, units, scopes and window lengths are never compared.

## Deduplication
Exact source events are deduplicated by entity, event type, normalized source URL and related entity set. Tracking query parameters and URL fragments are removed. Platform metric snapshots retain their metric identity and observation-window end.

This does not solve cross-publisher syndication or copied posts. Those require a later canonical-story/entity-resolution layer and reviewer audit.

## No composite score or ranking
The engine deliberately returns `ranking: null` and `composite_score: null`. Unknown dimensions remain `null`, never zero. A future composite score requires documented weighting, platform-specific normalization, source reliability calibration, adequate coverage, review controls and a reproducible score version.

## Run locally
```bash
node scripts/validate-evidence-ledger.mjs
node scripts/influence-radar.mjs
node scripts/test-influence-radar.mjs
```

The current ledger is intentionally empty. The correct result is `no_verified_signals`, not a zero score.

## Production limitations
The engine consumes the local JSON evidence ledger. It does not fetch social platforms, identify influencers automatically, verify sponsorships independently, estimate sentiment or provide real-time rankings. Licensed data access, authorized account connections, source review and a secure backend remain separate future work requiring approval.
