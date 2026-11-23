import assert from "node:assert/strict";
import {test} from "node:test";
import {assessProtection,cropSymptomOptions,protectionSchema,type ProtectionInput} from "../src/lib/crop-protection";

function input(cropName:string,symptoms:string[],extra:Record<string,unknown>={}):ProtectionInput {
 return protectionSchema.parse({cropName,symptoms,affected:"10–25%",onset:"2026-01-01",spreading:false,
  pattern:"One section",timing:"Gradually",symptomsAfterApplication:false,pollution:[],...extra});
}

test("rice blast ranks ahead of bacterial leaf blight with pointed gray spots",()=>{
 const pointed="Pointed spots with gray centers and brown edges";
 const result=assessProtection(input("Paddy",["Yellow leaves","Dry leaf edges",pointed]));
 assert.equal(result.topSuspects[0].id,"rice-blast");
 assert.ok(result.topSuspects[0].farmerSigns.includes(pointed));
 assert.ok(result.topSuspects.find(c=>c.id==="screen-2")?.conflicts.includes(pointed));
 assert.ok(result.plan.some(p=>p.key==="check-rice-blast"));
 assert.ok(cropSymptomOptions("Rice (Paddy)").includes(pointed));
 assert.ok(!cropSymptomOptions("Tomato").includes(pointed));
});

test("bacterial leaf blight ranks first with long yellow wavy leaf-tip streaks",()=>{
 const result=assessProtection(input("Rice",["Yellow leaves","Brown leaves","Long yellow streaks from leaf tips with wavy edges"]));
 assert.equal(result.topSuspects[0].id,"screen-2");
});

test("tomato early blight photo evidence breaks the tie with Septoria without changing farmer signs",()=>{
 const farmer=input("Tomato",["Black spots","Spots started on older lower leaves"]);
 const ring="Brown spots with rings inside";
 const fused=assessProtection(farmer,{},[ring]);
 assert.equal(fused.topSuspects[0].id,"tomato-early-blight");
 assert.deepEqual(fused.topSuspects[0].imageSigns,[ring]);
 assert.ok(!fused.topSuspects[0].farmerSigns.includes(ring));
 assert.ok(fused.topSuspects[1].conflicts.includes(ring));
 assert.deepEqual(assessProtection(farmer,{},[]),assessProtection(farmer));
});

test("nitrogen deficiency is supported by older-leaf yellowing and an existing low nitrogen report",()=>{
 const result=assessProtection(input("Rice",["Even yellowing on older leaves","Yellow leaves"]),{soilReport:{
  id:"existing-soil",sampleDate:"2026-01-01",
  summary:{ph:"",limitations:"",nutrients:[{name:"Nitrogen (N)",rating:"Low",guidance:""}]}
 }});
 assert.equal(result.topSuspects[0].id,"rice-nitrogen");
 assert.ok(result.topSuspects[0].fieldEvidence.includes("The linked soil report lists low nitrogen."));
});

test("waterlogging ranks ahead of diseases when tomato root-zone saturation is reported",()=>{
 const result=assessProtection(input("Tomato",["Plant wilting"],{fieldHistory:{soilMoisture:"Waterlogged"}}));
 assert.equal(result.topSuspects[0].id,"root-waterlogging");
 assert.ok(result.topSuspects[0].fieldEvidence.length);
});

test("pollution risk prioritizes reported discharge evidence and independent testing",()=>{
 const result=assessProtection(input("Tomato",[],{pollution:["Wastewater enters field","Visible upstream discharge"]}));
 assert.equal(result.topSuspects[0].id,"pollution-risk");
 assert.equal(result.evidenceStatus,"High Priority for Testing");
 assert.match(result.sourceAttribution,/No industrial source established/);
});

test("insufficient evidence does not fill three slots with guesses",()=>{
 for(const symptoms of [[],["Yellow leaves"]]){
  const result=assessProtection(input("Rice",symptoms));
  assert.equal(result.screeningStatus,"Insufficient Evidence");
  assert.deepEqual(result.topSuspects,[]);
 }
});
