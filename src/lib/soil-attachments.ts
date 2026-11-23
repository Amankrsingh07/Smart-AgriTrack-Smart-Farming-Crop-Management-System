import { createHash } from "node:crypto";
export const MAX_SOIL_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_SOIL_ATTACHMENTS = 5;
export function validateSoilAttachment(bytes: Uint8Array, filename: string, mediaType: string) {
  if (!bytes.length || bytes.length > MAX_SOIL_ATTACHMENT_BYTES) throw new Error("Choose a nonempty PDF, JPEG or PNG file up to 5 MB.");
  const prefix = Buffer.from(bytes.subarray(0, 12));
  const detected = prefix.subarray(0, 5).toString() === "%PDF-" ? "application/pdf"
    : prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff ? "image/jpeg"
    : prefix.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png" : null;
  const extension = filename.split(".").at(-1)?.toLowerCase();
  const expected = detected === "application/pdf" ? ["pdf"] : detected === "image/png" ? ["png"] : ["jpg", "jpeg"];
  if (!detected || detected !== mediaType || !expected.includes(extension ?? "")) throw new Error("File content, extension and media type must match PDF, JPEG or PNG.");
  return { filename: filename.replace(/[\\/\x00-\x1f\x7f]/g, "_").slice(-200), mediaType: detected, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

/** Bound multipart bodies even when the caller omits Content-Length. */
export async function readSoilMultipart(request: Request) {
  const limit = MAX_SOIL_ATTACHMENT_BYTES + 65536;
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Choose a report file.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("File exceeds 5 MB.");
    }
    chunks.push(part.value);
  }
  return new Response(Buffer.concat(chunks), { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
}
