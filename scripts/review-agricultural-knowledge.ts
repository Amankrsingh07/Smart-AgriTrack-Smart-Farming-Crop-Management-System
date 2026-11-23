/** Read-only review tool: never publishes or overwrites a knowledge release. */
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {knowledgeReleaseSchema,knowledgeManifest,agriculturalKnowledge,compareKnowledgeReleases} from "../src/lib/agricultural-knowledge";
async function main(){
 const file=process.argv[2];if(!file)throw new Error("Usage: node --import tsx scripts/review-agricultural-knowledge.ts <candidate.json>");
 const bytes=await readFile(file);if(bytes.length>2*1024*1024)throw new Error("Candidate exceeds review size limit");
 const candidate=knowledgeReleaseSchema.parse(JSON.parse(bytes.toString()));
 console.log(JSON.stringify({status:"REVIEW_REQUIRED_NOT_PUBLISHED",sha256:createHash("sha256").update(bytes).digest("hex"),diff:compareKnowledgeReleases(agriculturalKnowledge,candidate),active:knowledgeManifest.activeRelease,checks:["Source specificity and accessibility","Rights for any copied materials","Crop/geographic/method applicability","No arbitrary chemical doses or contaminant limits","Expert evidence and test updates"],rollback:"Retain current immutable release and restore its manifest/import through reviewed version control."},null,2));
}
void main().catch(e=>{console.error(e instanceof Error?e.message:"Review failed");process.exitCode=1;});
