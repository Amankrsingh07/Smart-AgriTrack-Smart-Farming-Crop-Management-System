import {z} from "zod";
import {applicationSchema} from "./crop-protection-applications";
import {symptoms} from "./crop-protection";
const draftText=z.string().max(2000);
export const protectionDraftSchema=z.object({
 savedAt:z.iso.datetime(),selected:z.string().max(100),
 fields:z.record(z.string().max(100),draftText).refine(v=>Object.keys(v).length<=100),
 signs:z.array(z.string().max(80)).max(symptoms.length),pollution:z.array(z.string().max(80)).max(9),
 labs:z.array(z.object({matrix:z.enum(["Soil","Water"]),parameter:draftText,value:z.string().max(100),unit:draftText,sampleDate:z.string().max(40),laboratory:draftText,method:draftText,reportReference:draftText,sampleLocation:draftText.optional(),referenceStandard:draftText.optional()})).max(50),
 applications:z.array(applicationSchema).max(30)
});
