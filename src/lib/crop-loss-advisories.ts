import { officialLossSources } from "./crop-loss-prevention";
const allowedHosts=new Set(["mausam.imd.gov.in","icar-crida.res.in","www.icar-crida.res.in"]);
export function officialBulletinLinks(html:string,base:string){
 const links=new Set<string>();
 for(const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)){
  try{const url=new URL(match[1].replaceAll("&amp;","&"),base);if(url.protocol==="https:"&&allowedHosts.has(url.hostname)&&/\.pdf(?:$|\?)/i.test(url.href))links.add(url.href);}catch{/* Invalid source links are ignored. */}
  if(links.size>=8)break;
 }return [...links];
}
/** A filename date is a clue, not a verified PDF issue/validity period. */
export function officialBulletinDetails(url:string,today=new Date().toISOString().slice(0,10)){
 let text="";try{text=decodeURIComponent(new URL(url).pathname);}catch{/* Malformed/unrecognized URL remains undated. */}
 const months=["january","february","march","april","may","june","july","august","september","october","november","december"];
 const named=text.match(/(?:^|[^0-9])(\d{1,2})[-_ ]+(January|February|March|April|May|June|July|August|September|October|November|December)[-_ ]+(20\d{2})(?:[^0-9]|$)/i);
 const iso=text.match(/(?:^|[^0-9])(20\d{2})[-_](\d{2})[-_](\d{2})(?:[^0-9]|$)/);
 let date=named?`${named[3]}-${String(months.indexOf(named[2].toLowerCase())+1).padStart(2,"0")}-${named[1].padStart(2,"0")}`:iso?`${iso[1]}-${iso[2]}-${iso[3]}`:null;
 if(date){const parsed=new Date(`${date}T00:00:00Z`);if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)date=null;}
 const status=date===null?"DATE_UNKNOWN":date<today?"HISTORICAL":date===today?"DATED_TODAY":"FUTURE_DATE";
 const label=status==="HISTORICAL"?`Historical bulletin — date in link ${date}`:status==="DATED_TODAY"?`Dated today (${date}) — validity unverified`:status==="FUTURE_DATE"?`Future date in link (${date}) — verify publication`:"Bulletin date unknown — inspect the original PDF";
 return {url,dateInLink:date,status,label,validity:"Unverified. A past filename date does not prove expiry; a current filename date does not prove local applicability.",dateEvidence:"URL filename only; not independently verified from PDF content."};
}
/** Fixed official destinations only; no user-provided URL or invented API. */
export async function accessibleOfficialAdvisories(){
 return Promise.all(officialLossSources.map(async source=>{
  const checkedAt=new Date().toISOString();
  try{
   const response=await fetch(source.url,{redirect:"error",cache:"no-store",signal:AbortSignal.timeout(6000)});
   if(!response.ok)throw Error("unavailable");
   const reader=response.body?.getReader();if(!reader)throw Error("empty");
   const chunks:Uint8Array[]=[];let size=0;
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>512*1024){await reader.cancel();throw Error("too large");}chunks.push(part.value);}
   const html=Buffer.concat(chunks).toString("utf8");
   const links=officialBulletinLinks(html,source.url);
   return {...source,checkedAt,available:true,links,bulletins:links.map(url=>officialBulletinDetails(url,checkedAt.slice(0,10))),note:"Official index retrieved. Publication date, district/crop applicability and bulletin validity require manual review; retrieval time is not issue time. No advisory text was automatically applied."};
  }catch{return {...source,checkedAt,available:false,links:[] as string[],bulletins:[] as ReturnType<typeof officialBulletinDetails>[],note:"Official index could not be retrieved. The source link remains available for manual access; no cached or invented advisory was substituted."};}
 }));
}
