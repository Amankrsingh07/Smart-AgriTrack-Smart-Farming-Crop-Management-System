import {calculateCustomFertilizer} from "./icar-fertilizer";
import {fertilizerCropKey} from "./fertilizer-crop-registry";
export function calculateFertilizerDemo(crop:string,targets:{n:number;p2o5:number;k2o:number},areaHa:number){
 if(!fertilizerCropKey(crop))throw new Error("Choose a supported crop for the isolated demonstration.");
 const calculation=calculateCustomFertilizer({nitrogenKgHa:targets.n,phosphorusP2O5KgHa:targets.p2o5,potassiumK2OKgHa:targets.k2o,areaHa,basalNitrogenPercent:100,basalPhosphorusPercent:100,basalPotassiumPercent:100,topdressLabel:"SIMULATED — no application timing"});
 if(!calculation)throw new Error("Invalid synthetic targets or DAP nitrogen exceeds N. No dose was generated.");
 return {mode:"DEMO" as const,label:"SIMULATED ACADEMIC TARGETS — not an agricultural recommendation",crop,targets,areaHa,calculation,persistable:false,calendarAllowed:false,scientificReference:null};
}
