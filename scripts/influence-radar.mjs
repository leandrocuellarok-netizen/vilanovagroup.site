import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateLedger } from "./validate-evidence-ledger.mjs";
const TYPES=new Set(["brand_deal","endorsement","public_appearance","news_mention","platform_metric"]);
const TOLERANCE=5*60*1000;
const ts=value=>{const n=Date.parse(value);return Number.isFinite(n)?n:null};
function sourceKey(value){try{const u=new URL(value);u.search="";u.hash="";return u.toString().replace(/\/$/,"")}catch{return value}}
function observedAt(e){return e.event_type==="platform_metric"?ts(e.observation_window?.end):ts(e.source?.published_at)}
function metricKey(e){const m=e.metric;return[e.entity.id,m.platform.toLowerCase(),m.name.toLowerCase(),m.unit.toLowerCase(),m.scope.toLowerCase()].join("|")}
function momentum(events){
 const groups=new Map();
 for(const e of events){if(e.event_type!=="platform_metric")continue;const k=metricKey(e);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e)}
 const out=[];
 for(const list of groups.values()){
  list.sort((a,b)=>ts(a.observation_window.end)-ts(b.observation_window.end));
  if(list.length<2)continue;
  const prev=list[list.length-2],cur=list[list.length-1];
  const pd=ts(prev.observation_window.end)-ts(prev.observation_window.start),cd=ts(cur.observation_window.end)-ts(cur.observation_window.start);
  if(Math.abs(pd-cd)>TOLERANCE)continue;
  const delta=cur.metric.value-prev.metric.value,base=prev.metric.value;
  out.push({platform:cur.metric.platform,metric:cur.metric.name,unit:cur.metric.unit,scope:cur.metric.scope,previous_value:base,current_value:cur.metric.value,delta,percent_change:base===0?null:Number((delta/Math.abs(base)*100).toFixed(2)),direction:delta>0?"up":delta<0?"down":"flat",previous_window_end:prev.observation_window.end,current_window_end:cur.observation_window.end,evidence_event_ids:[prev.event_id,cur.event_id]});
 }
 return out;
}
/** Build a reproducible, verified-only 24-hour evidence snapshot. No score or ranking is produced. */
export function buildRadarSnapshot(ledger,options={}){
 const errors=validateLedger(ledger);if(errors.length)throw new Error("Invalid evidence ledger: "+errors.join("; "));
 const now=options.now?new Date(options.now):new Date();if(!Number.isFinite(now.getTime()))throw new Error("options.now must be a valid date");
 const hours=options.windowHours??24;if(!Number.isFinite(hours)||hours<=0||hours>168)throw new Error("windowHours must be greater than 0 and no more than 168");
 const end=now.getTime(),start=end-hours*3600000;
 const exclusions={unsupported_event_type:0,non_person_entity:0,not_verified:0,low_confidence:0,missing_event_timestamp:0,outside_observation_window:0,duplicate_source_event:0};
 const seen=new Set(),qualified=[];
 for(const e of ledger.events){
  if(!TYPES.has(e.event_type)){exclusions.unsupported_event_type++;continue}
  if(!["person","creator"].includes(e.entity.entity_type)){exclusions.non_person_entity++;continue}
  if(e.verification_status!=="verified"){exclusions.not_verified++;continue}
  if(e.confidence==="low"){exclusions.low_confidence++;continue}
  const at=observedAt(e);if(at===null){exclusions.missing_event_timestamp++;continue}
  if(at<start||at>end){exclusions.outside_observation_window++;continue}
  if(e.event_type==="platform_metric"){const captured=ts(e.source.captured_at);if(captured===null||captured<start||captured>end){exclusions.outside_observation_window++;continue}}
  const related=(e.related_entities??[]).map(x=>x.id).sort().join(",");
  const metricId=e.event_type==="platform_metric"?[e.metric.platform,e.metric.name,e.metric.scope,e.observation_window.end].join("|"):"";
  const key=[e.entity.id,e.event_type,sourceKey(e.source.url),related,metricId].join("|");
  if(seen.has(key)){exclusions.duplicate_source_event++;continue}seen.add(key);qualified.push(e);
 }
 const entities=new Map();
 for(const e of qualified){
  const id=e.entity.id;
  if(!entities.has(id))entities.set(id,{entity:{id,display_name:e.entity.display_name,entity_type:e.entity.entity_type},dimensions:{brand_deals:[],endorsements:[],public_appearances:[],news_mentions:[],platform_metrics:[]},momentum:null});
  const item=entities.get(id),key={brand_deal:"brand_deals",endorsement:"endorsements",public_appearance:"public_appearances",news_mention:"news_mentions",platform_metric:"platform_metrics"}[e.event_type],at=observedAt(e);
  item.dimensions[key].push({event_id:e.event_id,claim:e.claim,source:{publisher:e.source.publisher,url:e.source.url,published_at:e.source.published_at??null,captured_at:e.source.captured_at},observed_at:new Date(at).toISOString(),confidence:e.confidence,metric:e.metric??null});
 }
 for(const item of entities.values()){
  const metrics=qualified.filter(e=>e.entity.id===item.entity.id&&e.event_type==="platform_metric");
  item.momentum=momentum(metrics);if(!item.momentum.length)item.momentum=null;
  for(const key of Object.keys(item.dimensions)){item.dimensions[key].sort((a,b)=>a.observed_at.localeCompare(b.observed_at));if(!item.dimensions[key].length)item.dimensions[key]=null}
 }
 const list=[...entities.values()].sort((a,b)=>a.entity.display_name.localeCompare(b.entity.display_name,"en"));
 return{
  generated_at:now.toISOString(),observation_window:{start:new Date(start).toISOString(),end:new Date(end).toISOString(),duration_hours:hours},
  status:qualified.length?"evidence_available":"no_verified_signals",ranking:null,composite_score:null,
  methodology:{eligible_verification_status:["verified"],eligible_confidence:["high","medium"],eligible_entity_types:["person","creator"],missing_dimensions:"null means unknown or not observed; it never means zero.",deduplication:"Same entity, event type, normalized source URL and related entity set are counted once. Platform metric snapshots are separated by metric scope and observation-window end.",momentum:"Requires at least two verified snapshots for the same platform, metric, unit and scope with comparable observation-window durations.",fame:"No fame score is calculated. Public visibility, news mentions and platform metrics remain separate evidence dimensions.",composite_scoring:"Disabled. This snapshot is an evidence summary, not a leaderboard."},
  summary:{qualifying_events:qualified.length,entities_with_evidence:list.length,brand_deals:qualified.filter(e=>e.event_type==="brand_deal").length,endorsements:qualified.filter(e=>e.event_type==="endorsement").length,public_appearances:qualified.filter(e=>e.event_type==="public_appearance").length,news_mentions:qualified.filter(e=>e.event_type==="news_mention").length,platform_metric_snapshots:qualified.filter(e=>e.event_type==="platform_metric").length,comparable_momentum_series:list.reduce((n,x)=>n+(x.momentum?.length??0),0)},
  exclusions,entities:list
 };
}
function run(){const ledger=JSON.parse(readFileSync(resolve(process.cwd(),"data/evidence-events.json"),"utf8"));console.log(JSON.stringify(buildRadarSnapshot(ledger),null,2))}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)run();
