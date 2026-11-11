import AssistantForm from "./ui";
import { getTranslations } from "next-intl/server";
export default async function Assistant({searchParams}:{searchParams:Promise<{question?:string}>}){const {question}=await searchParams;const t=await getTranslations("Assistant");return <><p className="muted">{t("subtitle")}</p><h1 style={{marginTop:0}}>{t("title")}</h1><p className="muted" style={{maxWidth:750}}>{t("description")}</p><AssistantForm initialQuestion={question?.slice(0,1200)??""}/></>}
