import { normalizeProtectionCrop } from "./agricultural-knowledge";
import { fieldAdviceText } from "../i18n/crop-advice/field";
import type { OpenMeteoForecast } from "./open-meteo";
import type { AssistantHistoryItem } from "./assistant-chat";

const topics = {
  storage:
    /\b(stor(age|e|ing)|inventory|warehouse|stock)\b|भंडार|भण्डार|गोदाम|स्टॉक|ਭੰਡਾਰ|साठवण|સંગ્રહ|মজুত|சேமிப்பு|నిల్వ|ದಾಸ್ತಾನು|സംഭരണം|ଭଣ୍ଡାର/,
  market:
    /\b(expenses?|costs?|prices?|market|mandi|profit)\b|खर्च|लागत|मंडी|भाव|कीमत|ਮੰਡੀ|ખર્ચ|দাম|விலை|ధర|ಬೆಲೆ|വില|ଦାମ/,
  protection:
    /\b(pests?|disease|fungus|worms?|spots?|insects?)\b|कीट|कीड़े|इल्ली|रोग|बीमारी|धब्ब|ਕੀੜ|कीड|જીવાત|পোকা|பூச்சி|పురుగు|ಕೀಟ|കീടം|ପୋକ/,
  nutrition:
    /\b(fertili[sz]\w*|urea|npk|soil health|soil test)\b|खाद|उर्वरक|यूरिया|मिट्टी की ज[ााँ]च|मृदा|ਖਾਦ|खत|ખાતર|সার|உரம்|ఎరువు|ಗೊಬ್ಬರ|വളം|ସାର/,
  harvest:
    /\b(harvest\w*|reap\w*)\b|कटाई|तुड़ाई|ਵਾਢੀ|कापणी|કાપણી|ফসল কাটা|அறுவடை|కోత|ಕೊಯ್ಲು|വിളവെടുപ്പ്|ଅମଳ/,
  irrigation:
    /\b(irrigat\w*|water\w*|moisture|drip)\b|\b(paani|pani|sinchai)\b|सिंचाई|सिंच|पानी|नमी|टपक|ਸਿੰਚਾਈ|पाणी|સિંચાઈ|সেচ|பாசனம்|నీరు|ನೀರಾವರಿ|ജലസേചനം|ଜଳସେଚନ/,
  weather:
    /\b(rain\w*|weather|forecast|temperature)\b|\b(barish|baarish|mausam)\b|बारिश|वर्षा|मौसम|बरसात|तापमान|ਮੀਂਹ|पाऊस|વરસાદ|বৃষ্টি|மழை|వర్షం|ಮಳೆ|മഴ|ବର୍ଷା/,
  stage:
    /\b(stage|flower\w*|tassel\w*|silk\w*|sow\w*|seedling|maturity)\b|अवस्था|फूल|बुवाई|अंकुर|पकने/,
};
type Topic = keyof typeof topics;
const detect = (question: string) =>
  (Object.keys(topics) as Topic[]).filter((topic) =>
    topics[topic].test(question.toLowerCase()),
  );
const aliases = [
  ["maize", /\b(maize|corn|makka|makai)\b|मक्का|मकई/i],
  ["wheat", /\bwheat\b|गेह[ूूँ]+/i],
  ["rice", /\b(rice|paddy)\b|धान|चावल/i],
  ["chickpea", /\b(chickpea|gram)\b|चना/i],
  ["tomato", /\btomato\b|टमाटर/i],
] as const;
const namedCrop = (text: string) =>
  aliases.find(([, pattern]) => pattern.test(text))?.[0];
const stageIn = (text: string) => {
  if (/\b(post.flower\w*|grain fill\w*)\b|फूल.*बाद|दाना भर/i.test(text))
    return "grain filling";
  if (/\b(pre.flower\w*)\b|फूल.*पहले/i.test(text)) return "pre-flowering";
  if (/\b(flower\w*|tassel\w*|silk\w*)\b|फूल|रेशम/i.test(text))
    return "flowering";
  if (
    /\b(seedling|establishment|vegetative|maturity|mature)\b|अंकुर|पकने/i.test(
      text,
    )
  )
    return "other";
};

const statedStage = (text: string) =>
  /\b(now|currently|is at|is flowering|has reached)\b|अभी|अवस्था में|फूल आ गए/i.test(
    text,
  )
    ? stageIn(text)
    : undefined;

export function resolveAssistantQuestion(
  question: string,
  history: AssistantHistoryItem[] = [],
  selectedCrop?: string | null,
  savedStage?: string | null,
) {
  const previous = history
    .filter((turn) => turn.role === "USER")
    .map((turn) => turn.content)
    .reverse();
  const asksAboutExpert = /\b(kvk|expert)\b|कृषि विज्ञान/i.test(question);
  const directHelp =
    asksAboutExpert ||
    (previous.length > 0 &&
      /\b(tell me|you tell)\b|\b(batao|bataiye|bata do)\b|तुम.*बता|आप.*बताइ/i.test(
        question,
      ));
  const referencesPrior =
    directHelp ||
    /\b(it|that|this|then|next|instead|why|what about)\b|\b(agar|aur agar|phir|kyun)\b|उसमें|उसका|इसमें|इसके|फिर|तो|क्यों|और अगर/i.test(
      question,
    );
  const explicitCrop = namedCrop(question);
  const savedCrop =
    selectedCrop &&
    (namedCrop(selectedCrop) ?? normalizeProtectionCrop(selectedCrop));
  const priorCrop = previous.map(namedCrop).find(Boolean);
  const crop = explicitCrop ?? (savedCrop || priorCrop);
  const cropBoundary = previous.findIndex((turn) => {
    const name = namedCrop(turn);
    return name && crop && name !== crop;
  });
  const related = cropBoundary < 0 ? previous : previous.slice(0, cropBoundary);
  const current = detect(question);
  const prior = related.map(detect).find((result) => result.length) ?? [];
  const newStage = statedStage(question);
  const hadIrrigation = related.some((turn) =>
    detect(turn).includes("irrigation"),
  );
  const inherited =
    current.length === 0 && referencesPrior
      ? directHelp && prior.includes("weather") && hadIrrigation
        ? ["irrigation" as const]
        : prior
      : (newStage || (current.includes("weather") && referencesPrior)) &&
          related.some((turn) => detect(turn).includes("irrigation"))
        ? ["irrigation" as const]
        : [];
  const intents = [...new Set([...current, ...inherited])];
  return {
    intents,
    crop,
    directHelp,
    waterSaving:
      /\b(save|saving|reduce|less|conserv\w*)\b|\b(bach\w*|kam)\b|घटा|बच[ाे]|कम/i.test(
        question,
      ),
    wantsExpenses: /\b(expenses?|costs?|profit)\b|खर्च|लागत|ಖರ್ಚು/i.test(
      question,
    ),
    wantsPrice: /\b(prices?|market|mandi|rate)\b|मंडी|भाव|कीमत/i.test(question),
    stage:
      newStage ??
      related.map(statedStage).find(Boolean) ??
      savedStage?.toLowerCase(),
    fieldMatches: !explicitCrop || !savedCrop || explicitCrop === savedCrop,
  };
}

export type AssistantSource = { label: string; url: string };
export const forecastSource = {
  label: "Open-Meteo · Live forecast",
  url: "https://open-meteo.com/",
};
export const maizeIrrigation = {
  crop: "maize",
  intent: "irrigation",
  source: {
    label: "TNAU · Maize irrigation guidance",
    url: "https://agritech.tnau.ac.in/agriculture/agri_irrigationmgt_maize.html",
  },
  guidance: {
    waterSaving: [
      "Check moisture below the surface before watering. If you use drip, check that water reaches the rows evenly. After rain, check how far it has soaked in before deciding whether to irrigate.",
      "सिंचाई से पहले सतह के नीचे जड़ों वाली मिट्टी की नमी देखें। ड्रिप लगी है तो देखें कि सभी कतारों तक बराबर पानी पहुँच रहा है। बारिश के बाद देखें कि पानी मिट्टी में कितना नीचे गया, फिर सिंचाई का फैसला करें।",
    ],
    flowering: [
      "At flowering, when tassels and silks appear, keep the soil around the roots moist. Dry soil at this stage can reduce grain set. Avoid standing water.",
      "फूल आने पर, जब ऊपर फूल और भुट्टे पर रेशे दिखें, जड़ों की मिट्टी में नमी बनाए रखें। इस समय सूखे से भुट्टे में कम दाने बन सकते हैं। खेत में पानी भी न खड़ा होने दें।",
    ],
    other: [
      "Use the crop stage and root-zone moisture to decide when to irrigate. Young maize also needs enough moisture to establish.",
      "सिंचाई का समय फसल की अवस्था और जड़ों की नमी देखकर तय करें। छोटे पौधों को जड़ जमाने के लिए भी पर्याप्त नमी चाहिए।",
    ],
  },
} as const;

const criticalStages = {
  wheat: [
    "For wheat, give priority to moisture when the first roots spread from the base of the stem. Check soil moisture again at tillering and flowering.",
    "गेहूँ में तने के नीचे नई जड़ें निकलने के समय नमी का खास ध्यान रखें। कल्ले और फूल आने पर फिर नमी देखें।",
  ],
  rice: [
    "In rice, early tillering and flowering are sensitive to water shortage. Base the watering method on how the field was planted and managed.",
    "धान में शुरुआती कल्ले निकलने और फूल आने पर पानी की कमी से बचें। सिंचाई का तरीका खेत में धान लगाने और पानी के इंतजाम पर निर्भर है।",
  ],
} as const;
const criticalStagesSource = {
  label: "TNAU · Critical stages for irrigation",
  url: "https://agritech.tnau.ac.in/agriculture/agri_irrigationmgt_criticalstage.html",
};

export type AssistantForecast = {
  date: string;
  rainMm: number | null;
  rainChancePercent: number | null;
  minC?: number;
  maxC?: number;
};
export function assistantForecastDays(
  weather: OpenMeteoForecast | null,
  today: string,
  question: string,
): AssistantForecast[] {
  if (!weather || weather.demo) return [];
  const dateAfter = (days: number) =>
    new Date(Date.parse(today) + days * 86_400_000).toISOString().slice(0, 10);
  const dates = /\b(next two days|next 2 days)\b|अगले दो दिन|अगले 2 दिन/i.test(
    question,
  )
    ? [dateAfter(1), dateAfter(2)]
    : /\btomorrow\b|कल/i.test(question)
      ? [dateAfter(1)]
      : [today, dateAfter(1)];
  const days = weather.daily;
  return dates.flatMap((date) => {
    const i = days.time.indexOf(date);
    if (i < 0) return [];
    const rainMm = days.precipitation_sum[i] ?? null;
    const rainChancePercent = days.precipitation_probability_max[i] ?? null;
    const minC = days.temperature_2m_min[i] ?? undefined;
    const maxC = days.temperature_2m_max[i] ?? undefined;
    if (
      rainMm === null &&
      rainChancePercent === null &&
      (minC === undefined || maxC === undefined)
    )
      return [];
    return [{ date, rainMm, rainChancePercent, minC, maxC }];
  });
}

export type AssistantFieldEvidence = {
  hasField?: boolean;
  forecast?: AssistantForecast[];
  moisture?: { date: string; percent: number };
  expectedHarvestDate?: string | null;
  actualHarvestDate?: string | null;
  expenseTotal?: string;
  marketQuote?: { date: string; price: string; unit: string; mandi: string };
  calendarHarvestDate?: string | null;
  stageEstimated?: boolean;
  soilReportDate?: string | null;
  fertilizer?: { product: string; date: string };
  latestHarvest?: { date: string; quantity: string; unit: string };
};

export function isHinglish(question: string) {
  return /\b(makka|makai|paani|pani|sinchai|baarish|barish|kaise|kya|kyun|bataiye|batao|kitna|kab)\b/i.test(
    question,
  );
}

export function assistantReplyLocale(question: string, locale: string) {
  return (/[\u0900-\u097f]/u.test(question) || isHinglish(question)) &&
    (locale === "en" || locale === "hi")
    ? "hi"
    : locale;
}

export function offlineAssistantAnswer(
  resolved: ReturnType<typeof resolveAssistantQuestion>,
  field: AssistantFieldEvidence,
  locale: string,
) {
  const hi = locale === "hi";
  const say = (en: string, hindi: string) => (hi ? hindi : en);
  const lines: string[] = [];
  const sources: AssistantSource[] = [];
  const has = (topic: Topic) => resolved.intents.includes(topic);
  const maize = resolved.crop === "maize";
  const criticalStage =
    resolved.crop === "wheat" || resolved.crop === "rice"
      ? criticalStages[resolved.crop]
      : undefined;
  if (!hi && locale !== "en") {
    const local = (key: Parameters<typeof fieldAdviceText>[1]) =>
      fieldAdviceText(locale, key);
    if (has("irrigation")) lines.push(local("checkMoisture"));
    if (has("harvest")) lines.push(local("harvestGeneric"));
    if (has("storage")) lines.push(local("checkStorage"));
    if (has("nutrition")) lines.push(local("openFertilizer"));
    if (
      lines.length &&
      resolved.intents.every((topic) =>
        ["irrigation", "harvest", "storage", "nutrition"].includes(topic),
      ) &&
      !field.forecast?.length &&
      !field.moisture &&
      !field.latestHarvest &&
      !field.soilReportDate &&
      !field.fertilizer &&
      !field.expectedHarvestDate
    ) {
      return { answer: lines.join("\n\n"), sources };
    }
    lines.length = 0;
  }
  if (resolved.directHelp)
    lines.push(
      has("irrigation")
        ? say(
            "You can make this irrigation decision in the field. KVK is useful if a continuing problem needs an inspection or a soil or water test.",
            "सिंचाई का यह फैसला आप खेत में ही कर सकते हैं। समस्या बनी रहे और खेत की जाँच या मिट्टी-पानी की जाँच चाहिए, तब KVK की मदद लें।",
          )
        : say(
            "KVK can help when a field inspection or test is needed. Describe what you want to decide and I can help with routine steps.",
            "खेत की जाँच या मिट्टी-पानी की जाँच की जरूरत हो तो KVK मदद कर सकता है। बताइए आप क्या तय करना चाहते हैं, मैं सामान्य कदम बता सकता हूँ।",
          ),
    );
  if (has("weather")) {
    const forecast = field.forecast ?? [];
    if (forecast.length) {
      const readings = forecast.map((day) =>
        [
          day.date,
          day.rainMm === null ? null : `${day.rainMm} ${say("mm", "मिमी")}`,
          day.rainChancePercent === null
            ? null
            : say(
                `${day.rainChancePercent}% chance of rain`,
                `बारिश की ${day.rainChancePercent}% संभावना`,
              ),
          day.minC != null && day.maxC != null
            ? `${day.minC}–${day.maxC} °C`
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
      );
      lines.push(
        say("Field rainfall forecast", "खेत के लिए बारिश का अनुमान"),
        ...readings,
      );
      sources.push(forecastSource);
    } else {
      lines.push(
        say(
          "I don’t have a live rainfall forecast for this field.",
          "इस खेत के लिए अभी बारिश का ताज़ा अनुमान उपलब्ध नहीं है।",
        ),
      );
      if (!field.hasField)
        lines.push(
          say(
            "Which saved field should I use for the forecast?",
            "बारिश का अनुमान देखने के लिए कौन-सा दर्ज खेत चुनें?",
          ),
        );
    }
  }
  if (has("irrigation")) {
    if (field.moisture && (has("weather") || resolved.directHelp))
      lines.push(
        say(
          `The latest saved moisture reading is ${field.moisture.percent}% (${field.moisture.date}). Check the soil again before watering.`,
          `दर्ज नमी ${field.moisture.percent}% है (${field.moisture.date})। सिंचाई से पहले मिट्टी फिर देखें।`,
        ),
      );
    if (has("weather") && !field.moisture)
      lines.push(
        say(
          "I don’t have a saved moisture reading. Is the soil around the roots moist or dry?",
          "मिट्टी की नमी की दर्ज जाँच उपलब्ध नहीं है। जड़ों के पास मिट्टी नम है या सूखी?",
        ),
      );
    if (has("weather"))
      lines.push(
        say(
          "If the soil around the roots is still moist, wait and check again after the rain. If it is already dry and rain is uncertain, irrigate as needed. A forecast alone cannot tell you how much water will reach the roots.",
          "जड़ों के पास मिट्टी नम है तो रुकें और बारिश के बाद फिर देखें। मिट्टी सूखी है और बारिश पक्की नहीं है तो जरूरत के हिसाब से सिंचाई करें। अनुमान से पता नहीं चलता कि जड़ों तक कितना पानी पहुँचेगा।",
        ),
      );
    if (maize) {
      const guidance =
        resolved.stage === "flowering"
          ? maizeIrrigation.guidance.flowering
          : has("stage") && resolved.stage
            ? maizeIrrigation.guidance.other
            : maizeIrrigation.guidance.waterSaving;
      if (!has("weather") || resolved.stage === "flowering") {
        if (resolved.waterSaving && resolved.stage === "flowering")
          lines.push(maizeIrrigation.guidance.waterSaving[hi ? 1 : 0]);
        if (field.stageEstimated && resolved.stage === "flowering")
          lines.push(
            say(
              "The calendar estimates flowering. Check for tassels and silks in the field.",
              "कैलेंडर के हिसाब से फूल आने का समय है। खेत में फूल और भुट्टे के रेशे देखकर पुष्टि करें।",
            ),
          );
        lines.push(
          resolved.directHelp && !resolved.stage
            ? say(
                "Dig a little below the surface in several spots along the maize rows. If the soil around the roots is still moist, wait and check again. Where it is dry, water as needed without leaving puddles.",
                "मक्का की कतारों में कुछ जगह सतह के नीचे मिट्टी देखें। जड़ों के पास नमी है तो रुककर फिर जाँचें। जहाँ मिट्टी सूखी है वहाँ जरूरत के अनुसार पानी दें और पानी खड़ा न होने दें।",
              )
            : guidance[hi ? 1 : 0],
        );
        sources.push(maizeIrrigation.source);
      }
    } else if (criticalStage && !has("weather")) {
      lines.push(criticalStage[hi ? 1 : 0]);
      sources.push(criticalStagesSource);
    } else if (!has("weather")) {
      lines.push(
        say(
          "Check soil moisture around the roots before watering. If it is still moist, check again later. The crop and its growth stage affect how long it can wait.",
          "पानी देने से पहले जड़ों के पास मिट्टी की नमी देखें। मिट्टी नम है तो बाद में फिर देखें। कितनी देर रुक सकते हैं, यह फसल और उसकी अवस्था पर निर्भर है।",
        ),
      );
      if (!resolved.crop && !field.hasField)
        lines.push(
          say(
            "Which crop are you watering?",
            "आप किस फसल में पानी दे रहे हैं?",
          ),
        );
    }
  }
  if (has("stage") && !has("irrigation")) {
    if (maize && resolved.stage === "flowering") {
      lines.push(maizeIrrigation.guidance.flowering[hi ? 1 : 0]);
      sources.push(maizeIrrigation.source);
    } else if (resolved.stage)
      lines.push(
        say(
          `Crop stage in context: ${resolved.stage}. What would you like to plan at this stage?`,
          "फसल की अवस्था की जानकारी मिल गई है। इस अवस्था में आप क्या तय करना चाहते हैं?",
        ),
      );
    else
      lines.push(
        resolved.crop || field.hasField
          ? say(
              "What do you see on the plants now, such as new leaves, flowers or grain?",
              "पौधों पर अभी क्या दिख रहा है, जैसे नई पत्तियाँ, फूल या दाने?",
            )
          : say(
              "Which crop should I check, and what do you see on the plants now?",
              "कौन-सी फसल है और पौधों पर अभी क्या दिख रहा है?",
            ),
      );
  }
  if (
    has("irrigation") &&
    !has("weather") &&
    !resolved.stage &&
    maize &&
    !resolved.directHelp
  ) {
    lines.push(
      say("What stage is the maize at now?", "मक्का अभी किस अवस्था में है?"),
    );
  }
  if (has("protection"))
    lines.push(
      say(
        "Check both sides of affected leaves and compare affected and healthy plants. Which part is affected, and what symptoms do you see? A spreading or unclear problem may need a field inspection before treatment.",
        "पत्तियों के दोनों तरफ देखें और स्वस्थ पौधों से तुलना करें। किस हिस्से पर क्या लक्षण दिख रहे हैं? समस्या फैल रही है या कारण साफ नहीं है तो दवा से पहले खेत की जाँच कराएँ।",
      ),
    );
  if (has("nutrition")) {
    if (field.soilReportDate)
      lines.push(
        say(
          `A soil test is saved for ${field.soilReportDate}.`,
          `मिट्टी की जाँच ${field.soilReportDate} की दर्ज है।`,
        ),
      );
    if (field.fertilizer)
      lines.push(
        say(
          `Upcoming fertilizer entry: ${field.fertilizer.product}, ${field.fertilizer.date}.`,
          `खाद की अगली दर्ज योजना: ${field.fertilizer.product}, ${field.fertilizer.date}।`,
        ),
      );
    lines.push(
      say(
        "Use the field’s Soil Health report and check the saved Fertilizer Recommendation before applying more. What nutrient or application are you deciding about?",
        "और खाद डालने से पहले खेत की मिट्टी की रिपोर्ट और दर्ज खाद की सिफारिश देखें। आप किस खाद या पोषक तत्व के बारे में तय करना चाहते हैं?",
      ),
    );
  }
  if (has("harvest")) {
    const date =
      field.latestHarvest?.date ??
      field.actualHarvestDate ??
      field.expectedHarvestDate ??
      field.calendarHarvestDate;
    if (field.latestHarvest) {
      const { quantity, unit } = field.latestHarvest;
      lines.push(
        say(
          `Latest harvest record: ${quantity} ${unit} on ${date}.`,
          `कटाई का सबसे हाल का रिकॉर्ड: ${date} को ${quantity} ${unit}।`,
        ),
      );
    } else
      lines.push(
        date
          ? field.actualHarvestDate
            ? say(
                `Recorded harvest date: ${date}.`,
                `दर्ज कटाई की तारीख: ${date}।`,
              )
            : say(
                `Saved expected harvest date: ${date}. Check crop maturity before cutting.`,
                `कटाई की दर्ज अनुमानित तारीख: ${date}। काटने से पहले फसल का पकना देखें।`,
              )
          : say(
              "I don’t have a harvest date for this crop. Are you asking when to cut or how to record the harvest?",
              "इस फसल की कटाई की तारीख उपलब्ध नहीं है। आप कटाई का समय पूछ रहे हैं या कटाई दर्ज करना चाहते हैं?",
            ),
      );
  }
  if (has("storage")) {
    lines.push(
      say(
        "Check the recorded stock and look for damp or damaged lots.",
        "दर्ज स्टॉक देखें और जाँचें कि कोई खेप नम या खराब तो नहीं है।",
      ),
    );
    if (!resolved.crop && !field.hasField)
      lines.push(
        say(
          "Which stored crop or inventory item are you checking?",
          "आप कौन-सी फसल या सामान का स्टॉक देख रहे हैं?",
        ),
      );
  }
  if (has("market")) {
    if (resolved.wantsExpenses)
      lines.push(
        field.expenseTotal !== undefined
          ? say(
              `Saved crop expenses total ₹${field.expenseTotal}.`,
              `फसल का दर्ज कुल खर्च ₹${field.expenseTotal} है।`,
            )
          : say(
              "No expenses are available for this crop here. Check your Expenses records.",
              "यहाँ इस फसल का दर्ज खर्च उपलब्ध नहीं है। खर्च पेज पर अपने रिकॉर्ड देखें।",
            ),
      );
    if (resolved.wantsPrice || !resolved.wantsExpenses) {
      const quote = field.marketQuote;
      lines.push(
        quote
          ? say(
              `Saved price: ₹${quote.price} per ${quote.unit} at ${quote.mandi} on ${quote.date}. Check the Market page for a current quote.`,
              `दर्ज भाव: ${quote.mandi} में ${quote.date} को ₹${quote.price} प्रति ${quote.unit}। आज का भाव मंडी पेज पर देखें।`,
            )
          : say(
              "I don’t have a price quote here. Check the Market page for the commodity, mandi and quote date.",
              "यहाँ मंडी भाव उपलब्ध नहीं है। भाव के लिए मंडी पेज पर फसल, मंडी और तारीख देखें।",
            ),
      );
    }
  }
  if (!lines.length)
    lines.push(
      say(
        "I couldn’t match this question to the offline guidance. What decision are you trying to make for the crop or field?",
        "इस सवाल के लिए ऑफ़लाइन जानकारी नहीं मिली। आप फसल या खेत के बारे में क्या तय करना चाहते हैं?",
      ),
    );
  return { answer: lines.join("\n\n"), sources };
}

/** Topic detection finds candidates. These checks decide whether the available evidence answers the actual request. */
export function hasReliableOfflineAnswer(
  question: string,
  resolved: ReturnType<typeof resolveAssistantQuestion>,
  field: AssistantFieldEvidence,
) {
  const { intents, crop, directHelp, waterSaving, stage } = resolved;
  if (!intents.length) return false;
  if (
    /\b(compare|calculate|lit[er]+s?|gallons?|litre|exact|cost.benefit|difference|how much|how many|dosage|design|install|capacity|pressure|pollution|salinity|waterlog\w*|clog\w*|pump|yield loss)\b|कितना|कितनी|मात्रा|लीटर|खुराक|तुलना|गणना|\b(kitna|kitni|matra)\b/i.test(
      question,
    )
  )
    return false;
  const irrigating = intents.includes("irrigation");
  const routineRain =
    irrigating &&
    intents.includes("weather") &&
    /\b(if|after|before|expected|should|agar)\b|अगर|हो जाए|सिंच|पानी/i.test(
      question,
    );
  const routineIrrigation =
    (["maize", "wheat", "rice"].includes(crop ?? "") &&
      (directHelp ||
        waterSaving ||
        /\b(when|should|schedule|timing|kab)\b|कब|करूँ|करें/i.test(
          question,
        ))) ||
    routineRain;
  return intents.every((topic) => {
    switch (topic) {
      case "irrigation":
        return routineIrrigation || (crop === "maize" && stage === "flowering");
      case "weather":
        return (
          routineRain ||
          (Boolean(field.forecast?.length) &&
            /\b(forecast|rain|weather|temperature|barish|baarish)\b|बारिश|मौसम|तापमान/i.test(
              question,
            ))
        );
      case "stage":
        return (
          crop === "maize" &&
          stage === "flowering" &&
          !/\b(identify|when)\b|पहचान|कब/i.test(question)
        );
      case "harvest":
        return (
          Boolean(
            field.latestHarvest ||
            field.actualHarvestDate ||
            field.expectedHarvestDate ||
            field.calendarHarvestDate,
          ) && /\b(date|when|recorded)\b|तारीख|कब/i.test(question)
        );
      case "market":
        return (
          resolved.wantsExpenses &&
          !resolved.wantsPrice &&
          field.expenseTotal !== undefined &&
          /\b(total|recorded|saved)\b|कुल|दर्ज/i.test(question)
        );
      case "storage":
        return (
          /\b(check|inspect)\b|जाँच|जांच/i.test(question) &&
          !/\b(temperature|humidity|duration|moisture|mould|mold|treat)\b|तापमान|नमी|दवा/i.test(
            question,
          )
        );
      default:
        return false;
    }
  });
}

export async function chooseAssistantAnswer<T>(
  reliableOffline: boolean,
  retryOnline: boolean,
  requestOnline: () => Promise<T>,
) {
  return reliableOffline && !retryOnline ? null : requestOnline();
}

export function safeOfflineAfterFailure(
  question: string,
  resolved: ReturnType<typeof resolveAssistantQuestion>,
  field: AssistantFieldEvidence,
  locale: string,
  history: AssistantHistoryItem[],
) {
  const supported = resolved.intents.filter((topic) => {
    const intents =
      topic === "weather" || topic === "irrigation"
        ? resolved.intents.filter(
            (intent) => intent === "weather" || intent === "irrigation",
          )
        : [topic];
    return hasReliableOfflineAnswer(question, { ...resolved, intents }, field);
  });
  const partial = supported.length
    ? offlineAssistantAnswer({ ...resolved, intents: supported }, field, locale)
    : null;
  const clarify =
    locale === "hi"
      ? "इस सवाल के लिए भरोसेमंद ऑफ़लाइन जानकारी उपलब्ध नहीं है।"
      : "Reliable offline guidance is unavailable for this question.";
  if (
    partial &&
    !history.some(
      (turn) => turn.role === "ASSISTANT" && turn.content === partial.answer,
    )
  ) {
    return {
      ...partial,
      answer: `${partial.answer}\n\n${locale === "hi" ? "बाकी सवाल के लिए पक्की जानकारी उपलब्ध नहीं है।" : "I have limited evidence for the rest of the question."}`,
    };
  }
  if (resolved.intents.includes("protection")) {
    return {
      answer:
        locale === "hi"
          ? "लक्षणों की वजह साफ नहीं है। दवा देने से पहले प्रभावित और स्वस्थ पौधों की तुलना करें। नुकसान फैल रहा है तो खेत की जाँच कराएँ।"
          : "The cause is unclear. Compare affected and healthy plants before treating. Arrange a field inspection if the damage is spreading.",
      sources: [],
    };
  }
  return { answer: clarify, sources: [] };
}
