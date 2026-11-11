import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const states = await db.state.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }],
      select: { id: true, lgdCode: true, name: true, isUnionTerritory: true },
    });
    return NextResponse.json({ success: true, data: states });
  } catch {
    return NextResponse.json({ success: false, error: "Locations are temporarily unavailable." }, { status: 500 });
  }
}
