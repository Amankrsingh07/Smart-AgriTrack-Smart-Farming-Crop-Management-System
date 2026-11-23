export type ProtectionPlanItem={key:string;days:number;title:string;reason:string;action:string};
export type PlanInput={cropName:string;stage:string;symptoms:readonly string[];spreading:boolean;affected:string;pollution:readonly string[];symptomsAfterApplication:boolean};
export function protectionUrgency(input:PlanInput){
 const urgent=input.spreading||["50–75%","More than 75%"].includes(input.affected);
 return {level:urgent?"Prompt expert review":"Monitor and investigate",days:urgent?1:3,
  reason:urgent?"Spreading damage or at least half of the crop area is reported affected; request expert advice promptly.":"Record changes and investigate competing causes; seek earlier review if symptoms worsen."};
}
export function buildProtectionPlan(input:PlanInput,weather?:{humidity:number;rainfall:number}):ProtectionPlanItem[]{
 const urgency=protectionUrgency(input);
 const items:ProtectionPlanItem[]=[{key:"inspect",days:urgency.days,title:`Inspect ${input.cropName} crop health`,reason:`${input.stage||"Growth stage unknown"}. ${urgency.reason}`,action:"Compare new growth, affected area and reference plants; add follow-up photos and observations."}];
 if(input.symptoms.some(s=>["Water standing in field","Root rot","Plant wilting","Bad smell around roots"].includes(s)))items.push({key:"root-moisture",days:1,title:`Check ${input.cropName} roots and moisture`,reason:"Root symptoms, wilting or standing water reported.",action:"Check moisture and drainage before the next irrigation; seek field advice. Do not flood as a universal treatment."});
 if(input.pollution.some(s=>!["Factory nearby","Industrial area nearby"].includes(s)))items.push({key:"water-testing",days:1,title:`Arrange ${input.cropName} soil/water testing`,reason:"Pollution observations need independent investigation.",action:"Contact a qualified laboratory for sampling instructions and appropriate reference samples; do not attribute an industrial source."});
 if(input.symptomsAfterApplication)items.push({key:"label-review",days:1,title:`Review ${input.cropName} application records`,reason:"Symptoms reported after product application.",action:"Take formulation, dose per area, label and mixing history to a qualified adviser; avoid further unverified applications."});
 if(weather&&weather.humidity>=80)items.push({key:"weather-scout",days:1,title:`Scout ${input.cropName} after humid weather`,reason:`Available actual weather shows ${weather.humidity}% humidity and ${weather.rainfall} mm precipitation; weather is supporting context only.`,action:"Inspect for new lesions and record canopy conditions. This is a scouting reminder, not a disease forecast."});
 items.push({key:"followup",days:7,title:`Review ${input.cropName} recovery evidence`,reason:"Compare a week of observations; recovery is not guaranteed.",action:"Review new growth and tests with an adviser; use soil-test-based fertilizer planning and record applications."});
 return items;
}
export function protectionPlanDate(now:Date,days:number){
 // Store calendar dates at UTC midnight for the farmer's India-local calendar day.
 const indiaDay=new Date(now.getTime()+330*60*1000).toISOString().slice(0,10);
 const date=new Date(`${indiaDay}T00:00:00.000Z`);date.setUTCDate(date.getUTCDate()+days);return date;
}
