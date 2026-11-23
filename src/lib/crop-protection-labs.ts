import {assessWaterSodium,waterQualityReference} from "./crop-protection-water";
export type ProtectionLab={matrix:"Soil"|"Water";parameter:string;value:number;unit:string;method:string;laboratory:string;sampleDate:string;reportReference:string;sampleLocation?:string;referenceStandard?:string};
export const irrigationReference={name:"FAO Water quality for agriculture, Paper 29 Rev.1, Table 1",version:"1985; reprinted 1989/1994",url:"https://www.fao.org/4/t0234e/t0234e01.htm",scope:"General irrigation management screening, not an Indian statutory contamination or produce-safety standard. Local crop, soil, drainage and climate applicability require review."};
const normalize=(v:string)=>v.trim().toLowerCase();
const ecMethods=new Set(["eccorrectedto25°c","eccorrectedto25c","ecat25°c","ecat25c","electricalconductivityat25°c","electricalconductivityat25c"]);
export function assessProtectionLabs(labs:ProtectionLab[]){
 const findings=labs.map(l=>{
  const parameter=normalize(l.parameter);
  const missing=[...(!l.method?["Analytical / extraction method"]:[]),...(!l.laboratory?["Issuing laboratory"]:[]),...(!l.reportReference?["Report reference"]:[])];
  const metal=["pb","lead","cd","cadmium","cr","chromium","as","arsenic","hg","mercury","ni","nickel"].includes(parameter);
  let interpretation="Laboratory data available, but a validated interpretation standard is not configured. Ask the issuing laboratory for interpretation.";
  let reference:typeof irrigationReference|null=null;
  // Exact units and a temperature-corrected method are required. Repeated EC readings
  // must be interpreted sample-by-sample by the lab, never silently choose one.
  if(l.matrix==="Water"&&parameter==="ec"&&l.unit==="dS/m"&&ecMethods.has(normalize(l.method).replace(/\s/g,""))&&missing.length===0){
   interpretation=`${l.value<0.7?"No salinity restriction indicated by EC alone":l.value<=3?"Slight to moderate salinity restriction":"Severe salinity restriction"}; farmer-submitted, unverified screening only. Does not establish overall irrigation suitability, Indian compliance or contaminant safety.`;
   reference=irrigationReference;
  }
  if(l.matrix==="Water"&&parameter==="tds"&&l.unit==="mg/L"&&missing.length===0){
   interpretation=`${l.value<waterQualityReference.tds.noneBelow?"No salinity restriction indicated by TDS alone":l.value<=waterQualityReference.tds.moderateThrough?"Slight to moderate salinity restriction by TDS":"Severe salinity restriction by TDS"}. ${waterQualityReference.scope}`;
   reference=irrigationReference;
  }
  if(metal)interpretation="Contaminant concentration recorded without an automatic threshold. Qualified review must select a matrix-specific, current applicable standard, matching method and unit. Agricultural soil, environmental soil and food/feed limits are not interchangeable.";
  if(parameter==="ph")interpretation=l.matrix==="Water"?"pH alone cannot establish safe or suitable irrigation water; review salinity, sodium hazard, crop sensitivity and potential contaminants.":"Soil pH interpretation requires method and applicable regional reference. Use the existing Soil Health workflow; no lime/gypsum dose follows from pH alone.";
  return {...l,interpretation,missing,reference,verification:"Farmer-submitted; unverified"};
 });
 const eligible=findings.filter(f=>f.reference&&normalize(f.parameter)==="ec");
 const waterSalinity=eligible.length===1?eligible[0].interpretation:eligible.length>1?"Multiple water EC results: review separate samples, dates and locations with the laboratory; no single water classification assigned.":"No water EC with dS/m, method corrected to 25°C and complete laboratory/report metadata. Do not infer safety from pH or appearance.";
 return {findings,waterSalinity,sodium:assessWaterSodium(labs),waterStatus:"Insufficient data",missingWaterParameters:["EC","pH","TDS","Sodium","Chloride","Bicarbonate","SAR","Boron"].filter(p=>!labs.some(l=>l.matrix==="Water"&&normalize(l.parameter)===normalize(p))),retesting:"Arrange sample timing, preservation and repeat testing with the issuing laboratory after suspected discharge or before resuming a suspect water source; a calendar date alone does not establish safety."};
}
