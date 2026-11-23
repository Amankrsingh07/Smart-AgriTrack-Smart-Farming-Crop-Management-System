import { farmerTerm } from "../farmer-terms";
import catalog from "./translations.json";
import { displayLabel } from "../display-labels";
import { isLanguageCode } from "../languages";

const supplemental: Record<string, Record<string, string>> = {
  hi: { General: "सामान्य", Bihar: "बिहार", Chhapra: "छपरा", "Farms / Fields": "खेत और जमीन", "Soil Health Card": "मृदा स्वास्थ्य कार्ड" },
  pa: { General: "ਆਮ", Bihar: "ਬਿਹਾਰ", Chhapra: "ਛਪਰਾ", "Farms / Fields": "ਖੇਤ ਅਤੇ ਜ਼ਮੀਨ", "Soil Health Card": "ਮਿੱਟੀ ਸਿਹਤ ਕਾਰਡ" },
  mr: { General: "सामान्य", Bihar: "बिहार", Chhapra: "छपरा", "Farms / Fields": "शेती आणि जमीन", "Soil Health Card": "मृदा आरोग्य पत्रिका" },
  gu: { General: "સામાન્ય", Bihar: "બિહાર", Chhapra: "છપરા", "Farms / Fields": "ખેતરો અને જમીન", "Soil Health Card": "મૃદા આરોગ્ય કાર્ડ" },
  bn: { General: "সাধারণ", Bihar: "বিহার", Chhapra: "ছাপরা", "Farms / Fields": "খামার ও জমি", "Soil Health Card": "মৃত্তিকা স্বাস্থ্য কার্ড" },
  ta: { General: "பொது", Bihar: "பீகார்", Chhapra: "சாப்ரா", "Farms / Fields": "பண்ணைகள் மற்றும் வயல்கள்", "Soil Health Card": "மண் வள அட்டை" },
  te: { General: "సాధారణ", Bihar: "బీహార్", Chhapra: "ఛప్రా", "Farms / Fields": "పొలాలు మరియు భూమి", "Soil Health Card": "భూసార ఆరోగ్య కార్డు" },
  kn: { General: "ಸಾಮಾನ್ಯ", Bihar: "ಬಿಹಾರ", Chhapra: "ಛಪ್ರಾ", "Farms / Fields": "ಹೊಲಗಳು ಮತ್ತು ಜಮೀನು", "Soil Health Card": "ಮಣ್ಣಿನ ಆರೋಗ್ಯ ಕಾರ್ಡ್" },
  ml: { General: "പൊതുവായത്", Bihar: "ബിഹാർ", Chhapra: "ഛപ്ര", "Farms / Fields": "കൃഷിയിടങ്ങളും വയലുകളും", "Soil Health Card": "മണ്ണ് ആരോഗ്യ കാർഡ്" },
  or: { General: "ସାଧାରଣ", Bihar: "ବିହାର", Chhapra: "ଛପରା", "Farms / Fields": "ଖେତ ଓ ଜମି", "Soil Health Card": "ମୃତ୍ତିକା ସ୍ୱାସ୍ଥ୍ୟ କାର୍ଡ" },
};
const hindiEdits: Record<string, string> = {
  "Advice for your field crops": "आपके खेत की फसलों के लिए सलाह",
  "Maize requires fertile soil that drains freely.": "मक्का के लिए उपजाऊ और अच्छी जल निकासी वाली मिट्टी चाहिए।",
  "Expected harvest: {date}": "अनुमानित कटाई: {date}",
  "Soil tests to request": "मिट्टी की जरूरी जाँच",
  "Season recommendation": "मौसम के अनुसार सलाह",
  "Season water quantity": "पूरे मौसम की पानी की मात्रा",
  "Field pH is not recorded. Add a laboratory result in Farms / Fields.": "खेत की मिट्टी का pH दर्ज नहीं है। खेत और जमीन में प्रयोगशाला की जाँच का परिणाम जोड़ें।",
  "No water quantity in mm is configured for this crop and season.": "इस फसल और मौसम के लिए पानी की मात्रा मिलीमीटर में उपलब्ध नहीं है।",
  "Use measured soil nutrients and a crop-specific Soil Health Card to choose N, P and K inputs. Soil type and acreage alone cannot determine a fertilizer dose. Review organic carbon before planning compost or manure inputs.": "N, P और K की मात्रा तय करने के लिए मिट्टी की जाँच और फसल के मृदा स्वास्थ्य कार्ड का उपयोग करें। केवल मिट्टी का प्रकार और क्षेत्रफल देखकर उर्वरक की मात्रा तय नहीं की जा सकती। कम्पोस्ट या गोबर की खाद देने की योजना से पहले जैविक कार्बन का स्तर जाँचें।",
};
const translations = catalog as Record<string, Record<string, string>>;
export function cropAdviceText(text: string, locale: string, values: Record<string, string | number> = {}) {
  let translated = (locale === "hi" ? hindiEdits[text] : undefined) ?? supplemental[locale]?.[text] ?? translations[locale]?.[text] ?? text;
  for (const phrase of ["Farms / Fields", "Soil Health Card"]) {
    if (supplemental[locale]?.[phrase]) translated = translated.replaceAll(phrase, supplemental[locale][phrase]);
  }
  return translated.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
}
export function cropAdviceLabel(value: string, locale: string) {
  const farmerLabel = farmerTerm(locale, value);
  if (farmerLabel) return farmerLabel;
  const title = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  const normalized = value === value.toUpperCase() ? title : value;
  const known = supplemental[locale]?.[value] ?? supplemental[locale]?.[normalized] ?? translations[locale]?.[value] ?? translations[locale]?.[normalized];
  if (known) return known;
  return displayLabel(normalized, isLanguageCode(locale) ? locale : "en");
}
