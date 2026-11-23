import test from "node:test";
import assert from "node:assert/strict";
import { lossMetrics, lossAnalytics, cropLossSchema, type LossMetricInput } from "../src/lib/crop-loss";
import { valuationIssues, formatLossMoney } from "../src/lib/crop-loss-valuation";
const wheat: LossMetricInput = { harvested:"50",marketable:"42",damaged:"5",wasted:"3",quantitiesConfirmed:true,pricePerUnit:"2500",damagedRecovery:"5000",priceEvidence:"TEST ONLY receipt and recovery evidence",priceConfirmed:true };
const payload = {mode:"REAL",synthetic:false,productionId:"isolated-test-lot",version:0,assessedDate:"2026-10-02",marketable:"42",damaged:"5",wasted:"3",unit:"quintal",quantitiesConfirmed:true,evidence:"TEST ONLY weighing receipt",pricePerUnit:"2500",damagedRecovery:"5000",priceEvidence:"TEST ONLY price/recovery receipts",priceConfirmed:true,cause:"Unknown"};
const grouped = (metrics: LossMetricInput) => ({year:"2026",season:"RABI",crop:"Wheat",field:"TEST ONLY North field",unit:"quintal",metrics});
test("50-quintal wheat valuation returns 16%, 6% and exactly ₹15,000",()=>{
 const result=lossMetrics(wheat);
 assert.equal(result.lossPercent,"16.00");assert.equal(result.wastePercent,"6.00");assert.equal(result.monetaryLoss,"15000.00");assert.deepEqual(result.valuationIssues,[]);
 assert.equal(formatLossMoney(result.monetaryLoss!),"₹15,000");assert.equal(cropLossSchema.safeParse(payload).success,true);
});
test("stored price and recovery without attestation expose the exact outstanding requirement",()=>{
 const result=lossMetrics({...wheat,priceConfirmed:false});assert.equal(result.monetaryLoss,null);assert.equal(result.lossPercent,"16.00");assert.equal(result.wastePercent,"6.00");
 assert.deepEqual(result.valuationIssues.map(issue=>issue.code),["MISSING_ATTESTATION"]);
 assert.match(result.valuationIssues[0].message,/check.*I verified same-unit price/);
 assert.equal(cropLossSchema.parse({...payload,priceConfirmed:undefined}).priceConfirmed,false);
});
test("missing or whitespace evidence remains insufficient and validation names its field",()=>{
 for(const evidence of [null,undefined,"","   "]){const result=lossMetrics({...wheat,priceEvidence:evidence});assert.equal(result.monetaryLoss,null);assert.deepEqual(result.valuationIssues.map(issue=>issue.field),["priceEvidence"]);}
 const parsed=cropLossSchema.safeParse({...payload,priceEvidence:"   "});assert.equal(parsed.success,false);if(!parsed.success)assert.ok(parsed.error.issues.some(issue=>issue.path[0]==="priceEvidence"&&/evidence/.test(issue.message)));
});
test("explicit zero recovery is valid; a missing recovery is never assumed zero",()=>{
 assert.equal(lossMetrics({...wheat,damagedRecovery:"0"}).monetaryLoss,"20000.00");assert.equal(cropLossSchema.safeParse({...payload,damagedRecovery:"0"}).success,true);
 for(const recovery of [null,""]){const result=lossMetrics({...wheat,damagedRecovery:recovery});assert.equal(result.monetaryLoss,null);assert.ok(result.valuationIssues.some(issue=>issue.code==="MISSING_RECOVERY"));}
});
test("invalid prices and recoveries cannot produce monetary totals or pass API validation",()=>{
 for(const price of ["0","0.00","-1","NaN","Infinity","2500.001","1000000000","2e3"]){assert.equal(lossMetrics({...wheat,pricePerUnit:price}).monetaryLoss,null);assert.ok(valuationIssues({...wheat,pricePerUnit:price}).some(issue=>issue.code==="INVALID_PRICE"));assert.equal(cropLossSchema.safeParse({...payload,pricePerUnit:price}).success,false,price);}
 for(const recovery of ["-1","NaN","Infinity","1.001"]){assert.equal(lossMetrics({...wheat,damagedRecovery:recovery}).monetaryLoss,null);assert.equal(cropLossSchema.safeParse({...payload,damagedRecovery:recovery}).success,false);}
 assert.equal(lossMetrics({...wheat,damagedRecovery:"12500.01"}).monetaryLoss,null);assert.ok(valuationIssues({...wheat,damagedRecovery:"12500.01"}).some(issue=>issue.code==="RECOVERY_EXCEEDS_VALUE"));
});
test("all four analytics dimensions use the same complete valuation and exact missing-field coverage",()=>{
 for(const rows of [lossAnalytics([grouped(wheat)]),lossAnalytics([grouped({...wheat,priceConfirmed:false})])])for(const dimension of ["year","season","crop","field"]){assert.equal(rows[dimension][0].monetaryLoss,rows.year[0].monetaryLoss);}
 const complete=lossAnalytics([grouped(wheat)]);for(const dimension of ["year","season","crop","field"]){assert.equal(complete[dimension][0].monetaryLoss,"15000.00");assert.deepEqual(complete[dimension][0].valuationIssues,[]);}
 const mixed=lossAnalytics([grouped(wheat),grouped({...wheat,priceConfirmed:false,priceEvidence:null})]);
 for(const dimension of ["year","season","crop","field"]){const row=mixed[dimension][0];assert.equal(row.monetaryLoss,null);assert.equal(row.valuedLots,1);assert.equal(row.lots,2);assert.equal(row.valuationIssues.find(issue=>issue.code==="MISSING_ATTESTATION")?.lotCount,1);assert.equal(row.valuationIssues.find(issue=>issue.code==="MISSING_EVIDENCE")?.lotCount,1);}
});
test("missing prices and unconfirmed quantities identify their own reasons without inventing data",()=>{
 const result=lossMetrics({...wheat,pricePerUnit:null});assert.equal(result.monetaryLoss,null);assert.deepEqual(result.valuationIssues.map(issue=>issue.code),["MISSING_PRICE"]);
 assert.ok(lossMetrics({...wheat,quantitiesConfirmed:false}).valuationIssues.some(issue=>issue.code==="INVALID_ALLOCATION"));
 const before=JSON.stringify(wheat);lossMetrics(wheat);assert.equal(JSON.stringify(wheat),before);
});
test("display formatting preserves precise Decimal text and Indian digit grouping",()=>{
 assert.equal(formatLossMoney("0.00"),"₹0");assert.equal(formatLossMoney("15000.25"),"₹15,000.25");assert.equal(formatLossMoney("1000000000000000.01"),"₹1,00,00,00,00,00,00,000.01");
});

test("loss breakdown preserves exact products and keeps incomplete evidence unavailable",()=>{
 assert.deepEqual(lossMetrics(wheat).breakdown,{
  pricePerUnit:"2500",damagedFullValue:"12500",damagedRecovery:"5000",discardedFullValue:"7500",
 });
 assert.equal(lossMetrics({...wheat,priceConfirmed:false}).breakdown,null);
 const fractional=lossMetrics({...wheat,harvested:"1",marketable:"0.998",damaged:"0.001",wasted:"0.001",pricePerUnit:"5.55",damagedRecovery:"0"});
 assert.equal(fractional.breakdown?.damagedFullValue,"0.00555");
 assert.equal(fractional.monetaryLoss,"0.01");
});
