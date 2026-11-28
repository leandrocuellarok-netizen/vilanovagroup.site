# ARGENTINA PUBLIC INFLUENCER DIRECTORY

**Status:** data contract and quality controls only. The directory starts intentionally empty; it does not claim that any individual, creator, sponsorship or audience metric has been researched or verified.

## Purpose

Create a defensible index of public creators, journalists, presenters, streamers and media personalities operating in or associated with Argentina. The directory is an identity layer for VILANOVA AI SOLUTIONS and INFLUENCE RADAR AI. It is not a popularity ranking, private-contact database or substitute for the Evidence Ledger.

## What belongs in a profile

- A stable internal profile ID and public display name.
- A narrow public-role category.
- Canonical links to public platform profiles.
- The identity-verification state and the method used.
- Source URLs, publisher names, capture timestamps and the exact claim each source supports.
- Creation, update and review timestamps.

## Verification standard

A profile may be provisional when a public identity is plausible but not independently confirmed. A profile may be marked verified only when at least one public account is supported by a platform verification badge, a cross-link from an official website, or an official publication, and the profile also contains an official supporting source. Self-description alone does not establish identity verification.

A disputed or impersonated account must not be merged into the primary identity. Preserve distinct profile records until a reviewer resolves the conflict.

## Privacy and data minimization

This directory stores public identity references only. It expressly rejects private email addresses, personal phone numbers, home addresses, private messages, sensitive personal traits, inferred political beliefs and non-public relationship data. Do not scrape behind logins or bypass platform controls. Do not treat a public-facing business email as permission to contact someone; outreach requires a separate lawful basis and process.

## Metrics and commercial evidence

Do not store follower counts, views, estimated reach, sentiment, sponsorship scores or influence rankings in this directory. Store time-bounded observations in data/evidence-events.json with their own provenance, unit, scope, observation window and verification status. A public profile's existence does not prove a brand deal, endorsement, audience size or political affiliation.

## Review workflow

1. Identify a public person or creator from a primary or reputable source.
2. Locate the candidate's canonical public profile URL.
3. Capture an official cross-link, platform verification signal or official publication.
4. Create a provisional profile if the public identity is not yet independently confirmed.
5. Mark it verified only after the strict verification condition is met.
6. Run node scripts/validate-influencer-profiles.mjs.
7. Add commercial events or metrics separately to the Evidence Ledger.
8. Re-review links and status before a report is issued; record the review timestamp.

## Files

- schemas/influencer-profile.schema.json — JSON Schema 2020-12.
- data/influencer-profiles.json — public profile directory; currently empty.
- scripts/validate-influencer-profiles.mjs — dependency-free validator.
- scripts/test-influencer-profiles.mjs — positive and negative regression tests.

The directory is a research foundation, not a live social feed, audience measurement system or claim of current market coverage.
