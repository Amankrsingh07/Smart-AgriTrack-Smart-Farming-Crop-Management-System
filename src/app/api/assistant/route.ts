import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({ question: z.string().trim().min(5).max(1200) });

export async function POST(request: Request) {
  const user = await getUser();
  if (!user)
    return NextResponse.json(
      { error: "Please sign in again." },
      { status: 401 },
    );
  const rate = checkRateLimit(`assistant:${user.id}`);
  if (!rate.allowed)
    return NextResponse.json(
      {
        error:
          "Too many assistant requests. Please wait a minute and try again.",
      },
      { status: 429 },
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body was not valid JSON." },
      { status: 400 },
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Enter a question between 5 and 1,200 characters." },
      { status: 400 },
    );
  let farmContext = "No saved farms were found.";
  try {
    const farms = await db.farm.findMany({
      where: { userId: user.id },
      select: {
        name: true,
        district: true,
        state: true,
        fields: {
          select: { name: true, soilType: true, waterAvailability: true },
        },
      },
      take: 10,
    });
    if (farms.length)
      farmContext = farms
        .map(
          (f) =>
            `${f.name} (${f.district}, ${f.state}): ${f.fields.map((field) => `${field.name}, ${field.soilType} soil, ${field.waterAvailability.toLowerCase()} water`).join("; ") || "no fields recorded"}`,
        )
        .join("\n");
  } catch {
    farmContext = "Saved farm context is temporarily unavailable.";
  }
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey)
    return NextResponse.json(
      {
        error:
          "Gemini is not configured. Add GEMINI_API_KEY to the server environment and restart the app.",
      },
      { status: 503 },
    );

  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: "You are an agricultural assistant for farmers in India. Give clear, practical, cautious guidance. Do not invent local facts, diagnoses, fertilizer doses, or irrigation prescriptions. Ask for missing details when needed. Recommend confirmation with a local KVK or agriculture officer for consequential crop decisions.",
              },
            ],
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Farmer question:\n${parsed.data.question}\n\nSaved farm context:\n${farmContext}`,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.4, maxOutputTokens: 1200 },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Gemini could not be reached. Check the internet connection and try again.",
      },
      { status: 502 },
    );
  }
  if (!response.ok) {
    return NextResponse.json(
      {
        error: `Gemini request failed (HTTP ${response.status}). Check the API key, model, quota, and network.`,
      },
      { status: 502 },
    );
  }
  let payload: {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  try {
    payload = await response.json();
  } catch {
    return NextResponse.json(
      { error: "Gemini returned an unreadable response. Please try again." },
      { status: 502 },
    );
  }
  const answer = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!answer)
    return NextResponse.json(
      { error: "Gemini did not return an answer. Please try again." },
      { status: 502 },
    );
  return NextResponse.json(
    { answer, label: "Gemini API · Online" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
