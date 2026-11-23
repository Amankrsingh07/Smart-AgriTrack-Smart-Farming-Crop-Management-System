import type {SoilHealthInput} from "./soil-health";
import {barleyReferenceReview} from "./barley-reference-review";
/** Production context and source evidence only; never creates executable nutrient rates. */
export function barleyProductionReview(input:SoilHealthInput){
 const evidence=barleyReferenceReview(input.crop,input.state);if(!evidence)return null;
 const missingInputs=[...(!input.barleyUse||input.barleyUse==="UNKNOWN"?["Barley use (feed, malt, hulless or dual purpose)"]:[]),...(!input.waterRegime||input.waterRegime==="UNKNOWN"?["Irrigated or rainfed production"]:[]),...(!input.sowingCondition||input.sowingCondition==="UNKNOWN"?["Timely or late sowing"]:[])];
 const scoped=input.waterRegime==="IRRIGATED"&&input.sowingCondition==="TIMELY"&&["FEED","MALT","HULLESS"].includes(input.barleyUse??"");
 return {datasetVersion:evidence.version,recorded:{use:input.barleyUse??"UNKNOWN",waterRegime:input.waterRegime??"UNKNOWN",sowingCondition:input.sowingCondition??"UNKNOWN"},missingInputs,
 status:"NOT_CALCULATION_READY" as const,matchingReviewedPackage:scoped?"ICAR-IIWBR November 2026 · NEPZ irrigated timely-sown · "+input.barleyUse:null,
 missingScientificRequirements:["An applicable Bihar/NEPZ advisory explicitly defining the complete nutrient targets as kg/ha N, P2O5 and K2O.",...(input.barleyUse==="MALT"?["Resolve the differing malt packages in EB-53 and the November 2026 advisory; do not combine their rates."]:[]),...(!scoped&&missingInputs.length===0?["A reviewed package for the selected use, irrigation and sowing combination; a timely irrigated package cannot be substituted."]:[])],
 sources:evidence.reviews.filter(r=>r.id.includes("IIWBR-NEPZ")||r.id.includes("EB53")||r.id.includes("EB44")),calculationEnabled:false as const,numericalRecommendation:null};
}
