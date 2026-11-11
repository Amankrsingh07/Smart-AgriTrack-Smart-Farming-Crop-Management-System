import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { getUser } from "@/lib/session";
import { isLanguageCode } from "./languages";
import { extraMessages } from "./extra-messages";
import { dashboardMessages } from "./dashboard-messages";
import { authMessagesFor } from "./auth-messages";
import { pageMessagesFor, recordsMessages } from "./page-messages";

export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get("agritrack_locale")?.value;
  let locale = cookieLocale && isLanguageCode(cookieLocale) ? cookieLocale : "en";
  if (!cookieLocale) {
    try {
      const user = await getUser();
      if (user && isLanguageCode(user.language)) locale = user.language;
    } catch { /* Fall back to English if the preference cannot be read. */ }
  }
  const baseMessages = (await import(`../../messages/${locale}.json`)).default;
  const irrigationMessages = (await import(`../../messages/${locale === "hi" ? "hi" : "en"}.json`)).default.Irrigation;
  return { locale, messages: { ...baseMessages, ...(extraMessages[locale] ?? extraMessages.en), ...pageMessagesFor(locale), Irrigation: irrigationMessages, Records: recordsMessages[locale === "hi" || locale === "bn" ? locale : "en"], Auth: authMessagesFor(locale), Dashboard: dashboardMessages[locale] ?? dashboardMessages.en } };
});
