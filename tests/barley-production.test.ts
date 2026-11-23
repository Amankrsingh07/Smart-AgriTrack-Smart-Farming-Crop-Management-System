import test from "node:test";
import assert from "node:assert/strict";
import {barleyProductionReview} from "../src/lib/barley-production";
import {buildStandardCropPlan,standardScheduleRows} from "../src/lib/standard-crop-plan";
import {getIcarRecipes} from "../src/lib/icar-fertilizer";
import {soilHealthSchema} from "../src/lib/soil-health-validation";
import {analyzeSoil,type SoilHealthInput} from "../src/lib/soil-health";
const sample:SoilHealthInput={mode:"REAL",crop:"Barley",state:"Bihar",district:"Chhapra",growthStage:"Vegetative",soilType:"Alluvial",fieldAreaHa:2.5*.40468564224,soilPh:7,potassiumKgHa:110,potassiumBasis:"K2O",potassiumMethod:"NEUTRAL_1N_NH4OAC_K",nutrientUnit:"kg/ha",referenceStandardId:"BIHAR_CSTL_GOI_2011",laboratoryName:"TEST LAB",labReferenceConfirmed:true};
test("Barley production metadata round-trips without changing measurements or classifying unknown production conditions",()=>{
 const legacy=soilHealthSchema.parse(sample);assert.equal(legacy.barleyUse,"UNKNOWN");assert.equal(legacy.waterRegime,"UNKNOWN");assert.equal(legacy.sowingCondition,"UNKNOWN");assert.equal(barleyProductionReview(legacy)!.missingInputs.length,3);
 const current=soilHealthSchema.parse({...sample,barleyUse:"FEED",waterRegime:"IRRIGATED",sowingCondition:"TIMELY"});assert.equal(current.potassiumKgHa,110);assert.equal(current.soilPh,7);assert.equal(current.barleyUse,"FEED");assert.equal(analyzeSoil(current).nutrients[2].rating,"Low");assert.equal(barleyProductionReview(current)!.missingInputs.length,0);
 assert.equal(soilHealthSchema.safeParse({...sample,barleyUse:"auto-detect"}).success,false);
});
test("source-compatible production conditions do not establish missing phosphorus/potassium dose bases",()=>{
 for(const barleyUse of ["FEED","HULLESS","MALT"] as const){const input={...sample,barleyUse,waterRegime:"IRRIGATED" as const,sowingCondition:"TIMELY" as const};const review=barleyProductionReview(input)!;assert.match(review.matchingReviewedPackage!,/November 2026/);assert.equal(review.calculationEnabled,false);const plan=buildStandardCropPlan(input);assert.equal(plan.calculation,null);assert.equal(plan.calendar.supported,false);assert.match(plan.label,/Standard Barley/);assert.match(plan.reason!,/Missing scientific data/);assert.doesNotMatch(plan.reason!,/Missing farmer inputs/);assert.deepEqual(getIcarRecipes("Barley","Bihar"),[]);assert.equal(analyzeSoil(input).fertilizerAssessment.numericalRecommendation,null);assert.throws(()=>standardScheduleRows(plan,[{index:0,date:"2026-11-25"}]));}
});
test("malt, dual purpose, rainfed and late packages are not silently substituted or merged",()=>{
 const malt=barleyProductionReview({...sample,barleyUse:"MALT",waterRegime:"IRRIGATED",sowingCondition:"TIMELY"})!;assert.ok(malt.missingScientificRequirements.some(s=>s.includes("differing malt packages")));
 for(const extra of [{barleyUse:"DUAL_PURPOSE" as const},{waterRegime:"RAINFED" as const},{sowingCondition:"LATE" as const}]){const r=barleyProductionReview({...sample,barleyUse:"FEED",waterRegime:"IRRIGATED",sowingCondition:"TIMELY",...extra})!;assert.equal(r.matchingReviewedPackage,null);assert.equal(r.calculationEnabled,false);}
 assert.equal(barleyProductionReview({...sample,crop:"Wheat"}),null);assert.equal(barleyProductionReview({...sample,state:"Punjab"}),null);
});
