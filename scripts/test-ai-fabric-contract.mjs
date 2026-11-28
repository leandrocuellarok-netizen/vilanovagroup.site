import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const requestSchema=JSON.parse(readFileSync("schemas/ai-fabric-request.schema.json","utf8"));
const responseSchema=JSON.parse(readFileSync("schemas/ai-fabric-response.schema.json","utf8"));
const html=readFileSync("index.html","utf8");
const architecture=readFileSync("docs/AI-SOLUTIONS-ARCHITECTURE.md","utf8");
const contractDocs=readFileSync("docs/AI-FABRIC-API-CONTRACT.md","utf8");

assert.equal(requestSchema.$schema,"https://json-schema.org/draft/2020-12/schema");
assert.equal(responseSchema.$schema,"https://json-schema.org/draft/2020-12/schema");
assert.equal(requestSchema.additionalProperties,false);
assert.equal(responseSchema.additionalProperties,false);
assert.deepEqual(requestSchema.properties.category.enum,["image","writing","business","report","spreadsheet","automation","research","custom"]);
assert.deepEqual(requestSchema.properties.target_word_count.enum,[3000,4500,6000]);
assert.equal(requestSchema.properties.source_language.const,"es");
assert.equal(requestSchema.properties.output_language.const,"en");
assert.equal(requestSchema.properties.retention_mode.const,"ephemeral");
assert.ok(!("provider" in requestSchema.properties)&&!("model" in requestSchema.properties)&&!("api_key" in requestSchema.properties),"Clients must not select providers or submit credentials");
assert.ok(responseSchema.allOf.some(rule=>rule.if?.properties?.generation_mode?.const==="model_gateway"),"Model output needs a dedicated conditional contract");
assert.ok(responseSchema.allOf.some(rule=>rule.if?.properties?.generation_mode?.const==="prototype_template"),"Prototype output needs a separate honest conditional contract");

const allowedRequestKeys=new Set(Object.keys(requestSchema.properties));
function validateRequest(value){
  assert.ok(value&&typeof value==="object"&&!Array.isArray(value),"request must be an object");
  for(const key of Object.keys(value))assert.ok(allowedRequestKeys.has(key),"unknown request property: "+key);
  for(const key of requestSchema.required)assert.ok(key in value,"missing request property: "+key);
  assert.equal(typeof value.task,"string");
  assert.ok(value.task.trim().length>0&&value.task.length<=1200,"task must contain 1–1,200 characters");
  assert.ok(requestSchema.properties.category.enum.includes(value.category),"unsupported task category");
  assert.equal(value.source_language,"es");
  assert.equal(value.output_language,"en");
  assert.ok(requestSchema.properties.target_word_count.enum.includes(value.target_word_count));
  assert.equal(value.retention_mode,"ephemeral");
  if(value.constraints!==undefined){
    assert.ok(Array.isArray(value.constraints)&&value.constraints.length<=20,"constraints exceed 20 items");
    assert.ok(value.constraints.every(item=>typeof item==="string"&&item.trim()&&item.length<=500));
    assert.equal(new Set(value.constraints).size,value.constraints.length);
  }
  if(value.client_request_id!==undefined)assert.match(value.client_request_id,/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  return true;
}
const allowedResponseKeys=new Set(Object.keys(responseSchema.properties));
const wordCount=value=>value.trim().split(/\s+/).filter(Boolean).length;
function validateResponse(value){
  assert.ok(value&&typeof value==="object"&&!Array.isArray(value),"response must be an object");
  for(const key of Object.keys(value))assert.ok(allowedResponseKeys.has(key),"unknown response property: "+key);
  for(const key of responseSchema.required)assert.ok(key in value,"missing response property: "+key);
  assert.ok(responseSchema.properties.status.enum.includes(value.status));
  assert.ok(responseSchema.properties.generation_mode.enum.includes(value.generation_mode));
  assert.ok(responseSchema.properties.target_word_count.enum.includes(value.target_word_count));
  assert.equal(value.retention_mode,"ephemeral");
  assert.match(value.request_id,/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.ok(Number.isFinite(Date.parse(value.response_created_at)),"response timestamp must be parseable");
  if(value.status==="ready"){
    assert.ok(typeof value.english_prompt==="string"&&value.english_prompt.trim());
    assert.equal(value.word_count,wordCount(value.english_prompt),"word_count must match the returned prompt");
    assert.ok(value.quality&&typeof value.quality.intent_preserved==="boolean");
    assert.equal(typeof value.quality.target_attained,"boolean");
    assert.equal(typeof value.quality.factuality_guardrails_included,"boolean");
    if(value.generation_mode==="prototype_template"){
      assert.equal(value.model_connected,false);
      assert.equal(value.quality.target_attained,false);
      assert.ok(value.word_count<value.target_word_count,"a local template cannot claim the production word target");
    }else{
      assert.equal(value.generation_mode,"model_gateway");
      assert.equal(value.model_connected,true);
      assert.equal(value.quality.target_attained,true);
      assert.ok(value.word_count>=value.target_word_count&&value.word_count<=6000);
      assert.ok(value.usage&&value.model_reference,"model output must include usage and non-secret model reference");
      assert.ok(value.usage.input_tokens>=0&&value.usage.output_tokens>=0);
      assert.ok(value.usage.estimated_cost_usd>=0&&value.usage.budget_ceiling_usd>0);
      assert.ok(["within_limit","stopped_before_generation","stopped_during_generation"].includes(value.usage.budget_state));
      assert.ok(value.model_reference.provider_id&&value.model_reference.model_id);
    }
  }else{
    assert.equal(value.generation_mode,"none");
    assert.equal(value.model_connected,false);
    assert.ok(!("english_prompt" in value),"non-ready responses must not contain a prompt");
    if(value.status==="needs_clarification")assert.ok(value.clarification_question?.trim());
    if(value.status==="budget_exceeded")assert.equal(value.error_code,"budget_ceiling");
  }
  return true;
}

const baseRequest={task:"Quiero organizar un proceso de selección para un equipo comercial.",category:"custom",source_language:"es",output_language:"en",target_word_count:3000,retention_mode:"ephemeral"};
for(const category of requestSchema.properties.category.enum){
  for(const depth of requestSchema.properties.target_word_count.enum)assert.equal(validateRequest({...baseRequest,category,target_word_count:depth}),true);
}
assert.throws(()=>validateRequest({...baseRequest,task:"   "}));
assert.throws(()=>validateRequest({...baseRequest,task:"x".repeat(1201)}));
assert.throws(()=>validateRequest({...baseRequest,source_language:"en"}));
assert.throws(()=>validateRequest({...baseRequest,output_language:"es"}));
assert.throws(()=>validateRequest({...baseRequest,retention_mode:"stored"}));
assert.throws(()=>validateRequest({...baseRequest,category:"unknown"}));
assert.throws(()=>validateRequest({...baseRequest,provider_api_key:"synthetic-secret"}));
assert.throws(()=>validateRequest({...baseRequest,constraints:Array(21).fill("constraint")}));

const baseResponse={status:"ready",request_id:"11111111-1111-4111-8111-111111111111",generation_mode:"prototype_template",model_connected:false,target_word_count:3000,response_created_at:"2026-11-28T13:00:00Z",retention_mode:"ephemeral",english_prompt:"A local prompt blueprint only.",word_count:5,quality:{intent_preserved:true,target_attained:false,factuality_guardrails_included:true}};
assert.equal(validateResponse(baseResponse),true);
for(const depth of [3000,4500,6000]){
  const prompt=Array(depth).fill("specific").join(" ");
  const modelResponse={...baseResponse,generation_mode:"model_gateway",model_connected:true,target_word_count:depth,english_prompt:prompt,word_count:depth,quality:{intent_preserved:true,target_attained:true,factuality_guardrails_included:true},model_reference:{provider_id:"approved-provider",model_id:"approved-model"},usage:{input_tokens:100,output_tokens:depth,estimated_cost_usd:0.25,actual_cost_usd:0.24,budget_ceiling_usd:1,budget_state:"within_limit"}};
  assert.equal(validateResponse(modelResponse),true);
  assert.throws(()=>validateResponse({...modelResponse,word_count:depth-1}));
}
assert.throws(()=>validateResponse({...baseResponse,model_connected:true}));
assert.throws(()=>validateResponse({...baseResponse,quality:{...baseResponse.quality,target_attained:true}}));
assert.throws(()=>validateResponse({...baseResponse,api_key:"synthetic-secret"}));
assert.throws(()=>validateResponse({...baseResponse,status:"needs_clarification"}));
assert.equal(validateResponse({status:"needs_clarification",request_id:"22222222-2222-4222-8222-222222222222",generation_mode:"none",model_connected:false,target_word_count:4500,response_created_at:"2026-11-28T13:00:00Z",retention_mode:"ephemeral",clarification_question:"Which buyer segment should the plan prioritize?"}),true);
assert.equal(validateResponse({status:"budget_exceeded",request_id:"33333333-3333-4333-8333-333333333333",generation_mode:"none",model_connected:false,target_word_count:6000,response_created_at:"2026-11-28T13:00:00Z",retention_mode:"ephemeral",error_code:"budget_ceiling"}),true);

assert.ok(html.includes('value="custom"'),"The public interface must expose arbitrary-task generation");
assert.ok(html.includes("AI-FABRIC-API-CONTRACT.md"),"The public AI Fabric panel must link to its API contract");
assert.ok(architecture.includes("custom outcome"),"The architecture must include arbitrary tasks");
assert.ok(contractDocs.includes("No backend or model is configured")&&contractDocs.includes("API keys"),"The contract must disclose provider and secret boundaries");
console.log("AI FABRIC API CONTRACT TESTS PASSED — 8 categories, 3 target depths, strict request/response invariants, prototype honesty, model word-count gate, ephemeral retention and secret-field rejection.");
