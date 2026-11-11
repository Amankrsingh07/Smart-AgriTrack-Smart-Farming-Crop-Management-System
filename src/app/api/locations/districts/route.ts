import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const stateId = request.nextUrl.searchParams.get("stateId")?.trim();
  if (!stateId || stateId.length > 191) {
    return NextResponse.json({ success: false, error: "A valid stateId query parameter is required." }, { status: 400 });
  }

  try {
    const state = await db.state.findFirst({
      where: { OR: [{ id: stateId }, { lgdCode: stateId }], isActive: true },
      select: { id: true },
    });
    if (!state) return NextResponse.json({ success: false, error: "State was not found." }, { status: 404 });
    const districts = await db.district.findMany({
      where: { stateId: state.id, isActive: true },
      orderBy: [{ name: "asc" }],
      select: { id: true, lgdCode: true, name: true, stateId: true, latitude: true, longitude: true },
    });
    return NextResponse.json({ success: true, data: districts });
  } catch {
    return NextResponse.json({ success: false, error: "Locations are temporarily unavailable." }, { status: 500 });
  }
}
