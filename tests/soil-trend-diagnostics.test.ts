import test from "node:test";
import assert from "node:assert/strict";
import { soilTrendGroups, soilTrendExclusionReasons, preferredSoilTrendGroup } from "../src/lib/soil-health-trends";
import type { SoilHealthInput } from "../src/lib/soil-health";
const input: SoilHealthInput = { mode:"REAL",state:"Bihar",district:"Saran",crop:"Wheat",growthStage:"Vegetative",soilType:"Alluvial",fieldId:"field",laboratoryName:"Lab",sampleDate:"2026-10-01",samplingDepthCm:15,nutrientUnit:"kg/ha",phosphorusBasis:"P",phosphorusMethod:"OLSEN_P",phosphorusKgHa:10 };
const record=(id:string,changes:Partial<SoilHealthInput>={})=>({id,createdAt:"2026-11-14",input:{...input,...changes},result:{version:"smart-soil-v2"}});
test("trend diagnostics identify missing metadata without substituting submission dates",()=>{
 const r=record("missing",{sampleDate:undefined,samplingDepthCm:undefined,laboratoryName:"",phosphorusMethod:"",phosphorusBasis:"UNKNOWN",nutrientUnit:"UNKNOWN"});const reasons=soilTrendExclusionReasons(r,"field","phosphorusKgHa");
 assert.equal(reasons.length,6);assert.match(reasons.join(" "),/submission date cannot replace/);assert.equal(soilTrendGroups([r],"field","phosphorusKgHa").length,0);
 assert.ok(soilTrendExclusionReasons(record("invalid",{sampleDate:"2026-02-30"}),"field","phosphorusKgHa").length);
});
test("default trend selection prefers a comparable series while preserving explicit selection",()=>{
 const groups=soilTrendGroups([record("single",{laboratoryName:"Other"}),record("a"),record("b",{sampleDate:"2026-11-01",phosphorusKgHa:12})],"field","phosphorusKgHa");
 assert.equal(preferredSoilTrendGroup(groups,"")?.points.length,2);assert.equal(preferredSoilTrendGroup(groups,groups[0].key)?.points.length,1);
 const sameDay=soilTrendGroups([record("a"),record("b")],"field","phosphorusKgHa");assert.equal(new Set(sameDay[0].points.map(p=>p.date)).size,1);
});
test("reviewed assay aliases compare, while units, bases, depths and laboratories remain separate",()=>{
 const groups=soilTrendGroups([record("a"),record("alias",{phosphorusMethod:"Olsen",sampleDate:"2026-11-01"}),record("oxide",{phosphorusBasis:"P2O5"}),record("unit",{nutrientUnit:"mg/kg"}),record("depth",{samplingDepthCm:30}),record("lab",{laboratoryName:"Other"})],"field","phosphorusKgHa");
 assert.equal(groups.length,5);assert.equal(groups[0].points.length,2);assert.equal(groups[0].points[0].value,10);
 assert.match(soilTrendExclusionReasons(record("demo",{mode:"DEMO"}),"field","phosphorusKgHa")[0],/DEMO/);
 assert.match(soilTrendExclusionReasons(record("unlinked",{fieldId:undefined}),"field","phosphorusKgHa")[0],/No saved field/);
});
