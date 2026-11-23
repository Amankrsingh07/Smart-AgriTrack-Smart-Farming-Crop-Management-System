import test from "node:test";
import assert from "node:assert/strict";
import {analyzeSoil} from "../src/lib/soil-health";
import type {SoilHealthInput} from "../src/lib/soil-health";
import {convertNutrientBasis} from "../src/lib/nutrient-basis";
const sample:SoilHealthInput={mode:"REAL",state:"Bihar",district:"Chhapra",crop:"Barley",growthStage:"Vegetative",soilType:"Alluvial",soilPh:6.5,phMethod:"WATER_1_2_5",phosphorusKgHa:35,phosphorusBasis:"P2O5",phosphorusMethod:"OLSEN_P",nutrientUnit:"kg/ha",laboratoryName:"ISOLATED TEST LAB",labReferenceConfirmed:true,referenceStandardId:"BIHAR_CSTL_GOI_2011"};
test("pH 6.5 Olsen result retains a chemical conversion audit without a threshold interpretation",()=>{
 const before=structuredClone(sample),report=analyzeSoil(sample),p=report.nutrients[1];
 assert.equal(report.validationDiagnostics[1].detail,p.applicabilityExplanation);
 assert.equal(p.rating,"Unknown");assert.equal(p.explanationCode,"OLSEN_SOIL_CONDITION");assert.equal(p.interpretation,undefined);assert.equal(p.reference,undefined);
 assert.equal(p.value,35);assert.equal(p.basis,"P2O5");assert.equal(p.unit,"kg/ha");assert.equal(p.reportingBasisConversion!.value,15.295);assert.equal(p.reportingBasisConversion!.reference!.id,"GOI-2011-ANNEXURE-12");
 assert.equal(p.rejectedReference!.id,"BIHAR_CSTL_GOI_2011");assert.equal(p.rejectedReference!.recordedPh,6.5);assert.match(p.applicabilityExplanation!,/restriction of the selected interpretation table/);assert.match(p.applicabilityExplanation!,/confirmation alone cannot override/);assert.deepEqual(sample,before);
});
test("phosphorus classification still needs compatible soil condition and pH method; lab attestation is optional",()=>{
 for(const soilPh of [6.5,6.6,7])assert.equal(analyzeSoil({...sample,soilPh}).nutrients[1].explanationCode,"OLSEN_SOIL_CONDITION");
 const valid=analyzeSoil({...sample,soilPh:8.2}).nutrients[1];assert.equal(valid.rating,"Medium");assert.equal(valid.interpretation!.value,15.295);assert.equal(valid.rejectedReference,undefined);
 assert.equal(analyzeSoil({...sample,soilPh:8.2,phMethod:"OTHER"}).nutrients[1].rating,"Unknown");
 const unconfirmed=analyzeSoil({...sample,soilPh:8.2,labReferenceConfirmed:false}).nutrients[1];assert.equal(unconfirmed.rating,"Medium");
});
test("reporting-basis equivalence cannot establish extractant or concentration equivalence",()=>{
 const elemental=convertNutrientBasis(35,"P2O5","P").value;
 assert.equal(analyzeSoil({...sample,phosphorusBasis:"P",phosphorusKgHa:elemental}).nutrients[1].rating,"Unknown");
 const bray=analyzeSoil({...sample,phosphorusMethod:"Bray I"}).nutrients[1];assert.equal(bray.explanationCode,"UNSUPPORTED_METHOD");assert.equal(bray.reportingBasisConversion,undefined);
 const concentration=analyzeSoil({...sample,nutrientUnit:"mg/kg"}).nutrients[1];assert.equal(concentration.explanationCode,"INCOMPATIBLE_UNIT");assert.equal(concentration.reportingBasisConversion,undefined);
 const missing=analyzeSoil({...sample,phosphorusKgHa:undefined}).nutrients[1];assert.equal(missing.explanationCode,"MISSING_READING");assert.equal(missing.reportingBasisConversion,undefined);
});
