import { NextResponse } from "next/server";
import { getUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { readSoilMultipart } from "@/lib/soil-attachments";
import { observeProtectionImage } from "@/lib/crop-protection-vision";

export async function POST(request: Request) {
  const user = await getUser();
  if (!user)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  if (!checkRateLimit(`fertilizer-observations:${user.id}`, 5).allowed)
    return NextResponse.json({ error: "Try again later." }, { status: 429 });
  try {
    const form = await readSoilMultipart(request);
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      !["image/jpeg", "image/png"].includes(file.type)
    )
      throw new Error("Unsupported image");
    const result = await observeProtectionImage(
      new Uint8Array(await file.arrayBuffer()),
      file.type,
      {
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
        model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
      },
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        error: "Choose a valid JPEG or PNG photograph within the allowed size.",
      },
      { status: 400 },
    );
  }
}
