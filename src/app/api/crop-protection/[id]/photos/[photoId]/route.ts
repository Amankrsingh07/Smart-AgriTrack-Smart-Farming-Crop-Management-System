import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  const user = await getUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const { id, photoId } = await params;
  const grant = await db.cropProtectionExpertGrant.findUnique({
    where: { userId: user.id },
  });
  const authorized =
    grant &&
    ["AGRICULTURE_EXPERT", "SOIL_TESTING_EXPERT", "ADMINISTRATOR"].includes(
      grant.role,
    );
  const photo = await db.cropProtectionPhoto.findFirst({
    where: {
      id: photoId,
      assessmentId: id,
      assessment: {
        OR: [
          { userId: user.id },
          ...(authorized
            ? [
                grant.role === "ADMINISTRATOR"
                  ? {}
                  : { assignedExpertId: user.id },
              ]
            : []),
        ],
      },
    },
  });
  if (!photo) return new NextResponse(null, { status: 404 });
  return new NextResponse(photo.bytes, {
    headers: {
      "Content-Type": photo.mediaType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
