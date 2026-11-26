import { NextResponse } from "next/server";
import { z } from "zod";
import { generateCalendarForCycle } from "@/lib/crop-calendar-service";
import { getUser } from "@/lib/session";

const schema = z.object({
  cropCycleId: z.string().min(1).max(191),
  cropVariety: z.string().trim().max(120).optional(),
  sowingDate: z.string().date().optional(),
});

export async function POST(request: Request) {
  const user = await getUser();
  if (!user)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Send valid JSON form data." },
      { status: 400 },
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Check the crop cycle, sowing date and field details." },
      { status: 400 },
    );
  try {
    const result = await generateCalendarForCycle(user.id, parsed.data);
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (cause) {
    return NextResponse.json(
      {
        error:
          cause instanceof Error
            ? cause.message
            : "Could not generate the crop calendar.",
      },
      { status: 400 },
    );
  }
}
