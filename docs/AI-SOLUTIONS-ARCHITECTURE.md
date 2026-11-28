# VILANOVA AI SOLUTIONS — Production Integration Blueprint

**Status:** architecture and provider assessment only. No external analytics provider, model API, paid account, or user account is connected.  
**Research checked:** 27 November 2026. **Provider assessment update:** 28 November 2026. See [DATA-PROVIDER-READINESS.md](DATA-PROVIDER-READINESS.md) for the current commercial-eligibility, cost and access decision; where provider status differs, the newer review supersedes this initial table.  
**Commercial rule:** do not purchase, accept vendor terms, create paid commitments, or connect personal/business accounts without explicit authorization.

## 1. Product boundary

VILANOVA AI SOLUTIONS contains two separate products:

- **INFLUENCE RADAR AI:** a sourced, explainable 24-hour intelligence view of public influence and commercial signals.
- **VILANOVA AI FABRIC:** a Spanish-first prompt architect that converts a short request into a professional English prompt of a selected 3,000–6,000-word target.

They must share authentication, audit, rate-limit and model-integration infrastructure, but must not share data indiscriminately. Media monitoring, creator metrics and user prompt content have different provenance, retention and access requirements.

## 2. INFLUENCE RADAR AI

### 2.1 What the meter can and cannot claim

The product should not collapse fame, audience size, brand partnerships and news visibility into one opaque number. Display the dimensions separately and show a composite score only when the underlying coverage is adequate.

Proposed evidence dimensions:

1. **Brand deals:** publicly disclosed sponsorships, paid partnerships, campaign announcements and brand/creator posts that can be attributed to both parties.
2. **Endorsements:** explicit, attributable public or institutional endorsements. A mention is not automatically an endorsement.
3. **Public visibility:** dated, deduplicated news mentions and public appearances. Visibility is not the same as approval or positive sentiment.
4. **News impact:** prominence and persistence of coverage, with outlet, publication time and context.
5. **Verified reach:** platform-provided public metrics or metrics supplied by an account owner under an authorized connection. Do not infer unique reach from views.
6. **24-hour momentum:** change in comparable observations during the rolling 24-hour window against a clearly stated prior baseline.

Every observation must carry a source URL or provider record, observed timestamp, publication timestamp when available, platform, measurement scope, verification state and confidence. Missing data is **unknown**, never zero. Keep negative, neutral and positive coverage distinct; do not infer political alignment or personal traits.

### 2.2 Recommended evidence model

- **Influencer:** stable platform identity, canonical profile URL and public display name.
- **EvidenceEvent:** event type, brand/organization, disclosure text, source URL, publication time, capture time, verification status and reviewer note.
- **MetricSnapshot:** metric name, value, unit, platform, scope, observation window, captured time and provider.
- **SourceRecord:** publisher/provider, URL, source class, reliability tier, last checked time and terms/permission notes.
- **ScoreSnapshot:** dimension scores, missing dimensions, weighting version, coverage ratio, confidence and calculation time.

Keep the raw evidence and the scoring result separate so that a score can be reproduced when weights or data change. Store timestamps in UTC and render the user's selected timezone; for the Argentina desk, default display to America/Argentina/Buenos_Aires.

### 2.3 Candidate data routes and limitations

| Route | Useful capability | Important limitation | Current assessment |
|---|---|---|---|
| YouTube Data API | Public video/channel discovery and video statistics. Google's `videos.list` method documents a quota cost of one unit per call. | Public view/like/comment counts are not private reach, demographics, brand contracts or proof of sponsorship. | Good initial public-signal adapter. |
| YouTube Analytics API | Channel reports including views, ratings, subscriptions and other activity metrics. | OAuth authorization is required; channel reports are for the authenticated channel owner. Content-owner reports require partner access. | Use only for channels that explicitly authorize access. |
| TikTok Research Tools | Public account, video and comment research data for approved research projects. | TikTok's eligibility rules describe qualified independent/academic or non-profit research and exclude commercial users from Research Tools. A commercial Influence Radar should not assume eligibility. | Not a viable default commercial feed; seek a separately approved commercial product or licensed provider. |
| Brandwatch APIs | Consumer Research API can export/stream research results and metrics; Analysis API supports querying its content library and aggregated analysis. | Commercial vendor relationship and product scope must be negotiated. Public pages do not establish a Vilanova entitlement or quote. | Strong candidate for a vendor discovery call; no purchase or account connection made. |
| Direct public evidence | Brand announcements, creator disclosure posts, press releases, media coverage and public event pages. | Requires careful manual/automated attribution and deduplication; not complete platform analytics. | Best initial evidence layer while provider access is unresolved. |

Official documentation:

- YouTube Data API, Videos: list — https://developers.google.com/youtube/v3/docs/videos/list
- YouTube Analytics API, Channel Reports — https://developers.google.com/youtube/analytics/channel_reports
- YouTube Analytics API, Content Owner Reports — https://developers.google.com/youtube/analytics/content_owner_reports
- TikTok Research API — https://developers.tiktok.com/products/research-api/
- TikTok Research Tools eligibility and data scope — https://developers.tiktok.com/docs/en/about-research-api
- TikTok Research API FAQ — https://developers.tiktok.com/docs/en/research-api-faq/
- Brandwatch Developer APIs — https://www.brandwatch.com/products/apis/

### 2.4 Scoring governance

Start with dimension-level evidence, not a leaderboard. Before a composite score is enabled:

- publish the weighting version and rationale;
- normalize metrics only within comparable platform, format and time windows;
- separate verified values from estimates;
- apply source confidence and coverage penalties;
- deduplicate syndicated news and repeated posts;
- show the number of qualifying observations;
- retain an audit trail for corrections;
- label the score as an internal model, not an objective measure of a person's worth.

A 24-hour ranking must disclose its exact observation window and last successful refresh. If a feed fails or becomes stale, freeze the last verified snapshot and label it stale; never animate stale values as live.

## 3. VILANOVA AI FABRIC

### 3.1 User experience

The user writes one sentence in Spanish and chooses an output family:

- image generation;
- writing and communication;
- company creation and business strategy;
- PDF research/report;
- Excel and financial model;
- automation and workflow;
- general research or complex task;
- any other task or custom outcome that does not fit a predefined category.

The user selects a target final prompt length of 3,000, 4,500 or 6,000 words. The interface must preserve the original Spanish request, normalize the intent, identify missing critical constraints and produce a structured English prompt. It must not invent context to fill a word target.

### 3.2 Production pipeline

1. **Request intake:** validate length, selected category, language and user consent.
2. **Intent extraction:** identify objective, audience, geography, dates, constraints, deliverable, tools and success criteria.
3. **Ambiguity gate:** ask one focused clarification only when a missing fact materially changes the result; otherwise state assumptions.
4. **Category compiler:** add specialized modules for image direction, business design, writing, reports, spreadsheets, automations or research.
5. **Prompt generation:** call a server-side model adapter to create a non-repetitive English prompt at the requested target length.
6. **Critic pass:** check intent fidelity, omitted constraints, factual-risk instructions, output schema, length and repetition.
7. **Validation:** run deterministic checks and report any unmet target rather than padding.
8. **Delivery:** show preview, word count, copy and text export. PDF/XLSX generation should be a later tool-backed execution stage, not implied by prompt creation.

### 3.3 Secure integration architecture

**Browser → application API → authentication/rate limiter → intent compiler → model gateway → output validator → response/export.**

- Provider keys and secrets live only in server-side environment/secret storage. Never put them in HTML, JavaScript bundles, source maps or browser requests.
- Use an allowlisted server-side model adapter so providers can be changed without changing the UI.
- Enforce per-user and global request limits, maximum input size, output-token ceilings, concurrency caps and monthly spend ceilings.
- Estimate cost before generation where provider pricing permits; warn before unusually long runs and stop at configured limits.
- Stream output with cancellation support. Persist only what is needed and define retention/deletion rules before storing prompts.
- Redact credentials and sensitive personal data from logs. Apply CSRF protection, strict CORS, secure cookies, input validation and authorization checks.
- Treat uploaded documents and user text as untrusted data. Instructions embedded in source material must not override system policy or tool permissions.
- Keep a provider-neutral audit record: model identifier, prompt-template version, timestamps, token usage, cost estimate/actual cost when available, validation results and user-selected output depth.

### 3.4 Quality evaluation

Maintain a Spanish-language evaluation set across every output category. Score:

- intent preservation;
- coverage of explicit constraints;
- specificity and domain fit;
- actionable deliverable structure;
- factual restraint and source discipline;
- absence of repetitive padding;
- correct English terminology;
- word-count compliance;
- output-format validity.

A long prompt is not automatically a good prompt. The system should prefer a concise clarification over invented detail, and meaningful expansion over repeated generic paragraphs.

### 3.5 Current prototype limitation

The website currently has a local template-based prompt blueprint. It does not call a language model, perform genuine semantic translation or guarantee a 3,000–6,000-word final prompt. The latest front-end improvement removes artificial repeated-paragraph padding and explicitly describes the requested word count as a downstream production-model target. A real model integration requires a secure backend and a provider decision.

## 4. Permission gates

The following remain unconnected until explicitly authorized:

- paid social-listening or influencer-intelligence subscriptions;
- commercial API agreements and vendor terms;
- social account OAuth connections;
- paid language-model API usage;
- storage of user prompts or third-party creator data beyond public, necessary evidence.

The next implementation step after the static prototype is a provider-neutral backend contract and a small, read-only public-evidence pilot. No purchase, account connection or deployment is implied by this document.


## 6. Provider-neutral API contract

The versioned request and response boundary is specified in [AI-FABRIC-API-CONTRACT.md](AI-FABRIC-API-CONTRACT.md), with machine-readable JSON Schemas in `schemas/ai-fabric-request.schema.json` and `schemas/ai-fabric-response.schema.json`.

The contract deliberately excludes provider selection, model selection, credentials, arbitrary callback URLs and client-controlled spend limits. It distinguishes a short local template preview from a model-generated prompt that has actually met its selected word-count target. The contract tests run offline in CI; they do not connect a provider or prove that a model is configured.
