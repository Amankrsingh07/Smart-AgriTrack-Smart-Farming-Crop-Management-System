import { useLocale } from "next-intl";
import { farmerAdviceLabels } from "@/i18n/farmer-advice-labels";
import Link from "next/link";
import {Bug, CloudRain, Droplet, Droplets, FlaskConical, Leaf, Sprout, Thermometer, Warehouse} from "lucide-react";
import {ProtectionLanguage} from "@/i18n/crop-protection/client";
import type {HarvestRiskCard} from "@/lib/crop-loss-risk";

const icons={
 "Pest infestation":Bug,"Disease symptoms":Leaf,"Grain moisture":Droplet,"Storage condition":Warehouse,
 "Rainfall probability":CloudRain,"Temperature and humidity":Thermometer,
 "Drainage condition":Droplets,"Soil nutrient deficiencies":Sprout,"Soil pH":FlaskConical,
};

export function RiskGrid({cards,photoReport}:{cards:HarvestRiskCard[];photoReport?:string|null}){
 const [problem, reason, action, details] = farmerAdviceLabels(useLocale());
 return <ProtectionLanguage><ul className="harvest-loss-risks" role="list">{cards.map(card=>{
  const Icon=icons[card.label as keyof typeof icons]??Leaf;
  const records=card.detail?.facts??card.facts??[];
  const profiles=card.detail?.profiles??[];
  const example=profiles[0];
  const observed=records.find(fact=>fact.label==="Farmer observations"||fact.label==="AI photo observations");
  const phaseLabel=card.phase==="storage"?"Storage examples":"Field examples";
  const hasPhotoLink=photoReport&&card.phase!=="storage"&&card.detail;
  const detailsAvailable=records.length>0||profiles.length>0||hasPhotoLink||card.detail?.source;
  return <li key={card.label}>
   <header className="harvest-risk-heading"><Icon aria-hidden="true" size={18}/><h3>{card.label}</h3></header>
   <h4>{problem}</h4>
   <span className="harvest-loss-status" data-risk={card.status}>{card.status}</span>
   {card.value&&<p className="harvest-risk-reading">{card.value}</p>}
   {observed&&<p><strong>{observed.label}</strong> · {observed.value}</p>}
   <h4>{reason}</h4>
   {example?<div className="harvest-risk-example">
    <small>{phaseLabel}</small>
    <p><strong>{example.name}</strong></p>
    {example.signs[0]&&<p>{example.signs[0]}</p>}
    <h4>{action}</h4><p>{example.prevention}</p>
   </div>:<p>{card.note??card.detail?.inspection}</p>}
   {!example && card.detail?.inspection && card.detail.inspection !== card.note && <><h4>{action}</h4><p>{card.detail.inspection}</p></>}
   {detailsAvailable&&<details className="harvest-risk-details">
    <summary>{details}</summary>
    {card.note&&example&&<p>{card.note}</p>}
    {records.length>0&&<dl>{records.map((fact,index)=><div key={index}>
     <dt>{fact.label}</dt>
     <dd>{fact.source?<a href={fact.source} target="_blank" rel="noreferrer">{fact.value}</a>:<span data-protection-raw={fact.raw||undefined}>{fact.value}</span>}
     {fact.date&&<time dateTime={fact.date}> · {fact.date}</time>}</dd>
    </div>)}</dl>}
    {hasPhotoLink&&<p><Link href={photoReport}>View saved crop protection photo</Link></p>}
    {profiles.map(profile=><article key={profile.id}>
     <h4>{profile.name}</h4>
     {profile.scientificName&&<i data-protection-raw>{profile.scientificName}</i>}
     <dl>
      <div><dt>Symptoms and evidence</dt><dd>{profile.signs.map((sign,index)=><p key={index}>{sign}</p>)}</dd></div>
      {profile.conditions&&<div><dt>Possible causes</dt><dd>{profile.conditions}</dd></div>}
      <div><dt>Prevention</dt><dd>{profile.prevention}</dd></div>
      <div><dt>Inspection required</dt><dd>{profile.inspection}</dd></div>
     </dl>
     {profile.recovery&&<p>{profile.recovery}</p>}
     <p>{profile.stage} · {profile.applicability} · {profile.units} · {profile.version}</p>
     <div className="harvest-risk-links">
      <a href={profile.source} target="_blank" rel="noreferrer">Source</a>
      {profile.referenceImages&&<a href={profile.referenceImages} target="_blank" rel="noreferrer">Reference images</a>}
     </div>
    </article>)}
    {card.detail?.source&&<p><a href={card.detail.source} target="_blank" rel="noreferrer">Source</a></p>}
   </details>}
  </li>;
 })}</ul></ProtectionLanguage>;
}
