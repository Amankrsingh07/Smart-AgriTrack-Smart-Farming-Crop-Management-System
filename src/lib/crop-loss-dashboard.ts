
const storageSource={
 title:"ICAR Rabi Agro-Advisory for Farmers",url:"https://icar.gov.in/sites/default/files/2022-09/Rabi-Agro-Advisory-2021-22_0.pdf",
 version:"2021–22",applicability:"General grain and pulse storage. Check local advice for the intended use and storage period.",units:"Qualitative guidance",
};
const harvestSource={
 title:"TNAU Crop Harvesting Criteria",url:"https://agritech.tnau.ac.in/agriculture/agri_cropharvesting.html",version:"Reviewed 2026-11-18",
 applicability:"Harvest and storage guidance varies by crop. Check local advice before applying a moisture target.",units:"Grain moisture as a percentage",
};
const riceSource={
 title:"IRRI Harvesting Manual",url:"https://www.knowledgebank.irri.org/images/docs/training-manual-harvesting.pdf",version:"Reviewed 2026-11-18",
 applicability:"Rice harvesting and drying. Match any moisture target to the operation and the intended use.",units:"Moisture percentage on a wet basis",
};
const produceSource={
 title:"National Horticulture Board Storage Manual",url:"https://nhb.gov.in/documents/storage-manual.pdf",version:"Reviewed 2026-11-18",
 applicability:"For fruit and vegetable packing. Match container size to the crop and avoid crushing.",units:"Qualitative guidance",
};
const weatherSource={title:"IMD district agromet bulletins",url:"https://mausam.imd.gov.in/imd_latest/contents/agromet/advisory/benglishmain.php",version:"Current district bulletin",applicability:"Check district and validity dates.",units:"Forecast probability in percent and rainfall in millimetres"};
const soilSource={title:"ICAR Rabi Agro-Advisory for Farmers",url:storageSource.url,version:"2021–22",applicability:"Use a soil sample from the same field and check its suitability for the next crop.",units:"See the sample report"};

const actionCatalog={
 separate:{section:"Immediate actions",text:"Keep damaged or spoiled produce separate from healthy produce.",short:"Keep damaged or spoiled produce separate from healthy produce.",source:storageSource},
 store:{section:"Storage management",text:"Check that the store and bags are clean and dry. Keep grain bags off the floor.",short:"Use clean, dry bags and keep them off the floor.",source:storageSource},
 moisture:{section:"Immediate actions",text:"Check grain moisture before storing. Ask your local KVK which reading suits this crop and storage period.",short:"Measure grain moisture and ask the KVK what reading fits your storage plan.",source:harvestSource},
 "rice-dry":{section:"Immediate actions",text:"Plan to dry paddy promptly after harvest. Check grain moisture before bagging it.",short:"Dry the paddy promptly and measure moisture before bagging.",source:riceSource},
 crates:{section:"Storage management",text:"Use ventilated crates for fresh produce. Use shallow crates for delicate crops such as tomatoes and okra. Avoid overfilling.",short:"Pack fresh produce in ventilated crates without overfilling.",source:produceSource},
 pests:{section:"Storage management",text:"Look for insects, webbing, or holes in stored grain. Keep affected bags separate and seek local advice.",short:"Check grain bags for insects or webbing and separate affected bags.",source:storageSource},
 weather:{section:"Immediate actions",text:"Check the local weather before harvest, drying, or moving produce. Keep exposed produce ready to cover.",short:"Check the weather and have cover ready for exposed produce.",source:weatherSource},
 wheat:{section:"Next 3–7 days",text:"For wheat, check grain firmness and yellowing heads before harvest. Confirm timing locally.",short:"Check wheat grain firmness and head colour before harvest.",source:harvestSource},
 maize:{section:"Next 3–7 days",text:"For maize, check for pale brown husks and measure grain moisture before deciding when to harvest.",short:"Check maize husk colour and grain moisture before harvest.",source:harvestSource},
 maturity:{section:"Next 3–7 days",text:"Check crop maturity in the field before setting a harvest date.",short:"Check the crop in the field before choosing a harvest date.",source:harvestSource},
 soil:{section:"Future crop prevention",text:"Review the field soil report with your local adviser before planting the next crop. Arrange a test if needed.",short:"Review or arrange a soil test before the next crop.",source:soilSource},
 scouting:{section:"Next 3–7 days",text:"Inspect affected plants and ask your local KVK to check any spreading symptoms.",short:"Ask the KVK to check symptoms that are spreading.",source:weatherSource},
 "field-pests":{section:"Next 3–7 days",text:"Check leaves, stems and fruit for insects or damage.",short:"Check leaves, stems and fruit for insects or damage.",source:weatherSource},
 "field-disease":{section:"Next 3–7 days",text:"Inspect the crop and ask a local adviser to check fresh symptoms.",short:"Inspect the crop and ask a local adviser to check fresh symptoms.",source:weatherSource},
 drainage:{section:"Next 3–7 days",text:"Inspect low spots and drainage after rain before deciding whether to irrigate.",short:"Check for standing water before irrigating.",source:weatherSource},
} as const;
export type LossActionId=keyof typeof actionCatalog;
export type LossAction=typeof actionCatalog[LossActionId]&{id:LossActionId};
export type RiskStatus="Confirmed observation"|"AI-suspected condition"|"No current concern identified"|"Insufficient evidence"|"No current concern"|"Inspection required"|"Potential concern"|"Serious concern"|"Unknown";
export type LossRisk={label:string;status:RiskStatus;note?:string;value?:string};
const freshCrops=new Set(["tomato","mango","okra","green peas","peas","brinjal","chilli","cauliflower","cabbage","banana"]);
const grainCrops=new Set(["wheat","rice","paddy","rice (paddy)","maize","corn","makka","barley","sorghum","bajra","pearl millet","finger millet","ragi"]);
export const actionSections=["Immediate actions","Next 3–7 days","Storage management","Future crop prevention"] as const;

export function harvestDashboard(input:{
 crop:string;stage?:string|null;harvested:boolean;hasAffected?:boolean;causes?:string[];
 rainProbability?:number|null;rainExposure?:boolean;temperature?:number|null;humidity?:number|null;
 lowNutrients?:boolean;phConcern?:boolean;neutralPh?:boolean;phReading?:number;diseaseSigns?:boolean;seriousDiseaseSigns?:boolean;drainageReview?:boolean;riskActions?:LossActionId[];
}){
 const crop=input.crop.trim().toLowerCase();
 const rice=["rice","paddy","rice (paddy)"].includes(crop);
 const grain=grainCrops.has(crop);
 const harvestReady=input.harvested||input.stage==="Maturity";
 const rain=input.rainProbability;
 const validRain=typeof rain==="number"&&Number.isFinite(rain)&&rain>=0&&rain<=100;
 const current=typeof input.temperature==="number"&&Number.isFinite(input.temperature)&&typeof input.humidity==="number"&&Number.isFinite(input.humidity)&&input.humidity>=0&&input.humidity<=100;
 const storage=input.causes?.includes("Storage");
 const pestOrDisease=input.causes?.includes("Pest or disease observed");
 const risks:LossRisk[]=[
  {label:"Rainfall probability",status:input.rainExposure?"Potential concern":!validRain?"Unknown":rain===0?"No current concern":"Inspection required",value:validRain?`${rain}%`:undefined,note:"Weather forecast for the farm. It gives the chance of rain."},
  {label:"Storage condition",status:storage?"Potential concern":input.harvested?"Inspection required":"Unknown",note:storage?"Storage was recorded as a cause in a loss assessment.":undefined},
  {label:"Grain moisture",status:grain&&input.harvested?"Inspection required":"Unknown",note:grain&&input.harvested?"No grain moisture reading is linked to this harvest.":undefined},
  {label:"Pest infestation",status:pestOrDisease?"Inspection required":"Unknown",note:pestOrDisease?"The recorded cause groups pests and disease together. Inspect to tell them apart.":undefined},
  {label:"Disease symptoms",status:input.seriousDiseaseSigns?"Serious concern":input.diseaseSigns?"Potential concern":pestOrDisease?"Inspection required":"Unknown",note:input.diseaseSigns?"A linked crop protection report records symptoms. Ask an adviser to check their cause.":undefined},
  {label:"Soil nutrient deficiencies",status:input.lowNutrients?"Potential concern":"Unknown",note:input.lowNutrients?"A linked soil report records a low nutrient reading.":undefined},
  {label:"Soil pH",status:input.phConcern?"Inspection required":input.neutralPh?"No current concern":"Unknown",value:input.phReading?.toString(),note:input.phConcern||input.neutralPh?"Review the recorded pH class for the next crop.":undefined},
  {label:"Drainage condition",status:input.drainageReview?"Inspection required":"Unknown",note:input.drainageReview?"Check for standing water and blocked outlets.":undefined},
  {label:"Temperature and humidity",status:current?"Inspection required":"Unknown",value:current?`${input.temperature} °C · ${input.humidity}%`:undefined,note:current?"Outdoor weather at the farm. Check conditions inside the store separately.":undefined},
 ];
 const actions:LossActionId[]=[];
 if(input.hasAffected||storage)actions.push("separate");
 if(harvestReady)actions.push("weather");
 if(input.harvested){
  if(rice)actions.push("rice-dry");
  if(grain)actions.push("moisture","store","pests");
  if(freshCrops.has(crop))actions.push("crates");
 }else{
  if(harvestReady)actions.push(crop==="wheat"?"wheat":["maize","corn","makka"].includes(crop)?"maize":"maturity");
  if(input.diseaseSigns||pestOrDisease)actions.push("scouting");
  if(input.drainageReview)actions.push("drainage");
 }
 for(const id of input.riskActions??[])if(!actions.includes(id))actions.push(id);
 actions.push("soil");
 const reminderIds=actions.filter(id=>(["moisture","store","crates","pests","weather","soil"] as LossActionId[]).includes(id));
 return {risks,actions:actions.map(id=>({id,...actionCatalog[id]})),reminderIds};
}

