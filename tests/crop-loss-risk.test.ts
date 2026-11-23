import assert from "node:assert/strict";
import {test} from "node:test";
import {knowledgeManifest} from "../src/lib/agricultural-knowledge";
import {harvestRiskDetails} from "../src/lib/crop-loss-risk";
import {protectionText} from "../src/i18n/crop-protection";

test("all named crop-protection crops have distinct field pest and disease references",()=>{
 for(const crop of knowledgeManifest.coverage.namedCrops){
  const [pest,disease]=harvestRiskDetails({crop,harvested:false});
  assert.ok(pest.profiles.length,crop);
  assert.ok(disease.profiles.length,crop);
  for(const profile of [...pest.profiles,...disease.profiles]){
   assert.equal(profile.phase,"field");
   assert.match(profile.source,/^https:\/\//);
  }
 }
});

test("unobserved pest and disease have inspection advice, with different storage references",()=>{
 const [pest,disease]=harvestRiskDetails({crop:"Potato",harvested:true,storageDetails:"Private storage note"});
 assert.equal(pest.status,"Insufficient evidence");
 assert.equal(pest.storageStatus,"Insufficient evidence");
 assert.equal(disease.status,"Insufficient evidence");
 assert.ok(pest.inspection);
 assert.ok(pest.profiles.some(p=>p.id==="potato-tuber-moth-store"));
 assert.ok(disease.profiles.some(p=>p.id==="potato-soft-rot"));
 assert.ok(pest.facts.some(f=>f.raw));
});

test("explicit observations are distinct from AI photo suggestions and nonspecific symptoms",()=>{
 const [pest,disease]=harvestRiskDetails({crop:"Paddy",harvested:true,signs:["Brown insects at the base of rice stems","Yellow leaves"],imageSigns:["Pointed spots with gray centers and brown edges"]});
 assert.equal(pest.status,"Confirmed observation");
 assert.equal(disease.status,"AI-suspected condition");
 assert.equal(disease.storageStatus,"Insufficient evidence");
 assert.ok(disease.profiles[0].id==="rice-blast");
 assert.equal(harvestRiskDetails({crop:"Rice",harvested:false,signs:["Plant wilting"]})[1].status,"Inspection required");
});

test("rain, soil type and numerical moisture alone never establish a drainage observation",()=>{
 const evidence={crop:"Maize",harvested:false,soilType:"Clay",rainHistory:[{date:"2026-11-16",value:"18 mm"}],measuredMoisture:{date:"2026-11-16",value:"38%"}};
 const drainage=harvestRiskDetails(evidence)[2];
 assert.equal(drainage.status,"Insufficient evidence");
 assert.ok(drainage.facts.some(f=>f.label==="Observed rainfall"));
 assert.ok(drainage.facts.some(f=>f.label==="Soil moisture"));
 assert.equal(harvestRiskDetails({...evidence,forecastRain:{date:"2026-11-17",value:"10 mm"}})[2].status,"Inspection required");
 assert.equal(harvestRiskDetails({...evidence,soilMoisture:"Waterlogged"})[2].status,"Confirmed observation");
 assert.equal(harvestRiskDetails({...evidence,crop:"Rice (Paddy)",signs:["Water standing in field"]})[2].status,"Inspection required");
});

test("new main risk statuses and inspections resolve in supported languages",()=>{
 const risks=harvestRiskDetails({crop:"Maize",harvested:false,signs:["Holes in leaves","Black spots"]});
 for(const locale of ["hi","pa","mr","gu","bn","ta","te","kn","ml","or"]){
  for(const risk of risks){
   for(const text of [risk.label,risk.status,risk.note,risk.inspection]){
    assert.notEqual(protectionText(locale,text),text,`${locale}: ${text}`);
   }
  }
 }
});

test("harvested cards prioritize storage examples and keep field observations separate",async()=>{
 const {harvestRiskSections}=await import("../src/lib/crop-loss-risk");
 const {harvestDashboard}=await import("../src/lib/crop-loss-dashboard");
 const evidence={crop:"Wheat",harvested:true,signs:["Black spots"],soilMoisture:"Waterlogged",storageDetails:"Saved lot note"};
 const sections=harvestRiskSections(harvestDashboard(evidence).risks,harvestRiskDetails(evidence),true);
 assert.deepEqual(sections.current.slice(0,4).map(card=>card.label),["Pest infestation","Disease symptoms","Grain moisture","Storage condition"]);
 assert.ok(sections.current[0].detail?.profiles.some(profile=>profile.id==="rice-weevil"));
 assert.ok(sections.current[1].detail?.profiles.some(profile=>profile.id==="small-grain-storage-mold"));
 assert.equal(sections.current[1].status,"Insufficient evidence");
 assert.deepEqual(sections.current[1].detail?.facts,[]);
 assert.equal(sections.current[3].facts?.[0].value,"Saved lot note");
 assert.equal(sections.fieldHistory.find(card=>card.label==="Disease symptoms")?.status,"Confirmed observation");
 assert.ok(sections.fieldHistory.every(card=>card.detail?.profiles.every(profile=>profile.phase==="field")));
 assert.deepEqual(sections.future.map(card=>card.label),["Soil nutrient deficiencies","Soil pH","Drainage condition"]);
});

test("standing crops show field risks and crop-specific prevention without storage examples",async()=>{
 const {harvestRiskSections}=await import("../src/lib/crop-loss-risk");
 const {harvestDashboard}=await import("../src/lib/crop-loss-dashboard");
 const evidence={crop:"Rice",harvested:false};
 const sections=harvestRiskSections(harvestDashboard(evidence).risks,harvestRiskDetails(evidence),false);
 assert.ok(sections.current.find(card=>card.label==="Pest infestation")?.detail?.profiles.some(profile=>profile.id==="rice-hopper"));
 assert.ok(sections.current.every(card=>!card.detail?.profiles.some(profile=>profile.phase==="storage")));
 assert.equal(sections.fieldHistory.length,0);
 assert.ok(sections.future.some(card=>card.label==="Drainage condition"));
});

test("bundled storage summaries resolve in every supported locale",()=>{
 for(const crop of knowledgeManifest.coverage.namedCrops){
  const examples=harvestRiskDetails({crop,harvested:true})
   .flatMap(card=>card.profiles.filter(profile=>profile.phase==="storage"));
  for(const locale of ["hi","pa","mr","gu","bn","ta","te","kn","ml","or"]){
   for(const example of examples){
    for(const text of [example.name,example.signs[0],example.prevention]){
     assert.notEqual(protectionText(locale,text),text,`${crop} ${locale}: ${text}`);
    }
   }
  }
 }
});
