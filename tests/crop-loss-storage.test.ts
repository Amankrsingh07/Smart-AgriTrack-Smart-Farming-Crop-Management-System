import assert from "node:assert/strict";
import {test} from "node:test";
import {cropPhReference,inspectionInput,storageActions,storageMoistureGuideline,storageReference,storageRisk} from "../src/lib/crop-loss-storage";
import {lossAllocationError,lossMetrics} from "../src/lib/crop-loss";
import {deficientSoilReadings} from "../src/lib/crop-loss-prevention";
import type {SoilHealthInput} from "../src/lib/soil-health";
import {protectionText} from "../src/i18n/crop-protection";
import {languages} from "../src/i18n/languages";

const findings={moisture:null,temperature:null,humidity:null,pests:"Unknown",mold:"Unknown",condition:"Unknown"} as const;
const base={productionId:"fixture",version:0,inspectedOn:"2026-01-01"};

test("storage input distinguishes blank, zero, and explicit observations and rejects invalid measurements",()=>{
 assert.equal(inspectionInput.safeParse({...base,findings}).success,false);
 assert.equal(inspectionInput.parse({...base,findings:{...findings,humidity:0}}).findings.humidity,0);
 assert.equal(inspectionInput.safeParse({...base,findings:{...findings,pests:"None observed"}}).success,true);
 for(const invalid of [{moisture:-1},{humidity:101},{moisture:"12"},{temperature:-274},{temperature:Infinity},{mold:"Confirmed disease"}]){
  assert.equal(inspectionInput.safeParse({...base,findings:{...findings,...invalid}}).success,false);
 }
 assert.equal(inspectionInput.safeParse({...base,inspectedOn:"2026-02-30",findings:{...findings,moisture:1}}).success,false);
});

test("storage risks retain unknowns and treat reported mold as a concern without assigning a pathogen",()=>{
 const missing=storageRisk(findings,"Wheat");
 assert.ok(missing.cards.every(item=>["Insufficient data","Inspection required"].includes(item.status)));
 const {cards}=storageRisk({...findings,mold:"Observed",pests:"None observed",moisture:13},"Wheat");
 assert.equal(cards.find(r=>r.label==="Disease symptoms")?.status,"Inspection required");
 assert.equal(cards.find(r=>r.label==="Visible mold")?.status,"Potential concern");
 assert.equal(cards.find(r=>r.label==="Pest infestation")?.status,"No current concern");
 assert.equal(cards.find(r=>r.label==="Grain moisture")?.status,"Inspection required");
});

test("storage references preserve crop form, duration and conditions",()=>{
 assert.equal(storageReference("Wheat")?.moisture,13.5);
 assert.equal(storageReference("Maize")?.temperature,27);
 assert.equal(storageReference("Milled rice")?.humidity,70);
 assert.equal(storageReference("Paddy")?.strictMaximum,true);
 assert.equal(storageReference("Paddy")?.temperature,null);
 assert.equal(storageReference("Rice"),null);
 assert.equal(storageReference("Potato"),null);
 assert.deepEqual(cropPhReference("Wheat")?.range,[5.5,7]);
});

test("soil readings use the saved measurement and compatible interpretation without borrowing thresholds",()=>{
 const input={mode:"REAL",labReferenceConfirmed:true,laboratoryName:"Fixture lab"} as SoilHealthInput;
 const rows=[{name:"Nitrogen",rating:"Low",value:95,unit:"kg/ha",range:"Saved reference range",sourceUrl:"https://example.test",reference:{method:"Fixture method"}},
  {name:"Potassium",rating:"Low",value:10,unit:"mg/kg"},{name:"Phosphorus",rating:"Unknown",value:12,unit:"mg/kg"}];
 const report={laboratoryConfirmed:true,analysisVersion:"soil-basis-v5",nutrients:rows};
 const result=deficientSoilReadings(input,report);
 assert.deepEqual(result.map(({name,value,unit,range})=>({name,value,unit,range})),[{name:"Nitrogen",value:95,unit:"kg/ha",range:"Saved reference range"}]);
 assert.deepEqual(deficientSoilReadings({...input,mode:"DEMO"},report),[]);
});

test("inspection controls, reminder metadata and harvest units are bundled in all farmer locales",()=>{
 for(const {code} of languages.filter(item=>item.code!=="en")){
  for(const key of ["Storage inspection","Save storage inspection","Visible mold","None observed","Lot ID","Due date","Priority","Pending","quintal","bag","High concern","Overall storage risk","Water leakage","Inspection photographs and laboratory reports",...Object.values(storageActions)]){
   assert.notEqual(protectionText(code,key),key,`${code}: ${key}`);
  }
 }
});

test("isolated wheat scenario reconciles 50 quintal and ranks separately measured storage risks",()=>{
 const input={mode:"REAL",synthetic:false,productionId:"wheat-test-only",version:0,assessedDate:"2026-01-16",unit:"quintal",
  marketable:"41",damaged:"6",wasted:"3",quantitiesConfirmed:true,evidence:"Test fixture",cause:"Unknown",priceConfirmed:false} as const;
 assert.equal(lossAllocationError(input,{quantity:"50",unit:"quintal",harvestDate:"2026-01-01",sales:[]}),null);
 const metrics=lossMetrics({...input,harvested:"50",pricePerUnit:null,damagedRecovery:null});
 assert.equal(metrics.affected,"9");
 assert.equal(metrics.lossPercent,"18.00");
 assert.equal(metrics.monetaryLoss,null);
 const assessment=storageRisk({...findings,pests:"Observed",mold:"Observed",moisture:18,temperature:32,humidity:85,
  condition:"Poor",ventilation:"Poor",leakage:"Observed",durationDays:15},"Wheat");
 assert.equal(assessment.status,"High concern");
 assert.deepEqual(assessment.cards.map(card=>card.status),["Inspection required","Inspection required","Potential concern","Potential concern","Potential concern","Potential concern","High concern","Insufficient data"]);
 assert.match(assessment.cards.find(card=>card.label==="Grain moisture")?.standard??"",/13.5%/);
 assert.equal(assessment.cards.find(card=>card.label==="Grain moisture")?.value,"18% wet basis");
});

test("weather missing values remain unknown, even when other data is available",()=>{
 const unavailable=storageRisk(findings,"Wheat",[{date:"2026-01-16",rainMm:0,rainProbability:null}]).cards.at(-1)!;
 assert.equal(unavailable.status,"Insufficient data");
 assert.equal(unavailable.value,"2026-01-16 · 0 mm · Unknown");
 const forecast=storageRisk(findings,"Wheat",[{date:"2026-01-16",rainMm:null,rainProbability:40}]);
 assert.equal(forecast.cards.at(-1)?.status,"Potential concern");
 assert.equal(forecast.cards.find(card=>card.label==="Indoor temperature (°C)")?.status,"Inspection required");
});

test("weather provider failures leave the assessment offline and cached records keep their original timestamp",async()=>{
 const {readCropLossWeather}=await import("../src/lib/crop-loss-weather");
 const {WeatherForecastError}=await import("../src/lib/weather-diagnostics");
 const {loadOfflineForecast}=await import("../src/lib/open-meteo");
 const unavailable=async()=>{throw new WeatherForecastError("RATE_LIMITED","Test: HTTP 429",429);};
 assert.equal((await readCropLossWeather(null,84,true,unavailable)).issue?.code,"MISSING_COORDINATES");
 const failed=await readCropLossWeather(25,84,true,unavailable);
 assert.deepEqual([failed.source,failed.forecast,failed.fetchedAt,failed.issue?.code],["Offline",null,null,"RATE_LIMITED"]);
 // The provider adapter is mocked here. Generated weather is never injected into production.
 const live=await readCropLossWeather(25,84,true,async()=>loadOfflineForecast(25,84));
 const cached=await readCropLossWeather(25,84,true,unavailable);
 assert.deepEqual([live.source,cached.source,cached.fetchedAt],["Live API","Cached",live.fetchedAt]);
 const manual=await readCropLossWeather(25,84,false,unavailable);
 assert.equal(manual.source,"Offline");
});

test("complete observations can show no current concern while unsupported crops require review",()=>{
 const reported={...findings,pests:"None observed",mold:"None observed",disease:"None observed",leakage:"None observed",
  condition:"Good",ventilation:"Good",moisture:13,temperature:25,humidity:65,durationDays:200} as const;
 const forecast=[{date:"2026-01-16",rainMm:0,rainProbability:0}];
 assert.equal(storageRisk(reported,"Wheat",forecast).status,"No current concern");
 assert.equal(storageRisk(reported,"Rice",forecast).status,"Inspection required");
 assert.equal(storageRisk({...reported,humidity:null},"Wheat",forecast).cards.find(card=>card.label==="Indoor relative humidity (%)")?.status,"Inspection required");
});

test("pest and disease answers preserve Yes, No, Unknown and conflicting evidence",()=>{
 const pest=(status:"Observed"|"None observed"|"Unknown",severity:"Unknown"|"Mild"|"Moderate"|"Severe"="Unknown",pestType?:string)=>storageRisk({...findings,pests:status,severity,pestType},"Wheat").cards.find(card=>card.label==="Pest infestation")!;
 assert.equal(pest("Observed","Mild").status,"Inspection required");
 assert.equal(pest("Observed","Moderate").status,"Potential concern");
 assert.equal(pest("Observed","Severe").status,"Potential concern");
 assert.equal(pest("None observed").status,"No current concern");
 assert.equal(pest("Unknown").status,"Inspection required");
 assert.equal(pest("None observed","Severe").status,"Inspection required");
 const disease=(value:"Observed"|"None observed"|"Unknown",symptoms?:string)=>storageRisk({...findings,disease:value,symptoms},"Wheat").cards.find(card=>card.label==="Disease symptoms")!;
 assert.equal(disease("Observed").status,"Inspection required");
 assert.equal(disease("None observed").status,"No current concern");
 assert.equal(disease("Unknown").status,"Inspection required");
 assert.equal(disease("None observed","Leaf spots noted").status,"Inspection required");
});

test("moisture uses wet-basis limits only with a compatible crop and duration",()=>{
 const noDuration=storageRisk({...findings,moisture:12},"Wheat").cards.find(card=>card.label==="Grain moisture")!;
 assert.equal(noDuration.status,"Inspection required");assert.match(noDuration.note,/Guideline unavailable/);assert.equal(noDuration.value,"12% wet basis");
 assert.equal(storageMoistureGuideline("Wheat",200).available,true);
 assert.equal(storageMoistureGuideline("Wheat",500).available,false);
 assert.equal(storageMoistureGuideline("Paddy",180).available,false);
 const paddy=storageRisk({...findings,moisture:12,durationDays:240},"Paddy").cards.find(card=>card.label==="Grain moisture")!;
 assert.equal(paddy.status,"Potential concern");assert.match(paddy.standard??"",/12%/);
 assert.equal(storageRisk({...findings,moisture:12,durationDays:240},"Rice").cards.find(card=>card.label==="Grain moisture")?.status,"Inspection required");
});

test("missing indoor readings remain blank and forecast never changes inspection-only overall risk",()=>{
 const empty=storageRisk(findings,"Wheat");
 assert.equal(empty.cards.find(card=>card.label==="Indoor temperature (°C)")?.value,undefined);
 assert.equal(empty.cards.find(card=>card.label==="Indoor relative humidity (%)")?.value,undefined);
 assert.equal(empty.status,"Inspection required");
 const measured={...findings,pests:"None observed",mold:"None observed",disease:"None observed",condition:"Good",ventilation:"Good",leakage:"None observed",moisture:13,temperature:25,humidity:65,durationDays:200} as const;
 const sunny=storageRisk(measured,"Wheat",[{date:"2026-01-16",rainMm:0,rainProbability:0}]);
 const rainy=storageRisk(measured,"Wheat",[{date:"2026-01-16",rainMm:20,rainProbability:90}]);
 assert.equal(sunny.status,"No current concern");assert.equal(rainy.status,"No current concern");
 assert.equal(rainy.cards.at(-1)?.status,"Potential concern");
 const conflict=storageRisk({...measured,pests:"None observed",severity:"Severe",disease:"None observed",symptoms:"Spots observed",leakage:"Observed"},"Wheat");
 assert.equal(conflict.status,"High concern");
 assert.equal(conflict.cards.find(card=>card.label==="Pest infestation")?.status,"Inspection required");
 assert.equal(conflict.cards.find(card=>card.label==="Disease symptoms")?.status,"Inspection required");
});
