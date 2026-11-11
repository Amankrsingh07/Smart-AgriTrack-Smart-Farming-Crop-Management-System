import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { fertilizerGuidance, getOfflineCropAdvice } from "@/lib/crop-advice-catalog";

const schema = z.object({ state: z.string().trim().min(2).max(80), district: z.string().trim().min(2).max(100), soilType: z.string().trim().min(2).max(80) });
const adviceSchema = z.object({
  seasons: z.array(z.object({ season: z.string(), crops: z.array(z.object({ name: z.string(), score: z.number().min(0).max(100), waterNeedMm: z.string(), fertilizer: z.string(), recommendation: z.string() })) })),
  note: z.string(),
});
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const rate = checkRateLimit(`crop-advice:${user.id}`);
  if (!rate.allowed) return NextResponse.json({ error: "Too many crop advice requests. Please wait a minute and try again." }, { status: 429 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body was not valid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Choose a state, district, and soil type." }, { status: 400 });
  const { state, district, soilType } = parsed.data;
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (apiKey) {
    try {
      const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: "You provide cautious, practical crop suitability examples for Indian smallholder farmers. Return only the requested JSON. Do not claim district-specific verification or invent precise fertilizer doses. Give approximate seasonal crop water needs in mm and clearly qualify uncertain local suitability." }] },
          contents: [{ role: "user", parts: [{ text: `Suggest 3 suitable crops in each of Kharif, Rabi, and Zaid for ${district}, ${state}, with ${soilType} soil. Include a comparative suitability score from 45 to 95, approximate seasonal crop water need in mm as a string, general fertilizer guidance that defers to soil tests and local KVK recommendations, and a concise recommendation. These are preliminary examples, not verified local prescriptions.` }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT", required: ["seasons", "note"], properties: {
                seasons: { type: "ARRAY", items: { type: "OBJECT", required: ["season", "crops"], properties: {
                  season: { type: "STRING" }, crops: { type: "ARRAY", items: { type: "OBJECT", required: ["name", "score", "waterNeedMm", "fertilizer", "recommendation"], properties: {
                    name: { type: "STRING" }, score: { type: "NUMBER" }, waterNeedMm: { type: "STRING" }, fertilizer: { type: "STRING" }, recommendation: { type: "STRING" },
                  } } },
                } } },
                note: { type: "STRING" },
              },
            },
          },
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Gemini request failed (${response.status}).`);
      const payload = await response.json();
      const generated = payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("");
      const advice = adviceSchema.safeParse(JSON.parse(generated));
      if (!advice.success) throw new Error("Gemini returned an invalid crop advice response.");
      return NextResponse.json({
        ...advice.data,
        seasons: advice.data.seasons.map(season => ({
          ...season,
          crops: season.crops.map(crop => ({ ...crop, fertilizer: fertilizerGuidance })),
        })),
        mode: "online",
      });
    } catch (error) {
      console.warn(
        "Gemini crop advice unavailable; returning offline crop data.",
        error instanceof Error ? error.message : "Unknown Gemini error",
      );
    }
  }
  return NextResponse.json({ ...getOfflineCropAdvice(state, district, soilType), mode: "offline" });
}
