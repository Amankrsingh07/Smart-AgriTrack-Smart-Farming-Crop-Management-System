import {loadOpenMeteoForecast} from "./open-meteo";
import {weatherFailureDetails,WeatherForecastError} from "./weather-diagnostics";

export async function readCropLossWeather(
 latitude:number|null,longitude:number|null,automatic:boolean,load=loadOpenMeteoForecast,
) {
 if(latitude===null||longitude===null)return offline(new WeatherForecastError("MISSING_COORDINATES","Saved farm coordinates are missing."));
 const key=`${latitude}:${longitude}`;
 const now=Date.now();
 const prior=forecastCache.get(key);
 const cached=automatic&&prior&&prior.expires>now;
 const retrieve=()=>load(latitude,longitude).then(forecast=>({forecast,fetchedAt:new Date().toISOString()}));
 const result=cached?prior.result:retrieve();
 if(!cached) {
  if(forecastCache.size>=64)forecastCache.delete(forecastCache.keys().next().value!);
  forecastCache.set(key,{result,expires:now+4*60_000});
 }
 try {
  return {source:cached?"Cached" as const:"Live API" as const,...await result,issue:null};
 } catch(error) {
  if(forecastCache.get(key)?.result===result)forecastCache.delete(key);
  return offline(error);
 }
}

const forecastCache=new Map<string,{
 expires:number;
 result:Promise<{forecast:Awaited<ReturnType<typeof loadOpenMeteoForecast>>;fetchedAt:string}>;
}>();

function offline(error:unknown) {
 return {source:"Offline" as const,forecast:null,fetchedAt:null,issue:weatherFailureDetails(error)};
}
