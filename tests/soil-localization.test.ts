import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { soilText, soilDateLabel } from "../src/i18n/soil-health";
import { analyzeSoil } from "../src/lib/soil-health";
import { renderSoil } from "./helpers/soil-render";
import { languages } from "../src/i18n/languages";
import source from "../src/i18n/soil-health/en.json";
import translations from "../src/i18n/soil-health/translations.json";
test("soil catalogs cover every supported language without changing numbers or placeholders",()=>{
 const catalog=translations as Record<string,Record<string,string>>;
 const signature=(text:string)=>JSON.stringify({numbers:text.match(/\d+(?:\.\d+)?/g)?.sort()??[],keys:text.match(/\{[a-zA-Z]\w*\}/g)?.sort()??[],technical:text.match(/\b(?:N|P|K|OC|pH|P2O5|K2O|NPK|ICAR|KVK)\b|P₂O₅|K₂O|kg\/ha|kg\/acre|mg\/kg/g)?.sort()??[]});
 for(const language of languages.filter(item=>item.code!=="en")) for(const text of source){assert.ok(catalog[language.code]?.[text],`${language.code}: ${text}`);assert.equal(signature(catalog[language.code][text]),signature(text));}
});
test("every current Unknown reason has a translation in all supported locales",()=>{
 const base={mode:"DEMO" as const,state:"Bihar",district:"Saran",crop:"Wheat",growthStage:"Vegetative",soilType:"Alluvial",nitrogenKgHa:240,phosphorusKgHa:18,potassiumKgHa:150,organicCarbonPercent:.55,soilPh:6.8,phMethod:"WATER_1_2_5" as const,referenceStandardId:"BIHAR_CSTL_GOI_2011",nutrientUnit:"kg/ha" as const,phosphorusBasis:"P" as const,potassiumBasis:"K" as const,nitrogenMethod:"ALKALINE_KMNO4_N",phosphorusMethod:"OLSEN_P",potassiumMethod:"NEUTRAL_1N_NH4OAC_K",organicCarbonMethod:"WALKLEY_BLACK_OC"};
 const inputs=[{...base,state:"Rajasthan"},{...base,referenceStandardId:"UNKNOWN"},{...base,nitrogenMethod:"Kjeldahl"},{...base,phosphorusBasis:"UNKNOWN" as const},{...base,potassiumBasis:"K2O" as const},{...base,nutrientUnit:"mg/kg" as const},{...base,mode:"REAL" as const,synthetic:false},{...base,nitrogenKgHa:undefined},base];
 for(const input of inputs){const report=analyzeSoil(input);for(const language of languages.filter(item=>item.code!=="en"))for(const row of [...report.nutrients,report.organicCarbon])if(row.rating==="Unknown")assert.notEqual(soilText(language.code,row.guidance),row.guidance,`${language.code}: ${row.explanationCode}`);}
});
test("raw user names and original option values remain untouched",async()=>{
 const { SoilLanguage }=await import("../src/i18n/soil-health/client");
 const tree=React.createElement(SoilLanguage,null,React.createElement("div",null,React.createElement("span",{"data-soil-raw":true},"Unknown"),React.createElement("select",null,React.createElement("option",null,"Unknown"))));
 const html=renderSoil(tree,"hi");assert.match(html,/>Unknown<\/span>/);assert.match(html,/value="Unknown"/);assert.ok(html.includes(soilText("hi","Unknown")));
});

test("legacy dates remain safe and valid sample dates follow the selected locale",()=>{
 assert.equal(soilDateLabel("hi","not-recorded"),"not-recorded");
 assert.equal(soilDateLabel("hi","2026-02-30"),"2026-02-30");
 assert.notEqual(soilDateLabel("en","2026-10-06"),soilDateLabel("hi","2026-10-06"));
});
