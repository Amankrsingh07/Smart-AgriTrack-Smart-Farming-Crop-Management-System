import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { getUser } from "@/lib/session";
import { isLanguageCode } from "./languages";
import { farmerMessageOverrides } from "./farmer-message-overrides";
import englishMessages from "../../messages/en.json";
import { extraMessages } from "./extra-messages";
import { dashboardMessages } from "./dashboard-messages";
import { authMessagesFor } from "./auth-messages";
import { pageMessagesFor, recordsMessages } from "./page-messages";

export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get("agritrack_locale")?.value;
  let locale =
    cookieLocale && isLanguageCode(cookieLocale) ? cookieLocale : "en";
  if (!cookieLocale) {
    try {
      const user = await getUser();
      if (user && isLanguageCode(user.language)) locale = user.language;
    } catch {
      /* Fall back to English if the preference cannot be read. */
    }
  }
  const baseMessages = (await import(`../../messages/${locale}.json`)).default;
  const irrigationMessages = (
    await import(`../../messages/${locale === "hi" ? "hi" : "en"}.json`)
  ).default.Irrigation;
  const pages = pageMessagesFor(locale);
  const englishPages = pageMessagesFor("en");
  const recordsLocale = locale === "hi" || locale === "bn" ? locale : "en";
  return {
    locale,
    messages: {
      ...baseMessages,
      ...(extraMessages[locale] ?? extraMessages.en),
      Farms: farmerMessageOverrides(
        locale,
        pages.Farms,
        englishPages.Farms,
        recordsLocale === "en",
      ),
      Crops: farmerMessageOverrides(
        locale,
        pages.Crops,
        englishPages.Crops,
        recordsLocale === "en",
      ),
      Irrigation: farmerMessageOverrides(
        locale,
        irrigationMessages,
        englishMessages.Irrigation,
        locale !== "hi",
      ),
      Records: farmerMessageOverrides(
        locale,
        recordsMessages[recordsLocale],
        recordsMessages.en,
        recordsLocale === "en",
      ),
      Fertilizer: farmerMessageOverrides(
        locale,
        baseMessages.Fertilizer,
        englishMessages.Fertilizer,
        false,
      ),
      CropCalendar: farmerMessageOverrides(
        locale,
        baseMessages.CropCalendar,
        englishMessages.CropCalendar,
        false,
      ),
      Auth: authMessagesFor(locale),
      Dashboard: dashboardMessages[locale] ?? dashboardMessages.en,
    },
  };
});
