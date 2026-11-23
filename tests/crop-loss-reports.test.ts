import test from "node:test";
import assert from "node:assert/strict";
import { aggregateLossReport, compareExpectedActual, preventionProgress } from "../src/lib/crop-loss-reports";

const allocation = (harvested:string, marketable:string, damaged:string, wasted:string, price:string|null=null, recovery:string|null=null, priceEvidence:string|null=null, priceConfirmed=false) => ({ harvested, marketable, damaged, wasted, quantitiesConfirmed:true, priceConfirmed, pricePerUnit:price, damagedRecovery:recovery, priceEvidence });
const lot = (overrides:Partial<{crop:string;cropId:string;farmId:string;fieldId:string;unit:string;harvestDate:string;metrics:ReturnType<typeof allocation>|null}>={}) => ({crop:"Wheat",cropId:"wheat",farmId:"farm-a",fieldId:"field-a",unit:"quintal",harvestDate:"2026-01-14",metrics:allocation("20","15","3","2"),...overrides});

test("crop and monthly aggregation uses saved allocations and exact unit buckets",()=>{
 const report=aggregateLossReport([lot(),lot({harvestDate:"2026-02-01",metrics:allocation("10","8","1","1")}),lot({crop:"Rice",cropId:"rice",unit:"kg",metrics:allocation("100","90","5","5")})]);
 assert.equal(report.month.length,3);assert.equal(report.crop.length,2);assert.equal(report.includedLots,3);
 const wheat=report.crop.find(row=>row.label==="Wheat"&&row.unit==="quintal")!;assert.equal(wheat.harvested,"30");assert.equal(wheat.affected,"7");assert.equal(wheat.lossPercent,"23.33");
});
test("farm, field, crop and date filters exclude unrelated rows",()=>{
 const report=aggregateLossReport([lot(),lot({farmId:"farm-b"}),lot({fieldId:"field-b"}),lot({cropId:"rice",crop:"Rice"}),lot({harvestDate:"2025-12-31"})],{farmId:"farm-a",fieldId:"field-a",cropId:"wheat",from:"2026-01-01",to:"2026-12-31"});
 assert.equal(report.includedLots,1);assert.equal(report.month[0].harvested,"20");
});
test("unverified money stays unavailable, while complete price evidence aggregates",()=>{
 const verified=allocation("20","15","3","2","100","25","Receipt 123, 2026-01-14",true);
 const report=aggregateLossReport([lot({metrics:verified}),lot()]);assert.equal(report.crop[0].monetaryLoss,null);assert.equal(report.crop[0].valuedLots,1);
 const onlyVerified=aggregateLossReport([lot({metrics:verified})]);assert.equal(onlyVerified.crop[0].monetaryLoss,"475.00");
});
test("expected versus actual reports only matching valid units",()=>{
 assert.deepEqual(compareExpectedActual(null,"quintal",[]),{available:false,reason:"Expected harvest is not recorded."});
 assert.equal(compareExpectedActual("10","quintal",[{harvested:"12",unit:"quintal"}]).available,true);
 const result=compareExpectedActual("10","quintal",[{harvested:"12",unit:"quintal"}]);if(result.available){assert.equal(result.difference,"2");assert.equal(result.differencePercent,"20.00");}
 assert.equal(compareExpectedActual("10","quintal",[{harvested:"100",unit:"kg"}]).available,false);
 assert.equal(compareExpectedActual("0","quintal",[{harvested:"2",unit:"quintal"}]).available,false);
});
test("prevention progress is transparent and has no fabricated zero denominator score",()=>{
 assert.equal(preventionProgress({inspectedLots:0,harvestedLots:0,completedActivities:0,totalActivities:0,completedFollowUps:0,totalFollowUps:0}).score,null);
 const result=preventionProgress({inspectedLots:1,harvestedLots:2,completedActivities:1,totalActivities:2,completedFollowUps:0,totalFollowUps:0});
 assert.equal(result.score,50);assert.deepEqual(result.parts.map(part=>part.label),["Harvest lots inspected","Prevention activities completed"]);
});
