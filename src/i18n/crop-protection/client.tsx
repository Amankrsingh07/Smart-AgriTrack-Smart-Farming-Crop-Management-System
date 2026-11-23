"use client";
import React,{Children,cloneElement,isValidElement,type ReactNode,type ReactElement,createContext,useContext} from "react";
import {useLocale} from "next-intl";
import {translateProtection} from "./translate";
const Catalog = createContext<Record<string,string> | undefined>(undefined);
export function ProtectionCatalogProvider({ value, children }: { value: Record<string, string> | undefined; children: ReactNode }) {
  return <Catalog.Provider value={value}>{children}</Catalog.Provider>;
}
export function useProtectionText() {
 const locale = useLocale();
 const catalog = useContext(Catalog);
 return (value:string) => translateProtection(locale,catalog,value);
}
/** Translate application-owned display text only; preserve submitted option values and raw evidence. */
export function ProtectionLanguage({children,notice=false}:{children:ReactNode;notice?:boolean}){
 const locale=useLocale();
 const catalog=useContext(Catalog);
 const protectionText=useProtectionText();
 function translate(node:ReactNode):ReactNode{
  if(typeof node==="string")return protectionText(node);
  if(!isValidElement(node))return node;
  const el=node as ReactElement<Record<string,unknown>>;const p=el.props;
  if(p["data-protection-raw"]!==undefined||["input","textarea","script","style"].includes(String(el.type)))return el;
  const updates:Record<string,unknown>={};
  if(el.type==="option"&&p.value===undefined&&typeof p.children==="string")updates.value=p.children;
  for(const key of ["title","aria-label","placeholder"])if(typeof p[key]==="string")updates[key]=protectionText(p[key] as string);
  if(p.children!==undefined)updates.children=Children.map(p.children as ReactNode,translate);
  return cloneElement(el,updates);
 }
 const text=notice&&locale!=="en"&&!catalog?"English fallback: this language is not supported.":null;
 return <>{text&&<p className="notice" lang={locale==="hi"?"hi":"en"}>{text}</p>}{Children.map(children,translate)}</>;
}
