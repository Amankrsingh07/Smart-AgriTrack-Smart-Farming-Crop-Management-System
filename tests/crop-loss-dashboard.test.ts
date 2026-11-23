import {simplifyHarvestActions} from "../src/lib/crop-loss-wording";
import assert from "node:assert/strict";
import {test} from "node:test";
import {lossSoilPh} from "../src/lib/crop-loss-prevention";
import type {SoilHealthInput} from "../src/lib/soil-health";
import {harvestDashboard} from "../src/lib/crop-loss-dashboard";

test("only documented conditions affect risk and zero is a valid forecast",()=>{
 const unknown=harvestDashboard({crop:"Wheat",harvested:false});
 assert.ok(unknown.risks.every(risk=>risk.status==="Unknown"));
 const reviewed=harvestDashboard({crop:"Wheat",harvested:true,rainProbability:0,causes:["Storage","Pest or disease observed"],lowNutrients:true});
 assert.deepEqual(reviewed.risks.slice(0,3).map(r=>r.status),["No current concern","Potential concern","Inspection required"]);
 assert.equal(reviewed.risks[0].value,"0%");
 assert.equal(reviewed.risks.find(r=>r.label==="Pest infestation")?.status,"Inspection required");
 assert.equal(reviewed.risks.find(r=>r.label==="Soil nutrient deficiencies")?.status,"Potential concern");
});

test("pre-harvest plans differ by crop and never schedule storage tasks before harvest",()=>{
 const pre=harvestDashboard({crop:"Maize",stage:"Maturity",harvested:false,diseaseSigns:true});
 assert.ok(pre.actions.some(a=>a.id==="maize"));
 assert.ok(pre.actions.some(a=>a.id==="scouting"));
 assert.ok(!pre.reminderIds.includes("moisture"));
 const post=harvestDashboard({crop:"Paddy",harvested:true,hasAffected:true});
 assert.ok(post.actions.some(a=>a.id==="rice-dry"));
 assert.deepEqual(post.reminderIds,["weather","moisture","store","pests","soil"]);
 assert.ok(!post.actions.some(a=>a.id==="maturity"));
 const fresh=harvestDashboard({crop:"Tomato",harvested:true});
 assert.ok(fresh.actions.some(a=>a.id==="crates"));
 assert.ok(!fresh.actions.some(a=>a.id==="moisture"));
});

test("Gemini can select only local wording and malformed or unavailable AI retains offline actions",async()=>{
 const {actions}=harvestDashboard({crop:"Rice",harvested:true});
 const reply=(value:unknown):typeof fetch=>async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}]});
 const offline=await simplifyHarvestActions(actions);
 const enabled={apiKey:"fixture",model:"fixture-model"};
 const ai=await simplifyHarvestActions(actions,{...enabled,fetcher:reply(["moisture"])});
 assert.equal(ai.mode,"ai");
 assert.equal(ai.actions.find(a=>a.id==="moisture")?.text,actions.find(a=>a.id==="moisture")?.short);
 for(const fetcher of [reply(["invented"]),reply({price:700}),async()=>new Response(null,{status:429})]){
  assert.deepEqual(await simplifyHarvestActions(actions,{...enabled,fetcher}),offline);
 }
 assert.deepEqual(ai.actions.map(a=>a.source),actions.map(a=>a.source));
});


test("pH display requires the same compatible real report as soil alerts",()=>{
 const input={mode:"REAL",soilPh:7,labReferenceConfirmed:true,laboratoryName:"Test lab"} as SoilHealthInput;
 const result={laboratoryConfirmed:true,analysisVersion:"soil-basis-v5",ph:{rating:"Neutral",sourceUrl:"https://example.test"}};
 assert.deepEqual(lossSoilPh(input,result),{value:7,neutral:true});
 assert.equal(lossSoilPh({...input,labReferenceConfirmed:false},result),null);
 assert.equal(lossSoilPh(input,{...result,ph:{rating:"Unknown"}}),null);
});

test("the farmer's locale covers risk labels and offline action wording",async()=>{
 const {protectionText}=await import("../src/i18n/crop-protection");
 const scenarios=[
  harvestDashboard({crop:"Rice",harvested:true,hasAffected:true}),
  harvestDashboard({crop:"Tomato",harvested:true}),
  harvestDashboard({crop:"Wheat",stage:"Maturity",harvested:false,diseaseSigns:true,drainageReview:true}),
  harvestDashboard({crop:"Maize",stage:"Maturity",harvested:false}),
  harvestDashboard({crop:"Potato",stage:"Maturity",harvested:false}),
 ];
 for(const locale of ["hi","pa","mr","gu","bn","ta","te","kn","ml","or"]){
  for(const scenario of scenarios){
   for(const text of [...scenario.risks.map(r=>r.label),...scenario.actions.map(a=>a.short)]){
    assert.notEqual(protectionText(locale,text),text,`${locale} is missing ${text}`);
   }
  }
 }
});

test("Gemini receives approved wording in the selected language",async()=>{
 const {actions}=harvestDashboard({crop:"Wheat",harvested:true});
 const {protectionText}=await import("../src/i18n/crop-protection");
 const fetcher:typeof fetch=async (_url,options)=>{
  const body=JSON.parse(String(options?.body));
  assert.match(body.systemInstruction.parts[0].text,/Hindi/);
  const choices=JSON.parse(body.contents[0].parts[0].text);
  assert.equal(choices.find((item:{id:string})=>item.id==="moisture").short,protectionText("hi",actions.find(action=>action.id==="moisture")!.short));
  return Response.json({candidates:[{content:{parts:[{text:'["moisture"]'}]}}]});
 };
 const result=await simplifyHarvestActions(actions,{apiKey:"fixture",model:"fixture-model",locale:"hi",language:"Hindi",fetcher});
 assert.equal(result.mode,"ai");
 assert.equal(result.actions.find(action=>action.id==="moisture")?.text,actions.find(action=>action.id==="moisture")?.short);
});
