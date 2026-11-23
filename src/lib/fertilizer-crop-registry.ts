import registry from "@/data/fertilizer/crop-registry.json";
const normalized=(s:string)=>s.trim().toLowerCase().replace(/[^a-z0-9]/g,"");
export const fertilizerCrops=registry.crops;
export function fertilizerCropKey(name:string){return fertilizerCrops.find(c=>c.aliases.some(a=>normalized(a)===normalized(name)))?.key??null;}
export function fertilizerCoverageTargets(configured:Array<{id:string;name:string}>=[]){
 const rows=fertilizerCrops.map(c=>({...c,cropIds:configured.filter(r=>fertilizerCropKey(r.name)===c.key).map(r=>r.id)}));
 return [...rows,...configured.filter(c=>!fertilizerCropKey(c.name)).map(c=>({key:`configured:${c.id}`,name:c.name,aliases:[c.name],cropIds:[c.id]}))];
}
