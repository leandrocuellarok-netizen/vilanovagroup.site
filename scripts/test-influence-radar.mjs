import assert from "node:assert/strict";
import { buildRadarSnapshot } from "./influence-radar.mjs";
const now=new Date("2026-11-27T20:00:00.000Z"),iso=h=>new Date(now.getTime()-h*3600000).toISOString();
const base=()=>({event_id:"event-default",event_type:"brand_deal",entity:{id:"creator-eri-test",display_name:"Test Creator",entity_type:"creator"},claim:"Synthetic fixture used only for automated testing.",source:{publisher:"Example Publisher",url:"https://example.org/source",source_type:"brand_disclosure",published_at:iso(2),captured_at:iso(1)},verification_status:"verified",confidence:"high",related_entities:[{id:"brand-test",display_name:"Test Brand",relationship:"sponsors",status:"documented"}],disclosure:{status:"disclosed",text:"Synthetic fixture only."}});
const event=overrides=>({...base(),...overrides});
const metric=({id,value,startHoursAgo,endHoursAgo,capturedHoursAgo,scope="channel_total"})=>event({event_id:id,event_type:"platform_metric",source:{publisher:"Example Platform API",url:"https://example.org/metrics/"+id,source_type:"platform_api",captured_at:iso(capturedHoursAgo)},observation_window:{start:iso(startHoursAgo),end:iso(endHoursAgo),timezone:"UTC"},metric:{name:"views",value,unit:"views",platform:"Example Video",scope,window_start:iso(startHoursAgo),window_end:iso(endHoursAgo)},related_entities:[]});
const empty=buildRadarSnapshot({schema_version:"1.0.0",events:[]},{now});
assert.equal(empty.status,"no_verified_signals");assert.equal(empty.ranking,null);assert.equal(empty.composite_score,null);assert.deepEqual(empty.entities,[]);
const fixtures=[
 event({event_id:"brand-deal-001",source:{...base().source,url:"https://example.org/deal?utm_source=test"}}),
 event({event_id:"brand-deal-duplicate",source:{...base().source,url:"https://example.org/deal#disclosure"}}),
 event({event_id:"endorsement-001",event_type:"endorsement",confidence:"medium",source:{...base().source,url:"https://example.org/endorsement"}}),
 event({event_id:"appearance-001",event_type:"public_appearance",source:{...base().source,url:"https://example.org/appearance"}}),
 event({event_id:"news-001",event_type:"news_mention",source:{...base().source,url:"https://example.org/news"}}),
 event({event_id:"unverified-001",verification_status:"unverified",source:{...base().source,url:"https://example.org/unverified"}}),
 event({event_id:"disputed-001",verification_status:"disputed",source:{...base().source,url:"https://example.org/disputed"}}),
 event({event_id:"low-confidence-001",confidence:"low",source:{...base().source,url:"https://example.org/low"}}),
 event({event_id:"old-001",source:{...base().source,url:"https://example.org/old",published_at:iso(25)}}),
 event({event_id:"future-001",source:{...base().source,url:"https://example.org/future",published_at:new Date(now.getTime()+3600000).toISOString()}}),
 event({event_id:"undated-001",source:{publisher:"Example Publisher",url:"https://example.org/undated",source_type:"news_report",captured_at:iso(1)}}),
 event({event_id:"outlet-001",entity:{id:"outlet-test",display_name:"Test Outlet",entity_type:"outlet"},source:{...base().source,url:"https://example.org/outlet"}}),
 metric({id:"metric-previous",value:1000,startHoursAgo:47,endHoursAgo:23,capturedHoursAgo:22}),
 metric({id:"metric-current",value:1250,startHoursAgo:26,endHoursAgo:2,capturedHoursAgo:1}),
 metric({id:"metric-other-scope",value:700,startHoursAgo:26,endHoursAgo:2,capturedHoursAgo:1,scope:"video_total"})
];
const s=buildRadarSnapshot({schema_version:"1.0.0",events:fixtures},{now});
assert.equal(s.status,"evidence_available");assert.equal(s.ranking,null);assert.equal(s.composite_score,null);
assert.equal(s.summary.qualifying_events,7);assert.equal(s.summary.entities_with_evidence,1);
assert.equal(s.summary.brand_deals,1);assert.equal(s.summary.endorsements,1);assert.equal(s.summary.public_appearances,1);assert.equal(s.summary.news_mentions,1);assert.equal(s.summary.platform_metric_snapshots,3);assert.equal(s.summary.comparable_momentum_series,1);
assert.equal(s.entities[0].dimensions.brand_deals.length,1);assert.equal(s.entities[0].dimensions.endorsements.length,1);assert.equal(s.entities[0].dimensions.public_appearances.length,1);assert.equal(s.entities[0].dimensions.news_mentions.length,1);assert.equal(s.entities[0].dimensions.platform_metrics.length,3);
assert.equal(s.entities[0].momentum.length,1);assert.equal(s.entities[0].momentum[0].delta,250);assert.equal(s.entities[0].momentum[0].percent_change,25);assert.equal(s.entities[0].momentum[0].direction,"up");assert.equal(s.entities[0].momentum[0].scope,"channel_total");
assert.equal(s.exclusions.duplicate_source_event,1);assert.equal(s.exclusions.not_verified,2);assert.equal(s.exclusions.low_confidence,1);assert.equal(s.exclusions.outside_observation_window,2);assert.equal(s.exclusions.missing_event_timestamp,1);assert.equal(s.exclusions.non_person_entity,1);
const zero=buildRadarSnapshot({schema_version:"1.0.0",events:[metric({id:"zero-previous",value:0,startHoursAgo:47,endHoursAgo:23,capturedHoursAgo:22}),metric({id:"zero-current",value:20,startHoursAgo:26,endHoursAgo:2,capturedHoursAgo:1})]},{now});
assert.equal(zero.entities[0].momentum[0].percent_change,null);
const ambiguous=buildRadarSnapshot({schema_version:"1.0.0",events:[
 metric({id:"ambiguous-previous",value:100,startHoursAgo:47,endHoursAgo:23,capturedHoursAgo:22}),
 metric({id:"ambiguous-current-a",value:150,startHoursAgo:26,endHoursAgo:2,capturedHoursAgo:1}),
 metric({id:"ambiguous-current-b",value:155,startHoursAgo:26,endHoursAgo:2,capturedHoursAgo:1})
]},{now});
assert.equal(ambiguous.entities[0].momentum,null,"Conflicting values for the same observation window must not create false momentum");
const unequalWindows=buildRadarSnapshot({schema_version:"1.0.0",events:[
 metric({id:"unequal-previous",value:100,startHoursAgo:48,endHoursAgo:23,capturedHoursAgo:22}),
 metric({id:"unequal-current",value:150,startHoursAgo:26,endHoursAgo:2,capturedHoursAgo:1})
]},{now});
assert.equal(unequalWindows.entities[0].momentum,null,"Different observation-window durations must not be compared");
assert.throws(()=>buildRadarSnapshot({schema_version:"1.0.0",events:[{event_id:"broken"}]},{now}),/Invalid evidence ledger/);
assert.throws(()=>buildRadarSnapshot({schema_version:"1.0.0",events:[]},{now,windowHours:0}),/windowHours/);
console.log("INFLUENCE RADAR TESTS PASSED — 24-hour filtering, verified-only evidence, confidence gates, source deduplication, comparable metric momentum, unknown values, zero-baseline handling and no composite leaderboard.");
