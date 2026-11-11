import { getUser } from "@/lib/session";
import CropAdvice from "./ui";
import { getTranslations } from "next-intl/server";

export default async function Recommendations() {
  if (!await getUser()) return null;
  const t = await getTranslations("CropAdvice");
  return <main className="crop-advice">
    <header className="crop-advice-heading">
      <p className="crop-advice-kicker">CROP ADVICE · OFFLINE READY</p>
      <h1>{t("title")}</h1>
      <p>{t("subtitle")}</p>
    </header>
    <CropAdvice />
  </main>;
}
