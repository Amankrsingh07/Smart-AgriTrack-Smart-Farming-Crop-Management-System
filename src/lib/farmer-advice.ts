import { z } from "zod";
import { farmerAdviceLabels } from "@/i18n/farmer-advice-labels";
import { isLanguageCode, languageName } from "@/i18n/languages";

const brief = z
  .string()
  .trim()
  .min(1)
  .max(220)
  .refine((value) => !/[\r\n]/.test(value));
export const farmerAdviceSchema = z
  .object({
    situation: brief,
    possibleCauses: brief,
    nextSteps: z.array(brief).min(2).max(5),
    expertHelp: brief,
    details: z.string().trim().max(700).optional(),
    followUpQuestions: z.array(brief).max(2).optional(),
  })
  .strict();

export const farmerAdviceResponseSchema = {
  type: "OBJECT",
  properties: {
    situation: { type: "STRING" },
    possibleCauses: { type: "STRING" },
    nextSteps: {
      type: "ARRAY",
      items: { type: "STRING" },
      minItems: 2,
      maxItems: 5,
    },
    expertHelp: { type: "STRING" },
    details: { type: "STRING" },
    followUpQuestions: {
      type: "ARRAY",
      items: { type: "STRING" },
      maxItems: 2,
    },
  },
  required: ["situation", "possibleCauses", "nextSteps", "expertHelp"],
};

export function farmerAdviceLanguage(locale: string) {
  return `Reply in plain ${languageName(isLanguageCode(locale) ? locale : "en")} using its usual script. Write short sentences and use words farmers use. Explain essential technical words briefly. Preserve all measurements, units, names, dates and warnings supplied in the evidence. Say what is confirmed, what is only a possibility and what is unknown. Never turn a forecast, a photograph or incomplete information into a confirmed diagnosis.`;
}

export function parseFarmerAdvice(text: string, locale: string) {
  const data = farmerAdviceSchema.parse(JSON.parse(text));
  const [problem, reason, actions] = farmerAdviceLabels(locale);
  const sections = [
    { title: problem, text: data.situation },
    { title: reason, text: data.possibleCauses },
    {
      title: actions,
      text: [
        ...data.nextSteps.map((step) => `• ${step}`),
        data.expertHelp,
      ].join("\n"),
    },
  ];
  return { ...data, sections };
}
