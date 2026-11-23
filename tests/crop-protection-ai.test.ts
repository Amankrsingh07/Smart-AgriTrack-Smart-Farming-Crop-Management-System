import {test} from "node:test";
import assert from "node:assert/strict";
import {protectionSchema} from "../src/lib/crop-protection";
import {explainProtectionWithAI} from "../src/lib/crop-protection-ai";
const input=()=>protectionSchema.parse({cropName:"Tomato",symptoms:["Leaf curling","Stunted growth"],affected:"10–25%",onset:"2026-01-01",spreading:false,pattern:"Entire field",timing:"Gradually",symptomsAfterApplication:false,pollution:[],field:"PRIVATE_FIELD",state:"PRIVATE_STATE",labs:[{matrix:"Water",parameter:"Pb",value:123,unit:"mg/L",sampleDate:"2026-01-01",laboratory:"PRIVATE_LAB"}]});
const reply=(value:unknown)=>async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}]}),{status:200});
test("optional AI absent, failure and invalid responses retain offline fallback",async()=>{
 assert.equal((await explainProtectionWithAI(input())).available,false);
 for(const fetcher of [async()=>{throw Error("network");},async()=>new Response("rate",{status:429}),reply({evidenceIds:["invented-diagnosis"],missingIds:[]}),reply({evidenceIds:[],missingIds:[],dose:"spray now"}),async()=>new Response("invalid-json")]){
 const r=await explainProtectionWithAI(input(),{apiKey:"test-only",model:"configured-model",fetcher});assert.equal(r.available,false);assert.equal(r.method,"Offline rule-based assessment");}
});
test("AI selects fixed authored evidence only and request excludes identity, locations and lab values",async()=>{
 let request="";const fetcher:typeof fetch=async(_url,init)=>{request=String(init?.body);return reply({evidenceIds:["screen-6"],missingIds:["missing-0"]})();};
 const r=await explainProtectionWithAI(input(),{apiKey:"test-only",model:"configured-model",fetcher});assert.equal(r.available,true);assert.equal(r.evidence.length,1);assert.equal(r.evidence[0].id,"screen-6");assert.ok(!request.includes("PRIVATE_"));assert.ok(!request.includes('"value":123'));assert.ok(!JSON.stringify(r).includes("spray now"));
});
