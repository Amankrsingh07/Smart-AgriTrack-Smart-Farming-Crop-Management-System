import test from "node:test";
import assert from "node:assert/strict";
import { handleExpectedHarvestPatch, type ExpectedHarvestDependencies } from "../src/lib/expected-harvest-api";

const request = (body:unknown) => new Request("http://localhost/api/crop-loss/expected-yield", { method:"PATCH", headers:{"content-type":"application/json"}, body:JSON.stringify(body) });
const body = { cropCycleId:"cycle-owned", expectedHarvestQuantity:"22", expectedHarvestUnit:"quintal" };
function setup(overrides:Partial<ExpectedHarvestDependencies>={}) {
 const calls:{userId:string;cycleId:string;quantity:string;unit:string}[]=[];let logged:unknown;
 const dependencies:ExpectedHarvestDependencies={
  getUser:async()=>({id:"farmer-1"}),allowRequest:()=>true,
  save:async(userId,input)=>{calls.push({userId,cycleId:input.cropCycleId,quantity:input.expectedHarvestQuantity,unit:input.expectedHarvestUnit});return {quantity:input.expectedHarvestQuantity,unit:input.expectedHarvestUnit};},
  onDatabaseError:error=>{logged=error;},createReference:()=>"test-reference",...overrides,
 };
 return {dependencies,calls,get logged(){return logged;}};
}

test("saves an owned cycle's expected quantity and returns it for immediate display",async()=>{
 const store=setup();const response=await handleExpectedHarvestPatch(request(body),store.dependencies);const result=await response.json();
 assert.equal(response.status,200);assert.deepEqual(result,{success:true,expectedHarvestQuantity:"22.000",expectedHarvestUnit:"quintal",message:"Expected harvest saved."});
 assert.deepEqual(store.calls,[{userId:"farmer-1",cycleId:"cycle-owned",quantity:"22.000",unit:"quintal"}]);
});

test("rejects missing, zero, negative, nonnumeric and over-precision quantities before writing",async()=>{
 for(const value of [undefined,"0","-1","abc","1.2345",NaN]){
  const store=setup();const invalid={...body,expectedHarvestQuantity:value};const response=await handleExpectedHarvestPatch(request(invalid),store.dependencies);
  assert.equal(response.status,400);assert.equal(store.calls.length,0);
 }
});

test("does not disclose or update a missing or unowned crop cycle",async()=>{
 const store=setup({save:async()=>null});const response=await handleExpectedHarvestPatch(request(body),store.dependencies);const result=await response.json();
 assert.equal(response.status,404);assert.match(result.error,/under your farm/);
});

test("rejects unauthenticated requests without calling the persistence layer",async()=>{
 let writes=0;const store=setup({getUser:async()=>null,save:async()=>{writes++;return null;}});
 const response=await handleExpectedHarvestPatch(request(body),store.dependencies);const result=await response.json();
 assert.equal(response.status,401);assert.match(result.error,/Sign in/);assert.equal(writes,0);
});

test("reports migration, connection and unexpected database failures with useful responses and logged references",async()=>{
 for(const [code,status,phrase] of [["P2022",503,"missing the expected-harvest columns"],["P1001",503,"database is unavailable"],["P2010",500,"database error"]] as const){
  const store=setup({save:async()=>{throw Object.assign(new Error("internal database detail"),{code});}});
  const response=await handleExpectedHarvestPatch(request(body),store.dependencies);const result=await response.json();
  assert.equal(response.status,status);assert.match(result.error,new RegExp(phrase,"i"));assert.equal(result.reference,"test-reference");assert.ok(store.logged instanceof Error);
  assert.doesNotMatch(result.error,/internal database detail/);
 }
});

test("accepts numeric JSON payloads while trimming unit whitespace",async()=>{
 const store=setup();const response=await handleExpectedHarvestPatch(request({...body,expectedHarvestQuantity:22,expectedHarvestUnit:" quintal "}),store.dependencies);const result=await response.json();
 assert.equal(response.status,200);assert.equal(result.expectedHarvestQuantity,"22.000");assert.equal(result.expectedHarvestUnit,"quintal");
});
