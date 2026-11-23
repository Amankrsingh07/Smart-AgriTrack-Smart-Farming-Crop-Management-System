/** Sends only a generated 1x1 PNG; never reads farmer photos or reports. */
import {loadEnvConfig} from "@next/env";
import {observeProtectionImage} from "../src/lib/crop-protection-vision";
loadEnvConfig(process.cwd());
async function main(){
 const image=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=","base64");
 const result=await observeProtectionImage(image,"image/png",{apiKey:process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY,model:process.env.GEMINI_MODEL});
 console.log(JSON.stringify({syntheticNonFarmerImage:true,available:result.available,method:result.method,reason:result.reason,diagnosticAccuracyValidated:false}));
}
void main().catch(()=>{console.error("Synthetic vision smoke check failed; no farmer data transmitted");process.exitCode=1;});
