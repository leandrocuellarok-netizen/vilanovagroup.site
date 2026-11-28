# VILANOVA AI SOLUTIONS — Data Provider Readiness Review

**Research checked:** 28 November 2026.  
**Status:** feasibility review only. No provider is connected. No API app, paid account, provider contract, account connection, credit purchase or vendor terms have been accepted.  
**Decision rule:** a provider is not connected until its commercial eligibility, scope, written terms, authorization and cost controls have been reviewed and explicitly approved.

## Executive decision

The most practical first pilot is **GDELT DOC 2.0 for online-news discovery**, **YouTube Data API v3 for public video/channel counters**, and **manual review of primary public sources** for sponsorships, ownership and endorsements. This can support a source-attributed research workflow without pretending to measure total audience reach or all social conversation.

For cross-platform social listening, **Brandwatch is a vendor-evaluation candidate**, not an approved integration. **X API v2** offers public post search, public metrics and location-based trends, but is pay-per-use and should not be activated until a spend ceiling is approved. TikTok Research Tools and Meta Content Library are not suitable default feeds for a commercial Influence Radar under the eligibility conditions reviewed here.

The machine-readable companion registry is data/provider-capabilities.json. Its validator rejects unapproved connections, credentials in the registry, insecure source links, ineligible commercial use and false synchronization claims.

## Provider assessment

### 1. GDELT DOC 2.0 — recommended first news pilot

The official DOC 2.0 documentation describes full-text search across monitored online news, article lists, coverage-volume timelines, tone views, language filters and time windows. It does not provide social posts, hashtag volumes, creator analytics or sponsorship verification. The article-list mode searches a rolling three-month window; the project documents API rate limiting, so an adapter must cache, check response content type and back off on HTTP 429.

**Integration requirements:** server-side HTTP adapter; Spanish-language and Argentina source filters; fixed query registry; UTC timestamps; source URL and publisher capture; deduplication; response validation; conservative polling and backoff. Review the project's current use and attribution terms before commercial deployment.

Official sources:
- GDELT Project, *GDELT DOC 2.0 API Debuts*: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
- GDELT Project, *Ukraine, API Rate Limiting & Web NGrams 3.0*: https://blog.gdeltproject.org/ukraine-api-rate-limiting-web-ngrams-3-0/

### 2. YouTube Data API v3 — recommended first public-video pilot

The official videos.list endpoint can return public video metadata and public statistics. Its documented quota cost is one unit per call. Google's quota documentation describes a default daily allocation that includes a separate 100-call search.list bucket and 10,000 units for other methods. Search pagination consumes additional quota.

**Integration requirements:** Google Cloud project, API enablement and server-side key storage; allowlisted channel/video IDs; daily quota budget; cached snapshots; capture timestamps; metric definitions and platform labels. Public view counts are cumulative platform counters, not unique reach, audience demographics or evidence of a paid partnership.

Official sources:
- Google, *YouTube Data API — Videos: list*: https://developers.google.com/youtube/data/reference/rest/v3/videos/list
- Google, *Quota and Compliance Audits*: https://developers.google.com/youtube/data/guides/quota_and_compliance_audits

### 3. YouTube Analytics API — authorized creator metrics only

The Analytics API returns channel activity reports, but requests require OAuth 2.0 and the authorizing user must own the requested channel. Content-owner reports are restricted to YouTube content partners. It is useful only when a creator or channel owner explicitly authorizes the connection; it cannot reveal private analytics for unrelated creators.

**Integration requirements:** separate OAuth consent, narrow read-only scopes, encrypted refresh-token storage, revocation handling, per-channel authorization records and strict tenant isolation. Do not request access to a creator account merely to populate a public directory.

Official sources:
- Google, *YouTube Analytics API — Channel Reports*: https://developers.google.com/youtube/analytics/channel_reports
- Google, *YouTube Analytics API — Content Owner Reports*: https://developers.google.com/youtube/analytics/content_owner_reports

### 4. X API v2 — useful but paid; approval required before any spend

X's current official documentation describes search and retrieval of public posts, public engagement metrics and location-based trends. Its pay-per-use page reviewed on 28 November 2026 lists USD 0.005 per post read, USD 0.010 per user read and USD 0.010 per Trends request. The pay-per-use plan is capped at 3 million post reads per monthly billing cycle before Enterprise access. Prices can change; the Developer Console is authoritative.

An illustrative 10,000 post reads at the published rate would be USD 50 before taxes or other costs. No credits have been purchased and no payment method or auto-recharge has been configured.

**Integration requirements:** approved developer app; server-side credentials; exact query and geographic scope; deduplication; per-resource metering; daily and monthly spend ceilings; alerts; request cancellation; and auto-recharge disabled. Treat X trends as X-specific signals, not as a complete measure of Argentine public opinion or cross-platform hashtag volume.

Official sources:
- X, *About the X API*: https://docs.x.com/x-api/getting-started/about-x-api
- X, *Pay-per-usage pricing and credits*: https://docs.x.com/x-api/getting-started/pricing

### 5. Brandwatch Consumer Research API — strongest vendor candidate for evaluation

Brandwatch publicly documents Consumer Research, Analysis, Measure and other APIs, including the ability to export or stream research results. Its API documentation describes bearer-token authentication for an API user and a 30-calls-per-10-minutes client rate limit. Data-pack restrictions matter: Brandwatch states that X mentions may have their full text and most metadata stripped, and lists online news and LinkedIn among sources that can be affected.

**Integration requirements:** vendor discovery call; written quote; confirmation of Argentina and Spanish-language coverage; platform/source list; historic depth; real-time latency; API entitlements; retention and redistribution rights; SLA; rate limits; data deletion obligations; and a test export. Do not infer price or coverage from marketing language.

Official sources:
- Brandwatch, *Developer APIs*: https://www.brandwatch.com/products/apis/
- Brandwatch, *API Authentication*: https://developers.brandwatch.com/docs/authenticate
- Brandwatch, *API Best Practices and Rate Limits*: https://developers.brandwatch.com/docs/best-practices
- Brandwatch, *Data Restrictions*: https://developers.brandwatch.com/docs/data-restrictions

### 6. TikTok Research API — not eligible for the commercial product

TikTok's current Research API FAQ explicitly says creators, advertisers and commercial users are not eligible for Research Tools. Published eligibility focuses on qualified independent academic or non-profit research in specified regions; Argentina is not listed on the eligibility page reviewed on 28 November 2026.

**Decision:** do not design the commercial Influence Radar around TikTok Research API access. Reassess only if TikTok publishes a commercial product and applicable terms that cover the required use case. Any alternative provider must be assessed for lawful access, coverage, provenance and redistribution rights.

Official sources:
- TikTok, *Research API*: https://developers.tiktok.com/products/research-api/
- TikTok, *Research API FAQ*: https://developers.tiktok.com/docs/en/research-api-faq/

### 7. Meta Content Library and API — restricted research route

Meta's current access documentation requires affiliation with a qualified academic institution or qualified non-academic not-for-profit research institution. Access is application-controlled and uses Meta Secure Research Environment or an approved cleanroom. Meta states there is no fee for eligible Secure Research Environment access, but that does not remove eligibility, contract, security or publication restrictions.

**Decision:** not a general commercial feed for Vilanova's paid Influence Radar or media-monitoring service. Do not treat the free-access statement as permission for commercial use.

Official sources:
- Meta, *Get Access and Eligibility*: https://developers.facebook.com/documentation/meta-content-library/get-access
- Meta, *Content Library and API Overview*: https://developers.facebook.com/documentation/meta-content-library

### 8. Manual primary-source research — available immediately

Brand campaign announcements, creator disclosures, corporate filings, regulator records, official event pages and publisher articles can be reviewed without platform API credentials. Every accepted claim still requires source-level attribution, publication and capture timestamps, reviewer provenance, relationship classification, disclosure handling and current-status caution.

Public availability does not automatically grant republication rights. Preserve factual notes, short extracts, original links and source-specific reuse restrictions. A URL alone is not proof that the underlying claim is true.

Internal standards:
- Evidence Ledger: https://github.com/leandrocuellarok-netizen/vilanovagroup.site/blob/main/docs/EVIDENCE-LEDGER.md
- Commercial Intelligence Report: https://github.com/leandrocuellarok-netizen/vilanovagroup.site/blob/main/docs/COMMERCIAL-INTELLIGENCE-REPORT.md

## Recommended implementation sequence

1. Build the first read-only news adapter around GDELT, with caching, rate-limit backoff and dated source capture.
2. Add YouTube public video/channel snapshots for a manually curated allowlist of official channels; never label views as unique reach.
3. Continue manual source review for brand deals, endorsements, ownership and media appearances.
4. Prepare a Brandwatch discovery brief and compare coverage, rights, price, API access and export conditions before any commitment.
5. Consider X API only after a written budget is approved; configure a hard monthly cap and disable auto-recharge before testing.
6. Keep TikTok Research and Meta Content Library out of the commercial feed unless eligibility and use rights materially change.

## Connection and permission policy

- No API key, client secret, access token or password belongs in this registry or in browser code.
- A provider may be marked connected only after an authorization record identifies the approver, timestamp and exact scope.
- Paid or contract-based providers additionally require a recorded commercial approval.
- User-owned analytics additionally require explicit user authorization and documented scopes.
- Metered providers additionally require a configured spend limit.
- A route marked ineligible for the commercial product must never be connected to that product.
- Failed, stale or absent data must be shown as unavailable or stale, never as live values.

**Current decision:** no provider is connected. The first cost-controlled research pilot should use manual evidence plus the public news and public YouTube routes only after a terms review. Paid social listening remains a later commercial decision.
