import { NextResponse } from "next/server";
import { getUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { readSoilMultipart, validateSoilAttachment } from "@/lib/soil-attachments";
import { scanSoilLocally } from "@/lib/soil-local-scan";
import { soilOcrSettings } from "@/lib/soil-ocr-settings";

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!checkRateLimit(`soil-scan:${user.id}`, 4).allowed) {
    return NextResponse.json({ error: "Too many scans. Try again in a minute." }, { status: 429 });
  }
  try {
    const form = await readSoilMultipart(request);
    const file = form.get("report");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a report file." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { mediaType } = validateSoilAttachment(bytes, file.name, file.type);
    const scan = await scanSoilLocally(bytes, mediaType, soilOcrSettings(undefined, form.get("locale")));
    if (!scan) return NextResponse.json({ error: "The report could not be read. Enter the measurements printed on the report." }, { status: 422 });
    return NextResponse.json(scan, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Choose a valid PDF, JPEG or PNG up to 5 MB." }, { status: 400 });
  }
}
