import { db } from "@/lib/db";
import { getUser } from "@/lib/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  const { id } = await params;
  const file = await db.storageInspectionAttachment.findFirst({
    where: {
      id,
      inspection: {
        production: { cropCycle: { field: { farm: { userId: user.id } } } },
      },
    },
    select: { filename: true, mediaType: true, content: true },
  });
  if (!file) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(file.content), {
    headers: {
      "Content-Type": file.mediaType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
